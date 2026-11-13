import { useMemo, useState } from "react";
import { MatchTile } from "../features/MatchTile";
import { ProfileEditor } from "../features/ProfileEditor";
import { ProfileStats } from "../features/ProfileStats";
import { actions, useClient } from "../lib/client";
import { championSplash, profileIcon, rankLabel } from "../lib/lcu";
import { Art, Breathing, Empty, Icon, RefreshButton, int, kda, pct, plural } from "../ui";

const QUEUE_LABELS: Record<string, string> = {
  RANKED_SOLO_5x5: "Solo/Duo",
  RANKED_FLEX_SR: "Flex",
  CHERRY: "Arena",
  RANKED_TFT: "TFT",
  RANKED_TFT_DOUBLE_UP: "TFT Double",
};

/** Profil : ton identité, tes rangs, les statistiques de tes dernières parties, tes maîtrises et ton historique. */
export function Profile() {
  const summoner = useClient((s) => s.summoner);
  const ranked = useClient((s) => s.ranked);
  const history = useClient((s) => s.history);
  const champions = useClient((s) => s.champions);
  const mastery = useClient((s) => s.mastery);
  const [editing, setEditing] = useState(false);

  const queues = Object.entries(ranked?.queueMap ?? {}).filter(([key, q]) => q && QUEUE_LABELS[key] && (q.tier || q.wins + q.losses > 0));
  const topMastery = useMemo(() => [...mastery.values()].sort((a, b) => b.championPoints - a.championPoints).slice(0, 6), [mastery]);
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

  const total = history.reduce(
    (acc, m) => {
      const s = m.participants[0]?.stats;
      return s ? { k: acc.k + s.kills, d: acc.d + s.deaths, a: acc.a + s.assists } : acc;
    },
    { k: 0, d: 0, a: 0 },
  );
  const cover = top[0]?.[0] ?? topMastery[0]?.championId ?? 64;

  return (
    <div className="page profile">
      {editing && <ProfileEditor onClose={() => setEditing(false)} />}

      <header className="banner banner-tall">
        <div className="cover">
          <Breathing full src={championSplash(cover)} champ={cover} />
        </div>
        <div className="banner-main">
          <div className="who">
            <button className="who-icon" onClick={() => setEditing(true)} title="Changer d'icône, de titre ou de jetons">
              <Art src={summoner ? profileIcon(summoner.profileIconId) : ""} />
              <i>{summoner?.summonerLevel ?? "–"}</i>
            </button>
            <div>
              <span className="eyebrow">Niveau {summoner?.summonerLevel ?? "–"} · #{summoner?.tagLine ?? ""}</span>
              <h1 className="display">{summoner?.gameName ?? "Invocateur"}</h1>
            </div>
          </div>
          <div className="hero-stats">
            {queues.map(([key, q]) => {
              const played = q!.wins + q!.losses;
              return (
                <span key={key} className="stat">
                  <span className="label">{QUEUE_LABELS[key]}</span>
                  <b>{rankLabel(q!.tier, q!.division)}</b>
                  <small>
                    {q!.tier ? `${q!.leaguePoints} LP · ` : ""}
                    {q!.wins} V · {q!.losses} D{played ? ` · ${pct(q!.wins / played)}` : ""}
                  </small>
                </span>
              );
            })}
            {!queues.length && (
              <span className="stat">
                <span className="label">Classé</span>
                <b>Non classé</b>
                <small>Pas encore de rang cette saison</small>
              </span>
            )}
            {history.length > 0 && (
              <span className="stat">
                <span className="label">KDA récent</span>
                <b>{kda(total.k, total.d, total.a)}</b>
                <small>sur {plural(history.length, "partie")}</small>
              </span>
            )}
          </div>
        </div>
        <div className="banner-tools">
          <button className="btn btn-quiet btn-s" onClick={() => setEditing(true)}>
            <Icon name="pen" size={14} /> Personnaliser · défis
          </button>
          <RefreshButton onRefresh={actions.refresh} label="Actualiser" />
        </div>
      </header>

      <ProfileStats />

      <section>
        <h2 className="sec-head">
          Tes champions <span>sur les {history.length} dernières parties</span>
        </h2>
        {top.length ? (
          <div className="posters five">
            {top.map(([id, s], i) => (
              <div key={id} className="poster">
                <span className="cover">
                  <Breathing full src={championSplash(id)} champ={id} />
                </span>
                <span className="poster-n">{i + 1}</span>
                <div className="poster-txt">
                  <b>{name(id)}</b>
                  <small>
                    {plural(s.games, "partie")} · {pct(s.wins / s.games)}
                  </small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Aucune partie récente">
            <RefreshButton onRefresh={actions.refresh} label="Actualiser" />
          </Empty>
        )}
      </section>

      {topMastery.length > 0 && (
        <section>
          <h2 className="sec-head">
            Maîtrises <span>tes champions les plus joués de tous les temps</span>
          </h2>
          <div className="posters six">
            {topMastery.map((m) => (
              <div key={m.championId} className="poster">
                <span className="cover">
                  <Breathing full src={championSplash(m.championId)} champ={m.championId} />
                </span>
                <span className="tag gold poster-tag">Niveau {m.championLevel}</span>
                <div className="poster-txt">
                  <b>{name(m.championId)}</b>
                  <small>{int(m.championPoints)} pts</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section>
          <h2 className="sec-head">Historique</h2>
          <div className="tiles wrap">
            {history.map((m) => (
              <MatchTile key={m.gameId} match={m} champion={name(m.participants[0]?.championId ?? 0)} puuid={summoner?.puuid} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
