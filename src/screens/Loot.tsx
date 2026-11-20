import { useCallback, useEffect, useMemo, useState } from "react";
import { friendlyError } from "../lib/errors";
import { CURRENCIES, CURRENCY_SHORT, LOOT_MATERIALS, looksLikeCode, lootKind, lootTypeLabel, recipeLabel } from "../lib/labels";
import { championSquare, gameAsset, lcu, skinSplash } from "../lib/lcu";
import { Art, CloseButton, Empty, Icon, Modal, Skeleton, cx, int, plural } from "../ui";

interface LootItem {
  lootId: string;
  lootName?: string;
  type?: string;
  displayCategories?: string;
  count: number;
  localizedName?: string;
  itemDesc?: string;
  disenchantValue?: number;
  disenchantLootName?: string;
  tilePath?: string;
  storeItemId?: number;
  itemStatus?: string;
}
interface Recipe {
  recipeName: string;
  type?: string;
  contextMenuText?: string;
  description?: string;
  slots: { lootIds: string[]; quantity: number }[];
}

const SECTIONS: [string, string, (l: LootItem) => boolean][] = [
  ["chest", "Coffres et clés", (l) => l.displayCategories === "CHEST" || /^(CHEST|MATERIAL_key)/.test(l.lootId)],
  ["champ", "Champions", (l) => l.displayCategories === "CHAMPION"],
  ["skin", "Skins", (l) => l.displayCategories === "SKIN"],
  ["other", "Autres", () => true],
];
const ESSENCE: Record<string, string> = { CURRENCY_champion: CURRENCIES.CURRENCY_champion, CURRENCY_cosmetic: CURRENCIES.CURRENCY_cosmetic, CURRENCY_mythic: CURRENCIES.CURRENCY_mythic };

function lootImage(l: LootItem) {
  if (l.displayCategories === "CHAMPION" && l.storeItemId) return championSquare(l.storeItemId);
  if (l.displayCategories === "SKIN" && l.storeItemId) return skinSplash(Math.floor(l.storeItemId / 1000), l.storeItemId);
  return gameAsset(l.tilePath);
}
/** Nom lisible d'un objet : le client laisse souvent localizedName vide et met le nom du champion ou du skin dans itemDesc. */
const readable = (s?: string) => (s && !looksLikeCode(s) ? s : "");
const lootName = (l: LootItem) =>
  readable(l.localizedName) || readable(l.itemDesc) || CURRENCIES[l.lootId] || LOOT_MATERIALS[l.lootId] || lootTypeLabel(lootKind(l));
const isFinal = (r: Recipe) => /disenchant|reroll/i.test(r.recipeName) || r.type === "DISENCHANT" || r.type === "REROLL";
const costName = (id: string, loot: LootItem[] | null) => {
  if (CURRENCIES[id]) return CURRENCIES[id].replace(/^Essence/, "essence");
  if (id === "MATERIAL_key") return "clé";
  if (id === "MATERIAL_key_fragment") return "fragments de clé";
  const item = loot?.find((l) => l.lootId === id);
  return (item ? lootName(item) : lootTypeLabel(lootKind({ lootId: id }))).toLowerCase();
};

/** Butin Hextech : ouvrir, désenchanter, améliorer. Chaque fabrication part d'un clic, comme dans le client. */
export function Loot() {
  const [loot, setLoot] = useState<LootItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LootItem | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  /** Recette définitive en attente d'un second clic. */
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");

  const reload = useCallback(
    () =>
      lcu<LootItem[]>("GET", "/lol-loot/v1/player-loot").then(
        (l) => setLoot(l.filter((x) => x.count > 0)),
        (e) => setError(friendlyError(e)),
      ),
    [],
  );
  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setRecipes(null);
    setArmed(null);
    if (!selected) return;
    let alive = true;
    lcu<Recipe[]>("GET", `/lol-loot/v1/recipes/initial-item/${encodeURIComponent(selected.lootId)}`).then(
      (r) => alive && setRecipes(r.filter((x) => x.slots?.length)),
      () => alive && setRecipes([]),
    );
    return () => {
      alive = false;
    };
  }, [selected]);

  const owned = useMemo(() => new Map((loot ?? []).map((l) => [l.lootId, l.count])), [loot]);
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rest = (loot ?? []).filter((l) => !ESSENCE[l.lootId] && (!q || lootName(l).toLowerCase().includes(q)));
    const used = new Set<string>();
    return SECTIONS.map(([id, label, test]) => {
      const list = rest.filter((l) => !used.has(l.lootId) && test(l));
      list.forEach((l) => used.add(l.lootId));
      return { id, label, list: list.sort((a, b) => lootName(a).localeCompare(lootName(b), "fr")) };
    }).filter((s) => s.list.length);
  }, [loot, query]);

  const ready = (r: Recipe) => r.slots.every((s) => s.lootIds.some((id) => (owned.get(id) ?? 0) >= s.quantity));
  const craft = async (r: Recipe) => {
    if (!selected || busy) return;
    // Désenchanter ou relancer est définitif : on demande un second clic.
    if (isFinal(r) && armed !== r.recipeName) return setArmed(r.recipeName);
    const ids = r.slots.map((s) => (s.lootIds.includes(selected.lootId) ? selected.lootId : s.lootIds.find((id) => (owned.get(id) ?? 0) >= s.quantity) ?? s.lootIds[0]));
    setBusy(true);
    setNote(null);
    try {
      await lcu("POST", `/lol-loot/v1/recipes/${encodeURIComponent(r.recipeName)}/craft?repeat=1`, ids);
      setNote({ ok: true, text: `${recipeLabel(r)} : ${lootName(selected)}. C'est fait.` });
      setSelected(null);
      await reload();
    } catch (e) {
      setNote({ ok: false, text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page loot">
      <header className="page-head">
        <div className="grow">
          <span className="eyebrow">Hextech</span>
          <h1>Butin</h1>
        </div>
        <label className="search-box">
          <Icon name="search" size={15} />
          <input className="input" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher dans le butin" />
        </label>
      </header>

      <div className="kpis">
        {Object.entries(ESSENCE).map(([id, label]) => (
          <div key={id} className={cx("kpi", `ess-${id.split("_")[1]}`)}>
            <span className="label">{label}</span>
            <b>{int(owned.get(id) ?? 0)}</b>
          </div>
        ))}
        <div className="kpi">
          <span className="label">Clés</span>
          <b>{owned.get("MATERIAL_key") ?? 0}</b>
          <small>{plural(owned.get("MATERIAL_key_fragment") ?? 0, "fragment")} de clé</small>
        </div>
      </div>

      {note && (
        <p className={cx("note", note.ok ? "ok" : "bad")} role="status">
          {note.text}
        </p>
      )}
      {error && <Empty title="Butin indisponible">{error}</Empty>}
      {!loot && !error && (
        <div className="grid small" aria-label="Chargement">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="item" />
          ))}
        </div>
      )}
      {loot && sections.length === 0 && <Empty title={query ? "Rien à ce nom" : "Ton butin est vide"} />}

      {sections.map((s) => (
        <section key={s.id}>
          <h2 className="sec-head">
            {s.label} <span>{s.list.reduce((n, l) => n + l.count, 0)}</span>
          </h2>
          <div className={cx("grid", s.id === "skin" ? "wide" : s.id === "champ" ? "" : "small")}>
            {s.list.map((l) => (
              <button key={l.lootId} className={cx("item", l.type?.includes("RENTAL") && "shard")} onClick={() => setSelected(l)} title={lootName(l)}>
                <span className="item-art">
                  <Art src={lootImage(l)} />
                </span>
                {l.count > 1 && <span className="tag item-count">×{l.count}</span>}
                {l.itemStatus === "OWNED" && <span className="tag green item-tag">Possédé</span>}
                <div className="item-txt">
                  <b>{lootName(l)}</b>
                  {!!l.disenchantValue && (
                    <small>
                      {l.disenchantValue} {CURRENCY_SHORT[l.disenchantLootName ?? ""] ?? "EB"} au désenchantement
                    </small>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      {selected && (
        <Modal label={lootName(selected)} onClose={() => setSelected(null)} size="s" className="loot-modal">
          <CloseButton onClose={() => setSelected(null)} className="modal-x" />
          <div className="loot-art">
            <Art src={lootImage(selected)} />
          </div>
          <div className="modal-body">
            <h2 className="h2">{lootName(selected)}</h2>
            <p className="note">
              {selected.count > 1 ? `Tu en as ${selected.count}. ` : ""}
              {selected.itemStatus === "OWNED" ? "Tu possèdes déjà l'objet complet." : ""}
            </p>
            {recipes === null && <p className="wait">Chargement…</p>}
            {recipes?.length === 0 && <p className="wait">Rien à faire avec cet objet.</p>}
            <div className="loot-actions">
              {recipes?.map((r) => {
                const cost = r.slots
                  .filter((sl) => !sl.lootIds.includes(selected.lootId))
                  .map((sl) => `${int(sl.quantity)} ${costName(sl.lootIds[0], loot)}`)
                  .join(" + ");
                const confirm = armed === r.recipeName;
                return (
                  <button key={r.recipeName} className={cx("btn", isFinal(r) ? (confirm ? "btn-white" : "btn-quiet") : "btn-red")} disabled={busy || !ready(r)} onClick={() => craft(r)} title={readable(r.description) || undefined}>
                    <span>{confirm ? "Confirmer : c'est définitif" : recipeLabel(r)}</span>
                    {cost && !confirm && <small>{cost}</small>}
                  </button>
                );
              })}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
