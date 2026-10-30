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
