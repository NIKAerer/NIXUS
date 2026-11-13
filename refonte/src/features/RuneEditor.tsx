import { useMemo, useState, type CSSProperties } from "react";
import { SHARD_ROWS, type RuneTree } from "../lib/ddragon";
import { friendlyError } from "../lib/errors";
import { lcu } from "../lib/lcu";
import type { RunePage } from "../lib/types";
import { Art, CloseButton, Modal, cx } from "../ui";

/** Couleur de chaque arbre, comme dans le client. */
const TREE_COLORS: Record<number, string> = { 8000: "#c8aa6e", 8100: "#d44242", 8200: "#9faafc", 8300: "#49aab9", 8400: "#a1d586" };
const SHARD_LABELS = ["Offensif", "Flexible", "Défensif"];
type Shown = { name: string; icon: string; desc?: string };

/**
 * Éditeur de runes, comme celui du client : arbre principal (clé de voûte + 3), arbre secondaire (2 runes
 * de lignes différentes) et 3 fragments. Enregistre dans la page choisie, ou crée une page si elle n'est
 * pas modifiable (pages par défaut de Riot).
 */
export function RuneEditor({ styles, page, championName, splash, onSaved, onClose }: { styles: RuneTree[]; page: RunePage | undefined; championName?: string; splash?: string; onSaved: (page: RunePage) => void; onClose: () => void }) {
  const first = styles[0]?.id ?? 8000;
  const [primary, setPrimary] = useState(page?.primaryStyleId ?? first);
  const [sub, setSub] = useState(page?.subStyleId ?? styles.find((s) => s.id !== primary)?.id ?? 8100);
  const tree = (id: number) => styles.find((s) => s.id === id);
  const p = tree(primary);
  const sec = tree(sub);
  const ids = page?.selectedPerkIds ?? [];

  const [main, setMain] = useState<number[]>(() => (p ? p.slots.map((sl) => sl.runes.find((r) => ids.includes(r.id))?.id ?? 0) : [0, 0, 0, 0]));
  // Secondaire : jusqu'à 2 runes, chacune sur une ligne différente (lignes 1 à 3).
  const [second, setSecond] = useState<[number, number][]>(() =>
    sec
      ? sec.slots
          .map((sl, row) => [row, sl.runes.find((r) => ids.includes(r.id))?.id ?? 0] as [number, number])
          .filter(([row, id]) => row > 0 && id)
          .slice(0, 2)
      : [],
  );
  const [shards, setShards] = useState<number[]>(() => {
    const tail = ids.slice(6, 9);
    return SHARD_ROWS.map((row, i) => (row.some((r) => r.id === tail[i]) ? tail[i] : row[0].id));
  });
  const [name, setName] = useState(page?.isEditable === false || !page ? `NIXUS${championName ? ` · ${championName}` : ""}` : page.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<Shown | null>(null);

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
  const perkIds = useMemo(() => [...main, ...[...second].sort((a, b) => a[0] - b[0]).map(([, id]) => id), ...shards], [main, second, shards]);

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
      setError(/max|limit|full/i.test(String(e)) ? "Tu as atteint le nombre maximum de pages : choisis une de tes pages modifiables avant d'ouvrir l'éditeur." : friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const keystone = p?.slots[0]?.runes.find((r) => r.id === main[0]);
  const shown = focus ?? (keystone ? { name: keystone.name, icon: keystone.icon, desc: keystone.shortDesc } : null);
  const hover = (r: { name: string; icon: string; shortDesc?: string }) => {
    const on = () => setFocus({ name: r.name, icon: r.icon, desc: r.shortDesc });
    const off = () => setFocus(null);
    return { onMouseEnter: on, onMouseLeave: off, onFocus: on, onBlur: off };
  };
  const vars = { "--tree": TREE_COLORS[primary] ?? "#c8aa6e", "--tree2": TREE_COLORS[sub] ?? "#c8aa6e" } as CSSProperties;
  const allRunes = [...(p?.slots ?? []), ...(sec?.slots ?? [])].flatMap((sl) => sl.runes);

  return (
    <Modal label="Modifier les runes" onClose={onClose} size="l" className="runes" style={vars}>
      {splash && <div className="runes-splash" style={{ backgroundImage: `url(${splash})` }} aria-hidden="true" />}
      <header className="modal-head">
        <div className="grow">
          <span className="eyebrow">Page de runes{championName ? ` · ${championName}` : ""}</span>
          <input className="runes-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Nom de la page" />
          {page?.isEditable === false && <small>Page par défaut : une nouvelle page sera créée.</small>}
        </div>
        <CloseButton onClose={onClose} />
      </header>

      <div className="runes-body">
        <section className="runes-col">
          <TreeTabs styles={styles} value={primary} onPick={pickPrimary} label="Principal" />
          <div className="runes-path">
            {p?.slots.map((sl, row) => (
              <div key={row} className={cx("runes-row", row === 0 && "keystones", main[row] > 0 && "done")}>
                {sl.runes.map((r) => (
                  <button key={r.id} className="rune" aria-pressed={main[row] === r.id} onClick={() => pickMain(row, r.id)} aria-label={r.name} {...hover(r)}>
                    <Art src={r.icon} alt={r.name} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="runes-col second">
          <TreeTabs styles={styles} value={sub} disabled={primary} onPick={pickSub} label="Secondaire" />
          <div className="runes-path">
            {sec?.slots.slice(1).map((sl, i) => {
              const row = i + 1;
              return (
                <div key={row} className={cx("runes-row", second.some(([r]) => r === row) && "done")}>
                  {sl.runes.map((r) => (
                    <button key={r.id} className="rune" aria-pressed={second.some(([, id]) => id === r.id)} onClick={() => pickSecond(row, r.id)} aria-label={r.name} {...hover(r)}>
                      <Art src={r.icon} alt={r.name} />
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="runes-shards">
            {SHARD_ROWS.map((row, i) => (
              <div key={i} className="runes-row">
                <span className="label">{SHARD_LABELS[i]}</span>
                {row.map((r) => (
                  <button key={r.id} className="rune shard" aria-pressed={shards[i] === r.id} onClick={() => setShards((s) => s.map((v, j) => (j === i ? r.id : v)))} aria-label={r.name} {...hover(r)}>
                    <Art src={r.icon} alt={r.name} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>

        <aside className="runes-detail" aria-live="polite">
          {shown ? (
            <>
              <Art src={shown.icon} />
              <h3 className="h2">{shown.name}</h3>
              {shown.desc && <p className="dim">{shown.desc}</p>}
            </>
          ) : (
            <p className="note">Choisis ta clé de voûte pour commencer.</p>
          )}
        </aside>
      </div>

      <footer className="modal-foot">
        <div className="runes-summary" aria-label="Runes choisies">
          {perkIds.slice(0, 6).map((id, i) => {
            const r = allRunes.find((x) => x.id === id);
            return (
              <span key={i} className={cx(i === 0 && "key", i >= 4 && "sub")}>
                {r ? <Art src={r.icon} alt={r.name} /> : null}
              </span>
            );
          })}
        </div>
        <span className="grow" />
        {error && (
          <span className="note bad" role="alert">
            {error}
          </span>
        )}
        {!complete && !error && <span className="note">4 runes dans le principal, 2 dans le secondaire.</span>}
        <button className="btn btn-quiet" onClick={onClose}>
          Annuler
        </button>
        <button className="btn btn-red" onClick={save} disabled={!complete || saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </footer>
    </Modal>
  );
}

function TreeTabs({ styles, value, disabled, onPick, label }: { styles: RuneTree[]; value: number; disabled?: number; onPick: (id: number) => void; label: string }) {
  return (
    <div className="runes-trees" role="group" aria-label={`Arbre ${label.toLowerCase()}`}>
      <span className="label">{label}</span>
      {styles.map((s) => (
        <button key={s.id} style={{ "--c": TREE_COLORS[s.id] ?? "#c8aa6e" } as CSSProperties} aria-pressed={s.id === value} disabled={s.id === disabled} onClick={() => onPick(s.id)} title={s.name}>
          <Art src={s.icon} alt={s.name} />
        </button>
      ))}
      <b>{styles.find((s) => s.id === value)?.name}</b>
    </div>
  );
}
