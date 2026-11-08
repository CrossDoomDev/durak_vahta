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
  .listen(8794, "127.0.0.1");
(async () => {
  const b = await pw.chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const [w, h] of process.env.EVENTS_ONLY
      ? []
      : process.env.SCREEN_VIEWPORTS ? JSON.parse(process.env.SCREEN_VIEWPORTS) : [
          [568, 320],
          [667, 375],
          [360, 640],
          [360, 800],
          [390, 844],
          [412, 915],
          [740, 360],
          [844, 390],
          [1366, 768],
          [1920, 1080],
        ]) {
      const ctx = await b.newContext({
          viewport: { width: w, height: h },
          isMobile: w < 1000,
          hasTouch: w < 1000,
        }),
        page = await ctx.newPage();
      page.setDefaultTimeout(6000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const click = async (sel) => page.locator(sel).first().click();
      async function check(label) {
        await page.evaluate(() => document.fonts.ready);
        const issues = await page.evaluate(() => {
          const issues = [],
            overlay = document.querySelector("#overlay").childElementCount > 0;
          if (
            document.documentElement.scrollWidth > innerWidth + 1 ||
            document.documentElement.scrollHeight > innerHeight + 1
          )
            issues.push("root scroll");
          for (const x of document.querySelectorAll(
            (overlay ? "#overlay" : "#app") +
              " :is(.menu,.menu-actions,.menu-grid,.page,.screen-content,.npc-card,.npc-info,.event-stage,.event-copy,.modal,.game-scene,.table-zone)",
          )) {
            if (!x.getClientRects().length) continue;
            if (
              x.scrollHeight > x.clientHeight + 2 ||
              x.scrollWidth > x.clientWidth + 2
            )
              issues.push(
                `overflow ${x.className} ${x.clientWidth}x${x.clientHeight} -> ${x.scrollWidth}x${x.scrollHeight}`,
              );
          }
          for (const x of document.querySelectorAll(
            (overlay ? "#overlay" : "#app") + " :is(button,input,select)",
          )) {
            if (
              !x.getClientRects().length ||
              x.disabled ||
              x.closest(".hand,.event-hand")
            )
              continue;
            const r = x.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (
              r.top < -0.5 ||
              r.left < -0.5 ||
              r.right > innerWidth + 0.5 ||
              r.bottom > innerHeight + 0.5
            )
              issues.push(
                `offscreen ${x.dataset.action || x.id} ${Math.round(r.bottom)}`,
              );
            const point = document.elementFromPoint(
              r.left + r.width / 2,
              r.top + r.height / 2,
            );
            if (point && !x.contains(point))
              issues.push(`covered ${x.dataset.action || x.id}`);
            let clip = x.parentElement;
            while (clip && clip !== document.body) {
              const c = getComputedStyle(clip);
              if (["hidden", "clip"].includes(c.overflowY)) {
                const q = clip.getBoundingClientRect();
                if (r.bottom > q.bottom + 2 || r.top < q.top - 2)
                  issues.push(
                    `clipped ${x.dataset.action || x.id} by ${clip.className}`,
                  );
              }
              clip = clip.parentElement;
            }
          }
          return [...new Set(issues)];
        });
        assert.deepEqual(issues, [], `${w}x${h}: ${label}`);
        report.push({
          viewport: `${w}x${h}`,
          screen: label,
          noScrollOrClippedControls: true,
        });
      }
      await page.goto("http://127.0.0.1:8794/index.html");
      await check("welcome");
      await page.locator("#player-name").fill("Михаил");
      await page.setViewportSize({ width: w, height: Math.min(h, 320) });
      assert.equal(await page.locator("#player-name").inputValue(), "Михаил");
      assert.equal(
        await page
          .locator("#player-name")
          .evaluate((x) => x === document.activeElement),
        true,
      );
      await check("name field with reduced keyboard viewport");
      await page.setViewportSize({ width: w, height: h });
      await click("#name-submit");
      await page.locator(".menu").waitFor();
      await check("menu");
      // An unfinished saved game exposes the additional Continue button.
      const savedMenu = await page.evaluate(() => {
        const p = JSON.parse(localStorage.getItem("durak-vahta-v1"));
        p.game = VahtaEngine.start({seed:42, count:4, names:[p.name,"Палыч","Санёк","Артём"]});
        return p;
      });
      await page.addInitScript(p => {
        if (!sessionStorage.getItem("viewport-saved-menu")) {
          localStorage.setItem("durak-vahta-v1", JSON.stringify(p));
          sessionStorage.setItem("viewport-saved-menu", "1");
        }
      }, savedMenu);
      await page.reload();
      await page.locator("[data-action=continue]").waitFor();
      await check("menu with saved match");
      if (w > h && w < 1000) {
        await page.setViewportSize({width:h,height:w});
        await check("saved menu rotated to portrait");
        await page.setViewportSize({width:w,height:h});
        await check("saved menu rotated back to landscape");
        await page.screenshot({path:path.join(root, `docs/screenshots/menu-landscape-${w}x${h}.png`)});
      }
      await click("[data-action=setup]");
      await check("new match confirmation");
      await click("[data-action=confirm-modal]");
      await check("setup conditions");
      await click("[data-value=crew]");
      const ids = new Set();
      let n = 0;
      while (true) {
        await check("crew page " + n++);
        for (const id of await page
          .locator(".npc-card")
          .evaluateAll((xs) => xs.map((x) => +x.dataset.id)))
          ids.add(id);
        if ((w === 390 && n === 3) || (w === 740 && n === 3))
          await page.screenshot({
            path: path.join(root, `docs/screenshots/viewport-crew-${w}.png`),
          });
        if (await page.locator("[data-action=page-next]").isDisabled()) break;
        await click("[data-action=page-next]");
      }
      assert.equal(ids.size, 10);
      await click("[data-action=back]");
      for (const screen of [
        "settings",
        "profile",
        "achievements",
        "gallery",
        "rules",
      ]) {
        await click(`[data-action=${screen}]`);
        if (screen === "settings" || screen === "profile") {
          const key = screen;
          const values =
            screen === "settings"
              ? ["general", "motion", "audio"]
              : ["identity", "stats", "saves"];
          for (const value of values) {
            await click(`[data-key=${key}][data-value=${value}]`);
            await check(`${screen} ${value}`);
            if (value === "identity") {
              await click("[data-action=page-next]");
              await check("avatars second page");
              await click("[data-action=page-prev]");
            }
          }
        } else {
          let count = 0;
          while (true) {
            await check(`${screen} page ${count++}`);
            if (
              !(await page.locator("[data-action=page-next]").count()) ||
              (await page.locator("[data-action=page-next]").isDisabled())
            )
              break;
            await click("[data-action=page-next]");
          }
          if (screen === "gallery") {
            assert.equal(count, 6);
            await click("[data-action=gallery-card]");
            await check("inspect");
            await click("[data-action=close-modal]");
            await click("[data-action=gallery-backs]");
            await check("backs");
          }
        }
        await click("[data-action=back]");
      }
      assert.deepEqual(errors, []);
      await ctx.close();
      console.log("PASS all screens " + w + "x" + h);
    }
    // Controlled valid states cover six covered pairs and event decision stages, with genuine 36-card invariants.
    for (const [w, h] of [
      ...(process.env.SCREENS_ONLY ? [] : [[360, 640], [390, 844], [740, 360], [1366, 768]])
    ]) {
      for (const id of [-1, ...Array.from({ length: 30 }, (_, i) => i), 31]) {
        const ctx = await b.newContext({ viewport: { width: w, height: h } }),
          page = await ctx.newPage();
        page.setDefaultTimeout(6000);
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const p = S.fresh();
        p.name = "Михаил";
        p.settings.music = p.settings.sfx = 0;
        const g = E.start({
          count: id === 31 ? 2 : 4,
          seed: 42,
          chaos: true,
          names: ["Михаил", "Палыч", "Санёк", "Артём"],
        });
        if (id === -1) {
          g.table = Array.from({ length: 6 }, (_, i) => ({
            attack: i * 2,
            defense: i * 2 + 1,
          }));
          g.players.forEach((p, i) => {
            p.hand = Array.from({ length: 6 }, (_, j) => 12 + 6 * i + j);
          });
          g.deck = [];
          g.discard = [];
          g.actor = 0;
          g.defender = 1;
          g.phase = "adding";
          g.limit = 6;
        } else {
          const eventId = id === 31 ? 11 : id;
          g.phase = "event";
          g.event = { id: eventId, recipient: 0 };
          g.actor = 0;
          g.nextCandidate = 0;
          g.eventDeck = g.eventDeck.filter((n) => n !== eventId);
          if (id === 31) {
            g.players[0].hand = Array.from({ length: 35 }, (_, i) => i);
            g.players[1].hand = [35];
            g.deck = [];
            g.discard = [];
          }
        }
        E.invariant(g);
        p.game = g;
        await page.addInitScript(
          (p) => localStorage.setItem("durak-vahta-v1", JSON.stringify(p)),
          p,
        );
        await page.goto("http://127.0.0.1:8794/index.html");
        await page.locator("[data-action=continue]").click();
        await page.evaluate(() => document.fonts.ready);
        if (id === -1) {
          const m = await page
            .locator(".pairs .playing-card")
            .evaluateAll((xs) =>
              xs.map((x) => {
                const r = x.getBoundingClientRect(),
                  b = x.closest(".table-zone").getBoundingClientRect();
                return {
                  w: r.width,
                  inside:
                    r.left >= b.left &&
                    r.right <= b.right + 1 &&
                    r.top >= b.top &&
                    r.bottom <= b.bottom + 1,
                };
              }),
            );
          assert.ok(
            m.every((c) => c.w >= 49 && c.inside),
            `${w}x${h}: readable six pairs ${JSON.stringify(m)}`,
          );
          await page.screenshot({
            path: path.join(
              root,
              `docs/screenshots/viewport-six-pairs-${w}.png`,
            ),
          });
          assert.equal(await page.locator("[data-action=talk]").count(), 0);
          await page.locator("[data-action=pause]").click();
          await page.locator("[data-action=unpause]").click();
        } else {
          let guard = 0;
          while ((await page.locator(".event-modal").count()) && guard++ < 8) {
            const metrics = await page.locator(".event-copy").evaluate((x) => ({
              h: x.clientHeight,
              sh: x.scrollHeight,
              w: x.clientWidth,
              sw: x.scrollWidth,
              stageH: x.querySelector(".event-stage").clientHeight,
              stageSH: x.querySelector(".event-stage").scrollHeight,
              modal: x.closest(".modal").getBoundingClientRect().bottom,
            }));
            assert.ok(
              metrics.sh <= metrics.h + 2 &&
                metrics.sw <= metrics.w + 2 &&
                metrics.stageSH <= metrics.stageH + 2 &&
                metrics.modal <= h,
              `event ${id} ${w}x${h} ${JSON.stringify(metrics)}`,
            );
            const choice = F.botEvent(g);
            let radio = page.locator(
              `input[name=event-choice][value="${choice.choice}"]`,
            );
            if (await radio.count()) await radio.check();
            let target = page.locator(
              `[data-action=event-target][data-id="${choice.target}"]`,
            );
            if (await target.count()) await target.click();
            let card = page.locator(
              `[data-action=event-card][data-card="${choice.card}"]`,
            );
            if (await card.count())
              await card.click({ position: { x: 10, y: 10 } });
            if (w === 390 && id === 25) {
              await page.waitForTimeout(320);
              await page.screenshot({
                path: path.join(
                  root,
                  `docs/screenshots/viewport-event-stage${guard}.png`,
                ),
              });
            }
            if (await page.locator("[data-action=event-next]").count())
              await page.locator("[data-action=event-next]").click();
            else {
              await page.locator("[data-action=event-accept]").click();
              break;
            }
          }
          assert.ok(guard < 8);
          assert.equal(
            await page.locator(".event-modal").count(),
            0,
            `event ${id} ${w}x${h}: ` +
              (await page.locator("#toast").textContent()),
          );
        }
        assert.deepEqual(errors, [], `errors in fixture ${id}`);
        report.push({
          viewport: `${w}x${h}`,
          scenario:
            id < 0
              ? "six pairs"
              : id === 31
                ? "event with 35 cards"
                : `event ${id}`,
          passed: true,
        });
        await ctx.close();
      }
      console.log("PASS six pairs and 30 events " + w + "x" + h);
    }
  } finally {
    await b.close();
    server.close();
  }
  fs.writeFileSync(
    path.join(root, "docs/viewport-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("PASS " + report.length + " viewport scenarios");
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
