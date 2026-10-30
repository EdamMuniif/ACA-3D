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

  // A flexible arrow advances head first through its OWN centreline.
  // Only the newly exposed lane in front of its head can hit another arrow.
  // The previous rigid translation incorrectly rejected legal moves.
  function getBlocker(arrow, others, size) {
    if (arrow.removed) return null;
    const {x:dx,y:dy}=getDirection(arrow);
    if (Math.abs(dx)+Math.abs(dy)!==1) throw new Error('Invalid terminal arrow segment');
    const tip=arrow.cells[arrow.cells.length-1];
    const occupied=new Map();
    for (const other of others) {
      if (other.id===arrow.id || other.removed || other.face!==arrow.face) continue;
      for (const c of other.cells) occupied.set(key(c.x,c.y),other.id);
    }
    for(let n=1;n<=size;n++) {
      const x=tip.x+dx*n, y=tip.y+dy*n;
      if(!inGrid(x,y,size)) break;
      const id=occupied.get(key(x,y));
      if(id) return {id,face:arrow.face,distance:n,cell:{x,y}};
    }
    return null;
  }
  function isBlocked(arrow, others, size) { return Boolean(getBlocker(arrow,others,size)); }

  // The rendered arrow travels HEAD-FIRST through its own bends; its tail
  // follows the same centreline, then continues past the cube edge.
  // isBlocked checks the head's straight exit ray, matching the visible motion.
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

  // Reference video: 5 arrows at level 1, then increasingly dense levels.
  // The source recording does not expose proprietary per-arrow level layouts;
  // all puzzles remain seeded, independently generated, and solvable.
  const PROGRESSION = [
    [5,5,2,3], [28,7,4,4], [44,8,4,5], [57,9,5,5], [64,9,5,5],
    [70,9,5,5], [78,9,6,5], [86,10,6,6], [94,11,6,6], [102,11,6,6],
    [112,11,6,6], [120,11,6,6], [130,14,6,6], [140,14,6,7], [150,14,6,7]
  ];
  function getLevelConfig(level) {
    const n = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1));
    const [target,size,faces,maxLength] = PROGRESSION[n-1];
    const tier = n <= 5 ? 'Easy' : n <= 10 ? 'Medium' : 'Hard';
    return { level:n, tier, size, faces, maxLength, target, perFace:Math.ceil(target/faces) };
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
      // If dense random winding paths can no longer fit, search every legal
      // two-cell pair. Never silently reduce the stated level target.
      if (!chosen) {
        const candidates=[];
        for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
          if(occupied.has(key(x,y))) continue;
          for(const d of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]) {
            const nx=x+d.x,ny=y+d.y;
            if(!inGrid(nx,ny,size) || occupied.has(key(nx,ny))) continue;
            const trial={id:face+'-'+i,face,cells:[{x,y},{x:nx,y:ny}],removed:false};
            if(!isBlocked(trial,arrows,size)) candidates.push(trial);
          }
        }
        if(candidates.length) chosen=candidates[randomInt(rng,0,candidates.length-1)];
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
      const count = Math.floor(config.target/config.faces) +
        (index < config.target%config.faces ? 1 : 0);
      arrows.push(...generateFace(rng, config.size, count, face, config.maxLength, config.level));
    });
    return { ...config, arrows, total: arrows.length };
  }

  function availableArrows(level) {
    return level.arrows.filter(a => !a.removed && !isBlocked(a, level.arrows, level.size));
  }

  return { FACE_IDS, LEVEL_COUNT, getLevelConfig, generateLevel, isBlocked, getBlocker, getDirection, getEscapeShape, availableArrows };
});
