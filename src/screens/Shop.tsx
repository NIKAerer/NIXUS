import { useEffect, useMemo, useState } from "react";
import { showLolWindow, useClient } from "../lib/client";
import { championSplash, championSquare, skinSplash } from "../lib/lcu";
import { loadCatalog, type ShopItem } from "../lib/shop";
import { Art, Empty, Icon, RefreshButton, Skeleton, cx, int, plural } from "../ui";

const daysLeft = (iso?: string) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000)) : undefined);

/** Bouton « Acheter dans le client » : NIXUS n'achète jamais, il ouvre la boutique officielle. */
function BuyInClient({ className }: { className?: string }) {
  const [opened, setOpened] = useState(false);
  return (
    <button
      className={cx("btn btn-red", className)}
      onClick={() => {
        showLolWindow();
        setOpened(true);
      }}
      title="Ouvre le client officiel de League of Legends : l'achat se fait là-bas"
    >
      <Icon name="shop" size={17} /> {opened ? "Client ouvert : va dans la Boutique" : "Acheter dans le client"}
    </button>
  );
}

/** Boutique en vitrine : ton solde, les soldes (tes champions d'abord) et les champions à débloquer. */
export function Shop() {
  const wallet = useClient((s) => s.wallet);
  const champions = useClient((s) => s.champions);
  const history = useClient((s) => s.history);
  const mastery = useClient((s) => s.mastery);
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    loadCatalog().then(
      (x) => {
        setItems(x);
        setError(null);
      },
      (e) => setError(String(e?.message ?? e)),
    );
  useEffect(() => void load(), []);

  // Tes champions : joués récemment ou meilleures maîtrises. Leurs skins passent en premier.
  const mine = useMemo(() => {
    const ids = new Set<number>();
    for (const m of history) if (m.participants[0]) ids.add(m.participants[0].championId);
    for (const m of mastery.values()) if (m.championPoints > 50_000) ids.add(m.championId);
    return ids;
  }, [history, mastery]);

  const be = wallet?.lol_blue_essence ?? 0;
  const sales = useMemo(() => (items ?? []).filter((i) => i.saleRp !== undefined && !i.owned).sort((a, b) => Number(mine.has(b.championId)) - Number(mine.has(a.championId)) || (b.discount ?? 0) - (a.discount ?? 0)), [items, mine]);
  const toUnlock = useMemo(() => (items ?? []).filter((i) => i.kind === "CHAMPION" && !i.owned && i.be).sort((a, b) => (a.be ?? 0) - (b.be ?? 0)), [items]);
  const champName = (i: ShopItem) => i.name || champions.get(i.championId)?.name || "Champion";

  return (
    <div className="page shop-page">
      <header className="page-head">
        <div className="grow">
          <h1>Boutique</h1>
          <p>Les soldes du moment et ce que tu peux t'offrir. L'achat se fait dans le client officiel : NIXUS n'achète jamais rien à ta place.</p>
        </div>
        <div className="shop-wallet">
          <span>
            <b>{int(wallet?.RP ?? 0)}</b>
            <small>RP</small>
          </span>
          <span>
            <b>{int(be)}</b>
            <small>Essences bleues</small>
          </span>
        </div>
        <BuyInClient />
      </header>

      {error ? (
        <Empty title="Boutique indisponible">
          {error} Le client met parfois un moment à charger sa boutique.
          <br />
          <RefreshButton label="Réessayer" onRefresh={load} />
        </Empty>
      ) : (
        <>
          <section>
            <h2 className="sec-head">
              En solde{sales.length > 0 && <span>{plural(sales.length, "offre")} · tes champions d'abord</span>}
            </h2>
            {!items ? (
              <div className="shop-grid">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="shop-skin" />
                ))}
              </div>
            ) : sales.length ? (
              <div className="shop-grid">
                {sales.map((i) => (
                  <article key={i.itemId} className={cx("shop-skin", mine.has(i.championId) && "mine")}>
                    <Art src={i.kind === "CHAMPION" ? championSplash(i.championId) : skinSplash(i.championId, i.itemId)} className="shop-skin-art" />
                    {i.discount !== undefined && <span className="shop-off">-{Math.round(i.discount * 100)}%</span>}
                    {mine.has(i.championId) && <span className="tag accent shop-mine">Ton champion</span>}
                    <div className="shop-skin-txt">
                      <b>{champName(i)}</b>
                      <span>
                        {i.rp !== undefined && <s>{int(i.rp)}</s>} <strong>{int(i.saleRp ?? 0)} RP</strong>
                        {daysLeft(i.saleEnd) !== undefined && <small> · encore {plural(daysLeft(i.saleEnd)!, "jour")}</small>}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty title="Pas de soldes en ce moment">Reviens plus tard : les soldes changent chaque semaine.</Empty>
            )}
          </section>

          {toUnlock.length > 0 && (
            <section>
              <h2 className="sec-head">
                Champions à débloquer<span>avec tes {int(be)} essences bleues</span>
              </h2>
              <div className="shop-champs">
                {toUnlock.map((i) => (
                  <article key={i.itemId} className={cx("shop-champ", (i.be ?? 0) <= be && "ok")}>
                    <Art src={championSquare(i.championId)} />
                    <span>
                      <b>{champName(i)}</b>
                      <small>
                        {int(i.be ?? 0)} EB{i.rp ? ` · ${int(i.rp)} RP` : ""}
                      </small>
                    </span>
                    {(i.be ?? 0) <= be && <span className="tag green">À ta portée</span>}
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
