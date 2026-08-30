/**
 * Utils.js — Utilidades compartidas de la nueva arquitectura "Grieg Crawler".
 * Modulo plano en window.Utils (CSP: sin requiere, IIFE).
 */
'use strict';

window.Utils = (function () {
  const TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return Math.floor(rand(a, b + 1)); }
  function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
  function ang(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t * t; }
  function norm(ax, ay) { const m = Math.hypot(ax, ay) || 1; return { x: ax / m, y: ay / m }; }
  function hash2(a, b) { const n = a * 374761393 + b * 668265263; return ((n % 997) + 997) % 997 / 997; }

  return {
    TAU, clamp, lerp, rand, randi, dist, ang, angleDiff, easeOut, easeIn, norm, hash2
  };
})();