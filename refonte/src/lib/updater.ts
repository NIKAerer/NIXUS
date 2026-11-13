import { useEffect, useState } from "react";
import { isDesktop } from "./lcu";

/** Mise à jour de NIXUS depuis github.com/NIKAerer/NIXUS (paquet signé, vérifié par l'app). */
export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "uptodate"; at: number }
  | { phase: "available"; version: string; notes?: string }
  | { phase: "downloading"; done: number; total?: number }
  | { phase: "installing" }
  | { phase: "error"; message: string };

let state: UpdateState = { phase: "idle" };
let pending: { downloadAndInstall: (cb: (e: DownloadEvent) => void) => Promise<void> } | null = null;
const listeners = new Set<(s: UpdateState) => void>();

type DownloadEvent = { event: "Started"; data: { contentLength?: number } } | { event: "Progress"; data: { chunkLength: number } } | { event: "Finished" };

function set(s: UpdateState) {
  state = s;
  listeners.forEach((l) => l(s));
}

export function useUpdate(): UpdateState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

export async function appVersion(): Promise<string> {
  if (!isDesktop) return "démo";
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

/** Cherche une nouvelle version. `quiet` : pas d'erreur affichée (vérification au lancement). */
export async function checkUpdate(quiet = false) {
  if (!isDesktop) {
    set({ phase: "uptodate", at: Date.now() });
    return;
  }
  if (state.phase === "checking" || state.phase === "downloading" || state.phase === "installing") return;
  set({ phase: "checking" });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const u = await check({ timeout: 15000 });
    if (u) {
      pending = u;
      set({ phase: "available", version: u.version, notes: u.body ?? undefined });
    } else {
      pending = null;
      set({ phase: "uptodate", at: Date.now() });
    }
  } catch (e) {
    set(quiet ? { phase: "idle" } : { phase: "error", message: describe(e) });
  }
}

/** Télécharge, installe puis relance NIXUS. */
export async function installUpdate() {
  if (!pending) return;
  let done = 0;
  let total: number | undefined;
  set({ phase: "downloading", done: 0 });
  try {
    await pending.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data.contentLength;
      else if (e.event === "Progress") {
        done += e.data.chunkLength;
        set({ phase: "downloading", done, total });
      } else set({ phase: "installing" });
    });
    set({ phase: "installing" });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    set({ phase: "error", message: describe(e) });
  }
}

function describe(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  if (/signature/i.test(m)) return "La mise à jour n'est pas signée correctement, elle a été refusée.";
  if (/network|connect|dns|timed? ?out|request/i.test(m)) return "Impossible de joindre GitHub. Vérifie ta connexion.";
  if (/404|not found|valid release JSON/i.test(m)) return "Aucune mise à jour publiée pour l'instant.";
  return m;
}
