// 모바일 호환 안전 초기화(폴리필 + 제스처 차단 + Game 결선)
(function(){
  // -------- 폴리필 ----------
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = window.webkitRequestAnimationFrame
      || function(cb){ return setTimeout(function(){ cb(Date.now()); }, 16); };
  }
  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = window.webkitCancelAnimationFrame
      || function(id){ clearTimeout(id); };
  }
  if (typeof window.now !== 'function') {
    window.now = function(){
      return (window.performance && performance.now)
        ? performance.now()/1000
        : Date.now()/1000;
    };
  }
  if (typeof window.TAU === 'undefined') window.TAU = Math.PI * 2;

  // (필요 시) 최소 유틸 폴백 — 프로젝트의 utils가 제대로 로드되면 이 블록은 무시됨
  if (typeof window.clamp !== 'function') window.clamp = function(v,min,max){ return Math.max(min, Math.min(max, v)); };
  if (typeof window.lerp !== 'function')  window.lerp  = function(a,b,t){ return a + (b-a)*t; };
  if (typeof window.rand !== 'function')  window.rand  = function(a,b){ return Math.random()*(b-a)+a; };
  if (typeof window.randInt !== 'function') window.randInt = function(a,b){ return (Math.random()* (b-a+1) + a) | 0; };
  if (typeof window.wrapAngle !== 'function') window.wrapAngle = function(a){ while(a<-Math.PI)a+=2*Math.PI; while(a>Math.PI)a-=2*Math.PI; return a; };
  if (typeof window.segmentPointDistance !== 'function') {
    window.segmentPointDistance = function(a,b,p){
      var vx=b.x-a.x, vy=b.y-a.y;
      var wx=p.x-a.x, wy=p.y-a.y;
      var c1= vx*wx + vy*wy;
      if (c1<=0) return Math.hypot(p.x-a.x, p.y-a.y);
      var c2= vx*vx + vy*vy;
      if (c2<=c1) return Math.hypot(p.x-b.x, p.y-b.y);
      var t = c1/c2;
      var qx = a.x + t*vx, qy = a.y + t*vy;
      return Math.hypot(p.x-qx, p.y-qy);
    };
  }
  if (typeof window.Vec2 !== 'function') {
    window.Vec2 = function(x,y){ this.x = x||0; this.y = y||0; };
    Vec2.prototype.clone = function(){ return new Vec2(this.x,this.y); };
    Vec2.prototype.add   = function(v){ this.x+=v.x; this.y+=v.y; return this; };
    Vec2.prototype.sub   = function(v){ this.x-=v.x; this.y-=v.y; return this; };
    Vec2.prototype.mul   = function(s){ this.x*=s; this.y*=s; return this; };
    Vec2.prototype.len   = function(){ return Math.hypot(this.x,this.y); };
    Vec2.prototype.norm  = function(){ var l=this.len()||1; this.x/=l; this.y/=l; return this; };
    Vec2.prototype.perp  = function(){ return new Vec2(-this.y, this.x); };
    Vec2.prototype.angle = function(){ return Math.atan2(this.y,this.x); };
    Vec2.fromAngle = function(a,l){ if(typeof l!=='number') l=1; return new Vec2(Math.cos(a)*l, Math.sin(a)*l); };
  }

  // -------- 제스처/스크롤 차단(모바일에서 pointercancel 방지) ----------
  try {
    document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, {passive:false});
    document.addEventListener('gesturechange', function(e){ e.preventDefault(); }, {passive:false});
    document.addEventListener('gestureend',   function(e){ e.preventDefault(); }, {passive:false});
  } catch(_){}

  // -------- 페이지 로드 후 Game 결선 ----------

  async function startWithData(){
    try{
      const pack = await Data.loadStagePack('data/gamedata.json');
      //const pack = await Data.loadStagePack('#stage-pack');
      // 게임 인스턴스 생성되어 있다고 가정(window.game)
      window.game.wave.setStageData(pack, 1); // 1번 스테이지 선택
      window.game.start();
    }catch(e){
      // 오버레이 + 얼럿으로 바로 확인 가능
      if (window.__fatal) __fatal(e, 'startWithData');
      else alert('데이터 로드 오류: ' + (e && e.message ? e.message : e));
    }
  }
  function init(){
    var canvas = document.getElementById('game');
    if (!canvas) return;

    // Game 인스턴스가 아직 없으면 생성
    if (!window.game) window.game = new Game(canvas);

    // 시작 버튼(바인딩 실패 대비 보강 — index의 onclick이 기본 경로)
    var btn = document.getElementById('startBtn');
    if (btn && !btn._bound) {
      btn.addEventListener('click', function(){
        var overlay = document.getElementById('overlay');
        if (overlay) overlay.classList.add('hidden');
        canvas.style.pointerEvents = 'auto';
        startWithData();
      }, {passive:false});
      btn._bound = true;
    }

    // 오버레이/팝업이 캔버스 입력을 막지 않도록 z-index 보강
    var overlay = document.getElementById('overlay');
    var popup   = document.getElementById('popup');
    if (overlay){ overlay.style.position='fixed'; overlay.style.inset='0'; overlay.style.zIndex='9999'; }
    if (popup){   popup.style.position='fixed';   popup.style.inset='0';   popup.style.zIndex='9999'; }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 0);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
