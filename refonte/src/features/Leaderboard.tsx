import { useEffect, useMemo, useRef, useState } from "react";
import { loadFriendLp, loadLp, lpScore, saveFriendLp, seedLeaderboardDemo, type FriendLpPoint } from "../lib/archive";
import { useClient } from "../lib/client";
import { lcu, profileIcon, rankLabel } from "../lib/lcu";
import type { Friend, RankedQueue, RankedStats } from "../lib/types";
import { nav } from "../lib/view";
import { Art, Seg, cx } from "../ui";

type Mode = "solo" | "flex" | "week";
const QUEUE = { solo: "RANKED_SOLO_5x5", flex: "RANKED_FLEX_SR" } as const;
const DAY = 86_400_000;
const WEEK = 7 * DAY;
const TTL = 15 * 60_000;
const CACHE_KEY = "nixus.leaderboard.v2";
const MODE_KEY = "nixus.leaderboard.mode";

type Ranks = { solo: RankedQueue | null; flex: RankedQueue | null };
type Cache = { at: number; data: Record<string, Ranks | null> };
type Row = { id: string; name: string; icon: number; me?: boolean; friend?: Friend; q: RankedQueue; delta?: number | null; note?: string };
type MyPoint = { t: number; queue: string; tier: string; division: string; lp: number; est?: boolean };

const clean = (q?: RankedQueue | null): RankedQueue | null =>
  q && q.tier && q.tier !== "NONE" ? { tier: q.tier, division: q.division, leaguePoints: q.leaguePoints ?? 0, wins: q.wins ?? 0, losses: q.losses ?? 0 } : null;
const score = (q: RankedQueue) => lpScore({ tier: q.tier, division: q.division, lp: q.leaguePoints });

let memo: Cache | null = null;
function readCache(): Cache | null {
  if (memo) return memo;
  try {
    memo = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  } catch {
    memo = null;
  }
  return memo;
}
function writeCache(c: Cache) {
  memo = c;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* stockage indisponible */
  }
}

/** Rangs Solo/Duo et Flex des amis demandés, 4 lectures à la fois (lecture seule, comme le profil d'un ami dans le client). */
async function fetchRanks(puuids: string[]) {
  const out: Record<string, Ranks | null> = {};
  let i = 0;
  const worker = async () => {
    while (i < puuids.length) {
      const id = puuids[i++];
      try {
        const r = await lcu<RankedStats>("GET", `/lol-ranked/v1/ranked-stats/${id}`);
        out[id] = { solo: clean(r?.queueMap?.[QUEUE.solo]), flex: clean(r?.queueMap?.[QUEUE.flex]) };
      } catch {
        out[id] = null; // lecture impossible : rien d'inventé
      }
    }
  };
  await Promise.all([0, 1, 2, 3].map(worker));
  return out;
}

/**
 * NIXUS note lui-même le rang de chaque ami (un point dès qu'il change, sinon au plus toutes les 6 h) :
 * c'est la seule façon d'avoir une évolution sur 7 jours, Riot ne donne pas l'historique de LP d'un autre joueur.
 */
async function recordFriends(data: Record<string, Ranks | null>) {
  const cur: Record<string, number> = {};
  for (const [id, r] of Object.entries(data)) if (r?.solo) cur[id] = score(r.solo);
  await seedLeaderboardDemo(cur).catch(() => {}); // mode démo seulement
  const all = await loadFriendLp();
  const now = Date.now();
  let changed = false;
  for (const [id, r] of Object.entries(data)) {
    if (!r) continue;
    const p: FriendLpPoint = { t: now, ...(r.solo ? { solo: score(r.solo) } : {}), ...(r.flex ? { flex: score(r.flex) } : {}) };
    const list = (all[id] ?? []).filter((x) => now - x.t < 30 * DAY);
    const last = list[list.length - 1];
    if (!last || last.solo !== p.solo || last.flex !== p.flex || now - last.t > 6 * 3600_000) {
      list.push(p);
      changed = true;
    }
    all[id] = list.slice(-120);
  }
  if (changed) await saveFriendLp(all);
  return all;
}

/** Départ de la semaine : le dernier relevé d'il y a 7 jours ou plus, sinon le plus ancien s'il a au moins un jour. */
function baseline<T extends { t: number }>(points: T[]) {
  const now = Date.now();
  const list = [...points].sort((a, b) => a.t - b.t);
  const before = list.filter((p) => p.t <= now - WEEK);
  const b = before.length ? before[before.length - 1] : list[0];
  return !b || now - b.t < DAY ? null : b;
}
const since = (t: number) => {
  const d = Math.floor((Date.now() - t) / DAY);
  return d >= 7 ? "sur 7 jours" : `depuis ${d} j`;
};

/** Carte « Classement entre amis » : Solo/Duo, Flex, et LP gagnés ou perdus sur la semaine. */
export function Leaderboard({ className }: { className?: string }) {
  const friends = useClient((s) => s.friends);
  const summoner = useClient((s) => s.summoner);
  const mine = useClient((s) => s.ranked);
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const m = localStorage.getItem(MODE_KEY);
      return m === "flex" || m === "week" ? m : "solo";
    } catch {
      return "solo";
    }
  });
  const [ranks, setRanks] = useState<Record<string, Ranks | null> | null>(() => readCache()?.data ?? null);
  const [history, setHistory] = useState<Record<string, FriendLpPoint[]>>({});
  const [myLp, setMyLp] = useState<MyPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const loading = useRef(false);

  const ids = useMemo(() => [...new Set(friends.map((f) => f.puuid).filter(Boolean))].sort(), [friends]);
  const key = ids.join(",");
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const load = async (all: boolean) => {
    const ids = idsRef.current;
    if (loading.current || !ids.length) return;
    const c = readCache();
    const full = all || !c || Date.now() - c.at > TTL;
    const todo = full ? ids : ids.filter((id) => !(id in (c?.data ?? {})));
    if (!todo.length) {
      if (c) setRanks(c.data);
      return;
    }
    loading.current = true;
    setBusy(true);
    try {
      const got = await fetchRanks(todo);
      const data: Record<string, Ranks | null> = { ...(full ? {} : c?.data ?? {}), ...got };
      for (const id of Object.keys(data)) if (!ids.includes(id)) delete data[id]; // seulement les amis actuels
      writeCache({ at: full ? Date.now() : c?.at ?? Date.now(), data });
      setRanks(data);
      setHistory(await recordFriends(got));
      loadLp().then(setMyLp);
    } finally {
      loading.current = false;
      setBusy(false);
    }
  };

  // Mis à jour quand la liste d'amis change, sinon au plus toutes les 15 minutes.
  useEffect(() => {
    load(false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadFriendLp().then(setHistory);
    loadLp().then(setMyLp);
    const on = () => {
      load(true);
      loadLp().then(setMyLp);
    };
    window.addEventListener("nixus:refresh", on);
    const t = window.setInterval(() => load(false), TTL);
    return () => {
      window.removeEventListener("nixus:refresh", on);
      clearInterval(t);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Mon rang bouge à chaque partie : on relit mes relevés quand il change.
  const mineSolo = mine?.queueMap?.[QUEUE.solo];
  useEffect(() => {
    loadLp().then(setMyLp);
  }, [mineSolo?.leaguePoints, mineSolo?.tier, mineSolo?.division]);

  const pick = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* stockage indisponible */
    }
  };

  const rows = useMemo<Row[]>(() => {
    const meName = summoner?.gameName || "Toi";
    const meIcon = summoner?.profileIconId ?? 29;
    const meId = summoner?.puuid ?? "me";
    const list: Row[] = [];
    if (mode !== "week") {
      for (const f of friends) {
        const q = ranks?.[f.puuid]?.[mode];
        if (q) list.push({ id: f.puuid, name: f.gameName, icon: f.icon, friend: f, q });
      }
      const q = clean(mine?.queueMap?.[QUEUE[mode]]);
      if (q) list.push({ id: meId, name: meName, icon: meIcon, me: true, q });
      // Trié par rang (palier, division, LP), puis par nombre de victoires.
      return list.sort((a, b) => score(b.q) - score(a.q) || b.q.wins - a.q.wins);
    }
    // Semaine (Solo/Duo) : LP gagnés ou perdus depuis le relevé d'il y a 7 jours.
    const nowMine = clean(mine?.queueMap?.[QUEUE.solo]);
    if (nowMine) {
      const b = baseline(myLp.filter((p) => p.queue === QUEUE.solo && !p.est));
      list.push({ id: meId, name: meName, icon: meIcon, me: true, q: nowMine, delta: b ? score(nowMine) - lpScore(b) : null, note: b ? since(b.t) : "pas encore de recul" });
    }
    for (const f of friends) {
      const now = ranks?.[f.puuid]?.solo;
      if (!now) continue;
      const b = baseline((history[f.puuid] ?? []).filter((p) => p.solo != null));
      list.push({ id: f.puuid, name: f.gameName, icon: f.icon, friend: f, q: now, delta: b ? score(now) - b.solo! : null, note: b ? since(b.t) : "pas encore de recul" });
    }
    return list.sort((a, b) => (b.delta ?? -1e9) - (a.delta ?? -1e9) || score(b.q) - score(a.q));
  }, [mode, friends, ranks, mine, summoner, history, myLp]);

  const others = rows.filter((r) => !r.me).length;
  const withData = rows.filter((r) => mode !== "week" || r.delta != null);
  const myPos = rows.findIndex((r) => r.me);
  const showPos = myPos >= 0 && (mode !== "week" || rows[myPos].delta != null);

  return (
    <section className={cx("board glass", className)} aria-label="Classement entre amis">
      <header className="board-head">
        <h2 className="h2">Classement</h2>
        <span className="dim">entre amis{showPos && others ? ` · tu es ${myPos + 1}${myPos === 0 ? "er" : "e"}` : ""}</span>
        {busy && <i className="board-busy" role="status" aria-label="Mise à jour des rangs" />}
      </header>
      <Seg
        value={mode}
        onChange={pick}
        label="Type de classement"
        options={
          [
            ["solo", "Solo/Duo"],
            ["flex", "Flex"],
            ["week", "Semaine"],
          ] as const
        }
      />
      {!ranks && ids.length > 0 ? (
        <p className="note board-empty">Lecture des rangs de tes amis…</p>
      ) : others === 0 ? (
        <div className="board-empty">
          <b>{ids.length === 0 ? "Pas encore d'amis" : "Aucun ami classé"}</b>
          <p className="note">
            {ids.length === 0
              ? "Ajoute des amis pour comparer vos rangs ici."
              : `Aucun de tes amis n'a de rang en ${mode === "flex" ? "Flex" : "Solo/Duo"} cette saison. Dès qu'un ami termine ses placements, il apparaît ici.`}
          </p>
        </div>
      ) : (
        <ol className="board-list">
          {rows.map((r, i) => {
            const noData = mode === "week" && r.delta == null;
            const d = r.delta ?? 0;
            return (
              <li key={r.id} className={cx(r.me && "me")}>
                <button type="button" disabled={!r.friend} onClick={() => r.friend && nav.history(r.friend)} title={r.friend ? `Voir l'historique de ${r.name}` : undefined}>
                  <b className={cx("board-pos", i === 0 && !noData && "gold")}>{noData ? "—" : i + 1}</b>
                  <Art src={profileIcon(r.icon)} />
                  <span className="board-who">
                    <b>{r.me ? `${r.name} (toi)` : r.name}</b>
                    <small>{mode === "week" ? `${rankLabel(r.q.tier, r.q.division)} · ${r.note}` : rankLabel(r.q.tier, r.q.division)}</small>
                  </span>
                  <span className={cx("board-lp mono", !noData && mode === "week" && (d > 0 ? "up" : d < 0 ? "down" : ""))}>
                    {mode === "week" ? (noData ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : "±"} ${Math.abs(d)} LP`) : `${r.q.leaguePoints} LP`}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {mode === "week" && others > 0 && withData.length < rows.length && (
        <p className="note">Riot ne donne pas l'historique de LP d'un autre joueur. NIXUS note le rang de tes amis à chaque ouverture : « — » veut dire pas encore un jour de recul.</p>
      )}
    </section>
  );
}
