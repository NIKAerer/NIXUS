import { getSettings } from "./settings";
import { invoke } from "@tauri-apps/api/core";
import { mockRequest } from "./mock";

/** Vrai quand l'interface tourne dans l'app Tauri (sinon : navigateur, données de démo). */
export const isDesktop = "__TAURI_INTERNALS__" in window;

export interface LcuStatus {
  connected: boolean;
  port: number | null;
}

export async function lcuStatus(): Promise<LcuStatus> {
  if (!isDesktop) return { connected: true, port: null };
  return invoke<LcuStatus>("lcu_status");
}

export async function lcu<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!isDesktop) return mockRequest(method, path, body) as T;
  return invoke<T>("lcu_request", { method, path, body: body ?? null });
}

export const QUEUES = [
  { id: 420, label: "Classé Solo/Duo", short: "Solo/Duo", blurb: "Grimpe le classement en solo ou en duo." },
  { id: 440, label: "Classé Flex", short: "Flex", blurb: "Classé en groupe, de 1 à 5 joueurs." },
  { id: 400, label: "Normal Draft", short: "Draft", blurb: "Sélection avec bannissements, sans enjeu de rang." },
  { id: 450, label: "ARAM", short: "ARAM", blurb: "Une seule voie, champions aléatoires, combats non-stop." },
  { id: 1700, label: "Arena", short: "Arena", blurb: "Duels en équipes de deux, augments et rounds rapides." },
] as const;

// Noms des files fournis par le client (toutes les files, y compris les modes temporaires).
const liveQueueNames = new Map<number, string>();
export function setQueueNames(list: { id: number; name: string; description?: string }[]) {
  for (const q of list) if (q.name || q.description) liveQueueNames.set(q.id, q.name || q.description!);
}

export const queueName = (id: number) =>
  QUEUES.find((q) => q.id === id)?.label ??
  liveQueueNames.get(id) ??
  ({ 430: "Normal Blind", 490: "Partie rapide", 900: "URF", 0: "Personnalisée", 3140: "Entraînement" } as Record<number, string>)[id] ??
  "Partie";

// Les visuels viennent de CommunityDragon (CDN public des assets du jeu).
const CDN = "https://cdn.communitydragon.org/latest";
export const championSquare = (id: number) => `${CDN}/champion/${id}/square`;
const baseSplash = (id: number) => `${CDN}/champion/${id}/splash-art/centered`;

// Skins tirés au hasard : un par champion et par lancement de NIXUS, pour que l'image ne change pas à chaque rendu.
const skinPool = new Map<number, number[]>();
const pickedSkin = new Map<number, number>();

/** Reçoit la liste de tous les skins du jeu (id de skin = id du champion × 1000 + numéro). */
export function setSkinPool(skinIds: number[]) {
  skinPool.clear();
  pickedSkin.clear();
  deck.clear();
  for (const id of skinIds) {
    const champ = Math.floor(id / 1000);
    if (id % 1000 === 0) continue;
    const list = skinPool.get(champ) ?? [];
    list.push(id);
    skinPool.set(champ, list);
  }
}

function randomSkin(championId: number): number | null {
  if (pickedSkin.has(championId)) return pickedSkin.get(championId)!;
  const list = skinPool.get(championId);
  if (!list?.length) return null;
  // Le skin classique reste dans le tirage.
  const options = [championId * 1000, ...list];
  const skin = options[Math.floor(Math.random() * options.length)];
  pickedSkin.set(championId, skin);
  return skin;
}

/** Splash du champion, avec un de ses skins pris au hasard dès que la liste des skins est chargée. */
export const championSplash = (id: number) => {
  if (!getSettings().randomSkins) return baseSplash(id);
  const skin = randomSkin(id);
  return skin && skin % 1000 ? `${CDN}/champion/${id}/splash-art/centered/skin/${skin % 1000}` : baseSplash(id);
};
// Paquet mélangé par champion : chaque nouvelle tuile tire un skin différent jusqu'à épuisement du paquet.
const deck = new Map<number, number[]>();
export const skinPoolSize = () => skinPool.size;

/** Un skin au hasard à chaque appel (tuiles des dernières parties), sans répéter tant qu'il en reste. */
export function freshSplash(id: number) {
  const list = getSettings().randomSkins ? skinPool.get(id) : undefined;
  if (!list?.length) return baseSplash(id);
  let cards = deck.get(id);
  if (!cards?.length) {
    cards = [id * 1000, ...list].sort(() => Math.random() - 0.5);
    deck.set(id, cards);
  }
  return skinSplash(id, cards.pop()!);
}

/** Splash d'un skin précis : le numéro du skin, c'est son id moins 1000 × l'id du champion. */
export const skinSplash = (championId: number, skinId: number) =>
  skinId % 1000 === 0 ? baseSplash(championId) : `${CDN}/champion/${championId}/splash-art/centered/skin/${skinId % 1000}`;
export const profileIcon = (id: number) => `${CDN}/profile-icon/${id}`;

const TIERS: Record<string, string> = {
  IRON: "Fer",
  BRONZE: "Bronze",
  SILVER: "Argent",
  GOLD: "Or",
  PLATINUM: "Platine",
  EMERALD: "Émeraude",
  DIAMOND: "Diamant",
  MASTER: "Maître",
  GRANDMASTER: "Grand Maître",
  CHALLENGER: "Challenger",
};

export function rankLabel(tier?: string, division?: string) {
  if (!tier || tier === "NONE" || tier === "") return "Non classé";
  const name = TIERS[tier] ?? tier;
  return division && division !== "NA" ? `${name} ${division}` : name;
}

export function timeAgo(ms: number) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 60) return `il y a ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Image du client (/lol-game-data/assets/...) servie par CommunityDragon. */
export const gameAsset = (path?: string) =>
  path ? `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${path.replace(/^\/lol-game-data\/assets\//i, "").toLowerCase()}` : "";
