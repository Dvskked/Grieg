/**
 * Particles.js — Efectos ligeros de un solo archivo: destellos de golpe,
 * estelas de dash, auras de boss y numeros de dano flotante.
 */
'use strict';

window.Fx = (function () {
  class FxSystem {
    constructor() {
      this.list = [];
      this.texts = [];
    }

    clear() { this.list.length = 0; this.texts.length = 0; }

    burst(x, y, opts) {
      const o = opts || {};
      const n = o.n || 10;
      const colors = o.colors || ['#ffd14a', '#e03830', '#fff3c4'];
      for (let i = 0; i < n; i += 1) {
        const a = Math.random() * Utils.TAU;
        const sp = Utils.rand(40, o.spd || 220);
        this.list.push({
          type: 'spark', x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          t: 0, dur: Utils.rand(0.25, 0.5),
          size: Utils.rand(2, o.size || 5),
          color: colors[(Math.random() * colors.length) | 0]
        });
      }
    }

    ring(x, y, opts) {
      const o = opts || {};
      this.list.push({
        type: 'ring', x, y,
        t: 0, dur: o.dur || 0.4,
        r0: o.r0 || 6, r1: o.r1 || 46,
        color: o.color || '#ff7a3c', lw: o.lw || 4
      });
    }

    trail(x, y, color) {
      this.list.push({ type: 'trace', x, y, t: 0, dur: 0.24, color: color || '#65c5ff', size: 8 });
    }

    nova(x, y, color) {
      this.list.push({ type: 'nova', x, y, t: 0, dur: 0.6, color: color || '#ff9aa2' });
    }

    dmgText(x, y, text, color) {
      this.texts.push({ x, y, text, color: color || '#fff0c0', t: 0, dur: 0.8 });
    }

    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i -= 1) {
        const p = this.list[i];
        p.t += dt;
        if (p.t >= p.dur) { this.list.splice(i, 1); continue; }
        if (p.type === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; }
      }
      for (let i = this.texts.length - 1; i >= 0; i -= 1) {
        const t = this.texts[i];
        t.t += dt;
        if (t.t >= t.dur) this.texts.splice(i, 1);
      }
    }

    render(ctx, cam) {
      for (const p of this.list) {
        const k = p.t / p.dur;
        if (p.type === 'spark') {
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - cam.x - p.size / 2, p.y - cam.y - p.size / 2, p.size, p.size);
        } else if (p.type === 'ring') {
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = p.color; ctx.lineWidth = p.lw * (1 - k) + 1;
          ctx.beginPath();
          ctx.arc(p.x - cam.x, p.y - cam.y, Utils.lerp(p.r0, p.r1, Utils.easeOut(k)), 0, Utils.TAU);
          ctx.stroke();
        } else if (p.type === 'nova') {
          ctx.globalAlpha = 0.6 * (1 - k);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x - cam.x, p.y - cam.y, 16 + 90 * Utils.easeOut(k), 0, Utils.TAU);
          ctx.fill();
        } else if (p.type === 'trace') {
          ctx.globalAlpha = 0.35 * (1 - k);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x - cam.x, p.y - cam.y, p.size * (1 - k * 0.5), 0, Utils.TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Numeros de dano.
      ctx.textAlign = 'center';
      for (const t of this.texts) {
        const k = t.t / t.dur;
        ctx.globalAlpha = 1 - k;
        ctx.font = 'bold 17px Georgia, serif';
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x - cam.x, t.y - cam.y - 26 * Utils.easeOut(k));
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
  }

  return { FxSystem };
})();