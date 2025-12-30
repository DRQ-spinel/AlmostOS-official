(() => {
  const $ = (s) => document.querySelector(s);

  const pctEl = $("#pct");
  const stopEl = $("#stopCode");
  const failedEl = $("#whatFailed");
  const restartBtn = $("#restartNow");
  const countEl = $("#count");
  const qrEl = $("#qr");

  const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const STOP_CODES = [
    "IRQL_NOT_LESS_OR_EQUAL",
    "PAGE_FAULT_IN_NONPAGED_AREA",
    "SYSTEM_SERVICE_EXCEPTION",
    "KMODE_EXCEPTION_NOT_HANDLED",
    "DPC_WATCHDOG_VIOLATION",
    "CRITICAL_PROCESS_DIED",
    "MEMORY_MANAGEMENT",
    "UNEXPECTED_KERNEL_MODE_TRAP",
    "DRIVER_IRQL_NOT_LESS_OR_EQUAL",
    "VIDEO_TDR_FAILURE"
  ];

  const WHAT_FAILED = [
    "ntoskrnl.exe",
    "win32kfull.sys",
    "fltmgr.sys",
    "tcpip.sys",
    "dxgkrnl.sys",
    "Wdf01000.sys",
    "storport.sys",
    "nvlddmkm.sys",
    "amdkmdag.sys",
    "almostos.sys"
  ];

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // read crash info (set by os.html), or make one up
  let crash = {
    stopCode: pick(STOP_CODES),
    whatFailed: pick(WHAT_FAILED),
    at: new Date().toISOString()
  };

  try {
    const raw = localStorage.getItem("almostos.lastCrash");
    if (raw) crash = { ...crash, ...JSON.parse(raw) };
  } catch {}

  const stopCode = (crash.stopCode && String(crash.stopCode)) || pick(STOP_CODES);
  const whatFailed = (crash.whatFailed && String(crash.whatFailed)) || pick(WHAT_FAILED);

  stopEl.textContent = stopCode;
  failedEl.textContent = whatFailed;

  // ---- Fake QR (deterministic) ----
  const hash32 = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const makeFakeQR = (seedText) => {
    const size = 29; // modules
    const m = Array.from({ length: size }, () => Array(size).fill(0));
    const drawFinder = (ox, oy) => {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        if (edge || core) m[oy + y][ox + x] = 1;
      }
      // white ring (leave as 0) is implicit
    };

    drawFinder(0, 0);
    drawFinder(size - 7, 0);
    drawFinder(0, size - 7);

    // timing patterns
    for (let i = 8; i < size - 8; i++) {
      m[6][i] = i % 2 ? 1 : 0;
      m[i][6] = i % 2 ? 1 : 0;
    }

    // sprinkle data
    let rnd = hash32(seedText);
    const nextBit = () => {
      rnd ^= rnd << 13; rnd >>>= 0;
      rnd ^= rnd >> 17; rnd >>>= 0;
      rnd ^= rnd << 5;  rnd >>>= 0;
      return rnd & 1;
    };

    const isReserved = (x, y) => {
      const inTL = x < 9 && y < 9;
      const inTR = x >= size - 9 && y < 9;
      const inBL = x < 9 && y >= size - 9;
      const timing = x === 6 || y === 6;
      return inTL || inTR || inBL || timing;
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isReserved(x, y)) continue;
        // keep some whitespace like real QR
        const bit = nextBit();
        m[y][x] = bit && nextBit() ? 1 : 0;
      }
    }

    // render SVG
    const mod = 110 / size;
    const pad = 0;
    const w = 110;
    const rects = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (m[y][x]) {
        rects.push(`<rect x="${(x * mod + pad).toFixed(3)}" y="${(y * mod + pad).toFixed(3)}" width="${mod.toFixed(3)}" height="${mod.toFixed(3)}" />`);
      }
    }
    return `<svg viewBox="0 0 ${w} ${w}" width="${w}" height="${w}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="${w}" height="${w}" fill="#fff"/>
      <g fill="#000">${rects.join("")}</g>
    </svg>`;
  };

  if (qrEl) qrEl.innerHTML = makeFakeQR(`${stopCode}|${whatFailed}`);

  // ---- Progress + auto reboot ----
  let pct = 0;
  let done = false;

  const setPct = (v) => {
    pct = Math.max(0, Math.min(100, v));
    if (pctEl) pctEl.textContent = String(pct);
  };

  const restart = () => {
    // clear lastCrash if you want repeated variety next time
    // try { localStorage.removeItem("almostos.lastCrash"); } catch {}
    location.href = "boot.html?phase=resume&from=bsod";
  };

  const runCountdown = (seconds) => {
    let s = seconds;
    if (countEl) countEl.textContent = String(s);
    const t = setInterval(() => {
      s -= 1;
      if (countEl) countEl.textContent = String(Math.max(0, s));
      if (s <= 0) {
        clearInterval(t);
        restart();
      }
    }, 1000);
  };

  const tick = () => {
    if (done) return;
    const bump = prefersReducedMotion ? 14 : (1 + Math.floor(Math.random() * 4));
    const slow = pct > 84 ? 1 : 0;
    setPct(pct + bump - slow);
    if (pct >= 100) {
      setPct(100);
      done = true;
      runCountdown(6);
      return;
    }
    const delay = prefersReducedMotion ? 240 : (90 + Math.floor(Math.random() * 160));
    setTimeout(tick, delay);
  };

  if (restartBtn) restartBtn.addEventListener("click", restart);

  window.addEventListener("keydown", (e) => {
    const k = (e.key || "").toLowerCase();
    if (k === "enter" || k === "r") {
      e.preventDefault();
      restart();
    }
  });

  // start
  setPct(0);
  setTimeout(tick, prefersReducedMotion ? 120 : 420);
})();
