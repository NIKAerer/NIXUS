import { snapshot } from "./archive";
import { isDesktop, lcu } from "./lcu";

/**
 * Boutique en vitrine : NIXUS lit le catalogue du client pour montrer les soldes et ce que tu peux t'offrir,
 * mais n'achète jamais rien. L'achat se fait dans le client officiel (bouton qui l'ouvre).
 * Les formes de réponse du catalogue n'ont pas encore été vérifiées sur un vrai client : la lecture est
 * tolérante (plusieurs noms de champs) et une capture est notée dans archive/debug pour vérifier.
 */

export interface ShopItem {
  itemId: number;
  kind: "CHAMPION" | "CHAMPION_SKIN";
  name: string;
  championId: number;
  owned: boolean;
  rp?: number;
  be?: number;
  /** Prix soldé en RP et réduction (0.4 = -40 %). */
  saleRp?: number;
  discount?: number;
  saleEnd?: string;
}

type Raw = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

function price(list: unknown, currency: string) {
  if (!Array.isArray(list)) return undefined;
  const p = (list as Raw[]).find((x) => x.currency === currency);
  return num(p?.cost) ?? num(p?.price);
}

/** Une ligne de /lol-catalog/v1/items/… ou de /lol-store/v1/catalog, ramenée à une forme commune. */
export function normalizeItem(r: Raw): ShopItem | null {
  const itemId = num(r.itemId);
  const kind = str(r.inventoryType);
  if (itemId === undefined || (kind !== "CHAMPION" && kind !== "CHAMPION_SKIN")) return null;
  const prices = r.prices ?? (r as Raw).price;
  const sale = (r.sale ?? (Array.isArray(r.sales) ? (r.sales as Raw[])[0] : undefined)) as Raw | undefined;
  const salePrices = sale?.prices;
  const saleRp = price(salePrices, "RP") ?? num(sale?.cost);
  const rp = price(prices, "RP");
  const discountRaw = num((Array.isArray(salePrices) ? (salePrices as Raw[]).find((x) => x.currency === "RP") : undefined)?.discount) ?? num(sale?.discount);
  const discount = discountRaw ?? (saleRp !== undefined && rp ? 1 - saleRp / rp : undefined);
  const loc = r.localizations as Record<string, Raw> | undefined;
  const name = str(r.name) ?? str(loc?.fr_FR?.name) ?? str(Object.values(loc ?? {})[0]?.name) ?? "";
  return {
    itemId,
    kind,
    name,
    championId: kind === "CHAMPION" ? itemId : Math.floor(itemId / 1000),
    owned: r.owned === true || r.ownershipType === "OWNED" || (r.ownership as Raw | undefined)?.owned === true,
    rp,
    be: price(prices, "IP") ?? price(prices, "lol_blue_essence"),
    saleRp: saleRp !== undefined && rp !== undefined && saleRp < rp ? saleRp : undefined,
    discount: saleRp !== undefined && rp !== undefined && saleRp < rp ? discount : undefined,
    saleEnd: str(sale?.endDate),
  };
}

let snapped = false;

/** Catalogue champions + skins. Essaie l'API catalogue récente, puis l'ancienne. */
export async function loadCatalog(): Promise<ShopItem[]> {
  if (!isDesktop) return mockCatalog();
  const tries: string[][] = [["/lol-catalog/v1/items/CHAMPION", "/lol-catalog/v1/items/CHAMPION_SKIN"], ["/lol-store/v1/catalog"]];
  let lastError: unknown = null;
  for (const paths of tries) {
    try {
      const lists = await Promise.all(paths.map((p) => lcu<Raw[]>("GET", p)));
      const items = lists.flat().filter(Boolean).map(normalizeItem).filter((x): x is ShopItem => !!x);
      if (items.length) {
        if (!snapped) {
          snapped = true;
          // Échantillon pour vérifier les champs réels (prix, soldes, possession).
          snapshot("shop-catalog", [], { source: paths, sample: lists.flat().slice(0, 3) }).catch(() => {});
        }
        return items;
      }
    } catch (e) {
      lastError = e;
    }
  }
  if (!snapped) {
    snapped = true;
    snapshot("shop-catalog-failed", ["/lol-store/v1/status"], { error: String(lastError) }).catch(() => {});
  }
  throw new Error("Le catalogue de la boutique n'a pas répondu.");
}

/* ---------- Démo ---------- */

function mockCatalog(): ShopItem[] {
  const end = new Date(Date.now() + 4 * 86400_000).toISOString();
  const skins: [number, string, number, number?][] = [
    [64011, "Lee Sin Poing de Dieu", 1820, 0.5],
    [254029, "Vi Âme Lumineuse", 1350, 0.4],
    [517008, "Sylas Freljord", 1350, 0.4],
    [141002, "Kayn Mythe Nocturne", 1350, 0.3],
    [5013, "Xin Zhao Zénith", 975, 0.5],
    [103015, "Ahri Arcade", 1350, 0.4],
    [157001, "Yasuo Haute Noon", 1350],
    [64029, "Lee Sin Mains de l'esprit", 1350],
  ];
  const champs: [number, string, number, number][] = [
    [893, "Aurora", 7800, 975],
    [910, "Hwei", 6300, 880],
    [901, "Smolder", 6300, 880],
    [233, "Briar", 6300, 880],
    [950, "Naafiri", 4800, 790],
    [32, "Amumu", 450, 260],
  ];
  return [
    ...skins.map(([itemId, name, rp, discount]): ShopItem => ({ itemId, kind: "CHAMPION_SKIN", name, championId: Math.floor(itemId / 1000), owned: false, rp, saleRp: discount ? Math.round((rp * (1 - discount)) / 5) * 5 : undefined, discount, saleEnd: discount ? end : undefined })),
    ...champs.map(([itemId, name, be, rp]): ShopItem => ({ itemId, kind: "CHAMPION", name, championId: itemId, owned: false, be, rp })),
  ];
}
