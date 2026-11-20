/* eslint-disable no-unused-vars */

const GISTEMP_URLS = {
  global: "data/GLB.Ts+dSST.csv",
  nh: "data/NH.Ts+dSST.csv",
  sh: "data/SH.Ts+dSST.csv",
  zonal: "data/ZonAnn.Ts+dSST.csv"
};

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const SEASON_COLORS = {
  DJF: { accent: "#6ec6ff", label: "DJF (Invierno N / Verano S)" },
  MAM: { accent: "#8be9a8", label: "MAM (Primavera N / Otoño S)" },
  JJA: { accent: "#ff7b6b", label: "JJA (Verano N / Invierno S)" },
  SON: { accent: "#ffb35c", label: "SON (Otoño N / Primavera S)" }
};

const SEASON_CHARS = {
  SOL: "assets/char_1.png",
  DJF: "assets/char_2.png",
  MAM: "assets/char_3.png",
  JJA: "assets/char_4.png",
  SON: "assets/char_5.png"
};

const ONBOARDING_STEPS = [
  {
    title: "1. El cambio climático en el tiempo",
    body: "Durante el último siglo (1925–2025), las anomalías de temperatura superficial tierra-océano de NASA GISTEMP muestran una tendencia marcada al calentamiento respecto al periodo base 1951–1980."
  },
  {
    title: "2. ¿Qué impulsa estos cambios?",
    body: "Las emisiones de gases de efecto invernadero, el uso del suelo y la dinámica océano-atmósfera alteran el balance energético del planeta y se manifiestan de forma distinta según el mes, la estación y el hemisferio."
  },
  {
    title: "3. Visualización interactiva para la acción",
    body: "Esta aplicación integra datos abiertos de NASA GISTEMP con señales visuales y sonoras para explorar ventanas de tiempo, comparar hemisferios y observar los umbrales del Acuerdo de París (+1.5 °C y +2.0 °C)."
  }
];

const appState = {
  year: 1925,
  monthIndex: 0,
  activeSeason: null,
  mapMode: "continents",
  rangeStart: 1956,
  rangeEnd: 1970,
  voiceEnabled: true,
  globalByYear: {},
  nhByYear: {},
  shByYear: {},
  zonalByYear: {},
  centuryGlobal: [],
  centuryNH: [],
  centurySH: [],
  centuryZonal: [],
  parisOffsetFrom1951_1980: 0.25
};

let voiceSynth = null;
let lastTrackedTemp = null;

function initVoice() {
  if (typeof p5 !== "undefined" && typeof p5.Speech !== "undefined") {
    voiceSynth = new p5.Speech();
    voiceSynth.setLang("es-ES");
    voiceSynth.setRate(1.0);
  }
}

function speakInfo(text) {
  if (!appState.voiceEnabled || !voiceSynth || !text) return;
  voiceSynth.cancel();
  voiceSynth.speak(text);
}

function getCurrentGlobalTemp() {
  const gEntry = appState.globalByYear[appState.year];
  const mVal = gEntry?.months?.[appState.monthIndex];
  if (mVal !== null && mVal !== undefined && Number.isFinite(mVal)) return mVal;
  if (gEntry?.annual !== null && gEntry?.annual !== undefined && Number.isFinite(gEntry.annual)) {
    return gEntry.annual;
  }
  return null;
}

function setNarratorCharacter(modeKey) {
  const imgEl = document.getElementById("narratorImg");
  if (!imgEl) return;
  imgEl.src = SEASON_CHARS[modeKey] || SEASON_CHARS.SOL;
}

function setNarratorText(text, shouldSpeak = false) {
  const scriptEl = document.getElementById("narratorScript");
  if (scriptEl && text) {
    scriptEl.textContent = text;
  }
  if (shouldSpeak && text) {
    speakInfo(text);
  }
}

function narrateTemperatureChange(contextLabel = "", shouldSpeak = false) {
  const curr = getCurrentGlobalTemp();
  if (curr === null) return;

  const formattedCurr = `${curr >= 0 ? "+" : ""}${curr.toFixed(2)} °C`;
  let trendMsg = "";

  if (lastTrackedTemp !== null && Number.isFinite(lastTrackedTemp)) {
    const diff = curr - lastTrackedTemp;
    if (diff > 0.01) {
      trendMsg = `La temperatura subió +${diff.toFixed(2)} °C respecto al paso anterior (${formattedCurr}). `;
    } else if (diff < -0.01) {
      trendMsg = `La temperatura bajó ${diff.toFixed(2)} °C respecto al paso anterior (${formattedCurr}). `;
    } else {
      trendMsg = `La temperatura se mantiene estable en ${formattedCurr}. `;
    }
  } else {
    trendMsg = `Anomalía registrada: ${formattedCurr}. `;
  }

  lastTrackedTemp = curr;
  const prefix = contextLabel ? `${contextLabel} — ` : "";
  setNarratorText(`${prefix}${trendMsg}(${MONTHS[appState.monthIndex]} ${appState.year})`, shouldSpeak);
}

// Actualiza el estilo visual y brillo del Sol según anomalía global (°C)
function updateSunVisual(anomalyC) {
  const sunEl = document.getElementById("sunCharacter");
  const readoutEl = document.getElementById("sunReadout");
  if (!sunEl || !readoutEl) return;

  const val = Number.isFinite(anomalyC) ? anomalyC : 0;
  readoutEl.textContent = `${val >= 0 ? "+" : ""}${val.toFixed(2)} °C`;

  const scale = Math.max(0.88, Math.min(1.32, 1 + val * 0.2));
  const glow = Math.max(12, Math.min(54, 18 + (val + 0.5) * 22));
  const brightness = Math.max(0.9, Math.min(1.45, 1 + (val + 0.3) * 0.25));
  const color = val < 0 ? "#ffd166" : val < 0.7 ? "#ff9f1c" : "#ff4d2e";

  sunEl.style.setProperty("--sun-scale", scale.toFixed(2));
  sunEl.style.setProperty("--sun-glow", `${glow.toFixed(0)}px`);
  sunEl.style.setProperty("--sun-bright", brightness.toFixed(2));
  sunEl.style.setProperty("--sun-color", color);
}

// Calcula promedio de ventana y dibuja gráfica con umbrales de París (+1.5 °C y +2.0 °C vs 1880–1900)
function renderRangeAndParisChart() {
  const start = Math.min(appState.rangeStart, appState.rangeEnd);
  const end = Math.max(appState.rangeStart, appState.rangeEnd);
  const summaryEl = document.getElementById("rangeSummary");
  const canvas = document.getElementById("parisChart");
  if (!canvas || !summaryEl) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const points = [];
  for (let y = start; y <= end; y++) {
    const entry = appState.globalByYear[y];
    if (entry && entry.annual !== null && Number.isFinite(entry.annual)) {
      const adjusted = entry.annual + appState.parisOffsetFrom1951_1980;
      points.push({ year: y, val: adjusted });
    }
  }

  if (points.length === 0) {
    summaryEl.textContent = `Ventana ${start}–${end}: conecta tus datos GISTEMP para ver el promedio y la comparación con París.`;
    return;
  }

  const avg = points.reduce((acc, p) => acc + p.val, 0) / points.length;
  const firstVal = points[0].val;
  const lastVal = points[points.length - 1].val;
  const delta = lastVal - firstVal;

  summaryEl.textContent =
    `Ventana ${start}–${end} (vs. 1880–1900): promedio ${avg >= 0 ? "+" : ""}${avg.toFixed(2)} °C | ` +
    `Cambio del inicio al fin: ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} °C | ` +
    `Umbrales de París: +1.5 °C y +2.0 °C.`;

  const pad = 28;
  const w = canvas.width - pad * 2;
  const h = canvas.height - pad * 2;
  const minY = -0.5;
  const maxY = 2.4;

  const yToPx = (v) => pad + h - ((v - minY) / (maxY - minY)) * h;

  [1.5, 2.0].forEach((threshold) => {
    const py = yToPx(threshold);
    ctx.strokeStyle = threshold === 1.5 ? "#ffb703" : "#fb5607";
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pad, py);
    ctx.lineTo(pad + w, py);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = "11px sans-serif";
    ctx.fillText(`+${threshold.toFixed(1)}°C`, pad + w - 38, py - 3);
  });
  ctx.setLineDash([]);

  ctx.strokeStyle = "#7cc4ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, idx) => {
    const px = pad + (idx / Math.max(1, points.length - 1)) * w;
    const py = yToPx(p.val);
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

// Comparativa por rango de meses en el año activo
function renderMonthComparisonChart() {
  const startSel = document.getElementById("monthStartSelect");
  const endSel = document.getElementById("monthEndSelect");
  const yearSpan = document.getElementById("monthRangeYear");
  const summaryEl = document.getElementById("monthRangeSummary");
  const canvas = document.getElementById("monthsChart");
  if (!canvas || !summaryEl) return;

  const mStart = startSel ? Number(startSel.value) : 0;
  const mEnd = endSel ? Number(endSel.value) : 11;
  const minM = Math.min(mStart, mEnd);
  const maxM = Math.max(mStart, mEnd);

  if (yearSpan) yearSpan.textContent = String(appState.year);

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gEntry = appState.globalByYear[appState.year];
  const monthsArr = gEntry?.months || [];

  const points = [];
  for (let m = minM; m <= maxM; m++) {
    const val = monthsArr[m];
    if (val !== null && val !== undefined && Number.isFinite(val)) {
      points.push({ monthIdx: m, name: MONTHS[m], val });
    }
  }

  if (points.length === 0) {
    summaryEl.textContent = `Sin datos mensuales disponibles para ${appState.year}.`;
    return;
  }

  const avg = points.reduce((acc, p) => acc + p.val, 0) / points.length;
  const warmest = points.reduce((best, p) => (p.val > best.val ? p : best), points[0]);
  const coldest = points.reduce((best, p) => (p.val < best.val ? p : best), points[0]);

  summaryEl.textContent =
    `${MONTHS[minM]}–${MONTHS[maxM]} (${appState.year}): promedio ${avg >= 0 ? "+" : ""}${avg.toFixed(2)} °C | ` +
    `Más cálido: ${warmest.name} (${warmest.val >= 0 ? "+" : ""}${warmest.val.toFixed(2)} °C) | ` +
    `Más frío: ${coldest.name} (${coldest.val >= 0 ? "+" : ""}${coldest.val.toFixed(2)} °C).`;

  const pad = 26;
  const w = canvas.width - pad * 2;
  const h = canvas.height - pad * 2;

  const vals = points.map((p) => p.val);
  const minY = Math.min(-0.6, ...vals);
  const maxY = Math.max(1.4, ...vals);
  const yToPx = (v) => pad + h - ((v - minY) / (maxY - minY)) * h;

  const zeroY = yToPx(0);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad, zeroY);
  ctx.lineTo(pad + w, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  const barSlot = w / points.length;
  const barW = Math.max(8, barSlot * 0.62);

  points.forEach((p, idx) => {
    const xCenter = pad + idx * barSlot + barSlot / 2;
    const xLeft = xCenter - barW / 2;
    const yVal = yToPx(p.val);
    const topY = Math.min(yVal, zeroY);
    const barH = Math.max(2, Math.abs(yVal - zeroY));

    ctx.fillStyle = p.val >= 0 ? "#ff7b6b" : "#6ec6ff";
    ctx.fillRect(xLeft, topY, barW, barH);

    ctx.fillStyle = "#dce7f7";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.name.slice(0, 3), xCenter, canvas.height - 8);
  });
}

function normalizeTempValue(rawNum, isCentidegrees) {
  if (rawNum === null || !Number.isFinite(rawNum)) return null;
  return isCentidegrees ? rawNum / 100 : rawNum;
}

function detectCentidegrees(text) {
  if (/0\.01\s*degrees\s*Celsius/i.test(text)) return true;
  const sampleNums = text
    .split(/[\s,]+/)
    .map((t) => Number(t))
    .filter((n) => Number.isFinite(n) && Math.abs(n) > 5 && Math.abs(n) < 500);
  return sampleNums.length > 0;
}

function parseMonthlySeasonTable(rawText) {
  const byYear = {};
  const isCentidegrees = detectCentidegrees(rawText);
  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.includes(",")
      ? trimmed.split(",").map((s) => s.trim())
      : trimmed.split(/\s+/);

    if (!/^(18|19|20)\d{2}$/.test(parts[0])) continue;

    const year = Number(parts[0]);
    const rawVals = parts.slice(1).map((tok) => {
      if (!tok || /^\*+$/.test(tok)) return null;
      const n = Number(tok);
      return Number.isFinite(n) ? normalizeTempValue(n, isCentidegrees) : null;
    });

    const months = rawVals.slice(0, 12);
    while (months.length < 12) months.push(null);

    const annual = rawVals[12] ?? null;
    const seasons = {
      DJF: rawVals[14] ?? null,
      MAM: rawVals[15] ?? null,
      JJA: rawVals[16] ?? null,
      SON: rawVals[17] ?? null
    };

    byYear[year] = { year, months, annual, seasons };
  }

  return byYear;
}

function parseZonalAnnualTable(rawText) {
  const zonalByYear = {};
  const isCentidegrees = detectCentidegrees(rawText);
  const lines = rawText.split(/\r?\n/);

  const headers = [
    "Year", "Glob", "NHem", "SHem",
    "24N-90N", "24S-24N", "90S-24S",
    "64N-90N", "44N-64N", "24N-44N", "EQU-24N",
    "24S-EQU", "44S-24S", "64S-44S", "90S-64S"
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.includes(",")
      ? trimmed.split(",").map((s) => s.trim())
      : trimmed.split(/\s+/);

    if (!/^(18|19|20)\d{2}$/.test(parts[0])) continue;

    const year = Number(parts[0]);
    const rowObj = { year };

    for (let i = 1; i < Math.min(parts.length, headers.length); i++) {
      const tok = parts[i];
      if (!tok || /^\*+$/.test(tok)) {
        rowObj[headers[i]] = null;
      } else {
        const n = Number(tok);
        rowObj[headers[i]] = Number.isFinite(n)
          ? normalizeTempValue(n, isCentidegrees)
          : null;
      }
    }

    zonalByYear[year] = rowObj;
  }

  return zonalByYear;
}

function computeParisOffsetFrom1880_1900(globalByYear) {
  const vals = [];
  for (let y = 1880; y <= 1900; y++) {
    const v = globalByYear[y]?.annual;
    if (v !== null && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length === 0) return 0.22;
  const mean1880_1900 = vals.reduce((a, b) => a + b, 0) / vals.length;
  return -mean1880_1900;
}

function getYearsRange(dataDict, startYear = 1925, endYear = 2025) {
  const minY = Math.min(startYear, endYear);
  const maxY = Math.max(startYear, endYear);
  const result = [];
  for (let y = minY; y <= maxY; y++) {
    if (dataDict[y]) result.push(dataDict[y]);
  }
  return result;
}

async function loadGistempDatasets() {
  try {
    const [globalTxt, nhTxt, shTxt, zonalTxt] = await Promise.all(
      Object.values(GISTEMP_URLS).map(async (u) => {
        const res = await fetch(u);
        if (!res.ok) throw new Error(`No se pudo cargar ${u} (${res.status})`);
        return res.text();
      })
    );

    appState.globalByYear = parseMonthlySeasonTable(globalTxt);
    appState.nhByYear = parseMonthlySeasonTable(nhTxt);
    appState.shByYear = parseMonthlySeasonTable(shTxt);
    appState.zonalByYear = parseZonalAnnualTable(zonalTxt);

    appState.parisOffsetFrom1951_1980 = computeParisOffsetFrom1880_1900(appState.globalByYear);

    appState.centuryGlobal = getYearsRange(appState.globalByYear, 1925, 2025);
    appState.centuryNH = getYearsRange(appState.nhByYear, 1925, 2025);
    appState.centurySH = getYearsRange(appState.shByYear, 1925, 2025);
    appState.centuryZonal = getYearsRange(appState.zonalByYear, 1925, 2025);

    const initialTemp = getCurrentGlobalTemp();
    if (initialTemp !== null) {
      lastTrackedTemp = initialTemp;
      updateSunVisual(initialTemp);
    }

    renderRangeAndParisChart();
    renderMonthComparisonChart();
  } catch (err) {
    console.error("Error cargando datasets GISTEMP:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initVoice();
  setNarratorCharacter("SOL");
  loadGistempDatasets();

  let stepIdx = 0;
  const stepNumEl = document.getElementById("stepNum");
  const stepContentEl = document.getElementById("stepContent");
  const prevBtn = document.getElementById("prevStepBtn");
  const nextBtn = document.getElementById("nextStepBtn");
  const startBtn = document.getElementById("startAppBtn");

  function renderStep() {
    const s = ONBOARDING_STEPS[stepIdx];
    stepNumEl.textContent = String(stepIdx + 1);
    stepContentEl.innerHTML = `<h2>${s.title}</h2><p>${s.body}</p>`;
    prevBtn.disabled = stepIdx === 0;
    const isLast = stepIdx === ONBOARDING_STEPS.length - 1;
    nextBtn.classList.toggle("hidden", isLast);
    startBtn.classList.toggle("hidden", !isLast);
  }

  prevBtn.addEventListener("click", () => {
    if (stepIdx > 0) { stepIdx--; renderStep(); }
  });
  nextBtn.addEventListener("click", () => {
    if (stepIdx < ONBOARDING_STEPS.length - 1) { stepIdx++; renderStep(); }
  });
  startBtn.addEventListener("click", () => {
    document.getElementById("onboarding").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    if (typeof windowResized === "function") {
      requestAnimationFrame(() => windowResized());
    }
    const curr = getCurrentGlobalTemp();
    if (curr !== null) {
      lastTrackedTemp = curr;
      updateSunVisual(curr);
    }
    setNarratorCharacter("SOL");
    setNarratorText(ONBOARDING_STEPS[2].body, true);
    renderRangeAndParisChart();
    renderMonthComparisonChart();
  });
  renderStep();

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      appState.mapMode = btn.dataset.mode;
    });
  });

  const toggleVoiceBtn = document.getElementById("toggleVoiceBtn");
  toggleVoiceBtn.addEventListener("click", () => {
    appState.voiceEnabled = !appState.voiceEnabled;
    toggleVoiceBtn.textContent = `Voz guía: ${appState.voiceEnabled ? "ON" : "OFF"}`;
  });

  const monthSlider = document.getElementById("monthSlider");
  const monthLabel = document.getElementById("monthLabel");
  monthSlider.addEventListener("input", () => {
    appState.monthIndex = Number(monthSlider.value);
    monthLabel.textContent = MONTHS[appState.monthIndex];
    const curr = getCurrentGlobalTemp();
    if (curr !== null) updateSunVisual(curr);
    narrateTemperatureChange(`Mes ${MONTHS[appState.monthIndex]}`, false);
  });

  const yearSlider = document.getElementById("yearSlider");
  const yearLabel = document.getElementById("yearLabel");
  yearSlider.addEventListener("input", () => {
    appState.year = Number(yearSlider.value);
    yearLabel.textContent = String(appState.year);
    const curr = getCurrentGlobalTemp();
    if (curr !== null) updateSunVisual(curr);
    narrateTemperatureChange(`Año ${appState.year}`, false);
    renderMonthComparisonChart();
  });

  document.querySelectorAll(".season-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const season = btn.dataset.season;
      appState.activeSeason = season;
      document.querySelectorAll(".season-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      setNarratorCharacter(season);

      document.querySelectorAll(".season-bubble").forEach((el) => el.classList.add("hidden"));
      const bubble = document.getElementById(`info-${season}`);
      const nhVal = appState.nhByYear[appState.year]?.seasons?.[season];
      const shVal = appState.shByYear[appState.year]?.seasons?.[season];
      const msg =
        `${SEASON_COLORS[season].label} (${appState.year}): ` +
        `Norte ${nhVal !== null && nhVal !== undefined ? nhVal.toFixed(2) + " °C" : "s/d"} · ` +
        `Sur ${shVal !== null && shVal !== undefined ? shVal.toFixed(2) + " °C" : "s/d"}`;
      bubble.textContent = msg;
      bubble.classList.remove("hidden");
      setNarratorText(msg, true);
    });
  });

  const returnToSunMode = () => {
    appState.activeSeason = null;
    document.querySelectorAll(".season-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".season-bubble").forEach((el) => el.classList.add("hidden"));
    setNarratorCharacter("SOL");

    const displayVal = getCurrentGlobalTemp();
    const msg =
      `Modo Sol activo — Anomalía global en ${MONTHS[appState.monthIndex]} de ${appState.year}: ` +
      `${displayVal !== null ? (displayVal >= 0 ? "+" : "") + displayVal.toFixed(2) + " °C" : "sin dato"} respecto a 1951–1980.`;
    setNarratorText(msg, true);
  };

  document.getElementById("sunCharacter").addEventListener("click", returnToSunMode);
  const narratorDockEl = document.getElementById("narratorDock");
  if (narratorDockEl) {
    narratorDockEl.addEventListener("click", () => {
      if (appState.activeSeason) {
        returnToSunMode();
      }
    });
  }

  document.getElementById("updateRangeBtn").addEventListener("click", () => {
    appState.rangeStart = Number(document.getElementById("rangeStart").value) || 1956;
    appState.rangeEnd = Number(document.getElementById("rangeEnd").value) || 1970;
    renderRangeAndParisChart();
  });

  const updateMonthRangeBtn = document.getElementById("updateMonthRangeBtn");
  if (updateMonthRangeBtn) {
    updateMonthRangeBtn.addEventListener("click", renderMonthComparisonChart);
  }
});