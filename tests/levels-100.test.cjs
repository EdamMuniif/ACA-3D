const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../core.js');

test('100-level catalogue has six escalating difficulty tiers and no missing stages',()=>{
  assert.equal(Core.LEVEL_COUNT,100);
  assert.deepEqual(Core.LEVEL_TIERS.map(t=>[t.name,t.start,t.end]),[
    ['Easy',1,5],['Medium',6,10],['Hard',11,30],
    ['Expert',31,60],['Master',61,85],['Legend',86,100]]);
  for(let n=1;n<=100;n++){
    const config=Core.getLevelConfig(n);
    assert.equal(config.level,n);
    assert.ok(config.target>=5);
    assert.ok(config.size>=5 && config.size<=18);
    assert.ok(config.faces>=2 && config.faces<=6);
    assert.ok(config.maxLength>=3 && config.maxLength<=10);
    assert.ok(Core.LEVEL_TIERS.some(t=>t.name===config.tier&&n>=t.start&&n<=t.end));
  }
});

test('advanced difficulty grows with arrow density and route complexity',()=>{
  let previous=Core.getLevelConfig(15);
  for(let n=16;n<=100;n++){
    const config=Core.getLevelConfig(n);
    assert.ok(config.target>previous.target,`level ${n} arrows must increase`);
    assert.ok(config.maxLength>=previous.maxLength,`level ${n} routes must not shorten`);
    assert.ok(config.size>=previous.size,`level ${n} grid must not shrink`);
    previous=config;
  }
  assert.ok(Core.getLevelConfig(100).target>=240);
  assert.ok(Core.getLevelConfig(100).maxLength>=10);
  const score=opts=>Core.calculateLevelScore({arrows:100,hearts:5,hints:0,...opts});
  assert.ok(score({tier:'Legend'})>score({tier:'Master'}));
  assert.ok(score({tier:'Master'})>score({tier:'Expert'}));
  assert.ok(score({tier:'Expert'})>score({tier:'Hard'}));
});

test('all new levels 16 to 100 generate full target counts with valid unique paths',()=>{
  for(let n=16;n<=100;n++){
    const board=Core.generateLevel(n);
    assert.equal(board.total,board.target,`level ${n} did not meet requested arrow count`);
    assert.equal(board.arrows.length,board.total);
    const occupied=new Set();
    for(const arrow of board.arrows){
      assert.ok(arrow.cells.length>=2,`level ${n} short arrow`);
      for(let j=0;j<arrow.cells.length;j++){
        const cell=arrow.cells[j];
        assert.ok(cell.x>=0 && cell.x<board.size && cell.y>=0 && cell.y<board.size);
        const key=`${arrow.face}:${cell.x},${cell.y}`;
        assert.ok(!occupied.has(key),`level ${n} cells overlap at ${key}`);
        occupied.add(key);
        if(j)assert.equal(Math.abs(cell.x-arrow.cells[j-1].x)+Math.abs(cell.y-arrow.cells[j-1].y),1,
          `level ${n} path not contiguous`);
      }
    }
  }
});

test('representative advanced levels are deterministic and solvable by reverse construction',()=>{
  for(const n of [16,25,40,60,80,100]){
    const first=Core.generateLevel(n),second=Core.generateLevel(n);
    assert.deepEqual(first,second,`level ${n} seed changed`);
    // The constructive generator guarantees this order; explicitly test
    // each extraction and avoid accepting circular blocker dependencies.
    for(const arrow of [...first.arrows].reverse()){
      assert.equal(Core.isBlocked(arrow,first.arrows,first.size),false,
        `level ${n} has an impossible dependency at ${arrow.id}`);
      arrow.removed=true;
    }
    assert.ok(first.arrows.every(a=>a.removed));
  }
});
