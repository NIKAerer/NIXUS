import { useEffect, useState } from "react";
import { friendlyError } from "../lib/errors";
import { claimAll, loadEvents, type EventsData } from "../lib/events";
import { Art, Empty, Icon, RefreshButton, Skeleton, cx, int, plural } from "../ui";

const daysLeft = (iso?: string) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000)) : undefined);

/** Events : le pass en cours, sa piste de récompenses (avec « Tout récupérer ») et les missions. */
export function Events() {
  const [data, setData] = useState<EventsData | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = () => loadEvents().then(setData, () => setData({ events: [], track: null, missions: [] }));
  useEffect(() => void load(), []);

  if (!data) {
    return (
      <div className="page">
        <Skeleton className="ev-hero" />
        <Skeleton style={{ height: 150, borderRadius: 18 }} />
      </div>
    );
  }

  const ev = data.events[0];
  const track = data.track;
  const left = daysLeft(ev?.end);

  const claim = async () => {
    if (!ev) return;
    setClaiming(true);
    setNote(null);
    try {
      const n = track?.unclaimed ?? 0;
      await claimAll(ev.id);
      setNote(`${plural(n, "récompense récupérée", "récompenses récupérées")}.`);
      await load();
    } catch (e) {
      setNote(`La récupération n'a pas marché (${friendlyError(e)}). Tu peux les récupérer dans le client officiel.`);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="page ev-page">
      {ev ? (
        <section className="ev-hero">
          {ev.icon && <Art src={ev.icon} className="ev-hero-bg" />}
          <span className="eyebrow">Event en cours{left !== undefined ? ` · encore ${plural(left, "jour")}` : ""}</span>
          <h1 className="display">{ev.name}</h1>
          <div className="ev-hero-row">
            {track?.level !== undefined && (
              <div className="ev-level">
                <b>Niveau {track.level}</b>
                {track.xp !== undefined && track.xpNeeded ? (
                  <>
                    <i className="ev-bar">
                      <i style={{ width: `${Math.min(100, (track.xp / track.xpNeeded) * 100)}%` }} />
                    </i>
                    <small>
                      {int(track.xp)} / {int(track.xpNeeded)} XP
                    </small>
                  </>
                ) : null}
              </div>
            )}
            {ev.tokens !== undefined && (
              <div className="ev-tokens">
                <b>{int(ev.tokens)}</b>
                <small>jetons</small>
              </div>
            )}
            {track && track.unclaimed > 0 && (
              <button className="btn btn-white btn-l" onClick={claim} disabled={claiming}>
                <Icon name="check" size={18} /> {claiming ? "Récupération…" : `Tout récupérer · ${track.unclaimed}`}
              </button>
            )}
          </div>
          {note && <p className="ev-note">{note}</p>}
        </section>
      ) : (
        <Empty title="Aucun event en cours">
          NIXUS n'a pas trouvé d'event actif dans le client. S'il y en a un, il apparaîtra ici dès que le client l'aura chargé.
          <br />
          <RefreshButton label="Actualiser" onRefresh={load} />
        </Empty>
      )}

      {track && track.rewards.length > 0 && (
        <section>
          <h2 className="sec-head">
            Piste du pass<span>{plural(track.rewards.filter((r) => r.state !== "locked").length, "récompense débloquée", "récompenses débloquées")} sur {track.rewards.length}</span>
          </h2>
          <ol className="ev-track">
            {track.rewards.map((r, i) => (
              <li key={i} className={cx("ev-reward", r.state)}>
                <span className="ev-reward-lvl">{r.threshold ?? i + 1}</span>
                <span className="ev-reward-art">{r.icon ? <Art src={r.icon} /> : <Icon name={r.state === "locked" ? "loot" : "star"} size={26} />}</span>
                <b>{r.name}</b>
                <small>{r.state === "claimed" ? "Récupérée" : r.state === "ready" ? "À récupérer" : "Verrouillée"}</small>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.missions.length > 0 && (
        <section>
          <h2 className="sec-head">
            Missions<span>{plural(data.missions.filter((m) => !m.done).length, "en cours", "en cours")}</span>
          </h2>
          <div className="ev-missions">
            {data.missions.map((m) => (
              <article key={m.id} className={cx("ev-mission", m.done && "done")}>
                <header>
                  <b>{m.title}</b>
                  {m.done ? <span className="tag green">Terminée</span> : daysLeft(m.end) !== undefined && <span className="tag">{plural(daysLeft(m.end)!, "jour")}</span>}
                </header>
                {m.description && <p>{m.description}</p>}
                <div className="ev-mission-prog">
                  <i className="ev-bar">
                    <i style={{ width: `${(m.current / m.total) * 100}%` }} />
                  </i>
                  <small>
                    {int(m.current)} / {int(m.total)}
                  </small>
                </div>
                {m.reward && (
                  <small className="ev-mission-reward">
                    <Icon name="loot" size={13} /> {m.reward}
                  </small>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
