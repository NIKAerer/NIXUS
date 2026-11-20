/**
 * Libellés français des codes renvoyés par le client Riot (LCU).
 *
 * Le client renvoie beaucoup de clés brutes (RANKED_SOLO_5x5, CHAMPION_RENTAL_disenchant, UTILITY, kEpic…).
 * Rien de tout ça ne doit s'afficher tel quel : chaque écran passe par les fonctions ci-dessous,
 * et un code inconnu est au pire transformé en mots lisibles par `humanize`.
 */

type Table = Record<string, string>;

/** Rangs classés et niveaux de défis. */
export const TIERS: Table = {
  NONE: "Aucun",
  UNRANKED: "Non classé",
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

/** Files, telles que le client les nomme dans le statut des amis et le classement. */
export const QUEUE_TYPES: Table = {
  RANKED_SOLO_5x5: "Classé Solo/Duo",
  RANKED_FLEX_SR: "Classé Flex",
  RANKED_FLEX_TT: "Classé Flex 3c3",
  RANKED_TFT: "TFT classé",
  RANKED_TFT_DOUBLE_UP: "TFT Double Up",
  RANKED_TFT_TURBO: "TFT Hyper Roll",
  NORMAL: "Normale",
  NORMAL_5x5: "Normale",
  NORMAL_DRAFT: "Normale (draft)",
  DRAFT_5x5: "Normale (draft)",
  BLIND_PICK: "Normale (aveugle)",
  QUICKPLAY: "Partie rapide",
  SWIFTPLAY: "Partie rapide",
  ARAM_UNRANKED_5x5: "ARAM",
  ARAM: "ARAM",
  CHERRY: "Arène",
  URF: "URF",
  ARURF: "URF aléatoire",
  ONEFORALL: "Un pour tous",
  NEXUSBLITZ: "Nexus Blitz",
  ULTBOOK: "Grimoire ultime",
  BOT: "Contre l'IA",
  BOT_5x5: "Contre l'IA",
  INTRO: "Contre l'IA (intro)",
  TUTORIAL: "Tutoriel",
  PRACTICETOOL: "Entraînement",
  CUSTOM: "Partie personnalisée",
  TFT: "TFT",
  STRAWBERRY: "Essaim",
  NONE: "Partie",
};

/** Modes de jeu (gameMode). */
export const GAME_MODES: Table = {
  CLASSIC: "Faille de l'invocateur",
  ARAM: "ARAM",
  CHERRY: "Arène",
  URF: "URF",
  ARURF: "URF aléatoire",
  ONEFORALL: "Un pour tous",
  NEXUSBLITZ: "Nexus Blitz",
  ULTBOOK: "Grimoire ultime",
  PRACTICETOOL: "Entraînement",
  TUTORIAL: "Tutoriel",
  SWIFTPLAY: "Partie rapide",
  TFT: "TFT",
  STRAWBERRY: "Essaim",
};

/** Rôles : le client écrit tantôt UTILITY, tantôt utility. */
export const POSITIONS: Table = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", MID: "Mid", BOTTOM: "ADC", BOT: "ADC", UTILITY: "Support", SUPPORT: "Support", FILL: "Autorempli", NONE: "Aucun" };

/** Catégories des défis. */
export const CHALLENGE_CATEGORIES: Table = {
  IMAGINATION: "Imagination",
  EXPERTISE: "Expertise",
  VETERANCY: "Vétérance",
  TEAMWORK: "Travail d'équipe",
  COLLECTION: "Collection",
  LEGACY: "Héritage",
  CRYSTAL: "Total",
};

/** Ce que fait un ami (lol.gameStatus). */
export const GAME_STATUS: Table = {
  outOfGame: "Disponible",
  inQueue: "En file d'attente",
  championSelect: "Sélection des champions",
  inGame: "En partie",
  spectating: "Spectateur",
  hosting: "En groupe",
};

/** Butin : essences, catégories, types d'objets et fabrications. */
export const CURRENCIES: Table = {
  CURRENCY_champion: "Essence bleue",
  CURRENCY_cosmetic: "Essence orange",
  CURRENCY_mythic: "Essence mythique",
  CURRENCY_RP: "RP",
};
export const CURRENCY_SHORT: Table = { CURRENCY_champion: "EB", CURRENCY_cosmetic: "EO", CURRENCY_mythic: "EM", CURRENCY_RP: "RP" };

export const LOOT_MATERIALS: Table = {
  MATERIAL_key: "Clé Hextech",
  MATERIAL_key_fragment: "Fragment de clé",
  CHEST_generic: "Coffre Hextech",
  CHEST_champion_mastery: "Coffre de maîtrise",
};

export const LOOT_TYPES: Table = {
  CHAMPION: "Champion",
  CHAMPION_RENTAL: "Fragment de champion",
  CHAMPION_TOKEN: "Jeton de maîtrise",
  SKIN: "Skin",
  SKIN_RENTAL: "Fragment de skin",
  CHAMPION_SKIN: "Skin",
  CHAMPION_SKIN_RENTAL: "Fragment de skin",
  WARDSKIN: "Balise",
  WARDSKIN_RENTAL: "Fragment de balise",
  WARD_SKIN: "Balise",
  WARD_SKIN_RENTAL: "Fragment de balise",
  SUMMONERICON: "Icône",
  SUMMONER_ICON: "Icône",
  EMOTE: "Emote",
  STATSTONE: "Pierre de statistiques",
  STATSTONE_SHARD: "Fragment de pierre de statistiques",
  COMPANION: "Petite légende",
  TFT_MAP_SKIN: "Arène TFT",
  CHEST: "Coffre",
  MATERIAL: "Matériau",
  CURRENCY: "Essence",
  ETERNALS: "Éternels",
  BUNDLE: "Lot",
};

export const RECIPE_TYPES: Table = {
  DISENCHANT: "Désenchanter",
  UPGRADE: "Débloquer",
  OPEN: "Ouvrir",
  FORGE: "Fabriquer",
  CRAFT: "Fabriquer",
  REROLL: "Relancer",
  REDEEM: "Obtenir",
  CONSUME: "Utiliser",
};

/** Mots courants des codes, pour lire un code inconnu au lieu de l'afficher brut. */
const WORDS: Table = {
  ranked: "classé",
  unranked: "non classé",
  solo: "solo",
  flex: "flex",
  normal: "normale",
  draft: "draft",
  blind: "aveugle",
  aram: "ARAM",
  urf: "URF",
  tft: "TFT",
  bot: "IA",
  custom: "personnalisée",
  practice: "entraînement",
  game: "partie",
  queue: "file",
  champion: "champion",
  champ: "champion",
  skin: "skin",
  rental: "fragment",
  shard: "fragment",
  fragment: "fragment",
  permanent: "permanent",
  disenchant: "désenchanter",
  upgrade: "débloquer",
  reroll: "relancer",
  open: "ouvrir",
  forge: "fabriquer",
  craft: "fabriquer",
  chest: "coffre",
  key: "clé",
  material: "matériau",
  currency: "essence",
  cosmetic: "orange",
  mythic: "mythique",
  token: "jeton",
  mastery: "maîtrise",
  ward: "balise",
  wardskin: "balise",
  icon: "icône",
  summonericon: "icône",
  emote: "emote",
  generic: "",
  error: "erreur",
  not: "pas",
  found: "trouvé",
  invalid: "invalide",
  request: "demande",
  failed: "échec",
  timeout: "délai dépassé",
  in: "en",
  out: "hors",
  of: "de",
  top: "top",
  jungle: "jungle",
  middle: "mid",
  bottom: "ADC",
  utility: "support",
};
const NOISE = /^(5x5|3x3|sr|tt|k|v\d+|\d+)$/i;

/** Vrai quand le texte ressemble à une clé technique plutôt qu'à du texte (RANKED_SOLO_5x5, kEpic, gameQueueType…). */
export function looksLikeCode(s?: string | null): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!t || /\s/.test(t)) return false;
  return /_/.test(t) || /^[A-Z0-9]{3,}$/.test(t) || /^k[A-Z][a-z]/.test(t) || /^[a-z]+[A-Z][A-Za-z]*$/.test(t);
}

/** Transforme un code inconnu en mots français lisibles : « CHAMPION_RENTAL_disenchant » → « Champion fragment désenchanter ». */
export function humanize(code?: string | null, fallback = ""): string {
  if (!code) return fallback;
  if (!looksLikeCode(code)) return code;
  const words = code
    .replace(/^k(?=[A-Z])/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[_\s-]+/)
    .filter((w) => w && !NOISE.test(w))
    .map((w) => {
      const low = w.toLowerCase();
      return low in WORDS ? WORDS[low] : low;
    })
    .filter(Boolean);
  if (!words.length) return fallback;
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Libellé d'un code dans une table, insensible à la casse, sinon lu en mots. */
export function label(table: Table, code?: string | null, fallback = ""): string {
  if (!code) return fallback;
  if (code in table) return table[code];
  const up = code.toUpperCase();
  const hit = Object.keys(table).find((k) => k.toUpperCase() === up);
  return hit ? table[hit] : humanize(code, fallback);
}

export const tierLabel = (tier?: string | null) => label(TIERS, tier, "Aucun");
export const positionLabel = (p?: string | null, fallback = "") => (p ? label(POSITIONS, p, fallback) : fallback);
export const gameModeLabel = (m?: string | null, fallback = "Partie") => label(GAME_MODES, m, fallback);
export const challengeCategoryLabel = (c?: string | null) => label(CHALLENGE_CATEGORIES, c, "Défis");
export const currencyLabel = (id?: string | null) => label(CURRENCIES, id, "Essence");
export const lootTypeLabel = (t?: string | null) => label(LOOT_TYPES, t, "Objet");

/** Nom d'une file depuis sa clé (gameQueueType), y compris les clés inconnues. */
export function queueTypeLabel(code?: string | null, fallback = "Partie"): string {
  if (!code) return fallback;
  return label(QUEUE_TYPES, code, fallback);
}

/** Statut d'un ami ; « hosting_RANKED_SOLO_5x5 » devient « En groupe · Classé Solo/Duo ». */
export function gameStatusLabel(status?: string | null): string {
  if (!status) return GAME_STATUS.outOfGame;
  if (status in GAME_STATUS) return GAME_STATUS[status];
  const host = status.match(/^hosting_?(.*)$/i);
  if (host) return host[1] ? `${GAME_STATUS.hosting} · ${queueTypeLabel(host[1])}` : GAME_STATUS.hosting;
  return humanize(status, GAME_STATUS.outOfGame);
}

/** Action d'une recette de butin : le type (DISENCHANT…), sinon la fin du nom (…_disenchant), sinon le texte du client s'il est lisible. */
export function recipeLabel(r: { recipeName: string; type?: string; contextMenuText?: string }): string {
  const byType = r.type && RECIPE_TYPES[r.type.toUpperCase()];
  if (byType) return byType;
  const suffix = r.recipeName.split("_").pop()?.toUpperCase() ?? "";
  if (RECIPE_TYPES[suffix]) return RECIPE_TYPES[suffix];
  if (r.contextMenuText && !looksLikeCode(r.contextMenuText)) return r.contextMenuText;
  return humanize(r.recipeName, "Fabriquer");
}

/** Catégorie d'un objet de butin, depuis son identifiant (CHAMPION_RENTAL_64 → CHAMPION_RENTAL). */
export function lootKind(l: { lootId: string; type?: string; lootName?: string }): string {
  if (l.type) return l.type;
  const m = l.lootId.match(/^([A-Za-z_]+?)(?:_\d+(?:-\d+)?)?$/);
  return m ? m[1] : l.lootName ?? "";
}
