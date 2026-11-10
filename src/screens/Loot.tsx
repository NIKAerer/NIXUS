import { useCallback, useEffect, useMemo, useState } from "react";
import { Art } from "../components/ui";
import { championSquare, gameAsset, lcu, skinSplash } from "../lib/lcu";
import { friendlyError } from "../lib/errors";

interface LootItem {
  lootId: string;
  lootName?: string;
  type?: string;
  displayCategories?: string;
  count: number;
  localizedName?: string;
  itemDesc?: string;
  disenchantValue?: number;
  upgradeEssenceValue?: number;
  disenchantLootName?: string;
  tilePath?: string;
  storeItemId?: number;
  parentStoreItemId?: number;
  itemStatus?: string;
  rarity?: string;
}
interface Recipe {
  recipeName: string;
  type?: string;
  contextMenuText?: string;
  description?: string;
  slots: { lootIds: string[]; quantity: number }[];
  outputs?: { lootName?: string; quantity?: number }[];
}

const SECTIONS: [string, string, (l: LootItem) => boolean][] = [
  ["chest", "Coffres et clés", (l) => l.displayCategories === "CHEST" || /^(CHEST|MATERIAL_key)/.test(l.lootId)],
  ["champ", "Champions", (l) => l.displayCategories === "CHAMPION"],
  ["skin", "Skins", (l) => l.displayCategories === "SKIN"],
  ["other", "Autres", () => true],
];
const ESSENCE: Record<string, string> = { CURRENCY_champion: "Essence bleue", CURRENCY_cosmetic: "Essence orange", CURRENCY_mythic: "Essence mythique" };

function lootImage(l: LootItem) {
  if (l.displayCategories === "CHAMPION" && l.storeItemId) return championSquare(l.storeItemId);
  if (l.displayCategories === "SKIN" && l.storeItemId) return skinSplash(Math.floor(l.storeItemId / 1000), l.storeItemId);
  return gameAsset(l.tilePath);
}
const lootName = (l: LootItem) => l.localizedName || l.itemDesc || l.lootName || l.lootId;

/** Butin Hextech : ouvrir, désenchanter, améliorer. Chaque fabrication part d'un clic, comme dans le client. */
export function Loot() {
  const [loot, setLoot] = useState<LootItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LootItem | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const reload = useCallback(() => lcu<LootItem[]>("GET", "/lol-loot/v1/player-loot").then((l) => setLoot(l.filter((x) => x.count > 0)), (e) => setError(friendlyError(e))), []);
  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setRecipes(null);
    if (!selected) return;
    lcu<Recipe[]>("GET", `/lol-loot/v1/recipes/initial-item/${encodeURIComponent(selected.lootId)}`).then(
      (r) => setRecipes(r.filter((x) => x.slots?.length)),
      () => setRecipes([]),
    );
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
    const irreversible = /disenchant|reroll/i.test(r.recipeName) || r.type === "DISENCHANT";
    if (irreversible && !confirm(`${r.contextMenuText ?? "Désenchanter"} : ${lootName(selected)} ? C'est définitif.`)) return;
    const ids = r.slots.map((s) => (s.lootIds.includes(selected.lootId) ? selected.lootId : s.lootIds.find((id) => (owned.get(id) ?? 0) >= s.quantity) ?? s.lootIds[0]));
    setBusy(true);
    setNote(null);
    try {
      await lcu("POST", `/lol-loot/v1/recipes/${encodeURIComponent(r.recipeName)}/craft?repeat=1`, ids);
      setNote(`${r.contextMenuText ?? "Fait"} : ${lootName(selected)}.`);
      setSelected(null);
      await reload();
    } catch (e) {
      setNote(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const essences = Object.entries(ESSENCE).map(([id, label]) => [label, owned.get(id) ?? 0] as const);

  return (
    <div className="page col loot">
      <div className="eyebrow">Hextech</div>
      <h1 className="title">BUTIN</h1>
      <div className="loot-wallet">
        {essences.map(([label, n]) => (
          <span key={label}>
            <b>{n.toLocaleString("fr-FR")}</b> {label}
          </span>
        ))}
        <span>
          <b>{owned.get("MATERIAL_key") ?? 0}</b> clés · <b>{owned.get("MATERIAL_key_fragment") ?? 0}</b> fragments de clé
        </span>
        <input className="search" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher dans le butin" />
      </div>
      {note && <p className="col-note">{note}</p>}
      {error && <p className="re-error">{error}</p>}
      {!loot && !error && <p className="gd-wait">Chargement…</p>}
      {loot && sections.length === 0 && <p className="gd-wait">Ton butin est vide.</p>}
      {sections.map((s) => (
        <section key={s.id} className="loot-sec">
          <h2>
            {s.label} <span>{s.list.reduce((n, l) => n + l.count, 0)}</span>
          </h2>
          <div className={`col-grid ${s.id === "skin" ? "wide" : ""} ${s.id === "chest" || s.id === "other" ? "small" : ""}`}>
            {s.list.map((l) => (
              <button key={l.lootId} className={`col-item loot-item ${selected?.lootId === l.lootId ? "equipped" : ""} ${l.type?.includes("RENTAL") ? "shard" : ""}`} onClick={() => setSelected(l)} title={lootName(l)}>
                <Art src={lootImage(l)} alt="" />
                {l.count > 1 && <em className="loot-count">×{l.count}</em>}
                {l.itemStatus === "OWNED" && <em className="loot-owned">Possédé</em>}
                <div className="col-txt">
                  <b>{lootName(l)}</b>
                  {!!l.disenchantValue && <small>{l.disenchantValue} {l.disenchantLootName === "CURRENCY_cosmetic" ? "EO" : "EB"} au désenchantement</small>}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      {selected && (
        <aside className="loot-panel" role="dialog" aria-label={lootName(selected)}>
          <header>
            <b>{lootName(selected)}</b>
            <button className="fp-close" onClick={() => setSelected(null)} aria-label="Fermer">
              <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <Art src={lootImage(selected)} alt="" className="loot-panel-art" />
          {recipes === null && <p className="gd-wait">Chargement…</p>}
          {recipes?.length === 0 && <p className="gd-wait">Rien à faire avec cet objet.</p>}
          <div className="loot-actions">
            {recipes?.map((r) => (
              <button key={r.recipeName} className={`btn small ${r.type === "DISENCHANT" || /disenchant/i.test(r.recipeName) ? "btn-ghost" : "btn-red"}`} disabled={busy || !ready(r)} onClick={() => craft(r)} title={r.description}>
                {r.contextMenuText || r.recipeName}
                {r.slots
                  .filter((sl) => !sl.lootIds.includes(selected.lootId))
                  .map((sl) => ` · ${sl.quantity} ${ESSENCE[sl.lootIds[0]] ?? (sl.lootIds[0] === "MATERIAL_key" ? "clé" : sl.lootIds[0].replace(/_/g, " ").toLowerCase())}`)
                  .join("")}
              </button>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
