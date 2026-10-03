const fs = require('node:fs');
// webContents.executeJavaScript waits for every page resource. A ready main
// frame can initialize the local bridge and Showdex while images/ads still load.
async function installClientScripts({contents,clientURL,bridge,themeScript,themeCSS,autoTimer,
  getBundle,isCurrent=()=>true,onClientReady=()=>{}}) {
  const frame = contents.mainFrame;
  const current = () => !contents.isDestroyed() && !frame.isDestroyed() && isCurrent();
  const execute = async source => {
    if (!current()) throw new Error('Client navigation changed');
    const result = await frame.executeJavaScript(source);
    if (!current()) throw new Error('Client navigation changed');
    return result;
  };
  const deadline = Date.now() + 30000;
  let showdexStage = false;
  try {
    while (current() && Date.now() < deadline) {
      if (!frame.url.startsWith(clientURL)) return null;
      if (!await execute(bridge) || !await execute(themeScript)) {
        await new Promise(resolve=>setTimeout(resolve,250));
        continue;
      }
      await execute(`window.__showdownPro.setAutoTimer(${!!autoTimer})`);
      await contents.insertCSS(themeCSS,{cssOrigin:'user'});
      await execute(`(() => {
        let style = document.getElementById('showdown-pro-theme');
        if (!style) {
          style = document.createElement('style'); style.id = 'showdown-pro-theme';
          document.head.appendChild(style);
        }
        style.textContent = ${JSON.stringify(themeCSS)};
        return !!style.sheet;
      })()`);
      onClientReady();
      const bundle = getBundle();
      if (!bundle) return {showdex:false};
      showdexStage = true;
      if (!fs.existsSync(bundle)) throw new Error('Build missing — run npm run build:showdex');
      if (!await execute('!!window.__SHOWDEX_INIT')) await execute(fs.readFileSync(bundle,'utf8'));
      if (!await execute('!!window.__SHOWDEX_INIT')) throw new Error('Showdex failed to initialize');
      return {showdex:true};
    }
    if (!current()) return null;
    throw new Error('Showdown client did not become ready. Reload to retry.');
  } catch (error) {
    if (!current()) return null;
    if (showdexStage) return {showdexError:error};
    throw error;
  }
}
module.exports = {installClientScripts};
