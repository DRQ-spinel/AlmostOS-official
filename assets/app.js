(() => {
  const toast = (msg) => {
    let el = document.querySelector(".toast");
    if(!el) return;
    el.textContent = msg;
    el.classList.add("show");
    window.clearTimeout(el.__t);
    el.__t = window.setTimeout(() => el.classList.remove("show"), 2000);
  };

  // Smooth anchor scroll (nice but optional)
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if(id.length <= 1) return;
      const target = document.querySelector(id);
      if(!target) return;
      e.preventDefault();
      target.scrollIntoView({behavior:"smooth", block:"start"});
      history.pushState(null, "", id);
    });
  });

  // Copy helper
  document.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || "";
      try{
        await navigator.clipboard.writeText(text);
        toast("コピーしました");
      }catch{
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast("コピーしました");
      }
    });
  });

  // Status badge demo (static site, but feels alive)
  const status = document.querySelector("[data-status]");
  if(status){
    const now = new Date();
    const mins = now.getMinutes();
    // deterministically vary between "Operational" and "Degraded" a tiny bit
    const mode = (mins % 17 === 0) ? "degraded" : "ok";
    if(mode === "ok"){
      status.innerHTML = '<span class="dot"></span> Operational';
    }else{
      status.innerHTML = '<span class="dot warn"></span> Degraded (partial)';
    }
  }
})();
