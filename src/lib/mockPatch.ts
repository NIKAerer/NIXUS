import { parsePatchArticle, type PatchDoc, type PatchRef } from "./patches";

/**
 * Notes de patch du mode démo. Écrites comme la page officielle (titres, portraits, listes avec ⇒)
 * puis passées dans le même découpage que les vraies : le mode démo teste aussi la lecture.
 * Les valeurs sont inventées.
 */

export const mockPatchList: PatchRef[] = [
  { path: "/fr-fr/news/game-updates/league-of-legends-patch-26-23-notes", version: "26.23", date: "2026-11-17T19:00:00.000Z" },
  { path: "/fr-fr/news/game-updates/league-of-legends-patch-26-22-notes", version: "26.22", date: "2026-11-03T19:00:00.000Z" },
  { path: "/fr-fr/news/game-updates/league-of-legends-patch-26-21-notes", version: "26.21", date: "2026-10-20T18:00:00.000Z" },
];

const portrait = (id: string) => `<a href="#"><img src="https://ddragon.leagueoflegends.com/cdn/16.22.1/img/champion/${id}.png" alt=""></a>`;
const item = (id: number) => `<a href="#"><img src="https://ddragon.leagueoflegends.com/cdn/16.22.1/img/item/${id}.png" alt=""></a>`;
const li = (label: string, before: string, after: string) => `<li><strong>${label}</strong> : ${before} ⇒ <strong>${after}</strong></li>`;

const html = (version: string) => `<!doctype html><html><head><meta property="og:image" content=""></head><body>
<nav><h2>Menu</h2></nav>
<main><article>
<h1>Notes de patch ${version} de League of Legends</h1>
<time datetime="2026-11-17T19:00:00.000Z"></time>
<div class="body">
<blockquote>Bienvenue dans le patch ${version} ! On ajuste les junglers qui dominent les premières minutes et on donne un coup de pouce aux mages de contrôle.</blockquote>
<h2>Temps forts du patch</h2>
<p>La carte d'hiver revient pour l'ARAM, et le chat vocal d'équipe arrive en partie classée.</p>
<h2>Champions</h2>
<div>${portrait("LeeSin")}<h3><a href="#">Lee Sin</a></h3>
<blockquote>Lee Sin prend l'avantage trop facilement sur ses premiers camps. On ralentit un peu son premier tour de jungle.</blockquote>
<h4>Q - Onde sonore / Frappe résonnante</h4>
<ul>${li("Dégâts", "55 / 80 / 105 / 130 / 155 (+ 115% des dégâts d'attaque bonus)", "50 / 75 / 100 / 125 / 150 (+ 115% des dégâts d'attaque bonus)")}
${li("Dégâts contre les monstres", "+ 30%", "+ 20%")}</ul>
<h4>Stats de base</h4>
<ul>${li("Armure", "36", "34")}</ul></div>
<div>${portrait("Vi")}<h3><a href="#">Vi</a></h3>
<blockquote>Vi peine à suivre les autres junglers en milieu de partie.</blockquote>
<h4>R - Arrestation</h4>
<ul>${li("Délai de récupération", "140 / 115 / 90 s", "130 / 105 / 80 s")}</ul></div>
<div>${portrait("Annie")}<h3><a href="#">Annie</a></h3>
<h4>R - Invocation : Tibbers</h4>
<ul>${li("Dégâts", "20 / 40 / 60 / 80 / 100 (+ 70% des dégâts d'attaque)", "20 / 40 / 60 / 80 / 100 (+ 60% des dégâts d'attaque)")}
<li><strong>Nouveau</strong> : Tibbers garde sa cible quand Annie meurt.<ul><li>Il disparaît au bout de 10 secondes.</li></ul></li></ul></div>
<div>${portrait("Orianna")}<h3><a href="#">Orianna</a></h3>
<h4>Stats de base</h4>
<ul>${li("Portée d'attaque", "525", "550")}${li("PV par niveau", "110", "115")}</ul></div>
<h2>Objets</h2>
<div>${item(3071)}<h3>Couperet noir</h3>
<ul>${li("Coût total", "3000 PO", "3100 PO")}</ul></div>
<div>${item(3157)}<h3>Sablier de Zhonya</h3>
<ul>${li("Armure", "50", "45")}</ul></div>
<h2>ARAM</h2>
<p>Les soins reçus sont réduits de 10% pour les champions suivants.</p>
<ul><li>Soraka, Yuumi, Sona</li></ul>
<h2>Corrections de bugs</h2>
<ul><li>Le Q de Lee Sin ne touche plus les cibles invisibles derrière un mur.</li><li>L'icône de la récompense de l'event s'affiche de nouveau dans le pass.</li></ul>
</div></article></main>
<footer><h2>Riot Games</h2></footer>
</body></html>`;

export const mockPatchArticle = (ref: PatchRef): PatchDoc => parsePatchArticle(html(ref.version), ref);
