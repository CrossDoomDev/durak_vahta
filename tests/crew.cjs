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
  C = require("../src/content/characters"),
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
  .listen(8791, "127.0.0.1");
(async () => {
  const b = await pw.chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
    args: ["--no-sandbox"],
  });
  const report = [];
  try {
    for (const npc of C.NPC) {
      const ctx = await b.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      const p = S.fresh();
      p.name = "Михаил";
      p.settings.music = p.settings.sfx = 0;
      await page.addInitScript(
        (p) => localStorage.setItem("durak-vahta-v1", JSON.stringify(p)),
        p,
      );
      await page.goto("http://127.0.0.1:8791/index.html");
      await page.locator('[data-action="setup"]').click();
      assert.equal(await page.locator(".npc-card").count(), 10);
      await page.locator("#count").selectOption("2");
      await page.locator('[data-action="npc"][data-id="0"]').click();
      await page.locator(`[data-action="npc"][data-id="${npc.id}"]`).click();
      if (npc.id === 10)
        await page.screenshot({
          path: path.join(root, "docs/screenshots/crew-selection-mobile.png"),
          fullPage: true,
        });
      await page.locator('[data-action="start"]').click();
      const game = await page.evaluate(
        () => JSON.parse(localStorage.getItem("durak-vahta-v1")).game,
      );
      assert.equal(game.players[1].name, npc.name);
      assert.equal(game.players[1].npc, npc.id);
      const image = await page
        .locator(".opponent .avatar")
        .evaluate((el) => getComputedStyle(el).backgroundImage);
      assert.ok(image.includes(npc.id >= 6 ? "npc-extra.webp" : "npc.webp"));
      assert.deepEqual(errs, []);
      report.push({ npc: npc.name, job: npc.job, selectionAndPortrait: true });
      await ctx.close();
    }
    for (let suit = 0; suit < 4; suit++) {
      const ctx = await b.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      });
      const page = await ctx.newPage(),
        p = S.fresh();
      p.name = "Михаил";
      p.settings.music = p.settings.sfx = 0;
      const s = E.start({ seed: 11, count: 2 });
      s.players[0].name = p.name;
      s.deck = [];
      s.table = [];
      s.players[0].hand = [0, 2];
      s.players[1].hand = [1, 3];
      s.discard = Array.from({ length: 32 }, (_, i) => i + 4);
      s.trump = suit;
      s.actor = s.attacker = s.origin = 0;
      s.defender = 1;
      s.limit = 2;
      s.phase = "attacking";
      p.game = s;
      E.invariant(s);
      await page.addInitScript(
        (p) => localStorage.setItem("durak-vahta-v1", JSON.stringify(p)),
        p,
      );
      await page.goto("http://127.0.0.1:8791/index.html");
      await page.locator('[data-action="continue"]').click();
      const marker = page.locator(".stock-pile .empty-trump");
      assert.equal(await marker.isVisible(), true);
      assert.equal(await marker.textContent(), E.SUITS[suit]);
      assert.equal(await page.locator(".trump-label").count(), 0);
      assert.equal(
        await marker.evaluate((el) => el.classList.contains("red")),
        [1, 2].includes(suit),
      );
      if (suit === 1)
        await page.screenshot({
          path: path.join(
            root,
            "docs/screenshots/empty-stock-trump-mobile.png",
          ),
        });
      report.push({ trump: E.SUITS[suit], emptyStockMarker: true });
      await ctx.close();
    }
  } finally {
    await b.close();
    server.close();
  }
  fs.writeFileSync(
    path.join(root, "docs/crew-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    "PASS all 10 selectable opponents and all 4 empty-stock trump suits",
  );
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
