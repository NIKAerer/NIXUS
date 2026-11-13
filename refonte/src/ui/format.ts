/** Mise en forme des nombres, à la française. */
export const pct = (v: number) => `${Math.round(v * 100)} %`;
export const dec = (v: number, digits = 1) => v.toFixed(digits).replace(".", ",");
export const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v)).toLocaleString("fr-FR")}`;
export const kda = (k: number, d: number, a: number) => (d === 0 ? "Parfait" : dec((k + a) / d, 2));
export const kilo = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")} k` : String(Math.round(v)));
export const int = (v: number) => Math.round(v).toLocaleString("fr-FR");
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n > 1 ? many : word}`;
export const avg = (list: (number | null | undefined)[]) => {
  const v = list.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
export const hhmm = (t: string | number) => {
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};
/** Lecture et écriture tolérantes dans le stockage local. */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible : on s'en passe */
  }
}
