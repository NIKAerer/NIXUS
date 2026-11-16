import { useEffect, useRef, useState } from "react";
import { RoomChat } from "../features/RoomChat";
import { actions, useClient } from "../lib/client";
import { championSquare, clock, profileIcon } from "../lib/lcu";
import { useNames } from "../lib/names";
import type { Friend, Lobby, LobbyMember } from "../lib/types";
import { nav, queueInfo, useView } from "../lib/view";
import { Art, Icon, cx } from "../ui";

export const POSITIONS: { id: string; label: string }[] = [
  { id: "TOP", label: "Top" },
  { id: "JUNGLE", label: "Jungle" },
  { id: "MIDDLE", label: "Mid" },
  { id: "BOTTOM", label: "ADC" },
  { id: "UTILITY", label: "Support" },
  { id: "FILL", label: "Tous" },
];
export const positionLabel = (id?: string) => POSITIONS.find((p) => p.id === id)?.label ?? "—";

/** « Rôle garanti » du client : protégé de l'autofill, avec la raison donnée par le client. */
export function roleGuard(m?: LobbyMember | null): { ok: boolean; label: string; why: string } | null {
  if (!m) return null;
  const why = [
    m.autoFillProtectedForStreaking && "ta série de victoires",
    m.autoFillProtectedForPromos && "ta série de promotion",
    m.autoFillProtectedForRemedy && "un autofill récent",
    m.autoFillProtectedForSoloing && "tu joues en solo",
  ].filter(Boolean) as string[];
  if (why.length) return { ok: true, label: "Rôle garanti", why: `Pas d'autofill pour la prochaine partie grâce à ${why.join(" et ")}.` };
  if (m.autoFillEligible) return { ok: false, label: "Autofill possible", why: "Le matchmaking peut te mettre sur un autre rôle si ça accélère la file." };
  return null;
}

type Popover = null | "party" | 0 | 1;

/**
 * Barre de jeu, toujours au même endroit sur toutes les pages : la file, le groupe, les rôles et le bouton pour jouer.
 * En recherche, elle se transforme en compteur avec le bouton Annuler.
 */
export function PlayDock() {
  const phase = useClient((s) => s.phase);
  const lobby = useClient((s) => s.lobby);
  const search = useClient((s) => s.search);
  const preparing = useClient((s) => s.preparing);
  const queues = useClient((s) => s.queues);
  const friends = useClient((s) => s.friends);
  const queueId = useView((s) => s.queueId);
  const [pop, setPop] = useState<Popover>(null);
  const root = useRef<HTMLDivElement>(null);

  // Suit la file du groupe si elle a été choisie ailleurs (client officiel, invitation acceptée).
  const lobbyQueue = lobby?.gameConfig.queueId;
  useEffect(() => {
    if (lobbyQueue && lobbyQueue > 0) nav.queue(lobbyQueue);
  }, [lobbyQueue]);

  // Les bulles se ferment au clic à côté et avec Échap.
  useEffect(() => {
    if (pop === null) return;
    const down = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setPop(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setPop(null);
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [pop]);

  const searching = phase === "Matchmaking" || phase === "ReadyCheck";
  useEffect(() => {
    if (searching) setPop(null);
  }, [searching]);
  useEffect(() => {
    if (!lobby) setPop(null);
  }, [!lobby]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = queueInfo(queueId, queues, lobby);
  const me = lobby?.localMember;
  const leader = !lobby || !!me?.isLeader;
  const customTeams = info.custom && !info.practice;
  const pool = lobby ? (lobby.members.length ? lobby.members : [...(lobby.gameConfig.customTeam100 ?? []), ...(lobby.gameConfig.customTeam200 ?? [])]) : [];
  const members = [...pool].sort((a, b) => Number(b.summonerId === me?.summonerId) - Number(a.summonerId === me?.summonerId));
  const max = lobby ? lobby.gameConfig.maxLobbySize ?? (info.custom ? 10 : 5) : 5;
  const showRoles = !!lobby?.gameConfig.showPositionSelector && !!me;
  // Pénalité d'abandon (file à faible priorité) ou interdiction temporaire de jouer.
  const penalty = Math.max(search?.lowPriorityData?.penaltyTimeRemaining ?? 0, ...(search?.errors ?? []).map((e) => e.penaltyTimeRemaining ?? 0));

  const setRole = (slot: 0 | 1, id: string) => {
    if (!me) return;
    let [a, b] = [me.firstPositionPreference, me.secondPositionPreference];
    if (slot === 0) [a, b] = [id, b === id && id !== "FILL" ? a : b];
    else [a, b] = [a === id && id !== "FILL" ? b : a, id];
    actions.setPositions(a, b);
    setPop(null);
  };

  const t = search?.timeInQueue ?? 0;
  const eta = search?.estimatedQueueTime ?? 0;

  return (
    <div className="dock-wrap" ref={root}>
      {penalty > 0 && (
        <div className="warn dock-warn" role="alert">
          File à faible priorité : encore {clock(penalty)} d'attente avant que la recherche démarre.
        </div>
      )}
      {lobby && <RoomChat key={lobby.multiUserChatId ?? "lobby"} kind="lobby" hint={lobby.multiUserChatId} lookup />}
      {pop === "party" && lobby && (customTeams ? <CustomSheet lobby={lobby} friends={friends} locked={searching} /> : <PartySheet lobby={lobby} members={members} max={max} friends={friends} locked={searching} />)}

      <div className={cx("dock glass", searching && "searching")} role="region" aria-label="Barre de jeu">
        {searching ? (
          <>
            <span className="radar" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <div className="dock-search" role="status" aria-live="polite">
              <span className="label">{phase === "ReadyCheck" ? "Partie trouvée" : "Recherche en cours"} · {info.title}</span>
              <b className="mono">{clock(t)}</b>
              <small className={eta > 0 && t > eta ? "over" : undefined}>{eta ? `Temps estimé ${clock(eta)}` : "Temps estimé inconnu"}</small>
            </div>
            <Avatars members={members} max={Math.min(max, 5)} />
            <button className="btn btn-quiet" onClick={actions.cancelSearch} disabled={!leader} title={leader ? "Quitter la file" : "Seul le chef du groupe peut annuler"}>
              Annuler
            </button>
            <i className="dock-progress" aria-hidden="true">
              <i style={{ width: `${eta ? Math.min(100, (t / eta) * 100) : 0}%` }} />
            </i>
          </>
        ) : (
          <>
            <button className="dock-queue" onClick={() => nav.modes(true)} title="Changer de mode de jeu">
              <span className="label">{lobby ? "Groupe prêt" : "Mode de jeu"}</span>
              <b>{info.title}</b>
              <Icon name="chevron" size={14} />
            </button>

            <i className="dock-sep" />

            {lobby ? (
              <button className="dock-party" aria-expanded={pop === "party"} onClick={() => setPop(pop === "party" ? null : "party")} title="Voir le groupe, inviter des amis">
                <Avatars members={members} max={Math.min(max, 5)} slots />
                <span>
                  <span className="label">{customTeams ? "Salon" : "Groupe"}</span>
                  <b>
                    {members.length} / {max}
                  </b>
                </span>
              </button>
            ) : (
              <button className="dock-party solo" onClick={() => actions.openLobby(queueId)} title="Créer un groupe pour inviter des amis ou choisir tes rôles">
                <span className="slot free">
                  <Icon name="plus" size={15} />
                </span>
                <span>
                  <span className="label">Groupe</span>
                  <b>Créer un groupe</b>
                </span>
              </button>
            )}

            {showRoles && (
              <>
                <i className="dock-sep" />
                <div className="dock-roles">
                  {([0, 1] as const).map((slot) => {
                    const current = slot === 0 ? me!.firstPositionPreference : me!.secondPositionPreference;
                    return (
                      <div key={slot} className="role">
                        <button aria-expanded={pop === slot} onClick={() => setPop(pop === slot ? null : slot)}>
                          <span className="label">{slot === 0 ? "Rôle principal" : "Secondaire"}</span>
                          <b>{positionLabel(current)}</b>
                        </button>
                        {pop === slot && (
                          <div className="role-menu glass" role="menu">
                            {POSITIONS.map((p) => {
                              const scarce = lobby!.scarcePositions?.includes(p.id);
                              return (
                                <button key={p.id} role="menuitemradio" aria-checked={current === p.id} onClick={() => setRole(slot, p.id)} title={scarce ? `${p.label} : rôle recherché, la file est plus rapide` : undefined}>
                                  {p.label}
                                  {scarce && <i className="gold">◆</i>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {roleGuard(me)?.ok && (
                    <span className="tag green" title={roleGuard(me)!.why}>
                      Garanti
                    </span>
                  )}
                </div>
              </>
            )}

            <span className="dock-gap" />

            {leader ? (
              <button className="btn btn-red btn-l dock-go" disabled={preparing} onClick={() => (info.custom ? actions.startCustom() : actions.findMatch(queueId))}>
                <Icon name="play" fill size={18} />
                {preparing ? "Préparation du client…" : info.custom ? "Lancer la partie" : "Trouver une partie"}
              </button>
            ) : (
              <span className="dock-note">Le chef du groupe lance la recherche.</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Avatars({ members, max, slots }: { members: LobbyMember[]; max: number; slots?: boolean }) {
  const shown = members.slice(0, max);
  return (
    <span className="avatars">
      {shown.map((m) => (
        <span key={m.summonerId} className={cx("slot", m.isLeader && "leader")}>
          <Art src={m.isBot && m.botChampionId ? championSquare(m.botChampionId) : profileIcon(m.summonerIconId)} />
        </span>
      ))}
      {slots &&
        Array.from({ length: Math.max(0, max - shown.length) }, (_, i) => (
          <span key={`f${i}`} className="slot free">
            <Icon name="plus" size={13} />
          </span>
        ))}
    </span>
  );
}

const invitable = (friends: Friend[], inside: Set<number>) => friends.filter((f) => f.availability !== "offline" && f.lol?.gameStatus === "outOfGame" && f.summonerId && !inside.has(f.summonerId));

function InviteList({ friends, inside }: { friends: Friend[]; inside: Set<number> }) {
  const list = invitable(friends, inside);
  const [sent, setSent] = useState<Set<number>>(new Set());
  return (
    <div className="sheet-invite">
      <span className="label">Inviter un ami disponible</span>
      {list.length ? (
        <div className="sheet-friends">
          {list.map((f) => (
            <button
              key={f.puuid}
              disabled={sent.has(f.summonerId!)}
              onClick={() => {
                actions.invite(f.summonerId!);
                setSent(new Set(sent).add(f.summonerId!));
              }}
            >
              <Art src={profileIcon(f.icon)} />
              <b>{f.gameName}</b>
              <span>{sent.has(f.summonerId!) ? "Invité" : "Inviter"}</span>
            </button>
          ))}
        </div>
      ) : (
        <span className="note">Aucun ami disponible pour l'instant.</span>
      )}
    </div>
  );
}

function SheetHead({ title, sub, locked }: { title: string; sub: string; locked: boolean }) {
  return (
    <div className="sheet-head">
      <h3 className="h2">{title}</h3>
      <span className="dim">{sub}</span>
      {!locked && (
        <button className="btn btn-quiet btn-s" onClick={actions.leaveLobby}>
          <Icon name="exit" size={14} />
          Quitter
        </button>
      )}
    </div>
  );
}

/** Bulle du groupe : membres, rôles, invitations. */
function PartySheet({ lobby, members, max, friends, locked }: { lobby: Lobby; members: LobbyMember[]; max: number; friends: Friend[]; locked: boolean }) {
  const me = lobby.localMember;
  const showRoles = lobby.gameConfig.showPositionSelector;
  const known = useNames(members.map((m) => (m.gameName || m.summonerName ? undefined : m.puuid)));
  const nameOf = (m: LobbyMember) => m.gameName || m.summonerName || known(m.puuid) || "Joueur";
  const guard = roleGuard(me);
  return (
    <div className="sheet glass" role="dialog" aria-label="Groupe">
      <SheetHead title="Groupe" sub={`${members.length} / ${max} joueurs`} locked={locked} />
      <ul className="sheet-members">
        {members.map((m) => {
          const mine = m.summonerId === me?.summonerId;
          return (
            <li key={m.summonerId} className={cx(mine && "mine")}>
              <Art src={profileIcon(m.summonerIconId)} />
              <b title={nameOf(m)}>{nameOf(m)}</b>
              {mine && <em className="tag">Toi</em>}
              {m.isLeader && <em className="tag gold">Chef</em>}
              {roleGuard(m)?.ok && (
                <em className="tag green" title={roleGuard(m)!.why}>
                  Garanti
                </em>
              )}
              {showRoles && (
                <span className="sheet-roles">
                  {positionLabel(m.firstPositionPreference)} <i>/</i> {positionLabel(m.secondPositionPreference)}
                </span>
              )}
              {me?.isLeader && !mine && !locked && (
                <button className="mini ghost" onClick={() => actions.kick(m.summonerId)} title={`Exclure ${nameOf(m)}`}>
                  Exclure
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {guard && showRoles && (
        <p className={cx("sheet-guard", guard.ok && "ok")}>
          <Icon name="shield" size={16} />
          <span>
            <b>{guard.label}.</b> {guard.why}
          </span>
        </p>
      )}
      {!locked && members.length < max && <InviteList friends={friends} inside={new Set(members.map((m) => m.summonerId))} />}
    </div>
  );
}

/** Bulle d'une partie personnalisée, comme dans le client : côté bleu, côté rouge et spectateurs. */
function CustomSheet({ lobby, friends, locked }: { lobby: Lobby; friends: Friend[]; locked: boolean }) {
  const cfg = lobby.gameConfig;
  const blue = cfg.customTeam100 ?? [];
  const red = cfg.customTeam200 ?? [];
  const specs = cfg.customSpectators ?? [];
  const size = cfg.maxTeamSize || Math.max(1, Math.round((cfg.maxLobbySize ?? 10) / 2));
  const me = lobby.localMember;
  const leader = !!me?.isLeader;
  const has = (list: LobbyMember[]) => list.some((m) => m.summonerId === me?.summonerId);
  const mySide: "100" | "200" | "spectator" | null = has(blue) ? "100" : has(red) ? "200" : has(specs) ? "spectator" : null;
  const specsAllowed = cfg.customSpectatorPolicy !== "NotAllowed";
  const everyone = [...blue, ...red, ...specs, ...lobby.members];
  const known = useNames(everyone.map((m) => (m.gameName || m.summonerName ? undefined : m.puuid)));
  const name = (m: LobbyMember) => m.gameName || m.summonerName || known(m.puuid) || (m.isBot ? "Bot" : "Joueur");

  const join = (side: "100" | "200") => {
    if (mySide === side) return;
    if (mySide === "100" || mySide === "200") actions.customSwitchSide();
    else actions.customMoveTo(side);
  };

  const team = (side: "100" | "200", list: LobbyMember[]) => (
    <div className={cx("team", side === "100" ? "blue" : "red")}>
      <div className="team-head">
        <h4 className="h3">{side === "100" ? "Côté bleu" : "Côté rouge"}</h4>
        <span className="dim">
          {list.length} / {size}
        </span>
      </div>
      {list.map((m) => {
        const mine = m.summonerId === me?.summonerId;
        return (
          <div key={m.summonerId || name(m)} className={cx("team-slot", mine && "mine")}>
            <Art src={m.isBot && m.botChampionId ? championSquare(m.botChampionId) : profileIcon(m.summonerIconId)} />
            <b title={name(m)}>{name(m)}</b>
            {m.isLeader && <em className="tag gold">Chef</em>}
            {m.isBot && <em className="tag">Bot</em>}
            {mine && <em className="tag">Toi</em>}
            {leader && !mine && !m.isBot && !locked && (
              <button className="mini ghost" onClick={() => actions.kick(m.summonerId)} title={`Exclure ${name(m)}`} aria-label={`Exclure ${name(m)}`}>
                <Icon name="close" size={11} />
              </button>
            )}
          </div>
        );
      })}
      {Array.from({ length: Math.max(0, size - list.length) }, (_, i) =>
        mySide !== side && i === 0 ? (
          <button key={`j${i}`} className="team-slot join" onClick={() => join(side)} disabled={locked}>
            <Icon name="swap" size={14} /> Rejoindre ce côté
          </button>
        ) : (
          <span key={`f${i}`} className="team-slot free">
            Place libre
          </span>
        ),
      )}
    </div>
  );

  return (
    <div className="sheet sheet-wide glass" role="dialog" aria-label="Partie personnalisée">
      <SheetHead title="Salon" sub={`${blue.length + red.length} / ${size * 2} joueurs${specs.length ? ` · ${specs.length} spectateur${specs.length > 1 ? "s" : ""}` : ""}`} locked={locked} />
      <div className="teams">
        {team("100", blue)}
        {team("200", red)}
      </div>
      <div className="specs">
        <span className="label">Spectateurs</span>
        {!specsAllowed ? (
          <span className="note">Désactivés pour cette partie.</span>
        ) : specs.length ? (
          specs.map((m) => (
            <span key={m.summonerId} className={cx("chip", m.summonerId === me?.summonerId && "mine")}>
              {name(m)}
            </span>
          ))
        ) : (
          <span className="note">Personne.</span>
        )}
        {specsAllowed && mySide !== "spectator" && (
          <button className="chip" onClick={() => actions.customMoveTo("spectator")} disabled={locked}>
            <Icon name="eye" size={14} /> Regarder en spectateur
          </button>
        )}
      </div>
      {!locked && <InviteList friends={friends} inside={new Set(everyone.map((m) => m.summonerId))} />}
    </div>
  );
}
