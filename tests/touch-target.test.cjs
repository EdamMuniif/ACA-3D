const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../core.js');

function sampleArrow() {
  const arrow={id:'path',face:'front',removed:false};
  return {arrow,width:10,depth:1,
    points:[{x:10,y:10},{x:10,y:75},{x:75,y:75},{x:75,y:120}],
    tip:{x:75,y:120},wing1:{x:65,y:101},wing2:{x:85,y:101}};
}

test('the whole arrow body can be selected, including bends and tail',()=>{
  const item=sampleArrow();
  for(const [x,y] of [[10,10],[10,35],[10,75],[45,75],[75,75],[75,105],[75,119]]){
    assert.equal(Core.pickProjectedArrow(x,y,[item],8),item.arrow,`tap on body ${x},${y}`);
  }
});

test('arrowhead interior and both wings are tappable',()=>{
  const item=sampleArrow();
  for(const [x,y] of [[75,110],[68,102],[82,102]]){
    assert.equal(Core.pickProjectedArrow(x,y,[item],8),item.arrow);
  }
});

test('nearest projected arrow wins, not the first element in the list',()=>{
  const near=sampleArrow();near.arrow={id:'near',removed:false};
  const far={...near,arrow:{id:'far',removed:false},
    points:[{x:31,y:10},{x:31,y:75}],tip:null,wing1:null,wing2:null};
  assert.equal(Core.pickProjectedArrow(30,45,[near,far],8),far.arrow);
  assert.equal(Core.pickProjectedArrow(12,45,[far,near],8),near.arrow);
  assert.equal(Core.pickProjectedArrow(200,200,[near,far],8),null);
});

test('overlapping paths prefer visible front face and never select removed arrows',()=>{
  const front=sampleArrow();front.arrow={id:'front',removed:false};front.depth=1;
  const back={...front,arrow:{id:'back',removed:false},depth:.1};
  assert.equal(Core.pickProjectedArrow(10,35,[back,front],8),front.arrow);
  front.arrow.removed=true;
  assert.equal(Core.pickProjectedArrow(10,35,[back,front],8),back.arrow);
  assert.equal(Core.pickProjectedArrow(NaN,35,[back,front],8),null);
});

test('five-heart game and touch-friendly dense arrow rendering are wired',()=>{
  const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.match(game,/let hearts = Core\.MAX_HEARTS/);
  assert.match(game,/hearts = Core\.MAX_HEARTS; hintsUsed = 0/);
  assert.match(game,/length:Core\.MAX_HEARTS/);
  assert.match(game,/Core\.pickProjectedArrow/);
  assert.match(game,/startArrow:hitArrow/);
  assert.match(game,/press\.startArrow \|\| hitArrow/);
  assert.match(game,/Math\.min\(12,cellPitch\*\.46\)/);
  assert.match(html,/aria-label="5 hearts remaining"/);
  assert.match(html,/Five hearts per attempt/);
});

test('arrowheads remain visibly wider than thick shafts in any direction',()=>{
  const stroke=12;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1]]){
    const tip={x:120,y:120},behind={x:120-dx*30,y:120-dy*30};
    const head=Core.buildArrowHead(tip,behind,stroke);
    assert.ok(head,'geometry generated');
    const headLength=Math.hypot(tip.x-head.shaftEnd.x,tip.y-head.shaftEnd.y);
    const baseWidth=Math.hypot(head.wing1.x-head.wing2.x,head.wing1.y-head.wing2.y);
    assert.ok(headLength>=stroke*1.8,'head extends beyond round shaft cap');
    assert.ok(baseWidth>stroke*2.5,'triangular head is clearly wider than shaft');
    assert.ok(Math.hypot(head.wing1.x-head.shaftEnd.x,head.wing1.y-head.shaftEnd.y)>stroke,'visible shoulder');
    const inside={x:tip.x-(tip.x-head.shaftEnd.x)*.35,y:tip.y-(tip.y-head.shaftEnd.y)*.35};
    const item={arrow:{id:'arrow',removed:false},width:stroke,depth:1,points:[behind,head.shaftEnd],...head};
    assert.equal(Core.pickProjectedArrow(inside.x,inside.y,[item],5),item.arrow);
  }
});
test('arrowhead geometry scales from narrow to bold bodies, with safe invalid input',()=>{
  const thin=Core.buildArrowHead({x:50,y:50},{x:30,y:50},4.5);
  const bold=Core.buildArrowHead({x:50,y:50},{x:30,y:50},12);
  assert.ok(Math.hypot(bold.wing1.x-bold.wing2.x,bold.wing1.y-bold.wing2.y)>
    Math.hypot(thin.wing1.x-thin.wing2.x,thin.wing1.y-thin.wing2.y));
  assert.equal(Core.buildArrowHead({x:10,y:10},{x:10,y:10},12),null);
  assert.equal(Core.buildArrowHead({x:NaN,y:0},{x:1,y:0},12),null);
});
test('renderer draws shaft to triangle base rather than covering tip with a round cap',()=>{
  const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  assert.match(game,/Core\.buildArrowHead\(tip,behind,width\)/);
  assert.match(game,/shaftPoints\[shaftPoints\.length-1\]=shaftEnd/);
  assert.match(game,/drawSegment\(shaftPoints,color,width\)/);
  assert.match(game,/context\.lineTo\(wing1\.x,wing1\.y\)/);
  assert.match(game,/context\.lineTo\(wing2\.x,wing2\.y\)/);
  assert.match(game,/selectedPoints\.push\(\{arrow,points,depth:.*tip,wing1,wing2,width\}\)/);
});

test('several arrows may escape at once and a repeat tap on a blocked arrow is free',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const js=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  assert.doesNotMatch(js,/activeEscape/,'single-escape lock must not return');
  assert.match(js,/const escaping = new Set\(\)/);
  // The win modal waits until the last escaping arrow has left the cube.
  assert.match(js,/!escaping\.size && level\.arrows\.every\(a=>a\.removed\)\) finishLevel\(\)/);
  // A second tap while the arrow is still flashing red must not cost another heart.
  assert.match(js,/if \(blocker\) \{[^}]*?if \(\(arrow\.badUntil\|\|0\)>stamp\) return;\s*hearts--;/s);
});

test('rendering skips unchanged frames and avoids per-frame blur shadows',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const js=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  assert.match(js,/if \(!animating && frameKey===lastFrameKey\) return;/);
  assert.doesNotMatch(js,/shadowBlur/,'canvas shadowBlur is too slow on phones when repainted every frame');
});
