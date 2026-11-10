import { useEffect, useMemo, useRef, useState } from "react";
import { isMine, loadMessages, markRead, openConversation, sendMessage, useConversations, type ChatMessage } from "../lib/chat";
import { friendlyError } from "../lib/errors";
import { Art } from "./ui";
import { profileIcon } from "../lib/lcu";
import type { Friend, FriendGroup, Lobby } from "../lib/types";
import { addFriend, answerRequest, createGroup, deleteGroup, moveFriend, useFriendRequests } from "../lib/friends";

const ORDER: Record<string, number> = { chat: 0, dnd: 1, away: 2, mobile: 3, offline: 4 };
const COLLAPSED_KEY = "nexus.collapsedGroups";

export function friendStatus(f: Friend): { text: string; color: string } {
  const s = f.lol?.gameStatus;
  if (f.availability === "offline") return { text: "Hors ligne", color: "var(--muted)" };
  if (s === "inGame") return { text: `En partie${f.lol?.gameQueueType ? ` · ${f.lol.gameQueueType}` : ""}`, color: "#7fa8f5" };
  if (s === "championSelect") return { text: "Sélection des champions", color: "#7fa8f5" };
  if (s === "inQueue") return { text: "En file d'attente", color: "#7fa8f5" };
  if (f.availability === "away") return { text: "Absent", color: "#f5c518" };
  if (f.availability === "mobile") return { text: "Sur mobile", color: "var(--muted)" };
  return { text: "Disponible", color: "var(--win)" };
}

function readCollapsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

interface Props {
  friends: Friend[];
  groups: FriendGroup[];
  lobby: Lobby | null;
  onInvite: (summonerId: number) => void;
  onClose: () => void;
  onChanged?: () => void;
  onHistory?: (f: Friend) => void;
  closing?: boolean;
}

/** Panneau des amis à droite, rangés par les groupes d'amis du client Riot. */
export function FriendsPanel({ friends, groups, lobby, onInvite, onClose, onChanged, onHistory, closing }: Props) {
  const [query, setQuery] = useState("");
  // « Hors ligne » est replié par défaut, comme dans le client.
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === null ? ["Hors ligne"] : readCollapsed();
    } catch {
      return ["Hors ligne"];
    }
  });
  const [hideOffline, setHideOffline] = useState(false);
  const [chatWith, setChatWith] = useState<Friend | null>(null);
  const conversations = useConversations();
  const unread = new Map(conversations.map((c) => [c.id, c.unreadMessageCount ?? 0]));
  const chatId = (f: Friend) => f.id ?? f.pid ?? "";
  const [requests, reloadRequests] = useFriendRequests();
  const incoming = requests.filter((r) => r.direction === "in");
  const outgoing = requests.filter((r) => r.direction === "out");
  const [tool, setTool] = useState<null | "add" | "group">(null);
  const [field, setField] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const realGroups = groups.filter((g) => g.name !== "**Default");
  const defaultGroup = groups.find((g) => g.name === "**Default");

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setNote(null);
    try {
      await fn();
      if (ok) setNote({ ok: true, text: ok });
      reloadRequests();
      onChanged?.();
      return true;
    } catch (e) {
      setNote({ ok: false, text: friendlyError(e) });
      return false;
    }
  };
  const submitTool = async () => {
    const v = field.trim();
    if (!v) return;
    const done =
      tool === "add" ? await act(() => addFriend(v), `Demande envoyée à ${v}.`) : await act(() => createGroup(v), `Groupe « ${v} » créé.`);
    if (done) {
      setField("");
      setTool(null);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (chatWith ? setChatWith(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, chatWith]);

  const inLobby = new Set(lobby?.members.map((m) => m.summonerId));
  const online = friends.filter((f) => f.availability !== "offline").length;

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = friends.filter((f) => (!q || f.gameName.toLowerCase().includes(q)) && (!hideOffline || f.availability !== "offline"));
    // Comme le client Riot : tes groupes ne gardent que les amis connectés au jeu,
    // les amis sur mobile et hors ligne sont rangés à part, tout en bas.
    const byGroup = new Map<string, Friend[]>();
    const mobile: Friend[] = [];
    const offline: Friend[] = [];
    for (const f of shown) {
      if (f.availability === "offline") offline.push(f);
      else if (f.availability === "mobile") mobile.push(f);
      else {
        const name = f.groupName && f.groupName !== "**Default" ? f.groupName : "Général";
        byGroup.set(name, [...(byGroup.get(name) ?? []), f]);
      }
    }
    const byName = (a: Friend, b: Friend) => a.gameName.localeCompare(b.gameName, "fr");
    const priority = new Map(groups.map((g) => [g.name === "**Default" ? "Général" : g.name, g.priority ?? 0]));
    const main = [...byGroup.entries()]
      .sort((a, b) => (priority.get(a[0]) ?? 99) - (priority.get(b[0]) ?? 99) || a[0].localeCompare(b[0], "fr"))
      .map(([name, list]) => ({
        name,
        kind: "group" as const,
        list: list.sort((a, b) => (ORDER[a.availability] ?? 5) - (ORDER[b.availability] ?? 5) || byName(a, b)),
      }));
    const extra = [
      { name: "Sur mobile", kind: "mobile" as const, list: mobile.sort(byName) },
      { name: "Hors ligne", kind: "offline" as const, list: offline.sort(byName) },
    ].filter((x) => x.list.length);
    return [...main, ...extra];
  }, [friends, groups, query, hideOffline]);

  const toggle = (name: string) => {
    const next = collapsed.includes(name) ? collapsed.filter((c) => c !== name) : [...collapsed, name];
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
    } catch {
      /* stockage indisponible */
    }
  };

  if (chatWith) {
    const live = friends.find((f) => f.puuid === chatWith.puuid) ?? chatWith;
    return (
      <aside className={`fp fp-chat ${closing ? "closing" : ""}`} aria-label={`Conversation avec ${live.gameName}`}>
        <ChatView friend={live} id={chatId(live)} onBack={() => setChatWith(null)} onClose={onClose} />
      </aside>
    );
  }

  return (
    <aside className={`fp ${closing ? "closing" : ""}`} aria-label="Amis">
      <header className="fp-head">
        <h2>Amis</h2>
        <span>{online} en ligne</span>
        <button className={`fp-req-btn ${showRequests ? "on" : ""}`} onClick={() => setShowRequests((v) => !v)} aria-expanded={showRequests} title={incoming.length ? `${incoming.length} demande${incoming.length > 1 ? "s" : ""} d'ami` : "Demandes d'ami"}>
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="8" cy="7" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M2.5 17c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M15.5 6v5M13 8.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          {incoming.length > 0 && <em className="fp-unread">{incoming.length}</em>}
        </button>
        <button className="fp-close" onClick={onClose} aria-label="Fermer la liste d'amis">
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="fp-tools">
        <input className="search" placeholder="Rechercher un ami" aria-label="Rechercher un ami" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="chip" aria-pressed={hideOffline} onClick={() => setHideOffline((v) => !v)} title="Masquer les amis hors ligne">
          En ligne
        </button>
        <button className="chip" aria-pressed={tool === "add"} onClick={() => { setTool(tool === "add" ? null : "add"); setField(""); }} title="Ajouter un ami par Riot ID">
          + Ami
        </button>
        <button className="chip" aria-pressed={tool === "group"} onClick={() => { setTool(tool === "group" ? null : "group"); setField(""); }} title="Créer un groupe d'amis">
          + Groupe
        </button>
      </div>
      {tool && (
        <form className="fp-add" onSubmit={(e) => { e.preventDefault(); submitTool(); }}>
          <input className="search" autoFocus value={field} onChange={(e) => setField(e.target.value)} maxLength={40} placeholder={tool === "add" ? "Riot ID, ex. Nika#EUW" : "Nom du groupe"} aria-label={tool === "add" ? "Riot ID" : "Nom du groupe"} />
          <button className="btn btn-red small" type="submit" disabled={!field.trim()}>
            {tool === "add" ? "Envoyer" : "Créer"}
          </button>
        </form>
      )}
      {note && <div className={`fp-note ${note.ok ? "ok" : ""}`} role="status">{note.text}</div>}
      <div className="fp-list">
        {showRequests && incoming.length === 0 && outgoing.length === 0 && <p className="fp-empty fp-requests">Aucune demande d'ami en attente.</p>}
        {showRequests && incoming.length > 0 && (
          <section className="fp-group fp-requests">
            <div className="fp-group-head static"><b>Demandes d'ami</b><span>{incoming.length}</span></div>
            {incoming.map((r) => (
              <div key={r.puuid} className="fp-friend">
                <span className="fp-avatar"><Art src={profileIcon(r.icon ?? 29)} /></span>
                <div className="fp-who"><b>{r.gameName ?? "Joueur"}</b><span>#{r.gameTag ?? ""}</span></div>
                <button className="mini" onClick={() => act(() => answerRequest(r, true), `${r.gameName ?? "Joueur"} est ton ami.`)}>Accepter</button>
                <button className="mini ghost" onClick={() => act(() => answerRequest(r, false))} aria-label={`Refuser ${r.gameName ?? ""}`}>✕</button>
              </div>
            ))}
          </section>
        )}
        {showRequests && outgoing.length > 0 && (
          <section className="fp-group fp-requests">
            <div className="fp-group-head static"><b>Demandes envoyées</b><span>{outgoing.length}</span></div>
            {outgoing.map((r) => (
              <div key={r.puuid} className="fp-friend off">
                <span className="fp-avatar"><Art src={profileIcon(r.icon ?? 29)} /></span>
                <div className="fp-who"><b>{r.gameName ?? "Joueur"}</b><span>En attente</span></div>
                <button className="mini ghost" onClick={() => act(() => answerRequest(r, false))}>Annuler</button>
              </div>
            ))}
          </section>
        )}
        {sections.map((s) => {
          const closed = collapsed.includes(s.name);
          return (
            <section key={s.kind + s.name} className={`fp-group ${s.kind !== "group" ? `fp-${s.kind}` : ""}`}>
              <button className="fp-group-head" aria-expanded={!closed} onClick={() => toggle(s.name)}>
                <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" style={{ transform: closed ? "rotate(-90deg)" : undefined }}>
                  <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <b>{s.name}</b>
                <span>{s.kind === "group" ? `${s.list.length} en ligne` : s.list.length}</span>
              </button>
              {(() => {
                const g = realGroups.find((x) => x.name === s.name);
                return g ? (
                  <button className="fp-group-del" title={`Supprimer le groupe ${g.name} (ses amis retournent dans Général)`} onClick={() => confirm(`Supprimer le groupe « ${g.name} » ? Ses amis retournent dans Général.`) && act(() => deleteGroup(g.id))}>
                    ✕
                  </button>
                ) : null;
              })()}
              {!closed &&
                s.list.map((f) => {
                  const st = friendStatus(f);
                  const here = !!f.summonerId && inLobby.has(f.summonerId);
                  const canInvite = lobby && f.summonerId && !here && f.availability !== "offline" && f.lol?.gameStatus === "outOfGame";
                  return (
                    <div
                      key={f.puuid}
                      className={`fp-friend ${f.availability === "offline" ? "off" : ""} ${chatId(f) ? "can-chat" : ""}`}
                      onClick={() => chatId(f) && setChatWith(f)}
                      role={chatId(f) ? "button" : undefined}
                      tabIndex={chatId(f) ? 0 : undefined}
                      onKeyDown={(e) => e.key === "Enter" && chatId(f) && setChatWith(f)}
                      title={chatId(f) ? `Écrire à ${f.gameName}` : undefined}
                    >
                      <span className="fp-avatar">
                        <Art src={profileIcon(f.icon)} />
                        <i style={{ background: st.color }} />
                      </span>
                      <div className="fp-who">
                        <b>{f.gameName}</b>
                        <span style={{ color: here ? "var(--accent)" : st.color }}>{here ? "Dans ton groupe" : st.text}</span>
                      </div>
                      {(unread.get(chatId(f)) ?? 0) > 0 && <em className="fp-unread">{unread.get(chatId(f))}</em>}
                      {onHistory && f.puuid && (
                        <button className="mini ghost fp-more" title={`Historique de ${f.gameName}`} aria-label={`Historique de ${f.gameName}`} onClick={(e) => { e.stopPropagation(); onHistory(f); }}>
                          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 1-6.1 4.3M1.5 2v3.8h3.8M8 4.5V8l2.5 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      )}
                      {f.id && groups.length > 0 && (moving === f.puuid ? (
                        <select
                          className="fp-move"
                          autoFocus
                          value={f.groupId ?? defaultGroup?.id ?? ""}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => setMoving(null)}
                          onChange={(e) => { setMoving(null); act(() => moveFriend(f.id!, Number(e.target.value))); }}
                          aria-label={`Groupe de ${f.gameName}`}
                        >
                          {defaultGroup && <option value={defaultGroup.id}>Général</option>}
                          {realGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      ) : (
                        <button className="mini ghost fp-more" title="Changer de groupe" onClick={(e) => { e.stopPropagation(); setMoving(f.puuid); }}>⋯</button>
                      ))}
                      {canInvite && (
                        <button
                          className="mini"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInvite(f.summonerId!);
                          }}
                        >
                          Inviter
                        </button>
                      )}
                    </div>
                  );
                })}
            </section>
          );
        })}
        {sections.length === 0 && <p className="fp-empty">{friends.length ? "Aucun ami ne correspond." : "Ta liste d'amis est vide."}</p>}
      </div>
    </aside>
  );
}

const hhmm = (t: string) => {
  const d = new Date(t);
  return isNaN(+d) ? "" : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

/** Conversation avec un ami : historique du client, relu toutes les 2 s, et envoi au clic. */
function ChatView({ friend, id, onBack, onClose }: { friend: Friend; id: string; onBack: () => void; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const st = friendStatus(friend);

  useEffect(() => {
    let alive = true;
    let t: number;
    const poll = async () => {
      const list = await loadMessages(id).catch(() => null);
      if (alive && list) setMessages(list.filter((m) => m.type === "chat" || m.type === "groupchat" || !m.type));
      if (alive) t = window.setTimeout(poll, 2000);
    };
    openConversation(id).then(poll);
    markRead(id);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [id]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
    if (messages?.length) markRead(id);
  }, [messages?.length, id]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(id, body);
      setDraft("");
      const list = await loadMessages(id).catch(() => null);
      if (list) setMessages(list);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <header className="fp-head fc-head">
        <button className="fp-close fc-back" onClick={onBack} aria-label="Retour à la liste d'amis">
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M11 3L5 9l6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="fp-avatar">
          <Art src={profileIcon(friend.icon)} />
          <i style={{ background: st.color }} />
        </span>
        <div className="fp-who">
          <b>{friend.gameName}</b>
          <span style={{ color: st.color }}>{st.text}</span>
        </div>
        <button className="fp-close" onClick={onClose} aria-label="Fermer">
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="fc-list" aria-live="polite">
        {messages === null && <p className="fp-empty">Chargement…</p>}
        {messages?.length === 0 && <p className="fp-empty">Aucun message. Dis bonjour à {friend.gameName} !</p>}
        {messages?.map((m, i) => {
          const mine = isMine(m);
          const prev = messages[i - 1];
          const grouped = prev && isMine(prev) === mine;
          return (
            <div key={m.id || i} className={`fc-msg ${mine ? "mine" : ""} ${grouped ? "grouped" : ""}`}>
              <p>{m.body}</p>
              <time>{hhmm(m.timestamp)}</time>
            </div>
          );
        })}
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
        <input className="search" placeholder={friend.availability === "offline" ? `${friend.gameName} est hors ligne` : `Écrire à ${friend.gameName}`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} autoFocus />
        <button className="btn btn-red small" type="submit" disabled={!draft.trim() || sending}>
          Envoyer
        </button>
      </form>
    </>
  );
}
