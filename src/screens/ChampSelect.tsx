import { Breathing } from "../components/Breathing";
import { RoomChat } from "../components/RoomChat";
import { snapshot } from "../lib/archive";
import { useEffect, useMemo, useRef, useState } from "react";
import { Art } from "../components/ui";
import { championSplash, championSquare, gameAsset, lcu, skinSplash, timeAgo } from "../lib/lcu";
import { useStatic } from "../lib/ddragon";
import { RuneEditor } from "../components/RuneEditor";
import { useMatchups, versus, withChamp, type Tally } from "../lib/matchups";
import { friendlyError } from "../lib/errors";
import type { ChampionSummary, ChampSelectAction, ChampSelectTrade, ChampSelectPlayer, ChampSelectSession, Mastery, Match, RunePage, Skin } from "../lib/types";

const ROLES: Record<string, string> = { top: "Top", jungle: "Jungle", middle: "Mid", bottom: "ADC", utility: "Support" };

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
const HIDDEN_SPELLS = new Set([54, 55]); // emplacements vides internes au client

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

type Stage = "planning" | "ban" | "pick" | "waiting" | "final";
const STEPS: { id: Stage; label: string }[] = [
  { id: "planning", label: "Intentions" },
  { id: "ban", label: "Bans" },
  { id: "pick", label: "Choix" },
  { id: "final", label: "Finalisation" },
];

// Petites préférences gardées sur ce PC.
function readList(key: string): number[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}
function writeList(key: string, list: number[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* stockage indisponible : on s'en passe */
  }
}
const BAN_KEY = "nexus.recentBans";
const FAV_KEY = "nexus.favorites";

interface Props {
  champions: Map<number, ChampionSummary>;
  history: Match[];
  mastery: Map<number, Mastery>;
  summonerLevel?: number;
  onError: (e: string) => void;
}

type SwapKind = "trades" | "pickOrderSwaps" | "positionSwaps";
const SWAP_KINDS: SwapKind[] = ["trades", "pickOrderSwaps", "positionSwaps"];
const SWAPS: Record<SwapKind, { path: string; short: string; title: string; ask: (p: { championId: number; assignedPosition: string }) => string }> = {
  trades: { path: "trades", short: "Champion", title: "Proposer d'échanger vos champions", ask: (p) => `te propose d'échanger ton champion contre ${p.championId ? "le sien" : "son champion"}` },
  pickOrderSwaps: { path: "pick-order-swaps", short: "Ordre", title: "Proposer d'échanger votre ordre de pick", ask: () => "te propose d'échanger votre ordre de pick" },
  positionSwaps: { path: "position-swaps", short: "Rôle", title: "Proposer d'échanger vos rôles", ask: (p) => `te propose d'échanger vos rôles${ROLES[p.assignedPosition] ? ` (il est ${ROLES[p.assignedPosition]})` : ""}` },
};

export function ChampSelect({ champions, history, mastery, summonerLevel = 30, onError }: Props) {
  const [session, setSession] = useState<ChampSelectSession | null>(null);
  const timerAt = useRef(Date.now());
  const [, setTick] = useState(0);
  const matchups = useMatchups();
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
  const [recentBans, setRecentBans] = useState<number[]>(() => readList(BAN_KEY));
  const [favorites, setFavorites] = useState<number[]>(() => readList(FAV_KEY));
  const [skins, setSkins] = useState<Skin[]>([]);
  const [pages, setPages] = useState<RunePage[]>([]);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [editRunes, setEditRunes] = useState(false);
  const [spellSlot, setSpellSlot] = useState<0 | 1 | null>(null);
  const assets = useStatic();
  const [gameMode, setGameMode] = useState("CLASSIC");

  useEffect(() => {
    lcu<{ gameData?: { queue?: { gameMode?: string } } }>("GET", "/lol-gameflow/v1/session")
      .then((g) => g?.gameData?.queue?.gameMode && setGameMode(g.gameData.queue.gameMode))
      .catch(() => {});
  }, []);
  // Comment chaque allié a eu son rôle (principal, secondaire, autofill), comme l'icône du client.
  const [assignTier, setAssignTier] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    const read = () =>
      lcu<{ phase?: string; gameData?: { teamOne?: { puuid?: string; selectedRole?: string }[]; teamTwo?: { puuid?: string; selectedRole?: string }[] } }>("GET", "/lol-gameflow/v1/session")
        .then((g) => {
          if (!alive || g?.phase !== "ChampSelect") return;
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
  // Pendant les intentions (PLANNING), le client marque déjà les bans « en cours » : on n'y touche pas avant la vraie phase de bans.
  const planning = session?.timer.phase === "PLANNING";
  const myAction: ChampSelectAction | undefined = planning ? undefined : actions.find((a) => a.actorCellId === local && a.isInProgress && !a.completed && (a.type === "ban" || a.type === "pick"));
  const myPickAction = actions.find((a) => a.actorCellId === local && a.type === "pick" && !a.completed);
  const me = session?.myTeam.find((p) => p.cellId === local);
  const isBan = myAction?.type === "ban";
  const phase = session?.timer.phase;
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
    lcu<number[]>("GET", "/lol-champions/v1/owned-champions-minimal")
      .then((list) => (list as unknown as { id: number; ownership?: { owned?: boolean; freeToPlayReward?: boolean }; freeToPlay?: boolean }[]).filter((c) => c.ownership?.owned || c.freeToPlay || c.ownership?.freeToPlayReward).map((c) => c.id))
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
    return {
      games: games.length,
      wins: games.filter((m) => m.participants[0]?.stats.win).length,
      kda: games.length ? (d ? ((k + a) / d).toFixed(2).replace(".", ",") : "Parfait") : "",
      avg: games.length ? `${(k / games.length).toFixed(1).replace(".", ",")} / ${(d / games.length).toFixed(1).replace(".", ",")} / ${(a / games.length).toFixed(1).replace(".", ",")}` : "",
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
      onError(friendlyError(e));
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
        log.push({ label, ok: await fn() ?? null });
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
    if (!ok) onError(`Le client n'a pas validé ${isBan ? "le ban" : "le choix"}. Réessaie, ou dis-le-moi : l'erreur est enregistrée.`);
    if (isBan) {
      const next = [shownId, ...readList(BAN_KEY).filter((b) => b !== shownId)].slice(0, 12);
      writeList(BAN_KEY, next);
      setRecentBans(next);
    }
    setSelected(0);
    setConfirmBan(false);
  };

  const toggleFavorite = (id: number) => {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [id, ...favorites];
    writeList(FAV_KEY, next);
    setFavorites(next);
  };

  const mySelection = (body: Record<string, unknown>) =>
    lcu("PATCH", "/lol-champ-select/v1/session/my-selection", body).catch((e) => onError(friendlyError(e)));
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
    setSpellSlot(null);
  };
  const choosePage = (id: number) => {
    setCurrentPage(id);
    lcu("PUT", "/lol-perks/v1/currentpage", id).catch((e) => onError(friendlyError(e)));
  };

  // Échanges avec les alliés, comme dans le client : champion, ordre de pick, rôle. Toujours un clic de ta part.
  const swapCall = (kind: SwapKind, id: number, verb: "request" | "accept" | "decline" | "cancel") =>
    lcu("POST", `/lol-champ-select/v1/session/${SWAPS[kind].path}/${id}/${verb}`).catch((e) => onError(friendlyError(e)));
  const swapBench = (championId: number) =>
    lcu("POST", `/lol-champ-select/v1/session/bench/swap/${championId}`).catch((e) => onError(friendlyError(e)));

  if (!session) return <div className="center"><p>Chargement de la sélection…</p></div>;

  const left = Math.max(0, session.timer.adjustedTimeLeftInPhase - (Date.now() - timerAt.current));
  const total = session.timer.totalTimeInPhase || 30000;
  const seconds = Math.max(Math.ceil(left / 1000), 0);
  const banActions = actions.filter((a) => a.type === "ban");
  const ourBanSlots = banActions.filter((a) => session.myTeam.some((p) => p.cellId === a.actorCellId));
  const theirBanSlots = banActions.filter((a) => !ourBanSlots.includes(a));
  const swapsOf = (kind: SwapKind) => (session[kind] ?? []) as ChampSelectTrade[];
  const received = SWAP_KINDS.flatMap((kind) => swapsOf(kind).filter((t) => t.state === "RECEIVED").map((t) => ({ kind, t, from: session.myTeam.find((p) => p.cellId === t.cellId) }))).filter((r) => r.from);
  const warnAlly = isBan && shownId ? allyWants.get(shownId) : undefined;
  const warnSelf = isBan && shownId > 0 && shownId === myIntent;
  // Comme le client : la grille reste visible tant que tu n'as pas verrouillé, même quand ce n'est pas ton tour.
  const showPicker = !(gameMode === "ARAM" || !!session.benchEnabled) && (!me?.championId || (!!myAction && !isBan && !locked) || isBan);
  const recentBanChoices = recentBans.filter((id) => canChoose(id)).slice(0, 6);
  const selectedId = me?.selectedSkinId ?? 0;
  // Un chroma garde le splash de son skin parent : on retrouve le parent pour l'affichage.
  const currentSkin = skins.find((s) => s.id === selectedId || s.childSkins?.some((c) => c.id === selectedId));
  const skinId = currentSkin?.id ?? selectedId;
  const chromas = currentSkin?.childSkins ?? [];
  const background = locked && me && skinId ? skinSplash(me.championId, skinId) : shownId ? championSplash(shownId) : "";
  const page = pages.find((p) => p.id === currentPage);
  const urgent = seconds <= 5 && !!myAction;
  // Côté de la carte : champ « team » du client (1 = bleu), sinon les places 0 à 4 sont bleues.
  const meCell = session.myTeam.find((p) => p.cellId === local);
  const blueSide = meCell?.team ? meCell.team === 1 : local < 5;
  // Chat de l'équipe : chaque allié devient « Joueur N · rôle » (ou son pseudo s'il est visible), sans jamais révéler un nom caché.
  // Alliés numérotés de 1 à 4 (toi à part), les mêmes numéros sur les cartes et dans le chat.
  const allyNum = new Map(session.myTeam.filter((p) => p.cellId !== local).map((p, i) => [p.cellId, i + 1]));
  const chatNames = new Map<number | string, string>();
  session.myTeam
    .filter((p) => p.cellId !== local)
    .forEach((p) => {
      const label = p.gameName || `Joueur ${allyNum.get(p.cellId)}${ROLES[p.assignedPosition] ? ` · ${ROLES[p.assignedPosition]}` : ""}`;
      for (const k of [p.puuid, p.summonerId, p.obfuscatedPuuid, p.obfuscatedSummonerId]) if (k) chatNames.set(k, label);
    });
  // ARAM (et modes à champion aléatoire) : pas de bans ni de rôles, relances et banc partagé.
  const aram = gameMode === "ARAM" || !!session.benchEnabled;
  const rerolls = session.rerollsRemaining ?? 0;
  const bench = session.benchChampions ?? [];
  const reroll = () => lcu("POST", "/lol-champ-select/v1/session/my-selection/reroll").catch((e) => onError(friendlyError(e)));

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

  const pickingCell = (cellId: number) => actions.some((a) => a.actorCellId === cellId && a.type === "pick" && a.isInProgress && !a.completed);

  return (
    <div className={`dr ${isBan ? "dr-banning" : ""} ${aram ? "dr-aram" : ""}`}>
      <div className={`dr-bg ${background ? "" : "idle"}`}>
        <span className="dr-aurora" aria-hidden="true" />
        <span className="dr-embers" aria-hidden="true" />
        {background && <Breathing full key={background} src={background} champ={(locked && me?.championId) || shownId} />}
      </div>

      {/* Bandeau : bans des deux équipes autour du chrono. */}
      <header className="dr-bar">
        <div className="dr-sidecol">
          <span className={`dr-side ${blueSide ? "blue" : "red"}`}>Ton équipe · côté {blueSide ? "bleu" : "rouge"}</span>
          {aram ? <div className="dr-mode">ARAM</div> : <BanRow slots={ourBanSlots} local={local} reveal={(a) => a.completed || a.actorCellId === local} />}
        </div>
        <div className={`dr-clock ${urgent ? "urgent" : ""}`}>
          {!aram && <div className="dr-steps" aria-label="Étapes de la sélection">
            {STEPS.map((s, i) => (
              <span key={s.id} className={i === stepIndex ? "on" : i < stepIndex ? "done" : ""}>
                {s.label}
              </span>
            ))}
          </div>}
          <b>{seconds}</b>
          <div className="dr-time" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
          </div>
        </div>
        <div className="dr-sidecol right">
          {!aram && <span className={`dr-side ${blueSide ? "red" : "blue"}`}>Adversaires · côté {blueSide ? "rouge" : "bleu"}</span>}
          {aram ? <div className="dr-mode right">Abîme hurlant</div> : <BanRow slots={theirBanSlots} local={local} reveal={(a) => a.completed} right />}
        </div>
      </header>

      <div className="dr-main">
        <aside className="dr-team" aria-label="Ton équipe">
          {session.myTeam.map((p) => {
            const isMe = p.cellId === local;
            // Ta carte montre aussi le champion que tu regardes, pour ne jamais rester vide.
            const id = p.championId || p.championPickIntent || (isMe && !isBan ? shownId : 0);
            const banHover = actions.find((a) => a.type === "ban" && a.actorCellId === p.cellId && a.isInProgress && a.championId);
            const offers = SWAP_KINDS.map((kind) => ({ kind, t: swapsOf(kind).find((t) => t.cellId === p.cellId && (t.state === "AVAILABLE" || t.state === "SENT")) })).filter((o) => o.t);
            const art = isMe && locked && skinId ? skinSplash(p.championId, skinId) : id ? championSplash(id) : "";
            return (
              <div key={p.cellId} className={`dr-card ally ${isMe ? "self" : ""} ${pickingCell(p.cellId) ? "picking" : ""} ${p.championId ? "locked" : id ? "intent" : "vacant"}`}>
                {art && <Breathing full key={art} src={art} champ={p.championId || id} />}
                <div className="dr-card-shade" />
                <span className="dr-role">
                  {ROLES[p.assignedPosition] ?? ""}
                  {p.puuid && assignTier.get(p.puuid) && <TierTag tier={assignTier.get(p.puuid)!} />}
                </span>
                <div className="dr-card-txt">
                  <b>{id ? name(id) : isMe ? "À toi de choisir" : pickingCell(p.cellId) ? "Choisit…" : "—"}</b>
                  <span>{p.gameName || (isMe ? "Toi" : `Joueur ${allyNum.get(p.cellId)}`)}</span>
                  {banHover && !isMe && <em className="dr-hint">Veut bannir {name(banHover.championId)}</em>}
                </div>
                {(p.championId > 0 || isMe) && p.spell1Id && !HIDDEN_SPELLS.has(p.spell1Id) ? (
                  <span className="dr-spells">
                    {[p.spell1Id, p.spell2Id ?? 0].map((s, j) => (
                      <SpellIcon key={j} id={s} icon={assets?.spells.get(s)?.icon} name={spellName(s)} />
                    ))}
                  </span>
                ) : null}
                {!isMe && offers.length > 0 && (
                  <div className="dr-swaps">
                    {offers.map(({ kind, t }) =>
                      t!.state === "SENT" ? (
                        <button key={kind} className="dr-trade-btn sent" onClick={() => swapCall(kind, t!.id, "cancel")} title="Annuler ta proposition">
                          {SWAPS[kind].short} proposé · Annuler
                        </button>
                      ) : (
                        <button key={kind} className="dr-trade-btn" onClick={() => swapCall(kind, t!.id, "request")} title={SWAPS[kind].title}>
                          ⇄ {SWAPS[kind].short}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        <section className="dr-center">
          <div className="dr-hero">
            <div className="eyebrow">{eyebrow}</div>
            <h1 className="title">
              {shownId ? (
                <>
                  {isBan && <span className="dr-ban-word">BANNIR </span>}
                  {name(shownId).toUpperCase()}
                </>
              ) : isBan ? (
                "QUI BANNIR ?"
              ) : (
                "CHOISIS"
              )}
            </h1>
            {locked && currentSkin && !currentSkin.isBase && <div className="dr-skin-name">{currentSkin.name}</div>}

            {shownId > 0 && !isBan && (
              <div className="meta">
                {mastery.get(shownId) && (
                  <>
                    Maîtrise {mastery.get(shownId)!.championLevel} · {mastery.get(shownId)!.championPoints.toLocaleString("fr-FR")} pts ·{" "}
                  </>
                )}
                {stats.games > 0 ? (
                  <>
                    <b style={{ color: "var(--win)" }}>{Math.round((stats.wins / stats.games) * 100)} %</b> de victoires sur {stats.games} partie
                    {stats.games > 1 ? "s" : ""} récente{stats.games > 1 ? "s" : ""}
                  </>
                ) : (
                  "Pas joué récemment"
                )}
              </div>
            )}

            {shownId > 0 && !isBan && matchups && (
              <div className="dr-own">
                <span className="label">En classé, avec {name(shownId)}</span>
                <MatchupBadge t={withChamp(matchups, shownId)} title={`Ton bilan avec ${name(shownId)} dans tes parties classées archivées`} big />
              </div>
            )}

            {shownId > 0 && !isBan && stats.last && (
              <div className="dr-mystats" aria-label="Tes stats sur ce champion">
                <div>
                  <span className="label">Forme</span>
                  <span className="dr-form">
                    {stats.form.map((w, i) => (
                      <i key={i} className={w ? "w" : "l"} title={w ? "Victoire" : "Défaite"}>
                        {w ? "V" : "D"}
                      </i>
                    ))}
                  </span>
                </div>
                <div>
                  <span className="label">KDA moyen</span>
                  <b>{stats.avg}</b>
                  <small>{stats.kda}</small>
                </div>
                <div>
                  <span className="label">Dernière partie</span>
                  <b style={{ color: stats.last.participants[0]?.stats.win ? "var(--win)" : "var(--loss)" }}>
                    {stats.last.participants[0]?.stats.win ? "Victoire" : "Défaite"}{" "}
                    {stats.last.participants[0]?.stats.kills}/{stats.last.participants[0]?.stats.deaths}/{stats.last.participants[0]?.stats.assists}
                  </b>
                  <small>{timeAgo(stats.last.gameCreation)}</small>
                </div>
              </div>
            )}

            {(warnAlly || warnSelf) && (
              <div className="warn" role="alert">
                {warnSelf ? "C'est le champion que tu as prévu de jouer." : `${warnAlly!.gameName ?? "Un allié"} veut jouer ${name(shownId)}.`}
                {confirmBan ? " Reclique sur Bannir pour confirmer." : ""}
              </div>
            )}

            <div className="btns">
              {aram && (
                <button className="btn btn-primary dr-reroll" onClick={reroll} disabled={rerolls <= 0} title="Tirer un autre champion au sort (ton champion actuel part sur le banc)">
                  ⟳ Relancer <span>{rerolls}</span>
                </button>
              )}
              {aram && <span className="meta">Prends un champion du banc à droite, ou échange avec un allié.</span>}
              {myAction && (
                <button className={`btn dr-lock ${isBan ? "btn-red" : "btn-primary"}`} onClick={lock} disabled={!shownId}>
                  {isBan ? (confirmBan ? "Bannir quand même" : "Bannir") : "Verrouiller"}
                </button>
              )}
              {stage === "planning" && <span className="meta">Tes alliés voient ton intention. Les bans commencent dans {seconds} s.</span>}
              {isBan && <span className="meta">Les bans sont révélés une fois que tout le monde a banni.</span>}
              {shownId > 0 && !locked && !isBan && (
                <button className="btn btn-ghost small" onClick={() => toggleFavorite(shownId)} aria-pressed={favorites.includes(shownId)}>
                  {favorites.includes(shownId) ? "★ Favori" : "☆ Ajouter aux favoris"}
                </button>
              )}
            </div>

            <RoomChat kind="draft" hint={session?.chatDetails?.multiUserChatId ?? session?.chatDetails?.chatRoomName} names={chatNames} />

            {received.map(({ kind, t, from }) => (
              <div key={`${kind}-${t.id}`} className="trade" role="alert">
                {from!.championId ? <Breathing src={championSquare(from!.championId)} champ={from!.championId} /> : <span className="trade-ico">⇄</span>}
                <div>
                  <b>{from!.gameName || "Un allié"}</b> {SWAPS[kind].ask(from!)}
                </div>
                <button className="btn btn-primary" onClick={() => swapCall(kind, t.id, "accept")}>
                  Accepter
                </button>
                <button className="btn btn-ghost" onClick={() => swapCall(kind, t.id, "decline")}>
                  Refuser
                </button>
              </div>
            ))}
          </div>

          {showPicker && (
            <section className="dr-picker">
              <div className="dr-picker-head">
                <div className="dr-filters" role="group" aria-label="Filtrer les champions">
                  {CLASSES.map(([value, label]) => (
                    <button key={value} className="chip" aria-pressed={klass === value} onClick={() => setKlass(value)}>
                      {label}
                    </button>
                  ))}
                </div>
                <input className="search" placeholder="Rechercher" aria-label="Rechercher un champion" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              {isBan && recentBanChoices.length > 0 && (
                <div className="quick">
                  <span className="label">Tes bans habituels</span>
                  {recentBanChoices.map((id) => (
                    <button key={id} className="chip" aria-pressed={shownId === id} onClick={() => hover(id)}>
                      {name(id)}
                    </button>
                  ))}
                </div>
              )}
              <div className="dr-grid">
                {list.map((c) => {
                  const isBanned = banned.has(c.id);
                  const ally = allyWants.get(c.id);
                  const allyBan = allyBanHovers.get(c.id);
                  const disabled = !canChoose(c.id);
                  const m = mastery.get(c.id);
                  return (
                    <button key={c.id} className="dr-champ" aria-pressed={shownId === c.id} disabled={disabled} onClick={() => hover(c.id)} title={c.name}>
                      <Breathing src={championSquare(c.id)} champ={c.id} />
                      {favorites.includes(c.id) && <i className="dr-star">★</i>}
                      {!isBan && m && m.championLevel >= 5 && <i className="dr-mastery">{m.championLevel}</i>}
                      {isBanned && <em className="tag tag-ban">Banni</em>}
                      {!isBanned && ally && <em className="tag tag-ally">{isBan ? ally.gameName ?? "Allié" : "Pris"}</em>}
                      {!isBanned && isBan && !ally && allyBan && <em className="tag tag-target">Visé</em>}
                      <span>{c.name}</span>
                    </button>
                  );
                })}
                {list.length === 0 && <p className="dr-empty">{klass === "fav" ? "Aucun favori : ajoute-en avec ☆ sous le nom du champion." : "Aucun champion trouvé."}</p>}
              </div>
            </section>
          )}

          {locked && me && (
            <section className="dr-final">
              <div className="dr-loadout">
                <div className="dr-box">
                  <span className="label">Sorts</span>
                  <div className="dr-spell-pick">
                    {([0, 1] as const).map((slot) => {
                      const id = (slot === 0 ? me.spell1Id : me.spell2Id) ?? 0;
                      return (
                        <button key={slot} className={`dr-spell ${spellSlot === slot ? "on" : ""}`} onClick={() => setSpellSlot(spellSlot === slot ? null : slot)} title={`${spellName(id)} (touche ${slot === 0 ? "D" : "F"})`}>
                          <SpellIcon id={id} icon={assets?.spells.get(id)?.icon} name={spellName(id)} />
                          <kbd>{slot === 0 ? "D" : "F"}</kbd>
                        </button>
                      );
                    })}
                  </div>
                  {spellSlot !== null && (
                    <div className="dr-spell-menu" role="menu">
                      {spellChoices.map((s) => {
                        const current = (spellSlot === 0 ? me.spell1Id : me.spell2Id) === s;
                        const other = (spellSlot === 0 ? me.spell2Id : me.spell1Id) === s;
                        return (
                          <button key={s} role="menuitem" className={current ? "on" : ""} onClick={() => chooseSpell(spellSlot, s)} title={other ? `${spellName(s)} : échange tes deux sorts` : spellName(s)}>
                            <SpellIcon id={s} icon={assets?.spells.get(s)?.icon} name={spellName(s)} />
                            <span>{spellName(s)}</span>
                            {other && <em>⇄</em>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {pages.length > 0 && (
                  <div className="dr-box">
                    <span className="label">Runes</span>
                    <div className="dr-runes">
                      {page?.selectedPerkIds?.[0] && assets?.runes.get(page.selectedPerkIds[0]) && (
                        <span className="dr-keystone">
                          <Art src={assets.runes.get(page.selectedPerkIds[0])!.icon} />
                        </span>
                      )}
                      <select value={currentPage ?? ""} onChange={(e) => choosePage(Number(e.target.value))} aria-label="Page de runes">
                        {pages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      {assets?.styles.length ? (
                        <button className="btn btn-ghost small dr-runes-edit" onClick={() => setEditRunes(true)} title="Modifier cette page de runes">
                          Modifier
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              {skins.length > 0 && (
                <div className="dr-skins">
                  <span className="label">
                    Skins <span>{skins.filter((s) => s.unlocked).length} possédés</span>
                    <button
                      className="dr-random"
                      onClick={() => {
                        const owned = skins.filter((s) => s.unlocked && !s.disabled && s.id !== skinId);
                        if (owned.length) chooseSkin(owned[Math.floor(Math.random() * owned.length)].id);
                      }}
                      title="Prendre un de tes skins au hasard"
                    >
                      ⤮ Aléatoire
                    </button>
                  </span>
                  <div className="dr-skin-row">
                    {[...skins]
                      .sort((a, b) => Number(!!b.unlocked) - Number(!!a.unlocked))
                      .map((s) => (
                        <button
                          key={s.id}
                          className="dr-skin"
                          aria-pressed={skinId === s.id || (!skinId && !!s.isBase)}
                          data-chromas={s.childSkins?.length || undefined}
                          disabled={!s.unlocked || s.disabled}
                          onClick={() => chooseSkin(s.id)}
                          title={s.unlocked ? s.name : `${s.name} (non possédé)`}
                        >
                          <Breathing full src={skinSplash(me.championId, s.id)} champ={me.championId} />
                          <span>{s.isBase ? "Classique" : s.name}</span>
                          {!s.unlocked && <i className="dr-lockico">Non possédé</i>}
                        </button>
                      ))}
                  </div>
                  {chromas.length > 0 && (
                    <div className="dr-chromas" role="group" aria-label="Chromas">
                      <span className="label">
                        Chromas <span>{chromas.filter((c) => c.unlocked).length} / {chromas.length} possédés</span>
                      </span>
                      <div className="dr-chroma-row">
                        <button className="dr-chroma base" aria-pressed={selectedId === skinId} onClick={() => chooseSkin(skinId)} title="Sans chroma" aria-label="Sans chroma" />
                        {chromas.map((c) => {
                          const [a, b] = c.colors?.length ? [c.colors[0], c.colors[1] ?? c.colors[0]] : ["#888", "#444"];
                          return (
                            <button
                              key={c.id}
                              className="dr-chroma"
                              style={{ background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)` }}
                              aria-pressed={selectedId === c.id}
                              disabled={!c.unlocked || c.disabled}
                              onClick={() => chooseSkin(c.id)}
                              title={c.unlocked ? c.name : `${c.name} (non possédé)`}
                              aria-label={c.name}
                            >
                              {c.chromaPreviewPath && (
                                <span className="dr-chroma-preview" aria-hidden="true">
                                  <Breathing src={gameAsset(c.chromaPreviewPath)} />
                                  <b>{c.name}</b>
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {!aram && session.benchEnabled && (session.benchChampions?.length ?? 0) > 0 && (
            <div className="bench">
              <span className="label">Banc ARAM</span>
              <div className="bench-row">
                {session.benchChampions!.map((c) => (
                  <button key={c.championId} className="champ small" onClick={() => swapBench(c.championId)} title={`Prendre ${name(c.championId)}`}>
                    <Breathing src={championSquare(c.championId)} champ={c.championId} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {aram ? (
          <aside className="dr-bench" aria-label="Banc">
            <h3>
              Banc <span>{bench.length}/10</span>
            </h3>
            <div className="dr-bench-grid">
              {bench.map((c) => (
                <button key={c.championId} className="dr-bench-card" onClick={() => swapBench(c.championId)} title={`Prendre ${name(c.championId)}`}>
                  <Breathing full src={championSplash(c.championId)} champ={c.championId} />
                  <span>{name(c.championId)}</span>
                  <em>Prendre</em>
                </button>
              ))}
              {bench.length === 0 && <p className="dr-empty">Le banc est vide. Les champions relancés par ton équipe arrivent ici.</p>}
            </div>
            <p className="dr-hidden-foes">L'équipe adverse est cachée jusqu'à l'écran de chargement.</p>
          </aside>
        ) : (
        <aside className="dr-team" aria-label="Équipe adverse">
          {session.theirTeam.map((p, i) => (
            <div key={p.cellId} className={`dr-card enemy ${pickingCell(p.cellId) ? "picking" : ""} ${p.championId ? "locked" : "vacant"}`}>
              {p.championId > 0 && <Breathing full src={championSplash(p.championId)} champ={p.championId} />}
              <div className="dr-card-shade" />
              <span className="dr-role">{ROLES[p.assignedPosition] ?? `Adversaire ${i + 1}`}</span>
              <div className="dr-card-txt">
                <b>{p.championId ? name(p.championId) : pickingCell(p.cellId) ? "Choisit…" : "—"}</b>
                {p.championId > 0 && matchups && (
                  <MatchupBadge
                    t={versus(matchups, p.championId, me?.championId || undefined, me?.assignedPosition || null)}
                    title={`${me?.championId ? `${name(me.championId)} contre ${name(p.championId)}` : `Contre ${name(p.championId)}`}${me?.assignedPosition ? ` en ${ROLES[me.assignedPosition] ?? me.assignedPosition}` : ""}, dans tes parties classées archivées`}
                  />
                )}
              </div>
            </div>
          ))}
        </aside>
        )}
      </div>
      {editRunes && assets && (
        <RuneEditor
          styles={assets.styles}
          page={page}
          championName={me?.championId ? name(me.championId) : undefined}
          splash={me?.championId ? championSplash(me.championId) : undefined}
          onSaved={(saved) => {
            setPages((list) => [saved, ...list.filter((x) => x.id !== saved.id)]);
            setCurrentPage(saved.id);
          }}
          onClose={() => setEditRunes(false)}
        />
      )}
    </div>
  );
}

function TierTag({ tier }: { tier: string }) {
  if (tier === "PRIMARY") return <em className="dr-tier primary" title="Rôle principal">Principal</em>;
  if (tier === "SECONDARY") return <em className="dr-tier secondary" title="Rôle secondaire">Secondaire</em>;
  return <em className="dr-tier fill" title="Placé en autofill">Autofill</em>;
}

function BanRow({ slots, local, reveal, right }: { slots: ChampSelectAction[]; local: number; reveal: (a: ChampSelectAction) => boolean; right?: boolean }) {
  return (
    <div className={`dr-bans ${right ? "right" : ""}`}>
      {slots.map((a) => (
        <div key={a.id} className={`dr-ban ${a.completed ? "done" : a.isInProgress ? "live" : ""} ${a.actorCellId === local ? "mine" : ""}`}>
          {a.championId > 0 && reveal(a) && <Breathing src={championSquare(a.championId)} champ={a.championId} />}
        </div>
      ))}
    </div>
  );
}

function SpellIcon({ id, icon, name }: { id: number; icon?: string; name?: string }) {
  const label = name ?? SPELLS[id] ?? "?";
  return (
    <span className="dr-spell-ico" title={label}>
      {icon ? <Art src={icon} alt={label} /> : <i>{label.slice(0, 2)}</i>}
    </span>
  );
}

/** Bilan « 3V 1D · 75 % · 4 parties », grisé sous 5 parties (trop peu pour conclure). */
function MatchupBadge({ t, title, big }: { t: Tally; title: string; big?: boolean }) {
  if (!t.n) return <span className={`mu none ${big ? "big" : ""}`} title={title}>aucune partie</span>;
  const pct = Math.round((t.w / t.n) * 100);
  const tone = t.n < 5 ? "few" : pct >= 55 ? "good" : pct <= 45 ? "bad" : "even";
  return (
    <span className={`mu ${tone} ${big ? "big" : ""}`} title={title}>
      <b>
        {t.w}V {t.l}D
      </b>
      <i>{pct} %</i>
      <small>
        {t.n} partie{t.n > 1 ? "s" : ""}
      </small>
    </span>
  );
}
