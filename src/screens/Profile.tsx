import { RefreshButton } from "../components/RefreshButton";
import { Breathing } from "../components/Breathing";
import { useMemo, useState } from "react";
import { ProfileEditor } from "../components/ProfileEditor";
import { MatchTile } from "../components/ui";
import { ProfileStats } from "../components/ProfileStats";
import { championSplash, rankLabel } from "../lib/lcu";
import type { ClientState } from "../lib/useClient";
import type { Match } from "../lib/types";

const QUEUE_LABELS: Record<string, string> = {
  RANKED_SOLO_5x5: "Solo/Duo",
  RANKED_FLEX_SR: "Flex",
  CHERRY: "Arena",
  RANKED_TFT: "TFT",
  RANKED_TFT_DOUBLE_UP: "TFT Double",
};

export function Profile({ state, onOpenMatch, onChanged, onRefresh }: { state: ClientState; onOpenMatch: (m: Match) => void; onChanged: () => void; onRefresh: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const { summoner, ranked, history, champions, mastery } = state;
  const solo = ranked?.queueMap.RANKED_SOLO_5x5;
  const queues = Object.entries(ranked?.queueMap ?? {}).filter(([key, q]) => q && QUEUE_LABELS[key] && (q.tier || q.wins + q.losses > 0));
  const topMastery = [...mastery.values()].sort((a, b) => b.championPoints - a.championPoints).slice(0, 6);
  const name = (id: number) => champions.get(id)?.name ?? "Champion";

  // Classement des champions sur l'historique chargé.
  const top = useMemo(() => {
    const byChamp = new Map<number, { games: number; wins: number }>();
    for (const m of history) {
      const p = m.participants[0];
      if (!p) continue;
      const s = byChamp.get(p.championId) ?? { games: 0, wins: 0 };
      s.games++;
      if (p.stats.win) s.wins++;
      byChamp.set(p.championId, s);
    }
    return [...byChamp.entries()].sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins).slice(0, 5);
  }, [history]);

  const kda = useMemo(() => {
    const t = history.reduce(
      (acc, m) => {
        const s = m.participants[0]?.stats;
        if (s) {
          acc.k += s.kills;
          acc.d += s.deaths;
          acc.a += s.assists;
        }
        return acc;
      },
      { k: 0, d: 0, a: 0 },
    );
    return ((t.k + t.a) / Math.max(t.d, 1)).toFixed(1);
  }, [history]);

  const winrate = solo && solo.wins + solo.losses > 0 ? Math.round((solo.wins / (solo.wins + solo.losses)) * 100) : null;

  return (
    <>
      {editing && <ProfileEditor summoner={summoner} onChanged={onChanged} onClose={() => setEditing(false)} />}
      <section className="hero" style={{ minHeight: "62vh" }}>
        <div className="hero-bg">{top[0] && <Breathing full src={championSplash(top[0][0])} champ={top[0][0]} />}</div>
        <div className="hero-content" style={{ maxWidth: "none", width: "100%" }}>
          <div className="eyebrow">NIVEAU {summoner?.summonerLevel ?? "–"} · #{summoner?.tagLine ?? ""}</div>
          <h1 className="title">{(summoner?.gameName ?? "Invocateur").toUpperCase()}</h1>
          <div className="btns" style={{ marginBottom: 18 }}>
            <button className="btn btn-ghost small" onClick={() => setEditing(true)}>
              Personnaliser · défis
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 32, flexWrap: "wrap" }}>
            <div className="ranks">
              {queues.length ? (
                queues.map(([key, q]) => (
                  <div key={key}>
                    <span className="label">{QUEUE_LABELS[key]}</span>
                    <b>{rankLabel(q!.tier, q!.division)}</b>
                    <span>
                      {q!.tier ? `${q!.leaguePoints} LP · ` : ""}
                      {q!.wins} V · {q!.losses} D
                      {key === "RANKED_SOLO_5x5" && winrate !== null ? ` · ${winrate} %` : ""}
                    </span>
                  </div>
                ))
              ) : (
                <p className="blurb">Pas encore classé cette saison.</p>
              )}
            </div>
            <div className="profile-stats" style={{ marginLeft: "auto" }}>
              <div>
                <span className="label">KDA récent</span>
                <b>{kda}</b>
              </div>
              <div>
                <span className="label">Parties chargées</span>
                <b>{history.length}</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="rows">
        <ProfileStats history={history} champions={champions} puuid={summoner?.puuid} />

        <section className="row">
          <h2>
            Tes champions <span>sur les {history.length} dernières parties</span>
          </h2>
          {top.length ? (
            <div className="top5">
              {top.map(([id, s], i) => (
                <div key={id} className="tile">
                  <span className="rank-n">{i + 1}</span>
                  <Breathing full src={championSplash(id)} champ={id} />
                  <div className="shade" />
                  <div className="txt">
                    <b>{name(id)}</b>
                    <span>
                      {s.games} partie{s.games > 1 ? "s" : ""} · {Math.round((s.wins / s.games) * 100)} %
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              Aucune partie récente. <RefreshButton onRefresh={onRefresh} label="Actualiser" />
            </div>
          )}
        </section>

        {topMastery.length > 0 && (
          <section className="row">
            <h2>
              Maîtrises <span>tes champions les plus joués de tous les temps</span>
            </h2>
            <div className="tiles">
              {topMastery.map((m) => (
                <div key={m.championId} className="tile">
                  <Breathing full src={championSplash(m.championId)} champ={m.championId} />
                  <div className="shade" />
                  <div className="txt">
                    <b>{name(m.championId)}</b>
                    <span>
                      Niveau {m.championLevel} · {m.championPoints.toLocaleString("fr-FR")} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="row">
          <h2>Historique</h2>
          <div className="tiles">
            {history.map((m) => (
              <MatchTile key={m.gameId} match={m} champion={name(m.participants[0]?.championId ?? 0)} onOpen={onOpenMatch} puuid={summoner?.puuid} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
