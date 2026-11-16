/**
 * Thèmes de couleurs de NIXUS.
 * Pour en ajouter un : une ligne ici, et un bloc `:root[data-theme="<id>"]` dans styles/themes.css
 * qui redéfinit les jetons de couleur (accent, fonds). Rien d'autre à toucher.
 */
export interface Theme {
  id: string;
  name: string;
  /** Deux couleurs pour la pastille d'aperçu : l'accent et le fond. */
  swatch: [string, string];
}

export const THEMES: Theme[] = [
  { id: "cinema", name: "Cinéma", swatch: ["#e50914", "#08080a"] },
  { id: "abysse", name: "Abysse", swatch: ["#2f6bff", "#060912"] },
  { id: "neon", name: "Néon", swatch: ["#a63cf5", "#0a0711"] },
  { id: "braise", name: "Braise", swatch: ["#e8590c", "#0b0807"] },
  { id: "jade", name: "Jade", swatch: ["#0b9d8a", "#060b0b"] },
];
