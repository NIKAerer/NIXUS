import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { friendlyError } from "./errors";
import { recordLp, snapshot, syncArchive } from "./archive";
import { getSettings } from "./settings";
import { isDesktop, lcu, lcuStatus, setQueueNames, setSkinPool } from "./lcu";
import type {
  ChampionSummary,
  EndOfGame,
  Friend,
  FriendGroup,
  GameQueue,
  GameflowPhase,
  Invitation,
  Lobby,
  Mastery,
  Match,
  MatchHistory,
  RankedStats,
  SearchState,
  Summoner,
  Wallet,
} from "./types";

export type Connection = "connecting" | "connected" | "disconnected";

export interface ClientState {
  connection: Connection;
  /** NIXUS rouvre le client avant de lancer la recherche. */
  preparing?: boolean;
  phase: GameflowPhase;
  summoner: Summoner | null;
  ranked: RankedStats | null;
  wallet: Wallet | null;
  mastery: Map<number, Mastery>;
  friends: Friend[];
  friendGroups: FriendGroup[];
  queues: GameQueue[];
  history: Match[];
  /** L'historique a répondu au moins une fois (sinon on montre des squelettes). */
  historyLoaded?: boolean;
  lobby: Lobby | null;
  invitations: Invitation[];
  search: SearchState | null;
  endOfGame: EndOfGame | null;
  /** Rangs pris au début de la sélection des champions, pour calculer les LP gagnés ou perdus. */
  rankBefore: RankedStats | null;
  champions: Map<number, ChampionSummary>;
}

const initial: ClientState = {
  connection: "connecting",
  phase: "None",
  summoner: null,
  ranked: null,
  wallet: null,
  mastery: new Map(),
  friends: [],
  friendGroups: [],
  queues: [],
  history: [],
  lobby: null,
  invitations: [],
  search: null,
  endOfGame: null,
  rankBefore: readRankBefore(),
  champions: new Map(),
};

function readRankBefore(): RankedStats | null {
  try {
    return JSON.parse(localStorage.getItem("nexus.rankBefore") ?? "null");
  } catch {
    return null;
  }
}

const soft = <T,>(p: Promise<T>) => p.catch(() => null);
const WALLET = `/lol-inventory/v1/wallet?currencyTypes=${encodeURIComponent('["RP","lol_blue_essence"]')}`;

/** Garde l'interface synchronisée avec le client Riot par interrogations régulières. */
/** Hors file, on ferme la fenêtre du client officiel pour libérer la RAM (le client reste branché en fond).
 *  Avant toute recherche, on la rouvre réduite et on attend qu'elle soit chargée : sinon le client la rouvre
 *  lui-même au moment de la partie trouvée, et perd l'acceptation et la connexion au draft. */
let uxClosed = false;

/* Mesure du démarrage : temps (ms depuis l'ouverture de NIXUS) de chaque étape, noté une fois dans archive/debug. */
const bootMarks: Record<string, number> = {};
function boot(step: string) {
  if (bootMarks[step] !== undefined) return;
  bootMarks[step] = Math.round(performance.now());
  if (["connected", "profile", "history", "champions"].every((k) => bootMarks[k] !== undefined)) snapshot("startup", [], { ms: bootMarks });
}
let lastQueueSnap = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uxRunning = () => (isDesktop ? invoke<boolean>("ux_running").catch(() => true) : Promise.resolve(true));

/* Fermeture automatique : au repos (aucune file) après 8 s, et pendant la partie après 10 s, comme l'option
 * officielle « fermer le client pendant la partie ». Jamais en file, à l'acceptation ni en draft. */
let autoPhase: GameflowPhase | null = null;
let phaseSince = 0;
let lastTry = 0;
let manualUntil = 0;

/** Bouton « Afficher » : on rouvre le client et on le laisse ouvert 10 minutes (boutique, réglages…). */
export function showLolWindow() {
  manualUntil = Date.now() + 10 * 60_000;
  uxClosed = false;
  return lcu("POST", "/riotclient/launch-ux").catch(() => {});
}

async function autoHide(phase: GameflowPhase) {
  if (phase !== autoPhase) {
    autoPhase = phase;
    phaseSince = Date.now();
  }
  if (!getSettings().hideLol || !getSettings().autoLaunchLol) return;
  const rest = phase === "None" || phase === "Lobby" || phase === "EndOfGame";
  if (!rest && phase !== "InProgress") return;
  const now = Date.now();
  if (now - phaseSince < (rest ? 8000 : 10000) || now < manualUntil || now - lastTry < (uxClosed ? 60000 : 20000)) return;
  lastTry = now;
  if (!(await uxRunning())) {
    uxClosed = true;
    return;
  }
  await lcu("POST", "/riotclient/kill-ux").then(
    () => (uxClosed = true),
    (e) => snapshot("kill-ux-failed", ["/riotclient/ux-state"], { phase, error: String((e as Error)?.message ?? e) }),
  );
}

/** Rouvre le client (réduit) et attend qu'il soit prêt. Ne fait rien s'il n'a pas été fermé par NIXUS. */
async function ensureUx(wait: boolean) {
  if (!uxClosed && (await uxRunning())) return;
  uxClosed = false;
  await lcu("POST", "/riotclient/launch-ux").catch(() => {});
  const minimize = () => lcu("POST", "/riotclient/ux-minimize").catch(() => {});
  setTimeout(minimize, 1500);
  setTimeout(minimize, 5000);
  if (!wait) return;
  for (let i = 0; i < 40 && !(await uxRunning()); i++) await sleep(500);
  await sleep(4000); // laisse le client finir de charger sa fenêtre
  minimize();
}

export function useClient() {
  const [state, setState] = useState<ClientState>(initial);
  const [error, setError] = useState<string | null>(null);
  const prevPhase = useRef<GameflowPhase>("None");
  const lastProfile = useRef(0);
  const lastStatusCheck = useRef(0);
  const dismissedGame = useRef(0);
  const lastRanked = useRef(0);

  const patch = useCallback((p: Partial<ClientState>) => setState((s) => ({ ...s, ...p })), []);

  const loadProfile = useCallback(async () => {
    const [summoner, ranked, friends, wallet, mastery, friendGroups, queues] = await Promise.all([
      soft(lcu<Summoner>("GET", "/lol-summoner/v1/current-summoner")),
      soft(lcu<RankedStats>("GET", "/lol-ranked/v1/current-ranked-stats")),
      soft(lcu<Friend[]>("GET", "/lol-chat/v1/friends")),
      soft(lcu<Wallet>("GET", WALLET)),
      soft(lcu<Mastery[]>("GET", "/lol-champion-mastery/v1/local-player/champion-mastery")),
      soft(lcu<FriendGroup[]>("GET", "/lol-chat/v1/friend-groups")),
      soft(lcu<GameQueue[]>("GET", "/lol-game-queues/v1/queues")),
    ]);
    if (queues) setQueueNames(queues);
    // Ce que ton compte peut vraiment lancer (niveau, sanctions, mode fermé…), comme l'écran Jouer du client.
    const elig = queues ? await soft(lcu<{ queueId: number; eligible: boolean; restrictions?: { restrictionCode?: string }[] }[]>("POST", "/lol-lobby/v2/eligibility/self", {})) : null;
    const ok = Array.isArray(elig) && elig.length ? new Map(elig.map((e) => [e.queueId, e.eligible])) : null;
    const playable = (queues ?? []).filter(
      (q) =>
        q.queueAvailability === "Available" &&
        q.isVisible !== false &&
        !q.isCustom &&
        !/TUTORIAL|PRACTICETOOL/.test(q.gameMode ?? "") &&
        !/CLASH|TUTORIAL/i.test(q.type ?? "") &&
        (!ok || ok.get(q.id) !== false),
    );
    if (queues && Date.now() - lastQueueSnap > 6 * 3600_000) {
      lastQueueSnap = Date.now();
      snapshot("queues", [], {
        eligibility: elig,
        queues: queues.map((q) => [q.id, q.name, q.gameMode, q.mapId, q.category, q.queueAvailability, q.type, q.isVisible, q.gameSelectModeGroup, q.gameSelectCategory, playable.includes(q)]),
      });
    }
    // Courbe de LP et archive des parties classées (fichiers sur ce PC).
    recordLp(ranked).catch(() => {});
    if (summoner) syncArchive(summoner.puuid).catch(() => {});
    boot("profile");
    patch({
      summoner,
      ranked,
      wallet,
      friends: friends ?? [],
      friendGroups: friendGroups ?? [],
      ...(queues ? { queues: playable } : {}),
      ...(mastery ? { mastery: new Map(mastery.map((m) => [m.championId, m])) } : {}),
    });
  }, [patch]);

  const historyRetry = useRef<{ n: number; t?: ReturnType<typeof setTimeout> }>({ n: 0 });
  const loadHistory = useCallback(async (manual = false) => {
    const retry = historyRetry.current;
    if (retry.t) clearTimeout(retry.t);
    retry.t = undefined;
    if (manual) retry.n = 0;
    const res = await soft(
      lcu<MatchHistory>("GET", "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19"),
    );
    const games = res?.games?.games ?? [];
    if (games.length) patch({ history: [...games].sort((a, b) => b.gameCreation - a.gameCreation), historyLoaded: true });
    else patch({ historyLoaded: true });
    boot("history");
    // Juste après la connexion, le client n'a souvent pas fini de charger l'historique (il renvoie une liste vide) :
    // on réessaie tout seul quelques fois avant d'abandonner.
    if (!games.length && retry.n < 5) {
      const wait = [4, 10, 20, 40, 90][retry.n++] * 1000;
      retry.t = setTimeout(() => loadHistory(), wait);
    } else if (games.length) retry.n = 0;
  }, [patch]);

  const loadChampions = useCallback(async () => {
    const [list, skins] = await Promise.all([
      soft(lcu<ChampionSummary[]>("GET", "/lol-game-data/assets/v1/champion-summary.json")),
      soft(lcu<Record<string, { id: number }>>("GET", "/lol-game-data/assets/v1/skins.json")),
    ]);
    if (skins) setSkinPool(Object.values(skins).map((s) => s.id));
    if (list) patch({ champions: new Map(list.filter((c) => c.id > 0).map((c) => [c.id, c])) });
    boot("champions");
  }, [patch]);

  useEffect(() => {
    let alive = true;
    let connected = false;

    const step = async () => {
      if (!connected) {
        // Chercher le client coûte un peu (lecture de fichiers, PowerShell) : pas plus d'une fois toutes les 4 s.
        if (Date.now() - lastStatusCheck.current < 4000) return;
        lastStatusCheck.current = Date.now();
        const status = await lcuStatus().catch(() => ({ connected: false }));
        if (!alive) return;
        if (!status.connected) return patch({ connection: "disconnected" });
      }

      const phase = await lcu<GameflowPhase>("GET", "/lol-gameflow/v1/gameflow-phase").catch(() => null);
      if (!alive) return;
      if (phase === null) {
        connected = false;
        return patch({ connection: "disconnected" });
      }
      if (!connected) {
        connected = true;
        boot("connected");
        patch({ connection: "connected" });
        lastProfile.current = 0;
        loadChampions();
        loadHistory();
      }

      const searching = phase === "Matchmaking" || phase === "ReadyCheck";
      const idle = phase === "None" || phase === "Lobby";
      const ended = phase === "EndOfGame" || phase === "PreEndOfGame";
      const [lobby, search, invitations, endOfGame] = await Promise.all([
        idle || searching ? soft(lcu<Lobby>("GET", "/lol-lobby/v2/lobby")) : Promise.resolve(null),
        searching || phase === "Lobby" ? soft(lcu<SearchState>("GET", "/lol-matchmaking/v1/search")) : Promise.resolve(null),
        idle ? soft(lcu<Invitation[]>("GET", "/lol-lobby/v2/received-invitations")) : Promise.resolve([]),
        ended ? soft(lcu<EndOfGame>("GET", "/lol-end-of-game/v1/eog-stats-block")) : Promise.resolve(null),
      ]);
      if (!alive) return;
      setState((s) => ({
        ...s,
        phase,
        lobby,
        search,
        invitations: (invitations ?? []).filter((i) => i.state === "Pending"),
        // Le tableau de fin de partie reste affiché jusqu'à ce que le joueur le ferme ou relance une partie.
        endOfGame:
          endOfGame && endOfGame.gameId !== dismissedGame.current
            ? endOfGame
            : searching || phase === "ChampSelect" || phase === "InProgress"
              ? null
              : s.endOfGame,
      }));

      // Début de sélection : on note les LP de chaque file classée.
      if (phase === "ChampSelect" && prevPhase.current !== "ChampSelect") {
        soft(lcu<RankedStats>("GET", "/lol-ranked/v1/current-ranked-stats")).then((rankBefore) => {
          if (!rankBefore) return;
          patch({ rankBefore });
          try {
            localStorage.setItem("nexus.rankBefore", JSON.stringify(rankBefore));
          } catch {
            /* stockage indisponible */
          }
        });
      }
      // Les LP mettent quelques secondes à arriver après la partie : on relit les rangs plus souvent.
      if (ended && Date.now() - lastRanked.current > 5000) {
        lastRanked.current = Date.now();
        soft(lcu<RankedStats>("GET", "/lol-ranked/v1/current-ranked-stats")).then((ranked) => ranked && patch({ ranked }));
      }

      // Fin de partie : l'historique, les rangs et les maîtrises ont changé.
      if (phase !== prevPhase.current && ended) {
        loadHistory();
        lastProfile.current = 0;
      }
      // Captures pour le badge de rôle (garanti, autofill, protection) : salon, file, puis draft.
      if (phase !== prevPhase.current && (phase === "Lobby" || phase === "Matchmaking" || phase === "ReadyCheck" || phase === "ChampSelect")) {
        snapshot(phase.toLowerCase());
        if (phase === "ChampSelect") setTimeout(() => snapshot("champselect-15s"), 15000);
        if (phase === "Lobby") setTimeout(() => snapshot("lobby-20s"), 20000);
      }
      // Recherche ou draft lancée par quelqu'un d'autre (chef du groupe) : on rouvre le client tout de suite.
      if (phase !== prevPhase.current && (phase === "Matchmaking" || phase === "ReadyCheck" || phase === "ChampSelect")) ensureUx(false);
      // Le client rouvre sa fenêtre (après une partie, une file annulée…) : on la referme si l'option est active.
      autoHide(phase);
      // Sélection terminée sans partie (esquive, erreur au lancement) : on garde une trace pour comprendre.
      if (prevPhase.current === "ChampSelect" && (phase === "Lobby" || phase === "None" || phase === "Matchmaking"))
        snapshot("cs-ended-without-game", ["/lol-gameflow/v1/session", "/lol-gameflow/v1/availability", "/lol-matchmaking/v1/search", "/lol-lobby-team-builder/v1/matchmaking", "/riotclient/ux-state"]);
      prevPhase.current = phase;

      if (Date.now() - lastProfile.current > 15000) {
        lastProfile.current = Date.now();
        loadProfile();
      }
    };

    let timer: number;
    const loop = async () => {
      await step().catch(() => {});
      if (alive) timer = window.setTimeout(loop, 1000);
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [patch, loadProfile, loadHistory, loadChampions]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  /** Le chemin exact varie selon les versions du client : on essaie les variantes connues, et en cas d'échec on enregistre la liste des commandes du client (/help). */
  const customMove = (target: "spectator" | "100" | "200", switching: boolean) =>
    run(async () => {
      const names = target === "spectator" ? ["spectator", "SPECTATOR", "spectators"] : [`team${target}`, target, target === "100" ? "TEAM1" : "TEAM2", target === "100" ? "ORDER" : "CHAOS"];
      const tries: [string, string, unknown?][] = [
        ...(switching ? ([["POST", "/lol-lobby/v1/lobby/custom/switch-teams"]] as [string, string][]) : []),
        ...names.map((n) => ["POST", `/lol-lobby/v2/lobby/team/${n}`] as [string, string]),
        ["POST", `/lol-lobby/v1/lobby/custom/switch-teams?team=${names[0]}`],
        ["POST", "/lol-lobby/v1/lobby/custom/switch-teams", { team: names[0] }],
        ["PUT", "/lol-lobby/v2/lobby/members/localMember/team", { team: names[0] }],
      ];
      const log: { path: string; error?: string }[] = [];
      for (const [method, path, body] of tries) {
        try {
          await lcu(method as "POST", path, body);
          log.push({ path });
          snapshot("custom-move-ok", [], { target, log });
          return;
        } catch (e) {
          log.push({ path: `${method} ${path}`, error: String((e as Error)?.message ?? e) });
        }
      }
      // Liste des commandes du client liées aux équipes, pour trouver la bonne la prochaine fois.
      const help: Record<string, unknown> = {};
      try {
        const all = await lcu<{ functions?: Record<string, string> } | Record<string, unknown>>("GET", "/help");
        const fns = Object.keys((all as { functions?: Record<string, string> }).functions ?? all).filter((n) => /lobby/i.test(n) && /(team|spectat|switch|side)/i.test(n));
        for (const n of fns.slice(0, 12)) help[n] = await lcu("GET", `/help?target=${encodeURIComponent(n)}&format=Full`).catch((e) => String(e));
      } catch (e) {
        help.error = String((e as Error)?.message ?? e);
      }
      snapshot("custom-move-failed", ["/lol-lobby/v2/lobby"], { target, log, help });
      throw new Error(target === "spectator" ? "Le client a refusé le passage en spectateur. C'est enregistré, je corrige ça dès que tu me le dis." : "Le client a refusé le changement de côté. C'est enregistré, je corrige ça dès que tu me le dis.");
    });

  const actions = {
    /** Crée (ou remplace) le groupe pour la file choisie, puis lance la recherche. */
    findMatch: (queueId: number) =>
      run(async () => {
        if (state.lobby?.gameConfig.queueId !== queueId) await lcu("POST", "/lol-lobby/v2/lobby", { queueId });
        patch({ preparing: true });
        await ensureUx(true).finally(() => patch({ preparing: false }));
        await lcu("POST", "/lol-lobby/v2/lobby/matchmaking/search");
        patch({ phase: "Matchmaking" });
      }),
    /** Crée le groupe sans lancer la recherche (pour inviter ou choisir ses rôles). */
    openLobby: (queueId: number) => run(() => lcu("POST", "/lol-lobby/v2/lobby", { queueId })),
    leaveLobby: () => run(() => lcu("DELETE", "/lol-lobby/v2/lobby")),
    /** Crée une partie personnalisée (ou l'outil d'entraînement). */
    createCustom: (c: { name: string; password: string; gameMode: string; mapId: number; teamSize: number; mutator: number }) =>
      run(async () => {
        const practice = c.gameMode === "PRACTICETOOL";
        const body = {
          isCustom: true,
          customGameLobby: {
            lobbyName: c.name,
            lobbyPassword: c.password,
            configuration: { gameMode: c.gameMode, mapId: c.mapId, teamSize: c.teamSize, mutators: { id: c.mutator }, spectatorPolicy: "AllAllowed", gameServerRegion: "", gameMutator: "" },
          },
        };
        if (!practice) return void (await lcu("POST", "/lol-lobby/v2/lobby", body));
        // L'entraînement (file 3140 « multijoueur ») : plusieurs formes selon les versions du client.
        const tries: unknown[] = [
          body,
          { isCustom: true, queueId: 3140, customGameLobby: body.customGameLobby },
          { ...body, customGameLobby: { ...body.customGameLobby, configuration: { ...body.customGameLobby.configuration, teamSize: 1 } } },
          { queueId: 3140 },
        ];
        const errors: string[] = [];
        for (const t of tries) {
          try {
            await lcu("POST", "/lol-lobby/v2/lobby", t);
            if (errors.length) snapshot("practice-ok", [], { errors, used: t });
            return;
          } catch (e) {
            errors.push(String((e as Error)?.message ?? e));
          }
        }
        snapshot("practice-failed", [], { errors });
        throw new Error(errors[0]);
      }),
    joinCustom: (id: number, password?: string) => run(() => lcu("POST", `/lol-lobby/v1/custom-games/${id}/join`, password ? { password } : {})),
    startCustom: () =>
      run(async () => {
        patch({ preparing: true });
        await ensureUx(true).finally(() => patch({ preparing: false }));
        await lcu("POST", "/lol-lobby/v1/lobby/custom/start-champ-select");
      }),
    /** Partie perso : passer de l'autre côté (bleu ↔ rouge). */
    customSwitchSide: () => {
      const lobby = state.lobby;
      const me = lobby?.localMember?.summonerId;
      const inBlue = !!lobby?.gameConfig.customTeam100?.some((m) => m.summonerId === me);
      return customMove(inBlue ? "200" : "100", true);
    },
    /** Partie perso : aller en spectateur ou revenir dans une équipe. */
    customMoveTo: (target: "spectator" | "100" | "200") => customMove(target, false),
    /** Chef du salon : exclure un joueur. */
    kick: (summonerId: number) => run(() => lcu("POST", `/lol-lobby/v2/lobby/members/${summonerId}/kick`)),
    setPositions: (firstPreference: string, secondPreference: string) =>
      run(() => lcu("PUT", "/lol-lobby/v2/lobby/members/localMember/position-preferences", { firstPreference, secondPreference })),
    refreshProfile: () => {
      loadProfile();
    },
    /** Bouton « Actualiser » : relit le profil, l'historique et les champions. */
    refresh: async () => {
      lastProfile.current = Date.now();
      window.dispatchEvent(new Event("nixus:refresh"));
      await Promise.all([loadProfile(), loadHistory(true), loadChampions()]);
    },
    /** Relit la liste d'amis et les groupes (après un ajout, un déplacement…). */
    refreshFriends: async () => {
      const [friends, friendGroups] = await Promise.all([soft(lcu<Friend[]>("GET", "/lol-chat/v1/friends")), soft(lcu<FriendGroup[]>("GET", "/lol-chat/v1/friend-groups"))]);
      patch({ ...(friends ? { friends } : {}), ...(friendGroups ? { friendGroups } : {}) });
    },
    invite: (summonerId: number) => run(() => lcu("POST", "/lol-lobby/v2/lobby/invitations", [{ toSummonerId: summonerId }])),
    answerInvitation: (id: string, accept: boolean) =>
      run(() => lcu("POST", `/lol-lobby/v2/received-invitations/${id}/${accept ? "accept" : "decline"}`)),
    cancelSearch: () =>
      run(async () => {
        await lcu("DELETE", "/lol-lobby/v2/lobby/matchmaking/search");
        patch({ phase: "Lobby", search: null });
      }),
    accept: () => run(() => lcu("POST", "/lol-matchmaking/v1/ready-check/accept")),
    decline: () => run(() => lcu("POST", "/lol-matchmaking/v1/ready-check/decline")),
    reconnect: () => run(() => lcu("POST", "/lol-gameflow/v1/reconnect")),
    playAgain: () =>
      run(async () => {
        if (state.endOfGame) dismissedGame.current = state.endOfGame.gameId;
        patch({ endOfGame: null });
        await lcu("POST", "/lol-lobby/v2/play-again");
      }),
    closeEndOfGame: () => {
      if (state.endOfGame) dismissedGame.current = state.endOfGame.gameId;
      patch({ endOfGame: null });
    },
  };

  return { state, actions, error, clearError: () => setError(null), demo: !isDesktop };
}
