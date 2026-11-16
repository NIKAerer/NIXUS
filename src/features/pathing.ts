import type { Point, Timeline, TimelineEvent } from "../lib/types";
import type { GamePlayer } from "./game";

/**
 * Trajets reconstitués. Riot ne donne qu'une position par joueur et par minute : entre deux positions connues,
 * on fait passer le joueur par les couloirs de la carte au lieu de couper à travers les murs, et on recale le
 * trajet sur tout ce que la timeline date à la seconde : kills et aides, objectifs, tours, achats (le joueur est
 * à la base), morts et réapparitions. Les camps de jungle sont déduits du nombre de monstres tués dans la minute :
 * on retient l'enchaînement de camps encore en vie qui rallonge le moins le trajet.
 * C'est une estimation plausible, pas un enregistrement : l'écran l'annonce comme telle.
 */

export interface Sample extends Point {
  t: number;
  /** Arrivée par téléportation (rappel, réapparition) : pas de trait depuis le point précédent. */
  jump?: boolean;
}

export interface CampKill {
  t: number;
  player: number;
  camp: string;
  /** Côté de la carte du camp : 100 = moitié bleue, 200 = moitié rouge, 0 = rivière. */
  side: number;
  pos: Point;
}

export interface Pathing {
  tracks: Map<number, Sample[]>;
  camps: CampKill[];
  /** Le jungler de chaque équipe (celui qui a tué le plus de monstres à 10 minutes). */
  junglers: number[];
}

const MAP = 14870;
const mirror = (p: Point): Point => ({ x: MAP - p.x, y: MAP - p.y });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const FOUNTAIN: Record<number, Point> = { 100: { x: 560, y: 580 }, 200: { x: 14300, y: 14380 } };
/** Vitesse de marche moyenne, en unités de carte par seconde. */
const SPEED = 390;

/* ---------- Camps ---------- */

interface Camp {
  key: string;
  name: string;
  side: number;
  pos: Point;
  spawn: number;
  respawn: number;
}

const BLUE_CAMPS: [string, string, number, number, number, number][] = [
  ["blue", "Buff bleu", 3800, 7900, 90, 300],
  ["gromp", "Gromp", 2150, 8400, 90, 135],
  ["wolves", "Loups", 3780, 6480, 90, 135],
  ["raptors", "Corbins", 7000, 5400, 90, 135],
  ["red", "Buff rouge", 7780, 4050, 90, 300],
  ["krugs", "Golems", 8400, 2700, 90, 135],
];
const CAMPS: Camp[] = [
  ...BLUE_CAMPS.map(([key, name, x, y, spawn, respawn]) => ({ key: `b-${key}`, name, side: 100, pos: { x, y }, spawn, respawn })),
  ...BLUE_CAMPS.map(([key, name, x, y, spawn, respawn]) => ({ key: `r-${key}`, name, side: 200, pos: mirror({ x, y }), spawn, respawn })),
  { key: "scuttle-top", name: "Carapateur du haut", side: 0, pos: { x: 4400, y: 9650 }, spawn: 210, respawn: 150 },
  { key: "scuttle-bot", name: "Carapateur du bas", side: 0, pos: { x: 10450, y: 5200 }, spawn: 210, respawn: 150 },
];

/* ---------- Couloirs de la carte ---------- */

// Moitié bleue (base en bas à gauche). La moitié rouge est son symétrique par rapport au centre.
const HALF: Record<string, [number, number]> = {
  fountain: [560, 580],
  nexus: [1750, 1750],
  // Voie du haut
  top1: [1250, 4300],
  top2: [1350, 6700],
  top3: [1100, 10300],
  topCorner: [2000, 12850],
  // Voie du bas
  bot1: [4300, 1250],
  bot2: [6900, 1450],
  bot3: [10400, 1100],
  botCorner: [12850, 2000],
  // Voie du milieu
  mid1: [3600, 3700],
  mid2: [4900, 4900],
  mid3: [5850, 6350],
  // Jungle côté buff bleu
  gateTop: [2600, 5300],
  wolves: [3780, 6480],
  blue: [3800, 7900],
  gromp: [2150, 8400],
  blueTri: [2350, 10600],
  blueRiver: [4700, 8850],
  wolvesMid: [4750, 6200],
  // Jungle côté buff rouge
  gateBot: [5300, 2700],
  raptors: [7000, 5400],
  raptorsMid: [6500, 6000],
  red: [7780, 4050],
  krugs: [8400, 2700],
  krugsLane: [8500, 1750],
  redRiver: [9150, 4700],
  botTri: [10600, 3000],
};
const CENTER: Record<string, [number, number]> = {
  center: [7435, 7435],
  riverTopMouth: [2950, 11500],
  scuttleTop: [4400, 9650],
  baron: [5000, 10450],
  riverTopMid: [5950, 8700],
  riverBotMid: [8900, 6150],
  scuttleBot: [10450, 5200],
  dragon: [9850, 4400],
  riverBotMouth: [11900, 3400],
};
const HALF_EDGES: [string, string][] = [
  ["fountain", "nexus"],
  ["nexus", "top1"],
  ["nexus", "bot1"],
  ["nexus", "mid1"],
  ["top1", "top2"],
  ["top2", "top3"],
  ["top3", "topCorner"],
  ["bot1", "bot2"],
  ["bot2", "bot3"],
  ["bot3", "botCorner"],
  ["mid1", "mid2"],
  ["mid2", "mid3"],
  ["top1", "gateTop"],
  ["mid1", "gateTop"],
  ["gateTop", "wolves"],
  ["wolves", "blue"],
  ["wolves", "wolvesMid"],
  ["wolvesMid", "mid2"],
  ["wolvesMid", "mid3"],
  ["blue", "gromp"],
  ["gromp", "top2"],
  ["gromp", "blueTri"],
  ["blueTri", "top3"],
  ["blue", "blueRiver"],
  ["mid1", "gateBot"],
  ["bot1", "gateBot"],
  ["gateBot", "red"],
  ["gateBot", "krugs"],
  ["red", "krugs"],
  ["red", "raptors"],
  ["raptors", "raptorsMid"],
  ["raptorsMid", "mid3"],
  ["raptorsMid", "mid2"],
  ["krugs", "krugsLane"],
  ["krugsLane", "bot2"],
  ["krugsLane", "bot3"],
  ["red", "redRiver"],
  ["krugs", "botTri"],
  ["botTri", "bot3"],
];
// Liens entre une moitié et la rivière. « b: » = moitié bleue, « r: » = moitié rouge.
const CROSS_EDGES: [string, string][] = [
  ["b:mid3", "center"],
  ["r:mid3", "center"],
  ["center", "riverTopMid"],
  ["center", "riverBotMid"],
  ["riverTopMid", "scuttleTop"],
  ["scuttleTop", "baron"],
  ["scuttleTop", "riverTopMouth"],
  ["baron", "riverTopMouth"],
  ["riverBotMid", "scuttleBot"],
  ["scuttleBot", "dragon"],
  ["scuttleBot", "riverBotMouth"],
  ["dragon", "riverBotMouth"],
  // Moitié bleue vers la rivière
  ["b:blueRiver", "scuttleTop"],
  ["b:blueRiver", "riverTopMid"],
  ["b:blueTri", "riverTopMouth"],
  ["b:top3", "riverTopMouth"],
  ["b:redRiver", "scuttleBot"],
  ["b:redRiver", "dragon"],
  ["b:redRiver", "riverBotMid"],
  ["b:botTri", "riverBotMouth"],
  ["b:botCorner", "riverBotMouth"],
  ["b:raptorsMid", "riverBotMid"],
  // Moitié rouge vers la rivière (symétrique : son buff bleu donne sur la rivière du bas)
  ["r:blueRiver", "scuttleBot"],
  ["r:blueRiver", "riverBotMid"],
  ["r:blueTri", "riverBotMouth"],
  ["r:top3", "riverBotMouth"],
  ["r:redRiver", "scuttleTop"],
  ["r:redRiver", "baron"],
  ["r:redRiver", "riverTopMid"],
  ["r:botTri", "riverTopMouth"],
  ["r:botCorner", "riverTopMouth"],
  ["r:raptorsMid", "riverTopMid"],
  // Les voies se rejoignent dans les coins
  ["b:topCorner", "r:botCorner"],
  ["b:botCorner", "r:topCorner"],
  ["b:topCorner", "riverTopMouth"],
];

const NODES: Point[] = [];
const INDEX = new Map<string, number>();
const LINKS: [number, number][][] = [];
const addNode = (name: string, p: Point) => {
  INDEX.set(name, NODES.length);
  NODES.push(p);
  LINKS.push([]);
};
const link = (a: string, b: string) => {
  const i = INDEX.get(a);
  const j = INDEX.get(b);
  if (i === undefined || j === undefined) return;
  const d = dist(NODES[i], NODES[j]);
  LINKS[i].push([j, d]);
  LINKS[j].push([i, d]);
};
for (const [name, [x, y]] of Object.entries(HALF)) {
  addNode(`b:${name}`, { x, y });
  addNode(`r:${name}`, mirror({ x, y }));
}
for (const [name, [x, y]] of Object.entries(CENTER)) addNode(name, { x, y });
for (const [a, b] of HALF_EDGES) {
  link(`b:${a}`, `b:${b}`);
  link(`r:${a}`, `r:${b}`);
}
for (const [a, b] of CROSS_EDGES) link(a, b);

const nearestNode = (p: Point) => {
  let best = 0;
  for (let i = 1; i < NODES.length; i++) if (dist(NODES[i], p) < dist(NODES[best], p)) best = i;
  return best;
};

/** Plus court chemin entre deux nœuds (Dijkstra, le graphe fait une centaine de nœuds). */
function nodePath(from: number, to: number): number[] {
  const cost = NODES.map(() => Infinity);
  const prev = NODES.map(() => -1);
  const done = NODES.map(() => false);
  cost[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < NODES.length; i++) if (!done[i] && (u < 0 || cost[i] < cost[u])) u = i;
    if (u < 0 || cost[u] === Infinity || u === to) break;
    done[u] = true;
    for (const [v, d] of LINKS[u])
      if (cost[u] + d < cost[v]) {
        cost[v] = cost[u] + d;
        prev[v] = u;
      }
  }
  const path: number[] = [];
  for (let u = to; u >= 0; u = prev[u]) path.unshift(u);
  return path[0] === from ? path : [from, to];
}

/** Chemin de a à b en suivant les couloirs. Deux points proches sont reliés en ligne droite. */
export function route(a: Point, b: Point): Point[] {
  const direct = dist(a, b);
  if (direct < 2300) return [a, b];
  const pts = [a, ...nodePath(nearestNode(a), nearestNode(b)).map((i) => NODES[i]), b];
  // On retire les allers-retours aux extrémités : inutile de reculer jusqu'à un nœud pour repartir dans l'autre sens.
  while (pts.length > 2 && dist(pts[0], pts[2]) < dist(pts[0], pts[1]) + dist(pts[1], pts[2]) * 0.55) pts.splice(1, 1);
  while (pts.length > 2 && dist(pts[pts.length - 1], pts[pts.length - 3]) < dist(pts[pts.length - 1], pts[pts.length - 2]) + dist(pts[pts.length - 2], pts[pts.length - 3]) * 0.55) pts.splice(pts.length - 2, 1);
  const length = pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
  // Un détour énorme veut dire que le graphe ne connaît pas ce passage : on préfère la ligne droite.
  return length > direct * 2.2 + 1500 ? [a, b] : pts;
}

/* ---------- Points connus ---------- */

interface Anchor extends Point {
  t: number;
  kind: "frame" | "event" | "base" | "death" | "respawn";
}

const DEATH_TIMER = [10, 10, 12, 12, 14, 16, 20, 25, 28, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50, 52.5];
const around = (p: Point, id: number): Point => ({ x: p.x + Math.cos(id * 0.63) * 280, y: p.y + Math.sin(id * 0.63) * 280 });

function anchorsOf(timeline: Timeline, players: GamePlayer[]): Map<number, Anchor[]> {
  const all = new Map<number, Anchor[]>(players.map((p) => [p.id, []]));
  const team = new Map(players.map((p) => [p.id, p.teamId]));
  const push = (id: number | undefined, a: Anchor) => {
    if (id && all.has(id)) all.get(id)!.push(a);
  };
  const levelAt = (id: number, ms: number) => {
    let level = 1;
    for (const f of timeline.frames) {
      if (f.timestamp > ms) break;
      level = f.participantFrames?.[String(id)]?.level ?? level;
    }
    return level;
  };
  timeline.frames.forEach((f, i) => {
    const t = f.timestamp / 1000;
    for (const pf of Object.values(f.participantFrames ?? {})) {
      const home = FOUNTAIN[team.get(pf.participantId) ?? 100];
      if (i === 0) push(pf.participantId, { t: 0, ...home, kind: "frame" });
      else if (pf.position) push(pf.participantId, { t, x: pf.position.x, y: pf.position.y, kind: "frame" });
    }
    for (const e of f.events ?? []) {
      const et = e.timestamp / 1000;
      if (e.type === "CHAMPION_KILL" && e.position) {
        if (e.victimId) {
          const home = FOUNTAIN[team.get(e.victimId) ?? 100];
          const minutes = et / 60;
          // Le délai de réapparition s'allonge avec le niveau, puis avec la durée de la partie.
          const timer = DEATH_TIMER[Math.min(17, Math.max(0, levelAt(e.victimId, e.timestamp) - 1))] * (1 + Math.max(0, Math.min(0.5, (minutes - 15) * 0.02)));
          push(e.victimId, { t: et, ...e.position, kind: "death" });
          push(e.victimId, { t: et + timer, ...home, kind: "respawn" });
        }
        push(e.killerId, { t: et, ...around(e.position, e.killerId ?? 0), kind: "event" });
        for (const id of e.assistingParticipantIds ?? []) push(id, { t: et, ...around(e.position, id), kind: "event" });
      } else if ((e.type === "ELITE_MONSTER_KILL" || e.type === "BUILDING_KILL") && e.position) {
        push(e.killerId, { t: et, ...around(e.position, e.killerId ?? 0), kind: "event" });
        if (e.type === "ELITE_MONSTER_KILL") for (const id of e.assistingParticipantIds ?? []) push(id, { t: et, ...around(e.position, id), kind: "event" });
      } else if (e.type === "ITEM_PURCHASED") {
        const id = (e as TimelineEvent & { participantId?: number }).participantId;
        if (id && et > 20) push(id, { t: et, ...FOUNTAIN[team.get(id) ?? 100], kind: "base" });
      }
    }
  });
  for (const [id, list] of all) {
    list.sort((a, b) => a.t - b.t);
    const out: Anchor[] = [];
    let deadUntil = -1;
    for (const a of list) {
      const last = out[out.length - 1];
      // Mort : rien ne bouge jusqu'à la réapparition (achats et positions de la minute compris).
      if (a.t < deadUntil && a.kind !== "respawn") continue;
      if (a.kind === "death") deadUntil = list.find((b) => b.kind === "respawn" && b.t > a.t)?.t ?? -1;
      if (a.kind === "respawn") deadUntil = -1;
      if (last && a.t - last.t < 0.5) {
        // Deux points au même instant : on garde le plus précis (un événement plutôt que la position de la minute).
        if (last.kind === "frame" && a.kind !== "frame") out[out.length - 1] = a;
        continue;
      }
      out.push(a);
    }
    all.set(id, out);
  }
  return all;
}

/* ---------- Camps tués dans la minute ---------- */

function permutations<T>(items: T[], n: number): T[][] {
  if (n === 0) return [[]];
  const out: T[][] = [];
  items.forEach((item, i) => {
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)], n - 1)) out.push([item, ...rest]);
  });
  return out;
}

/* ---------- Assemblage ---------- */

export function buildPathing(timeline: Timeline, players: GamePlayer[]): Pathing {
  const anchors = anchorsOf(timeline, players);
  const frames = timeline.frames;
  const jungleAt = (id: number, i: number) => frames[Math.min(i, frames.length - 1)]?.participantFrames?.[String(id)]?.jungleMinionsKilled ?? 0;
  const junglers = [100, 200]
    .map((teamId) => {
      const team = players.filter((p) => p.teamId === teamId);
      const at = Math.min(10, frames.length - 1);
      return team.sort((a, b) => jungleAt(b.id, at) - jungleAt(a.id, at))[0]?.id;
    })
    .filter((id): id is number => !!id && jungleAt(id, Math.min(10, frames.length - 1)) > 0);

  // Camps à glisser dans chaque intervalle entre deux points connus, par joueur.
  const inserted = new Map<number, Map<number, Camp[]>>(players.map((p) => [p.id, new Map()]));
  const aliveAt = new Map(CAMPS.map((c) => [c.key, c.spawn]));
  const kills: CampKill[] = [];
  for (let i = 1; i < frames.length; i++) {
    const from = frames[i - 1].timestamp / 1000;
    const to = frames[i].timestamp / 1000;
    // Les junglers d'abord : ce sont eux qui prennent les camps, les autres se servent dans ce qui reste.
    const order = [...players].sort((a, b) => Number(junglers.includes(b.id)) - Number(junglers.includes(a.id)));
    for (const p of order) {
      const n = Math.min(4, Math.round((jungleAt(p.id, i) - jungleAt(p.id, i - 1)) / 4));
      if (n <= 0) continue;
      const list = anchors.get(p.id) ?? [];
      const gaps: number[] = [];
      list.forEach((a, k) => {
        const b = list[k + 1];
        if (b && a.t >= from - 0.5 && b.t <= to + 0.5 && a.kind !== "death") gaps.push(k);
      });
      if (!gaps.length) continue;
      const open = CAMPS.filter((c) => (aliveAt.get(c.key) ?? 0) <= to - 5);
      if (open.length < n) continue;
      let best: { gap: number; camps: Camp[]; cost: number } | null = null;
      for (const gap of gaps) {
        const a = list[gap];
        const b = list[gap + 1];
        // Un rappel ou une réapparition : on ne revient pas à pied, seul l'aller compte.
        const jumpEnd = b.kind === "base" || b.kind === "respawn";
        const near = open.filter((c) => dist(c.pos, a) < 9000).sort((x, y) => dist(x.pos, a) + (jumpEnd ? 0 : dist(x.pos, b)) - dist(y.pos, a) - (jumpEnd ? 0 : dist(y.pos, b))).slice(0, 7);
        if (near.length < n) continue;
        for (const camps of permutations(near, n)) {
          let length = dist(a, camps[0].pos);
          for (let k = 1; k < camps.length; k++) length += dist(camps[k - 1].pos, camps[k].pos);
          if (!jumpEnd) length += dist(camps[camps.length - 1].pos, b);
          // Trop loin pour le temps disponible : on pénalise sans interdire (la position de la minute peut être imprécise).
          const time = b.t - a.t;
          const need = length / SPEED + n * 6;
          const cost = length + Math.max(0, need - time) * 900 + (camps.some((c) => (aliveAt.get(c.key) ?? 0) > a.t + time / 2) ? 1500 : 0);
          if (!best || cost < best.cost) best = { gap, camps, cost };
        }
      }
      if (!best) continue;
      inserted.get(p.id)!.set(best.gap, [...(inserted.get(p.id)!.get(best.gap) ?? []), ...best.camps]);
      const a = list[best.gap];
      const b = list[best.gap + 1];
      best.camps.forEach((c, k) => {
        const t = a.t + ((b.t - a.t) * (k + 1)) / (n + 1);
        aliveAt.set(c.key, t + c.respawn);
        kills.push({ t, player: p.id, camp: c.name, side: c.side, pos: c.pos });
      });
    }
  }

  const tracks = new Map<number, Sample[]>();
  for (const p of players) {
    const list = anchors.get(p.id) ?? [];
    const out: Sample[] = [];
    if (list.length) out.push({ t: list[0].t, x: list[0].x, y: list[0].y });
    for (let k = 0; k + 1 < list.length; k++) {
      const a = list[k];
      const b = list[k + 1];
      const camps = inserted.get(p.id)?.get(k) ?? [];
      const time = b.t - a.t;
      const home = FOUNTAIN[p.teamId];
      if (a.kind === "death") {
        // Mort sur place, puis réapparition à la fontaine.
        out.push({ t: b.t - 0.05, x: a.x, y: a.y }, { t: b.t, x: b.x, y: b.y, jump: true });
        continue;
      }
      const stops = [a as Point, ...camps.map((c) => c.pos)];
      let recall = (b.kind === "base" && dist(a, home) > 3200) || b.kind === "respawn";
      if (!recall) stops.push(b);
      // Marche d'arrêt en arrêt, en suivant les couloirs.
      const legs: Point[][] = stops.slice(1).map((s, i) => route(stops[i], s));
      let length = legs.reduce((s, leg) => s + leg.slice(1).reduce((x, q, i) => x + dist(leg[i], q), 0), 0);
      // Distance impossible à pied dans le temps imparti : c'est un rappel ou une téléportation.
      if (!recall && !camps.length && length / Math.max(time, 1) > 760) {
        recall = true;
        legs.length = 0;
        length = 0;
      }
      const hop = recall ? Math.min(8, time * 0.3) : 0;
      const walkable = time - hop;
      const travel = Math.min(walkable, length / SPEED);
      const spare = walkable - travel;
      const dwell = camps.length ? Math.min(spare / camps.length, 22) : 0;
      // Le temps qui reste : le joueur traîne en route (voie, vision, attente), on ralentit donc la marche.
      const moving = walkable - dwell * camps.length;
      let t = a.t;
      legs.forEach((leg, i) => {
        for (let j = 1; j < leg.length; j++) {
          t += length > 0 ? (dist(leg[j - 1], leg[j]) / length) * moving : 0;
          out.push({ t, x: leg[j].x, y: leg[j].y });
        }
        if (i < camps.length) {
          t += dwell;
          out.push({ t, x: leg[leg.length - 1].x, y: leg[leg.length - 1].y });
          const kill = kills.find((c) => c.player === p.id && c.pos === camps[i].pos && c.t >= a.t - 0.5 && c.t <= b.t + 0.5);
          // Un camp ne peut pas tomber avant sa première apparition.
          if (kill) kill.t = Math.max(t, camps[i].spawn + 8);
        }
      });
      if (recall) {
        const lastPoint = out[out.length - 1];
        out.push({ t: b.t - 0.05, x: lastPoint.x, y: lastPoint.y }, { t: b.t, x: b.x, y: b.y, jump: true });
      } else if (out[out.length - 1].t < b.t - 0.01) out.push({ t: b.t, x: b.x, y: b.y });
    }
    tracks.set(p.id, out);
  }
  kills.sort((a, b) => a.t - b.t);
  return { tracks, camps: kills, junglers };
}

/** Position d'un joueur à l'instant t sur son trajet reconstitué. */
export function positionAt(samples: Sample[], t: number): Point | null {
  if (!samples.length) return null;
  if (t <= samples[0].t) return samples[0];
  let lo = 0;
  let hi = samples.length - 1;
  if (t >= samples[hi].t) return samples[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  if (b.jump) return a;
  const f = (t - a.t) / (b.t - a.t || 1);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
