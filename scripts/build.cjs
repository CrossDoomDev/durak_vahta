const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "dist");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const p of ["index.html", "src", "public"])
  fs.cpSync(path.join(root, p), path.join(out, p), {
    recursive: true,
    filter: (source) => !source.includes("/originals"),
  });
console.log("Offline build: dist/index.html");
const crypto = require("node:crypto");
const assets = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else assets.push("./" + path.relative(out, p).split(path.sep).join("/"));
  }
}
walk(out);
const version = crypto
  .createHash("sha256")
  .update(assets.map((p) => fs.readFileSync(path.join(out, p))).join(""))
  .digest("hex")
  .slice(0, 12);
fs.writeFileSync(
  path.join(out, "sw.js"),
  `const CACHE='durak-vahta-${version}',FILES=${JSON.stringify(assets)};self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('durak-vahta-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});`,
);
