"use strict";

const SauronBackup = (() => {
  const APP_KEY = "sauron-nutrition-v3";
  const WATER_KEY = "sauron-hydration-v1";
  const MEDIA_DB = "sauron-memories-v1";
  const RECOVERY_DB = "sauron-backup-recovery-v1";
  const MAX_TOTAL = 512 * 1024 * 1024;
  const MAX_MANIFEST = 16 * 1024 * 1024;
  const MAX_FILES = 5000;
  const CHUNK = 1024 * 1024;
  let busy = false;
  let pending = null;
  const $b = id => document.getElementById(id);
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const message = text => { $b("fullBackupDialogMessage").textContent = text; };
  const bytesLabel = size => `${(size / 1024 / 1024).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} MB`;
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  const check = (condition, explanation) => { if (!condition) throw new Error(explanation); };
  const storageKey = key => key.startsWith("sauron-") && key.length <= 200;

  function setBusy(value) {
    busy = value;
    $b("closeFullBackupDialog").disabled = value;
    $b("confirmFullBackup").disabled = value;
  }
  function showDialog(title, text) {
    $b("fullBackupDialogTitle").textContent = title;
    message(text); $b("fullBackupPreview").replaceChildren();
    $b("confirmFullBackup").hidden = true;
    if (!$b("fullBackupDialog").open) $b("fullBackupDialog").showModal();
  }
  function showError(error) {
    pending = null; setBusy(false);
    $b("confirmFullBackup").hidden = true;
    message(error?.name === "QuotaExceededError"
      ? "O navegador não tem espaço suficiente. A operação foi interrompida. Mantém os teus ficheiros e liberta espaço antes de tentar novamente."
      : (error?.message || "Não foi possível concluir a operação."));
    $b("closeFullBackupDialog").textContent = "Fechar";
  }

  function openDB(name) {
    return new Promise((resolve, reject) => {
      check(!!window.indexedDB, "O armazenamento de fotografias e vídeos está indisponível neste navegador.");
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => {
        if (name === MEDIA_DB) {
          const store = request.result.createObjectStore("media", { keyPath: "id" });
          store.createIndex("week", "week", { unique: false });
        } else request.result.createObjectStore("snapshots", { keyPath: "id" });
      };
      request.onsuccess = () => {
        const db = request.result;
        const expected = name === MEDIA_DB ? "media" : "snapshots";
        if (!db.objectStoreNames.contains(expected)) { db.close(); reject(new Error("O armazenamento tem um formato incompatível. Nenhum dado foi alterado.")); return; }
        db.onversionchange = () => db.close(); resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => message("Fecha os outros separadores da app e tenta novamente.");
    });
  }
  async function readMedia() {
    const db = await openDB(MEDIA_DB);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("media", "readonly");
      const request = tx.objectStore("media").getAll();
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error("Não foi possível ler as Memórias. O backup não foi criado.")); };
    });
  }
  function readStorage() {
    const result = Object.create(null);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (storageKey(key)) result[key] = localStorage.getItem(key);
    }
    return result;
  }
  function validateStorage(storage) {
    check(object(storage) && Object.keys(storage).length <= 100, "Lista de dados inválida no backup.");
    let total = 0;
    for (const [key, value] of Object.entries(storage)) {
      check(storageKey(key) && typeof value === "string", "O backup contém uma entrada de armazenamento inválida.");
      total += value.length;
    }
    check(total <= MAX_MANIFEST, "Os registos do backup excedem o tamanho permitido.");
    const main = JSON.parse(storage[APP_KEY] || "null");
    check(object(main), "Não foi encontrado o estado completo da app neste backup.");
    for (const key of ["foods", "weights", "plans"]) check(Array.isArray(main[key]) && main[key].every(object), `Os dados de ${key} são inválidos.`);
    check(main.foods.every(validFood), "O backup contém alimentos inválidos.");
    check(main.plans.every(plan => validDate(plan.date) && ["w", "wet", "dry", "total"].every(key => isKnown(plan[key]))), "O backup contém planos inválidos.");
    for (const key of ["health", "training", "settings", "snackDays"]) check(object(main[key]), `Os dados de ${key} são inválidos.`);
    for (const key of ["tricks", "sessions"]) check(Array.isArray(main.training[key]) && main.training[key].every(object), "Os dados dos treinos são inválidos.");
    for (const key of ["records", "visits", "vets", "documents", "diary", "screenings", "medications"]) check(Array.isArray(main.health[key]) && main.health[key].every(object), "Os dados de saúde são inválidos.");
    check(main.health.records.every(record => typeof record.id === "string" && typeof record.name === "string" && record.name.trim() && ["vaccine", "deworming"].includes(record.type)), "O backup contém registos de saúde inválidos.");
    check(object(main.health.genetic) && Array.isArray(main.health.genetic.results) && main.health.genetic.results.every(object), "O perfil genético é inválido.");
    const trickIds = new Set();
    for (const trick of main.training.tricks) {
      check(typeof trick.id === "string" && !trickIds.has(trick.id) && typeof trick.name === "string" && trick.name.trim(), "O backup contém truques inválidos ou repetidos."); trickIds.add(trick.id);
    }
    const sessionIds = new Set();
    for (const session of main.training.sessions) {
      check(typeof session.id === "string" && !sessionIds.has(session.id) && trickIds.has(session.trickId) && validDate(session.date) && session.date >= BIRTH && session.date <= today() && Number.isInteger(session.attempts) && session.attempts >= 1 && session.attempts <= 999 && Number.isInteger(session.independent) && session.independent >= 0 && Number.isInteger(session.assisted) && session.assisted >= 0 && session.independent + session.assisted <= session.attempts && isKnown(session.minutes) && session.minutes > 0 && session.minutes <= 240, "O backup contém sessões de treino inválidas ou repetidas."); sessionIds.add(session.id);
    }
    check(main.weights.every(w => validDate(w.date) && typeof w.weight === "number" && Number.isFinite(w.weight) && w.weight > 0 && w.weight <= 20), "O backup contém pesagens inválidas.");
    if (main.memories !== undefined) {
      check(object(main.memories) && object(main.memories.notes), "As notas das Memórias são inválidas.");
      check(Object.entries(main.memories.notes).every(([key, value]) => validDate(key) && typeof value === "string" && value.length <= 4000), "O backup contém notas inválidas.");
    }
    if (storage[WATER_KEY] !== undefined) {
      const water = JSON.parse(storage[WATER_KEY]);
      check(object(water) && object(water.days), "Os registos de água são inválidos.");
    }
    return main;
  }
  function checkMedia(items) {
    check(Array.isArray(items) && items.length <= MAX_FILES, "Demasiados ficheiros no backup.");
    const ids = new Set(); let size = 0;
    for (const item of items) {
      check(object(item) && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 200 && !ids.has(item.id), "Identificador de fotografia ou vídeo inválido ou repetido.");
      ids.add(item.id);
      check(validDate(item.week) && new Date(item.week + "T12:00:00Z").getUTCDay() === 1, "Semana de uma memória inválida.");
      check(typeof item.name === "string" && item.name.length <= 2000 && /^(image|video)\/[a-zA-Z0-9.+-]+$/.test(item.type), "Nome ou formato de multimédia inválido.");
      check(item.blob instanceof Blob && item.blob.size > 0, "Falta o ficheiro original de uma memória. O backup foi interrompido.");
      size += item.blob.size;
      check(size <= MAX_TOTAL, "O conteúdo excede 512 MB. Esta versão suporta até 512 MB por backup.");
    }
    return size;
  }
  async function snapshotCurrent() {
    check(persist(), "Não foi possível guardar o estado atual. O backup foi interrompido.");
    const storage = readStorage(); validateStorage(storage);
    const media = await readMedia(); checkMedia(media);
    return { storage, media, createdAt: new Date().toISOString() };
  }
  async function digest(blob) {
    check(!!globalThis.crypto?.subtle, "Abre a app por HTTPS, localhost ou diretamente no teu navegador para verificar os ficheiros do backup.");
    const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("");
  }

  async function buildArchive(snapshot) {
    check(!!globalThis.fflate, "Falta vendor/fflate.js. Copia também a pasta vendor para a pasta da app.");
    const media = [];
    for (let i = 0; i < snapshot.media.length; i++) {
      const item = snapshot.media[i]; message(`A verificar ficheiro ${i + 1} de ${snapshot.media.length}…`);
      media.push({ id: item.id, week: item.week, name: item.name, type: item.type, size: item.blob.size, createdAt: item.createdAt || snapshot.createdAt, version: item.version || 1, file: `media/${String(i).padStart(6, "0")}.bin`, sha256: await digest(item.blob) });
      await pause();
    }
    const manifest = { app: "sauron", backupVersion: 1, exportedAt: snapshot.createdAt, storage: snapshot.storage, media };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    check(manifestBytes.length <= MAX_MANIFEST, "Os registos são demasiado grandes para este backup.");
    const chunks = []; let zipError; let finished = false;
    const zip = new fflate.Zip((error, chunk, final) => { if (error) zipError = error; else { chunks.push(chunk); if (final) finished = true; } });
    const addBytes = (name, bytes) => { const entry = new fflate.ZipPassThrough(name); zip.add(entry); entry.push(bytes, true); };
    addBytes("manifest.json", manifestBytes);
    addBytes("manifest.sha256", new TextEncoder().encode(await digest(new Blob([manifestBytes]))));
    for (let i = 0; i < media.length; i++) {
      message(`A incluir ficheiro ${i + 1} de ${media.length}…`);
      const entry = new fflate.ZipPassThrough(media[i].file); zip.add(entry);
      const blob = snapshot.media[i].blob;
      for (let offset = 0; offset < blob.size; offset += CHUNK) {
        entry.push(new Uint8Array(await blob.slice(offset, offset + CHUNK).arrayBuffer()), offset + CHUNK >= blob.size);
        if (zipError) throw zipError;
        await pause();
      }
    }
    zip.end(); if (zipError) throw zipError;
    check(finished, "Não foi possível terminar o ficheiro ZIP.");
    return new Blob(chunks, { type: "application/zip" });
  }

  async function parseArchive(file) {
    check(!!globalThis.fflate, "Falta vendor/fflate.js na pasta da app.");
    check(file.size > 0 && file.size <= MAX_TOTAL + MAX_MANIFEST + 4 * CHUNK, "Ficheiro vazio ou acima do limite de 512 MB de conteúdo.");
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    check(signature[0] === 0x50 && signature[1] === 0x4b && signature[2] === 3 && signature[3] === 4, "Escolhe o ZIP de dados criado em Backup → Descarregar backup completo. Um ZIP com o código da app não serve.");
    const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
    const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let directoryCount = null;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) !== 0x06054b50 || i + 22 + view.getUint16(i + 20, true) !== tail.length) continue;
      check(view.getUint16(i + 4, true) === 0 && view.getUint16(i + 6, true) === 0, "Não são suportados backups ZIP divididos em vários ficheiros.");
      directoryCount = view.getUint16(i + 10, true);
      check(directoryCount === view.getUint16(i + 8, true) && view.getUint32(i + 12, true) + view.getUint32(i + 16, true) === file.size - tail.length + i, "O índice do ZIP está danificado.");
      break;
    }
    check(directoryCount !== null && directoryCount <= MAX_FILES + 2, "O ZIP está incompleto ou tem demasiados ficheiros.");
    const entries = new Map(); let error; let total = 0;
    const unzip = new fflate.Unzip(entry => {
      try {
        check((entry.name === "manifest.json" || entry.name === "manifest.sha256") || /^media\/\d{6}\.bin$/.test(entry.name), "O ZIP contém ficheiros inesperados. Escolhe um backup completo do Sauron.");
        check(!entries.has(entry.name) && entries.size < MAX_FILES + 2, "O ZIP contém entradas repetidas ou demasiados ficheiros.");
        const result = { chunks: [], size: 0, complete: false }; entries.set(entry.name, result);
        entry.ondata = (err, data, final) => {
          if (error) return;
          if (err) { error = err; return; }
          result.size += data.length; total += data.length;
          if (total > MAX_TOTAL + MAX_MANIFEST || (entry.name === "manifest.json" && result.size > MAX_MANIFEST)) { error = new Error("O conteúdo descomprimido excede o limite permitido."); entry.terminate(); return; }
          result.chunks.push(data); result.complete = final;
        };
        entry.start();
      } catch (err) { error = err; }
    });
    unzip.register(fflate.UnzipInflate);
    for (let offset = 0; offset < file.size; offset += CHUNK) {
      unzip.push(new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer()), offset + CHUNK >= file.size);
      if (error) throw error;
      message(`A ler o backup… ${Math.min(100, Math.round((offset + CHUNK) / file.size * 100))}%`); await pause();
    }
    check(entries.size === directoryCount, "O índice do ZIP não corresponde ao conteúdo.");
    const manifestEntry = entries.get("manifest.json");
    check(manifestEntry?.complete && [...entries.values()].every(entry => entry.complete), "O ZIP está incompleto ou danificado.");
    const manifestBlob = new Blob(manifestEntry.chunks);
    const checksumEntry = entries.get("manifest.sha256");
    check(checksumEntry?.complete && checksumEntry.size === 64, "Falta a verificação dos registos no backup.");
    check(await digest(manifestBlob) === await new Blob(checksumEntry.chunks).text(), "Os registos do backup estão danificados. Nenhum dado foi importado.");
    const manifest = JSON.parse(await manifestBlob.text());
    check(manifest.app === "sauron" && manifest.backupVersion === 1, "Este ficheiro não é um backup completo compatível do Sauron.");
    validateStorage(manifest.storage);
    check(Array.isArray(manifest.media) && manifest.media.length <= MAX_FILES && entries.size === manifest.media.length + 2, "A lista de fotografias e vídeos não corresponde ao ZIP.");
    const paths = new Set(); const media = [];
    for (let i = 0; i < manifest.media.length; i++) {
      const item = manifest.media[i];
      check(object(item) && /^media\/\d{6}\.bin$/.test(item.file) && !paths.has(item.file) && /^[a-f0-9]{64}$/.test(item.sha256), "Índice de multimédia inválido.");
      paths.add(item.file); const entry = entries.get(item.file);
      check(entry && entry.size === item.size, "Falta um ficheiro ou o tamanho não corresponde ao backup.");
      const blob = new Blob(entry.chunks, { type: item.type });
      check(await digest(blob) === item.sha256, "Um ficheiro do backup está danificado. Nenhum dado foi importado.");
      media.push({ id: item.id, week: item.week, name: item.name, type: item.type, size: item.size, createdAt: item.createdAt, version: item.version || 1, blob });
      message(`A verificar ficheiro ${i + 1} de ${manifest.media.length}…`); await pause();
    }
    checkMedia(media);
    return { storage: manifest.storage, media, createdAt: manifest.exportedAt };
  }

  async function recovery(operation, data) {
    const db = await openDB(RECOVERY_DB);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("snapshots", operation === "get" ? "readonly" : "readwrite");
      const store = tx.objectStore("snapshots"); let request;
      try { request = operation === "get" ? store.get("previous") : store.put({ ...data, id: "previous" }); }
      catch (err) { tx.abort(); db.close(); reject(err); return; }
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error("Não foi possível guardar a cópia de segurança anterior. A importação foi interrompida.")); };
    });
  }
  function replaceStorage(values) {
    for (const key of Object.keys(readStorage())) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  }
  async function applySnapshot(snapshot) {
    validateStorage(snapshot.storage); checkMedia(snapshot.media);
    const before = readStorage(); const db = await openDB(MEDIA_DB);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("media", "readwrite"); const store = tx.objectStore("media");
      let localChanged = false; let failure;
      const rollback = () => {
        db.close();
        try { if (localChanged) replaceStorage(before); }
        catch { reject(new Error("A operação falhou e o navegador não conseguiu repor os registos. Usa «Recuperar antes da última importação»; a cópia anterior está guardada.")); return; }
        reject(failure || tx.error || new Error("A importação foi interrompida. Os dados anteriores foram mantidos."));
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = rollback;
      // Only change localStorage once every media write has succeeded. An error in
      // localStorage aborts this same transaction; a later abort restores the keys.
      const writeStorage = () => {
        try { localChanged = true; replaceStorage(snapshot.storage); }
        catch (err) { failure = err; tx.abort(); }
      };
      try {
        const clear = store.clear();
        let remaining = snapshot.media.length;
        if (!remaining) clear.onsuccess = writeStorage;
        for (const item of snapshot.media) {
          const request = store.put(item);
          request.onsuccess = () => { if (--remaining === 0) writeStorage(); };
        }
      } catch (err) { failure = err; tx.abort(); }
    });
  }
  function summary(snapshot) {
    const main = validateStorage(snapshot.storage); const water = snapshot.storage[WATER_KEY] ? JSON.parse(snapshot.storage[WATER_KEY]) : { days: {} };
    const healthCount = ["records", "visits", "diary", "screenings", "medications", "documents", "vets"].reduce((sum, key) => sum + main.health[key].length, 0);
    return [ `${main.weights.length} ${plural(main.weights.length, "pesagem", "pesagens")}`, `${healthCount} registos de saúde`, `${main.foods.length} alimentos · ${main.plans.length} planos`, `${Object.keys(main.snackDays).length} dias de snacks`, `${main.training.sessions.length} ${plural(main.training.sessions.length, "sessão de treino", "sessões de treino")}`, `${Object.keys(water.days).length} ${plural(Object.keys(water.days).length, "dia com registo de água", "dias com registo de água")}`, `${Object.keys(main.memories?.notes || {}).length} ${plural(Object.keys(main.memories?.notes || {}).length, "semana com notas", "semanas com notas")}`, `${snapshot.media.length} fotografias/vídeos · ${bytesLabel(snapshot.media.reduce((sum, item) => sum + item.blob.size, 0))}` ];
  }
  function showPreview(snapshot, isRecovery) {
    const list = document.createElement("ul"); list.className = "backup-preview";
    const date = new Date(snapshot.createdAt);
    const lines = [ Number.isFinite(date.getTime()) ? `Cópia de ${date.toLocaleString("pt-PT")}` : "Data da cópia não indicada", ...summary(snapshot) ];
    for (const text of lines) { const li = document.createElement("li"); li.textContent = text; list.append(li); }
    $b("fullBackupPreview").replaceChildren(list);
    message(isRecovery ? "Esta recuperação substitui os dados atuais pelos dados guardados antes da última importação. Confirma se é a cópia pretendida." : "Confere os dados. Ao confirmar, os dados atuais serão substituídos. Será guardada uma cópia anterior para recuperação neste navegador.");
    $b("confirmFullBackup").hidden = false;
    $b("confirmFullBackup").textContent = isRecovery ? "Recuperar estes dados" : "Substituir os dados deste navegador";
    $b("closeFullBackupDialog").textContent = "Cancelar";
    setBusy(false);
  }

  async function render() {
    const counts = $b("backupCounts"); counts.replaceChildren();
    try {
      const main = JSON.parse(localStorage.getItem(APP_KEY) || "{}");
      const media = await readMedia();
      for (const text of [`${(main.weights || []).length} pesagens`, `${media.length} fotografias/vídeos`, bytesLabel(media.reduce((sum, item) => sum + item.blob.size, 0))]) {
        const chip = document.createElement("span"); chip.textContent = text; counts.append(chip);
      }
      const previous = await recovery("get");
      $b("restorePreviousBackup").disabled = !previous;
      $b("backupRecoveryInfo").textContent = previous ? `Cópia anterior guardada em ${new Date(previous.savedAt).toLocaleString("pt-PT")}.` : "Ainda não foi feita nenhuma importação neste navegador.";
    } catch (err) { $b("fullBackupStatus").textContent = `Não foi possível ler o armazenamento: ${err.message || "erro do navegador"}`; }
  }
  $b("exportFullBackup").addEventListener("click", async () => {
    if (busy) return; pending = null; showDialog("A preparar o backup", "A reunir os registos e os ficheiros…"); setBusy(true);
    try {
      const snapshot = await snapshotCurrent(); const archive = await buildArchive(snapshot);
      const url = URL.createObjectURL(archive); const link = document.createElement("a");
      link.href = url; link.download = `Sauron_Backup_Completo_${today()}_${new Date().toISOString().slice(11, 19).replaceAll(":", "-")}.zip`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      message("O download do ZIP foi iniciado. Confirma que o ficheiro ficou guardado antes de fechar. Na outra versão da app, abre Backup → Escolher backup ZIP e seleciona este ficheiro.");
      $b("fullBackupStatus").textContent = "Download iniciado. Guarda o ZIP para transferir ou recuperar os dados.";
      setBusy(false); $b("closeFullBackupDialog").textContent = "Fechar";
    } catch (err) { showError(err); }
  });
  $b("importFullBackup").addEventListener("click", () => { if (!busy) $b("fullBackupFile").click(); });
  $b("fullBackupFile").addEventListener("change", async event => {
    const file = event.target.files[0]; event.target.value = "";
    if (!file || busy) return;
    pending = null; showDialog("Rever backup", "A ler e verificar o backup…"); setBusy(true);
    try { const snapshot = await parseArchive(file); pending = { snapshot, isRecovery: false }; showPreview(snapshot, false); }
    catch (err) { showError(err); }
  });
  $b("restorePreviousBackup").addEventListener("click", async () => {
    if (busy) return; pending = null; showDialog("Recuperar dados anteriores", "A abrir a cópia anterior…"); setBusy(true);
    try {
      const snapshot = await recovery("get"); check(!!snapshot, "Não existe uma cópia anterior neste navegador.");
      validateStorage(snapshot.storage); checkMedia(snapshot.media);
      pending = { snapshot, isRecovery: true }; showPreview(snapshot, true);
    } catch (err) { showError(err); }
  });
  $b("confirmFullBackup").addEventListener("click", async () => {
    if (!pending || busy) return;
    const { snapshot, isRecovery } = pending; setBusy(true); message("A guardar a cópia anterior e a aplicar os dados. Não feches a página…");
    try {
      const before = await snapshotCurrent();
      if (!isRecovery) await recovery("put", { ...before, savedAt: new Date().toISOString() });
      await applySnapshot(snapshot); pending = null;
      // Reload prevents the main app's old in-memory state from overwriting imported data.
      setBusy(false); location.reload();
    } catch (err) { showError(err); render(); }
  });
  $b("closeFullBackupDialog").addEventListener("click", () => { if (!busy) { pending = null; $b("fullBackupPreview").replaceChildren(); $b("fullBackupDialog").close(); } });
  $b("fullBackupDialog").addEventListener("cancel", event => { if (busy) event.preventDefault(); else { pending = null; $b("fullBackupPreview").replaceChildren(); } });
  window.addEventListener("beforeunload", event => { if (busy) { event.preventDefault(); event.returnValue = ""; } });
  return { render };
})();
