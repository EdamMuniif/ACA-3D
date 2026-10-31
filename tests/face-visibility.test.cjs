const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../core.js');

test('edge-on cube faces cannot draw thick arrow piles or capture ghost taps',()=>{
  for(const view of [-.24,-.12,-.015,0,.015,.12,.24]){
    const a=Core.faceArrowOpacity(view);
    assert.equal(a.front,0);
    assert.equal(a.ghost,0);
  }
  assert.deepEqual(Core.faceArrowOpacity(NaN),{front:0,ghost:0});
});

test('front and far-side arrows fade smoothly only when faces have visible area',()=>{
  let prev=0;
  for(let view=.24;view<=1;view+=.02){
    const o=Core.faceArrowOpacity(view);
    assert.ok(o.front>=prev-1e-9,`front opacity decreases at ${view}`);
    assert.equal(o.ghost,0);
    prev=o.front;
  }
  assert.equal(Core.faceArrowOpacity(1).front,1);
  assert.equal(Core.faceArrowOpacity(-1).ghost,.12);
  assert.equal(Core.faceArrowOpacity(-1).front,0);
  assert.equal(Core.faceArrowOpacity(.4).ghost,0);
  assert.equal(Core.faceArrowOpacity(-.4).front,0);
});

test('renderer skips edge-on faces in both visible and ghost drawing passes',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  assert.match(source,/const opacity=Core\.faceArrowOpacity\(view\)\.ghost;/);
  assert.match(source,/if \(opacity<\.015\) continue;/);
  assert.match(source,/ghostPoints\.push\(\.\.\.selectedPoints\.splice\(keep\)\)/);
  assert.match(source,/const opacity=Core\.faceArrowOpacity\(face\.view\)\.front;/);
  assert.match(source,/if \(opacity<\.06\) continue;/);
  assert.match(source,/context\.globalAlpha=opacity/);
});
