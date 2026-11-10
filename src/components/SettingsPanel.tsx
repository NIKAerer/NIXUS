import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DEFAULTS, setSettings, useSettings, type Settings } from "../lib/settings";
import { playChime } from "../lib/window";
import { invoke } from "@tauri-apps/api/core";
import { isDesktop, lcu, timeAgo } from "../lib/lcu";
import type { Summoner } from "../lib/types";
import { loadRecords, riotAccount, riotError, snapshot } from "../lib/archive";
import { showLolWindow } from "../lib/useClient";
import { appVersion, checkUpdate, installUpdate, useUpdate } from "../lib/updater";
import { runningCount } from "../lib/breath";

/**
 * Paramètres de NIXUS (variante A de la maquette) : 5 sections à gauche, une seule affichée,
 * une recherche qui filtre toutes les sections, et des réglages dépendants grisés tant que leur parent est coupé.
 */

type SectionId = "acc" | "cli" | "not" | "app" | "upd";
const SECTIONS: { id: SectionId; name: string; desc: string; icon: ReactNode }[] = [
  { id: "acc", name: "Compte et données", desc: "Ce qui alimente Grind et ton historique.", icon: <path d="M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6" /> },
  { id: "cli", name: "Client LoL", desc: "Comment NIXUS lance et pilote le client officiel.", icon: <path d="M3 4h14v10H3zM7 17h6M10 14v3" /> },
  { id: "not", name: "Partie trouvée", desc: "Être prévenu sans regarder l'écran.", icon: <path d="M10 2a5 5 0 0 0-5 5v4l-2 3h14l-2-3V7a5 5 0 0 0-5-5Zm-2 15a2 2 0 0 0 4 0" /> },
  { id: "app", name: "Apparence", desc: "Tout ce qui anime ou décore l'interface.", icon: <path d="M10 2a8 8 0 1 0 0 16c1 0 1.5-.8 1.2-1.6-.4-1 .3-2.4 1.8-2.4H15a3 3 0 0 0 3-3c0-5-3.6-9-8-9ZM6 9h0M9 6h0M13 7h0" /> },
  { id: "upd", name: "Mises à jour et à propos", desc: "Version et entretien.", icon: <path d="M10 3v10m-4-4 4 4 4-4M4 17h12" /> },
];

/** Un réglage : où il vit, son titre, son explication, de quel autre il dépend et son contrôle. */
interface Row {
  id: string;
  sec: SectionId;
  label: string;
  hint?: string;
  /** Réglage à activer d'abord. */
  dep?: keyof Settings;
  /** Mots en plus pour la recherche. */
  words?: string;
  control: (ctx: { id: string; off: boolean; hintId: string }) => ReactNode;
  /** Bloc qui gère lui-même son titre (compteur, clé, archive…). */
  wide?: boolean;
}

const LABEL: Partial<Record<keyof Settings, string>> = {
  autoLaunchLol: "Lancer LoL automatiquement",
  readySound: "Son à « Partie trouvée »",
  breath: "Respiration des champions",
};

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const [cur, setCur] = useState<SectionId>("acc");
  const [q, setQ] = useState("");
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reset = () => setSettings({ ...DEFAULTS, riotKey: s.riotKey, riotRegion: s.riotRegion, importSince: s.importSince, lpStart: s.lpStart });
  const sw =
    (key: keyof Settings) =>
    ({ id, off, hintId }: { id: string; off: boolean; hintId: string }) => (
      <input id={id} type="checkbox" role="switch" className="st-switch" checked={!!s[key]} disabled={off} aria-describedby={hintId} onChange={(e) => setSettings({ [key]: e.target.checked })} />
    );

  const ROWS: Row[] = [
    { id: "key", sec: "acc", label: "Clé API Riot", hint: "Sert à importer tes parties classées dans Grind. Une clé de développement expire toutes les 24 h. Elle reste sur ce PC.", words: "riot api rgapi tester", control: ({ hintId }) => <RiotKey hintId={hintId} /> },
    {
      id: "region",
      sec: "acc",
      label: "Région de ton compte",
      hint: "Où l'API Riot cherche tes parties.",
      control: ({ id, hintId }) => (
        <select id={id} className="search pa-in" value={s.riotRegion} aria-describedby={hintId} onChange={(e) => setSettings({ riotRegion: e.target.value })}>
          {REGIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      ),
    },
    {
      id: "since",
      sec: "acc",
      label: "Importer les parties depuis",
      hint: "Date de départ de l'import dans Grind.",
      control: ({ id, hintId }) => <input id={id} className="search pa-in" type="date" value={s.importSince} aria-describedby={hintId} onChange={(e) => setSettings({ importSince: e.target.value || DEFAULTS.importSince })} />,
    },
    { id: "archive", sec: "acc", label: "Archive locale", words: "sauvegarde sauvegarder parties taille synchro", wide: true, control: () => <ArchiveRow /> },
    { id: "restore", sec: "acc", label: "Restaurer une sauvegarde", hint: "Ajoute à ton archive les parties d'un fichier de sauvegarde. Rien n'est effacé.", words: "fichier importer", control: () => <RestoreButton /> },

    { id: "auto", sec: "cli", label: "Lancer LoL automatiquement", hint: "Au démarrage, NIXUS ouvre le client s'il est fermé.", control: sw("autoLaunchLol") },
    { id: "hide", sec: "cli", dep: "autoLaunchLol", label: "Cacher la fenêtre du client officiel", hint: "Ferme la fenêtre au repos et pendant la partie pour libérer la RAM. NIXUS la rouvre réduite avant une recherche.", control: sw("hideLol") },
    {
      id: "window",
      sec: "cli",
      label: "Fenêtre du client LoL",
      hint: "« Afficher » la laisse ouverte 10 minutes (boutique, réglages).",
      control: () => (
        <div className="pa-btns">
          <button className="btn btn-ghost small" onClick={() => showLolWindow()}>
            Afficher
          </button>
          <button className="btn btn-ghost small" onClick={() => lcu("POST", "/riotclient/ux-minimize").catch(() => {})}>
            Réduire
          </button>
        </div>
      ),
    },
    { id: "mem", sec: "cli", label: "Mémoire et processeur", words: "ram cpu compteur mémoire", wide: true, control: () => <MemoryRow /> },

    { id: "sound", sec: "not", label: "Son à « Partie trouvée »", hint: "Un petit carillon.", control: sw("readySound") },
    {
      id: "vol",
      sec: "not",
      dep: "readySound",
      label: "Volume du son",
      control: ({ id, off }) => (
        <div className="pa-btns">
          <input id={id} type="range" min={0} max={1} step={0.05} value={s.volume} disabled={off} onChange={(e) => setSettings({ volume: Number(e.target.value) })} />
          <span className="pa-val">{Math.round(s.volume * 100)} %</span>
          <button className="btn btn-ghost small" disabled={off} onClick={() => playChime(s.volume)}>
            Tester
          </button>
        </div>
      ),
    },
    { id: "focus", sec: "not", label: "Ramener NIXUS devant", hint: "La fenêtre revient au premier plan et clignote dans la barre des tâches.", control: sw("readyFocus") },
    { id: "notif", sec: "not", label: "Notification Windows", hint: "Une notification s'affiche, même quand NIXUS est réduit. Accepter reste un clic de ta part.", control: sw("readyNotify") },
    { id: "qbar", sec: "not", label: "Bandeau de recherche", hint: "Le chrono de la file reste affiché en bas de toutes les pages.", control: sw("queueBar") },

    { id: "skins", sec: "app", label: "Skins aléatoires", hint: "Chaque visuel de champion prend un skin au hasard. Désactivé : skin classique.", control: sw("randomSkins") },
    { id: "fx", sec: "app", label: "Animations du fond", hint: "Zoom lent, lumières et braises sur l'accueil.", control: sw("heroFx") },
    { id: "breath", sec: "app", label: "Respiration des champions", hint: "Les images de champions et de skins bougent légèrement, comme si elles respiraient. Coupée aussi si Windows demande moins d'animations.", control: sw("breath") },
    {
      id: "breathAmt",
      sec: "app",
      dep: "breath",
      label: "Intensité de la respiration",
      hint: "60 % = normal.",
      control: ({ id, off, hintId }) => (
        <div className="pa-btns">
          <input id={id} type="range" min={10} max={100} step={5} value={s.breathAmt} disabled={off} aria-describedby={hintId} onChange={(e) => setSettings({ breathAmt: Number(e.target.value) })} />
          <span className="pa-val">{s.breathAmt} %</span>
        </div>
      ),
    },
    { id: "calm", sec: "app", label: "Couper les animations en partie", hint: "Plus rien ne bouge pendant que LoL tourne, pour économiser la RAM et le processeur.", control: sw("calmInGame") },
    { id: "badges", sec: "app", label: "Badge du mode sur les parties", hint: "Classé, ARAM, Arena… en haut de chaque tuile.", control: sw("modeBadges") },

    { id: "version", sec: "upd", label: "Version", words: "mise à jour chercher nixus", wide: true, control: () => <UpdateRow /> },
    { id: "updAuto", sec: "upd", label: "Vérifier au démarrage", hint: "Te prévient quand une nouvelle version existe.", control: sw("checkUpdates") },
    {
      id: "reset",
      sec: "upd",
      label: "Remettre par défaut",
      hint: "Rétablit tous les réglages. Ton archive, ta clé et ta date d'import ne sont pas touchées.",
      control: () => (
        <button className="btn btn-ghost small" onClick={reset}>
          Remettre par défaut
        </button>
      ),
    },
  ];

  const needle = q.trim().toLowerCase();
  const matches = (r: Row) => !needle || `${r.label} ${r.hint ?? ""} ${r.words ?? ""}`.toLowerCase().includes(needle);
  const shown = needle ? SECTIONS.filter((x) => ROWS.some((r) => r.sec === x.id && matches(r))) : SECTIONS.filter((x) => x.id === cur);

  // Flèches haut / bas dans le menu, comme une liste d'onglets.
  const onNavKey = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const i = SECTIONS.findIndex((x) => x.id === cur);
    const j = e.key === "Home" ? 0 : e.key === "End" ? SECTIONS.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + SECTIONS.length) % SECTIONS.length;
    setCur(SECTIONS[j].id);
    setQ("");
    navRef.current?.querySelectorAll<HTMLButtonElement>("button")[j]?.focus();
  };

  return (
    <div className="overlay sp-overlay" onClick={onClose}>
      <div className="pa" role="dialog" aria-modal="true" aria-labelledby="pa-title" onClick={(e) => e.stopPropagation()}>
        <header className="pa-head">
          <div>
            <h2 id="pa-title">Paramètres</h2>
            <small>Enregistrés sur ce PC, appliqués tout de suite.</small>
          </div>
          <input className="search pa-search" type="search" placeholder="Rechercher un réglage…" aria-label="Rechercher un réglage" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="gd-close sp-close" onClick={onClose} aria-label="Fermer les paramètres">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="pa-main">
          <div className="pa-nav" role="tablist" aria-orientation="vertical" aria-label="Sections" ref={navRef} onKeyDown={onNavKey}>
            {SECTIONS.map((x) => {
              const on = !needle && x.id === cur;
              return (
                <button key={x.id} role="tab" id={`pa-tab-${x.id}`} aria-selected={on} aria-controls="pa-panel" tabIndex={x.id === cur ? 0 : -1} className={on ? "on" : ""} onClick={() => (setCur(x.id), setQ(""))}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {x.icon}
                  </svg>
                  <span>{x.name}</span>
                </button>
              );
            })}
          </div>
          <div className="pa-body" id="pa-panel" role={needle ? "region" : "tabpanel"} aria-labelledby={needle ? undefined : `pa-tab-${cur}`} aria-label={needle ? "Résultats de la recherche" : undefined}>
            {shown.length === 0 && <p className="pa-empty">Aucun réglage ne correspond à « {q} ».</p>}
            {shown.map((x) => (
              <section key={x.id} className="pa-sec">
                <h3>{x.name}</h3>
                <p>{x.desc}</p>
                {ROWS.filter((r) => r.sec === x.id && matches(r)).map((r) => (
                  <RowView key={r.id} row={r} off={!!r.dep && !s[r.dep]} q={needle} />
                ))}
              </section>
            ))}
          </div>
        </div>
        <footer className="pa-foot">
          <span>NIXUS ne fait que ce que le client officiel permet, rien pendant la partie.</span>
          <button className="btn btn-ghost small" onClick={reset}>
            Remettre par défaut
          </button>
        </footer>
      </div>
    </div>
  );
}

function RowView({ row, off, q }: { row: Row; off: boolean; q: string }) {
  const base = useId();
  const id = `${base}c`;
  const hintId = `${base}h`;
  if (row.wide) return <div className="pa-row wide">{row.control({ id, off, hintId })}</div>;
  return (
    <div className={`pa-row ${row.dep ? "sub" : ""} ${off ? "off" : ""}`}>
      <div className="pa-t">
        <label htmlFor={id}>{hl(row.label, q)}</label>
        {row.hint && <small id={hintId}>{hl(row.hint, q)}</small>}
        {off && row.dep && <small className="pa-dep">Active « {LABEL[row.dep] ?? row.dep} » pour régler ceci.</small>}
      </div>
      <div className="pa-c">{row.control({ id, off, hintId })}</div>
    </div>
  );
}

/** Surligne les mots recherchés. */
function hl(text: string, q: string): ReactNode {
  if (!q) return text;
  const parts: ReactNode[] = [];
  const low = text.toLowerCase();
  let i = 0;
  for (let j = low.indexOf(q); j >= 0; j = low.indexOf(q, i)) {
    parts.push(text.slice(i, j), <mark key={`m${j}`}>{text.slice(j, j + q.length)}</mark>);
    i = j + q.length;
  }
  parts.push(text.slice(i));
  return parts.map((p, k) => <Fragment key={k}>{p}</Fragment>);
}

const REGIONS: [string, string][] = [
  ["europe", "Europe (EUW, EUNE, TR, RU)"],
  ["americas", "Amériques (NA, BR, LAN, LAS)"],
  ["asia", "Asie (KR, JP)"],
  ["sea", "Asie du Sud-Est et Océanie"],
];

const lcuMe = () => lcu<Summoner>("GET", "/lol-summoner/v1/current-summoner").catch(() => null);

/** Clé de l'API Riot, avec le test et l'état valide / invalide. */
function RiotKey({ hintId }: { hintId: string }) {
  const s = useSettings();
  const [show, setShow] = useState(false);
  const [state, setState] = useState<{ ok: boolean | null; msg: string } | null>(null);
  const check = async () => {
    setState({ ok: null, msg: "Vérification…" });
    try {
      const me = await lcuMe();
      if (!me) throw new Error("Connecte-toi au client LoL pour tester la clé.");
      if (!me.gameName || !me.tagLine) throw new Error("Le client n'a pas encore donné ton Riot ID. Réessaie dans un instant.");
      await riotAccount(me.gameName, me.tagLine, s.riotKey, s.riotRegion);
      setState({ ok: true, msg: `Clé valide pour ${me.gameName}#${me.tagLine}.` });
    } catch (e) {
      setState({ ok: false, msg: `${riotError(e)} (${s.riotKey.length} caractères, 42 attendus).` });
    }
  };
  return (
    <div className="pa-key">
      <div className="pa-btns">
        <input
          className="search pa-in mono"
          type={show ? "text" : "password"}
          placeholder="RGAPI-…"
          aria-label="Clé API Riot"
          aria-describedby={hintId}
          value={s.riotKey}
          onChange={(e) => (setSettings({ riotKey: e.target.value.trim() }), setState(null))}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn btn-ghost small" onClick={() => setShow((v) => !v)}>
          {show ? "Masquer" : "Afficher"}
        </button>
        <button className="btn btn-red small" onClick={check} disabled={!s.riotKey}>
          Tester la clé
        </button>
      </div>
      {state && (
        <small className="pa-msg" role="status">
          {state.ok === true && <span className="pa-pill ok">valide</span>}
          {state.ok === false && <span className="pa-pill bad">invalide</span>}
          {state.msg}
        </small>
      )}
    </div>
  );
}

const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

/** Nombre de parties, taille et dernière synchro de l'archive, avec la sauvegarde. */
function ArchiveRow() {
  const [info, setInfo] = useState<{ games: number; bytes: number; last: number } | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    (async () => {
      const games = (await loadRecords().catch(() => [])).length;
      if (!isDesktop) {
        let bytes = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          if (k.startsWith("nixus.archive.") && !k.startsWith("nixus.archive.debug")) bytes += (localStorage.getItem(k)?.length ?? 0) * 2;
        }
        return setInfo({ games, bytes, last: 0 });
      }
      const st = await invoke<{ bytes: number; last: number }>("archive_stats").catch(() => ({ bytes: 0, last: 0 }));
      setInfo({ games, ...st });
    })();
  }, []);
  const backup = () => {
    if (!isDesktop) return setMsg("Disponible dans l'application.");
    setMsg("Sauvegarde…");
    invoke<string>("archive_backup").then(
      (p) => setMsg(`Enregistrée dans ${p}`),
      (e) => setMsg(`Échec : ${e}`),
    );
  };
  return (
    <div className="pa-line">
      <div className="pa-t">
        <b>Archive locale</b>
        <small>
          {info === null
            ? "Lecture…"
            : `${info.games} partie${info.games > 1 ? "s" : ""} classée${info.games > 1 ? "s" : ""} · ${size(info.bytes)}${info.last ? ` · dernière synchro ${timeAgo(info.last)}` : ""}`}
        </small>
        {msg && (
          <small className="pa-msg" role="status">
            {msg}
          </small>
        )}
      </div>
      <button className="btn btn-ghost small" onClick={backup} title="Crée un fichier dans tes Documents">
        Sauvegarder
      </button>
    </div>
  );
}

function RestoreButton() {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const pick = async (f?: File) => {
    if (!f) return;
    if (!isDesktop) return setMsg("Disponible dans l'application.");
    setMsg("Restauration…");
    try {
      const n = await invoke<number>("archive_restore", { content: await f.text() });
      setMsg(`${n} entrée${n > 1 ? "s" : ""} restaurée${n > 1 ? "s" : ""}. Rouvre Grind pour les voir.`);
    } catch (e) {
      setMsg(String(e));
    }
  };
  return (
    <div className="pa-btns">
      {msg && (
        <small className="pa-msg" role="status">
          {msg}
        </small>
      )}
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button className="btn btn-ghost small" onClick={() => input.current?.click()}>
        Choisir un fichier
      </button>
    </div>
  );
}

const PROC_LABEL: Record<string, string> = {
  "leagueclientuxrender.exe": "Fenêtre du client LoL",
  "leagueclientux.exe": "Client LoL (interface)",
  "leagueclient.exe": "Client LoL (fond)",
  "riotclientux.exe": "Riot Client (interface)",
  "riotclientuxrender.exe": "Riot Client (fenêtre)",
  "riotclientservices.exe": "Riot Client (services)",
  "riotclientcrashhandler.exe": "Riot Client (crash)",
  "league of legends.exe": "Partie en cours",
};
const MEM_PATHS = ["/lol-settings/v1/local/lol-general", "/lol-settings/v2/account/LCUPreferences/lol-general", "/lol-settings/v1/account/lol-general", "/riotclient/ux-state"] as const;

/** RAM des processus Riot / LoL et de NIXUS lui-même (+ processeur), mesurée toutes les 5 s. */
function MemoryRow() {
  const [list, setList] = useState<[string, number][] | null>(null);
  const [own, setOwn] = useState<{ mb: number; cpu: number; anim: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => {
    if (!isDesktop) {
      setList([["LeagueClientUxRender.exe", 612], ["LeagueClient.exe", 248], ["LeagueClientUx.exe", 96], ["RiotClientServices.exe", 180]]);
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      setOwn({ mb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : 0, cpu: 0, anim: runningCount() });
      return;
    }
    invoke<[string, number][]>("client_memory").then((l) => setList(l.sort((a, b) => b[1] - a[1])), () => setList([]));
    invoke<[number, number]>("nixus_usage").then(([mb, cpu]) => setOwn({ mb, cpu, anim: runningCount() }), () => {});
  };
  useEffect(() => {
    load();
    snapshot("client-settings", MEM_PATHS);
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  const total = (list ?? []).reduce((n, [, mb]) => n + mb, 0);
  const closeNow = async () => {
    setBusy(true);
    setMsg("");
    const phase = await lcu<string>("GET", "/lol-gameflow/v1/gameflow-phase").catch(() => "None");
    if (!["None", "Lobby", "EndOfGame"].includes(phase)) {
      setMsg("Pas pendant une file, une draft ou une partie.");
    } else {
      await lcu("POST", "/riotclient/kill-ux").catch(() => {});
      setMsg("Fenêtre fermée. NIXUS la rouvrira avant ta prochaine file.");
      setTimeout(load, 3000);
    }
    setBusy(false);
  };
  return (
    <div className="pa-mem">
      <div className="pa-line">
        <div className="pa-t">
          <b>Mémoire et processeur</b>
          <small>Mesurés toutes les 5 s.{msg && ` ${msg}`}</small>
        </div>
        <div className="pa-btns">
          <button className="btn btn-ghost small" onClick={load}>
            Mesurer
          </button>
          <button className="btn btn-ghost small" onClick={closeNow} disabled={busy} title="Ferme la fenêtre du client officiel (hors file seulement)">
            Fermer la fenêtre
          </button>
        </div>
      </div>
      <div className="pa-meters">
        <div>
          <span>Client LoL</span>
          <b>{list === null ? "…" : list.length ? `${total.toLocaleString("fr-FR")} Mo` : "fermé"}</b>
        </div>
        <div>
          <span>NIXUS</span>
          <b>{own ? `${own.mb.toLocaleString("fr-FR")} Mo` : "…"}</b>
        </div>
        <div>
          <span>Processeur NIXUS</span>
          <b>{own && isDesktop ? `${own.cpu.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "…"}</b>
        </div>
        <div>
          <span>Images animées</span>
          <b>{own ? own.anim : "…"}</b>
        </div>
      </div>
      {list && list.length > 0 && (
        <span className="st-mem-list">
          {list.map(([n, mb]) => (
            <span key={n}>
              {PROC_LABEL[n.toLowerCase()] ?? n} <i>{mb} Mo</i>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function UpdateRow() {
  const u = useUpdate();
  const [version, setVersion] = useState("");
  useEffect(() => {
    appVersion().then(setVersion, () => setVersion("?"));
  }, []);

  let hint = "Cherche une nouvelle version sur GitHub et l'installe sans repasser par l'installeur.";
  let action = (
    <button className="btn btn-ghost small" onClick={() => checkUpdate()}>
      Chercher une mise à jour
    </button>
  );
  switch (u.phase) {
    case "checking":
      hint = "Recherche en cours…";
      action = <button className="btn btn-ghost small" disabled>Chercher une mise à jour</button>;
      break;
    case "uptodate":
      hint = "Tu es à jour.";
      break;
    case "available":
      hint = `La version ${u.version} est disponible.${u.notes ? " " + u.notes : ""}`;
      action = (
        <button className="btn btn-red small" onClick={() => installUpdate()}>
          Installer et relancer
        </button>
      );
      break;
    case "downloading":
      hint = u.total ? `Téléchargement… ${Math.round((u.done / u.total) * 100)} %` : "Téléchargement…";
      action = <button className="btn btn-ghost small" disabled>Patiente</button>;
      break;
    case "installing":
      hint = "Installation, NIXUS va se relancer.";
      action = <button className="btn btn-ghost small" disabled>Patiente</button>;
      break;
    case "error":
      hint = u.message;
      break;
  }

  return (
    <div className={`pa-line ${u.phase === "available" ? "has-update" : ""}`}>
      <div className="pa-t">
        <b>NIXUS {version ? (/^\d/.test(version) ? "v" + version : version) : ""}</b>
        <small role="status">{hint}</small>
      </div>
      {action}
    </div>
  );
}
