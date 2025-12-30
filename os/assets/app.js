(() => {
  const stopcodes = Array.isArray(window.__STOPCODES__) ? window.__STOPCODES__ : [];
  const list = document.getElementById("stopcodeList");
  const search = document.getElementById("stopcodeSearch");
  const randomBtn = document.getElementById("randomStop");
  const resetBtn = document.getElementById("resetStop");

  const hamburger = document.getElementById("hamburger");
  const mobileNav = document.getElementById("mobileNav");

  const escapeHtml = (s) => String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

  const copyText = async (txt) => {
    try {
      await navigator.clipboard.writeText(String(txt));
      return true;
    } catch {
      // fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = String(txt);
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  };

  const filter = () => {
    const q = (search?.value || "").trim().toLowerCase();
    if (!q) return stopcodes;
    return stopcodes.filter(sc => {
      const hay = [sc.code, sc.desc, sc.when, sc.tip]
        .filter(Boolean)
        .map(v => String(v).toLowerCase())
        .join("\n");
      return hay.includes(q);
    });
  };

  const render = (items) => {
    if (!list) return;
    list.innerHTML = "";

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "card";
      empty.innerHTML = `<h3>見つかりませんでした</h3><p class="dim">スペル違いかも。英単語の一部でもOKです。</p>`;
      list.appendChild(empty);
      return;
    }

    items.forEach(sc => {
      const code = escapeHtml(sc.code || "");
      const desc = escapeHtml(sc.desc || "");
      const when = escapeHtml(sc.when || "");
      const tip = escapeHtml(sc.tip || "再起動");

      const el = document.createElement("div");
      el.className = "stopcard";
      el.innerHTML = `
        <div class="stopcard__head">
          <div class="stopcard__code">${code}</div>
          <button class="copy" type="button" aria-label="${code} をコピー" data-copy="${code}">Copy</button>
        </div>
        <div class="stopcard__desc">${desc}</div>
        ${when ? `<div class="stopcard__when"><strong>だいたいこんな時：</strong> ${when}</div>` : ""}
        <div class="stopcard__tip"><strong>対処：</strong> ${tip}</div>
      `;
      list.appendChild(el);
    });

    // wire copy buttons
    list.querySelectorAll("button.copy").forEach(btn => {
      btn.addEventListener("click", async () => {
        const v = btn.getAttribute("data-copy") || "";
        const ok = await copyText(v);
        const prev = btn.textContent;
        btn.textContent = ok ? "Copied" : "Copy?";
        btn.classList.add("ok");
        setTimeout(() => {
          btn.textContent = prev || "Copy";
          btn.classList.remove("ok");
        }, 900);
      });
    });
  };

  if (search) {
    search.addEventListener("input", () => render(filter()));
  }

  if (randomBtn) {
    randomBtn.addEventListener("click", () => {
      if (!stopcodes.length) return;
      const sc = stopcodes[Math.floor(Math.random() * stopcodes.length)];
      render([sc]);
      document.getElementById("stopcodes")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (search) search.value = "";
      render(stopcodes);
    });
  }

  // Mobile nav toggling
  const closeMobileNav = () => {
    if (!mobileNav || !hamburger) return;
    if (!mobileNav.hasAttribute("hidden")) {
      mobileNav.setAttribute("hidden", "");
      hamburger.setAttribute("aria-expanded", "false");
    }
  };

  if (hamburger && mobileNav) {
    hamburger.addEventListener("click", () => {
      const isHidden = mobileNav.hasAttribute("hidden");
      if (isHidden) {
        mobileNav.removeAttribute("hidden");
        hamburger.setAttribute("aria-expanded", "true");
      } else {
        closeMobileNav();
      }
    });

    // close menu on click
    mobileNav.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => closeMobileNav());
    });

    // close on escape
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMobileNav();
    });

    // close on outside click
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t) return;
      if (mobileNav.hasAttribute("hidden")) return;
      if (mobileNav.contains(t) || hamburger.contains(t)) return;
      closeMobileNav();
    });
  }

  // smooth scroll + close menu (fallback for browsers without CSS scroll-behavior)
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      closeMobileNav();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.pushState(null, "", href);
    });
  });

  // initial render
  render(stopcodes);
})();
