(() => {
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];

  const desktop = $("#desktop");
  const iconGrid = $("#iconGrid");
  const taskApps = $("#taskApps");
  const startBtn = $("#startBtn");
  const startMenu = $("#startMenu");
  const menuGrid = $("#menuGrid");
  const search = $("#search");
  const clock = $("#clock");
  const toast = $("#toast");
  const quickBtn = $("#quickBtn");
  const quickPanel = $("#quickPanel");
  const swGlow = $("#swGlow");
  const swReduceMotion = $("#swReduceMotion");
  const swHint = $("#swHint");
  const swSnap = $("#swSnap");
  const wallpaperHint = $("#wallpaperHint");
  const filePicker = $("#filePicker");

  const snapOverlay = $("#snapOverlay");
  const contextMenu = $("#contextMenu");

  const splash = $("#splash");
  const lockScreen = $("#lockScreen");
  const lockClock = $("#lockClock");
  const lockDate = $("#lockDate");
  const lockUser = $("#lockUser");
  const lockHint = $("#lockHint");
  const pinRow = $("#pinRow");
  const pinInput = $("#pinInput");
  const unlockBtn = $("#unlockBtn");
  const enterBtn = $("#enterBtn");
  const setPinBtn = $("#setPinBtn");
  const pinErr = $("#pinErr");




  // Base snapshot (for clean HTML export)
  const baseSnapshot = (() => {
    const dt = document.doctype ? `<!doctype ${document.doctype.name}>` : "<!doctype html>";
    return dt + "\\n" + document.documentElement.outerHTML;
  })();

  const storeKey = "almostos_state_v2";
  const filesKey = "almostos_files_v1";
  const notesKey = "almostos_notes_v1";
  const customAppsKey = "almostos_custom_apps_v1";
  const lockKey = "almostos_lock_v1";
  const iconPosKey = "almostos_iconpos_v1";

  const state = {
    z: 10,
    windows: new Map(),     // id -> {el, appId, title, minimized, maximized, rect}
    order: [],              // ids order for taskbar
    activeId: null,
    settings: {
      glow: false,
      reduceMotion: false,
      hint: true,
      snapGrid: false,
    }
  };

  // ---- Process IDs (for Task Manager) ----
  let pidSeq = 1200;
  function allocPid(){ return pidSeq++; }


  // v5.3: respect OS-level motion preference from the start
  try{
    const prm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if(prm && prm.matches) state.settings.reduceMotion = true;
  }catch(_){}

  // ---- Custom Apps Store ----
  // Each custom app: {id,name,glyph,sub,html,installedAt,filename}
  let customApps = loadCustomApps();

  function loadCustomApps(){
    const raw = localStorage.getItem(customAppsKey);
    if(!raw) return [];
    try{
      const arr = JSON.parse(raw);
      if(!Array.isArray(arr)) return [];
      // light validation
      return arr.filter(a => a && typeof a.id==="string" && typeof a.name==="string" && typeof a.html==="string")
        .map(a => ({
          id: a.id,
          name: a.name,
          glyph: typeof a.glyph==="string" ? a.glyph : "🧩",
          sub: typeof a.sub==="string" ? a.sub : "Custom App",
          html: a.html,
          installedAt: a.installedAt || Date.now(),
          filename: a.filename || ""
        }));
    }catch(e){ return []; }
  }
  function persistCustomApps(){
    localStorage.setItem(customAppsKey, JSON.stringify(customApps));
  }
  function upsertCustomApp(app){
    const i = customApps.findIndex(a=>a.id===app.id);
    if(i>=0) customApps[i] = {...customApps[i], ...app, installedAt: customApps[i].installedAt || Date.now()};
    else customApps.push({...app, installedAt: Date.now()});
    persistCustomApps();
    renderDesktopIcons();
    renderMenu();
  }
  function removeCustomApp(id){
    customApps = customApps.filter(a=>a.id!==id);
    persistCustomApps();
    renderDesktopIcons();
    renderMenu();
  }

  // ---- Built-in Apps ----
  const builtins = [
    { id:"about", name:"About", glyph:"🪐", sub:"このOS(もどき)について", open: () => openAbout() },
    { id:"appcenter", name:"App Center", glyph:"🧩", sub:"インストール/管理", open: () => openAppCenter() },
    { id:"files", name:"Files", glyph:"🗂️", sub:"それっぽいファイル管理", open: () => openFiles() },
    { id:"notes", name:"Notes", glyph:"📝", sub:"ローカル保存メモ", open: () => openNotes() },
    { id:"terminal", name:"Terminal", glyph:"⌘", sub:"マジっぽく見えるやつ", open: () => openTerminal() },
    { id:"taskmgr", name:"Task Manager", glyph:"📊", sub:"プロセス / パフォーマンス", open: () => openTaskManager() },
    { id:"browser", name:"Browser", glyph:"🌐", sub:"一応使えるブラウザ", open: () => openBrowser() },
    { id:"settings", name:"Settings", glyph:"⚙️", sub:"見た目をいじる", open: () => openSettings() },
    { id:"calculator", name:"Calculator", glyph:"🧮", sub:"四則演算", open: () => openCalculator() },
    { id:"clocktools", name:"Clock", glyph:"⏱️", sub:"タイマー / ストップウォッチ", open: () => openClockTools() },
    { id:"converter", name:"Converter", glyph:"🔁", sub:"単位変換", open: () => openConverter() },
    { id:"calendar", name:"Calendar", glyph:"🗓️", sub:"月表示カレンダー", open: () => openCalendar() },
    { id:"passgen", name:"Password", glyph:"🔐", sub:"パスワード生成", open: () => openPassGen() },

    { id:"game2048", name:"2048", glyph:"🟧", sub:"スライドパズル", open: () => openGame2048() },
    { id:"mines", name:"Mines", glyph:"💣", sub:"マインスイーパー", open: () => openMines() },
    { id:"snake", name:"Snake", glyph:"🐍", sub:"クラシック", open: () => openSnake() },
  ];

  function allApps(){
    // Convert custom apps into same shape
    const customs = customApps.map(a => ({
      id: a.id,
      name: a.name,
      glyph: a.glyph || "🧩",
      sub: a.sub || "Custom App",
      open: () => openCustomApp(a.id)
    }));
    return [...builtins, ...customs];
  }

  // ---- Fake File System ----
  const fileSystem = {
    "/" : { type:"dir", children:["home","system","bin","etc","var","readme.txt"] },
    "/home": { type:"dir", children:["notes.txt","todo.txt","wallpaper.why",".almostshrc","apps"] },
    "/home/apps": { type:"dir", children:["welcome.aosapp"] },
    "/system": { type:"dir", children:["kernel.log","drivers","config.ini"] },
    "/system/drivers": { type:"dir", children:["gpu.drv","audio.drv","wifi.drv"] },
    "/bin": { type:"dir", children:["ls","cat","rm","neofetch","fortune","echo"] },
    "/etc": { type:"dir", children:["motd","issue","hosts"] },
    "/var": { type:"dir", children:["log"] },
    "/var/log": { type:"dir", children:["boot.log","auth.log","app.log"] },

    "/etc/motd": { type:"file", content:"Welcome to AlmostOS.\nType: help / neofetch / ls / cat / open <app>\n(※これは擬似環境です)" },
    "/etc/issue": { type:"file", content:"AlmostOS 6.7 (mock)\nKernel: almostos.sys\n" },
    "/etc/hosts": { type:"file", content:"127.0.0.1\tlocalhost\n127.0.1.1\talmostos\n" },

    "/var/log/boot.log": { type:"file", content:"[0.000] boot: firmware init\n[0.012] boot: loading almostos.sys\n[0.420] wm: compositing on\n[0.777] ok: hello world\n" },
    "/var/log/auth.log": { type:"file", content:"Dec 30 00:00:00 login: session opened for user Guest\n" },
    "/var/log/app.log": { type:"file", content:"(empty)\n" },

    "/bin/ls": { type:"file", content:"# almostsh builtin: ls\n# (this is a prop file)\n" },
    "/bin/cat": { type:"file", content:"# almostsh builtin: cat\n" },
    "/bin/rm": { type:"file", content:"# almostsh builtin: rm\n# please be gentle\n" },
    "/bin/neofetch": { type:"file", content:"# almostsh builtin: neofetch\n" },
    "/bin/fortune": { type:"file", content:"# almostsh builtin: fortune\n" },
    "/bin/echo": { type:"file", content:"# almostsh builtin: echo\n" },

    "/readme.txt": { type:"file", content:
`AlmostOSへようこそ。

これは「中途半端にマジっぽいGUI型OS(もどき)」です。
・ウィンドウはドラッグで移動
・右下をドラッグでリサイズ
・ダブルクリックで最大化/戻す
・Ctrl+Space でStart
・Ctrl+&#96; でTerminal（環境によってはBackquoteキー）
・Ctrl+S で状態保存

NEW:
・拡張子だけ変えたHTMLを「アプリ」としてインストールできます
  Start → Install / App Center から読み込み
  インストール済みアプリはlocalStorageに保存され、次回も即起動できます。`
    },
    "/home/notes.txt": { type:"file", content:"メモ：ここは架空の /home。Filesアプリで編集できるよ。" },
    "/home/todo.txt": { type:"file", content:"- [ ] それっぽいUI\n- [ ] それっぽい挙動\n- [ ] それっぽいログ\n- [x] カスタムアプリ読み込み" },
    "/home/wallpaper.why": { type:"file", content:"壁紙は、雰囲気が9割。" },
    "/home/.almostshrc": { type:"file", content:"# almostsh rc\nalias ll=\"ls -l\"\nalias cls=\"clear\"\n# tip: rm -rf /* is a trap\n" },
    "/system/kernel.log": { type:"file", content:"[0.000] almostos: boot sequence init...\n[0.133] gpu: pseudo acceleration enabled\n[0.420] wm: compositing on\n[0.777] ok: hello world" },
    "/system/config.ini": { type:"file", content:"[ui]\naccent=violet\nblur=12\n[wm]\nclick_to_focus=true" },
    "/system/drivers/gpu.drv": { type:"file", content:"driver=gpu_mock\nversion=1.0.0" },
    "/system/drivers/audio.drv": { type:"file", content:"driver=audio_mock\nversion=1.0.0" },
    "/system/drivers/wifi.drv": { type:"file", content:"driver=wifi_mock\nversion=1.0.0" },

    // sample "app file" (HTML disguised)
    "/home/apps/welcome.aosapp": { type:"file", content:
`<!--ALMOSTOS_APP
{"id":"welcome","name":"Welcome App","glyph":"🎛️","sub":"デモ用カスタムアプリ"}
-->
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome App</title>
  <style>
    body{font-family:system-ui, sans-serif; margin:0; padding:16px; background:#0f1220; color:#fff}
    .card{background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.14); border-radius:16px; padding:14px}
    button{padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.16); background:rgba(124,92,255,.25); color:#fff; cursor:pointer}
  
    body.reduce-motion *, body.reduce-motion *::before, body.reduce-motion *::after{
      animation-duration:0.001ms !important;
      animation-iteration-count:1 !important;
      transition-duration:0.001ms !important;
      scroll-behavior:auto !important;
    }

  </style>
</head>
<body>
  <div class="card">
    <h2 style="margin:0 0 8px">Welcome App</h2>
    <p style="opacity:.8; line-height:1.55">これは「拡張子だけ変えたHTML」アプリの例です。<br>ヘッダの <code>ALMOSTOS_APP</code> コメント内にmanifest(JSON)を書いてね。</p>
    <button id="ping">ping parent</button>
  </div>
  <script>
    document.getElementById('ping').addEventListener('click', () => {
      parent.postMessage({ type:'almostos:toast', message:'Hello from Welcome App 👋' }, '*');
    });
  <\/script>
</body>
</html>`
    },
  };

  // ---- Clock ----
  function nowStr(){
    const d = new Date();
    const pad = (n)=>String(n).padStart(2,"0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  setInterval(()=> clock.textContent = nowStr(), 200);
  clock.textContent = nowStr();

  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=> toast.classList.remove("show"), 1600);
  }

  // allow custom apps to request toast via postMessage
  window.addEventListener("message", (ev)=>{
    const d = ev.data;
    if(d && d.type==="almostos:toast" && typeof d.message==="string"){
      showToast(d.message);
    }
  });

  // ---- Persistence ----
  // ---- Splash & Lock Screen ----
  let lockInfo = loadLockInfo();

  function loadLockInfo(){
    try{
      const raw = localStorage.getItem(lockKey);
      if(!raw) return { hasPin:false, pinHash:null, requireLogin:true };
      const v = JSON.parse(raw);
      return {
        hasPin: !!v.hasPin,
        pinHash: v.pinHash || null,
        requireLogin: (v.requireLogin!==false),
        displayName: v.displayName || "Guest",
      };
    }catch(_){
      return { hasPin:false, pinHash:null, requireLogin:true, displayName:"Guest" };
    }
  }
  function saveLockInfo(){
    try{
      localStorage.setItem(lockKey, JSON.stringify(lockInfo));
    }catch(_){}
  }

  function fmtLockDate(d=new Date()){
    const w = ["日","月","火","水","木","金","土"][d.getDay()];
    const pad = (n)=> String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} (${w})`;
  }
  function fmtLockTime(d=new Date()){
    const pad = (n)=> String(n).padStart(2,"0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function updateLockClock(){
    if(!lockClock || !lockDate) return;
    const d = new Date();
    lockClock.textContent = fmtLockTime(d);
    lockDate.textContent = fmtLockDate(d);
  }
  setInterval(updateLockClock, 1000);

  function hideSplash(){
    if(!splash) return;
    splash.classList.add("hide");
    setTimeout(()=> splash.remove(), 600);
  }

  function showLock(){
    if(!lockScreen) return;
    lockInfo = loadLockInfo();
    if(lockUser) lockUser.textContent = lockInfo.displayName || "Guest";
    updateLockClock();
    pinErr.textContent = "";
    if(lockInfo.hasPin){
      pinRow.style.display = "";
      enterBtn.textContent = "Unlock";
      lockHint.textContent = "PINを入力して Enter";
      setTimeout(()=> { pinInput.focus(); }, 0);
    }else{
      pinRow.style.display = "none";
      enterBtn.textContent = "Enter";
      lockHint.textContent = "クリック / Enter でログイン（PIN未設定）";
    }
    lockScreen.classList.add("show");
    closeStart();
    quickPanel.classList.remove("show");
  }

  function hideLock(){
    if(!lockScreen) return;
    lockScreen.classList.remove("show");
    pinErr.textContent = "";
    if(pinInput) pinInput.value = "";
  }


  // Fail-safe: どこかで例外が出ても「starting up…」で固まらないようにする
  window.addEventListener("error", (ev)=>{
    try{ console.error("AlmostOS error:", (ev && (ev.error || ev.message)) || ev); }catch(_){}
    try{ hideSplash(); showLock(); }catch(_){}
  });
  window.addEventListener("unhandledrejection", (ev)=>{
    try{ console.error("AlmostOS promise rejection:", (ev && ev.reason) || ev); }catch(_){}
    try{ hideSplash(); showLock(); }catch(_){}
  });

  function sha256Hex(str){
    try{
      if(!(crypto && crypto.subtle && crypto.subtle.digest)) return Promise.resolve("plain:" + String(str));
      const buf = new TextEncoder().encode(String(str));
      return crypto.subtle.digest("SHA-256", buf).then(h=>{
        return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("");
      });
    }catch(_){
      return Promise.resolve("plain:" + String(str));
    }
  }

  function setPin(pin){
    const p = String(pin || "").trim();
    if(p.length < 4) throw new Error("PINは4文字以上が推奨");
    return sha256Hex(p).then(hex=>{
      lockInfo.hasPin = true;
      lockInfo.pinHash = hex;
      lockInfo.requireLogin = true;
      saveLockInfo();
      showToast("PINを設定しました");
      showLock();
    });
  }

  function attemptUnlock(){
    lockInfo = loadLockInfo();
    if(!lockInfo.hasPin){
      hideLock();
      return;
    }
    const p = String(pinInput.value || "").trim();
    if(!p){
      pinErr.textContent = "PINを入力してね";
      pinInput.focus();
      return;
    }
    sha256Hex(p).then(hex=>{
      if(hex === lockInfo.pinHash){
        hideLock();
      }else{
        pinErr.textContent = "PINが違うかも";
        pinInput.value = "";
        pinInput.focus();
      }
    });
  }

  function lockNow(){
    showLock();
  }

  // lock screen interactions
  if(lockScreen){
    lockScreen.addEventListener("pointerdown", (e)=>{
      // click background to reveal PIN input + focus
      if(lockInfo.hasPin && pinRow && pinRow.style.display==="none"){
        pinRow.style.display = "";
      }
      if(lockInfo.hasPin){ setTimeout(()=> pinInput.focus(), 0); }
    }, { passive:true });
  }
  if(enterBtn){
    enterBtn.addEventListener("click", ()=> attemptUnlock());
  }
  if(unlockBtn){
    unlockBtn.addEventListener("click", ()=> attemptUnlock());
  }
  if(pinInput){
    pinInput.addEventListener("keydown", (e)=>{
      if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); attemptUnlock(); }
    });
  }
  if(setPinBtn){
    setPinBtn.addEventListener("click", ()=>{
      const p = prompt("新しいPIN（4文字以上）を入力:");
      if(p===null) return;
      const p2 = prompt("確認でもう一度:");
      if(p2===null) return;
      if(p !== p2){ pinErr.textContent="PINが一致しません"; return; }
      try{
        setPin(p);
      }catch(err){
        pinErr.textContent = String(err?.message || err);
      }
    });
  }

  function saveAll(){
    const payload = {
      order: state.order,
      activeId: state.activeId,
      z: state.z,
      windows: [...state.windows.entries()].map(([id,w]) => ({
        id, appId:w.appId, title:w.title,
        minimized:w.minimized, maximized:w.maximized,
        rect: w.rect || rectOf(w.el),
      })),
      settings: state.settings
    };
    localStorage.setItem(storeKey, JSON.stringify(payload));
    localStorage.setItem(filesKey, JSON.stringify(serializeFS()));
    localStorage.setItem(notesKey, JSON.stringify({ notes: getNotesText() }));
    // custom apps are persisted immediately on install, but keep safe
    persistCustomApps();
    showToast("保存しました（localStorage）");
  }


  // ---- Export ----
  // Download this AlmostOS as a single HTML file (handy for sharing / backups)

  function downloadThisHTML(filename="AlmostOS.html", includeState=false){
    // Export this AlmostOS as a single HTML file.
    // includeState=true will embed localStorage payload (state/files/notes/custom apps).
    let html = baseSnapshot;

    const utf8ToB64 = (s)=> btoa(unescape(encodeURIComponent(String(s))));

    if(includeState){
      const pack = {
        meta: { exportedAt: Date.now(), name: "AlmostOS Export" },
        items: {
          [storeKey]: localStorage.getItem(storeKey),
          [filesKey]: localStorage.getItem(filesKey),
          [notesKey]: localStorage.getItem(notesKey),
          [customAppsKey]: localStorage.getItem(customAppsKey),
          [lockKey]: localStorage.getItem(lockKey),
        }
      };
      const b64 = utf8ToB64(JSON.stringify(pack));

      // avoid literal "</scr"+"ipt>" in inline JS source (HTML parser issue)
      const injector = `\n<script id="almostos-import-pack">\n(() => {\n  try{\n    const pack = JSON.parse(decodeURIComponent(escape(atob("${b64}"))));\n    const items = (pack && pack.items) ? pack.items : {};\n    const force = location.hash.includes("import");\n    const hasAny = Object.keys(items).some(k => localStorage.getItem(k) !== null);\n    if(force || !hasAny){\n      for(const [k,v] of Object.entries(items)){\n        if(typeof v === "string") localStorage.setItem(k, v);\n      }\n      if(force){\n        if(location.hash.includes("import")) location.hash = location.hash.replace("import","imported");\n      }\n    }\n  }catch(e){}\n})();\n</` + "script>\n";

      const marker = "\n<script>\n(() => {";
      const i = html.indexOf(marker);
      html = (i>=0) ? (html.slice(0,i) + injector + html.slice(i)) : (injector + html);
    }

    const blob = new Blob([html], {type:"text/html;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
    showToast(includeState ? "HTMLを書き出しました（状態入り）" : "HTMLを書き出しました");
  }

  function loadAll(){
    const raw = localStorage.getItem(storeKey);
    if(raw){
      try{
        const payload = JSON.parse(raw);
        if(payload?.settings) state.settings = {...state.settings, ...payload.settings};
        applySettings();

        if(Array.isArray(payload?.windows)){
          payload.windows.forEach(w => {
            const app = allApps().find(a=>a.id===w.appId);
            if(app){
              app.open();
              const id = state.order[state.order.length-1];
              const ww = state.windows.get(id);
              if(ww && w.rect) applyRect(ww.el, w.rect);
              if(ww){
                ww.minimized = !!w.minimized;
                ww.maximized = !!w.maximized;
                if(ww.minimized) ww.el.classList.add("hidden");
                if(ww.maximized) maximize(id, true);
                setTitle(id, w.title || app.name);
              }
            }
          });
          if(payload.activeId && state.windows.has(payload.activeId)) focus(payload.activeId);
        }
      }catch(e){
        applySettings();
      }
    } else {
      applySettings();
    }

    const fsRaw = localStorage.getItem(filesKey);
    if(fsRaw){
      try{ hydrateFS(JSON.parse(fsRaw)); }catch(e){}
    }

    const nRaw = localStorage.getItem(notesKey);
    if(nRaw){
      try{
        const n = JSON.parse(nRaw);
        if(typeof n?.notes === "string") state._savedNotes = n.notes;
      }catch(e){}
    }
  }

  function serializeFS(){
    const obj = {};
    for(const [path,node] of Object.entries(fileSystem)){
      obj[path] = { type: node.type };
      if(node.type==="dir") obj[path].children = [...node.children];
      if(node.type==="file") obj[path].content = node.content;
    }
    return obj;
  }
  function hydrateFS(obj){
    for(const k of Object.keys(fileSystem)) delete fileSystem[k];
    for(const [path,node] of Object.entries(obj)){
      fileSystem[path] = node;
    }
  }

  // ---- Settings ----
  function applySettings(){
    document.documentElement.style.setProperty("--blur", state.settings.reduceMotion ? "0px" : "12px");
    document.body.style.filter = state.settings.glow ? "saturate(1.08) brightness(1.02)" : "";
    document.body.classList.toggle("reduce-motion", !!state.settings.reduceMotion);
    document.body.classList.toggle("glow-on", !!state.settings.glow);
    wallpaperHint.style.display = state.settings.hint ? "flex" : "none";
    setSwitch(swGlow, state.settings.glow);
    setSwitch(swReduceMotion, state.settings.reduceMotion);
    setSwitch(swHint, state.settings.hint);
    if(swSnap) setSwitch(swSnap, state.settings.snapGrid);
    updateContextMenuHints();
  }
  function setSwitch(el, on){
    el.classList.toggle("on", !!on);
    el.setAttribute("aria-checked", !!on ? "true" : "false");
  }
  function toggleSwitch(key){
    state.settings[key] = !state.settings[key];
    applySettings();
    saveAll();
  }
  swGlow.addEventListener("click", ()=> toggleSwitch("glow"));
  swReduceMotion.addEventListener("click", ()=> toggleSwitch("reduceMotion"));
  swHint.addEventListener("click", ()=> toggleSwitch("hint"));
  if(swSnap) swSnap.addEventListener("click", ()=> toggleSwitch("snapGrid"));

  // ---- Start Menu ----
  function openStart(){
    startMenu.classList.add("show");
    search.value = "";
    renderMenu();
    setTimeout(()=> search.focus(), 0);
  }
  function closeStart(){ startMenu.classList.remove("show"); }
  function toggleStart(){ startMenu.classList.contains("show") ? closeStart() : openStart(); }
  startBtn.addEventListener("click", (e)=>{ e.stopPropagation(); toggleStart(); });

  document.addEventListener("click", (e)=>{
    if(!startMenu.contains(e.target) && e.target!==startBtn) closeStart();
    if(!quickPanel.contains(e.target) && e.target!==quickBtn) quickPanel.classList.remove("show");
    if(contextMenu && !contextMenu.contains(e.target)) contextMenu.classList.remove("show");
  });

  
  // ---- Desktop context menu (right click) + snap preview ----
  function closeContextMenu(){ contextMenu.classList.remove("show"); }
  function openContextMenu(x,y){
    contextMenu.classList.add("show");
    const pad = 12;
    const r = contextMenu.getBoundingClientRect();
    let nx = Math.min(x, window.innerWidth - r.width - pad);
    let ny = Math.min(y, window.innerHeight - r.height - 90);
    nx = Math.max(pad, nx);
    ny = Math.max(pad, ny);
    contextMenu.style.left = nx + "px";
    contextMenu.style.top = ny + "px";
  }

  function showSnap(type){
    if(!type){ hideSnap(); return; }
    snapOverlay.classList.add("show");
    snapOverlay.dataset.snap = type;

    const vw = window.innerWidth, vh = window.innerHeight;
    const h = Math.max(260, vh - 110);
    const wFull = Math.max(420, vw - 36);
    const wHalf = Math.floor(wFull/2);
    const top = 18, left = 18;

    if(type==="max"){
      Object.assign(snapOverlay.style, { left:left+"px", top:top+"px", width:wFull+"px", height:h+"px" });
    }
    if(type==="left"){
      Object.assign(snapOverlay.style, { left:left+"px", top:top+"px", width:wHalf+"px", height:h+"px" });
    }
    if(type==="right"){
      Object.assign(snapOverlay.style, { left:(left+wHalf)+"px", top:top+"px", width:wHalf+"px", height:h+"px" });
    }
  }
  function hideSnap(){
    snapOverlay.classList.remove("show");
    snapOverlay.dataset.snap = "";
  }

  function applySnap(id, type){
    const w = state.windows.get(id);
    if(!w || !type) return;
    if(w.fullscreen) toggleFullscreen(id);
    if(type==="max"){ maximize(id, true); return; }

    w.rect = w.rect || rectOf(w.el);
    w.maximized = false;

    const vw = window.innerWidth, vh = window.innerHeight;
    const h = Math.max(260, vh - 110);
    const wFull = Math.max(420, vw - 36);
    const wHalf = Math.floor(wFull/2);
    const top = 18, left = 18;

    if(type==="left")  applyRect(w.el, { x:left, y:top, w:wHalf, h });
    if(type==="right") applyRect(w.el, { x:left+wHalf, y:top, w:wHalf, h });

    focus(id);
  }

  desktop.addEventListener("contextmenu", (e)=>{
    if(e.target.closest(".win")) return;
    e.preventDefault();
    closeStart();
    quickPanel.classList.remove("show");

    // Right-click: keep icon selection (Windows-like)
    const icon = e.target.closest(".desk-icon");
    if(icon){
      if(!isIconSelected(icon)){
        clearIconSelection();
        selectIconEl(icon, true);
      }
    }else{
      clearIconSelection();
    }

    updateContextMenuHints();
    openContextMenu(e.clientX, e.clientY);
  });

  contextMenu.addEventListener("click", (e)=>{
    const item = e.target.closest(".ctx-item");
    if(!item) return;
    const act = item.dataset.act;

    if(act==="start") toggleStart();
    if(act==="notes") openNotes();
    if(act==="appcenter") openAppCenter();
    if(act==="lock") lockNow();

    if(act==="save") saveAll();
    if(act==="export") downloadThisHTML("AlmostOS.html", !!e.shiftKey);

    if(act==="toggleGlow") toggleSwitch("glow");
    if(act==="toggleReduce") toggleSwitch("reduceMotion");
    if(act==="toggleHint") toggleSwitch("hint");
    if(act==="toggleSnap") toggleSwitch("snapGrid");
    if(act==="alignGrid") alignIconsToGrid();
    if(act==="resetIcons") resetIconLayout();

    closeContextMenu();
  });


let menuEls = [];
  let menuSel = 0;

  function setMenuSelection(i){
    menuEls = [...menuGrid.children];
    if(!menuEls.length){ menuSel = 0; return; }
    menuSel = Math.max(0, Math.min(menuEls.length-1, i));
    menuEls.forEach((el, idx)=> el.classList.toggle("selected", idx===menuSel));
    const el = menuEls[menuSel];
    if(el) el.scrollIntoView({ block:"nearest" });
  }

  function renderMenu(){
    const q = search.value.trim().toLowerCase();
    menuGrid.innerHTML = "";
    const apps = allApps();
    const filtered = apps.filter(a => {
      if(!q) return true;
      return (a.name+" "+a.sub+" "+a.id).toLowerCase().includes(q);
    });
    filtered.forEach((app, idx) => {
      const d = document.createElement("div");
      d.className = "menu-item";
      d.dataset.index = String(idx);
      d.innerHTML = `
        <div class="mi-glyph">${escapeHtml(app.glyph)}</div>
        <div class="mi-title">${escapeHtml(app.name)}</div>
        <div class="mi-sub">${escapeHtml(app.sub)}</div>
      `;
      d.addEventListener("click", ()=>{
        app.open();
        closeStart();
      });
      d.addEventListener("mouseenter", ()=> setMenuSelection(idx));
      menuGrid.appendChild(d);
    });
    setMenuSelection(0);
  }
  search.addEventListener("input", renderMenu);
  search.addEventListener("keydown", (e)=>{
    if(!startMenu.classList.contains("show")) return;
    if(e.key==="ArrowDown"){ e.preventDefault(); setMenuSelection(menuSel+1); }
    if(e.key==="ArrowUp"){ e.preventDefault(); setMenuSelection(menuSel-1); }
    if(e.key==="Enter"){
      const el = menuEls[menuSel];
      if(el){ e.preventDefault(); el.click(); }
    }
  });

  // ---- Quick panel ----
  quickBtn.addEventListener("click", (e)=>{
    e.stopPropagation();
    quickPanel.classList.toggle("show");
  });

  // ---- Desktop icons ----
  // Clear selection when clicking the desktop background
  function clearIconSelectionOnBackground(e){
    if(e.target.closest(".desk-icon")) return;
    if(e.target.closest(".win")) return;
    if(startMenu.contains(e.target)) return;
    if(quickPanel.contains(e.target)) return;
    if(contextMenu.contains(e.target)) return;
    // left-click or touch only
    if(e.pointerType==="mouse" && e.button !== 0) return;
    clearIconSelection();
  }
  desktop.addEventListener("pointerdown", clearIconSelectionOnBackground);


  // Free-move desktop icons (persist with localStorage)
  function loadIconPosMap(){
    const raw = localStorage.getItem(iconPosKey);
    if(!raw) return {};
    try{
      const obj = JSON.parse(raw);
      return (obj && typeof obj === "object") ? obj : {};
    }catch(_){ return {}; }
  }
  function saveIconPosMap(map){
    try{ localStorage.setItem(iconPosKey, JSON.stringify(map)); }catch(_){}
  }
  function setIconXY(el, x, y){
    const xx = Math.round(x), yy = Math.round(y);
    el.style.left = xx + "px";
    el.style.top = yy + "px";
    el.dataset.x = String(xx);
    el.dataset.y = String(yy);
  }
  function getIconXY(el){
    const x = Number(el.dataset.x);
    const y = Number(el.dataset.y);
    return {
      x: Number.isFinite(x) ? x : (parseFloat(el.style.left) || 0),
      y: Number.isFinite(y) ? y : (parseFloat(el.style.top) || 0),
    };
  }

  // Selection + grid snap (desktop icons)
  let selectedIconIds = new Set();
  let lastSelectedIdx = -1;

  function isIconSelected(el){
    const id = el?.dataset?.appId;
    return !!id && selectedIconIds.has(id);
  }
  function selectIconEl(el, on){
    const id = el?.dataset?.appId;
    if(!id) return;
    if(on) selectedIconIds.add(id);
    else selectedIconIds.delete(id);
    el.classList.toggle("selected", !!on);
  }
  function clearIconSelection(){
    selectedIconIds = new Set();
    lastSelectedIdx = -1;
    $$(".desk-icon.selected", iconGrid).forEach(el=> el.classList.remove("selected"));
  }
  function syncIconSelectionToDOM(){
    const icons = $$(".desk-icon", iconGrid);
    icons.forEach(el=> el.classList.toggle("selected", isIconSelected(el)));
  }
  function selectedIconEls(fallbackEl=null){
    const icons = $$(".desk-icon", iconGrid);
    const els = icons.filter(el => isIconSelected(el));
    if(els.length) return els;
    if(fallbackEl) return [fallbackEl];
    return [];
  }

  function gridMetrics(){
    const icons = $$(".desk-icon", iconGrid);
    const first = icons[0];
    const iconW = first?.offsetWidth || 92;
    const iconH = first?.offsetHeight || 92;
    const gap = 14;
    const stepX = iconW + gap;
    const stepY = iconH + gap;
    const cols = Math.max(1, Math.floor((iconGrid.clientWidth - 2) / stepX));
    return { stepX, stepY, cols };
  }
  function snapXY(x,y){
    if(!state.settings.snapGrid) return { x, y };
    const { stepX, stepY } = gridMetrics();
    return {
      x: Math.round(x / stepX) * stepX,
      y: Math.round(y / stepY) * stepY,
    };
  }

  function updateContextMenuHints(){
    const snapHint = document.getElementById("snapHint");
    if(snapHint) snapHint.textContent = state.settings.snapGrid ? "on" : "off";
  }
  function persistIconLayout(){
    const icons = $$(".desk-icon", iconGrid);
    const map = {};
    icons.forEach(el=>{
      const id = el.dataset.appId || "";
      if(!id) return;
      const xy = getIconXY(el);
      map[id] = { x: xy.x, y: xy.y };
    });
    saveIconPosMap(map);
  }
  function applyIconLayout(){
    const saved = loadIconPosMap();
    const icons = $$(".desk-icon", iconGrid);
    if(!icons.length) return;

    // Measure icon size from the first element (includes label/sub)
    const first = icons[0];
    const iconW = first.offsetWidth || 92;
    const iconH = first.offsetHeight || 92;
    const gap = 14;
    const cellW = iconW + gap;
    const cellH = iconH + gap;
    const cols = Math.max(1, Math.floor((iconGrid.clientWidth - 2) / cellW));

    // Place icons: keep saved positions; otherwise fall back to a simple grid
    let fallbackIndex = 0;
    icons.forEach((el, idx)=>{
      const id = el.dataset.appId || ("idx" + idx);
      let x, y;
      const p = saved[id];
      if(p && typeof p.x === "number" && typeof p.y === "number"){
        x = p.x; y = p.y;
      }else{
        const col = fallbackIndex % cols;
        const row = Math.floor(fallbackIndex / cols);
        x = col * cellW;
        y = row * cellH;
        fallbackIndex++;
      }
      const maxX = Math.max(0, iconGrid.clientWidth - el.offsetWidth);
      const maxY = Math.max(0, iconGrid.clientHeight - el.offsetHeight);
      setIconXY(el, clamp(x, 0, maxX), clamp(y, 0, maxY));
    });

    // Normalize + prune
    persistIconLayout();
  }
  function enableDesktopIconDragging(){
    const icons = $$(".desk-icon", iconGrid);

    icons.forEach(el=>{
      if(el.dataset.draggableBound === "1") return;
      el.dataset.draggableBound = "1";

      let dragging = false;
      let moved = false;
      let pid = null;
      let startClientX = 0, startClientY = 0;
      let bases = new Map(); // el -> {x,y}
      let prevZ = new Map(); // el -> zIndex

      const beginDrag = (e)=>{
        if(e.pointerType === "mouse" && e.button !== 0) return;
        if(!e.isPrimary) return;

        // Selection behavior before drag
        const iconsNow = $$(".desk-icon", iconGrid);
        const idx = iconsNow.indexOf(el);

        if(e.shiftKey && lastSelectedIdx >= 0){
          // range select
          const a = Math.min(lastSelectedIdx, idx);
          const b = Math.max(lastSelectedIdx, idx);
          clearIconSelection();
          for(let i=a;i<=b;i++) selectIconEl(iconsNow[i], true);
        }else if(e.ctrlKey || e.metaKey){
          // toggle
          const next = !isIconSelected(el);
          selectIconEl(el, next);
          lastSelectedIdx = idx;
          // if toggled off, don't start drag
          if(!next){ e.preventDefault(); return; }
        }else{
          if(!isIconSelected(el)){
            clearIconSelection();
            selectIconEl(el, true);
          }
          lastSelectedIdx = idx;
        }

        dragging = true;
        moved = false;
        pid = e.pointerId;

        startClientX = e.clientX;
        startClientY = e.clientY;

        const dragEls = selectedIconEls(el);
        bases = new Map();
        prevZ = new Map();

        dragEls.forEach(d=>{
          const xy = getIconXY(d);
          bases.set(d, { x: xy.x, y: xy.y });
          prevZ.set(d, d.style.zIndex);
          d.style.zIndex = "9999";
          d.classList.add("dragging");
        });

        try{ el.setPointerCapture && el.setPointerCapture(pid); }catch(_){}
        e.preventDefault();
      };

      const moveDrag = (e)=>{
        if(!dragging) return;
        if(pid !== null && e.pointerId !== pid) return;

        const dx = e.clientX - startClientX;
        const dy = e.clientY - startClientY;
        if(!moved && (Math.abs(dx) + Math.abs(dy) > 4)) moved = true;

        bases.forEach((b, d)=>{
          let x = b.x + dx;
          let y = b.y + dy;

          const maxX = Math.max(0, iconGrid.clientWidth - d.offsetWidth);
          const maxY = Math.max(0, iconGrid.clientHeight - d.offsetHeight);

          // While moving, don't snap (feels smoother). Snap on release.
          setIconXY(d, clamp(x, 0, maxX), clamp(y, 0, maxY));
        });
      };

      const endDrag = (e)=>{
        if(!dragging) return;
        if(pid !== null && e.pointerId !== pid) return;

        dragging = false;
        try{ el.releasePointerCapture && el.releasePointerCapture(pid); }catch(_){}
        pid = null;

        // Snap + restore styling
        bases.forEach((_, d)=>{
          d.classList.remove("dragging");

          // snap at end if enabled
          if(moved){
            const xy = getIconXY(d);
            const snapped = snapXY(xy.x, xy.y);
            const maxX = Math.max(0, iconGrid.clientWidth - d.offsetWidth);
            const maxY = Math.max(0, iconGrid.clientHeight - d.offsetHeight);
            setIconXY(d, clamp(snapped.x, 0, maxX), clamp(snapped.y, 0, maxY));
          }

          d.style.zIndex = prevZ.get(d) ?? "";
        });

        if(moved){
          persistIconLayout();
          // suppress click that may fire after dragging
          bases.forEach((_, d)=>{
            d._justDragged = true;
            setTimeout(()=>{ d._justDragged = false; }, 0);
          });
        }

        bases = new Map();
        prevZ = new Map();
      };

      el.addEventListener("pointerdown", beginDrag);
      el.addEventListener("pointermove", moveDrag);
      el.addEventListener("pointerup", endDrag);
      el.addEventListener("pointercancel", endDrag);
    });
  }

  function alignIconsToGrid(){
    const icons = $$(".desk-icon", iconGrid);
    if(!icons.length) return;
    const { stepX, stepY, cols } = gridMetrics();
    let i = 0;
    icons.forEach(el=>{
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * stepX;
      const y = row * stepY;
      const maxX = Math.max(0, iconGrid.clientWidth - el.offsetWidth);
      const maxY = Math.max(0, iconGrid.clientHeight - el.offsetHeight);
      setIconXY(el, clamp(x, 0, maxX), clamp(y, 0, maxY));
      i++;
    });
    persistIconLayout();
    showToast("📐 アイコンを整列しました");
  }

  function resetIconLayout(){
    try{ localStorage.removeItem(iconPosKey); }catch(_){}
    clearIconSelection();
    applyIconLayout();
    showToast("↩︎ 配置をリセットしました");
  }

  // Keep icons inside the screen after resize
  if(!window.__almostos_icons_resize_bound){
    window.__almostos_icons_resize_bound = true;
    window.addEventListener("resize", ()=> applyIconLayout());
  }

    function renderDesktopIcons(){
    iconGrid.innerHTML = "";
    const apps = allApps();

    apps.forEach(app => {
      const d = document.createElement("div");
      d.className = "desk-icon";
      d.dataset.appId = app.id;

      d.innerHTML = `
        <div class="glyph">${escapeHtml(app.glyph)}</div>
        <div class="label">${escapeHtml(app.name)}</div>
        <div class="sub">${escapeHtml(app.id.startsWith("x-") ? "Installed" : (customApps.some(c=>c.id===app.id) ? "Installed" : "Built-in"))}</div>
      `;

      d.addEventListener("dblclick", (e)=> {
        if(d._justDragged) return;
        app.open();
      });

      d.addEventListener("click", (e)=> {
        if(d._justDragged){
          e.preventDefault();
          e.stopPropagation();
          d._justDragged = false;
          return;
        }
        e.stopPropagation();
        closeStart();
      });

      iconGrid.appendChild(d);
    });

    // Apply saved positions + enable drag
    applyIconLayout();
    enableDesktopIconDragging();
    syncIconSelectionToDOM();
  }

  // ---- Window Manager ----
  function newId(){ return "w" + Math.random().toString(36).slice(2,9); }

  function rectOf(el){ return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; }
  function applyRect(el, r){
    el.style.left = r.x + "px";
    el.style.top = r.y + "px";
    el.style.width = r.w + "px";
    el.style.height = r.h + "px";
  }

  function setTitle(id, title){
    const w = state.windows.get(id);
    if(!w) return;
    w.title = title;
    $(".title-text .name", w.el).textContent = title;
    renderTaskbar();
  }

  function focus(id){
    const w = state.windows.get(id);
    if(!w) return;
    state.activeId = id;
    w.el.classList.remove("hidden");
    w.minimized = false;
    w.el.style.zIndex = String(++state.z);
    $$(".win").forEach(el=> el.style.outline = "none");
    w.el.style.outline = "2px solid rgba(124,92,255,.22)";
    renderTaskbar();
  }

  function minimize(id){
    const w = state.windows.get(id);
    if(!w) return;
    if(w.fullscreen){ toggleFullscreen(id); }
    w.minimized = true;
    w.el.classList.add("hidden");
    if(state.activeId === id) state.activeId = null;
    renderTaskbar();
  }

  function closeWin(id){
    const w = state.windows.get(id);
    if(!w) return;
    if(w.fullscreen){ const tb=document.getElementById('taskbar'); if(tb) tb.style.display=''; }
    w.el.remove();
    state.windows.delete(id);
    state.order = state.order.filter(x=>x!==id);
    if(state.activeId === id) state.activeId = null;
    renderTaskbar();
  }

  function maximize(id, force){
    const w = state.windows.get(id);
    if(!w) return;
    // If fullscreen, exit first (maximize is "windowed" behavior)
    if(w.fullscreen){ toggleFullscreen(id); }

    if(!w.maximized){
      w.rect = rectOf(w.el);
      w.maximized = true;
      w.el.style.left = "18px";
      w.el.style.top = "18px";
      w.el.style.width = `calc(100vw - 36px)`;
      w.el.style.height = `calc(100vh - 110px)`;
    } else if(!force){
      w.maximized = false;
      if(w.rect) applyRect(w.el, w.rect);
    }
    renderTaskbar();
  }

  function toggleFullscreen(id){
    const w = state.windows.get(id);
    if(!w) return;

    // store previous rect if entering fullscreen
    if(!w.fullscreen){
      w.rect = w.rect || rectOf(w.el);
      w.fullscreen = true;
      w.el.classList.add("fullscreen");
      // Hide taskbar (desktop is still there but covered)
      const tb = document.getElementById("taskbar");
      if(tb) tb.style.display = "none";
      // also close panels
      closeStart();
      quickPanel.classList.remove("show");
      if(contextMenu) contextMenu.classList.remove("show");
      focus(id);
    } else {
      w.fullscreen = false;
      w.el.classList.remove("fullscreen");
      const tb = document.getElementById("taskbar");
      if(tb) tb.style.display = "";
      // restore geometry (prefer stored rect)
      if(w.rect) applyRect(w.el, w.rect);
      focus(id);
    }
    renderTaskbar();
  }

  function renderTaskbar(){
    taskApps.innerHTML = "";
    state.order.forEach(id => {
      const w = state.windows.get(id);
      if(!w) return;
      const pill = document.createElement("div");
      pill.className = "task-pill" + (state.activeId===id ? " active" : "");
      pill.title = w.title;
      pill.innerHTML = `<span class="dot"></span><span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(w.title)}</span>`;
      pill.addEventListener("click", ()=>{
        if(w.minimized) focus(id);
        else if(state.activeId===id) minimize(id);
        else focus(id);
      });
      taskApps.appendChild(pill);
    });
  }

  function createWindow({appId, title, icon, subtitle, contentBuilder, size="md"}){
    const tpl = $("#winTpl");
    const el = tpl.content.firstElementChild.cloneNode(true);
    const id = newId();
    $(".title-ico", el).textContent = icon || "□";
    $(".title-text .name", el).textContent = title;
    $(".title-text .sub", el).textContent = subtitle || "AlmostOS";
    el.dataset.id = id;

    const vw = window.innerWidth, vh = window.innerHeight;
    let w = Math.min(760, vw-64), h = Math.min(520, vh-150);
    if(size==="lg"){ w = Math.min(940, vw-48); h = Math.min(620, vh-140); }
    if(size==="sm"){ w = Math.min(560, vw-64); h = Math.min(420, vh-150); }
    const left = 70 + Math.round(Math.random()*120);
    const top  = 80 + Math.round(Math.random()*90);
    el.style.left = Math.min(left, vw - w - 24) + "px";
    el.style.top  = Math.min(top,  vh - h - 120) + "px";
    el.style.width = w + "px";
    el.style.height = h + "px";
    el.style.zIndex = String(++state.z);

    $$(".wbtn", el).forEach(btn => {
      const run = (e)=>{
        if(e && e.cancelable) e.preventDefault();
        if(e) e.stopPropagation();
        const act = btn.dataset.act;
        if(act==="min") minimize(id);
        if(act==="close") closeWin(id);
        if(act==="max") maximize(id);
        btn.dataset.lastAct = String(Date.now());
      };
      // Pointer-first (タッチ/ペンでも1回で確実に反応)
      btn.addEventListener("pointerup", run);
      // 一部ブラウザで click も来るので二重発火をガード
      btn.addEventListener("click", (e)=>{
        const last = Number(btn.dataset.lastAct || 0);
        if(Date.now() - last < 650){ if(e) e.stopPropagation(); return; }
        run(e);
      });
    });

    el.addEventListener("mousedown", ()=> focus(id));
    $(".titlebar", el).addEventListener("dblclick", ()=> maximize(id));
    makeDraggable(el, $(".titlebar", el));
    makeResizable(el, $(".resize-handle", el));

    const content = $(".content", el);
    contentBuilder(content, { id, setTitle: (t)=>setTitle(id,t) });

    desktop.appendChild(el);

    state.windows.set(id, { el, appId, title, pid: allocPid(), minimized:false, maximized:false, fullscreen:false, rect:null });
    state.order.push(id);
    focus(id);
    renderTaskbar();
    return id;
  }

  function makeDraggable(winEl, handle){
    let dragging = false;
    let pointerId = null;
    let sx=0, sy=0, ox=0, oy=0;
    let snapTarget = null;

    const isLocked = ()=> {
      const w = state.windows.get(winEl.dataset.id);
      return !!(w?.maximized || w?.fullscreen);
    };

    handle.addEventListener("pointerdown", (e)=>{
      if(e.pointerType==="mouse" && e.button!==0) return;
      if(isLocked()) return;
      if(e.target && e.target.closest && e.target.closest(".title-actions, .wbtn, button, a, input, textarea, select, label")) return;
      dragging = true;
      pointerId = e.pointerId;
      try{ handle.setPointerCapture(pointerId); }catch(_){}
      sx = e.clientX; sy = e.clientY;
      ox = winEl.offsetLeft; oy = winEl.offsetTop;
      snapTarget = null;
      hideSnap();
      e.preventDefault();
    });

    handle.addEventListener("pointermove", (e)=>{
      if(!dragging || e.pointerId!==pointerId) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      const nx = Math.max(12, Math.min(window.innerWidth - winEl.offsetWidth - 12, ox + dx));
      const ny = Math.max(12, Math.min(window.innerHeight - winEl.offsetHeight - 90, oy + dy));
      winEl.style.left = nx + "px";
      winEl.style.top  = ny + "px";

      const th = 26;
      let t = null;
      if(e.clientY <= th) t = "max";
      else if(e.clientX <= th) t = "left";
      else if(e.clientX >= window.innerWidth - th) t = "right";

      if(t !== snapTarget){
        snapTarget = t;
        if(t) showSnap(t);
        else hideSnap();
      }
    });

    const end = (e)=>{
      if(!dragging || e.pointerId!==pointerId) return;
      dragging = false;
      try{ handle.releasePointerCapture(pointerId); }catch(_){}
      pointerId = null;
      if(snapTarget){
        applySnap(winEl.dataset.id, snapTarget);
      }
      snapTarget = null;
      hideSnap();
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function makeResizable(winEl, handle){
    let resizing=false;
    let pointerId=null;
    let ow=0, oh=0, sx=0, sy=0;

    const isLocked = ()=> {
      const w = state.windows.get(winEl.dataset.id);
      return !!(w?.maximized || w?.fullscreen);
    };

    handle.addEventListener("pointerdown", (e)=>{
      if(e.pointerType==="mouse" && e.button!==0) return;
      if(isLocked()) return;
      resizing = true;
      pointerId = e.pointerId;
      try{ handle.setPointerCapture(pointerId); }catch(_){}
      sx = e.clientX; sy = e.clientY;
      ow = winEl.offsetWidth; oh = winEl.offsetHeight;
      e.preventDefault();
      e.stopPropagation();
    });

    handle.addEventListener("pointermove", (e)=>{
      if(!resizing || e.pointerId!==pointerId) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      const nw = Math.max(420, Math.min(window.innerWidth - winEl.offsetLeft - 12, ow + dx));
      const nh = Math.max(260, Math.min(window.innerHeight - winEl.offsetTop - 90, oh + dy));
      winEl.style.width = nw + "px";
      winEl.style.height = nh + "px";
    });

    const end = (e)=>{
      if(!resizing || e.pointerId!==pointerId) return;
      resizing=false;
      try{ handle.releasePointerCapture(pointerId); }catch(_){}
      pointerId=null;
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function parseAppManifest(htmlText){
    const marker = /<!--\s*ALMOSTOS_APP\s*([\s\S]*?)-->/i;
    const m = htmlText.match(marker);
    if(m){
      const jsonText = m[1].trim();
      try{
        const obj = JSON.parse(jsonText);
        return obj && typeof obj==="object" ? obj : null;
      }catch(e){
        return { _error: "manifest JSON parse failed" };
      }
    }
    // also allow <meta name="almostos-app" content='{"id":"..."}'>
    const meta = htmlText.match(/<meta\s+name=["']almostos-app["']\s+content=["']([\s\S]*?)["']\s*\/?>/i);
    if(meta){
      try{ return JSON.parse(meta[1]); }catch(e){ return { _error: "meta manifest JSON parse failed" }; }
    }
    return null;
  }

  function installFromFile(file){
    return new Promise((resolve)=>{
      const reader = new FileReader();
      reader.onload = () => {
        const htmlText = String(reader.result || "");
        const mf = parseAppManifest(htmlText);
        const filename = file?.name || "app.html";

        let id = (mf && typeof mf.id==="string" && mf.id.trim()) ? mf.id.trim() : "";
        if(!id){
          // derive stable id from filename
          id = "x-" + filename.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,40);
        }
        const name = (mf && typeof mf.name==="string" && mf.name.trim()) ? mf.name.trim() : filename.replace(/\.[^.]+$/,"");
        const glyph = (mf && typeof mf.glyph==="string" && mf.glyph.trim()) ? mf.glyph.trim() : "🧩";
        const sub = (mf && typeof mf.sub==="string" && mf.sub.trim()) ? mf.sub.trim() : "Installed App";

        // store
        upsertCustomApp({ id, name, glyph, sub, html: htmlText, filename });
        showToast(`インストール: ${name}`);
        resolve({ id, name });
      };
      reader.onerror = () => { showToast("読み込み失敗"); resolve(null); };
      reader.readAsText(file, "utf-8");
    });
  }

  function triggerInstallPicker(){
    filePicker.value = "";
    // allow any extension (since user says it's just html with different ext)
    filePicker.accept = ".aosapp,.aos,.app,.html,.htm,*/*";
    filePicker.click();
  }

  filePicker.addEventListener("change", async ()=>{
    const file = filePicker.files && filePicker.files[0];
    if(!file) return;
    const res = await installFromFile(file);
    if(res?.id){
      openCustomApp(res.id);
    }
  });

  // ---- Apps ----
  function openAbout(){
    createWindow({
      appId:"about",
      title:"About",
      icon:"🪐",
      subtitle:"ver 1.1 (not really)",
      size:"sm",
      contentBuilder: (root) => {
        root.innerHTML = `
          <div class="pane">
            <div class="card">
              <h2>AlmostOS</h2>
              <p>ブラウザで動く「OSっぽいやつ」。ウィンドウ管理 / タスクバー / Start など。</p>
              <p><b>NEW:</b> 拡張子だけ変えたHTMLを <span class="badge">Install</span> で読み込むと「アプリ」として保存され、次回も即起動できます。</p>
              <div class="row" style="margin-top:12px">
                <button class="btn" id="btnInstall">➕ Install</button>
                <button class="btn ghost" id="btnDownload">⬇️ HTML</button>
                <button class="btn ghost" id="btnReset">🧨 初期化</button>
              </div>
              <p class="tiny" style="margin-top:10px">※初期化はlocalStorage消去（アプリ含む）。</p>
            </div>
            <div style="height:12px"></div>
            <div class="card">
              <h2>ショートカット</h2>
              <p><span class="badge">Ctrl+Space</span> Startメニュー</p>
              <p><span class="badge">Ctrl+&#96;</span> Terminal（Backquote）</p>
              <p><span class="badge">Ctrl+S</span> 保存</p>
              <p><span class="badge">Esc</span> Start/Quickを閉じる</p>
            </div>
          </div>
        `;
        $("#btnInstall", root).addEventListener("click", triggerInstallPicker);
        $("#btnDownload", root).addEventListener("click", (e)=> downloadThisHTML("AlmostOS.html", !!e.shiftKey));
        $("#btnReset", root).addEventListener("click", ()=>{
          if(confirm("localStorageを初期化します。インストール済みアプリも消えます。よろしい？")){
            localStorage.removeItem(storeKey);
            localStorage.removeItem(filesKey);
            localStorage.removeItem(notesKey);
            localStorage.removeItem(customAppsKey);
            location.reload();
          }
        });
      }
    });
  }

  function openSettings(){
    createWindow({
      appId:"settings",
      title:"Settings",
      icon:"⚙️",
      subtitle:"見た目・挙動",
      size:"sm",
      contentBuilder: (root) => {
        root.innerHTML = `
          <div class="pane">
            <div class="card">
              <h2>Quick Panel</h2>
              <p>右下の⚙︎からも開けます。</p>
              <div class="row" style="margin-top:10px">
                <button class="btn" id="openQuick">⚙︎ 開く</button>
                <button class="btn ghost" id="saveNow">💾 今すぐ保存</button>
              </div>
            </div>
            <div style="height:12px"></div>
            <div class="card">
              <h2>アプリ</h2>
              <p>インストール済みアプリの管理は <span class="badge">App Center</span>。</p>
              <div class="row" style="margin-top:10px">
                <button class="btn" id="openAC">🧩 App Center</button>
                <button class="btn ghost" id="installAC">➕ Install</button>
              </div>
            </div>
          </div>
        `;
        $("#openQuick", root).addEventListener("click", ()=> quickPanel.classList.add("show"));
        $("#saveNow", root).addEventListener("click", saveAll);
        $("#openAC", root).addEventListener("click", openAppCenter);
        $("#installAC", root).addEventListener("click", triggerInstallPicker);
      }
    });
  }

  function openAppCenter(){
    createWindow({
      appId:"appcenter",
      title:"App Center",
      icon:"🧩",
      subtitle:"Install / Manage",
      size:"lg",
      contentBuilder: (root) => {
        const list = customApps
          .slice()
          .sort((a,b)=> (b.installedAt||0)-(a.installedAt||0))
          .map(a => `
            <div class="side-item" data-id="${escapeAttr(a.id)}">
              <span style="font-size:16px">${escapeHtml(a.glyph||"🧩")}</span>
              <span style="min-width:0; overflow:hidden; text-overflow:ellipsis">${escapeHtml(a.name)}</span>
              <span class="badge">APP</span>
            </div>
          `).join("");

        root.innerHTML = `
          <div class="pane" style="height:100%">
            <div class="row">
              <div class="card">
                <h2>インストール</h2>
                <p>拡張子だけ変えたHTML（例: <span class="badge">.aosapp</span>）を読み込んで、アプリとして保存します。</p>
                <div class="row" style="margin-top:10px">
                  <button class="btn" id="btnPick">➕ ファイルを選ぶ</button>
                  <button class="btn ghost" id="btnSave">💾 保存</button>
                </div>
                <p class="tiny" style="margin-top:10px">
                  推奨manifest形式（先頭のコメント）:<br>
                  <span class="badge">&lt;!--ALMOSTOS_APP {"id":"myapp","name":"My App","glyph":"🧪"} --&gt;</span>
                </p>
              </div>
              <div class="card">
                <h2>管理</h2>
                <p>インストール済み: <span class="badge">${customApps.length}</span></p>
                <p class="tiny">※localStorage容量に注意（大きいHTMLを大量に入れると保存できなくなることがあります）</p>
              </div>
            </div>

            <div style="height:12px"></div>

            <div class="split">
              <div class="sidebar" id="appList">
                ${customApps.length ? list : `<div class="tiny" style="padding:8px">まだ何も入ってない。Installしてね。</div>`}
              </div>
              <div class="card" style="display:flex; flex-direction:column; gap:10px; min-height:0">
                <div class="row">
                  <button class="btn" id="btnLaunch" disabled>🚀 起動</button>
                  <button class="btn ghost" id="btnExport" disabled>📤 書き出し</button>
                  <button class="btn ghost" id="btnRemove" disabled>🗑️ 削除</button>
                </div>
                <div class="badge" id="selInfo">未選択</div>
                <textarea id="manifestView" class="input" spellcheck="false" style="min-height:240px" readonly></textarea>
                <div class="tiny">書き出しは、今選んだアプリHTMLをダウンロードします（ブラウザの保存）。</div>
              </div>
            </div>
          </div>
        `;

        $("#btnPick", root).addEventListener("click", triggerInstallPicker);
        $("#btnSave", root).addEventListener("click", saveAll);

        const appList = $("#appList", root);
        const btnLaunch = $("#btnLaunch", root);
        const btnRemove = $("#btnRemove", root);
        const btnExport = $("#btnExport", root);
        const selInfo = $("#selInfo", root);
        const manifestView = $("#manifestView", root);

        let selectedId = null;

        function setSelected(id){
          selectedId = id;
          $$(".side-item", appList).forEach(el=> el.classList.toggle("active", el.dataset.id===id));
          const app = customApps.find(a=>a.id===id);
          if(!app){
            selInfo.textContent = "未選択";
            manifestView.value = "";
            btnLaunch.disabled = btnRemove.disabled = btnExport.disabled = true;
            return;
          }
          selInfo.textContent = `${app.name}  (${app.id})`;
          const mf = parseAppManifest(app.html) || {};
          manifestView.value = JSON.stringify({
            id: app.id, name: app.name, glyph: app.glyph, sub: app.sub, filename: app.filename,
            manifest: mf && !mf._error ? mf : mf
          }, null, 2);
          btnLaunch.disabled = btnRemove.disabled = btnExport.disabled = false;
        }

        appList.addEventListener("click", (e)=>{
          const item = e.target.closest(".side-item");
          if(!item) return;
          setSelected(item.dataset.id);
        });

        btnLaunch.addEventListener("click", ()=>{
          if(!selectedId) return;
          openCustomApp(selectedId);
        });

        btnRemove.addEventListener("click", ()=>{
          if(!selectedId) return;
          const app = customApps.find(a=>a.id===selectedId);
          if(!app) return;
          if(confirm(`削除します: ${app.name}\n（localStorageから消えます）`)){
            removeCustomApp(selectedId);
            showToast("削除しました");
            // refresh window content by reopening App Center (cheap)
            // close and reopen
            // find current window id
            const win = [...state.windows.values()].find(w=>w.appId==="appcenter");
            if(win){ closeWin(win.el.dataset.id); }
            openAppCenter();
          }
        });

        btnExport.addEventListener("click", ()=>{
          if(!selectedId) return;
          const app = customApps.find(a=>a.id===selectedId);
          if(!app) return;
          const blob = new Blob([app.html], {type:"text/html;charset=utf-8"});
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          const safeName = (app.filename || app.id || "app") + "";
          a.download = safeName;
          document.body.appendChild(a);
          a.click();
          setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
        });

        if(customApps.length) setSelected(customApps[0].id);
      }
    });
  }

  function openNotes(){
    createWindow({
      appId:"notes",
      title:"Notes",
      icon:"📝",
      subtitle:"保存されるメモ",
      size:"lg",
      contentBuilder: (root) => {
        root.innerHTML = `
          <div class="pane">
            <div class="row">
              <div class="card">
                <h2>メモ</h2>
                <p>ここに書いた内容は <span class="badge">Ctrl+S</span> で保存。リロードしても残ります。</p>
                <div class="row">
                  <button class="btn" id="btnSave">💾 保存</button>
                  <button class="btn ghost" id="btnInsert">✨ それっぽい文章</button>
                </div>
              </div>
              <div class="card">
                <h2>小ネタ</h2>
                <p>Startの検索欄に <span class="badge">app</span> と入れるとApp Centerが出ます。</p>
                <p class="tiny">カスタムアプリも検索に引っかかります。</p>
              </div>
            </div>
            <div style="height:12px"></div>
            <textarea id="notesArea" spellcheck="false" class="input"></textarea>
          </div>
        `;
        const area = $("#notesArea", root);
        const existing = state._savedNotes ?? "";
        if(existing) area.value = existing;
        $("#btnSave", root).addEventListener("click", saveAll);
        $("#btnInsert", root).addEventListener("click", ()=>{
          area.value += (area.value ? "\n\n" : "") +
`[system] 端末の熱がいい感じになってきた。\n[wm] ウィンドウが“そこにある”感を出していく。\n[todo] それっぽい効果音が欲しい（気がする）。`;
          showToast("追記しました");
        });
      }
    });
  }
  function getNotesText(){
    const win = [...state.windows.values()].find(w=>w.appId==="notes");
    if(!win) return (state._savedNotes ?? "");
    const area = $("#notesArea", win.el);
    return area ? area.value : (state._savedNotes ?? "");
  }

  function openFiles(){
    createWindow({
      appId:"files",
      title:"Files",
      icon:"🗂️",
      subtitle:"/ を歩く",
      size:"lg",
      contentBuilder: (root, ctx) => {
        root.innerHTML = `
          <div class="pane" style="height:100%">
            <div class="split">
              <div class="sidebar" id="side"></div>
              <div class="card" style="display:flex; flex-direction:column; gap:10px; min-height:0">
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
                  <div class="badge" id="pathBadge">/</div>
                  <button class="btn ghost" id="upBtn">⬆︎ 上へ</button>
                  <button class="btn" id="newFileBtn">＋ 新規ファイル</button>
                  <button class="btn ghost" id="installFromHere">🧩 このファイルをInstall</button>
                  <button class="btn ghost" id="saveBtn2">💾 保存</button>
                </div>
                <div style="display:grid; grid-template-columns: 1fr; gap:10px; min-height:0">
                  <textarea id="fileEditor" spellcheck="false" class="input" style="min-height:220px"></textarea>
                </div>
                <div class="tiny">Filesは架空FS。<span class="badge">Install</span> は「今開いてるファイル内容」をアプリとして登録します。</div>
              </div>
            </div>
          </div>
        `;
        const side = $("#side", root);
        const pathBadge = $("#pathBadge", root);
        const editor = $("#fileEditor", root);
        let cwd = "/";
        let selected = "/readme.txt";

        function listDir(path){
          const node = fileSystem[path];
          if(!node || node.type!=="dir") return [];
          return node.children.map(name => {
            const p = (path==="/") ? `/${name}` : `${path}/${name}`;
            return { name, path:p, node:fileSystem[p] };
          });
        }

        function render(){
          side.innerHTML = "";
          pathBadge.textContent = cwd;
          const items = listDir(cwd);
          items.forEach(it => {
            const isDir = it.node?.type==="dir";
            const div = document.createElement("div");
            div.className = "side-item" + (it.path===selected ? " active" : "");
            div.innerHTML = `
              <span style="font-size:16px">${isDir ? "📁" : "📄"}</span>
              <span style="min-width:0; overflow:hidden; text-overflow:ellipsis">${escapeHtml(it.name)}</span>
              <span class="badge">${isDir ? "DIR" : "TXT"}</span>
            `;
            div.addEventListener("click", ()=>{
              if(isDir){
                cwd = it.path;
                selected = it.path;
                editor.value = "";
                ctx.setTitle("Files — " + cwd);
                render();
              } else {
                selected = it.path;
                editor.value = it.node?.content ?? "";
                ctx.setTitle("Files — " + it.name);
                render();
              }
            });
            side.appendChild(div);
          });

          const selNode = fileSystem[selected];
          editor.disabled = !(selNode?.type==="file");
        }

        $("#upBtn", root).addEventListener("click", ()=>{
          if(cwd==="/") return;
          const parts = cwd.split("/").filter(Boolean);
          parts.pop();
          cwd = "/" + parts.join("/");
          if(cwd==="/") selected="/";
          render();
        });

        $("#saveBtn2", root).addEventListener("click", ()=>{
          const n = fileSystem[selected];
          if(n?.type==="file"){
            n.content = editor.value;
            saveAll();
            showToast("保存しました");
          } else {
            showToast("ファイルを選んでね");
          }
        });

        $("#newFileBtn", root).addEventListener("click", ()=>{
          const name = prompt("新規ファイル名（例: memo.txt / myapp.aosapp）");
          if(!name) return;
          const base = name.replace(/[\/\\]/g,"").trim();
          if(!base){ showToast("名前が変"); return; }
          const path = (cwd==="/") ? `/${base}` : `${cwd}/${base}`;
          if(fileSystem[path]){ showToast("既にある"); return; }
          fileSystem[path] = { type:"file", content:"" };
          fileSystem[cwd].children.push(base);
          selected = path;
          editor.value = "";
          render();
          showToast("作成しました");
        });

        $("#installFromHere", root).addEventListener("click", ()=>{
          const n = fileSystem[selected];
          if(n?.type!=="file"){ showToast("ファイルを選んでね"); return; }
          // install using editor content
          const htmlText = editor.value || n.content || "";
          const mf = parseAppManifest(htmlText);
          const filename = selected.split("/").pop() || "app.aosapp";
          let id = (mf && typeof mf.id==="string" && mf.id.trim()) ? mf.id.trim() : "x-" + filename.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,40);
          const name = (mf && typeof mf.name==="string" && mf.name.trim()) ? mf.name.trim() : filename.replace(/\.[^.]+$/,"");
          const glyph = (mf && typeof mf.glyph==="string" && mf.glyph.trim()) ? mf.glyph.trim() : "🧩";
          const sub = (mf && typeof mf.sub==="string" && mf.sub.trim()) ? mf.sub.trim() : "Installed from Files";
          upsertCustomApp({ id, name, glyph, sub, html: htmlText, filename });
          showToast(`インストール: ${name}`);
          openCustomApp(id);
        });

        render();
      }
    });
  }


  function openTerminal(){
    createWindow({
      appId:"terminal",
      title:"Terminal",
      icon:"⌘",
      subtitle:"almostsh",
      size:"lg",
      contentBuilder: (root) => {
        root.innerHTML = `
          <div class="pane" style="display:flex; flex-direction:column; gap:10px; height:100%; min-height:0">
            <div class="term" id="term"></div>
            <div style="display:flex; gap:10px; align-items:center">
              <input class="input" id="cmd" spellcheck="false"
                placeholder="help / ls / cd / pwd / cat / echo / write / mkdir / touch / rm / neofetch / open <app> / install <path> / clear" />
              <button class="btn" id="run">▶</button>
            </div>
            <div class="tiny">
              Tip: ↑/↓=history / Tab=completion /
              <span class="badge">neofetch</span> /
              <span class="badge">open notes</span> /
              <span class="badge">install /home/apps/welcome.aosapp</span>
            </div>
          </div>
        `;

        const term = $("#term", root);
        const cmd = $("#cmd", root);
        const run = $("#run", root);

        const userRaw = (lockInfo && lockInfo.displayName) ? String(lockInfo.displayName) : "Guest";
        const user = userRaw.trim() || "Guest";
        const host = "almostos";

        let cwd = fileSystem["/home"] ? "/home" : "/";
        const history = [];
        let histIdx = 0;

        const COMMAND_HELP = {
          help: "ヘルプ。help / help <cmd>",
          man: "help の別名。man <cmd>",
          apps: "アプリ一覧を表示",
          open: "アプリを起動。open <appId|name>",
          install: "aosapp(HTML)をインストール。install <path>",
          ls: "ディレクトリ表示。ls [path] [-l]",
          tree: "ツリー表示。tree [path]",
          cd: "移動。cd <path>",
          pwd: "現在のパスを表示",
          cat: "ファイル表示。cat <path>",
          head: "先頭だけ表示。head [-n N] <path>",
          tail: "末尾だけ表示。tail [-n N] <path>",
          echo: "表示。echo <text>",
          write: "ファイルに上書き書き込み。write <path> <text>",
          append: "ファイルに追記。append <path> <text>",
          touch: "空ファイル作成。touch <path>",
          mkdir: "ディレクトリ作成。mkdir <path>",
          rm: "削除（擬似）。rm <path> / rm -r <dir>",
          date: "日付表示",
          time: "現在時刻（Date）",
          whoami: "ユーザー名表示",
          uname: "OS情報（擬似）",
          neofetch: "それっぽい情報表示",
          ps: "プロセス一覧（擬似）",
          calc: "簡易計算。calc <expr>",
          fortune: "一言メッセージ",
          clear: "画面クリア",
          history: "履歴表示",
          exit: "このターミナルは閉じません（優しい）"
        };

        const COMMANDS = Object.keys(COMMAND_HELP);

        function print(line, cls){
          const div = document.createElement("div");
          if(cls) div.className = cls;
          div.innerHTML = line;
          term.appendChild(div);
          term.scrollTop = term.scrollHeight;
        }

        function promptLine(s){
          const u = escapeHtml(user.toLowerCase().replace(/\s+/g,"").slice(0,20) || "guest");
          const p = escapeHtml(cwd);
          print(`<span class="prompt">${u}@${host}</span>:<span class="ok">${p}</span><span class="prompt">$</span> ${escapeHtml(s)}`);
        }

        function tokenize(line){
          const out = [];
          let cur = "";
          let q = null;
          const push = () => { if(cur !== ""){ out.push(cur); cur=""; } };
          for(let i=0;i<line.length;i++){
            const ch = line[i];
            if(q){
              if(ch === q){ q = null; }
              else { cur += ch; }
              continue;
            }
            if(ch === "'" || ch === '"'){ q = ch; continue; }
            if(/\s/.test(ch)){ push(); continue; }
            cur += ch;
          }
          push();
          return out;
        }

        function normalizePath(p){
          let s = String(p || "").trim();
          if(!s) return "/";
          // normalize slashes
          s = s.replace(/\\/g,"/").replace(/\/+/g,"/");
          const parts = [];
          for(const seg of s.split("/")){
            if(!seg || seg === ".") continue;
            if(seg === ".."){ parts.pop(); continue; }
            parts.push(seg);
          }
          return "/" + parts.join("/");
        }

        function resolvePath(input){
          let p = String(input || "").trim();
          if(!p || p === "~") return "/home";
          if(p.startsWith("~")) p = "/home" + p.slice(1);
          if(!p.startsWith("/")){
            const base = cwd.endsWith("/") ? cwd : (cwd + "/");
            p = base + p;
          }
          return normalizePath(p);
        }

        function parentDir(p){
          const n = normalizePath(p);
          if(n === "/") return "/";
          const parts = n.split("/").filter(Boolean);
          parts.pop();
          return "/" + parts.join("/");
        }

        function baseName(p){
          const parts = normalizePath(p).split("/").filter(Boolean);
          return parts[parts.length-1] || "";
        }

        function ensureDir(path){
          const p = normalizePath(path);
          const n = fileSystem[p];
          return n && n.type === "dir";
        }

        function ensureParentExists(path){
          const pp = parentDir(path);
          const pn = fileSystem[pp];
          if(!pn || pn.type !== "dir") return { ok:false, parent:pp };
          return { ok:true, parent:pp };
        }

        function addChild(parent, name){
          const pn = fileSystem[parent];
          if(!pn || pn.type !== "dir") return;
          if(!pn.children.includes(name)) pn.children.push(name);
        }

        function removeChild(parent, name){
          const pn = fileSystem[parent];
          if(!pn || pn.type !== "dir") return;
          pn.children = pn.children.filter(x => x !== name);
        }

        function listEntries(path){
          const p = normalizePath(path);
          const node = fileSystem[p];
          if(!node) return null;
          if(node.type === "file") return [{ name: baseName(p), path: p, node }];
          const kids = (node.children || []).map(name => {
            const childPath = (p === "/") ? `/${name}` : `${p}/${name}`;
            return { name, path: childPath, node: fileSystem[childPath] };
          });
          return kids;
        }

        function humanSize(n){
          const v = Math.max(0, n|0);
          if(v < 1024) return `${v}B`;
          if(v < 1024*1024) return `${Math.round(v/102.4)/10}KB`;
          return `${Math.round(v/1024/102.4)/10}MB`;
        }

        function suggest(word, list){
          const w = (word || "").toLowerCase();
          if(!w) return [];
          // tiny fuzzy: startsWith, then includes
          const a = list.filter(x => x.startsWith(w));
          const b = list.filter(x => !x.startsWith(w) && x.includes(w));
          return [...a, ...b].slice(0,6);
        }

        function isRmRfEverything(cmdName, args, raw){
          const norm = String(raw || "").replace(/\s+/g, " ").trim();
          if(norm === "rm -rf /*" || norm === "rm -fr /*") return true;
          if(cmdName !== "rm") return false;
          const flags = args.filter(a => a.startsWith("-")).join("").toLowerCase();
          const hasR = flags.includes("r");
          const hasF = flags.includes("f");
          const targets = args.filter(a => !a.startsWith("-"));
          if(!(hasR && hasF)) return false;
          return targets.some(t => {
            const tt = String(t || "").trim();
            return tt === "/*" || tt === "/" || tt === "/**";
          });
        }

        function rmRfReaction(){
          // freeze input
          try{ cmd.disabled = true; run.disabled = true; }catch(_){}
          print(`<span class="warn">⚠︎</span> <span class="err">rm -rf /*</span> を検出しました。`);
          print(`<span class="tiny">AlmostGuard™: いま全力で止めてます…（※擬似環境なので実害はありません）</span>`);
          const seq = [
            `checking permissions... <span class="ok">DENIED</span>`,
            `retrying with <span class="warn">"are you sure?"</span> prompt... <span class="err">skipped</span>`,
            `mounting emergency snapshot... <span class="ok">ok</span>`,
            `panic: <span class="err">user chose chaos</span>`,
            `collecting error info...`
          ];
          let i = 0;
          const step = () => {
            if(i < seq.length){
              print(seq[i]);
              i += 1;
              setTimeout(step, 280);
              return;
            }
            // dramatic exit
            setTimeout(()=>{
              crashToBSOD({
                stopCode: "ALMOSTOS_FILE_SYSTEM_GONE",
                whatFailed: "rm.exe"
              });
            }, 420);
          };
          setTimeout(step, 260);
        }

        function cmdHelp(args){
          const t = (args[0] || "").toLowerCase();
          if(!t){
            const lines = COMMANDS
              .filter(x => x !== "man")
              .map(k => `  <span class="warn">${k}</span> — ${escapeHtml(COMMAND_HELP[k] || "")}`)
              .join("\n");
            print(`available commands:\n${lines}`);
            print(`<span class="tiny">例: <span class="badge">ls /home</span> <span class="badge">cd /system</span> <span class="badge">cat /readme.txt</span> <span class="badge">neofetch</span></span>`);
            return;
          }
          if(COMMAND_HELP[t]){
            print(`<span class="warn">${escapeHtml(t)}</span> — ${escapeHtml(COMMAND_HELP[t])}`);
          } else {
            const sug = suggest(t, COMMANDS);
            print(`<span class="err">no manual entry for:</span> ${escapeHtml(t)}${sug.length ? `\nmaybe: <span class="ok">${escapeHtml(sug.join(", "))}</span>` : ""}`);
          }
        }

        function cmdApps(){
          const list = allApps().map(a=>`${a.id}`).join(", ");
          print(`apps: <span class="ok">${escapeHtml(list)}</span>`);
        }

        function cmdOpen(args){
          const target = (args.join(" ") || "").toLowerCase().trim();
          if(!target){ print(`<span class="err">usage:</span> open &lt;app&gt;`); return; }
          const app = allApps().find(a => a.id === target || a.name.toLowerCase() === target);
          if(app){ app.open(); print(`opened: <span class="ok">${escapeHtml(app.name)}</span>`); }
          else {
            const sug = suggest(target, allApps().map(a=>a.id));
            print(`<span class="err">no such app:</span> ${escapeHtml(target)}${sug.length ? `\nmaybe: <span class="ok">${escapeHtml(sug.join(", "))}</span>` : ""}`);
          }
        }

        function cmdInstall(args){
          const pathIn = args.join(" ");
          if(!pathIn){ print(`<span class="err">usage:</span> install &lt;path&gt;`); return; }
          const path = resolvePath(pathIn);
          const node = fileSystem[path];
          if(!node){ print(`<span class="err">not found:</span> ${escapeHtml(path)}`); return; }
          if(node.type==="dir"){ print(`<span class="err">is a directory:</span> ${escapeHtml(path)}`); return; }
          const htmlText = node.content || "";
          const mf = parseAppManifest(htmlText);
          const filename = path.split("/").pop() || "app.aosapp";
          let id = (mf && typeof mf.id==="string" && mf.id.trim()) ? mf.id.trim() : "x-" + filename.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,40);
          const name = (mf && typeof mf.name==="string" && mf.name.trim()) ? mf.name.trim() : filename.replace(/\.[^.]+$/,"");
          const glyph = (mf && typeof mf.glyph==="string" && mf.glyph.trim()) ? mf.glyph.trim() : "🧩";
          const sub = (mf && typeof mf.sub==="string" && mf.sub.trim()) ? mf.sub.trim() : "Installed from Terminal";
          upsertCustomApp({ id, name, glyph, sub, html: htmlText, filename });
          print(`installed: <span class="ok">${escapeHtml(name)}</span> (id: ${escapeHtml(id)})`);
        }

        function cmdLs(args){
          const flags = args.filter(a => a.startsWith("-")).join("").toLowerCase();
          const long = flags.includes("l");
          const target = args.find(a => !a.startsWith("-")) || ".";
          const path = target === "." ? cwd : resolvePath(target);
          const node = fileSystem[path];
          if(!node){ print(`<span class="err">not found:</span> ${escapeHtml(path)}`); return; }
          if(node.type==="file"){ print(escapeHtml(path)); return; }
          const entries = listEntries(path) || [];
          if(!long){
            const names = entries.map(it => {
              const t = it.node?.type==="dir" ? "/" : "";
              return escapeHtml(it.name + t);
            });
            print(names.join("  "));
            return;
          }
          // long listing
          const rows = entries.map(it => {
            const isDir = it.node?.type==="dir";
            const size = isDir ? "-" : humanSize((it.node?.content || "").length);
            const name = it.name + (isDir ? "/" : "");
            return `${isDir ? "d" : "-"}  ${size.padStart(6," ")}  ${escapeHtml(name)}`;
          });
          print(rows.join("\n"));
        }
        function cmdTree(args){
          const target = args[0] || ".";
          const path = target === "." ? cwd : resolvePath(target);
          const node = fileSystem[path];
          if(!node){ print(`<span class="err">not found:</span> ${escapeHtml(path)}`); return; }

          const maxDepth = 6;
          const lines = [];

          const walkDir = (p, prefix, depth) => {
            if(depth > maxDepth) return;
            const n = fileSystem[p];
            if(!n) return;
            if(n.type !== "dir") return;

            const kids = listEntries(p) || [];
            kids.forEach((it, idx) => {
              const last = idx === kids.length - 1;
              const branch = last ? "└─ " : "├─ ";
              const nextPrefix = prefix + (last ? "   " : "│  ");
              if(it.node?.type === "dir"){
                lines.push(prefix + branch + it.name + "/");
                walkDir(it.path, nextPrefix, depth+1);
              } else {
                lines.push(prefix + branch + it.name);
              }
            });
          };

          print(escapeHtml(path));
          if(node.type === "dir"){
            walkDir(path, "", 0);
            if(lines.length) print(`<span class="ok">${escapeHtml(lines.join("\n"))}</span>`);
          }
        }

        function cmdCd(args){
          const target = args[0] || "~";
          const path = resolvePath(target);
          const node = fileSystem[path];
          if(!node){ print(`<span class="err">not found:</span> ${escapeHtml(path)}`); return; }
          if(node.type !== "dir"){ print(`<span class="err">not a directory:</span> ${escapeHtml(path)}`); return; }
          cwd = path;
        }

        function cmdPwd(){ print(escapeHtml(cwd)); }

        function cmdCat(args){
          const target = args[0];
          if(!target){ print(`<span class="err">usage:</span> cat &lt;path&gt;`); return; }
          const path = resolvePath(target);
          const node = fileSystem[path];
          if(!node){ print(`<span class="err">not found:</span> ${escapeHtml(path)}`); return; }
          if(node.type==="dir"){ print(`<span class="err">is a directory:</span> ${escapeHtml(path)}`); return; }
          print(`<span class="ok">${escapeHtml(node.content)}</span>`);
        }

        function cmdHeadTail(kind, args){
          let n = 10;
          let i = 0;
          if(args[i] === "-n" && args[i+1]){
            const v = parseInt(args[i+1], 10);
            if(Number.isFinite(v) && v > 0) n = v;
            i += 2;
          }
          const target = args[i];
          if(!target){ print(`<span class="err">usage:</span> ${kind} [-n N] &lt;path&gt;`); return; }
          const path = resolvePath(target);
          const node = fileSystem[path];
          if(!node){ print(`<span class="err">not found:</span> ${escapeHtml(path)}`); return; }
          if(node.type==="dir"){ print(`<span class="err">is a directory:</span> ${escapeHtml(path)}`); return; }
          const lines = String(node.content || "").split("\n");
          const out = (kind === "head") ? lines.slice(0,n) : lines.slice(Math.max(0, lines.length-n));
          print(`<span class="ok">${escapeHtml(out.join("\n"))}</span>`);
        }

        function cmdEcho(args){
          print(escapeHtml(args.join(" ")));
        }

        function cmdWriteAppend(kind, args){
          const target = args[0];
          if(!target){ print(`<span class="err">usage:</span> ${kind} &lt;path&gt; &lt;text&gt;`); return; }
          const text = args.slice(1).join(" ");
          const path = resolvePath(target);
          const parent = ensureParentExists(path);
          if(!parent.ok){ print(`<span class="err">no such directory:</span> ${escapeHtml(parent.parent)}`); return; }

          const existing = fileSystem[path];
          if(existing && existing.type==="dir"){ print(`<span class="err">is a directory:</span> ${escapeHtml(path)}`); return; }

          if(!existing){
            fileSystem[path] = { type:"file", content:"" };
            addChild(parent.parent, baseName(path));
          }
          const node = fileSystem[path];
          const prev = String(node.content || "");
          node.content = (kind === "append" && prev) ? (prev + "\n" + text) : (kind === "append" ? text : text);
          print(`${kind}: <span class="ok">${escapeHtml(path)}</span> (${humanSize(node.content.length)})`);
        }

        function cmdTouch(args){
          const target = args[0];
          if(!target){ print(`<span class="err">usage:</span> touch &lt;path&gt;`); return; }
          const path = resolvePath(target);
          const parent = ensureParentExists(path);
          if(!parent.ok){ print(`<span class="err">no such directory:</span> ${escapeHtml(parent.parent)}`); return; }
          const existing = fileSystem[path];
          if(existing){
            if(existing.type==="dir"){ print(`<span class="err">is a directory:</span> ${escapeHtml(path)}`); return; }
            // no-op
            print(`touch: <span class="ok">${escapeHtml(path)}</span>`);
            return;
          }
          fileSystem[path] = { type:"file", content:"" };
          addChild(parent.parent, baseName(path));
          print(`created: <span class="ok">${escapeHtml(path)}</span>`);
        }

        function cmdMkdir(args){
          const target = args[0];
          if(!target){ print(`<span class="err">usage:</span> mkdir &lt;path&gt;`); return; }
          const path = resolvePath(target);
          if(fileSystem[path]){ print(`<span class="err">already exists:</span> ${escapeHtml(path)}`); return; }
          const parent = ensureParentExists(path);
          if(!parent.ok){ print(`<span class="err">no such directory:</span> ${escapeHtml(parent.parent)}`); return; }
          fileSystem[path] = { type:"dir", children:[] };
          addChild(parent.parent, baseName(path));
          print(`created dir: <span class="ok">${escapeHtml(path)}/</span>`);
        }

        function cmdRm(args, raw){
          if(isRmRfEverything("rm", args, raw)){ rmRfReaction(); return; }
          if(args.length === 0){ print(`<span class="err">usage:</span> rm &lt;path&gt; / rm -r &lt;dir&gt;`); return; }
          const flags = args.filter(a => a.startsWith("-")).join("").toLowerCase();
          const recursive = flags.includes("r");
          const target = args.find(a => !a.startsWith("-"));
          if(!target){ print(`<span class="err">usage:</span> rm &lt;path&gt;`); return; }
          const path = resolvePath(target);
          if(path === "/"){ print(`<span class="err">refusing:</span> can't remove /`); return; }
          const node = fileSystem[path];
          if(!node){ print(`<span class="err">not found:</span> ${escapeHtml(path)}`); return; }

          const del = (p) => {
            const n = fileSystem[p];
            if(!n) return;
            if(n.type === "dir"){
              // recurse
              (n.children || []).slice().forEach(name => {
                const cp = (p==="/") ? `/${name}` : `${p}/${name}`;
                del(cp);
              });
            }
            delete fileSystem[p];
          };

          if(node.type === "dir" && !recursive && (node.children || []).length){
            print(`<span class="err">is a directory (not empty):</span> ${escapeHtml(path)}\n<span class="tiny">hint: rm -r ${escapeHtml(target)}</span>`);
            return;
          }

          // unlink from parent
          const par = parentDir(path);
          removeChild(par, baseName(path));
          del(path);

          // keep cwd valid
          if(cwd.startsWith(path + "/") || cwd === path){
            cwd = par || "/";
          }

          print(`removed: <span class="ok">${escapeHtml(path)}</span>`);
        }

        function cmdDate(){ print(`date: <span class="ok">${escapeHtml(new Date().toString())}</span>`); }
        function cmdTime(){ print(`now: <span class="ok">${escapeHtml(new Date().toString())}</span>`); }
        function cmdWhoami(){ print(escapeHtml(user)); }
        function cmdUname(args){
          const a = (args[0] || "").toLowerCase();
          if(a === "-a"){
            print(`AlmostOS ${escapeHtml("6.7")} (mock) #1 SMP PREEMPT\n${escapeHtml("x86_64")} ${escapeHtml(host)} ${escapeHtml(new Date().toDateString())}`);
          } else {
            print(`AlmostOS`);
          }
        }

        function cmdNeofetch(){
          const art = [
            `      ⟡      `,
            `   ⟡  ⟡  ⟡   `,
            ` ⟡    ⟡    ⟡ `,
            `   ⟡  ⟡  ⟡   `,
            `      ⟡      `
          ].join("\n");
          const lines = [
            `<span class="ok">${escapeHtml(art)}</span>`,
            `<span class="warn">${escapeHtml(user)}@${host}</span>`,
            `os: AlmostOS (multi-file)`,
            `shell: almostsh`,
            `cwd: ${escapeHtml(cwd)}`,
            `apps: ${allApps().length}`,
            `time: ${escapeHtml(new Date().toLocaleString())}`,
          ];
          print(lines.join("\n"));
        }

        function cmdPs(){
          const procs = [
            ["1", "init", "0.0", "0.2"],
            ["41", "wm", "0.3", "1.4"],
            ["72", "compositor", "0.8", "2.2"],
            ["133", "files", "0.1", "0.9"],
            ["201", "terminal", "0.2", "1.1"],
          ];
          const head = "PID   CMD          CPU  MEM";
          const body = procs.map(r => `${r[0].padEnd(5)} ${r[1].padEnd(12)} ${r[2].padStart(3)}% ${r[3].padStart(3)}%`).join("\n");
          print(head + "\n" + body);
        }

        function cmdCalc(args){
          const expr = args.join(" ").trim();
          if(!expr){ print(`<span class="err">usage:</span> calc &lt;expr&gt;`); return; }
          const ok = /^[0-9+\-*/().\s]+$/.test(expr);
          if(!ok){ print(`<span class="err">unsafe expression:</span> ${escapeHtml(expr)}`); return; }
          try{
            // eslint-disable-next-line no-eval
            const v = eval(expr);
            if(typeof v === "number" && Number.isFinite(v)) print(`<span class="ok">${escapeHtml(String(v))}</span>`);
            else print(`<span class="err">NaN</span>`);
          }catch(e){
            print(`<span class="err">error:</span> ${escapeHtml(String(e.message || e))}`);
          }
        }

        function cmdFortune(){
          const list = [
            "壁紙は雰囲気が9割。",
            "保存しないと、夢は消える。",
            "最強のコマンドは clear です。",
            "焦るとだいたい rm しがち。",
            "それっぽさは正義。"
          ];
          print(`<span class="ok">${escapeHtml(list[randInt(list.length)])}</span>`);
        }

        function cmdHistory(){
          if(!history.length){ print(`<span class="tiny">(empty)</span>`); return; }
          const out = history.slice(-30).map((h, i) => `${String(i + Math.max(0, history.length-30) + 1).padStart(3," ")}  ${escapeHtml(h)}`).join("\n");
          print(out);
        }

        function execCmd(input){
          const raw = String(input || "").trim();
          if(!raw) return;

          // store history (avoid duplicates)
          if(!history.length || history[history.length-1] !== raw) history.push(raw);
          histIdx = history.length;

          // special "rm -rf /*" reaction (even if prefixed with sudo)
          const norm = raw.replace(/\s+/g," ").trim();
          if(norm === "sudo rm -rf /*" || norm === "sudo rm -fr /*"){
            promptLine(raw);
            rmRfReaction();
            return;
          }

          promptLine(raw);

          const tokens = tokenize(raw);
          const c0 = (tokens[0] || "").toLowerCase();
          const args = tokens.slice(1);

          if(!c0) return;

          if(isRmRfEverything(c0, args, raw)){
            rmRfReaction();
            return;
          }

          switch(c0){
            case "help":
            case "man": cmdHelp(args); break;
            case "apps": cmdApps(); break;
            case "open": cmdOpen(args); break;
            case "install": cmdInstall(args); break;
            case "ls": cmdLs(args); break;
            case "tree": cmdTree(args); break;
            case "cd": cmdCd(args); break;
            case "pwd": cmdPwd(); break;
            case "cat": cmdCat(args); break;
            case "head": cmdHeadTail("head", args); break;
            case "tail": cmdHeadTail("tail", args); break;
            case "echo": cmdEcho(args); break;
            case "write": cmdWriteAppend("write", args); break;
            case "append": cmdWriteAppend("append", args); break;
            case "touch": cmdTouch(args); break;
            case "mkdir": cmdMkdir(args); break;
            case "rm": cmdRm(args, raw); break;
            case "date": cmdDate(); break;
            case "time": cmdTime(); break;
            case "whoami": cmdWhoami(); break;
            case "uname": cmdUname(args); break;
            case "neofetch": cmdNeofetch(); break;
            case "ps": cmdPs(); break;
            case "calc": cmdCalc(args); break;
            case "fortune": cmdFortune(); break;
            case "history": cmdHistory(); break;
            case "clear": term.innerHTML = ""; break;
            case "exit":
              print(`<span class="tiny">このターミナルは閉じません。だって君が戻ってくるから。</span>`);
              break;
            default: {
              const sug = suggest(c0, COMMANDS);
              const appSug = suggest(c0, allApps().map(a=>a.id));
              let hint = "";
              if(sug.length) hint = `\nmaybe command: <span class="ok">${escapeHtml(sug.join(", "))}</span>`;
              else if(appSug.length) hint = `\nmaybe app: <span class="ok">${escapeHtml(appSug.join(", "))}</span> (try: open &lt;app&gt;)`;
              print(`<span class="err">unknown command:</span> ${escapeHtml(c0)}${hint}`);
            }
          }
        }

        // ---- key bindings ----
        run.addEventListener("click", ()=> { execCmd(cmd.value); cmd.value=""; cmd.focus(); });

        cmd.addEventListener("keydown", (e)=>{
          if(e.key==="Enter"){
            e.preventDefault();
            execCmd(cmd.value);
            cmd.value="";
            return;
          }
          if(e.key==="ArrowUp"){
            if(!history.length) return;
            e.preventDefault();
            histIdx = Math.max(0, histIdx - 1);
            cmd.value = history[histIdx] || "";
            setTimeout(()=> cmd.setSelectionRange(cmd.value.length, cmd.value.length), 0);
            return;
          }
          if(e.key==="ArrowDown"){
            if(!history.length) return;
            e.preventDefault();
            histIdx = Math.min(history.length, histIdx + 1);
            cmd.value = history[histIdx] || "";
            setTimeout(()=> cmd.setSelectionRange(cmd.value.length, cmd.value.length), 0);
            return;
          }
          if(e.key==="Tab"){
            e.preventDefault();
            const val = cmd.value;
            const parts = tokenize(val);
            if(parts.length === 0) return;
            if(parts.length === 1){
              const sug = suggest(parts[0].toLowerCase(), COMMANDS);
              if(sug.length === 1){
                cmd.value = sug[0] + " ";
              } else if(sug.length > 1){
                print(sug.map(s=>escapeHtml(s)).join("  "));
              }
              return;
            }
            // path completion for common commands
            const c = (parts[0] || "").toLowerCase();
            const last = parts[parts.length-1] || "";
            const wantsPath = ["cat","ls","cd","install","rm","head","tail","touch","mkdir","write","append"].includes(c);
            if(!wantsPath) return;

            const prefix = last;
            const absPrefix = prefix.startsWith("/") || prefix.startsWith("~");
            const basePath = absPrefix ? resolvePath(prefix) : resolvePath(prefix);
            // find candidates by string prefix on fileSystem keys
            const rawPrefix = basePath.replace(/\/+/g,"/");
            const cand = Object.keys(fileSystem)
              .filter(p => p.startsWith(rawPrefix))
              .slice(0, 20);

            if(cand.length === 0) return;
            if(cand.length === 1){
              const p = cand[0];
              // complete as relative if user typed relative
              let out = p;
              if(!absPrefix){
                // make relative to cwd
                const rel = p.startsWith(cwd + "/") ? p.slice((cwd==="/" ? 1 : cwd.length+1)) : p;
                out = rel;
              }
              parts[parts.length-1] = out;
              cmd.value = parts.join(" ") + (fileSystem[p]?.type==="dir" ? "/" : " ");
              return;
            }
            // multiple
            const shown = cand.map(p => {
              const n = fileSystem[p]?.type==="dir" ? (p + "/") : p;
              return escapeHtml(n);
            });
            print(shown.join("\n"));
            return;
          }
        });

        // ---- banner ----
        print(`<span class="ok">almostsh</span> — <span class="tiny">雰囲気重視の擬似ターミナル</span>`);
        print(`<span class="tiny">type <span class="warn">help</span>.  ↑/↓で履歴、Tabで補完。</span>`);
        print(`<span class="tiny">危険コマンドはだいたいジョークです。安心して遊んでね。</span>`);

        setTimeout(()=> cmd.focus(), 0);
      }
    });
  }

  



  

  function openBrowser(){
    createWindow({
      appId:"browser",
      title:"Browser",
      icon:"🌐",
      subtitle:"webview (limited)",
      size:"lg",
      contentBuilder: (root, ctx) => {
        root.innerHTML = `
          <div class="pane" style="padding:0; display:flex; flex-direction:column; min-height:0; height:100%">
            <div style="display:flex; gap:8px; align-items:center; padding:10px; border-bottom:1px solid rgba(255,255,255,.10); background:rgba(0,0,0,.10)">
              <button class="wbtn" id="bBack" title="Back">←</button>
              <button class="wbtn" id="bFwd" title="Forward">→</button>
              <button class="wbtn" id="bReload" title="Reload">⟲</button>
              <input class="input" id="bUrl" spellcheck="false" placeholder="URL または検索語（Enter）" style="flex:1; height:36px; padding:0 12px" />
              <button class="btn ghost" id="bNewTab" title="Open in new tab">↗︎ 外部</button>
            </div>
            <div class="tiny" style="padding:8px 10px; border-bottom:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.03)">
              ここはiframeブラウザ。サイトによっては <span class="badge">X-Frame-Options</span> 等で表示できません（その場合は「外部」へ）。
            </div>
            <div class="iframeWrap" style="flex:1; border-top:none">
              <iframe class="appframe" id="bFrame"
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-same-origin"
                referrerpolicy="no-referrer"></iframe>
            </div>
          </div>
        `;

        const frame = root.querySelector("#bFrame");
        const urlInput = root.querySelector("#bUrl");
        const backBtn = root.querySelector("#bBack");
        const fwdBtn = root.querySelector("#bFwd");
        const reloadBtn = root.querySelector("#bReload");
        const newTabBtn = root.querySelector("#bNewTab");

        const hist = { list: [], idx: -1 };

        function normalize(input){
          let s = (input||"").trim();
          if(!s) return "about:blank";
          const looksUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)
            || /^[\w.-]+\.[a-zA-Z]{2,}(\/|$)/.test(s)
            || s.startsWith("localhost")
            || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(s);
          if(looksUrl){
            if(!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) s = "https://" + s;
            return s;
          }
          const q = encodeURIComponent(s);
          return "https://html.duckduckgo.com/html/?q=" + q;
        }

        function setNavButtons(){
          backBtn.disabled = !(hist.idx > 0);
          fwdBtn.disabled = !(hist.idx >= 0 && hist.idx < hist.list.length - 1);
        }

        function navigate(input, push=true){
          const url = normalize(input);
          frame.src = url;
          urlInput.value = url;
          ctx.setTitle("Browser — " + url.replace(/^https?:\/\//,''));
          if(push){
            hist.list = hist.list.slice(0, hist.idx+1);
            hist.list.push(url);
            hist.idx = hist.list.length - 1;
          }
          setNavButtons();
        }

        navigate("https://html.duckduckgo.com/html/", true);

        urlInput.addEventListener("keydown", (e)=>{
          if(e.key==="Enter"){
            navigate(urlInput.value, true);
          }
        });

        backBtn.addEventListener("click", ()=>{
          if(hist.idx>0){
            hist.idx -= 1;
            navigate(hist.list[hist.idx], false);
          }
        });

        fwdBtn.addEventListener("click", ()=>{
          if(hist.idx < hist.list.length-1){
            hist.idx += 1;
            navigate(hist.list[hist.idx], false);
          }
        });

        reloadBtn.addEventListener("click", ()=>{
          try{
            frame.contentWindow.location.reload();
          }catch(e){
            if(hist.idx>=0) navigate(hist.list[hist.idx], false);
          }
        });

        newTabBtn.addEventListener("click", ()=>{
          const url = normalize(urlInput.value);
          window.open(url, "_blank", "noopener,noreferrer");
        });

        frame.addEventListener("load", ()=>{
          try{
            const t = frame.contentDocument && frame.contentDocument.title;
            if(t) ctx.setTitle("Browser — " + t);
          }catch(e){}
        });

        setNavButtons();
        setTimeout(()=> urlInput.focus(), 0);
      }
    });
  }

  // ---- Built-in Utilities & Games ----
  function onWindowRemoved(root, fn){
    const winEl = root && root.closest ? root.closest(".win") : null;
    if(!winEl) return ()=>{};
    let done = false;
    const safe = ()=>{
      if(done) return;
      done = true;
      try{ fn && fn(); }catch(_){}
    };
    const mo = new MutationObserver(()=>{
      if(!winEl.isConnected){
        safe();
        try{ mo.disconnect(); }catch(_){}
      }
    });
    try{ mo.observe(desktop, { childList:true }); }catch(_){}
    return safe;
  }

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function pad2(n){ return String(n).padStart(2,"0"); }
  function fmtMs(ms){
    ms = Math.max(0, ms|0);
    const s = Math.floor(ms/1000);
    const m = Math.floor(s/60);
    const ss = s%60;
    const ds = Math.floor((ms%1000)/100);
    return `${pad2(m)}:${pad2(ss)}.${ds}`;
  }
  function randInt(max){
    try{
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return arr[0] % max;
    }catch(_){
      return Math.floor(Math.random() * max);
    }
  }


  function openTaskManager(){
    // System processes are always visible in Task Manager.
    // Stopping ANY of them triggers an instant BSOD (as requested).
    const SYSTEM_PROCS = [
      { pid: 4,   name: "System",                kind:"system", status:"Running" },
      { pid: 88,  name: "Registry",              kind:"system", status:"Running" },
      { pid: 112, name: "Window Manager",        kind:"system", status:"Running" },
      { pid: 144, name: "Compositor",            kind:"system", status:"Running" },
      { pid: 188, name: "Audio Service",         kind:"system", status:"Running" },
      { pid: 233, name: "Network Service",       kind:"system", status:"Running" },
      { pid: 320, name: "AlmostGuard™",          kind:"system", status:"Running" },
      { pid: 512, name: "System Idle Process",   kind:"system", status:"Running" },
    ];

    createWindow({
      appId:"taskmgr",
      title:"Task Manager",
      icon:"📊",
      subtitle:"プロセス / パフォーマンス",
      size:"lg",
      contentBuilder: (root, ctx) => {
        root.innerHTML = `
          <div class="tmWrap">
            <div class="tmSide">
              <div class="tmBrand">
                <div class="tmBrandIco">📊</div>
                <div>
                  <div class="tmBrandName">Task Manager</div>
                  <div class="tmBrandSub tiny">almostos.sys</div>
                </div>
              </div>

              <button class="tmNavBtn active" data-tab="procs">🧩 プロセス</button>
              <button class="tmNavBtn" data-tab="perf">📈 パフォーマンス</button>

              <div class="tmSideFoot tiny">
                Ctrl+Shift+Esc で起動 / システム停止は <b class="warn">即BSOD</b>
              </div>
            </div>

            <div class="tmMain">
              <div class="tmTop">
                <div>
                  <div class="tmTitle" id="tmTitle">プロセス</div>
                  <div class="tmSub tiny" id="tmSub">実行中のアプリとシステムプロセス</div>
                </div>
                <div class="tmTopActions">
                  <input class="input tmSearch" id="tmSearch" placeholder="検索（名前 / PID）" spellcheck="false" />
                  <button class="btn danger" id="tmEndBtn" disabled>終了</button>
                </div>
              </div>

              <div class="tmPane" id="tmPaneProcs">
                <div class="tmTable">
                  <div class="tmRow tmHead">
                    <div>名前</div>
                    <div class="r">PID</div>
                    <div>状態</div>
                    <div class="r">CPU</div>
                    <div class="r">メモリ</div>
                    <div class="r"></div>
                  </div>
                  <div id="tmBody"></div>
                </div>
              </div>

              <div class="tmPane hidden" id="tmPanePerf">
                <div class="tmPerfGrid">
                  <div class="tmPerfCard active" data-m="cpu">
                    <div class="tmPerfTop">
                      <div class="tmPerfLabel">CPU</div>
                      <div class="tmPerfVal" id="tmCpuVal">0%</div>
                    </div>
                    <canvas class="tmPerfCv" id="tmCpuCv"></canvas>
                  </div>

                  <div class="tmPerfCard" data-m="mem">
                    <div class="tmPerfTop">
                      <div class="tmPerfLabel">メモリ</div>
                      <div class="tmPerfVal" id="tmMemVal">0%</div>
                    </div>
                    <canvas class="tmPerfCv" id="tmMemCv"></canvas>
                  </div>

                  <div class="tmPerfCard" data-m="disk">
                    <div class="tmPerfTop">
                      <div class="tmPerfLabel">ディスク</div>
                      <div class="tmPerfVal" id="tmDiskVal">0%</div>
                    </div>
                    <canvas class="tmPerfCv" id="tmDiskCv"></canvas>
                  </div>

                  <div class="tmPerfCard" data-m="net">
                    <div class="tmPerfTop">
                      <div class="tmPerfLabel">ネットワーク</div>
                      <div class="tmPerfVal" id="tmNetVal">0%</div>
                    </div>
                    <canvas class="tmPerfCv" id="tmNetCv"></canvas>
                  </div>
                </div>

                <div class="tmPerfBig">
                  <div class="tmPerfBigTop">
                    <div>
                      <div class="tmPerfBigLabel" id="tmBigLabel">CPU</div>
                      <div class="tiny" id="tmBigSub">使用率</div>
                    </div>
                    <div class="tmPerfBigVal" id="tmBigVal">0%</div>
                  </div>
                  <canvas class="tmPerfBigCv" id="tmBigCv"></canvas>
                  <div class="tmPerfInfo tiny" id="tmPerfInfo">—</div>
                </div>
              </div>
            </div>
          </div>
        `;

        // --- elements
        const navBtns = $$(".tmNavBtn", root);
        const paneProcs = $("#tmPaneProcs", root);
        const panePerf  = $("#tmPanePerf", root);
        const titleEl = $("#tmTitle", root);
        const subEl = $("#tmSub", root);
        const searchEl = $("#tmSearch", root);
        const endBtn = $("#tmEndBtn", root);
        const bodyEl = $("#tmBody", root);

        const cpuVal = $("#tmCpuVal", root);
        const memVal = $("#tmMemVal", root);
        const diskVal= $("#tmDiskVal", root);
        const netVal = $("#tmNetVal", root);

        const cpuCv  = $("#tmCpuCv", root);
        const memCv  = $("#tmMemCv", root);
        const diskCv = $("#tmDiskCv", root);
        const netCv  = $("#tmNetCv", root);

        const bigLabel = $("#tmBigLabel", root);
        const bigSub   = $("#tmBigSub", root);
        const bigVal   = $("#tmBigVal", root);
        const bigCv    = $("#tmBigCv", root);
        const perfInfo = $("#tmPerfInfo", root);

        // --- state
        let activeTab = "procs";
        let selectedPid = null;
        let selectedMetric = "cpu";

        const SERIES_LEN = 60;
        const perfSeries = {
          cpu: Array(SERIES_LEN).fill(0),
          mem: Array(SERIES_LEN).fill(0),
          disk: Array(SERIES_LEN).fill(0),
          net: Array(SERIES_LEN).fill(0),
        };

        const procStats = new Map(); // pid -> {cpu, memMB, disk, net}
        const procsByPid = new Map(); // current snapshot

        function pushSeries(arr, v){
          arr.push(v);
          while(arr.length > SERIES_LEN) arr.shift();
        }

        function pct(n){ return `${Math.round(clamp(n,0,100))}%`; }
        function fmtMB(mb){
          mb = Math.max(0, mb);
          if(mb >= 1024) return `${(mb/1024).toFixed(1)} GB`;
          return `${Math.round(mb)} MB`;
        }

        function getAppProcs(){
          const out = [];
          for(const id of state.order){
            const w = state.windows.get(id);
            if(!w) continue;
            if(!w.pid) w.pid = allocPid();

            const meta = allApps().find(a => a.id === w.appId);
            const appName = meta?.name || w.appId || "app";
            const title = w.title || appName;

            out.push({
              pid: w.pid,
              name: title,
              kind: "app",
              appId: w.appId,
              winId: id,
              status: w.minimized ? "Suspended" : "Running",
            });
          }
          return out;
        }

        function ensureStats(proc){
          const pid = proc.pid;
          if(!procStats.has(pid)){
            const base = (proc.kind === "system") ? (40 + randInt(240)) : (90 + randInt(900));
            procStats.set(pid, { cpu: 0.2 + Math.random(), memMB: base, disk: 0, net: 0 });
          }
          return procStats.get(pid);
        }

        function tickStats(procs){
          let cpuSum = 0;
          let memSum = 0;
          let diskAgg = 0;
          let netAgg = 0;

          for(const p of procs){
            const st = ensureStats(p);

            // --- CPU target (fake but plausible)
            let targetCpu = (p.kind === "system") ? (0.2 + Math.random()*1.4) : (0.7 + Math.random()*6.5);
            if(p.name.toLowerCase().includes("idle")) targetCpu = 12 + Math.random()*24;
            if(p.appId === "browser") targetCpu += 3 + Math.random()*7;
            if(p.appId === "terminal") targetCpu += 0.4 + Math.random()*1.4;
            if(p.appId === "mines" || p.appId === "snake" || p.appId === "game2048") targetCpu += 1 + Math.random()*3;

            if(p.status === "Suspended") targetCpu *= 0.22;

            const noise = (Math.random() - 0.5) * 0.7;
            st.cpu = clamp(st.cpu * 0.85 + targetCpu * 0.15 + noise, 0, 98);

            // --- Memory drift
            const memTarget = (p.kind === "system") ? (60 + randInt(280)) : (140 + randInt(1300));
            st.memMB = clamp(st.memMB * 0.92 + memTarget * 0.08 + (Math.random() - 0.5) * 10, 22, 8192);

            // --- Disk / Net (aggregate-ish)
            st.disk = clamp(st.disk * 0.70 + Math.random() * (p.kind==="system" ? 2.5 : 4.8), 0, 100);
            st.net  = clamp(st.net  * 0.70 + Math.random() * (p.appId==="browser" ? 6.0 : 3.2), 0, 100);

            cpuSum += st.cpu;
            memSum += st.memMB;
            diskAgg += st.disk;
            netAgg  += st.net;
          }

          // totals
          const cpu = clamp(cpuSum, 0, 100);
          const totalMemGB = 8; // pretend: 8GB
          const memPct = clamp(memSum / (totalMemGB * 1024) * 100, 0, 100);

          const disk = clamp((diskAgg / Math.max(1, procs.length)) * 1.35, 0, 100);
          const net  = clamp((netAgg  / Math.max(1, procs.length)) * 1.55, 0, 100);

          return { cpu, memPct, disk, net, memSum, totalMemGB };
        }

        function drawGraph(canvas, data, accent=false){
          if(!canvas) return;
          const ctx2 = canvas.getContext("2d");
          const dpr = window.devicePixelRatio || 1;
          const w = canvas.clientWidth || 260;
          const h = canvas.clientHeight || 70;
          const ww = Math.max(1, Math.round(w * dpr));
          const hh = Math.max(1, Math.round(h * dpr));
          if(canvas.width !== ww || canvas.height !== hh){
            canvas.width = ww;
            canvas.height = hh;
          }
          ctx2.setTransform(dpr,0,0,dpr,0,0);
          ctx2.clearRect(0,0,w,h);

          // grid
          ctx2.globalAlpha = 0.22;
          ctx2.lineWidth = 1;
          ctx2.strokeStyle = "rgba(255,255,255,.22)";
          ctx2.beginPath();
          for(let i=1;i<4;i++){
            const y = (h/4)*i;
            ctx2.moveTo(0,y);
            ctx2.lineTo(w,y);
          }
          ctx2.stroke();
          ctx2.globalAlpha = 1;

          const n = Math.max(2, data.length);
          const toXY = (i, v) => {
            const x = (i / (n-1)) * w;
            const y = h - (clamp(v,0,100)/100) * h;
            return [x,y];
          };

          // area
          ctx2.beginPath();
          for(let i=0;i<data.length;i++){
            const [x,y] = toXY(i, data[i]);
            if(i===0) ctx2.moveTo(x,y);
            else ctx2.lineTo(x,y);
          }
          ctx2.lineTo(w,h);
          ctx2.lineTo(0,h);
          ctx2.closePath();
          ctx2.fillStyle = accent ? "rgba(124,92,255,.16)" : "rgba(255,255,255,.07)";
          ctx2.fill();

          // line
          ctx2.beginPath();
          for(let i=0;i<data.length;i++){
            const [x,y] = toXY(i, data[i]);
            if(i===0) ctx2.moveTo(x,y);
            else ctx2.lineTo(x,y);
          }
          ctx2.lineWidth = 2;
          ctx2.strokeStyle = accent ? "rgba(124,92,255,.95)" : "rgba(255,255,255,.65)";
          ctx2.stroke();
        }

        function setTab(tab){
          activeTab = tab;
          navBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
          paneProcs.classList.toggle("hidden", tab !== "procs");
          panePerf.classList.toggle("hidden",  tab !== "perf");

          if(tab === "procs"){
            titleEl.textContent = "プロセス";
            subEl.textContent = "実行中のアプリとシステムプロセス";
            searchEl.placeholder = "検索（名前 / PID）";
          }else{
            titleEl.textContent = "パフォーマンス";
            subEl.textContent = "使用率（擬似） / グラフ";
            searchEl.placeholder = "（プロセス検索ではありません）";
          }
        }

        function setMetric(m){
          selectedMetric = m;
          $$(".tmPerfCard", root).forEach(c => c.classList.toggle("active", c.dataset.m === m));
          const map = { cpu:"CPU", mem:"メモリ", disk:"ディスク", net:"ネットワーク" };
          bigLabel.textContent = map[m] || "CPU";
          bigSub.textContent = (m==="cpu") ? "使用率" : (m==="mem" ? "使用率 / 使用量" : "使用率");
        }

        // --- process table rendering
        function rowHtml(p, st){
          const cpu = st ? st.cpu : 0;
          const mem = st ? st.memMB : 0;
          const isSystem = p.kind === "system";
          const badge = isSystem ? `<span class="tmBadge sys">SYSTEM</span>` : `<span class="tmBadge app">APP</span>`;
          const name = `${badge}<span class="tmName">${escapeHtml(p.name)}</span>`;
          const status = escapeHtml(p.status || "Running");

          const end = `<button class="tmEndBtn" data-act="end" data-pid="${p.pid}" title="${isSystem ? "停止すると即BSOD" : "プロセスを終了"}">終了</button>`;

          return `
            <div class="tmRow tmData ${isSystem ? "sys" : ""} ${selectedPid===p.pid ? "sel" : ""}" data-pid="${p.pid}">
              <div class="tmNameCell">${name}</div>
              <div class="r">${escapeHtml(String(p.pid))}</div>
              <div>${status}</div>
              <div class="r">${pct(cpu)}</div>
              <div class="r">${fmtMB(mem)}</div>
              <div class="r">${end}</div>
            </div>
          `;
        }

        function groupHeader(label){
          return `<div class="tmGroup">${escapeHtml(label)}</div>`;
        }

        function updateProcessTable(procs){
          if(!bodyEl) return;

          // filter
          const q = String(searchEl.value || "").trim().toLowerCase();
          let list = procs.slice();

          if(q && activeTab === "procs"){
            list = list.filter(p => {
              const s = `${p.name} ${p.pid}`.toLowerCase();
              return s.includes(q);
            });
          }

          // split groups
          const sys = list.filter(p => p.kind === "system");
          const app = list.filter(p => p.kind !== "system");

          // stable sort: CPU desc within each group
          const cpuOf = (p)=>{
            const st = procStats.get(p.pid);
            return st ? st.cpu : 0;
          };
          sys.sort((a,b)=>cpuOf(b)-cpuOf(a));
          app.sort((a,b)=>cpuOf(b)-cpuOf(a));

          // keep selection valid
          if(selectedPid !== null && !list.some(p => p.pid === selectedPid)){
            selectedPid = null;
            endBtn.disabled = true;
          }

          let html = "";
          html += groupHeader("システム プロセス");
          sys.forEach(p => html += rowHtml(p, procStats.get(p.pid)));
          html += groupHeader("アプリ");
          app.forEach(p => html += rowHtml(p, procStats.get(p.pid)));

          bodyEl.innerHTML = html;
        }

        function updatePerfUI(totals, procs){
          const { cpu, memPct, disk, net, memSum, totalMemGB } = totals;

          cpuVal.textContent = pct(cpu);
          memVal.textContent = pct(memPct);
          diskVal.textContent = pct(disk);
          netVal.textContent = pct(net);

          drawGraph(cpuCv, perfSeries.cpu, selectedMetric==="cpu");
          drawGraph(memCv, perfSeries.mem, selectedMetric==="mem");
          drawGraph(diskCv, perfSeries.disk, selectedMetric==="disk");
          drawGraph(netCv, perfSeries.net, selectedMetric==="net");

          const series = perfSeries[selectedMetric] || perfSeries.cpu;
          bigVal.textContent = pct(selectedMetric==="mem" ? memPct : (selectedMetric==="disk" ? disk : (selectedMetric==="net" ? net : cpu)));
          drawGraph(bigCv, series, true);

          const appCount = procs.filter(p=>p.kind==="app").length;
          const sysCount = procs.filter(p=>p.kind==="system").length;

          if(selectedMetric==="cpu"){
            perfInfo.innerHTML = `
              CPU: <b>${pct(cpu)}</b> /
              Processes: <b>${appCount + sysCount}</b> (Apps ${appCount} / System ${sysCount}) /
              Model: <span class="badge">AlmostCore i7-00K</span>
            `;
          }else if(selectedMetric==="mem"){
            const usedGB = memSum / 1024;
            perfInfo.innerHTML = `
              使用中: <b>${usedGB.toFixed(1)} GB</b> / 合計: <b>${totalMemGB} GB</b> /
              圧縮: <b>${(Math.random()*0.6).toFixed(1)} GB</b> /
              キャッシュ: <b>${(Math.random()*2.0).toFixed(1)} GB</b>
            `;
          }else if(selectedMetric==="disk"){
            perfInfo.innerHTML = `
              ディスク: <b>${pct(disk)}</b> /
              Active time / queue (mock) /
              Device: <span class="badge">NVMe 256GB</span>
            `;
          }else{
            perfInfo.innerHTML = `
              ネットワーク: <b>${pct(net)}</b> /
              Send/Recv (mock) /
              Adapter: <span class="badge">Wi‑Fi</span>
            `;
          }
        }

        function killProcessByPid(pid){
          const p = procsByPid.get(pid);
          if(!p) return;

          // Stopping any system process => instant BSOD.
          if(p.kind === "system"){
            crashToBSOD({
              stopCode: "CRITICAL_PROCESS_DIED",
              whatFailed: "taskmgr.exe",
              details: `Terminated system process: ${p.name}`
            });
            return;
          }

          // App process -> close its window
          if(p.winId){
            closeWin(p.winId);
            showToast(`終了: ${p.name}`);
          }
        }

        // --- events
        navBtns.forEach(b => b.addEventListener("click", ()=> setTab(b.dataset.tab)));
        endBtn.addEventListener("click", ()=> { if(selectedPid!=null) killProcessByPid(selectedPid); });

        // delegate row selection + end buttons
        root.addEventListener("click", (e)=>{
          const end = e.target && e.target.closest && e.target.closest("[data-act='end']");
          if(end){
            const pid = Number(end.getAttribute("data-pid"));
            if(Number.isFinite(pid)) killProcessByPid(pid);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          const row = e.target && e.target.closest && e.target.closest(".tmRow.tmData");
          if(row && row.dataset && row.dataset.pid){
            const pid = Number(row.dataset.pid);
            if(Number.isFinite(pid)){
              selectedPid = pid;
              endBtn.disabled = false;

              // update selection highlight
              $$(".tmRow.tmData", root).forEach(r => r.classList.toggle("sel", Number(r.dataset.pid) === pid));
            }
          }
        });

        // perf metric selection
        $$(".tmPerfCard", root).forEach(card => {
          card.addEventListener("click", ()=>{
            const m = card.dataset.m || "cpu";
            setMetric(m);
          });
        });

        // --- main loop
        function snapshotProcs(){
          const apps = getAppProcs();
          const sys = SYSTEM_PROCS.map(p => ({...p}));
          const all = [...sys, ...apps];

          procsByPid.clear();
          all.forEach(p => procsByPid.set(p.pid, p));

          // clean up stats for processes that disappeared (keep a little to avoid flicker)
          const alive = new Set(all.map(p=>p.pid));
          for(const pid of procStats.keys()){
            if(!alive.has(pid) && Math.random() < 0.35) procStats.delete(pid);
          }

          return all;
        }

        function loop(){
          const procs = snapshotProcs();
          const totals = tickStats(procs);

          pushSeries(perfSeries.cpu, totals.cpu);
          pushSeries(perfSeries.mem, totals.memPct);
          pushSeries(perfSeries.disk, totals.disk);
          pushSeries(perfSeries.net, totals.net);

          if(activeTab === "procs"){
            updateProcessTable(procs);
          }else{
            // keep table reasonably fresh even when not visible
            if(Math.random() < 0.18) updateProcessTable(procs);
          }
          updatePerfUI(totals, procs);
        }

        setTab("procs");
        setMetric("cpu");

        // initial draw
        loop();

        const timer = setInterval(loop, 650);
        const onResize = ()=> {
          // redraw for crispness
          try{ loop(); }catch(_){}
        };
        window.addEventListener("resize", onResize);

        // cleanup
        onWindowRemoved(root, ()=>{
          try{ clearInterval(timer); }catch(_){}
          window.removeEventListener("resize", onResize);
        });
      }
    });
  }
  function openCalculator(){
    createWindow({
      appId:"calculator",
      title:"Calculator",
      icon:"🧮",
      subtitle:"四則演算",
      size:"sm",
      contentBuilder: (root) => {
        root.innerHTML = `
          <div class="pane">
            <div class="card calc">
              <div class="calc-top">
                <input class="input calc-input" id="calcExpr" spellcheck="false" placeholder="例: (12+3.4)*5/2" />
                <div class="calc-result" id="calcRes">0</div>
              </div>
              <div class="calc-grid" id="calcGrid"></div>
              <div class="tiny" style="margin-top:10px; opacity:.75">Enter / = で計算。使える記号: <span class="badge">()+-*/.</span></div>
            </div>
          </div>
        `;
        const expr = $("#calcExpr", root);
        const res = $("#calcRes", root);
        const grid = $("#calcGrid", root);

        const layout = [
          ["C","⌫","(",")"],
          ["7","8","9","/"],
          ["4","5","6","*"],
          ["1","2","3","-"],
          ["0",".","=","+"],
        ];

        layout.flat().forEach(k=>{
          const b = document.createElement("button");
          b.className = "calc-btn" + (["/","*","-","+"].includes(k) ? " op" : "") + (k==="=" ? " eq" : "") + (k==="C" ? " danger" : "");
          b.textContent = k;
          b.dataset.k = k;
          b.addEventListener("click", ()=> handle(k));
          grid.appendChild(b);
        });

        function safeEval(s){
          const raw = String(s||"").trim();
          if(!raw) return null;
          const ok = /^[0-9+\-*/().\s]+$/.test(raw);
          if(!ok) throw new Error("式に使えない文字がある");
          // prevent things like "2..3" → still ok but JS will error
          // soft limit length
          if(raw.length > 120) throw new Error("長すぎ");
          const v = Function(`"use strict"; return (${raw});`)();
          if(typeof v !== "number" || !isFinite(v)) throw new Error("計算できない");
          return v;
        }

        function compute(commit){
          try{
            const v = safeEval(expr.value);
            if(v===null){ res.textContent = "0"; return; }
            const out = (Math.abs(v) >= 1e12 || (Math.abs(v) > 0 && Math.abs(v) < 1e-9)) ? v.toExponential(8) : String(+v.toFixed(10)).replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
            res.textContent = out;
            if(commit) expr.value = out;
          }catch(e){
            res.textContent = "—";
          }
        }

        let t=null;
        expr.addEventListener("input", ()=>{
          clearTimeout(t);
          t = setTimeout(()=> compute(false), 120);
        });
        expr.addEventListener("keydown", (e)=>{
          if(e.key==="Enter"){ e.preventDefault(); compute(true); }
          if(e.key==="Escape"){ expr.value=""; compute(false); }
        });

        function handle(k){
          const v = expr.value;
          if(k==="C"){ expr.value=""; compute(false); expr.focus(); return; }
          if(k==="⌫"){ expr.value = v.slice(0,-1); compute(false); expr.focus(); return; }
          if(k==="="){ compute(true); expr.focus(); return; }
          expr.value = v + k;
          compute(false);
          expr.focus();
        }

        setTimeout(()=> expr.focus(), 0);
      }
    });
  }

  function openClockTools(){
    createWindow({
      appId:"clocktools",
      title:"Clock",
      icon:"⏱️",
      subtitle:"Timer / Stopwatch",
      size:"sm",
      contentBuilder: (root) => {
        root.innerHTML = `
          <div class="pane">
            <div class="card clocktools">
              <div class="tabs">
                <button class="tab active" data-tab="timer">Timer</button>
                <button class="tab" data-tab="sw">Stopwatch</button>
              </div>

              <div class="tabpane" data-pane="timer">
                <div class="clock-big" id="tDisp">05:00.0</div>
                <div class="row" style="margin-top:10px">
                  <div class="card" style="padding:10px">
                    <div class="tiny" style="margin-bottom:6px">設定</div>
                    <div class="row">
                      <input class="input" id="tMin" inputmode="numeric" placeholder="min" />
                      <input class="input" id="tSec" inputmode="numeric" placeholder="sec" />
                    </div>
                    <div class="row" style="margin-top:8px">
                      <button class="btn ghost" data-add="60">+1m</button>
                      <button class="btn ghost" data-add="10">+10s</button>
                      <button class="btn ghost" data-add="-10">-10s</button>
                      <button class="btn ghost" data-add="-60">-1m</button>
                    </div>
                  </div>
                </div>
                <div class="row" style="margin-top:10px">
                  <button class="btn" id="tStart">Start</button>
                  <button class="btn ghost" id="tPause" disabled>Pause</button>
                  <button class="btn ghost" id="tReset">Reset</button>
                </div>
                <div class="tiny" style="margin-top:10px; opacity:.75">0になったらトーストで通知します。</div>
              </div>

              <div class="tabpane hidden" data-pane="sw">
                <div class="clock-big" id="swDisp">00:00.0</div>
                <div class="row" style="margin-top:10px">
                  <button class="btn" id="swStart">Start</button>
                  <button class="btn ghost" id="swLap" disabled>Lap</button>
                  <button class="btn ghost" id="swReset">Reset</button>
                </div>
                <div class="card" style="margin-top:10px; padding:10px; max-height:200px; overflow:auto">
                  <div class="tiny" style="opacity:.75; margin-bottom:6px">Laps</div>
                  <div class="laps" id="laps"></div>
                </div>
              </div>
            </div>
          </div>
        `;

        const tabs = $$(".tab", root);
        const panes = $$(".tabpane", root);
        const show = (name)=>{
          tabs.forEach(b=> b.classList.toggle("active", b.dataset.tab===name));
          panes.forEach(p=> p.classList.toggle("hidden", p.dataset.pane!==name));
        };
        tabs.forEach(b=> b.addEventListener("click", ()=> show(b.dataset.tab)));

        // Timer
        const tDisp = $("#tDisp", root);
        const tMin = $("#tMin", root);
        const tSec = $("#tSec", root);
        const tStart = $("#tStart", root);
        const tPause = $("#tPause", root);
        const tReset = $("#tReset", root);

        let tLeft = 5*60*1000;
        let tRunning = false;
        let tLast = 0;
        let tTick = null;

        function renderTimer(){
          tDisp.textContent = fmtMs(tLeft);
        }
        function setFromInputs(){
          const m = clamp(parseInt(tMin.value||"0",10)||0, 0, 999);
          const s = clamp(parseInt(tSec.value||"0",10)||0, 0, 59);
          tLeft = (m*60+s)*1000;
          renderTimer();
        }
        function syncInputs(){
          const s = Math.floor(tLeft/1000);
          tMin.value = String(Math.floor(s/60));
          tSec.value = String(s%60);
        }

        function startTimer(){
          if(tRunning) return;
          if(tLeft<=0) setFromInputs();
          if(tLeft<=0) { showToast("時間を設定してね"); return; }
          tRunning = true;
          tLast = performance.now();
          tStart.textContent = "Running";
          tStart.disabled = true;
          tPause.disabled = false;

          tTick = setInterval(()=>{
            const now = performance.now();
            const dt = now - tLast;
            tLast = now;
            tLeft = Math.max(0, tLeft - dt);
            renderTimer();
            if(tLeft<=0){
              stopTimer();
              showToast("⏱️ Timer finished");
            }
          }, 100);
        }
        function stopTimer(){
          tRunning = false;
          if(tTick){ clearInterval(tTick); tTick=null; }
          tStart.textContent = "Start";
          tStart.disabled = false;
          tPause.disabled = true;
        }

        tStart.addEventListener("click", startTimer);
        tPause.addEventListener("click", stopTimer);
        tReset.addEventListener("click", ()=>{
          stopTimer();
          setFromInputs();
          syncInputs();
        });

        [tMin, tSec].forEach(inp=>{
          inp.addEventListener("change", ()=>{
            if(tRunning) return;
            setFromInputs();
          });
        });

        $$(".clocktools [data-add]", root).forEach(b=>{
          b.addEventListener("click", ()=>{
            if(tRunning) return;
            const add = parseInt(b.dataset.add,10)||0;
            tLeft = Math.max(0, tLeft + add*1000);
            renderTimer();
            syncInputs();
          });
        });

        // Stopwatch
        const swDisp = $("#swDisp", root);
        const swStart = $("#swStart", root);
        const swLap = $("#swLap", root);
        const swReset = $("#swReset", root);
        const laps = $("#laps", root);

        let swRunning=false;
        let swStartAt=0;
        let swAcc=0;
        let swInt=null;
        let lapN=0;

        function renderSw(){
          const ms = swAcc + (swRunning ? (performance.now()-swStartAt) : 0);
          swDisp.textContent = fmtMs(ms);
        }
        function startSw(){
          if(swRunning) return;
          swRunning=true;
          swStartAt = performance.now();
          swStart.textContent="Stop";
          swLap.disabled=false;
          swInt = setInterval(renderSw, 80);
        }
        function stopSw(){
          if(!swRunning) return;
          swRunning=false;
          swAcc += performance.now()-swStartAt;
          swStart.textContent="Start";
          swLap.disabled=true;
          if(swInt){ clearInterval(swInt); swInt=null; }
          renderSw();
        }

        swStart.addEventListener("click", ()=> swRunning ? stopSw() : startSw());
        swReset.addEventListener("click", ()=>{
          stopSw();
          swAcc=0; lapN=0; laps.innerHTML="";
          renderSw();
        });
        swLap.addEventListener("click", ()=>{
          const ms = swAcc + (swRunning ? (performance.now()-swStartAt) : 0);
          lapN += 1;
          const d = document.createElement("div");
          d.className = "lap";
          d.innerHTML = `<span class="badge">#${lapN}</span><span style="font-family:var(--mono)">${escapeHtml(fmtMs(ms))}</span>`;
          laps.prepend(d);
        });

        renderTimer();
        syncInputs();
        renderSw();

        const cleanup = ()=>{
          try{ if(tTick) clearInterval(tTick); }catch(_){}
          try{ if(swInt) clearInterval(swInt); }catch(_){}
        };
        onWindowRemoved(root, cleanup);
      }
    });
  }

  function openConverter(){
    createWindow({
      appId:"converter",
      title:"Converter",
      icon:"🔁",
      subtitle:"単位変換",
      size:"sm",
      contentBuilder: (root) => {
        root.innerHTML = `
          <div class="pane">
            <div class="card">
              <h2>単位変換</h2>
              <div class="row" style="margin-top:8px">
                <select class="input" id="cat">
                  <option value="len">Length</option>
                  <option value="mass">Mass</option>
                  <option value="temp">Temperature</option>
                </select>
                <input class="input" id="val" inputmode="decimal" placeholder="value" />
              </div>
              <div class="row" style="margin-top:8px">
                <select class="input" id="from"></select>
                <select class="input" id="to"></select>
              </div>
              <div class="card" style="margin-top:10px; padding:12px">
                <div class="tiny" style="opacity:.75">Result</div>
                <div class="conv-out" id="out">—</div>
              </div>
              <div class="tiny" style="margin-top:10px; opacity:.75">小数はOK。温度は C / F / K を相互変換。</div>
            </div>
          </div>
        `;

        const cat = $("#cat", root);
        const val = $("#val", root);
        const from = $("#from", root);
        const to = $("#to", root);
        const out = $("#out", root);

        const LEN = {
          "mm": 0.001,
          "cm": 0.01,
          "m": 1,
          "km": 1000,
          "inch": 0.0254,
          "ft": 0.3048,
          "yd": 0.9144,
          "mile": 1609.344
        };
        const MASS = {
          "g": 0.001,
          "kg": 1,
          "t": 1000,
          "oz": 0.028349523125,
          "lb": 0.45359237
        };

        function fillUnits(map, a, b){
          const keys = Object.keys(map);
          from.innerHTML = keys.map(k=>`<option value="${escapeAttr(k)}">${escapeHtml(k)}</option>`).join("");
          to.innerHTML = keys.map(k=>`<option value="${escapeAttr(k)}">${escapeHtml(k)}</option>`).join("");
          from.value = a || keys[0];
          to.value = b || keys[1] || keys[0];
        }

        function convert(){
          const x = parseFloat(String(val.value||"").replace(/,/g,"."));
          if(!isFinite(x)){ out.textContent = "—"; return; }
          const c = cat.value;
          if(c==="len"){
            const m = x * LEN[from.value];
            const y = m / LEN[to.value];
            out.textContent = `${y}`;
          }else if(c==="mass"){
            const kg = x * MASS[from.value];
            const y = kg / MASS[to.value];
            out.textContent = `${y}`;
          }else{
            const f = from.value, t = to.value;
            let K = x;
            if(f==="C") K = x + 273.15;
            if(f==="F") K = (x - 32) * 5/9 + 273.15;
            if(f==="K") K = x;
            let y = K;
            if(t==="C") y = K - 273.15;
            if(t==="F") y = (K - 273.15) * 9/5 + 32;
            if(t==="K") y = K;
            out.textContent = `${y}`;
          }
        }

        function setCat(){
          if(cat.value==="len") fillUnits(LEN, "m", "cm");
          if(cat.value==="mass") fillUnits(MASS, "kg", "g");
          if(cat.value==="temp"){
            from.innerHTML = `<option value="C">C</option><option value="F">F</option><option value="K">K</option>`;
            to.innerHTML = from.innerHTML;
            from.value = "C"; to.value="F";
          }
          convert();
        }

        [cat, val, from, to].forEach(el=> el.addEventListener("input", convert));
        cat.addEventListener("change", setCat);

        val.value = "1";
        setCat();
        setTimeout(()=> val.focus(), 0);
      }
    });
  }

  function openCalendar(){
    createWindow({
      appId:"calendar",
      title:"Calendar",
      icon:"🗓️",
      subtitle:"月表示",
      size:"sm",
      contentBuilder: (root) => {
        root.innerHTML = `
          <div class="pane">
            <div class="card cal">
              <div class="cal-head">
                <button class="btn ghost" id="prev">←</button>
                <div class="cal-title" id="title">—</div>
                <button class="btn ghost" id="next">→</button>
              </div>
              <div class="cal-week">
                <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
              </div>
              <div class="cal-grid" id="grid"></div>
              <div class="tiny" style="margin-top:10px; opacity:.75">予定機能は無し。見た目のカレンダー。</div>
            </div>
          </div>
        `;

        const grid = $("#grid", root);
        const title = $("#title", root);
        const prev = $("#prev", root);
        const next = $("#next", root);

        const today = new Date();
        let view = new Date(today.getFullYear(), today.getMonth(), 1);

        function render(){
          const y = view.getFullYear();
          const m = view.getMonth();
          title.textContent = `${y}-${pad2(m+1)}`;
          grid.innerHTML = "";

          const first = new Date(y, m, 1);
          const startDow = first.getDay();
          const daysIn = new Date(y, m+1, 0).getDate();
          const daysPrev = new Date(y, m, 0).getDate();

          // 6 rows * 7 cols
          for(let i=0;i<42;i++){
            const cell = document.createElement("div");
            cell.className = "cal-cell";
            let dayNum = i - startDow + 1;
            let inMonth = true;

            if(dayNum <= 0){
              inMonth = false;
              dayNum = daysPrev + dayNum;
              cell.classList.add("dim");
            }else if(dayNum > daysIn){
              inMonth = false;
              dayNum = dayNum - daysIn;
              cell.classList.add("dim");
            }

            cell.textContent = String(dayNum);

            if(inMonth && y===today.getFullYear() && m===today.getMonth() && dayNum===today.getDate()){
              cell.classList.add("today");
            }

            grid.appendChild(cell);
          }
        }

        prev.addEventListener("click", ()=>{ view = new Date(view.getFullYear(), view.getMonth()-1, 1); render(); });
        next.addEventListener("click", ()=>{ view = new Date(view.getFullYear(), view.getMonth()+1, 1); render(); });

        render();
      }
    });
  }

  function openPassGen(){
    createWindow({
      appId:"passgen",
      title:"Password",
      icon:"🔐",
      subtitle:"パスワード生成",
      size:"sm",
      contentBuilder: (root) => {
        root.innerHTML = `
          <div class="pane">
            <div class="card passgen">
              <h2>パスワード生成</h2>
              <div class="row" style="margin-top:8px">
                <div class="card" style="padding:10px">
                  <div class="tiny" style="opacity:.75">Length</div>
                  <input type="range" id="len" min="6" max="40" value="16" />
                  <div class="tiny" id="lenLabel" style="opacity:.75">16</div>
                </div>
                <div class="card" style="padding:10px">
                  <label class="chk"><input type="checkbox" id="lo" checked> lowercase</label>
                  <label class="chk"><input type="checkbox" id="up" checked> UPPERCASE</label>
                  <label class="chk"><input type="checkbox" id="nu" checked> numbers</label>
                  <label class="chk"><input type="checkbox" id="sy"> symbols</label>
                </div>
              </div>

              <div class="row" style="margin-top:10px">
                <button class="btn" id="gen">Generate</button>
                <button class="btn ghost" id="copy">Copy</button>
              </div>

              <div class="card" style="margin-top:10px; padding:12px">
                <div class="tiny" style="opacity:.75">Output</div>
                <div class="pass-out" id="out" tabindex="0">—</div>
                <div class="tiny" id="hint" style="margin-top:8px; opacity:.75"></div>
              </div>
            </div>
          </div>
        `;

        const len = $("#len", root);
        const lenLabel = $("#lenLabel", root);
        const lo = $("#lo", root);
        const up = $("#up", root);
        const nu = $("#nu", root);
        const sy = $("#sy", root);
        const gen = $("#gen", root);
        const copy = $("#copy", root);
        const out = $("#out", root);
        const hint = $("#hint", root);

        const sets = {
          lo: "abcdefghijklmnopqrstuvwxyz",
          up: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
          nu: "0123456789",
          sy: "!@#$%^&*()_+-=[]{};:,.<>/?"
        };

        function strength(p){
          const L = p.length;
          let pool = 0;
          if(/[a-z]/.test(p)) pool += 26;
          if(/[A-Z]/.test(p)) pool += 26;
          if(/[0-9]/.test(p)) pool += 10;
          if(/[^a-zA-Z0-9]/.test(p)) pool += 20;
          const bits = Math.log2(Math.max(1,pool)) * L;
          if(bits < 40) return `弱め（推定 ${bits.toFixed(0)} bits）`;
          if(bits < 60) return `ふつう（推定 ${bits.toFixed(0)} bits）`;
          return `強め（推定 ${bits.toFixed(0)} bits）`;
        }

        function make(){
          const L = parseInt(len.value,10)||16;
          let chars = "";
          if(lo.checked) chars += sets.lo;
          if(up.checked) chars += sets.up;
          if(nu.checked) chars += sets.nu;
          if(sy.checked) chars += sets.sy;
          if(!chars){
            showToast("文字種を選んでね");
            return;
          }
          let p = "";
          for(let i=0;i<L;i++){
            p += chars[randInt(chars.length)];
          }
          out.textContent = p;
          hint.textContent = strength(p);
        }

        len.addEventListener("input", ()=>{ lenLabel.textContent = len.value; });
        gen.addEventListener("click", make);
        copy.addEventListener("click", async ()=>{
          const p = out.textContent;
          if(!p || p==="—") return;
          try{
            await navigator.clipboard.writeText(p);
            showToast("コピーしました");
          }catch(_){
            // fallback
            const ta = document.createElement("textarea");
            ta.value = p;
            document.body.appendChild(ta);
            ta.select();
            try{ document.execCommand("copy"); showToast("コピーしました"); }catch(e){ showToast("コピー失敗"); }
            ta.remove();
          }
        });

        make();
      }
    });
  }

  function openGame2048(){
    createWindow({
      appId:"game2048",
      title:"2048",
      icon:"🟧",
      subtitle:"Arrow keys / WASD",
      size:"sm",
      contentBuilder: (root) => {
        root.innerHTML = `
          <div class="pane">
            <div class="card game game2048">
              <div class="game-head">
                <div class="game-title"><b>2048</b><span class="tiny">（矢印 / WASD）</span></div>
                <div class="game-stats">
                  <div class="stat"><div class="tiny">Score</div><div id="sc">0</div></div>
                  <div class="stat"><div class="tiny">Best</div><div id="best">0</div></div>
                  <button class="btn ghost" id="restart">Restart</button>
                </div>
              </div>
              <div class="g2048" id="grid"></div>
              <div class="tiny" style="margin-top:10px; opacity:.75">タッチはスワイプでもOK。</div>
              <div class="game-overlay hidden" id="ov">
                <div class="card" style="padding:14px">
                  <div style="font-size:16px; font-weight:700">Game Over</div>
                  <div class="tiny" style="margin-top:6px; opacity:.75">もう一回やる？</div>
                  <div class="row" style="margin-top:10px">
                    <button class="btn" id="again">Restart</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
        const gridEl = $("#grid", root);
        const scEl = $("#sc", root);
        const bestEl = $("#best", root);
        const restart = $("#restart", root);
        const ov = $("#ov", root);
        const again = $("#again", root);

        const N = 4;
        let board = Array.from({length:N}, ()=> Array(N).fill(0));
        let score = 0;
        const bestKey = "almostos.best2048";
        let best = parseInt(localStorage.getItem(bestKey)||"0",10)||0;

        bestEl.textContent = String(best);

        function emptyCells(){
          const a=[];
          for(let y=0;y<N;y++) for(let x=0;x<N;x++) if(!board[y][x]) a.push([x,y]);
          return a;
        }
        function spawn(){
          const empt = emptyCells();
          if(!empt.length) return;
          const [x,y] = empt[randInt(empt.length)];
          board[y][x] = (randInt(10)===0) ? 4 : 2;
        }

        function slide(line){
          const arr = line.filter(v=>v);
          let gained=0;
          for(let i=0;i<arr.length-1;i++){
            if(arr[i] && arr[i]===arr[i+1]){
              arr[i] *= 2;
              gained += arr[i];
              arr[i+1] = 0;
            }
          }
          const out = arr.filter(v=>v);
          while(out.length < N) out.push(0);
          return { out, gained };
        }

        function getLine(dir, idx){
          // returns array of 4 values
          const a=[];
          for(let i=0;i<N;i++){
            if(dir==="L") a.push(board[idx][i]);
            if(dir==="R") a.push(board[idx][N-1-i]);
            if(dir==="U") a.push(board[i][idx]);
            if(dir==="D") a.push(board[N-1-i][idx]);
          }
          return a;
        }
        function setLine(dir, idx, line){
          for(let i=0;i<N;i++){
            const v = line[i];
            if(dir==="L") board[idx][i] = v;
            if(dir==="R") board[idx][N-1-i] = v;
            if(dir==="U") board[i][idx] = v;
            if(dir==="D") board[N-1-i][idx] = v;
          }
        }

        function move(dir){
          let moved=false;
          for(let i=0;i<N;i++){
            const before = getLine(dir, i);
            const {out, gained} = slide(before);
            if(before.some((v,ix)=>v!==out[ix])) moved=true;
            setLine(dir, i, out);
            score += gained;
          }
          if(moved){
            spawn();
            render();
            if(score>best){
              best=score;
              localStorage.setItem(bestKey, String(best));
              bestEl.textContent = String(best);
            }
            if(isGameOver()){
              ov.classList.remove("hidden");
            }
          }
        }

        function isGameOver(){
          if(emptyCells().length) return false;
          // any merges?
          for(let y=0;y<N;y++){
            for(let x=0;x<N;x++){
              const v = board[y][x];
              if((x+1<N && board[y][x+1]===v) || (y+1<N && board[y+1][x]===v)) return false;
            }
          }
          return true;
        }

        function render(){
          scEl.textContent = String(score);
          gridEl.innerHTML = "";
          for(let y=0;y<N;y++){
            for(let x=0;x<N;x++){
              const v = board[y][x];
              const c = document.createElement("div");
              c.className = "tile" + (v ? " v" : "");
              c.dataset.v = String(v);
              c.textContent = v ? String(v) : "";
              gridEl.appendChild(c);
            }
          }
        }

        function reset(){
          board = Array.from({length:N}, ()=> Array(N).fill(0));
          score = 0;
          ov.classList.add("hidden");
          spawn(); spawn();
          render();
        }

        // key handling
        const keymap = {
          ArrowLeft:"L", ArrowRight:"R", ArrowUp:"U", ArrowDown:"D",
          a:"L", d:"R", w:"U", s:"D", A:"L", D:"R", W:"U", S:"D"
        };
        const winEl = root.closest(".win");
        const onKey = (e)=>{
          const dir = keymap[e.key];
          if(!dir) return;
          // only when this window is active
          if(state.activeId && winEl && winEl.dataset.id !== state.activeId) return;
          if(!ov.classList.contains("hidden")) return;
          e.preventDefault();
          move(dir);
        };
        window.addEventListener("keydown", onKey);

        // swipe
        let sx=0, sy=0;
        gridEl.addEventListener("pointerdown", (e)=>{
          sx=e.clientX; sy=e.clientY;
        });
        gridEl.addEventListener("pointerup", (e)=>{
          const dx=e.clientX-sx, dy=e.clientY-sy;
          const ax=Math.abs(dx), ay=Math.abs(dy);
          if(Math.max(ax,ay) < 22) return;
          if(ax>ay) move(dx>0 ? "R":"L");
          else move(dy>0 ? "D":"U");
        });

        restart.addEventListener("click", reset);
        again.addEventListener("click", reset);

        const cleanup = ()=> window.removeEventListener("keydown", onKey);
        onWindowRemoved(root, cleanup);

        reset();
      }
    });
  }

  function openMines(){
    createWindow({
      appId:"mines",
      title:"Mines",
      icon:"💣",
      subtitle:"左=開く / 右=旗 / タッチはFlag切替",
      size:"md",
      contentBuilder: (root) => {
        root.innerHTML = `
          <div class="pane">
            <div class="card game mines">
              <div class="game-head">
                <div class="game-title"><b>Mines</b><span class="tiny">（右クリック=旗）</span></div>
                <div class="game-stats">
                  <div class="stat"><div class="tiny">Mines</div><div id="mLeft">—</div></div>
                  <div class="stat"><div class="tiny">Time</div><div id="time">0</div></div>
                  <button class="btn ghost" id="flag">Flag: OFF</button>
                  <button class="btn ghost" id="reset">Reset</button>
                </div>
              </div>
              <div class="mines-grid" id="grid"></div>
              <div class="game-overlay hidden" id="ov">
                <div class="card" style="padding:14px">
                  <div style="font-size:16px; font-weight:700" id="msg">—</div>
                  <div class="row" style="margin-top:10px">
                    <button class="btn" id="again">Reset</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        const W=10, H=10, MINES=12;
        const gridEl = $("#grid", root);
        const mLeft = $("#mLeft", root);
        const timeEl = $("#time", root);
        const resetBtn = $("#reset", root);
        const flagBtn = $("#flag", root);
        const ov = $("#ov", root);
        const msg = $("#msg", root);
        const again = $("#again", root);

        let cells = [];
        let first = true;
        let flags = 0;
        let open = 0;
        let dead = false;
        let flagMode = false;

        let t0=0, tInt=null;

        function idx(x,y){ return y*W+x; }
        function inb(x,y){ return x>=0 && x<W && y>=0 && y<H; }

        function startTimer(){
          t0 = Date.now();
          if(tInt) clearInterval(tInt);
          tInt = setInterval(()=>{ timeEl.textContent = String(Math.floor((Date.now()-t0)/1000)); }, 250);
        }
        function stopTimer(){
          if(tInt){ clearInterval(tInt); tInt=null; }
        }

        function placeMines(sx,sy){
          let placed = 0;
          while(placed < MINES){
            const x = randInt(W), y = randInt(H);
            if(Math.abs(x-sx)<=1 && Math.abs(y-sy)<=1) continue; // safe zone
            const c = cells[idx(x,y)];
            if(c.mine) continue;
            c.mine = true;
            placed++;
          }
          // compute adj
          for(let y=0;y<H;y++){
            for(let x=0;x<W;x++){
              const c = cells[idx(x,y)];
              if(c.mine){ c.adj = -1; continue; }
              let n=0;
              for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
                if(!dx && !dy) continue;
                const nx=x+dx, ny=y+dy;
                if(inb(nx,ny) && cells[idx(nx,ny)].mine) n++;
              }
              c.adj = n;
            }
          }
        }

        function reveal(x,y){
          if(dead) return;
          const c = cells[idx(x,y)];
          if(c.revealed || c.flagged) return;

          if(first){
            placeMines(x,y);
            first = false;
            startTimer();
          }

          c.revealed = true;
          open++;

          if(c.mine){
            dead = true;
            stopTimer();
            showAllMines();
            msg.textContent = "BOOM 💥";
            ov.classList.remove("hidden");
            showToast("💣 Game Over");
            return;
          }

          if(c.adj === 0){
            // flood
            const q = [[x,y]];
            while(q.length){
              const [cx,cy] = q.pop();
              for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
                const nx=cx+dx, ny=cy+dy;
                if(!inb(nx,ny)) continue;
                const cc = cells[idx(nx,ny)];
                if(cc.revealed || cc.flagged) continue;
                cc.revealed = true;
                open++;
                if(cc.adj===0 && !cc.mine) q.push([nx,ny]);
              }
            }
          }

          render();
          checkWin();
        }

        function toggleFlag(x,y){
          if(dead) return;
          const c = cells[idx(x,y)];
          if(c.revealed) return;
          c.flagged = !c.flagged;
          flags += c.flagged ? 1 : -1;
          render();
          checkWin();
        }

        function checkWin(){
          if(dead) return;
          const totalSafe = W*H - MINES;
          if(open >= totalSafe){
            dead = true;
            stopTimer();
            msg.textContent = "Clear ✅";
            ov.classList.remove("hidden");
            showToast("🎉 Clear!");
          }
        }

        function showAllMines(){
          cells.forEach(c=>{
            if(c.mine) c.revealed = true;
          });
          render();
        }

        function render(){
          mLeft.textContent = String(MINES - flags);
          gridEl.innerHTML = "";
          for(let y=0;y<H;y++){
            for(let x=0;x<W;x++){
              const c = cells[idx(x,y)];
              const b = document.createElement("button");
              b.className = "mine-cell" +
                (c.revealed ? " open" : "") +
                (c.flagged ? " flag" : "") +
                (c.revealed && c.mine ? " boom" : "");
              b.type = "button";
              b.oncontextmenu = (e)=>{ e.preventDefault(); return false; };
              if(c.revealed){
                if(c.mine) b.textContent = "💣";
                else b.textContent = c.adj ? String(c.adj) : "";
                b.dataset.n = String(c.adj);
              } else if(c.flagged){
                b.textContent = "🚩";
              } else {
                b.textContent = "";
              }

              b.addEventListener("pointerdown", (e)=>{
                if(dead) return;
                const right = (e.button===2) || e.ctrlKey;
                if(right || flagMode) toggleFlag(x,y);
                else reveal(x,y);
              });

              gridEl.appendChild(b);
            }
          }
        }

        function reset(){
          cells = Array.from({length:W*H}, ()=>({ mine:false, revealed:false, flagged:false, adj:0 }));
          first = true;
          flags = 0;
          open = 0;
          dead = false;
          flagMode = false;
          flagBtn.textContent = "Flag: OFF";
          timeEl.textContent = "0";
          ov.classList.add("hidden");
          stopTimer();
          render();
        }

        flagBtn.addEventListener("click", ()=>{
          flagMode = !flagMode;
          flagBtn.textContent = "Flag: " + (flagMode ? "ON" : "OFF");
        });
        resetBtn.addEventListener("click", reset);
        again.addEventListener("click", reset);

        const cleanup = ()=>{ try{ stopTimer(); }catch(_){} };
        onWindowRemoved(root, cleanup);

        reset();
      }
    });
  }

  function openSnake(){
    createWindow({
      appId:"snake",
      title:"Snake",
      icon:"🐍",
      subtitle:"Arrow keys / WASD",
      size:"sm",
      contentBuilder: (root) => {
        root.innerHTML = `
          <div class="pane">
            <div class="card game snake">
              <div class="game-head">
                <div class="game-title"><b>Snake</b><span class="tiny">（矢印 / WASD）</span></div>
                <div class="game-stats">
                  <div class="stat"><div class="tiny">Score</div><div id="score">0</div></div>
                  <button class="btn ghost" id="reset">Restart</button>
                </div>
              </div>

              <div class="snake-wrap">
                <canvas id="cv" width="360" height="360"></canvas>
                <div class="snake-ctrl">
                  <button class="btn ghost" data-d="U">↑</button>
                  <div class="row" style="margin:6px 0">
                    <button class="btn ghost" data-d="L">←</button>
                    <button class="btn ghost" data-d="D">↓</button>
                    <button class="btn ghost" data-d="R">→</button>
                  </div>
                </div>

                <div class="game-overlay hidden" id="ov">
                  <div class="card" style="padding:14px">
                    <div style="font-size:16px; font-weight:700">Game Over</div>
                    <div class="row" style="margin-top:10px">
                      <button class="btn" id="again">Restart</button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="tiny" style="margin-top:10px; opacity:.75">タッチは下のボタンでも操作できます。</div>
            </div>
          </div>
        `;

        const cv = $("#cv", root);
        const scoreEl = $("#score", root);
        const resetBtn = $("#reset", root);
        const ov = $("#ov", root);
        const again = $("#again", root);

        const ctx = cv.getContext("2d");
        const DPR = Math.max(1, Math.min(2, window.devicePixelRatio||1));
        const CSS = 360;
        cv.style.width = CSS+"px";
        cv.style.height = CSS+"px";
        cv.width = CSS*DPR; cv.height = CSS*DPR;
        ctx.scale(DPR, DPR);

        const G = 20; // grid
        const S = CSS / G;

        let snake, dir, nextDir, food, score, alive, tick;

        function rndCell(){
          return { x: randInt(G), y: randInt(G) };
        }
        function eq(a,b){ return a.x===b.x && a.y===b.y; }

        function placeFood(){
          while(true){
            const f = rndCell();
            if(!snake.some(p=>eq(p,f))){ food=f; return; }
          }
        }

        function reset(){
          snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
          dir = {x:1,y:0};
          nextDir = dir;
          score = 0;
          alive = true;
          ov.classList.add("hidden");
          placeFood();
          scoreEl.textContent = "0";
          draw();
          if(tick) clearInterval(tick);
          tick = setInterval(step, 120);
        }

        function step(){
          if(!alive) return;
          dir = nextDir;
          const head = snake[0];
          const nh = { x: head.x + dir.x, y: head.y + dir.y };
          if(nh.x<0||nh.x>=G||nh.y<0||nh.y>=G){ die(); return; }
          if(snake.some((p,i)=> i>0 && eq(p,nh))){ die(); return; }

          snake.unshift(nh);
          if(eq(nh, food)){
            score += 1;
            scoreEl.textContent = String(score);
            placeFood();
          }else{
            snake.pop();
          }
          draw();
        }

        function die(){
          alive=false;
          if(tick){ clearInterval(tick); tick=null; }
          ov.classList.remove("hidden");
          showToast("🐍 Game Over");
        }

        function draw(){
          // bg
          ctx.clearRect(0,0,CSS,CSS);
          // board
          ctx.fillStyle = "rgba(0,0,0,.18)";
          ctx.fillRect(0,0,CSS,CSS);

          // grid faint
          ctx.strokeStyle = "rgba(255,255,255,.06)";
          ctx.lineWidth = 1;
          for(let i=0;i<=G;i++){
            ctx.beginPath(); ctx.moveTo(i*S,0); ctx.lineTo(i*S,CSS); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0,i*S); ctx.lineTo(CSS,i*S); ctx.stroke();
          }

          // food
          ctx.fillStyle = "rgba(255,255,255,.88)";
          ctx.fillRect(food.x*S+4, food.y*S+4, S-8, S-8);

          // snake
          snake.forEach((p,i)=>{
            ctx.fillStyle = i===0 ? "rgba(124,92,255,.95)" : "rgba(124,92,255,.55)";
            ctx.fillRect(p.x*S+3, p.y*S+3, S-6, S-6);
          });
        }

        function setDir(d){
          if(!alive) return;
          const map = {L:{x:-1,y:0},R:{x:1,y:0},U:{x:0,y:-1},D:{x:0,y:1}};
          const nd = map[d];
          if(!nd) return;
          // prevent reverse
          if(nd.x === -dir.x && nd.y === -dir.y) return;
          nextDir = nd;
        }

        const keymap = {
          ArrowLeft:"L", ArrowRight:"R", ArrowUp:"U", ArrowDown:"D",
          a:"L", d:"R", w:"U", s:"D", A:"L", D:"R", W:"U", S:"D"
        };
        const winEl = root.closest(".win");
        const onKey = (e)=>{
          const d = keymap[e.key];
          if(!d) return;
          if(state.activeId && winEl && winEl.dataset.id !== state.activeId) return;
          e.preventDefault();
          setDir(d);
        };
        window.addEventListener("keydown", onKey);

        $$(".snake [data-d]", root).forEach(b=>{
          b.addEventListener("click", ()=> setDir(b.dataset.d));
        });

        resetBtn.addEventListener("click", reset);
        again.addEventListener("click", reset);

        const cleanup = ()=>{
          try{ if(tick) clearInterval(tick); }catch(_){}
          window.removeEventListener("keydown", onKey);
        };
        onWindowRemoved(root, cleanup);

        reset();
      }
    });
  }


function openCustomApp(appId){
    const app = customApps.find(a=>a.id===appId);
    if(!app){ showToast("アプリが見つからない"); return; }
    createWindow({
      appId: app.id,
      title: app.name,
      icon: app.glyph || "🧩",
      subtitle: app.sub || "Custom App",
      size:"lg",
      contentBuilder: (root, ctx) => {
        root.innerHTML = `
          <div class="iframeWrap" style="border-top:none">
            <iframe class="appframe"
              sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
              referrerpolicy="no-referrer"></iframe>
          </div>
        `;
        const frame = root.querySelector("iframe");
        frame.srcdoc = app.html;
        ctx.setTitle(app.name);
      }
    });
  }


  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
  }
  function escapeAttr(s){
    return String(s).replace(/"/g,"&quot;").replace(/</g,"&lt;");
  }

  // ---- BSOD (simulated) ----
  const BSOD_CODES = [
    "ALMOSTOS_KERNEL_PANIC",
    "CRITICAL_PROCESS_DIED",
    "IRQL_NOT_LESS_OR_EQUAL",
    "DRIVER_CORRUPTED_EXPOOL",
    "PAGE_FAULT_IN_NONPAGED_AREA",
    "KMODE_EXCEPTION_NOT_HANDLED",
    "SYSTEM_SERVICE_EXCEPTION"
  ];

  function crashToBSOD(opts = {}){
    const stopCode = opts.stopCode || BSOD_CODES[Math.floor(Math.random() * BSOD_CODES.length)];
    const whatFailed = opts.whatFailed || (stopCode.includes("DRIVER") ? "almostos.sys" : "kernel.js");
    const crash = {
      stopCode,
      whatFailed,
      details: opts.details || "",
      at: new Date().toISOString(),
      from: "os"
    };
    try { localStorage.setItem("almostos.lastCrash", JSON.stringify(crash)); } catch {}
    location.href = "bsod.html";
  }

  // tiny public hook (custom apps can call window.AlmostOS.crash())
  window.AlmostOS = window.AlmostOS || {};
  window.AlmostOS.crash = crashToBSOD;

  // ---- Shortcuts ----
  window.addEventListener("keydown", (e)=>{
    const ctrl = e.ctrlKey || e.metaKey;
    const inLock = lockScreen && lockScreen.classList.contains("show");
    if(inLock){
      // prevent OS shortcuts while on lock screen (but keep typing working)
      if(e.key==="Enter"){ e.preventDefault(); attemptUnlock(); }
      if(e.key==="Escape"){ pinErr.textContent=""; if(pinInput) pinInput.value=""; }
      return;
    }


    // Simulated BSOD (Ctrl+Alt+B)
    if(ctrl && e.altKey && (e.key==="b" || e.key==="B")) {
      e.preventDefault();
      crashToBSOD();
      return;
    }

    // Task Manager (Ctrl+Shift+Esc)
    if(ctrl && e.shiftKey && (e.key==="Escape" || e.code==="Escape")) {
      e.preventDefault();
      openTaskManager();
      return;
    }



    if(e.altKey && (e.code==="Enter" || e.key==="Enter")){
      // Toggle fullscreen for active window
      if(state.activeId){
        e.preventDefault();
        toggleFullscreen(state.activeId);
      }
    }
    if(ctrl && (e.key==="l" || e.key==="L")){
      e.preventDefault(); lockNow();
    }
    if(ctrl && e.code==="Space"){
      e.preventDefault(); toggleStart();
    }
    if(ctrl && e.code==="Backquote"){
      e.preventDefault(); openTerminal();
    }
    if(ctrl && e.shiftKey && (e.key==="s" || e.key==="S")){
      e.preventDefault();
      downloadThisHTML("AlmostOS_export.html", true);
    }
    if(ctrl && !e.shiftKey && (e.key==="s" || e.key==="S")){
      e.preventDefault(); saveAll();
    }
    if(e.key==="Escape"){
      closeStart();
      quickPanel.classList.remove("show");
      if(state.activeId){
        const w = state.windows.get(state.activeId);
        if(w && w.fullscreen){ toggleFullscreen(state.activeId); }
      }
    }
  });

  desktop.addEventListener("mousedown", (e)=>{
    if(e.target === desktop){
      closeStart();
      state.activeId = null;
      renderTaskbar();
    }
  });

  // ---- Footer buttons ----
  $("#aboutBtn").addEventListener("click", ()=> { openAbout(); closeStart(); });
  $("#bsodBtn").addEventListener("click", ()=> { crashToBSOD(); closeStart(); });
  $("#downloadBtn").addEventListener("click", (e)=> { downloadThisHTML("AlmostOS.html", !!e.shiftKey); closeStart(); showToast(e.shiftKey ? "書き出し: 状態入り（#importで取り込み）" : "書き出し: クリーンHTML"); });
  $("#saveBtn").addEventListener("click", ()=> saveAll());
  $("#lockBtn").addEventListener("click", ()=> { lockNow(); closeStart(); });
  $("#installBtn").addEventListener("click", ()=> { triggerInstallPicker(); closeStart(); });

  // ---- Boot ----
  renderDesktopIcons();
  loadAll();

  // Splash -> Lock/Login
  const splashMin = state.settings.reduceMotion ? 260 : 900;
  setTimeout(()=>{
    hideSplash();
    showLock();
  }, splashMin);



})();
