// Pointer (multi-touch) manager: assigns touch to nearest player circle
class PointerManager {
  constructor(canvas, game){
    this.canvas = canvas;
    this.game = game;
    this.active = new Map(); // pointerId -> {id, target: 'A'|'B'}
    canvas.addEventListener('pointerdown', this.onDown, {passive:false});
    canvas.addEventListener('pointermove', this.onMove, {passive:false});
    canvas.addEventListener('pointerup', this.onUp, {passive:false});
    canvas.addEventListener('pointercancel', this.onUp, {passive:false});
    canvas.addEventListener('contextmenu', e=>e.preventDefault());
  }
  toGameXY(e){
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.canvas.width/rect.width);
    const y = (e.clientY - rect.top) * (this.canvas.height/rect.height);
    return new Vec2(x/this.game.dpr, y/this.game.dpr);
  }
  onDown = (e)=>{
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this.toGameXY(e);
    const g = this.game;
    // assign to nearest circle not already taken
    const dA = p.clone().sub(g.playerA.pos).len();
    const dB = p.clone().sub(g.playerB.pos).len();
    const takenA = [...this.active.values()].some(v=>v.target==='A');
    const takenB = [...this.active.values()].some(v=>v.target==='B');
    let target = null;
    if(!takenA && !takenB){
      target = (dA <= dB) ? 'A' : 'B';
    } else if(!takenA){
      target = 'A';
    } else if(!takenB){
      target = 'B';
    } else {
      // both taken -> choose nearest of the two owners? do nothing
      return;
    }
    this.active.set(e.pointerId, { id:e.pointerId, target });
    this.game.setPlayerPos(target, p);
  }
  onMove = (e)=>{
    if(!this.active.has(e.pointerId)) return;
    e.preventDefault();
    const p = this.toGameXY(e);
    const target = this.active.get(e.pointerId).target;
    this.game.setPlayerPos(target, p);
  }
  onUp = (e)=>{
    if(this.active.has(e.pointerId)){
      this.active.delete(e.pointerId);
    }
  }
}
