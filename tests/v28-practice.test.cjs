'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../core.js');
const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');

test('V28: undo restores the original blocker relationships without rerolling a board',()=>{
  const board=Core.generateLevel(1);
  const first=board.arrows.find(a=>a.id==='right-0');
  const blocker=board.arrows.find(a=>a.id==='right-1');
  assert.equal(Core.getBlocker(first,board.arrows,board.size).id,blocker.id);
  blocker.removed=true;
  assert.equal(Core.isBlocked(first,board.arrows,board.size),false);
  blocker.removed=false;
  assert.equal(Core.getBlocker(first,board.arrows,board.size).id,blocker.id);
});

test('V28: practice user interface has accessible controls and compact responsive styling',()=>{
  for(const id of ['practiceToggleBtn','practiceUndoBtn','practiceStatus','practiceModeLabel'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/id="practiceToggleBtn"[^>]*aria-pressed="false"/);
  assert.match(html,/id="practiceUndoBtn"[^>]*hidden disabled/);
  assert.match(css,/body\.playing \.practice-toolbar/);
  assert.match(css,/@media\(max-height:500px\) and \(orientation:landscape\)/);
});

test('V28: only practice branch skips the normal score/unlock and save workflow',()=>{
  assert.match(game,/const PRACTICE_UNDO_LIMIT = 3/);
  assert.match(game,/practiceHistory\.push\(arrow\)/);
  assert.match(game,/practiceHistory\.pop\(\)/);
  assert.match(game,/if\(!practiceMode \|\| practiceUndoUsed>=PRACTICE_UNDO_LIMIT \|\| escaping\.size/);
  assert.match(game,/if\(practiceMode\)\{\s*showPracticeSummary\(\);\s*return;\/\/ No bestScores/);
  assert.match(game,/if \(!practiceMode\) \{\s*progress\.lastLevel = currentLevel;\s*persist\(\);/);
  assert.match(game,/if \(practiceMode\) practiceBlockedChecks\+\+;\s*else hearts--;/);
  assert.match(game,/if\(practiceMode\) practiceHints\+\+;\s*else hintsUsed\+\+;/);
});
