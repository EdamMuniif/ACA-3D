const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Core=require('../core.js');

test('scoring rewards completed puzzles but never farms replayed points',()=>{
  const first=Core.calculateLevelScore({arrows:5,hearts:3,hints:0,tier:'Easy'});
  assert.equal(first,150);
  assert.equal(Core.MAX_HEARTS,5);
  assert.equal(Core.calculateLevelScore({arrows:5,hearts:5,hints:0,tier:'Easy'}),200);
  assert.equal(Core.calculateLevelScore({arrows:5,hearts:99,hints:0,tier:'Easy'}),200);
  assert.equal(Core.calculateLevelScore({arrows:5,hearts:3,hints:2,tier:'Easy'}),120);
  assert.equal(Core.calculateLevelScore({arrows:50,hearts:1,hints:4,tier:'Hard'}),615);
  assert.deepEqual(Core.getScoreAward(0,first),{best:150,awarded:150});
  assert.deepEqual(Core.getScoreAward(150,120),{best:150,awarded:0});
  assert.deepEqual(Core.getScoreAward(150,170),{best:170,awarded:20});
});

test('the game HTML defines all DOM references used by game.js',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const refs=new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]));
  for(const id of refs) assert.ok(ids.has(id),`Missing HTML element: ${id}`);
  for(const id of ['homeScreen','levelsScreen','playScreen','playerNameInput',
    'homePoints','hudPoints','resetBtn','levelSections','prevLevelPage','nextLevelPage','nearbyLevels'])
    assert.ok(ids.has(id));
});

function bootGame(save=null){
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  class Element {
    constructor(id=''){this.id=id;this.value='';this.textContent='';this.disabled=false;
      this.hidden=false;this.style={};this.children=[];this.handlers={};this.attrs={};
      const state=new Set();
      this.classList={add:k=>state.add(k),remove:k=>state.delete(k),
        toggle:(k,on)=>{if(on===undefined)on=!state.has(k);on?state.add(k):state.delete(k);return on},
        contains:k=>state.has(k)};
    }
    // Mirror the browser: setting markup also sets the text a screen reader or user sees.
    set innerHTML(html){this._html=html;this.textContent=String(html).replace(/<[^>]*>/g,'')}
    get innerHTML(){return this._html??''}
    addEventListener(type,fn){(this.handlers[type]??=[]).push(fn)}
    appendChild(x){this.children.push(x);return x}
    append(...xs){this.children.push(...xs)}
    replaceChildren(...xs){this.children=[...xs]}
    setAttribute(k,v){this.attrs[k]=v}
    getAttribute(k){return this.attrs[k]}
    focus(){document.activeElement=this}
    getBoundingClientRect(){return {width:520,height:550,left:0,top:0}}
    getContext(){return {setTransform(){}}}
    click(){if(this.disabled)return;for(const fn of this.handlers.click||[])fn()}
  }
  const elements=new Map(ids.map(id=>[id,new Element(id)]));
  const document={body:new Element('body'),activeElement:null,
    getElementById(id){assert.ok(elements.has(id),`Unknown DOM id ${id}`);return elements.get(id)},
    createElement(){return new Element()},
    createTextNode(txt){const e=new Element();e.textContent=txt;return e},
    addEventListener(){}};
  const state=new Map();
  if(save)state.set('arrow-cube-away-v1',JSON.stringify(save));
  const localStorage={getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,v)};
  const raf=[];
  const window={ArrowCubeCore:Core,scrollTo(){},addEventListener(){},
    matchMedia:()=>({matches:false}),devicePixelRatio:1};
  vm.runInNewContext(js,{window,document,localStorage,
    performance:{now:()=>100},
    requestAnimationFrame:fn=>raf.push(fn),
    setTimeout:()=>1,clearTimeout:()=>{},
    ResizeObserver:undefined,console});
  return {elements,localStorage,raf,document};
}
test('home, level select, play, name and restart function in the browser controller',()=>{
  const {elements,localStorage,raf}=bootGame();
  const el=id=>elements.get(id);
  assert.equal(el('homeScreen').hidden,false);
  assert.equal(el('playScreen').hidden,true);
  assert.ok(raf.length>0,'Animation loop must initialize');
  assert.equal(el('homePoints').textContent,'0');
  assert.equal(el('homeCompleted').textContent,'0 / 100');
  assert.equal(el('homeNextLevel').textContent,'01');
  assert.equal(el('homeProgressTrack').attrs['aria-valuenow'],'0');
  assert.equal(el('profileToggle').attrs['aria-expanded'],'false');
  assert.equal(el('rulesToggle').attrs['aria-expanded'],'false');
  assert.equal(el('profilePanel').hidden,true);
  assert.equal(el('rulesPanel').hidden,true);
  // Floating profile and help panels are mutually exclusive.
  el('profileToggle').click();
  assert.equal(el('profileToggle').attrs['aria-expanded'],'true');
  assert.equal(el('profilePanel').hidden,false);
  el('rulesToggle').click();
  assert.equal(el('profilePanel').hidden,true);
  assert.equal(el('rulesPanel').hidden,false);
  assert.equal(el('profileToggle').attrs['aria-expanded'],'false');
  el('rulesToggle').click();
  assert.equal(el('rulesPanel').hidden,true);
  el('profileToggle').click();
  assert.equal(el('homeNavBtn').attrs['aria-pressed'],'true');
    el('playerNameInput').value='Ada';
  el('saveNameBtn').click();
  assert.equal(JSON.parse(localStorage.getItem('arrow-cube-away-v1')).playerName,'Ada');
  assert.equal(el('heroPlayerName').textContent,'Ada');
  assert.equal(el('homePlayerGreeting').textContent,'Ada');
  el('pickLevelBtn').click();
  assert.equal(el('profilePanel').hidden,true);
  assert.equal(el('profileToggle').attrs['aria-expanded'],'false');
  assert.equal(el('levelsScreen').hidden,false);
  assert.equal(el('levelSections').children.length,3,'first page shows Easy, Medium and Hard');
  assert.equal(el('levelPageLabel').textContent,'Levels 01–20 of 100');
  const firstGrid=el('levelSections').children[0].children[1];
  assert.equal(firstGrid.children.length,5);
  assert.equal(firstGrid.children[0].disabled,false);
  assert.equal(firstGrid.children[1].disabled,true);
  el('nextLevelPage').click();
  assert.equal(el('levelPageLabel').textContent,'Levels 21–40 of 100');
  el('prevLevelPage').click();
  assert.equal(el('levelPageLabel').textContent,'Levels 01–20 of 100');
  el('levelSections').children[0].children[1].children[0].click();
  assert.equal(el('playScreen').hidden,false);
  assert.equal(el('homeScreen').hidden,true);
  assert.equal(el('hudPlayerName').textContent,'Ada');
  assert.ok(Number(el('remainingCount').textContent)>0);
  el('resetBtn').click();
  assert.equal(el('hearts').attrs['aria-label'],'5 hearts remaining');
  el('homeNavBtn').click();
  assert.equal(el('homeScreen').hidden,false);
});
test('legacy saves migrate without losing unlocked level progress',()=>{
  const {elements,localStorage}=bootGame({unlocked:4,lastLevel:3,completed:[1,2],sound:false});
  assert.equal(elements.get('homeCompleted').textContent,'2 / 100');
  assert.equal(elements.get('homeNextLevel').textContent,'04');
  assert.equal(elements.get('homePoints').textContent,'0');
  elements.get('playBtn').click();
  assert.equal(elements.get('levelTitle').textContent,'Level 03');
  assert.equal(elements.get('playScreen').hidden,false);
  assert.equal(JSON.parse(localStorage.getItem('arrow-cube-away-v1')).playerName,'Player');
});

test('completed legacy level 15 immediately unlocks level 16',()=>{
  const data={unlocked:15,lastLevel:15,completed:Array.from({length:15},(_,i)=>i+1),
    playerName:'Tester',bestScores:{'15':1700}};
  const {elements,localStorage}=bootGame(data);
  assert.equal(elements.get('homeNextLevel').textContent,'16');
  assert.equal(elements.get('homeCompleted').textContent,'15 / 100');
  assert.equal(elements.get('homePoints').textContent,'1,700');
  elements.get('playBtn').click();
  assert.equal(elements.get('levelTitle').textContent,'Level 16');
  assert.equal(JSON.parse(localStorage.getItem('arrow-cube-away-v1')).unlocked,16);
});

test('100-level map paginates and keeps future levels locked',()=>{
  const {elements}=bootGame({unlocked:52,lastLevel:52,completed:Array.from({length:51},(_,i)=>i+1)});
  elements.get('levelsNavBtn').click();
  assert.equal(elements.get('levelPageLabel').textContent,'Levels 41–60 of 100');
  const sections=elements.get('levelSections').children;
  assert.ok(sections.length>0);
  const tiles=sections.flatMap(section=>section.children[1].children);
  assert.equal(tiles.length,20);
  assert.equal(tiles[11].disabled,false,'52 is unlocked');
  assert.equal(tiles[12].disabled,true,'53 remains locked');
  for(let i=0;i<2;i++)elements.get('nextLevelPage').click();
  assert.equal(elements.get('levelPageLabel').textContent,'Levels 81–100 of 100');
  assert.equal(elements.get('nextLevelPage').disabled,true);
  assert.equal(elements.get('prevLevelPage').disabled,false);
});

test('mobile UX source keeps navigation touch-friendly and first-screen progress visible',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
  assert.doesNotMatch(html,/class="hero-summary"/,'duplicate hero progress must be removed');
  assert.doesNotMatch(html,/id="heroPoints"|id="heroWins"|id="heroCurrentLevel"/);
  for(const id of ['homePoints','homeCompleted','homeNextLevel']){
    assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,
      id+' should be displayed exactly once on Home');
  }
  assert.match(html,/class="home-top-tools"/);
  assert.match(html,/id="profileToggle" aria-label="Player profile"/);
  assert.match(html,/id="rulesToggle" aria-label="How it works"/);
  assert.match(css,/\.home-tool-button\s*\{[\s\S]*?border-radius:50%/);
  assert.match(css,/\.home-popover\s*\{[\s\S]*?position:absolute/);
  assert.match(css,/@media\s*\(max-width:700px\)/);
  assert.match(css,/\.header-controls\s*\{display:grid;width:100%;grid-template-columns:/);
  assert.match(css,/\.home-actions\s*\{display:grid;grid-template-columns:/);
  assert.match(css,/\.hero-visual\s*\{display:none\}/);
  assert.match(css,/\.game-actions \.game-button\s*\{display:flex;align-items:center;justify-content:center;min-width:0;min-height:48px/);
});
