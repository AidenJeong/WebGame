// Pointer (multi-touch) manager with robust mobile fallback (no class fields)
class PointerManager {
  constructor(canvas, game){
    this.canvas = canvas;
    this.game = game;
    this.active = new Map(); // id -> {id, target: 'A'|'B'}
    this.supportsPointer = !!window.PointerEvent;

    // bind methods (for older Safari)
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp   = this.onPointerUp.bind(this);
    this.onTouchStart  = this.onTouchStart.bind(this);
    this.onTouchMove   = this.onTouchMove.bind(this);
    this.onTouchEnd    = this.onTouchEnd.bind(this);

    if (this.supportsPointer) {
      canvas.addEventListener('pointerdown', this.onPointerDown, {passive:false});
      canvas.addEventListener('pointermove', this.onPointerMove, {passive:false});
      canvas.addEventListener('pointerup', this.onPointerUp, {passive:false});
      canvas.addEventListener('pointercancel', this.onPointerUp, {passive:false});
    } else {
      // Touch fallback (older iOS/WebView)
      canvas.addEventListener('touchstart', this.onTouchStart, {passive:false});
      canvas.addEventListener('touchmove', this.onTouchMove, {passive:false});
      canvas.addEventListener('touchend', this.onTouchEnd, {passive:false});
      canvas.addEventListener('touchcancel', this.onTouchEnd, {passive:false});
    }

    canvas.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  }

  // --- coords helpers ---
  _rect(){ return this.canvas.getBoundingClientRect(); }
  toGameXYClient(clientX, clientY){
    const rect = this._rect();
    const x = (clientX - rect.left) * (this.canvas.width/rect.width);
    const y = (clientY - rect.top) * (this.canvas.height/rect.height);
    return new Vec2(x/this.game.dpr, y/this.game.dpr);
  }

  // --- assignment helper ---
  _assignTarget(p){
    const g = this.game;
    const dA = p.clone().sub(g.playerA.pos).len();
    const dB = p.clone().sub(g.playerB.pos).len();
    var takenA = false, takenB = false;
    this.active.forEach(function(v){ if(v.target==='A') takenA=true; if(v.target==='B') takenB=true; });
    const takeLength = this.game.playerRadius * 3;
    if(!takenA && !takenB) {
      if (dA <= dB && dA <= takeLength) {
        return 'A';
      } 
      if (dB <= dA && dB <= takeLength) {
        return 'B';
      }
    } 
    if(!takenA && dA <= takeLength) return 'A';
    if(!takenB && dB <= takeLength) return 'B';
    return null;
  }

  // --- Pointer Events path ---
  onPointerDown(e){
    e.preventDefault();
    const p = this.toGameXYClient(e.clientX, e.clientY);
    const target = this._assignTarget(p);
    if(!target) return;

    // IMPORTANT: 터치에서는 setPointerCapture 사용 안 함 (iOS Safari 이슈 회피)
    if(e.pointerType !== 'touch' && this.canvas.setPointerCapture){
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_){}
    }
    this.active.set(e.pointerId, { id:e.pointerId, target:target });
    this.game.setPlayerPos(target, p);
  }
  onPointerMove(e){
    if(!this.active.has(e.pointerId)) return;
    e.preventDefault();
    const p = this.toGameXYClient(e.clientX, e.clientY);
    const target = this.active.get(e.pointerId).target;
    this.game.setPlayerPos(target, p);
  }
  onPointerUp(e){
    if(this.active.has(e.pointerId)){
      this.active.delete(e.pointerId);
    }
  }

  // --- Touch Events fallback ---
  onTouchStart(e){
    e.preventDefault();
    for (var i=0;i<e.changedTouches.length;i++){
      const t = e.changedTouches[i];
      const id = t.identifier;
      const p = this.toGameXYClient(t.clientX, t.clientY);
      const target = this._assignTarget(p);
      if(!target) continue;
      this.active.set(id, { id:id, target:target });
      this.game.setPlayerPos(target, p);
    }
  }
  onTouchMove(e){
    e.preventDefault();
    for (var i=0;i<e.changedTouches.length;i++){
      const t = e.changedTouches[i];
      const id = t.identifier;
      if(!this.active.has(id)) continue;
      const p = this.toGameXYClient(t.clientX, t.clientY);
      const target = this.active.get(id).target;
      this.game.setPlayerPos(target, p);
    }
  }
  onTouchEnd(e){
    e.preventDefault();
    for (var i=0;i<e.changedTouches.length;i++){
      const id = e.changedTouches[i].identifier;
      if(this.active.has(id)) this.active.delete(id);
    }
  }
}
