"use strict";

// Report metadata remains in the main app data; original media lives in IndexedDB.
// A future complete backup must include both the main data and this object store.
const SauronMemories = (() => {
  const DB_NAME = "sauron-memories-v1";
  const STORE = "media";
  const MAX_BYTES = 100 * 1024 * 1024;
  let selectedWeek = weekStart(today());
  let followsCurrent = true;
  let dbPromise;
  let renderVersion = 0;
  let mediaURLs = [];
  let mediaBusy = false;
  let unsavedNotes = false;
  const byId = id => document.getElementById(id);
  const shortDate = value => new Date(value + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
  const shiftDate = (value, days) => new Date(dateStamp(value) + days * DAY).toISOString().slice(0, 10);

  function weekStart(value) {
    const day = new Date(dateStamp(value)).getUTCDay();
    return new Date(dateStamp(value) - ((day + 6) % 7) * DAY).toISOString().slice(0, 10);
  }

  // Deterministic report, derived from dated records, without generated medical conclusions.
  function buildReport(week, asOf = today()) {
    const end = shiftDate(week, 6);
    const cutoff = end < asOf ? end : asOf;
    const inWeek = date => validDate(date) && date >= week && date <= cutoff;
    const events = [];
    const add = (date, category, title, detail) => {
      if (inWeek(date)) events.push({ date, category, title, detail: detail || "" });
    };
    const datedWeights = weights.filter(w => validDate(w.date) && w.date <= cutoff).slice().sort((a, b) => a.date.localeCompare(b.date));
    const weekWeights = datedWeights.filter(w => w.date >= week);
    const lastWeight = datedWeights.at(-1) || null;
    const previousWeight = datedWeights.filter(w => w.date < week).at(-1) || null;
    const change = weekWeights.length && previousWeight ? Number(lastWeight.weight) - Number(previousWeight.weight) : null;
    for (const w of weekWeights) add(w.date, "Peso", `${fmt(w.weight, 2)} kg`, w.source === "vet" ? "Pesagem associada a uma consulta." : "Pesagem registada.");
    const stateLabel = value => ({ planned: "Agendada", completed: "Realizada", cancelled: "Cancelada", administered: "Administrada", scheduled: "Agendada", pending: "Pendente", active: "Ativo", resolved: "Resolvido", monitoring: "Em observação", ongoing: "Em curso", stopped: "Interrompida" }[value] || value || "Estado não indicado");
    for (const r of health.records || []) {
      const done = r.status === "administered" || (!r.status && r.done === true);
      const date = done ? r.date : (r.appointmentDate || r.date);
      const category = r.type === "vaccine" ? "Vacinação" : r.type === "deworming" ? "Desparasitação" : "Saúde";
      add(date, category, `${r.name || r.product || category} · ${done ? "Administrada" : stateLabel(r.status)}`, r.notes);
    }
    for (const v of health.visits || []) add(v.date, "Consulta", `${v.reason || "Consulta veterinária"} · ${stateLabel(v.status)}`, [v.clinic, v.notes].filter(Boolean).join(" · "));
    for (const d of health.diary || []) add(d.date, "Diário de saúde", d.symptom || "Observação", [d.notes, d.status ? `Estado atual: ${stateLabel(d.status)}` : ""].filter(Boolean).join(" · "));
    for (const s of health.screenings || []) {
      add(s.completedDate || s.plannedDate, "Exame", `${s.name || "Exame"} · ${s.completedDate ? "Realizado" : "Planeado"}`, s.notes);
    }
    for (const m of health.medications || []) {
      if (m.status === "planned") add(m.startDate, "Medicação", `${m.name} · início planeado`, m.purpose);
      else add(m.startDate, "Medicação", `${m.name} · início registado`, m.purpose);
      if (m.endDate && m.endDate !== m.startDate) add(m.endDate, "Medicação", `${m.name} · data de fim registada`, "A data registada não confirma, por si só, a administração de todas as doses.");
    }
    const sessions = (training.sessions || []).filter(s => inWeek(s.date));
    for (const session of sessions) {
      const trick = (training.tricks || []).find(t => t.id === session.trickId);
      add(session.date, "Treino", trick?.name || "Sessão de treino", [session.minutes != null ? `${fmt(session.minutes, 1)} min` : "", session.notes].filter(Boolean).join(" · "));
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category));
    return {
      version: 1, week, end, cutoff, current: week === weekStart(asOf),
      ageWeeks: Math.max(0, Math.floor((dateStamp(cutoff) - dateStamp(BIRTH)) / (7 * DAY))),
      lastWeight, previousWeight, change, weightCount: weekWeights.length,
      sessionCount: sessions.length,
      planCount: plans.filter(p => inWeek(p.date)).length,
      events
    };
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("O navegador não disponibiliza armazenamento para os ficheiros.")); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("week", "week", { unique: false });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => { dbPromise = null; reject(request.error); };
      request.onblocked = () => { byId("memoryMediaStatus").textContent = "Fecha outros separadores da app e volta a tentar abrir as memórias."; };
    });
    return dbPromise;
  }

  async function getMedia(week) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).index("week").getAll(week);
      tx.oncomplete = () => resolve(request.result.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Leitura interrompida."));
    });
  }

  async function getMediaCounts() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const result = new Map();
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).index("week").openKeyCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { result.set(cursor.key, (result.get(cursor.key) || 0) + 1); cursor.continue(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Leitura interrompida."));
    });
  }

  async function writeMedia(items, deleteId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      // A whole selection is committed together, or rolled back on quota errors.
      try {
        if (deleteId) store.delete(deleteId);
        else for (const item of items) store.add(item);
      } catch (error) {
        tx.abort(); reject(error); return;
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Não foi possível guardar os ficheiros."));
    });
  }

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function releaseMedia() {
    for (const video of byId("memoryGallery").querySelectorAll("video")) video.pause();
    for (const url of mediaURLs) URL.revokeObjectURL(url);
    mediaURLs = [];
  }

  function fillReport(report) {
    byId("memoryWeekState").textContent = report.current ? "Esta semana · em atualização" : "Semana anterior · resumo atualizado";
    byId("memoryReportTitle").textContent = `A semana de Sauron`;
    byId("memoryReportDates").textContent = `${shortDate(report.week)} – ${shortDate(report.end)} de ${report.end.slice(0, 4)} · ${report.ageWeeks} semanas de idade no final do período observado`;
    byId("memorySummary").textContent = report.events.length
      ? `${report.events.length} ${plural(report.events.length, "acontecimento registado", "acontecimentos registados")}${report.current ? " até hoje" : ""}. ${report.planCount ? `${report.planCount} ${plural(report.planCount, "plano alimentar guardado", "planos alimentares guardados")} nesta semana; não representa consumo observado.` : ""}`
      : "Ainda não há pesos ou acontecimentos registados nesta semana. As fotos e notas podem contar a história.";
    const metrics = byId("memoryMetrics"); metrics.replaceChildren();
    const metric = (label, value, detail) => {
      const card = node("div", "memory-metric");
      card.append(node("span", "hint", label), node("strong", "", value), node("span", "hint", detail)); metrics.append(card);
    };
    metric("Último peso conhecido", report.lastWeight ? `${fmt(report.lastWeight.weight, 2)} kg` : "Sem registo", report.lastWeight ? `Medido em ${shortDate(report.lastWeight.date)}${report.weightCount ? "" : " · sem pesagem nesta semana"}` : "Sem pesagens até esta semana");
    metric("Variação do peso", report.change === null ? "Sem comparação" : `${report.change > 0 ? "+" : ""}${fmt(report.change * 1000, 0)} g`, report.change === null ? "Requer uma pesagem na semana e outra anterior" : `Desde ${shortDate(report.previousWeight.date)}; pode abranger mais de 7 dias`);
    metric("Treinos", String(report.sessionCount), plural(report.sessionCount, "sessão registada", "sessões registadas"));
    const events = byId("memoryEvents"); events.replaceChildren();
    if (!report.events.length) events.append(node("li", "memory-empty", "Sem acontecimentos datados para mostrar."));
    for (const event of report.events) {
      const item = node("li", "memory-event");
      const time = node("time", "memories-eyebrow", `${shortDate(event.date)} · ${event.category}`); time.dateTime = event.date;
      item.append(time, node("strong", "", event.title));
      if (event.detail) item.append(node("p", "hint", event.detail));
      events.append(item);
    }
    if (!unsavedNotes) {
      byId("memoryNotes").value = memories.notes[selectedWeek] || "";
      byId("memoryNoteStatus").textContent = "As tuas notas são guardadas automaticamente.";
    }
    byId("memoryDate").value = selectedWeek < BIRTH ? BIRTH : selectedWeek;
    byId("memoryDate").min = BIRTH; byId("memoryDate").max = today();
  }

  function fillWeeks(counts) {
    const list = byId("memoryWeeks"); list.replaceChildren();
    for (let week = weekStart(today()); week >= weekStart(BIRTH); week = shiftDate(week, -7)) {
      const report = buildReport(week);
      const count = counts.get(week) || 0;
      const button = node("button", "memory-week" + (week === selectedWeek ? " active" : ""));
      button.type = "button"; button.setAttribute("aria-pressed", String(week === selectedWeek));
      button.append(node("strong", "", `${shortDate(week)} – ${shortDate(report.end)}`), node("span", "hint", `${report.events.length} registos · ${count} ficheiros${memories.notes[week] ? " · notas" : ""}`));
      button.addEventListener("click", () => selectWeek(week)); list.append(button);
    }
  }

  function fillGallery(items) {
    releaseMedia();
    const gallery = byId("memoryGallery"); gallery.replaceChildren();
    if (!items.length) { gallery.append(node("p", "memory-empty", "Esta semana ainda não tem fotografias ou vídeos. Adiciona o primeiro momento.")); return; }
    for (const item of items) {
      const card = node("figure", "memory-media-card");
      const url = URL.createObjectURL(item.blob); mediaURLs.push(url);
      const media = node(item.type.startsWith("video/") ? "video" : "img", "memory-media");
      media.src = url;
      if (media.tagName === "VIDEO") { media.controls = true; media.preload = "metadata"; media.playsInline = true; media.setAttribute("aria-label", item.name); }
      else { media.alt = item.name; media.loading = "lazy"; }
      media.addEventListener("error", () => {
        const error = node("p", "hint", "Este navegador não conseguiu mostrar o ficheiro. Podes descarregar o original.");
        card.insertBefore(error, card.lastChild);
      }, { once: true });
      const caption = node("figcaption", ""); caption.append(node("span", "memory-filename", item.name));
      const actions = node("div", "memory-media-actions");
      const download = node("a", "ghost", "Descarregar"); download.href = url; download.download = item.name;
      const remove = node("button", "ghost", "Remover"); remove.type = "button"; remove.setAttribute("aria-label", `Remover ${item.name}`);
      remove.addEventListener("click", async () => {
        if (mediaBusy || !confirm(`Remover «${item.name}» desta semana? Não existe recuperação na app; mantém o teu original.`)) return;
        setBusy(true);
        try { await writeMedia([], item.id); await render(); byId("memoryMediaStatus").textContent = "Ficheiro removido."; }
        catch { byId("memoryMediaStatus").textContent = "Não foi possível remover o ficheiro. Tenta novamente."; }
        finally { setBusy(false); }
      });
      actions.append(download, remove); caption.append(actions); card.append(media, caption); gallery.append(card);
    }
  }

  function setBusy(value) {
    mediaBusy = value;
    byId("memoryAddMedia").disabled = value;
    byId("memoryGallery").setAttribute("aria-busy", String(value));
  }

  async function render() {
    if (followsCurrent && !unsavedNotes) selectedWeek = weekStart(today());
    const version = ++renderVersion;
    fillReport(buildReport(selectedWeek)); fillWeeks(new Map());
    releaseMedia(); byId("memoryGallery").replaceChildren();
    byId("memoryMediaStatus").textContent = "A carregar os momentos desta semana…";
    try {
      const [items, counts] = await Promise.all([getMedia(selectedWeek), getMediaCounts()]);
      if (version !== renderVersion) return;
      fillGallery(items); fillWeeks(counts);
      byId("memoryMediaStatus").textContent = items.length ? `${items.length} ${plural(items.length, "ficheiro guardado", "ficheiros guardados")} nesta semana.` : "";
    } catch {
      if (version !== renderVersion) return;
      releaseMedia(); byId("memoryGallery").replaceChildren();
      byId("memoryMediaStatus").textContent = "Não foi possível abrir as fotografias e vídeos guardados neste navegador. Os registos e notas continuam disponíveis. Tenta reabrir a página.";
    }
  }

  function selectWeek(value, current = false) {
    if (mediaBusy) return;
    if (unsavedNotes && !confirm("As últimas notas não foram guardadas. Queres mudar de semana e descartá-las?")) return;
    const target = weekStart(value);
    if (target < weekStart(BIRTH) || target > weekStart(today())) return;
    selectedWeek = target; followsCurrent = current; unsavedNotes = false; render();
  }

  const typeForFile = file => {
    const ext = file.name.toLowerCase().split(".").at(-1);
    const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };
    return types[ext] && (!file.type || file.type === types[ext] || file.type === "application/octet-stream") ? types[ext] : null;
  };

  byId("memoryDate").addEventListener("change", e => {
    if (validDate(e.target.value) && e.target.value >= BIRTH && e.target.value <= today()) selectWeek(e.target.value);
    else { e.target.value = selectedWeek < BIRTH ? BIRTH : selectedWeek; }
  });
  byId("memoryCurrent").addEventListener("click", () => selectWeek(today(), true));
  byId("memoryNotes").addEventListener("input", () => {
    const previous = memories.notes[selectedWeek];
    const value = byId("memoryNotes").value;
    if (value) memories.notes[selectedWeek] = value; else delete memories.notes[selectedWeek];
    if (persist()) {
      unsavedNotes = false; byId("memoryNoteStatus").textContent = "Notas guardadas neste navegador.";
    } else {
      if (previous === undefined) delete memories.notes[selectedWeek]; else memories.notes[selectedWeek] = previous;
      unsavedNotes = true; byId("memoryNoteStatus").textContent = "Não foi possível guardar as notas. Copia o texto antes de fechar ou mudar de semana.";
    }
  });
  byId("memoryAddMedia").addEventListener("click", () => byId("memoryMediaInput").click());
  byId("memoryMediaInput").addEventListener("change", async e => {
    const files = [...e.target.files]; e.target.value = "";
    if (!files.length || mediaBusy) return;
    const invalid = files.find(file => !typeForFile(file) || file.size === 0 || file.size > MAX_BYTES);
    if (invalid) { byId("memoryMediaStatus").textContent = `«${invalid.name}» está vazio, tem um formato não suportado ou excede 100 MB. Nenhum ficheiro foi adicionado.`; return; }
    const week = selectedWeek;
    const items = files.map(file => ({ id: makeId(), week, name: file.name, type: typeForFile(file), size: file.size, blob: file, createdAt: new Date().toISOString(), version: 1 }));
    setBusy(true); byId("memoryMediaStatus").textContent = "A guardar os momentos…";
    try {
      await writeMedia(items);
      await render();
      byId("memoryMediaStatus").textContent = `${files.length} ${plural(files.length, "ficheiro guardado", "ficheiros guardados")} na semana de ${shortDate(week)}.`;
    } catch (error) {
      byId("memoryMediaStatus").textContent = error?.name === "QuotaExceededError"
        ? "O armazenamento do navegador está cheio. Nenhum dos ficheiros selecionados foi adicionado. Mantém os originais."
        : "Não foi possível guardar os ficheiros. Nenhum foi adicionado; mantém os originais e tenta novamente.";
    } finally { setBusy(false); }
  });
  window.addEventListener("beforeunload", event => {
    if (mediaBusy || unsavedNotes) { event.preventDefault(); event.returnValue = ""; }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !byId("view-memories").hidden && !mediaBusy) render();
  });
  return { render, buildReport, weekStart };
})();
