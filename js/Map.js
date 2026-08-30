/**
 * Map.js — Mapa por cuadricula/matriz de tiles de mazmorra.
 * - Tiles solidos '#' (pared / colision AABB) y transitables '.'.
 * - Generador de la mazmorra por habitaciones + pasillos (conectividad
 *   garantizada por diseno, sin componentes aislados).
 * - Firma de colision rect<->tiles y utilidades de culling para el render.
 *
 * Leyenda de markers (se colocan encima del suelo '.'):
 *   P -> spawn jugador | N -> NPC de misiones | E -> esbirro | B -> Boss (Lamia)
 *   H -> altar de descanso/heal
 */
'use strict';

window.MapModule = (function () {
  const TILE = 40;                    // px por tile (limpieza visual + rendimiento)
  const WALL = '#', FLOOR = '.', HEAL = 'H';

  class DungeonMap {
    constructor(cols, rows) {
      this.cols = cols;
      this.rows = rows;
      this.tiles = [];
      for (let r = 0; r < rows; r += 1) {
        const row = [];
        for (let c = 0; c < cols; c += 1) row.push(WALL);
        this.tiles.push(row);
      }
    }

    set(c, r, v) { if (c >= 0 && r >= 0 && c < this.cols && r < this.rows) this.tiles[r][c] = v; }
    get(c, r) { return (c >= 0 && r >= 0 && c < this.cols && r < this.rows) ? this.tiles[r][c] : WALL; }
    isWall(c, r) { return this.get(c, r) === WALL; }

    /** True si la caja (px,py = borde sup-izq, w,h) solapa algun tile solido. */
    collidesRect(px, py, w, h) {
      const c0 = Math.floor(px / TILE), c1 = Math.floor((px + w - 0.01) / TILE);
      const r0 = Math.floor(py / TILE), r1 = Math.floor((py + h - 0.01) / TILE);
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) {
          if (this.isWall(c, r)) return true;
        }
      }
      return false;
    }

    /** Rango de tiles visibles por camara (culling). */
    visibleRange(camX, camY, viewW, viewH) {
      const c0 = Math.max(0, Math.floor(camX / TILE));
      const c1 = Math.min(this.cols - 1, Math.floor((camX + viewW) / TILE));
      const r0 = Math.max(0, Math.floor(camY / TILE));
      const r1 = Math.min(this.rows - 1, Math.floor((camY + viewH) / TILE));
      return { c0, c1, r0, r1 };
    }
  }

  const carve = (map, x1, y1, x2, y2) => {
    for (let r = y1; r <= y2; r += 1) {
      for (let c = x1; c <= x2; c += 1) map.set(c, r, FLOOR);
    }
  };

  /** Crea la disposicion de la mazmorra: spawn -> sala central -> arena del boss. */
  function buildDungeon() {
    const COLS = 40, ROWS = 24;
    const map = new DungeonMap(COLS, ROWS);

    // --- Habitaciones (todas conectadas por pasillos). ---
    carve(map, 3, 3, 14, 9);    // A: sala de entrada (spawn + NPC)
    carve(map, 3, 13, 14, 20);  // B: gran sala de esbirros
    carve(map, 14, 8, 29, 11);  // C: corredor central 4-tiles (patrullas)
    carve(map, 28, 3, 37, 15);  // D: arena de la Lamia
    carve(map, 19, 3, 26, 5);   // E: camara-alcotas norte

    // --- Pasillos (2 tiles de ancho). ---
    carve(map, 11, 9, 12, 13);  // A -> B
    carve(map, 22, 5, 23, 8);   // E -> C

    // --- Pilares / obstaculos para tejer el patrullaje (nunca en puertas). ---
    const pillar = (list) => list.forEach(([c, r]) => { if (map.get(c, r) === FLOOR) map.set(c, r, WALL); });
    pillar([[5, 6], [6, 6], [13, 5], [13, 6]]);      // A (cajas junto a habitacion)
    pillar([[5, 15], [9, 17], [7, 19], [12, 18]]);   // B (pilares)
    pillar([[17, 9], [21, 10], [25, 9]]);            // C (pilares del corredor)
    pillar([[30, 4], [35, 4], [30, 14], [35, 14]]);  // D (esquinas del averno)

    // --- Markers sobre suelo. ---
    const spawn = { x: (8 + 0.5) * TILE, y: (8 + 0.5) * TILE };
    const npc = { x: (5 + 0.5) * TILE, y: (5 + 0.5) * TILE };

    const enemyTiles = [
      [4, 7], [13, 4], [12, 6],      // A
      [24, 4],                        // E
      [16, 10], [22, 8], [26, 9],    // C
      [5, 16], [9, 14], [12, 19], [6, 19], // B
      [28, 9]                         // guardia de la arena
    ];
    const enemies = enemyTiles.map(([c, r]) => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }));

    const boss = { x: (33 + 0.5) * TILE, y: (9 + 0.5) * TILE };

    // Altar de descanso (heal) en la sala B.
    map.set(12, 20, HEAL);
    const heal = { x: (12 + 0.5) * TILE, y: (20 + 0.5) * TILE };

    return {
      map, spawn, npc, enemies, boss, heal,
      worldW: COLS * TILE, worldH: ROWS * TILE
    };
  }

  return { DungeonMap, buildDungeon, TILE, WALL, FLOOR, HEAL };
})();