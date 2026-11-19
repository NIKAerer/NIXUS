import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { mapImage, type StaticData } from "../lib/ddragon";
import { championSquare, clock } from "../lib/lcu";
import type { Timeline } from "../lib/types";
import { ChampIcon, Icon, Seg, cx, kilo } from "../ui";
import { momentsOf, type GamePlayer } from "./game";
import { buildPathing, positionAt, type Sample } from "./pathing";

/** Les coordonnées Riot vont de 0 à ~15 000, base bleue en bas à gauche. */
const SIZE = 15000;
/** Le trajet s'efface tout seul : un point disparaît 1 min 30 de jeu après le passage du jungler. */
const TRAIL = 90;
const SPEEDS = [8, 15, 30, 60] as const;
const JUMPS = [3, 5, 10, 15, 20];

/** Rejoue la partie sur la carte : les dix joueurs, le trajet estimé des deux junglers et leurs combats. */
export function Replay({ timeline, players, duration, assets, start }: { timeline: Timeline; players: GamePlayer[]; duration: number; assets: StaticData | null; start: number | null }) {
  const me = players.find((p) => p.me);
  const [t, setT] = useState(start ?? 0);
  const [playing, setPlaying] = useState(start === null);
  const [speed, setSpeed] = useState<number>(15);
  const pathing = useMemo(() => buildPathing(timeline, players), [timeline, players]);
  const tracks = pathing.tracks;
  // Seuls les junglers ont un trajet affiché : c'est leur parcours qu'on vient lire ici.
  const focus = pathing.junglers;
  const [mapFailed, setMapFailed] = useState(false);
  const end = Math.max(duration, timeline.frames[timeline.frames.length - 1]?.timestamp / 1000 || 0);

  // Lecture : l'horloge de la partie avance de `speed` secondes par seconde réelle.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((v) => {
        const next = v + dt * speed;
        if (next >= end) {
          setPlaying(false);
          return end;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);

  const moments = useMemo(() => momentsOf(timeline, players), [timeline, players]);
  const allyTeam = me?.teamId ?? 100;
  const enemyTeam = allyTeam === 100 ? 200 : 100;
  const color = (teamId: number) => (teamId === allyTeam ? "var(--ally)" : "var(--enemy)");

  // État de chaque joueur à l'instant t (dernière image passée).
  const frameIndex = Math.max(0, timeline.frames.findIndex((f) => f.timestamp / 1000 > t) - 1);
  const frame = timeline.frames[t >= end ? timeline.frames.length - 1 : frameIndex];
  const live = players.map((p) => {
    const pf = frame?.participantFrames?.[String(p.id)];
    return { p, gold: pf?.totalGold ?? 0, level: pf?.level ?? 1, cs: (pf?.minionsKilled ?? 0) + (pf?.jungleMinionsKilled ?? 0) };
  });
  const killsBy = (team: number) => moments.filter((m) => m.kind === "kill" && m.t <= t && m.team === team).length;
  const goldOf = (team: number) => live.filter((l) => l.p.teamId === team).reduce((s, l) => s + l.gold, 0);
  const diff = goldOf(allyTeam) - goldOf(enemyTeam);

  // Arrêts marqués sur le trajet : uniquement les combats où un jungler a tué, est mort ou a aidé.
  const fights = useMemo(
    () =>
      timeline.frames
        .flatMap((f) => f.events ?? [])
        .filter((e) => e.type === "CHAMPION_KILL" && e.position)
        .flatMap((e) =>
          focus
            .filter((id) => e.killerId === id || e.victimId === id || e.assistingParticipantIds?.includes(id))
            .map((id) => ({ id, t: e.timestamp / 1000, pos: e.position!, died: e.victimId === id })),
        ),
    [timeline, focus],
  );
  const shown = fights.filter((f) => f.t <= t && t - f.t < TRAIL);
  const ordered = [...players].sort((a, b) => Number(a.teamId !== allyTeam) - Number(b.teamId !== allyTeam));
  // Le joueur suivi est dessiné en dernier, au-dessus des autres.
  const drawOrder = [...players].sort((a, b) => Number(focus.includes(a.id)) - Number(focus.includes(b.id)));
  const teamOf = (id: number) => players.find((p) => p.id === id)?.teamId ?? 100;
  const jump = (to: number) => {
    setPlaying(false);
    setT(to);
  };

  return (
    <div className="replay">
      <div className="replay-stage">
        <svg className="replay-map" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Position des joueurs à ${clock(t)}`}>
          <defs>
            <clipPath id="replay-clip">
              <circle r={430} />
            </clipPath>
          </defs>
          <Schematic />
          {assets && !mapFailed && <image href={mapImage(assets.version)} width={SIZE} height={SIZE} opacity={0.62} onError={() => setMapFailed(true)} />}
          {focus.map((id) => (
            <Trail key={id} samples={tracks.get(id) ?? []} t={t} stroke={color(teamOf(id))} />
          ))}
          {shown.map((f, i) => (
            <g key={i} transform={`translate(${f.pos.x} ${SIZE - f.pos.y})`} opacity={1 - (t - f.t) / TRAIL} pointerEvents="none">
              <circle r={330} fill="#0b0b0e" stroke={color(teamOf(f.id))} strokeWidth={70} />
              <path d="M-140 -140L140 140M140 -140L-140 140" stroke={f.died ? "var(--enemy)" : "#fff"} strokeWidth={70} strokeLinecap="round" />
            </g>
          ))}
          {drawOrder.map((p) => {
            const pos = positionAt(tracks.get(p.id) ?? [], t);
            if (!pos) return null;
            const focused = focus.includes(p.id);
            return (
              <g key={p.id} transform={`translate(${pos.x} ${SIZE - pos.y}) scale(${focused ? 1.25 : 1})`} >
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
              {moments
                .filter((m) => m.kind !== "building")
                .map((m, i) => (
                  <i key={i} className={m.kind} style={{ left: `${(m.t / end) * 100}%`, background: color(m.team) }} />
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
            <span className="label">Or à {clock(t)}</span>
            <b className={diff >= 0 ? "up" : "down"}>
              {diff >= 0 ? "+" : ""}
              {kilo(diff)}
            </b>
          </div>
          <div style={{ color: "var(--enemy)" }}>
            <span className="label">Adversaires</span>
            <b>{killsBy(enemyTeam)}</b>
          </div>
        </div>
        <p className="note">Trajet des deux junglers, estimé (Riot ne donne qu'une position par minute) : il s'efface au bout d'1 min 30 de jeu, les croix marquent leurs combats.</p>
        <ul className="replay-players">
          {ordered.map((p, i) => {
            const l = live.find((x) => x.p.id === p.id)!;
            return (
              <li key={p.id} className={i === 5 ? "split" : undefined}>
                <div className={cx("replay-player", focus.includes(p.id) && "on", p.me && "me")} style={{ "--c": color(p.teamId) } as CSSProperties}>
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

/** Trajet d'un jungler sur les `TRAIL` dernières secondes de jeu, qui s'estompe jusqu'à disparaître. */
function Trail({ samples, t, stroke }: { samples: Sample[]; t: number; stroke: string }) {
  const from = t - TRAIL;
  const start = positionAt(samples, from);
  const pts: Sample[] = start && from > 0 ? [{ ...start, t: from }] : [];
  pts.push(...samples.filter((s) => s.t <= t && s.t > from));
  const now = positionAt(samples, t);
  if (now) pts.push({ ...now, t });
  if (pts.length < 2) return null;
  return (
    <g pointerEvents="none">
      {pts.slice(1).map((b, i) => {
        const a = pts[i];
        if (b.jump) return null;
        return <line key={i} x1={a.x} y1={SIZE - a.y} x2={b.x} y2={SIZE - b.y} stroke={stroke} strokeWidth={130} strokeLinecap="round" opacity={Math.max(0, 1 - (t - b.t) / TRAIL)} />;
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
