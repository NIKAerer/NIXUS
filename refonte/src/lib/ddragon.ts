import { useEffect, useState } from "react";

// Data Dragon (CDN officiel de Riot) : icônes des objets, sorts d'invocateur, runes et carte.
const BASE = "https://ddragon.leagueoflegends.com";

export interface Asset {
  name: string;
  icon: string;
  /** Sorts d'invocateur : modes de jeu où le sort est autorisé et niveau requis. */
  modes?: string[];
  level?: number;
}

export interface RuneTree {
  id: number;
  name: string;
  icon: string;
  slots: { runes: { id: number; name: string; icon: string; shortDesc?: string }[] }[];
}

export interface StaticData {
  version: string;
  styles: RuneTree[];
  spells: Map<number, Asset>;
  runes: Map<number, Asset>;
  items: Map<number, Asset>;
}

interface SpellFile {
  data: Record<string, { key: string; name: string; image: { full: string }; modes?: string[]; summonerLevel?: number }>;
}
interface RuneStyle {
  id: number;
  name: string;
  icon: string;
  slots: { runes: { id: number; name: string; icon: string; shortDesc?: string }[] }[];
}
interface ItemFile {
  data: Record<string, { name: string }>;
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Data Dragon ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchStatic(): Promise<StaticData> {
  const [version] = await json<string[]>(`${BASE}/api/versions.json`);
  const data = `${BASE}/cdn/${version}/data/fr_FR`;
  const [spellFile, runeStyles, itemFile] = await Promise.all([
    json<SpellFile>(`${data}/summoner.json`),
    json<RuneStyle[]>(`${data}/runesReforged.json`),
    json<ItemFile>(`${data}/item.json`),
  ]);

  const spells = new Map(
    Object.values(spellFile.data).map((s) => [Number(s.key), { name: s.name, icon: `${BASE}/cdn/${version}/img/spell/${s.image.full}`, modes: s.modes ?? [], level: s.summonerLevel ?? 1 }]),
  );
  const runes = new Map<number, Asset>();
  for (const style of runeStyles) {
    runes.set(style.id, { name: style.name, icon: `${BASE}/cdn/img/${style.icon}` });
    for (const r of style.slots.flatMap((s) => s.runes)) runes.set(r.id, { name: r.name, icon: `${BASE}/cdn/img/${r.icon}` });
  }
  const items = new Map(
    Object.entries(itemFile.data).map(([id, it]) => [Number(id), { name: it.name, icon: `${BASE}/cdn/${version}/img/item/${id}.png` }]),
  );
  const styles: RuneTree[] = runeStyles.map((st) => ({
    id: st.id,
    name: st.name,
    icon: `${BASE}/cdn/img/${st.icon}`,
    slots: st.slots.map((sl) => ({ runes: sl.runes.map((r) => ({ id: r.id, name: r.name, icon: `${BASE}/cdn/img/${r.icon}`, shortDesc: r.shortDesc?.replace(/<[^>]+>/g, "") })) })),
  }));
  return { version, styles, spells, runes, items };
}

let cache: Promise<StaticData> | null = null;

export function loadStatic() {
  cache ??= fetchStatic().catch((e) => {
    cache = null;
    throw e;
  });
  return cache;
}

/** Données statiques chargées une seule fois pour toute l'app (null tant qu'elles arrivent). */
export function useStatic() {
  const [data, setData] = useState<StaticData | null>(null);
  useEffect(() => {
    let alive = true;
    loadStatic()
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

export const mapImage = (version: string) => `${BASE}/cdn/${version}/img/map/map11.png`;

const STAT = (f: string) => `${BASE}/cdn/img/perk-images/StatMods/${f}`;
/** Fragments de statistiques (3 lignes), absents de runesReforged.json. */
export const SHARD_ROWS: { id: number; name: string; icon: string }[][] = [
  [
    { id: 5008, name: "Force adaptative", icon: STAT("StatModsAdaptiveForceIcon.png") },
    { id: 5005, name: "Vitesse d'attaque", icon: STAT("StatModsAttackSpeedIcon.png") },
    { id: 5007, name: "Accélération de compétence", icon: STAT("StatModsCDRScalingIcon.png") },
  ],
  [
    { id: 5008, name: "Force adaptative", icon: STAT("StatModsAdaptiveForceIcon.png") },
    { id: 5010, name: "Vitesse de déplacement", icon: STAT("StatModsMovementSpeedIcon.png") },
    { id: 5001, name: "PV croissants", icon: STAT("StatModsHealthScalingIcon.png") },
  ],
  [
    { id: 5011, name: "PV", icon: STAT("StatModsHealthPlusIcon.png") },
    { id: 5013, name: "Ténacité et résistance aux ralentissements", icon: STAT("StatModsTenacityIcon.png") },
    { id: 5001, name: "PV croissants", icon: STAT("StatModsHealthScalingIcon.png") },
  ],
];
