/** Transforme une erreur brute du client Riot (« 404 … », « 500 … ») en phrase claire. */
export function friendlyError(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e ?? "")).trim();
  const m = raw.match(/^(\d{3})\s*(.*)$/s);
  const code = m ? Number(m[1]) : 0;
  const msg = (m ? m[2] : raw).toLowerCase();

  if (raw.startsWith("Connexion au client impossible")) return "Le client League of Legends ne répond plus. Vérifie qu'il est toujours ouvert.";
  if (msg.includes("gatekeeper") || msg.includes("leaver") || msg.includes("queue_dodger") || msg.includes("penalty"))
    return "Tu ne peux pas lancer de file pour l'instant : une pénalité de file d'attente est active.";
  if (msg.includes("not_enough") || msg.includes("lobby size") || msg.includes("party size")) return "Le groupe n'a pas le bon nombre de joueurs pour cette file.";
  if (msg.includes("position_preference") || msg.includes("positions")) return "Choisis tes deux rôles avant de lancer la recherche.";
  if (msg.includes("password")) return "Mot de passe incorrect pour cette partie.";
  if (msg.includes("not_owner") || msg.includes("not owner") || msg.includes("leader")) return "Seul le chef du groupe peut faire ça.";
  if (msg.includes("unavailable") || msg.includes("disabled")) return "Ce mode n'est pas disponible en ce moment.";

  switch (code) {
    case 400:
      return "Le client Riot a refusé cette action. Réessaie dans un instant.";
    case 401:
    case 403:
      return "Le client Riot n'autorise pas cette action pour le moment.";
    case 404:
      return "Cette action n'est plus possible : la partie, le groupe ou l'élément n'existe plus.";
    case 409:
      return "Le client Riot est déjà en train de faire autre chose. Réessaie dans une seconde.";
    case 429:
      return "Trop de demandes d'un coup. Patiente quelques secondes.";
    case 500:
    case 502:
    case 503:
      return "Le client Riot a rencontré un problème. Réessaie dans un instant.";
  }
  return raw || "Une erreur inconnue est survenue.";
}
