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
    dialog = null,
    lastDialog = -9,
    recent = [],
    emotion = {},
    lastActionAt = Date.now(),
    galleryMode = "cards",
    newAchievements = [];
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
    return `<span class="sprite ${classes}" style="background-image:url('public/assets/${sheet}.webp');background-size:${cols * 100}% ${rows * 100}%;background-position:${((index % cols) / (cols - 1)) * 100}% ${(Math.floor(index / cols) / (rows - 1)) * 100}%;${extra}"></span>`;
  }
  function avatar(npc, em = 0, classes = "") {
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
    return `${header()}<main class="menu"><section class="menu-copy"><span class="eyebrow">ЧЕСТНЫЕ КАРТЫ. НЕЧЕСТНО ДОЛГАЯ ВАХТА.</span><h1>ДУРАК<br><em>НА ВАХТЕ</em></h1><p>Чай налит. Колода перемешана.<br>Осталось выяснить, кто сегодня дежурный.</p><div class="menu-actions">${G && !G.finished ? button("Продолжить партию", "continue", "primary") : ""}${button("Новая партия", "setup", G && !G.finished ? "" : "primary")}<div class="menu-grid">${button("Колода", "gallery")}${button("Достижения", "achievements")}${button("Профиль", "profile")}${button("Настройки", "settings")}${button("Правила", "rules")}</div></div><div class="menu-foot"><span class="status-dot"></span>ОФЛАЙН · БЕЗ СТАВОК · ТОЛЬКО СВОИ</div></section><section class="menu-crew" aria-label="Коллеги по вахте"><div class="crew-pictures">${avatar(1, 1, "crew-side")}${avatar(0, 0, "crew-main")}${avatar(4, 0, "crew-side")}</div><blockquote id="menu-quote"></blockquote><small>ПАЛЫЧ · 30 ЛЕТ СТАЖА, НИ ДНЯ БЕЗ КАРТ</small></section></main>`;
  }
  function setupPage() {
    return panelPage(
      heading(
        "НАРЯД НА ВЕЧЕР",
        "С кем сядем за стол?",
        "Классические правила — отдельно. Производственный хаос — по желанию.",
      ) +
        `<div class="setup-layout"><section class="paper setup-controls"><h2>Условия смены</h2><label>Правила<select id="variant"><option value="standard">Подкидной</option><option value="transfer">Переводной</option></select></label><label>За столом<select id="count">${[2, 3, 4].map((n) => `<option value="${n}">${n} участника</option>`).join("")}</select></label><label>Сложность ботов<select id="difficulty"><option value="easy">Новичок</option><option value="medium">Бывалый</option><option value="hard">Палыч</option></select></label><label class="check"><input type="checkbox" id="chaos">Вахтовый беспредел</label><p class="fine">Отдельная колода из 30 происшествий. Эффекты только между раундами.</p><label>Частота происшествий<select id="frequency"><option value="rare">Редко · 2 триггера</option><option value="normal">Нормально · 4 триггера</option><option value="mad">Полный беспредел · 6 триггеров</option></select></label>${button("Начать партию", "start", "primary")}<p id="roster-help" class="fine"></p></section><section><div class="roster-top"><h2>Твоя бригада</h2>${button("Случайный состав", "random-roster", "small")}</div><div class="npc-grid">${C.NPC.map((n) => `<button class="npc-card ${setup.npcs.includes(n.id) ? "chosen" : ""}" data-action="npc" data-id="${n.id}" aria-pressed="${setup.npcs.includes(n.id)}">${avatar(n.id)}<span class="npc-info"><strong>${n.name}</strong><small>${n.job}</small><p>${n.style}</p><b>${setup.npcs.includes(n.id) ? "В бригаде" : "Выбрать"}</b></span></button>`).join("")}</div></section></div>`,
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
    return `${header()}<main class="game-scene"><div class="game-toolbar"><span class="eyebrow">${G.options.variant === "transfer" ? "ПЕРЕВОДНОЙ" : "ПОДКИДНОЙ"} · ${G.options.chaos ? "ВАХТОВЫЙ БЕСПРЕДЕЛ" : "КЛАССИКА"} · РАУНД ${G.round}</span><div>${button("Пауза", "pause", "small")}${button("Настройки", "settings", "small")}</div></div><div class="opponents">${G.players
      .slice(1)
      .map(
        (p, j) =>
          `<article class="opponent ${G.actor === j + 1 ? "active" : ""} ${p.out ? "out" : ""}">${avatar(p.npc, emotion[j + 1] || 0)}<div><strong>${name(j + 1)}</strong><small>${role(j + 1)}</small><span class="hand-count">${p.hand.length} карт</span></div></article>`,
      )
      .join(
        "",
      )}</div><section class="table-zone"><aside class="stocks"><div class="stock-pile">${E.stockCount(G) > 0 ? backCard() : ""}${E.stockCount(G) > 0 ? card(G.trumpCard, { classes: "trump-show" }) : ""}</div><strong>${E.stockCount(G)} в колоде</strong><small class="trump-label ${G.trump === 1 || G.trump === 2 ? "red" : "black"}">Козырь <b>${E.stockCount(G) > 0 ? E.label(G.trumpCard) : E.SUITS[G.trump]}</b></small>${G.options.chaos ? `<div class="event-stock" aria-label="Секретная колода происшествий">${backCard(true)}<span>СОБЫТИЯ ВАХТЫ<br>Секретная колода</span></div>` : ""}</aside><div class="battle"><div class="turn-label"><strong>${nameRole}</strong><small>${paused ? "Партия на паузе" : G.phase === "defending" ? (G.actor === 0 ? "Выбери карту в руке и нажми на атакующую карту." : "Защита в процессе") : G.phase === "taking" ? "Подкидывание перед взятием" : G.phase === "adding" ? "Все атакующие могут подкинуть или завершить" : "Выбери карту и нажми «Ходить»"}</small></div><div class="pairs">${G.table.length ? G.table.map((pair, i) => `<div class="card-pair">${card(pair.attack, { action: G.actor === 0 && G.phase === "defending" && pair.defense == null ? "cover" : "", extra: `data-pair="${i}"`, classes: pair.defense == null ? "uncovered" : "covered" })}${pair.defense != null ? card(pair.defense, { classes: "defense-card" }) : '<span class="pair-slot">Защита</span>'}</div>`).join("") : `<div class="table-empty">${sprite("decor", 4, 4, 3, "table-emblem")}<span>Стол свободен</span><small>До ${G.limit} атакующих карт за раунд</small></div>`}</div><div class="speech" ${dialog ? "" : "hidden"}>${dialog ? avatar(G.players[dialog.who]?.npc ?? 0, emotion[dialog.who] || 0) : ""}<div><strong>${dialog ? name(dialog.who) : ""}</strong><p id="dialog-text"></p></div></div></div><aside class="table-log"><h3>Журнал смены</h3><ol id="game-log"></ol><span class="discard-count">В отбое: ${G.discard.length}<br>Списано эффектами: ${G.effectDiscard.length}</span></aside></section><section class="human-zone"><div class="human-caption">${avatar(P.avatar)}<div><strong>${playerName()}</strong><small>${role(0)} · ${my.hand.length} карт</small></div><div class="game-actions">${actionButtons}${take ? button("Взять", "take", "danger") : ""}${pass ? button(G.taking ? "Завершить подкидывание" : "Бито / больше не подкидывать", "pass", "primary") : ""}${selected != null ? button("Рассмотреть", "inspect", "small") : ""}${my.out ? '<span class="finished-note">Ты вышел. Бригада доигрывает.</span>' : ""}</div></div><div class="hand" role="group" aria-label="Твои карты" style="--hand-count:${Math.max(6, hand.length)}">${hand.map((c) => card(c, { action: "select-card", selected: c === selected, classes: canAct && !moves.some((a) => a.card === c) ? "not-playable" : "" })).join("")}</div><p class="hand-help">${canAct ? (selected == null ? "Выбери карту. Подсвечены карты с разрешённым действием." : selectedMoves.some((a) => a.type === "defend") ? "Нажми на непокрытую карту на столе, которую хочешь побить." : selectedMoves.length ? "Подтверди действие кнопкой над рукой." : "Эта карта сейчас не подходит. Выбери другую.") : "Можно рассматривать свои карты, пока коллеги ходят."}</p></section></main>`;
  }
  function eventView() {
    const v = F.spec(G);
    if (!v) return "";
    const e = EC[v.id],
      self = G.players[v.recipient],
      human = v.recipient === 0 && !self.out,
      kind = v.choices.length ? eventChoice : v.kind;
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
    return `<div class="modal event-modal" role="dialog" aria-modal="true" aria-labelledby="event-title"><div class="event-picture">${sprite("events", e.id, 6, 5, "event-art")}<span class="event-seal">ПРОИЗВОДСТВЕННАЯ НЕОБХОДИМОСТЬ</span></div><section class="event-copy"><span class="eyebrow">СОБЫТИЕ ${String(e.id + 1).padStart(2, "0")} / 30 · АДРЕСАТ ${name(v.recipient)}</span><h2 id="event-title">${esc(clean(e.title))}</h2><p class="event-story">${esc(clean(e.story))}</p><div class="effect-box"><strong>Что произойдёт</strong><p>${esc(clean(e.effect))}</p></div>${self.out ? "<p>Отменено по производственной необходимости: участник уже вышел.</p>" : ""}${human && v.choices.length ? `<fieldset><legend>Выбери распоряжение</legend>${v.choices.map(([value, label]) => `<label class="choice"><input type="radio" name="event-choice" value="${value}" ${eventChoice === value ? "checked" : ""}>${label}</label>`).join("")}</fieldset>` : ""}${human && needsTarget && v.targets.length ? `<fieldset><legend>Кому достанется?</legend><div class="target-list">${v.targets.map((i) => `<button data-action="event-target" data-id="${i}" class="target ${eventTarget === i ? "chosen" : ""}">${avatar(G.players[i].npc)}${name(i)}<small>${G.players[i].hand.length} карт</small></button>`).join("")}</div></fieldset>` : ""}${human && needsCard && eligible.length ? `<fieldset><legend>Выбери свою карту</legend><div class="event-hand">${eligible.map((c) => card(c, { action: "event-card", selected: eventCard === c })).join("")}</div></fieldset>` : ""}${human && ((needsCard && !eligible.length) || (needsTarget && !v.targets.length)) ? "<p>Подходящих карт или соперников нет — эффект будет отменён.</p>" : ""}${button(human ? "Исполнить распоряжение" : "Продолжить", "event-accept", "primary", human && ((v.choices.length && !eventChoice) || (needsCard && eligible.length && !eligible.includes(eventCard)) || (needsTarget && v.targets.length && !v.targets.includes(eventTarget))) ? "disabled" : "")}<p class="fine">Эффект применяется один раз между раундами. Текущая защита не прерывается.</p></section></div>`;
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
        `<section class="paper settings-grid"><label>Юмор<select data-setting="humor"><option value="clean">Без мата</option><option value="moderate">Умеренно</option><option value="full">Настоящая вахта · 18+</option></select></label><label>Реплики коллег<select data-setting="dialogs"><option value="off">Отключены</option><option value="rare">Редко</option><option value="normal">Обычно</option></select></label><label>Музыка<input type="range" min="0" max="1" step=".05" data-setting="music"></label><label>Звуковые эффекты<input type="range" min="0" max="1" step=".05" data-setting="sfx"></label><label class="check"><input type="checkbox" data-setting="fast">Ускорить ходы ботов и анимации</label><label class="check"><input type="checkbox" data-setting="reduced">Уменьшить движение</label>${button("Выключить весь звук", "mute")}${button("Готово", "back", "primary")}<p class="fine">Режим и частота происшествий выбираются перед новой партией. В классике происшествий нет.</p></section>`,
    );
  }
  function profile() {
    const st1 = P.stats.classic,
      st2 = P.stats.chaos;
    return panelPage(
      heading("ЛИЧНОЕ ДЕЛО", "Твой пропуск") +
        `<div class="profile-layout"><section class="paper"><h2>${playerName()}</h2><p>${S.rank(P.xp)} · ${P.xp} опыта</p><label for="profile-name">Имя</label><input id="profile-name" maxlength="24"><small>2–24 буквы, пробелы и дефисы.</small>${button("Сохранить имя", "save-name", "primary")}<h3>Фотография на пропуск</h3><div class="avatars">${[0, 1, 2, 3, 4, 5].map((n) => `<button class="avatar-choice ${P.avatar === n ? "chosen" : ""}" data-action="avatar" data-id="${n}" aria-label="Аватар ${n + 1}">${avatar(n)}</button>`).join("")}</div></section><section class="paper"><h2>Табель партий</h2>${[
          ["Классика", st1],
          ["Беспредел", st2],
        ]
          .map(
            ([t, s]) =>
              `<h3>${t}</h3><div class="stats">${[
                ["Партий", s.played],
                ["Побед", s.wins],
                ["Поражений", s.losses],
                ["Ничьих", s.draws],
                ["Серия", s.streak],
                ["Лучшая", s.best],
              ]
                .map(
                  ([k, v]) =>
                    `<div><strong>${v}</strong><small>${k}</small></div>`,
                )
                .join("")}</div>`,
          )
          .join(
            "",
          )}<h3>Сохранения на этом устройстве</h3><div class="save-actions">${button("Экспорт JSON", "export")}${button("Импорт JSON", "import")}${button("Сбросить прогресс", "reset", "danger")}</div><input type="file" id="import-file" accept="application/json,.json" hidden></section></div>`,
    );
  }
  function achievements() {
    return panelPage(
      heading(
        "ГОРДОСТЬ УЧАСТКА",
        "Достижения",
        "Опыт и открытия не дают преимущества в силе карт.",
      ) +
        `<div class="achievement-grid">${S.achievements.map(([id, title, desc], i) => `<article class="paper achievement ${P.achievements.includes(id) ? "unlocked" : ""}">${sprite("decor", [6, 7, 10, 6, 11, 7][i], 4, 3, "achievement-art")}<div><small>${P.achievements.includes(id) ? "ПОЛУЧЕНО" : "ЕЩЁ НЕ ПОЛУЧЕНО"}</small><h2>${title}</h2><p>${desc}</p></div></article>`).join("")}</div>`,
    );
  }
  function gallery() {
    return panelPage(
      heading("ПРОВЕРЕНО ПО ВЕДОМОСТИ", "Игральная колода") +
        `<div class="tabs">${button("36 игральных карт", "gallery-cards", galleryMode === "cards" ? "primary" : "")}${button("Рубашки", "gallery-backs", galleryMode === "backs" ? "primary" : "")}</div><p class="fine">Колода происшествий секретная. Что приготовила вахта, узнаешь только при открытии события.</p>` +
        (galleryMode === "cards"
          ? `<div class="gallery-cards">${Array.from({ length: 36 }, (_, i) => card(i, { action: "gallery-card" })).join("")}</div>`
          : `<div class="paper back-select"><p>Другая рубашка открывается за любое достижение.</p>${[0, 1].map((i) => `<button data-action="back-skin" data-id="${i}" class="skin ${P.back === i ? "chosen" : ""}" ${i && !P.achievements.length ? "disabled" : ""}>${sprite(i ? "decor" : "cards", i ? 8 : 21, i ? 4 : 6, i ? 3 : 4, "back-preview")}<span>${i ? "Северный узор" : "Бытовка"} ${i && !P.achievements.length ? "· Закрыто" : ""}</span></button>`).join("")}</div>`),
    );
  }
  function rules() {
    return panelPage(
      heading("БЕЗ СПОРОВ О ПРАВИЛАХ", "Как играть") +
        `<article class="paper rules"><h2>Классика</h2><p>36 карт, от шестёрки до туза. По 6 карт каждому. Первый ход — у обладателя младшего козыря; если козырей на руках нет, начинает первый участник.</p><p>Покрой карту более старшей той же масти или козырем. Козырь можно побить только старшим козырем. Подкидываются достоинства, уже лежащие на столе: и атакующие, и покрывающие.</p><p>За раунд — не больше 6 атакующих карт и не больше размера руки защитника на начало раунда. Подкидывание идёт по очереди; каждый атакующий может завершить его. «Взять» не закрывает подкидывание немедленно.</p><p>После «бито» атакует защитник. После взятия — следующий за ним активный участник. Добирает начинавший атаку, затем остальные по часовой стрелке, защитник последним. Открытый козырь — последняя карта колоды.</p><h2>Переводной</h2><p>Пока ни одна карта не покрыта, положи карту того же достоинства и нажми «Перевести». Следующий участник должен иметь достаточно карт для новой атаки. Не больше 6 атакующих карт. Вдвоём перевод тоже разрешён.</p><h2>Беспредел</h2><p>Отдельная колода из 30 происшествий. В обычном стоке скрыты 2, 4 или 6 жетонов, не заменяющих игральные карты. Жетон не попадает в руку. Эффект открывается после добора, не более одного между раундами. Остальные ждут очереди. Сильные происшествия выпадают реже.</p><p>Точный эффект написан на карточке. Выбирай цель и карту, если нужно. Вышедшие участники не возвращаются. Пропуск атаки не отменяет обязанность защищаться. Пустой сток не создаёт карты из воздуха.</p><h2>Управление</h2><p>Выбери карту нажатием, затем кнопку атаки или непокрытую карту на столе. Все кнопки доступны с клавиатуры: Tab и Enter. Кнопка «Рассмотреть» увеличивает выбранную карту. Перетаскивание не требуется.</p><h2>Конец партии</h2><p>Когда сток пуст, участники без карт выходят. Последний с картами — дурак. Если последний эпизод оставил всех без карт — ничья. При выходе игрока боты честно доигрывают партию.</p><h2>Без интернета</h2><p>Все изображения, звук, правила и сохранения находятся на устройстве. Для резервной копии используй экспорт в профиле. Сбрасывать прогресс можно только после подтверждения.</p></article>`,
    );
  }
  // Overlapping rows expose an opaque rank/suit strip for every card. Never scroll.
  function layoutHands() {
    document.querySelectorAll(".hand, .event-hand").forEach((hand) => {
      const cards = [...hand.querySelectorAll(".playing-card")];
      const width = hand.clientWidth - 8;
      if (!cards.length || width < 1) return;
      const compact = innerHeight <= 600 && innerWidth > innerHeight;
      const cw = compact ? 62 : innerWidth <= 500 ? 72 : 94,
        ch = Math.round(cw * 1.44);
      const strip = compact ? 23 : 26;
      const capacity = Math.max(1, Math.floor((width - cw) / strip) + 1);
      const rows = Math.ceil(cards.length / capacity);
      const perRow = Math.ceil(cards.length / rows);
      const rowStep = compact ? 36 : 44;
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
  }
  window.addEventListener("resize", layoutHands);
  function fillNames() {
    document.querySelectorAll("[data-name]").forEach((el) => {
      const i = Number(el.dataset.name);
      el.textContent = G?.players[i]?.name || P.name;
    });
    document.querySelectorAll("[data-player-name]").forEach((el) => {
      el.textContent = P.name;
    });
  }
  function render() {
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
    layoutHands();
    if (screen === "menu")
      $("#menu-quote").textContent =
        P.settings.dialogs === "off"
          ? "Карты на столе. Все свои."
          : C.dialogue("start", 0, P.name, P.settings.humor);
    if (screen === "setup") {
      for (const k of ["count", "variant", "difficulty", "frequency"])
        $("#" + k).value = setup[k];
      $("#chaos").checked = setup.chaos;
      $("#frequency").disabled = !setup.chaos;
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
    if (screen === "profile") $("#profile-name").value = P.name;
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
    if (screen === "results" && G?.finished)
      $("#result-quote").textContent = C.dialogue(
        G.result.loser === 0 ? "lose" : "win",
        0,
        P.name,
        P.settings.humor,
      );
    audio.update(P.settings);
  }
  function say(kind, who) {
    if (P.settings.dialogs === "off" || who === 0) return;
    const cooldown =
      P.settings.dialogs === "rare"
        ? 6
        : P.settings.humor === "moderate"
          ? 5
          : 3;
    if (G.sequence - lastDialog < cooldown && kind !== "win" && kind !== "lose")
      return;
    const text = C.dialogue(kind, G.players[who].npc, P.name, P.settings.humor);
    if (recent.includes(text)) return;
    recent.push(text);
    recent = recent.slice(-5);
    lastDialog = G.sequence;
    dialog = { who, text };
    emotion[who] = ["take_many", "event_bad"].includes(kind)
      ? 2
      : ["win", "event_good", "defend"].includes(kind)
        ? 1
        : 0;
  }
  function afterAction(who, a) {
    const delta = G.sequence;
    lastActionAt = Date.now();
    audio.play(
      a.type === "defend" ? "cover" : a.type === "take" ? "take" : "card",
    );
    let category =
      a.type === "defend"
        ? "defend"
        : a.type === "take"
          ? G.table.length > 1
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
    say(category, who);
    if (G.round > 24 && G.round % 10 === 0) say("long_game", who);
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
      audio.play("event");
    }
    selected = null;
    render();
  }
  function act(a) {
    if (paused || !G || screen !== "game") return;
    const who = G.actor,
      r = E.apply(G, who, a);
    if (!r.ok) {
      toast(r.error);
      return;
    }
    afterAction(who, a);
  }
  function scheduleBot() {
    if (
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
      P.settings.fast ? 90 : 650,
    );
  }
  function startGame() {
    if (setup.npcs.length !== setup.count - 1) return;
    const names = [P.name, ...setup.npcs.map((i) => C.NPC[i].name)];
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
  function handle(action, el) {
    switch (action) {
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
          : [...setup.npcs, i];
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
        const r = F.eventAction(
          G,
          who === 0 && !v.cancelled
            ? { choice: eventChoice, target: eventTarget, card: eventCard }
            : F.botEvent(G),
        );
        if (!r.ok) {
          toast(r.error);
          return;
        }
        const record = G.metrics.events.at(-1);
        say(record.delta > 0 ? "event_bad" : "event_good", who === 0 ? 1 : who);
        if (G.finished) {
          newAchievements = S.finish(P, G);
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
    if (document.hidden) persist();
    else if (screen === "game") scheduleBot();
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
      !document.hidden &&
      G?.actor === 0 &&
      Date.now() - lastActionAt > 25000
    ) {
      say("idle", 1);
      lastActionAt = Date.now();
      render();
    }
  }, 5000);
  const overlayObserver = new MutationObserver(() => {
    const open = $("#overlay").childElementCount > 0;
    $("#app").inert = open;
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
    ["room", "npc", "cards", "events", "decor"].map(
      (name) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = "public/assets/" + name + ".webp";
        }),
    ),
  ).then((results) => {
    if (results.some((x) => !x))
      toast(
        "Не загружена часть графики. Проверьте, что папка public/assets распакована рядом с index.html.",
      );
  });
  render();
  if (loaded.warning) toast(loaded.warning);
})();
// Optional installation cache for HTTP/localhost launches; file:// needs no service worker.
if (location.protocol === "http:" || location.protocol === "https:") {
  navigator.serviceWorker?.register("./sw.js").catch(() => {});
}
