const addons = [
  {key:'enhancedTooltips', name:'Enhanced Tooltips', description:'Type effectiveness, move details and base stats.', options:'pro-settings.html'},
  {key:'randbatsTooltip', name:'Randbats Tooltip', description:'Possible Random Battle sets and their probabilities.'},
  {key:'threeIsland', name:'Three Island', description:'Preview PokéPaste links and import teams.', options:'popup/popup.html'},
  {key:'didItTera', name:'Did it Tera?', description:'Remember which Pokémon Terastallized.', options:'options.html'},
  {key:'battleHistory', name:'Battle History', description:'Save battles, ratings, teams and statistics.', options:'stats.html?fetchData=true'},
  {key:'pokepasteExporter', name:'PokePaste Exporter', description:'View an opponent’s open team sheet on PokéPaste.'},
];
const addonDefaults = Object.fromEntries(addons.map(addon=>[addon.key,true]));
module.exports={addons,addonDefaults};
