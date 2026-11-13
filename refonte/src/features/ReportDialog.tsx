import { useEffect, useState } from "react";
import { useClient } from "../lib/client";
import { lcu } from "../lib/lcu";
import type { EndOfGame, EogPlayer } from "../lib/types";
import { CloseButton, Modal } from "../ui";

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

/** Signalement de fin de partie, comme dans le client officiel : tu choisis les motifs, rien ne part avant ton clic sur « Envoyer ». */
export function ReportDialog({ eog, target, onClose }: { eog: EndOfGame; target: EogPlayer; onClose: () => void }) {
  const champions = useClient((s) => s.champions);
  const [cats, setCats] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<Set<string>>(new Set());

  // Joueurs déjà signalés pour cette partie (le client les garde).
  useEffect(() => {
    lcu<unknown[]>("GET", "/lol-player-report-sender/v1/reported-players")
      .then((l) => setDone(new Set((l ?? []).map((x) => String(typeof x === "object" && x ? ((x as Record<string, unknown>).puuid ?? (x as Record<string, unknown>).summonerId) : x)))))
      .catch(() => {});
  }, []);

  const key = String(target.puuid ?? target.summonerId ?? target.riotIdGameName);
  const name = target.riotIdGameName || target.summonerName || champions.get(target.championId)?.name || "Joueur";
  const already = done.has(key);
  const send = async () => {
    if (!cats.length) return;
    setBusy(true);
    setMsg("");
    try {
      await lcu("POST", "/lol-player-report-sender/v1/end-of-game-reports", { gameId: eog.gameId, categories: cats, offenderSummonerId: target.summonerId ?? 0, offenderPuuid: target.puuid ?? "", comment: comment.trim() });
      setDone((d) => new Set(d).add(key));
      setMsg(`${name} est signalé. Merci.`);
      setTimeout(onClose, 1200);
    } catch (e) {
      setMsg(`Le signalement n'est pas passé : ${(e as Error)?.message ?? e}`);
    }
    setBusy(false);
  };

  return (
    <Modal label={`Signaler ${name}`} onClose={onClose} size="s">
      <header className="modal-head">
        <div className="grow">
          <h2>Signaler {name}</h2>
          <small>{champions.get(target.championId)?.name ?? "Champion"} · choisis un ou plusieurs motifs</small>
        </div>
        <CloseButton onClose={onClose} />
      </header>
      <div className="modal-body report">
        {already && !msg && <p className="warn">Tu as déjà signalé ce joueur pour cette partie.</p>}
        {CATEGORIES.map(([id, label]) => (
          <label key={id}>
            <input type="checkbox" checked={cats.includes(id)} onChange={(e) => setCats((c) => (e.target.checked ? [...c, id] : c.filter((x) => x !== id)))} />
            {label}
          </label>
        ))}
        <textarea className="input" placeholder="Commentaire (facultatif)" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      <footer className="modal-foot">
        <small className="note grow" role="status">
          {msg}
        </small>
        <button className="btn btn-red" disabled={!cats.length || busy || already} onClick={send}>
          {busy ? "Envoi…" : "Envoyer"}
        </button>
      </footer>
    </Modal>
  );
}
