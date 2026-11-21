import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useClient } from "../lib/client";
import { championSquare } from "../lib/lcu";
import { loadPatch, loadPatchList, myEntries, usePatches, type Block, type Change, type Entry, type PatchDoc, type PatchRef, type Section } from "../lib/patches";
import { nav } from "../lib/view";
import { Art, Empty, Icon, RefreshButton, Seg, Skeleton, cx, plural } from "../ui";

const dateFr = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

/** Noms des champions qui te concernent : joués récemment ou parmi tes meilleures maîtrises. */
export function useMyChampionNames() {
  const history = useClient((s) => s.history);
  const champions = useClient((s) => s.champions);
  const mastery = useClient((s) => s.mastery);
  return useMemo(() => {
    const ids = new Set<number>();
    for (const m of history) if (m.participants[0]) ids.add(m.participants[0].championId);
    [...mastery.values()]
      .sort((a, b) => b.championPoints - a.championPoints)
      .slice(0, 8)
      .forEach((m) => ids.add(m.championId));
    return new Set([...ids].map((id) => champions.get(id)?.name).filter(Boolean) as string[]);
  }, [history, champions, mastery]);
}

/** Carte de l'accueil : le dernier patch et ce qu'il change sur tes champions. */
export function PatchCard() {
  const list = usePatches((s) => s.list);
  const docs = usePatches((s) => s.docs);
  const error = usePatches((s) => s.error);
  const mine = useMyChampionNames();
  useEffect(() => void loadPatchList(), []);

  const latest = list?.[0];
  const doc = latest ? docs[latest.path] : undefined;
  if (error && !latest) return null;
  if (!doc) return <Skeleton className="patch-card" />;
  const touched = myEntries(doc, mine);
  return (
    <button className="patch-card" onClick={() => nav.page("patch")} title="Lire les notes de patch">
      {doc.image && <Art src={doc.image} className="patch-card-bg" />}
      <span className="patch-card-txt">
        <small>Notes de patch</small>
        <b>Patch {doc.version}</b>
        <span>{touched.length ? `${plural(touched.length, "changement")} sur tes champions` : `${plural(doc.sections.reduce((n, s) => n + s.entries.length, 0), "changement")} · ${dateFr(doc.date)}`}</span>
      </span>
      {touched.length > 0 && (
        <span className="patch-card-faces" aria-hidden="true">
          {touched.slice(0, 3).map((e) => (e.image ? <Art key={e.name} src={e.image} /> : null))}
        </span>
      )}
      <Icon name="chevron" size={16} className="patch-card-go" />
    </button>
  );
}

/** Lecture complète des notes de patch, avec un sommaire et un filtre sur tes champions. */
export function Patch() {
  const list = usePatches((s) => s.list);
  const docs = usePatches((s) => s.docs);
  const error = usePatches((s) => s.error);
  const mine = useMyChampionNames();
  const [path, setPath] = useState<string | null>(null);
  const [only, setOnly] = useState<"all" | "mine">("all");
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => void loadPatchList(), []);

  const ref: PatchRef | undefined = list?.find((p) => p.path === path) ?? list?.[0];
  const doc = ref ? docs[ref.path] : undefined;
  useEffect(() => {
    if (!ref || docs[ref.path]) return;
    setFailed(null);
    loadPatch(ref).catch((e) => setFailed(String(e?.message ?? e)));
  }, [ref, docs]);

  const touched = useMemo(() => (doc ? new Set(myEntries(doc, mine).map((e) => e.name)) : new Set<string>()), [doc, mine]);

  if ((error && !list) || failed) {
    return (
      <div className="page">
        <Empty title="Notes de patch indisponibles">
          {failed ?? error} NIXUS lit les notes sur le site officiel de League of Legends : vérifie ta connexion.
          <br />
          <RefreshButton label="Réessayer" onRefresh={() => (failed && ref ? loadPatch(ref).then(() => setFailed(null)).catch((e) => setFailed(String(e?.message ?? e))) : loadPatchList(true))} />
        </Empty>
      </div>
    );
  }

  return (
    <div className="page patch-page">
      <header className="patch-head">
        {doc?.image && <Art src={doc.image} className="patch-head-bg" />}
        <button className="chip patch-back" onClick={() => nav.page("home")}>
          <Icon name="back" size={14} /> Accueil
        </button>
        <span className="eyebrow">Notes de patch{doc?.date ? ` · ${dateFr(doc.date)}` : ""}</span>
        <h1 className="display">{ref ? `Patch ${ref.version}` : <Skeleton style={{ width: 380, height: 80 }} />}</h1>
        <div className="patch-tools">
          {list && list.length > 1 && <Seg label="Version" value={ref?.path ?? ""} options={list.slice(0, 5).map((p) => [p.path, p.version] as const)} onChange={setPath} />}
          {doc && (
            <Seg
              label="Filtre"
              value={only}
              onChange={setOnly}
              options={[
                ["all", "Tout le patch"],
                ["mine", `Tes champions · ${touched.size}`],
              ]}
            />
          )}
        </div>
      </header>

      {!doc ? (
        <div className="patch-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="patch-entry" style={{ height: 180 }} />
          ))}
        </div>
      ) : only === "mine" ? (
        touched.size ? (
          <div className="patch-grid">{doc.sections.flatMap((s) => s.entries.filter((e) => touched.has(e.name)).map((e) => <EntryCard key={s.title + e.name} entry={e} mine />))}</div>
        ) : (
          <Empty title="Rien sur tes champions">Ce patch ne touche aucun des champions que tu as joués récemment.</Empty>
        )
      ) : (
        <PatchBody doc={doc} touched={touched} />
      )}
    </div>
  );
}

/** Nombre d'éléments d'une section, pour le sommaire : entrées (h3) ou noms en gras. */
const sectionCount = (s: Section) => s.entries.length || s.blocks.filter((b) => b.k === "head").length;

function PatchBody({ doc, touched }: { doc: PatchDoc; touched: Set<string> }) {
  const [active, setActive] = useState(0);
  const main = useRef<HTMLDivElement>(null);

  // Sommaire : la section dont le titre a passé le haut de l'écran est mise en avant.
  useEffect(() => {
    const scroller = main.current?.closest(".view");
    if (!scroller) return;
    const onScroll = () => {
      const top = scroller.getBoundingClientRect().top + 120;
      let cur = 0;
      doc.sections.forEach((_, i) => {
        const el = document.getElementById(`ps-${i}`);
        if (el && el.getBoundingClientRect().top <= top) cur = i;
      });
      setActive(cur);
    };
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [doc]);

  const go = (i: number) => document.getElementById(`ps-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="patch-layout">
      <nav className="patch-toc" aria-label="Sommaire">
        <small>Sommaire</small>
        {doc.sections.map((s, i) => {
          const n = sectionCount(s);
          return (
            <button key={i} className={cx(i === active && "on")} onClick={() => go(i)}>
              <span>{s.title || "Divers"}</span>
              {n > 0 && <em>{n}</em>}
            </button>
          );
        })}
      </nav>

      <div className="patch-main" ref={main}>
        {doc.intro.length > 0 && (
          <div className="patch-intro">
            <Blocks blocks={doc.intro} />
          </div>
        )}
        {doc.sections.map((s, i) => (
          <section key={i} id={`ps-${i}`} className="patch-sec">
            {s.title && (
              <h2 className="patch-sec-title">
                {s.title}
                {sectionCount(s) > 0 && <span>{plural(sectionCount(s), s.entries.length ? "changement" : "élément")}</span>}
              </h2>
            )}
            {s.blocks.length > 0 && <Flow blocks={s.blocks} touched={touched} />}
            {s.entries.length > 0 && (
              <div className="patch-grid">
                {s.entries.map((e, j) => (
                  <EntryCard key={j} entry={e} mine={touched.has(e.name)} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

/** Portrait d'un champion d'après son nom (champions ARAM / Arena écrits en gras, sans image sur la page). */
function useChampionByName() {
  const champions = useClient((s) => s.champions);
  return useMemo(() => {
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
    const map = new Map<string, number>();
    for (const c of champions.values()) map.set(norm(c.name), c.id);
    return (name: string) => map.get(norm(name.replace(/\s*\(.*\)$/, "")));
  }, [champions]);
}

type FlowItem = { k: "group"; text: string } | { k: "card"; head: Extract<Block, { k: "head" }>; blocks: Block[] } | { k: "loose"; block: Block };

/**
 * Contenu d'une section sans fiches (ARAM, Arena, Classic…) : les h4 deviennent des groupes, chaque nom en gras
 * ouvre une petite fiche qui reçoit ce qui suit, le reste s'affiche en pleine largeur.
 */
function Flow({ blocks, touched }: { blocks: Block[]; touched: Set<string> }) {
  const champId = useChampionByName();
  const items: FlowItem[] = [];
  let card: Extract<FlowItem, { k: "card" }> | null = null;
  for (const b of blocks) {
    if (b.k === "sub" && !b.icon && !(card && card.blocks.length === 0)) {
      card = null;
      items.push({ k: "group", text: b.text });
    } else if (b.k === "head") {
      card = { k: "card", head: b, blocks: [] };
      items.push(card);
    } else if (card && b.k !== "gallery" && b.k !== "img") card.blocks.push(b);
    else {
      card = null;
      items.push({ k: "loose", block: b });
    }
  }

  // Les fiches consécutives forment une grille ; le reste suit dans l'ordre de la page.
  const out: ReactNode[] = [];
  let run: Extract<FlowItem, { k: "card" }>[] = [];
  const flush = () => {
    if (!run.length) return;
    out.push(
      <div key={`g${out.length}`} className="patch-grid">
        {run.map((c, i) => {
          const id = champId(c.head.text);
          return (
            <article key={i} className={cx("patch-entry compact", touched.has(c.head.text) && "mine")}>
              <header>
                {id !== undefined && <Art src={championSquare(id)} />}
                <h3>{c.head.text}</h3>
                {c.head.isNew && <span className="tag accent">Nouveau</span>}
                {touched.has(c.head.text) && <span className="tag accent">Tu le joues</span>}
              </header>
              <Blocks blocks={c.blocks} />
            </article>
          );
        })}
      </div>,
    );
    run = [];
  };
  for (const it of items) {
    if (it.k === "card") {
      run.push(it);
      continue;
    }
    flush();
    out.push(it.k === "group" ? <h3 key={`h${out.length}`} className="patch-group">{it.text}</h3> : <Blocks key={`b${out.length}`} blocks={[it.block]} />);
  }
  flush();
  return <>{out}</>;
}

function EntryCard({ entry, mine }: { entry: Entry; mine: boolean }) {
  return (
    <article className={cx("patch-entry", mine && "mine")}>
      <header>
        {entry.image && <Art src={entry.image} />}
        <h3>{entry.name}</h3>
        {mine && <span className="tag accent">Tu le joues</span>}
      </header>
      <Blocks blocks={entry.blocks} />
    </article>
  );
}

function ChangeRow({ c }: { c: Change }) {
  return (
    <li className={cx(c.depth > 0 && "deep")}>
      {c.label && <span className="patch-label">{c.label}</span>}
      {c.after !== undefined ? (
        <span className="patch-change">
          <s>{c.before}</s>
          <Icon name="back" size={11} className="patch-arrow" />
          <b>{c.after}</b>
        </span>
      ) : (
        <span className="patch-text">{c.text}</span>
      )}
    </li>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.k) {
          case "sub":
            return (
              <h4 key={i} className="patch-sub">
                {b.icon && <Art src={b.icon} className="patch-sub-icon" />}
                <span>{b.text}</span>
              </h4>
            );
          case "head":
            return (
              <h4 key={i} className="patch-sub">
                <span>{b.text}</span>
                {b.isNew && <span className="tag accent">Nouveau</span>}
              </h4>
            );
          case "quote":
            return (
              <p key={i} className="patch-quote">
                {b.text}
              </p>
            );
          case "p":
            return (
              <p key={i} className="patch-p">
                {b.text}
              </p>
            );
          case "img":
            return <Art key={i} src={b.src} className="patch-img" />;
          case "gallery":
            return (
              <div key={i} className="patch-gallery">
                {b.items.map((g, j) => (
                  <figure key={j}>
                    <Art src={g.src} />
                    {g.caption && <figcaption>{g.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            );
          case "authors":
            return (
              <div key={i} className="patch-authors">
                {b.items.map((a, j) => (
                  <span key={j}>
                    {a.image && <Art src={a.image} />}
                    {a.name}
                  </span>
                ))}
              </div>
            );
          case "list":
            return (
              <ul key={i} className="patch-list">
                {b.items.map((c, j) => (
                  <ChangeRow key={j} c={c} />
                ))}
              </ul>
            );
        }
      })}
    </>
  );
}
