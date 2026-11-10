import { useEffect, useMemo, useState } from "react";
import { Art } from "./ui";
import { gameAsset, lcu, profileIcon } from "../lib/lcu";
import { friendlyError } from "../lib/errors";
import { snapshot } from "../lib/archive";
import type { Summoner } from "../lib/types";

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
  bannerId?: string;
}
interface Title {
  itemId: number;
  name: string;
}

const LEVELS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const LEVEL_FR: Record<string, string> = { NONE: "—", IRON: "Fer", BRONZE: "Bronze", SILVER: "Argent", GOLD: "Or", PLATINUM: "Platine", DIAMOND: "Diamant", MASTER: "Maître", GRANDMASTER: "Grand Maître", CHALLENGER: "Challenger" };
const CAT_FR: Record<string, string> = { IMAGINATION: "Imagination", EXPERTISE: "Expertise", VETERANCY: "Vétérance", TEAMWORK: "Travail d'équipe", COLLECTION: "Collection" };
const DEBUG_PATHS = ["/lol-challenges/v1/summary-player-data/local-player", "/lol-challenges/v2/titles/local-player", "/lol-challenges/v2/titles/all", "/lol-inventory/v2/inventory/REGALIA_BANNER"] as const;

const icon = (c: Challenge) => gameAsset(c.levelToIconPath?.[c.currentLevel ?? ""] ?? c.levelToIconPath?.IRON);
const rankOf = (l?: string) => LEVELS.indexOf(l ?? "");

/** Personnaliser le profil : icône, titre, jetons de défis affichés, et progression des défis. */
export function ProfileEditor({ summoner, onChanged, onClose }: { summoner: Summoner | null; onChanged: () => void; onClose: () => void }) {
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
    lcu<Summary>("GET", "/lol-challenges/v1/summary-player-data/local-player").then((s) => {
      setSummary(s);
      setTokens((s.topChallenges ?? []).map((c) => c.id).slice(0, 3));
    }, () => {});
    lcu<Record<string, Challenge>>("GET", "/lol-challenges/v1/challenges/local-player").then((m) => setChallenges(Object.values(m ?? {}).filter((c) => c.id > 10)), () => {});
    lcu<Title[] | Record<string, Title>>("GET", "/lol-challenges/v2/titles/local-player").then(
      (t) => setTitles((Array.isArray(t) ? t : Object.values(t ?? {})).filter((x) => x?.name)),
      () => setTitles([]),
    );
    lcu<{ itemId: number }[]>("GET", "/lol-inventory/v2/inventory/SUMMONER_ICON").then((l) => setIcons((Array.isArray(l) ? l : []).map((x) => x.itemId).sort((a, b) => b - a)), () => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setNote(null);
    try {
      await fn();
      setNote({ ok: true, text: ok });
      onChanged();
    } catch (e) {
      setNote({ ok: false, text: friendlyError(e) });
    }
  };
  const prefs = (extra: Record<string, unknown>) =>
    lcu("POST", "/lol-challenges/v1/update-player-preferences/", { challengeIds: tokens, ...extra });

  const earned = useMemo(() => challenges.filter((c) => rankOf(c.currentLevel) >= 0 && !c.isCapstone).sort((a, b) => rankOf(b.currentLevel) - rankOf(a.currentLevel) || a.name.localeCompare(b.name, "fr")), [challenges]);
  const q = query.trim().toLowerCase();
  const shownChallenges = challenges
    .filter((c) => !c.isCapstone && (!q || c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)))
    .sort((a, b) => (b.currentValue ?? 0) / (b.nextThreshold || 1) - (a.currentValue ?? 0) / (a.nextThreshold || 1));

  const toggleToken = (id: number) => setTokens((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= 3 ? [...t.slice(1), id] : [...t, id]));

  return (
    <div className="overlay re-overlay" onClick={onClose}>
      <div className="re pe" role="dialog" aria-modal="true" aria-label="Personnaliser le profil" onClick={(e) => e.stopPropagation()}>
        <header className="re-head">
          <div className="col-seg">
            <button className="chip" aria-pressed={tab === "look"} onClick={() => setTab("look")}>
              Apparence
            </button>
            <button className="chip" aria-pressed={tab === "challenges"} onClick={() => setTab("challenges")}>
              Défis
            </button>
          </div>
          {summary?.totalPoints && (
            <span className="re-note">
              {LEVEL_FR[summary.totalPoints.level ?? "NONE"] ?? summary.totalPoints.level} · {(summary.totalPoints.current ?? 0).toLocaleString("fr-FR")} / {(summary.totalPoints.max ?? 0).toLocaleString("fr-FR")} points
            </span>
          )}
          <button className="gd-close" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {note && <p className={`fp-note ${note.ok ? "ok" : ""}`}>{note.text}</p>}

        {tab === "look" ? (
          <div className="pe-body">
            <section>
              <h3>Titre</h3>
              {titles === null ? (
                <p className="gd-wait">Chargement…</p>
              ) : titles.length ? (
                <select className="search pe-select" value={summary?.title?.itemId ?? ""} onChange={(e) => run(() => prefs({ title: e.target.value }), "Titre changé.").then(() => setSummary((s) => ({ ...s, title: titles.find((t) => String(t.itemId) === e.target.value) })))}>
                  <option value="">Aucun titre</option>
                  {titles.map((t) => (
                    <option key={t.itemId} value={t.itemId}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="gd-wait">{summary?.title?.name ? `Titre actuel : ${summary.title.name}. ` : ""}La liste des titres n'est pas disponible sur ce client pour l'instant.</p>
              )}
            </section>

            <section>
              <h3>
                Jetons affichés <span>{tokens.length}/3</span>
              </h3>
              <div className="pe-tokens">
                {earned.slice(0, 60).map((c) => (
                  <button key={c.id} className="pe-token" aria-pressed={tokens.includes(c.id)} onClick={() => toggleToken(c.id)} title={`${c.name} · ${LEVEL_FR[c.currentLevel ?? "NONE"]}`}>
                    <Art src={icon(c)} alt="" />
                  </button>
                ))}
                {!earned.length && <p className="gd-wait">Aucun défi validé trouvé.</p>}
              </div>
              <button className="btn btn-red small" onClick={() => run(() => prefs({}), "Jetons enregistrés.")}>
                Enregistrer les jetons
              </button>
            </section>

            <section>
              <h3>Icône</h3>
              <div className="pe-icons">
                {icons.slice(0, 120).map((id) => (
                  <button key={id} className="pe-icon" aria-pressed={summoner?.profileIconId === id} onClick={() => run(() => lcu("PUT", "/lol-summoner/v1/current-summoner/icon", { profileIconId: id }), "Icône équipée.")}>
                    <Art src={profileIcon(id)} alt="" />
                  </button>
                ))}
              </div>
              {icons.length > 120 && <p className="gd-wait">Toutes tes icônes sont dans Collection → Icônes.</p>}
            </section>
          </div>
        ) : (
          <div className="pe-body">
            {summary?.categoryProgress?.length ? (
              <div className="pe-cats">
                {summary.categoryProgress.map((c) => (
                  <div key={c.category}>
                    <span className="label">{CAT_FR[c.category] ?? c.category}</span>
                    <b>{LEVEL_FR[c.level ?? "NONE"] ?? c.level}</b>
                    <i style={{ width: `${Math.min(100, ((c.current ?? 0) / (c.max || 1)) * 100)}%` }} />
                  </div>
                ))}
              </div>
            ) : null}
            <input className="search" placeholder="Rechercher un défi" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="pe-list">
              {shownChallenges.slice(0, 150).map((c) => (
                <div key={c.id} className="pe-ch">
                  <Art src={icon(c)} alt="" />
                  <div>
                    <b>{c.name}</b>
                    <small>{c.description}</small>
                    <span className="pe-bar">
                      <i style={{ width: `${Math.min(100, ((c.currentValue ?? 0) / (c.nextThreshold || 1)) * 100)}%` }} />
                    </span>
                  </div>
                  <em>
                    {LEVEL_FR[c.currentLevel ?? "NONE"] ?? c.currentLevel}
                    <small>
                      {Math.round(c.currentValue ?? 0).toLocaleString("fr-FR")}
                      {c.nextThreshold ? ` / ${Math.round(c.nextThreshold).toLocaleString("fr-FR")}` : ""}
                    </small>
                  </em>
                </div>
              ))}
              {!challenges.length && <p className="gd-wait">Chargement des défis…</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
