import { useEffect, useState } from "react";
import { lcu } from "./lcu";
import { loadDetail } from "./archive";
import type { GameDetail } from "./types";

/**
 * MVP / ACE comme sur l'écran de fin du client : meilleur joueur de l'équipe gagnante (MVP)
 * ou de l'équipe perdante (ACE). Riot ne donne pas sa note : on la recalcule à partir du KDA,
 * de la participation aux kills, des dégâts, de l'or, de la vision et des objectifs.
 */
export type Badge = "MVP" | "ACE" | "";

const KEY = "nixus.badges";
const cache: Record<string, Badge> = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
})();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* stockage plein */
  }
};

const n = (v: unknown) => (typeof v === "number" ? v : 0);

export function computeBadge(d: GameDetail, puuid: string): Badge {
  if (!d.participants?.length || d.gameDuration < 300) return "";
  const me = d.participantIdentities.find((i) => i.player.puuid === puuid)?.participantId;
  if (!me) return "";
  const byTeam = new Map<number, typeof d.participants>();
  d.participants.forEach((p) => byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]));
  const score = new Map<number, number>();
  for (const team of byTeam.values()) {
    const sum = (k: string) => team.reduce((s, p) => s + n(p.stats[k]), 0) || 1;
    const kills = sum("kills");
    const dmg = sum("totalDamageDealtToChampions");
    const gold = sum("goldEarned");
    const vision = sum("visionScore");
    const obj = sum("damageDealtToObjectives");
    for (const p of team) {
      const s = p.stats;
      const kda = (n(s.kills) + n(s.assists)) / Math.max(1, n(s.deaths));
      score.set(
        p.participantId,
        Math.min(kda, 10) * 0.35 + ((n(s.kills) + n(s.assists)) / kills) * 3 + (n(s.totalDamageDealtToChampions) / dmg) * 5 + (n(s.goldEarned) / gold) * 2 + (n(s.visionScore) / vision) * 1.5 + (n(s.damageDealtToObjectives) / obj) * 1.5 - n(s.deaths) * 0.08,
      );
    }
  }
  const mine = d.participants.find((p) => p.participantId === me)!;
  const team = byTeam.get(mine.teamId)!;
  const best = team.reduce((a, b) => ((score.get(b.participantId) ?? 0) > (score.get(a.participantId) ?? 0) ? b : a));
  if (best.participantId !== me) return "";
  return mine.stats.win ? "MVP" : "ACE";
}

// Une requête à la fois, pour ne pas charger le client quand une page affiche beaucoup de parties.
let chain: Promise<unknown> = Promise.resolve();
function fetchBadge(gameId: number, puuid: string): Promise<Badge> {
  const job = chain.then(async () => {
    const d = await lcu<GameDetail>("GET", `/lol-match-history/v1/games/${gameId}`)
      .then((x) => (x?.participants?.length ? x : Promise.reject()))
      .catch(() => loadDetail(gameId));
    return d ? computeBadge(d, puuid) : null;
  });
  chain = job.catch(() => null);
  return job.then((b) => {
    if (b === null) return "";
    cache[`${puuid.slice(0, 8)}:${gameId}`] = b;
    save();
    return b;
  }, () => "");
}

export function useBadge(gameId: number | undefined, puuid: string | undefined): Badge {
  const key = gameId && puuid ? `${puuid.slice(0, 8)}:${gameId}` : "";
  const [b, setB] = useState<Badge>(key ? cache[key] ?? "" : "");
  useEffect(() => {
    if (!key) return;
    if (key in cache) return setB(cache[key]);
    let alive = true;
    fetchBadge(gameId!, puuid!).then((x) => alive && setB(x));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return b;
}

export function BadgeTag({ badge }: { badge: Badge }) {
  if (!badge) return null;
  return (
    <em className={`badge-tag ${badge === "MVP" ? "mvp" : "ace"}`} title={badge === "MVP" ? "Meilleur joueur de la partie (équipe gagnante)" : "Meilleur joueur de l'équipe perdante"}>
      {badge}
    </em>
  );
}
