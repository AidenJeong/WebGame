// src/data_loader.js
// 데이터(JSON) 로드 + 스키마 검증 + 이미지 프리로드
// - 네트워크/경로 오류: 원인 힌트 포함
// - 스키마/타입 오류: "path: 기대타입 vs 실제값" 형태로 상세 메시지

(function(global){
  function t(x){
    if (Array.isArray(x)) return 'array';
    if (x === null) return 'null';
    return typeof x; // 'object' | 'string' | 'number' | ...
  }
  function fail(path, expect, got, sample){
    const msg = `[DATA SCHEMA] ${path}: expected ${expect}, got ${t(got)}${sample!==undefined?` (value=${JSON.stringify(sample).slice(0,120)})`:''}`;
    const e = new Error(msg);
    if (window.__err) window.__err(msg);
    throw e;
  }
  function ensure(obj, cond, path, expect){
    if (!cond) fail(path, expect, obj, obj);
  }
  function ensureArray(obj, path){ ensure(obj, Array.isArray(obj), path, 'array'); }
  function ensureNumber(obj, path){ ensure(obj, typeof obj === 'number' && isFinite(obj), path, 'number'); }
  function ensureString(obj, path){ ensure(obj, typeof obj === 'string', path, 'string'); }
  function ensureObject(obj, path){ ensure(obj, obj && typeof obj === 'object' && !Array.isArray(obj), path, 'object'); }

  // ---- fetch + parse ----
  async function fetchJson(url){
    try{
      const r = await fetch(url, { cache: 'no-store' });
      if(!r.ok){
        // 404/500 등은 TypeError가 아니라도 원인 메시지로 표기
        throw new Error(`HTTP ${r.status} while fetching ${url}`);
      }
      // 일부 서버가 text/plain으로 주더라도 JSON으로 파싱
      const text = await r.text();
      try{
        return JSON.parse(text);
      }catch(parseErr){
        // SyntaxError: JSON 구조 문제(주석/콤마 등)
        parseErr.message = `JSON parse error in ${url}: ` + parseErr.message;
        throw parseErr;
      }
    }catch(netErr){
      // 네트워크/경로 문제 (Failed to fetch)
      netErr.message = `Fetch error for ${url}: ${netErr.message}\n(로컬서버로 열고 경로 확인: e.g., python -m http.server)`;
      throw netErr;
    }
  }

  // ---- schema validation + normalize to Maps ----
  function normalize(pack){
    // 루트 유효성
    ensureObject(pack, '$');

    // score
    ensureObject(pack.score, '$.score');
    const score = {
      normal: pack.score.normal,
      attacker: pack.score.attacker,
      stageClear: pack.score.stageClear,
      item: pack.score.item,
      itemBonus: pack.score.itemBonus,
    };
    ensureNumber(score.normal, `$.score.normal`);
    ensureNumber(score.attacker, `$.score.attacker`);
    ensureNumber(score.stageClear, `$.score.stageClear`);
    ensureNumber(score.item, `$.score.item`);
    ensureNumber(score.itemBonus, `$.score.itemBonus`);

    // monsters
    const monsters = pack.monsters ?? [];
    ensureArray(monsters, '$.monsters');
    const mById = new Map();
    monsters.forEach((m, i)=>{
      ensureObject(m, `$.monsters[${i}]`);
      ensureString(m.id, `$.monsters[${i}].id`);
      ensureNumber(m.hp, `$.monsters[${i}].hp`);
      if (m.image !== undefined) ensureString(m.image, `$.monsters[${i}].image`);
      if (m.size !== undefined) ensureNumber(m.size, `$.monsters[${i}].size`);
      if (m.attackKind !== undefined) ensureString(m.attackKind, `$.monsters[${i}].attackKind`);
      if (m.attackInterval !== undefined) ensureNumber(m.attackTiming, `$.monsters[${i}].attackTiming`);
      if (m.period !== undefined) ensureNumber(m.period, `$.monsters[${i}].period`);
      if (m.dropItem !== undefined) ensureString(m.dropItem, `$.monsters[${i}].dropItem`);
      if (m.dropRatio !== undefined) ensureNumber(m.dropRatio, `$.monsters[${i}].dropRatio`);
      mById.set(m.id, m);
    });

    // attackDetails
    const attackDetails = pack.attackDetails ?? [];
    ensureArray(attackDetails, '$.attackDetails');
    const aById = new Map();
    attackDetails.forEach((a, i)=>{
      ensureObject(a, `$.attackDetails[${i}]`);
      ensureString(a.id, `$.attackDetails[${i}].id`);
      ensureArray(a.dir_angles, `$.attackDetails[${i}].dir_angles`);
      a.dir_angles.forEach((angle, k)=>{
        ensureNumber(angle, `$.attackDetails[${i}].dir_angles[${k}]`);
      });
      ensureNumber(a.dir_speed, `$.attackDetails[${i}].dir_speed`);
      ensureNumber(a.mine_lifesec, `$.attackDetails[${i}].mine_lifesec`);
      ensureNumber(a.mine_radius, `$.attackDetails[${i}].mine_radius`);
      ensureNumber(a.aoe_radius, `$.attackDetails[${i}].aoe_radius`);
      ensureNumber(a.aoe_duration, `$.attackDetails[${i}].aoe_duration`);
      aById.set(a.id, a);
    });

    // groups
    const groups = pack.groups ?? [];
    ensureArray(groups, '$.groups');
    const gById = new Map();
    groups.forEach((g, i)=>{
      ensureObject(g, `$.groups[${i}]`);
      ensureString(g.id, `$.groups[${i}].id`);
      ensureArray(g.monsterIds, `$.groups[${i}].monsterIds`);
      g.monsterIds.forEach((mid, k)=>{
        ensureString(mid, `$.groups[${i}].monsterIds[${k}]`);
      });
      gById.set(g.id, g);
    });

    // waves
    const waves = pack.waves ?? [];
    ensureArray(waves, '$.waves');
    const wById = new Map();
    waves.forEach((w, i)=>{
      ensureObject(w, `$.waves[${i}]`);
      ensureString(w.id, `$.waves[${i}].id`);
      ensureArray(w.spawns, `$.waves[${i}].spawns`);
      w.spawns.forEach((s, k)=>{
        ensureObject(s, `$.waves[${i}].spawns[${k}]`);
        // delay는 number, groupId는 string
        if (s.delay !== undefined) ensureNumber(s.delay, `$.waves[${i}].spawns[${k}].delay`);
        ensureString(s.groupId, `$.waves[${i}].spawns[${k}].groupId`);
        ensureNumber(s.moveSpeed, `$.waves[${i}].spawns[${k}].moveSpeed`);
      });
      wById.set(w.id, w);
    });

    // stages
    const stages = pack.stages ?? [];
    ensureArray(stages, '$.stages');
    const sByNo = new Map();
    stages.forEach((s, i)=>{
      ensureObject(s, `$.stages[${i}]`);
      ensureNumber(s.stageNo, `$.stages[${i}].stageNo`);
      if (s.bg !== undefined) ensureString(s.bg, `$.stages[${i}].bg`);
      if (s.waveCount !== undefined) ensureNumber(s.waveCount, `$.stages[${i}].waveCount`);
      ensureArray(s.waveIds, `$.stages[${i}].waveIds`);
      s.waveIds.forEach((wid, k)=> ensureString(wid, `$.stages[${i}].waveIds[${k}]`) );
      sByNo.set(s.stageNo, s);
    });

    return { raw: pack, score:score, monsters:mById, groups:gById, waves:wById, stages:sByNo, attackDetails:aById };
  }

  // ---- preload images used by monsters+stages ----
  function preloadImages(normalized){
    const imgs = new Set();
    normalized.monsters.forEach(m=>{ if (m.image) imgs.add(m.image); });
    normalized.stages.forEach(s=>{ if (s.bg) imgs.add(s.bg); });

    if (!window.ASSETS) window.ASSETS = {};
    ASSETS.images = ASSETS.images || {}; // url -> Image
    const jobs = [];
    imgs.forEach(url=>{
      if (ASSETS.images[url]) return;
      jobs.push(new Promise(res=>{
        const img = new Image();
        img.src = url;
        img.onload = ()=>{ ASSETS.images[url]=img; res(); };
        img.onerror = ()=>{ window.__warn && window.__warn('img load fail', url); res(); };
      }));
    });
    return Promise.all(jobs);
  }

  async function loadStagePack(url){

    // 1) #id 로 들어오면 무조건 인라인 읽기
    if (url && url.startsWith && url.startsWith('#')) {
      const el = document.querySelector(url);
      if (!el) throw new Error(`inline JSON not found: ${url}`);
      const obj = JSON.parse(el.textContent);
      const norm = normalize(obj);
      await preloadImages(norm);
      return norm;
    }

    // 2) file:// 환경이면 기본 id(#stage-pack)에서 읽기
    if (location.protocol === 'file:') {
      const el = document.getElementById('stage-pack');
      if (!el) throw new Error('file:// 환경: #stage-pack 스크립트 태그가 필요합니다.');
      const obj = JSON.parse(el.textContent);
      const norm = normalize(obj);
      await preloadImages(norm);
      return norm;
    }

    const pack = await fetchJson(url);
    const norm = normalize(pack);
    await preloadImages(norm);
    // 요약 로그(디버그 보기 좋게)
    if (window.__log){
      __log(`[DATA] monsters=${norm.monsters.size} groups=${norm.groups.size} waves=${norm.waves.size} stages=${norm.stages.size}`);
    }
    return norm;
  }

  global.Data = { loadStagePack };
})(window);
