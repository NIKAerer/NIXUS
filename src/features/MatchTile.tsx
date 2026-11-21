import { useMemo } from "react";
import { BadgeTag, useBadge } from "../lib/badges";
import { freshSplash, queueName, skinPoolSize, timeAgo } from "../lib/lcu";
import type { Match } from "../lib/types";
import { nav } from "../lib/view";
import { Breathing, cx } from "../ui";

// Couleur du badge de mode : classé, ARAM, Arena.
const MODE_TONE: Record<number, string> = { 420: "ranked", 440: "ranked", 450: "aram", 2400: "aram", 1700: "arena", 1710: "arena" };

/** Tuile d'une partie : splash du champion (skin au hasard), résultat, KDA. Ouvre la fiche au clic. */
export function MatchTile({ match, champion, puuid, owner }: { match: Match; champion: string; puuid?: string; owner?: string }) {
  const p = match.participants[0];
  const badge = useBadge(match.gameId, puuid);
  const pool = skinPoolSize();
  const splash = useMemo(() => (p ? freshSplash(p.championId) : ""), [match.gameId, p?.championId, pool]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  const { kills, deaths, assists, win } = p.stats;
  // Pentakill du joueur : le client donne pentaKills, sinon largestMultiKill vaut 5.
  const pentas = p.stats.pentaKills || (p.stats.largestMultiKill === 5 ? 1 : 0);
  return (
    <button className={cx("tile", win ? "win" : "loss", pentas > 0 && "penta")} title={`${queueName(match.queueId)} · ${timeAgo(match.gameCreation)}${pentas ? " · Pentakill !" : ""} · voir le détail`} onClick={() => nav.openMatch(match, owner)}>
      <span className="cover">
        <Breathing src={splash} champ={p.championId} />
      </span>
      <em className={cx("tile-mode", MODE_TONE[match.queueId])}>{queueName(match.queueId)}</em>
      <BadgeTag badge={badge} />
      {pentas > 0 && <span className="tile-shine" aria-hidden />}
      <span className="tile-txt">
        {pentas > 0 && <em className="tile-penta">Pentakill{pentas > 1 ? ` ×${pentas}` : ""}</em>}
        <small className={win ? "up" : "down"}>{win ? "Victoire" : "Défaite"}</small>
        <b>{champion}</b>
        <span className="mono">
          {kills} / {deaths} / {assists} · {timeAgo(match.gameCreation)}
        </span>
      </span>
    </button>
  );
}
