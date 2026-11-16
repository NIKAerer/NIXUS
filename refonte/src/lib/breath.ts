/**
 * Respiration des images de champions et de skins.
 * Tout le mouvement est en CSS (translate, scale, rotate) : ce fichier ne fait que
 * 1. la table de réglage du cou par champion,
 * 2. la mise en pause des images hors de l'écran (IntersectionObserver) avec un plafond d'images animées.
 */

/** Cou par défaut, en % de l'image affichée : [vertical, horizontal]. Marche sur la plupart des splash arts. */
export const NECK_DEFAULT: [number, number] = [40, 48];

/**
 * Réglages par champion (id du champion → [vertical %, horizontal %]).
 * Vertical : plus petit = cou plus haut. Horizontal : 50 = milieu de l'image.
 * Pour régler un champion : ajoute une ligne, rebuild, regarde son splash dans le champ select.
 */
export const NECK: Record<number, [number, number]> = {
  103: [40, 42], // Ahri
  222: [38, 40], // Jinx
  157: [35, 52], // Yasuo
  99: [40, 48], // Lux
  238: [34, 50], // Zed
  81: [38, 45], // Ezreal
  64: [36, 48], // Lee Sin
};

export const neckOf = (champ?: number): [number, number] => (champ && NECK[champ]) || NECK_DEFAULT;

/** Nombre maximum d'images animées en même temps (un splash à 3 calques compte pour 3). */
const CAP = 90;
const visible = new Set<Element>();
let io: IntersectionObserver | null = null;

function refresh() {
  let n = 0;
  for (const el of visible) el.classList.toggle("br-run", n++ < CAP);
}

function observer() {
  if (io || typeof IntersectionObserver === "undefined") return io;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else {
          visible.delete(e.target);
          e.target.classList.remove("br-run");
        }
      }
      refresh();
    },
    { rootMargin: "80px" },
  );
  return io;
}

/** À brancher comme `ref` sur chaque calque animé. */
export function watch(el: HTMLImageElement | null, prev: { current: HTMLImageElement | null }) {
  const o = observer();
  if (prev.current && prev.current !== el) {
    o?.unobserve(prev.current);
    if (visible.delete(prev.current)) refresh();
  }
  prev.current = el;
  if (el) {
    if (o) o.observe(el);
    else el.classList.add("br-run");
  }
}

/** Pour le compteur de Paramètres : combien d'images bougent en ce moment. */
export const runningCount = () => document.querySelectorAll("img.br.br-run").length;
