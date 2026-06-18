'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CW = 480, CH = 640;
const EB_SPD = 4;

const SHIPS = [
  { name:'FIGHTER',  color:'#00f5ff', shot:'single',  spd:5.5, rate:8,  desc:'Triple forward cannon.' },
  { name:'ATTACKER', color:'#ff6b35', shot:'spread',  spd:4.5, rate:10, desc:'5-way spread fire.' },
  { name:'BOMBER',   color:'#a8ff3e', shot:'missile', spd:4.0, rate:15, desc:'Heavy seeking missiles.' },
];

const EDEFS = {
  SCOUT:   { hp:1, pts:100,  spd:2.0, col:'#ff4444', sz:18 },
  FIGHTER: { hp:2, pts:200,  spd:1.5, col:'#ff8800', sz:24 },
  BOMBER:  { hp:4, pts:400,  spd:1.0, col:'#aa00ff', sz:32 },
  ACE:     { hp:6, pts:600,  spd:2.5, col:'#ff0088', sz:22 },
  GUNSHIP: { hp:8, pts:800,  spd:0.8, col:'#00cc44', sz:38 },
};

const PDEFS = {
  SPREAD:  { col:'#ffff00', lbl:'S',   fx:'spread'  },
  MISSILE: { col:'#ff6600', lbl:'M',   fx:'missile' },
  SHIELD:  { col:'#00aaff', lbl:'P',   fx:'shield'  },
  LIFE:    { col:'#ff0055', lbl:'1UP', fx:'life'    },
  SPEED:   { col:'#00ff88', lbl:'V',   fx:'speed'   },
};

// ─── AUDIO ────────────────────────────────────────────────────────────────────
class Audio {
  constructor() {
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e) { this.ctx = null; }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  _tone(freq, type, dur, vol=0.25, delay=0) {
    if (!this.ctx) return;
    try {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.connect(g); g.connect(this.ctx.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
      g.gain.setValueAtTime(vol, this.ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + delay + dur);
      o.start(this.ctx.currentTime + delay);
      o.stop(this.ctx.currentTime + delay + dur + 0.01);
    } catch(e) {}
  }
  shoot()       { this._tone(900,'square',0.04,0.18); this._tone(450,'square',0.04,0.09,0.03); }
  enemyShoot()  { this._tone(280,'sawtooth',0.07,0.12); }
  explode(big)  { this._tone(big?70:140,'sawtooth',big?0.5:0.2,big?0.45:0.28); }
  powerup()     { [440,660,880].forEach((f,i)=>this._tone(f,'sine',0.12,0.28,i*0.1)); }
  playerHit()   { this._tone(180,'sawtooth',0.35,0.4); }
  bossWarn()    { [0,1,2].forEach(i=>{ this._tone(440,'square',0.18,0.4,i*0.28); this._tone(220,'square',0.18,0.35,i*0.28+0.14); }); }
  gameOver()    { [440,350,250,160].forEach((f,i)=>this._tone(f,i<3?'square':'sawtooth',0.3+i*0.15,0.28,i*0.28)); }
  select()      { this._tone(660,'sine',0.1,0.3); this._tone(880,'sine',0.1,0.3,0.1); }
}

// ─── INPUT ────────────────────────────────────────────────────────────────────
class Input {
  constructor() {
    this.keys = {}; this.pressed = {};
    window.addEventListener('keydown', e => {
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
  }
  down(c)    { return !!this.keys[c]; }
  just(c)    { return !!this.pressed[c]; }
  flush()    { this.pressed = {}; }
}

// ─── PARTICLES ────────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, vx, vy, col, life, sz=3) {
    Object.assign(this, {x,y,vx,vy,col,life,maxLife:life,sz,dead:false});
  }
  update() {
    this.x+=this.vx; this.y+=this.vy;
    this.vy+=0.06; this.vx*=0.97;
    if (--this.life<=0) this.dead=true;
  }
  draw(ctx) {
    const a = this.life/this.maxLife;
    ctx.globalAlpha = a;
    ctx.fillStyle = this.col;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.sz*a, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

class Particles {
  constructor() { this.list = []; }
  burst(x, y, col, n=20, big=false) {
    for (let i=0;i<n;i++) {
      const a = Math.random()*Math.PI*2, spd=(big?3:1.5)+Math.random()*(big?4:2);
      this.list.push(new Particle(x,y,Math.cos(a)*spd,Math.sin(a)*spd-(big?2:1),col,20+Math.random()*25,(big?2.5:1.5)+Math.random()*2));
    }
    for (let i=0;i<n/2;i++) {
      const a=Math.random()*Math.PI*2, spd=1+Math.random()*3;
      this.list.push(new Particle(x,y,Math.cos(a)*spd,Math.sin(a)*spd,'#fff',12,1));
    }
  }
  smoke(x, y, col) {
    this.list.push(new Particle(x,y,(Math.random()-.5)*1.2,1+Math.random()*1.5,col,10,2));
  }
  update() { this.list=this.list.filter(p=>!p.dead); this.list.forEach(p=>p.update()); }
  draw(ctx) { this.list.forEach(p=>p.draw(ctx)); }
}

// ─── BACKGROUND ───────────────────────────────────────────────────────────────
class Background {
  constructor() {
    this.stars = Array.from({length:110}, ()=>({
      x: Math.random()*CW, y: Math.random()*CH,
      spd: 0.4+Math.random()*1.8,
      sz: Math.random()*1.8+0.4,
      br: 0.3+Math.random()*0.7,
    }));
    this.clouds = Array.from({length:6}, ()=>({
      x: Math.random()*CW, y: Math.random()*CH,
      w: 70+Math.random()*130, h: 18+Math.random()*35,
      spd: 0.2+Math.random()*0.4, a: 0.04+Math.random()*0.08,
    }));
  }
  update() {
    this.stars.forEach(s=>{ s.y+=s.spd; if(s.y>CH){s.y=0;s.x=Math.random()*CW;} });
    this.clouds.forEach(c=>{ c.y+=c.spd; if(c.y>CH+40){c.y=-40;c.x=Math.random()*CW;} });
  }
  draw(ctx) {
    const g=ctx.createLinearGradient(0,0,0,CH);
    g.addColorStop(0,'#000510'); g.addColorStop(0.6,'#000c1e'); g.addColorStop(1,'#000820');
    ctx.fillStyle=g; ctx.fillRect(0,0,CW,CH);
    this.stars.forEach(s=>{
      ctx.globalAlpha=s.br; ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(s.x,s.y,s.sz,0,Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha=1;
    this.clouds.forEach(c=>{
      ctx.globalAlpha=c.a; ctx.fillStyle='#3366cc';
      ctx.beginPath(); ctx.ellipse(c.x,c.y,c.w,c.h,0,0,Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha=1;
  }
}

// ─── BULLET ───────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, vx, vy, owner, type='normal') {
    this.x=x; this.y=y; this.vx=vx; this.vy=vy;
    this.owner=owner; this.type=type; this.dead=false;
    this.dmg = type==='missile' ? 3 : 1;
    this.w = type==='missile' ? 6 : (owner==='player' ? 3 : 5);
    this.h = type==='missile' ? 14 : (owner==='player' ? 14 : 7);
  }
  update() {
    this.x+=this.vx; this.y+=this.vy;
    if (this.y<-20||this.y>CH+20||this.x<-20||this.x>CW+20) this.dead=true;
  }
  bounds() { return {x:this.x-this.w/2, y:this.y-this.h/2, w:this.w, h:this.h}; }
  draw(ctx) {
    if (this.owner==='player') {
      if (this.type==='missile') {
        ctx.fillStyle='#ff6600';
        ctx.beginPath(); ctx.roundRect(this.x-3,this.y-7,6,14,3); ctx.fill();
        ctx.fillStyle='#ffff00';
        ctx.beginPath(); ctx.arc(this.x,this.y+8,3,0,Math.PI*2); ctx.fill();
        ctx.shadowColor='#ff6600'; ctx.shadowBlur=6;
        ctx.fillStyle='#ffaa00';
        ctx.beginPath(); ctx.arc(this.x,this.y+10,2,0,Math.PI*2); ctx.fill();
        ctx.shadowBlur=0;
      } else {
        ctx.shadowColor='#00f5ff'; ctx.shadowBlur=8;
        const gr=ctx.createLinearGradient(this.x,this.y-7,this.x,this.y+7);
        gr.addColorStop(0,'#fff'); gr.addColorStop(0.4,'#00f5ff'); gr.addColorStop(1,'transparent');
        ctx.fillStyle=gr; ctx.fillRect(this.x-1.5,this.y-7,3,14);
        ctx.fillStyle='#fff'; ctx.fillRect(this.x-.5,this.y-7,1,9);
        ctx.shadowBlur=0;
      }
    } else {
      ctx.shadowColor='#ff2200'; ctx.shadowBlur=5;
      ctx.fillStyle='#ff3333';
      ctx.beginPath(); ctx.arc(this.x,this.y,4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ffaaaa';
      ctx.beginPath(); ctx.arc(this.x,this.y,2,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    }
  }
}

// ─── MOVEMENT PATTERNS ────────────────────────────────────────────────────────
const PATTERNS = {
  straight(e)  { e.x+=e.vx; e.y+=e.vy; },
  zigzag(e)    { e._t=(e._t||0)+0.07; e.x+=Math.sin(e._t*3)*3; e.y+=e.vy; },
  swoop(e)     { e._t=(e._t||0)+0.025; e.x=e._sx+Math.sin(e._t*2)*120; e.y+=e.vy; },
  dive(e)      {
    e._ph=e._ph||0;
    if (e._ph===0) { e.y+=e.vy*0.6; if(e.y>110) e._ph=1; }
    else { const dx=e._tx-e.x,dy=e._ty-e.y,l=Math.hypot(dx,dy)||1; e.x+=dx/l*e.vy*2.2; e.y+=dy/l*e.vy*2.2; }
  },
  formation(e) { e._t=(e._t||0)+0.025; e.x+=e.vx+Math.sin(e._t)*1.5; e.y+=e.vy; },
  circle(e)    {
    e._a=(e._a||0)+0.035; e._cy=(e._cy||0)+0.4;
    e.x=e._sx+Math.cos(e._a)*90; e.y=e._cy+Math.sin(e._a)*40;
  },
};

// ─── ENEMY ────────────────────────────────────────────────────────────────────
class Enemy {
  constructor(type, x, y, pattern, player) {
    const d = EDEFS[type];
    Object.assign(this, {
      type, x, y, _sx:x, vx:0, vy:d.spd, col:d.col, sz:d.sz,
      hp:d.hp, maxHp:d.hp, pts:d.pts,
      pattern:pattern||'straight', player,
      bullets:[], dead:false, flash:0, _st:0,
      _shoot: 40+Math.random()*80, _t:0, _a:0,
      _ph:0, _tx:player?.x||CW/2, _ty:player?.y||CH-100,
      _cy: y,
    });
  }
  update() {
    this._t+=0.05;
    if (this.player) { this._tx=this.player.x; this._ty=this.player.y; }
    PATTERNS[this.pattern]?.(this);
    this._shoot--;
    if (this._shoot<=0 && this.y>-10 && this.y<CH-60) {
      this._shoot = 50+Math.random()*70;
      if (Math.random()<0.7) this._fire();
    }
    this.bullets.forEach(b=>b.update());
    this.bullets=this.bullets.filter(b=>!b.dead);
    if (this.flash>0) this.flash--;
    if (this.y>CH+80||this.x<-200||this.x>CW+200) this.dead=true;
  }
  _fire() {
    if (!this.player) return;
    const dx=this.player.x-this.x, dy=this.player.y-this.y, l=Math.hypot(dx,dy)||1;
    this.bullets.push(new Bullet(this.x,this.y+this.sz/2,(dx/l)*EB_SPD,(dy/l)*EB_SPD,'enemy'));
  }
  hit(dmg=1) {
    this.hp-=dmg; this.flash=8;
    if (this.hp<=0) { this.dead=true; return true; }
    return false;
  }
  bounds() { return {x:this.x-this.sz*.45,y:this.y-this.sz*.45,w:this.sz*.9,h:this.sz*.9}; }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x,this.y);
    const c = this.flash>0?'#fff':this.col;
    ctx.fillStyle=c; ctx.shadowColor=this.col; ctx.shadowBlur=this.flash>0?20:8;
    const s=this.sz/2;
    switch(this.type) {
      case 'SCOUT':
        ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*.8,s*.7); ctx.lineTo(0,s*.3); ctx.lineTo(-s*.8,s*.7); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#ff8800'; ctx.beginPath(); ctx.arc(0,s*.3,s*.22,0,Math.PI*2); ctx.fill(); break;
      case 'FIGHTER':
        ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s,.1); ctx.lineTo(s*.6,s); ctx.lineTo(-s*.6,s); ctx.lineTo(-s,.1); ctx.closePath(); ctx.fill();
        ctx.fillStyle='rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(0,-s*.1,s*.25,s*.35,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#ff4400'; ctx.beginPath(); ctx.arc(-s*.4,s*.6,s*.18,0,Math.PI*2); ctx.arc(s*.4,s*.6,s*.18,0,Math.PI*2); ctx.fill(); break;
      case 'BOMBER':
        ctx.beginPath(); ctx.moveTo(0,-s*.7); ctx.lineTo(s*1.2,s*.3); ctx.lineTo(s*.8,s); ctx.lineTo(-s*.8,s); ctx.lineTo(-s*1.2,s*.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(-s*.35,0,s*.7,s*.55);
        ctx.fillStyle='#aa44ff'; ctx.beginPath(); ctx.arc(-s*.5,s*.7,s*.15,0,Math.PI*2); ctx.arc(s*.5,s*.7,s*.15,0,Math.PI*2); ctx.fill(); break;
      case 'ACE':
        ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*.35,-s*.3); ctx.lineTo(s*1.1,s*.6);
        ctx.lineTo(s*.3,s*.3); ctx.lineTo(0,s*.7); ctx.lineTo(-s*.3,s*.3); ctx.lineTo(-s*1.1,s*.6); ctx.lineTo(-s*.35,-s*.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.15)'; ctx.beginPath(); ctx.ellipse(0,-s*.3,s*.18,s*.28,0,0,Math.PI*2); ctx.fill(); break;
      case 'GUNSHIP':
        ctx.beginPath(); ctx.roundRect(-s,-s*.65,s*2,s*1.7,4); ctx.fill();
        ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(-s*.75,-s*.25,s*.38,s*.7); ctx.fillRect(s*.37,-s*.25,s*.38,s*.7);
        ctx.fillStyle=c; ctx.fillRect(-s*.6,-s*.5,s*.12,s*.3); ctx.fillRect(s*.48,-s*.5,s*.12,s*.3);
        ctx.fillStyle='#00ff44'; ctx.beginPath(); ctx.arc(0,0,s*.2,0,Math.PI*2); ctx.fill(); break;
    }
    if (this.maxHp>1) {
      const bw=this.sz+8, bx=-bw/2, by=s+4;
      ctx.globalAlpha=.7; ctx.fillStyle='#222'; ctx.fillRect(bx,by,bw,3);
      ctx.fillStyle=this.hp>this.maxHp/2?'#00ff44':'#ff4400'; ctx.fillRect(bx,by,bw*(this.hp/this.maxHp),3);
      ctx.globalAlpha=1;
    }
    ctx.shadowBlur=0; ctx.restore();
    this.bullets.forEach(b=>b.draw(ctx));
  }
}

// ─── BOSS ─────────────────────────────────────────────────────────────────────
class Boss {
  constructor(level, player) {
    this.player=player; this.level=level;
    this.x=CW/2; this.y=-90; this.destY=130;
    this.w=120; this.h=90;
    const mhp=60+level*35;
    this.hp=mhp; this.maxHp=mhp;
    this.pts=5000+level*2000;
    this.bullets=[]; this.dead=false; this.entering=true;
    this.flash=0; this._t=0; this._ph=0; this._phTimer=0;
    this._tx=CW/2; this._atk=0; this._atkTimer=0;
    const cols=['#ff0088','#ff6600','#aa00ff','#00ff88','#ff2200'];
    this.col=cols[(level-1)%cols.length];
    this.name=`BOSS ${level}`;
  }
  update() {
    this._t+=0.03;
    if (this.entering) { this.y+=2.5; if(this.y>=this.destY){this.y=this.destY;this.entering=false;} return; }
    // Lateral movement
    this._phTimer++;
    if (this._phTimer>150) { this._phTimer=0; this._tx=80+Math.random()*(CW-160); }
    const dx=this._tx-this.x;
    if (Math.abs(dx)>2) this.x+=dx*0.022;
    this.y=this.destY+Math.sin(this._t)*22;
    // Shooting
    const rate=Math.max(18,55-this.level*4-Math.floor((1-this.hp/this.maxHp)*25));
    this._atkTimer++;
    if (this._atkTimer>=rate) { this._atkTimer=0; this._attack(); }
    this.bullets.forEach(b=>b.update());
    this.bullets=this.bullets.filter(b=>!b.dead);
    if (this.flash>0) this.flash--;
  }
  _aim(tx, ty, spd) {
    const dx=tx-this.x, dy=ty-this.y, l=Math.hypot(dx,dy)||1;
    this.bullets.push(new Bullet(this.x,this.y+50,(dx/l)*spd,(dy/l)*spd,'enemy'));
  }
  _attack() {
    const pat=this._atk%6; this._atk++;
    const px=this.player.x, py=this.player.y;
    if (pat===0) { this._aim(px,py,4.5); }
    else if (pat===1) { for(let i=-2;i<=2;i++) this.bullets.push(new Bullet(this.x,this.y+50,i*2.2,5,'enemy')); }
    else if (pat===2) { for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2; this.bullets.push(new Bullet(this.x,this.y,Math.cos(a)*3.5,Math.sin(a)*3.5,'enemy'));} }
    else if (pat===3) { [-40,0,40].forEach(off=>this._aim(px+off,py,4)); }
    else if (pat===4) { [0,1,2].forEach(i=>setTimeout(()=>{ if(!this.dead) this._aim(px,py,5.5); },i*140)); }
    else             { for(let i=0;i<12;i++){const a=(i/12)*Math.PI*2; this.bullets.push(new Bullet(this.x,this.y,Math.cos(a)*4,Math.sin(a)*4,'enemy'));} }
  }
  hit(dmg=1) {
    this.hp-=dmg; this.flash=7;
    if (this.hp<=0){this.dead=true; return true;}
    return false;
  }
  bounds() { return {x:this.x-52,y:this.y-38,w:104,h:80}; }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x,this.y);
    const c=this.flash>0?'#fff':this.col;
    ctx.fillStyle=c; ctx.shadowColor=this.col; ctx.shadowBlur=this.flash>0?30:18;
    // Main hull
    ctx.beginPath(); ctx.moveTo(0,-42); ctx.lineTo(52,-18); ctx.lineTo(62,18); ctx.lineTo(42,42); ctx.lineTo(-42,42); ctx.lineTo(-62,18); ctx.lineTo(-52,-18); ctx.closePath(); ctx.fill();
    // Wings
    ctx.beginPath(); ctx.moveTo(52,-8); ctx.lineTo(82,12); ctx.lineTo(72,42); ctx.lineTo(52,30); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-52,-8); ctx.lineTo(-82,12); ctx.lineTo(-72,42); ctx.lineTo(-52,30); ctx.closePath(); ctx.fill();
    // Cockpit
    ctx.fillStyle='#000';
    ctx.beginPath(); ctx.ellipse(0,-16,22,16,0,0,Math.PI*2); ctx.fill();
    const cg=ctx.createRadialGradient(0,-16,0,0,-16,20);
    cg.addColorStop(0,'rgba(200,50,255,.9)'); cg.addColorStop(1,'rgba(80,0,120,.2)');
    ctx.fillStyle=cg; ctx.beginPath(); ctx.ellipse(0,-16,18,13,0,0,Math.PI*2); ctx.fill();
    if (this.flash>0) { ctx.fillStyle='rgba(255,0,0,.5)'; ctx.beginPath(); ctx.ellipse(0,-16,18,13,0,0,Math.PI*2); ctx.fill(); }
    // Gun ports
    ctx.fillStyle='#111';
    ctx.fillRect(-28,30,14,18); ctx.fillRect(14,30,14,18); ctx.fillRect(-7,30,14,22);
    // Energy core
    const ca=0.5+0.5*Math.sin(this._t*6);
    ctx.fillStyle=`rgba(255,255,0,${ca})`;
    ctx.beginPath(); ctx.arc(0,10,14,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgba(255,200,0,${ca*.7})`;
    ctx.beginPath(); ctx.arc(0,10,8,0,Math.PI*2); ctx.fill();
    // Engine glow
    const th=0.8+0.2*Math.sin(this._t*10);
    ctx.fillStyle=`rgba(255,80,0,${th})`; ctx.shadowColor='#ff4400'; ctx.shadowBlur=15;
    ctx.beginPath(); ctx.arc(-32,42,9*th,0,Math.PI*2); ctx.arc(32,42,9*th,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.restore();
    // HP bar
    const bw=200, bh=12, bx=(CW-bw)/2, by=10;
    ctx.fillStyle='rgba(0,0,0,.75)'; ctx.fillRect(bx-2,by-2,bw+4,bh+4);
    ctx.fillStyle='#1a1a1a'; ctx.fillRect(bx,by,bw,bh);
    const r=this.hp/this.maxHp;
    ctx.fillStyle=r>.5?'#ff0044':r>.25?'#ff6600':'#ffff00';
    ctx.fillRect(bx,by,bw*r,bh);
    ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,bh);
    ctx.fillStyle='#fff'; ctx.font='bold 10px "Courier New"'; ctx.textAlign='center';
    ctx.fillText(this.name,CW/2,by+bh+13);
    this.bullets.forEach(b=>b.draw(ctx));
  }
}

// ─── POWER-UP ─────────────────────────────────────────────────────────────────
class PowerUp {
  constructor(x, y, type) {
    const d=PDEFS[type];
    Object.assign(this,{x,y,type,col:d.col,lbl:d.lbl,fx:d.fx,vy:1.8,dead:false,_t:0});
  }
  update() { this.y+=this.vy; this._t+=0.05; if(this.y>CH+30) this.dead=true; }
  bounds() { return {x:this.x-13,y:this.y-13,w:26,h:26}; }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this._t);
    const p=1+0.12*Math.sin(this._t*6);
    ctx.scale(p,p);
    ctx.shadowColor=this.col; ctx.shadowBlur=14;
    ctx.strokeStyle=this.col; ctx.lineWidth=2;
    ctx.fillStyle='rgba(0,0,0,.75)';
    ctx.beginPath(); ctx.moveTo(0,-13); ctx.lineTo(13,0); ctx.lineTo(0,13); ctx.lineTo(-13,0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.rotate(-this._t); ctx.scale(1/p,1/p);
    ctx.shadowBlur=0; ctx.fillStyle=this.col;
    ctx.font=`bold ${this.lbl.length>1?8:10}px "Courier New"`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(this.lbl,0,0);
    ctx.restore();
  }
}

// ─── PLAYER ───────────────────────────────────────────────────────────────────
class Player {
  constructor(idx, audio) {
    const d=SHIPS[idx];
    Object.assign(this,{
      def:d, audio, color:d.color, shot:d.shot,
      x:CW/2, y:CH-100, w:32, h:36,
      spd:d.spd, fireRate:d.rate, fireTimer:0,
      bullets:[], lives:3, power:1,
      shield:false, shieldTimer:0,
      invincible:false, invTimer:0,
      speedUp:false, speedTimer:0,
      blinkT:0, visible:true, dead:false, _t:0,
    });
  }
  update(inp) {
    const mv=this.spd*(this.speedUp?1.55:1);
    if ((inp.down('ArrowLeft')||inp.down('KeyA')) && this.x>this.w/2)    this.x-=mv;
    if ((inp.down('ArrowRight')||inp.down('KeyD')) && this.x<CW-this.w/2) this.x+=mv;
    if ((inp.down('ArrowUp')||inp.down('KeyW'))   && this.y>this.h/2)    this.y-=mv;
    if ((inp.down('ArrowDown')||inp.down('KeyS'))  && this.y<CH-this.h/2) this.y+=mv;
    if ((inp.down('Space')||inp.down('KeyZ')) && --this.fireTimer<=0) { this._fire(); this.fireTimer=this.fireRate; }
    this.bullets.forEach(b=>b.update()); this.bullets=this.bullets.filter(b=>!b.dead);
    if (this.invincible) {
      this.blinkT++; this.visible=Math.floor(this.blinkT/4)%2===0;
      if(--this.invTimer<=0){this.invincible=false;this.visible=true;this.blinkT=0;}
    }
    if (this.shield && --this.shieldTimer<=0) this.shield=false;
    if (this.speedUp && --this.speedTimer<=0) this.speedUp=false;
    this._t=(this._t||0)+0.3;
  }
  _fire() {
    this.audio.shoot();
    const x=this.x, y=this.y-this.h/2;
    if (this.shot==='single') {
      this.bullets.push(new Bullet(x,y,0,-13,'player','normal'));
      if(this.power>=2){this.bullets.push(new Bullet(x-13,y+4,0,-13,'player','normal'));this.bullets.push(new Bullet(x+13,y+4,0,-13,'player','normal'));}
      if(this.power>=3){this.bullets.push(new Bullet(x-22,y+9,-1.2,-12,'player','normal'));this.bullets.push(new Bullet(x+22,y+9,1.2,-12,'player','normal'));}
    } else if (this.shot==='spread') {
      const as=this.power===1?[0]:this.power===2?[-.25,0,.25]:[-.45,-.2,0,.2,.45];
      as.forEach(a=>this.bullets.push(new Bullet(x,y,Math.sin(a)*13,-Math.cos(a)*13,'player','normal')));
    } else {
      this.bullets.push(new Bullet(x-12,y,0,-9,'player','missile'));
      this.bullets.push(new Bullet(x+12,y,0,-9,'player','missile'));
      if(this.power>=2) this.bullets.push(new Bullet(x,y,0,-14,'player','normal'));
      if(this.power>=3){this.bullets.push(new Bullet(x-22,y+5,-.6,-9,'player','missile'));this.bullets.push(new Bullet(x+22,y+5,.6,-9,'player','missile'));}
    }
  }
  applyPowerUp(fx) {
    this.audio.powerup();
    if (fx==='spread'||fx==='missile') { this.shot=fx; this.power=Math.min(3,this.power+1); }
    else if (fx==='shield') { this.shield=true; this.shieldTimer=600; }
    else if (fx==='life')   { this.lives=Math.min(5,this.lives+1); }
    else if (fx==='speed')  { this.speedUp=true; this.speedTimer=480; }
  }
  hit(particles) {
    if (this.invincible||this.dead) return false;
    if (this.shield) { this.shield=false; this.shieldTimer=0; this.audio.playerHit(); return false; }
    this.audio.playerHit();
    particles.burst(this.x,this.y,'#fff',30,true);
    particles.burst(this.x,this.y,this.color,20);
    this.lives--;
    if (this.lives<=0) { this.dead=true; return true; }
    this.x=CW/2; this.y=CH-100;
    this.invincible=true; this.invTimer=130;
    this.power=Math.max(1,this.power-1);
    return false;
  }
  bounds() { return {x:this.x-10,y:this.y-12,w:20,h:24}; }
  draw(ctx) {
    if (!this.visible) return;
    const tf=0.7+0.3*Math.sin(this._t);
    ctx.fillStyle=`rgba(255,140,0,${tf})`;
    ctx.beginPath(); ctx.moveTo(this.x-6,this.y+14); ctx.lineTo(this.x-3,this.y+14+9*tf); ctx.lineTo(this.x,this.y+12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(this.x+6,this.y+14); ctx.lineTo(this.x+3,this.y+14+9*tf); ctx.lineTo(this.x,this.y+12); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ffff00'; ctx.beginPath(); ctx.arc(this.x-4,this.y+14,2,0,Math.PI*2); ctx.arc(this.x+4,this.y+14,2,0,Math.PI*2); ctx.fill();
    ctx.shadowColor=this.color; ctx.shadowBlur=12;
    ctx.fillStyle=this.color;
    ctx.beginPath();
    ctx.moveTo(this.x,this.y-18); ctx.lineTo(this.x+6,this.y-5); ctx.lineTo(this.x+14,this.y+4);
    ctx.lineTo(this.x+10,this.y+14); ctx.lineTo(this.x+4,this.y+9); ctx.lineTo(this.x,this.y+14);
    ctx.lineTo(this.x-4,this.y+9); ctx.lineTo(this.x-10,this.y+14); ctx.lineTo(this.x-14,this.y+4);
    ctx.lineTo(this.x-6,this.y-5); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#0a1a2e'; ctx.beginPath(); ctx.ellipse(this.x,this.y-8,4,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(140,220,255,.5)'; ctx.beginPath(); ctx.ellipse(this.x,this.y-8,3,5,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(this.x,this.y-4); ctx.lineTo(this.x-10,this.y+8); ctx.moveTo(this.x,this.y-4); ctx.lineTo(this.x+10,this.y+8); ctx.stroke();
    ctx.shadowBlur=0;
    if (this.shield) {
      const sa=0.3+0.2*Math.sin(Date.now()/180);
      ctx.strokeStyle=`rgba(0,170,255,${sa+0.4})`; ctx.lineWidth=2;
      ctx.shadowColor='#00aaff'; ctx.shadowBlur=18;
      ctx.beginPath(); ctx.ellipse(this.x,this.y,26,28,0,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle=`rgba(0,170,255,${sa*.3})`; ctx.fill();
      ctx.shadowBlur=0;
    }
    this.bullets.forEach(b=>b.draw(ctx));
  }
}

// ─── WAVE BUILDER ─────────────────────────────────────────────────────────────
function buildWave(waveNum) {
  const w=waveNum, groups=[];
  const pick=(...arr)=>arr[Math.floor(Math.random()*arr.length)];
  if (w<=2) {
    groups.push({type:'SCOUT',count:5+w,pattern:'straight',fromTop:true});
  } else if (w<=4) {
    groups.push({type:'SCOUT',count:4,pattern:'zigzag',fromTop:true});
    groups.push({type:'FIGHTER',count:2,pattern:'straight',fromTop:true,delay:60});
  } else if (w<=6) {
    groups.push({type:'FIGHTER',count:4,pattern:'formation',fromTop:true});
    groups.push({type:'SCOUT',count:3,pattern:'swoop',fromTop:true,delay:90});
  } else if (w<=8) {
    groups.push({type:'BOMBER',count:2,pattern:'straight',fromTop:true});
    groups.push({type:'FIGHTER',count:3,pattern:'zigzag',fromTop:true,delay:80});
  } else if (w<=11) {
    groups.push({type:pick('ACE','FIGHTER'),count:4,pattern:'swoop',fromTop:true});
    groups.push({type:'SCOUT',count:4,pattern:'circle',fromTop:true,delay:60});
  } else if (w<=14) {
    groups.push({type:'GUNSHIP',count:2,pattern:'straight',fromTop:true});
    groups.push({type:pick('ACE','BOMBER'),count:3,pattern:'zigzag',fromTop:true,delay:100});
  } else {
    groups.push({type:'ACE',count:3,pattern:'swoop',fromTop:true});
    groups.push({type:'GUNSHIP',count:2,pattern:'formation',fromTop:true,delay:60});
    groups.push({type:'BOMBER',count:2,pattern:'circle',fromTop:true,delay:120});
  }
  return groups;
}

// ─── COLLISION ────────────────────────────────────────────────────────────────
function overlaps(a, b) {
  return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
}

// ─── GAME ─────────────────────────────────────────────────────────────────────
class Game {
  constructor() {
    this.canvas=document.getElementById('gameCanvas');
    this.ctx=this.canvas.getContext('2d');
    this.audio=new Audio();
    this.input=new Input();
    this.state='select'; // select | playing | paused | gameover | boss_warning
    this.shipIdx=0;
    this.score=0;
    this.hiScore=parseInt(localStorage.getItem('sw_hi')||'0');
    this.waveNum=1;
    this.bossLevel=1;
    this.bg=new Background();
    this.particles=new Particles();
    this.player=null;
    this.enemies=[];
    this.powerUps=[];
    this.boss=null;
    this.bossMode=false;
    this.waveEnemiesLeft=0;
    this.waveTimer=0;
    this.spawnQueue=[];
    this.spawnTimer=0;
    this.warnTimer=0;
    this.pauseT=0;
    this.selectBlink=0;
    this._raf=null;
    this._last=0;
  }

  start() { this._loop(0); }

  _loop(ts) {
    this._raf=requestAnimationFrame(t=>this._loop(t));
    const dt=Math.min(ts-this._last,50); this._last=ts;
    if (dt<8) return;
    this._update();
    this._draw();
    this.input.flush();
  }

  _update() {
    this.bg.update();
    this.particles.update();

    if (this.state==='select') { this._updateSelect(); return; }
    if (this.state==='gameover') { this._updateGameOver(); return; }
    if (this.state==='boss_warning') { this._updateBossWarning(); return; }

    // Pause toggle
    if (this.input.just('KeyP')||this.input.just('Escape')) {
      this.state=this.state==='paused'?'playing':'paused';
    }
    if (this.state==='paused') return;

    // Playing
    this.player.update(this.input);

    // Spawn queue
    if (this.spawnQueue.length>0) {
      this.spawnTimer--;
      if (this.spawnTimer<=0) {
        const s=this.spawnQueue.shift();
        if (s) { this.enemies.push(s); this.spawnTimer=s._delay||25; }
      }
    }

    this.enemies.forEach(e=>e.update());
    this.enemies=this.enemies.filter(e=>!e.dead);
    if (this.boss) this.boss.update();
    this.powerUps.forEach(p=>p.update());
    this.powerUps=this.powerUps.filter(p=>!p.dead);

    this._checkCollisions();

    // Wave progression
    if (!this.bossMode) {
      if (this.enemies.length===0 && this.spawnQueue.length===0) {
        this.waveTimer++;
        if (this.waveTimer>90) {
          this.waveTimer=0;
          this.waveNum++;
          if (this.waveNum%5===0) { this._startBossWarning(); }
          else { this._startWave(); }
        }
      }
    } else if (this.boss && this.boss.dead) {
      this.score+=this.boss.pts;
      this.particles.burst(this.boss.x,this.boss.y,'#fff',60,true);
      this.particles.burst(this.boss.x,this.boss.y,this.boss.col,40,true);
      this.audio.explode(true);
      this._dropPowerUp(this.boss.x,this.boss.y);
      this._dropPowerUp(this.boss.x-40,this.boss.y+30);
      this.boss=null; this.bossMode=false;
      this.bossLevel++;
      this._startWave();
    }
  }

  _updateSelect() {
    this.selectBlink=(this.selectBlink+1)%60;
    if (this.input.just('ArrowLeft')||this.input.just('KeyA')) { this.shipIdx=(this.shipIdx+2)%3; this.audio.select(); }
    if (this.input.just('ArrowRight')||this.input.just('KeyD')) { this.shipIdx=(this.shipIdx+1)%3; this.audio.select(); }
    if (this.input.just('Enter')||this.input.just('Space')) {
      this.audio.resume();
      this._startGame();
    }
  }

  _updateGameOver() {
    if (this.input.just('Enter')||this.input.just('Space')) { this.state='select'; }
  }

  _updateBossWarning() {
    this.warnTimer--;
    if (this.warnTimer<=0) { this._startBoss(); }
  }

  _startGame() {
    this.score=0; this.waveNum=1; this.bossLevel=1;
    this.enemies=[]; this.powerUps=[]; this.boss=null;
    this.bossMode=false; this.spawnQueue=[];
    this.particles=new Particles();
    this.player=new Player(this.shipIdx,this.audio);
    this.state='playing';
    this._startWave();
  }

  _startWave() {
    const groups=buildWave(this.waveNum);
    this.spawnQueue=[];
    let delay=0;
    groups.forEach(g=>{
      const n=g.count;
      const spread=CW-80;
      for (let i=0;i<n;i++) {
        const x=40+((i/(Math.max(n-1,1)))*spread);
        const y=-30-(Math.floor(i/5)*50);
        const e=new Enemy(g.type,x,y,g.pattern,this.player);
        e._sx=x; e._cy=y;
        e._delay=(g.delay||0)+(i*20)+delay;
        this.spawnQueue.push(e);
      }
      delay+=(g.delay||0)+n*20+40;
    });
    this.spawnTimer=1;
  }

  _startBossWarning() {
    this.enemies=[]; this.spawnQueue=[];
    this.state='boss_warning';
    this.warnTimer=180;
    this.audio.bossWarn();
  }

  _startBoss() {
    this.bossMode=true;
    this.boss=new Boss(this.bossLevel,this.player);
    this.state='playing';
  }

  _dropPowerUp(x, y) {
    const types=Object.keys(PDEFS);
    const weights=[3,3,4,1,2]; // weighted drop
    let total=weights.reduce((a,b)=>a+b,0), r=Math.random()*total;
    let idx=0;
    for(;idx<weights.length-1;idx++){r-=weights[idx];if(r<=0)break;}
    this.powerUps.push(new PowerUp(x,y,types[idx]));
  }

  _checkCollisions() {
    const pb=this.player.bounds();

    // Player bullets vs enemies
    this.player.bullets.forEach(b=>{
      if(b.dead) return;
      const bb=b.bounds();
      this.enemies.forEach(e=>{
        if(e.dead) return;
        if(overlaps(bb,e.bounds())){
          if(e.hit(b.dmg)){
            this.score+=e.pts;
            this.particles.burst(e.x,e.y,e.col,18);
            this.audio.explode(false);
            if(Math.random()<0.2) this._dropPowerUp(e.x,e.y);
          }
          b.dead=true;
        }
      });
      if(this.boss && !this.boss.dead){
        if(overlaps(bb,this.boss.bounds())){
          this.boss.hit(b.dmg);
          if(b.dmg>1) this.particles.burst(b.x,b.y,'#ff6600',8);
          b.dead=true;
        }
      }
    });

    // Enemy bullets vs player
    this.enemies.forEach(e=>{
      e.bullets.forEach(b=>{ if(b.dead)return; if(overlaps(b.bounds(),pb)){b.dead=true;this.player.hit(this.particles);} });
    });
    if (this.boss) {
      this.boss.bullets.forEach(b=>{ if(b.dead)return; if(overlaps(b.bounds(),pb)){b.dead=true;this.player.hit(this.particles);} });
    }

    // Enemies vs player (collision)
    this.enemies.forEach(e=>{ if(!e.dead && overlaps(e.bounds(),pb)){e.dead=true;this.player.hit(this.particles);} });

    // Power-ups vs player
    this.powerUps.forEach(p=>{ if(!p.dead && overlaps(p.bounds(),pb)){p.dead=true;this.player.applyPowerUp(p.fx);} });

    if (this.player.dead) { this._endGame(); }
  }

  _endGame() {
    if (this.score>this.hiScore) { this.hiScore=this.score; localStorage.setItem('sw_hi',this.hiScore); }
    this.audio.gameOver();
    this.state='gameover';
  }

  // ─── DRAW ──────────────────────────────────────────────────────────────────
  _draw() {
    const ctx=this.ctx;
    this.bg.draw(ctx);
    if (this.state==='select')   { this._drawSelect(ctx); return; }
    if (this.state==='gameover') { this._drawGameOver(ctx); return; }

    this.particles.draw(ctx);
    this.enemies.forEach(e=>e.draw(ctx));
    if (this.boss) this.boss.draw(ctx);
    this.powerUps.forEach(p=>p.draw(ctx));
    if (!this.player.dead) this.player.draw(ctx);

    if (this.state==='boss_warning') { this._drawBossWarning(ctx); }
    if (this.state==='paused')       { this._drawPause(ctx); }

    this._drawHUD(ctx);
  }

  _drawSelect(ctx) {
    // Title
    ctx.shadowColor='#00f5ff'; ctx.shadowBlur=30;
    ctx.fillStyle='#00f5ff'; ctx.font='bold 52px "Courier New"';
    ctx.textAlign='center'; ctx.fillText('SONIC WINGS',CW/2,120);
    ctx.fillStyle='#fff'; ctx.font='bold 22px "Courier New"';
    ctx.fillText('ni Jessie',CW/2,158);
    ctx.shadowBlur=0;
    ctx.fillStyle='#556'; ctx.font='12px "Courier New"';
    ctx.fillText('ARCADE SHOOTER',CW/2,185);

    ctx.fillStyle='#fff'; ctx.font='bold 13px "Courier New"';
    ctx.fillText('SELECT YOUR FIGHTER',CW/2,240);

    const sx=[100,240,380];
    SHIPS.forEach((s,i)=>{
      const x=sx[i], sel=i===this.shipIdx;
      ctx.shadowBlur=sel?20:0; ctx.shadowColor=s.color;
      // Simple ship preview
      ctx.fillStyle=sel?s.color:'rgba(100,100,120,.5)';
      ctx.strokeStyle=s.color; ctx.lineWidth=sel?2:1;
      ctx.beginPath(); ctx.moveTo(x,290); ctx.lineTo(x+10,310); ctx.lineTo(x+6,322); ctx.lineTo(x,318); ctx.lineTo(x-6,322); ctx.lineTo(x-10,310); ctx.closePath();
      if(sel) ctx.fill(); ctx.stroke();
      // Thruster
      if(sel){ctx.fillStyle='#ff8800';ctx.beginPath();ctx.arc(x,323,3,0,Math.PI*2);ctx.fill();}
      ctx.shadowBlur=0;
      // Name
      ctx.fillStyle=sel?s.color:'#556'; ctx.font=`bold ${sel?13:11}px "Courier New"`; ctx.textAlign='center';
      ctx.fillText(s.name,x,345);
      ctx.fillStyle=sel?'#aaa':'#333'; ctx.font='10px "Courier New"';
      ctx.fillText(s.desc,x,362);
      if(sel){ctx.fillStyle='#00f5ff';ctx.fillText('▲ SELECTED',x,378);}
    });

    ctx.fillStyle='#aaa'; ctx.font='11px "Courier New"'; ctx.textAlign='center';
    ctx.fillText('← → to choose ship',CW/2,415);

    const blink=this.selectBlink<35;
    if(blink){
      ctx.fillStyle='#fff'; ctx.shadowColor='#fff'; ctx.shadowBlur=8;
      ctx.font='bold 15px "Courier New"';
      ctx.fillText('[ PRESS ENTER TO START ]',CW/2,460);
      ctx.shadowBlur=0;
    }

    ctx.fillStyle='#334'; ctx.font='11px "Courier New"';
    ctx.fillText(`HI-SCORE  ${String(this.hiScore).padStart(8,'0')}`,CW/2,510);

    ctx.fillStyle='#223'; ctx.font='10px "Courier New"';
    ctx.fillText('WASD/Arrows:Move  Space/Z:Fire  P:Pause',CW/2,555);
  }

  _drawHUD(ctx) {
    const p=this.player;
    ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(0,0,CW,38);
    ctx.fillStyle='#fff'; ctx.font='bold 13px "Courier New"'; ctx.textAlign='left';
    ctx.fillText(`SCORE ${String(this.score).padStart(8,'0')}`,8,20);
    ctx.fillStyle='#aaa'; ctx.font='11px "Courier New"'; ctx.textAlign='center';
    ctx.fillText(`HI ${String(this.hiScore).padStart(8,'0')}`,CW/2,20);
    ctx.fillStyle='#aaa'; ctx.textAlign='right';
    ctx.fillText(this.bossMode?`BOSS ${this.bossLevel}`:`WAVE ${this.waveNum}`,CW-8,20);
    for (let i=0;i<p.lives;i++) {
      const lx=10+i*26, ly=30;
      ctx.fillStyle=p.color; ctx.shadowColor=p.color; ctx.shadowBlur=6;
      ctx.beginPath(); ctx.moveTo(lx+8,ly-8); ctx.lineTo(lx+4,ly-2); ctx.lineTo(lx+4,ly+5); ctx.lineTo(lx+12,ly+5); ctx.lineTo(lx+12,ly-2); ctx.closePath(); ctx.fill();
      ctx.shadowBlur=0;
    }
    ctx.fillStyle='#777'; ctx.font='10px "Courier New"'; ctx.textAlign='right';
    ctx.fillText(`PWR${p.power}`,CW-8,34);
    if (p.shield){
      ctx.fillStyle='#00aaff'; ctx.font='10px "Courier New"'; ctx.textAlign='left';
      ctx.fillText('■ SHIELD',8,CH-8);
    }
    if (p.speedUp){
      ctx.fillStyle='#00ff88'; ctx.font='10px "Courier New"'; ctx.textAlign='left';
      ctx.fillText('■ SPEED+',p.shield?90:8,CH-8);
    }
  }

  _drawBossWarning(ctx) {
    const blink=Math.floor(this.warnTimer/8)%2===0;
    if (blink) {
      ctx.fillStyle='rgba(255,0,40,.15)'; ctx.fillRect(0,0,CW,CH);
      ctx.fillStyle='#ff0040'; ctx.shadowColor='#ff0040'; ctx.shadowBlur=25;
      ctx.font='bold 40px "Courier New"'; ctx.textAlign='center';
      ctx.fillText('WARNING!',CW/2,CH/2-20);
      ctx.font='bold 20px "Courier New"';
      ctx.fillText('BOSS APPROACHING',CW/2,CH/2+20);
      ctx.shadowBlur=0;
    }
  }

  _drawPause(ctx) {
    ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(0,0,CW,CH);
    ctx.fillStyle='#fff'; ctx.shadowColor='#00f5ff'; ctx.shadowBlur=18;
    ctx.font='bold 36px "Courier New"'; ctx.textAlign='center';
    ctx.fillText('PAUSED',CW/2,CH/2);
    ctx.shadowBlur=0;
    ctx.fillStyle='#aaa'; ctx.font='13px "Courier New"';
    ctx.fillText('Press P to Resume',CW/2,CH/2+35);
  }

  _drawGameOver(ctx) {
    ctx.fillStyle='rgba(0,0,0,.7)'; ctx.fillRect(0,0,CW,CH);
    ctx.fillStyle='#ff2244'; ctx.shadowColor='#ff0022'; ctx.shadowBlur=30;
    ctx.font='bold 44px "Courier New"'; ctx.textAlign='center';
    ctx.fillText('GAME OVER',CW/2,200);
    ctx.shadowBlur=0;
    ctx.fillStyle='#fff'; ctx.font='bold 18px "Courier New"';
    ctx.fillText(`SCORE  ${String(this.score).padStart(8,'0')}`,CW/2,280);
    ctx.fillStyle='#ffaa00'; ctx.font='14px "Courier New"';
    ctx.fillText(`HI-SCORE  ${String(this.hiScore).padStart(8,'0')}`,CW/2,312);
    if (this.score>=this.hiScore && this.score>0) {
      ctx.fillStyle='#ffff00'; ctx.shadowColor='#ffff00'; ctx.shadowBlur=10;
      ctx.font='bold 14px "Courier New"';
      ctx.fillText('NEW HIGH SCORE!',CW/2,342);
      ctx.shadowBlur=0;
    }
    ctx.fillStyle='#aaa'; ctx.font='13px "Courier New"';
    ctx.fillText(`WAVE REACHED: ${this.waveNum}`,CW/2,375);
    const blink=Math.floor(Date.now()/600)%2===0;
    if(blink){ctx.fillStyle='#fff';ctx.font='bold 15px "Courier New"';ctx.fillText('[ PRESS ENTER TO RETRY ]',CW/2,430);}
  }
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
const game = new Game();
game.start();
