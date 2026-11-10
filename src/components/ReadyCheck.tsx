import type { SearchState } from "../lib/types";

const DURATION = 12; // secondes laissées par Riot pour accepter

/** Fenêtre « Partie trouvée ». L'acceptation reste un clic du joueur, jamais automatique. */
export function ReadyCheck({ search, onAccept, onDecline }: { search: SearchState | null; onAccept: () => void; onDecline: () => void }) {
  const rc = search?.readyCheck;
  const answered = rc?.playerResponse === "Accepted" || rc?.playerResponse === "Declined";
  const left = Math.max(0, DURATION - (rc?.timer ?? 0));
  const r = 54;
  const c = 2 * Math.PI * r;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="found-title">
      <div className="found">
        <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={r} fill="none" stroke="#333" strokeWidth="6" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="#e50914"
            strokeWidth="6"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - left / DURATION)}
            transform="rotate(-90 60 60)"
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
          <text x="60" y="72" textAnchor="middle" fill="#fff" style={{ font: "36px var(--display)" }}>
            {Math.ceil(left)}
          </text>
        </svg>
        <h2 id="found-title">PARTIE TROUVÉE</h2>
        {answered ? (
          <p className="meta">{rc?.playerResponse === "Accepted" ? "Acceptée. En attente des autres joueurs…" : "Refusée."}</p>
        ) : (
          <div className="btns">
            <button className="btn btn-red" onClick={onAccept} autoFocus>
              Accepter
            </button>
            <button className="btn btn-ghost" onClick={onDecline}>
              Refuser
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
