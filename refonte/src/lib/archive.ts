import { invoke } from "@tauri-apps/api/core";
import { isDesktop, lcu } from "./lcu";
import type { GameDetail, Match, MatchHistory, RankedQueue, RankedStats, Timeline } from "./types";

/** Résumé d'une partie classée sauvegardée, avec ce qu'il faut pour le grind. */
export interface RankedRecord {
  gameId: number;
  queueId: number;
  createdAt: number;
  duration: number;
  championId: number;
  opponentId: number | null;
  role: string | null;
  win: boolean;
  remake: boolean;
  k: number;
  d: number;
  a: number;
  kp: number;
  cs: number;
  gold: number;
  damage: number;
  vision: number;
  cs10: number | null;
  gd10: number | null;
  gd15: number | null;
  csd10: number | null;
  /** D'où vient la fiche : le client (historique récent) ou l'API Riot. Absent : ancienne version (dont l'import Challenger). */
  src?: "lcu" | "riot";
  /** Points de ligue juste après la partie, s'ils ont été notés (snapshot du rang). */
  lpAfter?: number | null;
}

export interface LpPoint {
  /** Point reconstitué à partir des victoires et défaites (Riot ne donne pas l'historique des LP). */
  est?: boolean;
  t: number;
  queue: string;
  tier: string;
  division: string;
  lp: number;
  wins: number;
  losses: number;
}

export const RANKED_QUEUES = [420, 440];

const SNAP_PATHS = [
  "/lol-gameflow/v1/session",
  "/lol-lobby/v2/lobby",
  "/lol-lobby/v2/lobby/members",
  "/lol-lobby/v2/lobby/matchmaking/search-state",
  "/lol-lobby/v1/parties/player",
  "/lol-lobby/v1/autofill-displayed",
  "/lol-lobby/v2/party-active",
  "/lol-lobby/v2/eligibility/initial-configuration-complete",
  "/lol-matchmaking/v1/search",
  "/lol-champ-select/v1/session",
  "/lol-lobby-team-builder/champ-select/v1/session",
  "/lol-lobby-team-builder/v1/matchmaking",
  "/lol-champ-select/v1/pin-drop-notification",
];

/**
 * Note ce que le client renvoie à un moment donné (salon, file, draft), dans archive/debug.
 * Sert à repérer où le client range « rôle garanti », « autofill », la protection, etc.
 * Lecture seule : uniquement des GET, rien n'est envoyé au client.
 */
export async function snapshot(label: string, paths: readonly string[] = SNAP_PATHS, extra?: Record<string, unknown>) {
  if (!isDesktop) return;
  const out: Record<string, unknown> = { label, t: new Date().toISOString(), ...extra };
  for (const p of paths) out[p] = await lcu("GET", p).catch((e) => ({ error: String((e as Error)?.message ?? e) }));
  await put("debug", `${label}-${Date.now()}`, out).catch(() => {});
}

// --------- Stockage : fichiers JSON via Rust dans l'appli, localStorage en démo ---------

async function put(kind: string, id: string, data: unknown) {
  if (isDesktop) return invoke("archive_put", { kind, id, data });
  try {
    localStorage.setItem(`nixus.archive.${kind}.${id}`, JSON.stringify(data));
  } catch {
    /* démo : stockage plein, tant pis */
  }
}
async function get<T>(kind: string, id: string): Promise<T | null> {
  if (isDesktop) return invoke<T | null>("archive_get", { kind, id });
  try {
    return JSON.parse(localStorage.getItem(`nixus.archive.${kind}.${id}`) ?? "null");
  } catch {
    return null;
  }
}

/** Une seule fiche par partie (les versions 0.10 pouvaient en enregistrer plusieurs). */
const unique = <T extends { gameId: number }>(list: T[]) => [...new Map(list.map((r) => [r.gameId, r])).values()];

export const loadRecords = () => get<RankedRecord[]>("index", "ranked").then((r) => unique(r ?? []));
export const loadLp = () => get<LpPoint[]>("index", "lp").then((r) => r ?? []);
/** Rangs des amis relevés par NIXUS (Riot ne donne pas l'historique de LP d'un ami) : puuid → points {t, solo, flex}. */
export type FriendLpPoint = { t: number; solo?: number; flex?: number };
export const loadFriendLp = () => get<Record<string, FriendLpPoint[]>>("index", "friends-lp").then((r) => r ?? {});
export const saveFriendLp = (data: Record<string, FriendLpPoint[]>) => put("index", "friends-lp", data).catch(() => {});
/** Démo navigateur : des relevés d'il y a 8 jours, calés sur les rangs actuels, pour voir l'onglet Semaine rempli (rien dans l'appli). */
export async function seedLeaderboardDemo(current: Record<string, number>) {
  if (isDesktop) return;
  const old = Date.now() - 8 * 86_400_000;
  const friends = await loadFriendLp();
  if (!Object.keys(friends).length && Object.keys(current).length) {
    const deltas = [-38, 64, 12, 0, 91, -120, 25, 40, -15, 7, 0, 33];
    Object.entries(current).forEach(([id, now], i) => {
      // Un ami sur cinq n'a pas encore de relevé : il s'affiche avec « — ».
      if (i % 5 === 4) return;
      friends[id] = [{ t: old, solo: now - deltas[i % deltas.length] }];
    });
    await saveFriendLp(friends);
  }
  const lp = await loadLp();
  if (!lp.some((p) => p.t <= old)) await put("index", "lp", [{ t: old, queue: "RANKED_SOLO_5x5", tier: "EMERALD", division: "III", lp: 22, wins: 118, losses: 87 }, ...lp]);
}
export const loadDetail = (gameId: number) => get<GameDetail>("game", String(gameId));
export const loadTimeline = (gameId: number) => get<Timeline>("timeline", String(gameId));

// --------- Calcul d'une fiche à partir du détail et de la timeline ---------

const n = (v: unknown) => Number(v ?? 0);
export const roleOf = (lane?: string, role?: string) =>
  lane === "BOTTOM" || lane === "BOT" ? (role === "DUO_SUPPORT" || role === "SUPPORT" ? "UTILITY" : "BOTTOM") : lane === "MID" ? "MIDDLE" : lane && lane !== "NONE" ? lane : null;

export function buildRecord(m: Match, d: GameDetail, t: Timeline | null, puuid?: string): RankedRecord {
  const champ = m.participants[0]?.championId;
  const meId = d.participantIdentities.find((i) => puuid && i.player.puuid === puuid)?.participantId ?? d.participants.find((p) => p.championId === champ)?.participantId;
  const me = d.participants.find((p) => p.participantId === meId) ?? d.participants[0];
  const role = roleOf(me.timeline?.lane, me.timeline?.role);
  const opp = role ? d.participants.find((p) => p.teamId !== me.teamId && roleOf(p.timeline?.lane, p.timeline?.role) === role) : undefined;
  const teamKills = d.participants.filter((p) => p.teamId === me.teamId).reduce((s, p) => s + n(p.stats.kills), 0);
  const frame = (min: number) => t?.frames.find((f) => Math.round(f.timestamp / 60000) === min) ?? null;
  const at = (min: number, id?: number) => {
    const f = frame(min)?.participantFrames[String(id)];
    return f ? { gold: f.totalGold, cs: f.minionsKilled + f.jungleMinionsKilled } : null;
  };
  const me10 = at(10, me.participantId);
  const op10 = opp ? at(10, opp.participantId) : null;
  const me15 = at(15, me.participantId);
  const op15 = opp ? at(15, opp.participantId) : null;
  const k = n(me.stats.kills);
  const a = n(me.stats.assists);
  return {
    gameId: m.gameId,
    queueId: m.queueId,
    createdAt: m.gameCreation,
    duration: d.gameDuration ?? m.gameDuration,
    championId: me.championId,
    opponentId: opp?.championId ?? null,
    role,
    win: !!me.stats.win,
    remake: (d.gameDuration ?? m.gameDuration) < 300,
    k,
    d: n(me.stats.deaths),
    a,
    kp: teamKills ? (k + a) / teamKills : 0,
    cs: n(me.stats.totalMinionsKilled) + n(me.stats.neutralMinionsKilled),
    gold: n(me.stats.goldEarned),
    damage: n(me.stats.totalDamageDealtToChampions),
    vision: n(me.stats.visionScore),
    cs10: me10?.cs ?? null,
    gd10: me10 && op10 ? me10.gold - op10.gold : null,
    gd15: me15 && op15 ? me15.gold - op15.gold : null,
    csd10: me10 && op10 ? me10.cs - op10.cs : null,
    src: "lcu",
  };
}

// --------- Synchronisation ---------

let running: Promise<RankedRecord[]> | null = null;
let importing = false;

/** Sauvegarde les parties classées que le client a encore et qui ne sont pas déjà archivées. */
export function syncArchive(puuid?: string): Promise<RankedRecord[]> {
  if (importing) return loadRecords();
  return (running ??= (async () => {
    const stored = await get<RankedRecord[]>("index", "ranked").then((r) => r ?? []);
    const records = unique(stored);
    const cleaned = records.length !== stored.length;
    const known = new Set(records.map((r) => r.gameId));
    const games = new Map<number, Match>();
    // Le client garde une centaine de parties au plus : on lit par pages de 20.
    // Certains clients renvoient toujours la même page : on s'arrête dès qu'une page n'apporte rien de neuf.
    for (let beg = 0; beg < 100; beg += 20) {
      const page = await lcu<MatchHistory>("GET", `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=${beg}&endIndex=${beg + 19}`).catch(() => null);
      const list = page?.games.games ?? [];
      const fresh = list.filter((g) => !games.has(g.gameId));
      fresh.forEach((g) => games.set(g.gameId, g));
      if (list.length < 20 || fresh.length === 0 || list.some((g) => known.has(g.gameId))) break;
    }
    const todo = [...games.values()].filter((g) => RANKED_QUEUES.includes(g.queueId) && !known.has(g.gameId));
    for (const m of todo) {
      const d = await lcu<GameDetail>("GET", `/lol-match-history/v1/games/${m.gameId}`).catch(() => null);
      if (!d?.participants?.length) continue;
      const t = await lcu<Timeline>("GET", `/lol-match-history/v1/game-timelines/${m.gameId}`).catch(() => null);
      await put("game", String(m.gameId), d);
      if (t?.frames?.length) await put("timeline", String(m.gameId), t);
      records.push(buildRecord(m, d, t?.frames?.length ? t : null, puuid));
    }
    records.sort((a, b) => b.createdAt - a.createdAt);
    if (todo.length || cleaned) await put("index", "ranked", unique(records));
    return records;
  })().finally(() => (running = null)));
}

/** Note le rang de chaque file classée quand il change, pour tracer la courbe de LP. */
export async function recordLp(ranked: RankedStats | null) {
  if (!ranked) return;
  const points = await loadLp();
  let changed = false;
  for (const [queue, q] of Object.entries(ranked.queueMap) as [string, RankedQueue | undefined][]) {
    if (!q || !q.tier || !["RANKED_SOLO_5x5", "RANKED_FLEX_SR"].includes(queue)) continue;
    const last = [...points].reverse().find((p) => p.queue === queue);
    if (last && last.tier === q.tier && last.division === q.division && last.lp === q.leaguePoints && last.wins + last.losses === q.wins + q.losses) continue;
    points.push({ t: Date.now(), queue, tier: q.tier, division: q.division, lp: q.leaguePoints, wins: q.wins, losses: q.losses });
    changed = true;
  }
  if (changed) await put("index", "lp", points.slice(-2000));
}

// Échelle continue pour la courbe : Fer IV 0 LP = 0, chaque division vaut 100.
const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const DIVS = ["IV", "III", "II", "I"];
/** Inverse de lpScore : rang et LP pour un score. */
export function scoreToRank(score: number): { tier: string; division: string; lp: number } {
  if (score >= 2800) return { tier: "MASTER", division: "NA", lp: Math.round(score - 2800) };
  const s = Math.max(0, score);
  const t = Math.floor(s / 400);
  const d = Math.floor((s % 400) / 100);
  return { tier: TIERS[t], division: DIVS[d], lp: Math.round(s % 100) };
}

/**
 * Courbe de LP reconstituée : on part du premier rang noté par NIXUS et on remonte partie par partie
 * (victoire : −gain, défaite : +perte). Avec les LP de départ connus, le gain moyen est calé dessus.
 */
export function estimateLp(records: RankedRecord[], real: LpPoint[], queueId: number, queue: string, since: number, startLp?: number | null): LpPoint[] {
  const pts = real.filter((p) => p.queue === queue).sort((a, b) => a.t - b.t);
  const anchor = pts[0];
  if (!anchor) return pts;
  const before = records.filter((r) => r.queueId === queueId && !r.remake && r.createdAt + r.duration * 1000 < anchor.t && r.createdAt >= since).sort((a, b) => b.createdAt - a.createdAt);
  if (!before.length) return pts;
  const end = lpScore(anchor);
  const wins = before.filter((r) => r.win).length;
  const losses = before.length - wins;
  let gain = 20;
  let loss = 20;
  if (startLp != null && wins !== losses) {
    const startScore = end >= 2800 && startLp >= 0 ? 2800 + startLp : startLp;
    const x = (end - startScore) / (wins - losses);
    if (x >= 5 && x <= 45) gain = loss = x;
  }
  let score = end;
  const out: LpPoint[] = [];
  for (const r of before) {
    // Rang juste après cette partie, puis on revient avant elle.
    out.push({ est: true, t: r.createdAt + r.duration * 1000, queue, ...scoreToRank(score), wins: 0, losses: 0 });
    score -= r.win ? gain : -loss;
  }
  out.push({ est: true, t: before[before.length - 1].createdAt, queue, ...scoreToRank(score), wins: 0, losses: 0 });
  return [...out.reverse(), ...pts];
}

export function lpScore(p: { tier: string; division: string; lp: number }) {
  const t = TIERS.indexOf(p.tier);
  if (t >= 7) return 2800 + p.lp; // Maître et plus : les LP continuent sans division
  return t * 400 + Math.max(DIVS.indexOf(p.division), 0) * 100 + p.lp;
}

/** Démo navigateur : un mois de parties classées inventées, pour voir la page Grind remplie. */
export async function seedDemo() {
  if (isDesktop || (await loadRecords()).length > 10) return;
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const champs = [64, 64, 64, 517, 254, 141, 5, 64, 517, 254];
  // Adversaires du mode démo : on retrouve ceux de la draft simulée (Kha'Zix, Darius, Zed, Jinx) pour voir les duels.
  const opps = [121, 122, 238, 222, 121, 203, 104, 11];
  const records: RankedRecord[] = [];
  const lp: LpPoint[] = [];
  let score = 2050; // Émeraude II 50 LP
  let t = Date.now() - 28 * 86400000;
  for (let i = 0; i < 60; i++) {
    t += (0.2 + r() * 0.9) * 86400000 * 0.45;
    if (t > Date.now() - 3600000) break;
    const win = r() < 0.56;
    score += win ? 18 + Math.round(r() * 6) : -(16 + Math.round(r() * 6));
    const duration = 1500 + Math.round(r() * 900);
    const k = Math.round(r() * (win ? 11 : 6));
    const d = Math.round(1 + r() * (win ? 4 : 8));
    const a = Math.round(r() * 12);
    const gd15 = Math.round((r() - (win ? 0.3 : 0.65)) * 3000);
    records.push({
      gameId: 8000 + i,
      queueId: r() < 0.85 ? 420 : 440,
      createdAt: t,
      duration,
      championId: champs[Math.floor(r() * champs.length)],
      opponentId: opps[Math.floor(r() * opps.length)],
      role: r() < 0.85 ? "JUNGLE" : "MIDDLE",
      win,
      remake: false,
      k,
      d,
      a,
      kp: 0.45 + r() * 0.35,
      cs: Math.round((duration / 60) * (5.4 + r() * 1.6)),
      gold: Math.round((duration / 60) * (390 + r() * 90)),
      damage: Math.round((duration / 60) * (650 + r() * 500)),
      vision: Math.round((duration / 60) * (0.9 + r() * 0.6)),
      cs10: Math.round(52 + r() * 22),
      gd10: Math.round(gd15 * 0.6),
      gd15,
      csd10: Math.round((r() - 0.45) * 24),
    });
    const tier = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"][Math.floor(score / 400)] ?? "DIAMOND";
    lp.push({ t: t + duration * 1000, queue: "RANKED_SOLO_5x5", tier, division: ["IV", "III", "II", "I"][Math.floor((score % 400) / 100)], lp: score % 100, wins: 100 + i, losses: 80 });
  }
  records.sort((a, b) => b.createdAt - a.createdAt);
  await put("index", "ranked", records);
  await put("index", "lp", lp);
}

// --------- Import des SoloQ depuis l'API Riot ---------

/* eslint-disable @typescript-eslint/no-explicit-any */
const POS: Record<string, { lane: string; role: string }> = {
  TOP: { lane: "TOP", role: "SOLO" },
  JUNGLE: { lane: "JUNGLE", role: "NONE" },
  MIDDLE: { lane: "MIDDLE", role: "SOLO" },
  BOTTOM: { lane: "BOTTOM", role: "DUO_CARRY" },
  UTILITY: { lane: "BOTTOM", role: "DUO_SUPPORT" },
};

/** Convertit une partie de l'API Riot (match-v5) au format du client, utilisé partout dans NIXUS. */
export function fromRiot(match: any): GameDetail {
  const info = match.info;
  const obj = (t: any, k: string) => n(t.objectives?.[k]?.kills);
  return {
    gameId: info.gameId,
    gameCreation: info.gameCreation ?? info.gameStartTimestamp,
    gameDuration: info.gameDuration,
    queueId: info.queueId,
    participants: info.participants.map((p: any) => ({
      participantId: p.participantId,
      teamId: p.teamId,
      championId: p.championId,
      spell1Id: p.summoner1Id,
      spell2Id: p.summoner2Id,
      timeline: POS[p.teamPosition || p.individualPosition] ?? { lane: "NONE", role: "NONE" },
      stats: {
        win: p.win,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        champLevel: p.champLevel,
        goldEarned: p.goldEarned,
        totalDamageDealtToChampions: p.totalDamageDealtToChampions,
        totalDamageTaken: p.totalDamageTaken,
        totalMinionsKilled: p.totalMinionsKilled,
        neutralMinionsKilled: p.neutralMinionsKilled,
        visionScore: p.visionScore,
        wardsPlaced: p.wardsPlaced,
        wardsKilled: p.wardsKilled,
        visionWardsBoughtInGame: p.visionWardsBoughtInGame,
        largestMultiKill: p.largestMultiKill,
        item0: p.item0,
        item1: p.item1,
        item2: p.item2,
        item3: p.item3,
        item4: p.item4,
        item5: p.item5,
        item6: p.item6,
        perk0: p.perks?.styles?.[0]?.selections?.[0]?.perk ?? 0,
        perkSubStyle: p.perks?.styles?.[1]?.style ?? 0,
      },
    })),
    participantIdentities: info.participants.map((p: any) => ({
      participantId: p.participantId,
      player: { puuid: p.puuid, gameName: p.riotIdGameName ?? p.summonerName, tagLine: p.riotIdTagline, summonerName: p.summonerName },
    })),
    teams: info.teams.map((t: any) => ({
      teamId: t.teamId,
      win: t.win ? "Win" : "Fail",
      baronKills: obj(t, "baron"),
      dragonKills: obj(t, "dragon"),
      riftHeraldKills: obj(t, "riftHerald"),
      hordeKills: obj(t, "horde"),
      towerKills: obj(t, "tower"),
      inhibitorKills: obj(t, "inhibitor"),
      bans: (t.bans ?? []).map((b: any) => ({ championId: b.championId })),
    })),
  } as GameDetail;
}

/** La timeline Riot (match-v5) a déjà la forme de celle du client : on garde frames et événements. */
const timelineFromRiot = (t: any): Timeline | null => (t?.info?.frames?.length ? { frames: t.info.frames } : null);

const riot = <T,>(path: string, key: string, region: string) => invoke<T>("riot_get", { region, path, key });

/** Message clair pour les erreurs de l'API Riot. */
export function riotError(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  if (m === "NO_KEY") return "Ajoute ta clé API Riot dans les Paramètres.";
  const detail = m.startsWith("HTTP") ? ` (détail : ${m})` : "";
  if (m.includes("HTTP 401")) return `Riot ne reçoit pas de clé valide. Recolle-la dans les Paramètres${detail}.`;
  if (m.includes("HTTP 403")) return `Clé API refusée par Riot : expirée, mal copiée ou pas autorisée pour cet appel. Une clé de développement dure 24 h${detail}.`;
  if (m.includes("HTTP 404")) return `Compte introuvable dans cette région. Vérifie la région dans les Paramètres${detail}.`;
  if (m.includes("HTTP 429")) return "L'API Riot demande de ralentir. Relance dans deux minutes.";
  if (m.startsWith("NETWORK")) return "Impossible de joindre l'API Riot. Vérifie ta connexion.";
  return m;
}

/** Vérifie la clé et renvoie le puuid du compte pour cette clé (il diffère de celui du client). */
export async function riotAccount(gameName: string, tagLine: string, key: string, region: string): Promise<string> {
  const accountRegion = region === "sea" ? "asia" : region;
  const a = await riot<{ puuid: string }>(`/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`, key, accountRegion);
  return a.puuid;
}

export interface ImportReport {
  found: number;
  imported: number;
  removed: number;
  failed: number;
}

export interface RiotImportOptions {
  gameName: string;
  tagLine: string;
  key: string;
  region: string;
  /** Début de l'import, en ms. */
  since: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Importe toutes les SoloQ (file 420) depuis `since` via l'API Riot, avec leur timeline.
 * Les fiches des anciennes versions (dont l'import Challenger, parfois faux) sont retirées ;
 * celles déjà importées depuis Riot sont gardées telles quelles.
 */
export async function importRiot(o: RiotImportOptions): Promise<ImportReport> {
  if (!isDesktop) throw new Error("L'import Riot ne marche que dans l'appli NIXUS.");
  if (importing) throw new Error("Un import est déjà en cours.");
  importing = true;
  try {
    await running?.catch(() => {});
    return await runRiotImport(o);
  } finally {
    importing = false;
  }
}

async function runRiotImport({ gameName, tagLine, key, region, since, onProgress }: RiotImportOptions): Promise<ImportReport> {
  const puuid = await riotAccount(gameName, tagLine, key, region);
  const ids: string[] = [];
  const start = Math.floor(since / 1000);
  for (let at = 0; at < 1000; at += 100) {
    const page = await riot<string[]>(`/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&type=ranked&startTime=${start}&start=${at}&count=100`, key, region);
    ids.push(...page);
    if (page.length < 100) break;
  }
  const wanted = new Set(ids.map((id) => Number(id.split("_")[1])));
  const all = await loadRecords();
  // On retire les anciennes fiches (sans source) : elles viennent de Challenger ou d'une version d'avant.
  const records = all.filter((r) => r.src);
  const removed = all.length - records.length;
  const known = new Set(records.filter((r) => r.src === "riot").map((r) => r.gameId));
  const todo = ids.filter((id) => !known.has(Number(id.split("_")[1])));
  // Une fiche du client pour une partie que Riot va réimporter : la version Riot la remplace.
  const replace = new Set(todo.map((id) => Number(id.split("_")[1])));
  let kept = records.filter((r) => !replace.has(r.gameId));
  let imported = 0;
  let failed = 0;
  for (const [i, id] of todo.entries()) {
    onProgress?.(i, todo.length);
    try {
      const match = await riot<any>(`/lol/match/v5/matches/${id}`, key, region);
      if (match?.info?.queueId !== 420) continue;
      const tl = await riot<any>(`/lol/match/v5/matches/${id}/timeline`, key, region).catch(() => null);
      const d = fromRiot(match);
      const t = timelineFromRiot(tl);
      const me = match.info.participants.find((p: any) => p.puuid === puuid);
      if (!me) {
        failed++;
        continue;
      }
      const m: Match = {
        gameId: d.gameId,
        gameCreation: d.gameCreation,
        gameDuration: d.gameDuration,
        queueId: d.queueId,
        participants: [{ championId: me.championId, stats: { kills: me.kills, deaths: me.deaths, assists: me.assists, win: !!me.win } }],
      };
      await put("game", String(d.gameId), d);
      if (t) await put("timeline", String(d.gameId), t);
      kept.push({ ...buildRecord(m, d, t, puuid), src: "riot" });
      imported++;
      if (imported % 20 === 0) await put("index", "ranked", unique(kept).sort((a, b) => b.createdAt - a.createdAt));
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes("HTTP 401") || msg.includes("HTTP 403")) {
        await put("index", "ranked", unique(kept).sort((a, b) => b.createdAt - a.createdAt));
        throw e;
      }
      failed++;
    }
  }
  onProgress?.(todo.length, todo.length);
  kept = unique(kept).sort((a, b) => b.createdAt - a.createdAt);
  await put("index", "ranked", kept);
  return { found: wanted.size, imported, removed, failed };
}
