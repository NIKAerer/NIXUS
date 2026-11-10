import { Breathing } from "./Breathing";
import { useEffect, useState } from "react";
import { Art } from "./ui";
import { championSquare, lcu, profileIcon, queueName, rankLabel, timeAgo } from "../lib/lcu";
import type { ChampionSummary, Friend, Match, MatchHistory, RankedStats } from "../lib/types";

interface Props {
  friend: Friend;
  champions: Map<number, ChampionSummary>;
  onOpen: (m: Match) => void;
  onClose: () => void;
}

/** Les 20 dernières parties d'un ami et son rang, comme son profil dans le client. */
export function FriendHistory({ friend, champions, onOpen, onClose }: Props) {
  const [games, setGames] = useState<Match[] | null>(null);
  const [error, setError] = useState(false);
  const [ranked, setRanked] = useState<RankedStats | null>(null);

  useEffect(() => {
    setGames(null);
    setError(false);
    lcu<MatchHistory>("GET", `/lol-match-history/v1/products/lol/${friend.puuid}/matches?begIndex=0&endIndex=19`).then(
      (h) => setGames(h?.games?.games ?? []),
      () => setError(true),
    );
    lcu<RankedStats>("GET", `/lol-ranked/v1/ranked-stats/${friend.puuid}`).then(setRanked, () => setRanked(null));
  }, [friend.puuid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const solo = ranked?.queueMap?.RANKED_SOLO_5x5;
  const flex = ranked?.queueMap?.RANKED_FLEX_SR;
  const list = games ?? [];
  const wins = list.filter((g) => g.participants[0]?.stats.win).length;
  const k = list.reduce((n, g) => n + (g.participants[0]?.stats.kills ?? 0), 0);
  const d = list.reduce((n, g) => n + (g.participants[0]?.stats.deaths ?? 0), 0);
  const a = list.reduce((n, g) => n + (g.participants[0]?.stats.assists ?? 0), 0);

  return (
    <div className="overlay sp-overlay" onClick={onClose}>
      <div className="fh" role="dialog" aria-modal="true" aria-label={`Historique de ${friend.gameName}`} onClick={(e) => e.stopPropagation()}>
        <header className="fh-head">
          <span className="fh-icon">
            <Art src={profileIcon(friend.icon)} />
          </span>
          <div className="fh-who">
            <h2>{friend.gameName}</h2>
            <span>
              {solo?.tier && solo.tier !== "NONE" ? `Solo/Duo : ${rankLabel(solo.tier, solo.division)} · ${solo.leaguePoints} LP` : "Solo/Duo : non classé"}
              {flex?.tier && flex.tier !== "NONE" ? ` · Flex : ${rankLabel(flex.tier, flex.division)}` : ""}
            </span>
          </div>
          {list.length > 0 && (
            <div className="fh-sum">
              <b>
                {wins} V · {list.length - wins} D
              </b>
              <span>
                {Math.round((wins / list.length) * 100)} % · KDA {((k + a) / Math.max(1, d)).toFixed(2).replace(".", ",")}
              </span>
            </div>
          )}
          <button className="gd-close sp-close" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="fh-body">
          {error ? (
            <p className="gd-wait">Le client n'a pas renvoyé l'historique de {friend.gameName}.</p>
          ) : games === null ? (
            <p className="gd-wait">Chargement des parties…</p>
          ) : list.length === 0 ? (
            <p className="gd-wait">Aucune partie récente.</p>
          ) : (
            <ul className="fh-list">
              {list.map((g) => {
                const p = g.participants[0];
                const win = !!p?.stats.win;
                const remake = g.gameDuration > 0 && g.gameDuration < 300;
                return (
                  <li key={g.gameId}>
                    <button className={`fh-game ${remake ? "remake" : win ? "win" : "loss"}`} onClick={() => onOpen(g)}>
                      <span className="fh-champ">{p && <Breathing src={championSquare(p.championId)} champ={p.championId} />}</span>
                      <span className="fh-txt">
                        <b>{p ? champions.get(p.championId)?.name ?? "Champion" : "?"}</b>
                        <small>
                          {queueName(g.queueId)} · {Math.round(g.gameDuration / 60)} min · {timeAgo(g.gameCreation)}
                        </small>
                      </span>
                      <span className="fh-kda">
                        {p ? `${p.stats.kills} / ${p.stats.deaths} / ${p.stats.assists}` : ""}
                      </span>
                      <em>{remake ? "Remake" : win ? "Victoire" : "Défaite"}</em>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
