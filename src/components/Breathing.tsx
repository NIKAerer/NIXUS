import { useMemo, useRef } from "react";
import { Art } from "./ui";
import { neckOf, watch } from "../lib/breath";

/**
 * Image de champion ou de skin qui « respire ».
 * - `full` (grands visuels : splash, bannières, cartes du champ select) : la même image en 3 calques
 *   (corps, épaules, tête) avec des masques aux bords adoucis ; la tête s'incline autour du cou.
 * - sinon (icônes, vignettes, listes) : un léger souffle sur toute l'image.
 * Les réglages globaux (marche/arrêt, intensité, pause en partie) sont des classes et variables sur `.app`.
 */
export function Breathing({
  src,
  champ,
  full,
  className,
  alt = "",
  neck,
  amount = 1,
}: {
  src: string;
  /** Id du champion, pour la table de réglage du cou. */
  champ?: number;
  full?: boolean;
  className?: string;
  alt?: string;
  /** Cou [vertical %, horizontal %] si on veut forcer une valeur. */
  neck?: [number, number];
  /** Multiplie l'intensité réglée dans Paramètres (1 = normal). */
  amount?: number;
}) {
  // Rythme et phase tirés au hasard une fois : les images ne bougent pas toutes ensemble.
  const timing = useMemo(() => {
    const t = 4.6 + Math.random() * 1.6;
    return { t, d: -Math.random() * t };
  }, []);
  const [ny, nx] = neck ?? neckOf(champ);
  const style = {
    "--br-t": `${timing.t.toFixed(2)}s`,
    "--br-d": `${timing.d.toFixed(2)}s`,
    "--br-k": amount,
    "--ny": `${ny}%`,
    "--nx": `${nx}%`,
  } as React.CSSProperties;
  const r1 = useRef<HTMLImageElement | null>(null);
  const r2 = useRef<HTMLImageElement | null>(null);
  const r3 = useRef<HTMLImageElement | null>(null);
  const cls = (c: string) => [className, "br", c].filter(Boolean).join(" ");

  if (!full) return <Art src={src} alt={alt} className={cls("br-lite")} style={style} imgRef={(el) => watch(el, r1)} />;
  return (
    <>
      <Art src={src} alt={alt} className={cls("br-body")} style={style} imgRef={(el) => watch(el, r1)} />
      <Art src={src} className={cls("br-sh")} style={style} imgRef={(el) => watch(el, r2)} />
      <Art src={src} className={cls("br-head")} style={style} imgRef={(el) => watch(el, r3)} />
    </>
  );
}
