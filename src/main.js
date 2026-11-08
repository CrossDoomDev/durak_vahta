(function () {
  "use strict";
  const E = VahtaEngine,
    F = VahtaEvents,
    S = VahtaSave,
    C = VahtaContent,
    EC = VahtaEventCards;
  F.setContent(EC);
  let loaded;
  try {
    loaded = S.load(localStorage);
  } catch {
    loaded = {
      profile: S.fresh(),
      warning: "Хранилище браузера недоступно. Используйте экспорт.",
    };
  }
  let P = loaded.profile,
    G = P.game,
    screen = P.name ? "menu" : "welcome",
    returnScreen = "menu",
    selected = null,
    eventChoice = "",
    eventTarget = null,
    eventCard = null,
    timer = null,
    paused = false,
    animating = false,
    dialog = null,
    lastDialog = -9,
    recent = [],
    emotion = {},
    lastActionAt = Date.now(),
    galleryMode = "cards",
    newAchievements = [];
  const view = {
    setup: "conditions",
    settings: "general",
    profile: "identity",
  };
  const pageIndex = {};
  let eventStep = 0,
    eventKey = "",
    profileDraft = null;
  let setup = {
    count: 4,
    npcs: [0, 1, 2],
    variant: "standard",
    chaos: true,
    frequency: "normal",
    difficulty: "medium",
  };
  const $ = (s) => document.querySelector(s),
    audio = new VahtaAudio(P.settings),
    esc = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const name = (i) => `<span data-name="${i}"></span>`,
    playerName = () => "<span data-player-name></span>";
  function sprite(sheet, index, cols, rows, classes = "", extra = "") {
    return `<span class="sprite ${classes}" style="background-image:url('public/assets/${sheet}.webp?v=${globalThis.VahtaBuild?.id || "dev"}');background-size:${cols * 100}% ${rows * 100}%;background-position:${((index % cols) / (cols - 1)) * 100}% ${(Math.floor(index / cols) / (rows - 1)) * 100}%;${extra}"></span>`;
  }
  function avatar(npc, em = 0, classes = "") {
    if (npc >= 6)
      return sprite("npc-extra", npc - 6 + 5 * em, 5, 4, "avatar " + classes);
    return npc === 5
      ? sprite("decor", 5, 4, 3, "avatar " + classes)
      : sprite("npc", Math.max(0, npc) + 5 * em, 5, 4, "avatar " + classes);
  }
  function button(text, action, classes = "", extra = "") {
    return `<button class="btn ${classes}" data-action="${action}" ${extra}>${text}</button>`;
  }
  function clean(t) {
    return P.settings.humor === "full" ? t : C.clean(t);
  }
  function persist() {
    P.game = G;
    try {
      if (!S.write(localStorage, P)) throw Error("storage");
    } catch {
      toast("Не удалось сохранить: экспортируйте прогресс в профиле.");
    }
  }
  function toast(t) {
    $("#toast").textContent = t;
    $("#toast").classList.add("visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(
      () => $("#toast").classList.remove("visible"),
      4000,
    );
  }
  function show(next) {
    clearTimeout(timer);
    screen = next;
    selected = null;
    lastActionAt = Date.now();
    render();
  }
  function heading(kicker, title, subtitle = "") {
    return `<div class="section-heading"><span class="eyebrow">${kicker}</span><h1>${title}</h1>${subtitle ? "<p>" + subtitle + "</p>" : ""}</div>`;
  }
  function header() {
    return `<header><button class="brand" data-action="menu" aria-label="В главное меню">${sprite("decor", 4, 4, 3, "brand-mark")}<span>ДУРАК <small>НА ВАХТЕ</small></span></button><div class="header-note">СЕВЕРНЫЙ УЧАСТОК · −45 °C</div><button class="profile-chip" data-action="profile">${avatar(P.avatar)}<span>${playerName()}<small>${S.rank(P.xp)}</small></span></button></header>`;
  }
  function panelPage(content) {
    return `${header()}<main class="page">${button("Назад", "back", "back")} ${content}</main>`;
  }
  function welcome() {
    return `<main class="welcome"><div class="welcome-art">${sprite("decor", 4, 4, 3, "welcome-mark")}<span class="eyebrow">ДОРОГА ЗАКОНЧИЛАСЬ. ВАХТА НАЧАЛАСЬ.</span><h1>ДУРАК<br><em>НА ВАХТЕ</em></h1><p>За окном мороз. За столом — свои.</p></div><form id="name-form" class="paper onboarding">${avatar(5)}<span class="eyebrow">ПРОПУСК В БЫТОВКУ</span><h2>Как тебя зовут, боец?</h2><label for="player-name">Имя для коллег за столом</label><input id="player-name" name="name" autocomplete="given-name" maxlength="24" placeholder="Например, Саша" required><small id="name-help">2–24 буквы, пробелы и дефисы.</small><button class="btn primary" id="name-submit" type="submit" disabled>Поехали на вахту</button><p class="fine">Работает без интернета. Всё сохраняется только на этом устройстве.</p><p class="fine">18+ · В диалогах есть мат. Его можно отключить в настройках.</p></form></main>`;
  }
  function menu() {
    return `${header()}<main class="menu"><section class="menu-copy"><span class="eyebrow">ЧЕСТНЫЕ КАРТЫ. НЕЧЕСТНО ДОЛГАЯ ВАХТА.</span><h1>ДУРАК<br><em>НА ВАХТЕ</em></h1><p>Чай налит. Колода перемешана.<br>Осталось выяснить, кто сегодня дежурный.</p><div class="menu-actions">${G && !G.finished ? button("Продолжить партию", "continue", "primary") : ""}${button("Новая партия", "setup", G && !G.finished ? "" : "primary")}<div class="menu-grid">${button("Колода", "gallery")}${button("Достижения", "achievements")}${button("Профиль", "profile")}${button("Настройки", "settings")}${button("Правила", "rules")}</div></div><div class="menu-foot"><span class="status-dot"></span>ОФЛАЙН · БЕЗ СТАВОК · ТОЛЬКО СВОИ <span class="build-version">v${esc(globalThis.VahtaBuild?.version || "dev")}</span></div></section><section class="menu-crew" aria-label="Коллеги по вахте"><div class="crew-pictures">${avatar(1, 1, "crew-side")}${avatar(0, 0, "crew-main")}${avatar(4, 0, "crew-side")}</div><blockquote id="menu-quote"></blockquote><small>ПАЛЫЧ · 30 ЛЕТ СТАЖА, НИ ДНЯ БЕЗ КАРТ</small></section></main>`;
  }
  function tabs(key, entries) {
    return `<nav class="tabs screen-tabs" aria-label="Разделы">${entries.map(([id, label]) => button(label, "view-tab", view[key] === id ? "primary" : "", `data-key="${key}" data-value="${id}" aria-pressed="${view[key] === id}"`)).join("")}</nav>`;
  }
  function slicePage(key, items, size) {
    const total = Math.max(1, Math.ceil(items.length / size));
    const page = Math.min(pageIndex[key] || 0, total - 1);
    pageIndex[key] = page;
    return {
      items: items.slice(page * size, (page + 1) * size),
      nav: `<nav class="pager" aria-label="Страницы">${button("← Назад", "page-prev", "small", `data-key="${key}" ${page === 0 ? "disabled" : ""}`)}<span aria-live="polite">${page + 1} / ${total}</span>${button("Далее →", "page-next", "small", `data-key="${key}" ${page === total - 1 ? "disabled" : ""}`)}</nav>`,
    };
  }
  const lowScreen = () => innerHeight < 500;
  function setupPage() {
    const roster = slicePage("roster", C.NPC, innerWidth >= 1000 ? 4 : 2);
    return panelPage(
      heading("НАРЯД НА ВЕЧЕР", "Новая партия") +
        tabs("setup", [
          ["conditions", "Условия"],
          ["crew", "Бригада"],
        ]) +
        (view.setup === "conditions"
          ? `<section class="paper setup-controls screen-content"><div class="form-grid"><label>Правила<select id="variant"><option value="standard">Подкидной</option><option value="transfer">Переводной</option></select></label><label>За столом<select id="count">${[2, 3, 4].map((n) => `<option value="${n}">${n} участника</option>`).join("")}</select></label><label>Боты<select id="difficulty"><option value="easy">Новичок</option><option value="medium">Бывалый</option><option value="hard">Палыч</option></select></label><label>Происшествия<select id="frequency"><option value="rare">Редко</option><option value="normal">Обычно</option><option value="mad">Беспредел</option></select></label><label class="check wide"><input type="checkbox" id="chaos">Вахтовый беспредел</label></div><p class="fine setup-note">Секретная колода: сюрпризы между раундами. Без галочки — классический дурак.</p>${button("Выбрать бригаду →", "view-tab", "", 'data-key="setup" data-value="crew"')}</section>`
          : `<section class="roster-screen screen-content"><div class="roster-top"><h2>Выбери соперников</h2>${button("Случайно", "random-roster", "small")}</div><div class="npc-grid">${roster.items.map((n) => `<button class="npc-card ${setup.npcs.includes(n.id) ? "chosen" : ""}" data-action="npc" data-id="${n.id}" aria-pressed="${setup.npcs.includes(n.id)}"><span class="npc-portrait">${avatar(n.id)}</span><span class="npc-info"><strong>${n.name}</strong><small>${n.job}</small><p>${n.style}</p><b>${setup.npcs.includes(n.id) ? "✓ В бригаде" : "Выбрать"}</b></span></button>`).join("")}</div>${roster.nav}</section>`) +
        `<footer class="setup-footer"><div><strong>За столом: ${setup.npcs.map((id) => esc(C.NPC.find((n) => n.id === id).name)).join(", ") || "выбери коллег"}</strong><small id="roster-help"></small></div>${button("Играть", "start", "primary")}</footer>`,
    );
  }
  function cardArt(id) {
    const { rank, suit } = E.card(id);
    if (rank === 11) return suit;
    if (rank === 12) return 4 + suit;
    if (rank === 13) return 8 + suit;
    if (rank === 14) return 12 + suit;
    return 16 + ((rank - 6) % 5);
  }
  function card(
    id,
    {
      action = "",
      extra = "",
      disabled = false,
      selected = false,
      classes = "",
    } = {},
  ) {
    const c = E.card(id),
      r = E.RANKS[c.rank - 6],
      s = E.SUITS[c.suit];
    return `<${action ? "button" : "div"} class="playing-card ${c.suit === 1 || c.suit === 2 ? "red" : "black"} ${selected ? "selected" : ""} ${classes}" ${action ? 'data-action="' + action + '"' : ""} data-card="${id}" ${extra} ${disabled ? "disabled" : ""} aria-label="${r} ${s}"><span class="corner">${r}<b>${s}</b></span>${sprite("cards", cardArt(id), 6, 4, "card-illustration")}<span class="corner lower">${r}<b>${s}</b></span></${action ? "button" : "div"}>`;
  }
  function backCard(event = false) {
    return `<div class="playing-card back-card">${event ? sprite("cards", 22, 6, 4, "card-back-art") : sprite(P.back ? "decor" : "cards", P.back ? 8 : 21, P.back ? 4 : 6, P.back ? 3 : 4, "card-back-art")}</div>`;
  }
  function role(i) {
    if (G.players[i].out) return "Вышел из партии";
    if (G.phase === "event" && G.event.recipient === i)
      return "Адресат происшествия";
    if (i === G.defender) return G.taking ? "Берёт карты" : "Отбивается";
    if (i === G.actor) return "Ходит";
    if (G.players[i].skip) return "Пропустит атаку";
    return "Ожидает";
  }
  function game() {
    if (!G) return menu();
    if (G.finished) return results();
    const moves = E.legal(G, 0),
      my = G.players[0],
      canAct = G.actor === 0 && !paused && G.phase !== "event",
      hand = my.hand
        .slice()
        .sort(
          (a, b) =>
            (E.card(a).suit === G.trump) - (E.card(b).suit === G.trump) ||
            E.card(a).suit - E.card(b).suit ||
            E.card(a).rank - E.card(b).rank,
        );
    const nameRole =
      G.actor === 0
        ? "Твой ход"
        : G.actor >= 0
          ? `Ходит ${name(G.actor)}`
          : "Раунд завершён";
    const selectedMoves = moves.filter((a) => a.card === selected);
    const pass = moves.find((a) => a.type === "pass"),
      take = moves.find((a) => a.type === "take");
    const actionButtons = selectedMoves
      .filter((a) => a.type !== "defend")
      .map((a) =>
        button(
          a.type === "transfer"
            ? "Перевести"
            : G.phase === "attacking"
              ? "Ходить"
              : "Подкинуть",
          "play-selected",
          "primary",
          `data-type="${a.type}"`,
        ),
      )
      .join("");
    return `${header()}<main class="game-scene"><div class="game-toolbar"><span class="eyebrow"><span class="mode-label">${G.options.variant === "transfer" ? "ПЕРЕВОДНОЙ" : "ПОДКИДНОЙ"} · ${G.options.chaos ? "БЕСПРЕДЕЛ" : "КЛАССИКА"}</span><span class="round-label">РАУНД ${G.round}</span></span><div>${button("Реплики", "talk", "small")}${button("Пауза", "pause", "small")}${button("Настройки", "settings", "small")}</div></div><div class="opponents">${G.players
      .slice(1)
      .map(
        (p, j) =>
          `<article data-seat="${j + 1}" class="opponent ${G.actor === j + 1 ? "active" : ""} ${p.out ? "out" : ""} ${G.defender === j + 1 ? "defending-player" : ""}">${avatar(p.npc, emotion[j + 1] || 0)}<div><strong>${name(j + 1)}</strong><small>${role(j + 1)}</small><span class="hand-count" aria-label="${role(j + 1)} · ${p.hand.length} карт">${G.defender === j + 1 ? (G.taking ? "Берёт" : "Бьётся") + " · " + p.hand.length : p.hand.length + " карт"}</span></div></article>`,
      )
      .join(
        "",
      )}</div><section class="table-zone"><aside class="stocks"><div class="stock-pile">${E.stockCount(G) > 0 ? backCard() : ""}${E.stockCount(G) > 0 ? card(G.trumpCard, { classes: "trump-show" }) : `<div class="empty-trump ${G.trump === 1 || G.trump === 2 ? "red" : "black"}" role="img" aria-label="Козырная масть ${E.SUITS[G.trump]}"><span>${E.SUITS[G.trump]}</span></div>`}</div><strong>${E.stockCount(G)} в колоде</strong><div class="discard-target" aria-label="Отбой">Отбой · ${G.discard.length}</div></aside><div class="battle"><div class="turn-label"><strong>${nameRole}<span class="defender-line">${G.defender === 0 ? (G.taking ? "Ты берёшь карты" : "Атакуют тебя") : (G.taking ? "Берёт: " : "Отбивается: ") + name(G.defender)}</span></strong><small>${paused ? "Партия на паузе" : G.phase === "defending" ? (G.actor === 0 ? "Выбери карту в руке и нажми на атакующую карту." : "Защита в процессе") : G.phase === "taking" ? "Подкидывание перед взятием" : G.phase === "adding" ? "Все атакующие могут подкинуть или завершить" : "Выбери карту и нажми «Ходить»"}</small></div><div class="pairs" data-game="${esc(G.gameId)}" data-round="${G.round}">${G.table.length ? G.table.map((pair, i) => `<div class="card-pair">${card(pair.attack, { action: G.actor === 0 && G.phase === "defending" && pair.defense == null ? "cover" : "", extra: `data-pair="${i}"`, classes: pair.defense == null ? "uncovered" : "covered" })}${pair.defense != null ? card(pair.defense, { classes: "defense-card" }) : ""}</div>`).join("") : `<div class="table-empty"><span>Стол свободен</span><small>До ${G.limit} атакующих карт за раунд</small></div>`}</div><button data-action="talk" data-speaker="${dialog?.who ?? ""}" data-addressee="${dialog?.target ?? ""}" class="speech" aria-label="Прочитать реплику целиком" ${dialog ? "" : "hidden"}>${dialog ? avatar(G.players[dialog.who]?.npc ?? 0, emotion[dialog.who] || 0) : ""}<div><strong>${dialog ? name(dialog.who) + " → " + name(dialog.target) : ""}</strong><p id="dialog-text"></p></div></button></div><aside class="table-log"><h3>Журнал смены</h3><ol id="game-log"></ol><span class="discard-count">В отбое: ${G.discard.length}<br>Списано эффектами: ${G.effectDiscard.length}</span></aside></section><section class="human-zone ${G.defender === 0 ? "defending-player" : ""}"><div class="human-caption">${avatar(P.avatar)}<div><strong>${playerName()}</strong><small>${my.hand.length} карт</small></div><div class="game-actions">${actionButtons}${take ? button("Взять", "take", "danger") : ""}${pass ? button(G.taking ? "Готово" : "Бито", "pass", "primary") : ""}${selected != null ? button("Рассмотреть", "inspect", "small") : ""}${my.out ? '<span class="finished-note">Ты вышел. Бригада доигрывает.</span>' : ""}</div></div><div class="hand" role="group" aria-label="Твои карты" style="--hand-count:${Math.max(6, hand.length)}">${hand.map((c) => card(c, { action: "select-card", selected: c === selected, classes: canAct && !moves.some((a) => a.card === c) ? "not-playable" : "" })).join("")}</div><p class="hand-help">${canAct ? (selected == null ? "Выбери карту. Подсвечены карты с разрешённым действием." : selectedMoves.some((a) => a.type === "defend") ? "Нажми на непокрытую карту на столе, которую хочешь побить." : selectedMoves.length ? "Подтверди действие кнопкой над рукой." : "Эта карта сейчас не подходит. Выбери другую.") : "Можно рассматривать свои карты, пока коллеги ходят."}</p></section></main>`;
  }
  function eventView() {
    const v = F.spec(G);
    if (!v) return "";
    const e = EC[v.id],
      self = G.players[v.recipient],
      human = v.recipient === 0 && !self.out;
    const key = `${G.round}:${G.event.id}:${G.metrics.events.length}`;
    if (eventKey !== key) {
      eventKey = key;
      eventStep = 0;
    }
    const kind = v.choices.length ? eventChoice : v.kind;
    const needsCard = ["give", "discard", "swap_selected", "left"].includes(
        kind,
      ),
      needsTarget = ["give", "swap", "swap_selected", "skip_target"].includes(
        kind,
      );
    const eligible =
      kind === "discard"
        ? self.hand.filter((c) => E.card(c).suit !== G.trump)
        : self.hand;
    const steps = [
      "story",
      ...(human && v.choices.length ? ["choice"] : []),
      ...(human && needsTarget && v.targets.length ? ["target"] : []),
      ...(human && needsCard && eligible.length ? ["card"] : []),
      ...(human ? ["confirm"] : []),
    ];
    eventStep = Math.min(eventStep, steps.length - 1);
    const step = steps[eventStep],
      last = eventStep === steps.length - 1;
    const invalid =
      (step === "choice" && !eventChoice) ||
      (step === "target" && !v.targets.includes(eventTarget)) ||
      (step === "card" && !eligible.includes(eventCard));
    const summary = `${eventChoice ? v.choices.find((c) => c[0] === eventChoice)?.[1] || "" : ""}${eventTarget != null ? " · " + G.players[eventTarget].name : ""}${eventCard != null ? " · " + E.label(eventCard) : ""}`;
    return `<div class="modal event-modal step-${step}" role="dialog" aria-modal="true" aria-labelledby="event-title"><div class="event-picture">${sprite("events", e.id, 6, 5, "event-art")}</div><section class="event-copy"><div class="event-heading"><span class="eyebrow">ПРОИСШЕСТВИЕ · ${eventStep + 1} / ${steps.length} · ${name(v.recipient)}</span><h2 id="event-title">${esc(clean(e.title))}</h2></div><div class="event-stage">${step === "story" ? `<p class="event-story">${esc(clean(e.story))}</p><div class="effect-box"><strong>Что произойдёт</strong><p>${esc(clean(e.effect))}</p></div>${self.out ? "<p>Участник уже вышел — эффект отменён.</p>" : ""}` : step === "choice" ? `<fieldset><legend>Выбери распоряжение</legend>${v.choices.map(([value, label]) => `<label class="choice"><input type="radio" name="event-choice" value="${value}" ${eventChoice === value ? "checked" : ""}>${label}</label>`).join("")}</fieldset>` : step === "target" ? `<fieldset><legend>Кому достанется?</legend><div class="target-list">${v.targets.map((i) => `<button data-action="event-target" data-id="${i}" class="target ${eventTarget === i ? "chosen" : ""}">${avatar(G.players[i].npc)}${name(i)}<small>${G.players[i].hand.length} карт</small></button>`).join("")}</div></fieldset>` : step === "card" ? `<fieldset><legend>Выбери свою карту</legend><div class="event-hand">${eligible.map((c) => card(c, { action: "event-card", selected: eventCard === c })).join("")}</div></fieldset>` : `<div class="effect-box"><strong>Распоряжение готово</strong><p>${esc(clean(e.effect))}</p></div><p class="event-summary">${esc(summary)}</p>${(needsCard && !eligible.length) || (needsTarget && !v.targets.length) ? "<p>Нет подходящей карты или соперника. Эффект отменяется.</p>" : ""}`}</div><footer class="event-actions">${eventStep > 0 ? button("← Назад", "event-prev") : ""}${last ? button(human ? "Исполнить" : "Продолжить", "event-accept", "primary") : button("Далее →", "event-next", "primary", invalid ? "disabled" : "")}</footer></section></div>`;
  }
  function results() {
    if (!G?.finished) return menu();
    const r = G.result,
      win = !r.draw && r.loser !== 0;
    return panelPage(
      `<div class="results">${sprite("cards", 23, 6, 4, "result-badge")}${heading("СМЕНА ЗАКРЫТА", r.draw ? "Ничья. Все свободны." : win ? "Вахта пережита!" : "Дежурный найден.", r.draw ? "Последние карты ушли одновременно." : win ? "Ты вышел из партии. Кипяти чай, пока коллеги разбираются." : "Завтра отыграешься. А сегодня — чайник и швабра.")}<h2>${r.draw ? "Никто не остался с картами." : "Дурак партии — " + name(r.loser)}</h2><div class="result-players">${G.players.map((p, i) => `<article>${avatar(i === 0 ? P.avatar : p.npc, i === 0 ? 0 : r.loser === i ? 2 : 1)}<strong>${name(i)}</strong><small>${p.out ? "Вышел без карт" : p.hand.length + " карт на руках"}</small></article>`).join("")}</div><p>${G.round} раундов · ${G.metrics.events.length} происшествий · +${win ? 120 : r.draw ? 60 : 35} опыта</p>${newAchievements.length ? "<p>Открыто: " + newAchievements.map((k) => S.achievements.find((a) => a[0] === k)[1]).join(", ") + "</p>" : ""}<blockquote id="result-quote"></blockquote><div class="result-actions">${button("Ещё партия", "rematch", "primary")}${button("В меню", "menu")}</div></div>`,
    );
  }
  function settings() {
    return panelPage(
      heading("БЫТОВЫЕ УСЛОВИЯ", "Настройки") +
        tabs("settings", [
          ["general", "Диалоги"],
          ["motion", "Ходы"],
          ["audio", "Звук"],
        ]) +
        `<section class="paper settings-grid screen-content">${view.settings === "general" ? `<label>Юмор<select data-setting="humor"><option value="clean">Без мата</option><option value="moderate">Умеренно</option><option value="full">Настоящая вахта · 18+</option></select></label><label>Реплики коллег<select data-setting="dialogs"><option value="off">Отключены</option><option value="rare">Редко</option><option value="normal">Обычно</option></select></label><p class="fine">Коллеги обращаются к тебе по имени из профиля.</p>` : view.settings === "motion" ? `<label class="check"><input type="checkbox" data-setting="fast">Ускорить ходы и анимации</label><label class="check"><input type="checkbox" data-setting="reduced">Уменьшить движение</label><p class="fine">Без ускорения карты летят по очереди. Можно проследить каждый ход.</p>` : `<label>Музыка<input type="range" min="0" max="1" step=".05" data-setting="music"></label><label>Звуковые эффекты<input type="range" min="0" max="1" step=".05" data-setting="sfx"></label>${button("Выключить весь звук", "mute")}`}</section>${button("Готово", "back", "primary page-done")}`,
    );
  }
  function profile() {
    const avatars = slicePage(
      "avatars",
      Array.from({ length: 11 }, (_, i) => i),
      6,
    );
    return panelPage(
      heading("ЛИЧНОЕ ДЕЛО", "Твой пропуск") +
        tabs("profile", [
          ["identity", "Профиль"],
          ["stats", "Табель"],
          ["saves", "Сохранения"],
        ]) +
        `<section class="paper profile-pane screen-content">${
          view.profile === "identity"
            ? `<div class="profile-name"><label for="profile-name">Твоё имя<input id="profile-name" maxlength="24"></label>${button("Сохранить", "save-name", "primary")}</div><p class="fine">${S.rank(P.xp)} · ${P.xp} опыта · Выбери портрет</p><div class="avatars">${avatars.items.map((n) => `<button class="avatar-choice ${P.avatar === n ? "chosen" : ""}" data-action="avatar" data-id="${n}" aria-label="Аватар ${n + 1}" aria-pressed="${P.avatar === n}">${avatar(n)}</button>`).join("")}</div>${avatars.nav}`
            : view.profile === "stats"
              ? [
                  ["Классика", P.stats.classic],
                  ["Беспредел", P.stats.chaos],
                ]
                  .map(
                    ([title, st]) =>
                      `<section class="stat-section"><h2>${title}</h2><div class="stats">${[
                        ["Партий", st.played],
                        ["Побед", st.wins],
                        ["Поражений", st.losses],
                        ["Ничьих", st.draws],
                        ["Серия", st.streak],
                        ["Лучшая", st.best],
                      ]
                        .map(
                          ([k, v]) =>
                            `<div><strong>${v}</strong><small>${k}</small></div>`,
                        )
                        .join("")}</div></section>`,
                  )
                  .join("")
              : `<p>Прогресс хранится на этом устройстве. Экспортируй файл для резервной копии.</p><div class="save-actions">${button("Экспорт JSON", "export")}${button("Импорт JSON", "import")}${button("Сбросить прогресс", "reset", "danger")}</div><input type="file" id="import-file" accept="application/json,.json" hidden><p class="fine">Импорт и сброс требуют подтверждения.</p>`
        }</section>`,
    );
  }
  function achievements() {
    const a = slicePage("achievements", S.achievements, lowScreen() ? 1 : 2);
    return panelPage(
      heading("ГОРДОСТЬ УЧАСТКА", "Достижения") +
        `<div class="achievement-grid screen-content">${a.items.map(([id, title, desc]) => `<article class="paper achievement ${P.achievements.includes(id) ? "unlocked" : ""}">${sprite("decor", [6, 7, 10, 6, 11, 7][S.achievements.findIndex((n) => n[0] === id)], 4, 3, "achievement-art")}<div><small>${P.achievements.includes(id) ? "ПОЛУЧЕНО" : "ЕЩЁ НЕ ПОЛУЧЕНО"}</small><h2>${title}</h2><p>${desc}</p></div></article>`).join("")}</div>${a.nav}`,
    );
  }
  function gallery() {
    const cards = slicePage(
      "cards",
      Array.from({ length: 36 }, (_, i) => i),
      6,
    );
    return panelPage(
      heading("ПРОВЕРЕНО ПО ВЕДОМОСТИ", "Игральная колода") +
        `<nav class="tabs">${button("Карты", "gallery-cards", galleryMode === "cards" ? "primary" : "")}${button("Рубашки", "gallery-backs", galleryMode === "backs" ? "primary" : "")}</nav>` +
        (galleryMode === "cards"
          ? `<div class="gallery-cards screen-content">${cards.items.map((c) => card(c, { action: "gallery-card" })).join("")}</div>${cards.nav}`
          : `<div class="paper back-select screen-content"><p>Другая рубашка открывается за любое достижение.</p><div class="skin-row">${[0, 1].map((i) => `<button data-action="back-skin" data-id="${i}" class="skin ${P.back === i ? "chosen" : ""}" ${i && !P.achievements.length ? "disabled" : ""}>${sprite(i ? "decor" : "cards", i ? 8 : 21, i ? 4 : 6, i ? 3 : 4, "back-preview")}<span>${i ? "Северный узор" : "Бытовка"} ${i && !P.achievements.length ? "· Закрыто" : ""}</span></button>`).join("")}</div></div>`),
    );
  }
  const rulePages = [
    [
      "Классика",
      "36 карт, от шестёрки до туза. По 6 карт каждому. Первый ход — у обладателя младшего козыря; если козырей на руках нет, начинает первый участник.",
    ],
    [
      "Классика",
      "Покрой карту более старшей той же масти или козырем. Козырь можно побить только старшим козырем. Подкидываются достоинства, уже лежащие на столе: и атакующие, и покрывающие.",
    ],
    [
      "Классика",
      "За раунд — не больше 6 атакующих карт и не больше размера руки защитника на начало раунда. Подкидывание идёт по очереди; каждый атакующий может завершить его. «Взять» не закрывает подкидывание немедленно.",
    ],
    [
      "Классика",
      "После «бито» атакует защитник. После взятия — следующий за ним активный участник. Добирает начинавший атаку, затем остальные по часовой стрелке, защитник последним. Открытый козырь — последняя карта колоды.",
    ],
    [
      "Переводной",
      "Пока ни одна карта не покрыта, положи карту того же достоинства и нажми «Перевести». Следующий участник должен иметь достаточно карт для новой атаки. Не больше 6 атакующих карт. Вдвоём перевод тоже разрешён.",
    ],
    [
      "Беспредел",
      "Отдельная колода из 30 происшествий. В обычном стоке скрыты 2, 4 или 6 жетонов, не заменяющих игральные карты. Жетон не попадает в руку. Эффект открывается после добора, не более одного между раундами. Остальные ждут очереди. Сильные происшествия выпадают реже.",
    ],
    [
      "Беспредел",
      "Точный эффект написан на карточке. Выбирай цель и карту, если нужно. Вышедшие участники не возвращаются. Пропуск атаки не отменяет обязанность защищаться. Пустой сток не создаёт карты из воздуха.",
    ],
    [
      "Управление",
      "Выбери карту нажатием, затем кнопку атаки или непокрытую карту на столе. Все кнопки доступны с клавиатуры: Tab и Enter. Кнопка «Рассмотреть» увеличивает выбранную карту. Перетаскивание не требуется.",
    ],
    [
      "Конец партии",
      "Когда сток пуст, участники без карт выходят. Последний с картами — дурак. Если последний эпизод оставил всех без карт — ничья. При выходе игрока боты честно доигрывают партию.",
    ],
    [
      "Без интернета",
      "Все изображения, звук, правила и сохранения находятся на устройстве. Для резервной копии используй экспорт в профиле. Сбрасывать прогресс можно только после подтверждения.",
    ],
  ];
  function rules() {
    const r = slicePage("rules", rulePages, 1);
    return panelPage(
      heading("БЕЗ СПОРОВ О ПРАВИЛАХ", "Как играть") +
        `<article class="paper rules screen-content"><span class="eyebrow">ПАМЯТКА ${pageIndex.rules + 1} / ${rulePages.length}</span><h2>${r.items[0][0]}</h2><p>${r.items[0][1]}</p></article>${r.nav}`,
    );
  }
  // Overlapping rows expose an opaque rank/suit strip for every card. Never scroll.
  function layoutHands() {
    document.querySelectorAll(".npc-portrait").forEach((el) => {
      const size = Math.min(el.clientWidth, el.clientHeight);
      el.firstElementChild.style.width = size + "px";
      el.firstElementChild.style.height = size + "px";
    });
    document.querySelectorAll(".hand, .event-hand").forEach((hand) => {
      const cards = [...hand.querySelectorAll(".playing-card")];
      const width = hand.clientWidth - 8;
      if (!cards.length || width < 1) return;
      const compact = innerHeight <= 600 && innerWidth > innerHeight;
      const cw = compact ? 62 : innerWidth <= 500 ? 72 : 94,
        ch = Math.round(cw * 1.44);
      const strip = 24;
      const capacity = Math.max(1, Math.floor((width - cw) / strip) + 1);
      const rows = Math.ceil(cards.length / capacity);
      const perRow = Math.ceil(cards.length / rows);
      const rowStep = compact ? 40 : 44;
      hand.style.height = ch + (rows - 1) * rowStep + 19 + "px";
      hand.style.setProperty("--fan-card-width", cw + "px");
      hand.style.setProperty("--fan-card-height", ch + "px");
      cards.forEach((card, i) => {
        const row = Math.floor(i / perRow),
          col = i % perRow,
          count = Math.min(perRow, cards.length - row * perRow);
        const step =
          count > 1 ? Math.min(cw + 7, (width - cw) / (count - 1)) : 0;
        const left = (width - (cw + step * (count - 1))) / 2 + 4;
        card.style.left = left + col * step + "px";
        card.style.top = 13 + row * rowStep + "px";
        card.style.zIndex = String(row * 40 + col + 1);
      });
    });
    layoutTable();
  }
  function layoutTable() {
    const table = $(".table-zone"),
      pairs = $(".pairs");
    if (!table || !pairs) return;
    const count = pairs.querySelectorAll(".card-pair").length;
    const hintKey = `${pairs.dataset.game}:${pairs.dataset.round}`;
    if (cameraHintState.key !== hintKey)
      cameraHintState = { key: hintKey, hidden: false };
    cameraHintState.hidden ||= innerWidth < 750 && table.clientHeight < 340;
    $(".game-scene").classList.toggle("camera-tight", cameraHintState.hidden);
    $(".game-scene").classList.toggle(
      "dense-table",
      table.clientHeight < (innerWidth < 750 ? 340 : 280) ||
        (innerWidth < 750 && count > 3 && table.clientHeight < 430),
    );
    layoutPairs(pairs, count);
  }
  let cameraHintState = { key: null, hidden: false };
  const tableCamera = new VahtaTableCamera(() => P.settings);
  function layoutPairs(pairs, count, options = {}) {
    return tableCamera.layout(pairs, count, options);
  }
  const tableResizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => layoutTable())
      : null;
  window.addEventListener("resize", () => {
    // Android keyboards resize the visual viewport: preserve the active text field and draft.
    const typing = document.activeElement?.matches(
      "#player-name, #profile-name",
    );
    if (!animating && !typing && screen !== "welcome") render();
    else layoutHands();
  });
  function fillNames() {
    document.querySelectorAll("[data-name]").forEach((el) => {
      const i = Number(el.dataset.name);
      el.textContent = G?.players[i]?.name || P.name;
    });
    document.querySelectorAll("[data-player-name]").forEach((el) => {
      el.textContent = P.name;
      el.title = P.name;
    });
  }
  function openTalk() {
    paused = true;
    clearTimeout(timer);
    audio.pause(true);
    const entries = [
      ...(dialog
        ? [
            {
              title: G.players[dialog.who]?.name || "Бригада",
              text: dialog.text,
            },
          ]
        : []),
      ...(G?.log || [])
        .slice(-10)
        .reverse()
        .map((text) => ({ title: "Журнал смены", text: clean(text) })),
    ];
    const r = slicePage(
      "talk",
      entries.length
        ? entries
        : [{ title: "Бригада", text: "Чай налит. Карты на стол!" }],
      1,
    );
    const e = r.items[0];
    $("#overlay").innerHTML =
      `<div class="modal compact-modal talk-modal" role="dialog" aria-modal="true"><h2>${esc(e.title)}</h2><p>${esc(e.text)}</p>${r.nav}${button("К игре", "unpause", "primary")}</div>`;
  }
  function render() {
    if (animating) return;
    clearTimeout(timer);
    document.body.classList.toggle("reduced", P.settings.reduced);
    document.body.classList.toggle("fast", P.settings.fast);
    document.body.dataset.screen = screen;
    const pages = {
      welcome,
      menu,
      setup: setupPage,
      game,
      results,
      settings,
      profile,
      achievements,
      gallery,
      rules,
    };
    $("#app").innerHTML = (pages[screen] || menu)();
    $("#overlay").innerHTML =
      screen === "game" && G?.phase === "event" ? eventView() : "";
    fillNames();
    if (screen === "menu")
      $("#menu-quote").textContent =
        P.settings.dialogs === "off"
          ? "Карты на столе. Все свои."
          : C.dialogue("start", 0, P.name, P.settings.humor);
    if (screen === "setup") {
      for (const k of ["count", "variant", "difficulty", "frequency"])
        if ($("#" + k)) $("#" + k).value = setup[k];
      if ($("#chaos")) $("#chaos").checked = setup.chaos;
      if ($("#frequency")) $("#frequency").disabled = !setup.chaos;
      $("#roster-help").textContent =
        `Выбрано ${setup.npcs.length}. Нужно ${setup.count - 1} соперника.`;
      document.querySelector('[data-action="start"]').disabled =
        setup.npcs.length !== setup.count - 1;
    }
    if (screen === "settings")
      document.querySelectorAll("[data-setting]").forEach((el) => {
        if (el.type === "checkbox") el.checked = P.settings[el.dataset.setting];
        else el.value = P.settings[el.dataset.setting];
      });
    if (screen === "profile" && $("#profile-name"))
      $("#profile-name").value = profileDraft ?? P.name;
    if (screen === "game" && G && !G.finished) {
      const log = $("#game-log");
      for (const text of G.log.slice(-5)) {
        const li = document.createElement("li");
        li.textContent = P.settings.humor === "full" ? text : C.clean(text);
        log.append(li);
      }
      if (dialog && $("#dialog-text"))
        $("#dialog-text").textContent = dialog.text;
      if (G.phase !== "event") scheduleBot();
    }
    if (screen === "results" && G?.finished) {
      const loser = G.result.loser;
      const speaker =
        loser > 0 ? loser : G.players.findIndex((p, i) => i > 0 && p.out);
      $("#result-quote").textContent = G.result.draw
        ? "Никто не дурак. Сейчас главное — не начать выяснять, кто был ближе."
        : C.dialogue(
            loser > 0 ? "lose" : "win",
            G.players[speaker]?.npc ?? 0,
            P.name,
            P.settings.humor,
          );
    }
    layoutHands();
    tableResizeObserver?.disconnect();
    for (const el of document.querySelectorAll(".battle, .pairs"))
      tableResizeObserver?.observe(el);
    audio.update(P.settings);
  }
  function say(kind, who, target = C.otherSeat(G, who), observer = false) {
    if (
      P.settings.dialogs === "off" ||
      who === 0 ||
      !G.players[who] ||
      !G.players[target] ||
      target === who
    )
      return;
    const cooldown =
      P.settings.dialogs === "rare"
        ? 6
        : P.settings.humor === "moderate"
          ? 5
          : 3;
    if (G.sequence - lastDialog < cooldown && kind !== "win" && kind !== "lose")
      return;
    const first = Math.floor(Math.random() * 2);
    const picked = [first, 1 - first]
      .map((v) => ({
        key: `${kind}:${G.players[who].npc}:${v}:${observer}`,
        text: C.dialogue(
          kind,
          G.players[who].npc,
          G.players[target].name,
          P.settings.humor,
          v,
          observer,
        ),
      }))
      .find((t) => !recent.includes(t.key));
    if (!picked) return;
    const text = picked.text;
    recent.push(picked.key);
    recent = recent.slice(-8);
    lastDialog = G.sequence;
    dialog = { who, target, text };
    emotion[who] = ["take_many", "event_bad"].includes(kind)
      ? 2
      : ["win", "event_good", "defend"].includes(kind)
        ? 1
        : 0;
  }
  function afterAction(who, a, before) {
    lastActionAt = Date.now();
    audio.play(
      a.type === "defend" ? "cover" : a.type === "take" ? "take" : "card",
    );
    let category =
      a.type === "defend"
        ? "defend"
        : a.type === "take"
          ? before.table.reduce(
              (n, p) => n + 1 + (p.defense != null ? 1 : 0),
              0,
            ) > 1
            ? "take_many"
            : "take_one"
          : a.type === "pass"
            ? "pass_attack"
            : "attack";
    if (a.card != null && E.card(a.card).suit === G.trump)
      category = "trump_used";
    else if (
      a.type === "defend" &&
      G.players[who].hand.some((c) => E.card(c).suit === G.trump)
    )
      category = "trump_saved";
    const target = C.actionAudience(before, G, a, who);
    say(category, who, target);
    if (G.round > 24 && G.round % 10 === 0) say("long_game", who, target);
    if (G.finished) {
      newAchievements = S.finish(P, G);
      persist();
      show("results");
      audio.play("win");
      return;
    }
    persist();
    if (G.phase === "event") {
      eventChoice = "";
      eventTarget = null;
      eventCard = null;
      G.players.forEach((p, i) => {
        if (i > 0 && !p.out) emotion[i] = 3;
      });
      audio.play("event");
    }
    selected = null;
    render();
  }
  const motion = new VahtaMotion({
    card,
    back: backCard,
    settings: () => P.settings,
    layout: layoutPairs,
  });
  function paintEvent(visual, incoming, counters) {
    const hand = $(".hand");
    if (hand) {
      hand.innerHTML = visual.players[0].hand.slice().sort((a,b) =>
        (E.card(a).suit === G.trump) - (E.card(b).suit === G.trump) ||
        E.card(a).suit - E.card(b).suit || E.card(a).rank - E.card(b).rank)
        .map(c => card(c)).join("");
      if (incoming != null) hand.querySelector(`[data-card="${incoming}"]`).style.visibility = "hidden";
      layoutHands();
    }
    if (!counters) return;
    visual.players.forEach((p,i) => {
      const el = i === 0 ? $(".human-caption small") : $(`.opponent[data-seat="${i}"] .hand-count`);
      if (el) el.textContent = p.hand.length + " карт";
    });
    const stock = $(".stocks > strong");
    if (stock) stock.textContent = E.stockCount(visual) + " в колоде";
    if (!E.stockCount(visual)) {
      const pile = $(".stock-pile");
      if (pile) pile.innerHTML = `<div class="empty-trump ${G.trump === 1 || G.trump === 2 ? "red" : "black"}" aria-label="Козырная масть"><span>${E.SUITS[G.trump]}</span></div>`;
    }
  }
  async function act(a) {
    if (paused || animating || !G || screen !== "game") return;
    const before = structuredClone(G),
      next = structuredClone(G),
      who = G.actor;
    const r = E.apply(next, who, a);
    if (!r.ok) {
      toast(r.error);
      return;
    }
    // Public provenance lets a defender answer the author of this particular attack.
    if ((a.type === "attack" || a.type === "transfer") && next.table.length)
      next.table.at(-1).playedBy = who;
    clearTimeout(timer);
    animating = true;
    document.body.dataset.animating = "true";
    $("#app").inert = true;
    // Accepted state is durable before flight. Reloading never loses/duplicates a card.
    G = next;
    persist();
    try {
      await motion.play(before, next, a);
    } catch (error) {
      console.warn("Card animation interrupted", error);
    } finally {
      animating = false;
      document.body.dataset.animating = "false";
      $("#app").inert = false;
    }
    afterAction(who, a, before);
  }
  function scheduleBot() {
    if (
      animating ||
      paused ||
      document.hidden ||
      !G ||
      G.finished ||
      G.phase === "event" ||
      G.actor === 0
    )
      return;
    timer = setTimeout(
      () => {
        if (screen === "game" && !paused && !document.hidden) {
          const a = E.bot(E.observation(G));
          if (a) act(a);
        }
      },
      P.settings.fast ? 320 : 1000,
    );
  }
  function startGame() {
    if (setup.npcs.length !== setup.count - 1) return;
    const names = [
      P.name,
      ...setup.npcs.map((i) => C.NPC.find((n) => n.id === i).name),
    ];
    G = E.start({
      ...setup,
      names,
      npcs: [P.avatar, ...setup.npcs],
      seed: Date.now() >>> 0,
    });
    dialog = null;
    emotion = {};
    lastDialog = -9;
    recent = [];
    newAchievements = [];
    eventStep = 0;
    eventKey = "";
    eventChoice = "";
    eventTarget = eventCard = null;
    paused = false;
    persist();
    show("game");
    audio.play("deal");
  }
  function confirmBox(title, text, fn) {
    clearTimeout(timer);
    const layer = $("#overlay");
    layer.innerHTML = `<div class="modal compact-modal" role="dialog" aria-modal="true"><h2>${title}</h2><p>${text}</p><div>${button("Отмена", "cancel-modal")}${button("Подтвердить", "confirm-modal", "primary")}</div></div>`;
    const confirm = layer.querySelector('[data-action="confirm-modal"]');
    confirm.onclick = (e) => {
      e.stopPropagation();
      layer.innerHTML = "";
      fn();
    };
    layer.querySelector('[data-action="cancel-modal"]').onclick = (e) => {
      e.stopPropagation();
      render();
    };
  }
  function inspect(c) {
    clearTimeout(timer);
    $("#overlay").innerHTML =
      `<div class="modal compact-modal inspect-modal" role="dialog" aria-modal="true">${card(c)}<h2>${E.label(c)}</h2><p>${["Рукавицы", "Инструмент", "Каска", "Северный лес", "Чайник", "Работник", "Специалист", "Мастер", "Символ вахты"][E.card(c).rank - 6]}</p>${button("Закрыть", "close-modal", "primary")}</div>`;
  }
  function exportSave() {
    const blob = new Blob([JSON.stringify(P, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "durak-vahta-save.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function handle(action, el) {
    if (animating) return;
    switch (action) {
      case "talk":
        pageIndex.talk = 0;
        openTalk();
        break;
      case "view-tab":
        view[el.dataset.key] = el.dataset.value;
        render();
        break;
      case "page-prev":
      case "page-next":
        pageIndex[el.dataset.key] = Math.max(
          0,
          (pageIndex[el.dataset.key] || 0) + (action === "page-next" ? 1 : -1),
        );
        if (el.dataset.key === "talk") openTalk();
        else render();
        break;
      case "menu":
        if (G && !G.finished) persist();
        paused = false;
        show("menu");
        break;
      case "setup":
        if (G && !G.finished)
          confirmBox(
            "Начать новую партию?",
            "Текущая партия будет заменена только после нажатия «Начать партию».",
            () => show("setup"),
          );
        else show("setup");
        break;
      case "continue":
        paused = false;
        show(G?.finished ? "results" : "game");
        break;
      case "start":
        startGame();
        break;
      case "rematch":
        setup = {
          ...setup,
          ...G.options,
          count: G.players.length,
          npcs: G.players.slice(1).map((p) => p.npc),
        };
        show("setup");
        break;
      case "back":
        paused = false;
        show(returnScreen === "game" && G ? "game" : "menu");
        break;
      case "profile":
      case "settings":
      case "rules":
      case "achievements":
      case "gallery":
        returnScreen = screen === "game" ? "game" : "menu";
        show(action);
        break;
      case "npc": {
        const i = Number(el.dataset.id);
        setup.npcs = setup.npcs.includes(i)
          ? setup.npcs.filter((n) => n !== i)
          : [...setup.npcs.slice(0, setup.count - 2), i];
        render();
        break;
      }
      case "random-roster": {
        const ids = C.NPC.map((n) => n.id);
        for (let i = ids.length - 1; i > 0; i--) {
          let j = Math.floor(Math.random() * (i + 1));
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        setup.npcs = ids.slice(0, setup.count - 1);
        render();
        break;
      }
      case "select-card":
        selected = Number(el.dataset.card);
        render();
        break;
      case "play-selected":
        if (G.actor === 0) act({ type: el.dataset.type, card: selected });
        break;
      case "cover":
        if (G.actor === 0)
          act({
            type: "defend",
            card: selected,
            pair: Number(el.dataset.pair),
          });
        break;
      case "take":
      case "pass":
        if (G.actor === 0) act({ type: action });
        break;
      case "pause":
        paused = true;
        clearTimeout(timer);
        audio.pause(true);
        $("#overlay").innerHTML =
          `<div class="modal compact-modal" role="dialog" aria-modal="true"><span class="eyebrow">ПЕРЕКУР БЕЗ СИГАРЕТ</span><h2>Партия на паузе</h2><p>Карты и очередь сохранены на этом устройстве.</p>${button("Продолжить", "unpause", "primary")}${button("Сохранить и в меню", "menu")}</div>`;
        persist();
        break;
      case "unpause":
        paused = false;
        audio.pause(false);
        render();
        break;
      case "inspect":
        if (selected != null) inspect(selected);
        break;
      case "close-modal":
        render();
        break;
      case "event-next":
        eventStep++;
        render();
        break;
      case "event-prev":
        eventStep = Math.max(0, eventStep - 1);
        render();
        break;
      case "event-target":
        eventTarget = Number(el.dataset.id);
        render();
        break;
      case "event-card":
        eventCard = Number(el.dataset.card);
        render();
        break;
      case "event-accept": {
        const v = F.spec(G),
          who = v.recipient;
        const skipBefore = G.players[who].skip;
        const eventAction =
          who === 0 && !v.cancelled
            ? { choice: eventChoice, target: eventTarget, card: eventCard }
            : F.botEvent(G);
        const resolvedKind = v.choices.length ? eventAction.choice : v.kind;
        const before = structuredClone(G), next = structuredClone(G);
        const r = F.eventAction(next, eventAction);
        if (!r.ok) {
          toast(r.error);
          return;
        }
        clearTimeout(timer);
        animating = true;
        document.body.dataset.animating = "true";
        $("#app").inert = true;
        G = next;
        if (G.finished) newAchievements = S.finish(P, G);
        persist();
        $("#overlay").innerHTML = "";
        try {
          await motion.playEvent(before, next, { ...r, title: v.content?.title }, paintEvent);
        } catch (error) {
          console.warn("Event animation interrupted", error);
        } finally {
          animating = false;
          document.body.dataset.animating = "false";
          $("#app").inert = false;
        }
        const record = G.metrics.events.at(-1);
        const category =
          record.delta > 0 ||
          resolvedKind === "skip" ||
          G.players[who].skip > skipBefore
            ? "event_bad"
            : record.delta < 0
              ? "event_good"
              : "event_neutral";
        const speaker =
          who === 0 ? G.players.findIndex((p, i) => i > 0 && !p.out) : who;
        if (speaker > 0 && !record.cancelled)
          say(
            category,
            speaker,
            who === 0 ? 0 : C.otherSeat(G, who),
            who === 0,
          );
        if (G.finished) {
          persist();
          show("results");
        } else {
          eventChoice = "";
          eventTarget = null;
          eventCard = null;
          persist();
          render();
        }
        audio.play("event");
        break;
      }
      case "save-name": {
        const value = $("#profile-name").value.trim();
        if (!E.validName(value)) {
          toast("Имя: 2–24 буквы, пробелы и дефисы.");
          return;
        }
        P.name = value;
        profileDraft = null;
        dialog = null;
        if (G) G.players[0].name = value;
        persist();
        render();
        toast("Имя сохранено.");
        break;
      }
      case "avatar":
        P.avatar = Number(el.dataset.id);
        persist();
        render();
        break;
      case "mute":
        P.settings.music = P.settings.sfx = 0;
        persist();
        render();
        break;
      case "export":
        persist();
        exportSave();
        break;
      case "import":
        $("#import-file").click();
        break;
      case "reset":
        confirmBox(
          "Сбросить весь прогресс?",
          "Имя, достижения, статистика и текущая партия будут удалены. Сначала можно сделать экспорт.",
          () => {
            P = S.fresh();
            profileDraft = null;
            G = null;
            persist();
            show("welcome");
          },
        );
        break;
      case "gallery-cards":
      case "gallery-backs":
        galleryMode = action.slice(8);
        render();
        break;
      case "gallery-card":
        inspect(Number(el.dataset.card));
        break;
      case "back-skin": {
        const n = Number(el.dataset.id);
        if (n === 1 && !P.achievements.length) return;
        P.back = n;
        persist();
        render();
        break;
      }
    }
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    audio.unlock();
    audio.play("button");
    handle(el.dataset.action, el);
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "name-form") return;
    e.preventDefault();
    const value = $("#player-name").value.trim();
    if (!E.validName(value)) return;
    P.name = value;
    audio.unlock();
    persist();
    show("menu");
  });
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.id === "profile-name") profileDraft = el.value;
    if (el.id === "player-name") {
      $("#name-submit").disabled = !E.validName(el.value);
      return;
    }
    if (el.dataset.setting) {
      P.settings[el.dataset.setting] =
        el.type === "checkbox"
          ? el.checked
          : el.type === "range"
            ? Number(el.value)
            : el.value;
      persist();
      audio.update(P.settings);
      if (!["range"].includes(el.type)) render();
    }
  });
  document.addEventListener("change", async (e) => {
    const el = e.target;
    if (
      screen === "setup" &&
      ["count", "variant", "difficulty", "chaos", "frequency"].includes(el.id)
    ) {
      setup[el.id] =
        el.id === "count"
          ? Number(el.value)
          : el.id === "chaos"
            ? el.checked
            : el.value;
      if (el.id === "count") setup.npcs = setup.npcs.slice(0, setup.count - 1);
      render();
    }
    if (el.name === "event-choice") {
      eventChoice = el.value;
      render();
    }
    if (el.id === "import-file" && el.files[0]) {
      try {
        if (el.files[0].size > 2e6) throw Error("Файл слишком большой");
        const imported = S.validate(JSON.parse(await el.files[0].text()));
        confirmBox(
          "Заменить сохранение?",
          "Текущий прогресс заменится данными выбранного файла.",
          () => {
            P = imported;
            profileDraft = null;
            G = P.game;
            persist();
            show(P.name ? "menu" : "welcome");
            toast("Сохранение импортировано.");
          },
        );
      } catch (err) {
        toast("Импорт отклонён: " + err.message);
      }
    }
  });
  document.addEventListener("visibilitychange", () => {
    clearTimeout(timer);
    audio.pause(document.hidden || paused);
    if (document.hidden) {
      tableCamera.finish();
      motion.finish();
      persist();
    } else if (screen === "game") scheduleBot();
  });
  window.addEventListener("pagehide", persist);
  window.addEventListener("blur", () => {
    clearTimeout(timer);
    audio.pause(true);
  });
  window.addEventListener("focus", () => {
    audio.pause(paused || document.hidden);
    if (screen === "game") scheduleBot();
  });
  setInterval(() => {
    if (
      screen === "game" &&
      !paused &&
      !animating &&
      !document.hidden &&
      G?.actor === 0 &&
      Date.now() - lastActionAt > 25000
    ) {
      const speaker = G.players.findIndex((p, i) => i > 0 && !p.out);
      if (speaker > 0) say("idle", speaker, 0);
      lastActionAt = Date.now();
      render();
    }
  }, 5000);
  const overlayObserver = new MutationObserver(() => {
    const open = $("#overlay").childElementCount > 0;
    $("#app").inert = open || animating;
  });
  overlayObserver.observe($("#overlay"), { childList: true });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !$("#overlay").childElementCount) return;
    const list = [
      ...$("#overlay").querySelectorAll("button:not(:disabled),input,select"),
    ];
    if (!list.length) return;
    const first = list[0],
      last = list.at(-1);
    if (!$("#overlay").contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  Promise.all(
    ["room", "npc", "npc-extra", "cards", "events", "decor"].map(
      (name) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src =
            "public/assets/" +
            name +
            ".webp?v=" +
            (globalThis.VahtaBuild?.id || "dev");
        }),
    ),
  ).then((results) => {
    if (results.some((x) => !x))
      toast(
        "Не загружена часть графики. Проверьте, что папка public/assets распакована рядом с index.html.",
      );
  });
  if (G?.finished) {
    S.finish(P, G);
    persist();
  }
  render();
  document.fonts.ready.then(layoutHands);
  if (loaded.warning) toast(loaded.warning);
})();
