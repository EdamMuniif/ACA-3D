const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');

test('mobile and tablet headers switch to four-column navigation with two rows',()=>{
  const v8=css.slice(css.indexOf('/* V8: keep every header control'));
  assert.ok(v8.startsWith('/* V8: keep every header control'));
  assert.match(v8,/@media\s*\(max-width:900px\)/);
  assert.match(v8,/\.topbar\s*\{[^}]*flex-direction:column/);
  assert.match(v8,/\.header-controls\s*\{[^}]*display:grid;[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) 44px 44px/s);
  assert.match(v8,/\.header-controls \.offline-chip\s*\{display:none\}/);
  assert.match(v8,/@media\s*\(max-width:360px\)/);
});

test('Home, Levels, sound and settings retain their accessible controls',()=>{
  for(const id of ['homeNavBtn','levelsNavBtn','soundBtn','settingsBtn'])
    assert.match(html,new RegExp('id="'+id+'"'));
  const controlSection=html.match(/<div class="header-controls">([\s\S]*?)<\/div>/);
  assert.ok(controlSection);
  const ids=[...controlSection[1].matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids,['homeNavBtn','levelsNavBtn','soundBtn','settingsBtn']);
  assert.match(html,/href="\.\/styles\.css\?v=8"/);
});
