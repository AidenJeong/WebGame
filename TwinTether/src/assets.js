// 몬스터 타입별 단일 이미지 등록 (시트 애니 대신 '1장'만 사용)
window.ASSETS = window.ASSETS || { ready:false, monsters:{} };

(function(){
  // 타입별로 원하는 이미지를 연결 (경로는 프로젝트에 맞게)
  const list = [
    ["normal",  "assets/chick.png"],
    ["shooter", "assets/chicken.png"],
    ["boss",    "assets/bear.png"]
  ];
  let left = list.length;

  list.forEach(([key, url])=>{
    const img = new Image();
    img.src = url;
    img.onload = function(){
      ASSETS.monsters[key] = img;
      if(--left===0) ASSETS.ready = true;
    };
    img.onerror = function(){ console.warn("이미지 로드 실패:", url); if(--left===0) ASSETS.ready=true; };
  });
})();

// ✅ 추가: 배경 이미지 컨테이너
ASSETS.bg = ASSETS.bg || {};

// ✅ 추가: 배경 로드
(function(){
  const list = [
    ["main", "assets/bg_01.jpg"],   // 키: "main"
    // ["wave3", "assets/bg_wave3.jpg"],  // (원하면 웨이브별 배경도 여기에 이어서)
  ];
  let left = list.length;
  if (left === 0) return;

  list.forEach(([key, url])=>{
    const img = new Image();
    img.src = url;
    img.onload = function(){
      ASSETS.bg[key] = img;
      if (--left === 0) ASSETS.ready = true; // 기존 ready에 합류
    };
    img.onerror = function(){
      console.warn("BG load fail:", url);
      if (--left === 0) ASSETS.ready = true;
    };
  });
})();