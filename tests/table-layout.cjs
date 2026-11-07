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
  S = require("../src/game/save");
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
  .listen(8797, "127.0.0.1");
function profile(count) {
  const p = S.fresh();
  p.name = "Роман";
  p.settings.fast = p.settings.reduced = true;
  p.settings.music = p.settings.sfx = 0;
  const s = E.start({
    seed: 42,
    count: 2,
    chaos: true,
    names: [p.name, "Палыч"],
    npcs: [5, 0],
  });
  s.table =
    count === 6
      ? Array.from({ length: 5 }, (_, i) => ({
          attack: i * 2,
          defense: i * 2 + 1,
        }))
      : [{ attack: 10, defense: null }];
  s.players[0].hand = [22, 23, 24, 25, 26, 27];
  s.players[1].hand = [11, 12, 13, 14, 15, 16];
  s.deck = [];
  s.discard = Array.from({ length: 36 }, (_, i) => i).filter(
    (i) =>
      ![
        ...s.players.flatMap((p) => p.hand),
        ...s.table.flatMap((p) =>
          p.defense == null ? [p.attack] : [p.attack, p.defense],
        ),
      ].includes(i),
  );
  s.trump = 3;
  s.trumpCard = 35;
  s.actor = 1;
  s.defender = count === 6 ? 0 : 1;
  s.attacker = s.origin = count === 6 ? 1 : 0;
  s.phase = count === 6 ? "adding" : "defending";
  s.limit = 6;
  s.pending = [];
  p.game = s;
  E.invariant(s);
  return p;
}
(async () => {
  const b = await pw.chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  let visibleBubbles = 0;
  try {
    for (const [w, h] of process.env.TABLE_VIEWPORTS
      ? JSON.parse(process.env.TABLE_VIEWPORTS)
      : [
          [360, 640],
          [360, 800],
          [390, 844],
          [412, 915],
          [740, 360],
          [844, 390],
          [1366, 768],
          [1920, 1080],
        ])
      for (const count of [1, 6]) {
        const ctx = await b.newContext({ viewport: { width: w, height: h } }),
          page = await ctx.newPage(),
          p = profile(count),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.addInitScript(
          (p) => localStorage.setItem("durak-vahta-v1", JSON.stringify(p)),
          p,
        );
        await page.goto("http://127.0.0.1:8797/index.html");
        await page.locator("[data-action=continue]").click();
        await page.waitForFunction(
          () =>
            document.body.dataset.animating !== "true" &&
            document.querySelector("#dialog-text")?.textContent.length > 0,
        );
        await page.evaluate(
          () =>
            new Promise((r) =>
              requestAnimationFrame(() => requestAnimationFrame(r)),
            ),
        );
        const m = await page.evaluate(() => {
          const rect = (x) => x.getBoundingClientRect(),
            overlap = (a, b) =>
              a.left < b.right &&
              a.right > b.left &&
              a.top < b.bottom &&
              a.bottom > b.top,
            t = document.querySelector(".table-zone"),
            bounds = rect(t),
            d = rect(document.querySelector(".discard-target")),
            speech = document.querySelector(".speech"),
            s = speech.offsetHeight ? rect(speech) : null;
          return {
            pairInline: document
              .querySelector(".card-pair")
              ?.getAttribute("style"),
            pairH: getComputedStyle(document.querySelector(".card-pair"))
              .height,
            pairStyle: document.querySelector(".pairs").getAttribute("style"),
            table: bounds.toJSON(),
            speech: s?.toJSON(),
            battle: rect(document.querySelector(".battle")).toJSON(),
            pairsBox: rect(document.querySelector(".pairs")).toJSON(),
            events: document.querySelectorAll(".event-stock").length,
            slots: document.querySelectorAll(".pair-slot").length,
            discardInStocks: !!document.querySelector(
              ".stocks > .discard-target",
            ),
            noOverlap: !s || !overlap(d, s),
            speechVisible: !!s,
            speechFits:
              !s || (s.bottom <= bounds.bottom && s.right <= bounds.right),
            cards: [...document.querySelectorAll(".pairs .playing-card")].map(
              (x) => {
                const r = rect(x);
                return {
                  r: r.toJSON(),
                  readable: r.width >= 49,
                  inside:
                    r.left >= bounds.left &&
                    r.right <= bounds.right &&
                    r.top >= bounds.top &&
                    r.bottom <= bounds.bottom,
                  clear: !s || !overlap(r, s),
                };
              },
            ),
            scroll:
              document.documentElement.scrollHeight > innerHeight ||
              t.scrollHeight > t.clientHeight + 1 ||
              t.scrollWidth > t.clientWidth + 1,
          };
        });
        assert.equal(m.events, 0);
        assert.equal(m.slots, 0);
        if (!m.speechFits || m.scroll)
          await page.screenshot({
            path: path.join(
              root,
              "docs/screenshots/table-layout-diagnostic.png",
            ),
          });
        assert(
          m.discardInStocks && m.noOverlap && m.speechFits && !m.scroll,
          JSON.stringify({ w, h, count, m }),
        );
        assert(
          m.cards.length === (count === 6 ? 11 : 2) &&
            m.cards.every((c) => c.readable && c.inside && c.clear),
          JSON.stringify({ w, h, count, m }),
        );
        assert.deepEqual(errors, []);
        if (m.speechVisible) visibleBubbles++;
        if ([390, 740].includes(w))
          await page.screenshot({
            path: path.join(
              root,
              `docs/screenshots/table-clean-${w}-${count}-pairs.png`,
            ),
          });
        report.push({
          viewport: `${w}x${h}`,
          pairs: count,
          eventsHidden: true,
          noLabelSpeechOrCardOverlap: true,
        });
        await ctx.close();
      }
    assert(
      visibleBubbles >= (process.env.TABLE_VIEWPORTS ? 0 : 6),
      "must test real visible NPC speech, not only hidden bubbles",
    );
    for (const [w, h] of [
      [360, 640],
      [390, 844],
      [740, 360],
    ]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h } }),
        page = await ctx.newPage(),
        p = profile(1);
      const g = p.game;
      g.table = [];
      g.players[0].hand = [0, 1, 2, 3, 4, 5];
      g.players[1].hand = [9, 10, 11, 12, 13, 14];
      g.discard = Array.from({ length: 36 }, (_, i) => i).filter(
        (i) => !g.players.some((p) => p.hand.includes(i)),
      );
      g.phase = "event";
      g.actor = 0;
      g.nextCandidate = 0;
      g.event = { id: 25, recipient: 0 };
      g.eventDeck = g.eventDeck.filter((i) => i !== 25);
      E.invariant(g);
      await page.addInitScript(
        (p) => localStorage.setItem("durak-vahta-v1", JSON.stringify(p)),
        p,
      );
      await page.goto("http://127.0.0.1:8797/index.html");
      await page.locator("[data-action=continue]").click();
      const a = F.botEvent(g);
      for (let step = 0; step < 7; step++) {
        const radio = page.locator(
          `input[name=event-choice][value="${a.choice}"]`,
        );
        if (await radio.count()) await radio.check();
        const target = page.locator(
          `[data-action=event-target][data-id="${a.target}"]`,
        );
        if (await target.count()) await target.click();
        const card = page.locator(
          `[data-action=event-card][data-card="${a.card}"]`,
        );
        if (await card.count())
          await card.click({ position: { x: 10, y: 10 } });
        if (await page.locator("[data-action=event-next]").count())
          await page.locator("[data-action=event-next]").click();
        else {
          await page.locator("[data-action=event-accept]").click();
          break;
        }
      }
      const state = await page.evaluate(
        () => JSON.parse(localStorage.getItem("durak-vahta-v1")).game,
      );
      assert.equal(state.metrics.events.length, 1);
      assert.equal(state.metrics.events[0].id, 25);
      assert.equal(await page.locator(".event-stock").count(), 0);
      E.invariant(state);
      report.push({
        viewport: `${w}x${h}`,
        hiddenEventDeckStillResolves: true,
      });
      await ctx.close();
    }

    // Adding the fourth pair changes the grid row count; flight must land at the final card position.
    for (const [w, h] of [
      [360, 800],
      [740, 360],
    ]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h } }),
        page = await ctx.newPage(),
        p = profile(1),
        g = p.game;
      p.settings.fast = p.settings.reduced = false;
      g.table = [
        { attack: 0, defense: 1 },
        { attack: 9, defense: 10 },
        { attack: 18, defense: 19 },
      ];
      g.players[0].hand = [27, 22, 23, 24, 25, 26];
      g.players[1].hand = [28, 29, 30, 31, 32, 33];
      g.discard = Array.from({ length: 36 }, (_, i) => i).filter(
        (i) =>
          ![
            ...g.players.flatMap((p) => p.hand),
            ...g.table.flatMap((p) => [p.attack, p.defense]),
          ].includes(i),
      );
      g.actor = 0;
      g.phase = "adding";
      E.invariant(g);
      assert(E.legal(g, 0).some((a) => a.type === "attack" && a.card === 27));
      await page.addInitScript(
        (p) => localStorage.setItem("durak-vahta-v1", JSON.stringify(p)),
        p,
      );
      await page.goto("http://127.0.0.1:8797/index.html");
      await page.locator("[data-action=continue]").click();
      await page.evaluate(() => document.fonts.ready);
      await page
        .locator('.hand [data-card="27"]')
        .click({ position: { x: 10, y: 10 } });
      const beforeLayout = await page.evaluate(() =>
        Object.fromEntries(
          [".pairs", ".turn-label", ".human-zone", ".hand"].map((s) => [
            s,
            document.querySelector(s).getBoundingClientRect().toJSON(),
          ]),
        ),
      );
      await page.locator("[data-action=play-selected]").click();
      await page.locator(".flight-card").waitFor({ state: "visible" });
      const end = await page.locator(".flight-card").evaluate((x) => {
        const f = x.getAnimations()[0].effect.getKeyframes().at(-1),
          m = new DOMMatrix(f.transform);
        return {
          left: m.m41,
          top: m.m42,
          width: x.getBoundingClientRect().width,
        };
      });
      await page.waitForFunction(
        () => document.body.dataset.animating !== "true",
      );
      const landed = await page
        .locator('.pairs [data-card="27"]')
        .evaluate((x) => x.getBoundingClientRect().toJSON());
      assert(
        Math.abs(landed.left - end.left) < 2 &&
          Math.abs(landed.top - end.top) < 2,
        JSON.stringify({
          w,
          h,
          beforeLayout,
          end,
          landed,
          afterLayout: await page.evaluate(() =>
            Object.fromEntries(
              [".pairs", ".turn-label", ".human-zone", ".hand"].map((s) => [
                s,
                document.querySelector(s).getBoundingClientRect().toJSON(),
              ]),
            ),
          ),
        }),
      );
      report.push({
        viewport: `${w}x${h}`,
        newPairFlightMatchesFinalGrid: true,
      });
      await ctx.close();
    }
  } finally {
    await b.close();
    server.close();
  }
  fs.writeFileSync(
    path.join(root, "docs/table-layout-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    "PASS " +
      report.length +
      " table overlap and hidden-event scenarios; " +
      visibleBubbles +
      " visible NPC bubbles",
  );
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
