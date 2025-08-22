// Core game orchestrator (start/loop 인스턴스 바인딩 + 폴백 보강)
class Game {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); // cap for perf
    // logical size (9:16)
    this.baseW = 540;
    this.baseH = 960;
    this.resize();

    // gameplay units
    this.width = this.baseW;
    this.height = this.baseH;
    this.playerDiameter = Math.floor(Math.min(this.width, this.height) * 0.08);
    this.playerRadius = (this.playerDiameter/2)|0;
    this.enemyRadius = Math.floor(this.playerRadius * 2/3);
    this.missileSpeed = Math.min(this.width, this.height)/1.5;
    this.enemySpeed = Math.min(this.width, this.height)/3;

    // entities
    const ax = this.width*0.35, bx = this.width*0.65, y = this.height*0.8;
    this.playerA = new PlayerCircle(this, ax, y, this.playerRadius);
    this.playerB = new PlayerCircle(this, bx, y, this.playerRadius);
    this.pointer = new PointerManager(canvas, this);

    this.powerMax = 3;
    this.powerLevel = 1;
    this.heartsMax = 5;
    this.hearts = 5;

    this.groups = [];
    this.enemies = [];
    this.missiles = [];
    this.items = [];

    this.wave = new WaveManager(this);

    this.lastTS = performance.now();
    this.running = false;

    renderHearts(this.hearts, this.heartsMax);
    setPowerLabel(this.powerLevel);

    // 메서드 바인딩(구형 사파리/웹뷰 안전)
    this.loop  = this.loop.bind(this);
    this.start = this.start.bind(this);

    // 시작 버튼(별도의 index.html 안전장치가 있어도 여기서도 보강)
    var self = this;
    var btn = document.getElementById('startBtn');
    if (btn && !btn._bound) {
      btn.addEventListener('click', function(){
        var overlay = document.getElementById('overlay');
        if (overlay) overlay.classList.add('hidden');
        self.canvas.style.pointerEvents = 'auto';
        self.start();
      }, {passive:false});
      btn._bound = true;
    }
  }

  resize(){
    const parentW = window.innerWidth;
    const parentH = window.innerHeight;
    const targetAspect = 9/16;
    let cssW, cssH;
    if(parentW/parentH > targetAspect){
      cssH = parentH;
      cssW = Math.floor(cssH * targetAspect);
    }else{
      cssW = parentW;
      cssH = Math.floor(cssW / targetAspect);
    }
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
    this.canvas.width = Math.floor(this.baseW * this.dpr);
    this.canvas.height = Math.floor(this.baseH * this.dpr);
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
  }

  // ------- 폴백: 환경에 따라 class 메서드 인식이 깨지는 경우를 대비해
  _startImpl(){
    this.hearts = this.heartsMax;
    this.powerLevel = 1;
    renderHearts(this.hearts, this.heartsMax);
    setPowerLabel(this.powerLevel);
    setWaveInfo('');
    this.groups.length = 0;
    this.enemies.length = 0;
    this.missiles.length = 0;
    this.items.length = 0;
    this.wave.start();
    this.running = true;
    this.lastTS = performance.now();
    requestAnimationFrame(this.loop);
  }

  start(){
    // 혹시 외부에서 Game.prototype.start를 읽지 못하는 환경을 대비
    return this._startImpl();
  }

  onStageClear(){
    this.running = false;
    showPopup("축하합니다!", "클리어! 다시 플레이할까요?", ()=>this.start());
  }
  gameOver(){
    this.running = false;
    showPopup("게임 오버", "다시 도전!", ()=>this.start());
  }
  damagePlayer(n){
    this.hearts = Math.max(0, this.hearts - n);
    renderHearts(this.hearts, this.heartsMax);
    const t = now();
    const mag = Math.max(2, this.playerRadius*0.15);
    this.playerA.shakeUntil = t + 0.25;
    this.playerB.shakeUntil = t + 0.25;
    this.playerA.shakeMag = mag;
    this.playerB.shakeMag = mag;
    if(this.hearts<=0) this.gameOver();
  }
  setPlayerPos(target, p){
    const r = this.playerRadius;
    p.x = clamp(p.x, r, this.width - r);
    p.y = clamp(p.y, r, this.height - r);
    if(target==='A') this.playerA.pos = p;
    else this.playerB.pos = p;
  }
  spawnMissile(pos, vel){ this.missiles.push(new Missile(pos, vel, 5)); }
  dropItem(kind, pos){ this.items.push(new Item(kind, pos)); }

  // ─────────────────────────────────────────────
  // 라인 허용 개수 계산 (지시사항 3)
  // - 기준: 두 원 중심 사이 거리에서 '겹침 1지름'을 제외한 빈 공간(gap)을 원의 지름 D 단위로 환산
  // - 규칙 변경:
  //   gap ≤ 4D  → 3줄
  //   4D < gap ≤ 6D → 2줄
  //   6D < gap ≤ 8D → 1줄
  //   gap > 8D → 공격불가(점선)
  // ─────────────────────────────────────────────
  distanceAllowedLines(){
    const A = this.playerA.pos, B=this.playerB.pos;
    const centerDist = A.clone().sub(B).len();
    const D = this.playerDiameter;                 // 원의 지름
    const gap = Math.max(0, centerDist - D);       // 두 원의 테두리 간 빈 거리

    if(gap > 8*D) return 0;    // 너무 멀면 점선(공격 불가)
    if(gap > 6*D) return 1;
    if(gap > 4*D) return 2;
    return 3;
  }

  // (유지) 파워업으로 허용된 최대 줄 수와 거리 제한 중 작은 쪽을 실제 적용
  effectiveLines(){
    return Math.min(this.powerLevel, this.distanceAllowedLines());
  }

  update(dt){
    for(const g of this.groups) g.update(dt);
    for(const e of this.enemies) e.update(dt);
    for(const m of this.missiles) m.update(dt);
    this.missiles = this.missiles.filter(m=>!m.outOfBounds(this.width, this.height));
    for(const it of this.items) it.update(dt);
    this.resolveCollisions(dt);
    this.wave.update(dt);
  }

  
// ── 충돌/피해 판정
resolveCollisions(dt){
  const A = this.playerA, B=this.playerB;

  // 미사일 → 플레이어
  for(const m of this.missiles){
    const r1 = m.radius + A.radius; if(A.pos.clone().sub(m.pos).len() <= r1){ A.hit(); }
    const r2 = m.radius + B.radius; if(B.pos.clone().sub(m.pos).len() <= r2){ B.hit(); }
  }

  // 적 → 플레이어
  for(const g of this.groups){
    for(const e of g.members){
      if(!e.isAlive()) continue;
      const rA = e.radius + A.radius; if(A.pos.clone().sub(e.pos).len() <= rA){ A.hit(); }
      const rB = e.radius + B.radius; if(B.pos.clone().sub(e.pos).len() <= rB){ B.hit(); }
    }
  }
  for(const e of this.enemies){
    if(!e.isAlive()) continue;
    const rA = e.radius + A.radius; if(A.pos.clone().sub(e.pos).len() <= rA){ A.hit(); }
    const rB = e.radius + B.radius; if(B.pos.clone().sub(e.pos).len() <= rB){ B.hit(); }
  }

  // 아이템 획득(플레이어 or 라인)
  const eff = this.effectiveLines();
  const {lineA, lineB, offsets} = this.getLineGeometry(eff);
  const lineActive = eff>0;
  this.items = this.items.filter(it=>{
    const rA = it.radius + A.radius; if(A.pos.clone().sub(it.pos).len() <= rA){ this.applyItem(it.kind); return false; }
    const rB = it.radius + B.radius; if(B.pos.clone().sub(it.pos).len() <= rB){ this.applyItem(it.kind); return false; }
    if(lineActive){
      for(const off of offsets){
        const a = lineA.clone().add(off), b = lineB.clone().add(off);
        if(segmentPointDistance(a,b,it.pos) <= it.radius + 6){ this.applyItem(it.kind); return false; }
      }
    }
    return true;
  });

  // ── 라인 → 적 피해 (적이 자체 i-frame으로 2초 무적 관리)
  if(eff>0){
    // 그룹 적
    for(const g of this.groups){
      for(const e of g.members){
        if(!e.isAlive()) continue;
        let hitLines = 0;
        for(const off of offsets){
          const a = lineA.clone().add(off), b = lineB.clone().add(off);
          const d = segmentPointDistance(a,b,e.pos);
          if(d <= e.radius) hitLines++;
        }
        if(hitLines>0){ e.damage(hitLines); } // 내부에서 invulUntil로 필터링
      }
    }
    // 보스 등 단일 적
    for(const e of this.enemies){
      if(!e.isAlive()) continue;
      let hitLines = 0;
      for(const off of offsets){
        const a = lineA.clone().add(off), b = lineB.clone().add(off);
        const d = segmentPointDistance(a,b,e.pos);
        if(d <= e.radius) hitLines++;
      }
      if(hitLines>0){ e.damage(hitLines); }
    }
  }
}

  applyItem(kind){
    if(kind==='heart'){
      this.hearts = Math.min(this.heartsMax, this.hearts+1);
      renderHearts(this.hearts, this.heartsMax);
    }else if(kind==='power'){
      this.powerLevel = Math.min(this.powerMax, this.powerLevel+1);
      setPowerLabel(this.powerLevel);
    }
  }

  getLineGeometry(effLines){
    const A = this.playerA.pos, B=this.playerB.pos;
    const lineA = A.clone();
    const lineB = B.clone();
    const dir = B.clone().sub(A);
    const len = dir.len();
    const offsets = [];
    if(len < 1e-3) return {lineA:lineA, lineB:lineB, offsets:[]};
    const n = dir.clone().norm().perp();
    const spacing = 10;
    if(effLines===1){
      offsets.push(new Vec2(0,0));
    }else if(effLines===2){
      offsets.push(n.clone().mul(-spacing/2));
      offsets.push(n.clone().mul(+spacing/2));
    }else if(effLines===3){
      offsets.push(n.clone().mul(-spacing));
      offsets.push(new Vec2(0,0));
      offsets.push(n.clone().mul(+spacing));
    }
    return { lineA:lineA, lineB:lineB, offsets:offsets };
  }

  draw(){
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.width,this.height);

    // bg grid subtle
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#14161c";
    ctx.lineWidth = 1;
    for(let y=0;y<this.height;y+=40){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(this.width,y); ctx.stroke();
    }
    for(let x=0;x<this.width;x+=40){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,this.height); ctx.stroke();
    }
    ctx.restore();

    // Items
    for(const it of this.items) it.draw(ctx);

    // Attack line
    const eff = this.effectiveLines();
    const geo = this.getLineGeometry(eff);
    const lineA = geo.lineA, lineB = geo.lineB, offsets = geo.offsets;
    const distAllowed = this.distanceAllowedLines();
    ctx.save();
    if(distAllowed===0){
      ctx.strokeStyle = COL.lineDisabled;
      ctx.setLineDash([8,8]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lineA.x,lineA.y);
      ctx.lineTo(lineB.x,lineB.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = COL.line;
      ctx.lineWidth = 3;
      for(var i=0;i<offsets.length;i++){
        const off = offsets[i];
        ctx.beginPath();
        ctx.moveTo(lineA.x+off.x, lineA.y+off.y);
        ctx.lineTo(lineB.x+off.x, lineB.y+off.y);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Players
    this.playerA.draw(ctx);
    this.playerB.draw(ctx);

    // Enemies
    for(const g of this.groups) g.draw(ctx);
    for(const e of this.enemies) e.draw(ctx);

    // Missiles
    for(const m of this.missiles) m.draw(ctx);

    // Wave overlays
    this.wave.draw(ctx);
  }

  loop(){
    if(!this.running) return;
    const ts = performance.now();
    const dt = Math.min(0.033, (ts - this.lastTS)/1000);
    this.lastTS = ts;

    this.update(dt);
    this.draw();
    requestAnimationFrame(this.loop);
  }
}

// 전역 노출 보강(일부 환경에서 스코프 문제 방지)
window.Game = Game;
