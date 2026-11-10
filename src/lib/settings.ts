import { useEffect, useState } from "react";

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
}

const KEY = "nexus.settings";
export const DEFAULTS: Settings = { readySound: true, volume: 0.6, readyFocus: true, randomSkins: true, heroFx: true, queueBar: true, modeBadges: true, riotKey: "", riotRegion: "europe", importSince: "2026-10-04", lpStart: "594", autoLaunchLol: true, hideLol: true, readyNotify: true, breath: true, breathAmt: 60, calmInGame: true, checkUpdates: true };

let current: Settings = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
})();
const listeners = new Set<(s: Settings) => void>();

export const getSettings = () => current;

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* stockage indisponible */
  }
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
