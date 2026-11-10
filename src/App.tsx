import { useEffect, useRef, useState } from "react";
import { ChampSelect } from "./screens/ChampSelect";
import { EndOfGame } from "./screens/EndOfGame";
import { InGame } from "./screens/InGame";
import { Profile } from "./screens/Profile";
import { Grind } from "./screens/Grind";
import { Collection } from "./screens/Collection";
import { Loot } from "./screens/Loot";
import { MatchDetail } from "./components/MatchDetail";
import { SettingsPanel } from "./components/SettingsPanel";
import { HonorBallot } from "./components/HonorBallot";
import { Invitations } from "./components/Invitations";
import { ReportFeedback } from "./components/ReportFeedback";
import { useReportFeedback } from "./lib/feedback";
import { ReadyCheck } from "./components/ReadyCheck";
import { TopBar, type Page } from "./components/TopBar";
import { Home } from "./screens/Home";
import { useClient } from "./lib/useClient";
import { Skeleton } from "./components/ui";
import { FriendsPanel } from "./components/FriendsPanel";
import { FriendHistory } from "./components/FriendHistory";
import type { Friend, Match } from "./lib/types";
import { WindowControls } from "./components/WindowControls";
import { QueueBar } from "./components/QueueBar";
import { isDesktop } from "./lib/lcu";
import { grabAttention, notifyReady, playChime } from "./lib/window";
import { getSettings, useSettings } from "./lib/settings";
import { checkUpdate, useUpdate } from "./lib/updater";
import { unreadTotal, useConversations } from "./lib/chat";
import { invoke } from "@tauri-apps/api/core";

export function App() {
  const { state, actions, error, clearError, demo } = useClient();
  const [page, setPage] = useState<Page>("home");
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [openMatch, setOpenMatch] = useState<Match | null>(null);
  const [historyOf, setHistoryOf] = useState<Friend | null>(null);
  const [matchOwner, setMatchOwner] = useState<string | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = useSettings();
  const [friendsOpen, setFriendsOpen] = useState(() => {
    try {
      return localStorage.getItem("nexus.friendsOpen") === "1";
    } catch {
      return false;
    }
  });
  // Ouverture et fermeture animées : à la fermeture, le panneau glisse avant d'être retiré.
  const [fpClosing, setFpClosing] = useState(false);
  const saveFriends = (open: boolean) => {
    try {
      localStorage.setItem("nexus.friendsOpen", open ? "1" : "0");
    } catch {
      /* stockage indisponible */
    }
  };
  const toggleFriends = () => {
    if (fpClosing) return;
    if (!friendsOpen) {
      setFriendsOpen(true);
      saveFriends(true);
      return;
    }
    setFpClosing(true);
    saveFriends(false);
    setTimeout(() => {
      setFriendsOpen(false);
      setFpClosing(false);
    }, 240);
  };
  const shownError = error ?? localError;

  // Partie trouvée : son + fenêtre ramenée devant. L'acceptation reste un clic du joueur.
  const lastPhase = useRef(state.phase);
  useEffect(() => {
    if (state.phase === "ReadyCheck" && lastPhase.current !== "ReadyCheck") {
      const s = getSettings();
      if (s.readySound) playChime(s.volume);
      if (s.readyFocus) grabAttention();
      if (s.readyNotify) notifyReady();
    }
    lastPhase.current = state.phase;
  }, [state.phase]);

  // Mise à jour : vérification discrète au lancement, pastille sur la roue si une version attend.
  const update = useUpdate();
  const conversations = useConversations();
  useEffect(() => {
    if (!getSettings().checkUpdates) return;
    const t = setTimeout(() => checkUpdate(true), 4000);
    return () => clearTimeout(t);
  }, []);

  // « Réduire les animations » de Windows : coupe aussi la respiration.
  const [reduced, setReduced] = useState(() => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const feedback = useReportFeedback(state.connection === "connected");

  if (state.connection === "connecting") return <BootShell />;
  if (state.connection !== "connected") {
    return <Disconnected connecting={false} />;
  }

  const champSelect = state.phase === "ChampSelect";
  const showEog = !champSelect && !!state.endOfGame;
  const playing = state.phase === "InProgress" || state.phase === "GameStart" || state.phase === "Reconnect";
  const inGame = !champSelect && !showEog && playing;
  const calm = playing && settings.calmInGame;
  const breathOff = !settings.breath || reduced || calm || settings.breathAmt <= 0;

  return (
    <div className={`app ${isDesktop ? "desktop" : ""} ${friendsOpen && !fpClosing && !champSelect ? "with-friends" : ""} ${settings.heroFx ? "" : "no-fx"} ${settings.modeBadges ? "" : "no-badges"} ${breathOff ? "br-stop" : ""} ${calm ? "calm" : ""}`}
      style={{ "--br-a": (settings.breathAmt / 60).toFixed(2) } as React.CSSProperties}
      ref={setScroller}
    >
      <WindowControls />
      <TopBar
        page={page}
        onPage={
          champSelect
            ? undefined
            : (p) => {
                actions.closeEndOfGame();
                setPage(p);
              }
        }
        summoner={state.summoner}
        ranked={state.ranked}
        wallet={state.wallet}
        demo={demo}
        searching={state.phase === "Matchmaking"}
        scroller={scroller}
        friendsOnline={state.friends.filter((f) => f.availability !== "offline").length}
        friendsOpen={friendsOpen && !fpClosing && !champSelect}
        onFriends={champSelect ? undefined : toggleFriends}
        onSettings={() => setSettingsOpen(true)}
        onRefresh={champSelect ? undefined : actions.refresh}
        updateReady={update.phase === "available"}
        unread={unreadTotal(conversations)}
      />

      {champSelect ? (
        <ChampSelect champions={state.champions} history={state.history} mastery={state.mastery} summonerLevel={state.summoner?.summonerLevel} onError={setLocalError} />
      ) : showEog ? (
        <EndOfGame eog={state.endOfGame!} champions={state.champions} ranked={state.ranked} rankBefore={state.rankBefore} myPuuid={state.summoner?.puuid} onPlayAgain={actions.playAgain} onClose={actions.closeEndOfGame} />
      ) : inGame ? (
        <InGame phase={state.phase} champions={state.champions} myPuuid={state.summoner?.puuid} onReconnect={actions.reconnect} />
      ) : page === "home" ? (
        <Home state={state} actions={actions} onOpenMatch={setOpenMatch} onOpenFriend={setHistoryOf} />
      ) : page === "grind" ? (
        <Grind state={state} onOpenMatch={setOpenMatch} />
      ) : page === "loot" ? (
        <Loot />
      ) : page === "collection" ? (
        <Collection summoner={state.summoner} onIconChanged={actions.refreshProfile} />
      ) : (
        <Profile state={state} onOpenMatch={setOpenMatch} onChanged={actions.refreshProfile} onRefresh={actions.refresh} />
      )}

      {friendsOpen && !champSelect && (
        <FriendsPanel closing={fpClosing} friends={state.friends} groups={state.friendGroups} lobby={state.lobby} onInvite={actions.invite} onChanged={actions.refreshFriends} onHistory={setHistoryOf} onClose={toggleFriends} />
      )}

      {historyOf && !champSelect && !openMatch && (
        <FriendHistory friend={historyOf} champions={state.champions} onOpen={(m) => (setMatchOwner(historyOf.puuid), setOpenMatch(m))} onClose={() => setHistoryOf(null)} />
      )}
      {openMatch && !champSelect && (
        <MatchDetail match={openMatch} myPuuid={matchOwner ?? state.summoner?.puuid} champions={state.champions} onClose={() => (setOpenMatch(null), setMatchOwner(undefined))} />
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      {state.phase === "Matchmaking" && settings.queueBar && (
        <QueueBar
          search={state.search}
          queueId={state.lobby?.gameConfig?.queueId}
          canCancel={!state.lobby || !!state.lobby.localMember?.isLeader}
          onCancel={actions.cancelSearch}
        />
      )}
      {state.phase === "ReadyCheck" && <ReadyCheck search={state.search} onAccept={actions.accept} onDecline={actions.decline} />}
      <HonorBallot phase={state.phase} champions={state.champions} />
      {!champSelect && !playing && <ReportFeedback items={feedback.items} onDismiss={feedback.dismiss} />}
      {!champSelect && <Invitations invitations={state.invitations} friends={state.friends} onAnswer={actions.answerInvitation} />}

      {shownError && (
        <div className="toast" role="alert">
          {shownError}
          <button
            onClick={() => {
              clearError();
              setLocalError(null);
            }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}

/** Écran sans client : lance LoL une fois si l'option est active, sinon propose de le faire. */
/** Premier affichage pendant qu'on cherche le client : l'interface est déjà là, en squelettes, plutôt qu'un écran vide. */
function BootShell() {
  return (
    <div className={`app boot ${isDesktop ? "desktop" : ""}`} aria-busy="true" aria-label="Connexion au client League of Legends">
      <WindowControls />
      <header className="top" data-tauri-drag-region>
        <div className="logo" data-tauri-drag-region>
          NIXUS
        </div>
        <Skeleton style={{ width: 340, height: 14 }} />
        <span style={{ flex: 1 }} />
        <Skeleton style={{ width: 120, height: 32 }} />
        <Skeleton style={{ width: 36, height: 36 }} />
      </header>
      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow">Connexion au client League of Legends…</span>
          <Skeleton style={{ width: "min(520px, 80vw)", height: 72 }} />
          <Skeleton style={{ width: "min(380px, 60vw)", height: 16 }} />
          <div style={{ display: "flex", gap: 12 }}>
            <Skeleton style={{ width: 170, height: 48 }} />
            <Skeleton style={{ width: 150, height: 48 }} />
          </div>
        </div>
      </section>
      <div className="rows">
        <section className="row">
          <Skeleton style={{ width: 180, height: 22 }} />
          <div className="tiles">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="skel-tile" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Disconnected({ connecting }: { connecting: boolean }) {
  const [launch, setLaunch] = useState<"idle" | "started" | string>("idle");
  const start = () =>
    invoke<string>("launch_league").then(
      (r) => setLaunch(r === "running" ? "started" : r),
      (e) => setLaunch(String(e)),
    );
  useEffect(() => {
    if (isDesktop && getSettings().autoLaunchLol) start();
  }, []);
  const started = launch === "started";
  const failed = launch !== "idle" && !started;
  return (
    <div className={`center ${isDesktop ? "desktop" : ""}`}>
      <WindowControls />
      <div>
        <div className="logo" style={{ marginBottom: 24 }}>
          NIXUS
        </div>
        <h1>{connecting ? "CONNEXION…" : started ? "LANCEMENT DE LOL…" : "LANCE LEAGUE OF LEGENDS"}</h1>
        <p>
          {connecting
            ? "Recherche du client Riot sur ce PC."
            : started
              ? "Le client démarre. Connecte-toi dans la fenêtre Riot si elle le demande, NIXUS prend le relais tout seul."
              : "NIXUS se branche sur le client officiel. Ouvre-le et connecte-toi, NIXUS le détectera tout seul en quelques secondes."}
        </p>
        {failed && <p className="re-error">{launch}</p>}
        {isDesktop && !connecting && !started && (
          <div className="btns" style={{ justifyContent: "center" }}>
            <button className="btn btn-red" onClick={start}>
              Lancer League of Legends
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
