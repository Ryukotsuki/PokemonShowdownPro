const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {contained}=require('./addon-updates.cjs');
const extensionIds={enhancedTooltips:'aggbolenhnpdhgcfpknifdiheppbmblb',randbatsTooltip:'cheogdcgfjpolnpnjijnjccjljjclplg',threeIsland:'glhggmffomgbggeobkijjhojkjopfpho',didItTera:'afcoljllhjapfffjlfjjmcbfhhoignpo',battleHistory:'jaopbejgoiaokcpnpjbmoegpomgocaph',pokepasteExporter:'eehioifimidcjcdlaehajhdeaekmmdne'};
function crxZip(data) {
  if(data.length<16||data.toString('ascii',0,4)!=='Cr24')throw new Error('Invalid extension package');
  const version=data.readUInt32LE(4),offset=version===3?12+data.readUInt32LE(8):version===2?16+data.readUInt32LE(8)+data.readUInt32LE(12):0;
  if(!offset||offset>data.length-4||data.readUInt32LE(offset)!==0x04034b50)throw new Error('Invalid extension archive');
  return data.subarray(offset);
}
function validateZip(data) {
  let end=-1;
  for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(data.readUInt32LE(i)===0x06054b50&&i+22+data.readUInt16LE(i+20)===data.length){end=i;break;}
  if(end<0||data.readUInt16LE(end+4)||data.readUInt16LE(end+6))throw new Error('Invalid ZIP directory');
  const entries=data.readUInt16LE(end+10),size=data.readUInt32LE(end+12),start=data.readUInt32LE(end+16);
  if(!entries||entries===65535||entries!==data.readUInt16LE(end+8)||start+size!==end)throw new Error('Unsupported ZIP directory');
  let offset=start,total=0;
  for(let i=0;i<entries;i++) {
    if(offset+46>end||data.readUInt32LE(offset)!==0x02014b50)throw new Error('Invalid ZIP entry');
    const nameLength=data.readUInt16LE(offset+28),extraLength=data.readUInt16LE(offset+30),commentLength=data.readUInt16LE(offset+32);
    const name=data.toString('utf8',offset+46,offset+46+nameLength),mode=data.readUInt32LE(offset+38)>>>16;
    if(!name||name.startsWith('/')||name.includes('\\')||name.split('/').some(part=>part&&(/^(?:\.|\.\.)$/.test(part)||/[<>:"|?*\x00-\x1f]|[. ]$/.test(part)))||(mode&0xf000)===0xa000||data.readUInt16LE(offset+8)&1)throw new Error('Unsafe ZIP entry');
    total+=data.readUInt32LE(offset+24);if(total>256*1024*1024)throw new Error('Update archive is too large');
    offset+=46+nameLength+extraLength+commentLength;
  }
  if(offset!==end)throw new Error('Invalid ZIP directory length');
}
async function download(url,maxBytes=32*1024*1024) {
  const response=await fetch(url,{headers:{'User-Agent':'Pokemon-Showdown-Pro'},signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error('Download returned HTTP '+response.status);
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes)throw new Error('Update download is too large');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
async function unpack(data,directory) {
  validateZip(data);fs.mkdirSync(directory,{recursive:true});
  const archive=directory+'.zip';fs.writeFileSync(archive,data);
  try{const {extract}=await import('@electron-internal/extract-zip');await extract(archive,{dir:path.resolve(directory)});}finally{fs.rmSync(archive,{force:true});}
}
function extensionUrl(key,chromeVersion=process.versions.chrome||'144.0.0.0') {
  if(!extensionIds[key])throw new Error('Unknown extension');
  const url=new URL('https://clients2.google.com/service/update2/crx');
  url.search=new URLSearchParams({response:'redirect',prodversion:chromeVersion,acceptformat:'crx2,crx3',x:`id=${extensionIds[key]}&installsource=ondemand&uc`});return url.href;
}
function removeStage(stage,relative) {fs.rmSync(contained(stage,relative),{recursive:true,force:true});}
const sha256=data=>crypto.createHash('sha256').update(data).digest('hex');
module.exports={extensionIds,crxZip,validateZip,download,unpack,extensionUrl,removeStage,sha256};
