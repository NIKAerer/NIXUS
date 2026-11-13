import { useEffect, useMemo, useRef, useState } from "react";
import { isMine, loadMessages, markRead, openConversation, sendMessage, useConversations, type ChatMessage } from "../lib/chat";
import { actions, useClient } from "../lib/client";
import { friendlyError } from "../lib/errors";
import { addFriend, answerRequest, createGroup, deleteGroup, moveFriend, useFriendRequests } from "../lib/friends";
import { championSquare, lcu, profileIcon, queueName, rankLabel, timeAgo } from "../lib/lcu";
import type { Friend, Match, MatchHistory, RankedStats } from "../lib/types";
import { nav } from "../lib/view";
import { Art, Breathing, CloseButton, Empty, Icon, Modal, Skeleton, cx, hhmm, kda, pct, plural, readJson, useEscape, writeJson } from "../ui";

const ORDER: Record<string, number> = { chat: 0, dnd: 1, away: 2, mobile: 3, offline: 4 };
const COLLAPSED_KEY = "nexus.collapsedGroups";
type Tone = "on" | "busy" | "away" | "off";

/** Ce que fait un ami, en clair, et la couleur de sa pastille. */
export function friendStatus(f: Friend): { text: string; tone: Tone } {
  const s = f.lol?.gameStatus;
  if (f.availability === "offline") return { text: "Hors ligne", tone: "off" };
  if (s === "inGame") return { text: `En partie${f.lol?.gameQueueType ? ` · ${f.lol.gameQueueType}` : ""}`, tone: "busy" };
  if (s === "championSelect") return { text: "Sélection des champions", tone: "busy" };
  if (s === "inQueue") return { text: "En file d'attente", tone: "busy" };
  if (f.availability === "away") return { text: "Absent", tone: "away" };
  if (f.availability === "mobile") return { text: "Sur mobile", tone: "off" };
  return { text: "Disponible", tone: "on" };
}

const chatId = (f: Friend) => f.id ?? f.pid ?? "";

function Avatar({ icon, tone }: { icon: number; tone?: Tone }) {
  return (
    <span className="avatar">
      <Art src={profileIcon(icon)} />
      {tone && <i className={tone} />}
    </span>
  );
}

/** Panneau des amis à droite, rangés par les groupes d'amis du client Riot. */
export function FriendsPanel() {
  const friends = useClient((s) => s.friends);
  const groups = useClient((s) => s.friendGroups);
  const lobby = useClient((s) => s.lobby);
  const [query, setQuery] = useState("");
  // « Hors ligne » est replié par défaut, comme dans le client.
  const [collapsed, setCollapsed] = useState<string[]>(() => readJson(COLLAPSED_KEY, ["Hors ligne"]));
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [chatWith, setChatWith] = useState<Friend | null>(null);
  const [tool, setTool] = useState<null | "add" | "group" | "requests">(null);
  const [field, setField] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  /** Groupe dont la suppression attend un second clic. */
  const [armed, setArmed] = useState<number | null>(null);
  const conversations = useConversations();
  const [requests, reloadRequests] = useFriendRequests();

  const unread = new Map(conversations.map((c) => [c.id, c.unreadMessageCount ?? 0]));
  const incoming = requests.filter((r) => r.direction === "in");
  const outgoing = requests.filter((r) => r.direction === "out");
  const realGroups = groups.filter((g) => g.name !== "**Default");
  const defaultGroup = groups.find((g) => g.name === "**Default");
  const inLobby = new Set(lobby?.members.map((m) => m.summonerId));
  const online = friends.filter((f) => f.availability !== "offline").length;

  useEscape(() => (chatWith ? setChatWith(null) : nav.toggleFriends()));

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setNote(null);
    try {
      await fn();
      if (ok) setNote({ ok: true, text: ok });
      reloadRequests();
      actions.refreshFriends();
      return true;
    } catch (e) {
      setNote({ ok: false, text: friendlyError(e) });
      return false;
    }
  };
  const pickTool = (t: typeof tool) => {
    setTool(tool === t ? null : t);
    setField("");
  };
  const submit = async () => {
    const v = field.trim();
    if (!v) return;
    const done = tool === "add" ? await act(() => addFriend(v), `Demande envoyée à ${v}.`) : await act(() => createGroup(v), `Groupe « ${v} » créé.`);
    if (done) pickTool(null);
  };

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = friends.filter((f) => (!q || f.gameName.toLowerCase().includes(q)) && (!onlineOnly || f.availability !== "offline"));
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
      .map(([name, list]) => ({ name, kind: "group" as const, list: list.sort((a, b) => (ORDER[a.availability] ?? 5) - (ORDER[b.availability] ?? 5) || byName(a, b)) }));
    const extra = [
      { name: "Sur mobile", kind: "mobile" as const, list: mobile.sort(byName) },
      { name: "Hors ligne", kind: "offline" as const, list: offline.sort(byName) },
    ].filter((x) => x.list.length);
    return [...main, ...extra];
  }, [friends, groups, query, onlineOnly]);

  const toggle = (name: string) => {
    const next = collapsed.includes(name) ? collapsed.filter((c) => c !== name) : [...collapsed, name];
    setCollapsed(next);
    writeJson(COLLAPSED_KEY, next);
  };

  if (chatWith) {
    const live = friends.find((f) => f.puuid === chatWith.puuid) ?? chatWith;
    return (
      <aside className="friends" aria-label={`Conversation avec ${live.gameName}`}>
        <Chat friend={live} onBack={() => setChatWith(null)} />
      </aside>
    );
  }

  return (
    <aside className="friends" aria-label="Amis">
      <header className="friends-head">
        <h2 className="h2">Amis</h2>
        <span className="dim">{online} en ligne</span>
        <button className="icon-btn" aria-pressed={tool === "requests"} onClick={() => pickTool("requests")} title={incoming.length ? `${plural(incoming.length, "demande")} d'ami` : "Demandes d'ami"} aria-label="Demandes d'ami">
          <Icon name="users" size={16} />
          {incoming.length > 0 && <i className="badge">{incoming.length}</i>}
        </button>
        <CloseButton onClose={nav.toggleFriends} label="Fermer la liste d'amis" />
      </header>

      <div className="friends-tools">
        <label className="search-box">
          <Icon name="search" size={15} />
          <input className="input" placeholder="Rechercher un ami" aria-label="Rechercher un ami" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="chips">
          <button className="chip" aria-pressed={onlineOnly} onClick={() => setOnlineOnly((v) => !v)} title="Masquer les amis hors ligne">
            En ligne
          </button>
          <button className="chip" aria-pressed={tool === "add"} onClick={() => pickTool("add")} title="Ajouter un ami par Riot ID">
            <Icon name="plus" size={12} /> Ami
          </button>
          <button className="chip" aria-pressed={tool === "group"} onClick={() => pickTool("group")} title="Créer un groupe d'amis">
            <Icon name="plus" size={12} /> Groupe
          </button>
        </div>
        {(tool === "add" || tool === "group") && (
          <form
            className="friends-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input className="input" autoFocus value={field} onChange={(e) => setField(e.target.value)} maxLength={40} placeholder={tool === "add" ? "Riot ID, ex. Nom#EUW" : "Nom du groupe"} aria-label={tool === "add" ? "Riot ID" : "Nom du groupe"} />
            <button className="btn btn-red btn-s" type="submit" disabled={!field.trim()}>
              {tool === "add" ? "Envoyer" : "Créer"}
            </button>
          </form>
        )}
        {note && (
          <p className={cx("note", note.ok ? "ok" : "bad")} role="status">
            {note.text}
          </p>
        )}
      </div>

      <div className="friends-list">
        {tool === "requests" && (
          <section className="fgroup requests">
            <div className="fgroup-head">
              <b>Demandes d'ami</b>
              <span>{incoming.length + outgoing.length}</span>
            </div>
            {incoming.length + outgoing.length === 0 && <p className="note">Aucune demande d'ami en attente.</p>}
            {incoming.map((r) => (
              <div key={r.puuid} className="friend">
                <Avatar icon={r.icon ?? 29} />
                <span className="two">
                  <b>{r.gameName ?? "Joueur"}</b>
                  <small>#{r.gameTag ?? ""}</small>
                </span>
                <button className="mini" onClick={() => act(() => answerRequest(r, true), `${r.gameName ?? "Joueur"} est ton ami.`)}>
                  Accepter
                </button>
                <button className="mini ghost" onClick={() => act(() => answerRequest(r, false))} aria-label={`Refuser ${r.gameName ?? ""}`}>
                  Refuser
                </button>
              </div>
            ))}
            {outgoing.map((r) => (
              <div key={r.puuid} className="friend off">
                <Avatar icon={r.icon ?? 29} />
                <span className="two">
                  <b>{r.gameName ?? "Joueur"}</b>
                  <small>Demande envoyée, en attente</small>
                </span>
                <button className="mini ghost" onClick={() => act(() => answerRequest(r, false))}>
                  Annuler
                </button>
              </div>
            ))}
          </section>
        )}

        {sections.map((s) => {
          const closed = collapsed.includes(s.name);
          const group = realGroups.find((x) => x.name === s.name);
          return (
            <section key={s.kind + s.name} className={cx("fgroup", s.kind)}>
              <div className="fgroup-head">
                <button aria-expanded={!closed} onClick={() => toggle(s.name)}>
                  <Icon name="chevron" size={12} className={cx(closed && "shut")} />
                  <b>{s.name}</b>
                  <span>{s.kind === "group" ? `${s.list.length} en ligne` : s.list.length}</span>
                </button>
                {group && (
                  <button
                    className={cx("mini ghost fgroup-del", armed === group.id && "armed")}
                    title={`Supprimer le groupe ${group.name} (ses amis retournent dans Général)`}
                    onBlur={() => setArmed(null)}
                    onClick={() => (armed === group.id ? (setArmed(null), act(() => deleteGroup(group.id), `Groupe « ${group.name} » supprimé.`)) : setArmed(group.id))}
                  >
                    {armed === group.id ? "Confirmer" : "Supprimer"}
                  </button>
                )}
              </div>
              {!closed &&
                s.list.map((f) => {
                  const st = friendStatus(f);
                  const id = chatId(f);
                  const here = !!f.summonerId && inLobby.has(f.summonerId);
                  const canInvite = lobby && f.summonerId && !here && f.availability !== "offline" && f.lol?.gameStatus === "outOfGame";
                  const news = unread.get(id) ?? 0;
                  return (
                    <div key={f.puuid} className={cx("friend", f.availability === "offline" && "off")}>
                      <button className="friend-main" disabled={!id} onClick={() => setChatWith(f)} title={id ? `Écrire à ${f.gameName}` : undefined}>
                        <Avatar icon={f.icon} tone={st.tone} />
                        <span className="two">
                          <b>{f.gameName}</b>
                          <small className={cx("st", here ? "here" : st.tone)}>{here ? "Dans ton groupe" : st.text}</small>
                        </span>
                        {news > 0 && <i className="badge">{news}</i>}
                      </button>
                      <span className="friend-acts">
                        {f.puuid && (
                          <button className="mini ghost" title={`Historique de ${f.gameName}`} aria-label={`Historique de ${f.gameName}`} onClick={() => nav.history(f)}>
                            <Icon name="history" size={14} />
                          </button>
                        )}
                        {f.id &&
                          groups.length > 0 &&
                          (moving === f.puuid ? (
                            <select
                              className="input friend-move"
                              autoFocus
                              value={f.groupId ?? defaultGroup?.id ?? ""}
                              onBlur={() => setMoving(null)}
                              onChange={(e) => {
                                setMoving(null);
                                act(() => moveFriend(f.id!, Number(e.target.value)));
                              }}
                              aria-label={`Groupe de ${f.gameName}`}
                            >
                              {defaultGroup && <option value={defaultGroup.id}>Général</option>}
                              {realGroups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <button className="mini ghost" title="Changer de groupe" aria-label={`Changer ${f.gameName} de groupe`} onClick={() => setMoving(f.puuid)}>
                              <Icon name="dots" size={14} />
                            </button>
                          ))}
                      </span>
                      {canInvite && (
                        <button className="mini" onClick={() => actions.invite(f.summonerId!)}>
                          Inviter
                        </button>
                      )}
                    </div>
                  );
                })}
            </section>
          );
        })}
        {sections.length === 0 && <Empty>{friends.length ? "Aucun ami ne correspond." : "Ta liste d'amis est vide."}</Empty>}
      </div>
    </aside>
  );
}

/** Conversation avec un ami : historique du client, relu toutes les 2 s. Chaque message part d'un clic. */
function Chat({ friend, onBack }: { friend: Friend; onBack: () => void }) {
  const id = chatId(friend);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const st = friendStatus(friend);
  const keep = (list: ChatMessage[]) => list.filter((m) => m.type === "chat" || m.type === "groupchat" || !m.type);

  useEffect(() => {
    let alive = true;
    let t = 0;
    const poll = async () => {
      const list = await loadMessages(id).catch(() => null);
      if (alive && list) setMessages(keep(list));
      if (alive) t = window.setTimeout(poll, 2000);
    };
    openConversation(id).then(poll);
    markRead(id);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [id]);

  const count = messages?.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
    if (count) markRead(id);
  }, [count, id]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(id, body);
      setDraft("");
      const list = await loadMessages(id).catch(() => null);
      if (list) setMessages(keep(list));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <header className="friends-head chat-head">
        <button className="icon-btn" onClick={onBack} aria-label="Retour à la liste d'amis" title="Retour">
          <Icon name="back" size={16} />
        </button>
        <Avatar icon={friend.icon} tone={st.tone} />
        <span className="two">
          <b>{friend.gameName}</b>
          <small className={cx("st", st.tone)}>{st.text}</small>
        </span>
        <CloseButton onClose={nav.toggleFriends} />
      </header>
      <div className="chat-list" aria-live="polite">
        {messages === null && <p className="wait">Chargement…</p>}
        {messages?.length === 0 && <p className="wait">Aucun message. Dis bonjour à {friend.gameName} !</p>}
        {messages?.map((m, i) => {
          const mine = isMine(m);
          const prev = messages[i - 1];
          return (
            <div key={m.id || i} className={cx("bubble", mine && "mine", prev && isMine(prev) === mine && "grouped")}>
              <p>{m.body}</p>
              <time>{hhmm(m.timestamp)}</time>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {error && (
        <p className="note bad chat-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input className="input" placeholder={friend.availability === "offline" ? `${friend.gameName} est hors ligne` : `Écrire à ${friend.gameName}`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} autoFocus />
        <button className="btn btn-red btn-s" type="submit" disabled={!draft.trim() || sending}>
          Envoyer
        </button>
      </form>
    </>
  );
}

/** Les 20 dernières parties d'un ami et son rang, comme son profil dans le client. */
export function FriendHistory({ friend }: { friend: Friend }) {
  const champions = useClient((s) => s.champions);
  const [games, setGames] = useState<Match[] | null>(null);
  const [error, setError] = useState(false);
  const [ranked, setRanked] = useState<RankedStats | null>(null);
  const close = () => nav.history(null);

  useEffect(() => {
    let alive = true;
    setGames(null);
    setError(false);
    setRanked(null);
    lcu<MatchHistory>("GET", `/lol-match-history/v1/products/lol/${friend.puuid}/matches?begIndex=0&endIndex=19`).then(
      (h) => alive && setGames(h?.games?.games ?? []),
      () => alive && setError(true),
    );
    lcu<RankedStats>("GET", `/lol-ranked/v1/ranked-stats/${friend.puuid}`).then(
      (r) => alive && setRanked(r),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [friend.puuid]);

  const solo = ranked?.queueMap?.RANKED_SOLO_5x5;
  const flex = ranked?.queueMap?.RANKED_FLEX_SR;
  const list = games ?? [];
  const wins = list.filter((g) => g.participants[0]?.stats.win).length;
  const total = (pick: "kills" | "deaths" | "assists") => list.reduce((n, g) => n + (g.participants[0]?.stats[pick] ?? 0), 0);

  return (
    <Modal label={`Historique de ${friend.gameName}`} onClose={close} size="m" className="fh">
      <header className="modal-head">
        <Avatar icon={friend.icon} tone={friendStatus(friend).tone} />
        <div className="grow">
          <h2>{friend.gameName}</h2>
          <small>
            {solo?.tier && solo.tier !== "NONE" ? `Solo/Duo : ${rankLabel(solo.tier, solo.division)} · ${solo.leaguePoints} LP` : "Solo/Duo : non classé"}
            {flex?.tier && flex.tier !== "NONE" ? ` · Flex : ${rankLabel(flex.tier, flex.division)}` : ""}
          </small>
        </div>
        {list.length > 0 && (
          <span className="two fh-sum">
            <b>
              <span className="up">{wins} V</span> · <span className="down">{list.length - wins} D</span>
            </b>
            <small>
              {pct(wins / list.length)} · KDA {kda(total("kills"), total("deaths"), total("assists"))}
            </small>
          </span>
        )}
        <CloseButton onClose={close} />
      </header>
      <div className="modal-body">
        {error ? (
          <Empty title="Historique indisponible">Le client n'a pas renvoyé l'historique de {friend.gameName}.</Empty>
        ) : games === null ? (
          <div className="fh-list" aria-label="Chargement des parties">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} style={{ height: 54 }} />
            ))}
          </div>
        ) : list.length === 0 ? (
          <Empty title="Aucune partie récente" />
        ) : (
          <ul className="fh-list">
            {list.map((g) => {
              const p = g.participants[0];
              const remake = g.gameDuration > 0 && g.gameDuration < 300;
              const result = remake ? "remake" : p?.stats.win ? "win" : "loss";
              return (
                <li key={g.gameId}>
                  <button className={cx("fh-game", result)} onClick={() => nav.openMatch(g, friend.puuid)}>
                    <span className="fh-champ">{p && <Breathing src={championSquare(p.championId)} champ={p.championId} />}</span>
                    <span className="two">
                      <b>{p ? champions.get(p.championId)?.name ?? "Champion" : "?"}</b>
                      <small>
                        {queueName(g.queueId)} · {Math.round(g.gameDuration / 60)} min · {timeAgo(g.gameCreation)}
                      </small>
                    </span>
                    <span className="mono fh-kda">{p ? `${p.stats.kills} / ${p.stats.deaths} / ${p.stats.assists}` : ""}</span>
                    <em>{remake ? "Remake" : result === "win" ? "Victoire" : "Défaite"}</em>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
