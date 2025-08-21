// Entry
(function(){
  const canvas = document.getElementById('game');
  const game = new Game(canvas);

  window.addEventListener('resize', ()=>game.resize());
  // Prevent space/arrow scrolling when canvas focused
  window.addEventListener('keydown', (e)=>{
    const keys = [' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
    if(keys.includes(e.key)) e.preventDefault();
  });
})();

// --- START BUTTON FALLBACK BINDINGS (robust for iOS/Android/desktop) ---
(function() {
  const overlay = document.getElementById('overlay');
  const canvas  = document.getElementById('game');
  const btn     = document.getElementById('startBtn');

  // 클릭과 터치 모두 지원
  const start = (e) => {
    e && e.preventDefault();
    overlay.classList.add('hidden');
    canvas.classList.remove('blocked'); // 있어도 되고 없어도 됨(안전 차원)
    // 전역 game 인스턴스 가정 (위에서 생성됨)
    if (typeof game !== 'undefined') game.start();
  };

  // iOS 사파리 대비: touchstart에 preventDefault로 클릭 지연/취소 이슈 차단
  btn.addEventListener('touchstart', start, { passive: false });
  btn.addEventListener('click', start, { passive: false });
})();
