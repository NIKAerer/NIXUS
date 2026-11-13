import { useState } from "react";
import { RoomChat } from "../features/RoomChat";
import { RuneEditor } from "../features/RuneEditor";
import { HIDDEN_SPELLS, ROLES, SPELLS, STEPS, SWAPS, SWAP_KINDS, useDraft, type DraftState } from "../features/useDraft";
import { championSplash, championSquare, gameAsset, skinSplash, timeAgo } from "../lib/lcu";
import { versus, withChamp, type Tally } from "../lib/matchups";
import type { ChampSelectAction } from "../lib/types";
import { Art, Breathing, Icon, cx, int, plural } from "../ui";

const CLASSES: [string, string][] = [
  ["all", "Tous"],
  ["fav", "Favoris"],
  ["assassin", "Assassins"],
  ["fighter", "Combattants"],
  ["mage", "Mages"],
  ["marksman", "Tireurs"],
  ["support", "Supports"],
  ["tank", "Tanks"],
];

/** Sélection des champions : ton équipe à gauche, les adversaires à droite, et au centre ce que tu dois faire maintenant. */
export function Draft() {
  const d = useDraft();
  const [editRunes, setEditRunes] = useState(false);
  if (!d) return <div className="wait draft-wait">Chargement de la sélection…</div>;

  const { session, me, isBan, locked, aram, shownId, name, myAction, stage, seconds } = d;
  const background = locked && me && d.skinId ? skinSplash(me.championId, d.skinId) : shownId ? championSplash(shownId) : "";
  const eyebrow = aram
    ? "ARAM · ton champion est tiré au sort"
    : stage === "planning"
      ? "Déclare le champion que tu veux jouer"
      : isBan
        ? "À toi de bannir"
        : myAction
          ? "À toi de choisir"
          : stage === "final" || locked
            ? "Finalisation : skin, runes, sorts"
            : "En attente des autres joueurs";
  const m = d.mastery.get(shownId);

  return (
    <div className={cx("draft", isBan && "banning", aram && "aram", d.urgent && "urgent")}>
      <div className="draft-bg">{background && <Breathing full key={background} src={background} champ={(locked && me?.championId) || shownId} />}</div>

      {/* Bandeau : bans des deux équipes autour du chrono. */}
      <header className="draft-bar">
        <div className="draft-side">
          <span className={cx("label", d.blueSide ? "blue" : "red")}>Ton équipe · côté {d.blueSide ? "bleu" : "rouge"}</span>
          {aram ? <b className="h2">ARAM</b> : <BanRow slots={d.ourBanSlots} local={d.local} reveal={(a) => a.completed || a.actorCellId === d.local} />}
        </div>
        <div className="draft-clock">
          {!aram && (
            <ol aria-label="Étapes de la sélection">
              {STEPS.map((s, i) => (
                <li key={s.id} className={cx(i === d.stepIndex && "on", i < d.stepIndex && "done")}>
                  {s.label}
                </li>
              ))}
            </ol>
          )}
          <b className="mono">{seconds}</b>
          <i aria-hidden="true">
            <i style={{ width: `${Math.min(100, (d.left / d.total) * 100)}%` }} />
          </i>
        </div>
        <div className="draft-side right">
          {!aram && <span className={cx("label", d.blueSide ? "red" : "blue")}>Adversaires · côté {d.blueSide ? "rouge" : "bleu"}</span>}
          {aram ? <b className="h2">Abîme hurlant</b> : <BanRow slots={d.theirBanSlots} local={d.local} reveal={(a) => a.completed} />}
        </div>
      </header>

      <div className="draft-main">
        <aside className="draft-team" aria-label="Ton équipe">
          {session.myTeam.map((p) => {
            const isMe = p.cellId === d.local;
            // Ta carte montre aussi le champion que tu regardes, pour ne jamais rester vide.
            const id = p.championId || p.championPickIntent || (isMe && !isBan ? shownId : 0);
            const banHover = d.actions.find((a) => a.type === "ban" && a.actorCellId === p.cellId && a.isInProgress && a.championId);
            const offers = SWAP_KINDS.map((kind) => ({ kind, t: d.swapsOf(kind).find((t) => t.cellId === p.cellId && (t.state === "AVAILABLE" || t.state === "SENT")) })).filter((o) => o.t);
            const art = isMe && locked && d.skinId ? skinSplash(p.championId, d.skinId) : id ? championSplash(id) : "";
            const tier = p.puuid ? d.assignTier.get(p.puuid) : undefined;
            return (
              <div key={p.cellId} className={cx("pcard ally", isMe && "self", d.pickingCell(p.cellId) && "picking", p.championId ? "locked" : id ? "intent" : "vacant")}>
                <span className="cover">{art && <Breathing full key={art} src={art} champ={p.championId || id} />}</span>
                <span className="pcard-role">
                  {ROLES[p.assignedPosition] ?? ""}
                  {tier !== undefined && <TierTag tier={tier} />}
                </span>
                <div className="pcard-txt">
                  <b>{id ? name(id) : isMe ? "À toi de choisir" : d.pickingCell(p.cellId) ? "Choisit…" : "—"}</b>
                  <span>{p.gameName || (isMe ? "Toi" : `Joueur ${d.allyNum.get(p.cellId)}`)}</span>
                  {banHover && !isMe && <em>Veut bannir {name(banHover.championId)}</em>}
                </div>
                {(p.championId > 0 || isMe) && p.spell1Id && !HIDDEN_SPELLS.has(p.spell1Id) ? (
                  <span className="pcard-spells">
                    {[p.spell1Id, p.spell2Id ?? 0].map((s, j) => (
                      <SpellIcon key={j} id={s} icon={d.assets?.spells.get(s)?.icon} name={d.spellName(s)} />
                    ))}
                  </span>
                ) : null}
                {!isMe && offers.length > 0 && (
                  <div className="pcard-swaps">
                    {offers.map(({ kind, t }) =>
                      t!.state === "SENT" ? (
                        <button key={kind} className="mini" onClick={() => d.swapCall(kind, t!.id, "cancel")} title="Annuler ta proposition">
                          {SWAPS[kind].short} proposé · Annuler
                        </button>
                      ) : (
                        <button key={kind} className="mini ghost" onClick={() => d.swapCall(kind, t!.id, "request")} title={SWAPS[kind].title}>
                          <Icon name="swap" size={11} /> {SWAPS[kind].short}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        <section className="draft-center">
          <div className="draft-hero">
            <span className="eyebrow">{eyebrow}</span>
            <h1 className="display">
              {shownId ? (
                <>
                  {isBan && <span className="draft-banword">Bannir </span>}
                  {name(shownId)}
                </>
              ) : isBan ? (
                "Qui bannir ?"
              ) : (
                "Choisis"
              )}
            </h1>
            {locked && d.currentSkin && !d.currentSkin.isBase && <span className="draft-skinname">{d.currentSkin.name}</span>}

            {shownId > 0 && !isBan && (
              <div className="draft-facts">
                {m && (
                  <span className="stat">
                    <span className="label">Maîtrise {m.championLevel}</span>
                    <b>{int(m.championPoints)}</b>
                    <small>points</small>
                  </span>
                )}
                <span className="stat">
                  <span className="label">Parties récentes</span>
                  {d.stats.games > 0 ? (
                    <>
                      <b className={d.stats.wins * 2 >= d.stats.games ? "up" : "down"}>{Math.round((d.stats.wins / d.stats.games) * 100)} %</b>
                      <small>
                        sur {plural(d.stats.games, "partie")} · KDA {d.stats.kda}
                      </small>
                    </>
                  ) : (
                    <>
                      <b>—</b>
                      <small>Pas joué récemment</small>
                    </>
                  )}
                </span>
                {d.matchups && (
                  <span className="stat">
                    <span className="label">En classé</span>
                    <MatchupBadge t={withChamp(d.matchups, shownId)} title={`Ton bilan avec ${name(shownId)} dans tes parties classées archivées`} big />
                  </span>
                )}
                {d.stats.last && (
                  <span className="stat">
                    <span className="label">Forme · {d.stats.avg}</span>
                    <span className="form">
                      {d.stats.form.map((w, i) => (
                        <i key={i} className={w ? "w" : "l"} title={w ? "Victoire" : "Défaite"}>
                          {w ? "V" : "D"}
                        </i>
                      ))}
                    </span>
                    <small>Dernière {timeAgo(d.stats.last.gameCreation)}</small>
                  </span>
                )}
              </div>
            )}

            {(d.warnAlly || d.warnSelf) && (
              <div className="warn" role="alert">
                {d.warnSelf ? "C'est le champion que tu as prévu de jouer." : `${d.warnAlly!.gameName ?? "Un allié"} veut jouer ${name(shownId)}.`}
                {d.confirmBan ? " Reclique sur Bannir pour confirmer." : ""}
              </div>
            )}

            {d.received.map(({ kind, t, from }) => (
              <div key={`${kind}-${t.id}`} className="trade" role="alert">
                {from!.championId ? <Breathing src={championSquare(from!.championId)} champ={from!.championId} /> : <Icon name="swap" />}
                <p>
                  <b>{from!.gameName || "Un allié"}</b> {SWAPS[kind].ask(from!)}
                </p>
                <button className="btn btn-white btn-s" onClick={() => d.swapCall(kind, t.id, "accept")}>
                  Accepter
                </button>
                <button className="btn btn-quiet btn-s" onClick={() => d.swapCall(kind, t.id, "decline")}>
                  Refuser
                </button>
              </div>
            ))}
          </div>

          {d.showPicker && <Picker d={d} />}
          {locked && me && <Loadout d={d} onEditRunes={() => setEditRunes(true)} />}

          <div className="draft-actions">
            <RoomChat kind="draft" hint={session.chatDetails?.multiUserChatId ?? session.chatDetails?.chatRoomName} names={d.chatNames} />
            <span className="grow" />
            {stage === "planning" && <span className="note">Tes alliés voient ton intention. Les bans commencent dans {seconds} s.</span>}
            {isBan && <span className="note">Les bans sont révélés une fois que tout le monde a banni.</span>}
            {aram && <span className="note">Prends un champion du banc à droite, ou échange avec un allié.</span>}
            {shownId > 0 && !locked && !isBan && !aram && (
              <button className="btn btn-quiet" onClick={() => d.toggleFavorite(shownId)} aria-pressed={d.favorites.includes(shownId)}>
                <Icon name="star" size={16} fill={d.favorites.includes(shownId)} className={d.favorites.includes(shownId) ? "gold" : undefined} />
                {d.favorites.includes(shownId) ? "Favori" : "Ajouter aux favoris"}
              </button>
            )}
            {aram && (
              <button className="btn btn-white btn-l" onClick={d.reroll} disabled={d.rerolls <= 0} title="Tirer un autre champion au sort (ton champion actuel part sur le banc)">
                <Icon name="dice" /> Relancer <span className="badge">{d.rerolls}</span>
              </button>
            )}
            {myAction && (
              <button className={cx("btn btn-l draft-lock", isBan ? "btn-red" : "btn-white")} onClick={d.lock} disabled={!shownId}>
                {isBan ? (d.confirmBan ? "Bannir quand même" : "Bannir") : "Verrouiller"}
              </button>
            )}
          </div>
        </section>

        {aram ? (
          <aside className="draft-team bench" aria-label="Banc">
            <h3 className="h2">
              Banc <span className="dim">{d.bench.length}/10</span>
            </h3>
            <div className="bench-grid">
              {d.bench.map((c) => (
                <button key={c.championId} onClick={() => d.swapBench(c.championId)} title={`Prendre ${name(c.championId)}`}>
                  <span className="cover">
                    <Breathing full src={championSplash(c.championId)} champ={c.championId} />
                  </span>
                  <b>{name(c.championId)}</b>
                  <em>Prendre</em>
                </button>
              ))}
            </div>
            {d.bench.length === 0 && <p className="note">Le banc est vide. Les champions relancés par ton équipe arrivent ici.</p>}
            <p className="note">L'équipe adverse est cachée jusqu'à l'écran de chargement.</p>
          </aside>
        ) : (
          <aside className="draft-team" aria-label="Équipe adverse">
            {session.theirTeam.map((p, i) => (
              <div key={p.cellId} className={cx("pcard enemy", d.pickingCell(p.cellId) && "picking", p.championId ? "locked" : "vacant")}>
                <span className="cover">{p.championId > 0 && <Breathing full src={championSplash(p.championId)} champ={p.championId} />}</span>
                <span className="pcard-role">{ROLES[p.assignedPosition] ?? `Adversaire ${i + 1}`}</span>
                <div className="pcard-txt">
                  <b>{p.championId ? name(p.championId) : d.pickingCell(p.cellId) ? "Choisit…" : "—"}</b>
                  {p.championId > 0 && d.matchups && (
                    <MatchupBadge
                      t={versus(d.matchups, p.championId, me?.championId || undefined, me?.assignedPosition || null)}
                      title={`${me?.championId ? `${name(me.championId)} contre ${name(p.championId)}` : `Contre ${name(p.championId)}`}${me?.assignedPosition ? ` en ${ROLES[me.assignedPosition] ?? me.assignedPosition}` : ""}, dans tes parties classées archivées`}
                    />
                  )}
                </div>
              </div>
            ))}
          </aside>
        )}
      </div>

      {editRunes && d.assets && (
        <RuneEditor styles={d.assets.styles} page={d.page} championName={me?.championId ? name(me.championId) : undefined} splash={me?.championId ? championSplash(me.championId) : undefined} onSaved={d.savedPage} onClose={() => setEditRunes(false)} />
      )}
    </div>
  );
}

/** Grille des champions, avec filtres par classe, recherche et bans habituels. */
function Picker({ d }: { d: DraftState }) {
  const { isBan, shownId } = d;
  return (
    <section className="picker glass">
      <div className="picker-head">
        <div className="chips" role="group" aria-label="Filtrer les champions">
          {CLASSES.map(([value, label]) => (
            <button key={value} className="chip" aria-pressed={d.klass === value} onClick={() => d.setKlass(value)}>
              {label}
            </button>
          ))}
        </div>
        <input className="input" placeholder="Rechercher" aria-label="Rechercher un champion" value={d.query} onChange={(e) => d.setQuery(e.target.value)} />
      </div>
      {isBan && d.recentBanChoices.length > 0 && (
        <div className="chips">
          <span className="label">Tes bans habituels</span>
          {d.recentBanChoices.map((id) => (
            <button key={id} className="chip" aria-pressed={shownId === id} onClick={() => d.hover(id)}>
              {d.name(id)}
            </button>
          ))}
        </div>
      )}
      <div className="picker-grid">
        {d.list.map((c) => {
          const isBanned = d.banned.has(c.id);
          const ally = d.allyWants.get(c.id);
          const allyBan = d.allyBanHovers.get(c.id);
          const m = d.mastery.get(c.id);
          return (
            <button key={c.id} className="pick" aria-pressed={shownId === c.id} disabled={!d.canChoose(c.id)} onClick={() => d.hover(c.id)} title={c.name}>
              <span className="pick-img">
                <Breathing src={championSquare(c.id)} champ={c.id} />
                {d.favorites.includes(c.id) && <Icon name="star" size={12} fill className="pick-star" />}
                {!isBan && m && m.championLevel >= 5 && <i className="pick-mastery">{m.championLevel}</i>}
                {isBanned && <em className="tag red">Banni</em>}
                {!isBanned && ally && <em className="tag blue">{isBan ? ally.gameName ?? "Allié" : "Pris"}</em>}
                {!isBanned && isBan && !ally && allyBan && <em className="tag gold">Visé</em>}
              </span>
              <span>{c.name}</span>
            </button>
          );
        })}
        {d.list.length === 0 && <p className="note">{d.klass === "fav" ? "Aucun favori : ajoute-en avec l'étoile, en bas à droite." : "Aucun champion trouvé."}</p>}
      </div>
    </section>
  );
}

/** Une fois verrouillé : sorts, runes, skin et chromas. */
function Loadout({ d, onEditRunes }: { d: DraftState; onEditRunes: () => void }) {
  const me = d.me!;
  const [spellSlot, setSpellSlot] = useState<0 | 1 | null>(null);
  const { skins, skinId, chromas, selectedSkin, page } = d;
  return (
    <section className="loadout glass">
      <div className="loadout-row">
        <div className="loadout-box">
          <span className="label">Sorts</span>
          <div className="spell-pick">
            {([0, 1] as const).map((slot) => {
              const id = (slot === 0 ? me.spell1Id : me.spell2Id) ?? 0;
              return (
                <button key={slot} aria-expanded={spellSlot === slot} onClick={() => setSpellSlot(spellSlot === slot ? null : slot)} title={`${d.spellName(id)} (touche ${slot === 0 ? "D" : "F"})`}>
                  <SpellIcon id={id} icon={d.assets?.spells.get(id)?.icon} name={d.spellName(id)} />
                  <kbd>{slot === 0 ? "D" : "F"}</kbd>
                </button>
              );
            })}
          </div>
          {spellSlot !== null && (
            <div className="spell-menu" role="menu">
              {d.spellChoices.map((s) => {
                const current = (spellSlot === 0 ? me.spell1Id : me.spell2Id) === s;
                const other = (spellSlot === 0 ? me.spell2Id : me.spell1Id) === s;
                return (
                  <button
                    key={s}
                    role="menuitem"
                    aria-current={current}
                    onClick={() => {
                      d.chooseSpell(spellSlot, s);
                      setSpellSlot(null);
                    }}
                    title={other ? `${d.spellName(s)} : échange tes deux sorts` : d.spellName(s)}
                  >
                    <SpellIcon id={s} icon={d.assets?.spells.get(s)?.icon} name={d.spellName(s)} />
                    <span>{d.spellName(s)}</span>
                    {other && <Icon name="swap" size={12} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {d.pages.length > 0 && (
          <div className="loadout-box grow">
            <span className="label">Runes</span>
            <div className="rune-pick">
              {page?.selectedPerkIds?.[0] && d.assets?.runes.get(page.selectedPerkIds[0]) && <Art src={d.assets.runes.get(page.selectedPerkIds[0])!.icon} />}
              <select className="input" value={d.currentPage ?? ""} onChange={(e) => d.choosePage(Number(e.target.value))} aria-label="Page de runes">
                {d.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {d.assets?.styles.length ? (
                <button className="btn btn-quiet btn-s" onClick={onEditRunes} title="Modifier cette page de runes">
                  <Icon name="pen" size={13} /> Modifier
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {skins.length > 0 && (
        <div className="loadout-skins">
          <div className="loadout-skins-head">
            <span className="label">Skins · {skins.filter((s) => s.unlocked).length} possédés</span>
            <button
              className="link"
              onClick={() => {
                const mine = skins.filter((s) => s.unlocked && !s.disabled && s.id !== skinId);
                if (mine.length) d.chooseSkin(mine[Math.floor(Math.random() * mine.length)].id);
              }}
              title="Prendre un de tes skins au hasard"
            >
              Aléatoire
            </button>
          </div>
          <div className="skin-row">
            {[...skins]
              .sort((a, b) => Number(!!b.unlocked) - Number(!!a.unlocked))
              .map((s) => (
                <button key={s.id} className="skin" aria-pressed={skinId === s.id || (!skinId && !!s.isBase)} disabled={!s.unlocked || s.disabled} onClick={() => d.chooseSkin(s.id)} title={s.unlocked ? s.name : `${s.name} (non possédé)`}>
                  <span className="cover">
                    <Breathing full src={skinSplash(me.championId, s.id)} champ={me.championId} />
                  </span>
                  <b>{s.isBase ? "Classique" : s.name}</b>
                  {s.childSkins?.length ? <i className="skin-chromas" title="Ce skin a des chromas" /> : null}
                  {!s.unlocked && <em className="tag">Non possédé</em>}
                </button>
              ))}
          </div>
          {chromas.length > 0 && (
            <div className="chroma-row" role="group" aria-label="Chromas">
              <span className="label">
                Chromas · {chromas.filter((c) => c.unlocked).length} / {chromas.length}
              </span>
              <button className="chroma base" aria-pressed={selectedSkin === skinId} onClick={() => d.chooseSkin(skinId)} title="Sans chroma" aria-label="Sans chroma" />
              {chromas.map((c) => {
                const [a, b] = c.colors?.length ? [c.colors[0], c.colors[1] ?? c.colors[0]] : ["#888", "#444"];
                return (
                  <button key={c.id} className="chroma" style={{ background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)` }} aria-pressed={selectedSkin === c.id} disabled={!c.unlocked || c.disabled} onClick={() => d.chooseSkin(c.id)} title={c.unlocked ? c.name : `${c.name} (non possédé)`} aria-label={c.name}>
                    {c.chromaPreviewPath && (
                      <span className="chroma-preview" aria-hidden="true">
                        <Art src={gameAsset(c.chromaPreviewPath)} />
                        <b>{c.name}</b>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TierTag({ tier }: { tier: string }) {
  if (tier === "PRIMARY") return <em className="tag green" title="Rôle principal">Principal</em>;
  if (tier === "SECONDARY") return <em className="tag blue" title="Rôle secondaire">Secondaire</em>;
  return <em className="tag gold" title="Placé en autofill">Autofill</em>;
}

function BanRow({ slots, local, reveal }: { slots: ChampSelectAction[]; local: number; reveal: (a: ChampSelectAction) => boolean }) {
  return (
    <div className="bans">
      {slots.map((a) => (
        <span key={a.id} className={cx("ban", a.completed ? "done" : a.isInProgress && "live", a.actorCellId === local && "mine")}>
          {a.championId > 0 && reveal(a) && <Breathing src={championSquare(a.championId)} champ={a.championId} />}
        </span>
      ))}
    </div>
  );
}

export function SpellIcon({ id, icon, name }: { id: number; icon?: string; name?: string }) {
  const label = name ?? SPELLS[id] ?? "?";
  return (
    <span className="spell" title={label}>
      {icon ? <Art src={icon} alt={label} /> : <i>{label.slice(0, 2)}</i>}
    </span>
  );
}

/** Bilan « 3V 1D · 75 % · 4 parties », grisé sous 5 parties (trop peu pour conclure). */
function MatchupBadge({ t, title, big }: { t: Tally; title: string; big?: boolean }) {
  if (!t.n)
    return (
      <span className={cx("mu none", big && "big")} title={title}>
        aucune partie
      </span>
    );
  const pct = Math.round((t.w / t.n) * 100);
  const tone = t.n < 5 ? "few" : pct >= 55 ? "good" : pct <= 45 ? "bad" : "even";
  return (
    <span className={cx("mu", tone, big && "big")} title={title}>
      <b>
        {t.w}V {t.l}D
      </b>
      <i>{pct} %</i>
      <small>{plural(t.n, "partie")}</small>
    </span>
  );
}
