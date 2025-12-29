(() => {
  const stopcodes = Array.isArray(window.__STOPCODES__) ? window.__STOPCODES__ : [];
  const list = document.getElementById("stopcodeList");
  const search = document.getElementById("stopcodeSearch");
  const randomBtn = document.getElementById("randomStop");

  const hamburger = document.getElementById("hamburger");
  const mobileNav = document.getElementById("mobileNav");

  const render = (items) => {
    if (!list) return;
    list.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "card";
      empty.innerHTML = `<h3>見つからん</h3><p class="dim">スペルが違うかも。あとこの説明は雑。</p>`;
      list.appendChild(empty);
      return;
    }
    items.forEach(sc => {
      const el = document.createElement("div");
      el.className = "stopcard";
      el.innerHTML = `
        <div class="stopcard__code">${escapeHtml(sc.code)}</div>
        <div class="stopcard__desc">${escapeHtml(sc.desc || "")}</div>
        <div class="stopcard__tip"><strong>対処（雑）：</strong> ${escapeHtml(sc.tip || "再起動")}</div>
      `;
      list.appendChild(el);
    });
  };

  const escapeHtml = (s) => String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

  const filter = () => {
    const q = (search?.value || "").trim().toLowerCase();
    if (!q) return stopcodes;
    return stopcodes.filter(sc =>
      String(sc.code).toLowerCase().includes(q) ||
      String(sc.desc || "").toLowerCase().includes(q) ||
      String(sc.tip || "").toLowerCase().includes(q)
    );
  };

  if (search) {
    search.addEventListener("input", () => render(filter()));
  }
  if (randomBtn) {
    randomBtn.addEventListener("click", () => {
      if (!stopcodes.length) return;
      const sc = stopcodes[Math.floor(Math.random() * stopcodes.length)];
      render([sc]);
      // Scroll into view nicely
      document.getElementById("stopcodes")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Mobile nav toggling
  if (hamburger && mobileNav) {
    hamburger.addEventListener("click", () => {
      const isHidden = mobileNav.hasAttribute("hidden");
      if (isHidden) mobileNav.removeAttribute("hidden");
      else mobileNav.setAttribute("hidden", "");
    });

    // close menu on click
    mobileNav.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => mobileNav.setAttribute("hidden",""));
    });
  }

  // smooth scroll (fallback for browsers without CSS scroll-behavior)
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.pushState(null, "", href);
    });
  });

  // initial render
  render(stopcodes);
})();