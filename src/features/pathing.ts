import type { Point, Timeline, TimelineEvent } from "../lib/types";
import type { GamePlayer } from "./game";
import { findPath } from "./navgrid";

/**
 * Trajets reconstitués. Riot ne donne qu'une position par joueur et par minute : entre deux positions connues,
 * on fait passer le joueur par les couloirs de la carte au lieu de couper à travers les murs, et on recale le
 * trajet sur tout ce que la timeline date à la seconde : kills et aides, objectifs, tours, achats (le joueur est
 * à la base), morts et réapparitions. La chronologie du client ne contient pas les achats : une baisse de l'or en
 * poche d'une minute à l'autre trahit alors le passage à la base.
 * Les camps de jungle sont déduits du compteur de monstres : un camp vaut 4 (carapateur compris), une larve du
 * Néant 2, un dragon, le Héraut ou Nashor 4. On retire les monstres épiques, on arrondit le cumul au camp le plus
 * proche (un camp à cheval sur deux minutes ne fausse rien) et on retient l'enchaînement de camps encore en vie
 * qui rallonge le moins le trajet, en évitant la jungle adverse sans indice.
 * Valeurs vérifiées sur 150 parties classées : 3 camps à 2:00, 6 (clear complet) à 3:00, carapateur ensuite.
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
/** Point d'apparition moyen observé à 0:00 (960 joueurs par côté). */
const FOUNTAIN: Record<number, Point> = { 100: { x: 420, y: 420 }, 200: { x: 14300, y: 14390 } };
/**
 * Vitesse de marche selon le moment de la partie, d'après la vitesse relevée par Riot (médiane : 340 à 3 min,
 * 370 à 10 min, 390 à 15 min). Les chronologies de l'API Riot donnent la vraie valeur, utilisée quand elle existe.
 */
const speedAt = (t: number) => Math.min(420, 330 + (t / 60) * 4);
/** Temps passé sur un camp : plus long au premier clear, quand le jungler est bas niveau. */
const clearTime = (t: number) => (t < 300 ? TUNE.clearEarly : t < 900 ? TUNE.clearMid : TUNE.clearLate);
/** Monstres épiques comptés dans jungleMinionsKilled, à retirer avant de compter les camps. */
const EPIC_CS: Record<string, number> = { HORDE: 2, DRAGON: 4, RIFTHERALD: 4, BARON_NASHOR: 4, ATAKHAN: 4 };

/** Réglages étalonnés sur l'archive (scripts/pathing-eval.mjs). */
export const TUNE = { baseRadius: 3500, outing: 40, firstPrior: 1000, firstWindow: 270, firstExtra: 6, countWeight: 1500, waitStart: 0, detour: 1.15, late: 900, seen: 1200, clearEarly: 14, clearMid: 9, clearLate: 6 };

/* ---------- Camps ---------- */

interface Camp {
  key: string;
  name: string;
  side: number;
  pos: Point;
  spawn: number;
  respawn: number;
}

// Apparition à 1:00 : les junglers ont déjà 3 camps à 2:00 et 6 à 3:00. Positions recalées sur l'endroit où les
// junglers sont vus à la minute pile (médiane de 4 992 positions de junglers entre 2 et 14 minutes).
const BLUE_CAMPS: [string, string, number, number, number, number][] = [
  ["blue", "Buff bleu", 3750, 7950, 60, 300],
  ["gromp", "Gromp", 2200, 8400, 60, 135],
  ["wolves", "Loups", 3720, 6500, 60, 135],
  ["raptors", "Corbins", 6980, 5200, 60, 135],
  ["red", "Buff rouge", 7700, 3880, 60, 300],
  ["krugs", "Golems", 8370, 2560, 60, 135],
];
const CAMPS: Camp[] = [
  ...BLUE_CAMPS.map(([key, name, x, y, spawn, respawn]) => ({ key: `b-${key}`, name, side: 100, pos: { x, y }, spawn, respawn })),
  ...BLUE_CAMPS.map(([key, name, x, y, spawn, respawn]) => ({ key: `r-${key}`, name, side: 200, pos: mirror({ x, y }), spawn, respawn })),
  { key: "scuttle-top", name: "Carapateur du haut", side: 0, pos: { x: 4550, y: 9550 }, spawn: 210, respawn: 150 },
  { key: "scuttle-bot", name: "Carapateur du bas", side: 0, pos: { x: 10300, y: 5150 }, spawn: 210, respawn: 150 },
];

/* ---------- Chemins ---------- */

/** Chemin de a à b qui contourne les murs (grille de navigation tirée de la minimap, voir navgrid.ts). */
export const route = (a: Point, b: Point): Point[] => findPath(a, b);

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
          const timer = DEATH_TIMER[Math.min(17, Math.max(0, levelAt(e.victimId, e.timestamp) - 1))] * (1 + Math.max(0, Math.min(0.5, (minutes - 15) * 0.01)));
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
  // Chronologie du client : pas d'achats, mais l'or en poche baisse quand le joueur dépense. Sur 150 parties de
  // l'API Riot, une dépense de plus de 250 po dans la minute correspond à un achat 93 % du temps.
  const hasPurchases = timeline.frames.some((f) => f.events?.some((e) => e.type === "ITEM_PURCHASED"));
  if (!hasPurchases)
    for (let i = 2; i < timeline.frames.length; i++) {
      const before = timeline.frames[i - 1];
      const now = timeline.frames[i];
      for (const p of players) {
        const a = before.participantFrames?.[String(p.id)];
        const b = now.participantFrames?.[String(p.id)];
        if (a?.currentGold === undefined || b?.currentGold === undefined) continue;
        const spent = a.currentGold + (b.totalGold - a.totalGold) - b.currentGold;
        if (spent <= 50) continue;
        const from = before.timestamp / 1000;
        const to = now.timestamp / 1000;
        const list = all.get(p.id)!;
        // Mort dans la minute : il a acheté en réapparaissant, la réapparition suffit.
        if (list.some((x) => (x.kind === "death" || x.kind === "respawn") && x.t > from && x.t <= to)) continue;
        // Il repart de la base juste à temps pour être vu à sa position de la minute.
        const home = FOUNTAIN[p.teamId];
        const next = b.position ?? home;
        const walk = dist(home, next) / speedAt(to);
        const t = Math.max(from + 12, Math.min(to - 3, to - walk - 6));
        list.push({ t, ...home, kind: "base" });
      }
    }
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

/* ---------- Premier clear ---------- */

/** Valeur d'une suite par minute (indice = frame) interpolée à l'instant t. */
function atTime(frames: Timeline["frames"], values: number[], t: number) {
  let i = 1;
  while (i < frames.length - 1 && frames[i].timestamp / 1000 < t) i++;
  const t0 = frames[i - 1].timestamp / 1000;
  const t1 = frames[i].timestamp / 1000;
  const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1)));
  return values[i - 1] + (values[i] - values[i - 1]) * f;
}

/**
 * Premier camp des junglers, compté sur 97 parties classées (camp le plus proche de leur position à 1:00). Les deux
 * côtés partent surtout du haut de la carte : buff bleu côté bleu, buff rouge côté rouge, ou corbins.
 */
const FIRST_CAMP: Record<number, Record<string, number>> = {
  100: { blue: 51, raptors: 23, red: 9, krugs: 1 },
  200: { red: 39, raptors: 36, blue: 9, wolves: 1 },
};

/**
 * Premier clear d'un jungler, de la fontaine jusqu'au premier retour (ou à la fin de la fenêtre) : tous les
 * enchaînements de camps de son côté sont simulés (marche, apparition à 1:00, combat), et on garde celui dont les
 * positions et le compteur de camps collent le mieux à ce que la chronologie montre.
 */
function firstClear(teamId: number, list: Anchor[], frames: Timeline["frames"], camps: number[], speed: (t: number) => number) {
  const stop = list.find((a) => a.t > 5 && (a.kind === "base" || a.kind === "death" || a.kind === "respawn"))?.t ?? Infinity;
  const limit = Math.min(stop - 0.01, TUNE.firstWindow);
  let until = 0;
  for (const a of list) if (a.t > 0 && a.t <= limit) until = a.t;
  if (until < 90) return null;
  const n = Math.min(6, Math.round(atTime(frames, camps, until)));
  if (n <= 0) return null;
  const own = CAMPS.filter((c) => c.side === teamId);
  const home = FOUNTAIN[teamId];
  const checks = list.filter((a) => a.t > 0 && a.t <= until);
  const minutes = frames.map((f, i) => ({ t: f.timestamp / 1000, n: camps[i] })).filter((m) => m.t > 30 && m.t <= until + 0.5);
  let best: { camps: Camp[]; times: number[]; until: number; cost: number } | null = null;
  for (const order of permutations(own, n)) {
    // Arrêts successifs : arrivée sur le camp, puis fin du camp (le joueur ne bouge pas entre les deux).
    const stops: { t: number; p: Point }[] = [{ t: 0, p: home }];
    const times: number[] = [];
    let t = 0;
    let at = home;
    order.forEach((c, i) => {
      t += (dist(at, c.pos) * TUNE.detour) / speed(t);
      stops.push({ t, p: c.pos });
      t = Math.max(t, c.spawn) + clearTime(t) + (i === 0 ? TUNE.firstExtra : 0);
      stops.push({ t, p: c.pos });
      times.push(t);
      at = c.pos;
    });
    const posAt = (x: number): Point => {
      for (let k = 1; k < stops.length; k++)
        if (x <= stops[k].t) {
          const a = stops[k - 1];
          const b = stops[k];
          const f = (x - a.t) / (b.t - a.t || 1);
          return { x: a.p.x + (b.p.x - a.p.x) * f, y: a.p.y + (b.p.y - a.p.y) * f };
        }
      return at;
    };
    const counts = FIRST_CAMP[teamId] ?? {};
    const total = Object.values(counts).reduce((x, y) => x + y, 0) + own.length;
    let cost = -Math.log(((counts[order[0].key.slice(2)] ?? 0) + 1) / total) * TUNE.firstPrior;
    for (const a of checks) cost += dist(posAt(a.t), a);
    for (const m of minutes) cost += Math.abs(times.filter((x) => x <= m.t).length - m.n) * TUNE.countWeight;
    if (!best || cost < best.cost) best = { camps: order, times: times.map((x) => Math.min(x, until)), until, cost };
  }
  return best;
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

  // Monstres épiques déjà tués par chaque joueur à chaque minute, à retirer du compteur de monstres.
  const epicAt = (id: number, i: number) => {
    const until = frames[Math.min(i, frames.length - 1)]?.timestamp ?? 0;
    let cs = 0;
    for (const f of frames)
      for (const e of f.events ?? [])
        if (e.type === "ELITE_MONSTER_KILL" && e.killerId === id && e.timestamp <= until) cs += EPIC_CS[e.monsterType ?? ""] ?? 0;
    return cs;
  };
  // Vitesse du joueur à la minute i : la vraie valeur si la chronologie la donne, sinon la médiane observée.
  const speedOf = (id: number, t: number) => {
    const s = frames[Math.min(Math.round(t / 60), frames.length - 1)]?.participantFrames?.[String(id)]?.championStats?.movementSpeed;
    return s && s > 250 && s < 700 ? s : speedAt(t);
  };

  // Cumul de camps (non arrondi) à chaque minute, puis interpolé entre deux minutes.
  const raw = new Map(players.map((p) => [p.id, frames.map((_, i) => Math.max(0, (jungleAt(p.id, i) - epicAt(p.id, i)) / 4))]));
  const campsCum = (id: number, t: number) => atTime(frames, raw.get(id)!, t);

  // Durée d'un passage par des camps : marche (ligne droite rallongée des détours), attente de l'apparition, combat.
  const simulate = (id: number, a: Anchor, camps: Camp[], b: Point | null, alive: (c: Camp) => number) => {
    let t = a.t;
    let at: Point = a;
    const times: number[] = [];
    for (const c of camps) {
      t += (dist(at, c.pos) * TUNE.detour) / speedOf(id, t);
      t = Math.max(t, alive(c)) + clearTime(t);
      times.push(t);
      at = c.pos;
    }
    if (b) t += (dist(at, b) * TUNE.detour) / speedOf(id, t);
    return { end: t, times };
  };

  // Camps à glisser dans chaque intervalle entre deux points connus, par joueur, dans l'ordre chronologique.
  const inserted = new Map<number, Map<number, Camp[]>>(players.map((p) => [p.id, new Map()]));
  const aliveAt = new Map(CAMPS.map((c) => [c.key, c.spawn]));
  const kills: CampKill[] = [];
  // Premier clear des junglers : on essaie tous les enchaînements de camps de son côté et on garde celui qui colle le
  // mieux aux positions connues et au compteur de camps de chaque minute (voir firstClear).
  const firstDone = new Map<number, number>();
  for (const id of junglers) {
    const p = players.find((x) => x.id === id);
    const list = anchors.get(id) ?? [];
    if (!p || list.length < 2) continue;
    const pick = firstClear(p.teamId, list, frames, raw.get(id)!, (t) => speedOf(id, t));
    if (!pick) continue;
    firstDone.set(id, pick.until);
    pick.camps.forEach((c, i) => {
      const t = pick.times[i];
      const gap = list.findIndex((_, j) => j + 1 < list.length && t <= list[j + 1].t + 0.01);
      const at = gap >= 0 ? gap : 0;
      inserted.get(id)!.set(at, [...(inserted.get(id)!.get(at) ?? []), c]);
      aliveAt.set(c.key, t + c.respawn);
      kills.push({ t, player: id, camp: c.name, side: c.side, pos: c.pos });
    });
  }
  const work: { p: GamePlayer; k: number; n: number }[] = [];
  for (const p of players) {
    const list = anchors.get(p.id) ?? [];
    for (let k = 0; k + 1 < list.length; k++) {
      if (list[k].kind === "death" || list[k + 1].t <= (firstDone.get(p.id) ?? -1) + 0.01) continue;
      const n = Math.min(5, Math.round(campsCum(p.id, list[k + 1].t)) - Math.round(campsCum(p.id, list[k].t)));
      if (n > 0) work.push({ p, k, n });
    }
  }
  const startOf = (w: { p: GamePlayer; k: number }) => anchors.get(w.p.id)![w.k].t;
  // Les junglers d'abord à instant égal : ce sont eux qui prennent les camps, les autres se servent dans ce qui reste.
  work.sort((x, y) => startOf(x) - startOf(y) || Number(junglers.includes(y.p.id)) - Number(junglers.includes(x.p.id)));
  for (const { p, k, n } of work) {
    const list = anchors.get(p.id)!;
    const a = list[k];
    const b = list[k + 1];
    const open = CAMPS.filter((c) => (aliveAt.get(c.key) ?? 0) <= b.t - 5);
    if (open.length < n) continue;
    // Un rappel ou une réapparition : on ne revient pas à pied, seul l'aller compte.
    const jumpEnd = b.kind === "base" || b.kind === "respawn";
    const near = open.sort((x, y) => dist(x.pos, a) + (jumpEnd ? 0 : dist(x.pos, b)) - dist(y.pos, a) - (jumpEnd ? 0 : dist(y.pos, b))).slice(0, 7);
    if (near.length < n) continue;
    const alive = (c: Camp) => aliveAt.get(c.key) ?? 0;
    let best: { camps: Camp[]; cost: number; times: number[] } | null = null;
    for (const camps of permutations(near, n)) {
      let length = dist(a, camps[0].pos);
      for (let i = 1; i < camps.length; i++) length += dist(camps[i - 1].pos, camps[i].pos);
      if (!jumpEnd) length += dist(camps[camps.length - 1].pos, b);
      const { end, times } = simulate(p.id, a, camps, jumpEnd ? null : b, alive);
      // Trop long pour le temps disponible : on pénalise sans interdire (la position de la minute peut être imprécise).
      const late = Math.max(0, end - b.t);
      // Jungle adverse : seulement si le joueur y est vu au début ou à la fin de l'intervalle, presque jamais sinon.
      const invade = camps.reduce((s, c) => {
        if (c.side === 0 || c.side === p.teamId) return s;
        if (Math.min(dist(c.pos, a), dist(c.pos, b)) < 2200) return s + 300;
        return s + (a.t < 210 ? 8000 : 3000);
      }, 0);
      // Vu sur un camp à la minute pile : il est en train de le faire, ce camp clôt l'intervalle.
      const seen = !jumpEnd && open.some((c) => dist(c.pos, b) < 900) && dist(camps[camps.length - 1].pos, b) > 900 ? TUNE.seen : 0;
      const cost = length + late * TUNE.late + invade + seen;
      if (!best || cost < best.cost) best = { camps, cost, times };
    }
    if (!best) continue;
    inserted.get(p.id)!.set(k, best.camps);
    const chosen = best;
    chosen.camps.forEach((c, i) => {
      const t = Math.min(chosen.times[i], b.t);
      aliveAt.set(c.key, t + c.respawn);
      kills.push({ t, player: p.id, camp: c.name, side: c.side, pos: c.pos });
    });
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
      // Deux passages à la base espacés (achat, réapparition, position de la minute) : entre les deux, le joueur est
      // reparti jouer puis a fait un rappel. On l'envoie vers sa position connue la plus proche dans le temps.
      const inBase = (q: Point) => dist(q, home) < TUNE.baseRadius;
      if (!camps.length && !recall && inBase(a) && inBase(b) && time > TUNE.outing) {
        const before = [...list.slice(0, k)].reverse().find((x) => !inBase(x) && x.kind !== "death");
        const after = list.slice(k + 2).find((x) => !inBase(x) && x.kind !== "death");
        const spot = !before ? after : !after ? before : a.t - before.t <= after.t - b.t ? before : after;
        if (spot) {
          stops.push(spot);
          recall = true;
        }
      }
      if (!recall) stops.push(b);
      // Marche d'arrêt en arrêt, en contournant les murs.
      const legs: Point[][] = stops.slice(1).map((s, i) => route(stops[i], s));
      let length = legs.reduce((s, leg) => s + leg.slice(1).reduce((x, q, i) => x + dist(leg[i], q), 0), 0);
      // Distance impossible à pied dans le temps imparti : c'est un rappel ou une téléportation.
      if (!recall && !camps.length && length / Math.max(time, 1) > 760) {
        recall = true;
        legs.length = 0;
        length = 0;
      }
      const hop = recall ? Math.min(8, time * 0.3) : 0;
      const end = b.t - hop;
      const mine = camps.map((c) => kills.find((x) => x.player === p.id && x.pos === c.pos && x.t >= a.t - 0.5 && x.t <= b.t + 0.5));
      // Horaire naturel : marche à la vitesse du joueur, attente de l'apparition des camps, combat.
      const plan: { t: number; p: Point; kill?: CampKill }[] = [];
      let t = a.t;
      legs.forEach((leg, i) => {
        for (let j = 1; j < leg.length; j++) {
          t += dist(leg[j - 1], leg[j]) / speedOf(p.id, t);
          plan.push({ t, p: leg[j] });
        }
        if (i < camps.length) {
          const fight = clearTime(t);
          const kill = mine[i];
          // Le camp n'est pas forcément là à l'arrivée (première apparition, réapparition) : on l'attend.
          const ready = kill ? Math.min(kill.t, end) - fight : t;
          t = Math.max(t, ready) + fight;
          plan.push({ t, p: leg[leg.length - 1], kill });
        }
      });
      // Trop long : on accélère tout l'horaire. Trop court : le joueur attend (voie, vision), surtout à l'arrivée.
      const used = t - a.t;
      const room = end - a.t;
      const squeeze = used > room && used > 0 ? room / used : 1;
      const shift = Math.max(0, room - used) * TUNE.waitStart;
      if (shift > 0.5) out.push({ t: a.t + shift, x: a.x, y: a.y });
      for (const s of plan) {
        const at = a.t + shift + (s.t - a.t) * squeeze;
        out.push({ t: at, x: s.p.x, y: s.p.y });
        if (s.kill) s.kill.t = at;
      }
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
