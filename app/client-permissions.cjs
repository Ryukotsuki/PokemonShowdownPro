const CLIENT_ORIGIN = 'https://play.pokemonshowdown.com';
const clipboardPermissions = new Set(['clipboard-read', 'clipboard-sanitized-write']);
function isClientOrigin(url) {
  try { return new URL(url).origin === CLIENT_ORIGIN; } catch { return false; }
}
function allowClientPermission(contents, permission, requestingURL, details, client) {
  return !!contents && contents === client && !contents.isDestroyed() &&
    clipboardPermissions.has(permission) && details?.isMainFrame === true &&
    isClientOrigin(contents.getURL()) && isClientOrigin(requestingURL);
}
function installClientPermissions(session, getClient) {
  session.setPermissionCheckHandler((contents, permission, origin, details) =>
    allowClientPermission(contents, permission, origin, details, getClient()));
  session.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(allowClientPermission(contents, permission, details?.requestingUrl, details, getClient())));
}
module.exports = { allowClientPermission, installClientPermissions };
