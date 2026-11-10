import { RefreshButton } from "../components/RefreshButton";
import { FriendsLeaderboard } from "../components/FriendsLeaderboard";
import { Breathing } from "../components/Breathing";
import { RoomChat } from "../components/RoomChat";
import { CustomLobby } from "../components/CustomLobby";
import { useNames } from "../lib/names";
import { useEffect, useState } from "react";
import { Art, MatchTile, Skeleton } from "../components/ui";
import { readHeroSkin, SkinPicker, type HeroSkin } from "../components/SkinPicker";
import { ModePicker, type CustomConfig } from "../components/ModePicker";
import { championSplash, skinSplash, clock, profileIcon, QUEUES, queueName, rankLabel } from "../lib/lcu";
import type { ClientState } from "../lib/useClient";
import type { Friend, Lobby, LobbyMember, Match } from "../lib/types";

export const POSITIONS: { id: string; label: string }[] = [
  { id: "TOP", label: "Top" },
  { id: "JUNGLE", label: "Jungle" },
  { id: "MIDDLE", label: "Mid" },
  { id: "BOTTOM", label: "ADC" },
  { id: "UTILITY", label: "Support" },
  { id: "FILL", label: "Indifférent" },
];
const positionLabel = (id: string) => POSITIONS.find((p) => p.id === id)?.label ?? "—";

/** « Rôle garanti » du client : protégé de l'autofill, avec la raison donnée par le client. */
export function roleGuard(m?: LobbyMember | null): { label: string; why: string } | null {
  if (!m) return null;
  const why = [
    m.autoFillProtectedForStreaking && "ta série de victoires",
    m.autoFillProtectedForPromos && "ta série de promotion",
    m.autoFillProtectedForRemedy && "un autofill récent",
    m.autoFillProtectedForSoloing && "tu joues en solo",
  ].filter(Boolean) as string[];
  if (why.length) return { label: "Rôle garanti", why: `Pas d'autofill pour la prochaine partie grâce à ${why.join(" et ")}.` };
  if (m.autoFillEligible) return { label: "Autofill possible", why: "Le matchmaking peut te mettre sur un autre rôle si ça accélère la file." };
  return null;
}

interface Props {
  state: ClientState;
  actions: {
    findMatch: (queueId: number) => void;
    cancelSearch: () => void;
    openLobby: (queueId: number) => void;
    leaveLobby: () => void;
    setPositions: (a: string, b: string) => void;
    invite: (summonerId: number) => void;
    reconnect: () => void;
    createCustom: (c: CustomConfig) => void;
    joinCustom: (id: number, password?: string) => void;
    startCustom: () => void;
    customSwitchSide: () => void;
    customMoveTo: (target: "spectator" | "100" | "200") => void;
    kick: (summonerId: number) => void;
    refresh: () => Promise<void>;
  };
  onOpenMatch: (m: Match) => void;
  onOpenFriend?: (f: Friend) => void;
}

export function Home({ state, actions, onOpenMatch, onOpenFriend }: Props) {
  const { phase, search, history, champions, ranked, lobby } = state;
  const lobbyQueueId = lobby?.gameConfig.queueId ?? null;
  const [queueId, setQueueId] = useState<number>(420);
  const [picking, setPicking] = useState(false);
  const [heroSkin, setHeroSkin] = useState<HeroSkin | null>(readHeroSkin);
  const [skinPicker, setSkinPicker] = useState(false);

  // Suit la file du groupe si elle a été choisie ailleurs (client officiel, invitation acceptée).
  useEffect(() => {
    if (lobbyQueueId) setQueueId(lobbyQueueId);
  }, [lobbyQueueId]);

  const custom = !!lobby?.gameConfig.isCustom;
  const live = state.queues.find((q) => q.id === queueId);
  const fixed = QUEUES.find((q) => q.id === queueId);
  const queueTitle = custom ? lobby?.gameConfig.customLobbyName || "Partie personnalisée" : live?.name || fixed?.label || queueName(queueId);
  const queueBlurb = custom
    ? lobby?.gameConfig.gameMode === "PRACTICETOOL"
      ? "Outil d'entraînement : seul sur la Faille, sans enjeu."
      : "Partie personnalisée : le chef lance la sélection quand tout le monde est là."
    : live?.detailedDescription || fixed?.blurb || (live?.description !== live?.name ? live?.description : "") || "";
  const searching = phase === "Matchmaking" || phase === "ReadyCheck";
  const inGame = phase === "InProgress" || phase === "GameStart";
  const heroChampion = history[0]?.participants[0]?.championId ?? 64;
  // Fond automatique : les derniers champions joués défilent, chacun avec un skin tiré au hasard.
  const heroList = [...new Set(history.map((m) => m.participants[0]?.championId).filter(Boolean) as number[])].slice(0, 5);
  if (!heroList.length) heroList.push(heroChampion);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (heroList.length < 2) return;
    const t = window.setInterval(() => setSlide((s) => s + 1), 12000);
    return () => clearInterval(t);
  }, [heroList.length]);
  const solo = ranked?.queueMap[queueId === 440 ? "RANKED_FLEX_SR" : "RANKED_SOLO_5x5"];
  const champName = (id: number) => champions.get(id)?.name ?? "Champion";

  const today = history.filter((m) => Date.now() - m.gameCreation < 12 * 3600_000);
  const wins = today.filter((m) => m.participants[0]?.stats.win).length;

  // Pénalité d'abandon (file à faible priorité) ou interdiction temporaire de jouer.
  const penalty = Math.max(search?.lowPriorityData?.penaltyTimeRemaining ?? 0, ...(search?.errors ?? []).map((e) => e.penaltyTimeRemaining ?? 0));
  const isLeader = !lobby || lobby.localMember?.isLeader;

  return (
    <>
      <section className="hero">
        <div className="hero-bg slides">
          {heroSkin ? (
            <Breathing full key={heroSkin.skinId} src={skinSplash(heroSkin.championId, heroSkin.skinId)} champ={heroSkin.championId} className="on" />
          ) : (
            heroList.map((id, i) => <Breathing full key={id} src={championSplash(id)} champ={id} className={i === slide % heroList.length ? "on" : ""} />)
          )}
        </div>
        <HeroFx />
        <button className="hero-skin" onClick={() => setSkinPicker(true)} title="Choisir le champion et le skin affichés ici">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 11.5V14h2.5l7.4-7.4-2.5-2.5L2 11.5zm11.7-6.8a.7.7 0 000-1l-1.4-1.4a.7.7 0 00-1 0l-1.2 1.2 2.5 2.5 1.1-1.3z" fill="currentColor" />
          </svg>
          Changer le fond
        </button>
        <div className="hero-content">
          <div className="eyebrow">
            {phase === "Reconnect" ? "Partie en cours" : inGame ? "Partie en cours" : searching ? "Recherche en cours" : lobby ? "Groupe prêt" : "File sélectionnée"}
          </div>
          <h1 className="title">{queueTitle.toUpperCase()}</h1>
          <p className="blurb">
            {queueBlurb}
            {!custom && (queueId === 420 || queueId === 440) && solo?.tier ? ` Tu es ${rankLabel(solo.tier, solo.division)}, ${solo.leaguePoints} LP.` : ""}
          </p>

          {penalty > 0 && (
            <div className="warn" role="alert">
              File à faible priorité : encore {clock(penalty)} d'attente avant que la recherche démarre.
            </div>
          )}

          <div className="btns">
            {phase === "Reconnect" ? (
              <button className="btn btn-red" onClick={actions.reconnect}>
                Reconnecter à la partie
              </button>
            ) : inGame ? (
              <span className="meta">Bonne game ! NIXUS se met à jour dès la fin de la partie.</span>
            ) : searching ? (
              <>
                <button className="btn btn-ghost" onClick={actions.cancelSearch} disabled={!isLeader}>
                  Annuler la recherche
                </button>
                <span className="meta">
                  <b>{clock(search?.timeInQueue ?? 0)}</b> · estimé {clock(search?.estimatedQueueTime ?? 0)}
                </span>
              </>
            ) : isLeader ? (
              <>
                <button className="btn btn-primary" disabled={!!state.preparing} onClick={() => (custom ? actions.startCustom() : actions.findMatch(queueId))}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 4l14 8-14 8z" fill="currentColor" />
                  </svg>
                  {state.preparing ? "Préparation du client…" : custom ? "Lancer la partie" : "Trouver une partie"}
                </button>
                <button className="btn btn-ghost" onClick={() => setPicking(true)}>
                  Modes de jeu
                </button>
                {!lobby && (
                  <button className="btn btn-ghost" onClick={() => actions.openLobby(queueId)}>
                    Créer un groupe
                  </button>
                )}
              </>
            ) : (
              <span className="meta">Le chef du groupe lance la recherche.</span>
            )}
          </div>
        </div>

        {(() => {
          const customPanel = !!lobby && !inGame && custom && lobby.gameConfig.gameMode !== "PRACTICETOOL";
          return (
            <div className={`hero-side${lobby && !inGame ? (customPanel ? " with-custom" : " with-lobby") : ""}`}>
              <FriendsLeaderboard friends={state.friends} summoner={state.summoner} ranked={state.ranked} onOpenFriend={onOpenFriend} />
              {lobby && !inGame && (customPanel ? <CustomLobby lobby={lobby} friends={state.friends} actions={actions} locked={searching} /> : <LobbyPanel lobby={lobby} friends={state.friends} actions={actions} locked={searching} />)}
            </div>
          );
        })()}
        {lobby && !inGame && (
          <RoomChat key={lobby.multiUserChatId ?? "lobby"} kind="lobby" hint={lobby.multiUserChatId} lookup />
        )}
      </section>

      <div className="rows">
        <section className="row">
          <h2>
            Dernières parties
            {today.length > 0 && (
              <span>
                Aujourd'hui : {wins} V · {today.length - wins} D
              </span>
            )}
          </h2>
          {history.length ? (
            <div className="tiles">
              {history.slice(0, 6).map((m) => (
                <MatchTile key={m.gameId} match={m} champion={champName(m.participants[0]?.championId ?? 0)} onOpen={onOpenMatch} puuid={state.summoner?.puuid} />
              ))}
            </div>
          ) : !state.historyLoaded ? (
            <div className="tiles" aria-label="Chargement de tes dernières parties">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="skel-tile" />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <b>Pas encore de partie récente</b>
              <p>Si tu as déjà joué, le client n'a sans doute pas fini de charger ton historique. NIXUS réessaie tout seul, ou clique sur Actualiser.</p>
              <RefreshButton onRefresh={actions.refresh} label="Actualiser" />
            </div>
          )}
        </section>
      </div>
      {picking && (
        <ModePicker
          queues={state.queues}
          current={custom ? -1 : queueId}
          canChange={!!isLeader && !searching}
          summonerName={state.summoner?.gameName ?? "Invocateur"}
          onPick={(q) => {
            setQueueId(q.id);
            setPicking(false);
            if (lobby) actions.openLobby(q.id);
          }}
          onCreateCustom={(c) => {
            setPicking(false);
            actions.createCustom(c);
          }}
          onJoinCustom={(id, password) => {
            setPicking(false);
            actions.joinCustom(id, password);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {skinPicker && (
        <SkinPicker champions={champions} current={heroSkin} autoChampion={heroChampion} onChange={setHeroSkin} onClose={() => setSkinPicker(false)} />
      )}
    </>
  );
}

/** Particules et lumières qui flottent devant le fond. */
function HeroFx() {
  const embers = Array.from({ length: 22 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: -((i * 1.7) % 14),
    duration: 10 + ((i * 3) % 9),
    size: 2 + (i % 3),
    drift: ((i * 13) % 60) - 30,
  }));
  return (
    <div className="hero-fx" aria-hidden="true">
      <i className="glow g1" />
      <i className="glow g2" />
      {embers.map((e, i) => (
        <i
          key={i}
          className="ember"
          style={{ left: `${e.left}%`, width: e.size, height: e.size, animationDelay: `${e.delay}s`, animationDuration: `${e.duration}s`, ["--drift" as string]: `${e.drift}px` }}
        />
      ))}
    </div>
  );
}

function LobbyPanel({ lobby, friends, actions, locked }: { lobby: Lobby; friends: Friend[]; actions: Props["actions"]; locked: boolean }) {
  const [inviting, setInviting] = useState(false);
  const me = lobby.localMember;
  const showRoles = lobby.gameConfig.showPositionSelector;
  const max = lobby.gameConfig.maxLobbySize ?? (lobby.gameConfig.isCustom ? 10 : 5);
  const memberIds = new Set(lobby.members.map((m) => m.summonerId));
  const invitable = friends.filter((f) => f.availability !== "offline" && f.lol?.gameStatus === "outOfGame" && f.summonerId && !memberIds.has(f.summonerId));
  // Toi d'abord, puis les autres membres, puis les places libres.
  const pool = lobby.members.length ? lobby.members : [...(lobby.gameConfig.customTeam100 ?? []), ...(lobby.gameConfig.customTeam200 ?? [])];
  const members = [...pool].sort((a, b) => Number(b.summonerId === me?.summonerId) - Number(a.summonerId === me?.summonerId));
  const free = Math.max(0, max - members.length);
  const known = useNames(members.map((m) => (m.gameName || m.summonerName ? undefined : m.puuid)));
  const nameOf = (m: LobbyMember) => m.gameName || m.summonerName || known(m.puuid) || "Joueur";

  const setRole = (slot: 0 | 1, id: string) => {
    if (!me) return;
    let [a, b] = [me.firstPositionPreference, me.secondPositionPreference];
    if (slot === 0) [a, b] = [id, b === id && id !== "FILL" ? a : b];
    else [a, b] = [a === id && id !== "FILL" ? b : a, id];
    actions.setPositions(a, b);
  };

  return (
    <aside className={`squad ${max > 5 ? "many" : ""}`} aria-label="Groupe">
      <div className="squad-head">
        <h2>Groupe</h2>
        <span>
          {members.length} / {max} joueurs
        </span>
        {!locked && (
          <button className="squad-leave" onClick={actions.leaveLobby}>
            Quitter
          </button>
        )}
      </div>

      <div className="squad-row">
        {members.map((m) => {
          const mine = m.summonerId === me?.summonerId;
          return (
            <div key={m.summonerId} className={`squad-card ${mine ? "mine" : ""}`}>
              {m.isLeader && <em className="squad-crown">Chef</em>}
              <span className="squad-icon">
                <Art src={profileIcon(m.summonerIconId)} />
              </span>
              <b title={nameOf(m)}>{nameOf(m)}</b>
              {showRoles && (
                <span className="squad-roles">
                  <i>{positionLabel(m.firstPositionPreference)}</i>
                  <i className="second">{positionLabel(m.secondPositionPreference)}</i>
                </span>
              )}
              {mine && <span className="squad-you">Toi</span>}
              {roleGuard(m)?.label === "Rôle garanti" && <em className="squad-guard" title={roleGuard(m)!.why}>Garanti</em>}
            </div>
          );
        })}
        {Array.from({ length: free }, (_, i) => (
          <button key={`free-${i}`} className="squad-card free" onClick={() => setInviting((v) => !v)} disabled={locked} title="Inviter un ami">
            <span className="squad-plus">+</span>
            <span>Inviter</span>
          </button>
        ))}
      </div>

      {inviting && !locked && (
        <div className="squad-invite">
          <div className="squad-invite-head">
            <span className="label">Amis disponibles</span>
            <button className="squad-leave" onClick={() => setInviting(false)}>
              Fermer
            </button>
          </div>
          {invitable.length ? (
            invitable.map((f) => (
              <button
                key={f.puuid}
                className="member member-btn"
                onClick={() => {
                  actions.invite(f.summonerId!);
                  setInviting(false);
                }}
              >
                <Art src={profileIcon(f.icon)} className="member-icon" />
                <b>{f.gameName}</b>
                <span style={{ marginLeft: "auto" }}>Inviter</span>
              </button>
            ))
          ) : (
            <span className="meta">Aucun ami disponible.</span>
          )}
        </div>
      )}

      {showRoles && me && (
        <div className="squad-pick" role="group" aria-label="Tes rôles">
          {roleGuard(me) && (
            <div className={`role-guard ${roleGuard(me)!.label === "Rôle garanti" ? "ok" : "fill"}`} title={roleGuard(me)!.why}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3zm-1 13.6l6-6-1.4-1.4L11 12.8 8.4 10.2 7 11.6l4 4z" />
              </svg>
              <b>{roleGuard(me)!.label}</b>
              <span>{roleGuard(me)!.why}</span>
            </div>
          )}
          {([0, 1] as const).map((slot) => {
            const current = slot === 0 ? me.firstPositionPreference : me.secondPositionPreference;
            return (
              <div key={slot} className="squad-pick-row">
                <span className="label">{slot === 0 ? "Rôle principal" : "Rôle secondaire"}</span>
                <div className="squad-seg">
                  {POSITIONS.map((p) => (
                    <button
                      key={p.id}
                      aria-pressed={current === p.id}
                      disabled={locked}
                      onClick={() => setRole(slot, p.id)}
                      className={lobby.scarcePositions?.includes(p.id) ? "scarce" : undefined}
                      title={lobby.scarcePositions?.includes(p.id) ? `${p.label} : rôle recherché, la file est plus rapide` : undefined}
                    >
                      {p.id === "FILL" ? "Tous" : p.label}
                      {lobby.scarcePositions?.includes(p.id) && <i className="scarce-dot" aria-hidden="true">◆</i>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
