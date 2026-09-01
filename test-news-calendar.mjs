import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('./gs-news-calendar.js',import.meta.url),'utf8');
const index=await fs.readFile(new URL('./index.html',import.meta.url),'utf8');
const sw=await fs.readFile(new URL('./sw.js',import.meta.url),'utf8');
const sandbox={window:{fetch:globalThis.fetch},Date,URL,encodeURIComponent,setInterval(){}};
vm.runInNewContext(source,sandbox,{filename:'gs-news-calendar.js'});
const client=sandbox.window.GoldSignalsNewsCalendar;

assert.ok(client,'read-only news/calendar client must load');
assert.match(index,/id="newsCalendarCard"/);
assert.match(index,/gs-news-calendar\.js\?v=16/);
assert.match(sw,/goldsSignals-shell-v16/);
assert.doesNotMatch(source,/computeServerSignal|runSignalCycle|queueTelegramDelivery|method\s*:\s*['"]POST['"]/,
  'the PWA news/calendar view must not own signal, risk or notification decisions');

const calls=[];
const response=await client.getJson('/calendar?limit=10',async(url,options)=>{
  calls.push({url,options});
  return {ok:true,status:200,json:async()=>({ok:true,readOnly:true,decisionOwner:'worker',events:[]})};
});
assert.equal(response.readOnly,true);
assert.equal(response.decisionOwner,'worker');
assert.equal(calls.length,1);
assert.equal(calls[0].url,`${client.WORKER_BASE}/calendar?limit=10`);
assert.equal(calls[0].options.method,'GET');
assert.equal(calls[0].options.cache,'no-store');

assert.equal(client.countdown(Date.UTC(2026,8,1,10,30),Date.UTC(2026,8,1,10,0)),'بعد 30د');
console.log('PWA read-only news/calendar tests passed');
