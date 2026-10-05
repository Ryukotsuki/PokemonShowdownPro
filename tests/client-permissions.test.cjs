const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allowClientPermission, installClientPermissions } = require('../app/client-permissions.cjs');
const origin = 'https://play.pokemonshowdown.com';
const client = { isDestroyed: () => false, getURL: () => origin + '/newclient' };
test('the active Showdown main frame can read and write clipboard text', () => {
  for (const permission of ['clipboard-read', 'clipboard-sanitized-write']) {
    assert.equal(allowClientPermission(client, permission, origin, { isMainFrame: true }, client), true);
  }
});
test('clipboard access remains denied outside the active Showdown main frame', () => {
  for (const [contents, permission, url, details] of [
    [null, 'clipboard-read', origin, { isMainFrame: true }],
    [{ ...client }, 'clipboard-read', origin, { isMainFrame: true }],
    [{ ...client, isDestroyed: () => true }, 'clipboard-read', origin, { isMainFrame: true }],
    [client, 'clipboard-read', origin, { isMainFrame: false }],
    [client, 'clipboard-read', origin, undefined],
    [client, 'clipboard-read', 'https://example.com', { isMainFrame: true }],
    [client, 'clipboard-read', origin + '.example.com', { isMainFrame: true }],
    [client, 'clipboard-read', 'invalid', { isMainFrame: true }],
    [client, 'media', origin, { isMainFrame: true }],
    [client, 'geolocation', origin, { isMainFrame: true }],
    [{ ...client, getURL: () => 'https://example.com' }, 'clipboard-read', origin, { isMainFrame: true }],
  ]) assert.equal(allowClientPermission(contents, permission, url, details, client), false);
});
test('both Electron permission callbacks use the current client and main-frame policy', () => {
  let check, request, active = client;
  installClientPermissions({ setPermissionCheckHandler: f => { check = f; }, setPermissionRequestHandler: f => { request = f; } }, () => active);
  assert.equal(check(client, 'clipboard-read', origin, { isMainFrame: true }), true);
  let granted;
  request(client, 'clipboard-sanitized-write', value => { granted = value; }, { requestingUrl: origin + '/oldclient', isMainFrame: true });
  assert.equal(granted, true);
  active = null;
  assert.equal(check(client, 'clipboard-read', origin, { isMainFrame: true }), false);
  request(client, 'clipboard-read', value => { granted = value; }, { requestingUrl: origin, isMainFrame: true });
  assert.equal(granted, false);
});
