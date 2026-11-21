import { snapshot } from "./archive";
import { gameAsset, isDesktop, lcu } from "./lcu";

/**
 * Events : le pass en cours, sa piste de récompenses, les récompenses à récupérer et les missions.
 * Formes vérifiées sur le client (11/2026) :
 * - /lol-event-hub/v1/events : [{eventId, eventInfo: {eventName, eventType, isPassPurchased, unclaimedRewardCount, …}}].
 *   Le premier de la liste peut être un pass vide (récompenses « Placeholder ») ; les eventType
 *   kActivityCenterMilestones (niveau de joueur, pouvoir de vote) ne sont pas des passes.
 * - reward-track/items : `state` de l'objet vaut toujours « Locked » ; le vrai état est rewardOptions[].state
 *   (« Selected » = obtenue). `threshold` est une chaîne.
 * - reward-track/progress : {level, currentLevelXP, totalLevelXP, totalLevels} ; valeurs aberrantes possibles.
 * - chapters / token-shop : 404 pour la plupart des events, c'est normal.
 * Seule écriture : « Tout récupérer » (claim-all), sur demande du joueur.
 */

export interface GameEvent {
  id: string;
  name: string;
  type?: string;
  start?: string;
  end?: string;
  icon?: string;
  tokens?: number;
  passOwned?: boolean;
  unclaimed?: number;
}

export interface Reward {
  name: string;
  icon?: string;
  /** Niveau ou nombre de points pour l'obtenir. */
  threshold?: number;
  state: "claimed" | "ready" | "locked";
}

export interface Track {
  level?: number;
  /** Nombre de paliers de la piste ; au-delà, c'est la phase bonus. */
  levels?: number;
  xp?: number;
  xpNeeded?: number;
  rewards: Reward[];
  unclaimed: number;
}

export interface Mission {
  id: string;
  title: string;
  description?: string;
  current: number;
  total: number;
  done: boolean;
  end?: string;
  reward?: string;
}

type Raw = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const date = (v: unknown) => str(v) ?? (num(v) ? new Date(num(v)!).toISOString() : undefined);
/** Nombre plausible (le client renvoie parfois 4294967295 ou -1). */
const sane = (v: unknown) => {
  const n = num(v);
  return n !== undefined && n >= 0 && n < 1_000_000 ? n : undefined;
};
const icon = (v: unknown) => {
  const s = str(v);
  if (!s) return undefined;
  return s.startsWith("http") ? s : s.startsWith("/lol-game-data/") ? gameAsset(s) : undefined;
};
const get = <T,>(p: string) => lcu<T>("GET", p);

export function normalizeEvent(r: Raw): GameEvent | null {
  const info = (r.eventInfo ?? r) as Raw;
  const id = str(r.eventId) ?? str(info.eventId) ?? str(r.id);
  if (!id) return null;
  return {
    id,
    name: str(info.eventName) ?? str(info.localizedShortName) ?? str(info.name) ?? "Event",
    type: str(info.eventType),
    start: date(info.startDate),
    end: date(info.progressEndDate ?? info.endDate),
    icon: icon(info.eventIcon ?? info.navBarIcon ?? info.localizedLogo),
    tokens: sane(info.currentTokenBalance),
    passOwned: typeof info.isPassPurchased === "boolean" ? info.isPassPurchased : undefined,
    unclaimed: sane(info.unclaimedRewardCount),
  };
}

export function normalizeReward(r: Raw, level?: number): Reward {
  const opts = (Array.isArray(r.rewardOptions) ? r.rewardOptions : []) as Raw[];
  const opt = opts.find((o) => String(o.state).toLowerCase() === "selected") ?? opts.find((o) => o.selected) ?? opts[0] ?? r;
  const threshold = num(r.threshold) ?? num(r.progressRequired);
  const owned = opts.some((o) => String(o.state).toLowerCase() === "selected") || /claimed|owned|granted/.test(String(r.state ?? "").toLowerCase());
  return {
    name: str(opt.rewardName) ?? str(opt.name) ?? "Récompense",
    icon: icon(opt.thumbIconPath ?? opt.splashImagePath),
    threshold,
    state: owned ? "claimed" : level !== undefined && threshold !== undefined && level >= threshold ? "ready" : "locked",
  };
}

export function normalizeMission(r: Raw): Mission | null {
  const id = str(r.id) ?? (num(r.id) !== undefined ? String(r.id) : undefined);
  if (!id) return null;
  const objectives = (Array.isArray(r.objectives) ? r.objectives : []) as Raw[];
  const prog = (objectives[0]?.progress ?? {}) as Raw;
  const total = Math.max(1, num(prog.totalCount) ?? 1);
  const current = Math.min(num(prog.currentProgress) ?? 0, total);
  const status = String(r.status ?? "").toLowerCase();
  const title = str(r.title) ?? str(r.missionLineText) ?? str(r.helperText);
  const description = str(r.description) ?? str(objectives[0]?.description);
  if (!title && !description) return null;
  return {
    id,
    title: title ?? description!,
    description: title && description !== title ? description : undefined,
    current,
    total,
    done: status === "completed" || !!num(r.completedDate) || current >= total,
    end: num(r.endTime) ? new Date(num(r.endTime)!).toISOString() : str(r.endTime),
  };
}

/** Events affichables : les passes, sans les compteurs (niveau de joueur, vote) ; d'abord ce qui a une récompense en attente. */
function rank(events: GameEvent[]) {
  return events
    .filter((e) => e.type !== "kActivityCenterMilestones")
    .sort((a, b) => (b.unclaimed ?? 0) - (a.unclaimed ?? 0) || Number(!!b.passOwned) - Number(!!a.passOwned));
}

let snapped = false;

export interface EventsData {
  events: GameEvent[];
  /** Event affiché. */
  current: GameEvent | null;
  track: Track | null;
  missions: Mission[];
}

async function loadTrack(ev: GameEvent): Promise<Track | null> {
  const base = `/lol-event-hub/v1/events/${encodeURIComponent(ev.id)}/reward-track`;
  const [items, progress, unclaimed] = await Promise.all([
    get<Raw[]>(`${base}/items`).catch(() => null),
    get<Raw>(`${base}/progress`).catch(() => null),
    get<Raw>(`${base}/unclaimed-rewards`).catch(() => null),
  ]);
  const level = sane(progress?.level);
  const rewards = (Array.isArray(items) ? items : []).map((r) => normalizeReward(r, level));
  // Pass vide (récompenses de test non traduites) : rien à montrer.
  if (rewards.length && rewards.every((r) => /placeholder/i.test(r.name))) return null;
  if (!rewards.length && !progress) return null;
  return {
    level,
    levels: sane(progress?.totalLevels),
    xp: sane(progress?.currentLevelXP),
    xpNeeded: sane(progress?.totalLevelXP),
    rewards,
    unclaimed: sane(unclaimed?.rewardsCount) ?? ev.unclaimed ?? 0,
  };
}

/** Charge les events, la piste de l'event choisi (ou du plus utile) et les missions en cours. Rien n'est bloquant. */
export async function loadEvents(eventId?: string): Promise<EventsData> {
  if (!isDesktop) return mockEvents(eventId);
  const rawEvents = await get<Raw[]>("/lol-event-hub/v1/events").catch((e) => {
    snapshot("events-failed", [], { error: String((e as Error)?.message ?? e) }).catch(() => {});
    return null;
  });
  const all = rank((Array.isArray(rawEvents) ? rawEvents : []).map(normalizeEvent).filter((e): e is GameEvent => !!e));

  // On garde les events qui ont vraiment une piste ; l'event demandé passe en premier.
  const events: GameEvent[] = [];
  let current: GameEvent | null = null;
  let track: Track | null = null;
  const wanted = all.find((e) => e.id === eventId);
  for (const ev of wanted ? [wanted, ...all.filter((e) => e !== wanted)] : all) {
    if (current) {
      events.push(ev);
      continue;
    }
    const t = await loadTrack(ev).catch(() => null);
    if (t) {
      current = ev;
      track = t;
      events.push(ev);
    }
  }
  events.sort((a, b) => all.indexOf(a) - all.indexOf(b));

  const rawMissions = await get<Raw[]>("/lol-missions/v1/missions").catch(() => null);
  const now = Date.now();
  const missions = (Array.isArray(rawMissions) ? rawMissions : [])
    .map((r) => {
      try {
        return normalizeMission(r);
      } catch {
        return null;
      }
    })
    .filter((m): m is Mission => !!m && !m.done && (!m.end || new Date(m.end).getTime() > now))
    .sort((a, b) => (a.end ? new Date(a.end).getTime() : Infinity) - (b.end ? new Date(b.end).getTime() : Infinity))
    .slice(0, 12);

  if (!snapped) {
    snapped = true;
    snapshot("events", [], { current: current?.id, events: all.map((e) => [e.id, e.name, e.type, e.unclaimed]), missions: missions.length }).catch(() => {});
  }
  return { events, current, track, missions };
}

/** Récupère toutes les récompenses débloquées du pass. */
export async function claimAll(eventId: string) {
  if (!isDesktop) {
    demoClaimed = true;
    return;
  }
  const path = `/lol-event-hub/v1/events/${encodeURIComponent(eventId)}/reward-track/claim-all`;
  try {
    await lcu("POST", path);
  } catch (e) {
    snapshot("events-claim-failed", [], { path, error: String((e as Error)?.message ?? e) }).catch(() => {});
    throw e;
  }
}

/* ---------- Démo ---------- */

let demoClaimed = false;

function mockEvents(eventId?: string): EventsData {
  const now = Date.now();
  const events: GameEvent[] = [
    { id: "demo-hiver", name: "Hiver féérique", start: new Date(now - 9 * 86400_000).toISOString(), end: new Date(now + 26 * 86400_000).toISOString(), tokens: 340, passOwned: false, unclaimed: demoClaimed ? 0 : 3 },
    { id: "demo-etoile", name: "En route vers la gloire", end: new Date(now + 12 * 86400_000).toISOString() },
  ];
  if (eventId === "demo-etoile")
    return { events, current: events[1], track: { level: 1, levels: 10, rewards: ["Icône", "Émote", "Coffre"].map((name, i) => ({ name, threshold: i + 1, state: i ? "locked" : "claimed" })), unclaimed: 0 }, missions: [] };
  const names = ["Icône de l'event", "Émote « Tranquille »", "Coffre Hextech", "Orbe de l'event", "Bordure de profil", "250 essences orange", "Fragment de skin", "Balise de l'event", "Coffre Hextech", "Titre « Gardien des neiges »", "Skin prestige (fragment)", "Icône animée"];
  const level = 7;
  return {
    events,
    current: events[0],
    track: {
      level,
      levels: 12,
      xp: 420,
      xpNeeded: 1000,
      rewards: names.map((name, i) => ({ name, threshold: i + 1, state: i + 1 <= level ? (demoClaimed || i < 4 ? "claimed" : "ready") : "locked" })),
      unclaimed: demoClaimed ? 0 : level - 4,
    },
    missions: [
      { id: "m1", title: "Premiers flocons", description: "Joue 3 parties de n'importe quel mode.", current: 3, total: 3, done: true, reward: "+200 XP du pass" },
      { id: "m2", title: "Esprit d'équipe", description: "Participe à 25 éliminations sur la Faille.", current: 17, total: 25, done: false, reward: "+300 XP du pass" },
      { id: "m3", title: "Vision d'hiver", description: "Place 30 balises.", current: 8, total: 30, done: false, reward: "Coffre Hextech" },
      { id: "m4", title: "Victoire au chaud", description: "Gagne 2 parties classées.", current: 1, total: 2, done: false, reward: "+250 XP du pass", end: new Date(now + 2 * 86400_000).toISOString() },
    ],
  };
}
