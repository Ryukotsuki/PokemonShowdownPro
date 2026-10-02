// Install before creating test windows, including popups and embedded views.
const { app } = require('electron');
app.commandLine.appendSwitch('mute-audio');
app.on('web-contents-created', (_event, contents) => contents.setAudioMuted(true));
