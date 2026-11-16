import type { Point, Timeline } from "../lib/types";
import { momentsOf, type GamePlayer, type Moment } from "./game";

/**
 * Le replay d'une partie : on regroupe les événements en combats, on mesure ce que chacun a rapporté en or,
 * et on garde les 4 à 6 passages qui ont compté. Tout est calculé ici, sans réseau.
 */

export interface Chapter {
  start: number;
  end: number;
  kills: Moment[];
  objectives: Moment[];
  buildings: Moment[];
  allyKills: number;
  enemyKills: number;
  /** Bilan du passage pour ton équipe (kills, objectifs, bâtiments) : positif s'il est gagné. */
  net: number;
  /** Variation de l'écart d'or de ton équipe pendant le passage. */
  swing: number;
  /** Écart d'or juste après le passage. */
  after: number;
  /** Joueurs présents (tueurs, victimes, aides). */
  involved: number[];
  /** Ton score sur le passage, ou null si tu n'y étais pas. */
  mine: { k: number; d: number; a: number } | null;
  where: string;
  title: string;
  detail: string;
  tags: string[];
  center: Point;
  score: number;
}

export interface Story {
  chapters: Chapter[];
  /** Écart d'or de ton équipe minute par minute. */
  curve: { t: number; diff: number }[];
  all: Moment[];
  end: number;
}

const GAP = 30;
/** Au-delà de cette distance, deux événements simultanés sont deux passages différents. */
const REACH = 5200;
const MAX_CHAPTERS = 6;
const MAP = 14870;

const OBJ_WEIGHT: Record<string, number> = { BARON_NASHOR: 5, ATAKHAN: 3, RIFTHERALD: 2, DRAGON: 2, HORDE: 0.6 };
const OBJ_NAME: Record<string, [string, "m" | "fp"]> = {
  BARON_NASHOR: ["Nashor", "m"],
  ATAKHAN: ["Atakhan", "m"],
  RIFTHERALD: ["Héraut", "m"],
  DRAGON: ["Drake", "m"],
  HORDE: ["Larves", "fp"],
};
const DRAKES: Record<string, string> = {
  FIRE_DRAGON: "Drake infernal",
  WATER_DRAGON: "Drake des océans",
  EARTH_DRAGON: "Drake des montagnes",
  AIR_DRAGON: "Drake des nuages",
  HEXTECH_DRAGON: "Drake hextech",
  CHEMTECH_DRAGON: "Drake chemtech",
  ELDER_DRAGON: "Drake ancestral",
};
const LANES: Record<string, string> = { TOP_LANE: "du haut", MID_LANE: "du milieu", BOT_LANE: "du bas" };

export function objectiveName(m: Moment) {
  const e = m.event;
  if (e.monsterType === "DRAGON") return DRAKES[e.monsterSubType ?? ""] ?? "Drake";
  return OBJ_NAME[e.monsterType ?? ""]?.[0] ?? "Monstre épique";
}

export function buildingName(m: Moment) {
  const e = m.event;
  return `${e.buildingType === "INHIBITOR_BUILDING" ? "Inhibiteur" : "Tourelle"} ${LANES[e.laneType ?? ""] ?? ""}`.trim();
}

/** Où ça se passe, en mots, vu de ton équipe. */
export function zoneOf(p: Point, myTeam: number): string {
  const near = (q: Point, r: number) => Math.hypot(p.x - q.x, p.y - q.y) < r;
  const mine = (blueSide: boolean) => (blueSide === (myTeam === 100) ? "ta" : "leur");
  if (near({ x: 5007, y: 10471 }, 1700)) return "au Nashor";
  if (near({ x: 9866, y: 4414 }, 1700)) return "au drake";
  if (p.x + p.y < 4600) return `dans ${mine(true)} base`;
  if (p.x + p.y > 2 * MAP - 4600) return `dans ${mine(false)} base`;
  if (p.x < 2200 || p.y > MAP - 2200) return "en haut";
  if (p.y < 2200 || p.x > MAP - 2200) return "en bas";
  if (Math.abs(p.x - p.y) < 1400) return "au milieu";
  if (Math.abs(p.x + p.y - MAP) < 1500) return "dans la rivière";
  return `dans ${mine(p.x + p.y < MAP)} jungle`;
}

export function goldCurve(timeline: Timeline, players: GamePlayer[], myTeam: number) {
  const teamOf = new Map(players.map((p) => [p.id, p.teamId]));
  return timeline.frames.map((f) => {
    let diff = 0;
    for (const pf of Object.values(f.participantFrames ?? {})) diff += (teamOf.get(pf.participantId) === myTeam ? 1 : -1) * (pf.totalGold ?? 0);
    return { t: f.timestamp / 1000, diff };
  });
}

function diffAt(curve: { t: number; diff: number }[], t: number) {
  if (!curve.length) return 0;
  if (t <= curve[0].t) return curve[0].diff;
  for (let i = 1; i < curve.length; i++) {
    const b = curve[i];
    if (t <= b.t) {
      const a = curve[i - 1];
      return a.diff + ((b.diff - a.diff) * (t - a.t)) / (b.t - a.t || 1);
    }
  }
  return curve[curve.length - 1].diff;
}

export function buildStory(timeline: Timeline, players: GamePlayer[], myTeam: number, won: boolean): Story {
  const all = momentsOf(timeline, players);
  const curve = goldCurve(timeline, players, myTeam);
  const end = curve[curve.length - 1]?.t ?? 0;
  const byId = new Map(players.map((p) => [p.id, p]));
  const meId = players.find((p) => p.me)?.id;

  // 1. Regrouper : un événement rejoint un passage en cours s'il arrive moins de GAP secondes après et au même endroit.
  const groups: Moment[][] = [];
  const centroid = (g: Moment[]) => {
    const pts = g.map((m) => m.event.position).filter(Boolean) as Point[];
    return pts.length ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length } : null;
  };
  for (const m of all) {
    const p = m.event.position;
    const home = groups.find((g) => {
      if (m.t - g[g.length - 1].t > GAP) return false;
      const c = centroid(g);
      return !p || !c || Math.hypot(p.x - c.x, p.y - c.y) < REACH;
    });
    if (home) home.push(m);
    else groups.push([m]);
  }
  groups.sort((a, b) => a[0].t - b[0].t);

  // 2. Décrire et noter chaque passage.
  const chapters = groups.map((g) => describe(g));
  if (!chapters.length) return { chapters: [], curve, all, end };
  // Deux passages en même temps à deux endroits : la courbe ne donne qu'un seul écart, on le partage selon leur bilan.
  for (let i = 0; i < chapters.length; i++) {
    const same = chapters.filter((c) => c.start <= chapters[i].end + 45 && chapters[i].start <= c.end + 45);
    if (same.length < 2 || same[0] !== chapters[i]) continue;
    const total = diffAt(curve, Math.max(...same.map((c) => c.end)) + 45) - diffAt(curve, Math.min(...same.map((c) => c.start)) - 15);
    const weight = (c: Chapter) => Math.abs(c.net) + 0.5;
    const sum = same.reduce((s, c) => s + weight(c), 0);
    for (const c of same) c.swing = Math.round((total * weight(c)) / sum);
  }

  // 3. Garder les plus marquants, plus le premier sang et la fin.
  const firstKill = chapters.find((c) => c.kills.length > 0);
  const last = chapters[chapters.length - 1];
  const picked = new Set<Chapter>();
  if (firstKill) picked.add(firstKill);
  if (last.score >= 2) picked.add(last);
  for (const c of [...chapters].sort((a, b) => b.score - a.score)) {
    if (picked.size >= MAX_CHAPTERS) break;
    if (c.score >= 2) picked.add(c);
  }
  const kept = [...picked].sort((a, b) => a.start - b.start);

  // 4. Étiquettes : premier sang, tournant, ton meilleur passage, le plus coûteux pour toi.
  if (firstKill && kept.includes(firstKill)) firstKill.tags.push("Premier sang");
  const sign = won ? 1 : -1;
  // Le tournant : le passage gagné par le vainqueur qui a le plus fait bouger l'or dans son sens.
  const turning = kept.filter((c) => c !== firstKill && sign * c.net > 0).sort((a, b) => sign * b.swing - sign * a.swing)[0];
  if (turning && sign * turning.swing > 600) turning.tags.push("Le tournant");
  const withMe = kept.filter((c) => c.mine);
  const best = [...withMe].sort((a, b) => b.mine!.k * 2 + b.mine!.a - b.mine!.d * 2 - (a.mine!.k * 2 + a.mine!.a - a.mine!.d * 2))[0];
  if (best && best.mine!.k + best.mine!.a >= 2 && best.mine!.d === 0) best.tags.push("Ton meilleur passage");
  const worst = withMe.filter((c) => c.mine!.d > 0).sort((a, b) => a.swing - b.swing)[0];
  if (worst && worst.swing < -500 && worst !== best) worst.tags.push("Coûteux pour toi");
  if (last && kept.includes(last) && last.end > end - 120) last.tags.push(won ? "Victoire" : "Défaite");

  return { chapters: kept, curve, all, end };

  function describe(g: Moment[]): Chapter {
    const kills = g.filter((m) => m.kind === "kill");
    const objectives = g.filter((m) => m.kind === "objective");
    const buildings = g.filter((m) => m.kind === "building");
    const start = g[0].t;
    const stop = g[g.length - 1].t;
    const allyKills = kills.filter((m) => m.team === myTeam).length;
    const enemyKills = kills.length - allyKills;
    const before = diffAt(curve, start - 15);
    const after = diffAt(curve, stop + 45);
    const swing = Math.round(after - before);

    const involved = new Set<number>();
    for (const m of g) {
      if (m.kind === "building" && !m.event.killerId) continue;
      if (m.event.killerId && byId.has(m.event.killerId)) involved.add(m.event.killerId);
      if (m.event.victimId) involved.add(m.event.victimId);
      for (const id of m.event.assistingParticipantIds ?? []) involved.add(id);
    }
    let mine: Chapter["mine"] = null;
    const inKills = (id: number) => kills.some((m) => m.event.killerId === id || m.event.victimId === id || m.event.assistingParticipantIds?.includes(id));
    if (meId && inKills(meId)) {
      mine = {
        k: kills.filter((m) => m.event.killerId === meId).length,
        d: kills.filter((m) => m.event.victimId === meId).length,
        a: kills.filter((m) => m.event.assistingParticipantIds?.includes(meId)).length,
      };
    }

    const pts = g.map((m) => m.event.position).filter(Boolean) as Point[];
    const center = pts.length ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length } : { x: MAP / 2, y: MAP / 2 };
    const where = zoneOf(center, myTeam);

    let score = kills.length * 1.2 + Math.abs(swing) / 800;
    for (const o of objectives) score += o.event.monsterSubType === "ELDER_DRAGON" ? 5 : OBJ_WEIGHT[o.event.monsterType ?? ""] ?? 1;
    for (const b of buildings) score += b.event.buildingType === "INHIBITOR_BUILDING" ? 2.5 : 0.8;
    if (mine) score += 1.5;
    const side = (m: Moment) => (m.team === myTeam ? 1 : -1);
    let net = allyKills - enemyKills;
    for (const o of objectives) net += side(o) * (o.event.monsterSubType === "ELDER_DRAGON" ? 3 : (OBJ_WEIGHT[o.event.monsterType ?? ""] ?? 1) * 0.6);
    for (const b of buildings) net += side(b) * (b.event.buildingType === "INHIBITOR_BUILDING" ? 1.5 : 0.7);
    if (allyKills >= 5 || enemyKills >= 5) score += 3;

    const name = (id?: number) => {
      const p = byId.get(id ?? 0);
      return p ? (p.me ? "toi" : p.champion) : "une tourelle";
    };
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    // Titre : l'objectif majeur s'il y en a un, sinon le combat, sinon les bâtiments.
    const major = [...objectives].sort((a, b) => (OBJ_WEIGHT[b.event.monsterType ?? ""] ?? 1) - (OBJ_WEIGHT[a.event.monsterType ?? ""] ?? 1))[0];
    let title: string;
    if (major && (OBJ_WEIGHT[major.event.monsterType ?? ""] ?? 1) >= 2) {
      const ours = major.team === myTeam;
      const plural = OBJ_NAME[major.event.monsterType ?? ""]?.[1] === "fp";
      title = `${objectiveName(major)} ${ours ? (plural ? "prises" : "pris") : plural ? "perdues" : "perdu"}`;
    } else if (kills.length === 1) {
      const k = kills[0].event;
      const killer = byId.get(k.killerId ?? 0);
      const victim = byId.get(k.victimId ?? 0);
      if (victim?.me) title = killer ? `Tu meurs face à ${killer.champion} ${where}` : `Tu meurs sous une tourelle ${where}`;
      else if (killer?.me) title = `Tu tues ${victim?.champion ?? "un adversaire"} ${where}`;
      else title = `${cap(name(k.killerId))} tue ${name(k.victimId)} ${where}`;
    } else if (kills.length > 1) {
      const ace = allyKills >= 5 ? " (ace)" : enemyKills >= 5 ? " (ace subi)" : "";
      title = `Combat ${allyKills} pour ${enemyKills} ${where}${ace}`;
    } else if (buildings.length) {
      const ours = buildings[0].team === myTeam;
      title = buildings.length > 1 ? `${ours ? "Siège" : "Ils assiègent"} : ${buildings.length} bâtiments` : `${buildingName(buildings[0])} ${ours ? "détruite" : "perdue"}`;
      if (buildings[0].event.buildingType === "INHIBITOR_BUILDING" && buildings.length === 1) title = `${buildingName(buildings[0])} ${ours ? "détruit" : "perdu"}`;
    } else {
      title = major ? `${objectiveName(major)} ${major.team === myTeam ? "pour ton équipe" : "pour eux"}` : "Escarmouche";
    }

    const bits: string[] = [];
    if (major && !title.startsWith(objectiveName(major))) bits.push(`${objectiveName(major)} ${major.team === myTeam ? "pour ton équipe" : "pour eux"}`);
    if (major && title.startsWith(objectiveName(major)) && kills.length) bits.push(`combat ${allyKills} pour ${enemyKills}`);
    if (buildings.length && kills.length) bits.push(`${buildings.length} bâtiment${buildings.length > 1 ? "s" : ""}`);
    const taker = [...objectives, ...buildings].some((m) => m.mine);
    bits.push(mine ? `toi ${mine.k} / ${mine.d} / ${mine.a}` : taker ? "avec toi" : "sans toi");
    const detail = cap(bits.join(" · "));

    return { start, end: stop, kills, objectives, buildings, allyKills, enemyKills, net, swing, after: Math.round(after), involved: [...involved], mine, where, title, detail, tags: [], center, score };
  }
}
