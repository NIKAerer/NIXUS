import { useEffect, useMemo, useState } from "react";
import { snapshot } from "../lib/archive";
import { actions, useClient } from "../lib/client";
import { friendlyError } from "../lib/errors";
import { gameAsset, lcu, profileIcon } from "../lib/lcu";
import { Art, CloseButton, Modal, Seg, cx, int } from "../ui";

interface Challenge {
  id: number;
  name: string;
  description?: string;
  category?: string;
  currentLevel?: string;
  currentValue?: number;
  nextThreshold?: number;
  levelToIconPath?: Record<string, string>;
  isCapstone?: boolean;
}
interface Summary {
  title?: { itemId?: number; name?: string };
  topChallenges?: { id: number }[];
  totalPoints?: { level?: string; current?: number; max?: number };
  categoryProgress?: { category: string; level?: string; current?: number; max?: number }[];
}
interface Title {
  itemId: number;
  name: string;
}

const LEVELS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const LEVEL_FR: Record<string, string> = { NONE: "Aucun", IRON: "Fer", BRONZE: "Bronze", SILVER: "Argent", GOLD: "Or", PLATINUM: "Platine", DIAMOND: "Diamant", MASTER: "Maître", GRANDMASTER: "Grand Maître", CHALLENGER: "Challenger" };
const CAT_FR: Record<string, string> = { IMAGINATION: "Imagination", EXPERTISE: "Expertise", VETERANCY: "Vétérance", TEAMWORK: "Travail d'équipe", COLLECTION: "Collection" };
const DEBUG_PATHS = ["/lol-challenges/v1/summary-player-data/local-player", "/lol-challenges/v2/titles/local-player", "/lol-challenges/v2/titles/all", "/lol-inventory/v2/inventory/REGALIA_BANNER"] as const;
const TABS = [
  ["look", "Apparence"],
  ["challenges", "Défis"],
] as const;

const iconOf = (c: Challenge) => gameAsset(c.levelToIconPath?.[c.currentLevel ?? ""] ?? c.levelToIconPath?.IRON);
const rankOf = (l?: string) => LEVELS.indexOf(l ?? "");
const level = (l?: string) => LEVEL_FR[l ?? "NONE"] ?? l ?? "";
const progress = (value?: number, max?: number) => `${Math.min(100, ((value ?? 0) / (max || 1)) * 100)}%`;

/** Personnaliser le profil : icône, titre, jetons de défis affichés, et progression des défis. */
export function ProfileEditor({ onClose }: { onClose: () => void }) {
  const summoner = useClient((s) => s.summoner);
  const [tab, setTab] = useState<"look" | "challenges">("look");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [titles, setTitles] = useState<Title[] | null>(null);
  const [icons, setIcons] = useState<number[]>([]);
  const [tokens, setTokens] = useState<number[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    snapshot("profile", DEBUG_PATHS);
    lcu<Summary>("GET", "/lol-challenges/v1/summary-player-data/local-player").then(
      (s) => {
        setSummary(s);
        setTokens((s.topChallenges ?? []).map((c) => c.id).slice(0, 3));
      },
      () => {},
    );
    lcu<Record<string, Challenge>>("GET", "/lol-challenges/v1/challenges/local-player").then(
      (m) => setChallenges(Object.values(m ?? {}).filter((c) => c.id > 10)),
      () => {},
    );
    lcu<Title[] | Record<string, Title>>("GET", "/lol-challenges/v2/titles/local-player").then(
      (t) => setTitles((Array.isArray(t) ? t : Object.values(t ?? {})).filter((x) => x?.name)),
      () => setTitles([]),
    );
    lcu<{ itemId: number }[]>("GET", "/lol-inventory/v2/inventory/SUMMONER_ICON").then(
      (l) => setIcons((Array.isArray(l) ? l : []).map((x) => x.itemId).sort((a, b) => b - a)),
      () => {},
    );
  }, []);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setNote(null);
    try {
      await fn();
      setNote({ ok: true, text: ok });
      actions.refreshProfile();
    } catch (e) {
      setNote({ ok: false, text: friendlyError(e) });
    }
  };
  const prefs = (extra: Record<string, unknown>) => lcu("POST", "/lol-challenges/v1/update-player-preferences/", { challengeIds: tokens, ...extra });

  const earned = useMemo(() => challenges.filter((c) => rankOf(c.currentLevel) >= 0 && !c.isCapstone).sort((a, b) => rankOf(b.currentLevel) - rankOf(a.currentLevel) || a.name.localeCompare(b.name, "fr")), [challenges]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      challenges
        .filter((c) => !c.isCapstone && (!q || c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)))
        .sort((a, b) => (b.currentValue ?? 0) / (b.nextThreshold || 1) - (a.currentValue ?? 0) / (a.nextThreshold || 1)),
    [challenges, q],
  );
  const toggleToken = (id: number) => setTokens((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= 3 ? [...t.slice(1), id] : [...t, id]));

  return (
    <Modal label="Personnaliser le profil" onClose={onClose} size="l" className="editor">
      <header className="modal-head">
        <div className="grow">
          <h2>Personnaliser</h2>
          {summary?.totalPoints && (
            <small>
              Défis : {level(summary.totalPoints.level)} · {int(summary.totalPoints.current ?? 0)} / {int(summary.totalPoints.max ?? 0)} points
            </small>
          )}
        </div>
        <Seg value={tab} options={TABS} onChange={setTab} />
        <CloseButton onClose={onClose} />
      </header>

      <div className="modal-body editor-body">
        {note && (
          <p className={cx("note", note.ok ? "ok" : "bad")} role="status">
            {note.text}
          </p>
        )}
        {tab === "look" ? (
          <>
            <section>
              <h3 className="h3">Titre</h3>
              {titles === null ? (
                <p className="note">Chargement…</p>
              ) : titles.length ? (
                <select
                  className="input editor-select"
                  value={summary?.title?.itemId ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    run(() => prefs({ title: value }), "Titre changé.").then(() => setSummary((s) => ({ ...s, title: titles.find((t) => String(t.itemId) === value) })));
                  }}
                >
                  <option value="">Aucun titre</option>
                  {titles.map((t) => (
                    <option key={t.itemId} value={t.itemId}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="note">
                  {summary?.title?.name ? `Titre actuel : ${summary.title.name}. ` : ""}La liste des titres n'est pas disponible sur ce client pour l'instant.
                </p>
              )}
            </section>

            <section>
              <h3 className="h3">
                Jetons affichés <span className="dim">{tokens.length}/3</span>
                <button className="btn btn-red btn-s" onClick={() => run(() => prefs({}), "Jetons enregistrés.")}>
                  Enregistrer les jetons
                </button>
              </h3>
              {earned.length ? (
                <div className="picks tokens">
                  {earned.slice(0, 60).map((c) => (
                    <button key={c.id} aria-pressed={tokens.includes(c.id)} onClick={() => toggleToken(c.id)} title={`${c.name} · ${level(c.currentLevel)}`}>
                      <Art src={iconOf(c)} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="note">Aucun défi validé trouvé.</p>
              )}
            </section>

            <section>
              <h3 className="h3">Icône</h3>
              <div className="picks">
                {icons.slice(0, 120).map((id) => (
                  <button key={id} aria-pressed={summoner?.profileIconId === id} onClick={() => run(() => lcu("PUT", "/lol-summoner/v1/current-summoner/icon", { profileIconId: id }), "Icône équipée.")}>
                    <Art src={profileIcon(id)} />
                  </button>
                ))}
              </div>
              {icons.length > 120 && <p className="note">Toutes tes icônes sont dans Collection, onglet Icônes.</p>}
            </section>
          </>
        ) : (
          <>
            {summary?.categoryProgress?.length ? (
              <div className="cats">
                {summary.categoryProgress.map((c) => (
                  <div key={c.category}>
                    <span className="label">{CAT_FR[c.category] ?? c.category}</span>
                    <b>{level(c.level)}</b>
                    <span className="bar">
                      <i style={{ width: progress(c.current, c.max) }} />
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            <input className="input" placeholder="Rechercher un défi" value={query} onChange={(e) => setQuery(e.target.value)} />
            <ul className="challenges">
              {shown.slice(0, 150).map((c) => (
                <li key={c.id}>
                  <Art src={iconOf(c)} />
                  <div className="two">
                    <b>{c.name}</b>
                    <small>{c.description}</small>
                    <span className="bar">
                      <i style={{ width: progress(c.currentValue, c.nextThreshold) }} />
                    </span>
                  </div>
                  <span className="challenge-lvl">
                    <b>{level(c.currentLevel)}</b>
                    <small className="mono">
                      {int(c.currentValue ?? 0)}
                      {c.nextThreshold ? ` / ${int(c.nextThreshold)}` : ""}
                    </small>
                  </span>
                </li>
              ))}
              {!challenges.length && <li className="note">Chargement des défis…</li>}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
