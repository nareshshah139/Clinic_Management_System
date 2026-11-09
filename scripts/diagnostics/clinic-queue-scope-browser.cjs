const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const origin=process.env.CLINIC_URL || 'http://127.0.0.1:3118';
const doctor={id:'00000000-0000-4000-8000-000000000002',firstName:'Test',lastName:'Doctor',role:'DOCTOR',branchId:'fixture',isActive:true};
const patient={id:'00000000-0000-4000-8000-000000000001',name:'Old Day Patient',firstName:'Old',lastName:'Day Patient'};
const appointment={id:'00000000-0000-4000-8000-000000000003',slot:'10:00-10:30',status:'SCHEDULED',patient,visitType:'OPD'};
(async()=>{
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
 try {const page=await browser.newPage();await page.setViewport({width:1440,height:900});await page.setCookie({name:'auth_token',value:'synthetic-fixture',url:origin});
 await page.setRequestInterception(true); let initialDate=''; let sawFailure=false;
 page.on('request', async r=>{let u=new URL(r.url()); if(!u.pathname.startsWith('/api/'))return r.continue();let p=u.pathname, body=[];let status=200;
 if(p==='/api/auth/me'||p===`/api/users/${doctor.id}`)body=doctor; else if(p==='/api/users')body={users:[doctor]};else if(p.includes('/schedule')){let d=u.searchParams.get('date');if(!initialDate)initialDate=d;if(d!==initialDate){status=503;body={message:'Synthetic schedule unavailable'};sawFailure=true;}else body={appointments:[appointment]};}else if(p===`/api/patients/${patient.id}`)body=patient;else if(p.includes('/visits/patient/'))body={visits:[]};
 await r.respond({status,contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto(origin+'/dashboard/appointments',{waitUntil:'networkidle2',timeout:90000}); await page.waitForFunction(()=>[...document.querySelectorAll('[data-appointment-block]')].some(e=>e.textContent.includes('Old Day Patient')));
 const input=await page.$('input[type=date]');const old=await input.evaluate(e=>e.value);const next='2099-01-01';await input.click({clickCount:3});await input.press('Backspace');await input.type('01012099');await input.press('Tab');
 await page.waitForFunction(date=>document.querySelector('input[type=date]')?.value===date,{timeout:5000},next);await page.waitForFunction(()=>document.body.innerText.includes('Failed to load schedule'),{timeout:15000}).catch(()=>{});
 const observed=await page.evaluate(()=>({text:document.body.innerText, blocks:[...document.querySelectorAll('[data-appointment-block]')].map(e=>e.innerText)})); console.log(JSON.stringify({old,next,sawFailure,blocks:observed.blocks})); assert(sawFailure); assert(observed.text.includes('Failed to load schedule')); assert(!observed.text.includes('Old Day Patient'), 'Previous date patient must not appear after a failed schedule load'); console.log('PASS failed date change hides the previous patient and shows retry');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
