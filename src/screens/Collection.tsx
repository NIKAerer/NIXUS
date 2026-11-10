import { Breathing } from "../components/Breathing";
import { useEffect, useMemo, useState } from "react";
import { Art } from "../components/ui";
import { championSquare, gameAsset, lcu, profileIcon, skinSplash } from "../lib/lcu";
import { friendlyError } from "../lib/errors";
import type { Summoner } from "../lib/types";

type Tab = "champions" | "skins" | "icons" | "emotes" | "wards";
const TABS: [Tab, string][] = [
  ["champions", "Champions"],
  ["skins", "Skins"],
  ["icons", "Icônes"],
  ["emotes", "Émotes"],
  ["wards", "Balises"],
];
const ROLES: [string, string][] = [
  ["", "Tous"],
  ["assassin", "Assassins"],
  ["fighter", "Combattants"],
  ["mage", "Mages"],
  ["marksman", "Tireurs"],
  ["support", "Supports"],
  ["tank", "Tanks"],
];
const PAGE = 120;

/** Raretés de skins, de la plus haute à la plus basse (valeurs de skins.json). */
const RARITIES: [string, string, number][] = [
  ["kTranscendent", "Transcendant", 7],
  ["kExalted", "Exalté", 6],
  ["kUltimate", "Ultime", 5],
  ["kMythic", "Mythique", 4],
  ["kLegendary", "Légendaire", 3],
  ["kEpic", "Épique", 2],
  ["kRare", "Rare", 1],
  ["kNoRarity", "Standard", 0],
];
const RANK: Record<string, number> = Object.fromEntries(RARITIES.map(([k, , n]) => [k, n]));
const RLABEL: Record<string, string> = Object.fromEntries(RARITIES.map(([k, l]) => [k, l]));
/** Rareté depuis skins.json, sinon depuis le chemin de la gemme ("…/rarity-gem-icons/epic.png"). */
const rarityOf = (r?: string, gem?: string) => {
  if (r && r in RANK) return r;
  const m = gem?.toLowerCase().match(/rarity-gem-icons\/(\w+)\.png/);
  if (!m) return "kNoRarity";
  const k = "k" + m[1][0].toUpperCase() + m[1].slice(1);
  return k in RANK ? k : "kNoRarity";
};

type Sort = "az" | "za" | "champ" | "rarity" | "mastery" | "recent" | "owned";
const SORTS: Record<Tab, [Sort, string][]> = {
  champions: [["az", "A → Z"], ["za", "Z → A"], ["mastery", "Maîtrise"], ["owned", "Possédés d'abord"]],
  skins: [["az", "A → Z"], ["za", "Z → A"], ["champ", "Par champion"], ["rarity", "Rareté"], ["owned", "Possédés d'abord"]],
  icons: [["az", "A → Z"], ["za", "Z → A"], ["recent", "Plus récentes"], ["owned", "Possédées d'abord"]],
  emotes: [["az", "A → Z"], ["za", "Z → A"], ["recent", "Plus récentes"], ["owned", "Possédées d'abord"]],
  wards: [["az", "A → Z"], ["za", "Z → A"], ["recent", "Plus récentes"], ["owned", "Possédées d'abord"]],
};
const SORT_KEY = "nixus.collection.sort";
const loadSorts = (): Partial<Record<Tab, Sort>> => {
  try {
    return JSON.parse(localStorage.getItem(SORT_KEY) || "{}");
  } catch {
    return {};
  }
};
const coll = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

interface InvChampion {
  id: number;
  name: string;
  roles?: string[];
  ownership?: { owned?: boolean; rental?: { rented?: boolean } };
  skins?: { id: number; name: string; isBase?: boolean; rarityGemPath?: string; ownership?: { owned?: boolean } }[];
}
interface Item {
  id: number;
  name: string;
  img: string;
  owned: boolean;
  sub?: string;
  roles?: string[];
  wide?: boolean;
  champ?: string;
  rarity?: string;
  points?: number;
}

const ownedIds = (list: unknown) => new Set((Array.isArray(list) ? list : []).map((x: { itemId?: number }) => x.itemId).filter((x): x is number => typeof x === "number"));

/** Collection : champions, skins, icônes, émotes et balises, avec filtres. Seule action : équiper une icône. */
export function Collection({ summoner, onIconChanged }: { summoner: Summoner | null; onIconChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("champions");
  const [owned, setOwned] = useState<"owned" | "all" | "missing">("owned");
  const [role, setRole] = useState("");
  const [rarity, setRarity] = useState("");
  const [sorts, setSorts] = useState<Partial<Record<Tab, Sort>>>(loadSorts);
  const sort: Sort = sorts[tab] && SORTS[tab].some(([v]) => v === sorts[tab]) ? sorts[tab]! : "az";
  const pickSort = (v: Sort) =>
    setSorts((cur) => {
      const next = { ...cur, [tab]: v };
      try {
        localStorage.setItem(SORT_KEY, JSON.stringify(next));
      } catch {
        /* rien */
      }
      return next;
    });
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [data, setData] = useState<Partial<Record<Tab, Item[]>>>({});
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const sid = summoner?.summonerId;

  useEffect(() => setLimit(PAGE), [tab, owned, role, rarity, query, sort]);

  useEffect(() => {
    if (data[tab]) return;
    let alive = true;
    const put = (items: Item[]) => alive && setData((d) => ({ ...d, [tab]: items }));
    const load = async () => {
      if (tab === "champions" || tab === "skins") {
        const [champs, meta, mastery] = await Promise.all([
          lcu<InvChampion[]>("GET", sid ? `/lol-champions/v1/inventories/${sid}/champions` : "/lol-champions/v1/owned-champions-minimal"),
          lcu<Record<string, { id: number; rarity?: string }>>("GET", "/lol-game-data/assets/v1/skins.json").catch(() => ({}) as Record<string, { id: number; rarity?: string }>),
          lcu<{ championId: number; championPoints: number }[]>("GET", "/lol-champion-mastery/v1/local-player/champion-mastery").catch(() => []),
        ]);
        const pts = new Map((Array.isArray(mastery) ? mastery : []).map((m) => [m.championId, m.championPoints]));
        const valid = champs.filter((c) => c.id > 0);
        const champItems = valid.map((c) => ({ id: c.id, name: c.name, img: championSquare(c.id), owned: !!c.ownership?.owned, roles: c.roles, points: pts.get(c.id) ?? 0, sub: c.ownership?.rental?.rented ? "Location" : undefined }));
        const skinItems = valid.flatMap((c) =>
          (c.skins ?? []).filter((s) => !s.isBase).map((s) => {
            const rar = rarityOf(meta[String(s.id)]?.rarity, s.rarityGemPath);
            return { id: s.id, name: s.name, img: skinSplash(c.id, s.id), owned: !!s.ownership?.owned, sub: rar === "kNoRarity" ? c.name : `${c.name} · ${RLABEL[rar]}`, champ: c.name, rarity: rar, roles: c.roles, wide: true };
          }),
        );
        if (alive) setData((d) => ({ ...d, champions: champItems, skins: skinItems }));
      } else if (tab === "icons") {
        const [all, inv] = await Promise.all([
          lcu<{ id: number; title?: string }[]>("GET", "/lol-game-data/assets/v1/summoner-icons.json"),
          lcu<unknown>("GET", "/lol-inventory/v2/inventory/SUMMONER_ICON").catch(() => []),
        ]);
        const mine = ownedIds(inv);
        put(all.filter((i) => i.id >= 0).sort((a, b) => b.id - a.id).map((i) => ({ id: i.id, name: i.title || `Icône ${i.id}`, img: profileIcon(i.id), owned: mine.has(i.id) || i.id <= 28 })));
      } else if (tab === "emotes") {
        const [all, inv] = await Promise.all([
          lcu<{ id: number; name: string; inventoryIcon?: string }[]>("GET", "/lol-game-data/assets/v1/summoner-emotes.json"),
          lcu<unknown>("GET", "/lol-inventory/v2/inventory/EMOTE").catch(() => []),
        ]);
        const mine = ownedIds(inv);
        put(all.filter((e) => e.id > 0 && e.inventoryIcon).sort((a, b) => b.id - a.id).map((e) => ({ id: e.id, name: e.name, img: gameAsset(e.inventoryIcon), owned: mine.has(e.id) })));
      } else {
        const wards = await lcu<{ id: number; name: string; wardImagePath?: string; ownership?: { owned?: boolean } }[]>("GET", sid ? `/lol-collections/v1/inventories/${sid}/ward-skins` : "/lol-game-data/assets/v1/ward-skins.json");
        put(wards.map((w) => ({ id: w.id, name: w.name, img: gameAsset(w.wardImagePath), owned: w.id === 0 || !!w.ownership?.owned })));
      }
    };
    setError(null);
    load().catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [tab, sid, data]);

  const items = data[tab];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (items ?? []).filter(
      (i) =>
        (owned === "all" || (owned === "owned" ? i.owned : !i.owned)) &&
        (!role || i.roles?.includes(role)) &&
        (!rarity || tab !== "skins" || i.rarity === rarity) &&
        (!q || i.name.toLowerCase().includes(q) || i.sub?.toLowerCase().includes(q)),
    );
    const az = (a: Item, b: Item) => coll.compare(a.name, b.name);
    const by: Record<Sort, (a: Item, b: Item) => number> = {
      az,
      za: (a, b) => -az(a, b),
      champ: (a, b) => coll.compare(a.champ ?? "", b.champ ?? "") || a.id - b.id,
      rarity: (a, b) => (RANK[b.rarity ?? ""] ?? 0) - (RANK[a.rarity ?? ""] ?? 0) || az(a, b),
      mastery: (a, b) => (b.points ?? 0) - (a.points ?? 0) || az(a, b),
      recent: (a, b) => b.id - a.id,
      owned: (a, b) => Number(b.owned) - Number(a.owned) || az(a, b),
    };
    return [...list].sort(by[sort]);
  }, [items, owned, role, rarity, query, sort, tab]);
  const rarities = useMemo(() => (tab === "skins" && items ? RARITIES.filter(([k]) => items.some((i) => i.rarity === k)) : []), [tab, items]);
  const count = items ? items.filter((i) => i.owned).length : 0;

  const equipIcon = async (id: number) => {
    setNote(null);
    try {
      await lcu("PUT", "/lol-summoner/v1/current-summoner/icon", { profileIconId: id });
      setNote("Icône équipée.");
      onIconChanged();
    } catch (e) {
      setNote(friendlyError(e));
    }
  };

  return (
    <div className="page col">
      <div className="eyebrow">Ta collection</div>
      <h1 className="title">COLLECTION</h1>
      <div className="col-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" className="chip" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
        {items && (
          <span className="col-count">
            {count.toLocaleString("fr-FR")} / {items.length.toLocaleString("fr-FR")} possédés
          </span>
        )}
      </div>
      <div className="col-filters">
        <input className="search" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
        <div className="col-seg" role="group" aria-label="Possession">
          {(
            [
              ["owned", "Possédés"],
              ["missing", "Manquants"],
              ["all", "Tout"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} className="chip" aria-pressed={owned === v} onClick={() => setOwned(v)}>
              {l}
            </button>
          ))}
        </div>
        {(tab === "champions" || tab === "skins") && (
          <div className="col-seg" role="group" aria-label="Classe">
            {ROLES.map(([v, l]) => (
              <button key={v} className="chip" aria-pressed={role === v} onClick={() => setRole(v)}>
                {l}
              </button>
            ))}
          </div>
        )}
        <label className="col-sort">
          <span>Trier</span>
          <select value={sort} onChange={(e) => pickSort(e.target.value as Sort)} aria-label="Trier">
            {SORTS[tab].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rarities.length > 1 && (
        <div className="col-filters">
          <div className="col-seg" role="group" aria-label="Rareté">
            <button className="chip" aria-pressed={rarity === ""} onClick={() => setRarity("")}>
              Toutes raretés
            </button>
            {rarities.map(([k, l]) => (
              <button key={k} className={`chip rar-${k.slice(1).toLowerCase()}`} aria-pressed={rarity === k} onClick={() => setRarity(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      {note && <p className="col-note">{note}</p>}
      {error && <p className="re-error">{error}</p>}
      {!items && !error && <p className="gd-wait">Chargement…</p>}
      {items && shown.length === 0 && <p className="gd-wait">Rien à afficher avec ces filtres.</p>}
      <div className={`col-grid ${tab === "skins" ? "wide" : ""} ${tab === "icons" || tab === "emotes" || tab === "wards" ? "small" : ""}`}>
        {shown.slice(0, limit).map((i) => (
          <div key={i.id} className={`col-item ${i.owned ? "" : "missing"} ${summoner?.profileIconId === i.id && tab === "icons" ? "equipped" : ""}`} title={i.sub ? `${i.name} · ${i.sub}` : i.name}>
            {tab === "champions" || tab === "skins" ? <Breathing src={i.img} /> : <Art src={i.img} alt="" />}
            <div className="col-txt">
              <b>{i.name}</b>
              {i.sub && <small>{i.sub}</small>}
            </div>
            {tab === "icons" && i.owned && summoner?.profileIconId !== i.id && (
              <button className="mini col-equip" onClick={() => equipIcon(i.id)}>
                Équiper
              </button>
            )}
          </div>
        ))}
      </div>
      {shown.length > limit && (
        <div className="btns" style={{ justifyContent: "center", marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={() => setLimit((l) => l + PAGE * 2)}>
            Voir plus ({(shown.length - limit).toLocaleString("fr-FR")})
          </button>
        </div>
      )}
    </div>
  );
}
