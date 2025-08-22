// WaveManager: controls spawn & gating (no modern operators)
class WaveManager {
  constructor(game){
    this.game = game;
    this.reset();
  }
  reset(){
    this.stageTime = 0;
    this.phase = 'idle';
    this.queue = [];
    this.currentWave = 0;
    this.waveTimer = 0;
    this.wave3Deadline = 0;
    this.telegraphs = [];

    this.banner = null; // {text, until}
    this.nextWaveNumber = null;

    this.activeWave = { num: 0, spawned: false };
    this._wave4Started = false;
  }

  start(){
    this.reset();
    this.queue.push({type:'wait', t:5, nextWave:1});
    this.queue.push({type:'wave', n:1});
    this.queue.push({type:'wait', t:5, nextWave:2});
    this.queue.push({type:'wave', n:2});
    this.queue.push({type:'wait', t:5, nextWave:3});
    this.queue.push({type:'wave', n:3});
    this.queue.push({type:'wait', t:10, nextWave:5, label:'보스 워닝'});
    this.queue.push({type:'wave', n:5});
    this.nextStep();
  }

  nextStep(){
    this.step = this.queue.shift() || {type:'done'};
    if(this.step.type==='wait'){
      this.phase='wait';
      this.waveTimer = this.step.t;
      this.nextWaveNumber = (typeof this.step.nextWave==='number') ? this.step.nextWave : null;
    }else if(this.step.type==='wave'){
      this.phase='wave';
      this.currentWave = this.step.n;
      this.activeWave = { num: this.currentWave, spawned: false };
      this.spawnWave(this.currentWave);
    }else if(this.step.type==='done'){
      this.phase='done';
    }
  }

  allEnemiesCleared(){
    if(this.game.enemies.length>0) return false;
    for(let i=0;i<this.game.groups.length;i++){
      if(this.game.groups[i].aliveCount()!==0) return false;
    }
    return true;
  }

  update(dt){
    this.stageTime += dt;

    if(this.phase==='wait'){
      this.waveTimer -= dt;
      if(this.waveTimer<=0){
        this.nextStep();
      }
    } else if(this.phase==='wave'){
      if(this.currentWave===3){
        if(this.activeWave.spawned){
          if(this.allEnemiesCleared() && (this.stageTime < this.wave3Deadline || this.wave3Deadline===0)){
            this._showBanner('웨이브 3 클리어!!');
            this.queue.unshift({type:'wave', n:4});
            this.queue.unshift({type:'wait', t:5, nextWave:4});
            this._wave4Started = false;
            this.nextStep();
            return;
          }
          if(this.stageTime >= this.wave3Deadline && !this._wave4Started){
            this._wave4Started = true;
            this._spawnWaveDirect(4);
          }
          if(this._wave4Started && this.allEnemiesCleared()){
            this._showBanner('웨이브 4 클리어!!');
            this.nextStep();
            return;
          }
        }
      } else {
        if(this.activeWave.spawned && this.allEnemiesCleared()){
          this._showBanner('웨이브 ' + this.currentWave + ' 클리어!!');
          this.nextStep();
          return;
        }
      }
    } else if(this.phase==='done'){
      if(this.allEnemiesCleared()){
        this.game.onStageClear();
      }
    }

    // telegraphs cleanup
    const t = now();
    const kept = [];
    for(let i=0;i<this.telegraphs.length;i++){
      if(this.telegraphs[i].until>t) kept.push(this.telegraphs[i]);
    }
    this.telegraphs = kept;

    if(this.banner && now() > this.banner.until) this.banner = null;
  }

  _showBanner(text, sec){
    if(typeof sec!=='number') sec=1.5;
    this.banner = { text:text, until: now()+sec };
  }

  draw(ctx){
    if(this.phase==='wait' && this.nextWaveNumber){
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 48px system-ui";
      ctx.fillText("Wave " + this.nextWaveNumber, this.game.width/2, this.game.height/2 - 40);
      ctx.font = "bold 64px system-ui";
      ctx.fillText(String(Math.max(0, Math.ceil(this.waveTimer))), this.game.width/2, this.game.height/2 + 20);
      ctx.restore();
    }

    // telegraphs
    ctx.save();
    ctx.globalAlpha = 0.8;
    for(let i=0;i<this.telegraphs.length;i++){
      const s = this.telegraphs[i];
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6,6]);
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, 18, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      const v = Vec2.fromAngle(s.dir, 30);
      ctx.beginPath();
      ctx.moveTo(s.pos.x, s.pos.y);
      ctx.lineTo(s.pos.x+v.x, s.pos.y+v.y);
      ctx.stroke();
    }
    ctx.restore();

    if(this.banner){
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.98)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 44px system-ui";
      ctx.fillText(this.banner.text, this.game.width/2, this.game.height/2 - 10);
      ctx.restore();
    }
  }

  addTelegraph(pos, dir, seconds){
    if(typeof seconds!=='number') seconds=2;
    this.telegraphs.push({ pos:pos.clone(), dir:dir, until: now()+seconds });
  }

  // telegraph after 2s spawn
  spawnWave(n){
    const g = this.game;
    const W=g.width, H=g.height;
    const edge = randInt(0,3);
    let origin, dir;
    if(edge===0){ origin = new Vec2(rand(W*0.2,W*0.8), -20); dir = Math.PI/2; }
    else if(edge===2){ origin = new Vec2(rand(W*0.2,W*0.8), H+20); dir = -Math.PI/2; }
    else if(edge===1){ origin = new Vec2(W+20, rand(H*0.2,H*0.8)); dir = Math.PI; }
    else { origin = new Vec2(-20, rand(H*0.2,H*0.8)); dir = 0; }
    this.addTelegraph(origin, dir, 2);

    const self = this;
    setTimeout(function(){
      self._spawnWaveAt(n, origin, dir);
      if(n===3){
        self.wave3Deadline = self.stageTime + 30;
      }
      if(self.activeWave.num === n){
        self.activeWave.spawned = true;
      }
    }, 2000);
  }

  _spawnWaveDirect(n){
    const g = this.game;
    const W=g.width, H=g.height;
    const edge = randInt(0,3);
    let origin, dir;
    if(edge===0){ origin = new Vec2(rand(W*0.2,W*0.8), -20); dir = Math.PI/2; }
    else if(edge===2){ origin = new Vec2(rand(W*0.2,W*0.8), H+20); dir = -Math.PI/2; }
    else if(edge===1){ origin = new Vec2(W+20, rand(H*0.2,H*0.8)); dir = Math.PI; }
    else { origin = new Vec2(-20, rand(H*0.2,H*0.8)); dir = 0; }
    this._spawnWaveAt(n, origin, dir);
  }

  _spawnWaveAt(n, origin, dir){
    const g = this.game;
    const W=g.width, H=g.height;
  
    if(n===1){
      const group = new EnemyGroup(g, 1, 10, function(e){ e.type=ENEMY_TYPE.NORMAL; e.maxHp=3; e.hp=3; e.radius=g.enemyRadius; });
      group.setPositions(origin, dir);
      g.groups.push(group);
  
    }else if(n===2){
      const group = new EnemyGroup(g, 2, 20, function(e, i, col, k){
        const lenPerCol = 10;
        const isHead = (k===0);
        const isTail = (k===lenPerCol-1);
        if(isHead || isTail){ e.type=ENEMY_TYPE.SHOOTER; e.maxHp=5; e.hp=5; e.radius=g.enemyRadius; }
        else { e.type=ENEMY_TYPE.NORMAL; e.maxHp=3; e.hp=3; e.radius=g.enemyRadius; }
      });
      group.setPositions(origin, dir);
      g.groups.push(group);
  
    }else if(n===3){
      // 1열×10(모두 슈터)
      const g1 = new EnemyGroup(g, 1, 10, function(e){ e.type=ENEMY_TYPE.SHOOTER; e.maxHp=5; e.hp=5; e.radius=g.enemyRadius; });
      g1.setPositions(origin, dir);
      g.groups.push(g1);
  
      // 2열×20(모두 일반) — 'edge' 참조 제거, 독립 무작위 등장
      const e2 = randInt(0,3);
      let origin2, dir2;
      if(e2===0){ origin2 = new Vec2(rand(W*0.2,W*0.8), -20); dir2 = Math.PI/2; }
      else if(e2===2){ origin2 = new Vec2(rand(W*0.2,W*0.8), H+20); dir2 = -Math.PI/2; }
      else if(e2===1){ origin2 = new Vec2(W+20, rand(H*0.2,H*0.8)); dir2 = Math.PI; }
      else { origin2 = new Vec2(-20, rand(H*0.2,H*0.8)); dir2 = 0; }
  
      const g2 = new EnemyGroup(g, 2, 20, function(e){ e.type=ENEMY_TYPE.NORMAL; e.maxHp=3; e.hp=3; e.radius=g.enemyRadius; });
      g2.setPositions(origin2, dir2);
      g.groups.push(g2);
  
    }else if(n===4){
      // 2열 종대 3그룹 동시 등장(모두 일반)
      for(let gi=0; gi<3; gi++){
        const e4 = randInt(0,3);
        let o, d;
        if(e4===0){ o = new Vec2(rand(W*0.2,W*0.8), -20); d = Math.PI/2; }
        else if(e4===2){ o = new Vec2(rand(W*0.2,W*0.8), H+20); d = -Math.PI/2; }
        else if(e4===1){ o = new Vec2(W+20, rand(H*0.2,H*0.8)); d = Math.PI; }
        else { o = new Vec2(-20, rand(H*0.2,H*0.8)); d = 0; }
        const g4 = new EnemyGroup(g, 2, 20, function(e){ e.type=ENEMY_TYPE.NORMAL; e.maxHp=3; e.hp=3; e.radius=g.enemyRadius; });
        g4.setPositions(o, d);
        g.groups.push(g4);
      }
  
    }else if(n===5){
      const boss = new Enemy(g, origin.x, origin.y, g.playerRadius*2, ENEMY_TYPE.BOSS, 20);
      boss.heading = dir;
      boss.speed = g.enemySpeed * 0.9;
      g.enemies.push(boss);
    }
  }
}
