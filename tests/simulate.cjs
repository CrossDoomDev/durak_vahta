const E = require("../src/game/engine.js"),
  F = require("../src/game/events.js");
F.setContent(require("../src/content/events.js"));
let total = 0,
  max = 0,
  events = 0;
for (let seed = 1; seed <= 1000; seed++) {
  const s = E.start({
    seed,
    count: 2 + (seed % 3),
    variant: Math.floor(seed / 3) % 2 ? "transfer" : "standard",
    chaos: Math.floor(seed / 6) % 2 !== 0,
    frequency: ["rare", "normal", "mad"][Math.floor(seed / 12) % 3],
    difficulty: ["easy", "medium", "hard"][Math.floor(seed / 36) % 3],
  });
  let steps = 0;
  try {
    while (!s.finished && steps++ < 10000) {
      if (s.phase === "event") {
        const r = F.eventAction(s, F.botEvent(s));
        if (!r.ok) throw Error(r.error);
        events++;
      } else {
        const a = E.bot(E.observation(s));
        if (!a) throw Error("Нет действия");
        const r = E.apply(s, s.actor, a);
        if (!r.ok) throw Error(r.error);
      }
      E.invariant(s);
    }
    if (!s.finished) throw Error("Незавершённая партия");
  } catch (e) {
    require("fs").writeFileSync(
      require("node:path").join(__dirname, "../docs/failing-game.json"),
      JSON.stringify(s, null, 2),
    );
    throw Error("seed " + seed + " step " + steps + ": " + e.message);
  }
  total += steps;
  max = Math.max(max, steps);
}
console.log(
  JSON.stringify({
    simulations: 1000,
    totalActions: total,
    maxActions: max,
    events,
    illegalMoves: 0,
    cardInvariantFailures: 0,
  }),
);
