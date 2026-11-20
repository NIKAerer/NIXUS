import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { neckOf, watch } from "../lib/breath";
import { championSquare } from "../lib/lcu";
import { Icon } from "./Icon";

export { Icon } from "./Icon";
export type { IconName } from "./Icon";
export * from "./format";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const SKIN_ART = /\/splash-art\/centered\/skin\/\d+$/;
const RETRIES = 2;

/**
 * Image qui apparaît en fondu une fois chargée et garde sa place si elle échoue.
 * Un visuel qui ne charge pas n'est pas abandonné tout de suite : le splash d'un skin que le CDN ne connaît pas
 * retombe sur le splash classique du champion, et une erreur passagère (CDN saturé) est retentée deux fois.
 */
export function Art({ src, alt = "", className, style, imgRef }: { src: string; alt?: string; className?: string; style?: CSSProperties; imgRef?: (el: HTMLImageElement | null) => void }) {
  const [state, setState] = useState<{ from: string; url: string; attempt: number; status: "loading" | "ready" | "error" }>({ from: src, url: src, attempt: 0, status: "loading" });
  // L'adresse a changé (autre champion dans le même emplacement) : on repart de zéro, même après un échec.
  const cur = state.from === src ? state : { from: src, url: src, attempt: 0, status: "loading" as const };
  if (cur !== state) setState(cur);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const failed = () => {
    if (SKIN_ART.test(cur.url)) return setState({ ...cur, url: cur.url.replace(/\/skin\/\d+$/, ""), status: "loading" });
    if (cur.attempt >= RETRIES) return setState({ ...cur, status: "error" });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState((s) => (s.from === cur.from ? { ...s, attempt: s.attempt + 1, status: "loading" } : s)), 1500 * (cur.attempt + 1));
  };

  if (cur.status === "error" || !src) return <span className={cx(className, "art-missing")} aria-hidden="true" />;
  return (
    <img
      key={cur.attempt}
      ref={imgRef}
      style={style}
      src={cur.url}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cx(className, "art", cur.status === "ready" && "ready")}
      onLoad={() => setState((s) => (s.from === cur.from ? { ...s, status: "ready" } : s))}
      onError={failed}
    />
  );
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

/**
 * Menu déroulant au style de l'app. Remplace le `<select>` natif, dont la liste s'ouvre
 * avec les couleurs du système (bandes et séparateurs blancs sous Windows).
 * La liste est posée sur `body` pour ne pas être coupée par un panneau qui défile.
 */
export function Select<T extends string | number>({ value, options, onChange, label, id, className, autoFocus, onClose, describedBy }: { value: T; options: readonly (readonly [T, ReactNode])[]; onChange: (v: T) => void; label?: string; id?: string; className?: string; autoFocus?: boolean; onClose?: () => void; describedBy?: string }) {
  const [open, setOpen] = useState(!!autoFocus);
  const [hover, setHover] = useState(-1);
  const [pos, setPos] = useState<CSSProperties>({});
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const current = options.find(([v]) => v === value);
  const close = (refocus = true) => {
    setOpen(false);
    onClose?.();
    if (refocus) btn.current?.focus();
  };
  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const up = below < 220 && r.top > below;
    const max = Math.min(340, (up ? r.top : below) - 6);
    setPos({ left: r.left, minWidth: r.width, maxHeight: max, ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
  };
  useEffect(() => {
    if (autoFocus) btn.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    if (!open) return;
    place();
    setHover(Math.max(0, options.findIndex(([v]) => v === value)));
    const away = (e: MouseEvent) => !btn.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node) && close(false);
    const move = (e: Event) => !menu.current?.contains(e.target as Node) && close(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("resize", move);
    document.addEventListener("scroll", move, true);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("resize", move);
      document.removeEventListener("scroll", move, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (open && hover >= 0) menu.current?.children[hover]?.scrollIntoView({ block: "nearest" });
  }, [open, hover]);
  const pick = (v: T) => {
    if (v !== value) onChange(v);
    close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const n = options.length;
      setHover((h) => (h + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      if (options[hover]) pick(options[hover][0]);
    } else if (e.key === "Tab" && open) close(false);
  };
  return (
    <>
      <button ref={btn} type="button" id={id} className={cx("input select", className)} aria-haspopup="listbox" aria-expanded={open} aria-label={label} aria-describedby={describedBy} onClick={() => (open ? close() : setOpen(true))} onKeyDown={onKey}>
        <span>{current?.[1]}</span>
        <Icon name="chevron" size={15} className="select-chev" />
      </button>
      {open &&
        createPortal(
          <div ref={menu} className="select-menu" role="listbox" aria-label={label} style={pos}>
            {options.map(([v, l], i) => (
              <button key={String(v)} type="button" role="option" tabIndex={-1} aria-selected={v === value} className={cx(i === hover && "hover")} onMouseEnter={() => setHover(i)} onClick={() => pick(v)}>
                {l}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
