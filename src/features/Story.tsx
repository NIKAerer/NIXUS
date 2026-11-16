import { useMemo, useState } from "react";
import type { StaticData } from "../lib/ddragon";
import { clock } from "../lib/lcu";
import type { Timeline } from "../lib/types";
import { ChampIcon, Icon, cx } from "../ui";
import type { GamePlayer, Moment } from "./game";
import { Replay } from "./Replay";
import { buildStory, buildingName, objectiveName, type Story as StoryData } from "./chapters";

/** Le film de la partie : la carte rejouée avec le trajet des junglers, et le journal des événements pour s'y déplacer. */
export function Story({ timeline, players, myTeam, won, duration, assets }: { timeline: Timeline; players: GamePlayer[]; myTeam: number; won: boolean; duration: number; assets: StaticData | null }) {
  const story = useMemo(() => buildStory(timeline, players, myTeam, won), [timeline, players, myTeam, won]);
  // Chaque saut depuis le journal relance la carte à l'instant demandé.
  const [jump, setJump] = useState<{ t: number | null; n: number }>({ t: null, n: 0 });
  const go = (t: number | null) => setJump((j) => ({ t, n: j.n + 1 }));
  return (
    <div className="story">
      <Replay key={jump.n} timeline={timeline} players={players} duration={duration} assets={assets} start={jump.t} />
      <Journal story={story} players={players} myTeam={myTeam} onJump={(t) => go(Math.max(0, t - 8))} onReplay={() => go(null)} />
    </div>
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
          <Icon name="play" size={14} fill /> Reprendre du début
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
