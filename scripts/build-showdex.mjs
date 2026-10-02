import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceIndex=process.argv.indexOf('--source'),outputIndex=process.argv.indexOf('--output');
const source=sourceIndex>=0?path.resolve(process.argv[sourceIndex+1]):path.join(root,'vendor/showdex');
const output=outputIndex>=0?path.resolve(process.argv[outputIndex+1]):path.join(root,'build/showdex');
process.chdir(source);
process.env.SHOWDOWN_PRO_SHOWDEX_SOURCE=source;
process.env.NODE_ENV = 'production';
process.env.BUILD_TARGET = 'standalone';
process.env.PROD_ANALYZE_BUNDLES = 'false';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const webpack = require('webpack');
const { config } = await import(pathToFileURL(path.join(source,'webpack.config.js')).href);
config.output.path = output;
config.output.publicPath = 'showdown-pro://showdex/';
// Keep upstream's rule array intact: its asset copier indexes that array.
config.module.rules = [{
  test: /\.[jt]sx?$/,
  include: path.join(source, 'src'),
  enforce: 'pre',
  use: path.join(root, 'scripts/showdex-pro-source.cjs'),
}, ...config.module.rules];
const stylesheetRule = config.module.rules.find(rule => rule.test?.test('theme.scss'));
if (!stylesheetRule) throw new Error('Showdex stylesheet pipeline changed');
// Run after Sass and before CSS Modules hashes selectors, so portal menus and
// every component receive the same independently scoped Pro palette.
stylesheetRule.use.splice(stylesheetRule.use.length - 1, 0, path.join(root, 'scripts/showdex-pro-css.cjs'));
for (const plugin of config.plugins) {
  if (!plugin.definitions) continue;
  plugin.definitions['process.env.STANDALONE_RESOURCE_PROTOCOL'] = JSON.stringify('showdown-pro');
  plugin.definitions['process.env.STANDALONE_RESOURCE_PREFIX'] = JSON.stringify('showdex');
  plugin.definitions['process.env.UUID_NAMESPACE'] = JSON.stringify('2ba1f5f9-2a1f-4f8d-9fe1-fbe81b4128ca');
}
webpack(config, (error, stats) => {
  if (error || stats.hasErrors()) {
    console.error(error || stats.toString({ all: false, errors: true }));
    process.exitCode = 1;
    return;
  }
  console.log('Showdex standalone built into '+output+'.');
});
