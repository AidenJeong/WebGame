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
