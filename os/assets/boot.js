(() => {
  const qs = new URLSearchParams(location.search);
  const phase = qs.get("phase") || "cold";
  const pctEl = document.getElementById("pct");
  const barEl = document.getElementById("bar");
  const logEl = document.getElementById("log");
  const biosBtn = document.getElementById("biosBtn");
  const skipBtn = document.getElementById("skipBtn");
  const titleEl = document.getElementById("title");
  const subEl = document.getElementById("sub");

  let cancelled = false;
  let pct = 0;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const nowStr = () => {
    const d = new Date();
    return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"});
  };

  const push = (msg, strong=false) => {
    const line = document.createElement("div");
    line.innerHTML = `${strong ? "<b>" : ""}[${nowStr()}] ${msg}${strong ? "</b>" : ""}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  };

  const setPct = (v) => {
    pct = clamp(v, 0, 100);
    barEl.style.width = pct + "%";
    pctEl.textContent = pct.toString().padStart(3," ") + "%";
  };

  const goBIOS = () => {
    if(cancelled) return;
    cancelled = true;
    location.href = "bios.html";
  };

  const goOS = () => {
    if(cancelled) return;
    cancelled = true;
    location.href = "os.html?fromboot=1";
  };

  // Bind actions
  biosBtn.addEventListener("click", goBIOS);
  skipBtn.addEventListener("click", goOS);

  window.addEventListener("keydown", (e) => {
    const k = (e.key || "").toLowerCase();
    if(k === "f2" || k === "delete" || k === "del") { e.preventDefault(); goBIOS(); }
    if(k === "enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); goOS(); }
  });

  // Phase UI tweaks
  if(phase === "resume"){
    titleEl.textContent = "AlmostBIOS → Booting…";
    subEl.textContent = "Resuming boot sequence";
    biosBtn.style.display = "none";
  }

  const stepsCold = [
    "Power on self test…",
    "Initializing memory controller",
    "Detecting storage devices",
    "Enumerating PCI devices",
    "Loading firmware modules",
    "Starting boot loader",
    "Preparing kernel",
    "Handing off to OS…"
  ];

  const stepsResume = [
    "Applying setup changes",
    "Re-checking boot order",
    "Starting boot loader",
    "Preparing kernel",
    "Handing off to OS…"
  ];

  const steps = phase === "resume" ? stepsResume : stepsCold;

  async function run(){
    logEl.innerHTML = "";
    push("ALMOST UEFI/Legacy Compatibility Layer", true);
    push(`Boot phase: ${phase}`);
    await sleep(250);

    setPct(0);

    const total = phase === "resume" ? 1500 : 2600;
    const start = performance.now();

    // text steps cadence
    let si = 0;
    const stepTimer = setInterval(() => {
      if(cancelled) return clearInterval(stepTimer);
      if(si < steps.length){
        push(steps[si++]);
      } else {
        clearInterval(stepTimer);
      }
    }, phase === "resume" ? 320 : 420);

    while(!cancelled){
      const t = performance.now();
      const p = clamp((t - start) / total, 0, 1);
      // gentle easing
      const eased = 1 - Math.pow(1 - p, 3);
      setPct(Math.round(eased * 100));
      if(p >= 1) break;
      await sleep(40);
    }

    if(cancelled) return;
    push("OK", true);
    await sleep(250);
    goOS();
  }

  run();
})();
