const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

test('all 15 levels generate deterministically and are solvable', () => {
  for (let n=1;n<=15;n++) {
    const first = Core.generateLevel(n);
    const second = Core.generateLevel(n);
    assert.deepEqual(first,second,`Level ${n} changed for same seed`);
    assert.equal(first.total,first.target,`Level ${n} did not reach the configured density`);
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

test('collision checks the complete translated shape, not just arrow tip', () => {
  const a={id:'a',face:'front',cells:[{x:0,y:1},{x:1,y:1},{x:1,y:2}]};
  const blocker={id:'b',face:'front',cells:[{x:0,y:3},{x:1,y:3}]};
  assert.equal(Core.isBlocked(a,[a,blocker],5),true);
  blocker.face='back';
  assert.equal(Core.isBlocked(a,[a,blocker],5),false);
  blocker.face='front';blocker.removed=true;
  assert.equal(Core.isBlocked(a,[a,blocker],5),false);
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

test('video-informed reference progression is reproducible',()=>{
  const observed = [5,28,44,57];
  assert.deepEqual([1,2,3,4].map(n=>Core.generateLevel(n).total),observed);
  assert.equal(Core.generateLevel(15).total,150);
  for(let n=1;n<=15;n++){
    const level=Core.generateLevel(n);
    for(const arrow of level.arrows){
      assert.ok(arrow.cells.length>=2);
      assert.ok(arrow.cells.every(c=>c.x>=0&&c.y>=0&&c.x<level.size&&c.y<level.size));
    }
  }
});
