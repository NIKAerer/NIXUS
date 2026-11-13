import { invoke } from "@tauri-apps/api/core";
import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { loadRecords, riotAccount, riotError, snapshot } from "../lib/archive";
import { runningCount } from "../lib/breath";
import { showLolWindow } from "../lib/client";
import { isDesktop, lcu, timeAgo } from "../lib/lcu";
import { DEFAULTS, setSettings, useSettings, type Settings } from "../lib/settings";
import type { Summoner } from "../lib/types";
import { appVersion, checkUpdate, installUpdate, useUpdate } from "../lib/updater";
import { nav } from "../lib/view";
import { playChime } from "../lib/window";
import { CloseButton, Icon, Modal, cx, int, plural, type IconName } from "../ui";

/**
 * Paramètres : cinq sections à gauche, une seule affichée, une recherche qui filtre tout,
 * et des réglages dépendants grisés tant que leur parent est coupé.
 */
type SectionId = "acc" | "cli" | "not" | "app" | "upd";
const SECTIONS: { id: SectionId; name: string; desc: string; icon: IconName }[] = [
  { id: "acc", name: "Compte et données", desc: "Ce qui alimente Grind et ton historique.", icon: "profile" },
  { id: "cli", name: "Client LoL", desc: "Comment NIXUS lance et pilote le client officiel.", icon: "max" },
  { id: "not", name: "Partie trouvée", desc: "Être prévenu sans regarder l'écran.", icon: "bolt" },
  { id: "app", name: "Apparence", desc: "Tout ce qui anime ou décore l'interface.", icon: "eye" },
  { id: "upd", name: "Mises à jour et à propos", desc: "Version et entretien.", icon: "refresh" },
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
  /** Bloc qui gère lui-même son titre (compteur, archive, version). */
  wide?: boolean;
}

const DEP_LABEL: Partial<Record<keyof Settings, string>> = {
  autoLaunchLol: "Lancer LoL automatiquement",
  readySound: "Son à « Partie trouvée »",
  breath: "Respiration des champions",
};
const REGIONS: [string, string][] = [
  ["europe", "Europe (EUW, EUNE, TR, RU)"],
  ["americas", "Amériques (NA, BR, LAN, LAS)"],
  ["asia", "Asie (KR, JP)"],
  ["sea", "Asie du Sud-Est et Océanie"],
];

export function SettingsPanel() {
  const s = useSettings();
  const [cur, setCur] = useState<SectionId>("acc");
  const [q, setQ] = useState("");
  const navRef = useRef<HTMLDivElement>(null);
  const close = () => nav.settings(false);

  const reset = () => setSettings({ ...DEFAULTS, riotKey: s.riotKey, riotRegion: s.riotRegion, importSince: s.importSince, lpStart: s.lpStart });
  const sw =
    (key: keyof Settings) =>
    ({ id, off, hintId }: { id: string; off: boolean; hintId: string }) => <input id={id} type="checkbox" role="switch" className="switch" checked={!!s[key]} disabled={off} aria-describedby={hintId} onChange={(e) => setSettings({ [key]: e.target.checked })} />;

  const ROWS: Row[] = [
    { id: "key", sec: "acc", label: "Clé API Riot", hint: "Sert à importer tes parties classées dans Grind. Une clé de développement expire toutes les 24 h. Elle reste sur ce PC.", words: "riot api rgapi tester", control: ({ hintId }) => <RiotKey hintId={hintId} /> },
    {
      id: "region",
      sec: "acc",
      label: "Région de ton compte",
      hint: "Où l'API Riot cherche tes parties.",
      control: ({ id, hintId }) => (
        <select id={id} className="input" value={s.riotRegion} aria-describedby={hintId} onChange={(e) => setSettings({ riotRegion: e.target.value })}>
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
      control: ({ id, hintId }) => <input id={id} className="input" type="date" value={s.importSince} aria-describedby={hintId} onChange={(e) => setSettings({ importSince: e.target.value || DEFAULTS.importSince })} />,
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
        <div className="set-btns">
          <button className="btn btn-quiet btn-s" onClick={() => showLolWindow()}>
            Afficher
          </button>
          <button className="btn btn-quiet btn-s" onClick={() => lcu("POST", "/riotclient/ux-minimize").catch(() => {})}>
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
        <div className="set-btns">
          <input id={id} type="range" min={0} max={1} step={0.05} value={s.volume} disabled={off} onChange={(e) => setSettings({ volume: Number(e.target.value) })} />
          <span className="set-val mono">{Math.round(s.volume * 100)} %</span>
          <button className="btn btn-quiet btn-s" disabled={off} onClick={() => playChime(s.volume)}>
            Tester
          </button>
        </div>
      ),
    },
    { id: "focus", sec: "not", label: "Ramener NIXUS devant", hint: "La fenêtre revient au premier plan et clignote dans la barre des tâches.", control: sw("readyFocus") },
    { id: "notif", sec: "not", label: "Notification Windows", hint: "Une notification s'affiche, même quand NIXUS est réduit. Accepter reste un clic de ta part.", control: sw("readyNotify") },

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
        <div className="set-btns">
          <input id={id} type="range" min={10} max={100} step={5} value={s.breathAmt} disabled={off} aria-describedby={hintId} onChange={(e) => setSettings({ breathAmt: Number(e.target.value) })} />
          <span className="set-val mono">{s.breathAmt} %</span>
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
        <button className="btn btn-quiet btn-s" onClick={reset}>
          Remettre par défaut
        </button>
      ),
    },
  ];

  const needle = q.trim().toLowerCase();
  const matches = (r: Row) => !needle || `${r.label} ${r.hint ?? ""} ${r.words ?? ""}`.toLowerCase().includes(needle);
  const shown = needle ? SECTIONS.filter((x) => ROWS.some((r) => r.sec === x.id && matches(r))) : SECTIONS.filter((x) => x.id === cur);

  // Flèches haut / bas dans le menu, comme une liste d'onglets.
  const onNavKey = (e: KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const i = SECTIONS.findIndex((x) => x.id === cur);
    const j = e.key === "Home" ? 0 : e.key === "End" ? SECTIONS.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + SECTIONS.length) % SECTIONS.length;
    setCur(SECTIONS[j].id);
    setQ("");
    navRef.current?.querySelectorAll<HTMLButtonElement>("button")[j]?.focus();
  };

  return (
    <Modal label="Paramètres" onClose={close} size="l" className="settings">
      <header className="modal-head">
        <div className="grow">
          <h2>Paramètres</h2>
          <small>Enregistrés sur ce PC, appliqués tout de suite.</small>
        </div>
        <label className="search-box">
          <Icon name="search" size={15} />
          <input className="input" type="search" placeholder="Rechercher un réglage" aria-label="Rechercher un réglage" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <CloseButton onClose={close} label="Fermer les paramètres" />
      </header>
      <div className="set-main">
        <div className="set-nav" role="tablist" aria-orientation="vertical" aria-label="Sections" ref={navRef} onKeyDown={onNavKey}>
          {SECTIONS.map((x) => {
            const on = !needle && x.id === cur;
            return (
              <button key={x.id} role="tab" id={`set-tab-${x.id}`} aria-selected={on} aria-controls="set-panel" tabIndex={x.id === cur ? 0 : -1} onClick={() => (setCur(x.id), setQ(""))}>
                <Icon name={x.icon} size={17} />
                <span>{x.name}</span>
              </button>
            );
          })}
        </div>
        <div className="set-body" id="set-panel" role={needle ? "region" : "tabpanel"} aria-labelledby={needle ? undefined : `set-tab-${cur}`} aria-label={needle ? "Résultats de la recherche" : undefined}>
          {shown.length === 0 && <p className="wait">Aucun réglage ne correspond à « {q} ».</p>}
          {shown.map((x) => (
            <section key={x.id} className="set-sec">
              <h3 className="h2">{x.name}</h3>
              <p className="note">{x.desc}</p>
              {ROWS.filter((r) => r.sec === x.id && matches(r)).map((r) => (
                <RowView key={r.id} row={r} off={!!r.dep && !s[r.dep]} q={needle} />
              ))}
            </section>
          ))}
        </div>
      </div>
      <footer className="modal-foot">
        <span className="note grow">NIXUS ne fait que ce que le client officiel permet, rien pendant la partie.</span>
        <button className="btn btn-quiet btn-s" onClick={reset}>
          Remettre par défaut
        </button>
      </footer>
    </Modal>
  );
}

function RowView({ row, off, q }: { row: Row; off: boolean; q: string }) {
  const base = useId();
  const id = `${base}c`;
  const hintId = `${base}h`;
  if (row.wide) return <div className="set-row wide">{row.control({ id, off, hintId })}</div>;
  return (
    <div className={cx("set-row", row.dep && "sub", off && "off")}>
      <div className="set-t">
        <label htmlFor={id}>{mark(row.label, q)}</label>
        {row.hint && <small id={hintId}>{mark(row.hint, q)}</small>}
        {off && row.dep && <small className="gold">Active « {DEP_LABEL[row.dep] ?? row.dep} » pour régler ceci.</small>}
      </div>
      <div className="set-c">{row.control({ id, off, hintId })}</div>
    </div>
  );
}

/** Surligne les mots recherchés. */
function mark(text: string, q: string): ReactNode {
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

/** Clé de l'API Riot, avec le test et l'état valide / invalide. */
function RiotKey({ hintId }: { hintId: string }) {
  const s = useSettings();
  const [show, setShow] = useState(false);
  const [state, setState] = useState<{ ok: boolean | null; msg: string } | null>(null);
  const check = async () => {
    setState({ ok: null, msg: "Vérification…" });
    try {
      const me = await lcu<Summoner>("GET", "/lol-summoner/v1/current-summoner").catch(() => null);
      if (!me) throw new Error("Connecte-toi au client LoL pour tester la clé.");
      if (!me.gameName || !me.tagLine) throw new Error("Le client n'a pas encore donné ton Riot ID. Réessaie dans un instant.");
      await riotAccount(me.gameName, me.tagLine, s.riotKey, s.riotRegion);
      setState({ ok: true, msg: `Clé valide pour ${me.gameName}#${me.tagLine}.` });
    } catch (e) {
      setState({ ok: false, msg: `${riotError(e)} (${s.riotKey.length} caractères, 42 attendus).` });
    }
  };
  return (
    <div className="set-key">
      <div className="set-btns">
        <input
          className="input mono"
          type={show ? "text" : "password"}
          placeholder="RGAPI-…"
          aria-label="Clé API Riot"
          aria-describedby={hintId}
          value={s.riotKey}
          onChange={(e) => (setSettings({ riotKey: e.target.value.trim() }), setState(null))}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn btn-quiet btn-s" onClick={() => setShow((v) => !v)}>
          {show ? "Masquer" : "Afficher"}
        </button>
        <button className="btn btn-red btn-s" onClick={check} disabled={!s.riotKey}>
          Tester la clé
        </button>
      </div>
      {state && (
        <small className="set-msg" role="status">
          {state.ok === true && <span className="tag green">valide</span>}
          {state.ok === false && <span className="tag red">invalide</span>}
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
    <div className="set-line">
      <div className="set-t">
        <b>Archive locale</b>
        <small>{info === null ? "Lecture…" : `${plural(info.games, "partie classée", "parties classées")} · ${size(info.bytes)}${info.last ? ` · dernière synchro ${timeAgo(info.last)}` : ""}`}</small>
        {msg && (
          <small className="set-msg" role="status">
            {msg}
          </small>
        )}
      </div>
      <button className="btn btn-quiet btn-s" onClick={backup} title="Crée un fichier dans tes Documents">
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
      setMsg(`${plural(n, "entrée restaurée", "entrées restaurées")}. Rouvre Grind pour les voir.`);
    } catch (e) {
      setMsg(String(e));
    }
  };
  return (
    <div className="set-btns">
      {msg && (
        <small className="set-msg" role="status">
          {msg}
        </small>
      )}
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button className="btn btn-quiet btn-s" onClick={() => input.current?.click()}>
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

/** RAM des processus Riot / LoL et de NIXUS lui-même (plus le processeur), mesurée toutes les 5 s. */
function MemoryRow() {
  const [list, setList] = useState<[string, number][] | null>(null);
  const [own, setOwn] = useState<{ mb: number; cpu: number; anim: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => {
    if (!isDesktop) {
      setList([
        ["LeagueClientUxRender.exe", 612],
        ["LeagueClient.exe", 248],
        ["RiotClientServices.exe", 180],
        ["LeagueClientUx.exe", 96],
      ]);
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      setOwn({ mb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : 0, cpu: 0, anim: runningCount() });
      return;
    }
    invoke<[string, number][]>("client_memory").then(
      (l) => setList(l.sort((a, b) => b[1] - a[1])),
      () => setList([]),
    );
    invoke<[number, number]>("nixus_usage").then(
      ([mb, cpu]) => setOwn({ mb, cpu, anim: runningCount() }),
      () => {},
    );
  };
  useEffect(() => {
    load();
    snapshot("client-settings", MEM_PATHS);
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  const total = (list ?? []).reduce((n, [, mb]) => n + mb, 0);
  // La fenêtre du client ne se ferme qu'au repos : jamais en file, en sélection ou en partie.
  const closeNow = async () => {
    setBusy(true);
    setMsg("");
    const phase = await lcu<string>("GET", "/lol-gameflow/v1/gameflow-phase").catch(() => "None");
    if (!["None", "Lobby", "EndOfGame"].includes(phase)) {
      setMsg("Pas pendant une file, une sélection ou une partie.");
    } else {
      await lcu("POST", "/riotclient/kill-ux").catch(() => {});
      setMsg("Fenêtre fermée. NIXUS la rouvrira avant ta prochaine file.");
      setTimeout(load, 3000);
    }
    setBusy(false);
  };
  return (
    <div className="set-mem">
      <div className="set-line">
        <div className="set-t">
          <b>Mémoire et processeur</b>
          <small>Mesurés toutes les 5 s.{msg && ` ${msg}`}</small>
        </div>
        <div className="set-btns">
          <button className="btn btn-quiet btn-s" onClick={load}>
            Mesurer
          </button>
          <button className="btn btn-quiet btn-s" onClick={closeNow} disabled={busy} title="Ferme la fenêtre du client officiel (hors file seulement)">
            Fermer la fenêtre
          </button>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <span className="label">Client LoL</span>
          <b>{list === null ? "…" : list.length ? `${int(total)} Mo` : "Fermé"}</b>
        </div>
        <div className="kpi">
          <span className="label">NIXUS</span>
          <b>{own ? `${int(own.mb)} Mo` : "…"}</b>
        </div>
        <div className="kpi">
          <span className="label">Processeur NIXUS</span>
          <b>{own && isDesktop ? `${own.cpu.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "…"}</b>
        </div>
        <div className="kpi">
          <span className="label">Images animées</span>
          <b>{own ? own.anim : "…"}</b>
        </div>
      </div>
      {list && list.length > 0 && (
        <ul className="set-procs">
          {list.map(([n, mb]) => (
            <li key={n}>
              <span>{PROC_LABEL[n.toLowerCase()] ?? n}</span>
              <span className="bar">
                <i style={{ width: `${(mb / Math.max(1, list[0][1])) * 100}%` }} />
              </span>
              <b className="mono">{mb} Mo</b>
            </li>
          ))}
        </ul>
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

  const busy = u.phase === "checking" || u.phase === "downloading" || u.phase === "installing";
  const hint =
    u.phase === "checking"
      ? "Recherche en cours…"
      : u.phase === "uptodate"
        ? "Tu es à jour."
        : u.phase === "available"
          ? `La version ${u.version} est disponible.${u.notes ? " " + u.notes : ""}`
          : u.phase === "downloading"
            ? u.total
              ? `Téléchargement… ${Math.round((u.done / u.total) * 100)} %`
              : "Téléchargement…"
            : u.phase === "installing"
              ? "Installation, NIXUS va se relancer."
              : u.phase === "error"
                ? u.message
                : "Cherche une nouvelle version sur GitHub et l'installe sans repasser par l'installeur.";

  return (
    <div className={cx("set-line", u.phase === "available" && "has-update")}>
      <div className="set-t">
        <b>NIXUS {version ? (/^\d/.test(version) ? "v" + version : version) : ""}</b>
        <small role="status">{hint}</small>
        {u.phase === "downloading" && u.total ? (
          <span className="bar">
            <i style={{ width: `${(u.done / u.total) * 100}%` }} />
          </span>
        ) : null}
      </div>
      {u.phase === "available" ? (
        <button className="btn btn-red btn-s" onClick={() => installUpdate()}>
          Installer et relancer
        </button>
      ) : (
        <button className="btn btn-quiet btn-s" disabled={busy} onClick={() => checkUpdate()}>
          {u.phase === "downloading" || u.phase === "installing" ? "Patiente" : "Chercher une mise à jour"}
        </button>
      )}
    </div>
  );
}
