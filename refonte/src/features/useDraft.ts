import { useEffect, useMemo, useRef, useState } from "react";
import { snapshot } from "../lib/archive";
import { showError, useClient } from "../lib/client";
import { useStatic } from "../lib/ddragon";
import { lcu } from "../lib/lcu";
import { useMatchups } from "../lib/matchups";
import type { ChampionSummary, ChampSelectAction, ChampSelectPlayer, ChampSelectSession, ChampSelectTrade, RunePage, Skin } from "../lib/types";
import { dec, readJson, writeJson } from "../ui/format";

export const ROLES: Record<string, string> = { top: "Top", jungle: "Jungle", middle: "Mid", bottom: "ADC", utility: "Support" };

export const SPELLS: Record<number, string> = {
  1: "Purge", 3: "Fatigue", 4: "Saut éclair", 6: "Fantôme", 7: "Soins", 11: "Châtiment",
  12: "Téléportation", 13: "Clarté", 14: "Embrasement", 21: "Barrière", 32: "Marque", 2201: "Fuite", 2202: "Saut éclair",
};
// Sorts autorisés par mode si Data Dragon ne répond pas.
const MODE_SPELLS: Record<string, number[]> = {
  CLASSIC: [4, 14, 12, 11, 6, 7, 21, 3, 1],
  ARAM: [4, 32, 14, 6, 7, 21, 3, 1, 13],
  CHERRY: [2202, 2201],
};
export const HIDDEN_SPELLS = new Set([54, 55]); // emplacements vides internes au client

export type Stage = "planning" | "ban" | "pick" | "waiting" | "final";
export const STEPS: { id: Stage; label: string }[] = [
  { id: "planning", label: "Intentions" },
  { id: "ban", label: "Bans" },
  { id: "pick", label: "Choix" },
  { id: "final", label: "Finalisation" },
];

const BAN_KEY = "nexus.recentBans";
const FAV_KEY = "nexus.favorites";

export type SwapKind = "trades" | "pickOrderSwaps" | "positionSwaps";
export const SWAP_KINDS: SwapKind[] = ["trades", "pickOrderSwaps", "positionSwaps"];
export const SWAPS: Record<SwapKind, { path: string; short: string; title: string; ask: (p: { championId: number; assignedPosition: string }) => string }> = {
  trades: { path: "trades", short: "Champion", title: "Proposer d'échanger vos champions", ask: (p) => `te propose d'échanger ton champion contre ${p.championId ? "le sien" : "son champion"}` },
  pickOrderSwaps: { path: "pick-order-swaps", short: "Ordre", title: "Proposer d'échanger votre ordre de pick", ask: () => "te propose d'échanger votre ordre de pick" },
  positionSwaps: { path: "position-swaps", short: "Rôle", title: "Proposer d'échanger vos rôles", ask: (p) => `te propose d'échanger vos rôles${ROLES[p.assignedPosition] ? ` (il est ${ROLES[p.assignedPosition]})` : ""}` },
};

const fail = (e: unknown) => showError(e);

/**
 * Toute la logique de la sélection des champions : lecture de la session deux fois par seconde, ce que tu peux
 * choisir, et les actions (survol, verrouillage, skin, sorts, runes, échanges). L'écran ne fait que l'afficher.
 * Rien n'est automatique : chaque appel au client part d'un clic.
 */
export function useDraft() {
  const champions = useClient((s) => s.champions);
  const history = useClient((s) => s.history);
  const mastery = useClient((s) => s.mastery);
  const summonerLevel = useClient((s) => s.summoner?.summonerLevel) ?? 30;
  const assets = useStatic();
  const matchups = useMatchups();

  const [session, setSession] = useState<ChampSelectSession | null>(null);
  const timerAt = useRef(Date.now());
  const [, setTick] = useState(0);
  useEffect(() => {
    // Une fois par seconde suffit pour le compte à rebours : la barre glisse en CSS entre deux ticks.
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const [allowed, setAllowed] = useState<number[]>([]);
  const [owned, setOwned] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [klass, setKlass] = useState("all");
  const [selected, setSelected] = useState(0);
  const [confirmBan, setConfirmBan] = useState(false);
  const [recentBans, setRecentBans] = useState<number[]>(() => readJson(BAN_KEY, []));
  const [favorites, setFavorites] = useState<number[]>(() => readJson(FAV_KEY, []));
  const [skins, setSkins] = useState<Skin[]>([]);
  const [pages, setPages] = useState<RunePage[]>([]);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [gameMode, setGameMode] = useState("CLASSIC");
  // Comment chaque allié a eu son rôle (principal, secondaire, autofill), comme l'icône du client.
  const [assignTier, setAssignTier] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let alive = true;
    type Flow = { phase?: string; gameData?: { queue?: { gameMode?: string }; teamOne?: { puuid?: string; selectedRole?: string }[]; teamTwo?: { puuid?: string; selectedRole?: string }[] } };
    const read = () =>
      lcu<Flow>("GET", "/lol-gameflow/v1/session")
        .then((g) => {
          if (!alive) return;
          if (g?.gameData?.queue?.gameMode) setGameMode(g.gameData.queue.gameMode);
          if (g?.phase !== "ChampSelect") return;
          const all = [...(g.gameData?.teamOne ?? []), ...(g.gameData?.teamTwo ?? [])];
          setAssignTier(new Map(all.filter((p) => p.puuid && p.selectedRole).map((p) => [p.puuid!, p.selectedRole!.split(".")[1] ?? ""])));
        })
        .catch(() => {});
    read();
    const t = setTimeout(read, 4000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: number;
    const poll = async () => {
      const s = await lcu<ChampSelectSession>("GET", "/lol-champ-select/v1/session").catch(() => null);
      if (alive && s) {
        setSession((prev) => {
          if (prev && JSON.stringify(prev) === JSON.stringify(s)) return prev; // rien n'a bougé : pas de rendu
          // Le client ne recalcule le temps restant qu'à chaque changement : on décompte nous-mêmes.
          if (!prev || prev.timer.phase !== s.timer.phase || prev.timer.adjustedTimeLeftInPhase !== s.timer.adjustedTimeLeftInPhase || prev.timer.internalNowInEpochMs !== s.timer.internalNowInEpochMs) timerAt.current = Date.now();
          return s;
        });
      }
      if (alive) timer = window.setTimeout(poll, 500);
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const local = session?.localPlayerCellId ?? -1;
  const actions = session?.actions.flat() ?? [];
  const phase = session?.timer.phase;
  // Pendant les intentions (PLANNING), le client marque déjà les bans « en cours » : on n'y touche pas avant la vraie phase de bans.
  const planning = phase === "PLANNING";
  const myAction: ChampSelectAction | undefined = planning ? undefined : actions.find((a) => a.actorCellId === local && a.isInProgress && !a.completed && (a.type === "ban" || a.type === "pick"));
  const myPickAction = actions.find((a) => a.actorCellId === local && a.type === "pick" && !a.completed);
  const me = session?.myTeam.find((p) => p.cellId === local);
  const isBan = myAction?.type === "ban";
  const locked = !!me?.championId && (!myPickAction || phase === "FINALIZATION");

  const stage: Stage =
    phase === "PLANNING" ? "planning" : phase === "FINALIZATION" ? "final" : isBan ? "ban" : myAction ? "pick" : me?.championId ? "final" : actions.some((a) => a.type === "ban" && a.isInProgress) ? "ban" : "waiting";
  const stepIndex = stage === "waiting" ? (actions.some((a) => a.type === "pick" && a.completed) ? 2 : 1) : STEPS.findIndex((s) => s.id === stage);

  // Changer de phase remet la sélection à zéro : en ban, on ne part pas du champion qu'on veut jouer.
  useEffect(() => {
    setSelected(0);
    setConfirmBan(false);
  }, [myAction?.id]);

  useEffect(() => {
    const path = isBan ? "/lol-champ-select/v1/bannable-champion-ids" : "/lol-champ-select/v1/pickable-champion-ids";
    lcu<unknown>("GET", path).then(
      (r) => {
        const ids = Array.isArray(r) ? r.map(Number).filter((n) => n > 0) : [];
        setAllowed(ids);
        if (isBan) snapshot("cs-bannable", [], { raw: Array.isArray(r) ? r.slice(0, 40) : r, count: ids.length });
      },
      () => setAllowed([]),
    );
  }, [isBan, myAction?.id, session?.bans.myTeamBans.length]);

  // Champions jouables (possédés + rotation), y compris ceux déjà pris ou bannis, pour masquer le reste.
  useEffect(() => {
    type Owned = { id: number; ownership?: { owned?: boolean; freeToPlayReward?: boolean }; freeToPlay?: boolean };
    lcu<Owned[]>("GET", "/lol-champions/v1/owned-champions-minimal")
      .then((list) => list.filter((c) => c.ownership?.owned || c.freeToPlay || c.ownership?.freeToPlayReward).map((c) => c.id))
      .catch(() => lcu<number[]>("GET", "/lol-champ-select/v1/pickable-champion-ids"))
      .then((ids) => ids.length && setOwned(new Set(ids)), () => {});
  }, []);

  // Une fois le champion verrouillé : ses skins et tes pages de runes.
  useEffect(() => {
    if (!locked) return setSkins([]);
    lcu<Skin[]>("GET", "/lol-champ-select/v1/skin-carousel-skins").then(
      (list) => {
        setSkins((list ?? []).filter((s) => !s.championId || s.championId === me?.championId));
        const withChromas = (list ?? []).filter((s) => s.childSkins?.length);
        snapshot("cs-skins", [], { count: list?.length ?? 0, chromaSkins: withChromas.length, sample: withChromas.slice(0, 2) });
      },
      () => setSkins([]),
    );
  }, [locked, me?.championId]);

  useEffect(() => {
    if (!locked) return;
    Promise.all([lcu<RunePage[]>("GET", "/lol-perks/v1/pages"), lcu<RunePage>("GET", "/lol-perks/v1/currentpage").catch(() => null)])
      .then(([list, current]) => {
        setPages((list ?? []).filter((p) => p.isEditable !== false || p.isActive));
        setCurrentPage(current?.id ?? list?.find((p) => p.isActive)?.id ?? null);
      })
      .catch(() => {});
  }, [locked]);

  const name = (id: number) => champions.get(id)?.name ?? "";
  const spellName = (id: number) => assets?.spells.get(id)?.name ?? SPELLS[id] ?? "Sort";
  // Seulement les sorts que le mode et ton niveau autorisent.
  const spellChoices = useMemo(() => {
    const fromData = assets
      ? [...assets.spells.entries()]
          .filter(([id, a]) => !HIDDEN_SPELLS.has(id) && a.modes?.includes(gameMode) && (a.level ?? 1) <= summonerLevel && !/placeholder/i.test(a.name))
          .sort((a, b) => (a[1].level ?? 0) - (b[1].level ?? 0) || a[1].name.localeCompare(b[1].name, "fr"))
          .map(([id]) => id)
      : [];
    return fromData.length ? fromData : MODE_SPELLS[gameMode] ?? MODE_SPELLS.CLASSIC;
  }, [assets, gameMode, summonerLevel]);

  const completedBans = actions.filter((a) => a.type === "ban" && a.completed && a.championId).map((a) => a.championId);
  const banned = new Set([...completedBans, ...(session?.bans.myTeamBans ?? []), ...(session?.bans.theirTeamBans ?? [])].filter(Boolean));

  // Ce que veut jouer chaque allié (intention ou champion déjà choisi).
  const allyWants = new Map<number, ChampSelectPlayer>();
  session?.myTeam.forEach((p) => {
    const id = p.championId || p.championPickIntent;
    if (id && p.cellId !== local) allyWants.set(id, p);
  });
  // Bans visés par les alliés pendant la phase de bans.
  const allyBanHovers = new Map<number, ChampSelectPlayer>();
  actions
    .filter((a) => a.type === "ban" && a.isInProgress && a.championId && a.actorCellId !== local)
    .forEach((a) => {
      const p = session?.myTeam.find((m) => m.cellId === a.actorCellId);
      if (p) allyBanHovers.set(a.championId, p);
    });

  const myIntent = me?.championPickIntent || myPickAction?.championId || 0;
  const shownId = selected || (isBan ? myAction?.championId : 0) || me?.championId || (isBan ? 0 : myIntent) || 0;

  const recentPlayed = useMemo(() => {
    const recent = new Map<number, number>();
    history.forEach((m, i) => {
      const id = m.participants[0]?.championId;
      if (id && !recent.has(id)) recent.set(id, i);
    });
    return recent;
  }, [history]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fav = new Set(favorites);
    const score = (id: number) => (isBan ? 0 : (fav.has(id) ? -100 : 0) + (recentPlayed.get(id) ?? 99 - Math.min(mastery.get(id)?.championLevel ?? 0, 98)));
    // Le résumé des champions contient parfois des variantes (modes spéciaux) avec le même nom : on garde le vrai champion.
    const byName = new Map<string, ChampionSummary>();
    for (const c of champions.values()) {
      const prev = byName.get(c.name);
      if (!prev || c.id < prev.id) byName.set(c.name, c);
    }
    return [...byName.values()]
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      // En pick : seulement les champions que tu peux jouer (possédés ou en rotation). En ban : tous.
      .filter((c) => isBan || !owned.size || owned.has(c.id))
      .filter((c) => klass === "all" || (klass === "fav" ? fav.has(c.id) : c.roles?.includes(klass)))
      .sort((a, b) => score(a.id) - score(b.id) || a.name.localeCompare(b.name, "fr"));
  }, [champions, recentPlayed, mastery, query, isBan, klass, favorites, owned]);

  // La liste du client ne sert à griser que si elle correspond bien aux champions affichés.
  const allowedSet = useMemo(() => new Set(allowed), [allowed]);
  const useAllowed = allowedSet.size > 0 && list.filter((c) => allowedSet.has(c.id)).length >= (isBan ? list.length / 2 : 1);
  const canChoose = (id: number) => !banned.has(id) && (!useAllowed || allowedSet.has(id));

  const stats = useMemo(() => {
    const games = history.filter((m) => m.participants[0]?.championId === shownId);
    const sum = (k: "kills" | "deaths" | "assists") => games.reduce((t, m) => t + Number(m.participants[0]?.stats[k] ?? 0), 0);
    const [k, d, a] = [sum("kills"), sum("deaths"), sum("assists")];
    const n = games.length;
    return {
      games: n,
      wins: games.filter((m) => m.participants[0]?.stats.win).length,
      kda: n ? (d ? dec((k + a) / d, 2) : "Parfait") : "",
      avg: n ? `${dec(k / n)} / ${dec(d / n)} / ${dec(a / n)}` : "",
      last: games[0],
      form: games.slice(0, 5).map((m) => !!m.participants[0]?.stats.win),
    };
  }, [history, shownId]);

  const hover = async (id: number) => {
    setSelected(id);
    setConfirmBan(false);
    // Pendant les intentions, on déclare son choix sur l'action de pick ; sinon on survole l'action en cours.
    const target = stage === "planning" ? myPickAction : myAction;
    if (!target) return;
    await lcu("PATCH", `/lol-champ-select/v1/session/actions/${target.id}`, { championId: id }).catch((e) => {
      fail(e);
      snapshot(`cs-hover-error-${target.type}`, [], { action: target, championId: id, error: String((e as Error)?.message ?? e) });
    });
  };

  const lock = async () => {
    if (!myAction || !shownId) return;
    if (isBan && (allyWants.has(shownId) || shownId === myIntent) && !confirmBan) {
      setConfirmBan(true);
      return;
    }
    // Verrouiller = valider l'action en cours, comme le bouton du client. On vérifie ensuite que le client l'a bien prise.
    const url = `/lol-champ-select/v1/session/actions/${myAction.id}`;
    const log: unknown[] = [];
    const step = async (label: string, fn: () => Promise<unknown>) => {
      try {
        log.push({ label, ok: (await fn()) ?? null });
      } catch (e) {
        log.push({ label, error: String((e as Error)?.message ?? e) });
      }
    };
    const done = async () => {
      const s = await lcu<ChampSelectSession>("GET", "/lol-champ-select/v1/session").catch(() => null);
      const a = s?.actions.flat().find((x) => x.id === myAction.id);
      log.push({ label: "check", completed: a?.completed, championId: a?.championId, phase: s?.timer.phase });
      return !!a?.completed;
    };
    await step("patch-complete", () => lcu("PATCH", url, { actorCellId: myAction.actorCellId, championId: shownId, completed: true, id: myAction.id, isAllyAction: true, type: myAction.type }));
    let ok = await done();
    if (!ok) {
      await step("post-complete", () => lcu("POST", `${url}/complete`, {}));
      ok = await done();
    }
    if (!ok) {
      await step("patch-then-post", async () => {
        await lcu("PATCH", url, { championId: shownId });
        return lcu("POST", `${url}/complete`);
      });
      ok = await done();
    }
    snapshot(`cs-lock-${ok ? "ok" : "failed"}-${myAction.type}`, [], { action: myAction, championId: shownId, log });
    if (!ok) showError(`Le client n'a pas validé ${isBan ? "le ban" : "le choix"}. Réessaie : l'erreur est enregistrée pour être corrigée.`);
    if (isBan) {
      const next = [shownId, ...readJson<number[]>(BAN_KEY, []).filter((b) => b !== shownId)].slice(0, 12);
      writeJson(BAN_KEY, next);
      setRecentBans(next);
    }
    setSelected(0);
    setConfirmBan(false);
  };

  const toggleFavorite = (id: number) => {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [id, ...favorites];
    writeJson(FAV_KEY, next);
    setFavorites(next);
  };

  const mySelection = (body: Record<string, unknown>) => lcu("PATCH", "/lol-champ-select/v1/session/my-selection", body).catch(fail);
  const chooseSkin = (skinId: number) => {
    setSession((s) => s && { ...s, myTeam: s.myTeam.map((p) => (p.cellId === local ? { ...p, selectedSkinId: skinId } : p)) });
    mySelection({ selectedSkinId: skinId });
  };
  const chooseSpell = (slot: 0 | 1, spell: number) => {
    if (!me) return;
    let [a, b] = [me.spell1Id ?? 0, me.spell2Id ?? 0];
    if (slot === 0) [a, b] = [spell, b === spell ? a : b];
    else [a, b] = [a === spell ? b : a, spell];
    mySelection({ spell1Id: a, spell2Id: b });
  };
  const choosePage = (id: number) => {
    setCurrentPage(id);
    lcu("PUT", "/lol-perks/v1/currentpage", id).catch(fail);
  };
  const savedPage = (saved: RunePage) => {
    setPages((l) => [saved, ...l.filter((x) => x.id !== saved.id)]);
    setCurrentPage(saved.id);
  };

  // Échanges avec les alliés, comme dans le client : champion, ordre de pick, rôle. Toujours un clic de ta part.
  const swapCall = (kind: SwapKind, id: number, verb: "request" | "accept" | "decline" | "cancel") => lcu("POST", `/lol-champ-select/v1/session/${SWAPS[kind].path}/${id}/${verb}`).catch(fail);
  const swapBench = (championId: number) => lcu("POST", `/lol-champ-select/v1/session/bench/swap/${championId}`).catch(fail);
  const reroll = () => lcu("POST", "/lol-champ-select/v1/session/my-selection/reroll").catch(fail);

  if (!session) return null;

  const left = Math.max(0, session.timer.adjustedTimeLeftInPhase - (Date.now() - timerAt.current));
  const total = session.timer.totalTimeInPhase || 30000;
  const seconds = Math.max(Math.ceil(left / 1000), 0);
  const banActions = actions.filter((a) => a.type === "ban");
  const ourBanSlots = banActions.filter((a) => session.myTeam.some((p) => p.cellId === a.actorCellId));
  const theirBanSlots = banActions.filter((a) => !ourBanSlots.includes(a));
  const swapsOf = (kind: SwapKind) => (session[kind] ?? []) as ChampSelectTrade[];
  const received = SWAP_KINDS.flatMap((kind) => swapsOf(kind).filter((t) => t.state === "RECEIVED").map((t) => ({ kind, t, from: session.myTeam.find((p) => p.cellId === t.cellId) }))).filter((r) => r.from);
  // ARAM (et modes à champion aléatoire) : pas de bans ni de rôles, relances et banc partagé.
  const aram = gameMode === "ARAM" || !!session.benchEnabled;
  // Comme le client : la grille reste visible tant que tu n'as pas verrouillé, même quand ce n'est pas ton tour.
  const showPicker = !aram && (!me?.championId || (!!myAction && !isBan && !locked) || isBan);
  const selectedSkin = me?.selectedSkinId ?? 0;
  // Un chroma garde le splash de son skin parent : on retrouve le parent pour l'affichage.
  const currentSkin = skins.find((s) => s.id === selectedSkin || s.childSkins?.some((c) => c.id === selectedSkin));
  const skinId = currentSkin?.id ?? selectedSkin;
  // Côté de la carte : champ « team » du client (1 = bleu), sinon les places 0 à 4 sont bleues.
  const blueSide = me?.team ? me.team === 1 : local < 5;
  // Alliés numérotés de 1 à 4 (toi à part), les mêmes numéros sur les cartes et dans le chat.
  const allyNum = new Map(session.myTeam.filter((p) => p.cellId !== local).map((p, i) => [p.cellId, i + 1]));
  // Chat de l'équipe : chaque allié devient « Joueur N · rôle » (ou son pseudo s'il est visible), sans jamais révéler un nom caché.
  const chatNames = new Map<number | string, string>();
  session.myTeam
    .filter((p) => p.cellId !== local)
    .forEach((p) => {
      const label = p.gameName || `Joueur ${allyNum.get(p.cellId)}${ROLES[p.assignedPosition] ? ` · ${ROLES[p.assignedPosition]}` : ""}`;
      for (const k of [p.puuid, p.summonerId, p.obfuscatedPuuid, p.obfuscatedSummonerId]) if (k) chatNames.set(k, label);
    });
  const pickingCell = (cellId: number) => actions.some((a) => a.actorCellId === cellId && a.type === "pick" && a.isInProgress && !a.completed);

  return {
    session, assets, matchups, champions, mastery, actions, local, me, myAction, isBan, locked, stage, stepIndex, planning, aram, gameMode,
    left, total, seconds, urgent: seconds <= 5 && !!myAction,
    ourBanSlots, theirBanSlots, blueSide, allyNum, chatNames, assignTier, pickingCell,
    shownId, myIntent, stats, name, spellName, spellChoices,
    list, query, setQuery, klass, setKlass, canChoose, banned, allyWants, allyBanHovers, favorites, toggleFavorite,
    recentBanChoices: recentBans.filter((id) => canChoose(id)).slice(0, 6),
    warnAlly: isBan && shownId ? allyWants.get(shownId) : undefined, warnSelf: isBan && shownId > 0 && shownId === myIntent, confirmBan,
    showPicker, hover, lock,
    skins, currentSkin, skinId, selectedSkin, chromas: currentSkin?.childSkins ?? [], chooseSkin,
    pages, currentPage, page: pages.find((p) => p.id === currentPage), choosePage, savedPage, chooseSpell,
    swapsOf, received, swapCall, swapBench, reroll, rerolls: session.rerollsRemaining ?? 0, bench: session.benchChampions ?? [],
  };
}

export type DraftState = NonNullable<ReturnType<typeof useDraft>>;
