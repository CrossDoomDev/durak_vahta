(function (root, factory) {
  const E =
    typeof module === "object" ? require("./engine.js") : root.VahtaEngine;
  const api = factory(E);
  if (typeof module === "object") module.exports = api;
  else root.VahtaSave = api;
})(globalThis, function (E) {
  const KEY = "durak-vahta-v1";
  function fresh() {
    return {
      version: 1,
      name: "",
      avatar: 5,
      xp: 0,
      back: 0,
      achievements: [],
      completed: [],
      stats: {
        classic: {
          played: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          streak: 0,
          best: 0,
        },
        chaos: { played: 0, wins: 0, losses: 0, draws: 0, streak: 0, best: 0 },
      },
      settings: {
        humor: "full",
        dialogs: "normal",
        music: 0.16,
        sfx: 0.6,
        fast: false,
        reduced: false,
      },
      game: null,
    };
  }
  function validate(raw) {
    if (!raw || raw.version !== 1) throw Error("Неизвестная версия сохранения");
    const p = fresh();
    if (raw.name && !E.validName(raw.name)) throw Error("Неверное имя");
    p.name = (raw.name || "").trim();
    p.avatar =
      Number.isInteger(raw.avatar) && raw.avatar >= 0 && raw.avatar <= 5
        ? raw.avatar
        : 5;
    p.xp = Number.isFinite(raw.xp) && raw.xp >= 0 ? Math.min(raw.xp, 1e8) : 0;
    p.achievements = Array.isArray(raw.achievements)
      ? raw.achievements.filter((x) =>
          ["palych", "north", "early", "inventory", "tea", "eternal"].includes(
            x,
          ),
        )
      : [];
    p.completed = Array.isArray(raw.completed)
      ? raw.completed.filter((x) => typeof x === "string").slice(-100)
      : [];
    p.back = raw.back === 1 && p.achievements.length > 0 ? 1 : 0;
    for (const mode of ["classic", "chaos"])
      for (const field in p.stats[mode]) {
        const v = raw.stats?.[mode]?.[field];
        p.stats[mode][field] = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
      }
    for (const k of ["music", "sfx"])
      if (Number.isFinite(raw.settings?.[k]))
        p.settings[k] = Math.min(1, Math.max(0, raw.settings[k]));
    for (const k of ["fast", "reduced"])
      p.settings[k] = raw.settings?.[k] === true;
    if (["full", "moderate", "clean"].includes(raw.settings?.humor))
      p.settings.humor = raw.settings.humor;
    if (["off", "rare", "normal"].includes(raw.settings?.dialogs))
      p.settings.dialogs = raw.settings.dialogs;
    if (raw.game != null) p.game = E.restore(raw.game);
    return p;
  }
  function load(storage) {
    try {
      const v = storage.getItem(KEY);
      if (!v) return { profile: fresh(), warning: null };
      return { profile: validate(JSON.parse(v)), warning: null };
    } catch {
      try {
        const v = storage.getItem(KEY + "-backup");
        if (v)
          return {
            profile: validate(JSON.parse(v)),
            warning: "Восстановлена резервная копия.",
          };
      } catch {}
      return {
        profile: fresh(),
        warning:
          "Сохранение недоступно или повреждено. Можно импортировать резервную копию.",
      };
    }
  }
  function write(storage, p) {
    try {
      const json = JSON.stringify(p);
      storage.setItem(KEY, json);
      storage.setItem(KEY + "-backup", json);
      return true;
    } catch {
      return false;
    }
  }
  const achievements = [
    [
      "palych",
      "Палыч одобряет",
      "Победить на сложности «Палыч» с Палычем за столом.",
    ],
    [
      "north",
      "Северный характер",
      "Победить в беспределе и пережить хотя бы одно происшествие.",
    ],
    ["early", "Досрочная межвахта", "Успешно сбросить карту через событие №7."],
    ["inventory", "Инвентаризация завершена", "Получить карты от события №2."],
    ["tea", "Чайник не остыл", "Победить не более чем за 12 раундов."],
    ["eternal", "Вечная вахта", "Победить после получения карт в событии №15."],
  ];
  function finish(p, s) {
    const id = s.gameId || "seed-" + s.startedSeed + "-" + s.rng;
    if (!s.finished || p.completed.includes(id)) return [];
    p.completed.push(id);
    p.completed = p.completed.slice(-100);
    const st = p.stats[s.options.chaos ? "chaos" : "classic"],
      draw = s.result.draw,
      win = !draw && s.result.loser !== 0;
    st.played++;
    if (draw) {
      st.draws++;
      st.streak = 0;
    } else if (win) {
      st.wins++;
      st.streak++;
      st.best = Math.max(st.best, st.streak);
    } else {
      st.losses++;
      st.streak = 0;
    }
    p.xp += win ? 120 : draw ? 60 : 35;
    const events = s.metrics.events.filter(
        (e) => e.recipient === 0 && !e.cancelled,
      ),
      conditions = {
        palych:
          win &&
          s.options.difficulty === "hard" &&
          s.players.some((x) => x.npc === 0),
        north: win && s.options.chaos && events.length > 0,
        early: events.some((e) => e.id === 6 && e.delta < 0),
        inventory: events.some((e) => e.id === 1 && e.delta > 0),
        tea: win && s.round <= 12,
        eternal: win && events.some((e) => e.id === 14 && e.delta > 0),
      };
    const unlocked = [];
    for (const [k] of achievements)
      if (conditions[k] && !p.achievements.includes(k)) {
        p.achievements.push(k);
        unlocked.push(k);
      }
    return unlocked;
  }
  function rank(xp) {
    return xp < 200
      ? "Салага"
      : xp < 600
        ? "Вахтовик"
        : xp < 1500
          ? "Бывалый"
          : xp < 3000
            ? "Бригадир"
            : "Легенда Севера";
  }
  return { KEY, fresh, validate, load, write, finish, rank, achievements };
});
