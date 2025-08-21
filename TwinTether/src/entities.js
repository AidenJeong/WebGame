// Entities: players, enemies, missiles, items, groups

class PlayerCircle {
  constructor(game, x, y, radius){
    this.game = game;
    this.pos = new Vec2(x,y);
    this.radius = radius;
    this.color = COL.player;
    this.invulUntil = 0; // seconds
  }
  hit(){
    const t = now();
    if(t < this.invulUntil) return false;
    this.game.damagePlayer(1);
    this.invulUntil = t + 0.5; // brief i-frames
    return true;
  }
  draw(ctx){
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, TAU);
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
    this.baseColor = (type===ENEMY_TYPE.NORMAL)?COL.enemyNormal:
                     (type===ENEMY_TYPE.SHOOTER)?COL.enemyShooter:COL.boss;
    this.blinkUntil = 0; // for shooter telegraph
    this.nextShotAt = now() + 3; // shooters only
    this.shotBlinkTime = 1; // shooters blink 1s before firing
    // For boss movement
    this.bossMoveTimer = 3;  // seconds of move
    this.bossStopTimer = 0;  // seconds of stop
    this.heading = rand(0, TAU);
    this.speed = 0; // set by group
    this.column = 0; // used when in formation (0 or 1 for 2열)
    th
