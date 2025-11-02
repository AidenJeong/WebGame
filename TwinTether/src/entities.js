// ===============================
// Entities: players, enemies, missiles, items, groups
// - 이동속도: 일반/공격형을 원래 속도(game.enemySpeed)로 복구
// - 적 피격 i-frame: 2초 무적(invulUntil) 추가
//   * 라인에 맞으면 '그 순간의 라인 겹수' 만큼 즉시 피해 후 2초간 추가 피해 무시
// ===============================

// ===== 애니메이션 파라미터(자주 손대는 곳) =====
const FX = {
  // 이동(젤리): 속도 비례 찌그러짐 + 느린 흔들림
  move: {
    stretchMax: 0.25,    // 0~0.5 권장 (가로/세로 늘였다 줄였다)
    wobbleHz: 2.0,       // 초당 흔들림 횟수(느릿하게)
    wobbleAmp: 0.05,     // 흔들림 강도(스케일에 더해짐)
    jigglePx: 1.5        // 이동방향 수직 좌우 흔들림(px)
  },
  // 공격준비: 좌우로 빠르게 떨림(부들부들)
  prep: {
    hz: 10.0,            // 좌우 왕복 횟수/초
    ampPx: 5.0,          // 좌우 진폭(px)
    shakeAmp: 0.04       // 미세 스케일 떨림
  },
  // 공격: 심장박동 펄스 + 잔상
  attack: {
    pulse: 0.35,         // 순간 확장량(스케일에 더함)
    duration: 0.20,      // 펄스 지속(초)
    ghosts: 5,           // 잔상 개수
    ghostDecay: 0.75     // 잔상 감쇠(알파)
  },
  // 죽음: 아래로 찌그러지며 사라짐
  death: {
    duration: 0.5,       // 전체 길이(초)
    squash: 0.6,         // 최종 세로 납작 비율(0.0~1.0)
    dropPx: 8,           // 아래로 눌린 듯한 이동량(px)
    fade: true           // 알파 페이드 아웃 여부
  }
};

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

    // // 타입별 기본 색상
    // this.baseColor = (type===ENEMY_TYPE.NORMAL)?COL.enemyNormal:
    //                  (type===ENEMY_TYPE.SHOOTER)?COL.enemyShooter:COL.boss;

    // // 타입별 이미지(프레임 교체 없음, 단일 이미지 사용)
    // this.sprite = null;
    // if (window.ASSETS && ASSETS.monsters){
    //   // ENEMY_TYPE 값에 맞춰 키 매핑
    //   const key = (type===ENEMY_TYPE.SHOOTER) ? "shooter" :
    //               (type===ENEMY_TYPE.BOSS)    ? "boss"    : "normal";
    //   this.sprite = ASSETS.monsters[key] || null;
    // }

    // 말랑/떨림/펄스 상태
    this.animPhase = 0;       // 임의의 위상(진동용)
    this.lastPos = this.pos.clone();
    this.hitPulse = 0;        // (피격용 펄스) 필요 시 병용 가능

    // ===== 상태 머신 =====
    this.state = "move";      // 'move'|'prep'|'attack'|'death'
    this.stateTime = 0;       // 상태 경과 시간
    this.dieTimer = 0;        // 죽음 연출 남은 시간(초)

    // 공격 타이밍(슈터)
    this.shotBlinkTime = 1.0;
    this.readyForAttack = false;
    // this.nextShotAt = now() + 5;

    // 공격 잔상 기록(공격 상태일 때만 사용)
    this.ghosts = [];         // [{x,y,scale,alpha}, ...]
    this.renderScale = 1.2;   // 화면에서만 크게(충돌 반지름과 무관)

    // // 보스는 스프라이트 미적용(원하면 매핑 추가)
    // if (type !== ENEMY_TYPE.BOSS && window.ASSETS){
    //   this.spriteW = this.sprite.width / this.spriteFrames; // 가로 2프레임 가정
    //   this.spriteH = this.sprite.height;
    // }

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

    // 처치시 획득 점수
    this.score = 0;

    this._spriteKey = null;
    this._refreshVisualByType();
  }

  // 타입에 맞춰 스프라이트/색을 다시 매핑
  _refreshVisualByType(){
    const key = (this.type===ENEMY_TYPE.SHOOTER) ? 'shooter'
              : (this.type===ENEMY_TYPE.BOSS)    ? 'boss'
              : 'normal';
    // 스프라이트 변경
    if (window.ASSETS && ASSETS.monsters){
      this.sprite = ASSETS.monsters[key] || this.sprite; // 로드 전이면 기존 유지
    }
    // 색상도 타입에 맞춰 갱신(스프라이트가 없을 때를 대비)
    this.baseColor = (key==='shooter') ? COL.enemyShooter
                : (key==='boss')     ? COL.boss
                : COL.enemyNormal;
    this._spriteKey = key; // 현재 적용된 키를 기록
  }

  // 바깥에서 안전하게 타입 바꿀 때는 이걸 쓰기
  setType(t){
    if (this.type === t) return;
    this.type = t;
    this._refreshVisualByType();
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

    // 공격 레벨/라인 색과 매칭시키고 싶으면 coreColor를 넘겨주세요.
    const dustColor = '#FFFFFF'; // 또는 ATTACK_LINE.colorByLevel[level]
    this.game.particles.emitDustBurst(this.pos, 10, {
      baseSpeed: 200,     // 110~140 느낌
      life: 0.26,
      minR: 7, maxR: 15,
      color: dustColor
    });

    if(this.hp <= 0 && this.state !== 'death') {
      this.onDeath();
      // 즉시 제거하지 않고 death 애니를 실행
      this.changeState("death");
      this.dieTimer = FX.death.duration;   // ← 연출 지속 시간만큼 화면에 남김
    }
    else if (this.attackKind && this.attackKind !== 'none' && this.attackTiming > 0) {
      if (this.attackTiming === 2 || this.attackTiming === 4) {
        this.changeState("prep");
      }
    }
  }

  // 사망 시 아이템 드랍
  onDeath(){
    const g = this.game;
    if (Math.random() < this.dropRatio) {
      g.dropItem(this.dropItem, this.pos.clone());
    }
    if (this.attackKind && this.attackKind !== 'none' && this.attackTiming > 0) {
      if (this.attackTiming === 3 || this.attackTiming === 5) {
        this._attackByAttackKind();
      }
    }
  }

  // death 연출을 포함해 화면에 존재해야 하는가?
  isRenderable(){
    return (this.hp > 0) || (this.state === 'death' && this.dieTimer > 0);
  }

  // 완전히 사라져도 되는가? (배열에서 제거해도 되는 시점)
  isDeadDone(){
    return (this.hp <= 0) && (this.state === 'death') && (this.dieTimer <= 0);
  }

  update(dt){
    if(!this.isRenderable()) return;

    // 타입과 스프라이트 키가 불일치하면 즉시 동기화
    const expected = (this.type===ENEMY_TYPE.SHOOTER)?'shooter'
                  : (this.type===ENEMY_TYPE.BOSS)?'boss':'normal';
    if (this._spriteKey !== expected) this._refreshVisualByType();

    // 이미지 지연 로드 대응(초기 null → 나중에 로드됨)
    if (!this.sprite && window.ASSETS && ASSETS.monsters) {
      const key = (this.type===ENEMY_TYPE.SHOOTER) ? "shooter" :
                  (this.type===ENEMY_TYPE.BOSS)    ? "boss"    : "normal";
      this.sprite = ASSETS.monsters[key] || null;
    }

    // dying 상태면 움직임/공격 모두 정지, 타이머만 깎음
    if (this.state === "death"){
      this.stateTime += dt;
      this.dieTimer = Math.max(0, this.dieTimer - dt);
      return; // 더 이상 이동/발사 로직 수행 X
    }

    // 이동량/속도 측정(애니 강도에 사용)
    const dx = this.pos.x - this.lastPos.x;
    const dy = this.pos.y - this.lastPos.y;
    const spd = Math.hypot(dx, dy) / Math.max(dt, 1e-4);
    // const speedNorm = clamp(spd / (this.game.enemySpeed * 1.2), 0, 1);

    // 위상 진전
    this.animPhase += dt;

    // ===== 상태 머신 =====
    this.stateTime += dt;

    // Enemy.update(dt) 내 발사 파트 교체
    const t = now();
    if (this.state === "move") {
      if (this.attackKind && this.attackKind !== 'none' && this.attackTiming > 0) {
        // 공격형 몬스터
        if (this.attackTiming === 1 || this.attackTiming === 4 || this.attackTiming === 5) {
          // 일정 시간마다 공격
          if (this.stateTime > this.attackPeriod) {
            this.changeState("prep");
          }
        }
      }
    } else if (this.state === "prep") {
      // 공격 준비 상태
      // 시간마다 공격하거나 데미지 받았을때 공격하는 애들은 준비상태로 전환 후 공격하고, 
      // 죽을때 공격하는 형태는 바로 공격을 진행함.
      if (this.stateTime > this.shotBlinkTime) {
        this.ghosts.length = 0;
        this.readyForAttack = true;
        this.changeState("attack");
      }
    }
    // 공격 상태에서 잔상 누적(최근 위치/스케일 기록)
    else if (this.state === "attack") {
      if (this.stateTime > FX.attack.duration) {
        // 공격 연출 종료
        this.changeState("move");
      }
      else if (this.readyForAttack) {
        this._attackByAttackKind();
        if (!this.readyForAttack)
        {
          // 스케일은 draw에서 다시 계산되지만, 잔상용으로 대략적 값만 저장
          const s = 1 + FX.attack.pulse; // 맥박 최대치 근방으로 기록
          this.ghosts.unshift({ x:this.pos.x, y:this.pos.y, scale:s, alpha:1.0 });
          if (this.ghosts.length > FX.attack.ghosts) this.ghosts.pop();
          // 알파 감쇠
          for (let i=0;i<this.ghosts.length;i++){
            this.ghosts[i].alpha *= FX.attack.ghostDecay;
          }
        }
      }
    }

    // 다음 프레임 대비
    this.lastPos.x = this.pos.x;
    this.lastPos.y = this.pos.y;
  }

  changeState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  _attackByAttackKind()
  {
    if (this.attackSpeed > 0)
        {
          // 미사일
          this.readyForAttack = false;
          this.performAttack_dir();
        }
        else if (this.attackLifesec > 0)
        {
          // mine
          this.readyForAttack = false;
          this.performAttack_mine();
        }
        else if (this.attackRadius > 0)
        {
          // aoe
          this.readyForAttack = false;
          this.performAttack_aoe();
        }
  }

  performAttack_dir(){
    const v = {x: Math.cos(this.heading||0), y: Math.sin(this.heading||0)};
    this._lastMoveDir = Math.atan2(v.y, v.x);

    const base = this._lastMoveDir; // 라디안
    const spd  = this.attackSpeed * this.game.missileSpeed;
    const pos  = this.pos.clone();
    const ctxGame = this.game;

    for (let i = 0; i < (this.attackAngles?.length || 0); ++i) {
      const deg = Number(this.attackAngles[i]);
      const ang = base + (deg * Math.PI / 180); // 시계방향 기준
      const v = Vec2.fromAngle(ang, spd);
      ctxGame.spawnMissile(pos, v);
    }
  }

  performAttack_mine(){
    const pos = this.pos.clone();
    const life = (this.attackLifesec != null) ? this.attackLifesec : 10;
    const r    = (this.attackRadius != null) ? this.attackRadius : 16;
    this.game.spawnMine(pos, r, life);
  }

  performAttack_aoe(){
    const pos = this.pos.clone();
    const rad = this.attackRadius || 80;
    const fxT = this.attackDuration || 0.4;
    this.game.spawnAoe(pos, rad, fxT);

    // 즉시 피해 적용(원한다면 onEnd에 줄 수도 있음)
    //this.game.applyAoeDamage(pos, rad, { damage:1 }); // 또는 damage를 데이터화
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
    // death 애니 종료 뒤엔 그리지 않음
    if(this.hp<=0 && !(this.state==="death" && this.stateTime < FX.death.duration)) return;

    const t = now();

    // --- 공통: 이동방향 파생값(좌우 흔들림 방향 계산용) ---
    const dx = this.pos.x - this.lastPos.x;
    const dy = this.pos.y - this.lastPos.y;
    const heading = (Math.abs(dx)+Math.abs(dy) > 1e-4) ? Math.atan2(dy, dx) : (this.heading||0);

    // --- 상태별 스케일/오프셋 계산 ---
    let sx=1, sy=1, ox=0, oy=0, alpha=1;

    if (this.state === "move") {
      // 젤리: 속도 비례 찌그러짐 + 느린 wobble
      const wob = Math.sin(this.animPhase * 2*Math.PI*FX.move.wobbleHz) * FX.move.wobbleAmp;
      const speedNorm = clamp(Math.hypot(dx,dy)/(this.game.enemySpeed*0.016), 0, 1);
      const stretch = FX.move.stretchMax * speedNorm;

      sx = (1 + stretch + wob);
      sy = (1 - stretch - wob);

      const jig = Math.sin(this.animPhase*3.2) * FX.move.jigglePx;
      // 이동방향 수직(jiggle)
      ox = Math.cos(heading + Math.PI/2) * jig;
      oy = Math.sin(heading + Math.PI/2) * jig;

    } else if (this.state === "prep") {
      // 공격준비: 좌우 빠른 떨림 + 미세 스케일 흔들림
      const s = Math.sin(this.animPhase * 2*Math.PI*FX.prep.hz);
      ox = s * FX.prep.ampPx * Math.cos(heading + Math.PI/2);
      oy = s * FX.prep.ampPx * Math.sin(heading + Math.PI/2);
      sx = 1 + FX.prep.shakeAmp * s;
      sy = 1 - FX.prep.shakeAmp * s;

    } else if (this.state === "attack") {
      // 공격: 심장박동(빠르게 커졌다가 돌아옴)
      const u = clamp(this.stateTime / FX.attack.duration, 0, 1);
      const beat = Math.sin(u*Math.PI); // 0→π: 반주기, 빨리 올라갔다 내려옴
      const pulse = FX.attack.pulse * beat;
      sx = 1 + pulse; sy = 1 + pulse;

    } else if (this.state === "death") {
      // 죽음: 아래로 찌그러짐 + 페이드
      const u = clamp(this.stateTime / FX.death.duration, 0, 1);
      const squash = 1 - (1-FX.death.squash)*u;  // 세로가 1→squash로
      sx = 1 + 0.4*u;          // 가로는 조금 늘려줌
      sy = squash;
      oy = FX.death.dropPx * u; // 아래로 눌린 느낌
      if (FX.death.fade) alpha = 1 - u;
    }

    // --- 실제 그리기(스프라이트 1장) ---
    const r = this.radius * this.renderScale;
    const size = r*2;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 잔상(공격 상태) 먼저 그리면 본체에 가려져 자연스러움
    if (this.state === "attack" && this.ghosts && this.ghosts.length){
      for (let i=this.ghosts.length-1;i>=0;i--){
        const g = this.ghosts[i];
        ctx.save();
        ctx.globalAlpha = 0.25 * g.alpha;
        ctx.translate(this.pos.x, this.pos.y);
        ctx.scale(g.scale, g.scale);
        this.drawSpriteOrCircle(ctx, this.sprite, r);
        ctx.restore();
      }
    }

    // 본체
    ctx.translate(this.pos.x + ox, this.pos.y + oy);
    ctx.scale(sx, sy);
    this.drawSpriteOrCircle(ctx, this.sprite, r);
    ctx.restore();

    // HP 숫자(찌그러지지 않게 원래 좌표에서 그리기)
    // ctx.save();
    // ctx.fillStyle = "#111";
    // ctx.font = `${Math.floor(r*0.9)}px bold system-ui`;
    // ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // ctx.fillText(Math.max(0,this.hp|0), this.pos.x, this.pos.y);
    // ctx.restore();
  }

  // 스프라이트 있으면 drawImage, 없으면 원형으로 대체
  drawSpriteOrCircle(ctx, img, radius){
    if (img && img.complete){
      const s = radius*2;
      ctx.drawImage(img, -radius, -radius, s, s);
    } else {
      ctx.fillStyle = "#7bd4ff";
      ctx.beginPath(); ctx.arc(0,0, radius, 0, TAU); ctx.fill();
    }
  }
}

// -----------------------------------------------
// 선두 추종(지렁이) 포메이션 + trail 기반 연속 이동
// - 이동속도: 원래 속도(game.enemySpeed)
// - 2열 순간이동 버그: trail 샘플 좌표에 추가 측면 오프셋 불가
// -----------------------------------------------
class EnemyGroup {
  constructor(game, formation, count, moveSpeed, typeConfigFn){
    this.game = game;
    this.columns = formation;         // 1 또는 2
    this.members = [];
    this.speed = game.enemySpeed * moveSpeed;

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
        if (e.state === 'death') continue; // ★ dying은 마지막 위치 유지 (덮어쓰기 금지)
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
    this.members = this.members.filter(m => !m.isDeadDone());
  }

  aliveCount(){ 
    // return this.members.filter(m=>m.isAlive()).length; 
    
    // 웨이브 게이트용: dying(연출 중)도 카운트해서 다음 웨이브로 못 넘어가게 함
    return this.members.filter(m => (m.hp > 0) || (m.state === 'death' && m.dieTimer > 0)).length;
  }

  draw(ctx){ for(const e of this.members) e.draw(ctx); }
}

// -----------------------------------------------
class Missile {
  constructor(pos, vel, radius=5){ 
    this.pos = (pos && pos.clone) ? pos.clone() : new Vec2(pos.x, pos.y);
    this.vel = (vel && vel.clone) ? vel.clone() : new Vec2(vel.x, vel.y);
    this.radius = radius;
  }
  
  update(dt){ 
    this.pos.add(this.vel.clone().mul(dt)); 
  }

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
class Mine {
  constructor(pos, radius, ttl) {
    this.pos = (pos && pos.clone) ? pos.clone() : new Vec2(pos.x, pos.y);
    this.radius = radius;
    this.ttl = ttl;
    this.born = now();
    this.end = false;
  }

  update(dt) {
    if (!this.end){
      const t = now();
      if (t - this.born > this.ttl) {
        this.end = true;
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = COL.mine;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  bomb() {
    this.end = true;
  }
}

// -----------------------------------------------
class Aoe {
  constructor(pos, radius, duration) {
    this.pos = (pos && pos.clone) ? pos.clone() : new Vec2(pos.x, pos.y);
    this.maxRadius = radius;
    this.radius = 0;
    this.duration = duration;
    this.born = now();
    this.end = false;
  }

  update(dt) {
    if (!this.end) {
      const t = now();
      const elapsed = t - this.born;
      if (elapsed > this.duration) {
        this.end = true;
      }
      else {
        this.radius = lerp(0, this.maxRadius, elapsed / this.duration);
      }
    }
  }

  draw(ctx) {
    const t = now();
    const elapsed = t - this.born;
    const k = elapsed / this.duration;
    const alpha = 1.0 * (1 - k);
    const lineW = 6 * (0.85 + 0.15*(1-k));
    
    ctx.save();
    //ctx.fillStyle = COL.aoe;
    ctx.shadowColor = COL.aoe;
    ctx.shadowBlur = 8;
    ctx.setLineDash([10,8]); 
    ctx.lineDashOffset = k * 120; // 옵션: 점선이 흐르듯
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lineW;
    ctx.strokeStyle = COL.aoe;

    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, TAU);
    ctx.stroke();
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
