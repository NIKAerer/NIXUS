import { useEffect, useMemo, useState } from "react";
import { toPlayers, type GamePlayer } from "../features/game";
import { GameHero, GameTabs, HeroStats, ReportFlag } from "../features/MatchDetail";
import { ReportDialog } from "../features/ReportDialog";
import { actions, useClient } from "../lib/client";
import { useStatic } from "../lib/ddragon";
import { clock, lcu, rankLabel } from "../lib/lcu";
import type { EndOfGame as Eog, EogPlayer, GameDetail, RankedQueue, RankedStats, Timeline } from "../lib/types";
import { ChampIcon, cx, int, kilo } from "../ui";

const st = (p: EogPlayer, k: string) => p.stats[k] ?? 0;
const QUEUE_KEYS: Record<string, string> = { RANKED_SOLO_5x5: "RANKED_SOLO_5x5", RANKED_FLEX_SR: "RANKED_FLEX_SR", RANKED_SOLO_DUO: "RANKED_SOLO_5x5", RANKED_FLEX: "RANKED_FLEX_SR" };
const TIER_ORDER = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const DIV_ORDER = ["IV", "III", "II", "I"];
const score = (q: RankedQueue) => TIER_ORDER.indexOf(q.tier) * 1000 + Math.max(DIV_ORDER.indexOf(q.division), 0) * 100 + q.leaguePoints;

/** LP gagnés ou perdus, en comparant les rangs du début de la sélection à ceux d'après la partie. */
function lpChange(queueType: string | undefined, before: RankedStats | null, after: RankedStats | null) {
  const key = queueType ? QUEUE_KEYS[queueType] : undefined;
  const a = key ? before?.queueMap[key] : undefined;
  const b = key ? after?.queueMap[key] : undefined;
  if (!a || !b || !b.tier) return null;
  if (a.wins + a.losses === b.wins + b.losses && a.leaguePoints === b.leaguePoints && a.tier === b.tier && a.division === b.division) return { pending: true as const };
  const sameDivision = a.tier === b.tier && a.division === b.division;
  return {
    pending: false as const,
    delta: sameDivision ? b.leaguePoints - a.leaguePoints : null,
    promoted: !sameDivision && a.tier !== "" && score(b) > score(a),
    demoted: !sameDivision && a.tier !== "" && score(b) < score(a),
    placed: !a.tier,
    after: b,
  };
}

/** Écran de fin de partie : résultat, LP, puis le même tableau complet que les anciennes parties. */
export function EndOfGame() {
  const eog = useClient((s) => s.endOfGame);
  const champions = useClient((s) => s.champions);
  const ranked = useClient((s) => s.ranked);
  const rankBefore = useClient((s) => s.rankBefore);
  const myPuuid = useClient((s) => s.summoner?.puuid);
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [reporting, setReporting] = useState<EogPlayer | null>(null);
  const assets = useStatic();
  const gameId = eog?.gameId;

  // Le détail arrive dans l'historique quelques secondes après la partie : on réessaie un moment.
  useEffect(() => {
    if (!gameId) return;
    let alive = true;
    let tries = 0;
    let timer = 0;
    const load = async () => {
      const d = await lcu<GameDetail>("GET", `/lol-match-history/v1/games/${gameId}`).catch(() => null);
      if (!alive) return;
      if (d?.participants?.length) {
        setDetail(d);
        const t = await lcu<Timeline>("GET", `/lol-match-history/v1/game-timelines/${gameId}`).catch(() => null);
        if (alive && t?.frames?.length) setTimeline(t);
        return;
      }
      if (++tries < 20) timer = window.setTimeout(load, 4000);
      else setGaveUp(true);
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [gameId]);

  const me = eog?.localPlayer;
  const players = useMemo(() => (detail && me ? toPlayers(detail, myPuuid, me.championId, champions) : []), [detail, myPuuid, me, champions]);
  if (!eog || !me) return null;

  const allEog = eog.teams.flatMap((t) => t.players);
  // Signalement : ouvert depuis le drapeau en bout de ligne de chaque joueur.
  const reportGame = (p: GamePlayer) => setReporting(allEog.find((e) => p.puuid && e.puuid === p.puuid) ?? allEog.find((e) => e.championId === p.championId) ?? { championId: p.championId, puuid: p.puuid, riotIdGameName: p.name, stats: {} });
  const mine = eog.teams.find((t) => t.isPlayerTeam);
  const won = !!mine?.isWinningTeam;
  const minutes = Math.max(eog.gameLength / 60, 1);
  const teamKills = mine?.players.reduce((s, p) => s + st(p, "CHAMPIONS_KILLED"), 0) ?? 0;
  const myTeam = players.find((p) => p.me)?.teamId ?? 100;
  const lp = lpChange(eog.queueType, rankBefore, ranked);

  return (
    <div className="eog">
      <GameHero
        championId={me.championId}
        result={won ? "win" : "loss"}
        eyebrow={`Fin de partie · ${clock(eog.gameLength)} · ${champions.get(me.championId)?.name ?? ""}`}
        side={
          lp && (
            <div className={cx("lp-card", lp.pending ? "wait" : (lp.delta ?? 0) >= 0 && !lp.demoted ? "up" : "down")}>
              {lp.pending ? (
                <span>LP en cours de calcul…</span>
              ) : lp.placed ? (
                <>
                  <b>Classé</b>
                  <span>{rankLabel(lp.after.tier, lp.after.division)}</span>
                </>
              ) : (
                <>
                  <b>{lp.promoted ? "Promotion !" : lp.demoted ? "Rétrogradation" : `${(lp.delta ?? 0) > 0 ? "+" : ""}${lp.delta} LP`}</b>
                  <span>
                    {rankLabel(lp.after.tier, lp.after.division)} · {lp.after.leaguePoints} LP
                  </span>
                </>
              )}
            </div>
          )
        }
      >
        <HeroStats
          k={st(me, "CHAMPIONS_KILLED")}
          d={st(me, "NUM_DEATHS")}
          a={st(me, "ASSISTS")}
          teamKills={teamKills}
          cs={st(me, "MINIONS_KILLED") + st(me, "NEUTRAL_MINIONS_KILLED")}
          damage={st(me, "TOTAL_DAMAGE_DEALT_TO_CHAMPIONS")}
          vision={st(me, "VISION_SCORE")}
          minutes={minutes}
        />
        <span className="ghero-btns">
          <button className="btn btn-red btn-l" onClick={actions.playAgain}>
            Rejouer
          </button>
          <button className="btn btn-quiet btn-l" onClick={actions.closeEndOfGame}>
            Fermer
          </button>
        </span>
      </GameHero>

      {reporting && <ReportDialog eog={eog} target={reporting} onClose={() => setReporting(null)} />}
      {detail ? (
        <GameTabs detail={detail} timeline={timeline} players={players} myTeam={myTeam} duration={eog.gameLength} assets={assets} onReport={reportGame} />
      ) : (
        <div className="game-body">
          {!gaveUp && <p className="note">Récupération du tableau complet (objets, runes, replay)…</p>}
          <QuickBoard eog={eog} onReport={setReporting} />
        </div>
      )}
    </div>
  );
}

/** Tableau simple, affiché tant que le détail complet n'est pas encore disponible. */
function QuickBoard({ eog, onReport }: { eog: Eog; onReport: (p: EogPlayer) => void }) {
  const maxDmg = Math.max(...eog.teams.flatMap((t) => t.players.map((p) => st(p, "TOTAL_DAMAGE_DEALT_TO_CHAMPIONS"))), 1);
  const sorted = [...eog.teams].sort((a, b) => Number(b.isPlayerTeam) - Number(a.isPlayerTeam));
  return (
    <>
      {sorted.map((team, i) => (
        <section key={i} className={cx("board-team card", team.isWinningTeam ? "won" : "lost", team.isPlayerTeam && "ally")}>
          <div className="board-team-head">
            <h3 className="h2">{team.isPlayerTeam ? "Ton équipe" : "Équipe adverse"}</h3>
            <span className={team.isWinningTeam ? "up" : "down"}>{team.isWinningTeam ? "Victoire" : "Défaite"}</span>
          </div>
          <div className="table score" style={{ "--cols": "minmax(200px, 2fr) 1fr 0.6fr 0.7fr 1.6fr 28px" } as React.CSSProperties}>
            <div className="tr th">
              <span>Joueur</span>
              <span>K / D / A</span>
              <span>CS</span>
              <span>Or</span>
              <span>Dégâts aux champions</span>
              <span />
            </div>
            {team.players.map((p, j) => {
              const dmg = st(p, "TOTAL_DAMAGE_DEALT_TO_CHAMPIONS");
              return (
                <div key={j} className={cx("tr", p.isLocalPlayer && "me")}>
                  <span className="cell-champ">
                    <ChampIcon id={p.championId} />
                    <b>{p.riotIdGameName ?? p.summonerName}</b>
                  </span>
                  <span>
                    {st(p, "CHAMPIONS_KILLED")} / {st(p, "NUM_DEATHS")} / {st(p, "ASSISTS")}
                  </span>
                  <span>{st(p, "MINIONS_KILLED") + st(p, "NEUTRAL_MINIONS_KILLED")}</span>
                  <span>{kilo(st(p, "GOLD_EARNED"))}</span>
                  <span className="two">
                    <b>{int(dmg)}</b>
                    <i className="bar">
                      <i style={{ width: `${(dmg / maxDmg) * 100}%` }} />
                    </i>
                  </span>
                  {p.isLocalPlayer || p.botPlayer ? <span /> : <ReportFlag name={p.riotIdGameName ?? p.summonerName ?? "ce joueur"} onClick={() => onReport(p)} />}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
