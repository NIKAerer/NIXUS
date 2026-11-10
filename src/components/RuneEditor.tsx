import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Art } from "./ui";
import { lcu } from "../lib/lcu";
import { friendlyError } from "../lib/errors";
import { SHARD_ROWS, type RuneTree } from "../lib/ddragon";
import type { RunePage } from "../lib/types";

interface Props {
  styles: RuneTree[];
  page: RunePage | undefined;
  championName?: string;
  /** Splash du champion en fond, si connu. */
  splash?: string;
  onSaved: (page: RunePage) => void;
  onClose: () => void;
}

/**
 * Éditeur de runes, comme celui du client : arbre principal (clé de voûte + 3), arbre secondaire (2 runes
 * de lignes différentes) et 3 fragments. Enregistre dans la page choisie, ou crée une page si elle n'est
 * pas modifiable (pages par défaut de Riot).
 */
/** Couleur de chaque arbre, comme dans le client. */
const TREE_COLORS: Record<number, string> = { 8000: "#c8aa6e", 8100: "#d44242", 8200: "#9faafc", 8300: "#49aab9", 8400: "#a1d586" };
const SHARD_LABELS = ["Offensif", "Flexible", "Défensif"];

export function RuneEditor({ styles, page, championName, splash, onSaved, onClose }: Props) {
  const first = styles[0]?.id ?? 8000;
  const [primary, setPrimary] = useState(page?.primaryStyleId ?? first);
  const [sub, setSub] = useState(page?.subStyleId ?? styles.find((s) => s.id !== primary)?.id ?? 8100);
  const tree = (id: number) => styles.find((s) => s.id === id);
  const p = tree(primary);
  const sec = tree(sub);
  const ids = page?.selectedPerkIds ?? [];

  const initMain = () => (p ? p.slots.map((sl, i) => sl.runes.find((r) => ids.includes(r.id))?.id ?? (i === 0 ? 0 : 0)) : [0, 0, 0, 0]);
  const [main, setMain] = useState<number[]>(initMain);
  // Secondaire : jusqu'à 2 runes, chacune sur une ligne différente (lignes 1 à 3).
  const initSecond = (): [number, number][] =>
    sec
      ? sec.slots
          .map((sl, row) => [row, sl.runes.find((r) => ids.includes(r.id))?.id ?? 0] as [number, number])
          .filter(([row, id]) => row > 0 && id)
          .slice(0, 2)
      : [];
  const [second, setSecond] = useState<[number, number][]>(initSecond);
  const [shards, setShards] = useState<number[]>(() => {
    const tail = ids.slice(6, 9);
    return SHARD_ROWS.map((row, i) => (row.some((r) => r.id === tail[i]) ? tail[i] : row[0].id));
  });
  const [name, setName] = useState(page?.isEditable === false || !page ? `NIXUS${championName ? ` · ${championName}` : ""}` : page.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ name: string; icon: string; desc?: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickPrimary = (id: number) => {
    if (id === primary) return;
    setPrimary(id);
    setMain([0, 0, 0, 0]);
    if (id === sub) {
      setSub(styles.find((s) => s.id !== id)!.id);
      setSecond([]);
    }
  };
  const pickSub = (id: number) => {
    if (id === sub || id === primary) return;
    setSub(id);
    setSecond([]);
  };
  const pickMain = (row: number, id: number) => setMain((m) => m.map((v, i) => (i === row ? id : v)));
  const pickSecond = (row: number, id: number) =>
    setSecond((list) => {
      const others = list.filter(([r]) => r !== row);
      return [...(others.length >= 2 ? others.slice(1) : others), [row, id]];
    });

  const complete = main.every(Boolean) && second.length === 2;
  const perkIds = useMemo(() => [...main, ...second.sort((a, b) => a[0] - b[0]).map(([, id]) => id), ...shards], [main, second, shards]);

  const save = async () => {
    if (!complete || saving) return;
    setSaving(true);
    setError(null);
    const body = { name: name.trim() || "NIXUS", primaryStyleId: primary, subStyleId: sub, selectedPerkIds: perkIds, current: true };
    try {
      let saved: RunePage;
      if (page && page.isEditable !== false) {
        await lcu("PUT", `/lol-perks/v1/pages/${page.id}`, { ...page, ...body });
        saved = { ...page, ...body };
      } else {
        saved = await lcu<RunePage>("POST", "/lol-perks/v1/pages", body);
      }
      await lcu("PUT", "/lol-perks/v1/currentpage", saved.id).catch(() => {});
      onSaved(saved);
      onClose();
    } catch (e) {
      const msg = friendlyError(e);
      setError(/max|limit|full/i.test(String(e)) ? "Tu as atteint le nombre maximum de pages : choisis une de tes pages modifiables avant d'ouvrir l'éditeur." : msg);
    } finally {
      setSaving(false);
    }
  };

  const keystone = p?.slots[0]?.runes.find((r) => r.id === main[0]);
  const shown = focus ?? (keystone ? { name: keystone.name, icon: keystone.icon, desc: keystone.shortDesc } : null);
  const hover = (r: { name: string; icon: string; shortDesc?: string }) => ({
    onMouseEnter: () => setFocus({ name: r.name, icon: r.icon, desc: r.shortDesc }),
    onMouseLeave: () => setFocus(null),
    onFocus: () => setFocus({ name: r.name, icon: r.icon, desc: r.shortDesc }),
    onBlur: () => setFocus(null),
  });
  const vars = { ["--tree" as string]: TREE_COLORS[primary] ?? "#c8aa6e", ["--tree2" as string]: TREE_COLORS[sub] ?? "#c8aa6e" };

  return createPortal(
    <div className="overlay re-overlay" onClick={onClose}>
      <div className="re re-big" style={vars} role="dialog" aria-modal="true" aria-label="Modifier les runes" onClick={(e) => e.stopPropagation()}>
        {splash && <div className="re-splash" style={{ backgroundImage: `url(${splash})` }} aria-hidden="true" />}
        <header className="re-head">
          <div className="re-title">
            <span className="eyebrow">Page de runes{championName ? ` · ${championName}` : ""}</span>
            <input className="re-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Nom de la page" />
            {page?.isEditable === false && <span className="re-note">Page par défaut : une nouvelle page sera créée.</span>}
          </div>
          <button className="gd-close" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="re-body">
          <section className="re-col re-primary">
            <TreeTabs styles={styles} value={primary} onPick={pickPrimary} label="Principal" />
            <div className="re-path">
              {p?.slots.map((sl, row) => (
                <div key={row} className={`re-row ${row === 0 ? "keystones" : ""} ${main[row] ? "done" : ""}`}>
                  {sl.runes.map((r) => (
                    <button key={r.id} className="re-rune" aria-pressed={main[row] === r.id} onClick={() => pickMain(row, r.id)} aria-label={r.name} {...hover(r)}>
                      <Art src={r.icon} alt={r.name} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="re-col re-secondary">
            <TreeTabs styles={styles} value={sub} disabled={primary} onPick={pickSub} label="Secondaire" />
            <div className="re-path second">
              {sec?.slots.slice(1).map((sl, i) => {
                const row = i + 1;
                return (
                  <div key={row} className={`re-row ${second.some(([r]) => r === row) ? "done" : ""}`}>
                    {sl.runes.map((r) => (
                      <button key={r.id} className="re-rune" aria-pressed={second.some(([, id]) => id === r.id)} onClick={() => pickSecond(row, r.id)} aria-label={r.name} {...hover(r)}>
                        <Art src={r.icon} alt={r.name} />
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="re-shards">
              {SHARD_ROWS.map((row, i) => (
                <div key={i} className="re-shard-row">
                  <span className="label">{SHARD_LABELS[i]}</span>
                  {row.map((r) => (
                    <button key={r.id} className="re-rune shard" aria-pressed={shards[i] === r.id} onClick={() => setShards((s) => s.map((v, j) => (j === i ? r.id : v)))} aria-label={r.name} {...hover(r)}>
                      <Art src={r.icon} alt={r.name} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <aside className="re-detail" aria-live="polite">
            {shown ? (
              <>
                <span className="re-detail-icon">
                  <Art src={shown.icon} alt="" />
                </span>
                <h3>{shown.name}</h3>
                {shown.desc && <p>{shown.desc}</p>}
              </>
            ) : (
              <p className="re-note">Choisis ta clé de voûte pour commencer.</p>
            )}
          </aside>
        </div>

        <footer className="re-foot">
          <div className="re-summary" aria-label="Runes choisies">
            {perkIds.slice(0, 6).map((id, i) => {
              const r = [...(p?.slots ?? []), ...(sec?.slots ?? [])].flatMap((sl) => sl.runes).find((x) => x.id === id);
              return <span key={i} className={`re-chip ${i === 0 ? "key" : ""} ${i >= 4 ? "sub" : ""}`}>{r ? <Art src={r.icon} alt={r.name} /> : null}</span>;
            })}
          </div>
          {error && <span className="re-error" role="alert">{error}</span>}
          {!complete && !error && <span className="re-note">4 runes dans le principal, 2 dans le secondaire.</span>}
          <button className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-red" onClick={save} disabled={!complete || saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function TreeTabs({ styles, value, disabled, onPick, label }: { styles: RuneTree[]; value: number; disabled?: number; onPick: (id: number) => void; label: string }) {
  return (
    <div className="re-trees" role="group" aria-label={`Arbre ${label.toLowerCase()}`}>
      <span className="re-tree-label">{label}</span>
      {styles.map((s) => (
        <button key={s.id} className="re-tree" style={{ ["--c" as string]: TREE_COLORS[s.id] ?? "#c8aa6e" }} aria-pressed={s.id === value} disabled={s.id === disabled} onClick={() => onPick(s.id)} title={s.name}>
          <Art src={s.icon} alt={s.name} />
        </button>
      ))}
      <b>{styles.find((s) => s.id === value)?.name}</b>
    </div>
  );
}
