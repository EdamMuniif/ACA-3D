/* Arrow Cube Away — zero-dependency 3D canvas renderer and game UI. */
(() => {
  'use strict';
  const Core = window.ArrowCubeCore;
  const $ = id => document.getElementById(id);
  const canvas = $('gameCanvas');
  const stage = $('stage');
  const context = canvas.getContext('2d', { alpha: true });
  const TAU = Math.PI * 2;
  const FACES = [
    { id:'front',  normal:[0,0,1],  u:[1,0,0],  v:[0,-1,0], tint:'#FBF8F1' },
    { id:'right',  normal:[1,0,0],  u:[0,0,-1], v:[0,-1,0], tint:'#F6F1E6' },
    { id:'top',    normal:[0,1,0],  u:[1,0,0],  v:[0,0,1],  tint:'#FDFBF6' },
    { id:'left',   normal:[-1,0,0], u:[0,0,1],  v:[0,-1,0], tint:'#F4EEE2' },
    { id:'back',   normal:[0,0,-1], u:[-1,0,0], v:[0,-1,0], tint:'#FBF8F1' },
    { id:'bottom', normal:[0,-1,0], u:[1,0,0],  v:[0,0,-1], tint:'#F4EEE2' }
  ];
  const COLORS = ['#C8452C','#2F6F9F','#1F7A6D','#B8861B','#7B4B94','#3F5E3A'];
  const INK = '#1B1D22', VERMILION = '#E5482D', AMBER = '#E0A030', VERDIGRIS = '#1F7A6D';
  let blockFeedback = null; // { arrowId, blockerId, cell, until } after a blocked tap
  const PERSIST_KEY = 'arrow-cube-away-v1';
  const base = { unlocked:1, lastLevel:1, completed:[], sound:true, colorful:false, playerName:'Player', bestScores:{}, points:0 };
  function loadSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PERSIST_KEY));
      if (!parsed || typeof parsed !== 'object') return { ...base };
      const completed = Array.isArray(parsed.completed) ? parsed.completed.filter(n => Number.isInteger(n) && n >= 1 && n <= Core.LEVEL_COUNT) : [];
      const oldUnlocked=Number(parsed.unlocked)||1;
      const savedLast=Number(parsed.lastLevel)||1;
      // Old saves capped progression at 15 even after clearing it.
      const migratedUnlocked=Math.max(oldUnlocked,1,...completed.map(n=>n+1));
      const migratedLast=savedLast===15 && completed.includes(15) &&
        oldUnlocked<=15 ? 16 : savedLast;
      const bestScores = {};
      if (parsed.bestScores && typeof parsed.bestScores === 'object' && !Array.isArray(parsed.bestScores)) {
        for(let n=1;n<=Core.LEVEL_COUNT;n++) {
          const value=Number(parsed.bestScores[n]);
          if(Number.isFinite(value) && value>0) bestScores[n]=Math.min(100000,Math.floor(value));
        }
      }
      const playerName=typeof parsed.playerName === 'string' ? parsed.playerName.trim().slice(0,24) : '';
      return {
        unlocked:Math.min(Core.LEVEL_COUNT,Math.max(1,migratedUnlocked)),
        lastLevel:Math.min(Core.LEVEL_COUNT,Math.max(1,migratedLast)),
        completed:[...new Set(completed)],
        sound:parsed.sound !== false,
        colorful:parsed.colorful === true,
        playerName:playerName || 'Player',
        bestScores,
        points:Object.values(bestScores).reduce((sum,n)=>sum+n,0)
      };
    } catch { return { ...base }; }
  }
  const progress = loadSave();
  function persist() { try { localStorage.setItem(PERSIST_KEY,JSON.stringify(progress)); } catch {} }
  let level = null;
  let currentLevel = 1;
  let hearts = Core.MAX_HEARTS;
  let yaw = -.66, pitch = .43;
  let desiredYaw = yaw;
  let desiredPitch = pitch;
  let lastEmptyTap = 0;
  // Upside down, the same finger motion must turn the cube the other way.
  const flip = () => Core.turnDirection(pitch);
  function recenterView() { desiredYaw = Core.nearestAngle(-.66,yaw); desiredPitch = Core.nearestAngle(.43,pitch); }
  let drag = null;
  let hoveredId = null;
  let hintedId = null, hintExpiry = 0;
  let selectedPoints = [];
  let ghostPoints = [];
  let modalOpen = false;
  let lastToastTimer = 0;
  let activeGeneration = 0;
  const escaping = new Set(); // arrows currently animating out; several may run at once
  let sceneWidth = 0, sceneHeight = 0, sceneScale = 0;
  let audioContext = null;
  let lastTime = 0, animateUntil = 0, lastFrameKey = '';
  let screenMode = 'home', hintsUsed = 0, lastScoreAward = 0, lastLevelScore = 0;
  const LEVEL_PAGE_SIZE = 20;
  let levelPage = 0;

  function playSound(kind) {
    if (!progress.sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioContext ||= new Audio();
      if (audioContext.state === 'suspended') audioContext.resume();
      const presets = kind === 'bad' ? [[195,0,.12,'triangle']] :
        kind === 'win' ? [[520,0,.1,'sine'],[659,.11,.1,'sine'],[784,.22,.22,'sine']] :
        kind === 'hint' ? [[500,0,.08,'sine'],[675,.09,.11,'sine']] :
        [[420,0,.055,'sine'],[650,.05,.11,'sine']];
      presets.forEach(([frequency,delay,duration,wave]) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = audioContext.currentTime + delay;
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency,start);
        gain.gain.setValueAtTime(.0001,start);
        gain.gain.exponentialRampToValueAtTime(.055,start+.01);
        gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(start); oscillator.stop(start+duration+.015);
      });
    } catch { /* Sound is optional. */ }
  }

  function setToast(message,type='info') {
    const toast = $('toast');
    toast.textContent = message;
    toast.className = 'stage-toast visible' + (type === 'info' ? '' : ' '+type);
    clearTimeout(lastToastTimer);
    lastToastTimer = setTimeout(() => toast.classList.remove('visible'),2100);
  }

  function updateProfileDisplays() {
    const name=progress.playerName;
    $('homePlayerGreeting').textContent=name;
    $('heroPlayerName').textContent=name;
    if(document.activeElement!==$('playerNameInput')) $('playerNameInput').value=name;
    $('homePoints').textContent=progress.points.toLocaleString();
    $('homeCompleted').textContent=progress.completed.length+' / '+Core.LEVEL_COUNT;
    $('homeNextLevel').textContent=String(progress.unlocked).padStart(2,'0');
    $('homeProgressFill').style.width=(progress.completed.length/Core.LEVEL_COUNT*100)+'%';
    $('homeProgressTrack').setAttribute('aria-valuenow',String(progress.completed.length));
    $('levelPlayerLabel').textContent=name;
    $('levelPointsLabel').textContent=progress.points.toLocaleString();
    $('levelUnlockedLabel').textContent=String(progress.unlocked);
    $('hudPlayerName').textContent=name;
    $('hudPoints').textContent=progress.points.toLocaleString();
    $('playBtnLabel').textContent=progress.completed.length ? 'Continue' : 'Play now';
  }
  function savePlayerName() {
    const input=$('playerNameInput');
    const name=input.value.trim().replace(/\s+/g,' ').slice(0,24);
    progress.playerName=name||'Player';
    input.value=progress.playerName;
    persist();
    updateProfileDisplays();
  }
  function closeHomePanels() {
    for(const name of ['profile','rules']){
      $(name+'Toggle').setAttribute('aria-expanded','false');
      $(name+'Panel').hidden=true;
    }
  }
  function toggleHomePanel(name) {
    const button=$(name+'Toggle');
    const shouldOpen=button.getAttribute('aria-expanded')!=='true';
    closeHomePanels();
    if(shouldOpen) {
      button.setAttribute('aria-expanded','true');
      $(name+'Panel').hidden=false;
      if(name==='profile')$('playerNameInput').focus();
    }
  }
  function showScreen(which) {
    if(!['home','levels','play'].includes(which)) return;
    screenMode=which;
    closeHomePanels();
    $('homeScreen').hidden=which!=='home';
    $('levelsScreen').hidden=which!=='levels';
    $('playScreen').hidden=which!=='play';
    $('homeNavBtn').classList.toggle('active',which==='home');
    $('levelsNavBtn').classList.toggle('active',which==='levels');
    $('homeNavBtn').setAttribute('aria-pressed',String(which==='home'));
    $('levelsNavBtn').setAttribute('aria-pressed',String(which==='levels'));
    hideModal();
    updateProfileDisplays();
    if(which==='levels') { levelPage=Math.floor((currentLevel-1)/LEVEL_PAGE_SIZE);renderLevels(); }
    document.body.classList.toggle('playing',which==='play');
    if(which==='play') { refreshSize(); requestAnimationFrame(refreshSize); }
    window.scrollTo(0,0);
  }

  function updateHUD() {
    $('levelTitle').innerHTML = `<em>Level</em> <span class="num">${String(currentLevel).padStart(2,'0')}</span>`;
    $('levelFraction').textContent = `${String(currentLevel).padStart(2,'0')} / ${Core.LEVEL_COUNT}`;
    $('difficultyTag').textContent = level.tier.toUpperCase();
    $('difficultyTag').className = 'difficulty-tag ' + level.tier.toLowerCase();
    $('hearts').innerHTML = Array.from({length:Core.MAX_HEARTS},(_,i) => `<span class="${i < hearts ? '' : 'lost'}" aria-hidden="true">♥</span>`).join('');
    $('hearts').setAttribute('aria-label',`${hearts} hearts remaining`);
    const remaining = level.arrows.filter(a => !a.removed).length;
    $('remainingCount').textContent = remaining;
    const percent = Math.round((level.total - remaining) / Math.max(1,level.total) * 100);
    $('progressFill').style.width = percent+'%';
    $('progressTrack').setAttribute('aria-valuenow',String(percent));
    $('statSolved').textContent = String(progress.completed.length).padStart(2,'0');
    updateProfileDisplays();
    $('stageNote').textContent = remaining === 0 ? 'ALL ARROWS CLEARED' : 'ROTATE · FOLLOW THE ARROWHEAD · FIND A CLEAR EXIT';
  }

  function levelButton(n,compact=false) {
    const unlocked=n<=progress.unlocked;
    const complete=progress.completed.includes(n);
    const selected=n===currentLevel;
    const best=Number(progress.bestScores[n]||0);
    const button=document.createElement('button');
    button.type='button';
    button.className=(compact?'level-tile':'level-hub-tile')+
      (complete?' completed':'')+(selected?' current':'')+(!unlocked?' locked':'');
    button.disabled=!unlocked;
    button.setAttribute('aria-label',`Level ${n}, ${!unlocked?'locked':complete?'completed':'available'}`);
    if(compact)button.textContent=String(n).padStart(2,'0');
    else {
      const num=document.createElement('span');num.className='tile-number';
      num.textContent=String(n).padStart(2,'0');
      const caption=document.createElement('span');caption.className='tile-caption';
      caption.textContent=!unlocked?'LOCKED':complete?`✓ BEST ${best.toLocaleString()}`:selected?'CONTINUE':'PLAY';
      button.append(num,caption);
    }
    if(unlocked)button.addEventListener('click',()=>{
      startLevel(n);
      showScreen('play');
    });
    return button;
  }
  function renderLevels() {
    const pages=Math.ceil(Core.LEVEL_COUNT/LEVEL_PAGE_SIZE);
    levelPage=Math.max(0,Math.min(pages-1,levelPage));
    const first=levelPage*LEVEL_PAGE_SIZE+1;
    const last=Math.min(Core.LEVEL_COUNT,first+LEVEL_PAGE_SIZE-1);
    $('levelPageLabel').textContent=`Levels ${String(first).padStart(2,'0')}–${last} of ${Core.LEVEL_COUNT}`;
    $('prevLevelPage').disabled=levelPage===0;
    $('nextLevelPage').disabled=levelPage===pages-1;
    const container=$('levelSections');
    container.replaceChildren();
    for(const tier of Core.LEVEL_TIERS){
      const from=Math.max(first,tier.start),to=Math.min(last,tier.end);
      if(from>to)continue;
      const section=document.createElement('section');section.className='level-hub-group';
      const heading=document.createElement('div');heading.className='level-group-heading';
      const dot=document.createElement('span');dot.className='level-group-dot '+tier.name.toLowerCase();
      const title=document.createElement('h2');title.textContent=tier.name;
      const range=document.createElement('p');range.textContent=`Levels ${from}–${to}`;
      heading.append(dot,title,range);
      const grid=document.createElement('div');grid.className='level-hub-grid';
      for(let n=from;n<=to;n++)grid.appendChild(levelButton(n));
      section.append(heading,grid);container.appendChild(section);
    }
    const nearby=$('nearbyLevels');
    nearby.replaceChildren();
    const aroundFirst=Math.max(1,Math.min(Core.LEVEL_COUNT-6,currentLevel-3));
    for(let n=aroundFirst;n<=Math.min(Core.LEVEL_COUNT,aroundFirst+6);n++)
      nearby.appendChild(levelButton(n,true));
  }

  function startLevel(index) {
    activeGeneration++;
    escaping.clear();
    currentLevel = Math.min(Core.LEVEL_COUNT,Math.max(1,index));
    progress.lastLevel = currentLevel;
    persist();
    level = Core.generateLevel(currentLevel);
    hearts = Core.MAX_HEARTS; hintsUsed = 0; lastScoreAward = 0; lastLevelScore = 0;
    hoveredId = null; hintedId = null; blockFeedback = null;
    yaw = -.66; pitch = .43; desiredYaw = yaw; desiredPitch = pitch;
    $('toast').classList.remove('visible');
    hideModal();
    updateHUD(); renderLevels();
    if(screenMode==='play') canvas.focus({ preventScroll:true });
  }

  function rotateVector(p) {
    const c = Math.cos(yaw), s = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    const x = p[0]*c + p[2]*s;
    const z = -p[0]*s + p[2]*c;
    return [x,p[1]*cx-z*sx,p[1]*sx+z*cx];
  }
  function pointOnFace(face,x,y,normalOffset=1) {
    const a = (x * 2 / level.size - 1), b = (y * 2 / level.size - 1);
    return [0,1,2].map(i => face.normal[i]*normalOffset + face.u[i]*a + face.v[i]*b);
  }
  function project(point) {
    const [x,y,z] = rotateVector(point);
    const scale = sceneScale * 5.6 / (5.6-z);
    return { x:sceneWidth*.5 + x*scale, y:sceneHeight*.46 - y*scale, z, scale };
  }
  function faceNormals() {
    return FACES.map(face => ({...face,view:rotateVector(face.normal)[2]}))
      .filter(face => face.view > .015)
      .sort((a,b) => a.view-b.view);
  }
  function drawSegment(points,style,width,alpha=1) {
    if (points.length < 2) return;
    context.save();context.globalAlpha *= alpha;
    context.beginPath();context.moveTo(points[0].x,points[0].y);
    // Round every bend so the body flows around corners instead of snapping.
    for (let i=1;i<points.length-1;i++) {
      const a=points[i-1],b=points[i],c=points[i+1];
      const l1=Math.hypot(a.x-b.x,a.y-b.y),l2=Math.hypot(c.x-b.x,c.y-b.y);
      if (l1<.01||l2<.01) { context.lineTo(b.x,b.y); continue; }
      // The arc touches each segment at r/tan(angle/2) from the corner. On faces seen
      // at a grazing angle a 90deg bend projects to a sharp angle, so cap r by that reach.
      const cos=((a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y))/(l1*l2);
      const tanHalf=Math.sqrt(Math.max(0,(1-cos)/(1+cos+1e-9)));
      const r=Math.min(11,Math.min(l1,l2)/2*tanHalf);
      if (r<.5) context.lineTo(b.x,b.y); else context.arcTo(b.x,b.y,c.x,c.y,r);
    }
    context.lineTo(points[points.length-1].x,points[points.length-1].y);
    context.lineCap = 'round'; context.lineJoin = 'round';
    context.strokeStyle=style;context.lineWidth=width;context.stroke();
    context.restore();
  }
  function drawFace(face) {
    const N = level.size;
    const corners = [[0,0],[N,0],[N,N],[0,N]].map(([x,y]) => project(pointOnFace(face,x,y,1.001)));
    context.beginPath();context.moveTo(corners[0].x,corners[0].y);
    corners.slice(1).forEach(p => context.lineTo(p.x,p.y));context.closePath();
    context.save();
    context.globalAlpha=.62;context.fillStyle=face.tint;context.fill();context.restore();
    context.lineWidth=1.6;
    context.strokeStyle='rgba(27,29,34,.78)';context.stroke();
    // Faint construction grid: helpful for understanding exact arrow clearance.
    for (let i=1;i<N;i++) {
      const off=.003;
      drawSegment([project(pointOnFace(face,i,0,1+off)),project(pointOnFace(face,i,N,1+off))],'#D8CFBB',.65,.55);
      drawSegment([project(pointOnFace(face,0,i,1+off)),project(pointOnFace(face,N,i,1+off))],'#D8CFBB',.65,.55);
    }
    // Subtle inset edge brings out the transparent-cube aesthetic.
    const inset=.06*N;
    const insetPoints=[[inset,inset],[N-inset,inset],[N-inset,N-inset],[inset,N-inset]].map(([x,y]) => project(pointOnFace(face,x,y,1.006)));
    context.beginPath();context.moveTo(insetPoints[0].x,insetPoints[0].y);
    insetPoints.slice(1).forEach(p=>context.lineTo(p.x,p.y));context.closePath();
    context.strokeStyle='rgba(216,207,187,.7)'; context.lineWidth=.9;context.stroke();
  }
  function drawCubeShadow() {
    const width = sceneScale*1.65;
    const centerY=sceneHeight*.516 + sceneScale*1.39;
    const gradient=context.createRadialGradient(sceneWidth*.5,centerY,8,sceneWidth*.5,centerY,width);
    gradient.addColorStop(0,'rgba(27,29,34,.14)');gradient.addColorStop(1,'rgba(27,29,34,0)');
    context.save();context.translate(sceneWidth*.5,centerY);context.scale(1,.24);context.translate(-sceneWidth*.5,-centerY);
    context.beginPath();context.arc(sceneWidth*.5,centerY,width,0,TAU);context.fillStyle=gradient;context.fill();context.restore();
  }
  // A ribbon is a filled polygon lying on the actual cube face. Both its
  // width and its triangular tip are measured in GRID units, so they share
  // the same perspective and foreshortening as the face itself.
  function fillFacePolygon(face,vertices) {
    if(!vertices || vertices.length<3)return;
    const start=project(pointOnFace(face,vertices[0].x,vertices[0].y,1.023));
    context.beginPath();
    context.moveTo(start.x,start.y);
    for(let i=1;i<vertices.length;i++){
      const p=project(pointOnFace(face,vertices[i].x,vertices[i].y,1.023));
      context.lineTo(p.x,p.y);
    }
    context.closePath();
    context.fill();
  }
  function paintFlatArrow(face,geometry,color,alpha=1) {
    context.save();
    context.globalAlpha*=alpha;
    context.fillStyle=color;
    for(const quad of geometry.quads)fillFacePolygon(face,quad);
    for(const disk of geometry.discs)fillFacePolygon(face,disk);
    fillFacePolygon(face,geometry.head);
    context.restore();
  }
  function drawArrow(arrow,face,time) {
    if (arrow.removed && !arrow.escape) return;
    const motion=arrow.escape;
    const fraction=motion?Math.max(0,Math.min(1,(time-motion.startedAt)/motion.duration)):0;
    if(motion && fraction>=1)return;
    const ramp=.1,cruise=1/(1-ramp/2);
    const eased=fraction<ramp?cruise*fraction*fraction/(2*ramp):cruise*(fraction-ramp/2);
    const shape=Core.getEscapeShape(arrow,level.size,motion?motion.distance*eased:0);
    const mesh=Core.buildFlatArrowGeometry(shape.points,shape.direction,.23);
    if(!mesh)return;
    const points=shape.points.map(p=>project(pointOnFace(face,p.x,p.y,1.023)));
    const [tip,wing1,wing2]=mesh.head.map(p=>project(pointOnFace(face,p.x,p.y,1.023)));
    const isHint=arrow.id===hintedId && time<hintExpiry && !arrow.removed;
    const isHover=arrow.id===hoveredId && !arrow.removed;
    const isBad=(arrow.badUntil||0)>time;
    const fb=blockFeedback && time<blockFeedback.until?blockFeedback:null;
    const color=motion?VERMILION:isBad?VERMILION:isHint?VERDIGRIS:
      progress.colorful?COLORS[FACES.indexOf(FACES.find(f=>f.id===face.id))]:INK;
    const cellPitch=sceneScale*2/level.size;
    // Touch tolerance remains generous even though the visible ink is
    // projected onto a flat plane rather than drawn as a fixed-pixel stroke.
    const width=Math.max(Core.arrowMetrics(cellPitch).width,cellPitch*.23);
    context.save();
    context.globalAlpha *= motion ? Math.min(1,(1-fraction)/.07) : 1;
    if(isHint || isHover || isBad) {
      const halo=Core.buildFlatArrowGeometry(shape.points,shape.direction,.32);
      paintFlatArrow(face,halo,isBad?'#F6C6BA':isHint?'#9CD3C6':'#EBD9A6',.65);
    }
    if(fb && arrow.id===fb.blockerId){
      const halo=Core.buildFlatArrowGeometry(shape.points,shape.direction,.32);
      paintFlatArrow(face,halo,AMBER,.5+.25*Math.sin(time*.016));
    }
    if(fb && arrow.id===fb.arrowId){
      const stop=project(pointOnFace(face,fb.cell.x+.5,fb.cell.y+.5,1.024));
      context.save();context.setLineDash([7,6]);
      drawSegment([tip,stop],VERMILION,Math.max(2.4,width*.45),.75+.25*Math.sin(time*.016));
      context.restore();
    }
    paintFlatArrow(face,mesh,color);
    if(isHint){
      context.beginPath();context.arc(tip.x,tip.y,12+2*Math.sin(time*.008),0,TAU);
      context.strokeStyle='rgba(31,122,109,.6)';context.lineWidth=2;context.stroke();
    }
    context.restore();
    if(!arrow.removed)selectedPoints.push({
      arrow,face:face.id,points,depth:rotateVector(face.normal)[2],
      tip,wing1,wing2,width
    });
  }

  function draw(time) {
    requestAnimationFrame(draw);
    if (screenMode!=='play' || !sceneWidth || !sceneHeight || !level) return;
    const elapsed = Math.min(40,time-lastTime || 16);
    lastTime=time;
    if (escaping.size) {
      for (const arrow of escaping) {
        if (time-arrow.escape.startedAt >= arrow.escape.duration) { arrow.escape = null; escaping.delete(arrow); }
      }
      // Win only once the last arrow has visibly left the cube.
      if (!escaping.size && level.arrows.every(a=>a.removed)) finishLevel();
    }
    if (!drag) {
      const difference=desiredYaw-yaw;
      if (Math.abs(difference)>.001) yaw += difference * Math.min(1,elapsed*.013);
      else yaw=desiredYaw;
      const tilt=desiredPitch-pitch;
      if (Math.abs(tilt)>.001) pitch += tilt * Math.min(1,elapsed*.013);
      else {
        pitch=desiredPitch;
        // Keep the angles small after many full turns.
        const turns=TAU*Math.round(pitch/TAU);
        pitch-=turns; desiredPitch-=turns;
      }
    }
    // Repaint only when something visible changed. Redrawing a static 150-arrow cube
    // every frame kept slow phones busy, so taps waited behind needless frames.
    const animating = escaping.size>0 || time<animateUntil || (hintedId!==null && time<hintExpiry);
    let remaining=0;
    for (const a of level.arrows) if (!a.removed) remaining++;
    const frameKey = [activeGeneration,yaw.toFixed(4),pitch.toFixed(4),sceneWidth,sceneHeight,
      hoveredId,remaining,progress.colorful,animating].join('|');
    if (!animating && frameKey===lastFrameKey) return;
    lastFrameKey = frameKey;
    context.clearRect(0,0,sceneWidth,sceneHeight);
    drawCubeShadow();
    selectedPoints=[];ghostPoints=[];
    // Far faces show through the glass as faint ghosts, so the player always knows
    // what is behind. They are not releasable; tapping one turns that face forward.
    for (const face of FACES) {
      const view=rotateVector(face.normal)[2];
      // Only retain extremely faint rear-face hints when fully back-facing.
      // Near the silhouette these project into one messy line of oversized
      // arrowheads, so never draw or pick rear arrows close to edge-on.
      if (view>-.85) continue;
      const keep=selectedPoints.length;
      context.save();context.globalAlpha=.045;
      for (const arrow of level.arrows) if (arrow.face===face.id && !arrow.removed) drawArrow(arrow,face,time);
      context.restore();
      ghostPoints.push(...selectedPoints.splice(keep));
    }
    for (const face of faceNormals()) {
      // Always render the cube's face and grid, even when its arrows are culled.
      drawFace(face);
      const opacity=Core.faceArrowOpacity(face.view);
      if (opacity<=0) continue;
      context.save();context.globalAlpha *= opacity;
      for (const arrow of level.arrows) if (arrow.face===face.id) drawArrow(arrow,face,time);
      context.restore();
    }
  }
  function refreshSize() {
    const rect=stage.getBoundingClientRect();
    const ratio=Math.min(window.devicePixelRatio||1,2);
    sceneWidth=rect.width;sceneHeight=rect.height;
    if (!sceneWidth || !sceneHeight) return;
    const w=Math.round(sceneWidth*ratio),h=Math.round(sceneHeight*ratio);
    if (canvas.width!==w||canvas.height!==h) {canvas.width=w;canvas.height=h;}
    context.setTransform(ratio,0,0,ratio,0,0);
    sceneScale=Core.sceneScale(sceneWidth,sceneHeight);
    // Resizing clears the canvas, including a DPR-only change that keeps the CSS size.
    lastFrameKey='';
  }
  function hitArrow(x,y,pointerType='touch') {
    // All projected body segments and the full arrowhead are interactive.
    // Stay close to the visible stroke to avoid stealing neighboring taps.
    return Core.pickProjectedArrow(x,y,selectedPoints,pointerType==='mouse'?4:8);
  }
  function canvasCoords(event) {
    const rect=canvas.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  }
  canvas.addEventListener('pointerdown',event=>{
    if (modalOpen || !level) return;
    if (event.button!==0 && event.pointerType==='mouse') return;
    const p=canvasCoords(event);
    drag={x:p.x,y:p.y,lastX:p.x,lastY:p.y,moved:false,
      startArrow:hitArrow(p.x,p.y,event.pointerType),pointerType:event.pointerType};
    desiredYaw=yaw;desiredPitch=pitch;hoveredId=null;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if (modalOpen) return;
    const p=canvasCoords(event);
    if (drag) {
      const dx=p.x-drag.lastX,dy=p.y-drag.lastY;
      if (Math.hypot(p.x-drag.x,p.y-drag.y)>(drag.pointerType==='mouse'?6:12)) drag.moved=true;
      if (drag.moved) {
        yaw+=dx*.009*flip();desiredYaw=yaw;
        pitch+=dy*.008;desiredPitch=pitch;
        canvas.classList.add('dragging');
      }
      drag.lastX=p.x;drag.lastY=p.y;
    } else {
      hoveredId=hitArrow(p.x,p.y,event.pointerType)?.id||null;
      canvas.style.cursor=hoveredId?'pointer':'grab';
    }
  });
  canvas.addEventListener('pointerup',event=>{
    if (!drag) return;
    const wasDrag=drag.moved;
    const press=drag;
    drag=null;
    canvas.classList.remove('dragging');
    if (!wasDrag && !modalOpen) {
      const p=canvasCoords(event);
      // Use the closest segment on release, or the original touched segment
      // if the player's finger drifted slightly without rotating the cube.
      const arrow=press.startArrow || hitArrow(p.x,p.y,event.pointerType);
      const ghost=arrow?null:Core.pickProjectedArrow(p.x,p.y,ghostPoints,10);
      if (arrow) attemptRelease(arrow);
      else if (ghost) { turnToFace(ghost.face); setToast('Turning to the far side.'); }
      else {
        const now=performance.now();
        if (now-lastEmptyTap<340) { recenterView(); lastEmptyTap=0; setToast('View reset.'); }
        else { lastEmptyTap=now; setToast('Tap anywhere on a visible arrow to release it.'); }
      }
    }
  });
  canvas.addEventListener('pointercancel',()=>{drag=null;canvas.classList.remove('dragging');});
  canvas.addEventListener('pointerleave',()=>{if(!drag)hoveredId=null;});
  canvas.addEventListener('keydown',event=>{
    if (modalOpen) return;
    if (event.key==='ArrowLeft'||event.key==='ArrowRight') {
      event.preventDefault();desiredYaw+=(event.key==='ArrowLeft'?.4:-.4)*flip();
    } else if (event.key==='ArrowUp'||event.key==='ArrowDown') {
      event.preventDefault();desiredPitch+=(event.key==='ArrowUp'?.24:-.24);
    } else if (event.key==='h'||event.key==='H') { event.preventDefault();showHint(); }
  });
  function attemptRelease(arrow) {
    // Arrows are marked removed the moment they are released, so several can
    // glide out together without affecting what blocks what.
    if (arrow.removed || hearts<=0) return;
    const stamp=performance.now();
    const blocker=Core.getBlocker(arrow,level.arrows,level.size);
    if (blocker) {
      // A second tap on an arrow that is still flashing red and still blocked is the
      // same mistake, not a new one. Once the blocker is gone the tap is a real release.
      if ((arrow.badUntil||0)>stamp) return;
      hearts--;
      arrow.badUntil=stamp+680;
      blockFeedback={arrowId:arrow.id,blockerId:blocker.id,cell:blocker.cell,until:stamp+1700};
      animateUntil=stamp+1750;
      playSound('bad');
      updateHUD();
      if (hearts===0) {
        setToast('No hearts left. Try again.','warning');
        const generation=activeGeneration;
        setTimeout(()=>{if(generation===activeGeneration && screenMode==='play') showLossModal();},550);
      } else setToast('Blocked — the amber arrow is in the way.','warning');
      return;
    }
    const shape=Core.getEscapeShape(arrow,level.size);
    arrow.removed=true;
    const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    arrow.escape={startedAt:stamp,distance:shape.totalTravel,
      duration:reducedMotion ? 200 : Math.min(950,Math.max(560,360+shape.totalTravel*55))};
    escaping.add(arrow);
    hintedId=null;hoveredId=null;blockFeedback=null;
    playSound('good');
    updateHUD();
  }
  function finishLevel() {
    lastLevelScore=Core.calculateLevelScore({arrows:level.total,hearts,tier:level.tier,hints:hintsUsed});
    const outcome=Core.getScoreAward(progress.bestScores[currentLevel]||0,lastLevelScore);
    lastScoreAward=outcome.awarded;
    progress.bestScores[currentLevel]=outcome.best;
    progress.points=Object.values(progress.bestScores).reduce((sum,n)=>sum+n,0);
    if (!progress.completed.includes(currentLevel)) progress.completed.push(currentLevel);
    progress.unlocked=Math.min(Core.LEVEL_COUNT,Math.max(progress.unlocked,currentLevel+1));
    progress.lastLevel=Math.min(Core.LEVEL_COUNT,currentLevel+1);
    persist();updateHUD();renderLevels();
    showWinModal();
  }
  // Yaw/pitch that bring each face to the front, used by hints and by tapping a ghost arrow.
  const FACE_GOALS = {
    front:[0,.28],right:[-Math.PI/2,.28],back:[Math.PI,.28],
    left:[Math.PI/2,.28],top:[0,1.20],bottom:[0,-1.20]
  };
  function turnToFace(faceId) {
    const goal = FACE_GOALS[faceId];
    if (!goal) return;
    desiredYaw=goal[0]+TAU*Math.round((yaw-goal[0])/TAU);
    desiredPitch=Core.nearestAngle(goal[1],pitch);
  }
  function showHint() {
    if (modalOpen || !level) return;
    const options=Core.availableArrows(level);
    if (!options.length) return;
    const visibles=faceNormals().filter(f=>Core.faceArrowOpacity(f.view)>.2).map(f=>f.id);
    let picked=options.find(a=>visibles.includes(a.face));
    if (!picked) {
      // Align the nearest face with the camera, so the hint is actually visible.
      picked=options[0];
      const goal = FACE_GOALS[picked.face];
      // Choose the nearest equivalent full rotation, then face the target.
      turnToFace(picked.face);
      setToast('Rotating to reveal a free arrow.','success');
    } else setToast('Highlighted arrow has a clear exit!','success');
    hintsUsed++;
    hintedId=picked.id;
    hintExpiry=performance.now()+5200;
    playSound('hint');
  }

  function hideModal() {
    modalOpen=false;
    $('modal').classList.add('hidden');
    $('modalExtra').innerHTML='';
  }
  function openModal({icon,eyebrow,title,message,stats='',buttons=[]}) {
    modalOpen=true;
    $('modalIcon').textContent=icon;
    $('modalEyebrow').textContent=eyebrow;
    $('modalTitle').textContent=title;
    $('modalMessage').textContent=message;
    $('modalMessage').style.display=message?'':'none';
    $('modalStats').innerHTML=stats;
    $('modalStats').style.display=stats?'flex':'none';
    const wrap=$('modalButtons');wrap.innerHTML='';
    for (const item of buttons) {
      const btn=document.createElement('button');btn.textContent=item.text;
      if (item.primary) btn.className='primary';
      btn.addEventListener('click',item.action);wrap.appendChild(btn);
    }
    $('modal').classList.remove('hidden');
    $('modalClose').focus({preventScroll:true});
  }
  function showWinModal() {
    playSound('win');
    const final=currentLevel===Core.LEVEL_COUNT;
    openModal({ icon:'✦',eyebrow:final?'ALL CHALLENGES COMPLETE':'PUZZLE COMPLETE',
      title:final?'Cube master!':'Level cleared!',
      message:final?'Every level completed! Replay to beat your best scores.':'Every arrow escaped. Your score is saved on this device.',
      stats:`<span>✦ +${lastScoreAward} POINTS</span><span>★ ${lastLevelScore} THIS RUN</span><span>♥ ${hearts} HEARTS</span>`,
      buttons:[{text:'Levels',action:()=>showScreen('levels')},
        {text:final?'Home':'Next level →',primary:true,action:()=>final?showScreen('home'):startLevel(currentLevel+1)}]
    });
  }
  function showLossModal() {
    openModal({icon:'↺',eyebrow:'GIVE IT ANOTHER GO',title:'Out of hearts',
      message:`Blocked arrows cost one heart. You have ${Core.MAX_HEARTS} hearts per attempt. Look for a clear lane or use a hint.`,
      buttons:[{text:'Home',action:()=>showScreen('home')},{text:'Try again',primary:true,action:()=>startLevel(currentLevel)}]});
  }
  function toggleSound() { progress.sound=!progress.sound;persist();document.body.classList.toggle('muted',!progress.sound);$('soundBtn').setAttribute('aria-label',progress.sound?'Mute sounds':'Unmute sounds'); }
  function addSettingsRow(container,title,subtitle,value,onChange) {
    const row=document.createElement('div');row.className='setting-row';
    const label=document.createElement('div');
    const strong=document.createElement('strong');strong.textContent=title;
    const small=document.createElement('small');small.textContent=subtitle;
    label.append(strong,small);
    const btn=document.createElement('button');btn.className='toggle'+(value?' on':'');
    btn.setAttribute('role','switch');btn.setAttribute('aria-checked',String(value));btn.setAttribute('aria-label',title);
    btn.appendChild(document.createElement('span'));
    btn.addEventListener('click',()=>{
      const next=btn.getAttribute('aria-checked')!=='true';
      btn.setAttribute('aria-checked',String(next));btn.classList.toggle('on',next);
      onChange(next);
    });
    row.append(label,btn);container.appendChild(row);
  }
  function openSettings() {
    openModal({icon:'⚙',eyebrow:'MAKE IT YOURS',title:'Game settings',message:'Customize the puzzle and learn the rules.',
      buttons:[{text:'How to play',action:openHelp},{text:'Back to game',primary:true,action:hideModal}]});
    const box=$('modalExtra');
    addSettingsRow(box,'Sound effects','Gentle success and blocked-move sounds',progress.sound,()=>toggleSound());
    addSettingsRow(box,'Colorful mode','Use distinct colors for each cube side',progress.colorful,v=>{progress.colorful=v;persist();});
    const reset=document.createElement('button');
    reset.className='setting-danger';
    reset.type='button';
    reset.textContent='Reset all progress and points';
    reset.addEventListener('click',confirmResetProgress);
    box.appendChild(reset);
  }
  function confirmResetProgress() {
    openModal({icon:'↺',eyebrow:'RESET GAME PROGRESS',title:'Start a new game?',
      message:'This permanently resets unlocked levels, completed levels and points on this device. Your player name and settings are kept.',
      buttons:[{text:'Keep progress',primary:true,action:openSettings},{text:'Reset game',action:()=>{
        progress.unlocked=1;progress.lastLevel=1;progress.completed=[];progress.bestScores={};progress.points=0;
        persist();startLevel(1);showScreen('home');
      }}]});
  }
  function openHelp() {
    openModal({icon:'↗',eyebrow:'FOUR SIMPLE RULES',title:'How to play',message:'',
      buttons:[{text:'Settings',action:openSettings},{text:'Start playing',primary:true,action:hideModal}]});
    const help=$('modalExtra');
    for (const [title,description] of [
      ['01 · Rotate','Drag in any direction to turn the cube all the way round, top and bottom included. Double-tap empty space to reset the view. The Left / Right buttons turn it a quarter at a time.'],
      ['02 · Check the exit','Each arrow follows its own bends head-first, with the tail following behind. It exits straight beyond its arrowhead. The cells ahead of that head must be clear.'],
      ['03 · Release',`Tap anywhere along a visible arrow body or arrowhead. A blocked move loses one of your ${Core.MAX_HEARTS} hearts. Hints are available.`],
      ['04 · Complete','Clear the cube to unlock the next level and score points. More arrows, higher difficulty, and remaining hearts increase score. Each hint deducts 15 points. Replaying only adds improvements over your best score.']
    ]) {const p=document.createElement('p');p.className='help-copy';const strong=document.createElement('strong');strong.textContent=title+' — ';p.append(strong,document.createTextNode(description));help.appendChild(p);}
  }

  $('homeNavBtn').addEventListener('click',()=>showScreen('home'));
  $('levelsNavBtn').addEventListener('click',()=>showScreen('levels'));
  $('levelBackBtn').addEventListener('click',()=>showScreen('home'));
  $('prevLevelPage').addEventListener('click',()=>{levelPage--;renderLevels();});
  $('nextLevelPage').addEventListener('click',()=>{levelPage++;renderLevels();});
  $('allLevelsBtn').addEventListener('click',()=>showScreen('levels'));
  $('pickLevelBtn').addEventListener('click',()=>{savePlayerName();showScreen('levels');});
  $('playBtn').addEventListener('click',()=>{savePlayerName();startLevel(Math.min(progress.unlocked,progress.lastLevel));showScreen('play');});
  $('saveNameBtn').addEventListener('click',savePlayerName);
  // Two compact top-right actions open one accessible home popover at a time.
  for(const name of ['profile','rules']) {
    $(name+'Toggle').addEventListener('click',()=>toggleHomePanel(name));
  }
  document.addEventListener('pointerdown',event=>{
    if(screenMode==='home' && !event.target.closest?.('.home-tool-actions')) closeHomePanels();
  });
  $('playerNameInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();savePlayerName();$('playBtn').focus();}});
  $('playerNameInput').addEventListener('change',savePlayerName);
  $('rotateLeftBtn').addEventListener('click',()=>desiredYaw+=Math.PI/2*flip());
  $('rotateRightBtn').addEventListener('click',()=>desiredYaw-=Math.PI/2*flip());
  $('resetBtn').addEventListener('click',()=>{startLevel(currentLevel);setToast('Level restarted.');});
  $('hintBtn').addEventListener('click',showHint);
  $('soundBtn').addEventListener('click',toggleSound);
  $('settingsBtn').addEventListener('click',openSettings);
  $('modalClose').addEventListener('click',hideModal);
  $('modal').addEventListener('pointerdown',e=>{if(e.target===$('modal'))hideModal();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && modalOpen)hideModal();
    else if(e.key==='Escape' && screenMode==='home'){
      const openName=['profile','rules'].find(name=>$(name+'Toggle').getAttribute('aria-expanded')==='true');
      if(openName){closeHomePanels();$(openName+'Toggle').focus();}
    }
  });
  document.body.classList.toggle('muted',!progress.sound);
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refreshSize) : null;
  if(resizeObserver)resizeObserver.observe(stage);
  window.addEventListener('resize',refreshSize);
  startLevel(Math.min(progress.unlocked,progress.lastLevel));
  showScreen('home');
  requestAnimationFrame(draw);
})();
