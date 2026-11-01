/* Arrow Cube Away — deterministic, dependency-free puzzle engine. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ArrowCubeCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const FACE_IDS = ['front', 'right', 'top', 'left', 'back', 'bottom'];
  const LEVEL_COUNT = 100;
  const LEGACY_LEVEL_COUNT = 15;
  const LEVEL_TIERS = Object.freeze([
    {name:'Easy',start:1,end:5},
    {name:'Medium',start:6,end:10},
    {name:'Hard',start:11,end:30},
    {name:'Expert',start:31,end:60},
    {name:'Master',start:61,end:85},
    {name:'Legend',start:86,end:100}
  ]);
  const MAX_HEARTS = 5;

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
    // The first 15 seeded puzzles and their scores are deliberately frozen.
    // From level 16 onward: more arrows, longer routes, and more potential
    // blockers. Max grid size is bounded for phone rendering performance.
    const legacy=n<=LEGACY_LEVEL_COUNT;
    const [target,size,faces,maxLength] = legacy
      ? PROGRESSION[n-1]
      : [150+Math.floor((n-15)*1.25),
         Math.min(18,15+Math.floor((n-16)/21)),
         6,
         Math.min(10,7+Math.floor((n-16)/24))];
    const tier=LEVEL_TIERS.find(t=>n>=t.start&&n<=t.end).name;
    return {level:n,tier,size,faces,maxLength,target,perFace:Math.ceil(target/faces)};
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

  // Higher levels use a faster constructive generator, not longer searches
  // through the original expensive candidate scoring. Every new arrow's
  // head has a free exit WHEN INSERTED; removing in reverse insertion order
  // is therefore always a valid solution, even with complex block chains.
  function generateAdvancedFace(rng,size,count,face,maxLength,level) {
    const arrows=[],occupied=new Set(),exitRays=new Map();
    const maxAttempts=Math.min(115,45+Math.floor((level-16)*.70));
    const weight=4+Math.min(3,(level-16)/28);
    // A candidate moves head-first along its final direction. The current
    // face's occupied Set already represents exactly the other arrows here;
    // unlike getBlocker(), this does not rebuild an occupancy Map per trial.
    function candidateExitBlocked(cells) {
      const tip=cells[cells.length-1],prev=cells[cells.length-2];
      const dx=tip.x-prev.x,dy=tip.y-prev.y;
      for(let step=1;step<=size;step++){
        const x=tip.x+dx*step,y=tip.y+dy*step;
        if(!inGrid(x,y,size))break;
        if(occupied.has(key(x,y)))return true;
      }
      return false;
    }
    function impactScore(cells) {
      const blocked=new Set();
      for(const c of cells) {
        const hit=exitRays.get(key(c.x,c.y));
        if(hit)for(const id of hit)blocked.add(id);
      }
      return blocked.size;
    }
    for(let i=0;i<count;i++){
      let chosen=null,best=-Infinity;
      for(let attempt=0;attempt<maxAttempts;attempt++){
        const free=size*size-occupied.size,remaining=count-i;
        // Reserve enough grid capacity for the later arrows. Without this,
        // an early long route can strand isolated cells and prevent a full
        // target count even though the puzzle itself remains solvable.
        const maxCells=Math.min(maxLength,Math.max(2,Math.floor(free/remaining*.93)));
        const cells=candidatePath(rng,size,2,maxCells);
        if(!cells||cells.some(c=>occupied.has(key(c.x,c.y))))continue;
        // Leave enough cells for the remaining arrows at minimum length 2.
        if(size*size-occupied.size-cells.length<(count-i-1)*2)continue;
        const trial={id:face+'-'+i,face,cells,removed:false};
        if(candidateExitBlocked(cells))continue;
        let bends=0;
        for(let j=2;j<cells.length;j++){
          const a=cells[j-2],b=cells[j-1],c=cells[j];
          if(b.x-a.x!==c.x-b.x || b.y-a.y!==c.y-b.y)bends++;
        }
        const score=impactScore(cells)*weight +
          bends*(.35+Math.min(.4,(level-16)/180)) +
          cells.length*.08+rng()*.45;
        if(score>best){best=score;chosen=trial;}
        if(attempt>22 && best>=weight*2+bends*.30)break;
      }
      if(!chosen){
        const candidates=[];
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
          if(occupied.has(key(x,y)))continue;
          for(const d of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
            const nx=x+d.x,ny=y+d.y;
            if(!inGrid(nx,ny,size)||occupied.has(key(nx,ny)))continue;
            const trial={id:face+'-'+i,face,cells:[{x,y},{x:nx,y:ny}],removed:false};
            if(!candidateExitBlocked(trial.cells))candidates.push(trial);
          }
        }
        if(candidates.length){
          // Prefer a new piece which blocks something already on the board.
          candidates.sort((a,b)=>impactScore(b.cells)-impactScore(a.cells));
          chosen=candidates[0];
        }
      }
      if(!chosen)break;
      chosen.order=i;
      arrows.push(chosen);
      for(const cell of chosen.cells)occupied.add(key(cell.x,cell.y));
      const d=getDirection(chosen),tip=chosen.cells[chosen.cells.length-1];
      for(let j=1;j<=size;j++){
        const x=tip.x+d.x*j,y=tip.y+d.y*j;
        if(!inGrid(x,y,size))break;
        const cellId=key(x,y);
        if(!exitRays.has(cellId))exitRays.set(cellId,new Set());
        exitRays.get(cellId).add(chosen.id);
      }
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
      if(config.level<=LEGACY_LEVEL_COUNT){
        // Keep the exact original shared RNG sequence for legacy puzzles.
        arrows.push(...generateFace(rng,config.size,count,face,config.maxLength,config.level));
      }else{
        let found=null;
        // Retry difficult packing with distinct reproducible seeds instead
        // of silently shipping levels with missing arrows.
        for(let attempt=0;attempt<8;attempt++){
          const seed=(0xA3C8E1 + config.level*29791 +
            Math.imul(index+1,0x9e3779b9) + Math.imul(attempt,0x85ebca6b))>>>0;
          const result=generateAdvancedFace(randomGenerator(seed),
            config.size,count,face,config.maxLength,config.level);
          if(result.length===count){found=result;break;}
        }
        if(!found)throw new Error(`Unable to generate level ${config.level} face ${face} at target density`);
        arrows.push(...found);
      }
    });
    return { ...config, arrows, total: arrows.length };
  }

  // A completed puzzle awards points. Replays award only improvements
  // over the player's previous best, preventing unlimited score farming.
  function calculateLevelScore({arrows,hearts,tier,hints}={}) {
    const count=Math.max(0,Math.floor(Number(arrows)||0));
    const lives=Math.max(0,Math.min(MAX_HEARTS,Math.floor(Number(hearts)||0)));
    const assists=Math.max(0,Math.floor(Number(hints)||0));
    const tierBonus=({Easy:25,Medium:75,Hard:150,Expert:225,Master:300,Legend:400})[tier]??25;
    return Math.max(0,count*10 + lives*25 + tierBonus - assists*15);
  }
  function getScoreAward(previousBest,score) {
    const oldBest=Math.max(0,Math.floor(Number(previousBest)||0));
    const updated=Math.max(oldBest,Math.max(0,Math.floor(Number(score)||0)));
    return {best:updated,awarded:updated-oldBest};
  }

  // Build a readable screen-space arrowhead. A triangle defined only in
  // grid units gets visually swallowed after the shaft is thickened and can
  // collapse under 3D foreshortening. Pixel-space geometry stays legible.
  function buildArrowHead(tip,behind,width) {
    const vx=Number(tip?.x)-Number(behind?.x);
    const vy=Number(tip?.y)-Number(behind?.y);
    const length=Math.hypot(vx,vy);
    if (!Number.isFinite(length) || length<0.001) return null;
    const ux=vx/length,uy=vy/length;
    const stroke=Math.max(1,Number(width)||1);
    const headLength=Math.max(9,Math.min(19,stroke*3.1));
    const halfWidth=Math.max(5,Math.min(12,stroke*1.55));
    const shaftEnd={x:tip.x-ux*headLength,y:tip.y-uy*headLength};
    return {
      tip:{x:tip.x,y:tip.y},
      shaftEnd,
      wing1:{x:shaftEnd.x-uy*halfWidth,y:shaftEnd.y+ux*halfWidth},
      wing2:{x:shaftEnd.x+uy*halfWidth,y:shaftEnd.y-ux*halfWidth}
    };
  }

  // Sizes come from the grid, not from fixed pixels: a head wider than one cell would
  // hide the lane beside it, which is what made dense levels unreadable.
  function sceneScale(width,height) { return Math.min(width*.325,height*.27,300); }
  function arrowMetrics(cellPitch) {
    const width=Math.max(2.4,Math.min(8,(Number(cellPitch)||0)*.30));
    const head=buildArrowHead({x:1,y:0},{x:0,y:0},width);
    return {
      width,
      headLength:Math.hypot(head.tip.x-head.shaftEnd.x,head.tip.y-head.shaftEnd.y),
      headWidth:Math.hypot(head.wing1.x-head.wing2.x,head.wing1.y-head.wing2.y)
    };
  }

  // Flat ink geometry in face-local GRID coordinates. These vertices get
  // projected along with the cube surface; no constant screen-space line
  // thickness, billboard tips, extrusion or fake 3D arrow geometry.
  function buildFlatArrowGeometry(points,direction,bodyWidth=.23) {
    if (!Array.isArray(points) || points.length<2 ||
        points.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.y))) return null;
    const dx=Number(direction?.x),dy=Number(direction?.y);
    const length=Math.hypot(dx,dy);
    if (!Number.isFinite(length) || length<.001) return null;
    const ux=dx/length,uy=dy/length;
    const width=Math.max(.10,Math.min(.32,Number(bodyWidth)||.23));
    const radius=width/2,headLength=.32,headHalfWidth=.25;
    const tip=points[points.length-1];
    const base={x:tip.x-ux*headLength,y:tip.y-uy*headLength};
    const shaft=points.slice(0,-1).map(p=>({x:p.x,y:p.y}));
    shaft.push(base);
    const quads=[],discs=[];
    for(let i=1;i<shaft.length;i++) {
      const a=shaft[i-1],b=shaft[i];
      const lx=b.x-a.x,ly=b.y-a.y,dist=Math.hypot(lx,ly);
      if(dist<.0001)continue;
      const nx=-ly/dist*radius,ny=lx/dist*radius;
      quads.push([
        {x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},
        {x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}
      ]);
    }
    // Circular joints and a rounded tail are flat disks on the same face.
    // Each disk is projected with the face, so it foreshortens correctly.
    for(const p of shaft) {
      const disc=[];
      for(let j=0;j<12;j++){
        const a=j*Math.PI*2/12;
        disc.push({x:p.x+radius*Math.cos(a),y:p.y+radius*Math.sin(a)});
      }
      discs.push(disc);
    }
    return {
      quads,discs,
      head:[
        {x:tip.x,y:tip.y},
        {x:base.x-uy*headHalfWidth,y:base.y+ux*headHalfWidth},
        {x:base.x+uy*headHalfWidth,y:base.y-ux*headHalfWidth}
      ],
      shaft,bodyWidth:width,headWidth:headHalfWidth*2
    };
  }

  // Screen-space selection: the entire visible polyline, including its
  // arrowhead, is tappable. Pick the nearest stroke instead of requiring
  // an exact tap on the tip; slight depth preference breaks visual ties.
  function pointToSegmentDistance(x,y,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y;
    const lenSq=dx*dx+dy*dy;
    const t=lenSq>0?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/lenSq)):0;
    return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
  }
  function insideTriangle(x,y,a,b,c) {
    const sign=(p,q)=>(x-q.x)*(p.y-q.y)-(p.x-q.x)*(y-q.y);
    const u=sign(a,b),v=sign(b,c),w=sign(c,a);
    return !(u<0||v<0||w<0) || !(u>0||v>0||w>0);
  }
  function pickProjectedArrow(x,y,items,touchPadding=7) {
    if(!Number.isFinite(x)||!Number.isFinite(y))return null;
    let best=null,bestScore=Infinity,bestDepth=-Infinity;
    for(const item of items) {
      if(!item.arrow || item.arrow.removed || !Array.isArray(item.points) || item.points.length<2)continue;
      let distance=Infinity;
      for(let i=1;i<item.points.length;i++) {
        distance=Math.min(distance,pointToSegmentDistance(x,y,item.points[i-1],item.points[i]));
      }
      if(item.tip && item.wing1 && item.wing2) {
        const [a,b,c]=[item.tip,item.wing1,item.wing2];
        if(insideTriangle(x,y,a,b,c))distance=0;
        else {
          distance=Math.min(distance,pointToSegmentDistance(x,y,a,b),
            pointToSegmentDistance(x,y,b,c),pointToSegmentDistance(x,y,c,a));
        }
      }
      const radius=Math.max(7,(Number(item.width)||3)/2+Math.max(0,touchPadding));
      if(distance>radius)continue;
      const depth=Number(item.depth)||0;
      // Distance controls selection. Prefer the frontmost face only on
      // visually indistinguishable overlapping strokes.
      if(distance<bestScore-0.5 || (Math.abs(distance-bestScore)<=0.5 && depth>bestDepth)) {
        best=item.arrow;bestScore=distance;bestDepth=depth;
      }
    }
    return best;
  }

  function availableArrows(level) {
    return level.arrows.filter(a => !a.removed && !isBlocked(a, level.arrows, level.size));
  }

  // Face visibility is a 3D front-facing test, not a screen-space line-width
  // adjustment. At grazing angles the projected grid compresses to a sliver
  // while the pixel-sized arrowheads do not; fully cull those arrows to avoid
  // a wall of overlapping tips along the cube edges.
  function faceArrowOpacity(view) {
    if (!Number.isFinite(view) || view <= 0.28) return 0;
    const t = Math.min(1,(view-0.28)/0.38);
    return t*t*(3-2*t);
  }

  // Free rotation helpers. Angles are radians.
  // nearestAngle: the angle equivalent to `goal` (mod a full turn) that is closest to `now`,
  // so easing toward it never spins the long way round.
  function nearestAngle(goal, now) { const t = Math.PI * 2; return goal + t * Math.round((now - goal) / t); }
  // turnDirection: +1 when the cube is upright, -1 when it is upside down, so a sideways
  // drag still follows the finger after the cube has been tipped over the top.
  function turnDirection(pitch) { return Math.cos(pitch) < 0 ? -1 : 1; }

  return { nearestAngle, turnDirection, faceArrowOpacity, FACE_IDS, LEVEL_COUNT, LEVEL_TIERS, MAX_HEARTS, pickProjectedArrow, buildArrowHead, buildFlatArrowGeometry, arrowMetrics, sceneScale, getLevelConfig, generateLevel, isBlocked, getBlocker, getDirection, getEscapeShape, availableArrows, calculateLevelScore, getScoreAward };
});
