import type { StaticData } from "../lib/ddragon";
import type { Timeline } from "../lib/types";
import type { GamePlayer } from "./game";
import { Replay } from "./Replay";

/** Onglet « Replay » de la fiche de partie : la carte rejouée avec les trajets reconstitués. */
export function Story({ timeline, players, duration, assets }: { timeline: Timeline; players: GamePlayer[]; myTeam?: number; won?: boolean; duration: number; assets: StaticData | null }) {
  return (
    <div className="story">
      <Replay timeline={timeline} players={players} duration={duration} assets={assets} start={null} />
    </div>
  );
}
