/* Presentation-only flight queue. Never modifies the rule model. */
(function (root) {
  class VahtaMotion {
    constructor({ card, back, settings, layout }) {
      this.card = card;
      this.back = back;
      this.settings = settings;
      this.layout = layout;
      this.running = new Set();
    }
    duration(ms) {
      const s = this.settings();
      return s.reduced ? 0 : s.fast ? Math.round(ms * 0.3) : ms;
    }
    rect(el) {
      return el?.getBoundingClientRect();
    }
    seat(i) {
      if (i !== 0)
        return document.querySelector(`.opponent[data-seat="${i}"] .avatar`);
      const avatar = document.querySelector(".human-caption .avatar");
      return avatar?.getBoundingClientRect().width
        ? avatar
        : document.querySelector(".hand") ||
            document.querySelector(".human-caption");
    }

    async wait(ms) {
      if (document.hidden) return;
      await new Promise((r) => setTimeout(r, this.duration(ms)));
    }
    finish() {
      for (const a of this.running)
        try {
          a.finish();
        } catch {
          a.cancel();
        }
    }
    async fly(
      markup,
      from,
      to,
      { delay = 0, rotation = 0, exit = false, phase = "play" } = {},
    ) {
      if (!from || !to) return;
      const wrap = document.createElement("div");
      wrap.innerHTML = markup;
      const el = wrap.firstElementChild;
      el.classList.add("flight-card");
      el.dataset.flight = phase;
      el.setAttribute("aria-hidden", "true");
      const w = exit ? (phase === "draw" ? 54 : from.width) : to.width || 70,
        h = exit ? (phase === "draw" ? 78 : from.height) : to.height || 100;
      Object.assign(el.style, {
        position: "fixed",
        left: "0px",
        top: "0px",
        width: w + "px",
        height: h + "px",
        minWidth: "0",
        margin: "0",
        zIndex: "300",
        pointerEvents: "none",
      });
      document.body.append(el);
      const x = from.left + (from.width - w) / 2,
        y = from.top + (from.height - h) / 2,
        tx = to.left + (to.width - w) / 2,
        ty = to.top + (to.height - h) / 2;
      const frames = [
        {
          transform: `translate(${x}px,${y}px) rotate(-9deg) scale(.85)`,
          opacity: 1,
        },
        {
          transform: `translate(${(x + tx) / 2}px,${Math.min(y, ty) - 32}px) rotate(3deg) scale(1.08)`,
          opacity: 1,
          offset: 0.5,
        },
        {
          transform: `translate(${tx}px,${ty}px) rotate(${rotation}deg) scale(${exit ? 0.42 : 1})`,
          opacity: exit ? 0.2 : 1,
        },
      ];
      const duration = document.hidden
        ? 0
        : this.duration(phase === "draw" ? 550 : 950);
      const anim = el.animate(frames, {
        duration,
        delay: document.hidden ? 0 : this.duration(delay),
        easing: "cubic-bezier(.22,.65,.25,1)",
        fill: "both",
      });
      this.running.add(anim);
      try {
        await anim.finished;
      } catch {
      } finally {
        this.running.delete(anim);
        el.remove();
      }
    }
    // Replay the engine's exact operations against a presentation snapshot only.
    async playEvent(before, after, result, paint) {
      const visual = structuredClone(before);
      const labels = [];
      const mark = (seat, text, role) => {
        const anchor = typeof seat === "number" ? this.seat(seat) :
          document.querySelector(seat === "stock" ? ".stock-pile" : ".discard-target");
        if (!anchor) return;
        anchor.classList.add("event-" + role);
        const label = document.createElement("div");
        label.className = "event-seat-label " + role;
        label.textContent = text;
        document.body.append(label);
        const r = anchor.getBoundingClientRect();
        label.style.left = Math.max(6, Math.min(innerWidth - label.offsetWidth - 6,
          r.left + (r.width - label.offsetWidth) / 2)) + "px";
        label.style.top = Math.max(6, Math.min(innerHeight - label.offsetHeight - 6,
          (typeof seat === "number" && seat !== 0 ? r.bottom - 5 : r.top - label.offsetHeight - 5))) + "px";
        labels.push([anchor, role, label]);
      };
      const clear = () => {
        for (const [anchor, role, label] of labels.splice(0)) {
          anchor.classList.remove("event-" + role);
          label.remove();
        }
      };
      const endpoint = (seat) => this.rect(typeof seat === "number" ? this.seat(seat) :
        document.querySelector(seat === "stock" ? ".stock-pile" : ".discard-target"));
      const title = document.querySelector(".turn-label strong");
      if (title) title.textContent = "Происшествие: " + (result.title || "распоряжение вахты");
      const hint = document.querySelector(".turn-label small");
      if (hint) hint.textContent = "Следи за картами — распоряжение исполняется";
      try {
        for (const effect of result.effects) {
          clear();
          if (effect.type === "card") {
            const { card: c, from, to } = effect;
            const source = from === 0 ? document.querySelector(`.hand [data-card="${c}"]`) : null;
            const start = this.rect(source) || endpoint(from);
            if (from === "stock") visual.deck.splice(visual.deck.indexOf(c), 1);
            else visual.players[from].hand.splice(visual.players[from].hand.indexOf(c), 1);
            if (to === "effectDiscard") visual.effectDiscard.push(c);
            else visual.players[to].hand.push(c);
            // Prepare a hidden landing slot while counters still show the previous step.
            paint(visual, to === 0 ? c : null, false);
            const target = to === 0 ? document.querySelector(`.hand [data-card="${c}"]`) : null;
            const end = this.rect(target) || endpoint(to);
            mark(from, from === "stock" ? "Добор из колоды" : "Отдаёт", "source");
            mark(to, to === "effectDiscard" ? "Списание карты" : "Получает", "target");
            await this.wait(220);
            await this.fly(from === 0 || to === 0 || to === "effectDiscard" ? this.card(c) : this.back(),
              start, end && { ...end, left:end.left + (target ? 0 : (end.width - 64) / 2), top:end.top + (target ? 0 : (end.height - 92) / 2),
                width:target ? end.width : 64, height:target ? end.height : 92 },
              { phase: "event", exit: to === "effectDiscard" });
            paint(visual, null, true);
            await this.wait(300);
          } else {
            const text = effect.type === "out" ? "Вышел без карт" : effect.type === "skip" ?
              (after.players[effect.seat].skip ? "Пропуск следующей атаки" : "Атака пропущена") :
              ({cancelled:"Участник уже вышел", "empty-stock":"Колода пуста", none:"Без изменений",
                unavailable:"Нет подходящих карт или участников"}[effect.reason]);
            mark(effect.seat, text, "target");
            const anchor = this.seat(effect.seat);
            if (anchor) {
              const animation = anchor.animate([{filter:"brightness(1)"},{filter:"brightness(1.8)"},
                {filter:"brightness(1)"}], {duration:document.hidden ? 0 : this.duration(1100), iterations:1});
              this.running.add(animation);
              try { await animation.finished; } catch {} finally { this.running.delete(animation); }
            }
            await this.wait(650);
          }
        }
      } finally { clear(); }
    }
    tableHTML(table) {
      return table
        .map(
          (p) =>
            `<div class="card-pair">${this.card(p.attack, { classes: p.defense == null ? "uncovered" : "covered" })}${p.defense != null ? this.card(p.defense, { classes: "defense-card" }) : ""}</div>`,
        )
        .join("");
    }
    async play(before, after, a) {
      // Local font loading and viewport resize can otherwise move the target mid-flight.
      await document.fonts.ready;
      if (!document.hidden)
        await new Promise((resolve) => {
          const fallback = setTimeout(resolve, 80);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              clearTimeout(fallback);
              resolve();
            }),
          );
        });
      const pairs = document.querySelector(".pairs");
      if (!pairs) return;
      const actor = before.actor;
      const sourceSeat = this.seat(actor);
      sourceSeat?.closest(".opponent")?.classList.add("moving-player");
      const visual = structuredClone(before.table);
      if (a.type === "attack" || a.type === "transfer")
        visual.push({ attack: a.card, defense: null });
      if (a.type === "defend") visual[a.pair].defense = a.card;
      let source;
      try {
        if (a.card != null) {
          source =
            actor === 0
              ? document.querySelector(
                  `.hand .playing-card[data-card="${a.card}"]`,
                )
              : null;
          await this.layout?.(pairs, visual.length);
          const from = this.rect(source || sourceSeat);
          const measuring = pairs.cloneNode(false),
            bounds = pairs.getBoundingClientRect();
          Object.assign(measuring.style, {
            position: "fixed",
            left: bounds.left + "px",
            top: bounds.top + "px",
            width: bounds.width + "px",
            height: bounds.height + "px",
            visibility: "hidden",
            pointerEvents: "none",
            zIndex: "-1",
          });
          measuring.innerHTML = this.tableHTML(visual);
          document.body.append(measuring);
          this.layout?.(measuring, visual.length, { measure: true });
          const targetEl = measuring.querySelector(
              `.playing-card[data-card="${a.card}"]`,
            ),
            to = this.rect(targetEl);
          const rotation = 0;
          measuring.remove();
          if (source) source.style.visibility = "hidden";
          await this.fly(this.card(a.card), from, to, { rotation });
          pairs.innerHTML = this.tableHTML(visual);
          this.layout?.(pairs, visual.length);
          await this.wait(250);
        } else {
          await this.wait(450);
        }
        const resolved = visual.length > 0 && after.table.length === 0;
        if (resolved) {
          const taking = before.taking || a.type === "take",
            defender = before.defender;
          await this.wait(500);
          const target = this.rect(
            taking
              ? this.seat(defender)
              : document.querySelector(".discard-target"),
          );
          const all = [...pairs.querySelectorAll(".playing-card")];
          const flights = all.map((el, i) => {
            const from = this.rect(el);
            el.style.visibility = "hidden";
            return this.fly(
              el.outerHTML.replace("visibility: hidden;", ""),
              from,
              target,
              { delay: i * 65, exit: true, phase: taking ? "take" : "discard" },
            );
          });
          await Promise.all(flights);
          await this.wait(200);
        }
        // Show only backs during replenishment: opponents' new cards stay private.
        const drawn = before.deck
          .filter(VahtaEngine.ordinary)
          .filter((c) => !after.deck.includes(c));
        if (drawn.length) {
          const from = this.rect(
            document.querySelector(".stock-pile .back-card") ||
              document.querySelector(".stock-pile"),
          );
          await Promise.all(
            drawn.map((c, k) => {
              const target = after.players.findIndex((p) => p.hand.includes(c));
              return target < 0
                ? null
                : this.fly(this.back(), from, this.rect(this.seat(target)), {
                    delay: k * 70,
                    exit: true,
                    phase: "draw",
                  });
            }),
          );
          await this.wait(200);
        }
      } finally {
        if (source) source.style.visibility = "";
        sourceSeat?.closest(".opponent")?.classList.remove("moving-player");
      }
    }
  }
  root.VahtaMotion = VahtaMotion;
})(globalThis);
