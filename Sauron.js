"use strict";

    const $ = id => document.getElementById(id);
    const STORAGE_KEY = "sauron-nutrition-v3";
    const BIRTH = "2026-07-18";
    const DAY = 86400000;

    const DEFAULT_FOODS = [
      {
        id: "dry-proplan",
        name: "Pro Plan Healthy Start Kitten · Frango",
        type: "dry",
        kcal: 400,
        protein: 40,
        fat: 20,
        moisture: 6,
        taurine: 1779,
        calcium: null,
        phosphorus: null,
        status: "estimated",
        url: null
      },
      {
        id: "wet-carny",
        name: "Animonda Carny Kitten · receita genérica",
        type: "wet",
        kcal: 110,
        protein: 10.5,
        fat: 6.4,
        moisture: 80,
        taurine: null,
        calcium: null,
        phosphorus: null,
        status: "estimated",
        url: null
      },
      {
        id: "wet-mousse",
        name: "Pro Plan Healthy Start Kitten · mousse frango",
        type: "wet",
        kcal: 115,
        protein: 13,
        fat: 7,
        moisture: 75,
        taurine: null,
        calcium: null,
        phosphorus: null,
        status: "estimated",
        url: "https://goldpet.pt/alimentos-humidos/32781-42422-pro-plan-healthy-start-kitten-pate-para-gatinho-frango.html#/quantidade-24_x_85_g"
      },
      {
        id: "wet-turkey",
        name: "Pro Plan Healthy Start Kitten · peru em molho",
        type: "wet",
        kcal: 90,
        protein: 12.5,
        fat: 4,
        moisture: 78,
        taurine: null,
        calcium: null,
        phosphorus: null,
        status: "estimated",
        url: null
      }
    ];

    let foods = [];
    let weights = [];
    let plans = [];
    let savedSettings = {};
    let editingId = null;
    let chartRange = "all";
    let memories = { version: 1, notes: {} };
    let health = { records: [], visits: [], vets: [], identity: null, genetic: { fatherName: "Thor Monterrey*PT", fatherLab: "LABOKLIN", fatherDate: "2024-05-24", motherName: "Alexa Monterrey*PT", motherLab: "LABOKLIN", motherDate: "2024-06-20", results: [] }, documents: [], diary: [], screenings: [], medications: [] };
    let healthEditingId = null;
    let visitEditingId = null;
    let documentEditingId = null;
    let diaryEditingId = null;
    let screeningEditingId = null;
    let medicationEditingId = null;
    let vetEditingId = null;
    let geneticResultEditingId = null;

    function fmt(value, decimals = 0) {
      return Number(value).toLocaleString("pt-PT", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    }

    function plural(n, singular, pluralForm) {
      return n === 1 ? singular : pluralForm;
    }

    function today() {
      const date = new Date();

      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
      ].join("-");
    }

    function validDate(value) {
      if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
      ) {
        return false;
      }

      const date = new Date(value + "T12:00:00");

      return (
        Number.isFinite(date.getTime()) &&
        date.getFullYear() === Number(value.slice(0, 4)) &&
        date.getMonth() + 1 === Number(value.slice(5, 7)) &&
        date.getDate() === Number(value.slice(8, 10))
      );
    }

    function dateStamp(value) {
      const [year, month, day] = value.split("-").map(Number);
      return Date.UTC(year, month - 1, day);
    }

    function displayDate(value) {
      if (!validDate(value)) return "—";

      return new Date(value + "T12:00:00")
        .toLocaleDateString("pt-PT");
    }

    function makeId() {
      return globalThis.crypto?.randomUUID?.() ||
        Date.now() + "-" + Math.random().toString(36).slice(2);
    }

    function status(message) {
    const box = $("appStatus");
    box.replaceChildren();

    if (!message) return;

    const text = document.createElement("span");
    text.textContent = message;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "status-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Fechar aviso");

    close.addEventListener("click", () => {
        box.replaceChildren();
    });

    box.append(text, close);
    }

    function makeCell(value) {
      const cell = document.createElement("td");
      cell.textContent = value;
      return cell;
    }

    function emptyRow(body, columns, message) {
      const row = document.createElement("tr");
      const cell = makeCell(message);

      cell.colSpan = columns;
      row.append(cell);
      body.append(row);
    }

    function getFood(id) {
      return foods.find(food => food.id === id);
    }

    function isKnown(value) {
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0
      );
    }

    function validFood(food) {
    if (!food) return false;

    if (
        Object.prototype.hasOwnProperty.call(food, "taurineDeclared") &&
        !["added", "total"].includes(food.taurineKind)
    ) return false;

    if (
        food.type === "snack" &&
        !["wet", "dry"].includes(food.snackFormat)
    ) return false;

    if (
        ["calcium", "phosphorus"].some(field =>
        isKnown(food[field]) && food[field] > 100
        )
    ) return false;

    const validComposition = ["protein", "fat", "moisture"].every(
        field => (
        food.type === "snack" &&
        food[field] == null
        ) || (
        isKnown(food[field]) &&
        food[field] <= 100
        )
    );

    return (
        typeof food.id === "string" &&
        typeof food.name === "string" &&
        food.name.trim() !== "" &&
        ["wet", "dry", "snack"].includes(food.type) &&
        isKnown(food.kcal) &&
        food.kcal > 0 &&
        validComposition &&
        [
        "taurine",
        "taurineDeclared",
        "taurineNatural",
        "calcium",
        "phosphorus"
        ].every(field =>
        food[field] == null || isKnown(food[field])
        )
    );
    }

    function loadData() {
      let stored = {};

      try {
        const parsed = JSON.parse(
          localStorage.getItem(STORAGE_KEY) || "{}"
        );

        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          stored = parsed;
        }
      } catch (error) {
        status("Não foi possível ler os dados guardados.");
      }

      snackDays =
        stored.snackDays &&
        typeof stored.snackDays === "object" &&
        !Array.isArray(stored.snackDays)
            ? stored.snackDays
            : {};

      loadTraining(stored.training);

      health = migrateHealth(stored.health);
      memories = { version: 1, notes: Object.fromEntries(
        Object.entries(stored.memories?.notes || {}).filter(([key, value]) => validDate(key) && typeof value === "string")
      ) };

      foods = Array.isArray(stored.foods)
        ? stored.foods.filter(validFood)
        : [];

      // Backfill url from DEFAULT_FOODS for seeded items that predate this field.
      for (const food of foods) {
        if (food.url == null) {
          const seed = DEFAULT_FOODS.find(d => d.id === food.id);
          if (seed?.url) food.url = seed.url;
        }
      }

      for (const type of ["wet", "dry"]) {
        if (!foods.some(food => food.type === type)) {
          for (const food of DEFAULT_FOODS) {
            if (food.type !== type) continue;

            const copy = { ...food };

            if (foods.some(item => item.id === copy.id)) {
              copy.id = makeId();
            }

            foods.push(copy);
          }
        }
      }

      weights = Array.isArray(stored.weights)
        ? stored.weights.filter(
            item =>
              item &&
              validDate(item.date) &&
              isKnown(item.weight) &&
              item.weight > 0 &&
              item.weight <= 20
          ).map(item => ({
            ...item,
            id: item.id ?? makeId()
          }))
        : [];

      plans = Array.isArray(stored.plans)
        ? stored.plans.filter(
            item =>
              item &&
              validDate(item.date) &&
              ["w", "wet", "dry", "total"].every(
                field => isKnown(item[field])
              )
          )
        : [];

      savedSettings =
        stored.settings &&
        typeof stored.settings === "object"
          ? stored.settings
          : {};
    }

    function getSettings() {
      return {
        weight: $("weight").value,
        factor: $("factor").value,
        nutrientProfile: $("nutrientProfile").value,
        customCal: $("customCal").value,
        wetType: $("wetType").value,
        dryType: $("dryType").value,
        wet: $("wet").value
      };
    }

    function persist() {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            foods,
            weights,
            plans,
            snackDays,
            training,
            health,
            memories,
            settings: getSettings()
            })
        );

        return true;
      } catch (error) {
        status(
          "Não foi possível guardar. " +
          "O armazenamento deste navegador está indisponível ou cheio."
        );

        return false;
      }
    }

    function restoreSettings() {
    const weight = Number(savedSettings.weight);

    if (
        Number.isFinite(weight) &&
        weight >= 0.5 &&
        weight <= 12
    ) {
        $("weight").value = String(weight);
    }

    $("weightInput").value = $("weight").value;

    // Recupera o fator apenas se existir no seletor atual.
    const savedFactor = String(savedSettings.factor ?? "");

    const factorExists = Array.from(
        $("factor").options
    ).some(option => option.value === savedFactor);

    if (factorExists) {
        $("factor").value = savedFactor;
    }

    // Recupera o perfil nutricional.
    const savedProfile = String(
        savedSettings.nutrientProfile ?? ""
    );

    const profileExists = Array.from(
        $("nutrientProfile").options
    ).some(option => option.value === savedProfile);

    if (profileExists) {
        $("nutrientProfile").value = savedProfile;
    }

    // Recupera a meta energética manual.
    const manual = Number(savedSettings.customCal);

    $("customCal").value =
        Number.isFinite(manual) && manual > 0
        ? String(manual)
        : "";

    // Recupera a quantidade de húmida.
    // calculate() ajustará depois o máximo à meta energética.
    const wet = Number(savedSettings.wet);

    if (
        savedSettings.wet != null &&
        Number.isFinite(wet) &&
        wet >= 0
    ) {
        $("wet").max = String(Math.max(400, wet));
        $("wet").value = String(wet);
    }

    // Prepara o formulário de pesagem.
    $("logDate").value = today();
    $("logDate").min = BIRTH;
    $("logDate").max = today();
    $("logWeight").value = $("weight").value;
    }

    function getAge() {
      const now = today();

      const totalDays = Math.max(
        0,
        Math.floor((dateStamp(now) - dateStamp(BIRTH)) / DAY)
      );

      const birth = new Date(BIRTH + "T12:00:00");
      const current = new Date(now + "T12:00:00");

      let months =
        (current.getFullYear() - birth.getFullYear()) * 12 +
        current.getMonth() -
        birth.getMonth();

      if (current.getDate() < birth.getDate()) {
        months--;
      }

      months = Math.max(0, months);

      return {
        months,
        years: Math.floor(months / 12),
        weeks: Math.floor(totalDays / 7),
        days: totalDays % 7
      };
    }

    function renderAge() {
      const age = getAge();
      const remainingMonths = age.months % 12;

      $("ageTop").textContent = age.years > 0
        ? `${age.years} ${plural(age.years, "ano", "anos")} e ${remainingMonths} ${plural(remainingMonths, "mês", "meses")}`
        : `${age.months} ${plural(age.months, "mês", "meses")}`;

      $("weeksTop").textContent =
        `${age.weeks} ${plural(age.weeks, "semana", "semanas")} e ${age.days} ${plural(age.days, "dia", "dias")}`;

      $("ageWeeks").textContent = `${age.weeks} ${plural(age.weeks, "semana", "semanas")}`;
    }

    function renderFoodSelects() {
      const selectedWet =
        $("wetType").value || savedSettings.wetType;

      const selectedDry =
        $("dryType").value || savedSettings.dryType;

      $("wetType").replaceChildren();
      $("dryType").replaceChildren();

      for (const food of foods) {
        if (food.type === "snack") continue;
        const option = document.createElement("option");

        option.value = food.id;
        option.textContent =
          food.name +
          (food.status === "label" ? "" : "");

        const select = food.type === "wet"
          ? $("wetType")
          : $("dryType");

        select.append(option);
      }

      if (getFood(selectedWet)?.type === "wet") {
        $("wetType").value = selectedWet;
      }

      if (getFood(selectedDry)?.type === "dry") {
        $("dryType").value = selectedDry;
      }
    }

    function automaticFactor(months) {
    if (months < 4) return 2.5;
    if (months < 6) return 2.25;
    if (months < 9) return 2.0;
    if (months < 12) return 1.75;

    // Transição: ajustar ao crescimento e condição corporal
    if (months < 18) return 1.6;
    if (months < 24) return 1.4;

    // Adulto esterilizado: estimativa de manutenção
    return 1.2;
    }

    let snackDays = {};

function snackItems() {
  const entries = snackDays[today()];

  if (!Array.isArray(entries)) return [];

  return entries.flatMap(entry => {
    if (
      !entry ||
      !["planned", "extra"].includes(entry.mode)
    ) return [];

    const food = getFood(entry.foodId);

    if (
      !food ||
      food.type !== "snack" ||
      !Number.isFinite(entry.grams) ||
      entry.grams <= 0
    ) return [];

    return [{
      ...entry,
      food,
      energy: entry.grams * food.kcal / 100
    }];
  });
}

function foodPortions(result) {
  return [
    [result.wf, result.wet],
    [result.df, result.dry],
    ...result.snacks.map(item => [item.food, item.grams])
  ].filter(([, grams]) => grams > 0);
}

function dryAmountEstimated(result) {
  return (
    fieldEstimated(result.df, "kcal") ||
    (
      result.wet > 0 &&
      fieldEstimated(result.wf, "kcal")
    ) ||
    result.snacks.some(item =>
      item.mode === "planned" &&
      fieldEstimated(item.food, "kcal")
    )
  );
}

function referenceForPlan(result) {
  const reference = referenceFor(result.goal);

  let totalEnergy = 0;
  let weightedRate = 0;

  for (const [food, grams] of foodPortions(result)) {
    const energy = grams * food.kcal / 100;

    if (!Number.isFinite(energy) || energy <= 0) continue;

    const format = food.type === "snack"
      ? food.snackFormat
      : food.type;

    // Formato desconhecido: usa provisoriamente
    // a referência superior, em vez de assumir seca.
    const rate = format === "dry"
      ? reference.rates.taurineDry
      : reference.rates.taurineWet;

    totalEnergy += energy;
    weightedRate += energy * rate;
  }

  // As porções definem a proporção da mistura.
  // A meta energética define a base diária.
  const mixtureRate = totalEnergy > 0
    ? weightedRate / totalEnergy
    : Math.max(
        reference.rates.taurineDry,
        reference.rates.taurineWet
      );

  reference.targets.taurineMix =
    reference.goal * mixtureRate / 1000;

  return reference;
}

function syncSnackFields() {
  const isSnack = $("fType").value === "snack";

  $("snackFormatField").hidden = !isSnack;

  if (!["wet", "dry"].includes($("fSnackFormat").value)) {
    $("fSnackFormat").value = "dry";
  }

  for (const id of ["fProtein", "fFat", "fMoisture"]) {
    $(id).required = !isSnack;
    $(id).placeholder = isSnack ? "Desconhecido" : "";
  }
}

function renderSnacks(result) {
  const select = $("snackFood");
  const selected = select.value;

  select.replaceChildren();

  for (const food of foods.filter(item => item.type === "snack")) {
    const option = document.createElement("option");
    option.value = food.id;
    option.textContent = food.name;
    select.append(option);
  }

  if ([...select.options].some(option => option.value === selected)) {
    select.value = selected;
  }

  $("addSnackButton").disabled = select.options.length === 0;

  const body = $("snackRows");
  body.replaceChildren();

  if (!result.snacks.length) {
    emptyRow(body, 5, "Nenhum snack adicionado hoje.");
  }

  for (const item of result.snacks) {
    const row = document.createElement("tr");

    const energy = fmt(item.energy, 1) +
      (fieldEstimated(item.food, "kcal") ? "*" : "") +
      " kcal";

    for (const value of [
      item.food.name,
      fmt(item.grams, 1) + " g",
      energy,
      item.mode === "planned" ? "Planeado" : "Extra registado"
    ]) {
      row.append(makeCell(value));
    }

    const cell = document.createElement("td");
    const button = document.createElement("button");

    button.type = "button";
    button.className = "ghost";
    button.textContent = "Remover";

    button.addEventListener("click", () => {
      snackDays[today()] = snackItems()
        .filter(entry => entry.id !== item.id)
        .map(({id, foodId, grams, mode}) => ({
          id, foodId, grams, mode
        }));

      renderPlan();
      persist();
    });

    cell.append(button);
    row.append(cell);
    body.append(row);
  }

  const estimated = result.snacks.some(item =>
    fieldEstimated(item.food, "kcal")
  );

  $("snackSummary").textContent =
    "Total de snacks: " + fmt(result.snackEnergy, 1) +
    (estimated ? "*" : "") + " kcal";
}

    function addSnack(event) {
    event.preventDefault();

    const food = getFood($("snackFood").value);
    const grams = Number($("snackGrams").value);
    const mode = "extra";

    if (
        !food ||
        food.type !== "snack" ||
        !Number.isFinite(grams) ||
        grams <= 0 ||
        !["planned", "extra"].includes(mode)
    ) return;

    const entries = snackItems().map(
        ({id, foodId, grams, mode}) => ({
        id, foodId, grams, mode
        })
    );

    entries.push({
        id: makeId(),
        foodId: food.id,
        grams,
        mode
    });

    snackDays[today()] = entries;

    renderPlan();
    persist();
    }

    function calculate() {
    const age = getAge();
    const w = Number($("weight").value);
    let wet = Number($("wet").value);

    const factor = $("factor").value === "auto"
        ? automaticFactor(age.months)
        : Number($("factor").value);

    const rer = 70 * Math.pow(w, 0.75);
    const manual = Number($("customCal").value);

    const goal = Number.isFinite(manual) && manual > 0
        ? manual
        : rer * factor;

    const wf = getFood($("wetType").value);
    const df = getFood($("dryType").value);

    if (!wf || !df) return null;

    const snacks = snackItems();

    const snackEnergy = snacks.reduce(
        (sum, item) => sum + item.energy,
        0
    );

    const plannedSnackEnergy = snacks
        .filter(item => item.mode === "planned")
        .reduce((sum, item) => sum + item.energy, 0);

    const mealGoal = Math.max(0, goal - plannedSnackEnergy);

    const slider = $("wet");
    const step = Number(slider.step) || 5;

    const maxWet = Math.max(
        0,
        Math.floor(
        (mealGoal * 100 / wf.kcal + 1e-9) / step
        ) * step
    );

    slider.max = String(maxWet);

    wet = Math.min(
        Math.max(0, Number.isFinite(wet) ? wet : 0),
        maxWet
    );

    slider.value = String(wet);
    wet = Number(slider.value);

    $("wetMaxLabel").textContent = fmt(maxWet) + " g";

    const wetEnergy = wet * wf.kcal / 100;

    const dry = Math.max(
        0,
        (mealGoal - wetEnergy) * 100 / df.kcal
    );

    const dryEnergy = dry * df.kcal / 100;

    return {
        w,
        wet,
        dry,
        total: wetEnergy + dryEnergy + snackEnergy,
        wetEnergy,
        dryEnergy,
        factor,
        rer,
        goal,
        wf,
        df,
        snacks,
        snackEnergy,
        plannedSnackEnergy
    };
    }

    function fieldEstimated(food, field) {
  return food.estimates?.[field] ??
    (food.status !== "label");
}

function taurineParts(food) {
  const updated = Object.prototype.hasOwnProperty.call(
    food,
    "taurineDeclared"
  );

  return {
    kind: updated ? food.taurineKind : "total",

    declared: updated
      ? food.taurineDeclared
      : food.taurine,

    natural: updated
      ? food.taurineNatural
      : null,

    estimated: updated
      ? fieldEstimated(food, "taurineDeclared")
      : fieldEstimated(food, "taurine")
  };
}

function taurineInfo(food) {
  const part = taurineParts(food);

  const declaredKnown = isKnown(part.declared);

  const naturalKnown =
    part.kind === "added" &&
    isKnown(part.natural);

  return {
    value:
      (declaredKnown ? part.declared : 0) +
      (naturalKnown ? part.natural : 0),

    known: declaredKnown || naturalKnown,

    complete: part.kind === "total"
      ? declaredKnown
      : declaredKnown && naturalKnown,

    estimated:
      (declaredKnown && part.estimated) ||
      naturalKnown
  };
}

function displayValue(info, digits = 0, unit = "") {
  if (!info.known) return "—";

  return (
    fmt(info.value, digits) +
    unit +
    (info.estimated ? "*" : "") +
    (info.complete === false ? " (parcial)" : "")
  );
}

function foodValue(food, field, digits = 0, unit = "") {
  return displayValue({
    value: food[field],
    known: isKnown(food[field]),
    estimated: fieldEstimated(food, field)
  }, digits, unit);
}

const SOURCE_FIELDS = {
  fKcal: "kcal",
  fProtein: "protein",
  fFat: "fat",
  fMoisture: "moisture",
  fCalcium: "calcium",
  fPhosphorus: "phosphorus",
  fTaurineDeclared: "taurineDeclared"
};

function setupFoodEstimates(food) {
  for (const [inputId, field] of Object.entries(SOURCE_FIELDS)) {
    const checkboxId = inputId + "Estimated";
    let checkbox = $(checkboxId);

    if (!checkbox) {
      const label = document.createElement("label");
      label.className = "source-toggle";

      checkbox = document.createElement("input");
      checkbox.id = checkboxId;
      checkbox.type = "checkbox";

      label.append(checkbox, "Estimado");
      $(inputId).parentElement.append(label);
    }

    checkbox.checked = field === "taurineDeclared"
      ? (editingId ? taurineParts(food).estimated : false)
      : fieldEstimated(food, field);
  }
}

function readTaurineForm() {
  const optional = id =>
    $(id).value.trim() === ""
      ? null
      : Number($(id).value);

  return {
    taurineKind: $("fTaurineKind").value,
    taurineDeclared: optional("fTaurineDeclared"),

    taurineNatural: $("fTaurineKind").value === "added"
      ? optional("fTaurineNatural")
      : null,

    estimates: {
      taurineDeclared:
        $("fTaurineDeclaredEstimated").checked
    }
  };
}

function updateTaurinePreview() {
  $("fTaurineNatural").disabled =
    $("fTaurineKind").value === "total";

  $("fTaurine").value =
    displayValue(taurineInfo(readTaurineForm()));
}

    function nutrient(result, field, divisor = 100) {
  let value = 0;
  let complete = true;
  let estimated = false;
  let known = false;

  for (const [food, grams] of foodPortions(result)) {
    const info = field === "taurine"
      ? taurineInfo(food)
      : {
          value: food[field],
          known: isKnown(food[field]),
          complete: isKnown(food[field]),
          estimated: fieldEstimated(food, field)
        };

    if (info.known) {
      value += grams * info.value / divisor;
      known = true;

      estimated = estimated ||
        info.estimated ||
        (
          food === result.df &&
          dryAmountEstimated(result)
        );
    }

    complete = complete && info.complete;
  }

  return {value, complete, estimated, known};
}

    // FEDIAF 2025, table III-4b, page 19. Protein/fat/Ca/P: g per 1000 kcal.
    // Taurine: mg per 1000 kcal. These are food-profile references, not prescriptions.
    const NUTRIENT_PROFILES = {
      growth: {
        name: "Crescimento", protein: 70, fat: 22.5,
        calcium: 2.5, phosphorus: 2.1,
        taurineDry: 250, taurineWet: 630, ratioMin: 1, ratioMax: 1.5
      },
      adult75: {
        name: "Adulto · menor necessidade energética (75)", protein: 83.3, fat: 22.5,
        calcium: 1.33, phosphorus: 0.85,
        taurineDry: 330, taurineWet: 670, ratioMin: 1, ratioMax: 2
      },
      adult100: {
        name: "Adulto · necessidade energética padrão (100)", protein: 62.5, fat: 22.5,
        calcium: 1, phosphorus: 0.64,
        taurineDry: 250, taurineWet: 500, ratioMin: 1, ratioMax: 2
      }
    };

    function referenceFor(goal) {
      const choice = $("nutrientProfile").value;
      const key = choice === "auto"
        ? (getAge().months < 12 ? "growth" : "adult75")
        : choice;
      const rates = NUTRIENT_PROFILES[key] || NUTRIENT_PROFILES.growth;
      const targets = {};
      for (const field of ["protein", "fat", "calcium", "phosphorus", "taurineDry", "taurineWet"]) {
        targets[field] = rates[field] * goal / 1000;
      }
      return {key, name: rates.name, goal, rates, targets};
    }

    function comparison(info, target) {
      if (!info.known) return {text: "Sem dados", state: "unknown"};
      if (!info.complete) return {text: "Dados incompletos", state: "unknown"};
      const reached = info.value + 1e-9 >= target;
      return {
        text: (info.estimated ? "Estimativa " : "") + (reached ? "≥ referência" : "< referência"),
        state: info.estimated ? "estimated" : (reached ? "reached" : "below")
      };
    }

    function setReading(id, reading) {
      $(id).textContent = reading.text;
      $(id).dataset.state = reading.state;
    }

    function renderReference(reference) {
      const age = getAge();
      $("referenceSummary").textContent =
        `${fmt(Number($("weight").value), 1)} kg · ${age.months} ${plural(age.months, "mês", "meses")} · ` +
        `${reference.name} · meta de ${fmt(reference.goal)} kcal/dia.`;
      $("profileNote").textContent = $("nutrientProfile").value === "auto"
        ? "Regra da app: crescimento até 12 meses; depois adulto (75). Revê a fase com o veterinário, sobretudo na transição do Maine Coon."
        : "Perfil selecionado manualmente. A idade e o peso continuam a entrar na estimativa de energia; o perfil define os níveis nutricionais de referência.";
      const body = $("referenceRows");
      body.replaceChildren();
      const rows = [
        ["Energia · meta estimada", "≈ " + fmt(reference.goal) + " kcal"],
        ["Proteína · mínimo de referência", "≥ " + fmt(reference.targets.protein, 1) + " g"],
        ["Gordura · mínimo de referência", "≥ " + fmt(reference.targets.fat, 1) + " g"],
        ["Taurina · referência estimada da mistura","≈ " + fmt(reference.targets.taurineMix) + " mg"],
        ["Cálcio · mínimo de referência", "≥ " + fmt(reference.targets.calcium, 2) + " g"],
        ["Fósforo · mínimo de referência", "≥ " + fmt(reference.targets.phosphorus, 2) + " g"],
        ["Rácio Ca:P", fmt(reference.rates.ratioMin, 1) + ":1 a " + fmt(reference.rates.ratioMax, 1) + ":1"]
      ];
      for (const [label, value] of rows) {
        const row = document.createElement("tr");
        const heading = document.createElement("th");
        heading.scope = "row";
        heading.textContent = label;
        row.append(heading, makeCell(value));
        body.append(row);
      }
    }

    function renderNutritionPanels(result) {
      // The reference depends on the energy goal and selected life-stage only.
      const reference = referenceForPlan(result);
        renderReference(reference);
      const values = {};
      for (const field of ["protein", "fat", "moisture", "taurine", "calcium", "phosphorus"]) {
        values[field] = nutrient(result, field, field === "taurine" ? 1000 : 100);
      }
      const used = foodPortions(result);      
      const energyEstimated = used.some(([food]) => fieldEstimated(food, "kcal"));
      const energyMark = energyEstimated ? "*" : "";
      $("calories").textContent = fmt(result.total) + energyMark;
      $("totalCalories").textContent = fmt(result.total) + energyMark;
      $("totalGrams").textContent = fmt(result.wet + result.dry + result.snacks.reduce((sum, item) => sum + item.grams, 0)) + (result.dry > 0 && dryAmountEstimated(result) ? "*" : "");
      $("dryGrams").textContent = fmt(result.dry) + (result.dry > 0 && dryAmountEstimated(result) ? "*" : "");
      $("wetEnergy").textContent = "≈ " + fmt(result.wetEnergy) + (result.wet > 0 && fieldEstimated(result.wf, "kcal") ? "*" : "") + " kcal";
      $("dryEnergy").textContent = "≈ " + fmt(result.dryEnergy) + (result.dry > 0 && energyEstimated ? "*" : "") + " kcal";
      $("protein").textContent = displayValue(values.protein, 1);
      $("fat").textContent = displayValue(values.fat, 1);
      $("water").textContent = displayValue(values.moisture);
      $("taurine").textContent = displayValue(values.taurine);
      $("calcium").textContent = displayValue(values.calcium, 2);
      $("phosphorus").textContent = displayValue(values.phosphorus, 2);

      const energyDelta = result.total - reference.goal;
      setReading("checkEnergy", {
        text: (energyEstimated ? "Estimativa · " : "") +
          (Math.abs(energyDelta) < 0.5 ? "≈ meta" : energyDelta > 0 ? "Acima da meta" : "Abaixo da meta"),
        state: energyEstimated ? "estimated" : "neutral"
      });
      for (const [field, id] of [
        ["protein", "checkProtein"], ["fat", "checkFat"],
        ["calcium", "checkCalcium"], ["phosphorus", "checkPhosphorus"]
      ]) setReading(id, comparison(values[field], reference.targets[field]));

      // A mixed ration has no single fixed taurine threshold in the reference panel.
      // Compare each food against its own format's energy-normalised reference.
     const taurineTotal = values.taurine;
        const taurineTarget = reference.targets.taurineMix;

        if (!taurineTotal.known) {
        setReading("checkTaurine", {
            text: "Sem dados de taurina",
            state: "unknown"
        });

        } else if (!taurineTotal.complete) {
        setReading("checkTaurine", {
            text: "Total por confirmar · dados incompletos",
            state: "unknown"
        });

        } else {
        const reached = taurineTotal.value + 1e-9 >= taurineTarget;

        setReading("checkTaurine", {
            text: "Comparação estimada · " + (
            reached
                ? "≥ referência da mistura"
                : "< referência da mistura"
            ),
            state: "estimated"
        });
        }

      const ca = values.calcium, p = values.phosphorus;
      if (ca.complete && p.complete && ca.known && p.known && p.value > 0) {
        const ratio = ca.value / p.value;
        const estimated = ca.estimated || p.estimated;
        $("ratio").textContent = fmt(ratio, 2) + ":1" + (estimated ? "*" : "");
        const inRange = ratio >= reference.rates.ratioMin - 1e-9 && ratio <= reference.rates.ratioMax + 1e-9;
        setReading("checkRatio", {
          text: (estimated ? "Estimativa · " : "") + (inRange ? "No intervalo" : "Fora do intervalo"),
          state: estimated ? "estimated" : inRange ? "reached" : "below"
        });
      } else {
        $("ratio").textContent = "—";
        setReading("checkRatio", {text: "Sem rácio calculável", state: "unknown"});
      }
      const notes = [];
      if (result.wetEnergy > result.goal) notes.push("A húmida ultrapassa a meta energética; a seca calculada é zero.");
      if (Object.values(values).some(info => !info.complete)) notes.push("Faltam dados nas fichas: os totais parciais não permitem concluir que existe uma carência.");
      if (energyEstimated) notes.push("As kcal dos alimentos incluem estimativas; a quantidade calculada de seca também pode ser estimada.");
      if (values.taurine.estimated) notes.push("A taurina inclui uma estimativa; não corresponde a uma medição confirmada.");
      notes.push("A referência de taurina da mistura é estimada a partir " + "da energia e do formato dos alimentos, incluindo snacks. " +"Dados incompletos impedem confirmar se a referência foi atingida.");
      if (result.snackEnergy > 0) {
  notes.push(
    "Os snacks estão incluídos nos totais. " +
    "A seca sugerida desconta apenas os snacks planeados."
  );
}

if (result.plannedSnackEnergy > result.goal) {
  notes.push(
    "Os snacks planeados ultrapassam a meta energética; " +
    "a sugestão de seca e húmida ficou em zero. Revê as quantidades."
  );
}

if (result.snacks.some(item => item.mode === "extra")) {
  notes.push(
    "Os extras registados foram acrescentados sem reduzir a seca sugerida."
  );
}
      $("notice").textContent = notes.join(" ");
    }

    function renderPlan() {
      renderAge();

      const result = calculate();
      if (!result) return;

      $("weightInput").value = result.w;
      $("weightTop").textContent = fmt(result.w, 1) + " kg";
      $("wetLabel").textContent = fmt(result.wet) + " g";
      $("goalCalories").textContent = fmt(result.goal);

      $("factorInfo").textContent =
        `Fator: ${fmt(result.factor, 2)} × RER · ` +
        `Repouso: ${fmt(result.rer)} kcal · ` +
        `Meta: ${fmt(result.goal)} kcal/dia` +
        ($("customCal").value ? " · meta manual." : ".");

      $("wetGrams").textContent = fmt(result.wet);
      $("dryGrams").textContent = fmt(result.dry);
      $("wetName").textContent = result.wf.name;
      $("dryName").textContent = result.df.name;

      $("wetEnergy").textContent =
        "≈ " + fmt(result.wetEnergy) + " kcal";

      $("dryEnergy").textContent =
        "≈ " + fmt(result.dryEnergy) + " kcal";

      // Percentagens da energia total do plano, incluindo snacks.
        const totalEnergy = result.total;

        const wetPercent = totalEnergy > 0
        ? result.wetEnergy / totalEnergy * 100
        : 0;

        const dryPercent = totalEnergy > 0
        ? result.dryEnergy / totalEnergy * 100
        : 0;

        const snackPercent = totalEnergy > 0
        ? result.snackEnergy / totalEnergy * 100
        : 0;

        $("wetPercent").textContent = fmt(wetPercent, 1) + "%";
        $("dryPercent").textContent = fmt(dryPercent, 1) + "%";
        $("snackPercent").textContent = fmt(snackPercent, 1) + "%";

        $("wetBar").style.width = wetPercent + "%";
        $("dryBar").style.width = dryPercent + "%";
        $("snackBar").style.width = snackPercent + "%";

        $("wetBar").style.background = "var(--fire)";
        $("dryBar").style.background = "var(--gold2)";
        $("snackBar").style.background = "#88a879";

      renderNutritionPanels(result);
      renderSnacks(result);
      renderHydration(result);
    }

  function renderFoods() {
  const body = $("foodRows");
  body.replaceChildren();

  for (const food of foods) {
    const row = document.createElement("tr");

    // Porção de apresentação.
    const portion = food.type === "snack"
    ? 1
    : food.type === "wet" ? 85 : 100;
    const part = taurineParts(food);

    // Energia guardada em kcal/100 g.
    const energy = displayValue({
      value: food.kcal * portion / 100,
      known: isKnown(food.kcal),
      estimated: fieldEstimated(food, "kcal")
    }, 1, " kcal");

    // Proteína guardada em percentagem.
    const protein = displayValue({
      value: food.protein * portion / 100,
      known: isKnown(food.protein),
      estimated: fieldEstimated(food, "protein")
    }, 1, " g");

    // Taurina guardada em mg/kg.
    const declared = displayValue({
      value: isKnown(part.declared)
        ? part.declared * portion / 1000
        : 0,
      known: isKnown(part.declared),
      estimated: part.estimated
    }, 1, " mg");

    const declaredDescription = isKnown(part.declared)
      ? (
          part.kind === "added"
            ? " · adicionada"
            : " · total"
        )
      : "";

    const natural = part.kind === "total"
      ? "	—"
      : displayValue({
          value: isKnown(part.natural)
            ? part.natural * portion / 1000
            : 0,
          known: isKnown(part.natural),
          estimated: true
        }, 1, " mg");

    const totalInfo = taurineInfo(food);

    const total = displayValue({
      ...totalInfo,
      value: totalInfo.value * portion / 1000
    }, 1, " mg");

    [
      food.name,
      food.type === "snack"
        ? "Snack"
        : food.type === "wet" ? "Húmida" : "Seca",
      portion + " g",
      energy,
      protein,
      declared + declaredDescription,
      natural,
      total
    ].forEach(value => {
      row.append(makeCell(value));
    });

    const action = document.createElement("td");
    action.style.cssText = "display:flex;align-items:center;gap:8px";
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = "Editar";

    button.addEventListener("click", () => {
      editFood(food.id);
    });

    const linkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;width:14px;height:14px;vertical-align:middle"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

    if (food.url) {
      const link = document.createElement("a");
      link.href = food.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = "Abrir loja";
      link.innerHTML = linkIcon;
      link.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--gold2);border-radius:5px;background:linear-gradient(135deg,#73502b,#382817);color:#f5dfbc;text-decoration:none;flex-shrink:0";
      action.append(link);
    } else {
      const ghost = document.createElement("button");
      ghost.type = "button";
      ghost.title = "Adicionar link da loja";
      ghost.innerHTML = linkIcon;
      ghost.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;opacity:0.35;flex-shrink:0";
      ghost.addEventListener("click", () => editFood(food.id));
      action.append(ghost);
    }

    action.append(button);
    row.append(action);
    body.append(row);
  }
}

    const FOOD_FIELDS = {
        fName: "name",
        fType: "type",
        fKcal: "kcal",
        fProtein: "protein",
        fFat: "fat",
        fMoisture: "moisture",
        fCalcium: "calcium",
        fPhosphorus: "phosphorus",
        fSnackFormat: "snackFormat",
        fUrl: "url"
    };

   function editFood(id = null) {
  editingId = id;

  const food = getFood(id) || {
    name: "",
    type: "wet",
    kcal: "",
    protein: "",
    fat: "",
    moisture: "",
    calcium: null,
    phosphorus: null,
    taurineKind: "added",
    taurineDeclared: null,
    taurineNatural: null,
    status: "estimated"
  };

  for (const [input, field] of Object.entries(FOOD_FIELDS)) {
    $(input).value = food[field] ?? "";
  }

  const part = taurineParts(food);

  $("fTaurineKind").value = part.kind;
  $("fTaurineDeclared").value = part.declared ?? "";
  $("fTaurineNatural").value = part.natural ?? "";

  syncSnackFields();
  setupFoodEstimates(food);

  $("fTaurineDeclared").oninput = updateTaurinePreview;
  $("fTaurineNatural").oninput = updateTaurinePreview;
  $("fTaurineKind").onchange = updateTaurinePreview;
  $("fTaurineDeclaredEstimated").onchange =
    updateTaurinePreview;

  updateTaurinePreview();

  $("editorTitle").textContent = id
    ? "Editar alimento"
    : "Adicionar alimento";

  $("foodEditor").hidden = false;

  $("foodEditor").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  $("fName").focus();
}

    function closeFoodEditor() {
      editingId = null;
      $("foodEditor").hidden = true;
      $("foodForm").reset();
    }

    function saveFood(event) {
      event.preventDefault();

      const optionalNumber = id =>
        $(id).value === "" ? null : Number($(id).value);

      const food = {
  id: editingId || makeId(),
  name: $("fName").value.trim(),
  type: $("fType").value,
  snackFormat: $("fSnackFormat").value,
  kcal: Number($("fKcal").value),
  protein: optionalNumber("fProtein"),
  fat: optionalNumber("fFat"),
  moisture: optionalNumber("fMoisture"),
  calcium: optionalNumber("fCalcium"),
  phosphorus: optionalNumber("fPhosphorus"),
  url: $("fUrl").value.trim() || null,

  ...readTaurineForm(),

  estimates: Object.fromEntries(
    Object.entries(SOURCE_FIELDS).map(([inputId, field]) => [
      field,
      $(inputId + "Estimated").checked
    ])
  )
};

const totalTaurine = taurineInfo(food);

food.taurine = totalTaurine.known
  ? totalTaurine.value
  : null;

      if (!validFood(food)) {
        status("Verifica os valores da ficha do alimento.");
        return;
      }

      const original = getFood(editingId);

      if (
        original?.type === "snack" &&
        food.type !== "snack" &&
        snackItems().some(item => item.foodId === original.id)
        ) {
        status(
            "Remove primeiro este snack dos registos de hoje antes de alterar o tipo."
        );
        return;
        }

      if (
        original &&
        original.type !== food.type &&
        foods.filter(item => item.type === original.type).length === 1
      ) {
        status(
          "Adiciona outro alimento do tipo original " +
          "antes de alterar o tipo desta ficha."
        );
        return;
      }

      if (editingId) {
        const index = foods.findIndex(item => item.id === editingId);
        foods[index] = food;
      } else {
        foods.push(food);
      }

      renderFoodSelects();
      renderFoods();
      renderPlan();
      closeFoodEditor();

      if (persist()) status("Alimento guardado.");
    }

    function saveWeight(event) {
      event.preventDefault();

      const date = $("logDate").value;
      const weight = Number($("logWeight").value);

      if (
        !validDate(date) ||
        date < BIRTH ||
        date > today() ||
        !Number.isFinite(weight) ||
        weight <= 0 ||
        weight > 20
      ) {
        status("Indica uma data e um peso válidos.");
        return;
      }

      weights.push({
        id: makeId(),
        date,
        weight
      });

      $("weight").value = Math.min(
        12,
        Math.max(0.5, Math.round(weight * 10) / 10)
      );

      renderPlan();
      renderGrowth();

      if (persist()) {
        status("Pesagem guardada neste navegador.");
      }
    }

    function savePlan() {
      if (!$("weightInput").checkValidity()) {
        $("weightInput").reportValidity();
        return;
      }

      if (!$("customCal").checkValidity()) {
        $("customCal").reportValidity();
        return;
      }

      const result = calculate();
      if (!result) return;

      plans.push({
        id: makeId(),
        date: today(),
        w: result.w,
        wet: result.wet,
        dry: result.dry,
        total: result.total,
        goal: result.goal,
        wf: result.wf.name,
        df: result.df.name,
        reference: referenceForPlan(result),
        snacks: JSON.parse(JSON.stringify(result.snacks)),
        snackEnergy: result.snackEnergy,
        plannedSnackEnergy: result.plannedSnackEnergy,
        nutrientSnapshot: Object.fromEntries(
          ["protein", "fat", "moisture", "taurine", "calcium", "phosphorus"].map(field => [
            field, nutrient(result, field, field === "taurine" ? 1000 : 100)
          ])
        ),
        foodSnapshot: JSON.parse(JSON.stringify({wet: result.wf, dry: result.df}))
      });

      renderGrowth();

      if (persist()) {
        status("Plano guardado neste navegador.");
      }
    }

    function renderGrowth() {
      const weightBody = $("weightRows");
      const planBody = $("planRows");

      weightBody.replaceChildren();
      planBody.replaceChildren();

      const sortedWeights = [...weights].sort(
        (a, b) => b.date.localeCompare(a.date)
      );

      if (!sortedWeights.length) {
        emptyRow(weightBody, 3, "Ainda não existem pesagens.");
      }

      for (const item of sortedWeights) {
        const row = document.createElement("tr");
        const action = document.createElement("td");
        const button = document.createElement("button");

        button.type = "button";
        button.textContent = "Eliminar";
        button.setAttribute(
          "aria-label",
          "Eliminar pesagem de " + displayDate(item.date)
        );

        button.addEventListener("click", () => {
          weights = weights.filter(weight => weight.id !== item.id);

          // Se era uma pesagem do veterinário, desvincula a consulta correspondente.
          if (item.source === "vet") {
            const linked = health.visits.find(v => v.weightId === item.id);
            if (linked) linked.weightId = null;
          }

          // Sincroniza o peso do plano com o registo mais recente que sobrou.
          if (weights.length > 0) {
            const latest = [...weights].sort(
              (a, b) => dateStamp(b.date) - dateStamp(a.date)
            )[0];
            const clamped = String(
              Math.min(12, Math.max(0.5, Math.round(latest.weight * 10) / 10))
            );
            $("weight").value = clamped;
            $("weightInput").value = clamped;
          }

          renderPlan();
          renderGrowth();

          if (persist()) status("Pesagem eliminada.");
        });

        action.append(button);

        row.append(
          makeCell(displayDate(item.date)),
          makeCell(fmt(item.weight, 2) + " kg" + (item.source === "vet" ? " · vet" : "")),
          action
        );

        weightBody.append(row);
      }

      const recentPlans = [...plans].reverse();

      if (!recentPlans.length) {
        emptyRow(planBody, 5, "Ainda não existem planos guardados.");
      }

      for (const plan of recentPlans) {
        const row = document.createElement("tr");

        [
          displayDate(plan.date),
          fmt(plan.w, 1) + " kg",
          fmt(plan.wet) + " g",
          fmt(plan.dry) + " g",
          fmt(plan.total) + " kcal"
        ].forEach(value => row.append(makeCell(value)));

        row.title =
          "Húmida: " + (plan.wf || "—") +
          " | Seca: " + (plan.df || "—");

        planBody.append(row);
      }

      renderChart();
    }

    function renderChart() {
      const area = $("chartArea");
      area.replaceChildren();

      const allPoints = [...weights].sort(
        (a, b) => a.date.localeCompare(b.date)
      );

      const cutoffs = { "1m": 30, "6m": 182, "1y": 365 };
      const days = cutoffs[chartRange];
      const points = days
        ? allPoints.filter(p => dateStamp(today()) - dateStamp(p.date) <= days * DAY)
        : allPoints;

      if (points.length < 2) {
        const message = document.createElement("p");
        message.className = "hint";
        message.textContent = allPoints.length < 2
          ? "Regista pelo menos duas pesagens para veres o gráfico."
          : "Sem pesagens no período selecionado.";
        area.append(message);
        return;
      }

      function svgElement(tag, attributes, text) {
        const element = document.createElementNS(
          "http://www.w3.org/2000/svg",
          tag
        );

        for (const [name, value] of Object.entries(attributes)) {
          element.setAttribute(name, String(value));
        }

        if (text != null) element.textContent = text;
        return element;
      }

      const width = 600;
      const height = 280;
      const left = 48;
      const right = 28;
      const top = 24;
      const bottom = 48;

      const firstDate = dateStamp(points[0].date);
      const lastDate = dateStamp(points[points.length - 1].date);
      const span = Math.max(DAY, lastDate - firstDate);

      const low = Math.max(
        0,
        Math.min(...points.map(point => point.weight)) - 0.2
      );

      const high =
        Math.max(...points.map(point => point.weight)) + 0.2;

      const x = date =>
        left +
        (dateStamp(date) - firstDate) /
        span *
        (width - left - right);

      const y = weight =>
        top +
        (1 - (weight - low) / (high - low)) *
        (height - top - bottom);

      const svg = svgElement("svg", {
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": "Evolução das pesagens do Sauron"
      });

      for (let step = 0; step <= 4; step++) {
        const value = low + (high - low) * step / 4;

        svg.append(
          svgElement("line", {
            x1: left,
            x2: width - right,
            y1: y(value),
            y2: y(value),
            stroke: "#514025"
          }),
          svgElement("text", {
            x: left - 8,
            y: y(value) + 4,
            fill: "#a49c89",
            "font-size": 11,
            "text-anchor": "end"
          }, fmt(value, 1))
        );
      }

      svg.append(
        svgElement("polyline", {
          points: points.map(
            point => `${x(point.date)},${y(point.weight)}`
          ).join(" "),
          fill: "none",
          stroke: "#edbd78",
          "stroke-width": 3
        })
      );

      for (const point of points) {
        const circle = svgElement("circle", {
          cx: x(point.date),
          cy: y(point.weight),
          r: 5,
          fill: "#edbd78"
        });

        circle.append(
          svgElement(
            "title",
            {},
            `${displayDate(point.date)}: ${fmt(point.weight, 2)} kg`
          )
        );

        svg.append(circle);
      }

      svg.append(
        svgElement("text", {
          x: left,
          y: height - 14,
          fill: "#a49c89",
          "font-size": 11,
          "text-anchor": "start"
        }, displayDate(points[0].date)),

        svgElement("text", {
          x: width - right,
          y: height - 14,
          fill: "#a49c89",
          "font-size": 11,
          "text-anchor": "end"
        }, displayDate(points[points.length - 1].date))
      );

      area.append(svg);
    }

    function showTab(tab) {
      if (!["plan", "foods", "growth", "training", "health", "memories"].includes(tab)) return;
      $("mainHero").hidden = ["training", "foods", "growth", "health", "memories"].includes(tab);
      if (tab === "training") renderTraining();

      closeFoodEditor();
      closeHealthEditor();
      closeGenPopover();

      document.querySelectorAll("[data-view]").forEach(view => {
        view.hidden = view.dataset.view !== tab;
      });

      $("foodEditor").hidden = true;

      document.querySelectorAll("[data-tab]").forEach(button => {
        const selected = button.dataset.tab === tab;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });

      if (tab === "growth") {
        $("logDate").max = today();
        renderGrowth();
      }

      if (tab === "health") renderHealth();
      if (tab === "memories" && typeof SauronMemories !== "undefined") SauronMemories.render();
    }

    const HYDRATION_KEY = "sauron-hydration-v1";

let hydrationData = {
  days: {},
  low: null,
  high: null
};

let hydrationDate = "";

try {
  const stored = JSON.parse(
    localStorage.getItem(HYDRATION_KEY) || "null"
  );

  if (
    stored &&
    typeof stored === "object" &&
    !Array.isArray(stored)
  ) {
    hydrationData = {
      days:
        stored.days &&
        typeof stored.days === "object" &&
        !Array.isArray(stored.days)
          ? stored.days
          : {},

      low: isKnown(stored.low) ? stored.low : null,
      high: isKnown(stored.high) ? stored.high : null
    };
  }
} catch {
  status("Não foi possível ler os registos de água.");
}

function restoreHydrationDay() {
  hydrationDate = today();

  const amount = hydrationData.days[hydrationDate];

  $("waterDrunk").value = isKnown(amount) ? amount : "";
  $("waterRefLow").value = hydrationData.low ?? "";
  $("waterRefHigh").value = hydrationData.high ?? "";
}

function hydrationReading(result, drink, limits) {
  // Humidade em percentagem × gramas.
  // Aproximação: 1 g de água corresponde a 1 ml.
  const food = nutrient(result, "moisture");

  const total = drink == null
    ? null
    : drink + food.value;

  let state = "unknown";
  let text = "Água bebida por registar";

  if (!limits.valid) {
    text = "Verifica os dois limites da referência";

  } else if (drink != null && !food.complete) {
    text = "Dados incompletos nos alimentos";

  } else if (drink != null && food.complete) {
    state = total < limits.low - 1e-9
      ? "below"
      : total > limits.high + 1e-9
        ? "above"
        : "within";

    text = {
      below: "Abaixo da referência",
      within: "Dentro da referência",
      above: "Acima da referência"
    }[state];
  }

  return {food, total, state, text};
}

function renderHydration(result) {
  if (hydrationDate !== today()) {
    restoreHydrationDay();
  }

  const input = $("waterDrunk");

  const drink =
    input.value === "" || !input.checkValidity()
      ? null
      : Number(input.value);

  const lowInput = $("waterRefLow");
  const highInput = $("waterRefHigh");

  const automatic =
    lowInput.value === "" &&
    highInput.value === "";

  const low = automatic
    ? result.w * 44
    : Number(lowInput.value);

  const high = automatic
    ? result.w * 66
    : Number(highInput.value);

  const valid = automatic || (
    lowInput.value !== "" &&
    highInput.value !== "" &&
    lowInput.checkValidity() &&
    highInput.checkValidity() &&
    Number.isFinite(low) &&
    Number.isFinite(high) &&
    low > 0 &&
    high >= low
  );

    const slider = $("waterSlider");

    // A escala acompanha a referência e qualquer valor introduzido.
    // O campo numérico continua sem limite máximo.
    const foodWater = nutrient(result, "moisture");

    // Centro do intervalo de água total.
    const referenceMiddle = valid
    ? (low + high) / 2
    : result.w * 55;

    // Quantidade bebida que completaria esse valor.
    // Só descontamos os alimentos se os dados estiverem completos.
    const drinkMiddle = foodWater.complete
    ? Math.max(0, referenceMiddle - foodWater.value)
    : referenceMiddle;

    // Escala prática: coloca esse valor aproximadamente a meio.
    // Não aumenta automaticamente quando introduzes um valor elevado.
    const sliderMax = Math.ceil(
    Math.max(100, drinkMiddle * 2) / 25
    ) * 25;

    slider.max = String(sliderMax);
    slider.value = String(
    Math.min(drink ?? 0, sliderMax)
    );

    $("waterSliderValue").textContent = drink == null
    ? "Não medido"
    : fmt(drink, 1) + " ml";

    $("waterSliderMax").textContent = fmt(sliderMax) + " ml";

  const reading = hydrationReading(
    result,
    drink,
    {low, high, valid}
  );

  $("hydrationFood").textContent =
    displayValue(reading.food, 1, " ml");

  $("hydrationTotal").textContent = drink == null
    ? "—"
    : displayValue({
        ...reading.food,
        value: reading.total,
        known: true
      }, 1, " ml");

  $("hydrationReference").textContent = valid
    ? fmt(low, 1) + "–" + fmt(high, 1) + " ml/dia"
    : "—";

  $("hydrationStatus").textContent =
    !input.checkValidity()
      ? "Verifica a quantidade de água bebida"
      : reading.text;

  $("hydrationStatus").dataset.state =
    !input.checkValidity()
      ? "unknown"
      : reading.state;

  $("hydrationBasis").textContent = automatic
    ? "Referência geral: 44–66 ml/kg/dia · peso atual: " +
      fmt(result.w, 1) +
      " kg. Não é um intervalo validado especificamente " +
      "para kittens ou Maine Coons."
    : "Referência personalizada em ml/dia. Revê-a quando " +
      "o peso ou as necessidades mudarem.";
}

function saveHydrationInputs() {
  if (hydrationDate !== today()) {
    restoreHydrationDay();
    renderPlan();
    return;
  }

  const input = $("waterDrunk");

  if (input.checkValidity()) {
    if (input.value === "") {
      delete hydrationData.days[today()];
    } else {
      hydrationData.days[today()] = Number(input.value);
    }
  }

  for (const [id, field] of [
    ["waterRefLow", "low"],
    ["waterRefHigh", "high"]
  ]) {
    const control = $(id);

    if (control.checkValidity()) {
      hydrationData[field] = control.value === ""
        ? null
        : Number(control.value);
    }
  }

  try {
    localStorage.setItem(
      HYDRATION_KEY,
      JSON.stringify(hydrationData)
    );
  } catch {
    status(
      "Não foi possível guardar os registos de água neste navegador."
    );
  }

  renderPlan();
}

restoreHydrationDay();

for (const id of [
  "waterDrunk",
  "waterRefLow",
  "waterRefHigh"
]) {
  $(id).addEventListener("input", saveHydrationInputs);
}

    // TREINOS — a gravação usa o mesmo registo local dos alimentos e pesagens.
    const TRAINING_LEVELS = ["Por começar", "Descobrir", "Com ajuda", "Ao sinal", "Consistente", "Dominado"];
        const TRAINING_ICONS = {
    sit: "./treinos-truques/sentar.png",
    lie: "./treinos-truques/deitar.png",
    recall: "./treinos-truques/vir-ao-nome.png",
    wait: "./treinos-truques/esperar.png",
    roll: "./treinos-truques/rebolar.png",
    paw: "./treinos-truques/dar-a-pata.png",
    stand: "./treinos-truques/ficar-de-pe.png",
    meow: "./treinos-truques/miar.png",
    disc: "./treinos-truques/buscar-disco.png",
    shoulder: "./treinos-truques/saltar-ombro.png",
    greet: "./treinos-truques/cumprimentar.png",

    // Mantém compatibilidade com os truques já guardados.
    carrier: "./treinos-categoria/por-comecar.png",
    star: "./treinos-categoria/por-comecar.png"
    };

    function trainingPng(src, className = "") {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.className = className;
    img.decoding = "async";
    return img;
    }
    let training = {tricks: [], sessions: []};
    let trainingFilter = "all";
    let trainingEditingTrick = null;
    let trainingEditingSession = null;
    let trainingHistoryTrick = null;
    let trainingHistoryLimit = 6;

    function loadTraining(raw) {
      const defaults = [
        ["sit", "Sentar", "Sentar ao sinal, sem precisar de seguir a recompensa."],
        ["paw", "Dar a pata", "Oferecer a pata voluntariamente quando pedimos."],
        ["recall", "Vir quando chamado", "Aproximar-se quando ouve o nome ou o sinal combinado."],
        ["carrier", "Entrar na transportadora", "Entrar voluntariamente e ficar confortável na transportadora."]
      ];
      if (!raw || !Array.isArray(raw.tricks)) {
        training = {
          tricks: defaults.map(([icon, name, notes]) => ({
            id: "training-" + icon, icon, name, notes, cue: "", level: 0, archived: false
          })),
          sessions: []
        };
        return;
      }
      const seen = new Set();
      const text = (value, length) => typeof value === "string" ? value.slice(0, length) : "";
      training.tricks = raw.tricks.filter(trick => {
        if (!trick || typeof trick.id !== "string" || seen.has(trick.id) ||
            typeof trick.name !== "string" || !trick.name.trim()) return false;
        seen.add(trick.id);
        return true;
      }).map(trick => ({
        id: trick.id, name: text(trick.name, 80),
        icon: Object.hasOwn(TRAINING_ICONS, trick.icon) ? trick.icon : "star",
        notes: text(trick.notes, 600), cue: text(trick.cue, 80),
        level: Number.isInteger(trick.level) && trick.level >= 0 && trick.level <= 5 ? trick.level : 0,
        archived: trick.archived === true
      }));
      const seenSessions = new Set();
      training.sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).filter(session => {
        if (!session || typeof session.id !== "string" || seenSessions.has(session.id) ||
            !seen.has(session.trickId) || !validDate(session.date) || session.date < BIRTH || session.date > today() ||
            !Number.isInteger(session.attempts) || session.attempts < 1 || session.attempts > 999 ||
            !Number.isInteger(session.independent) || session.independent < 0 ||
            !Number.isInteger(session.assisted) || session.assisted < 0 ||
            session.independent + session.assisted > session.attempts ||
            !isKnown(session.minutes) || session.minutes <= 0 || session.minutes > 240) return false;
        seenSessions.add(session.id);
        return true;
      }).map(session => ({
        id: session.id, trickId: session.trickId, date: session.date,
        attempts: session.attempts, independent: session.independent, assisted: session.assisted,
        minutes: session.minutes,
        usedClicker: typeof session.usedClicker === "boolean" ? session.usedClicker : null,
        usedFood: typeof session.usedFood === "boolean" ? session.usedFood : (session.reward ? true : null),
        context: text(session.context, 100), notes: text(session.notes, 600),
        createdAt: text(session.createdAt, 40),
        reward: session.reward && typeof session.reward.foodId === "string" &&
          isKnown(session.reward.grams) && session.reward.grams > 0 && session.reward.grams <= 1000
          ? {foodId: session.reward.foodId, name: text(session.reward.name, 120), grams: session.reward.grams}
          : null
      }));
    }

    function trainingElement(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text != null) element.textContent = text;
      return element;
    }

    function trainingButton(text, action, className = "") {
      const button = trainingElement("button", className, text);
      button.type = "button";
      button.addEventListener("click", action);
      return button;
    }

    function trainingTrick(id) {
      return training.tricks.find(trick => trick.id === id);
    }

    function trainingSessionsFor(id) {
      return training.sessions.filter(session => session.trickId === id).sort((a, b) =>
        b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || "")
      );
    }

    function trainingStage(trick) {
      if (trick.archived) return "archived";
      if (trick.level === 5) return "mastered";
      return trick.level > 0 || trainingSessionsFor(trick.id).length ? "learning" : "planned";
    }

    function trainingDurationSeconds() {
      const m = $("trainingMinutes");
      const s = $("trainingSeconds");
      const minutes = Number(m.value);
      const seconds = Number(s.value);
      const total = minutes * 60 + seconds;
      const valid = m.value.trim() !== "" && s.value.trim() !== "" &&
        Number.isInteger(minutes) && minutes >= 0 && minutes <= 240 &&
        Number.isInteger(seconds) && seconds >= 0 && seconds <= 59 &&
        total > 0 && total <= 14400;
      m.setCustomValidity(valid ? "" : "Indica uma duração entre 00:01 e 240:00, com segundos de 0 a 59.");
      return valid ? total : null;
    }

    function trainingDurationText(minutes) {
      const total = Math.round(minutes * 60);
      return String(Math.floor(total / 60)).padStart(2, "0") + ":" +
        String(total % 60).padStart(2, "0");
    }

    function trainingProgress(sessions) {
      const recent = trainingPerformance(sessions.slice(0, 5));
      const days = new Set(sessions.map(session => session.date)).size;
      const practice = Math.min(days, 5) * 2;
      const learning = recent.attempts
        ? 90 * (recent.independent + recent.assisted * 0.4) / recent.attempts : 0;
      return {practice, learning, value: Math.min(100, practice + learning)};
    }

    function trainingMethodText(session) {
      const clicker = session.usedClicker === true ? "com clicker"
        : session.usedClicker === false ? "sem clicker" : "clicker não registado";
      const food = session.usedFood === true ? "com recompensa alimentar"
        : session.usedFood === false ? "sem recompensa alimentar" : "recompensa alimentar não registada";
      return clicker + " · " + food;
    }

    function trainingPerformance(sessions) {
      return sessions.reduce((sum, session) => ({
        attempts: sum.attempts + session.attempts,
        independent: sum.independent + session.independent,
        assisted: sum.assisted + session.assisted
      }), {attempts: 0, independent: 0, assisted: 0});
    }

    function trainingSuggestion(trick) {
      const sessions = trainingSessionsFor(trick.id);
      if (trick.archived || trick.level === 5 || !sessions.length) return null;
      const recent = trainingPerformance(sessions.slice(0, 5));
      const independentRate = recent.independent / recent.attempts;
      if (trick.level === 0) return 1;
      if (trick.level === 1 && recent.attempts >= 5 &&
          (recent.independent + recent.assisted) / recent.attempts >= .6) return 2;
      if (trick.level === 2 && recent.attempts >= 5 && independentRate >= .8) return 3;
      if (trick.level === 3) {
        const last = sessions.slice(0, 3);
        if (last.length === 3 && new Set(last.map(session => session.date)).size >= 2 &&
            last.every(session => session.attempts >= 3 && session.independent / session.attempts >= .8)) return 4;
      }
      if (trick.level === 4) {
        const contexts = new Map();
        for (const session of sessions.slice(0, 12)) {
          const key = session.context.trim().toLocaleLowerCase("pt-PT");
          if (!key) continue;
          const group = contexts.get(key) || [];
          group.push(session);
          contexts.set(key, group);
        }
        const successful = [...contexts.values()].filter(group => {
          const performance = trainingPerformance(group);
          return performance.attempts >= 3 && performance.independent / performance.attempts >= .8;
        });
        if (successful.length >= 3) return 5;
      }
      return null;
    }

    function commitTraining(change) {
      const backup = JSON.parse(JSON.stringify({training, snackDays}));
      change();
      if (!persist()) {
        training = backup.training;
        snackDays = backup.snackDays;
        $("trainingFormStatus").textContent = "Não foi possível guardar. O registo anterior foi mantido.";
        return false;
      }
      renderPlan();
      renderTraining();
      return true;
    }

    function trainingConfirmLevel(id, level) {
      const trick = trainingTrick(id);
      if (!trick || trainingSuggestion(trick) !== level) return;
      if (commitTraining(() => { trick.level = level; })) {
        status(trick.name + " · nível " + level + " confirmado.");
      }
    }

    function trainingOption(select, value, label) {
      const option = trainingElement("option", "", label);
      option.value = value;
      select.append(option);
    }

    function refreshTrainingSelects() {
      const selected = $("trainingTrick").value;
      $("trainingTrick").replaceChildren();
      for (const trick of training.tricks.filter(item => !item.archived || (trainingEditingSession && item.id === selected))) {
        trainingOption($("trainingTrick"), trick.id, trick.name + (trick.archived ? " · arquivado" : ""));
      }
      if ([...$("trainingTrick").options].some(option => option.value === selected)) $("trainingTrick").value = selected;
      const reward = $("trainingRewardFood").value;
      $("trainingRewardFood").replaceChildren();
      trainingOption($("trainingRewardFood"), "", "Sem snack registado");
      for (const food of foods.filter(item => item.type === "snack")) {
        trainingOption($("trainingRewardFood"), food.id, food.name);
      }
      if (getFood(reward)?.type === "snack") $("trainingRewardFood").value = reward;
      $("saveTrainingSession").disabled = !$("trainingTrick").value;
      updateTrainingReward();
    }

    function renderTraining() {
      const counts = {learning: 0, mastered: 0, planned: 0};
      for (const trick of training.tricks) {
        const stage = trainingStage(trick);
        if (Object.hasOwn(counts, stage)) counts[stage]++;
      }
      $("trainingLearningCount").textContent = counts.learning;
      $("trainingMasteredCount").textContent = counts.mastered;
      $("trainingPlannedCount").textContent = counts.planned;
      document.querySelectorAll("[data-training-filter]").forEach(button => {
        const active = button.dataset.trainingFilter === trainingFilter;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      const body = $("trainingCards");
      body.replaceChildren();
      const tricks = training.tricks.filter(trick =>
        trainingFilter === "all" ? !trick.archived : trainingStage(trick) === trainingFilter
      );
      if (!tricks.length) body.append(trainingElement("p", "training-empty", "Ainda não existem truques nesta categoria. Usa + Novo truque para adicionar um."));
      for (const trick of tricks) {
        const card = trainingElement("article", "card training-skill-card");
        const heading = trainingElement("div", "training-skill-heading");
        const icon = trainingElement("span", "training-icon");
        icon.setAttribute("aria-hidden", "true");
        // Apenas SVG estático da app; nomes e notas usam textContent.
        icon.append(
        trainingPng(
            TRAINING_ICONS[trick.icon] || TRAINING_ICONS.star,
            "training-trick-image"
        )
        );        
        const title = trainingElement("div");
        title.append(trainingElement("h3", "", trick.name));
        const sessions = trainingSessionsFor(trick.id);
        const label = trick.archived ? "Arquivado"
          : trick.level ? "Nível " + trick.level + " · " + TRAINING_LEVELS[trick.level]
          : sessions.length ? "Aprendizagem iniciada · nível por confirmar" : "Por começar";
        title.append(trainingElement("span", "training-skill-phase", label));
        const badge = trainingElement("span", "training-level-badge");
        badge.setAttribute("aria-label", "Nível " + trick.level);
        badge.append(
        trainingPng(
            "./treinos-niveis/nivel-" + trick.level + ".png",
            "training-level-image"
        )
        );
        heading.append(icon, title, badge);
        card.append(heading);
        card.append(trainingElement("p", "training-skill-description", trick.notes || "Define um objetivo e acompanha a aprendizagem ao longo das sessões."));
        if (trick.cue) card.append(trainingElement("p", "training-cue", "Sinal: " + trick.cue));
        const performance = trainingPerformance(sessions.slice(0, 5));
        const progress = trainingElement("progress", "training-progress");
        progress.max = 100;
        const score = trainingProgress(sessions);
        progress.value = score.value;
        progress.setAttribute("aria-label", "Progresso de " + trick.name);
        progress.setAttribute("aria-valuetext", Math.round(score.value) + "% · prática e aprendizagem");
        progress.title = "Prática: " + score.practice + "/10 · Aprendizagem: " + Math.round(score.learning) + "/90";
        card.append(progress);
        const allPerformance = trainingPerformance(sessions);
        card.append(trainingElement("p", "note training-practice-summary", sessions.length
          ? "Já praticado · " + sessions.length + " " + plural(sessions.length, "sessão", "sessões") + " · " + allPerformance.attempts + " " + plural(allPerformance.attempts, "tentativa", "tentativas") + " · " + Math.round(score.value) + "%"
          : "Ainda não praticado"));
        if (sessions.length) {
          card.append(trainingElement("p", "note training-results-summary",
            "Últimas " + Math.min(5, sessions.length) + " " + plural(Math.min(5, sessions.length), "sessão", "sessões") + ": " + performance.independent + " ao sinal · " +
            performance.assisted + " " + plural(performance.assisted, "guiada", "guiadas") + " · " + (performance.attempts - performance.independent - performance.assisted) + " sem execução"));
          card.append(trainingElement("p", "note training-method-summary", "Última sessão: " + trainingMethodText(sessions[0])));
        }
        const suggestion = trainingSuggestion(trick);
        if (suggestion != null) {
          const box = trainingElement("div", "training-suggestion");
          box.append(trainingElement("p", "", "Sugestão da app: nível " + suggestion + " · " + TRAINING_LEVELS[suggestion] + ". Confirma se corresponde ao que observaste."));
          box.append(trainingButton("Confirmar nível " + suggestion, () => trainingConfirmLevel(trick.id, suggestion)));
          card.append(box);
        }
        const actions = trainingElement("div", "training-skill-actions");
        if (!trick.archived) actions.append(trainingButton(sessions.length ? "Registar sessão" : "Começar", () => selectTrainingTrick(trick.id)));
        actions.append(trainingButton("Editar", () => editTrainingTrick(trick.id), "ghost"));
        actions.append(trainingButton("Histórico (" + sessions.length + ")", () => {
          trainingHistoryTrick = trick.id;
          trainingHistoryLimit = 6;
          renderTrainingHistory();
          $("trainingHistoryTitle").scrollIntoView({behavior: "smooth", block: "center"});
        }, "ghost"));
        card.append(actions);
        body.append(card);
      }
      $("trainingDate").min = BIRTH;
      $("trainingDate").max = today();
      refreshTrainingSelects();
      renderTrainingHistory();
      updateTrainingAttempts();
    }

    function editTrainingTrick(id = null) {
      trainingEditingTrick = id;
      const trick = trainingTrick(id);
      $("trainingTrickEditorTitle").textContent = trick ? "Editar truque" : "Novo truque";
      $("trainingTrickName").value = trick?.name || "";
      $("trainingTrickIcon").value = trick?.icon || "star";
      $("trainingTrickLevel").value = String(trick?.level ?? 0);
      $("trainingTrickCue").value = trick?.cue || "";
      $("trainingTrickNotes").value = trick?.notes || "";
      $("trainingTrickArchived").checked = trick?.archived || false;
      $("trainingTrickError").textContent = "";
      $("trainingTrickDialog").showModal();
      $("trainingTrickName").focus();
    }

    function saveTrainingTrick(event) {
      event.preventDefault();
      const name = $("trainingTrickName").value.trim();
      const level = Number($("trainingTrickLevel").value);
      const icon = $("trainingTrickIcon").value;
      if (!name || name.length > 80 || !Number.isInteger(level) || level < 0 || level > 5 ||
          !Object.hasOwn(TRAINING_ICONS, icon)) {
        $("trainingTrickError").textContent = "Verifica o nome e o nível do truque.";
        return;
      }
      const trick = {
        id: trainingEditingTrick || makeId(), name, level, icon,
        cue: $("trainingTrickCue").value.trim().slice(0, 80),
        notes: $("trainingTrickNotes").value.trim().slice(0, 600),
        archived: $("trainingTrickArchived").checked
      };
      if (commitTraining(() => {
        const index = training.tricks.findIndex(item => item.id === trick.id);
        if (index >= 0) training.tricks[index] = trick;
        else training.tricks.push(trick);
      })) {
        $("trainingTrickDialog").close();
        status("Truque guardado.");
      } else $("trainingTrickError").textContent = "Não foi possível guardar. Tenta novamente.";
    }

    function updateTrainingAttempts() {
      const attempts = Number($("trainingAttempts").value);
      const independent = Number($("trainingIndependent").value);
      const assisted = Number($("trainingAssisted").value);
      const valid = Number.isInteger(attempts) && attempts >= 1 && attempts <= 999 &&
        Number.isInteger(independent) && independent >= 0 &&
        Number.isInteger(assisted) && assisted >= 0 && independent + assisted <= attempts;
      $("trainingAssisted").setCustomValidity(valid ? "" : "As execuções ao sinal e guiadas não podem ultrapassar as tentativas.");
      $("trainingAttemptHint").textContent = valid
        ? "Ainda não conseguiu: " + (attempts - independent - assisted) + " de " + attempts + " tentativas."
        : "Verifica as tentativas: cada uma só pode contar uma vez, ao sinal ou guiada.";
      return valid;
    }

    function trainingRewardEntry(id) {
      const rewardId = "training-reward-" + id;
      for (const [date, entries] of Object.entries(snackDays)) {
        if (!Array.isArray(entries)) continue;
        const item = entries.find(entry => entry?.id === rewardId);
        if (item) return {date, item};
      }
      return null;
    }

    function removeTrainingReward(id) {
      const rewardId = "training-reward-" + id;
      for (const date of Object.keys(snackDays)) {
        if (Array.isArray(snackDays[date])) {
          snackDays[date] = snackDays[date].filter(item => item?.id !== rewardId);
        }
      }
    }

    function updateTrainingReward() {
      const food = getFood($("trainingRewardFood").value);
      const selected = food?.type === "snack";
      const date = $("trainingDate").value;
      $("trainingRewardGrams").disabled = !selected;
      $("trainingRewardGrams").required = !!selected;
      $("trainingRewardToDiary").disabled = !selected || date !== today();
      if (!selected || date !== today()) $("trainingRewardToDiary").checked = false;
      const linked = trainingEditingSession && trainingRewardEntry(trainingEditingSession);
      $("trainingRewardHint").textContent = date !== today()
        ? "Sessões passadas: a recompensa fica no histórico. A ligação aos snacks está disponível apenas para hoje." +
          (linked ? " Ao guardar, será retirada a ligação anterior ao diário." : "")
        : linked
          ? "Esta sessão já tem uma recompensa ligada. Guardar atualiza a mesma entrada; desmarcar retira-a do diário."
          : "Assinala apenas se esta recompensa ainda não estiver contabilizada no plano diário.";
    }

    function resetTrainingSession() {
      trainingEditingSession = null;
      $("trainingSessionTitle").textContent = "Sessão de treino";
      $("saveTrainingSession").textContent = "Guardar sessão";
      $("cancelTrainingSession").hidden = true;
      $("trainingDate").value = today();
      $("trainingMinutes").value = "3";
      $("trainingSeconds").value = "0";
      $("trainingMinutes").setCustomValidity("");
      for (const id of ["trainingUsedClicker", "trainingUsedFood"]) {
        $(id).checked = false;
        $(id).indeterminate = false;
      }
      $("trainingAttempts").value = "5";
      $("trainingIndependent").value = "0";
      $("trainingAssisted").value = "0";
      $("trainingContext").value = "";
      $("trainingSessionNotes").value = "";
      $("trainingRewardFood").value = "";
      $("trainingRewardGrams").value = "";
      $("trainingRewardToDiary").checked = false;
      $("trainingFormStatus").textContent = "";
      updateTrainingAttempts();
      updateTrainingReward();
    }

    function selectTrainingTrick(id) {
      resetTrainingSession();
      $("trainingTrick").value = id;
      $("trainingSessionTitle").scrollIntoView({behavior: "smooth", block: "center"});
      $("trainingAttempts").focus();
    }

    function editTrainingSession(id) {
      const session = training.sessions.find(item => item.id === id);
      if (!session) return;
      trainingEditingSession = id;
      // Inclui o truque arquivado quando editamos uma sessão antiga.
      $("trainingTrick").replaceChildren();
      for (const trick of training.tricks.filter(item => !item.archived || item.id === session.trickId)) {
        trainingOption($("trainingTrick"), trick.id, trick.name);
      }
      $("trainingTrick").value = session.trickId;
      $("trainingDate").value = session.date;
      const durationSeconds = Math.max(1, Math.round(session.minutes * 60));
      $("trainingMinutes").value = Math.floor(durationSeconds / 60);
      $("trainingSeconds").value = durationSeconds % 60;
      $("trainingMinutes").setCustomValidity("");
      for (const [id, field] of [["trainingUsedClicker", "usedClicker"], ["trainingUsedFood", "usedFood"]]) {
        $(id).checked = session[field] === true;
        $(id).indeterminate = session[field] == null;
      }
      $("trainingMethodHint").textContent = session.usedClicker == null || session.usedFood == null
        ? "Método não registado nesta sessão antiga. As caixas com traço significam desconhecido; clica para indicar sim ou não." : "Marca as opções utilizadas; podem ser ambas.";
      $("trainingAttempts").value = session.attempts;
      $("trainingIndependent").value = session.independent;
      $("trainingAssisted").value = session.assisted;
      $("trainingContext").value = session.context;
      $("trainingSessionNotes").value = session.notes;
      const rewardFood = session.reward && getFood(session.reward.foodId);
      $("trainingRewardFood").value = rewardFood?.type === "snack" ? rewardFood.id : "";
      $("trainingRewardGrams").value = session.reward?.grams ?? "";
      $("trainingRewardToDiary").checked = !!trainingRewardEntry(id);
      $("trainingSessionTitle").textContent = "Editar sessão";
      $("saveTrainingSession").textContent = "Atualizar sessão";
      $("cancelTrainingSession").hidden = false;
      $("trainingFormStatus").textContent = session.reward && !rewardFood
        ? "O snack original já não está disponível. Seleciona uma recompensa atual ou guarda sem recompensa." : "";
      updateTrainingAttempts();
      updateTrainingReward();
      $("trainingSessionTitle").scrollIntoView({behavior: "smooth", block: "center"});
    }

    function saveTrainingSession(event) {
      event.preventDefault();
      $("trainingFormStatus").textContent = "";
      const durationSeconds = trainingDurationSeconds();
      if (!updateTrainingAttempts() || durationSeconds == null || !$("trainingSessionForm").checkValidity()) {
        $("trainingSessionForm").reportValidity();
        $("trainingFormStatus").textContent = "Verifica as tentativas, a duração e a quantidade da recompensa.";
        return;
      }
      const date = $("trainingDate").value;
      const trick = trainingTrick($("trainingTrick").value);
      if (!trick || !validDate(date) || date < BIRTH || date > today()) {
        $("trainingFormStatus").textContent = "Seleciona um truque e uma data entre o nascimento e hoje.";
        return;
      }
      const attempts = Number($("trainingAttempts").value);
      const independent = Number($("trainingIndependent").value);
      const assisted = Number($("trainingAssisted").value);
      const minutes = durationSeconds / 60;
      const food = getFood($("trainingRewardFood").value);
      const grams = Number($("trainingRewardGrams").value);
      if (food && (food.type !== "snack" || !Number.isFinite(grams) || grams <= 0 || grams > 1000)) return;
      const addToDiary = $("trainingRewardToDiary").checked;
      if (addToDiary && (!food || date !== today())) {
        $("trainingFormStatus").textContent = "Para ligar ao diário, seleciona um snack numa sessão de hoje.";
        return;
      }
      const existing = training.sessions.find(session => session.id === trainingEditingSession);
      const session = {
        id: existing?.id || makeId(), trickId: trick.id, date, attempts, independent, assisted, minutes,
        usedClicker: $("trainingUsedClicker").indeterminate ? null : $("trainingUsedClicker").checked,
        usedFood: food ? true : ($("trainingUsedFood").indeterminate ? null : $("trainingUsedFood").checked),
        context: $("trainingContext").value.trim().slice(0, 100),
        notes: $("trainingSessionNotes").value.trim().slice(0, 600),
        createdAt: existing?.createdAt || new Date().toISOString(),
        reward: food ? {foodId: food.id, name: food.name, grams} : null
      };
      if (!commitTraining(() => {
        const index = training.sessions.findIndex(item => item.id === session.id);
        if (index >= 0) training.sessions[index] = session;
        else training.sessions.push(session);
        removeTrainingReward(session.id);
        if (addToDiary) {
          if (!Array.isArray(snackDays[date])) snackDays[date] = [];
          snackDays[date].push({id: "training-reward-" + session.id,
            foodId: food.id, grams, mode: "extra"});
        }
      })) return;
      resetTrainingSession();
      $("trainingFormStatus").textContent = existing ? "Sessão atualizada." : "Sessão guardada.";
      status(addToDiary ? "Sessão guardada e recompensa contabilizada como extra." : "Sessão guardada.");
    }

    function confirmTrainingDelete(id, container) {
  // Mostra apenas uma confirmação de cada vez.
  document.querySelectorAll(".training-delete-confirm")
    .forEach(element => element.remove());

  if (!training.sessions.some(session => session.id === id)) return;

  const linked = trainingRewardEntry(id);

  const panel = trainingElement(
    "div",
    "training-delete-confirm"
  );

  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "Confirmar eliminação da sessão");

  panel.append(
    trainingElement(
      "p",
      "note",
      linked
        ? "Eliminar esta sessão? A recompensa associada também será retirada dos snacks."
        : "Eliminar esta sessão? O nível confirmado do truque será mantido."
    )
  );

  const buttons = trainingElement(
    "div",
    "training-delete-actions"
  );

  const cancel = trainingButton(
    "Cancelar",
    () => {
      panel.remove();
      container.querySelector("button")?.focus();
    },
    "ghost"
  );

  const confirm = trainingButton(
    "Eliminar sessão",
    () => deleteTrainingSession(id, true),
    "ghost"
  );

  buttons.append(cancel, confirm);
  panel.append(buttons);
  container.append(panel);

  // A opção inicial é cancelar, para evitar eliminações acidentais.
  cancel.focus();
}

function deleteTrainingSession(id, confirmed = false) {
  if (!confirmed) return;

  if (!training.sessions.some(session => session.id === id)) return;

  if (commitTraining(() => {
    training.sessions = training.sessions.filter(
      session => session.id !== id
    );

    removeTrainingReward(id);
  })) {
    if (trainingEditingSession === id) {
      resetTrainingSession();
    }

    status(
      "Sessão eliminada. O nível confirmado foi mantido; podes ajustá-lo em Editar truque."
    );
  }
}

    function renderTrainingHistory() {
      const body = $("trainingHistory");
      body.replaceChildren();
      const trick = trainingTrick(trainingHistoryTrick);
      $("trainingHistoryTitle").textContent = trick ? "Histórico · " + trick.name : "Últimas sessões";
      $("trainingHistoryReset").hidden = !trick;
      const sessions = training.sessions.filter(session => !trick || session.trickId === trick.id)
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
      if (!sessions.length) body.append(trainingElement("p", "note", "Ainda não existem sessões registadas."));
      for (const session of sessions.slice(0, trainingHistoryLimit)) {
        const item = trainingElement("article", "training-history-item");
        const title = trainingElement("p");
        title.append(trainingElement("strong", "", trainingTrick(session.trickId)?.name || "Truque"));
        item.append(title);
        item.append(trainingElement("p", "", (session.date === today() ? "Hoje" : displayDate(session.date)) +
          " · " + trainingDurationText(session.minutes) + " · " + session.attempts + " " + plural(session.attempts, "tentativa", "tentativas") + " · " + session.independent +
          " ao sinal · " + session.assisted + " " + plural(session.assisted, "guiada", "guiadas") + " · " + (session.attempts - session.independent - session.assisted) + " sem execução"));
        item.append(trainingElement("p", "note", trainingMethodText(session)));
        if (session.context) item.append(trainingElement("p", "note", "Contexto: " + session.context));
        if (session.notes) item.append(trainingElement("p", "note", session.notes));
        if (session.reward) item.append(trainingElement("p", "note", "Recompensa: " + session.reward.name + " · " +
          fmt(session.reward.grams, 1) + " g" + (trainingRewardEntry(session.id) ? " · ligada aos snacks" : " · só no histórico")));
        const actions = trainingElement("div", "training-history-actions");
        actions.append(trainingButton("Editar", () => editTrainingSession(session.id), "ghost"));
        actions.append(
        trainingButton(
            "Eliminar",
            () => confirmTrainingDelete(session.id, item),
            "ghost"
        )
        );
        item.append(actions);
        body.append(item);
      }
      $("trainingHistoryMore").hidden = sessions.length <= trainingHistoryLimit;
    }

    function initTraining() {
      resetTrainingSession();
      renderTraining();
      $("newTrickButton").addEventListener("click", () => editTrainingTrick());
      $("cancelTrickButton").addEventListener("click", () => $("trainingTrickDialog").close());
      $("trainingTrickForm").addEventListener("submit", saveTrainingTrick);
      $("trainingSessionForm").addEventListener("submit", saveTrainingSession);
      $("cancelTrainingSession").addEventListener("click", resetTrainingSession);
      for (const id of ["trainingAttempts", "trainingIndependent", "trainingAssisted"]) {
        $(id).addEventListener("input", updateTrainingAttempts);
      }
      $("trainingRewardFood").addEventListener("change", () => {
        if (getFood($("trainingRewardFood").value)?.type === "snack") {
          $("trainingUsedFood").checked = true;
          $("trainingUsedFood").indeterminate = false;
        }
        updateTrainingReward();
      });
      for (const id of ["trainingMinutes", "trainingSeconds"]) {
        $(id).addEventListener("input", trainingDurationSeconds);
      }
      for (const id of ["trainingUsedClicker", "trainingUsedFood"]) {
        $(id).addEventListener("change", () => {
          $(id).indeterminate = false;
          if (id === "trainingUsedFood" && !$(id).checked && $("trainingRewardFood").value) {
            $(id).checked = true;
            $("trainingMethodHint").textContent = "Há um snack selecionado como recompensa. Escolhe Sem snack registado para indicar que não houve recompensa alimentar.";
          }
        });
      }
      $("trainingDate").addEventListener("change", updateTrainingReward);
      document.querySelectorAll("[data-training-filter]").forEach(button => {
        button.addEventListener("click", () => { trainingFilter = button.dataset.trainingFilter; renderTraining(); });
      });
      $("trainingHistoryReset").addEventListener("click", () => {
        trainingHistoryTrick = null; trainingHistoryLimit = 6; renderTrainingHistory();
      });
      $("trainingHistoryMore").addEventListener("click", () => { trainingHistoryLimit += 12; renderTrainingHistory(); });
    }

    // SAÚDE

    function migrateHealth(stored) {
      const h = {
        identity: null,
        records: [],
        visits: [],
        vets: [],
        genetic: { fatherName: "Thor Monterrey*PT", fatherLab: "LABOKLIN", fatherDate: "2024-05-24", motherName: "Alexa Monterrey*PT", motherLab: "LABOKLIN", motherDate: "2024-06-20", results: [] },
        documents: [],
        diary: [],
        screenings: [],
        medications: []
      };

      if (!stored) return h;

      h.identity = (stored.identity && typeof stored.identity === "object") ? stored.identity : null;

      if (Array.isArray(stored.records)) {
        h.records = stored.records.filter(r =>
          r && typeof r.id === "string" && typeof r.name === "string" && r.name.trim() !== "" &&
          ["vaccine", "deworming"].includes(r.type)
        ).map(r => ({
          ...r,
          batch: r.batch || null,
          dose: r.dose || null,
          adminVet: r.adminVet || null,
          appointmentDate: r.appointmentDate || null,
          status: r.status || (r.done ? "administered" : "planned"),
          subtype: r.subtype || null
        }));
      }

      if (Array.isArray(stored.visits)) {
        h.visits = stored.visits.map(v => ({
          ...v,
          status: v.status || (v.date && v.date <= new Date().toISOString().slice(0, 10) ? "completed" : "planned"),
          visitType: v.visitType || "consultation",
          clinic: v.clinic || null,
          symptoms: v.symptoms || null,
          findings: v.findings || null,
          treatment: v.treatment || null
        }));
      }

      if (Array.isArray(stored.vets)) {
        h.vets = stored.vets;
      } else if (stored.vet && typeof stored.vet === "object" && (stored.vet.clinicName || stored.vet.vetName)) {
        h.vets = [{ id: makeId(), role: "primary", clinicName: stored.vet.clinicName || "", vetName: stored.vet.vetName || "", phone: stored.vet.phone || "", emergency: stored.vet.emergency || "", address: stored.vet.address || "", notes: stored.vet.notes || "" }];
      }

      if (stored.genetic && typeof stored.genetic === "object") {
        if (Array.isArray(stored.genetic.results)) {
          h.genetic = stored.genetic;
          // Normalize condition names updated in seed
          const pkd = h.genetic.results.find(r => r.id === "g-pkd1");
          if (pkd && pkd.condition === "PKD1") pkd.condition = "PKD1 — Doença renal poliquística";
        } else {
          h.genetic.fatherName = stored.genetic.fatherName || h.genetic.fatherName;
          h.genetic.motherName = stored.genetic.motherName || h.genetic.motherName;
        }
      }

      if (Array.isArray(stored.documents)) h.documents = stored.documents;
      if (Array.isArray(stored.diary)) h.diary = stored.diary;
      if (Array.isArray(stored.screenings)) h.screenings = stored.screenings;
      if (Array.isArray(stored.medications)) h.medications = stored.medications;

      return h;
    }

    function seedHealthData() {
      const GENETIC_RESULTS_SEED = [
        { id: "g-hcm1",  condition: "HCM1 — MYBPC3 A31P",                        gene: "MYBPC3", sauron: "", father: "N/N",   mother: "N/N",   sauronDirect: false },
        { id: "g-hcm3",  condition: "HCM3 — MYBPC3 R820W",                       gene: "MYBPC3", sauron: "", father: "N/N",   mother: "N/N",   sauronDirect: false },
        { id: "g-pkd1",  condition: "PKD1 — Doença renal poliquística",           gene: "PKD1",   sauron: "", father: "N/N",   mother: "N/N",   sauronDirect: false },
        { id: "g-pkdef", condition: "Deficiência de Piruvato Quinase",            gene: "PKLR",   sauron: "", father: "N/N",   mother: "N/PK",  sauronDirect: false },
        { id: "g-pra",   condition: "Atrofia Progressiva da Retina (rdAc-PRA)",   gene: "CEP290", sauron: "", father: "N/N",   mother: "N/N",   sauronDirect: false },
        { id: "g-sma",   condition: "Atrofia Muscular Espinhal (SMA)",            gene: "LIX1",   sauron: "", father: "N/N",   mother: "N/N",   sauronDirect: false },
        { id: "g-gsd4",  condition: "Doença de Armazenamento de Glicogénio IV",   gene: "GBE1",   sauron: "", father: "N/N",   mother: "N/N",   sauronDirect: false },
        { id: "g-fx1",   condition: "Deficiência do Fator XI",                    gene: "F11",    sauron: "", father: "N/FXI", mother: "N/N",   sauronDirect: false }
      ];

      const VACCINE_SEED = [
        { id: "vac-1", type: "vaccine", subtype: null, name: "Trivalente — 1.ª dose", product: "Versifel CVR (Zoetis)", batch: "872639", dose: null, adminVet: null, date: "2026-09-17", appointmentDate: null, nextDue: null, notes: "", done: true, status: "administered" },
        { id: "vac-2", type: "vaccine", subtype: null, name: "Trivalente — 2.ª dose", product: "Versifel CVR (Zoetis)", batch: "861072", dose: null, adminVet: null, date: "2026-10-08", appointmentDate: null, nextDue: null, notes: "", done: true, status: "administered" },
        { id: "vac-3", type: "vaccine", subtype: null, name: "Trivalente — 3.ª dose (reforço)", product: null, batch: null, dose: null, adminVet: null, date: null, appointmentDate: "2026-10-29", nextDue: null, notes: "Próximo reforço a confirmar com o veterinário.", done: false, status: "planned" }
      ];

      const VISIT_SEED = [
        { id: "vis-surg", date: "2026-10-15", status: "completed", visitType: "surgery", reason: "Orquiectomia (esterilização)", vet: null, clinic: null, weightKg: null, weightId: null, symptoms: null, findings: null, treatment: "Esterilização realizada com sucesso.", nextDate: null, notes: "" },
        { id: "vis-vac3", date: "2026-10-29", status: "planned", visitType: "vaccination", reason: "3.ª dose vacinal + consulta de rotina", vet: null, clinic: null, weightKg: null, weightId: null, symptoms: null, findings: null, treatment: null, nextDate: null, notes: "Consulta agendada. Data e estado a confirmar." }
      ];

      if (health.genetic.results.length === 0) {
        health.genetic.results = GENETIC_RESULTS_SEED.map(r => ({ ...r }));
      }

      for (const seed of VACCINE_SEED) {
        if (!health.records.some(r => r.id === seed.id)) {
          health.records.push({ ...seed });
        }
      }

      const dewSeed = { id: "dew-1", type: "deworming", subtype: "unknown", name: "Desparasitação — data de nascimento ou primeira consulta", product: null, batch: null, dose: null, adminVet: null, date: "2026-09-17", appointmentDate: null, nextDue: null, notes: "Produto não confirmado. Peso na altura: aprox. 1,300 kg (a verificar). Próximo tratamento a confirmar com o veterinário.", done: true, status: "administered" };
      if (!health.records.some(r => r.id === "dew-1")) health.records.push(dewSeed);

      for (const seed of VISIT_SEED) {
        if (!health.visits.some(v => v.id === seed.id)) {
          health.visits.push({ ...seed });
        }
      }

      if (!health.identity) {
        health.identity = { registeredName: "Sauron Titan Cat's", commonName: "Sauron", breed: "Maine Coon", sex: "Macho", birthDate: "2026-07-18", microchip: "", siac: "Registado", neutered: "sim", neuteringDate: "2026-10-15", bloodType: "", allergies: "", notes: "" };
      }
    }

    function validHealthRecord(rec) {
      return (
        rec &&
        typeof rec.id === "string" &&
        typeof rec.name === "string" &&
        rec.name.trim() !== "" &&
        ["vaccine", "deworming"].includes(rec.type) &&
        (rec.subtype == null || ["internal", "external", "unknown"].includes(rec.subtype)) &&
        (rec.date == null || validDate(rec.date)) &&
        (rec.nextDue == null || validDate(rec.nextDue)) &&
        typeof rec.done === "boolean"
      );
    }

    function healthDaysUntil(dateStr) {
      if (!validDate(dateStr)) return null;
      return Math.round((dateStamp(dateStr) - dateStamp(today())) / DAY);
    }

    function healthDueLabel(dateStr) {
      if (!validDate(dateStr)) return "—";
      const days = healthDaysUntil(dateStr);
      if (days < 0) return "Em atraso · " + displayDate(dateStr);
      if (days === 0) return "Hoje · " + displayDate(dateStr);
      if (days === 1) return "Amanhã · " + displayDate(dateStr);
      if (days <= 30) return "Em " + days + " " + plural(days, "dia", "dias") + " · " + displayDate(dateStr);
      return displayDate(dateStr);
    }

    function healthStatusInfo(rec) {
      if (rec.status === "cancelled") return { text: "Cancelado", state: "done" };
      if (rec.status === "postponed") return { text: "Adiado", state: "unknown" };
      if (rec.status === "administered" || rec.done) return { text: "Administrado", state: "done" };

      const checkDate = rec.appointmentDate || rec.nextDue || rec.date;
      if (validDate(checkDate)) {
        const days = healthDaysUntil(checkDate);
        if (days < 0) return { text: "Em atraso", state: "overdue" };
        if (days === 0) return { text: "Hoje", state: "upcoming" };
        if (days <= 7) return { text: "Próximo", state: "upcoming" };
        return { text: "Agendado", state: "scheduled" };
      }
      return { text: "Por agendar", state: "unknown" };
    }

    function renderHealthOverview() {
      const container = $("healthNextUp");
      container.replaceChildren();

      const items = [];

      health.records
        .filter(rec => rec.status !== "administered" && rec.status !== "cancelled" && !rec.done)
        .forEach(rec => {
          const checkDate = rec.appointmentDate || rec.nextDue;
          if (validDate(checkDate)) {
            const days = healthDaysUntil(checkDate);
            items.push({ name: rec.name, days, date: checkDate, kind: rec.type === "vaccine" ? "Vacina" : "Desparasitação", product: rec.product });
          }
        });

      health.visits
        .filter(v => v.status === "planned" && validDate(v.date))
        .forEach(v => {
          const days = healthDaysUntil(v.date);
          items.push({ name: v.reason || "Consulta", days, date: v.date, kind: "Consulta", product: null });
        });

      health.screenings
        .filter(s => !s.completedDate && validDate(s.plannedDate))
        .forEach(s => {
          const days = healthDaysUntil(s.plannedDate);
          items.push({ name: s.name, days, date: s.plannedDate, kind: "Rastreio", product: null });
        });

      health.medications
        .filter(m => m.status === "active")
        .forEach(m => {
          const endDays = m.endDate ? healthDaysUntil(m.endDate) : null;
          if (endDays !== null && endDays >= 0 && endDays <= 14) {
            items.push({ name: m.name, days: endDays, date: m.endDate, kind: "Medicação fim", product: null });
          }
        });

      items.sort((a, b) => a.days - b.days);
      const top = items.slice(0, 5);

      if (!top.length) {
        const p = document.createElement("p");
        p.className = "hint";
        p.textContent = "Sem eventos agendados próximos.";
        container.append(p);
        return;
      }

      const grid = document.createElement("div");
      grid.className = "grid";

      for (const item of top) {
        const box = document.createElement("div");
        box.className = "box";

        const lab = document.createElement("div");
        lab.className = "lab";
        lab.textContent = item.kind + " · " + item.name;

        const big = document.createElement("div");
        big.className = "big";
        if (item.days < 0) { big.textContent = "Em atraso"; big.style.color = "var(--fire)"; }
        else if (item.days === 0) { big.textContent = "Hoje"; big.style.color = "#dbbb83"; }
        else { big.textContent = "Em " + item.days + " " + plural(item.days, "dia", "dias"); }

        const note = document.createElement("p");
        note.className = "note";
        note.textContent = displayDate(item.date) + (item.product ? " · " + item.product : "");

        box.append(lab, big, note);
        grid.append(box);
      }

      container.append(grid);
    }

    function renderHealthTable(type, bodyId) {
      const body = $(bodyId);
      body.replaceChildren();

      const records = health.records.filter(rec => rec.type === type);
      const colCount = type === "vaccine" ? 7 : 6;

      if (!records.length) {
        emptyRow(body, colCount, "Sem registos. Usa o botão acima para adicionar.");
        return;
      }

      for (const rec of records) {
        const row = document.createElement("tr");

        const subtypeLabel = rec.subtype === "internal" ? "Interna" : rec.subtype === "external" ? "Externa" : rec.subtype === "unknown" ? "Não confirmado" : "";
        const label = type === "deworming"
          ? subtypeLabel + (rec.name ? " · " + rec.name : "")
          : rec.name;

        const info = healthStatusInfo(rec);
        const statusCell = document.createElement("td");
        statusCell.textContent = info.text;
        statusCell.dataset.state = info.state;

        row.append(makeCell(label));
        row.append(makeCell(rec.date ? displayDate(rec.date) : "—"));

        if (type === "vaccine") {
          row.append(makeCell(rec.appointmentDate ? displayDate(rec.appointmentDate) : "—"));
        }

        const productBatch = [rec.product, rec.batch ? "Lote: " + rec.batch : null].filter(Boolean).join(" · ") || "—";
        row.append(makeCell(rec.nextDue ? healthDueLabel(rec.nextDue) : "—"));
        row.append(makeCell(productBatch));
        row.append(statusCell);

        const actionCell = document.createElement("td");

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = "Editar";
        editBtn.addEventListener("click", () => editHealthRecord(rec.id));

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "ghost";
        removeBtn.textContent = "Remover";
        removeBtn.addEventListener("click", () => {
          health.records = health.records.filter(r => r.id !== rec.id);
          persist();
          renderHealth();
          status("Registo removido.");
        });

        actionCell.append(editBtn, removeBtn);
        row.append(actionCell);
        body.append(row);
      }
    }

    function renderHealth() {
      renderHealthOverview();
      renderIdentity();
      renderHealthTable("vaccine", "vaccineRows");
      renderHealthTable("deworming", "dewormingRows");
      renderVisits();
      renderGeneticTable();
      renderDiary();
      renderScreenings();
      renderMedications();
      renderVets();
      renderDocuments();
    }

    function syncHealthSubtype() {
      $("hSubtypeField").hidden = $("hType").value !== "deworming";
    }

    function editHealthRecord(id = null) {
      healthEditingId = id;
      const existing = id ? health.records.find(r => r.id === id) : null;
      const rec = existing || {
        type: "vaccine", subtype: null,
        name: "", product: "", batch: null, adminVet: null,
        date: null, appointmentDate: null, nextDue: null,
        notes: "", done: false, status: "planned"
      };

      $("hType").value = rec.type;
      $("hSubtype").value = rec.subtype || "internal";
      $("hName").value = rec.name;
      $("hProduct").value = rec.product || "";
      $("hBatch").value = rec.batch || "";
      $("hAdminVet").value = rec.adminVet || "";
      $("hDate").max = today();
      $("hDate").value = rec.date || "";
      $("hNextDue").value = rec.nextDue || "";
      $("hAppointmentDate").value = rec.appointmentDate || "";
      $("hStatus").value = rec.status || (rec.done ? "administered" : "planned");
      $("hNotes").value = rec.notes || "";
      $("hDone").checked = rec.done || rec.status === "administered";
      $("healthEditorTitle").textContent = id ? "Editar registo" : "Novo registo";
      syncHealthSubtype();

      $("healthEditor").hidden = false;
      $("healthEditor").scrollIntoView({ behavior: "smooth", block: "start" });
      $("hName").focus();
    }

    function closeHealthEditor() {
      healthEditingId = null;
      if ($("healthEditor")) $("healthEditor").hidden = true;
      if ($("visitEditor")) $("visitEditor").hidden = true;
      if ($("documentEditor")) $("documentEditor").hidden = true;
      if ($("diaryEditor")) $("diaryEditor").hidden = true;
      if ($("screeningEditor")) $("screeningEditor").hidden = true;
      if ($("medicationEditor")) $("medicationEditor").hidden = true;
      if ($("vetEditor")) $("vetEditor").hidden = true;
      if ($("geneticResultEditor")) $("geneticResultEditor").hidden = true;
      if ($("identityForm")) { $("identityForm").hidden = true; if ($("editIdentityBtn")) $("editIdentityBtn").hidden = false; }
      if ($("geneticMetaForm")) { $("geneticMetaForm").hidden = true; if ($("editGeneticMetaBtn")) $("editGeneticMetaBtn").hidden = false; }
    }

    function saveHealthRecord(event) {
      event.preventDefault();

      const dateVal = $("hDate").value;
      const nextVal = $("hNextDue").value;
      const apptVal = $("hAppointmentDate").value;

      if (dateVal && !validDate(dateVal)) return;
      if (nextVal && !validDate(nextVal)) return;
      if (apptVal && !validDate(apptVal)) return;

      const rec = {
        id: healthEditingId || makeId(),
        type: $("hType").value,
        subtype: $("hType").value === "deworming" ? $("hSubtype").value : null,
        name: $("hName").value.trim(),
        product: $("hProduct").value.trim(),
        batch: $("hBatch").value.trim() || null,
        dose: null,
        adminVet: $("hAdminVet").value.trim() || null,
        date: dateVal || null,
        appointmentDate: apptVal || null,
        nextDue: nextVal || null,
        notes: $("hNotes").value.trim(),
        done: $("hDone").checked,
        status: $("hStatus").value
      };

      if (healthEditingId) {
        const idx = health.records.findIndex(r => r.id === healthEditingId);
        if (idx >= 0) health.records[idx] = rec;
        else health.records.push(rec);
      } else {
        health.records.push(rec);
      }

      if ((rec.status === "administered" || rec.done) && validDate(rec.nextDue)) {
        const alreadyExists = health.records.some(r =>
          r.id !== rec.id &&
          r.status !== "administered" &&
          !r.done &&
          r.name === rec.name &&
          r.type === rec.type &&
          r.nextDue === rec.nextDue
        );

        if (!alreadyExists) {
          health.records.push({
            id: makeId(),
            type: rec.type,
            subtype: rec.subtype,
            name: rec.name,
            product: rec.product,
            batch: null, dose: null, adminVet: null,
            date: null, appointmentDate: null,
            nextDue: rec.nextDue,
            notes: "", done: false, status: "planned"
          });
        }
      }

      persist();
      renderHealth();
      closeHealthEditor();
      status(rec.name + " guardado.");
    }

    // --- IDENTIFICAÇÃO ---

    function renderIdentity() {
      const display = $("identityDisplay");
      display.replaceChildren();
      const id = health.identity;
      if (!id) {
        const p = document.createElement("p");
        p.className = "note";
        p.textContent = "Nenhuma identificação registada ainda.";
        display.append(p);
        return;
      }
      const grid = document.createElement("div");
      grid.className = "identity-grid";

      function addField(label, value) {
        if (!value) return;
        const box = document.createElement("div");
        box.className = "identity-field";
        const lbl = document.createElement("div");
        lbl.className = "lab";
        lbl.textContent = label;
        const val = document.createElement("div");
        val.className = "val";
        val.textContent = value;
        box.append(lbl, val);
        grid.append(box);
      }

      addField("Nome comum", id.commonName);
      addField("Nome registado", id.registeredName);
      addField("Raça", id.breed);
      addField("Sexo", id.sex);
      addField("Nascimento", id.birthDate ? displayDate(id.birthDate) : null);
      addField("Microchip", id.microchip || null);
      addField("SIAC", id.siac || null);

      const neuteredLabel = id.neutered === "sim" ? "Sim" + (id.neuteringDate ? " · " + displayDate(id.neuteringDate) : "") : id.neutered === "nao" ? "Não" : null;
      addField("Esterilizado", neuteredLabel);
      addField("Tipo sanguíneo", id.bloodType || null);
      addField("Alergias", id.allergies || null);

      display.append(grid);

      if (id.notes) {
        const notes = document.createElement("p");
        notes.className = "note";
        notes.style.marginTop = "10px";
        notes.textContent = id.notes;
        display.append(notes);
      }
    }

    function openIdentityForm() {
      const id = health.identity || {};
      $("idCommonName").value = id.commonName || "";
      $("idRegisteredName").value = id.registeredName || "";
      $("idBreed").value = id.breed || "";
      $("idSex").value = id.sex || "Macho";
      $("idBirthDate").value = id.birthDate || "";
      $("idMicrochip").value = id.microchip || "";
      $("idSiac").value = id.siac || "";
      $("idNeutered").value = id.neutered || "";
      $("idNeuteringDate").value = id.neuteringDate || "";
      $("idBloodType").value = id.bloodType || "";
      $("idAllergies").value = id.allergies || "";
      $("idNotes").value = id.notes || "";
      $("identityForm").hidden = false;
      $("editIdentityBtn").hidden = true;
    }

    function closeIdentityForm() {
      $("identityForm").hidden = true;
      $("editIdentityBtn").hidden = false;
    }

    function saveIdentity(event) {
      event.preventDefault();
      health.identity = {
        commonName: $("idCommonName").value.trim(),
        registeredName: $("idRegisteredName").value.trim(),
        breed: $("idBreed").value.trim(),
        sex: $("idSex").value,
        birthDate: $("idBirthDate").value || null,
        microchip: $("idMicrochip").value.trim(),
        siac: $("idSiac").value,
        neutered: $("idNeutered").value,
        neuteringDate: $("idNeuteringDate").value || null,
        bloodType: $("idBloodType").value,
        allergies: $("idAllergies").value.trim(),
        notes: $("idNotes").value.trim()
      };
      persist();
      renderIdentity();
      closeIdentityForm();
      status("Identificação guardada.");
    }

    // --- CONSULTAS ---

    const VISIT_TYPE_LABELS = {
      consultation: "Consulta geral",
      vaccination: "Vacinação",
      surgery: "Cirurgia",
      examination: "Exame",
      followup: "Acompanhamento",
      other: "Outro"
    };

    const VISIT_STATUS_LABELS = {
      planned: "Agendada",
      completed: "Realizada",
      cancelled: "Cancelada"
    };

    function renderVisits() {
      const body = $("visitRows");
      const sorted = [...health.visits].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      body.replaceChildren();
      if (!sorted.length) {
        emptyRow(body, 7, "Ainda não existem consultas registadas.");
        return;
      }
      for (const v of sorted) {
        const row = document.createElement("tr");
        const actions = document.createElement("td");
        const editBtn = document.createElement("button");
        const delBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = "Editar";
        delBtn.type = "button";
        delBtn.textContent = "Eliminar";
        editBtn.addEventListener("click", () => editVisit(v.id));
        delBtn.addEventListener("click", () => {
          if (v.weightId) {
            weights = weights.filter(w => w.id !== v.weightId);
            const allWeights = [...weights].sort((a, b) => dateStamp(b.date) - dateStamp(a.date));
            if (allWeights.length > 0) {
              const clamped = String(Math.min(12, Math.max(0.5, Math.round(allWeights[0].weight * 10) / 10)));
              $("weight").value = clamped;
              $("weightInput").value = clamped;
            }
            renderPlan();
            renderGrowth();
          }
          health.visits = health.visits.filter(x => x.id !== v.id);
          renderVisits();
          if (persist()) status("Consulta eliminada.");
        });
        actions.style.display = "flex";
        actions.style.gap = "8px";
        actions.append(editBtn, delBtn);

        const statusCell = document.createElement("td");
        statusCell.textContent = VISIT_STATUS_LABELS[v.status] || v.status || "—";
        statusCell.className = "visit-status-" + (v.status || "planned");

        row.append(
          makeCell(displayDate(v.date)),
          makeCell(VISIT_TYPE_LABELS[v.visitType] || "—"),
          makeCell(v.reason || "—"),
          makeCell(v.vet || "—"),
          makeCell(v.weightKg != null ? fmt(v.weightKg, 2) + " kg" : "—"),
          statusCell,
          actions
        );
        body.append(row);
      }
    }

    function editVisit(id = null) {
      visitEditingId = id;
      const existing = id ? health.visits.find(v => v.id === id) : null;
      const v = existing || {
        date: today(), reason: "", vet: "",
        clinic: null, status: "planned", visitType: "consultation",
        weightKg: null, nextDate: null, notes: "",
        symptoms: null, findings: null, treatment: null
      };
      $("visDate").value = v.date || today();
      $("visVet").value = v.vet || "";
      $("visClinic").value = v.clinic || "";
      $("visReason").value = v.reason || "";
      $("visStatus").value = v.status || "planned";
      $("visType").value = v.visitType || "consultation";
      $("visWeight").value = v.weightKg != null ? v.weightKg : "";
      $("visNext").value = v.nextDate || "";
      $("visSymptoms").value = v.symptoms || "";
      $("visFindings").value = v.findings || "";
      $("visTreatment").value = v.treatment || "";
      $("visNotes").value = v.notes || "";
      $("visitEditorTitle").textContent = id ? "Editar consulta" : "Nova consulta";
      $("visitEditor").hidden = false;
      $("visitEditor").scrollIntoView({ behavior: "smooth", block: "start" });
      $("visReason").focus();
    }

    function closeVisitEditor() {
      visitEditingId = null;
      $("visitEditor").hidden = true;
    }

    function saveVisit(event) {
      event.preventDefault();
      const dateVal = $("visDate").value;
      if (!validDate(dateVal)) { status("Data inválida."); return; }
      const weightRaw = $("visWeight").value;
      const weightKg = weightRaw !== "" ? Number(weightRaw) : null;
      if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 20)) {
        status("Peso inválido."); return;
      }

      const existing = visitEditingId ? health.visits.find(v => v.id === visitEditingId) : null;
      let weightId = existing?.weightId || null;

      if (weightKg !== null) {
        if (weightId) {
          const wi = weights.findIndex(w => w.id === weightId);
          if (wi >= 0) {
            weights[wi] = { ...weights[wi], date: dateVal, weight: weightKg };
          } else {
            weightId = makeId();
            weights.push({ id: weightId, date: dateVal, weight: weightKg, source: "vet" });
          }
        } else {
          weightId = makeId();
          weights.push({ id: weightId, date: dateVal, weight: weightKg, source: "vet" });
        }
        const allWeights = [...weights].sort((a, b) => dateStamp(b.date) - dateStamp(a.date));
        const clamped = String(Math.min(12, Math.max(0.5, Math.round(allWeights[0].weight * 10) / 10)));
        $("weight").value = clamped;
        $("weightInput").value = clamped;
        renderPlan();
        renderGrowth();
      } else if (weightId) {
        weights = weights.filter(w => w.id !== weightId);
        weightId = null;
        renderPlan();
        renderGrowth();
      }

      const visit = {
        id: visitEditingId || makeId(),
        date: dateVal,
        status: $("visStatus").value,
        visitType: $("visType").value,
        reason: $("visReason").value.trim(),
        vet: $("visVet").value.trim(),
        clinic: $("visClinic").value.trim() || null,
        weightKg,
        weightId,
        nextDate: $("visNext").value || null,
        symptoms: $("visSymptoms").value.trim() || null,
        findings: $("visFindings").value.trim() || null,
        treatment: $("visTreatment").value.trim() || null,
        notes: $("visNotes").value.trim()
      };

      if (visitEditingId) {
        const idx = health.visits.findIndex(v => v.id === visitEditingId);
        if (idx >= 0) health.visits[idx] = visit;
        else health.visits.push(visit);
      } else {
        health.visits.push(visit);
      }

      persist();
      renderVisits();
      closeVisitEditor();
      status("Consulta guardada.");
    }

    // --- PERFIL GENÉTICO ---

    // ── GENETIC CONDITIONS REFERENCE DATA ──
    const GENETIC_CONDITIONS = {
      "g-hcm1": {
        displayName: "HCM1 — Cardiomiopatia hipertrófica (MYBPC3 A31P)",
        inheritance: "dominant",
        what: "Uma doença que provoca o espessamento anormal do músculo do coração, podendo dificultar o seu funcionamento.",
        consequences: "Em alguns gatos, pode provocar dificuldades respiratórias, insuficiência cardíaca ou outras complicações.",
        transmission: "A variante HCM1 analisada está associada a hereditariedade autossómica dominante, com expressão clínica variável.",
        testMeaning: "Identifica uma variante genética associada à HCM em Maine Coons. Um resultado N/N é favorável para esta variante, mas não exclui outras causas de doença cardíaca."
      },
      "g-hcm3": {
        displayName: "HCM3 — Cardiomiopatia hipertrófica (MYBPC3 R820W)",
        inheritance: "dominant",
        what: "Outra variante genética associada à cardiomiopatia hipertrófica, estudada sobretudo na raça Ragdoll.",
        consequences: "Pode estar associada ao espessamento anormal do músculo cardíaco.",
        transmission: "Autossómica dominante, com expressão variável.",
        testMeaning: "Verifica a presença da variante R820W. Um resultado N/N significa que esta variante não foi identificada. Não é um rastreio completo de todas as doenças cardíacas."
      },
      "g-pkd1": {
        displayName: "PKD1 — Doença renal poliquística",
        inheritance: "dominant",
        what: "Uma doença hereditária em que se formam quistos nos rins.",
        consequences: "Em animais afetados, os quistos podem prejudicar progressivamente a função renal.",
        transmission: "Autossómica dominante para a variante testada.",
        testMeaning: "Verifica uma variante específica associada à doença. Um resultado N/N é favorável, mas não exclui todas as possíveis doenças renais."
      },
      "g-pkdef": {
        displayName: "PKDef — Deficiência de piruvato quinase (PKLR)",
        inheritance: "recessive",
        what: "Uma alteração genética que afeta uma enzima necessária para os glóbulos vermelhos produzirem energia.",
        consequences: "Nos gatos afetados, pode provocar anemia, fraqueza e cansaço.",
        transmission: "Autossómica recessiva.",
        testMeaning: "Um gato com uma cópia da variante (N/PK) é considerado portador. Normalmente não apresenta a forma recessiva da doença, mas pode transmitir a variante aos descendentes."
      },
      "g-pra": {
        displayName: "PRA — Atrofia progressiva da retina (rdAc-PRA)",
        inheritance: "recessive",
        what: "Uma doença hereditária que provoca a deterioração progressiva das células da retina, responsáveis pela visão.",
        consequences: "Diminuição progressiva da visão e, em casos afetados, cegueira.",
        transmission: "Autossómica recessiva para a variante analisada.",
        testMeaning: "Um resultado N/N indica que a variante testada não foi identificada. Não exclui todas as possíveis doenças oculares."
      },
      "g-sma": {
        displayName: "SMA — Atrofia muscular espinhal (LIX1-LNPEP)",
        inheritance: "recessive",
        what: "Uma doença genética que afeta os nervos responsáveis pelo movimento dos músculos.",
        consequences: "Fraqueza muscular, alterações na marcha e dificuldades de movimento.",
        transmission: "Autossómica recessiva.",
        testMeaning: "Um resultado N/N indica que o gato não possui a variante testada associada a esta condição."
      },
      "g-gsd4": {
        displayName: "GSD IV — Doença de armazenamento de glicogénio tipo IV (GBE1)",
        inheritance: "recessive",
        what: "Uma doença hereditária que afeta a forma como o organismo armazena e utiliza o glicogénio, uma reserva de energia.",
        consequences: "Nos animais afetados, pode provocar alterações musculares, neurológicas e outros problemas graves.",
        transmission: "Autossómica recessiva.",
        testMeaning: "Um resultado N/N significa que a variante testada não foi identificada. Esta condição é especialmente estudada em gatos da raça Norwegian Forest Cat."
      },
      "g-fx1": {
        displayName: "FXI — Deficiência do fator XI (F11)",
        inheritance: "recessive",
        what: "Uma alteração genética relacionada com uma proteína que participa na coagulação do sangue.",
        consequences: "Em gatos afetados, pode aumentar o risco de hemorragias, especialmente após cirurgias ou traumatismos.",
        transmission: "Autossómica recessiva, segundo o relatório laboratorial.",
        testMeaning: "Um resultado N/FXI significa que o gato é heterozigótico para a variante. É importante guardar esta informação no historial veterinário, especialmente antes de procedimentos cirúrgicos."
      }
    };

    // ── POPOVER ENGINE ──
    let _genPopover = null;
    let _genPopoverCleanup = null;

    function getGenPopover() {
      if (!_genPopover) {
        _genPopover = document.createElement("div");
        _genPopover.className = "gen-popover";
        _genPopover.setAttribute("role", "dialog");
        _genPopover.setAttribute("aria-modal", "false");
        _genPopover.hidden = true;
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "gen-popover-close";
        closeBtn.setAttribute("aria-label", "Fechar");
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", closeGenPopover);
        _genPopover.append(closeBtn);
        document.body.append(_genPopover);
      }
      return _genPopover;
    }

    function closeGenPopover() {
      const p = _genPopover;
      if (!p) return;
      p.hidden = true;
      if (_genPopoverCleanup) { _genPopoverCleanup(); _genPopoverCleanup = null; }
    }

    function openGenPopover(anchorEl, titleText, bodyHTML, ariaLabel) {
      closeGenPopover();
      const p = getGenPopover();
      p.setAttribute("aria-label", ariaLabel || titleText);
      while (p.children.length > 1) p.removeChild(p.lastChild);
      if (titleText) {
        const t = document.createElement("div");
        t.className = "gen-popover-title";
        t.textContent = titleText;
        p.append(t);
      }
      const body = document.createElement("div");
      body.innerHTML = bodyHTML;
      p.append(body);
      p.hidden = false;
      positionGenPopover(anchorEl);
      function onKey(e) { if (e.key === "Escape") closeGenPopover(); }
      function onOutside(e) {
        if (!p.contains(e.target) && e.target !== anchorEl) closeGenPopover();
      }
      setTimeout(() => document.addEventListener("click", onOutside, { once: true }), 0);
      document.addEventListener("keydown", onKey);
      _genPopoverCleanup = () => {
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("click", onOutside);
      };
    }

    function positionGenPopover(anchor) {
      const p = _genPopover;
      if (!p || !anchor) return;
      const rect = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pw = Math.min(340, vw - 20);
      p.style.maxWidth = pw + "px";
      p.style.width = "";
      let left = rect.left;
      let top = rect.bottom + 6;
      if (left + pw > vw - 10) left = Math.max(10, vw - pw - 10);
      if (top + 300 > vh) top = Math.max(10, rect.top - 310);
      if (top < 10) top = 10;
      p.style.left = left + "px";
      p.style.top = top + "px";
    }

    // ── RESULT INTERPRETATION ──
    function buildSection(label, text) {
      if (!text) return "";
      const lbl = label ? `<strong>${label}</strong>` : "";
      return `<div class="gen-popover-section">${lbl}<span>${text}</span></div>`;
    }

    function conditionPopoverBody(cond) {
      if (!cond) return "";
      return buildSection("O que é?", cond.what) +
        buildSection("O que pode causar?", cond.consequences) +
        buildSection("Como se transmite?", cond.transmission) +
        buildSection("O que significa o teste?", cond.testMeaning);
    }

    function interpretResult(conditionId, genotype, isDirect) {
      const cond = GENETIC_CONDITIONS[conditionId];
      const inh = cond ? cond.inheritance : "recessive";
      if (!genotype) {
        return {
          label: "Não testado", sublabel: "Sem resultado documentado",
          color: "var(--mut)", italic: true,
          popoverTitle: "Resultado: Não testado",
          popoverBody: buildSection(null, "Não existe um resultado genético individual documentado para este animal. As probabilidades teóricas com base nos progenitores estão disponíveis em separado.")
        };
      }
      if (genotype === "N/N") {
        return {
          label: "N/N", sublabel: "Favorável", color: "#82bf78",
          popoverTitle: "Resultado: Favorável — variante não identificada",
          popoverBody: buildSection(null, "Não foi identificada nenhuma cópia da variante genética analisada. É um resultado favorável para este teste específico, mas não garante ausência de todas as formas da doença.")
        };
      }
      if (genotype.startsWith("N/")) {
        if (inh === "dominant") {
          return {
            label: genotype, sublabel: "Variante identificada", color: "#e0a38c",
            popoverTitle: "Resultado: Variante identificada — requer interpretação veterinária",
            popoverBody: buildSection(null, "Foi identificada uma cópia da variante genética. Nesta condição com padrão de transmissão dominante, uma única cópia pode ter relevância clínica, dependendo da variante e da sua penetrância. Consultar o veterinário para avaliação.")
          };
        }
        return {
          label: genotype, sublabel: "Portador/a", color: "#dbbb83",
          popoverTitle: "Resultado: Portador/a — uma cópia da variante",
          popoverBody: buildSection(null, "Foi identificada uma cópia da variante genética. Nas doenças autossómicas recessivas, os portadores geralmente não desenvolvem a forma típica da doença, mas podem transmitir a variante aos descendentes.") +
            (cond ? buildSection("Nota clínica específica", cond.testMeaning) : "")
        };
      }
      return {
        label: genotype, sublabel: "Duas cópias", color: "#e0a38c",
        popoverTitle: "Resultado: Duas cópias da variante — avaliação veterinária recomendada",
        popoverBody: buildSection(null, "Foram identificadas duas cópias da variante genética. A relevância clínica depende da condição específica. Este resultado não constitui um diagnóstico — consultar o veterinário para avaliação completa.")
      };
    }

    // ── INHERITANCE PROBABILITY CALCULATOR ──
    function calcInheritance(conditionId, fatherResult, motherResult) {
      const cond = GENETIC_CONDITIONS[conditionId];
      if (!cond || !fatherResult || !motherResult) return { type: "incomplete" };
      const fCarrier = fatherResult !== "N/N" && fatherResult !== "";
      const mCarrier = motherResult !== "N/N" && motherResult !== "";
      if (!fCarrier && !mCarrier) return { type: "both_nn" };
      if (cond.inheritance === "recessive") {
        const fHet = fatherResult.startsWith("N/") && fatherResult !== "N/N";
        const mHet = motherResult.startsWith("N/") && motherResult !== "N/N";
        if ((fHet && !mCarrier) || (!fCarrier && mHet)) return { type: "one_carrier" };
        if (fHet && mHet) return { type: "two_carriers" };
      }
      return { type: "complex" };
    }

    function inheritancePopoverBody(conditionId, fatherResult, motherResult, fatherName, motherName) {
      const calc = calcInheritance(conditionId, fatherResult, motherResult);
      const cond = GENETIC_CONDITIONS[conditionId];
      const inh = cond ? cond.inheritance : "recessive";
      const fName = fatherName || "Pai";
      const mName = motherName || "Mãe";
      if (calc.type === "incomplete") {
        return buildSection("Informação insuficiente", "Os dados genéticos de um ou ambos os progenitores não estão disponíveis. Não é possível calcular probabilidades de hereditariedade.");
      }
      if (calc.type === "both_nn") {
        const dom = inh === "dominant" ? buildSection("Nota (herança dominante)", "Para condições dominantes, um resultado N/N em ambos os progenitores é muito favorável, embora a expressão clínica possa variar.") : "";
        return buildSection("Variante não esperada pela herança documentada",
          `Ambos os progenitores (${fName} e ${mName}) apresentam N/N para esta variante. Assumindo que os resultados e a filiação estão corretos, não se espera que o Sauron tenha herdado esta variante. Isto não substitui um teste individual nem exclui outras causas da doença.`) + dom;
      }
      if (calc.type === "one_carrier") {
        const variantName = (fatherResult !== "N/N" ? fatherResult : motherResult).split("/")[1];
        const carrierParent = fatherResult !== "N/N" ? fName : mName;
        const bars = `<div class="gen-prob-bar">` +
          `<div class="gen-prob-item"><span class="gen-prob-pct" style="color:#82bf78">50%</span><span>N/N<br><small>não portador</small></span></div>` +
          `<div class="gen-prob-item"><span class="gen-prob-pct" style="color:#dbbb83">50%</span><span>N/${variantName}<br><small>portador/a</small></span></div>` +
          `</div>`;
        return buildSection("50% de probabilidade de ser portador/a",
          `O Sauron pode ter herdado ou não a variante do progenitor portador (${carrierParent}). Apenas um teste genético individual poderá confirmar qual dos dois resultados possui.`) +
          `<div class="gen-popover-section">${bars}<small style="color:var(--mut)">Probabilidades teóricas. Assumindo filiação e resultados documentados corretos.</small></div>`;
      }
      if (calc.type === "two_carriers") {
        return buildSection("Ambos os progenitores são portadores",
          "Quando dois portadores se cruzam, há uma probabilidade de 25% de N/N, 50% de portador/a e 25% de afetado. Apenas um teste individual pode confirmar o resultado do Sauron.");
      }
      return buildSection("Herança complexa", "A configuração genética dos progenitores não permite um cálculo de probabilidade simples. Consultar o veterinário.");
    }

    function geneticResultColor(val) {
      if (!val) return "var(--mut)";
      if (val === "N/N") return "#82bf78";
      if (val.startsWith("N/")) return "#dbbb83";
      return "#e0a38c";
    }

    function renderGeneticTable() {
      const metaDiv = $("geneticParentsMeta");
      const tableWrap = $("geneticTableWrap");
      metaDiv.replaceChildren();
      tableWrap.replaceChildren();

      const g = health.genetic;
      if (!g) return;

      // Parent meta boxes
      const metaGrid = document.createElement("div");
      metaGrid.className = "grid";
      metaGrid.style.marginBottom = "14px";

      function parentBox(name, lab, date, label) {
        const box = document.createElement("div");
        box.className = "box";
        const lbl = document.createElement("div");
        lbl.className = "lab";
        lbl.textContent = label;
        const nm = document.createElement("div");
        nm.style.cssText = "font-size:13px;margin-top:4px;color:var(--gold)";
        nm.textContent = name || "—";
        const meta = document.createElement("div");
        meta.style.cssText = "font-size:11px;color:var(--mut);margin-top:2px";
        meta.textContent = [lab, date ? displayDate(date) : null].filter(Boolean).join(" · ") || "—";
        box.append(lbl, nm, meta);
        return box;
      }

      metaGrid.append(parentBox(g.fatherName, g.fatherLab, g.fatherDate, "Pai"));
      metaGrid.append(parentBox(g.motherName, g.motherLab, g.motherDate, "Mãe"));
      metaDiv.append(metaGrid);

      if (!g.results || !g.results.length) {
        const p = document.createElement("p");
        p.className = "note";
        p.textContent = "Sem resultados genéticos registados.";
        tableWrap.append(p);
        return;
      }

      function makeInfoBtn(ariaLabel) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "gen-info-btn";
        btn.setAttribute("aria-label", ariaLabel);
        btn.textContent = "ⓘ";
        return btn;
      }

      function resultCell(conditionId, val, isDirect, showInheritance, fatherResult, motherResult) {
        const td = document.createElement("td");
        const interp = interpretResult(conditionId, val, isDirect);
        const span = document.createElement("span");
        span.textContent = interp.label;
        span.style.color = interp.color;
        if (interp.italic) span.style.fontStyle = "italic";
        const sub = document.createElement("span");
        sub.className = "gen-result-label";
        sub.textContent = interp.sublabel;
        td.append(span, sub);
        const infoBtn = makeInfoBtn("Explicação do resultado: " + interp.label);
        infoBtn.addEventListener("click", e => {
          e.stopPropagation();
          openGenPopover(infoBtn, interp.popoverTitle, interp.popoverBody, interp.popoverTitle);
        });
        td.append(infoBtn);
        if (showInheritance && (fatherResult || motherResult)) {
          const iBtn = makeInfoBtn("O que sabemos sobre o Sauron para esta condição");
          iBtn.style.cssText = "color:#dbbb83;margin-left:2px";
          iBtn.textContent = "★";
          const title = "O que sabemos sobre o Sauron?";
          const body = inheritancePopoverBody(conditionId, fatherResult, motherResult, g.fatherName, g.motherName);
          iBtn.addEventListener("click", e => {
            e.stopPropagation();
            openGenPopover(iBtn, title, body, title);
          });
          td.append(iBtn);
        }
        return td;
      }

      // ── DESKTOP TABLE ──
      const table = document.createElement("table");
      table.className = "health-table genetic-table";
      table.style.width = "100%";

      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");

      const thCond = document.createElement("th");
      thCond.scope = "col";
      thCond.textContent = "Condição";
      headerRow.append(thCond);

      const thSauron = document.createElement("th");
      thSauron.scope = "col";
      thSauron.textContent = "Sauron";
      const sauronNote = document.createElement("span");
      sauronNote.style.cssText = "font-size:10px;color:var(--mut);display:block;font-weight:normal";
      sauronNote.textContent = "sem teste individual";
      thSauron.append(sauronNote);
      headerRow.append(thSauron);

      const thFather = document.createElement("th");
      thFather.scope = "col";
      thFather.textContent = "Pai";
      const fatherNote = document.createElement("span");
      fatherNote.style.cssText = "font-size:10px;color:var(--mut);display:block;font-weight:normal";
      fatherNote.textContent = g.fatherName || "—";
      thFather.append(fatherNote);
      headerRow.append(thFather);

      const thMother = document.createElement("th");
      thMother.scope = "col";
      thMother.textContent = "Mãe";
      const motherNote = document.createElement("span");
      motherNote.style.cssText = "font-size:10px;color:var(--mut);display:block;font-weight:normal";
      motherNote.textContent = g.motherName || "—";
      thMother.append(motherNote);
      headerRow.append(thMother);

      thead.append(headerRow);
      table.append(thead);

      const tbody = document.createElement("tbody");
      for (const res of g.results) {
        const row = document.createElement("tr");
        const cond = GENETIC_CONDITIONS[res.id];

        const condCell = document.createElement("td");
        const condName = document.createElement("span");
        condName.textContent = res.condition;
        condCell.append(condName);
        if (res.gene) {
          const gene = document.createElement("span");
          gene.style.cssText = "color:var(--mut);font-size:10px;display:block";
          gene.textContent = res.gene;
          condCell.append(gene);
        }
        if (cond) {
          const condInfoBtn = makeInfoBtn("Informação sobre " + res.condition);
          condInfoBtn.addEventListener("click", e => {
            e.stopPropagation();
            openGenPopover(condInfoBtn, cond.displayName, conditionPopoverBody(cond), "Informação sobre " + res.condition);
          });
          condCell.append(condInfoBtn);
        }
        row.append(condCell);

        row.append(resultCell(res.id, res.sauron || "", false, true, res.father, res.mother));
        row.append(resultCell(res.id, res.father, true, false));
        row.append(resultCell(res.id, res.mother, true, false));

        tbody.append(row);
      }
      table.append(tbody);
      tableWrap.append(table);

      // ── MOBILE CARDS ──
      const cardsWrap = document.createElement("div");
      cardsWrap.className = "genetic-cards";
      for (const res of g.results) {
        const card = document.createElement("div");
        card.className = "genetic-card-item";
        const cond = GENETIC_CONDITIONS[res.id];

        const titleRow = document.createElement("div");
        titleRow.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap";
        const titleSpan = document.createElement("span");
        titleSpan.style.cssText = "font-size:13px;color:var(--tx)";
        titleSpan.textContent = res.condition;
        titleRow.append(titleSpan);
        if (cond) {
          const ci = makeInfoBtn("Informação sobre " + res.condition);
          ci.addEventListener("click", e => {
            e.stopPropagation();
            openGenPopover(ci, cond.displayName, conditionPopoverBody(cond), "Informação sobre " + res.condition);
          });
          titleRow.append(ci);
        }
        card.append(titleRow);

        function mobileResultRow(label, val, condId, showInher, fR, mR) {
          const mrow = document.createElement("div");
          mrow.className = "genetic-card-row";
          const lbl = document.createElement("span");
          lbl.className = "genetic-card-label";
          lbl.textContent = label;
          const interp = interpretResult(condId, val, label !== "Sauron");
          const vspan = document.createElement("span");
          vspan.style.cssText = "font-size:12px;color:" + interp.color + (interp.italic ? ";font-style:italic" : "");
          vspan.textContent = interp.label + (interp.sublabel ? " · " + interp.sublabel : "");
          const ib = makeInfoBtn("Explicação: " + interp.label);
          ib.addEventListener("click", e => {
            e.stopPropagation();
            openGenPopover(ib, interp.popoverTitle, interp.popoverBody, interp.popoverTitle);
          });
          mrow.append(lbl, vspan, ib);
          if (showInher && (fR || mR)) {
            const sb = makeInfoBtn("O que sabemos sobre o Sauron");
            sb.style.color = "#dbbb83";
            sb.textContent = "★";
            const mbody = inheritancePopoverBody(condId, fR, mR, health.genetic.fatherName, health.genetic.motherName);
            sb.addEventListener("click", e => {
              e.stopPropagation();
              openGenPopover(sb, "O que sabemos sobre o Sauron?", mbody, "Herança do Sauron");
            });
            mrow.append(sb);
          }
          return mrow;
        }
        card.append(mobileResultRow("Sauron", res.sauron || "", res.id, true, res.father, res.mother));
        card.append(mobileResultRow("Pai", res.father, res.id, false));
        card.append(mobileResultRow("Mãe", res.mother, res.id, false));

        cardsWrap.append(card);
      }
      tableWrap.append(cardsWrap);

      // ── EXPANDABLE SUMMARY ──
      const summaryDetails = document.createElement("details");
      summaryDetails.className = "gen-summary";
      const tog = document.createElement("summary");
      tog.className = "gen-summary-toggle";
      const togIcon = document.createElement("span");
      togIcon.textContent = "ⓘ";
      const togText = document.createElement("span");
      togText.textContent = "Compreender os resultados genéticos do Sauron";
      tog.append(togIcon, togText);
      const summaryBody = document.createElement("div");
      summaryBody.className = "gen-summary-body";
      const summaryLines = [
        "Os testes genéticos procuram alterações específicas no ADN que podem estar associadas a determinadas doenças.",
        "<strong>N/N</strong> significa que a variante analisada não foi identificada.",
        "Um resultado de <strong>portador/a</strong> significa que foi encontrada uma cópia da variante. Nas doenças recessivas, isto geralmente não significa que o gato esteja doente.",
        "O Sauron ainda não tem testes genéticos individuais documentados. As informações apresentadas sobre ele são estimativas baseadas nos resultados dos pais.",
        "No caso da <strong>deficiência de piruvato quinase</strong> e da <strong>deficiência do fator XI</strong>, existe uma probabilidade teórica de 50% de ser portador de cada uma das variantes.",
        "Os testes genéticos são úteis, mas não substituem as consultas e os exames veterinários."
      ];
      summaryLines.forEach(line => {
        const p = document.createElement("p");
        p.innerHTML = line;
        summaryBody.append(p);
      });
      summaryDetails.append(tog, summaryBody);
      tableWrap.append(summaryDetails);
    }

    function editGeneticResult(id = null) {
      geneticResultEditingId = id;
      const existing = id ? health.genetic.results.find(r => r.id === id) : null;
      const res = existing || { condition: "", gene: "", sauron: "", father: "", mother: "", sauronDirect: false, inheritanceNote: "" };
      $("grCondition").value = res.condition || "";
      $("grGene").value = res.gene || "";
      $("grSauron").value = res.sauron || "";
      $("grFather").value = res.father || "";
      $("grMother").value = res.mother || "";
      $("grNote").value = res.inheritanceNote || "";
      $("geneticResultEditorTitle").textContent = id ? "Editar resultado genético" : "Novo resultado genético";
      $("geneticResultEditor").hidden = false;
      $("geneticResultEditor").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeGeneticResultEditor() {
      geneticResultEditingId = null;
      $("geneticResultEditor").hidden = true;
    }

    function saveGeneticResult(event) {
      event.preventDefault();
      const res = {
        id: geneticResultEditingId || makeId(),
        condition: $("grCondition").value.trim(),
        gene: $("grGene").value.trim(),
        sauron: $("grSauron").value,
        father: $("grFather").value,
        mother: $("grMother").value,
        sauronDirect: false,
        inheritanceNote: $("grNote").value.trim()
      };
      if (geneticResultEditingId) {
        const idx = health.genetic.results.findIndex(r => r.id === geneticResultEditingId);
        if (idx >= 0) health.genetic.results[idx] = res;
        else health.genetic.results.push(res);
      } else {
        health.genetic.results.push(res);
      }
      persist();
      renderGeneticTable();
      closeGeneticResultEditor();
      status("Resultado genético guardado.");
    }

    function openGeneticMetaForm() {
      const g = health.genetic;
      $("gFatherName").value = g.fatherName || "";
      $("gFatherLab").value = g.fatherLab || "";
      $("gFatherDate").value = g.fatherDate || "";
      $("gMotherName").value = g.motherName || "";
      $("gMotherLab").value = g.motherLab || "";
      $("gMotherDate").value = g.motherDate || "";
      $("geneticMetaForm").hidden = false;
      $("editGeneticMetaBtn").hidden = true;
    }

    function closeGeneticMetaForm() {
      $("geneticMetaForm").hidden = true;
      $("editGeneticMetaBtn").hidden = false;
    }

    function saveGeneticMeta(event) {
      event.preventDefault();
      health.genetic.fatherName = $("gFatherName").value.trim();
      health.genetic.fatherLab = $("gFatherLab").value.trim();
      health.genetic.fatherDate = $("gFatherDate").value || null;
      health.genetic.motherName = $("gMotherName").value.trim();
      health.genetic.motherLab = $("gMotherLab").value.trim();
      health.genetic.motherDate = $("gMotherDate").value || null;
      persist();
      renderGeneticTable();
      closeGeneticMetaForm();
      status("Dados dos progenitores guardados.");
    }

    // --- DIÁRIO DE SAÚDE ---

    function renderDiary() {
      const list = $("diaryList");
      list.replaceChildren();
      if (!health.diary.length) {
        const p = document.createElement("p");
        p.className = "note";
        p.textContent = "Nenhuma observação registada ainda.";
        list.append(p);
        return;
      }
      const sorted = [...health.diary].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      const severityLabels = { mild: "Ligeira", moderate: "Moderada", severe: "Intensa" };
      const statusLabels = { ongoing: "Em curso", resolved: "Resolvido" };

      for (const entry of sorted) {
        const item = document.createElement("div");
        item.className = "diary-item";

        const info = document.createElement("div");
        info.style.flex = "1";

        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.gap = "10px";
        header.style.alignItems = "center";
        header.style.flexWrap = "wrap";

        const dateSpan = document.createElement("span");
        dateSpan.style.cssText = "font-size:12px;color:var(--mut)";
        dateSpan.textContent = displayDate(entry.date);

        const symptom = document.createElement("strong");
        symptom.style.fontSize = "14px";
        symptom.textContent = entry.symptom;

        const severity = document.createElement("span");
        severity.className = "diary-severity-" + (entry.severity || "mild");
        severity.style.cssText = "font-size:11px;padding:1px 6px;border:1px solid currentColor;border-radius:3px";
        severity.textContent = severityLabels[entry.severity] || entry.severity;

        const statusSpan = document.createElement("span");
        statusSpan.className = "diary-status-" + (entry.status || "ongoing");
        statusSpan.style.fontSize = "11px";
        statusSpan.textContent = statusLabels[entry.status] || entry.status;

        header.append(dateSpan, symptom, severity, statusSpan);
        info.append(header);

        if (entry.notes) {
          const notes = document.createElement("p");
          notes.style.cssText = "margin:4px 0 0;font-size:12px;color:var(--mut)";
          notes.textContent = entry.notes;
          info.append(notes);
        }

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:8px;flex-shrink:0;align-self:flex-start";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = "Editar";
        editBtn.addEventListener("click", () => editDiaryEntry(entry.id));
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = "Eliminar";
        delBtn.addEventListener("click", () => {
          health.diary = health.diary.filter(d => d.id !== entry.id);
          persist();
          renderDiary();
          status("Observação eliminada.");
        });
        actions.append(editBtn, delBtn);
        item.append(info, actions);
        list.append(item);
      }
    }

    function editDiaryEntry(id = null) {
      diaryEditingId = id;
      const existing = id ? health.diary.find(d => d.id === id) : null;
      const entry = existing || { date: today(), symptom: "", severity: "mild", status: "ongoing", notes: "" };
      $("dDate").value = entry.date || today();
      $("dSymptom").value = entry.symptom || "";
      $("dSeverity").value = entry.severity || "mild";
      $("dStatus").value = entry.status || "ongoing";
      $("dNotes").value = entry.notes || "";
      $("diaryEditorTitle").textContent = id ? "Editar observação" : "Nova observação";
      $("diaryEditor").hidden = false;
      $("diaryEditor").scrollIntoView({ behavior: "smooth", block: "start" });
      $("dSymptom").focus();
    }

    function closeDiaryEditor() {
      diaryEditingId = null;
      $("diaryEditor").hidden = true;
    }

    function saveDiaryEntry(event) {
      event.preventDefault();
      const entry = {
        id: diaryEditingId || makeId(),
        date: $("dDate").value || today(),
        symptom: $("dSymptom").value.trim(),
        severity: $("dSeverity").value,
        status: $("dStatus").value,
        notes: $("dNotes").value.trim()
      };
      if (diaryEditingId) {
        const idx = health.diary.findIndex(d => d.id === diaryEditingId);
        if (idx >= 0) health.diary[idx] = entry;
        else health.diary.push(entry);
      } else {
        health.diary.push(entry);
      }
      persist();
      renderDiary();
      closeDiaryEditor();
      status("Observação guardada.");
    }

    // --- RASTREIOS ---

    function renderScreenings() {
      const list = $("screeningList");
      list.replaceChildren();
      if (!health.screenings.length) {
        const p = document.createElement("p");
        p.className = "note";
        p.textContent = "Nenhum rastreio registado ainda.";
        list.append(p);
        return;
      }
      const sorted = [...health.screenings].sort((a, b) => (a.plannedDate || "9999").localeCompare(b.plannedDate || "9999"));
      for (const scr of sorted) {
        const item = document.createElement("div");
        item.className = "screening-item";

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.flexWrap = "wrap";
        row.style.gap = "8px";

        const info = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = scr.name;
        name.style.fontSize = "14px";
        info.append(name);

        const meta = [];
        if (scr.vetRecommended === "sim") meta.push("✓ Recomendado pelo veterinário");
        if (scr.plannedDate) meta.push("Planeado: " + displayDate(scr.plannedDate));
        if (scr.completedDate) meta.push("Realizado: " + displayDate(scr.completedDate));
        if (scr.nextDate) meta.push("Próximo: " + displayDate(scr.nextDate));

        if (meta.length) {
          const metaP = document.createElement("p");
          metaP.style.cssText = "margin:3px 0 0;font-size:12px;color:var(--mut)";
          metaP.textContent = meta.join(" · ");
          info.append(metaP);
        }

        if (scr.notes) {
          const notesP = document.createElement("p");
          notesP.style.cssText = "margin:3px 0 0;font-size:12px;color:var(--tx)";
          notesP.textContent = scr.notes;
          info.append(notesP);
        }

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:8px;flex-shrink:0;align-self:flex-start";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = "Editar";
        editBtn.addEventListener("click", () => editScreening(scr.id));
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = "Eliminar";
        delBtn.addEventListener("click", () => {
          health.screenings = health.screenings.filter(s => s.id !== scr.id);
          persist();
          renderScreenings();
          status("Rastreio eliminado.");
        });
        actions.append(editBtn, delBtn);
        row.append(info, actions);
        item.append(row);
        list.append(item);
      }
    }

    function editScreening(id = null) {
      screeningEditingId = id;
      const existing = id ? health.screenings.find(s => s.id === id) : null;
      const scr = existing || { name: "", vetRecommended: "", plannedDate: null, completedDate: null, nextDate: null, notes: "" };
      $("scrName").value = scr.name || "";
      $("scrVetRecommended").value = scr.vetRecommended || "";
      $("scrPlannedDate").value = scr.plannedDate || "";
      $("scrCompletedDate").value = scr.completedDate || "";
      $("scrNextDate").value = scr.nextDate || "";
      $("scrNotes").value = scr.notes || "";
      $("screeningEditorTitle").textContent = id ? "Editar rastreio" : "Novo rastreio";
      $("screeningEditor").hidden = false;
      $("screeningEditor").scrollIntoView({ behavior: "smooth", block: "start" });
      $("scrName").focus();
    }

    function closeScreeningEditor() {
      screeningEditingId = null;
      $("screeningEditor").hidden = true;
    }

    function saveScreening(event) {
      event.preventDefault();
      const scr = {
        id: screeningEditingId || makeId(),
        name: $("scrName").value.trim(),
        vetRecommended: $("scrVetRecommended").value,
        plannedDate: $("scrPlannedDate").value || null,
        completedDate: $("scrCompletedDate").value || null,
        nextDate: $("scrNextDate").value || null,
        notes: $("scrNotes").value.trim()
      };
      if (screeningEditingId) {
        const idx = health.screenings.findIndex(s => s.id === screeningEditingId);
        if (idx >= 0) health.screenings[idx] = scr;
        else health.screenings.push(scr);
      } else {
        health.screenings.push(scr);
      }
      persist();
      renderScreenings();
      closeScreeningEditor();
      status("Rastreio guardado.");
    }

    // --- MEDICAÇÃO ---

    function renderMedications() {
      const list = $("medicationList");
      list.replaceChildren();
      if (!health.medications.length) {
        const p = document.createElement("p");
        p.className = "note";
        p.textContent = "Nenhuma medicação registada ainda.";
        list.append(p);
        return;
      }
      const statusLabels = { active: "Ativo", completed: "Concluído", planned: "Planeado" };
      const sorted = [...health.medications].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
      for (const med of sorted) {
        const item = document.createElement("div");
        item.className = "medication-item";

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.flexWrap = "wrap";
        row.style.gap = "8px";

        const info = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = med.name;
        name.style.fontSize = "14px";
        info.append(name);

        const meta = [];
        if (med.purpose) meta.push(med.purpose);
        if (med.dose) meta.push(med.dose);
        if (med.frequency) meta.push(med.frequency);
        if (meta.length) {
          const metaP = document.createElement("p");
          metaP.style.cssText = "margin:3px 0 0;font-size:12px;color:var(--tx)";
          metaP.textContent = meta.join(" · ");
          info.append(metaP);
        }

        const dates = [];
        if (med.startDate) dates.push("Início: " + displayDate(med.startDate));
        if (med.endDate) dates.push("Fim: " + displayDate(med.endDate));
        if (med.vet) dates.push("Prescritor: " + med.vet);
        dates.push(statusLabels[med.status] || med.status);
        const datesP = document.createElement("p");
        datesP.style.cssText = "margin:3px 0 0;font-size:12px;color:var(--mut)";
        datesP.textContent = dates.join(" · ");
        info.append(datesP);

        if (med.notes) {
          const notesP = document.createElement("p");
          notesP.style.cssText = "margin:3px 0 0;font-size:12px;color:var(--mut)";
          notesP.textContent = med.notes;
          info.append(notesP);
        }

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:8px;flex-shrink:0;align-self:flex-start";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = "Editar";
        editBtn.addEventListener("click", () => editMedication(med.id));
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = "Eliminar";
        delBtn.addEventListener("click", () => {
          health.medications = health.medications.filter(m => m.id !== med.id);
          persist();
          renderMedications();
          status("Medicação eliminada.");
        });
        actions.append(editBtn, delBtn);
        row.append(info, actions);
        item.append(row);
        list.append(item);
      }
    }

    function editMedication(id = null) {
      medicationEditingId = id;
      const existing = id ? health.medications.find(m => m.id === id) : null;
      const med = existing || { name: "", purpose: "", dose: "", frequency: "", startDate: null, endDate: null, vet: "", status: "active", notes: "" };
      $("medName").value = med.name || "";
      $("medPurpose").value = med.purpose || "";
      $("medDose").value = med.dose || "";
      $("medFrequency").value = med.frequency || "";
      $("medStart").value = med.startDate || "";
      $("medEnd").value = med.endDate || "";
      $("medVet").value = med.vet || "";
      $("medStatus").value = med.status || "active";
      $("medNotes").value = med.notes || "";
      $("medicationEditorTitle").textContent = id ? "Editar medicação" : "Nova medicação";
      $("medicationEditor").hidden = false;
      $("medicationEditor").scrollIntoView({ behavior: "smooth", block: "start" });
      $("medName").focus();
    }

    function closeMedicationEditor() {
      medicationEditingId = null;
      $("medicationEditor").hidden = true;
    }

    function saveMedication(event) {
      event.preventDefault();
      const med = {
        id: medicationEditingId || makeId(),
        name: $("medName").value.trim(),
        purpose: $("medPurpose").value.trim(),
        dose: $("medDose").value.trim(),
        frequency: $("medFrequency").value.trim(),
        startDate: $("medStart").value || null,
        endDate: $("medEnd").value || null,
        vet: $("medVet").value.trim(),
        status: $("medStatus").value,
        notes: $("medNotes").value.trim()
      };
      if (medicationEditingId) {
        const idx = health.medications.findIndex(m => m.id === medicationEditingId);
        if (idx >= 0) health.medications[idx] = med;
        else health.medications.push(med);
      } else {
        health.medications.push(med);
      }
      persist();
      renderMedications();
      closeMedicationEditor();
      status("Medicação guardada.");
    }

    // --- VETERINÁRIO (múltiplos contactos) ---

    const VET_ROLE_LABELS = { primary: "Principal", historical: "Histórico", emergency: "Urgência" };

    function renderVets() {
      const list = $("vetList");
      list.replaceChildren();
      if (!health.vets.length) {
        const p = document.createElement("p");
        p.className = "note";
        p.textContent = "Nenhum veterinário registado ainda.";
        list.append(p);
        return;
      }
      for (const v of health.vets) {
        const item = document.createElement("div");
        item.className = "vet-item";

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.flexWrap = "wrap";
        row.style.gap = "8px";

        const info = document.createElement("div");
        const roleSpan = document.createElement("span");
        roleSpan.className = "vet-role-" + (v.role || "primary");
        roleSpan.style.cssText = "font-size:11px;padding:1px 6px;border:1px solid currentColor;border-radius:3px;margin-right:8px";
        roleSpan.textContent = VET_ROLE_LABELS[v.role] || v.role;

        const nameSpan = document.createElement("strong");
        nameSpan.textContent = v.vetName || v.clinicName || "—";
        nameSpan.style.fontSize = "14px";

        const header = document.createElement("div");
        header.append(roleSpan, nameSpan);
        info.append(header);

        const meta = [];
        if (v.clinicName && v.vetName) meta.push(v.clinicName);
        if (v.phone) meta.push("Tel. " + v.phone);
        if (v.emergency) meta.push("Urgência: " + v.emergency);
        if (v.address) meta.push(v.address);
        if (meta.length) {
          const metaP = document.createElement("p");
          metaP.style.cssText = "margin:3px 0 0;font-size:12px;color:var(--mut)";
          metaP.textContent = meta.join(" · ");
          info.append(metaP);
        }
        if (v.notes) {
          const notesP = document.createElement("p");
          notesP.style.cssText = "margin:3px 0 0;font-size:12px;color:var(--mut)";
          notesP.textContent = v.notes;
          info.append(notesP);
        }

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:8px;flex-shrink:0;align-self:flex-start";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = "Editar";
        editBtn.addEventListener("click", () => editVet(v.id));
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = "Eliminar";
        delBtn.addEventListener("click", () => {
          health.vets = health.vets.filter(x => x.id !== v.id);
          persist();
          renderVets();
          status("Contacto veterinário eliminado.");
        });
        actions.append(editBtn, delBtn);
        row.append(info, actions);
        item.append(row);
        list.append(item);
      }
    }

    function editVet(id = null) {
      vetEditingId = id;
      const existing = id ? health.vets.find(v => v.id === id) : null;
      const v = existing || { role: "primary", clinicName: "", vetName: "", phone: "", emergency: "", address: "", notes: "" };
      $("vRole").value = v.role || "primary";
      $("vClinic").value = v.clinicName || "";
      $("vVet").value = v.vetName || "";
      $("vPhone").value = v.phone || "";
      $("vEmergency").value = v.emergency || "";
      $("vAddress").value = v.address || "";
      $("vNotes").value = v.notes || "";
      $("vetEditorTitle").textContent = id ? "Editar contacto" : "Novo contacto";
      $("vetEditor").hidden = false;
      $("vetEditor").scrollIntoView({ behavior: "smooth", block: "start" });
      $("vClinic").focus();
    }

    function closeVetEditor() {
      vetEditingId = null;
      $("vetEditor").hidden = true;
    }

    function saveVet(event) {
      event.preventDefault();
      const v = {
        id: vetEditingId || makeId(),
        role: $("vRole").value,
        clinicName: $("vClinic").value.trim(),
        vetName: $("vVet").value.trim(),
        phone: $("vPhone").value.trim(),
        emergency: $("vEmergency").value.trim(),
        address: $("vAddress").value.trim(),
        notes: $("vNotes").value.trim()
      };
      if (vetEditingId) {
        const idx = health.vets.findIndex(x => x.id === vetEditingId);
        if (idx >= 0) health.vets[idx] = v;
        else health.vets.push(v);
      } else {
        health.vets.push(v);
      }
      persist();
      renderVets();
      closeVetEditor();
      status("Contacto veterinário guardado.");
    }

    // --- DOCUMENTOS ---

    const DOC_TYPE_LABELS = {
      genetic:   "Teste genético",
      vet:       "Relatório vet.",
      vaccine:   "Boletim vacinas",
      insurance: "Seguro",
      pedigree:  "Pedigree",
      other:     "Outro"
    };

    function renderDocuments() {
      const list = $("documentList");
      list.replaceChildren();
      if (!health.documents.length) {
        const p = document.createElement("p");
        p.className = "note";
        p.textContent = "Ainda não existem documentos guardados.";
        list.append(p);
        return;
      }
      const sorted = [...health.documents].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      for (const doc of sorted) {
        const item = document.createElement("div");
        item.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #76603c33";

        const info = document.createElement("div");
        info.style.flex = "1";
        const nameLink = document.createElement("a");
        nameLink.href = doc.url;
        nameLink.target = "_blank";
        nameLink.rel = "noopener noreferrer";
        nameLink.textContent = doc.name;
        nameLink.style.cssText = "color:var(--gold);font-size:14px;text-underline-offset:3px";

        const meta = document.createElement("div");
        meta.style.cssText = "color:var(--mut);font:11px/1.6 Arial,sans-serif;margin-top:2px";
        const parts = [DOC_TYPE_LABELS[doc.type] || doc.type];
        if (doc.date) parts.push(displayDate(doc.date));
        if (doc.notes) parts.push(doc.notes);
        meta.textContent = parts.join(" · ");

        info.append(nameLink, meta);

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:8px;flex-shrink:0";
        const editBtn = document.createElement("button");
        const delBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = "Editar";
        delBtn.type = "button";
        delBtn.textContent = "Eliminar";
        editBtn.addEventListener("click", () => editDocument(doc.id));
        delBtn.addEventListener("click", () => {
          health.documents = health.documents.filter(d => d.id !== doc.id);
          renderDocuments();
          if (persist()) status("Documento eliminado.");
        });
        actions.append(editBtn, delBtn);
        item.append(info, actions);
        list.append(item);
      }
    }

    function editDocument(id = null) {
      documentEditingId = id;
      const existing = id ? health.documents.find(d => d.id === id) : null;
      const doc = existing || { name: "", type: "genetic", date: null, url: "", notes: "" };
      $("docName").value = doc.name;
      $("docType").value = doc.type;
      $("docDate").value = doc.date || "";
      $("docUrl").value = doc.url;
      $("docNotes").value = doc.notes || "";
      $("documentEditorTitle").textContent = id ? "Editar documento" : "Novo documento";
      $("documentEditor").hidden = false;
      $("documentEditor").scrollIntoView({ behavior: "smooth", block: "start" });
      $("docName").focus();
    }

    function closeDocumentEditor() {
      documentEditingId = null;
      $("documentEditor").hidden = true;
    }

    function saveDocument(event) {
      event.preventDefault();
      const doc = {
        id: documentEditingId || makeId(),
        name: $("docName").value.trim(),
        type: $("docType").value,
        date: $("docDate").value || null,
        url: $("docUrl").value.trim(),
        notes: $("docNotes").value.trim()
      };
      if (documentEditingId) {
        const idx = health.documents.findIndex(d => d.id === documentEditingId);
        if (idx >= 0) health.documents[idx] = doc;
        else health.documents.push(doc);
      } else {
        health.documents.push(doc);
      }
      persist();
      renderDocuments();
      closeDocumentEditor();
      status("Documento guardado.");
    }

    // --- EXPORTAR / IMPORTAR ---

    function exportHealth() {
      const data = JSON.stringify({ version: 2, exported: today(), health }, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sauron-saude-" + today() + ".json";
      a.click();
      URL.revokeObjectURL(url);
    }

    function importHealth(file) {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (!parsed.health) { status("Ficheiro inválido: campo 'health' em falta."); return; }
          if (!confirm("Substituir todos os dados de saúde com o ficheiro importado? Esta ação não pode ser desfeita.")) return;
          health = migrateHealth(parsed.health);
          persist();
          renderHealth();
          status("Dados de saúde importados com sucesso.");
        } catch { status("Erro ao ler o ficheiro JSON."); }
      };
      reader.readAsText(file);
    }

    // ══════════════════════════════════════════════════════
    // PEDIGREE — READ-ONLY official CPF/FIFe data
    // ══════════════════════════════════════════════════════
    const PEDIGREE_NODES = [
      // Gen 0 — Sauron
      { id: "sauron",             name: "SAURON TITAN CATS*PT",              gen: 0, pos: 0,  sex: "M", ems: "MCO ns 22", reg: ["(PT) CPF LO 034971"], fatherId: "thor",         motherId: "alexa",              notes: "Data no SIAC: 16/07/2026. A discrepância com o pedigree (18/07/2026) não foi resolvida." },
      // Gen 1
      { id: "thor",               name: "THOR MONTERREY*PT",                 gen: 1, pos: 0,  sex: "M", ems: "MCO ns",    reg: ["(PT) CPF LO 030615"], fatherId: "cherekoon_roble", motherId: "chanel_moon" },
      { id: "alexa",              name: "ALEXA MONTERREY*PT",                gen: 1, pos: 1,  sex: "F", ems: "MCO fs 23", reg: ["(PT) CPF LO 030721"], fatherId: "damon",           motherId: "cherekoon_ice_seal" },
      // Gen 2
      { id: "cherekoon_roble",    name: "ES*CHEREKOON ROBLE",                gen: 2, pos: 0,  sex: null, ems: "MCO ds",    reg: ["(PT) CPF LO 028656"], fatherId: "chisum",          motherId: "oshet" },
      { id: "chanel_moon",        name: "CHANEL MOON ALPHA LYNXS*PT",        gen: 2, pos: 1,  sex: null, ems: "MCO f",     reg: ["(PT) CPF LO 028077"], fatherId: "soul_de_lisbeth", motherId: "starseed_mismire" },
      { id: "damon",              name: "DAMON LA AURORA-E",                 gen: 2, pos: 2,  sex: null, ems: "MCO ns 22", reg: ["(PT) CPF LO 024919", "(E (CFM-WCF) LO 30997)"], fatherId: "ic_martin", motherId: "junipera" },
      { id: "cherekoon_ice_seal", name: "ES*CHEREKOON ICE SEAL V",           gen: 2, pos: 3,  sex: null, ems: "MCO w 63",  reg: ["(PT) CPF LO 026123", "(ES) ASFE LO 60458"],      fatherId: "cherekoon_oso", motherId: "cherekoon_artic_fox" },
      // Gen 3
      { id: "chisum",             name: "ES*CHEREKOON CHISUM N IV",          gen: 3, pos: 0,  sex: null, ems: "MCO d 03 22", reg: ["(ES) ASFE LO 57959"],                           fatherId: "outlander",    motherId: "isabelle" },
      { id: "oshet",              name: "ES*CHEREKOON OSHET J IV",           gen: 3, pos: 1,  sex: null, ems: "MCO gs",      reg: ["(ES) ASFE LO 57445"],                           fatherId: "brno",         motherId: "dakota" },
      { id: "soul_de_lisbeth",    name: "SOUL DE LISBETH",                   gen: 3, pos: 2,  sex: null, ems: "MCO n",       reg: ["(PT) CPF LO 026789", "(LO-BC-0262-10-20-617-MCO)"], fatherId: "ulises", motherId: "jannet" },
      { id: "starseed_mismire",   name: "STARSEED MISMIRE",                  gen: 3, pos: 3,  sex: null, ems: "MCO e 22",    reg: ["(PT) CPF LO 027222", "(CFDC-WCF LO 2600)"],     fatherId: "garfield",     motherId: "kitty" },
      { id: "ic_martin",          name: "IC MARTIN OF ETHEREAL",             gen: 3, pos: 4,  sex: null, ems: "MCO ns 22",   reg: ["(ES) ASFE LO 28827", "(WCF-CFM LO 28827)"],     fatherId: "justcoons",    motherId: "kassiopea" },
      { id: "junipera",           name: "JUNIPERA RAMINAGROBIS",             gen: 3, pos: 5,  sex: null, ems: "MCO n 22",    reg: ["WCF LO 29233", "(LLO-LOC-FE)"],                 fatherId: "battle_creek", motherId: "knock_ayne" },
      { id: "cherekoon_oso",      name: "ES*CHEREKOON OSO P IV",             gen: 3, pos: 6,  sex: null, ems: "MCO n 25",    reg: ["(ES) ASFE LO 58105"],                           fatherId: "mainelynx",    motherId: "dark_snow" },
      { id: "cherekoon_artic_fox",name: "ES*CHEREKOON ARTIC FOX S IV",       gen: 3, pos: 7,  sex: null, ems: "MCO w 62",    reg: ["(ES) ASFE LO 58848"],                           fatherId: "utah",         motherId: "santa_marta" },
      // Gen 4
      { id: "outlander",    name: "OUTLANDER OF EL DOURADO",                 gen: 4, pos: 0,  sex: null, ems: "MCO ns",      reg: ["KRK LO 0052"] },
      { id: "isabelle",     name: "ISABELLE ROXY FROM TASSEL MAGIC",         gen: 4, pos: 1,  sex: null, ems: "MCO f 03 22", reg: ["WCF RU-170-13/2016-85"] },
      { id: "brno",         name: "ES*CHEREKOON BRNO H III",                 gen: 4, pos: 2,  sex: null, ems: "MCO ns 25",   reg: ["(ES) ASFE LO 52591"] },
      { id: "dakota",       name: "ES*CHEREKOON DAKOTA U II",                gen: 4, pos: 3,  sex: null, ems: "MCO fs",      reg: ["(ES) ASFE LO 49995"] },
      { id: "ulises",       name: "IC ULISES D'EL CUETU",                    gen: 4, pos: 4,  sex: null, ems: "MCO ns 22",   reg: ["WCF LO 19366", "(LO 079930814G)"] },
      { id: "jannet",       name: "CH JANNET CASTALYNX",                     gen: 4, pos: 5,  sex: null, ems: "MCO n 22",    reg: ["LO-BC-0262-10-17-771"] },
      { id: "garfield",     name: "GARFIELD HACIENDACANELA-E",               gen: 4, pos: 6,  sex: null, ems: "MCO c 22",    reg: ["CFDC-WCF LO 0040"] },
      { id: "kitty",        name: "KITTY DE LA ROUREDA",                     gen: 4, pos: 7,  sex: null, ems: "MCO ds 22",   reg: ["LO-BC-0262-02-18-226-MCO"] },
      { id: "justcoons",    name: "JUSTCOONS ROB ROY*DE",                    gen: 4, pos: 8,  sex: null, ems: "MCO ds 23",   reg: ["MCO-150816-5753 ICW"] },
      { id: "kassiopea",    name: "KASSIOPEA OF ETHEREAL",                   gen: 4, pos: 9,  sex: null, ems: "MCO fs 22",   reg: ["RU-0135-03-2015-1033-LO"] },
      { id: "battle_creek", name: "CH BATTLE CREEK'S HALUNKE*DE",            gen: 4, pos: 10, sex: null, ems: "MCO n 22",    reg: ["MCO-080717-1020 ICW"] },
      { id: "knock_ayne",   name: "IC KNOCK AYNE-E PARIS TEXAS",             gen: 4, pos: 11, sex: null, ems: "MCO f 09 22", reg: ["LO 23452"] },
      { id: "mainelynx",    name: "MAINELYNX KROSBY",                        gen: 4, pos: 12, sex: null, ems: "MCO n 25",    reg: ["P-2014-218-22002254211"] },
      { id: "dark_snow",    name: "ES*CHEREKOON DARK SNOW S II",             gen: 4, pos: 13, sex: null, ems: "MCO f",       reg: ["(ES) ASFE LO 49965"] },
      { id: "utah",         name: "UTAH LAVENDER LOVE*PL",                   gen: 4, pos: 14, sex: null, ems: "MCO w 61",    reg: ["(PL) FPL LO 82256"] },
      { id: "santa_marta",  name: "ES*SANTA MARTA ARTIC EYES",               gen: 4, pos: 15, sex: null, ems: "MCO w 61",    reg: ["(ES) ASFE LO 56557"] }
    ];

    const PEDIGREE_BY_ID = Object.fromEntries(PEDIGREE_NODES.map(n => [n.id, n]));

    const PG_REL_LABELS = {
      sauron:              "Sauron",
      thor:                "Pai",
      alexa:               "Mãe",
      cherekoon_roble:     "Avô paterno",
      chanel_moon:         "Avó paterna",
      damon:               "Avô materno",
      cherekoon_ice_seal:  "Avó materna",
      chisum:              "Bisavô paterno-paterno",
      oshet:               "Bisavó paterno-paterna",
      soul_de_lisbeth:     "Bisavô paterno-materno",
      starseed_mismire:    "Bisavó paterno-materna",
      ic_martin:           "Bisavô materno-paterno",
      junipera:            "Bisavó materno-paterna",
      cherekoon_oso:       "Bisavô materno-materno",
      cherekoon_artic_fox: "Bisavó materno-materna",
    };

    const EMS_BASE = { n:"Preto", a:"Azul", d:"Vermelho/Ruivo", e:"Creme", f:"Tartaruga preta", g:"Tartaruga azul", s:"Silver/Fumo (modificador)", w:"Branco", c:"Canela (Cinnamon)" };
    const EMS_PATTERN = { "22":"Blotched/Classic Tabby", "23":"Mackerel Tabby", "25":"Ticked Tabby" };
    const EMS_WHITE = { "03":"Bicolor", "09":"Quantidade de branco não especificada" };
    const EMS_EYE = { "61":"Olhos azuis", "62":"Olhos cor de laranja", "63":"Olhos ímpar (odd-eyed)" };

    function pgBranch(node) {
      if (node.id === "sauron") return "sauron";
      if (node.gen === 1) return node.pos === 0 ? "paternal" : "maternal";
      if (node.gen >= 2) return node.pos < Math.pow(2, node.gen - 1) ? "paternal" : "maternal";
      return "paternal";
    }

    const PG_SLOT_H = 68;
    const PG_NODE_W = 168;
    const PG_NODE_H = 56;
    const PG_COL_X = [0, 210, 420, 630, 840];

    function pgNodeCY(node) {
      return PG_SLOT_H * (node.pos + 0.5) * Math.pow(2, 4 - node.gen);
    }

    function pgNodeTop(node) {
      return pgNodeCY(node) - PG_NODE_H / 2;
    }

    function initPedigree() {
      const openBtn = $("openPedigreeBtn");
      const dialog = $("pedigreeDialog");
      const closeBtn = $("closePedigreeBtn");
      const closeDetail = $("closePedigreeDetail");

      if (!openBtn || !dialog) return;

      openBtn.addEventListener("click", () => {
        renderPedigreeTree();
        renderPedigreeLegend();
        renderPedigreeEms();
        renderPedigreeStats();
        dialog.showModal();
      });

      closeBtn.addEventListener("click", () => dialog.close());
      dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
      closeDetail.addEventListener("click", () => {
        $("pedigreeDetailPanel").hidden = true;
        document.querySelectorAll(".pg-node.pg-selected").forEach(el => el.classList.remove("pg-selected"));
      });
    }

    function renderPedigreeLegend() {
      const el = $("pedigreeLegend");
      if (!el || el.children.length > 0) return;
      const items = [
        { color: "#b8864a", label: "Linhagem paterna" },
        { color: "#7a8faa", label: "Linhagem materna" },
        { color: "var(--gold)", label: "Sauron" },
      ];
      items.forEach(({ color, label }) => {
        const item = document.createElement("div");
        item.className = "pedigree-legend-item";
        const line = document.createElement("div");
        line.className = "pedigree-legend-line";
        line.style.background = color;
        const lbl = document.createElement("span");
        lbl.textContent = label;
        lbl.style.color = "var(--mut)";
        lbl.style.fontSize = "12px";
        item.append(line, lbl);
        el.append(item);
      });
    }

    function renderPedigreeEms() {
      const el = $("pedigreeEmsContent");
      if (!el || el.children.length > 0) return;

      const intro = document.createElement("p");
      intro.style.cssText = "color:var(--tx);margin:0 0 10px";
      intro.textContent = "O sistema EMS (Easy Mind System) é um código padronizado utilizado nos pedigrees de gatos. O prefixo MCO identifica a raça Maine Coon. Por exemplo, \"MCO ns 22\" significa Maine Coon, preto silver, tabby blotched.";
      el.append(intro);

      function makeSection(title, dict) {
        const h = document.createElement("p");
        h.style.cssText = "color:var(--gold);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:10px 0 4px";
        h.textContent = title;
        el.append(h);
        const grid = document.createElement("div");
        grid.className = "ems-grid";
        for (const [code, desc] of Object.entries(dict)) {
          const item = document.createElement("div");
          item.className = "ems-item";
          const c = document.createElement("span");
          c.className = "ems-code";
          c.textContent = code;
          const d = document.createElement("span");
          d.className = "ems-desc";
          d.textContent = desc;
          item.append(c, d);
          grid.append(item);
        }
        el.append(grid);
      }

      makeSection("Cor base", EMS_BASE);
      makeSection("Padrão tabby", EMS_PATTERN);
      makeSection("Quantidade de branco", EMS_WHITE);
      makeSection("Cor dos olhos", EMS_EYE);

      const note = document.createElement("p");
      note.style.cssText = "color:var(--mut);font-size:11px;margin:10px 0 0";
      note.textContent = "Códigos incompletos ou combinações ambíguas não são descritos automaticamente.";
      el.append(note);
    }

    function renderPedigreeStats() {
      const el = $("pedigreeStatsContent");
      if (!el || el.children.length > 0) return;

      const regPrefixes = { "PT":"Portugal", "ES":"Espanha", "PL":"Polónia", "RU":"Rússia", "DE":"Alemanha" };
      const countryCounts = {};
      PEDIGREE_NODES.forEach(n => {
        n.reg.forEach(r => {
          const m = r.match(/^\(([A-Z]{2})\)/);
          if (m && regPrefixes[m[1]]) {
            countryCounts[regPrefixes[m[1]]] = (countryCounts[regPrefixes[m[1]]] || 0) + 1;
          }
        });
      });

      const colorCount = {};
      PEDIGREE_NODES.forEach(n => {
        const parts = n.ems.split(" ");
        if (parts[1]) colorCount[parts[1]] = (colorCount[parts[1]] || 0) + 1;
      });
      const topColor = Object.entries(colorCount).sort((a,b) => b[1]-a[1])[0];

      const grid = document.createElement("div");
      grid.className = "stats-grid";

      function stat(val, sub) {
        const item = document.createElement("div");
        item.className = "stats-item";
        const v = document.createElement("div");
        v.className = "val";
        v.textContent = val;
        const s = document.createElement("div");
        s.className = "sub";
        s.textContent = sub;
        item.append(v, s);
        return item;
      }

      grid.append(stat("31", "ancestrais registados"));
      grid.append(stat("4", "gerações de antepassados"));
      grid.append(stat("15", "da linhagem paterna"));
      grid.append(stat("15", "da linhagem materna"));

      const countryList = Object.keys(countryCounts);
      if (countryList.length > 0) grid.append(stat(countryList.length.toString(), "países nos registos"));
      if (topColor) {
        const label = EMS_BASE[topColor[0]] || topColor[0];
        grid.append(stat(topColor[1].toString(), "gatos com base " + label.toLowerCase()));
      }

      el.append(grid);

      if (countryList.length > 0) {
        const p = document.createElement("p");
        p.style.cssText = "color:var(--mut);font-size:11px;margin:10px 0 0";
        p.textContent = "Países identificados pelos prefixos dos registos: " + countryList.join(", ") + ". A identificação é baseada apenas nos prefixos dos números de registo.";
        el.append(p);
      }
    }

    function renderPedigreeTree() {
      const container = $("pedigreeTreeContainer");
      if (!container) return;
      container.replaceChildren();

      PEDIGREE_NODES.forEach(node => {
        const el = document.createElement("div");
        el.className = "pg-node";
        if (node.id === "sauron") el.classList.add("pg-sauron");
        else el.classList.add("pg-" + pgBranch(node));

        el.style.left = PG_COL_X[node.gen] + "px";
        el.style.top = pgNodeTop(node) + "px";
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", node.name + (PG_REL_LABELS[node.id] ? ", " + PG_REL_LABELS[node.id] : ""));
        el.dataset.pgId = node.id;

        const nameLine = document.createElement("div");
        nameLine.className = "pg-node-name";
        nameLine.textContent = node.name;
        if (node.sex) {
          const sexSpan = document.createElement("span");
          sexSpan.className = "pg-node-sex";
          sexSpan.textContent = node.sex === "M" ? "♂" : "♀";
          sexSpan.style.color = node.sex === "M" ? "#7a8faa" : "#b87a8f";
          nameLine.append(sexSpan);
        }

        const emsLine = document.createElement("div");
        emsLine.className = "pg-node-ems";
        emsLine.textContent = node.ems;

        el.append(nameLine, emsLine);

        if (PG_REL_LABELS[node.id] && node.id !== "sauron") {
          const relLine = document.createElement("div");
          relLine.className = "pg-node-rel";
          relLine.textContent = PG_REL_LABELS[node.id];
          el.append(relLine);
        }

        function select() {
          document.querySelectorAll(".pg-node.pg-selected").forEach(e => e.classList.remove("pg-selected"));
          el.classList.add("pg-selected");
          showPedigreeDetail(node);
        }

        el.addEventListener("click", select);
        el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } });
        container.append(el);
      });

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "pedigree-lines");
      svg.setAttribute("aria-hidden", "true");

      const PAT_COLOR = "#b8864a";
      const MAT_COLOR = "#7a8faa";
      const SAURON_COLOR = "#c4a44a";

      PEDIGREE_NODES.forEach(node => {
        if (!node.fatherId && !node.motherId) return;
        const x1 = PG_COL_X[node.gen] + PG_NODE_W;
        const cy1 = pgNodeCY(node);
        const branch = pgBranch(node);
        const color = node.id === "sauron" ? SAURON_COLOR : (branch === "paternal" ? PAT_COLOR : MAT_COLOR);

        [node.fatherId, node.motherId].forEach(parentId => {
          if (!parentId) return;
          const parent = PEDIGREE_BY_ID[parentId];
          if (!parent) return;
          const x2 = PG_COL_X[parent.gen];
          const cy2 = pgNodeCY(parent);
          const midX = (x1 + x2) / 2;

          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", `M ${x1} ${cy1} C ${midX} ${cy1}, ${midX} ${cy2}, ${x2} ${cy2}`);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", color);
          path.setAttribute("stroke-width", node.id === "sauron" ? "2" : "1.5");
          path.setAttribute("stroke-opacity", "0.55");
          svg.append(path);
        });
      });

      container.append(svg);
    }

    function showPedigreeDetail(node) {
      const panel = $("pedigreeDetailPanel");
      const content = $("pedigreeDetailContent");
      if (!panel || !content) return;

      content.replaceChildren();

      const title = document.createElement("h3");
      title.textContent = node.name;
      content.append(title);

      function row(label, value) {
        if (!value) return;
        const d = document.createElement("div");
        d.className = "pedigree-detail-row";
        const l = document.createElement("span");
        l.className = "pedigree-detail-label";
        l.textContent = label;
        const v = document.createElement("span");
        v.className = "pedigree-detail-value";
        v.textContent = value;
        d.append(l, v);
        content.append(d);
      }

      row("Relação", PG_REL_LABELS[node.id] || ("Geração " + node.gen));
      row("Geração", node.gen === 0 ? "Geração 0 (o próprio)" : "Geração " + node.gen);
      row("Linhagem", node.id === "sauron" ? "—" : (pgBranch(node) === "paternal" ? "Paterna" : "Materna"));
      row("Sexo", node.sex === "M" ? "Macho" : node.sex === "F" ? "Fêmea" : null);
      row("Código EMS", node.ems);

      const emsParts = node.ems.replace("MCO ", "").split(" ");
      const baseCode = emsParts[0];
      const descriptions = [];
      if (EMS_BASE[baseCode]) descriptions.push(EMS_BASE[baseCode]);
      if (baseCode.length === 2 && baseCode[1] === "s") descriptions.push(EMS_BASE["s"]);
      emsParts.slice(1).forEach(code => {
        if (EMS_PATTERN[code]) descriptions.push(EMS_PATTERN[code]);
        if (EMS_WHITE[code]) descriptions.push(EMS_WHITE[code]);
        if (EMS_EYE[code]) descriptions.push(EMS_EYE[code]);
      });
      if (descriptions.length > 0) row("Cor (EMS)", descriptions.join(", "));

      if (node.reg && node.reg.length > 0) {
        const d = document.createElement("div");
        d.className = "pedigree-detail-row";
        const l = document.createElement("span");
        l.className = "pedigree-detail-label";
        l.textContent = node.reg.length === 1 ? "Registo" : "Registos";
        const v = document.createElement("div");
        v.className = "pedigree-detail-value pedigree-detail-regs";
        node.reg.forEach(r => { const s = document.createElement("span"); s.textContent = r; v.append(s); });
        d.append(l, v);
        content.append(d);
      }

      if (node.fatherId) { const f = PEDIGREE_BY_ID[node.fatherId]; if (f) row("Pai", f.name); }
      if (node.motherId) { const m = PEDIGREE_BY_ID[node.motherId]; if (m) row("Mãe", m.name); }

      const children = PEDIGREE_NODES.filter(n => n.fatherId === node.id || n.motherId === node.id);
      if (children.length > 0) row("Descendentes (nesta árvore)", children.map(c => c.name).join(", "));

      if (node.notes) row("Notas", node.notes);

      if (node.id === "thor" || node.id === "alexa") {
        const note = document.createElement("p");
        note.style.cssText = "font-size:11px;color:var(--mut);margin-top:10px";
        note.textContent = "Os resultados genéticos de " + (node.id === "thor" ? "Thor" : "Alexa") + " estão disponíveis na secção Perfil Genético deste separador.";
        content.append(note);
      }

      panel.hidden = false;
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function initHealth() {
      seedHealthData();
      renderHealth();

      $("addVaccine").addEventListener("click", () => {
        editHealthRecord();
        $("hType").value = "vaccine";
        syncHealthSubtype();
      });
      $("addDeworming").addEventListener("click", () => {
        editHealthRecord();
        $("hType").value = "deworming";
        syncHealthSubtype();
      });
      $("healthForm").addEventListener("submit", saveHealthRecord);
      $("cancelHealth").addEventListener("click", closeHealthEditor);
      $("hType").addEventListener("change", syncHealthSubtype);
      $("hStatus").addEventListener("change", () => {
        $("hDone").checked = $("hStatus").value === "administered";
      });

      $("editIdentityBtn").addEventListener("click", openIdentityForm);
      $("cancelIdentity").addEventListener("click", closeIdentityForm);
      $("identityForm").addEventListener("submit", saveIdentity);

      $("addVisit").addEventListener("click", () => editVisit());
      $("visitForm").addEventListener("submit", saveVisit);
      $("cancelVisit").addEventListener("click", closeVisitEditor);

      $("addDiary").addEventListener("click", () => editDiaryEntry());
      $("diaryForm").addEventListener("submit", saveDiaryEntry);
      $("cancelDiary").addEventListener("click", closeDiaryEditor);

      $("addScreening").addEventListener("click", () => editScreening());
      $("screeningForm").addEventListener("submit", saveScreening);
      $("cancelScreening").addEventListener("click", closeScreeningEditor);

      $("addMedication").addEventListener("click", () => editMedication());
      $("medicationForm").addEventListener("submit", saveMedication);
      $("cancelMedication").addEventListener("click", closeMedicationEditor);

      $("addVet").addEventListener("click", () => editVet());
      $("vetForm").addEventListener("submit", saveVet);
      $("cancelVet").addEventListener("click", closeVetEditor);

      $("addDocument").addEventListener("click", () => editDocument());
      $("documentForm").addEventListener("submit", saveDocument);
      $("cancelDocument").addEventListener("click", closeDocumentEditor);

      $("exportHealthBtn").addEventListener("click", exportHealth);
      $("importHealthBtn").addEventListener("click", () => $("importHealthInput").click());
      $("importHealthInput").addEventListener("change", e => {
        if (e.target.files[0]) importHealth(e.target.files[0]);
        e.target.value = "";
      });
    }


    // O arranque só acontece depois de todo o HTML existir.
    loadData();
    restoreSettings();
    renderFoodSelects();
    renderFoods();
    renderPlan();
    renderGrowth();
    initTraining();
    initHealth();
    initPedigree();
    showTab("plan");

    $("chartFilters").addEventListener("click", event => {
      const btn = event.target.closest("[data-range]");
      if (!btn) return;
      chartRange = btn.dataset.range;
      $("chartFilters").querySelectorAll("[data-range]").forEach(b => {
        b.classList.toggle("active", b === btn);
      });
      renderChart();
    });

    $("weight").addEventListener("input", () => {
      renderPlan();
      persist();
    });

    $("weightInput").addEventListener("change", () => {
      const value = Number($("weightInput").value);

      if (
        !$("weightInput").checkValidity() ||
        !Number.isFinite(value)
      ) {
        $("weightInput").reportValidity();
        return;
      }

      $("weight").value = value;
      renderPlan();
      persist();
    });

    ["factor", "customCal", "wet", "wetType", "dryType", "nutrientProfile"]
      .forEach(id => {
        $(id).addEventListener("input", () => {
          renderPlan();
          persist();
        });
      });

    document.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        showTab(button.dataset.tab);
      });
    });

    $("addFood").addEventListener("click", () => editFood());
    $("cancelFood").addEventListener("click", closeFoodEditor);
    $("foodForm").addEventListener("submit", saveFood);
    $("weightForm").addEventListener("submit", saveWeight);
    $("savePlan").addEventListener("click", savePlan);

    $("snackForm").addEventListener("submit", addSnack);

    $("fType").addEventListener("change", syncSnackFields);

    // Atualiza a lista do dia ao regressar à app,
    // incluindo quando entretanto mudou o dia.
    document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        renderPlan();
    }
    });

    $("waterSlider").addEventListener("input", () => {
    $("waterDrunk").value = $("waterSlider").value;
    saveHydrationInputs();
    });
