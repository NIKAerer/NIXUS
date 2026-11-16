import { useEffect, useState } from "react";
import { actions, useClient } from "../lib/client";
import { useStatic } from "../lib/ddragon";
import { championSplash, clock, lcu, queueName, skinSplash } from "../lib/lcu";
import type { RunePage } from "../lib/types";
import { Art, Breathing, ChampIcon, cx, readJson, writeJson } from "../ui";

interface GamePlayer {
  championId: number;
  puuid?: string;
  selectedPosition?: string;
}
interface Selection {
  championId: number;
  puuid?: string;
  selectedSkinIndex?: number;
  spell1Id?: number;
  spell2Id?: number;
}
interface GameflowSession {
  gameData?: {
    gameId?: number;
    queue?: { id?: number; gameMode?: string; description?: string };
    teamOne?: GamePlayer[];
    teamTwo?: GamePlayer[];
    playerChampionSelections?: Selection[];
  };
}

const complete = (team?: GamePlayer[]) => !!team && team.length >= 5 && team.every((p) => p.championId > 0);

/** Fusionne deux lectures : un champion déjà connu n'est jamais remplacé par une case vide. */
function mergeSession(prev: GameflowSession | null, next: GameflowSession): GameflowSession {
  const g = next.gameData;
  const old = prev?.gameData;
  if (!g || !old) return next;
  const merge = (a?: GamePlayer[], b?: GamePlayer[]) => {
    const list = [...(a ?? [])];
    (b ?? []).forEach((p, i) => {
      const at = list.findIndex((q) => (q.puuid && q.puuid === p.puuid) || false);
      const j = at >= 0 ? at : i < list.length && !list[i].puuid ? i : -1;
      if (j < 0) list.push(p);
      else if (p.championId > 0 || !list[j].championId) list[j] = { ...list[j], ...p, championId: p.championId || list[j].championId };
    });
    return list;
  };
  return { gameData: { ...g, teamOne: merge(old.teamOne, g.teamOne), teamTwo: merge(old.teamTwo, g.teamTwo) } };
}

const START_KEY = "nixus.gameStart";
const ROLE: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "ADC", UTILITY: "Support" };

/** Écran « Partie en cours » : ton champion et son skin, le mode, le chrono, tes sorts et tes runes. Rien n'agit sur la partie. */
export function InGame() {
  const phase = useClient((s) => s.phase);
  const champions = useClient((s) => s.champions);
  const myPuuid = useClient((s) => s.summoner?.puuid);
  const [session, setSession] = useState<GameflowSession | null>(null);
  const [page, setPage] = useState<RunePage | null>(null);
  const [now, setNow] = useState(Date.now());
  const assets = useStatic();

  useEffect(() => {
    lcu<RunePage>("GET", "/lol-perks/v1/currentpage").then(setPage, () => {});
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Le client remplit les équipes au fil du chargement : on relit la session toutes les 4 s tant qu'il manque un champion,
  // et on garde ce qui a déjà été lu (une lecture partielle ne vide jamais une case).
  const full = !!session && complete(session.gameData?.teamOne) && complete(session.gameData?.teamTwo);
  useEffect(() => {
    if (full) return;
    let alive = true;
    const read = () =>
      lcu<GameflowSession>("GET", "/lol-gameflow/v1/session").then(
        (next) => alive && setSession((prev) => mergeSession(prev, next)),
        () => {},
      );
    read();
    const t = setInterval(read, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [full]);

  // Début de partie noté une fois par partie, pour garder le chrono si NIXUS est relancé.
  const gameId = session?.gameData?.gameId ?? 0;
  const [start, setStart] = useState(Date.now());
  useEffect(() => {
    if (!gameId) return;
    const saved = readJson<{ gameId: number; t: number } | null>(START_KEY, null);
    if (saved?.gameId === gameId) setStart(saved.t);
    else writeJson(START_KEY, { gameId, t: Date.now() });
  }, [gameId]);

  const g = session?.gameData;
  const mine = g?.playerChampionSelections?.find((s) => s.puuid && s.puuid === myPuuid);
  const myTeam = g?.teamOne?.some((p) => p.puuid === myPuuid) ? g.teamOne : g?.teamTwo?.some((p) => p.puuid === myPuuid) ? g.teamTwo : g?.teamOne;
  const enemies = myTeam === g?.teamOne ? g?.teamTwo : g?.teamOne;
  const padded = (team?: GamePlayer[]) => [...(team ?? []), ...Array.from({ length: Math.max(0, 5 - (team?.length ?? 0)) }, () => ({ championId: 0 }))];
  const me = myTeam?.find((p) => p.puuid === myPuuid);
  const championId = mine?.championId || me?.championId || 0;
  const skinId = championId && mine?.selectedSkinIndex ? championId * 1000 + mine.selectedSkinIndex : 0;
  const art = championId ? (skinId ? skinSplash(championId, skinId) : championSplash(championId)) : "";
  const name = (id: number) => champions.get(id)?.name ?? "Champion";
  const keystone = page?.selectedPerkIds?.[0];
  const mode = g?.queue?.id ? queueName(g.queue.id) : g?.queue?.description ?? "";
  const reconnect = phase === "Reconnect";

  return (
    <div className="ingame">
      <div className="ingame-bg">{art && <Breathing full key={art} src={art} champ={championId} />}</div>
      <div className="ingame-main">
        <span className="eyebrow">
          <i className={cx("live", reconnect && "off")} /> {reconnect ? "Déconnecté de la partie" : "Partie en cours"}
          {mode ? ` · ${mode}` : ""}
        </span>
        <h1 className="display">{championId ? name(championId) : "En jeu"}</h1>
        <div className="ingame-meta">
          <b className="ingame-clock mono">{clock(Math.max(0, Math.floor((now - start) / 1000)))}</b>
          {me?.selectedPosition && ROLE[me.selectedPosition] && <span className="chip">{ROLE[me.selectedPosition]}</span>}
          {mine?.spell1Id ? (
            <span className="ingame-icons">
              {[mine.spell1Id, mine.spell2Id ?? 0].map((s, i) => {
                const a = assets?.spells.get(s);
                return a ? <Art key={i} src={a.icon} alt={a.name} /> : null;
              })}
            </span>
          ) : null}
          {keystone && assets?.runes.get(keystone) && (
            <span className="ingame-icons rune" title={page?.name}>
              <Art src={assets.runes.get(keystone)!.icon} alt={assets.runes.get(keystone)!.name} />
              {page?.name}
            </span>
          )}
        </div>
        {reconnect && (
          <button className="btn btn-red btn-l" onClick={actions.reconnect}>
            Reconnecter à la partie
          </button>
        )}
        <p className="dim">Bonne game ! NIXUS ne fait rien pendant la partie : l'écran de fin s'ouvrira tout seul.</p>
      </div>

      {(myTeam?.length || enemies?.length) ? (
        <div className="ingame-teams glass">
          <TeamRow label="Ton équipe" players={padded(myTeam)} me={myPuuid} name={name} />
          <b className="h2">VS</b>
          <TeamRow label="Adversaires" players={padded(enemies)} name={name} enemy />
        </div>
      ) : null}
    </div>
  );
}

function TeamRow({ label, players, me, name, enemy }: { label: string; players: GamePlayer[]; me?: string; name: (id: number) => string; enemy?: boolean }) {
  return (
    <div className={cx("ingame-team", enemy && "enemy")}>
      <span className="label">{label}</span>
      <div>
        {players.map((p, i) => (
          <span key={i} className={cx(me && p.puuid === me && "me")} title={p.championId ? name(p.championId) : "?"}>
            <ChampIcon id={p.championId} />
          </span>
        ))}
      </div>
    </div>
  );
}
