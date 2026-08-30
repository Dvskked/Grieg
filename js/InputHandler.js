/**
 * InputHandler.js — Teclado + raton priorizando la latencia de respuesta.
 * - Acciones por cola de pulso (press/conmsume) para no perder tics.
 * - Estado continuo (down) para movimiento.
 * - Mouse: clic = ataque, posicion = mira para el corte.
 */
'use strict';

window.InputHandler = (function () {
  const A = {
    UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right',
    ATTACK: 'attack', DASH: 'dash', PAUSE: 'pause',
    INTERACT: 'interact', CONFIRM: 'confirm', CANCEL: 'cancel',
    RESTART: 'restart'
  };

  const KEYMAP = {
    ArrowUp: A.UP, KeyW: A.UP,
    ArrowDown: A.DOWN, KeyS: A.DOWN,
    ArrowLeft: A.LEFT, KeyA: A.LEFT,
    ArrowRight: A.RIGHT, KeyD: A.RIGHT,
    Space: A.ATTACK,                  // espacio: ataque (+confirmar en menus)
    ShiftLeft: A.DASH, ShiftRight: A.DASH,
    Escape: A.PAUSE, KeyP: A.PAUSE,   // ESC/P: pausa (+cancelar)
    KeyE: A.INTERACT,                 // E: interactuar
    Enter: A.CONFIRM,
    KeyR: A.RESTART
  };

  class InputHandler {
    constructor(canvas) {
      this.canvas = canvas;
      this.A = A;                          // expone las acciones (Player/Game la usan)
      this._down = new Set();          // acciones con tecla retenida
      this._pressQ = [];               // cola de pulsos
      this._keyState = {};
      this.mouseX = 0; this.mouseY = 0;    // >=> viewport 1280x720 (convertido por Game)
      this.mouseActive = false;
      this._onKeyDown = (e) => this._key(e, true);
      this._onKeyUp = (e) => this._key(e, false);
      this._onMouse = (e) => this._mouse(e);
      this._onPointerUp = (e) => this._pointer(e);
      this._bind();
    }

    _bind() {
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      window.addEventListener('mousedown', this._onPointerUp);
      window.addEventListener('mousemove', this._onMouse);
      window.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    destroy() {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      window.removeEventListener('mousedown', this._onPointerUp);
      window.removeEventListener('mousemove', this._onMouse);
    }

    _key(e, down) {
      const a = KEYMAP[e.code];
      if (a) e.preventDefault();
      if (!a) return;
      if (down) {
        if (!this._keyState[a]) this._press(a);
        this._keyState[a] = true;
        this._down.add(a);
      } else {
        this._keyState[a] = false;
        this._down.delete(a);
      }
    }

    _pointer(e) {
      if (e.button !== undefined && e.button !== 0) return;
      const p = this._toLocal(e);
      this.mouseActive = true;
      this._press(A.ATTACK);
      this._press(A.CONFIRM);
    }

    _mouse(e) {
      if (e.buttons && (e.buttons & 1)) {
        this.mouseActive = true;
        this._press(A.ATTACK);
        this._press(A.CONFIRM);
      }
      const p = this._toLocal(e);
      this.mouseX = p.x; this.mouseY = p.y;
    }

    _toLocal(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
        y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
      };
    }

    /** Encola un pulso; las repeticiones automaticas no vuelven a encolar. */
    _press(a) {
      if (!this._pressQ.some((p) => p === a)) this._pressQ.push(a);
    }

    /** Consume y devuelve true si hay un pulso pendiente de la accion. */
    press(a) {
      const i = this._pressQ.indexOf(a);
      if (i >= 0) { this._pressQ.splice(i, 1); return true; }
      return false;
    }

    /** Estado continuo (tecla o boton retenido). */
    down(a) { return this._down.has(a); }

    /** Borra pulsos pendientes (imperativo al cambiar de estado: evita re-disparos). */
    clearPress(actions) {
      (actions || Object.values(A)).forEach((a) => {
        const i = this._pressQ.indexOf(a);
        if (i >= 0) this._pressQ.splice(i, 1);
      });
    }

    /** Vector de direccion discretizado a 8 sentidos (-1..1). */
    dirX() { return (this.down(A.RIGHT) ? 1 : 0) - (this.down(A.LEFT) ? 1 : 0); }
    dirY() { return (this.down(A.DOWN) ? 1 : 0) - (this.down(A.UP) ? 1 : 0); }

    /** Direccion con el mouse (si se ha movido recientemente) o teclado. */
    aimVec(fallbackX, fallbackY) {
      if (this.mouseActive) {
        const v = Utils.norm(this.mouseX - fallbackX, this.mouseY - fallbackY);
        if (v.x !== 0 || v.y !== 0) return v;
      }
      const d = Utils.norm(this.dirX(), this.dirY());
      return (d.x || d.y) ? d : { x: 0, y: -1 };
    }
  }

  return { InputHandler, A };
})();