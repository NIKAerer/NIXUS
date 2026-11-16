import { actions, clearError, useClient } from "../lib/client";
import type { Feedback } from "../lib/feedback";
import { profileIcon, queueName } from "../lib/lcu";
import { Art, Icon } from "../ui";

const DURATION = 12; // secondes laissées par Riot pour accepter

/** « Partie trouvée ». L'acceptation reste un clic du joueur, jamais automatique. */
export function ReadyCheck() {
  const rc = useClient((s) => s.search)?.readyCheck;
  const answered = rc?.playerResponse === "Accepted" || rc?.playerResponse === "Declined";
  const left = Math.max(0, DURATION - (rc?.timer ?? 0));
  const r = 86;
  const c = 2 * Math.PI * r;
  return (
    <div className="scrim found-scrim" role="dialog" aria-modal="true" aria-labelledby="found-title">
      <div className="found">
        <div className="found-ring">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="5" />
            <circle cx="100" cy="100" r={r} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - left / DURATION)} transform="rotate(-90 100 100)" style={{ transition: "stroke-dashoffset 1s linear" }} />
          </svg>
          <b>{Math.ceil(left)}</b>
        </div>
        <h2 id="found-title" className="h1">
          Partie trouvée
        </h2>
        {answered ? (
          <p className="dim">{rc?.playerResponse === "Accepted" ? "Acceptée. En attente des autres joueurs…" : "Refusée."}</p>
        ) : (
          <div className="found-btns">
            <button className="btn btn-red btn-l" onClick={actions.accept} autoFocus>
              Accepter
            </button>
            <button className="btn btn-quiet btn-l" onClick={actions.decline}>
              Refuser
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Cartes en haut à droite : invitations de groupe, retours de signalement, erreurs. */
export function Notices({ feedback, onDismiss, quiet }: { feedback: Feedback[]; onDismiss: (id: string) => void; quiet: boolean }) {
  const invitations = useClient((s) => s.invitations);
  const friends = useClient((s) => s.friends);
  const error = useClient((s) => s.error);
  if (!error && !invitations.length && (quiet || !feedback.length)) return null;
  return (
    <div className="notices" aria-live="polite">
      {error && (
        <div className="notice notice-error" role="alert">
          <p>{error}</p>
          <button className="mini" onClick={clearError}>
            OK
          </button>
        </div>
      )}
      {invitations.map((inv) => {
        // Le client n'envoie plus le nom : on le retrouve dans la liste d'amis.
        const f = friends.find((x) => x.summonerId && x.summonerId === inv.fromSummonerId);
        return (
          <div key={inv.invitationId} className="notice">
            <div className="notice-head">
              {f ? <Art src={profileIcon(f.icon)} /> : <Icon name="users" />}
              <p>
                <b>{f?.gameName || inv.fromSummonerName || "Un ami"}</b> t'invite en {inv.gameConfig ? queueName(inv.gameConfig.queueId) : "partie"}
              </p>
            </div>
            <div className="notice-btns">
              <button className="btn btn-white btn-s" onClick={() => actions.answerInvitation(inv.invitationId, true)}>
                Rejoindre
              </button>
              <button className="btn btn-quiet btn-s" onClick={() => actions.answerInvitation(inv.invitationId, false)}>
                Refuser
              </button>
            </div>
          </div>
        );
      })}
      {!quiet &&
        feedback.slice(0, 3).map((f) => (
          <div key={f.id} className="notice" role="status">
            <div className="notice-head">
              <Icon name="shield" size={22} className="up" />
              <p>
                <b>{f.title}</b>
              </p>
            </div>
            <p className="dim">{f.body}</p>
            <div className="notice-btns">
              <button className="btn btn-white btn-s" onClick={() => onDismiss(f.id)}>
                OK
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
