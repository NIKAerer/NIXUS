import { gameAsset, lcu } from "./lcu";

/** Objet du butin Hextech, tel que le renvoie /lol-loot/v1/player-loot (seuls les champs utilisés). */
export interface LootItem {
  lootId: string;
  lootName?: string;
  type?: string;
  displayCategories?: string;
  count: number;
  localizedName?: string;
  localizedDescription?: string;
  itemDesc?: string;
  disenchantValue?: number;
  disenchantLootName?: string;
  upgradeEssenceValue?: number;
  upgradeEssenceName?: string;
  tilePath?: string;
  storeItemId?: number;
  parentStoreItemId?: number;
  itemStatus?: string;
  parentItemStatus?: string;
  rarity?: string;
  expiryTime?: number;
}

export interface Recipe {
  recipeName: string;
  type?: string;
  contextMenuText?: string;
  description?: string;
  slots: { lootIds: string[]; quantity: number }[];
  outputs?: { lootName: string; quantity: number }[];
}

/** Réponse d'une fabrication : ce qui a été ajouté, consommé, échangé. */
export interface CraftResult {
  added?: { deltaCount: number; playerLoot: LootItem }[];
  redeemed?: { deltaCount: number; playerLoot: LootItem }[];
  removed?: { deltaCount: number; playerLoot: LootItem }[];
}

/* ---------- Monnaies ---------- */

export const ESSENCES = [
  { id: "CURRENCY_champion", name: "Essence bleue", short: "bleue", tone: "blue" },
  { id: "CURRENCY_cosmetic", name: "Essence orange", short: "orange", tone: "orange" },
  { id: "CURRENCY_mythic", name: "Essence mythique", short: "mythique", tone: "mythic" },
] as const;
export const KEY = "MATERIAL_key";
export const KEY_FRAGMENT = "MATERIAL_key_fragment";

const essence = (id?: string) => ESSENCES.find((e) => e.id === id);
export const isCurrency = (l: LootItem) => l.lootId.startsWith("CURRENCY_") || l.type === "CURRENCY";
export const essenceTone = (id?: string) => essence(id)?.tone ?? "blue";

/** Nombre à la française avec une espace insécable classique (la fine manque dans certaines polices). */
export const num = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/\s/g, "\u00a0");

/** « 1 260 essence bleue », « 1 clé », « 3 fragments de clé ». Jamais d'identifiant brut. */
export function amount(id: string, n: number) {
  const e = essence(id);
  const v = num(n);
  if (e) return `${v} essence ${e.short}`;
  if (id === KEY) return `${v} ${n > 1 ? "clés" : "clé"}`;
  if (id === KEY_FRAGMENT) return `${v} ${n > 1 ? "fragments" : "fragment"} de clé`;
  if (/^CHEST_/i.test(id)) return `${v} ${n > 1 ? "coffres" : "coffre"}`;
  return `${v} × ${humanize(id)}`;
}

/** Dernier recours pour un identifiant inconnu : « SKIN_RENTAL_12 » devient « Skin rental 12 ». */
export function humanize(id: string) {
  const s = id.replace(/^(CURRENCY|MATERIAL)_/, "").replace(/_/g, " ").toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------- Catégories ---------- */

export type Kind = "chest" | "champion" | "skin" | "cosmetic" | "other";
export const KINDS: [Kind, string][] = [
  ["chest", "Coffres et clés"],
  ["champion", "Champions"],
  ["skin", "Skins"],
  ["cosmetic", "Cosmétiques"],
  ["other", "Autres"],
];

export function kindOf(l: LootItem): Kind {
  const c = (l.displayCategories ?? "").toUpperCase();
  const t = (l.type ?? "").toUpperCase();
  if (c === "CHEST" || t === "CHEST" || /^(CHEST|MATERIAL)_/.test(l.lootId)) return "chest";
  if (c === "CHAMPION" || t.startsWith("CHAMPION")) return t.includes("SKIN") ? "skin" : "champion";
  if (c === "SKIN" || t.startsWith("SKIN")) return "skin";
  if (/WARD|EMOTE|SUMMONERICON|ICON|COMPANION|ETERNAL|STATSTONE/.test(c + " " + t)) return "cosmetic";
  return "other";
}

/** Un fragment se désenchante ou s'active ; un objet « permanent » se désenchante seulement. */
export const isShard = (l: LootItem) => /_RENTAL$/i.test(l.type ?? "") || /_RENTAL_/i.test(l.lootId);

/** Ce qu'est l'objet, en une ligne : « Fragment de champion », « Coffre », « Fragment de balise »… */
export function kindLabel(l: LootItem) {
  const t = (l.type ?? "").toUpperCase();
  const shard = isShard(l);
  if (l.lootId === KEY || l.lootId === KEY_FRAGMENT) return "Clé";
  if (/^CHEST_|CHEST/.test(l.lootId) || t === "CHEST") return /orb|capsule|bag/i.test(l.lootId + (l.localizedName ?? "")) ? "Récompense" : "Coffre";
  if (t.includes("SKIN") || l.displayCategories === "SKIN") return shard ? "Fragment de skin" : "Skin permanent";
  if (t.includes("CHAMPION") || l.displayCategories === "CHAMPION") return shard ? "Fragment de champion" : "Champion permanent";
  if (t.includes("WARD")) return shard ? "Fragment de balise" : "Balise permanente";
  if (t.includes("EMOTE")) return shard ? "Fragment d'émote" : "Émote";
  if (t.includes("ICON")) return shard ? "Fragment d'icône" : "Icône d'invocateur";
  if (t.includes("STATSTONE") || t.includes("ETERNAL")) return "Éternels";
  if (t.includes("COMPANION")) return "Petite Légende";
  if (t === "MATERIAL") return "Matériau";
  return "Objet";
}

const KNOWN_NAMES: Record<string, string> = {
  [KEY]: "Clé Hextech",
  [KEY_FRAGMENT]: "Fragment de clé",
  CHEST_generic: "Coffre Hextech",
  CHEST_champion_mastery: "Coffre de maîtrise",
  CHEST_224: "Coffre Hextech de maître",
};
export const lootName = (l: LootItem) => l.localizedName || KNOWN_NAMES[l.lootId] || l.itemDesc || (l.lootName && !/^[A-Z0-9_]+$/.test(l.lootName) ? l.lootName : "") || humanize(l.lootId);

/* ---------- Raretés ---------- */

const RARITY: Record<string, [string, number]> = {
  TRANSCENDENT: ["Transcendant", 7],
  EXALTED: ["Exalté", 6],
  ULTIMATE: ["Ultime", 5],
  MYTHIC: ["Mythique", 4],
  LEGENDARY: ["Légendaire", 3],
  EPIC: ["Épique", 2],
  RARE: ["Rare", 1],
};
export const rarityKey = (l: LootItem) => (l.rarity && RARITY[l.rarity.toUpperCase()] ? l.rarity.toLowerCase() : "");
export const rarityLabel = (l: LootItem) => (l.rarity ? RARITY[l.rarity.toUpperCase()]?.[0] ?? "" : "");
export const rarityRank = (l: LootItem) => (l.rarity ? RARITY[l.rarity.toUpperCase()]?.[1] ?? 0 : 0);

/* ---------- État de possession ---------- */

/** « Déjà possédé » : le champion ou le skin complet est déjà à toi, le fragment ne sert plus qu'à être désenchanté. */
export const alreadyOwned = (l: LootItem) => l.itemStatus === "OWNED";
/** Skin dont le champion manque : on ne pourra pas le jouer tout de suite. */
export const missingChampion = (l: LootItem) => kindOf(l) === "skin" && l.parentItemStatus !== undefined && l.parentItemStatus !== "OWNED";

/* ---------- Images ---------- */

const CDN = "https://cdn.communitydragon.org/latest";
const LOOT_ICONS = "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-loot/global/default/assets/loot_item_icons";

/** Visuel vertical (écran de chargement) pour les champions et les skins, icône pour le reste. */
export function lootArt(l: LootItem): string {
  const k = kindOf(l);
  const id = l.storeItemId;
  if (k === "champion" && id) return `${CDN}/champion/${id}/portrait`;
  if (k === "skin" && id) {
    const champ = l.parentStoreItemId || Math.floor(id / 1000);
    return id % 1000 ? `${CDN}/champion/${champ}/portrait/skin/${id % 1000}` : `${CDN}/champion/${champ}/portrait`;
  }
  if (/ICON/i.test(l.type ?? "") && id) return `${CDN}/profile-icon/${id}`;
  if (l.tilePath) {
    if (/^\/fe\/lol-loot\//i.test(l.tilePath)) return l.tilePath.replace(/^\/fe\/lol-loot/i, "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-loot/global/default").toLowerCase();
    if (/^\/lol-game-data\//i.test(l.tilePath)) return gameAsset(l.tilePath);
    if (/^https?:/i.test(l.tilePath)) return l.tilePath;
  }
  if (k === "chest" || isCurrency(l)) return `${LOOT_ICONS}/${l.lootId.toLowerCase()}.png`;
  return "";
}

/** Grande image du panneau de détail : le splash pour un skin ou un champion, sinon la même icône. */
export function lootSplash(l: LootItem): string {
  const k = kindOf(l);
  const id = l.storeItemId;
  if (k === "champion" && id) return `${CDN}/champion/${id}/splash-art/centered`;
  if (k === "skin" && id) {
    const champ = l.parentStoreItemId || Math.floor(id / 1000);
    return id % 1000 ? `${CDN}/champion/${champ}/splash-art/centered/skin/${id % 1000}` : `${CDN}/champion/${champ}/splash-art/centered`;
  }
  return lootArt(l);
}

/** Pictogramme dessiné quand le visuel du client manque (coffre, clé, essence…). */
export function glyphOf(l: LootItem): "chest" | "key" | "fragment" | "essence" | "orb" | "star" {
  if (l.lootId === KEY) return "key";
  if (l.lootId === KEY_FRAGMENT) return "fragment";
  if (isCurrency(l)) return "essence";
  if (/orb|capsule|bag/i.test(l.lootId + " " + (l.localizedName ?? ""))) return "orb";
  if (kindOf(l) === "chest") return "chest";
  return "star";
}

/* ---------- Recettes ---------- */

export type Action = "open" | "forge" | "disenchant" | "upgrade" | "reroll" | "other";
export function actionOf(r: Recipe): Action {
  const t = `${r.type ?? ""} ${r.recipeName}`.toUpperCase();
  if (/DISENCHANT/.test(t)) return "disenchant";
  if (/REROLL/.test(t)) return "reroll";
  if (/UPGRADE|ACTIVATE|_ACTIVATE/.test(t)) return "upgrade";
  if (/OPEN/.test(t)) return "open";
  if (/FORGE|CRAFT/.test(t)) return "forge";
  return "other";
}
/** Les actions qui détruisent l'objet demandent un appui maintenu. */
export const isDestructive = (r: Recipe) => ["disenchant", "reroll"].includes(actionOf(r));

/** Titre d'une action, en français et dans le contexte de l'objet. */
export function actionTitle(r: Recipe, l: LootItem): string {
  switch (actionOf(r)) {
    case "open":
      return l.lootId === KEY || l.lootId === KEY_FRAGMENT ? "Ouvrir un coffre" : "Ouvrir";
    case "forge":
      return l.lootId === KEY_FRAGMENT ? "Forger une clé" : r.contextMenuText || "Fabriquer";
    case "disenchant":
      return "Désenchanter";
    case "upgrade":
      return kindOf(l) === "skin" ? "Débloquer le skin" : kindOf(l) === "champion" ? "Débloquer le champion" : "Débloquer";
    case "reroll":
      return "Relancer";
    default:
      return r.contextMenuText || "Utiliser";
  }
}

/** Phrase d'explication sous le titre de l'action. */
export function actionHint(r: Recipe, l: LootItem): string {
  switch (actionOf(r)) {
    case "open":
      return "Révèle son contenu tout de suite.";
    case "forge":
      return l.lootId === KEY_FRAGMENT ? "3 fragments deviennent 1 clé." : "Combine ces objets en un nouveau.";
    case "disenchant":
      return alreadyOwned(l) ? "Tu l'as déjà : récupère l'essence." : "L'objet disparaît contre de l'essence.";
    case "upgrade":
      return "Le fragment devient à toi pour toujours.";
    case "reroll":
      return "3 fragments de ce type donnent 1 objet permanent au hasard.";
    default:
      return r.description || "";
  }
}

/** Ce que coûte une recette, hors l'objet lui-même : [identifiant, quantité]. */
export function recipeCost(r: Recipe, l: LootItem): [string, number][] {
  return r.slots.filter((s) => !s.lootIds.includes(l.lootId)).map((s) => [s.lootIds[0], s.quantity]);
}
/** Quantité de l'objet lui-même que la recette consomme (3 pour une relance, 3 fragments pour une clé). */
export const selfQuantity = (r: Recipe, l: LootItem) => r.slots.find((s) => s.lootIds.includes(l.lootId))?.quantity ?? 1;

/** Ce que rapporte une recette : l'essence d'un désenchantement, sinon les sorties annoncées. */
export function recipeGain(r: Recipe, l: LootItem): [string, number] | null {
  if (actionOf(r) === "disenchant" && l.disenchantValue) return [l.disenchantLootName ?? "CURRENCY_champion", l.disenchantValue];
  const out = r.outputs?.find((o) => o.lootName && o.quantity);
  return out ? [out.lootName, out.quantity] : null;
}

/** Nombre de fois qu'on peut lancer la recette avec ce qu'on possède. */
export function timesPossible(r: Recipe, owned: Map<string, number>) {
  let n = Infinity;
  for (const s of r.slots) {
    const best = Math.max(0, ...s.lootIds.map((id) => owned.get(id) ?? 0));
    n = Math.min(n, Math.floor(best / Math.max(1, s.quantity)));
  }
  return Number.isFinite(n) ? n : 0;
}

export const recipesOf = (lootId: string) =>
  lcu<Recipe[]>("GET", `/lol-loot/v1/recipes/initial-item/${encodeURIComponent(lootId)}`).then(
    (r) => (r ?? []).filter((x) => x.slots?.length),
    () => [] as Recipe[],
  );

/** Lance une recette `repeat` fois. On envoie, pour chaque emplacement, l'objet choisi s'il y entre, sinon le premier qu'on possède. */
export async function craft(r: Recipe, l: LootItem, owned: Map<string, number>, repeat = 1): Promise<CraftResult> {
  // Ce qu'il reste à placer : une relance prend 3 fragments différents si l'objet choisi est seul.
  const left = new Map(owned);
  const ids = r.slots.map((s) => {
    const pick = [l.lootId, ...s.lootIds].find((id) => s.lootIds.includes(id) && (left.get(id) ?? 0) >= s.quantity * repeat) ?? s.lootIds[0];
    left.set(pick, (left.get(pick) ?? 0) - s.quantity * repeat);
    return pick;
  });
  const res = await lcu<CraftResult | null>("POST", `/lol-loot/v1/recipes/${encodeURIComponent(r.recipeName)}/craft?repeat=${repeat}`, ids);
  return res ?? {};
}

/** Ce qu'on a gagné, d'après la réponse du client ou, à défaut, en comparant le butin avant et après. */
export function gains(res: CraftResult, before: LootItem[], after: LootItem[]): { item: LootItem; count: number }[] {
  const fromRes = [...(res.added ?? []), ...(res.redeemed ?? [])].filter((x) => x.playerLoot && x.deltaCount > 0).map((x) => ({ item: x.playerLoot, count: x.deltaCount }));
  if (fromRes.length) return merge(fromRes);
  const prev = new Map(before.map((l) => [l.lootId, l.count]));
  return after.filter((l) => l.count > (prev.get(l.lootId) ?? 0)).map((l) => ({ item: l, count: l.count - (prev.get(l.lootId) ?? 0) }));
}
function merge(list: { item: LootItem; count: number }[]) {
  const m = new Map<string, { item: LootItem; count: number }>();
  for (const g of list) {
    const cur = m.get(g.item.lootId);
    if (cur) cur.count += g.count;
    else m.set(g.item.lootId, { ...g });
  }
  return [...m.values()];
}
