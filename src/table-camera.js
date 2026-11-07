/* Cards have immutable coordinates within a round. Only the shared camera scales. */
(function (root) {
  const CARD_W = 100,
    CARD_H = 144,
    DX = 45,
    DY = 24,
    STEP_X = 157,
    STEP_Y = 180,
    PAD = 2;
  class VahtaTableCamera {
    constructor(settings) {
      this.settings = settings;
      this.state = null;
    }
    finish() {
      this.state?.animation?.finish();
    }
    layout(view, count, options = {}) {
      if (!count) return Promise.resolve();
      const measuring = options.measure === true;
      const cols = innerWidth > innerHeight ? 6 : 3;
      const key = `${view.dataset.game}:${view.dataset.round}:${cols}`;
      if (!measuring && this.state?.key !== key) {
        this.state?.animation?.cancel();
        this.state = {
          key,
          count: 0,
          scale: 1,
          world: null,
          animation: null,
          promise: Promise.resolve(),
        };
      }
      const state = this.state?.key === key ? this.state : null;
      const n = Math.max(count, state?.count || 0),
        usedCols = Math.min(cols, n),
        rows = Math.ceil(n / cols);
      const worldW = (usedCols - 1) * STEP_X + CARD_W + DX,
        worldH = (rows - 1) * STEP_Y + CARD_H + DY;
      const fit = Math.min(
        1,
        (view.clientWidth - PAD * 2) / worldW,
        (view.clientHeight - PAD * 2) / worldH,
      );
      const scale = Math.max(0.1, Math.min(state?.scale ?? 1, fit));
      let world = view.querySelector(":scope > .table-world");
      if (!world) {
        world = document.createElement("div");
        world.className = "table-world";
        while (view.firstChild) {
          const child = view.firstChild;
          if (child.classList?.contains("card-pair")) world.append(child);
          else child.remove();
        }
        view.append(world);
      }
      if (!measuring) {
        view.style.position = "relative";
        view.style.display = "block";
      }
      Object.assign(world.style, {
        position: "absolute",
        left: PAD + "px",
        top: PAD + "px",
        width: worldW + "px",
        height: worldH + "px",
        transformOrigin: "0 0",
        transform: `scale(${scale})`,
      });
      world.style.setProperty(
        "--camera-rank-size",
        Math.max(22, 14 / scale) + "px",
      );
      world.style.setProperty(
        "--camera-rank-width",
        Math.max(27, 22 / scale) + "px",
      );
      [...world.children].forEach((pair, i) => {
        Object.assign(pair.style, {
          position: "absolute",
          boxSizing: "border-box",
          padding: "0",
          minWidth: "0",
          minHeight: "0",
          maxWidth: "none",
          maxHeight: "none",
          width: CARD_W + DX + "px",
          height: CARD_H + DY + "px",
          left: (i % cols) * STEP_X + "px",
          top: Math.floor(i / cols) * STEP_Y + "px",
        });
        [...pair.querySelectorAll(".playing-card")].forEach((card, j) =>
          Object.assign(card.style, {
            position: j ? "absolute" : "relative",
            left: j ? DX + "px" : "0px",
            top: j ? DY + "px" : "0px",
            width: CARD_W + "px",
            height: CARD_H + "px",
            minWidth: "0",
            maxWidth: "none",
            maxHeight: "none",
            transform: "none",
          }),
        );
      });
      view.dataset.cameraScale = String(scale);
      if (measuring || !state) return Promise.resolve();
      const previous = state.scale;
      let from = previous;
      if (state.animation) {
        const progress =
          state.animation.effect.getComputedTiming().progress ?? 1;
        from = state.from + (state.scale - state.from) * progress;
      }
      const sameWorld = state.world === world;
      const firstLayout = !state.world;
      state.count = n;
      if (scale === previous && sameWorld) return state.promise;
      state.animation?.cancel();
      state.count = n;
      state.scale = scale;
      state.world = world;
      const duration =
        firstLayout || this.settings().reduced || document.hidden
          ? 0
          : this.settings().fast
            ? 350
            : 700;
      if (Math.abs(from - scale) < 0.00001 || !duration) {
        state.animation = null;
        state.promise = Promise.resolve();
        return state.promise;
      }
      state.from = from;
      const animation = world.animate(
        [{ transform: `scale(${from})` }, { transform: `scale(${scale})` }],
        { duration, easing: "cubic-bezier(.25,.1,.25,1)", fill: "none" },
      );
      state.animation = animation;
      state.promise = animation.finished
        .catch(() => {})
        .then(() => {
          if (state.animation === animation) state.animation = null;
        });
      return state.promise;
    }
  }
  root.VahtaTableCamera = VahtaTableCamera;
})(globalThis);
