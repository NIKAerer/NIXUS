import { useEffect, useState } from "react";
import { RANDOM_THEME, THEMES } from "./themes";

/** Préférences de NIXUS, gardées sur ce PC. */
export interface Settings {
  readySound: boolean;
  volume: number; // 0 à 1
  readyFocus: boolean;
  randomSkins: boolean;
  heroFx: boolean;
  queueBar: boolean;
  modeBadges: boolean;
  /** Clé de l'API Riot (developer.riotgames.com), gardée sur ce PC. */
  riotKey: string;
  /** Région de routage de l'API : europe, americas, asia, sea. */
  riotRegion: string;
  /** Date de départ de l'import des SoloQ (AAAA-MM-JJ). */
  importSince: string;
  /** LP SoloQ à la date de départ (pour caler la courbe reconstituée), vide si inconnus. */
  lpStart: string;
  /** Lancer le client LoL au démarrage de NIXUS s'il est fermé. */
  autoLaunchLol: boolean;
  /** Fermer la fenêtre du client LoL (le client reste branché, NIXUS continue de marcher). */
  hideLol: boolean;
  /** Notification Windows à « Partie trouvée ». */
  readyNotify: boolean;
  /** Respiration des images de champions et de skins. */
  breath: boolean;
  /** Intensité de la respiration, 0 à 100 (60 = normal). */
  breathAmt: number;
  /** Couper toutes les animations pendant que LoL est en partie. */
  calmInGame: boolean;
  /** Chercher une mise à jour au démarrage. */
  checkUpdates: boolean;
  /** Thème de couleurs (voir lib/themes.ts). */
  theme: string;
}

const KEY = "nexus.settings";
export const DEFAULTS: Settings = { readySound: true, volume: 0.6, readyFocus: true, randomSkins: true, heroFx: true, queueBar: true, modeBadges: true, riotKey: "", riotRegion: "europe", importSince: "2026-10-04", lpStart: "594", autoLaunchLol: true, hideLol: true, readyNotify: true, breath: true, breathAmt: 60, calmInGame: true, checkUpdates: true, theme: "cinema" };

let current: Settings = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
})();
const listeners = new Set<(s: Settings) => void>();

/** « random » : un thème tiré au hasard à chaque lancement, jamais le même que la fois d'avant. */
function resolveTheme(id: string) {
  if (id !== RANDOM_THEME) return id;
  let last = "";
  try {
    last = localStorage.getItem("nixus.lastTheme") ?? "";
  } catch {
    /* stockage indisponible */
  }
  const pool = THEMES.filter((t) => t.id !== last);
  const pick = (pool.length ? pool : THEMES)[Math.floor(Math.random() * (pool.length || THEMES.length))].id;
  try {
    localStorage.setItem("nixus.lastTheme", pick);
  } catch {
    /* stockage indisponible */
  }
  return pick;
}

/** Le thème est posé sur la racine du document : les fenêtres et l'écran de démarrage le suivent aussi. */
const applyTheme = () => {
  document.documentElement.dataset.theme = resolveTheme(current.theme || DEFAULTS.theme);
};
applyTheme();

export const getSettings = () => current;

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* stockage indisponible */
  }
  if (patch.theme !== undefined) applyTheme();
  listeners.forEach((l) => l(current));
}

export function useSettings(): Settings {
  const [s, setS] = useState(current);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
