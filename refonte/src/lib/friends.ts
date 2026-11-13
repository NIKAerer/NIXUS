import { useEffect, useState } from "react";
import { lcu } from "./lcu";

/** Demandes d'ami, ajout par Riot ID et groupes d'amis, via lol-chat comme le client. */
export interface FriendRequest {
  puuid: string;
  id?: string;
  pid?: string;
  gameName?: string;
  gameTag?: string;
  icon?: number;
  /** "in" : reçue, "out" : envoyée. */
  direction: string;
}

export function useFriendRequests(): [FriendRequest[], () => void] {
  const [list, setList] = useState<FriendRequest[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      lcu<FriendRequest[]>("GET", "/lol-chat/v2/friend-requests")
        .catch(() => lcu<FriendRequest[]>("GET", "/lol-chat/v1/friend-requests"))
        .then((r) => alive && setList(Array.isArray(r) ? r : []))
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tick]);
  return [list, () => setTick((n) => n + 1)];
}

/** "Nom#TAG" → demande envoyée. */
export async function addFriend(riotId: string) {
  const [gameName, tagLine] = riotId.split("#").map((s) => s.trim());
  if (!gameName || !tagLine) throw new Error("Écris le Riot ID complet, par exemple Nika#EUW.");
  await lcu("POST", "/lol-chat/v2/friend-requests", { gameName, tagLine, direction: "out" });
}

export async function answerRequest(r: FriendRequest, accept: boolean) {
  const key = encodeURIComponent(r.puuid);
  if (accept) await lcu("PUT", `/lol-chat/v2/friend-requests/${key}`, { ...r, direction: "both" }).catch(() => lcu("PUT", `/lol-chat/v1/friend-requests/${encodeURIComponent(r.id ?? r.pid ?? r.puuid)}`, { direction: "both" }));
  else await lcu("DELETE", `/lol-chat/v2/friend-requests/${key}`).catch(() => lcu("DELETE", `/lol-chat/v1/friend-requests/${encodeURIComponent(r.id ?? r.pid ?? r.puuid)}`));
}

export const createGroup = (name: string) => lcu("POST", "/lol-chat/v1/friend-groups", { name: name.trim() });
export const deleteGroup = (id: number) => lcu("DELETE", `/lol-chat/v1/friend-groups/${id}`);
export const moveFriend = (friendId: string, groupId: number) => lcu("PUT", `/lol-chat/v1/friends/${encodeURIComponent(friendId)}`, { groupId });
