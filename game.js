'use strict';
// ============================================================
// CAVE RUSH — Deep Earth Exploration Drone
// ============================================================

const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');

// ── Globals (set by resize) ──────────────────────────────────
let W, H, DRONE_Y;

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  DRONE_Y = Math.round(H * 0.72);   // drone screen Y (fixed position)
  if (G) G.onResize();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ── Config ───────────────────────────────────────────────────
const CFG = {
  SEG_H:         4,       // cave segment height px
  BASE_SCROLL:   2.6,     // px / frame base speed
  LVL_INC:       0.10,    // +10% scroll per level
  DRONE_SPD:     4.0,
  SLOW_MULT:     0.40,
  SLOW_DRAIN:    0.50,
  SLOW_REGEN:    0.16,
  SLOW_MAX:      100,
  LEVEL_TIME:    90,      // seconds
  MIN_GAP_L1:    175,
  MAX_GAP:       310,
  GAP_STEP:      12,      // gap reduction per level
  WALL_LINES:    8,
  PU_CHANCE:     0.0006,  // per-frame spawn chance
  PU_AHEAD_MIN:  250,
  PU_AHEAD_MAX:  600,
  SHIELD_MS:     8000,
  INVINCIBLE_MS: 2200,
  MAX_LIVES:     5,
};

// ── Utility ──────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand  = (a, b)      => a + Math.random() * (b - a);
const lerp  = (a, b, t)   => a + (b - a) * t;

// ── Input ────────────────────────────────────────────────────
const KEY = { left:false, right:false, up:false, down:false, slow:false };

window.addEventListener('keydown', e => {
  applyKey(e.key, true);
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
});
window.addEventListener('keyup',   e => applyKey(e.key, false));

function applyKey(k, v) {
  if (k==='ArrowLeft'  || k==='a' || k==='A') KEY.left  = v;
  if (k==='ArrowRight' || k==='d' || k==='D') KEY.right = v;
  if (k==='ArrowUp'    || k==='w' || k==='W') KEY.up    = v;
  if (k==='ArrowDown'  || k==='s' || k==='S') KEY.down  = v;
  if (k===' ' || k==='Shift') KEY.slow = v;
}

// ── Cave ─────────────────────────────────────────────────────
class Cave {
  constructor(level) {
    this.level   = level;
    this.segs    = [];      // [{left, right}, …]
    this.scroll  = 0;       // total px scrolled

    // generation state
    this.gC  = W / 2;       // center
    this.gG  = Math.min(CFG.MAX_GAP, W * 0.58);
    this.gCV = 0;           // center velocity
    this.gGV = 0;           // gap velocity

    const red = (level - 1) * CFG.GAP_STEP;
    this.minGap = Math.max(90, CFG.MIN_GAP_L1 - red);
    this.maxGap = Math.max(this.minGap + 60, CFG.MAX_GAP - red * 0.4);

    // pre-generate enough for first frame
    const need = Math.ceil((DRONE_Y + 60) / CFG.SEG_H) + 50;
    for (let i = 0; i < need; i++) this._gen();
  }

  _gen() {
    this.gCV += rand(-2.0, 2.0);
    this.gCV  = clamp(this.gCV * 0.87, -4.5, 4.5);
    this.gC  += this.gCV;

    this.gGV += rand(-1.6, 1.6);
    this.gGV  = clamp(this.gGV * 0.91, -3, 3);
    this.gG  += this.gGV;

    const half = this.gG / 2;
    this.gC = clamp(this.gC, half + 18, W - half - 18);
    this.gG = clamp(this.gG, this.minGap, this.maxGap);

    this.segs.push({ left: this.gC - half, right: this.gC + half });
  }

  // segment index for a given screen Y
  _idx(screenY) {
    return Math.floor((this.scroll + DRONE_Y - screenY) / CFG.SEG_H);
  }

  segAt(screenY) {
    const i = this._idx(screenY);
    if (i < 0) return { left: 0, right: W };
    while (i >= this.segs.length) this._gen();
    return this.segs[Math.min(i, this.segs.length - 1)];
  }

  update(spd) {
    this.scroll += spd;
    const maxNeeded = Math.ceil((this.scroll + DRONE_Y + CFG.SEG_H * 30) / CFG.SEG_H);
    while (this.segs.length < maxNeeded) this._gen();
  }

  draw() {
    // background — deep space-cave
    ctx.fillStyle = '#000509';
    ctx.fillRect(0, 0, W, H);

    // collect wall positions in screen-space
    const leftPts  = [];
    const rightPts = [];
    for (let sy = -CFG.SEG_H; sy <= H + CFG.SEG_H; sy += CFG.SEG_H) {
      const s = this.segAt(sy);
      leftPts.push([s.left, sy]);
      rightPts.push([s.right, sy]);
    }

    // fill wall areas (very dark rock)
    ctx.fillStyle = '#02020f';
    ctx.beginPath();
    ctx.moveTo(0, -CFG.SEG_H);
    for (const [x, y] of leftPts)  ctx.lineTo(x, y);
    ctx.lineTo(0, H + CFG.SEG_H);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(W, -CFG.SEG_H);
    for (const [x, y] of rightPts) ctx.lineTo(x, y);
    ctx.lineTo(W, H + CFG.SEG_H);
    ctx.closePath();
    ctx.fill();

    // parallel wall-texture lines (the defining visual)
    const lineColors = [
      [0, 210, 255, 0.85],  // innermost — bright cyan
      [0, 185, 230, 0.52],
      [0, 160, 210, 0.30],
      [0, 130, 190, 0.18],
      [0, 100, 160, 0.10],
      [0,  75, 130, 0.07],
      [0,  55, 110, 0.04],
      [0,  40,  90, 0.02],
    ];

    for (let l = 0; l < CFG.WALL_LINES; l++) {
      const [r, g, b, a] = lineColors[l] || [0, 30, 80, 0.01];
      const off  = l * 5;
      ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
      ctx.lineWidth   = l === 0 ? 1.8 : 0.9;

      ctx.beginPath();
      for (let i = 0; i < leftPts.length; i++) {
        const [x, y] = leftPts[i];
        i === 0 ? ctx.moveTo(x + off, y) : ctx.lineTo(x + off, y);
      }
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i < rightPts.length; i++) {
        const [x, y] = rightPts[i];
        i === 0 ? ctx.moveTo(x - off, y) : ctx.lineTo(x - off, y);
      }
      ctx.stroke();
    }

    // inner-edge glow (subtle bloom)
    ctx.save();
    ctx.shadowBlur  = 10;
    ctx.shadowColor = 'rgba(0,200,255,0.6)';
    ctx.strokeStyle = 'rgba(0,200,255,0.18)';
    ctx.lineWidth   = 3;

    ctx.beginPath();
    for (let i = 0; i < leftPts.length; i++) {
      const [x, y] = leftPts[i];
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < rightPts.length; i++) {
      const [x, y] = rightPts[i];
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// ── Drone ────────────────────────────────────────────────────
class Drone {
  constructor() {
    this.x   = W / 2;
    this.y   = DRONE_Y;
    this.vx  = 0;
    this.vy  = 0;
    this.lives       = 3;
    this.shield      = false;
    this.shieldMs    = 0;
    this.invincible  = false;
    this.invincMs    = 0;
    this.tilt        = 0;
    this.thrustPh    = 0;
    this.W           = 30;   // half-width for collision
    this.H           = 17;   // half-height
  }

  update(dt) {
    const spd = CFG.DRONE_SPD;

    if (KEY.left)  this.vx -= 1.3;
    if (KEY.right) this.vx += 1.3;
    if (KEY.up)    this.vy -= 0.75;
    if (KEY.down)  this.vy += 0.75;

    this.vx = clamp(this.vx * 0.80, -spd, spd);
    this.vy = clamp(this.vy * 0.80, -spd * 0.55, spd * 0.55);

    this.x += this.vx;
    this.y += this.vy;

    this.x = clamp(this.x, this.W + 5, W - this.W - 5);
    this.y = clamp(this.y, H * 0.25, H * 0.88);

    this.tilt     = lerp(this.tilt, this.vx * 0.055, 0.22);
    this.thrustPh += 0.28;

    if (this.shield) {
      this.shieldMs -= dt;
      if (this.shieldMs <= 0) { this.shield = false; this.shieldMs = 0; }
    }
    if (this.invincible) {
      this.invincMs -= dt;
      if (this.invincMs <= 0) { this.invincible = false; this.invincMs = 0; }
    }
  }

  draw() {
    // blink during invincibility
    if (this.invincible && Math.floor(Date.now() / 90) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tilt);

    const tw = this.W;
    const th = this.H;

    // thruster flame (bottom = back of ship; ship points UP)
    const flicker  = 0.65 + 0.35 * Math.sin(this.thrustPh);
    const flameLng = (14 + 12 * flicker) * (KEY.up ? 1.6 : 1);
    const fg = ctx.createRadialGradient(0, th, 0, 0, th + flameLng * 0.5, flameLng);
    fg.addColorStop(0,   `rgba(255,210,60,${0.95 * flicker})`);
    fg.addColorStop(0.35,`rgba(255,100,20,${0.7 * flicker})`);
    fg.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.ellipse(0, th + flameLng * 0.45, 6, flameLng * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // secondary side thrusters
    [-1, 1].forEach(side => {
      const sf = ctx.createRadialGradient(side * tw * 0.48, th * 0.3, 0,
                                          side * tw * 0.48, th * 0.3, 8);
      sf.addColorStop(0, `rgba(80,180,255,${0.5 * flicker})`);
      sf.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sf;
      ctx.beginPath();
      ctx.arc(side * tw * 0.48, th * 0.3, 7, 0, Math.PI * 2);
      ctx.fill();
    });

    // ship body (pointing up — Defender style)
    ctx.fillStyle = '#1a3e8c';
    ctx.beginPath();
    ctx.moveTo(0,      -th);            // nose
    ctx.lineTo(tw*0.42,-th*0.28);
    ctx.lineTo(tw*0.52, th*0.18);
    ctx.lineTo(tw*0.30, th*0.55);
    ctx.lineTo(-tw*0.30, th*0.55);
    ctx.lineTo(-tw*0.52, th*0.18);
    ctx.lineTo(-tw*0.42,-th*0.28);
    ctx.closePath();
    ctx.fill();

    // body midtone
    ctx.fillStyle = '#2a5cc0';
    ctx.beginPath();
    ctx.moveTo(0,       -th*0.9);
    ctx.lineTo(tw*0.28, -th*0.2);
    ctx.lineTo(tw*0.34,  th*0.15);
    ctx.lineTo(0,        th*0.25);
    ctx.lineTo(-tw*0.34, th*0.15);
    ctx.lineTo(-tw*0.28,-th*0.2);
    ctx.closePath();
    ctx.fill();

    // wing stubs
    ctx.fillStyle = '#122a66';
    // left
    ctx.beginPath();
    ctx.moveTo(-tw*0.45,-th*0.05);
    ctx.lineTo(-tw*0.95, th*0.28);
    ctx.lineTo(-tw*0.30, th*0.42);
    ctx.closePath();
    ctx.fill();
    // right
    ctx.beginPath();
    ctx.moveTo(tw*0.45,-th*0.05);
    ctx.lineTo(tw*0.95, th*0.28);
    ctx.lineTo(tw*0.30, th*0.42);
    ctx.closePath();
    ctx.fill();

    // wing accents
    ctx.strokeStyle = '#4488ff';
    ctx.lineWidth   = 0.8;
    ctx.beginPath();
    ctx.moveTo(-tw*0.45,-th*0.05);
    ctx.lineTo(-tw*0.95, th*0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tw*0.45,-th*0.05);
    ctx.lineTo(tw*0.95, th*0.28);
    ctx.stroke();

    // cockpit
    ctx.fillStyle = '#88eeff';
    ctx.shadowBlur  = 6;
    ctx.shadowColor = '#44ccff';
    ctx.beginPath();
    ctx.ellipse(0, -th*0.28, tw*0.16, th*0.22, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // engine ports
    [-tw*0.28, 0, tw*0.28].forEach(ex => {
      ctx.fillStyle = `rgba(255,180,50,${0.5 + 0.4 * flicker})`;
      ctx.beginPath();
      ctx.ellipse(ex, th*0.52, 3.5, 2.5, 0, 0, Math.PI*2);
      ctx.fill();
    });

    // shield bubble
    if (this.shield) {
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() * 0.004));
      ctx.strokeStyle = `rgba(80,200,255,${0.3 + 0.35 * pulse})`;
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 12;
      ctx.shadowColor = '#44aaff';
      ctx.beginPath();
      ctx.ellipse(0, 0, tw * 0.95, th * 1.4, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(80,200,255,${0.08 * pulse})`;
      ctx.lineWidth   = 10;
      ctx.stroke();
      ctx.shadowBlur  = 0;
    }

    ctx.restore();
  }

  collidesWith(cave) {
    if (this.invincible || this.shield) return false;
    const seg = cave.segAt(this.y);
    return (this.x - this.W * 0.44 < seg.left ||
            this.x + this.W * 0.44 > seg.right);
  }

  hit() {
    this.lives--;
    this.invincible = true;
    this.invincMs   = CFG.INVINCIBLE_MS;
    this.vx = 0; this.vy = 0;
    return this.lives <= 0;
  }
}

// ── Power-Up Types ────────────────────────────────────────────
const PU_TYPES = {
  TIME:   { color:'#00ffcc', label:'+TIME',   desc:'+15s',    weight: 3 },
  POINTS: { color:'#ffdd00', label:'+500',    desc:'BONUS',   weight: 4 },
  LIFE:   { color:'#ff3366', label:'+LIFE',   desc:'RESCUE',  weight: 2 },
  SHIELD: { color:'#44aaff', label:'SHIELD',  desc:'8s',      weight: 2 },
};
const PU_KEYS = Object.keys(PU_TYPES);
// weighted random pick
function randPUType() {
  const total = PU_KEYS.reduce((s, k) => s + PU_TYPES[k].weight, 0);
  let r = Math.random() * total;
  for (const k of PU_KEYS) {
    r -= PU_TYPES[k].weight;
    if (r <= 0) return k;
  }
  return PU_KEYS[0];
}

// ── Power-Up ─────────────────────────────────────────────────
class PowerUp {
  constructor(caveProgress, cave) {
    this.cp   = caveProgress; // cave progress at which PU lives
    this.type = randPUType();
    this.cfg  = PU_TYPES[this.type];

    // X inside cave at that progress
    const segIdx = Math.floor(caveProgress / CFG.SEG_H);
    const seg    = cave.segs[Math.min(segIdx, cave.segs.length - 1)]
                || { left: W * 0.15, right: W * 0.85 };
    this.x    = seg.left + (seg.right - seg.left) * rand(0.18, 0.82);

    this.collected = false;
    this.ph   = Math.random() * Math.PI * 2; // float phase
    this.spin = 0;
    this.r    = 15;  // radius
  }

  screenY(cave) {
    return DRONE_Y - (this.cp - cave.scroll);
  }

  update() {
    this.ph   += 0.04;
    this.spin += 0.03;
  }

  draw(cave) {
    const sy = this.screenY(cave) + Math.sin(this.ph) * 5;
    if (sy < -40 || sy > H + 40) return;

    const { color, label } = this.cfg;
    const r   = this.r;
    const glo = 0.55 + 0.45 * Math.sin(this.ph * 2);

    // outer glow halo
    const halo = ctx.createRadialGradient(this.x, sy, 0, this.x, sy, r * 3);
    halo.addColorStop(0,   color + '33');
    halo.addColorStop(0.5, color + '11');
    halo.addColorStop(1,   'transparent');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(this.x, sy, r * 3, 0, Math.PI*2);
    ctx.fill();

    // hexagon body
    ctx.save();
    ctx.translate(this.x, sy);
    ctx.rotate(this.spin);
    ctx.fillStyle   = color + '22';
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.8;
    ctx.shadowBlur  = 8 * glo;
    ctx.shadowColor = color;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      i === 0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r)
              : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // label
    ctx.fillStyle     = color;
    ctx.font          = `bold ${r * 0.62}px 'Courier New'`;
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.shadowBlur    = 0;
    ctx.fillText(label, this.x, sy);
  }

  checkCollect(drone, cave) {
    const sy = this.screenY(cave);
    const dx = this.x - drone.x;
    const dy = sy    - drone.y;
    return Math.hypot(dx, dy) < this.r + 14;
  }
}

// ── Particle ─────────────────────────────────────────────────
class Particle {
  constructor(x, y, color, speedMul = 1) {
    this.x = x; this.y = y;
    const spd = (2 + Math.random() * 4) * speedMul;
    const ang = Math.random() * Math.PI * 2;
    this.vx   = Math.cos(ang) * spd;
    this.vy   = Math.sin(ang) * spd;
    this.life = 1;
    this.dec  = 0.03 + Math.random() * 0.04;
    this.sz   = 2 + Math.random() * 3;
    this.color= color;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vx *= 0.91;   this.vy *= 0.91;
    this.life -= this.dec;
  }
  draw() {
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.sz * this.life, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  get dead() { return this.life <= 0; }
}

// ── Floating Text ─────────────────────────────────────────────
class FloatText {
  constructor(x, y, text, color) {
    this.x = x; this.y = y;
    this.text  = text;
    this.color = color;
    this.life  = 1;
    this.vy    = -1.4;
  }
  update(dt) {
    this.y    += this.vy;
    this.life -= dt * 0.0018;
  }
  draw() {
    ctx.globalAlpha  = Math.max(0, this.life);
    ctx.fillStyle    = this.color;
    ctx.font         = `bold 17px 'Courier New'`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur   = 8;
    ctx.shadowColor  = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.shadowBlur   = 0;
    ctx.globalAlpha  = 1;
  }
  get dead() { return this.life <= 0; }
}

// ── D-Pad ─────────────────────────────────────────────────────
class DPad {
  constructor() {
    this.touchMap = {};
    this.resize();
    canvas.addEventListener('touchstart', e => { e.preventDefault(); this._track(e); }, { passive:false });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); this._track(e); }, { passive:false });
    canvas.addEventListener('touchend',   e => { e.preventDefault(); this._lift(e);  }, { passive:false });
    canvas.addEventListener('touchcancel',e => { e.preventDefault(); this._lift(e);  }, { passive:false });
  }

  resize() {
    const pad = Math.min(W, H) * 0.075 + 28;
    this.cx   = pad + 6;               // D-pad center X
    this.cy   = H - pad - 6;           // D-pad center Y
    this.gap  = pad * 0.88;            // btn offset from center
    this.br   = pad * 0.58;            // btn radius
    this.scx  = W - pad - 14;          // slow btn X
    this.scy  = H - pad - 6;           // slow btn Y
    this.sr   = pad * 0.72;            // slow btn radius
  }

  _track(e) {
    for (const t of e.changedTouches) {
      this.touchMap[t.identifier] = { x: t.clientX * (W / window.innerWidth),
                                       y: t.clientY * (H / window.innerHeight) };
    }
    this._calc();
  }
  _lift(e) {
    for (const t of e.changedTouches) delete this.touchMap[t.identifier];
    this._calc();
  }
  _calc() {
    KEY.left = KEY.right = KEY.up = KEY.down = KEY.slow = false;
    for (const { x, y } of Object.values(this.touchMap)) {
      // slow button
      if (Math.hypot(x - this.scx, y - this.scy) < this.sr + 12) { KEY.slow = true; continue; }
      // d-pad
      const dx = x - this.cx, dy = y - this.cy;
      const d  = Math.hypot(dx, dy);
      if (d > 12 && d < this.gap * 2.2) {
        const a = Math.atan2(dy, dx);
        if (Math.abs(a) < Math.PI/4)          KEY.right = true;
        else if (Math.abs(a) > 3*Math.PI/4)   KEY.left  = true;
        else if (a > 0)                        KEY.down  = true;
        else                                   KEY.up    = true;
      }
    }
  }

  draw() {
    const { cx, cy, gap, br, scx, scy, sr } = this;

    ctx.save();
    ctx.globalAlpha = 0.52;

    // D-pad backing disc
    ctx.fillStyle   = 'rgba(0,8,22,0.7)';
    ctx.strokeStyle = '#1a3355';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, gap + br + 8, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();

    // buttons
    const dirs = [
      { k:'up',    dx:0,    dy:-gap, sym:'▲' },
      { k:'down',  dx:0,    dy: gap, sym:'▼' },
      { k:'left',  dx:-gap, dy:0,    sym:'◀' },
      { k:'right', dx: gap, dy:0,    sym:'▶' },
    ];
    for (const { k, dx, dy, sym } of dirs) {
      const bx  = cx + dx, by = cy + dy;
      const act = KEY[k];
      ctx.fillStyle   = act ? '#003a6e' : '#001830';
      ctx.strokeStyle = act ? '#00aaff' : '#003366';
      ctx.lineWidth   = act ? 2 : 1.2;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle    = act ? '#44ddff' : '#225588';
      ctx.font         = `${Math.round(br * 0.72)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sym, bx, by + 1);
    }

    // slow button
    const sa = KEY.slow;
    ctx.fillStyle   = sa ? '#001e36' : '#000e1c';
    ctx.strokeStyle = sa ? '#0099ff' : '#224455';
    ctx.lineWidth   = sa ? 2 : 1.2;
    ctx.beginPath();
    ctx.arc(scx, scy, sr, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle    = sa ? '#88ddff' : '#335577';
    ctx.font         = `bold ${Math.round(sr * 0.38)}px 'Courier New'`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SLOW', scx, scy);

    ctx.restore();
  }
}

// ── Speed Lines ───────────────────────────────────────────────
class SpeedLines {
  constructor() {
    this.lines = Array.from({ length: 18 }, () => this._make());
  }
  _make() {
    return { x: rand(0, W), y: rand(-H, H),
             len: rand(18, 60), spd: rand(6, 14), a: rand(0.03, 0.14) };
  }
  update(scrollSpd) {
    const fac = scrollSpd / CFG.BASE_SCROLL;
    for (const l of this.lines) {
      l.y += l.spd * fac;
      if (l.y > H + 60) { l.x = rand(0, W); l.y = -60; }
    }
  }
  draw(scrollSpd) {
    const fac = clamp(scrollSpd / CFG.BASE_SCROLL - 0.9, 0, 1);
    if (fac <= 0) return;
    ctx.save();
    for (const l of this.lines) {
      ctx.strokeStyle = `rgba(0,150,255,${l.a * fac})`;
      ctx.lineWidth   = 0.6;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x, l.y + l.len * fac);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ── Slow-Fuel Bar ─────────────────────────────────────────────
function drawFuelBar(fuel) {
  const bx  = W - 52;
  const by  = H - 172;
  const bw  = 10;
  const bh  = 78;
  const pct = fuel / CFG.SLOW_MAX;

  ctx.fillStyle = '#001018';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#002233';
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx, by, bw, bh);

  if (pct > 0) {
    const fh   = bh * pct;
    const grad = ctx.createLinearGradient(0, by + bh - fh, 0, by + bh);
    grad.addColorStop(0, pct > 0.3 ? '#00bbff' : '#ff6600');
    grad.addColorStop(1, pct > 0.3 ? '#0044cc' : '#aa2200');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by + bh - fh, bw, fh);
  }

  ctx.fillStyle    = '#225566';
  ctx.font         = '7px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('SLOW', bx + bw / 2, by + bh + 4);
}

// ── Screen-Shake ──────────────────────────────────────────────
let shakeMs = 0, shakeMag = 0;
function triggerShake(mag = 6, ms = 300) { shakeMs = ms; shakeMag = mag; }
function applyShake(dt) {
  if (shakeMs <= 0) return;
  shakeMs -= dt;
  const s = shakeMag * (shakeMs / 300);
  ctx.translate(rand(-s, s), rand(-s, s));
}

// ── HUD updater ───────────────────────────────────────────────
function updateHUD(score, level, timeLeft, lives) {
  document.getElementById('hScore').textContent = score;
  document.getElementById('hLevel').textContent = level;

  const m  = Math.floor(timeLeft / 60);
  const s  = Math.floor(timeLeft % 60);
  const el = document.getElementById('hTime');
  el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
  el.className   = timeLeft <= 15 ? 'hud-val warning' : 'hud-val';

  const row = document.getElementById('lives-row');
  row.innerHTML = '';
  for (let i = 0; i < CFG.MAX_LIVES; i++) {
    const d = document.createElement('div');
    d.className = i < lives ? 'life-pip' : 'life-pip empty';
    row.appendChild(d);
  }
}

// ── Screen panel helper ───────────────────────────────────────
function showScreen(html) {
  const el = document.getElementById('screen');
  el.innerHTML = html;
  el.classList.remove('hidden');
}
function hideScreen() {
  document.getElementById('screen').classList.add('hidden');
}

// ── Game Controller ───────────────────────────────────────────
class Game {
  constructor() {
    this.state  = 'menu';
    this.score  = 0;
    this.hiScore= parseInt(localStorage.getItem('crHi') || '0', 10);
    this.level  = 1;
    this.tLeft  = CFG.LEVEL_TIME;
    this.sFuel  = CFG.SLOW_MAX;
    this.scroll = CFG.BASE_SCROLL;
    this.frame  = 0;
    this.lastTs = 0;

    this.cave   = null;
    this.drone  = null;
    this.pups   = [];
    this.parts  = [];
    this.ftexts = [];
    this.dpad   = new DPad();
    this.slines = new SpeedLines();

    this._buildMenu();
    requestAnimationFrame(ts => this._loop(ts));
  }

  onResize() {
    this.dpad.resize();
  }

  // ── Menu ────────────────────────────────────────────────────
  _buildMenu() {
    const hi = this.hiScore > 0
      ? `<div class="hi-line">HIGH SCORE: ${this.hiScore}</div>` : '';
    showScreen(`
      <div class="title">CAVE RUSH</div>
      <div class="subtitle">DEEP EARTH EXPLORATION</div>
      <button class="btn" id="bStart">LAUNCH</button>
      <button class="btn secondary" id="bHow">HOW TO PLAY</button>
      ${hi}
    `);
    document.getElementById('bStart').onclick = () => this._startGame();
    document.getElementById('bHow').onclick   = () => this._howTo();
  }

  _howTo() {
    showScreen(`
      <div class="title" style="font-size:clamp(26px,8vw,38px);margin-bottom:4px">HOW TO PLAY</div>
      <div class="info-text">
        <span>▲▼◀▶</span> navigate the drone<br>
        Avoid the cave walls<br>
        <span>SLOW</span> button slows you down<br>
        (uses fuel — recharges when off)<br><br>
        <span style="color:#00ffcc">⬡ +TIME</span> &nbsp;add 15 seconds<br>
        <span style="color:#ffdd00">⬡ +500</span> &nbsp;bonus points<br>
        <span style="color:#ff3366">⬡ +LIFE</span> &nbsp;extra life<br>
        <span style="color:#44aaff">⬡ SHIELD</span> 8s invincibility<br><br>
        Survive <span>1:30</span> to pass a level.<br>
        Each level is <span>10% faster</span>.
      </div>
      <button class="btn" id="bBack">BACK</button>
    `);
    document.getElementById('bBack').onclick = () => this._buildMenu();
  }

  // ── Start / Level ───────────────────────────────────────────
  _startGame() {
    this.score  = 0;
    this.level  = 1;
    this._startLevel();
  }

  _startLevel() {
    this.cave   = new Cave(this.level);
    this.drone  = new Drone();
    this.pups   = [];
    this.parts  = [];
    this.ftexts = [];
    this.tLeft  = CFG.LEVEL_TIME;
    this.sFuel  = CFG.SLOW_MAX;
    this.scroll = CFG.BASE_SCROLL * Math.pow(1 + CFG.LVL_INC, this.level - 1);
    this.state  = 'playing';
    shakeMs     = 0;
    hideScreen();
    document.getElementById('hud').classList.remove('hidden');
    updateHUD(this.score, this.level, this.tLeft, this.drone.lives);
  }

  // ── Game Loop ───────────────────────────────────────────────
  _loop(ts) {
    requestAnimationFrame(t => this._loop(t));
    const dt = Math.min(ts - this.lastTs, 50);
    this.lastTs = ts;
    this.frame++;

    if (this.state === 'playing') this._update(dt);
    this._draw(dt);
  }

  // ── Update ──────────────────────────────────────────────────
  _update(dt) {
    const dtS = dt / 1000;

    // countdown
    this.tLeft -= dtS;
    if (this.tLeft <= 0) { this.tLeft = 0; this._levelDone(); return; }

    // slow fuel
    const slowOn = KEY.slow && this.sFuel > 0;
    this.sFuel = clamp(this.sFuel + (slowOn ? -CFG.SLOW_DRAIN : CFG.SLOW_REGEN), 0, CFG.SLOW_MAX);
    const effScroll = this.scroll * (slowOn ? CFG.SLOW_MULT : 1);

    // cave advance
    this.cave.update(effScroll);

    // drone
    this.drone.update(dt);

    // passive score
    this.score += slowOn ? 1 : 2;

    // spawn power-ups
    if (Math.random() < CFG.PU_CHANCE * (effScroll / CFG.BASE_SCROLL)) {
      const ahead = this.cave.scroll + DRONE_Y + rand(CFG.PU_AHEAD_MIN, CFG.PU_AHEAD_MAX);
      this.pups.push(new PowerUp(ahead, this.cave));
    }

    // power-up update + collect
    for (const p of this.pups) {
      p.update();
      if (!p.collected && p.checkCollect(this.drone, this.cave)) {
        p.collected = true;
        this._collect(p);
      }
    }
    this.pups = this.pups.filter(p => !p.collected && p.screenY(this.cave) > -80);

    // collision
    if (this.drone.collidesWith(this.cave)) {
      triggerShake(7, 320);
      this._burst(this.drone.x, this.drone.y, '#ff3344', 18);
      const dead = this.drone.hit();
      if (dead) { this._gameOver(); return; }
    }

    // speed lines
    this.slines.update(effScroll);

    // particles + float texts
    for (const p of this.parts)  p.update();
    for (const f of this.ftexts) f.update(dt);
    this.parts  = this.parts.filter(p => !p.dead);
    this.ftexts = this.ftexts.filter(f => !f.dead);

    // HUD every 4 frames
    if (this.frame % 4 === 0)
      updateHUD(this.score, this.level, this.tLeft, this.drone.lives);
  }

  // ── Collect Power-Up ────────────────────────────────────────
  _collect(pu) {
    const sy = pu.screenY(this.cave);
    this._burst(pu.x, sy, pu.cfg.color, 12);
    this.ftexts.push(new FloatText(pu.x, sy - 10, pu.cfg.label, pu.cfg.color));

    switch (pu.type) {
      case 'TIME':
        this.tLeft = Math.min(CFG.LEVEL_TIME + 30, this.tLeft + 15);
        break;
      case 'POINTS':
        this.score += 500;
        this.ftexts.push(new FloatText(pu.x, sy - 30, '+500', '#ffdd00'));
        break;
      case 'LIFE':
        if (this.drone.lives < CFG.MAX_LIVES) this.drone.lives++;
        updateHUD(this.score, this.level, this.tLeft, this.drone.lives);
        break;
      case 'SHIELD':
        this.drone.shield   = true;
        this.drone.shieldMs = CFG.SHIELD_MS;
        break;
    }
  }

  _burst(x, y, color, n) {
    for (let i = 0; i < n; i++) this.parts.push(new Particle(x, y, color));
  }

  // ── Level Done ──────────────────────────────────────────────
  _levelDone() {
    this.state = 'levelcomplete';
    const bonus = Math.floor(this.tLeft * 12 * this.level);
    this.score += bonus;
    document.getElementById('hud').classList.add('hidden');
    showScreen(`
      <div class="title" style="color:#00ff88;text-shadow:0 0 20px #00ff88;font-size:clamp(28px,9vw,44px)">
        LEVEL ${this.level}
      </div>
      <div class="subtitle">COMPLETE</div>
      <div class="score-display">TIME BONUS<br><span style="color:#ffdd00">+${bonus}</span></div>
      <div class="score-display" style="font-size:clamp(16px,5vw,22px);color:#aaf">SCORE: ${this.score}</div>
      <button class="btn" id="bNext">NEXT LEVEL ▶</button>
    `);
    document.getElementById('bNext').onclick = () => {
      this.level++;
      document.getElementById('hud').classList.remove('hidden');
      this._startLevel();
    };
  }

  // ── Game Over ───────────────────────────────────────────────
  _gameOver() {
    this.state = 'gameover';
    document.getElementById('hud').classList.add('hidden');

    const isHi = this.score >= this.hiScore && this.score > 0;
    if (isHi) {
      this.hiScore = this.score;
      localStorage.setItem('crHi', this.hiScore);
    }

    showScreen(`
      <div class="title" style="color:#ff3344;text-shadow:0 0 20px #ff2233">GAME OVER</div>
      <div class="score-display">${this.score.toLocaleString()}</div>
      <div class="info-text">Level ${this.level}</div>
      ${isHi
        ? '<div class="hi-line new-hi">★ NEW HIGH SCORE ★</div>'
        : `<div class="hi-line">BEST: ${this.hiScore.toLocaleString()}</div>`}
      <button class="btn" id="bRetry">RETRY</button>
      <button class="btn secondary" id="bMenu">MENU</button>
    `);
    document.getElementById('bRetry').onclick = () => { hideScreen(); this._startGame(); };
    document.getElementById('bMenu').onclick  = () => this._buildMenu();
  }

  // ── Draw ────────────────────────────────────────────────────
  _draw(dt) {
    ctx.save();
    if (shakeMs > 0) applyShake(dt);

    if (this.cave) this.cave.draw();

    if (this.state === 'playing') {
      const slowOn = KEY.slow && this.sFuel > 0;
      this.slines.draw(this.scroll * (slowOn ? CFG.SLOW_MULT : 1));

      // particles (under drone)
      for (const p of this.parts)  p.draw();

      // power-ups
      for (const p of this.pups)   p.draw(this.cave);

      // drone
      this.drone.draw();

      // float texts
      for (const f of this.ftexts) f.draw();

      // D-pad
      this.dpad.draw();

      // fuel bar
      drawFuelBar(this.sFuel);

      // near-wall danger vignette
      this._vignette();
    }

    ctx.restore();
  }

  _vignette() {
    if (!this.drone) return;
    const seg   = this.cave.segAt(this.drone.y);
    const left  = this.drone.x - this.drone.W * 0.44 - seg.left;
    const right = seg.right - (this.drone.x + this.drone.W * 0.44);
    const minD  = Math.min(left, right);
    if (minD < 55) {
      const a = clamp((1 - minD / 55) * 0.35, 0, 0.35);
      ctx.fillStyle = `rgba(255,20,20,${a})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

// ── Boot ─────────────────────────────────────────────────────
let G = null;
resize();
G = new Game();
