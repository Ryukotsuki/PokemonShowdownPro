const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { emptyRecord, loadRecord, saveRecord, recordBattle } = require('../app/win-loss.cjs');

test('win/loss totals persist while session totals reset and duplicate battles do not count twice', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'showdown-pro-record-'));
  try {
    const file = path.join(dir, 'battle-stats.json');
    const record = loadRecord(file);
    const session = emptyRecord();
    const win = { id: 'battle-gen9randombattle-123', playerSide: 'p1', outcome: 'win' };
    assert.equal(recordBattle(record, session, win), true);
    assert.equal(recordBattle(record, session, win), false);
    assert.equal(recordBattle(record, session, { id: 'battle-gen9randombattle-456', playerSide: 'p2', outcome: 'loss' }), true);
    assert.equal(recordBattle(record, session, { id: 'battle-gen9randombattle-789', playerSide: 'p1', outcome: 'tie' }), true);
    assert.equal(recordBattle(record, session, { id: 'battle-gen9randombattle-999', outcome: 'win' }), false);
    assert.deepEqual(session, { wins: 1, losses: 1, ties: 1 });
    saveRecord(file, record);
    const reloaded = loadRecord(file);
    const nextSession = emptyRecord();
    assert.deepEqual(reloaded.allTime, { wins: 1, losses: 1, ties: 1 });
    assert.equal(recordBattle(reloaded, nextSession, win), false);
    assert.deepEqual(nextSession, { wins: 0, losses: 0, ties: 0 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
