// ===============================
// Entities: players, enemies, missiles, items, groups
// - Fix: 2-column formation teleport -> remove double lateral offset after trail sampling
// - Add: enemy damage red flash via hitFlashUntil timer
// ===============================

class PlayerCircle {
  constructor(game, x, y, radius){
    this.game = game;
    this.pos = new Vec2(x,y);
    this.radius = radius;
    this.color = COL.player;
    this.invulUntil = 0;     // 무적 시간(초)
    this.shakeUntil = 0;     // 피격 흔들림 종료 시각
    this.shakeMag = 0;       // 흔들림 세기(px)
  }
  hit(){
    const t = now();
    if(t < this.invulUntil) return false;
    this.game.damagePlayer(1);
    this.invulUntil = t + 0.5; // 짧은 무적
    return true;
  }
  draw(ctx){
    ctx.save();
    // 피격 흔들림 오프셋
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

    // 색상(타입별)
    this.baseColor = (type===ENEMY_TYPE.NORMAL)?COL.enemyNormal:
                     (type===ENEMY_TYPE.SHOOTER)?COL.enemyShooter:COL.boss;

    // 발사 텔레그래프(슈터용)
    this.blinkUntil = 0;
    this.nextShotAt = now() + 3;
    this.shotBlinkTime = 1;

    // 보스 이동/정지 사이클
    this.bossMoveTimer = 3;
    this.bossStopTimer = 0;
    this.heading = rand(0, TAU);

    // 그룹에서 세팅되는 값
    this.speed = 0;
    this.column = 0;      // 2열일 때 0/1
    this.slotInCol = 0;   // 선두 뒤 몇 번째

    // 라인 데미지 틱 제어
    this.lastLineDamageTick = 0;

    // ▼ 데미지 시 붉은 플래시
    this.hitFlashUntil = 0;       // now()보다 크면 플래시 활성
    this.hitFlashColor = "#ff5252";
  }

  isAlive(){ return this.hp > 0; }

  damage(n){
    if(!this.isAlive()) return;
    this.hp -= n;

    // 맞을 때 짧게 붉게 반짝
    this.hitFlashUntil = now() + 0.15;

    if(this.hp <= 0){
      this.onDeath();
    }
  }

  onDeath(){
    const g = this.game;
    if(this.type === ENEMY_TYPE.NORMAL){
      if(Math.random()<0.01) g.dropItem('heart', this.pos.clone());
      if(Math.random()<0.005) g.dropItem('power', this.pos.clone());
    } else if(this.type === ENEMY_TYPE.SHOOTER){
      if(Math.random()<0.10) g.dropItem('heart', this.pos.clone());
      if(Math.random()<0.10) g.dropItem('power', this.pos.clone());
    } else if(this.type === ENEMY_TYPE.BOSS){
      // 프로토타입: 없음
    }
  }

  update(dt){
    if(!this.isAlive()) return;

    // 슈터: 점멸 → 발사
    if(this.type === ENEMY_TYPE.SHOOTER){
      const t = now();
      if(t >= this.nextShotAt - this.shotBlinkTime && t < this.nextShotAt){
        this.blinkUntil = this.nextShotAt;
      }
      if(t >= this.nextShotAt){
        for(let i=0;i<2;i++){
          const ang = rand(0, TAU);
          const v = Vec2.fromAngle(ang, this.game.missileSpeed);
          this.game.spawnMissile(this.pos.clone(), v);
        }
        this.nextShotAt = t + 3;
        this.blinkUntil = 0;
      }
    }
    // 보스: 3초 이동 → 1초 정지→ 6발
    else if(this.type === ENEMY_TYPE.BOSS){
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

  // 화면 벽에 부딪힐 때 반사
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

    // 발사 예고 점멸(슈터)
    const telegraphBlink = (t < this.blinkUntil) ? (0.5 + 0.5*Math.sin(t*20)) : 0;

    // ▼ 데미지 플래시 우선
    const flashing = (t < this.hitFlashUntil);
    if(flashing){
      ctx.shadowColor = this.hitFlashColor;
      ctx.shadowBlur = Math.max(6, this.radius*0.6);
      ctx.fillStyle = this.hitFlashColor;
    } else {
      ctx.fillStyle = this.baseColor;
    }

    // 본체
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
// ※ Fix: 2열에서 trail 샘플 후 '추가 측면 오프셋'을 다시 더하지 않음
// -----------------------------------------------
class EnemyGroup {
  constructor(game, formation, count, typeConfigFn){
    this.game = game;
    this.columns = formation;         // 1 또는 2
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

  // 스폰 위치/방향 초기화
  setPositions(origin, dir){
    const cols = this.columns || 1;
    const perp = Vec2.fromAngle(dir + Math.PI/2, this.sideOffset);

    if(cols===1){
      this.heads[0].pos = origin.clone();
      this.heads[0].dir = dir;
    } else {
      // 각 컬럼의 '선두 앵커'를 좌우로 분리 배치
      this.heads[0].pos = origin.clone().add(perp.clone().mul(-1)); // 좌
      this.heads[1].pos = origin.clone().add(perp.clone().mul(+1)); // 우
      this.heads[0].dir = this.heads[1].dir = dir;
    }

    // trail 초기화(짧은 선)
    for(let c=0;c<cols;c++){
      const tr = this.trails[c];
      tr.pts = [ this.heads[c].pos.clone(), this.heads[c].pos.clone().add(Vec2.fromAngle(dir, -1)) ];
      tr.lens = [0, 1];
      tr.total = 1;
    }

    // 첫 배치
    this._applySlotsFromTrail();
  }

  // trail에 선두 위치 추가 + 오래된 앞부분 정리
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

    // trail 길이 제한: (최대 슬롯+1)*spacing + 여유
    let maxSlot = 0;
    for(const e of this.members) if(e.column===c) maxSlot = Math.max(maxSlot, e.slotInCol);
    const need = (maxSlot + 1) * this.spacing + 200;

    // 오래된 포인트 제거 (앞쪽부터)
    while(pts.length > 2 && (tr.total - lens[1]) > need){
      pts.shift();
      const off = lens[1];
      lens.shift();
      for(let i=0;i<lens.length;i++) lens[i] -= off;
      tr.total -= off;
    }
  }

  // trail의 끝(=선두) 기준으로 distBehind 만큼 떨어진 점 샘플링
  _sampleTrail(c, distBehind){
    const tr = this.trails[c];
    const pts = tr.pts, lens = tr.lens;
    if(pts.length<2) return this.heads[c].pos.clone();

    const target = Math.max(0, tr.total - distBehind);

    // 선형 탐색(포인트 수가 많지 않음)
    let i=1;
    while(i<lens.length && lens[i] < target) i++;
    if(i>=lens.length) return pts[pts.length-1].clone();

    const a = pts[i-1], b = pts[i];
    const la = lens[i-1], lb = lens[i];
    const t = (lb===la) ? 0 : (target - la)/(lb - la);
    return new Vec2( lerp(a.x,b.x,t), lerp(a.y,b.y,t) );
  }

  // ▼ 핵심: trail 샘플 좌표를 그대로 사용(2열에서도 '추가 측면 오프셋'을 더하지 않음)
  _applySlotsFromTrail(){
    const cols = this.columns || 1;

    for(let c=0;c<cols;c++){
      const head = this.heads[c];

      // 최신 선두 위치를 trail에 기록
      this._pushTrail(c, head.pos);

      // 각 슬롯을 선두 뒤로 간격 유지해 배치
      for(const e of this.members){
        if(e.column!==c) continue;

        const dist = (e.slotInCol + 1) * this.spacing;

        // 선두 trail에서 '뒤 dist' 지점을 샘플링
        let p = this._sampleTrail(c, dist);

        // ★ 여기서 'lat(측면 오프셋)'을 추가로 더하면 2열이 튀는 문제가 생김 → 제거
        // (이미 setPositions에서 컬럼별 선두 자체가 좌우로 분리되어 독립 trail을 가짐)
        e.pos = p;
        e.heading = head.dir;
        e.speed = this.speed;
      }
    }
  }

  // 벽 반사 + 약간의 랜덤성
  _bounceHead(c){
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
    // 각 컬럼 선두 이동 + 반사
    for(let c=0;c<(this.columns||1);c++){
      const head = this.heads[c];
      head.pos.add(Vec2.fromAngle(head.dir, this.speed * dt));
      this._bounceHead(c);
    }

    // trail 기반으로 전체 멤버를 재배치(지렁이처럼 연속)
    this._applySlotsFromTrail();

    // 멤버별 업데이트(슈터/보스 내부 로직)
    for(const e of this.members){
      e.update(dt);
    }
  }

  aliveCount(){ return this.members.filter(m=>m.isAlive()).length; }

  draw(ctx){
    for(const e of this.members) e.draw(ctx);
  }
}

// -----------------------------------------------
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

// -----------------------------------------------
class Item {
  constructor(kind, pos){
    this.kind = kind; // 'heart'|'power'
    this.pos = pos;
    this.radius = 10;
    this.vel = Vec2.fromAngle(rand(0,TAU), rand(20,50)); // 물에 떠다니듯 천천히
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
