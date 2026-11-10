import { isDesktop } from "../lib/lcu";
import { closeWindow, minimize, toggleMaximize } from "../lib/window";

/** Boutons réduire, agrandir et fermer de la fenêtre sans bordure, plus une bande pour la déplacer. */
export function WindowControls() {
  if (!isDesktop) return null;
  return (
    <>
      <div className="win-drag" data-tauri-drag-region onDoubleClick={toggleMaximize} />
      <div className="win-ctrl">
        <button onClick={minimize} aria-label="Réduire" title="Réduire">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
        <button onClick={toggleMaximize} aria-label="Agrandir" title="Agrandir">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
        <button className="x" onClick={closeWindow} aria-label="Fermer" title="Fermer">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
      </div>
    </>
  );
}
