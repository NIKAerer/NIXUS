import { Breathing } from "./Breathing";
import { useCallback, useEffect, useState } from "react";
import { lcu, QUEUES, skinSplash } from "../lib/lcu";
import type { CustomGame, GameQueue } from "../lib/types";

export interface CustomConfig {
  name: string;
  password: string;
  gameMode: string;
  mapId: number;
  teamSize: number;
  mutator: number;
}

interface Props {
  queues: GameQueue[];
  current: number;
  canChange: boolean;
  summonerName: string;
  onPick: (q: GameQueue) => void;
  onCreateCustom: (c: CustomConfig) => void;
  onJoinCustom: (id: number, password?: string) => void;
  onClose: () => void;
}

const MAPS: Record<number, string> = { 11: "Faille de l'invocateur", 12: "Abîme hurlant", 30: "Arène des Rings", 21: "Nexus Blitz", 22: "Convergence" };

/** Repli si le client ne donne pas la liste des files. */
const FALLBACK: GameQueue[] = QUEUES.map((q) => ({
  id: q.id,
  name: q.label,
  description: q.blurb,
  gameMode: q.id === 450 ? "ARAM" : q.id === 1700 ? "CHERRY" : "CLASSIC",
  mapId: q.id === 450 ? 12 : q.id === 1700 ? 30 : 11,
  category: "PvP",
  queueAvailability: "Available",
  isRanked: q.id === 420 || q.id === 440,
}));

// Ordre du client Riot : Partie rapide, Draft, puis le classé ; contre l'IA du plus facile au plus dur.
const PRIORITY = [480, 490, 400, 430, 420, 440, 4310, 450, 2400, 1750, 1700, 1710, 870, 880, 890, 4320, 900, 1900, 1020, 1300, 1400];
const rank = (q: GameQueue) => {
  const i = PRIORITY.indexOf(q.id);
  return i < 0 ? 999 : i;
};
/** Noms en français pour les files connues ; sinon le nom donné par le client. */
const FR: Record<number, string> = {
  480: "Partie rapide", 490: "Partie rapide", 400: "Draft", 430: "Aveugle", 420: "Classé Solo/Duo", 440: "Classé Flex", 4310: "Classé",
  450: "ARAM", 2400: "ARAM : Chaos", 1750: "Arena", 1700: "Arena", 1710: "Arena", 870: "Intro", 880: "Débutant", 890: "Intermédiaire", 4320: "Contre l'IA",
};
const BLURB: Record<number, string> = {
  480: "Nouvelles règles pour des parties plus rapides.", 400: "Sélection avec bannissements, sans enjeu de rang.", 420: "Grimpe le classement en solo ou en duo.",
  440: "Classé en groupe, de 1 à 5 joueurs.", 870: "Pour découvrir le jeu.", 880: "Des bots faciles.", 890: "Des bots plus coriaces.",
};
export const queueLabel = (q: GameQueue) => FR[q.id] || q.name || q.description || (q.isRanked ? "Classé" : "Partie");

type Kind = "pvp" | "ai";
const kindOf = (q: GameQueue): Kind | null => {
  const c = q.gameSelectCategory;
  if (c) return c === "kPvP" ? "pvp" : c === "kVersusAI" ? "ai" : null;
  return q.category === "PvP" ? "pvp" : q.category === "VersusAi" ? "ai" : null;
};
const isTft = (q: GameQueue) => q.gameMode === "TFT" || q.gameSelectModeGroup === "kTeamfightTactics";

/** Grande carte de mode, comme l'écran Jouer du client : Faille, Faille classique, ARAM, Arena, puis les modes temporaires. */
function groupOf(q: GameQueue): string {
  const g = q.gameSelectModeGroup;
  if (g === "kSummonersRift") return "rift";
  if (g === "kJade" || q.gameMode === "JADE") return "jade";
  if (g === "kARAM" || q.mapId === 12) return "aram";
  if (q.gameMode === "CHERRY" || q.mapId === 30) return "arena";
  if (!g && q.mapId === 11 && (q.gameMode === "CLASSIC" || q.gameMode === "SWIFTPLAY")) return "rift";
  return `mode:${q.gameMode || q.id}`;
}
const GROUPS: Record<string, { title: string; sub: string; art: number; tone: string; size?: string }> = {
  rift: { title: "Faille de l'invocateur", sub: "Écrase ta voie et détruis le Nexus adverse.", art: 103, tone: "rift", size: "5c5" },
  jade: { title: "Faille classique", sub: "La Faille d'avant, avec ses règles d'origine.", art: 89, tone: "rift", size: "5c5" },
  aram: { title: "ARAM", sub: "Abîme hurlant · une seule voie", art: 222, tone: "aram", size: "5c5" },
  arena: { title: "Arena", sub: "Duos · rounds rapides et augments", art: 157, tone: "special" },
};
const ORDER = ["rift", "jade", "aram", "arena"];

/** Une seule entrée par nom de file (le client en renvoie parfois plusieurs variantes). */
function dedupe(list: GameQueue[]) {
  const seen = new Map<string, GameQueue>();
  for (const q of list) {
    if (isTft(q) || !kindOf(q)) continue;
    const key = `${kindOf(q)}:${groupOf(q)}:${queueLabel(q).toLowerCase()}`;
    const prev = seen.get(key);
    if (!prev || rank(q) < rank(prev)) seen.set(key, q);
  }
  return [...seen.values()];
}

const CUSTOM_MODES: { label: string; gameMode: string; mapId: number; teamSize: number }[] = [
  { label: "Faille 5c5", gameMode: "CLASSIC", mapId: 11, teamSize: 5 },
  { label: "ARAM 5c5", gameMode: "ARAM", mapId: 12, teamSize: 5 },
  { label: "Faille 1c1", gameMode: "CLASSIC", mapId: 11, teamSize: 1 },
  { label: "Faille 2c2", gameMode: "CLASSIC", mapId: 11, teamSize: 2 },
];
const MUTATORS: [number, string][] = [
  [1, "À l'aveugle"],
  [2, "Draft"],
  [4, "Tout aléatoire"],
  [6, "Draft tournoi"],
];

const PRACTICE: CustomConfig = { name: "Entraînement", password: "", gameMode: "PRACTICETOOL", mapId: 11, teamSize: 5, mutator: 1 };

type Tab = Kind | "training" | "create" | "join";

/** L'écran Jouer, rangé comme celui du client : JcJ, Coop vs IA, Entraînement, Créer, Rejoindre. */
export function ModePicker({ queues, current, canChange, summonerName, onPick, onCreateCustom, onJoinCustom, onClose }: Props) {
  const all = dedupe(queues.length ? queues : FALLBACK);
  const currentQueue = all.find((q) => q.id === current);
  const [tab, setTab] = useState<Tab>(() => (currentQueue && kindOf(currentQueue)) || "pvp");
  const kind: Kind = tab === "ai" ? "ai" : "pvp";
  const list = all.filter((q) => kindOf(q) === kind);

  const groups = new Map<string, GameQueue[]>();
  for (const q of list) groups.set(groupOf(q), [...(groups.get(groupOf(q)) ?? []), q]);
  const keys = [...groups.keys()].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));

  const [groupPick, setGroup] = useState(() => (currentQueue ? groupOf(currentQueue) : "rift"));
  const group = groups.has(groupPick) ? groupPick : keys[0];
  const shown = (groups.get(group) ?? []).sort((a, b) => rank(a) - rank(b) || queueLabel(a).localeCompare(queueLabel(b), "fr"));
  const [chosen, setChosen] = useState<number>(current);
  const picked = shown.find((q) => q.id === chosen) ?? shown[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const info = (key: string) => {
    const g = GROUPS[key];
    if (g) return g;
    const q = groups.get(key)?.[0];
    return { title: q ? queueLabel(q) : "Mode", sub: MAPS[q?.mapId ?? 0] ?? "Mode temporaire", art: [1, 51, 89, 266][key.length % 4], tone: "special", size: undefined };
  };
  const TABS: [Tab, string][] = [
    ["pvp", "JcJ"],
    ["ai", "Coop vs IA"],
    ["training", "Entraînement"],
    ["create", "Créer une perso"],
    ["join", "Rejoindre une perso"],
  ];

  return (
    <div className="overlay sp-overlay" onClick={onClose}>
      <div className="mp" role="dialog" aria-modal="true" aria-label="Modes de jeu" onClick={(e) => e.stopPropagation()}>
        <header className="sp-head">
          <div>
            <h2>Jouer</h2>
            <span>{canChange ? "Choisis un mode, puis la file." : "Seul le chef du groupe peut changer de mode."}</span>
          </div>
          <button className="gd-close sp-close" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <nav className="gd-tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => (setTab(id), setChosen(0))}>
              {label}
            </button>
          ))}
        </nav>

        <div className="mp-body">
          {tab === "pvp" || tab === "ai" ? (
            <div className="mp-play">
              {keys.length === 0 ? (
                <p className="gd-wait">Aucun mode ouvert pour ton compte ici en ce moment.</p>
              ) : (
                <div className="mp-maps" role="radiogroup" aria-label="Mode">
                  {keys.map((key) => {
                    const g = info(key);
                    const temp = !GROUPS[key];
                    return (
                      <button key={key} role="radio" aria-checked={group === key} className={`mp-map-card ${g.tone}`} onClick={() => (setGroup(key), setChosen(0))}>
                        <Breathing full src={skinSplash(g.art, g.art * 1000)} champ={g.art} />
                        <span className="mp-map-shade" />
                        {temp && <em>Temporaire</em>}
                        {g.size && <span className="mp-size">{g.size}</span>}
                        <b>{g.title}</b>
                        <small>{g.sub}</small>
                      </button>
                    );
                  })}
                </div>
              )}

              {shown.length > 0 && (
                <div className="mp-queues">
                  <ul className="mp-radios" role="radiogroup" aria-label="File">
                    {shown.map((q) => (
                      <li key={q.id}>
                        <button role="radio" aria-checked={picked?.id === q.id} onClick={() => setChosen(q.id)} disabled={!canChange}>
                          <i aria-hidden="true" />
                          <span>
                            <b>
                              {queueLabel(q)}
                              {q.isRanked && <em>Classé</em>}
                              {q.id === current && <em className="now">Actuelle</em>}
                            </b>
                            {BLURB[q.id] ? <small>{BLURB[q.id]}</small> : q.description && q.description !== q.name ? <small>{q.description}</small> : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button className="btn btn-primary mp-confirm" disabled={!canChange || !picked} onClick={() => picked && onPick(picked)}>
                    Confirmer
                  </button>
                </div>
              )}
            </div>
          ) : tab === "training" ? (
            <div className="mp-training">
              <button className="mp-map-card practice big" aria-checked="true" role="radio" disabled={!canChange} onClick={() => onCreateCustom(PRACTICE)}>
                <Breathing full src={skinSplash(64, 64000)} champ={64} />
                <span className="mp-map-shade" />
                <span className="mp-size">1 à 10 joueurs</span>
                <b>Outil d'entraînement</b>
                <small>Entraîne ton champion préféré sur la Faille : or et niveau illimités, mannequins, temps de recharge réglables. Tous les champions sont débloqués en solo.</small>
              </button>
              <button className="btn btn-primary mp-confirm" disabled={!canChange} onClick={() => onCreateCustom(PRACTICE)}>
                Lancer l'entraînement
              </button>
            </div>
          ) : (
            <CustomTab view={tab} canChange={canChange} summonerName={summonerName} onCreate={onCreateCustom} onJoin={onJoinCustom} />
          )}
        </div>
      </div>
    </div>
  );
}

function CustomTab({ view, canChange, summonerName, onCreate, onJoin }: { view: "create" | "join"; canChange: boolean; summonerName: string; onCreate: (c: CustomConfig) => void; onJoin: (id: number, password?: string) => void }) {
  const [name, setName] = useState(`Partie de ${summonerName}`);
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState(0);
  const [mutator, setMutator] = useState(1);
  const [games, setGames] = useState<CustomGame[] | null>(null);
  const [joining, setJoining] = useState<number | null>(null);
  const [joinPassword, setJoinPassword] = useState("");

  const refresh = useCallback(async () => {
    setGames(null);
    await lcu("POST", "/lol-lobby/v1/custom-games/refresh").catch(() => {});
    const list = await lcu<CustomGame[]>("GET", "/lol-lobby/v1/custom-games").catch(() => []);
    setGames(list ?? []);
  }, []);

  useEffect(() => {
    if (view === "join") refresh();
  }, [refresh, view]);

  const m = CUSTOM_MODES[mode];

  return (
    <div className="mp-custom single">
      {view === "create" && (
      <div className="mp-custom-left">
        <form
          className="mp-form"
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({ name: name.trim() || "Partie perso", password, gameMode: m.gameMode, mapId: m.mapId, teamSize: m.teamSize, mutator: m.gameMode === "ARAM" ? 4 : mutator });
          }}
        >
          <h3>Créer une partie personnalisée</h3>
          <label>
            <span className="label">Nom</span>
            <input className="search" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </label>
          <label>
            <span className="label">Mot de passe (facultatif)</span>
            <input className="search" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={40} />
          </label>
          <span className="label">Carte et format</span>
          <div className="squad-seg mp-seg">
            {CUSTOM_MODES.map((c, i) => (
              <button type="button" key={c.label} aria-pressed={mode === i} onClick={() => setMode(i)}>
                {c.label}
              </button>
            ))}
          </div>
          {m.gameMode !== "ARAM" && (
            <>
              <span className="label">Sélection</span>
              <div className="squad-seg mp-seg">
                {MUTATORS.map(([id, label]) => (
                  <button type="button" key={id} aria-pressed={mutator === id} onClick={() => setMutator(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          <button className="btn btn-primary" type="submit" disabled={!canChange}>
            Créer la partie
          </button>
        </form>
      </div>
      )}

      {view === "join" && (
      <section className="mp-open">
        <div className="mp-open-head">
          <h3>Parties ouvertes</h3>
          <button className="squad-leave" onClick={refresh}>
            Actualiser
          </button>
        </div>
        {games === null ? (
          <p className="gd-wait">Recherche des parties…</p>
        ) : games.length === 0 ? (
          <p className="gd-wait">Aucune partie personnalisée ouverte pour l'instant.</p>
        ) : (
          <ul className="mp-games">
            {games.map((g) => (
              <li key={g.id}>
                <div className="mp-game">
                  <div className="mp-game-txt">
                    <b>
                      {g.lobbyName}
                      {g.hasPassword && <em className="mp-lock">Mot de passe</em>}
                    </b>
                    <span>
                      {MAPS[g.mapId ?? 0] ?? g.gameMode ?? "Carte"} · {g.ownerDisplayName ?? g.ownerSummonerName ?? "?"} · {g.filledPlayerSlots ?? 0}/{g.maxPlayers ?? 10}
                    </span>
                  </div>
                  <button
                    className="mini"
                    onClick={() => {
                      if (g.hasPassword && joining !== g.id) {
                        setJoining(g.id);
                        setJoinPassword("");
                      } else onJoin(g.id, joinPassword || undefined);
                    }}
                  >
                    Rejoindre
                  </button>
                </div>
                {joining === g.id && (
                  <form
                    className="mp-join"
                    onSubmit={(e) => {
                      e.preventDefault();
                      onJoin(g.id, joinPassword);
                    }}
                  >
                    <input className="search" autoFocus placeholder="Mot de passe" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} />
                    <button className="btn btn-primary small" type="submit">
                      Entrer
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </div>
  );
}
