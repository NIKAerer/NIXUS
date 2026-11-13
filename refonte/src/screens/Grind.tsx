import { useEffect, useMemo, useState, type ReactNode } from "react";
import { estimateLp, importRiot, loadLp, loadRecords, lpScore, riotError, seedDemo, syncArchive, type LpPoint, type RankedRecord } from "../lib/archive";
import { BadgeTag, useBadge } from "../lib/badges";
import { useClient } from "../lib/client";
import { championSplash, clock, isDesktop, rankLabel, timeAgo } from "../lib/lcu";
import { getSettings, setSettings, useSettings } from "../lib/settings";
import type { Match } from "../lib/types";
import { nav } from "../lib/view";
import { Breathing, ChampIcon, Empty, Icon, Kpi, Seg, Skeleton, WinBar, avg, cx, dec, int, kda, pct, plural, signed } from "../ui";

type Queue = "RANKED_SOLO_5x5" | "RANKED_FLEX_SR";
type Range = 7 | 30 | 0;
const QUEUE_ID: Record<Queue, number> = { RANKED_SOLO_5x5: 420, RANKED_FLEX_SR: 440 };
const QUEUES = [
  ["RANKED_SOLO_5x5", "Solo/Duo"],
  ["RANKED_FLEX_SR", "Flex"],
] as const;
const RANGES = [
  [7, "7 jours"],
  [30, "30 jours"],
  [0, "Tout"],
] as const;
const ROLES: [string, string][] = [
  ["TOP", "Top"],
  ["JUNGLE", "Jungle"],
  ["MIDDLE", "Mid"],
  ["BOTTOM", "ADC"],
  ["UTILITY", "Support"],
];
const DAY = 86400000;

/** Une session commence à 5 h du matin : une partie à 2 h compte pour la veille. */
const startOfSession = () => {
  const d = new Date();
  d.setHours(d.getHours() < 5 ? -19 : 5, 0, 0, 0);
  return d.getTime();
};
const dayKey = (t: number) => new Date(t).setHours(0, 0, 0, 0);
const round = (v: number | null) => (v === null ? "–" : String(Math.round(v)));
const gold = (v: number | null) => (v === null ? "–" : signed(v));
const winRate = (list: RankedRecord[]) => list.filter((g) => g.win).length / Math.max(1, list.length);

const asMatch = (r: RankedRecord): Match => ({
  gameId: r.gameId,
  gameCreation: r.createdAt,
  gameDuration: r.duration,
  queueId: r.queueId,
  participants: [{ championId: r.championId, stats: { kills: r.k, deaths: r.d, assists: r.a, win: r.win } }],
});

function group(list: RankedRecord[], key: (r: RankedRecord) => number) {
  const map = new Map<number, RankedRecord[]>();
  for (const r of list) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || winRate(b[1]) - winRate(a[1]));
}

/** Grind : tes parties classées sauvegardées sur ce PC, ta courbe de LP et ce qui te fait gagner. */
export function Grind() {
  const champions = useClient((s) => s.champions);
  const ranked = useClient((s) => s.ranked);
  const summoner = useClient((s) => s.summoner);
  const cfg = useSettings();
  const [records, setRecords] = useState<RankedRecord[] | null>(null);
  const [lp, setLp] = useState<LpPoint[]>([]);
  const [queue, setQueue] = useState<Queue>("RANKED_SOLO_5x5");
  const [range, setRange] = useState<Range>(30);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  const name = (id: number | null) => (id ? champions.get(id)?.name ?? "Champion" : "?");

  const refresh = async () => {
    setSyncing(true);
    await seedDemo().catch(() => {});
    setRecords(await syncArchive(summoner?.puuid).catch(() => loadRecords().catch(() => [])));
    setLp(await loadLp().catch(() => []));
    setSyncing(false);
  };
  useEffect(() => {
    refresh();
  }, [summoner?.puuid]); // eslint-disable-line react-hooks/exhaustive-deps

  const runImport = async () => {
    const now = getSettings();
    if (!now.riotKey.trim()) {
      setImportNote("Ajoute d'abord ta clé API Riot dans les Paramètres.");
      return;
    }
    if (!summoner?.gameName || !summoner.tagLine) {
      setImportNote("Ton Riot ID n'est pas encore chargé. Réessaie dans un instant.");
      return;
    }
    const since = Date.parse(`${now.importSince || "2026-10-04"}T00:00:00`);
    setImporting(true);
    setImportNote("Recherche de tes SoloQ sur l'API Riot…");
    try {
      const r = await importRiot({
        gameName: summoner.gameName,
        tagLine: summoner.tagLine,
        key: now.riotKey,
        region: now.riotRegion || "europe",
        since,
        onProgress: (done, total) => setImportNote(`Import Riot : ${done}/${total} parties (environ ${Math.ceil(((total - done) * 2.5) / 60)} min restantes)`),
      });
      const parts = [`${plural(r.found, "SoloQ trouvée", "SoloQ trouvées")} depuis le ${new Date(since).toLocaleDateString("fr-FR")}`, r.imported ? plural(r.imported, "importée") : "rien de neuf à importer"];
      if (r.removed) parts.push(`${plural(r.removed, "ancienne fiche retirée", "anciennes fiches retirées")}`);
      if (r.failed) parts.push(`${r.failed} en échec (relance l'import pour réessayer)`);
      setImportNote(parts.join(", ") + ".");
    } catch (e) {
      setImportNote(`Import impossible : ${riotError(e)}`);
    } finally {
      setRecords(await loadRecords().catch(() => records ?? []));
      setImporting(false);
    }
  };

  const since = range ? Date.now() - range * DAY : 0;
  const inQueue = useMemo(() => (records ?? []).filter((r) => r.queueId === QUEUE_ID[queue] && !r.remake), [records, queue]);
  const games = useMemo(() => inQueue.filter((r) => r.createdAt >= since), [inQueue, since]);
  const importStart = Date.parse(`${cfg.importSince || "2026-10-04"}T00:00:00`);
  const startLp = cfg.lpStart.trim() === "" ? null : Number(cfg.lpStart);
  const points = useMemo(
    () => estimateLp(records ?? [], lp, QUEUE_ID[queue], queue, importStart, queue === "RANKED_SOLO_5x5" && Number.isFinite(startLp) ? startLp : null).filter((p) => p.t >= since),
    [records, lp, queue, since, importStart, startLp],
  );
  const current = ranked?.queueMap[queue];

  const session = startOfSession();
  const today = games.filter((g) => g.createdAt >= session);
  const todayWins = today.filter((g) => g.win).length;
  const todayLp = (() => {
    const all = lp.filter((p) => p.queue === queue);
    const before = [...all].reverse().find((p) => p.t < session);
    const last = all[all.length - 1];
    return before && last && last.t >= session ? lpScore(last) - lpScore(before) : null;
  })();
  const streak = (() => {
    if (!inQueue.length) return null;
    let n = 0;
    while (n < inQueue.length && inQueue[n].win === inQueue[0].win) n++;
    return { win: inQueue[0].win, n };
  })();

  const wins = games.filter((g) => g.win).length;
  const sum = (pick: (g: RankedRecord) => number) => games.reduce((s, g) => s + pick(g), 0);
  const minutes = sum((g) => g.duration / 60) || 1;
  const byChampion = useMemo(() => group(games, (g) => g.championId).slice(0, 10), [games]);
  const byOpponent = useMemo(() => group(games.filter((g) => g.opponentId), (g) => g.opponentId!).slice(0, 8), [games]);
  const roleMax = Math.max(1, ...ROLES.map(([r]) => games.filter((g) => g.role === r).length));
  const cover = byChampion[0]?.[0] ?? inQueue[0]?.championId ?? 64;
  const gd10 = avg(games.map((g) => g.gd10));
  const gd15 = avg(games.map((g) => g.gd15));

  return (
    <div className="page grind">
      <header className="banner">
        <div className="cover">
          <Breathing full src={championSplash(cover)} champ={cover} />
        </div>
        <div className="banner-main">
          <span className="eyebrow">Parties classées sauvegardées sur ce PC · {records?.length ?? "…"} au total</span>
          <h1 className="display">Grind</h1>
          <div className="banner-rank">
            <b>{rankLabel(current?.tier, current?.division)}</b>
            <span>{current?.tier ? `${current.leaguePoints} LP · ${current.wins} V · ${current.losses} D` : "Pas encore classé"}</span>
          </div>
        </div>
        <div className="banner-tools">
          <Seg value={queue} options={QUEUES} onChange={setQueue} label="File classée" />
          <Seg value={range} options={RANGES} onChange={setRange} label="Période" />
          {isDesktop && (
            <button className="btn btn-quiet btn-s" onClick={runImport} disabled={importing} title="Récupérer toutes tes SoloQ avec l'API Riot">
              {importing ? "Import…" : "Importer depuis Riot"}
            </button>
          )}
          <button className={cx("btn btn-quiet btn-s", syncing && "spinning")} onClick={refresh} disabled={syncing}>
            <Icon name="refresh" size={14} />
            {syncing ? "Sauvegarde…" : "Mettre à jour"}
          </button>
        </div>
      </header>

      {importNote && (
        <p className="warn" role="status">
          {importNote}
        </p>
      )}

      <div className="kpis">
        <Kpi label="Aujourd'hui" big sub={today.length ? plural(today.length, "partie") : "Pas encore joué"}>
          <span className="up">{todayWins} V</span> · <span className="down">{today.length - todayWins} D</span>
        </Kpi>
        <Kpi label="LP du jour" big value={todayLp === null ? "–" : `${signed(todayLp)} LP`} tone={todayLp} />
        <Kpi
          label="Série"
          big
          value={streak ? plural(streak.n, streak.win ? "victoire" : "défaite") : "–"}
          tone={streak ? (streak.win ? 1 : -1) : null}
          sub={streak && !streak.win && streak.n >= 3 ? <span className="gold">3 défaites d'affilée : une pause peut aider.</span> : undefined}
        />
        <Kpi label="Sur la période" big value={games.length ? pct(wins / games.length) : "–"} sub={`${wins} V · ${games.length - wins} D`} />
      </div>

      {records === null ? (
        <div className="grind-wait" aria-label="Lecture de tes parties sauvegardées">
          <Skeleton style={{ height: 260 }} />
          <Skeleton style={{ height: 84 }} />
        </div>
      ) : games.length === 0 ? (
        <Empty title="Rien sur cette période">NIXUS enregistre chaque partie classée dès qu'elle apparaît dans l'historique du client. Joue une partie classée, ou élargis la période à « Tout ».</Empty>
      ) : (
        <>
          <LpChart
            points={points}
            calib={
              queue === "RANKED_SOLO_5x5" && points.some((p) => p.est) ? (
                <label className="lp-calib" title="Tes LP au début de l'import : la courbe reconstituée est calée dessus">
                  LP au {new Date(importStart).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                  <input className="input" inputMode="numeric" placeholder="?" value={cfg.lpStart} onChange={(e) => setSettings({ lpStart: e.target.value.replace(/[^0-9-]/g, "") })} />
                </label>
              ) : null
            }
          />

          <div className="kpis">
            <Kpi label="KDA" value={kda(sum((g) => g.k), sum((g) => g.d), sum((g) => g.a))} sub={`${dec(sum((g) => g.k) / games.length)} / ${dec(sum((g) => g.d) / games.length)} / ${dec(sum((g) => g.a) / games.length)}`} />
            <Kpi label="KP" value={pct(avg(games.map((g) => g.kp)) ?? 0)} />
            <Kpi label="CS / min" value={dec(sum((g) => g.cs) / minutes)} />
            <Kpi label="CS à 10 min" value={round(avg(games.map((g) => g.cs10)))} />
            <Kpi label="Écart d'or à 10" value={gold(gd10)} tone={gd10} />
            <Kpi label="Écart d'or à 15" value={gold(gd15)} tone={gd15} />
            <Kpi label="Dégâts / min" value={int(sum((g) => g.damage) / minutes)} />
            <Kpi label="Vision / min" value={dec(sum((g) => g.vision) / minutes, 2)} />
          </div>

          <div className="duo">
            <section className="card card-pad">
              <h3>Tes champions</h3>
              <div className="table" role="table" style={{ ["--cols" as string]: "minmax(0, 1.6fr) 0.6fr 1.1fr 0.7fr 0.8fr 0.6fr" }}>
                <div className="tr th" role="row">
                  <span>Champion</span>
                  <span>Parties</span>
                  <span>Victoires</span>
                  <span>KDA</span>
                  <span>Or à 15</span>
                  <span>CS à 10</span>
                </div>
                {byChampion.map(([id, list]) => {
                  const w = winRate(list);
                  const g15 = avg(list.map((g) => g.gd15));
                  const total = (pick: (g: RankedRecord) => number) => list.reduce((s, g) => s + pick(g), 0);
                  return (
                    <div key={id} className="tr" role="row">
                      <span className="cell-champ">
                        <ChampIcon id={id} />
                        <b>{name(id)}</b>
                      </span>
                      <span className="mono">{list.length}</span>
                      <span className={cx("cell-wr mono", w >= 0.5 ? "good" : "bad")}>
                        <WinBar ratio={w} />
                        {pct(w)}
                      </span>
                      <span className="mono">{kda(total((g) => g.k), total((g) => g.d), total((g) => g.a))}</span>
                      <span className={cx("mono", g15 !== null && (g15 >= 0 ? "good" : "bad"))}>{gold(g15)}</span>
                      <span className="mono">{round(avg(list.map((g) => g.cs10)))}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="stack">
              <section className="card card-pad">
                <h3>Par rôle</h3>
                <div className="roles">
                  {ROLES.map(([r, label]) => {
                    const list = games.filter((g) => g.role === r);
                    return (
                      <div key={r} className={cx("roles-col", !list.length && "off")}>
                        <span className="roles-bar">
                          <i style={{ height: `${(list.length / roleMax) * 100}%` }} />
                        </span>
                        <b>{label}</b>
                        <small>{list.length ? `${list.length} · ${pct(winRate(list))}` : "–"}</small>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="card card-pad">
                <h3>Face à</h3>
                {byOpponent.length ? (
                  <ul className="rows">
                    {byOpponent.map(([id, list]) => {
                      const w = winRate(list);
                      return (
                        <li key={id}>
                          <span className="cell-champ">
                            <ChampIcon id={id} />
                            <span className="two">
                              <b>{name(id)}</b>
                              <small>
                                {plural(list.length, "partie")} · or à 15 {gold(avg(list.map((g) => g.gd15)))}
                              </small>
                            </span>
                          </span>
                          <b className={cx("mono", w >= 0.5 ? "good" : "bad")}>{pct(w)}</b>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="note">Pas encore d'adversaire direct identifié.</p>
                )}
              </section>
            </div>
          </div>

          <Journal games={games} points={points} name={name} puuid={summoner?.puuid} />
        </>
      )}
    </div>
  );
}

/** Journal des sessions : une ligne par jour avec le bilan, les LP du jour et chaque partie en vignette. */
function Journal({ games, points, name, puuid }: { games: RankedRecord[]; points: LpPoint[]; name: (id: number | null) => string; puuid?: string }) {
  const [shown, setShown] = useState(7);
  const days = useMemo(() => {
    const map = new Map<number, RankedRecord[]>();
    for (const g of games) map.set(dayKey(g.createdAt), [...(map.get(dayKey(g.createdAt)) ?? []), g]);
    const scoreAt = (t: number) => {
      const before = points.filter((p) => p.t <= t);
      return before.length ? lpScore(before[before.length - 1]) : null;
    };
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([day, list]) => {
        const end = scoreAt(day + DAY - 1);
        const start = scoreAt(day - 1);
        return {
          day,
          list: list.sort((a, b) => a.createdAt - b.createdAt),
          lp: end !== null && start !== null ? end - start : null,
          est: points.some((p) => p.est && p.t >= day && p.t < day + DAY),
        };
      });
  }, [games, points]);

  if (!days.length) return null;
  return (
    <section className="card card-pad">
      <h3>
        Journal des sessions <span>{plural(days.length, "jour")} de jeu sur la période</span>
      </h3>
      <div className="journal">
        {days.slice(0, shown).map(({ day, list, lp, est }) => {
          const w = list.filter((g) => g.win).length;
          const ratio = list.reduce((s, g) => s + g.k + g.a, 0) / Math.max(1, list.reduce((s, g) => s + g.d, 0));
          return (
            <section key={day} className="journal-day">
              <header>
                <b>{new Date(day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</b>
                <span className="mono">
                  <span className="up">{w} V</span> · <span className="down">{list.length - w} D</span>
                </span>
                <WinBar ratio={w / list.length} />
                <span className="dim mono">KDA {dec(ratio, 2)}</span>
                {lp !== null && (
                  <span className={cx("journal-lp mono", lp >= 0 ? "up" : "down")} title={est ? "Estimé à partir des victoires et défaites" : undefined}>
                    {signed(lp)} LP{est ? "*" : ""}
                  </span>
                )}
              </header>
              <div className="journal-games">
                {list.map((g) => (
                  <button key={g.gameId} className={cx("journal-game", g.win ? "win" : "loss")} onClick={() => nav.openMatch(asMatch(g))} title={`${name(g.championId)}${g.opponentId ? ` contre ${name(g.opponentId)}` : ""} · ${clock(g.duration)}`}>
                    <span className="cover">
                      <Breathing src={championSplash(g.championId)} champ={g.championId} />
                    </span>
                    <GameBadge gameId={g.gameId} puuid={puuid} />
                    <b>{name(g.championId)}</b>
                    <span className="mono">
                      {g.k}/<em>{g.d}</em>/{g.a}
                    </span>
                    {g.gd15 !== null && <small className={g.gd15 >= 0 ? "up" : "down"}>{signed(g.gd15)} or à 15′</small>}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {days.length > shown && (
          <button className="btn btn-quiet btn-s journal-more" onClick={() => setShown((n) => n + 7)}>
            Voir plus de jours
          </button>
        )}
      </div>
    </section>
  );
}

function GameBadge({ gameId, puuid }: { gameId: number; puuid?: string }) {
  return <BadgeTag badge={useBadge(gameId, puuid)} />;
}

const TIERS: [number, string][] = [
  [0, "Fer"],
  [400, "Bronze"],
  [800, "Argent"],
  [1200, "Or"],
  [1600, "Platine"],
  [2000, "Émeraude"],
  [2400, "Diamant"],
  [2800, "Maître"],
];

/** Courbe des LP, avec les paliers de rang en fond. La partie reconstituée est en pointillés. */
function LpChart({ points, calib }: { points: LpPoint[]; calib?: ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2)
    return (
      <section className="card card-pad">
        <h3>Courbe de LP {calib}</h3>
        <p className="note">La courbe apparaîtra après quelques parties classées jouées avec NIXUS ouvert.</p>
      </section>
    );
  const W = 1000;
  const H = 240;
  const scores = points.map(lpScore);
  const lo = Math.floor((Math.min(...scores) - 30) / 100) * 100;
  const hi = Math.ceil((Math.max(...scores) + 30) / 100) * 100;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * W;
  const y = (s: number) => H - ((s - lo) / Math.max(hi - lo, 1)) * H;
  const line = (from: number, to: number) =>
    points
      .slice(from, to)
      .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(scores[from + i]).toFixed(1)}`)
      .join(" ");
  const all = line(0, points.length);
  const lastEst = points.map((p) => !!p.est).lastIndexOf(true);
  const estPath = lastEst > 0 ? line(0, lastEst + 2) : "";
  const realPath = lastEst >= 0 ? line(lastEst + 1, points.length) : all;
  const net = scores[scores.length - 1] - scores[0];
  const h = hover !== null ? points[hover] : null;

  return (
    <section className="card card-pad lp">
      <h3>
        Courbe de LP <span className={net >= 0 ? "up" : "down"}>{signed(net)} LP sur la période</span>
        {lastEst >= 0 && <span>Pointillés : reconstitué depuis tes victoires et défaites</span>}
        {calib}
      </h3>
      <div className="lp-plot">
        <div className="lp-tiers" aria-hidden="true">
          {TIERS.filter(([s]) => s > lo && s <= hi).map(([s, label]) => (
            <span key={s} style={{ bottom: `${((s - lo) / (hi - lo)) * 100}%` }}>
              {label}
            </span>
          ))}
        </div>
        <div className="lp-area">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
              let best = 0;
              points.forEach((p, i) => {
                if (Math.abs(p.t - t) < Math.abs(points[best].t - t)) best = i;
              });
              setHover(best);
            }}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="lp-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#e50914" stopOpacity=".38" />
                <stop offset="1" stopColor="#e50914" stopOpacity="0" />
              </linearGradient>
            </defs>
            {Array.from({ length: (hi - lo) / 100 + 1 }, (_, i) => lo + i * 100).map((s) => (
              <line key={s} x1="0" x2={W} y1={y(s)} y2={y(s)} className={s % 400 === 0 ? "tier" : "div"} />
            ))}
            <path d={`${all} L${W},${H} L0,${H} Z`} fill="url(#lp-fill)" />
            {estPath && <path d={estPath} className="lp-line est" />}
            {realPath && <path d={realPath} className="lp-line" />}
            {h && <line x1={x(h.t)} x2={x(h.t)} y1="0" y2={H} className="lp-cursor" />}
          </svg>
          {h && <i className="lp-dot" style={{ left: `${(x(h.t) / W) * 100}%`, top: `${(y(lpScore(h)) / H) * 100}%` }} />}
          {h && (
            <div className={cx("lp-tip", x(h.t) > W / 2 && "left")} style={{ left: `${(x(h.t) / W) * 100}%` }}>
              <b>
                {rankLabel(h.tier, h.division)} · {h.lp} LP{h.est ? " (estimé)" : ""}
              </b>
              <small>
                {new Date(h.t).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · {timeAgo(h.t)}
              </small>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
