import { client } from "./client";
import { QUEUES, queueName } from "./lcu";
import { createStore, useStore } from "./store";
import type { Friend, GameQueue, Lobby, Match } from "./types";

/** État de l'interface partagé entre les écrans : page ouverte, file choisie, fenêtres ouvertes. */
export type Page = "home" | "grind" | "collection" | "loot" | "profile";

export interface ViewState {
  page: Page;
  /** File choisie dans la barre de jeu (suit celle du groupe quand il y en a un). */
  queueId: number;
  friendsOpen: boolean;
  settingsOpen: boolean;
  modesOpen: boolean;
  /** Fiche de partie ouverte ; `owner` quand c'est la partie d'un ami. */
  match: { match: Match; owner?: string } | null;
  /** Ami dont on regarde l'historique. */
  historyOf: Friend | null;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible */
  }
};

export const view = createStore<ViewState>({
  page: "home",
  queueId: Number(read("nixus.queue")) || 420,
  friendsOpen: read("nexus.friendsOpen") === "1",
  settingsOpen: false,
  modesOpen: false,
  match: null,
  historyOf: null,
});

export const useView = <S,>(pick: (s: ViewState) => S) => useStore(view, pick);

export const nav = {
  page: (page: Page) => view.set({ page }),
  queue: (queueId: number) => {
    write("nixus.queue", String(queueId));
    view.set({ queueId });
  },
  toggleFriends: () => {
    const friendsOpen = !view.get().friendsOpen;
    write("nexus.friendsOpen", friendsOpen ? "1" : "0");
    view.set({ friendsOpen });
  },
  settings: (settingsOpen: boolean) => view.set({ settingsOpen }),
  modes: (modesOpen: boolean) => view.set({ modesOpen }),
  openMatch: (match: Match, owner?: string) => view.set({ match: { match, owner } }),
  closeMatch: () => view.set({ match: null }),
  history: (historyOf: Friend | null) => view.set({ historyOf }),
};

/** Nom et description de la file affichée dans la barre de jeu et sur l'accueil. */
export function queueInfo(queueId: number, queues: GameQueue[], lobby: Lobby | null) {
  const custom = !!lobby?.gameConfig.isCustom;
  const practice = custom && lobby?.gameConfig.gameMode === "PRACTICETOOL";
  const live = queues.find((q) => q.id === queueId);
  const fixed = QUEUES.find((q) => q.id === queueId);
  const title = custom ? (practice ? "Entraînement" : lobby?.gameConfig.customLobbyName || "Partie personnalisée") : fixed?.label || live?.name || queueName(queueId);
  const blurb = custom
    ? practice
      ? "Outil d'entraînement : seul sur la Faille, sans enjeu."
      : "Partie personnalisée : le chef lance la sélection quand tout le monde est là."
    : live?.detailedDescription || fixed?.blurb || (live?.description !== live?.name ? live?.description : "") || "";
  return { title, blurb, custom, practice, ranked: !custom && (queueId === 420 || queueId === 440) };
}

/** Phases où le joueur est « au repos » : la barre de jeu est visible. */
export const isPlaying = () => ["InProgress", "GameStart", "Reconnect"].includes(client.get().phase);
