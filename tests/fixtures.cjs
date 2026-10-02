function request(rqid = 1) {
  return {
    rqid,
    active: [{ moves: [
      { move: 'Flamethrower', id: 'flamethrower', pp: 24, maxpp: 24, target: 'normal', disabled: false },
      { move: 'Air Slash', id: 'airslash', pp: 24, maxpp: 24, target: 'any', disabled: false },
      { move: 'Roost', id: 'roost', pp: 8, maxpp: 8, target: 'self', disabled: false },
      { move: 'Dragon Pulse', id: 'dragonpulse', pp: 16, maxpp: 16, target: 'any', disabled: false },
    ], canTerastallize: 'Fire' }],
    side: { name: 'ProTest', id: 'p1', pokemon: [
      { ident: 'p1: Charizard', details: 'Charizard, L80, M', condition: '250/250', active: true, stats: { atk: 170, def: 160, spa: 220, spd: 180, spe: 200 }, moves: ['flamethrower', 'airslash', 'roost', 'dragonpulse'], baseAbility: 'blaze', ability: 'blaze', item: 'heavydutyboots', pokeball: 'pokeball', teraType: 'Fire', terastallized: '' },
      { ident: 'p1: Snorlax', details: 'Snorlax, L80, M', condition: '350/350', active: false, stats: { atk: 210, def: 130, spa: 120, spd: 210, spe: 80 }, moves: ['bodyslam', 'earthquake', 'rest', 'sleeptalk'], baseAbility: 'thickfat', ability: 'thickfat', item: 'leftovers', pokeball: 'pokeball', teraType: 'Normal', terastallized: '' },
    ] },
  };
}
function history(req = request()) {
  return ['|init|battle', '|title|ProTest vs. Opponent', '|gametype|singles', '|player|p1|ProTest|1', '|player|p2|Opponent|2', '|teamsize|p1|2', '|teamsize|p2|6', '|gen|9', '|tier|[Gen 9] Random Battle', '|rule|Species Clause: Limit one of each Pokémon', '|start', '|switch|p1a: Charizard|Charizard, L80, M|250/250', '|switch|p2a: Blastoise|Blastoise, L84, M|100/100', '|turn|1', '|request|' + JSON.stringify(req)];
}
module.exports = { request, history };

