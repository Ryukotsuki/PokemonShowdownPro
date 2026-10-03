require('./linux-integration.cjs').configureLinuxRuntime(require('electron').app);
// Packaged Electron apps need explicit routes for their isolated update audits.
if (process.platform === 'linux' && (process.argv.includes('--install-shortcuts') || process.argv.includes('--audit-linux-shortcuts'))) {
  const {app} = require('electron');
  app.whenReady().then(async () => {
    const result = await require('./linux-integration.cjs').installLinuxShortcuts({app,forceDesktop:process.argv.includes('--install-shortcuts')});
    console.log('Linux shortcuts:', JSON.stringify(result));
    app.quit();
  }).catch(error => {console.error('Linux shortcuts:', error);app.exit(1);});
}
else if (process.argv.includes('--audit-addon-update')) require('../scripts/audit-addon-loading.cjs');
else if (process.argv.includes('--audit-showdex-update')) require('../scripts/audit-update-showdex.cjs');
else require('./main.cjs');
