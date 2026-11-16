import type { ChampionSummary, GameDetail, GameParticipant, Timeline, TimelineEvent } from "../lib/types";

/** Un joueur de la partie, avec tout ce que les écrans de détail affichent. */
export interface GamePlayer {
  id: number;
  teamId: number;
  championId: number;
  champion: string;
  name: string;
  puuid?: string;
  me: boolean;
  k: number;
  d: number;
  a: number;
  level: number;
  gold: number;
  damage: number;
  taken: number;
  cs: number;
  vision: number;
  wards: number;
  wardsKilled: number;
  pinks: number;
  items: number[];
  trinket: number;
  spells: [number, number];
  keystone: number;
  subStyle: number;
  multi: number;
}

const n = (p: GameParticipant, key: string) => Number(p.stats[key] ?? 0);

export function toPlayers(detail: GameDetail, myPuuid: string | undefined, fallbackChampion: number | undefined, champions: Map<number, ChampionSummary>): GamePlayer[] {
  const identity = new Map(detail.participantIdentities.map((i) => [i.participantId, i.player]));
  const mine =
    detail.participantIdentities.find((i) => myPuuid && i.player.puuid === myPuuid)?.participantId ??
    detail.participants.find((p) => p.championId === fallbackChampion)?.participantId;
  return detail.participants.map((p) => {
    const who = identity.get(p.participantId);
    return {
      id: p.participantId,
      teamId: p.teamId,
      championId: p.championId,
      champion: champions.get(p.championId)?.name ?? "Champion",
      name: who?.gameName || who?.summonerName || `Joueur ${p.participantId}`,
      puuid: who?.puuid,
      me: p.participantId === mine,
      k: n(p, "kills"),
      d: n(p, "deaths"),
      a: n(p, "assists"),
      level: n(p, "champLevel"),
      gold: n(p, "goldEarned"),
      damage: n(p, "totalDamageDealtToChampions"),
      taken: n(p, "totalDamageTaken"),
      cs: n(p, "totalMinionsKilled") + n(p, "neutralMinionsKilled"),
      vision: n(p, "visionScore"),
      wards: n(p, "wardsPlaced"),
      wardsKilled: n(p, "wardsKilled"),
      pinks: n(p, "visionWardsBoughtInGame"),
      items: [0, 1, 2, 3, 4, 5].map((i) => n(p, `item${i}`)),
      trinket: n(p, "item6"),
      spells: [p.spell1Id, p.spell2Id],
      keystone: n(p, "perk0"),
      subStyle: n(p, "perkSubStyle"),
      multi: n(p, "largestMultiKill"),
    };
  });
}

export interface Moment {
  t: number;
  kind: "kill" | "objective" | "building";
  /** Équipe qui marque. */
  team: number;
  event: TimelineEvent;
  mine: boolean;
}

export function momentsOf(timeline: Timeline, players: GamePlayer[]): Moment[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const meId = players.find((p) => p.me)?.id;
  const out: Moment[] = [];
  for (const e of timeline.frames.flatMap((f) => f.events ?? [])) {
    const t = e.timestamp / 1000;
    const killerTeam = byId.get(e.killerId ?? 0)?.teamId;
    if (e.type === "CHAMPION_KILL") {
      const victim = byId.get(e.victimId ?? 0);
      if (!victim) continue;
      const mine = e.killerId === meId || e.victimId === meId || !!(meId && e.assistingParticipantIds?.includes(meId));
      out.push({ t, kind: "kill", team: killerTeam ?? (victim.teamId === 100 ? 200 : 100), event: e, mine });
    } else if (e.type === "ELITE_MONSTER_KILL") {
      out.push({ t, kind: "objective", team: killerTeam ?? e.teamId ?? 0, event: e, mine: e.killerId === meId });
    } else if (e.type === "BUILDING_KILL") {
      // teamId désigne l'équipe qui possédait le bâtiment.
      out.push({ t, kind: "building", team: e.teamId === 100 ? 200 : 100, event: e, mine: e.killerId === meId || !!(meId && e.assistingParticipantIds?.includes(meId)) });
    }
  }
  return out.sort((x, y) => x.t - y.t);
}
