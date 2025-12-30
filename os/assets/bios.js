(() => {
  const tabs = ["Main","Advanced","Boot","Security","Save & Exit"];
  const state = {
    tab: 0,
    row: 0,
    dirty: false,
    values: {
      fastBoot: true,
      virtualization: true,
      boot1: "AlmostOS (NVMe)",
      boot2: "USB Storage",
      boot3: "Network (PXE)",
      secureBoot: false,
      adminPwd: false,
    }
  };

  const tabBar = document.getElementById("menubar");
  const mainTable = document.getElementById("mainTable");
  const sideTitle = document.getElementById("sideTitle");
  const sideBody = document.getElementById("sideBody");
  const footerMsg = document.getElementById("footerMsg");

  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const btnYes = document.getElementById("btnYes");
  const btnNo = document.getElementById("btnNo");

  const renderTabs = () => {
    tabBar.innerHTML = "";
    tabs.forEach((t,i)=>{
      const el = document.createElement("div");
      el.className = "tab" + (i===state.tab ? " active":"");
      el.textContent = t;
      tabBar.appendChild(el);
    });
  };

  const itemsForTab = (tab) => {
    const v = state.values;
    const now = new Date();
    const sysTime = now.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"});
    const sysDate = now.toLocaleDateString("ja-JP");
    if(tab===0){
      return [
        {k:"System Time", val: sysTime, ro:true, help:"システム時刻（参照のみ）"},
        {k:"System Date", val: sysDate, ro:true, help:"システム日付（参照のみ）"},
        {k:"CPU Type", val:"AlmostChip A1 @ 3.20GHz", ro:true, help:"CPU情報（仮）"},
        {k:"Total Memory", val:"8192 MB", ro:true, help:"メモリ容量（仮）"},
        {k:"SATA Mode", val:"AHCI", ro:true, help:"SATA動作モード"},
      ];
    }
    if(tab===1){
      return [
        {k:"Fast Boot", val: v.fastBoot ? "Enabled":"Disabled", toggle:"fastBoot", help:"起動時のチェックを簡略化します"},
        {k:"Virtualization", val: v.virtualization ? "Enabled":"Disabled", toggle:"virtualization", help:"仮想化支援機能（仮）"},
        {k:"USB Legacy Support", val:"Enabled", ro:true, help:"古いUSB入力互換（仮）"},
        {k:"S.M.A.R.T. Status", val:"Good", ro:true, help:"ストレージ健康状態（仮）"},
      ];
    }
    if(tab===2){
      return [
        {k:"Boot Option #1", val: v.boot1, cycle:"boot1", help:"最優先で起動するデバイス"},
        {k:"Boot Option #2", val: v.boot2, cycle:"boot2", help:"次に起動するデバイス"},
        {k:"Boot Option #3", val: v.boot3, cycle:"boot3", help:"最後に起動するデバイス"},
        {k:"Boot Menu Key", val:"F12", ro:true, help:"ブートメニュー表示キー"},
      ];
    }
    if(tab===3){
      return [
        {k:"Administrator Password", val: v.adminPwd ? "Set":"Not Set", toggle:"adminPwd", help:"管理者パスワード（ダミー）"},
        {k:"Secure Boot", val: v.secureBoot ? "Enabled":"Disabled", toggle:"secureBoot", help:"セキュアブート（ダミー）"},
        {k:"TPM", val:"Present", ro:true, help:"TPM（ダミー）"},
      ];
    }
    // Save & Exit
    return [
      {k:"Save Changes and Exit", val:"", action:"save", help:"変更を保存して終了し、起動します"},
      {k:"Discard Changes and Exit", val:"", action:"discard", help:"変更を破棄して終了し、起動します"},
      {k:"Load Optimized Defaults", val:"", action:"defaults", help:"推奨設定を読み込みます"},
    ];
  };

  const bootChoices = ["AlmostOS (NVMe)", "USB Storage", "Network (PXE)"];

  const renderTable = () => {
    const items = itemsForTab(state.tab);
    state.row = Math.max(0, Math.min(state.row, items.length-1));
    mainTable.innerHTML = "";
    items.forEach((it, idx) => {
      const tr = document.createElement("tr");
      if(idx === state.row) tr.classList.add("sel");
      const tdK = document.createElement("td");
      tdK.textContent = it.k;
      const tdV = document.createElement("td");
      tdV.style.textAlign = "right";
      tdV.textContent = it.val || "";
      tr.appendChild(tdK);
      tr.appendChild(tdV);
      mainTable.appendChild(tr);
    });

    // side/help
    const it = items[state.row];
    sideTitle.textContent = tabs[state.tab] + " Help";
    sideBody.innerHTML = `
      <div class="kv"><span>Navigation</span><span>← → ↑ ↓ / Enter / Esc</span></div>
      <div class="kv"><span>Save & Exit</span><span>F10</span></div>
      <hr/>
      <div class="sectionTitle">説明</div>
      <div class="small">${(it && it.help) ? it.help : "—"}</div>
      <hr/>
      <div class="sectionTitle">状態</div>
      <div class="small">${state.dirty ? "Changes: <b>Pending</b>" : "Changes: None"}</div>
    `;
    footerMsg.textContent = state.dirty ? "変更があります（F10で保存して起動）" : "Enterで操作 / F10で保存して起動";
    renderTabs();
  };

  const openModal = (title, body, onYes) => {
    modalTitle.textContent = title;
    modalBody.textContent = body;
    modal.style.display = "flex";
    const clean = () => {
      modal.style.display = "none";
      btnYes.onclick = null;
      btnNo.onclick = null;
    };
    btnYes.onclick = () => { clean(); onYes?.(); };
    btnNo.onclick = () => clean();
    btnYes.focus();
  };

  const doExit = (save) => {
    // If saving, just clear dirty (fake)
    if(save) state.dirty = false;
    // Return to boot (resume phase)
    const url = "boot.html?phase=resume";
    location.href = url;
  };

  const doDefaults = () => {
    state.values.fastBoot = true;
    state.values.virtualization = true;
    state.values.boot1 = "AlmostOS (NVMe)";
    state.values.boot2 = "USB Storage";
    state.values.boot3 = "Network (PXE)";
    state.values.secureBoot = false;
    state.values.adminPwd = false;
    state.dirty = true;
    renderTable();
  };

  const activateCurrent = () => {
    const items = itemsForTab(state.tab);
    const it = items[state.row];
    if(!it) return;

    if(it.toggle){
      state.values[it.toggle] = !state.values[it.toggle];
      state.dirty = true;
      renderTable();
      return;
    }
    if(it.cycle){
      const key = it.cycle;
      const cur = state.values[key];
      const idx = bootChoices.indexOf(cur);
      const next = bootChoices[(idx+1+bootChoices.length)%bootChoices.length];
      state.values[key] = next;
      state.dirty = true;
      renderTable();
      return;
    }
    if(it.action === "save"){
      openModal("Save & Exit", "変更を保存して終了し、起動しますか？", () => doExit(true));
      return;
    }
    if(it.action === "discard"){
      openModal("Discard Changes", state.dirty ? "変更を破棄して終了し、起動しますか？" : "終了して起動しますか？", () => doExit(false));
      return;
    }
    if(it.action === "defaults"){
      openModal("Load Optimized Defaults", "推奨設定を読み込みますか？", () => doDefaults());
      return;
    }
  };

  const goSaveExitTab = () => {
    state.tab = 4;
    state.row = 0;
    renderTable();
  };

  // Keys
  window.addEventListener("keydown", (e) => {
    if(modal.style.display === "flex"){
      if(e.key === "Escape"){ e.preventDefault(); modal.style.display = "none"; }
      return;
    }
    if(e.key === "ArrowLeft"){ e.preventDefault(); state.tab = (state.tab-1+tabs.length)%tabs.length; state.row = 0; renderTable(); }
    else if(e.key === "ArrowRight"){ e.preventDefault(); state.tab = (state.tab+1)%tabs.length; state.row = 0; renderTable(); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); state.row = Math.max(0, state.row-1); renderTable(); }
    else if(e.key === "ArrowDown"){ e.preventDefault(); state.row = state.row+1; renderTable(); }
    else if(e.key === "Enter"){ e.preventDefault(); activateCurrent(); }
    else if(e.key === "Escape"){
      e.preventDefault();
      // classic: jump to save&exit, then exit confirm
      if(state.tab !== 4){ goSaveExitTab(); }
      else{
        openModal("Exit Setup", state.dirty ? "変更を破棄して終了しますか？" : "終了して起動しますか？", () => doExit(false));
      }
    }
    else if((e.key || "").toLowerCase() === "f10"){
      e.preventDefault();
      openModal("Save & Exit (F10)", "変更を保存して終了し、起動しますか？", () => doExit(true));
    }
  });

  // Mouse support: click to select row
  mainTable.addEventListener("click", (ev) => {
    const tr = ev.target.closest("tr");
    if(!tr) return;
    const idx = Array.from(mainTable.children).indexOf(tr);
    if(idx >= 0){
      state.row = idx;
      renderTable();
    }
  });
  mainTable.addEventListener("dblclick", (ev) => {
    const tr = ev.target.closest("tr");
    if(!tr) return;
    const idx = Array.from(mainTable.children).indexOf(tr);
    if(idx >= 0){
      state.row = idx;
      activateCurrent();
    }
  });

  renderTabs();
  renderTable();
})();