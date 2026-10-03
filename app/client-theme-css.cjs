const fs = require('node:fs');
const path = require('node:path');
// Resolve the document root explicitly inside the Pro scope.
const css = fs.readFileSync(path.join(__dirname, 'client-theme.css'), 'utf8')
  .replace(/\bhtml(?=[.,\s:#\[])/g, ':scope');
module.exports = '@scope (html.showdown-pro) {\n' + css + '\n}';
