// Keep access to the calculator independent of its automatic opening/layout
// preferences. These patches run before TypeScript compilation, on both hosts.
function transform(source, file) {
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw new Error(`Showdex battle controls patch anchor changed: ${file}: ${before.slice(0, 80)}`);
    source = source.replace(before, after);
  };
  if (file.endsWith('/Calcdex/CalcdexClassicBootstrapper.ts')) {
    const start = '    // local helper function that will be called once the native BattleRoom controls are rendered';
    const end = '    // $rootContainer[0] references the underlying HTMLDivElement created below,';
    if (source.split(start).length !== 2 || source.split(end).length !== 2) throw new Error(`Showdex battle controls patch anchor changed: ${file}`);
    const controls = source.slice(source.indexOf(start), source.indexOf(end));
    replace(controls, '');
    replace('  protected preparePanel(): void {', `  private manualOpenRequested = false;

  protected prepareBattleControls(): void {
    if (!this.battleRoom?.$controls || typeof this.battleRoom.toggleCalcdexOverlay === 'function') return;
    const { Adapter } = CalcdexClassicBootstrapper;
    const { $controls } = this.battleRoom;
${controls.replace('const { overlayVisible: visible } = state || {};', 'const visible = this.battle.calcdexAsOverlay && state?.overlayVisible;')}
    this.battleRoom.toggleCalcdexOverlay = () => {
      this.manualOpenRequested = true;
      this.battle.calcdexDestroyed = false;
      if (this.battle.calcdexInit) {
        if (!this.battleState?.battleId) {
          this.battle.calcdexStateInit = false;
          this.initCalcdexState();
          this.syncCalcdex();
        }
      } else {
        this.run();
      }
      this.open();
      this.battleRoom.updateControls();
    };
    injectToggleButton();
  }

  protected preparePanel(): void {`);
    replace('    if (this.initDisabled) {', '    this.prepareBattleControls();\n\n    if (this.initDisabled) {');
    replace('    if (this.battle.calcdexDisabled) {', '    if (this.battle.calcdexDisabled && !this.manualOpenRequested) {');
    // Manual access survives panel closure even with destroyOnClose enabled.
    replace('    void (this.battle.calcdexAsOverlay ? this.prepareOverlay() : this.preparePanel());', '    this.battle.calcdexDisabled = false;\n    void (this.battle.calcdexAsOverlay ? this.prepareOverlay() : this.preparePanel());');
    replace("    this.battle.calcdexInit = true;", "    this.battle.calcdexInit = true;\n    this.battleRoom.updateControls();");
  } else if (file.endsWith('/redux/store/calcdexSlice.ts')) {
    // A sync started before the click can finish afterwards. Preserve the
    // current visibility instead of restoring the sync's stale UI snapshot.
    replace('      state[battleId] = action.payload;', `      if (!state[battleId]) return;
      state[battleId] = {
        ...action.payload,
        overlayVisible: state[battleId].overlayVisible,
      };`);
  } else if (file.endsWith('/Calcdex/CalcdexPreactBattle.ts')) {
    replace('  public calcdexAsOverlay = false;', '  public calcdexAsOverlay = false;\n  public calcdexManual = false;');
    // Decide where a manual calculator will live even when auto-open is off.
    replace('    if (this.calcdexDisabled) {\n      return;\n    }\n', '');
    replace('    if (this.calcdexDestroyed) {\n      this.calcdexReactRenderer = null;\n    }', '    // Keep the renderer available for reopening the panel from battle controls.');
  } else if (file.endsWith('/Calcdex/CalcdexPreactBootstrapper.ts')) {
    replace("    if (this.calcdexSettings?.openOnStart === 'never') {", "    if (this.battleId && this.calcdexSettings?.openOnStart === 'never' && !this.battle?.calcdexManual) {");
    replace('    if (this.battle.calcdexDisabled) {', '    if (this.battle.calcdexDisabled && !this.battle.calcdexManual) {');
  } else if (file.endsWith('/Calcdex/CalcdexPreactBattlePanel.ts')) {
    replace("import { BootdexPreactAdapter as Adapter }", "import { BootdexManager as Manager } from '../Bootdex/BootdexManager';\nimport { BootdexPreactAdapter as Adapter }");
    replace("              || this.calcdexState?.renderMode !== 'overlay'\n", '');
    replace("          Adapter.store.dispatch(calcdexSlice.actions.update({", `          this.battle.calcdexManual = true;
          this.battle.calcdexDisabled = false;
          this.battle.calcdexDestroyed = false;
          if (!this.calcdexState?.battleId) {
            this.battle.calcdexStateInit = false;
            Manager.runCalcdex(this.battle.id);
          }
          if (!this.calcdexState?.battleId) return;
          if (!this.battle.calcdexAsOverlay) {
            Manager.openCalcdex(this.battle.id);
            this.update(null);
            return;
          }

          Adapter.store.dispatch(calcdexSlice.actions.update({`);
    replace('    const { overlayVisible } = this.battleState || {};\n\n    if (!this.battle?.calcdexAsOverlay) {\n      return null;\n    }', '    if (!this.battle?.id) return null;\n    const overlayVisible = this.battle.calcdexAsOverlay && this.battleState?.overlayVisible;');
    replace('      disabled: !this.battle?.calcdexInit,', '      disabled: !this.battle?.id,');
    replace('    if (!this.battle?.calcdexAsOverlay) {\n      return panel;\n    }', '    if (!this.battle?.id) return panel;');
    replace('    const { overlayVisible } = this.battleState || {};\n\n    const panel = super.render();', '    const overlayVisible = this.battle?.calcdexAsOverlay && this.battleState?.overlayVisible;\n\n    const panel = super.render();');
    // Current Showdown nests controls inside scrollable-battle-container and
    // adds wide-controls. Search class tokens recursively instead of relying
    // on a particular depth, exact class string or mobile options button.
    const afterStart = '  public override renderAfterBattleControls(): Showdown.Preact.VNode {';
    const afterEnd = '  // in the Showdown \'preact\' rewrite, there are 2 battle panel layouts:';
    if (source.split(afterStart).length !== 2 || source.split(afterEnd).length !== 2) throw new Error(`Showdex battle controls patch anchor changed: ${file}`);
    replace(source.slice(source.indexOf(afterStart), source.indexOf(afterEnd)), '');
    const placementStart = '    // for the mobile layout (i.e., room.width < 700),';
    const placementEnd = '\n    return panel;\n  }\n}';
    if (source.split(placementStart).length !== 2 || !source.endsWith(placementEnd + '\n')) throw new Error(`Showdex battle controls patch anchor changed: ${file}`);
    replace(source.slice(source.indexOf(placementStart), source.lastIndexOf(placementEnd)), `    const findControls = (children: Showdown.Preact.ComponentChildren): Showdown.Preact.VNode => {
      for (const child of preact.toChildArray(children)) {
        if (!child || typeof child !== 'object' || !('props' in child)) continue;
        const node = child as Showdown.Preact.VNode;
        if (typeof node.props?.class === 'string' && node.props.class.split(/\\s+/).includes('battle-controls')) return node;
        const nested = findControls(node.props?.children);
        if (nested) return nested;
      }
      return null;
    };
    const battleControls = findControls(panel.props.children);
    if (battleControls) {
      const children = preact.toChildArray(battleControls.props.children);
      const timerIndex = children.findIndex(child => child && typeof child === 'object' &&
        child.type === window.TimerButton);
      if (timerIndex >= 0) children.splice(timerIndex, 1);
      battleControls.props.children = [preact.h('div', {
        key: 'calcdex-battle-controls',
        // Replay actions use the same top-right corner after a match. Reserve
        // a row in the layout so both buttons remain visible and clickable.
        style: this.battle.ended
          ? { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 6, padding: '2px 10px 0', marginBottom: 6 }
          : { position: 'absolute', top: 2, right: 10, display: 'flex', alignItems: 'center', columnGap: 6 },
        'data-showdex': 'calcdex',
        'data-calcdex': 'overlay-controls',
        'data-calcdex-controls': 'battle-timer',
      }, ...[
        this.renderToggleButton(),
        ...(timerIndex >= 0 ? [preact.h(CalcdexPreactBattleTimerButton, { room })] : []),
      ]), ...children];
    } else {
      // Legacy/custom battle layouts can omit the inner controls altogether.
      panel.props.children.push(preact.h('div', {
        key: 'calcdex-battle-controls',
        style: { position: 'absolute', top: this.battleHeight + 2, right: 10 },
        'data-calcdex-controls': 'battle-options',
      }, this.renderToggleButton()));
    }
`);
  }
  return source;
}
module.exports = { transform };
