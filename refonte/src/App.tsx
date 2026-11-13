import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FriendHistory, FriendsPanel } from "./features/Friends";
import { HonorBallot } from "./features/HonorBallot";
import { MatchDetail } from "./features/MatchDetail";
import { ModePicker } from "./features/ModePicker";
import { SettingsPanel } from "./features/Settings";
import { useClient } from "./lib/client";
import { useReportFeedback } from "./lib/feedback";
import { isDesktop } from "./lib/lcu";
import { getSettings, useSettings } from "./lib/settings";
import { checkUpdate } from "./lib/updater";
import { nav, useView } from "./lib/view";
import { grabAttention, notifyReady, playChime } from "./lib/window";
import { Collection } from "./screens/Collection";
import { Draft } from "./screens/Draft";
import { EndOfGame } from "./screens/EndOfGame";
import { Grind } from "./screens/Grind";
import { Home } from "./screens/Home";
import { InGame } from "./screens/InGame";
import { Loot } from "./screens/Loot";
import { Profile } from "./screens/Profile";
import { Boot, Disconnected } from "./shell/Boot";
import { Notices, ReadyCheck } from "./shell/Overlays";
import { PlayDock } from "./shell/PlayDock";
import { TopBar } from "./shell/TopBar";
import { cx } from "./ui";

export function App() {
  const connection = useClient((s) => s.connection);
  const phase = useClient((s) => s.phase);
  const hasEog = useClient((s) => !!s.endOfGame);
  const myPuuid = useClient((s) => s.summoner?.puuid);
  const page = useView((s) => s.page);
  const friendsOpen = useView((s) => s.friendsOpen);
  const settingsOpen = useView((s) => s.settingsOpen);
  const modesOpen = useView((s) => s.modesOpen);
  const match = useView((s) => s.match);
  const historyOf = useView((s) => s.historyOf);
  const settings = useSettings();
  const [scrolled, setScrolled] = useState(false);

  // Partie trouvée : son, fenêtre ramenée devant, notification. L'acceptation reste un clic du joueur.
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (phase === "ReadyCheck" && lastPhase.current !== "ReadyCheck") {
      const s = getSettings();
      if (s.readySound) playChime(s.volume);
      if (s.readyFocus) grabAttention();
      if (s.readyNotify) notifyReady();
    }
    lastPhase.current = phase;
  }, [phase]);

  // Mise à jour : vérification discrète au lancement, pastille sur la roue si une version attend.
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

  const feedback = useReportFeedback(connection === "connected");
  useEffect(() => setScrolled(false), [page, phase, hasEog]);

  if (connection === "connecting") return <Boot />;
  if (connection !== "connected") return <Disconnected />;

  const draft = phase === "ChampSelect";
  const eog = !draft && hasEog;
  const playing = phase === "InProgress" || phase === "GameStart" || phase === "Reconnect";
  const inGame = !draft && !eog && playing;
  const calm = playing && settings.calmInGame;
  const breathOff = !settings.breath || reduced || calm || settings.breathAmt <= 0;
  // La barre de jeu n'existe qu'au repos et en file : jamais pendant le draft, la partie ou l'écran de fin.
  const dock = !draft && !eog && !inGame && ["None", "Lobby", "Matchmaking", "ReadyCheck"].includes(phase);
  const fullBleed = draft || eog || inGame || page === "home";

  return (
    <div
      className={cx("app", isDesktop && "desktop", !settings.heroFx && "no-fx", !settings.modeBadges && "no-badges", breathOff && "br-stop", calm && "calm", (scrolled || !fullBleed) && "solid")}
      style={{ "--br-a": (settings.breathAmt / 60).toFixed(2) } as CSSProperties}
    >
      <TopBar locked={draft} />
      <div className="body">
        <main className={cx("stage", dock && "has-dock")}>
          <div className="view" key={draft ? "draft" : eog ? "eog" : inGame ? "game" : page} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 24)}>
            {draft ? <Draft /> : eog ? <EndOfGame /> : inGame ? <InGame /> : page === "home" ? <Home /> : page === "grind" ? <Grind /> : page === "collection" ? <Collection /> : page === "loot" ? <Loot /> : <Profile />}
          </div>
          {dock && <PlayDock />}
        </main>
        {friendsOpen && !draft && <FriendsPanel />}
      </div>

      {historyOf && !draft && !match && <FriendHistory friend={historyOf} />}
      {match && !draft && <MatchDetail match={match.match} myPuuid={match.owner ?? myPuuid} onClose={nav.closeMatch} />}
      {modesOpen && dock && <ModePicker />}
      {settingsOpen && <SettingsPanel />}
      {phase === "ReadyCheck" && <ReadyCheck />}
      <HonorBallot />
      {!draft && <Notices feedback={feedback.items} onDismiss={feedback.dismiss} quiet={playing} />}
      <div id="layer" />
    </div>
  );
}
