/* ACA-3D home showcase — the same grid paths and flat-arrow renderer
   as gameplay, drawn into a separate, non-interactive 3D preview canvas.
   It never touches the live level, player state or localStorage. */
(() => {
  'use strict';
  const canvas=document.getElementById('homePreviewCanvas');
  const Core=window.ArrowCubeCore;
  if(!canvas || !Core)return;
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return;
  const faces=[
    {id:'front',normal:[0,0,1],u:[1,0,0],v:[0,-1,0],tint:'#FFFDF8',ink:'#C8452C'},
    {id:'right',normal:[1,0,0],u:[0,0,-1],v:[0,-1,0],tint:'#FAF6EF',ink:'#2F6F9F'},
    {id:'top',normal:[0,1,0],u:[1,0,0],v:[0,0,1],tint:'#FFFDF8',ink:'#1F7A6D'},
    {id:'left',normal:[-1,0,0],u:[0,0,1],v:[0,-1,0],tint:'#F6F0E4',ink:'#866F9B'},
    {id:'back',normal:[0,0,-1],u:[-1,0,0],v:[0,-1,0],tint:'#FBF8F1',ink:'#B8861B'},
    {id:'bottom',normal:[0,-1,0],u:[1,0,0],v:[0,0,-1],tint:'#F7F2E9',ink:'#5B7F7B'}
  ];
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  let board=Core.generateLevel(2),width=0,height=0,dpr=1;
  let cycleStart=0,lastLaunch=0,released=0,lastPaint=-100;
  let rafId=0;
  const escapeDuration=1020;
  const MAX_RELEASES=7;
  function resize(){
    const rect=canvas.getBoundingClientRect();
    const w=Math.max(1,Math.round(rect.width));
    const h=Math.max(1,Math.round(rect.height));
    const ratio=Math.max(1,Math.min(2,window.devicePixelRatio||1));
    if(w===width && h===height && ratio===dpr)return;
    width=w;height=h;dpr=ratio;
    canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
  }
  function vector(v,yaw,pitch){
    const c=Math.cos(yaw),s=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch);
    const x=v[0]*c+v[2]*s,z=-v[0]*s+v[2]*c;
    return [x,v[1]*cx-z*sx,v[1]*sx+z*cx];
  }
  function world(face,x,y,offset=1.009){
    const u=x*2/board.size-1,v=y*2/board.size-1;
    return [0,1,2].map(i=>face.normal[i]*offset+face.u[i]*u+face.v[i]*v);
  }
  function project(point,yaw,pitch){
    const [x,y,z]=vector(point,yaw,pitch);
    const scale=Math.min(width*.37,height*.43)*5.3/(5.3-z);
    return {x:width*.5+x*scale,y:height*.53-y*scale,z};
  }
  function coords(face,x,y,yaw,pitch,offset){
    return project(world(face,x,y,offset),yaw,pitch);
  }
  function path(vertices,face,yaw,pitch,offset=1.009){
    if(vertices.length<2)return;
    ctx.beginPath();
    const first=coords(face,vertices[0].x,vertices[0].y,yaw,pitch,offset);
    ctx.moveTo(first.x,first.y);
    for(let i=1;i<vertices.length;i++){
      const p=coords(face,vertices[i].x,vertices[i].y,yaw,pitch,offset);
      ctx.lineTo(p.x,p.y);
    }
  }
  function polygon(vertices,face,yaw,pitch,color){
    if(!vertices || vertices.length<3)return;
    path(vertices,face,yaw,pitch,1.016);
    ctx.closePath();
    ctx.fillStyle=color;
    ctx.fill();
  }
  function cubeFace(face,yaw,pitch){
    const n=board.size;
    const corners=[{x:0,y:0},{x:n,y:0},{x:n,y:n},{x:0,y:n}];
    path(corners,face,yaw,pitch,1);
    ctx.closePath();
    ctx.fillStyle=face.tint;ctx.fill();
    ctx.strokeStyle='rgba(49,51,54,.83)';
    ctx.lineWidth=1.7;ctx.lineJoin='round';ctx.stroke();
    ctx.lineWidth=.48;ctx.strokeStyle='rgba(107,98,84,.19)';
    for(let k=1;k<n;k++){
      path([{x:k,y:0},{x:k,y:n}],face,yaw,pitch,1.008);ctx.stroke();
      path([{x:0,y:k},{x:n,y:k}],face,yaw,pitch,1.008);ctx.stroke();
    }
  }
  function paintArrow(arrow,face,yaw,pitch,now){
    let travel=0,escaping=false;
    if(arrow.escape){
      const t=Math.max(0,(now-arrow.escape.startedAt)/escapeDuration);
      if(t>=1)return;
      escaping=true;
      const eased=t<.22?(t*t/.22)*.6:(.132+(t-.22)*1.113);
      travel=arrow.escape.distance*Math.min(1,eased);
    }else if(arrow.removed)return;
    const shape=Core.getEscapeShape(arrow,board.size,travel);
    const mesh=Core.buildFlatArrowGeometry(shape.points,shape.direction,.22);
    if(!mesh)return;
    const color=escaping?'#E5482D':face.ink;
    ctx.save();
    ctx.globalAlpha=escaping?Math.max(.04,1-travel/Math.max(1,arrow.escape.distance)*.6):1;
    for(const quad of mesh.quads)polygon(quad,face,yaw,pitch,color);
    for(const disc of mesh.discs)polygon(disc,face,yaw,pitch,color);
    polygon(mesh.head,face,yaw,pitch,color);
    ctx.restore();
  }
  function advance(now){
    if(reducedMotion)return;
    if(!cycleStart){cycleStart=now;lastLaunch=now-1000;}
    if(released>=MAX_RELEASES){
      if(now-lastLaunch>1900){
        board=Core.generateLevel(2);cycleStart=now;lastLaunch=now;released=0;
      }
      return;
    }
    if(now-lastLaunch<1450)return;
    const free=Core.availableArrows(board);
    const preferred=free.filter(a=>['front','right','top'].includes(a.face));
    const choices=preferred.length?preferred:free;
    if(!choices.length){released=MAX_RELEASES;lastLaunch=now;return;}
    const arrow=choices[released%choices.length];
    arrow.escape={startedAt:now,distance:Core.getEscapeShape(arrow,board.size).totalTravel};
    arrow.removed=true;released++;lastLaunch=now;
  }
  function draw(now){
    resize();
    if(width<2||height<2)return;
    ctx.clearRect(0,0,width,height);
    advance(now);
    // Gentle oscillation keeps the front, top and right faces readable.
    const yaw=-.66+(reducedMotion?0:Math.sin(now*.00038)*.22);
    const pitch=.43+(reducedMotion?0:Math.sin(now*.00053)*.12);
    const visible=faces.map(face=>({...face,view:vector(face.normal,yaw,pitch)[2]}))
      .filter(face=>face.view>.16).sort((a,b)=>a.view-b.view);
    for(const face of visible){
      cubeFace(face,yaw,pitch);
      if(face.view<.28)continue;
      ctx.save();ctx.globalAlpha=Core.faceArrowOpacity(face.view);
      for(const arrow of board.arrows)
        if(arrow.face===face.id)paintArrow(arrow,face,yaw,pitch,now);
      ctx.restore();
    }
  }
  function frame(now){
    rafId=requestAnimationFrame(frame);
    if(document.hidden || document.getElementById('homeScreen').hidden)return;
    if(now-lastPaint<30)return;
    lastPaint=now;
    draw(now);
  }
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',()=>{lastPaint=-100;});
  resize();
  draw(0); // meaningful static first frame and reduced-motion fallback
  if(!reducedMotion)rafId=requestAnimationFrame(frame);
})();
