import { useEffect, useMemo, useState, type ReactNode } from "react";
import { loadDetail, loadTimeline } from "../lib/archive";
import { useClient } from "../lib/client";
import { useStatic, type StaticData } from "../lib/ddragon";
import { championSplash, clock, lcu, queueName, timeAgo } from "../lib/lcu";
import type { GameDetail, Match, Timeline } from "../lib/types";
import { Art, Breathing, ChampIcon, CloseButton, Icon, Modal, Tabs, cx, dec, int, kda, kilo } from "../ui";
import { momentsOf, toPlayers, type GamePlayer, type Moment } from "./game";
import { Replay } from "./Replay";

type Tab = "board" | "replay" | "moments";
const MULTI: Record<number, string> = { 2: "Double kill", 3: "Triple kill", 4: "Quadra kill", 5: "Penta kill" };

/** Bandeau d'une partie : splash du champion, résultat en grand, chiffres clés. Partagé avec l'écran de fin de partie. */
export function GameHero({ championId, eyebrow, result, side, children }: { championId: number; eyebrow: ReactNode; result: "win" | "loss" | "remake"; side?: ReactNode; children?: ReactNode }) {
  return (
    <header className={cx("ghero", result)}>
      <span className="cover">{championId > 0 && <Breathing full src={championSplash(championId)} champ={championId} />}</span>
      <span className="eyebrow">{eyebrow}</span>
      <div className="ghero-title">
        <h1 className="display">{result === "remake" ? "Remake" : result === "win" ? "Victoire" : "Défaite"}</h1>
        {side}
      </div>
      <div className="ghero-stats">{children}</div>
    </header>
  );
}

/** Les chiffres du joueur dans le bandeau. */
export function HeroStats({ k, d, a, teamKills, cs, damage, vision, minutes }: { k: number; d: number; a: number; teamKills?: number; cs?: number; damage?: number; vision?: number; minutes: number }) {
  return (
    <>
      <span className="stat">
        <span className="label">KDA</span>
        <b>
          {k} / <span className="down">{d}</span> / {a}
        </b>
        <small>{kda(k, d, a)}</small>
      </span>
      {teamKills !== undefined && (
        <span className="stat">
          <span className="label">Participation</span>
          <b>{teamKills ? Math.round(((k + a) / teamKills) * 100) : 0} %</b>
          <small>
            {k + a}/{teamKills} kills
          </small>
        </span>
      )}
      {cs !== undefined && (
        <span className="stat">
          <span className="label">CS</span>
          <b>{cs}</b>
          <small>{dec(cs / minutes)}/min</small>
        </span>
      )}
      {damage !== undefined && (
        <span className="stat">
          <span className="label">Dégâts</span>
          <b>{kilo(damage)}</b>
          <small>{int(damage / minutes)}/min</small>
        </span>
      )}
      {vision !== undefined && (
        <span className="stat">
          <span className="label">Vision</span>
          <b>{vision}</b>
          <small>{dec(vision / minutes)}/min</small>
        </span>
      )}
    </>
  );
}

/** Fiche plein écran d'une ancienne partie : tableau, replay sur la carte, moments forts. */
export function MatchDetail({ match, myPuuid, onClose }: { match: Match; myPuuid?: string; onClose: () => void }) {
  const champions = useClient((s) => s.champions);
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [failed, setFailed] = useState(false);
  const assets = useStatic();

  useEffect(() => {
    let alive = true;
    // D'abord le client Riot, sinon l'archive locale (parties classées plus anciennes).
    lcu<GameDetail>("GET", `/lol-match-history/v1/games/${match.gameId}`)
      .then((d) => (d?.participants?.length ? d : Promise.reject()))
      .catch(() => loadDetail(match.gameId))
      .then((d) => alive && (d ? setDetail(d) : setFailed(true)))
      .catch(() => alive && setFailed(true));
    lcu<Timeline>("GET", `/lol-match-history/v1/game-timelines/${match.gameId}`)
      .then((t) => (t?.frames?.length ? t : Promise.reject()))
      .catch(() => loadTimeline(match.gameId))
      .then((t) => alive && setTimeline(t?.frames?.length ? t : null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [match.gameId]);

  const fallback = match.participants[0];
  const players = useMemo(() => (detail ? toPlayers(detail, myPuuid, fallback?.championId, champions) : []), [detail, myPuuid, fallback, champions]);
  const me = players.find((p) => p.me);
  const myTeam = me?.teamId ?? 100;
  const duration = detail?.gameDuration ?? match.gameDuration;
  const minutes = Math.max(duration / 60, 1);
  const championId = me?.championId ?? fallback?.championId ?? 0;
  const won = me ? !!detail?.participants.find((p) => p.participantId === me.id)?.stats.win : !!fallback?.stats.win;
  const teamKills = players.filter((p) => p.teamId === myTeam).reduce((s, p) => s + p.k, 0);

  return (
    <Modal label="Détail de la partie" onClose={onClose} size="xl" className="game">
      <CloseButton onClose={onClose} className="modal-x" />
      <GameHero
        championId={championId}
        result={duration < 300 ? "remake" : won ? "win" : "loss"}
        eyebrow={`${queueName(match.queueId)} · ${clock(duration)} · ${timeAgo(match.gameCreation)} · ${champions.get(championId)?.name ?? "Champion"}`}
        side={me && MULTI[me.multi] ? <span className="tag gold">{MULTI[me.multi]}</span> : null}
      >
        <HeroStats k={me?.k ?? fallback?.stats.kills ?? 0} d={me?.d ?? fallback?.stats.deaths ?? 0} a={me?.a ?? fallback?.stats.assists ?? 0} teamKills={me ? teamKills : undefined} cs={me?.cs} damage={me?.damage} vision={me?.vision} minutes={minutes} />
      </GameHero>
      {detail ? <GameTabs detail={detail} timeline={timeline} players={players} myTeam={myTeam} duration={duration} assets={assets} /> : <p className="wait">{failed ? "Le client Riot n'a pas renvoyé le détail de cette partie." : "Chargement de la partie…"}</p>}
    </Modal>
  );
}

/** Onglets Tableau, Replay et Moments forts, partagés par la fiche de partie et l'écran de fin de partie. */
export function GameTabs({ detail, timeline, players, myTeam, duration, assets, onReport }: { detail: GameDetail; timeline: Timeline | null; players: GamePlayer[]; myTeam: number; duration: number; assets: StaticData | null; onReport?: (p: GamePlayer) => void }) {
  const [tab, setTab] = useState<Tab>("board");
  const [jumpTo, setJumpTo] = useState<number | null>(null);
  const minutes = Math.max(duration / 60, 1);
  const tabs: [Tab, string][] = [["board", "Tableau"]];
  if (timeline) tabs.push(["replay", "Replay"], ["moments", "Moments forts"]);
  return (
    <>
      {tabs.length > 1 && <Tabs value={tab} options={tabs} onChange={setTab} />}
      <div className="game-body">
        {tab === "board" || !timeline ? (
          <Scoreboard detail={detail} players={players} myTeam={myTeam} assets={assets} minutes={minutes} onReport={onReport} />
        ) : tab === "replay" ? (
          <Replay timeline={timeline} players={players} duration={duration} assets={assets} start={jumpTo} />
        ) : (
          <Moments
            timeline={timeline}
            players={players}
            myTeam={myTeam}
            onJump={(t) => {
              setJumpTo(Math.max(0, t - 8));
              setTab("replay");
            }}
          />
        )}
      </div>
    </>
  );
}

/* ---------- Tableau ---------- */

const OBJECTIVES: [keyof GameDetail["teams"][number], string][] = [
  ["hordeKills", "Larves"],
  ["riftHeraldKills", "Héraut"],
  ["dragonKills", "Drakes"],
  ["baronKills", "Nashor"],
  ["towerKills", "Tours"],
  ["inhibitorKills", "Inhibs"],
];

function Scoreboard({ detail, players, myTeam, assets, minutes, onReport }: { detail: GameDetail; players: GamePlayer[]; myTeam: number; assets: StaticData | null; minutes: number; onReport?: (p: GamePlayer) => void }) {
  const teams = [...detail.teams].sort((x, y) => Number(y.teamId === myTeam) - Number(x.teamId === myTeam));
  const maxDamage = Math.max(...players.map((p) => p.damage), 1);
  const sum = (teamId: number, f: (p: GamePlayer) => number) => players.filter((p) => p.teamId === teamId).reduce((s, p) => s + f(p), 0);
  const [mine, theirs] = teams;

  const balance = (label: string, f: (p: GamePlayer) => number, fmt: (v: number) => string) => {
    const x = sum(mine.teamId, f);
    const y = sum(theirs.teamId, f);
    return (
      <div className="balance" aria-label={`${label} : ${fmt(x)} contre ${fmt(y)}`}>
        <b>{fmt(x)}</b>
        <span className="label">{label}</span>
        <b>{fmt(y)}</b>
        <i>
          <i style={{ flexGrow: x || 1 }} />
          <i style={{ flexGrow: y || 1 }} />
        </i>
      </div>
    );
  };

  return (
    <>
      {mine && theirs && (
        <div className="balances">
          {balance("Kills", (p) => p.k, String)}
          {balance("Or", (p) => p.gold, kilo)}
          {balance("Dégâts", (p) => p.damage, kilo)}
        </div>
      )}
      {teams.map((team) => {
        const kills = sum(team.teamId, (q) => q.k);
        return (
          <section key={team.teamId} className={cx("board-team card", team.win === "Win" ? "won" : "lost", team.teamId === myTeam && "ally")}>
            <div className="board-team-head">
              <h3 className="h2">{team.teamId === myTeam ? "Ton équipe" : "Équipe adverse"}</h3>
              <span className={team.win === "Win" ? "up" : "down"}>{team.win === "Win" ? "Victoire" : "Défaite"}</span>
              <span className="dim">côté {team.teamId === 100 ? "bleu" : "rouge"}</span>
              <ul>
                {OBJECTIVES.map(([key, label]) => (
                  <li key={key}>
                    {label} <b>{Number(team[key] ?? 0)}</b>
                  </li>
                ))}
              </ul>
              {!!team.bans?.length && (
                <div className="board-bans" title="Bannissements">
                  {team.bans.map((b, i) => (
                    <ChampIcon key={i} id={b.championId} />
                  ))}
                </div>
              )}
            </div>
            <div className="table score" style={{ "--cols": `minmax(210px, 2.2fr) 1fr 1.1fr 0.6fr 0.7fr 0.7fr 232px${onReport ? " 28px" : ""}` } as React.CSSProperties}>
              <div className="tr th">
                <span>Joueur</span>
                <span>KDA</span>
                <span>Dégâts</span>
                <span>Or</span>
                <span>CS</span>
                <span>Vision</span>
                <span>Objets</span>
                {onReport && <span />}
              </div>
              {players
                .filter((p) => p.teamId === team.teamId)
                .map((p) => (
                  <div key={p.id} className={cx("tr", p.me && "me")}>
                    <span className="score-who">
                      <span className="score-champ">
                        <ChampIcon id={p.championId} />
                        <i>{p.level}</i>
                      </span>
                      <span className="score-loadout">
                        <Slot asset={assets?.spells.get(p.spells[0])} />
                        <Slot asset={assets?.runes.get(p.keystone)} round />
                        <Slot asset={assets?.spells.get(p.spells[1])} />
                        <Slot asset={assets?.runes.get(p.subStyle)} round />
                      </span>
                      <span className="two">
                        <b title={p.name}>{p.name}</b>
                        <small>{p.champion}</small>
                      </span>
                    </span>
                    <span className="two">
                      <b>
                        {p.k} / <span className="down">{p.d}</span> / {p.a}
                      </b>
                      <small>
                        {kda(p.k, p.d, p.a)} · {kills ? Math.round(((p.k + p.a) / kills) * 100) : 0} %
                      </small>
                    </span>
                    <span className="two">
                      <b>{int(p.damage)}</b>
                      <i className="bar">
                        <i style={{ width: `${(p.damage / maxDamage) * 100}%` }} />
                      </i>
                    </span>
                    <span>
                      <b>{kilo(p.gold)}</b>
                    </span>
                    <span className="two">
                      <b>{p.cs}</b>
                      <small>{dec(p.cs / minutes)}/min</small>
                    </span>
                    <span className="two" title="Balises posées / détruites / pinks achetées">
                      <b>{p.vision}</b>
                      <small>
                        {p.wards}/{p.wardsKilled}/{p.pinks}
                      </small>
                    </span>
                    <span className="score-items">
                      {p.items.map((id, i) => (
                        <Slot key={i} asset={id ? assets?.items.get(id) : undefined} />
                      ))}
                      <Slot asset={p.trinket ? assets?.items.get(p.trinket) : undefined} round />
                    </span>
                    {onReport && (p.me ? <span /> : <ReportFlag name={p.name} onClick={() => onReport(p)} />)}
                  </div>
                ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

/** Petit drapeau en bout de ligne, en fin de partie : ouvre le signalement de ce joueur. */
export function ReportFlag({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button className="flag" onClick={onClick} title={`Signaler ${name}`} aria-label={`Signaler ${name}`}>
      <Icon name="flag" size={15} />
    </button>
  );
}

function Slot({ asset, round }: { asset?: { name: string; icon: string }; round?: boolean }) {
  if (!asset) return <i className={cx("slot-ico", round && "round")} />;
  return (
    <span className={cx("slot-ico", round && "round")} title={asset.name}>
      <Art src={asset.icon} alt={asset.name} />
    </span>
  );
}

/* ---------- Moments forts ---------- */

const DRAKES: Record<string, string> = {
  FIRE_DRAGON: "Drake infernal",
  WATER_DRAGON: "Drake des océans",
  EARTH_DRAGON: "Drake des montagnes",
  AIR_DRAGON: "Drake des nuages",
  HEXTECH_DRAGON: "Drake hextech",
  CHEMTECH_DRAGON: "Drake chemtech",
  ELDER_DRAGON: "Drake ancestral",
};
const MONSTERS: Record<string, string> = { BARON_NASHOR: "Baron Nashor", RIFTHERALD: "Héraut de la Faille", HORDE: "Larve du Néant", ATAKHAN: "Atakhan" };
const LANES: Record<string, string> = { TOP_LANE: "du haut", MID_LANE: "du milieu", BOT_LANE: "du bas" };

type Filter = "all" | "me" | "kills" | "objectives";
const FILTERS: [Filter, string][] = [
  ["all", "Tout"],
  ["me", "Mes actions"],
  ["kills", "Kills"],
  ["objectives", "Objectifs"],
];
const passes = (m: Moment, f: Filter) => f === "all" || (f === "me" ? m.mine : f === "kills" ? m.kind === "kill" : m.kind !== "kill");

function Moments({ timeline, players, myTeam, onJump }: { timeline: Timeline; players: GamePlayer[]; myTeam: number; onJump: (t: number) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const all = useMemo(() => momentsOf(timeline, players), [timeline, players]);
  const shown = all.filter((m) => passes(m, filter));

  const label = (m: Moment) => {
    const e = m.event;
    if (m.kind === "kill") {
      const killer = byId.get(e.killerId ?? 0);
      const victim = byId.get(e.victimId ?? 0)!;
      const helpers = (e.assistingParticipantIds ?? []).map((id) => byId.get(id)).filter(Boolean) as GamePlayer[];
      return (
        <>
          <span className="moment-kill">
            {killer ? <ChampIcon id={killer.championId} /> : <i className="slot-ico" />}
            <Icon name="close" size={12} />
            <ChampIcon id={victim.championId} />
          </span>
          <span className="two">
            <b>
              {killer ? (killer.me ? "Tu" : killer.champion) : "La tourelle"} {killer?.me ? "as tué" : "a tué"} {victim.me ? "toi" : victim.champion}
            </b>
            {helpers.length > 0 && <small>avec {helpers.map((h) => (h.me ? "toi" : h.champion)).join(", ")}</small>}
          </span>
        </>
      );
    }
    const name =
      m.kind === "objective"
        ? e.monsterType === "DRAGON"
          ? DRAKES[e.monsterSubType ?? ""] ?? "Drake"
          : MONSTERS[e.monsterType ?? ""] ?? "Monstre épique"
        : `${e.buildingType === "INHIBITOR_BUILDING" ? "Inhibiteur" : "Tourelle"} ${LANES[e.laneType ?? ""] ?? ""}`.trim();
    return (
      <>
        <span className={cx("moment-obj", m.kind)} aria-hidden="true" />
        <span className="two">
          <b>{name}</b>
          <small>
            {m.team === myTeam ? "pour ton équipe" : "pour l'équipe adverse"}
            {m.mine ? " · c'est toi" : ""}
          </small>
        </span>
      </>
    );
  };

  return (
    <div className="moments">
      <GoldChart timeline={timeline} players={players} myTeam={myTeam} />
      <div className="chips">
        {FILTERS.map(([value, text]) => (
          <button key={value} className="chip" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {text}
            <span>{all.filter((m) => passes(m, value)).length}</span>
          </button>
        ))}
      </div>
      <ol className="feed">
        {shown.map((m, i) => (
          <li key={i}>
            <button className={cx("moment", m.team === myTeam ? "ally" : "enemy", m.mine && "mine")} onClick={() => onJump(m.t)} title="Voir sur la carte">
              <time className="mono">{clock(m.t)}</time>
              {label(m)}
              <span className="moment-see">Voir sur la carte</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="wait">Rien à afficher pour ce filtre.</li>}
      </ol>
    </div>
  );
}

/** Courbe de l'avance en or de ton équipe, minute par minute. */
function GoldChart({ timeline, players, myTeam }: { timeline: Timeline; players: GamePlayer[]; myTeam: number }) {
  const teamOf = new Map(players.map((p) => [p.id, p.teamId]));
  const points = timeline.frames.map((f) => {
    let diff = 0;
    for (const pf of Object.values(f.participantFrames ?? {})) diff += (teamOf.get(pf.participantId) === myTeam ? 1 : -1) * (pf.totalGold ?? 0);
    return { t: f.timestamp / 1000, diff };
  });
  if (points.length < 2) return null;
  const W = 1000;
  const H = 160;
  const maxT = points[points.length - 1].t || 1;
  const maxAbs = Math.max(1000, ...points.map((p) => Math.abs(p.diff)));
  const x = (t: number) => (t / maxT) * W;
  const y = (v: number) => H / 2 - (v / maxAbs) * (H / 2 - 8);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.diff).toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H / 2} L0 ${H / 2} Z`;
  const best = points.reduce((m, p) => (p.diff > m.diff ? p : m), points[0]);
  const worst = points.reduce((m, p) => (p.diff < m.diff ? p : m), points[0]);
  const last = points[points.length - 1];

  return (
    <section className="gold card card-pad">
      <div className="card-head">
        Avance en or
        <span>
          {best.diff > 0 && (
            <>
              Meilleure avance <b className="up">+{kilo(best.diff)}</b> à {clock(best.t)} ·{" "}
            </>
          )}
          {worst.diff < 0 && (
            <>
              plus gros retard <b className="down">{kilo(worst.diff)}</b> à {clock(worst.t)} ·{" "}
            </>
          )}
          fin{" "}
          <b className={last.diff >= 0 ? "up" : "down"}>
            {last.diff >= 0 ? "+" : ""}
            {kilo(last.diff)}
          </b>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Avance en or de ton équipe au fil de la partie">
        <defs>
          <clipPath id="gold-up">
            <rect width={W} height={H / 2} />
          </clipPath>
          <clipPath id="gold-down">
            <rect y={H / 2} width={W} height={H / 2} />
          </clipPath>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={W * f} x2={W * f} y1={0} y2={H} className="gold-grid" />
        ))}
        <path d={area} clipPath="url(#gold-up)" className="gold-area up" />
        <path d={area} clipPath="url(#gold-down)" className="gold-area down" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="gold-zero" />
        <path d={line} className="gold-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="gold-axis mono">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f}>{clock(maxT * f)}</span>
        ))}
      </div>
    </section>
  );
}
