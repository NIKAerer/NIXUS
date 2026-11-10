import { Breathing } from "./Breathing";
import { useEffect, useState } from "react";
import { championSquare, lcu } from "../lib/lcu";
import type { ChampionSummary, GameflowPhase } from "../lib/types";

interface Ally {
  puuid: string;
  summonerId?: number;
  gameName?: string;
  summonerName?: string;
  championId?: number;
  championName?: string;
  botPlayer?: boolean;
}
interface Ballot {
  gameId?: number;
  eligibleAllies?: Ally[];
  eligiblePlayers?: Ally[];
}

/** Vote d'honneur après la partie, comme l'écran du client. Un clic par allié honoré, rien d'automatique. */
export function HonorBallot({ phase, champions }: { phase: GameflowPhase; champions: Map<number, ChampionSummary> }) {
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [honored, setHonored] = useState<string[]>([]);
  const [closed, setClosed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = phase === "PreEndOfGame" || phase === "EndOfGame";

  useEffect(() => {
    if (!active) {
      setBallot(null);
      return;
    }
    let alive = true;
    const load = () => lcu<Ballot>("GET", "/lol-honor-v2/v1/ballot").then((b) => alive && setBallot(b?.gameId ? b : null), () => alive && setBallot(null));
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [active]);

  const allies = (ballot?.eligibleAllies ?? ballot?.eligiblePlayers ?? []).filter((a) => !a.botPlayer);
  if (!ballot?.gameId || closed === ballot.gameId || !allies.length) return null;

  const honor = async (a: Ally) => {
    setError(null);
    const base = { gameId: ballot.gameId, puuid: a.puuid, summonerId: a.summonerId };
    try {
      await lcu("POST", "/lol-honor-v2/v1/honor-player", { ...base, honorCategory: "HEART" }).catch(() =>
        lcu("POST", "/lol-honor-v2/v1/honor-player", { ...base, honorType: "HEART", recipientPuuid: a.puuid }),
      );
      setHonored((h) => [...h, a.puuid]);
    } catch {
      setError("Le vote n'est plus ouvert pour cette partie.");
    }
  };

  return (
    <div className="honor" role="dialog" aria-label="Honorer un allié">
      <header>
        <b>Honore un allié</b>
        <span>Facultatif. Le vote se ferme tout seul après quelques secondes.</span>
        <button className="fp-close" onClick={() => setClosed(ballot.gameId!)} aria-label="Passer">
          <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="honor-row">
        {allies.map((a) => {
          const done = honored.includes(a.puuid);
          const champ = a.championName ?? (a.championId ? champions.get(a.championId)?.name : undefined);
          return (
            <button key={a.puuid} className={`honor-ally ${done ? "done" : ""}`} disabled={done} onClick={() => honor(a)} title={done ? "Honoré" : `Honorer ${a.gameName ?? a.summonerName ?? champ ?? ""}`}>
              {a.championId ? <Breathing src={championSquare(a.championId)} champ={a.championId} /> : <i />}
              <b>{a.gameName ?? a.summonerName ?? champ ?? "Allié"}</b>
              <small>{done ? "Honoré ♥" : champ ?? ""}</small>
            </button>
          );
        })}
      </div>
      {error && <p className="re-error">{error}</p>}
    </div>
  );
}
