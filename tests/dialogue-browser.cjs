const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require("/workspace/indie-forge/node_modules/playwright");
}
const E = require("../src/game/engine"),
  F = require("../src/game/events"),
  S = require("../src/game/save"),
  C = require("../src/content/characters");
F.setContent(require("../src/content/events"));
const root = path.resolve(__dirname, ".."),
  report = [];
const server = http
  .createServer((q, r) => {
    const p = path.join(root, "dist", q.url.split("?")[0]);
    fs.readFile(p, (e, b) => {
      r.setHeader(
        "Content-Type",
        {
          js: "application/javascript",
          css: "text/css",
          html: "text/html",
          webp: "image/webp",
          ttf: "font/ttf",
        }[p.split(".").pop()] || "application/octet-stream",
      );
      r.end(e ? "" : b);
    });
  })
  .listen(8799, "127.0.0.1");
function fixture(kind) {
  const p = S.fresh();
  p.name = "Роман";
  p.settings.fast = false;
  p.settings.reduced = true;
  p.settings.music = p.settings.sfx = 0;
  const g = E.start({
    seed: 17,
    count: 3,
    chaos: true,
    variant: kind === "transfer" ? "transfer" : "standard",
    names: ["Роман", "Палыч", "Нина"],
    npcs: [5, 0, 7],
  });
  g.players[0].hand = [22, 23, 24];
  g.players[1].hand =
    kind === "transfer" ? [9, 12, 13] : kind === "take" ? [0, 9] : [1, 12, 13];
  g.players[2].hand = [18, 19, 20];
  g.deck = [];
  g.table = [];
  g.pending = [];
  g.actor = g.attacker = g.origin = 1;
  g.defender = 2;
  g.phase = "attacking";
  g.limit = 3;
  let target = 2;
  if (["defend", "take", "transfer"].includes(kind)) {
    g.actor = g.defender = 1;
    g.attacker = g.origin = 0;
    g.phase = "defending";
    g.table = [{ attack: kind === "take" ? 8 : 0, defense: null, playedBy: 2 }];
    g.limit = 3;
  }
  if (kind === "human") {
    g.defender = 0;
    target = 0;
  }
  if (kind.startsWith("event")) {
    g.phase = "event";
    g.actor = 0;
    g.event = {
      id: kind === "event-neutral" ? 19 : kind === "event-skip" ? 23 : 1,
      recipient: kind === "event-npc" ? 1 : 0,
    };
    g.nextCandidate = 0;
    g.eventDeck = g.eventDeck.filter((n) => n !== g.event.id);
    const used = g.players.flatMap((p) => p.hand);
    g.deck = Array.from({ length: 36 }, (_, i) => i).filter(
      (i) => !used.includes(i),
    );
    target = kind === "event-npc" ? 2 : 0;
  }
  const used = [
    ...g.players.flatMap((p) => p.hand),
    ...g.table.flatMap((p) =>
      p.defense == null ? [p.attack] : [p.attack, p.defense],
    ),
    ...g.deck,
  ];
  g.discard = Array.from({ length: 36 }, (_, i) => i).filter(
    (i) => !used.includes(i),
  );
  E.invariant(g);
  p.game = g;
  return { p, target };
}
(async () => {
  const b = await pw.chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const [w, h] of [
      [390, 844],
      [740, 360],
    ])
      for (const kind of [
        "attack",
        "defend",
        "transfer",
        "take",
        "human",
        "event-human",
        "event-npc",
        "event-neutral",
        "event-skip",
      ]) {
        const { p, target } = fixture(kind),
          ctx = await b.newContext({ viewport: { width: w, height: h } }),
          page = await ctx.newPage(),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.addInitScript(
          (p) => localStorage.setItem("durak-vahta-v1", JSON.stringify(p)),
          p,
        );
        await page.goto("http://127.0.0.1:8799/index.html");
        await page.locator("[data-action=continue]").click();
        if (kind.startsWith("event")) {
          while (await page.locator("[data-action=event-next]").count()) {
            const choice = page.locator(
              'input[name="event-choice"][value="skip"]',
            );
            if (await choice.count()) await choice.check();
            await page.locator("[data-action=event-next]").click();
          }
          await page.locator("[data-action=event-accept]").click();
        }
        await page.waitForFunction(
          () =>
            document.body.dataset.animating !== "true" &&
            document.querySelector("#dialog-text")?.textContent.length > 0,
        );
        const speech = page.locator(".speech");
        assert.equal(await speech.getAttribute("data-speaker"), "1");
        assert.equal(
          await speech.getAttribute("data-addressee"),
          String(target),
        );
        const text = await page.locator("#dialog-text").textContent();
        const recipient = p.game.players[target].name;
        assert.ok(
          text.startsWith(recipient + ","),
          JSON.stringify({ kind, text, recipient }),
        );
        if (target !== 0)
          assert(!text.includes("Роман"), JSON.stringify({ kind, text }));
        if (kind.startsWith("event")) {
          const category =
              kind === "event-neutral" ? "event_neutral" : "event_bad",
            observer = kind !== "event-npc";
          assert.ok(
            [0, 1]
              .map((v) =>
                C.dialogue(category, 0, recipient, "full", v, observer),
              )
              .includes(text),
            JSON.stringify({ kind, text }),
          );
        }
        if (kind === "attack" || kind === "human" || kind === "transfer") {
          const g = await page.evaluate(
            () => JSON.parse(localStorage.getItem("durak-vahta-v1")).game,
          );
          assert.equal(g.table.at(-1).playedBy, 1);
          E.invariant(g);
        }
        if (w === 390 && kind === "defend")
          await page.screenshot({
            path: path.join(root, "docs/screenshots/dialogue-npc-to-npc.png"),
          });
        assert.equal(await page.locator(".game-toolbar [data-action=talk]").count(), 0);
        assert.equal(await speech.getAttribute("data-action"), null);
        assert.equal(await speech.evaluate(el => el.tagName), "DIV");
        // Clicking the message or its text must neither pause play nor open an overlay.
        if (await speech.isVisible()) {
          const fullText = await page.locator("#dialog-text").evaluate(el => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const text = range.getBoundingClientRect(), box = el.getBoundingClientRect(),
              bubble = el.closest(".speech").getBoundingClientRect(),
              table = el.closest(".table-zone").getBoundingClientRect();
            return {clamp:getComputedStyle(el).webkitLineClamp,
              fits:el.scrollHeight <= el.clientHeight + 1 && text.bottom <= box.bottom + 1 &&
                box.bottom <= bubble.bottom + 1 && bubble.bottom <= table.bottom + 1};
          });
          assert.equal(fullText.clamp, "none", "speech must not end with a CSS ellipsis");
          assert.ok(fullText.fits, "entire message must fit its visible bubble and table");
          const beforeClick = await page.evaluate(() => JSON.parse(localStorage.getItem("durak-vahta-v1")).game.sequence);
          await speech.click();
          await page.locator("#dialog-text").click();
          assert.equal(await page.locator("#overlay").evaluate(el => el.childElementCount), 0);
          assert.equal(await page.locator("#app").evaluate(el => el.inert), false);
          assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("durak-vahta-v1")).game.sequence), beforeClick);
        }
        assert.deepEqual(errors, []);
        report.push({
          viewport: `${w}x${h}`,
          action: kind,
          speaker: "Палыч",
          recipient,
          text,
        });
        await ctx.close();
      }
  } finally {
    await b.close();
    server.close();
  }
  fs.writeFileSync(
    path.join(root, "docs/dialogue-browser-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    "PASS " +
      report.length +
      " real UI dialogue audience and event-perspective scenarios",
  );
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
