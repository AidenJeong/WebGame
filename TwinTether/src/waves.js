// WaveManager: controls spawn & gating
class WaveManager {
  constructor(game){
    this.game = game;
    this.reset();
  }
  reset(){
    this.stageTime = 0;
    this.phase = 'idle'; // 'idle','wait','wave','done'
    this.queue = [];
    this.currentWave = 0;
    this.waveTimer = 0;
    this.wave3Deadline = 0;
    this.telegraphs = []; // {pos,dir,until}

    // 웨이브별 스폰 추적
    this.waveGroups = {};   // n -> EnemyGroup[]
    this.waveSingles = {};  // n -> Enemy[]
    this.waitingForWaveClear = null;

    // 중앙 배너
    this.banner = null; // {text, until}

    // 다음 웨이브 안내
    this.nextWaveNumber = null;
  }
  start(){
    this.reset();

    // 대기/웨이브 시퀀스(웨이브 시작 전 카운트다운을 위해 wait에 nextWave를 기록)
    this.queue.push({type:'wait', t:5, nextWave:1});
    this.queue.push({type:'wave', n:1});

    this.queue.push({type:'wait', t:5, nextWave:2});
    this.queue.push({type:'wave', n:2});

    this.queue.push({type:'wait', t:5, nextWave:3});
    this.queue.push({type:'wave', n:3}); // 30초 제한(내부 처리)

    this.queue.push({type:'wait', t:10, nextWave:5, label:'보스 워닝'});
    this.queue.push({type:'wave', n:5});

    this.nextStep();
  }
  nextStep(){
    this.step = this.queue.shift() || {type:'done'};
    if(this.step.type==='wait'){
      this.phase='wait';
      this.waveTimer = this.step.t;
      this.nextWaveNumber = this.step.nextWave ?? null;
    }else if(this.step.type==='wave'){
      this.phase='wave';
      this.currentWave = this.step.n;
      this.spawnWave(this.currentWave);

      // 웨이브 종료 조건 설정
      if(this.currentWave === 3){
        this.wave3Deadline = this.stageTime + 30;
        this.waitingForWaveClear = null; // 3은 타이머 우선
      } else {
        this.waitingForWaveClear = this.currentWave;
      }
    }else if(this.step.type==='done'){
      this.phase='done';
    }
  }

  // 특정 웨이브가 "해당 웨이브에서 스폰된 적" 기준으로 모두 제거되었는지
  isWaveCleared(n){
    const groups = this.waveGroups[n] || [];
    const singles = this.waveSingles[n] || [];
    const gCleared = groups.every(g=>g.aliveCount()===0);
    const sCleared = singles.every(e=>!e.isAlive());
    return gCleared && sCleared;
  }

  // 현재 화면에 존재하는 모든 적이 제거되었는지(참고용)
  allEnemiesCleared(){
    return this.game.enemies.length===0 && this.game.groups.every(g=>g.aliveCount()===0);
  }

  update(dt){
    this.stageTime += dt;

    if(this.phase==='wait'){
      this.waveTimer -= dt;
      if(this.waveTimer<=0){
        this.nextStep();
      }
    } else if(this.phase==='wave'){
      // 3웨이브: 기한 안에 전멸 시 → 다음 단계, 기한 초과 시 → 웨이브4 스폰(중첩), 이후 4만 클리어하면 진행
      if(this.currentWave===3){
        if(this.isWaveCleared(3)){
          this._showBanner(`웨이브 3 클리어!!`);
          this.nextStep();
        } else if(this.stageTime >= this.wave3Deadline){
          if(!this._wave4Started){
            this._wave4Started = true;
            this.spawnWave(4);
            this.waitingForWaveClear = 4; // 4만 클리어하면 진행
          }
          if(this.waitingForWaveClear===4 && this.isWaveCleared(4)){
            this._showBanner(`웨이브 4 클리어!!`);
            this.nextStep();
          }
        }
      } else {
        // 나머지 웨이브는 해당 웨이브에서 스폰된 적 전멸 시 종료
        if(this.waitingForWaveClear && this.isWaveCleared(this.waitingForWaveClear)){
          this._showBanner(`웨이브 ${this.waitingForWaveClear} 클리어!!`);
          this.nextStep();
        }
      }
    } else if(this.phase==='done'){
      if(this.allEnemiesCleared()){
        this.game.onStageClear();
      }
    }

    // Cleanup telegraphs
    const t = now();
    this.telegraphs = this.telegraphs.filter(s=>s.until>t);

    // 배너 만료
    if(this.banner && now() > this.banner.until) this.banner = null;
  }

  _showBanner(text, sec=1.5){
    this.banner = { text, until: now()+sec };
  }

  draw(ctx){
    // 웨이브 시작 카운트다운 (중앙)
    if(this.phase==='wait' && this.nextWaveNumber){
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 48px system-ui";
      ctx.fillText(`Wave ${this.nextWaveNumber}`, this.game.width/2, this.game.height/2 - 40);
      ctx.font = "bold 64px system-ui";
      ctx.fillText(`${Math.max(0, Math.ceil(this.waveTimer))}`, this.game.width/2, this.game.height/2 + 20);
      ctx.restore();
    }

    // 텔레그래프
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
      const v = Vec2.fromAngle(s.dir, 30);
      ctx.beginPath();
      ctx.moveTo(s.pos.x, s.pos.y);
      ctx.lineTo(s.pos.x+v.x, s.pos.y+v.y);
      ctx.stroke();
    }
    ctx.restore();

    // 웨이브 클리어 배너(중앙)
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

  addTelegraph(pos, dir, seconds=2){
    this.telegraphs.push({ pos:pos.clone(), dir, until: now()+seconds });
  }

  _track(n, obj, isGroup){
    if(isGroup){
      (this.waveGroups[n] ||= []).push(obj);
    }else{
      (this.waveSingles[n] ||= []).push(obj);
    }
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

    setTimeout(()=>{
      if(n===1){
        const group = new EnemyGroup(g, 1, 10, (e,i,col,k)=>{ e.type=ENEMY_TYPE.NORMAL; e.maxHp=3; e.hp=3; e.radius=g.enemyRadius; });
        group.setPositions(origin, dir);
        g.groups.push(group);
        this._track(1, group, true);

      }else if(n===2){
        const group = new EnemyGroup(g, 2, 20, (e,i,col,k)=>{
          const lenPerCol = 10;
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
        this._track(2, group, true);

      }else if(n===3){
        const g1 = new EnemyGroup(g, 1, 10, (e,i,col,k)=>{ e.type=ENEMY_TYPE.SHOOTER; e.maxHp=5; e.hp=5; e.radius=g.enemyRadius; });
        g1.setPositions(origin, dir);
        g.groups.push(g1);
        this._track(3, g1, true);

        const edge2 = (edge+2)%4;
        let origin2, dir2;
        if(edge2===0){ origin2 = new Vec2(rand(W*0.2,W*0.8), -20); dir2 = Math.PI/2; }
        else if(edge2===2){ origin2 = new Vec2(rand(W*0.2,W*0.8), H+20); dir2 = -Math.PI/2; }
        else if(edge2===1){ origin2 = new Vec2(W+20, rand(H*0.2,H*0.8)); dir2 = Math.PI; }
        else { origin2 = new Vec2(-20, rand(H*0.2,H*0.8)); dir2 = 0; }

        this.addTelegraph(origin2, dir2, 2);
        const g2 = new EnemyGroup(g, 2, 20, (e,i,col,k)=>{ e.type=ENEMY_TYPE.NORMAL; e.maxHp=3; e.hp=3; e.radius=g.enemyRadius; });
        g2.setPositions(origin2, dir2);
        g.groups.push(g2);
        this._track(3, g2, true);

      }else if(n===4){
        for(let gi=0; gi<3; gi++){
          const e4edge = randInt(0,3);
          let o, d;
          if(e4edge===0){ o = new Vec2(rand(W*0.2,W*0.8), -20); d = Math.PI/2; }
          else if(e4edge===2){ o = new Vec2(rand(W*0.2,W*0.8), H+20); d = -Math.PI/2; }
          else if(e4edge===1){ o = new Vec2(W+20, rand(H*0.2,H*0.8)); d = Math.PI; }
          else { o = new Vec2(-20, rand(H*0.2,H*0.8)); d = 0; }
          this.addTelegraph(o, d, 2);
          const g4 = new EnemyGroup(g, 2, 20, (e,i,col,k)=>{ e.type=ENEMY_TYPE.NORMAL; e.maxHp=3; e.hp=3; e.radius=g.enemyRadius; });
          g4.setPositions(o, d);
          g.groups.push(g4);
          this._track(4, g4, true);
        }

      }else if(n===5){
        const boss = new Enemy(g, origin.x, origin.y, g.playerRadius*2, ENEMY_TYPE.BOSS, 20);
        boss.heading = dir;
        boss.speed = g.enemySpeed * 0.9;
        g.enemies.push(boss);
        this._track(5, boss, false);
      }
    }, 2000);
  }
}
