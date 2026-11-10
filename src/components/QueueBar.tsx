import { clock, queueName } from "../lib/lcu";
import type { SearchState } from "../lib/types";

interface Props {
  search: SearchState | null;
  queueId?: number;
  canCancel: boolean;
  onCancel: () => void;
}

/** Bandeau de recherche toujours visible, sur toutes les pages, tant que tu es en file. */
export function QueueBar({ search, queueId, canCancel, onCancel }: Props) {
  const t = search?.timeInQueue ?? 0;
  const eta = search?.estimatedQueueTime ?? 0;
  const over = eta > 0 && t > eta;
  return (
    <div className="qbar" role="status" aria-live="polite">
      <span className="qbar-radar" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <div className="qbar-txt">
        <span className="label">Recherche en cours{queueId ? ` · ${queueName(queueId)}` : ""}</span>
        <b>{clock(t)}</b>
        <small className={over ? "over" : ""}>{eta ? `Temps estimé ${clock(eta)}` : "Temps estimé inconnu"}</small>
      </div>
      <div className="qbar-progress" aria-hidden="true">
        <i style={{ width: `${eta ? Math.min(100, (t / eta) * 100) : 0}%` }} />
      </div>
      <button className="btn btn-ghost small" onClick={onCancel} disabled={!canCancel} title={canCancel ? "Quitter la file" : "Seul le chef du groupe peut annuler"}>
        Annuler
      </button>
    </div>
  );
}
