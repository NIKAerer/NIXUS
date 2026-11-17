// Mesure de la précision des trajets reconstitués (src/features/pathing.ts) sur l'archive locale.
// Pour chaque partie et chaque joueur, on cache la position des minutes impaires, on reconstruit le trajet sans
// elles et on mesure l'écart entre la position prédite à cette minute et la position réelle.
// Usage : node scripts/pathing-eval.mjs [dossier de l'archive] [--half=a|b] [--module=chemin/vers/pathing.ts]
// Aucune donnée n'est écrite : seuls des chiffres agrégés sont affichés.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

// Les imports relatifs de src/ n'ont pas d'extension (résolution « bundler ») : on ajoute .ts pour Node.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith(".") && !path.extname(spec)) {
      try {
        return next(spec + ".ts", ctx);
      } catch {}
    }
    return next(spec, ctx);
  },
});

const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const dir = args.find((a) => !a.startsWith("--")) ?? path.join(process.env.APPDATA ?? "", "com.nika.nexus", "archive");
const mod = await import(pathToFileURL(path.resolve(opt("module") ?? "src/features/pathing.ts")).href);
const half = opt("half");
// --tune='{"waitStart":0.5}' : surcharge des réglages exportés par le module (TUNE).
if (opt("tune") && mod.TUNE) Object.assign(mod.TUNE, JSON.parse(args.find((a) => a.startsWith("--tune=")).slice(7)));
const limit = Number(opt("limit") ?? 1e9);

const files = fs.readdirSync(path.join(dir, "timeline")).filter((f) => f.endsWith(".json")).sort().slice(0, limit);
const buckets = {};
const add = (key, v) => (buckets[key] ??= []).push(v);
let games = 0;
const t0 = Date.now();
for (const f of files) {
  const id = Number(f.replace(".json", ""));
  if (half === "a" && id % 2) continue;
  if (half === "b" && !(id % 2)) continue;
  const timeline = JSON.parse(fs.readFileSync(path.join(dir, "timeline", f), "utf8"));
  const gamePath = path.join(dir, "game", f);
  if (!fs.existsSync(gamePath) || timeline.frames.length < 6) continue;
  const game = JSON.parse(fs.readFileSync(gamePath, "utf8"));
  const players = game.participants.map((p) => ({ id: p.participantId, teamId: p.teamId, championId: p.championId }));
  const hidden = structuredClone(timeline);
  const truth = [];
  hidden.frames.forEach((fr, i) => {
    if (i % 2 === 0 || i >= hidden.frames.length - 1) return;
    for (const pf of Object.values(fr.participantFrames ?? {}))
      if (pf.position) {
        truth.push({ i, id: pf.participantId, t: fr.timestamp / 1000, pos: pf.position });
        delete pf.position;
      }
  });
  const pathing = mod.buildPathing(hidden, players);
  const source = timeline.frames.some((fr) => fr.events?.some((e) => e.type === "ITEM_PURCHASED")) ? "riot" : "client";
  games++;
  const posAt = (i, id) => timeline.frames[i]?.participantFrames?.[String(id)]?.position;
  for (const { i, id, t, pos } of truth) {
    const p = mod.positionAt(pathing.tracks.get(id) ?? [], t);
    if (!p) continue;
    const a = posAt(i - 1, id) ?? (i - 1 === 0 ? null : null);
    const b = posAt(i + 1, id);
    const ta = timeline.frames[i - 1].timestamp / 1000;
    const tb = timeline.frames[i + 1].timestamp / 1000;
    const role = pathing.junglers.includes(id) ? "jungle" : "lane";
    const span = t < 300 ? "0-5" : t < 900 ? "5-15" : "15+";
    const err = Math.hypot(p.x - pos.x, p.y - pos.y);
    add(`model|${role}|${span}`, err);
    add(`model|${role}|all`, err);
    add(`model|all|all`, err);
    add(`source|${source}|${role}`, err);
    if (process.env.EVAL_EXTRA && i <= 5) add(`min${i}|${role}`, err);
    if (process.env.EVAL_EXTRA) {
      const home = players.find((x) => x.id === id).teamId === 100 ? { x: 420, y: 420 } : { x: 14300, y: 14390 };
      const inBase = (q) => Math.hypot(q.x - home.x, q.y - home.y) < 4000;
      add(`where|${role}|vrai ${inBase(pos) ? "base" : "dehors"} / prédit ${inBase(p) ? "base" : "dehors"}`, err);
    }
    if (process.env.EVAL_DUMP && role === "jungle" && i === Number(process.env.EVAL_DUMP))
      console.log(f, id, "vrai", pos.x, pos.y, "prédit", Math.round(p.x), Math.round(p.y), "err", Math.round(err), "camps", [0, 1, 2, 3, 4].map((m) => timeline.frames[m]?.participantFrames?.[String(id)]?.jungleMinionsKilled).join("/"), "team", players.find((x) => x.id === id).teamId);
    if (a && b) {
      const k = (t - ta) / (tb - ta);
      const lin = Math.hypot(a.x + (b.x - a.x) * k - pos.x, a.y + (b.y - a.y) * k - pos.y);
      add(`line|${role}|${span}`, lin);
      add(`line|${role}|all`, lin);
      add(`line|all|all`, lin);
      if (process.env.EVAL_EXTRA) {
        add(`prev|${role}|${span}`, Math.hypot(a.x - pos.x, a.y - pos.y));
        add(`next|${role}|${span}`, Math.hypot(b.x - pos.x, b.y - pos.y));
      }
    }
  }
}
const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const stat = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, med: Math.round(q(s, 0.5)), mean: Math.round(s.reduce((x, y) => x + y, 0) / s.length), p90: Math.round(q(s, 0.9)) };
};
console.log(`${games} parties, ${((Date.now() - t0) / 1000).toFixed(1)} s${half ? ` (moitié ${half})` : ""}`);
const rows = [];
for (const role of ["jungle", "lane", "all"])
  for (const span of role === "all" ? ["all"] : ["0-5", "5-15", "15+", "all"]) {
    const m = buckets[`model|${role}|${span}`];
    const l = buckets[`line|${role}|${span}`];
    if (!m) continue;
    const sm = stat(m);
    const sl = l ? stat(l) : {};
    rows.push({ role, span, n: sm.n, med: sm.med, mean: sm.mean, p90: sm.p90, "ligne med": sl.med, "ligne mean": sl.mean, "ligne p90": sl.p90 });
  }
console.table(rows);
console.table(Object.keys(buckets).filter((k) => k.startsWith("source")).sort().map((k) => ({ k, ...stat(buckets[k]) })));
if (process.env.EVAL_EXTRA)
  console.table(Object.keys(buckets).filter((k) => /^(prev|next|min|where)/.test(k)).sort().map((k) => ({ k, ...stat(buckets[k]) })));
if (opt("json")) fs.writeFileSync(opt("json"), JSON.stringify(rows));
