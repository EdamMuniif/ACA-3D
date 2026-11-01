'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json','.svg':'image/svg+xml',
  '.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{
    const data=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
    res.end(data);
  }catch{res.writeHead(404).end();}
});
async function open(context,url){
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url,{waitUntil:'load'});
  await page.locator('#playBtn').waitFor();
  return {page,errors};
}
async function play(page){
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>!document.getElementById('playScreen').hidden &&
    Number(document.getElementById('remainingCount').textContent)>0);
  await page.waitForTimeout(160);
}
async function stageTap(page,face,order,yaw){
  // Coordinates reproduce production's 3D projection from game.js.
  const point=await page.evaluate(({face,order,yaw})=>{
    const board=window.ArrowCubeCore.generateLevel(1);
    const arrow=board.arrows.find(a=>a.face===face&&a.order===order);
    if(!arrow)throw Error('Arrow not found: '+face+'-'+order);
    const c=arrow.cells[Math.floor(arrow.cells.length/2)];
    const basis=face==='front'
      ?{normal:[0,0,1],u:[1,0,0],v:[0,-1,0]}
      :{normal:[1,0,0],u:[0,0,-1],v:[0,-1,0]};
    const a=(c.x+.5)*2/board.size-1,b=(c.y+.5)*2/board.size-1;
    const p=[0,1,2].map(i=>basis.normal[i]*1.023+basis.u[i]*a+basis.v[i]*b);
    const pitch=.43,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const x=p[0]*cy+p[2]*sy,z=-p[0]*sy+p[2]*cy;
    const yr=p[1]*cp-z*sp,zr=p[1]*sp+z*cp;
    const rect=document.getElementById('gameCanvas').getBoundingClientRect();
    const scale=Math.min(rect.width*.325,rect.height*.27,300)*5.6/(5.6-zr);
    return {x:rect.left+rect.width*.5+x*scale,
      y:rect.top+rect.height*.46-yr*scale};
  },{face,order,yaw});
  const before=Number(await page.locator('#remainingCount').innerText());
  await page.touchscreen.tap(point.x,point.y);
  await page.waitForFunction(expected=>Number(document.getElementById('remainingCount').textContent)===expected,
    before-1,{timeout:2500});
}
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/';
  const browser=await chromium.launch({headless:true});
  try{
    const mobile=await browser.newContext({viewport:{width:390,height:844},
      deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const {page,errors}=await open(mobile,url);
    await play(page);
    assert.equal(await page.locator('#zoomValue').innerText(),'100%');
    await page.locator('#zoomInBtn').click();
    await page.locator('#zoomInBtn').click();
    assert.equal(await page.locator('#zoomValue').innerText(),'120%');
    assert.equal(await page.locator('#zoomInBtn').isDisabled(),true);
    await page.locator('#focusFaceBtn').click();
    assert.equal(await page.locator('#focusFaceBtn').getAttribute('aria-pressed'),'true');
    await page.locator('#focusFaceBtn').click();
    assert.equal(await page.locator('#focusFaceBtn').getAttribute('aria-pressed'),'false');
    await page.reload();
    assert.equal(await page.locator('#homeScreen').isVisible(),true);
    assert.equal(await page.locator('#homeCompleted').innerText(),'0 / 100');
    assert.deepEqual(errors,[]);
    await mobile.close();
    console.log('PASS: portrait mobile controls and unchanged saved progress');

    const landscape=await browser.newContext({viewport:{width:667,height:375},
      deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const land=await open(landscape,url);
    await play(land.page);
    const height=await land.page.locator('#stage').evaluate(el=>el.getBoundingClientRect().height);
    assert.ok(height>=170 && height<360,'landscape stage height='+height);
    assert.equal(await land.page.locator('#focusFaceBtn').isVisible(),true);
    assert.equal(await land.page.locator('#hintBtn').isVisible(),true);
    assert.deepEqual(land.errors,[]);
    await landscape.close();
    console.log('PASS: compact landscape gameplay stage and visible controls');

    const migrated=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
    await migrated.addInitScript(()=>{
      localStorage.setItem('arrow-cube-away-v1',JSON.stringify({
        unlocked:15,lastLevel:15,completed:[15],sound:false,bestScores:{15:400},points:400
      }));
    });
    const old=await open(migrated,url);
    assert.equal(await old.page.locator('#homeNextLevel').innerText(),'16');
    assert.deepEqual(old.errors,[]);
    await migrated.close();
    console.log('PASS: legacy save migration');

    const end=await browser.newContext({viewport:{width:390,height:844},
      isMobile:true,deviceScaleFactor:1,hasTouch:true});
    await end.addInitScript(()=>{
      localStorage.setItem('arrow-cube-away-v1',JSON.stringify({
        unlocked:100,lastLevel:100,completed:Array.from({length:99},(_,i)=>i+1),
        sound:false,bestScores:{},points:0
      }));
    });
    const last=await open(end,url);
    await play(last.page);
    assert.equal(await last.page.locator('#remainingCount').innerText(),'256');
    await last.page.locator('#focusFaceBtn').click();
    await last.page.locator('#zoomInBtn').click();
    assert.deepEqual(last.errors,[]);
    await end.close();
    console.log('PASS: level 100 loads on narrow mobile and supports focus/zoom');

    const solve=await browser.newContext({viewport:{width:390,height:844},
      isMobile:true,deviceScaleFactor:1,hasTouch:true});
    const actual=await open(solve,url);
    await play(actual.page);
    await actual.page.locator('#focusFaceBtn').click();
    await actual.page.locator('#rotateRightBtn').click();
    await actual.page.waitForTimeout(850);
    await stageTap(actual.page,'right',1,-.66-Math.PI/2);
    await stageTap(actual.page,'right',0,-.66-Math.PI/2);
    await actual.page.locator('#rotateLeftBtn').click();
    await actual.page.waitForTimeout(850);
    for(const i of [2,1,0])await stageTap(actual.page,'front',i,-.66);
    await actual.page.locator('#modalTitle').getByText('Level cleared!').waitFor({timeout:4000});
    assert.deepEqual(actual.errors,[]);
    await solve.close();
    console.log('PASS: real touch taps solve level 1 and show completion modal');
  }finally{await browser.close();}
}
run().then(()=>server.close(),error=>{console.error(error);server.close();process.exitCode=1;});
