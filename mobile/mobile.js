"use strict";

(() => {
  // Same origin and storage schema as the desktop app. This page only reads.
  const storageKey = "sauron-nutrition-v3";
  const defaultBirth = "2026-07-18";
  const dayInMs = 86400000;
  const numberFormat = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 });
  const titles = {
    events: "Eventos",
    plan: "Plano Diário",
    growth: "Crescimento",
    health: "Saúde",
    foods: "Alimentos",
    training: "Treinos",
    memories: "Memórias",
    backup: "Backup",
    menu: "Menu"
  };

  function readRecords() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}") || {};
    } catch {
      return {};
    }
  }

  function calendarStamp(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const stamp = Date.parse(value + "T00:00:00Z");
    if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) return NaN;
    return stamp;
  }

  function renderStats() {
    const records = readRecords();
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const savedBirth = calendarStamp(records.health?.identity?.birthDate);
    const birth = Number.isFinite(savedBirth) ? savedBirth : calendarStamp(defaultBirth);
    const days = Math.floor((today - birth) / dayInMs);
    const weeks = Math.floor(days / 7);
    document.querySelector("#age").textContent = days < 0 ? "—" :
      days < 7 ? days + (days === 1 ? " dia" : " dias") :
      weeks + (weeks === 1 ? " semana" : " semanas");

    let latestDate = -Infinity;
    let weight = null;
    for (const entry of Array.isArray(records.weights) ? records.weights : []) {
      const date = calendarStamp(entry?.date);
      if (date >= latestDate && date <= today &&
          Number.isFinite(entry.weight) && entry.weight > 0 && entry.weight <= 20) {
        latestDate = date;
        weight = entry.weight;
      }
    }
    const savedWeight = Number(records.settings?.weight);
    if (weight === null && savedWeight >= 0.5 && savedWeight <= 12) weight = savedWeight;
    document.querySelector("#weight").textContent = weight === null
      ? "Sem pesagem"
      : numberFormat.format(weight) + " kg";
  }

  const panel = document.querySelector("#panel");
  const title = document.querySelector("#panel-title");
  const status = document.querySelector("#panel-status");
  const menu = document.querySelector("#menu-items");

  document.addEventListener("click", event => {
    const button = event.target.closest("button[data-page]");
    if (!button) {
      if (event.target === panel) panel.close();
      return;
    }
    const { page } = button.dataset;
    if (page === "home" || page === "close") {
      if (panel.open) panel.close();
      if (page === "home") {
        window.scrollTo(0, 0);
        document.querySelector(".home-button").focus({ preventScroll: true });
      }
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(titles, page)) return;
    title.textContent = titles[page];
    menu.hidden = page !== "menu";
    status.hidden = page === "menu";
    if (!panel.open) panel.showModal();
    panel.querySelector(".close").focus();
  });

  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) renderStats();
  });
  window.addEventListener("pageshow", renderStats);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderStats();
  });
  renderStats();
})();
