import { snapshot } from "./archive";
import { gameAsset, isDesktop, lcu } from "./lcu";

/**
 * Events : le pass en cours, sa piste de récompenses, les récompenses à récupérer et les missions.
 * Les routes lol-event-hub ne sont pas encore vérifiées sur un vrai client. Tout est lu en douceur
 * (plusieurs noms de champs, aucune erreur bloquante) et la première lecture est notée dans archive/debug.
 * Seule écriture : « Tout récupérer » (claim-all), sur demande du joueur.
 */

export interface GameEvent {
  id: string;
  name: string;
  start?: string;
  end?: string;
  icon?: string;
  tokens?: number;
  passOwned?: boolean;
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
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const date = (v: unknown) => str(v) ?? (num(v) ? new Date(num(v)!).toISOString() : undefined);
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
    name: str(info.eventName) ?? str(info.name) ?? str(info.title) ?? "Event",
    start: date(info.startDate ?? info.start),
    end: date(info.endDate ?? info.end ?? info.progressEndDate),
    icon: icon(info.eventIcon ?? info.eventIconPath ?? info.iconPath ?? info.backgroundImage),
    tokens: num(info.currentTokenBalance ?? info.tokenBalance),
    passOwned: typeof info.isPassPurchased === "boolean" ? info.isPassPurchased : undefined,
  };
}

export function normalizeReward(r: Raw): Reward {
  const opts = (Array.isArray(r.rewardOptions) ? r.rewardOptions : []) as Raw[];
  const opt = opts.find((o) => o.selected) ?? opts[0] ?? r;
  const state = String(r.state ?? r.status ?? "").toLowerCase();
  return {
    name: str(opt.rewardName) ?? str(opt.name) ?? str(opt.title) ?? "Récompense",
    icon: icon(opt.thumbIconPath ?? opt.iconPath ?? opt.splashImagePath),
    threshold: num(r.threshold) ?? num(r.level) ?? num(r.progressRequired),
    state: /claimed|selected|owned|granted/.test(state) ? "claimed" : /unlock|available|ready|unclaim/.test(state) ? "ready" : "locked",
  };
}

export function normalizeMission(r: Raw): Mission | null {
  const id = str(r.id) ?? str(r.missionId);
  if (!id) return null;
  const objectives = (Array.isArray(r.objectives) ? r.objectives : []) as Raw[];
  const prog = (objectives[0]?.progress ?? r.progress ?? {}) as Raw;
  const total = num(prog.totalCount) ?? num(prog.total) ?? 1;
  const current = Math.min(num(prog.currentProgress) ?? num(prog.current) ?? 0, total);
  const status = String(r.status ?? "").toLowerCase();
  const rewards = (Array.isArray(r.rewards) ? r.rewards : []) as Raw[];
  return {
    id,
    title: str(r.title) ?? str(r.internalName) ?? "Mission",
    description: str(r.description) ?? str(objectives[0]?.description),
    current,
    total,
    done: status === "completed" || current >= total,
    end: date(r.endTime ?? r.expires),
    reward: str(rewards[0]?.description) ?? str(rewards[0]?.name),
  };
}

let snapped = false;

export interface EventsData {
  events: GameEvent[];
  track: Track | null;
  missions: Mission[];
}

/** Charge l'event principal, sa piste et les missions en cours. Chaque partie peut manquer sans tout casser. */
export async function loadEvents(): Promise<EventsData> {
  if (!isDesktop) return mockEvents();
  const rawEvents = await get<Raw[] | Raw>("/lol-event-hub/v1/events").catch(() => null);
  const list = (Array.isArray(rawEvents) ? rawEvents : rawEvents && typeof rawEvents === "object" ? Object.values(rawEvents) : []) as Raw[];
  const events = list.map(normalizeEvent).filter((e): e is GameEvent => !!e);
  const main = events[0];
  let track: Track | null = null;
  if (main) {
    const base = `/lol-event-hub/v1/events/${encodeURIComponent(main.id)}/reward-track`;
    const [items, progress, unclaimed] = await Promise.all([get<Raw[]>(`${base}/items`).catch(() => null), get<Raw>(`${base}/progress`).catch(() => null), get<Raw | number>(`${base}/unclaimed-rewards`).catch(() => null)]);
    const rewards = (Array.isArray(items) ? items : []).map(normalizeReward);
    const count = typeof unclaimed === "number" ? unclaimed : num((unclaimed as Raw | null)?.rewardsCount) ?? num((unclaimed as Raw | null)?.count);
    track = {
      level: num(progress?.currentLevel) ?? num(progress?.level),
      xp: num(progress?.currentLevelXP) ?? num(progress?.levelProgress),
      xpNeeded: num(progress?.nextLevelXP) ?? num(progress?.levelXpRequired),
      rewards,
      unclaimed: count ?? rewards.filter((r) => r.state === "ready").length,
    };
  }
  const rawMissions = await get<Raw[]>("/lol-missions/v1/missions").catch(() => null);
  const missions = (Array.isArray(rawMissions) ? rawMissions : [])
    .map(normalizeMission)
    .filter((m): m is Mission => !!m && (!m.end || new Date(m.end).getTime() > Date.now()))
    .sort((a, b) => Number(a.done) - Number(b.done));

  if (!snapped) {
    snapped = true;
    const extra: Record<string, unknown> = { events: rawEvents, missionsSample: Array.isArray(rawMissions) ? rawMissions.slice(0, 3) : rawMissions };
    const paths = main ? [`/lol-event-hub/v1/events/${encodeURIComponent(main.id)}/reward-track/progress`, `/lol-event-hub/v1/events/${encodeURIComponent(main.id)}/reward-track/unclaimed-rewards`, `/lol-event-hub/v1/events/${encodeURIComponent(main.id)}/reward-track/items`] : [];
    snapshot("events", paths, extra).catch(() => {});
  }
  return { events, track, missions };
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

function mockEvents(): EventsData {
  const now = Date.now();
  const names = ["Icône de l'event", "Émote « Tranquille »", "Coffre Hextech", "Orbe de l'event", "Bordure de profil", "250 essences orange", "Fragment de skin", "Balise de l'event", "Coffre Hextech", "Titre « Gardien des neiges »", "Skin prestige (fragment)", "Icône animée"];
  const level = 7;
  return {
    events: [{ id: "demo-hiver", name: "Hiver féérique", start: new Date(now - 9 * 86400_000).toISOString(), end: new Date(now + 26 * 86400_000).toISOString(), tokens: 340, passOwned: false }],
    track: {
      level,
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
