import { useSyncExternalStore } from "react";

/**
 * Petit magasin d'état hors de React. Chaque composant s'abonne à la tranche dont il a besoin :
 * quand le client Riot est relu chaque seconde, seuls les écrans dont la tranche a changé se redessinent.
 */
export interface Store<T> {
  get: () => T;
  set: (patch: Partial<T> | ((s: T) => Partial<T>)) => void;
  subscribe: (fn: () => void) => () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (patch) => {
      const p = typeof patch === "function" ? patch(state) : patch;
      let changed = false;
      for (const k in p) if (!Object.is(p[k], state[k])) changed = true;
      if (!changed) return;
      state = { ...state, ...p };
      listeners.forEach((l) => l());
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** `pick` doit renvoyer une valeur stable (un champ de l'état, pas un objet créé sur place). */
export function useStore<T, S>(store: Store<T>, pick: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => pick(store.get()));
}

/** Garde l'ancienne référence quand le contenu n'a pas bougé, pour ne pas redessiner pour rien. */
export function same<T>(prev: T, next: T): T {
  if (prev === next) return prev;
  try {
    return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
  } catch {
    return next;
  }
}
