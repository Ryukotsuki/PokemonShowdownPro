// Runs inside Three Island's native parser/storage closure.
const proSheetImports=new WeakMap();
function proSheetText(node) {
  if(node.nodeType===3)return node.textContent;
  if(node.nodeType!==1)return '';
  if(node.matches('button,script,style,[data-pro-sheet-control]'))return '';
  if(node.tagName==='BR')return '\n';
  if(node.tagName==='IMG')return /(?:\/types\/|typeicon)/i.test(node.getAttribute('src')||node.className)?(node.getAttribute('alt')||'').replace(/[\[\]]/g,''):'';
  const text=[...node.childNodes].map(proSheetText).join('');
  return /^(?:DIV|P|PRE|DETAILS|SUMMARY|LI|TR)$/.test(node.tagName)?'\n'+text+'\n':text;
}
function proSheetTeam(text) {
  const blocks=[];let current=null;
  for(let line of text.replace(/\r/g,'').replace(/\u00a0/g,' ').replace(/[\u200b-\u200d\ufeff]/g,'').split('\n')) {
    line=line.trim();if(!line)continue;
    const header=line.split(' @ ')[0].replace(/ \([MF]\)$/,'');
    const speciesName=/\(([^()]+)\)$/.exec(header)?.[1]||header;
    if(Dex.species.get(speciesName)?.exists){current=[line];blocks.push(current);continue;}
    if(current&&(/^(?:Ability|Trait|Tera Type|EVs|IVs|Level|Shiny|Happiness|Pokeball|Hidden Power|Dynamax Level|Gigantamax):\s*/.test(line)||/^[A-Za-z]+ [Nn]ature$/.test(line)||/^[-~–]\s*\S/.test(line)))current.push(line.replace(/^–\s*/,'- '));
  }
  return blocks.filter(block=>block.length>1).slice(0,24).flatMap(block=>{
    const sets=importTeam(block.join('\n'));
    return Array.isArray(sets)?sets.filter(set=>set?.species&&Dex.species.get(set.species)?.exists):[];
  });
}
function runCodeCheck(details,isPM) {
  if(!details||proSheetImports.get(details)?.isConnected)return;
  const summary=details.querySelector(':scope > summary');if(!summary)return;
  // Clean up controls from an older add-on instance before reading the sheet.
  for(const button of summary.querySelectorAll('button'))if(button.textContent.trim()==='Import')button.remove();
  const team=proSheetTeam(proSheetText(details));if(!team.length)return;
  const button=document.createElement('button');button.type='button';button.className='button pro-team-sheet-import';button.textContent='Import';button.dataset.proSheetControl='true';
  proSheetImports.set(details,button);
  button.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    const sets=proSheetTeam(proSheetText(details));if(!sets.length)return;
    const heading=proSheetText(summary).replace(/\s+/g,' ').trim();
    const owner=/^(?:Open\s+)?team sheet (?:for|of)\s+(.+)$/i.exec(heading)?.[1];
    addTeam({title:owner?`${owner}'s team sheet`:'Imported team sheet',teamString:packTeam(sets),team:sets,format:'gen9'});
  });
  summary.append(' ',button);
}
