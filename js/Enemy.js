/**
 * Enemy.js — Esbirros comunes: patrulla entre dos puntos, IA de persecucion
 * cuando el jugador entra en rango de vision, golpe telegrafiado y muerte.
 */
'use strict';

window.Enemy = (function () {
  const TILE = 40;
  const W = 24, H = 30;
  const HP = 60;
  const DMG = 12;
  const PATROL_SPD = 62, CHASE_SPD = 138;
  const AGRO_RANGE = 250, ATTACK_RANGE = 46;
  const VISION_ANGLE = 2.4;

  class Enemy {
    constructor(x, y, map) {
      this.map = map;
      this.x = x; this.y = y;
      this.ax = x; this.ay = y;                // ancla de patrulla
      this.wp = [ { x: x - 48, y: y }, { x: x + 48, y: y } ];
      this.wi = 0;
      this.hp = HP;
      this.alive = true;
      this.state = 'patrol';   // patrol | chase | windup | strike | dying | dead
      this.stateT = 0;
      this.hitFlash = 0;
      this.atkCd = 1.2;
      this.fx = -1; this.fy = 0;
      this.seed = Math.random();
    }

    // ---------------- Update ----------------
    update(dt, player, game) {
      this.stateT += dt;
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      if (!this.alive) {
        if (this.stateT > 0.45) this.state = 'dead';
        return;
      }

      const d = Utils.dist(this.x, this.y, player.x, player.y);
      const toP = Utils.norm(player.x - this.x, player.y - this.y);

      // Vision: rango + angulo frontal.
      const ang = Math.abs(Utils.angleDiff(Math.atan2(this.fy, this.fx), Math.atan2(toP.y, toP.x)));
      const sees = d < AGRO_RANGE && (ang < VISION_ANGLE / 2 || d < 90);

      if (this.state === 'patrol') {
        if (sees) { this.state = 'chase'; this.stateT = 0; this._yell(game); }
        else this._patrol(dt);
      } else if (this.state === 'chase') {
        if (d > AGRO_RANGE + 60) { this.state = 'patrol'; this.stateT = 0; this.wi = 0; }
        else if (d < ATTACK_RANGE) { this.state = 'windup'; this.stateT = 0; this._face(toP); }
        else { this._face(toP); this.moveBy(toP.x * CHASE_SPD * dt, toP.y * CHASE_SPD * dt); }
      } else if (this.state === 'windup') {
        if (this.stateT >= 0.34) {
          this.state = 'strike'; this.stateT = 0;
          game.fx.ring(this.x + this.fx * 16, this.y + this.fy * 16, { color: '#c96a4a', r1: 30, dur: 0.22, lw: 3 });
        }
      } else if (this.state === 'strike') {
        if (this.stateT < 0.18 && d < ATTACK_RANGE + 8) {
          this._hitPlayer(game);
        }
        if (this.stateT >= 0.34) { this.state = 'chase'; this.stateT = 0; }
      }
    }

    _patrol(dt) {
      const wp = this.wp[this.wi];
      const d = Utils.dist(this.x, this.y, wp.x, wp.y);
      if (d < 6) { this.wi = (this.wi + 1) % this.wp.length; }
      else {
        const v = Utils.norm(wp.x - this.x, wp.y - this.y);
        this._face(v);
        this.moveBy(v.x * PATROL_SPD * dt, v.y * PATROL_SPD * dt);
      }
    }

    _face(v) {
      if (v.x || v.y) { const m = Math.hypot(v.x, v.y); this.fx = v.x / m; this.fy = v.y / m; }
    }

    _yell(game) { if (game) game.fx.ring(this.x, this.y - 20, { color: '#ffd97a', r1: 22, dur: 0.3, lw: 3 }); }

    _hitPlayer(game) {
      if (game) game._hitPlayer(this, DMG, this.fx, this.fy);
    }

    // ---------------- Dano ----------------
    takeDamage(dmg, game, fromX, fromY) {
      if (!this.alive) return;
      this.hp -= dmg;
      this.hitFlash = 0.16;
      if (fromX !== undefined && fromY !== undefined) {
        const k = Utils.norm(this.x - fromX, this.y - fromY);
        this.moveBy(k.x * 26, k.y * 26);        // leve empuje al impactar
      }
      if (this.hp <= 0) { this.alive = false; this.stateT = 0; this.state = 'dying'; if (game) game.onEnemyKilled(this); }
    }

    // ---------------- Movimiento (mismo esquema de colision que el player) ----------------
    moveBy(dx, dy) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      const steps = Math.max(1, Math.ceil(m / 6));
      for (let i = 0; i < steps; i += 1) {
        const sx = dx / steps, sy = dy / steps;
        const nx = this.x + sx;
        if (!this.map.collidesRect(nx - W / 2, this.y - H / 2 - 4, W, H)) this.x = nx;
        else if (sx > 0) this.x = Math.floor((nx + W / 2) / TILE) * TILE - W / 2 - 0.01;
        else this.x = (Math.floor((nx - W / 2) / TILE) + 1) * TILE + W / 2 + 0.01;
        const ny = this.y + sy;
        if (!this.map.collidesRect(this.x - W / 2, ny - H / 2 - 4, W, H)) this.y = ny;
        else if (sy > 0) this.y = Math.floor((ny + H / 2) / TILE) * TILE - H / 2 - 0.01;
        else this.y = (Math.floor((ny - H / 2) / TILE) + 1) * TILE + H / 2 + 0.01;
      }
    }

    // ---------------- Render ----------------
    render(ctx, cam, t) {
      if (this.state === 'dead') return;
      const x = this.x - cam.x, y = this.y - cam.y;

      const dying = this.state === 'dying' ? (1 - this.stateT / 0.45) : 1;
      if (dying <= 0) return;
      ctx.globalAlpha = dying;

      // Sombra.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(x, y + 12, 10, 4.5, 0, 0, Utils.TAU); ctx.fill();

      const flash = this.hitFlash > 0;
      const skin = flash ? '#ffffff' : '#4a3a55';
      const wob = Math.sin(this.state === 'windup' ? this.stateT * 40 : this.stateT * 7 + this.seed * 9) * 2;

      // Cuerpo rechoncho.
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.ellipse(x, y - 2 + wob, 10, 12, 0, 0, Utils.TAU); ctx.fill();
      // Cuernos/botones.
      ctx.fillStyle = flash ? '#fff' : '#7a6a4a';
      ctx.beginPath(); ctx.arc(x - 7, y - 11 + wob, 2.4, 0, Utils.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 7, y - 11 + wob, 2.4, 0, Utils.TAU); ctx.fill();
      // Ojos en la direccion del frente (rojos furiosos en chase).
      const ex = this.fx * 4, ey = this.fy * 4;
      const eyeC = this.state === 'patrol' ? '#ffb347' : '#ff4a3a';
      ctx.fillStyle = eyeC;
      ctx.beginPath(); ctx.arc(x + ex + 2.5, y + ey, 2.2, 0, Utils.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + ex - 2.5, y + ey, 2.2, 0, Utils.TAU); ctx.fill();
      // Garras durante windup (se alzan).
      ctx.strokeStyle = skin; ctx.lineWidth = 3;
      const armY = this.state === 'windup' ? y - 6 : y + 4;
      ctx.beginPath(); ctx.moveTo(x - 9, y - 2); ctx.lineTo(x - 15, armY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 9, y - 2); ctx.lineTo(x + 15, armY); ctx.stroke();

      ctx.globalAlpha = 1;
    }
  }

  return { Enemy, DMG };
})();