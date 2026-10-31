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
