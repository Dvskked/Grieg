/**
 * QuestManager.js — NPC en el mapa (interaccion con 'E') que entrega la
 * mision en etapas. Los dialogos son GLOBOS de texto flotantes de 1-2 lineas
 * que NO congelan el juego ni interrumpen el combate.
 *
 * Etapa 0: elimina los esbirros | Etapa 1: derrota a la Lamia | Etapa 2: mision completa
 */
'use strict';

window.QuestManager = (function () {
  class QuestManager {
    constructor(npc) {
      this.npc = npc;               // { x, y } ancla del NPC en el mundo
      this.stage = 0;               // 0 esbirros | 1 boss | 2 hecho
      this.bubble = null;           // { text, x, y, t, dur }
      this.total = 0;               // numero de esbirros de la mazmorra
      this._flag0 = false;
      this._flag1 = false;
    }

    stageText() {
      const t = [
        { tit: 'PURGA LA MAZMORRA',
          desc: `Mata a los ${this.total} esbirros que custodian el paso hacia la Lamia.` },
        { tit: 'ACABA CON LA LAMIA',
          desc: 'La sierpe aguarda en la arena del este. Que tu falcata se la beba.' },
        { tit: 'MISIÓN CUMPLIDA',
          desc: 'La mazmorra ha sido purgada. Grieg se alza victorioso.' }
      ][Math.min(this.stage, 2)];
      return t;
    }

    /** Texto del NPC al interactuar con 'E'. */
    npcLine() {
      const texts = [
        'La Lamia de la Mazmorra me arrebató la voz. Purga sus esbirros y vuelve.',
        'La sierpe está sola. El este de la mazmorra es su guarida: derrótala.',
        'Has partido el poder del guardia, Grieg. El Olimpo tiembla.'
      ];
      return texts[Math.min(this.stage, 2)];
    }

    /** Avanza de etapa por progreso real (mata-esbirros -> boss -> victoria). */
    update(game) {
      if (this.stage === 0 && !this._flag0 && game.kills >= this.total) {
        this._flag0 = true;
        this.stage = 1;
        this.show(game.boss ? game.boss.x : game.npc.x,
                  game.boss ? game.boss.y : game.npc.y,
                  'Los esbirros han caído. Ve tras la Lamia, al este.');
        if (game.boss) game._unlockBoss();
      }
      if (this.stage === 1 && !this._flag1 && game.bossDead) {
        this._flag1 = true;
        this.stage = 2;
        this.show(game.npc.x, game.npc.y, 'La Lamia yace sin luz. Vuelve y cierra el trato.');
        game.finishQuest();
      }
      if (this.bubble) {
        this.bubble.t += game.dt;
        if (this.bubble.t >= this.bubble.dur) this.bubble = null;
      }
    }

    /** Muestra un globo flotante 1-2 lineas (no bloquea nada). */
    show(x, y, text) {
      this.bubble = { x, y, text, t: 0, dur: 2.8 };
    }

    render(ctx, cam) {
      const b = this.bubble;
      if (!b) return;
      const k = b.t / b.dur;
      const a = k < 0.1 ? k / 0.1 : (k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3));
      if (a <= 0) return;

      const x = b.x - cam.x, y = b.y - cam.y - 52;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = '14px Georgia, serif';
      const lines = this._wrap(ctx, b.text, 340);
      const lh = 17;
      const bw = lines.length > 1 ? 340 : Math.min(340, ctx.measureText(b.text).width + 28);
      const bh = lines.length * lh + 14;

      ctx.fillStyle = 'rgba(8,10,16,0.92)';
      this._rr(ctx, x - bw / 2, y - bh, bw, bh, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,217,122,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = 'rgba(8,10,16,0.92)';
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 8); ctx.closePath(); ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#f4ecd8';
      lines.forEach((ln, i) => ctx.fillText(ln, x, y - bh + lh + i * lh + 5));
      ctx.restore();
      ctx.textAlign = 'left';
    }

    _wrap(ctx, text, maxW) {
      const words = String(text).split(' ');
      const lines = [];
      let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
        else cur = t;
      }
      if (cur) lines.push(cur);
      return lines.slice(0, 2);
    }

    _rr(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  return { QuestManager };
})();