import { useEffect, useState } from "react";
import { isDesktop, lcu } from "./lcu";
import { snapshot } from "./archive";

/**
 * Retours de signalement, messages de Riot et avertissements (leaver buster) que le client officiel affiche
 * dans sa fenêtre, qui est cachée chez Nika. Lecture seule : uniquement des GET, rien n'est acquitté côté client.
 * NIXUS retient sur ce PC les retours déjà vus.
 */

export interface Feedback {
  id: string;
  title: string;
  body: string;
  at?: number;
}

const PATHS = ["/lol-player-report-sender/v1/reporter-feedback", "/lol-player-messaging/v1/notification", "/lol-leaver-buster/v1/notifications"] as const;
const SEEN_KEY = "nixus.feedback.seen";
const seen = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
};

type Raw = Record<string, unknown>;
const str = (...v: unknown[]) => v.find((x) => typeof x === "string" && x.trim()) as string | undefined;
// Les trois sources ne renvoient que des messages destinés au joueur : on les montre tous.
const DEFAULT_TITLE: Record<string, string> = {
  "/lol-player-report-sender/v1/reporter-feedback": "Retour sur ton signalement",
  "/lol-player-messaging/v1/notification": "Message de Riot",
  "/lol-leaver-buster/v1/notifications": "Avertissement de comportement",
};

function normalize(r: Raw, path: string): Feedback | null {
  const id = String(r.id ?? r.feedbackId ?? r.messageId ?? `${JSON.stringify(r).length}:${str(r.title, r.message) ?? ""}`);
  const data = (r.data ?? r.payload ?? {}) as Raw;
  const title = str(r.title, data.title) ?? DEFAULT_TITLE[path] ?? "Message de Riot";
  const body =
    str(r.message, r.body, r.detail, r.msgBody, data.message, data.body) ??
    (path.includes("report-sender") ? "Un joueur que tu as signalé a reçu une sanction. Merci d'aider à garder les parties agréables." : "Ouvre la fenêtre du client LoL pour voir le détail.");
  const t = r.created ?? r.createdAt ?? r.timestamp ?? r.time;
  return { id: `${path}:${id}`, title, body, at: typeof t === "number" ? t : typeof t === "string" ? Date.parse(t) || undefined : undefined };
}

let lastSnap = 0;

async function fetchAll(): Promise<Feedback[]> {
  const out: Feedback[] = [];
  const raw: Record<string, unknown> = {};
  for (const p of PATHS) {
    const v = await lcu<unknown>("GET", p).catch(() => null);
    raw[p] = v;
    const list = Array.isArray(v) ? v : v && typeof v === "object" ? [v] : [];
    for (const r of list) {
      const f = r && typeof r === "object" ? normalize(r as Raw, p) : null;
      if (f && !out.some((x) => x.id === f.id)) out.push(f);
    }
  }
  // Capture de ce que renvoie le client (toutes les 6 h) pour vérifier le format sur ton PC.
  if (Date.now() - lastSnap > 6 * 3600_000) {
    lastSnap = Date.now();
    snapshot("report-feedback", [], { raw });
  }
  return out;
}

/** Retours pas encore vus, vérifiés au lancement puis toutes les 2 minutes (hors partie). */
export function useReportFeedback(enabled: boolean) {
  const [items, setItems] = useState<Feedback[]>([]);
  useEffect(() => {
    if (!enabled || !isDesktop) return;
    let stop = false;
    const run = async () => {
      const all = await fetchAll().catch(() => []);
      const s = seen();
      if (!stop) setItems(all.filter((f) => !s.has(f.id)));
    };
    run();
    const t = setInterval(run, 120_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [enabled]);
  const dismiss = (id: string) => {
    const s = seen();
    s.add(id);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-200)));
    } catch {
      /* stockage indisponible */
    }
    setItems((l) => l.filter((f) => f.id !== id));
  };
  return { items, dismiss };
}
