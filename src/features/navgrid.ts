import type { Point } from "../lib/types";

/**
 * Grille de navigation de la Faille de l'invocateur, 256 × 256 cases de ~58 unités.
 * Provenance : minimap officielle Data Dragon (img/map/map11.png, 512 × 512, version 16.22.1), la même que le Replay
 * affiche. Sur cette image stylisée, les murs sont noirs et tout le reste (voies, jungle, rivière, bases) se parcourt :
 * une case est praticable si au moins la moitié de ses 2 × 2 pixels a une luminosité ≥ 40/255, et on ne garde que la
 * zone connexe principale. Calage image ↔ carte : l'image couvre les coordonnées [40, 14805] sur les deux axes
 * (réglage qui laisse le moins de positions réelles de joueurs sur un mur : 3,6 %, dont sauts de mur et morts).
 * Stockage : un bit par case (1 = praticable), lignes de bas (y = 0) en haut, base64.
 */
const GRID =
  "//9/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//38AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////////8HAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///////////w8AAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////////HwAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////////8/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///////////38AAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////////////////////////////AAAAAAAAAAD///////////////////////////////8/AAAAAAAAAP////////////////////////////////8BAAAAAAAA/////////////////////////////////w8AAAAAAAD/////////////////////////////////fwAAAAAAAP//////////////////////////////////AQAAAAAA//////////////////////////////////8HAAAAAAD//////////////////////////////////x8AeAAAAP//////////////////////////////////fwD+AwAA/v//////////////////////////////////gP8HAAD8///////////////////////////////////D/x8AAPD/////////////////////////////////////PwAAAP////////////////////////////////////8/AAAA/////////////////////////////////////38AAAD////////////////////////////////////nfwAAAP///////////////////////////////////8P/AAAA////////////////////////////////////w/8AAAD///////////////////////////////////+H/wAAAP//////////////hz8AAAB/AIA/AAD8/////w//AAAA//////////////+HPwAAAH8AwD8AAPz/////H/gAAAD//////////////4c/AAAAfwDgPwAA/vv///8//AAAAP//////////////hz8AAAD/AeAfAAD+8////3/+AAAA//////////////+HPwAAAP8/8A8AAP7j/////38AAAD//////////////4M/AADg///5DwAA/8P/////fwAAAP//////////////gz8AAPj///8HAMD/gf////8/AAAA//////////////+DPwAA/P///wPA//8B/////x8AAAD//////////////4N/AAD/////AeD//wH/////DwAAAP//////////////g38AgP////8D8P//AP7///8HAAAA//////////////8D/wDA//////////8A/v///wcAAAD//////////////wP/AeD/////////fwD8////DwAAAP//////////////A/4D8H/8//////9/APz///8PAAAA//////////////8D/A/8H/z//////z8A/P///x8AAAD//////////////wP4//8P+P//////PwD8////HwAAAP//////////////A/D//w/4f/z///8fAPz///8/AAAA//////////////8D4P//B/h/4P8//A8A+P///z8AAAD//////////////wHA//8H8D8A/wf8BwD4////fwAAAP//////////////AcD//wfgHwAAAP4DAPz///9/AAAA//////////////8B8P//B4AHAADg/wEA/v///38AAAD//////////////wH4//8HAAAAAP7/AAD//////wAAAP//////////////APz//w8AAADA//8AgP//////AAAA//////////////8A/P//DwAAAPD//wDg//////8AAAD//////////////wD+D/wfAAAA/P//AfD//////wEAAP//////////////AP8D+P//PwD+//8D+P//////AQAA/////////////38A/wD4////gP///w/8///x//8BAAD//////////////4B/APj////D///4P/7/f+D//wMAAP//////////////gz8A+P//////D/j///8/4P//AwAA//////////////+PPwD8//////8B8P///w/A//8DAAD///////////////8fAPz/////fwDw////B4D//wMAAP///////////////x8A/v/j//8/AOD///8DAP//BwAA////////////////D4D//4///w8AwP///wMA/v8HAAD///////////////8PwP//D///BwAA////AQD8/wcAAP/////////////v/w/g//8f/v8DAAD8//8BAPz/BwAA/////////////4f/D+D//z/8/wEAAID//wAA/P8HAAD/////////////A/4P8P//P/j/AQAAAP//AAD//wcAAP////////////8D/g/4//8/8P8ACAAA//8AwP//BwAA/////////////wH+D/jf/z/w/wB/AAD//wDw//8HAAD/////////////APwP+N//P+B/wP8BAP9/APj//w8AAP////////////8A/A/8j/8f4H/g/wOA/38A/P//DwAA////////////fwD8D/yP/x/wf/D/B4D/fwD///8PAAD///////////8/APwf/A//D/A/8P8PwP9/gP///w8AAP///////////x8A+B/8D/4H8D/4/w/g/3/A////DwAA////////////HwD4P/wH/AP4P/j/D+D/f8D///8PAAD///////////8fAPA//gdgAPA/+P8f8P//4P///w8AAP///////////z8A8H/+BwAA8D/4/x/4///zP/7/DwAA////////////fwDg//4PAADwP/j/H/j///8f/v8PAAD+////////////AcD//R8AAPAf+P8P/P///wf+/w8AAPz///////////8DwP//PwAA4B/4/w/+////A/7/DwAA+P///////////weA////AADgH/D/D/////8D/v8PAADw////////////DwD///8HAPAP8P+P/3/8/wH+/w8AAPD///////////8fAP7///8A/w/g////P/j/Af7/DwAA8P////////////8H/v//////B8D///8/+P8B/v8PAADw/////////////x/+w/////8HAP///z/4/wH+/w8AAPD/////////////P//h/////wMA/P//P/j/A/7/DwAA8P////////////////H/////AQDA//8f+P8D/v8PAADw////////n///////+P////8BAMD//x/4+wP+/w8AAPD///////8H///////4/////wAA4P//D/jzB/7/DwAA8P///////wP+////f/z///9/AAD4//8H+PMH/v8PAADw////////APj///8f/P///38AAP7//wP88wf+/w8AAPD//////z8A8P///w/8/4P//wDA////AfzxD/7/DwAA8P//////DwDg////A/z/g///Afj///8A/vEP/v8PAADw//////8BAMD///8B/P+D//8D////fwD+4Q/+/w8AAPD/////PwAAgP///wP4/4H///////8/AP/hD/7/DwAA8P////8PAAAA////B/j/gf///////w+A/+EP/v8PAADw/////w8AAAD+//8P8P+A////////B8D/4A/+/w8AAPD/////HwAAAPz//x/gf8D///////8B4P/gD/7/DwAA8P8/APAfAAAA/P//P4Af8P///////wDwf+AP/v8PAADw/z8A8B8AAAD8//9/AAD4//////8/APh/4D/+/w8AAPD/PwDgHwCAAP7///8AAP7/+////w8A/j/g////DwAA8P8/AOAfAPwf/////wEA/x/8////B4D/H+D///8PAADw/z8A4B8A////////A4D/A/////8B4P8P4P///w8AAPD/PwDwD8D///////8H4P/A////fwD8/w/g////DwAA8P8/APAP4P///////w/wP/D///9/AP//B+D///8PAADw/z8A+Af4H/8f/P//H/gf+P///3/w//8D4P///w8AAPD/PwD8A/wf/B/8//8//A/8/////////wHgP/7/DwAA8P8/APwB/j/wH/z////+B///////////AOB//v8PAADw/z8A/AH/f/Af+P////+D//////////8A4P/+/w8AAPD/PwD+AP//4D/4/////8H/////////fwDw//7/DwAA8P8/AP6A///AP/j/////4P//////////APD//v8PAADw/z8A/sD//8A/8P///3/w//////8/gP8A/P/+/w8AAPD/PwD+wP//wD/w////P/D////x/w/g/wH///7/DwAA8P8/AP7g///AP/D///8/+P////D/D/D//////v8PAADw/z8A/uD//8A/8P///z/8//9/8P8P+P///3/+/w8AAPD/PwD+8P//wH/w//////7//z/w/w/8////P/7/DwAA8P8/AP7w/3/Af/D/////////H/D/D/7//88f/v8PAADw/z8A/vD/P8B/8P////////8P+P8P/v//Bwb+/w8AAPD/PwD++O8fwD/4/////////wf4/w/+//8DAP7/DwAA8P8/AP74jwfgP/gP////////A/j/D/7//wMA//8PAADw/z8A/vkfAOA/+Af+//////8B+P8P/v//AcD//w8AAPD/PwD++T8A8D/8A/z//////wD4/w/8//8B8P//DwAA8P8/AP75fwD4P/wB+P////9/APj/D/z//wH4//8PAADw/z8A/P//Af4f/ADw/////z8A+P8P+P//Af7//w8AAPD/PwD+/////x9+APD/////HwD4/w/wh/8B////DwAA8P8/AP//////Dz4A8P////8fAPj/D4AB/sP///8PAADw/z+A//////8PPwDw/////x8A+P8fAAD85////w8AAPD/P8D//////48fAPD/////HwD4/38AAPz/P/7/DwAA8P8/4P//D/D/3x8A8P////8fAPj//wMA/v8P/v8PAADw/z/w/38AAP//HwDw/////x8A/P///////wf+/w8AAPD/P/7vPwAA+P8fAPD/////HwB8/P//////A/7/DwAA8P///8d/AADg/x8A8P////8fAH78//////8B/v8PAADw////g/+AB8D/DwDw/////x8AP/z//////wD+/w8AAPD///+B/+APwP8PAPj/////H4A//v////9/AP7/DwAA8P///wD/8x/A/w8A/P////8fwD/+fwD+/38A/v8PAADw//8/gP//P+D/DwD+/////z/gH/4/APyffwD+/w8AAPD//x+A//9/4P8PAP//////f/Af/h8A+J//AP7/DwAA8P//A4D//3/g/w/A////////+B/+DwDwn/8A/v8PAADw/38AwP//f+D/D+D/////////H/8HwOMf/wD+/w8AAPD/PwDA//9/4P8P8P////////8f/wfw7x//AP7/DwAA8P8/4OH//z/g/w/4//+f/////x//B/j/H/8B/v8PAADw/z/4////P/D/D/z//w//////H/8D/P8f/wH+/w8AAPD/P/z///8f8P8P////B/7///8f/wP+/x//Af7/DwAA8P8//v///wfw/4////8D/P///x/+A/7/D/8B/v8PAADw/z/+////Afj/z////wH4////H/4D/v8P/wH+/w8AAPD/P/8/gP8B/P//////APj///8f/gf+/w//AP7/DwAA8P8//x8A/oH//////38A/P///z/8B/7/D/8A/v8PAADw/z//DwD8////////PwD+////P/wH/v8H/wD+/w8AAPD/P/8PAPz///////8PgP////8/+A/+/wf/AP7/DwAA8P8//gcA/v///////wfA/////z/4D/z/g38A/v8PAADw/z/8BwD/////////A+B//P//f/gf+P/jfwD+/w8AAPD/P/gHgP//APz///8B8D/4//9/+H/w//E/AP7/DwAA8P8/8AeA/x8A+P///wD8H/D////5//P/+B8A/v8PAADw/z/gB8D/BwD8//9/AP4P4P///////3/8HwD+/w8AAPD/P+AP4P8BgP///x+A/wfA////////P/wPAP7/DwAA8P8/wA/w/wDg////H+D/A4D///////8f/A8A/v8PAADw/z/AD/B/APj///8f+P8BAP///////w/8DwD+/w8AAPD/P8Af+D8A/v//////fwAA/v//////A/wPAP7/DwAA8P8/gB/4H4D///////8/AAD4//8P+P8A/A8A/v8PAADw/z+AH/gfwP///////wfwAfD//z8ABgD4DwD+/w8AAPD/P4Af+B/w////////A/wH4P//fwAAAPg/AP7/DwAA8P9/gB/8D/j///////8D/g/A////AAAA8P////8PAADw//+AH/wP/P///////wP/H4D///8BAADw/////w8AAPD//8Mf/A/+////////A/8/AP///wMAAPz/////DwAA8P//xx/8D/////+B//+D/z8A/v//BwCA//////8PAADw///fH/yf////HwD//4P/P/D///8PAPD//////w8AAPD///8f/v////8DAP7/g/9//P///x8A/P//////DwAA8P///x/+/////wAA/P///z/+////PwD///////8PAADw////H/7///8/AAD8////P/7///9/wP///////w8AAPD/P/4f/v///w8AAP7///8////////w////////DwAA8P8/+B//////BwAA/////x////////n///////8PAADw/z/gH//8//8HAID/////n////////////////w8AAPD/P+D/f/z///8AgP////+P////////////////DwAA8P8/4P8//v///wPA/////49/4P////////////8PAADw/z/g/z/+////B+D/////z38A+P///////////w8AAPD/P+D/H/////8P4P8A/P//fwDw////////////DwAA8P8/4P8P///j/x/wPwDA//9/AMD///////////8PAADw/z/A/4////H/H/AfAAD+//8AgP///////////x8AAPD/P4D/h///8P8/8B8AAPj//wEA////////////PwAA8P8/AP/H/3/w/z/wHwAA8P//AQD+//////////9/AADw/z8A/sP/P/j/P/gfAADgP/8DAPz///////////8AAPD/PwD84f8/+P9/+B8AAMA//gcA+P///////////wAA8P8/AADg/x/4/z/4HwAO4D/+BwDw////////////AADw/z8AAPD/D/D/P/gfgH/gP/4PAPD///////////8AAPD/PwAA8P8H8P8/+A/A/+A//A8A8P///////////wAA8P8/AAD4/wfw/z/4D+D/4R/8DwD4////////////AADw/z8AAPz/A+D/H/wP8P/jH/gfAPj///////////8AAPD/PwAA/P8DwP8P/A/w/+Mf+B8A/P///////////wAA8P9/AAD+/wGA/wf8D/j/8x/4HwD+////////////AADg/38AAP//AQD/A/4P+P/3D/gfAP7///////////8AAOD/fwCA//8BAPwA/g/4//8P8B8A/////////////wAA4P9/AOD//wEAAAD/D/j//w/wH4D/////////////AADg//8A8P//AQAAAP8f8P//B/B/wP////////////8AAOD//wD8//8fAACA/x/w//8H8P///////////////wAA4P//AP////8AAMD/P+D//wPw////////////////AADg///B/////wMA4P//wP//AfD///////////////8AAOD///n/////BwDw//+B//8A8P///////////////wAAwP////////8PAPj/////fwD4////////////////AADA/////////w8A/v////8/APjj//////////////8AAMD/////////H4D/h////x8A/MH//////////////wAAwP////////8f4P8D/v//DwD8Af//////////////AACA/////////x/8/wH4//8PAP4B/P////////////8AAID/////////////AMD//x+A/wD4/////////////wAAgP///////4f//z8AAPjzf+D/APz/////////////AAAA////////g///HwAAAPD//38A/P////////////8AAAD///////+B//8HAAAA8P//fwD8/////////////wAAAP///////4H//wEAAADw//8/APz/////////////AAAA/v//////wP8fAAAAAPD//x8A/v////////////8AAAD+/////3/A/wEAAOAH8P//DwD+/////////////wAAAP7/////f8B/AH4A8A/w//8HAP7/////////////AAAA/P////8/wD/4/wf4H/D//w8A/v////////////8AAAD8/////z/A3///H/wf8P//HwD//////////////wAAAPj/////H8D///9//B/w//8/AP//////////////AAAA+P////8fwP//////P/j//38A//////////////8AAADw/////w+A//////8f+B/+/wD//////////////wAAAPD/////D4D//////x/+H+D/Af//////////////AAAA4P////8HAP////////8PAP8D//////////////8AAADg/////wcA/v///////wcA/IP//////////////wAAAPD/////AwD8////////AwD4g///////////////AAAA+P////8DAPD///////8BAPiH//////////////8AAAD8/////wEAwP//////fwAA+If//////////////wAAAP7/////AQAA/n8A/v8fAAD4h///////////////AAAA/v////8AAADwfwDw/wEAAPiH//////////////8AAAB//////wEAAOB/AAD8AQAA+If//////////////wAAAD/+////AwAA4H8AAPgBAAD8g///////////////AAAAH/z///8PAADgfwAA+AMAAPyD//////////////8AAAD/8P///z8AAOB/AAD4AwAA/IP//////////////wAAAP/h/////w8A4P////4DAAD+g///////////////AAAA/+P///////////////////////////////////8AAAD/8////////////////////////////////////wAAAP7/////////////////////////////////////AAAA/v////////////////////////////////////8DAAD8/////////////////////////////////////x8AAPz/////////////////////////////////////fwAA+P/D////////////////////////////////////AADg/wH///////////////////////////////////8AAMB/AP7//////////////////////////////////wAAAB4A+P//////////////////////////////////AAAAAADg//////////////////////////////////8AAAAAAID//////////////////////////////////wAAAAAAAP7/////////////////////////////////AAAAAAAA8P////////////////////////////////8AAAAAAACA/////////////////////////////////wAAAAAAAAD8////////////////////////////////AAAAAAAAAAD///////////////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v///////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAPj///////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P///////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAADg////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAID///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+//8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/P//AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4//8=";

export const N = 256;
const LO = 40;
const HI = 14805;
const CELL = (HI - LO) / N;

const BITS: Uint8Array = (() => {
  const s = atob(GRID);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
})();

export const open = (gx: number, gy: number) => gx >= 0 && gy >= 0 && gx < N && gy < N && (BITS[(gy * N + gx) >> 3] & (1 << ((gy * N + gx) & 7))) !== 0;
const cellOf = (p: Point): [number, number] => [Math.max(0, Math.min(N - 1, Math.floor((p.x - LO) / CELL))), Math.max(0, Math.min(N - 1, Math.floor((p.y - LO) / CELL)))];
const centerOf = (gx: number, gy: number): Point => ({ x: LO + (gx + 0.5) * CELL, y: LO + (gy + 0.5) * CELL });

export const walkable = (p: Point) => {
  const [gx, gy] = cellOf(p);
  return open(gx, gy);
};

/** Case praticable la plus proche (recherche en anneaux), pour un point tombé dans un mur. */
function nearestOpen(gx: number, gy: number): [number, number] {
  if (open(gx, gy)) return [gx, gy];
  for (let r = 1; r < N; r++)
    for (let dx = -r; dx <= r; dx++)
      for (const dy of Math.abs(dx) === r ? Array.from({ length: 2 * r + 1 }, (_, i) => i - r) : [-r, r]) if (open(gx + dx, gy + dy)) return [gx + dx, gy + dy];
  return [gx, gy];
}

/** Ligne de vue entre deux cases : aucune case de mur traversée (parcours de toutes les cases touchées). */
function clear(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let x = ax;
  let y = ay;
  let err = dx - dy;
  for (let n = dx + dy; n >= 0; n--) {
    if (!open(x, y)) return false;
    const e2 = 2 * err;
    // Pas en diagonale décomposé en deux pas droits : on ne se faufile pas entre deux murs qui se touchent en coin.
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    } else {
      err += dx;
      y += sy;
    }
  }
  return true;
}

export const lineOfSight = (a: Point, b: Point) => {
  const [ax, ay] = cellOf(a);
  const [bx, by] = cellOf(b);
  return clear(ax, ay, bx, by);
};

/* ---------- A* ---------- */

const G = new Float32Array(N * N);
const SEEN = new Int32Array(N * N);
const PREV = new Int32Array(N * N);
const CLOSED = new Int32Array(N * N);
let stamp = 0;
const HEAP_I: number[] = [];
const HEAP_F: number[] = [];
const push = (i: number, f: number) => {
  let k = HEAP_I.length;
  HEAP_I.push(i);
  HEAP_F.push(f);
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (HEAP_F[p] <= f) break;
    HEAP_I[k] = HEAP_I[p];
    HEAP_F[k] = HEAP_F[p];
    k = p;
  }
  HEAP_I[k] = i;
  HEAP_F[k] = f;
};
const pop = () => {
  const top = HEAP_I[0];
  const li = HEAP_I.pop()!;
  const lf = HEAP_F.pop()!;
  if (HEAP_I.length) {
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= HEAP_I.length) break;
      if (c + 1 < HEAP_I.length && HEAP_F[c + 1] < HEAP_F[c]) c++;
      if (HEAP_F[c] >= lf) break;
      HEAP_I[k] = HEAP_I[c];
      HEAP_F[k] = HEAP_F[c];
      k = c;
    }
    HEAP_I[k] = li;
    HEAP_F[k] = lf;
  }
  return top;
};
const STEPS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

function astar(sx: number, sy: number, tx: number, ty: number): number[] | null {
  stamp++;
  HEAP_I.length = 0;
  HEAP_F.length = 0;
  const start = sy * N + sx;
  const goal = ty * N + tx;
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  G[start] = 0;
  SEEN[start] = stamp;
  PREV[start] = -1;
  push(start, h(sx, sy));
  while (HEAP_I.length) {
    const c = pop();
    if (CLOSED[c] === stamp) continue;
    CLOSED[c] = stamp;
    if (c === goal) {
      const path: number[] = [];
      for (let u = c; u >= 0; u = PREV[u]) path.push(u);
      return path.reverse();
    }
    const x = c % N;
    const y = (c / N) | 0;
    for (const [dx, dy, w] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!open(nx, ny)) continue;
      // Pas de diagonale qui rase un coin de mur.
      if (dx && dy && (!open(x + dx, y) || !open(x, y + dy))) continue;
      const j = ny * N + nx;
      if (CLOSED[j] === stamp) continue;
      const g = G[c] + w;
      if (SEEN[j] === stamp && g >= G[j]) continue;
      SEEN[j] = stamp;
      G[j] = g;
      PREV[j] = c;
      push(j, g + h(nx, ny));
    }
  }
  return null;
}

const cache = new Map<number, Point[]>();

/**
 * Chemin praticable de a à b : ligne droite si rien ne la coupe, sinon A* sur la grille puis lissage (on saute
 * chaque point intermédiaire tant que la ligne de vue le permet). Les extrémités sont gardées telles quelles.
 */
export function findPath(a: Point, b: Point): Point[] {
  const [ax0, ay0] = cellOf(a);
  const [bx0, by0] = cellOf(b);
  const [ax, ay] = nearestOpen(ax0, ay0);
  const [bx, by] = nearestOpen(bx0, by0);
  if (clear(ax, ay, bx, by)) return [a, b];
  const key = (ay * N + ax) * N * N + by * N + bx;
  let mid = cache.get(key);
  if (!mid) {
    const cells = astar(ax, ay, bx, by);
    if (!cells) return [a, b];
    const xy = cells.map((c) => [c % N, (c / N) | 0] as [number, number]);
    const kept: [number, number][] = [xy[0]];
    let i = 0;
    while (i < xy.length - 1) {
      let j = i + 1;
      while (j + 1 < xy.length && clear(xy[i][0], xy[i][1], xy[j + 1][0], xy[j + 1][1])) j++;
      kept.push(xy[j]);
      i = j;
    }
    mid = kept.slice(1, -1).map(([x, y]) => centerOf(x, y));
    if (cache.size > 20000) cache.clear();
    cache.set(key, mid);
  }
  return [a, ...mid, b];
}
