import { actions, demo, useClient } from "../lib/client";
import { unreadTotal, useConversations } from "../lib/chat";
import { profileIcon, rankLabel } from "../lib/lcu";
import { useUpdate } from "../lib/updater";
import { nav, useView, type Page } from "../lib/view";
import { toggleMaximize } from "../lib/window";
import { Art, Icon, RefreshButton, cx, int, plural, type IconName } from "../ui";
import { WindowControls } from "./WindowControls";

const PAGES: [Page, string, IconName][] = [
  ["home", "Accueil", "home"],
  ["grind", "Grind", "grind"],
  ["collection", "Collection", "collection"],
  ["loot", "Butin", "loot"],
  ["profile", "Profil", "profile"],
];

/** Barre du haut : navigation, compte, amis, réglages. `locked` pendant la sélection des champions. */
export function TopBar({ locked }: { locked: boolean }) {
  const page = useView((s) => s.page);
  const friendsOpen = useView((s) => s.friendsOpen);
  const summoner = useClient((s) => s.summoner);
  const ranked = useClient((s) => s.ranked);
  const wallet = useClient((s) => s.wallet);
  const friends = useClient((s) => s.friends);
  const update = useUpdate();
  const unread = unreadTotal(useConversations());
  const online = friends.filter((f) => f.availability !== "offline").length;
  const solo = ranked?.queueMap.RANKED_SOLO_5x5;
  const updateReady = update.phase === "available";

  const open = (p: Page) => {
    actions.closeEndOfGame();
    nav.page(p);
  };

  return (
    <header className="top" data-tauri-drag-region onDoubleClick={(e) => e.target === e.currentTarget && toggleMaximize()}>
      <div className="logo" data-tauri-drag-region>
        NIXUS
      </div>
      {!locked && (
        <nav className="nav" aria-label="Navigation">
          {PAGES.map(([id, label, icon]) => (
            <button key={id} aria-current={page === id ? "page" : undefined} onClick={() => open(id)}>
              <Icon name={icon} size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      <span className="top-gap" data-tauri-drag-region />
      {demo && (
        <span className="tag gold" title="Le client Riot n'est pas branché : données d'exemple">
          Démo
        </span>
      )}
      {wallet && (
        <span className="wallet" title="Essences bleues et Riot Points">
          <b>{int(wallet.lol_blue_essence ?? 0)}</b> EB
          <i />
          <b>{int(wallet.RP ?? 0)}</b> RP
        </span>
      )}
      {summoner && (
        <button className="top-me" onClick={() => !locked && open("profile")} disabled={locked} title="Ton profil">
          <Art src={profileIcon(summoner.profileIconId)} />
          <span>
            <b>{summoner.gameName}</b>
            <small>
              {rankLabel(solo?.tier, solo?.division)}
              {solo?.tier ? ` · ${solo.leaguePoints} LP` : ""}
            </small>
          </span>
        </button>
      )}
      {!locked && (
        <button className={cx("icon-btn top-friends")} aria-pressed={friendsOpen} onClick={nav.toggleFriends} title={unread ? `${plural(unread, "message")} non lu${unread > 1 ? "s" : ""}` : `Amis · ${online} en ligne`} aria-label="Amis">
          <Icon name="friends" />
          {unread ? <i className="badge">{unread}</i> : online ? <i className="badge green">{online}</i> : null}
        </button>
      )}
      {!locked && <RefreshButton onRefresh={actions.refresh} />}
      <button className="icon-btn" onClick={() => nav.settings(true)} aria-label={updateReady ? "Paramètres, mise à jour disponible" : "Paramètres"} title={updateReady ? "Mise à jour disponible" : "Paramètres"}>
        <Icon name="settings" />
        {updateReady && <i className="dot" />}
      </button>
      <WindowControls />
    </header>
  );
}
