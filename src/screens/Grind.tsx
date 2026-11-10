import { Breathing } from "../components/Breathing";
import { BadgeTag, useBadge } from "../lib/badges";
import { useEffect, useMemo, useState } from "react";
import { ChampIcon, CountUp, Skeleton } from "../components/ui";
import { championSplash, clock, rankLabel, timeAgo } from "../lib/lcu";
import { estimateLp, importRiot, riotError, loadLp, loadRecords, lpScore, seedDemo, syncArchive, type LpPoint, type RankedRecord } from "../lib/archive";
import { isDesktop } from "../lib/lcu";
import { getSettings, setSettings, useSettings } from "../lib/settings";
import type { ClientState } from "../lib/useClient";
import type { Match } from "../lib/types";

type Queue = "RANKED_SOLO_5x5" | "RANKED_FLEX_SR";
const QUEUE_ID: Record<Queue, number> = { RANKED_SOLO_5x5: 420, RANKED_FLEX_SR: 440 };
type Range = 7 | 30 | 0;

const ROLES: [string, string][] = [
  ["TOP", "Top"],
  ["JUNGLE", "Jungle"],
  ["MIDDLE", "Mid"],
  ["BOTTOM", "ADC"],
  ["UTILITY", "Support"],
];

const pct = (v: number) => `${Math.round(v * 100)} %`;
const dec = (v: number, d = 1) => v.toFixed(d).replace(".", ",");
const signed = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("fr-FR")}`;
const ratio = (k: number, d: number, a: number) => (d === 0 ? "Parfait" : dec((k + a) / d, 2));
const avg = (list: (number | null)[]) => {
  const v = list.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
const startOfDay = () => {
  const d = new Date();
  d.setHours(d.getHours() < 5 ? -19 : 5, 0, 0, 0); // une session commence à 5 h du matin
  return d.getTime();
};

const asMatch = (r: RankedRecord): Match => ({
  gameId: r.gameId,
  gameCreation: r.createdAt,
  gameDuration: r.duration,
  queueId: r.queueId,
  participants: [{ championId: r.championId, stats: { kills: r.k, deaths: r.d, assists: r.a, win: r.win } }],
});

/** Page Grind : tes parties classées sauvegardées sur ce PC, ta courbe de LP et ce qui fait gagner. */
export function Grind({ state, onOpenMatch }: { state: ClientState; onOpenMatch: (m: Match) => void }) {
  const { champions, ranked, summoner } = state;
  const [records, setRecords] = useState<RankedRecord[] | null>(null);
  const [lp, setLp] = useState<LpPoint[]>([]);
  const [queue, setQueue] = useState<Queue>("RANKED_SOLO_5x5");
  const [range, setRange] = useState<Range>(30);
  const [syncing, setSyncing] = useState(false);
  const [importState, setImportState] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const runImport = async () => {
    const cfg = getSettings();
    if (!cfg.riotKey.trim()) {
      setImportState("Ajoute d'abord ta clé API Riot dans les Paramètres (roue en haut à droite).");
      return;
    }
    if (!summoner?.gameName || !summoner.tagLine) {
      setImportState("Ton Riot ID n'est pas encore chargé. Réessaie dans un instant.");
      return;
    }
    const since = Date.parse(`${cfg.importSince || "2026-10-04"}T00:00:00`);
    setImporting(true);
    setImportState("Recherche de tes SoloQ sur l'API Riot…");
    try {
      const r = await importRiot({
        gameName: summoner.gameName,
        tagLine: summoner.tagLine,
        key: cfg.riotKey,
        region: cfg.riotRegion || "europe",
        since,
        onProgress: (done, total) => setImportState(`Import Riot : ${done}/${total} parties (environ ${Math.ceil(((total - done) * 2.5) / 60)} min restantes)`),
      });
      const parts = [
        `${r.found} SoloQ trouvée${r.found > 1 ? "s" : ""} depuis le ${new Date(since).toLocaleDateString("fr-FR")}`,
        r.imported ? `${r.imported} importée${r.imported > 1 ? "s" : ""}` : "rien de neuf à importer",
      ];
      if (r.removed) parts.push(`${r.removed} ancienne${r.removed > 1 ? "s" : ""} fiche${r.removed > 1 ? "s" : ""} retirée${r.removed > 1 ? "s" : ""}`);
      if (r.failed) parts.push(`${r.failed} en échec (relance l'import pour réessayer)`);
      setImportState(parts.join(", ") + ".");
      setRecords(await loadRecords());
    } catch (e) {
      setImportState(`Import impossible : ${riotError(e)}`);
      setRecords(await loadRecords().catch(() => records ?? []));
    } finally {
      setImporting(false);
    }
  };
  const name = (id: number | null) => (id ? champions.get(id)?.name ?? "Champion" : "?");

  const refresh = async () => {
    setSyncing(true);
    await seedDemo().catch(() => {});
    const list = await syncArchive(summoner?.puuid).catch(() => loadRecords());
    setRecords(list);
    setLp(await loadLp().catch(() => []));
    setSyncing(false);
  };
  useEffect(() => {
    refresh();
  }, [summoner?.puuid]); // eslint-disable-line react-hooks/exhaustive-deps

  const since = range ? Date.now() - range * 86400000 : 0;
  const games = useMemo(() => (records ?? []).filter((r) => r.queueId === QUEUE_ID[queue] && !r.remake && r.createdAt >= since), [records, queue, since]);
  const cfg = useSettings();
  const importStart = Date.parse(`${cfg.importSince || "2026-10-04"}T00:00:00`);
  const startLp = cfg.lpStart.trim() === "" ? null : Number(cfg.lpStart);
  const points = useMemo(
    () => estimateLp(records ?? [], lp, QUEUE_ID[queue], queue, importStart, queue === "RANKED_SOLO_5x5" && Number.isFinite(startLp) ? startLp : null).filter((p) => p.t >= since),
    [records, lp, queue, since, importStart, startLp],
  );
  const current = ranked?.queueMap[queue];

  // Session du jour
  const today = games.filter((g) => g.createdAt >= startOfDay());
  const todayLp = (() => {
    const all = lp.filter((p) => p.queue === queue);
    const before = [...all].reverse().find((p) => p.t < startOfDay());
    const last = all[all.length - 1];
    return before && last && last.t >= startOfDay() ? lpScore(last) - lpScore(before) : null;
  })();
  const streak = (() => {
    const all = (records ?? []).filter((r) => r.queueId === QUEUE_ID[queue] && !r.remake);
    if (!all.length) return null;
    let n = 0;
    while (n < all.length && all[n].win === all[0].win) n++;
    return { win: all[0].win, n };
  })();

  const wins = games.filter((g) => g.win).length;
  const sumK = games.reduce((s, g) => s + g.k, 0);
  const sumD = games.reduce((s, g) => s + g.d, 0);
  const sumA = games.reduce((s, g) => s + g.a, 0);
  const minutes = games.reduce((s, g) => s + g.duration / 60, 0) || 1;

  const byChampion = useMemo(() => group(games, (g) => g.championId).slice(0, 10), [games]);
  const byOpponent = useMemo(() => group(games.filter((g) => g.opponentId), (g) => g.opponentId!).slice(0, 8), [games]);
  const topChamp = byChampion[0]?.[0] ?? games[0]?.championId ?? 64;

  return (
    <>
      <section className="hero grind-hero">
        <div className="hero-bg">
          <Breathing full src={championSplash(topChamp)} champ={topChamp} />
        </div>
        <div className="hero-content" style={{ maxWidth: "none", width: "100%" }}>
          <div className="eyebrow">Parties classées sauvegardées sur ce PC · {records?.length ?? "…"} au total</div>
          <h1 className="title">GRIND</h1>
          <div className="grind-head">
            <div className="grind-rank">
              <span className="label">{queue === "RANKED_SOLO_5x5" ? "Solo/Duo" : "Flex"}</span>
              <b>{rankLabel(current?.tier, current?.division)}</b>
              <span>{current?.tier ? `${current.leaguePoints} LP · ${current.wins} V · ${current.losses} D` : "Pas encore classé"}</span>
            </div>
            <div className="grind-tools">
              <div className="squad-seg grind-seg">
                {(["RANKED_SOLO_5x5", "RANKED_FLEX_SR"] as Queue[]).map((q) => (
                  <button key={q} aria-pressed={queue === q} onClick={() => setQueue(q)}>
                    {q === "RANKED_SOLO_5x5" ? "Solo/Duo" : "Flex"}
                  </button>
                ))}
              </div>
              <div className="squad-seg grind-seg">
                {([7, 30, 0] as Range[]).map((r) => (
                  <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
                    {r ? `${r} jours` : "Tout"}
                  </button>
                ))}
              </div>
              {isDesktop && (
                <button className="btn btn-ghost small" onClick={runImport} disabled={importing} title="Récupérer toutes tes SoloQ avec l'API Riot">
                  {importing ? "Import…" : "Importer depuis Riot"}
                </button>
              )}
              <button className="btn btn-ghost small" onClick={refresh} disabled={syncing}>
                {syncing ? "Sauvegarde…" : "Mettre à jour"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="rows">
        {importState && <div className="grind-import" role="status">{importState}</div>}
        <section className="grind-today">
          <div className="pst-block">
            <div>
              <span className="label">Aujourd'hui</span>
              <b>
                {today.filter((g) => g.win).length}V {today.filter((g) => !g.win).length}D
              </b>
              <small>{today.length ? `${today.length} partie${today.length > 1 ? "s" : ""}` : "Pas encore joué"}</small>
            </div>
          </div>
          <div className="pst-block">
            <div>
              <span className="label">LP du jour</span>
              <b className={todayLp === null ? "" : todayLp >= 0 ? "up" : "down"}>
                <CountUp text={todayLp === null ? "–" : `${signed(todayLp)} LP`} />
              </b>
            </div>
          </div>
          <div className="pst-block">
            <div>
              <span className="label">Série</span>
              <b className={streak ? (streak.win ? "up" : "down") : ""}>{streak ? `${streak.n} ${streak.win ? "victoire" : "défaite"}${streak.n > 1 ? "s" : ""}` : "–"}</b>
              {streak && !streak.win && streak.n >= 3 && <small className="grind-tilt">3 défaites d'affilée : une pause peut aider.</small>}
            </div>
          </div>
          <div className="pst-block">
            <div>
              <span className="label">Sur la période</span>
              <b>
                <CountUp text={games.length ? pct(wins / games.length) : "–"} />
              </b>
              <small>
                {wins}V {games.length - wins}D
              </small>
            </div>
          </div>
        </section>

        {records === null ? (
          <div className="skel-block" aria-label="Lecture de tes parties sauvegardées">
            <Skeleton style={{ height: 220 }} />
            <div className="skel-row">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} style={{ height: 76 }} />
              ))}
            </div>
          </div>
        ) : games.length === 0 ? (
          <div className="empty-state">
            <b>Rien sur cette période</b>
            <p>NIXUS enregistre chaque partie classée dès qu'elle apparaît dans l'historique du client. Joue une partie classée, ou élargis la période à « Tout ».</p>
          </div>
        ) : (
          <>
            <LpChart
              points={points}
              calib={
                queue === "RANKED_SOLO_5x5" && points.some((p) => p.est) ? (
                  <label className="lp-calib" title="Tes LP au début de l'import : la courbe reconstituée est calée dessus">
                    LP au {new Date(importStart).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                    <input className="search" inputMode="numeric" placeholder="?" value={cfg.lpStart} onChange={(e) => setSettings({ lpStart: e.target.value.replace(/[^0-9-]/g, "") })} />
                  </label>
                ) : null
              }
            />

            <div className="pst-summary">
              <Kpi label="KDA" value={ratio(sumK, sumD, sumA)} sub={`${dec(sumK / games.length)} / ${dec(sumD / games.length)} / ${dec(sumA / games.length)}`} />
              <Kpi label="KP" value={pct(avg(games.map((g) => g.kp)) ?? 0)} />
              <Kpi label="CS / min" value={dec(games.reduce((s, g) => s + g.cs, 0) / minutes)} />
              <Kpi label="CS à 10 min" value={fmt(avg(games.map((g) => g.cs10)), 0)} />
              <Kpi label="Écart d'or à 10" value={fmtSigned(avg(games.map((g) => g.gd10)))} tone={avg(games.map((g) => g.gd10))} />
              <Kpi label="Écart d'or à 15" value={fmtSigned(avg(games.map((g) => g.gd15)))} tone={avg(games.map((g) => g.gd15))} />
              <Kpi label="Dégâts / min" value={Math.round(games.reduce((s, g) => s + g.damage, 0) / minutes).toLocaleString("fr-FR")} />
              <Kpi label="Vision / min" value={dec(games.reduce((s, g) => s + g.vision, 0) / minutes, 2)} />
            </div>

            <div className="pst-grid">
              <div className="pst-card">
                <h3>Tes champions</h3>
                <div className="pst-table grind-table" role="table">
                  <div className="pst-tr pst-th" role="row">
                    <span>Champion</span>
                    <span>Parties</span>
                    <span>Victoires</span>
                    <span>KDA</span>
                    <span>Or à 15</span>
                    <span>CS à 10</span>
                  </div>
                  {byChampion.map(([id, list]) => (
                    <ChampRow key={id} id={id} list={list} name={name(id)} />
                  ))}
                </div>
              </div>
              <div className="pst-side">
                <div className="pst-card">
                  <h3>Par rôle</h3>
                  <div className="pst-roles">
                    {ROLES.map(([r, label]) => {
                      const list = games.filter((g) => g.role === r);
                      const max = Math.max(1, ...ROLES.map(([x]) => games.filter((g) => g.role === x).length));
                      return (
                        <div key={r} className={`pst-role ${list.length ? "" : "off"}`}>
                          <span className="pst-role-bar">
                            <i style={{ height: `${(list.length / max) * 100}%` }} />
                          </span>
                          <b>{label}</b>
                          <small>{list.length ? `${list.length} · ${pct(list.filter((g) => g.win).length / list.length)}` : "–"}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="pst-card">
                  <h3>Face à</h3>
                  <ul className="pst-modes">
                    {byOpponent.map(([id, list]) => {
                      const w = list.filter((g) => g.win).length / list.length;
                      return (
                        <li key={id}>
                          <span className="pst-champ">
                            <ChampIcon id={id} />
                            <b>{name(id)}</b>
                          </span>
                          <small>
                            {list.length} partie{list.length > 1 ? "s" : ""} · or à 15 {fmtSigned(avg(list.map((g) => g.gd15)))}
                          </small>
                          <b className={w >= 0.5 ? "good" : "bad"}>{pct(w)}</b>
                        </li>
                      );
                    })}
                    {byOpponent.length === 0 && <li>Pas encore d'adversaire direct identifié.</li>}
                  </ul>
                </div>
              </div>
            </div>

            <section className="pst-card">
              <SessionJournal games={games} points={points} name={name} puuid={state.summoner?.puuid} onOpen={(g) => onOpenMatch(asMatch(g))} />
            </section>
          </>
        )}
      </div>
    </>
  );
}

const dayKey = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Journal des sessions : une ligne par jour avec le bilan, les LP du jour et chaque partie en vignette. */
function SessionJournal({ games, points, name, onOpen, puuid }: { games: RankedRecord[]; points: LpPoint[]; name: (id: number | null) => string; onOpen: (g: RankedRecord) => void; puuid?: string }) {
  const [open, setOpen] = useState(7);
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
        const end = scoreAt(day + 86400000 - 1);
        const start = scoreAt(day - 1);
        const est = points.some((p) => p.est && p.t >= day && p.t < day + 86400000);
        return { day, list: list.sort((a, b) => a.createdAt - b.createdAt), lp: end !== null && start !== null ? end - start : null, est };
      });
  }, [games, points]);

  if (!days.length) return null;
  return (
    <>
      <h3>Journal des sessions</h3>
      <div className="gj">
        {days.slice(0, open).map(({ day, list, lp, est }) => {
          const w = list.filter((g) => g.win).length;
          const kda = list.reduce((s, g) => s + g.k + g.a, 0) / Math.max(1, list.reduce((s, g) => s + g.d, 0));
          return (
            <section key={day} className="gj-day">
              <header>
                <b>{new Date(day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</b>
                <span className="gj-wl">
                  <em className="up">{w} V</em> · <em className="down">{list.length - w} D</em>
                </span>
                <span className="gj-bar" aria-hidden="true">
                  <i style={{ width: `${(w / list.length) * 100}%` }} />
                </span>
                <span>KDA {dec(kda, 2)}</span>
                {lp !== null && (
                  <span className={`gj-lp ${lp >= 0 ? "up" : "down"}`} title={est ? "Estimé à partir des victoires et défaites" : undefined}>
                    {signed(lp)} LP{est ? "*" : ""}
                  </span>
                )}
              </header>
              <div className="gj-games">
                {list.map((g) => (
                  <button key={g.gameId} className={`gj-game ${g.win ? "win" : "loss"}`} onClick={() => onOpen(g)} title={`${name(g.championId)}${g.opponentId ? ` contre ${name(g.opponentId)}` : ""} · ${clock(g.duration)}`}>
                    <Breathing src={championSplash(g.championId)} champ={g.championId} />
                    <span className="gj-shade" />
                    <GameBadge gameId={g.gameId} puuid={puuid} />
                    <b>{name(g.championId)}</b>
                    <span className="gj-kda">
                      {g.k}/<em>{g.d}</em>/{g.a}
                    </span>
                    {g.gd15 !== null && <small className={g.gd15 >= 0 ? "up" : "down"}>{signed(g.gd15)} or à 15′</small>}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {days.length > open && (
          <button className="btn btn-ghost small gj-more" onClick={() => setOpen((n) => n + 7)}>
            Voir plus de jours
          </button>
        )}
      </div>
    </>
  );
}

function group(list: RankedRecord[], key: (r: RankedRecord) => number) {
  const map = new Map<number, RankedRecord[]>();
  list.forEach((r) => map.set(key(r), [...(map.get(key(r)) ?? []), r]));
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || b[1].filter((g) => g.win).length - a[1].filter((g) => g.win).length);
}
const fmt = (v: number | null, d = 1) => (v === null ? "–" : d === 0 ? String(Math.round(v)) : dec(v, d));
const fmtSigned = (v: number | null) => (v === null ? "–" : signed(v));

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number | null }) {
  return (
    <div className="pst-block">
      <div>
        <span className="label">{label}</span>
        <b className={tone === undefined || tone === null ? "" : tone >= 0 ? "up" : "down"}>
          <CountUp text={value} />
        </b>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

function ChampRow({ id, list, name }: { id: number; list: RankedRecord[]; name: string }) {
  const w = list.filter((g) => g.win).length / list.length;
  const gd = avg(list.map((g) => g.gd15));
  return (
    <div className="pst-tr" role="row">
      <span className="pst-champ">
        <ChampIcon id={id} />
        <b>{name}</b>
      </span>
      <span>{list.length}</span>
      <span className={w >= 0.5 ? "good" : "bad"}>
        <i className="pst-bar">
          <i style={{ width: `${w * 100}%` }} />
        </i>
        {pct(w)}
      </span>
      <span>{ratio(list.reduce((s, g) => s + g.k, 0), list.reduce((s, g) => s + g.d, 0), list.reduce((s, g) => s + g.a, 0))}</span>
      <span className={gd === null ? "" : gd >= 0 ? "good" : "bad"}>{fmtSigned(gd)}</span>
      <span>{fmt(avg(list.map((g) => g.cs10)), 0)}</span>
    </div>
  );
}

const TIER_NAMES: [number, string][] = [
  [0, "Fer"],
  [400, "Bronze"],
  [800, "Argent"],
  [1200, "Or"],
  [1600, "Platine"],
  [2000, "Émeraude"],
  [2400, "Diamant"],
  [2800, "Maître"],
];

/** Courbe des LP, avec les paliers de rang en fond. */
function LpChart({ points, calib }: { points: LpPoint[]; calib?: React.ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2)
    return <div className="pst-card grind-chart-empty">La courbe de LP apparaîtra après quelques parties classées jouées avec NIXUS ouvert.</div>;
  const W = 1000;
  const H = 220;
  const scores = points.map(lpScore);
  const lo = Math.floor((Math.min(...scores) - 30) / 100) * 100;
  const hi = Math.ceil((Math.max(...scores) + 30) / 100) * 100;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * W;
  const y = (s: number) => H - ((s - lo) / Math.max(hi - lo, 1)) * H;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(scores[i]).toFixed(1)}`).join(" ");
  // Partie reconstituée en pointillés, partie notée par NIXUS en trait plein.
  const lastEst = points.map((p) => !!p.est).lastIndexOf(true);
  const estPath = lastEst > 0 ? points.slice(0, lastEst + 2).map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(scores[i]).toFixed(1)}`).join(" ") : "";
  const realPath = lastEst >= 0 ? points.slice(lastEst + 1).map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(scores[lastEst + 1 + i]).toFixed(1)}`).join(" ") : path;
  const net = scores[scores.length - 1] - scores[0];
  const h = hover !== null ? points[hover] : null;

  return (
    <div className="pst-card grind-chart">
      <h3>
        Courbe de LP <span className={net >= 0 ? "up" : "down"}>{signed(net)} LP sur la période</span>
        {lastEst >= 0 && <small className="lp-est-note">Pointillés : reconstitué depuis tes victoires et défaites</small>}
        {calib}
      </h3>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
          let best = 0;
          points.forEach((p, i) => Math.abs(p.t - t) < Math.abs(points[best].t - t) && (best = i));
          setHover(best);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="lpfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#e50914" stopOpacity=".35" />
            <stop offset="1" stopColor="#e50914" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: (hi - lo) / 100 + 1 }, (_, i) => lo + i * 100).map((s) => (
          <line key={s} x1="0" x2={W} y1={y(s)} y2={y(s)} className={s % 400 === 0 ? "tier" : "div"} />
        ))}
        <path d={`${path} L${W},${H} L0,${H} Z`} fill="url(#lpfill)" />
        {estPath && <path d={estPath} className="lp-line est" />}
        {realPath && <path d={realPath} className="lp-line" />}
        {h && <line x1={x(h.t)} x2={x(h.t)} y1="0" y2={H} className="lp-cursor" />}
      </svg>
      {h && <i className="lp-dot" style={{ left: `calc(86px + (100% - 102px) * ${x(h.t) / W})`, top: `calc(46px + 220px * ${y(lpScore(h)) / H})` }} />}
      <div className="grind-tiers">
        {TIER_NAMES.filter(([s]) => s >= lo - 399 && s <= hi).map(([s, label]) => (
          <span key={s} style={{ bottom: `${Math.max(0, Math.min(100, ((s - lo) / (hi - lo)) * 100))}%` }}>{label}</span>
        ))}
      </div>
      {h && (
        <div className="grind-tip">
          {rankLabel(h.tier, h.division)} · {h.lp} LP{h.est ? " (estimé)" : ""} · {new Date(h.t).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · {timeAgo(h.t)}
        </div>
      )}
    </div>
  );
}

function GameBadge({ gameId, puuid }: { gameId: number; puuid?: string }) {
  return <BadgeTag badge={useBadge(gameId, puuid)} />;
}
