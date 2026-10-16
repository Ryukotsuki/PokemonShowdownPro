// Stable semantic hooks added before CSS Modules, without editing upstream.
function transform(source,file){
 const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('Showdex Theater patch anchor changed: '+file+': '+before);source=source.replace(before,after);};
 const roots={'PlayerCalc':'player','PokeCalc':'pokemon','PokeInfo':'info'};
 for(const [name,role] of Object.entries(roots))if(file.endsWith('/'+name+'/'+name+'.tsx'))replace('  return (\n    <div','  return (\n    <div data-pro-calc="'+role+'"');
 if(file.endsWith('/PlayerCalc/PlayerCalc.tsx'))replace('<div className={styles.playerBar}>','<div data-pro-calc="player-header" className={styles.playerBar}>');
 if(file.endsWith('/PokeCalc/PokeCalc.tsx'))replace('<div className={styles.tablesContainer}>','<div data-pro-calc="tables" className={styles.tablesContainer}>');
 if(file.endsWith('/PokeInfo/PokeInfo.tsx')){
  replace('<div className={styles.presetContainer}>','<div data-pro-calc="presets" className={styles.presetContainer}>');
  source=source.replaceAll('<div className={styles.row}>','<div data-pro-calc-section="info-row" className={styles.row}>');
 }
 for(const [name,role] of [['PokeMoves','moves'],['PokeStats','stats'],['FieldCalc','field']])if(file.endsWith('/'+name+'/'+name+'.tsx'))replace('    <TableGrid\n','    <TableGrid data-pro-calc="'+role+'"\n');
 if(file.endsWith('/PokeStats/PokeStats.tsx'))replace('            onPress={() => updatePokemon({\n              showGenetics: !pokemon.showGenetics,','            data-pro-calc-genetics={pokemon.showGenetics ? "shown" : "hidden"}\n            data-pro-calc-pokemon={pokemon.calcdexId || pokemon.speciesForme}\n            onPress={() => updatePokemon({\n              showGenetics: !pokemon.showGenetics,');
 if(file.endsWith('/TableGrid/TableGrid.tsx')){
  replace('  children?: React.ReactNode;','  children?: React.ReactNode;\n  \'data-pro-calc\'?: string;');
  replace('  children,','  children,\n  \'data-pro-calc\': proCalc,');
  replace('  <div\n','  <div data-pro-calc={proCalc}\n');
 }
 if(file.endsWith('/Calcdex/CalcdexPreactBattlePanel.ts'))replace('    if (overlayVisible) {',`    if (overlayVisible && (window as unknown as { __showdownProTheater?: { active?: string } }).__showdownProTheater?.active !== this.battle?.id) {`);
 if(file.endsWith('/Calcdex/Calcdex.tsx')){
  replace('className={styles.overlayCloseButton}','data-pro-calc="overlay-close" className={styles.overlayCloseButton}');
  replace('className={cx(styles.mobileCloseButton, styles.top)}','data-pro-calc="overlay-close" className={cx(styles.mobileCloseButton, styles.top)}');
  replace('className={cx(styles.mobileCloseButton, styles.bottom)}','data-pro-calc="overlay-close" className={cx(styles.mobileCloseButton, styles.bottom)}');
 }
 if(file.endsWith('/Calcdex/CalcdexClassicBootstrapper.ts'))replace('const $rootContainer = $(`<div class="${styles.overlayContainer}"></div>`);','const $rootContainer = $(`<div data-calcdex="overlay" class="${styles.overlayContainer}"></div>`);');
 if(file.endsWith('/Bootdex/BootdexManager.ts'))source+=`\n// Narrow integration points for Pro's layout; keep native calculator state.\n(window as unknown as { __showdownProCalcdex: unknown }).__showdownProCalcdex = {\n  open: (battleId: string) => { BootdexManager.runCalcdex(battleId); BootdexManager.openCalcdex(battleId); },\n  snapshot: (battleId: string) => BootdexAdapter.rootState?.calcdex?.[battleId]?.overlayVisible ?? false,\n  restore: (battleId: string, overlayVisible: boolean) => {\n    if (typeof overlayVisible !== 'boolean') return;\n    const room = window.app?.rooms?.[battleId] as Showdown.ClientBattleRoom;\n    const overlay = document.getElementById('room-' + battleId)?.querySelector('[data-calcdex="overlay"]');\n    if (room && overlay && BootdexAdapter.rootState?.calcdex?.[battleId]?.overlayVisible !== overlayVisible && typeof room.toggleCalcdexOverlay === 'function') room.toggleCalcdexOverlay();\n    else BootdexAdapter.store.dispatch({type:'calcdex/update',payload:{battleId,overlayVisible}});\n    window.PS?.rooms?.[battleId]?.update(null);\n  },\n};\n`;
 return source;
}
module.exports={transform};
