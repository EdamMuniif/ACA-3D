const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const Core=require('../core.js');

const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'../home-preview.js'),'utf8');
const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');

test('Home shows a responsive animated cube and no longer uses the static SVG',()=>{
  assert.match(html,/id="homePreviewCanvas"/);
  assert.match(html,/home-preview\.js\?v=27/);
  assert.doesNotMatch(html,/<svg[^>]*class="hero-cube"/);
  assert.match(css,/body\.on-home \.app-shell\s*\{[\s\S]*?height:100dvh/);
  assert.match(css,/body\.on-home #homeScreen\s*\{[\s\S]*?grid-template-rows:auto minmax\(0,1fr\) auto/);
  assert.match(css,/body\.on-home \.page-footer\s*\{display:none\}/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:740px\)/);
  assert.match(css,/@media\(max-width:570px\)/);
  assert.match(css,/@media\(max-height:680px\) and \(max-width:740px\)/);
  assert.match(game,/document\.body\.classList\.toggle\('on-home',which==='home'\)/);
  const hero=html.slice(html.indexOf('<section class="home-hero">'),
    html.indexOf('<section class="home-bottom"'));
  assert.ok(hero.indexOf('class="home-copy"')<hero.indexOf('class="hero-visual home-cube-stage"'));
  assert.ok(hero.indexOf('class="hero-visual home-cube-stage"')<
    hero.indexOf('class="home-hero-details"'));
  assert.doesNotMatch(hero,/home-cube-status|home-cube-label/,
    'the preview must be clean, as in the reference layout');
  const compactRules=css.slice(css.indexOf('/* V24 — reference-sized home preview'));
  assert.match(compactRules,/grid-template-columns:minmax\(0,\.95fr\) minmax\(0,1\.05fr\)/);
  assert.match(compactRules,/grid-column:2;grid-row:2;/);
  assert.match(compactRules,/max-width:198px;max-height:198px/);
  assert.match(compactRules,/max-width:177px;max-height:177px/);
  assert.match(compactRules,/grid-column:1\/-1;grid-row:3;/);
  assert.match(compactRules,/grid-template-rows:auto auto auto/);
});

function bootPreview(reducedMotion=false,rect={width:340,height:260}){
  let paintCount=0,strokeCount=0,frame=null;
  const drawnPoints=[];
  const capture=(x,y)=>drawnPoints.push({x,y});
  const context={
    setTransform(){},clearRect(){},beginPath(){},moveTo:capture,lineTo:capture,closePath(){},
    fill(){paintCount++},stroke(){strokeCount++},save(){},restore(){},
    globalAlpha:1,lineWidth:1
  };
  const canvas={
    width:0,height:0,getBoundingClientRect(){return rect},
    getContext(){return context}
  };
  const document={
    hidden:false,
    getElementById(id){
      if(id==='homePreviewCanvas')return canvas;
      if(id==='homeScreen')return {hidden:false};
      return null;
    },
    addEventListener(){}
  };
  const window={
    ArrowCubeCore:Core,devicePixelRatio:2,
    matchMedia(){return {matches:reducedMotion}},
    addEventListener(){}
  };
  vm.runInNewContext(script,{window,document,Math,
    ResizeObserver:undefined,
    requestAnimationFrame(fn){frame=fn;return 1}
  });
  return {canvas,get paintCount(){return paintCount},get strokeCount(){return strokeCount},
    step(now){if(frame)frame(now)},get hasFrame(){return !!frame},drawnPoints};
}
test('home preview renders real projected cube faces and flat path polygons',()=>{
  const app=bootPreview();
  assert.ok(app.paintCount>15,'initial frame paints cube faces and arrows');
  assert.ok(app.strokeCount>12,'face outlines and projected gridlines are drawn');
  assert.deepEqual([app.canvas.width,app.canvas.height],[680,520],
    'canvas uses limited high DPI rendering');
  for(let now=40;now<13000;now+=1450)app.step(now);
  assert.ok(app.paintCount>200,'cube continues drawing during arrow releases');
});

test('compact preview fully contains the cube at mobile and desktop sizes',()=>{
  for(const rect of [{width:160,height:170},{width:190,height:190},
    {width:270,height:270},{width:340,height:260}]){
    const app=bootPreview(true,rect);
    assert.ok(app.drawnPoints.length>50,'projected cube paths were drawn');
    for(const p of app.drawnPoints) {
      assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y),'finite projection');
      assert.ok(p.x>=-1 && p.x<=rect.width+1,
        `cube cropped horizontally for ${rect.width}x${rect.height}: ${p.x}`);
      assert.ok(p.y>=-1 && p.y<=rect.height+1,
        `cube cropped vertically for ${rect.width}x${rect.height}: ${p.y}`);
    }
  }
});

test('reduced-motion mode renders a still cube and schedules no animation',()=>{
  const app=bootPreview(true);
  assert.ok(app.paintCount>10);
  assert.equal(app.hasFrame,false);
});

test('Home animation does not modify player save data or gameplay state',()=>{
  assert.doesNotMatch(script,/\blocalStorage\s*\.\s*(?:getItem|setItem|removeItem|clear)\s*\(/);
  assert.doesNotMatch(script,/window\.location|fetch\(/);
  assert.match(script,/Core\.generateLevel\(2\)/);
  assert.match(script,/Core\.getEscapeShape\(/);
  assert.match(script,/Core\.buildFlatArrowGeometry\(/);
  assert.match(script,/Core\.availableArrows\(board\)/);
});
