import { useMemo, useState, type CSSProperties } from "react";
import type { GameDetail } from "../lib/types";
import { ChampIcon, cx, int, kilo } from "../ui";
import type { GamePlayer } from "./game";

/** Une part d'une barre (ex. dégâts physiques), avec sa couleur. */
type Part = { key: string; label: string; color: string };
type Metric = { id: string; label: string; keys: string[]; parts?: Part[]; fmt?: (v: number) => string; per?: boolean };

const PHYS = "#ff8a3d";
const MAGIC = "#5aa9ff";
const TRUE = "#e8e8ee";

/**
 * Les stats du détail de partie, comme les graphiques de fin de partie du client.
 * Une stat n'apparaît que si au moins un joueur a une valeur (les vieilles parties archivées en ont moins).
 */
const METRICS: Metric[] = [
  {
    id: "dmg",
    label: "Dégâts aux champions",
    keys: ["totalDamageDealtToChampions"],
    parts: [
      { key: "physicalDamageDealtToChampions", label: "Physiques", color: PHYS },
      { key: "magicDamageDealtToChampions", label: "Magiques", color: MAGIC },
      { key: "trueDamageDealtToChampions", label: "Bruts", color: TRUE },
    ],
    per: true,
  },
  {
    id: "taken",
    label: "Dégâts subis",
    keys: ["totalDamageTaken"],
    parts: [
      { key: "physicalDamageTaken", label: "Physiques", color: PHYS },
      { key: "magicalDamageTaken", label: "Magiques", color: MAGIC },
      { key: "trueDamageTaken", label: "Bruts", color: TRUE },
    ],
    per: true,
  },
  { id: "mitig", label: "Dégâts atténués", keys: ["damageSelfMitigated"], per: true },
  { id: "gold", label: "Or gagné", keys: ["goldEarned"], per: true },
  { id: "cs", label: "Sbires et monstres", keys: ["totalMinionsKilled", "neutralMinionsKilled"], fmt: (v) => String(v), per: true },
  { id: "heal", label: "Soins", keys: ["totalHeal"], per: true },
  { id: "shield", label: "Boucliers sur alliés", keys: ["totalDamageShieldedOnTeammates"] },
  { id: "allyHeal", label: "Soins sur alliés", keys: ["totalHealsOnTeammates"] },
  { id: "obj", label: "Dégâts aux objectifs", keys: ["damageDealtToObjectives"] },
  { id: "tower", label: "Dégâts aux tours", keys: ["damageDealtToTurrets", "damageDealtToBuildings"] },
  { id: "total", label: "Dégâts totaux", keys: ["totalDamageDealt"] },
  { id: "cc", label: "Contrôle infligé (s)", keys: ["timeCCingOthers"], fmt: (v) => String(v) },
  { id: "vision", label: "Score de vision", keys: ["visionScore"], fmt: (v) => String(v), per: true },
  { id: "wards", label: "Balises posées", keys: ["wardsPlaced"], fmt: (v) => String(v) },
  { id: "wardsKilled", label: "Balises détruites", keys: ["wardsKilled"], fmt: (v) => String(v) },
  { id: "pinks", label: "Balises de contrôle", keys: ["visionWardsBoughtInGame"], fmt: (v) => String(v) },
  { id: "spree", label: "Plus longue série", keys: ["largestKillingSpree"], fmt: (v) => String(v) },
  { id: "alive", label: "Plus longue vie", keys: ["longestTimeSpentLiving"], fmt: (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}` },
];

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);

/** Onglet « Graphiques » : une barre par joueur pour la stat choisie, alliés à gauche, adversaires à droite. */
export function GameCharts({ detail, players, myTeam, minutes }: { detail: GameDetail; players: GamePlayer[]; myTeam: number; minutes: number }) {
  const statsOf = useMemo(() => new Map(detail.participants.map((p) => [p.participantId, p.stats])), [detail]);
  // Pour Tours, la première clé présente gagne (damageDealtToBuildings dans les parties récentes inclut les inhibiteurs).
  const valueOf = (m: Metric, id: number) => {
    const s = statsOf.get(id) ?? {};
    if (m.id === "tower") return num(s.damageDealtToBuildings) || num(s.damageDealtToTurrets);
    return m.keys.reduce((sum, k) => sum + num(s[k]), 0);
  };
  const available = METRICS.filter((m) => players.some((p) => valueOf(m, p.id) > 0));
  const [pick, setPick] = useState("dmg");
  const metric = available.find((m) => m.id === pick) ?? available[0];
  const [perMin, setPerMin] = useState(false);
  if (!metric) return <p className="note">Le client n'a pas donné de statistiques détaillées pour cette partie.</p>;

  const ordered = [...players].sort((a, b) => Number(a.teamId !== myTeam) - Number(b.teamId !== myTeam));
  const scale = (v: number) => (perMin && metric.per ? v / minutes : v);
  const values = ordered.map((p) => scale(valueOf(metric, p.id)));
  const max = Math.max(...values, 1);
  const fmt = (v: number) => (perMin && metric.per ? (v >= 1000 ? kilo(v) : v.toFixed(v < 10 ? 1 : 0)) : metric.fmt ? metric.fmt(Math.round(v)) : v >= 10000 ? kilo(v) : int(v));
  const parts = metric.parts?.filter((part) => players.some((p) => num(statsOf.get(p.id)?.[part.key]) > 0));
  const team = (t: number) => ordered.filter((p) => (t === myTeam ? p.teamId === myTeam : p.teamId !== myTeam)).reduce((s, p) => s + scale(valueOf(metric, p.id)), 0);
  const ally = team(myTeam);
  const enemy = team(-1);

  return (
    <div className="gcharts">
      <div className="gcharts-head">
        <div className="chips" role="group" aria-label="Statistique affichée">
          {available.map((m) => (
            <button key={m.id} className="chip" aria-pressed={m.id === metric.id} onClick={() => setPick(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        {metric.per && (
          <button className="chip" aria-pressed={perMin} onClick={() => setPerMin((v) => !v)}>
            Par minute
          </button>
        )}
      </div>

      <div className="gcharts-totals">
        <span style={{ color: "var(--ally)" }}>
          Ton équipe <b>{fmt(ally)}</b>
        </span>
        <i>
          <i style={{ flexGrow: ally || 1, background: "var(--ally)" }} />
          <i style={{ flexGrow: enemy || 1, background: "var(--enemy)" }} />
        </i>
        <span style={{ color: "var(--enemy)" }}>
          <b>{fmt(enemy)}</b> Adversaires
        </span>
      </div>

      <div className="gcharts-bars" role="img" aria-label={`${metric.label} par joueur`}>
        {ordered.map((p, i) => {
          const v = values[i];
          const s = statsOf.get(p.id) ?? {};
          const known = parts?.reduce((sum, part) => sum + num(s[part.key]), 0) ?? 0;
          return (
            <div key={p.id} className={cx("gbar", p.teamId === myTeam ? "ally" : "enemy", p.me && "me", i === 5 && "split")} title={`${p.me ? "Toi" : p.champion} · ${p.name} : ${fmt(v)}`}>
              <b className="mono">{fmt(v)}</b>
              <span className="gbar-track">
                <span className="gbar-fill" style={{ height: `${(v / max) * 100}%` } as CSSProperties}>
                  {parts && known > 0
                    ? parts.map((part) => <i key={part.key} style={{ flexGrow: num(s[part.key]), background: part.color }} />)
                    : <i style={{ flexGrow: 1 }} />}
                </span>
              </span>
              <ChampIcon id={p.championId} />
              <small>{p.me ? "Toi" : p.champion}</small>
            </div>
          );
        })}
      </div>

      {parts && parts.length > 1 && (
        <div className="gcharts-legend">
          {parts.map((part) => (
            <span key={part.key}>
              <i style={{ background: part.color }} />
              {part.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
