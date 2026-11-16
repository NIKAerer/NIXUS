// Formes (partielles) des réponses de l'API locale du client Riot.

export type GameflowPhase =
  | "None"
  | "Lobby"
  | "Matchmaking"
  | "ReadyCheck"
  | "ChampSelect"
  | "GameStart"
  | "InProgress"
  | "WaitingForStats"
  | "PreEndOfGame"
  | "EndOfGame"
  | "Reconnect";

export interface Summoner {
  puuid?: string;
  summonerId?: number;
  gameName: string;
  tagLine: string;
  summonerLevel: number;
  profileIconId: number;
  percentCompleteForNextLevel: number;
}

export interface RankedQueue {
  tier: string; // "EMERALD", "" si non classé
  division: string; // "II", "NA"
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface RankedStats {
  queueMap: Record<string, RankedQueue | undefined>;
}

export interface Friend {
  /** Id de chat (xxx@eu1.pvp.net), sert à ouvrir la conversation. */
  id?: string;
  pid?: string;
  summonerId?: number;
  groupId?: number;
  groupName?: string;
  puuid: string;
  gameName: string;
  availability: string; // "chat" | "dnd" | "away" | "offline" | "mobile"
  icon: number;
  lol?: { gameStatus?: string; gameQueueType?: string; timeStamp?: string };
}

export interface MatchParticipant {
  championId: number;
  stats: { kills: number; deaths: number; assists: number; win: boolean };
}

export interface Match {
  gameId: number;
  gameCreation: number;
  gameDuration: number;
  queueId: number;
  participants: MatchParticipant[];
}

export interface MatchHistory {
  games: { games: Match[] };
}

export interface SearchState {
  searchState?: string;
  lowPriorityData?: { penaltyTime: number; penaltyTimeRemaining: number; reason?: string };
  errors?: { penaltyTimeRemaining: number; message?: string; errorType?: string }[];
  estimatedQueueTime: number;
  timeInQueue: number;
  readyCheck: { state: string; playerResponse: string; timer: number };
}

export interface ChampSelectPlayer {
  cellId: number;
  championId: number;
  championPickIntent: number;
  assignedPosition: string;
  gameName?: string;
  puuid?: string;
  summonerId?: number;
  /** 1 = côté bleu, 2 = côté rouge. */
  team?: number;
  /** Identifiants masqués (classé, noms cachés) : servent seulement à relier un message du chat à sa place. */
  obfuscatedPuuid?: string;
  obfuscatedSummonerId?: number;
  spell1Id?: number;
  spell2Id?: number;
  selectedSkinId?: number;
}

export interface ChampSelectAction {
  id: number;
  actorCellId: number;
  championId: number;
  type: "pick" | "ban" | string;
  completed: boolean;
  isInProgress: boolean;
}

export interface ChampSelectSession extends ChampSelectSessionExtra {
  localPlayerCellId: number;
  myTeam: ChampSelectPlayer[];
  theirTeam: ChampSelectPlayer[];
  actions: ChampSelectAction[][];
  bans: { myTeamBans: number[]; theirTeamBans: number[] };
  timer: { phase: string; adjustedTimeLeftInPhase: number; totalTimeInPhase?: number; internalNowInEpochMs?: number };
}

export interface ChampionSummary {
  id: number;
  name: string;
  alias: string;
  roles?: string[]; // "fighter", "mage", "assassin", "marksman", "support", "tank"
}

export interface Skin {
  id: number;
  championId?: number;
  name: string;
  unlocked?: boolean;
  disabled?: boolean;
  isBase?: boolean;
  /** Chromas du skin (le client les range sous le skin parent). */
  childSkins?: Chroma[];
}

export interface Chroma {
  id: number;
  name: string;
  unlocked?: boolean;
  disabled?: boolean;
  colors?: string[];
  chromaPreviewPath?: string;
}

export interface RunePage {
  id: number;
  name: string;
  isActive?: boolean;
  isEditable?: boolean;
  primaryStyleId?: number;
  subStyleId?: number;
  selectedPerkIds?: number[];
}

export interface ChampSelectSessionExtra {
  benchEnabled?: boolean;
  benchChampions?: { championId: number }[];
  rerollsRemaining?: number;
  trades?: ChampSelectTrade[];
  pickOrderSwaps?: ChampSelectTrade[];
  positionSwaps?: ChampSelectTrade[];
  isCustomGame?: boolean;
  chatDetails?: { multiUserChatId?: string; chatRoomName?: string };
}

export interface ChampSelectTrade {
  id: number;
  cellId: number;
  state: "AVAILABLE" | "BUSY" | "INVALID" | "RECEIVED" | "SENT" | string;
}

export interface LobbyMember {
  summonerId: number;
  puuid?: string;
  gameName?: string;
  summonerName?: string;
  summonerIconId: number;
  isLeader: boolean;
  firstPositionPreference: string;
  secondPositionPreference: string;
  ready?: boolean;
  isBot?: boolean;
  botChampionId?: number;
  /** Protection contre l'autofill (« Role Guaranteed » du client) et sa raison. */
  autoFillEligible?: boolean;
  autoFillProtectedForStreaking?: boolean;
  autoFillProtectedForPromos?: boolean;
  autoFillProtectedForRemedy?: boolean;
  autoFillProtectedForSoloing?: boolean;
}

export interface Lobby {
  multiUserChatId?: string;
  gameConfig: {
    queueId: number;
    showPositionSelector?: boolean;
    maxLobbySize?: number;
    isCustom?: boolean;
    gameMode?: string;
    mapId?: number;
    customLobbyName?: string;
    customTeam100?: LobbyMember[];
    customTeam200?: LobbyMember[];
    customSpectators?: LobbyMember[];
    customSpectatorPolicy?: string;
    maxTeamSize?: number;
  };
  members: LobbyMember[];
  localMember: LobbyMember;
  /** Rôles recherchés par le matchmaking (losanges sur les icônes de rôle du client). */
  scarcePositions?: string[];
  canStartActivity?: boolean;
}

export interface Invitation {
  invitationId: string;
  fromSummonerName?: string;
  fromSummonerId?: number;
  state: string;
  gameConfig?: { queueId: number };
}

export interface Mastery {
  championId: number;
  championLevel: number;
  championPoints: number;
}

export interface Wallet {
  RP?: number;
  lol_blue_essence?: number;
}

export interface EogPlayer {
  championId: number;
  puuid?: string;
  summonerId?: number;
  botPlayer?: boolean;
  riotIdGameName?: string;
  summonerName?: string;
  isLocalPlayer?: boolean;
  stats: Record<string, number>;
}

export interface EndOfGame {
  gameLength: number;
  queueType?: string;
  gameId: number;
  localPlayer: EogPlayer;
  teams: { isPlayerTeam: boolean; isWinningTeam: boolean; players: EogPlayer[] }[];
}

// Détail d'une partie : /lol-match-history/v1/games/{gameId}
export interface GameParticipant {
  participantId: number;
  teamId: number;
  championId: number;
  spell1Id: number;
  spell2Id: number;
  /** kills, deaths, assists, champLevel, goldEarned, item0…item6, perk0, perkSubStyle, win… */
  stats: Record<string, number | boolean | undefined>;
  timeline?: { lane?: string; role?: string };
}

export interface GameTeam {
  teamId: number;
  win: string; // "Win" | "Fail"
  baronKills?: number;
  dragonKills?: number;
  riftHeraldKills?: number;
  hordeKills?: number;
  towerKills?: number;
  inhibitorKills?: number;
  bans?: { championId: number }[];
}

export interface GameDetail {
  gameId: number;
  gameCreation: number;
  gameDuration: number;
  queueId: number;
  participants: GameParticipant[];
  participantIdentities: { participantId: number; player: { puuid?: string; gameName?: string; tagLine?: string; summonerName?: string } }[];
  teams: GameTeam[];
}

// Chronologie : /lol-match-history/v1/game-timelines/{gameId}
export interface Point {
  x: number;
  y: number;
}

export interface TimelineEvent {
  type: string;
  timestamp: number;
  killerId?: number;
  victimId?: number;
  assistingParticipantIds?: number[];
  position?: Point;
  monsterType?: string;
  monsterSubType?: string;
  buildingType?: string;
  towerType?: string;
  laneType?: string;
  teamId?: number;
}

export interface ParticipantFrame {
  participantId: number;
  position?: Point;
  totalGold: number;
  level: number;
  minionsKilled: number;
  jungleMinionsKilled: number;
}

export interface TimelineFrame {
  timestamp: number;
  participantFrames: Record<string, ParticipantFrame>;
  events: TimelineEvent[];
}

export interface Timeline {
  frames: TimelineFrame[];
}

// Files de jeu : /lol-game-queues/v1/queues
export interface GameQueue {
  id: number;
  name: string;
  shortName?: string;
  description?: string;
  detailedDescription?: string;
  gameMode: string;
  mapId: number;
  category: string; // "PvP" | "VersusAi" | "Custom"…
  queueAvailability: string; // "Available" | "PlatformDisabled"…
  isRanked?: boolean;
  type?: string;
  maximumParticipantListSize?: number;
  isVisible?: boolean;
  isCustom?: boolean;
  gameSelectModeGroup?: string;
  gameSelectCategory?: string;
}

// Parties personnalisées : /lol-lobby/v1/custom-games
export interface CustomGame {
  id: number;
  lobbyName: string;
  ownerDisplayName?: string;
  ownerSummonerName?: string;
  gameType?: string;
  gameMode?: string;
  mapId?: number;
  filledPlayerSlots?: number;
  maxPlayers?: number;
  hasPassword?: boolean;
  spectatorPolicy?: string;
}

export interface FriendGroup {
  id: number;
  name: string;
  priority?: number;
  collapsed?: boolean;
}
