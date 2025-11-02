// UI helpers
function renderHearts(hearts,maxHearts){
  const cont = document.getElementById('hearts');
  cont.innerHTML = '';
  for(let i=0;i<maxHearts;i++){
    const span = document.createElement('span');
    if(i<hearts){ span.className='filled'; span.textContent='❤'; }
    else { span.className='empty'; span.textContent='♡'; }
    cont.appendChild(span);
  }
}
function setPowerLabel(n){
  //document.getElementById('powerLevel').textContent = 'Lines: ' + n;
}
function setWaveInfo(txt){
  //document.getElementById('waveInfo').textContent = txt || '';
}
function showOverlay(show){
  document.getElementById('overlay').classList.toggle('hidden', !show);
}
// 팝업 표시 시 캔버스 입력 차단, 닫힐 때 복구 (no optional chaining)
function showPopup(title, subtitle, onRetry){
  const el = document.getElementById('popup');
  const canvas = document.getElementById('game');

  el.style.position = 'fixed';
  el.style.inset = '0';
  el.style.zIndex = '9999';
  el.style.pointerEvents = 'auto';
  canvas.style.pointerEvents = 'none';

  el.classList.remove('hidden');
  el.innerHTML = '\
  <div class="panel">\
    <h2 style="margin:6px 0 10px;">'+title+'</h2>\
    <p style="opacity:.9; margin:0 0 14px;">'+(subtitle||'')+'</p>\
    <button id="retryBtn" style="background:#22c55e;color:#fff;border:none;padding:8px 12px;border-radius:8px;font-weight:700;cursor:pointer;">다시하기</button>\
  </div>';

  document.getElementById('retryBtn').onclick = function(){
    el.classList.add('hidden');
    canvas.style.pointerEvents = 'auto';
    if (onRetry) onRetry();
  };
}
