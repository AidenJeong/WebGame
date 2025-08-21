// WaveManager: controls spawn schedule for the prototype stage
class WaveManager {
  constructor(game){
    this.game = game;
    this.reset();
  }
  reset(){
    this.stageTime = 0;
    this.phase = 'idle'; // 'idle','wait','wave','boss','done'
    this.queue = [];
    this.currentWave = 0;
    this.waveTimer = 0;
    this.wave3Deadline = 0;
    this.telegraphs = []; // {pos,dir,until}
  }
  start(){
    this.reset();
    // Build stage script
    // wait5 - wave1 - wait5 - wave2 - wait5 - wave3(30s limit) - if not clear -> wave4 overlaps - wait10 (boss warning) - wave5
    this.queue.push({type:'wait', t:5, label:'대기'});
    this.queue.push({type:'wave1'});
    this.queue.push({type:'wait', t:5, label:'대기'});
    this.queue.push({type:'wave2'});
    this.queue.push({type:'wait', t:5, label:'대기'});
    this.queue.push({type:'wave3'});
    // wave4 is conditional: starts at deadline if wave3 not cleared
    this.queue.push({type:'wait', t:10, label:'보스 워닝'});
    this.queue.push({type:'wave5'});
    this.nextStep();
  }
  nextStep(){
    this.step = this.queue.shift() || {type:'done'};
    this.game.debugLabel = this.step.label || '';
    if(this.step.type==='wait'){
      this.phase='wait';
      this.waveTimer = this.step.t;
      setWaveInfo(this.step.label || `대기 ${this.waveTimer.toFixed(0)}s`);
    }else if(this.step.type.startsWith('wave')){
      this.phase='wave';
      const n = Number(this.step.type.replace('wave',''));
      this.currentWave = n;
      setWaveInfo(`Wave ${n}`);
      this.spawnWave(n);
    }else if(this.step.type==='done'){
      this.phase='done';
    }
  }
  allEnemiesCleared(){
    return this.game.enemies.length===0 && this.game.groups.every(g=>g.aliveCount()===0);
  }
  update(dt){
    this.stageTime += dt;

    if(this.phase==='wait'){
      this.waveTimer -= dt;
      setWaveInfo(`대기 ${Math.ceil(this.waveTimer)}s`);
      if(this.waveTimer<=0) this.nextStep();
    } else if(this.phase==='wave'){
      // Special handling for wave3 deadline (30s)
      if(this.currentWave===3){
        if(this.wave3Deadline===0){
          this.wave3Deadline = this.stageTime + 30;
        } else if(this.stageTime >= this.wave3Deadline){
          // start wave4 immediately (overlap)
          if(!this._wave4Forced){
            this._wave4Forced = true;
            this.spawnWave(4);
          }
        }
      }
      if(this.currentWave!==3){
        // check if cleared to progress to next queue item
        if(this.allEnemiesCleared()){
          this.nextStep();
        }
      }else{
        // If 3 cleared before deadline -> proceed to next step (the wait 10s -> boss warning)
        if(this.allEnemiesCleared()){
          this.nextStep();
        }
      }
    } else if(this.phase==='done'){
      if(this.allEnemiesCleared()){
        // stage clear
        this.game.onStageClear();
      }
    }

    // Cleanup telegraphs
    const t = now();
    this.telegraphs = this.telegraphs.filter(s=>s.until>t);
  }
  draw(ctx){
    // Draw telegraphs (spawn hints)
    ctx.save();
    ctx.globalAlpha = 0.8;
    for(const s of this.telegraphs){
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6,6]);
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, 18, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      // direction arrow
      const v = Vec2.fromAngle(s.dir, 30);
      ctx.beginPath();
      ctx.moveTo(s.pos.x, s.pos.y);
      ctx.lineTo(s.pos.x+v.x, s.pos.y+v.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  addTelegraph(pos, dir, seconds=2){
    this.telegraphs.push({ pos:pos.clone(), dir, until: now()+seconds });
  }

  spawnWave(n){
    const g = this.game;
    const W=g.width, H=g.height;
    const edge = randInt(0,3); // 0 top,1 right,2 bottom,3 left
    let origin, dir;
    if(edge===0){ origin = new Vec2(rand(W*0.2,W*0.8), -20); dir = Math.PI/2; }
    else if(edge===2){ origin = new Vec2(rand(W*0.2,W*0.8), H+20); dir = -Math.PI/2; }
    else if(edge===1){ origin = new Vec2(W+20, rand(H*0.2,H*0.8)); dir = Math.PI; }
    else { origin = new Vec2(-20, rand(H*0.2,H*0.8)); dir = 0; }
    this.addTelegraph(origin, dir, 2);
    // Schedule spawn after 2s
    setTimeout(()=>{
      if(n===1){
        // 1열 종대 10, 모두 일반몹
        const group = new EnemyGroup(g, 1, 10, (e,i,col,k)=>{
          e.type = ENEMY_TYPE.NORMAL; e.maxHp=3; e.hp=3; e.radius=g.enemyRadius;
        });
        group.setPositions(origin, dir);
        g.groups.push(group);
      }else if(n===2){
        // 2열 종대 20, 각 열의 앞/뒤는 공격형
        const group = new EnemyGroup(g, 2, 20, (e,i,col,k)=>{
          const lenPerCol = 10; // 20 total
          const isHead = (k===0);
          const isTail = (k===lenPerCol-1);
          if(isHead || isTail){
            e.type=ENEMY_TYPE.SHOOTER; e.maxHp=5; e.hp=5; e.radius=g.enemyRadius;
          }else{
            e.type=ENEMY_TYPE.NORMAL; e.maxHp=3; e.hp=3; e.radius=g.enemyRadius;
          }
        });
        group.setPositions(origin, dir);
        g.groups.push(group);
      }else if(n===3){
        // 1열×10(전부 공격형) + 2열×20(전부 일반) 동시
        const g1 = new EnemyGroup(g, 1, 10, (e,i,col,k)=>{
          e.type=ENEMY_TYPE.SHOOTER; e.maxHp=5; e.hp=5; e.radius=g.enemyRadius;
        });
        g1.setPositions(origin, dir);
        g.groups.push(g1);

        const edge2 = (edge+2)%4; // opposite or randomize
        let origin2, dir2;
        if(edge2===0){ origin2 = new Vec2(rand(W*0.2,W*0.8), -20); dir2 = Math.PI/2; }
        else if(edge2===2){ origin2 = new Vec2(rand(W*0.2,W*0.8), H+20); dir2 = -Math.PI/2; }
        else if(edge2===1){ origin2 = new Vec2(W+20, rand(H*0.2,H*0.8)); dir2 = Math.PI; }
        else { origin2 = new Vec2(-20, rand(H*0.2,H*0.8)); dir2 = 0; }

        this.addTelegraph(origin2, dir2, 2);
        const g2 = new EnemyGroup(g, 2, 20, (e,i,col,k)=>{
          e.type=ENEMY_TYPE.NORMAL; e.maxHp=3; e.hp=3; e.radius=g.enemyRadius;
        });
        g2.setPositions(origin2, dir2);
        g.groups.push(g2);
      }else if(n===4){
        // 2열 종대 3 그룹 동시에 (모두 일반)
        for(let gi=0; gi<3; gi++){
          const e4edge = randInt(0,3);
          let o, d;
          if(e4edge===0){ o = new Vec2(rand(W*0.2,W*0.8), -20); d = Math.PI/2; }
          else if(e4edge===2){ o = new Vec2(rand(W*0.2,W*0.8), H+20); d = -Math.PI/2; }
          else if(e4edge===1){ o = new Vec2(W+20, rand(H*0.2,H*0.8)); d = Math.PI; }
          else { o = new Vec2(-20, rand(H*0.2,H*0.8)); d = 0; }
          this.addTelegraph(o, d, 2);
          const g4 = new EnemyGroup(g, 2, 20, (e,i,col,k)=>{
            e.type=ENEMY_TYPE.NORMAL; e.maxHp=3; e.hp=3; e.radius=g.enemyRadius;
          });
          g4.setPositions(o, d);
          g.groups.push(g4);
        }
      }else if(n===5){
        // 보스 1
        const boss = new Enemy(g, origin.x, origin.y, g.playerRadius*2, ENEMY_TYPE.BOSS, 20);
        boss.heading = dir;
        boss.speed = g.enemySpeed * 0.9;
        g.enemies.push(boss);
      }
    }, 2000);
  }
}
