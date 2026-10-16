// Build-time extension: keep the upstream checkout intact and fail on changed anchors.
function transform(source, file) {
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw new Error(`Showdex Pro patch anchor changed: ${file}: ${before.slice(0,80)}`);
    source = source.replace(before, after);
  };
  if (file.endsWith('/interfaces/app/ShowdexSettings.ts')) {
    replace("forcedColorScheme: 'showdown' | Showdown.ColorScheme;", "forcedColorScheme: 'showdown' | 'pro' | Showdown.ColorScheme;");
  } else if (file.endsWith('/utils/host/getColorScheme.ts')) {
    replace("switch (schemeFromPrefs) {", "switch (schemeFromPrefs) {\n    case 'pro': return 'dark';");
  } else if (file.endsWith('/pages/Bootdex/BootdexPreactAdapter.ts')) {
    replace('BootdexPreactAdapter.colorScheme = prefs.theme;', "BootdexPreactAdapter.colorScheme = (prefs.theme as string) === 'pro' ? 'dark' : prefs.theme;");
  } else if (file.endsWith('/redux/store/showdexSlice.ts')) {
    replace("import { useDispatch, useSelector } from './hooks';", "import { useSyncExternalStore } from 'react';\nimport { useDispatch, useSelector } from './hooks';");
    replace("return forcedScheme || 'light';", "return forcedScheme === 'pro' ? 'dark' : forcedScheme || 'light';");
    source += `
// Pro shares native Dark's base scheme, but has its own palette. Subscribe
// to the host's Pro flag as well, including Dark <-> Pro with no scheme change.
const readClientProTheme = () => typeof document !== 'undefined'
  && document.documentElement.classList.contains('showdown-pro');
const subscribeClientProTheme = (notify: () => void) => {
  if (typeof document === 'undefined') return () => {};
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
};
export const useProTheme = () => {
  const forcedScheme = useSelector(state => state?.showdex?.settings?.forcedColorScheme);
  const clientPro = useSyncExternalStore(subscribeClientProTheme, readClientProTheme, () => false);
  return forcedScheme === 'pro' || ((!forcedScheme || forcedScheme === 'showdown') && clientPro);
};
`;
  } else if (file.endsWith('/layout/PageContainer/PageContainer.tsx')) {
    replace('useColorScheme, useColorTheme, useGlassyTerrain', 'useColorScheme, useColorTheme, useGlassyTerrain, useProTheme');
    replace('const colorScheme = useColorScheme();', `const colorScheme = useColorScheme();
  const proTheme = useProTheme();
  React.useLayoutEffect(() => {
    document.documentElement.classList.toggle('showdex-pro', proTheme);
  }, [proTheme]);`);
    replace("{...(!!colorScheme && { 'data-showdex-scheme': colorScheme })}", "{...(!!colorScheme && { 'data-showdex-scheme': colorScheme })}\n      data-showdex-pro={proTheme || undefined}");
  } else if (file.endsWith('/SettingsPane/GeneralSettingsPane.tsx')) {
    replace("'showdown',\n            'light',\n            'dark',", "'showdown',\n            'light',\n            'dark',\n            'pro',");
    replace('label: t(`showdex.forcedColorScheme.options.${option}.label`),', "label: option === 'pro' ? 'Pro' : t(`showdex.forcedColorScheme.options.${option}.label`),");
    replace('i18nKey={`showdex.forcedColorScheme.options.${option}.tooltip`}', 'i18nKey={`showdex.forcedColorScheme.options.${option}.tooltip`}\n                defaults={option === \'pro\' ? \'The blue Pokémon Showdown Pro theme.\' : undefined}');
  }
  return require('./showdex-theater.cjs').transform(require('./showdex-battle-controls.cjs').transform(source, file), file);
}
module.exports=function(source){return transform(source.replace(/\r\n/g,'\n'),this.resourcePath.replace(/\\/g,'/'));};
module.exports.transform=transform;
