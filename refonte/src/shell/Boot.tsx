import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { isDesktop } from "../lib/lcu";
import { getSettings } from "../lib/settings";
import { Skeleton, cx } from "../ui";
import { WindowControls } from "./WindowControls";

/** Premier affichage pendant qu'on cherche le client : l'interface est déjà là, en squelettes. */
export function Boot() {
  return (
    <div className={cx("app boot", isDesktop && "desktop")} aria-busy="true" aria-label="Connexion au client League of Legends">
      <header className="top" data-tauri-drag-region>
        <div className="logo" data-tauri-drag-region>
          NIXUS
        </div>
        <Skeleton style={{ width: 360, height: 14 }} />
        <span className="top-gap" data-tauri-drag-region />
        <Skeleton style={{ width: 150, height: 34 }} />
        <WindowControls />
      </header>
      <div className="boot-body">
        <span className="eyebrow">Connexion au client League of Legends…</span>
        <Skeleton style={{ width: "min(560px, 70vw)", height: 84 }} />
        <Skeleton style={{ width: "min(400px, 55vw)", height: 16 }} />
        <div className="boot-tiles">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      </div>
      <Skeleton className="boot-dock" />
    </div>
  );
}

/** Écran sans client : lance LoL une fois si l'option est active, sinon propose de le faire. */
export function Disconnected() {
  const [launch, setLaunch] = useState<"idle" | "started" | string>("idle");
  const start = () =>
    invoke<string>("launch_league").then(
      (r) => setLaunch(r === "running" ? "started" : r),
      (e) => setLaunch(String(e)),
    );
  useEffect(() => {
    if (isDesktop && getSettings().autoLaunchLol) start();
  }, []);
  const started = launch === "started";
  const failed = launch !== "idle" && !started;
  return (
    <div className={cx("app offline", isDesktop && "desktop")}>
      <header className="top" data-tauri-drag-region>
        <div className="logo" data-tauri-drag-region>
          NIXUS
        </div>
        <span className="top-gap" data-tauri-drag-region />
        <WindowControls />
      </header>
      <div className="offline-body">
        <span className="offline-pulse" aria-hidden="true" />
        <h1 className="h1">{started ? "Lancement de LoL…" : "Lance League of Legends"}</h1>
        <p className="dim">
          {started
            ? "Le client démarre. Connecte-toi dans la fenêtre Riot si elle le demande, NIXUS prend le relais tout seul."
            : "NIXUS se branche sur le client officiel. Ouvre-le et connecte-toi, NIXUS le détectera tout seul en quelques secondes."}
        </p>
        {failed && <p className="note bad">{launch}</p>}
        {isDesktop && !started && (
          <button className="btn btn-red" onClick={start}>
            Lancer League of Legends
          </button>
        )}
      </div>
    </div>
  );
}
