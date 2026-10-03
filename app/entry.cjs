require('./linux-integration.cjs').configureLinuxRuntime(require('electron').app);
// Packaged Electron apps need explicit routes for their isolated update audits.
if (process.argv.includes('--audit-addon-update')) require('../scripts/audit-addon-loading.cjs');
else if (process.argv.includes('--audit-showdex-update')) require('../scripts/audit-update-showdex.cjs');
else require('./main.cjs');
