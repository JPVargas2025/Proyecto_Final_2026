/* eslint-disable no-undef */
let mapImages = {};
let ambientSound = null;
let isLoopPlaying = false;

// Sonido reactivo a anomalías térmicas (p5.sound)
let pulseOsc = null;
let pulseEnv = null;
let reactiveAudioEnabled = true;
let lastPulseSoundTime = 0;

// Puntos de referencia climática en el mapa (lon, lat, hemisferio)
const CLIMATE_NODES = [
  { id: "na_arctic", name: "Norteamérica / Ártico", lon: -102, lat: 58, hemi: "NH", zonalKey: "44N-64N" },
  { id: "eu_asia_n", name: "Europa / Eurasia Norte", lon: 22, lat: 54, hemi: "NH", zonalKey: "44N-64N" },
  { id: "trop_n", name: "Trópico Norte / Caribe", lon: -65, lat: 18, hemi: "NH", zonalKey: "24S-24N" },
  { id: "trop_s", name: "Trópico Sur / Pacífico", lon: -115, lat: -14, hemi: "SH", zonalKey: "24S-24N" },
  { id: "sa_s", name: "Sudamérica Sur / Atlántico", lon: -42, lat: -32, hemi: "SH", zonalKey: "44S-24S" },
  { id: "oc_s", name: "Oceanía / Índico Sur", lon: 122, lat: -22, hemi: "SH", zonalKey: "44S-24S" }
];

// Estación meteorológica del Hemisferio Norte según índice de mes (0 = Ene .. 11 = Dic)
function getNHSeasonFromMonth(monthIndex) {
  if (monthIndex === 11 || monthIndex <= 1) return "DJF"; // Dic, Ene, Feb
  if (monthIndex >= 2 && monthIndex <= 4) return "MAM";  // Mar, Abr, May
  if (monthIndex >= 5 && monthIndex <= 7) return "JJA";  // Jun, Jul, Ago
  return "SON";                                          // Sep, Oct, Nov
}

// Estación opuesta para el Hemisferio Sur
function getOppositeSeason(season) {
  const mapOpposite = {
    DJF: "JJA",
    MAM: "SON",
    JJA: "DJF",
    SON: "MAM"
  };
  return mapOpposite[season] || season;
}

function getContainerSize() {
  const container = document.getElementById("p5-container");
  const w = container && container.clientWidth > 0 ? container.clientWidth : 900;
  const h = container && container.clientHeight > 0 ? container.clientHeight : 450;
  return { w, h };
}

function preload() {
  const safeLoadImg = (key, path) => {
    mapImages[key] = null;
    loadImage(
      path,
      (img) => { mapImages[key] = img; },
      () => { mapImages[key] = null; }
    );
  };

  safeLoadImg("continents", "assets/map_continents.png");
  safeLoadImg("countries", "assets/map_countries.png");
  safeLoadImg("flags", "assets/map_flags.png");
  safeLoadImg("anima_DJF", "assets/invierno_anima.png");
  safeLoadImg("anima_MAM", "assets/primevera_anima.png");
  safeLoadImg("anima_JJA", "assets/verano_anima.png");
  safeLoadImg("anima_SON", "assets/otono_anima.png");
}

function setup() {
  const { w, h } = getContainerSize();
  const canvas = createCanvas(w, h);
  canvas.parent("p5-container");

  // Cargar audio ambiente fuera de preload() para no bloquear el lienzo
  if (typeof loadSound === "function") {
    soundFormats("mp3", "ogg");
    loadSound(
      "assets/ambient_loop.mp3",
      (snd) => {
        ambientSound = snd;
        ambientSound.setVolume(0.5);
      },
      () => { ambientSound = null; }
    );
  }

  // Oscilador y envolvente suaves para señales sonoras de anomalía
  if (typeof p5 !== "undefined" && p5.Oscillator && p5.Envelope) {
    pulseOsc = new p5.Oscillator("sine");
    pulseEnv = new p5.Envelope();
    pulseEnv.setADSR(0.02, 0.14, 0.05, 0.25);
    pulseEnv.setRange(0.14, 0);
    pulseOsc.amp(0);
    pulseOsc.start();
  }

  // Botón de audio ambiente en loop (volumen al 50%)
  const loopBtn = document.getElementById("toggleLoopBtn");
  if (loopBtn) {
    loopBtn.addEventListener("click", () => {
      userStartAudio();
      if (!ambientSound) {
        loopBtn.textContent = "Sin archivo MP3 en /assets";
        return;
      }
      if (!isLoopPlaying) {
        ambientSound.setLoop(true);
        ambientSound.setVolume(0.5);
        ambientSound.play();
        isLoopPlaying = true;
        loopBtn.textContent = "Audio ambiente: ON";
      } else {
        ambientSound.stop();
        isLoopPlaying = false;
        loopBtn.textContent = "Audio ambiente: OFF";
      }
    });
  }

  // Disparar señal sonora breve al mover año, mes, elegir estación o pulsar el Sol
  const yearSlider = document.getElementById("yearSlider");
  const monthSlider = document.getElementById("monthSlider");
  const triggerFeedbackSound = () => {
    userStartAudio();
    const gEntry = appState.globalByYear[appState.year];
    const val = gEntry?.months?.[appState.monthIndex] ?? gEntry?.annual ?? 0;
    playThermalPulseSound(val, 0);
  };

  if (yearSlider) yearSlider.addEventListener("input", triggerFeedbackSound);
  if (monthSlider) monthSlider.addEventListener("input", triggerFeedbackSound);

  const sunEl = document.getElementById("sunCharacter");
  const sunCoinEl = document.getElementById("sunSeasonCoinBtn");
  if (sunCoinEl) sunCoinEl.addEventListener("click", triggerFeedbackSound);

  document.querySelectorAll(".season-btn").forEach((btn) => {
    btn.addEventListener("click", triggerFeedbackSound);
  });
}

function playThermalPulseSound(tempC, panNorm = 0) {
  if (!reactiveAudioEnabled || !pulseOsc || !pulseEnv) return;
  if (typeof getAudioContext === "function" && getAudioContext().state !== "running") {
    return;
  }
  const now = millis();
  if (now - lastPulseSoundTime < 140) return;
  lastPulseSoundTime = now;

  const clamped = constrain(tempC, -1.5, 2.5);
  const freq = map(clamped, -1.5, 2.5, 220, 660);
  pulseOsc.freq(freq);
  pulseOsc.pan(constrain(panNorm, -1, 1));
  pulseEnv.play(pulseOsc);
}

function windowResized() {
  const { w, h } = getContainerSize();
  resizeCanvas(w, h);
}

function projectLonLat(lon, lat) {
  return {
    x: map(lon, -180, 180, 0, width),
    y: map(lat, 90, -90, 0, height)
  };
}

// Determina qué estación aplica a un hemisferio dado
function getEffectiveSeasonForHemi(hemi) {
  const baseSeason = appState.activeSeason || getNHSeasonFromMonth(appState.monthIndex);
  if (hemi === "NH") return baseSeason;
  return getOppositeSeason(baseSeason);
}

// Obtiene anomalía (°C) para el nodo según año, mes y estación activa/correspondiente
function getTempForNode(node) {
  const source = node.hemi === "NH" ? appState.nhByYear : appState.shByYear;
  const yearData = source[appState.year];
  if (!yearData) return 0;

  if (appState.activeSeason) {
    const hemiSeason = getEffectiveSeasonForHemi(node.hemi);
    const sVal = yearData.seasons?.[hemiSeason];
    if (sVal !== null && sVal !== undefined && Number.isFinite(sVal)) {
      return sVal;
    }
  }

  const mVal = yearData.months?.[appState.monthIndex];
  if (mVal !== null && mVal !== undefined && Number.isFinite(mVal)) {
    return mVal;
  }

  return Number.isFinite(yearData.annual) ? yearData.annual : 0;
}

function drawSeasonPulse(x, y, radius, season, strokeCol) {
  push();
  translate(x, y);

  noFill();
  stroke(strokeCol);
  strokeWeight(2.2);
  circle(0, 0, radius * 2);

  if (appState.activeSeason) {
    const animaImg = mapImages[`anima_${season}`];
    if (animaImg) {
      const pulseScale = 1 + 0.15 * sin(millis() * 0.006);
      const imgSize = Math.max(18, radius * 1.1) * pulseScale;
      imageMode(CENTER);
      image(animaImg, 0, 0, imgSize, imgSize);
    }
  }

  pop();
}

function draw() {
  // Reajusta automáticamente si el contenedor pasó de oculto (0px) a visible
  const container = document.getElementById("p5-container");
  if (container && container.clientWidth > 0 && container.clientHeight > 0) {
    if (width !== container.clientWidth || height !== container.clientHeight) {
      resizeCanvas(container.clientWidth, container.clientHeight);
    }
  }

  background(12, 26, 52);

  // 1. Mapa según switch de 3 modos
  const currentMap = mapImages[appState.mapMode];
  if (currentMap) {
    imageMode(CORNER);
    image(currentMap, 0, 0, width, height);
  } else {
    stroke(255, 25);
    strokeWeight(1);
    line(0, height / 2, width, height / 2);
    noStroke();
    fill(160, 190, 230, 140);
    textSize(12);
    textAlign(LEFT, TOP);
    text(`Modo mapa: ${appState.mapMode} (coloca map_${appState.mapMode}.png en /assets)`, 12, 12);
  }

  // 2. Sol central con anomalía global del mes/año
  const gEntry = appState.globalByYear[appState.year];
  const mGlobal = gEntry?.months?.[appState.monthIndex];
  const gVal = (mGlobal !== null && mGlobal !== undefined) ? mGlobal : (gEntry?.annual ?? 0);
  if (typeof updateSunVisual === "function") {
    updateSunVisual(gVal);
  }

  // 3. Pulsaciones animadas permanentes por hemisferio/zona
  const tooltipEl = document.getElementById("mapTooltip");
  let hoveredNode = null;

  CLIMATE_NODES.forEach((node, idx) => {
    const pos = projectLonLat(node.lon, node.lat);
    const tempC = getTempForNode(node);
    const effectiveSeason = getEffectiveSeasonForHemi(node.hemi);

    const speedFactor = map(constrain(tempC, -1, 2.5), -1, 2.5, 2200, 1100);
    const pulseProgress = ((millis() / speedFactor) + idx * 0.18) % 1;
    const baseSize = map(constrain(tempC, -1, 2.5), -1, 2.5, 14, 44);
    const radius = baseSize * (0.35 + pulseProgress * 0.95);

    const pulseColor = tempC >= 0
      ? color(255, 105, 70, 225 * (1 - pulseProgress))
      : color(90, 195, 255, 225 * (1 - pulseProgress));

    drawSeasonPulse(pos.x, pos.y, radius, effectiveSeason, pulseColor);

    // Núcleo de la pulsación
    noStroke();
    fill(tempC >= 0 ? "#ff6b4a" : "#5ec8ff");
    circle(pos.x, pos.y, 8);

    // Si hay una estación seleccionada, mostrar el dato junto a la pulsación
    if (appState.activeSeason) {
      noStroke();
      fill(255);
      textSize(11);
      textAlign(CENTER, TOP);
      text(`${tempC >= 0 ? "+" : ""}${tempC.toFixed(2)}°C (${effectiveSeason})`, pos.x, pos.y + 9);
    }

    if (dist(mouseX, mouseY, pos.x, pos.y) < 24) {
      hoveredNode = { node, pos, tempC, effectiveSeason };
    }
  });

 if (hoveredNode && tooltipEl) {
    const zRow = appState.zonalByYear?.[appState.year];
    const zVal = hoveredNode.node.zonalKey ? zRow?.[hoveredNode.node.zonalKey] : null;
    const zLine = (zVal !== null && zVal !== undefined && Number.isFinite(zVal))
      ? `<br><span style="color:#9ecbff;">Franja anual (${hoveredNode.node.zonalKey}): <strong>${zVal >= 0 ? "+" : ""}${zVal.toFixed(2)} °C</strong></span>`
      : "";

    tooltipEl.classList.remove("hidden");
    const tooltipW = tooltipEl.offsetWidth || 210;
    const tooltipH = tooltipEl.offsetHeight || 82;
    const leftPx = Math.max(10, Math.min(width - tooltipW - 10, hoveredNode.pos.x + 14));
    const topPx = Math.max(10, Math.min(height - tooltipH - 10, hoveredNode.pos.y - 24));
    tooltipEl.style.left = `${leftPx}px`;
    tooltipEl.style.top = `${topPx}px`;
    tooltipEl.innerHTML =
      `<strong>${hoveredNode.node.name}</strong><br>` +
      `${MONTHS[appState.monthIndex]} ${appState.year} · Estación: <strong>${hoveredNode.effectiveSeason}</strong><br>` +
      `Anomalía: <strong>${hoveredNode.tempC >= 0 ? "+" : ""}${hoveredNode.tempC.toFixed(2)} °C</strong>` +
      zLine;
  } else if (tooltipEl) {
    tooltipEl.classList.add("hidden");
  }
}
