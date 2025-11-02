// src/particles.js
// 아주 가벼운 "먼지/조각" 파티클 전용 풀
// - 원형 점 2~4px
// - 수명 0.2~0.3s
// - 생성 시 반지름 방향으로 바깥쪽으로만 튀게 설계

class ParticlePool {
  /**
   * @param {number} max 최대 파티클 수(모바일 150~200 권장)
   */
  constructor(max = 200){
    this.max = max|0;
    this.items = new Array(this.max);
    this.alive = 0;              // 살아있는 파티클 수
    this._recycled = [];         // 인덱스 재사용 스택
    // 내부 버퍼 초기화
    for (let i=0;i<this.max;i++){
      this.items[i] = this._makeDeadParticle();
      this._recycled.push(i);
    }
    this._emitBudget = 40;       // 프레임당 최대 생성 수(과도 방지)
    this._emittedThisFrame = 0;
  }

  _makeDeadParticle(){
    return {
      alive:false,
      // 위치/속도
      x:0, y:0, vx:0, vy:0,
      // 렌더 파라미터
      r:2,  alpha:0,
      // 수명
      t:0,  life:0,
      // 색
      color:'#FFFFFF'
    };
  }

  /** 프레임 시작 시 호출(선택). 예산 초기화 */
  beginFrame(){
    this._emittedThisFrame = 0;
  }

  /** 내부 공용: 파티클 1개 확보(없으면 가장 오래된 것 덮어씀) */
  _alloc(){
    if (this._emittedThisFrame >= this._emitBudget) return -1;
    let idx = this._recycled.pop();
    if (idx == null){
      // 재고 없음 → 가장 수명 끝에 가까운 애 하나 찾아 덮어씀(살짝 비용 있지만 드문 케이스)
      let worst = -1, minT = Infinity;
      for (let i=0;i<this.max;i++){
        const p = this.items[i];
        if (!p.alive) { worst = i; break; }
        const remain = p.life - p.t;
        if (remain < minT){ minT = remain; worst = i; }
      }
      idx = worst;
    }
    if (idx == null || idx < 0) return -1;
    this._emittedThisFrame++;
    return idx;
  }

  /**
   * 적 중심에서 사방으로 흩어지는 더스트 여러 개를 한 번에 생성
   * @param {{x:number,y:number}} pos  기준 위치(보통 enemy.pos)
   * @param {number} count            생성 개수(요청: 항상 5개)
   * @param {object} opt              { baseSpeed, spread, minR, maxR, life, color }
   */
  emitDustBurst(pos, count = 5, opt = {}){
    const baseSpeed = (opt.baseSpeed ?? 110);  // px/s
    const spread    = (opt.spread    ?? Math.PI); // ±spread/2 범위로 살짝 퍼짐
    const minR      = (opt.minR      ?? 2);    // 점 반지름 최소
    const maxR      = (opt.maxR      ?? 4);    // 점 반지름 최대
    const life      = (opt.life      ?? 0.26); // 초
    const color     = (opt.color     ?? '#FFFFFF');

    // 기준 각도를 랜덤으로 잡고, 그 주변으로 퍼뜨리면 전체적으로 고르게 보임
    const baseAng = Math.random() * Math.PI * 2;

    for (let i=0;i<count;i++){
      const idx = this._alloc();
      if (idx < 0) break;
      const p = this.items[idx];

      // 기준에서 ±spread/2 범위로 퍼지는 각도
      const ang = baseAng + (Math.random()-0.5) * spread;
      const spd = baseSpeed * (0.85 + Math.random()*0.3); // ±15%
      const vx = Math.cos(ang) * spd;
      const vy = Math.sin(ang) * spd;

      // 약간의 초깃값 오프셋(적 반지름의 0~0.3배 정도에서 시작하면 더 자연스러움)
      const offLen = Math.random() * 6; // 0~6px
      const ox = Math.cos(ang) * offLen;
      const oy = Math.sin(ang) * offLen;

      p.alive = true;
      p.x = pos.x + ox;
      p.y = pos.y + oy;
      p.vx = vx;
      p.vy = vy;
      p.r = minR + Math.random() * (maxR - minR);
      p.t = 0;
      p.life = life * (0.85 + Math.random()*0.2);
      p.alpha = 1.0;
      p.color = color;
    }
  }

  /** 전체 업데이트 */
  update(dt){
    if (dt <= 0) return;
    for (let i=0;i<this.max;i++){
      const p = this.items[i];
      if (!p.alive) continue;

      p.t += dt;
      if (p.t >= p.life){
        // 재활용 스택으로 반납
        p.alive = false;
        this._recycled.push(i);
        continue;
      }
      // 이동
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // 천천히 감속(공기저항 느낌) — 너무 크면 부자연스러움
      const drag = 1 - (dt * 2.2);         // ~e^-k
      p.vx *= drag;
      p.vy *= drag;

      // 점점 작아지고 투명해짐
      const k = p.t / p.life;              // 0→1
      p.alpha = 1 - k;                     // 선형 페이드
      p.r = Math.max(0.8, p.r * (1 - dt*2)); // 미세 축소
    }
  }

  /** 전체 그리기 (같은 색끼리 배치 그리기) */
  draw(ctx){
    // 간단히 한 번에 그려도 부담 거의 없음(half-transparent 작은 원 몇 개뿐)
    ctx.save();
    ctx.lineWidth = 0;         // fill만 사용
    // shadow/blur 금지(모바일 성능)
    ctx.shadowBlur = 0;

    for (let i=0;i<this.max;i++){
      const p = this.items[i];
      if (!p.alive || p.alpha <= 0) continue;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }

  /** 전부 제거(스테이지 전환 시 권장) */
  clearAll(){
    for (let i=0;i<this.max;i++){
      const p = this.items[i];
      p.alive = false;
      this._recycled.push(i);
    }
    this.alive = 0;
  }
}

// 전역 export
window.ParticlePool = ParticlePool;
