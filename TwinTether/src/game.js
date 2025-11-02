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

    // background
    this.bgKey = "main";     // 사용 중인 배경 키
    this.bgMode = "static";  // "static" | "scrollY" | "scrollX" (옵션)
    this.bgSpeed = 20;       // scroll 모드일 때 px/s

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
    this.touchCount = 0;

    this.powerMax = 3;
    this.powerLevel = 1;
    this.heartsMax = 5;
    this.hearts = 5;

    this.groups = [];
    this.enemies = [];
    this.missiles = [];
    this.mines = [];
    this.aoes = [];
    this.items = [];

    this.wave = new WaveManager(this);

    this.lastTS = performance.now();
    this.running = false;

    this.score = 0;
    // 득점 연출용 펄스 타이머(0=없음, 1=막 시작)
    // 여러 번 득점이 겹치면 ‘세기’를 누적시키기 위해 amplitude도 둠
    this._scorePulseT = 0;       // 0..1 (카운트다운)
    this._scorePulseAmp = 0;     // 0..N (세기)

    renderHearts(this.hearts, this.heartsMax);
    setPowerLabel(this.powerLevel);

    // 메서드 바인딩(구형 사파리/웹뷰 안전)
    this.loop  = this.loop.bind(this);
    this.start = this.start.bind(this);

    this.particles = new ParticlePool(100);

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
    this.score = 0;
    requestAnimationFrame(this.loop);
  }

  start(){
    // 혹시 외부에서 Game.prototype.start를 읽지 못하는 환경을 대비
    return this._startImpl();
  }

  onStageClear(){
    this.wave.nextStage();
    this.wave.start();
  }
  gameOver(){
    this.running = false;
    this.particles.clearAll();
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
  spawnMine(pos, radius, ttl){
    this.mines.push(new Mine(pos, radius, ttl));
  }
  spawnAoe(pos, radius, duration){
    this.aoes.push(new Aoe(pos, radius, duration));
  }
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
    // 화면 터치중이면 점선으로 변경, 터치가 없을때만 공격형태의 라인으로 변경된다.
    if (this.pointer.active && this.pointer.active.size > 0) return 0;

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
    this.particles.beginFrame();

    for (let i = 0; i < this.groups.length; ++i) {
      const g = this.groups[i];
      try {
        g.update(dt);
      } catch (e) {
        window.__fatal && window.__fatal(e, `Group.update #${i}`); 
        throw e;
      }
    }
    for (let j = 0; j < this.enemies.length; ++j) {
      const e = this.enemies[j];
      try {
        e.update(dt);
      } catch (e) {
        window.__fatal && window.__fatal(e, `Enemy.update #${j}`);
        throw e;
      }
    }

    for(const m of this.missiles) m.update(dt);
    for(const it of this.items) it.update(dt);
    for(const m of this.mines) m.update(dt);
    for(const a of this.aoes) a.update(dt);

    try { this.resolveCollisions(dt); }
    catch (e) { window.__fatal && window.__fatal(e, 'resolveCollisions'); throw e; }

    this.wave.update(dt);
  
    try {
      this.missiles = this.missiles.filter(m=>!m.outOfBounds(this.width, this.height));
      this.enemies = this.enemies.filter(e => !e.isDeadDone());
      this.mines = this.mines.filter(m => !m.end);
      this.aoes = this.aoes.filter(a => !a.end);
      this.groups  = this.groups.filter(g => g.members.length > 0); // 멤버 다 사라진 그룹 정리
    } catch (e) {
      window.__fatal && window.__fatal(e,'cleanup'); 
      throw e;
    }

    // 점수 연출 업데이트
    if (this._scorePulseT > 0){
      const decay = 1.0 / 0.45;      // 펄스 길이(초) ≈ 0.45s
      this._scorePulseT = Math.max(0, this._scorePulseT - dt * decay);
      // 타이머가 끝나면 세기도 자연히 0으로
      if (this._scorePulseT === 0) this._scorePulseAmp = 0;
    }

    this.particles.update(dt);
  }

  // ─────────────────────────────────────────────
  // 충돌/피해 판정
  // - 아이템: 플레이어 원에 닿을 때만 획득 (라인으로는 줍지 않음)
  // - 라인→적: "첫 접촉 시" 현재 효과 라인 수(eff) 만큼 1회 대미지 부여
  //             (예: eff=3이면 닿는 순간 3, 이후 2초 무적은 Enemy.invulUntil이 담당)
  // ─────────────────────────────────────────────
  resolveCollisions(dt){
    const A = this.playerA, B = this.playerB;

    // ---- 미사일 → 플레이어
    for(const m of this.missiles){
      const r1 = m.radius + A.radius; if(A.pos.clone().sub(m.pos).len() <= r1){ A.hit(); }
      const r2 = m.radius + B.radius; if(B.pos.clone().sub(m.pos).len() <= r2){ B.hit(); }
    }

    // ---- 지뢰 -> 플레이어
    for (const m of this.mines) {
      const r1 = m.radius + A.radius;
      if (A.pos.clone().sub(m.pos).len() <= r1) {
        A.hit();
        m.bomb();
      }
      if (m.end) continue;

      const r2 = m.radius + B.radius;
      if (B.pos.clone().sub(m.pos).len() <= r2) {
        B.hit();
        m.bomb();
      }
    }

    // ---- 범위 -> 플레이어
    for (const aoe of this.aoes) {
      const r1 = aoe.radius + A.radius;
      if (A.pos.clone().sub(aoe.pos).len() <= r1) {
        A.hit();
      }
      const r2 = aoe.radius + B.radius;
      if (B.pos.clone().sub(aoe.pos).len() <= r2) {
        B.hit();
      }
    }

    // ---- 적 → 플레이어
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

    // ---- 아이템 획득: 플레이어 원에 닿을 때만 (라인 줍기 제거)
    this.items = this.items.filter(it=>{
      const rA = it.radius + A.radius; if(A.pos.clone().sub(it.pos).len() <= rA){ this.applyItem(it.kind); return false; }
      const rB = it.radius + B.radius; if(B.pos.clone().sub(it.pos).len() <= rB){ this.applyItem(it.kind); return false; }
      return true;
    });

    // ---- 라인 → 적 대미지
    //  - eff: 현재 적용 가능한 라인 수(파워/거리 제한 반영)
    //  - 원칙: "한 라인이라도 닿으면" 그 즉시 eff만큼 1회 대미지(e.damage(eff))
    const eff = this.effectiveLines();
    if(eff > 0){
      const geo = this.getLineGeometry(eff);
      const lineA = geo.lineA, lineB = geo.lineB;

      // 그룹 적
      for(const g of this.groups){
        for(const e of g.members){
          if(!e.isAlive()) continue;

          // (최적화) 이미 무적이면 이번 프레임은 스킵해도 됨. (damage 내부에서도 다시 검사함)
          if(now() < e.invulUntil) continue;

          // 한 라인이라도 닿는지 체크
          let contacted = false;
          const d = segmentPointDistance(lineA, lineB, e.pos);
          if(d <= e.radius){ contacted = true; }
          if(contacted){
            // 첫 접촉 시 점수처럼 누적 대미지를 1회에 적용 (eff가 2/3이면 그 값만큼)
            e.damage(eff);
            if (e.hp <= 0) {
              this.killScore(e.score);
            }
          }
        }
      }

      // 보스 등 단일 적
      for(const e of this.enemies){
        if(!e.isAlive()) continue;
        if(now() < e.invulUntil) continue;

        let contacted = false;
        for(const off of offsets){
          const a = lineA.clone().add(off);
          const b = lineB.clone().add(off);
          const d = segmentPointDistance(a, b, e.pos);
          if(d <= e.radius){ contacted = true; break; }
        }
        if(contacted){
          e.damage(eff);
        }
      }
    }
  }

  killScore(baseScore)
  {
    const TparSec  = 60;   // 스테이지 기준 시간(초). 예: 60초
    const mMax     = 2.0;  // 시작 시 최대 배수(예: 2.0배)
    const mMin     = 1.0;  // 최소 배수(예: 1.0배)
    const lambda   = 3.0;  // 지수 감소율(곡선 가파름, 2.5~3.5 권장)

    // 1) 경과 시간 t를 0 이상으로 보정(이상치 방지)
    const t = Math.max(0, this.wave.stageTime);

    // 2) m(t) 계산: m(t) = mMin + (mMax - mMin) * exp( -lambda * (t / TparSec) )
    //    - t가 0일 때 m(t)≈mMax, 시간이 지날수록 mMin에 수렴
    const ratio = t / TparSec;
    const multiplier = mMin + (mMax - mMin) * Math.exp(-lambda * ratio);

    // 3) 최종 점수 = baseScore * multiplier (연출을 위해 반올림)
    const score = Math.round(Math.max(0, baseScore) * multiplier);

    this.addScore(score);
    // this.score += score;
    // __log('[Score]', this.score);

    // multiplier 점수 배수값
    // return { score, multiplier };
  }

  addScore(amount = 0){
    this.score = Math.max(0, (this.score|0) + (amount|0));
    this._kickScorePulse();
  }

  // 펄스 시작/누적
  _kickScorePulse(){
    // 새 득점: 타이머 리셋, 세기 누적(상한 두어 과도한 스케일 방지)
    this._scorePulseT = 1.0;
    this._scorePulseAmp = Math.min(3, this._scorePulseAmp + 1); // 최대 3스택
  }
    
  applyItem(kind){
    if(kind==='heart'){
      if (this.hearts === this.heartsMax) {
        this.score += this.wave.dataPack.score.itemBonus;
      } else {
        this.score += this.wave.dataPack.score.item;
      }
      this.hearts = Math.min(this.heartsMax, this.hearts+1);
      renderHearts(this.hearts, this.heartsMax);
    }else if(kind==='power'){
      if (this.powerLevel === this.powerMax) {
        this.score += this.wave.dataPack.score.itemBonus;
      } else {
        this.score += this.wave.dataPack.score.item;
      }
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
    // const offsets = [];
    if(len < 1e-3) return {lineA:lineA, lineB:lineB };
    return { lineA:lineA, lineB:lineB };
  }

  draw(){
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.width,this.height);

    // ✅ 배경 이미지 그리기 (CSS 'cover'처럼 꽉 차게 + 선택적 스크롤)
    // const bg = (window.ASSETS && ASSETS.bg) ? ASSETS.bg[this.bgKey] : null;
    const bg = (ASSETS && ASSETS.images) ? ASSETS.images[this.bgKey] : null; // ← url 키로 조회
    
    if (bg && bg.complete && bg.width && bg.height) {
      // cover 스케일 계산
      const iw = bg.width, ih = bg.height;
      const sw = this.width, sh = this.height;
      const scale = Math.max(sw/iw, sh/ih);  // cover
      const dw = iw * scale, dh = ih * scale;
      let dx = (sw - dw) * 0.5;
      let dy = (sh - dh) * 0.5;

      // 스크롤 모드라면 오프셋 적용 + 두 장 그려서 이음새 숨기기(타일형 이미지일 때)
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true; // 배경은 보통 부드럽게

      // static
      ctx.drawImage(bg, dx, dy, dw, dh);

      ctx.imageSmoothingEnabled = prevSmooth;
    } else {
      // 🔸 백업: 배경 이미지를 못 찾으면 그라디언트/단색
      const g = ctx.createLinearGradient(0,0,0,this.height);
      g.addColorStop(0, "#0b0c10");
      g.addColorStop(1, "#131823");
      ctx.fillStyle = g;
      ctx.fillRect(0,0,this.width,this.height);
    }

    // Items
    for(const it of this.items) it.draw(ctx);

    // Attack line
    const eff = this.effectiveLines();
    const geo = this.getLineGeometry(eff);
    const lineA = geo.lineA, lineB = geo.lineB;
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
      // 아래 흰 (베이스)
      ctx.setLineDash([]);
      ctx.lineWidth = 7; 
      ctx.strokeStyle = COL.lineOuter;
      ctx.beginPath();
      ctx.moveTo(lineA.x, lineA.y);
      ctx.lineTo(lineB.x, lineB.y);
      ctx.stroke();

      // 가운데 코어 색
      ctx.lineWidth = 3;
      if (eff === 2)
        ctx.strokeStyle = COL.lineTwo;
      else if (eff === 3)
        ctx.strokeStyle = COL.lineThree;
      else
        ctx.strokeStyle = COL.lineOne;
      ctx.beginPath();
      ctx.moveTo(lineA.x, lineA.y);
      ctx.lineTo(lineB.x, lineB.y);
      ctx.stroke();
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

    // Mines
    for(const m of this.mines) m.draw(ctx);

    // Aoes
    for(const a of this.aoes) a.draw(ctx);

    this.particles.draw(ctx);

    // Wave overlays
    this.wave.draw(ctx);

    // score HUD
    this._drawScoreHUD();
  }

  _drawScoreHUD() {
    const g = this;
    const ctx = this.ctx;
    const W = g.width, H = g.height;

    const scoreStr = String(g.score|0);
    const s = g._getScoreScale();       // 1.0 ~ 1.3 정도

    ctx.save();

    // 상단 중앙 위치
    const x = W * 0.5;
    const y = H * 0.08;                 // 상단 8% 지점(원하면 0.1~0.12 조정)

    // 살짝 그림자/광택
    // ctx.shadowColor = 'rgba(0,0,0,0.6)';
    // ctx.shadowBlur = 8;
    
    ctx.font = 'bold 48px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 스케일 애니메이션
    ctx.translate(x, y);
    ctx.scale(s, s);

    // // 바탕(외곽선 느낌) — 두꺼운 스트로크로 테두리 살짝
    // ctx.lineWidth = 6;
    // ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    // ctx.strokeText(scoreStr, 0, 0);

    // // 본문 텍스트
    // ctx.fillStyle = '#ffffff';
    // ctx.fillText(scoreStr, 0, 0);

    // 1) 테두리(스트로크): 블러/섀도우 없이 또렷하게
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = 6;                         // 테두리 두께
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';      // 어두운 외곽선
    ctx.strokeText(scoreStr, 0, 0);

    // 2) 본문: 약한 드롭섀도우만(스트로크에 번지지 않게 분리)
    //    (캔버스 2D filter가 지원되면 더 깔끔)
    if ('filter' in ctx) {
      ctx.filter = 'drop-shadow(0px 2px 3px rgba(0,0,0,0.5))';
      ctx.fillStyle = '#fff';
      ctx.fillText(scoreStr, 0, 0);
      ctx.filter = 'none';
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#fff';
      ctx.fillText(scoreStr, 0, 0);
    }

    ctx.restore();
  }

  // 0..1 → 0..1(튀는 느낌의 이징). 너무 과하면 아래 계수만 줄이세요.
  _scoreEaseOutElastic(u){
    const c4 = (2 * Math.PI) / 3;
    if (u === 0) return 0;
    if (u === 1) return 1;
    return Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * c4) + 1;
  }

  // 현재 프레임의 점수 텍스트 스케일(1.0=기본)
  _getScoreScale(){
    if (this._scorePulseT <= 0) return 1.0;
    // t: 1→0 로 줄어드니, 진행률 u는 (1 - t)
    const u = 1 - this._scorePulseT;
    // 기본 진폭 0.28, 스택당 0.08 추가 (최대 스택 상한은 위에서 제한)
    const amp = 0.28 + 0.08 * this._scorePulseAmp;
    return 1.0 + amp * this._scoreEaseOutElastic(u); // 1.0 ~ 1.28.. 범위
  }

  loop(){
    if(!this.running) return;

    // 디버그 일시정지 지원
    if (window.__DEBUG__ && window.__PAUSE__ && !window.__STEP__){
      requestAnimationFrame(this.loop);
      return;
    }
    window.__STEP__ = false;

    const ts = performance.now();
    const dt = Math.min(0.033, (ts - this.lastTS)/1000);
    this.lastTS = ts;
    this.lastDT = dt;

    try{
      this.update(dt);
      this.draw();
    } catch(e) {
      if (window.__fatal) window.__fatal(e, 'Game.loop/update/draw');
      this.running = false; // 멈춰서 상태 고정
      return;
    }
    
    requestAnimationFrame(this.loop);
  }
}

// 전역 노출 보강(일부 환경에서 스코프 문제 방지)
window.Game = Game;
