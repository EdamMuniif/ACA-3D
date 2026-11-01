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
  assert.match(html,/home-preview\.js\?v=23/);
  assert.doesNotMatch(html,/<svg[^>]*class="hero-cube"/);
  assert.match(css,/body\.on-home \.app-shell\s*\{[\s\S]*?height:100dvh/);
  assert.match(css,/body\.on-home #homeScreen\s*\{[\s\S]*?grid-template-rows:auto minmax\(0,1fr\) auto/);
  assert.match(css,/body\.on-home \.page-footer\s*\{display:none\}/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:740px\)/);
  assert.match(css,/@media\(max-width:570px\)/);
  assert.match(css,/@media\(max-height:680px\) and \(max-width:740px\)/);
  assert.match(game,/document\.body\.classList\.toggle\('on-home',which==='home'\)/);
});

function bootPreview(reducedMotion=false){
  let paintCount=0,strokeCount=0,frame=null;
  const context={
    setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},
    fill(){paintCount++},stroke(){strokeCount++},save(){},restore(){},
    globalAlpha:1,lineWidth:1
  };
  const canvas={
    width:0,height:0,getBoundingClientRect(){return {width:340,height:260}},
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
    step(now){if(frame)frame(now)},get hasFrame(){return !!frame}};
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

test('reduced-motion mode renders a still cube and schedules no animation',()=>{
  const app=bootPreview(true);
  assert.ok(app.paintCount>10);
  assert.equal(app.hasFrame,false);
});

test('Home animation does not modify player save data or gameplay state',()=>{
  assert.doesNotMatch(script,/localStorage\./);
  assert.doesNotMatch(script,/window\.location|fetch\(/);
  assert.match(script,/Core\.generateLevel\(2\)/);
  assert.match(script,/Core\.getEscapeShape\(/);
  assert.match(script,/Core\.buildFlatArrowGeometry\(/);
  assert.match(script,/Core\.availableArrows\(board\)/);
});
