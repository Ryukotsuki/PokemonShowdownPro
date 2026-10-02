const fs = require('node:fs');
const path = require('node:path');

const emptyRecord = () => ({ wins: 0, losses: 0, ties: 0 });
const validCount = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

function loadRecord(file) {
  let saved;
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { saved = {}; }
  const source = saved && typeof saved === 'object' ? saved : {};
  return {
    allTime: {
      wins: validCount(source.allTime?.wins),
      losses: validCount(source.allTime?.losses),
      ties: validCount(source.allTime?.ties),
    },
    countedBattleIds: Array.isArray(source.countedBattleIds) ? source.countedBattleIds.filter(id => typeof id === 'string' && /^battle-[a-z0-9-]+$/.test(id)) : [],
  };
}

function saveRecord(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
}

function recordBattle(record, session, room) {
  if (!room?.playerSide || !/^battle-[a-z0-9-]+$/.test(room.id) || !['win', 'loss', 'tie'].includes(room.outcome)) return false;
  if (record.countedBattleIds.includes(room.id)) return false;
  const field = room.outcome === 'win' ? 'wins' : room.outcome === 'loss' ? 'losses' : 'ties';
  record.allTime[field]++;
  session[field]++;
  record.countedBattleIds.push(room.id);
  return true;
}

module.exports = { emptyRecord, loadRecord, saveRecord, recordBattle };
