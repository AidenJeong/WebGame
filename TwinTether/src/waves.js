// WaveManager: controls spawn & gating (no modern operators)
class WaveManager {
  constructor(game){
    this.game = game;
    this.reset();
  }
  reset(){
    this.stageTime = 0;
    this.phase = 'idle'; // idle, wait, wave, done, clear
    this.queue = [];
    this.currentWave = 0;
    this.waveTimer = 0;
    this.clearTime = 0;
    this.wave3Deadline = 0;
    this.telegraphs = [];

    this.banner = null; // {text, until}
    this.nextWaveNumber = null;

    this.activeWave = { num: 0, spawned: false };
    this._wave4Started = false;
  }

  setStageData(normalizedPack, stageNo){
    this.dataPack = normalizedPack;
    const s = normalizedPack.stages.get(stageNo);
    if(!s) throw new Error('Stage not found: '+stageNo);

    // 배경 적용
    this.game.bgKey = s.bg || this.game.bgKey; // bgKey에 url을 바로 쓸 수 있도록 draw에서 images[url] 사용
    // waves 목록 캐시
    this.stagePlan = {
      stageNo: s.stageNo,
      waveIds: s.waveIds.slice(),      // ["w1","w2",...]
      waveCount: s.waveCount || s.waveIds.length
    };
    __log('[WaveManager.setStageData]', 'stageNo=', s.stageNo, 'waveCount=', s.waveCount);
  }

  start(){
    this.reset();

    // setStageData로 stagePlan이 세팅되어 있으면 그 길이를 사용
    const total = (this.stagePlan && this.stagePlan.waveIds) ? this.stagePlan.waveIds.length : 5;

    // 시작 카운트다운 5초 + 1웨이브
    // this.queue.push({type:'wait', t:5, nextWave:1});
    // this.queue.push({type:'wave', n:1});

    // 나머지 웨이브들
    for (let n=1; n<=total; n++){
      this.queue.push({type:'wait', t:5, nextWave:n}); 
      this.queue.push({type:'wave', n:n});
      this.queue.push({type:'clear'});
    }

    // (보스 워닝 10초가 꼭 필요하면 stagePlan에 별도 규칙을 넣어 운용 권장)
    this.nextStep();
  }

  _startWaveByData(index){
    const plan = this.stagePlan;
    const waveId = plan.waveIds[index];
    const wdata = this.dataPack.waves.get(waveId);
    if(!wdata) throw new Error('Wave data not found: '+waveId);

    // 안내 UI는 기존 로직 그대로 호출
    // this._showBanner(plan.stageNo + ' - ' + this.currentWave);

    // 한 웨이브 내 spawn 예약: delay(초) 기준으로 내부 타이머 세팅
    this._pendingSpawns = []; // [{at:sec, groupId}]
    let t=0;
    wdata.spawns.forEach(sp=>{
      const at = Math.max(0, Number(sp.delay)||0);
      this._pendingSpawns.push({ at, groupId: sp.groupId, moveSpeed: sp.moveSpeed });
      if(at>t) t=at;
    });
    this._waveClock = 0;
  }

  nextStage(){
    const s = this.dataPack.stages.get(this.stagePlan.stageNo + 1);
    if(!s) {
      return;
    }

    // 배경 적용
    this.game.bgKey = s.bg || this.game.bgKey; // bgKey에 url을 바로 쓸 수 있도록 draw에서 images[url] 사용
    // waves 목록 캐시
    this.stagePlan = {
      stageNo: s.stageNo,
      waveIds: s.waveIds.slice(),      // ["w1","w2",...]
      waveCount: s.waveCount || s.waveIds.length
    };
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
    }else if(this.step.type==='clear'){
      this.phase='clear';
      this.clearTime=5;
    }
  }

  allEnemiesCleared(){
    if(this.game.enemies.length>0) return false;

    // 아직 스폰 안된 그룹이 있는 경우
    if (this._pendingSpawns && this._pendingSpawns.length > 0) return false;

    for(const g of this.game.groups) { // let i=0;i<this.game.groups.length;i++){
      if (g.members.some(m => m.isRenderable())) return false;
    }

    // 단일 적(보스 등): dying도 남아있으면 false
    for (const e of this.game.enemies){
      if (e.isRenderable()) return false;
    }
    return true;
  }

  update(dt){
    this.stageTime += dt;

    if (this.dataPack && this.stagePlan){
      // 1) 스폰 트리거
      this._waveClock += dt;
      if (this._pendingSpawns && this._pendingSpawns.length){
        // delay가 지난 순서대로 스폰
        const ready = this._pendingSpawns.filter(s=> this._waveClock >= s.at);
        this._pendingSpawns = this._pendingSpawns.filter(s=> this._waveClock < s.at);
        for(const s of ready){
          this._spawnGroupFromData(s.groupId, s.moveSpeed); // ★ 아래 함수
        }
      }
    }

    if(this.phase==='wait'){
      this.waveTimer -= dt;
      if(this.waveTimer<=0){
        this.nextStep();
      }
    } else if(this.phase==='wave'){
      if(this.activeWave.spawned && this.allEnemiesCleared()){
        this._showBanner(this.stagePlan.stageNo + '-' + this.currentWave + " 클리어!");
        this.nextStep();
        return;
      }
    } else if (this.phase==='clear'){
      this.clearTime -= dt;
      if (this.clearTime <= 0) {
        this.nextStep();
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
    if(this.phase==='wait' && this.nextWaveNumber && this.stagePlan){
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 48px system-ui";
      ctx.fillText(this.stagePlan.stageNo + "-" + this.nextWaveNumber, this.game.width/2, this.game.height/2 - 40);
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
    // 데이터 모드면: 텔레그래프만 기존처럼 그리고, 실제 스폰은 데이터로
    if (this.dataPack && this.stagePlan){
      // 기존처럼 등장 방향 안내(점선 원/화살표)만 표시
      const g = this.game, W=g.width, H=g.height;
      const edge = randInt(0,3);
      let origin, dir;
      if(edge===0){ origin = new Vec2(rand(W*0.2,W*0.8), -20); dir = Math.PI/2; }
      else if(edge===2){ origin = new Vec2(rand(W*0.2,W*0.8), H+20); dir = -Math.PI/2; }
      else if(edge===1){ origin = new Vec2(W+20, rand(H*0.2,H*0.8)); dir = Math.PI; }
      else { origin = new Vec2(-20, rand(H*0.2,H*0.8)); dir = 0; }
      this.addTelegraph(origin, dir, 2);

      const self = this;
      setTimeout(function(){
        // ★ 데이터 웨이브 n(1-based) → 인덱스 (0-based)
        self._startWaveByData(n-1);
        if(n===3){ self.wave3Deadline = self.stageTime + 30; }
        if(self.activeWave.num === n){ self.activeWave.spawned = true; }
      }, 2000);
      return;
    }

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

  _onWaveCleared(){
    this.game.onStageClear();
  }

  _spawnGroupFromData(groupId, moveSpeed){
    const gdata = this.dataPack.groups.get(groupId);
    if(!gdata) throw new Error('Group not found: '+groupId);
    const ids = gdata.monsterIds;
    const count = ids.length;

    // 포메이션 자동 결정: 10 이하면 1열, 그 이상은 2열 (원하면 규칙 바꿔도 됨)
    // const columns = (count > 10) ? 2 : 1;
    const columns = 1;

    const game = this.game;
    const group = new EnemyGroup(game, columns, count, moveSpeed, (e, idx)=>{
      const mid = ids[idx];
      const m = this.dataPack.monsters.get(mid);
      const ad = this.dataPack.attackDetails.get(m.attackKind);
      if(!m) throw new Error('Monster id not found: '+mid);
      if(!ad) throw new Error('AttackDetails id not found: '+m.attackKind);

      // 크기/HP
      e.maxHp = m.hp;
      e.hp = m.hp;
      e.radius = game.playerRadius * (m.size || 0.66);

      // 이미지 (로더가 images[url]로 등록해둠)
      e.sprite = (ASSETS && ASSETS.images && ASSETS.images[m.image]) || e.sprite;

      // 공격 패턴/주기 (type 여부와 무관하게 data 기반으로 운용)
      e.attackKind = m.attackKind || 'none';
      e.attackTiming = Number(m.attackTiming)||0;
      e.attackPeriod = Number(m.period)||0;
      e.dropItem = m.dropItem || 'none';
      e.dropRatio = Number(m.dropRatio) || 0;
      e.attackAngles = ad.dir_angles;
      e.attackSpeed = Number(ad.dir_speed);
      e.attackLifesec = ad.mine_lifesec;
      if (ad.mine_lifesec > 0)
        e.attackRadius = ad.mine_radius;
      else
        e.attackRadius = ad.aoe_radius;
      e.attackDuration = ad.aoe_duration;

      if (e.attackKind === 'none') {
        e.score = this.dataPack.score.normal;
      } else {
        e.score = this.dataPack.score.attacker;
      }
    });

    // 등장 엣지/방향은 기존 랜덤 로직 재사용
    const W=game.width, H=game.height;
    const edge = randInt(0,3);
    let origin, dir;
    if(edge===0){ origin=new Vec2(rand(W*0.2,W*0.8), -20);   dir=Math.PI/2; }
    else if(edge===2){ origin=new Vec2(rand(W*0.2,W*0.8), H+20); dir=-Math.PI/2; }
    else if(edge===1){ origin=new Vec2(W+20, rand(H*0.2,H*0.8)); dir=Math.PI; }
    else { origin=new Vec2(-20, rand(H*0.2,H*0.8)); dir=0; }

    group.setPositions(origin, dir);
    game.groups.push(group);
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
    console.log(`SPAWN wave=${n} origin=(${origin.x|0},${origin.y|0}) dir=${dir.toFixed(2)}`);
    try {
      const g = this.game;
      const W=g.width, H=g.height;
    
      if(n===1){
        const group = new EnemyGroup(g, 1, 10, function(e){ e.setType(ENEMY_TYPE.NORMAL); e.maxHp=3; e.hp=3; e.radius=g.enemyRadius; });
        group.setPositions(origin, dir);
        g.groups.push(group);
    
      }else if(n===2){
        const group = new EnemyGroup(g, 2, 20, function(e, i, col, k){
          const lenPerCol = 10;
          const isHead = (k===0);
          const isTail = (k===lenPerCol-1);
          if(isHead || isTail){ e.setType(ENEMY_TYPE.SHOOTER); e.maxHp=5; e.hp=5; e.radius=g.enemyRadius; }
          else { e.setType(ENEMY_TYPE.NORMAL); e.maxHp=3; e.hp=3; e.radius=g.enemyRadius; }
        });
        group.setPositions(origin, dir);
        g.groups.push(group);
    
      }else if(n===3){
        // 1열×10(모두 슈터)
        const g1 = new EnemyGroup(g, 1, 10, function(e){ e.setType(ENEMY_TYPE.SHOOTER); e.maxHp=5; e.hp=5; e.radius=g.enemyRadius; });
        g1.setPositions(origin, dir);
        g.groups.push(g1);
    
        // 2열×20(모두 일반) — 'edge' 참조 제거, 독립 무작위 등장
        const e2 = randInt(0,3);
        let origin2, dir2;
        if(e2===0){ origin2 = new Vec2(rand(W*0.2,W*0.8), -20); dir2 = Math.PI/2; }
        else if(e2===2){ origin2 = new Vec2(rand(W*0.2,W*0.8), H+20); dir2 = -Math.PI/2; }
        else if(e2===1){ origin2 = new Vec2(W+20, rand(H*0.2,H*0.8)); dir2 = Math.PI; }
        else { origin2 = new Vec2(-20, rand(H*0.2,H*0.8)); dir2 = 0; }
    
        const g2 = new EnemyGroup(g, 2, 20, function(e){ e.setType(ENEMY_TYPE.NORMAL); e.maxHp=3; e.hp=3; e.radius=g.enemyRadius; });
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
          const g4 = new EnemyGroup(g, 2, 20, function(e){ e.setType(ENEMY_TYPE.NORMAL); e.maxHp=3; e.hp=3; e.radius=g.enemyRadius; });
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
    catch (e) {
      window.__fatal && window.__fatal(e, `_spawnWaveAt(${n})`);
      throw e;
    }
  }
}
