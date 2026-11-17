/**
 * tree3d.js
 * Pure-code 3D ASCII Christmas Tree Renderer (adapted from christmas_tree.py),
 * Van Gogh Starry Night Sky & 3-Language Scrolling Greeting.
 * No images, no SVG, no UI controls — 100% procedural ASCII art on HTML5 Canvas.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('ascii-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });

  // =========================================================================
  // Configuration & Constants (matched to christmas_tree.py)
  // =========================================================================
  const TAU = Math.PI * 2;
  const BG_COLOR = '#05080f';

  // Scene & animation choreography (seconds)
  const T_GROW = [0.7, 5.6];
  const T_GARLAND = [6.4, 8.6];
  const T_BALLS = [7.4, 9.5];
  const T_LIGHTS = [8.3, 11.3];
  const T_GIFTS = [10.0, 11.5];
  const T_STAR = 11.8;
  const T_MSG = 12.2;

  // 3D world bounds & rotation speed
  const GROUND = -1.12;
  const Y0 = -0.76;
  const Y1 = 1.24;
  const ROT_SPEED = 0.31; // rad/s
  const CAM_PITCH = 0.15;
  const COS_PITCH = Math.cos(CAM_PITCH);
  const SIN_PITCH = Math.sin(CAM_PITCH);

  // Material kinds
  const NEEDLE = 0;
  const SNOW = 1;
  const CONE = 2;
  const TRUNK = 3;
  const TINSEL = 4;
  const BALL = 5;
  const LIGHT = 6;
  const GIFT = 7;
  const RIBBON = 8;

  // Colors (normalized 0..1 RGB)
  const WHITE = [1.0, 1.0, 1.0];
  const SNOW_COL = [0.88, 0.94, 1.0];
  const GOLD = [1.0, 0.84, 0.28];
  const BAUBLE_GOLD = [1.0, 0.78, 0.24];
  const RED = [0.96, 0.2, 0.24];
  const WARM = [1.0, 0.88, 0.5];
  const GREEN_BOX = [0.18, 0.78, 0.34];
  const BLUE_BOX = [0.22, 0.48, 0.98];
  const SILVER = [0.86, 0.9, 0.98];

  // Luminance-ordered ASCII ramp
  const RAMP = ' .,:;-~=+*^oxv%&#W@';
  const RAMP_MAX = RAMP.length - 1;

  // Fast 0..255 -> 2-digit hex lookup table
  const HEX_BYTE = new Array(256);
  for (let i = 0; i < 256; i++) {
    HEX_BYTE[i] = i.toString(16).padStart(2, '0');
  }

  // Van Gogh "The Starry Night" (1889) 15-Shade Rich Impasto Palette
  const VG_COLORS = {
    nightDeep: '#102448',
    ultramarine: '#183668',
    prussian: '#224c8c',
    cobalt: '#2e6bbf',
    royalBlue: '#4398e8',
    cyan: '#6ad4f0',
    lightCyan: '#a8ebf7',
    iceCream: '#dcf7fc',
    cream: '#fffbe6',
    warmWhite: '#fffbe6',
    paleGold: '#ffea85',
    brightGold: '#ffea85',
    gold: '#ffd166',
    amber: '#ffb703',
    orangeGold: '#f48c06',
  };

  function buildPaletteLut(stops, size) {
    const parsed = stops.map((hex) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]);
    const lut = new Array(size);
    const maxSeg = parsed.length - 1;
    for (let i = 0; i < size; i++) {
      const u = (i / (size - 1)) * maxSeg;
      const idx = Math.min(maxSeg - 1, Math.floor(u));
      const f = u - idx;
      const a = parsed[idx];
      const b = parsed[idx + 1];
      const r = clamp(Math.round(a[0] + (b[0] - a[0]) * f), 0, 255);
      const g = clamp(Math.round(a[1] + (b[1] - a[1]) * f), 0, 255);
      const bl = clamp(Math.round(a[2] + (b[2] - a[2]) * f), 0, 255);
      lut[i] = '#' + HEX_BYTE[r] + HEX_BYTE[g] + HEX_BYTE[bl];
    }
    return lut;
  }

  const VG_SKY_LUT = buildPaletteLut(
    ['#102448', '#183668', '#224c8c', '#2e6bbf', '#4398e8', '#6ad4f0', '#a8ebf7'],
    64
  );
  const VG_GOLD_LUT = buildPaletteLut(
    ['#fffbe6', '#ffea85', '#ffd166', '#ffb703', '#f48c06'],
    32
  );
  const VG_RAMP = ' .·:~≈*o°';

  // Offscreen canvases for 60 FPS multi-scale additive bloom
  let bloomCanvas1 = null;
  let bloomCtx1 = null;
  let bloomCanvas2 = null;
  let bloomCtx2 = null;
  let supportsCtxFilter = null;

  function ensureBloomCanvases() {
    if (bloomCanvas1 && bloomCanvas2) return true;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false;
    try {
      bloomCanvas1 = document.createElement('canvas');
      bloomCanvas2 = document.createElement('canvas');
      bloomCtx1 = bloomCanvas1.getContext ? bloomCanvas1.getContext('2d') : null;
      bloomCtx2 = bloomCanvas2.getContext ? bloomCanvas2.getContext('2d') : null;
      if (!bloomCtx1 || !bloomCtx2) {
        bloomCanvas1 = null;
        bloomCanvas2 = null;
        return false;
      }
      if (supportsCtxFilter === null) {
        supportsCtxFilter = typeof bloomCtx1.filter === 'string';
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function resizeBloomCanvases() {
    if (!ensureBloomCanvases()) return;
    const cw = Math.max(1, canvas.width || Math.floor(viewWidth * dpr));
    const ch = Math.max(1, canvas.height || Math.floor(viewHeight * dpr));
    bloomCanvas1.width = Math.max(1, Math.floor(cw / 4));
    bloomCanvas1.height = Math.max(1, Math.floor(ch / 4));
    bloomCanvas2.width = Math.max(1, Math.floor(cw / 10));
    bloomCanvas2.height = Math.max(1, Math.floor(ch / 10));
  }

  // Grid dimensions (recalculated on resize)
  let viewWidth = window.innerWidth || 1280;
  let viewHeight = window.innerHeight || 720;
  let cols = 140;
  let rows = 74;
  let cellW = 9;
  let cellH = 15;
  let dpr = 1;
  let horizonRow = 48;

  // Frame buffers
  let charBuf = [];
  let colorBuf = [];
  let zBuf = new Float32Array(0);
  let glowBuf = new Uint8Array(0);

  // Scene data (3D point cloud stored in TypedArrays)
  let sceneData = null;

  // Background entities
  let skyStars = [];
  let snowFlakes = [];

  // Van Gogh Starry Night entities & two-phase state (Left->Right Sweep + Rolling Waves)
  let vanGoghVortices = [];
  let starOrbs = [];
  let crescentMoon = null;
  let swirlParticles = [];
  let interactiveVortices = [];
  let vanGoghSweepProgress = 0;
  let vanGoghWaveTime = 0;
  let vanGoghClickActive = false;

  // Animation, splash screen & audio sync state
  let hasStarted = false;
  let splashStartTime = performance.now();
  let startTime = splashStartTime;
  let introBurstTime = 0;
  let justStartedAt = 0;

  // =========================================================================
  // Math, PRNG & Geometry Helpers
  // =========================================================================
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function smooth(x) {
    const t = clamp(x, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function rgbFloatToHex(r, g, b) {
    const ir = clamp((r * 255 + 0.5) | 0, 0, 255);
    const ig = clamp((g * 255 + 0.5) | 0, 0, 255);
    const ib = clamp((b * 255 + 0.5) | 0, 0, 255);
    return '#' + HEX_BYTE[ir] + HEX_BYTE[ig] + HEX_BYTE[ib];
  }

  // Shade a #rrggbb hex color by a brightness multiplier [0..1.5]
  function shadeHexColor(hex, factor) {
    if (!hex || hex.length < 7 || hex[0] !== '#') return hex;
    const r = clamp(Math.round(parseInt(hex.slice(1, 3), 16) * factor), 0, 255);
    const g = clamp(Math.round(parseInt(hex.slice(3, 5), 16) * factor), 0, 255);
    const b = clamp(Math.round(parseInt(hex.slice(5, 7), 16) * factor), 0, 255);
    return '#' + HEX_BYTE[r] + HEX_BYTE[g] + HEX_BYTE[b];
  }

  function createRng(initialSeed) {
    let s = initialSeed >>> 0;
    let hasSpare = false;
    let spare = 0;

    function random() {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    function uniform(min, max) {
      return min + (max - min) * random();
    }

    function normal(mean = 0, std = 1) {
      if (hasSpare) {
        hasSpare = false;
        return mean + std * spare;
      }
      let u = 0;
      let v = 0;
      while (u <= 1e-7) u = random();
      v = random();
      const mag = Math.sqrt(-2.0 * Math.log(u));
      const z0 = mag * Math.cos(TAU * v);
      const z1 = mag * Math.sin(TAU * v);
      spare = z1;
      hasSpare = true;
      return mean + std * z0;
    }

    return { random, uniform, normal };
  }

  function fibSphere(n) {
    const pts = new Array(n);
    for (let k = 0; k < n; k++) {
      const i = k + 0.5;
      const z = 1.0 - (2.0 * i) / n;
      const r = Math.sqrt(Math.max(1.0 - z * z, 0.0));
      const phi = i * 2.39996323;
      pts[k] = [Math.cos(phi) * r, z, Math.sin(phi) * r];
    }
    return pts;
  }

  function envelope(y) {
    const u = clamp((y - Y0) / (Y1 - Y0), 0.0, 1.0);
    const tiers = 1.0 + 0.07 * Math.sin(u * TAU * 5.0) * (1.0 - u);
    return 0.96 * Math.pow(1.0 - u, 0.90) * tiers;
  }

  function growTime(y) {
    const u = clamp((y - GROUND) / (Y1 - GROUND), 0.0, 1.0);
    return T_GROW[0] + (T_GROW[1] - T_GROW[0]) * u;
  }

  function pointInPoly(px, py, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % n];
      const cross = (y1 > py) !== (y2 > py);
      if (cross) {
        const xInt = ((x2 - x1) * (py - y1)) / (y2 - y1 + 1e-9) + x1;
        if (px < xInt) inside = !inside;
      }
    }
    return inside;
  }

  function project3D(px, py, pz, ca, sa, halfCols, centerY, scalePix, aspect) {
    const x = px * ca - pz * sa;
    const y = py - 0.12;
    const z = px * sa + pz * ca;
    const yp = y * COS_PITCH - z * SIN_PITCH;
    const zp = y * SIN_PITCH + z * COS_PITCH + 4.85;
    const scale = 2.65 / Math.max(zp, 0.25);
    const sx = halfCols + (x * scale * scalePix) / aspect;
    const sy = centerY - yp * scale * scalePix;
    return { sx, sy, zp };
  }

  // =========================================================================
  // Audio Hook Integration & Responsive Layout Helpers
  // =========================================================================
  function hash2D(ix, iz) {
    let n = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function getSkyScale() {
    return clamp(Math.min(cols / 135, horizonRow / 48), 0.42, 1.15);
  }

  function getLayoutParams() {
    const aspect = cellW / Math.max(1, cellH);
    const halfCols = cols * 0.5;
    const isPortrait = viewWidth < viewHeight;
    const centerY = rows * (isPortrait ? 0.52 : 0.49);
    const maxScaleByHeight = rows * 0.37;
    const maxScaleByWidth = cols * aspect * 0.50;
    const scalePix = Math.min(maxScaleByHeight, maxScaleByWidth);
    const computedHorizon = Math.round(
      clamp(centerY + 2.65 * Math.tan(CAM_PITCH) * scalePix, rows * 0.50, rows * 0.68)
    );
    return {
      aspect,
      halfCols,
      isPortrait,
      centerY,
      scalePix,
      horizonRow: computedHorizon,
    };
  }

  function isAudioPlaying() {
    return Boolean(
      window.ChristmasAudio &&
        typeof window.ChristmasAudio.isPlaying === 'function' &&
        window.ChristmasAudio.isPlaying()
    );
  }

  function tryInitAudio() {
    if (window.ChristmasAudio && typeof window.ChristmasAudio.initAndPlay === 'function') {
      try {
        window.ChristmasAudio.initAndPlay();
      } catch (_) {}
    }
  }

  // Real-time music energy & beat pulse synchronization with "Merry Christmas Mr. Lawrence"
  function getMusicSyncState(elapsed) {
    let energy = 0.58 + 0.22 * Math.sin(elapsed * 1.15);
    let pulse = Math.pow(0.5 + 0.5 * Math.sin(elapsed * (102 / 60) * TAU), 2.2);

    const audio = window.ChristmasAudio;
    if (audio) {
      try {
        if (typeof audio.getMusicEnergy === 'function') {
          const res = audio.getMusicEnergy();
          if (typeof res === 'number' && !Number.isNaN(res)) {
            energy = clamp(res, 0, 1.5);
          } else if (res && typeof res === 'object') {
            if (typeof res.energy === 'number') energy = clamp(res.energy, 0, 1.5);
            if (typeof res.pulse === 'number') pulse = clamp(res.pulse, 0, 1.5);
            else if (typeof res.beatPulse === 'number') pulse = clamp(res.beatPulse, 0, 1.5);
          }
        }
        if (typeof audio.getBeatPulse === 'function') {
          const bp = audio.getBeatPulse();
          if (typeof bp === 'number' && !Number.isNaN(bp)) {
            pulse = clamp(bp, 0, 1.5);
          } else if (bp && typeof bp === 'object' && typeof bp.pulse === 'number') {
            pulse = clamp(bp.pulse, 0, 1.5);
          }
        }
      } catch (_) {}
    }

    return { energy, pulse };
  }

  function startExperience() {
    if (hasStarted) return;
    const now = performance.now();
    hasStarted = true;
    justStartedAt = now;
    startTime = now;
    introBurstTime = now;
    vanGoghSweepProgress = 0;
    vanGoghWaveTime = 0;
    vanGoghClickActive = false;
    interactiveVortices = [];
    canvas.style.cursor = 'default';
    tryInitAudio();
  }

  // Keyboard support: Enter or Space starts from splash screen
  window.addEventListener('keydown', (e) => {
    if (!hasStarted) {
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        startExperience();
      }
      return;
    }
    if (!isAudioPlaying()) tryInitAudio();
  });

  // Valid iOS Safari & desktop user-activation gestures (click & touchend unlock HTMLAudioElement)
  window.addEventListener(
    'click',
    () => {
      if (!hasStarted) {
        startExperience();
        return;
      }
      if (!isAudioPlaying()) {
        tryInitAudio();
      }
    },
    { passive: true }
  );

  window.addEventListener(
    'touchend',
    (e) => {
      if (!hasStarted) {
        startExperience();
        return;
      }

      if (!isAudioPlaying()) {
        tryInitAudio();
      }
    },
    { passive: true }
  );

  // Hover cursor feedback: pointer on splash screen or sky above horizon
  canvas.addEventListener('pointermove', (e) => {
    if (!hasStarted) {
      canvas.style.cursor = 'pointer';
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const hoverRow = Math.floor((e.clientY - rect.top) / cellH);
    canvas.style.cursor = hoverRow >= 0 && hoverRow < horizonRow ? 'pointer' : 'default';
  });

  // Interactive Sky Click (after start): spawns Van Gogh star vortex on dark sky
  canvas.addEventListener('pointerdown', (e) => {
    if (!hasStarted) {
      return;
    }

    if (!isAudioPlaying()) {
      tryInitAudio();
    }

    // Prevent the opening splash gesture from also spawning a sky vortex
    if (performance.now() - justStartedAt < 350) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const clickCol = Math.floor(clickX / cellW);
    const clickRow = Math.floor(clickY / cellH);

    if (clickRow >= 0 && clickRow < horizonRow) {
      vanGoghClickActive = true;

      const skyScale = getSkyScale();
      const baseRadius = 6.2 + (interactiveVortices.length % 3) * 1.1;
      const dir = interactiveVortices.length % 2 === 0 ? 1 : -1;
      interactiveVortices.push({
        c: clamp(clickCol, 5, cols - 6),
        r: clamp(clickRow, 6, Math.max(7, horizonRow - 4)),
        nx: clamp(clickCol / Math.max(1, cols), 0.05, 0.95),
        ny: clamp(clickRow / Math.max(1, horizonRow), 0.08, 0.90),
        dir,
        arms: 2,
        twists: 1.6,
        baseRadius,
        radius: baseRadius * skyScale,
        strength: 1.4,
        bornAt: performance.now() / 1000,
        phase: Math.random() * TAU,
      });

      if (interactiveVortices.length > 8) {
        interactiveVortices.shift();
      }
    }
  });

  // =========================================================================
  // 3D Scene Builder (exact geometry from christmas_tree.py build())
  // =========================================================================
  function buildSceneData() {
    const rng = createRng(7);

    // Dynamic staging arrays before compiling to contiguous TypedArrays
    const arrPx = [];
    const arrPy = [];
    const arrPz = [];
    const arrNx = [];
    const arrNy = [];
    const arrNz = [];
    const arrCr = [];
    const arrCg = [];
    const arrCb = [];
    const arrKind = [];
    const arrT0 = [];
    const arrBase = [];
    const arrCx = [];
    const arrCy = [];
    const arrCz = [];
    const arrPhase = [];
    const arrPop = [];

    function pushPoint(px, py, pz, nx, ny, nz, col, kind, t0, base, cx, cy, cz, phase, pop) {
      const nLen = Math.hypot(nx, ny, nz);
      const invN = nLen > 1e-8 ? 1.0 / nLen : 1.0;
      arrPx.push(px);
      arrPy.push(py);
      arrPz.push(pz);
      arrNx.push(nx * invN);
      arrNy.push(ny * invN);
      arrNz.push(nz * invN);
      arrCr.push(col[0]);
      arrCg.push(col[1]);
      arrCb.push(col[2]);
      arrKind.push(kind);
      arrT0.push(t0);
      arrBase.push(base);
      arrCx.push(cx);
      arrCy.push(cy);
      arrCz.push(cz);
      arrPhase.push(phase);
      arrPop.push(pop ? 1 : 0);
    }

    const tips = [];

    // 1. Needles & Snow: 25 whorls of drooping branches, denser and longer at the bottom
    const numWhorls = 25;
    const yStart = Y0 + 0.02;
    const yEnd = Y1 - 0.08;
    for (let i = 0; i < numWhorls; i++) {
      const y = yStart + (i / (numWhorls - 1)) * (yEnd - yStart);
      const u = (y - Y0) / (Y1 - Y0);
      const R = envelope(y) + 0.05;
      const nb = Math.floor(7 + 12 * (1.0 - u));

      for (let b = 0; b < nb; b++) {
        const a = (TAU * (b + 0.5 * rng.random())) / nb + i * 0.77;
        const L = R * rng.uniform(0.85, 1.08);
        const n = Math.floor(26 + 240 * L);
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const sideX = -dz;
        const sideZ = dx;
        const baseGrow = growTime(y);

        for (let k = 0; k < n; k++) {
          const s = Math.pow(rng.random(), 0.65); // 0 trunk .. 1 tip
          const spread = (0.025 + 0.09 * s) * rng.normal();
          const sl = s * L;
          const px = dx * sl + sideX * spread;
          const pz = dz * sl + sideZ * spread;
          const py = y + 0.06 * sl - 0.2 * sl * sl + 0.012 * rng.normal();

          const rnx = dx * 0.75 + 0.3 * rng.normal();
          const rny = 0.55 + 0.3 * rng.normal();
          const rnz = dz * 0.75 + 0.3 * rng.normal();
          const nLen = Math.max(Math.hypot(rnx, rny, rnz), 1e-8);
          const nrmY = rny / nLen;

          const ao = (0.3 + 0.7 * Math.pow(s, 1.3)) * rng.uniform(0.75, 1.1);
          const isSnow = s > 0.5 && rng.random() < 0.07 * s && nrmY > 0.5;
          const col = isSnow
            ? SNOW_COL
            : [
                0.1 + 0.12 * rng.random(),
                0.48 + 0.38 * rng.random(),
                0.18 + 0.14 * rng.random(),
              ];

          pushPoint(
            px,
            py,
            pz,
            rnx,
            rny,
            rnz,
            col,
            isSnow ? SNOW : NEEDLE,
            baseGrow + 0.45 * s,
            isSnow ? 1.0 : ao,
            px,
            py,
            pz,
            0.0,
            false
          );
        }

        const tl = 0.93 * L;
        tips.push([dx * tl, y + 0.06 * tl - 0.2 * tl * tl, dz * tl]);
      }
    }

    // 2. Dark Inner Cone so nothing shows through the branches (4200 points)
    for (let i = 0; i < 4200; i++) {
      const y = Y0 + (Y1 - 0.1 - Y0) * rng.random();
      const phi = rng.random() * TAU;
      const cphi = Math.cos(phi);
      const sphi = Math.sin(phi);
      const r = 0.6 * envelope(y);
      const px = cphi * r;
      const pz = sphi * r;
      pushPoint(
        px,
        y,
        pz,
        cphi,
        0.3,
        sphi,
        [0.06, 0.28, 0.1],
        CONE,
        growTime(y),
        0.55,
        px,
        y,
        pz,
        0.0,
        false
      );
    }

    // 3. Trunk cylinder (1000 points)
    for (let i = 0; i < 1000; i++) {
      const y = GROUND + rng.random() * (Y0 + 0.1 - GROUND);
      const phi = rng.random() * TAU;
      const nx = Math.cos(phi);
      const nz = Math.sin(phi);
      const bark = 0.75 + 0.25 * Math.sign(Math.sin(phi * 30.0 + y * 5.0));
      const px = nx * 0.08;
      const pz = nz * 0.08;
      pushPoint(
        px,
        y,
        pz,
        nx,
        0.0,
        nz,
        [0.42 * bark, 0.24 * bark, 0.12 * bark],
        TRUNK,
        growTime(y),
        1.0,
        px,
        y,
        pz,
        0.0,
        false
      );
    }

    // 4. Tinsel Garland: gold spiral drooping in catenary swags (3 strands x 1800 points)
    const tinselCount = 1800;
    const turns = 3.6;
    for (let strand = 0; strand < 3; strand++) {
      for (let i = 0; i < tinselCount; i++) {
        const u = i / (tinselCount - 1);
        const yg = Y0 + 0.15 + (Y1 - Y0 - 0.45) * u;
        const ag = TAU * turns * u + 0.9;
        const swag = -0.07 * Math.abs(Math.sin(ag * 2.5));
        const rg = envelope(yg) + 0.07;
        const cag = Math.cos(ag);
        const sag = Math.sin(ag);

        const px = cag * rg + 0.016 * rng.normal();
        const py = yg + swag + 0.016 * rng.normal();
        const pz = sag * rg + 0.016 * rng.normal();
        const nx = cag + 0.6 * rng.normal();
        const ny = 0.3 + 0.6 * rng.normal();
        const nz = sag + 0.6 * rng.normal();

        pushPoint(
          px,
          py,
          pz,
          nx,
          ny,
          nz,
          GOLD,
          TINSEL,
          T_GARLAND[0] + u * (T_GARLAND[1] - T_GARLAND[0]),
          1.0,
          px,
          py,
          pz,
          rng.random() * TAU,
          false
        );
      }
    }

    // 5. 34 Baubles (fib_sphere(160)) nestled on the tree silhouette
    const sphere = fibSphere(160);
    for (let k = 0; k < 34; k++) {
      const u = (k + rng.random()) / 34.0;
      const y = Y0 + 0.08 + u * (Y1 - Y0 - 0.38);
      const a = k * 2.39996 + rng.random() * 0.4;
      const rEnv = envelope(y) + 0.02;
      const cx = Math.cos(a) * rEnv;
      const cy = y - 0.03;
      const cz = Math.sin(a) * rEnv;
      const rad = 0.058 + 0.032 * (1.0 - u);
      const col = k % 2 === 0 ? RED : k % 4 === 1 ? BAUBLE_GOLD : SILVER;
      const tBall = T_BALLS[0] + rng.random() * (T_BALLS[1] - T_BALLS[0]);

      for (let s = 0; s < sphere.length; s++) {
        const sp = sphere[s];
        pushPoint(
          cx + sp[0] * rad,
          cy + sp[1] * rad,
          cz + sp[2] * rad,
          sp[0],
          sp[1],
          sp[2],
          col,
          BALL,
          tBall,
          1.0,
          cx,
          cy,
          cz,
          0.0,
          true
        );
      }
    }

    // 6. 170 Fairy Lights on the branch tips (Fisher-Yates partial shuffle)
    const tipIndices = new Array(tips.length);
    for (let i = 0; i < tips.length; i++) tipIndices[i] = i;
    const numLights = Math.min(170, tips.length);
    for (let i = 0; i < numLights; i++) {
      const j = i + Math.floor(rng.random() * (tips.length - i));
      const tmp = tipIndices[i];
      tipIndices[i] = tipIndices[j];
      tipIndices[j] = tmp;
    }

    const bulb = fibSphere(16);
    for (let i = 0; i < numLights; i++) {
      const c = tips[tipIndices[i]];
      const t0 = T_LIGHTS[0] + rng.random() * (T_LIGHTS[1] - T_LIGHTS[0]);
      const col = rng.random() < 0.8 ? WARM : [1.0, 0.95, 0.85];
      const phase = rng.random() * TAU;

      for (let b = 0; b < bulb.length; b++) {
        const bp = bulb[b];
        pushPoint(
          c[0] + bp[0] * 0.03,
          c[1] + bp[1] * 0.03,
          c[2] + bp[2] * 0.03,
          bp[0],
          bp[1],
          bp[2],
          col,
          LIGHT,
          t0,
          1.0,
          c[0],
          c[1],
          c[2],
          phase,
          false
        );
      }
    }

    // 7. 6 3D Gift Boxes with crossed ribbon and 3D bow loops around the base
    const gifts = [
      [0.3, 0.96, 0.25, 0.2, 0.24, 0.4, RED, GOLD],
      [1.4, 1.02, 0.23, 0.23, 0.22, 0.9, BLUE_BOX, SILVER],
      [2.5, 0.95, 0.28, 0.16, 0.22, 1.0, GOLD, RED],
      [3.6, 1.0, 0.22, 0.22, 0.22, 0.3, RED, WHITE],
      [4.6, 0.95, 0.25, 0.19, 0.25, 0.1, GREEN_BOX, RED],
      [5.5, 1.02, 0.22, 0.2, 0.21, 0.7, BLUE_BOX, GOLD],
    ];

    const loop = fibSphere(84);
    const SAMPLES_PER_UNIT = 78; // Dense stratified sampling so boxes never have pinholes on wide screens

    for (let gIdx = 0; gIdx < gifts.length; gIdx++) {
      const [a, dist, w, h, d, rot, body, rib] = gifts[gIdx];
      const ca = Math.cos(rot);
      const sa = Math.sin(rot);
      const centerX = Math.cos(a) * dist;
      const centerY = GROUND;
      const centerZ = Math.sin(a) * dist;
      const popCy = centerY + h * 0.5;
      const tGift = T_GIFTS[0] + (gIdx / gifts.length) * (T_GIFTS[1] - T_GIFTS[0]);

      const nw = Math.max(10, Math.ceil(w * SAMPLES_PER_UNIT));
      const nh = Math.max(8, Math.ceil(h * SAMPLES_PER_UNIT));
      const nd = Math.max(10, Math.ceil(d * SAMPLES_PER_UNIT));

      const emitGiftSample = (lx, ly, lz, nrmX, nrmY, nrmZ, isRib) => {
        const wx = lx * ca - lz * sa + centerX;
        const wy = ly + centerY;
        const wz = lx * sa + lz * ca + centerZ;
        const wnx = nrmX * ca - nrmZ * sa;
        const wnz = nrmX * sa + nrmZ * ca;
        pushPoint(
          wx,
          wy,
          wz,
          wnx,
          nrmY,
          wnz,
          isRib ? rib : body,
          isRib ? RIBBON : GIFT,
          tGift,
          1.0,
          centerX,
          popCy,
          centerZ,
          0.0,
          true
        );
      };

      // Face 0: Top lid (y = h)
      for (let ix = 0; ix < nw; ix++) {
        for (let iz = 0; iz < nd; iz++) {
          const lx = ((ix + 0.15 + 0.7 * rng.random()) / nw - 0.5) * w;
          const lz = ((iz + 0.15 + 0.7 * rng.random()) / nd - 0.5) * d;
          const isRib = Math.abs(lx) < 0.024 || Math.abs(lz) < 0.024;
          emitGiftSample(lx, h, lz, 0, 1, 0, isRib);
        }
      }

      // Face 1 (+X) and Face 2 (-X)
      for (let side = -1; side <= 1; side += 2) {
        const lx = side * (w * 0.5);
        for (let iz = 0; iz < nd; iz++) {
          for (let iy = 0; iy < nh; iy++) {
            const lz = ((iz + 0.15 + 0.7 * rng.random()) / nd - 0.5) * d;
            const ly = ((iy + 0.15 + 0.7 * rng.random()) / nh) * h;
            const isRib = Math.abs(lz) < 0.024;
            emitGiftSample(lx, ly, lz, side, 0, 0, isRib);
          }
        }
      }

      // Face 3 (+Z) and Face 4 (-Z)
      for (let side = -1; side <= 1; side += 2) {
        const lz = side * (d * 0.5);
        for (let ix = 0; ix < nw; ix++) {
          for (let iy = 0; iy < nh; iy++) {
            const lx = ((ix + 0.15 + 0.7 * rng.random()) / nw - 0.5) * w;
            const ly = ((iy + 0.15 + 0.7 * rng.random()) / nh) * h;
            const isRib = Math.abs(lx) < 0.024;
            emitGiftSample(lx, ly, lz, 0, 0, side, isRib);
          }
        }
      }

      // Crossed 3D bow loops on top of each gift
      for (let bi = 0; bi < 2; bi++) {
        const ba = bi * (Math.PI * 0.5);
        const bang = ba + rot;
        const cba = Math.cos(bang);
        const sba = Math.sin(bang);
        const bowOffX = centerX + cba * 0.035;
        const bowOffY = centerY + h + 0.03;
        const bowOffZ = centerZ + sba * 0.035;

        for (let l = 0; l < loop.length; l++) {
          const lp = loop[l];
          const bpx = lp[0] * 0.045;
          const bpy = lp[1] * 0.026;
          const bpz = lp[2] * 0.024;
          const rx = bpx * cba - bpz * sba;
          const rz = bpx * sba + bpz * cba;
          pushPoint(
            rx + bowOffX,
            bpy + bowOffY,
            rz + bowOffZ,
            lp[0],
            lp[1],
            lp[2],
            rib,
            RIBBON,
            tGift + 0.05,
            1.0,
            bowOffX,
            bowOffY,
            bowOffZ,
            0.0,
            true
          );
        }
      }
    }

    return {
      count: arrPx.length,
      px: new Float32Array(arrPx),
      py: new Float32Array(arrPy),
      pz: new Float32Array(arrPz),
      nx: new Float32Array(arrNx),
      ny: new Float32Array(arrNy),
      nz: new Float32Array(arrNz),
      cr: new Float32Array(arrCr),
      cg: new Float32Array(arrCg),
      cb: new Float32Array(arrCb),
      kind: new Uint8Array(arrKind),
      t0: new Float32Array(arrT0),
      base: new Float32Array(arrBase),
      cx: new Float32Array(arrCx),
      cy: new Float32Array(arrCy),
      cz: new Float32Array(arrCz),
      phase: new Float32Array(arrPhase),
      pop: new Uint8Array(arrPop),
    };
  }

  // =========================================================================
  // Sky Stars, Van Gogh Starry Night, Snow & 3D Perspective Ground Setup
  // =========================================================================
  function buildSkyAndGround() {
    const rng = createRng(42);
    skyStars = [];
    snowFlakes = [];
    vanGoghVortices = [];
    starOrbs = [];
    swirlParticles = [];

    horizonRow = getLayoutParams().horizonRow;
    const skyScale = getSkyScale();
    const isNarrowSky = cols < 85;
    const aspectX = clamp(cellH / Math.max(1, cellW), 1.45, 1.95);
    const widthScale = clamp((cols / aspectX) / Math.max(1, horizonRow * 2.15), 0.36, 1.0);
    const primaryScale = horizonRow * widthScale;

    // 1. Night Sky Stars above horizon
    const nStars = Math.floor(cols * horizonRow * 0.036);
    const starPalette = ['#d8e2ef', '#a9bcd0', '#ffffff', '#8fa8c8', '#6c7d93'];
    for (let i = 0; i < nStars; i++) {
      const c = Math.floor(rng.random() * cols);
      const r = Math.floor(rng.random() * Math.max(1, horizonRow));
      const roll = rng.random();
      let ch = '.';
      let isCluster = false;
      if (roll < 0.45) ch = '+';
      else if (roll < 0.75) ch = '*';
      else if (roll < 0.93) ch = '.';
      else {
        ch = '+';
        isCluster = true;
      }

      skyStars.push({
        c,
        r,
        ch,
        isCluster,
        baseColor: starPalette[i % starPalette.length],
        phase: rng.random() * TAU,
        speed: rng.uniform(1.2, 3.2),
      });
    }

    // 2. Asymmetrical Van Gogh Starry Night Composition:
    //    (A) ONLY 2 Blue Wind Vortices forming a diagonal S-curve from upper-left to lower-right:
    //        - 1 Great Primary Blue Swirl (upper-left: nx 0.31, ny 0.36)
    //        - 1 Smaller Secondary Blue Swirl (lower-right: nx 0.67, ny 0.56)
    const spiralSpecs = isNarrowSky
      ? [
          {
            nx: 0.28,
            ny: 0.34,
            maxR: Math.max(6.4, primaryScale * 0.45),
            arms: 3,
            twists: 2.3,
            dir: 1,
            speed: 0.88,
            palette: 'cyan-blue',
            isPrimary: true,
          },
          {
            nx: 0.72,
            ny: 0.56,
            maxR: Math.max(4.4, primaryScale * 0.27),
            arms: 2,
            twists: 1.85,
            dir: -1,
            speed: 0.98,
            palette: 'cyan-blue',
            isPrimary: false,
          },
        ]
      : [
          {
            nx: 0.31,
            ny: 0.36,
            maxR: Math.max(9.5, primaryScale * 0.46),
            arms: 3,
            twists: 2.75,
            dir: 1,
            speed: 0.88,
            palette: 'cyan-blue',
            isPrimary: true,
          },
          {
            nx: 0.67,
            ny: 0.56,
            maxR: Math.max(6.0, primaryScale * 0.27),
            arms: 2,
            twists: 2.05,
            dir: -1,
            speed: 0.98,
            palette: 'cyan-blue',
            isPrimary: false,
          },
        ];

    for (let i = 0; i < spiralSpecs.length; i++) {
      const sp = spiralSpecs[i];
      const baseC = clamp(Math.round(sp.nx * cols), 4, Math.max(5, cols - 5));
      const minR = 7;
      const maxBaseR = Math.max(minR + 1, horizonRow - 6);
      const baseR = clamp(Math.round(sp.ny * horizonRow), minR, maxBaseR);

      vanGoghVortices.push({
        c: baseC,
        r: baseR,
        baseC,
        baseR,
        nx: sp.nx,
        ny: sp.ny,
        maxR: sp.maxR,
        arms: sp.arms,
        twists: sp.twists,
        dir: sp.dir,
        speed: sp.speed,
        palette: sp.palette,
        isPrimary: sp.isPrimary,
        phase: i * 1.37,
      });
    }

    //    (B) Luminous Star Orbs (soft concentric radial halos, NO pinwheel spiral arms):
    //        - Large white-gold Venus at bottom-left beside tree base
    //        - 2 small asymmetrical left stars + 2 small asymmetrical upper-right stars
    const orbScale = clamp(widthScale, 0.52, 1.05);
    const orbSpecs = isNarrowSky
      ? [
          {
            nx: 0.22,
            ny: 0.64,
            isVenus: true,
            coreR: clamp(horizonRow * 0.036 * orbScale, 1.2, 1.9),
            haloR: clamp(horizonRow * 0.115 * orbScale, 3.4, 5.2),
            speed: 1.15,
          },
          {
            nx: 0.15,
            ny: 0.17,
            isVenus: false,
            coreR: 0.85,
            haloR: clamp(horizonRow * 0.055 * orbScale, 1.9, 2.7),
            speed: 1.35,
          },
          {
            nx: 0.07,
            ny: 0.50,
            isVenus: false,
            coreR: 0.85,
            haloR: clamp(horizonRow * 0.055 * orbScale, 1.9, 2.7),
            speed: 1.48,
          },
          {
            nx: 0.58,
            ny: 0.14,
            isVenus: false,
            coreR: 0.85,
            haloR: clamp(horizonRow * 0.052 * orbScale, 1.8, 2.5),
            speed: 1.42,
          },
          {
            nx: 0.71,
            ny: 0.28,
            isVenus: false,
            coreR: 0.85,
            haloR: clamp(horizonRow * 0.052 * orbScale, 1.8, 2.5),
            speed: 1.56,
          },
        ]
      : [
          {
            nx: 0.34,
            ny: 0.62,
            isVenus: true,
            coreR: clamp(horizonRow * 0.042 * orbScale, 1.4, 2.3),
            haloR: clamp(horizonRow * 0.145 * orbScale, 4.2, 7.2),
            speed: 1.15,
          },
          {
            nx: 0.18,
            ny: 0.18,
            isVenus: false,
            coreR: 0.95,
            haloR: clamp(horizonRow * 0.068 * orbScale, 2.2, 3.5),
            speed: 1.35,
          },
          {
            nx: 0.06,
            ny: 0.54,
            isVenus: false,
            coreR: 0.9,
            haloR: clamp(horizonRow * 0.064 * orbScale, 2.1, 3.3),
            speed: 1.48,
          },
          {
            nx: 0.59,
            ny: 0.14,
            isVenus: false,
            coreR: 0.9,
            haloR: clamp(horizonRow * 0.062 * orbScale, 2.0, 3.2),
            speed: 1.42,
          },
          {
            nx: 0.72,
            ny: 0.28,
            isVenus: false,
            coreR: 0.95,
            haloR: clamp(horizonRow * 0.066 * orbScale, 2.1, 3.4),
            speed: 1.56,
          },
        ];

    for (let i = 0; i < orbSpecs.length; i++) {
      const os = orbSpecs[i];
      const baseC = clamp(Math.round(os.nx * cols), 3, Math.max(4, cols - 4));
      const baseR = clamp(Math.round(os.ny * horizonRow), 6, Math.max(7, horizonRow - 5));
      starOrbs.push({
        c: baseC,
        r: baseR,
        baseC,
        baseR,
        nx: os.nx,
        ny: os.ny,
        isVenus: os.isVenus,
        coreR: os.coreR,
        haloR: os.haloR,
        speed: os.speed,
        phase: i * 1.47 + 0.35,
      });
    }

    //    (C) Giant Golden-Orange Crescent Moon at top-right (nx: 0.88, ny: 0.22)
    const moonNx = 0.88;
    const moonNy = 0.22;
    const moonCoreR = clamp(horizonRow * 0.082 * clamp(widthScale, 0.55, 1.05), 2.1, 4.1);
    const moonHaloR = clamp(horizonRow * 0.215 * clamp(widthScale, 0.52, 1.05), 5.0, 10.6);
    crescentMoon = {
      c: clamp(Math.round(cols * moonNx), 6, Math.max(7, cols - 6)),
      r: Math.max(7, Math.round(horizonRow * moonNy)),
      nx: moonNx,
      ny: moonNy,
      coreRadius: moonCoreR,
      haloRadius: moonHaloR,
      speed: 0.88,
    };

    for (let i = 0; i < interactiveVortices.length; i++) {
      const iv = interactiveVortices[i];
      iv.c = clamp(Math.round(iv.nx * cols), 5, cols - 6);
      iv.r = clamp(Math.round(iv.ny * horizonRow), 6, Math.max(7, horizonRow - 4));
      iv.radius = (iv.baseRadius || 6.5) * skyScale;
    }

    const numSwirlParticles = Math.min(84, Math.max(28, Math.floor((cols * horizonRow) / 80)));
    for (let i = 0; i < numSwirlParticles; i++) {
      // Weight more particles onto the Great Left Swirl (vortex 0) than the smaller right swirl (vortex 1)
      const vIdx = vanGoghVortices.length > 1 ? (i % 3 === 2 ? 1 : 0) : 0;
      const v = vanGoghVortices[vIdx];
      if (!v) break;
      const cRoll = i % 10;
      let color;
      if (cRoll < 2) color = VG_COLORS.iceCream;
      else if (cRoll < 5) color = VG_COLORS.lightCyan;
      else if (cRoll < 8) color = VG_COLORS.cyan;
      else color = VG_COLORS.royalBlue;

      swirlParticles.push({
        vortexIdx: vIdx,
        radFrac: 0.18 + (i / numSwirlParticles) * 0.78,
        angle: (i * 2.39996) % TAU,
        angSpeed: (0.72 + (i % 7) * 0.14) * v.dir,
        color,
        isIceCore: cRoll < 2,
        phase: (i * 0.77) % TAU,
        trailLen: 2,
      });
    }

    // 3. Falling ASCII Snowflakes across sky & ground
    const nSnow = Math.max(48, Math.floor(cols * 0.55));
    for (let i = 0; i < nSnow; i++) {
      const rRoll = rng.random();
      snowFlakes.push({
        x0: rng.uniform(0, cols),
        y0: rng.uniform(0, rows),
        vy: rng.uniform(2.2, 5.2),
        vx: rng.uniform(-0.8, 0.8),
        phase: rng.random() * TAU,
        ch: rRoll < 0.35 ? '+' : rRoll < 0.8 ? '*' : '.',
      });
    }
  }

  // =========================================================================
  // Viewport & Canvas Resize
  // =========================================================================
  function handleResize() {
    const vv = window.visualViewport;
    const w = Math.max(1, Math.floor(vv ? vv.width : window.innerWidth));
    const h = Math.max(1, Math.floor(vv ? vv.height : window.innerHeight));
    viewWidth = w;
    viewHeight = h;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    resizeBloomCanvases();

    if (w < 680 || w < h) {
      const targetCols = w < 440 ? 64 : w < 640 ? 78 : 96;
      cellW = Math.max(5, Math.floor(w / targetCols));
      cellH = clamp(Math.round(cellW / 0.56), 9, 16);
      if (Math.floor(h / cellH) < 52) {
        cellH = Math.max(8, Math.floor(h / 52));
        cellW = Math.max(5, Math.round(cellH * 0.56));
      }
      cols = Math.max(1, Math.floor(w / cellW));
      rows = Math.max(1, Math.floor(h / cellH));
    } else {
      cellH = h < 520 ? clamp(Math.floor(h / 52), 8, 12) : clamp(Math.floor(h / 74), 10, 18);
      cellW = Math.max(h < 520 ? 5 : 6, Math.round(cellH * 0.58));
      cols = Math.max(1, Math.floor(w / cellW));
      rows = Math.max(1, Math.floor(h / cellH));
    }

    const totalCells = cols * rows;
    charBuf = new Array(totalCells);
    colorBuf = new Array(totalCells);
    zBuf = new Float32Array(totalCells);
    glowBuf = new Uint8Array(totalCells);

    buildSkyAndGround();
  }

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    handleResize();
    setTimeout(handleResize, 120);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
  }

  // =========================================================================
  // Buffer Plot Helpers (larger z = closer to camera wins)
  // =========================================================================
  function clearBuffers() {
    const n = cols * rows;
    for (let i = 0; i < n; i++) {
      charBuf[i] = ' ';
      colorBuf[i] = '';
      zBuf[i] = -1e9;
      glowBuf[i] = 0;
    }
  }

  function plotCell(c, r, z, ch, color, glow) {
    if (c < 0 || c >= cols || r < 0 || r >= rows) return;
    const idx = r * cols + c;
    if (z >= zBuf[idx]) {
      zBuf[idx] = z;
      charBuf[idx] = ch;
      colorBuf[idx] = color;
      glowBuf[idx] = glow ? 1 : 0;
    }
  }

  // =========================================================================
  // Van Gogh Multi-Spiral Starry Night Renderer
  // =========================================================================
  function getTreeContrastFactor(c, r, centerCol, treeBaseRow, treeHeightRows, treeHalfWCols, treeGrowth) {
    if (treeGrowth <= 0.02) return 1.0;
    const topRow = treeBaseRow - treeHeightRows - 7;
    if (r < topRow - 4 || r > treeBaseRow + 4) return 1.0;

    const hNorm = clamp((treeBaseRow - r) / Math.max(1, treeHeightRows), 0, 1.22);
    if (hNorm > treeGrowth * 1.18 + 0.08) return 1.0;

    const isNarrow = cols < 95;
    const coneHalfW =
      hNorm > 0.9
        ? isNarrow
          ? 9.0
          : 8.0
        : Math.max(4.0, Math.pow(1.0 - Math.min(hNorm, 1.0), 0.9) * treeHalfWCols) +
          (isNarrow ? 4.5 : 0.8);
    const distFromCenter = Math.abs(c - centerCol);
    const edgeDist = distFromCenter - coneHalfW;

    const insideDim = isNarrow ? 0.16 : 0.22;
    const fadeCols = 7.0;
    if (edgeDist <= 0) return insideDim;
    if (edgeDist < fadeCols) {
      const t = smoothstep(0, fadeCols, edgeDist);
      return insideDim + (1.0 - insideDim) * t;
    }
    return 1.0;
  }

  function pickSkyGradientColor(t) {
    const idx = clamp(Math.round(clamp(t, 0, 1) * (VG_SKY_LUT.length - 1)), 0, VG_SKY_LUT.length - 1);
    return VG_SKY_LUT[idx];
  }

  function pickGoldGradientColor(t) {
    const idx = clamp(Math.round(clamp(t, 0, 1) * (VG_GOLD_LUT.length - 1)), 0, VG_GOLD_LUT.length - 1);
    return VG_GOLD_LUT[idx];
  }

  function pickSmoothBrushChar(crest, flowPhase, isArmCore) {
    const c = clamp(crest, 0, 1);
    if (c < 0.16) return flowPhase > 0.15 ? VG_RAMP[2] : VG_RAMP[1];
    if (c < 0.32) return flowPhase > 0.20 ? VG_RAMP[3] : VG_RAMP[2];
    if (c < 0.50) return flowPhase > -0.10 ? VG_RAMP[4] : VG_RAMP[3];
    if (c < 0.70) return flowPhase > 0.20 ? VG_RAMP[5] : VG_RAMP[4];
    if (c < 0.87) return isArmCore ? VG_RAMP[8] : flowPhase > 0.10 ? VG_RAMP[7] : VG_RAMP[5];
    return isArmCore ? VG_RAMP[6] : flowPhase > 0.30 ? VG_RAMP[6] : VG_RAMP[7];
  }

  function pickSpiralArmColor(frac, palette, bandBias) {
    const f = clamp(frac + bandBias, 0, 1);
    if (palette === 'cyan-blue') {
      if (f < 0.14) return VG_COLORS.iceCream;
      if (f < 0.28) return VG_COLORS.lightCyan;
      const skyT = clamp(1.0 - (f - 0.28) / 0.72, 0.06, 1.0);
      return pickSkyGradientColor(skyT);
    }

    if (palette === 'venus-gold') {
      if (f < 0.34) return pickGoldGradientColor(f / 0.34 * 0.78);
      if (f < 0.46) return VG_COLORS.iceCream;
      return pickSkyGradientColor(clamp(1.0 - (f - 0.46) / 0.54, 0.08, 1.0));
    }

    // 'gold-cyan' / 'cyan-gold'
    if (f < 0.26) return pickGoldGradientColor((f / 0.26) * 0.82);
    if (f < 0.38) return VG_COLORS.iceCream;
    return pickSkyGradientColor(clamp(1.0 - (f - 0.38) / 0.62, 0.06, 1.0));
  }

  function renderVanGoghStarryNight(
    elapsed,
    dt,
    sweepProgress,
    waveTime,
    centerCol,
    treeBaseRow,
    treeHeightRows,
    treeHalfWCols,
    treeGrowth,
    musicSync
  ) {
    if (sweepProgress <= 0.002) return;

    const aspectX = clamp(cellH / Math.max(1, cellW), 1.45, 1.95);
    const maxSweepCol = sweepProgress * (cols + 10);
    const musicPulse = musicSync ? musicSync.pulse : 0.5;
    const isNarrowSky = cols < 85;

    for (let i = 0; i < vanGoghVortices.length; i++) {
      const v = vanGoghVortices[i];
      v.c = v.baseC + Math.round(Math.cos(waveTime * 0.85 + v.phase) * 0.5);
      v.r = clamp(
        v.baseR + Math.round(Math.sin(waveTime * 1.0 + v.phase) * 0.5),
        6,
        Math.max(7, horizonRow - 5)
      );
    }

    const nowSec = performance.now() / 1000;

    // Collect ONLY Blue Wind Vortices + user-clicked interactive vortices for the continuous curl field.
    // Star orbs and Crescent Moon are rendered purely with soft concentric radial halos (never pinwheel arms).
    const fieldSources = [];
    for (let i = 0; i < vanGoghVortices.length; i++) {
      const v = vanGoghVortices[i];
      fieldSources.push({
        c: v.c,
        r: v.r,
        maxR: Math.max(3.5, v.maxR),
        arms: v.arms,
        kRad: (v.twists * v.arms * TAU * 0.70) / Math.max(4, v.maxR),
        dir: v.dir,
        speed: v.speed,
        phase: v.phase,
        weightScale: v.isPrimary ? 1.12 : 0.92,
        isGoldCore: false,
      });
    }
    for (let i = 0; i < interactiveVortices.length; i++) {
      const iv = interactiveVortices[i];
      const age = Math.max(0, nowSec - iv.bornAt);
      const grow = smoothstep(0, 0.55, age);
      if (grow <= 0.05) continue;
      const iRad = Math.max(3.0, iv.radius * grow);
      fieldSources.push({
        c: iv.c,
        r: iv.r,
        maxR: iRad,
        arms: iv.arms || 2,
        kRad: (1.25 * (iv.arms || 2) * TAU) / iRad,
        dir: iv.dir,
        speed: 1.3,
        phase: iv.phase,
        weightScale: grow,
        isGoldCore: true,
      });
    }

    // 1. Continuous Asymmetrical S-Curve Wind Flow + 2-Vortex Curl Field
    const skyMaxR = Math.min(rows - 1, horizonRow + 1);
    const invCols = 1.0 / Math.max(1, cols);
    const invHorizon = 1.0 / Math.max(1, horizonRow);

    for (let r = 1; r <= skyMaxR; r++) {
      const horizonFeather = smoothstep(horizonRow + 1, horizonRow - 6, r);
      if (horizonFeather <= 0.02) continue;

      const ny = r * invHorizon;
      const rowSweepCol =
        maxSweepCol -
        Math.sin(ny * Math.PI * 3.0 + elapsed * 2.6) * 2.2 -
        (1.0 - ny) * 1.8;

      for (let c = 0; c < cols; c++) {
        if (c > rowSweepCol) continue;

        const distToFrontier = rowSweepCol - c;
        const isSweepEdge = sweepProgress < 0.995 && distToFrontier >= 0 && distToFrontier < 2.6;

        const treeContrast = getTreeContrastFactor(
          c,
          r,
          centerCol,
          treeBaseRow,
          treeHeightRows,
          treeHalfWCols,
          treeGrowth
        );

        if (isSweepEdge) {
          const edgeCh = distToFrontier < 1.1 ? '*' : 'o';
          let edgeCol = distToFrontier < 1.1 ? VG_COLORS.brightGold : VG_COLORS.lightCyan;
          const edgeFade = treeContrast * (0.25 + 0.75 * horizonFeather);
          if (edgeFade < 0.99) edgeCol = shadeHexColor(edgeCol, edgeFade);
          plotCell(c, r, -96, edgeCh, edgeCol, treeContrast > 0.75 && horizonFeather > 0.5);
          continue;
        }

        // Find the 2 nearest wind vortex centers
        let best1 = null;
        let best2 = null;
        let dNorm1 = 1e9;
        let dNorm2 = 1e9;
        let dx1 = 0;
        let dy1 = 0;
        let d1 = 0;
        let dx2 = 0;
        let dy2 = 0;
        let d2 = 0;

        for (let i = 0; i < fieldSources.length; i++) {
          const src = fieldSources[i];
          const dx = (c - src.c) / aspectX;
          const dy = r - src.r;
          const dist = Math.hypot(dx, dy);
          const dNorm = dist / src.maxR;
          if (dNorm < dNorm1) {
            best2 = best1;
            dNorm2 = dNorm1;
            dx2 = dx1;
            dy2 = dy1;
            d2 = d1;

            best1 = src;
            dNorm1 = dNorm;
            dx1 = dx;
            dy1 = dy;
            d1 = dist;
          } else if (dNorm < dNorm2) {
            best2 = src;
            dNorm2 = dNorm;
            dx2 = dx;
            dy2 = dy;
            d2 = dist;
          }
        }

        // Asymmetrical S-curve sky stream: sweeps diagonally down from top-left (0.02, 0.24)
        // through primary swirl (0.31, 0.36) to lower-right swirl (0.67, 0.56), never flat horizontal
        const nx = c * invCols;
        const sSlope = (nx - 0.30) * horizonRow * 0.32;
        const sWave1 = Math.sin(nx * Math.PI * 2.5 - waveTime * 0.52) * 5.8;
        const sWave2 = Math.cos(nx * Math.PI * 4.8 - ny * 3.2 + waveTime * 0.42) * 2.4;
        const curlBias =
          (best1 ? Math.sin(Math.atan2(dy1, dx1) * 1.5 + dNorm1 * 2.4) * Math.exp(-dNorm1 * 0.9) * 1.9 : 0);
        const sStreamPhi = (r - sSlope) * 0.58 - c * 0.16 + sWave1 + sWave2 + curlBias;

        // Smooth Gaussian complex-phasor blend of wind vortices + diagonal S-curve stream
        const w1 = best1 ? Math.exp(-dNorm1 * dNorm1 * 0.50) * best1.weightScale : 0;
        const w2 = best2 ? Math.exp(-dNorm2 * dNorm2 * 0.50) * 0.72 * best2.weightScale : 0;
        const wStream = Math.max(0.28, 1.0 - w1 * 0.72 - w2 * 0.24);

        let Zx = wStream * Math.cos(sStreamPhi);
        let Zy = wStream * Math.sin(sStreamPhi);

        if (best1 && w1 > 0.008) {
          const ang1 = Math.atan2(dy1, dx1);
          const phi1 =
            best1.dir * best1.arms * ang1 -
            best1.kRad * d1 +
            best1.arms * (waveTime * best1.speed * 1.35 - best1.phase);
          Zx += w1 * Math.cos(phi1);
          Zy += w1 * Math.sin(phi1);
        }

        if (best2 && w2 > 0.008) {
          const ang2 = Math.atan2(dy2, dx2);
          const phi2 =
            best2.dir * best2.arms * ang2 -
            best2.kRad * d2 +
            best2.arms * (waveTime * best2.speed * 1.35 - best2.phase);
          Zx += w2 * Math.cos(phi2);
          Zy += w2 * Math.sin(phi2);
        }

        const mag = Math.hypot(Zx, Zy);
        const bandWave = Zy / Math.max(0.25, mag);

        // Diagonal brushstroke flow modulation (zero flat horizontal dash alignment)
        const strokeFlow =
          0.79 + 0.21 * Math.cos(c * 0.19 - r * 0.17 - waveTime * 1.05 + sStreamPhi * 0.34);
        const rawBand = (0.5 + 0.5 * bandWave) * strokeFlow;
        const baseThresh = cols < 95 ? 0.35 : 0.26;
        const thresh = baseThresh + (1.0 - horizonFeather) * 0.44;

        if (rawBand < thresh) continue;

        // Softly part background blue stream right inside Moon & Venus bright inner halos
        let orbClear = 1.0;
        if (crescentMoon) {
          const dMoon = Math.hypot((c - crescentMoon.c) / aspectX, r - crescentMoon.r);
          if (dMoon < crescentMoon.coreRadius * 1.55) {
            orbClear *= smoothstep(crescentMoon.coreRadius * 0.7, crescentMoon.coreRadius * 1.55, dMoon);
          }
        }
        for (let k = 0; k < starOrbs.length; k++) {
          const orb = starOrbs[k];
          const clearRad = orb.isVenus ? orb.coreR * 1.85 : orb.coreR * 1.45;
          const dOrb = Math.hypot((c - orb.c) / aspectX, r - orb.r);
          if (dOrb < clearRad) {
            orbClear *= smoothstep(clearRad * 0.4, clearRad, dOrb);
          }
        }
        if (orbClear < 0.18) continue;

        const crest = clamp((rawBand - thresh) / Math.max(0.2, 1.0 - thresh), 0, 1);
        const flowPhase = Math.sin(c * 0.21 - r * 0.18 - waveTime * 0.9 + sStreamPhi * 0.3);

        let ch;
        if (horizonFeather < 0.28) {
          ch = crest > 0.45 ? '·' : '.';
        } else {
          ch = pickSmoothBrushChar(crest, flowPhase, w1 > 0.65 && dNorm1 < 0.38);
        }

        const colorT = clamp(crest * 0.85 + w1 * 0.16, 0, 1);
        let color;
        if (best1 && best1.isGoldCore && dNorm1 < 0.36 && crest > 0.64) {
          color = pickGoldGradientColor(clamp(1.0 - crest, 0, 0.72));
        } else if (w1 > 0.72 && dNorm1 < 0.26 && crest > 0.76) {
          color = VG_COLORS.iceCream;
        } else {
          color = pickSkyGradientColor(colorT);
        }

        let glow = w1 > 0.62 && crest > 0.82 && horizonFeather > 0.5 && musicPulse > 0.45;
        const totalShade = treeContrast * (0.24 + 0.76 * horizonFeather) * orbClear;
        if (totalShade < 0.99) {
          color = shadeHexColor(color, totalShade);
          if (totalShade < 0.72) glow = false;
        }

        plotCell(c, r, -96, ch, color, glow);
      }
    }

    // 1b. Right-Horizon Diagonal Cream-Gold to Turquoise Cloud Band (nx: 0.58 -> 0.99, ny: 0.82 -> 0.52)
    //     Strictly asymmetrical: present ONLY on the right side below the Crescent Moon!
    const bandStartCol = Math.max(0, Math.floor(cols * 0.56));
    const bandMinRow = Math.max(2, Math.floor(horizonRow * 0.40));
    for (let r = bandMinRow; r <= skyMaxR; r++) {
      const horizonFeather = smoothstep(horizonRow + 1, horizonRow - 5, r);
      if (horizonFeather <= 0.04) continue;

      const ny = r * invHorizon;
      const rowSweepCol =
        maxSweepCol -
        Math.sin(ny * Math.PI * 3.0 + elapsed * 2.6) * 2.2 -
        (1.0 - ny) * 1.8;

      for (let c = bandStartCol; c < cols; c++) {
        if (c > rowSweepCol) continue;

        const nx = c * invCols;
        const u = clamp((nx - 0.58) / 0.41, 0, 1);
        const bandNy =
          0.82 - 0.30 * Math.pow(u, 0.88) + Math.sin(u * Math.PI * 2.1 - waveTime * 0.65) * 0.032;
        const bandCenterR = bandNy * horizonRow;
        const halfThick = clamp(horizonRow * (0.075 + 0.045 * Math.sin(u * Math.PI)), 2.0, 5.2);
        const dyNorm = Math.abs(r - bandCenterR) / halfThick;
        if (dyNorm > 1.32) continue;

        const treeContrast = getTreeContrastFactor(
          c,
          r,
          centerCol,
          treeBaseRow,
          treeHeightRows,
          treeHalfWCols,
          treeGrowth
        );
        if (treeContrast < 0.28) continue;

        const edgeFade = smoothstep(0.56, 0.66, nx) * smoothstep(1.32, 0.08, dyNorm);
        const strokeWave = 0.65 + 0.35 * Math.cos(c * 0.24 - r * 0.36 - waveTime * 1.15);
        const intensity = edgeFade * strokeWave;
        if (intensity < 0.16) continue;

        let ch;
        if (dyNorm < 0.34 && intensity > 0.62) ch = strokeWave > 0.78 ? 'o' : '≈';
        else if (dyNorm < 0.68 && intensity > 0.38) ch = '~';
        else if (intensity > 0.25) ch = ':';
        else ch = '·';

        let col;
        if (dyNorm < 0.28 && u > 0.18) col = VG_COLORS.cream;
        else if (dyNorm < 0.48) col = intensity > 0.58 ? VG_COLORS.paleGold : VG_COLORS.iceCream;
        else if (dyNorm < 0.82) col = VG_COLORS.lightCyan;
        else col = VG_COLORS.cyan;

        const shade = treeContrast * (0.28 + 0.72 * horizonFeather);
        if (shade < 0.99) col = shadeHexColor(col, shade);
        const glow = dyNorm < 0.36 && intensity > 0.65 && shade > 0.72;
        plotCell(c, r, -95.1, ch, col, glow);
      }
    }

    // 2. Feathered Multi-Width Parametric Spirals (ONLY the 2 Blue Wind Vortices)
    for (let i = 0; i < vanGoghVortices.length; i++) {
      const v = vanGoghVortices[i];
      if (v.c > maxSweepCol + 3) continue;

      const sc = v.c;
      const sr = v.r;
      const reveal = clamp((maxSweepCol - (sc - v.maxR)) / (v.maxR * 1.4), 0, 1);
      const curMaxR = v.maxR * reveal;
      if (curMaxR < 1.2) continue;

      const pulse = 0.5 + 0.5 * Math.sin(waveTime * 3.2 + v.phase) + musicPulse * 0.25;
      const numArms = v.arms;
      const stepsPerArm = Math.max(40, Math.round(curMaxR * 20));
      const ribbonOffsets = curMaxR >= 10 ? [-1.55, -0.78, 0.78, 1.55] : [-0.78, 0.78];

      for (let arm = 0; arm < numArms; arm++) {
        const armBaseAngle = (arm / numArms) * TAU - waveTime * v.speed * 1.35 * v.dir + v.phase;

        for (let s = 1; s <= stepsPerArm; s++) {
          const frac = s / stepsPerArm;
          const rad = frac * curMaxR;
          const theta = armBaseAngle + v.dir * Math.pow(frac, 0.86) * v.twists * TAU;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          const fx = sc + cosT * rad * aspectX;
          const fy = sr + sinT * rad;

          const hc = Math.round(fx);
          const hr = Math.round(fy);
          if (hr < 1 || hr > skyMaxR || hc < 0 || hc >= cols || hc > maxSweepCol + 1) continue;

          const horizonFeather = smoothstep(horizonRow + 1, horizonRow - 6, hr);
          if (horizonFeather <= 0.08) continue;

          const tc = getTreeContrastFactor(
            hc,
            hr,
            centerCol,
            treeBaseRow,
            treeHeightRows,
            treeHalfWCols,
            treeGrowth
          );
          if (tc < 0.28) continue;

          const strokeWave = Math.sin(s * 0.22 + arm * 1.7 - waveTime * 1.8);
          let coreCh;
          if (frac < 0.14) coreCh = s % 2 === 0 ? '°' : 'o';
          else if (frac < 0.34) coreCh = strokeWave > 0.1 ? 'o' : '°';
          else if (frac < 0.72) coreCh = strokeWave > 0.2 ? '≈' : '~';
          else if (frac < 0.90) coreCh = strokeWave > 0 ? '~' : '·';
          else coreCh = '·';

          let coreCol = pickSpiralArmColor(frac, v.palette, 0);
          const coreShade = tc * (0.3 + 0.7 * horizonFeather);
          if (coreShade < 0.99) coreCol = shadeHexColor(coreCol, coreShade);
          const isGlow = frac < 0.28 && pulse > 0.55 && tc > 0.75 && horizonFeather > 0.52;
          plotCell(hc, hr, -93.6 + (1.0 - frac) * 0.8, coreCh, coreCol, isGlow);

          // Feathered outer cobalt/prussian halo sidebands for thick painterly brushstrokes
          if (frac > 0.1 && frac < 0.94) {
            for (let ro = 0; ro < ribbonOffsets.length; ro++) {
              const off = ribbonOffsets[ro];
              const absOff = Math.abs(off);
              const oc = Math.round(fx + cosT * off * aspectX);
              const or = Math.round(fy + sinT * off);
              if (oc === hc && or === hr) continue;
              if (or < 1 || or > skyMaxR || oc < 0 || oc >= cols || oc > maxSweepCol + 1) continue;

              const oFeather = smoothstep(horizonRow + 1, horizonRow - 6, or);
              if (oFeather <= 0.08) continue;
              const oTc = getTreeContrastFactor(
                oc,
                or,
                centerCol,
                treeBaseRow,
                treeHeightRows,
                treeHalfWCols,
                treeGrowth
              );
              if (oTc < 0.28) continue;

              const edgeBias = absOff > 1.2 ? 0.36 : 0.2;
              let edgeCol = pickSpiralArmColor(frac, v.palette, edgeBias);
              const edgeShade = oTc * (0.26 + 0.74 * oFeather) * (absOff > 1.2 ? 0.72 : 0.9);
              if (edgeShade < 0.99) edgeCol = shadeHexColor(edgeCol, edgeShade);

              const edgeCh = absOff > 1.2 ? ((s + ro) % 2 === 0 ? '·' : '.') : frac < 0.58 ? '~' : '·';
              const edgeZ = (absOff > 1.2 ? -95.2 : -94.6) + (1.0 - frac) * 0.5;
              plotCell(oc, or, edgeZ, edgeCh, edgeCol, false);
            }
          }
        }
      }

      // Pure ice-cream/cyan center of blue wind vortex (never yellow star core)
      if (sc <= maxSweepCol) {
        const coreFeather = smoothstep(horizonRow + 1, horizonRow - 6, sr);
        const coreTc = getTreeContrastFactor(
          sc,
          sr,
          centerCol,
          treeBaseRow,
          treeHeightRows,
          treeHalfWCols,
          treeGrowth
        );
        if (coreFeather > 0.25 && coreTc > 0.3) {
          let coreCol = VG_COLORS.iceCream;
          const coreShade = coreTc * coreFeather;
          if (coreShade < 0.99) coreCol = shadeHexColor(coreCol, coreShade);
          plotCell(sc, sr, -92.6, '°', coreCol, coreShade > 0.7);
        }
      }
    }

    // 2b. Sweeping Upper-Left Cobalt-Turquoise Inflow Wave (nx 0.02, ny 0.24 -> Primary Swirl)
    //     + Trailing S-Curve Wave connecting Primary Swirl -> Secondary Lower-Right Swirl
    if (vanGoghVortices.length >= 2) {
      const pSwirl = vanGoghVortices[0];
      const sSwirl = vanGoghVortices[1];
      const inflowStartC = Math.round(cols * 0.02);
      const inflowStartR = Math.round(horizonRow * (isNarrowSky ? 0.22 : 0.24));
      const inflowCtrlC = Math.round(cols * (isNarrowSky ? 0.14 : 0.16));
      const inflowCtrlR = Math.round(horizonRow * (isNarrowSky ? 0.19 : 0.20));
      const inflowEndC = pSwirl.c - Math.round(pSwirl.maxR * aspectX * 0.22);
      const inflowEndR = pSwirl.r - Math.round(pSwirl.maxR * 0.36);

      const ribbonSpecs = [
        {
          p0c: inflowStartC,
          p0r: inflowStartR,
          p1c: inflowCtrlC,
          p1r: inflowCtrlR,
          p2c: inflowEndC,
          p2r: inflowEndR,
          offsets: [-1.4, 0, 1.4],
          steps: 44,
        },
        {
          p0c: pSwirl.c + Math.round(pSwirl.maxR * aspectX * 0.30),
          p0r: pSwirl.r + Math.round(pSwirl.maxR * 0.38),
          p1c: Math.round((pSwirl.c + sSwirl.c) * 0.5),
          p1r: Math.round(pSwirl.r * 0.45 + sSwirl.r * 0.55 - horizonRow * 0.05),
          p2c: sSwirl.c - Math.round(sSwirl.maxR * aspectX * 0.32),
          p2r: sSwirl.r - Math.round(sSwirl.maxR * 0.24),
          offsets: [-1.1, 0.35],
          steps: 40,
        },
      ];

      for (let rb = 0; rb < ribbonSpecs.length; rb++) {
        const spec = ribbonSpecs[rb];
        for (let s = 0; s <= spec.steps; s++) {
          const t = s / spec.steps;
          const omt = 1.0 - t;
          const waveDrift = Math.sin(t * Math.PI * 2.5 - waveTime * 1.1 + rb) * 0.9;
          const bc = omt * omt * spec.p0c + 2 * omt * t * spec.p1c + t * t * spec.p2c;
          const br = omt * omt * spec.p0r + 2 * omt * t * spec.p1r + t * t * spec.p2r + waveDrift;

          for (let oi = 0; oi < spec.offsets.length; oi++) {
            const off = spec.offsets[oi];
            const hc = Math.round(bc);
            const hr = Math.round(br + off);
            if (hr < 1 || hr > skyMaxR || hc < 0 || hc >= cols || hc > maxSweepCol) continue;

            const feather = smoothstep(horizonRow + 1, horizonRow - 6, hr);
            if (feather <= 0.08) continue;
            const tc = getTreeContrastFactor(
              hc,
              hr,
              centerCol,
              treeBaseRow,
              treeHeightRows,
              treeHalfWCols,
              treeGrowth
            );
            if (tc < 0.30) continue;

            const isCenterRibbon = Math.abs(off) < 0.5;
            const ch = isCenterRibbon ? ((s % 4 === 0) ? '≈' : '~') : ((s % 2 === 0) ? '·' : ':');
            let col = isCenterRibbon
              ? t > 0.65
                ? VG_COLORS.iceCream
                : VG_COLORS.lightCyan
              : VG_COLORS.cobalt;
            const shade = tc * (0.28 + 0.72 * feather) * (isCenterRibbon ? 0.96 : 0.78);
            if (shade < 0.99) col = shadeHexColor(col, shade);
            plotCell(hc, hr, isCenterRibbon ? -94.3 : -94.9, ch, col, false);
          }
        }
      }
    }

    // 3. Light Orbiting Wind Sparks (strictly blue/cyan/ice-cream on the 2 wind vortices)
    for (let i = 0; i < swirlParticles.length; i++) {
      const p = swirlParticles[i];
      const v = vanGoghVortices[p.vortexIdx];
      if (!v) continue;

      p.angle += p.angSpeed * dt * (1.0 + musicPulse * 0.35);
      const curFrac = 0.16 + ((p.radFrac + Math.sin(waveTime * 0.8 + p.phase) * 0.15 + 1.0) % 0.82);
      const rad = curFrac * v.maxR;
      const spiralTheta = p.angle + v.dir * curFrac * v.twists * Math.PI * 1.4;

      for (let t = 0; t < p.trailLen; t++) {
        const tAngle = spiralTheta - v.dir * t * 0.13;
        const tRad = rad * (1.0 - t * 0.04);
        const tc = v.c + Math.round(Math.cos(tAngle) * tRad * aspectX);
        const tr = v.r + Math.round(Math.sin(tAngle) * tRad);

        if (tr < 2 || tr > skyMaxR || tc < 0 || tc >= cols || tc > maxSweepCol) continue;

        const horizonFeather = smoothstep(horizonRow + 1, horizonRow - 6, tr);
        if (horizonFeather <= 0.12) continue;

        const treeContrast = getTreeContrastFactor(
          tc,
          tr,
          centerCol,
          treeBaseRow,
          treeHeightRows,
          treeHalfWCols,
          treeGrowth
        );
        if (treeContrast < 0.42) continue;

        const ch = t === 0 ? (p.isIceCore && curFrac < 0.32 ? '°' : '~') : '·';
        let col = t === 0 ? p.color : VG_COLORS.cyan;
        const shade = treeContrast * (0.28 + 0.72 * horizonFeather);
        if (shade < 0.99) col = shadeHexColor(col, shade);

        plotCell(tc, tr, -94.4, ch, col, p.isIceCore && t === 0 && curFrac < 0.26 && shade > 0.78);
      }
    }

    // 4. Luminous Star Orbs (Large Bottom-Left Venus + 4 Asymmetrical Stars)
    //    Rendered with soft concentric radial halos & twinkling cores — ZERO spiral pinwheels!
    for (let i = 0; i < starOrbs.length; i++) {
      const orb = starOrbs[i];
      if (orb.c > maxSweepCol + 3) continue;

      const orbReveal = clamp((maxSweepCol - (orb.c - orb.haloR)) / (orb.haloR * 1.5), 0, 1);
      if (orbReveal <= 0.05) continue;

      const oc = orb.c;
      const or = orb.r;
      const maxHaloR = orb.haloR * orbReveal;
      const coreR = orb.coreR * orbReveal;
      const pulse = 0.5 + 0.5 * Math.sin(waveTime * orb.speed * 2.4 + orb.phase) + musicPulse * 0.22;

      const rLim = Math.ceil(maxHaloR);
      const cLim = Math.ceil(maxHaloR * aspectX);
      for (let dr = -rLim; dr <= rLim; dr++) {
        const hr = or + dr;
        if (hr < 1 || hr > skyMaxR) continue;
        const horizonFeather = smoothstep(horizonRow + 1, horizonRow - 6, hr);
        if (horizonFeather <= 0.08) continue;

        for (let dc = -cLim; dc <= cLim; dc++) {
          const hc = oc + dc;
          if (hc < 0 || hc >= cols || hc > maxSweepCol + 1) continue;

          const tc = getTreeContrastFactor(
            hc,
            hr,
            centerCol,
            treeBaseRow,
            treeHeightRows,
            treeHalfWCols,
            treeGrowth
          );
          if (tc < 0.30) continue;

          const dist = Math.hypot(dc / aspectX, dr);
          if (dist > maxHaloR) continue;

          const hFrac = clamp(dist / Math.max(0.5, maxHaloR), 0, 1);
          const ringWave = Math.sin(
            dist * (orb.isVenus ? 2.15 : 2.55) - waveTime * 1.45 + orb.phase
          );

          if (dist <= coreR) {
            const coreFrac = clamp(dist / Math.max(0.4, coreR), 0, 1);
            const ch = coreFrac < 0.45 ? '*' : orb.isVenus ? 'o' : '°';
            let col = pickGoldGradientColor(coreFrac * (orb.isVenus ? 0.35 : 0.55));
            const shade = tc * horizonFeather;
            if (shade < 0.99) col = shadeHexColor(col, shade);
            plotCell(hc, hr, -92.3, ch, col, shade > 0.55);
            continue;
          }

          if (orb.isVenus) {
            if (ringWave < -0.32 && hFrac > 0.34) continue;
            let hCh;
            let hCol;
            if (hFrac < 0.36) {
              hCh = ringWave > 0.25 ? 'o' : '°';
              hCol = VG_COLORS.warmWhite;
            } else if (hFrac < 0.58) {
              hCh = ringWave > 0.2 ? '°' : ':';
              hCol = ringWave > 0 ? VG_COLORS.brightGold : VG_COLORS.gold;
            } else if (hFrac < 0.80) {
              hCh = ringWave > 0.15 ? '·' : ':';
              hCol = VG_COLORS.iceCream;
            } else {
              hCh = ringWave > 0.25 ? '·' : '.';
              hCol = VG_COLORS.lightCyan;
            }
            const shade = tc * horizonFeather * (1.0 - hFrac * 0.42);
            if (shade < 0.99) hCol = shadeHexColor(hCol, shade);
            plotCell(hc, hr, -93.1 + (1.0 - hFrac) * 0.5, hCh, hCol, hFrac < 0.45 && pulse > 0.48 && shade > 0.65);
          } else {
            if (ringWave < -0.18) continue;
            let hCh;
            let hCol;
            if (hFrac < 0.48) {
              hCh = ringWave > 0.28 ? '°' : '·';
              hCol = VG_COLORS.brightGold;
            } else if (hFrac < 0.78) {
              hCh = ringWave > 0.22 ? '·' : '.';
              hCol = VG_COLORS.gold;
            } else {
              hCh = '.';
              hCol = VG_COLORS.lightCyan;
            }
            const shade = tc * horizonFeather * (1.0 - hFrac * 0.48);
            if (shade < 0.99) hCol = shadeHexColor(hCol, shade);
            plotCell(hc, hr, -93.3 + (1.0 - hFrac) * 0.4, hCh, hCol, hFrac < 0.42 && pulse > 0.62 && shade > 0.68);
          }
        }
      }

      // Soft twinkling radial halo particles around Venus & stars (no spiral twist)
      const nSparks = orb.isVenus ? 10 : 4;
      for (let sp = 0; sp < nSparks; sp++) {
        const sparkAng = (sp / nSparks) * TAU + orb.phase + Math.sin(waveTime * 0.7 + sp) * 0.18;
        const sparkFrac = 0.45 + 0.48 * (0.5 + 0.5 * Math.sin(waveTime * 1.9 + sp * 1.7 + orb.phase));
        const sparkDist = sparkFrac * maxHaloR;
        const sc = oc + Math.round(Math.cos(sparkAng) * sparkDist * aspectX);
        const sr = or + Math.round(Math.sin(sparkAng) * sparkDist);
        if (sr < 1 || sr > skyMaxR || sc < 0 || sc >= cols || sc > maxSweepCol) continue;

        const feather = smoothstep(horizonRow + 1, horizonRow - 6, sr);
        const tc = getTreeContrastFactor(
          sc,
          sr,
          centerCol,
          treeBaseRow,
          treeHeightRows,
          treeHalfWCols,
          treeGrowth
        );
        if (feather < 0.15 || tc < 0.35) continue;

        const tw = 0.5 + 0.5 * Math.sin(waveTime * 3.8 + sp * 2.1 + orb.phase);
        if (tw < 0.45) continue;
        const sCh = tw > 0.82 ? '*' : sparkFrac < 0.68 ? 'o' : '·';
        let sCol = sparkFrac < 0.70 ? VG_COLORS.brightGold : VG_COLORS.iceCream;
        const shade = tc * feather;
        if (shade < 0.99) sCol = shadeHexColor(sCol, shade);
        plotCell(sc, sr, -92.7, sCh, sCol, tw > 0.78 && shade > 0.68);
      }
    }

    // 5. Giant Golden-Orange Crescent Moon & Asymmetrical Radial Golden Halo (top-right nx: 0.88, ny: 0.22)
    //    Uses soft concentric + asymmetrical radial halo rings & stipple (NO spiral pinwheel arms!)
    if (crescentMoon && maxSweepCol >= crescentMoon.c - 12) {
      const mc = crescentMoon.c;
      const mr = crescentMoon.r + Math.round(Math.sin(crescentMoon.nx * 6.5 - waveTime * 1.4) * 0.35);
      const moonR = crescentMoon.coreRadius;
      const moonReveal = clamp((maxSweepCol - (mc - 12)) / 16, 0, 1);
      const maxHaloR = crescentMoon.haloRadius * moonReveal;

      // 5a. Asymmetrical multi-layer radial glowing halo (cream -> gold -> amber -> orangeGold -> lightCyan)
      if (maxHaloR > moonR * 1.05) {
        const rLim = Math.ceil(maxHaloR * 1.2);
        const cLim = Math.ceil(maxHaloR * 1.2 * aspectX);
        for (let dr = -rLim; dr <= rLim; dr++) {
          const hr = mr + dr;
          if (hr < 1 || hr > skyMaxR) continue;
          const horizonFeather = smoothstep(horizonRow + 1, horizonRow - 6, hr);
          if (horizonFeather <= 0.08) continue;

          for (let dc = -cLim; dc <= cLim; dc++) {
            const hc = mc + dc;
            if (hc < 0 || hc >= cols || hc > maxSweepCol + 1) continue;
            const nx = dc / aspectX;
            const ny = dr;
            const dist = Math.hypot(nx, ny);
            const ang = Math.atan2(ny, nx);
            // Gentle asymmetrical stretch leaning down-left toward the diagonal horizon cloud
            const asymStretch = 1.0 + 0.18 * Math.cos(ang - 2.35);
            const effMaxR = maxHaloR * asymStretch;
            if (dist <= moonR * 0.92 || dist > effMaxR) continue;

            const radialRipple = Math.sin(
              dist * 1.65 - waveTime * 1.35 + Math.cos(ang + 0.5) * 0.45
            );
            if (radialRipple < -0.34) continue;

            const hFrac = clamp((dist - moonR) / Math.max(0.5, effMaxR - moonR), 0, 1);
            let hCh;
            let hCol;
            if (hFrac < 0.22) {
              hCh = radialRipple > 0.32 ? '°' : 'o';
              hCol = VG_COLORS.warmWhite;
            } else if (hFrac < 0.44) {
              hCh = radialRipple > 0.22 ? 'o' : ':';
              hCol = VG_COLORS.brightGold;
            } else if (hFrac < 0.66) {
              hCh = radialRipple > 0.18 ? '·' : ':';
              hCol = hFrac < 0.54 ? VG_COLORS.gold : VG_COLORS.amber;
            } else if (hFrac < 0.84) {
              hCh = radialRipple > 0.15 ? '·' : '.';
              hCol = Math.cos(ang - 2.35) > 0.1 ? VG_COLORS.orangeGold : VG_COLORS.lightCyan;
            } else {
              hCh = '.';
              hCol = VG_COLORS.royalBlue;
            }

            const shade = horizonFeather * (1.0 - hFrac * 0.38);
            if (shade < 0.99) hCol = shadeHexColor(hCol, shade);
            plotCell(hc, hr, -94.2 + (1.0 - hFrac) * 0.5, hCh, hCol, hFrac < 0.45 && horizonFeather > 0.5);
          }
        }
      }

      // 5b. Asymmetrical golden halo spark particles around the moon (radial, no spiral pinwheel)
      const moonSparks = 22;
      for (let sp = 0; sp < moonSparks; sp++) {
        const ang = (sp * 2.39996 + waveTime * 0.08) % TAU;
        const asymReach = 1.0 + 0.18 * Math.cos(ang - 2.35);
        const radFrac = 0.15 + 0.78 * ((sp / moonSparks + 0.5 + 0.12 * Math.sin(waveTime * 1.4 + sp)) % 1.0);
        const rad = moonR * 1.04 + radFrac * Math.max(0, maxHaloR * asymReach - moonR * 0.95);
        const hc = mc + Math.round(Math.cos(ang) * rad * aspectX);
        const hr = mr + Math.round(Math.sin(ang) * rad);
        if (hr < 1 || hr > skyMaxR || hc < 0 || hc >= cols || hc > maxSweepCol + 1) continue;

        const horizonFeather = smoothstep(horizonRow + 1, horizonRow - 6, hr);
        if (horizonFeather <= 0.1) continue;

        const tw = 0.5 + 0.5 * Math.sin(waveTime * 2.9 + sp * 1.3);
        if (tw < 0.35) continue;

        const ch = radFrac < 0.32 ? (tw > 0.75 ? '*' : 'o') : radFrac < 0.65 ? '°' : '·';
        let col =
          radFrac < 0.58
            ? pickGoldGradientColor(radFrac / 0.58)
            : pickSkyGradientColor(clamp(1.0 - (radFrac - 0.58) / 0.42, 0.35, 0.95));
        if (horizonFeather < 0.99) col = shadeHexColor(col, horizonFeather);
        plotCell(hc, hr, -93.4, ch, col, radFrac < 0.48 && horizonFeather > 0.55);
      }

      // 5c. Crisp luminous Golden-Orange Crescent Moon body
      if (maxSweepCol >= mc - 4) {
        const crLim = Math.ceil(moonR + 1);
        const ccLim = Math.ceil((moonR + 1) * aspectX);
        const moonInnerRatio = moonR / 3.6;
        for (let dr = -crLim; dr <= crLim; dr++) {
          for (let dc = -ccLim; dc <= ccLim; dc++) {
            const nx = dc / aspectX;
            const ny = dr;
            const dOuter = Math.hypot(nx, ny);
            // Cutout shifted upper-right so bright golden belly curves generously on lower-left
            const dInner = Math.hypot(nx - 1.08 * moonInnerRatio, ny + 0.34 * moonInnerRatio);
            if (dOuter <= moonR && dInner > moonR * 0.60) {
              const rimFrac = clamp(dOuter / Math.max(0.5, moonR), 0, 1);
              const ch = rimFrac < 0.55 ? 'o' : rimFrac < 0.84 ? '*' : '°';
              const col = pickGoldGradientColor(0.25 + rimFrac * 0.75);
              plotCell(mc + dc, mr + dr, -92.4, ch, col, true);
            }
          }
        }
      }
    }

    // 5. Interactive Click-Spawned Continuous Feathered Star Spirals
    for (let i = 0; i < interactiveVortices.length; i++) {
      const iv = interactiveVortices[i];
      const age = Math.max(0, nowSec - iv.bornAt);
      const grow = smoothstep(0, 0.55, age);
      const maxR = iv.radius * grow;
      if (maxR < 0.8) continue;

      const numArms = iv.arms || 2;
      const pointsPerArm = Math.max(36, Math.round(maxR * 20));
      for (let arm = 0; arm < numArms; arm++) {
        const baseAngle = (arm / numArms) * TAU - waveTime * 1.8 * iv.dir + iv.phase;
        for (let p = 1; p <= pointsPerArm; p++) {
          const frac = p / pointsPerArm;
          const rad = frac * maxR;
          const theta = baseAngle + frac * TAU * 1.25 * iv.dir;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          const fx = iv.c + cosT * rad * aspectX;
          const fy = iv.r + sinT * rad;
          const vc = Math.round(fx);
          const vr = Math.round(fy);
          if (vr < 1 || vr > skyMaxR || vc < 0 || vc >= cols) continue;

          const horizonFeather = smoothstep(horizonRow + 1, horizonRow - 6, vr);
          if (horizonFeather <= 0.08) continue;

          const ch = frac < 0.22 ? '*' : frac < 0.48 ? 'o' : frac < 0.82 ? '~' : '·';
          let col =
            frac < 0.34
              ? pickGoldGradientColor((frac / 0.34) * 0.82)
              : pickSkyGradientColor(clamp(1.0 - (frac - 0.34) / 0.66, 0.15, 0.95));
          if (horizonFeather < 0.99) col = shadeHexColor(col, horizonFeather);
          plotCell(vc, vr, -93, ch, col, frac < 0.35 && horizonFeather > 0.5);

          // Feathered halo flanking cell
          if (frac > 0.16 && frac < 0.88) {
            const oc = Math.round(fx + cosT * 0.78 * aspectX);
            const or = Math.round(fy + sinT * 0.78);
            if ((oc !== vc || or !== vr) && or >= 1 && or <= skyMaxR && oc >= 0 && oc < cols) {
              const oFeather = smoothstep(horizonRow + 1, horizonRow - 6, or);
              if (oFeather > 0.08) {
                let oCol = pickSkyGradientColor(clamp(0.72 - frac * 0.5, 0.08, 0.75));
                if (oFeather < 0.99) oCol = shadeHexColor(oCol, oFeather);
                plotCell(oc, or, -93.8, '·', oCol, false);
              }
            }
          }
        }
      }

      const ivFeather = smoothstep(horizonRow + 1, horizonRow - 6, iv.r);
      if (ivFeather > 0.2) {
        const pulseChar = Math.sin(waveTime * 5.0 + iv.phase) > 0 ? '*' : 'o';
        plotCell(iv.c, iv.r, -92, pulseChar, shadeHexColor(VG_COLORS.warmWhite, ivFeather), ivFeather > 0.6);
      }
    }
  }

  // =========================================================================
  // Inverse Perspective 3D Ground Plane Renderer (seamless full-viewport fill)
  // =========================================================================
  function renderPerspectiveGround(gRot, aspect, halfCols, centerY, scalePix, minFade, maxFade, tintR, tintG, tintB) {
    const gCa = Math.cos(gRot);
    const gSa = Math.sin(gRot);
    const groundY = GROUND - 0.12;
    const invFocal = 1.0 / (2.65 * Math.max(1, scalePix));
    const gridStep = 0.24;
    const invGrid = 1.0 / gridStep;

    for (let r = horizonRow; r < rows; r++) {
      const sy = r + 0.5;
      const kY = (centerY - sy) * invFocal;
      const denom = SIN_PITCH + kY * COS_PITCH;
      // Below the geometric horizon, y = -1.24 < 0 implies denom < 0
      if (denom >= -0.015) continue;

      const z = (groundY * (COS_PITCH - kY * SIN_PITCH) - kY * 4.85) / denom;
      if (z >= 18.0) continue;

      const zp = groundY * SIN_PITCH + z * COS_PITCH + 4.85;
      if (zp <= 0.5) continue;

      const horizonDist = r - horizonRow;
      const horizonFade = smoothstep(0, 5, horizonDist);
      const baseDepth = clamp(1.3 - zp / 9.5, 0.06, 1.0);
      const depthFade = minFade + (maxFade - minFade) * baseDepth * horizonFade;

      const rowScaleZ = zp / (2.65 * Math.max(1, scalePix));
      const zPlot = -90 - zp * 0.01;
      const ch = depthFade > 0.36 ? '-' : '.';
      const col = rgbFloatToHex(tintR * depthFade, tintG * depthFade, tintB * depthFade);

      for (let c = 0; c < cols; c++) {
        const sx = c + 0.5;
        const x = (sx - halfCols) * aspect * rowScaleZ;

        // Inverse rotate (x, z) by -gRot into world ground coordinates
        const wx = x * gCa + z * gSa;
        const wz = -x * gSa + z * gCa;

        const ix = Math.floor(wx * invGrid);
        const iz = Math.floor(wz * invGrid);

        const jx = 0.22 + hash2D(ix, iz) * 0.56;
        const jz = 0.22 + hash2D(ix + 1013, iz - 2029) * 0.56;
        const ptWx = (ix + jx) * gridStep;
        const ptWz = (iz + jz) * gridStep;

        // Forward-project world cell anchor so each world point lands on exactly one screen cell
        const rx = ptWx * gCa - ptWz * gSa;
        const rz = ptWx * gSa + ptWz * gCa;
        const rzp = groundY * SIN_PITCH + rz * COS_PITCH + 4.85;
        if (rzp <= 0.5) continue;
        const ryp = groundY * COS_PITCH - rz * SIN_PITCH;
        const rScale = 2.65 / rzp;
        const psx = halfCols + (rx * rScale * scalePix) / aspect;
        const psy = centerY - ryp * rScale * scalePix;

        if (Math.floor(psx) !== c || Math.floor(psy) !== r) continue;

        if (horizonDist < 4) {
          const dither = hash2D(c * 31 + r * 17, iz);
          if (dither > 0.24 + horizonDist * 0.19) continue;
        }

        plotCell(c, r, zPlot, ch, col, false);
      }
    }
  }

  // =========================================================================
  // Topper Star (adapted from christmas_tree.py star())
  // =========================================================================
  function renderTopperStar(cx, cy, starZp, size, t, power, aspect, flash, isLit) {
    const tintR = GOLD[0] + (1.0 - GOLD[0]) * flash;
    const tintG = GOLD[1] + (1.0 - GOLD[1]) * flash;
    const tintB = GOLD[2] + (1.0 - GOLD[2]) * flash;
    const pwr = power * (1.0 + 1.6 * flash);
    const rayChars = '-|/\\';

    // 1. Thin rays first (slightly behind star polygon, above sky/snow)
    for (let k = 0; k < 8; k++) {
      const ang = (k * TAU) / 8.0 + 0.1 * Math.sin(t * 0.7);
      if (Math.sin(ang) < -0.2) continue; // no rays down into the tree
      const horiz = Math.abs(Math.sin(ang)) < 0.25 ? 0.55 : 1.0;
      const reach =
        size *
        (2.6 + 0.6 * Math.sin(t * 3.0 + k * 1.3)) *
        (k % 2 === 0 ? 1.0 : 0.75) *
        horiz *
        (1.0 + 1.6 * flash);
      const deg = (((ang * 180) / Math.PI) % 180 + 180) % 180;
      const ch = rayChars[Math.round(deg / 45.0) % 4];

      for (let s = size * 1.15; s < reach; s += 0.5) {
        const y = Math.round(cy - Math.sin(ang) * s);
        const x = Math.round(cx + (Math.cos(ang) * s) / aspect);
        if (y < 0 || y >= rows || x < 0 || x >= cols) continue;

        const fade = Math.max(0.0, 1.0 - s / reach) * horiz;
        const lum = pwr * 0.65 * fade;
        if (lum <= 0.05) continue;

        const rayCol = rgbFloatToHex(tintR * lum, tintG * lum, tintB * lum);
        plotCell(x, y, -(starZp + 0.8), ch, rayCol, isLit && fade > 0.45);
      }
    }

    // 2. Filled 5-pointed star polygon
    const verts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI * 0.5 + (i * TAU) / 10.0;
      const r = i % 2 === 0 ? size : size * 0.42;
      verts.push([cx + (Math.cos(a) * r) / aspect, cy + Math.sin(a) * r]);
    }

    const y0 = Math.max(0, Math.floor(cy - size - 1));
    const y1 = Math.min(rows, Math.ceil(cy + size + 2));
    const x0 = Math.max(0, Math.floor(cx - size / aspect - 1));
    const x1 = Math.min(cols, Math.ceil(cx + size / aspect + 2));
    if (y1 <= y0 || x1 <= x0) return;

    const polyLum = Math.min(1.35, pwr);
    const bodyCol = rgbFloatToHex(tintR * polyLum, tintG * polyLum, tintB * polyLum);
    const invSize = 1.0 / Math.max(size, 0.5);

    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        if (!pointInPoly(xx, yy, verts)) continue;
        const dist = Math.hypot((xx - cx) * aspect, yy - cy) * invSize;
        const ch = dist < 0.52 ? '@' : '#';
        plotCell(xx, yy, -(starZp - 0.5), ch, bodyCol, isLit);
      }
    }

    // 3. Crisp outer tips
    for (let i = 0; i < verts.length; i += 2) {
      const ix = Math.round(verts[i][0]);
      const iy = Math.round(verts[i][1]);
      if (iy >= 0 && iy < rows && ix >= 0 && ix < cols) {
        plotCell(ix, iy, -(starZp - 0.6), '*', bodyCol, isLit);
      }
    }
  }

  // =========================================================================
  // 1-Line Scrolling Marquee Signboard ("GIÁNG SINH AN LÀNH" - 3 Languages)
  // =========================================================================
  const MARQUEE_SEGMENTS = [
    { text: '★  G I Á N G   S I N H   A N   L À N H  ★', color: '#ffe066', glow: '#ffb703' },
    { text: '     •     ', color: '#90e0ef', glow: '#48cae4' },
    { text: '*  M E R R Y   C H R I S T M A S  *', color: '#fff9db', glow: '#ffd166' },
    { text: '     •     ', color: '#90e0ef', glow: '#48cae4' },
    { text: '❄  メ リ ー ク リ ス マ ス  ・  穏 や か な ク リ ス マ ス を  ❄', color: '#90e0ef', glow: '#48cae4' },
    { text: '     •     ', color: '#90e0ef', glow: '#48cae4' },
    { text: '♫  Merry Christmas, Mr. Ryuichi Sakamoto  ♫', color: '#ffd166', glow: '#ffb703' },
    { text: '     •     ', color: '#90e0ef', glow: '#48cae4' },
  ];

  // Expanded signboard rows (topR = 1 .. botR = 4) -> 2 full clear interior rows (2 & 3)
  function getMarqueeSignboardBounds(centerCol) {
    const halfWidthCols = Math.min(42, Math.max(16, Math.floor(cols * 0.44)));
    const minC = Math.max(2, centerCol - halfWidthCols);
    const maxC = Math.min(cols - 3, centerCol + halfWidthCols);
    const topR = 1;
    const botR = 4;
    return { minC, maxC, topR, botR };
  }

  // Clean wipe of the marquee signboard + delicate twinkling LED border on topR=1 & botR=4
  function prepareMarqueeSignboardGrid(centerCol, progress, elapsed, musicSync) {
    if (progress <= 0.01) return;

    const { minC, maxC, topR, botR } = getMarqueeSignboardBounds(centerCol);
    const musicBeat = musicSync ? musicSync.pulse : 0.5;

    // 1. Wipe 100% of sky/star/snow/ray characters inside and 1-cell buffer around the signboard
    for (let rr = Math.max(0, topR - 1); rr <= Math.min(horizonRow - 1, botR + 1); rr++) {
      const rowOff = rr * cols;
      for (let cc = Math.max(0, minC - 1); cc <= Math.min(cols - 1, maxC + 1); cc++) {
        const idx = rowOff + cc;
        charBuf[idx] = ' ';
        colorBuf[idx] = '';
        glowBuf[idx] = 0;
        zBuf[idx] = 1e6;
      }
    }

    // 2. Draw twinkling LED marquee border on topR (1) and botR (4) + side edges on rows 2..3
    const activeHalf = Math.round((maxC - minC) * 0.5 * smoothstep(0.0, 0.5, progress));
    const curMinC = centerCol - activeHalf;
    const curMaxC = centerCol + activeHalf;

    for (let cc = curMinC; cc <= curMaxC; cc++) {
      const isCorner = cc === curMinC || cc === curMaxC;
      if (isCorner) {
        plotCell(cc, topR, 1e6 + 1, '*', '#ffd166', true);
        for (let mr = topR + 1; mr < botR; mr++) {
          plotCell(cc, mr, 1e6 + 1, '·', '#ffd166', true);
        }
        plotCell(cc, botR, 1e6 + 1, '*', '#ffd166', true);
      } else if ((cc - curMinC) % 3 === 0) {
        const ledPhase = Math.sin(elapsed * 4.2 + cc * 0.45) + musicBeat * 0.4;
        const isBrightLed = ledPhase > 0.35;
        const ledChar = isBrightLed ? '·' : '.';
        const ledColor = Math.floor(cc / 3) % 2 === 0 ? '#ffd166' : '#90e0ef';
        plotCell(cc, topR, 1e6 + 1, ledChar, ledColor, isBrightLed);
        plotCell(cc, botR, 1e6 + 1, ledChar, ledColor, isBrightLed);
      }
    }
  }

  function renderScrollingMarqueeCanvas(centerCol, elapsed, progress, starProgress, musicSync) {
    if (progress <= 0.01) return;

    const { minC, maxC, topR, botR } = getMarqueeSignboardBounds(centerCol);
    const revealWidthRatio = smoothstep(0.0, 0.5, progress);
    const activeHalfCols = Math.round((maxC - minC) * 0.5 * revealWidthRatio);
    if (activeHalfCols < 4) return;

    const curMinC = centerCol - activeHalfCols;
    const curMaxC = centerCol + activeHalfCols;

    const clipLeftPx = (curMinC + 1) * cellW;
    const clipRightPx = curMaxC * cellW;
    const clipWidthPx = Math.max(10, clipRightPx - clipLeftPx);

    const fontSize = clamp(Math.round(cellH * 1.05), 12, 18);
    // Interior spans rows 2 & 3 cleanly between topR (1) LEDs and botR (4) LEDs (never clip Vietnamese/CJK diacritics)
    const rawClipTopPx = (topR + 0.85) * cellH;
    const rawClipBottomPx = (botR + 0.1) * cellH;
    const rawClipHeightPx = Math.max(18, rawClipBottomPx - rawClipTopPx);
    const textCenterYPx = Math.round((rawClipTopPx + rawClipBottomPx) * 0.5 + 1);
    const clipHeightPx = Math.max(rawClipHeightPx, Math.ceil(fontSize * 1.9));
    const clipTopPx = clipHeightPx > rawClipHeightPx ? textCenterYPx - clipHeightPx * 0.5 : rawClipTopPx;
    const musicBeat = musicSync ? musicSync.pulse : 0.5;

    ctx.save();

    ctx.beginPath();
    ctx.rect(clipLeftPx, clipTopPx, clipWidthPx, clipHeightPx);
    ctx.clip();

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(clipLeftPx, clipTopPx, clipWidthPx, clipHeightPx);

    ctx.font = `bold ${fontSize}px "Cascadia Mono", "Consolas", "Courier New", "Yu Gothic UI", "Meiryo", "MS Gothic", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const segWidths = [];
    let totalStripWidth = 0;
    for (let i = 0; i < MARQUEE_SEGMENTS.length; i++) {
      const w = ctx.measureText(MARQUEE_SEGMENTS[i].text).width;
      segWidths.push(w);
      totalStripWidth += w;
    }

    if (totalStripWidth > 10) {
      const scrollSpeed = 58;
      const initialLead = Math.max(16, (clipWidthPx - segWidths[0]) * 0.5);
      const rawScroll = elapsed * scrollSpeed;
      const startX = clipLeftPx + initialLead - (rawScroll % totalStripWidth);

      for (let copy = -1; copy <= 2; copy++) {
        let curX = startX + copy * totalStripWidth;
        if (curX + totalStripWidth < clipLeftPx - 20 || curX > clipRightPx + 20) {
          continue;
        }

        for (let i = 0; i < MARQUEE_SEGMENTS.length; i++) {
          const seg = MARQUEE_SEGMENTS[i];
          const segW = segWidths[i];
          if (curX + segW >= clipLeftPx - 10 && curX <= clipRightPx + 10) {
            ctx.shadowColor = seg.glow;
            ctx.shadowBlur = (starProgress > 0.2 ? 9 : 6) + musicBeat * 3;
            ctx.fillStyle = seg.color;
            ctx.fillText(seg.text, curX, textCenterYPx);
          }
          curX += segW;
        }
      }
    }

    ctx.restore();
  }

  // =========================================================================
  // Shared Character Grid Flush & Pure-ASCII "Click here" Splash Screen
  // =========================================================================
  function renderBloomPass(targetCtx, targetW, targetH, srcW, srcH) {
    targetCtx.save();
    targetCtx.clearRect(0, 0, targetW, targetH);
    targetCtx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in targetCtx) targetCtx.imageSmoothingQuality = 'high';
    if (supportsCtxFilter) {
      try {
        targetCtx.filter = 'blur(2px)';
      } catch (_) {}
    }
    targetCtx.drawImage(canvas, 0, 0, srcW, srcH, 0, 0, targetW, targetH);
    if (supportsCtxFilter) {
      try {
        targetCtx.filter = 'none';
      } catch (_) {}
    }
    targetCtx.restore();
  }

  function flushCharGridToCanvas(bgColor) {
    const logicalW = canvas.width / dpr;
    const logicalH = canvas.height / dpr;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, logicalW, logicalH);

    const fontSize = Math.max(7, cellH - 2);
    ctx.font = `bold ${fontSize}px "Cascadia Mono", "Consolas", "Courier New", "Yu Gothic UI", "Meiryo", "MS Gothic", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const halfCellW = cellW * 0.5;
    const halfCellH = cellH * 0.5 + 0.5;
    let lastStyle = '';
    for (let r = 0; r < rows; r++) {
      const yPx = r * cellH + halfCellH;
      const rowOffset = r * cols;
      for (let c = 0; c < cols; c++) {
        const idx = rowOffset + c;
        const ch = charBuf[idx];
        if (ch === ' ') continue;

        const color = colorBuf[idx];
        if (color !== lastStyle) {
          ctx.fillStyle = color;
          lastStyle = color;
        }

        ctx.fillText(ch, c * cellW + halfCellW, yPx);
      }
    }

    // Multi-scale additive bloom (1/4 tight halo + 1/10 wide atmospheric glow)
    if (ensureBloomCanvases()) {
      const cw = canvas.width;
      const ch = canvas.height;
      const b1W = bloomCanvas1.width;
      const b1H = bloomCanvas1.height;
      const b2W = bloomCanvas2.width;
      const b2H = bloomCanvas2.height;

      if (cw > 0 && ch > 0 && b1W > 0 && b1H > 0 && b2W > 0 && b2H > 0) {
        renderBloomPass(bloomCtx1, b1W, b1H, cw, ch);
        renderBloomPass(bloomCtx2, b2W, b2H, cw, ch);

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        ctx.globalCompositeOperation = 'lighter';

        ctx.globalAlpha = 0.3;
        ctx.drawImage(bloomCanvas1, 0, 0, b1W, b1H, 0, 0, cw, ch);

        ctx.globalAlpha = 0.24;
        ctx.drawImage(bloomCanvas2, 0, 0, b2W, b2H, 0, 0, cw, ch);
        ctx.restore();
      }
    }
  }

  function renderSplashScreen(now) {
    const splashElapsed = (now - splashStartTime) / 1000;
    clearBuffers();

    const { aspect, halfCols, centerY, scalePix } = getLayoutParams();

    // 1. Dim receding perspective ground dots for depth (full viewport)
    const gRot = splashElapsed * ROT_SPEED * 0.18;
    renderPerspectiveGround(gRot, aspect, halfCols, centerY, scalePix, 0.04, 0.42, 0.45, 0.54, 0.72);

    // 2. Softly twinkling night sky stars
    for (let i = 0; i < skyStars.length; i++) {
      const s = skyStars[i];
      const feather = smoothstep(horizonRow + 1, horizonRow - 5, s.r);
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(splashElapsed * s.speed * 0.72 + s.phase));
      const ch = tw > 0.87 ? (s.ch === '.' ? '+' : '*') : tw < 0.48 ? '.' : s.ch;
      const col = shadeHexColor(s.baseColor, (0.38 + 0.44 * tw) * (0.3 + 0.7 * feather));
      plotCell(s.c, s.r, -100, ch, col, tw > 0.88 && feather > 0.5);
    }

    // 3. Slowly drifting ASCII snowflakes
    const snowTime = splashElapsed * 0.45;
    for (let i = 0; i < snowFlakes.length; i++) {
      const sf = snowFlakes[i];
      const sxRaw = sf.x0 + sf.vx * snowTime + 0.6 * Math.sin(splashElapsed * 0.8 + sf.phase);
      const syRaw = sf.y0 + sf.vy * snowTime;
      const sx = clamp(Math.round(((sxRaw % cols) + cols) % cols), 0, cols - 1);
      const sy = clamp(Math.round(((syRaw % rows) + rows) % rows), 0, rows - 1);
      const fade = 0.42 + 0.32 * Math.sin(splashElapsed * 1.8 + sf.phase);
      const snowCol = rgbFloatToHex(0.8 * fade, 0.88 * fade, 0.98 * fade);
      plotCell(sx, sy, -20, sf.ch, snowCol, false);
    }

    // 4. Cleanly wipe charBuf around the center "Click here" zone + subtle ASCII sparkle border
    const centerCol = Math.floor(halfCols);
    const centerRow = Math.floor(rows * 0.47);
    const boxHalfW = Math.min(Math.floor(cols * 0.44), 26);
    const minC = Math.max(1, centerCol - boxHalfW);
    const maxC = Math.min(cols - 2, centerCol + boxHalfW);
    const topR = Math.max(1, centerRow - 3);
    const botR = Math.min(rows - 2, centerRow + 3);

    for (let rr = topR; rr <= botR; rr++) {
      const rowOff = rr * cols;
      for (let cc = minC; cc <= maxC; cc++) {
        const idx = rowOff + cc;
        charBuf[idx] = ' ';
        colorBuf[idx] = '';
        glowBuf[idx] = 0;
        zBuf[idx] = 1e6;
      }
    }

    const breath = 0.5 + 0.5 * Math.sin(splashElapsed * 2.2);
    const borderGlowCol = rgbFloatToHex(
      0.85 + 0.15 * breath,
      0.74 + 0.22 * breath,
      0.42 + 0.45 * breath
    );

    // Delicate corner & edge ASCII sparkles framing the splash prompt
    plotCell(minC, topR, 1e6 + 1, '*', borderGlowCol, breath > 0.4);
    plotCell(maxC, topR, 1e6 + 1, '*', borderGlowCol, breath > 0.4);
    plotCell(minC, botR, 1e6 + 1, '*', borderGlowCol, breath > 0.4);
    plotCell(maxC, botR, 1e6 + 1, '*', borderGlowCol, breath > 0.4);
    plotCell(minC + 2, topR, 1e6 + 1, '·', '#90e0ef', false);
    plotCell(maxC - 2, topR, 1e6 + 1, '·', '#90e0ef', false);
    plotCell(minC + 2, botR, 1e6 + 1, '·', '#90e0ef', false);
    plotCell(maxC - 2, botR, 1e6 + 1, '·', '#90e0ef', false);

    for (let cc = minC + 6; cc <= maxC - 6; cc += 6) {
      const tw = 0.5 + 0.5 * Math.sin(splashElapsed * 3.0 + cc * 0.4);
      if (tw > 0.55) {
        const sc = tw > 0.85 ? '+' : '·';
        const col = tw > 0.8 ? '#ffd166' : '#7ea2c4';
        plotCell(cc, topR, 1e6 + 1, sc, col, tw > 0.85);
        plotCell(cc, botR, 1e6 + 1, sc, col, tw > 0.85);
      }
    }

    // Flush ASCII background + clean wiped frame onto #05070d
    flushCharGridToCanvas('#05070d');

    // 5. Draw centered "Click here" text & subtle piano title inside the clean zone
    const centerXPx = (centerCol + 0.5) * cellW;
    const mainYPx = (centerRow - 0.35) * cellH;
    const subYPx = (centerRow + 1.45) * cellH;

    const maxTextWidthPx = Math.min((maxC - minC - 1) * cellW, cols * cellW * 0.84);
    let mainText = '✦   C L I C K   H E R E   ✦';
    let mainSize = clamp(Math.round(cellH * 1.25), 13, 22);
    const subText = '♪  Merry Christmas, Mr. Ryuichi Sakamoto  ♪';
    let subSize = clamp(Math.round(cellH * 0.78), 10, 15);

    const mainColor = rgbFloatToHex(
      1.0,
      0.84 + 0.14 * breath,
      0.42 + 0.5 * breath
    );
    const subAlpha = 0.56 + 0.28 * breath;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `bold ${mainSize}px "Cascadia Mono", "Consolas", "Courier New", monospace`;
    let mainWidth = ctx.measureText(mainText).width;
    if (mainWidth > maxTextWidthPx) {
      const fittedMain = Math.floor(mainSize * (maxTextWidthPx / mainWidth));
      if (fittedMain < 12) {
        mainText = '✦ CLICK HERE ✦';
        ctx.font = `bold ${mainSize}px "Cascadia Mono", "Consolas", "Courier New", monospace`;
        mainWidth = ctx.measureText(mainText).width;
        if (mainWidth > maxTextWidthPx) {
          mainSize = Math.max(11, Math.floor(mainSize * (maxTextWidthPx / mainWidth)));
        }
      } else {
        mainSize = fittedMain;
      }
      ctx.font = `bold ${mainSize}px "Cascadia Mono", "Consolas", "Courier New", monospace`;
    }

    ctx.shadowColor = breath > 0.5 ? '#ffe066' : '#ffd166';
    ctx.shadowBlur = 8 + 8 * breath;
    ctx.fillStyle = mainColor;
    ctx.fillText(mainText, centerXPx, mainYPx);

    ctx.font = `${subSize}px "Cascadia Mono", "Consolas", "Courier New", monospace`;
    const subWidth = ctx.measureText(subText).width;
    if (subWidth > maxTextWidthPx) {
      subSize = Math.max(9, Math.floor(subSize * (maxTextWidthPx / subWidth)));
      ctx.font = `${subSize}px "Cascadia Mono", "Consolas", "Courier New", monospace`;
    }

    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(144, 224, 239, 0.45)';
    ctx.fillStyle = `rgba(176, 204, 232, ${subAlpha.toFixed(3)})`;
    ctx.fillText(subText, centerXPx, subYPx);

    ctx.restore();
  }

  // =========================================================================
  // Main 3D Projection & Unified Z-Buffer Render Loop
  // =========================================================================
  let lastFrameTime = performance.now();

  function renderFrame(now) {
    const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    if (!hasStarted) {
      renderSplashScreen(now);
      requestAnimationFrame(renderFrame);
      return;
    }

    const elapsed = (now - startTime) / 1000;
    const rot = elapsed * ROT_SPEED;
    const ca = Math.cos(rot);
    const sa = Math.sin(rot);

    // Stage progress values synchronized with christmas_tree.py timings
    const treeGrowth = smooth((elapsed - T_GROW[0]) / (T_GROW[1] - T_GROW[0]));
    const starProgress = elapsed >= T_STAR ? smooth((elapsed - T_STAR) / 0.3) : 0.0;

    // Synchronize with "Merry Christmas Mr. Lawrence" piano energy & beat pulse
    const musicSync = getMusicSyncState(elapsed);

    // Van Gogh Starry Night sweeps left-to-right once the trunk/base emerges (or sky is clicked)
    const vanGoghActive = treeGrowth >= 0.08 || vanGoghClickActive;
    if (vanGoghActive) {
      vanGoghSweepProgress = clamp(vanGoghSweepProgress + dt / 2.6, 0, 1);
      const waveSpeedBoost =
        (0.45 + 0.75 * smoothstep(0.15, 1.0, vanGoghSweepProgress)) *
        (0.82 + 0.35 * musicSync.energy + 0.25 * musicSync.pulse);
      vanGoghWaveTime += dt * waveSpeedBoost;
    }

    clearBuffers();

    // -----------------------------------------------------------------------
    // 1. Unified 3D Projection Parameters (fits cleanly beneath top marquee)
    // -----------------------------------------------------------------------
    const { aspect, halfCols, centerY, scalePix } = getLayoutParams();

    // Subtle opening transition sparkle ring right after clicking "Click here"
    if (introBurstTime > 0) {
      const burstAge = (now - introBurstTime) / 1000;
      if (burstAge >= 0 && burstAge < 0.75) {
        const prog = burstAge / 0.75;
        const fade = Math.pow(1.0 - prog, 1.4);
        const burstCenterR = Math.floor(rows * 0.47);
        const ringRadius = 2.0 + prog * 18.0;
        const nPts = 28;
        for (let i = 0; i < nPts; i++) {
          const ang = (i / nPts) * TAU + prog * 1.4;
          const bc = Math.round(halfCols + (Math.cos(ang) * ringRadius) / aspect);
          const br = Math.round(burstCenterR + Math.sin(ang) * ringRadius);
          const ch = prog < 0.35 ? '*' : prog < 0.68 ? '+' : '·';
          const bCol = rgbFloatToHex(1.0 * fade, 0.9 * fade, (0.55 + 0.45 * fade) * fade);
          plotCell(bc, br, -15, ch, bCol, fade > 0.35);
        }
      }
    }

    const projY0 = project3D(0, Y0, 0, ca, sa, halfCols, centerY, scalePix, aspect);
    const projY1 = project3D(0, Y1, 0, ca, sa, halfCols, centerY, scalePix, aspect);
    const treeBaseRow = Math.round(projY0.sy);
    const treeTopRow = Math.round(projY1.sy);
    const treeHeightRows = Math.max(10, treeBaseRow - treeTopRow);
    const treeHalfWCols = (0.96 * 0.56 * scalePix) / aspect;

    // -----------------------------------------------------------------------
    // 2. Render Inverse Perspective Ground Plane (seamless full-viewport fill)
    // -----------------------------------------------------------------------
    const gRot = rot * 0.35;
    renderPerspectiveGround(gRot, aspect, halfCols, centerY, scalePix, 0.06, 0.58, 0.55, 0.62, 0.78);

    // -----------------------------------------------------------------------
    // 3. Render Night Sky Base Stars (feathered softly near horizon)
    // -----------------------------------------------------------------------
    for (let i = 0; i < skyStars.length; i++) {
      const s = skyStars[i];
      const feather = smoothstep(horizonRow + 1, horizonRow - 5, s.r);
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(elapsed * s.speed + s.phase));
      const ch = tw > 0.85 ? (s.ch === '.' ? '+' : '*') : tw < 0.45 ? '.' : s.ch;
      const col = shadeHexColor(s.baseColor, (0.55 + 0.6 * tw) * (0.3 + 0.7 * feather));
      plotCell(s.c, s.r, -100, ch, col, tw > 0.85 && feather > 0.5);
      if (s.isCluster && tw > 0.6 && feather > 0.4) {
        const subCol = shadeHexColor('#708299', 0.3 + 0.7 * feather);
        plotCell(s.c - 1, s.r, -101, '.', subCol, false);
        plotCell(s.c + 1, s.r, -101, '.', subCol, false);
      }
    }

    // -----------------------------------------------------------------------
    // 4. Render Van Gogh Multi-Spiral Starry Night Sky
    // -----------------------------------------------------------------------
    renderVanGoghStarryNight(
      elapsed,
      dt,
      vanGoghSweepProgress,
      vanGoghWaveTime,
      Math.floor(halfCols),
      treeBaseRow,
      treeHeightRows,
      treeHalfWCols,
      treeGrowth,
      musicSync
    );

    // -----------------------------------------------------------------------
    // 5. Render Drifting ASCII Snowflakes
    // -----------------------------------------------------------------------
    for (let i = 0; i < snowFlakes.length; i++) {
      const sf = snowFlakes[i];
      const sxRaw = sf.x0 + sf.vx * elapsed + 0.8 * Math.sin(elapsed * 1.1 + sf.phase);
      const syRaw = sf.y0 + sf.vy * elapsed;
      const sx = clamp(Math.round(((sxRaw % cols) + cols) % cols), 0, cols - 1);
      const sy = clamp(Math.round(((syRaw % rows) + rows) % rows), 0, rows - 1);
      const fade = 0.6 + 0.4 * Math.sin(elapsed * 2.5 + sf.phase);
      const snowCol = rgbFloatToHex(0.86 * fade, 0.92 * fade, 1.0 * fade);
      plotCell(sx, sy, -20, sf.ch, snowCol, false);
    }

    // -----------------------------------------------------------------------
    // 6. Render Unified 3D Scene (Tree, Cone, Trunk, Tinsel, Baubles, Lights,
    //    6 3D Gift Boxes & Crossed Bows on the SAME Z-Buffer)
    // -----------------------------------------------------------------------
    if (sceneData) {
      const {
        count,
        px: sPx,
        py: sPy,
        pz: sPz,
        nx: sNx,
        ny: sNy,
        nz: sNz,
        cr: sCr,
        cg: sCg,
        cb: sCb,
        kind: sKind,
        t0: sT0,
        base: sBase,
        cx: sCx,
        cy: sCy,
        cz: sCz,
        phase: sPhase,
        pop: sPop,
      } = sceneData;

      const lightMusicBoost = 0.88 + 0.24 * musicSync.pulse;

      for (let i = 0; i < count; i++) {
        const ptT0 = sT0[i];
        if (elapsed < ptT0) continue;

        const age = elapsed - ptT0;
        let wx = sPx[i];
        let wy = sPy[i];
        let wz = sPz[i];

        if (sPop[i] && age < 0.35) {
          const spop = smooth(age / 0.35);
          const cx = sCx[i];
          const cy = sCy[i];
          const cz = sCz[i];
          wx = cx + (wx - cx) * spop;
          wy = cy + (wy - cy) * spop;
          wz = cz + (wz - cz) * spop;
        }

        const proj = project3D(wx, wy, wz, ca, sa, halfCols, centerY, scalePix, aspect);
        if (proj.zp <= 0.5) continue;

        const ix = Math.round(proj.sx);
        const iy = Math.round(proj.sy);
        if (ix < 0 || ix >= cols || iy < 0 || iy >= rows) continue;

        // Depth check early before lighting/string work (-zp: smaller zp is closer)
        const depth = -proj.zp;
        const bufIdx = iy * cols + ix;
        if (depth < zBuf[bufIdx]) continue;

        // Rotate normal into view space for lighting (light_dir = [0.42, 0.56, -0.71])
        const pnx = sNx[i];
        const pny = sNy[i];
        const pnz = sNz[i];
        const vnx = pnx * ca - pnz * sa;
        const vnz = pnx * sa + pnz * ca;
        const ndotl = clamp(vnx * 0.42 + pny * 0.56 - vnz * 0.71, 0.0, 1.0);

        const k = sKind[i];
        const base = sBase[i];
        const phase = sPhase[i];

        let lum;
        let ch;
        let glow = false;
        let r = sCr[i];
        let g = sCg[i];
        let b = sCb[i];

        if (k === CONE) {
          lum = base * (0.18 + 0.25 * ndotl);
        } else if (k === SNOW) {
          lum = 0.72 + 0.28 * ndotl;
        } else if (k === TINSEL) {
          const shim = Math.sin(elapsed * 4.5 + phase);
          lum = 0.65 + 0.35 * shim * 0.5 + 0.35 * ndotl;
          if (shim > 0.78) glow = true;
        } else if (k === BALL) {
          lum = 0.38 + 0.62 * Math.pow(ndotl, 1.3);
          if (ndotl > 0.78) glow = true;
        } else if (k === GIFT) {
          lum = 0.42 + 0.58 * ndotl;
        } else if (k === RIBBON) {
          lum = 0.62 + 0.38 * ndotl;
          if (age > 0.35 && ndotl > 0.45) glow = true;
        } else if (k === LIGHT) {
          const twinkle = 0.55 + 0.45 * Math.sin(elapsed * 6.0 + phase);
          lum = (0.55 + 0.65 * twinkle) * lightMusicBoost;
          if (twinkle > 0.58) glow = true;
        } else {
          // NEEDLE or TRUNK
          lum = base * (0.28 + 0.72 * ndotl);
        }

        // Growth frontier frost-white flash for needles, snow & trunk
        if ((k === NEEDLE || k === SNOW || k === TRUNK) && age < 0.38) {
          const flashW = clamp(1.0 - age / 0.38, 0.0, 1.0);
          const mixW = 0.85 * flashW;
          r = r * (1.0 - mixW) + mixW;
          g = g * (1.0 - mixW) + mixW;
          b = b * (1.0 - mixW) + mixW;
          if (1.05 * flashW > lum) lum = 1.05 * flashW;
          if (flashW > 0.45) glow = true;
        }

        const wLum = clamp(lum, 0.0, 1.0);
        const lumScale = clamp(lum, 0.12, 1.2);

        if (k === LIGHT || k === RIBBON) {
          ch = '@';
        } else if (k === GIFT) {
          ch = wLum > 0.65 ? '#' : '%';
        } else {
          const rampIdx = clamp((wLum * RAMP_MAX) | 0, 1, RAMP_MAX);
          ch = RAMP[rampIdx];
        }

        zBuf[bufIdx] = depth;
        charBuf[bufIdx] = ch;
        colorBuf[bufIdx] = rgbFloatToHex(r * lumScale, g * lumScale, b * lumScale);
        glowBuf[bufIdx] = glow ? 1 : 0;
      }
    }

    // -----------------------------------------------------------------------
    // 7. Render Topper Star (dim silhouette at T_GROW[1]-0.5 -> bursts at T_STAR)
    // -----------------------------------------------------------------------
    if (elapsed >= T_GROW[1] - 0.5) {
      const starProj = project3D(0, Y1 + 0.13, 0, ca, sa, halfCols, centerY, scalePix, aspect);
      const on = starProgress;
      const flash =
        elapsed >= T_STAR
          ? Math.pow(clamp(1.0 - (elapsed - T_STAR) / 1.0, 0.0, 1.0), 2)
          : 0.0;
      const power = (0.25 + 0.85 * on) * (0.92 + 0.16 * musicSync.pulse);
      const starScale = clamp(Math.min(rows / 74, scalePix / 26), 0.68, 1.25);
      const starSz =
        (1.6 + 1.5 * on) *
        (1.0 + 0.05 * Math.sin(elapsed * 3.0) + 0.04 * musicSync.pulse) *
        starScale;

      renderTopperStar(
        Math.round(starProj.sx),
        Math.round(starProj.sy),
        starProj.zp,
        starSz,
        elapsed,
        power,
        aspect,
        flash,
        elapsed >= T_STAR
      );
    }

    // -----------------------------------------------------------------------
    // 8. Prepare 1-Line Scrolling Marquee Signboard (clean wipe + LED frame)
    // -----------------------------------------------------------------------
    const greetingProgress = clamp(
      Math.max(vanGoghSweepProgress * 1.15 - 0.15, smoothstep(T_STAR, T_MSG, elapsed)),
      0,
      1
    );
    const centerCol = Math.floor(halfCols);
    prepareMarqueeSignboardGrid(centerCol, greetingProgress, elapsed, musicSync);

    // -----------------------------------------------------------------------
    // 9. Flush Character Grid to HTML5 2D Canvas
    // -----------------------------------------------------------------------
    flushCharGridToCanvas(BG_COLOR);

    // -----------------------------------------------------------------------
    // 10. Render 3-Language Scrolling Marquee Text inside clean expanded box
    // -----------------------------------------------------------------------
    renderScrollingMarqueeCanvas(centerCol, elapsed, greetingProgress, starProgress, musicSync);

    requestAnimationFrame(renderFrame);
  }

  // =========================================================================
  // Bootstrapping
  // =========================================================================
  sceneData = buildSceneData();
  handleResize();
  canvas.style.cursor = 'pointer';
  requestAnimationFrame(renderFrame);
})();
