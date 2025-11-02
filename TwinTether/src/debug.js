// --- Lightweight Debug HUD & Crash Catcher ---
(function(){
  // URL ?debug=1 로 켜기
  const DEBUG = /[?&]debug=1\b/.test(location.search);
  window.__DEBUG__ = DEBUG;

  // 오버레이 DOM
  let root, feed = [];
  const MAX = 200;
  function ensureHUD(){
    if (root || !DEBUG) return;
    root = document.createElement('div');
    root.id = 'debugHUD';
    root.style.cssText =
      'position:fixed;left:0;bottom:0;right:0;max-height:40%;' +
      'background:rgba(0,0,0,0.7);color:#0ff; font:12px/1.4 monospace;' +
      'z-index:100000; overflow:auto; padding:6px; white-space:pre-wrap;';
    document.body.appendChild(root);
  }
  function push(line, color){
    if (!DEBUG) return;
    ensureHUD();
    const time = new Date().toISOString().split('T')[1].replace('Z','');
    feed.push({ t: time, msg: line, color: color||'#0ff' });
    if (feed.length > MAX) feed.shift();
    root.innerHTML = feed.map(x=>`<div style="color:${x.color}">${x.t} ${x.msg}</div>`).join('');
    root.scrollTop = root.scrollHeight;
  }

  // 공개 API
  window.__log  = (...a)=>push(a.map(x=>String(x)).join(' '), '#0ff');
  window.__warn = (...a)=>push(a.map(x=>String(x)).join(' '), '#ff0');
  window.__err  = (...a)=>push(a.map(x=>String(x)).join(' '), '#f66');
  window.__fatal= (e, where)=>{
    const msg = (e && e.stack) ? e.stack : String(e);
    push(`[FATAL@${where}] ${msg}`, '#f66');
    // 멈추는 원인 확인용 팝업 (모바일 콘솔 없을 때)
    try{ alert(`[에러] ${where}\n${msg.substring(0,300)}`); }catch(_){}
  };

  if (DEBUG) {
    // 콘솔 프록시(있어도 화면에도 찍자)
    const clog = console.log.bind(console);
    const cerr = console.error.bind(console);
    const cwar = console.warn.bind(console);
    console.log = (...a)=>{ clog(...a); window.__log(...a); };
    console.warn= (...a)=>{ cwar(...a); window.__warn(...a); };
    console.error=(...a)=>{ cerr(...a); window.__err(...a); };

    // 전역 에러/프라미스 거부 잡기
    window.addEventListener('error', (ev)=>{
      window.__fatal(ev.error||ev.message, 'window.onerror');
    });
    window.addEventListener('unhandledrejection', (ev)=>{
      window.__fatal(ev.reason||'unhandledrejection', 'promise');
    });

    // 일시정지/스텝 (P: 토글, O: 1프레임 진행)
    window.__PAUSE__ = false;
    window.addEventListener('keydown', e=>{
      if (e.key==='p' || e.key==='P'){ window.__PAUSE__ = !window.__PAUSE__; __log(`PAUSE=${window.__PAUSE__}`); }
      if (e.key==='o' || e.key==='O'){ window.__STEP__ = true; __log('STEP 1 frame'); }
    });
  }

  // 안전 기본값 주입(누락 시 크래시 방지)
  window.FX = window.FX || {};
  FX.death = FX.death || { duration:0.5, squash:0.6, dropPx:8, fade:true };
})();
