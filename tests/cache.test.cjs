const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');

function makeWorker(offline=false) {
  const handlers = {}, saved = new Map();
  const request = {url:'https://example.test/ACA-3D/game.js?v=24',method:'GET',mode:'same-origin'};
  const response = body => ({ok:true,body,clone(){return response(body)}});
  const cache = {
    async put(req,r){saved.set(req.url,r)},
    async match(req){return saved.get(req.url)||null},
    async addAll(){saved.set(request.url,response('old version'))}
  };
  const scope={
    URL, Response:{error:()=>response('error')},
    self:{location:{origin:'https://example.test'},addEventListener(n,fn){handlers[n]=fn},
      skipWaiting:async()=>{}, clients:{claim:async()=>{}}},
    caches:{open:async()=>cache,keys:async()=>[],delete:async()=>{}},
    fetch:async()=>{if(offline)throw Error('offline');return response('new version')}
  };
  vm.runInNewContext(code,scope);
  return {handlers,request,response,saved};
}
async function fetchThroughWorker(worker) {
  let result;
  worker.handlers.fetch({request:worker.request,respondWith(p){result=p}});
  assert.ok(result);
  return result;
}
test('online requests replace outdated cached JavaScript',async()=>{
  const w=makeWorker();
  w.saved.set(w.request.url,w.response('old version'));
  assert.equal((await fetchThroughWorker(w)).body,'new version');
  assert.equal(w.saved.get(w.request.url).body,'new version');
});
test('offline requests retain last known-good JavaScript',async()=>{
  const w=makeWorker(true);
  w.saved.set(w.request.url,w.response('offline version'));
  assert.equal((await fetchThroughWorker(w)).body,'offline version');
});
test('HTML uses cache-busted script and stylesheet assets',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  for(const url of ['./core.js','./game.js','./styles.css','./home-preview.js'])assert.match(html,new RegExp(url.replace('.','\\.')+'\\?v=\\d+'));
  assert.ok(html.includes("updateViaCache:'none'"));
});
