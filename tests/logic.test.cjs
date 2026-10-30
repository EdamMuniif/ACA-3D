const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

test('all 15 levels generate deterministically and are solvable', () => {
  for (let n=1;n<=15;n++) {
    const first = Core.generateLevel(n);
    const second = Core.generateLevel(n);
    assert.deepEqual(first,second,`Level ${n} changed for same seed`);
    assert.ok(first.total>=6,`Level ${n} has too few arrows`);
    assert.equal(first.total,first.arrows.length);
    const ids=new Set(first.arrows.map(a=>a.id));
    assert.equal(ids.size,first.arrows.length,`Level ${n} duplicate IDs`);
    // Valid constructive solution: repeatedly take any available arrow.
    let count=0;
    while (count<first.total) {
      const free=Core.availableArrows(first);
      assert.ok(free.length,`Level ${n} reached impossible state at move ${count}`);
      free[0].removed=true;
      count++;
    }
    assert.equal(count,first.total);
  }
});

test('blocking looks only at the cells in front of the head (what you see is what is enforced)', () => {
  // Head at (1,2) pointing down. Its ray is (1,3),(1,4).
  const a={id:'a',face:'front',cells:[{x:0,y:1},{x:1,y:1},{x:1,y:2}]};
  const ahead={id:'b',face:'front',cells:[{x:0,y:3},{x:1,y:3}]};
  assert.equal(Core.isBlocked(a,[a,ahead],5),true);
  assert.equal(Core.findBlocker(a,[a,ahead],5).blocker.id,'b');
  assert.deepEqual(Core.findBlocker(a,[a,ahead],5).ray,[{x:1,y:3}]);
  // Same board, other face, or already removed: not blocking.
  ahead.face='back';  assert.equal(Core.isBlocked(a,[a,ahead],5),false);
  ahead.face='front'; ahead.removed=true; assert.equal(Core.isBlocked(a,[a,ahead],5),false);
});

test('an arrow beside or behind the head never blocks it (the old rigid rule wrongly did)', () => {
  const a={id:'a',face:'front',cells:[{x:0,y:1},{x:1,y:1},{x:1,y:2}]};
  const beside={id:'c',face:'front',cells:[{x:0,y:3},{x:0,y:4}]};   // only under the tail's lane
  assert.equal(Core.isRigidBlocked(a,[a,beside],5),true,'old rule rejects it');
  assert.equal(Core.isBlocked(a,[a,beside],5),false,'head ray is clear, so it must escape');
});

test('every level is solvable under the head-ray rule and has real depth', () => {
  const minDepth={Easy:3,Medium:5,Hard:7};
  for (let n=1;n<=15;n++) {
    const level=Core.generateLevel(n);
    assert.ok(level.depth>=minDepth[level.tier],`Level ${n} depth ${level.depth} is too shallow for ${level.tier}`);
    assert.equal(Core.dependencyDepth(level),level.depth);
    // Whatever the player can see as free must be accepted, at every step of play.
    while (level.arrows.some(a=>!a.removed)) {
      const visuallyFree=level.arrows.filter(a=>!a.removed && Core.headRay(a,level.size)
        .every(c=>!level.arrows.some(o=>o!==a&&!o.removed&&o.face===a.face&&o.cells.some(k=>k.x===c.x&&k.y===c.y))));
      const accepted=Core.availableArrows(level);
      assert.deepEqual(accepted.map(a=>a.id).sort(),visuallyFree.map(a=>a.id).sort(),`Level ${n}: visible exit disagrees with rule`);
      assert.ok(accepted.length,`Level ${n} got stuck`);
      accepted.forEach(a=>{a.removed=true;});
    }
  }
});

test('difficulty increases, level bounds are clamped',()=>{
  assert.equal(Core.getLevelConfig(1).tier,'Easy');
  assert.equal(Core.getLevelConfig(6).tier,'Medium');
  assert.equal(Core.getLevelConfig(11).tier,'Hard');
  assert.equal(Core.getLevelConfig(999).level,15);
  assert.equal(Core.getLevelConfig(-5).level,1);
});

test('escape animation starts with the exact bend geometry and leads with the head', () => {
  const arrow={id:'bend',face:'front',cells:[{x:0,y:1},{x:1,y:1},{x:1,y:2}]};
  const initial=Core.getEscapeShape(arrow,5);
  assert.deepEqual(initial.points,[{x:.5,y:1.5},{x:1.5,y:1.5},{x:1.5,y:2.5},{x:1.5,y:2.89}]);
  const moving=Core.getEscapeShape(arrow,5,.6);
  assert.deepEqual(moving.points[0],{x:1.1,y:1.5});
  assert.ok(moving.head.y > initial.head.y, 'head travels forward first');
  assert.ok(moving.points.some(p=>p.x===1.5 && p.y===1.5),'tail follows original bend');
  const last=Core.getEscapeShape(arrow,5,initial.totalTravel);
  assert.ok(last.points[0].y>5,'tail entirely clears top edge');
  assert.ok(last.head.y>last.points[0].y,'head stays in front');
});

test('escape stays finite and head-leading at all difficulties',()=>{
  for(let level=1;level<=15;level++){
    const puzzle=Core.generateLevel(level);
    for(const arrow of puzzle.arrows){
      const begin=Core.getEscapeShape(arrow,puzzle.size);
      for(const t of [0,.1,.25,.5,.75,1]){
        const motion=Core.getEscapeShape(arrow,puzzle.size,begin.totalTravel*t);
        for(const point of motion.points) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
        const tail=motion.points[0];
        const d=motion.direction;
        assert.ok((motion.head.x-tail.x)*d.x+(motion.head.y-tail.y)*d.y >= -.000001 || t<1);
      }
    }
  }
});
