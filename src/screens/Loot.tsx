import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { friendlyError } from "../lib/errors";
import { lcu } from "../lib/lcu";
import {
  ESSENCES,
  KEY,
  KEY_FRAGMENT,
  KINDS,
  actionHint,
  actionOf,
  actionTitle,
  alreadyOwned,
  amount,
  craft,
  essenceTone,
  gains,
  glyphOf,
  isCurrency,
  isDestructive,
  isShard,
  kindLabel,
  kindOf,
  GENERIC_CHEST,
  lootArt,
  lootIcon,
  lootName,
  lootSplash,
  missingChampion,
  num,
  rarityKey,
  rarityLabel,
  rarityRank,
  recipeCost,
  recipeGain,
  recipesOf,
  selfQuantity,
  timesPossible,
  type Kind,
  type LootItem,
  type Recipe,
} from "../lib/loot";
import { CloseButton, CountUp, Empty, Icon, Modal, Seg, Skeleton, cx, plural, useEscape, Select } from "../ui";

type Filter = "all" | "new" | "owned";
type Sort = "value" | "rarity" | "name";
type Gain = { item: LootItem; count: number };

/**
 * Butin Hextech, refait : on voit d'abord ce qu'on peut faire (ouvrir, forger, faire le ménage, débloquer),
 * puis tout le butin trié par catégorie. Chaque objet s'ouvre dans une fiche qui dit ce que chaque action
 * coûte et rapporte. Ce qui détruit un objet se fait en maintenant le bouton appuyé.
 */
export function Loot() {
  const [loot, setLoot] = useState<LootItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Record<string, Recipe[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("value");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [reveal, setReveal] = useState<{ title: string; list: Gain[] } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const reload = useCallback(
    () =>
      lcu<LootItem[]>("GET", "/lol-loot/v1/player-loot").then(
        (l) => {
          const list = (l ?? []).filter((x) => x.count > 0);
          setLoot(list);
          setError(null);
          return list;
        },
        (e) => {
          setError(friendlyError(e));
          return null;
        },
      ),
    [],
  );
  useEffect(() => {
    reload();
  }, [reload]);

  const recipesRef = useRef(recipes);
  recipesRef.current = recipes;
  const loadRecipes = useCallback(async (id: string, force = false) => {
    if (!force && recipesRef.current[id]) return recipesRef.current[id];
    const r = await recipesOf(id);
    setRecipes((cur) => ({ ...cur, [id]: r }));
    return r;
  }, []);

  // Les recettes des coffres et des fragments de clé servent aux actions conseillées : on les charge d'avance.
  const chestKey = (loot ?? []).filter((l) => kindOf(l) === "chest" && l.lootId !== KEY).map((l) => l.lootId).join(",");
  useEffect(() => {
    if (chestKey) chestKey.split(",").forEach((id) => loadRecipes(id, true));
  }, [chestKey, loadRecipes]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const owned = useMemo(() => new Map((loot ?? []).map((l) => [l.lootId, l.count])), [loot]);
  const items = useMemo(() => (loot ?? []).filter((l) => !isCurrency(l)), [loot]);
  const selected = items.find((l) => l.lootId === selectedId) ?? null;

  /** Lance une recette, puis montre ce qu'on a obtenu (ou un message pour un désenchantement). */
  const run = async (r: Recipe, l: LootItem, repeat = 1) => {
    if (busy) return;
    setBusy(true);
    const before = loot ?? [];
    try {
      const res = await craft(r, l, owned, repeat);
      const after = (await reload()) ?? before;
      const got = gains(res, before, after);
      const act = actionOf(r);
      if (act === "disenchant") {
        const g = recipeGain(r, l);
        setToast({ ok: true, text: `${repeat > 1 ? `${repeat} × ` : ""}${lootName(l)} désenchanté${repeat > 1 ? "s" : ""}${g ? ` : +${amount(g[0], g[1] * repeat)}` : ""}.` });
      } else {
        setReveal({ title: act === "open" ? (repeat > 1 ? `${repeat} coffres ouverts` : `${lootName(l)} ouvert`) : act === "upgrade" ? "Débloqué pour toujours" : act === "forge" ? "Fabriqué" : "Tu as obtenu", list: got });
      }
      if (!after.some((x) => x.lootId === l.lootId)) setSelectedId(null);
      else loadRecipes(l.lootId, true);
    } catch (e) {
      setToast({ ok: false, text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  /* ---------- Actions conseillées ---------- */
  const chests = items.filter((l) => kindOf(l) === "chest" && l.lootId !== KEY && l.lootId !== KEY_FRAGMENT);
  const openables = chests
    .map((l) => {
      const r = (recipes[l.lootId] ?? []).find((x) => actionOf(x) === "open");
      return { item: l, recipe: r, times: r ? timesPossible(r, owned) : 0, needsKey: !!r?.slots.some((s) => s.lootIds.includes(KEY)) };
    })
    .filter((o) => o.recipe)
    .sort((a, b) => b.times - a.times || b.item.count - a.item.count);
  const keys = owned.get(KEY) ?? 0;
  const extras = useMemo(() => cleanupCandidates(items), [items]);
  const affordable = items
    .filter((l) => isShard(l) && !alreadyOwned(l) && l.upgradeEssenceValue && (owned.get(l.upgradeEssenceName ?? (kindOf(l) === "skin" ? "CURRENCY_cosmetic" : "CURRENCY_champion")) ?? 0) >= l.upgradeEssenceValue && kindOf(l) !== "chest")
    .sort((a, b) => (b.upgradeEssenceValue ?? 0) - (a.upgradeEssenceValue ?? 0));

  /* ---------- Liste ---------- */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((l) => (kind === "all" || kindOf(l) === kind) && (!q || lootName(l).toLowerCase().includes(q)))
      .filter((l) => filter === "all" || (filter === "owned" ? alreadyOwned(l) : !alreadyOwned(l)))
      .sort((a, b) =>
        sort === "name"
          ? lootName(a).localeCompare(lootName(b), "fr")
          : sort === "rarity"
            ? rarityRank(b) - rarityRank(a) || lootName(a).localeCompare(lootName(b), "fr")
            : (b.disenchantValue ?? 0) * b.count - (a.disenchantValue ?? 0) * a.count || lootName(a).localeCompare(lootName(b), "fr"),
      );
  }, [items, kind, filter, sort, query]);
  const groups = KINDS.map(([k, label]) => ({ k, label, list: visible.filter((l) => kindOf(l) === k) })).filter((g) => g.list.length && (kind === "all" || g.k === kind));
  const countOf = (k: Kind) => items.filter((l) => kindOf(l) === k).reduce((n, l) => n + l.count, 0);

  const totalShown = visible.reduce((n, l) => n + l.count, 0);

  return (
    <div className="page loot">
      <header className="loot-head">
        <div className="grow">
          <span className="eyebrow">Hextech</span>
          <h1>Butin</h1>
        </div>
        <div className="wallet" aria-label="Tes essences et tes clés">
          {ESSENCES.map((e) => (
            <div key={e.id} className={cx("coin", `tone-${e.tone}`)} title={e.name}>
              <LootIcon id={e.id} small />
              <span>
                <b>
                  <CountUp text={num(owned.get(e.id) ?? 0)} />
                </b>
                <small>{e.name}</small>
              </span>
            </div>
          ))}
          <div className="coin tone-key" title="Clés Hextech">
            <LootIcon id={KEY} small />
            <span>
              <b>{keys}</b>
              <small>{keys > 1 ? "Clés" : "Clé"}</small>
            </span>
          </div>
        </div>
      </header>

      {error && <Empty title="Butin indisponible">{error}</Empty>}

      <div className="loot-layout">
        <div className="loot-main">
          {loot && (
            <div className="loot-bar">
              <div className="chips" role="tablist" aria-label="Catégories">
                <button className="chip" role="tab" aria-selected={kind === "all"} onClick={() => setKind("all")}>
                  Tout <span>{items.reduce((n, l) => n + l.count, 0)}</span>
                </button>
                {KINDS.filter(([k]) => countOf(k) > 0).map(([k, label]) => (
                  <button key={k} className="chip" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>
                    {label} <span>{countOf(k)}</span>
                  </button>
                ))}
              </div>
              <div className="loot-tools">
                <Seg<Filter>
                  value={filter}
                  onChange={setFilter}
                  label="Possession"
                  options={[
                    ["all", "Tout"],
                    ["new", "Pas encore à moi"],
                    ["owned", "Déjà possédé"],
                  ]}
                />
                <Select<Sort>
                  value={sort}
                  onChange={setSort}
                  label="Trier"
                  options={[
                    ["value", "Trier par valeur"],
                    ["rarity", "Trier par rareté"],
                    ["name", "Trier de A à Z"],
                  ]}
                />
                <label className="search-box">
                  <Icon name="search" size={15} />
                  <input className="input" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher dans le butin" />
                </label>
              </div>
            </div>
          )}

          {!loot && !error && (
            <div className="loot-grid" aria-label="Chargement">
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} className="lc" />
              ))}
            </div>
          )}

          {loot && groups.length === 0 && <Empty title={query ? "Rien à ce nom" : items.length ? "Rien ici" : "Ton butin est vide"}>{items.length ? "Change de catégorie ou de filtre." : "Les coffres et les fragments que tu gagnes apparaîtront ici."}</Empty>}

          {groups.map((g) => (
            <section key={g.k} className="loot-sec">
              <h2 className="loot-sec-head">
                {g.label} <span>{g.list.reduce((n, l) => n + l.count, 0)}</span>
                {g.k !== "chest" && extras.some((x) => kindOf(x.item) === g.k) && (
                  <button className="mini ghost" onClick={() => setBulkOpen(true)}>
                    Désenchanter les fragments en trop
                  </button>
                )}
              </h2>
              <div className={cx("loot-grid", (g.k === "chest" || g.k === "cosmetic" || g.k === "other") && "compact")}>
                {g.list.map((l) => (
                  <LootCard key={l.lootId} item={l} owned={owned} selected={l.lootId === selectedId} onOpen={() => setSelectedId(l.lootId === selectedId ? null : l.lootId)} />
                ))}
              </div>
            </section>
          ))}
          {loot && groups.length > 0 && <p className="loot-foot note">{plural(totalShown, "objet")} affichés</p>}
        </div>

        {loot && (
          <aside className="atelier" aria-label="Atelier">
            {selected ? (
              <LootPanel key={selected.lootId} item={selected} owned={owned} busy={busy} recipes={recipes[selected.lootId]} load={loadRecipes} onRun={run} onClose={() => setSelectedId(null)} />
            ) : (
              <div className="atelier-home">
                <div className="atelier-title">
                  <span className="label">Atelier</span>
                  <p>Choisis un objet à gauche pour voir ce qu'il coûte, ce qu'il rapporte et ce que tu peux en faire.</p>
                </div>

                {openables.length > 0 ? (
                  openables.slice(0, 1).map((o) => (
                    <div key={o.item.lootId} className={cx("open-card", o.times === 0 && "locked")}>
                      <div className="open-art">
                        <LootImage item={o.item} />
                      </div>
                      <span className="label">{o.times > 0 ? "Prêt à ouvrir" : "Il te manque une clé"}</span>
                      <b>{o.times > 1 ? `${o.times} × ${lootName(o.item)}` : lootName(o.item)}</b>
                      <small>{o.needsKey ? (o.times > 0 ? `Une clé par coffre · ${plural(keys, "clé")}` : `${plural(o.item.count, "coffre")} en attente d'une clé.`) : "S'ouvre sans clé."}</small>
                      {o.times > 0 && (
                        <div className="open-btns">
                          <button className="btn btn-red" disabled={busy} onClick={() => run(o.recipe!, o.item)}>
                            Ouvrir
                          </button>
                          {o.times > 1 && (
                            <button className="btn btn-quiet" disabled={busy} onClick={() => run(o.recipe!, o.item, o.times)}>
                              Tout ouvrir ({o.times})
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="open-card locked">
                    <div className="open-art">
                      <LootIcon id="CHEST_generic" />
                    </div>
                    <b>Aucun coffre</b>
                    <small>Les coffres arrivent avec le pass et les événements.</small>
                  </div>
                )}

                {extras.length > 0 && (
                  <button className="atelier-row" onClick={() => setBulkOpen(true)}>
                    <LootIcon id="CURRENCY_champion" />
                    <span className="atelier-row-txt">
                      <b>Faire le ménage</b>
                      <small>
                        {plural(extras.reduce((n, x) => n + x.qty, 0), "fragment")} en trop ·{" "}
                        {sumByEssence(extras)
                          .map(([id, v]) => `+${amount(id, v)}`)
                          .join(" · ")}
                      </small>
                    </span>
                    <Icon name="chevron" size={16} className="rot" />
                  </button>
                )}

                {affordable.length > 0 && (
                  <div className="atelier-list">
                    <span className="label">À ta portée</span>
                    {affordable.slice(0, 4).map((l) => (
                      <button key={l.lootId} className="atelier-row" onClick={() => setSelectedId(l.lootId)}>
                        <span className="atelier-face">
                          <LootImage item={l} />
                        </span>
                        <span className="atelier-row-txt">
                          <b>{lootName(l)}</b>
                          <small>
                            Débloquer pour {amount(l.upgradeEssenceName ?? (kindOf(l) === "skin" ? "CURRENCY_cosmetic" : "CURRENCY_champion"), l.upgradeEssenceValue ?? 0)}
                          </small>
                        </span>
                        <Icon name="chevron" size={16} className="rot" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {bulkOpen && (
        <BulkDisenchant
          candidates={extras}
          owned={owned}
          load={loadRecipes}
          onClose={() => setBulkOpen(false)}
          onDone={async (text) => {
            setBulkOpen(false);
            await reload();
            setToast({ ok: true, text });
          }}
        />
      )}
      {reveal && <Reveal title={reveal.title} list={reveal.list} onClose={() => setReveal(null)} />}
      {toast &&
        createPortal(
          <p className={cx("loot-toast", toast.ok ? "ok" : "bad")} role="status">
            <Icon name={toast.ok ? "check" : "close"} size={16} />
            {toast.text}
          </p>,
          document.getElementById("layer") ?? document.body,
        )}
    </div>
  );
}

/* ---------- Ménage ---------- */

type Extra = { item: LootItem; qty: number; why: string };
/** Fragments qui ne servent plus : objet déjà possédé (tous), ou doublons d'un objet pas encore possédé (on en garde un). */
function cleanupCandidates(items: LootItem[]): Extra[] {
  return items
    .filter((l) => isShard(l) && l.disenchantValue && kindOf(l) !== "chest")
    .map((l) => (alreadyOwned(l) ? { item: l, qty: l.count, why: kindOf(l) === "skin" ? "Skin déjà possédé" : kindOf(l) === "champion" ? "Champion déjà possédé" : "Déjà possédé" } : { item: l, qty: l.count - 1, why: "En double, on en garde un" }))
    .filter((x) => x.qty > 0)
    .sort((a, b) => (b.item.disenchantValue ?? 0) * b.qty - (a.item.disenchantValue ?? 0) * a.qty);
}
function sumByEssence(list: Extra[]): [string, number][] {
  const m = new Map<string, number>();
  for (const x of list) {
    const id = x.item.disenchantLootName ?? "CURRENCY_champion";
    m.set(id, (m.get(id) ?? 0) + (x.item.disenchantValue ?? 0) * x.qty);
  }
  return [...m.entries()];
}

/* ---------- Visuels ---------- */

/** Pictogrammes dessinés : coffre, clé, fragment, essence, orbe. Servent quand le client n'a pas d'image. */
export function Glyph({ kind, tone }: { kind: ReturnType<typeof glyphOf>; tone?: string }) {
  return (
    <span className={cx("glyph", `glyph-${kind}`, tone && `tone-${tone}`)} aria-hidden="true">
      <svg viewBox="0 0 48 48">
        {kind === "chest" && (
          <>
            <path d="M8 20h32v18a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" />
            <path d="M8 20c0-7 4-11 16-11s16 4 16 11z" />
            <path d="M8 22h32M21 22v6h6v-6" />
          </>
        )}
        {kind === "key" && (
          <>
            <circle cx="17" cy="24" r="8" />
            <circle cx="17" cy="24" r="3" />
            <path d="M25 24h16m-5 0v6m-5-6v4" />
          </>
        )}
        {kind === "fragment" && <path d="M24 5 36 17 30 38 14 42 9 24zM24 5l-4 18 16-6M20 23l-6 19M20 23 9 24" />}
        {kind === "essence" && (
          <>
            <path d="M24 4c7 9 13 16 13 24a13 13 0 0 1-26 0c0-8 6-15 13-24Z" />
            <path d="M18 30a6 6 0 0 0 6 6" />
          </>
        )}
        {kind === "orb" && (
          <>
            <circle cx="24" cy="24" r="16" />
            <path d="M8 24h32M24 8c-6 5-6 27 0 32" />
          </>
        )}
        {kind === "star" && <path d="M24 6l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" />}
      </svg>
    </span>
  );
}

/** Image d'un objet, avec le pictogramme dessiné si le visuel du client manque. */
function LootImage({ item, splash }: { item: LootItem; splash?: boolean }) {
  const src = splash ? lootSplash(item) : lootArt(item);
  const [state, setState] = useState<{ src: string; url: string; status: "loading" | "ready" | "error" }>({ src, url: src, status: "loading" });
  const cur = state.src === src ? state : { src, url: src, status: "loading" as const };
  if (cur !== state) setState(cur);
  const next = (c: typeof cur) => {
    const alt = fallbackUrl(item, c.url);
    return alt ? { ...c, url: alt } : { ...c, status: "error" as const };
  };
  if (!src || cur.status === "error") return <Glyph kind={glyphOf(item)} tone={isCurrency(item) ? essenceTone(item.lootId) : undefined} />;
  return (
    <img
      className={cx("art", cur.status === "ready" && "ready")}
      src={cur.url}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => setState({ ...cur, status: "ready" })}
      // Le visuel d'un skin manque parfois sur le CDN : on retombe sur celui du champion, puis sur le pictogramme.
      onError={() => setState(next(cur))}
    />
  );
}

/** Image de repli quand un visuel manque sur le CDN : le champion pour un skin, le coffre Hextech pour un coffre inconnu. */
function fallbackUrl(item: LootItem, url: string): string {
  if (/\/skin\/\d+$/.test(url)) return url.replace(/\/skin\/\d+$/, "");
  if (kindOf(item) === "chest" && item.lootId !== KEY && item.lootId !== KEY_FRAGMENT && url !== GENERIC_CHEST) return GENERIC_CHEST;
  return "";
}

/** Vraie icône du client pour une monnaie, une clé ou un coffre ; pictogramme dessiné si elle ne charge pas (hors ligne). */
function LootIcon({ id, small }: { id: string; small?: boolean }) {
  const first = lootIcon(id, small);
  const [state, setState] = useState({ first, url: first, failed: false });
  const cur = state.first === first ? state : { first, url: first, failed: false };
  const fake: LootItem = { lootId: id, count: 0 };
  if (cur.failed) return <Glyph kind={glyphOf(fake)} tone={isCurrency(fake) ? essenceTone(id) : undefined} />;
  return (
    <img
      className="loot-ic"
      src={cur.url}
      alt=""
      draggable={false}
      onError={() => {
        const alt = fallbackUrl(fake, cur.url);
        setState(alt ? { ...cur, url: alt } : { ...cur, failed: true });
      }}
    />
  );
}

/* ---------- Carte ---------- */

function LootCard({ item, owned, selected, onOpen }: { item: LootItem; owned: Map<string, number>; selected?: boolean; onOpen: () => void }) {
  const k = kindOf(item);
  const rar = rarityKey(item);
  const tall = k === "champion" || k === "skin";
  const cost = item.upgradeEssenceValue && isShard(item) && !alreadyOwned(item) ? item.upgradeEssenceValue : 0;
  const costId = item.upgradeEssenceName ?? (k === "skin" ? "CURRENCY_cosmetic" : "CURRENCY_champion");
  const canPay = cost > 0 && (owned.get(costId) ?? 0) >= cost;
  return (
    <button className={cx("lc", tall ? "lc-tall" : "lc-icon", rar && `rar-${rar}`, alreadyOwned(item) && "is-owned", selected && "is-selected")} onClick={onOpen} title={lootName(item)} aria-pressed={selected}>
      <span className="lc-art">
        <LootImage item={item} />
      </span>
      <span className="lc-top">
        {rar && <i className={cx("tag", "rar", `rar-${rar}`)}>{rarityLabel(item)}</i>}
        {alreadyOwned(item) && <i className="tag owned">Déjà à toi</i>}
        {missingChampion(item) && <i className="tag warn-tag">Champion manquant</i>}
        {item.count > 1 && <span className="lc-count">×{item.count}</span>}
      </span>
      <span className="lc-txt">
        <small>{kindLabel(item)}</small>
        <b>{lootName(item)}</b>
        {cost > 0 ? (
          <em className={cx("lc-val", canPay ? "can" : "cant")} title={`Débloquer pour ${amount(costId, cost)}`}>
            Débloquer <Drop id={costId} /> {num(cost)}
          </em>
        ) : item.disenchantValue ? (
          <em className="lc-val" title={`Désenchanter rapporte ${amount(item.disenchantLootName ?? "CURRENCY_champion", item.disenchantValue)}`}>
            Vaut <Drop id={item.disenchantLootName} /> {num(item.disenchantValue)}
          </em>
        ) : k === "chest" && item.lootId !== KEY && item.lootId !== KEY_FRAGMENT ? (
          <em className="lc-val">À ouvrir</em>
        ) : null}
      </span>
    </button>
  );
}
/** Petite icône de l'essence du client devant un montant ; goutte dessinée à sa couleur si l'image ne charge pas. */
function Drop({ id }: { id?: string }) {
  const eid = id ?? "CURRENCY_champion";
  const label = `essence ${ESSENCES.find((e) => e.id === eid)?.short ?? "bleue"}`;
  const [failed, setFailed] = useState(false);
  if (!failed) return <img className={cx("drop-ic", `tone-${essenceTone(eid)}`)} src={lootIcon(eid, true)} alt={label} draggable={false} onError={() => setFailed(true)} />;
  return (
    <svg className={cx("drop", `tone-${essenceTone(eid)}`)} viewBox="0 0 12 14" aria-label={label}>
      <path d="M6 .5C8 3.2 11 5.6 11 8.6a5 5 0 0 1-10 0C1 5.6 4 3.2 6 .5Z" />
    </svg>
  );
}

/* ---------- Fiche d'un objet ---------- */

function LootPanel({ item, owned, busy, recipes, load, onRun, onClose }: { item: LootItem; owned: Map<string, number>; busy: boolean; recipes?: Recipe[]; load: (id: string, force?: boolean) => Promise<Recipe[]>; onRun: (r: Recipe, l: LootItem, repeat?: number) => void; onClose: () => void }) {
  useEscape(onClose);
  useEffect(() => {
    load(item.lootId);
  }, [item.lootId, load]);
  const k = kindOf(item);
  const tall = k === "champion" || k === "skin";
  const rar = rarityKey(item);
  // Ordre : ce qui fait gagner un objet d'abord, ce qui le détruit en dernier.
  const order = ["open", "forge", "upgrade", "other", "reroll", "disenchant"];
  const list = (recipes ?? []).slice().sort((a, b) => order.indexOf(actionOf(a)) - order.indexOf(actionOf(b)));

  return (
    <div className={cx("loot-sheet", rar && `rar-${rar}`)} aria-label={lootName(item)}>
        <CloseButton onClose={onClose} label="Retour à l'atelier" className="sheet-x" />
        <div className={cx("sheet-art", tall ? "is-splash" : "is-icon")}>
          <LootImage item={item} splash />
        </div>
        <div className="sheet-body">
          <div className="sheet-kicker">
            <span>{kindLabel(item)}</span>
            {rar && <i className={cx("tag", "rar", `rar-${rar}`)}>{rarityLabel(item)}</i>}
          </div>
          <h2>{lootName(item)}</h2>
          <ul className="sheet-facts">
            {item.count > 1 && (
              <li>
                <Icon name="collection" size={14} /> Tu en as {item.count}
              </li>
            )}
            {alreadyOwned(item) && (
              <li className="good">
                <Icon name="check" size={14} /> {k === "champion" ? "Tu possèdes déjà ce champion" : k === "skin" ? "Tu possèdes déjà ce skin" : "Tu le possèdes déjà"}
              </li>
            )}
            {!alreadyOwned(item) && isShard(item) && (
              <li>
                <Icon name="star" size={14} /> Pas encore à toi : débloque-le pour le garder
              </li>
            )}
            {missingChampion(item) && (
              <li className="bad">
                <Icon name="flag" size={14} /> Il te faut d'abord le champion pour jouer ce skin
              </li>
            )}
          </ul>
          {item.localizedDescription && <p className="sheet-desc">{item.localizedDescription}</p>}

          <div className="sheet-acts">
            {recipes === undefined && <Skeleton className="act-skel" />}
            {recipes?.length === 0 && <p className="note">Aucune action possible avec cet objet pour l'instant.</p>}
            {list.map((r) => (
              <ActionRow key={r.recipeName} recipe={r} item={item} owned={owned} busy={busy} onRun={(n) => onRun(r, item, n)} />
            ))}
          </div>
        </div>
    </div>
  );
}

function ActionRow({ recipe, item, owned, busy, onRun }: { recipe: Recipe; item: LootItem; owned: Map<string, number>; busy: boolean; onRun: (n: number) => void }) {
  const act = actionOf(recipe);
  const max = timesPossible(recipe, owned);
  const repeatable = (act === "disenchant" || act === "open" || act === "forge") && max > 1;
  const [n, setN] = useState(1);
  const qty = Math.min(n, Math.max(1, max));
  const gain = recipeGain(recipe, item);
  const cost = recipeCost(recipe, item);
  const self = selfQuantity(recipe, item);
  const destructive = isDestructive(recipe);
  const missing = cost.find(([id, q]) => (owned.get(id) ?? 0) < q * qty);
  const ready = max > 0;
  const label = `${actionTitle(recipe, item)}${qty > 1 ? ` (${qty})` : ""}`;

  return (
    <div className={cx("act", `act-${act}`, !ready && "off")}>
      <div className="act-txt">
        <b>{actionTitle(recipe, item)}</b>
        <small>{actionHint(recipe, item)}</small>
      </div>
      <div className="act-val">
        {gain && (
          <span className={cx("val", "gain", `tone-${essenceTone(gain[0])}`)}>
            +{amount(gain[0], gain[1] * qty)}
          </span>
        )}
        {cost.map(([id, q]) => {
          const have = owned.get(id) ?? 0;
          const need = q * qty;
          return (
            <span key={id} className={cx("val", "cost", have < need && "short")}>
              −{amount(id, need)}
              <small>{have < need ? `il en manque ${num(need - have)}` : `il t'en restera ${num(have - need)}`}</small>
            </span>
          );
        })}
        {self > 1 && <span className="val cost">−{self * qty} de ces objets</span>}
      </div>
      <div className="act-go">
        {repeatable && (
          <div className="stepper" aria-label="Quantité">
            <button onClick={() => setN(Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Un de moins">
              −
            </button>
            <b>{qty}</b>
            <button onClick={() => setN(Math.min(max, qty + 1))} disabled={qty >= max} aria-label="Un de plus">
              +
            </button>
            <button className="all" onClick={() => setN(max)} disabled={qty >= max}>
              Max
            </button>
          </div>
        )}
        {destructive ? (
          <HoldButton disabled={busy || !ready} onDone={() => onRun(qty)} className="btn-quiet">
            {label}
          </HoldButton>
        ) : (
          <button className={cx("btn", act === "open" || act === "upgrade" ? "btn-red" : "btn-white")} disabled={busy || !ready} onClick={() => onRun(qty)}>
            {ready ? label : missing ? `Il manque ${amount(missing[0], missing[1] * qty - (owned.get(missing[0]) ?? 0))}` : "Pas assez d'objets"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Bouton à maintenir : rien ne part sur un clic distrait. Au clavier, Entrée ou Espace maintenus. */
function HoldButton({ children, onDone, disabled, className, ms = 900 }: { children: ReactNode; onDone: () => void; disabled?: boolean; className?: string; ms?: number }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef(0);
  const start = () => {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      setHolding(false);
      onDone();
    }, ms);
  };
  const stop = () => {
    clearTimeout(timer.current);
    timer.current = 0;
    setHolding(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={cx("btn", "hold", holding && "holding", className)}
      style={{ "--hold": `${ms}ms` } as CSSProperties}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !e.repeat && (e.preventDefault(), start())}
      onKeyUp={(e) => (e.key === "Enter" || e.key === " ") && stop()}
    >
      <i className="hold-fill" aria-hidden="true" />
      <span>{holding ? "Continue d'appuyer…" : children}</span>
      {!holding && <small>maintenir</small>}
    </button>
  );
}

/* ---------- Désenchantement groupé ---------- */

function BulkDisenchant({ candidates, owned, load, onClose, onDone }: { candidates: Extra[]; owned: Map<string, number>; load: (id: string) => Promise<Recipe[]>; onClose: () => void; onDone: (text: string) => void }) {
  const [picked, setPicked] = useState(() => new Set(candidates.map((c) => c.item.lootId)));
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosen = candidates.filter((c) => picked.has(c.item.lootId));
  const totals = sumByEssence(chosen);
  const toggle = (id: string) =>
    setPicked((cur) => {
      const s = new Set(cur);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const go = async () => {
    setError(null);
    setProgress(0);
    let done = 0;
    try {
      for (const c of chosen) {
        const r = (await load(c.item.lootId)).find((x) => actionOf(x) === "disenchant");
        if (r) await craft(r, c.item, owned, c.qty);
        done += c.qty;
        setProgress(done);
      }
      onDone(`${plural(done, "fragment")} désenchanté${done > 1 ? "s" : ""} : ${totals.map(([id, v]) => `+${amount(id, v)}`).join(", ")}.`);
    } catch (e) {
      setError(friendlyError(e));
      setProgress(null);
    }
  };
  const total = chosen.reduce((n, c) => n + c.qty, 0);

  return (
    <Modal label="Faire le ménage" onClose={onClose} size="m" className="bulk">
      <div className="modal-head">
        <div className="grow">
          <h2>Faire le ménage</h2>
          <small>Ces fragments ne t'apportent plus rien : désenchante-les pour récupérer de l'essence. Décoche ceux que tu veux garder.</small>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <div className="modal-body">
        <ul className="bulk-list">
          {candidates.map((c) => (
            <li key={c.item.lootId}>
              <label className={cx(picked.has(c.item.lootId) && "on")}>
                <input type="checkbox" checked={picked.has(c.item.lootId)} onChange={() => toggle(c.item.lootId)} />
                <span className="bulk-art">
                  <LootImage item={c.item} />
                </span>
                <span className="bulk-txt">
                  <b>
                    {lootName(c.item)}
                    {c.qty > 1 && <em> ×{c.qty}</em>}
                  </b>
                  <small>
                    {kindLabel(c.item)} · {c.why}
                  </small>
                </span>
                <span className={cx("val", "gain", `tone-${essenceTone(c.item.disenchantLootName)}`)}>+{num((c.item.disenchantValue ?? 0) * c.qty)}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="modal-foot">
        <div className="grow bulk-total">
          {error ? (
            <span className="bad">{error}</span>
          ) : progress !== null ? (
            <span>
              Désenchantement… {progress} / {total}
            </span>
          ) : (
            <>
              <span className="label">Tu récupères</span>
              {totals.length ? totals.map(([id, v]) => <b key={id} className={`tone-${essenceTone(id)}`}>+{amount(id, v)}</b>) : <b>rien</b>}
            </>
          )}
        </div>
        <HoldButton disabled={!total || progress !== null} onDone={go} className="btn-red">
          Désenchanter {plural(total, "fragment")}
        </HoldButton>
      </div>
    </Modal>
  );
}

/* ---------- Révélation ---------- */

function Reveal({ title, list, onClose }: { title: string; list: Gain[]; onClose: () => void }) {
  return (
    <Modal label={title} onClose={onClose} size="l" className="reveal">
      <div className="reveal-glow" aria-hidden="true" />
      <span className="eyebrow">Tu as obtenu</span>
      <h2>{title}</h2>
      <div className="reveal-row">
        {list.length === 0 && <p className="note">Le client n'a rien renvoyé : ton butin a été actualisé.</p>}
        {list.map((g, i) => {
          const rar = rarityKey(g.item);
          const tall = kindOf(g.item) === "champion" || kindOf(g.item) === "skin";
          return (
            <div key={g.item.lootId} className={cx("reveal-card", tall ? "tall" : "icon", rar && `rar-${rar}`)} style={{ animationDelay: `${0.15 + i * 0.18}s` }}>
              <span className="reveal-art">
                <LootImage item={g.item} />
              </span>
              <small>{isCurrency(g.item) ? "Essence" : kindLabel(g.item)}</small>
              <b>{isCurrency(g.item) ? `+${amount(g.item.lootId, g.count)}` : lootName(g.item)}</b>
              {!isCurrency(g.item) && g.count > 1 && <em>×{g.count}</em>}
              {rar && <i className={cx("tag", "rar", `rar-${rar}`)}>{rarityLabel(g.item)}</i>}
            </div>
          );
        })}
      </div>
      <button className="btn btn-white btn-l" onClick={onClose} autoFocus>
        Continuer
      </button>
    </Modal>
  );
}
