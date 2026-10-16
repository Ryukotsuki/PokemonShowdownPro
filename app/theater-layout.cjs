const defaults=Object.freeze({width:360,chatShare:0.56,chatCollapsed:false,calcCollapsed:false});
function normalize(value={}) {
 if(!value||typeof value!=='object'||Array.isArray(value))value={};
 return {width:Number.isFinite(value.width)?Math.round(Math.max(260,Math.min(640,value.width))):defaults.width,
  chatShare:Number.isFinite(value.chatShare)?Math.max(0.25,Math.min(0.75,value.chatShare)):defaults.chatShare,
  chatCollapsed:value.chatCollapsed===true,calcCollapsed:value.calcCollapsed===true};
}
function valid(value){return !!value&&typeof value==='object'&&Object.keys(value).length===4&&Object.keys(defaults).every(key=>value[key]===normalize(value)[key]);}
module.exports={defaults,normalize,valid};
