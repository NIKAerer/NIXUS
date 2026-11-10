import { ReportDialog } from "../components/ReportDialog";
import { Breathing } from "../components/Breathing";
import { useEffect, useMemo, useState } from "react";
import { ChampIcon } from "../components/ui";
import { GameTabs, kilo, ReportFlag, toPlayers, type GamePlayer } from "../components/MatchDetail";
import { championSplash, clock, lcu, rankLabel } from "../lib/lcu";
import { useStatic } from "../lib/ddragon";
import type { ChampionSummary, EndOfGame as Eog, EogPlayer, GameDetail, RankedQueue, RankedStats, Timeline } from "../lib/types";

interface Props {
  eog: Eog;
  champions: Map<number, ChampionSummary>;
  ranked: RankedStats | null;
  rankBefore: RankedStats | null;
  myPuuid?: string;
  onPlayAgain: () => void;
  onClose: () => void;
}

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

/** Écran de fin de partie : bannière, LP, puis le même tableau complet que les anciennes parties. */
export function EndOfGame({ eog, champions, ranked, rankBefore, myPuuid, onPlayAgain, onClose }: Props) {
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const assets = useStatic();

  // Le détail arrive dans l'historique quelques secondes après la partie : on réessaie un moment.
  useEffect(() => {
    let alive = true;
    let tries = 0;
    let timer = 0;
    const load = async () => {
      const d = await lcu<GameDetail>("GET", `/lol-match-history/v1/games/${eog.gameId}`).catch(() => null);
      if (!alive) return;
      if (d?.participants?.length) {
        setDetail(d);
        const t = await lcu<Timeline>("GET", `/lol-match-history/v1/game-timelines/${eog.gameId}`).catch(() => null);
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
  }, [eog.gameId]);

  const me = eog.localPlayer;
  // Signalement : ouvert depuis le drapeau en bout de ligne de chaque joueur.
  const [reporting, setReporting] = useState<EogPlayer | null>(null);
  const allEog = eog.teams.flatMap((t) => t.players);
  const reportGame = (p: GamePlayer) =>
    setReporting(
      allEog.find((e) => p.puuid && e.puuid === p.puuid) ??
        allEog.find((e) => e.championId === p.championId) ?? { championId: p.championId, puuid: p.puuid, riotIdGameName: p.name, stats: {} },
    );
  const players = useMemo(() => (detail ? toPlayers(detail, myPuuid, me.championId, champions) : []), [detail, myPuuid, me.championId, champions]);
  const mine = eog.teams.find((t) => t.isPlayerTeam);
  const won = !!mine?.isWinningTeam;
  const minutes = Math.max(eog.gameLength / 60, 1);
  const k = st(me, "CHAMPIONS_KILLED");
  const d = st(me, "NUM_DEATHS");
  const a = st(me, "ASSISTS");
  const cs = st(me, "MINIONS_KILLED") + st(me, "NEUTRAL_MINIONS_KILLED");
  const teamKills = mine?.players.reduce((s, p) => s + st(p, "CHAMPIONS_KILLED"), 0) ?? 0;
  const myTeam = players.find((p) => p.me)?.teamId ?? 100;
  const lp = lpChange(eog.queueType, rankBefore, ranked);

  return (
    <div className="eog">
      <header className="gd-banner eog-banner">
        <Breathing full src={championSplash(me.championId)} champ={me.championId} />
        <div className="gd-shade" />
        <div className="gd-head">
          <div className="eyebrow">
            Fin de partie · {clock(eog.gameLength)} · {champions.get(me.championId)?.name ?? ""}
          </div>
          <div className="eog-titlebar">
            <h1 className="title" style={{ color: won ? "var(--win)" : "var(--loss)" }}>
              {won ? "VICTOIRE" : "DÉFAITE"}
            </h1>
            {lp && (
              <div className={`eog-lp ${lp.pending ? "wait" : (lp.delta ?? 0) >= 0 && !lp.demoted ? "up" : "down"}`}>
                {lp.pending ? (
                  <span>LP en cours de calcul…</span>
                ) : lp.placed ? (
                  <>
                    <b>Classé</b>
                    <span>{rankLabel(lp.after.tier, lp.after.division)}</span>
                  </>
                ) : lp.promoted || lp.demoted ? (
                  <>
                    <b>{lp.promoted ? "Promotion !" : "Rétrogradation"}</b>
                    <span>
                      {rankLabel(lp.after.tier, lp.after.division)} · {lp.after.leaguePoints} LP
                    </span>
                  </>
                ) : (
                  <>
                    <b>
                      {(lp.delta ?? 0) > 0 ? "+" : ""}
                      {lp.delta} LP
                    </b>
                    <span>
                      {rankLabel(lp.after.tier, lp.after.division)} · {lp.after.leaguePoints} LP
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="gd-chips">
            <div>
              <span className="label">KDA</span>
              <b>
                {k}/<em>{d}</em>/{a}
              </b>
              <small>{d === 0 ? "Parfait" : ((k + a) / d).toFixed(2).replace(".", ",")}</small>
            </div>
            <div>
              <span className="label">Participation</span>
              <b>{teamKills ? Math.round(((k + a) / teamKills) * 100) : 0} %</b>
              <small>
                {k + a}/{teamKills} kills
              </small>
            </div>
            <div>
              <span className="label">CS</span>
              <b>{cs}</b>
              <small>{(cs / minutes).toFixed(1).replace(".", ",")}/min</small>
            </div>
            <div>
              <span className="label">Dégâts</span>
              <b>{kilo(st(me, "TOTAL_DAMAGE_DEALT_TO_CHAMPIONS"))}</b>
              <small>{Math.round(st(me, "TOTAL_DAMAGE_DEALT_TO_CHAMPIONS") / minutes).toLocaleString("fr-FR")}/min</small>
            </div>
            <div>
              <span className="label">Vision</span>
              <b>{st(me, "VISION_SCORE")}</b>
              <small>{(st(me, "VISION_SCORE") / minutes).toFixed(1).replace(".", ",")}/min</small>
            </div>
            <div className="btns eog-btns">
              <button className="btn btn-primary" onClick={onPlayAgain}>
                Rejouer
              </button>
              <button className="btn btn-ghost" onClick={onClose}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      </header>

      {reporting && <ReportDialog eog={eog} champions={champions} target={reporting} onClose={() => setReporting(null)} />}
      {detail ? (
        <GameTabs detail={detail} timeline={timeline} players={players} myTeam={myTeam} duration={eog.gameLength} assets={assets} onReport={reportGame} />
      ) : (
        <div className="gd-body">
          {!gaveUp && <p className="gd-wait eog-wait">Récupération du tableau complet (objets, runes, replay)…</p>}
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
        <section key={i} className={`gd-team ${team.isWinningTeam ? "won" : ""}`}>
          <div className="gd-team-head">
            <h3>
              {team.isPlayerTeam ? "Ton équipe" : "Équipe adverse"}
              <span>{team.isWinningTeam ? "Victoire" : "Défaite"}</span>
            </h3>
          </div>
          <div className="score" role="table">
            <div className="score-row score-head" role="row">
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
                <div key={j} className={`score-row ${p.isLocalPlayer ? "me-row" : ""}`} role="row">
                  <span className="who">
                    <ChampIcon id={p.championId} />
                    <b>{p.riotIdGameName ?? p.summonerName}</b>
                  </span>
                  <span>
                    {st(p, "CHAMPIONS_KILLED")} / {st(p, "NUM_DEATHS")} / {st(p, "ASSISTS")}
                  </span>
                  <span>{st(p, "MINIONS_KILLED") + st(p, "NEUTRAL_MINIONS_KILLED")}</span>
                  <span>{kilo(st(p, "GOLD_EARNED"))}</span>
                  <span className="dmg">
                    <i style={{ width: `${(dmg / maxDmg) * 100}%` }} />
                    {dmg.toLocaleString("fr-FR")}
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
