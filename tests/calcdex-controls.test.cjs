const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const source = require('../scripts/showdex-pro-source.cjs');
const file = '/redux/store/calcdexSlice.ts';
const patched = source.transform(fs.readFileSync(path.join(__dirname, '../vendor/showdex/src' + file), 'utf8').replace(/\r\n/g, '\n'), file);
const start = patched.indexOf('.addCase(syncBattle.fulfilled, (state, action) => {');
const end = patched.indexOf('    })', start);
const body = patched.slice(patched.indexOf('{', start) + 1, end);
const reduce = new Function('state', 'action', 'l', 'SyncBattleActionType', '__DEV__', 'current', body);
function finishSync(state, payload) {
  reduce(state, { payload }, { debug() {} }, 'syncBattle', false, x => x);
}
test('an asynchronous battle sync preserves opening or closing an overlay after the sync began', () => {
  for (const visible of [true, false]) {
    const state = { battle: { battleId: 'battle', overlayVisible: visible, turn: 1 } };
    finishSync(state, { battleId: 'battle', overlayVisible: !visible, turn: 2 });
    assert.equal(state.battle.overlayVisible, visible);
    assert.equal(state.battle.turn, 2);
  }
});
test('a pending sync cannot recreate a calculator destroyed while it was running', () => {
  const state = {};
  finishSync(state, { battleId: 'battle', overlayVisible: false, turn: 2 });
  assert.deepEqual(state, {});
});
test('battle controls patches match both pinned client adapters and reject changed anchors', () => {
  for (const name of ['CalcdexClassicBootstrapper', 'CalcdexPreactBattle', 'CalcdexPreactBootstrapper', 'CalcdexPreactBattlePanel']) {
    const file = '/pages/Calcdex/' + name + '.ts';
    const original = fs.readFileSync(path.join(__dirname, '../vendor/showdex/src' + file), 'utf8').replace(/\r\n/g, '\n');
    assert.notEqual(source.transform(original, file), original);
    assert.throws(() => source.transform('changed upstream', file), /anchor changed/);
  }
});
