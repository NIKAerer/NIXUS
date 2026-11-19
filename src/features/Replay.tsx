import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { mapImage, type StaticData } from "../lib/ddragon";
import { championSquare, clock } from "../lib/lcu";
import type { Timeline } from "../lib/types";
import { ChampIcon, Icon, Seg, kilo } from "../ui";
import { momentsOf, type GamePlayer, type Moment } from "./game";
import { buildPathing, positionAt, type Sample } from "./pathing";

/** Les coordonnées Riot vont de 0 à ~15 000, base bleue en bas à gauche. */
const SIZE = 15000;
/** Durée (en temps de jeu) au bout de laquelle un bout de trajet a complètement disparu. */
const TRAIL = 90;
const SPEEDS = [8, 15, 30, 60] as const;
const JUMPS = [3, 5, 10, 15, 20];
/** Deux kills à moins de 20 s l'un de l'autre font partie du même combat. */
const FIGHT_GAP = 20;
/** Pendant un combat, la lecture passe à 25 % de la vitesse choisie, de 5 s avant à 5 s après. */
const SLOW_FACTOR = 0.25;
const SLOW_BEFORE = 5;
const SLOW_AFTER = 5;

interface Fight {
  t: number;
  kills: Moment[];
}

/** Combats où au moins un jungler est tueur, victime ou passeur, regroupés quand les kills s'enchaînent. */
function fightsOf(moments: Moment[], junglers: number[]): Fight[] {
  const out: Fight[] = [];
  for (const m of moments) {
    if (m.kind !== "kill") continue;
    const e = m.event;
    const ids = [e.killerId, e.victimId, ...(e.assistingParticipantIds ?? [])];
    if (!ids.some((id) => id !== undefined && junglers.includes(id))) continue;
    const last = out[out.length - 1];
    const prev = last?.kills[last.kills.length - 1];
    if (last && prev && m.t - prev.t <= FIGHT_GAP) last.kills.push(m);
    else out.push({ t: m.t, kills: [m] });
  }
  return out;
}

/** Rejoue le parcours des deux junglers sur la carte ; la lecture ralentit pendant leurs combats. */
export function Replay({ timeline, players, duration, assets, start }: { timeline: Timeline; players: GamePlayer[]; duration: number; assets: StaticData | null; start: number | null }) {
  const me = players.find((p) => p.me);
  const [t, setT] = useState(start ?? 0);
  const [playing, setPlaying] = useState(start === null);
  const [speed, setSpeed] = useState<number>(15);
  const pathing = useMemo(() => buildPathing(timeline, players), [timeline, players]);
  const tracks = pathing.tracks;
  const shown = pathing.junglers.length ? pathing.junglers : me ? [me.id] : [];
  const [mapFailed, setMapFailed] = useState(false);
  const end = Math.max(duration, timeline.frames[timeline.frames.length - 1]?.timestamp / 1000 || 0);

  const moments = useMemo(() => momentsOf(timeline, players), [timeline, players]);
  const fights = useMemo(() => fightsOf(moments, shown), [moments, shown.join()]);
  // Fenêtres de ralenti : de quelques secondes avant le premier kill à quelques secondes après le dernier.
  const slowZones = useRef<[number, number][]>([]);
  slowZones.current = fights.map((f) => [f.t - SLOW_BEFORE, f.kills[f.kills.length - 1].t + SLOW_AFTER]);
  const tRef = useRef(t);
  tRef.current = t;

  // Lecture : l'horloge de la partie avance de `speed` secondes par seconde réelle, en ralenti pendant les combats.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const v = tRef.current;
      const slow = slowZones.current.some(([a, b]) => v >= a && v <= b);
      const to = Math.min(v + dt * speed * (slow ? SLOW_FACTOR : 1), end);
      tRef.current = to;
      setT(to);
      if (to >= end) setPlaying(false);
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);

  const allyTeam = me?.teamId ?? 100;
  const enemyTeam = allyTeam === 100 ? 200 : 100;
  const color = (teamId: number) => (teamId === allyTeam ? "var(--ally)" : "var(--enemy)");
  const byId = new Map(players.map((p) => [p.id, p]));

  // État de chaque jungler à l'instant t (dernière image passée).
  const frameIndex = Math.max(0, timeline.frames.findIndex((f) => f.timestamp / 1000 > t) - 1);
  const frame = timeline.frames[t >= end ? timeline.frames.length - 1 : frameIndex];
  const statsOf = (id: number) => {
    const pf = frame?.participantFrames?.[String(id)];
    return { gold: pf?.totalGold ?? 0, level: pf?.level ?? 1, cs: (pf?.minionsKilled ?? 0) + (pf?.jungleMinionsKilled ?? 0) };
  };
  const killsBy = (team: number) => moments.filter((m) => m.kind === "kill" && m.t <= t && m.team === team).length;
  const junglersSorted = shown.map((id) => byId.get(id)).filter((p): p is GamePlayer => !!p).sort((a, b) => Number(a.teamId !== allyTeam) - Number(b.teamId !== allyTeam));

  // Combat en cours d'affichage : en cours ou terminé il y a peu.
  const current = [...fights].reverse().find((f) => f.t <= t && t - (f.kills[f.kills.length - 1].t) < 12);
  const fightMarks = fights.flatMap((f) => f.kills).filter((m) => m.t <= t && t - m.t < 20 && m.event.position);
  const objectives = moments.filter((m) => m.kind === "objective" && m.t <= t && t - m.t < 20 && m.event.position);
  const name = (id?: number) => {
    const p = id ? byId.get(id) : undefined;
    return p ? (p.me ? "Toi" : p.champion) : "Sbires / tour";
  };
  const jump = (to: number) => {
    setPlaying(false);
    setT(to);
  };

  return (
    <div className="replay">
      <div className="replay-stage">
        <svg className="replay-map" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Position des junglers à ${clock(t)}`}>
          <defs>
            <clipPath id="replay-clip">
              <circle r={430} />
            </clipPath>
          </defs>
          <Schematic />
          {assets && !mapFailed && <image href={mapImage(assets.version)} width={SIZE} height={SIZE} opacity={0.62} onError={() => setMapFailed(true)} />}
          {shown.map((id) => (
            <Trail key={id} samples={tracks.get(id) ?? []} t={t} stroke={color(byId.get(id)?.teamId ?? 100)} />
          ))}
          {objectives.map((m, i) => {
            const pos = m.event.position!;
            return <circle key={`o${i}`} cx={pos.x} cy={SIZE - pos.y} r={300} fill="none" stroke={color(m.team)} strokeWidth={110} opacity={1 - (t - m.t) / 20} />;
          })}
          {fightMarks.map((m, i) => {
            const pos = m.event.position!;
            return (
              <g key={`f${i}`} transform={`translate(${pos.x} ${SIZE - pos.y})`} opacity={1 - (t - m.t) / 20} pointerEvents="none">
                <path d="M-260 -260L260 260M260 -260L-260 260" stroke={color(m.team)} strokeWidth={140} strokeLinecap="round" />
              </g>
            );
          })}
          {shown.map((id) => {
            const p = byId.get(id);
            const pos = positionAt(tracks.get(id) ?? [], t);
            if (!p || !pos) return null;
            return (
              <g key={id} transform={`translate(${pos.x} ${SIZE - pos.y}) scale(1.25)`}>
                <circle r={500} fill={color(p.teamId)} />
                <MarkerImage id={p.championId} />
                {p.me && <circle r={600} fill="none" stroke="#fff" strokeWidth={70} />}
              </g>
            );
          })}
        </svg>

        <div className="replay-controls">
          <button className="replay-play" onClick={() => (t >= end ? (setT(0), setPlaying(true)) : setPlaying((v) => !v))} aria-label={playing ? "Pause" : "Lecture"}>
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor" />
              </svg>
            ) : (
              <Icon name="play" fill size={18} />
            )}
          </button>
          <div className="replay-scrub">
            <input type="range" min={0} max={Math.round(end)} step={1} value={Math.round(t)} onChange={(e) => jump(Number(e.target.value))} aria-label="Moment de la partie" />
            <div aria-hidden="true">
              {fights.map((f, i) => (
                <i key={i} style={{ left: `${(f.t / end) * 100}%`, background: "#fff" }} />
              ))}
            </div>
          </div>
          <span className="mono">
            <b>{clock(t)}</b> / {clock(end)}
          </span>
        </div>
        <div className="replay-options">
          <div className="seg">
            {JUMPS.filter((m) => m * 60 < end).map((m) => (
              <button key={m} onClick={() => jump(m * 60)}>
                {m}′
              </button>
            ))}
            <button onClick={() => jump(end)}>Fin</button>
          </div>
          <Seg value={speed} onChange={setSpeed} label="Vitesse" options={SPEEDS.map((s) => [s, `×${s}`] as const)} />
        </div>
      </div>

      <aside className="replay-side">
        <div className="replay-score">
          <div style={{ color: "var(--ally)" }}>
            <span className="label">Ton équipe</span>
            <b>{killsBy(allyTeam)}</b>
          </div>
          <div>
            <span className="label">Kills</span>
            <b className="mono">{clock(t)}</b>
          </div>
          <div style={{ color: "var(--enemy)" }}>
            <span className="label">Adversaires</span>
            <b>{killsBy(enemyTeam)}</b>
          </div>
        </div>
        <ul className="replay-players">
          {junglersSorted.map((p) => {
            const l = statsOf(p.id);
            return (
              <li key={p.id}>
                <div className="replay-jungler" style={{ "--c": color(p.teamId) } as CSSProperties}>
                  <ChampIcon id={p.championId} />
                  <span>
                    <b>{p.me ? "Toi" : p.champion}</b>
                    <small>{p.name}</small>
                  </span>
                  <span className="right">
                    <b>Niv. {l.level}</b>
                    <small>
                      {kilo(l.gold)} · {l.cs} cs
                    </small>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {current ? (
          <div className="replay-fight">
            <span className="label">Combat à {clock(current.t)}</span>
            <ul>
              {current.kills.filter((k) => k.t <= t).map((k, i) => (
                <li key={i}>
                  <span className="mono">{clock(k.t)}</span> <b style={{ color: color(k.team) }}>{name(k.event.killerId)}</b> tue <b style={{ color: color(k.team === 100 ? 200 : 100) }}>{name(k.event.victimId)}</b>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="note">La lecture ralentit pendant les combats des junglers. Les trajets sont estimés : Riot ne donne qu'une position par minute.</p>
        )}
      </aside>
    </div>
  );
}

/** Portrait du champion sur la carte, retiré s'il ne charge pas (on garde alors la pastille de couleur). */
export function MarkerImage({ id }: { id: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <image href={championSquare(id)} x={-430} y={-430} width={860} height={860} clipPath="url(#replay-clip)" onError={() => setFailed(true)} />;
}

/** Trajet d'un jungler : chaque bout s'efface tout seul et disparaît après `TRAIL` secondes de jeu. */
function Trail({ samples, t, stroke }: { samples: Sample[]; t: number; stroke: string }) {
  const pts = samples.filter((s) => s.t <= t && s.t >= t - TRAIL);
  // Point de départ interpolé pile à la limite, pour que la ligne ne saute pas d'une minute à l'autre.
  const tail = positionAt(samples, t - TRAIL);
  if (tail && t > TRAIL) pts.unshift({ ...tail, t: t - TRAIL });
  const now = positionAt(samples, t);
  if (now) pts.push({ ...now, t });
  if (pts.length < 2) return null;
  return (
    <g pointerEvents="none">
      {pts.slice(1).map((b, i) => {
        const a = pts[i];
        if (b.jump) return null;
        const age = (t - (a.t + b.t) / 2) / TRAIL;
        return <line key={i} x1={a.x} y1={SIZE - a.y} x2={b.x} y2={SIZE - b.y} stroke={stroke} strokeWidth={130} strokeLinecap="round" opacity={Math.max(0, 1 - age)} />;
      })}
    </g>
  );
}

/** Carte simplifiée, visible même si l'image de Data Dragon ne charge pas. */
export function Schematic() {
  return (
    <g className="replay-schematic">
      <rect width={SIZE} height={SIZE} />
      <path d={`M1200 ${SIZE - 3000} V1200 H${SIZE - 3000}`} />
      <path d={`M3000 ${SIZE - 1200} H${SIZE - 1200} V3000`} />
      <path d={`M2300 ${SIZE - 2300} L${SIZE - 2300} 2300`} />
      <path d={`M2000 2000 L${SIZE - 2000} ${SIZE - 2000}`} className="river" />
      <circle cx={1100} cy={SIZE - 1100} r={1500} className="blue" />
      <circle cx={SIZE - 1100} cy={1100} r={1500} className="red" />
    </g>
  );
}
