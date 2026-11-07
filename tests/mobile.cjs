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
const E = require("../src/game/engine.js"),
  S = require("../src/game/save.js"),
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
  .listen(8789, "127.0.0.1");
(async () => {
  const browser = await pw.chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox"],
    headless: true,
  });
  const report = [];
  try {
    for (const [w, h] of [
      [360, 800],
      [390, 844],
      [412, 915],
      [740, 360],
      [844, 390],
      [1366, 768],
    ])
      for (const count of [6, 12, 24, 35]) {
        const context = await browser.newContext({
          viewport: { width: w, height: h },
          isMobile: w < 1000,
          hasTouch: w < 1000,
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const p = S.fresh();
        p.name = "Тестовый";
        p.settings.music = p.settings.sfx = 0;
        const s = E.start({
          seed: 45,
          count: 2,
          names: ["Тестовый", "Палыч"],
          chaos: true,
        });
        s.players[0].hand = Array.from({ length: count }, (_, i) => i);
        s.players[1].hand = Array.from(
          { length: Math.min(6, 36 - count) },
          (_, i) => count + i,
        );
        s.deck = Array.from(
          { length: 36 - count - s.players[1].hand.length },
          (_, i) => count + s.players[1].hand.length + i,
        );
        s.trumpCard = s.deck.at(-1) ?? 35;
        s.trump = E.card(s.trumpCard).suit;
        s.actor = s.attacker = s.origin = 0;
        s.defender = 1;
        s.limit = Math.min(6, s.players[1].hand.length);
        s.phase = "attacking";
        s.discard = [];
        s.table = [];
        p.game = s;
        E.invariant(s);
        await page.addInitScript(
          (p) => localStorage.setItem("durak-vahta-v1", JSON.stringify(p)),
          p,
        );
        await page.goto("http://127.0.0.1:8789/index.html");
        await page.locator('[data-action="continue"]').click();
        await page.waitForTimeout(80);
        const metrics = await page.evaluate(() => {
          const hand = document.querySelector(".hand"),
            box = hand.getBoundingClientRect(),
            cards = [...hand.querySelectorAll(".playing-card")];
          return {
            scroll: hand.scrollWidth > hand.clientWidth,
            handBottom: box.bottom,
            viewport: innerHeight,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            cards: cards.map((c) => {
              const r = c.getBoundingClientRect(),
                badge = c.querySelector(".corner").getBoundingClientRect(),
                point = document.elementFromPoint(r.left + 10, r.top + 10);
              return {
                inside:
                  r.left >= box.left - 1 &&
                  r.right <= box.right + 1 &&
                  r.bottom <= box.bottom + 1,
                tappable: point?.closest(".playing-card") === c,
                background: getComputedStyle(c.querySelector(".corner"))
                  .backgroundColor,
              };
            }),
            trump: document.querySelector(".trump-show")
              ? document.querySelector(".trump-show").getBoundingClientRect()
                  .right <=
                document.querySelector(".stocks").getBoundingClientRect()
                  .right +
                  1
              : true,
          };
        });
        assert.equal(metrics.scroll, false, `${w}x${h}/${count}: hand scroll`);
        assert.equal(metrics.overflow, false);
        assert.ok(
          metrics.handBottom <= metrics.viewport + 1,
          `${w}x${h}/${count}: hand below screen ${JSON.stringify(metrics)}`,
        );
        assert.ok(
          metrics.cards.every(
            (c) =>
              c.inside && c.tappable && c.background !== "rgba(0, 0, 0, 0)",
          ),
          `${w}x${h}/${count}: inaccessible cards`,
        );
        assert.ok(metrics.trump);
        assert.equal(
          await page.locator('[data-action="event-gallery"]').count(),
          0,
        );
        const first = page.locator(".hand .playing-card").first();
        await first.click({ position: { x: 10, y: 10 } });
        assert.equal(await page.locator(".hand .selected").count(), 1);
        const stillTappable = await page.locator(".hand").evaluate((el) =>
          [...el.children].every((c) => {
            const r = c.getBoundingClientRect();
            return (
              document
                .elementFromPoint(r.left + 10, r.top + 10)
                ?.closest(".playing-card") === c
            );
          }),
        );
        assert.ok(
          stillTappable,
          `selection must not obscure other cards ${w}/${count}`,
        );
        assert.deepEqual(errors, []);
        if ([6, 24, 35].includes(count) && [390, 844].includes(w))
          await page.screenshot({
            path: path.join(
              root,
              `docs/screenshots/mobile-${w}x${h}-hand${count}.png`,
            ),
          });
        report.push({
          viewport: `${w}x${h}`,
          cards: count,
          allCardsVisibleAndTappable: true,
          noHandScroll: true,
        });
        await context.close();
      }
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(
    path.join(root, "docs/mobile-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `PASS ${report.length} mobile/desktop hand scenarios; contrast badges and secret event deck verified`,
  );
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
