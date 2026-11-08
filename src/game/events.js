(function (root, factory) {
  const E =
    typeof module === "object" ? require("./engine.js") : root.VahtaEngine;
  const api = factory(E);
  if (typeof module === "object") module.exports = api;
  else root.VahtaEvents = api;
})(globalThis, function (E) {
  "use strict";
  const kinds = [
    "skip",
    "draw2",
    "give",
    "all",
    "give",
    "birthday",
    "discard",
    "draw",
    "all",
    "smallest",
    "swap",
    "swap_selected",
    "circle",
    "left",
    "birthday",
    "draw",
    "skip_target",
    "discard",
    "right",
    "none",
    "all",
    "give",
    "salary",
    "choice_kettle",
    "choice_yeti",
    "choice_excavator",
    "choice_complaint",
    "skip",
    "swap",
    "none",
  ];
  const command = {
    skip: "skip_next_attack",
    skip_target: "skip_next_attack",
    draw: "draw_cards",
    draw2: "draw_cards",
    give: "give_card",
    all: "all_draw",
    birthday: "take_from_all",
    discard: "discard_non_trump",
    smallest: "draw_smallest",
    swap: "swap_cards",
    swap_selected: "swap_cards",
    circle: "pass_clockwise_one",
    left: "give_card",
    right: "swap_cards",
    salary: "receive_random",
    choice_kettle: "choice",
    choice_yeti: "choice",
    choice_excavator: "choice",
    choice_complaint: "choice",
    none: "no_effect",
  };
  let content = [];
  function setContent(c) {
    content = c;
  }
  function spec(s) {
    if (s.phase !== "event" || !s.event) return null;
    const recipient = s.event.recipient,
      id = s.event.id,
      kind = kinds[id],
      self = s.players[recipient],
      targets = E.active(s).filter((i) => i !== recipient);
    let eligible = self.hand.slice(),
      needCard = [
        "give",
        "discard",
        "swap_selected",
        "left",
        "choice_excavator",
        "choice_complaint",
      ].includes(kind);
    if (kind === "discard")
      eligible = eligible.filter((c) => E.card(c).suit !== s.trump);
    const needTarget = [
      "give",
      "swap",
      "swap_selected",
      "skip_target",
      "choice_yeti",
      "choice_excavator",
      "choice_complaint",
    ].includes(kind);
    const choices =
      kind === "choice_kettle"
        ? [
            ["draw", "Взять 1 карту"],
            ["skip", "Пропустить следующую атаку"],
          ]
        : kind === "choice_yeti"
          ? [
              ["swap", "Обменяться случайными картами"],
              ["none", "Не вмешиваться"],
            ]
          : kind === "choice_excavator"
            ? [
                ["draw2", "Взять до 2 карт"],
                ["give", "Отдать 1 карту"],
              ]
            : kind === "choice_complaint"
              ? [
                  ["give", "Отдать 1 карту"],
                  ["draw2", "Взять до 2 карт"],
                ]
              : [];
    return {
      id,
      kind,
      recipient,
      targets,
      eligible,
      needCard,
      needTarget,
      choices,
      cancelled: self.out,
      content: content[id],
    };
  }
  function eventAction(s, a = {}) {
    const v = spec(s);
    if (!v) return { ok: false, error: "Сейчас нет происшествия" };
    let kind = v.kind;
    if (v.choices.length) {
      if (!v.choices.some((c) => c[0] === a.choice))
        return { ok: false, error: "Выберите вариант распоряжения" };
      kind = a.choice;
    }
    const needCard = ["give", "discard", "swap_selected", "left"].includes(
        kind,
      ),
      needTarget = ["give", "swap", "swap_selected", "skip_target"].includes(
        kind,
      );
    const canTarget = v.targets.length > 0;
    const available =
      kind === "discard"
        ? s.players[v.recipient].hand.filter((c) => E.card(c).suit !== s.trump)
        : s.players[v.recipient].hand;
    if (
      !v.cancelled &&
      needCard &&
      available.length &&
      !available.includes(a.card)
    )
      return { ok: false, error: "Выберите свою подходящую карту" };
    if (
      !v.cancelled &&
      needTarget &&
      canTarget &&
      !v.targets.includes(a.target)
    )
      return { ok: false, error: "Выберите активного соперника" };
    const effects = [], outBefore = s.players.map(p=>p.out);
    const before = s.players.map((p) => p.hand.length),
      who = v.recipient,
      hand = s.players[who].hand;
    const pick = (i) =>
      s.players[i].hand.length
        ? s.players[i].hand[Math.floor(E.random(s) * s.players[i].hand.length)]
        : null;
    const move = (from, to, c) => {
      if (c == null || from === to || s.players[from].out || s.players[to].out)
        return;
      E.remove(s, from, c);
      s.players[to].hand.push(c);
      effects.push({type:"card",card:c,from,to});
    };
    const swap = (i, j, c) => {
      if (j == null || s.players[j].out || s.players[i].out) return;
      const d = pick(j);
      if (c == null || d == null) return;
      E.remove(s, i, c);
      E.remove(s, j, d);
      s.players[i].hand.push(d);
      s.players[j].hand.push(c);
      effects.push({type:"card",card:c,from:i,to:j},{type:"card",card:d,from:j,to:i});
    };
    const draw = (i, n) => {
      let got = 0;
      while (got < n) {
        let at = s.deck.findIndex(E.ordinary);
        if (at < 0) break;
        const c=s.deck.splice(at, 1)[0];
        s.players[i].hand.push(c);
        effects.push({type:"card",card:c,from:"stock",to:i});
        got++;
      }
      if (!got)
        E.log(s, "Карты закончились, распоряжение начальства недействительно");
    };
    if (!v.cancelled) {
      switch (kind) {
        case "skip":
          s.players[who].skip = 1;
          effects.push({type:"skip",seat:who});
          break;
        case "skip_target":
          if (canTarget) {s.players[a.target].skip = 1;effects.push({type:"skip",seat:a.target});}
          break;
        case "draw":
          draw(who, 1);
          break;
        case "draw2":
          draw(who, 2);
          break;
        case "give":
          if (canTarget && hand.length) move(who, a.target, a.card);
          break;
        case "discard":
          if (available.length) {
            E.remove(s, who, a.card);
            s.effectDiscard.push(a.card);
            effects.push({type:"card",card:a.card,from:who,to:"effectDiscard"});
          }
          break;
        case "all":
          for (const i of E.order(s, who)) draw(i, 1);
          break;
        case "birthday":
          for (const i of v.targets) move(i, who, pick(i));
          break;
        case "salary":
          if (canTarget) {
            const from = v.targets[Math.floor(E.random(s) * v.targets.length)];
            move(from, who, pick(from));
          }
          break;
        case "smallest": {
          const live = E.active(s),
            min = Math.min(...live.map((i) => s.players[i].hand.length)),
            t = live.filter((i) => s.players[i].hand.length === min);
          if (t.length) draw(t[Math.floor(E.random(s) * t.length)], 2);
          break;
        }
        case "left":
          if (canTarget && hand.length) move(who, E.next(s, who), a.card);
          break;
        case "right": {
          const q = E.order(s, who);
          if (canTarget) swap(who, q.at(-1), pick(who));
          break;
        }
        case "swap":
          if (canTarget) swap(who, a.target, pick(who));
          break;
        case "swap_selected":
          if (canTarget) swap(who, a.target, a.card);
          break;
        case "circle": {
          const ids = E.active(s),
            cards = ids.map((i) => pick(i));
          cards.forEach((c, k) => {
            if (c != null) E.remove(s, ids[k], c);
          });
          cards.forEach((c, k) => {
            if (c != null) {
              const to=ids[(k+1)%ids.length];
              s.players[to].hand.push(c);
              effects.push({type:"card",card:c,from:ids[k],to});
            }
          });
          break;
        }
        case "none":
          break;
        default:
          throw Error("Незарегистрированный эффект");
      }
    }
    if(!effects.length) effects.push({type:"noop",seat:who,reason:v.cancelled?"cancelled":(["draw","draw2","all","smallest"].includes(kind)?"empty-stock":kind==="none"?"none":"unavailable")});
    s.sequence++;
    s.metrics.events.push({
      id: v.id,
      recipient: who,
      cancelled: v.cancelled,
      delta: s.players[who].hand.length - before[who],
    });
    s.eventDiscard.push(v.id);
    s.lastEvent = v.id;
    E.log(
      s,
      (content[v.id]?.title || "Происшествие") +
        (v.cancelled
          ? " — отменено: участник уже вышел"
          : ": " +
            s.players
              .map(
                (p, i) =>
                  p.name +
                  " " +
                  (p.hand.length - before[i] >= 0 ? "+" : "") +
                  (p.hand.length - before[i]),
              )
              .join(", ")),
    );
    s.event = null;
    E.retire(s);
    if (E.active(s).length <= 1 && E.beginEvent(s)) {
    } else if (!E.endIf(s)) E.newRound(s, s.nextCandidate);
    E.invariant(s);
    s.players.forEach((p,i)=>{if(p.out&&!outBefore[i])effects.push({type:"out",seat:i});});
    return { ok: true, effects, event: {id:v.id,recipient:who,kind,cancelled:v.cancelled} };
  }
  function botEvent(s) {
    const v = spec(s);
    let choice = v.choices[0]?.[0];
    if (v.kind === "choice_yeti") choice = "none";
    if (v.kind === "choice_excavator" || v.kind === "choice_complaint")
      choice = v.eligible.length && v.targets.length ? "give" : "draw2";
    if (v.kind === "choice_kettle")
      choice = E.stockCount(s) > 0 ? "skip" : "draw";
    const target = v.targets
      .slice()
      .sort((a, b) => s.players[a].hand.length - s.players[b].hand.length)[0];
    const c = v.eligible
      .slice()
      .sort((a, b) => E.card(b).rank - E.card(a).rank)[0];
    return { choice, target, card: c };
  }
  return { kinds, command, setContent, spec, eventAction, botEvent };
});
