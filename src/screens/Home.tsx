import { useEffect, useState } from "react";
import { Leaderboard } from "../features/Leaderboard";
import { PatchCard } from "./Patch";
import { MatchTile } from "../features/MatchTile";
import { readHeroSkin, SkinPicker, type HeroSkin } from "../features/SkinPicker";
import { actions, useClient } from "../lib/client";
import { championSplash, clock, rankLabel, skinSplash } from "../lib/lcu";
import type { RankedQueue } from "../lib/types";
import { usePlay } from "../shell/PlayDock";
import { queueInfo, useView } from "../lib/view";
import { Breathing, Empty, Icon, RefreshButton, Skeleton, cx } from "../ui";

/** Accueil : le champion en grand, la file choisie, ta journée, le classement entre amis et tes dernières parties. */
export function Home() {
  const history = useClient((s) => s.history);
  const historyLoaded = useClient((s) => s.historyLoaded);
  const champions = useClient((s) => s.champions);
  const ranked = useClient((s) => s.ranked);
  const lobby = useClient((s) => s.lobby);
  const queues = useClient((s) => s.queues);
  const phase = useClient((s) => s.phase);
  const puuid = useClient((s) => s.summoner?.puuid);
  const queueId = useView((s) => s.queueId);
  const [heroSkin, setHeroSkin] = useState<HeroSkin | null>(readHeroSkin);
  const [picking, setPicking] = useState(false);

  const info = queueInfo(queueId, queues, lobby);
  const searching = phase === "Matchmaking" || phase === "ReadyCheck";
  const heroChampion = history[0]?.participants[0]?.championId ?? 64;
  // Fond automatique : les derniers champions joués défilent, chacun avec un skin tiré au hasard.
  const heroList = [...new Set(history.map((m) => m.participants[0]?.championId).filter(Boolean) as number[])].slice(0, 5);
  if (!heroList.length) heroList.push(heroChampion);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (heroList.length < 2) return;
    const t = window.setInterval(() => setSlide((s) => s + 1), 12000);
    return () => clearInterval(t);
  }, [heroList.length]);
  const shownChampion = heroSkin?.championId ?? heroList[slide % heroList.length];

  const rank = ranked?.queueMap[queueId === 440 ? "RANKED_FLEX_SR" : "RANKED_SOLO_5x5"];
  const champName = (id: number) => champions.get(id)?.name ?? "Champion";
  const today = history.filter((m) => Date.now() - m.gameCreation < 12 * 3600_000);
  const wins = today.filter((m) => m.participants[0]?.stats.win).length;
  // Série en cours sur les dernières parties.
  let streak = 0;
  for (const m of history) {
    if (m.participants[0]?.stats.win !== history[0]?.participants[0]?.stats.win) break;
    streak++;
  }
  const streakWin = !!history[0]?.participants[0]?.stats.win;

  return (
    <>
      <section className="hero">
        <div className="hero-bg">
          {heroSkin ? (
            <Breathing full key={heroSkin.skinId} src={skinSplash(heroSkin.championId, heroSkin.skinId)} champ={heroSkin.championId} className="on" />
          ) : (
            heroList.map((id, i) => <Breathing full key={id} src={championSplash(id)} champ={id} className={i === slide % heroList.length ? "on" : ""} />)
          )}
        </div>
        <HeroFx />

        <div className="hero-main">
          <div className="hero-top">
            <span className="eyebrow">{searching ? "Recherche en cours" : lobby ? "Groupe prêt" : "File sélectionnée"}</span>
            <div className="hero-foot">
              <span className="hero-champ">{champName(shownChampion)}</span>
              {!heroSkin && heroList.length > 1 && (
                <span className="hero-dots" aria-hidden="true">
                  {heroList.map((id, i) => (
                    <i key={id} className={cx(i === slide % heroList.length && "on")} />
                  ))}
                </span>
              )}
              <button className="chip" onClick={() => setPicking(true)} title="Choisir le champion et le skin affichés ici">
                <Icon name="pen" size={13} /> Changer le fond
              </button>
            </div>
          </div>
          <h1 className="display">{info.title}</h1>
          <p className="hero-blurb">{info.blurb}</p>
          <HeroPlay rank={info.ranked ? rank : undefined} recent={history.slice(0, 5).map((m) => !!m.participants[0]?.stats.win).reverse()} streak={streak} streakWin={streakWin} today={today.length} wins={wins} />
        </div>

        <div className="hero-side">
          <PatchCard />
          <Leaderboard className="hero-board" />
        </div>

      </section>

      <section className="strip">
        <h2 className="sec-head">
          Dernières parties
          {today.length > 0 && (
            <span>
              Aujourd'hui : {wins} V · {today.length - wins} D
            </span>
          )}
        </h2>
        {history.length ? (
          <div className="tiles">
            {history.slice(0, 6).map((m) => (
              <MatchTile key={m.gameId} match={m} champion={champName(m.participants[0]?.championId ?? 0)} puuid={puuid} />
            ))}
          </div>
        ) : !historyLoaded ? (
          <div className="tiles" aria-label="Chargement de tes dernières parties">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="tile" />
            ))}
          </div>
        ) : (
          <Empty title="Pas encore de partie récente">
            Si tu as déjà joué, le client n'a sans doute pas fini de charger ton historique. NIXUS réessaie tout seul.
            <br />
            <RefreshButton onRefresh={actions.refresh} label="Actualiser" />
          </Empty>
        )}
      </section>

      {picking && <SkinPicker champions={champions} current={heroSkin} autoChampion={heroChampion} onChange={setHeroSkin} onClose={() => setPicking(false)} />}
    </>
  );
}

const TIER_ORDER = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"];
const DIVISIONS = ["IV", "III", "II", "I"];

/** Prochain palier : la division au-dessus, ou le tier suivant après la I. Rien au-dessus de Diamant (LP sans plafond). */
function nextStep(rank: RankedQueue) {
  const t = TIER_ORDER.indexOf(rank.tier);
  const d = DIVISIONS.indexOf(rank.division);
  if (t < 0 || d < 0) return null;
  if (d < 3) return rankLabel(rank.tier, DIVISIONS[d + 1]);
  return t + 1 < TIER_ORDER.length ? rankLabel(TIER_ORDER[t + 1], "IV") : "Maître";
}

/** Le gros bouton Jouer de l'accueil, avec à côté ce que la prochaine partie peut t'apporter. */
function HeroPlay({ rank, recent, streak, streakWin, today, wins }: { rank?: RankedQueue; recent: boolean[]; streak: number; streakWin: boolean; today: number; wins: number }) {
  const p = usePlay();
  const next = rank?.tier ? nextStep(rank) : null;
  const lp = rank?.leaguePoints ?? 0;
  const mood =
    streak >= 2
      ? streakWin
        ? `${streak} victoires de suite. Continue comme ça.`
        : `${streak} défaites de suite. Respire, ça va tourner.`
      : today
        ? `Aujourd'hui : ${wins} V · ${today - wins} D.`
        : "Première partie du jour.";

  const label = p.searching ? clock(p.time) : p.preparing ? "…" : p.info.custom ? "Lancer" : "Jouer";
  const sub = p.searching
    ? p.found
      ? "Partie trouvée"
      : "Recherche en cours"
    : p.preparing
      ? "Préparation du client"
      : p.info.title;
  const hint = p.searching ? (p.eta ? `Temps estimé ${clock(p.eta)}` : "Temps estimé inconnu") : p.leader ? null : "Le chef du groupe lance la recherche";

  return (
    <div className={cx("heroplay", p.searching && "searching")}>
      <button className="heroplay-btn" onClick={p.go} disabled={p.searching || p.preparing || !p.leader} aria-label={p.searching ? `Recherche en cours, ${clock(p.time)}` : `${label} : ${p.info.title}`}>
        <Icon name="play" fill size={40} />
        <span className="heroplay-word">{label}</span>
        <span className="heroplay-meta">
          {sub}
          {hint && <span>{hint}</span>}
        </span>
        {p.searching && (
          <i className="heroplay-progress" aria-hidden="true">
            <i style={{ width: `${p.eta ? Math.min(100, (p.time / p.eta) * 100) : 0}%` }} />
          </i>
        )}
      </button>
      <div className="heroplay-stake">
        {recent.length > 0 && (
          <span className="heroplay-streak" title="Tes dernières parties, la plus récente à droite">
            {recent.map((w, i) => (
              <i key={i} className={w ? "w" : "l"} />
            ))}
          </span>
        )}
        {next ? (
          <>
            <b>
              {next} à {Math.max(0, 100 - lp)} LP
            </b>
            <span className="heroplay-bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, lp)}%` }} />
            </span>
          </>
        ) : rank?.tier ? (
          <b>
            {rankLabel(rank.tier, rank.division)} · {lp} LP
          </b>
        ) : null}
        <small>{mood}</small>
        {p.searching && p.leader && (
          <button className="btn btn-quiet heroplay-cancel" onClick={p.cancel}>
            Annuler la recherche
          </button>
        )}
      </div>
    </div>
  );
}

/** Braises et lueurs qui flottent devant le fond. */
function HeroFx() {
  const embers = Array.from({ length: 22 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: -((i * 1.7) % 14),
    duration: 10 + ((i * 3) % 9),
    size: 2 + (i % 3),
    drift: ((i * 13) % 60) - 30,
  }));
  return (
    <div className="hero-fx" aria-hidden="true">
      <i className="glow g1" />
      <i className="glow g2" />
      {embers.map((e, i) => (
        <i key={i} className="ember" style={{ left: `${e.left}%`, width: e.size, height: e.size, animationDelay: `${e.delay}s`, animationDuration: `${e.duration}s`, ["--drift" as string]: `${e.drift}px` }} />
      ))}
    </div>
  );
}
