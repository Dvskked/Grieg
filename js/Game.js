/**
 * Game.js — Núcleo de la nueva arquitectura "Grieg: La Sombra del Olimpo"
 * (Top-Down Action-RPG / Dungeon Crawler).
 * - Bucle RequestAnimationFrame con dt acotado.
 * - Camara 2D suave con seguimiento al personaje y limites de mundo.
 * - Fases: MENU | PLAYING | PAUSED | GAMEOVER | WIN.
 * - Slash en area, dash con i-frames, boss 2 fases, mision por globos flotantes.
 */
'use strict';

window.Game = (function () {
  const U = Utils;
  const { InputHandler, A } = window.InputHandler;
  const { TILE } = window.MapModule;
  const { Player } = window.Player;
  const { Enemy } = window.Enemy;
  const { Boss } = window.Boss;
  const { FxSystem } = window.Fx;
  const { QuestManager } = window.QuestManager;

  const VIEW_W = 1280, VIEW_H = 720;
  const DMG = 30;

  const ST = { MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER', WIN: 'WIN' };

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.input = new InputHandler(canvas);
      this.state = ST.MENU;
      this.dt = 0; this.t = 0;
      this._last = 0; this._running = false;
      this.cam = { x: 0, y: 0 };
      this.shake = 0;
      this._hurtFlash = 0;
      this._wirePauseUI();
      this._newRun();
    }

    _newRun() {
      const D = window.MapModule.buildDungeon();
      this.map = D.map;
      this.worldW = D.worldW; this.worldH = D.worldH;
      this.player = new Player(D.spawn.x, D.spawn.y, D.map);
      this.player._game = this;
      this.enemies = D.enemies.map((e) => new Enemy(e.x, e.y, D.map));
      this.total = this.enemies.length;
      this.kills = 0;
      this.boss = new Boss(D.boss.x, D.boss.y, D.map);
      this.bossAlive = true; this.bossDead = false;
      this.npc = D.npc; this.heal = D.heal; this.healUsed = false;
      this.quest = new QuestManager(D.npc);
      this.quest.total = this.total;
      this.fx = new FxSystem();
      this.projectiles = [];
      this.shake = 0;
      this._hurtFlash = 0;
      this.winShown = false;
      this._bossUnlocked = false;
    }

    start() { this._running = true; this._last = performance.now(); requestAnimationFrame((t) => this._frame(t)); }

    // ----------------------------------------------------- bucle
    _frame(now) {
      if (!this._running) return;
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.05) dt = 0.05;
      this.dt = dt; this.t += dt;
      this.shake = Math.max(0, this.shake - dt * 30);
      this._hurtFlash = Math.max(0, this._hurtFlash - dt);

      switch (this.state) {
        case ST.MENU: this._updateMenu(); break;
        case ST.PLAYING: this._updatePlay(dt); break;
        case ST.PAUSED: this._updatePause(dt); break;
        case ST.GAMEOVER: this._updateGameOver(dt); break;
        case ST.WIN: this._updateWin(dt); break;
      }
      this._render();
      requestAnimationFrame((t) => this._frame(t));
    }

    // ----------------------------------------------------- actualizaciones
    _updateMenu() {
      if (this.input.press(A.CONFIRM) || this.input.press(A.ATTACK) || this.input.press(A.INTERACT)) {
        this._newRun();
        this.state = ST.PLAYING;
        this.input.clearPress([A.ATTACK, A.CONFIRM, A.INTERACT]);
        this.quest.show(this.player.x, this.player.y - 34,
          'Espacio ataca · Mayús esquiva · Ve al este y purga la mazmorra.');
      }
    }

    _updatePlay(dt) {
      if (this.input.press(A.PAUSE) || this.input.press(A.CANCEL)) {
        this._setPause(true);
        return;
      }

      this.quest.update(this);                       // globos + progreso
      this.player.update(dt, this.input);
      if (!this.player.alive) { this.state = ST.GAMEOVER; this.input.clearPress([A.PAUSE, A.CANCEL]); return; }

      this._updateEnemies(dt);
      if (this.boss && !this.boss.dead) this.boss.update(dt, this.player, this);

      this._updateProjectiles(dt);
      this._updateInteractions(dt);
      this._separation();
      this.fx.update(dt);
      this._updateCamera(dt);
      this._battleT += dt;
    }

    _updateEnemies(dt) {
      for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
        const e = this.enemies[i];
        if (e.state === 'dead') continue;
        e.update(dt, this.player, this);
      }
      this.enemies = this.enemies.filter((e) => e.state !== 'dead');
    }

    _updatePause(dt) {
      if (this.input.press(A.PAUSE) || this.input.press(A.CANCEL)) {
        this._setPause(false);
      }
      void dt;
    }

    _updateGameOver(dt) {
      this.fx.update(dt);
      if (this.input.press(A.RESTART) || this.input.press(A.CONFIRM)) {
        this.input.clearPress([A.CONFIRM, A.RESTART]);
        this._newRun();
        this.state = ST.PLAYING;
      } else if (this.input.press(A.CANCEL)) {
        this._goMenu();
      }
    }

    _updateWin(dt) {
      this.fx.update(dt);
      if (this.input.press(A.RESTART) || this.input.press(A.CONFIRM)) {
        this.input.clearPress([A.CONFIRM, A.RESTART]);
        this._newRun();
        this.state = ST.PLAYING;
      } else if (this.input.press(A.CANCEL)) {
        this._goMenu();
      }
    }

    _goMenu() {
      this.state = ST.MENU;
      this.input.clearPress([A.PAUSE, A.CANCEL, A.ATTACK, A.CONFIRM]);
    }

    // ----------------------------------------------------- combate / mundo
    /** El corte del jugador: area en forma de abanico frente a el. */
    _doSlash(p) {
      const fx = p.fx, fy = p.fy;
      const reach = p.slash ? p.slash.reach : 78;
      const arcHalf = p.slash ? p.slash.arc / 2 : 1.05;

      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = U.dist(p.x, p.y, e.x, e.y);
        if (d > reach + 16) continue;
        const ang = Math.abs(U.angleDiff(Math.atan2(fy, fx), Math.atan2(e.y - p.y, e.x - p.x)));
        if (ang < arcHalf + 0.35) {
          e.takeDamage(DMG, this, p.x, p.y);
          this.fx.burst(e.x, e.y, { n: 8, colors: ['#ffd14a', '#e03830'], spd: 200 });
          this.fx.dmgText(e.x, e.y - 22, '-' + DMG);
        }
      }

      if (this.boss && !this.boss.dead) {
        const d = U.dist(p.x, p.y, this.boss.x, this.boss.y);
        if (d < reach + 34) {
          const ang = Math.abs(U.angleDiff(Math.atan2(fy, fx), Math.atan2(this.boss.y - p.y, this.boss.x - p.x)));
          if (ang < arcHalf + 0.4) {
            this.boss.takeDamage(DMG, this, p.x, p.y);
            this.fx.burst(this.boss.x, this.boss.y, { n: 12, colors: ['#ffd14a', '#e0546a'], spd: 220 });
            this.fx.dmgText(this.boss.x, this.boss.y - 30, '-' + DMG, '#ffd97a');
          }
        }
      }
    }

    onEnemyKilled(e) {
      this.kills += 1;
      this.fx.burst(e.x, e.y, { n: 14, colors: ['#b96a4a', '#ffd97a', '#5a4a6a'], spd: 150 });
      if (Math.random() < 0.3) {           // gota de icor: +8 de vida
        this.player.heal(8);
        this.fx.dmgText(e.x, e.y - 28, '+8', '#7dffb0');
      }
    }

    onBossKilled(b) { /* la victoria se cierra via _bossDown + quest */ void b; }

    _bossDown(b) {
      this.bossDead = true;
      this.bossAlive = false;
      this.fx.nova(b.x, b.y, '#ffdf90');
      this.fx.burst(b.x, b.y, { n: 30, colors: ['#ffd14a', '#e0546a', '#ffffff'], spd: 300 });
      this.shake = 14;
    }

    _unlockBoss() { this._bossUnlocked = true; }

    finishQuest() {
      this.state = ST.WIN;
      this.shake = 8;
    }

    /** AOE de fase 2: anillo expansivo + pernos radiales. */
    bossNova(b, opts) {
      void opts;
      const nx = b.x, ny = b.y;
      this.projectiles.push({ type: 'ring', x: nx, y: ny, r: 24, vr: 150, dmg: 20, life: 0.9, hit: false });
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * U.TAU + 0.4;
        this.projectiles.push({ type: 'bolt', x: nx, y: ny, vx: Math.cos(a) * 175, vy: Math.sin(a) * 175, dmg: 14, life: 2.4 });
      }
      this.shake = 6;
    }

    _hitPlayer(src, dmg, kx, ky) {
      const hit = this.player.takeHit(dmg, kx, ky);
      if (hit) {
        this.fx.burst(this.player.x, this.player.y, { n: 8, colors: ['#ff6a5a', '#fff'], spd: 180 });
        this._hurtFlash = 0.5;
        this.shake = Math.max(this.shake, 6);
      }
      void src;
    }

    // ----------------------------------------------------- proyectiles
    _updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
        const pr = this.projectiles[i];
        pr.life -= dt;
        if (pr.life <= 0) { this.projectiles.splice(i, 1); continue; }

        if (pr.type === 'ring') {
          pr.r += pr.vr * dt;
          const d = U.dist(this.player.x, this.player.y, pr.x, pr.y);
          if (!pr.hit && Math.abs(d - pr.r) < 18) {
            pr.hit = true;
            this._hitPlayer(this.boss, pr.dmg, 0, 0);
          }
        } else if (pr.type === 'bolt') {
          pr.x += pr.vx * dt; pr.y += pr.vy * dt;
          if (this.map.collidesRect(pr.x - 4, pr.y - 4, 8, 8)) {
            this.projectiles.splice(i, 1);
            this.fx.burst(pr.x, pr.y, { n: 6, colors: ['#ff9aa2'], spd: 120 });
            continue;
          }
          if (U.dist(this.player.x, this.player.y, pr.x, pr.y) < 20) {
            this.projectiles.splice(i, 1);
            this._hitPlayer(this.boss, pr.dmg, 0, 0);
          }
        }
      }
    }

    // ----------------------------------------------------- interacciones
    _updateInteractions(dt) {
      void dt;
      const p = this.player;
      // NPC: habla con 'E' (nunca bloquea; globo flotante).
      if (U.dist(p.x, p.y, this.npc.x, this.npc.y) < 48 && this.quest.stage < 2) {
        if (this.input.press(A.INTERACT)) {
          this.quest.show(this.npc.x, this.npc.y - 24, this.quest.npcLine());
        }
      }
      // Altar de descanso: cura una vez al interactuar.
      if (this.heal && !this.healUsed && U.dist(p.x, p.y, this.heal.x, this.heal.y) < 48) {
        if (this.input.press(A.INTERACT) || this.input.press(A.ATTACK)) {
          this.healUsed = true;
          p.heal(50);
          this.fx.ring(this.heal.x, this.heal.y, { color: '#7dffb0', r1: 60, dur: 0.5, lw: 4 });
          this.fx.burst(this.heal.x, this.heal.y, { n: 12, colors: ['#7dffb0', '#fff'], spd: 140 });
          this.quest.show(this.heal.x, this.heal.y - 30, 'El altar te devuelve la fuerza.');
        }
      }
    }

    // ----------------------------------------------------- separacion suave
    _separation() {
      const bodies = [this.player, ...this.enemies.filter((e) => e.alive)];
      for (let i = 0; i < bodies.length; i += 1) {
        for (let j = i + 1; j < bodies.length; j += 1) {
          const a = bodies[i], b = bodies[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const r = 26;
          const d = Math.hypot(dx, dy);
          if (d > 0.01 && d < r) {
            const push = (r - d) / d;
            a.x -= dx * push * 0.5; a.y -= dy * push * 0.5;
            b.x += dx * push * 0.5; b.y += dy * push * 0.5;
          }
        }
      }
    }

    // ----------------------------------------------------- camara
    _updateCamera(dt) {
      const tx = U.clamp(this.player.x - VIEW_W / 2, 0, this.worldW - VIEW_W);
      const ty = U.clamp(this.player.y - VIEW_H / 2, 0, this.worldH - VIEW_H);
      const k = Math.min(1, dt * 5.2);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
    }

    // ----------------------------------------------------- pausa (DOM)
    _wirePauseUI() {
      this.pauseEl = document.getElementById('pauseOverlay');
      if (!this.pauseEl) return;
      this.pauseEl.querySelectorAll('[data-pause]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const k = btn.getAttribute('data-pause');
          if (k === 'resume') this._setPause(false);
          else if (k === 'menu') { this._setPause(false); this._goMenu(); }
        });
      });
    }

    _setPause(on) {
      if (this.pauseEl) this.pauseEl.hidden = !on;
      if (on) { this.state = ST.PAUSED; this.input.clearPress([A.PAUSE, A.CANCEL]); }
      else { this.state = ST.PLAYING; this.input.clearPress([A.PAUSE, A.CANCEL]); }
    }

    // ----------------------------------------------------- render
    _render() {
      const c = this.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#05060a';
      c.fillRect(0, 0, VIEW_W, VIEW_H);

      // Camara con temblor (screen shake).
      c.save();
      if (this.shake > 0) {
        c.translate(U.rand(-this.shake, this.shake) * 0.5, U.rand(-this.shake, this.shake) * 0.5);
      }
      c.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));

      this._drawTiles(c);
      this._drawAltar(c);
      if (!this.bossDead) {
        for (const e of this.enemies) e.render(c, this.cam, this.t);
        if (this.boss && !this.boss.dead) this.boss.render(c, this.cam, this.t);
      }
      this._drawNPC(c);
      this.player.render(c, this.t);
      this._drawProjectiles(c);
      this._drawInteractPrompts(c);
      this.fx.render(c, this.cam);
      if (this.quest) this.quest.render(c, this.cam);

      c.restore();

      this._drawHUD(c);
      if (this._hurtFlash > 0) {
        c.fillStyle = `rgba(200,30,20,${this._hurtFlash * 0.35})`;
        c.fillRect(0, 0, VIEW_W, VIEW_H);
      }
      this._drawVignette(c);

      if (this.state === ST.MENU) this._drawMenu(c);
      if (this.state === ST.GAMEOVER) this._drawGameOver(c);
      if (this.state === ST.WIN) this._drawWin(c);
      this._drawBottomHints(c);
      c.restore();
    }

    // ----------------------------------------------------- tiles
    _drawTiles(c) {
      const { c0, c1, r0, r1 } = this.map.visibleRange(this.cam.x, this.cam.y, VIEW_W, VIEW_H);
      for (let r = r0; r <= r1; r += 1) {
        for (let cc = c0; cc <= c1; cc += 1) {
          const v = this.map.get(cc, r);
          const x = cc * TILE, y = r * TILE;
          const h = U.hash2(cc, r);
          if (v === '#') {
            c.fillStyle = '#211f33';
            c.fillRect(x, y, TILE, TILE);
            // Cara superior (bisel).
            c.fillStyle = '#383349';
            c.fillRect(x, y, TILE, 7);
            // Costura/vena.
            if (h > 0.72) { c.fillStyle = 'rgba(120,110,190,0.18)'; c.fillRect(x + 6, y + 10, TILE - 12, 4); }
            if (h < 0.2) { c.fillStyle = 'rgba(30,70,50,0.28)'; c.fillRect(x + 2, y + 16, 6, 6); }
          } else {
            const base = h > 0.6 ? '#1c1a22' : (h < 0.3 ? '#18161f' : '#1f1d28');
            c.fillStyle = base;
            c.fillRect(x, y, TILE, TILE);
            // Grietas decorativas.
            if (h > 0.88) {
              c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2;
              c.beginPath(); c.moveTo(x + 8, y + 16); c.lineTo(x + 24, y + 30); c.stroke();
            }
            if (h < 0.12) {
              c.fillStyle = 'rgba(70,90,60,0.24)';
              c.beginPath(); c.ellipse(x + 22, y + 20, 6, 4, 0, 0, U.TAU); c.fill();
            }
          }
        }
      }
    }

    _drawAltar(c) {
      if (!this.heal || this.healUsed) return;
      const x = this.heal.x, y = this.heal.y;
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
      c.fillStyle = '#2a2438';
      c.fillRect(x - 18, y - 10, 36, 26);
      c.fillStyle = `rgba(125,255,176,${0.5 + 0.4 * pulse})`;
      c.font = 'bold 18px serif';
      c.textAlign = 'center';
      c.fillText('✚', x, y + 6);
      c.textAlign = 'left';
    }

    _drawNPC(c) {
      const st = this.quest.stage;
      if (st >= 2 && this.bossDead) return;      // el guardia ya no hace falta
      const x = this.npc.x - this.cam.x, y = this.npc.y - this.cam.y;
      const bob = Math.sin(this.t * 3) * 2;
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath(); c.ellipse(x, y + 16, 11, 5, 0, 0, U.TAU); c.fill();
      // Toga del guardia.
      c.fillStyle = '#3a3f5c';
      c.beginPath(); c.ellipse(x, y + bob - 2, 11, 15, 0, 0, U.TAU); c.fill();
      c.fillStyle = '#2b2f48';
      c.beginPath(); c.ellipse(x, y + bob - 10, 8, 9, 0, 0, U.TAU); c.fill();
      // Baston.
      c.strokeStyle = '#6a5838'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x + 12, y - 10); c.lineTo(x + 16, y + 16); c.stroke();
      // Ojos.
      c.fillStyle = '#ffd97a';
      c.beginPath(); c.arc(x - 2.5, y + bob - 10, 1.6, 0, U.TAU); c.fill();
      c.beginPath(); c.arc(x + 2.5, y + bob - 10, 1.6, 0, U.TAU); c.fill();
      // Indicador de mision.
      if (st < 2) {
        c.fillStyle = `rgba(255,217,122,${0.5 + 0.5 * Math.sin(this.t * 4)})`;
        c.font = 'bold 16px serif';
        c.textAlign = 'center';
        c.fillText('!', x + 16, y - 24);
        c.textAlign = 'left';
      }
    }

    _drawProjectiles(c) {
      for (const pr of this.projectiles) {
        const x = pr.x - this.cam.x, y = pr.y - this.cam.y;
        if (pr.type === 'ring') {
          const a = Math.max(0, 1 - (0.9 - pr.life) * 2);
          c.globalAlpha = 0.9;
          c.strokeStyle = '#ff7a6a'; c.lineWidth = 5;
          c.fillStyle = 'rgba(255,120,100,0.18)';
          c.beginPath(); c.arc(x, y, pr.r + 8, 0, U.TAU); c.fill();
          c.beginPath(); c.arc(x, y, pr.r, 0, U.TAU); c.stroke();
          c.globalAlpha = 1;
        } else {
          c.fillStyle = '#ff9aa2';
          c.beginPath(); c.arc(x, y, 5, 0, U.TAU); c.fill();
          c.fillStyle = '#ffd4d8';
          c.beginPath(); c.arc(x, y, 2.5, 0, U.TAU); c.fill();
        }
      }
    }

    _drawInteractPrompts(c) {
      const p = this.player;
      const prompts = [];
      if (this.quest.stage < 2 && U.dist(p.x, p.y, this.npc.x, this.npc.y) < 58) prompts.push('E · Hablar con el guardia');
      if (this.heal && !this.healUsed && U.dist(p.x, p.y, this.heal.x, this.heal.y) < 58) prompts.push('E · Altar de descanso');
      if (!prompts.length) return;
      c.font = 'bold 15px monospace';
      c.textAlign = 'center';
      c.fillStyle = '#ffe9a8';
      c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 6;
      c.fillText(prompts.join('   •   '), p.x - this.cam.x, p.y - this.cam.y - 34);
      c.shadowBlur = 0;
      c.textAlign = 'left';
    }

    // ----------------------------------------------------- HUD
    _drawHUD(c) {
      if (this.state !== ST.PLAYING && this.state !== ST.PAUSED) return;
      const p = this.player;
      c.save();
      // Barra de vida.
      this._bar(c, 26, 22, 260, 16, Math.max(0, p.hp) / p.maxHp, '#c24a3a', '#50150c');
      c.font = 'bold 13px monospace';
      c.fillStyle = '#fff';
      c.textAlign = 'left';
      c.fillText('VIDA  ' + Math.max(0, Math.ceil(p.hp)) + '/' + p.maxHp, 30, 34);
      // Indicador de dash (cooldown).
      const dc = p.dashCd <= 0;
      c.fillStyle = dc ? '#65c5ff' : 'rgba(101,197,255,0.35)';
      c.fillText('ESQUIVE' + (dc ? '  LISTO' : '  ··'), 30, 54);

      // Contador de bajas.
      c.fillStyle = '#ffd97a';
      c.fillText('BAJAS ' + this.kills + '/' + this.total, 30, 74);
      c.restore();

      // Titulo + descripcion de la mision (abajo, no bloquea).
      const q = this.quest.stageText();
      c.fillStyle = 'rgba(8,10,16,0.75)';
      this._rr(c, 26, VIEW_H - 82, 420, 58, 8); c.fill();
      c.font = 'bold 14px Georgia, serif';
      c.fillStyle = '#ffd97a';
      c.fillText(q.tit, 40, VIEW_H - 62);
      c.font = '13px Georgia, serif';
      c.fillStyle = '#d8d2c2';
      c.fillText(q.desc, 40, VIEW_H - 42);

      // Barra del boss (fase 1/2).
      if (this.boss && !this.boss.dead && this.boss.hp < this.boss.maxHp) {
        const bw = 560, bx = (VIEW_W - bw) / 2;
        c.fillStyle = 'rgba(8,10,16,0.8)';
        this._rr(c, bx - 10, 26, bw + 20, 44, 8); c.fill();
        c.font = 'bold 16px Georgia, serif';
        c.fillStyle = this.boss.phase2 ? '#ff5a7a' : '#d9b14a';
        c.textAlign = 'center';
        c.fillText('LAMIA DE LA MAZMORRA' + (this.boss.phase2 ? '  ·  FASE 2' : ''), VIEW_W / 2, 44);
        this._bar(c, bx, 54, bw, 12, this.boss.healthFrac, this.boss.phase2 ? '#e2324e' : '#9a6a2a', '#2a1a10');
        c.textAlign = 'left';
      }
    }

    _bar(c, x, y, w, h, f, fill, back) {
      c.fillStyle = back; this._rr(c, x, y, w, h, 4); c.fill();
      if (f > 0) { c.fillStyle = fill; this._rr(c, x, y, w * Math.max(0, Math.min(1, f)), h, 4); c.fill(); }
    }

    _rr(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    _drawVignette(c) {
      const g = c.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(2,3,10,0.55)');
      c.fillStyle = g;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    // ----------------------------------------------------- pantallas
    _drawMenu(c) {
      c.fillStyle = 'rgba(5,6,14,0.88)';
      c.fillRect(0, 0, VIEW_W, VIEW_H);
      c.textAlign = 'center';
      c.font = 'bold 62px Georgia, serif';
      c.fillStyle = '#dfc98a';
      c.fillText('GRIEG', VIEW_W / 2, VIEW_H * 0.32);
      c.font = 'italic 22px Georgia, serif';
      c.fillStyle = '#9a8fb0';
      c.fillText('LA SOMBRA DEL OLIMPO · Mazmorra de la Lamia', VIEW_W / 2, VIEW_H * 0.32 + 40);
      c.font = '16px monospace';
      c.fillStyle = Math.floor(this.t * 2) % 2 === 0 ? '#ffe9a8' : '#9a8fb0';
      c.fillText('PULSA ESPACIO PARA COMENZAR', VIEW_W / 2, VIEW_H * 0.52);
      c.fillStyle = '#6b6a80';
      c.fillText('WASD / FLECHAS mover · ESPACIO atacar · SHIFT esquivar', VIEW_W / 2, VIEW_H * 0.6);
      c.fillText('E interactuar · ESC / P pausa', VIEW_W / 2, VIEW_H * 0.6 + 24);
      c.textAlign = 'left';
    }

    _drawGameOver(c) {
      c.fillStyle = 'rgba(30,6,8,0.82)';
      c.fillRect(0, 0, VIEW_W, VIEW_H);
      c.textAlign = 'center';
      c.font = 'bold 52px Georgia, serif';
      c.fillStyle = '#d88a80';
      c.fillText('HAS CAÍDO', VIEW_W / 2, VIEW_H * 0.42);
      c.font = '16px monospace';
      c.fillStyle = '#bdb3ae';
      c.fillText('R para reintentar · ESC al menú', VIEW_W / 2, VIEW_H * 0.5);
      c.textAlign = 'left';
    }

    _drawWin(c) {
      c.fillStyle = 'rgba(8,20,14,0.82)';
      c.fillRect(0, 0, VIEW_W, VIEW_H);
      c.textAlign = 'center';
      c.font = 'bold 52px Georgia, serif';
      c.fillStyle = '#ffd97a';
      c.fillText('MISIÓN CUMPLIDA', VIEW_W / 2, VIEW_H * 0.42);
      c.font = 'italic 18px Georgia, serif';
      c.fillStyle = '#cfe8d4';
      c.fillText('La Lamia yace sin luz. La mazmorra vuelve a ser de los mortales.', VIEW_W / 2, VIEW_H * 0.5);
      c.font = '16px monospace';
      c.fillStyle = '#bdb3ae';
      c.fillText('R para otra expedición · ESC al menú', VIEW_W / 2, VIEW_H * 0.56);
      c.textAlign = 'left';
    }

    _drawBottomHints(c) {
      if (this.state === ST.PLAYING) {
        c.font = '12px monospace';
        c.fillStyle = 'rgba(200,210,230,0.5)';
        c.textAlign = 'right';
        c.fillText('ESC/P pausa · E interactuar', VIEW_W - 20, VIEW_H - 16);
        c.textAlign = 'left';
      }
    }

    // ----------------------------------------------------- tests (SMOKE)
    selfTest() {
      const log = (m) => window.griegAPI && window.griegAPI.log(m);
      const self = this;
      let fail = null;
      try {
        this._newRun();
        this.player.maxHp = 9999; this.player.hp = 9999;     // sin muertes en el test
        this.state = ST.PLAYING;
        this.quest.bubble = null;
        const N = 240;
        for (let i = 0; i < N && !fail; i += 1) {
          this.dt = 1 / 60; this.t += 1 / 60;
          // Simula entradas varias.
          this.input._press(A.ATTACK);
          this.input._press(A.DASH);
          this.player._startSlash(U.norm(Math.sin(i * 0.17), Math.cos(i * 0.11)));
          if (i === 60) { this.enemies.forEach((e) => e.takeDamage(9999, this)); }
          if (i === 130) { this.boss.takeDamage(130, this); }        // dispara fase 2
          if (i === 180) { this.boss.takeDamage(9999, this); this.boss.update(0.1, this.player, this); }
          this._updatePlay(1 / 60);
        }
        if (!this.boss.phase2) throw new Error('phase2 no se activo');
        if (!this.bossDead) throw new Error('boss no muerto');
      } catch (err) {
        fail = err;
      }
      if (fail) { try { log('GRIEG_CRAWLER_SELFTEST_ERR ' + fail.message); } catch (e) { /* noop */ } }
      else log('GRIEG_CRAWLER_SELFTEST_OK');
      this._render();
      if (window.griegAPI) window.griegAPI.quit();
    }

    driveTest() {
      const log = (m) => window.griegAPI && window.griegAPI.log(m);
      const self = this;
      const body = function () {
        self._newRun();
        self.player.maxHp = 9999; self.player.hp = 9999;     // sin muertes en el test
        self.state = ST.PLAYING;
        let cycles = 0;
        while (cycles < 9000 && self.state === ST.PLAYING) {
          cycles += 1;
          if (cycles % 3 === 0) self.player._startSlash(U.norm(self.player.fx + 0.2, self.player.fy));
          if (cycles % 5 === 0) {
            self.enemies.forEach((e) => { if (e.alive) e.takeDamage(9999, self); });
          }
          if (self.boss && !self.boss.dead) self.boss.takeDamage(9999, self);
          self._updatePlay(1 / 60);
          if (cycles % 40 === 0) { try { self._render(); } catch (e) { /* noop */ } }
        }
      };
      try {
        body();
        if (self.state === ST.WIN) log('GRIEG_CRAWLER_DRIVE_TEST_OK state=' + self.state + ' kills=' + self.kills + '/' + self.total);
        else log('GRIEG_CRAWLER_DRIVE_TEST_STUCK state=' + self.state);
        self._render();
      } catch (err) {
        try { log('GRIEG_CRAWLER_DRIVE_TEST_ERR ' + err.message); } catch (e) { /* noop */ }
      }
      if (window.griegAPI) window.griegAPI.quit();
    }
  }

  return { Game, ST };
})();