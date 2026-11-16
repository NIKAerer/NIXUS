import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { mapImage, type StaticData } from "../lib/ddragon";
import { clock } from "../lib/lcu";
import type { Point, Timeline } from "../lib/types";
import { ChampIcon, Empty, Icon, cx, kilo } from "../ui";
import type { GamePlayer, Moment } from "./game";
import { MarkerImage, Replay, Schematic } from "./Replay";
import { buildStory, buildingName, objectiveName, type Chapter, type Story as StoryData } from "./chapters";

const SIZE = 15000;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${kilo(Math.abs(v))}`;

/** Le film de la partie : la courbe d'or découpée en chapitres, et la carte de chaque combat. */
export function Story({ timeline, players, myTeam, won, duration, assets }: { timeline: Timeline; players: GamePlayer[]; myTeam: number; won: boolean; duration: number; assets: StaticData | null }) {
  const story = useMemo(() => buildStory(timeline, players, myTeam, won), [timeline, players, myTeam, won]);
  const turning = story.chapters.findIndex((c) => c.tags.includes("Le tournant"));
  const [sel, setSel] = useState(Math.max(0, turning));
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const count = story.chapters.length;
  const chapter = story.chapters[Math.min(sel, count - 1)];

  // Flèches gauche et droite pour passer d'un chapitre à l'autre.
  useEffect(() => {
    if (replayAt !== null || count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      if (e.key === "ArrowRight") setSel((v) => Math.min(count - 1, v + 1));
      else if (e.key === "ArrowLeft") setSel((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replayAt, count]);

  if (replayAt !== null) {
    return (
      <div className="story">
        <button className="story-back" onClick={() => setReplayAt(null)}>
          <Icon name="back" size={15} /> Retour au film
        </button>
        <Replay timeline={timeline} players={players} duration={duration} assets={assets} start={replayAt} />
      </div>
    );
  }

  return (
    <div className="story">
      {chapter ? (
        <>
          <ol className="chapters" style={{ "--n": count } as CSSProperties}>
            {story.chapters.map((c, i) => (
              <li key={c.start}>
                <button className={cx("chapter", i === sel && "on")} aria-pressed={i === sel} onClick={() => setSel(i)}>
                  <span className="chapter-top">
                    <i>{i + 1}</i>
                    <time className="mono">{clock(c.start)}</time>
                    <b className={cx("mono", c.swing >= 0 ? "up" : "down")}>{signed(c.swing)}</b>
                  </span>
                  <b>{c.title}</b>
                  <small>{c.tags[0] ?? c.detail}</small>
                </button>
              </li>
            ))}
          </ol>
          <Scene chapter={chapter} index={sel} count={count} players={players} myTeam={myTeam} assets={assets} onStep={(d) => setSel(sel + d)} onReplay={() => setReplayAt(Math.max(0, chapter.start - 10))}>
            <Curve story={story} sel={sel} onSelect={setSel} />
          </Scene>
        </>
      ) : (
        <Empty title="Partie trop calme pour en tirer un film">Aucun combat ni objectif marquant. Le journal complet reste disponible ci-dessous.</Empty>
      )}
      <Journal story={story} players={players} myTeam={myTeam} onJump={(t) => setReplayAt(Math.max(0, t - 8))} onReplay={() => setReplayAt(0)} />
    </div>
  );
}

/* ---------- Courbe d'or, avec les chapitres posés dessus ---------- */

function Curve({ story, sel, onSelect }: { story: StoryData; sel: number; onSelect: (i: number) => void }) {
  const { curve, chapters } = story;
  if (curve.length < 2) return null;
  const W = 1000;
  const H = 120;
  const PAD = 16;
  const maxT = story.end || 1;
  const maxAbs = Math.max(1500, ...curve.map((p) => Math.abs(p.diff)));
  const x = (t: number) => (t / maxT) * W;
  const y = (v: number) => H / 2 - (v / maxAbs) * (H / 2 - PAD);
  const line = curve.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.diff).toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H / 2} L0 ${H / 2} Z`;
  const best = curve.reduce((m, p) => (p.diff > m.diff ? p : m), curve[0]);
  const worst = curve.reduce((m, p) => (p.diff < m.diff ? p : m), curve[0]);
  const last = curve[curve.length - 1];
  // Deux chapitres au même moment : on décale la seconde pastille pour qu'elles restent cliquables.
  const pins: number[] = [];
  chapters.forEach((c, i) => {
    const at = ((c.start + c.end) / 2 / maxT) * 100;
    pins.push(i && at - pins[i - 1] < 3.4 ? pins[i - 1] + 3.4 : at);
  });
  const ticks = Array.from({ length: Math.floor(maxT / 300) }, (_, i) => (i + 1) * 300).filter((t) => t < maxT - 90);

  return (
    <section className="curve">
      <div className="card-head">
        Avance en or de ton équipe
        <span>
          {best.diff > 0 && (
            <>
              meilleure avance <b className="up">+{kilo(best.diff)}</b> à {clock(best.t)} ·{" "}
            </>
          )}
          {worst.diff < 0 && (
            <>
              plus gros retard <b className="down">−{kilo(-worst.diff)}</b> à {clock(worst.t)} ·{" "}
            </>
          )}
          fin <b className={last.diff >= 0 ? "up" : "down"}>{signed(last.diff)}</b>
        </span>
      </div>
      <div className="curve-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Avance en or de ton équipe au fil de la partie">
          <defs>
            <clipPath id="curve-up">
              <rect width={W} height={H / 2} />
            </clipPath>
            <clipPath id="curve-down">
              <rect y={H / 2} width={W} height={H / 2} />
            </clipPath>
          </defs>
          {ticks.map((t) => (
            <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={H} className="gold-grid" />
          ))}
          {chapters.map((c, i) => (
            <rect key={c.start} x={x(c.start) - 3} width={Math.max(6, x(c.end) - x(c.start) + 6)} y={0} height={H} className={cx("curve-band", i === sel && "on")} />
          ))}
          <path d={area} clipPath="url(#curve-up)" className="gold-area up" />
          <path d={area} clipPath="url(#curve-down)" className="gold-area down" />
          <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="gold-zero" />
          <path d={line} className="gold-line" vectorEffect="non-scaling-stroke" />
        </svg>
        {chapters.map((c, i) => (
          <button
            key={c.start}
            className={cx("curve-pin", i === sel && "on", c.net >= 0 ? "ally" : "enemy")}
            style={{ left: `${Math.min(99, pins[i]).toFixed(2)}%`, top: `${((y(c.after) / H) * 100).toFixed(2)}%` }}
            onClick={() => onSelect(i)}
            aria-label={`Chapitre ${i + 1} à ${clock(c.start)} : ${c.title}`}
            aria-pressed={i === sel}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="curve-axis mono">
        <span style={{ left: 0 }}>0:00</span>
        {ticks.map((t) => (
          <span key={t} style={{ left: `${(t / maxT) * 100}%` }}>
            {t / 60}′
          </span>
        ))}
        <span style={{ right: 0 }}>{clock(maxT)}</span>
      </div>
    </section>
  );
}

/* ---------- Un chapitre : la carte du combat et ce qu'il a rapporté ---------- */

interface Marker extends Point {
  player: GamePlayer;
  dead: boolean;
}

function Scene({ chapter: c, index, count, players, myTeam, assets, onStep, onReplay, children }: { chapter: Chapter; index: number; count: number; players: GamePlayer[]; myTeam: number; assets: StaticData | null; onStep: (d: number) => void; onReplay: () => void; children: ReactNode }) {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const [mapFailed, setMapFailed] = useState(false);
  const events = [...c.kills, ...c.objectives, ...c.buildings].sort((a, b) => a.t - b.t);
  const color = (team: number) => (team === myTeam ? "var(--ally)" : "var(--enemy)");

  // Cadrage : un carré autour des événements, jamais plus serré qu'un tiers de carte.
  const pts = events.map((m) => m.event.position).filter(Boolean) as Point[];
  const spread = pts.length ? Math.max(...pts.map((p) => Math.max(Math.abs(p.x - c.center.x), Math.abs(p.y - c.center.y)))) : 0;
  const side = Math.min(SIZE, Math.max(5200, spread * 2 + 3400));
  const clamp = (v: number) => Math.min(SIZE - side, Math.max(0, v - side / 2));
  const vx = clamp(c.center.x);
  const vy = clamp(SIZE - c.center.y);
  const r = side * 0.043;

  const markers = useMemo(() => {
    const keep = (v: number, from: number) => Math.min(from + side - r * 1.4, Math.max(from + r * 1.4, v));
    return layout(c, byId, r).map((m) => ({ ...m, x: keep(m.x, vx), y: SIZE - keep(SIZE - m.y, vy) }));
  }, [c, byId, r, side, vx, vy]);
  const dead = new Set(c.kills.map((m) => m.event.victimId));
  const sides = [myTeam, myTeam === 100 ? 200 : 100].map((team) => c.involved.map((id) => byId.get(id)).filter((p): p is GamePlayer => !!p && p.teamId === team));
  const objective = c.objectives[0] ?? c.buildings[0];

  return (
    <section className="scene">
      <div className="scene-map" key={c.start}>
        <svg viewBox={`${vx} ${vy} ${side} ${side}`} role="img" aria-label={`Carte du passage : ${c.title}`}>
          <defs>
            <clipPath id="replay-clip">
              <circle r={430} />
            </clipPath>
          </defs>
          <Schematic />
          {assets && !mapFailed && <image href={mapImage(assets.version)} width={SIZE} height={SIZE} opacity={0.55} onError={() => setMapFailed(true)} />}
          {[...c.objectives, ...c.buildings].map((m, i) => {
            const p = m.event.position;
            if (!p) return null;
            return (
              <g key={i} transform={`translate(${p.x} ${SIZE - p.y})`} className="scene-obj">
                {m.kind === "objective" ? <circle r={r * 1.9} stroke={color(m.team)} /> : <rect x={-r * 1.3} y={-r * 1.3} width={r * 2.6} height={r * 2.6} rx={r * 0.4} stroke={color(m.team)} />}
              </g>
            );
          })}
          {markers.map((m) => (
            <g key={m.player.id} transform={`translate(${m.x} ${SIZE - m.y}) scale(${r / 500})`} className={cx("scene-champ", m.dead && "dead")}>
              <circle r={500} fill={color(m.player.teamId)} />
              <MarkerImage id={m.player.championId} />
              {m.player.me && <circle r={600} fill="none" stroke="#fff" strokeWidth={70} />}
              {m.dead && <path d="M-300 -300L300 300M300 -300L-300 300" stroke={color(m.player.teamId === 100 ? 200 : 100)} strokeWidth={150} strokeLinecap="round" />}
            </g>
          ))}
        </svg>
        <span className="scene-stamp mono">
          {clock(c.start)}
          {c.end - c.start >= 5 && ` → ${clock(c.end)}`}
        </span>
        <p className="note">Les croix sont à l'endroit exact des morts. Les survivants sont placés à côté du combat.</p>
      </div>

      <div className="scene-side">
        {children}
        <div className="scene-info" key={c.start}>
        <div className="scene-tags">
          <span className="eyebrow">
            Chapitre {index + 1} / {count}
          </span>
          {c.tags.map((t) => (
            <span key={t} className={cx("tag", t === "Le tournant" && "accent", t === "Ton meilleur passage" && "gold")}>
              {t}
            </span>
          ))}
        </div>
        <h2 className="scene-title">{c.title}</h2>

        {(sides[0].length > 0 || sides[1].length > 0) && (
          <div className="scene-versus">
            {sides.map((team, i) => (
              <span key={i} className={i ? "enemy" : "ally"}>
                {team.map((p) => (
                  <span key={p.id} className={cx("scene-face", dead.has(p.id) && "dead", p.me && "me")} title={`${p.me ? "Toi" : p.name} · ${p.champion}${dead.has(p.id) ? " (tué)" : ""}`}>
                    <ChampIcon id={p.championId} />
                  </span>
                ))}
                {team.length === 0 && <small>personne</small>}
              </span>
            ))}
          </div>
        )}

        <div className="scene-facts">
          <div>
            <span className="label">Écart d'or</span>
            <b className={c.swing >= 0 ? "up" : "down"}>{signed(c.swing)}</b>
            <small>{signed(c.after)} après</small>
          </div>
          {c.kills.length > 0 && (
            <div>
              <span className="label">Kills</span>
              <b>
                <span style={{ color: "var(--ally)" }}>{c.allyKills}</span> – <span style={{ color: "var(--enemy)" }}>{c.enemyKills}</span>
              </b>
              <small>{c.where}</small>
            </div>
          )}
          {objective && (
            <div>
              <span className="label">{objective.kind === "objective" ? "Objectif" : "Bâtiment"}</span>
              <b className="scene-fact-text">{objective.kind === "objective" ? objectiveName(objective) : buildingName(objective)}</b>
              <small>{objective.team === myTeam ? "pour ton équipe" : "pour eux"}</small>
            </div>
          )}
          <div>
            <span className="label">Toi</span>
            <b>{c.mine ? `${c.mine.k} / ${c.mine.d} / ${c.mine.a}` : "absent"}</b>
            <small>{c.mine ? "kills / morts / aides" : "tu étais ailleurs"}</small>
          </div>
        </div>

        <ol className="scene-events">
          {events.map((m, i) => (
            <li key={i} className={m.team === myTeam ? "ally" : "enemy"}>
              <time className="mono">{clock(m.t)}</time>
              <span>{sentence(m, byId, myTeam)}</span>
            </li>
          ))}
        </ol>

        <div className="scene-nav">
          <button className="btn btn-quiet btn-s" disabled={index === 0} onClick={() => onStep(-1)}>
            <Icon name="back" size={15} /> Précédent
          </button>
          <button className="btn btn-quiet btn-s" disabled={index === count - 1} onClick={() => onStep(1)}>
            Suivant <Icon name="back" size={15} className="flip" />
          </button>
          <button className="btn btn-quiet btn-s" onClick={onReplay}>
            <Icon name="play" size={14} fill /> Revoir en mouvement
          </button>
        </div>
        </div>
      </div>
    </section>
  );
}

/** Une ligne par événement, en français courant. */
function sentence(m: Moment, byId: Map<number, GamePlayer>, myTeam: number) {
  const e = m.event;
  if (m.kind === "kill") {
    const killer = byId.get(e.killerId ?? 0);
    const victim = byId.get(e.victimId ?? 0);
    const helpers = (e.assistingParticipantIds ?? []).map((id) => byId.get(id)).filter(Boolean) as GamePlayer[];
    const who = killer ? (killer.me ? "Tu tues" : `${killer.champion} tue`) : "Une tourelle tue";
    const whom = victim?.me ? "toi" : victim?.champion ?? "un joueur";
    return `${killer?.me && victim ? `Tu tues ${whom}` : `${who} ${whom}`}${helpers.length ? `, aidé par ${helpers.map((h) => (h.me ? "toi" : h.champion)).join(", ")}` : ""}`;
  }
  const ours = m.team === myTeam;
  const by = m.mine ? "par toi" : ours ? "par ton équipe" : "par eux";
  if (m.kind === "objective") return `${objectiveName(m)} ${m.event.monsterType === "HORDE" ? "prises" : "pris"} ${by}`;
  const inhib = e.buildingType === "INHIBITOR_BUILDING";
  return ours ? `${buildingName(m)} ${inhib ? "détruit" : "détruite"} ${by}` : `${buildingName(m)} ${inhib ? "perdu" : "perdue"}`;
}

/**
 * Place les joueurs du passage : les victimes là où elles sont mortes (position exacte donnée par Riot),
 * les survivants à côté du premier kill auquel ils ont pris part. On écarte ensuite ceux qui se chevauchent.
 */
function layout(c: Chapter, byId: Map<number, GamePlayer>, r: number): Marker[] {
  const out: Marker[] = [];
  const seen = new Set<number>();
  for (const m of c.kills) {
    const p = m.event.position;
    const victim = byId.get(m.event.victimId ?? 0);
    if (p && victim && !seen.has(victim.id)) {
      seen.add(victim.id);
      out.push({ ...p, player: victim, dead: true });
    }
  }
  const events = [...c.kills, ...c.objectives, ...c.buildings].sort((a, b) => a.t - b.t);
  for (const m of events) {
    const p = m.event.position;
    if (!p) continue;
    const ids = [m.event.killerId, ...(m.event.assistingParticipantIds ?? [])];
    ids.forEach((id, i) => {
      const player = byId.get(id ?? 0);
      if (!player || seen.has(player.id)) return;
      seen.add(player.id);
      // Les alliés arrivent du côté de leur base : bleu en bas à gauche, rouge en haut à droite.
      const base = player.teamId === 100 ? Math.PI * 1.25 : Math.PI * 0.25;
      const angle = base + (i - (ids.length - 1) / 2) * 0.7;
      out.push({ x: p.x + Math.cos(angle) * r * 2.4, y: p.y + Math.sin(angle) * r * 2.4, player, dead: false });
    });
  }
  const min = r * 2.15;
  for (let pass = 0; pass < 24; pass++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 1) {
          const ang = (i * 2.4 + j) % (Math.PI * 2);
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          d = 1;
        }
        const push = (min - d) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
  }
  return out;
}

/* ---------- Journal complet, replié ---------- */

type Filter = "all" | "me" | "kills" | "objectives";
const FILTERS: [Filter, string][] = [
  ["all", "Tout"],
  ["me", "Mes actions"],
  ["kills", "Kills"],
  ["objectives", "Objectifs"],
];
const passes = (m: Moment, f: Filter) => f === "all" || (f === "me" ? m.mine : f === "kills" ? m.kind === "kill" : m.kind !== "kill");

function Journal({ story, players, myTeam, onJump, onReplay }: { story: StoryData; players: GamePlayer[]; myTeam: number; onJump: (t: number) => void; onReplay: () => void }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const shown = story.all.filter((m) => passes(m, filter));

  return (
    <section className="journal">
      <div className="journal-head">
        <button className="journal-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Icon name="chevron" size={15} />
          Journal complet
          <span>{story.all.length} événements</span>
        </button>
        <button className="btn btn-quiet btn-s" onClick={onReplay}>
          <Icon name="play" size={14} fill /> Replay de toute la partie
        </button>
      </div>
      {open && (
        <>
          <div className="chips">
            {FILTERS.map(([value, text]) => (
              <button key={value} className="chip" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {text}
                <span>{story.all.filter((m) => passes(m, value)).length}</span>
              </button>
            ))}
          </div>
          <ol className="feed">
            {shown.map((m, i) => {
              const victim = byId.get(m.event.victimId ?? 0);
              const killer = byId.get(m.event.killerId ?? 0);
              return (
                <li key={i}>
                  <button className={cx("moment", m.team === myTeam ? "ally" : "enemy", m.mine && "mine")} onClick={() => onJump(m.t)} title="Voir sur la carte">
                    <time className="mono">{clock(m.t)}</time>
                    {m.kind === "kill" ? (
                      <span className="moment-kill">
                        {killer ? <ChampIcon id={killer.championId} /> : <i className="slot-ico" />}
                        <Icon name="close" size={12} />
                        {victim ? <ChampIcon id={victim.championId} /> : <i className="slot-ico" />}
                      </span>
                    ) : (
                      <span className={cx("moment-obj", m.kind)} aria-hidden="true" />
                    )}
                    <b>{sentence(m, byId, myTeam)}</b>
                    <span className="moment-see">Voir sur la carte</span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="wait">Rien à afficher pour ce filtre.</li>}
          </ol>
        </>
      )}
    </section>
  );
}
