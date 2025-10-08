
/* =========================================================
   app1.js — GoldSignals (clean build)
   - Full compatibility with current HTML (IDs unchanged)
   - Robust CSV loader + live-price merge
   - Indicators (EMA/RSI/MACD/ATR/Stoch/BB)
   - Auto-Indicators by market regime (with UI sync)
   - NY pivots, filters, table (local time), alerts
   - Canvas chart (price + EMA + entry/SL/TP + live line)
   - Simple backtest (per TF) + Stats placeholder
   ========================================================= */

(function(){
  "use strict";

  /* -------------------- DOM helpers -------------------- */
  const $ = (id)=>document.getElementById(id);
  const fmt2 = (v)=>Number.isFinite(v)?v.toFixed(2):'—';
  const fmt3 = (v)=>Number.isFinite(v)?v.toFixed(3):'—';
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  /* -------------------- Bind DOM -------------------- */
  // Core controls
  const elCsvInput = $('csvInput');
  const elRun      = $('runBtn');

  const elTf5  = $('tf5');
  const elTf30 = $('tf30');
  const elTf60 = $('tf60');
  const elTfD  = $('tfD');

  const elPro  = $('proMode');
  const elMtf  = $('mtfConfirm');

  const elAuto = $('autoInd');
  const elUseRSI  = $('useRSI');
  const elUseMACD = $('useMACD');
  const elUseEMA  = $('useEMA');
  const elUseStoch= $('useStoch');
  const elUseBB   = $('useBB');

  // indicator params
  const elEmaF=$('emaFast'), elEmaS=$('emaSlow'), elRSIP=$('rsiPeriod'), elATRP=$('atrPeriod');
  const elSL=$('slMult'), elTP1=$('tp1Mult'), elTP2=$('tp2Mult');
  const elAtrMin=$('atrMinPct'), elAtrMax=$('atrMaxPct');
  const elAcct=$('acctSize'), elRisk=$('riskPct');
  const elStochK=$('stochK'), elStochD=$('stochD');
  const elBBPeriod=$('bbPeriod'), elBBStd=$('bbStd');

  // filters
  const elToggleNyHours = $('toggleNyHours'); // if checked -> ignore NY hours filter (i.e., allow all hours)
  const elTogglePivotFilter = $('togglePivotFilter'); // if checked -> disable pivot distance filter

  // summary & chips
  const elLivePrice=$('livePrice'), elLiveTime=$('liveTime'), elSummaryText=$('summaryText');
  const elIndRSI=$('indRSI'), elIndMACD=$('indMACD'), elIndEMAF=$('indEMAF'), elIndEMAS=$('indEMAS');
  const elIndStoch=$('indStoch'), elIndBB=$('indBB');

  // pivots
  const elR1=$('r1'), elR2=$('r2'), elR3=$('r3'), elS1=$('s1'), elS2=$('s2'), elS3=$('s3'), elPivotP=$('pivotP');

  // table
  const elRowsBody=$('rowsBody');

  // alerts
  const elAlertEnable=$('alertEnable'), elAlertDistance=$('alertDistance');

  // chart
  const elChart=$('tradeChart'); const ctx = elChart ? elChart.getContext('2d') : null;

  // optional backtest output
  const elBacktest = $('backtestStats'); // if exists, we will populate

  /* -------------------- State -------------------- */
  let TF = 5; // minutes (5, 30, 60, 1440)
  let PRO_MODE=false, MTF_CONFIRM=true;

  // indicator toggles
  let USE_RSI=true, USE_MACD=true, USE_EMA_TREND=true, USE_STOCH=false, USE_BB=false, AUTO_IND=false;

  // params
  let EMA_FAST=12, EMA_SLOW=26, RSI_PERIOD=14, ATR_PERIOD=14;
  let SL_MULT=1.5, TP1_MULT=1.0, TP2_MULT=2.0;
  let ATR_MIN_PCT=0.05, ATR_MAX_PCT=0.8;
  let ACCT_SIZE=10000, RISK_PCT=1.0;
  let STOCH_K=14, STOCH_D=3, BB_PERIOD=20, BB_STD=2.0;

  // pivot filter
  let PIVOT_MIN_DISTANCE=0.8; // in price units

  // data
  let series5 = []; // base (5m)
  let seriesTF = []; // aggregated for active TF
  let lastLive = null; // {price, ts}
  let lastPivot = null;

  // cache for backtest / exporter
  let __cache = { base5:[], tf:[], piv:null };

  /* -------------------- Utils -------------------- */
  function toLocal(ts){
    const d = new Date(ts);
    return { date: d.toLocaleDateString(), time: d.toLocaleTimeString() };
  }
  function parseDateTime(dateStr, timeStr){
    const d=(dateStr||'').trim(), t=(timeStr||'').trim();
    // attempt common formats
    const iso = Date.parse(`${d} ${t}`);
    if (Number.isFinite(iso)) return iso;
    // yyyy-mm-dd hh:mm
    const m = d.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (m){
      const [_,y,mo,da] = m; const parts=(t||'00:00:00').split(':').map(Number);
      return Date.UTC(+y, +mo-1, +da, parts[0]||0, parts[1]||0, parts[2]||0);
    }
    return NaN;
  }

  /* -------------------- CSV Loader (robust) -------------------- */
  const FALLBACK_CSV=`Date,Time,Close
2025-09-30,13:00,1925.10
2025-09-30,13:05,1926.20
2025-09-30,13:10,1927.00
2025-09-30,13:15,1926.40
2025-09-30,13:20,1927.80
2025-09-30,13:25,1928.30
2025-09-30,13:30,1928.90
2025-09-30,13:35,1929.40
2025-09-30,13:40,1928.70
2025-09-30,13:45,1930.10`;

  function parseCsv(text){
    const lines=(text||'').trim().split(/\r?\n/);
    if (!lines.length) return [];
    const header = lines[0].toLowerCase();
    const hasHeader = /date|time|open|high|low|close/.test(header);
    let start=hasHeader?1:0;
    const out=[];
    for (let i=start;i<lines.length;i++){
      const L = lines[i].split(',').map(s=>s.trim());
      if (!L.length) continue;
      let date, time, o,h,l,c;
      if (hasHeader && L.length>=7){
        date=L[L.length-6]; time=L[L.length-5];
        o=+L[L.length-4]; h=+L[L.length-3]; l=+L[L.length-2]; c=+L[L.length-1];
      } else if (L.length===3){
        date=L[0]; time=L[1]; c=+L[2]; o=h=l=c;
      } else if (L.length===2){
        date=L[0]; time='00:00'; c=+L[1]; o=h=l=c;
      } else continue;
      const ts=parseDateTime(date, time);
      if (!Number.isFinite(ts)) continue;
      out.push({ts, open:o, high:h, low:l, close:c});
    }
    return out.sort((a,b)=>a.ts-b.ts);
  }

  async function fetchCsv(url){
    const preferred = (url && url.trim()) ? url.trim() : 'XAUUSD_5min.csv';
    const base = location.pathname.replace(/\/[^/]*$/,'/');
    const candidates = [preferred, './'+preferred, base+preferred, base+'XAUUSD_5min.csv', base+'data/XAUUSD_5min.csv'];
    for (const u of candidates){
      try{
        const r = await fetch(u, {cache:'no-store'});
        if (!r.ok) throw 0;
        const txt = await r.text();
        const rows = parseCsv(txt);
        if (rows.length) return rows;
      }catch(_){}
    }
    // fallback
    return parseCsv(FALLBACK_CSV);
  }

  /* -------------------- Aggregation -------------------- */
  function bucket(ts, minutes){
    return Math.floor(ts / (minutes*60*1000)) * (minutes*60*1000);
  }
  function aggregateOHLC(rows, minutes){
    if (minutes===5) return rows.slice();
    const map = new Map();
    for (const r of rows){
      const b = bucket(r.ts, minutes);
      const g = map.get(b);
      if (!g) map.set(b, {ts:b, open:r.open, high:r.high, low:r.low, close:r.close});
      else {
        g.high = Math.max(g.high, r.high);
        g.low  = Math.min(g.low,  r.low);
        g.close= r.close;
      }
    }
    return Array.from(map.values()).sort((a,b)=>a.ts-b.ts);
  }

  /* -------------------- Indicators -------------------- */
  function ema(arr, p){
    const k=2/(p+1), out=Array(arr.length).fill(NaN); let prev;
    for (let i=0;i<arr.length;i++){
      const v=arr[i]; if(!Number.isFinite(v)) continue;
      prev = !Number.isFinite(prev)?v:(v*k+prev*(1-k)); out[i]=prev;
    }
    return out;
  }
  function rsi(closes, p){
    const out=Array(closes.length).fill(NaN);
    let g=0,l=0;
    for (let i=1;i<=p;i++){ const ch=closes[i]-closes[i-1]; g+=Math.max(0,ch); l+=Math.max(0,-ch); }
    let ag=g/p, al=l/p; out[p]=100-100/(1+(ag/(al||1e-9)));
    for (let i=p+1;i<closes.length;i++){
      const ch=closes[i]-closes[i-1];
      ag=(ag*(p-1)+Math.max(0,ch))/p;
      al=(al*(p-1)+Math.max(0,-ch))/p;
      out[i]=100-100/(1+(ag/(al||1e-9)));
    }
    return out;
  }
  function macdFromCloses(closes, fast=12, slow=26, signal=9){
    const ef=ema(closes, fast), es=ema(closes, slow);
    const mac = closes.map((_,i)=>ef[i]-es[i]);
    const sig = ema(mac, signal);
    return {macd:mac, signal:sig, emaF:ef, emaS:es};
  }
  function atr(rows, p){
    const tr=Array(rows.length).fill(NaN);
    for (let i=1;i<rows.length;i++){
      const h=rows[i].high, l=rows[i].low, pc=rows[i-1].close;
      tr[i]=Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
    }
    return ema(tr, p);
  }
  function stochastic(rows, kP=14, dP=3){
    const K=Array(rows.length).fill(NaN), D=Array(rows.length).fill(NaN);
    for (let i=kP-1;i<rows.length;i++){
      let hh=-Infinity,ll=Infinity;
      for (let j=i-kP+1;j<=i;j++){ hh=Math.max(hh,rows[j].high); ll=Math.min(ll,rows[j].low); }
      const c=rows[i].close; K[i]=(hh===ll)?50:((c-ll)/(hh-ll))*100;
    }
    for (let i=kP-1;i<rows.length;i++){
      let s=0,c=0; for(let j=Math.max(kP-1,i-dP+1);j<=i;j++){ s+=K[j]; c++; }
      D[i]=s/c;
    }
    return {K,D};
  }
  function bollinger(closes, period=20, std=2.0){
    const mid=ema(closes, period), up=Array(closes.length).fill(NaN), dn=Array(closes.length).fill(NaN);
    for (let i=period-1;i<closes.length;i++){
      const s=closes.slice(i-period+1,i+1), m=mid[i];
      const v=s.reduce((a,b)=>a+(b-m)*(b-m),0)/s.length, sd=Math.sqrt(v);
      up[i]=m+sd*std; dn[i]=m-sd*std;
    }
    return {mid,up,dn};
  }
  const atrPct=(a,p)=>(Number.isFinite(a)&&Number.isFinite(p)&&p>0)?(a/p):NaN;

  /* -------------------- NY Pivot -------------------- */
  function dailyPivotsNY(rows5){
    if (!rows5.length) return null;
    // previous NY session range (approx: last 288 bars @5m)
    const bars=288, end=rows5.length-1, start=Math.max(0,end-bars+1);
    let H=-Infinity, L=Infinity, C=rows5[end].close;
    for (let i=start;i<=end;i++){ H=Math.max(H,rows5[i].high); L=Math.min(L,rows5[i].low); }
    if (!Number.isFinite(H)||!Number.isFinite(L)) return null;
    const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
    return {P,R1,R2,R3,S1,S2,S3};
  }
  function updatePivotUI(p){
    const set=(el,v)=>{ if(el) el.textContent=Number.isFinite(v)?v.toFixed(2):'—'; };
    if(!p){ ['r1','r2','r3','s1','s2','s3','pivotP'].forEach(id=>$(id).textContent='—'); return; }
    set(elR1,p.R1); set(elR2,p.R2); set(elR3,p.R3); set(elS1,p.S1); set(elS2,p.S2); set(elS3,p.S3); set(elPivotP,p.P);
  }

  /* -------------------- Auto by Market -------------------- */
  function computeRegime(rows){
    if (!rows || rows.length<30) return {trend:'range', vol:'normal'};
    const closes = rows.map(x=>x.close);
    const mac = macdFromCloses(closes, EMA_FAST, EMA_SLOW, 9);
    const i = rows.length-1;
    const emaUp = Number.isFinite(mac.emaF[i]) && Number.isFinite(mac.emaS[i]) && mac.emaF[i] > mac.emaS[i];
    const emaDn = Number.isFinite(mac.emaF[i]) && Number.isFinite(mac.emaS[i]) && mac.emaF[i] < mac.emaS[i];
    const trend = emaUp ? 'trend_up' : (emaDn ? 'trend_down' : 'range');
    const aArr = atr(rows, ATR_PERIOD);
    const ap = atrPct(aArr[i], rows[i].close);
    let vol='normal';
    if (Number.isFinite(ap)){
      if (ap>=0.003) vol='high'; else if (ap<=0.0008) vol='low';
    }
    return {trend, vol};
  }
  function applyAuto(rows){
    const r = computeRegime(rows);
    if (r.trend==='trend_up' || r.trend==='trend_down'){
      USE_EMA_TREND = true; USE_MACD = true; USE_RSI = (r.vol!=='low');
      USE_STOCH=false; USE_BB=false;
    } else {
      USE_EMA_TREND = false; USE_MACD = false; USE_RSI = true;
      USE_STOCH=true; USE_BB=true;
    }
    // reflect on UI
    if (elUseRSI) elUseRSI.checked=USE_RSI;
    if (elUseMACD) elUseMACD.checked=USE_MACD;
    if (elUseEMA) elUseEMA.checked=USE_EMA_TREND;
    if (elUseStoch) elUseStoch.checked=USE_STOCH;
    if (elUseBB) elUseBB.checked=USE_BB;
  }

  /* -------------------- Live price merge -------------------- */
  // External hook: window.setLivePrice(price, ts?) can feed ticks from another script
  window.setLivePrice = function(price, ts){
    if (!Number.isFinite(+price)) return;
    lastLive = {price:+price, ts: ts? +ts : Date.now()};
    updateLiveInfo();
    // re-run with merge
    run();
  };
  function updateLiveInfo(){
    if (!lastLive) return;
    if (elLivePrice) elLivePrice.textContent = fmt2(lastLive.price);
    if (elLiveTime){
      const d=new Date(lastLive.ts||Date.now());
      elLiveTime.textContent = `${d.toLocaleDateString()} • ${d.toLocaleTimeString()}`;
    }
  }
  function mergeLiveInto(series, minutes, live){
    if (!live || !series.length) return series;
    const b = bucket(live.ts, minutes);
    const last = series[series.length-1];
    if (last && bucket(last.ts, minutes)===b){
      // same bucket → update last bar
      last.close = live.price;
      last.high  = Math.max(last.high, live.price);
      last.low   = Math.min(last.low, live.price);
      return series;
    } else {
      // new bucket → append new bar
      const prev = last || {close: live.price};
      series.push({ts:b, open:prev.close, high:live.price, low:live.price, close:live.price});
      return series;
    }
  }

  /* -------------------- Signals -------------------- */
  function decideSignal(ctx){
    // Respect toggles
    const useRSI=USE_RSI, useMACD=USE_MACD, useEMA=USE_EMA_TREND;
    if (!useRSI && !useMACD && !useEMA) return 'حيادي';

    if (PRO_MODE){
      const macBuy  = !useMACD || ((ctx.macdPrev<=ctx.macdSig && ctx.macdNow>ctx.macdSig) || (ctx.macdNow>ctx.macdSig));
      const macSell = !useMACD || ((ctx.macdPrev>=ctx.macdSig && ctx.macdNow<ctx.macdSig) || (ctx.macdNow<ctx.macdSig));
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
  function applyExtraFilters(sig, rows, i, stoch, bb, piv){
    if (sig==='حيادي') return sig;
    if (USE_STOCH){
      const K=stoch.K[i], D=stoch.D[i];
      if (sig==='شراء' && !(K>D && K<80)) sig='حيادي';
      if (sig==='بيع'  && !(K<D && K>20)) sig='حيادي';
    }
    if (USE_BB && bb){
      const c=rows[i].close, mid=bb.mid[i], up=bb.up[i], dn=bb.dn[i];
      if (sig==='شراء' && !(c>=mid && c<=up)) sig='حيادي';
      if (sig==='بيع'  && !(c<=mid && c>=dn)) sig='حيادي';
    }
    if (!elTogglePivotFilter?.checked && piv){
      const c=rows[i].close, L=[piv.P,piv.R1,piv.R2,piv.R3,piv.S1,piv.S2,piv.S3];
      const nearest=L.reduce((a,b)=>Math.abs(b-c)<Math.abs(a-c)?b:a,L[0]);
      if (Math.abs(nearest-c)<PIVOT_MIN_DISTANCE) sig='حيادي';
    }
    return sig;
  }
  function inNyTradingHours(ts){
    if (elToggleNyHours?.checked) return true; // ignore filter (show signals all day)
    const d=new Date(ts); const t=d.getUTCHours()*60+d.getUTCMinutes(); // 13:00–22:00 UTC ~ 08–17 NY
    return t>=13*60 && t<=22*60;
  }

  /* -------------------- Chart -------------------- */
  function resizeCanvas(){
    if(!elChart) return;
    const rect=elChart.getBoundingClientRect();
    elChart.width = Math.max(600, Math.floor(rect.width));
    elChart.height= Math.max(260, Math.floor(rect.height));
  }
  function clearChart(){
    if(!ctx) return;
    ctx.clearRect(0,0,elChart.width, elChart.height);
    ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,elChart.width, elChart.height);
  }
  function priceToY(price, minP, maxP){
    const p=(price-minP)/(maxP-minP || 1);
    return elChart.height-18 - p*(elChart.height-36);
  }
  function drawH(y, color){
    ctx.strokeStyle=color; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(18,y); ctx.lineTo(elChart.width-18,y); ctx.stroke();
  }

  /* -------------------- Backtest (simple) -------------------- */
  function backtest(rowsTF, rsiArr, mac, atrArr, piv, stoch, bb){
    let wins=0, losses=0, neutrals=0;
    let pnl=0, trades=0;
    for (let i=30;i<rowsTF.length;i++){
      if (!inNyTradingHours(rowsTF[i].ts)) continue;
      const ctxSig = {
        rsiVal:rsiArr[i],
        macdNow:mac.macd[i], macdPrev:mac.macd[i-1], macdSig:mac.signal[i],
        emaF:mac.emaF[i], emaS:mac.emaS[i], price:rowsTF[i].close
      };
      let sig = decideSignal(ctxSig);
      const ap = atrPct(atrArr[i], rowsTF[i].close);
      if (Number.isFinite(ap) && (ap<ATR_MIN_PCT || ap>ATR_MAX_PCT)) sig='حيادي';
      sig = applyExtraFilters(sig, rowsTF, i, stoch, bb, piv);
      if (sig==='حيادي'){ neutrals++; continue; }

      trades++;
      const dir = sig==='شراء'? +1 : -1;
      const entry = rowsTF[i].close;
      const atrNow = atrArr[i]||0;
      const sl = entry - dir*SL_MULT*atrNow;
      const tp = entry + dir*TP1_MULT*atrNow;
      // walk forward few bars to decide
      let closed=false;
      for (let k=i+1;k<Math.min(rowsTF.length, i+20);k++){
        const h=rowsTF[k].high, l=rowsTF[k].low;
        if (dir>0 && l<=sl){ losses++; pnl -= SL_MULT*atrNow; closed=true; break; }
        if (dir>0 && h>=tp){ wins++;   pnl += TP1_MULT*atrNow; closed=true; break; }
        if (dir<0 && h>=sl){ losses++; pnl -= SL_MULT*atrNow; closed=true; break; }
        if (dir<0 && l<=tp){ wins++;   pnl += TP1_MULT*atrNow; closed=true; break; }
      }
      if (!closed){ neutrals++; }
    }
    return {wins, losses, neutrals, trades, pnl};
  }

  /* -------------------- Main pipeline -------------------- */
  function loadSettings(){
    const gi=(el,d)=>parseInt(el?.value??d,10);
    const gf=(el,d)=>parseFloat(el?.value??d);

    EMA_FAST=gi(elEmaF,12); EMA_SLOW=gi(elEmaS,26); RSI_PERIOD=gi(elRSIP,14); ATR_PERIOD=Math.max(2,gi(elATRP,14));
    SL_MULT=gf(elSL,1.5); TP1_MULT=gf(elTP1,1.0); TP2_MULT=gf(elTP2,2.0);
    ATR_MIN_PCT=gf(elAtrMin,0.05); ATR_MAX_PCT=gf(elAtrMax,0.8);
    ACCT_SIZE=gf(elAcct,10000); RISK_PCT=gf(elRisk,1.0);
    STOCH_K=gi(elStochK,14); STOCH_D=gi(elStochD,3); BB_PERIOD=gi(elBBPeriod,20); BB_STD=gf(elBBStd,2.0);

    PRO_MODE=!!elPro?.checked; MTF_CONFIRM=!!elMtf?.checked;

    AUTO_IND=!!elAuto?.checked;
    // manual toggles
    USE_RSI = elUseRSI ? !!elUseRSI.checked : true;
    USE_MACD= elUseMACD? !!elUseMACD.checked: true;
    USE_EMA_TREND= elUseEMA? !!elUseEMA.checked: true;
    USE_STOCH = elUseStoch? !!elUseStoch.checked : false;
    USE_BB    = elUseBB   ? !!elUseBB.checked    : false;
  }

  function paintChips(vals){
    const show=(el, on, text)=>{ if (!el) return; (el.parentElement||el).style.display = on?'inline-block':'none'; if (on) el.textContent=text; };
    show(elIndRSI,  USE_RSI,  Number.isFinite(vals.rsi)?vals.rsi.toFixed(1):'—');
    show(elIndMACD, USE_MACD, Number.isFinite(vals.macd)?vals.macd.toFixed(3):'—');
    show(elIndEMAF, USE_EMA_TREND, Number.isFinite(vals.emaF)?vals.emaF.toFixed(2):'—');
    show(elIndEMAS, USE_EMA_TREND, Number.isFinite(vals.emaS)?vals.emaS.toFixed(2):'—');
    show(elIndStoch, USE_STOCH, (Number.isFinite(vals.stK)&&Number.isFinite(vals.stD))?`${vals.stK.toFixed(0)}/${vals.stD.toFixed(0)}`:'—');
    show(elIndBB, USE_BB, Number.isFinite(vals.bbMid)?vals.bbMid.toFixed(2):'—');
  }

  function paintTable(rows, rsiArr, mac, stoch){
    if (!elRowsBody) return;
    elRowsBody.innerHTML='';
    const M=20, from=Math.max(0, rows.length-M);
    for (let i=from;i<rows.length;i++){
      const tm=toLocal(rows[i].ts);
      // basic row signal (not full filter, just quick glance)
      const basic = (mac.macd[i]>0 && rsiArr[i]>=50) ? 'شراء' : (mac.macd[i]<0 && rsiArr[i]<=50 ? 'بيع' : 'حيادي');
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${tm.date}</td>
        <td>${tm.time}</td>
        <td>${fmt2(rows[i].close)}</td>
        <td>${basic}</td>
        <td>${Number.isFinite(rsiArr[i])?rsiArr[i].toFixed(1):'—'}</td>
        <td>${Number.isFinite(mac.macd[i])?mac.macd[i].toFixed(3):'—'}</td>
        <td>${Number.isFinite(mac.emaF[i])?mac.emaF[i].toFixed(2):'—'}</td>`;
      elRowsBody.appendChild(tr);
    }
  }

  function drawChart(rows, mac, entryPack){
    if (!ctx || !rows.length) return;
    resizeCanvas(); clearChart();
    const N=Math.min(rows.length, 180), win=rows.slice(rows.length-N);
    const minP=Math.min(...win.map(s=>s.low)), maxP=Math.max(...win.map(s=>s.high));
    // price line
    ctx.strokeStyle='#3b82f6'; ctx.lineWidth=1.3; ctx.beginPath();
    for (let k=0;k<win.length;k++){
      const x=18 + k*((elChart.width-36)/(win.length-1||1));
      const y=priceToY(win[k].close,minP,maxP);
      (k===0)?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.stroke();
    // EMAF/EMAS (if on)
    if (USE_EMA_TREND){
      const startIndex = rows.length - N;
      // emaF
      ctx.strokeStyle='#a78bfa'; ctx.lineWidth=1; ctx.beginPath();
      for (let k=0;k<win.length;k++){
        const i = startIndex + k;
        const y=priceToY(mac.emaF[i],minP,maxP);
        const x=18 + k*((elChart.width-36)/(win.length-1||1));
        if (!Number.isFinite(y)) continue;
        (k===0)?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.stroke();
      // emaS
      ctx.strokeStyle='#f59e0b'; ctx.lineWidth=1; ctx.beginPath();
      for (let k=0;k<win.length;k++){
        const i = startIndex + k;
        const y=priceToY(mac.emaS[i],minP,maxP);
        const x=18 + k*((elChart.width-36)/(win.length-1||1));
        if (!Number.isFinite(y)) continue;
        (k===0)?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    // Live line
    const live = lastLive?.price ?? rows[rows.length-1]?.close;
    if (Number.isFinite(live)) drawH(priceToY(live,minP,maxP), '#ffffff');
    // Entry/SL/TP lines
    if (entryPack){
      drawH(priceToY(entryPack.entry,minP,maxP), '#60a5fa');
      drawH(priceToY(entryPack.sl,minP,maxP), '#ef4444');
      drawH(priceToY(entryPack.tp1,minP,maxP), '#10b981');
      drawH(priceToY(entryPack.tp2,minP,maxP), '#10b981');
    }
  }

  function summarizeSignal(sig){
    if (!elSummaryText) return;
    elSummaryText.textContent=(sig==='شراء')?'شراء':(sig==='بيع')?'بيع':'حيادي';
    elSummaryText.style.color=(sig==='شراء')?'#10b981':(sig==='بيع')?'#ef4444':'#f59e0b';
  }

  async function run(){
    // 1) settings
    loadSettings();

    // 2) load base 5m if empty
    if (!series5.length){
      series5 = await fetchCsv(elCsvInput?.value);
    }

    // 3) compute pivots from 5m
    lastPivot = dailyPivotsNY(series5);
    updatePivotUI(lastPivot);

    // 4) aggregate TF
    const tfMin = (TF===1440)?1440:(TF===60?60:(TF===30?30:5));
    seriesTF = aggregateOHLC(series5, tfMin);

    // 5) merge live (if exists)
    if (lastLive) seriesTF = mergeLiveInto(seriesTF, tfMin, lastLive);
    if (lastLive) series5   = mergeLiveInto(series5, 5, lastLive);

    const closesTF = seriesTF.map(s=>s.close);
    const rsiArr = rsi(closesTF, RSI_PERIOD);
    const mac = macdFromCloses(closesTF, EMA_FAST, EMA_SLOW, 9);
    const atrArr = atr(seriesTF, ATR_PERIOD);
    const stoch = stochastic(seriesTF, STOCH_K, STOCH_D);
    const bb = USE_BB ? bollinger(closesTF, BB_PERIOD, BB_STD) : null;

    // Auto indicators?
    if (AUTO_IND) applyAuto(seriesTF);

    // 6) last bar signal
    const i = seriesTF.length-1;
    const ctxSig = {
      rsiVal:rsiArr[i],
      macdNow:mac.macd[i], macdPrev:mac.macd[i-1], macdSig:mac.signal[i],
      emaF:mac.emaF[i], emaS:mac.emaS[i], price:seriesTF[i].close
    };
    let sig = (inNyTradingHours(seriesTF[i].ts)) ? decideSignal(ctxSig) : 'حيادي';
    const ap = atrPct(atrArr[i], seriesTF[i].close);
    if (Number.isFinite(ap) && (ap<ATR_MIN_PCT || ap>ATR_MAX_PCT)) sig='حيادي';
    sig = applyExtraFilters(sig, seriesTF, i, stoch, bb, lastPivot);
    summarizeSignal(sig);

    // 7) indicator chips
    paintChips({
      rsi:rsiArr[i], macd:mac.macd[i], emaF:mac.emaF[i], emaS:mac.emaS[i],
      stK:stoch.K[i], stD:stoch.D[i], bbMid:bb?.mid?.[i]
    });

    // 8) chart + entry pack
    let entryPack=null;
    if (sig!=='حيادي'){
      const dir = sig==='شراء'? +1 : -1;
      const entry = seriesTF[i].close;
      const atrNow = atrArr[i]||0;
      entryPack = {
        entry, sl: entry - dir*SL_MULT*atrNow,
        tp1: entry + dir*TP1_MULT*atrNow,
        tp2: entry + dir*TP2_MULT*atrNow
      };
    }
    drawChart(seriesTF, mac, entryPack);

    // 9) live labels
    if (!lastLive){
      const last=seriesTF[seriesTF.length-1];
      if (elLivePrice) elLivePrice.textContent = fmt2(last.close);
      const tl=toLocal(last.ts);
      if (elLiveTime) elLiveTime.textContent = `${tl.date} • ${tl.time}`;
    }

    // 10) table
    paintTable(seriesTF, rsiArr, mac, stoch);

    // 11) save cache
    __cache.base5 = series5.slice();
    __cache.tf = seriesTF.slice();
    __cache.piv = lastPivot;

    // 12) optional backtest
    if (elBacktest){
      const bt = backtest(seriesTF, rsiArr, mac, atrArr, lastPivot, stoch, bb);
      elBacktest.innerHTML = `
        <div><b>Backtest (${tfMin}m)</b></div>
        <div>Trades: ${bt.trades} | Wins: ${bt.wins} | Losses: ${bt.losses} | Neutral: ${bt.neutrals}</div>
        <div>Sum(±ATR): ${fmt3(bt.pnl)}</div>
      `;
    }
  }

  /* -------------------- Events -------------------- */
  function bind(){
    [elTf5, elTf30, elTf60, elTfD].forEach(btn=>{
      if(!btn) return;
      btn.addEventListener('click', ()=>{
        [elTf5, elTf30, elTf60, elTfD].forEach(b=>b&&b.classList.remove('active'));
        btn.classList.add('active');
        TF=(btn===elTf5)?5:(btn===elTf30)?30:(btn===elTf60)?60:1440;
        run();
      });
    });

    [
      elPro, elMtf, elUseRSI, elUseMACD, elUseEMA, elUseStoch, elUseBB, elAuto,
      elEmaF, elEmaS, elRSIP, elATRP, elSL, elTP1, elTP2, elAtrMin, elAtrMax, elAcct, elRisk,
      elStochK, elStochD, elBBPeriod, elBBStd, elAlertEnable, elAlertDistance, elCsvInput,
      elToggleNyHours, elTogglePivotFilter
    ].forEach(el=>{ if(!el) return; el.addEventListener('change', run); });

    if (elRun) elRun.addEventListener('click', run);
  }

  /* -------------------- Boot -------------------- */
  window.addEventListener('load', async ()=>{
    try{
      bind();
      elTf5 && elTf5.classList.add('active');
      await run();
    }catch(e){
      console.error(e);
      alert('حدث خطأ أثناء التحليل');
    }
  });

  /* -------------------- Optional export helpers -------------------- */
  window.downloadMergedCsv = function(){
    const rows = (__cache.tf && __cache.tf.length) ? __cache.tf : seriesTF;
    if (!rows || !rows.length) return alert('لا يوجد بيانات للتصدير');
    const lines = ['Date,Time,Open,High,Low,Close'];
    for (const r of rows){
      const d = new Date(r.ts);
      const date = d.toISOString().slice(0,10);
      const time = d.toTimeString().slice(0,8);
      lines.push([date,time,fmt2(r.open),fmt2(r.high),fmt2(r.low),fmt2(r.close)].join(','));
    }
    const blob = new Blob(['\ufeff'+lines.join('\n')], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `XAUUSD_${TF}m_merged.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };

})();



/* =========================================================
   Live Worker Client (integrated)
   Connects to your Worker endpoint and feeds ticks into setLivePrice().
   Supports WS/SSE/JSON polling. Auto-starts on load.
   ========================================================= */
(function(){
  const DEFAULT_URL = 'https://gold-ticks.samer-mourtada.worker.jps'; // ← عدّل إذا لزم

  function feed(price, ts){
    if (typeof window.setLivePrice === 'function' && Number.isFinite(+price)){
      window.setLivePrice(+price, ts? +ts : Date.now());
    }
  }

  function tryWebSocket(url){
    try{
      const ws = new WebSocket(url);
      ws.onmessage = (e)=>{
        try{
          const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          const p = data?.price ?? data?.close ?? data?.last ?? data?.bid ?? data?.ask;
          const t = data?.ts ?? data?.time ?? data?.timestamp;
          feed(p, t);
        }catch(_){}
      };
      return true;
    }catch(_){ return false; }
  }

  function trySSE(url){
    try{
      const es = new EventSource(url, {withCredentials:false});
      es.onmessage = (e)=>{
        try{
          const data = JSON.parse(e.data);
          const p = data?.price ?? data?.close ?? data?.last ?? data?.bid ?? data?.ask;
          const t = data?.ts ?? data?.time ?? data?.timestamp;
          feed(p, t);
        }catch(_){}
      };
      es.onerror = ()=>{};
      return true;
    }catch(_){ return false; }
  }

  async function pollJSON(url, intervalMs){
    async function once(){
      try{
        const r = await fetch(url, {cache:'no-store'});
        if (!r.ok) throw 0;
        const ct = r.headers.get('content-type')||'';
        if (ct.includes('text/event-stream')){ trySSE(url); return; }
        const data = await r.json();
        const p = data?.price ?? data?.close ?? data?.last ?? data?.bid ?? data?.ask;
        const t = data?.ts ?? data?.time ?? data?.timestamp;
        feed(p, t);
      }catch(_){}
    }
    await once();
    return setInterval(once, intervalMs||3000);
  }

  function startLiveFeed(url){
    const U = (url||DEFAULT_URL).trim();
    if (!U) return;
    if (/^wss?:\/\//i.test(U)){ tryWebSocket(U); return; }
    if (U.endsWith('/ws')){ tryWebSocket(U.replace(/^http/,'ws')); return; }
    if (U.endsWith('/sse')){ trySSE(U); return; }
    const ok = trySSE(U);
    if (!ok){ pollJSON(U, 3000); }
  }

  // expose and auto-start
  window.startLiveFeed = startLiveFeed;
  window.addEventListener('load', ()=>{ setTimeout(()=> startLiveFeed(DEFAULT_URL), 400); });
})();
