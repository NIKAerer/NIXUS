import { useEffect, useRef, useState } from "react";
import { snapshot } from "../lib/archive";
import { findRoom, isMine, loadMessages, sendRoomMessage, type ChatMessage, type RoomKind } from "../lib/chat";
import { friendlyError } from "../lib/errors";
import { puuidOf, useNames } from "../lib/names";
import { Icon, cx, hhmm } from "../ui";

let snapped = false;
const readable = (list: ChatMessage[]) => list.filter((m) => m.type === "groupchat" || m.type === "chat" || m.type === "celebration");

/** Cherche, dans n'importe quel champ du message, une valeur qui correspond à un allié connu (id masqué en classé…). */
function anyKey(m: ChatMessage, names?: Map<number | string, string>) {
  if (!names?.size) return undefined;
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): string | undefined => {
    if (v == null || depth > 3 || seen.has(v)) return undefined;
    if (typeof v === "string" || typeof v === "number") {
      if (v === "" || v === 0 || v === "0") return undefined;
      return names.get(v) ?? (typeof v === "string" ? names.get(v.split("@")[0]) ?? (/^\d+$/.test(v) ? names.get(Number(v)) : undefined) : names.get(String(v)));
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
  /** Noms affichables par identifiant. En draft, seuls les alliés dont le nom est visible y figurent. */
  names?: Map<number | string, string>;
  /** Salon de groupe : on peut chercher le pseudo de chaque auteur (jamais en draft, où les noms peuvent être cachés). */
  lookup?: boolean;
}

/** Chat du groupe ou de l'équipe en draft, replié dans un coin. Chaque message part d'un clic ou d'Entrée. */
export function RoomChat({ kind, hint, names, lookup }: Props) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

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
        const got = await loadMessages(id).catch(() => null);
        if (alive && got) setMessages(readable(got));
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
    if (!open) return;
    setSeen(messages.length);
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [open, messages.length]);

  const authors = useNames(lookup ? messages.map((m) => (isMine(m) ? undefined : puuidOf(m.fromId || m.fromPid))) : []);

  if (!roomId) return null;
  const fresh = open ? 0 : Math.max(0, messages.length - seen);
  const who = (m: ChatMessage) => {
    if (isMine(m)) return "Toi";
    const puuid = puuidOf(m.fromId || m.fromPid);
    const known = (m.fromSummonerId && names?.get(m.fromSummonerId)) || (puuid && names?.get(puuid)) || (lookup && authors(puuid)) || anyKey(m, names);
    if (!known && kind === "draft" && !snapped) {
      // Une fois : en classé le client vide l'auteur. On garde le message et le salon pour trouver où il le range.
      snapped = true;
      snapshot("draft-chat-author2", [`/lol-chat/v1/conversations/${roomId}`, `/lol-chat/v1/conversations/${roomId}/participants`], { message: m, keys: [...(names?.keys() ?? [])] });
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
      const got = await loadMessages(roomId).catch(() => null);
      if (got) setMessages(readable(got));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  };

  const last = messages[messages.length - 1];
  return (
    <div className={cx("room", open && "open", `room-${kind}`)}>
      <button className="room-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="chat" size={16} />
        <b>{kind === "draft" ? "Chat de l'équipe" : "Chat du groupe"}</b>
        {!open && last && (
          <span>
            {who(last)} : {last.body}
          </span>
        )}
        {fresh > 0 && <i className="badge">{fresh}</i>}
        <Icon name="chevron" size={14} className="room-caret" />
      </button>
      {open && (
        <>
          <div className="room-list" aria-live="polite" ref={list}>
            {messages.length === 0 && <p className="note">Pas encore de message.</p>}
            {messages.map((m, i) => (
              <p key={m.id || i} className={cx("room-msg", isMine(m) && "mine")}>
                <b>{who(m)}</b> {m.body}
                <time>{hhmm(m.timestamp)}</time>
              </p>
            ))}
          </div>
          {error && (
            <p className="note bad" role="alert">
              {error}
            </p>
          )}
          <form
            className="room-form"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input className="input" placeholder={kind === "draft" ? "Écrire à ton équipe" : "Écrire au groupe"} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} />
            <button className="btn btn-red btn-s" type="submit" disabled={!draft.trim() || sending}>
              Envoyer
            </button>
          </form>
        </>
      )}
    </div>
  );
}
