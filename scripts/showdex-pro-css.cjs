const path=require('node:path');
const {createRequire}=require('node:module');
const fromShowdex=createRequire(path.join(process.env.SHOWDOWN_PRO_SHOWDEX_SOURCE||path.resolve(__dirname,'../vendor/showdex'),'package.json'));
const postcss=fromShowdex('postcss');
const scope=':global(html.showdex-pro)';

function recolor(value, property) {
  // URLs (including inline SVGs) and semantic hues are left intact.
  return value.replace(/url\([^)]*\)|#[\da-f]{3,8}\b|rgba?\([^)]*\)/gi, token=>{
    if(token.startsWith('url'))return token;
    let rgb,alpha=1;
    if(token[0]==='#') {
      let hex=token.slice(1);if(hex.length===3||hex.length===4)hex=[...hex].map(c=>c+c).join('');
      if(![6,8].includes(hex.length))return token;
      rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));if(hex.length===8)alpha=parseInt(hex.slice(6),16)/255;
    } else {
      const parts=token.match(/[\d.]+%?/g);if(!parts||parts.length<3)return token;
      rgb=parts.slice(0,3).map(v=>v.endsWith('%')?parseFloat(v)*2.55:+v);
      if(parts[3])alpha=parts[3].endsWith('%')?parseFloat(parts[3])/100:+parts[3];
    }
    const [r,g,b]=rgb,neutral=Math.max(...rgb)-Math.min(...rgb)<12;
    const accent=b>150&&r<100&&g>90&&g<b;
    if(!neutral&&!accent)return token;
    let color;
    if(property.includes('shadow')) color=neutral&&r<100?[0,0,0]:[130,197,230];
    else if(accent)color=[122,201,239];
    else if(/border|outline|stroke/.test(property))color=[78,120,145];
    else if(property.startsWith('background'))color=r<40?[16,37,54]:[28,57,77];
    else color=r>210||r<65?[234,245,251]:[169,199,217];
    return alpha===1?`rgb(${color.join(', ')})`:`rgba(${color.join(', ')}, ${+alpha.toFixed(4)})`;
  });
}
function transform(source,file) {
  if(/\/(PokeType|PokeStatus|PokeHpBar|MoveCategoryField)\//.test(file))return source;
  const css=postcss.parse(source), originals=[];
  css.walkRules(rule=>originals.push(rule));
  for(const rule of originals) {
    let parent=rule.parent,inKeyframes=false;
    while(parent){if(parent.type==='atrule'&&/keyframes/i.test(parent.name))inKeyframes=true;parent=parent.parent;}
    if(inKeyframes)continue;
    const declarations=[];
    rule.each(node=>{
      if(node.type!=='decl'||!/(color|background|border|shadow|outline|fill|stroke)/.test(node.prop))return;
      const value=recolor(node.value,node.prop);
      // A background shorthand resets clip/position/size. Carry its longhands
      // and state overrides too, so gradient text and artwork keep rendering.
      if(value!==node.value||node.prop.startsWith('background'))declarations.push(node.clone({value,important:true}));
    });
    if(declarations.length)rule.parent.append(rule.clone({selector:rule.selectors.map(s=>`${scope} ${s}`).join(', '),nodes:declarations}));
  }
  const extra=(selector,body)=>css.append(postcss.parse(`${selector.split(',').map(s=>scope+' '+s.trim()).join(',')} {${body}}`).nodes);
  if(file.endsWith('/PageContainer/PageContainer.module.scss')) {
    extra('.container','color:#eaf5fb!important;');
    extra('.container::before','background:linear-gradient(145deg,#1c384c,#102332 75%)!important;');
  }
  if(file.endsWith('/Hellodex/Hellodex.module.scss')) {
    extra('.instancesContent','background:#173144!important;border-color:#426a83!important;box-shadow:inset 0 1px #ffffff12!important;');
    extra('.footer','background:#0d2233ed!important;border-top-color:#426a83!important;');
  }
  if(file.endsWith('/SettingsPane/SettingsPane.module.scss')) {
    extra('.container','background:#152e40!important;');
    extra('.header','background:#203f55!important;border-color:#496e87!important;');
    extra('.settingsGroup','border-color:#426a83!important;');
  }
  if(/\/(Button|ToggleButton)\/\1.module.scss$/.test(file)) {
    extra('.container','color:#dceffa!important;background:linear-gradient(#315f79,#22475e)!important;box-shadow:inset 0 0 0 1px #6596b1!important;');
    extra('.container:hover','background:linear-gradient(#407fa0,#2b5c78)!important;color:#fff!important;');
    extra('.container:focus-visible','outline:2px solid #9bd8f4!important;outline-offset:2px!important;');
    extra('.container:active','background:#1b3f56!important;');
    extra('.container:disabled, .container.disabled','background:#203746!important;');
    if(file.includes('/ToggleButton/'))extra('button.container.primary.active.dark','background:#39789b!important;color:#fff!important;box-shadow:inset 0 0 0 1px #8dd6f6!important;');
    if(file.includes('/Button/')) {
      // absoluteHover originally painted outside a text-sized hit box. Pro
      // paints the button itself, so reserve real space around its label.
      extra('.container','box-sizing:border-box!important;min-height:14px!important;padding:1px 4px!important;font-size:max(10px,1em)!important;line-height:12px!important;border-radius:4px!important;');
      extra('.container .label','margin:0!important;line-height:inherit!important;');
      extra('.container.absoluteHover::before','inset:0!important;');
      extra('.container.disabled','opacity:.5;');
    }
  }
  if(file.endsWith('/TextField/TextField.module.scss')) extra('.container','background:#102a3c!important;box-shadow:inset 0 0 0 1px #527e97!important;color:#eaf5fb!important;');
  if(file.endsWith('/Dropdown/Dropdown.module.scss')) {
    extra('.control','background:#18384d!important;box-shadow:inset 0 0 0 1px #527e97!important;border-radius:5px!important;box-sizing:border-box!important;min-height:18px!important;padding:2px 5px!important;');
    extra('.valueContainer','min-width:0!important;');
    extra('.singleValue, .placeholder, .input','font-size:10px!important;line-height:14px!important;');
    extra('.control:focus-within','outline:2px solid #9bd8f4!important;outline-offset:1px!important;');
    extra('.menu','background:#173144!important;border-color:#527e97!important;');
  }
  if(file.endsWith('/PokeMoves/PokeMoves.module.scss')) {
    extra('.container','row-gap:3px!important;padding:6px 10px 6px!important;');
    extra('button.damageButton','padding:1px 3px!important;max-width:100%!important;');
    extra('.damageButtonLabel','font-size:10px!important;line-height:12px!important;white-space:normal!important;');
    extra('.dmgHeader, .movesHeader','flex-wrap:wrap!important;row-gap:2px!important;');
  }
  if(file.endsWith('/PokeStats/PokeStats.module.scss')) {
    extra('.stageValue','display:grid!important;grid-template-columns:minmax(0,1fr) minmax(12px,1fr) minmax(0,1fr)!important;gap:1px!important;width:100%!important;');
    extra('.stageValue > button','min-width:0!important;width:100%!important;min-height:16px!important;padding:1px 0!important;margin:0!important;line-height:14px!important;font-size:10px!important;border-radius:4px!important;');
    extra('.boostButton.disabled.empty','opacity:.65!important;');
  }
  if(file.endsWith('/PokeInfo/PokeInfo.module.scss')) {
    extra('.dropdownLabel','flex-wrap:wrap!important;gap:3px!important;');
    extra('.dropdownLabel button.toggleButton','padding:1px 3px!important;margin-left:3px!important;');
    extra('.presetContainer','min-width:0!important;');
    extra('.presetHeader, .presetHeaderPart','flex-wrap:wrap!important;gap:2px!important;');
    extra('.presetHeaderRight','padding-right:0!important;');
    extra('.presetHeaderAction','height:auto!important;min-height:14px!important;flex-wrap:wrap!important;gap:2px!important;');
  }
  if(file.endsWith('/PokeCalc/PokeCalc.module.scss')) {
    extra('.tablesContainer','margin-top:4px!important;');
    extra('.stats','margin-top:6px!important;');
    extra('.thicc .stats','margin-top:0!important;');
  }
  if(file.endsWith('/Calcdex/Calcdex.module.scss')) {
    extra('.container.verySmol .content','padding-top:8px!important;');
    extra('.playerCalc','margin-top:8px!important;');
    extra('.fieldCalc','margin-top:6px!important;');
    extra('.opponentCalc','margin-top:6px!important;');
  }
  if(file.endsWith('/PlayerInfo/PlayerInfo.module.scss'))extra('.playerActions','flex-wrap:wrap!important;gap:4px!important;');
  if(file.endsWith('/Notedex/Notedex.module.scss'))extra('.noteActions','flex-wrap:wrap!important;gap:6px!important;');
  return css.toString();
}
module.exports=function(source){return transform(source,this.resourcePath.replace(/\\/g,'/'));};
module.exports.transform=transform;
module.exports.recolor=recolor;
