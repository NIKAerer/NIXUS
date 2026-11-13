import { useEffect, useState } from "react";
import { lcu } from "./lcu";

/** Pseudos (Riot ID) retrouvés par puuid, quand le client ne les met pas dans le salon ou le chat. */
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

export const puuidOf = (id?: string) => (id ? id.split("@")[0] : "");

export function nameOf(puuid: string): Promise<string | null> {
  if (!puuid) return Promise.resolve(null);
  if (cache.has(puuid)) return Promise.resolve(cache.get(puuid)!);
  if (!pending.has(puuid)) {
    pending.set(
      puuid,
      lcu<{ gameName?: string; displayName?: string; tagLine?: string }>("GET", `/lol-summoner/v2/summoners/puuid/${puuid}`)
        .then((s) => {
          const n = s?.gameName || s?.displayName || "";
          if (n) cache.set(puuid, n);
          return n || null;
        })
        .catch(() => null)
        .finally(() => pending.delete(puuid)),
    );
  }
  return pending.get(puuid)!;
}

/** Renvoie les pseudos connus pour ces puuid, et va chercher ceux qui manquent. */
export function useNames(puuids: (string | undefined)[]) {
  const key = [...new Set(puuids.filter(Boolean) as string[])].sort().join(",");
  const [, bump] = useState(0);
  useEffect(() => {
    let alive = true;
    const missing = key ? key.split(",").filter((p) => !cache.has(p)) : [];
    if (missing.length) Promise.all(missing.map(nameOf)).then(() => alive && bump((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [key]);
  return (puuid?: string) => (puuid ? cache.get(puuid) : undefined);
}
