const { test } = require("node:test"),
  assert = require("node:assert/strict");
const C = require("../src/content/characters"),
  E = require("../src/game/engine"),
  S = require("../src/game/save");
function state() {
  return E.start({
    seed: 17,
    count: 4,
    names: ["Роман", "Палыч", "Нина", "Гена"],
    npcs: [5, 0, 7, 8],
    variant: "transfer",
  });
}
test("bot speech follows the real attack, cover, transfer, pass and take recipient", () => {
  const a = state();
  a.defender = 2;
  a.attacker = a.origin = 0;
  a.table = [{ attack: 0, defense: null, playedBy: 3 }];
  const b = structuredClone(a);
  b.defender = 3;
  assert.equal(C.actionAudience(a, b, { type: "attack" }, 1), 2);
  assert.equal(C.actionAudience(a, b, { type: "transfer" }, 2), 3);
  assert.equal(C.actionAudience(a, b, { type: "defend", pair: 0 }, 2), 3);
  assert.equal(C.actionAudience(a, b, { type: "take" }, 2), 3);
  assert.equal(C.actionAudience(a, b, { type: "pass" }, 1), 2);
  a.table = [
    { attack: 0, defense: null, playedBy: 1 },
    { attack: 9, defense: null, playedBy: 3 },
  ];
  assert.equal(C.actionAudience(a, b, { type: "defend", pair: 0 }, 1), 3);
  a.defender = 0;
  assert.equal(C.actionAudience(a, b, { type: "attack" }, 1), 0);
});
test("missing old-save provenance falls back to attacker, never forces human or self", () => {
  const a = state();
  a.attacker = 2;
  a.table = [{ attack: 0, defense: null }];
  assert.equal(C.actionAudience(a, a, { type: "defend", pair: 0 }, 1), 2);
  a.attacker = 1;
  assert.equal(C.actionAudience(a, a, { type: "defend", pair: 0 }, 1), 2);
  a.players[2].out = true;
  assert.equal(C.otherSeat(a, 1), 3);
});
test("public attack authors survive saved games and remain attached to each individual card", () => {
  let g = state();
  const actor = g.actor,
    a = E.legal(g).find((a) => a.type === "attack");
  assert(a);
  assert(E.apply(g, actor, a).ok);
  g.table.at(-1).playedBy = actor;
  const p = S.fresh();
  p.name = "Роман";
  p.game = g;
  const restored = S.validate(JSON.parse(JSON.stringify(p)));
  assert.equal(restored.game.table.at(-1).playedBy, actor);
  E.invariant(restored.game);
});
test("360 authored lines are unique, personalized, cleaned, and observer reactions are distinct", () => {
  const unique = new Set();
  for (const npc of C.NPC) {
    for (const k of Object.keys(C.phrases))
      for (let v = 0; v < 2; v++) {
        const line = C.dialogue(k, npc.id, "Нина", "full", v);
        assert(line.startsWith("Нина,"));
        assert(!line.includes("{"));
        unique.add(line);
        assert.doesNotMatch(
          C.dialogue(k, npc.id, "Нина", "clean", v),
          /блядь|нахуй|пиздец|ебаться|заебало|охуел|жопе/i,
        );
      }
    for (const k of ["event_good", "event_bad", "event_neutral"])
      for (let v = 0; v < 2; v++) {
        const line = C.dialogue(k, npc.id, "Роман", "full", v, true);
        assert.equal(
          line,
          C.observations[npc.id][k][v].replace("{playerName}", "Роман"),
        );
        assert.notEqual(line, C.dialogue(k, npc.id, "Роман", "full", v));
        unique.add(line);
      }
  }
  assert.equal(unique.size, 360);
});
