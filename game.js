'use strict';
// ============================================================
// CAVE RUSH — Deep Earth Exploration Drone
// ============================================================

const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');

// ── Globals (set by resize) ──────────────────────────────────
let W, H, DRONE_Y;
const HUD_H = 54;   // px reserved for top header bar

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  // drone Y is relative to the cave area (below header)
  DRONE_Y = Math.round(HUD_H + (H - HUD_H) * 0.72);
  if (G) G.onResize();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ── Config ───────────────────────────────────────────────────
const CFG = {
  SEG_H:            4,       // cave segment height px
  BASE_SCROLL:      4.5,     // px / frame base speed (= old boost speed)
  LVL_INC:          0.10,    // +10% scroll per level
  DRONE_SPD:        4.8,
  SLOW_MULT:        0.40,
  SLOW_DRAIN:       0.50,
  SLOW_REGEN:       0.16,
  SLOW_MAX:         100,
  LEVEL_DIST:       14000,   // px scrolled to complete a level
  LEVEL_DIST_INC:   2500,    // extra px per level
  MIN_GAP_L1:       175,
  MAX_GAP:          310,
  GAP_STEP:         12,      // gap reduction per level
  WALL_LINES:       8,
  PU_CHANCE:        0.0006,  // per-frame spawn chance
  PU_AHEAD_MIN:     250,
  PU_AHEAD_MAX:     600,
  SHIELD_MS:        8000,
  INVINCIBLE_MS:    2200,
  MAX_LIVES:        5,
  CRYSTAL_CHANCE:   0.003,
  STALA_CHANCE:     0.00022,
  MAGNET_MS:        6000,
  MAGNET_RADIUS:    190,
  BOOST_MULT:       1.35,    // extra speed while boosting
  BOOST_AGILITY:    1.5,
  BOOST_FUEL_MAX:   30000,   // 30s total fuel (20s safe + 10s warning)
  BOOST_WARN_AT:    10000,   // warning when <10s of fuel left (=20s used)
  BOOST_REGEN_RATE: 2.0,     // fuel regens 2x faster than it drains
  BOOST_FAIL_MULT:  0.56,    // speed mult during engine failure (~old default speed)
  FIRE_RATE:        175,     // ms between shots
  BULLET_SPD:       9.5,
  WEAPON_MS:        10000,
  ENEMY_BULLET_SPD: 3.6,
  WAVE_INTERVAL:    9000,    // ms between waves
  SPEED_MULT:       1.32,    // speed power-up drone movement multiplier
  SPEED_MS:         8000,
  SCORE_MULT_MAX:   4.0,     // maximum score multiplier from rock drops
  ROCK_CHANCE:      0.0030,  // per-frame individual rock spawn chance
  ROCKWALL_CHANCE:  0.00042, // per-frame full rock-wall blockade chance
  ROCK_AHEAD_MIN:   500,
  ROCK_AHEAD_MAX:   1000,
  CUT_TALLY_MS:     2800,    // level-complete tally phase duration
  CUT_COUNT_MS:     750,     // ms per countdown digit (3, 2, 1, ENGAGE)
};

// ── Utility ──────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand  = (a, b)      => a + Math.random() * (b - a);
const lerp  = (a, b, t)   => a + (b - a) * t;

// ── Input ────────────────────────────────────────────────────
const KEY = { left:false, right:false, up:false, down:false, slow:false, boost:false, fire:false };

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
  if (k===' ' || k==='Shift') KEY.slow  = v;
  if (k==='z' || k==='Z' || k==='f' || k==='F') KEY.fire  = v;
  if (k==='e' || k==='E' || k==='b' || k==='B') KEY.boost = v;
}

// ── Cave ─────────────────────────────────────────────────────
class Cave {
  constructor(level) {
    this.level   = level;
    this.segs    = [];      // [{left, right}, …]
    this.scroll  = 0;       // total px scrolled
    this.wallDecos = [];    // decorative gems/rocks in wall

    // generation state
    this.gC  = W / 2;       // center
    this.gG  = Math.min(CFG.MAX_GAP, W * 0.58);
    this.gCV = 0;           // center velocity
    this.gGV = 0;           // gap velocity

    const red = (level - 1) * CFG.GAP_STEP;
    this.minGap = Math.max(90, CFG.MIN_GAP_L1 - red);
    this.maxGap = Math.max(this.minGap + 60, CFG.MAX_GAP - red * 0.4);

    // ring crystal spawn hints: { cp, type:'apex'|'straight', cx, gap }
    this.spawnHints   = [];
    this._prevCVSign  = 0;
    this._straightCnt = 0;

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

    const seg = { left: this.gC - half, right: this.gC + half };
    this.segs.push(seg);

    // detect curve apexes (velocity sign flip) and straight runs for ring spawning
    const cvSign = this.gCV > 0.4 ? 1 : this.gCV < -0.4 ? -1 : 0;
    if (cvSign !== 0 && this._prevCVSign !== 0 && cvSign !== this._prevCVSign) {
      this.spawnHints.push({ cp: this.segs.length * CFG.SEG_H, type: 'apex', cx: this.gC, gap: this.gG });
    }
    if (cvSign !== 0) this._prevCVSign = cvSign;

    if (Math.abs(this.gCV) < 0.9) {
      this._straightCnt++;
      if (this._straightCnt === 30) {
        this.spawnHints.push({ cp: this.segs.length * CFG.SEG_H, type: 'straight', cx: this.gC, gap: this.gG });
        this._straightCnt = 0;
      }
    } else {
      this._straightCnt = 0;
    }

    // 12% chance to add a wall decoration each segment
    if (Math.random() < 0.12) {
      const cp      = this.segs.length * CFG.SEG_H;
      const isLeft  = Math.random() < 0.5;
      const wallX   = isLeft ? seg.left : seg.right;
      const inset   = rand(6, 42);
      const x       = isLeft ? wallX - inset : wallX + inset;
      const isGem   = Math.random() < 0.58;
      const gemPalette = ['#00ffee','#44ff88','#ff44cc','#cc44ff','#ffaa00','#44aaff'];
      const numPts  = isGem ? 4 : (3 + Math.floor(Math.random() * 3));
      const pts     = Array.from({ length: numPts }, (_, i) => {
        const a = (i / numPts) * Math.PI * 2 + rand(-0.35, 0.35);
        const r = rand(0.65, 1.0);
        return [Math.cos(a) * r, Math.sin(a) * r];
      });
      this.wallDecos.push({
        cp, x,
        type:  isGem ? 'gem' : 'rock',
        size:  rand(isGem ? 2.5 : 4, isGem ? 6 : 11),
        color: gemPalette[Math.floor(Math.random() * gemPalette.length)],
        ph:    Math.random() * Math.PI * 2,
        pts,
      });
    }
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
    // clip all cave drawing to below the header
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD_H, W, H - HUD_H);
    ctx.clip();

    // background — deep space-cave
    ctx.fillStyle = '#000509';
    ctx.fillRect(0, HUD_H, W, H - HUD_H);

    // collect wall positions in screen-space (start from HUD_H)
    const leftPts  = [];
    const rightPts = [];
    for (let sy = HUD_H - CFG.SEG_H; sy <= H + CFG.SEG_H; sy += CFG.SEG_H) {
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

    // wall decorations (gems + rocks embedded in rock)
    const now = Date.now();
    for (const d of this.wallDecos) {
      const sy = DRONE_Y - (d.cp - this.scroll);
      if (sy < -24 || sy > H + 24) continue;
      ctx.save();
      ctx.translate(d.x, sy);
      if (d.type === 'gem') {
        const glo = 0.45 + 0.55 * Math.sin(d.ph + now * 0.0018);
        ctx.shadowBlur  = 7 * glo;
        ctx.shadowColor = d.color;
        ctx.fillStyle   = d.color + '88';
        ctx.strokeStyle = d.color;
        ctx.lineWidth   = 0.8;
        const r = d.size;
        ctx.beginPath();
        ctx.moveTo(0, -r); ctx.lineTo(r * 0.55, 0);
        ctx.lineTo(0, r);  ctx.lineTo(-r * 0.55, 0);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle   = '#14132c';
        ctx.strokeStyle = 'rgba(80,110,160,0.22)';
        ctx.lineWidth   = 0.7;
        ctx.beginPath();
        d.pts.forEach(([px, py], i) => {
          i === 0 ? ctx.moveTo(px * d.size, py * d.size)
                  : ctx.lineTo(px * d.size, py * d.size);
        });
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }

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
    ctx.restore();   // restore inner-glow save
    ctx.restore();   // restore cave clip
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
    this.magnet      = false;
    this.magnetMs    = 0;
    this.boosting    = false;
    this.boostFuel   = CFG.BOOST_FUEL_MAX;   // ms of fuel remaining
    this.boostFailing= false;                 // true when fuel empty + still held
    this.weapon      = 'default';  // 'default'|'spread'|'homing'|'explosive'
    this.weaponMs    = 0;
    this.fireTimer   = 0;
    this.speedBoost  = false;
    this.speedMs     = 0;
    this.tilt        = 0;
    this.thrustPh    = 0;
    this.W           = 30;   // half-width for collision
    this.H           = 17;   // half-height
  }

  update(dt) {
    if (this.speedMs > 0) {
      this.speedMs -= dt;
      if (this.speedMs <= 0) { this.speedBoost = false; this.speedMs = 0; }
    }
    const speedBoostMul = this.speedBoost ? CFG.SPEED_MULT : 1;
    const agilityMult = this.boosting ? CFG.BOOST_AGILITY : 1;
    const spd = CFG.DRONE_SPD * agilityMult * speedBoostMul;
    const acc = 1.3 * agilityMult;

    if (KEY.left)  this.vx -= acc;
    if (KEY.right) this.vx += acc;
    if (KEY.up)    this.vy -= 0.75 * agilityMult;
    if (KEY.down)  this.vy += 0.75 * agilityMult;

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
    if (this.magnet) {
      this.magnetMs -= dt;
      if (this.magnetMs <= 0) { this.magnet = false; this.magnetMs = 0; }
    }
    if (KEY.boost) {
      this.boostFuel   = Math.max(0, this.boostFuel - dt);
      this.boosting    = this.boostFuel > 0;
      this.boostFailing= this.boostFuel <= 0;
    } else {
      this.boostFuel   = Math.min(CFG.BOOST_FUEL_MAX, this.boostFuel + dt * CFG.BOOST_REGEN_RATE);
      this.boosting    = false;
      this.boostFailing= false;
    }
    if (this.weaponMs > 0) {
      this.weaponMs -= dt;
      if (this.weaponMs <= 0) { this.weapon = 'default'; this.weaponMs = 0; }
    }
    if (this.fireTimer > 0) this.fireTimer -= dt;
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
    const boostFac = this.boosting ? 2.4 : 1;
    const flameLng = (14 + 12 * flicker) * (KEY.up ? 1.6 : 1) * boostFac;
    const flameC1  = this.boosting ? `rgba(80,220,255,${0.95 * flicker})`  : `rgba(255,210,60,${0.95 * flicker})`;
    const flameC2  = this.boosting ? `rgba(20,100,255,${0.7 * flicker})`   : `rgba(255,100,20,${0.7 * flicker})`;
    const fg = ctx.createRadialGradient(0, th, 0, 0, th + flameLng * 0.5, flameLng);
    fg.addColorStop(0,   flameC1);
    fg.addColorStop(0.35,flameC2);
    fg.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    if (this.boosting) { ctx.shadowBlur = 18; ctx.shadowColor = '#44aaff'; }
    ctx.beginPath();
    ctx.ellipse(0, th + flameLng * 0.45, 6 * (this.boosting ? 1.6 : 1), flameLng * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

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

    // magnet field ring
    if (this.magnet) {
      const t     = Date.now() * 0.003;
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t));
      const r     = CFG.MAGNET_RADIUS;
      ctx.strokeStyle = `rgba(200,80,255,${0.18 + 0.18 * pulse})`;
      ctx.lineWidth   = 1.5;
      ctx.shadowBlur  = 14;
      ctx.shadowColor = '#cc44ff';
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
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
  TIME:     { color:'#00ffcc', label:'+TIME',   desc:'+15s',  weight: 3 },
  POINTS:   { color:'#ffdd00', label:'+500',    desc:'BONUS', weight: 4 },
  LIFE:     { color:'#ff3366', label:'+LIFE',   desc:'RESCUE',weight: 2 },
  SHIELD:   { color:'#44aaff', label:'SHIELD',  desc:'8s',    weight: 2 },
  MAGNET:   { color:'#cc44ff', label:'MAGNET',  desc:'6s',    weight: 2 },
  SPREAD:   { color:'#ffee00', label:'SPREAD',  desc:'10s',   weight: 2 },
  HOMING:   { color:'#ff44cc', label:'LOCK-ON', desc:'10s',   weight: 2 },
  EXPLOSIVE:{ color:'#ff6600', label:'BOMBS',   desc:'8s',    weight: 1 },
  MULT:     { color:'#ff9900', label:'×MULT',   desc:'×2',   weight: 2 },
  SPEED:    { color:'#00ff88', label:'SPEED+',  desc:'8s',   weight: 2 },
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

// ── Crystal ───────────────────────────────────────────────────
class Crystal {
  constructor(caveProgress, cave) {
    this.cp        = caveProgress;
    this.collected = false;
    this.ph        = Math.random() * Math.PI * 2;
    this.spin      = 0;
    this.r         = 8;

    const segIdx = Math.floor(caveProgress / CFG.SEG_H);
    const seg    = cave.segs[Math.min(segIdx, cave.segs.length - 1)]
                || { left: W * 0.15, right: W * 0.85 };
    this.x = seg.left + (seg.right - seg.left) * rand(0.12, 0.88);

    const palette = ['#00ffee','#44ffcc','#aa88ff','#ffee44','#ff88cc'];
    this.color = palette[Math.floor(Math.random() * palette.length)];
  }

  screenY(cave) { return DRONE_Y - (this.cp - cave.scroll); }

  update() { this.ph += 0.055; this.spin += 0.045; }

  draw(cave) {
    const sy = this.screenY(cave) + Math.sin(this.ph) * 3;
    if (sy < -30 || sy > H + 30) return;

    ctx.save();
    ctx.translate(this.x, sy);
    ctx.rotate(this.spin);

    const r   = this.r;
    const glo = 0.6 + 0.4 * Math.sin(this.ph * 2);

    ctx.shadowBlur  = 10 * glo;
    ctx.shadowColor = this.color;
    ctx.strokeStyle = this.color;
    ctx.fillStyle   = this.color + '44';
    ctx.lineWidth   = 1.5;

    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.55, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.55, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  checkCollect(drone, cave, magnetActive) {
    const sy = this.screenY(cave);
    const d  = Math.hypot(this.x - drone.x, sy - drone.y);
    return d < this.r + (magnetActive ? CFG.MAGNET_RADIUS : 12);
  }
}

// ── Ring Crystal (Sonic-style collectible) ────────────────────
class RingCrystal {
  constructor(cp, x) {
    this.cp        = cp;
    this.x         = x;
    this.collected = false;
    this.ph        = Math.random() * Math.PI * 2;
    this.spin      = 0;
    this.r         = 11;
  }

  screenY(cave) { return DRONE_Y - (this.cp - cave.scroll); }

  update() { this.ph += 0.055; this.spin += 0.04; }

  draw(cave) {
    const sy = this.screenY(cave) + Math.sin(this.ph) * 4;
    if (sy < -30 || sy > H + 30) return;

    const glo = 0.5 + 0.5 * Math.sin(this.ph * 2.5);
    const r   = this.r;
    ctx.save();
    ctx.translate(this.x, sy);
    ctx.rotate(this.spin);

    // outer pulse halo
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.8);
    halo.addColorStop(0,   `rgba(0,230,255,${0.22 * glo})`);
    halo.addColorStop(0.5, `rgba(0,180,255,${0.10 * glo})`);
    halo.addColorStop(1,   'transparent');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.8, 0, Math.PI * 2);
    ctx.fill();

    // crystal body (diamond)
    ctx.shadowBlur  = 16 * glo;
    ctx.shadowColor = '#00eeff';
    ctx.strokeStyle = `rgba(0,240,255,${0.6 + 0.4 * glo})`;
    ctx.fillStyle   = `rgba(0,200,255,${0.12 + 0.18 * glo})`;
    ctx.lineWidth   = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.62, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.62, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // inner sparkle
    ctx.shadowBlur  = 8 * glo;
    ctx.strokeStyle = `rgba(180,255,255,${0.5 * glo})`;
    ctx.lineWidth   = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.45);
    ctx.lineTo(r * 0.28, 0);
    ctx.lineTo(0, r * 0.45);
    ctx.lineTo(-r * 0.28, 0);
    ctx.closePath();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  checkCollect(drone, cave, magnetActive) {
    const sy = this.screenY(cave);
    const d  = Math.hypot(this.x - drone.x, sy - drone.y);
    return d < this.r + (magnetActive ? CFG.MAGNET_RADIUS : 16);
  }
}

// ── Stalactite ────────────────────────────────────────────────
class Stalactite {
  constructor(caveProgress, cave) {
    this.cp = caveProgress;

    const segIdx = Math.floor(caveProgress / CFG.SEG_H);
    const seg    = cave.segs[Math.min(segIdx, cave.segs.length - 1)]
                || { left: W * 0.2, right: W * 0.8 };

    this.fromLeft = Math.random() < 0.5;
    this.wallX    = this.fromLeft ? seg.left : seg.right;
    this.gapWidth = seg.right - seg.left;
    this.len      = rand(18, Math.min(44, this.gapWidth * 0.28));
    this.hw       = rand(8, 15);
  }

  screenY(cave) { return DRONE_Y - (this.cp - cave.scroll); }

  draw(cave) {
    const sy = this.screenY(cave);
    if (sy < -80 || sy > H + 80) return;

    const dir  = this.fromLeft ? 1 : -1;
    const tipX = this.wallX + dir * this.len;

    ctx.save();
    ctx.fillStyle   = '#12112a';
    ctx.strokeStyle = 'rgba(0,160,220,0.28)';
    ctx.lineWidth   = 0.8;

    ctx.beginPath();
    ctx.moveTo(this.wallX, sy - this.hw);
    ctx.lineTo(tipX, sy);
    ctx.lineTo(this.wallX, sy + this.hw);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur  = 8;
    ctx.shadowColor = 'rgba(0,200,255,0.5)';
    ctx.fillStyle   = 'rgba(0,200,255,0.18)';
    ctx.beginPath();
    ctx.arc(tipX, sy, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  checkCollide(drone, cave) {
    if (drone.invincible || drone.shield) return false;
    const sy   = this.screenY(cave);
    const dir  = this.fromLeft ? 1 : -1;
    const tipX = this.wallX + dir * this.len;

    const xMin = Math.min(this.wallX, tipX) - drone.W * 0.44;
    const xMax = Math.max(this.wallX, tipX) + drone.W * 0.44;
    const yMin = sy - this.hw - drone.H * 0.55;
    const yMax = sy + this.hw + drone.H * 0.55;

    return drone.x > xMin && drone.x < xMax &&
           drone.y > yMin && drone.y < yMax;
  }
}

// ── Cave Rock (destructible) ──────────────────────────────────
class CaveRock {
  constructor(caveProgress, cave, x, size, hp) {
    this.cp      = caveProgress;
    this.x       = x;
    this.size    = size;
    this.hp      = hp;
    this.maxHp   = hp;
    this.dead    = false;
    this.flashMs = 0;
    this.rot     = Math.random() * Math.PI * 2;
    const n = 5 + Math.floor(Math.random() * 4);
    this.pts = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + rand(-0.32, 0.32);
      const r = rand(0.58, 1.0);
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
  }

  screenY(cave) { return DRONE_Y - (this.cp - cave.scroll); }

  update(dt) { if (this.flashMs > 0) this.flashMs -= dt; }

  draw(cave) {
    const sy = this.screenY(cave);
    if (sy < -this.size - 10 || sy > H + this.size + 10) return;

    ctx.save();
    ctx.translate(this.x, sy);
    ctx.rotate(this.rot);

    const flash  = this.flashMs > 0;
    const hpPct  = this.hp / this.maxHp;

    ctx.shadowBlur  = flash ? 16 : 5;
    ctx.shadowColor = flash ? '#ff4422' : 'rgba(80,40,180,0.5)';
    ctx.fillStyle   = flash ? '#7a2200' : (hpPct < 0.5 ? '#3a1a08' : '#252040');
    ctx.strokeStyle = flash ? '#ff6633' : 'rgba(100,70,200,0.55)';
    ctx.lineWidth   = 1.4;

    ctx.beginPath();
    this.pts.forEach(([px, py], i) => {
      i === 0 ? ctx.moveTo(px * this.size, py * this.size)
              : ctx.lineTo(px * this.size, py * this.size);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // crack lines when damaged
    if (hpPct < 1 && this.maxHp > 1) {
      ctx.strokeStyle = 'rgba(200,80,30,0.45)';
      ctx.lineWidth   = 0.8;
      ctx.shadowBlur  = 0;
      ctx.beginPath();
      ctx.moveTo(-this.size * 0.25, -this.size * 0.15);
      ctx.lineTo( this.size * 0.18,  this.size * 0.38);
      ctx.stroke();
    }

    // HP bar for multi-HP rocks
    if (this.maxHp > 1) {
      const bw = this.size * 1.8;
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#1a0a00';
      ctx.fillRect(-bw / 2, -this.size - 7, bw, 3);
      ctx.fillStyle  = hpPct > 0.5 ? '#ff6622' : '#ff2200';
      ctx.fillRect(-bw / 2, -this.size - 7, bw * hpPct, 3);
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  hit(dmg = 1) {
    this.hp -= dmg;
    this.flashMs = 110;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return this.dead;
  }

  checkDroneCollide(drone, cave) {
    if (drone.invincible || drone.shield) return false;
    const sy = this.screenY(cave);
    return Math.hypot(this.x - drone.x, sy - drone.y) < this.size * 0.82 + drone.W * 0.38;
  }
}

// spawn a blockade of rocks spanning the cave width
function spawnRockWall(caveProgress, cave, rocks) {
  const segIdx = Math.floor(caveProgress / CFG.SEG_H);
  const seg    = cave.segs[Math.min(segIdx, cave.segs.length - 1)]
               || { left: W * 0.15, right: W * 0.85 };
  const gapW   = seg.right - seg.left;
  const sz     = clamp(gapW / 7.5, 12, 22);
  const step   = sz * 1.95;
  let cx = seg.left + sz;
  while (cx < seg.right - sz * 0.5) {
    const vary = rand(-CFG.SEG_H * 1.5, CFG.SEG_H * 1.5);
    rocks.push(new CaveRock(caveProgress + vary, cave, cx, sz, 1));
    cx += step;
  }
}

// static noise overlay for cutscene
function drawStaticEffect(alpha) {
  const count = Math.floor(W * H * 0.035);
  ctx.fillStyle = `rgba(200,220,255,${alpha})`;
  for (let i = 0; i < count; i++) {
    ctx.fillRect(Math.floor(Math.random() * W), Math.floor(Math.random() * H), 2, 1);
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
    const pad  = Math.min(W, H) * 0.075 + 28;
    // D-pad (left side)
    this.cx   = pad + 6;
    this.cy   = H - pad - 6;
    this.gap  = pad * 0.88;
    this.br   = pad * 0.58;

    // Right action cluster
    const rbr   = pad * 0.78;           // FIRE button radius
    this.firer  = rbr;
    this.firex  = W - rbr - 10;
    this.firey  = H - rbr - 8;

    const sbr   = pad * 0.54;           // SLOW / BOOST radius
    this.sr     = sbr;
    this.scx    = this.firex - rbr - sbr - 6;   // SLOW: left of FIRE
    this.scy    = this.firey;

    this.boostr = sbr;
    this.boostx = this.firex;
    this.boosty = this.firey - rbr - sbr - 8;   // BOOST: above FIRE
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
    KEY.left = KEY.right = KEY.up = KEY.down = KEY.slow = KEY.boost = KEY.fire = false;
    for (const { x, y } of Object.values(this.touchMap)) {
      // right-side action buttons (checked first)
      if (Math.hypot(x - this.firex,  y - this.firey)  < this.firer  + 10) { KEY.fire  = true; continue; }
      if (Math.hypot(x - this.scx,    y - this.scy)    < this.sr     + 10) { KEY.slow  = true; continue; }
      if (Math.hypot(x - this.boostx, y - this.boosty) < this.boostr + 10) { KEY.boost = true; continue; }
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
    const { cx, cy, gap, br, scx, scy, sr,
            firex, firey, firer, boostx, boosty, boostr } = this;

    ctx.save();
    ctx.globalAlpha = 0.54;

    // D-pad backing disc
    ctx.fillStyle   = 'rgba(0,8,22,0.7)';
    ctx.strokeStyle = '#1a3355';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, gap + br + 8, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();

    // D-pad directional buttons
    const dirs = [
      { k:'up',    dx:0,    dy:-gap },
      { k:'down',  dx:0,    dy: gap },
      { k:'left',  dx:-gap, dy:0    },
      { k:'right', dx: gap, dy:0    },
    ];
    for (const { k, dx, dy } of dirs) {
      const bx  = cx + dx, by = cy + dy;
      const act = KEY[k];
      ctx.fillStyle   = act ? '#003a6e' : '#001830';
      ctx.strokeStyle = act ? '#00aaff' : '#003366';
      ctx.lineWidth   = act ? 2 : 1.2;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
    }

    // ── FIRE button (large, bottom-right) ──
    const drone = (typeof G !== 'undefined' && G && G.drone) ? G.drone : null;
    const fa = KEY.fire;
    ctx.fillStyle   = fa ? '#3a0010' : '#1a0008';
    ctx.strokeStyle = fa ? '#ff3366' : '#660022';
    ctx.lineWidth   = fa ? 2.5 : 1.5;
    ctx.shadowBlur  = fa ? 14 : 0;
    ctx.shadowColor = '#ff2244';
    ctx.beginPath();
    ctx.arc(firex, firey, firer, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // weapon-color ring on FIRE button
    const weaponColors = { default:'#ff3366', spread:'#ffee00', homing:'#ff44cc', explosive:'#ff6600' };
    const wColor = drone ? (weaponColors[drone.weapon] || '#ff3366') : '#ff3366';
    ctx.strokeStyle = wColor + (fa ? 'ff' : '88');
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(firex, firey, firer - 4, 0, Math.PI*2);
    ctx.stroke();

    ctx.fillStyle    = fa ? '#ffaabb' : wColor;
    ctx.font         = `bold ${Math.round(firer * 0.36)}px 'Courier New'`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FIRE', firex, firey);

    // weapon label below FIRE text
    if (drone && drone.weapon !== 'default') {
      ctx.font      = `${Math.round(firer * 0.22)}px 'Courier New'`;
      ctx.fillStyle = wColor;
      ctx.fillText(drone.weapon.toUpperCase(), firex, firey + firer * 0.42);
    }

    // ── SLOW button ──
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

    // ── BOOST button ──
    const ba       = KEY.boost;
    const bActive  = drone && drone.boosting;
    const bFail    = drone && drone.boostFailing;
    const bWarn    = drone && !bFail && drone.boostFuel < CFG.BOOST_WARN_AT;
    const bBorderC = bFail ? '#ff2200' : (bWarn ? '#ff8800' : (bActive ? '#44aaff' : '#ff8800'));
    ctx.fillStyle   = bFail ? '#2a0000' : (bActive ? '#001a3a' : '#1a0c00');
    ctx.strokeStyle = bBorderC;
    ctx.lineWidth   = (ba || bActive) ? 2.5 : 1.5;
    ctx.shadowBlur  = (bFail || bActive) ? 12 : 0;
    ctx.shadowColor = bBorderC;
    ctx.beginPath();
    ctx.arc(boostx, boosty, boostr, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    const bLabel = bFail ? 'FAIL!' : (bWarn ? 'WARN' : 'BOOST');
    ctx.fillStyle    = bFail ? '#ff4400' : (bWarn ? '#ffaa00' : (bActive ? '#44ccff' : '#ffaa44'));
    ctx.font         = `bold ${Math.round(boostr * 0.34)}px 'Courier New'`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bLabel, boostx, boosty);

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

// ── Enemy ─────────────────────────────────────────────────────
class Enemy {
  constructor(type, cave) {
    this.type  = type;   // 'scout' | 'gunship'
    this.dead  = false;
    this.hit_  = false;  // hit-flash flag
    this.flashMs = 0;

    const seg = cave.segAt(0);
    this.x  = rand(seg.left + 25, seg.right - 25);
    this.y  = rand(-60, -20);
    this.vx = rand(-1.2, 1.2);
    this.vy = type === 'scout' ? rand(1.8, 3.0) : rand(1.0, 1.8);
    this.hp = type === 'scout' ? 1 : 3;
    this.maxHp = this.hp;
    this.shootTimer = rand(90, 160);
    this.ph   = Math.random() * Math.PI * 2;
    this.W    = type === 'scout' ? 16 : 22;
    this.H    = type === 'scout' ? 12 : 18;
    this.lootDrop = null;  // 'LIFE' if this enemy guarantees a life drop
  }

  update(dt, cave, drone, enemyBullets) {
    this.ph += 0.04;

    if (this.type === 'scout') {
      this.vx += Math.sin(this.ph * 1.3) * 0.18;
      this.vx  = clamp(this.vx, -3.0, 3.0);
    } else {
      // gunship drifts toward drone x
      const dxToDrone = drone.x - this.x;
      this.vx += Math.sign(dxToDrone) * 0.04;
      this.vx  = clamp(this.vx, -2.0, 2.0);
    }

    this.x += this.vx;
    this.y += this.vy;

    // clamp to cave at current y
    if (this.y > 0 && this.y < H) {
      const seg = cave.segAt(this.y);
      this.x = clamp(this.x, seg.left + this.W, seg.right - this.W);
    }

    // gunship shoots
    if (this.type === 'gunship') {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = rand(1400, 2600);
        const dx = drone.x - this.x;
        const dy = drone.y - this.y;
        const d  = Math.hypot(dx, dy);
        if (d < 420) {
          const spd = CFG.ENEMY_BULLET_SPD;
          enemyBullets.push(new EnemyBullet(this.x, this.y, dx/d*spd, dy/d*spd));
        }
      }
    }

    if (this.flashMs > 0) this.flashMs -= dt;
    if (this.y > H + 50) this.dead = true;
  }

  hit(dmg = 1) {
    this.hp -= dmg;
    this.flashMs = 120;
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }

  draw() {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x, this.y);

    const w = this.W, h = this.H;
    const flash = this.flashMs > 0;

    if (this.type === 'scout') {
      // red scout — sleek triangle pointing down
      ctx.fillStyle = flash ? '#ff8866' : '#7a1010';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(w*0.55, -h*0.6);
      ctx.lineTo(0, -h*0.15);
      ctx.lineTo(-w*0.55, -h*0.6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = flash ? '#ffaa88' : '#cc2200';
      ctx.beginPath();
      ctx.moveTo(0, h*0.7);
      ctx.lineTo(w*0.32, -h*0.4);
      ctx.lineTo(0, -h*0.05);
      ctx.lineTo(-w*0.32, -h*0.4);
      ctx.closePath();
      ctx.fill();

      // engine glow (front = down)
      ctx.fillStyle = 'rgba(255,80,20,0.7)';
      ctx.shadowBlur = 6; ctx.shadowColor = '#ff3300';
      ctx.beginPath();
      ctx.ellipse(0, h*0.9, 4, 3, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // orange gunship — heavier shape
      ctx.fillStyle = flash ? '#ffaa44' : '#5a2800';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(w*0.7, h*0.2);
      ctx.lineTo(w*0.55, -h*0.7);
      ctx.lineTo(-w*0.55, -h*0.7);
      ctx.lineTo(-w*0.7, h*0.2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = flash ? '#ffcc66' : '#cc5500';
      ctx.beginPath();
      ctx.moveTo(0, h*0.6);
      ctx.lineTo(w*0.38, -h*0.1);
      ctx.lineTo(0, -h*0.5);
      ctx.lineTo(-w*0.38, -h*0.1);
      ctx.closePath();
      ctx.fill();

      // gun barrels
      ctx.strokeStyle = flash ? '#ffcc88' : '#ff6600';
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 4; ctx.shadowColor = '#ff4400';
      [w*0.38, -w*0.38].forEach(bx => {
        ctx.beginPath();
        ctx.moveTo(bx, h*0.4);
        ctx.lineTo(bx, h*1.1);
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
    }

    // HP bar (only when damaged)
    if (this.hp < this.maxHp) {
      const bw = w * 1.4;
      ctx.fillStyle = '#330000';
      ctx.fillRect(-bw/2, -h - 7, bw, 4);
      ctx.fillStyle = '#ff3300';
      ctx.fillRect(-bw/2, -h - 7, bw * (this.hp / this.maxHp), 4);
    }

    ctx.restore();
  }
}

// ── Enemy Bullet ──────────────────────────────────────────────
class EnemyBullet {
  constructor(x, y, vx, vy) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.r   = 4.5;
    this.dead = false;
    this.ph   = 0;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.ph += 0.15;
    if (this.y > H + 20 || this.y < -20 || this.x < -20 || this.x > W + 20) this.dead = true;
  }
  draw() {
    const glo = 0.7 + 0.3 * Math.sin(this.ph);
    ctx.fillStyle   = `rgba(255,80,0,${glo})`;
    ctx.shadowBlur  = 10;
    ctx.shadowColor = '#ff3300';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  checkHit(drone) {
    if (drone.invincible || drone.shield) return false;
    return Math.hypot(this.x - drone.x, this.y - drone.y) < this.r + 14;
  }
}

// ── Player Bullet ─────────────────────────────────────────────
class PlayerBullet {
  constructor(x, y, vx, vy, type = 'default') {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.type = type;
    this.dead = false;
    this.r    = type === 'explosive' ? 7 : 3;
    this.ph   = 0;
  }

  update(enemies) {
    if (this.type === 'homing') {
      let closest = null, minD = 320;
      for (const e of enemies) {
        if (!e.dead) {
          const d = Math.hypot(e.x - this.x, e.y - this.y);
          if (d < minD) { minD = d; closest = e; }
        }
      }
      if (closest) {
        const dx = closest.x - this.x;
        const dy = closest.y - this.y;
        const d  = Math.hypot(dx, dy) || 1;
        const spd = Math.hypot(this.vx, this.vy);
        this.vx = lerp(this.vx, dx/d * spd, 0.12);
        this.vy = lerp(this.vy, dy/d * spd, 0.12);
      }
    }
    this.x += this.vx; this.y += this.vy;
    this.ph += 0.2;
    if (this.y < -40 || this.y > H + 40 || this.x < -40 || this.x > W + 40) this.dead = true;
  }

  draw() {
    const colors = { default:'#00ffcc', spread:'#ffee00', homing:'#ff44cc', explosive:'#ff6600' };
    const color  = colors[this.type] || '#00ffcc';
    ctx.save();
    ctx.translate(this.x, this.y);
    const ang = Math.atan2(this.vy, this.vx);
    ctx.rotate(ang + Math.PI / 2);
    ctx.shadowBlur  = 9;
    ctx.shadowColor = color;
    ctx.fillStyle   = color;
    if (this.type === 'explosive') {
      const pulse = 1 + 0.2 * Math.sin(this.ph);
      ctx.beginPath();
      ctx.arc(0, 0, this.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      // ring
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.2;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, this.r * pulse * 1.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, this.r, this.r * 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // returns score if hit, 0 if not; also handles rock hits
  checkHit(enemies, parts, floatTexts, rocks = []) {
    // check enemies
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      const hitR = this.type === 'explosive' ? 44 : this.r + e.W * 0.8;
      if (d < hitR) {
        const killed = e.hit(this.type === 'explosive' ? 3 : 1);
        this.dead = true;
        if (killed) {
          const pts = e.type === 'scout' ? 150 : 400;
          floatTexts.push(new FloatText(e.x, e.y, `+${pts}`, e.type === 'scout' ? '#ff6644' : '#ff8800'));
          for (let i = 0; i < (e.type === 'scout' ? 10 : 18); i++)
            parts.push(new Particle(e.x, e.y, e.type === 'scout' ? '#ff3300' : '#ff7700'));
          return pts;
        }
        for (let i = 0; i < 5; i++)
          parts.push(new Particle(this.x, this.y, '#ff8844', 0.6));
        return 0;
      }
    }
    // check rocks (uses screen-space Y stored on rock via _screenYCache)
    for (const r of rocks) {
      if (r.dead) continue;
      const sy  = r._screenYCache !== undefined ? r._screenYCache : 9999;
      const d   = Math.hypot(r.x - this.x, sy - this.y);
      const hitR = this.type === 'explosive' ? 40 : this.r + r.size * 0.75;
      if (d < hitR) {
        const destroyed = r.hit(this.type === 'explosive' ? 3 : 1);
        this.dead = true;
        if (destroyed) {
          for (let i = 0; i < 12; i++)
            parts.push(new Particle(r.x, sy, i % 2 === 0 ? '#aa6622' : '#554422', 1.2));
          floatTexts.push(new FloatText(r.x, sy - 8, '+ROCK', '#cc8833'));
          return 'rock';   // signal rock destroyed to Game
        }
        for (let i = 0; i < 4; i++)
          parts.push(new Particle(this.x, this.y, '#885522', 0.7));
        return 0;
      }
    }
    return 0;
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

// ── Boost Bar ─────────────────────────────────────────────────
function drawBoostBar(drone) {
  const bx  = W - 38;
  const by  = H - 172;
  const bw  = 10;
  const bh  = 78;
  const pct = drone.boostFuel / CFG.BOOST_FUEL_MAX;
  const t   = Date.now() * 0.009;

  ctx.fillStyle = '#001008';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#002310';
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx, by, bw, bh);

  if (pct > 0) {
    const fh      = bh * pct;
    const warning = drone.boostFuel < CFG.BOOST_WARN_AT;
    const pulse   = warning ? 0.65 + 0.35 * Math.abs(Math.sin(t * 1.6)) : 1;
    const grad    = ctx.createLinearGradient(0, by + bh - fh, 0, by + bh);
    if (drone.boostFailing) {
      // red dregs
      grad.addColorStop(0, `rgba(255,30,0,${pulse})`);
      grad.addColorStop(1, `rgba(120,0,0,${pulse})`);
    } else if (warning) {
      grad.addColorStop(0, `rgba(255,${Math.floor(140 + 80 * pulse)},0,${pulse})`);
      grad.addColorStop(1, `rgba(180,60,0,${pulse})`);
    } else {
      grad.addColorStop(0, '#44eeff');
      grad.addColorStop(1, '#0055cc');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by + bh - fh, bw, fh);
  }

  // warning threshold tick mark at 1/3 height (=10s/30s)
  const warnY = by + bh - bh * (CFG.BOOST_WARN_AT / CFG.BOOST_FUEL_MAX);
  ctx.strokeStyle = 'rgba(255,120,0,0.4)';
  ctx.lineWidth   = 0.8;
  ctx.beginPath();
  ctx.moveTo(bx, warnY); ctx.lineTo(bx + bw, warnY);
  ctx.stroke();

  const lbl = drone.boostFailing ? 'FAIL' : 'BOOST';
  const lc  = drone.boostFailing ? '#ff3300' :
               (drone.boostFuel < CFG.BOOST_WARN_AT ? '#ff8800' : '#226633');
  ctx.fillStyle    = lc;
  ctx.font         = '7px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(lbl, bx + bw / 2, by + bh + 4);
}

// ── Header HUD (top bar) ─────────────────────────────────────
function drawHeader(game) {
  const drone = game.drone;
  const now   = Date.now();

  // panel background
  ctx.fillStyle = 'rgba(0,5,16,0.92)';
  ctx.fillRect(0, 0, W, HUD_H);

  // bottom border glow
  ctx.strokeStyle = 'rgba(0,200,255,0.5)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.moveTo(0, HUD_H); ctx.lineTo(W, HUD_H); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,200,255,0.12)';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(0, HUD_H - 2); ctx.lineTo(W, HUD_H - 2); ctx.stroke();

  // ── layout: divide header into sections ─────────────────────
  const mid  = HUD_H / 2;
  const pad  = 10;
  let   ox   = pad;

  const small = (txt, x, y, color = 'rgba(0,130,170,0.8)') => {
    ctx.fillStyle    = color;
    ctx.font         = '7px Courier New';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
  };
  const big = (txt, x, y, color, size = 18) => {
    ctx.fillStyle    = color;
    ctx.font         = `bold ${size}px "Courier New"`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
  };
  const vsep = (x) => {
    ctx.strokeStyle = 'rgba(0,180,255,0.2)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, HUD_H - 6); ctx.stroke();
  };

  // ── LEVEL ────────────────────────────────────────────────────
  small('LVL', ox, mid - 8);
  const lvlPulse = 0.72 + 0.28 * Math.sin(now * 0.002);
  ctx.shadowBlur = 8 * lvlPulse; ctx.shadowColor = '#00ffff';
  big(String(game.level), ox, mid + 6, `rgba(0,255,255,${lvlPulse})`, 16);
  ctx.shadowBlur = 0;
  ox += ctx.measureText(String(game.level)).width + 18;

  vsep(ox - 8);

  // ── SCORE ────────────────────────────────────────────────────
  small('SCORE', ox, mid - 8);
  big(game.score.toLocaleString(), ox, mid + 6, '#00ffcc', 14);
  ox += Math.max(ctx.measureText(game.score.toLocaleString()).width, 70) + 16;

  vsep(ox - 8);

  // ── MULTIPLIER ───────────────────────────────────────────────
  const mult      = game.scoreMultiplier || 1;
  const multColor = mult >= 4 ? '#ff4400' : mult >= 2 ? '#ff9900' : 'rgba(60,80,100,0.9)';
  small('MULT', ox, mid - 8);
  if (mult > 1) { ctx.shadowBlur = 6; ctx.shadowColor = multColor; }
  big(`×${mult.toFixed(1)}`, ox, mid + 6, multColor, 14);
  ctx.shadowBlur = 0;
  ox += 52;

  vsep(ox - 8);

  // ── HULL (life pips) ─────────────────────────────────────────
  small('HULL', ox, mid - 8);
  const lives = drone ? drone.lives : 0;
  const pipW = 9, pipGap = 3;
  let pipX = ox;
  const pipY = mid + 6;
  for (let i = 0; i < CFG.MAX_LIVES; i++) {
    ctx.fillStyle  = i < lives ? '#ff3355' : '#221122';
    ctx.shadowBlur = i < lives ? 4 : 0; ctx.shadowColor = '#ff3355';
    ctx.beginPath();
    ctx.moveTo(pipX + pipW / 2, pipY - 5);
    ctx.lineTo(pipX + pipW,     pipY);
    ctx.lineTo(pipX + pipW / 2, pipY + 5);
    ctx.lineTo(pipX,            pipY);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    pipX += pipW + pipGap;
  }
  ox += CFG.MAX_LIVES * (pipW + pipGap) + 14;

  vsep(ox - 8);

  // ── ACTIVE STATUS ────────────────────────────────────────────
  let statusStr = 'NOMINAL';
  let statusColor = 'rgba(50,80,90,0.8)';
  if (drone) {
    if (drone.weapon !== 'default') {
      const wc = { spread:'#ffee00', homing:'#ff44cc', explosive:'#ff6600' };
      statusStr  = drone.weapon.toUpperCase();
      statusColor = wc[drone.weapon] || '#fff';
    } else if (drone.shield) {
      statusStr = 'SHIELD'; statusColor = '#44aaff';
    } else if (drone.speedBoost) {
      statusStr = 'SPEED+'; statusColor = '#00ff88';
    } else if (drone.magnet) {
      statusStr = 'MAGNET'; statusColor = '#cc44ff';
    }
  }
  small('STATUS', ox, mid - 8);
  big(statusStr, ox, mid + 6, statusColor, 12);
  ox += Math.max(ctx.measureText(statusStr).width + 4, 62) + 14;

  vsep(ox - 8);

  // ── RING CRYSTALS ─────────────────────────────────────────────
  small('CRYSTALS', ox, mid - 8);
  const ringCount   = game.ringCount || 0;
  const ringPulse   = 0.6 + 0.4 * Math.sin(now * 0.004);
  const ringColor   = ringCount > 0 ? `rgba(0,230,255,${ringPulse})` : 'rgba(0,70,90,0.6)';
  if (ringCount > 0) { ctx.shadowBlur = 6 * ringPulse; ctx.shadowColor = '#00eeff'; }
  big(String(ringCount), ox, mid + 6, ringColor, 14);
  ctx.shadowBlur = 0;
  ox += Math.max(ctx.measureText(String(ringCount)).width, 32) + 18;

  vsep(ox - 8);

  // ── POWER BARS (SLOW / BOOST / DEPTH) ────────────────────────
  // remaining space for bars
  const barsStart  = ox;
  const barsEnd    = W - pad;
  const barsWidth  = barsEnd - barsStart;
  const barCount   = 3;
  const barSlotW   = Math.floor(barsWidth / barCount);
  const barH       = 7;
  const barLabelY  = mid - 7;
  const barY       = mid + 2;

  const drawBar = (label, value, maxVal, x, colorA, colorB, warn = false, fail = false) => {
    const bw   = barSlotW - 14;
    const pct  = Math.max(0, Math.min(1, value / maxVal));
    const lc   = fail ? '#ff3300' : warn ? '#ff8800' : 'rgba(0,130,170,0.8)';
    small(label, x, barLabelY, lc);
    ctx.fillStyle = 'rgba(0,20,35,0.8)';
    ctx.fillRect(x, barY, bw, barH);
    if (pct > 0) {
      const g = ctx.createLinearGradient(x, 0, x + bw, 0);
      if (fail)       { g.addColorStop(0,'#660000'); g.addColorStop(1,'#ff2200'); }
      else if (warn)  { g.addColorStop(0,'#883300'); g.addColorStop(1,'#ffaa00'); }
      else            { g.addColorStop(0, colorA);   g.addColorStop(1, colorB);   }
      ctx.fillStyle = g;
      ctx.fillRect(x, barY, bw * pct, barH);
    }
    ctx.strokeStyle = 'rgba(0,100,150,0.3)'; ctx.lineWidth = 1;
    ctx.strokeRect(x, barY, bw, barH);
  };

  const bFail = drone && drone.boostFailing;
  const bWarn = drone && !bFail && drone.boostFuel < CFG.BOOST_WARN_AT;
  const bPct  = drone ? drone.boostFuel / CFG.BOOST_FUEL_MAX : 0;

  drawBar('SLOW',  game.sFuel,           CFG.SLOW_MAX,       barsStart,              '#0044cc','#00bbff', game.sFuel < 25);
  drawBar('BOOST', drone ? drone.boostFuel : 0, CFG.BOOST_FUEL_MAX, barsStart + barSlotW,   '#0055cc','#44eeff', bWarn, bFail);
  drawBar('DEPTH', game.distanceDone||0, game.levelDist||1,  barsStart + barSlotW*2, '#004422','#00ff66');

  // reset
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowBlur   = 0;
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

    this.cave          = null;
    this.drone         = null;
    this.pups          = [];
    this.crystals      = [];
    this.rings         = [];
    this.ringCount     = 0;
    this.stalas        = [];
    this.rocks         = [];
    this.enemies       = [];
    this.playerBullets = [];
    this.enemyBullets  = [];
    this.parts         = [];
    this.ftexts        = [];
    this.waveTimer     = 0;
    this.scoreMultiplier = 1;
    this.distanceDone    = 0;
    this.levelDist       = CFG.LEVEL_DIST;
    this.cutPhase        = '';
    this.cutTimer        = 0;
    this.cutBonus        = 0;
    this.cutTallyAmt     = 0;
    this.cutCrystalBonus = 0;
    this.cutCrystalTally = 0;
    this.dpad         = new DPad();
    this.slines       = new SpeedLines();

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
        <span>▲▼◀▶</span> or WASD — navigate<br>
        <span>FIRE</span> (Z/F) — shoot enemies<br>
        <span>SLOW</span> (Space) — brake<br>
        <span>BOOST</span> (E/B) — 8s speed surge<br>
        &nbsp;&nbsp;→ <span style="color:#ff6600">HEAT</span> cooldown after boost<br><br>
        <span style="color:#00ffcc">⬡ +TIME</span> &nbsp;+15s &nbsp;
        <span style="color:#ffdd00">⬡ +500</span> &nbsp;bonus<br>
        <span style="color:#ff3366">⬡ +LIFE</span> &nbsp;&nbsp;&nbsp;&nbsp;
        <span style="color:#44aaff">⬡ SHIELD</span> 8s<br>
        <span style="color:#cc44ff">⬡ MAGNET</span> crystal pull<br>
        <span style="color:#ffee00">⬡ SPREAD</span> 5-way shot<br>
        <span style="color:#ff44cc">⬡ LOCK-ON</span> homing<br>
        <span style="color:#ff6600">⬡ BOMBS</span> explosive AOE<br><br>
        <span style="color:#44ffcc">◆ crystals</span> +50 each<br>
        Dodge <span style="color:#336688">rock spikes</span> — enemy waves arrive fast
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
    this.cave          = new Cave(this.level);
    this.drone         = new Drone();
    this.pups          = [];
    this.crystals      = [];
    this.rings         = [];
    this.ringCount     = 0;
    this.stalas        = [];
    this.rocks         = [];
    this.enemies       = [];
    this.playerBullets = [];
    this.enemyBullets  = [];
    this.parts         = [];
    this.ftexts        = [];
    this.waveTimer     = CFG.WAVE_INTERVAL * 0.45;
    this.sFuel         = CFG.SLOW_MAX;
    this.scroll        = CFG.BASE_SCROLL * Math.pow(1 + CFG.LVL_INC, this.level - 1);
    this.scoreMultiplier = 1;
    this.distanceDone  = 0;
    this.levelDist     = CFG.LEVEL_DIST + (this.level - 1) * CFG.LEVEL_DIST_INC;
    this.state         = 'playing';
    shakeMs            = 0;
    hideScreen();
    document.getElementById('hud').classList.add('hidden');
  }

  // ── Game Loop ───────────────────────────────────────────────
  _loop(ts) {
    requestAnimationFrame(t => this._loop(t));
    const dt = Math.min(ts - this.lastTs, 50);
    this.lastTs = ts;
    this.frame++;

    if (this.state === 'playing')  this._update(dt);
    if (this.state === 'levelcut') this._updateCut(dt);
    this._draw(dt);
  }

  // ── Update ──────────────────────────────────────────────────
  _update(dt) {

    // slow fuel
    const slowOn = KEY.slow && this.sFuel > 0;
    this.sFuel = clamp(this.sFuel + (slowOn ? -CFG.SLOW_DRAIN : CFG.SLOW_REGEN), 0, CFG.SLOW_MAX);

    // boost speed multiplier — failure drops to ~old default speed
    let boostMult = 1;
    if (this.drone.boostFailing)  boostMult = CFG.BOOST_FAIL_MULT;
    else if (this.drone.boosting) boostMult = CFG.BOOST_MULT;
    const effScroll = this.scroll * boostMult * (slowOn ? CFG.SLOW_MULT : 1);

    // distance-based level completion
    this.distanceDone += effScroll;
    if (this.distanceDone >= this.levelDist) { this._levelDone(); return; }

    // cave advance
    this.cave.update(effScroll);

    // drone
    this.drone.update(dt);

    // passive score (multiplied)
    this.score += Math.round((slowOn ? 1 : 2) * this.scoreMultiplier);

    // spawn power-ups
    if (Math.random() < CFG.PU_CHANCE * (effScroll / CFG.BASE_SCROLL)) {
      const ahead = this.cave.scroll + DRONE_Y + rand(CFG.PU_AHEAD_MIN, CFG.PU_AHEAD_MAX);
      this.pups.push(new PowerUp(ahead, this.cave));
    }

    // spawn crystals
    if (Math.random() < CFG.CRYSTAL_CHANCE * (effScroll / CFG.BASE_SCROLL)) {
      const ahead = this.cave.scroll + DRONE_Y + rand(180, 520);
      this.crystals.push(new Crystal(ahead, this.cave));
    }

    // spawn stalactites (from level 2+, gap must be wide enough)
    if (this.level >= 2 && Math.random() < CFG.STALA_CHANCE * (effScroll / CFG.BASE_SCROLL)) {
      const ahead   = this.cave.scroll + DRONE_Y + rand(300, 850);
      const segIdx  = Math.floor(ahead / CFG.SEG_H);
      const seg     = this.cave.segs[Math.min(segIdx, this.cave.segs.length - 1)];
      if (seg && seg.right - seg.left > 120) {
        this.stalas.push(new Stalactite(ahead, this.cave));
      }
    }

    // spawn individual rocks
    const rockSpawnMult = effScroll / CFG.BASE_SCROLL;
    if (Math.random() < CFG.ROCK_CHANCE * rockSpawnMult) {
      const ahead  = this.cave.scroll + DRONE_Y + rand(CFG.ROCK_AHEAD_MIN, CFG.ROCK_AHEAD_MAX);
      const segIdx = Math.floor(ahead / CFG.SEG_H);
      const seg    = this.cave.segs[Math.min(segIdx, this.cave.segs.length - 1)]
                   || { left: W * 0.15, right: W * 0.85 };
      const gapW   = seg.right - seg.left;
      if (gapW > 80) {
        const x  = rand(seg.left + 20, seg.right - 20);
        const sz = rand(12, Math.min(24, gapW * 0.14));
        const hp = Math.random() < 0.35 ? 2 : 1;
        this.rocks.push(new CaveRock(ahead, this.cave, x, sz, hp));
      }
    }
    // spawn rock wall blockades
    if (Math.random() < CFG.ROCKWALL_CHANCE * rockSpawnMult) {
      const ahead = this.cave.scroll + DRONE_Y + rand(CFG.ROCK_AHEAD_MIN, CFG.ROCK_AHEAD_MAX);
      spawnRockWall(ahead, this.cave, this.rocks);
    }

    // rock update, cache screen Y, collision with drone
    for (const r of this.rocks) {
      r.update(dt);
      r._screenYCache = r.screenY(this.cave);
      if (!r.dead && r.checkDroneCollide(this.drone, this.cave)) {
        triggerShake(6, 280);
        this._burst(this.drone.x, this.drone.y, '#aa6622', 12);
        r.dead = true;
        this._loseRings();
        const dead = this.drone.hit();
        if (dead) { this._gameOver(); return; }
      }
    }
    this.rocks = this.rocks.filter(r => !r.dead && r._screenYCache > -80);

    // power-up update + collect
    for (const p of this.pups) {
      p.update();
      if (!p.collected && p.checkCollect(this.drone, this.cave)) {
        p.collected = true;
        this._collect(p);
      }
    }
    this.pups = this.pups.filter(p => !p.collected && p.screenY(this.cave) > -80);

    // crystal update + collect
    const magnetOn = this.drone.magnet;
    for (const c of this.crystals) {
      c.update();
      if (!c.collected && c.checkCollect(this.drone, this.cave, magnetOn)) {
        c.collected = true;
        const cPts = Math.round(50 * this.scoreMultiplier);
        this.score += cPts;
        this._burst(c.x, c.screenY(this.cave), c.color, 6);
        this.ftexts.push(new FloatText(c.x, c.screenY(this.cave) - 8, `+${cPts}`, c.color));
      }
    }
    this.crystals = this.crystals.filter(c => !c.collected && c.screenY(this.cave) > -60);

    // consume cave spawn hints → ring crystal clusters
    while (this.cave.spawnHints.length > 0) {
      this._spawnRingCluster(this.cave.spawnHints.shift());
    }

    // ring crystal update + collect
    for (const rc of this.rings) {
      rc.update();
      if (!rc.collected && rc.checkCollect(this.drone, this.cave, magnetOn)) {
        rc.collected = true;
        this.ringCount++;
        this._burst(rc.x, rc.screenY(this.cave), '#00eeff', 8);
        this.ftexts.push(new FloatText(rc.x, rc.screenY(this.cave) - 10, '◆', '#00eeff'));
      }
    }
    this.rings = this.rings.filter(rc => !rc.collected && rc.screenY(this.cave) > -60);

    // stalactite collision
    for (const s of this.stalas) {
      if (s.checkCollide(this.drone, this.cave)) {
        triggerShake(7, 320);
        this._burst(this.drone.x, this.drone.y, '#ff6622', 14);
        this._loseRings();
        const dead = this.drone.hit();
        if (dead) { this._gameOver(); return; }
        break;
      }
    }
    this.stalas = this.stalas.filter(s => s.screenY(this.cave) > -80);

    // ── FIRE ──────────────────────────────────────────────────
    if (KEY.fire && this.drone.fireTimer <= 0) {
      this.drone.fireTimer = CFG.FIRE_RATE;
      const bx = this.drone.x, by = this.drone.y - this.drone.H;
      const spd = CFG.BULLET_SPD;
      const w = this.drone.weapon;
      if (w === 'spread') {
        [-28, -14, 0, 14, 28].forEach(deg => {
          const rad = deg * Math.PI / 180;
          this.playerBullets.push(new PlayerBullet(bx, by, Math.sin(rad)*spd, -Math.cos(rad)*spd, 'spread'));
        });
      } else if (w === 'homing') {
        this.playerBullets.push(new PlayerBullet(bx, by, 0, -spd, 'homing'));
      } else if (w === 'explosive') {
        this.playerBullets.push(new PlayerBullet(bx, by, 0, -spd * 0.62, 'explosive'));
      } else {
        // default: tight double shot
        this.playerBullets.push(new PlayerBullet(bx - 5, by, -0.6, -spd, 'default'));
        this.playerBullets.push(new PlayerBullet(bx + 5, by,  0.6, -spd, 'default'));
      }
    }

    // ── ENEMY WAVES ───────────────────────────────────────────
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      const waveSize = Math.min(Math.round((4 + Math.floor(this.level * 1.4)) * 1.2), 19);
      const mixed    = this.level >= 2;
      const lifeDropIdx = (this.level % 2 === 0) ? Math.floor(Math.random() * waveSize) : -1;
      for (let i = 0; i < waveSize; i++) {
        const type = mixed && Math.random() < 0.42 ? 'gunship' : 'scout';
        const e    = new Enemy(type, this.cave);
        e.x = rand(60, W - 60);
        e.y = -30 - i * 45;
        if (i === lifeDropIdx) e.lootDrop = 'LIFE';
        this.enemies.push(e);
      }
      this.waveTimer = CFG.WAVE_INTERVAL;
    }

    // ── UPDATE ENEMIES ────────────────────────────────────────
    for (const e of this.enemies)
      e.update(dt, this.cave, this.drone, this.enemyBullets);
    this.enemies = this.enemies.filter(e => !e.dead);

    // ── UPDATE PLAYER BULLETS + HIT ENEMIES + HIT ROCKS ─────
    for (const b of this.playerBullets) {
      b.update(this.enemies);
      if (!b.dead) {
        const result = b.checkHit(this.enemies, this.parts, this.ftexts, this.rocks);
        if (result === 'rock') {
          // find the destroyed rock and drop a power-up
          this._rockDropLoot(b.x, b.y);
        } else if (result) {
          this.score += Math.round(result * this.scoreMultiplier);
        }
      }
    }
    this.playerBullets = this.playerBullets.filter(b => !b.dead);

    // ── ENEMY LOOT DROPS ──────────────────────────────────────
    for (const e of this.enemies) {
      if (e.dead && e.lootDrop) {
        const cp = this.cave.scroll + (DRONE_Y - e.y);
        const pu = new PowerUp(cp, this.cave);
        pu.type = e.lootDrop;
        pu.cfg  = PU_TYPES[e.lootDrop];
        pu.x    = clamp(e.x, 30, W - 30);
        this.pups.push(pu);
        e.lootDrop = null;
      }
    }

    // ── UPDATE ENEMY BULLETS + HIT DRONE ──────────────────────
    for (const b of this.enemyBullets) {
      b.update();
      if (!b.dead && b.checkHit(this.drone)) {
        b.dead = true;
        triggerShake(5, 220);
        this._burst(this.drone.x, this.drone.y, '#ff5522', 10);
        this._loseRings();
        const dead = this.drone.hit();
        if (dead) { this._gameOver(); return; }
      }
    }
    this.enemyBullets = this.enemyBullets.filter(b => !b.dead);

    // ── DRONE / ENEMY COLLISION ───────────────────────────────
    if (!this.drone.invincible && !this.drone.shield) {
      for (const e of this.enemies) {
        if (!e.dead && Math.hypot(e.x - this.drone.x, e.y - this.drone.y) < e.W + this.drone.W * 0.6) {
          e.hit(999); // destroy enemy on ram
          triggerShake(8, 350);
          this._burst(this.drone.x, this.drone.y, '#ff3300', 16);
          this._loseRings();
          const dead = this.drone.hit();
          if (dead) { this._gameOver(); return; }
          break;
        }
      }
    }

    // ── CAVE WALL COLLISION ────────────────────────────────────
    // collision
    if (this.drone.collidesWith(this.cave)) {
      triggerShake(7, 320);
      this._burst(this.drone.x, this.drone.y, '#ff3344', 18);
      this._loseRings();
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

    // (dashboard is drawn on canvas — no HTML HUD update needed)
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
        break;
      case 'SHIELD':
        this.drone.shield   = true;
        this.drone.shieldMs = CFG.SHIELD_MS;
        break;
      case 'MAGNET':
        this.drone.magnet   = true;
        this.drone.magnetMs = CFG.MAGNET_MS;
        break;
      case 'SPREAD':
        this.drone.weapon   = 'spread';
        this.drone.weaponMs = CFG.WEAPON_MS;
        break;
      case 'HOMING':
        this.drone.weapon   = 'homing';
        this.drone.weaponMs = CFG.WEAPON_MS;
        break;
      case 'EXPLOSIVE':
        this.drone.weapon   = 'explosive';
        this.drone.weaponMs = CFG.WEAPON_MS;
        break;
      case 'MULT':
        this.scoreMultiplier = Math.min(CFG.SCORE_MULT_MAX, this.scoreMultiplier * 2);
        this.ftexts.push(new FloatText(pu.x, sy - 28, `×${this.scoreMultiplier.toFixed(0)}`, '#ff9900'));
        break;
      case 'SPEED':
        this.drone.speedBoost = true;
        this.drone.speedMs    = CFG.SPEED_MS;
        break;
    }
  }

  // randomly drop loot from a destroyed rock
  _rockDropLoot(x, y) {
    if (Math.random() > 0.32) return;   // 32% drop chance
    const roll = Math.random();
    let type;
    if      (roll < 0.28) type = 'MULT';
    else if (roll < 0.48) type = 'SHIELD';
    else if (roll < 0.66) type = 'SPEED';
    else if (roll < 0.80) type = 'POINTS';
    else {
      // random weapon
      const w = ['SPREAD','HOMING','EXPLOSIVE'];
      type = w[Math.floor(Math.random() * w.length)];
    }
    // create a fake PowerUp at this screen position (convert to cave coords)
    const cp = this.cave.scroll + (DRONE_Y - y);
    const pu = new PowerUp(cp, this.cave);
    pu.type  = type;
    pu.cfg   = PU_TYPES[type];
    pu.x     = clamp(x + rand(-20, 20), 30, W - 30);
    this.pups.push(pu);
  }

  _spawnRingCluster(hint) {
    const { cp, type, cx, gap } = hint;
    if (type === 'apex') {
      // arc of rings spread across the passage opening
      const count = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const x = cx - gap * 0.32 + t * gap * 0.64;
        this.rings.push(new RingCrystal(cp, clamp(x, 30, W - 30)));
      }
    } else {
      // line of rings along travel direction, centered in passage
      const count = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const x = cx + rand(-18, 18);
        this.rings.push(new RingCrystal(cp + i * 38, clamp(x, 30, W - 30)));
      }
    }
  }

  _loseRings() {
    if (this.ringCount <= 0) return;
    const lost = Math.ceil(this.ringCount / 2);
    this.ringCount = Math.floor(this.ringCount / 2);
    this.ftexts.push(new FloatText(this.drone.x, this.drone.y - 22, `-${lost} ◆`, '#ff4488'));
  }

  _burst(x, y, color, n) {
    for (let i = 0; i < n; i++) this.parts.push(new Particle(x, y, color));
  }

  // ── Level Done — starts canvas cutscene ─────────────────────
  _levelDone() {
    this.state           = 'levelcut';
    this.cutPhase        = 'tally';
    this.cutTimer        = 0;
    this.cutBonus        = Math.floor(this.level * 800 * this.scoreMultiplier);
    this.cutTallyAmt     = 0;
    this.cutCrystalBonus = this.ringCount * 1700;
    this.cutCrystalTally = 0;
    document.getElementById('hud').classList.add('hidden');
  }

  _updateCut(dt) {
    this.cutTimer += dt;
    const autopilotSpd = CFG.BASE_SCROLL * 0.55;
    this.cave.update(autopilotSpd);

    // autopilot drone
    if (this.drone) {
      const aimX = W / 2;
      this.drone.x      = lerp(this.drone.x, aimX, 0.04);
      this.drone.y      = lerp(this.drone.y, DRONE_Y, 0.06);
      this.drone.vx    *= 0.82;
      this.drone.vy    *= 0.82;
      this.drone.tilt   = lerp(this.drone.tilt, 0, 0.12);
      this.drone.thrustPh += 0.28;
    }

    if (this.cutPhase === 'tally') {
      const progress = Math.min(1, this.cutTimer / CFG.CUT_TALLY_MS);
      this.cutTallyAmt     = Math.floor(this.cutBonus * progress);
      this.cutCrystalTally = Math.floor(this.cutCrystalBonus * progress);
      if (this.cutTimer >= CFG.CUT_TALLY_MS) {
        this.score += this.cutBonus + this.cutCrystalBonus;
        this.cutPhase = 'count';
        this.cutTimer = 0;
      }
    } else if (this.cutPhase === 'count') {
      const idx = Math.floor(this.cutTimer / CFG.CUT_COUNT_MS);
      if (idx >= 4) {
        this.level++;
        this._startLevel();
      }
    }
  }

  _drawCut() {
    const caveW = W;
    const cx    = W / 2;
    const t     = Date.now();

    if (this.cutPhase === 'tally') {
      const alpha = Math.min(1, this.cutTimer / 420);
      ctx.fillStyle = `rgba(0,0,20,${0.52 * alpha})`;
      ctx.fillRect(0, HUD_H, caveW, H - HUD_H);

      const glow = 0.75 + 0.25 * Math.sin(t * 0.0028);
      ctx.save();
      ctx.shadowBlur  = 22 * glow;
      ctx.shadowColor = '#00ff88';
      ctx.fillStyle   = `rgba(0,255,136,${alpha * glow})`;
      ctx.font        = `bold ${clamp(W * 0.07, 22, 40)}px 'Courier New'`;
      ctx.textAlign   = 'center';
      ctx.textBaseline= 'middle';
      ctx.fillText(`LEVEL ${this.level}`, cx, H * 0.30);
      ctx.shadowBlur  = 12;
      ctx.shadowColor = '#88ff44';
      ctx.fillStyle   = `rgba(160,255,80,${alpha})`;
      ctx.font        = `bold ${clamp(W * 0.048, 16, 26)}px 'Courier New'`;
      ctx.fillText('COMPLETE', cx, H * 0.40);
      ctx.restore();

      const prog = Math.min(1, this.cutTimer / CFG.CUT_TALLY_MS);
      if (prog > 0.12) {
        const fa = alpha * Math.min(1, (prog - 0.12) / 0.18);
        ctx.fillStyle = `rgba(255,221,0,${fa * 0.7})`;
        ctx.font      = `${clamp(W * 0.036, 11, 18)}px 'Courier New'`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DEPTH BONUS', cx, H * 0.49);
        ctx.fillStyle = `rgba(255,221,0,${fa})`;
        ctx.font      = `bold ${clamp(W * 0.055, 18, 30)}px 'Courier New'`;
        ctx.fillText(`+${this.cutTallyAmt.toLocaleString()}`, cx, H * 0.57);
      }
      if (this.cutCrystalBonus > 0 && prog > 0.32) {
        const fa = alpha * Math.min(1, (prog - 0.32) / 0.18);
        ctx.shadowBlur  = 10 * (0.5 + 0.5 * Math.sin(Date.now() * 0.004));
        ctx.shadowColor = '#00eeff';
        ctx.fillStyle = `rgba(0,230,255,${fa * 0.7})`;
        ctx.font      = `${clamp(W * 0.036, 11, 18)}px 'Courier New'`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`CRYSTALS  ×${this.ringCount}`, cx, H * 0.65);
        ctx.fillStyle = `rgba(0,240,255,${fa})`;
        ctx.font      = `bold ${clamp(W * 0.055, 18, 30)}px 'Courier New'`;
        ctx.fillText(`+${this.cutCrystalTally.toLocaleString()}`, cx, H * 0.73);
        ctx.shadowBlur = 0;
      }
      if (this.scoreMultiplier > 1 && prog > 0.55) {
        ctx.fillStyle = `rgba(255,153,0,${alpha * Math.min(1,(prog-0.55)/0.2)})`;
        ctx.font      = `${clamp(W * 0.036, 11, 17)}px 'Courier New'`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`MULTIPLIER ×${this.scoreMultiplier.toFixed(1)} APPLIED`, cx, H * 0.80);
      }
      // score total
      if (prog > 0.74) {
        const fa2 = alpha * Math.min(1, (prog - 0.74) / 0.2);
        ctx.fillStyle = `rgba(100,200,255,${fa2})`;
        ctx.font      = `${clamp(W * 0.032, 10, 16)}px 'Courier New'`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`SCORE  ${this.score.toLocaleString()}`, cx, H * 0.88);
      }

    } else if (this.cutPhase === 'count') {
      const idx    = Math.floor(this.cutTimer / CFG.CUT_COUNT_MS);
      const phaseT = this.cutTimer % CFG.CUT_COUNT_MS;

      // flash on new digit
      if (phaseT < 110) {
        const fa = 0.65 * (1 - phaseT / 110);
        ctx.fillStyle = `rgba(255,255,255,${fa})`;
        ctx.fillRect(0, HUD_H, caveW, H - HUD_H);
      }

      // static noise
      const sAlpha = Math.max(0, 0.30 * (1 - phaseT / (CFG.CUT_COUNT_MS * 0.65)));
      if (sAlpha > 0.01) drawStaticEffect(sAlpha);

      const labels = ['3', '2', '1', 'ENGAGE!'];
      const colors = ['#ff3333', '#ffaa00', '#ffff00', '#00ffcc'];
      if (idx < 4) {
        const label = labels[idx];
        const color = colors[idx];
        const pulse = 0.85 + 0.15 * Math.sin(phaseT * 0.022);
        ctx.save();
        ctx.shadowBlur  = 35 * pulse;
        ctx.shadowColor = color;
        ctx.fillStyle   = color;
        ctx.textAlign   = 'center';
        ctx.textBaseline= 'middle';
        ctx.font = idx < 3
          ? `bold ${clamp(caveW * 0.36, 64, 130)}px 'Courier New'`
          : `bold ${clamp(caveW * 0.17, 32, 64)}px 'Courier New'`;
        ctx.fillText(label, cx, H / 2);
        ctx.restore();
      }
    }
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

    if (this.state === 'playing' || this.state === 'levelcut') {
      const slowOn = KEY.slow && this.sFuel > 0;
      this.slines.draw(this.scroll * (slowOn ? CFG.SLOW_MULT : 1));

      // stalactites
      for (const s of this.stalas) s.draw(this.cave);

      // cave rocks
      for (const r of this.rocks) r.draw(this.cave);

      // particles (under drone)
      for (const p of this.parts)  p.draw();

      // crystals
      for (const c of this.crystals) c.draw(this.cave);

      // ring crystals
      for (const rc of this.rings) rc.draw(this.cave);

      // power-ups
      for (const p of this.pups)   p.draw(this.cave);

      // enemy bullets
      for (const b of this.enemyBullets) b.draw();

      // enemies
      for (const e of this.enemies) e.draw();

      // player bullets
      for (const b of this.playerBullets) b.draw();

      // drone
      this.drone.draw();

      // float texts
      for (const f of this.ftexts) f.draw();

      // D-pad (only during play)
      if (this.state === 'playing') this.dpad.draw();

      // cutscene overlay
      if (this.state === 'levelcut') this._drawCut();

      // boost overlays + vignette (playing only)
      if (this.state === 'playing') {
        const t2    = Date.now() * 0.009;
        const bFuel = this.drone.boostFuel;
        if (this.drone.boostFailing) {
          const pulse = 0.14 + 0.12 * Math.abs(Math.sin(t2 * 1.8));
          ctx.fillStyle = `rgba(255,30,0,${pulse})`;
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle    = `rgba(255,80,0,${0.7 + 0.3 * Math.abs(Math.sin(t2 * 2))})`;
          ctx.font         = `bold ${clamp(W * 0.052, 15, 24)}px 'Courier New'`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'top';
          ctx.shadowBlur   = 14; ctx.shadowColor = '#ff2200';
          ctx.fillText('★ ENGINE FAILURE — RELEASE BOOST ★', W / 2, 44);
          ctx.shadowBlur   = 0;
        } else if (KEY.boost && bFuel < CFG.BOOST_WARN_AT) {
          const pulse = 0.09 + 0.08 * Math.abs(Math.sin(t2 * 1.4));
          ctx.fillStyle = `rgba(255,110,0,${pulse})`;
          ctx.fillRect(0, 0, W, H);
          const critPct = bFuel / CFG.BOOST_WARN_AT;
          if (critPct < 0.5) {
            ctx.fillStyle    = `rgba(255,160,0,${0.6 + 0.3 * Math.abs(Math.sin(t2 * 3))})`;
            ctx.font         = `bold ${clamp(W * 0.048, 14, 22)}px 'Courier New'`;
            ctx.textAlign    = 'center'; ctx.textBaseline = 'top';
            ctx.shadowBlur   = 10; ctx.shadowColor = '#ff6600';
            ctx.fillText('⚠ CRITICAL — RELEASE BOOST ⚠', W / 2, 44);
            ctx.shadowBlur   = 0;
          } else {
            ctx.fillStyle    = `rgba(255,180,0,${0.5 + 0.3 * Math.abs(Math.sin(t2 * 2))})`;
            ctx.font         = `bold ${clamp(W * 0.046, 14, 21)}px 'Courier New'`;
            ctx.textAlign    = 'center'; ctx.textBaseline = 'top';
            ctx.fillText('⚠ BOOST WARNING', W / 2, 44);
          }
        } else if (this.drone.boosting) {
          ctx.fillStyle = `rgba(0,160,255,${0.04 + 0.025 * Math.sin(t2 * 1.2)})`;
          ctx.fillRect(0, 0, W, H);
        }
        this._vignette();
      }

      // top header HUD (playing + levelcut)
      drawHeader(this);
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
