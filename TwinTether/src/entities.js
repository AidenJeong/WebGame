// Entities: players, enemies, missiles, items, groups

class PlayerCircle {
  constructor(game, x, y, radius){
    this.game = game;
    this.pos = new Vec2(x,y);
    this.radius = radius;
    this.color = COL.player;
    this.invulUntil = 0;     // seconds
    this.shakeUntil = 0;     // seconds
    this.shakeMag = 0;       // px
  }
  hit(){
    const t = now();
    if(t < this.invulUntil) return false;
    this.game.damagePlayer(1);
    this.invulUntil = t + 0.5; // brief i-frames
    return true;
  }
  draw(ctx){
    ctx.save();
    // 흔들림 오프셋
    let ox = 0, oy = 0;
    if(now() < this.shakeUntil){
      ox = (Math.random()*2-1) * this.shakeMag;
      oy = (Math.random()*2-1) * this.shakeMag;
    }
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x + ox, this.pos.y + oy, this.radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

const ENEMY_TYPE = { NORMAL: 'normal', SHOOTER:'shooter', BOSS:'boss' };

class Enemy {
  constructor(game, x, y, radius, type, hp){
    this.game = game;
    this.pos = new Vec2(x,y);
    this.radius = radius;
    this.type = type;
    this.maxHp = hp;
    this.hp = hp;
    this.baseColor = (type===ENEMY_TYPE.NORMAL)?COL.enemyNormal:
                     (type===ENEMY_TYPE.SHOOTER)?COL.enemyShooter:COL.boss;
    this.blinkUntil = 0; // for shooter telegraph
    this.nextShotAt = now() + 3; // shooters only
    this.shotBlinkTime = 1; // shooters blink 1s before firing
    // For boss movement
    this.bossMoveTimer = 3;  // seconds of move
    this.bossStopTimer = 0;  // seconds of stop
    this.heading = rand(0, TAU);
    this.speed = 0; // set by group
    this.column = 0; // used when in formation (0 or 1 for 2열)
    this.slotInCol = 0;
    this.lastLineDamageTick = 0;
  }
  isAlive(){ return this.hp > 0; }
  damage(n){
    if(!this.isAlive()) return;
    this.hp -= n;
    if(this.hp <= 0){
      this.onDeath();
    }
  }
  onDeath(){
    // Drop items based on type
    const g = this.game;
    if(this.type === ENEMY_TYPE.NORMAL){
      if(Math.random()<0.01) g.dropItem('heart', this.pos.clone());
      if(Math.random()<0.005) g.dropItem('power', this.pos.clone());
    } else if(this.type === ENEMY_TYPE.SHOOTER){
      if(Math.random()<0.10) g.dropItem('heart', this.pos.clone());
      if(Math.random()<0.10) g.dropItem('power', this.pos.clone());
    } else if(this.type === ENEMY_TYPE.BOSS){
      // optional for prototype
    }
  }
  update(dt){
    if(!this.isAlive()) return;
    const g = this.game;
    // Shooter firing logic
    if(this.type === ENEMY_TYPE.SHOOTER){
      const t = now();
      if(t >= this.nextShotAt - this.shotBlinkTime && t < this.nextShotAt){
        this.blinkUntil = this.nextShotAt;
      }
      if(t >= this.nextShotAt){
        for(let i=0;i<2;i++){
          const ang = rand(0, TAU);
          const spd = g.missileSpeed;
          const v = Vec2.fromAngle(ang, spd);
          g.spawnMissile(this.pos.clone(), v);
        }
        this.nextShotAt = t + 3;
        this.blinkUntil = 0;
      }
    } else if(this.type === ENEMY_TYPE.BOSS){
      // Boss: 3s move + 1s stop; stop에서 6발
      if(this.bossMoveTimer > 0){
        const step = Math.min(this.bossMoveTimer, dt);
        this.pos.add(Vec2.fromAngle(this.heading, this.game.enemySpeed * step));
        this.bossMoveTimer -= step;
        if(this.bossMoveTimer <= 0){
          this.bossStopTimer = 1;
        }
      } else if(this.bossStopTimer > 0){
        this.bossStopTimer -= dt;
        if(this.bossStopTimer <= 0){
          for(let i=0;i<6;i++){
            const ang = i * (TAU/6);
            const v = Vec2.fromAngle(ang, this.game.missileSpeed);
            this.game.spawnMissile(this.pos.clone(), v);
          }
          this.heading = rand(0, TAU);
          this.bossMoveTimer = 3;
        }
      }
      this.bounceWalls();
    }
  }
  bounceWalls(){
    const g = this.game, r=this.radius;
    if(this.pos.x < r){ this.pos.x=r; this.heading = Math.PI - this.heading + rand(-0.5,0.5); }
    if(this.pos.x > g.width - r){ this.pos.x=g.width-r; this.heading = Math.PI - this.heading + rand(-0.5,0.5); }
    if(this.pos.y < r){ this.pos.y=r; this.heading = -this.heading + rand(-0.5,0.5); }
    if(this.pos.y > g.height - r){ this.pos.y=g.height-r; this.heading = -this.heading + rand(-0.5,0.5); }
    this.heading = wrapAngle(this.heading);
  }
  draw(ctx){
    if(!this.isAlive()) return;
    ctx.save();
    const t = now();
    const blink = t < this.blinkUntil ? 0.5 + 0.5*Math.sin(t*20) : 0;
    ctx.fillStyle = this.baseColor;
    if(blink){ ctx.globalAlpha = 0.5 + 0.5*blink; }
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // HP number
    ctx.fillStyle = "#111";
    ctx.font = `${Math.floor(this.radius*0.9)}px bold system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(Math.max(0, this.hp|0), this.pos.x, this.pos.y);
    ctx.restore();
  }
}

// --- 선두 추종(지렁이) 포메이션 with trail following ---
class EnemyGroup {
  constructor(game, formation, count, typeConfigFn){
    this.game = game;
    this.columns = formation;         // 1 or 2
    this.members = [];                // Enemy[]
    this.speed = game.enemySpeed;

    // 거리 파라미터
    this.spacing = game.enemyRadius * 2.3;     // 앞뒤 간격(슬롯 당)
    this.sideOffset = game.enemyRadius * 2.2;  // 2열 좌우 간격

    // 컬럼별 선두(head)와 trail
    const cols = this.columns || 1;
    this.heads  = new Array(cols).fill(0).map(()=>({ pos:new Vec2(-999,-999), dir:0 }));
    this.trails = new Array(cols).fill(0).map(()=>({ pts:[], lens:[], total:0 })); // 누적거리 배열

    // 멤버 생성(+ 컬럼/슬롯 지정)
    for(let i=0;i<count;i++){
      const col = (cols===2) ? (i%2) : 0;
      const slot = (cols===2) ? Math.floor(i/2) : i; // 0이 선두 바로 뒤
      const e = new Enemy(game, -999,-999, game.enemyRadius, ENEMY_TYPE.NORMAL, 3);
      e.column = col;
      e.slotInCol = slot;
      typeConfigFn(e, i, col, slot);
      this.members.push(e);
    }
  }

  setPositions(origin, dir){
    const cols = this.columns || 1;
    const perp = Vec2.fromAngle(dir + Math.PI/2, this.sideOffset);
    if(cols===1){
      this.heads[0].pos = origin.clone();
      this.heads[0].dir = dir;
    } else {
      this.heads[0].pos = origin.clone().add(perp.clone().mul(-1));
      this.heads[1].pos = origin.clone().add(perp.clone().mul(+1));
      this.heads[0].dir = this.heads[1].dir = dir;
    }
    // 초기 trail 채우기(짧은 선)
    for(let c=0;c<cols;c++){
      const tr = this.trails[c];
      tr.pts = [ this.heads[c].pos.clone(), this.heads[c].pos.clone().add(Vec2.fromAngle(dir, -1)) ];
      tr.lens = [0, 1];
      tr.total = 1;
    }
    // 초기 위치 배치(선두 뒤 슬롯대로)
    this._applySlotsFromTrail();
  }

  _pushTrail(c, newPos){
    const tr = this.trails[c];
    const pts = tr.pts, lens = tr.lens;
    const last = pts[pts.length-1];
    const dx = newPos.x - last.x, dy = newPos.y - last.y;
    const d = Math.hypot(dx, dy);
    if(d < 0.0001) return;
    pts.push(newPos.clone());
    lens.push(tr.total + d);
    tr.total += d;

    // trail 길이 제한(최대 필요 거리 = (최대 슬롯+1)*spacing + 여유)
    let maxSlot = 0;
    for(const e of this.members) if(e.column===c) maxSlot = Math.max(maxSlot, e.slotInCol);
    const need = (maxSlot + 1) * this.spacing + 200;
    // 오래된 앞쪽 포인트 제거
    while(pts.length > 2 && (tr.total - lens[1]) > need){
      pts.shift();
      const off = lens[1];
      lens.shift();
      for(let i=0;i<lens.length;i++) lens[i] -= off;
      tr.total -= off;
    }
  }

  _sampleTrail(c, distBehind){
    // trail의 끝(=현재 head)에 대한 뒤쪽 거리 위치를 샘플링
    const tr = this.trails[c];
    const pts = tr.pts, lens = tr.lens;
    if(pts.length<2) return this.heads[c].pos.clone();
    const target = Math.max(0, tr.total - distBehind);
    // 이분 탐색 대신 선형(포인트 수가 작음)
    let i=1;
    while(i<lens.length && lens[i] < target) i++;
    if(i>=lens.length) return pts[pts.length-1].clone();
    const a = pts[i-1], b = pts[i];
    const la = lens[i-1], lb = lens[i];
    const t = (lb===la) ? 0 : (target - la)/(lb - la);
    return new Vec2( lerp(a.x,b.x,t), lerp(a.y,b.y,t) );
  }

  _applySlotsFromTrail(){
    const cols = this.columns || 1;
    for(let c=0;c<cols;c++){
      const head = this.heads[c];
      // head의 현재 위치를 trail에 푸시(그리기/샘플용)
      this._pushTrail(c, head.pos);
      for(const e of this.members){
        if(e.column!==c) continue;
        const dist = (e.slotInCol + 1) * this.spacing;
        let p = this._sampleTrail(c, dist);
        // 2열이면 좌우 측방 오프셋
        if(cols===2){
          // head 방향 기준으로 perp
          const fwd = Vec2.fromAngle(head.dir, 1);
          const lat = fwd.perp().mul(c===0 ? -this.sideOffset : +this.sideOffset);
          p.add(lat);
        }
        e.pos = p;
        e.heading = head.dir;
        e.speed = this.speed;
      }
    }
  }

  _bounceHead(c){
    // 화면 벽에서 방향 반사(+약간 랜덤)
    const g = this.game;
    const head = this.heads[c];
    const r = g.enemyRadius;
    let bounced = false;

    if(head.pos.x < r){ head.pos.x = r; head.dir = Math.PI - head.dir; bounced = true; }
    if(head.pos.x > g.width - r){ head.pos.x = g.width - r; head.dir = Math.PI - head.dir; bounced = true; }
    if(head.pos.y < r){ head.pos.y = r; head.dir = -head.dir; bounced = true; }
    if(head.pos.y > g.height - r){ head.pos.y = g.height - r; head.dir = -head.dir; bounced = true; }

    if(bounced){
      head.dir = wrapAngle(head.dir + rand(-0.5, 0.5));
    }
  }

  update(dt){
    // 선두 이동
    for(let c=0;c<(this.columns||1);c++){
      const head = this.heads[c];
      head.pos.add(Vec2.fromAngle(head.dir, this.speed * dt));
      this._bounceHead(c);
    }
    // trail 기반 재배치(연속적 이동)
    this._applySlotsFromTrail();

    // 슈터/보스 등의 개인 업데이트
    for(const e of this.members){
      e.update(dt);
    }
  }

  aliveCount(){ return this.members.filter(m=>m.isAlive()).length; }
  draw(ctx){ for(const e of this.members) e.draw(ctx); }
}

// Missiles
class Missile {
  constructor(pos, vel, radius=5){
    this.pos = pos;
    this.vel = vel;
    this.radius = radius;
  }
  update(dt){ this.pos.add(this.vel.clone().mul(dt)); }
  outOfBounds(w,h){
    const m=40;
    return this.pos.x<-m||this.pos.y<-m||this.pos.x>w+m||this.pos.y>h+m;
  }
  draw(ctx){
    ctx.save();
    ctx.fillStyle = COL.missile;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// Items
class Item {
  constructor(kind, pos){
    this.kind = kind; // 'heart'|'power'
    this.pos = pos;
    this.radius = 10;
    this.vel = Vec2.fromAngle(rand(0,TAU), rand(20,50)); // slow drift
    this.dirChangeTimer = rand(0.5, 2);
  }
  update(dt){
    this.dirChangeTimer -= dt;
    if(this.dirChangeTimer<=0){
      const ang = this.vel.angle() + rand(-0.6, 0.6);
      const spd = this.vel.len();
      this.vel = Vec2.fromAngle(ang, spd);
      this.dirChangeTimer = rand(0.5, 2);
    }
    this.pos.add(this.vel.clone().mul(dt));
  }
  draw(ctx){
    ctx.save();
    ctx.fillStyle = this.kind==='heart' ? COL.itemHearts : COL.itemPower;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#0b0c10";
    ctx.font = "12px bold system-ui";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(this.kind==='heart'?'♥':'P', this.pos.x, this.pos.y);
    ctx.restore();
  }
}
