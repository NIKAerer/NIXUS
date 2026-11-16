import { useEffect, useState } from "react";
import { lcu } from "./lcu";

/** Messagerie avec tes amis, via le chat du client (lol-chat). Chaque message part d'un clic sur « Envoyer ». */
export interface Conversation {
  id: string;
  pid?: string;
  type: string;
  gameName?: string;
  unreadMessageCount?: number;
  lastMessage?: ChatMessage | null;
}

export interface ChatMessage {
  id: string;
  body: string;
  fromSummonerId?: number;
  fromId?: string;
  fromPid?: string;
  timestamp: string;
  type: string;
  isHistorical?: boolean;
}

let conversations: Conversation[] = [];
let meId = "";
const listeners = new Set<(c: Conversation[]) => void>();
let timer: number | undefined;
let users = 0;

async function refresh() {
  const list = await lcu<Conversation[]>("GET", "/lol-chat/v1/conversations").catch(() => null);
  if (list) {
    conversations = list.filter((c) => c.type === "chat");
    listeners.forEach((l) => l(conversations));
  }
  if (!meId) {
    const me = await lcu<{ id?: string; pid?: string }>("GET", "/lol-chat/v1/me").catch(() => null);
    meId = me?.id ?? me?.pid ?? "";
  }
}

/** Conversations privées, relues toutes les 4 s tant qu'un écran en a besoin. */
export function useConversations(): Conversation[] {
  const [c, setC] = useState(conversations);
  useEffect(() => {
    listeners.add(setC);
    if (users++ === 0) {
      refresh();
      timer = window.setInterval(refresh, 4000);
    }
    return () => {
      listeners.delete(setC);
      if (--users === 0) clearInterval(timer);
    };
  }, []);
  return c;
}

export const isMine = (m: ChatMessage) => !!meId && (m.fromId === meId || m.fromPid === meId);
export const unreadTotal = (c: Conversation[]) => c.reduce((s, x) => s + (x.unreadMessageCount ?? 0), 0);

/** Ouvre (ou crée) la conversation avec un ami, identifié par son id de chat (xxx@xx.pvp.net). */
export async function openConversation(friendId: string) {
  await lcu("POST", "/lol-chat/v1/conversations", { id: friendId, type: "chat" }).catch(() => null);
}

export const loadMessages = (id: string) => lcu<ChatMessage[]>("GET", `/lol-chat/v1/conversations/${encodeURIComponent(id)}/messages`);

export async function sendMessage(id: string, body: string) {
  await lcu("POST", `/lol-chat/v1/conversations/${encodeURIComponent(id)}/messages`, { body, type: "chat" });
  refresh();
}

/** Marque la conversation comme lue, comme quand on l'ouvre dans le client. */
export async function markRead(id: string) {
  await lcu("PUT", `/lol-chat/v1/conversations/${encodeURIComponent(id)}`, { unreadMessageCount: 0 }).catch(() => null);
  conversations = conversations.map((c) => (c.id === id ? { ...c, unreadMessageCount: 0 } : c));
  listeners.forEach((l) => l(conversations));
}

/** Salons de groupe (salon de groupe ou draft) : le client en ouvre un par groupe et par sélection. */
export type RoomKind = "lobby" | "draft";
const ROOM_TYPES: Record<RoomKind, (t: string) => boolean> = {
  draft: (t) => t === "championSelect",
  lobby: (t) => !["chat", "championSelect", "postGame", "club"].includes(t),
};

export async function findRoom(kind: RoomKind, hint?: string): Promise<Conversation | null> {
  const list = await lcu<Conversation[]>("GET", "/lol-chat/v1/conversations").catch(() => null);
  if (!list) return null;
  const rooms = list.filter((c) => ROOM_TYPES[kind](c.type));
  const h = hint?.split("@")[0].toLowerCase();
  return (h && rooms.find((c) => c.id.toLowerCase().startsWith(h))) || rooms[0] || null;
}

export async function sendRoomMessage(id: string, body: string) {
  const url = `/lol-chat/v1/conversations/${encodeURIComponent(id)}/messages`;
  await lcu("POST", url, { body, type: "groupchat" }).catch(() => lcu("POST", url, { body, type: "chat" }));
}
