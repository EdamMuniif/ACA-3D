'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const Core=require('../core.js');

// Frozen hashes were captured from unmodified V24 production core.js,
// commit 26a76fa. They guarantee that V25 does NOT change any arrow path,
// face, level, construction order or difficulty configuration.
const V24_LAYOUT_HASHES=`c7563b64 9e2b7780 12f281d3 fd718ff7 b9340834 06001670 f0f2e5a6 826fed93 bbf244d7 4092a5d2 f961edcc 45377bb7 d71068bf 2457146a ced3e701 98143370 3971ee1f abc34003 99ef96ad 4c299f26 b6d525c9 fa06678b 91f0dd61 a8490b48 a0c777d5 32d6ebca e303ab31 c2f9cef7 bdfb5a55 ae67ff04 47e0d5f0 a8bb6675 56f3056d ba26189a 127cc432 f69ea51c a36cd1fe ace285d2 d32eb44f 6a723c4f c06acdbe df113edd 80d298e2 d3db2cb6 aabc0d5d 89de5214 6149113a a55b6b3b a0239f17 7f3430d0 cd351db7 92671512 6028ef1c be262731 62bcd6af 32e6513f 6dcf8fb7 2a8cc231 b325a3aa 83a71e6c 40ec2aff eaed5c2a fb2d6fa5 5703aece a9ad746b 2410413f 230167c2 781651e4 fb1ed7f8 3d07e348 bd1ca3b0 63fb9ae5 dc61a01a ddc2bbef 95e18d5e 7e276ac2 d5109e20 98b1e5a5 e1a81e4a 80a1db2e 85bf47fe 2e265d91 943e34fc 11c688da 2bad811c 27b5c89e d4ddd907 731c8890 3dbed87e 5338d440 a9b1c726 4c80d068 24785f46 8787be02 a5f616f5 cd041037 3138f080 c1840e4a 66036ad8 4676cb05`.trim().split(/\s+/);
function layoutHash(board){
  const data=JSON.stringify([board.level,board.tier,board.size,board.target,
    board.arrows.map(a=>[a.id,a.face,a.order,a.cells.map(c=>[c.x,c.y])])]);
  let h=0x811c9dc5;
  for(let i=0;i<data.length;i++)h=Math.imul(h^data.charCodeAt(i),0x01000193);
  return (h>>>0).toString(16).padStart(8,'0');
}

test('V25: every one of 100 original layouts is unchanged, valid and solvable',
  {timeout:240000},()=>{
    assert.equal(Core.LEVEL_COUNT,100);
    assert.equal(V24_LAYOUT_HASHES.length,100);
    const started=performance.now(),measurements=[];
    let peakHeap=0,peakRss=0,totalArrows=0;
    for(let level=1;level<=100;level++){
      const before=performance.now(),board=Core.generateLevel(level);
      const duration=performance.now()-before;
      measurements.push({level,ms:Math.round(duration)});
      assert.equal(board.level,level);
      assert.equal(board.total,board.target,`level ${level} count mismatch`);
      assert.equal(board.arrows.length,board.target);
      assert.equal(layoutHash(board),V24_LAYOUT_HASHES[level-1],
        `level ${level} changed from released V24 puzzle`);
      const ids=new Set(),occupied=new Set();
      for(const arrow of board.arrows){
        assert.ok(!ids.has(arrow.id),`level ${level} duplicate ID ${arrow.id}`);
        ids.add(arrow.id);
        assert.ok(arrow.cells.length>=2,`level ${level} invalid arrow length`);
        for(let i=0;i<arrow.cells.length;i++){
          const c=arrow.cells[i];
          assert.ok(Number.isInteger(c.x)&&Number.isInteger(c.y)&&
            c.x>=0&&c.x<board.size&&c.y>=0&&c.y<board.size,
            `level ${level} out-of-bounds cell`);
          const cellKey=`${arrow.face}:${c.x},${c.y}`;
          assert.ok(!occupied.has(cellKey),`level ${level} overlap ${cellKey}`);
          occupied.add(cellKey);
          if(i){
            const previous=arrow.cells[i-1];
            assert.equal(Math.abs(c.x-previous.x)+Math.abs(c.y-previous.y),1,
              `level ${level} disconnected path ${arrow.id}`);
          }
        }
      }
      // Reverse construction is a guaranteed legal solution. Verify actual
      // blocking rules at each move, not merely the declared construction order.
      for(const arrow of [...board.arrows].reverse()){
        assert.equal(Core.isBlocked(arrow,board.arrows,board.size),false,
          `level ${level}: blocked release ${arrow.id}`);
        arrow.removed=true;
      }
      assert.ok(board.arrows.every(a=>a.removed));
      totalArrows+=board.total;
      const memory=process.memoryUsage();
      peakHeap=Math.max(peakHeap,memory.heapUsed);
      peakRss=Math.max(peakRss,memory.rss);
    }
    const elapsed=performance.now()-started;
    const slowest=[...measurements].sort((a,b)=>b.ms-a.ms).slice(0,5);
    console.log('V25 100-level verification:',JSON.stringify({
      levels:100,totalArrows,elapsedMs:Math.round(elapsed),
      slowest,peakHeapBytes:peakHeap,peakRssBytes:peakRss
    }));
    // Loose catastrophic-resource guards, not a hardware-specific target.
    assert.ok(elapsed<240000,'100-level audit exceeded 240 s');
    assert.ok(peakHeap<536870912,'heap exceeded 512 MiB');
    assert.ok(peakRss<1073741824,'RSS exceeded 1 GiB');
  });
