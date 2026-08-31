import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {
  computeServerSignal,evaluateCandleQuality,runServerBacktest
} from '../worker-tick-history/signal-engine.js';

const clientSource=await fs.readFile(new URL('./gs-backtest-client.js',import.meta.url),'utf8');
const appSource=await fs.readFile(new URL('./app.js',import.meta.url),'utf8');
const indexSource=await fs.readFile(new URL('./index.html',import.meta.url),'utf8');
const sandbox={window:{},Date,URL,encodeURIComponent};
vm.runInNewContext(clientSource,sandbox,{filename:'gs-backtest-client.js'});
const client=sandbox.window.GSXBacktestClient;

assert.ok(client,'the official backtest client must load');
assert.deepEqual([...client.OFFICIAL_TIMEFRAMES],['1m','5m','15m','30m','60m','240m','1d']);
assert.equal(/simulateTrades/.test(appSource),false,'the loaded PWA must not contain the legacy simulator');
assert.equal(/btStrict|btWalk/.test(appSource),false,'local Strict/Walk-forward controls must not affect runBacktest');
assert.match(appSource,/client\.runOfficialBacktest\(/,'runBacktest must delegate to the official endpoint client');
for (const tf of client.OFFICIAL_TIMEFRAMES) {
  assert.match(indexSource,new RegExp(`value=["']${tf}["']`),`the PWA must expose ${tf}`);
}

function makeTrend(direction,count,stepMs,end) {
  const rows=[];
  let price=direction==='up'?2400:2600;
  for (let index=0;index<count;index++) {
    const o=price,c=direction==='up'?o+0.8:o-0.8;
    rows.push({t:end-(count-1-index)*stepMs,o,h:Math.max(o,c)+0.1,l:Math.min(o,c)-0.1,c,v:10});
    price=c+(direction==='up'?0.12:-0.12);
  }
  return rows;
}

for (const tf of client.OFFICIAL_TIMEFRAMES) {
  const calls=[];
  const frames=await client.fetchOfficialFrames(async url=>{
    calls.push(url);
    return {ok:true,status:200,json:async()=>makeTrend('up',60,client.TF_MS[tf],Date.now()-client.TF_MS[tf])};
  },tf);
  assert.deepEqual(Object.keys(frames),[tf,...client.HIGHER_TIMEFRAMES[tf]]);
  assert.equal(calls.length,1+client.HIGHER_TIMEFRAMES[tf].length);
}

const parityAt=Date.UTC(2026,7,27,16,0,0);
const parityFrames={
  '1m':makeTrend('up',120,60_000,parityAt-60_000),
  '5m':makeTrend('up',80,300_000,parityAt-300_000),
  '15m':makeTrend('up',60,900_000,parityAt-900_000)
};
const officialFilters={nyFilterOn:false,pivotFilterOn:false};
const direct=computeServerSignal(parityFrames['1m'],{
  tf:'1m',
  mtf:[{tf:'5m',bars:parityFrames['5m']},{tf:'15m',bars:parityFrames['15m']}],
  live:{price:parityFrames['1m'].at(-1).c,ts:parityAt,receivedAt:parityAt,source:'backtest'},
  barsSource:'backtest',dataQuality:evaluateCandleQuality(parityFrames['1m'],'1m'),
  filters:officialFilters,news:null,evaluationAt:parityAt
});
assert.equal(direct.side,'buy','the deterministic fixture must produce a signal');

let requestBody=null;
const payload=await client.runOfficialBacktest({
  fetchImpl:async (url,options)=>{
    assert.equal(url,`${client.WORKER_BASE}/backtest`);
    requestBody=JSON.parse(options.body);
    const result=runServerBacktest({
      ...requestBody,filters:officialFilters,news:null,startAt:parityAt,endAt:parityAt
    });
    return {
      ok:true,status:200,
      json:async()=>({...result,settingsSource:'official-server',newsMode:'disabled-historical'})
    };
  },
  timeframe:'1m',
  frames:{...parityFrames,'1m':[...parityFrames['1m'],{t:parityAt,o:9000,h:9001,l:8990,c:8991,v:1}]},
  endAt:parityAt,
  filters:{nyFilterOn:true,pivotFilterOn:true},news:{safety:{blockTechnicalSignal:true}},
  strict:true,walkForward:true,PRO_MODE:true
});

assert.deepEqual(Object.keys(requestBody).sort(),['endAt','frames','maxEvaluations','tf']);
assert.equal(payload.engine,'computeServerSignal');
assert.equal(payload.settingsSource,'official-server');
assert.equal(payload.trades.length,1);
const signal=payload.trades[0].signal;
for (const field of ['side','score','bull','bear','regime','entry','tp1','tp2','sl','conf','atr','lastClose','livePrice','signalBarTs']) {
  const expected=field==='signalBarTs'?direct.lastTs:direct[field];
  assert.deepEqual(signal[field],expected,`${field} must match computeServerSignal field-by-field`);
}
assert.deepEqual(signal.mtf,direct.mtf);
assert.deepEqual(signal.reasons,direct.reasons);
assert.equal(signal.entry,parityFrames['1m'].at(-1).c,'the incomplete candle must be excluded');

console.log('PWA official backtest tests passed');
