// Détail et chronologie d'une partie pour le mode démo, générés à partir de la ligne d'historique.

import type { GameDetail, GameParticipant, Point, Timeline, TimelineEvent, TimelineFrame } from "./types";

export const DEMO_PUUID = "demo-me";

interface Summary {
  gameId: number;
  gameCreation: number;
  gameDuration: number;
  queueId: number;
  participants: { championId: number; stats: { kills: number; deaths: number; assists: number; win: boolean } }[];
}

const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
const POOL: Record<(typeof ROLES)[number], number[]> = {
  TOP: [86, 122, 24, 266, 799],
  JUNGLE: [254, 141, 5, 104, 234],
  MIDDLE: [103, 157, 238, 7, 893],
  BOTTOM: [222, 81, 145, 51, 119],
  UTILITY: [412, 99, 111, 555, 89],
};
const NAMES = ["Kaelith", "Orrin", "Thalys", "Mirela", "Torvik", "Draven Main", "Lunaire", "Kestrel", "Oskar", "Velkan", "Saelith", "Morrow", "Nyxar"];
const ITEMS: Record<(typeof ROLES)[number], number[]> = {
  TOP: [3071, 3047, 6333, 3053, 3742, 3075],
  JUNGLE: [6692, 3111, 3071, 6694, 3026, 3156],
  MIDDLE: [6655, 3020, 3089, 3157, 3135, 4645],
  BOTTOM: [6672, 3006, 3031, 3094, 3036, 3072],
  UTILITY: [3190, 3117, 3109, 3107, 2065, 3050],
};
const KEYSTONE: Record<(typeof ROLES)[number], [number, number]> = {
  TOP: [8010, 8400],
  JUNGLE: [8010, 8100],
  MIDDLE: [8112, 8200],
  BOTTOM: [8021, 8300],
  UTILITY: [8439, 8300],
};

/** Générateur pseudo-aléatoire déterministe : une même partie donne toujours les mêmes données. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const mirror = (p: Point): Point => ({ x: 14800 - p.x, y: 14800 - p.y });
const FOUNTAIN: Point = { x: 550, y: 550 };
const LANE: Record<string, Point[]> = {
  TOP: [{ x: 1200, y: 11500 }, { x: 2000, y: 12800 }, { x: 3600, y: 13600 }],
  MIDDLE: [{ x: 6200, y: 6200 }, { x: 7400, y: 7400 }, { x: 8400, y: 8400 }],
  BOTTOM: [{ x: 11500, y: 1200 }, { x: 12800, y: 2000 }, { x: 13600, y: 3600 }],
};
LANE.UTILITY = LANE.BOTTOM;
const CAMPS: Point[] = [
  { x: 3800, y: 7900 }, { x: 2100, y: 8400 }, { x: 3800, y: 6500 }, { x: 7000, y: 5400 }, { x: 7800, y: 4000 }, { x: 8400, y: 2700 },
];
const DRAGON: Point = { x: 9866, y: 4414 };
const BARON: Point = { x: 5007, y: 10471 };

export function mockGameDetail(m: Summary): { detail: GameDetail; timeline: Timeline } {
  const r = rng(m.gameId * 7919);
  const pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)];
  const mine = m.participants[0];
  const myRole: (typeof ROLES)[number] = [64, 254, 141, 5, 517].includes(mine.championId) ? "JUNGLE" : "MIDDLE";
  const myWin = mine.stats.win;

  // Composition : 1 = toi (équipe bleue), 1-5 alliés, 6-10 adversaires.
  const used = new Set<number>([mine.championId]);
  const roster = ([100, 200] as const).flatMap((teamId) =>
    ROLES.map((role) => {
      const isMe = teamId === 100 && role === myRole;
      let championId = isMe ? mine.championId : pick(POOL[role]);
      while (!isMe && used.has(championId)) championId = pick(POOL[role]);
      used.add(championId);
      return { teamId, role, championId, isMe };
    }),
  );
  const ids = roster.map((_, i) => i + 1);
  const meId = roster.findIndex((p) => p.isMe) + 1;
  const names = [...NAMES].sort(() => r() - 0.5);
  const allies = ids.filter((id) => id <= 5);
  const enemies = ids.filter((id) => id > 5);
  const duration = m.gameDuration;

  // Kills : ceux du joueur collent exactement à sa ligne d'historique, les autres sont tirés au hasard.
  const kills: TimelineEvent[] = [];
  const at = () => Math.round((90 + r() * (duration - 120)) * 1000);
  const where = (): Point => pick([...LANE.TOP, ...LANE.MIDDLE, ...LANE.BOTTOM, DRAGON, BARON, ...CAMPS]);
  const kill = (killerId: number, victimId: number, helpers: number[]) =>
    kills.push({ type: "CHAMPION_KILL", timestamp: at(), killerId, victimId, assistingParticipantIds: helpers, position: where() });
  const others = (team: number[], not: number) => team.filter((id) => id !== not && r() < 0.35);
  for (let i = 0; i < mine.stats.kills; i++) kill(meId, pick(enemies), others(allies, meId));
  for (let i = 0; i < mine.stats.deaths; i++) {
    const killer = pick(enemies);
    kill(killer, meId, others(enemies, killer));
  }
  for (let i = 0; i < mine.stats.assists; i++) {
    const killer = pick(allies.filter((id) => id !== meId));
    kill(killer, pick(enemies), [meId, ...others(allies, meId).filter((id) => id !== killer)]);
  }
  const extra = 8 + Math.floor(r() * 10);
  for (let i = 0; i < extra; i++) {
    const allyKill = r() < (myWin ? 0.4 : 0.65) ? false : true;
    const team = allyKill ? allies.filter((id) => id !== meId) : enemies;
    const killer = pick(team);
    kill(killer, allyKill ? pick(enemies) : pick(allies.filter((id) => id !== meId)), others(team, killer));
  }

  // Objectifs, en majorité pour l'équipe gagnante.
  const winners = myWin ? allies : enemies;
  const losers = myWin ? enemies : allies;
  const jungler = (team: number[]) => team[1];
  const objectives: TimelineEvent[] = [];
  const drakes = ["FIRE_DRAGON", "WATER_DRAGON", "EARTH_DRAGON", "AIR_DRAGON", "HEXTECH_DRAGON", "CHEMTECH_DRAGON"];
  [6, 6.5].forEach((min) =>
    objectives.push({ type: "ELITE_MONSTER_KILL", timestamp: min * 60000, monsterType: "HORDE", killerId: jungler(r() < 0.6 ? winners : losers), position: BARON }),
  );
  for (let min = 5.5; min < duration / 60 - 1; min += 5 + r() * 1.5) {
    objectives.push({
      type: "ELITE_MONSTER_KILL",
      timestamp: Math.round(min * 60000),
      monsterType: "DRAGON",
      monsterSubType: pick(drakes),
      killerId: jungler(r() < 0.7 ? winners : losers),
      position: DRAGON,
    });
  }
  objectives.push({ type: "ELITE_MONSTER_KILL", timestamp: 14.5 * 60000, monsterType: "RIFTHERALD", killerId: jungler(winners), position: BARON });
  if (duration > 24 * 60) objectives.push({ type: "ELITE_MONSTER_KILL", timestamp: 24 * 60000, monsterType: "BARON_NASHOR", killerId: jungler(winners), position: BARON });
  const lanes = ["TOP_LANE", "MID_LANE", "BOT_LANE"];
  const loserTeamId = myWin ? 200 : 100;
  for (let i = 0; i < 7; i++) {
    const lane = lanes[i % 3];
    const pos = lane === "TOP_LANE" ? LANE.TOP[1] : lane === "MID_LANE" ? LANE.MIDDLE[1] : LANE.BOTTOM[1];
    objectives.push({
      type: "BUILDING_KILL",
      timestamp: Math.round((12 + i * ((duration / 60 - 13) / 7)) * 60000),
      buildingType: "TOWER_BUILDING",
      laneType: lane,
      teamId: loserTeamId,
      killerId: pick(winners),
      assistingParticipantIds: [],
      position: loserTeamId === 200 ? mirror(pos) : pos,
    });
  }
  if (duration > 22 * 60)
    objectives.push({ type: "BUILDING_KILL", timestamp: (duration - 90) * 1000, buildingType: "INHIBITOR_BUILDING", laneType: "MID_LANE", teamId: loserTeamId, killerId: pick(winners), assistingParticipantIds: [], position: loserTeamId === 200 ? mirror({ x: 3200, y: 3200 }) : { x: 3200, y: 3200 } });

  const events = [...kills, ...objectives].sort((a, b) => a.timestamp - b.timestamp);
  const count = (f: (e: TimelineEvent) => boolean) => events.filter(f).length;

  // Positions minute par minute.
  const frames: TimelineFrame[] = [];
  const minutes = Math.ceil(duration / 60);
  for (let min = 0; min <= minutes; min++) {
    const ts = Math.min(min * 60000, duration * 1000);
    const participantFrames: TimelineFrame["participantFrames"] = {};
    roster.forEach((p, i) => {
      const id = i + 1;
      let pos: Point;
      if (min === 0) pos = FOUNTAIN;
      else if (p.role === "JUNGLE") pos = CAMPS[(min + i) % CAMPS.length];
      else if (min > 14 && r() < 0.35) pos = pick([DRAGON, BARON, LANE.MIDDLE[1]]);
      else pos = LANE[p.role][Math.min(2, Math.floor(r() * 3))];
      if (p.teamId === 200) pos = mirror(pos);
      const jitter = min === 0 ? 0 : 500;
      const killsSoFar = count((e) => e.killerId === id && e.timestamp <= ts);
      participantFrames[String(id)] = {
        participantId: id,
        position: { x: Math.round(pos.x + (r() - 0.5) * jitter), y: Math.round(pos.y + (r() - 0.5) * jitter) },
        totalGold: 500 + Math.round(min * (330 + r() * 40 + (p.role === "UTILITY" ? -90 : 0)) + killsSoFar * 300),
        level: Math.min(18, 1 + Math.floor(min * 0.62)),
        minionsKilled: p.role === "JUNGLE" ? Math.floor(min * 0.6) : p.role === "UTILITY" ? Math.floor(min * 1.2) : Math.floor(min * 7.1),
        jungleMinionsKilled: p.role === "JUNGLE" ? Math.floor(min * 5.6) : 0,
      };
    });
    frames.push({
      timestamp: ts,
      participantFrames,
      events: events.filter((e) => e.timestamp > (min - 1) * 60000 && e.timestamp <= ts),
    });
  }
  const last = frames[frames.length - 1].participantFrames;

  const participants: GameParticipant[] = roster.map((p, i) => {
    const id = i + 1;
    const f = last[String(id)];
    const items = [...ITEMS[p.role]].sort(() => r() - 0.5).slice(0, 4 + Math.floor(r() * 3));
    const ks = count((e) => e.type === "CHAMPION_KILL" && e.killerId === id);
    const damage = Math.round((p.role === "UTILITY" ? 9000 : 16000) + r() * 14000 + ks * 1500);
    return {
      participantId: id,
      teamId: p.teamId,
      championId: p.championId,
      spell1Id: 4,
      spell2Id: p.role === "JUNGLE" ? 11 : p.role === "TOP" ? 12 : p.role === "UTILITY" ? 3 : p.role === "BOTTOM" ? 7 : 14,
      timeline: p.role === "UTILITY" ? { lane: "BOTTOM", role: "DUO_SUPPORT" } : p.role === "BOTTOM" ? { lane: "BOTTOM", role: "DUO_CARRY" } : { lane: p.role, role: "SOLO" },
      stats: {
        win: p.teamId === 100 ? myWin : !myWin,
        kills: ks,
        deaths: count((e) => e.type === "CHAMPION_KILL" && e.victimId === id),
        assists: count((e) => e.type === "CHAMPION_KILL" && !!e.assistingParticipantIds?.includes(id)),
        champLevel: f.level,
        goldEarned: f.totalGold,
        totalDamageDealtToChampions: damage,
        totalDamageTaken: Math.round(14000 + r() * 16000),
        totalMinionsKilled: f.minionsKilled,
        neutralMinionsKilled: f.jungleMinionsKilled,
        visionScore: Math.round(duration / 60 * (p.role === "UTILITY" ? 2.4 : p.role === "JUNGLE" ? 1.3 : 0.8)),
        wardsPlaced: Math.round(duration / 60 * (p.role === "UTILITY" ? 1.2 : 0.4)),
        wardsKilled: Math.floor(r() * 8),
        visionWardsBoughtInGame: Math.floor(r() * 6),
        largestMultiKill: id === meId && ks >= 6 ? 2 : 1,
        perk0: KEYSTONE[p.role][0],
        perkSubStyle: KEYSTONE[p.role][1],
        ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((s) => [`item${s}`, items[s] ?? 0])),
        item6: p.role === "UTILITY" ? 3364 : 3340,
      },
    };
  });

  const teamStats = (teamId: number) => {
    const team = teamId === 100 ? allies : enemies;
    const by = (type: string) => count((e) => e.type === "ELITE_MONSTER_KILL" && e.monsterType === type && team.includes(e.killerId ?? 0));
    return {
      teamId,
      win: (teamId === 100) === myWin ? "Win" : "Fail",
      dragonKills: by("DRAGON"),
      baronKills: by("BARON_NASHOR"),
      riftHeraldKills: by("RIFTHERALD"),
      hordeKills: by("HORDE"),
      towerKills: count((e) => e.type === "BUILDING_KILL" && e.buildingType === "TOWER_BUILDING" && e.teamId !== teamId),
      inhibitorKills: count((e) => e.type === "BUILDING_KILL" && e.buildingType === "INHIBITOR_BUILDING" && e.teamId !== teamId),
      bans: [0, 1, 2, 3, 4].map(() => ({ championId: pick([11, 121, 76, 84, 350, 59, 60, 427]) })),
    };
  };

  return {
    detail: {
      gameId: m.gameId,
      gameCreation: m.gameCreation,
      gameDuration: duration,
      queueId: m.queueId,
      participants,
      participantIdentities: roster.map((p, i) => ({
        participantId: i + 1,
        player: p.isMe ? { puuid: DEMO_PUUID, gameName: "Nika", tagLine: "EUW" } : { puuid: `p${i}`, gameName: names[i % names.length], tagLine: "EUW" },
      })),
      teams: [teamStats(100), teamStats(200)],
    },
    timeline: { frames },
  };
}
