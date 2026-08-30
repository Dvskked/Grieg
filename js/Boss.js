/**
 * Boss.js — La Lamia de la Mazmorra. Jefe final con barra superior y 2 fases:
 *  - Fase 1: carga telegrafiada (slam) y barrido de cola.
 *  - Fase 2 (hp <= 50%): velocidad aumentada + patron AOE (anillo + pernos).
 */
'use strict';

window.Boss = (function () {
  const TILE = 40;
  const R = 30;                        // radio de colision del jefe
  const MAX_HP = 240;
  const CONTACT_DMG = 18;
  const SWEEP_DMG = 20;

  class Boss {
    constructor(x, y, map) {
      this.map = map;
      this.x = x; this.y = y;
      this.hp = MAX_HP; this.maxHp = MAX_HP;
      this.alive = true;
      this.dead = false;
      this.phase2 = false;
      this.state = 'approach';   // approach | telegraph | slam | sweep | nova | stagger | dying | dead
      this.stateT = 0;
      this.atkCd = 1.4;
      this.fx = -1; this.fy = 0;
      this.hitFlash = 0;
      this.lunge = null;         // { dx, dy }
      this.trail = [];
      this._trailT = 0;
      this.speed = 90;
      this.roarT = 0;
    }

    get healthFrac() { return this.hp / this.maxHp; }

    // ---------------- Update ----------------
    update(dt, player, game) {
      this.stateT += dt;
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.roarT = Math.max(0, this.roarT - dt);

      // Estela del cuerpo.
      this._trailT -= dt;
      if (this._trailT <= 0) {
        this._trailT = 0.045;
        this.trail.unshift({ x: this.x, y: this.y });
        if (this.trail.length > 18) this.trail.pop();
      }

      if (this.state === 'dying' || this.state === 'dead') {
        if (this.stateT > 1.2 && this.state === 'dying') { this.state = 'dead'; this.dead = true; if (game) game.onBossKilled(this); }
        return;
      }

      const d = Utils.dist(this.x, this.y, player.x, player.y);
      const toP = Utils.norm(player.x - this.x, player.y - this.y);
      if (toP.x || toP.y) { this.fx = toP.x; this.fy = toP.y; }

      switch (this.state) {
        case 'approach': {
          if (this.atkCd <= 0 && d < 430) {
            this.state = 'telegraph';
            this.stateT = 0;
            this._telegraphAttack(game, d);
          } else {
            // Persigue al jugador (1/3 de la velocidad en reposo).
            this.moveBy(toP.x * this.speed * dt, toP.y * this.speed * dt);
          }
          break;
        }
        case 'telegraph': {
          if (this.stateT >= 0.5) {
            // Ejecuta la ofensiva elegida.
            if (this._pending === 'slam') {
              this.lunge = { dx: this.fx, dy: this.fy };
              this.state = 'slam';
              this.stateT = 0;
            } else if (this._pending === 'sweep') {
              this.state = 'sweep'; this.stateT = 0;
              game.fx.ring(this.x, this.y, { color: '#6fd0c8', r1: 40, dur: 0.25, lw: 4 });
            } else if (this._pending === 'nova') {
              this.state = 'nova'; this.stateT = 0;
              game.bossNova(this);
            }
            this._pending = null;
          }
          break;
        }
        case 'slam': {
          const l = this.lunge;
          if (this.stateT < 0.32) {
            this.moveBy(l.dx * 430 * dt, l.dy * 430 * dt);
            if (d < R + 16) game._hitPlayer(this, CONTACT_DMG, 0, 0);
          }
          if (this.stateT >= 0.4) { this.state = 'approach'; this.atkCd = this._cd(); }
          break;
        }
        case 'sweep': {
          if (this.stateT < 0.22) {
            this.moveBy(Math.cos(Math.atan2(this.fy, this.fx) + 1.1) * 120 * dt,
                        Math.sin(Math.atan2(this.fy, this.fx) + 1.1) * 120 * dt);
            const a = Math.abs(Utils.angleDiff(Math.atan2(this.fy, this.fx),
                                               Math.atan2(player.y - this.y, player.x - this.x)));
            if (d < R + 30 && a < 1.6) game._hitPlayer(this, SWEEP_DMG, 0, 0);
          }
          if (this.stateT >= 0.45) { this.state = 'approach'; this.atkCd = this._cd(); }
          break;
        }
        case 'nova': {
          // El anillo y los pernos los gestiona Game; aqui solo la posa.
          if (this.stateT >= 0.6) { this.state = 'approach'; this.atkCd = this._cd(); }
          break;
        }
        case 'stagger': {
          if (this.stateT >= 0.9) { this.state = 'approach'; this.atkCd = 0.5; }
          break;
        }
      }
    }

    _cd() { return this.phase2 ? Utils.rand(900, 1500) / 1000 : Utils.rand(1700, 2400) / 1000; }

    _telegraphAttack(game, d) {
      const roll = Math.random();
      this._pending = 'slam';
      if (this.phase2 && this.atkCd < 2) {           // fase 2: AOE ciclico
        if (roll < 0.42) this._pending = 'nova';
        else if (roll < 0.68) this._pending = 'sweep';
      } else {
        if (roll < 0.55 && d < 300) this._pending = 'slam';
        else if (roll < 0.8) this._pending = 'sweep';
      }
      game.fx.ring(this.x, this.y, { color: '#ff7a3c', r1: 40, dur: 0.5, lw: 3 });
    }

    // ---------------- Dano ----------------
    takeDamage(dmg, game, fromX, fromY) {
      if (!this.alive || this.dead) return;
      this.hp -= dmg;
      this.hitFlash = 0.14;
      if (fromX !== undefined && fromY !== undefined) {
        const k = Utils.norm(this.x - fromX, this.y - fromY);
        this.moveBy(k.x * 6, k.y * 6);
      }
      if (!this.phase2 && this.hp <= this.maxHp * 0.5) {
        this.phase2 = true;
        this.speed = 132;
        this.state = 'stagger'; this.stateT = 0;
        this.roarT = 1.4;
        if (game) {
          game.fx.nova(this.x, this.y, '#ff3c5a');
          game.fx.burst(this.x, this.y, { n: 24, colors: ['#ff3c5a', '#ffb0c0'], spd: 260 });
          game.bossNova(this);                     // AOE de golpe al entrar en fase 2
        }
      }
      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
        this.state = 'dying'; this.stateT = 0;
        if (game) game._bossDown(this);
      }
    }

    // ---------------- Movimiento ----------------
    moveBy(dx, dy) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      const steps = Math.max(1, Math.ceil(m / 6));
      for (let i = 0; i < steps; i += 1) {
        const sx = dx / steps, sy = dy / steps;
        const nx = this.x + sx;
        if (!this.map.collidesRect(nx - R, this.y - R, R * 2, R * 2)) this.x = nx;
        else if (sx > 0) this.x = Math.floor((nx + R) / TILE) * TILE - R - 0.01;
        else this.x = (Math.floor((nx - R) / TILE) + 1) * TILE + R + 0.01;
        const ny = this.y + sy;
        if (!this.map.collidesRect(this.x - R, ny - R, R * 2, R * 2)) this.y = ny;
        else if (sy > 0) this.y = Math.floor((ny + R) / TILE) * TILE - R - 0.01;
        else this.y = (Math.floor((ny - R) / TILE) + 1) * TILE + R + 0.01;
      }
    }

    // ---------------- Render ----------------
    render(ctx, cam, t) {
      if (this.state === 'dead') return;
      const x = this.x - cam.x, y = this.y - cam.y;

      const dying = this.state === 'dying' ? (1 - this.stateT / 1.2) : 1;
      if (dying <= 0) return;
      ctx.globalAlpha = dying;

      const flash = this.hitFlash > 0;

      // Cuerpo segmentado (serpiente) siguiendo la estela.
      const segN = this.trail.length;
      for (let i = 0; i < segN - 1; i += 1) {
        const p = this.trail[i], q = this.trail[i + 1];
        const rad = Math.max(4, R * 0.62 * (1 - i / (segN + 4)));
        ctx.strokeStyle = flash ? '#ffffff' : (this.phase2 ? '#7a2f4a' : '#3b6b70');
        ctx.lineWidth = rad * 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x - cam.x, p.y - cam.y);
        ctx.lineTo(q.x - cam.x, q.y - cam.y);
        ctx.stroke();
        // Escamas (tintes alternos).
        ctx.strokeStyle = this.phase2 ? '#e0546a' : '#79b8b5';
        ctx.lineWidth = rad * 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x - cam.x + 3, p.y - cam.y + 3);
        ctx.lineTo(q.x - cam.x + 3, q.y - cam.y + 3);
        ctx.stroke();
      }

      // Aura roja de fase 2.
      if (this.phase2 && this.alive) {
        const p = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.globalAlpha *= 1;
        ctx.fillStyle = `rgba(255,40,80,${0.16 + 0.1 * p})`;
        ctx.beginPath(); ctx.arc(x, y, R + 10, 0, Utils.TAU); ctx.fill();
      }

      // Cuerpo principal (cabeza).
      ctx.fillStyle = flash ? '#ffffff' : (this.phase2 ? '#5a2440' : '#2f5d62');
      ctx.beginPath(); ctx.arc(x, y, R, 0, Utils.TAU); ctx.fill();
      // Escama dorsal.
      ctx.fillStyle = flash ? '#fff' : (this.phase2 ? '#e0546a' : '#79b8b5');
      ctx.beginPath(); ctx.arc(x, y, R * 0.65, 0, Utils.TAU); ctx.fill();
      // Cuernos / cresta.
      ctx.fillStyle = flash ? '#fff' : '#c7a04a';
      ctx.beginPath(); ctx.arc(x - 12, y - 16, 5, 0, Utils.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 12, y - 16, 5, 0, Utils.TAU); ctx.fill();

      // Ojos (blancos candentes al telegrafiar o en fase 2).
      const hot = this.state === 'telegraph' || this.phase2;
      ctx.fillStyle = this.hitFlash > 0 ? '#fff' : (hot ? '#fff0c0' : '#ffD94a');
      const look = hot ? Math.max(2, 3.4) : 2.6;
      ctx.beginPath(); ctx.arc(x - 10 + this.fx * 5, y - 4 + this.fy * 5, look, 0, Utils.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 10 + this.fx * 5, y - 4 + this.fy * 5, look, 0, Utils.TAU); ctx.fill();

      // Colmillos cuando va a embestir.
      if (this.state === 'telegraph' || this.state === 'slam' || this.state === 'stagger') {
        ctx.strokeStyle = '#e8e4d8'; ctx.lineWidth = 3;
        const a = Math.atan2(this.fy, this.fx);
        const bx = Math.cos(a) * R, by = Math.sin(a) * R;
        ctx.beginPath(); ctx.moveTo(x + bx + 6, y + by + 4); ctx.lineTo(x + bx + 2, y + by + 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + bx - 6, y + by + 4); ctx.lineTo(x + bx - 2, y + by + 12); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  return { Boss, MAX_HP };
})();