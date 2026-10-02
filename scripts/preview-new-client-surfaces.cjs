const path = require('node:path');
const { app } = require('electron');
require('./mute-test-audio.cjs');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, 'test-results/surface-preview-profile'));
app.whenReady().then(() => require('./verify-new-client-surfaces.cjs')(root,process.argv.includes('--both-clients')))
  .then(() => app.exit(0), error => { console.error(error); app.exit(1); });
