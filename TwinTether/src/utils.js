// Utility & Math
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a=0, b=1) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b+1));
const lerp = (a,b,t) => a + (b - a) * t;
const now = () => performance.now() / 1000;

class Vec2 {
  constructor(x=0, y=0){ this.x=x; this.y=y; }
  clone(){ return new Vec2(this.x, this.y); }
  set(x,y){ this.x=x; this.y=y; return this; }
  add(v){ this.x+=v.x; this.y+=v.y; return this; }
  sub(v){ this.x-=v.x; this.y-=v.y; return this; }
  mul(s){ this.x*=s; this.y*=s; return this; }
  len(){ return Math.hypot(this.x, this.y); }
  len2(){ return this.x*this.x + this.y*this.y; }
  norm(){ const l=this.len(); if(l>1e-6){ this.x/=l; this.y/=l; } return this; }
  dot(v){ return this.x*v.x + this.y*v.y; }
  perp(){ return new Vec2(-this.y, this.x); }
  angle(){ return Math.atan2(this.y, this.x); }
  static fromAngle(a, len=1){ return new Vec2(Math.cos(a)*len, Math.sin(a)*len); }
}

function segmentPointDistance(A, B, P){
  // returns shortest distance from P to segment AB
  const AB = new Vec2(B.x-A.x, B.y-A.y);
  const AP = new Vec2(P.x-A.x, P.y-A.y);
  const ab2 = AB.len2();
  let t = ab2 === 0 ? 0 : clamp( (AP.dot(AB)) / ab2, 0, 1 );
  const closest = new Vec2(A.x + AB.x*t, A.y + AB.y*t);
  const dx = P.x - closest.x, dy = P.y - closest.y;
  return Math.hypot(dx, dy);
}

function wrapAngle(a){
  while(a < -Math.PI) a += TAU;
  while(a > Math.PI) a -= TAU;
  return a;
}

// RNG helpers for consistent light drift
function randSign(){ return Math.random() < 0.5 ? -1 : 1; }

// Colors
const COL = {
  bg: "#0b0c10",
  line: "#48e9ff",
  lineDisabled: "#7a7a85",
  player: "#9ee37d",
  enemyNormal: "#ffcc33",
  enemyShooter: "#ff7b54",
  boss: "#b384ff",
  missile: "#ffffff",
  itemHearts: "#ff3b62",
  itemPower: "#46d3ff"
};

// Device info
function shortSide(w,h){ return Math.min(w,h); }
function longSide(w,h){ return Math.max(w,h); }

// PRNG for small choices (not seeded)
