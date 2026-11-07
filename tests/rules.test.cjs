const { test } = require("node:test"),
  assert = require("node:assert/strict");
const E = require("../src/game/engine.js"),
  F = require("../src/game/events.js"),
  S = require("../src/game/save.js"),
  C = require("../src/content/characters.js"),
  events = require("../src/content/events.js");
F.setContent(events);
function fixture(
  hands,
  {
    deck = [],
    trump = 3,
    variant = "standard",
    phase = "attacking",
    attacker = 0,
    defender = 1,
    table = [],
  } = {},
) {
  const s = E.start({
    count: hands.length,
    seed: 11,
    variant,
    names: ["Тестовый", "Палыч", "Санёк", "Артём"],
  });
  s.players.forEach((p, i) => {
    p.hand = hands[i].slice();
    p.out = false;
    p.skip = 0;
  });
  s.deck = deck.slice();
  s.discard = [];
  s.effectDiscard = [];
  s.table = structuredClone(table);
  s.trump = trump;
  s.trumpCard = deck.at(-1) ?? 35;
  s.phase = phase;
  s.actor = phase === "defending" ? defender : attacker;
  s.origin = s.attacker = attacker;
  s.defender = defender;
  s.limit = Math.min(
    6,
    hands[defender].length + table.filter((p) => p.defense != null).length,
  );
  s.passed = [];
  s.taking = false;
  s.pending = [];
  s.finished = false;
  s.result = null;
  const used = [
    ...hands.flat(),
    ...deck,
    ...table.flatMap((p) =>
      p.defense == null ? [p.attack] : [p.attack, p.defense],
    ),
  ];
  s.discard = Array.from({ length: 36 }, (_, i) => i).filter(
    (i) => !used.includes(i),
  );
  E.invariant(s);
  return s;
}
const run = (s, a) => {
  const r = E.apply(s, s.actor, a);
  assert.equal(r.ok, true, r.error);
};
function finishRound(s) {
  let n = 0;
  while (
    s.phase !== "attacking" &&
    !s.finished &&
    s.phase !== "event" &&
    n++ < 50
  ) {
    const moves = E.legal(s),
      a =
        moves.find((a) => a.type === "pass") ||
        moves.find((a) => a.type === "take") ||
        moves[0];
    run(s, a);
  }
  assert.ok(n < 50);
}
test("36 unique cards, standard ranks and four suits", () => {
  const ids = Array.from({ length: 36 }, (_, i) => i);
  assert.equal(new Set(ids.map(E.label)).size, 36);
  assert.deepEqual(
    [...new Set(ids.map((i) => E.card(i).rank))],
    [6, 7, 8, 9, 10, 11, 12, 13, 14],
  );
  assert.equal(new Set(ids.map((i) => E.card(i).suit)).size, 4);
});
for (const n of [2, 3, 4])
  test(`deal ${n}: six each; visible trump remains last once; lowest trump leads`, () => {
    const s = E.start({ count: n, seed: 77 });
    assert.ok(s.players.every((p) => p.hand.length === 6));
    assert.equal(s.deck.length, 36 - n * 6);
    assert.equal(s.deck.at(-1), s.trumpCard);
    assert.equal(s.deck.filter((c) => c === s.trumpCard).length, 1);
    const all = s.players
      .flatMap((p, i) =>
        p.hand
          .filter((c) => E.card(c).suit === s.trump)
          .map((c) => ({ rank: E.card(c).rank, i })),
      )
      .sort((a, b) => a.rank - b.rank);
    if (all.length) assert.equal(s.actor, all[0].i);
    E.invariant(s);
  });
test("defense strictly higher same suit, trump beats non-trump, no equal or lower trump", () => {
  assert.equal(E.beats(1, 0, 3), true);
  assert.equal(E.beats(0, 1, 3), false);
  assert.equal(E.beats(9, 0, 3), false);
  assert.equal(E.beats(27, 8, 3), true);
  assert.equal(E.beats(8, 27, 3), false);
  assert.equal(E.beats(27, 27, 3), false);
  assert.equal(E.beats(27, 28, 3), false);
  assert.equal(E.beats(28, 27, 3), true);
});
test("validator rejects out-of-turn and wrong defense without changing state", () => {
  const s = fixture(
    [
      [0, 2],
      [9, 1],
    ],
    { deck: [35] },
  );
  run(s, { type: "attack", card: 0 });
  const json = JSON.stringify(s);
  assert.equal(E.apply(s, 0, { type: "attack", card: 2 }).ok, false);
  assert.equal(E.apply(s, 1, { type: "defend", card: 9, pair: 0 }).ok, false);
  assert.equal(JSON.stringify(s), json);
});
test("throw ranks can match defense; initial hand limit retained", () => {
  const s = fixture(
    [
      [0, 10, 11],
      [1, 20],
    ],
    { deck: [35] },
  );
  run(s, { type: "attack", card: 0 });
  run(s, { type: "defend", card: 1, pair: 0 });
  assert.ok(E.legal(s).some((a) => a.card === 10));
  assert.ok(!E.legal(s).some((a) => a.card === 11));
  assert.equal(s.limit, 2);
});
test("attack cap is six and cannot increase after taking", () => {
  const s = fixture(
    [
      [0, 9, 18, 27, 1, 10, 19],
      [2, 3, 4, 5, 6, 7, 8],
    ],
    { deck: [35] },
  );
  assert.equal(s.limit, 6);
  run(s, { type: "attack", card: 0 });
  run(s, { type: "take" });
  run(s, { type: "attack", card: 9 });
  run(s, { type: "attack", card: 18 });
  run(s, { type: "attack", card: 27 });
  assert.equal(s.table.length, 4);
  assert.equal(s.limit, 6);
  assert.ok(!E.legal(s).some((a) => a.card === 1));
});
for (const n of [2, 3, 4]) {
  test(`next attacker after beaten and taken / ${n} players`, () => {
    let hands = [
      [0, 2],
      [1, 3],
      ...(n >= 3 ? [[9, 10]] : []),
      ...(n === 4 ? [[18, 19]] : []),
    ];
    let s = fixture(hands, { deck: [35, 34, 33, 32, 31, 30, 29, 28, 27] });
    run(s, { type: "attack", card: 0 });
    run(s, { type: "defend", card: 1, pair: 0 });
    finishRound(s);
    assert.equal(s.attacker, 1);
    s = fixture(hands, { deck: [35, 34, 33, 32, 31, 30, 29, 28, 27] });
    run(s, { type: "attack", card: 0 });
    run(s, { type: "take" });
    finishRound(s);
    assert.equal(s.attacker, n === 2 ? 0 : 2);
  });
  test(`refill order / ${n} players: original attacker first, defender last`, () => {
    const hands = [
      [0],
      [1],
      ...(n >= 3 ? [[9]] : []),
      ...(n === 4 ? [[18]] : []),
    ];
    const deck = [35, 34, 33, 32, 31, 30, 29, 28, 27, 26];
    const s = fixture(hands, { deck });
    run(s, { type: "attack", card: 0 });
    run(s, { type: "defend", card: 1, pair: 0 });
    finishRound(s);
    assert.deepEqual(s.players[0].hand.slice(0, 6), deck.slice(0, 6));
    assert.equal(s.players[1].hand.length, n === 2 ? 4 : 0);
    E.invariant(s);
  });
}
test("transfer: matching rank before defense; subsequent transfer; recipient capacity", () => {
  const s = fixture(
    [
      [0, 2, 3],
      [9, 4, 5],
      [18, 6, 7],
    ],
    { variant: "transfer", deck: [35] },
  );
  run(s, { type: "attack", card: 0 });
  assert.ok(E.legal(s).some((a) => a.type === "transfer" && a.card === 9));
  run(s, { type: "transfer", card: 9 });
  assert.equal(s.defender, 2);
  assert.equal(s.limit, 3);
  assert.ok(!E.legal(s).some((a) => a.type === "transfer"));
  const t = fixture(
    [
      [0, 2, 3, 4],
      [9, 5, 6, 7],
      [18, 8, 10, 11],
    ],
    { variant: "transfer", deck: [35] },
  );
  run(t, { type: "attack", card: 0 });
  run(t, { type: "transfer", card: 9 });
  run(t, { type: "transfer", card: 18 });
  assert.equal(t.defender, 0);
  assert.equal(t.table.length, 3);
  const q = fixture([[0, 2], [9, 1], [18]], {
    variant: "transfer",
    deck: [35],
  });
  run(q, { type: "attack", card: 0 });
  assert.ok(!E.legal(q).some((a) => a.type === "transfer"));
});
test("no transfer after any defense; two-player transfer obeys opponent hand size", () => {
  let s = fixture(
    [
      [0, 9, 2, 3],
      [1, 10, 18, 4],
    ],
    { variant: "transfer", deck: [35] },
  );
  run(s, { type: "attack", card: 0 });
  run(s, { type: "transfer", card: 18 });
  assert.equal(s.defender, 0);
  const q = fixture(
    [
      [0, 9, 2],
      [1, 18, 10],
    ],
    { variant: "transfer", deck: [35] },
  );
  run(q, { type: "attack", card: 0 });
  run(q, { type: "defend", card: 1, pair: 0 });
  run(q, { type: "attack", card: 9 });
  assert.ok(!E.legal(q).some((a) => a.type === "transfer"));
});
test("last defense produces draw; last taker loses, outcome cannot change", () => {
  const s = fixture([[0], [1]]);
  run(s, { type: "attack", card: 0 });
  run(s, { type: "defend", card: 1, pair: 0 });
  assert.equal(s.finished, true);
  assert.equal(s.result.draw, true);
  const json = JSON.stringify(s);
  assert.equal(E.apply(s, 0, { type: "pass" }).ok, false);
  assert.equal(JSON.stringify(s), json);
  const q = fixture([[0], [9]]);
  run(q, { type: "attack", card: 0 });
  run(q, { type: "take" });
  assert.equal(q.result.loser, 1);
});
for (const [f, count] of [
  ["rare", 2],
  ["normal", 4],
  ["mad", 6],
])
  test(`chaos ${f}: ${count} non-card triggers, trump last; classic none`, () => {
    const s = E.start({ seed: 1, frequency: f, chaos: true });
    assert.equal(s.deck.filter((x) => !E.ordinary(x)).length, count);
    assert.equal(s.deck.at(-1), s.trumpCard);
    assert.ok(s.players.every((p) => p.hand.every(E.ordinary)));
    assert.equal(
      E.start({ seed: 1 }).deck.filter((x) => !E.ordinary(x)).length,
      0,
    );
  });
test("triggers queued during refill, never inside defense; one event per boundary", () => {
  const s = fixture(
    [
      [0, 2],
      [1, 3],
    ],
    { deck: ["@0", "@1", 35, 34, 33, 32, 31, 30, 29, 28] },
  );
  s.eventDeck = Array.from({ length: 30 }, (_, i) => i);
  run(s, { type: "attack", card: 0 });
  assert.equal(s.pending.length, 0);
  run(s, { type: "defend", card: 1, pair: 0 });
  finishRound(s);
  assert.equal(s.phase, "event");
  assert.equal(s.pending.length, 1);
  assert.equal(s.table.length, 0);
  assert.equal(F.eventAction(s, F.botEvent(s)).ok, true);
  assert.equal(s.phase, "attacking");
  assert.equal(s.pending.length, 1);
});
for (let id = 0; id < 30; id++)
  test(`event ${id + 1}: normal, empty stock, no peer, eliminated recipient; 36-card invariant`, () => {
    for (const edge of ["normal", "empty", "nopeer", "out"]) {
      const s = fixture(
        [
          [0, 2, 27],
          [1, 4, 28],
          [9, 11, 29],
        ],
        { deck: edge === "empty" ? [] : [35, 34, 33, 32] },
      );
      s.options.chaos = true;
      s.event = { id, recipient: 0 };
      s.eventDeck = [];
      s.eventDiscard = [];
      s.nextCandidate = 0;
      s.phase = "event";
      s.actor = 0;
      if (edge === "nopeer")
        for (let i = 1; i < 3; i++) {
          s.discard.push(...s.players[i].hand);
          s.players[i].hand = [];
          s.players[i].out = true;
        }
      if (edge === "out") {
        s.discard.push(...s.players[0].hand);
        s.players[0].hand = [];
        s.players[0].out = true;
      }
      const r = F.eventAction(s, F.botEvent(s));
      assert.equal(r.ok, true, r.error);
      E.invariant(s);
      assert.equal(s.metrics.events.length, 1);
    }
  });
test("invalid choice/target/card cannot mutate event state", () => {
  const s = E.start({ seed: 8, chaos: true });
  s.phase = "event";
  s.event = { id: 2, recipient: 0 };
  const json = JSON.stringify(s);
  assert.equal(F.eventAction(s, { target: 0, card: 100 }).ok, false);
  assert.equal(JSON.stringify(s), json);
});
test("skip consumes one attack opportunity, never defense; all-skip is finite", () => {
  const s = E.start({ seed: 15 });
  s.players.forEach((p) => (p.skip = 1));
  E.newRound(s, 0);
  assert.ok(s.metrics.skips === s.players.length);
  assert.equal(s.actor, 0);
  assert.equal(s.players[0].skip, 0);
  assert.equal(s.defender, 1);
});
test("RNG and restore preserve future exactly; bot observation omits hidden zones", () => {
  const s = E.start({ seed: 111, chaos: true, variant: "transfer" }),
    other = E.start({ seed: 111, chaos: true, variant: "transfer" });
  assert.deepEqual(s, other);
  let restored = E.restore(JSON.stringify(s));
  for (let i = 0; i < 20 && !s.finished; i++) {
    if (s.phase === "event") {
      F.eventAction(s, F.botEvent(s));
      F.eventAction(restored, F.botEvent(restored));
    } else {
      const a = E.bot(E.observation(s));
      E.apply(s, s.actor, a);
      E.apply(restored, restored.actor, a);
    }
    assert.deepEqual(s, restored);
  }
  const obs = E.observation(s);
  assert.equal(obs.deck, undefined);
  assert.equal(obs.players, undefined);
  assert.equal(obs.rng, undefined);
  assert.notEqual(obs.hand, s.players[s.actor].hand);
});
test("name validation, 70 contextual dialogues and safe/real swearing modes", () => {
  for (const n of ["Саша", "Анна-Мария", "John Smith", "  Иван  "])
    assert.ok(E.validName(n));
  for (const n of [
    "A",
    "<script>alert(1)</script>",
    "Иван1",
    "-Иван",
    "a".repeat(25),
  ])
    assert.equal(E.validName(n), false);
  assert.equal(Object.values(C.phrases).flat().length, 70);
  for (const category in C.phrases)
    for (let i = 0; i < 5; i++) {
      const t = C.dialogue(category, i, "Анна-Мария");
      assert.ok(t.includes("Анна-Мария"));
      assert.ok(!t.includes("{playerName}"));
      assert.ok(
        !/блядь|нахуй|пиздец|ебаться|охуел|заебало/.test(
          C.dialogue(category, i, "Саша", "clean"),
        ),
      );
    }
});
test("profile JSON roundtrip, broken import rejection, honest stats and one-time rewards", () => {
  const p = S.fresh();
  p.name = "Александр";
  p.game = E.start({ seed: 89 });
  assert.deepEqual(S.validate(JSON.parse(JSON.stringify(p))), p);
  assert.throws(() => S.validate({ version: 999 }));
  assert.throws(() => S.validate({ ...p, name: "<script>" }));
  const s = fixture([[0], [1]]);
  run(s, { type: "attack", card: 0 });
  run(s, { type: "defend", card: 1, pair: 0 });
  S.finish(p, s);
  const xp = p.xp;
  S.finish(p, s);
  assert.equal(p.xp, xp);
  assert.equal(p.stats.classic.draws, 1);
  assert.equal(p.stats.classic.wins, 0);
});
test("all 30 events apply their actual documented card-count/skip effects", () => {
  const delta = {
    1: [2, 0, 0],
    2: [-1, 1, 0],
    3: [1, 1, 1],
    4: [-1, 1, 0],
    5: [2, -1, -1],
    6: [-1, 0, 0],
    7: [1, 0, 0],
    8: [1, 1, 1],
    13: [-1, 1, 0],
    14: [2, -1, -1],
    15: [1, 0, 0],
    17: [-1, 0, 0],
    19: [0, 0, 0],
    20: [1, 1, 1],
    21: [-1, 1, 0],
    23: [1, 0, 0],
    25: [2, 0, 0],
    26: [-1, 1, 0],
    29: [0, 0, 0],
  };
  for (let id = 0; id < 30; id++) {
    const s = fixture(
      [
        [0, 2, 27],
        [1, 4, 28],
        [9, 11, 29],
      ],
      { deck: [35, 34, 33, 32] },
    );
    s.event = { id, recipient: 0 };
    s.eventDeck = [];
    s.phase = "event";
    s.actor = 0;
    s.nextCandidate = 0;
    const before = s.players.map((p) => p.hand.slice());
    let a = { target: 1, card: 2 };
    if (id === 23) a.choice = "draw";
    if (id === 24) a.choice = "swap";
    if (id === 25) a.choice = "draw2";
    if (id === 26) a.choice = "give";
    assert.equal(F.eventAction(s, a).ok, true, "event " + id);
    if (delta[id])
      assert.deepEqual(
        s.players.map((p, i) => p.hand.length - before[i].length),
        delta[id],
        "event " + id,
      );
    if ([0, 27].includes(id))
      assert.equal(
        s.metrics.skips,
        1,
        "self skip was consumed once starting next round",
      );
    if (id === 16) assert.equal(s.players[1].skip, 1);
    if ([6, 17].includes(id)) {
      assert.deepEqual(s.effectDiscard, [2]);
      assert.ok(!s.players[0].hand.includes(2));
    }
    if ([10, 11, 18, 24, 28].includes(id)) {
      assert.notDeepEqual(s.players[0].hand, before[0]);
      assert.deepEqual(
        s.players.map((p) => p.hand.length),
        [3, 3, 3],
      );
    }
    if (id === 12) {
      assert.ok(
        s.players.every((p, i) =>
          p.hand.some((c) => before[(i + 2) % 3].includes(c)),
        ),
      );
      assert.deepEqual(
        s.players.map((p) => p.hand.length),
        [3, 3, 3],
      );
    }
    if (id === 9)
      assert.equal(
        s.players.reduce((n, p) => n + p.hand.length, 0),
        11,
      );
    if (id === 22) {
      assert.equal(s.players[0].hand.length, 4);
      assert.equal(
        s.players.slice(1).reduce((n, p) => n + p.hand.length, 0),
        5,
      );
    }
  }
});
test("choice events: alternative branches do real different things", () => {
  for (const [id, choice, expected] of [
    [23, "skip", 3],
    [24, "none", 3],
    [25, "give", 2],
    [26, "draw2", 5],
  ]) {
    const s = fixture(
      [
        [0, 2, 27],
        [1, 4, 28],
      ],
      { deck: [35, 34, 33] },
    );
    s.event = { id, recipient: 0 };
    s.eventDeck = [];
    s.phase = "event";
    s.actor = 0;
    s.nextCandidate = 0;
    assert.equal(F.eventAction(s, { choice, target: 1, card: 2 }).ok, true);
    assert.equal(s.players[0].hand.length, expected);
  }
});
test("restore rejects malformed event metadata and missing options", () => {
  const s = E.start({ seed: 21, chaos: true });
  const q = JSON.parse(JSON.stringify(s));
  delete q.options;
  assert.throws(() => E.restore(q));
  s.phase = "event";
  s.event = { id: 999, recipient: 0 };
  assert.throws(() => E.restore(s));
});
