// Core game orchestrator
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
    this.playerRadius = this.playerDiameter/2|0;
    this.enemyRadius = Math.floor(this.playerRadius * 2/3);
    this.missileSpeed = Math.min(this.width, this.height)/1.5; // px per second
    this.enemySpeed = Math.min(this.width, this.height)/3; // cross short side in ~3s

    // entities
    const ax = this.width*0.35, bx = this.width*0.65, y = this.height*0.8;
    this.playerA = new PlayerCircle(this, ax, y, this.playerRadius);
    this.playerB = new PlayerCircle(this, bx, y, this.playerRadius);
    this.pointer = new PointerManager(canvas, this);

    this.powerMax = 3;
    this.powerLevel = 1; // max lines allowed by power
    this.heartsMax = 5;
    this.hearts = 5;

    this.groups = []; // EnemyGroup
    this.enemies = []; // singles (boss etc.)
    this.missiles = [];
    this.items = [];

    this.wave = new WaveManager(this);

    this.dtAccum = 0;
    this.lastTS = performance.now();
    this.running = false;

    renderHearts(this.hearts, this.heartsMax);
    setPowerLabel(this.powerLevel);

    // start button
    document.getElementById('startBtn').onclick = ()=>{
      document.getElementById('overlay').classList.add('hidden');
      this.start();
    };
  }
  resize(){
    // Fit to viewport with 9:16 letterbox
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
  start(){
    // reset game state
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
    this.loop();
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
    if(this.hearts<=0) this.gameOver();
  }
  setPlayerPos(target, p){
    // Clamp inside bounds
    const r = this.playerRadius;
    p.x = clamp(p.x, r, this.width - r);
    p.y = clamp(p.y, r, this.height - r);
    if(target==='A') this.playerA.pos = p;
    else this.playerB.pos = p;
  }
  spawnMissile(pos, vel){
    this.missiles.push(new Missile(pos, vel, 5));
  }
  dropItem(kind, pos){
    this.items.push(new Item(kind, pos));
  }

  // Compute active line count based on power & distance.
  // IMPORTANT: distance thresholds are based on "gap" (edge-to-edge) not center distance.
  // gap = centerDistance - playerDiameter.
  distanceAllowedLines(){
    const A = this.playerA.pos, B=this.playerB.pos;
    const centerDist = A.clone().sub(B).len();
    const D = this.playerDiameter;
    const gap = Math.max(0, centerDist - D); // space between the two circles
    if(gap >= 6*D) return 0;       // too far -> disabled (dashed)
    if(gap > 4*D) return 1;
    if(gap > 2*D) return 2;
    return 3;
  }
  effectiveLines(){
    return Math.min(this.powerLevel, this.distanceAllowedLines());
  }

  update(dt){
    // Update groups
    for(const g of this.groups) g.update(dt);
    // Remove dead enemies in groups kept (holes remain)
    // Update single enemies
    for(const e of this.enemies) e.update(dt);
    // Missiles
    for(const m of this.missiles) m.update(dt);
    this.missiles = this.missiles.filter(m=>!m.outOfBounds(this.width, this.height));
    // Items
    for(const it of this.items) it.update(dt);

    // Collisions
    this.resolveCollisions(dt);

    // Wave manager
    this.wave.update(dt);
  }

  resolveCollisions(dt){
    const A = this.playerA, B=this.playerB;
    // Player vs missiles
    for(const m of this.missiles){
      const r = m.radius + A.radius;
      if(A.pos.clone().sub(m.pos).len() <= r){ A.hit(); }
      const r2 = m.radius + B.radius;
      if(B.pos.clone().sub(m.pos).len() <= r2){ B.hit(); }
    }

    // Player vs enemies
    for(const g of this.groups){
      for(const e of g.members){
        if(!e.isAlive()) continue;
        const rA = e.radius + A.radius;
        if(A.pos.clone().sub(e.pos).len() <= rA){ A.hit(); }
        const rB = e.radius + B.radius;
        if(B.pos.clone().sub(e.pos).len() <= rB){ B.hit(); }
      }
    }
    for(const e of this.enemies){
      if(!e.isAlive()) continue;
      const rA = e.radius + A.radius;
      if(A.pos.clone().sub(e.pos).len() <= rA){ A.hit(); }
      const rB = e.radius + B.radius;
      if(B.pos.clone().sub(e.pos).len() <= rB){ B.hit(); }
    }

    // Items pickup (by player circles OR by attack lines)
    const eff = this.effectiveLines();
    const {lineA, lineB, offsets} = this.getLineGeometry(eff);
    const lineActive = eff>0;
    this.items = this.items.filter(it=>{
      // player pickup
      const rA = it.radius + A.radius;
      if(A.pos.clone().sub(it.pos).len() <= rA){ this.applyItem(it.kind); return false; }
      const rB = it.radius + B.radius;
      if(B.pos.clone().sub(it.pos).len() <= rB){ this.applyItem(it.kind); return false; }
      // line pickup (treat as small thickness 8)
      if(lineActive){
        for(const off of offsets){
          const a = lineA.clone().add(off);
          const b = lineB.clone().add(off);
          if(segmentPointDistance(a,b,it.pos) <= it.radius + 6){
            this.applyItem(it.kind); return false;
          }
        }
      }
      return true;
    });

    // Line vs enemies (damage tick)
    const t = now();
    const damageInterval = 0.1;
    if(eff>0){
      // Groups
      for(const g of this.groups){
        for(const e of g.members){
          if(!e.isAlive()) continue;
          if(t < e.lastLineDamageTick + damageInterval) continue;
          let hitLines = 0;
          for(const off of offsets){
            const a = lineA.clone().add(off);
            const b = lineB.clone().add(off);
            const d = segmentPointDistance(a,b,e.pos);
            if(d <= e.radius) hitLines++;
          }
          if(hitLines>0){
            e.damage(hitLines); // 1 per line overlapped
            e.lastLineDamageTick = t;
          }
        }
      }
      // Singles
      for(const e of this.enemies){
        if(!e.isAlive()) continue;
        if(t < e.lastLineDamageTick + damageInterval) continue;
        let hitLines = 0;
        for(const off of offsets){
          const a = lineA.clone().add(off);
          const b = lineB.clone().add(off);
          const d = segmentPointDistance(a,b,e.pos);
          if(d <= e.radius) hitLines++;
        }
        if(hitLines>0){
          e.damage(hitLines);
          e.lastLineDamageTick = t;
        }
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

  // Returns endpoints of center line and offsets for parallel lines
  getLineGeometry(effLines){
    const A = this.playerA.pos, B=this.playerB.pos;
    const lineA = A.clone();
    const lineB = B.clone();
    const dir = B.clone().sub(A);
    const len = dir.len();
    const offsets = [];
    if(len < 1e-3) return {lineA, lineB, offsets:[]};
    const n = dir.clone().norm().perp(); // unit perpendicular
    const spacing = 10; // px between lines
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
    return { lineA, lineB, offsets };
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

    // Draw items under
    for(const it of this.items) it.draw(ctx);

    // Draw attack line
    const eff = this.effectiveLines();
    const {lineA, lineB, offsets} = this.getLineGeometry(eff);
    const distAllowed = this.distanceAllowedLines();
    ctx.save();
    if(distAllowed===0){
      // dashed disabled
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
      for(const off of offsets){
        ctx.beginPath();
        ctx.moveTo(lineA.x+off.x, lineA.y+off.y);
        ctx.lineTo(lineB.x+off.x, lineB.y+off.y);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Draw players
    this.playerA.draw(ctx);
    this.playerB.draw(ctx);

    // Draw enemies
    for(const g of this.groups) g.draw(ctx);
    for(const e of this.enemies) e.draw(ctx);

    // Missiles on top
    for(const m of this.missiles) m.draw(ctx);

    // Wave telegraphs
    this.wave.draw(ctx);
  }

  loop = ()=>{
    if(!this.running) return;
    const ts = performance.now();
    const dt = Math.min(0.033, (ts - this.lastTS)/1000); // cap
    this.lastTS = ts;

    this.update(dt);
    this.draw();

    requestAnimationFrame(this.loop);
  }
}
