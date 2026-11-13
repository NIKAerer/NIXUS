import { useEffect, useState } from "react";
import { useClient } from "../lib/client";
import { lcu } from "../lib/lcu";
import { ChampIcon, CloseButton, cx } from "../ui";

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
export function HonorBallot() {
  const phase = useClient((s) => s.phase);
  const champions = useClient((s) => s.champions);
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [honored, setHonored] = useState<string[]>([]);
  const [closed, setClosed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = phase === "PreEndOfGame" || phase === "EndOfGame";

  useEffect(() => {
    if (!active) return setBallot(null);
    let alive = true;
    const load = () =>
      lcu<Ballot>("GET", "/lol-honor-v2/v1/ballot").then(
        (b) => alive && setBallot(b?.gameId ? b : null),
        () => alive && setBallot(null),
      );
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
      await lcu("POST", "/lol-honor-v2/v1/honor-player", { ...base, honorCategory: "HEART" }).catch(() => lcu("POST", "/lol-honor-v2/v1/honor-player", { ...base, honorType: "HEART", recipientPuuid: a.puuid }));
      setHonored((h) => [...h, a.puuid]);
    } catch {
      setError("Le vote n'est plus ouvert pour cette partie.");
    }
  };

  return (
    <div className="honor glass" role="dialog" aria-label="Honorer un allié">
      <header>
        <div>
          <b className="h3">Honore un allié</b>
          <span className="note">Facultatif. Le vote se ferme tout seul après quelques secondes.</span>
        </div>
        <CloseButton onClose={() => setClosed(ballot.gameId!)} label="Passer" />
      </header>
      <div className="honor-row">
        {allies.map((a) => {
          const done = honored.includes(a.puuid);
          const champ = a.championName ?? (a.championId ? champions.get(a.championId)?.name : undefined);
          return (
            <button key={a.puuid} className={cx(done && "done")} disabled={done} onClick={() => honor(a)} title={done ? "Honoré" : `Honorer ${a.gameName ?? a.summonerName ?? champ ?? ""}`}>
              <ChampIcon id={a.championId ?? 0} />
              <b>{a.gameName ?? a.summonerName ?? champ ?? "Allié"}</b>
              <small>{done ? "Honoré ♥" : champ ?? ""}</small>
            </button>
          );
        })}
      </div>
      {error && <p className="note bad">{error}</p>}
    </div>
  );
}
