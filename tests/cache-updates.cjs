const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  os = require("node:os"),
  { execFileSync } = require("node:child_process"),
  assert = require("node:assert/strict");
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require("/workspace/indie-forge/node_modules/playwright");
}
const S = require("../src/game/save"),
  E = require("../src/game/engine"),
  root = path.resolve(__dirname, "..");
const next = fs.mkdtempSync(path.join(os.tmpdir(), "vahta-update-"));
for (const dir of ["src", "scripts", "public/assets"])
  fs.cpSync(path.join(root, dir), path.join(next, dir), { recursive: true });
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
pkg.version = "1.6.2-test";
fs.writeFileSync(path.join(next, "package.json"), JSON.stringify(pkg));
fs.appendFileSync(
  path.join(next, "src/main.js"),
  '\nglobalThis.__CacheTestRelease="next";\n',
);
execFileSync(process.execPath, [path.join(next, "scripts/build.cjs")], {
  stdio: "pipe",
});
const current = JSON.parse(fs.readFileSync(path.join(root, "version.json"))),
  future = JSON.parse(fs.readFileSync(path.join(next, "version.json")));
const legacyHTML =
  '<!doctype html><html><head><link rel="stylesheet" href="legacy.css"></head><body>OLD LEGACY RELEASE<script src="legacy.js"></script><script>navigator.serviceWorker.register("sw.js")</script></body></html>';
const legacySW = `const C='durak-vahta-abcdef123456';self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html','./legacy.css','./legacy.js'])).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method==='GET')e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});`;
let mode = "legacy",
  staleRoot = false;
const requests = [];
const server = http
  .createServer((q, r) => {
    const u = new URL(q.url, "http://localhost");
    requests.push(u.pathname + u.search);
    r.setHeader("Cache-Control", "public,max-age=31536000,immutable");
    if (!u.pathname.startsWith("/game/")) {
      r.writeHead(404);
      return r.end();
    }
    const rel =
      decodeURIComponent(u.pathname.slice("/game/".length)) || "index.html";
    if (mode === "legacy") {
      r.setHeader(
        "Content-Type",
        rel.endsWith(".js")
          ? "application/javascript"
          : rel.endsWith(".css")
            ? "text/css"
            : "text/html",
      );
      return r.end(
        rel === "sw.js"
          ? legacySW
          : rel === "legacy.js"
            ? "window.LEGACY_CAMERA=true;"
            : rel === "legacy.css"
              ? "body{background:rgb(255,0,0)}"
              : legacyHTML,
      );
    }
    const dir = mode === "current" ? root : next;
    let file = path.join(dir, rel);
    if (staleRoot && rel === "index.html") file = path.join(root, "index.html");
    fs.readFile(file, (e, b) => {
      if (e) {
        r.writeHead(404);
        return r.end();
      }
      r.setHeader(
        "Content-Type",
        {
          js: "application/javascript",
          css: "text/css",
          html: "text/html",
          json: "application/json",
          webp: "image/webp",
          ttf: "font/ttf",
        }[file.split(".").pop()] || "application/octet-stream",
      );
      if (mode === "current" && rel === "public/assets/audio/music.wav")
        setTimeout(() => r.end(b), 2000);
      else r.end(b);
    });
  })
  .listen(8800, "127.0.0.1");
async function worker(page, id) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const matched = await page.evaluate(async (id) => {
      const controller = navigator.serviceWorker.controller;
      if (!controller) return false;
      return await new Promise((resolve) => {
        const c = new MessageChannel(),
          timer = setTimeout(() => {
            c.port1.close();
            resolve(false);
          }, 200);
        c.port1.onmessage = (e) => {
          clearTimeout(timer);
          c.port1.close();
          resolve(e.data.id === id);
        };
        controller.postMessage({ type: "VAHTA_VERSION" }, [c.port2]);
      });
    }, id);
    if (matched) return;
    await page.waitForTimeout(100);
  }
  throw Error("Service worker did not activate release " + id);
}

(async () => {
  const b = await pw.chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const report = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }),
      page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(20000);
    await page.goto("http://127.0.0.1:8800/game/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    const saved = S.fresh();
    saved.name = "Роман";
    saved.xp = 123;
    saved.game = E.start({
      seed: 42,
      count: 3,
      names: ["Роман", "Палыч", "Нина"],
    });
    await page.evaluate(
      (p) => localStorage.setItem("durak-vahta-v1", JSON.stringify(p)),
      saved,
    );
    mode = "current";
    await page.reload();
    assert(
      (await page.locator("body").textContent()).includes("OLD LEGACY RELEASE"),
    );
    report.push(
      "Reproduced old HTML/JS/CSS served by legacy cache-first worker",
    );
    await page.goto("http://127.0.0.1:8800/game/" + current.html);
    await page.locator(".menu").waitFor();
    assert.equal(await page.evaluate(() => VahtaBuild.id), current.id);
    assert.equal(await page.evaluate(() => !!window.LEGACY_CAMERA), false);
    assert(
      (await page.locator(".build-version").textContent()).includes(
        current.version,
      ),
    );
    assert.equal(
      await page.evaluate(() => typeof VahtaTableCamera),
      "function",
    );
    assert(
      (await page.evaluate(() => location.pathname)).endsWith(current.html),
      "keep immutable entry until the new worker is active",
    );
    await page.reload();
    await page.locator(".menu").waitFor();
    assert.equal(await page.evaluate(() => VahtaBuild.id), current.id);
    report.push(
      "Immediate refresh during legacy-worker migration keeps the new release",
    );
    await worker(page, current.id);
    await page.waitForFunction(() => location.pathname === "/game/");
    report.push(
      "Unique release link migrates old cache without clearing profile or game",
    );
    // Keep the root HTML and all HTTP caches stale while the version manifest and immutable release change.
    mode = "future";
    staleRoot = true;
    await page.reload();
    await page.waitForFunction((id) => window.VahtaBuild?.id === id, future.id);
    await page.locator(".menu").waitFor();
    assert.equal(await page.evaluate(() => window.__CacheTestRelease), "next");
    assert(requests.some((u) => u.startsWith("/game/" + future.html)));
    const styles = await page
      .locator("link[rel=stylesheet]")
      .getAttribute("href");
    assert(styles.includes(future.id));
    assert.equal(await page.evaluate(() => VahtaBuild.checkedOnline), true);
    await worker(page, future.id);
    await page.waitForFunction(() => location.pathname === "/game/");
    report.push(
      "Ordinary reload bypasses stale cached root HTML and loads matching new JS/CSS",
    );
    const profile = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("durak-vahta-v1")),
    );
    assert.equal(profile.name, saved.name);
    assert.equal(profile.xp, saved.xp);
    assert.deepEqual(profile.game, saved.game);
    E.invariant(profile.game);
    report.push("Name, XP, saved game and RNG survive both updates exactly");
    await ctx.setOffline(true);
    await page.reload();
    await page.locator(".menu").waitFor();
    assert.equal(await page.evaluate(() => VahtaBuild.id), future.id);
    assert.equal(await page.evaluate(() => VahtaBuild.checkedOnline), false);
    assert.equal(await page.evaluate(() => window.__CacheTestRelease), "next");
    report.push(
      "Newest installed release still loads offline, with matching code and styles",
    );
    await page.screenshot({
      path: path.join(root, "docs/screenshots/cache-update-mobile.png"),
    });
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await b.close();
    server.close();
    fs.rmSync(next, { recursive: true, force: true });
  }
  fs.writeFileSync(
    path.join(root, "docs/cache-update-results.json"),
    JSON.stringify(
      { current: current.id, future: future.id, scenarios: report },
      null,
      2,
    ),
  );
  console.log(
    "PASS " +
      report.length +
      " cache migration, refresh, save preservation and offline scenarios",
  );
})().catch((e) => {
  console.error(e);
  server.close();
  fs.rmSync(next, { recursive: true, force: true });
  process.exitCode = 1;
});
