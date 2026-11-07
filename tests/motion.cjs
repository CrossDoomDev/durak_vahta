const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require(
    process.env.PLAYWRIGHT_MODULE ||
      "/workspace/indie-forge/node_modules/playwright",
  );
}
const E = require("../src/game/engine"),
  S = require("../src/game/save"),
  root = path.resolve(__dirname, "..");
const server = http
  .createServer((req, res) => {
    const p = path.join(root, "dist", req.url.split("?")[0]);
    fs.readFile(p, (e, b) => {
      if (e) {
        res.writeHead(404);
        return res.end();
      }
      res.setHeader(
        "Content-Type",
        {
          js: "application/javascript",
          css: "text/css",
          html: "text/html",
          webp: "image/webp",
          ttf: "font/ttf",
          wav: "audio/wav",
        }[p.split(".").pop()] || "application/octet-stream",
      );
      res.end(b);
    });
  })
  .listen(8790, "127.0.0.1");
function fixture(kind) {
  const p = S.fresh();
  p.name = "Тестовый";
  p.settings.music = p.settings.sfx = 0;
  const s = E.start({ seed: 11, count: 2, names: [p.name, "Палыч"] });
  s.players[0].hand = [0];
  s.players[1].hand = [kind === "take" ? 9 : 1];
  s.deck = kind === "draw" ? Array.from({ length: 34 }, (_, i) => i + 2) : [];
  s.trump = 3;
  s.discard = Array.from({ length: 36 }, (_, i) => i).filter(
    (i) => !s.players.some((p) => p.hand.includes(i)) && !s.deck.includes(i),
  );
  s.table = [];
  s.actor = s.attacker = s.origin = 0;
  s.defender = 1;
  s.phase = "attacking";
  s.limit = 1;
  p.game = s;
  E.invariant(s);
  return p;
}
(async () => {
  const b = await pw.chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const report = [];
  try {
    for (const kind of ["discard", "take", "draw", "reload"]) {
      const context = await b.newContext({
        viewport: { width: 844, height: 390 },
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const p = fixture(kind);
      await page.addInitScript((p) => {
        if (!localStorage.getItem("durak-vahta-v1"))
          localStorage.setItem("durak-vahta-v1", JSON.stringify(p));
      }, p);
      await page.goto("http://127.0.0.1:8790/index.html");
      await page.locator('[data-action="continue"]').click();
      assert.equal(await page.locator(".trump-label").count(), 0);
      await page
        .locator(".hand .playing-card")
        .click({ position: { x: 10, y: 10 } });
      await page.locator('[data-action="play-selected"]').click();
      await page
        .locator('.flight-card[data-flight="play"]')
        .waitFor({ state: "visible" });
      assert.equal(
        await page.evaluate(() => document.querySelector("#app").inert),
        true,
      );
      const a = await page
        .locator(".flight-card")
        .first()
        .evaluate((el) => el.getBoundingClientRect().left);
      await page.waitForTimeout(220);
      const c = await page
        .locator(".flight-card")
        .first()
        .evaluate((el) => el.getBoundingClientRect().left);
      assert.ok(Math.abs(a - c) > 5, "card really moves");
      assert.equal(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("durak-vahta-v1")).game.sequence,
        ),
        1,
      );
      await page.evaluate(() =>
        document.querySelector('[data-action="play-selected"]')?.click(),
      );
      assert.equal(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("durak-vahta-v1")).game.sequence,
        ),
        1,
        "no double action during flight",
      );
      if (kind === "reload") {
        await page.reload();
        await page.locator('[data-action="continue"]').click();
        const state = await page.evaluate(
          () => JSON.parse(localStorage.getItem("durak-vahta-v1")).game,
        );
        assert.equal(state.sequence, 1);
        E.invariant(state);
        report.push("reload mid-flight preserves accepted state");
        await context.close();
        continue;
      }
      await page
        .locator(`.flight-card[data-flight="${kind}"]`)
        .first()
        .waitFor({ state: "visible" });
      if (kind === "draw") {
        assert.equal(
          await page
            .locator('.flight-card[data-flight="draw"] .corner')
            .count(),
          0,
        );
        await page.screenshot({
          path: path.join(root, "docs/screenshots/motion-draw-mobile.png"),
        });
        await page.waitForFunction(
          () => document.body.dataset.animating !== "true",
        );
        const restored = await page.evaluate(
          () => JSON.parse(localStorage.getItem("durak-vahta-v1")).game,
        );
        E.invariant(restored);
        assert.equal(E.stockCount(restored), 22);
        report.push("replenishment flight shows backs and respects rule order");
        await context.close();
        continue;
      }
      const taking = await page.evaluate(() => document.body.dataset.animating);
      assert.equal(taking, "true");
      await page.waitForFunction(
        () => document.body.dataset.animating !== "true",
      );
      await page.locator(".results").waitFor();
      const final = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("durak-vahta-v1")),
      );
      E.invariant(final.game);
      assert.equal(final.game.finished, true);
      assert.equal(final.game.result.draw, kind === "discard");
      assert.equal(final.stats.classic.played, 1);
      assert.equal(await page.locator(".flight-card").count(), 0);
      assert.deepEqual(errors, []);
      report.push(
        kind + " flight, turn serialization, final scoring and cleanup",
      );
      await context.close();
    }
  } finally {
    await b.close();
    server.close();
  }
  fs.writeFileSync(
    path.join(root, "docs/motion-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(report.join("\n"));
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
