import { Breathing } from "./Breathing";
import { useEffect, useMemo, useState } from "react";
import { Art, ChampIcon } from "./ui";
import { Replay } from "./Replay";
import { championSplash, clock, lcu, queueName, timeAgo } from "../lib/lcu";
import { useStatic, type StaticData } from "../lib/ddragon";
import { loadDetail, loadTimeline } from "../lib/archive";
import type { ChampionSummary, GameDetail, GameParticipant, Match, Timeline, TimelineEvent } from "../lib/types";

/** Un joueur de la partie, avec tout ce que les écrans de détail affichent. */
export interface GamePlayer {
  id: number;
  teamId: number;
  championId: number;
  champion: string;
  name: string;
  puuid?: string;
  me: boolean;
  k: number;
  d: number;
  a: number;
  level: number;
  gold: number;
  damage: number;
  taken: number;
  cs: number;
  vision: number;
  wards: number;
  wardsKilled: number;
  pinks: number;
  items: number[];
  trinket: number;
  spells: [number, number];
  keystone: number;
  subStyle: number;
  multi: number;
}

type Tab = "board" | "replay" | "moments";

const n = (p: GameParticipant, key: string) => Number(p.stats[key] ?? 0);
export const kilo = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")} k` : String(Math.round(v)));
const ratio = (k: number, d: number, a: number) => (d === 0 ? "Parfait" : ((k + a) / d).toFixed(2).replace(".", ","));
const MULTI: Record<number, string> = { 2: "Double kill", 3: "Triple kill", 4: "Quadra kill", 5: "Penta kill" };

interface Props {
  match: Match;
  myPuuid?: string;
  champions: Map<number, ChampionSummary>;
  onClose: () => void;
}

/** Fiche plein écran d'une ancienne partie : tableau, replay sur la carte, moments forts. */
export function MatchDetail({ match, myPuuid, champions, onClose }: Props) {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fallback = match.participants[0];
  const players = useMemo(() => (detail ? toPlayers(detail, myPuuid, fallback?.championId, champions) : []), [detail, myPuuid, fallback, champions]);
  const me = players.find((p) => p.me);
  const myTeam = me?.teamId ?? 100;

  const duration = detail?.gameDuration ?? match.gameDuration;
  const minutes = Math.max(duration / 60, 1);
  const championId = me?.championId ?? fallback?.championId ?? 0;
  const won = me ? !!detail?.participants.find((p) => p.participantId === me.id)?.stats.win : !!fallback?.stats.win;
  const remake = duration < 300;
  const teamKills = players.filter((p) => p.teamId === myTeam).reduce((s, p) => s + p.k, 0);
  const k = me?.k ?? fallback?.stats.kills ?? 0;
  const d = me?.d ?? fallback?.stats.deaths ?? 0;
  const a = me?.a ?? fallback?.stats.assists ?? 0;

  return (
    <div className="overlay gd-overlay" onClick={onClose}>
      <div className="gd" role="dialog" aria-modal="true" aria-label="Détail de la partie" onClick={(e) => e.stopPropagation()}>
        <button className="gd-close" onClick={onClose} aria-label="Fermer">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <header className="gd-banner">
          <Breathing full src={championSplash(championId)} champ={championId} />
          <div className="gd-shade" />
          <div className="gd-head">
            <div className="eyebrow">
              {queueName(match.queueId)} · {clock(duration)} · {timeAgo(match.gameCreation)}
            </div>
            <h1 className="title" style={{ color: remake ? "var(--muted)" : won ? "var(--win)" : "var(--loss)" }}>
              {remake ? "REMAKE" : won ? "VICTOIRE" : "DÉFAITE"}
            </h1>
            <div className="gd-chips">
              <span className="gd-champ">{champions.get(championId)?.name ?? "Champion"}</span>
              <div>
                <span className="label">KDA</span>
                <b>
                  {k}/<em>{d}</em>/{a}
                </b>
                <small>{ratio(k, d, a)}</small>
              </div>
              {me && (
                <>
                  <div>
                    <span className="label">Participation</span>
                    <b>{teamKills ? Math.round(((me.k + me.a) / teamKills) * 100) : 0} %</b>
                    <small>
                      {me.k + me.a}/{teamKills} kills
                    </small>
                  </div>
                  <div>
                    <span className="label">CS</span>
                    <b>{me.cs}</b>
                    <small>{(me.cs / minutes).toFixed(1).replace(".", ",")}/min</small>
                  </div>
                  <div>
                    <span className="label">Dégâts</span>
                    <b>{kilo(me.damage)}</b>
                    <small>{Math.round(me.damage / minutes).toLocaleString("fr-FR")}/min</small>
                  </div>
                  <div>
                    <span className="label">Vision</span>
                    <b>{me.vision}</b>
                    <small>{(me.vision / minutes).toFixed(1).replace(".", ",")}/min</small>
                  </div>
                  {MULTI[me.multi] && <span className="gd-multi">{MULTI[me.multi]}</span>}
                </>
              )}
            </div>
          </div>
        </header>

        {detail ? (
          <GameTabs detail={detail} timeline={timeline} players={players} myTeam={myTeam} duration={duration} assets={assets} />
        ) : (
          <div className="gd-body">
            <p className="gd-wait">{failed ? "Le client Riot n'a pas renvoyé le détail de cette partie." : "Chargement de la partie…"}</p>
          </div>
        )}
      </div>
    </div>
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
      {tabs.length > 1 && (
        <nav className="gd-tabs" role="tablist">
          {tabs.map(([value, label]) => (
            <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>
              {label}
            </button>
          ))}
        </nav>
      )}
      <div className="gd-body">
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

export function toPlayers(detail: GameDetail, myPuuid: string | undefined, fallbackChampion: number | undefined, champions: Map<number, ChampionSummary>): GamePlayer[] {
  const identity = new Map(detail.participantIdentities.map((i) => [i.participantId, i.player]));
  const mine =
    detail.participantIdentities.find((i) => myPuuid && i.player.puuid === myPuuid)?.participantId ??
    detail.participants.find((p) => p.championId === fallbackChampion)?.participantId;
  return detail.participants.map((p) => {
    const who = identity.get(p.participantId);
    return {
      id: p.participantId,
      teamId: p.teamId,
      championId: p.championId,
      champion: champions.get(p.championId)?.name ?? "Champion",
      name: who?.gameName || who?.summonerName || `Joueur ${p.participantId}`,
      puuid: who?.puuid,
      me: p.participantId === mine,
      k: n(p, "kills"),
      d: n(p, "deaths"),
      a: n(p, "assists"),
      level: n(p, "champLevel"),
      gold: n(p, "goldEarned"),
      damage: n(p, "totalDamageDealtToChampions"),
      taken: n(p, "totalDamageTaken"),
      cs: n(p, "totalMinionsKilled") + n(p, "neutralMinionsKilled"),
      vision: n(p, "visionScore"),
      wards: n(p, "wardsPlaced"),
      wardsKilled: n(p, "wardsKilled"),
      pinks: n(p, "visionWardsBoughtInGame"),
      items: [0, 1, 2, 3, 4, 5].map((i) => n(p, `item${i}`)),
      trinket: n(p, "item6"),
      spells: [p.spell1Id, p.spell2Id],
      keystone: n(p, "perk0"),
      subStyle: n(p, "perkSubStyle"),
      multi: n(p, "largestMultiKill"),
    };
  });
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
      <div className="gd-balance">
        <b>{fmt(x)}</b>
        <div className="gd-track" aria-label={`${label} : ${fmt(x)} contre ${fmt(y)}`}>
          <i className="ally" style={{ flexGrow: x || 1 }} />
          <i className="enemy" style={{ flexGrow: y || 1 }} />
          <em>{label}</em>
        </div>
        <b>{fmt(y)}</b>
      </div>
    );
  };

  return (
    <>
      {mine && theirs && (
        <div className="gd-balances">
          {balance("Kills", (p) => p.k, String)}
          {balance("Or", (p) => p.gold, kilo)}
          {balance("Dégâts", (p) => p.damage, kilo)}
        </div>
      )}
      {teams.map((team) => {
        const ally = team.teamId === myTeam;
        return (
          <section key={team.teamId} className={`gd-team ${team.win === "Win" ? "won" : "lost"}`}>
            <div className="gd-team-head">
              <h3>
                {ally ? "Ton équipe" : "Équipe adverse"}
                <span>
                  {team.win === "Win" ? "Victoire" : "Défaite"} · côté {team.teamId === 100 ? "bleu" : "rouge"}
                </span>
              </h3>
              <ul className="gd-objectives">
                {OBJECTIVES.map(([key, label]) => (
                  <li key={key}>
                    {label} <b>{Number(team[key] ?? 0)}</b>
                  </li>
                ))}
              </ul>
              {!!team.bans?.length && (
                <div className="gd-bans" title="Bannissements">
                  {team.bans.map((b, i) => (
                    <ChampIcon key={i} id={b.championId} />
                  ))}
                </div>
              )}
            </div>
            <div className={`gd-grid ${onReport ? "reportable" : ""}`}>
              <div className="gd-row gd-row-head">
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
                .map((p) => {
                  const kills = sum(team.teamId, (q) => q.k);
                  return (
                    <div key={p.id} className={`gd-row ${p.me ? "me" : ""}`}>
                      <span className="gd-who">
                        <span className="gd-champ-ico">
                          <ChampIcon id={p.championId} />
                          <i>{p.level}</i>
                        </span>
                        <span className="gd-loadout">
                          <Icon asset={assets?.spells.get(p.spells[0])} />
                          <Icon asset={assets?.runes.get(p.keystone)} round />
                          <Icon asset={assets?.spells.get(p.spells[1])} />
                          <Icon asset={assets?.runes.get(p.subStyle)} round small />
                        </span>
                        <span className="gd-name">
                          <b title={p.name}>{p.name}</b>
                          <small>{p.champion}</small>
                        </span>
                      </span>
                      <span>
                        <b>
                          {p.k}/<em>{p.d}</em>/{p.a}
                        </b>
                        <small>
                          {ratio(p.k, p.d, p.a)} · {kills ? Math.round(((p.k + p.a) / kills) * 100) : 0} %
                        </small>
                      </span>
                      <span>
                        <b>{p.damage.toLocaleString("fr-FR")}</b>
                        <i className="gd-dmg">
                          <i style={{ width: `${(p.damage / maxDamage) * 100}%` }} />
                        </i>
                      </span>
                      <span>
                        <b>{kilo(p.gold)}</b>
                      </span>
                      <span>
                        <b>{p.cs}</b>
                        <small>{(p.cs / minutes).toFixed(1).replace(".", ",")}/min</small>
                      </span>
                      <span title="Balises posées / détruites / pinks achetées">
                        <b>{p.vision}</b>
                        <small>
                          {p.wards}/{p.wardsKilled}/{p.pinks}
                        </small>
                      </span>
                      <span className="gd-items">
                        {p.items.map((id, i) => (
                          <Icon key={i} asset={id ? assets?.items.get(id) : undefined} />
                        ))}
                        <Icon asset={p.trinket ? assets?.items.get(p.trinket) : undefined} round />
                      </span>
                      {onReport && (p.me ? <span /> : <ReportFlag name={p.name} onClick={() => onReport(p)} />)}
                    </div>
                  );
                })}
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
    <button className="gd-report" onClick={onClick} title={`Signaler ${name}`} aria-label={`Signaler ${name}`}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 18V3m0 1h9l-2 3.5L14 11H5" />
      </svg>
    </button>
  );
}

function Icon({ asset, round, small }: { asset?: { name: string; icon: string }; round?: boolean; small?: boolean }) {
  const cls = ["gd-ico", round ? "round" : "", small ? "small" : ""].filter(Boolean).join(" ");
  if (!asset) return <i className={cls} />;
  return (
    <span className={cls} title={asset.name}>
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

interface Moment {
  t: number;
  kind: "kill" | "objective" | "building";
  team: number; // équipe qui marque
  event: TimelineEvent;
  mine: boolean;
}

export function momentsOf(timeline: Timeline, players: GamePlayer[]): Moment[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const meId = players.find((p) => p.me)?.id;
  const out: Moment[] = [];
  for (const e of timeline.frames.flatMap((f) => f.events ?? [])) {
    const t = e.timestamp / 1000;
    const killerTeam = byId.get(e.killerId ?? 0)?.teamId;
    if (e.type === "CHAMPION_KILL") {
      const victim = byId.get(e.victimId ?? 0);
      if (!victim) continue;
      const mine = e.killerId === meId || e.victimId === meId || !!(meId && e.assistingParticipantIds?.includes(meId));
      out.push({ t, kind: "kill", team: killerTeam ?? (victim.teamId === 100 ? 200 : 100), event: e, mine });
    } else if (e.type === "ELITE_MONSTER_KILL") {
      out.push({ t, kind: "objective", team: killerTeam ?? e.teamId ?? 0, event: e, mine: e.killerId === meId });
    } else if (e.type === "BUILDING_KILL") {
      // teamId désigne l'équipe qui possédait le bâtiment.
      out.push({ t, kind: "building", team: e.teamId === 100 ? 200 : 100, event: e, mine: e.killerId === meId || !!(meId && e.assistingParticipantIds?.includes(meId)) });
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

function Moments({ timeline, players, myTeam, onJump }: { timeline: Timeline; players: GamePlayer[]; myTeam: number; onJump: (t: number) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const all = useMemo(() => momentsOf(timeline, players), [timeline, players]);
  const shown = all.filter((m) => filter === "all" || (filter === "me" ? m.mine : filter === "kills" ? m.kind === "kill" : m.kind !== "kill"));

  const label = (m: Moment) => {
    const e = m.event;
    if (m.kind === "kill") {
      const killer = byId.get(e.killerId ?? 0);
      const victim = byId.get(e.victimId ?? 0)!;
      const helpers = (e.assistingParticipantIds ?? []).map((id) => byId.get(id)).filter(Boolean) as GamePlayer[];
      return (
        <>
          <span className="gd-kill">
            {killer ? <ChampIcon id={killer.championId} /> : <i className="gd-ico" />}
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <ChampIcon id={victim.championId} />
          </span>
          <span className="gd-moment-txt">
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
        <span className={`gd-obj ${m.kind}`} aria-hidden="true" />
        <span className="gd-moment-txt">
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
    <div className="gd-moments">
      <GoldChart timeline={timeline} players={players} myTeam={myTeam} />
      <div className="gd-filters">
        {FILTERS.map(([value, text]) => (
          <button key={value} className="chip" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {text}
            <span>{all.filter((m) => value === "all" || (value === "me" ? m.mine : value === "kills" ? m.kind === "kill" : m.kind !== "kill")).length}</span>
          </button>
        ))}
      </div>
      <ol className="gd-feed">
        {shown.map((m, i) => (
          <li key={i}>
            <button className={`gd-moment ${m.team === myTeam ? "ally" : "enemy"} ${m.mine ? "mine" : ""}`} onClick={() => onJump(m.t)} title="Voir sur la carte">
              <time>{clock(m.t)}</time>
              {label(m)}
              <span className="gd-see">Voir ›</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="gd-wait">Rien à afficher pour ce filtre.</li>}
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
    <section className="gd-gold">
      <div className="gd-gold-head">
        <h3>Avance en or</h3>
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
          fin <b className={last.diff >= 0 ? "up" : "down"}>{last.diff >= 0 ? "+" : ""}{kilo(last.diff)}</b>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Avance en or de ton équipe au fil de la partie">
        <defs>
          <clipPath id="gd-up">
            <rect width={W} height={H / 2} />
          </clipPath>
          <clipPath id="gd-down">
            <rect y={H / 2} width={W} height={H / 2} />
          </clipPath>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={W * f} x2={W * f} y1={0} y2={H} className="gd-grid-line" />
        ))}
        <path d={area} clipPath="url(#gd-up)" className="gd-area up" />
        <path d={area} clipPath="url(#gd-down)" className="gd-area down" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="gd-zero" />
        <path d={line} className="gd-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="gd-axis">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f}>{clock(maxT * f)}</span>
        ))}
      </div>
    </section>
  );
}
