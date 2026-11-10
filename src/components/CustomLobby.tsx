import { useState } from "react";
import { Art } from "./ui";
import { championSquare, profileIcon } from "../lib/lcu";
import type { Friend, Lobby, LobbyMember } from "../lib/types";
import { useNames } from "../lib/names";

interface Actions {
  invite: (summonerId: number) => void;
  leaveLobby: () => void;
  customSwitchSide: () => void;
  customMoveTo: (target: "spectator" | "100" | "200") => void;
  kick: (summonerId: number) => void;
}

/** Salon de partie personnalisée, comme dans le client : côté bleu, côté rouge et spectateurs. */
export function CustomLobby({ lobby, friends, actions, locked }: { lobby: Lobby; friends: Friend[]; actions: Actions; locked: boolean }) {
  const [inviting, setInviting] = useState(false);
  const cfg = lobby.gameConfig;
  const blue = cfg.customTeam100 ?? [];
  const red = cfg.customTeam200 ?? [];
  const specs = cfg.customSpectators ?? [];
  const size = cfg.maxTeamSize || Math.max(1, Math.round((cfg.maxLobbySize ?? 10) / 2));
  const me = lobby.localMember;
  const leader = !!me?.isLeader;
  const has = (list: LobbyMember[]) => list.some((m) => m.summonerId === me?.summonerId);
  const mySide: "100" | "200" | "spectator" | null = has(blue) ? "100" : has(red) ? "200" : has(specs) ? "spectator" : null;
  const specsAllowed = cfg.customSpectatorPolicy !== "NotAllowed";
  const total = blue.length + red.length;

  const inLobby = new Set([...blue, ...red, ...specs, ...lobby.members].map((m) => m.summonerId));
  const invitable = friends.filter((f) => f.availability !== "offline" && f.lol?.gameStatus === "outOfGame" && f.summonerId && !inLobby.has(f.summonerId));

  const join = (side: "100" | "200") => {
    if (mySide === side) return;
    if (mySide === "100" || mySide === "200") actions.customSwitchSide();
    else actions.customMoveTo(side);
  };

  const known = useNames([...blue, ...red, ...specs, ...lobby.members].map((m) => (m.gameName || m.summonerName ? undefined : m.puuid)));
  const name = (m: LobbyMember) => m.gameName || m.summonerName || known(m.puuid) || (m.isBot ? "Bot" : "Joueur");

  const team = (side: "100" | "200", list: LobbyMember[]) => (
    <div className={`cl-team ${side === "100" ? "blue" : "red"}`}>
      <div className="cl-team-head">
        <h3>{side === "100" ? "Côté bleu" : "Côté rouge"}</h3>
        <span>
          {list.length} / {size}
        </span>
      </div>
      {list.map((m) => {
        const mine = m.summonerId === me?.summonerId;
        return (
          <div key={m.summonerId || name(m)} className={`cl-slot ${mine ? "mine" : ""}`}>
            <span className="cl-icon">
              <Art src={m.isBot && m.botChampionId ? championSquare(m.botChampionId) : profileIcon(m.summonerIconId)} />
            </span>
            <b title={name(m)}>{name(m)}</b>
            {m.isLeader && <em className="squad-crown cl-tag">Chef</em>}
            {m.isBot && <em className="cl-bot">Bot</em>}
            {mine && <span className="cl-you">Toi</span>}
            {leader && !mine && !m.isBot && !locked && (
              <button className="cl-kick" onClick={() => actions.kick(m.summonerId)} title={`Exclure ${name(m)}`} aria-label={`Exclure ${name(m)}`}>
                ×
              </button>
            )}
          </div>
        );
      })}
      {Array.from({ length: Math.max(0, size - list.length) }, (_, i) =>
        mySide !== side && i === 0 ? (
          <button key={`join-${i}`} className="cl-slot cl-join" onClick={() => join(side)} disabled={locked}>
            Rejoindre ce côté
          </button>
        ) : (
          <button key={`free-${i}`} className="cl-slot cl-free" onClick={() => setInviting((v) => !v)} disabled={locked} title="Inviter un ami">
            + Inviter
          </button>
        ),
      )}
    </div>
  );

  return (
    <aside className="squad cl" aria-label="Partie personnalisée">
      <div className="squad-head">
        <h2>Salon</h2>
        <span>
          {total} / {size * 2} joueurs{specs.length ? ` · ${specs.length} spectateur${specs.length > 1 ? "s" : ""}` : ""}
        </span>
        {!locked && (
          <button className="squad-leave" onClick={actions.leaveLobby}>
            Quitter
          </button>
        )}
      </div>

      <div className="cl-teams">
        {team("100", blue)}
        {team("200", red)}
      </div>

      <div className="cl-specs">
        <span className="label">Spectateurs</span>
        {!specsAllowed ? (
          <span className="meta">Désactivés pour cette partie.</span>
        ) : specs.length ? (
          specs.map((m) => (
            <span key={m.summonerId} className={`cl-spec ${m.summonerId === me?.summonerId ? "mine" : ""}`}>
              <Art src={profileIcon(m.summonerIconId)} />
              {name(m)}
            </span>
          ))
        ) : (
          <span className="meta">Personne.</span>
        )}
        {specsAllowed && mySide !== "spectator" && (
          <button className="chip cl-spec-btn" onClick={() => actions.customMoveTo("spectator")} disabled={locked}>
            Regarder en spectateur
          </button>
        )}
      </div>

      {inviting && !locked && (
        <div className="squad-invite">
          <div className="squad-invite-head">
            <span className="label">Amis disponibles</span>
            <button className="squad-leave" onClick={() => setInviting(false)}>
              Fermer
            </button>
          </div>
          {invitable.length ? (
            invitable.map((f) => (
              <button
                key={f.puuid}
                className="member member-btn"
                onClick={() => {
                  actions.invite(f.summonerId!);
                  setInviting(false);
                }}
              >
                <Art src={profileIcon(f.icon)} className="member-icon" />
                <b>{f.gameName}</b>
                <span style={{ marginLeft: "auto" }}>Inviter</span>
              </button>
            ))
          ) : (
            <span className="meta">Aucun ami disponible.</span>
          )}
        </div>
      )}
    </aside>
  );
}
