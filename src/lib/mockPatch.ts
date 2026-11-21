import { parsePatchArticle, type PatchDoc, type PatchRef } from "./patches";

/**
 * Notes de patch du mode démo. Le balisage reprend celui de la vraie page (patch 26.23 relevé le
 * 21/11/2026 : #patch-notes-container, header-primary, patch-change-block, h4.ability-title avec
 * icône, champions ARAM en <p><strong>, badge NOUVEAU, skin-box) puis passe dans le même découpage
 * que les vraies : le mode démo teste aussi la lecture. Les textes et valeurs sont inventés.
 */

export const mockPatchList: PatchRef[] = [
  { path: "/fr-fr/news/game-updates/league-of-legends-patch-26-23-notes", version: "26.23", date: "2026-11-17T19:00:00.000Z" },
  { path: "/fr-fr/news/game-updates/league-of-legends-patch-26-22-notes", version: "26.22", date: "2026-11-03T19:00:00.000Z" },
  { path: "/fr-fr/news/game-updates/league-of-legends-patch-26-21-notes", version: "26.21", date: "2026-10-20T18:00:00.000Z" },
];

const DD = "https://am-a.akamaihd.net/image?f=https://ddragon.leagueoflegends.com/cdn/16.22.1/img";
const CMS = "https://cmsassets.rgpub.io/sanity/images/dsfx7636/news_live";
const champ = (id: string, name: string) =>
  `<p><a class="reference-link" href="#"><img src="${DD}/champion/${id}.png"></a></p><h3 class="change-title" id="patch-${id.toLowerCase()}"><a href="#">${name}</a></h3>`;
const item = (id: number, name: string) => `<p><a class="reference-link" href="#"><img src="${DD}/item/${id}.png"></a></p><h3 class="change-title"><a href="#">${name}</a></h3>`;
const ability = (spell: string, name: string) => `<h4 class="change-detail-title ability-title"><img src="${DD}/spell/${spell}.png">${name}</h4>`;
const li = (label: string, before: string, after: string) => `<li><strong>${label}</strong>&nbsp;: ${before} ⇒ <strong>${after}</strong></li>`;
const quote = (t: string) => `<blockquote class="blockquote context"><p>${t}</p></blockquote>`;
const block = (inner: string, change = false) => `<div class="content-border"><div class="${change ? "patch-change-block " : ""}white-stone accent-before"><div>${inner}</div></div></div>`;
const h2 = (id: string, t: string) => `<header class="header-primary"><h2 id="patch-${id}">${t}</h2></header>`;
const designer = (img: string, name: string) => `<div class="context-designers"><span class="context-designer"><img src="${CMS}/${img}"> ${name}</span></div>`;
const isNew = (name: string) => `<p><span><strong>&nbsp; NOUVEAU &nbsp;</strong></span><strong>&nbsp;- ${name}</strong></p>`;
const skin = (img: string, name: string) => `<div class="skin-box"><p><a class="skins cboxElement" href="#"><span class="content-border"><img src="${CMS}/${img}"></span></a></p><h4 class="skin-title"><a href="#">${name}</a></h4></div>`;

const html = (version: string) => `<!doctype html><html><head><meta property="og:image" content="${CMS}/606e9cb110e8ebce8d310a3d2d7159ff56cf14ef-1920x1092.jpg"></head><body>
<nav><h2>Menu</h2></nav>
<main><section id="${version}">
<h1>Notes de patch ${version} de League of Legends</h1>
<time datetime="2026-11-17T19:00:00.000Z"></time>
<div class="richText"><div id="patch-notes-container">
<h2 id="patch-top">&nbsp;</h2>
${quote(`Bienvenue dans le patch&nbsp;${version}&nbsp;! On ralentit les junglers qui dominent les premières minutes et on donne un coup de pouce aux mages de contrôle.<br><br>Vous n'êtes pas sur les bonnes notes de patch&nbsp;? Celles de TFT sont <a href="#"><i>ici</i></a>.`)}
${designer("d7e6f8e9d6bd9dfb639083e670d4ab31bfb7dc03-143x148.png", "Austin «&nbsp;Riot wroadie&nbsp;» Wright")}
${designer("b36c216eac2e27319ed6c7a5df2dd25e449adee2-220x220.jpg", "Erika «&nbsp;Riot Cashmiir&nbsp;» Haas")}
${h2("patch-highlights", "Temps forts du patch")}
${block(`<p><a class="skins cboxElement" href="#"><span class="content-border"><img src="${CMS}/d760b2d2e1f779adbf2c446fe07606706b71d654-1920x1080.png"></span></a></p><p>Trois nouveaux skins arrivent le 18&nbsp;novembre.</p>`)}
${h2("team-voice-chat", "Chat vocal d'équipe")}
${block(`${quote("Le chat vocal d'équipe arrive dans ce patch dans plusieurs régions.")}<hr class="divider"><ul><li>Disponible pendant la sélection des champions et en jeu.</li><li>Uniquement en mode Appuyer pour parler (touche «&nbsp;C&nbsp;» par défaut).</li></ul>`)}
${h2("champions", "Champions")}
${block(`${champ("LeeSin", "Lee Sin")}${quote("Lee Sin prend l'avantage trop facilement sur ses premiers camps. On ralentit un peu son premier tour de jungle.")}<hr class="divider">${ability("LeeSinQOne", "A - Onde sonore")}<p>/ Frappe résonnante</p><ul>${li("Dégâts", "55 / 80 / 105 / 130 / 155 (+ 115% des dégâts d'attaque bonus)", "50 / 75 / 100 / 125 / 150 (+ 115% des dégâts d'attaque bonus)")}${li("Dégâts contre les monstres", "+ 30%", "+ 20%")}</ul><hr class="divider"><h4 class="change-detail-title">Stats de base</h4><ul>${li("Armure", "36", "34")}</ul>`, true)}
${block(`${champ("Vi", "Vi")}${quote("Vi peine à suivre les autres junglers en milieu de partie.")}<hr class="divider">${ability("ViR", "R - Arrestation")}<ul>${li("Délai de récupération", "140 / 115 / 90 s", "130 / 105 / 80 s")}</ul>`, true)}
${block(`${champ("Annie", "Annie")}${quote("Annie manque un peu de puissance de feu, surtout avec un build Tibbers.")}<hr class="divider">${ability("AnnieR", "R - Invocation&nbsp;: Tibbers")}<ul>${li("PV de Tibbers", "1150 - 3500 (selon le niveau d'Annie) (+50% de la puissance)", "1275 - 4000 (selon le niveau d'Annie) (+50% de la puissance)")}<li><strong>Nouveau</strong>&nbsp;: Tibbers garde sa cible quand Annie meurt.<ul><li>Il disparaît au bout de 10 secondes.</li></ul></li></ul>`, true)}
${block(`${champ("Orianna", "Orianna")}<hr class="divider"><h4 class="change-detail-title">Stats de base</h4><ul>${li("Portée d'attaque", "525", "550")}${li("PV par niveau", "110", "115")}</ul>`, true)}
${h2("items", "Objets")}
${block(`${item(6699, "Cyclosabre voltaïque")}${quote("Le Cyclosabre domine un peu trop la méta, on réduit ses dégâts de déclenchement.")}<hr class="divider"><h4 class="change-detail-title">Firmament - Unique</h4><ul>${li("Dégâts bonus", "[9% || 7%] des PV actuels de la cible", "[8% || 6%] des PV actuels de la cible")}</ul>`, true)}
${block(`${item(3157, "Sablier de Zhonya")}<hr class="divider"><h4 class="change-detail-title">Stats</h4><ul>${li("Armure", "50", "45")}</ul>`, true)}
${h2("classic", "Classic")}
${block(`<h4 class="change-detail-title">Champions</h4><hr class="divider">${isNew("Talon")}${quote("Ce Talon a existé de 2011 à 2016 : un assassin plus simple à jouer, avec un saut ciblé et un silence.")}<ul><li><strong>Passif - Clémence</strong>&nbsp;: les attaques de base de Talon infligent des dégâts supplémentaires aux ennemis neutralisés.</li><li><strong>E - Écorcheur</strong>&nbsp;: Talon se téléporte derrière sa cible et la réduit au silence.</li></ul><hr class="divider"><p><strong>Corrections de bugs</strong></p><ul><li>Swain ne se révèle plus depuis le brouillard de guerre pendant son R.</li></ul>`)}
${h2("aram:-mayhem", "ARAM du chaos")}
${block(`${quote("Quatre nouvelles têtes d'affiche et un peu d'aide pour les tanks.")}<hr class="divider"><h4 class="change-detail-title">Champions</h4><p><strong>Brand</strong></p><ul>${li("Dégâts infligés", "100%", "95%")}</ul><p><strong>Jax</strong></p><ul>${li("Dégâts subis", "100%", "95%")}${li("Vitesse d'attaque", "0%", "5%")}</ul><p><strong>Lux</strong></p><ul>${li("Bouclier", "100%", "110%")}</ul><hr class="divider"><h4 class="change-detail-title">Optimisations</h4>${isNew("Fortification")}${quote("Les tourelles alliées vous octroient de l'armure quand vous êtes à proximité.")}<p><strong>Abeille bondissante</strong></p><ul>${li("Soins", "40", "50")}</ul><hr class="divider"><h4 class="change-detail-title">Corrections de bugs</h4><ul><li>L'optimisation Expiation s'applique de nouveau aux soins d'alliés.</li><li>Le compteur de têtes d'affiche ne disparaît plus après une mort.</li></ul>`)}
${h2("arena", "Arena")}
${block(`<h4 class="change-detail-title">Champions</h4><p><strong>Annie</strong></p>${ability("AnnieR", "R - Invocation&nbsp;: Tibbers")}<ul>${li("Dégâts", "150 / 275 / 400", "175 / 300 / 425")}</ul><hr class="divider"><p><strong>Braum</strong></p>${ability("Braum_Passive", "Compétence passive&nbsp;-&nbsp;Coups étourdissants")}<ul>${li("Durée de l'étourdissement", "1,25 s", "1,5 s")}</ul><hr class="divider"><h4 class="change-detail-title">Objets</h4><p><strong>Dent de Nashor</strong></p><ul>${li("Vitesse d'attaque", "50%", "45%")}</ul>`)}
${h2("bugfixes-and-qol-changes", "Corrections de bugs et améliorations")}
${block(`<ul><li>Le Q de Lee Sin ne touche plus les cibles invisibles derrière un mur.</li><li>L'icône de la récompense de l'event s'affiche de nouveau dans le pass.</li></ul>`)}
${h2("upcoming-skins-and-chromas", "Skins et chromas à venir")}
${block(`<p>Les skins suivants sortiront au cours de ce patch&nbsp;:</p><div class="gs-container default-2-col">${skin("e33d3039bd6b2e26538e2d24ba285eb81a747b0f-1920x1036.jpg", "Neeko Café Chouchous et Zoé Café Chouchous")}${skin("606e9cb110e8ebce8d310a3d2d7159ff56cf14ef-1920x1092.jpg", "DJ Sona remix ultime")}</div>`)}
${block(`<p>Les chromas suivants sortiront au cours de ce patch&nbsp;:</p><div class="gs-container default-2-col">${skin("52e0b4c92800e360d5e2a28a6a4a595373308c9f-1610x590.jpg", "Neeko Café Chouchous")}${skin("23c72079e81bb9d2a2b1fe58526761b12d11a49f-1610x590.jpg", "Zoé Café Chouchous")}</div>`)}
</div></div></section>
<section id="related-articles"><div class="header"><h2>Articles liés</h2></div><a href="#"><img src="${CMS}/related-1920x1080.jpg"><h3>Notes de patch 26.22</h3></a></section>
</main>
<footer><h2>Riot Games</h2></footer>
</body></html>`;

export const mockPatchArticle = (ref: PatchRef): PatchDoc => parsePatchArticle(html(ref.version), ref);
