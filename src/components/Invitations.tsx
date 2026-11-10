import { profileIcon, queueName } from "../lib/lcu";
import { Art } from "./ui";
import type { Friend, Invitation } from "../lib/types";

/** Invitations de groupe reçues, en haut à droite. Rejoindre ou refuser, un clic chacun. */
export function Invitations({ invitations, friends, onAnswer }: { invitations: Invitation[]; friends: Friend[]; onAnswer: (id: string, accept: boolean) => void }) {
  if (!invitations.length) return null;
  return (
    <div className="invites" aria-live="polite">
      {invitations.map((inv) => {
        // Le client n'envoie plus le nom : on le retrouve dans la liste d'amis.
        const f = friends.find((x) => x.summonerId && x.summonerId === inv.fromSummonerId);
        const who = f?.gameName || inv.fromSummonerName || "Un ami";
        return (
          <div key={inv.invitationId} className="invite">
            <div className="invite-who">
              {f && <Art src={profileIcon(f.icon)} alt="" />}
              <span>
                <b>{who}</b> t'invite en {inv.gameConfig ? queueName(inv.gameConfig.queueId) : "partie"}
              </span>
            </div>
            <div className="btns">
              <button className="btn btn-primary small" onClick={() => onAnswer(inv.invitationId, true)}>
                Rejoindre
              </button>
              <button className="btn btn-ghost small" onClick={() => onAnswer(inv.invitationId, false)}>
                Refuser
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
