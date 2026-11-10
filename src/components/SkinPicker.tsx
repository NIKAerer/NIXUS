import { Breathing } from "./Breathing";
import { useEffect, useMemo, useState } from "react";
import { championSquare, lcu, skinSplash } from "../lib/lcu";
import type { ChampionSummary, Skin } from "../lib/types";

export interface HeroSkin {
  championId: number;
  skinId: number;
}

const KEY = "nexus.heroSkin";

export function readHeroSkin(): HeroSkin | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v.championId === "number" ? v : null;
  } catch {
    return null;
  }
}

function saveHeroSkin(v: HeroSkin | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
}

interface Props {
  champions: Map<number, ChampionSummary>;
  current: HeroSkin | null;
  autoChampion: number;
  onChange: (v: HeroSkin | null) => void;
  onClose: () => void;
}

/** Choix du champion et du skin affichés en grand sur l'accueil. */
export function SkinPicker({ champions, current, autoChampion, onChange, onClose }: Props) {
  const [championId, setChampionId] = useState(current?.championId ?? autoChampion);
  const [query, setQuery] = useState("");
  const [skins, setSkins] = useState<Skin[]>([]);

  useEffect(() => {
    let alive = true;
    setSkins([]);
    lcu<{ skins?: Skin[] }>("GET", `/lol-game-data/assets/v1/champions/${championId}.json`)
      .then((c) => alive && setSkins(c?.skins ?? []))
      .catch(() => alive && setSkins([{ id: championId * 1000, name: champions.get(championId)?.name ?? "Classique", isBase: true }]));
    return () => {
      alive = false;
    };
  }, [championId, champions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...champions.values()].filter((c) => !q || c.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [champions, query]);

  const pick = (skinId: number) => {
    const v = { championId, skinId };
    saveHeroSkin(v);
    onChange(v);
  };

  return (
    <div className="overlay sp-overlay" onClick={onClose}>
      <div className="sp" role="dialog" aria-modal="true" aria-label="Choisir le fond de l'accueil" onClick={(e) => e.stopPropagation()}>
        <header className="sp-head">
          <div>
            <h2>Fond de l'accueil</h2>
            <span>Choisis un champion, puis le skin à afficher en grand.</span>
          </div>
          <button
            className="btn btn-ghost small"
            onClick={() => {
              saveHeroSkin(null);
              onChange(null);
            }}
            aria-pressed={!current}
          >
            Automatique (dernier champion joué)
          </button>
          <button className="gd-close sp-close" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="sp-body">
          <aside className="sp-champs">
            <input className="search" placeholder="Rechercher un champion" aria-label="Rechercher un champion" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="sp-champ-grid">
              {list.map((c) => (
                <button key={c.id} className="sp-champ" aria-pressed={c.id === championId} onClick={() => setChampionId(c.id)} title={c.name}>
                  <Breathing src={championSquare(c.id)} champ={c.id} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </aside>
          <section className="sp-skins">
            <h3>{champions.get(championId)?.name ?? "Champion"}</h3>
            <div className="sp-skin-grid">
              {skins.map((s) => {
                const on = current?.championId === championId && current.skinId === s.id;
                return (
                  <button key={s.id} className="sp-skin" aria-pressed={on} onClick={() => pick(s.id)}>
                    <Breathing full src={skinSplash(championId, s.id)} champ={championId} />
                    <span>{s.isBase ? "Classique" : s.name}</span>
                  </button>
                );
              })}
              {skins.length === 0 && <p className="gd-wait">Chargement des skins…</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
