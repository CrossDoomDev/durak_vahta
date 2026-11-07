/* Revalidate before starting any game code. Offline fallback never mixes releases. */
(async function () {
  "use strict";
  const build = window.VahtaBuild,
    base = new URL("./", location.href);
  const boot = document.querySelector("#boot");
  function normalizeAddress() {
    if (
      !/^index-[a-f0-9]{16}\.html$/.test(location.pathname.split("/").pop()) ||
      location.protocol === "file:" ||
      !navigator.serviceWorker
    )
      return;
    const check = () => {
      const worker = navigator.serviceWorker.controller;
      if (!worker) return;
      const channel = new MessageChannel(),
        timer = setTimeout(() => channel.port1.close(), 300);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        channel.port1.close();
        if (event.data?.id === build.id) {
          history.replaceState(null, "", base.pathname);
          navigator.serviceWorker.removeEventListener(
            "controllerchange",
            check,
          );
        }
      };
      worker.postMessage({ type: "VAHTA_VERSION" }, [channel.port2]);
    };
    navigator.serviceWorker.addEventListener("controllerchange", check);
    check();
  }
  function retry() {
    const u = new URL(location.href);
    u.searchParams.set("refresh", Date.now().toString());
    location.replace(u.href);
  }
  function failure(text) {
    boot.replaceChildren();
    const p = document.createElement("span");
    p.textContent = text;
    const button = document.createElement("button");
    button.textContent = "Попробовать снова";
    button.onclick = retry;
    boot.append(p, button);
  }
  async function latest() {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 4000);
    try {
      const u = new URL("version.json", base);
      u.searchParams.set(
        "check",
        Date.now() + "-" + Math.random().toString(36).slice(2),
      );
      const r = await fetch(u, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!r.ok) throw Error("Version unavailable");
      const v = await r.json();
      if (!/^[a-f0-9]{16}$/.test(v.id) || v.html !== `index-${v.id}.html`)
        throw Error("Invalid version");
      return v;
    } finally {
      clearTimeout(timer);
    }
  }
  if (location.protocol === "http:" || location.protocol === "https:") {
    let remote;
    try {
      remote = await latest();
      build.checkedOnline = true;
    } catch {
      build.checkedOnline = false;
    }
    if (remote && remote.id !== build.id) {
      // A legacy cache-first worker may still control the tab. A unique navigation bypasses its old entry.
      const marker = "vahta-update-" + remote.id;
      let repeated = false;
      try {
        const old = Number(sessionStorage.getItem(marker));
        repeated = Date.now() - old < 15000;
        sessionStorage.setItem(marker, String(Date.now()));
      } catch {}
      if (repeated) {
        failure(
          "Обновление ещё публикуется. Повтори загрузку через несколько секунд.",
        );
        return;
      }
      const u = new URL(remote.html, base);
      u.searchParams.set("refresh", Date.now().toString());
      location.replace(u.href);
      return;
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(new URL("sw.js?build=" + build.id, base), {
          scope: base.href,
          updateViaCache: "none",
        })
        .then((reg) => reg.update())
        .catch(() => {});
    }
  }
  document.documentElement.dataset.build = build.id;
  document.documentElement.dataset.version = build.version;
  try {
    await new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = new URL(build.css, base);
      css.onload = resolve;
      css.onerror = reject;
      document.head.append(css);
    });
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(build.js, base);
      script.async = false;
      script.onload = resolve;
      script.onerror = reject;
      document.body.append(script);
    });
    boot.remove();
    normalizeAddress();
  } catch {
    failure(
      "Не удалось загрузить эту версию игры. Проверь подключение и повтори загрузку.",
    );
  }
})();
