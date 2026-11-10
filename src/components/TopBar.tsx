import { useEffect, useState } from "react";
import { profileIcon, rankLabel } from "../lib/lcu";
import type { RankedStats, Summoner, Wallet } from "../lib/types";
import { Art } from "./ui";
import { RefreshButton } from "./RefreshButton";

export type Page = "home" | "grind" | "collection" | "loot" | "profile";

interface Props {
  page: Page;
  onPage?: (p: Page) => void;
  summoner: Summoner | null;
  ranked: RankedStats | null;
  wallet: Wallet | null;
  demo: boolean;
  scroller?: HTMLElement | null;
  friendsOnline?: number;
  friendsOpen?: boolean;
  onFriends?: () => void;
  searching?: boolean;
  onSettings?: () => void;
  onRefresh?: () => Promise<void> | void;
  updateReady?: boolean;
  unread?: number;
}

export function TopBar({ page, onPage, summoner, ranked, wallet, demo, scroller, friendsOnline, friendsOpen, onFriends, searching, onSettings, onRefresh, updateReady, unread = 0 }: Props) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    if (!scroller) return;
    const onScroll = () => setSolid(scroller.scrollTop > 40);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [scroller]);

  const solo = ranked?.queueMap.RANKED_SOLO_5x5;
  return (
    <header className={`top ${solid ? "solid" : ""} ${searching ? "searching" : ""}`} data-tauri-drag-region>
      <div className="logo" data-tauri-drag-region>NIXUS</div>
      {onPage && (
        <nav className="nav" aria-label="Navigation">
          <button aria-current={page === "home" ? "page" : undefined} onClick={() => onPage("home")}>
            Accueil
          </button>
          <button aria-current={page === "grind" ? "page" : undefined} onClick={() => onPage("grind")}>
            Grind
          </button>
          <button aria-current={page === "collection" ? "page" : undefined} onClick={() => onPage("collection")}>
            Collection
          </button>
          <button aria-current={page === "loot" ? "page" : undefined} onClick={() => onPage("loot")}>
            Butin
          </button>
          <button aria-current={page === "profile" ? "page" : undefined} onClick={() => onPage("profile")}>
            Profil
          </button>
        </nav>
      )}
      <div className="me">
        {demo && <span className="demo" title="Le client Riot n'est pas branché : données d'exemple">DÉMO</span>}
        {wallet && (
          <span className="wallet">
            <b>{(wallet.lol_blue_essence ?? 0).toLocaleString("fr-FR")}</b> EB · <b>{(wallet.RP ?? 0).toLocaleString("fr-FR")}</b> RP
          </span>
        )}
        {summoner && (
          <div className="rank">
            <b>{summoner.gameName}</b>
            {rankLabel(solo?.tier, solo?.division)}
            {solo?.tier ? ` · ${solo.leaguePoints} LP` : ""}
          </div>
        )}
        {summoner ? <Art src={profileIcon(summoner.profileIconId)} className="avatar" /> : <div className="avatar" />}
        {onFriends && (
          <button className={`friends-btn${unread ? " has-unread" : ""}`} aria-pressed={friendsOpen} onClick={onFriends} title={unread ? `${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}` : "Afficher tes amis"}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 11a4 4 0 100-8 4 4 0 000 8zm7 0a3 3 0 100-6 3 3 0 000 6zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6v1H2v-1zm15.5-5.8c2.6.4 4.5 2.4 4.5 4.8v2h-4v-2c0-1.8-.2-3.4-.5-4.8z" fill="currentColor" />
            </svg>
            Amis
            {friendsOnline !== undefined && <span>{friendsOnline}</span>}
          </button>
        )}
        {onRefresh && <RefreshButton onRefresh={onRefresh} top />}
        {onSettings && (
          <button className={`settings-btn${updateReady ? " has-update" : ""}`} onClick={onSettings} aria-label={updateReady ? "Paramètres, mise à jour disponible" : "Paramètres"} title={updateReady ? "Mise à jour disponible" : "Paramètres"}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19.4 13a7.6 7.6 0 000-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 00-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 000 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5L19.4 13zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"
              />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
