/* ACA-3D V27 — independent, score-free four-step tutorial. */
(() => {
  'use strict';
  const Core=window.ArrowCubeCore;
  const $=id=>document.getElementById(id);
  const overlay=$('tutorialOverlay'),canvas=$('tutorialCanvas');
  if (!Core || !overlay || !canvas) return;
  const ctx=canvas.getContext('2d');
  const SEEN_KEY='arrow-cube-away-tutorial-v27';
  const SAVE_KEY='arrow-cube-away-v1';
  const SIZE=4;
  const faces=[
    {id:'front',n:[0,0,1],u:[1,0,0],v:[0,-1,0],fill:'#f9f5eb'},
    {id:'right',n:[1,0,0],u:[0,0,-1],v:[0,-1,0],fill:'#ece8dd'},
    {id:'top',n:[0,1,0],u:[1,0,0],v:[0,0,1],fill:'#f0ebdf'}
  ];
  const steps=[
    ['Rotate the cube','Drag the cube or use Rotate right. Explore its different faces.','Rotate right'],
    ['Find a blocked exit','The dark arrow cannot escape: the amber arrow occupies its straight exit lane. Try the blocked arrow.','Try blocked arrow'],
    ['Release the clear arrow','The amber arrow has a clear exit. Tap it to let its head lead the way out.','Release clear arrow'],
    ['Learn the hint','Use Show hint to identify a valid move, then release the highlighted arrow.','Show hint']
  ];
  const demo=()=>[
    {id:'tutorial-blocked',face:'front',cells:[{x:0,y:1},{x:1,y:1}],removed:false},
    {id:'tutorial-clear',face:'front',cells:[{x:2,y:0},{x:2,y:1}],removed:false}
  ];
  let board=demo(),step=0,hintShown=false,yaw=-.45,pitch=.30;
  let active=false,replaying=false,onFirstDone=null,previousFocus=null;
  let lastTime=0,animationStart=0,animationArrow=null,frame=0,pointer=null,picks=[];
  const action=$('tutorialActionBtn'),skip=$('tutorialSkipBtn'),status=$('tutorialStatus');
  const announce=(message)=>{status.textContent=message;};
  function seen(){
    try{return localStorage.getItem(SEEN_KEY)==='true';}catch{return false;}
  }
  function markSeen(){try{localStorage.setItem(SEEN_KEY,'true');}catch{}}
  function existingProgress(){
    try{
      const save=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
      return !!(save && ((Number(save.unlocked)||1)>1 ||
        (Number(save.points)||0)>0 ||
        (Array.isArray(save.completed)&&save.completed.length)));
    }catch{return false;}
  }
  function updateStep(){
    $('tutorialStep').textContent=step>=steps.length?'Complete':(step+1)+' of '+steps.length;
    $('tutorialProgress').style.width=Math.min(100,step/steps.length*100)+'%';
    if(step>=steps.length){
      $('tutorialTitle').textContent='Ready for Level 1';
      $('tutorialDescription').textContent='You can now rotate, check exits, release arrows and use hints. Tutorial moves never use hearts or earn points.';
      action.textContent=replaying?'Return to game':'Start Level 1';
      skip.hidden=true;
      announce('Tutorial completed.');
      return;
    }
    const info=steps[step];
    $('tutorialTitle').textContent=info[0];
    $('tutorialDescription').textContent=info[1];
    action.textContent=step===3&&hintShown?'Release highlighted arrow':info[2];
    skip.hidden=false;
    announce('Step '+(step+1)+': '+info[0]+'.');
  }
  function finish(mark=true){
    if(!active)return;
    if(mark&&!replaying)markSeen();
    active=false;
    cancelAnimationFrame(frame);
    overlay.hidden=true;
    document.body.classList.remove('tutorial-active');
    if(!replaying && onFirstDone) {
      const proceed=onFirstDone;onFirstDone=null;proceed();
    } else if(previousFocus && typeof previousFocus.focus==='function'){
      previousFocus.focus({preventScroll:true});
    }
    replaying=false;
  }
  function begin(isReplay,proceed){
    if(active)return;
    replaying=Boolean(isReplay);onFirstDone=typeof proceed==='function'?proceed:null;
    previousFocus=document.activeElement;
    board=demo();step=0;hintShown=false;yaw=-.45;pitch=.30;
    pointer=null;animationArrow=null;animationStart=0;
    overlay.hidden=false;document.body.classList.add('tutorial-active');
    updateStep();
    skip.textContent=replaying?'Close tutorial':'Skip tutorial';
    action.focus({preventScroll:true});
    lastTime=0;
    frame=requestAnimationFrame(tick);
  }
  function startIfFirstPlay(proceed){
    if(seen()||existingProgress())return false;
    begin(false,proceed);return true;
  }
  function rotate(){
    if(step!==0)return;
    yaw+=Math.PI/2;
    step=1;
    updateStep();
    // Hold the rotated cube briefly, then return to its lesson-facing angle.
    setTimeout(()=>{if(active&&step===1){yaw=-.45;pitch=.30;}},650);
  }
  function tryBlocked(){
    if(step!==1)return;
    const blocked=Core.getBlocker(board[0],board,SIZE);
    if(!blocked){announce('Tutorial exit setup is invalid.');return;}
    step=2;updateStep();
    announce('Blocked: the amber arrow is in the exit lane. No heart was lost.');
  }
  function releaseClear(){
    if(step!==2)return;
    if(Core.isBlocked(board[1],board,SIZE)){
      announce('The amber arrow is still blocked.');return;
    }
    animationArrow=board[1];
    animationStart=performance.now();
    board[1].removed=true;
    step=3;hintShown=false;updateStep();
    announce('The clear arrow escaped head-first. Try the hint next.');
  }
  function useHint(){
    if(step!==3||hintShown)return;
    const valid=Core.availableArrows({arrows:board,size:SIZE});
    if(!valid.some(a=>a.id===board[0].id)){announce('No valid hint available.');return;}
    hintShown=true;updateStep();
    announce('The green arrow now has a clear exit. Release it to finish.');
  }
  function releaseHinted(){
    if(step!==3||!hintShown)return;
    if(Core.isBlocked(board[0],board,SIZE))return;
    animationArrow=board[0];animationStart=performance.now();
    board[0].removed=true;
    step=4;updateStep();
  }
  function advance(){
    if(step===0)rotate();
    else if(step===1)tryBlocked();
    else if(step===2)releaseClear();
    else if(step===3)hintShown?releaseHinted():useHint();
    else finish();
  }
  function rotatePoint(p){
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const x=p[0]*cy+p[2]*sy,z=-p[0]*sy+p[2]*cy;
    return [x,p[1]*cp-z*sp,p[1]*sp+z*cp];
  }
  let w=0,h=0,scale=0;
  function projection(p){
    const [x,y,z]=rotatePoint(p),factor=4.7/(4.7-z);
    return {x:w*.5+x*scale*factor,y:h*.51-y*scale*factor,z};
  }
  function atFace(face,x,y,offset=1.02){
    const a=2*x/SIZE-1,b=2*y/SIZE-1;
    return [0,1,2].map(i=>face.n[i]*offset+face.u[i]*a+face.v[i]*b);
  }
  function polygon(points,fill,stroke){
    if(!points.length)return;
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
    ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.3;ctx.stroke();}
  }
  function paintArrow(arrow,face,time){
    if(arrow.removed&&arrow!==animationArrow)return;
    let travel=0;
    if(arrow===animationArrow){
      const shape=Core.getEscapeShape(arrow,SIZE);
      travel=shape.totalTravel*Math.min(1,Math.max(0,(time-animationStart)/720));
      if(travel>=shape.totalTravel){animationArrow=null;return;}
    }
    const shape=Core.getEscapeShape(arrow,SIZE,travel);
    const geom=Core.buildFlatArrowGeometry(shape.points,shape.direction,.25);
    if(!geom)return;
    const fill=arrow.id==='tutorial-clear'?'#b5832b':hintShown?'#1f7a6d':'#282d35';
    for(const part of [...geom.quads,...geom.discs,geom.head]){
      const pts=(Array.isArray(part)&&part.length?part:[]).map(p=>projection(atFace(face,p.x,p.y)));
      polygon(pts,fill);
    }
    if(!arrow.removed){
      const points=shape.points.map(p=>projection(atFace(face,p.x,p.y)));
      const [tip,wing1,wing2]=geom.head.map(p=>projection(atFace(face,p.x,p.y)));
      picks.push({arrow,points,tip,wing1,wing2,width:9,depth:rotatePoint(face.n)[2]});
    }
  }
  function draw(time){
    const rect=canvas.getBoundingClientRect();
    w=rect.width;h=rect.height;
    if(w<=0||h<=0)return;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const cw=Math.round(w*dpr),ch=Math.round(h*dpr);
    if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    scale=Math.min(w*.30,h*.36,135);
    picks=[];
    const sorted=faces.map(face=>({...face,view:rotatePoint(face.n)[2]}))
      .filter(face=>face.view>0.02).sort((a,b)=>a.view-b.view);
    for(const face of sorted){
      const corners=[[0,0],[SIZE,0],[SIZE,SIZE],[0,SIZE]]
        .map(([x,y])=>projection(atFace(face,x,y,1)));
      polygon(corners,face.fill,'#353943');
      ctx.strokeStyle='#d6cfc0';ctx.lineWidth=.75;
      for(let n=1;n<SIZE;n++){
        for(const line of [
          [[n,0],[n,SIZE]],[[0,n],[SIZE,n]]
        ]){
          const [a,b]=line.map(([x,y])=>projection(atFace(face,x,y,1.003)));
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        }
      }
      if(face.id==='front')for(const arrow of board)paintArrow(arrow,face,time);
    }
  }
  function tick(time){
    if(!active)return;
    if(!lastTime||time-lastTime>=25){draw(time);lastTime=time;}
    frame=requestAnimationFrame(tick);
  }
  function pointerPosition(event){
    const rect=canvas.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  }
  canvas.addEventListener('pointerdown',event=>{
    if(!active||pointer)return;
    const p=pointerPosition(event);
    pointer={id:event.pointerId,x:p.x,y:p.y,lastX:p.x,moved:false};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if(!pointer||event.pointerId!==pointer.id)return;
    const p=pointerPosition(event);
    const dx=p.x-pointer.lastX;
    if(Math.hypot(p.x-pointer.x,p.y-pointer.y)>12)pointer.moved=true;
    if(pointer.moved){yaw+=dx*.009;pointer.lastX=p.x;}
  });
  canvas.addEventListener('pointerup',event=>{
    if(!pointer||event.pointerId!==pointer.id)return;
    const prev=pointer;pointer=null;
    if(prev.moved){if(step===0)rotate();return;}
    const p=pointerPosition(event);
    const selected=Core.pickProjectedArrow(p.x,p.y,picks,9);
    if(!selected)return;
    if(step===1&&selected.id===board[0].id)tryBlocked();
    else if(step===2&&selected.id===board[1].id)releaseClear();
    else if(step===3&&hintShown&&selected.id===board[0].id)releaseHinted();
    else announce('Follow the highlighted lesson instruction.');
  });
  canvas.addEventListener('pointercancel',()=>{pointer=null;});
  action.addEventListener('click',advance);
  skip.addEventListener('click',()=>finish());
  $('tutorialReplayHomeBtn')?.addEventListener('click',()=>begin(true,null));
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();finish();return;}
    if(event.key==='Tab'){
      const items=[skip,action].filter(b=>!b.hidden&&!b.disabled);
      const index=items.indexOf(document.activeElement);
      if(event.shiftKey&&index<=0){event.preventDefault();items[items.length-1].focus();}
      else if(!event.shiftKey&&index===items.length-1){event.preventDefault();items[0].focus();}
    }
  });
  window.ACA3DTutorial=Object.freeze({
    startIfFirstPlay,
    openReplay:()=>begin(true,null),
    getState:()=>({active,step,hintShown,replaying})
  });
})();
