import { useCallback, useEffect, useState } from "react";
import { actions, useClient, type CustomConfig } from "../lib/client";
import { lcu, QUEUES, skinSplash } from "../lib/lcu";
import type { CustomGame, GameQueue } from "../lib/types";
import { nav, useView } from "../lib/view";
import { Breathing, CloseButton, Modal, Seg, Tabs, cx } from "../ui";

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
const GROUPS: Record<string, { title: string; sub: string; art: number; size?: string }> = {
  rift: { title: "Faille de l'invocateur", sub: "Écrase ta voie et détruis le Nexus adverse.", art: 103, size: "5c5" },
  jade: { title: "Faille classique", sub: "La Faille d'avant, avec ses règles d'origine.", art: 89, size: "5c5" },
  aram: { title: "ARAM", sub: "Abîme hurlant · une seule voie", art: 222, size: "5c5" },
  arena: { title: "Arena", sub: "Duos · rounds rapides et augments", art: 157 },
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
const TABS: [Tab, string][] = [
  ["pvp", "JcJ"],
  ["ai", "Coop vs IA"],
  ["training", "Entraînement"],
  ["create", "Créer une perso"],
  ["join", "Rejoindre une perso"],
];

/** L'écran Jouer, rangé comme celui du client : JcJ, Coop vs IA, Entraînement, Créer, Rejoindre. */
export function ModePicker() {
  const queues = useClient((s) => s.queues);
  const lobby = useClient((s) => s.lobby);
  const phase = useClient((s) => s.phase);
  const summoner = useClient((s) => s.summoner);
  const queueId = useView((s) => s.queueId);
  const onClose = () => nav.modes(false);

  const current = lobby?.gameConfig.isCustom ? -1 : queueId;
  const canChange = (!lobby || !!lobby.localMember?.isLeader) && phase !== "Matchmaking" && phase !== "ReadyCheck";
  const all = dedupe(queues.length ? queues : FALLBACK);
  const currentQueue = all.find((q) => q.id === current);
  const [tab, setTab] = useState<Tab>(() => (currentQueue && kindOf(currentQueue)) || "pvp");
  const kind: Kind = tab === "ai" ? "ai" : "pvp";

  const groups = new Map<string, GameQueue[]>();
  for (const q of all.filter((q) => kindOf(q) === kind)) groups.set(groupOf(q), [...(groups.get(groupOf(q)) ?? []), q]);
  const keys = [...groups.keys()].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));

  const [groupPick, setGroup] = useState(() => (currentQueue ? groupOf(currentQueue) : "rift"));
  const group = groups.has(groupPick) ? groupPick : keys[0];
  const shown = [...(groups.get(group) ?? [])].sort((a, b) => rank(a) - rank(b) || queueLabel(a).localeCompare(queueLabel(b), "fr"));
  const [chosen, setChosen] = useState<number>(current);
  const picked = shown.find((q) => q.id === chosen) ?? shown[0];

  const info = (key: string) => {
    const g = GROUPS[key];
    if (g) return g;
    const q = groups.get(key)?.[0];
    return { title: q ? queueLabel(q) : "Mode", sub: MAPS[q?.mapId ?? 0] ?? "Mode temporaire", art: [1, 51, 89, 266][key.length % 4], size: undefined };
  };

  const confirm = (q: GameQueue) => {
    nav.queue(q.id);
    onClose();
    // Avec un groupe déjà ouvert, on le bascule sur la nouvelle file.
    if (lobby) actions.openLobby(q.id);
  };
  const createCustom = (c: CustomConfig) => {
    onClose();
    actions.createCustom(c);
  };

  return (
    <Modal label="Modes de jeu" onClose={onClose} size="xl" className="modes">
      <header className="modal-head">
        <div className="grow">
          <h2>Jouer</h2>
          <small>{canChange ? "Choisis un mode, puis la file." : "Seul le chef du groupe peut changer de mode, et pas pendant une recherche."}</small>
        </div>
        <CloseButton onClose={onClose} />
      </header>
      <Tabs value={tab} options={TABS} onChange={(t) => (setTab(t), setChosen(0))} />

      <div className="modes-body">
        {tab === "pvp" || tab === "ai" ? (
          keys.length === 0 ? (
            <p className="wait">Aucun mode ouvert pour ton compte ici en ce moment.</p>
          ) : (
            <>
              <div className="modes-maps" role="radiogroup" aria-label="Mode">
                {keys.map((key) => {
                  const g = info(key);
                  return (
                    <button key={key} role="radio" aria-checked={group === key} className="mode-card" onClick={() => (setGroup(key), setChosen(0))}>
                      <span className="cover">
                        <Breathing full src={skinSplash(g.art, g.art * 1000)} champ={g.art} />
                      </span>
                      {!GROUPS[key] && <em className="tag red">Temporaire</em>}
                      {g.size && <em className="tag mode-size">{g.size}</em>}
                      <b>{g.title}</b>
                      <small>{g.sub}</small>
                    </button>
                  );
                })}
              </div>
              <div className="modes-queues">
                <ul role="radiogroup" aria-label="File">
                  {shown.map((q) => (
                    <li key={q.id}>
                      <button role="radio" aria-checked={picked?.id === q.id} onClick={() => setChosen(q.id)} disabled={!canChange}>
                        <i aria-hidden="true" />
                        <span>
                          <b>
                            {queueLabel(q)}
                            {q.isRanked && <em className="tag gold">Classé</em>}
                            {q.id === current && <em className="tag">Actuelle</em>}
                          </b>
                          {BLURB[q.id] ? <small>{BLURB[q.id]}</small> : q.description && q.description !== q.name ? <small>{q.description}</small> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button className="btn btn-white btn-l" disabled={!canChange || !picked} onClick={() => picked && confirm(picked)}>
                  Choisir {picked ? queueLabel(picked) : ""}
                </button>
              </div>
            </>
          )
        ) : tab === "training" ? (
          <div className="modes-training">
            <button className="mode-card big" disabled={!canChange} onClick={() => createCustom(PRACTICE)}>
              <span className="cover">
                <Breathing full src={skinSplash(64, 64000)} champ={64} />
              </span>
              <em className="tag mode-size">1 à 10 joueurs</em>
              <b>Outil d'entraînement</b>
              <small>Entraîne ton champion préféré sur la Faille : or et niveau illimités, mannequins, temps de recharge réglables. Tous les champions sont débloqués en solo.</small>
            </button>
            <button className="btn btn-white btn-l" disabled={!canChange} onClick={() => createCustom(PRACTICE)}>
              Lancer l'entraînement
            </button>
          </div>
        ) : tab === "create" ? (
          <CreateCustom canChange={canChange} summonerName={summoner?.gameName ?? "Invocateur"} onCreate={createCustom} />
        ) : (
          <JoinCustom
            onJoin={(id, password) => {
              onClose();
              actions.joinCustom(id, password);
            }}
          />
        )}
      </div>
    </Modal>
  );
}

function CreateCustom({ canChange, summonerName, onCreate }: { canChange: boolean; summonerName: string; onCreate: (c: CustomConfig) => void }) {
  const [name, setName] = useState(`Partie de ${summonerName}`);
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState(0);
  const [mutator, setMutator] = useState(1);
  const m = CUSTOM_MODES[mode];
  return (
    <form
      className="modes-form card card-pad"
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ name: name.trim() || "Partie perso", password, gameMode: m.gameMode, mapId: m.mapId, teamSize: m.teamSize, mutator: m.gameMode === "ARAM" ? 4 : mutator });
      }}
    >
      <h3>Créer une partie personnalisée</h3>
      <label className="field">
        <span className="label">Nom</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      <label className="field">
        <span className="label">Mot de passe (facultatif)</span>
        <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={40} />
      </label>
      <div className="field">
        <span className="label">Carte et format</span>
        <Seg value={mode} onChange={setMode} options={CUSTOM_MODES.map((c, i) => [i, c.label] as const)} />
      </div>
      {m.gameMode !== "ARAM" && (
        <div className="field">
          <span className="label">Sélection</span>
          <Seg value={mutator} onChange={setMutator} options={MUTATORS} />
        </div>
      )}
      <button className="btn btn-white" type="submit" disabled={!canChange}>
        Créer la partie
      </button>
    </form>
  );
}

function JoinCustom({ onJoin }: { onJoin: (id: number, password?: string) => void }) {
  const [games, setGames] = useState<CustomGame[] | null>(null);
  const [joining, setJoining] = useState<number | null>(null);
  const [password, setPassword] = useState("");

  const refresh = useCallback(async () => {
    setGames(null);
    await lcu("POST", "/lol-lobby/v1/custom-games/refresh").catch(() => {});
    const list = await lcu<CustomGame[]>("GET", "/lol-lobby/v1/custom-games").catch(() => []);
    setGames(list ?? []);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <section className="modes-open card card-pad">
      <div className="card-head">
        Parties ouvertes
        <span>{games ? `${games.length} trouvée${games.length > 1 ? "s" : ""}` : ""}</span>
        <button className="link" onClick={refresh} style={{ marginLeft: "auto" }}>
          Actualiser
        </button>
      </div>
      {games === null ? (
        <p className="wait">Recherche des parties…</p>
      ) : games.length === 0 ? (
        <p className="wait">Aucune partie personnalisée ouverte pour l'instant.</p>
      ) : (
        <ul>
          {games.map((g) => (
            <li key={g.id} className={cx(joining === g.id && "open")}>
              <div>
                <b>
                  {g.lobbyName}
                  {g.hasPassword && <em className="tag">Mot de passe</em>}
                </b>
                <span className="dim">
                  {MAPS[g.mapId ?? 0] ?? g.gameMode ?? "Carte"} · {g.ownerDisplayName ?? g.ownerSummonerName ?? "?"} · {g.filledPlayerSlots ?? 0}/{g.maxPlayers ?? 10}
                </span>
              </div>
              {joining === g.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onJoin(g.id, password);
                  }}
                >
                  <input className="input" autoFocus placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button className="mini" type="submit">
                    Entrer
                  </button>
                </form>
              ) : (
                <button
                  className="mini"
                  onClick={() => {
                    if (g.hasPassword) {
                      setJoining(g.id);
                      setPassword("");
                    } else onJoin(g.id);
                  }}
                >
                  Rejoindre
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
