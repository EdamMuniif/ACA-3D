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
  assert.match(game,/Core\.arrowMetrics\(cellPitch\)\.width/);
  assert.match(html,/aria-label="5 hearts remaining"/);
  assert.match(html,/Five hearts per attempt/);
});

test('arrowheads remain visibly wider than thick shafts in any direction',()=>{
  const stroke=6;
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
  const bold=Core.buildArrowHead({x:50,y:50},{x:30,y:50},8);
  assert.ok(Math.hypot(bold.wing1.x-bold.wing2.x,bold.wing1.y-bold.wing2.y)>
    Math.hypot(thin.wing1.x-thin.wing2.x,thin.wing1.y-thin.wing2.y));
  assert.equal(Core.buildArrowHead({x:10,y:10},{x:10,y:10},12),null);
  assert.equal(Core.buildArrowHead({x:NaN,y:0},{x:1,y:0},12),null);
});
test('renderer paints thick 2D ink polygons on a 3D cube face',()=>{
  const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  assert.match(game,/Core\.buildFlatArrowGeometry\(shape\.points,shape\.direction,\.23\)/);
  assert.match(game,/function fillFacePolygon\(face,vertices\)/);
  assert.match(game,/pointOnFace\(face,vertices\[i\]\.x,vertices\[i\]\.y,1\.023\)/);
  assert.match(game,/for\(const quad of geometry\.quads\)fillFacePolygon\(face,quad\)/);
  assert.match(game,/for\(const disk of geometry\.discs\)fillFacePolygon\(face,disk\)/);
  assert.match(game,/fillFacePolygon\(face,geometry\.head\)/);
  assert.match(game,/Core\.pickProjectedArrow\(x,y,selectedPoints/);
  assert.match(game,/arrow,face:face\.id,points,depth:rotateVector\(face\.normal\)\[2\]/);
});

test('flat arrow body is thick and confined to the face plane, with a pointed 2D head',()=>{
  const points=[{x:.5,y:.5},{x:1.5,y:.5},{x:1.5,y:1.5},{x:1.5,y:1.89}];
  const geo=Core.buildFlatArrowGeometry(points,{x:0,y:1},.23);
  assert.ok(geo);
  assert.ok(geo.quads.length>=2,'winding arrow forms ribbon polygons');
  assert.equal(geo.bodyWidth,.23);
  assert.equal(geo.headWidth,.5);
  assert.equal(geo.head.length,3);
  assert.ok(Math.abs(geo.head[0].y-1.89)<1e-9,'tip stays at the real head');
  assert.equal(geo.discs.length,points.length,'rounded joints and tail are face polygons');
  for(const shape of [...geo.quads,...geo.discs,geo.head])
    for(const pt of shape){
      assert.ok(Number.isFinite(pt.x)&&Number.isFinite(pt.y),'finite face coordinates');
      assert.ok(!('z' in pt),'no extrusion / billboard geometry');
    }
  const normal=geo.quads[0];
  const width=Math.hypot(normal[0].x-normal[3].x,normal[0].y-normal[3].y);
  assert.ok(Math.abs(width-.23)<1e-9,'shaft has requested thick grid-space width');
  assert.ok(geo.headWidth<1,'arrowhead fits inside adjacent arrow lanes');
  assert.equal(Core.buildFlatArrowGeometry([{x:0,y:0}],{x:1,y:0}),null);
  assert.equal(Core.buildFlatArrowGeometry(points,{x:0,y:0}),null);
  assert.equal(Core.buildFlatArrowGeometry([{x:NaN,y:0},{x:1,y:1}],{x:1,y:0}),null);
});

test('full-body touch selection continues to hit bends and the flat head',()=>{
  const points=[{x:10,y:10},{x:40,y:10},{x:40,y:40},{x:40,y:40.39}];
  const geo=Core.buildFlatArrowGeometry(points,{x:0,y:1},.23);
  const arrow={id:'flat',face:'front',removed:false};
  const item={arrow,face:'front',points,depth:1,width:10,tip:geo.head[0],
    wing1:geo.head[1],wing2:geo.head[2]};
  for(const p of [{x:10,y:10},{x:25,y:10},{x:40,y:10},{x:40,y:22},{x:40,y:40.3}])
    assert.equal(Core.pickProjectedArrow(p.x,p.y,[item],8),arrow);
  assert.equal(Core.pickProjectedArrow(80,80,[item],8),null);
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
  // A resize clears the canvas, so the cached frame must be invalidated with it.
  assert.match(js,/function refreshSize\(\)[\s\S]*?lastFrameKey='';\s*\}/);
});

test('arrowheads never outgrow their grid cell, so lanes stay readable (sizes 5-14)',()=>{
  const stageWidth=336,stageHeight=520;
  const scale=Core.sceneScale(stageWidth,stageHeight);
  for(let size=5;size<=14;size++){
    const cellPitch=scale*2/size;
    const m=Core.arrowMetrics(cellPitch);
    assert.ok(m.headWidth<=cellPitch*.95,`size ${size}: head ${m.headWidth.toFixed(1)}px vs cell ${cellPitch.toFixed(1)}px`);
    assert.ok(m.width<m.headWidth,'shaft thinner than head');
  }
  assert.ok(Core.arrowMetrics(1000).width<=8,'shaft is capped on huge cells');
});

test('play-first screen: ghost far faces, glancing fade and tap-to-turn are wired',()=>{
  const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
  assert.match(game,/document\.body\.classList\.toggle\('playing',which==='play'\)/);
  assert.match(game,/ghostPoints\.push\(\.\.\.selectedPoints\.splice\(keep\)\)/,'ghost arrows are never releasable');
  assert.match(game,/pickProjectedArrow\(p\.x,p\.y,ghostPoints/);
  assert.match(game,/turnToFace\(ghost\.face\)/);
  assert.match(game,/globalAlpha \*= motion/,'escape fade must multiply the face fade');
  assert.match(css,/body\.playing \.stage\{/);
});

test('grazing-angle arrow geometry is not visible or selectable',()=>{
  // The recorded bug shows a compressed pile of arrowheads at cube edges.
  assert.equal(Core.faceArrowOpacity(0),0);
  assert.equal(Core.faceArrowOpacity(.015),0);
  assert.equal(Core.faceArrowOpacity(.20),0);
  assert.equal(Core.faceArrowOpacity(.28),0);
  assert.equal(Core.faceArrowOpacity(NaN),0);
  assert.equal(Core.faceArrowOpacity(-1),0);
  const subtle=Core.faceArrowOpacity(.35);
  const mid=Core.faceArrowOpacity(.5);
  assert.ok(subtle>0 && subtle<.15);
  assert.ok(mid>.5 && mid<1);
  assert.ok(subtle<mid);
  assert.equal(Core.faceArrowOpacity(.66),1);
  assert.equal(Core.faceArrowOpacity(.9),1);
});

test('renderer keeps face geometry but culls edge-on arrows and rear-edge ghosts',()=>{
  const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  assert.match(game,/drawFace\(face\);\s*const opacity=Core\.faceArrowOpacity\(face\.view\);\s*if \(opacity<=0\) continue;/);
  assert.match(game,/context\.globalAlpha \*= opacity/);
  assert.match(game,/if \(view>-\.85\) continue;/,'back faces are ghosted only if directly away');
  assert.match(game,/context\.globalAlpha=\.045/,'back-face ghosts cannot dominate the cube edges');
  assert.match(game,/faceNormals\(\)\.filter\(f=>Core\.faceArrowOpacity\(f\.view\)>\.2\)/,
    'hints should route to a face with actually visible arrows');
});

test('home uses two circular icon buttons with mutually exclusive popovers',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
  for(const id of ['profile','rules']){
    assert.match(html,new RegExp(`id="${id}Toggle"[^>]*aria-expanded="false"[^>]*aria-controls="${id}Panel"`));
    assert.match(html,new RegExp(`id="${id}Panel"[^>]*hidden`),`${id} panel starts closed`);
  }
  for(const id of ['playerNameInput','saveNameBtn','homePlayerGreeting','homePoints','homeCompleted','homeNextLevel'])
    assert.match(html,new RegExp(`id="${id}"`));
  assert.doesNotMatch(html,/class="hero-summary"/);
  assert.match(html,/class="home-tool-actions"/);
  assert.match(css,/\.home-tool-button\s*\{[^}]*border-radius:50%/s);
  assert.match(css,/\.home-popover\s*\{[^}]*position:absolute/s);
  assert.match(game,/function closeHomePanels\(\)/);
  assert.match(game,/function toggleHomePanel\(name\)/);
  assert.match(game,/closeHomePanels\(\);\s*if\(shouldOpen\)/);
});
