import { useState } from "react";

/** Petit bouton « Actualiser » : relit les données du client (utile quand le client n'avait pas fini de charger). */
export function RefreshButton({ onRefresh, label, top }: { onRefresh: () => Promise<void> | void; label?: string; top?: boolean }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setBusy(false), 600);
    }
  };
  return (
    <button type="button" className={`refresh-btn ${top ? "top-btn" : ""} ${label ? "with-label" : ""} ${busy ? "busy" : ""}`} onClick={go} disabled={busy} title={top ? "Actualiser (historique, profil, amis, classement)" : "Actualiser"} aria-label={label ?? "Actualiser"}>
      <svg viewBox="0 0 24 24" width={top ? 18 : 14} height={top ? 18 : 14} aria-hidden="true">
        <path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
      </svg>
      {label && <span>{busy ? "Actualisation…" : label}</span>}
    </button>
  );
}
