/* Arrow Cube Away — deterministic, dependency-free puzzle engine. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ArrowCubeCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const FACE_IDS = ['front', 'right', 'top', 'left', 'back', 'bottom'];
  const LEVEL_COUNT = 15;

  function randomGenerator(seed) {
    let s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randomInt(rng, min, max) { return min + Math.floor(rng() * (max - min + 1)); }
  function key(x, y) { return x + ',' + y; }
  function inGrid(x, y, size) { return x >= 0 && y >= 0 && x < size && y < size; }

  function getDirection(arrow) {
    const p = arrow.cells;
    return { x: p[p.length - 1].x - p[p.length - 2].x,
             y: p[p.length - 1].y - p[p.length - 2].y };
  }

  // An arrow slides rigidly along the direction of its head until every
  // occupied cell has passed the edge. It cannot overlap another arrow.
  function isBlocked(arrow, others, size) {
    if (arrow.removed) return false;
    const d = getDirection(arrow);
    const occupied = new Set();
    for (const other of others) {
      if (other.id === arrow.id || other.removed || other.face !== arrow.face) continue;
      for (const c of other.cells) occupied.add(key(c.x, c.y));
    }
    for (let step = 1; step <= size * 2 + 2; step++) {
      let stillInside = false;
      for (const c of arrow.cells) {
        const x = c.x + d.x * step, y = c.y + d.y * step;
        if (!inGrid(x, y, size)) continue;
        stillInside = true;
        if (occupied.has(key(x, y))) return true;
      }
      if (!stillInside) return false;
    }
    return false;
  }

  // The rendered arrow travels HEAD-FIRST through its own bends; its tail
  // follows the same centreline, then continues past the cube edge.
  // This is a visual animation: isBlocked remains the conservative rigid-slide
  // clearance check so paths that pass it are not obstructed by other arrows.
  function getEscapeShape(arrow, size, travel = 0) {
    const d = getDirection(arrow);
    const cells = arrow.cells;
    const vertices = cells.map(c => ({ x:c.x + .5, y:c.y + .5 }));
    const last = vertices[vertices.length - 1];
    const tip = { x:last.x + d.x * .39, y:last.y + d.y * .39 };
    vertices.push(tip);

    const distances = [0];
    for (let i=1;i<vertices.length;i++) {
      distances.push(distances[i-1] + Math.hypot(
        vertices[i].x-vertices[i-1].x, vertices[i].y-vertices[i-1].y));
    }
    const length = distances[distances.length-1];
    const edgeDistance = d.x > 0 ? size-tip.x : d.x < 0 ? tip.x :
      d.y > 0 ? size-tip.y : tip.y;
    const totalTravel = length + Math.max(0,edgeDistance) + .75;
    const offset = Math.min(totalTravel,Math.max(0,Number(travel)||0));

    function along(distance) {
      if (distance >= length) return {
        x:tip.x + d.x*(distance-length),
        y:tip.y + d.y*(distance-length)
      };
      for (let i=1;i<vertices.length;i++) {
        if (distance <= distances[i]) {
          const fraction = (distance-distances[i-1])/(distances[i]-distances[i-1]);
          return {
            x:vertices[i-1].x+(vertices[i].x-vertices[i-1].x)*fraction,
            y:vertices[i-1].y+(vertices[i].y-vertices[i-1].y)*fraction
          };
        }
      }
      return { ...tip };
    }
    const points = [along(offset)];
    for (let i=1;i<vertices.length;i++) {
      if (distances[i] > offset && distances[i] < length+offset) points.push(vertices[i]);
    }
    const head = along(length+offset);
    points.push(head);
    return { points, head, direction:d, length, totalTravel };
  }

  function candidatePath(rng, size, minLength, maxLength) {
    const target = randomInt(rng, minLength, maxLength);
    const path = [{ x: randomInt(rng, 0, size - 1), y: randomInt(rng, 0, size - 1) }];
    let last = -1;
    const dirs = [{x:1,y:0}, {x:0,y:1}, {x:-1,y:0}, {x:0,y:-1}];
    while (path.length < target) {
      const cur = path[path.length - 1];
      const choices = dirs.map((d, i) => ({ d, i }))
        .filter(({ d }) => inGrid(cur.x + d.x, cur.y + d.y, size)
              && !path.some(c => c.x === cur.x + d.x && c.y === cur.y + d.y));
      if (!choices.length) return null;
      // Bias toward longer straight lines with occasional right-angle turns.
      let chosen;
      if (last >= 0 && rng() < 0.59) chosen = choices.find(v => v.i === last);
      if (!chosen) chosen = choices[randomInt(rng, 0, choices.length - 1)];
      path.push({ x: cur.x + chosen.d.x, y: cur.y + chosen.d.y });
      last = chosen.i;
    }
    return path;
  }

  function getLevelConfig(level) {
    const n = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1));
    const tier = n <= 5 ? 'Easy' : n <= 10 ? 'Medium' : 'Hard';
    const within = (n - 1) % 5;
    if (tier === 'Easy') return { level:n, tier, size:5, faces:3 + (within >= 3 ? 1 : 0), perFace:3 + Math.floor(within / 2), maxLength:4 };
    if (tier === 'Medium') return { level:n, tier, size:6, faces:5, perFace:5 + Math.floor(within / 2), maxLength:5 };
    return { level:n, tier, size:7, faces:6, perFace:7 + Math.floor(within / 2), maxLength:5 };
  }

  function generateFace(rng, size, count, face, maxLength, level) {
    const arrows = [];
    const occupied = new Set();
    for (let i = 0; i < count; i++) {
      let chosen = null, bestScore = -Infinity;
      // Every added arrow must have an exit. Thus the reverse insertion
      // order is a constructive proof that every generated board is solvable.
      for (let attempt = 0; attempt < 550; attempt++) {
        const cells = candidatePath(rng, size, 2, maxLength);
        if (!cells || cells.some(c => occupied.has(key(c.x, c.y)))) continue;
        const trial = { id: face + '-' + i, face, cells, removed: false };
        if (isBlocked(trial, arrows, size)) continue;
        let newBlocks = 0;
        for (const other of arrows) {
          if (!isBlocked(other, arrows, size) && isBlocked(other, [...arrows, trial], size)) newBlocks++;
        }
        const bends = cells.slice(2).reduce((acc,c,index) => {
          const p = cells[index+1], pp = cells[index];
          return acc + ((c.x - p.x !== p.x - pp.x || c.y - p.y !== p.y - pp.y) ? 1 : 0);
        }, 0);
        const score = newBlocks * (level < 3 ? 0.25 : 3) + bends * 0.16 + rng() * 2.2;
        if (score > bestScore) { chosen = trial; bestScore = score; }
        if (attempt > 70 && chosen && bestScore > 3.7) break;
      }
      if (!chosen) break;
      chosen.order = i;
      arrows.push(chosen);
      for (const c of chosen.cells) occupied.add(key(c.x, c.y));
    }
    return arrows;
  }

  function generateLevel(level) {
    const config = getLevelConfig(level);
    const rng = randomGenerator(0xA3C8E1 + config.level * 29791);
    const arrows = [];
    FACE_IDS.slice(0, config.faces).forEach((face, index) => {
      const count = config.perFace + ((config.level > 1 && index % 3 === 1) ? 1 : 0);
      arrows.push(...generateFace(rng, config.size, count, face, config.maxLength, config.level));
    });
    return { ...config, arrows, total: arrows.length };
  }

  function availableArrows(level) {
    return level.arrows.filter(a => !a.removed && !isBlocked(a, level.arrows, level.size));
  }

  return { FACE_IDS, LEVEL_COUNT, getLevelConfig, generateLevel, isBlocked, getDirection, getEscapeShape, availableArrows };
});
