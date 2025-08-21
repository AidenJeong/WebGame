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
      // optional: guaranteed drops? keep none in prototype
    }
  }
  update(dt){
    if(!this.isAlive()) return;
    const g = this.game;
    // Movement and shooting depend on type
    if(this.type === ENEMY_TYPE.NORMAL || this.type === ENEMY_TYPE.SHOOTER){
      // position is advanced by group velocity externally; here we handle shooting for SHOOTER
      if(this.type === ENEMY_TYPE.SHOOTER){
        const t = now();
        if(t >= this.nextShotAt - this.shotBlinkTime && t < this.nextShotAt){
          this.blinkUntil = this.nextShotAt;
        }
        if(t >= this.nextShotAt){
          // Fire 2 missiles in random directions
          for(let i=0;i<2;i++){
            const ang = rand(0, TAU);
            const spd = g.missileSpeed;
            const v = Vec2.fromAngle(ang, spd);
            g.spawnMissile(this.pos.clone(), v);
          }
          this.nextShotAt = t + 3;
          this.blinkUntil = 0;
        }
      }
    } else if(this.type === ENEMY_TYPE.BOSS){
      // Boss behavior: 3s move + 1s stop; at stop, fire 6 missiles radial
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
          // fire 6
          for(let i=0;i<6;i++){
            const ang = i * (TAU/6);
            const v = Vec2.fromAngle(ang, this.game.missileSpeed);
            this.game.spawnMissile(this.pos.clone(), v);
          }
          // pick new heading
          this.heading = rand(0, TAU);
          this.bossMoveTimer = 3;
        }
      }
      // bounce off walls for boss
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
    // body
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

// Manages a formation group (1열 or 2열), keeps columns separated
class EnemyGroup {
  constructor(game, formation, count, typeConfigFn){
    // formation: 1 or 2 (columns)
    this.game = game;
    this.columns = formation;
    this.members = []; // array of Enemy
    this.headingPerColumn = []; // radians for each column
    this.speed = game.enemySpeed;
    // build members in columns
    const spacing = game.playerDiameter * 1.2;
    const radius = game.enemyRadius;
    // spawn off-screen? We'll adjust positions later by WaveManager
    for(let i=0;i<count;i++){
      const col = (this.columns===2) ? (i%2) : 0;
      const idxInCol = (this.columns===2) ? Math.floor(i/2) : i;
      const e = new Enemy(game, -999,-999, radius, ENEMY_TYPE.NORMAL, 3);
      e.column = col;
      typeConfigFn(e, i, col, idxInCol);
      this.members.push(e);
    }
    // init headings random; WaveManager will override on spawn
    this.headingPerColumn = new Array(this.columns || 1).fill(0).map(()=>rand(0,TAU));
  }
  setPositions(origin, dir){
    // place in a line (columns forward along dir, spacing by enemy size)
    // For 1열: advance along dir
    // For 2열: two parallel lines side-by-side (perp offset)
    const perp = Vec2.fromAngle(dir + Math.PI/2, this.game.enemyRadius*2.2);
    let idxColCount = [0,0];
    this.headingPerColumn = new Array(this.columns || 1).fill(dir);
    for(const e of this.members){
      const iCol = e.column;
      const k = idxColCount[iCol]++;
      const forward = Vec2.fromAngle(dir, this.game.enemyRadius*2.3 + k * this.game.enemyRadius*2.3);
      const base = origin.clone().add(forward);
      if(this.columns===2){
        const offset = (iCol===0)? perp.clone().mul(-1) : perp.clone();
        base.add(offset);
      }
      e.pos = base;
      e.heading = dir;
      e.speed = this.speed;
    }
  }
  update(dt){
    // Move by column headings, bounce logic when any in a column hits wall
    const g = this.game;
    // Move
    for(const e of this.members){
      if(!e.isAlive()) continue;
      const h = this.headingPerColumn[e.column] ?? 0;
      const step = Vec2.fromAngle(h, this.speed * dt);
      e.pos.add(step);
    }
    // Check wall collisions per column
    const cols = this.columns || 1;
    for(let c=0;c<cols;c++){
      let hitWall = false;
      for(const e of this.members){
        if(!e.isAlive() || e.column!==c) continue;
        const r=e.radius;
        if(e.pos.x < r || e.pos.x > g.width-r || e.pos.y < r || e.pos.y > g.height-r){
          hitWall = true; break;
        }
      }
      if(hitWall){
        // Pick a new random heading roughly away from nearest wall
        let base = rand(0, TAU);
        // bias away from edges
        const cx = g.width/2, cy=g.height/2;
        const dirFromCenter = Math.atan2((cy - (cy)), (cx - (cx))); // not needed; keep random
        this.headingPerColumn[c] = base;
      }
    }
    // Update enemies (shooters, boss not used here)
    for(const e of this.members) e.update(dt);
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
      // gentle direction change
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
    // small symbol
    ctx.fillStyle = "#0b0c10";
    ctx.font = "12px bold system-ui";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(this.kind==='heart'?'♥':'P', this.pos.x, this.pos.y);
    ctx.restore();
  }
}
