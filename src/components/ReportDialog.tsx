import { useEffect, useState } from "react";
import { lcu } from "../lib/lcu";
import type { ChampionSummary, EndOfGame, EogPlayer } from "../lib/types";
import { ChampIcon } from "./ui";

/** Mêmes catégories que le client officiel. */
const CATEGORIES: [string, string][] = [
  ["NEGATIVE_ATTITUDE", "Attitude négative"],
  ["VERBAL_ABUSE", "Insultes"],
  ["LEAVING_AFK", "AFK ou abandon"],
  ["ASSISTING_ENEMY_TEAM", "Sabotage (aide l'équipe adverse)"],
  ["HATE_SPEECH", "Propos haineux"],
  ["THIRD_PARTY_TOOLS", "Triche ou logiciel tiers"],
  ["INAPPROPRIATE_NAME", "Nom inapproprié"],
];

/**
 * Signalement de fin de partie, comme dans le client officiel : tu choisis le joueur et les motifs,
 * rien ne part avant ton clic sur « Envoyer ».
 */
export function ReportDialog({ eog, champions, target, onClose }: { eog: EndOfGame; champions: Map<number, ChampionSummary>; target?: EogPlayer; onClose: () => void }) {
  const players = eog.teams.flatMap((t) => t.players.map((p) => ({ p, ally: t.isPlayerTeam }))).filter(({ p }) => !p.isLocalPlayer && !p.botPlayer);
  const [who, setWho] = useState<EogPlayer | null>(target ?? null);
  const [cats, setCats] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Joueurs déjà signalés pour cette partie (le client les garde).
  useEffect(() => {
    lcu<unknown[]>("GET", "/lol-player-report-sender/v1/reported-players")
      .then((l) => setDone(new Set((l ?? []).map((x) => String(typeof x === "object" && x ? ((x as Record<string, unknown>).puuid ?? (x as Record<string, unknown>).summonerId) : x)))))
      .catch(() => {});
  }, []);

  const key = (p: EogPlayer) => String(p.puuid ?? p.summonerId ?? p.riotIdGameName);
  const name = (p: EogPlayer) => p.riotIdGameName || p.summonerName || champions.get(p.championId)?.name || "Joueur";
  const send = async () => {
    if (!who || !cats.length) return;
    setBusy(true);
    setMsg("");
    try {
      await lcu("POST", "/lol-player-report-sender/v1/end-of-game-reports", {
        gameId: eog.gameId,
        categories: cats,
        offenderSummonerId: who.summonerId ?? 0,
        offenderPuuid: who.puuid ?? "",
        comment: comment.trim(),
      });
      setDone((d) => new Set(d).add(key(who)));
      setMsg(`${name(who)} est signalé. Merci.`);
      if (target) {
        setTimeout(onClose, 1200);
        setBusy(false);
        return;
      }
      setWho(null);
      setCats([]);
      setComment("");
    } catch (e) {
      setMsg(`Le signalement n'est pas passé : ${(e as Error)?.message ?? e}`);
    }
    setBusy(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="rpt" role="dialog" aria-modal="true" aria-labelledby="rpt-title" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="rpt-title">{target ? `Signaler ${name(target)}` : "Signaler un joueur"}</h2>
          <button className="gd-close" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {!target && <div className="rpt-players" role="radiogroup" aria-label="Joueur">
          {players.map(({ p, ally }) => {
            const reported = done.has(key(p));
            return (
              <button key={key(p)} role="radio" aria-checked={who === p} disabled={reported} className={`rpt-player ${ally ? "ally" : "enemy"}`} onClick={() => setWho(p)}>
                <ChampIcon id={p.championId} />
                <span>
                  <b>{name(p)}</b>
                  <small>{reported ? "Déjà signalé" : `${champions.get(p.championId)?.name ?? ""} · ${ally ? "allié" : "adversaire"}`}</small>
                </span>
              </button>
            );
          })}
        </div>}
        {target && done.has(key(target)) && !msg && <p className="rpt-done">Tu as déjà signalé ce joueur pour cette partie.</p>}
        {who && (
          <fieldset className="rpt-cats">
            <legend>{target ? `${champions.get(who.championId)?.name ?? "Champion"} · motif du signalement` : `Pourquoi signaler ${name(who)} ?`}</legend>
            {CATEGORIES.map(([id, label]) => (
              <label key={id}>
                <input type="checkbox" checked={cats.includes(id)} onChange={(e) => setCats((c) => (e.target.checked ? [...c, id] : c.filter((x) => x !== id)))} />
                {label}
              </label>
            ))}
            <textarea className="search" placeholder="Commentaire (facultatif)" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
          </fieldset>
        )}
        <footer>
          <small role="status">{msg || (who ? "" : "Choisis le joueur à signaler.")}</small>
          <button className="btn btn-red" disabled={!who || !cats.length || busy || done.has(key(who))} onClick={send}>
            {busy ? "Envoi…" : "Envoyer"}
          </button>
        </footer>
      </div>
    </div>
  );
}
