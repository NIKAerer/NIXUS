import { useEffect, useMemo, useState } from "react";
import { useClient } from "../lib/client";
import { lcu, queueName } from "../lib/lcu";
import type { GameDetail, Match } from "../lib/types";
import { ChampIcon, Empty, Kpi, WinBar, cx, dec, int, kda, pct, plural } from "../ui";

/** Une partie vue de ton côté, avec ce qu'il faut pour les statistiques. */
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
const winRate = (list: Line[]) => list.filter((g) => g.win).length / Math.max(1, list.length);

// Détails déjà chargés pendant la session : on ne les redemande pas au client.
const details = new Map<number, GameDetail | null>();

function lineOf(m: Match, d: GameDetail | null | undefined, puuid?: string): Line {
  const base = m.participants[0];
  const line: Line = {
    gameId: m.gameId,
    queueId: m.queueId,
    championId: base?.championId ?? 0,
    win: !!base?.stats.win,
    remake: m.gameDuration < 300,
    minutes: Math.max(m.gameDuration / 60, 1),
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
  const noRole = m.queueId === 450 || kindOf(m.queueId) === "arena";
  return {
    ...line,
    kp: teamKills ? (line.k + line.a) / teamKills : 0,
    cs: n(p.stats.totalMinionsKilled) + n(p.stats.neutralMinionsKilled),
    damage: n(p.stats.totalDamageDealtToChampions),
    gold: n(p.stats.goldEarned),
    vision: n(p.stats.visionScore),
    role: noRole ? null : lane === "BOTTOM" || lane === "BOT" ? (role === "DUO_SUPPORT" || role === "SUPPORT" ? "UTILITY" : "BOTTOM") : lane === "MID" ? "MIDDLE" : lane && lane !== "NONE" ? lane : null,
  };
}

/** Statistiques de tes dernières parties : bilan, forme, par champion, par rôle et par mode. */
export function ProfileStats() {
  const history = useClient((s) => s.history);
  const champions = useClient((s) => s.champions);
  const puuid = useClient((s) => s.summoner?.puuid);
  const [, setLoaded] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");

  // Charge le détail de chaque partie (CS, dégâts, rôle), 4 à la fois.
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

  const pending = history.filter((m) => !details.has(m.gameId)).length;
  const lines = useMemo(() => history.map((m) => lineOf(m, details.get(m.gameId), puuid)), [history, puuid, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const kinds = new Set(lines.map((l) => kindOf(l.queueId)));
  const games = useMemo(() => lines.filter((l) => !l.remake && (filter === "all" || kindOf(l.queueId) === filter)), [lines, filter]);

  const sum = useMemo(() => {
    const full = games.filter((g) => g.cs !== null);
    const minutes = full.reduce((t, g) => t + g.minutes, 0) || 1;
    const add = (f: (g: Line) => number, list = games) => list.reduce((t, g) => t + f(g), 0);
    const per = (f: (g: Line) => number) => (full.length ? add(f, full) / minutes : null);
    return {
      n: games.length,
      wins: games.filter((g) => g.win).length,
      k: add((g) => g.k),
      d: add((g) => g.d),
      a: add((g) => g.a),
      kp: full.length ? add((g) => g.kp ?? 0, full) / full.length : null,
      cs: per((g) => g.cs ?? 0),
      dmg: per((g) => g.damage ?? 0),
      gold: per((g) => g.gold ?? 0),
      vision: per((g) => g.vision ?? 0),
    };
  }, [games]);

  const groupBy = (key: (g: Line) => number) => {
    const map = new Map<number, Line[]>();
    for (const g of games) map.set(key(g), [...(map.get(key(g)) ?? []), g]);
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || winRate(b[1]) - winRate(a[1]));
  };
  const byChampion = useMemo(() => groupBy((g) => g.championId).slice(0, 8), [games]); // eslint-disable-line react-hooks/exhaustive-deps
  const byMode = useMemo(() => groupBy((g) => g.queueId), [games]); // eslint-disable-line react-hooks/exhaustive-deps
  const roleGames = games.filter((g) => g.role);
  const maxRole = Math.max(1, ...ROLES.map(([r]) => roleGames.filter((g) => g.role === r).length));

  if (!history.length) return null;
  const wr = sum.n ? sum.wins / sum.n : 0;
  const metric = (v: number | null, digits = 1) => (v === null ? "…" : digits === 0 ? int(v) : dec(v, digits));

  return (
    <section className="pstats">
      <h2 className="sec-head">
        Statistiques
        <span>
          sur tes {history.length} dernières parties{pending ? ` · analyse en cours (${history.length - pending}/${history.length})` : ""}
        </span>
        <span className="chips" role="group" aria-label="Filtrer par mode">
          {FILTERS.filter(([f]) => f === "all" || kinds.has(f)).map(([f, label]) => (
            <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </span>
      </h2>

      {sum.n === 0 ? (
        <Empty title="Aucune partie dans ce mode" />
      ) : (
        <>
          <div className="kpis">
            <div className="kpi kpi-ring">
              <span className="ring" style={{ ["--ratio" as string]: wr }}>
                <b>{pct(wr)}</b>
              </span>
              <span>
                <span className="label">{plural(sum.n, "partie")}</span>
                <b>
                  <span className="up">{sum.wins} V</span> · <span className="down">{sum.n - sum.wins} D</span>
                </b>
                <span className="form" aria-label="Forme récente">
                  {games.slice(0, 10).map((g) => (
                    <i key={g.gameId} className={g.win ? "w" : "l"} />
                  ))}
                </span>
              </span>
            </div>
            <Kpi label="KDA moyen" value={kda(sum.k, sum.d, sum.a)} sub={`${dec(sum.k / sum.n)} / ${dec(sum.d / sum.n)} / ${dec(sum.a / sum.n)}${sum.kp !== null ? ` · ${pct(sum.kp)} KP` : ""}`} />
            <Kpi label="CS / min" value={metric(sum.cs)} />
            <Kpi label="Dégâts / min" value={metric(sum.dmg, 0)} />
            <Kpi label="Or / min" value={metric(sum.gold, 0)} />
            <Kpi label="Vision / min" value={metric(sum.vision, 2)} />
          </div>

          <div className="duo">
            <section className="card card-pad">
              <h3>Par champion</h3>
              <div className="table" role="table" style={{ ["--cols" as string]: "minmax(0, 1.6fr) 0.6fr 1.1fr 0.7fr 0.7fr" }}>
                <div className="tr th" role="row">
                  <span>Champion</span>
                  <span>Parties</span>
                  <span>Victoires</span>
                  <span>KDA</span>
                  <span>CS/min</span>
                </div>
                {byChampion.map(([id, list]) => {
                  const w = winRate(list);
                  const t = (f: (g: Line) => number) => list.reduce((s, g) => s + f(g), 0);
                  const full = list.filter((g) => g.cs !== null);
                  const cs = full.length ? full.reduce((s, g) => s + (g.cs ?? 0), 0) / full.reduce((s, g) => s + g.minutes, 0) : null;
                  return (
                    <div key={id} className="tr" role="row">
                      <span className="cell-champ">
                        <ChampIcon id={id} />
                        <b>{champions.get(id)?.name ?? "Champion"}</b>
                      </span>
                      <span className="mono">{list.length}</span>
                      <span className={cx("cell-wr mono", w >= 0.5 ? "good" : "bad")}>
                        <WinBar ratio={w} />
                        {pct(w)}
                      </span>
                      <span className="mono">{kda(t((g) => g.k), t((g) => g.d), t((g) => g.a))}</span>
                      <span className="mono">{cs === null ? "–" : dec(cs)}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="stack">
              {roleGames.length > 0 && (
                <section className="card card-pad">
                  <h3>Par rôle</h3>
                  <div className="roles">
                    {ROLES.map(([r, label]) => {
                      const list = roleGames.filter((g) => g.role === r);
                      return (
                        <div key={r} className={cx("roles-col", !list.length && "off")}>
                          <span className="roles-bar">
                            <i style={{ height: `${(list.length / maxRole) * 100}%` }} />
                          </span>
                          <b>{label}</b>
                          <small>{list.length ? `${list.length} · ${pct(winRate(list))}` : "–"}</small>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
              <section className="card card-pad">
                <h3>Par mode</h3>
                <ul className="rows">
                  {byMode.map(([q, list]) => {
                    const w = winRate(list);
                    return (
                      <li key={q}>
                        <span className="two">
                          <b>{queueName(q)}</b>
                          <small>{plural(list.length, "partie")}</small>
                        </span>
                        <b className={cx("mono", w >= 0.5 ? "good" : "bad")}>{pct(w)}</b>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
