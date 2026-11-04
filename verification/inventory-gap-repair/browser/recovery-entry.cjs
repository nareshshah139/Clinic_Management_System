const assert=require('node:assert/strict');
const {run}=require('./browser.cjs');
(async()=>run('recovery-entry',async({page,read,requests,steps})=>{
  await page.waitForNetworkIdle({idleTime:500,timeout:15000});
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Recover interrupted import'&&button.getClientRects().length));
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('label')].some(label=>label.textContent.trim()==='Import attempt ID')),false);
  const handle=await page.evaluateHandle(()=>[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Recover interrupted import'));
  const button=handle.asElement();
  await button.evaluate(element=>element.scrollIntoView({block:'center'}));
  const before=await button.evaluate(element=>{
    const rect=element.getBoundingClientRect();
    const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    return {rect:rect.toJSON(),viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,visible:getComputedStyle(element).visibility==='visible'&&!!element.getClientRects().length,closedDisclosure:!!element.closest('details:not([open])'),centerHit:element===hit||element.contains(hit)};
  });
  assert(before.visible&&!before.closedDisclosure&&before.centerHit,'Recovery action must be directly visible and unobscured');
  assert(before.rect.top>=0&&before.rect.bottom<=before.viewport.height,'Entire recovery button visible after scrolling');
  assert(before.documentWidth<=before.viewport.width,'No phone horizontal overflow');
  await button.click();steps.push({type:'control',text:'Recover interrupted import'});await handle.dispose();
  await page.waitForFunction(()=>[...document.querySelectorAll('label')].some(label=>[...label.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim()==='Import attempt ID'&&label.querySelector('input')));
  const form=await page.evaluate(()=>[...document.querySelectorAll('label')].filter(label=>['Import attempt ID','Recovery reason'].includes([...label.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim())).map(label=>({text:[...label.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim(),visible:!!label.getClientRects().length,field:!!label.querySelector('input,textarea')})));
  assert.equal(form.length,2);assert(form.every(field=>field.visible&&field.field));
  assert.equal(requests.filter(request=>!['GET','HEAD'].includes(request.method)).length,0,'Opening recovery must make no write request');
  await read('opened');return {oneVisibleAction:true,before,form,writeRequests:0};
},{fixture:true,query:'area=purchases&view=intake&new=recovery-entry-proof',viewport:{width:390,height:844}}))();
