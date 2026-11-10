import type { Feedback } from "../lib/feedback";

/** Retours de signalement, affichés comme les invitations (en haut à droite). */
export function ReportFeedback({ items, onDismiss }: { items: Feedback[]; onDismiss: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="invites rf" aria-live="polite">
      {items.slice(0, 3).map((f) => (
        <div key={f.id} className="invite rf-card" role="status">
          <div className="rf-head">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 2 3 5v5c0 4 3 7 7 8 4-1 7-4 7-8V5l-7-3Z" />
              <path d="m7 10 2 2 4-4" />
            </svg>
            <b>{f.title}</b>
          </div>
          <p>{f.body}</p>
          <div className="btns">
            <button className="btn btn-primary small" onClick={() => onDismiss(f.id)}>
              OK
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
