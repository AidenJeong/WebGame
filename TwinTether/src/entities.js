// ===============================
// Entities: players, enemies, missiles, items, groups
// - 이동속도: 일반/공격형을 원래 속도(game.enemySpeed)로 복구
// - 적 피격 i-frame: 2초 무적(invulUntil) 추가
//   * 라인에 맞으면 '그 순간의 라인 겹수' 만큼 즉시 피해 후 2초간 추가 피해 무시
// ===============================

class PlayerCircle {
  constructor(game, x, y, radius){
    this.game = game;
    this.pos = new Vec2(x,y);
    this.radius = radius;
    this.color = COL.player;
    this.invulUntil = 0;     // 무적 종료 시각(초)
    this.shakeUntil = 0;     // 피격 흔들림 종료 시각
    this.shakeMag = 0;       // 흔들림 세기(px)
  }
  hit(){
    const t = now();
    if(t < this.invulUntil) return false;
    this.game.damagePlayer(1);
    this.invulUntil = t + 0.5; // 플레이어는 짧은 무적
    return true;
  }
  draw(ctx){
    ctx.save();
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

    // 타입별 기본 색상
    this.baseColor = (type===ENEMY_TYPE.NORMAL)?COL.enemyNormal:
                     (type===ENEMY_TYPE.SHOOTER)?COL.enemyShooter:COL.boss;

    // 슈터(공격형) 발사: 5초마다, 1초 전 깜빡임
    this.blinkUntil = 0;
    this.shotBlinkTime = 1;
    this.nextShotAt = now() + 5;

    // 보스 이동/정지 사이클
    this.bossMoveTimer = 3;
    this.bossStopTimer = 0;
    this.heading = rand(0, TAU);

    // 그룹에서 세팅되는 이동속도/슬롯 정보
    this.speed = 0;
    this.column = 0;      // 2열일 때 0/1
    this.slotInCol = 0;   // 선두 뒤 몇 번째

    // 적 피격 i-frame(라인 피해용)
    this.invulUntil = 0;           // now() < invulUntil 이면 라인 피해 무시

    // 데미지 시 붉은 플래시
    this.hitFlashUntil = 0;
    this.hitFlashColor = "#ff5252";
  }

  isAlive(){ return this.hp > 0; }

  // ▼ 라인 피해: '그 순간 라인 겹수'만큼 즉시 피해, 2초 무적
  damage(n){
    const t = now();
    if(!this.isAlive()) return;
    if(t < this.invulUntil) return;      // 무적이면 무시
    this.hp -= n;
    this.hitFlashUntil = t + 0.15;       // 짧은 플래시
    this.invulUntil = t + 2.0;           // 2초간 추가 피해 무시
    if(this.hp <= 0) this.onDeath();
  }

  // 사망 시 아이템 드랍
  onDeath(){
    const g = this.game;
    if(this.type === ENEMY_TYPE.NORMAL){
      if(Math.random()<0.15) g.dropItem('heart', this.pos.clone());
      if(Math.random()<0.15) g.dropItem('power', this.pos.clone());
    } else if(this.type === ENEMY_TYPE.SHOOTER){
      if(Math.random()<0.20) g.dropItem('heart', this.pos.clone());
      if(Math.random()<0.20) g.dropItem('power', this.pos.clone());
    }
  }

  update(dt){
    if(!this.isAlive()) return;

    if(this.type === ENEMY_TYPE.SHOOTER){
      const t = now();
      if(t >= this.nextShotAt - this.shotBlinkTime && t < this.nextShotAt){
        this.blinkUntil = this.nextShotAt;   // 깜빡임 켜기
      }
      if(t >= this.nextShotAt){
        // 랜덤 방향 미사일 1발
        const ang = rand(0, TAU);
        const v = Vec2.fromAngle(ang, this.game.missileSpeed);
        this.game.spawnMissile(this.pos.clone(), v);
        this.nextShotAt = t + 5;            // 다음 발사 예약
        this.blinkUntil = 0;
      }
    }
    else if(this.type === ENEMY_TYPE.BOSS){
      // 보스: 3초 이동 → 1초 정지 → 6발 발사
      if(this.bossMoveTimer > 0){
        const step = Math.min(this.bossMoveTimer, dt);
        this.pos.add(Vec2.fromAngle(this.heading, this.game.enemySpeed * step));
        this.bossMoveTimer -= step;
        if(this.bossMoveTimer <= 0) this.bossStopTimer = 1;
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

  // 화면 벽 반사(보스 이동용)
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
    const telegraphBlink = (t < this.blinkUntil) ? (0.5 + 0.5*Math.sin(t*20)) : 0;
    const flashing = (t < this.hitFlashUntil);
    if(flashing){
      ctx.shadowColor = this.hitFlashColor;
      ctx.shadowBlur = Math.max(6, this.radius*0.6);
      ctx.fillStyle = this.hitFlashColor;
    } else {
      ctx.fillStyle = this.baseColor;
    }
    if(telegraphBlink && !flashing){ ctx.globalAlpha = 0.5 + 0.5*telegraphBlink; }
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // HP 숫자
    ctx.fillStyle = "#111";
    ctx.font = `${Math.floor(this.radius*0.9)}px bold system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(Math.max(0, this.hp|0), this.pos.x, this.pos.y);
    ctx.restore();
  }
}

// -----------------------------------------------
// 선두 추종(지렁이) 포메이션 + trail 기반 연속 이동
// - 이동속도: 원래 속도(game.enemySpeed)
// - 2열 순간이동 버그: trail 샘플 좌표에 추가 측면 오프셋 불가
// -----------------------------------------------
class EnemyGroup {
  constructor(game, formation, count, typeConfigFn){
    this.game = game;
    this.columns = formation;         // 1 또는 2
    this.members = [];
    this.speed = game.enemySpeed;     // ★ 원래 속도로 복구

    // 간격 파라미터
    this.spacing = game.enemyRadius * 2.3;
    this.sideOffset = game.enemyRadius * 2.2;

    // 컬럼별 선두(head)와 trail
    const cols = this.columns || 1;
    this.heads  = new Array(cols).fill(0).map(()=>({ pos:new Vec2(-999,-999), dir:0 }));
    this.trails = new Array(cols).fill(0).map(()=>({ pts:[], lens:[], total:0 }));

    // 멤버 생성(+ 컬럼/슬롯 지정)
    for(let i=0;i<count;i++){
      const col = (cols===2) ? (i%2) : 0;
      const slot = (cols===2) ? Math.floor(i/2) : i;
      const e = new Enemy(game, -999,-999, game.enemyRadius, ENEMY_TYPE.NORMAL, 3);
      e.column = col; e.slotInCol = slot;
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
      this.heads[0].pos = origin.clone().add(perp.clone().mul(-1)); // 좌
      this.heads[1].pos = origin.clone().add(perp.clone().mul(+1)); // 우
      this.heads[0].dir = this.heads[1].dir = dir;
    }
    for(let c=0;c<cols;c++){
      const tr = this.trails[c];
      tr.pts = [ this.heads[c].pos.clone(), this.heads[c].pos.clone().add(Vec2.fromAngle(dir, -1)) ];
      tr.lens = [0, 1];
      tr.total = 1;
    }
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
    let maxSlot = 0;
    for(const e of this.members) if(e.column===c) maxSlot = Math.max(maxSlot, e.slotInCol);
    const need = (maxSlot + 1) * this.spacing + 200;
    while(pts.length > 2 && (tr.total - lens[1]) > need){
      pts.shift();
      const off = lens[1];
      lens.shift();
      for(let i=0;i<lens.length;i++) lens[i] -= off;
      tr.total -= off;
    }
  }

  _sampleTrail(c, distBehind){
    const tr = this.trails[c];
    const pts = tr.pts, lens = tr.lens;
    if(pts.length<2) return this.heads[c].pos.clone();
    const target = Math.max(0, tr.total - distBehind);
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
      this._pushTrail(c, head.pos);
      for(const e of this.members){
        if(e.column!==c) continue;
        const dist = (e.slotInCol + 1) * this.spacing;
        const p = this._sampleTrail(c, dist); // trail 그대로 사용
        e.pos = p; e.heading = head.dir; e.speed = this.speed;
      }
    }
  }

  _bounceHead(c){
    const g = this.game;
    const head = this.heads[c];
    const r = g.enemyRadius;
    let bounced = false;
    if(head.pos.x < r){ head.pos.x = r; head.dir = Math.PI - head.dir; bounced = true; }
    if(head.pos.x > g.width - r){ head.pos.x = g.width - r; head.dir = Math.PI - head.dir; bounced = true; }
    if(head.pos.y < r){ head.pos.y = r; head.dir = -head.dir; bounced = true; }
    if(head.pos.y > g.height - r){ head.pos.y = g.height - r; head.dir = -head.dir; bounced = true; }
    if(bounced){ head.dir = wrapAngle(head.dir + rand(-0.5, 0.5)); }
  }

  update(dt){
    for(let c=0;c<(this.columns||1);c++){
      const head = this.heads[c];
      head.pos.add(Vec2.fromAngle(head.dir, this.speed * dt));
      this._bounceHead(c);
    }
    this._applySlotsFromTrail();
    for(const e of this.members) e.update(dt);
  }

  aliveCount(){ return this.members.filter(m=>m.isAlive()).length; }
  draw(ctx){ for(const e of this.members) e.draw(ctx); }
}

// -----------------------------------------------
class Missile {
  constructor(pos, vel, radius=5){ this.pos = pos; this.vel = vel; this.radius = radius; }
  update(dt){ this.pos.add(this.vel.clone().mul(dt)); }
  outOfBounds(w,h){
    const m=40; return this.pos.x<-m||this.pos.y<-m||this.pos.x>w+m||this.pos.y>h+m;
  }
  draw(ctx){
    ctx.save();
    ctx.fillStyle = COL.missile;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// -----------------------------------------------
class Item {
  constructor(kind, pos){
    this.kind = kind; this.pos = pos; this.radius = 10;
    this.vel = Vec2.fromAngle(rand(0,TAU), rand(20,50));
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
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0b0c10";
    ctx.font = "12px bold system-ui"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(this.kind==='heart'?'♥':'P', this.pos.x, this.pos.y);
    ctx.restore();
  }
}
