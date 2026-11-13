import { isDesktop } from "../lib/lcu";
import { closeWindow, minimize, toggleMaximize } from "../lib/window";
import { Icon } from "../ui";

/** Boutons réduire, agrandir et fermer de la fenêtre sans bordure. */
export function WindowControls() {
  if (!isDesktop) return null;
  return (
    <div className="win-ctrl">
      <button onClick={minimize} aria-label="Réduire" title="Réduire">
        <Icon name="min" size={14} />
      </button>
      <button onClick={toggleMaximize} aria-label="Agrandir" title="Agrandir">
        <Icon name="max" size={14} />
      </button>
      <button className="x" onClick={closeWindow} aria-label="Fermer" title="Fermer">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
