import { useEffect, useMemo, useState } from "react";
import { championSquare, lcu, skinSplash } from "../lib/lcu";
import type { ChampionSummary, Skin } from "../lib/types";
import { Breathing, CloseButton, Modal, readJson } from "../ui";

export interface HeroSkin {
  championId: number;
  skinId: number;
}

const KEY = "nexus.heroSkin";

export function readHeroSkin(): HeroSkin | null {
  const v = readJson<HeroSkin | null>(KEY, null);
  return v && typeof v.championId === "number" ? v : null;
}

function saveHeroSkin(v: HeroSkin | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
}

/** Choix du champion et du skin affichés en grand sur l'accueil. */
export function SkinPicker({ champions, current, autoChampion, onChange, onClose }: { champions: Map<number, ChampionSummary>; current: HeroSkin | null; autoChampion: number; onChange: (v: HeroSkin | null) => void; onClose: () => void }) {
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

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...champions.values()].filter((c) => !q || c.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [champions, query]);

  const pick = (v: HeroSkin | null) => {
    saveHeroSkin(v);
    onChange(v);
  };

  return (
    <Modal label="Choisir le fond de l'accueil" onClose={onClose} size="xl">
      <header className="modal-head">
        <div className="grow">
          <h2>Fond de l'accueil</h2>
          <small>Choisis un champion, puis le skin à afficher en grand.</small>
        </div>
        <button className="chip" onClick={() => pick(null)} aria-pressed={!current}>
          Automatique (derniers champions joués)
        </button>
        <CloseButton onClose={onClose} />
      </header>
      <div className="skinpick">
        <aside>
          <input className="input" placeholder="Rechercher un champion" aria-label="Rechercher un champion" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="skinpick-champs">
            {list.map((c) => (
              <button key={c.id} aria-pressed={c.id === championId} onClick={() => setChampionId(c.id)} title={c.name}>
                <Breathing src={championSquare(c.id)} champ={c.id} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </aside>
        <section>
          <h3 className="h2">{champions.get(championId)?.name ?? "Champion"}</h3>
          <div className="skinpick-skins">
            {skins.map((s) => (
              <button key={s.id} aria-pressed={current?.championId === championId && current.skinId === s.id} onClick={() => pick({ championId, skinId: s.id })}>
                <span className="cover">
                  <Breathing full src={skinSplash(championId, s.id)} champ={championId} />
                </span>
                <b>{s.isBase ? "Classique" : s.name}</b>
              </button>
            ))}
            {skins.length === 0 && <p className="wait">Chargement des skins…</p>}
          </div>
        </section>
      </div>
    </Modal>
  );
}
