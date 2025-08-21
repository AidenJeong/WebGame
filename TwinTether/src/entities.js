// Entities: players, enemies, missiles, items, groups

class PlayerCircle {
  constructor(game, x, y, radius){
    this.game = game;
    this.pos = new Vec2(x,y);
    this.radius = radius;
    this.color = COL.player;
    this.invulUntil = 0; // seconds
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
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, TAU);
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
      // optional: nothing for prototype
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
      // Boss behavior: 3s move + 1s stop; fire 6 missiles at stop
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
    const col = this.baseColor;
    ctx.fillStyle = col;
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

// 선두 추종(일렬/2열) 포메이션
class EnemyGroup {
  constructor(game, formation, count, typeConfigFn){
    this.game = game;
    this.columns = formation;         // 1 또는 2
    this.members = [];                // Enemy[]
    this.speed = game.enemySpeed;

    // 간격/오프셋
    this.spacing = game.enemyRadius * 2.3;     // 앞뒤 간격
    this.sideOffset = game.enemyRadius * 2.2;  // 2열 좌우 간격

    // 컬럼별 선두 앵커
    this.heads = new Array(this.columns || 1).fill(0).map(()=>({
      pos: new Vec2(-999,-999),
      dir: 0
    }));

    // 멤버 생성 (+ 컬럼/슬롯 지정)
    for(let i=0;i<count;i++){
      const col = (this.columns===2) ? (i%2) : 0;               // 0 또는 1
      const slot = (this.columns===2) ? Math.floor(i/2) : i;    // 컬럼 내 순번(0이 선두 바로 뒤)
      const e = new Enemy(game, -999,-999, game.enemyRadius, ENEMY_TYPE.NORMAL, 3);
      e.column = col;
      e.slotInCol = slot;  // 죽어도 슬롯은 유지(빈칸)
      typeConfigFn(e, i, col, slot);
      this.members.push(e);
    }
  }

  setPositions(origin, dir){
    const perp = Vec2.fromAngle(dir + Math.PI/2, this.sideOffset);
    if(this.columns===1){
      this.heads[0].pos = origin.clone();
      this.heads[0].dir = dir;
    } else {
      this.heads[0].pos = origin.clone().add(perp.clone().mul(-1)); // 왼쪽
      this.heads[1].pos = origin.clone().add(perp.clone().mul(+1)); // 오른쪽
      this.heads[0].dir = this.heads[1].dir = dir;
    }
    this._applySlotsToPositions();
  }

  _applySlotsToPositions(){
    for(const e of this.members){
      if(!e) continue;
      const head = this.heads[e.column];
      const fwd = Vec2.fromAngle(head.dir, 1);
      const back = fwd.clone().mul(-this.spacing * (e.slotInCol + 1));
      const lateral = (this.columns===2)
        ? fwd.clone().perp().mul(e.column===0 ? -this.sideOffset : +this.sideOffset)
        : new Vec2(0,0);
      e.pos = head.pos.clone().add(back).add(lateral);
      e.heading = head.dir;
      e.speed = this.speed;
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

    if(bounced){
      head.dir = wrapAngle(head.dir + rand(-0.5, 0.5)); // 약간 랜덤
    }
  }

  update(dt){
    // 선두 이동 + 벽 반사
    for(let c=0;c<(this.columns||1);c++){
      const head = this.heads[c];
      const step = Vec2.fromAngle(head.dir, this.speed * dt);
      head.pos.add(step);
      this._bounceHead(c);
    }
    // 슬롯 재적용(빈칸 유지)
    this._applySlotsToPositions();

    // 멤버 개별 업데이트(슈터/보스 내부 로직)
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
