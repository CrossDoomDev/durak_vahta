const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require("/workspace/indie-forge/node_modules/playwright");
}
(async () => {
  const b = await pw.chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const report = [];
  try {
    for (const [w, h] of [
      [390, 844],
      [740, 360],
    ]) {
      const p = await b.newPage({ viewport: { width: w, height: h } });
      await p.setContent(
        '<div id="table" data-game="test" data-round="1" style="width:242px;height:200px"></div>',
      );
      await p.addScriptTag({
        path: path.resolve(__dirname, "../src/table-camera.js"),
      });
      await p.evaluate(() => {
        window.camera = new VahtaTableCamera(() => ({
          fast: false,
          reduced: false,
        }));
        const el = document.querySelector("#table");
        el.innerHTML =
          '<div class="card-pair"><div class="playing-card"></div></div>';
        camera.layout(el, 1);
      });
      const initial = await p.evaluate(() => ({
        x: document.querySelector(".card-pair").style.left,
        y: document.querySelector(".card-pair").style.top,
        scale: camera.state.scale,
      }));
      assert.equal(initial.scale, 1);
      await p.evaluate(() => {
        const world = document.querySelector(".table-world");
        world.insertAdjacentHTML(
          "beforeend",
          '<div class="card-pair"><div class="playing-card"></div></div>',
        );
        window.zoom = camera.layout(document.querySelector("#table"), 2);
      });
      await p.waitForTimeout(100);
      const midway = await p.evaluate(() => ({
        scale: new DOMMatrix(
          getComputedStyle(document.querySelector(".table-world")).transform,
        ).a,
        target: camera.state.scale,
        animations: document.querySelector(".table-world").getAnimations()
          .length,
      }));
      assert(
        midway.animations > 0 &&
          midway.scale < 1 &&
          midway.scale > midway.target,
        JSON.stringify(midway),
      );
      await p.evaluate(() => zoom);
      let previous = await p.evaluate(() => camera.state.scale);
      for (let count = 3; count <= 6; count++) {
        await p.evaluate(async (count) => {
          document
            .querySelector(".table-world")
            .insertAdjacentHTML(
              "beforeend",
              '<div class="card-pair"><div class="playing-card"></div></div>',
            );
          await camera.layout(document.querySelector("#table"), count);
        }, count);
        const data = await p.evaluate(() => ({
          positions: [...document.querySelectorAll(".card-pair")].map((x) => ({
            x: x.style.left,
            y: x.style.top,
          })),
          scale: camera.state.scale,
        }));
        assert.deepEqual(data.positions[0], { x: initial.x, y: initial.y });
        assert(data.scale <= previous);
        previous = data.scale;
        for (let i = 0; i < count; i++)
          assert.deepEqual(data.positions[i], {
            x: (i % (w > h ? 6 : 3)) * 157 + "px",
            y: Math.floor(i / (w > h ? 6 : 3)) * 180 + "px",
          });
      }
      const before = await p.evaluate(() => ({
        x: document.querySelector(".card-pair").style.left,
        y: document.querySelector(".card-pair").style.top,
        scale: camera.state.scale,
      }));
      await p.evaluate(async () => {
        document
          .querySelector(".card-pair")
          .insertAdjacentHTML(
            "beforeend",
            '<div class="playing-card defense-card"></div>',
          );
        await camera.layout(document.querySelector("#table"), 6);
      });
      const after = await p.evaluate(() => ({
        x: document.querySelector(".card-pair").style.left,
        y: document.querySelector(".card-pair").style.top,
        scale: camera.state.scale,
        cover: {
          x: document.querySelector(".defense-card").style.left,
          y: document.querySelector(".defense-card").style.top,
        },
      }));
      assert.deepEqual({ x: after.x, y: after.y, scale: after.scale }, before);
      assert.deepEqual(after.cover, { x: "45px", y: "24px" });
      await p.evaluate(() => {
        document.querySelector("#table").dataset.round = "2";
        document.querySelector(".table-world").innerHTML =
          '<div class="card-pair"><div class="playing-card"></div></div>';
        camera.layout(document.querySelector("#table"), 1);
      });
      assert.equal(await p.evaluate(() => camera.state.scale), 1);
      const restored = await p.evaluate(async () => {
        const el = document.querySelector("#table");
        el.dataset.round = "3";
        el.innerHTML = Array.from(
          { length: 6 },
          () => '<div class="card-pair"><div class="playing-card"></div></div>',
        ).join("");
        const fresh = new VahtaTableCamera(() => ({
          fast: false,
          reduced: false,
        }));
        await fresh.layout(el, 6);
        return {
          scale: fresh.state.scale,
          animations: el.querySelector(".table-world").getAnimations().length,
        };
      });
      assert(restored.scale < 1);
      assert.equal(restored.animations, 0);
      report.push({
        restoredTableFitsImmediately: true,
        viewport: `${w}x${h}`,
        fixedSlots: true,
        sharedSmoothZoom: true,
        noZoomInDuringRound: true,
        coverDoesNotMoveAttack: true,
        resetForNextRound: true,
      });
      await p.close();
    }
  } finally {
    await b.close();
  }
  fs.writeFileSync(
    path.resolve(__dirname, "../docs/camera-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    "PASS stable card coordinates, smooth shared camera and cover placement on two orientations",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
