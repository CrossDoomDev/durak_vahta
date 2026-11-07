/* Presentation-only flight queue. Never modifies the rule model. */
(function (root) {
  class VahtaMotion {
    constructor({ card, back, settings }) {
      this.card = card;
      this.back = back;
      this.settings = settings;
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
      return document.querySelector(
        i === 0
          ? ".human-caption .avatar"
          : `.opponent[data-seat="${i}"] .avatar`,
      );
    }
    status(text) {
      const el = document.querySelector(".turn-label strong");
      if (el) el.textContent = text;
      this.message.textContent = text;
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
    tableHTML(table) {
      return table
        .map(
          (p) =>
            `<div class="card-pair">${this.card(p.attack, { classes: p.defense == null ? "uncovered" : "covered" })}${p.defense != null ? this.card(p.defense, { classes: "defense-card" }) : '<span class="pair-slot">Защита</span>'}</div>`,
        )
        .join("");
    }
    async play(before, after, a) {
      const pairs = document.querySelector(".pairs");
      if (!pairs) return;
      const actor = before.actor,
        who = before.players[actor].name;
      this.message = document.createElement("div");
      this.message.className = "motion-announcement";
      this.message.setAttribute("role", "status");
      document.body.append(this.message);
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
          const targetEl = measuring.querySelector(
              `.playing-card[data-card="${a.card}"]`,
            ),
            to = this.rect(targetEl);
          const rotation = a.type === "defend" ? 6 : 0;
          measuring.remove();
          this.status(
            `${who} ${a.type === "defend" ? "отбивается" : a.type === "transfer" ? "переводит" : "ходит"} — ${VahtaEngine.label(a.card)}`,
          );
          if (source) source.style.visibility = "hidden";
          await this.fly(this.card(a.card), from, to, { rotation });
          pairs.innerHTML = this.tableHTML(visual);
          await this.wait(250);
        } else {
          this.status(
            a.type === "take"
              ? `${who} берёт. Остальные ещё могут подкинуть.`
              : `${who} завершает подкидывание`,
          );
          await this.wait(450);
        }
        const resolved = visual.length > 0 && after.table.length === 0;
        if (resolved) {
          const taking = before.taking || a.type === "take",
            defender = before.defender;
          this.status(
            taking
              ? `${before.players[defender].name} забирает ${visual.flatMap((p) => (p.defense == null ? [p.attack] : [p.attack, p.defense])).length} карт`
              : "Бито — карты уходят в отбой",
          );
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
          this.status("Добор карт — атакующие по очереди, защитник последним");
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
        this.message.remove();
      }
    }
  }
  root.VahtaMotion = VahtaMotion;
})(globalThis);
