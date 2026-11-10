import { useEffect, useRef, useState } from "react";
import { findRoom, isMine, loadMessages, sendRoomMessage, type ChatMessage, type RoomKind } from "../lib/chat";
import { friendlyError } from "../lib/errors";
import { puuidOf, useNames } from "../lib/names";
import { snapshot } from "../lib/archive";

let snapped = false;

/** Cherche, dans n'importe quel champ du message, une valeur qui correspond à un allié connu (id masqué en ranked…). */
function anyKey(m: ChatMessage, names?: Map<number | string, string>) {
  if (!names?.size) return undefined;
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): string | undefined => {
    if (v == null || depth > 3 || seen.has(v)) return undefined;
    if (typeof v === "string" || typeof v === "number") {
      if (v === "" || v === 0 || v === "0") return undefined;
      const hit = names.get(v) ?? (typeof v === "string" ? names.get(v.split("@")[0]) ?? (/^\d+$/.test(v) ? names.get(Number(v)) : undefined) : names.get(String(v)));
      return hit;
    }
    if (typeof v === "object") {
      seen.add(v);
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (k === "body" || k === "id" || k === "timestamp") continue;
        const r = walk(x, depth + 1);
        if (r) return r;
      }
    }
    return undefined;
  };
  return walk(m, 0);
}

interface Props {
  kind: RoomKind;
  /** Id du salon donné par le client (lobby.multiUserChatId, session.chatDetails), si connu. */
  hint?: string;
  /** Noms affichables par summonerId. En draft on n'en passe pas : les noms restent cachés, comme dans le client. */
  names?: Map<number | string, string>;
  /** Salon de groupe : on peut chercher le pseudo de chaque auteur (jamais en draft, où les noms peuvent être cachés). */
  lookup?: boolean;
}

const hhmm = (t: string) => {
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

/** Chat du groupe ou de l'équipe en draft, replié en bas à gauche. Chaque message part d'un clic ou d'Entrée. */
export function RoomChat({ kind, hint, names, lookup }: Props) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let t: number;
    let id: string | null = null;
    const poll = async () => {
      if (!id) {
        id = (await findRoom(kind, hint))?.id ?? null;
        if (alive) setRoomId(id);
      }
      if (id) {
        const list = await loadMessages(id).catch(() => null);
        if (alive && list) setMessages(list.filter((m) => m.type === "groupchat" || m.type === "chat" || m.type === "celebration"));
      }
      if (alive) t = window.setTimeout(poll, 1500);
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [kind, hint]);

  useEffect(() => {
    if (open) {
      setSeen(messages.length);
      end.current?.scrollIntoView({ block: "end" });
    }
  }, [open, messages.length]);

  const authors = useNames(lookup ? messages.map((m) => (isMine(m) ? undefined : puuidOf(m.fromId || m.fromPid))) : []);

  if (!roomId) return null;
  const fresh = open ? 0 : Math.max(0, messages.length - seen);
  const who = (m: ChatMessage) => {
    if (isMine(m)) return "Toi";
    const puuid = puuidOf(m.fromId || m.fromPid);
    const known = (m.fromSummonerId && names?.get(m.fromSummonerId)) || (puuid && names?.get(puuid)) || (lookup && authors(puuid)) || anyKey(m, names);
    if (!known && kind === "draft" && !snapped) {
      // Une fois : en ranked le client vide fromId/fromPid/fromSummonerId. On garde le message entier et le salon
      // pour trouver où il range l'auteur (champ masqué, participants du salon…).
      snapped = true;
      snapshot("draft-chat-author2", roomId ? [`/lol-chat/v1/conversations/${roomId}`, `/lol-chat/v1/conversations/${roomId}/participants`] : [], { message: m, keys: [...(names?.keys() ?? [])] });
    }
    return known || (kind === "draft" ? "Allié" : "Membre");
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendRoomMessage(roomId, body);
      setDraft("");
      const list = await loadMessages(roomId).catch(() => null);
      if (list) setMessages(list.filter((m) => m.type === "groupchat" || m.type === "chat" || m.type === "celebration"));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`rc ${open ? "open" : ""} rc-${kind}`}>
      <button className="rc-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 4h14v9H8l-4 3v-3H3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
        <b>{kind === "draft" ? "Chat de l'équipe" : "Chat du groupe"}</b>
        {fresh > 0 && <em className="fp-unread">{fresh}</em>}
        <svg className="rc-caret" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 8l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="rc-list" aria-live="polite">
            {messages.length === 0 && <p className="fp-empty">Pas encore de message.</p>}
            {messages.map((m, i) => (
              <p key={m.id || i} className={`rc-msg ${isMine(m) ? "mine" : ""}`}>
                <b>{who(m)}</b> {m.body}
                <time>{hhmm(m.timestamp)}</time>
              </p>
            ))}
            <div ref={end} />
          </div>
          {error && <div className="fc-error" role="alert">{error}</div>}
          <form
            className="fc-form"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input className="search" placeholder={kind === "draft" ? "Écrire à ton équipe" : "Écrire au groupe"} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} />
            <button className="btn btn-red small" type="submit" disabled={!draft.trim() || sending}>
              Envoyer
            </button>
          </form>
        </>
      )}
    </div>
  );
}
