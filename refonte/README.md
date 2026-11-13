# NIXUS, la refonte

Une réécriture complète de l'interface de NIXUS, livrée à côté de la version d'origine pour pouvoir comparer les deux.
La version d'origine (à la racine du dépôt) n'est pas modifiée.

Les deux applications s'installent et se lancent côte à côte : celle-ci s'appelle « NIXUS Refonte », avec son propre identifiant (`com.nika.nixus.refonte`) et son propre dossier de données.

## Lancer

```
cd refonte
npm install
npm run dev          # aperçu dans le navigateur, en mode démo (données d'exemple)
npm run tauri dev    # l'application, branchée sur le client LoL
npm run tauri build  # l'installeur Windows (NSIS)
```

Le mode démo tourne sur http://localhost:1421 (la version d'origine utilise le port 1420, les deux peuvent tourner en même temps).
En démo, « Trouver une partie » déroule toute une partie : file, partie trouvée, sélection des champions, partie en cours, écran de fin. Ajoute `?eog` à l'adresse pour ouvrir directement l'écran de fin.

## Ce qui est repris à l'identique

Toutes les fonctions de NIXUS sont là : groupe et invitations, files et parties personnalisées, sélection des champions (intentions, bans, choix, échanges, sorts, runes, skins), partie en cours, écran de fin avec honneur et signalement, fiche de partie avec replay et moments forts, Grind (archive locale, courbe de LP, import par clé API Riot), Profil et défis, Collection, Butin, amis et discussion, Paramètres, mises à jour Tauri.

Les règles n'ont pas changé : aucune automatisation (accepter une partie reste un clic), rien pendant la partie, et la fenêtre du client officiel n'est fermée qu'au repos.

Le code Rust (`src-tauri`) est celui d'origine, avec un seul ajout : au premier lancement, l'archive des parties de NIXUS est copiée dans le dossier de la refonte (l'originale n'est jamais touchée).

## Ce qui change

**L'interface**

- Une barre de jeu toujours visible en bas : mode, groupe, rôles et bouton « Trouver une partie » au même endroit sur toutes les pages. Pendant la recherche elle devient le chrono de file.
- Le groupe s'ouvre dans une bulle au-dessus de la barre, sans quitter la page en cours.
- Accueil plein cadre avec la file choisie, la journée, la série en cours et le classement entre amis.
- Les amis dans un panneau à droite qui pousse la page au lieu de la recouvrir.
- Grind et Profil avec un bandeau, des chiffres clés et des tableaux communs ; courbe de LP avec infobulle qui suit le curseur.
- Les actions définitives (désenchanter un butin, supprimer un groupe d'amis) demandent un second clic sur le même bouton au lieu d'une boîte de dialogue du système.

**Le code**

- L'état du client vit dans un store (`src/lib/client.ts`) et celui de l'interface dans un autre (`src/lib/view.ts`). Chaque écran s'abonne seulement à ce qu'il affiche : plus de propriétés passées de composant en composant, et moins de rendus inutiles.
- Un kit d'interface unique (`src/ui`) : boutons, fenêtres, onglets, tableaux, chiffres clés, icônes. Les écrans n'ont presque plus de style propre.
- Une feuille de style par domaine (`src/styles`) avec des jetons de design communs, au lieu d'un seul gros fichier.
- Rangement : `screens/` (pages), `features/` (blocs réutilisés), `shell/` (barre du haut, barre de jeu, fenêtres), `lib/` (client LoL, archive, réglages).

## Limites connues

- Les réglages ne sont pas repris de la version d'origine (les deux applications ont chacune leur stockage) : la clé API Riot est à ressaisir dans Paramètres.
- Les mises à jour automatiques pointent vers `refonte/latest.json`, qui n'est pas encore publié : « Chercher une mise à jour » répond qu'il n'y en a pas. `createUpdaterArtifacts` est à `false` pour que l'installeur se construise sans la clé de signature.
- La vérification a été faite en mode démo dans le navigateur (toutes les pages et toutes les étapes d'une partie). L'application n'a pas encore été essayée contre le vrai client LoL, et le code Rust n'a pas pu être compilé dans l'environnement où la refonte a été écrite.
