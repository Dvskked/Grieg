/**
 * boot.js — Arranque del juego (script externo, cumple la CSP).
 * Soportes '#selftest' y '#drive' para los SMOKE tests automaticos.
 */
'use strict';

window.addEventListener('error', function (e) {
  var api = window.griegAPI;
  if (api) api.log('GRIEG_ERR ' + (e.message || e.error));
  else console.error('GRIEG::ERR ' + (e.message || e.error));
});

(function boot() {
  var canvas = document.getElementById('game');
  var GameClass = window.Game && window.Game.Game;
  if (!canvas || typeof GameClass !== 'function') {
    console.error('GRIEG::FALLO al cargar los modulos del juego');
    return;
  }
  var game = new GameClass(canvas);
  window.__game = game;

  if (window.location.hash === '#selftest') {
    game.selfTest();
  } else if (window.location.hash === '#drive') {
    game.driveTest();
  } else {
    game.start();
  }
})();