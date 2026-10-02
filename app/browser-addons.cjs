const fs=require('node:fs');
const path=require('node:path');
const {addons}=require('./addon-catalog.cjs');
const settingsPages = {
  enhancedTooltips: {source:'enhanced-settings',html:'pro-settings.html',js:'pro-settings.js'},
  threeIsland: {source:'three-island-settings',html:'popup/popup.html',js:'popup/popup.js'},
  didItTera: {source:'tera-settings',html:'options.html',js:'scripts/options.js'},
};

class BrowserAddons {
  constructor(root,session,onChange=()=>{},locations={}) {this.root=root;this.sourceRoot=locations.sourceRoot||path.join(root,'vendor/browser-addons');this.buildRoot=locations.buildRoot||path.join(root,'build/browser-addons');this.session=session;this.onChange=onChange;this.active=new Map();this.errors=new Map();}
  prepare(key,settings) {
    if(!addons.some(addon=>addon.key===key))throw new Error('Unknown add-on');
    const source=path.join(this.sourceRoot,key),target=path.resolve(this.buildRoot,key);
    if(!target.startsWith(path.resolve(this.buildRoot)+path.sep))throw new Error('Invalid add-on build path');
    fs.rmSync(target,{recursive:true,force:true});
    fs.cpSync(source,target,{recursive:true,filter:file=>!file.split(path.sep).includes('_metadata')});
    const manifestFile=path.join(target,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    delete manifest.update_url;
    if(key==='threeIsland') {
      manifest.host_permissions=[...new Set([...(manifest.host_permissions||[]),'*://crob.at/*'])];
      manifest.permissions=manifest.permissions.filter(permission=>!permission.includes('://'));
    }
    if(key==='threeIsland' || key==='didItTera') {
      // Electron has local extension storage, but no Chrome account sync.
      const patch=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})) {const file=path.join(dir,item.name);if(item.isDirectory())patch(file);else if(item.name.endsWith('.js'))fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('chrome.storage.sync','chrome.storage.local'));}};
      patch(target);
    }
    if(key==='threeIsland') {
      const file=path.join(target,'syringe.js');
      fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('entries.reduce((a, b) => ({ ...a, ...b }), {})',"entries.reduce((a, b) => ({ ...a, ...b }), {enabled:'1','show-item':'1','show-tera':'1','import-code':'1'})"));
      const script=path.join(target,'three-island.js');
      let code=fs.readFileSync(script,'utf8')
        .replace("node.getAttribute('data-roomid').replace('dm-', '')","(node.getAttribute('data-roomid') || '').replace('dm-', '')")
        .replace("if (!msg.classList.contains('chat')) return;","if (!msg.classList?.contains('chat')) return;")
        .replace("if (!ftd) return;","if (!ftd || ftd.classList?.contains('threeisland-link')) return;");
      const start=code.indexOf('function watchRoom(node, spc) {'),end=code.indexOf('Object.entries(IS_REWRITE_CLIENT',start);
      // Preact renders the battle log after its room container. Watch that
      // container, rather than relying on the old client's child positions.
      code=code.slice(0,start)+`function watchRoom(node, spc) {
        const scan=element=>{if(element.nodeType!==1)return;checkMessageElement(element);for(const msg of element.querySelectorAll('.chat'))checkMessageElement(msg);};
        const observerW=new MutationObserver(mutations=>{for(const mutation of mutations)for(const element of mutation.addedNodes)scan(element);});
        if(node){scan(node);observerW.observe(node,{childList:true,subtree:true});}
        return observerW;
      }
      `+code.slice(end);
      code=code.replace("{ childList: true },","{ childList: true, subtree: true },");
      if (!code.includes('tooltipInner.appendChild(data.pasteHTML.cloneNode(true));') || !code.includes('ftd.appendChild(tooltip);') || !code.includes('addCSS(CSS);')) throw new Error('Three Island has an unsupported preview renderer.');
      code=code
        .replace('tooltipInner.appendChild(data.pasteHTML.cloneNode(true));', 'tooltipInner.appendChild(data.pasteHTML.cloneNode(true)); for (const set of tooltipInner.querySelectorAll(".threeisland-set")) window.__showdownProPastePreview(set, set.querySelector(".threeisland-tooltip"), true);')
        .replace('ftd.appendChild(tooltip);', 'ftd.appendChild(tooltip); window.__showdownProPastePreview(ftd, tooltip);')
        .replace("button.appendChild(document.createTextNode('Import'));", "button.type = 'button'; button.classList.add('button'); button.appendChild(document.createTextNode('Import'));")
        .replace('addCSS(CSS);', 'addCSS(CSS + '+JSON.stringify('\n'+fs.readFileSync(path.join(this.root,'app/addons/paste-previews.css'),'utf8'))+');');
      code=fs.readFileSync(path.join(this.root,'app/addons/paste-previews.js'),'utf8')+'\n'+code;
      fs.writeFileSync(script,code);
    }
    if(key==='enhancedTooltips') {
      manifest.permissions=manifest.permissions.filter(permission=>permission!=='contextMenus');
      const background=path.join(target,'js/settingsMenu.js'),code=fs.readFileSync(background,'utf8');
      fs.writeFileSync(background,code.slice(code.indexOf('chrome.runtime.onMessage.addListener')));
      manifest.options_ui={page:'pro-settings.html',open_in_tab:true};
      const tooltip=path.join(target,'js/showPokemonTooltip.js');
      const original=fs.readFileSync(tooltip,'utf8'),start=original.indexOf('ShowdownEnhancedTooltip.getStatbarHTML = function'),end=original.indexOf('ShowdownEnhancedTooltip.showPokemonTooltip = function',start);
      if(start<0 || end<0)throw new Error('Enhanced Tooltips has an unsupported HP bar renderer.');
      // Keep the native front/back and slot classes, badges and Tera icon.
      // The add-on only needs to make the already-rendered name clickable.
      fs.writeFileSync(tooltip,original.slice(0,start)+`const showdownProNativeStatbar = PokemonSprite.prototype.getStatbarHTML;
ShowdownEnhancedTooltip.getStatbarHTML = function(pokemon) {
  const html=showdownProNativeStatbar.call(this,pokemon);
  const species=encodeURIComponent(pokemon.speciesForme || pokemon.name);
  return html.replace(/(<strong>)([^<]*)/,(_,tag,name)=>tag+'<a href="https://www.smogon.com/dex/ss/pokemon/'+species+'/" target="_blank" rel="noopener" style="color: inherit; text-decoration: none;">'+name+'</a>');
};

`+original.slice(end));
      fs.appendFileSync(tooltip,"\ndocument.documentElement.setAttribute('data-showdown-pro-enhanced','ready');\n");
    }
    if(key==='randbatsTooltip') {
      // Randbats wraps the existing tooltip. Enhanced Tooltips replaces it, so
      // the wrapper must install second when both are enabled.
      fs.writeFileSync(path.join(target,'shim.js'),`(()=>{let attempts=0;function install(){if(${!!settings.enhancedTooltips} && !document.documentElement.hasAttribute('data-showdown-pro-enhanced') && attempts++<100){setTimeout(install,100);return;}const script=document.createElement('script');script.src=chrome.runtime.getURL('/index.js');document.body.appendChild(script);}install();})();`);
      const tooltip=path.join(target,'index.js');
      fs.writeFileSync(tooltip,fs.readFileSync(tooltip,'utf8').replace('<div style="border-top: 1px solid #888; background: #dedede">','<div class="showdown-pro-randbats-sets" style="border-top: 1px solid #888; background: #dedede">'));
    }
    if(key==='didItTera') {
      const file=path.join(target,'scripts/content.js');
      fs.writeFileSync(file,fs.readFileSync(file,'utf8')
        .replace("ditTextColor: '#000000'","ditTextColor: ''")
        .replaceAll('options.ditShowNicknames);','options.ditShowNicknames, room);')
        .replace("el.classList.contains('ps-room-opaque')","el.matches('[id^=\"room-battle-\"]')")
        .replace("document.getElementsByClassName('ps-room-opaque')","document.querySelectorAll('[id^=\"room-battle-\"]')")
        +'\n'+fs.readFileSync(path.join(this.root,'app/addons/tera-reminder.js'),'utf8'));
      fs.copyFileSync(path.join(this.root,'app/addons/tera-reminder.css'),path.join(target,'pro-tera-reminder.css'));
      manifest.content_scripts[0].css=['pro-tera-reminder.css'];
    }
    if(key==='pokepasteExporter') {
      fs.copyFileSync(path.join(this.root,'app/addons/pokepaste-export.js'),path.join(target,'pro-showdown-export.js'));
      manifest.content_scripts[0].js=['pro-showdown-export.js'];
    }
    if(key==='battleHistory') {
      const file=path.join(target,'content.js');
      fs.writeFileSync(file,fs.readFileSync(file,'utf8')
        .replace('button[name="send"][value="/friends"]','button[name="send"][value="/friends"], #room- .menugroup a[href="view-friends-all"]')
        .replace('button[name="finduser"]','button[name="finduser"], #room- .menugroup a[href="users"]')
        .replace("button.className = 'ps-stats-button';","button.type = 'button'; button.className = 'ps-stats-button button mainmenu';")
        .replace('const anchorP = anchorButton.parentNode;','const anchorP = anchorButton.closest(\'p\'); if (!anchorP) return;')
        .replace('button[name="closeAndRematch"]','button[name="closeAndRematch"], button[data-cmd^="/closeand /challenge"]')
        .replace('document.querySelector(`#${battleRoomId} button[name="closeAndMainMenu"]`)','document.getElementById(battleRoomId)?.querySelector(\'button[name="closeAndMainMenu"], button[data-cmd="/close"]\')'));
      fs.appendFileSync(path.join(target,'styles.css'),'\n.menugroup .ps-stats-button { margin:0; }\n');
      for(const extension of ['css','js'])fs.copyFileSync(path.join(this.root,'app/addons/history.'+extension),path.join(target,'pro-history.'+extension));
      fs.appendFileSync(path.join(target,'pro-history.css'),'\n'+fs.readFileSync(path.join(this.root,'app/addons/dropdowns.css'),'utf8'));
      fs.appendFileSync(path.join(target,'pro-history.js'),'\n'+fs.readFileSync(path.join(this.root,'app/addons/history-controls.js'),'utf8'));
      for(const relative of ['stats.html','stats/subpages/winrates.html','stats/subpages/leads.html']) {
        const htmlFile=path.join(target,relative),prefix=relative==='stats.html'?'':'../../';
        let html=fs.readFileSync(htmlFile,'utf8').replace('</head>','<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="'+prefix+'pro-history.css"></head>').replace('</body>','<script src="'+prefix+'pro-history.js"></script></body>');
        if(relative==='stats.html')html=html.replace(/<svg class="settings-icon"[\s\S]*?<\/svg>/,match=>'<button type="button" class="history-settings-button">'+match+'<span>Settings</span></button>');
        fs.writeFileSync(htmlFile,html);
      }
      const statsFile=path.join(target,'stats.js');
      fs.writeFileSync(statsFile,fs.readFileSync(statsFile,'utf8').replace("document.querySelector('.settings-icon')","document.querySelector('.history-settings-button')"));
    }
    const page=settingsPages[key];
    if (page) {
      fs.copyFileSync(path.join(this.root,'app/addons',page.source+'.html'),path.join(target,page.html));
      fs.copyFileSync(path.join(this.root,'app/addons',page.source+'.js'),path.join(target,page.js));
      fs.copyFileSync(path.join(this.root,'app/addons/settings.css'),path.join(target,path.dirname(page.html),'pro-settings.css'));
      fs.appendFileSync(path.join(target,path.dirname(page.html),'pro-settings.css'),'\n'+fs.readFileSync(path.join(this.root,'app/addons/dropdowns.css'),'utf8'));
    }
    fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));
    return target;
  }
  async apply(settings) {
    for(const extension of this.active.values())this.session.extensions.removeExtension(extension.id);
    this.active.clear();this.errors.clear();
    for(const addon of addons) {
      if(settings[addon.key]) {
        try {const extension=await this.session.extensions.loadExtension(this.prepare(addon.key,settings));this.active.set(addon.key,extension);this.errors.delete(addon.key);}
        catch(error) {this.errors.set(addon.key,error.message);}
      }
    }
    this.onChange();
  }
  snapshot(settings) {return addons.map(addon=>({...addon,enabled:!!settings[addon.key],active:this.active.has(addon.key),version:this.active.get(addon.key)?.version,error:this.errors.get(addon.key)||null}));}
  pending(settings) {return addons.some(addon=>!!settings[addon.key]!==this.active.has(addon.key) && !this.errors.has(addon.key));}
  optionsUrl(key) {const addon=addons.find(addon=>addon.key===key),extension=this.active.get(key);return addon?.options && extension ? `chrome-extension://${extension.id}/${addon.options}` : null;}
  allows(url) {try {const parsed=new URL(url);return parsed.protocol==='chrome-extension:' && [...this.active.values()].some(extension=>extension.id===parsed.hostname);}catch{return false;}}
}
module.exports={BrowserAddons};
