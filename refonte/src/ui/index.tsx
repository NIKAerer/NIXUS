import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { neckOf, watch } from "../lib/breath";
import { championSquare } from "../lib/lcu";
import { Icon } from "./Icon";

export { Icon } from "./Icon";
export type { IconName } from "./Icon";
export * from "./format";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** Image qui apparaît en fondu une fois chargée et garde sa place si elle échoue. */
export function Art({ src, alt = "", className, style, imgRef }: { src: string; alt?: string; className?: string; style?: CSSProperties; imgRef?: (el: HTMLImageElement | null) => void }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  if (state === "error" || !src) return <span className={cx(className, "art-missing")} aria-hidden="true" />;
  return <img ref={imgRef} style={style} src={src} alt={alt} loading="lazy" decoding="async" draggable={false} className={cx(className, "art", state === "ready" && "ready")} onLoad={() => setState("ready")} onError={() => setState("error")} />;
}

/**
 * Image de champion ou de skin qui « respire ».
 * `full` (grands visuels) : la même image en 3 calques (corps, épaules, tête) avec des masques adoucis.
 * Sinon (icônes, vignettes) : un léger souffle sur toute l'image.
 * Marche/arrêt et intensité sont des classes et variables posées sur `.app`.
 */
export function Breathing({ src, champ, full, className, alt = "", amount = 1 }: { src: string; champ?: number; full?: boolean; className?: string; alt?: string; amount?: number }) {
  // Rythme et phase tirés au hasard une fois : les images ne bougent pas toutes ensemble.
  const timing = useMemo(() => {
    const t = 4.6 + Math.random() * 1.6;
    return { t, d: -Math.random() * t };
  }, []);
  const [ny, nx] = neckOf(champ);
  const style = { "--br-t": `${timing.t.toFixed(2)}s`, "--br-d": `${timing.d.toFixed(2)}s`, "--br-k": amount, "--ny": `${ny}%`, "--nx": `${nx}%` } as CSSProperties;
  const r1 = useRef<HTMLImageElement | null>(null);
  const r2 = useRef<HTMLImageElement | null>(null);
  const r3 = useRef<HTMLImageElement | null>(null);
  if (!full) return <Art src={src} alt={alt} className={cx(className, "br br-lite")} style={style} imgRef={(el) => watch(el, r1)} />;
  return (
    <>
      <Art src={src} alt={alt} className={cx(className, "br br-body")} style={style} imgRef={(el) => watch(el, r1)} />
      <Art src={src} className={cx(className, "br br-sh")} style={style} imgRef={(el) => watch(el, r2)} />
      <Art src={src} className={cx(className, "br br-head")} style={style} imgRef={(el) => watch(el, r3)} />
    </>
  );
}

export function ChampIcon({ id, className }: { id: number; className?: string }) {
  if (!id) return <span className={cx(className, "art-missing")} aria-hidden="true" />;
  return <Breathing src={championSquare(id)} champ={id} className={className} />;
}

/** Bloc gris qui pulse doucement à la place d'un contenu en chargement. */
export const Skeleton = ({ className, style }: { className?: string; style?: CSSProperties }) => <span className={cx("skel", className)} style={style} aria-hidden="true" />;

const still = () => document.querySelector(".app.no-fx") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Texte dont le premier nombre « monte » jusqu'à sa valeur au premier affichage, en gardant son format. */
export function CountUp({ text }: { text: string }) {
  const m = text.match(/^(.*?)([+−-]?)(\d[\d   ]*)(,(\d+))?(.*)$/s);
  const [shown, setShown] = useState(text);
  const last = useRef<string | null>(null);
  useEffect(() => {
    const first = last.current === null;
    last.current = text;
    if (!m || !first || still()) return setShown(text);
    const [, pre, sign, whole, , frac, post] = m;
    const digits = frac?.length ?? 0;
    const target = Number(whole.replace(/\D/g, "") + (digits ? "." + frac : ""));
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 600);
      const v = target * (1 - Math.pow(1 - k, 3));
      setShown(pre + sign + v.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + post);
      if (k < 1) raf = requestAnimationFrame(step);
      else setShown(text);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{shown}</>;
}

/** Ferme avec Échap. La fenêtre ouverte en dernier se ferme en premier. */
const escStack: (() => void)[] = [];
if (typeof window !== "undefined")
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && escStack.length) {
      e.preventDefault();
      escStack[escStack.length - 1]();
    }
  });
export function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const fn = () => ref.current();
    escStack.push(fn);
    return () => void escStack.splice(escStack.indexOf(fn), 1);
  }, []);
}

/** Fenêtre modale : fond flouté, Échap, clic à côté, bouton fermer. */
export function Modal({ label, onClose, className, size = "m", children, style }: { label: string; onClose: () => void; className?: string; size?: "s" | "m" | "l" | "xl"; children: ReactNode; style?: CSSProperties }) {
  useEscape(onClose);
  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx("modal", `modal-${size}`, className)} style={style} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>,
    document.getElementById("layer") ?? document.body,
  );
}

export function CloseButton({ onClose, label = "Fermer", className }: { onClose: () => void; label?: string; className?: string }) {
  return (
    <button className={cx("icon-btn", className)} onClick={onClose} aria-label={label} title={label}>
      <Icon name="close" size={16} />
    </button>
  );
}

/** Choix exclusif en ligne (file, période, onglets courts). */
export function Seg<T extends string | number>({ value, options, onChange, label, className, disabled }: { value: T; options: readonly (readonly [T, ReactNode])[]; onChange: (v: T) => void; label?: string; className?: string; disabled?: boolean }) {
  return (
    <div className={cx("seg", className)} role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" aria-pressed={v === value} disabled={disabled} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Onglets soulignés (fiche de partie, modes de jeu, collection). */
export function Tabs<T extends string>({ value, options, onChange, className }: { value: T; options: readonly (readonly [T, ReactNode])[]; onChange: (v: T) => void; className?: string }) {
  return (
    <nav className={cx("tabs", className)} role="tablist">
      {options.map(([v, text]) => (
        <button key={v} role="tab" aria-selected={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </nav>
  );
}

/** Bouton « Actualiser » : tourne le temps de la relecture. */
export function RefreshButton({ onRefresh, label, className }: { onRefresh: () => Promise<void> | void; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setBusy(false), 600);
    }
  };
  return (
    <button type="button" className={cx(label ? "btn btn-quiet btn-s" : "icon-btn", busy && "spinning", className)} onClick={go} disabled={busy} title="Actualiser (historique, profil, amis, classement)" aria-label={label ?? "Actualiser"}>
      <Icon name="refresh" size={label ? 14 : 17} />
      {label && <span>{busy ? "Actualisation…" : label}</span>}
    </button>
  );
}

/** Message centré pour un état vide, une attente ou une erreur. */
export function Empty({ title, children, className }: { title?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cx("empty", className)}>
      {title && <b>{title}</b>}
      {children && <p>{children}</p>}
    </div>
  );
}

/** Chiffre clé avec son libellé (KDA, CS/min, écart d'or…). */
export function Kpi({ label, value, sub, tone, big, children }: { label: string; value?: string; sub?: ReactNode; tone?: number | null; big?: boolean; children?: ReactNode }) {
  return (
    <div className={cx("kpi", big && "kpi-big")}>
      <span className="label">{label}</span>
      <b className={tone === undefined || tone === null ? undefined : tone >= 0 ? "up" : "down"}>{children ?? <CountUp text={value ?? "–"} />}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

/** Barre de proportion victoires / défaites. */
export const WinBar = ({ ratio }: { ratio: number }) => (
  <i className="winbar" aria-hidden="true">
    <i style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
  </i>
);
