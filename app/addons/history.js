(() => {
  const make=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
  function chartPalette() {
    if(typeof chart==='undefined' || !chart)return;
    const css=getComputedStyle(document.documentElement),value=name=>css.getPropertyValue(name).trim();
    for(const axis of Object.values(chart.options.scales || {})) {
      axis.ticks.color=value('--muted');axis.grid.color=value('--border');axis.border={display:false};
      axis.ticks.font={family:'Segoe UI',size:10};
    }
    for(const dataset of chart.data.datasets) {
      dataset.borderColor=value('--accent');dataset.backgroundColor=value('--accent');dataset.borderWidth=2;
      dataset.pointRadius=3;dataset.pointHoverRadius=5;dataset.tension=.25;
    }
    Object.assign(chart.options.plugins.tooltip,{backgroundColor:value('--raised'),titleColor:value('--text'),bodyColor:value('--text'),borderColor:value('--border'),borderWidth:1,padding:12,cornerRadius:7});
    chart.update('none');
  }
  const theme=document.documentElement.dataset.theme;
  document.documentElement.dataset.theme=theme || 'pro';
  new MutationObserver(()=>{
    const select=document.getElementById('history-theme');if(select)select.value=document.documentElement.dataset.theme;
    chartPalette();
  }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  if(typeof createChart==='function') {
    const original=createChart;createChart=function(...args){const result=original.apply(this,args);chartPalette();return result;};
  }
  function decorateRows(items) {
    const headers=[...document.querySelectorAll('#battle-stats th')].map(node=>node.textContent);
    for(const row of document.querySelectorAll('#battle-stats .expandable-row')) {
      row.tabIndex=0;row.setAttribute('aria-expanded','false');row.setAttribute('aria-label','View battle against '+row.querySelector('.opponent-name')?.textContent);
      [...row.cells].forEach((cell,index)=>cell.dataset.label=headers[index]);
      const result=row.classList.contains('positive-diff')?'win':row.classList.contains('negative-diff')?'loss':'neutral';
      const badge=make('span',result==='win'?'Win':result==='loss'?'Loss':'Tie / unrated','history-result');badge.dataset.result=result;
      row.querySelector('.opponent-cell')?.prepend(badge);
    }
    const wins=items.filter(window.isBattleWin).length,losses=items.filter(window.isBattleLoss).length;
    const values=[items.length,wins,losses,wins+losses?(100*wins/(wins+losses)).toFixed(1)+'%':'—'];
    document.querySelectorAll('.history-summary strong').forEach((node,index)=>node.textContent=values[index]);
  }
  if(typeof updateTable==='function') {
    const original=updateTable;updateTable=function(items,...args){const result=original.call(this,items,...args);decorateRows(items);return result;};
  }
  if(typeof createPokemonItem==='function') {
    const original=createPokemonItem;createPokemonItem=function(item){const node=original.call(this,item);node.querySelector('.pokemon-stats').before(make('span',item.name,'pokemon-name'));return node;};
  }
  if(typeof createLeadItem==='function') {
    const original=createLeadItem;createLeadItem=function(item){const node=original.call(this,item);node.querySelector('.pokemon-stats').before(make('span',item.name,'pokemon-name'));return node;};
  }
  const sidebar=document.getElementById('sidebar'),content=document.getElementById('content');
  const title=document.getElementById('battle-history-heading') || document.getElementById('title');
  if(title) {
    const header=make('header',null,'history-page-header'),copy=make('div');
    copy.append(make('div',sidebar?'Battle archive':'Battle statistics','history-eyebrow'));
    title.before(header);copy.append(title,make('p',sidebar?'Review your matches, track your progress, and revisit your teams.':'Explore your Pokémon performance across saved battles.'));
    header.append(copy);
    const settings=document.querySelector('.history-settings-button');if(settings)header.append(settings);
  }
  if(sidebar && content) {
    const brand=make('div',null,'history-nav-brand');brand.append(make('div','Pokémon Showdown Pro','history-eyebrow'),make('strong','Battle History'));sidebar.prepend(brand);
    const summary=make('section',null,'history-summary');summary.setAttribute('aria-label','Filtered battle record');
    for(const [index,label] of ['Battles','Wins','Losses','Win rate'].entries()) {
      const card=make('article');if(index===1 || index===2)card.dataset.result=index===1?'win':'loss';card.append(make('span',label),make('strong','—'));summary.append(card);
    }
    content.querySelector('.history-page-header').after(summary);
    const chartNode=document.getElementById('chartContainer'),chartPanel=make('section',null,'history-chart-panel'),chartHeader=make('div',null,'history-section-header');
    chartHeader.append(make('h2','Rating over time'),make('p','Your ladder progress for the selected format.'));chartNode.before(chartPanel);chartPanel.append(chartHeader,chartNode);
    const table=document.getElementById('battle-stats'),listPanel=make('section',null,'history-battles-panel'),listHeader=make('header',null,'history-battles-header'),listCopy=make('div',null,'history-section-header'),wrap=make('div',null,'history-table-wrap');
    listCopy.append(make('h2','Recent battles'),make('p','Select a match to view teams and battle details.'));listHeader.append(listCopy,document.querySelector('.filter-button-container'));
    table.before(listPanel);wrap.append(table);listPanel.append(listHeader,wrap,document.querySelector('.pagination'));
    const empty=document.querySelector('.no-battles-overlay');summary.before(empty);
    const syncEmpty=()=>document.body.dataset.historyEmpty=empty.style.display==='block'?'true':'false';
    new MutationObserver(syncEmpty).observe(empty,{attributes:true,attributeFilter:['style']});syncEmpty();
    const nativeTheme=document.getElementById('dark-mode-toggle');
    const themeLabel=make('label','Appearance'),themeSelect=make('select');themeSelect.id='history-theme';themeLabel.htmlFor=themeSelect.id;
    for(const value of ['pro','light','dark']){const option=make('option',value==='pro'?'Pro':value==='light'?'Light':'Dark');option.value=value;themeSelect.append(option);}
    themeSelect.value=document.documentElement.dataset.theme;
    // Keep the original checkbox for the extension's initialization code.
    const themeRow=make('div',null,'settings-menu-item');themeRow.append(themeLabel,themeSelect);nativeTheme.after(themeRow);nativeTheme.hidden=true;
    themeSelect.addEventListener('change',()=>{document.documentElement.dataset.theme=themeSelect.value;});
    for(const item of document.querySelectorAll('#export-battles,#import-battles,#import-replay')) {item.tabIndex=0;item.setAttribute('role','button');}
    const menu=document.querySelector('.settings-menu'),button=document.querySelector('.history-settings-button');button.setAttribute('aria-label','Battle History settings');button.setAttribute('aria-expanded','false');
    new MutationObserver(()=>{
      const active=menu.classList.contains('active');button.setAttribute('aria-expanded',String(active));
      if(active){const bottom=button.getBoundingClientRect().bottom;const top=Math.max(8,Math.min(bottom+8,innerHeight-100));menu.style.top=top+'px';menu.style.maxHeight=(innerHeight-top-12)+'px';}
    }).observe(menu,{attributes:true,attributeFilter:['class']});
    document.addEventListener('keydown',event=>{
      // Let the browser dismiss the picker before a parent dialog handles Escape.
      if(event.key==='Escape' && document.querySelector('select:open'))event.stopPropagation();
    },true);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape') {
        if(document.querySelector('select:open'))return;
        const close=[...document.querySelectorAll('.filter-modal')].find(modal=>modal.style.display!=='none')?.querySelector('.filter-close-btn');
        if(close){close.click();event.preventDefault();}
        else if(menu.classList.contains('active'))button.click();
      }
      if((event.key==='Enter' || event.key===' ') && event.target.matches('.expandable-row,[role="button"]')) {event.preventDefault();event.target.click();}
    });
    document.addEventListener('click',event=>{
      const row=event.target.closest('.expandable-row');if(row)queueMicrotask(()=>row.setAttribute('aria-expanded',String(row.nextElementSibling?.style.display!=='none')));
    });
    for(const modal of document.querySelectorAll('.filter-modal')) {modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');const heading=modal.querySelector('h2');heading.id ||= modal.id+'-heading';modal.setAttribute('aria-labelledby',heading.id);}
  }
})();
