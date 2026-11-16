import { isDesktop } from "./lcu";

type Win = import("@tauri-apps/api/window").Window;
let win: Promise<Win> | null = null;
const current = () => (win ??= import("@tauri-apps/api/window").then((m) => m.getCurrentWindow()));

export const minimize = () => isDesktop && current().then((w) => w.minimize());
export const toggleMaximize = () => isDesktop && current().then((w) => w.toggleMaximize());
export const closeWindow = () => isDesktop && current().then((w) => w.close());

/** Partie trouvée : ramène la fenêtre devant et fait clignoter l'icône dans la barre des tâches. */
export async function grabAttention() {
  if (!isDesktop) return;
  try {
    const m = await import("@tauri-apps/api/window");
    const w = await current();
    if (await w.isMinimized()) await w.unminimize();
    await w.show();
    await w.setFocus();
    await w.requestUserAttention(m.UserAttentionType.Critical);
  } catch {
    /* la fenêtre ne peut pas être ramenée devant, le son suffit */
  }
}

/** Notification Windows « Partie trouvée » (visible même NIXUS réduit). L'acceptation reste un clic. */
export async function notifyReady() {
  if (!isDesktop) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("plugin:notification|notify", { options: { title: "Partie trouvée", body: "Accepte dans NIXUS." } });
  } catch {
    /* notifications coupées dans Windows */
  }
}

/** Petit carillon joué à « Partie trouvée », généré sur place (aucun fichier son). */
export function playChime(volume = 0.6) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes = [659.25, 880, 1318.5];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.13;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.4 * volume, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.65);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* audio indisponible */
  }
}
