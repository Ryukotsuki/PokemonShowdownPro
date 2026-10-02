(() => {
  const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;};
  for(const input of document.querySelectorAll('.rating-range-inputs input[type="number"]')) {
    const label=input.id==='rating-min'?'minimum rating':'maximum rating';input.setAttribute('aria-label',label);
    const field=make('div','history-number'),steps=make('div','history-number-steps');input.before(field);field.append(input,steps);
    for(const [direction,delta] of [['up',1],['down',-1]]) {
      const button=make('button');button.type='button';button.dataset.step=direction;button.setAttribute('aria-label',(delta>0?'Increase ':'Decrease ')+label);button.setAttribute('aria-controls',input.id);
      button.addEventListener('mousedown',event=>event.preventDefault());
      button.addEventListener('click',()=>{delta>0?input.stepUp():input.stepDown();input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});steps.append(button);
    }
  }
  const inputs=[...document.querySelectorAll('.date-range-inputs input[type="date"]')];if(!inputs.length)return;
  const calendar=make('div','history-calendar');calendar.id='history-calendar';calendar.popover='auto';calendar.setAttribute('role','dialog');calendar.setAttribute('aria-label','Choose date');document.body.append(calendar);
  const header=make('div','history-calendar-header'),previous=make('button','history-calendar-nav'),next=make('button','history-calendar-nav');
  previous.type=next.type='button';previous.dataset.direction='previous';next.dataset.direction='next';previous.setAttribute('aria-label','Previous month');next.setAttribute('aria-label','Next month');
  const month=make('select'),year=make('select');month.setAttribute('aria-label','Month');year.setAttribute('aria-label','Year');
  const monthNames=Array.from({length:12},(_,index)=>new Date(2000,index,1).toLocaleDateString('en-US',{month:'long'}));
  for(const [index,name] of monthNames.entries()){const option=make('option',null,name);option.value=index;month.append(option);}
  header.append(previous,month,year,next);
  const weekdays=make('div','history-calendar-weekdays');for(const name of ['Su','Mo','Tu','We','Th','Fr','Sa'])weekdays.append(make('span',null,name));weekdays.setAttribute('aria-hidden','true');
  const grid=make('div','history-calendar-days');grid.setAttribute('role','group');grid.setAttribute('aria-label','Dates');
  const footer=make('div','history-calendar-footer'),clear=make('button',null,'Clear'),today=make('button',null,'Today');clear.type=today.type='button';footer.append(clear,today);calendar.append(header,weekdays,grid,footer);
  const dateString=date=>`${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const atDate=(y,m,d)=>{const date=new Date(0);date.setFullYear(y,m,d);date.setHours(12,0,0,0);return date;};
  const parse=value=>{if(!/^\d{4,}-\d{2}-\d{2}$/.test(value || ''))return null;const [y,m,d]=value.split('-').map(Number);return atDate(y,m-1,d);};
  const localToday=()=>{const date=new Date();date.setHours(12,0,0,0);return date;};
  let active=null,trigger=null,view=localToday(),cursor=dateString(view),frame=null;
  function allowed(value){return parse(value)?.getFullYear()>=1 && (!active || (!active.min || value>=active.min) && (!active.max || value<=active.max));}
  function position() {
    if(!calendar.matches(':popover-open') || !trigger)return;
    const anchor=trigger.getBoundingClientRect(),bounds=calendar.getBoundingClientRect(),spaceBelow=innerHeight-anchor.bottom-8,spaceAbove=anchor.top-8;
    calendar.style.left=Math.max(8,Math.min(anchor.right-bounds.width,innerWidth-bounds.width-8))+'px';
    const top=spaceBelow>=bounds.height || spaceBelow>=spaceAbove?anchor.bottom+6:anchor.top-bounds.height-6;
    calendar.style.top=Math.max(8,Math.min(top,innerHeight-bounds.height-8))+'px';
  }
  function schedulePosition(){if(frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;position();});}
  function close(focus=false){if(calendar.matches(':popover-open'))calendar.hidePopover();trigger?.setAttribute('aria-expanded','false');if(focus)trigger?.focus();}
  function choose(value){if(!active || value && !allowed(value))return;active.value=value;active.dispatchEvent(new Event('input',{bubbles:true}));active.dispatchEvent(new Event('change',{bubbles:true}));close(true);}
  function render(focus=false) {
    const y=view.getFullYear(),m=view.getMonth();month.value=m;year.replaceChildren();
    for(let value=Math.min(1900,y);value<=Math.max(localToday().getFullYear()+100,y);value++){const option=make('option',null,String(value));option.value=value;year.append(option);}year.value=y;
    grid.replaceChildren();const first=atDate(y,m,1);first.setDate(1-first.getDay());
    for(let index=0;index<42;index++) {
      const date=new Date(first);date.setDate(first.getDate()+index);const value=dateString(date),button=make('button','history-calendar-day',String(date.getDate()));button.type='button';button.dataset.date=value;
      button.dataset.otherMonth=String(date.getMonth()!==m);button.dataset.today=String(value===dateString(localToday()));button.disabled=!allowed(value);button.tabIndex=value===cursor?0:-1;
      button.setAttribute('aria-label',date.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}));button.setAttribute('aria-pressed',String(value===active?.value));button.addEventListener('click',()=>choose(value));grid.append(button);
    }
    if(focus)grid.querySelector('[tabindex="0"]')?.focus();schedulePosition();
  }
  function changeMonth(delta) {const date=parse(cursor) || view;const day=date.getDate();date.setDate(1);date.setMonth(date.getMonth()+delta);date.setDate(Math.min(day,atDate(date.getFullYear(),date.getMonth()+1,0).getDate()));view=date;cursor=dateString(date);render();}
  previous.addEventListener('click',()=>changeMonth(-1));next.addEventListener('click',()=>changeMonth(1));
  for(const select of [month,year])select.addEventListener('change',()=>{view=atDate(Number(year.value),Number(month.value),1);cursor=dateString(view);render();});
  clear.addEventListener('click',()=>choose(''));today.addEventListener('click',()=>choose(dateString(localToday())));
  grid.addEventListener('keydown',event=>{
    if(!event.target.dataset.date)return;
    if(event.key==='Enter' || event.key===' '){event.preventDefault();choose(event.target.dataset.date);return;}
    const date=parse(event.target.dataset.date),deltas={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
    if(event.key in deltas)date.setDate(date.getDate()+deltas[event.key]);
    else if(event.key==='Home')date.setDate(date.getDate()-date.getDay());
    else if(event.key==='End')date.setDate(date.getDate()+6-date.getDay());
    else if(event.key==='PageUp' || event.key==='PageDown'){cursor=dateString(date);changeMonth((event.key==='PageUp'?-1:1)*(event.shiftKey?12:1));render(true);event.preventDefault();return;}
    else return;
    cursor=dateString(date);view=date;render(true);event.preventDefault();
  });
  function open(input,button) {
    if(calendar.matches(':popover-open') && active===input){close(true);return;}
    close();active=input;trigger=button;view=parse(input.value) || localToday();cursor=dateString(view);render();
    calendar.setAttribute('aria-label',input.id==='date-from'?'Choose start date':'Choose end date');button.setAttribute('aria-expanded','true');calendar.showPopover();position();grid.querySelector('[tabindex="0"]')?.focus();
  }
  for(const input of inputs) {
    const name=input.id==='date-from'?'start date':'end date';input.setAttribute('aria-label',name);
    const field=make('div','history-date'),button=make('button','history-date-trigger');button.type='button';button.setAttribute('aria-label','Choose '+name);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',calendar.id);
    button.innerHTML='<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8h14M7 2.5v4M13 2.5v4"/></svg>';
    input.before(field);field.append(input,button);button.addEventListener('click',()=>open(input,button));
    input.addEventListener('keydown',event=>{if(['F4','Enter',' '].includes(event.key) || event.altKey && event.key==='ArrowDown'){event.preventDefault();open(input,button);}});
  }
  calendar.addEventListener('toggle',event=>{if(event.newState==='closed')trigger?.setAttribute('aria-expanded','false');});
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && calendar.matches(':popover-open') && !document.querySelector('select:open')){close(true);event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('scroll',schedulePosition,true);window.addEventListener('resize',schedulePosition);
  const modal=document.getElementById('filter-modal');new MutationObserver(()=>{if(modal.style.display==='none')close();}).observe(modal,{attributes:true,attributeFilter:['style']});
})();
