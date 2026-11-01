'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const Core=require('../core.js');
const script=fs.readFileSync(path.join(__dirname,'../tutorial.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');

function boot(save){
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  class Element{
    constructor(id){
      this.hidden=id==='tutorialOverlay';this.style={};this.textContent='';
      this.handlers={};const classes=new Set();
      this.classList={add:v=>classes.add(v),remove:v=>classes.delete(v)};
    }
    addEventListener(name,fn){(this.handlers[name]??=[]).push(fn);}
    click(){for(const fn of this.handlers.click||[])fn();}
    focus(){document.activeElement=this;}
    getBoundingClientRect(){return {left:0,top:0,width:390,height:250};}
    getContext(){return {setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},
      closePath(){},fill(){},stroke(){}};}
    setPointerCapture(){}
  }
  const elements=new Map(ids.map(id=>[id,new Element(id)]));
  const document={activeElement:null,body:new Element('body'),
    getElementById:id=>elements.get(id)};
  const raw=new Map();
  if(save)raw.set('arrow-cube-away-v1',JSON.stringify(save));
  const localStorage={getItem:key=>raw.get(key)??null,setItem:(key,value)=>raw.set(key,value)};
  const window={ArrowCubeCore:Core,devicePixelRatio:1};
  vm.runInNewContext(script,{window,document,localStorage,performance:{now:()=>100},
    requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},setTimeout:()=>{},
    console,Math});
  return {api:window.ACA3DTutorial,els:elements,storage:raw};
}
const get=(h,id)=>h.els.get(id);

test('tutorial practice arrows follow real blocker and head-first escape rules',()=>{
  const arrows=[
    {id:'tutorial-blocked',face:'front',cells:[{x:0,y:1},{x:1,y:1}]},
    {id:'tutorial-clear',face:'front',cells:[{x:2,y:0},{x:2,y:1}]}
  ];
  assert.equal(Core.getBlocker(arrows[0],arrows,4).id,arrows[1].id);
  assert.equal(Core.isBlocked(arrows[1],arrows,4),false);
  arrows[1].removed=true;
  assert.equal(Core.isBlocked(arrows[0],arrows,4),false);
  const motion=Core.getEscapeShape(arrows[0],4,.5);
  assert.ok(motion.head.x>motion.points[0].x);
});

test('fresh player completes four lessons before entering level 1, without score changes',()=>{
  const h=boot();let normalPlay=0;
  assert.equal(h.api.startIfFirstPlay(()=>{normalPlay++;}),true);
  assert.equal(get(h,'tutorialOverlay').hidden,false);
  const action=get(h,'tutorialActionBtn');
  assert.equal(h.api.getState().step,0);
  action.click();assert.equal(h.api.getState().step,1);
  action.click();assert.equal(h.api.getState().step,2);
  action.click();assert.equal(h.api.getState().step,3);
  action.click();assert.equal(h.api.getState().hintShown,true);
  action.click();assert.equal(h.api.getState().step,4);
  assert.equal(get(h,'tutorialSkipBtn').hidden,true);
  assert.equal(normalPlay,0);
  action.click();
  assert.equal(normalPlay,1);
  assert.equal(get(h,'tutorialOverlay').hidden,true);
  assert.equal(h.storage.get('arrow-cube-away-tutorial-v27'),'true');
  assert.equal(h.storage.has('arrow-cube-away-v1'),false);
});

test('skip starts normal game once, and replay never writes game progress',()=>{
  const h=boot();let start=0;
  assert.equal(h.api.startIfFirstPlay(()=>start++),true);
  get(h,'tutorialSkipBtn').click();
  assert.equal(start,1);
  assert.equal(h.api.startIfFirstPlay(()=>start++),false);
  h.api.openReplay();
  assert.equal(h.api.getState().replaying,true);
  get(h,'tutorialSkipBtn').click();
  assert.equal(start,1);
  assert.equal(h.storage.has('arrow-cube-away-v1'),false);
});

test('existing player saves never get an intrusive first-play tutorial',()=>{
  const h=boot({unlocked:60,lastLevel:60,completed:[1,2,3],points:400});
  const original=h.storage.get('arrow-cube-away-v1');
  assert.equal(h.api.startIfFirstPlay(()=>{throw Error('not allowed');}),false);
  assert.equal(get(h,'tutorialOverlay').hidden,true);
  h.api.openReplay();
  get(h,'tutorialSkipBtn').click();
  assert.equal(h.storage.get('arrow-cube-away-v1'),original);
});
