/**
 * Player.js — Grieg: movimiento 8 direcciones, colision AABB contra tiles,
 * ataque con arco rojo/dorado en area, dash con i-frames y cooldown.
 */
'use strict';

window.Player = (function () {
  const W = 22, H = 30;            // bounding box del personaje
  const TILE = 40;
  const SPEED = 235;
  const DASH_SPEED = 620, DASH_DUR = 0.14, DASH_CD = 0.62;
  const SLASH_CD = 0.26, SLASH_DUR = 0.22, SLASH_REACH = 78, SLASH_ARC = 2.3;
  const DMG = 30;

  class Player {
    constructor(x, y, map) {
      this.map = map;
      this.x = x; this.y = y;
      this.fx = 0; this.fy = -1;                 // frente (mira)
      this.hp = 100; this.maxHp = 100;
      this.alive = true;
      this.iFrames = 0;
      this.dash = null;     // { t, dur, dx, dy }
      this.dashCd = 0;
      this.slash = null;    // { t, dur, reach, arc, fx, fy }
      this.slashCd = 0;
      this.hitFlash = 0;
      this.ghosts = [];
      this._ghostT = 0;
      this._game = null;    // referencia viva al Game (para fx y golpear el mundo)
    }

    resetHealth() { this.hp = this.maxHp; this.alive = true; }

    // ---------------- Update ----------------
    update(dt, input) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.iFrames = Math.max(0, this.iFrames - dt);
      this.dashCd = Math.max(0, this.dashCd - dt);
      this.slashCd = Math.max(0, this.slashCd - dt);

      if (this.slash) {
        this.slash.t += dt;
        if (this.slash.t >= this.slash.dur) this.slash = null;
      }

      if (this.dash) {
        const d = this.dash;
        d.t += dt;
        this.moveBy(d.dx * DASH_SPEED * dt, d.dy * DASH_SPEED * dt);
        this._ghostT -= dt;
        if (this._ghostT <= 0) {
          this._ghostT = 0.03;
          if (this.ghosts.length < 12) this.ghosts.push({ x: this.x, y: this.y, t: 0, dur: 0.26 });
        }
        for (let i = this.ghosts.length - 1; i >= 0; i -= 1) {
          this.ghosts[i].t += dt;
          if (this.ghosts[i].t >= this.ghosts[i].dur) this.ghosts.splice(i, 1);
        }
        if (d.t >= DASH_DUR) this.dash = null;
        return;
      }
      this.ghosts.length = 0;

      if (!this.alive) return;

      // Movimiento 8 direcciones; el frente sigue al ultimo gesto.
      let dx = input.dirX(), dy = input.dirY();
      if (dx || dy) {
        const n = Utils.norm(dx, dy);
        dx = n.x; dy = n.y;
        const anchored = this.slash && this.slash.t > this.slash.dur * 0.35;
        if (!anchored) { this.fx = dx; this.fy = dy; }
        this.moveBy(dx * SPEED * dt, dy * SPEED * dt);
      }

      if (input.press(input.A.ATTACK) && this.slashCd <= 0) {
        this._startSlash(input.aimVec(this.x, this.y));
      }

      if (input.press(input.A.DASH) && this.dashCd <= 0) {
        let d = Utils.norm(input.dirX(), input.dirY());
        if (!(d.x || d.y)) d = { x: this.fx, y: this.fy };
        this.dash = { t: 0, dur: DASH_DUR, dx: d.x, dy: d.y };
        this.dashCd = DASH_CD;
        if (this.slash) this.slash = null;
      }
    }

    // ---------------- Ataque ----------------
    _startSlash(aim) {
      this.slash = { t: 0, dur: SLASH_DUR, reach: SLASH_REACH, arc: SLASH_ARC, fx: aim.x, fy: aim.y };
      this.slashCd = SLASH_CD;
      this.fx = aim.x; this.fy = aim.y;
      const g = this._game;
      if (g) {
        g.fx.ring(this.x + aim.x * 24, this.y + aim.y * 24, { color: '#ffd97a', r1: 34, dur: 0.2, lw: 3 });
        g._doSlash(this);
      }
    }

    /** Dano entrante; el dash o los i-frames lo ignoran. */
    takeHit(dmg, kx, ky) {
      if (!this.alive || this.iFrames > 0) return false;
      this.hp -= dmg;
      this.iFrames = 0.45;
      this.hitFlash = 0.18;
      if (kx || ky) this.moveBy(kx, ky);
      if (this.hp <= 0) { this.hp = 0; this.alive = false; }
      return true;
    }

    heal(v) { this.hp = Math.min(this.maxHp, this.hp + v); }

    // ---------------- Movimiento + colision ----------------
    moveBy(dx, dy) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      const steps = Math.max(1, Math.ceil(m / 8));
      for (let i = 0; i < steps; i += 1) {
        this._moveX(dx / steps);
        this._moveY(dy / steps);
      }
    }

    _solid(x, y) {
      return this.map.collidesRect(x - W / 2, y - H / 2, W, H);
    }

    _moveX(d) {
      const hw = W / 2;
      const nx = this.x + d;
      if (!this._solid(nx, this.y)) { this.x = nx; return; }
      if (d > 0) { this.x = Math.floor((nx + hw) / TILE) * TILE - hw - 0.01; }
      else { this.x = (Math.floor((nx - hw) / TILE) + 1) * TILE + hw + 0.01; }
    }

    _moveY(d) {
      const hh = H / 2;
      const ny = this.y + d;
      if (!this._solid(this.x, ny)) { this.y = ny; return; }
      if (d > 0) { this.y = Math.floor((ny + hh) / TILE) * TILE - hh - 0.01; }
      else { this.y = (Math.floor((ny - hh) / TILE) + 1) * TILE + hh + 0.01; }
    }

    // ---------------- Render ----------------
    render(ctx, t) {
      const cam = this._game ? this._game.cam : { x: 0, y: 0 };

      // Estela del dash.
      for (const g of this.ghosts) {
        const k = g.t / g.dur;
        ctx.globalAlpha = 0.4 * (1 - k);
        ctx.fillStyle = '#65c5ff';
        ctx.beginPath();
        ctx.ellipse(g.x - cam.x, g.y - H / 2 - cam.y + 4, 10, 12, 0, 0, Utils.TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(this.x - cam.x, this.y - cam.y);

      // Sombra.
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, H / 2 - 6, 11, 5, 0, 0, Utils.TAU); ctx.fill();

      const flash = this.hitFlash > 0;
      // Cuerpo + capucha.
      ctx.fillStyle = flash ? '#ffffff' : '#5fb58c';
      ctx.beginPath(); ctx.ellipse(0, 2, 10, 12, 0, 0, Utils.TAU); ctx.fill();
      ctx.fillStyle = flash ? '#ffffff' : '#1f4435';
      ctx.beginPath(); ctx.ellipse(0, -9, 8.5, 9.5, 0, 0, Utils.TAU); ctx.fill();
      // Ojos en la direccion del frente.
      const ex = this.fx * 3.4, ey = this.fy * 3.4;
      ctx.fillStyle = '#ffd97a';
      ctx.beginPath(); ctx.arc(ex + 2.2, -9 + ey, 1.7, 0, Utils.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(ex - 2.2, -9 + ey, 1.7, 0, Utils.TAU); ctx.fill();
      // Cinto.
      ctx.fillStyle = flash ? '#fff' : '#7a4a2a';
      ctx.fillRect(-9, 6, 18, 3);

      this._drawBlade(ctx);

      // Parpadeo de invulnerabilidad.
      if (this.iFrames > 0 && Math.floor(t * 22) % 2 === 0) {
        ctx.strokeStyle = 'rgba(140,255,220,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, Utils.TAU); ctx.stroke();
      }
      ctx.restore();
    }

    _drawBlade(ctx) {
      const sw = this.slash ? Utils.easeOut(this.slash.t / this.slash.dur) : 0;
      const base = Math.atan2(this.fy, this.fx);
      const bladeTip = (this.slash ? sw : 0.35);
      const bladeLen = 24;

      ctx.save();
      // Rotacion del brazo/hoja (balancin durante el corte).
      ctx.rotate(base + Utils.lerp(-0.95, 0.95, sw));

      // Arco rojo/dorado del tajo.
      if (this.slash) {
        const glow = Math.max(0, 1 - this.slash.t / (this.slash.dur * 0.7));
        const rad = this.slash.reach * (0.55 + 0.45 * sw);
        const a0 = -this.slash.arc * 0.5, a1 = this.slash.arc * 0.5;
        ctx.strokeStyle = `rgba(255,205,74,${0.5 * glow})`;
        ctx.lineWidth = 11 * glow + 3;
        ctx.beginPath(); ctx.arc(0, 0, rad, a0, a1); ctx.stroke();
        ctx.strokeStyle = `rgba(224,56,50,${0.8 * glow + 0.25})`;
        ctx.lineWidth = 5 * glow + 1.5;
        ctx.beginPath(); ctx.arc(0, 0, rad, a0 + 0.14, a1 - 0.14); ctx.stroke();
      }

      // Hoja de la falcata.
      ctx.fillStyle = '#dde5ee';
      ctx.beginPath();
      ctx.moveTo(6, -1.6);
      ctx.lineTo(6 + bladeLen + bladeTip * 3, 0);
      ctx.lineTo(6, 1.6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7e93a8';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(6 + bladeLen + bladeTip * 3, 0); ctx.stroke();
      ctx.restore();
    }
  }

  return { Player, DMG };
})();