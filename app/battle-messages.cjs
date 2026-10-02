const { validMessages } = require('./preferences.cjs');

class BattleMessages {
  constructor({send,onStatus=()=>{}}) { this.send=send; this.onStatus=onStatus; this.jobs=new Map(); }
  process(room, settings) {
    if (!validMessages(settings) || !room.playerSide) return Promise.resolve();
    const phase=room.ended ? 'end' : 'start';
    if (phase==='end' && !['win','tie'].includes(room.finishReason)) return Promise.resolve();
    // Rejoining an ongoing match must not send a late greeting.
    if (phase==='start' && (!room.started || room.turn>1)) return Promise.resolve();
    if (!settings[phase+'Enabled']) return Promise.resolve();
    const key=room.id+':'+phase;
    if (this.jobs.has(key)) return this.jobs.get(key);
    const text=settings[phase+'Text'].trim();
    const job=Promise.resolve().then(()=>this.send({roomId:room.id,phase,text})).then(result=>{
      this.onStatus(`${room.title || room.id}: ${phase==='start' ? 'Start' : 'End'} message ${result?.sent ? 'sent' : 'skipped: '+(result?.error || 'Battle unavailable')}`);
      return result;
    }).catch(error=>{this.onStatus(`${room.title || room.id}: Message skipped: ${error.message}`);});
    // Keep claims even on failure: a send may succeed before its IPC reply is
    // lost. A reconnect must never repeat chat or replay historical greetings.
    this.jobs.set(key,job);
    if(this.jobs.size>400) this.jobs.delete(this.jobs.keys().next().value);
    return job;
  }
}
module.exports={BattleMessages};
