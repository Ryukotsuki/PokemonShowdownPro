const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
module.exports = async ({root,evaluate,wait,size,open,snapshot}) => {
  const report = [];
  for(const id of ['ladder','ladder-gen9randombattle']) {
    await open(id);
    await wait(id==='ladder'?`document.querySelector('#room-ladder a[href^="/ladder-"]')`:`document.querySelector('#room-ladder-gen9randombattle table tr:nth-child(20)')`);
    for(const width of [1200,800,430]) {
      await size(width);
      const state = await evaluate(`
        const room=document.getElementById('room-'+${JSON.stringify(id)}),table=room.querySelector('table');
        const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}};
        const cards=[...room.querySelectorAll('a[href^="/ladder-"]')];
        return {id:${JSON.stringify(id)},width:${width},room:rect(room),overflow:room.scrollWidth>room.clientWidth+1,
          cards:cards.length,clipped:cards.some(c=>c.scrollWidth>c.clientWidth+1),card:cards[0]&&{...rect(cards[0]),background:getComputedStyle(cards[0]).backgroundColor},
          table:table&&{...rect(table),scrollWidth:table.scrollWidth,scrollHeight:table.scrollHeight,tbody:!!table.querySelector('tbody'),header:getComputedStyle(table.querySelector('tbody')?table.querySelector('th'):table.rows[0]).position,
            rows:table.rows.length,columns:table.rows[0].cells.length,firstRow:rect(table.rows[0]),cellPadding:getComputedStyle(table.querySelector('td')).padding,
            headerCells:[...table.rows[0].cells].map(rect),rowCells:[...table.rows[1].cells].map(rect)},
          clippedButtons:[...room.querySelectorAll('button,input')].filter(e=>e.checkVisibility()).some(e=>e.scrollWidth>e.clientWidth+1)};
      `);
      report.push(state);
      fs.writeFileSync(path.join(root,'test-results/new-surfaces/ladder-layout.json'),JSON.stringify(report,null,2));
      assert.equal(state.overflow,false,id+' '+width+' page overflow');
      assert.equal(state.clippedButtons,false,id+' '+width+' clipped control');
      if(id==='ladder') {
        assert.ok(state.cards>30);
        assert.equal(state.clipped,false);
        assert.equal(state.card.background,'rgb(28, 57, 77)');
        assert.ok(state.card.height>=50);
      } else {
        assert.ok(state.table.rows>=20);assert.ok([5,6].includes(state.table.columns));assert.equal(state.table.header,'sticky');
        assert.ok(state.table.firstRow.width>=Math.max(state.table.columns===5?530:610,state.table.width-18)-2,'Rating columns must fill the table');
        if(state.table.width>=(state.table.columns===5?548:628))assert.ok(state.table.scrollWidth<state.table.width,'Desktop rating columns fit without horizontal scrolling');
        state.table.headerCells.forEach((cell,index)=>assert.ok(Math.abs(cell.left-state.table.rowCells[index].left)<2,'Rating header alignment'));
        await evaluate("const table=document.querySelector('#room-ladder-gen9randombattle table');table.scrollTop=400;table.scrollLeft=0;");
        const pinned=await evaluate("const table=document.querySelector('#room-ladder-gen9randombattle table');return Math.abs(table.querySelector('th').getBoundingClientRect().top-table.getBoundingClientRect().top)<3;");
        assert.ok(pinned,'Column headings remain visible while scrolling');
        await evaluate("document.querySelector('#room-ladder-gen9randombattle table').scrollTop=0;");
      }
      await snapshot(width===1200?id:id+'-'+width);
      console.log(id+' '+width+': layout verified');
    }
  }
  console.log('Six live new-client ladder layouts passed.');
};
