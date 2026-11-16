// Faux client Riot pour tester l'interface dans un navigateur (npm run dev).
// Simule tout le parcours : groupe, invitation reçue, file, partie trouvée,
// sélection (intention, bans, picks, finalisation avec échange), partie, fin de partie.

import { DEMO_PUUID, mockGameDetail } from "./mockGame";
import type { ChampSelectAction, ChampSelectSession, GameflowPhase, LobbyMember } from "./types";

const CHAMPIONS: [number, string][] = [
  [64, "Lee Sin"], [517, "Sylas"], [254, "Vi"], [141, "Kayn"], [5, "Xin Zhao"], [427, "Ivern"],
  [60, "Elise"], [104, "Graves"], [86, "Garen"], [111, "Nautilus"], [222, "Jinx"], [103, "Ahri"],
  [157, "Yasuo"], [99, "Lux"], [412, "Thresh"], [81, "Ezreal"], [122, "Darius"], [238, "Zed"],
  [145, "Kai'Sa"], [234, "Viego"], [121, "Kha'Zix"], [76, "Nidalee"], [11, "Maître Yi"], [59, "Jarvan IV"],
  [24, "Jax"], [266, "Aatrox"], [51, "Caitlyn"], [119, "Draven"], [89, "Leona"],
  [555, "Pyke"], [350, "Yuumi"], [893, "Aurora"], [799, "Ambessa"], [84, "Akali"], [7, "LeBlanc"],
];

type CsStage = "planning" | "ban" | "pick" | "final";

const state = {
  phase: "None" as GameflowPhase,
  queueId: 420,
  inLobby: false,
  positions: ["JUNGLE", "MIDDLE"] as [string, string],
  invited: [] as number[],
  invitationShown: false,
  icon: 6301,
  searchStart: 0,
  readyStart: 0,
  readyResponse: "None",
  stage: "planning" as CsStage,
  stageStart: 0,
  session: null as ChampSelectSession | null,
  gameStart: 0,
  pendingTrade: true,
  bootedAt: Date.now(),
  custom: null as { name: string; gameMode: string } | null,
  customSide: "100" as "100" | "200" | "spectator",
  lp: 64,
};

const QUEUE_LIST = [
  {"id": 420, "name": "Ranked Solo/Duo", "description": "Ranked Solo/Duo", "gameMode": "CLASSIC", "mapId": 11, "category": "PvP", "queueAvailability": "Available", "isRanked": true, "isVisible": true, "gameSelectModeGroup": "kSummonersRift", "gameSelectCategory": "kPvP"},
  {"id": 440, "name": "Ranked Flex", "description": "Ranked Flex", "gameMode": "CLASSIC", "mapId": 11, "category": "PvP", "queueAvailability": "Available", "isRanked": true, "isVisible": true, "gameSelectModeGroup": "kSummonersRift", "gameSelectCategory": "kPvP"},
  {"id": 400, "name": "Normal", "description": "Normal", "gameMode": "CLASSIC", "mapId": 11, "category": "PvP", "queueAvailability": "Available", "isRanked": false, "isVisible": true, "gameSelectModeGroup": "kSummonersRift", "gameSelectCategory": "kPvP"},
  {"id": 480, "name": "Swiftplay", "description": "Swiftplay", "gameMode": "SWIFTPLAY", "mapId": 11, "category": "PvP", "queueAvailability": "Available", "isRanked": false, "isVisible": true, "gameSelectModeGroup": "kSummonersRift", "gameSelectCategory": "kPvP"},
  {"id": 4310, "name": "", "description": "", "gameMode": "JADE", "mapId": 453, "category": "PvP", "queueAvailability": "Available", "isRanked": true, "isVisible": true, "gameSelectModeGroup": "kJade", "gameSelectCategory": "kPvP"},
  {"id": 4320, "name": "Jade", "description": "Jade", "gameMode": "JADE", "mapId": 453, "category": "VersusAi", "queueAvailability": "Available", "isRanked": false, "isVisible": true, "gameSelectModeGroup": "kJade", "gameSelectCategory": "kVersusAI"},
  {"id": 450, "name": "ARAM", "description": "ARAM", "gameMode": "ARAM", "mapId": 12, "category": "PvP", "queueAvailability": "Available", "isRanked": false, "isVisible": true, "gameSelectModeGroup": "kARAM", "gameSelectCategory": "kPvP"},
  {"id": 2400, "name": "ARAM: Mayhem", "description": "ARAM: Mayhem", "gameMode": "KIWI", "mapId": 12, "category": "PvP", "queueAvailability": "Available", "isRanked": false, "isVisible": true, "gameSelectModeGroup": "kARAM", "gameSelectCategory": "kPvP"},
  {"id": 1750, "name": "Arena 3x6", "description": "Arena 3x6", "gameMode": "CHERRY", "mapId": 30, "category": "PvP", "queueAvailability": "Available", "isRanked": false, "isVisible": true, "gameSelectModeGroup": "kAlternativeLeagueGameModes", "gameSelectCategory": "kPvP"},
  {"id": 870, "name": "Intro", "description": "Intro", "gameMode": "SWIFTPLAY", "mapId": 11, "category": "VersusAi", "queueAvailability": "Available", "isRanked": false, "isVisible": true, "gameSelectModeGroup": "kSummonersRift", "gameSelectCategory": "kVersusAI"},
  {"id": 880, "name": "Beginner", "description": "Beginner", "gameMode": "SWIFTPLAY", "mapId": 11, "category": "VersusAi", "queueAvailability": "Available", "isRanked": false, "isVisible": true, "gameSelectModeGroup": "kSummonersRift", "gameSelectCategory": "kVersusAI"},
  {"id": 890, "name": "Intermediate", "description": "Intermediate", "gameMode": "SWIFTPLAY", "mapId": 11, "category": "VersusAi", "queueAvailability": "Available", "isRanked": false, "isVisible": true, "gameSelectModeGroup": "kSummonersRift", "gameSelectCategory": "kVersusAI"},
  {"id": 6110, "name": "Set 17 (Normal)", "description": "Set 17 (Normal)", "gameMode": "TFT", "mapId": 22, "category": "PvP", "queueAvailability": "Available", "isRanked": false, "isVisible": true, "gameSelectModeGroup": "kTeamfightTactics", "gameSelectCategory": "kPvP"},
  {"id": 3140, "name": "Multiplayer Practice Tool Custom", "description": "Multiplayer Practice Tool Custom", "gameMode": "PRACTICETOOL", "mapId": 11, "category": "PvP", "queueAvailability": "Available", "isRanked": false, "isVisible": true, "gameSelectModeGroup": "kAlternativeLeagueGameModes", "gameSelectCategory": "kTraining"}
];

const now = () => Date.now();
const H = 3600_000;
const STAGE_MS: Record<CsStage, number> = { planning: 8000, ban: 30000, pick: 30000, final: 20000 };

const me = () => state.session!.myTeam.find((p) => p.cellId === state.session!.localPlayerCellId)!;
const allActions = () => state.session!.actions.flat();

function setStage(stage: CsStage) {
  state.stage = stage;
  state.stageStart = now();
  const s = state.session!;
  s.timer.phase = stage === "planning" ? "PLANNING" : stage === "final" ? "FINALIZATION" : "BAN_PICK";
  s.timer.totalTimeInPhase = STAGE_MS[stage];
  const acts = allActions();
  if (stage === "ban") {
    acts.filter((a) => a.type === "ban").forEach((a) => (a.isInProgress = true));
    // Intentions de ban des alliés, visibles pendant la phase.
    const hovers: Record<number, number> = { 0: 157, 2: 238, 3: 555, 4: 104 };
    acts.filter((a) => a.type === "ban" && a.actorCellId in hovers).forEach((a) => (a.championId = hovers[a.actorCellId]));
  }
  if (stage === "pick") {
    // Les bans non faits sont validés, ceux de l'équipe adverse révélés.
    acts.filter((a) => a.type === "ban").forEach((a) => {
      a.isInProgress = false;
      a.completed = true;
    });
    const enemy = [99, 222, 145, 893, 7];
    acts.filter((a) => a.type === "ban" && a.actorCellId >= 5).forEach((a, i) => (a.championId = enemy[i]));
    s.bans.myTeamBans = acts.filter((a) => a.type === "ban" && a.actorCellId < 5).map((a) => a.championId);
    s.bans.theirTeamBans = enemy;
    s.myTeam[0].championId = 86;
    s.theirTeam[0].championId = 122;
    s.theirTeam[1].championId = 121;
    const mine = acts.find((a) => a.type === "pick" && a.actorCellId === s.localPlayerCellId)!;
    mine.isInProgress = true;
  }
  if (stage === "final") {
    s.myTeam.forEach((p, i) => (p.championId ||= [86, 0, 103, 81, 111][i]));
    s.myTeam[3].championId = 81;
    s.theirTeam.forEach((p, i) => (p.championId ||= [122, 121, 238, 222, 412][i]));
    if (state.pendingTrade) s.trades = [{ id: 1, cellId: 2, state: "RECEIVED" }];
  }
}

function tick() {
  if (state.phase === "Matchmaking" && now() - state.searchStart > 6000) {
    state.phase = "ReadyCheck";
    state.readyStart = now();
    state.readyResponse = "None";
  }
  if (state.phase === "ReadyCheck") {
    if (state.readyResponse === "Accepted" && now() - state.readyStart > 0) startChampSelect();
    else if (now() - state.readyStart > 12000) state.phase = "Lobby";
  }
  if (state.phase === "ChampSelect" && state.session) {
    const left = STAGE_MS[state.stage] - (now() - state.stageStart);
    state.session.timer.adjustedTimeLeftInPhase = Math.max(left, 0);
    if (left <= 0) {
      if (state.stage === "planning") setStage("ban");
      else if (state.stage === "ban") setStage("pick");
      else if (state.stage === "pick") setStage("final");
      else startGame();
    }
  }
  if (state.phase === "InProgress" && now() - state.gameStart > 40000) finishGame();
}

const reported: string[] = [];
// Démo : ?eog ouvre directement l'écran de fin de partie.
if (typeof location !== "undefined" && location.search.includes("eog")) setTimeout(() => finishGame(), 0);

/** Fin de partie de démo : la partie entre dans l'historique et les LP bougent. */
function finishGame() {
  state.phase = "EndOfGame";
  const championId = state.session ? me().championId || 64 : 64;
  if (!games.some((g) => g.gameId === 9001))
    games.unshift({ gameId: 9001, gameCreation: now() - 1834 * 1000, gameDuration: 1834, queueId: 420, participants: [{ championId, stats: { kills: 9, deaths: 3, assists: 12, win: true } as never }] });
  state.lp += 19;
}

function startGame() {
  state.phase = "InProgress";
  state.gameStart = now();
}

const modeOf = (queueId: number) => QUEUE_LIST.find((q) => q.id === queueId)?.gameMode ?? "CLASSIC";

/** ARAM de démo : champion tiré au sort, relances, banc partagé, adversaires cachés, pas de bans. */
function startAram() {
  state.phase = "ChampSelect";
  state.pendingTrade = false;
  state.session = {
    localPlayerCellId: 1,
    myTeam: [
      { cellId: 0, championId: 86, championPickIntent: 0, assignedPosition: "", gameName: "Orrin", spell1Id: 4, spell2Id: 32 },
      { cellId: 1, championId: 103, championPickIntent: 0, assignedPosition: "", gameName: "Nika", spell1Id: 4, spell2Id: 32 },
      { cellId: 2, championId: 238, championPickIntent: 0, assignedPosition: "", gameName: "Thalys", spell1Id: 4, spell2Id: 14 },
      { cellId: 3, championId: 222, championPickIntent: 0, assignedPosition: "", gameName: "Mirela", spell1Id: 4, spell2Id: 7 },
      { cellId: 4, championId: 412, championPickIntent: 0, assignedPosition: "", gameName: "Kaelith", spell1Id: 4, spell2Id: 3 },
    ],
    theirTeam: [5, 6, 7, 8, 9].map((c) => ({ cellId: c, championId: 0, championPickIntent: 0, assignedPosition: "" })),
    actions: [],
    bans: { myTeamBans: [], theirTeamBans: [] },
    timer: { phase: "BAN_PICK", adjustedTimeLeftInPhase: STAGE_MS.final },
    trades: [{ id: 2, cellId: 2, state: "AVAILABLE" }],
    benchEnabled: true,
    benchChampions: [64, 157, 99, 145, 7].map((championId) => ({ championId })),
    rerollsRemaining: 2,
  };
  state.stage = "final";
  state.stageStart = now();
  state.session!.timer.totalTimeInPhase = STAGE_MS.final;
}

function startChampSelect() {
  if (modeOf(state.queueId) === "ARAM" || state.custom?.gameMode === "ARAM") return startAram();
  state.phase = "ChampSelect";
  state.pendingTrade = true;
  const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  let id = 1;
  const bans: ChampSelectAction[] = cells.map((c) => ({ id: id++, actorCellId: c, championId: 0, type: "ban", completed: false, isInProgress: false }));
  const picks: ChampSelectAction[][] = [[0], [5, 6], [1, 2], [7, 8], [3, 4], [9]].map((group) =>
    group.map((c) => ({ id: id++, actorCellId: c, championId: 0, type: "pick", completed: false, isInProgress: false })),
  );
  state.session = {
    localPlayerCellId: 1,
    myTeam: [
      { cellId: 0, championId: 0, championPickIntent: 86, assignedPosition: "top", gameName: "Orrin", spell1Id: 4, spell2Id: 12 },
      { cellId: 1, championId: 0, championPickIntent: 0, assignedPosition: "jungle", gameName: "Nika", spell1Id: 4, spell2Id: 11 },
      { cellId: 2, championId: 0, championPickIntent: 103, assignedPosition: "middle", gameName: "Thalys", spell1Id: 4, spell2Id: 14 },
      { cellId: 3, championId: 0, championPickIntent: 0, assignedPosition: "bottom", obfuscatedSummonerId: 101, spell1Id: 4, spell2Id: 7 },
      { cellId: 4, championId: 0, championPickIntent: 111, assignedPosition: "utility", gameName: "Kaelith", spell1Id: 4, spell2Id: 14 },
    ],
    theirTeam: [5, 6, 7, 8, 9].map((c) => ({ cellId: c, championId: 0, championPickIntent: 0, assignedPosition: "" })),
    actions: [bans, ...picks],
    bans: { myTeamBans: [], theirTeamBans: [] },
    timer: { phase: "PLANNING", adjustedTimeLeftInPhase: STAGE_MS.planning },
    trades: [],
    benchEnabled: false,
    benchChampions: [],
  };
  setStage("planning");
}

const lobbyMembers = (): LobbyMember[] => {
  const local: LobbyMember = {
    summonerId: 1, gameName: "Nika", summonerIconId: 6301, isLeader: true,
    firstPositionPreference: state.positions[0], secondPositionPreference: state.positions[1],
    autoFillProtectedForStreaking: true,
  };
  const others: LobbyMember[] = state.invited.includes(101)
    ? [{ summonerId: 101, gameName: "Kaelith", summonerIconId: 4568, isLeader: false, firstPositionPreference: "UTILITY", secondPositionPreference: "BOTTOM" }]
    : [];
  return [local, ...others];
};

const games = [
  [64, 9, 2, 11, true, 0.4], [517, 7, 4, 8, true, 1.1], [254, 3, 6, 5, false, 2.2],
  [64, 6, 3, 14, true, 3.1], [141, 11, 5, 6, true, 4.0], [5, 4, 7, 9, false, 26],
  [64, 8, 1, 7, true, 28], [517, 5, 5, 12, false, 30],
].map(([championId, kills, deaths, assists, win, hoursAgo], i) => ({
  gameId: 7000 + i,
  gameCreation: now() - (hoursAgo as number) * H,
  gameDuration: 1700 + i * 90,
  queueId: [420, 450, 420, 1700, 400, 420, 450, 440][i],
  participants: [{ championId: championId as number, stats: { kills, deaths, assists, win } as never }],
}));

// Classes des champions (champion-summary.json les donne dans "roles").
const CLASSES: Record<number, string[]> = {
  64: ["fighter", "assassin"], 517: ["mage", "assassin"], 254: ["fighter", "assassin"], 141: ["fighter", "assassin"], 5: ["fighter", "assassin"],
  427: ["support", "mage"], 60: ["mage", "assassin"], 104: ["marksman"], 86: ["fighter", "tank"], 111: ["tank", "support"], 222: ["marksman"],
  103: ["mage", "assassin"], 157: ["fighter", "assassin"], 99: ["mage", "support"], 412: ["support", "tank"], 81: ["marksman", "mage"],
  122: ["fighter", "tank"], 238: ["assassin"], 145: ["marksman"], 234: ["assassin", "fighter"], 121: ["assassin"], 76: ["assassin", "mage"],
  11: ["assassin", "fighter"], 59: ["tank", "fighter"], 555: ["support", "assassin"], 350: ["support", "mage"], 893: ["mage", "assassin"],
  799: ["fighter"], 84: ["assassin"], 7: ["assassin", "mage"], 24: ["fighter"], 266: ["fighter", "tank"], 51: ["marksman"], 119: ["marksman"], 89: ["tank", "support"],
};
const SKIN_NAMES = ["Classique", "Chasseur de prime", "Arcade", "Gardien des étoiles", "Projet", "Prestige", "Lune de sang", "Soirée piscine"];
const skinsOf = (championId: number) =>
  SKIN_NAMES.slice(0, 5 + (championId % 4)).map((name, i) => ({ id: championId * 1000 + (i === 0 ? 0 : i * 3 - 1), name: i === 0 ? CHAMPIONS.find(([c]) => c === championId)?.[1] ?? name : `${CHAMPIONS.find(([c]) => c === championId)?.[1] ?? ""} ${name}`, isBase: i === 0, rarity: i === 0 ? "kNoRarity" : ["kEpic", "kLegendary", "kEpic", "kMythic", "kUltimate", "kNoRarity", "kEpic", "kLegendary"][(i + championId) % 8] }));
const runePages = [
  { id: 1, name: "Jungle · Conquérant", isActive: true, isEditable: true, primaryStyleId: 8000, subStyleId: 8100, selectedPerkIds: [8010, 9111, 9104, 8299, 8143, 8135] },
  { id: 2, name: "Jungle · Électrocution", isActive: false, isEditable: true, primaryStyleId: 8100, subStyleId: 8000, selectedPerkIds: [8112, 8143, 8138, 8135] },
  { id: 3, name: "Mid · Comète", isActive: false, isEditable: true, primaryStyleId: 8200, subStyleId: 8300, selectedPerkIds: [8229, 8226, 8210, 8237] },
];

const eogPlayer = (name: string, championId: number, k: number, d: number, a: number, cs: number, gold: number, dmg: number, local = false) => ({
  riotIdGameName: name,
  championId,
  puuid: local ? DEMO_PUUID : `p-${name}`,
  summonerId: name.length * 1000 + championId,
  isLocalPlayer: local,
  stats: { CHAMPIONS_KILLED: k, NUM_DEATHS: d, ASSISTS: a, MINIONS_KILLED: cs, NEUTRAL_MINIONS_KILLED: local ? 142 : 8, GOLD_EARNED: gold, TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: dmg, VISION_SCORE: local ? 38 : 21 },
});

const friendRequests: { puuid: string; gameName: string; gameTag: string; icon: number; direction: string }[] = [{ puuid: "req-1", gameName: "Soren", gameTag: "EUW", icon: 4022, direction: "in" }];
const loot = [
  { lootId: "CURRENCY_champion", count: 3450 },
  { lootId: "CURRENCY_cosmetic", count: 1260 },
  { lootId: "MATERIAL_key", count: 2, localizedName: "Clé Hextech", displayCategories: "CHEST" },
  { lootId: "MATERIAL_key_fragment", count: 1, localizedName: "Fragment de clé", displayCategories: "CHEST" },
  { lootId: "CHEST_generic", count: 3, localizedName: "Coffre Hextech", displayCategories: "CHEST" },
  { lootId: "CHAMPION_RENTAL_64", count: 1, type: "CHAMPION_RENTAL", localizedName: "Lee Sin", displayCategories: "CHAMPION", storeItemId: 64, disenchantValue: 1260, disenchantLootName: "CURRENCY_champion", upgradeEssenceValue: 1890, itemStatus: "OWNED" },
  { lootId: "CHAMPION_RENTAL_893", count: 2, type: "CHAMPION_RENTAL", localizedName: "Aurora", displayCategories: "CHAMPION", storeItemId: 893, disenchantValue: 1890, disenchantLootName: "CURRENCY_champion", upgradeEssenceValue: 3150, itemStatus: "NONE" },
  { lootId: "CHAMPION_SKIN_RENTAL_64005", count: 1, type: "SKIN_RENTAL", localizedName: "Lee Sin Projet", displayCategories: "SKIN", storeItemId: 64005, disenchantValue: 270, disenchantLootName: "CURRENCY_cosmetic", upgradeEssenceValue: 810 },
];
const chats: Record<string, { id: string; body: string; fromId: string; timestamp: string; type: string }[]> = {
  "f101@eu1.pvp.net": [
    { id: "1", body: "tu joues ce soir ?", fromId: "f101@eu1.pvp.net", timestamp: new Date(Date.now() - 600000).toISOString(), type: "chat" },
    { id: "2", body: "dans 10 min", fromId: "me@eu1.pvp.net", timestamp: new Date(Date.now() - 540000).toISOString(), type: "chat" },
    { id: "3", body: "go flex alors", fromId: "f101@eu1.pvp.net", timestamp: new Date(Date.now() - 60000).toISOString(), type: "chat" },
  ],
};
const unread: Record<string, number> = { "f101@eu1.pvp.net": 1 };

export function mockRequest(method: string, path: string, body?: unknown): unknown {
  tick();
  const m = method.toUpperCase();
  const b = (body ?? {}) as Record<string, unknown>;
  const [route] = path.split("?");

  if (route === "/lol-summoner/v1/current-summoner")
    return { puuid: DEMO_PUUID, summonerId: 1, gameName: "Nika", tagLine: "EUW", summonerLevel: 287, profileIconId: state.icon, percentCompleteForNextLevel: 72 };
  if (route === "/lol-ranked/v1/current-ranked-stats")
    return {
      queueMap: {
        RANKED_SOLO_5x5: { tier: "EMERALD", division: "II", leaguePoints: state.lp, wins: 123 + (state.lp - 64) / 19, losses: 89 },
        RANKED_FLEX_SR: { tier: "PLATINUM", division: "I", leaguePoints: 12, wins: 20, losses: 14 },
        CHERRY: { tier: "", division: "NA", leaguePoints: 0, wins: 9, losses: 6 },
      },
    };
  if (route === "/lol-inventory/v1/wallet") return { RP: 1380, lol_blue_essence: 3450 };
  if (route === "/lol-champion-mastery/v1/local-player/champion-mastery")
    return [
      [64, 52, 612340], [517, 31, 288120], [254, 18, 151800], [141, 12, 98200], [5, 9, 64110], [86, 6, 41800],
    ].map(([championId, championLevel, championPoints]) => ({ championId, championLevel, championPoints }));
  if (route === "/lol-gameflow/v1/gameflow-phase") return state.phase;
  if (route === "/lol-gameflow/v1/reconnect") return null;

  if (route === "/lol-lobby/v2/lobby") {
    if (m === "POST" && b.isCustom) {
      const c = b.customGameLobby as { lobbyName: string; configuration: { gameMode: string } };
      state.custom = { name: c.lobbyName, gameMode: c.configuration.gameMode };
      state.inLobby = true;
      state.phase = "Lobby";
    } else if (m === "POST") {
      state.custom = null;
      state.queueId = Number(b.queueId);
      state.inLobby = true;
      state.phase = "Lobby";
    }
    if (m === "DELETE") {
      state.inLobby = false;
      state.custom = null;
      state.invited = [];
      state.phase = "None";
      return null;
    }
    if (!state.inLobby) throw "404 Pas de groupe";
    const members = lobbyMembers();
    if (state.custom) {
      const practice = state.custom.gameMode === "PRACTICETOOL";
      return {
        gameConfig: (() => {
          const me = members[0];
          const p = (id: number, n: string, icon: number): LobbyMember => ({ summonerId: id, gameName: n, summonerIconId: icon, isLeader: false, firstPositionPreference: "", secondPositionPreference: "" });
          const blue = [...(state.customSide === "100" ? [me] : []), p(102, "Thalys", 4655)];
          const red = [...(state.customSide === "200" ? [me] : []), p(103, "Orrin", 3505), p(104, "Mirela", 588)];
          const specs = [...(state.customSide === "spectator" ? [me] : []), p(105, "Vexa", 29)];
          return { queueId: practice ? 3140 : 0, isCustom: true, gameMode: state.custom!.gameMode, customLobbyName: state.custom!.name, maxLobbySize: practice ? 1 : 10, maxTeamSize: 5, customSpectatorPolicy: "AllAllowed", customTeam100: practice ? [me] : blue, customTeam200: practice ? [] : red, customSpectators: practice ? [] : specs };
        })(),
        members: [],
        localMember: members[0],
        scarcePositions: ["TOP", "UTILITY"],
      };
    }
    return { gameConfig: { queueId: state.queueId, showPositionSelector: [420, 440, 400].includes(state.queueId), maxLobbySize: state.queueId === 1700 ? 2 : 5 }, members, localMember: members[0], scarcePositions: ["TOP", "UTILITY"] };
  }
  if (route === "/lol-lobby/v1/lobby/custom/switch-teams") {
    state.customSide = state.customSide === "100" ? "200" : "100";
    return null;
  }
  const team = route.match(/^\/lol-lobby\/v2\/lobby\/team\/(\w+)$/);
  if (team) {
    const t = team[1];
    state.customSide = t === "spectator" ? "spectator" : t === "team100" ? "100" : t === "team200" ? "200" : state.customSide;
    return null;
  }
  if (/^\/lol-lobby\/v2\/lobby\/members\/\d+\/kick$/.test(route)) return null;
  if (route === "/lol-lobby/v2/lobby/members/localMember/position-preferences") {
    state.positions = [String(b.firstPreference), String(b.secondPreference)];
    return null;
  }
  if (route === "/lol-lobby/v2/lobby/invitations") {
    (Array.isArray(body) ? body : []).forEach((i: { toSummonerId: number }) => state.invited.push(i.toSummonerId));
    return null;
  }
  if (route === "/lol-lobby/v2/play-again") {
    state.phase = "Lobby";
    state.inLobby = true;
    return null;
  }
  if (route === "/lol-lobby/v2/received-invitations") {
    // Une invitation de Mirela arrive 20 s après l'ouverture, une seule fois.
    if (!state.invitationShown && now() - state.bootedAt > 20000 && state.phase === "None")
      return [{ invitationId: "inv-1", fromSummonerName: "Mirela", fromSummonerId: 104, state: "Pending", gameConfig: { queueId: 450 } }];
    return [];
  }
  if (route.startsWith("/lol-lobby/v2/received-invitations/")) {
    state.invitationShown = true;
    if (route.endsWith("/accept")) {
      state.queueId = 450;
      state.inLobby = true;
      state.phase = "Lobby";
    }
    return null;
  }
  if (route === "/lol-lobby/v2/lobby/matchmaking/search") {
    if (m === "POST") {
      state.phase = "Matchmaking";
      state.searchStart = now();
    } else state.phase = "Lobby";
    return null;
  }
  if (route === "/lol-matchmaking/v1/search")
    return {
      searchState: "Searching",
      estimatedQueueTime: 102,
      timeInQueue: (now() - state.searchStart) / 1000,
      readyCheck: { state: state.phase === "ReadyCheck" ? "InProgress" : "Invalid", playerResponse: state.readyResponse, timer: (now() - state.readyStart) / 1000 },
      errors: [],
    };
  if (route === "/lol-matchmaking/v1/ready-check/accept") {
    state.readyResponse = "Accepted";
    state.readyStart = now() + 1500; // les autres joueurs acceptent 1,5 s plus tard
    return null;
  }
  if (route === "/lol-matchmaking/v1/ready-check/decline") {
    state.phase = "Lobby";
    return null;
  }

  if (route === "/lol-champ-select/v1/session") {
    if (!state.session || state.phase !== "ChampSelect") throw "404 Pas de sélection en cours";
    return structuredClone(state.session);
  }
  if (route.startsWith("/lol-champ-select/v1/session/actions/") && state.session) {
    const action = allActions().find((a) => route === `/lol-champ-select/v1/session/actions/${a.id}`);
    if (action && action.actorCellId === state.session.localPlayerCellId) {
      if (typeof b.championId === "number") {
        action.championId = b.championId;
        if (action.type === "pick") me().championPickIntent = b.championId;
      }
      if (b.completed && state.stage !== "planning") {
        action.completed = true;
        action.isInProgress = false;
        if (action.type === "pick") {
          me().championId = action.championId;
          setTimeout(() => state.phase === "ChampSelect" && state.stage === "pick" && setStage("final"), 1500);
        } else {
          setTimeout(() => state.phase === "ChampSelect" && state.stage === "ban" && setStage("pick"), 2500);
        }
      }
    }
    return null;
  }
  if (route.startsWith("/lol-champ-select/v1/session/trades/") && state.session) {
    state.pendingTrade = false;
    if (route.endsWith("/accept")) {
      const mine = me();
      const other = state.session.myTeam.find((p) => p.cellId === 2)!;
      [mine.championId, other.championId] = [other.championId, mine.championId];
    }
    state.session.trades = [];
    return null;
  }
  if (route === "/lol-champ-select/v1/session/my-selection/reroll" && state.session) {
    const s = state.session;
    if (!s.rerollsRemaining) throw "400 No rerolls remaining";
    s.rerollsRemaining--;
    const old = me().championId;
    me().championId = [5, 141, 517, 11, 59][s.rerollsRemaining % 5];
    s.benchChampions = [{ championId: old }, ...(s.benchChampions ?? [])].slice(0, 10);
    return null;
  }
  const swap = route.match(/^\/lol-champ-select\/v1\/session\/bench\/swap\/(\d+)$/);
  if (swap && state.session) {
    const id = Number(swap[1]);
    const old = me().championId;
    me().championId = id;
    state.session.benchChampions = (state.session.benchChampions ?? []).map((c) => (c.championId === id ? { championId: old } : c));
    return null;
  }
  if (route === "/lol-gameflow/v1/session") {
    const queueId = state.queueId;
    const mine = state.session ? me() : null;
    const allies = state.session?.myTeam ?? [];
    const pos = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
    return {
      phase: state.phase,
      gameData: {
        gameId: 9001,
        queue: { id: queueId, gameMode: state.custom?.gameMode ?? modeOf(queueId), mapId: QUEUE_LIST.find((q) => q.id === queueId)?.mapId ?? 11 },
        teamOne: allies.map((p, i) => ({ championId: p.championId, puuid: p.cellId === state.session!.localPlayerCellId ? DEMO_PUUID : `a${i}`, selectedPosition: pos[i] })),
        teamTwo: [122, 121, 238, 222, 412].map((championId, i) => ({ championId, puuid: `e${i}`, selectedPosition: pos[i] })),
        playerChampionSelections: mine ? [{ championId: mine.championId, puuid: DEMO_PUUID, selectedSkinIndex: (mine.selectedSkinId ?? 0) % 1000, spell1Id: mine.spell1Id, spell2Id: mine.spell2Id }] : [],
      },
    };
  }
  if (route === "/lol-champ-select/v1/session/my-selection") {
    if (state.session) Object.assign(me(), b);
    return null;
  }
  if (route === "/lol-champ-select/v1/pickable-champion-ids" || route === "/lol-champ-select/v1/bannable-champion-ids") {
    const banned = state.session ? allActions().filter((a) => a.type === "ban" && a.completed).map((a) => a.championId) : [];
    return CHAMPIONS.map(([id]) => id).filter((id) => !banned.includes(id));
  }
  if (route === "/lol-game-data/assets/v1/champion-summary.json")
    return CHAMPIONS.map(([id, name]) => ({ id, name, alias: name.replace(/\W/g, ""), roles: CLASSES[id] ?? ["fighter"] }));
  if (route === "/lol-game-data/assets/v1/skins.json")
    return Object.fromEntries(CHAMPIONS.flatMap(([id]) => skinsOf(id)).map((s) => [String(s.id), s]));
  if (route === "/lol-champ-select/v1/skin-carousel-skins") {
    const champ = state.session ? me().championId : 0;
    const pal = [["#e8433b", "#7a1410"], ["#3bb3e8", "#103a7a"], ["#f5c518", "#7a5a10"], ["#7be83b", "#1f7a10"], ["#c33be8", "#4b107a"], ["#e8e8e8", "#555555"]];
    return champ
      ? skinsOf(champ).map((s, i) => ({
          ...s,
          championId: champ,
          unlocked: i !== 2 && i !== 4,
          disabled: false,
          childSkins: i === 1 || i === 3 ? pal.map(([a, b], k) => ({ id: s.id * 10 + k + 1, name: `${s.name} (Chroma ${k + 1})`, unlocked: k % 2 === 0, colors: [a, b] })) : [],
        }))
      : [];
  }
  const champData = route.match(/^\/lol-game-data\/assets\/v1\/champions\/(\d+)\.json$/);
  if (champData) {
    const id = Number(champData[1]);
    return { id, name: CHAMPIONS.find(([c]) => c === id)?.[1] ?? "Champion", skins: skinsOf(id) };
  }
  if (route === "/lol-perks/v1/pages") return runePages;
  if (route === "/lol-perks/v1/currentpage") {
    if (m === "PUT") runePages.forEach((p) => (p.isActive = p.id === Number(body)));
    return runePages.find((p) => p.isActive) ?? runePages[0];
  }

  if (route === "/lol-player-report-sender/v1/reported-players") return reported.map((puuid) => ({ puuid }));
  if (route === "/lol-player-report-sender/v1/end-of-game-reports" && m === "POST") {
    reported.push((body as { offenderPuuid: string }).offenderPuuid);
    return null;
  }
  if (route === "/lol-player-report-sender/v1/reporter-feedback") return [];

  if (route === "/lol-end-of-game/v1/eog-stats-block") {
    if (state.phase !== "EndOfGame") throw "404 Pas de fin de partie";
    const myChamp = state.session ? me().championId || 64 : 64;
    return {
      gameId: 9001,
      gameLength: 1834,
      queueType: "RANKED_SOLO_5x5",
      localPlayer: eogPlayer("Nika", myChamp, 9, 3, 12, 38, 13240, 24310, true),
      teams: [
        {
          isPlayerTeam: true,
          isWinningTeam: true,
          players: [
            eogPlayer("Orrin", 86, 4, 5, 6, 212, 11820, 18200),
            eogPlayer("Nika", myChamp, 9, 3, 12, 38, 13240, 24310, true),
            eogPlayer("Thalys", 103, 7, 4, 9, 245, 12900, 27100),
            eogPlayer("Mirela", 81, 10, 2, 7, 268, 14100, 29800),
            eogPlayer("Kaelith", 111, 1, 6, 21, 34, 8300, 9100),
          ],
        },
        {
          isPlayerTeam: false,
          isWinningTeam: false,
          players: [
            eogPlayer("Ennemi 1", 122, 5, 7, 3, 190, 10400, 16500),
            eogPlayer("Ennemi 2", 121, 6, 6, 4, 41, 10900, 17200),
            eogPlayer("Ennemi 3", 238, 4, 8, 5, 201, 10100, 19800),
            eogPlayer("Ennemi 4", 222, 3, 6, 6, 230, 10800, 21000),
            eogPlayer("Ennemi 5", 412, 0, 4, 9, 30, 7200, 6800),
          ],
        },
      ],
    };
  }

  if (route === "/lol-chat/v1/friends")
    return [
      { id: "f101@eu1.pvp.net", summonerId: 101, groupName: "Duo jungle", puuid: "1", gameName: "Kaelith", availability: "chat", icon: 4568, lol: { gameStatus: "outOfGame" } },
      { id: "f102@eu1.pvp.net", summonerId: 102, puuid: "2", gameName: "Orrin", availability: "dnd", icon: 588, lol: { gameStatus: "inGame", gameQueueType: "ARAM", timeStamp: String(now() - 18 * 60000) } },
      { id: "f103@eu1.pvp.net", summonerId: 103, groupName: "Duo jungle", puuid: "3", gameName: "Thalys", availability: "dnd", icon: 3150, lol: { gameStatus: "championSelect" } },
      { id: "f104@eu1.pvp.net", summonerId: 104, groupName: "Clash", puuid: "4", gameName: "Mirela", availability: "chat", icon: 5023, lol: { gameStatus: "outOfGame" } },
      { id: "f105@eu1.pvp.net", summonerId: 105, groupName: "Clash", puuid: "5", gameName: "Voss", availability: "away", icon: 29, lol: { gameStatus: "outOfGame" } },
      { id: "f106@eu1.pvp.net", summonerId: 106, puuid: "6", gameName: "Pell", availability: "offline", icon: 1, lol: {} },
      ...["Ysolde", "Brakk", "Nimue", "Tavi", "Corwin", "Lysa"].map((gameName, i) => ({ id: `f1${i + 7}@eu1.pvp.net`, summonerId: 107 + i, puuid: String(7 + i), gameName, availability: "offline", icon: 700 + i * 37, lol: {} })),
    ];
  if (route === "/lol-match-history/v1/products/lol/current-summoner/matches") return { games: { games } };
  if (/^\/lol-match-history\/v1\/products\/lol\/[^/]+\/matches$/.test(route)) return { games: { games: [...games].reverse() } };
  if (/^\/lol-ranked\/v1\/ranked-stats\//.test(route)) {
    const n = Number(route.split("/").pop()) || 0;
    const R: [string, string, number, number, number][] = [["PLATINUM", "II", 41, 48, 40], ["MASTER", "I", 212, 120, 98], ["DIAMOND", "IV", 77, 88, 80], ["", "NA", 0, 0, 0], ["EMERALD", "I", 12, 61, 55], ["MASTER", "I", 1820, 300, 240], ["GOLD", "III", 64, 20, 25]];
    const F: ([string, string, number] | null)[] = [["GOLD", "I", 55], ["DIAMOND", "III", 30], null, ["PLATINUM", "IV", 8], null, ["EMERALD", "III", 71], null];
    const [tier, division, leaguePoints, wins, losses] = R[n % R.length];
    const f = F[n % F.length];
    return { queueMap: { RANKED_SOLO_5x5: { tier, division, leaguePoints, wins, losses }, ...(f ? { RANKED_FLEX_SR: { tier: f[0], division: f[1], leaguePoints: f[2], wins: 12, losses: 10 } } : {}) } };
  }
  if (route === "/lol-chat/v1/me") return { id: "me@eu1.pvp.net", pid: "me@eu1.pvp.net" };
  if (route === "/lol-chat/v1/conversations" && method === "GET") {
    const rooms: { id: string; type: string }[] = [];
    if (state.phase === "ChampSelect") rooms.push({ id: "cs-demo@champ-select.eu1.pvp.net", type: "championSelect" });
    else rooms.push({ id: "lobby-demo@sec.eu1.pvp.net", type: "customGame" });
    for (const r of rooms)
      chats[r.id] ??= [{ id: "r0", body: r.type === "championSelect" ? "je peux mid ?" : "on lance ?", fromId: "ally@eu1.pvp.net", fromSummonerId: 101, timestamp: new Date().toISOString(), type: "groupchat" } as never];
    return [
      ...Object.entries(chats).filter(([id]) => !id.includes("-demo@")).map(([id, list]) => ({ id, type: "chat", unreadMessageCount: unread[id] ?? 0, lastMessage: list.at(-1) ?? null })),
      ...rooms.map((r) => ({ ...r, unreadMessageCount: 0, lastMessage: chats[r.id].at(-1) ?? null })),
    ];
  }
  if (route === "/lol-chat/v1/conversations" && method === "POST") {
    const id = (b as { id: string }).id;
    chats[id] ??= [];
    return null;
  }
  const conv = route.match(/^\/lol-chat\/v1\/conversations\/([^/]+)(\/messages)?$/);
  if (conv) {
    const id = decodeURIComponent(conv[1]);
    chats[id] ??= [];
    if (!conv[2]) {
      unread[id] = 0;
      return null;
    }
    if (method === "POST") {
      chats[id].push({ id: String(now()), body: (b as { body: string }).body, fromId: "me@eu1.pvp.net", timestamp: new Date().toISOString(), type: "chat" });
      setTimeout(() => chats[id].push({ id: String(now()), body: "gg, on relance ?", fromId: id, timestamp: new Date().toISOString(), type: "chat" }), 2500);
      return null;
    }
    return chats[id];
  }
  if (/^\/lol-champions\/v1\/inventories\/\d+\/champions$/.test(route))
    return CHAMPIONS.map(([id, name], i) => ({ id, name, roles: CLASSES[id], ownership: { owned: i % 7 !== 3 }, skins: skinsOf(id).map((sk, j) => ({ ...sk, ownership: { owned: j === 0 || (id + j) % 3 === 0 } })) }));
  if (route === "/lol-game-data/assets/v1/summoner-icons.json") return [...Array(80)].map((_, i) => ({ id: i < 40 ? i : 6260 + i, title: i < 29 ? "" : `Icône ${6260 + i}` }));
  if (route === "/lol-inventory/v2/inventory/SUMMONER_ICON") return [6301, 6310, 6320, 6335].map((itemId) => ({ itemId }));
  if (route === "/lol-game-data/assets/v1/summoner-emotes.json") return [...Array(24)].map((_, i) => ({ id: 1000 + i, name: `Émote ${i + 1}`, inventoryIcon: "/lol-game-data/assets/ASSETS/Loadouts/SummonerEmotes/Rewards/Rewards_Emote.png" }));
  if (route === "/lol-inventory/v2/inventory/EMOTE") return [1000, 1003, 1007].map((itemId) => ({ itemId }));
  if (/^\/lol-collections\/v1\/inventories\/\d+\/ward-skins$/.test(route)) return [...Array(16)].map((_, i) => ({ id: i, name: i ? `Balise ${i}` : "Balise par défaut", ownership: { owned: i % 4 === 0 } }));
  if (route === "/lol-summoner/v1/current-summoner/icon") {
    state.icon = (b as { profileIconId: number }).profileIconId;
    return null;
  }
  if (route === "/lol-loot/v1/player-loot") return loot;
  if (route.startsWith("/lol-loot/v1/recipes/initial-item/")) {
    const id = decodeURIComponent(route.split("/").pop()!);
    if (id === "CHEST_generic") return [{ recipeName: "CHEST_generic_OPEN", type: "OPEN", contextMenuText: "Ouvrir", slots: [{ lootIds: ["CHEST_generic"], quantity: 1 }, { lootIds: ["MATERIAL_key"], quantity: 1 }] }];
    if (id === "MATERIAL_key_fragment") return [{ recipeName: "MATERIAL_key_fragment_forge", type: "FORGE", contextMenuText: "Fabriquer une clé", slots: [{ lootIds: ["MATERIAL_key_fragment"], quantity: 3 }] }];
    if (id.includes("RENTAL")) {
      const kind = id.includes("SKIN") ? "SKIN_RENTAL" : "CHAMPION_RENTAL";
      const cur = kind === "SKIN_RENTAL" ? "CURRENCY_cosmetic" : "CURRENCY_champion";
      return [
        { recipeName: `${kind}_upgrade`, type: "UPGRADE", contextMenuText: "Améliorer", slots: [{ lootIds: [id], quantity: 1 }, { lootIds: [cur], quantity: 810 }] },
        { recipeName: `${kind}_disenchant`, type: "DISENCHANT", contextMenuText: "Désenchanter", slots: [{ lootIds: [id], quantity: 1 }] },
      ];
    }
    return [];
  }
  if (route.startsWith("/lol-loot/v1/recipes/") && method === "POST") {
    for (const id of body as string[]) {
      const l = loot.find((x) => x.lootId === id);
      if (l && !id.startsWith("CURRENCY")) l.count--;
    }
    return null;
  }
  if (route === "/lol-challenges/v1/summary-player-data/local-player")
    return { title: { itemId: 2, name: "Le Grimpeur" }, topChallenges: [{ id: 101 }, { id: 104 }], totalPoints: { level: "PLATINUM", current: 6420, max: 9000 }, categoryProgress: ["IMAGINATION", "EXPERTISE", "VETERANCY", "TEAMWORK", "COLLECTION"].map((category, i) => ({ category, level: ["GOLD", "PLATINUM", "DIAMOND", "SILVER", "GOLD"][i], current: 400 + i * 120, max: 1000 })) };
  if (route === "/lol-challenges/v1/challenges/local-player")
    return Object.fromEntries([...Array(14)].map((_, i) => [101 + i, { id: 101 + i, name: ["Premier sang", "Jungle royale", "Vision parfaite", "Série gagnante", "Pentakill", "Sans mourir", "Objectifs", "Collectionneur", "Duo de choc", "Esprit d'équipe", "Rapide", "Tanky", "Farmeur", "Voleur de buff"][i], description: "Accomplis cet exploit en partie classée.", currentLevel: ["GOLD", "PLATINUM", "SILVER", "DIAMOND", "NONE", "BRONZE", "GOLD", "IRON", "MASTER", "SILVER", "NONE", "GOLD", "PLATINUM", "BRONZE"][i], currentValue: 20 + i * 7, nextThreshold: 120, levelToIconPath: {} }]));
  if (route === "/lol-challenges/v2/titles/local-player") return [{ itemId: 1, name: "L'Invaincu" }, { itemId: 2, name: "Le Grimpeur" }, { itemId: 3, name: "Maître de la jungle" }];
  if (route === "/lol-challenges/v1/update-player-preferences/") return null;
  if (route === "/lol-honor-v2/v1/ballot") {
    if (state.phase !== "EndOfGame") throw "404";
    return { gameId: 1, eligibleAllies: [
      { puuid: "a1", summonerId: 101, gameName: "Kaelith", championId: 111, championName: "Nautilus" },
      { puuid: "a2", summonerId: 102, gameName: "Thalys", championId: 103, championName: "Ahri" },
      { puuid: "a3", summonerId: 103, gameName: "Orrin", championId: 86, championName: "Garen" },
      { puuid: "a4", summonerId: 104, gameName: "Mirela", championId: 222, championName: "Jinx" },
    ] };
  }
  if (route === "/lol-honor-v2/v1/honor-player") return null;
  if (route === "/lol-chat/v2/friend-requests" && method === "GET") return friendRequests;
  if (route === "/lol-chat/v2/friend-requests" && method === "POST") {
    const r = b as { gameName: string; tagLine: string };
    friendRequests.push({ puuid: `out-${now()}`, gameName: r.gameName, gameTag: r.tagLine, icon: 29, direction: "out" });
    return null;
  }
  if (route.startsWith("/lol-chat/v2/friend-requests/")) {
    const id = decodeURIComponent(route.split("/").pop()!);
    const i = friendRequests.findIndex((r) => r.puuid === id);
    if (i >= 0) friendRequests.splice(i, 1);
    return null;
  }
  if (route === "/lol-chat/v1/friend-groups" && method === "POST") return null;
  if (route.startsWith("/lol-chat/v1/friend-groups/") || (route.startsWith("/lol-chat/v1/friends/") && method === "PUT")) return null;
  if (route === "/lol-chat/v1/friend-groups")
    return [
      { id: 0, name: "**Default", priority: 0 },
      { id: 1, name: "Duo jungle", priority: 1 },
      { id: 2, name: "Clash", priority: 2 },
    ];
  if (route === "/lol-game-queues/v1/queues") return QUEUE_LIST;
  if (route === "/lol-lobby/v1/custom-games/refresh") return null;
  if (route === "/lol-lobby/v1/custom-games")
    return [
      { id: 501, lobbyName: "Inhouse EUW 5c5", ownerDisplayName: "Torvik", mapId: 11, gameMode: "CLASSIC", filledPlayerSlots: 7, maxPlayers: 10, hasPassword: false },
      { id: 502, lobbyName: "1c1 mid only", ownerDisplayName: "Lunaire", mapId: 11, gameMode: "CLASSIC", filledPlayerSlots: 1, maxPlayers: 2, hasPassword: true },
      { id: 503, lobbyName: "ARAM entre potes", ownerDisplayName: "Oskar", mapId: 12, gameMode: "ARAM", filledPlayerSlots: 4, maxPlayers: 10, hasPassword: false },
    ];
  if (route.startsWith("/lol-lobby/v1/custom-games/") && route.endsWith("/join")) {
    state.inLobby = true;
    state.custom = { name: "Inhouse EUW 5c5", gameMode: "CLASSIC" };
    state.phase = "Lobby";
    return null;
  }
  if (route === "/lol-lobby/v1/lobby/custom/start-champ-select") {
    startChampSelect();
    return null;
  }
  const detail = route.match(/^\/lol-match-history\/v1\/(games|game-timelines)\/(\d+)$/);
  if (detail) {
    const game = games.find((g) => g.gameId === Number(detail[2]));
    if (game) {
      const { detail: d, timeline } = mockGameDetail(game as never);
      return detail[1] === "games" ? d : timeline;
    }
  }

  throw `404 ${path} (démo)`;
}
