const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../core.js');
const TAU=Math.PI*2;

test('nearestAngle picks the equivalent angle closest to the current one',()=>{
  assert.ok(Math.abs(Core.nearestAngle(0,TAU*3+.2)-TAU*3)<1e-9);
  assert.ok(Math.abs(Core.nearestAngle(.43,-TAU*2+.1)-(.43-TAU*2))<1e-9);
  assert.equal(Core.nearestAngle(1,1),1);
});

test('turnDirection reverses once the cube is tipped past the pole',()=>{
  assert.equal(Core.turnDirection(0),1);
  assert.equal(Core.turnDirection(1.4),1);
  assert.equal(Core.turnDirection(Math.PI/2+.1),-1);
  assert.equal(Core.turnDirection(Math.PI),-1);
  assert.equal(Core.turnDirection(-Math.PI),-1);
  assert.equal(Core.turnDirection(TAU+.3),1);
});

test('the tilt is no longer clamped in the game',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
  assert.doesNotMatch(source,/Math\.max\(-1\.38/);
});
