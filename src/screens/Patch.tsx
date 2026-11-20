import { useEffect, useMemo, useState } from "react";
import { useClient } from "../lib/client";
import { loadPatch, loadPatchList, myEntries, usePatches, type Block, type Entry, type PatchDoc, type PatchRef } from "../lib/patches";
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

/** Lecture complète des notes de patch, avec un filtre sur tes champions. */
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
      <div className="patch-head">
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
                ["all", "Tout"],
                ["mine", `Tes champions · ${touched.size}`],
              ]}
            />
          )}
          {doc && only === "all" && (
            <span className="patch-jump">
              {doc.sections.map((s, i) => (
                <button key={i} className="chip" onClick={() => document.getElementById(`ps-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  {s.title || "Divers"}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>

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

function PatchBody({ doc, touched }: { doc: PatchDoc; touched: Set<string> }) {
  return (
    <>
      {doc.intro.length > 0 && (
        <div className="patch-intro">
          <Blocks blocks={doc.intro} />
        </div>
      )}
      {doc.sections.map((s, i) => (
        <section key={i} id={`ps-${i}`} className="patch-sec">
          {s.title && <h2 className="sec-head">{s.title}</h2>}
          {s.blocks.length > 0 && (
            <div className="patch-intro">
              <Blocks blocks={s.blocks} />
            </div>
          )}
          {s.entries.length > 0 && (
            <div className="patch-grid">
              {s.entries.map((e, j) => (
                <EntryCard key={j} entry={e} mine={touched.has(e.name)} />
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
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

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        b.k === "sub" ? (
          <h4 key={i} className="patch-sub">
            {b.text}
          </h4>
        ) : b.k === "quote" ? (
          <p key={i} className="patch-quote">
            {b.text}
          </p>
        ) : b.k === "p" ? (
          <p key={i} className="patch-p">
            {b.text}
          </p>
        ) : b.k === "img" ? (
          <Art key={i} src={b.src} className="patch-img" />
        ) : (
          <ul key={i} className="patch-list">
            {b.items.map((c, j) => (
              <li key={j} className={cx(c.depth > 0 && "deep")}>
                {c.after !== undefined ? (
                  <>
                    {c.label && <span className="patch-label">{c.label}</span>}
                    <span className="patch-change">
                      <s>{c.before}</s>
                      <Icon name="back" size={12} className="patch-arrow" />
                      <b>{c.after}</b>
                    </span>
                  </>
                ) : (
                  <span>{c.text}</span>
                )}
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}
