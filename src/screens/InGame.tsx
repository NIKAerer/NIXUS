import { Breathing } from "../components/Breathing";
import { useEffect, useState } from "react";
import { Art } from "../components/ui";
import { championSplash, championSquare, clock, lcu, queueName, skinSplash } from "../lib/lcu";
import { useStatic } from "../lib/ddragon";
import type { ChampionSummary, GameflowPhase, RunePage } from "../lib/types";

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

const START_KEY = "nixus.gameStart";
const ROLE: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "ADC", UTILITY: "Support" };

/** Écran « Partie en cours » : ton champion et son skin, le mode, le chrono, tes sorts et tes runes. Rien n'agit sur la partie. */
export function InGame({ phase, champions, myPuuid, onReconnect }: { phase: GameflowPhase; champions: Map<number, ChampionSummary>; myPuuid?: string; onReconnect: () => void }) {
  const [session, setSession] = useState<GameflowSession | null>(null);
  const [page, setPage] = useState<RunePage | null>(null);
  const [now, setNow] = useState(Date.now());
  const assets = useStatic();

  useEffect(() => {
    lcu<GameflowSession>("GET", "/lol-gameflow/v1/session").then(setSession, () => {});
    lcu<RunePage>("GET", "/lol-perks/v1/currentpage").then(setPage, () => {});
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Début de partie noté une fois par partie, pour garder le chrono si NIXUS est relancé.
  const gameId = session?.gameData?.gameId ?? 0;
  const [start, setStart] = useState(Date.now());
  useEffect(() => {
    if (!gameId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(START_KEY) ?? "null");
      if (saved?.gameId === gameId) setStart(saved.t);
      else localStorage.setItem(START_KEY, JSON.stringify({ gameId, t: Date.now() }));
    } catch {
      /* stockage indisponible */
    }
  }, [gameId]);

  const g = session?.gameData;
  const mine = g?.playerChampionSelections?.find((s) => s.puuid && s.puuid === myPuuid);
  const myTeam = g?.teamOne?.some((p) => p.puuid === myPuuid) ? g.teamOne : g?.teamTwo?.some((p) => p.puuid === myPuuid) ? g.teamTwo : g?.teamOne;
  const enemies = myTeam === g?.teamOne ? g?.teamTwo : g?.teamOne;
  const me = myTeam?.find((p) => p.puuid === myPuuid);
  const championId = mine?.championId || me?.championId || 0;
  const skinId = championId && mine?.selectedSkinIndex ? championId * 1000 + mine.selectedSkinIndex : 0;
  const art = championId ? (skinId ? skinSplash(championId, skinId) : championSplash(championId)) : "";
  const name = (id: number) => champions.get(id)?.name ?? "Champion";
  const keystone = page?.selectedPerkIds?.[0];
  const mode = g?.queue?.id ? queueName(g.queue.id) : g?.queue?.description ?? "";

  return (
    <div className="ig">
      <div className="ig-bg">{art && <Breathing full key={art} src={art} champ={championId} />}</div>
      <div className="ig-shade" />
      <div className="ig-content">
        <div className="eyebrow">
          <span className="ig-live" /> {phase === "Reconnect" ? "Déconnecté de la partie" : "Partie en cours"}
          {mode ? ` · ${mode}` : ""}
        </div>
        <h1 className="title">{championId ? name(championId).toUpperCase() : "EN JEU"}</h1>
        <div className="ig-meta">
          <span className="ig-clock">{clock(Math.max(0, Math.floor((now - start) / 1000)))}</span>
          {me?.selectedPosition && ROLE[me.selectedPosition] && <span>{ROLE[me.selectedPosition]}</span>}
          {mine?.spell1Id ? (
            <span className="ig-spells">
              {[mine.spell1Id, mine.spell2Id ?? 0].map((s, i) => {
                const a = assets?.spells.get(s);
                return a ? <Art key={i} src={a.icon} alt={a.name} /> : null;
              })}
            </span>
          ) : null}
          {keystone && assets?.runes.get(keystone) && (
            <span className="ig-rune" title={page?.name}>
              <Art src={assets.runes.get(keystone)!.icon} alt={assets.runes.get(keystone)!.name} />
              {page?.name}
            </span>
          )}
        </div>

        {phase === "Reconnect" && (
          <div className="btns">
            <button className="btn btn-red" onClick={onReconnect}>
              Reconnecter à la partie
            </button>
          </div>
        )}

        {(myTeam?.length || enemies?.length) && (
          <div className="ig-teams">
            <TeamRow label="Ton équipe" players={myTeam ?? []} me={myPuuid} name={name} />
            <span className="ig-vs">VS</span>
            <TeamRow label="Adversaires" players={enemies ?? []} name={name} />
          </div>
        )}
        <p className="ig-note">Bonne game ! NIXUS ne fait rien pendant la partie : l'écran de fin s'ouvrira tout seul.</p>
      </div>
    </div>
  );
}

function TeamRow({ label, players, me, name }: { label: string; players: GamePlayer[]; me?: string; name: (id: number) => string }) {
  return (
    <div className="ig-team">
      <span className="label">{label}</span>
      <div>
        {players.map((p, i) => (
          <span key={i} className={`ig-champ ${me && p.puuid === me ? "me" : ""}`} title={p.championId ? name(p.championId) : "?"}>
            {p.championId ? <Breathing src={championSquare(p.championId)} champ={p.championId} alt={name(p.championId)} /> : <i>?</i>}
          </span>
        ))}
      </div>
    </div>
  );
}
