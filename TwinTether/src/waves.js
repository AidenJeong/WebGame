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

    // 중앙 배너
    this.banner = null; // {text, until}

    // 다음 웨이브 안내(카운트다운 표시용)
    this.nextWaveNumber = null;

    // 현재 웨이브 스폰 여부(텔레그래프 2초 후에 true)
    this.activeWave = { num: 0, spawned: false };

    // 3웨이브 30초 초과 시 동시 시작된 4웨이브 체크
    this._wave4Started = false;
  }

  start(){
    this.reset();

    // 기본 시퀀스(3 이후: 상황에 따라 4웨이브는 동적 삽입/또는 30초 초과로 즉시 중첩 스폰)
    this.queue.push({type:'wait', t:5, nextWave:1});
    this.queue.push({type:'wave', n:1});

    this.queue.push({type:'wait', t:5, nextWave:2});
    this.queue.push({type:'wave', n:2});

    this.queue.push({type:'wait', t:5, nextWave:3});
    this.queue.push({type:'wave', n:3});

    // 이후: 보스 워닝 10초 → 웨이브5
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
      // 스폰 전에는 게이트 체크 금지
      this.activeWave = { num: this.currentWave, spawned: false };
      this.spawnWave(this.currentWave);
    }else if(this.step.type==='done'){
      this.phase='done';
    }
  }

  // 화면의 모든 적이 제거되었는지
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
      // --- 웨이브3(예외): 30초 제한 ---
      if(this.currentWave===3){
        if(this.activeWave.spawned){
          // 3이 30초 내 전멸 → "대기5 & 웨이브4"를 큐 맨 앞에 삽입 후 진행
          if(this.allEnemiesCleared() && (this.stageTime < this.wave3Deadline || this.wave3Deadline===0)){
            this._showBanner(`웨이브 3 클리어!!`);
            // 3 클리어 → 5초 대기 후 4 시작
            this.queue.unshift({type:'wave', n:4});
            this.queue.unshift({type:'wait', t:5, nextWave:4});
            this._wave4Started = false;
            this.nextStep();
            return;
          }
          // 30초 초과 → 즉시 4 웨이브 중첩 스폰(한 번만)
          if(this.stageTime >= this.wave3Deadline && !this._wave4Started){
            this._wave4Started = true;
            this._spawnWaveDirect(4); // 즉시 스폰(카운트다운/텔레그래프 없이)
          }
          // 4 웨이브가 이미 시작된 상태라면: "화면 전멸" 시 다음 단계(=보스 워닝 10초)로
          if(this._wave4Started && this.allEnemiesCleared()){
            this._showBanner(`웨이브 4 클리어!!`);
            this.nextStep(); // → wait 10 (boss warning)
            return;
          }
        }
      } else {
        // --- 일반 웨이브(1,2,4,5): 스폰된 이후 "화면 전멸"이 되어야 다음 단계로 ---
        if(this.activeWave.spawned && this.allEnemiesCleared()){
          this._showBanner(`웨이브 ${this.currentWave} 클리어!!`);
          this.nextStep();
          return;
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

  // 텔레그래프 2초 후 스폰
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
      // 실제 스폰
      this._spawnWaveAt(n, origin, dir);

      // 웨이브3의 30초 제한은 "스폰 시점"부터 카운트
      if(n===3){
        this.wave3Deadline = this.stageTime + 30;
      }

      // 스폰 완료 플래그
      if(this.activeWave.num === n){
        this.activeWave.spawned = true;
      }
    }, 2000);
  }

  // 즉시 스폰(중첩용, 텔레그래프/카운트다운 없음)
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

      const edge2 = (randInt(0,1)===0)? ( (edge+2)%4 ) : edge; // 반대편 또는 동일 방향
      let origin2, dir2;
      if(edge2===0){ origin2 = new Vec2(rand(W*0.2,W*0.8), -20); dir2 = Math.PI/2; }
      else if(edge2===2){ origin2 = new Vec2(rand(W*0.2,W*0.8), H+20); dir2 = -Math.PI/2; }
      else if(edge2===1){ origin2 = new Vec2(W+20, rand(H*0.2,H*0.8)); dir2 = Math.PI; }
      else { origin2 = new Vec2(-20, rand(H*0.2,H*0.8)); dir2 = 0; }

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
  }
}
