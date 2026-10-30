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
    { id:'front',  normal:[0,0,1],  u:[1,0,0],  v:[0,-1,0], tint:'#ffffff' },
    { id:'right',  normal:[1,0,0],  u:[0,0,-1], v:[0,-1,0], tint:'#f5faff' },
    { id:'top',    normal:[0,1,0],  u:[1,0,0],  v:[0,0,1],  tint:'#ffffff' },
    { id:'left',   normal:[-1,0,0], u:[0,0,1],  v:[0,-1,0], tint:'#f4f9ff' },
    { id:'back',   normal:[0,0,-1], u:[-1,0,0], v:[0,-1,0], tint:'#ffffff' },
    { id:'bottom', normal:[0,-1,0], u:[1,0,0],  v:[0,0,-1], tint:'#f5faff' }
  ];
  const COLORS = ['#0d658c','#6d54d8','#008f88','#d5842b','#a14f9e','#2076cb'];
  const PERSIST_KEY = 'arrow-cube-away-v1';
  const base = { unlocked:1, lastLevel:1, completed:[], sound:true, colorful:false };
  function loadSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PERSIST_KEY));
      if (!parsed || typeof parsed !== 'object') return { ...base };
      const completed = Array.isArray(parsed.completed) ? parsed.completed.filter(n => Number.isInteger(n) && n >= 1 && n <= 15) : [];
      return {
        unlocked:Math.min(15,Math.max(1,Number(parsed.unlocked) || 1)),
        lastLevel:Math.min(15,Math.max(1,Number(parsed.lastLevel) || 1)),
        completed:[...new Set(completed)],
        sound:parsed.sound !== false,
        colorful:parsed.colorful === true
      };
    } catch { return { ...base }; }
  }
  const progress = loadSave();
  function persist() { try { localStorage.setItem(PERSIST_KEY,JSON.stringify(progress)); } catch {} }
  let level = null;
  let currentLevel = 1;
  let hearts = 3;
  let yaw = -.66, pitch = .43;
  let desiredYaw = yaw;
  let drag = null;
  let hoveredId = null;
  let hintedId = null, hintExpiry = 0;
  let selectedPoints = [];
  let modalOpen = false;
  let lastToastTimer = 0;
  let activeGeneration = 0;
  let activeEscape = null;
  let sceneWidth = 0, sceneHeight = 0, sceneScale = 0;
  let audioContext = null;
  let lastTime = 0;

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

  function updateHUD() {
    $('levelTitle').textContent = `Level ${String(currentLevel).padStart(2,'0')}`;
    $('levelFraction').textContent = `${String(currentLevel).padStart(2,'0')} / 15`;
    $('difficultyTag').textContent = level.tier.toUpperCase();
    $('difficultyTag').className = 'difficulty-tag ' + level.tier.toLowerCase();
    $('hearts').innerHTML = Array.from({length:3},(_,i) => `<span class="${i < hearts ? '' : 'lost'}" aria-hidden="true">♥</span>`).join('');
    $('hearts').setAttribute('aria-label',`${hearts} hearts remaining`);
    const remaining = level.arrows.filter(a => !a.removed).length;
    $('remainingCount').textContent = remaining;
    const percent = Math.round((level.total - remaining) / Math.max(1,level.total) * 100);
    $('progressFill').style.width = percent+'%';
    $('progressTrack').setAttribute('aria-valuenow',String(percent));
    $('statSolved').textContent = String(progress.completed.length).padStart(2,'0');
    $('stageNote').textContent = remaining === 0 ? 'ALL ARROWS CLEARED' : 'DRAG TO ROTATE · TAP AN ARROW TO ESCAPE';
  }

  function renderLevels() {
    for (const [container,start] of [['easyLevels',1],['mediumLevels',6],['hardLevels',11]]) {
      $(container).innerHTML = '';
      for (let index=start;index<start+5;index++) {
        const btn = document.createElement('button');
        btn.className = 'level-tile';
        btn.textContent = index < 10 ? '0'+index : String(index);
        const unlocked = index <= progress.unlocked;
        const complete = progress.completed.includes(index);
        if (complete) btn.classList.add('completed');
        if (index === currentLevel) btn.classList.add('current');
        if (!unlocked) { btn.classList.add('locked'); btn.disabled = true; btn.setAttribute('aria-label',`Level ${index}, locked`); }
        else btn.setAttribute('aria-label',`Level ${index}${complete?', completed':''}`);
        if (complete && index !== currentLevel) btn.title = 'Completed';
        if (unlocked) btn.addEventListener('click',() => { hideModal();startLevel(index); });
        $(container).appendChild(btn);
      }
    }
  }

  function startLevel(index) {
    activeGeneration++;
    activeEscape = null;
    currentLevel = Math.min(Core.LEVEL_COUNT,Math.max(1,index));
    progress.lastLevel = currentLevel;
    persist();
    level = Core.generateLevel(currentLevel);
    hearts = 3;
    hoveredId = null; hintedId = null;
    yaw = -.66; pitch = .43; desiredYaw = yaw;
    $('toast').classList.remove('visible');
    hideModal();
    updateHUD(); renderLevels();
    canvas.focus({ preventScroll:true });
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
    for (let i=1;i<points.length;i++) context.lineTo(points[i].x,points[i].y);
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
    context.shadowColor='rgba(25,101,150,.16)';context.shadowBlur=12;
    context.fillStyle=face.tint;context.fill();context.restore();
    context.lineWidth=1.6;
    context.strokeStyle='#a4c1d4';context.stroke();
    // Faint construction grid: helpful for understanding exact arrow clearance.
    for (let i=1;i<N;i++) {
      const off=.003;
      drawSegment([project(pointOnFace(face,i,0,1+off)),project(pointOnFace(face,i,N,1+off))],'#b0d2e5',.65,.22);
      drawSegment([project(pointOnFace(face,0,i,1+off)),project(pointOnFace(face,N,i,1+off))],'#b0d2e5',.65,.22);
    }
    // Subtle inset edge brings out the transparent-cube aesthetic.
    const inset=.06*N;
    const insetPoints=[[inset,inset],[N-inset,inset],[N-inset,N-inset],[inset,N-inset]].map(([x,y]) => project(pointOnFace(face,x,y,1.006)));
    context.beginPath();context.moveTo(insetPoints[0].x,insetPoints[0].y);
    insetPoints.slice(1).forEach(p=>context.lineTo(p.x,p.y));context.closePath();
    context.strokeStyle='#dceef8'; context.lineWidth=.9;context.stroke();
  }
  function drawCubeShadow() {
    const width = sceneScale*1.65;
    const centerY=sceneHeight*.516 + sceneScale*1.39;
    const gradient=context.createRadialGradient(sceneWidth*.5,centerY,8,sceneWidth*.5,centerY,width);
    gradient.addColorStop(0,'rgba(27,116,176,.16)');gradient.addColorStop(1,'rgba(27,116,176,0)');
    context.save();context.translate(sceneWidth*.5,centerY);context.scale(1,.24);context.translate(-sceneWidth*.5,-centerY);
    context.beginPath();context.arc(sceneWidth*.5,centerY,width,0,TAU);context.fillStyle=gradient;context.fill();context.restore();
  }
  function drawArrow(arrow,face,time) {
    if (arrow.removed && !arrow.escape) return;
    const motion = arrow.escape;
    const fraction = motion ? Math.max(0,Math.min(1,(time-motion.startedAt)/motion.duration)) : 0;
    if (motion && fraction>=1) return;
    // Ease in/out without teleporting or cutting off the arrow's trailing end.
    const eased = fraction < .5 ? 4*fraction*fraction*fraction :
      1-Math.pow(-2*fraction+2,3)/2;
    const shape = Core.getEscapeShape(arrow,level.size,motion ? motion.distance*eased : 0);
    const points = shape.points.map(p=>project(pointOnFace(face,p.x,p.y,1.019)));
    const {direction,head:headPos} = shape;
    const head=(x,y)=>project(pointOnFace(face,x,y,1.024));
    const tip=head(headPos.x,headPos.y);
    const wing1=head(headPos.x-direction.x*.46-direction.y*.27,headPos.y-direction.y*.46+direction.x*.27);
    const wing2=head(headPos.x-direction.x*.46+direction.y*.27,headPos.y-direction.y*.46-direction.x*.27);
    const isHint = arrow.id===hintedId && time<hintExpiry && !arrow.removed;
    const isHover=arrow.id===hoveredId && !arrow.removed;
    const isBad=(arrow.badUntil||0)>time;
    const color = isBad?'#e9506b':isHint?'#079da2':progress.colorful?COLORS[FACES.indexOf(FACES.find(f=>f.id===face.id))]:'#1d3249';
    const width = Math.max(2.4,Math.min(5.2,sceneScale*.021));
    context.save();
    // Keep the full arrow visible until the tail has crossed the cube edge.
    context.globalAlpha = motion ? Math.min(1,(1-fraction)/.07) : 1;
    if (isHint || isHover || isBad) {
      drawSegment(points,isBad?'#ffd0d8':isHint?'#6df1e8':'#87d9fb',width+9,isHint?.70:.60);
    }
    drawSegment(points,color,width);
    context.beginPath(); context.moveTo(tip.x,tip.y);context.lineTo(wing1.x,wing1.y);context.lineTo(wing2.x,wing2.y);context.closePath();
    context.fillStyle=color; context.fill();
    if (isHint) {
      context.beginPath();context.arc(tip.x,tip.y,12+2*Math.sin(time*.008),0,TAU);
      context.strokeStyle='rgba(5,164,159,.53)';context.lineWidth=2;context.stroke();
    }
    context.restore();
    if (!arrow.removed) selectedPoints.push({arrow,points,depth:rotateVector(face.normal)[2],tip});
  }

  function draw(time) {
    if (!sceneWidth || !level) return;
    const elapsed = Math.min(40,time-lastTime || 16);
    lastTime=time;
    if (activeEscape && time-activeEscape.escape.startedAt >= activeEscape.escape.duration) {
      const finished = activeEscape;
      finished.escape = null;
      activeEscape = null;
      if (level.arrows.every(a=>a.removed)) finishLevel();
    }
    if (!drag) {
      const difference=desiredYaw-yaw;
      if (Math.abs(difference)>.001) yaw += difference * Math.min(1,elapsed*.013);
      else yaw=desiredYaw;
    }
    context.clearRect(0,0,sceneWidth,sceneHeight);
    drawCubeShadow();
    const faces=faceNormals();
    selectedPoints=[];
    for (const face of faces) {
      drawFace(face);
      for (const arrow of level.arrows) if (arrow.face===face.id) drawArrow(arrow,face,time);
    }
    requestAnimationFrame(draw);
  }
  function refreshSize() {
    const rect=stage.getBoundingClientRect();
    const ratio=Math.min(window.devicePixelRatio||1,2);
    sceneWidth=rect.width;sceneHeight=rect.height;
    if (!sceneWidth || !sceneHeight) return;
    const w=Math.round(sceneWidth*ratio),h=Math.round(sceneHeight*ratio);
    if (canvas.width!==w||canvas.height!==h) {canvas.width=w;canvas.height=h;}
    context.setTransform(ratio,0,0,ratio,0,0);
    sceneScale=Math.min(sceneWidth*.285,sceneHeight*.27,225);
  }
  function distanceToSegment(x,y,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/Math.max(.01,dx*dx+dy*dy)));
    return Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy));
  }
  function hitArrow(x,y) {
    let selected=null,score=Infinity;
    for (const item of selectedPoints) {
      let distance=Math.hypot(x-item.tip.x,y-item.tip.y);
      for (let i=0;i<item.points.length-1;i++) distance=Math.min(distance,distanceToSegment(x,y,item.points[i],item.points[i+1]));
      const candidateScore=distance-item.depth*1.25;
      if (distance<=Math.max(13,sceneScale*.072) && candidateScore<score) {selected=item.arrow;score=candidateScore;}
    }
    return selected;
  }
  function canvasCoords(event) {
    const rect=canvas.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  }
  canvas.addEventListener('pointerdown',event=>{
    if (modalOpen || !level) return;
    if (event.button!==0 && event.pointerType==='mouse') return;
    const p=canvasCoords(event);
    drag={x:p.x,y:p.y,lastX:p.x,lastY:p.y,moved:false};
    desiredYaw=yaw;hoveredId=null;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if (modalOpen) return;
    const p=canvasCoords(event);
    if (drag) {
      const dx=p.x-drag.lastX,dy=p.y-drag.lastY;
      if (Math.hypot(p.x-drag.x,p.y-drag.y)>6) drag.moved=true;
      if (drag.moved) {
        yaw+=dx*.009;desiredYaw=yaw;
        pitch=Math.max(-1.38,Math.min(1.38,pitch+dy*.008));
        canvas.classList.add('dragging');
      }
      drag.lastX=p.x;drag.lastY=p.y;
    } else {
      hoveredId=hitArrow(p.x,p.y)?.id||null;
      canvas.style.cursor=hoveredId?'pointer':'grab';
    }
  });
  canvas.addEventListener('pointerup',event=>{
    if (!drag) return;
    const wasDrag=drag.moved;
    drag=null;
    canvas.classList.remove('dragging');
    if (!wasDrag && !modalOpen) {
      const p=canvasCoords(event);
      const arrow=hitArrow(p.x,p.y);
      if (arrow) attemptRelease(arrow);
      else setToast('Tap a black arrow line to release it.');
    }
  });
  canvas.addEventListener('pointercancel',()=>{drag=null;canvas.classList.remove('dragging');});
  canvas.addEventListener('pointerleave',()=>{if(!drag)hoveredId=null;});
  canvas.addEventListener('keydown',event=>{
    if (modalOpen) return;
    if (event.key==='ArrowLeft'||event.key==='ArrowRight') {
      event.preventDefault();desiredYaw+=(event.key==='ArrowLeft'?.4:-.4);
    } else if (event.key==='ArrowUp'||event.key==='ArrowDown') {
      event.preventDefault();pitch=Math.max(-1.38,Math.min(1.38,pitch+(event.key==='ArrowUp'?.24:-.24)));
    } else if (event.key==='h'||event.key==='H') { event.preventDefault();showHint(); }
  });
  function attemptRelease(arrow) {
    // Keep the board stable while one head-to-tail escape is in motion.
    if (activeEscape || arrow.removed || hearts<=0) return;
    const stamp=performance.now();
    if (Core.isBlocked(arrow,level.arrows,level.size)) {
      hearts--;
      arrow.badUntil=stamp+620;
      playSound('bad');
      updateHUD();
      if (hearts===0) {
        setToast('No hearts left. Try again.','warning');
        const generation=activeGeneration;
        setTimeout(()=>{if(generation===activeGeneration) showLossModal();},550);
      } else setToast('Blocked! Clear another arrow first.','warning');
      return;
    }
    const shape=Core.getEscapeShape(arrow,level.size);
    arrow.removed=true;
    arrow.escape={startedAt:stamp,distance:shape.totalTravel,
      duration:Math.min(1200,Math.max(680,440+shape.totalTravel*85))};
    activeEscape=arrow;
    hintedId=null;hoveredId=null;
    playSound('good');
    updateHUD();
  }
  function finishLevel() {
    if (!progress.completed.includes(currentLevel)) progress.completed.push(currentLevel);
    progress.unlocked=Math.min(15,Math.max(progress.unlocked,currentLevel+1));
    persist();updateHUD();renderLevels();
    showWinModal();
  }
  function showHint() {
    if (modalOpen || !level || activeEscape) return;
    const options=Core.availableArrows(level);
    if (!options.length) return;
    const visibles=faceNormals().map(f=>f.id);
    let picked=options.find(a=>visibles.includes(a.face));
    if (!picked) {
      // Align the nearest face with the camera, so the hint is actually visible.
      picked=options[0];
      const goal = {
        front:[0,.28],right:[-Math.PI/2,.28],back:[Math.PI,.28],
        left:[Math.PI/2,.28],top:[0,1.20],bottom:[0,-1.20]
      }[picked.face];
      // Choose the nearest equivalent full rotation, then face the target.
      desiredYaw=goal[0]+TAU*Math.round((yaw-goal[0])/TAU);
      pitch=goal[1];
      setToast('Rotating to reveal a free arrow.','success');
    } else setToast('Highlighted arrow has a clear exit!','success');
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
    const final=currentLevel===15;
    openModal({ icon:'✦',eyebrow:final?'ALL CHALLENGES COMPLETE':'PUZZLE COMPLETE',
      title:final?'Cube master!':'Level cleared!',
      message:final?'You completed every Easy, Medium, and Hard challenge. All levels are now replayable.':'Every arrow escaped. Your next puzzle is ready.',
      stats:`<span>✓ &nbsp; ${level.total} ARROWS CLEARED</span><span>♥ &nbsp; ${hearts} HEARTS LEFT</span>`,
      buttons:[{text:'Replay level',action:()=>startLevel(currentLevel)},
        {text:final?'Play Level 01':'Next level →',primary:true,action:()=>startLevel(final?1:currentLevel+1)}]
    });
  }
  function showLossModal() {
    openModal({icon:'↺',eyebrow:'GIVE IT ANOTHER GO',title:'Out of hearts',
      message:'Blocked arrows cost a heart. Look for a clear lane, or use a hint before tapping.',
      buttons:[{text:'View cube',action:hideModal},{text:'Try again',primary:true,action:()=>startLevel(currentLevel)}]});
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
  }
  function openHelp() {
    openModal({icon:'↗',eyebrow:'FOUR SIMPLE RULES',title:'How to play',message:'',
      buttons:[{text:'Settings',action:openSettings},{text:'Start playing',primary:true,action:hideModal}]});
    const help=$('modalExtra');
    for (const [title,description] of [
      ['01 · Rotate','Drag left/right/up/down to inspect every side. You can use the Left / Right buttons too.'],
      ['02 · Check the exit','Each arrow moves head-first along its path, then out in the direction of its arrowhead. Its exit must be clear of other arrows on that face.'],
      ['03 · Release','Tap a clear arrow to slide it away. A blocked tap loses one heart, but a hint is free.'],
      ['04 · Complete','Remove all arrows on every side to unlock the next level. Your progress saves automatically on this device.']
    ]) {const p=document.createElement('p');p.className='help-copy';const strong=document.createElement('strong');strong.textContent=title+' — ';p.append(strong,document.createTextNode(description));help.appendChild(p);}
  }

  $('rotateLeftBtn').addEventListener('click',()=>desiredYaw+=Math.PI/2);
  $('rotateRightBtn').addEventListener('click',()=>desiredYaw-=Math.PI/2);
  $('resetBtn').addEventListener('click',()=>{startLevel(currentLevel);setToast('Level restarted.');});
  $('hintBtn').addEventListener('click',showHint);
  $('soundBtn').addEventListener('click',toggleSound);
  $('settingsBtn').addEventListener('click',openSettings);
  $('modalClose').addEventListener('click',hideModal);
  $('modal').addEventListener('pointerdown',e=>{if(e.target===$('modal'))hideModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modalOpen)hideModal();});
  document.body.classList.toggle('muted',!progress.sound);
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refreshSize) : null;
  if(resizeObserver)resizeObserver.observe(stage);
  window.addEventListener('resize',refreshSize);
  refreshSize();startLevel(Math.min(progress.unlocked,progress.lastLevel));
  requestAnimationFrame(draw);
})();
