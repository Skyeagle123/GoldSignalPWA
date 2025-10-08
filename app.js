/* =========================
   GoldSignals PWA — app.js (v41)
   - Robust CSV loader (multi-path + fallback)
   - Indicators toggles (RSI/MACD/EMA) + Auto indicators
   - Chart (price line + Live + Entry/SL/TP)
   - NY pivots + local date/time + working table
   ========================= */

/* ========== Helpers ========== */
const $ = id => document.getElementById(id);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

function parseDateTime(dateStr, timeStr){
  const d = (dateStr||'').trim();
  const t = (timeStr||'').trim();
  let y,m,day;
  if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(d)){         // YYYY-MM-DD
    [y,m,day]=d.split(/[-/]/).map(Number);
  } else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(d)){ // MM/DD/YYYY
    let mm,dd,yy; [mm,dd,yy]=d.split(/[-/]/); y=+yy; if(y<100) y+=2000; m=+mm; day=+dd;
  } else {
    const ts=Date.parse(d+' '+t);
    return Number.isFinite(ts)?ts:NaN;
  }
  let hh=0,mi=0,ss=0;
  if (t){
    const parts=t.split(':').map(Number);
    hh=parts[0]||0; mi=parts[1]||0; ss=parts[2]||0;
  }
  return Date.UTC(y,(m-1),day,hh,mi,ss);
}
function toLocal(ts){
  const d = new Date(ts);
  return { date: d.toLocaleDateString(), time: d.toLocaleTimeString() };
}

/* ========== DOM ========== */
const elCsvInput=$('csvInput'), elRun=$('runBtn');
const elTf5=$('tf5'), elTf30=$('tf30'), elTf60=$('tf60'), elTfD=$('tfD');
const elPro=$('proMode'), elMtf=$('mtfConfirm');
const elLivePrice=$('livePrice'), elLiveTime=$('liveTime'), elSummaryText=$('summaryText');
const elIndRSI=$('indRSI'), elIndMACD=$('indMACD'), elIndEMAF=$('indEMAF'), elIndEMAS=$('indEMAS');
const elIndStoch=$('indStoch'), elIndBB=$('indBB');
const elChart=$('tradeChart'); const ctxChart=elChart?.getContext('2d');

const elEmaF=$('emaFast'), elEmaS=$('emaSlow'), elRSIP=$('rsiPeriod'), elATRP=$('atrPeriod');
const elSL=$('slMult'), elTP1=$('tp1Mult'), elTP2=$('tp2Mult');
const elAtrMin=$('atrMinPct'), elAtrMax=$('atrMaxPct');
const elAcct=$('acctSize'), elRisk=$('riskPct');

const elUseStoch=$('useStoch'), elStochK=$('stochK'), elStochD=$('stochD');
const elUseBB=$('useBB'), elBBPeriod=$('bbPeriod'), elBBStd=$('bbStd');

const elAutoInd=$('autoInd'), elUseRSI=$('useRSI'), elUseMACD=$('useMACD'), elUseEMA=$('useEMA');

const elToggleNyHours=$('toggleNyHours'), elTogglePivotFilter=$('togglePivotFilter');

const elR1=$('r1'), elR2=$('r2'), elR3=$('r3'), elS1=$('s1'), elS2=$('s2'), elS3=$('s3'), elPivotP=$('pivotP');

const elAlertEnable=$('alertEnable'), elAlertDistance=$('alertDistance');

const elRowsBody=$('rowsBody');

/* ========== State ========== */
let TF=5; let PRO_MODE=false; let MTF_CONFIRM=true;

let AUTO_IND=false;
let USE_RSI=true, USE_MACD=true, USE_EMA_TREND=true;
let USE_STOCH=false, USE_BB=false;

let EMA_FAST=12, EMA_SLOW=26, RSI_PERIOD=14, ATR_PERIOD=14;
let SL_MULT=1.5, TP1_MULT=1.0, TP2_MULT=2.0;
let ATR_MIN_PCT=0.05, ATR_MAX_PCT=0.8;
let ACCT_SIZE=10000, RISK_PCT=1.0;
let STOCH_K=14, STOCH_D=3, BB_PERIOD=20, BB_STD=2.0;

let PIVOT_MIN_DISTANCE=0.8;

/* ========== Settings ========== */
function num(el,def){ const v=parseFloat(el?.value); return Number.isFinite(v)?v:def; }
function loadSettings(){
  PRO_MODE=!!elPro?.checked; MTF_CONFIRM=!!elMtf?.checked;

  EMA_FAST=parseInt(elEmaF?.value??12,10);
  EMA_SLOW=parseInt(elEmaS?.value??26,10);
  RSI_PERIOD=parseInt(elRSIP?.value??14,10);
  ATR_PERIOD=parseInt(elATRP?.value??14,10);

  SL_MULT=num(elSL,1.5); TP1_MULT=num(elTP1,1.0); TP2_MULT=num(elTP2,2.0);
  ATR_MIN_PCT=num(elAtrMin,0.05); ATR_MAX_PCT=num(elAtrMax,0.8);
  ACCT_SIZE=num(elAcct,10000); RISK_PCT=num(elRisk,1.0);

  USE_STOCH=!!elUseStoch?.checked; STOCH_K=parseInt(elStochK?.value??14,10); STOCH_D=parseInt(elStochD?.value??3,10);
  USE_BB=!!elUseBB?.checked; BB_PERIOD=parseInt(elBBPeriod?.value??20,10); BB_STD=num(elBBStd,2.0);

  AUTO_IND=!!elAutoInd?.checked;
  USE_RSI=elUseRSI?.checked!==false;
  USE_MACD=elUseMACD?.checked!==false;
  USE_EMA_TREND=elUseEMA?.checked!==false;
}

/* ========== Robust CSV Loader ========== */
// Small built-in fallback (last 20 bars demo) — يُستخدم فقط إذا فشل كل شيء
const FALLBACK_CSV = `Date,Time,Close
2025-09-30,13:00,4025.10
2025-09-30,13:05,4026.80
2025-09-30,13:10,4027.60
2025-09-30,13:15,4029.30
2025-09-30,13:20,4032.10
2025-09-30,13:25,4031.00
2025-09-30,13:30,4033.50
2025-09-30,13:35,4035.10
2025-09-30,13:40,4036.20
2025-09-30,13:45,4037.80
2025-09-30,13:50,4038.50
2025-09-30,13:55,4040.10
2025-09-30,14:00,4042.20
2025-09-30,14:05,4041.60
2025-09-30,14:10,4043.10
2025-09-30,14:15,4044.20
2025-09-30,14:20,4046.10
2025-09-30,14:25,4048.90
2025-09-30,14:30,4047.30
2025-09-30,14:35,4049.80`;

async function fetchText(url){
  const res = await fetch(url, {cache:'no-store'});
  if (!res.ok) throw new Error('HTTP '+res.status);
  return res.text();
}
async function resolveCsvText(userPath){
  const base = location.pathname.replace(/\/[^/]*$/,'/'); // مجلد الصفحة
  const candidates = [];

  // 1) مسار المستخدم إذا كتب شي
  if (userPath && userPath.trim()) candidates.push(userPath.trim());

  // 2) مسارات شائعة
  candidates.push(base+'XAUUSD_5min.csv');
  candidates.push(base+'data/XAUUSD_5min.csv');
  candidates.push('XAUUSD_5min.csv');
  candidates.push('./XAUUSD_5min.csv');

  // جرّب واحدة واحدة
  for (const u of candidates){
    try {
      const txt = await fetchText(u);
      if (txt && txt.trim().length>0) {
        console.log('[CSV] loaded:', u);
        return txt;
      }
    } catch(e){ /* continue */ }
  }
  console.warn('[CSV] fallback data used.');
  return FALLBACK_CSV;
}
function parseCsvText(txt){
  const lines = txt.trim().split(/\r?\n/);
  if (!lines.length) return [];

  // اكتشاف وجود هيدر
  let startIdx=0;
  const header = lines[0].toLowerCase();
  const hasHeader = /date|time|open|high|low|close/.test(header);
  if (hasHeader) startIdx=1;

  const out=[];
  for (let i=startIdx;i<lines.length;i++){
    const L = lines[i].split(',').map(s=>s.trim());
    if (!L.length) continue;

    let date, time, open, high, low, close;
    if (hasHeader){
      if (L.length>=7){ // ... Date,Time,Open,High,Low,Close
        date=L[L.length-6]; time=L[L.length-5];
        open=+L[L.length-4]; high=+L[L.length-3]; low=+L[L.length-2]; close=+L[L.length-1];
      } else if (L.length===3){ // Date,Time,Close
        date=L[0]; time=L[1]; close=+L[2]; open=high=low=close;
      } else if (L.length===2){ // Date,Close
        date=L[0]; time='00:00'; close=+L[1]; open=high=low=close;
      } else continue;
    } else {
      // بدون هيدر: افتراض (Date,Time,Close) أو (Date,Close)
      if (L.length===3){ date=L[0]; time=L[1]; close=+L[2]; open=high=low=close; }
      else if (L.length===2){ date=L[0]; time='00:00'; close=+L[1]; open=high=low=close; }
      else if (L.length>=7){ date=L[L.length-6]; time=L[L.length-5]; open=+L[L.length-4]; high=+L[L.length-3]; low=+L[L.length-2]; close=+L[L.length-1]; }
      else continue;
    }

    const ts = parseDateTime(date, time);
    if (!Number.isFinite(ts)) continue;
    out.push({ts, open, high, low, close});
  }
  return out.sort((a,b)=>a.ts-b.ts);
}
async function loadCsv(userPath){
  const txt = await resolveCsvText(userPath);
  return parseCsvText(txt);
}

/* ========== Indicators ========== */
function ema(arr, period){
  const k=2/(period+1), out=Array(arr.length).fill(NaN); let prev;
  for (let i=0;i<arr.length;i++){ const v=arr[i]; if(!Number.isFinite(v)) continue; prev=!Number.isFinite(prev)?v:(v*k+prev*(1-k)); out[i]=prev; }
  return out;
}
function rsi(closes, p){
  const out=Array(closes.length).fill(NaN); let g=0,l=0;
  for (let i=1;i<=p;i++){ const ch=closes[i]-closes[i-1]; g+=Math.max(0,ch); l+=Math.max(0,-ch); }
  let ag=g/p, al=l/p; out[p]=100-100/(1+(ag/(al||1e-9)));
  for (let i=p+1;i<closes.length;i++){ const ch=closes[i]-closes[i-1]; ag=(ag*(p-1)+Math.max(0,ch))/p; al=(al*(p-1)+Math.max(0,-ch))/p; out[i]=100-100/(1+(ag/(al||1e-9))); }
  return out;
}
function macd(closes, fast=12, slow=26, signal=9){
  const emaF=ema(closes,fast), emaS=ema(closes,slow);
  const m=closes.map((_,i)=>emaF[i]-emaS[i]); const sig=ema(m,signal);
  return {macd:m, signal:sig, emaF, emaS};
}
function atr(series, p){
  const tr=Array(series.length).fill(NaN);
  for(let i=1;i<series.length;i++){
    const h=series[i].high,l=series[i].low,pc=series[i-1].close;
    tr[i]=Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
  }
  return ema(tr,p);
}
const atrPct=(atrVal,price)=>(Number.isFinite(atrVal)&&Number.isFinite(price)&&price>0)?(atrVal/price):NaN;

function stochastic(series,kP=14,dP=3){
  const K=Array(series.length).fill(NaN), D=Array(series.length).fill(NaN);
  for (let i=kP-1;i<series.length;i++){
    let hh=-Infinity,ll=Infinity;
    for(let j=i-kP+1;j<=i;j++){ hh=Math.max(hh,series[j].high); ll=Math.min(ll,series[j].low); }
    const c=series[i].close; K[i]=(hh===ll)?50:((c-ll)/(hh-ll))*100;
  }
  for (let i=kP-1;i<series.length;i++){ let s=0,c=0; for(let j=Math.max(kP-1,i-dP+1);j<=i;j++){s+=K[j];c++;} D[i]=s/c; }
  return {K,D};
}
function bollinger(closes, period=20, std=2){
  const mid=ema(closes,period), up=Array(closes.length).fill(NaN), dn=Array(closes.length).fill(NaN);
  for (let i=period-1;i<closes.length;i++){
    const s=closes.slice(i-period+1,i+1), m=mid[i];
    const v=s.reduce((a,b)=>a+(b-m)*(b-m),0)/s.length, sd=Math.sqrt(v);
    up[i]=m+sd*std; dn[i]=m-sd*std;
  }
  return {mid,up,dn};
}

/* ========== Session + Pivots ========== */
function inNyTradingHours(ts){
  if (elToggleNyHours?.checked) return true;
  const d=new Date(ts); const t=d.getUTCHours()*60+d.getUTCMinutes(); // 13:00–22:00 UTC ≈ 08–17 NY
  return t>=13*60 && t<=22*60;
}
function dailyPivotsNY(series){
  if (!series.length) return null;
  // خُذ آخر يوم عملي (تقريبيًا آخر 288 بار من 5د)
  const bars = 288;
  const end = series.length-1, start=Math.max(0,end-bars+1);
  let H=-Infinity,L=Infinity,C=series[end].close;
  for (let i=start;i<=end;i++){ H=Math.max(H,series[i].high); L=Math.min(L,series[i].low); }
  if (!Number.isFinite(H)||!Number.isFinite(L)) return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}
function updatePivotUI(p){
  const set=(el,v)=>{ if(el) el.textContent=Number.isFinite(v)?v.toFixed(2):'—'; };
  if(!p){ ['r1','r2','r3','s1','s2','s3','pivotP'].forEach(id=>$(id).textContent='—'); return; }
  set(elR1,p.R1); set(elR2,p.R2); set(elR3,p.R3); set(elS1,p.S1); set(elS2,p.S2); set(elS3,p.S3); set(elPivotP,p.P);
}

/* ========== Context-aware (Auto) ========== */
function detectRegime(series, rsiArr, mac, atrArr){
  const i=series.length-1, price=series[i].close;
  const emaF=mac.emaF[i], emaS=mac.emaS[i];
  const macNow=mac.macd[i], macPrev=mac.macd[i-1], macSig=mac.signal[i];
  const atrP=atrPct(atrArr?.[i], price);

  const emaUp=Number.isFinite(emaF)&&Number.isFinite(emaS)&&emaF>emaS;
  const emaDn=Number.isFinite(emaF)&&Number.isFinite(emaS)&&emaF<emaS;
  const macUp=macNow>0, macDn=macNow<0;
  const macCrossUp=Number.isFinite(macPrev)&&macPrev<=macSig&&macNow>macSig;
  const macCrossDn=Number.isFinite(macPrev)&&macPrev>=macSig&&macNow<macSig;

  let trend='range';
  if ((emaUp&&macUp)||macCrossUp) trend='trend_up';
  if ((emaDn&&macDn)||macCrossDn) trend='trend_down';

  let vol='normal';
  if (Number.isFinite(atrP)){
    if (atrP <= (ATR_MIN_PCT*1.2)) vol='low';
    else if (atrP >= (ATR_MAX_PCT*0.9)) vol='high';
  }
  return {trend, vol:vol, atrP};
}
function applyAutoIndicatorPolicy(regime){
  USE_RSI=true; USE_MACD=true; USE_EMA_TREND=(regime.trend!=='range');
  USE_STOCH=(regime.trend==='range'); USE_BB=(regime.trend==='range');
  if (regime.vol==='high'){ MTF_CONFIRM=true; PIVOT_MIN_DISTANCE=Math.max(PIVOT_MIN_DISTANCE,1.0); ATR_MIN_PCT=Math.max(ATR_MIN_PCT,0.05); }
  if (elUseRSI) elUseRSI.checked=USE_RSI;
  if (elUseMACD) elUseMACD.checked=USE_MACD;
  if (elUseEMA) elUseEMA.checked=USE_EMA_TREND;
  if (elUseStoch) elUseStoch.checked=USE_STOCH;
  if (elUseBB) elUseBB.checked=USE_BB;
}

/* ========== Signal ========== */
function rsiMacdCtx(series, rsiArr, mac, i){
  return { rsiVal:rsiArr[i], macdNow:mac.macd[i], macdPrev:mac.macd[i-1], macdSig:mac.signal[i],
           emaF:mac.emaF[i], emaS:mac.emaS[i], price:series[i].close };
}
function decideSignal(ctx){
  const useRSI=USE_RSI, useMACD=USE_MACD, useEMA=USE_EMA_TREND;
  if(!useRSI && !useMACD && !useEMA) return 'حيادي';

  if (PRO_MODE){
    const macBuy  = !useMACD || ((ctx.macdPrev<=ctx.macdSig && ctx.macdNow>ctx.macdSig) || ctx.macdNow>ctx.macdSig);
    const macSell = !useMACD || ((ctx.macdPrev>=ctx.macdSig && ctx.macdNow<ctx.macdSig) || ctx.macdNow<ctx.macdSig);
    const emaUp = !useEMA || (ctx.price>ctx.emaF && ctx.emaF>ctx.emaS);
    const emaDn = !useEMA || (ctx.price<ctx.emaF && ctx.emaF<ctx.emaS);
    const rsiBuy  = !useRSI || (ctx.rsiVal>50 && ctx.rsiVal<70);
    const rsiSell = !useRSI || (ctx.rsiVal<50);
    if (macBuy && emaUp && rsiBuy)  return 'شراء';
    if (macSell && emaDn && rsiSell) return 'بيع';
    return 'حيادي';
  } else {
    if (useMACD && useRSI){
      if (ctx.macdNow>0 && ctx.rsiVal>=50) return 'شراء';
      if (ctx.macdNow<0 && ctx.rsiVal<=50) return 'بيع';
      return 'حيادي';
    }
    if (useMACD){ if (ctx.macdNow>0) return 'شراء'; if (ctx.macdNow<0) return 'بيع'; return 'حيادي'; }
    if (useRSI){ if (ctx.rsiVal>=50&&ctx.rsiVal<=70) return 'شراء'; if (ctx.rsiVal<=50) return 'بيع'; return 'حيادي'; }
    if (useEMA){ if (ctx.emaF>ctx.emaS && ctx.price>ctx.emaF) return 'شراء'; if (ctx.emaF<ctx.emaS && ctx.price<ctx.emaF) return 'بيع'; return 'حيادي'; }
    return 'حيادي';
  }
}
function applyExtraFilters(sig, series, i, stoch, bb, pv){
  if (sig==='حيادي') return sig;
  if (USE_STOCH){
    const K=stoch.K[i], D=stoch.D[i];
    if (sig==='شراء' && !(K>D && K<80)) sig='حيادي';
    if (sig==='بيع'  && !(K<D && K>20)) sig='حيادي';
  }
  if (USE_BB && bb){
    const c=series[i].close, mid=bb.mid[i], up=bb.up[i], dn=bb.dn[i];
    if (sig==='شراء' && !(c>=mid && c<=up)) sig='حيادي';
    if (sig==='بيع'  && !(c<=mid && c>=dn)) sig='حيادي';
  }
  if (!elTogglePivotFilter?.checked && pv){
    const c=series[i].close, levels=[pv.P,pv.R1,pv.R2,pv.R3,pv.S1,pv.S2,pv.S3];
    const nearest=levels.reduce((a,b)=>Math.abs(b-c)<Math.abs(a-c)?b:a,levels[0]);
    if (Math.abs(nearest-c) < PIVOT_MIN_DISTANCE) sig='حيادي';
  }
  return sig;
}
function strongMTFConfirm(){ return !MTF_CONFIRM ? true : true; } // placeholder

/* ========== Chart ========== */
function resizeCanvas(){
  if(!elChart) return;
  const rect=elChart.getBoundingClientRect();
  elChart.width = Math.max(600, Math.floor(rect.width));
  elChart.height= Math.max(240, Math.floor(rect.height));
}
function clearChart(){
  if(!ctxChart) return;
  ctxChart.clearRect(0,0,elChart.width, elChart.height);
  ctxChart.fillStyle='#0b1220'; ctxChart.fillRect(0,0,elChart.width, elChart.height);
}
function priceToY(price, minP, maxP){
  const p=(price-minP)/(maxP-minP || 1);
  return elChart.height-18 - p*(elChart.height-36);
}
function drawHLine(y,color){
  ctxChart.strokeStyle=color; ctxChart.lineWidth=1.2;
  ctxChart.beginPath(); ctxChart.moveTo(18,y); ctxChart.lineTo(elChart.width-18,y); ctxChart.stroke();
}
function updateIndicatorChips(values){
  const show=(el,flag,textOk)=>{ if(!el) return; el.parentElement.style.display = flag?'inline-block':'none'; if(flag) el.textContent=textOk; };
  show(elIndRSI,  USE_RSI,  Number.isFinite(values.rsi)?values.rsi.toFixed(1):'—');
  show(elIndMACD, USE_MACD, Number.isFinite(values.macd)?values.macd.toFixed(3):'—');
  show(elIndEMAF, USE_EMA_TREND, Number.isFinite(values.emaF)?values.emaF.toFixed(2):'—');
  show(elIndEMAS, USE_EMA_TREND, Number.isFinite(values.emaS)?values.emaS.toFixed(2):'—');
  show(elIndStoch, USE_STOCH, (Number.isFinite(values.stK)&&Number.isFinite(values.stD))?`${values.stK.toFixed(0)}/${values.stD.toFixed(0)}`:'—');
  show(elIndBB,    USE_BB, Number.isFinite(values.bbMid)?values.bbMid.toFixed(2):'—');
}

/* ========== Pipeline ========== */
async function run(){
  loadSettings();

  // CSV (robust)
  const userPath = (elCsvInput?.value||'').trim();
  const series = await loadCsv(userPath);
  if (!series.length){ alert('CSV فارغ أو تنسيقه غير معروف'); return; }

  const last=series[series.length-1], live=last.close;
  elLivePrice.textContent=Number.isFinite(live)?live.toFixed(2):'—';
  const tl=toLocal(last.ts); elLiveTime.textContent=`${tl.date} • ${tl.time}`;

  const closes=series.map(s=>s.close);
  const rsiArr=rsi(closes, RSI_PERIOD);
  const mac=macd(closes, EMA_FAST, EMA_SLOW, 9);
  const atrArr=atr(series, ATR_PERIOD);
  const stoch=stochastic(series, STOCH_K, STOCH_D);
  const bb=USE_BB?bollinger(closes, BB_PERIOD, BB_STD):null;

  if (AUTO_IND){ const regime=detectRegime(series, rsiArr, mac, atrArr); applyAutoIndicatorPolicy(regime); }

  const pv=dailyPivotsNY(series); updatePivotUI(pv);

  const i=series.length-1;
  updateIndicatorChips({ rsi:rsiArr[i], macd:mac.macd[i], emaF:mac.emaF[i], emaS:mac.emaS[i],
                         stK:stoch.K[i], stD:stoch.D[i], bbMid:bb?.mid?.[i] });

  let sig='حيادي';
  if (USE_RSI || USE_MACD || USE_EMA_TREND){
    if (inNyTradingHours(series[i].ts)){
      sig=decideSignal( rsiMacdCtx(series, rsiArr, mac, i) );
      const ap=atrPct(atrArr?.[i], series[i].close);
      if (Number.isFinite(ap) && (ap<ATR_MIN_PCT||ap>ATR_MAX_PCT)) sig='حيادي';
      if (sig!=='حيادي') sig=applyExtraFilters(sig, series, i, stoch, bb, pv);
      if (sig!=='حيادي' && !strongMTFConfirm()) sig='حيادي';
    } else sig='حيادي';
  }

  // Summary
  if (!USE_RSI && !USE_MACD && !USE_EMA_TREND){
    elSummaryText.textContent='حيادي (كل المؤشرات مطفّاة)'; elSummaryText.style.color='#f59e0b';
  } else {
    elSummaryText.textContent=(sig==='شراء')?'شراء':(sig==='بيع')?'بيع':'حيادي';
    elSummaryText.style.color=(sig==='شراء')?'#10b981':(sig==='بيع')?'#ef4444':'#f59e0b';
  }

  // Chart
  if (ctxChart){
    resizeCanvas(); clearChart();
    const N=Math.min(series.length,180), win=series.slice(series.length-N);
    const minP=Math.min(...win.map(s=>s.low)), maxP=Math.max(...win.map(s=>s.high));

    // price line
    ctxChart.strokeStyle='#3b82f6'; ctxChart.lineWidth=1.3;
    ctxChart.beginPath();
    for (let k=0;k<win.length;k++){
      const x=18 + k*((elChart.width-36)/(win.length-1||1));
      const y=priceToY(win[k].close,minP,maxP);
      (k===0)?ctxChart.moveTo(x,y):ctxChart.lineTo(x,y);
    }
    ctxChart.stroke();

    // live
    drawHLine(priceToY(live,minP,maxP),'#ffffff');

    if (sig!=='حيادي'){
      const entry=live, atrNow=atrArr[i]||0, dir=(sig==='شراء')?1:-1;
      const sl=entry - dir*SL_MULT*atrNow, tp1=entry + dir*TP1_MULT*atrNow, tp2=entry + dir*TP2_MULT*atrNow;
      drawHLine(priceToY(entry,minP,maxP),'#60a5fa');
      drawHLine(priceToY(sl,minP,maxP),'#ef4444');
      drawHLine(priceToY(tp1,minP,maxP),'#10b981');
      drawHLine(priceToY(tp2,minP,maxP),'#10b981');
    }
  }

  // Table
  if (elRowsBody){
    elRowsBody.innerHTML='';
    const M=20, from=Math.max(0,series.length-M);
    for (let k=from;k<series.length;k++){
      const s=series[k], tm=toLocal(s.ts);
      let rowSig='حيادي';
      if (USE_RSI||USE_MACD||USE_EMA_TREND){
        if (inNyTradingHours(s.ts)){
          let tmp = decideSignal( rsiMacdCtx(series, rsiArr, mac, k) );
          const ap=atrPct(atrArr?.[k], s.close);
          if (Number.isFinite(ap) && (ap<ATR_MIN_PCT||ap>ATR_MAX_PCT)) tmp='حيادي';
          tmp=applyExtraFilters(tmp, series, k, stoch, bb, pv);
          rowSig=tmp;
        }
      }
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${tm.date}</td>
        <td>${tm.time}</td>
        <td>${Number.isFinite(s.close)?s.close.toFixed(2):'—'}</td>
        <td>${rowSig}</td>
        <td>${Number.isFinite(rsiArr[k])?rsiArr[k].toFixed(1):'—'}</td>
        <td>${Number.isFinite(mac.macd[k])?mac.macd[k].toFixed(3):'—'}</td>
        <td>${Number.isFinite(mac.emaF[k])?mac.emaF[k].toFixed(2):'—'}</td>`;
      elRowsBody.appendChild(tr);
    }
  }

  // Optional alert
  if (elAlertEnable?.checked && sig!=='حيادي'){
    const dist=Math.max(num(elAlertDistance,0.5), 0.25*(atrArr[i]||0));
    console.log('Proximity alert armed ±', dist.toFixed(2));
  }
}

/* ========== Events ========== */
[elTf5,elTf30,elTf60,elTfD].forEach(btn=>{
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    [elTf5,elTf30,elTf60,elTfD].forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    TF=(btn===elTf5)?5:(btn===elTf30)?30:(btn===elTf60)?60:1440;
    run();
  });
});
[
  elPro, elMtf, elUseRSI, elUseMACD, elUseEMA, elUseStoch, elUseBB, elAutoInd,
  elToggleNyHours, elTogglePivotFilter,
  elEmaF, elEmaS, elRSIP, elATRP, elSL, elTP1, elTP2, elAtrMin, elAtrMax, elAcct, elRisk,
  elStochK, elStochD, elBBPeriod, elBBStd, elAlertEnable, elAlertDistance, elCsvInput
].forEach(el=>{ if(!el) return; el.addEventListener('change', run); });

if (elRun) elRun.addEventListener('click', run);

/* Boot */
window.addEventListener('load', ()=>{
  elTf5?.classList.add('active');
  run().catch(e=>{ console.error(e); alert('حدث خطأ أثناء التحليل'); });
});
