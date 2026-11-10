import { BadgeTag, useBadge } from "../lib/badges";
import { useEffect, useMemo, useRef, useState } from "react";
import { Breathing } from "./Breathing";
import type { Match } from "../lib/types";
import { championSquare, freshSplash, queueName, skinPoolSize, timeAgo } from "../lib/lcu";

/** Image qui apparaît en fondu une fois chargée et disparaît si elle échoue. */
export function Art({ src, alt = "", className, style, imgRef }: { src: string; alt?: string; className?: string; style?: React.CSSProperties; imgRef?: (el: HTMLImageElement | null) => void }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // Garde la place de l'image (et sa couleur de fond) si le visuel ne charge pas.
  if (state === "error") return <div className={[className, "ph"].filter(Boolean).join(" ")} aria-hidden="true" />;
  return (
    <img
      ref={imgRef}
      style={style}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={[className, state === "ready" ? "ready" : ""].filter(Boolean).join(" ")}
      onLoad={() => setState("ready")}
      onError={() => setState("error")}
    />
  );
}

// Couleur du badge de mode : classé, ARAM, Arena.
const MODE_TONE: Record<number, string> = { 420: "ranked", 440: "ranked", 450: "aram", 2400: "aram", 1700: "arena", 1710: "arena" };

export function MatchTile({ match, champion, onOpen, puuid }: { match: Match; champion: string; onOpen?: (m: Match) => void; puuid?: string }) {
  const p = match.participants[0];
  const badge = useBadge(match.gameId, puuid);
  const pool = skinPoolSize();
  // Un skin au hasard différent pour chaque partie affichée.
  const splash = useMemo(() => (p ? freshSplash(p.championId) : ""), [match.gameId, p?.championId, pool]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  const { kills, deaths, assists, win } = p.stats;
  return (
    <button className="tile tile-btn" title={`${queueName(match.queueId)} · ${timeAgo(match.gameCreation)} · voir le détail`} onClick={() => onOpen?.(match)}>
      <Breathing src={splash} champ={p.championId} />
      <div className="shade" />
      <em className={`tile-mode ${MODE_TONE[match.queueId] ?? ""}`}>{queueName(match.queueId)}</em>
      <BadgeTag badge={badge} />
      <div className="txt">
        <b>
          {champion} · {win ? "Victoire" : "Défaite"}
        </b>
        <span>
          {kills}/{deaths}/{assists} · {timeAgo(match.gameCreation)}
        </span>
      </div>
      <i className="bar" style={{ background: win ? "var(--win)" : "var(--loss)" }} />
    </button>
  );
}

export function ChampIcon({ id, className }: { id: number; className?: string }) {
  if (!id) return <div className="ph" />;
  return <Breathing src={championSquare(id)} champ={id} className={className} />;
}

const calm = () => document.querySelector(".app.no-fx") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Texte dont le premier nombre « monte » jusqu'à sa valeur (≈ 0,6 s), en gardant le format (signe, virgule, %, LP…).
 * Sans animation si le système demande moins de mouvement ou si les effets sont coupés.
 */
export function CountUp({ text }: { text: string }) {
  const m = text.match(/^(.*?)([+\u2212-]?)(\d[\d\u202f\u00a0 ]*)(,(\d+))?(.*)$/s);
  const [shown, setShown] = useState(text);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!m || last.current === text || calm()) {
      last.current = text;
      setShown(text);
      return;
    }
    const first = last.current === null;
    last.current = text;
    if (!first) return setShown(text); // seulement au premier affichage : pas de clignotement quand on change de filtre
    const [, pre, sign, int, , dec, post] = m;
    const digits = dec?.length ?? 0;
    const target = Number(int.replace(/\D/g, "") + (digits ? "." + dec : ""));
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

/** Bloc gris qui pulse doucement à la place d'un contenu en chargement. */
export const Skeleton = ({ className = "", style }: { className?: string; style?: React.CSSProperties }) => <span className={`skel ${className}`} style={style} aria-hidden="true" />;
