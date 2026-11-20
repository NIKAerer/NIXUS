import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./lcu";
import { mockPatchArticle, mockPatchList } from "./mockPatch";
import { createStore, useStore } from "./store";

/**
 * Notes de patch : NIXUS lit les pages officielles en français (leagueoflegends.com) et les découpe
 * en sections, champions et changements. Le texte reste celui de Riot, rien n'est résumé ni réécrit.
 */

export interface PatchRef {
  /** Chemin de la page sur leagueoflegends.com, ex. /fr-fr/news/game-updates/league-of-legends-patch-26-23-notes */
  path: string;
  /** « 26.23 » */
  version: string;
  date?: string;
  image?: string;
}

export interface Change {
  /** « Dégâts » dans « Dégâts : 20 ⇒ 30 » */
  label?: string;
  before?: string;
  after?: string;
  /** Texte complet quand la ligne n'a pas de flèche. */
  text: string;
  /** 1 pour une ligne imbriquée sous une autre. */
  depth: number;
}

export type Block =
  | { k: "sub"; text: string }
  | { k: "p"; text: string }
  | { k: "quote"; text: string }
  | { k: "img"; src: string }
  | { k: "list"; items: Change[] };

export interface Entry {
  name: string;
  image?: string;
  blocks: Block[];
}

export interface Section {
  title: string;
  /** Contenu avant le premier champion ou objet (intro, image des temps forts). */
  blocks: Block[];
  entries: Entry[];
}

export interface PatchDoc {
  version: string;
  title: string;
  date?: string;
  image?: string;
  intro: Block[];
  sections: Section[];
}

const LIST_PATH = "/fr-fr/news/tags/patch-notes/";
const PATCH_RE = /\/fr-fr\/news\/[a-z0-9-]+\/[a-z0-9-]*patch-(\d+)-(\d+)-notes[a-z0-9-]*/;

async function fetchPage(path: string): Promise<string> {
  return invoke<string>("news_page", { path });
}

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Image d'un nœud : `src`, sinon le premier candidat de `srcset`, en adresse absolue. */
function imgSrc(img: Element): string | undefined {
  const raw = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("srcset")?.split(/[\s,]+/)[0];
  if (!raw || raw.startsWith("data:")) return undefined;
  try {
    return new URL(raw, "https://www.leagueoflegends.com").href;
  } catch {
    return undefined;
  }
}

/** Liste des notes de patch, la plus récente en premier. */
export function parsePatchList(html: string): PatchRef[] {
  const doc = parse(html);
  const seen = new Map<string, PatchRef>();
  for (const a of doc.querySelectorAll("a[href]")) {
    const m = (a.getAttribute("href") ?? "").match(PATCH_RE);
    if (!m) continue;
    const path = m[0];
    if (seen.has(path)) continue;
    const time = a.querySelector("time");
    const img = a.querySelector("img");
    seen.set(path, { path, version: `${m[1]}.${m[2]}`, date: time?.getAttribute("datetime") ?? undefined, image: img ? imgSrc(img) : undefined });
  }
  // Repli : la page est rendue côté client et les liens ne sont que dans les données JSON.
  if (!seen.size) {
    for (const m of html.matchAll(new RegExp(PATCH_RE, "g"))) {
      if (!seen.has(m[0])) seen.set(m[0], { path: m[0], version: `${m[1]}.${m[2]}` });
    }
  }
  const num = (v: string) => v.split(".").reduce((n, x) => n * 1000 + Number(x), 0);
  return [...seen.values()].sort((a, b) => num(b.version) - num(a.version));
}

/** Ligne de liste : « Libellé : avant ⇒ après » quand il y a une flèche. */
function change(text: string, depth: number): Change {
  const parts = text.split(/\s*[⇒→]\s*/);
  if (parts.length === 2) {
    const m = parts[0].match(/^(.{1,80}?)\s*:\s+(.*)$/);
    return { label: m?.[1], before: m ? m[2] : parts[0], after: parts[1], text, depth };
  }
  return { text, depth };
}

function listItems(ul: Element, depth: number, out: Change[]) {
  for (const li of ul.children) {
    if (li.tagName !== "LI") continue;
    const copy = li.cloneNode(true) as Element;
    copy.querySelectorAll("ul, ol").forEach((n) => n.remove());
    const text = clean(copy.textContent);
    if (text) out.push(change(text, depth));
    li.querySelectorAll(":scope > ul, :scope > ol").forEach((sub) => listItems(sub, Math.min(depth + 1, 2), out));
  }
}

/** Plus petit élément qui contient tous les titres de section : le corps de l'article. */
function articleRoot(doc: Document): Element | null {
  const heads = [...doc.body.querySelectorAll("h2")].filter((h) => !h.closest("nav, header, footer, aside"));
  if (!heads.length) return null;
  let root: Element | null = heads[0].parentElement;
  while (root && !heads.every((h) => root!.contains(h))) root = root.parentElement;
  return root;
}

/** Découpe une page de notes de patch en sections (h2), entrées (h3) et blocs. */
export function parsePatchArticle(html: string, ref: Pick<PatchRef, "version" | "date">): PatchDoc {
  const doc = parse(html);
  const title = clean(doc.querySelector("h1")?.textContent) || `Notes de patch ${ref.version}`;
  const og = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? undefined;
  const date = doc.querySelector("time")?.getAttribute("datetime") ?? ref.date;
  const out: PatchDoc = { version: ref.version, title, date, image: og, intro: [], sections: [] };
  const root = articleRoot(doc);
  if (!root) return out;

  let section: Section | null = null;
  let entry: Entry | null = null;
  let pendingImg: string | undefined;
  const target = () => (entry ? entry.blocks : section ? section.blocks : out.intro);
  const flushImg = () => {
    if (pendingImg) target().push({ k: "img", src: pendingImg });
    pendingImg = undefined;
  };
  const push = (b: Block) => {
    flushImg();
    target().push(b);
  };

  const visit = (el: Element) => {
    switch (el.tagName) {
      case "SCRIPT":
      case "STYLE":
      case "NAV":
      case "BUTTON":
      case "svg":
        return;
      case "H2": {
        flushImg();
        const t = clean(el.textContent);
        if (!t) return;
        section = { title: t, blocks: [], entries: [] };
        entry = null;
        out.sections.push(section);
        return;
      }
      case "H3": {
        const t = clean(el.textContent);
        if (!t) return;
        // L'image qui précède un nom de champion ou d'objet est son portrait.
        const own = el.querySelector("img");
        entry = { name: t, image: own ? imgSrc(own) : pendingImg, blocks: [] };
        pendingImg = undefined;
        if (!section) {
          section = { title: "", blocks: [], entries: [] };
          out.sections.push(section);
        }
        section.entries.push(entry);
        return;
      }
      case "H4":
      case "H5": {
        const t = clean(el.textContent);
        if (t) push({ k: "sub", text: t });
        return;
      }
      case "UL":
      case "OL": {
        const items: Change[] = [];
        listItems(el, 0, items);
        if (items.length) push({ k: "list", items });
        return;
      }
      case "BLOCKQUOTE": {
        const t = clean(el.textContent);
        if (t) push({ k: "quote", text: t });
        return;
      }
      case "P": {
        // Un paragraphe qui ne contient qu'une image.
        const img = el.querySelector("img");
        const t = clean(el.textContent);
        if (t) push({ k: "p", text: t });
        else if (img) {
          flushImg();
          pendingImg = imgSrc(img);
        }
        return;
      }
      case "IMG": {
        flushImg();
        pendingImg = imgSrc(el);
        return;
      }
      case "VIDEO":
      case "IFRAME":
        return;
    }
    for (const child of el.children) visit(child);
  };
  for (const child of root.children) visit(child);
  flushImg();
  // Sections vides (titres décoratifs) retirées.
  out.sections = out.sections.filter((s) => s.blocks.length || s.entries.length);
  return out;
}

// --- Chargement et cache ---

interface PatchState {
  list: PatchRef[] | null;
  docs: Record<string, PatchDoc>;
  error: string | null;
  loading: boolean;
}

const store = createStore<PatchState>({ list: null, docs: {}, error: null, loading: false });
export const usePatches = <S,>(pick: (s: PatchState) => S) => useStore(store, pick);

let listing: Promise<void> | null = null;

/** Charge la liste des patchs (une fois par lancement) et le plus récent. */
export function loadPatchList(force = false) {
  if (listing && !force) return listing;
  store.set({ loading: true, error: null });
  listing = (async () => {
    try {
      const list = isDesktop ? parsePatchList(await fetchPage(LIST_PATH)) : mockPatchList;
      if (!list.length) throw new Error("Aucune note de patch trouvée sur le site de Riot.");
      store.set({ list });
      await loadPatch(list[0]);
    } catch (e) {
      store.set({ error: String((e as Error)?.message ?? e) });
      listing = null;
    } finally {
      store.set({ loading: false });
    }
  })();
  return listing;
}

export async function loadPatch(ref: PatchRef): Promise<PatchDoc> {
  const cached = store.get().docs[ref.path];
  if (cached) return cached;
  const doc = isDesktop ? parsePatchArticle(await fetchPage(ref.path), ref) : mockPatchArticle(ref);
  if (!doc.sections.length) throw new Error("La page du patch n'a pas pu être lue.");
  store.set({ docs: { ...store.get().docs, [ref.path]: doc } });
  return doc;
}

/** Entrées qui concernent des champions joués récemment (comparaison sur le nom affiché). */
export function myEntries(doc: PatchDoc, names: Set<string>) {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const mine = new Set([...names].map(norm));
  return doc.sections.flatMap((s) => s.entries).filter((e) => mine.has(norm(e.name)));
}
