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
  S = require("../src/game/save"),
  root = path.resolve(__dirname, "..");
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
  .listen(8804, "127.0.0.1");
(async () => {
  const b = await pw.chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const report = [];
  try {
    let g = E.start({
        seed: 3,
        count: 4,
        names: ["Михаил", "Палыч", "Санёк", "Тамара Петровна"],
        npcs: [5, 0, 1, 4],
      }),
      before,
      action;
    for (let i = 0; i < 1000 && !g.finished; i++) {
      before = structuredClone(g);
      action = E.bot(E.observation(g));
      assert.equal(E.apply(g, g.actor, action).ok, true);
    }
    assert(g.finished);
    assert.equal(g.result.loser, 0, "fixture really loses to the bots");
    for (const [w, h] of [
      [320, 568],
      [360, 640],
      [390, 844],
      [740, 360],
      [844, 390],
      [1366, 768],
    ]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h } }),
        page = await ctx.newPage(),
        p = S.fresh(),
        errors = [];
      p.name = "Михаил";
      p.lossBanter = {gameId:"previous",choice:0,remaining:[7]};
      p.game = before;
      p.settings.fast = true;
      p.settings.music = p.settings.sfx = 0;
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        (p) => localStorage.setItem("durak-vahta-v1", JSON.stringify(p)),
        p,
      );
      await page.goto("http://127.0.0.1:8804/index.html");
      await page.locator("[data-action=continue]").click();
      if (before.actor === 0) {
        if (action.card != null)
          await page
            .locator(`.hand [data-card="${action.card}"]`)
            .click({ position: { x: 10, y: 10 } });
        if (action.type === "defend")
          await page
            .locator(`[data-action=cover][data-pair="${action.pair}"]`)
            .click();
        else if (action.type === "attack" || action.type === "transfer")
          await page
            .locator(`[data-action=play-selected][data-type="${action.type}"]`)
            .click();
        else await page.locator(`[data-action="${action.type}"]`).click();
      }
      await page.locator(".results").waitFor({ timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.locator('.loss-art img').evaluate(img=>img.decode());
      assert.equal(await page.locator('.loss-results').count(),1);
      const quote=await page.locator('#result-quote').textContent();
      assert.ok(quote.includes(p.name));assert.ok(quote.includes('блядь'));
      assert.equal(await page.locator('.loss-art img').evaluate(img=>img.naturalWidth>0),true);
      const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('durak-vahta-v1')));
      assert.equal(state.lossBanter.choice,7);
      assert.equal(state.stats.classic.played,1);
      const m = await page.locator(".results").evaluate((x) => ({
        h: x.clientHeight,
        sh: x.scrollHeight,
        w: x.clientWidth,
        sw: x.scrollWidth,
        bottom: x.getBoundingClientRect().bottom,
        buttons: [...x.querySelectorAll("button")].every((x) => {
          const r = x.getBoundingClientRect();
          return r.bottom <= innerHeight && r.right <= innerWidth;
        }),
      }));
      assert.ok(
        m.sh <= m.h + 1 && m.sw <= m.w + 1 && m.bottom <= h && m.buttons,
        JSON.stringify({ w, h, m }),
      );
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: path.join(root, `docs/screenshots/loss-screen-${w}.png`),
      });
      report.push({
        viewport: `${w}x${h}`,
        realFinalAction: true,
        noOverflow: true,
      });
      await page.locator('.results [data-action="rematch"]').click();
      await page.locator('[data-action="start"]').click();
      await page.locator('.game-scene').waitFor();
      assert.equal(await page.locator('.table-empty').count(),0);
      assert.equal(await page.getByText('Стол свободен',{exact:true}).count(),0);
      await ctx.close();
    }
  } finally {
    await b.close();
    server.close();
  }
  fs.writeFileSync(
    path.join(root, "docs/loss-screen-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("PASS defeat artwork, personalized quote, durable result, rematch and layout on six viewports");
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
