// safety: prevent crash if helper isn't loaded yet
if (typeof window !== 'undefined' && typeof window.wireExportBtn !== 'function') {
  window.wireExportBtn = function(){ /* no-op */ };
}

/* ======================= GoldSignals • app.js (PRO+) ======================= */
/* --------- إعداد عام --------- */
const LIVE_SOURCES = [
  { url:'https://goldsignalsx-worker.samer-mourtada.workers.dev/price', label:'GoldSignalsX Worker', fallback:false },
  { url:'https://workerjs.samer-mourtada.workers.dev/price', label:'workerjs', fallback:true },
  { url:'https://gold-ticks.samer-mourtada.workers.dev/price', label:'gold-ticks', fallback:true }
];
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const LIVE_REFRESH_SEC = 2;
const LIVE_ARRIVAL_MAX_MS = 20000;
const LIVE_MARKET_MAX_MS = 90000;
const BASE_DATA_MAX_AGE_MS = 30*60*1000;
const TABLE_ROWS       = 80;

const $=(id)=>document.getElementById(id);

/* عناصر DOM */
const elCsvInput=$('csvInput'), elBtnRun=$('runBtn');
const elTf5=$('tf5'), elTf30=$('tf30'), elTf60=$('tf60'), elTfD=$('tfD');
const elProMode=$('proMode'), elMtfConfirm=$('mtfConfirm');
const elLivePrice=$('livePrice'), elLiveTime=$('liveTime'), elLiveStatus=$('liveStatus');
const elSummaryText=$('summaryText'), elAdviceText=$('adviceText');
const elIndRSI=$('indRSI'), elIndMACD=$('indMACD'), elIndEMAF=$('indEMAF'), elIndEMAS=$('indEMAS');
const elIndStoch=$('indStoch'), elIndBB=$('indBB');
const elPivotP=$('pivotP'), elR1=$('r1'), elR2=$('r2'), elR3=$('r3'), elS1=$('s1'), elS2=$('s2'), elS3=$('s3');
const elRowsBody=$('rowsBody');
const elEmaFast=$('emaFast'), elEmaSlow=$('emaSlow'), elRsiPeriod=$('rsiPeriod');
const elAtrPeriod=$('atrPeriod'), elSlMult=$('slMult'), elTp1Mult=$('tp1Mult'), elTp2Mult=$('tp2Mult');
const elAtrMinPct=$('atrMinPct'), elAtrMaxPct=$('atrMaxPct');
const elAcctSize=$('acctSize'), elRiskPct=$('riskPct');
const elUseStoch=$('useStoch'), elStochK=$('stochK'), elStochD=$('stochD');
const elUseBB=$('useBB'), elBBPeriod=$('bbPeriod'), elBBStd=$('bbStd');
const elAlertEnable=$('alertEnable'), elAlertDist=$('alertDistance');
const elToggleNyHours=$('toggleNyHours'), elTogglePivotFilter=$('togglePivotFilter');

/* عناصر Backtest */
const elBtCsv=$('btCsv'), elBtTf=$('btTf');
const elBtRun=$('btRun'), elBtStats=$('btStats'), elBtRows=$('btRows'), elBtEquity=$('btEquity');
const elBtDailyRiskCap=$('btDailyRiskCap');

/* تنسيقات */
const nf2=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const nf4=new Intl.NumberFormat('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
const dtfNY=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
function fmtLocalDateTime(ts){const d=new Date(ts);return `${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} ${d.toLocaleDateString('en-CA')}`;}
function toLocalDate(ts){return new Date(ts).toLocaleDateString('en-CA');}
function toLocalTime(ts){return new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}

/* إعدادات */
let EMA_FAST=12, EMA_SLOW=26, RSI_PER=14;
let ATR_PERIOD=14, SL_ATR_MULT=1.5, TP1_ATR_MULT=1.0, TP2_ATR_MULT=2.0, ATR_MIN_PCT=0.05, ATR_MAX_PCT=0.80;
let ACCT_SIZE=10000, RISK_PCT=1.0;
let PRO_MODE=false, MTF_CONFIRM=true, USE_STOCH=false, STOCH_K=14, STOCH_D=3, USE_BB=false, BB_PERIOD=20, BB_STD=2;
const NY_TRADE_START={hour:8, minute:0}, NY_TRADE_END={hour:17, minute:0};
let PIVOT_MIN_DISTANCE=0.7;
let currentTF=5, LAST_LIVE=null, __cache=null, __alertLockUntil=0;
window.__baseDataFresh=false;
window.__marketDataFresh=false;

function tfLabel(tf){return tf===5?'5 دقائق':tf===30?'30 دقيقة':tf===60?'ساعة':tf===1440?'يوم (NY)':tf+'m';}
function setActiveTF(tf){currentTF=tf;[elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));
  if(tf===5)elTf5?.classList?.add('active'); if(tf===30)elTf30?.classList?.add('active');
  if(tf===60)elTf60?.classList?.add('active'); if(tf===1440)elTfD?.classList?.add('active');}
function loadSettings(){
  const gi=(el,d)=>parseInt(el?.value??d,10), gf=(el,d)=>parseFloat(el?.value??d);
  EMA_FAST=gi(elEmaFast,12); EMA_SLOW=gi(elEmaSlow,26); RSI_PER=gi(elRsiPeriod,14);
  ATR_PERIOD=Math.max(2,gi(elAtrPeriod,14)); SL_ATR_MULT=gf(elSlMult,1.5);
  TP1_ATR_MULT=gf(elTp1Mult,1.0); TP2_ATR_MULT=gf(elTp2Mult,2.0);
  ATR_MIN_PCT=gf(elAtrMinPct,0.05); ATR_MAX_PCT=gf(elAtrMaxPct,0.80);
  ACCT_SIZE=gf(elAcctSize,10000); RISK_PCT=gf(elRiskPct,1.0);
  PRO_MODE=!!elProMode?.checked; MTF_CONFIRM=!!elMtfConfirm?.checked;
  USE_STOCH=!!elUseStoch?.checked; STOCH_K=gi(elStochK,14); STOCH_D=gi(elStochD,3);
  USE_BB=!!elUseBB?.checked; BB_PERIOD=gi(elBBPeriod,20); BB_STD=gf(elBBStd,2);
}

/* ---------------- CSV & تحضير البيانات ---------------- */
function parseCsv(text){
  const lines=text.trim().split(/\r?\n/); if(!lines.length) return [];
  const header=lines[0].toLowerCase(); const out=[];
  if(header.includes('symbol')&&header.includes('date')&&header.includes('time')){
    for(let i=1;i<lines.length;i++){const [sym,d,t,o,h,l,c]=lines[i].split(',');
      if(!d||!t)continue; const ts=Date.parse(`${d}T${t}Z`);
      const open=+o,high=+h,low=+l,close=+c;
      if(Number.isFinite(ts)&&Number.isFinite(close)) out.push({ts,open:Number.isFinite(open)?open:close,high:Number.isFinite(high)?high:close,low:Number.isFinite(low)?low:close,close});
    }
  }else{
    for(let i=1;i<lines.length;i++){const [d,c]=lines[i].split(','); const ts=Date.parse(d), close=+c;
      if(Number.isFinite(ts)&&Number.isFinite(close)) out.push({ts,open:close,high:close,low:close,close});}
  }
  out.sort((a,b)=>a.ts-b.ts); return out;
}
async function fetchCsv(url){
  const u=(url&&url.trim())?url.trim():DEFAULT_5M_CSV; const full=u.startsWith('http')?u:`${u}?t=${Date.now()}`;
  const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(),4000);
  try{
    const r=await fetch(full,{cache:'no-store',signal:ctl.signal}); if(!r.ok) throw new Error(`CSV HTTP ${r.status}`);
    const rows=parseCsv(await r.text()); if(!rows.length) throw new Error('CSV فارغ'); return rows;
  }finally{clearTimeout(to);}
}
function normalizeWorkerBars(payload){
  const source=Array.isArray(payload)?payload:(Array.isArray(payload?.bars)?payload.bars:(Array.isArray(payload?.data)?payload.data:[]));
  return source.map(row=>{
    let ts=typeof row?.t==='string'?Date.parse(row.t):Number(row?.t ?? row?.time);
    if(Number.isFinite(ts)&&ts<1e12) ts*=1000;
    const open=Number(row?.o ?? row?.open), high=Number(row?.h ?? row?.high);
    const low=Number(row?.l ?? row?.low), close=Number(row?.c ?? row?.close);
    return {ts,open,high,low,close};
  }).filter(row=>[row.ts,row.open,row.high,row.low,row.close].every(Number.isFinite)&&row.high>=row.low)
    .sort((a,b)=>a.ts-b.ts);
}
async function fetchWorkerBars(){
  const ctl=new AbortController(), to=setTimeout(()=>ctl.abort(),5000);
  try{
    const url='https://goldsignalsx-worker.samer-mourtada.workers.dev/bars?tf=5m&limit=2000&t='+Date.now();
    const r=await fetch(url,{cache:'no-store',mode:'cors',signal:ctl.signal});
    if(!r.ok) throw new Error(`Worker bars HTTP ${r.status}`);
    const rows=normalizeWorkerBars(await r.json());
    if(rows.length<60) throw new Error('Worker bars غير كافية');
    return {rows,source:r.headers.get('x-gsx-source')||'GoldSignalsX Worker'};
  }finally{clearTimeout(to);}
}
async function loadBaseRows(customUrl){
  if(customUrl) return {rows:await fetchCsv(customUrl),source:'CSV مخصص'};
  try{return await fetchWorkerBars();}
  catch(error){
    console.warn('Worker bars fallback:',error);
    return {rows:await fetchCsv(DEFAULT_5M_CSV),source:'CSV احتياطي'};
  }
}
function updateBaseFreshness(rows,source){
  const lastTs=Number(rows?.[rows.length-1]?.ts), age=Number.isFinite(lastTs)?Math.max(0,Date.now()-lastTs):Infinity;
  window.__baseDataTimeMs=Number.isFinite(lastTs)?lastTs:0;
  window.__baseDataSource=source||'—';
  window.__baseDataFresh=Number.isFinite(age)&&age<=BASE_DATA_MAX_AGE_MS;
  renderLiveStatus();
  return {lastTs,age,fresh:window.__baseDataFresh};
}
function aggregateOHLC(rows, minutes){
  const ms=minutes*60*1000, map=new Map();
  for(const r of rows){const b=Math.floor(r.ts/ms)*ms; let rec=map.get(b);
    if(!rec){rec={ts:b,open:r.open,high:r.high,low:r.low,close:r.close};map.set(b,rec);}
    else{rec.high=Math.max(rec.high,r.high);rec.low=Math.min(rec.low,r.low);rec.close=r.close;}}
  return [...map.values()].sort((a,b)=>a.ts-b.ts);
}
function nyDateKey(ts){const p=dtfNY.formatToParts(new Date(ts));
  return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`;}
function aggregateDailyNY(rows5){
  const map=new Map();
  for(const r of rows5){const key=nyDateKey(r.ts); let rec=map.get(key);
    if(!rec){rec={key,ts:r.ts,open:r.open,high:r.high,low:r.low,close:r.close};map.set(key,rec);}
    else{rec.high=Math.max(rec.high,r.high);rec.low=Math.min(rec.low,r.low);rec.close=r.close;}}
  return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
}

/* ---------------- مؤشرات ---------------- */
function ema(series,p){const out=new Array(series.length).fill(null), k=2/(p+1); let e=null,sum=0;
  for(let i=0;i<series.length;i++){const v=series[i].close; if(i<p){sum+=v;if(i===p-1){e=sum/p;out[i]=e;}}
    else{e=v*k+e*(1-k);out[i]=e;}} return out;}
function sma(series,p){const out=new Array(series.length).fill(null); if(series.length<p) return out;
  let sum=0; for(let i=0;i<series.length;i++){sum+=series[i].close; if(i>=p) sum-=series[i-p].close; if(i>=p-1) out[i]=sum/p;} return out;}
function rsi(series,period=14){const out=new Array(series.length).fill(null); if(series.length<=period) return out;
  let g=0,l=0; for(let i=1;i<=period;i++){const d=series[i].close-series[i-1].close; if(d>=0)g+=d; else l-=d;}
  let ag=g/period, al=l/period; out[period]=al===0?100:100-(100/(1+(ag/al)));
  for(let i=period+1;i<series.length;i++){const d=series[i].close-series[i-1].close, G=d>0?d:0, L=d<0?-d:0;
    ag=(ag*(period-1)+G)/period; al=(al*(period-1)+L)/period; out[i]=al===0?100:100-(100/(1+(ag/al)));} return out;}
function macd(series,fast=12,slow=26,signal=9){
  const emaF=ema(series,fast), emaS=ema(series,slow);
  const m=series.map((_,i)=> (emaF[i]==null||emaS[i]==null)?null:emaF[i]-emaS[i]);
  const pts=m.map((v,i)=>({ts:series[i].ts,close:(v==null)?NaN:v})), clean=pts.filter(p=>Number.isFinite(p.close));
  const sigClean=ema(clean,signal), sigFull=new Array(series.length).fill(null);
  for(let i=0,j=0;i<series.length;i++){ if(Number.isFinite(pts[i]?.close)) sigFull[i]=sigClean[j++]; }
  return {emaF,emaS,macd:m,signal:sigFull};
}
function atr(series,period=14){
  if(!series?.length) return []; const tr=new Array(series.length).fill(null);
  for(let i=0;i<series.length;i++){const h=series[i].high,l=series[i].low;
    if(i===0){tr[i]=h-l;continue;} const pc=series[i-1].close; tr[i]=Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc));}
  const out=new Array(series.length).fill(null); let sum=0;
  for(let i=0;i<series.length;i++){const v=tr[i]; if(i<period){sum+=v;if(i===period-1) out[i]=sum/period;}
    else out[i]=(out[i-1]*(period-1)+v)/period;} return out;}
function stochastic(series,kP=14,dP=3){
  const k=new Array(series.length).fill(null), d=new Array(series.length).fill(null);
  for(let i=0;i<series.length;i++){ if(i<kP-1) continue; let hh=-Infinity,ll=Infinity;
    for(let j=i-kP+1;j<=i;j++){hh=Math.max(hh,series[j].high); ll=Math.min(ll,series[j].low);}
    const c=series[i].close, denom=hh-ll; k[i]=(denom===0)?50:((c-ll)/(hh-ll))*100;
    let s=0,cnt=0; for(let j=i-dP+1;j<=i;j++){ if(j>=0 && Number.isFinite(k[j])){s+=k[j];cnt++;} } d[i]=(cnt>0)?s/cnt:null; }
  return {k,d};}
function bollinger(series,p=20,std=2){
  const mid=sma(series,p), up=new Array(series.length).fill(null), dn=new Array(series.length).fill(null);
  for(let i=0;i<series.length;i++){ if(i<p-1||!Number.isFinite(mid[i])) continue; let s2=0;
    for(let j=i-p+1;j<=i;j++){const diff=series[j].close-mid[i]; s2+=diff*diff;} const sd=Math.sqrt(s2/p);
    up[i]=mid[i]+std*sd; dn[i]=mid[i]-std*sd; } return {mid,up,dn};}

/* ---------------- تصنيف الإشارة ---------------- */
function classifyBase(rsiVal,macdVal){ if(macdVal==null||rsiVal==null) return 'حيادي';
  if(macdVal>0&&rsiVal>=50&&rsiVal<=70) return 'شراء'; if(macdVal<0&&rsiVal<=50) return 'بيع'; return 'حيادي';}
function classifyPrecise({rsiVal,macdNow,macdPrev,macdSig,price,emaF,emaS}){
  if([rsiVal,macdNow,emaF,emaS].some(v=>!Number.isFinite(v))) return 'حيادي';
  const up=Number.isFinite(macdPrev)&&macdPrev<=macdSig&&macdNow>macdSig;
  const dn=Number.isFinite(macdPrev)&&macdPrev>=macdSig&&macdNow<macdSig;
  if((up||macdNow>macdSig)&&price>emaF&&emaF>emaS&&rsiVal>50&&rsiVal<68) return 'شراء';
  if((dn||macdNow<macdSig)&&price<emaF&&emaF<emaS&&rsiVal<50) return 'بيع';
  return 'حيادي';
}
function classifyFinal(ctx){return PRO_MODE?classifyPrecise(ctx):classifyBase(ctx.rsiVal,ctx.macdNow);}

/* ---------------- Pivot (NY) ---------------- */
function calcPivotsFromDailyNY(dailyNY){
  if(!dailyNY||dailyNY.length<2) return null; const y=dailyNY[dailyNY.length-2];
  const H=y.high,L=y.low,C=y.close; if(![H,L,C].every(Number.isFinite)) return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

/* ---------------- فلاتر ---------------- */
function atrPct(atrV,price){return (Number.isFinite(atrV)&&Number.isFinite(price)&&price>0)?(100*atrV/price):NaN;}
function inNyTradingHours(ts){
  if (elToggleNyHours?.checked) return true;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(ts));
  const h=parseInt(parts.find(p=>p.type==='hour').value,10), m=parseInt(parts.find(p=>p.type==='minute').value,10);
  const t=h*60+m, s=NY_TRADE_START.hour*60+NY_TRADE_START.minute, e=NY_TRADE_END.hour*60+NY_TRADE_END.minute;
  return t>=s && t<=e;
}
function priceNearAnyPivot(entry,piv,minDist){
  if(elTogglePivotFilter?.checked) return false;
  if(!piv||!Number.isFinite(entry)) return false;
  const lv=[piv.P,piv.R1,piv.R2,piv.R3,piv.S1,piv.S2,piv.S3].filter(Number.isFinite);
  return lv.some(v=>Math.abs(entry-v)<(minDist??PIVOT_MIN_DISTANCE));
}
function applyExtraFilters(sig,series,i,stoch,bb){
  if(sig==='حيادي') return 'حيادي'; const price=series[i].close;
  if(USE_STOCH&&stoch){const k=stoch.k[i],d=stoch.d[i];
    if(sig==='شراء'){ if(!(Number.isFinite(k)&&Number.isFinite(d)&&k>d&&k<80)) return 'حيادي'; }
    else if(sig==='بيع'){ if(!(Number.isFinite(k)&&Number.isFinite(d)&&k<d&&k>20)) return 'حيادي'; }}
  if(USE_BB&&bb){const mid=bb.mid[i],up=bb.up[i],dn=bb.dn[i];
    if(sig==='شراء'){ if(!(Number.isFinite(mid)&&Number.isFinite(up)&&price>mid&&price<up)) return 'حيادي'; }
    else if(sig==='بيع'){ if(!(Number.isFinite(mid)&&Number.isFinite(dn)&&price<mid&&price>dn)) return 'حيادي'; }}
  return sig;
}
function strongMTFConfirm(rows30,rows60){
  if(!MTF_CONFIRM) return true; if(!rows30?.length) return true;
  const emaF30=ema(rows30,EMA_FAST), emaS30=ema(rows30,EMA_SLOW), mac30=macd(rows30,EMA_FAST,EMA_SLOW,9);
  const i30=rows30.length-1, up30=Number.isFinite(emaF30[i30])&&Number.isFinite(emaS30[i30])&&emaF30[i30]>emaS30[i30]&&mac30.macd[i30]>0;
  const dn30=Number.isFinite(emaF30[i30])&&Number.isFinite(emaS30[i30])&&emaF30[i30]<emaS30[i30]&&mac30.macd[i30]<0;
  if(!rows60?.length) return (up30||dn30);
  const emaF60=ema(rows60,EMA_FAST), emaS60=ema(rows60,EMA_SLOW), i60=rows60.length-1;
  const up60=Number.isFinite(emaF60[i60])&&Number.isFinite(emaS60[i60])&&emaF60[i60]>emaS60[i60];
  const dn60=Number.isFinite(emaF60[i60])&&Number.isFinite(emaS60[i60])&&emaF60[i60]<emaS60[i60];
  return (up30&&up60)||(dn30&&dn60);
}

/* ---------------- إشارة + نصيحة ---------------- */
function rsiMacdContext(series,rsiArr,macdObj,i){return {rsiVal:rsiArr[i],macdNow:macdObj.macd[i],macdPrev:macdObj.macd[i-1],macdSig:macdObj.signal[i],price:series[i].close,emaF:macdObj.emaF[i],emaS:macdObj.emaS[i]};}

/* تعديل صغير لضمان إنّ سعر الدخول ما يساوي السعر الحي تمامًا */
function adjustEntry(entry,priceNow,atrV,side){
  if(!Number.isFinite(entry)||!Number.isFinite(priceNow)||!Number.isFinite(atrV)) return entry;
  const EPS=0.01;
  if(Math.abs(entry-priceNow)<EPS){
    const bump=Math.max(0.2*atrV, EPS*2);
    return side==='شراء'?priceNow+bump:priceNow-bump;
  }
  return entry;
}

function calcPositionSize(entry,sl){const risk=ACCT_SIZE*(RISK_PCT/100), dist=Math.abs(entry-sl); if(!Number.isFinite(risk)||!Number.isFinite(dist)||dist<=0) return null; return {riskAmt:risk,units:risk/dist};}


// === helper: decide market mode from bb/atr (no events) ===
function marketModeFromMetrics(bbPct, atrPct) {
  const n = x => (x == null || Number.isNaN(x) ? null : +x);
  bbPct = n(bbPct); atrPct = n(atrPct);
  if (bbPct == null || atrPct == null) return 'unknown';
  if (atrPct < 0.25 && bbPct > 35 && bbPct < 65) return 'range';
  return 'trend';
}

function filteredSignal(tf,series,rsiArr,macdObj,atrArr,rows5Ref,rows30Ref,rows60Ref,piv,stochObj,bbObj){
  const i=series.length-1;
  const ctx=rsiMacdContext(series,rsiArr,macdObj,i);
  let sig=classifyFinal(ctx);

  // ساعات نيويورك
  if(!inNyTradingHours(series[i].ts)) sig='حيادي';

  // ATR% حدود
  const ap=atrPct(atrArr?.[i],series[i].close);
  if(Number.isFinite(ap)&&(ap<ATR_MIN_PCT||ap>ATR_MAX_PCT)) sig='حيادي';

  // تأكيد متعدد الأطر
  if(tf===5 && sig!=='حيادي' && rows30Ref){
    if(!strongMTFConfirm(rows30Ref,rows60Ref)) sig='حيادي';
  }

  // فلاتر Stoch/BB
  sig = applyExtraFilters(sig,series,i,stochObj,bbObj);

  // === NEW: make Auto obey market mode ===
  try {
    // اقرأ القيم اللي يصدّرها gs-market-metrics (إن وجدت)
    const bbFromState  = (window.gs && window.gs.market && window.gs.market.bbPct) ?? window.__gsBBPCT;
    const atrFromState = (window.gs && window.gs.market && window.gs.market.atrPct) ?? window.__gsATRPCT;
    const autoMode = marketModeFromMetrics(bbFromState, atrFromState); // 'trend' | 'range' | 'unknown'

    // إذا الوضع المختار تلقائي، اعمل override لطبيعة الفلاتر
    // ملاحظة: ما منلمس الإعدادات اليدوية (إذا المستخدم مشغل/مطفّي BB و Stoch بإيده خارج Auto).
    const isAuto = true; // إذا عندك متغير لحالة Auto، بدّله بدل true
    if (isAuto) {
      if (autoMode === 'range') {
        // في حالة الرينج: إذا BB غير مفعّل، شدّد وخلّيها حيادي
        if (sig!=='حيادي' && !USE_BB) sig='حيادي';
      } else if (autoMode === 'trend') {
        // في حالة الترند: لا تحيّد الإشارة بسبب override قديم
        // (ما في إجراء؛ خَلّي sig كما هي بعد الفلاتر)
      }
      // إذا unknown: لا تغيّر شي
    }
  } catch {}

  // Pivot filter بالنهاية
  if(sig!=='حيادي' && piv){
    const price=series[i].close, emaS=macdObj.emaS[i];
    let e=(sig==='شراء')?Math.max(price,Number.isFinite(emaS)?emaS:price)
                        :Math.min(price,Number.isFinite(emaS)?emaS:price);
    e=adjustEntry(e,price,atrArr?.[i]??0.5,sig);
    if(priceNearAnyPivot(e,piv,PIVOT_MIN_DISTANCE)) sig='حيادي';
  }
  return sig;

}

/* ——— نصيحة مكتوبة دائمًا مع أرقام الدخول/الوقف/الأهداف ——— */
function buildAdvice(tf,series,rsiArr,macdObj,piv,live,atrArr,rows5,rows30,rows60,stoch,bb){
  if(!series?.length) return '—';
  const i=series.length-1, emaS=macdObj.emaS[i], last=series[i].close;
  const nowPx=(live&&(Date.now()-live.timeMs)<20000&&Number.isFinite(live.price))?live.price:last;

  const sigFiltered=filteredSignal(tf,series,rsiArr,macdObj,atrArr,rows5,rows30,rows60,piv,stoch,bb);
  const ctx=rsiMacdContext(series,rsiArr,macdObj,i);
  const sigSummary=classifyFinal(ctx);

  const atrV=atrArr?.[i] ?? Math.max(0.3, Math.abs(series[i].high-series[i].low));
  const atrp=atrPct(atrV,nowPx);

  const mkLines=(side)=>{ let entry=(side==='شراء')?Math.max(nowPx,Number.isFinite(emaS)?emaS:nowPx):Math.min(nowPx,Number.isFinite(emaS)?emaS:nowPx);
    entry=adjustEntry(entry,nowPx,atrV,side); const sl=(side==='شراء')?entry-SL_ATR_MULT*atrV:entry+SL_ATR_MULT*atrV;
    const tp1=(side==='شراء')?entry+TP1_ATR_MULT*atrV:entry-TP1_ATR_MULT*atrV;
    const tp2=(side==='شراء')?entry+TP2_ATR_MULT*atrV:entry-TP2_ATR_MULT*atrV; return {entry,sl,tp1,tp2}; };

  if(sigFiltered!=='حيادي'){
    const L=mkLines(sigFiltered);
    const ps=calcPositionSize(L.entry,L.sl);
    const sizeTxt=ps?` • حجم تقريبي: ${nf2.format(ps.units)} وحدة (مخاطرة ≈ ${nf2.format(ps.riskAmt)}$)`:''; 
    const extra=`ATR%: ${Number.isFinite(atrp)?nf2.format(atrp):'—'} • آخر سعر (حي): ${nf2.format(nowPx)}`;
    return `الإطار: ${tfLabel(tf)} • الإشارة: ${sigFiltered}.
سعر الدخول: ${nf2.format(L.entry)} • وقف الخسارة: ${nf2.format(L.sl)}
الأهداف: ${nf2.format(L.tp1)} (جزئي/نقل إلى BE) ثم ${nf2.format(L.tp2)}.
${extra}${sizeTxt}`;
  }

  if(sigSummary==='شراء'||sigSummary==='بيع'){
    const reasons=[];
    if(!(elToggleNyHours?.checked) && !inNyTradingHours(series[i].ts)) reasons.push('خارج ساعات نيويورك');
    const ap=atrPct(atrV,nowPx); if(Number.isFinite(ap)&&(ap<ATR_MIN_PCT||ap>ATR_MAX_PCT)) reasons.push('ATR% خارج النطاق');
    if(tf===5 && MTF_CONFIRM && !(strongMTFConfirm(rows30,rows60))) reasons.push('فشل تأكيد MTF');
    if(piv){ let tmp=mkLines(sigSummary).entry; if(!(elTogglePivotFilter?.checked) && priceNearAnyPivot(tmp, piv, PIVOT_MIN_DISTANCE)) reasons.push('قريب جدًا من Pivot'); }
    const L=mkLines(sigSummary);
    return `الإطار: ${tfLabel(tf)} • الملخص: ${sigSummary} ${reasons.length ? ` (مرفوض بالفلاتر: ${reasons.join(' • ')})` : ''}.
(إطلاع فقط) دخول افتراضي: ${nf2.format(L.entry)} • SL: ${nf2.format(L.sl)} • TP1/TP2: ${nf2.format(L.tp1)} / ${nf2.format(L.tp2)}.
ATR%: ${Number.isFinite(atrp)?nf2.format(atrp):'—'} • آخر سعر: ${nf2.format(nowPx)}.`;
  }

  let base=`الإطار: ${tfLabel(tf)} • الإشارة: حيادي. `;
  if(Number.isFinite(atrp)) base+=`ATR%: ${nf2.format(atrp)}. `;
  return base+`آخر سعر: ${nf2.format(nowPx)}.`;
}

/* ---------------- رسم/واجهة ---------------- */
function paintLive(price,ts){ if(elLivePrice&&Number.isFinite(price)) elLivePrice.textContent=nf2.format(price); if(elLiveTime&&ts) elLiveTime.textContent=fmtLocalDateTime(ts);}
function parseMarketTime(raw){
  let ts=typeof raw==='string'?Date.parse(raw):Number(raw);
  if(!Number.isFinite(ts)) return null;
  if(ts<1e12) ts*=1000;
  return ts;
}
function renderLiveStatus(){
  if(!elLiveStatus) return;
  const now=Date.now(), received=Number(window.__liveTimeMs), market=Number(window.__marketTimeMs);
  const arrivalAge=Number.isFinite(received)&&received>0?Math.max(0,now-received):Infinity;
  const marketAge=Number.isFinite(market)&&market>0?Math.max(0,now-market):null;
  const baseTime=Number(window.__baseDataTimeMs);
  const baseAge=Number.isFinite(baseTime)&&baseTime>0?Math.max(0,now-baseTime):Infinity;
  const baseFresh=window.__baseDataFresh===true;
  const fresh=baseFresh && arrivalAge<=LIVE_ARRIVAL_MAX_MS && (marketAge==null || marketAge<=LIVE_MARKET_MAX_MS);
  window.__marketDataFresh=fresh;

  const source=window.__liveSource||'—';
  const arrivalText=Number.isFinite(arrivalAge)?`${Math.floor(arrivalAge/1000)}ث`:'—';
  const marketText=marketAge==null?'غير متاح':`${Math.floor(marketAge/1000)}ث`;
  const baseText=Number.isFinite(baseAge)?`${Math.floor(baseAge/60000)}د`:'—';
  const state=!baseFresh?'شموع قديمة':(fresh?(window.__liveFallback?'احتياطي':'مباشر'):(Number.isFinite(arrivalAge)?'متأخر':'منقطع'));
  elLiveStatus.textContent=`السعر: ${source} • الشموع: ${window.__baseDataSource||'—'} (${baseText}) • الحالة: ${state} • عمر الوصول: ${arrivalText} • تأخير السوق: ${marketText}`;
  elLiveStatus.style.color=fresh?(window.__liveFallback?'#f59e0b':'#10b981'):'#ef4444';

  const alertButton=document.getElementById('sendAlertBtn');
  if(alertButton){
    alertButton.disabled=!fresh;
    alertButton.title=fresh?'':'السعر متأخر أو منقطع';
  }
}
function paintIndicators(rsiVal,macdVal,emaFv,emaSv,stK,stD,bbMid,bbUp,bbDn){
  if(elIndRSI)  elIndRSI.textContent  = Number.isFinite(rsiVal)?nf2.format(rsiVal):'—';
  if(elIndMACD) elIndMACD.textContent = Number.isFinite(macdVal)?nf4.format(macdVal):'—';
  if(elIndEMAF) elIndEMAF.textContent = Number.isFinite(emaFv)?nf2.format(emaFv):'—';
  if(elIndEMAS) elIndEMAS.textContent = Number.isFinite(emaSv)?nf2.format(emaSv):'—';
  if(elIndStoch) elIndStoch.textContent=(Number.isFinite(stK)||Number.isFinite(stD))?`${Number.isFinite(stK)?nf2.format(stK):'—'} / ${Number.isFinite(stD)?nf2.format(stD):'—'}`:'—';
  if(elIndBB) elIndBB.textContent=(Number.isFinite(bbMid)||Number.isFinite(bbUp)||Number.isFinite(bbDn))?`${Number.isFinite(bbMid)?nf2.format(bbMid):'—'} / ${Number.isFinite(bbUp)?nf2.format(bbUp):'—'} / ${Number.isFinite(bbDn)?nf2.format(bbDn):'—'}`:'—';
}
function paintPivots(p){ if(!p) return;
  elPivotP&&(elPivotP.textContent=nf2.format(p.P));
  elR1&&(elR1.textContent=nf2.format(p.R1));
  elR2&&(elR2.textContent=nf2.format(p.R2));
  elR3&&(elR3.textContent=nf2.format(p.R3));
  elS1&&(elS1.textContent=nf2.format(p.S1));
  elS2&&(elS2.textContent=nf2.format(p.S2));
  elS3&&(elS3.textContent=nf2.format(p.S3));
}
function paintTable(rows){
  if (!elRowsBody || !Array.isArray(rows)) return;
  elRowsBody.innerHTML='';
  const last=rows.slice(-TABLE_ROWS).reverse();
  for(const r of last){
    const s=classifyBase(r.rsi, r.macd);
    const color=(s==='شراء')?'#10b981':(s==='بيع')?'#ef4444':'#f59e0b';
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${r.date}</td>
      <td>${r.time}</td>
      <td>${Number.isFinite(r.price)?nf2.format(r.price):'—'}</td>
      <td style="color:${color};font-weight:600">${s}</td>
      <td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td>
      <td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td>
      <td>${Number.isFinite(r.emaF)?nf2.format(r.emaF):'—'}</td>`;
    elRowsBody.appendChild(tr);
  }
}

/* ======= شارت ======= */
function makeHiDPICanvas(c){const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,3)), r=c.getBoundingClientRect(); c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr); const ctx=c.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return ctx;}
let __raf=0;
function renderTradeChart(series,lines){
  const canvas=document.getElementById('tradeChart'); if(!canvas||!series?.length) return;
  cancelAnimationFrame(__raf); __raf=requestAnimationFrame(()=>{
    const ctx=makeHiDPICanvas(canvas), W=canvas.clientWidth, H=canvas.clientHeight;
    ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,W,H);
    const data=series.slice(-120);
    let minY=Math.min(...data.map(d=>d.low)), maxY=Math.max(...data.map(d=>d.high));
    const add=v=>{if(Number.isFinite(v)){minY=Math.min(minY,v);maxY=Math.max(maxY,v);}};
    add(lines?.entry);add(lines?.sl);add(lines?.tp1);add(lines?.tp2);add(window.__livePrice);
    if(minY===maxY){minY-=1;maxY+=1;} const pad=(maxY-minY)*0.08; minY-=pad; maxY+=pad;
    const x0=46,x1=W-12,y0=16,y1=H-24, plotW=x1-x0, plotH=y1-y0;
    const xAt=i=>x0+(i/(data.length-1))*plotW, yAt=v=>y1-((v-minY)/(maxY-minY))*plotH;

    ctx.strokeStyle='#223047'; ctx.lineWidth=1; ctx.font='12px system-ui'; ctx.fillStyle='#9ca3af'; ctx.textAlign='right'; ctx.textBaseline='middle';
    for(let g=0;g<=4;g++){const yVal=minY+(g/4)*(maxY-minY), y=Math.round(yAt(yVal))+0.5; ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); ctx.fillText(nf2.format(yVal),x0-6,y);}

    const cw=Math.max(2, (x1-x0)/Math.max(30,data.length)*0.7);
    for(let i=0;i<data.length;i++){
      const d=data[i], x=xAt(i), yH=yAt(d.high), yL=yAt(d.low), yO=yAt(d.open), yC=yAt(d.close), bull=d.close>=d.open;
      ctx.strokeStyle=bull?'#16a34a':'#ef4444'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL); ctx.stroke();
      const xL=x-cw/2,xR=x+cw/2;
      ctx.beginPath(); ctx.moveTo(xL,yO); ctx.lineTo(xR,yO); ctx.lineTo(xR,yC); ctx.lineTo(xL,yC); ctx.closePath();
      ctx.fillStyle=bull?'#16a34a':'#ef4444'; ctx.globalAlpha=0.85; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    }
    function drawH(val,color,label){
      if(!Number.isFinite(val)) return; const y=Math.round(yAt(val))+0.5;
      ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=2; ctx.setLineDash([6,5]);
      ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); ctx.setLineDash([]);
      const tag=`${label}: ${nf2.format(val)}`, tw=ctx.measureText(tag).width+10, th=18, bx=x0+8, by=y-th-6;
      ctx.fillStyle='#0b1220'; ctx.strokeStyle=color; ctx.lineWidth=1;
      ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(bx,by,tw,th,6); else ctx.rect(bx,by,tw,th); ctx.fill(); ctx.stroke();
      ctx.fillStyle=color; ctx.font='12px system-ui'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(tag,bx+6,by+th/2);
      ctx.restore();
    }
    drawH(lines?.entry,'#60a5fa','Entry');
    drawH(lines?.tp1,'#22c55e','TP1'); drawH(lines?.tp2,'#22c55e','TP2');
    drawH(lines?.sl,'#f87171','SL');
    if(Number.isFinite(window.__livePrice)) drawH(window.__livePrice,'#ffffff','Live');
  });
}
function paintSummary(rsiVal,macdVal,extras){
  if(!elSummaryText) return;
  const s=classifyFinal({rsiVal,macdNow:macdVal,macdPrev:extras?.macdPrev,macdSig:extras?.macdSig,price:extras?.price,emaF:extras?.emaF,emaS:extras?.emaS});
  elSummaryText.textContent=s+(PRO_MODE?' (دقيق)':'');
  elSummaryText.style.color=(s==='شراء')?'#10b981':(s==='بيع')?'#ef4444':'#f59e0b';
}

/* ---------------- السعر الحي (مصدر أساسي ثم احتياطي) ---------------- */
async function fetchLiveQuote(){
  const TIMEOUT_MS = 3000;
  async function get(source){
    const ctl = new AbortController();
    const t = setTimeout(()=>ctl.abort(), TIMEOUT_MS);
    try{
      const r = await fetch(source.url + (source.url.includes('?')?'&':'?') + 't=' + Date.now(), {cache:'no-store',mode:'cors', signal: ctl.signal});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const ct=(r.headers.get('content-type')||'').toLowerCase();
      if(ct.includes('json')){
        const j=await r.json();
        const price=Array.isArray(j)?Number(j[0]):Number(j?.price);
        if(!Number.isFinite(price)) throw new Error('bad price');
        const marketTs=parseMarketTime(j?.ts ?? j?.time ?? j?.timestamp);
        const reportedAge=Number(j?.ageMs);
        const ageMs=Number.isFinite(reportedAge)?Math.max(0,reportedAge):(marketTs?Math.max(0,Date.now()-marketTs):null);
        if(ageMs!=null && ageMs>LIVE_MARKET_MAX_MS) throw new Error('stale price');
        return {
          price,
          marketTs,
          source:String(j?.source||source.label),
          fallback:source.fallback
        };
      }
      throw new Error('bad json');
    } finally { clearTimeout(t); }
  }
  const errors=[];
  for(const source of LIVE_SOURCES){
    try{return await get(source);}
    catch(error){errors.push(`${source.label}: ${error?.message||error}`);}
  }
  throw new Error(`تعذّر جلب السعر الحي (${errors.join(' | ')})`);
}

/* ---------------- تنبيهات ---------------- */
function beep(){ try{const ac=new (window.AudioContext||window.webkitAudioContext)(), o=ac.createOscillator(), g=ac.createGain();
  o.connect(g); g.connect(ac.destination); o.type='sine'; o.frequency.value=880; g.gain.value=0.05; o.start(); setTimeout(()=>{o.stop();ac.close();},200);}catch{} }
async function webNotify(t,b){ try{ if(!('Notification'in window)) return;
  if(Notification.permission==='granted') new Notification(t,{body:b});
  else if(Notification.permission!=='denied'){const p=await Notification.requestPermission(); if(p==='granted') new Notification(t,{body:b});} }catch{} }
function checkProximityAlert(entry){
  if(!elAlertEnable?.checked || !Number.isFinite(entry) || !Number.isFinite(window.__livePrice)) return;
  const userThr = Math.max(0, parseFloat(elAlertDist?.value || '0.5'));
  const s = window.__lastSeriesForChart, atrNow = (s && atr(s, ATR_PERIOD).slice(-1)[0]) || NaN;
  const dynThr = Number.isFinite(atrNow) ? Math.max(userThr, 0.25 * atrNow) : userThr;
  const dist=Math.abs(window.__livePrice-entry), now=Date.now();
  if(dist<=dynThr && now>__alertLockUntil){
    __alertLockUntil=now+15000;
    const msg=`${tfLabel(currentTF)} • Live ${nf2.format(window.__livePrice)} vs Entry ${nf2.format(entry)}`;
    beep(); webNotify('تنبيه اقتراب',msg);
    if(elLivePrice){elLivePrice.style.transition='color .15s'; elLivePrice.style.color='#67e8f9'; setTimeout(()=>{elLivePrice.style.color='#ffffff';},400);}
  }
}

/* ---------------- Merge live ---------------- */
function mergeLiveIntoSeries(series,tfMin,live){
  if(!series?.length||!live) return series; const ms=tfMin*60*1000, b=Math.floor(live.timeMs/ms)*ms;
  const out=series.slice(), last={...out[out.length-1]};
  if(b===last.ts){last.close=live.price; last.high=Math.max(last.high,live.price); last.low=Math.min(last.low,live.price); out[out.length-1]=last;}
  else if(b>last.ts){out.push({ts:b,open:last.close,high:live.price,low:live.price,close:live.price});}
  return out;
}

/* ---------------- التحليل الرئيسي ---------------- */
function tableFrom(series,rsiArr,mac){ return series.map((p,idx)=>({ts:p.ts,date:toLocalDate(p.ts),time:toLocalTime(p.ts),price:p.close,rsi:rsiArr[idx],macd:mac.macd[idx],emaF:mac.emaF[idx]})); }
function staleBaseAdvice(){
  const ts=Number(window.__baseDataTimeMs);
  const when=Number.isFinite(ts)&&ts>0?fmtLocalDateTime(ts):'غير معروف';
  return `مراقبة فقط: تم منع النصيحة لأن بيانات الشموع قديمة أو غير متاحة. آخر شمعة: ${when} • المصدر: ${window.__baseDataSource||'—'}.`;
}

async function runAnalysis(){
  try{
    loadSettings();
    const csvUrl=elCsvInput?.value?.trim()||'', loaded=await loadBaseRows(csvUrl), rows5=loaded.rows;
    const baseState=updateBaseFreshness(rows5,loaded.source);
    const rows30=aggregateOHLC(rows5,30), rows60=aggregateOHLC(rows5,60), rowsDayNY=aggregateDailyNY(rows5);
    const base=(currentTF===30)?rows30:(currentTF===60)?rows60:(currentTF===1440)?rowsDayNY:rows5;
    const series=(LAST_LIVE)?mergeLiveIntoSeries(base,currentTF,LAST_LIVE):base;

    const rsiArr=rsi(series,RSI_PER), mac=macd(series,EMA_FAST,EMA_SLOW,9), atrArr=atr(series,ATR_PERIOD);
    const stoch=(elUseStoch?.checked)?stochastic(series,STOCH_K,STOCH_D):null, bb=(elUseBB?.checked)?bollinger(series,BB_PERIOD,BB_STD):null;

    const i=series.length-1, px=series[i].close;
    paintSummary(rsiArr[i],mac.macd[i],{macdPrev:mac.macd[i-1],macdSig:mac.signal[i],price:px,emaF:mac.emaF[i],emaS:mac.emaS[i]});
    if(!baseState.fresh&&elSummaryText){elSummaryText.textContent='مراقبة فقط';elSummaryText.style.color='#ef4444';}
    paintIndicators(rsiArr[i],mac.macd[i],mac.emaF[i],mac.emaS[i],stoch?.k[i],stoch?.d[i],bb?.mid[i],bb?.up[i],bb?.dn[i]);

    const piv=calcPivotsFromDailyNY(rowsDayNY); paintPivots(piv);
    paintTable(tableFrom(series,rsiArr,mac));

    const sig=baseState.fresh?filteredSignal(currentTF,series,rsiArr,mac,atrArr,rows5,rows30,rows60,piv,stoch,bb):'حيادي';
    const aNow=atrArr?.[i]??0.5, emaS=mac.emaS[i]; let entry=null;
    if(sig==='شراء') entry=Math.max(px,Number.isFinite(emaS)?emaS:px);
    else if(sig==='بيع') entry=Math.min(px,Number.isFinite(emaS)?emaS:px);
    entry=adjustEntry(entry,px,aNow,sig);
    const lines=(sig==='حيادي')?undefined:{ entry,
      sl: sig==='شراء'? entry-SL_ATR_MULT*aNow : entry+SL_ATR_MULT*aNow,
      tp1: sig==='شراء'? entry+TP1_ATR_MULT*aNow: entry-TP1_ATR_MULT*aNow,
      tp2: sig==='شراء'? entry+TP2_ATR_MULT*aNow: entry-TP2_ATR_MULT*aNow,
    };
    window.__lastBaseSeries=base; window.__lastSeriesForChart=series; window.__lastLinesForChart=lines;
    renderTradeChart(series,lines);

    if(elAdviceText) elAdviceText.textContent=baseState.fresh
      ? buildAdvice(currentTF,series,rsiArr,mac,piv,LAST_LIVE,atrArr,rows5,rows30,rows60,stoch,bb)
      : staleBaseAdvice();
    __cache={tf:currentTF,series,rsiArr,mac,piv,atrArr,rows5,rows30,rows60,stoch,bb,rowsDayNY};

    if(sig!=='حيادي') checkProximityAlert(lines?.entry);
  }catch(err){ alert(`تعذّر تحميل/تحليل البيانات: ${err.message||err}`); console.error(err); }
}
function reprojectWithLive(){
  if(!__cache||!LAST_LIVE) return;
  const {tf,rows5,rows30,rows60,piv}=__cache, base=window.__lastBaseSeries||__cache.series;
  const series=mergeLiveIntoSeries(base,tf,LAST_LIVE);
  const rsiArr=rsi(series,RSI_PER), mac=macd(series,EMA_FAST,EMA_SLOW,9), atrArr=atr(series,ATR_PERIOD);
  const stoch=(elUseStoch?.checked)?stochastic(series,STOCH_K,STOCH_D):null, bb=(elUseBB?.checked)?bollinger(series,BB_PERIOD,BB_STD):null;
  const i=series.length-1, px=series[i].close;
  const sig=window.__baseDataFresh?filteredSignal(tf,series,rsiArr,mac,atrArr,rows5,rows30,rows60,piv,stoch,bb):'حيادي';
  const aNow=atrArr?.[i]??0.5, emaS=mac.emaS[i];
  let entry=null; if(sig==='شراء') entry=Math.max(px,Number.isFinite(emaS)?emaS:px); else if(sig==='بيع') entry=Math.min(px,Number.isFinite(emaS)?emaS:px);
  entry=adjustEntry(entry,px,aNow,sig);
  const lines=(sig==='حيادي')?undefined:{entry,
    sl: sig==='شراء'? entry-SL_ATR_MULT*aNow : entry+SL_ATR_MULT*aNow,
    tp1: sig==='شراء'? entry+TP1_ATR_MULT*aNow: entry-TP1_ATR_MULT*aNow,
    tp2: sig==='شراء'? entry+TP2_ATR_MULT*aNow: entry-TP2_ATR_MULT*aNow};
  window.__lastSeriesForChart=series; window.__lastLinesForChart=lines; renderTradeChart(series,lines);
  if(elAdviceText) elAdviceText.textContent=window.__baseDataFresh
    ? buildAdvice(tf,series,rsiArr,mac,piv,LAST_LIVE,atrArr,rows5,rows30,rows60,stoch,bb)
    : staleBaseAdvice();
  if(sig!=='حيادي') checkProximityAlert(lines?.entry);
}

/* ---------------- تحديث حي ---------------- */
let __liveRefreshPending=false, __spikeCandidate=null;
async function refreshLive(){
  if(__liveRefreshPending || document.hidden) return;
  __liveRefreshPending=true;
  try{
    const quote=await fetchLiveQuote(), price=quote.price, t=Date.now();
    if(Number.isFinite(window.__livePrice)){
      const pct=Math.abs(price-window.__livePrice)/window.__livePrice;
      if(pct>0.007){
        const sameCandidate=__spikeCandidate && __spikeCandidate.source===quote.source &&
          Math.abs(price-__spikeCandidate.price)/Math.max(1,__spikeCandidate.price)<0.001;
        __spikeCandidate=sameCandidate
          ? {price,source:quote.source,count:__spikeCandidate.count+1}
          : {price,source:quote.source,count:1};
        if(__spikeCandidate.count<2){
          console.warn('Spike awaiting confirmation',pct,quote.source);
          return;
        }
      }else{
        __spikeCandidate=null;
      }
    }
    paintLive(price,t);
    window.__livePrice=price;
    window.__liveTimeMs=t;
    window.__marketTimeMs=quote.marketTs||0;
    window.__liveSource=quote.source;
    window.__liveFallback=quote.fallback;
    __spikeCandidate=null;
    LAST_LIVE={price,timeMs:t,marketTimeMs:quote.marketTs||null,source:quote.source};
    renderLiveStatus();
    reprojectWithLive();
  }catch(e){
    console.warn('Live error:',e);
    renderLiveStatus();
  }finally{
    __liveRefreshPending=false;
  }
}

/* ---------------- Backtest Pro (مع Fallback للريبو/الرابط) ---------------- */
function makeHiDPICanvas(c){const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,3)), r=c.getBoundingClientRect(); c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr); const ctx=c.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return ctx;}
function drawEquity(canvas, eq){
  if(!canvas||!eq?.length) return; const ctx=makeHiDPICanvas(canvas), W=canvas.clientWidth, H=canvas.clientHeight;
  ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,W,H);
  const min=Math.min(...eq), max=Math.max(...eq), x0=32,x1=W-8,y0=10,y1=H-18, w=x1-x0,h=y1-y0;
  const xAt=i=>eq.length===1?x0:x0+(i/(eq.length-1))*w, yAt=v=>y1-((v-min)/(max-min||1))*h;
  ctx.strokeStyle='#334155'; ctx.lineWidth=1; for(let g=0;g<=4;g++){const y=yAt(min+(g/4)*(max-min||1));
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); }
  ctx.strokeStyle='#10b981'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(xAt(0),yAt(eq[0]));
  for(let i=1;i<eq.length;i++) ctx.lineTo(xAt(i),yAt(eq[i])); ctx.stroke();
}
/* === Backtest الرسمي: الواجهة تنقل البيانات فقط ولا تتخذ قرار الإشارة === */
async function runBacktest(){
  const oldText=elBtRun?.textContent;
  try{
    const client=window.GSXBacktestClient;
    if(!client) throw new Error('عميل Backtest الرسمي غير محمّل');
    const tf=client.normalizeTimeframe(elBtTf?.value||'5m');
    if(elBtRun){elBtRun.disabled=true;elBtRun.textContent='جارٍ التشغيل…';}

    let frames,source='بيانات Worker الرسمية';
    if (elBtCsv?.files?.length) {
      frames=client.framesFromFiveMinuteRows(parseCsv(await elBtCsv.files[0].text()),tf);
      source='CSV مرفوع (قرارات السيرفر)';
    } else {
      const urlFromTop = elCsvInput?.value?.trim();
      if (urlFromTop) {
        const r = await fetch(urlFromTop, {cache:'no-store'});
        if (!r.ok) throw new Error('تعذّر تحميل CSV من الرابط');
        frames=client.framesFromFiveMinuteRows(parseCsv(await r.text()),tf);
        source='CSV رابط (قرارات السيرفر)';
      } else {
        frames=await client.fetchOfficialFrames(fetch,tf);
      }
    }
    const payload=await client.runOfficialBacktest({fetchImpl:fetch,timeframe:tf,frames,endAt:Date.now()});
    const displayRisk=Math.max(0,parseFloat(elBtDailyRiskCap?.value||'1'));
    const accountSize=Math.max(0,parseFloat(elAcctSize?.value||'10000'));
    const trades=client.presentationTrades(payload,accountSize,displayRisk);
    const stats=client.summarizePresentation(trades);
    const equity=[0];for(const trade of trades)equity.push(equity.at(-1)+trade.pl);

    if(elBtStats){
      const pf=Number.isFinite(stats.pf)?nf2.format(stats.pf):'∞';
      elBtStats.innerHTML =
        `المصدر: <b>computeServerSignal</b> • ${source} • الصفقات: <b>${stats.n}</b> • Win%: <b>${nf2.format(stats.winRate)}</b> • PF: <b>${pf}</b> • `+
        `Expectancy (R): <b>${nf2.format(stats.avgR)}</b> • MaxDD$: <b>${nf2.format(stats.dd)}</b> • PnL$: <b>${nf2.format(stats.pnl)}</b> • `+
        `Filters: <b>${payload.settingsSource}</b>`;
    }
    if(elBtRows){
      elBtRows.innerHTML='';
      trades.slice(-20).reverse().forEach((t,idx)=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${idx+1}</td><td>${toLocalDate(t.ts)} ${toLocalTime(t.ts)}</td><td>${t.side}</td>
          <td>${nf2.format(t.entry)}</td><td>${nf2.format(t.exit)}</td><td>${nf2.format(t.R)}</td><td>${nf2.format(t.pl)}</td>`;
        elBtRows.appendChild(tr);
      });
    }
    drawEquity(elBtEquity, equity);
  }catch(e){ alert(`Backtest فشل: ${e.message||e}`); console.error(e); }
  finally{if(elBtRun){elBtRun.disabled=false;elBtRun.textContent=oldText||'تشغيل الاختبار';}}
}

/* ---------------- أحداث ---------------- */
elBtnRun?.addEventListener('click',runAnalysis);
elTf5?.addEventListener('click',()=>{setActiveTF(5);runAnalysis();});
elTf30?.addEventListener('click',()=>{setActiveTF(30);runAnalysis();});
elTf60?.addEventListener('click',()=>{setActiveTF(60);runAnalysis();});
elTfD?.addEventListener('click',()=>{setActiveTF(1440);runAnalysis();});
[elProMode,elMtfConfirm,elUseStoch,elUseBB,elToggleNyHours,elTogglePivotFilter].forEach(el=>el?.addEventListener('change',runAnalysis));
[elEmaFast,elEmaSlow,elRsiPeriod,elAtrPeriod,elAtrMinPct,elAtrMaxPct,elStochK,elStochD,elBBPeriod,elBBStd,elSlMult,elTp1Mult,elTp2Mult,elAcctSize,elRiskPct]
  .forEach(el=>el?.addEventListener('input',()=>{ if(el===elSlMult||el===elTp1Mult||el===elTp2Mult||el===elAcctSize||el===elRiskPct) reprojectWithLive(); else runAnalysis(); }));

const LS_CSV='gs_csv_url';
if(elCsvInput){
  const saved=localStorage.getItem(LS_CSV)||''; if(!elCsvInput.value&&saved) elCsvInput.value=saved;
  elCsvInput.addEventListener('input',()=>{const v=elCsvInput.value.trim(); if(v) localStorage.setItem(LS_CSV,v); else localStorage.removeItem(LS_CSV);});
}

/* Backtest events */
elBtRun?.addEventListener('click', runBacktest);

/* تشغيل أولي */
setActiveTF(5);
runAnalysis();
refreshLive();
setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
setInterval(renderLiveStatus, 1000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) refreshLive(); });
elAlertEnable?.addEventListener('change',async()=>{
  if(elAlertEnable.checked && 'Notification' in window && Notification.permission==='default'){
    try{await Notification.requestPermission();}catch(_){}
  }
});

/* === PATCH: Enable 'Download merged CSV' button and ensure data is available === */
(function(){
  // 1) keep latest series available for export
  function setSeriesForExport(series){ try{ window.__seriesForExport = Array.isArray(series)? series.slice() : null; }catch{} }
  // Hook into global functions if present
  const _build = window.buildAndRender;
  if (typeof _build === 'function'){
    window.buildAndRender = function(series){
      try{ setSeriesForExport(series); }catch(e){}
      return _build.apply(this, arguments);
    };
  } else {
    // As a fallback, try to watch charting function
    const _render = window.renderTradeChart;
    if (typeof _render === 'function'){
      window.renderTradeChart = function(series){
        try{ setSeriesForExport(series); }catch(e){}
        return _render.apply(this, arguments);
      };
    }
  }

  // 2) merge helper (current TF if available, default 5)
  function mergeWithLive(series){
    const tf = (window.currentTF || 5);
    const live = window.LAST_LIVE;
    if(!Array.isArray(series) || !series.length || !live) return series;
    const ms = tf*60*1000;
    const b = Math.floor((live.timeMs||Date.now())/ms)*ms;
    const out = series.slice();
    const last = Object.assign({}, out[out.length-1]);
    if (b === last.ts){
      last.close = live.price;
      last.high = Math.max(last.high, live.price);
      last.low  = Math.min(last.low,  live.price);
      out[out.length-1] = last;
    } else if (b > last.ts){
      out.push({ts:b, open:last.close, high:live.price, low:live.price, close:live.price});
    }
    return out;
  }

  // 3) exporter
  function downloadMergedCsv(){
    let s = window.__seriesForExport;
    if(!s || !s.length){ alert('ما في بيانات للتصدير. شغّل التحليل أولاً أو استورد CSV.'); return; }
    s = mergeWithLive(s);
    const DELIM = ';', CRLF = '\r\n', BOM = '\ufeff';
    const q = (v)=>`"${String(v).replace(/"/g,'""')}"`;
    const header = ['Date','Open','High','Low','Close'];
    const rows = s.map(r=>[new Date(r.ts).toISOString().replace('T',' ').slice(0,19), r.open, r.high, r.low, r.close]);
    const csv = [header.map(q).join(DELIM)].concat(rows.map(row=>row.map(q).join(DELIM))).join(CRLF) + CRLF;
    const blob = new Blob([BOM + csv], {type:'application/vnd.ms-excel;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `XAUUSD_${window.currentTF||5}min_merged.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

// 4) wire button (unified)
function wireExportBtn() {
  const btn =
    document.getElementById('writeExportBtn') ||   // لو عامل زر باسم تاني
    document.getElementById('btnExportCsv')   ||   // زر التصدير الحالي
    document.querySelector('[data-action="export-merged"], .js-export-merged');

  if (!btn) {
    console.warn('[export] زر التصدير غير موجود حالياً');
    return;
  }
  if (btn.__gsBound) return; // منع الربط المكرر
  btn.__gsBound = true;

  btn.addEventListener('click', (e) => {
    e.preventDefault?.();
    try { downloadMergedCsv(); }
    catch (err) {
      console.error('downloadMergedCsv failed:', err);
      alert('حدث خطأ أثناء إنشاء ملف CSV.');
    }
  });
}

document.addEventListener('DOMContentLoaded', wireExportBtn);
wireExportBtn();  
})();
/* === Export merged CSV (drop-in) === */
(function () {
  // استخدم آخر سلسلة رُسمت (إذا كنت مفرغ __seriesForExport بالباتش)
  function getSeriesForExport() {
    return Array.isArray(window.__seriesForExport) ? window.__seriesForExport.slice() : null;
  }

  // دمج السعر الحي في الشمعة الحالية (نفس منطقك)
  function mergeWithLive(series) {
    try {
      const tf = window.currentTF || 5;
      const live = window.LAST_LIVE;
      if (!Array.isArray(series) || !series.length || !live) return series;
      const ms = tf * 60 * 1000;
      const b  = Math.floor((live.timeMs || Date.now()) / ms) * ms;
      const out  = series.slice();
      const last = { ...out[out.length - 1] };
      if (b === last.ts) {
        last.close = live.price;
        last.high  = Math.max(last.high, live.price);
        last.low   = Math.min(last.low,  live.price);
        out[out.length - 1] = last;
      } else if (b > last.ts) {
        out.push({ ts: b, open: last.close, high: live.price, low: live.price, close: live.price });
      }
      return out;
    } catch { return series; }
  }

  // بدّل/أضف هالدالة
function downloadMergedCsv(){
  // 1) جيب السلسلة الجاهزة للتصدير
  let s = Array.isArray(window.__seriesForExport) ? window.__seriesForExport.slice() : null;
  if(!s || !s.length){ alert('ما في بيانات للتصدير. شغّل التحليل أولاً أو استورد CSV.'); return; }

  // 2) ادمج السعر الحي بنفس منطقك (اذا عندك mergeWithLive خليه)
  if (typeof mergeWithLive === 'function') s = mergeWithLive(s);

  // 3) CSV مريح لـ Excel Mobile: UTF-8 بدون BOM + فاصلة
  const DELIM = ',';            // إذا طلع بعمود واحد بدّلها إلى ';'
  const CRLF  = '\r\n';
  const q = v => `"${String(v).replace(/"/g,'""')}"`;

  const header = ['Date','Open','High','Low','Close'];
  const rows = s.map(r => [
    new Date(r.ts).toISOString().replace('T',' ').slice(0,19),
    r.open, r.high, r.low, r.close
  ]);

  const csv = [header.map(q).join(DELIM)]
    .concat(rows.map(row => row.map(q).join(DELIM)))
    .join(CRLF) + CRLF;

  // 4) اسم ملف ديناميكي (ما يعود يكرر نفس الاسم)
  const tf = (window.currentTF || 5);
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_`+
                `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
  const fname = `XAUUSD_${tf}min_merged_${stamp}.csv`;

  // 5) نزّل الملف
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); // بدون BOM
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

  // نفّذ الربط الآن وبعد تحميل الـDOM
  wireExportBtn();
  document.addEventListener('DOMContentLoaded', wireExportBtn);

  // خلّي الدالة متاحة لو حبيت تناديها يدويًا
  window.downloadMergedCsv = downloadMergedCsv;
})();



/* === ADD-ONLY v2: ضع أزرار CSV تحت "إعدادات البيانات" + إخفاء أزرار الهيدر مهما تغيّر النص === */
(function(){
  const AR_IMPORT = /CSV\s*استيراد|استيراد\s*CSV/i;
  const AR_EXPORT = /تنزيل\s*CSV|CSV\s*تنزيل|تحميل\s*CSV/i;
  const ANY_CSV   = /CSV/i;

  function norm(t){ return (t||'').replace(/\s+/g,' ').trim(); }
  function text(el){ return norm(el.textContent||el.innerText||''); }

  function createBtn(label){
    const b=document.createElement('button');
    b.type='button'; b.textContent=label;
    b.style.cssText='padding:8px 12px;border-radius:10px;background:#2b3a60;color:#e6eef9;border:1px solid #3a4f7a;cursor:pointer';
    return b;
  }

  function ensureFileInput(){
    let f=document.getElementById('hiddenCsvFile');
    if(!f){
      f=document.createElement('input');
      f.type='file'; f.accept='.csv'; f.id='hiddenCsvFile'; f.style.display='none';
      document.body.appendChild(f);
    }
    if(!f.__wired){
      f.addEventListener('change', async ev=>{
        const file = ev.target.files && ev.target.files[0]; if(!file) return;
        try{
          const txt = await file.text();
          if(typeof window.parseCsv==='function'){
            const rows5=window.parseCsv(txt);
            if(Array.isArray(rows5) && rows5.length){
              const tf=window.currentTF||5;
              let series=rows5;
              if(typeof window.aggregateOHLC==='function'){
                if(tf===30) series = window.aggregateOHLC(rows5,30);
                else if(tf===60) series = window.aggregateOHLC(rows5,60);
              }
              if(tf===1440 && typeof window.aggregateDailyNY==='function'){
                series = window.aggregateDailyNY(rows5);
              }
              window.__lastBaseSeries = series;
              if(typeof window.runAnalysis==='function') window.runAnalysis();
            } else alert('CSV فارغ أو غير مدعوم');
          } else alert('parseCsv غير موجود في هذا الإصدار');
        }catch(e){ alert('تعذّر استيراد CSV: '+(e.message||e)); }
        ev.target.value='';
      });
      f.__wired=true;
    }
    return f;
  }

  function pickExport(){
    return window.downloadMergedExcelXml || window.downloadMergedXls || window.downloadMergedCsv;
  }

  function findDataSettingsHeading(){
    const all = Array.from(document.querySelectorAll('*'));
    for(const el of all){
      const t = text(el);
      if(/إعدادات\s+البيانات/i.test(t)){
        return el;
      }
    }
    return null;
  }

  function placeControls(){
    let host = document.getElementById('csvControls');
    if(!host){
      host = document.createElement('div');
      host.id='csvControls';
      host.style.cssText='margin:12px 0; display:flex; gap:10px; flex-wrap:wrap;';
      // ابحث عن عنوان "إعدادات البيانات" وضع تحته مباشرة
      const heading = findDataSettingsHeading();
      if(heading && heading.parentElement){
        heading.parentElement.insertBefore(host, heading.nextSibling);
      } else {
        // احتياط: أعلى الصفحة
        (document.body || document.documentElement).prepend(host);
      }
    }
    if(host.__mounted) return;
    host.__mounted = true;

    const bImport = createBtn('📥 استيراد CSV');
    const bExport = createBtn('💾 تنزيل CSV المدموج');
    const file = ensureFileInput();
    bImport.addEventListener('click', ()=> file.click());
    const exportFn = pickExport();
    bExport.addEventListener('click', ()=>{
      if(typeof exportFn==='function') exportFn();
      else alert('وظيفة التصدير غير متاحة في هذا الإصدار');
    });
    host.append(bImport, bExport);
  }

  function hideHeaderCsvButtons(){
    // إخفِ أي زر/رابط نصه يحتوي CSV في أعلى الصفحة (الهيدر)
    const nodes = Array.from(document.querySelectorAll('button,a,[role="button"]'));
    for(const el of nodes){
      const t = text(el);
      if(ANY_CSV.test(t)){
        // اعتبره من الهيدر إذا قريب من أعلى الصفحة
        const top = (el.getBoundingClientRect ? el.getBoundingClientRect().top : 1000);
        const headerLikely = top < 180; // ضمن أول 180px من الصفحة
        if(headerLikely){
          el.style.display='none';
        }
      }
    }
  }

  function wire(){
    placeControls();
    hideHeaderCsvButtons();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  // راقب تغييرات الـDOM (إذا أعاد الإطار رسم الهيدر)
  const mo = new MutationObserver(()=>{
    hideHeaderCsvButtons();
    // لا نعيد تركيب الأزرار إذا ركّبناها
  });
  mo.observe(document.documentElement, {subtree:true, childList:true});
})();


/* === ADD-ONLY v3: Beep + ultra-robust toggle injection & debug logs === */
(function(){
  console.log('[BEEP] patch v3 loading...');

  // ===== Debug helper =====
  function log(){ try{ console.log('[BEEP]', ...arguments); }catch{} }

  // ====== WebAudio basics ======
  let ctx = null, enabled = false;
  async function unlockAudio(){
    if (ctx) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e){ log('No WebAudio:', e); }
    if (ctx && ctx.state === 'suspended') { try { await ctx.resume(); } catch{} }
  }
  function beep(freq=880, durMs=180, vol=0.2){
    if (!enabled || !ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g).connect(ctx.destination);
    const now = ctx.currentTime;
    o.start(now);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durMs/1000);
    o.stop(now + durMs/1000 + 0.02);
  }
  function beepBuy(){ beep(880,160,0.25); setTimeout(()=>beep(1175,120,0.2),140); }
  function beepSell(){ beep(440,160,0.25); setTimeout(()=>beep(330,120,0.2),140); }

  // Expose a quick test
  window.__BEEP_TEST__ = ()=>{ enabled=true; unlockAudio().then(()=>{ beepBuy(); setTimeout(beepSell, 400); }); log('Test fired'); };

  // ====== Toggle button (force render regardless of load order) ======
  function createToggle(){
    const b = document.createElement('button');
    b.id = 'gsBeepToggle'; b.type='button';
    b.textContent = enabled ? '🔕 كتم صوت الإشارات' : '🔔 تفعيل صوت الإشارات';
    b.style.cssText = [
      'position:fixed','bottom:12px','right:12px',
      'z-index:2147483647',
      'padding:8px 12px','border-radius:10px',
      'background:#2b3a60','color:#e6eef9',
      'border:1px solid #3a4f7a','cursor:pointer',
      'box-shadow:0 6px 18px rgba(0,0,0,.18)',
      'font-size:14px','line-height:1.2'
    ].join(';');
    b.addEventListener('click', async ()=>{
      await unlockAudio();
      enabled = !enabled;
      b.textContent = enabled ? '🔕 كتم صوت الإشارات' : '🔔 تفعيل صوت الإشارات';
      log('toggle', enabled);
    });
    return b;
  }
  function ensureToggle(){
    if (document.getElementById('gsBeepToggle')) return true;
    if (!document.body) return false;
    document.body.appendChild(createToggle());
    log('toggle appended');
    return true;
  }

  // Try many hooks
  (function mount(){
    let tries = 0;
    const ok = ensureToggle();
    if (ok) { log('mounted immediately'); return; }
    const t = setInterval(()=>{
      tries++;
      if (ensureToggle() || tries>100) { clearInterval(t); log('mounted via interval', tries); }
    }, 120);
    document.addEventListener('DOMContentLoaded', ensureToggle, {once:true});
    window.addEventListener('load', ensureToggle, {once:true});
    // First user interaction will also try
    ['click','pointerdown','touchstart'].forEach(evt=>{
      window.addEventListener(evt, ensureToggle, {once:false, passive:true});
    });
    // Observe DOM in case framework re-renders
    const mo = new MutationObserver(()=> ensureToggle());
    mo.observe(document.documentElement, {subtree:true, childList:true});
  })();

  // ====== Dedup per side/TF ======
  const DEDUP_MS = 60*1000; // 1 min
  const lastMap = new Map(); // key: `${side}-${tf}` -> timestamp
  function shouldBeep(side, tf){
    const k = `${side}-${tf}`;
    const now = Date.now();
    const last = lastMap.get(k) || 0;
    if (now - last < DEDUP_MS) return false;
    lastMap.set(k, now);
    return true;
  }
  function getTF(){
    if (typeof window.currentTF !== 'undefined' && window.currentTF != null) return window.currentTF;
    if (window.__cache && window.__cache.tf != null) return window.__cache.tf;
    return 5;
  }

  // ====== Wrap pushTradeSignal if present ======
  const _push = window.pushTradeSignal;
  window.pushTradeSignal = function(obj={}){
    try {
      const sideRaw = (obj.side||'').toString().toUpperCase().replace('شراء','BUY').replace('بيع','SELL');
      const tf = Number(obj.tf || getTF());
      if ((sideRaw==='BUY' || sideRaw==='SELL') && shouldBeep(sideRaw, tf)) {
        if (enabled) { if (sideRaw==='BUY') beepBuy(); else beepSell(); }
        log('beep from pushTradeSignal', sideRaw, tf);
      }
    } catch(e){ log('wrap error', e); }
    if (typeof _push === 'function') return _push.apply(this, arguments);
  };

  // ====== Auto-detect from DOM if not calling pushTradeSignal ======
  function norm(t){ return (t||'').replace(/\s+/g,' ').trim(); }
  function scan(){
    const sels = ['#signal', '#signalText', '#summarySignal', '.signal', '.signal-text'];
    for (const sel of sels){
      const el = document.querySelector(sel);
      const t = norm(el && (el.textContent||el.innerText));
      if (!t) continue;
      const tf = getTF();
      if (/BUY|شراء/i.test(t) && shouldBeep('BUY', tf)) { if(enabled){ beepBuy(); } log('beep from scan BUY'); return; }
      if (/SELL|بيع/i.test(t) && shouldBeep('SELL', tf)) { if(enabled){ beepSell(); } log('beep from scan SELL'); return; }
    }
  }
  const mo2 = new MutationObserver(()=> scan());
  mo2.observe(document.documentElement, {subtree:true, childList:true, characterData:true});
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();

  log('patch v3 ready');
})();


/* === ADD-ONLY: CSV buttons wiring by IDs (robust) === */
(function(){
  try{
    const importBtn = document.getElementById('btnImportCsv');
    const exportBtn = document.getElementById('btnExportCsv');
    const fileInput = document.getElementById('hiddenCsvFile') || document.querySelector('input[type="file"][id="hiddenCsvFile"]');
    if (importBtn && fileInput && !importBtn.__wired){
      importBtn.addEventListener('click', ()=> fileInput.click());
      importBtn.__wired = true;
    }
    if (fileInput && !fileInput.__wired){
      fileInput.addEventListener('change', async (e)=>{
        try{
          const f = e.target.files && e.target.files[0];
          if(!f) return;
          const text = await f.text();
          window.__importedCsvText = text;
          if (typeof runAnalysis === 'function') runAnalysis();
        }catch(err){ console.error('CSV import failed:', err); alert('تعذّر استيراد CSV'); }
        finally { try{ e.target.value=''; }catch{} }
      });
      fileInput.__wired = true;
    }
    if (exportBtn && !exportBtn.__wired){
      exportBtn.addEventListener('click', ()=>{
        if (typeof downloadMergedCsv === 'function') { try{ downloadMergedCsv(); return; }catch(e){ console.error(e); } }
        if (typeof generateMergedCsv === 'function')  { try{ generateMergedCsv(); return; }catch(e){ console.error(e); } }
        const fallback = document.querySelector('[data-action="export-csv"], #exportCsv, .exportCsv');
        fallback?.click();
      });
      exportBtn.__wired = true;
    }
  }catch(e){ console.error('CSV wiring error', e); }
})();



/* ==== APP.INTEGRATION ==== */

/* =========================
   AUTO-BY-MARKET + UI SYNC INTEGRATION (final)
   ========================= */
(function(){
  const $ = (id)=>document.getElementById(id);

  // ---- Define global flags so they're never undefined
  window.USE_RSI        = (typeof window.USE_RSI        !== 'undefined') ? window.USE_RSI        : true;
  window.USE_MACD       = (typeof window.USE_MACD       !== 'undefined') ? window.USE_MACD       : true;
  window.USE_EMA_TREND  = (typeof window.USE_EMA_TREND  !== 'undefined') ? window.USE_EMA_TREND  : true;
  window.USE_STOCH      = (typeof window.USE_STOCH      !== 'undefined') ? window.USE_STOCH      : false;
  window.USE_BB         = (typeof window.USE_BB         !== 'undefined') ? window.USE_BB         : false;

  // ---- Ensure we always cache latest series for auto logic
  const __orig_fetchCsv = (typeof fetchCsv==='function') ? fetchCsv : null;
  if (__orig_fetchCsv && !fetchCsv.__wrapped_auto){
    window.fetchCsv = async function(url){
      const rows = await __orig_fetchCsv(url);
      try{ if (Array.isArray(rows) && rows.length) window.__lastSeriesForChart = rows; }catch(e){}
      return rows;
    };
    window.fetchCsv.__wrapped_auto = true;
  }

  // ---- Regime detection using app's indicators
  function computeRegime(series){
    if (!Array.isArray(series) || series.length < 30) return {trend:'unknown', vol:'normal'};
    try{
      const emaFast = (typeof EMA_FAST!=='undefined')?EMA_FAST:12;
      const emaSlow = (typeof EMA_SLOW!=='undefined')?EMA_SLOW:26;
      const atrPer  = (typeof ATR_PERIOD!=='undefined')?ATR_PERIOD:14;
      const m = macd(series, emaFast, emaSlow, 9);
      const i = series.length-1;
      const emaUp = Number.isFinite(m.emaF[i]) && Number.isFinite(m.emaS[i]) && m.emaF[i] > m.emaS[i];
      const emaDn = Number.isFinite(m.emaF[i]) && Number.isFinite(m.emaS[i]) && m.emaF[i] < m.emaS[i];
      const trend = emaUp ? 'trend_up' : (emaDn ? 'trend_down' : 'range');
      const aArr = atr(series, atrPer);
      const last = series[i]?.close || 0;
      const ap = (last && aArr?.[i]) ? aArr[i]/last : 0;
      const vol = ap >= 0.003 ? 'high' : (ap <= 0.0008 ? 'low' : 'normal');
      return {trend, vol};
    }catch(e){ return {trend:'unknown', vol:'normal'}; }
  }
  function applyAutoByMarket(){
    const series = (window.__lastSeriesForChart || window.__lastBaseSeries || null);
    const reg = computeRegime(series);
    if (reg.trend==='trend_up' || reg.trend==='trend_down'){
      window.USE_EMA_TREND = true;
      window.USE_MACD = true;
      window.USE_RSI = (reg.vol!=='low');
      window.USE_STOCH = false;
      window.USE_BB = false;
    } else {
      window.USE_EMA_TREND = false;
      window.USE_MACD = false;
      window.USE_RSI = true;
      window.USE_STOCH = true;
      window.USE_BB = true;
    }
  }
  function syncUI(){
    [['useRSI','USE_RSI'],['useMACD','USE_MACD'],['useEMA','USE_EMA_TREND'],['useStoch','USE_STOCH'],['useBB','USE_BB']]
    .forEach(([id,key])=>{ const el=$(id); if (el && (key in window)) el.checked = !!window[key]; });
  }
  function runNow(){
    try{ typeof loadSettings==='function' && loadSettings(); }catch(e){}
    try{ (typeof runAnalysis==='function' && runAnalysis()) || (typeof run==='function' && run()); }catch(e){}
  }

  // ---- Wire Auto checkbox
  const elAuto = $('autoInd');
  if (elAuto && !elAuto.__wired_final){
    elAuto.addEventListener('change', ()=>{
      if (elAuto.checked){ applyAutoByMarket(); syncUI(); }
      runNow();
    });
    elAuto.__wired_final = true;
  }

  // ---- Respect flags in final classification & chips (if original didn't)
  if (typeof classifyFinal === 'function' && !classifyFinal.__wrapped_final){
    const __orig_classifyFinal = classifyFinal;
    window.classifyFinal = function(ctx){
      const useRSI  = !!window.USE_RSI;
      const useMACD = !!window.USE_MACD;
      const useEMA  = !!window.USE_EMA_TREND;
      if (!useRSI && !useMACD && !useEMA) return 'حيادي';
      return __orig_classifyFinal.call(this, ctx);
    };
    window.classifyFinal.__wrapped_final = true;
  }
  if (typeof paintIndicators === 'function' && !paintIndicators.__wrapped_final){
    const __orig_paintIndicators = paintIndicators;
    window.paintIndicators = function(rsiVal,macdVal,emaFv,emaSv,stK,stD,bbMid,bbUp,bbDn){
      __orig_paintIndicators && __orig_paintIndicators(rsiVal,macdVal,emaFv,emaSv,stK,stD,bbMid,bbUp,bbDn);
      const show=(id,flag)=>{ const el=document.getElementById(id); if(!el) return; (el.parentElement||el).style.display = flag?'inline-block':'none'; };
      show('indRSI',  !!window.USE_RSI);
      show('indMACD', !!window.USE_MACD);
      show('indEMAF', !!window.USE_EMA_TREND);
      show('indEMAS', !!window.USE_EMA_TREND);
      const stOn = (typeof window.USE_STOCH!=='undefined') ? !!window.USE_STOCH : false;
      const bbOn = (typeof window.USE_BB!=='undefined') ? !!window.USE_BB : false;
      show('indStoch', stOn);
      show('indBB',    bbOn);
    };
    window.paintIndicators.__wrapped_final = true;
  }

  // ---- Bootstrap on load
  document.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(()=>{
      const auto = $('autoInd');
      if (auto && auto.checked){ applyAutoByMarket(); syncUI(); }
      else { syncUI(); }
      runNow();
    }, 350);
  });
})();



/* =========================
   AUTO-BY-MARKET SYSTEM + UI SYNC (integrated into app-33)
   ========================= */
(function(){
  const $ = id => document.getElementById(id);

  // --- Define initial flags so they never stay undefined ---
  window.USE_RSI        = (typeof window.USE_RSI        !== 'undefined') ? window.USE_RSI        : true;
  window.USE_MACD       = (typeof window.USE_MACD       !== 'undefined') ? window.USE_MACD       : true;
  window.USE_EMA_TREND  = (typeof window.USE_EMA_TREND  !== 'undefined') ? window.USE_EMA_TREND  : true;
  window.USE_STOCH      = (typeof window.USE_STOCH      !== 'undefined') ? window.USE_STOCH      : false;
  window.USE_BB         = (typeof window.USE_BB         !== 'undefined') ? window.USE_BB         : false;

  // --- Hook fetchCsv to cache the last series for auto detection ---
  const __orig_fetchCsv = (typeof fetchCsv==='function') ? fetchCsv : null;
  if (__orig_fetchCsv && !fetchCsv.__autoWrapped){
    window.fetchCsv = async function(url){
      const rows = await __orig_fetchCsv(url);
      try{ if (Array.isArray(rows) && rows.length) window.__lastSeriesForChart = rows; }catch(e){}
      return rows;
    };
    window.fetchCsv.__autoWrapped = true;
  }

  // --- Detect regime (trend/range) using EMA+ATR ---
  function computeRegime(series){
    if (!Array.isArray(series) || series.length < 30) return {trend:'unknown', vol:'normal'};
    try{
      const emaFast = (typeof EMA_FAST!=='undefined')?EMA_FAST:12;
      const emaSlow = (typeof EMA_SLOW!=='undefined')?EMA_SLOW:26;
      const atrPer  = (typeof ATR_PERIOD!=='undefined')?ATR_PERIOD:14;
      const m = macd(series, emaFast, emaSlow, 9);
      const i = series.length-1;
      const emaUp = Number.isFinite(m.emaF[i]) && Number.isFinite(m.emaS[i]) && m.emaF[i] > m.emaS[i];
      const emaDn = Number.isFinite(m.emaF[i]) && Number.isFinite(m.emaS[i]) && m.emaF[i] < m.emaS[i];
      const trend = emaUp ? 'trend_up' : (emaDn ? 'trend_down' : 'range');
      const aArr = atr(series, atrPer);
      const last = series[i]?.close || 0;
      const ap = (last && aArr?.[i]) ? aArr[i]/last : 0;
      const vol = ap >= 0.003 ? 'high' : (ap <= 0.0008 ? 'low' : 'normal');
      return {trend, vol};
    }catch(e){ return {trend:'unknown', vol:'normal'}; }
  }

  // --- Auto adjust indicators based on regime ---
  function applyAutoByMarket(){
    const series = (window.__lastSeriesForChart || window.__lastBaseSeries || null);
    const reg = computeRegime(series);
    if (reg.trend==='trend_up' || reg.trend==='trend_down'){
      window.USE_EMA_TREND = true;
      window.USE_MACD = true;
      window.USE_RSI = (reg.vol!=='low');
      window.USE_STOCH = false;
      window.USE_BB = false;
    } else {
      window.USE_EMA_TREND = false;
      window.USE_MACD = false;
      window.USE_RSI = true;
      window.USE_STOCH = true;
      window.USE_BB = true;
    }
  }

  // --- Sync checkboxes with internal state ---
  function syncUI(){
    [['useRSI','USE_RSI'],['useMACD','USE_MACD'],['useEMA','USE_EMA_TREND'],['useStoch','USE_STOCH'],['useBB','USE_BB']]
      .forEach(([id,key])=>{
        const el=$(id);
        if (el && (key in window)) el.checked = !!window[key];
      });
  }

  // --- Run/Refresh analysis ---
  function runNow(){
    try{ typeof loadSettings==='function' && loadSettings(); }catch(e){}
    try{ (typeof runAnalysis==='function' && runAnalysis()) || (typeof run==='function' && run()); }catch(e){}
  }

  // --- Wire Auto indicator checkbox ---
  const elAuto = $('autoInd');
  if (elAuto && !elAuto.__wired_auto){
    elAuto.addEventListener('change', ()=>{
      if (elAuto.checked){ applyAutoByMarket(); syncUI(); }
      runNow();
    });
    elAuto.__wired_auto = true;
  }

  // --- Patch classifyFinal and paintIndicators to respect USE_* ---
  if (typeof classifyFinal==='function' && !classifyFinal.__wrapped_auto){
    const orig = classifyFinal;
    window.classifyFinal = function(ctx){
      const useRSI  = !!window.USE_RSI;
      const useMACD = !!window.USE_MACD;
      const useEMA  = !!window.USE_EMA_TREND;
      if (!useRSI && !useMACD && !useEMA) return 'حيادي';
      return orig.call(this, ctx);
    };
    window.classifyFinal.__wrapped_auto = true;
  }
  if (typeof paintIndicators==='function' && !paintIndicators.__wrapped_auto){
    const orig = paintIndicators;
    window.paintIndicators = function(rsiVal,macdVal,emaFv,emaSv,stK,stD,bbMid,bbUp,bbDn){
      orig && orig(rsiVal,macdVal,emaFv,emaSv,stK,stD,bbMid,bbUp,bbDn);
      const show=(id,flag)=>{ const el=document.getElementById(id); if(!el)return; (el.parentElement||el).style.display=flag?'inline-block':'none'; };
      show('indRSI',  !!window.USE_RSI);
      show('indMACD', !!window.USE_MACD);
      show('indEMAF', !!window.USE_EMA_TREND);
      show('indEMAS', !!window.USE_EMA_TREND);
    };
    window.paintIndicators.__wrapped_auto = true;
  }

  // --- Initial bootstrap on load ---
  document.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(()=>{
      const auto = $('autoInd');
      if (auto && auto.checked){ applyAutoByMarket(); syncUI(); }
      else { syncUI(); }
      runNow();
    }, 400);
  });
})();



/* ================== INDICATORS PATCH (auto + manual, non-destructive) ==================
   - Adds UI bindings for: useRSI, useMACD, useEMA trend, useStoch, useBB, autoIndicators
   - Auto mode picks indicators based on context (trend vs range) and locks the checkboxes.
   - Manual mode lets the user toggle each indicator individually.
   - Signal engine respects the active flags.
*/

(function(){
  // ---- UI handles ----
  const elUseRSI   = document.getElementById('useRSI');
  const elUseMACD  = document.getElementById('useMACD');
  const elUseEMAtr = document.getElementById('useEMA');      // "Use EMA trend (12/26)"
  const elAutoInd  = document.getElementById('autoIndicators');

  // Global flags (default ON to match previous behavior)
  window.USE_RSI = true;
  window.USE_MACD = true;
  window.USE_EMA_TREND = true;

  // Keep existing flags for Stoch/BB coming from app (USE_STOCH / USE_BB)

  // Utility: enable/disable a checkbox while keeping its visual state
  function lock(el, locked){
    if (!el) return;
    el.disabled = !!locked;
    el.style.opacity = locked ? .7 : 1;
    el.style.cursor = locked ? 'not-allowed' : 'pointer';
  }

  function syncFlagsFromUI(){
    // If auto → UI is locked and flags come from context, not UI
    if (elAutoInd && elAutoInd.checked) return;
    if (elUseRSI)   window.USE_RSI = !!elUseRSI.checked;
    if (elUseMACD)  window.USE_MACD = !!elUseMACD.checked;
    if (elUseEMAtr) window.USE_EMA_TREND = !!elUseEMAtr.checked;
    if (typeof window.elUseStoch !== 'undefined') window.USE_STOCH = !!(window.elUseStoch && window.elUseStoch.checked);
    if (typeof window.elUseBB    !== 'undefined') window.USE_BB    = !!(window.elUseBB    && window.elUseBB.checked);
  }

  function syncUIFromFlags(){
    if (elUseRSI)   elUseRSI.checked   = !!window.USE_RSI;
    if (elUseMACD)  elUseMACD.checked  = !!window.USE_MACD;
    if (elUseEMAtr) elUseEMAtr.checked = !!window.USE_EMA_TREND;
    if (window.elUseStoch) window.elUseStoch.checked = !!window.USE_STOCH;
    if (window.elUseBB)    window.elUseBB.checked    = !!window.USE_BB;
  }

  // Decide context (Trend vs Range) using EMA slope + ATR%
  function detectContext(series, atrArr){
    try{
      if (!Array.isArray(series) || series.length < 3) return 'range';
      const n = series.length - 1;
      const emaF = (window.macd(series, window.EMA_FAST||12, window.EMA_SLOW||26, 9).emaF);
      const emaS = (window.macd(series, window.EMA_FAST||12, window.EMA_SLOW||26, 9).emaS);
      const ef = emaF[n], es = emaS[n];
      const slope = (ef!=null && emaF[n-1]!=null) ? (ef - emaF[n-1]) : 0;
      const atrv = atrArr && atrArr[n];
      const apct = window.atrPct ? window.atrPct(atrv, series[n].close) : NaN;
      const trending = (ef!=null && es!=null && Math.abs(slope) > 0.03) || (Number.isFinite(apct) && apct > (window.ATR_MIN_PCT + 0.08));
      return trending ? 'trend' : 'range';
    }catch(_){ return 'range'; }
  }

  // Auto picks & locks the toggles
  function applyAuto(series, atrArr){
    const mode = detectContext(series, atrArr); // 'trend' | 'range'
    if (mode === 'trend'){
      window.USE_EMA_TREND = true;
      window.USE_MACD = true;
      window.USE_RSI = true;
      // Range helpers OFF by default
      window.USE_STOCH = false;
      window.USE_BB = false;
    } else {
      // Ranging: use oscillators/bands, keep RSI
      window.USE_EMA_TREND = false;
      window.USE_MACD = false;
      window.USE_RSI = true;
      window.USE_STOCH = true;
      window.USE_BB = true;
    }
    syncUIFromFlags();
    lock(elUseRSI,   true);
    lock(elUseMACD,  true);
    lock(elUseEMAtr, true);
    if (window.elUseStoch) lock(window.elUseStoch, true);
    if (window.elUseBB)    lock(window.elUseBB,    true);
  }

  function unlockManual(){
    lock(elUseRSI,   false);
    lock(elUseMACD,  false);
    lock(elUseEMAtr, false);
    if (window.elUseStoch) lock(window.elUseStoch, false);
    if (window.elUseBB)    lock(window.elUseBB,    false);
  }

  // ---- Override classifiers to respect flags ----
  window.classifyBase = function(rsiVal, macdVal){
    const useR = !!window.USE_RSI, useM = !!window.USE_MACD;
    const hasR = Number.isFinite(rsiVal), hasM = Number.isFinite(macdVal);
    if ((!useR || !hasR) && (!useM || !hasM)) return 'حيادي';
    // If only one is active, base on it
    if (useM && hasM && (!useR || !hasR)){
      if (macdVal > 0) return 'شراء';
      if (macdVal < 0) return 'بيع';
      return 'حيادي';
    }
    if (useR && hasR && (!useM || !hasM)){
      if (rsiVal >= 60) return 'شراء';
      if (rsiVal <= 40) return 'بيع';
      return 'حيادي';
    }
    // Both active
    if (macdVal>0 && rsiVal>=50 && rsiVal<=70) return 'شراء';
    if (macdVal<0 && rsiVal<=50) return 'بيع';
    return 'حيادي';
  };

  window.classifyPrecise = function(ctx){
    const { rsiVal, macdNow, macdPrev, macdSig, price, emaF, emaS } = ctx || {};
    const useR = !!window.USE_RSI, useM = !!window.USE_MACD, useE = !!window.USE_EMA_TREND;
    if ((useE && [emaF,emaS].some(v=>!Number.isFinite(v))) ||
        (useM && !Number.isFinite(macdNow)) ||
        (useR && !Number.isFinite(rsiVal))) return 'حيادي';

    const up = useM && Number.isFinite(macdPrev) && macdPrev<=macdSig && macdNow>macdSig;
    const dn = useM && Number.isFinite(macdPrev) && macdPrev>=macdSig && macdNow<macdSig;

    if (useE){
      if ((up || (useM && macdNow>macdSig)) && price>emaF && emaF>emaS && (!useR || rsiVal>50 && rsiVal<68)) return 'شراء';
      if ((dn || (useM && macdNow<macdSig)) && price<emaF && emaF<emaS && (!useR || rsiVal<50)) return 'بيع';
      return 'حيادي';
    } else {
      // No EMA trend gating
      if (useM && macdNow>macdSig && (!useR || rsiVal>=50)) return 'شراء';
      if (useM && macdNow<macdSig && (!useR || rsiVal<=50)) return 'بيع';
      // fallback to base
      return window.classifyBase(useR? rsiVal : NaN, useM? macdNow : NaN);
    }
  };

  window.classifyFinal = function(ctx){
    return window.PRO_MODE ? window.classifyPrecise(ctx) : window.classifyBase(ctx.rsiVal, ctx.macdNow);
  };

  // ---- Hook into analysis to set flags each run ----
  const _run = window.runAnalysis;
  window.runAnalysis = async function(){
    // manual first
    syncFlagsFromUI();
    const res = await _run.apply(this, arguments);
    try{
      if (elAutoInd && elAutoInd.checked && window.__cache){
        const { series, atrArr } = (function(c){ return {series:c.series, atrArr:c.atrArr || window.atr(c.series, window.ATR_PERIOD||14)}; })(window.__cache);
        applyAuto(series, atrArr);
        // re-run for consistency
        syncFlagsFromUI();
        await _run.apply(this, arguments);
      } else {
        unlockManual();
      }
    }catch(_){}
    return res;
  };

  // Make sure reprojectWithLive respects flags too
  const _reproj = window.reprojectWithLive;
  window.reprojectWithLive = function(){
    syncFlagsFromUI();
    const out = _reproj.apply(this, arguments);
    try{
      if (elAutoInd && elAutoInd.checked && window.__cache){
        const {series} = window.__cache;
        const atrArr = window.atr(series, window.ATR_PERIOD||14);
        applyAuto(series, atrArr);
        syncFlagsFromUI();
        _reproj.apply(this, arguments);
      }
    }catch(_){}
    return out;
  };

  // Wire UI events
  [elUseRSI, elUseMACD, elUseEMAtr].forEach(el=>{
    if (el) el.addEventListener('change', ()=>{ if (!(elAutoInd && elAutoInd.checked)) { syncFlagsFromUI(); window.runAnalysis && window.runAnalysis(); } });
  });
  if (elAutoInd){
    elAutoInd.addEventListener('change', ()=>{
      if (elAutoInd.checked){
        // switch to auto now
        window.runAnalysis && window.runAnalysis();
      } else {
        unlockManual();
        syncFlagsFromUI();
        window.runAnalysis && window.runAnalysis();
      }
    });
  }

  // Initial UI sync (non-destructive)
  syncUIFromFlags();
})();
/* ================== END INDICATORS PATCH ================== */



/* === ADD-ONLY: Live anti-freeze watchdog & auto-revive === */
/* ما منعدّل شي قديم — بس منضيف طبقة أمان خفيفة. */

window.__liveTimeMs = window.__liveTimeMs || 0;

(function liveAgeTicker(){
  try {
    var el = document.getElementById('liveAge'); // لو مش موجود، ما بيعمل شي
    if (!el) return;
    setInterval(function(){
      if (!window.__liveTimeMs) return;
      var age = Date.now() - window.__liveTimeMs;
      el.textContent = Math.floor(age / 1000) + 's';
    }, 1000);
  } catch(e){}
})();

(function liveWatchdog(){
  var THRESH_MS = 15000;  // 15s
  setInterval(function(){
    try {
      var age = Date.now() - (window.__liveTimeMs || 0);
      if (age > THRESH_MS && typeof refreshLive === 'function') {
        console.warn('[watchdog] live stuck, forcing refresh… age=', age);
        refreshLive();
      }
    } catch(e){}
  }, 5000);
})();

document.addEventListener('visibilitychange', function(){
  try {
    if (!document.hidden && typeof refreshLive === 'function') {
      refreshLive();
    }
  } catch(e){}
});

(function tryWakeLock(){
  try {
    if ('wakeLock' in navigator && !window.__wakeLockReq) {
      navigator.wakeLock.request('screen').then(function(lock){ window.__wakeLockReq = lock; })
      .catch(function(){});
    }
  } catch(e){}
})();



/* === ADD-ONLY: Candle gap smoother (keeps your original look) === */
/* لا نغيّر المنطق الأصلي؛ فقط نلفّ renderTradeChart بطبقة تجهّز الداتا وتملأ الفجوات الكبيرة */

(function(){
  if (!window.renderTradeChart || window.__origRenderTradeChart) return; // مرة واحدة فقط
  window.__origRenderTradeChart = window.renderTradeChart;

  function toTs(d){
    try{
      if (Number.isFinite(d?.ts)) return d.ts;
      if (Number.isFinite(d?.timeMs)) return d.timeMs;
      if (typeof d?.time === 'number') return d.time;
      if (d?.date && d?.time) {
        var iso = (d.date + 'T' + d.time + 'Z').replace(' ', 'T');
        var t = Date.parse(iso);
        if (Number.isFinite(t)) return t;
      }
    }catch(e){}
    return null;
  }

  function inferStep(candles){
    const ts = candles.map(toTs).filter(Number.isFinite);
    if (ts.length < 3) return 300000; // 5m
    const diffs = [];
    for (let i=1;i<ts.length;i++){
      const d = ts[i]-ts[i-1];
      if (d>0) diffs.push(d);
    }
    if (!diffs.length) return 300000;
    diffs.sort((a,b)=>a-b);
    return diffs[Math.floor(diffs.length/2)] || 300000;
  }

  function fillGaps(candles){
    const arr = Array.isArray(candles) ? candles.slice() : [];
    if (arr.length < 2) return arr;

    const step = Math.max(60_000, Math.min(inferStep(arr), 60*60*1000)); // بين دقيقة وساعة
    const out = [arr[0]];
    let inserts = 0, MAX_INSERTS = 400;

    for (let i=1;i<arr.length;i++){
      const prev = out[out.length-1];
      const curr = arr[i];
      const prevTs = toTs(prev);
      const currTs = toTs(curr);

      if (Number.isFinite(prevTs) && Number.isFinite(currTs)) {
        const gap = currTs - prevTs;
        if (gap > step*1.6) {
          const px = Number.isFinite(prev.close) ? prev.close :
                     Number.isFinite(prev.price) ? prev.price : null;
          if (Number.isFinite(px)) {
            let t = prevTs + step;
            while (t < currTs - step*0.6 && inserts < MAX_INSERTS) {
              out.push({ open:px, high:px, low:px, close:px, ts:t });
              t += step; inserts++;
            }
          }
        }
      }
      out.push(curr);
      if (inserts >= MAX_INSERTS) break;
    }
    return out;
  }

  window.renderTradeChart = function(series, lines){
    try{
      const prepared = fillGaps(series);
      return window.__origRenderTradeChart.call(this, prepared, lines);
    }catch(e){
      return window.__origRenderTradeChart.call(this, series, lines);
    }
  };
})();



/* === PATCH: Precise Mode skips safety filters (NY hours, ATR%, MTF, Pivot proximity) === */
(function(){
  try{
    if (typeof filteredSignal === 'function') {
      const __orig_filteredSignal = filteredSignal;
      filteredSignal = function(tf, series, rsiArr, macdObj, atrArr, rows5Ref, rows30Ref, rows60Ref, piv, stochObj, bbObj){
        try{
          // إذا وضع دقيق مفعّل، رجّع الإشارة الخام من المؤشرات بدون فلاتر
          if (PRO_MODE && Array.isArray(series) && series.length) {
            const i = series.length - 1;
            const ctx = rsiMacdContext(series, rsiArr, macdObj, i);
            return classifyFinal(ctx); // 'شراء' / 'بيع' / 'حيادي'
          }
          // غير هيك: ارجع للمنطق الأصلي
          return __orig_filteredSignal(tf, series, rsiArr, macdObj, atrArr, rows5Ref, rows30Ref, rows60Ref, piv, stochObj, bbObj);
        }catch(err){ console.warn('filteredSignal patch err', err); return __orig_filteredSignal.apply(this, arguments); }
      };
    }
  }catch(e){ console.warn('Precise patch inject failed', e); }
})();


/* === PATCH: Ensure fresh live before manual "حساب الإشارات الآن" without duplicating listeners === */
(function(){
  try{
    const btn = document.getElementById('runBtn');
    if(btn && !btn.__gsForceFresh){
      btn.__gsForceFresh = true;
      btn.addEventListener('click', async function __forceLiveFirstOnce(){ 
        try { await refreshLive(); } catch(_){}
      }, {capture:true}); // capture to run before existing handler
    }
  }catch(e){ console.warn('runBtn fresh-live patch failed', e); }
})();


/* === GS add-only hook: push state metrics for diagnostics (non-invasive) === */
(function(){
  function computeAndDispatch(){
    try{
      var C = window.__cache||{};
      var s = C.series||[];
      if(!s.length) return;
      var i = s.length-1;
      var price = +s[i].close;
      var atr = (C.atrArr && C.atrArr[i]!=null) ? +C.atrArr[i] : NaN;
      var atrPct = (isFinite(price) && price>0 && isFinite(atr)) ? (100*atr/price) : NaN;
      var bb = C.bb||null;
      var bbPct = NaN;
      if (bb && bb.mid && bb.up && bb.dn && bb.mid[i]>0){
        bbPct = 100 * ( (+bb.up[i]) - (+bb.dn[i]) ) / (+bb.mid[i]);
      }
      if (isFinite(atrPct) || isFinite(bbPct)) {
      window.dispatchEvent(new CustomEvent('gs:state-metrics', {
  detail: {
    atrPct: atrPct, bbPct: bbPct,   // للأسماء القديمة
    atrPerc: atrPct, bbPerc: bbPct  // للأسماء التي تقرأها الواجهة
  }
})); 
      }
    }catch(e){ /* no-op */ }
  }
  // Wrap common analysis functions if present
  ['runAnalysis','computeSignals','calcSignals'].forEach(function(fn){
    try{
      if (typeof window[fn]==='function' && !window[fn].__gsHooked){
        var orig = window[fn];
        window[fn] = function(){
          var ret = orig.apply(this, arguments);
          try{ computeAndDispatch(); }catch(e){}
          return ret;
        };
        window[fn].__gsHooked = true;
      }
    }catch(e){}
  });
  // Fallback timer (safe; does nothing if no data)
  setInterval(computeAndDispatch, 2000);
})();

/* === UI helper to show market metrics inline (BB% & ATR%) === */
(function(){
  const ensureNode = () => {
    let host = document.querySelector('#mktStatsInline');
    if (!host) {
      host = document.createElement('div');
      host.id = 'mktStatsInline';
      host.style.cssText = 'margin-top:10px;color:#b6b9c3;font-size:13px;text-align:right';
      // try to place it under the main options block (before the price panel)
      const target = document.querySelector('.card') || document.body;
      target.appendChild(host);
    }
    return host;
  };
  window.__renderMktMetrics = function(m){
    try{
      const el = ensureNode();
      if (!m || !isFinite(m.bbPerc) || !isFinite(m.atrPerc)) {
        el.textContent = 'BB%: -- • ATR%: --';
        return;
      }
      const bb = (m.bbPerc===null||!isFinite(m.bbPerc)) ? '--' : m.bbPerc.toFixed(2);
      const atr = (m.atrPerc===null||!isFinite(m.atrPerc)) ? '--' : m.atrPerc.toFixed(2);
      el.textContent = `BB%: ${bb} • ATR%: ${atr}`;
    }catch(e){ /* no-op */ }
  };
  // listen to custom event from compute logic
  window.addEventListener('gs:state-metrics', (ev)=>{
    window.__renderMktMetrics(ev.detail||{});
  }, {passive:true});
})();


/* Guard: keep Data Settings card visible (instant + on DOM changes) */
(function(){
  function show(){
    try{
      var c=document.querySelector('[data-gs="market-state-row"]');
      if(c){ c.style.display='block'; c.hidden=false; c.style.visibility='visible'; }
    }catch(e){}
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',show,{once:true}); } else { show(); }
  try{ new MutationObserver(show).observe(document.body||document.documentElement,{childList:true,subtree:true}); }catch(e){}
  setTimeout(show,200); setTimeout(show,800);
})();
/* Soft re-run once after initial load to ensure metrics/rows ready */
(function(){
  try{ setTimeout(function(){ if(typeof runAnalysis==='function') try{ runAnalysis(); }catch(_){} }, 800); }catch(e){}
})();



/* === GS Market Topline v2 (safe, non-invasive) === */
(function(){
  const W = window;

  function nf2(x){ return (x==null||!isFinite(x)) ? '—' : Number(x).toFixed(2); }
  function clamp(x,a,b){ return Math.min(b, Math.max(a, x)); }

  // Simple SMA/STDEV and ATR on generic {close,high,low}
  function sma(arr,p){
    if(!arr || arr.length < p) return null;
    let s=0; for(let i=arr.length-p;i<arr.length;i++) s+=arr[i]; return s/p;
  }
  function stdev(arr,p){
    if(!arr || arr.length < p) return null;
    const m = sma(arr,p); let s=0; for(let i=arr.length-p;i<arr.length;i++){ const d=arr[i]-m; s+=d*d; }
    return Math.sqrt(s/p);
  }
  function calcBBPct(series, period=20, std=2){
    if(!series || series.length < period+1) return { bbPct:null, band:null };
    const closes = series.map(s=>s.close);
    const mean = sma(closes, period);
    const sd = stdev(closes, period);
    if(mean==null || sd==null) return { bbPct:null, band:null };
    const upper = mean + std*sd, lower = mean - std*sd;
    const last = closes[closes.length-1];
    const width = upper - lower;
    if(!(width>0)) return { bbPct:null, band:{lower,mean,upper} };
    let bbp = ( (last - lower) / width ) * 100;
    return { bbPct: clamp(bbp,0,100), band:{lower,mean,upper} };
  }
  function calcATRpct(series, period=14){
    if(!series || series.length < period+1) return null;
    const H = s=>s.high, L=s=>s.low, C=s=>s.close;
    const trs = [];
    for(let i=1;i<series.length;i++){
      const cur=series[i], prev=series[i-1];
      trs.push( Math.max( H(cur)-L(cur), Math.abs(H(cur)-C(prev)), Math.abs(L(cur)-C(prev)) ) );
    }
    if(trs.length < period) return null;
    let sum=0; for(let i=trs.length-period;i<trs.length;i++) sum+=trs[i];
    const atr = sum/period;
    const lastClose = series[series.length-1].close;
    if(!(lastClose>0)) return null;
    return (atr/lastClose)*100;
  }

  function ensureToplineHost(){
    let el = document.getElementById("gsTopline");
    if(el) return el;
    el = document.createElement("div");
    el.id = "gsTopline";
    el.style.cssText = "position:sticky;top:56px;z-index:9;background:#0b1220;"+
                       "border-bottom:1px dashed #243044;margin:0 -8px 8px;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);";
    const inner = document.createElement("div");
    inner.style.cssText="max-width:1100px;margin:0 auto;padding:8px 16px;color:#cbd5e1;font-weight:600;";
    inner.id="gsToplineText";
    el.appendChild(inner);
    const header = document.querySelector("header .wrap") || document.querySelector("header") || document.body;
    header.parentNode.insertBefore(el, header.nextSibling);
    return el;
  }

  function renderTopline(series){
    const host = ensureToplineHost();
    const t = document.getElementById("gsToplineText");
    const bb = calcBBPct(series||[], 20, 2);
    const atrp = calcATRpct(series||[], (W.ATR_PERIOD||14));
    // quick classification to show word
    let mode = "unknown";
    if(bb.bbPct!=null && atrp!=null){
      mode = (atrp < 0.25 && bb.bbPct > 35 && bb.bbPct < 65) ? "range" : "trend";
    }
    t.textContent = `حالة السوق: ${mode} • BB%: ${nf2(bb.bbPct)} • ATR%: ${nf2(atrp)}`;
    // push to any state listeners (for your "unknown(0)" text under الحالة)
    try{
      if(typeof W.gsSet === "function"){
        if(bb.bbPct!=null) W.gsSet("market.bbPct", +nf2(bb.bbPct));
        if(atrp!=null)    W.gsSet("market.atrPct", +nf2(atrp));
      }
      W.dispatchEvent(new CustomEvent("gs:market:metrics", { detail:{ bbPct:bb.bbPct, atrPct:atrp } }));
    }catch{}
  }

  // Hide duplicated metrics blocks near "حساب الإشارات الآن"
  function hideDuplicatedBlocks(){
    try{
      const nodes = Array.from(document.querySelectorAll(".card,div,section,p,small"));
      nodes.forEach(n=>{
        const txt = (n.textContent||"").trim();
        if(/BB%|ATR%/.test(txt) && /حساب الإشارات الآن/.test(document.body.textContent||"")){
          // keep topline only
          if(!n.closest("#gsTopline")){
            // allow the main KPI at the top (live/summary) to remain
            if(n.id==="gsTopline" || n.id==="gsToplineText") return;
            // hide small repeated hints under the button
            if(n.tagName === "SMALL" || /—\s*%?BB%/i.test(txt)) n.style.display="none";
          }
        }
      });
    }catch{}
  }

  // Hook after main analysis & reproject to recompute
  const _run = W.runAnalysis;
  W.runAnalysis = async function(){
    const r = await _run.apply(this, arguments);
    try{
      const cache = W.__cache || {};
      const series = cache.series || W.__lastSeriesForChart || [];
      renderTopline(series);
      hideDuplicatedBlocks();
    }catch(e){}
    return r;
  };

  const _reproj = W.reprojectWithLive;
  W.reprojectWithLive = function(){
    const r = _reproj.apply(this, arguments);
    try{
      const series = W.__lastSeriesForChart || (W.__cache && W.__cache.series) || [];
      renderTopline(series);
    }catch(e){}
    return r;
  };

  // First run (in case analysis already happened)
  setTimeout(()=>{
    const series = W.__lastSeriesForChart || (W.__cache && W.__cache.series) || [];
    if(series && series.length) renderTopline(series);
  }, 700);
})();



/* === PATCH: Auto mode should follow detected market state (trend/range) === */
(function () {
  try {
    function pickStateFromMetrics() {
      const last = window.__gs_lastMetrics || {};
      if (last.mode === 'trend' || last.mode === 'range') return last.mode;
      const bb  = Number((last.bbPerc ?? last.bbPct));
      const atr = Number((last.atrPerc ?? last.atrPct));
      if (Number.isFinite(bb) && Number.isFinite(atr)) {
        if (atr < 0.25 && bb > 35 && bb < 65) return 'range';
        return 'trend';
      }
      return null;
    }

    function remember(detail) { try { window.__gs_lastMetrics = Object.assign({}, window.__gs_lastMetrics, detail||{}); } catch {} }
    window.addEventListener('gs:state-metrics',  e => remember(e.detail), {passive:true});
    window.addEventListener('gs:market:metrics', e => remember(e.detail), {passive:true});

    const _origRun = window.runAnalysis;
    if (typeof _origRun === 'function') {
      window.runAnalysis = function () {
        try {
          const autoBtn  = document.getElementById('modeAuto')  || document.querySelector('[data-gs-mode="auto"]');
          const trendBtn = document.getElementById('modeTrend') || document.querySelector('[data-gs-mode="trend"]');
          const rangeBtn = document.getElementById('modeRange') || document.querySelector('[data-gs-mode="range"]');

          const isAuto = autoBtn && (autoBtn.classList?.contains('active') || autoBtn.getAttribute('aria-pressed') === 'true' || autoBtn.checked === true);
          if (isAuto) {
            const state = pickStateFromMetrics();
            if (state === 'trend' && trendBtn) {
              trendBtn.click?.();
            } else if (state === 'range' && rangeBtn) {
              rangeBtn.click?.();
            }
          }
        } catch (e) { /* ignore */ }
        return _origRun.apply(this, arguments);
      };
    }

    const _bbatrPrev = window.gs_updateBBATRLine;
    window.gs_updateBBATRLine = function () {
      try { if (typeof _bbatrPrev === 'function') _bbatrPrev(); } catch {}
      const text = (document.querySelector('#mktStatsInline, [data-gs="market-state-row"] .hint')?.textContent || '').toLowerCase();
      const m = text.match(/bb%\s*:\s*([+\-]?\d+(?:\.\d+)?)\s*•\s*atr%\s*:\s*([+\-]?\d+(?:\.\d+)?)/);
      if (m) {
        remember({ bbPerc: parseFloat(m[1]), atrPerc: parseFloat(m[2]) });
      }
    };
  } catch (e) {
    console.warn('auto-mode patch failed', e);
  }
})();
