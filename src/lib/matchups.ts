import { useEffect, useState } from "react";
import { loadDetail, loadRecords, roleOf, seedDemo, type RankedRecord } from "./archive";

/** Une partie classée archivée, réduite à ce qu'il faut pour les duels : mon champion, mon rôle, le résultat, les adversaires. */
interface Entry {
  champ: number;
  role: string | null;
  win: boolean;
  enemies: { champ: number; role: string | null }[];
}

export interface Tally {
  w: number;
  l: number;
  n: number;
}

let cache: { count: number; entries: Promise<Entry[]> } | null = null;

async function entryOf(r: RankedRecord): Promise<Entry> {
  const base: Entry = { champ: r.championId, role: r.role, win: r.win, enemies: r.opponentId ? [{ champ: r.opponentId, role: r.role }] : [] };
  const d = await loadDetail(r.gameId).catch(() => null);
  if (!d?.participants?.length) return base;
  const me = d.participants.find((p) => p.championId === r.championId);
  if (!me) return base;
  const enemies = d.participants.filter((p) => p.teamId !== me.teamId).map((p) => ({ champ: p.championId, role: roleOf(p.timeline?.lane, p.timeline?.role) }));
  // Le rôle de l'adversaire direct est celui noté dans la fiche, même si la chronologie ne le donne pas.
  if (r.opponentId) for (const e of enemies) if (e.champ === r.opponentId && !e.role) e.role = r.role;
  return { ...base, enemies };
}

/** Lit l'archive une fois (les fiches détaillées en parallèle), puis la garde en mémoire tant qu'aucune partie ne s'ajoute. */
export async function loadMatchups(): Promise<Entry[]> {
  await seedDemo().catch(() => {}); // mode démo seulement : ne fait rien dans l'appli
  const records = (await loadRecords()).filter((r) => !r.remake);
  if (cache && cache.count === records.length) return cache.entries;
  const entries = (async () => {
    const out: Entry[] = [];
    for (let i = 0; i < records.length; i += 16) out.push(...(await Promise.all(records.slice(i, i + 16).map(entryOf))));
    return out;
  })();
  cache = { count: records.length, entries };
  return entries;
}

const tally = (list: Entry[]): Tally => {
  const w = list.filter((e) => e.win).length;
  return { w, l: list.length - w, n: list.length };
};

/**
 * Mon bilan contre un champion adverse. Avec mon champion choisi : ce duel précis. Avec mon rôle connu : seulement
 * quand il jouait ce rôle en face de moi (l'adversaire direct).
 */
export function versus(entries: Entry[], enemy: number, myChamp?: number, myRole?: string | null): Tally {
  const role = myRole ? myRole.toUpperCase() : null;
  return tally(
    entries.filter(
      (e) =>
        (!myChamp || e.champ === myChamp) &&
        (!role || e.role === role) &&
        e.enemies.some((x) => x.champ === enemy && (!role || x.role === role)),
    ),
  );
}

/** Mon bilan avec un champion, toutes parties classées archivées confondues. */
export const withChamp = (entries: Entry[], champ: number): Tally => tally(entries.filter((e) => e.champ === champ));

export function useMatchups(): Entry[] | null {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadMatchups().then((e) => alive && setEntries(e), () => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, []);
  return entries;
}
