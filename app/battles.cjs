const { EventEmitter } = require('node:events');
const userId = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Only lifecycle information for records, messages and replay uploads is retained.
class Battles extends EventEmitter {
  constructor() { super(); this.rooms = new Map(); }
  reset() { this.rooms.clear(); this.emit('change'); }
  receive(data) {
    if (typeof data !== 'string' || data.length > 8 * 1024 * 1024) return;
    let room;
    const touched = new Set();
    for (const line of data.split('\n')) {
      if (line.startsWith('>')) {
        const id = line.slice(1).trim();
        room = this.rooms.get(id);
        if (!room && /^battle-[a-z0-9-]+$/.test(id)) {
          if (this.rooms.size >= 30) {
            const finished = [...this.rooms].find(([, value]) => value.ended);
            if (finished) this.rooms.delete(finished[0]);
          }
          if (this.rooms.size < 30) {
            room = { id, title: id, players: {}, playerSide: null, playerName: null, started: false, turn: 0, ended: false, status: 'Waiting for battle' };
            this.rooms.set(id, room);
          }
        }
        continue;
      }
      if (!room || !line.startsWith('|')) continue;
      const [, type, value, name] = line.split('|');
      if (!['init','title','player','start','turn','request','sentchoice','win','tie','deinit'].includes(type)) continue;
      touched.add(room);
      if (type === 'init') Object.assign(room, { players: {}, playerSide: null, playerName: null, started: false, turn: 0, ended: false, finishReason: null, outcome: null, status: 'Waiting for battle' });
      if (type === 'title') room.title = line.slice(7);
      if (type === 'player' && ['p1','p2'].includes(value)) {
        room.players[value] = name;
        if (value === room.playerSide) room.playerName = name;
      }
      if (type === 'start') room.started = true;
      if (type === 'turn') { room.turn = Number(value) || 0; room.status = 'Battle in progress'; }
      if (type === 'request') {
        try {
          const request = JSON.parse(line.slice(9));
          if (['p1','p2'].includes(request?.side?.id)) {
            room.playerSide = request.side.id;
            room.playerName = room.players[room.playerSide] || request.side.name;
          }
          room.status = request?.wait ? 'Waiting for opponent' : 'Your turn';
        } catch { /* An empty request carries no lifecycle information. */ }
      }
      if (type === 'sentchoice') room.status = 'Waiting for opponent';
      if (type === 'win') {
        room.finishReason = 'win';
        room.outcome = room.playerName ? (userId(line.slice(5)) === userId(room.playerName) ? 'win' : 'loss') : null;
      }
      if (type === 'tie') { room.finishReason = 'tie'; room.outcome = 'tie'; }
      if (type === 'deinit' && !room.finishReason) room.finishReason = 'deinit';
      if (['win','tie','deinit'].includes(type)) { room.ended = true; room.status = 'Battle finished'; }
    }
    for (const item of touched) this.emit('room', item);
    this.emit('change');
  }
  sent(roomId, command) {
    const room = this.rooms.get(roomId);
    if (!room || typeof command !== 'string') return;
    if (/^\/(?:choose|move|switch|team)(?: |$)/.test(command)) room.status = 'Waiting for opponent';
    if (/^\/undo(?:\||$)/.test(command)) room.status = 'Your turn';
    if (/^\/leavebattle(?:\||$)/.test(command)) { room.playerSide = null; room.playerName = null; }
    if (/^\/leave(?:battle)?(?:\||$)/.test(command)) { room.ended = true; room.status = 'Battle left'; }
    this.emit('change');
  }
}
module.exports = { Battles };
