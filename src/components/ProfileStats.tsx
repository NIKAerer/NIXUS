import { useEffect, useMemo, useState } from "react";
import { ChampIcon } from "./ui";
import { lcu, queueName } from "../lib/lcu";
import type { ChampionSummary, GameDetail, Match } from "../lib/types";

/** Une partie vue de ton côté, avec ce qu'il faut pour les stats. */
interface Line {
  gameId: number;
  queueId: number;
  championId: number;
  win: boolean;
  remake: boolean;
  minutes: number;
  k: number;
  d: number;
  a: number;
  kp: number | null;
  cs: number | null;
  damage: number | null;
  gold: number | null;
  vision: number | null;
  role: string | null;
}

type Filter = "all" | "ranked" | "normal" | "aram" | "arena" | "other";
const FILTERS: [Filter, string][] = [
  ["all", "Tout"],
  ["ranked", "Classé"],
  ["normal", "Normal"],
  ["aram", "ARAM"],
  ["arena", "Arena"],
  ["other", "Autres"],
];
const kindOf = (q: number): Filter =>
  q === 420 || q === 440 ? "ranked" : [400, 430, 480, 490].includes(q) ? "normal" : q === 450 || q === 2400 ? "aram" : q === 1700 || q === 1710 ? "arena" : "other";

const ROLES: [string, string][] = [
  ["TOP", "Top"],
  ["JUNGLE", "Jungle"],
  ["MIDDLE", "Mid"],
  ["BOTTOM", "ADC"],
  ["UTILITY", "Support"],
];

const n = (v: unknown) => Number(v ?? 0);
const pct = (v: number) => `${Math.round(v * 100)} %`;
const dec = (v: number, digits = 1) => v.toFixed(digits).replace(".", ",");
const ratio = (k: number, d: number, a: number) => (d === 0 ? "Parfait" : dec((k + a) / d, 2));

// Détails déjà chargés pendant la session : on ne les redemande pas au client.
const details = new Map<number, GameDetail | null>();

function lineOf(m: Match, d: GameDetail | null | undefined, puuid?: string): Line {
  const base = m.participants[0];
  const minutes = Math.max(m.gameDuration / 60, 1);
  const line: Line = {
    gameId: m.gameId,
    queueId: m.queueId,
    championId: base?.championId ?? 0,
    win: !!base?.stats.win,
    remake: m.gameDuration < 300,
    minutes,
    k: n(base?.stats.kills),
    d: n(base?.stats.deaths),
    a: n(base?.stats.assists),
    kp: null,
    cs: null,
    damage: null,
    gold: null,
    vision: null,
    role: null,
  };
  if (!d) return line;
  const id = d.participantIdentities.find((i) => puuid && i.player.puuid === puuid)?.participantId ?? d.participants.find((p) => p.championId === line.championId)?.participantId;
  const p = d.participants.find((x) => x.participantId === id);
  if (!p) return line;
  const teamKills = d.participants.filter((x) => x.teamId === p.teamId).reduce((t, x) => t + n(x.stats.kills), 0);
  const lane = p.timeline?.lane;
  const role = p.timeline?.role;
  return {
    ...line,
    kp: teamKills ? (line.k + line.a) / teamKills : 0,
    cs: n(p.stats.totalMinionsKilled) + n(p.stats.neutralMinionsKilled),
    damage: n(p.stats.totalDamageDealtToChampions),
    gold: n(p.stats.goldEarned),
    vision: n(p.stats.visionScore),
    role: m.queueId === 450 || kindOf(m.queueId) === "arena" ? null : lane === "BOTTOM" || lane === "BOT" ? (role === "DUO_SUPPORT" || role === "SUPPORT" ? "UTILITY" : "BOTTOM") : lane === "MID" ? "MIDDLE" : lane && lane !== "NONE" ? lane : null,
  };
}

/** Statistiques de tes dernières parties, façon Challenger : bilan, forme, par champion, par rôle et par mode. */
export function ProfileStats({ history, champions, puuid }: { history: Match[]; champions: Map<number, ChampionSummary>; puuid?: string }) {
  const [, setLoaded] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");

  // Charge le détail de chaque partie (objets, CS, dégâts, rôle), 4 à la fois.
  useEffect(() => {
    let alive = true;
    const todo = history.filter((m) => !details.has(m.gameId));
    let i = 0;
    const worker = async () => {
      while (alive && i < todo.length) {
        const m = todo[i++];
        const d = await lcu<GameDetail>("GET", `/lol-match-history/v1/games/${m.gameId}`).catch(() => null);
        details.set(m.gameId, d?.participants?.length ? d : null);
        if (alive) setLoaded((x) => x + 1);
      }
    };
    Promise.all([worker(), worker(), worker(), worker()]);
    return () => {
      alive = false;
    };
  }, [history]);

  const lines = history.map((m) => lineOf(m, details.get(m.gameId), puuid));
  const kinds = new Set(lines.map((l) => kindOf(l.queueId)));
  const games = lines.filter((l) => !l.remake && (filter === "all" || kindOf(l.queueId) === filter));
  const pending = history.filter((m) => !details.has(m.gameId)).length;

  const sum = useMemo(() => {
    const full = games.filter((g) => g.cs !== null);
    const minutes = full.reduce((t, g) => t + g.minutes, 0) || 1;
    const add = (f: (g: Line) => number, list = games) => list.reduce((t, g) => t + f(g), 0);
    return {
      n: games.length,
      wins: games.filter((g) => g.win).length,
      k: add((g) => g.k),
      d: add((g) => g.d),
      a: add((g) => g.a),
      kp: full.length ? add((g) => g.kp ?? 0, full) / full.length : null,
      cs: full.length ? add((g) => g.cs ?? 0, full) / minutes : null,
      dmg: full.length ? add((g) => g.damage ?? 0, full) / minutes : null,
      gold: full.length ? add((g) => g.gold ?? 0, full) / minutes : null,
      vision: full.length ? add((g) => g.vision ?? 0, full) / minutes : null,
    };
  }, [games]);

  const byChampion = useMemo(() => {
    const map = new Map<number, Line[]>();
    games.forEach((g) => map.set(g.championId, [...(map.get(g.championId) ?? []), g]));
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || b[1].filter((g) => g.win).length - a[1].filter((g) => g.win).length).slice(0, 8);
  }, [games]);

  const byMode = useMemo(() => {
    const map = new Map<number, Line[]>();
    games.forEach((g) => map.set(g.queueId, [...(map.get(g.queueId) ?? []), g]));
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [games]);

  const roleGames = games.filter((g) => g.role);
  const maxRole = Math.max(1, ...ROLES.map(([r]) => roleGames.filter((g) => g.role === r).length));

  if (!history.length) return null;
  const wr = sum.n ? sum.wins / sum.n : 0;

  return (
    <section className="row pst">
      <h2>
        Statistiques <span>sur tes {history.length} dernières parties{pending ? ` · analyse en cours (${history.length - pending}/${history.length})` : ""}</span>
      </h2>

      <div className="pst-filters" role="tablist" aria-label="Filtrer par mode">
        {FILTERS.filter(([f]) => f === "all" || kinds.has(f)).map(([f, label]) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>

      {sum.n === 0 ? (
        <div className="empty">Aucune partie dans ce mode.</div>
      ) : (
        <>
          <div className="pst-summary">
            <div className="pst-block">
              <div className="pst-ring" style={{ ["--ratio" as string]: wr }}>
                <span>{pct(wr)}</span>
              </div>
              <div>
                <span className="label">
                  {sum.n} partie{sum.n > 1 ? "s" : ""}
                </span>
                <b>
                  {sum.wins}V {sum.n - sum.wins}D
                </b>
                <span className="pst-form" aria-label="Forme récente">
                  {games.slice(0, 10).map((g) => (
                    <i key={g.gameId} className={g.win ? "w" : "l"} />
                  ))}
                </span>
              </div>
            </div>
            <div className="pst-block">
              <div>
                <span className="label">KDA moyen</span>
                <b>{ratio(sum.k, sum.d, sum.a)}</b>
                <small>
                  {dec(sum.k / sum.n)} / {dec(sum.d / sum.n)} / {dec(sum.a / sum.n)}
                  {sum.kp !== null ? ` · ${pct(sum.kp)} KP` : ""}
                </small>
              </div>
            </div>
            <Metric label="CS / min" value={sum.cs} />
            <Metric label="Dégâts / min" value={sum.dmg} digits={0} />
            <Metric label="Or / min" value={sum.gold} digits={0} />
            <Metric label="Vision / min" value={sum.vision} digits={2} />
          </div>

          <div className="pst-grid">
            <div className="pst-card">
              <h3>Par champion</h3>
              <div className="pst-table" role="table">
                <div className="pst-tr pst-th" role="row">
                  <span>Champion</span>
                  <span>Parties</span>
                  <span>Victoires</span>
                  <span>KDA</span>
                  <span>CS/min</span>
                </div>
                {byChampion.map(([id, list]) => {
                  const w = list.filter((g) => g.win).length / list.length;
                  const k = list.reduce((t, g) => t + g.k, 0);
                  const d = list.reduce((t, g) => t + g.d, 0);
                  const a = list.reduce((t, g) => t + g.a, 0);
                  const full = list.filter((g) => g.cs !== null);
                  const cs = full.length ? full.reduce((t, g) => t + (g.cs ?? 0), 0) / full.reduce((t, g) => t + g.minutes, 0) : null;
                  return (
                    <div key={id} className="pst-tr" role="row">
                      <span className="pst-champ">
                        <ChampIcon id={id} />
                        <b>{champions.get(id)?.name ?? "Champion"}</b>
                      </span>
                      <span>{list.length}</span>
                      <span className={w >= 0.5 ? "good" : "bad"}>
                        <i className="pst-bar">
                          <i style={{ width: `${w * 100}%` }} />
                        </i>
                        {pct(w)}
                      </span>
                      <span>{ratio(k, d, a)}</span>
                      <span>{cs === null ? "–" : dec(cs)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pst-side">
              {roleGames.length > 0 && (
                <div className="pst-card">
                  <h3>Par rôle</h3>
                  <div className="pst-roles">
                    {ROLES.map(([r, label]) => {
                      const list = roleGames.filter((g) => g.role === r);
                      const w = list.length ? list.filter((g) => g.win).length / list.length : 0;
                      return (
                        <div key={r} className={`pst-role ${list.length ? "" : "off"}`}>
                          <span className="pst-role-bar">
                            <i style={{ height: `${(list.length / maxRole) * 100}%` }} />
                          </span>
                          <b>{label}</b>
                          <small>{list.length ? `${list.length} · ${pct(w)}` : "–"}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="pst-card">
                <h3>Par mode</h3>
                <ul className="pst-modes">
                  {byMode.map(([q, list]) => {
                    const w = list.filter((g) => g.win).length / list.length;
                    return (
                      <li key={q}>
                        <span>{queueName(q)}</span>
                        <small>
                          {list.length} partie{list.length > 1 ? "s" : ""}
                        </small>
                        <b className={w >= 0.5 ? "good" : "bad"}>{pct(w)}</b>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, digits = 1 }: { label: string; value: number | null; digits?: number }) {
  return (
    <div className="pst-block">
      <div>
        <span className="label">{label}</span>
        <b>{value === null ? "…" : digits === 0 ? Math.round(value).toLocaleString("fr-FR") : dec(value, digits)}</b>
      </div>
    </div>
  );
}
