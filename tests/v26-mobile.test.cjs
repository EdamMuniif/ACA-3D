const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');

test('V26 mobile cube controls are accessible and separate from game actions',()=>{
  assert.match(html,/id="focusFaceBtn"[^>]*aria-pressed="false"/);
  assert.match(html,/id="zoomOutBtn"[^>]*aria-label="Zoom out"/);
  assert.match(html,/id="zoomInBtn"[^>]*aria-label="Zoom in"/);
  assert.match(html,/id="zoomValue"[^>]*aria-live="polite"/);
  assert.match(html,/class="stage-view-tools"/);
  assert.match(css,/\.stage-view-tools\s*\{[^}]*position:absolute;z-index:6/);
  assert.match(css,/@media\(max-height:500px\) and \(orientation:landscape\)/);
  assert.match(css,/body\.playing \.stage\s*\{\s*height:max\(170px,calc\(100dvh - 174px\)\);\s*min-height:170px;/);
});

test('V26 view-only options preserve existing scoring and enforce pointer identity',()=>{
  assert.match(game,/let focusFaceMode = false, cameraZoom = 1/);
  assert.match(game,/MAX_ZOOM = 1\.2/);
  assert.match(game,/Core\.sceneScale\(sceneWidth,sceneHeight\)\*cameraZoom/);
  assert.match(game,/face\.id!==closestFace\?\.id/);
  assert.match(game,/if \(!focusFaceMode\) for \(const face of FACES\)/);
  assert.match(game,/event\.pointerId!==drag\.pointerId/);
  assert.match(game,/press\.startArrow\.id!==releaseArrow\.id/);
  assert.match(game,/Never charge a heart for an ambiguous finger release/);
  assert.doesNotMatch(game,/localStorage\.setItem\([^\n]*focusFaceMode/);
});
