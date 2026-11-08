/* Pure deterministic rules. No DOM, I/O or hidden-information bot access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object") module.exports = api;
  else root.VahtaEngine = api;
})(globalThis, function () {
  "use strict";
  const SUITS = ["♠", "♥", "♦", "♣"],
    RANKS = ["6", "7", "8", "9", "10", "В", "Д", "К", "Т"];
  const card = (id) => ({ id, suit: Math.floor(id / 9), rank: (id % 9) + 6 });
  const ordinary = (x) => Number.isInteger(x) && x >= 0 && x < 36;
  function random(s) {
    let t = (s.rng += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    s.rng = s.rng >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(s, a) {
    for (let i = a.length - 1; i > 0; i--) {
      let j = Math.floor(random(s) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function beats(a, b, trump) {
    a = card(a);
    b = card(b);
    return a.suit === b.suit
      ? a.rank > b.rank
      : a.suit === trump && b.suit !== trump;
  }
  const active = (s) =>
    s.players.map((p, i) => (!p.out ? i : -1)).filter((i) => i >= 0);
  function next(s, i) {
    for (let k = 1; k <= s.players.length; k++) {
      let n = (i + k) % s.players.length;
      if (!s.players[n].out) return n;
    }
    return i;
  }
  function order(s, start) {
    const a = [];
    for (let k = 0; k < s.players.length; k++) {
      let i = (start + k) % s.players.length;
      if (!s.players[i].out) a.push(i);
    }
    return a;
  }
  const stockCount = (s) => s.deck.filter(ordinary).length;
  function log(s, text) {
    s.log.push(text);
    if (s.log.length > 120) s.log.shift();
  }
  function draw(s, i, count) {
    let got = 0;
    while (got < count && s.deck.length) {
      let c = s.deck.shift();
      if (ordinary(c)) {
        s.players[i].hand.push(c);
        got++;
      } else {
        s.pending.push(i);
        log(
          s,
          "Производственная необходимость: жетон для " + s.players[i].name,
        );
      }
    }
    return got;
  }
  function start(options = {}) {
    const n = options.count || 4;
    if (![2, 3, 4].includes(n)) throw Error("Участников должно быть 2–4");
    const names = options.names || ["Вахтовик", "Палыч", "Санёк", "Артём"];
    const s = {
      version: 1,
      rng: (Number(options.seed) || Date.now()) >>> 0,
      options: {
        variant: options.variant === "transfer" ? "transfer" : "standard",
        chaos: !!options.chaos,
        frequency: options.frequency || "normal",
        difficulty: options.difficulty || "medium",
      },
      players: Array.from({ length: n }, (_, i) => ({
        name: names[i] || "Вахтовик",
        npc: options.npcs?.[i] ?? i - 1,
        hand: [],
        out: false,
        skip: 0,
      })),
      deck: [],
      discard: [],
      effectDiscard: [],
      table: [],
      phase: "dealing",
      actor: 0,
      attacker: 0,
      defender: 1,
      origin: 0,
      limit: 6,
      passed: [],
      taking: false,
      pending: [],
      eventDeck: [],
      eventDiscard: [],
      event: null,
      round: 0,
      log: [],
      sequence: 0,
      finished: false,
      result: null,
      metrics: { events: [], successfulDefenses: [], skips: 0, actions: 0 },
      transition: ["setup", "dealing"],
    };
    s.deck = shuffle(
      s,
      Array.from({ length: 36 }, (_, i) => i),
    );
    for (let r = 0; r < 6; r++) for (let i = 0; i < n; i++) draw(s, i, 1);
    s.trumpCard = s.deck.at(-1);
    s.trump = card(s.trumpCard).suit;
    let low = 15,
      first = 0;
    s.players.forEach((p, i) =>
      p.hand.forEach((c) => {
        if (card(c).suit === s.trump && card(c).rank < low) {
          first = i;
          low = card(c).rank;
        }
      }),
    );
    if (s.options.chaos) {
      let count = { rare: 2, normal: 4, mad: 6 }[s.options.frequency] || 4;
      for (let i = 0; i < count; i++) {
        let at = Math.floor(random(s) * Math.max(1, s.deck.length - 1));
        s.deck.splice(at, 0, "@" + i);
      }
      s.eventDeck = Array.from({ length: 30 }, (_, i) => ({
        i,
        key:
          -Math.log(Math.max(1e-10, random(s))) /
          ([5, 14, 29].includes(i) ? 0.18 : 1),
      }))
        .sort((a, b) => a.key - b.key)
        .map((x) => x.i);
    }
    s.startedSeed = options.seed ?? null;
    s.gameId = "vahta-" + s.rng + "-" + s.players.map((p) => p.npc).join("-");
    newRound(s, first);
    invariant(s);
    return s;
  }
  function newRound(s, candidate) {
    s.transition = ["next_round", "attacking"];
    s.round++;
    s.table = [];
    s.passed = [];
    s.taking = false;
    if (s.players[candidate].out) candidate = next(s, candidate);
    // Every skip consumes one attack opportunity. Bound by the finite flags, not a forced game end.
    let remaining =
      s.players.reduce((a, p) => a + p.skip, 0) + s.players.length;
    while (s.players[candidate].skip > 0 && remaining-- > 0) {
      s.players[candidate].skip--;
      s.metrics.skips++;
      log(
        s,
        s.players[candidate].name +
          " пропускает атаку, но продолжает защищаться",
      );
      candidate = next(s, candidate);
    }
    s.attacker = s.origin = s.actor = candidate;
    s.defender = next(s, candidate);
    s.limit = Math.min(6, s.players[s.defender].hand.length);
    s.phase = "attacking";
    log(
      s,
      "Раунд " +
        s.round +
        ": " +
        s.players[candidate].name +
        " → " +
        s.players[s.defender].name,
    );
  }
  function adders(s) {
    return order(s, s.attacker).filter((i) => i !== s.defender);
  }
  function canAdd(s, c) {
    return (
      s.table.length < s.limit &&
      (s.table.length === 0 ||
        s.table.some(
          (p) =>
            card(p.attack).rank === card(c).rank ||
            (p.defense != null && card(p.defense).rank === card(c).rank),
        ))
    );
  }
  function legal(s, who = s.actor) {
    if (s.finished || who !== s.actor || s.phase === "event") return [];
    const hand = s.players[who]?.hand || [],
      a = [];
    if (["attacking", "adding", "taking"].includes(s.phase)) {
      for (const c of hand)
        if (canAdd(s, c)) a.push({ type: "attack", card: c });
      if (s.phase !== "attacking") a.push({ type: "pass" });
    }
    if (s.phase === "defending") {
      for (let pair = 0; pair < s.table.length; pair++)
        if (s.table[pair].defense == null)
          for (const c of hand)
            if (beats(c, s.table[pair].attack, s.trump))
              a.push({ type: "defend", card: c, pair });
      a.push({ type: "take" });
      if (
        s.options.variant === "transfer" &&
        s.table.every((p) => p.defense == null)
      ) {
        const to = next(s, who),
          n = s.table.length + 1;
        if (
          to !== who &&
          n <= 6 &&
          n <= s.players[to].hand.length &&
          s.table.every(
            (p) => card(p.attack).rank === card(s.table[0].attack).rank,
          )
        )
          for (const c of hand)
            if (card(c).rank === card(s.table[0].attack).rank)
              a.push({ type: "transfer", card: c });
      }
    }
    return a;
  }
  function validation(s, who, a) {
    if (!a || typeof a.type !== "string") return "Неизвестное действие";
    if (who !== s.actor) return "Сейчас ход другого участника";
    if (
      !legal(s, who).some(
        (b) => b.type === a.type && b.card === a.card && b.pair === a.pair,
      )
    )
      return "Ход невозможен: проверьте масть, достоинство, лимит и текущую роль";
    return null;
  }
  function remove(s, i, c) {
    const at = s.players[i].hand.indexOf(c);
    if (at < 0) throw Error("Карты нет в руке");
    return s.players[i].hand.splice(at, 1)[0];
  }
  function retire(s) {
    if (stockCount(s) === 0)
      for (const p of s.players) if (!p.hand.length) p.out = true;
  }
  function endIf(s) {
    const live = active(s);
    if (live.length > 1) return false;
    s.finished = true;
    s.phase = "game_over";
    s.actor = -1;
    s.result = {
      loser: live[0] ?? null,
      draw: live.length === 0,
      escaped: s.players.map((p, i) => (p.out ? i : -1)).filter((i) => i >= 0),
      rounds: s.round,
    };
    log(
      s,
      live.length
        ? "Дурак партии — " + s.players[live[0]].name
        : "Ничья: никто не остался с картами",
    );
    return true;
  }
  function beginEvent(s) {
    if (!s.pending.length) return false;
    const recipient = s.pending.shift();
    if (!s.eventDeck.length) {
      s.eventDeck = shuffle(s, s.eventDiscard.splice(0));
      if (s.eventDeck[0] === s.lastEvent && s.eventDeck.length > 1)
        [s.eventDeck[0], s.eventDeck[1]] = [s.eventDeck[1], s.eventDeck[0]];
    }
    const id = s.eventDeck.shift();
    s.event = { id, recipient };
    s.phase = "event";
    s.actor = recipient;
    s.transition.push("event_resolution");
    return true;
  }
  function resolve(s) {
    const defender = s.defender;
    s.transition = ["round_resolution"];
    const all = s.table.flatMap((p) =>
      p.defense == null ? [p.attack] : [p.attack, p.defense],
    );
    if (s.taking) {
      s.players[defender].hand.push(...all);
      log(s, s.players[defender].name + " берёт " + all.length + " карт");
    } else {
      s.discard.push(...all);
      s.metrics.successfulDefenses.push(defender);
      log(s, "Бито: " + s.players[defender].name + " отбился");
    }
    s.table = [];
    s.transition.push("replenishment");
    const q = order(s, s.origin).filter((i) => i !== defender);
    q.push(defender);
    for (const i of q)
      if (!s.players[i].out)
        draw(s, i, Math.max(0, 6 - s.players[i].hand.length));
    s.nextCandidate = s.taking ? next(s, defender) : defender;
    retire(s);
    if (beginEvent(s)) return;
    if (endIf(s)) return;
    newRound(s, s.nextCandidate);
  }
  function chooseAdder(s) {
    const candidates = adders(s).filter(
      (i) => !s.passed.includes(i) && s.players[i].hand.length > 0,
    );
    if (s.table.length >= s.limit || !candidates.length) {
      resolve(s);
      return;
    }
    s.actor = candidates[0];
    s.phase = s.taking ? "taking" : "adding";
  }
  function apply(s, who, a) {
    const error = validation(s, who, a);
    if (error) return { ok: false, error };
    s.sequence++;
    s.metrics.actions++;
    const name = s.players[who].name;
    switch (a.type) {
      case "attack":
        remove(s, who, a.card);
        s.table.push({ attack: a.card, defense: null, from: who });
        s.passed = [];
        log(
          s,
          name +
            " " +
            (s.table.length > 1 ? "подкидывает " : "атакует ") +
            label(a.card),
        );
        if (s.taking) {
          s.actor = who;
          chooseAdder(s);
        } else {
          s.actor = s.defender;
          s.phase = "defending";
        }
        break;
      case "defend":
        remove(s, who, a.card);
        s.table[a.pair].defense = a.card;
        log(s, name + " покрывает " + label(a.card));
        if (s.table.every((p) => p.defense != null)) chooseAdder(s);
        break;
      case "transfer":
        remove(s, who, a.card);
        s.table.push({ attack: a.card, defense: null, from: who });
        s.attacker = who;
        s.defender = next(s, who);
        s.limit = Math.min(6, s.players[s.defender].hand.length);
        s.actor = s.defender;
        s.passed = [];
        log(s, name + " переводит на " + s.players[s.defender].name);
        break;
      case "take":
        s.taking = true;
        s.passed = [];
        log(s, name + " решил взять. Подкидывание ещё открыто");
        chooseAdder(s);
        break;
      case "pass":
        s.passed.push(who);
        chooseAdder(s);
        break;
    }
    invariant(s);
    return { ok: true };
  }
  function label(c) {
    const x = card(c);
    return RANKS[x.rank - 6] + SUITS[x.suit];
  }
  // Safe knowledge object: future stock and other hands are absent, not merely ignored.
  function observation(s, who = s.actor) {
    return {
      sequence: s.sequence,
      round: s.round,
      who,
      defender: s.defender,
      attacker: s.attacker,
      hand: s.players[who].hand.slice(),
      trump: s.trump,
      table: structuredClone(s.table),
      counts: s.players.map((p) => p.hand.length),
      out: s.players.map((p) => p.out),
      publicDiscard: s.discard.slice(),
      stock: stockCount(s),
      phase: s.phase,
      legal: legal(s, who),
      difficulty: s.options.difficulty,
      temperament: s.players[who].npc,
    };
  }
  function bot(v) {
    if (!v.legal.length) return null;
    const cost = (c) => card(c).rank + (card(c).suit === v.trump ? 20 : 0);
    const score = (a) => {
      if (a.type === "pass") return 1000;
      if (a.type === "take") return 900;
      if (a.type === "transfer") return -10 + cost(a.card) / 10;
      let value = cost(a.card);
      let h =
        Math.imul(a.card + 1, 2654435761) ^
        Math.imul(v.sequence + 1, 1597334677);
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      const variation = ((h ^ (h >>> 13)) >>> 0) / 4294967296;
      if (v.difficulty === "easy" || v.round > 100) value = variation * 40;
      else value += variation * 2;
      if (v.difficulty === "hard") {
        const matching = v.hand.filter(
          (c) => card(c).rank === card(a.card).rank,
        ).length;
        value -= matching * 2;
        if (v.stock === 0) value -= card(a.card).rank * 0.7;
        const seen = v.publicDiscard.filter(
          (c) =>
            card(c).suit === card(a.card).suit &&
            card(c).rank > card(a.card).rank,
        ).length;
        value -= seen * 0.4;
      }
      if (
        a.type === "attack" &&
        v.phase !== "attacking" &&
        card(a.card).suit === v.trump &&
        v.hand.length > 2
      ) {
        value += 60;
        if (v.difficulty !== "easy" && v.stock > 0) return 1100;
      }
      if (v.temperament === 0 && card(a.card).suit === v.trump) value += 6;
      if (v.temperament === 1 && a.type === "attack")
        value -= v.counts[v.defender] <= 3 ? 8 : 3;
      if (v.temperament === 2 && v.stock < 6) value -= card(a.card).rank * 0.35;
      if (v.temperament === 3 && a.type === "attack")
        value -= card(a.card).rank * 0.6;
      if (v.temperament === 4)
        value -=
          v.hand.filter((c) => card(c).rank === card(a.card).rank).length * 1.5;
      // Public-information occupational temperaments; no access to hidden hands.
      if (v.temperament === 6 && a.type === "attack")
        value -=
          v.hand.filter((c) => card(c).rank === card(a.card).rank).length * 2;
      if (v.temperament === 7 && card(a.card).suit === v.trump) value += 9;
      if (v.temperament === 8 && a.type === "defend")
        value += card(a.card).suit === v.trump ? 7 : -2;
      if (v.temperament === 9 && a.type === "attack")
        value -= v.counts[v.defender] < 3 ? 10 : 2;
      if (v.temperament === 10 && v.stock === 0)
        value -= card(a.card).rank * 0.5;
      return value;
    };
    return v.legal.slice().sort((a, b) => score(a) - score(b))[0];
  }
  function invariant(s) {
    const cards = [
      ...s.deck.filter(ordinary),
      ...s.players.flatMap((p) => p.hand),
      ...s.discard,
      ...s.effectDiscard,
      ...s.table.flatMap((p) =>
        p.defense == null ? [p.attack] : [p.attack, p.defense],
      ),
    ];
    if (
      cards.length !== 36 ||
      new Set(cards).size !== 36 ||
      !cards.every(ordinary)
    )
      throw Error("Нарушен инвариант 36 карт");
    if (s.players.some((p) => p.out && p.hand.length))
      throw Error("Вышедшему вернули карты");
    if (s.table.length > s.limit) throw Error("Нарушен лимит подкидывания");
    return true;
  }
  function restore(raw) {
    const s = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    if (
      !s ||
      !s.options ||
      !["standard", "transfer"].includes(s.options.variant) ||
      !["easy", "medium", "hard"].includes(s.options.difficulty) ||
      !Array.isArray(s.deck) ||
      !Array.isArray(s.discard) ||
      !Array.isArray(s.effectDiscard) ||
      !Array.isArray(s.table) ||
      !Array.isArray(s.pending) ||
      !Array.isArray(s.eventDeck) ||
      !Array.isArray(s.eventDiscard) ||
      !Array.isArray(s.log) ||
      !s.metrics ||
      !Array.isArray(s.metrics.events) ||
      !Array.isArray(s.metrics.successfulDefenses)
    )
      throw Error("Неполная модель партии");
    if (
      !s.deck.every(
        (c) => ordinary(c) || (typeof c === "string" && /^@[0-5]$/.test(c)),
      ) ||
      new Set(s.deck).size !== s.deck.length ||
      s.table.some(
        (p) =>
          !p ||
          !ordinary(p.attack) ||
          (p.defense != null && !ordinary(p.defense)),
      ) ||
      s.log.some((t) => typeof t !== "string" || t.length > 2000) ||
      s.log.length > 200
    )
      throw Error("Повреждены зоны карт или журнал");
    if (
      !Number.isInteger(s.trump) ||
      s.trump < 0 ||
      s.trump > 3 ||
      !Number.isInteger(s.limit) ||
      s.limit < 0 ||
      s.limit > 6 ||
      !Number.isInteger(s.round) ||
      s.round < 1 ||
      !Number.isInteger(s.sequence) ||
      s.sequence < 0 ||
      typeof s.finished !== "boolean"
    )
      throw Error("Повреждены параметры раунда");
    if (
      !Array.isArray(s.players) ||
      s.players.some(
        (p) =>
          !p ||
          !Array.isArray(p.hand) ||
          typeof p.out !== "boolean" ||
          !Number.isInteger(p.skip) ||
          p.skip < 0 ||
          p.skip > 1 ||
          !Number.isInteger(p.npc) ||
          p.npc < -1 ||
          p.npc > 10,
      )
    )
      throw Error("Повреждены участники");
    const participant = (i) =>
      Number.isInteger(i) && i >= 0 && i < s.players.length;
    if (
      !participant(s.defender) ||
      !participant(s.attacker) ||
      !participant(s.origin) ||
      s.pending.some((i) => !participant(i)) ||
      [...s.eventDeck, ...s.eventDiscard].some(
        (i) => !Number.isInteger(i) || i < 0 || i >= 30,
      ) ||
      (s.phase === "event" &&
        (!s.event ||
          !participant(s.event.recipient) ||
          !Number.isInteger(s.event.id) ||
          s.event.id < 0 ||
          s.event.id >= 30)) ||
      (s.finished &&
        (!s.result ||
          typeof s.result.draw !== "boolean" ||
          (s.result.loser !== null && !participant(s.result.loser))))
    )
      throw Error("Повреждена очередь или результат");
    if (
      s.version !== 1 ||
      !Array.isArray(s.players) ||
      ![2, 3, 4].includes(s.players.length) ||
      !Number.isInteger(s.rng) ||
      ![
        "attacking",
        "defending",
        "adding",
        "taking",
        "event",
        "game_over",
      ].includes(s.phase)
    )
      throw Error("Неверный формат партии");
    if (s.players.some((p) => typeof p.name !== "string" || !validName(p.name)))
      throw Error("Неверное имя в партии");
    invariant(s);
    if (!s.finished && (s.actor < 0 || s.actor >= s.players.length))
      throw Error("Неверный ход");
    return s;
  }
  function validName(name) {
    return (
      typeof name === "string" &&
      /^[\p{L}]+(?:[\p{L} -]*[\p{L}])?$/u.test(name.trim()) &&
      name.trim().length >= 2 &&
      name.trim().length <= 24
    );
  }
  return {
    SUITS,
    RANKS,
    card,
    label,
    ordinary,
    random,
    shuffle,
    beats,
    active,
    next,
    order,
    stockCount,
    start,
    legal,
    validation,
    apply,
    draw,
    retire,
    endIf,
    beginEvent,
    newRound,
    remove,
    log,
    invariant,
    observation,
    bot,
    restore,
    validName,
  };
});

;
(function (root, factory) {
  const E =
    typeof module === "object" ? require("./engine.js") : root.VahtaEngine;
  const api = factory(E);
  if (typeof module === "object") module.exports = api;
  else root.VahtaEvents = api;
})(globalThis, function (E) {
  "use strict";
  const kinds = [
    "skip",
    "draw2",
    "give",
    "all",
    "give",
    "birthday",
    "discard",
    "draw",
    "all",
    "smallest",
    "swap",
    "swap_selected",
    "circle",
    "left",
    "birthday",
    "draw",
    "skip_target",
    "discard",
    "right",
    "none",
    "all",
    "give",
    "salary",
    "choice_kettle",
    "choice_yeti",
    "choice_excavator",
    "choice_complaint",
    "skip",
    "swap",
    "none",
  ];
  const command = {
    skip: "skip_next_attack",
    skip_target: "skip_next_attack",
    draw: "draw_cards",
    draw2: "draw_cards",
    give: "give_card",
    all: "all_draw",
    birthday: "take_from_all",
    discard: "discard_non_trump",
    smallest: "draw_smallest",
    swap: "swap_cards",
    swap_selected: "swap_cards",
    circle: "pass_clockwise_one",
    left: "give_card",
    right: "swap_cards",
    salary: "receive_random",
    choice_kettle: "choice",
    choice_yeti: "choice",
    choice_excavator: "choice",
    choice_complaint: "choice",
    none: "no_effect",
  };
  let content = [];
  function setContent(c) {
    content = c;
  }
  function spec(s) {
    if (s.phase !== "event" || !s.event) return null;
    const recipient = s.event.recipient,
      id = s.event.id,
      kind = kinds[id],
      self = s.players[recipient],
      targets = E.active(s).filter((i) => i !== recipient);
    let eligible = self.hand.slice(),
      needCard = [
        "give",
        "discard",
        "swap_selected",
        "left",
        "choice_excavator",
        "choice_complaint",
      ].includes(kind);
    if (kind === "discard")
      eligible = eligible.filter((c) => E.card(c).suit !== s.trump);
    const needTarget = [
      "give",
      "swap",
      "swap_selected",
      "skip_target",
      "choice_yeti",
      "choice_excavator",
      "choice_complaint",
    ].includes(kind);
    const choices =
      kind === "choice_kettle"
        ? [
            ["draw", "Взять 1 карту"],
            ["skip", "Пропустить следующую атаку"],
          ]
        : kind === "choice_yeti"
          ? [
              ["swap", "Обменяться случайными картами"],
              ["none", "Не вмешиваться"],
            ]
          : kind === "choice_excavator"
            ? [
                ["draw2", "Взять до 2 карт"],
                ["give", "Отдать 1 карту"],
              ]
            : kind === "choice_complaint"
              ? [
                  ["give", "Отдать 1 карту"],
                  ["draw2", "Взять до 2 карт"],
                ]
              : [];
    return {
      id,
      kind,
      recipient,
      targets,
      eligible,
      needCard,
      needTarget,
      choices,
      cancelled: self.out,
      content: content[id],
    };
  }
  function eventAction(s, a = {}) {
    const v = spec(s);
    if (!v) return { ok: false, error: "Сейчас нет происшествия" };
    let kind = v.kind;
    if (v.choices.length) {
      if (!v.choices.some((c) => c[0] === a.choice))
        return { ok: false, error: "Выберите вариант распоряжения" };
      kind = a.choice;
    }
    const needCard = ["give", "discard", "swap_selected", "left"].includes(
        kind,
      ),
      needTarget = ["give", "swap", "swap_selected", "skip_target"].includes(
        kind,
      );
    const canTarget = v.targets.length > 0;
    const available =
      kind === "discard"
        ? s.players[v.recipient].hand.filter((c) => E.card(c).suit !== s.trump)
        : s.players[v.recipient].hand;
    if (
      !v.cancelled &&
      needCard &&
      available.length &&
      !available.includes(a.card)
    )
      return { ok: false, error: "Выберите свою подходящую карту" };
    if (
      !v.cancelled &&
      needTarget &&
      canTarget &&
      !v.targets.includes(a.target)
    )
      return { ok: false, error: "Выберите активного соперника" };
    const effects = [], outBefore = s.players.map(p=>p.out);
    const before = s.players.map((p) => p.hand.length),
      who = v.recipient,
      hand = s.players[who].hand;
    const pick = (i) =>
      s.players[i].hand.length
        ? s.players[i].hand[Math.floor(E.random(s) * s.players[i].hand.length)]
        : null;
    const move = (from, to, c) => {
      if (c == null || from === to || s.players[from].out || s.players[to].out)
        return;
      E.remove(s, from, c);
      s.players[to].hand.push(c);
      effects.push({type:"card",card:c,from,to});
    };
    const swap = (i, j, c) => {
      if (j == null || s.players[j].out || s.players[i].out) return;
      const d = pick(j);
      if (c == null || d == null) return;
      E.remove(s, i, c);
      E.remove(s, j, d);
      s.players[i].hand.push(d);
      s.players[j].hand.push(c);
      effects.push({type:"card",card:c,from:i,to:j},{type:"card",card:d,from:j,to:i});
    };
    const draw = (i, n) => {
      let got = 0;
      while (got < n) {
        let at = s.deck.findIndex(E.ordinary);
        if (at < 0) break;
        const c=s.deck.splice(at, 1)[0];
        s.players[i].hand.push(c);
        effects.push({type:"card",card:c,from:"stock",to:i});
        got++;
      }
      if (!got)
        E.log(s, "Карты закончились, распоряжение начальства недействительно");
    };
    if (!v.cancelled) {
      switch (kind) {
        case "skip":
          s.players[who].skip = 1;
          effects.push({type:"skip",seat:who});
          break;
        case "skip_target":
          if (canTarget) {s.players[a.target].skip = 1;effects.push({type:"skip",seat:a.target});}
          break;
        case "draw":
          draw(who, 1);
          break;
        case "draw2":
          draw(who, 2);
          break;
        case "give":
          if (canTarget && hand.length) move(who, a.target, a.card);
          break;
        case "discard":
          if (available.length) {
            E.remove(s, who, a.card);
            s.effectDiscard.push(a.card);
            effects.push({type:"card",card:a.card,from:who,to:"effectDiscard"});
          }
          break;
        case "all":
          for (const i of E.order(s, who)) draw(i, 1);
          break;
        case "birthday":
          for (const i of v.targets) move(i, who, pick(i));
          break;
        case "salary":
          if (canTarget) {
            const from = v.targets[Math.floor(E.random(s) * v.targets.length)];
            move(from, who, pick(from));
          }
          break;
        case "smallest": {
          const live = E.active(s),
            min = Math.min(...live.map((i) => s.players[i].hand.length)),
            t = live.filter((i) => s.players[i].hand.length === min);
          if (t.length) draw(t[Math.floor(E.random(s) * t.length)], 2);
          break;
        }
        case "left":
          if (canTarget && hand.length) move(who, E.next(s, who), a.card);
          break;
        case "right": {
          const q = E.order(s, who);
          if (canTarget) swap(who, q.at(-1), pick(who));
          break;
        }
        case "swap":
          if (canTarget) swap(who, a.target, pick(who));
          break;
        case "swap_selected":
          if (canTarget) swap(who, a.target, a.card);
          break;
        case "circle": {
          const ids = E.active(s),
            cards = ids.map((i) => pick(i));
          cards.forEach((c, k) => {
            if (c != null) E.remove(s, ids[k], c);
          });
          cards.forEach((c, k) => {
            if (c != null) {
              const to=ids[(k+1)%ids.length];
              s.players[to].hand.push(c);
              effects.push({type:"card",card:c,from:ids[k],to});
            }
          });
          break;
        }
        case "none":
          break;
        default:
          throw Error("Незарегистрированный эффект");
      }
    }
    if(!effects.length) effects.push({type:"noop",seat:who,reason:v.cancelled?"cancelled":(["draw","draw2","all","smallest"].includes(kind)?"empty-stock":kind==="none"?"none":"unavailable")});
    s.sequence++;
    s.metrics.events.push({
      id: v.id,
      recipient: who,
      cancelled: v.cancelled,
      delta: s.players[who].hand.length - before[who],
    });
    s.eventDiscard.push(v.id);
    s.lastEvent = v.id;
    E.log(
      s,
      (content[v.id]?.title || "Происшествие") +
        (v.cancelled
          ? " — отменено: участник уже вышел"
          : ": " +
            s.players
              .map(
                (p, i) =>
                  p.name +
                  " " +
                  (p.hand.length - before[i] >= 0 ? "+" : "") +
                  (p.hand.length - before[i]),
              )
              .join(", ")),
    );
    s.event = null;
    E.retire(s);
    if (E.active(s).length <= 1 && E.beginEvent(s)) {
    } else if (!E.endIf(s)) E.newRound(s, s.nextCandidate);
    E.invariant(s);
    s.players.forEach((p,i)=>{if(p.out&&!outBefore[i])effects.push({type:"out",seat:i});});
    return { ok: true, effects, event: {id:v.id,recipient:who,kind,cancelled:v.cancelled} };
  }
  function botEvent(s) {
    const v = spec(s);
    let choice = v.choices[0]?.[0];
    if (v.kind === "choice_yeti") choice = "none";
    if (v.kind === "choice_excavator" || v.kind === "choice_complaint")
      choice = v.eligible.length && v.targets.length ? "give" : "draw2";
    if (v.kind === "choice_kettle")
      choice = E.stockCount(s) > 0 ? "skip" : "draw";
    const target = v.targets
      .slice()
      .sort((a, b) => s.players[a].hand.length - s.players[b].hand.length)[0];
    const c = v.eligible
      .slice()
      .sort((a, b) => E.card(b).rank - E.card(a).rank)[0];
    return { choice, target, card: c };
  }
  return { kinds, command, setContent, spec, eventAction, botEvent };
});

;
(function (root, factory) {
  const E =
    typeof module === "object" ? require("./engine.js") : root.VahtaEngine;
  const api = factory(E);
  if (typeof module === "object") module.exports = api;
  else root.VahtaSave = api;
})(globalThis, function (E) {
  const KEY = "durak-vahta-v1";
  function fresh() {
    return {
      version: 1,
      name: "",
      avatar: 5,
      xp: 0,
      back: 0,
      achievements: [],
      completed: [],
      lossBanter: null,
      stats: {
        classic: {
          played: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          streak: 0,
          best: 0,
        },
        chaos: { played: 0, wins: 0, losses: 0, draws: 0, streak: 0, best: 0 },
      },
      settings: {
        humor: "full",
        dialogs: "normal",
        music: 0.16,
        sfx: 0.6,
        fast: false,
        reduced: false,
      },
      game: null,
    };
  }
  function validate(raw) {
    if (!raw || raw.version !== 1) throw Error("Неизвестная версия сохранения");
    const p = fresh();
    if (raw.name && !E.validName(raw.name)) throw Error("Неверное имя");
    p.name = (raw.name || "").trim();
    p.avatar =
      Number.isInteger(raw.avatar) && raw.avatar >= 0 && raw.avatar <= 10
        ? raw.avatar
        : 5;
    p.xp = Number.isFinite(raw.xp) && raw.xp >= 0 ? Math.min(raw.xp, 1e8) : 0;
    p.achievements = Array.isArray(raw.achievements)
      ? raw.achievements.filter((x) =>
          ["palych", "north", "early", "inventory", "tea", "eternal"].includes(
            x,
          ),
        )
      : [];
    p.completed = Array.isArray(raw.completed)
      ? raw.completed.filter((x) => typeof x === "string").slice(-100)
      : [];
    const banter = raw.lossBanter;
    if (banter && typeof banter.gameId === "string" && banter.gameId.length <= 160 &&
      Number.isInteger(banter.choice) && banter.choice >= 0 && banter.choice < 100) {
      p.lossBanter = {gameId:banter.gameId, choice:banter.choice,
        remaining:[...new Set(Array.isArray(banter.remaining) ? banter.remaining : [])]
          .filter(i=>Number.isInteger(i) && i >= 0 && i < 100).slice(0,100)};
    }
    p.back = raw.back === 1 && p.achievements.length > 0 ? 1 : 0;
    for (const mode of ["classic", "chaos"])
      for (const field in p.stats[mode]) {
        const v = raw.stats?.[mode]?.[field];
        p.stats[mode][field] = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
      }
    for (const k of ["music", "sfx"])
      if (Number.isFinite(raw.settings?.[k]))
        p.settings[k] = Math.min(1, Math.max(0, raw.settings[k]));
    for (const k of ["fast", "reduced"])
      p.settings[k] = raw.settings?.[k] === true;
    if (["full", "moderate", "clean"].includes(raw.settings?.humor))
      p.settings.humor = raw.settings.humor;
    if (["off", "rare", "normal"].includes(raw.settings?.dialogs))
      p.settings.dialogs = raw.settings.dialogs;
    if (raw.game != null) p.game = E.restore(raw.game);
    return p;
  }
  function load(storage) {
    try {
      const v = storage.getItem(KEY);
      if (!v) return { profile: fresh(), warning: null };
      return { profile: validate(JSON.parse(v)), warning: null };
    } catch {
      try {
        const v = storage.getItem(KEY + "-backup");
        if (v)
          return {
            profile: validate(JSON.parse(v)),
            warning: "Восстановлена резервная копия.",
          };
      } catch {}
      return {
        profile: fresh(),
        warning:
          "Сохранение недоступно или повреждено. Можно импортировать резервную копию.",
      };
    }
  }
  function write(storage, p) {
    try {
      const json = JSON.stringify(p);
      storage.setItem(KEY, json);
      storage.setItem(KEY + "-backup", json);
      return true;
    } catch {
      return false;
    }
  }
  const achievements = [
    [
      "palych",
      "Палыч одобряет",
      "Победить на сложности «Палыч» с Палычем за столом.",
    ],
    [
      "north",
      "Северный характер",
      "Победить в беспределе и пережить хотя бы одно происшествие.",
    ],
    ["early", "Досрочная межвахта", "Успешно сбросить карту через событие №7."],
    ["inventory", "Инвентаризация завершена", "Получить карты от события №2."],
    ["tea", "Чайник не остыл", "Победить не более чем за 12 раундов."],
    ["eternal", "Вечная вахта", "Победить после получения карт в событии №15."],
  ];
  function finish(p, s) {
    const id = s.gameId || "seed-" + s.startedSeed + "-" + s.rng;
    if (!s.finished || p.completed.includes(id)) return [];
    p.completed.push(id);
    p.completed = p.completed.slice(-100);
    const st = p.stats[s.options.chaos ? "chaos" : "classic"],
      draw = s.result.draw,
      win = !draw && s.result.loser !== 0;
    st.played++;
    if (draw) {
      st.draws++;
      st.streak = 0;
    } else if (win) {
      st.wins++;
      st.streak++;
      st.best = Math.max(st.best, st.streak);
    } else {
      st.losses++;
      st.streak = 0;
    }
    p.xp += win ? 120 : draw ? 60 : 35;
    const events = s.metrics.events.filter(
        (e) => e.recipient === 0 && !e.cancelled,
      ),
      conditions = {
        palych:
          win &&
          s.options.difficulty === "hard" &&
          s.players.some((x) => x.npc === 0),
        north: win && s.options.chaos && events.length > 0,
        early: events.some((e) => e.id === 6 && e.delta < 0),
        inventory: events.some((e) => e.id === 1 && e.delta > 0),
        tea: win && s.round <= 12,
        eternal: win && events.some((e) => e.id === 14 && e.delta > 0),
      };
    const unlocked = [];
    for (const [k] of achievements)
      if (conditions[k] && !p.achievements.includes(k)) {
        p.achievements.push(k);
        unlocked.push(k);
      }
    return unlocked;
  }
  function rank(xp) {
    return xp < 200
      ? "Салага"
      : xp < 600
        ? "Вахтовик"
        : xp < 1500
          ? "Бывалый"
          : xp < 3000
            ? "Бригадир"
            : "Легенда Севера";
  }
  return { KEY, fresh, validate, load, write, finish, rank, achievements };
});

;
(function (root) {
  const data = [
    {
      id: 0,
      title: "Дежурство по бытовке",
      story:
        "Начальник назначил дежурным после того, как на потолке нашли макароны.",
      effect: "Адресат пропускает следующую возможность начать атаку.",
      art: 0,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 1,
      title: "Инвентаризация, мать её",
      story: "Сапог по бумагам 302, в жизни 300, а виноват почему-то ты.",
      effect: "Адресат берёт до 2 карт из доборной колоды.",
      art: 1,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 2,
      title: "Премия 500 рублей",
      story: "«Не трать всё за один раз», — заботливо сказал начальник.",
      effect: "Адресат отдаёт выбранному активному сопернику 1 свою карту.",
      art: 2,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 3,
      title: "Метель охуела",
      story: "По прогнозу снег, по факту Палычу сдуло валенки.",
      effect: "Все активные игроки берут по 1 карте.",
      art: 3,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 4,
      title: "Складская пересортица",
      story: "Вместо каски выдали дуршлаг, но по накладной всё правильно.",
      effect: "Адресат отдаёт активному сопернику 1 свою карту.",
      art: 4,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 5,
      title: "День рождения в бытовке",
      story: "Коллеги дарят имениннику не деньги, а свои проблемы.",
      effect:
        "Каждый другой активный игрок передаёт адресату 1 случайную карту, если есть.",
      art: 5,
      category: "production",
      rarity: "rare",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 6,
      title: "Досрочная межвахта",
      story: "Отдел кадров потерял фамилию, и тебя целый день никто не искал.",
      effect: "Адресат сбрасывает 1 выбранную некозырную карту.",
      art: 6,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 7,
      title: "Вахтовка не завелась",
      story: "Санёк шестой час объясняет стартеру, кто тут главный.",
      effect: "Адресат берёт 1 карту; если сток пуст, ничего.",
      art: 7,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 8,
      title: "Проверка охраны труда",
      story: "Карты без каски? Нарушение, блядь, третьей категории.",
      effect: "Все активные игроки берут по 1 карте.",
      art: 8,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 9,
      title: "Приехал генеральный",
      story: "«Почему у этого работника карт меньше, чем у остальных?»",
      effect:
        "Активный участник с наименьшей рукой берёт до 2 карт (при равенстве случайный).",
      art: 9,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 10,
      title: "Перевод в другую бригаду",
      story: "Электрик теперь сварщик, а сварщик в документах в отпуске.",
      effect:
        "Адресат обменивается 1 случайной картой с выбранным активным игроком.",
      art: 10,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 11,
      title: "Рукавицы Палыча",
      story: "В рукавицах нашли чужой козырь, но рукавицы никто не признаёт.",
      effect: "Обменять 1 выбранную карту адресата на 1 случайную соперника.",
      art: 11,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 12,
      title: "Валера вырубил свет",
      story: "«Ща починю» — и исчезло электричество во всём посёлке.",
      effect:
        "Все активные игроки передают 1 случайную карту соседу слева одновременно.",
      art: 12,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 13,
      title: "Срочно занести холодильник",
      story: "Палыч позвал помочь, а сам ушёл на перекур.",
      effect: "Адресат отдаёт 1 свою карту игроку слева, если доступно.",
      art: 13,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 14,
      title: "Вечная вахта 365/0",
      story: "Ты подписал приказ, который ещё вчера был календарём.",
      effect:
        "Адресат берёт по 1 случайной карте у каждого другого активного участника. Редкая, потенциально вредная карта.",
      art: 14,
      category: "production",
      rarity: "rare",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 15,
      title: "Нормировщик проснулся",
      story: "Норматив пересчитали так, что от старого остался один мат.",
      effect: "Адресат берёт до 1 карты из стока.",
      art: 15,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 16,
      title: "Сварщик закрыл глаза",
      story: "Шов идеальный, только дверь случайно заварили.",
      effect: "Выбранный активный соперник пропускает следующую атаку.",
      art: 16,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 17,
      title: "Аванс растворился",
      story: "Денег хватило на чай и одно печенье с надкусанным углом.",
      effect: "Адресат сбрасывает 1 некозырную карту, если есть.",
      art: 17,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 18,
      title: "Ключи от КамАЗа",
      story: "Ключи нашлись в холодильнике, где вчера была колбаса.",
      effect: "Адресат меняет 1 случайную карту с игроком справа.",
      art: 18,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 19,
      title: "Начальник обещал отпуск",
      story: "Обещание было настолько убедительным, что календарь засмеялся.",
      effect: "`no_effect`: только шутка.",
      art: 19,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 20,
      title: "Обед по талонам",
      story: "Борщ отменили, но ложки велели сдать по ведомости.",
      effect: "Все берут по 1 карте, если есть.",
      art: 20,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 21,
      title: "Потерянная каска",
      story: "Каску ищут трое суток, она всё время у тебя на голове.",
      effect: "Адресат отдаёт 1 выбранную карту выбранному сопернику.",
      art: 21,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 22,
      title: "Зарплата пришла!",
      story: "Сначала радость. Потом смс с размером. Потом тишина.",
      effect:
        "Случайный соперник отдаёт адресату 1 карту, если есть (вредный сюрприз).",
      art: 22,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 23,
      title: "Техосмотр чайника",
      story:
        "Чайник требует допуск, журнал инструктажа и подпись главного инженера.",
      effect: "Адресат выбирает: взять 1 карту ИЛИ пропустить следующую атаку.",
      art: 23,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 24,
      title: "Снежный человек на КПП",
      story:
        "Охранник пустил его по пропуску, потому что тот «из подрядчиков».",
      effect:
        "Адресат выбирает: обменяться случайными картами с соперником ИЛИ ничего не делать.",
      art: 24,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 25,
      title: "Экскаватор ушёл в отпуск",
      story: "Машина отказалась работать, пока ей не купят термос.",
      effect:
        "Адресат выбирает: взять 2 карты ИЛИ отдать 1 выбранную сопернику.",
      art: 25,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 26,
      title: "Коллективная жалоба",
      story: "Все подписались, но фамилию организатора указали только твою.",
      effect:
        "Адресат выбирает: отдать 1 карту сопернику ИЛИ взять 2 из стока.",
      art: 26,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 27,
      title: "Внеплановая ревизия души",
      story: "У кладовщика недостача терпения: по документам минус восемь лет.",
      effect: "Адресат пропускает следующую атаку.",
      art: 27,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 28,
      title: "Чай с начальником",
      story: "Начальник пришёл «просто поговорить», а ушёл с твоими выходными.",
      effect:
        "Адресат обменивается по одной случайной карте с выбранным соперником.",
      art: 28,
      category: "production",
      rarity: "common",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
    {
      id: 29,
      title: "Северное сияние над сортиром",
      story: "Палыч уверяет, что это знак большой премии. Бухгалтерия молчит.",
      effect: "`no_effect`, красивая редкая юмористическая анимация.",
      art: 29,
      category: "production",
      rarity: "rare",
      voiceCue: "event",
      safeFallback: "Отменено по производственной необходимости",
    },
  ];
  const kinds = [
    "skip",
    "draw2",
    "give",
    "all",
    "give",
    "birthday",
    "discard",
    "draw",
    "all",
    "smallest",
    "swap",
    "swap_selected",
    "circle",
    "left",
    "birthday",
    "draw",
    "skip_target",
    "discard",
    "right",
    "none",
    "all",
    "give",
    "salary",
    "choice_kettle",
    "choice_yeti",
    "choice_excavator",
    "choice_complaint",
    "skip",
    "swap",
    "none",
  ];
  const types = {
    skip: "skip_next_attack",
    skip_target: "skip_next_attack",
    draw: "draw_cards",
    draw2: "draw_cards",
    give: "give_card",
    all: "all_draw",
    birthday: "take_from_all",
    discard: "discard_non_trump",
    smallest: "draw_smallest",
    swap: "swap_cards",
    swap_selected: "swap_cards",
    circle: "pass_clockwise_one",
    left: "give_card",
    right: "swap_cards",
    salary: "receive_random",
    choice_kettle: "choice",
    choice_yeti: "choice",
    choice_excavator: "choice",
    choice_complaint: "choice",
    none: "no_effect",
  };
  data.forEach((e, i) => {
    e.effectType = types[kinds[i]];
    e.effectArgs = { count: kinds[i] === "draw2" ? 2 : 1, kind: kinds[i] };
    e.targetPolicy = "trigger_recipient";
  });
  if (typeof module === "object") module.exports = data;
  else root.VahtaEventCards = data;
})(globalThis);

;
(function (root) {
  "use strict";
  const data = {
    NPC: [
      {
        id: 0,
        name: "Палыч",
        job: "Старший по бытовке",
        style: "Козыри бережёт. Слов не бережёт.",
        temper: "Осторожный",
      },
      {
        id: 1,
        name: "Санёк",
        job: "Водитель вахтовки",
        style: "Подкидывает карты и поводы поржать.",
        temper: "Напористый",
      },
      {
        id: 2,
        name: "Артём",
        job: "Монтажник",
        style: "Леса соберёт. Козыри — как повезёт.",
        temper: "Упрямый",
      },
      {
        id: 3,
        name: "Димон",
        job: "Сварщик-монтажник",
        style: "Варит намертво. Играет на характере.",
        temper: "Рискованный",
      },
      {
        id: 4,
        name: "Тамара Петровна",
        job: "Заведующая складом",
        style: "Все карты по накладной. Дурак — под подпись.",
        temper: "Расчётливый",
      },
      {
        id: 6,
        name: "Виктор",
        job: "Экскаваторщик",
        style: "Копает глубоко. Подкидывает с размахом.",
        temper: "Обстоятельный",
      },
      {
        id: 7,
        name: "Нина",
        job: "Повариха",
        style: "Борщ по талонам. Подколы без ограничений.",
        temper: "Заботливо-язвительная",
      },
      {
        id: 8,
        name: "Гена",
        job: "Охранник",
        style: "Козырь проверит. Без пропуска не пропустит.",
        temper: "Подозрительный",
      },
      {
        id: 9,
        name: "Олег",
        job: "Прораб",
        style: "Сроки горят. Карты тоже подкинет вчера.",
        temper: "Командный",
      },
      {
        id: 10,
        name: "Костя",
        job: "Разнорабочий",
        style: "Подай, принеси, возьми ещё шесть.",
        temper: "Неунывающий",
      },
    ],
    phrases: {
      start: [
        "{playerName}, садись. Табель закрыл, чай заварил. Осталось выяснить, кого завтра в табеле писать карандашом.",
        "{playerName}, садись. Вахтовку заглушил. Если она сейчас заведётся сама — сегодня ночуем за столом.",
        "{playerName}, садись. Сегодня собираем конструкцию, у которой хотя бы не теряются болты в снегу.",
        "{playerName}, садись. Маску снял, поэтому за выражение лица ответственности не несу.",
        "{playerName}, садись. Чай выдам без подписи, но если понравится — это разовая ошибка учёта.",
        null,
        "{playerName}, садись. Ковш оставил снаружи: после прошлой партии стол сделали за мой счёт.",
        "{playerName}, садись. Ужин уже был. Кто скажет, что не наелся, завтра узнает, как выглядит гречка с характером.",
        "{playerName}, садись. Пропуск проверил. Хорошее настроение можешь пронести, за него никто не расписывается.",
        "{playerName}, садись. Совещание неофициальное: протокол не ведём, виноватого всё равно запомним.",
        "{playerName}, садись. Мне сказали просто посидеть. Я на всякий случай спросил, сколько весит это «просто».",
      ],
      attack: [
        "{playerName}, принимай. На объекте это назвали бы дополнительным объёмом и попросили не портить статистику.",
        "{playerName}, лови. Считай, подвёз до места, где ещё неделю идти пешком.",
        "{playerName}, держи. В наряде одна карта, но ты же знаешь, как у нас считают метизы.",
        "{playerName}, лови. Это не искра за воротник, но по выражению лица разницы немного.",
        "{playerName}, получай. В графе «основание выдачи» напишем: слишком довольное лицо.",
        null,
        "{playerName}, держи. Небольшая выемка бюджета твоего спокойствия.",
        "{playerName}, держи. В столовой после такой порции люди хотя бы делают вид, что благодарны.",
        "{playerName}, предъявляю карту. В графе «цель посещения» напишем: испортить тебе вечер.",
        "{playerName}, тебе дополнительный объём. Почему без согласования? Так согласование ещё не придумали.",
        "{playerName}, держи. Наконец-то я что-то передаю, а не держу, пока остальные совещаются.",
      ],
      defend: [
        "{playerName}, твою карту закрыл. Заметь: без комиссии из трёх человек и обещания вернуться после обеда.",
        "{playerName}, твою накрыл. Вот бы я так яму на дороге закрыл, а не просто переименовал в ориентир.",
        "{playerName}, твою закрыл. Наконец соединение, за которым не надо лезть на двенадцать метров.",
        "{playerName}, твою закрыл. Тут шов хотя бы не надо показывать человеку с молотком и подозрениями.",
        "{playerName}, твою закрыла. Вот бы накладные так сходились — положила сверху бумажку, и вопросов нет.",
        null,
        "{playerName}, твою закрыл. Вот это точная работа: обычно после неё надо искать, где теперь проходит кабель.",
        "{playerName}, твою накрыла. Хорошая крышка должна оставлять внутри и пар, и лишние разговоры.",
        "{playerName}, твою не пропустил. Убедительное лицо ещё ни разу не заменило документ.",
        "{playerName}, твою закрыл. В акте напишем «без замечаний», а замечания обсудим уже без акта.",
        "{playerName}, твою закрыл. И никто не попросил придержать, пока он сходит за другим инструментом.",
      ],
      take_one: [
        "{playerName}, пока одну беру. Так и вахта начиналась: «на недельку подменить».",
        "{playerName}, пока одну возьму. В кузове всегда есть место, если диспетчер не стоит рядом с рулеткой.",
        "{playerName}, пока одну беру. Как шайбу с земли: нагнулся за одной, а нашёл себе занятие до ужина.",
        "{playerName}, пока одну возьму. Мелочь, а карман уже прожигает.",
        "{playerName}, пока одну приму. Запишу на полку «непонятно чьё, но спрашивать будут с меня».",
        null,
        "{playerName}, пока одну беру. Глубину увеличивать не обещаю, но у меня рука тяжёлая.",
        "{playerName}, пока одну возьму. Как котлету на пробу: главное, чтобы поварской пробы на весь противень не вышло.",
        "{playerName}, пока одну изымаю. До выяснения. Выяснять буду долго: чай только налил.",
        "{playerName}, пока одну возьму на контроль. Когда их станет десять, переименую в комплексную задачу.",
        "{playerName}, пока одну возьму. Так всегда: сначала «подержи», потом ты уже ответственный за склад.",
      ],
      take_many: [
        "{playerName}, забираю всё. Теперь у меня не рука, а архив обещанных выходных.",
        "{playerName}, всё забираю. Кто-нибудь закрой дверь: у меня колода уже в проходе стоит.",
        "{playerName}, забираю всё. У меня теперь не рука, а ящик «разобраться после смены».",
        "{playerName}, всё забираю. Теперь у меня в руке столько слоёв, что это уже наплавка.",
        "{playerName}, всё принимаю. Теперь могу выдавать карты под залог зимней обуви.",
        null,
        "{playerName}, забираю всё. Это уже не рука, а отвал. Надо бы согласовать, куда его потом девать.",
        "{playerName}, всё забираю. Теперь у меня не рука, а заявка от бригады, которая «только чаю попить».",
        "{playerName}, забираю всё. На проходной за такое количество уже попросили бы накладную и человека с погрузчиком.",
        "{playerName}, всё на мне. Карточная модель управления объектом получилась подозрительно точной.",
        "{playerName}, всё мне. У меня и должность так расшифровывается: кто свободен, тот за всех.",
      ],
      trump_saved: [
        "{playerName}, накрыл без козыря. У старого человека должна быть заначка, о которой не знает даже старый человек.",
        "{playerName}, козырь сохранил. В рейс без запаски не езжу, даже если рейс по столу.",
        "{playerName}, козырь сберёг. Хороший крепёж в общую коробку не высыпаю: потом ищи его в чужом кармане.",
        "{playerName}, козырь оставил. Последний сухой электрод при свидетелях не достают.",
        "{playerName}, козырь оставила. Лежит на верхней полке. Стремянку выдаю только себе.",
        null,
        "{playerName}, козырь сберёг. В баке должно оставаться столько, чтобы доехать подальше от вопроса «а кто копал?».",
        "{playerName}, козырь оставила. Лучший кусок не выкладывают на раздачу, пока не поели свои.",
        "{playerName}, козырь под охраной. Сам охраняю, сам не доверяю, сам потом удивлюсь пропаже.",
        "{playerName}, козырь в резерве. Хороший руководитель всегда должен иметь что-то, о чём не докладывает наверх.",
        "{playerName}, козырь приберёг. Впервые хорошую вещь дали не с условием подержать до вечера.",
      ],
      trump_used: [
        "{playerName}, достал козырь. Это мой аварийный запас. Авария, как видишь, уже сидит за столом.",
        "{playerName}, козырь пошёл. Это я пониженную включил, а не запаниковал.",
        "{playerName}, вот козырь. Наконец подошло без подпиливания. На объекте за такое вызывают фотографа.",
        "{playerName}, козырь пошёл. Сейчас будет тот самый момент, когда все советуют не смотреть, но смотрят.",
        "{playerName}, вот козырь. Достала из резерва, которого, согласно ведомости, у нас нет.",
        null,
        "{playerName}, козырь пошёл. Ну всё, закончилась у нас ручная разработка.",
        "{playerName}, вот козырь. Не морщись: это тот самый кусок мяса, который все безуспешно искали в супе.",
        "{playerName}, вот козырь. Пропуск с такой печатью даже начальник рассматривает молча.",
        "{playerName}, козырь пошёл. Называется «подключить административный ресурс», только здесь он хотя бы настоящий.",
        "{playerName}, вот козырь. Сам пока не понял, почему мне выдали что-то настолько самостоятельное.",
      ],
      pass_attack: [
        "{playerName}, больше не подкидываю. Я пенсионный возраст пережил, а эту кучу переживу и без личного участия.",
        "{playerName}, пас. У меня по маршруту этой остановки больше нет.",
        "{playerName}, больше не подкидываю. По этой стороне у меня работа закончена, допуск аннулируйте.",
        "{playerName}, пас. Я этот шов уже прихватил, доваривать за соседнюю бригаду не подписывался.",
        "{playerName}, больше не выдаю. Окно закрыто, даже если у тебя очень производственное лицо.",
        null,
        "{playerName}, больше не подкину. Граница разработки здесь. Дальше у вас в проекте подозрительно белое место.",
        "{playerName}, больше не добавляю. Повар сказала «хватит» — это не приглашение к переговорам.",
        "{playerName}, больше не пропускаю. Даже если вы в этой колоде двадцать лет работаете.",
        "{playerName}, больше не подкину. Этот объём без меня уже успел превысить согласованный.",
        "{playerName}, больше не подкидываю. Однажды сказал «могу ещё» — потом разгружал до темноты.",
      ],
      event_good: [
        "{playerName}, у меня карт убавилось. Впервые распоряжение сверху не потребовало ещё одной спины.",
        "{playerName}, мне стало легче. Если так пойдёт, впервые вернусь с рейса без чужого генератора в салоне.",
        "{playerName}, у меня убавилось. Такое чувство, будто лишняя деталь наконец оказалась действительно лишней.",
        "{playerName}, мне полегчало. Как будто инспектор посмотрел шов и забыл достать молоток.",
        "{playerName}, у меня убавилось. Впервые списание прошло без поиска человека, который уже уехал с вахты.",
        null,
        "{playerName}, мне стало легче. Как будто в ковше оказался просто грунт, без исторического кабеля внутри.",
        "{playerName}, мне полегчало. Так приятно, когда распоряжение не начинается со слов «а можно без лука на весь участок».",
        "{playerName}, мне полегчало. Как будто проверяющий забыл, зачем вообще приехал.",
        "{playerName}, мне полегчало. Надо тихо порадоваться, пока сверху не решили, что я теперь справлюсь ещё с одним участком.",
        "{playerName}, мне полегчало. Будто кто-то нашёл человека ещё свободнее меня.",
      ],
      event_bad: [
        "{playerName}, мне прилетело. Говорил же: если начальство улыбнулось, пересчитай свои выходные.",
        "{playerName}, мне досталось. Опять маршрут уточнили после того, как я уже свернул.",
        "{playerName}, мне прилетело. Опять всё сошлось по чертежу, кроме реальности.",
        "{playerName}, мне прилетело. Опять из всех способов сделать нормально выбрали «быстро и завтра поправим».",
        "{playerName}, мне досталось. Опять пересортица, а крайняя почему-то женщина с аккуратным почерком.",
        null,
        "{playerName}, мне прилетело. Опять схема коммуникаций появилась уже после ковша.",
        "{playerName}, мне досталось. Опять банкет на вчера, продуктов на завтра и «ты же что-нибудь придумаешь».",
        "{playerName}, мне прилетело. Опять инструкция, в которой последняя строка: «ответственный — охрана».",
        "{playerName}, мне досталось. Опять сверху виднее, особенно когда снизу всё закрыто снегом.",
        "{playerName}, мне прилетело. Опять оказался рядом в ту секунду, когда начальник искал добрые глаза.",
      ],
      win: [
        "{playerName}, я вышел. Теперь имею законное право советовать, не отвечая за последствия.",
        "{playerName}, я вышел. Могу теперь кричать «сдавай назад», совершенно не понимая, куда ты едешь.",
        "{playerName}, я вышел. Руки освободились, но я их под стол спрячу: прораб это замечает из любой точки посёлка.",
        "{playerName}, я вышел. Теперь можно с умным лицом объяснять, что надо было делать иначе.",
        "{playerName}, я вышла. Можете пересчитать: мне чужое не нужно, своего хватает куда деть.",
        null,
        "{playerName}, я вышел. Можешь не проверять: ничего вместе с картами не закопал.",
        "{playerName}, я вышла. Всё, теперь могу спокойно наблюдать, как вы сами себе варите неприятности.",
        "{playerName}, я вышел. Законно. Можешь журнал открыть: там наконец появилась запись «претензий нет».",
        "{playerName}, я вышел. Теперь могу ходить за спиной и спрашивать, почему всё так медленно.",
        "{playerName}, я вышел. Руки под стол убрал, чтобы никто не догадался, что я свободен.",
      ],
      lose: [
        "{playerName}, остался дураком. Завтра на построении скажу: проводил учения по приёму личного состава.",
        "{playerName}, ну вот, довёз себя до дурака. И ведь ни разу не спросил дорогу.",
        "{playerName}, дурак. Зато эту конструкцию можно завтра разобрать и сделать вид, что так и планировалось.",
        "{playerName}, дурак. Зато не скажешь, что играл без огонька. Иногда этот огонёк всё и портит.",
        "{playerName}, осталась дураком. Виновного искать не будем: я всех поимённо знаю и так.",
        null,
        "{playerName}, дурак. Не туда копнул. Обидно, что на этот раз даже карты коммуникаций были прямо в руках.",
        "{playerName}, осталась дураком. Ладно. У меня завтра каша, у вас завтра дегустация моего настроения.",
        "{playerName}, дурак. Сам себя задержал, объяснение получил, ничего убедительного не обнаружил.",
        "{playerName}, дурак. В отчёте назовём это пилотным распределением ответственности.",
        "{playerName}, дурак. Хорошо хоть за новую должность допуск не нужен.",
      ],
      long_game: [
        "{playerName}, мы уже столько сидим, что чай успел стать полезным ископаемым.",
        "{playerName}, мы уже столько играем, что вахтовка снаружи могла превратиться в ледник с госномером.",
        "{playerName}, мы уже столько сидим, что нас можно включать в схему постоянного крепления столовой.",
        "{playerName}, эта партия уже дольше остывает, чем рама, которую мы варили вместо того, чтобы нормально измерить.",
        "{playerName}, эту партию уже пора ставить на долговременное хранение. Полку подпишу «когда-нибудь закончат».",
        null,
        "{playerName}, мы уже столько играем, что яму под этот стол пора сдавать в эксплуатацию.",
        "{playerName}, партия уже столько идёт, что компот успел сам принять решение стать чем-нибудь покрепче.",
        "{playerName}, мы так долго играем, что снаружи уже могли трижды сменить вахту и один раз название предприятия.",
        "{playerName}, эту партию уже пора дважды торжественно открыть и один раз попросить деньги на завершение.",
        "{playerName}, эта партия как просьба «зайти на минутку»: я уже мысленно переехал сюда жить.",
      ],
      idle: [
        "{playerName}, твой ход. Пока думаешь, я успел простить двух начальников. Третьего пока не могу.",
        "{playerName}, твой ход. Я дольше ждал только человека, который сказал «сейчас спущусь».",
        "{playerName}, твой ход. Ты карту выбираешь или ждёшь, когда на неё выпишут допуск?",
        "{playerName}, твой ход. У тебя пауза такая, будто электрод кончился, а признаваться неудобно.",
        "{playerName}, твой ход. Молчание за согласие не принимаю: после такого обычно пропадает шуруповёрт.",
        null,
        "{playerName}, твой ход. Ты карту держишь так, будто снизу что-то зашевелилось и надо звать геолога.",
        "{playerName}, твой ход. Ты так долго выбираешь, будто у нас тут меню, а не «что дали, то и ешь».",
        "{playerName}, твой ход. Я подозрительных людей быстрее пропускаю, а ведь некоторых вообще не пропускаю.",
        "{playerName}, твой ход. Я сейчас начну ставить промежуточные сроки, и тогда нам обоим будет неудобно.",
        "{playerName}, твой ход. Если не знаешь, куда положить карту, только не проси меня пока её подержать.",
      ],
      event_neutral: [
        "{playerName}, приказ исполнен. Что к чему — потом на чайнике нарисуют.",
        "{playerName}, приказ выполнил. По ощущениям — навигатор просто сказал повернуть обратно.",
        "{playerName}, распоряжение выполнено. Как обычно, самая ответственная деталь осталась в вопросах.",
        "{playerName}, приказ исполнил. Про результат поговорим, когда остынут начальственные идеи.",
        "{playerName}, распоряжение провела. Графа «зачем» в бланке предусмотрительно отсутствует.",
        null,
        "{playerName}, распоряжение отработал. Место, где я был уверен, теперь огородим ленточкой.",
        "{playerName}, распоряжение исполнила. Рецепт лучше не стал, зато теперь утверждён.",
        "{playerName}, распоряжение выполнил. Теперь осталось завести журнал выполненных распоряжений.",
        "{playerName}, приказ отработан. Непонятную часть назовём особенностью согласования.",
        "{playerName}, приказ выполнил. Хорошо, что никто пока не крикнул «раз уж ты там».",
      ],
    },
    extras: {
      0: [
        "{playerName}, заходи. Здесь единственное собрание, на котором начальство тоже может остаться дураком.",
        "{playerName}, это тебе. Как посылка с дома: ждал носки, получил квитанцию.",
        "{playerName}, не прошло. Я такие заходы ещё видел, когда наш прораб честно говорил «не знаю».",
        "{playerName}, одну заберу. Места мало, но у меня и сапоги в сорок пятом размере на сорок четвёртой полке живут.",
        "{playerName}, грузи. Блядь, обычно столько на старшего сваливают только перед приездом комиссии.",
        "{playerName}, козырь остался. Не всё же хорошее сразу отдавать, как зарплату в магазине у проходной.",
        "{playerName}, вот козырь. Берёг на чёрный день, но на Севере они как-то подряд идут.",
        "{playerName}, пас. Пусть хоть сегодня лишняя работа пройдёт мимо моей койки.",
        "{playerName}, полегчало. Надо записать дату: начальственное решение принесло пользу без исправления задним числом.",
        "{playerName}, опять попал под приказ. Сорок лет стажа, а от слов «маленькая просьба» всё ещё мороз по жопе.",
        "{playerName}, мои карты кончились. Всё, перешёл на должность почётного мешателя за спиной.",
        "{playerName}, ну вот, дурак. Опыт — это когда заранее знаешь, как именно сейчас облажаешься.",
        "{playerName}, эта партия длиннее инструктажа после случая, о котором запрещено рассказывать на инструктаже.",
        "{playerName}, решай. А то нас сменщики увидят и подумают, что мы тут так и работали.",
        "{playerName}, распоряжение отработал. Не спрашивай, стало ли понятнее: это отдельное распоряжение.",
      ],
      1: [
        "{playerName}, заходи. В салоне двадцать мест, а здесь хотя бы никто не просит высадить «вон у того сугроба».",
        "{playerName}, тебе карта. Дополнительная остановка, которой нет ни в маршруте, ни в моей совести.",
        "{playerName}, отбил. Хорошо, что здесь тормоза на картах, а не как у нашей второй вахтовки — в молитве.",
        "{playerName}, одну беру. Как пассажира «с маленькой сумочкой», из которой потом выходит двигатель.",
        "{playerName}, загружай. Блядь, мы картошку на весь участок возим с меньшим чувством перегруза.",
        "{playerName}, накрыл обычной. Печку и козырь раньше времени не включаю: потом оба жалко выключать.",
        "{playerName}, вот мой полный привод. Красиво не обещаю, но из этой жижи выберусь.",
        "{playerName}, больше не везу. Даже у бесплатной развозки бывает последняя ходка.",
        "{playerName}, с меня убавилось. Диспетчеру не говори: он любое свободное место воспринимает как оскорбление.",
        "{playerName}, попал под раздачу. Начальство навигатором пользуется только для определения, кто виноват.",
        "{playerName}, у меня пусто! Первый рейс за неделю, когда всех высадил и никто не остался под сиденьем.",
        "{playerName}, проиграл. Запишем: неблагоприятная карточная обстановка и один самоуверенный водитель.",
        "{playerName}, эта партия как наш объезд: на карте коротко, в жизни успеваешь пожалеть о профессии.",
        "{playerName}, давай уже. У тебя поворотник мысли включён, а манёвра всё нет.",
        "{playerName}, отработал распоряжение. Маршрут тот же, а бумажек на рейс стало больше.",
      ],
      2: [
        "{playerName}, заходи. Ключи убрал. Если кто попросит «на минутку придержать», отвечаем, что у нас соревнования.",
        "{playerName}, тебе. Маленькое дополнение к конструкции, которое почему-то всегда держит весь объект.",
        "{playerName}, отбил. И без любимого прорабского инструмента: «ну ты там придумай».",
        "{playerName}, одну забираю. В кармане найдётся место между гайкой и причиной болеть пояснице.",
        "{playerName}, всё мне. Блядь, опять конструкция держится на одном монтажнике и плохом настроении.",
        "{playerName}, обошёлся без козыря. Не затягивают последний болт раньше, чем убедились, что лестницу вынесли.",
        "{playerName}, козырь ставлю. У каждого монтажника должен быть ключ, который нельзя никому давать.",
        "{playerName}, пас. Тут уже можно леса ставить, а я за них сегодня не расписывался.",
        "{playerName}, стало легче. Обычно облегчение конструкции заканчивается вопросом, кто снял несущую.",
        "{playerName}, попал. У нас слово «доработать» почему-то всегда означает «разобрать то, что уже держалось».",
        "{playerName}, карт нет. Первый раз сдал работу и никто не спросил, почему осталось ещё три ящика.",
        "{playerName}, проиграл. В акте напишу: собрал убедительно, держалось недолго.",
        "{playerName}, эта партия как монтаж зимой: только решил, что закончил, а кто-то принёс ещё одну деталь.",
        "{playerName}, решай. Пока смотрел на твою руку, мысленно собрал лестницу, чтобы уйти отсюда через окно.",
        "{playerName}, поручение отработал. Теперь можно обратно собирать лицо человека, который всё понял.",
      ],
      3: [
        "{playerName}, заходи. Искры сегодня только из разговоров: электроды мне до зарплаты считать велели.",
        "{playerName}, тебе карта. Небольшая прихватка, после которой обычно выясняется, что приварили не той стороной.",
        "{playerName}, отбил. Можно не стучать: на звук карта всё равно деревянной не станет.",
        "{playerName}, одну заберу. Как брызгу с рукава: маленькая, а весь вечер о ней помнишь.",
        "{playerName}, грузи всё. Блядь, электродов на такое соединение по норме не выдавали.",
        "{playerName}, накрыл без козыря. Хороший запас — тот, о котором кладовщица не успела завести ведомость.",
        "{playerName}, вот козырь. Дугу поймал. Не надо дуть — это карты, а не каша.",
        "{playerName}, больше не подкину. Куча и без меня напоминает деталь после четырёх исправлений.",
        "{playerName}, убавилось. Надо отметить мелом: сегодня что-то отпало, а соединение только выиграло.",
        "{playerName}, попал под приказ. Хорошо, что на картах нет шлака: его бы тоже заставили сдать по весу.",
        "{playerName}, у меня пусто. Первый раз за смену закончил и ничего не прилипло к рукаву.",
        "{playerName}, проиграл. Держалось на честном слове. Честное слово оказалось учеником первого дня.",
        "{playerName}, ещё немного — и на этом столе можно будет проверять выдержку сварщика, а не прочность шва.",
        "{playerName}, давай. Я уже маску мысленно опустил: сейчас либо красивый ход, либо будет на что посмотреть.",
        "{playerName}, сделал по распоряжению. Всё, что получилось странно, — это теперь по документации.",
      ],
      4: [
        "{playerName}, заходи. Стол на балансе, карты пересчитаны. Твою уверенность пока приму без описи.",
        "{playerName}, тебе карта. Обратно принимаю только целиком и вместе с объяснительной.",
        "{playerName}, не прошло. Я сорок лет отличаю «не получал» от «куда-то положил».",
        "{playerName}, одну беру. Поставлю рядом с десятью коробками, которые «завтра заберут» с прошлого марта.",
        "{playerName}, всё мне. Блядь, только склад закроешь — немедленно появляется человек, которому срочно нужно всё.",
        "{playerName}, накрыла обычной. Не путай наличие хорошей вещи с разрешением её получить.",
        "{playerName}, козырь выдан. Получателя запомнила. Людей я запоминаю лучше, чем они свои долги.",
        "{playerName}, пас. Дополнительная выдача завтра. Завтра я скажу, что нужна заявка вчерашним числом.",
        "{playerName}, стало меньше. Так вот как выглядит недостача, за которую приятно отвечать.",
        "{playerName}, попала под приказ. Все любят порядок на складе, пока он не мешает взять что-нибудь без записи.",
        "{playerName}, карт нет. Остатки сошлись. Редкий случай, когда я не хочу никого повторно инвентаризировать.",
        "{playerName}, проиграла. Оформлю на себя. Вы только радуйтесь потише, у нас стены тонкие и память хорошая.",
        "{playerName}, мы так долго играем, что на стол пора заводить вторую инвентарную карточку — за выслугу.",
        "{playerName}, определяйся. Я так долго даже людей с нечитаемой подписью не обслуживаю.",
        "{playerName}, приказ исполнен. Ведомость толще, уверенности больше не стало.",
      ],
      6: [
        "{playerName}, заходи. Здесь копать не надо. Хотя, судя по лицам, котлован сейчас появится сам.",
        "{playerName}, тебе карта. Считай, я аккуратно перенёс проблему с одного края площадки на другой.",
        "{playerName}, отбил. Даже землю не потревожил. Сам себе сейчас не поверил.",
        "{playerName}, одну забираю. Как ложку грунта на проверку: потом внезапно нужен самосвал.",
        "{playerName}, грузи. Блядь, в котловане с таким количеством добра уже начали бы искать фундамент.",
        "{playerName}, накрыл обычной. Ковш побольше существует, но не для каждой просьбы надо портить пейзаж.",
        "{playerName}, вот козырь. Рычаг тронул на сантиметр — у прораба уже новый план участка.",
        "{playerName}, пас. Я и так уже вижу, где здесь начнут искать виноватого с техникой.",
        "{playerName}, убавилось. Первый раз после распоряжения начальства яму не пришлось делать шире.",
        "{playerName}, попал. Сверху хорошо видно, как начальство показывает ровно туда, где мне нельзя копать.",
        "{playerName}, карт нет. Котлован сдал, теперь делаю вид, что рацию не слышу.",
        "{playerName}, проиграл. Бывает: ковш большой, а шанс развернуться почему-то маленький.",
        "{playerName}, эта партия как наш грунт: начальник обещал, что под тонким слоем сразу будет легко.",
        "{playerName}, решай. Экскаватор снаружи быстрее думает, а у него вообще кабина пустая.",
        "{playerName}, приказ выполнил. Для геологии ничего не изменилось, для отчёта — целое событие.",
      ],
      7: [
        "{playerName}, заходи. На раздаче вы все стеснительные, а за картами немедленно вспоминаете про добавку.",
        "{playerName}, тебе карта. Сегодня добавка без очереди — зато отказаться нельзя.",
        "{playerName}, отбила. Заметь: без поварёшки. Её у меня на более серьёзные споры держат.",
        "{playerName}, одну беру. В кастрюле место найдётся. Там после обеда обычно помещаются даже обещания директора.",
        "{playerName}, грузи всё. Блядь, я на двести человек меньше разнообразия выдаю, чем вы мне за минуту.",
        "{playerName}, накрыла без козыря. Запас хорошей тушёнки надо беречь от людей с большой ложкой.",
        "{playerName}, козырь пошёл. Рецепт секретный, зато добавку теперь точно никто не попросит.",
        "{playerName}, пас. Раздача закрыта. Даже если ты сейчас вспомнишь, что всю смену голодал.",
        "{playerName}, убавилось. Первый раз начальство вмешалось, а перемывать всё заново не надо.",
        "{playerName}, попала под приказ. Стоит снять фартук — тут же выясняется, что кому-то нужна жизнь без перловки.",
        "{playerName}, карт нет. Последнюю порцию выдала, пустую тару с довольными лицами ко мне не нести.",
        "{playerName}, проиграла. Радуйтесь. С солью я теперь буду действовать исключительно по собственному разумению.",
        "{playerName}, ещё немного — и этот чай можно будет нарезать на бутерброды.",
        "{playerName}, давай. Я столько у кастрюли не стою — там хотя бы понятно, когда закипит.",
        "{playerName}, по приказу сделала. Следующий, кто скажет «а я бы иначе», надевает мой фартук.",
      ],
      8: [
        "{playerName}, заходи. Карты свои, выход общий. Только не надо потом объяснять, что туз сам в карман запрыгнул.",
        "{playerName}, тебе. Обычная проверка, после которой обычно почему-то проверяют уже всю бригаду.",
        "{playerName}, закрыл. У нашего шлагбаума та же политика: если сомневаешься — пусть человек сначала замёрзнет.",
        "{playerName}, одну беру на хранение. Это не конфискация, это у нас журнал ещё не завели.",
        "{playerName}, всё мне. Блядь, целую смену никого не пускал, а теперь вся колода прошла без досмотра.",
        "{playerName}, обычной обошёлся. Не каждый шорох у шлагбаума заслуживает вызова начальника.",
        "{playerName}, козырь предъявлен. Здесь уже не «я каждый день хожу», здесь документ серьёзный.",
        "{playerName}, пас. На сегодня лимит посетителей с хитрым лицом исчерпан.",
        "{playerName}, убавилось. Впервые после распоряжения закрывать смену пришлось без дополнительного журнала.",
        "{playerName}, попал под приказ. Удобная профессия: если случилось снаружи — не уследил, внутри — пропустил.",
        "{playerName}, карт нет. Сдаю пост, пока кто-нибудь не объявил проверку сдачи поста.",
        "{playerName}, проиграл. В рапорте напишу: подозреваемый оказался на редкость похож на охранника.",
        "{playerName}, эта партия дольше обхода, на котором я однажды честно проверил каждую дверь.",
        "{playerName}, решай. Ты эту карту уже дольше держишь, чем я чужой паспорт перед обедом.",
        "{playerName}, приказ закрыт. Не потому что всё ясно — просто в журнале кончилась строка.",
      ],
      9: [
        "{playerName}, заходи. Задача простая — закончить раньше, чем я начну распределять, кто тут за что отвечает.",
        "{playerName}, получай. В первоначальном плане этого не было — значит, будем считать улучшением.",
        "{playerName}, отбил. Вот так бы объект сдавать: накрыл сверху и больше не видно.",
        "{playerName}, одну забираю. Ответственного уже назначили, осталось понять, что именно ему поручили.",
        "{playerName}, всё беру. Блядь, стоило на минуту сесть, и у всего участка снова обнаружился только мой номер.",
        "{playerName}, накрыл обычной. Если сразу показать, что можешь лучше, это немедленно внесут в норму.",
        "{playerName}, вот козырь. Быстро согласовал сам с собой: наконец компетентное совещание.",
        "{playerName}, пас. Вмешаюсь позже, когда станет понятно, кого хвалить за моё решение.",
        "{playerName}, убавилось. Первый приказ за месяц, который можно выполнить без предложения изменить законы физики.",
        "{playerName}, попал под раздачу. Вот поэтому я всегда спрашиваю: «Сделать или доложить, что сделано?»",
        "{playerName}, карт нет. Работу закончил. Осталось убедительно объяснить, что остальные тоже были под моим руководством.",
        "{playerName}, проиграл. Кто-нибудь запомнил, в какой момент мой уверенный план стал коллективной импровизацией?",
        "{playerName}, мы так долго играем, что я начал прикидывать, на чью смену перенести окончание.",
        "{playerName}, определяйся. Ты уже столько думаешь, что я успел сначала назначить тебя ответственным, а потом пожалеть.",
        "{playerName}, распоряжение выполнено. Кто понял замысел, тот слишком близко стоял к начальству.",
      ],
      10: [
        "{playerName}, заходи. Если кто позовёт помочь, скажем, что нас уже заняли. Чем — пусть выясняют между собой.",
        "{playerName}, тебе карта. Можешь не благодарить: мне всё равно потом скажут убрать со стола.",
        "{playerName}, отбил. Впервые за день моя работа закончилась раньше, чем у всех остальных.",
        "{playerName}, одну беру. Если за ней сейчас появится список, я сделаю вид, что читать не умею.",
        "{playerName}, забираю всё. Блядь, даже сидя за столом умудрился оказаться тем, кто носит.",
        "{playerName}, без козыря накрыл. Я свой последний удобный инструмент уже однажды одолжил — теперь умнее.",
        "{playerName}, козырь пошёл. Сейчас будет редкий момент, когда я командую, а не угадываю, какой конец держать.",
        "{playerName}, пас. Я официально занят наблюдением. Очень тяжёлая работа, не отвлекайте.",
        "{playerName}, убавилось. Вот бы на работе так: убрал одну задачу, а за ней ещё две не выросли.",
        "{playerName}, попал под приказ. Пора перестать отзываться на «эй, кто-нибудь».",
        "{playerName}, карт нет. Сейчас главное не вставать слишком бодро: ещё решат, что силы остались.",
        "{playerName}, проиграл. Умею я выбрать место: сел отдыхать и снова крайний.",
        "{playerName}, мы так долго сидим, что меня успели бы попросить трижды переставить этот стол обратно.",
        "{playerName}, давай уже. Я стоя меньше устаю, когда понимаю, чего от меня хотят.",
        "{playerName}, сделал, как сказали. Если надо было иначе, пусть в следующий раз говорят иначе.",
      ],
    },
    observations: {
      0: {
        event_good: [
          "{playerName}, послабление тебе вышло. Не радуйся громко: наверху это сочтут недоработкой приказа.",
          "{playerName}, с тебя убавилось. Я бы перечитал приказ: вдруг мелким шрифтом надо радоваться за свой счёт.",
        ],
        event_bad: [
          "{playerName}, тебе прилетело. Начальство тебя заметило — вот и вся награда за незаметную работу.",
          "{playerName}, приказ тебе боком вышел. Зато теперь ясно, почему его так торжественно читали.",
        ],
        event_neutral: [
          "{playerName}, приказ исполнен. Теперь можно всем вместе сделать вид, что в этом был план.",
          "{playerName}, распоряжение закрыто. Вопросы оставим сменщикам: у них глаза ещё свежие.",
        ],
      },
      1: {
        event_good: [
          "{playerName}, тебя разгрузили. Мне бы так после рейса хоть раз не подсовывали ещё мешок.",
          "{playerName}, тебе полегчало. Не показывай свободное место: у диспетчера на него нюх.",
        ],
        event_bad: [
          "{playerName}, тебе досталось. Знакомо: маршрут короткий, пока не выехал.",
          "{playerName}, приказ тебя зацепил. Если что, я назад сдаю только после того, как все отошли.",
        ],
        event_neutral: [
          "{playerName}, распоряжение отработано. Можно ехать дальше, будто это и была остановка по расписанию.",
          "{playerName}, приказ выполнен. Главное — не спрашивать, почему объезд закончился там же.",
        ],
      },
      2: {
        event_good: [
          "{playerName}, тебе полегчало. Редкий приказ, после которого не приходится доставать лом.",
          "{playerName}, с тебя убавили. Запомни: это не повод признаваться, что справляешься.",
        ],
        event_bad: [
          "{playerName}, тебе прилетело. У нас так обычно начинается просьба «быстренько поправить».",
          "{playerName}, приказ тебе добавил забот. Был бы чертёж — хоть помяли бы его вдвоём.",
        ],
        event_neutral: [
          "{playerName}, распоряжение ты исполнил. Если спросят, держалось именно так с самого начала.",
          "{playerName}, с приказом закончили. Вот бы он ещё заканчивался одновременно с вопросами.",
        ],
      },
      3: {
        event_good: [
          "{playerName}, тебе полегчало. Считай, проверка пришла без молотка.",
          "{playerName}, с тебя убавилось. Вот это я понимаю: меньше материала, крепче настроение.",
        ],
        event_bad: [
          "{playerName}, тебе досталось. Такое без маски лучше не рассматривать.",
          "{playerName}, приказ тебя зацепил. Ничего, плохое решение тоже можно потом аккуратно зашлифовать.",
        ],
        event_neutral: [
          "{playerName}, приказ выполнен. Подписавшего ищи сам, у меня глаза после смены устали.",
          "{playerName}, распоряжение отработано. Дай ему остыть, прежде чем пытаться понять.",
        ],
      },
      4: {
        event_good: [
          "{playerName}, тебе полегчало. Не потеряй этот приказ: такое надо хранить как редкий документ.",
          "{playerName}, с тебя убавилось. По учёту всё сошлось, по жизни — подозрительно удачно.",
        ],
        event_bad: [
          "{playerName}, тебе досталось. Распишись здесь. Это не поможет, но почерк я оценю.",
          "{playerName}, приказ тебя зацепил. Обратно такие вещи не принимаю — у них срок возврата вчера закончился.",
        ],
        event_neutral: [
          "{playerName}, приказ исполнен. Копию оставь себе, оригинал всё равно спросят с меня.",
          "{playerName}, распоряжение закрыто. Нет, устное «понял» мы отдельной накладной не оформляем.",
        ],
      },
      6: {
        event_good: [
          "{playerName}, тебе полегчало. Отходи, пока начальник не увидел, что ты опять на поверхности.",
          "{playerName}, с тебя убавилось. Хорошо, когда распоряжение уменьшает яму, а не углубляет.",
        ],
        event_bad: [
          "{playerName}, тебе прилетело. Говорил же: самые глубокие проблемы начинаются с маленького совещания.",
          "{playerName}, приказ тебя зацепил. Я ковшом такое не исправлю, но сочувственно постоять могу.",
        ],
        event_neutral: [
          "{playerName}, приказ выполнен. Теперь пусть человек со схемой объясняет, почему схема удивилась.",
          "{playerName}, распоряжение отработано. Я бы это место пока не трогал — вдруг там замысел.",
        ],
      },
      7: {
        event_good: [
          "{playerName}, тебе полегчало. Я бы за такой приказ даже компот не разбавляла.",
          "{playerName}, с тебя убавилось. Вот бы ещё начальство рецепт борща обсуждало с таким же результатом.",
        ],
        event_bad: [
          "{playerName}, тебе досталось. И ведь не скажешь, что просил добавки.",
          "{playerName}, приказ тебя зацепил. Садись, чай налью. Приказ от этого лучше не станет, но руки займёшь.",
        ],
        event_neutral: [
          "{playerName}, приказ выполнен. Можно возвращаться к картам, пока кто-нибудь не придумал праздничное меню.",
          "{playerName}, с распоряжением закончили. На вкус не спрашивай: это не я готовила.",
        ],
      },
      8: {
        event_good: [
          "{playerName}, тебе полегчало. Выпускаю из-под распоряжения без дополнительного досмотра.",
          "{playerName}, с тебя убавилось. Подозрительно удачно, но в журнале так и запишу.",
        ],
        event_bad: [
          "{playerName}, тебе прилетело. Причину задержания сейчас выясним, но настроение уже задержали.",
          "{playerName}, приказ тебя зацепил. Документ настоящий — вот что особенно обидно.",
        ],
        event_neutral: [
          "{playerName}, приказ исполнен. Отметку поставил, понимать содержание мне не поручали.",
          "{playerName}, распоряжение закрыто. Претензии направляй туда, откуда пришла бумага. Я тоже хочу узнать, где это.",
        ],
      },
      9: {
        event_good: [
          "{playerName}, тебе полегчало. Постарайся не выглядеть свободным, а то это быстро поправят.",
          "{playerName}, с тебя убавилось. Зафиксируем как эффективное руководство с моей стороны.",
        ],
        event_bad: [
          "{playerName}, тебе досталось. Не спорь с приказом: спорить надо было, пока его называли предложением.",
          "{playerName}, приказ тебя зацепил. Я предупреждал, что слово «оптимизация» без каски слушать нельзя.",
        ],
        event_neutral: [
          "{playerName}, распоряжение выполнено. Теперь можно переходить к согласованию того, что именно получилось.",
          "{playerName}, приказ отработан. Все непонятные места считаем авторским замыслом начальства.",
        ],
      },
      10: {
        event_good: [
          "{playerName}, тебе полегчало. Научи этому лицу: со мной оно никогда не срабатывает.",
          "{playerName}, с тебя убавилось. Я тоже так хочу — у меня слово «меньше» бывает только перед словом «выходных».",
        ],
        event_bad: [
          "{playerName}, тебе прилетело. Если скажут «нужен кто-нибудь в помощь», я уже ушёл за чаем.",
          "{playerName}, приказ тебя зацепил. Понимаю. Я однажды просто мимо проходил и потом весь день был нужен.",
        ],
        event_neutral: [
          "{playerName}, приказ выполнен. Теперь сиди тихо: за выполненным часто приносят новое.",
          "{playerName}, распоряжение закрыли. На всякий случай я пока не спрашиваю, можно ли отдыхать.",
        ],
      },
    },
  };
  const clean = (text) =>
    text
      .replace(/блядь/gi, "чёрт")
      .replace(/нахуй/gi, "к чёрту")
      .replace(/сука/gi, "чёрт")
      .replace(/пиздец/gi, "полный завал")
      .replace(/ебаться/gi, "жить")
      .replace(/заебало/gi, "надоело")
      .replace(/охуел/gi, "сошёл с ума")
      .replace(/жопе/gi, "спине");
  const kinds = Object.keys(data.phrases);
  function dialogue(
    kind,
    npc,
    name,
    humor = "full",
    variant = 0,
    observer = false,
  ) {
    const k = data.phrases[kind] ? kind : "idle";
    const variants = observer ? data.observations[npc]?.[k] : null;
    const base = data.phrases[k][npc] || data.phrases.idle[0];
    const extra = data.extras[npc]?.[kinds.indexOf(k)];
    const text = variants
      ? variants[variant % variants.length]
      : variant % 2 && extra
        ? extra
        : base;
    return (humor === "full" ? text : clean(text)).replaceAll(
      "{playerName}",
      name,
    );
  }
  function otherSeat(s, who) {
    for (let step = 1; step < s.players.length; step++) {
      const i = (who + step) % s.players.length;
      if (!s.players[i].out) return i;
    }
    return null;
  }
  function actionAudience(before, after, a, who) {
    let target;
    if (a.type === "attack") target = before.defender;
    else if (a.type === "transfer") target = after.defender;
    else if (a.type === "defend")
      target = before.table[a.pair]?.playedBy ?? before.attacker;
    else if (a.type === "take")
      target = before.table.at(-1)?.playedBy ?? before.attacker;
    else if (a.type === "pass") target = before.defender;
    // A circle of transfers can return the speaker's own attack: answer the last transferer.
    if (target === who)
      target =
        before.table
          .slice()
          .reverse()
          .map((p) => p.playedBy)
          .find((i) => Number.isInteger(i) && i !== who && before.players[i]) ??
        before.attacker;
    return Number.isInteger(target) && target !== who && before.players[target]
      ? target
      : otherSeat(before, who);
  }
  // Separate clean versions keep the punchline without relying on a profanity filter.
  const lossTaunts = [
    ["{playerName}, дрочи колоду, пока не протрётся до премии. Мы пошли чай пить.", "{playerName}, тасуй колоду, пока не протрётся до премии. Мы пошли чай пить."],
    ["{playerName}, ты не проиграл — ты, блядь, принял весь карточный склад без накладной.", "{playerName}, ты не проиграл — ты принял весь карточный склад без накладной."],
    ["{playerName}, козыри кончились, а ты остался. Пиздец, какая надёжная кадровая политика!", "{playerName}, козыри кончились, а ты остался. Вот это надёжная кадровая политика!"],
    ["{playerName}, карты неси в сушилку. От твоей тактики они, блядь, вспотели.", "{playerName}, карты неси в сушилку. От твоей тактики они вспотели."],
    ["{playerName}, с такой рукой только снег в мешки фасовать. Причём, сука, дырявые.", "{playerName}, с такой рукой только снег в мешки фасовать. Причём дырявые."],
    ["{playerName}, тебя колода усыновила. Теперь плати ей алименты, блядь, по шесть карт.", "{playerName}, тебя колода усыновила. Теперь плати ей алименты по шесть карт."],
    ["{playerName}, начальство просило найти крайнего. Спасибо, блядь, что сам подписался!", "{playerName}, начальство просило найти крайнего. Спасибо, что сам подписался!"],
    ["{playerName}, тебе даже швабра козыря не подаст. Сказала: «Я с этим, блядь, в паре не работаю».", "{playerName}, тебе даже швабра козыря не подаст. Сказала: «Я с этим в паре не работаю»."],
    ["{playerName}, ты не дурак. Ты, блядь, начальник отдела оставшихся карт. Отдел — один человек.", "{playerName}, ты не дурак. Ты начальник отдела оставшихся карт. Отдел — один человек."],
    ["{playerName}, мы тебе подкидывали, а ты коллекцию собирал. Открывай, нахуй, музей неудачных решений!", "{playerName}, мы тебе подкидывали, а ты коллекцию собирал. Открывай музей неудачных решений!"],
    ["{playerName}, чайник уже вскипел, остыл и уволился. А ты всё, блядь, с картами.", "{playerName}, чайник уже вскипел, остыл и уволился. А ты всё с картами."],
    ["{playerName}, твой козырь ушёл в отпуск без содержания. Содержание, блядь, у тебя на руках.", "{playerName}, твой козырь ушёл в отпуск без содержания. Содержание у тебя на руках."]
  ];
  function lossBanter(profile, gameId, name, humor = "full") {
    let state = profile.lossBanter;
    if (!state || state.gameId !== gameId || !lossTaunts[state.choice]) {
      let remaining = [...new Set(state?.remaining || [])].filter(i=>Number.isInteger(i) && lossTaunts[i]);
      if (!remaining.length) {
        remaining = lossTaunts.map((_,i)=>i);
        for (let i=remaining.length-1;i>0;i--) {
          const j=Math.floor(Math.random()*(i+1));
          [remaining[i],remaining[j]]=[remaining[j],remaining[i]];
        }
        if (remaining.at(-1) === state?.choice)
          [remaining[0],remaining[remaining.length-1]]=[remaining.at(-1),remaining[0]];
      }
      state = profile.lossBanter = {gameId, choice:remaining.pop(), remaining};
    }
    return lossTaunts[state.choice][humor === "full" ? 0 : 1].replaceAll("{playerName}", name);
  }
  Object.assign(data, { clean, dialogue, otherSeat, actionAudience, lossBanter, lossTaunts });
  if (typeof module === "object") module.exports = data;
  else root.VahtaContent = data;
})(globalThis);

;
(function (root) {
  class VahtaAudio {
    constructor(settings) {
      this.settings = settings;
      this.unlocked = false;
      this.paused = false;
      this.pool = new Set();
      this.music = null;
      this.wind = null;
    }
    unlock() {
      if (this.unlocked) return;
      this.unlocked = true;
      this.update(this.settings);
      this.kettleTimer = setInterval(() => this.play("kettle"), 45000);
    }
    update(settings) {
      this.settings = settings;
      if (!this.unlocked) return;
      if (!this.music) {
        this.music = new Audio("public/assets/audio/music.wav");
        this.music.loop = true;
      }
      if (!this.wind) {
        this.wind = new Audio("public/assets/audio/wind.wav");
        this.wind.loop = true;
      }
      this.wind.volume = settings.sfx * 0.05;
      if (this.paused || !settings.sfx) this.wind.pause();
      else if (this.wind.paused) this.wind.play().catch(() => {});
      this.music.volume = settings.music * 0.45;
      if (this.paused || !settings.music) this.music.pause();
      else if (this.music.paused) this.music.play().catch(() => {});
      for (const a of this.pool) a.volume = settings.sfx * 0.55;
      if (!settings.sfx) for (const a of this.pool) a.pause();
    }
    play(name) {
      if (!this.unlocked || this.paused || !this.settings.sfx) return;
      const a = new Audio("public/assets/audio/" + name + ".wav");
      a.volume = this.settings.sfx * 0.55;
      this.pool.add(a);
      a.onended = a.onerror = () => this.pool.delete(a);
      a.play().catch(() => this.pool.delete(a));
    }
    pause(value) {
      this.paused = value;
      if (value) for (const a of this.pool) a.pause();
      this.update(this.settings);
    }
  }
  root.VahtaAudio = VahtaAudio;
})(globalThis);

;
/* Cards have immutable coordinates within a round. Only the shared camera scales. */
(function (root) {
  const CARD_W = 100,
    CARD_H = 144,
    DX = 45,
    DY = 24,
    STEP_X = 157,
    STEP_Y = 180,
    PAD = 2;
  class VahtaTableCamera {
    constructor(settings) {
      this.settings = settings;
      this.state = null;
    }
    finish() {
      this.state?.animation?.finish();
    }
    layout(view, count, options = {}) {
      if (!count) return Promise.resolve();
      const measuring = options.measure === true;
      const cols = innerWidth > innerHeight ? 6 : 3;
      const key = `${view.dataset.game}:${view.dataset.round}:${cols}`;
      if (!measuring && this.state?.key !== key) {
        this.state?.animation?.cancel();
        this.state = {
          key,
          count: 0,
          scale: 1,
          world: null,
          animation: null,
          promise: Promise.resolve(),
        };
      }
      const state = this.state?.key === key ? this.state : null;
      const n = Math.max(count, state?.count || 0),
        usedCols = Math.min(cols, n),
        rows = Math.ceil(n / cols);
      const worldW = (usedCols - 1) * STEP_X + CARD_W + DX,
        worldH = (rows - 1) * STEP_Y + CARD_H + DY;
      const fit = Math.min(
        1,
        (view.clientWidth - PAD * 2) / worldW,
        (view.clientHeight - PAD * 2) / worldH,
      );
      const scale = Math.max(0.1, Math.min(state?.scale ?? 1, fit));
      let world = view.querySelector(":scope > .table-world");
      if (!world) {
        world = document.createElement("div");
        world.className = "table-world";
        while (view.firstChild) {
          const child = view.firstChild;
          if (child.classList?.contains("card-pair")) world.append(child);
          else child.remove();
        }
        view.append(world);
      }
      if (!measuring) {
        view.style.position = "relative";
        view.style.display = "block";
      }
      Object.assign(world.style, {
        position: "absolute",
        left: PAD + "px",
        top: PAD + "px",
        width: worldW + "px",
        height: worldH + "px",
        transformOrigin: "0 0",
        transform: `scale(${scale})`,
      });
      world.style.setProperty(
        "--camera-rank-size",
        Math.max(22, 14 / scale) + "px",
      );
      world.style.setProperty(
        "--camera-rank-width",
        Math.max(27, 22 / scale) + "px",
      );
      [...world.children].forEach((pair, i) => {
        Object.assign(pair.style, {
          position: "absolute",
          boxSizing: "border-box",
          padding: "0",
          minWidth: "0",
          minHeight: "0",
          maxWidth: "none",
          maxHeight: "none",
          width: CARD_W + DX + "px",
          height: CARD_H + DY + "px",
          left: (i % cols) * STEP_X + "px",
          top: Math.floor(i / cols) * STEP_Y + "px",
        });
        [...pair.querySelectorAll(".playing-card")].forEach((card, j) =>
          Object.assign(card.style, {
            position: j ? "absolute" : "relative",
            left: j ? DX + "px" : "0px",
            top: j ? DY + "px" : "0px",
            width: CARD_W + "px",
            height: CARD_H + "px",
            minWidth: "0",
            maxWidth: "none",
            maxHeight: "none",
            transform: "none",
          }),
        );
      });
      view.dataset.cameraScale = String(scale);
      if (measuring || !state) return Promise.resolve();
      const previous = state.scale;
      let from = previous;
      if (state.animation) {
        const progress =
          state.animation.effect.getComputedTiming().progress ?? 1;
        from = state.from + (state.scale - state.from) * progress;
      }
      const sameWorld = state.world === world;
      const firstLayout = !state.world;
      state.count = n;
      if (scale === previous && sameWorld) return state.promise;
      state.animation?.cancel();
      state.count = n;
      state.scale = scale;
      state.world = world;
      const duration =
        firstLayout || this.settings().reduced || document.hidden
          ? 0
          : this.settings().fast
            ? 350
            : 700;
      if (Math.abs(from - scale) < 0.00001 || !duration) {
        state.animation = null;
        state.promise = Promise.resolve();
        return state.promise;
      }
      state.from = from;
      const animation = world.animate(
        [{ transform: `scale(${from})` }, { transform: `scale(${scale})` }],
        { duration, easing: "cubic-bezier(.25,.1,.25,1)", fill: "none" },
      );
      state.animation = animation;
      state.promise = animation.finished
        .catch(() => {})
        .then(() => {
          if (state.animation === animation) state.animation = null;
        });
      return state.promise;
    }
  }
  root.VahtaTableCamera = VahtaTableCamera;
})(globalThis);

;
/* Presentation-only flight queue. Never modifies the rule model. */
(function (root) {
  class VahtaMotion {
    constructor({ card, back, settings, layout }) {
      this.card = card;
      this.back = back;
      this.settings = settings;
      this.layout = layout;
      this.running = new Set();
    }
    duration(ms) {
      const s = this.settings();
      return s.reduced ? 0 : s.fast ? Math.round(ms * 0.3) : ms;
    }
    rect(el) {
      return el?.getBoundingClientRect();
    }
    seat(i) {
      if (i !== 0)
        return document.querySelector(`.opponent[data-seat="${i}"] .avatar`);
      const avatar = document.querySelector(".human-caption .avatar");
      return avatar?.getBoundingClientRect().width
        ? avatar
        : document.querySelector(".hand") ||
            document.querySelector(".human-caption");
    }

    async wait(ms) {
      if (document.hidden) return;
      await new Promise((r) => setTimeout(r, this.duration(ms)));
    }
    finish() {
      for (const a of this.running)
        try {
          a.finish();
        } catch {
          a.cancel();
        }
    }
    async fly(
      markup,
      from,
      to,
      { delay = 0, rotation = 0, exit = false, phase = "play" } = {},
    ) {
      if (!from || !to) return;
      const wrap = document.createElement("div");
      wrap.innerHTML = markup;
      const el = wrap.firstElementChild;
      el.classList.add("flight-card");
      el.dataset.flight = phase;
      el.setAttribute("aria-hidden", "true");
      const w = exit ? (phase === "draw" ? 54 : from.width) : to.width || 70,
        h = exit ? (phase === "draw" ? 78 : from.height) : to.height || 100;
      Object.assign(el.style, {
        position: "fixed",
        left: "0px",
        top: "0px",
        width: w + "px",
        height: h + "px",
        minWidth: "0",
        margin: "0",
        zIndex: "300",
        pointerEvents: "none",
      });
      document.body.append(el);
      const x = from.left + (from.width - w) / 2,
        y = from.top + (from.height - h) / 2,
        tx = to.left + (to.width - w) / 2,
        ty = to.top + (to.height - h) / 2;
      const frames = [
        {
          transform: `translate(${x}px,${y}px) rotate(-9deg) scale(.85)`,
          opacity: 1,
        },
        {
          transform: `translate(${(x + tx) / 2}px,${Math.min(y, ty) - 32}px) rotate(3deg) scale(1.08)`,
          opacity: 1,
          offset: 0.5,
        },
        {
          transform: `translate(${tx}px,${ty}px) rotate(${rotation}deg) scale(${exit ? 0.42 : 1})`,
          opacity: exit ? 0.2 : 1,
        },
      ];
      const duration = document.hidden
        ? 0
        : this.duration(phase === "drop" ? 260 : phase === "draw" ? 550 : 950);
      const anim = el.animate(frames, {
        duration,
        delay: document.hidden ? 0 : this.duration(delay),
        easing: "cubic-bezier(.22,.65,.25,1)",
        fill: "both",
      });
      this.running.add(anim);
      try {
        await anim.finished;
      } catch {
      } finally {
        this.running.delete(anim);
        el.remove();
      }
    }
    // Replay the engine's exact operations against a presentation snapshot only.
    async playEvent(before, after, result, paint) {
      const visual = structuredClone(before);
      const labels = [];
      const mark = (seat, text, role) => {
        const anchor = typeof seat === "number" ? this.seat(seat) :
          document.querySelector(seat === "stock" ? ".stock-pile" : ".discard-target");
        if (!anchor) return;
        anchor.classList.add("event-" + role);
        const label = document.createElement("div");
        label.className = "event-seat-label " + role;
        label.textContent = text;
        document.body.append(label);
        const r = anchor.getBoundingClientRect();
        label.style.left = Math.max(6, Math.min(innerWidth - label.offsetWidth - 6,
          r.left + (r.width - label.offsetWidth) / 2)) + "px";
        label.style.top = Math.max(6, Math.min(innerHeight - label.offsetHeight - 6,
          (typeof seat === "number" && seat !== 0 ? r.bottom - 5 : r.top - label.offsetHeight - 5))) + "px";
        labels.push([anchor, role, label]);
      };
      const clear = () => {
        for (const [anchor, role, label] of labels.splice(0)) {
          anchor.classList.remove("event-" + role);
          label.remove();
        }
      };
      const endpoint = (seat) => this.rect(typeof seat === "number" ? this.seat(seat) :
        document.querySelector(seat === "stock" ? ".stock-pile" : ".discard-target"));
      const title = document.querySelector(".turn-label strong");
      if (title) title.textContent = "Происшествие: " + (result.title || "распоряжение вахты");
      const hint = document.querySelector(".turn-label small");
      if (hint) hint.textContent = "Следи за картами — распоряжение исполняется";
      try {
        for (const effect of result.effects) {
          clear();
          if (effect.type === "card") {
            const { card: c, from, to } = effect;
            const source = from === 0 ? document.querySelector(`.hand [data-card="${c}"]`) : null;
            const start = this.rect(source) || endpoint(from);
            if (from === "stock") visual.deck.splice(visual.deck.indexOf(c), 1);
            else visual.players[from].hand.splice(visual.players[from].hand.indexOf(c), 1);
            if (to === "effectDiscard") visual.effectDiscard.push(c);
            else visual.players[to].hand.push(c);
            // Prepare a hidden landing slot while counters still show the previous step.
            paint(visual, to === 0 ? c : null, false);
            const target = to === 0 ? document.querySelector(`.hand [data-card="${c}"]`) : null;
            const end = this.rect(target) || endpoint(to);
            mark(from, from === "stock" ? "Добор из колоды" : "Отдаёт", "source");
            mark(to, to === "effectDiscard" ? "Списание карты" : "Получает", "target");
            await this.wait(220);
            await this.fly(from === 0 || to === 0 || to === "effectDiscard" ? this.card(c) : this.back(),
              start, end && { ...end, left:end.left + (target ? 0 : (end.width - 64) / 2), top:end.top + (target ? 0 : (end.height - 92) / 2),
                width:target ? end.width : 64, height:target ? end.height : 92 },
              { phase: "event", exit: to === "effectDiscard" });
            paint(visual, null, true);
            await this.wait(300);
          } else {
            const text = effect.type === "out" ? "Вышел без карт" : effect.type === "skip" ?
              (after.players[effect.seat].skip ? "Пропуск следующей атаки" : "Атака пропущена") :
              ({cancelled:"Участник уже вышел", "empty-stock":"Колода пуста", none:"Без изменений",
                unavailable:"Нет подходящих карт или участников"}[effect.reason]);
            mark(effect.seat, text, "target");
            const anchor = this.seat(effect.seat);
            if (anchor) {
              const animation = anchor.animate([{filter:"brightness(1)"},{filter:"brightness(1.8)"},
                {filter:"brightness(1)"}], {duration:document.hidden ? 0 : this.duration(1100), iterations:1});
              this.running.add(animation);
              try { await animation.finished; } catch {} finally { this.running.delete(animation); }
            }
            await this.wait(650);
          }
        }
      } finally { clear(); }
    }
    tableHTML(table) {
      return table
        .map(
          (p) =>
            `<div class="card-pair">${this.card(p.attack, { classes: p.defense == null ? "uncovered" : "covered" })}${p.defense != null ? this.card(p.defense, { classes: "defense-card" }) : ""}</div>`,
        )
        .join("");
    }
    async play(before, after, a, releaseRect = null) {
      // Local font loading and viewport resize can otherwise move the target mid-flight.
      await document.fonts.ready;
      if (!document.hidden)
        await new Promise((resolve) => {
          const fallback = setTimeout(resolve, 80);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              clearTimeout(fallback);
              resolve();
            }),
          );
        });
      const pairs = document.querySelector(".pairs");
      if (!pairs) return;
      const actor = before.actor;
      const sourceSeat = this.seat(actor);
      sourceSeat?.closest(".opponent")?.classList.add("moving-player");
      const visual = structuredClone(before.table);
      if (a.type === "attack" || a.type === "transfer")
        visual.push({ attack: a.card, defense: null });
      if (a.type === "defend") visual[a.pair].defense = a.card;
      let source;
      try {
        if (a.card != null) {
          source =
            actor === 0
              ? document.querySelector(
                  `.hand .playing-card[data-card="${a.card}"]`,
                )
              : null;
          await this.layout?.(pairs, visual.length);
          const from = releaseRect || this.rect(source || sourceSeat);
          const measuring = pairs.cloneNode(false),
            bounds = pairs.getBoundingClientRect();
          Object.assign(measuring.style, {
            position: "fixed",
            left: bounds.left + "px",
            top: bounds.top + "px",
            width: bounds.width + "px",
            height: bounds.height + "px",
            visibility: "hidden",
            pointerEvents: "none",
            zIndex: "-1",
          });
          measuring.innerHTML = this.tableHTML(visual);
          document.body.append(measuring);
          this.layout?.(measuring, visual.length, { measure: true });
          const targetEl = measuring.querySelector(
              `.playing-card[data-card="${a.card}"]`,
            ),
            to = this.rect(targetEl);
          const rotation = 0;
          measuring.remove();
          if (source) source.style.visibility = "hidden";
          await this.fly(this.card(a.card), from, to, { rotation, phase: releaseRect ? "drop" : "play" });
          pairs.innerHTML = this.tableHTML(visual);
          this.layout?.(pairs, visual.length);
          await this.wait(250);
        } else {
          await this.wait(450);
        }
        const resolved = visual.length > 0 && after.table.length === 0;
        if (resolved) {
          const taking = before.taking || a.type === "take",
            defender = before.defender;
          await this.wait(500);
          const target = this.rect(
            taking
              ? this.seat(defender)
              : document.querySelector(".discard-target"),
          );
          const all = [...pairs.querySelectorAll(".playing-card")];
          const flights = all.map((el, i) => {
            const from = this.rect(el);
            el.style.visibility = "hidden";
            return this.fly(
              el.outerHTML.replace("visibility: hidden;", ""),
              from,
              target,
              { delay: i * 65, exit: true, phase: taking ? "take" : "discard" },
            );
          });
          await Promise.all(flights);
          await this.wait(200);
        }
        // Show only backs during replenishment: opponents' new cards stay private.
        const drawn = before.deck
          .filter(VahtaEngine.ordinary)
          .filter((c) => !after.deck.includes(c));
        if (drawn.length) {
          const from = this.rect(
            document.querySelector(".stock-pile .back-card") ||
              document.querySelector(".stock-pile"),
          );
          await Promise.all(
            drawn.map((c, k) => {
              const target = after.players.findIndex((p) => p.hand.includes(c));
              return target < 0
                ? null
                : this.fly(this.back(), from, this.rect(this.seat(target)), {
                    delay: k * 70,
                    exit: true,
                    phase: "draw",
                  });
            }),
          );
          await this.wait(200);
        }
      } finally {
        if (source) source.style.visibility = "";
        sourceSeat?.closest(".opponent")?.classList.remove("moving-player");
      }
    }
  }
  root.VahtaMotion = VahtaMotion;
})(globalThis);

;
(function () {
  "use strict";
  const E = VahtaEngine,
    F = VahtaEvents,
    S = VahtaSave,
    C = VahtaContent,
    EC = VahtaEventCards;
  F.setContent(EC);
  let loaded;
  try {
    loaded = S.load(localStorage);
  } catch {
    loaded = {
      profile: S.fresh(),
      warning: "Хранилище браузера недоступно. Используйте экспорт.",
    };
  }
  let P = loaded.profile,
    G = P.game,
    screen = P.name ? "menu" : "welcome",
    returnScreen = "menu",
    selected = null,
    eventChoice = "",
    eventTarget = null,
    eventCard = null,
    timer = null,
    paused = false,
    animating = false,
    drag = null,
    lastTap = null,
    suppressCardClickUntil = 0,
    dialog = null,
    lastDialog = -9,
    recent = [],
    emotion = {},
    lastActionAt = Date.now(),
    galleryMode = "cards",
    newAchievements = [];
  const view = {
    setup: "conditions",
    settings: "general",
    profile: "identity",
  };
  const pageIndex = {};
  let eventStep = 0,
    eventKey = "",
    profileDraft = null;
  let setup = {
    count: 4,
    npcs: [0, 1, 2],
    variant: "standard",
    chaos: true,
    frequency: "normal",
    difficulty: "medium",
  };
  const $ = (s) => document.querySelector(s),
    audio = new VahtaAudio(P.settings),
    esc = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const name = (i) => `<span data-name="${i}"></span>`,
    playerName = () => "<span data-player-name></span>";
  function sprite(sheet, index, cols, rows, classes = "", extra = "") {
    return `<span class="sprite ${classes}" style="background-image:url('public/assets/${sheet}.webp?v=${globalThis.VahtaBuild?.id || "dev"}');background-size:${cols * 100}% ${rows * 100}%;background-position:${((index % cols) / (cols - 1)) * 100}% ${(Math.floor(index / cols) / (rows - 1)) * 100}%;${extra}"></span>`;
  }
  function avatar(npc, em = 0, classes = "") {
    if (npc >= 6)
      return sprite("npc-extra", npc - 6 + 5 * em, 5, 4, "avatar " + classes);
    return npc === 5
      ? sprite("decor", 5, 4, 3, "avatar " + classes)
      : sprite("npc", Math.max(0, npc) + 5 * em, 5, 4, "avatar " + classes);
  }
  function button(text, action, classes = "", extra = "") {
    return `<button class="btn ${classes}" data-action="${action}" ${extra}>${text}</button>`;
  }
  function clean(t) {
    return P.settings.humor === "full" ? t : C.clean(t);
  }
  function persist() {
    P.game = G;
    try {
      if (!S.write(localStorage, P)) throw Error("storage");
    } catch {
      toast("Не удалось сохранить: экспортируйте прогресс в профиле.");
    }
  }
  function toast(t) {
    $("#toast").textContent = t;
    $("#toast").classList.add("visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(
      () => $("#toast").classList.remove("visible"),
      4000,
    );
  }
  function show(next) {
    clearTimeout(timer);
    cancelDrag();
    lastTap = null;
    screen = next;
    selected = null;
    lastActionAt = Date.now();
    render();
  }
  function heading(kicker, title, subtitle = "") {
    return `<div class="section-heading"><span class="eyebrow">${kicker}</span><h1>${title}</h1>${subtitle ? "<p>" + subtitle + "</p>" : ""}</div>`;
  }
  function header() {
    return `<header><button class="brand" data-action="menu" aria-label="В главное меню">${sprite("decor", 4, 4, 3, "brand-mark")}<span>ДУРАК <small>НА ВАХТЕ</small></span></button><div class="header-note">СЕВЕРНЫЙ УЧАСТОК · −45 °C</div><button class="profile-chip" data-action="profile">${avatar(P.avatar)}<span>${playerName()}<small>${S.rank(P.xp)}</small></span></button></header>`;
  }
  function panelPage(content) {
    return `${header()}<main class="page">${button("Назад", "back", "back")} ${content}</main>`;
  }
  function welcome() {
    return `<main class="welcome"><div class="welcome-art">${sprite("decor", 4, 4, 3, "welcome-mark")}<span class="eyebrow">ДОРОГА ЗАКОНЧИЛАСЬ. ВАХТА НАЧАЛАСЬ.</span><h1>ДУРАК<br><em>НА ВАХТЕ</em></h1><p>За окном мороз. За столом — свои.</p></div><form id="name-form" class="paper onboarding">${avatar(5)}<span class="eyebrow">ПРОПУСК В БЫТОВКУ</span><h2>Как тебя зовут, боец?</h2><label for="player-name">Имя для коллег за столом</label><input id="player-name" name="name" autocomplete="given-name" maxlength="24" placeholder="Например, Саша" required><small id="name-help">2–24 буквы, пробелы и дефисы.</small><button class="btn primary" id="name-submit" type="submit" disabled>Поехали на вахту</button><p class="fine">Работает без интернета. Всё сохраняется только на этом устройстве.</p><p class="fine">18+ · В диалогах есть мат. Его можно отключить в настройках.</p></form></main>`;
  }
  function menu() {
    return `${header()}<main class="menu"><section class="menu-copy"><span class="eyebrow">ЧЕСТНЫЕ КАРТЫ. НЕЧЕСТНО ДОЛГАЯ ВАХТА.</span><h1>ДУРАК<br><em>НА ВАХТЕ</em></h1><p>Чай налит. Колода перемешана.<br>Осталось выяснить, кто сегодня дежурный.</p><div class="menu-actions">${G && !G.finished ? button("Продолжить партию", "continue", "primary") : ""}${button("Новая партия", "setup", G && !G.finished ? "" : "primary")}<div class="menu-grid">${button("Колода", "gallery")}${button("Достижения", "achievements")}${button("Профиль", "profile")}${button("Настройки", "settings")}${button("Правила", "rules")}</div></div><div class="menu-foot"><span class="status-dot"></span>ОФЛАЙН · БЕЗ СТАВОК · ТОЛЬКО СВОИ <span class="build-version">v${esc(globalThis.VahtaBuild?.version || "dev")}</span></div></section><section class="menu-crew" aria-label="Коллеги по вахте"><div class="crew-pictures">${avatar(1, 1, "crew-side")}${avatar(0, 0, "crew-main")}${avatar(4, 0, "crew-side")}</div><blockquote id="menu-quote"></blockquote><small>ПАЛЫЧ · 30 ЛЕТ СТАЖА, НИ ДНЯ БЕЗ КАРТ</small></section></main>`;
  }
  function tabs(key, entries) {
    return `<nav class="tabs screen-tabs" aria-label="Разделы">${entries.map(([id, label]) => button(label, "view-tab", view[key] === id ? "primary" : "", `data-key="${key}" data-value="${id}" aria-pressed="${view[key] === id}"`)).join("")}</nav>`;
  }
  function slicePage(key, items, size) {
    const total = Math.max(1, Math.ceil(items.length / size));
    const page = Math.min(pageIndex[key] || 0, total - 1);
    pageIndex[key] = page;
    return {
      items: items.slice(page * size, (page + 1) * size),
      nav: `<nav class="pager" aria-label="Страницы">${button("← Назад", "page-prev", "small", `data-key="${key}" ${page === 0 ? "disabled" : ""}`)}<span aria-live="polite">${page + 1} / ${total}</span>${button("Далее →", "page-next", "small", `data-key="${key}" ${page === total - 1 ? "disabled" : ""}`)}</nav>`,
    };
  }
  const lowScreen = () => innerHeight < 500;
  function setupPage() {
    const roster = slicePage("roster", C.NPC, innerWidth >= 1000 ? 4 : 2);
    return panelPage(
      heading("НАРЯД НА ВЕЧЕР", "Новая партия") +
        tabs("setup", [
          ["conditions", "Условия"],
          ["crew", "Бригада"],
        ]) +
        (view.setup === "conditions"
          ? `<section class="paper setup-controls screen-content"><div class="form-grid"><label>Правила<select id="variant"><option value="standard">Подкидной</option><option value="transfer">Переводной</option></select></label><label>За столом<select id="count">${[2, 3, 4].map((n) => `<option value="${n}">${n} участника</option>`).join("")}</select></label><label>Боты<select id="difficulty"><option value="easy">Новичок</option><option value="medium">Бывалый</option><option value="hard">Палыч</option></select></label><label>Происшествия<select id="frequency"><option value="rare">Редко</option><option value="normal">Обычно</option><option value="mad">Беспредел</option></select></label><label class="check wide"><input type="checkbox" id="chaos">Вахтовый беспредел</label></div><p class="fine setup-note">Секретная колода: сюрпризы между раундами. Без галочки — классический дурак.</p>${button("Выбрать бригаду →", "view-tab", "", 'data-key="setup" data-value="crew"')}</section>`
          : `<section class="roster-screen screen-content"><div class="roster-top"><h2>Выбери соперников</h2>${button("Случайно", "random-roster", "small")}</div><div class="npc-grid">${roster.items.map((n) => `<button class="npc-card ${setup.npcs.includes(n.id) ? "chosen" : ""}" data-action="npc" data-id="${n.id}" aria-pressed="${setup.npcs.includes(n.id)}"><span class="npc-portrait">${avatar(n.id)}</span><span class="npc-info"><strong>${n.name}</strong><small>${n.job}</small><p>${n.style}</p><b>${setup.npcs.includes(n.id) ? "✓ В бригаде" : "Выбрать"}</b></span></button>`).join("")}</div>${roster.nav}</section>`) +
        `<footer class="setup-footer"><div><strong>За столом: ${setup.npcs.map((id) => esc(C.NPC.find((n) => n.id === id).name)).join(", ") || "выбери коллег"}</strong><small id="roster-help"></small></div>${button("Играть", "start", "primary")}</footer>`,
    );
  }
  function cardArt(id) {
    const { rank, suit } = E.card(id);
    if (rank === 11) return suit;
    if (rank === 12) return 4 + suit;
    if (rank === 13) return 8 + suit;
    if (rank === 14) return 12 + suit;
    return 16 + ((rank - 6) % 5);
  }
  function card(
    id,
    {
      action = "",
      extra = "",
      disabled = false,
      selected = false,
      classes = "",
    } = {},
  ) {
    const c = E.card(id),
      r = E.RANKS[c.rank - 6],
      s = E.SUITS[c.suit];
    return `<${action ? "button" : "div"} class="playing-card ${c.suit === 1 || c.suit === 2 ? "red" : "black"} ${selected ? "selected" : ""} ${classes}" ${action ? 'data-action="' + action + '"' : ""} data-card="${id}" ${extra} ${disabled ? "disabled" : ""} aria-label="${r} ${s}"><span class="corner">${r}<b>${s}</b></span>${sprite("cards", cardArt(id), 6, 4, "card-illustration")}<span class="corner lower">${r}<b>${s}</b></span></${action ? "button" : "div"}>`;
  }
  function backCard(event = false) {
    return `<div class="playing-card back-card">${event ? sprite("cards", 22, 6, 4, "card-back-art") : sprite(P.back ? "decor" : "cards", P.back ? 8 : 21, P.back ? 4 : 6, P.back ? 3 : 4, "card-back-art")}</div>`;
  }
  function role(i) {
    if (G.players[i].out) return "Вышел из партии";
    if (G.phase === "event" && G.event.recipient === i)
      return "Адресат происшествия";
    if (i === G.defender) return G.taking ? "Берёт карты" : "Отбивается";
    if (i === G.actor) return "Ходит";
    if (G.players[i].skip) return "Пропустит атаку";
    return "Ожидает";
  }
  function game() {
    if (!G) return menu();
    if (G.finished) return results();
    const moves = E.legal(G, 0),
      my = G.players[0],
      canAct = G.actor === 0 && !paused && G.phase !== "event",
      hand = my.hand
        .slice()
        .sort(
          (a, b) =>
            (E.card(a).suit === G.trump) - (E.card(b).suit === G.trump) ||
            E.card(a).suit - E.card(b).suit ||
            E.card(a).rank - E.card(b).rank,
        );
    const nameRole =
      G.actor === 0
        ? "Твой ход"
        : G.actor >= 0
          ? `Ходит ${name(G.actor)}`
          : "Раунд завершён";
    const selectedMoves = moves.filter((a) => a.card === selected);
    const pass = moves.find((a) => a.type === "pass"),
      take = moves.find((a) => a.type === "take");
    const actionButtons = selectedMoves
      .filter((a) => a.type !== "defend")
      .map((a) =>
        button(
          a.type === "transfer"
            ? "Перевести"
            : G.phase === "attacking"
              ? "Ходить"
              : "Подкинуть",
          "play-selected",
          "primary",
          `data-type="${a.type}"`,
        ),
      )
      .join("");
    return `${header()}<main class="game-scene"><div class="game-toolbar"><span class="eyebrow"><span class="mode-label">${G.options.variant === "transfer" ? "ПЕРЕВОДНОЙ" : "ПОДКИДНОЙ"} · ${G.options.chaos ? "БЕСПРЕДЕЛ" : "КЛАССИКА"}</span><span class="round-label">РАУНД ${G.round}</span></span><div>${button("Пауза", "pause", "small")}${button("Настройки", "settings", "small")}</div></div><div class="opponents">${G.players
      .slice(1)
      .map(
        (p, j) =>
          `<article data-seat="${j + 1}" class="opponent ${G.actor === j + 1 ? "active" : ""} ${p.out ? "out" : ""} ${G.defender === j + 1 ? "defending-player" : ""}">${avatar(p.npc, emotion[j + 1] || 0)}<div><strong>${name(j + 1)}</strong><small>${role(j + 1)}</small><span class="hand-count" aria-label="${role(j + 1)} · ${p.hand.length} карт">${G.defender === j + 1 ? (G.taking ? "Берёт" : "Бьётся") + " · " + p.hand.length : p.hand.length + " карт"}</span></div></article>`,
      )
      .join(
        "",
      )}</div><section class="table-zone"><aside class="stocks"><div class="stock-pile">${E.stockCount(G) > 0 ? backCard() : ""}${E.stockCount(G) > 0 ? card(G.trumpCard, { classes: "trump-show" }) : `<div class="empty-trump ${G.trump === 1 || G.trump === 2 ? "red" : "black"}" role="img" aria-label="Козырная масть ${E.SUITS[G.trump]}"><span>${E.SUITS[G.trump]}</span></div>`}</div><strong>${E.stockCount(G)} в колоде</strong><div class="discard-target" aria-label="Отбой">Отбой · ${G.discard.length}</div></aside><div class="battle"><div class="turn-label"><strong>${nameRole}<span class="defender-line">${G.defender === 0 ? (G.taking ? "Ты берёшь карты" : "Атакуют тебя") : (G.taking ? "Берёт: " : "Отбивается: ") + name(G.defender)}</span></strong><small>${paused ? "Партия на паузе" : G.phase === "defending" ? (G.actor === 0 ? "Перетащи карту на цель или дважды нажми на свою карту." : "Защита в процессе") : G.phase === "taking" ? "Подкидывание перед взятием" : G.phase === "adding" ? "Все атакующие могут подкинуть или завершить" : "Ходи кнопкой или двойным нажатием на карту"}</small></div><div class="pairs" data-game="${esc(G.gameId)}" data-round="${G.round}">${G.table.length ? G.table.map((pair, i) => `<div class="card-pair">${card(pair.attack, { action: G.actor === 0 && G.phase === "defending" && pair.defense == null ? "cover" : "", extra: `data-pair="${i}"`, classes: pair.defense == null ? "uncovered" : "covered" })}${pair.defense != null ? card(pair.defense, { classes: "defense-card" }) : ""}</div>`).join("") : ""}</div><button data-action="talk" data-speaker="${dialog?.who ?? ""}" data-addressee="${dialog?.target ?? ""}" class="speech" aria-label="Прочитать реплику целиком" ${dialog ? "" : "hidden"}>${dialog ? avatar(G.players[dialog.who]?.npc ?? 0, emotion[dialog.who] || 0) : ""}<div><strong>${dialog ? name(dialog.who) + " → " + name(dialog.target) : ""}</strong><p id="dialog-text"></p></div></button></div><aside class="table-log"><h3>Журнал смены</h3><ol id="game-log"></ol><span class="discard-count">В отбое: ${G.discard.length}<br>Списано эффектами: ${G.effectDiscard.length}</span></aside></section><section class="human-zone ${G.defender === 0 ? "defending-player" : ""}"><div class="human-caption">${avatar(P.avatar)}<div><strong>${playerName()}</strong><small>${my.hand.length} карт</small></div><div class="game-actions">${actionButtons}${take ? button("Взять", "take", "danger") : ""}${pass ? button(G.taking ? "Готово" : "Бито", "pass", "primary") : ""}${selected != null ? button("Рассмотреть", "inspect", "small") : ""}${my.out ? '<span class="finished-note">Ты вышел. Бригада доигрывает.</span>' : ""}</div></div><div class="hand" role="group" aria-label="Твои карты" style="--hand-count:${Math.max(6, hand.length)}">${hand.map((c) => card(c, { action: "select-card", selected: c === selected, classes: canAct && !moves.some((a) => a.card === c) ? "not-playable" : "" })).join("")}</div><p class="hand-help">${canAct ? (selected == null ? "Выбери карту. Подсвечены карты с разрешённым действием." : selectedMoves.some((a) => a.type === "defend") ? "Перетащи на цель или дважды нажми для защиты." : selectedMoves.length ? "Нажми кнопку или дважды нажми на карту." : "Эта карта сейчас не подходит. Выбери другую.") : "Можно рассматривать свои карты, пока коллеги ходят."}</p></section></main>`;
  }
  function eventView() {
    const v = F.spec(G);
    if (!v) return "";
    const e = EC[v.id],
      self = G.players[v.recipient],
      human = v.recipient === 0 && !self.out;
    const key = `${G.round}:${G.event.id}:${G.metrics.events.length}`;
    if (eventKey !== key) {
      eventKey = key;
      eventStep = 0;
    }
    const kind = v.choices.length ? eventChoice : v.kind;
    const needsCard = ["give", "discard", "swap_selected", "left"].includes(
        kind,
      ),
      needsTarget = ["give", "swap", "swap_selected", "skip_target"].includes(
        kind,
      );
    const eligible =
      kind === "discard"
        ? self.hand.filter((c) => E.card(c).suit !== G.trump)
        : self.hand;
    const steps = [
      "story",
      ...(human && v.choices.length ? ["choice"] : []),
      ...(human && needsTarget && v.targets.length ? ["target"] : []),
      ...(human && needsCard && eligible.length ? ["card"] : []),
      ...(human ? ["confirm"] : []),
    ];
    eventStep = Math.min(eventStep, steps.length - 1);
    const step = steps[eventStep],
      last = eventStep === steps.length - 1;
    const invalid =
      (step === "choice" && !eventChoice) ||
      (step === "target" && !v.targets.includes(eventTarget)) ||
      (step === "card" && !eligible.includes(eventCard));
    const summary = `${eventChoice ? v.choices.find((c) => c[0] === eventChoice)?.[1] || "" : ""}${eventTarget != null ? " · " + G.players[eventTarget].name : ""}${eventCard != null ? " · " + E.label(eventCard) : ""}`;
    return `<div class="modal event-modal step-${step}" role="dialog" aria-modal="true" aria-labelledby="event-title"><div class="event-picture">${sprite("events", e.id, 6, 5, "event-art")}</div><section class="event-copy"><div class="event-heading"><span class="eyebrow">ПРОИСШЕСТВИЕ · ${eventStep + 1} / ${steps.length} · ${name(v.recipient)}</span><h2 id="event-title">${esc(clean(e.title))}</h2></div><div class="event-stage">${step === "story" ? `<p class="event-story">${esc(clean(e.story))}</p><div class="effect-box"><strong>Что произойдёт</strong><p>${esc(clean(e.effect))}</p></div>${self.out ? "<p>Участник уже вышел — эффект отменён.</p>" : ""}` : step === "choice" ? `<fieldset><legend>Выбери распоряжение</legend>${v.choices.map(([value, label]) => `<label class="choice"><input type="radio" name="event-choice" value="${value}" ${eventChoice === value ? "checked" : ""}>${label}</label>`).join("")}</fieldset>` : step === "target" ? `<fieldset><legend>Кому достанется?</legend><div class="target-list">${v.targets.map((i) => `<button data-action="event-target" data-id="${i}" class="target ${eventTarget === i ? "chosen" : ""}">${avatar(G.players[i].npc)}${name(i)}<small>${G.players[i].hand.length} карт</small></button>`).join("")}</div></fieldset>` : step === "card" ? `<fieldset><legend>Выбери свою карту</legend><div class="event-hand">${eligible.map((c) => card(c, { action: "event-card", selected: eventCard === c })).join("")}</div></fieldset>` : `<div class="effect-box"><strong>Распоряжение готово</strong><p>${esc(clean(e.effect))}</p></div><p class="event-summary">${esc(summary)}</p>${(needsCard && !eligible.length) || (needsTarget && !v.targets.length) ? "<p>Нет подходящей карты или соперника. Эффект отменяется.</p>" : ""}`}</div><footer class="event-actions">${eventStep > 0 ? button("← Назад", "event-prev") : ""}${last ? button(human ? "Исполнить" : "Продолжить", "event-accept", "primary") : button("Далее →", "event-next", "primary", invalid ? "disabled" : "")}</footer></section></div>`;
  }
  function results() {
    if (!G?.finished) return menu();
    const r = G.result,
      win = !r.draw && r.loser !== 0;
    if (!r.draw && r.loser === 0) return panelPage(
      `<div class="results loss-results"><figure class="loss-art"><img src="public/assets/loss-crew.webp?v=${globalThis.VahtaBuild?.id || "dev"}" alt="Вахтовики в бытовке смеются и показывают пальцем прямо на тебя"></figure><section class="loss-copy">${heading("ДУРАК СМЕНЫ НАЙДЕН", "Ну что, доигрался?")}<blockquote id="result-quote"></blockquote><div class="result-players">${G.players.map((p,i)=>`<article>${avatar(i === 0 ? P.avatar : p.npc, i === 0 ? 2 : 1)}<strong>${name(i)}</strong><small>${p.out ? "Вышел без карт" : p.hand.length + " карт на руках"}</small></article>`).join("")}</div><p class="loss-stats">${G.round} раундов · ${G.metrics.events.length} происшествий · +35 опыта</p>${newAchievements.length ? "<p>Открыто: " + newAchievements.map(k=>S.achievements.find(a=>a[0]===k)[1]).join(", ") + "</p>" : ""}<div class="result-actions">${button("Отыграться", "rematch", "primary")}${button("В меню", "menu")}</div></section></div>`
    );
    return panelPage(
      `<div class="results">${sprite("cards", 23, 6, 4, "result-badge")}${heading("СМЕНА ЗАКРЫТА", r.draw ? "Ничья. Все свободны." : win ? "Вахта пережита!" : "Дежурный найден.", r.draw ? "Последние карты ушли одновременно." : win ? "Ты вышел из партии. Кипяти чай, пока коллеги разбираются." : "Завтра отыграешься. А сегодня — чайник и швабра.")}<h2>${r.draw ? "Никто не остался с картами." : "Дурак партии — " + name(r.loser)}</h2><div class="result-players">${G.players.map((p, i) => `<article>${avatar(i === 0 ? P.avatar : p.npc, i === 0 ? 0 : r.loser === i ? 2 : 1)}<strong>${name(i)}</strong><small>${p.out ? "Вышел без карт" : p.hand.length + " карт на руках"}</small></article>`).join("")}</div><p>${G.round} раундов · ${G.metrics.events.length} происшествий · +${win ? 120 : r.draw ? 60 : 35} опыта</p>${newAchievements.length ? "<p>Открыто: " + newAchievements.map((k) => S.achievements.find((a) => a[0] === k)[1]).join(", ") + "</p>" : ""}<blockquote id="result-quote"></blockquote><div class="result-actions">${button("Ещё партия", "rematch", "primary")}${button("В меню", "menu")}</div></div>`,
    );
  }
  function settings() {
    return panelPage(
      heading("БЫТОВЫЕ УСЛОВИЯ", "Настройки") +
        tabs("settings", [
          ["general", "Диалоги"],
          ["motion", "Ходы"],
          ["audio", "Звук"],
        ]) +
        `<section class="paper settings-grid screen-content">${view.settings === "general" ? `<label>Юмор<select data-setting="humor"><option value="clean">Без мата</option><option value="moderate">Умеренно</option><option value="full">Настоящая вахта · 18+</option></select></label><label>Реплики коллег<select data-setting="dialogs"><option value="off">Отключены</option><option value="rare">Редко</option><option value="normal">Обычно</option></select></label><p class="fine">Коллеги обращаются к тебе по имени из профиля.</p>` : view.settings === "motion" ? `<label class="check"><input type="checkbox" data-setting="fast">Ускорить ходы и анимации</label><label class="check"><input type="checkbox" data-setting="reduced">Уменьшить движение</label><p class="fine">Без ускорения карты летят по очереди. Можно проследить каждый ход.</p>` : `<label>Музыка<input type="range" min="0" max="1" step=".05" data-setting="music"></label><label>Звуковые эффекты<input type="range" min="0" max="1" step=".05" data-setting="sfx"></label>${button("Выключить весь звук", "mute")}`}</section>${button("Готово", "back", "primary page-done")}`,
    );
  }
  function profile() {
    const avatars = slicePage(
      "avatars",
      Array.from({ length: 11 }, (_, i) => i),
      6,
    );
    return panelPage(
      heading("ЛИЧНОЕ ДЕЛО", "Твой пропуск") +
        tabs("profile", [
          ["identity", "Профиль"],
          ["stats", "Табель"],
          ["saves", "Сохранения"],
        ]) +
        `<section class="paper profile-pane screen-content">${
          view.profile === "identity"
            ? `<div class="profile-name"><label for="profile-name">Твоё имя<input id="profile-name" maxlength="24"></label>${button("Сохранить", "save-name", "primary")}</div><p class="fine">${S.rank(P.xp)} · ${P.xp} опыта · Выбери портрет</p><div class="avatars">${avatars.items.map((n) => `<button class="avatar-choice ${P.avatar === n ? "chosen" : ""}" data-action="avatar" data-id="${n}" aria-label="Аватар ${n + 1}" aria-pressed="${P.avatar === n}">${avatar(n)}</button>`).join("")}</div>${avatars.nav}`
            : view.profile === "stats"
              ? [
                  ["Классика", P.stats.classic],
                  ["Беспредел", P.stats.chaos],
                ]
                  .map(
                    ([title, st]) =>
                      `<section class="stat-section"><h2>${title}</h2><div class="stats">${[
                        ["Партий", st.played],
                        ["Побед", st.wins],
                        ["Поражений", st.losses],
                        ["Ничьих", st.draws],
                        ["Серия", st.streak],
                        ["Лучшая", st.best],
                      ]
                        .map(
                          ([k, v]) =>
                            `<div><strong>${v}</strong><small>${k}</small></div>`,
                        )
                        .join("")}</div></section>`,
                  )
                  .join("")
              : `<p>Прогресс хранится на этом устройстве. Экспортируй файл для резервной копии.</p><div class="save-actions">${button("Экспорт JSON", "export")}${button("Импорт JSON", "import")}${button("Сбросить прогресс", "reset", "danger")}</div><input type="file" id="import-file" accept="application/json,.json" hidden><p class="fine">Импорт и сброс требуют подтверждения.</p>`
        }</section>`,
    );
  }
  function achievements() {
    const a = slicePage("achievements", S.achievements, lowScreen() ? 1 : 2);
    return panelPage(
      heading("ГОРДОСТЬ УЧАСТКА", "Достижения") +
        `<div class="achievement-grid screen-content">${a.items.map(([id, title, desc]) => `<article class="paper achievement ${P.achievements.includes(id) ? "unlocked" : ""}">${sprite("decor", [6, 7, 10, 6, 11, 7][S.achievements.findIndex((n) => n[0] === id)], 4, 3, "achievement-art")}<div><small>${P.achievements.includes(id) ? "ПОЛУЧЕНО" : "ЕЩЁ НЕ ПОЛУЧЕНО"}</small><h2>${title}</h2><p>${desc}</p></div></article>`).join("")}</div>${a.nav}`,
    );
  }
  function gallery() {
    const cards = slicePage(
      "cards",
      Array.from({ length: 36 }, (_, i) => i),
      6,
    );
    return panelPage(
      heading("ПРОВЕРЕНО ПО ВЕДОМОСТИ", "Игральная колода") +
        `<nav class="tabs">${button("Карты", "gallery-cards", galleryMode === "cards" ? "primary" : "")}${button("Рубашки", "gallery-backs", galleryMode === "backs" ? "primary" : "")}</nav>` +
        (galleryMode === "cards"
          ? `<div class="gallery-cards screen-content">${cards.items.map((c) => card(c, { action: "gallery-card" })).join("")}</div>${cards.nav}`
          : `<div class="paper back-select screen-content"><p>Другая рубашка открывается за любое достижение.</p><div class="skin-row">${[0, 1].map((i) => `<button data-action="back-skin" data-id="${i}" class="skin ${P.back === i ? "chosen" : ""}" ${i && !P.achievements.length ? "disabled" : ""}>${sprite(i ? "decor" : "cards", i ? 8 : 21, i ? 4 : 6, i ? 3 : 4, "back-preview")}<span>${i ? "Северный узор" : "Бытовка"} ${i && !P.achievements.length ? "· Закрыто" : ""}</span></button>`).join("")}</div></div>`),
    );
  }
  const rulePages = [
    [
      "Классика",
      "36 карт, от шестёрки до туза. По 6 карт каждому. Первый ход — у обладателя младшего козыря; если козырей на руках нет, начинает первый участник.",
    ],
    [
      "Классика",
      "Покрой карту более старшей той же масти или козырем. Козырь можно побить только старшим козырем. Подкидываются достоинства, уже лежащие на столе: и атакующие, и покрывающие.",
    ],
    [
      "Классика",
      "За раунд — не больше 6 атакующих карт и не больше размера руки защитника на начало раунда. Подкидывание идёт по очереди; каждый атакующий может завершить его. «Взять» не закрывает подкидывание немедленно.",
    ],
    [
      "Классика",
      "После «бито» атакует защитник. После взятия — следующий за ним активный участник. Добирает начинавший атаку, затем остальные по часовой стрелке, защитник последним. Открытый козырь — последняя карта колоды.",
    ],
    [
      "Переводной",
      "Пока ни одна карта не покрыта, положи карту того же достоинства и нажми «Перевести». Следующий участник должен иметь достаточно карт для новой атаки. Не больше 6 атакующих карт. Вдвоём перевод тоже разрешён.",
    ],
    [
      "Беспредел",
      "Отдельная колода из 30 происшествий. В обычном стоке скрыты 2, 4 или 6 жетонов, не заменяющих игральные карты. Жетон не попадает в руку. Эффект открывается после добора, не более одного между раундами. Остальные ждут очереди. Сильные происшествия выпадают реже.",
    ],
    [
      "Беспредел",
      "Точный эффект написан на карточке. Выбирай цель и карту, если нужно. Вышедшие участники не возвращаются. Пропуск атаки не отменяет обязанность защищаться. Пустой сток не создаёт карты из воздуха.",
    ],
    [
      "Управление",
      "Двойное нажатие на карту делает ход, подкидывает или бьёт первую подходящую непокрытую карту. Для точного выбора цели защиты перетащи свою карту на атакующую. Можно выбрать карту и нажать кнопку атаки или карту цели. Tab и Enter управляют кнопками; «Рассмотреть» увеличивает карту.",
    ],
    [
      "Конец партии",
      "Когда сток пуст, участники без карт выходят. Последний с картами — дурак. Если последний эпизод оставил всех без карт — ничья. При выходе игрока боты честно доигрывают партию.",
    ],
    [
      "Без интернета",
      "Все изображения, звук, правила и сохранения находятся на устройстве. Для резервной копии используй экспорт в профиле. Сбрасывать прогресс можно только после подтверждения.",
    ],
  ];
  function rules() {
    const r = slicePage("rules", rulePages, 1);
    return panelPage(
      heading("БЕЗ СПОРОВ О ПРАВИЛАХ", "Как играть") +
        `<article class="paper rules screen-content"><span class="eyebrow">ПАМЯТКА ${pageIndex.rules + 1} / ${rulePages.length}</span><h2>${r.items[0][0]}</h2><p>${r.items[0][1]}</p></article>${r.nav}`,
    );
  }
  // Overlapping rows expose an opaque rank/suit strip for every card. Never scroll.
  function layoutHands() {
    document.querySelectorAll(".npc-portrait").forEach((el) => {
      const size = Math.min(el.clientWidth, el.clientHeight);
      el.firstElementChild.style.width = size + "px";
      el.firstElementChild.style.height = size + "px";
    });
    document.querySelectorAll(".hand, .event-hand").forEach((hand) => {
      const cards = [...hand.querySelectorAll(".playing-card")];
      const width = hand.clientWidth - 8;
      if (!cards.length || width < 1) return;
      const compact = innerHeight <= 600 && innerWidth > innerHeight;
      const cw = compact ? 62 : innerWidth <= 500 ? 72 : 94,
        ch = Math.round(cw * 1.44);
      const strip = 24;
      const capacity = Math.max(1, Math.floor((width - cw) / strip) + 1);
      const rows = Math.ceil(cards.length / capacity);
      const perRow = Math.ceil(cards.length / rows);
      const rowStep = compact ? 40 : 44;
      hand.style.height = ch + (rows - 1) * rowStep + 19 + "px";
      hand.style.setProperty("--fan-card-width", cw + "px");
      hand.style.setProperty("--fan-card-height", ch + "px");
      cards.forEach((card, i) => {
        const row = Math.floor(i / perRow),
          col = i % perRow,
          count = Math.min(perRow, cards.length - row * perRow);
        const step =
          count > 1 ? Math.min(cw + 7, (width - cw) / (count - 1)) : 0;
        const left = (width - (cw + step * (count - 1))) / 2 + 4;
        card.style.left = left + col * step + "px";
        card.style.top = 13 + row * rowStep + "px";
        card.style.zIndex = String(row * 40 + col + 1);
      });
    });
    layoutTable();
  }
  function layoutTable() {
    const table = $(".table-zone"),
      pairs = $(".pairs");
    if (!table || !pairs) return;
    const count = pairs.querySelectorAll(".card-pair").length;
    const hintKey = `${pairs.dataset.game}:${pairs.dataset.round}`;
    if (cameraHintState.key !== hintKey)
      cameraHintState = { key: hintKey, hidden: false };
    cameraHintState.hidden ||= innerWidth < 750 && table.clientHeight < 340;
    $(".game-scene").classList.toggle("camera-tight", cameraHintState.hidden);
    $(".game-scene").classList.toggle(
      "dense-table",
      table.clientHeight < (innerWidth < 750 ? 340 : 280) ||
        (innerWidth < 750 && count > 3 && table.clientHeight < 430),
    );
    layoutPairs(pairs, count);
  }
  let cameraHintState = { key: null, hidden: false };
  const tableCamera = new VahtaTableCamera(() => P.settings);
  function layoutPairs(pairs, count, options = {}) {
    return tableCamera.layout(pairs, count, options);
  }
  const tableResizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => layoutTable())
      : null;
  window.addEventListener("resize", () => {
    cancelDrag();
    // Android keyboards resize the visual viewport: preserve the active text field and draft.
    const typing = document.activeElement?.matches(
      "#player-name, #profile-name",
    );
    if (!animating && !typing && screen !== "welcome") render();
    else layoutHands();
  });
  function fillNames() {
    document.querySelectorAll("[data-name]").forEach((el) => {
      const i = Number(el.dataset.name);
      el.textContent = G?.players[i]?.name || P.name;
    });
    document.querySelectorAll("[data-player-name]").forEach((el) => {
      el.textContent = P.name;
      el.title = P.name;
    });
  }
  function openTalk() {
    paused = true;
    clearTimeout(timer);
    audio.pause(true);
    const entries = [
      ...(dialog
        ? [
            {
              title: G.players[dialog.who]?.name || "Бригада",
              text: dialog.text,
            },
          ]
        : []),
      ...(G?.log || [])
        .slice(-10)
        .reverse()
        .map((text) => ({ title: "Журнал смены", text: clean(text) })),
    ];
    const r = slicePage(
      "talk",
      entries.length
        ? entries
        : [{ title: "Бригада", text: "Чай налит. Карты на стол!" }],
      1,
    );
    const e = r.items[0];
    $("#overlay").innerHTML =
      `<div class="modal compact-modal talk-modal" role="dialog" aria-modal="true"><h2>${esc(e.title)}</h2><p>${esc(e.text)}</p>${r.nav}${button("К игре", "unpause", "primary")}</div>`;
  }
  function render() {
    if (animating) return;
    cancelDrag();
    clearTimeout(timer);
    document.body.classList.toggle("reduced", P.settings.reduced);
    document.body.classList.toggle("fast", P.settings.fast);
    document.body.dataset.screen = screen;
    const pages = {
      welcome,
      menu,
      setup: setupPage,
      game,
      results,
      settings,
      profile,
      achievements,
      gallery,
      rules,
    };
    $("#app").innerHTML = (pages[screen] || menu)();
    $("#overlay").innerHTML =
      screen === "game" && G?.phase === "event" ? eventView() : "";
    fillNames();
    if (screen === "menu")
      $("#menu-quote").textContent =
        P.settings.dialogs === "off"
          ? "Карты на столе. Все свои."
          : C.dialogue("start", 0, P.name, P.settings.humor);
    if (screen === "setup") {
      for (const k of ["count", "variant", "difficulty", "frequency"])
        if ($("#" + k)) $("#" + k).value = setup[k];
      if ($("#chaos")) $("#chaos").checked = setup.chaos;
      if ($("#frequency")) $("#frequency").disabled = !setup.chaos;
      $("#roster-help").textContent =
        `Выбрано ${setup.npcs.length}. Нужно ${setup.count - 1} соперника.`;
      document.querySelector('[data-action="start"]').disabled =
        setup.npcs.length !== setup.count - 1;
    }
    if (screen === "settings")
      document.querySelectorAll("[data-setting]").forEach((el) => {
        if (el.type === "checkbox") el.checked = P.settings[el.dataset.setting];
        else el.value = P.settings[el.dataset.setting];
      });
    if (screen === "profile" && $("#profile-name"))
      $("#profile-name").value = profileDraft ?? P.name;
    if (screen === "game" && G && !G.finished) {
      const log = $("#game-log");
      for (const text of G.log.slice(-5)) {
        const li = document.createElement("li");
        li.textContent = P.settings.humor === "full" ? text : C.clean(text);
        log.append(li);
      }
      if (dialog && $("#dialog-text"))
        $("#dialog-text").textContent = dialog.text;
      if (G.phase !== "event") scheduleBot();
    }
    if (screen === "results" && G?.finished) {
      const loser = G.result.loser;
      const speaker =
        loser > 0 ? loser : G.players.findIndex((p, i) => i > 0 && p.out);
      if (!G.result.draw && loser === 0) {
        $("#result-quote").textContent = C.lossBanter(P, G.gameId || "seed-" + G.startedSeed + "-" + G.rng, P.name, P.settings.humor);
        persist();
      } else $("#result-quote").textContent = G.result.draw
        ? "Никто не дурак. Сейчас главное — не начать выяснять, кто был ближе."
        : C.dialogue(
            loser > 0 ? "lose" : "win",
            G.players[speaker]?.npc ?? 0,
            P.name,
            P.settings.humor,
          );
    }
    layoutHands();
    tableResizeObserver?.disconnect();
    for (const el of document.querySelectorAll(".battle, .pairs"))
      tableResizeObserver?.observe(el);
    audio.update(P.settings);
  }
  function say(kind, who, target = C.otherSeat(G, who), observer = false) {
    if (
      P.settings.dialogs === "off" ||
      who === 0 ||
      !G.players[who] ||
      !G.players[target] ||
      target === who
    )
      return;
    const cooldown =
      P.settings.dialogs === "rare"
        ? 6
        : P.settings.humor === "moderate"
          ? 5
          : 3;
    if (G.sequence - lastDialog < cooldown && kind !== "win" && kind !== "lose")
      return;
    const first = Math.floor(Math.random() * 2);
    const picked = [first, 1 - first]
      .map((v) => ({
        key: `${kind}:${G.players[who].npc}:${v}:${observer}`,
        text: C.dialogue(
          kind,
          G.players[who].npc,
          G.players[target].name,
          P.settings.humor,
          v,
          observer,
        ),
      }))
      .find((t) => !recent.includes(t.key));
    if (!picked) return;
    const text = picked.text;
    recent.push(picked.key);
    recent = recent.slice(-8);
    lastDialog = G.sequence;
    dialog = { who, target, text };
    emotion[who] = ["take_many", "event_bad"].includes(kind)
      ? 2
      : ["win", "event_good", "defend"].includes(kind)
        ? 1
        : 0;
  }
  function afterAction(who, a, before) {
    lastActionAt = Date.now();
    audio.play(
      a.type === "defend" ? "cover" : a.type === "take" ? "take" : "card",
    );
    let category =
      a.type === "defend"
        ? "defend"
        : a.type === "take"
          ? before.table.reduce(
              (n, p) => n + 1 + (p.defense != null ? 1 : 0),
              0,
            ) > 1
            ? "take_many"
            : "take_one"
          : a.type === "pass"
            ? "pass_attack"
            : "attack";
    if (a.card != null && E.card(a.card).suit === G.trump)
      category = "trump_used";
    else if (
      a.type === "defend" &&
      G.players[who].hand.some((c) => E.card(c).suit === G.trump)
    )
      category = "trump_saved";
    const target = C.actionAudience(before, G, a, who);
    say(category, who, target);
    if (G.round > 24 && G.round % 10 === 0) say("long_game", who, target);
    if (G.finished) {
      newAchievements = S.finish(P, G);
      persist();
      show("results");
      audio.play("win");
      return;
    }
    persist();
    if (G.phase === "event") {
      eventChoice = "";
      eventTarget = null;
      eventCard = null;
      G.players.forEach((p, i) => {
        if (i > 0 && !p.out) emotion[i] = 3;
      });
      audio.play("event");
    }
    selected = null;
    render();
  }
  const motion = new VahtaMotion({
    card,
    back: backCard,
    settings: () => P.settings,
    layout: layoutPairs,
  });
  function paintEvent(visual, incoming, counters) {
    const hand = $(".hand");
    if (hand) {
      hand.innerHTML = visual.players[0].hand.slice().sort((a,b) =>
        (E.card(a).suit === G.trump) - (E.card(b).suit === G.trump) ||
        E.card(a).suit - E.card(b).suit || E.card(a).rank - E.card(b).rank)
        .map(c => card(c)).join("");
      if (incoming != null) hand.querySelector(`[data-card="${incoming}"]`).style.visibility = "hidden";
      layoutHands();
    }
    if (!counters) return;
    visual.players.forEach((p,i) => {
      const el = i === 0 ? $(".human-caption small") : $(`.opponent[data-seat="${i}"] .hand-count`);
      if (el) el.textContent = p.hand.length + " карт";
    });
    const stock = $(".stocks > strong");
    if (stock) stock.textContent = E.stockCount(visual) + " в колоде";
    if (!E.stockCount(visual)) {
      const pile = $(".stock-pile");
      if (pile) pile.innerHTML = `<div class="empty-trump ${G.trump === 1 || G.trump === 2 ? "red" : "black"}" aria-label="Козырная масть"><span>${E.SUITS[G.trump]}</span></div>`;
    }
  }
  async function act(a, releaseRect = null) {
    if (paused || animating || !G || screen !== "game") return;
    const before = structuredClone(G),
      next = structuredClone(G),
      who = G.actor;
    const r = E.apply(next, who, a);
    if (!r.ok) {
      toast(r.error);
      return;
    }
    // Public provenance lets a defender answer the author of this particular attack.
    if ((a.type === "attack" || a.type === "transfer") && next.table.length)
      next.table.at(-1).playedBy = who;
    clearTimeout(timer);
    animating = true;
    document.body.dataset.animating = "true";
    $("#app").inert = true;
    // Accepted state is durable before flight. Reloading never loses/duplicates a card.
    G = next;
    persist();
    try {
      await motion.play(before, next, a, releaseRect);
    } catch (error) {
      console.warn("Card animation interrupted", error);
    } finally {
      animating = false;
      document.body.dataset.animating = "false";
      $("#app").inert = false;
    }
    afterAction(who, a, before);
  }
  function scheduleBot() {
    if (
      animating ||
      paused ||
      document.hidden ||
      !G ||
      G.finished ||
      G.phase === "event" ||
      G.actor === 0
    )
      return;
    timer = setTimeout(
      () => {
        if (screen === "game" && !paused && !document.hidden) {
          const a = E.bot(E.observation(G));
          if (a) act(a);
        }
      },
      P.settings.fast ? 320 : 1000,
    );
  }
  function startGame() {
    if (setup.npcs.length !== setup.count - 1) return;
    const names = [
      P.name,
      ...setup.npcs.map((i) => C.NPC.find((n) => n.id === i).name),
    ];
    G = E.start({
      ...setup,
      names,
      npcs: [P.avatar, ...setup.npcs],
      seed: Date.now() >>> 0,
    });
    dialog = null;
    emotion = {};
    lastDialog = -9;
    recent = [];
    newAchievements = [];
    eventStep = 0;
    eventKey = "";
    eventChoice = "";
    eventTarget = eventCard = null;
    paused = false;
    persist();
    show("game");
    audio.play("deal");
  }
  function confirmBox(title, text, fn) {
    clearTimeout(timer);
    const layer = $("#overlay");
    layer.innerHTML = `<div class="modal compact-modal" role="dialog" aria-modal="true"><h2>${title}</h2><p>${text}</p><div>${button("Отмена", "cancel-modal")}${button("Подтвердить", "confirm-modal", "primary")}</div></div>`;
    const confirm = layer.querySelector('[data-action="confirm-modal"]');
    confirm.onclick = (e) => {
      e.stopPropagation();
      layer.innerHTML = "";
      fn();
    };
    layer.querySelector('[data-action="cancel-modal"]').onclick = (e) => {
      e.stopPropagation();
      render();
    };
  }
  function inspect(c) {
    clearTimeout(timer);
    $("#overlay").innerHTML =
      `<div class="modal compact-modal inspect-modal" role="dialog" aria-modal="true">${card(c)}<h2>${E.label(c)}</h2><p>${["Рукавицы", "Инструмент", "Каска", "Северный лес", "Чайник", "Работник", "Специалист", "Мастер", "Символ вахты"][E.card(c).rank - 6]}</p>${button("Закрыть", "close-modal", "primary")}</div>`;
  }
  function exportSave() {
    const blob = new Blob([JSON.stringify(P, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "durak-vahta-save.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function handle(action, el) {
    if (animating) return;
    switch (action) {
      case "talk":
        pageIndex.talk = 0;
        openTalk();
        break;
      case "view-tab":
        view[el.dataset.key] = el.dataset.value;
        render();
        break;
      case "page-prev":
      case "page-next":
        pageIndex[el.dataset.key] = Math.max(
          0,
          (pageIndex[el.dataset.key] || 0) + (action === "page-next" ? 1 : -1),
        );
        if (el.dataset.key === "talk") openTalk();
        else render();
        break;
      case "menu":
        if (G && !G.finished) persist();
        paused = false;
        show("menu");
        break;
      case "setup":
        if (G && !G.finished)
          confirmBox(
            "Начать новую партию?",
            "Текущая партия будет заменена только после нажатия «Начать партию».",
            () => show("setup"),
          );
        else show("setup");
        break;
      case "continue":
        paused = false;
        show(G?.finished ? "results" : "game");
        break;
      case "start":
        startGame();
        break;
      case "rematch":
        setup = {
          ...setup,
          ...G.options,
          count: G.players.length,
          npcs: G.players.slice(1).map((p) => p.npc),
        };
        show("setup");
        break;
      case "back":
        paused = false;
        show(returnScreen === "game" && G ? "game" : "menu");
        break;
      case "profile":
      case "settings":
      case "rules":
      case "achievements":
      case "gallery":
        returnScreen = screen === "game" ? "game" : "menu";
        show(action);
        break;
      case "npc": {
        const i = Number(el.dataset.id);
        setup.npcs = setup.npcs.includes(i)
          ? setup.npcs.filter((n) => n !== i)
          : [...setup.npcs.slice(0, setup.count - 2), i];
        render();
        break;
      }
      case "random-roster": {
        const ids = C.NPC.map((n) => n.id);
        for (let i = ids.length - 1; i > 0; i--) {
          let j = Math.floor(Math.random() * (i + 1));
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        setup.npcs = ids.slice(0, setup.count - 1);
        render();
        break;
      }
      case "select-card": {
        const card = Number(el.dataset.card), now = performance.now();
        const twice = lastTap?.card === card && lastTap.game === G.gameId &&
          lastTap.sequence === G.sequence && now - lastTap.at <= 380;
        lastTap = {card, at: now, game: G.gameId, sequence: G.sequence};
        selected = card;
        // Engine order chooses the first legal uncovered pair. Transfer stays explicit.
        const move = twice && G.actor === 0 && E.legal(G, 0).find(a =>
          a.card === card && a.type === (G.phase === "defending" ? "defend" : "attack"));
        if (move) { lastTap = null; act(move); }
        else render();
        break;
      }
      case "play-selected":
        if (G.actor === 0) act({ type: el.dataset.type, card: selected });
        break;
      case "cover":
        if (G.actor === 0)
          act({
            type: "defend",
            card: selected,
            pair: Number(el.dataset.pair),
          });
        break;
      case "take":
      case "pass":
        if (G.actor === 0) act({ type: action });
        break;
      case "pause":
        cancelDrag();
        paused = true;
        clearTimeout(timer);
        audio.pause(true);
        $("#overlay").innerHTML =
          `<div class="modal compact-modal" role="dialog" aria-modal="true"><span class="eyebrow">ПЕРЕКУР БЕЗ СИГАРЕТ</span><h2>Партия на паузе</h2><p>Карты и очередь сохранены на этом устройстве.</p>${button("Продолжить", "unpause", "primary")}${button("Сохранить и в меню", "menu")}</div>`;
        persist();
        break;
      case "unpause":
        paused = false;
        audio.pause(false);
        render();
        break;
      case "inspect":
        if (selected != null) inspect(selected);
        break;
      case "close-modal":
        render();
        break;
      case "event-next":
        eventStep++;
        render();
        break;
      case "event-prev":
        eventStep = Math.max(0, eventStep - 1);
        render();
        break;
      case "event-target":
        eventTarget = Number(el.dataset.id);
        render();
        break;
      case "event-card":
        eventCard = Number(el.dataset.card);
        render();
        break;
      case "event-accept": {
        const v = F.spec(G),
          who = v.recipient;
        const skipBefore = G.players[who].skip;
        const eventAction =
          who === 0 && !v.cancelled
            ? { choice: eventChoice, target: eventTarget, card: eventCard }
            : F.botEvent(G);
        const resolvedKind = v.choices.length ? eventAction.choice : v.kind;
        const before = structuredClone(G), next = structuredClone(G);
        const r = F.eventAction(next, eventAction);
        if (!r.ok) {
          toast(r.error);
          return;
        }
        clearTimeout(timer);
        animating = true;
        document.body.dataset.animating = "true";
        $("#app").inert = true;
        G = next;
        if (G.finished) newAchievements = S.finish(P, G);
        persist();
        $("#overlay").innerHTML = "";
        try {
          await motion.playEvent(before, next, { ...r, title: v.content?.title }, paintEvent);
        } catch (error) {
          console.warn("Event animation interrupted", error);
        } finally {
          animating = false;
          document.body.dataset.animating = "false";
          $("#app").inert = false;
        }
        const record = G.metrics.events.at(-1);
        const category =
          record.delta > 0 ||
          resolvedKind === "skip" ||
          G.players[who].skip > skipBefore
            ? "event_bad"
            : record.delta < 0
              ? "event_good"
              : "event_neutral";
        const speaker =
          who === 0 ? G.players.findIndex((p, i) => i > 0 && !p.out) : who;
        if (speaker > 0 && !record.cancelled)
          say(
            category,
            speaker,
            who === 0 ? 0 : C.otherSeat(G, who),
            who === 0,
          );
        if (G.finished) {
          persist();
          show("results");
        } else {
          eventChoice = "";
          eventTarget = null;
          eventCard = null;
          persist();
          render();
        }
        audio.play("event");
        break;
      }
      case "save-name": {
        const value = $("#profile-name").value.trim();
        if (!E.validName(value)) {
          toast("Имя: 2–24 буквы, пробелы и дефисы.");
          return;
        }
        P.name = value;
        profileDraft = null;
        dialog = null;
        if (G) G.players[0].name = value;
        persist();
        render();
        toast("Имя сохранено.");
        break;
      }
      case "avatar":
        P.avatar = Number(el.dataset.id);
        persist();
        render();
        break;
      case "mute":
        P.settings.music = P.settings.sfx = 0;
        persist();
        render();
        break;
      case "export":
        persist();
        exportSave();
        break;
      case "import":
        $("#import-file").click();
        break;
      case "reset":
        confirmBox(
          "Сбросить весь прогресс?",
          "Имя, достижения, статистика и текущая партия будут удалены. Сначала можно сделать экспорт.",
          () => {
            P = S.fresh();
            profileDraft = null;
            G = null;
            persist();
            show("welcome");
          },
        );
        break;
      case "gallery-cards":
      case "gallery-backs":
        galleryMode = action.slice(8);
        render();
        break;
      case "gallery-card":
        inspect(Number(el.dataset.card));
        break;
      case "back-skin": {
        const n = Number(el.dataset.id);
        if (n === 1 && !P.achievements.length) return;
        P.back = n;
        persist();
        render();
        break;
      }
    }
  }
  function clearDropTargets() {
    document.querySelectorAll(".drop-allowed, .drop-hover, .drop-rejected").forEach(el =>
      el.classList.remove("drop-allowed", "drop-hover", "drop-rejected"));
  }
  function cancelDrag() {
    if (!drag) return;
    const old = drag;
    drag = null;
    old.preview?.remove();
    old.el.style.visibility = "";
    clearDropTargets();
    try { old.el.releasePointerCapture(old.pointer); } catch {}
    if (old.moved) suppressCardClickUntil = performance.now() + 500;
  }
  function defenseTarget(x, y) {
    return document.elementFromPoint(x, y)?.closest(".pairs .uncovered[data-pair]");
  }
  document.addEventListener("pointerdown", e => {
    const el = e.target.closest('.hand [data-action="select-card"]');
    if (!el || e.button !== 0 || !e.isPrimary || drag || animating || paused ||
      screen !== "game" || G?.actor !== 0 || G.phase !== "defending" ||
      $("#overlay").childElementCount) return;
    drag = {el, pointer:e.pointerId, card:Number(el.dataset.card), x:e.clientX, y:e.clientY,
      start:el.getBoundingClientRect(), moved:false};
    el.setPointerCapture(e.pointerId);
  });
  document.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.pointer || drag.returning) return;
    const d = drag, dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx,dy) < 9) return;
    e.preventDefault();
    if (!d.moved) {
      d.moved = true;
      $("#toast").classList.remove("visible");
      lastTap = null;
      selected = d.card;
      d.preview = d.el.cloneNode(true);
      d.preview.removeAttribute("data-action");
      d.preview.classList.add("drag-card");
      d.preview.classList.remove("selected", "not-playable");
      d.preview.setAttribute("aria-hidden", "true");
      Object.assign(d.preview.style, {position:"fixed", left:"0px", top:"0px", margin:"0",
        width:d.start.width+"px", height:d.start.height+"px", minWidth:"0", zIndex:"350",
        pointerEvents:"none", transition:"none", animation:"none"});
      document.body.append(d.preview);
      d.el.style.visibility = "hidden";
      d.moves = E.legal(G,0).filter(a=>a.type === "defend" && a.card === d.card);
      for (const move of d.moves)
        $(`.pairs .uncovered[data-pair="${move.pair}"]`)?.classList.add("drop-allowed");
    }
    d.preview.style.transform = `translate(${d.start.left+dx}px,${d.start.top+dy}px)`;
    document.querySelectorAll(".drop-hover, .drop-rejected").forEach(el=>
      el.classList.remove("drop-hover", "drop-rejected"));
    const target = defenseTarget(e.clientX,e.clientY);
    if (target) target.classList.add(d.moves.some(a=>a.pair === Number(target.dataset.pair)) ?
      "drop-hover" : "drop-rejected");
  }, {passive:false});
  document.addEventListener("pointerup", async e => {
    if (!drag || e.pointerId !== drag.pointer || drag.returning) return;
    const d = drag;
    if (!d.moved) { cancelDrag(); return; }
    e.preventDefault();
    suppressCardClickUntil = performance.now() + 500;
    const target = defenseTarget(e.clientX,e.clientY),
      move = target && d.moves.find(a=>a.pair === Number(target.dataset.pair)),
      release = d.preview.getBoundingClientRect();
    clearDropTargets();
    if (move) {
      cancelDrag();
      d.el.style.visibility = "hidden";
      audio.unlock();
      act(move, release);
    } else {
      d.returning = true;
      if (target) toast("Этой картой не побить. Выбери подходящую карту.");
      const animation = d.preview.animate([
        {transform:d.preview.style.transform},
        {transform:`translate(${d.start.left}px,${d.start.top}px)`}
      ], {duration:document.hidden ? 0 : motion.duration(240), easing:"ease-out", fill:"forwards"});
      motion.running.add(animation);
      try { await animation.finished; } catch {} finally {
        motion.running.delete(animation);
        if (drag === d) { cancelDrag(); render(); }
      }
    }
  });
  for (const type of ["pointercancel", "lostpointercapture"])
    document.addEventListener(type, e => { if (drag?.pointer === e.pointerId && !drag.returning) cancelDrag(); });
  document.addEventListener("dragstart", e => {
    if (e.target.closest(".hand .playing-card")) e.preventDefault();
  });
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    if ((el.dataset.action === "select-card" || el.dataset.action === "cover") &&
      performance.now() < suppressCardClickUntil) { e.preventDefault(); return; }
    audio.unlock();
    audio.play("button");
    handle(el.dataset.action, el);
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "name-form") return;
    e.preventDefault();
    const value = $("#player-name").value.trim();
    if (!E.validName(value)) return;
    P.name = value;
    audio.unlock();
    persist();
    show("menu");
  });
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.id === "profile-name") profileDraft = el.value;
    if (el.id === "player-name") {
      $("#name-submit").disabled = !E.validName(el.value);
      return;
    }
    if (el.dataset.setting) {
      P.settings[el.dataset.setting] =
        el.type === "checkbox"
          ? el.checked
          : el.type === "range"
            ? Number(el.value)
            : el.value;
      persist();
      audio.update(P.settings);
      if (!["range"].includes(el.type)) render();
    }
  });
  document.addEventListener("change", async (e) => {
    const el = e.target;
    if (
      screen === "setup" &&
      ["count", "variant", "difficulty", "chaos", "frequency"].includes(el.id)
    ) {
      setup[el.id] =
        el.id === "count"
          ? Number(el.value)
          : el.id === "chaos"
            ? el.checked
            : el.value;
      if (el.id === "count") setup.npcs = setup.npcs.slice(0, setup.count - 1);
      render();
    }
    if (el.name === "event-choice") {
      eventChoice = el.value;
      render();
    }
    if (el.id === "import-file" && el.files[0]) {
      try {
        if (el.files[0].size > 2e6) throw Error("Файл слишком большой");
        const imported = S.validate(JSON.parse(await el.files[0].text()));
        confirmBox(
          "Заменить сохранение?",
          "Текущий прогресс заменится данными выбранного файла.",
          () => {
            P = imported;
            profileDraft = null;
            G = P.game;
            persist();
            show(P.name ? "menu" : "welcome");
            toast("Сохранение импортировано.");
          },
        );
      } catch (err) {
        toast("Импорт отклонён: " + err.message);
      }
    }
  });
  document.addEventListener("visibilitychange", () => {
    clearTimeout(timer);
    audio.pause(document.hidden || paused);
    if (document.hidden) {
      cancelDrag();
      tableCamera.finish();
      motion.finish();
      persist();
    } else if (screen === "game") scheduleBot();
  });
  window.addEventListener("pagehide", persist);
  window.addEventListener("blur", () => {
    cancelDrag();
    clearTimeout(timer);
    audio.pause(true);
  });
  window.addEventListener("focus", () => {
    audio.pause(paused || document.hidden);
    if (screen === "game") scheduleBot();
  });
  setInterval(() => {
    if (
      screen === "game" &&
      !paused &&
      !animating &&
      !document.hidden &&
      G?.actor === 0 &&
      Date.now() - lastActionAt > 25000
    ) {
      const speaker = G.players.findIndex((p, i) => i > 0 && !p.out);
      if (speaker > 0) say("idle", speaker, 0);
      lastActionAt = Date.now();
      render();
    }
  }, 5000);
  const overlayObserver = new MutationObserver(() => {
    const open = $("#overlay").childElementCount > 0;
    $("#app").inert = open || animating;
  });
  overlayObserver.observe($("#overlay"), { childList: true });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !$("#overlay").childElementCount) return;
    const list = [
      ...$("#overlay").querySelectorAll("button:not(:disabled),input,select"),
    ];
    if (!list.length) return;
    const first = list[0],
      last = list.at(-1);
    if (!$("#overlay").contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  Promise.all(
    ["room", "npc", "npc-extra", "cards", "events", "decor"].map(
      (name) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src =
            "public/assets/" +
            name +
            ".webp?v=" +
            (globalThis.VahtaBuild?.id || "dev");
        }),
    ),
  ).then((results) => {
    if (results.some((x) => !x))
      toast(
        "Не загружена часть графики. Проверьте, что папка public/assets распакована рядом с index.html.",
      );
  });
  if (G?.finished) {
    S.finish(P, G);
    persist();
  }
  render();
  document.fonts.ready.then(layoutHands);
  if (loaded.warning) toast(loaded.warning);
})();
