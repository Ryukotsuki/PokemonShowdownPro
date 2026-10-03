const crypto = require('node:crypto');

// Share the local fixture between the Electron audit and provider regression
// tests. Providers choose channel names using the host OS, even for NsisUpdater.
function appUpdateFixture({ version, corrupt, onRequest = () => {} }) {
  return (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    onRequest(pathname);
    const current = version();
    const bytes = Buffer.from(`local audit download ${current}; not an executable`);
    if (/^\/latest(?:-mac|-linux(?:-[a-z0-9]+)?)?\.yml$/.test(pathname)) {
      const name = `PokemonShowdownPro-${current}-Setup-x64.exe`;
      const sha512 = crypto.createHash('sha512').update(bytes).digest('base64');
      response.setHeader('Content-Type', 'text/yaml');
      response.end(JSON.stringify({ version: current, files: [{ url: name, sha512, size: bytes.length }], path: name, sha512 }));
    } else if (pathname === `/PokemonShowdownPro-${current}-Setup-x64.exe`) {
      response.end(corrupt() ? Buffer.from('tampered') : bytes);
    } else {
      response.statusCode = 404;
      response.end();
    }
  };
}
module.exports = { appUpdateFixture };
