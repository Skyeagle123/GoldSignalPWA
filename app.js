/* ======================= GoldSignals • app.js (تحسينات بدون تغيير الواجهة) ======================= */

/* ---------------- إعداد عام / ثوابت ---------------- */
const LIVE_SOURCES = [
  'https://goldprice-proxy.samer-mourtada.workers.dev/price',
  'https://api.metals.live/v1/spot/gold'
];
const DEFAULT_5M_CSV    = 'XAUUSD_5min.csv';
const LIVE_REFRESH_SEC  = 1;
const TABLE_ROWS        = 80;

// تكاليف التداول (تُطبّق في الباك-تست فقط – لا UI)
const COSTS = {
  SPREAD: 0.20,        // فرق سعر “نقطي” بالدولار
  SLIPPAGE: 0.10,      // انزلاق بالدولار
  COMMISSION: 0.00     // عمولة ثابتة بالدولار لكل صفقة (إجمالي دخول+خروج)
};

const $ = (id)=>document.getElementById(id);

/* ---------------- عناصر DOM (بدون تغيير) ---------------- */
const elCsvInput=$('csvInput'), elBtnRun=$('runBtn');
const elTf5=$('tf5'), elTf30=$('tf30'), elTf60=$('tf60'), elTfD=$('tfD');

const elLivePrice=$('livePrice'), elLiveTime=$('liveTime');
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
const elTogglePivotFilter=$('togglePivotFilter'), elToggleNyHours=$('toggleNyHours');

// عناصر Backtest (موجودة بالواجهة عندك)
const elBtCsv=$('btCsv'), elBtTf=$('btTf'), elBtStrict=$('btStrict'), elBtWalk=$('btWalk');
const elBtRun=$('btRun'), elBtStats=$('btStats'), elBtRows=$('btRows'), elBtEquity=$('btEquity');
const elBtDailyRiskCap=$('btDailyRiskCap');

/* ---------------- تنسيقات ---------------- */
const nf2=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const nf4=new Intl.NumberFormat('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
const tfLocal=new Intl.DateTimeFormat(undefined,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});

/* ---------------- حالة عامة ---------------- */
let ACTIVE_TF_MIN=5;          // 5/30/60/1440
let SERIES=[];                // OHLC
let LAST_LIVE=null;           // {price, timeMs}
let PIVOT=null;               // {p,r1,r2,r3,s1,s2,s3}
let __cache=null;             // كاش تحليل
let __alertLockUntil=0;       // قفل تنبيه
window.__livePrice = undefined;

/* ---------------- أدوات ---------------- */
function fmtTimeNY(ts){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts));
}
function nyStartOfDayMs(ts){
  // إيجاد بداية يوم نيويورك (DST-safe)
  const d = new Date(new Date(ts).toLocaleString('en-US',{timeZone:'America/New_York'}));
  d.setHours(0,0,0,0);
  // رجّعه لـ UTC ms
  const z = d.toLocaleString('en-US',{timeZone:'UTC'});
  return new Date(z).getTime();
}
const ema=(arr,period)=>{const k=2/(period+1);let out=[],e=arr[0];for(let i=0;i<arr.length;i++){e=i?(arr[i]*k+e*(1-k)):arr[i];out.push(e);}return out;};
const rsi=(closes,period=14)=>{let g=0,l=0,out=[];for(let i=1;i<closes.length;i++){const ch=closes[i]-closes[i-1];g+=Math.max(ch,0);l+=Math.max(-ch,0);
  if(i===period){const rs=g/Math.max(l,1e-9);out.push(100-100/(1+rs));}
  else if(i>period){const ch2=closes[i]-closes[i-1];g=(g*(period-1)+Math.max(ch2,0))/period;l=(l*(period-1)+Math.max(-ch2,0))/period;const rs=g/Math.max(l,1e-9);out.push(100-100/(1+rs));}}
  while(out.length<closes.length) out.unshift(50); return out;};
const macd=(closes,fast=12,slow=26,signal=9)=>{const ef=ema(closes,fast), es=ema(closes,slow); const m=ef.map((v,i)=>v-(es[i]??v));
  const sig=ema(m,signal); const hist=m.map((v,i)=>v-(sig[i]??0)); return {mac:m,sig,hist,emaF:ef,emaS:es};};
const stoch=(h,l,c,k=14,d=3)=>{let kk=[];for(let i=0;i<c.length;i++){const from=Math.max(0,i-k+1);const hh=Math.max(...h.slice(from,i+1));const ll=Math.min(...l.slice(from,i+1));const v=(hh===ll)?50:((c[i]-ll)/(hh-ll))*100;kk.push(v);}const dd=ema(kk,d);return {k:kk,d:dd};};
const boll=(c,p=20,s=2)=>{let mid=ema(c,p), up=[], dn=[]; for(let i=0;i<c.length;i++){const from=Math.max(0,i-p+1);const seg=c.slice(from,i+1);
  const m=seg.reduce((a,b)=>a+b,0)/seg.length; const sd=Math.sqrt(seg.reduce((a,b)=>a+(b-m)*(b-m),0)/seg.length); up.push(m+s*sd); dn.push(m-s*sd);} return {mid,up,dn};};
const atr=(h,l,c,p=14)=>{let tr=[h[0]-l[0]]; for(let i=1;i<c.length;i++){ tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])));} return ema(tr,p); };

/* ---------------- قراءة CSV ---------------- */
async function loadCsvText(url){
  const full=(url&&url.trim())?url.trim():DEFAULT_5M_CSV;
  const res = await fetch(full,{cache:'no-store'});
  if(!res.ok) throw new Error('CSV HTTP '+res.status);
  return await res.text();
}
function parseCSV(txt){
  const rows = txt.trim().split(/\r?\n/).map(r=>r.split(',').map(x=>x.trim()));
  if(!rows.length) return [];
  const head=rows[0].map(x=>x.toLowerCase());
  const hasHeader = head.some(x=>/date|time|open|close|symbol/.test(x));
  if(hasHeader) rows.shift();
  const out=[];
  for(const r of rows){
    if(r.length>=7){
      const ts = Date.parse(`${r[1]}T${r[2]}:00Z`);
      const o=+r[3], h=+r[4], l=+r[5], c=+r[6];
      if(Number.isFinite(ts)&&Number.isFinite(c)) out.push({t:ts,o:Number.isFinite(o)?o:c,h:Number.isFinite(h)?h:c,l:Number.isFinite(l)?l:c,c});
    }else if(r.length>=2){
      const ts = Date.parse(r[0]); const p=+r[1];
      if(Number.isFinite(ts)&&Number.isFinite(p)) out.push({t:ts,o:p,h:p,l:p,c:p});
    }
  }
  out.sort((a,b)=>a.t-b.t);
  return out;
}
function aggregateOHLC(rows, minutes){
  const ms=minutes*60*1000, map=new Map();
  for(const b of rows){
    const bucket=Math.floor(b.t/ms)*ms;
    let rec=map.get(bucket);
    if(!rec){ map.set(bucket,{t:bucket,o:b.o,h:b.h,l:b.l,c:b.c}); }
    else { rec.h=Math.max(rec.h,b.h); rec.l=Math.min(rec.l,b.l); rec.c=b.c; }
  }
  return [...map.values()].sort((a,b)=>a.t-b.t);
}
function dailyNYFrom5m(rows5){
  const map=new Map();
  for(const b of rows5){
    const key = fmtTimeNY(b.t);
    let rec = map.get(key);
    if(!rec){ map.set(key,{key,t:b.t,o:b.o,h:b.h,l:b.l,c:b.c}); }
    else{ rec.h=Math.max(rec.h,b.h); rec.l=Math.min(rec.l,b.l); rec.c=b.c; }
  }
  return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
}

/* ---------------- Pivot نيويورك (DST-safe) ---------------- */
function calcPivotNY(series5m){
  if(!series5m.length) return null;
  // نأخذ اليوم السابق المكتمل على أساس نيويورك
  const last = series5m.at(-1).t;
  const todayStartNY = nyStartOfDayMs(last);
  const prevStartNY = todayStartNY - 24*60*60*1000;
  const prevEndNY   = todayStartNY - 1;
  const seg = series5m.filter(b=>b.t>=prevStartNY && b.t<=prevEndNY);
  if(!seg.length) return null;
  const H=Math.max(...seg.map(x=>x.h)), L=Math.min(...seg.map(x=>x.l)), C=seg.at(-1).c;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {p:P,r1:R1,r2:R2,r3:R3,s1:S1,s2:S2,s3:S3};
}

/* ---------------- دمج السعر الحي (بدون تعديل CSV) ---------------- */
function mergeLiveIntoSeries(base, tfMin, live){
  if(!base?.length || !live) return base;
  const out = base.slice();
  const tfMs = tfMin*60*1000;
  const liveBucket = Math.floor(live.timeMs/tfMs)*tfMs;
  const last = out.at(-1);
  const lastBucket = Math.floor(last.t/tfMs)*tfMs;
  if(liveBucket===lastBucket){
    last.c = live.price;
    last.h = Math.max(last.h, live.price);
    last.l = Math.min(last.l, live.price);
  }else if(liveBucket>lastBucket){
    out.push({t:liveBucket,o:last.c,h:live.price,l:live.price,c:live.price, live:true});
  }
  return out;
}

/* ---------------- الرسم (بدون تغيير الواجهة) ---------------- */
const chartCanvas = document.getElementById('tradeChart') || document.getElementById('chart');
function makeHiDPICanvas(c){const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,3)); const r=c.getBoundingClientRect();
  c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr); const ctx=c.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return ctx;}
let __raf=0;
function drawChart(series,{livePrice,emaF,emaS,bb}={}){
  const c=chartCanvas; if(!c||!series?.length) return;
  cancelAnimationFrame(__raf); __raf=requestAnimationFrame(()=>{
    const ctx=makeHiDPICanvas(c), W=c.clientWidth, H=c.clientHeight;
    ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,W,H);
    const view=series.slice(-150);
    let lo=Math.min(...view.map(b=>b.l)), hi=Math.max(...view.map(b=>b.h));
    const add=(v)=>{ if(Number.isFinite(v)){ lo=Math.min(lo,v); hi=Math.max(hi,v);} };
    add(livePrice);
    if(hi===lo){ lo-=1; hi+=1; }
    const pad=36, x0=pad, x1=W-pad, y0=16, y1=H-24, pw=x1-x0, ph=y1-y0;
    const xs=(i)=>x0+(i/Math.max(view.length-1,1))*pw;
    const ys=(v)=>y1-((v-lo)/(hi-lo))*ph;

    // grid
    ctx.strokeStyle='#22314a'; ctx.lineWidth=1;
    for(let g=0;g<=4;g++){ const y=ys(lo+(g/4)*(hi-lo)); ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); }

    // close line كسريع
    ctx.strokeStyle='#34d399'; ctx.lineWidth=2; ctx.beginPath();
    view.forEach((b,i)=>{const x=xs(i), y=ys(b.c); i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.stroke();

    // EMA
    if(emaF){ ctx.strokeStyle='#4fc3f7'; ctx.beginPath(); emaF.slice(-view.length).forEach((v,i)=>{const x=xs(i), y=ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.stroke(); }
    if(emaS){ ctx.strokeStyle='#a78bfa'; ctx.beginPath(); emaS.slice(-view.length).forEach((v,i)=>{const x=xs(i), y=ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.stroke(); }

    // Bollinger
    if(bb){ ctx.setLineDash([4,4]); ctx.strokeStyle='#94a3b8';
      ctx.beginPath(); bb.up.slice(-view.length).forEach((v,i)=>{const x=xs(i),y=ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.stroke();
      ctx.beginPath(); bb.dn.slice(-view.length).forEach((v,i)=>{const x=xs(i),y=ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.stroke();
      ctx.setLineDash([]); }

    // live dashed white
    if(Number.isFinite(livePrice)){
      ctx.setLineDash([8,6]); ctx.strokeStyle='#ffffff'; ctx.lineWidth=2;
      const y=ys(livePrice); ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); ctx.setLineDash([]);
      // label
      ctx.fillStyle='#0b1220'; ctx.strokeStyle='#67e8f9'; ctx.lineWidth=1.5; ctx.font='13px system-ui';
      const txt='Live: '+nf2.format(livePrice), w=ctx.measureText(txt).width+16, h=20;
      ctx.fillRect(x0+8,y-14,w,h); ctx.strokeRect(x0+8,y-14,w,h);
      ctx.fillStyle='#cfe8ff'; ctx.fillText(txt,x0+16,y+2);
    }
  });
}

/* ---------------- عرض القيم ---------------- */
function paintIndicators(vals){
  if(elIndRSI)   elIndRSI.textContent = Number.isFinite(vals.rsi?.at(-1))? nf2.format(vals.rsi.at(-1)) : '—';
  if(elIndMACD)  elIndMACD.textContent= Number.isFinite(vals.macd?.mac?.at?.(-1))? nf4.format(vals.macd.mac.at(-1)) : '—';
  if(elIndEMAF)  elIndEMAF.textContent= Number.isFinite(vals.emaF?.at?.(-1))? nf2.format(vals.emaF.at(-1)) : '—';
  if(elIndEMAS)  elIndEMAS.textContent= Number.isFinite(vals.emaS?.at?.(-1))? nf2.format(vals.emaS.at(-1)) : '—';
  if(elIndStoch) elIndStoch.textContent= (Number.isFinite(vals.stoch?.k?.at?.(-1))||Number.isFinite(vals.stoch?.d?.at?.(-1)))
      ? `${Number.isFinite(vals.stoch.k.at(-1))?nf2.format(vals.stoch.k.at(-1)):'—'} / ${Number.isFinite(vals.stoch.d.at(-1))?nf2.format(vals.stoch.d.at(-1)):'—'}`
      : '—';
  if(elIndBB)    elIndBB.textContent   = (vals.bb)
      ? `${nf2.format(vals.bb.up.at(-1))} / ${nf2.format(vals.bb.dn.at(-1))}` : '—';
}
function paintSummary(s){ if(!elSummaryText) return; elSummaryText.innerHTML = s.html; if(elAdviceText) elAdviceText.innerHTML = s.advice; }
function paintTable(rows){
  if(!elRowsBody) return;
  elRowsBody.innerHTML='';
  rows.slice(-TABLE_ROWS).forEach((r,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${i+1}</td><td>${tfLocal.format(r.t)}</td><td>${r.side||'-'}</td>
      <td>${r.entry?nf2.format(r.entry):'-'}</td><td>${r.exit?nf2.format(r.exit):'-'}</td>
      <td class="r">${r.R??'-'}</td><td class="${(r.pnl||0)>=0?'good':'bad'}">${r.pnl?nf2.format(r.pnl):'-'}</td>`;
    elRowsBody.appendChild(tr);
  });
}

/* ---------------- منطق الإشارة ---------------- */
function buildAdvice({emaF,emaS,rsiV,macV,atrV,lastC,atrMin,atrMax}){
  let side='محايد', reason=[];
  if(emaF>emaS && rsiV>50 && macV>0) side='شراء';
  if(emaF<emaS && rsiV<50 && macV<0) side='بيع';
  if(elTogglePivotFilter?.checked && PIVOT){
    if(side==='شراء' && lastC>PIVOT.p) reason.push('فوق Pivot');
    if(side==='بيع'   && lastC<PIVOT.p) reason.push('تحت Pivot');
  }
  const atrPct=(atrV/Math.max(lastC,1e-9))*100;
  if(Number.isFinite(atrPct) && (atrPct<atrMin || atrPct>atrMax)){ side='(مرفوض بالفلاتر)'; reason.push(`ATR% ${nf2.format(atrPct)} خارج النطاق`); }
  const text = side==='(مرفوض بالفلاتر)'? 'لا توجد إشارة (مرفوض بالفلاتر).' : `الملخص: <b>${side}</b>`;
  const html = text + (reason.length? ` • <span class="mini">${reason.join(' • ')}</span>`:'');
  const advice = `الإطار: ${ACTIVE_TF_MIN===1440?'يوم':ACTIVE_TF_MIN+' دقائق'} • ${text}`;
  if(side==='(مرفوض بالفلاتر)'){ console.info('[FILTER-REJECT]', {atrPct, atrMin, atrMax, reason}); }
  return {html, advice, side};
}

/* ---------------- تحليل فني + رسم ---------------- */
function reprojectWithLive(){
  if(!SERIES.length) return;
  const EMA_FAST=parseInt(elEmaFast?.value||'12',10);
  const EMA_SLOW=parseInt(elEmaSlow?.value||'26',10);
  const RSI_PER =parseInt(elRsiPeriod?.value||'14',10);
  const ATR_P   =parseInt(elAtrPeriod?.value||'14',10);
  const SLm =parseFloat(elSlMult?.value||'1.5'), TP1m=parseFloat(elTp1Mult?.value||'1.0'), TP2m=parseFloat(elTp2Mult?.value||'2.0');
  const atrMin=parseFloat(elAtrMinPct?.value||'0.05')*100, atrMax=parseFloat(elAtrMaxPct?.value||'0.80')*100;
  const useSt=!!elUseStoch?.checked, kPer=parseInt(elStochK?.value||'14',10), dPer=parseInt(elStochD?.value||'3',10);
  const useBB=!!elUseBB?.checked, bbPer=parseInt(elBBPeriod?.value||'20',10), bbStd=parseFloat(elBBStd?.value||'2',10);

  // اختيار السلسلة حسب TF
  const base = (ACTIVE_TF_MIN===30)? aggregateOHLC(SERIES,30) :
               (ACTIVE_TF_MIN===60)? aggregateOHLC(SERIES,60) :
               (ACTIVE_TF_MIN===1440)? dailyNYFrom5m(SERIES).map(d=>({t:nyStartOfDayMs(d.t),o:d.o,h:d.h,l:d.l,c:d.c})) :
               SERIES;

  const merged = mergeLiveIntoSeries(base, ACTIVE_TF_MIN, LAST_LIVE);

  const closes=merged.map(b=>b.c), highs=merged.map(b=>b.h), lows=merged.map(b=>b.l);
  const emaF=ema(closes,EMA_FAST), emaS=ema(closes,EMA_SLOW);
  const rsiArr=rsi(closes,RSI_PER);
  const mac = macd(closes,EMA_FAST,EMA_SLOW,9);
  const st  = useSt? stoch(highs,lows,closes,kPer,dPer) : {k:closes.map(()=>50), d:closes.map(()=>50)};
  const bb  = useBB? boll(closes,bbPer,bbStd) : null;
  const atrArr = atr(highs,lows,closes,ATR_P);
  const last = merged.at(-1), lastATR = atrArr.at(-1);

  const summ = buildAdvice({
    emaF:emaF.at(-1), emaS:emaS.at(-1), rsiV:rsiArr.at(-1), macV:mac.mac.at(-1),
    atrV:lastATR, lastC:last.c, atrMin, atrMax
  });
  paintSummary(summ);
  paintIndicators({emaF,emaS,macd:mac,stoch:st,bb:bb||{up:[],dn:[]},rsi:rsiArr});

  drawChart(merged,{livePrice:LAST_LIVE?.price,emaF,emaS,bb});

  // جدول بسيط
  const SL = last.c - SLm*lastATR;
  const TP1= last.c + (summ.side==='شراء'?+TP1m:-TP1m)*lastATR;
  paintTable([{t:last.t, side:summ.side, entry:last.c, exit:TP1, R:((TP1-last.c)/Math.max(last.c-lastATR,1e-9)).toFixed(2), pnl:(TP1-last.c)}]);

  __cache = {EMA_FAST,EMA_SLOW,RSI_PER,ATR_P,SLm,TP1m,TP2m,atrMin,atrMax,useSt,kPer,dPer,useBB,bbPer,bbStd,base};
}

/* ---------------- تشغيل التحليل الكامل ---------------- */
async function runAnalysis(){
  try{
    const csvURL = (elCsvInput?.value?.trim()) || DEFAULT_5M_CSV;
    const txt = await loadCsvText(csvURL);
    SERIES = parseCSV(txt);

    // Pivot نيويورك من 5m مباشرة (أدقّ)
    PIVOT = calcPivotNY(SERIES) || null;
    if(PIVOT){
      elPivotP.textContent=nf2.format(PIVOT.p);
      elR1.textContent=nf2.format(PIVOT.r1); elR2.textContent=nf2.format(PIVOT.r2); elR3.textContent=nf2.format(PIVOT.r3);
      elS1.textContent=nf2.format(PIVOT.s1); elS2.textContent=nf2.format(PIVOT.s2); elS3.textContent=nf2.format(PIVOT.s3);
    }else{
      console.warn('Pivot NY غير متاح لعدم كفاية البيانات.');
    }

    reprojectWithLive();
  }catch(e){
    alert('تعذّر تحميل/تحليل البيانات: '+e.message);
    console.error(e);
  }
}

/* ---------------- السعر الحي (Median + Outliers) ---------------- */
async function fetchLivePrice(){
  const TIMEOUT_MS=2500;
  async function hit(url){
    const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(),TIMEOUT_MS);
    try{
      const r=await fetch(url,{cache:'no-store',signal:ctl.signal});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const ct=(r.headers.get('content-type')||'').toLowerCase();
      if(ct.includes('json')){
        const j=await r.json();
        if(Array.isArray(j)&&Number.isFinite(j[0])) return +j[0];
        if(j && Number.isFinite(j.price)) return +j.price;
      }
      throw new Error('Bad JSON');
    }finally{ clearTimeout(to); }
  }
  const vals = (await Promise.allSettled(LIVE_SOURCES.map(hit)))
    .filter(x=>x.status==='fulfilled')
    .map(x=>x.value)
    .filter(Number.isFinite);
  if(!vals.length) throw new Error('لا يوجد مزوّد سعر حي متاح الآن');
  const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
  const clean = vals.filter(v=>Math.abs(v-avg)/avg<0.01);
  const arr = clean.length?clean:vals;
  arr.sort((a,b)=>a-b);
  return arr[Math.floor(arr.length/2)];
}
function paintLive(price,ts){
  if(elLivePrice) elLivePrice.textContent = nf2.format(price);
  if(elLiveTime)  elLiveTime.textContent  = new Date(ts).toLocaleTimeString();
}
async function refreshLive(){
  try{
    const price = await fetchLivePrice();
    const t = Date.now();
    // فلترة القفزات المفاجئة
    if(Number.isFinite(window.__livePrice)){
      const pct = Math.abs(price-window.__livePrice)/Math.max(window.__livePrice,1e-9);
      if(pct>0.007){ console.warn('Spike filtered:',pct); return; }
    }
    window.__livePrice=price; window.__liveTimeMs=t; LAST_LIVE={price,timeMs:t};
    paintLive(price,t);
    reprojectWithLive();
    // تنبيه اقتراب
    const th = Math.max(0, parseFloat(elAlertDist?.value||'0.5'));
    const lastEntry = SERIES.at(-1)?.c ?? price;
    if(elAlertEnable?.checked && Math.abs(price-lastEntry)<=th && Date.now()>__alertLockUntil){
      __alertLockUntil = Date.now()+15000;
      try{ new Notification('تنبيه الدخول',{body:`Live ${nf2.format(price)} قريب من ${nf2.format(lastEntry)}`}); }catch{}
    }
  }catch(e){ console.warn('Live error:',e); }
}

/* ---------------- Backtest (مع تكاليف وفصل زمني) ---------------- */
function makeHiDPICanvas(c){const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,3)), r=c.getBoundingClientRect(); c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr); const ctx=c.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return ctx;}
function drawEquity(canvas, eq){
  if(!canvas||!eq?.length) return; const ctx=makeHiDPICanvas(canvas), W=canvas.clientWidth, H=canvas.clientHeight;
  ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,W,H);
  const min=Math.min(...eq), max=Math.max(...eq), x0=32,x1=W-8,y0=10,y1=H-18, w=x1-x0,h=y1-y0;
  const xAt=i=>x0+(i/(eq.length-1))*w, yAt=v=>y1-((v-min)/(max-min||1))*h;
  ctx.strokeStyle='#334155'; ctx.lineWidth=1; for(let g=0;g<=4;g++){const y=yAt(min+(g/4)*(max-min||1)); ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();}
  ctx.strokeStyle='#10b981'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(xAt(0),yAt(eq[0])); for(let i=1;i<eq.length;i++) ctx.lineTo(xAt(i),yAt(eq[i])); ctx.stroke();
}
function summarizeTrades(trades){
  const n=trades.length||1;
  const wins=trades.filter(t=>t.R>0), losses=trades.filter(t=>t.R<=0);
  const winRate = wins.length/n*100;
  const avgR = trades.reduce((a,b)=>a+b.R,0)/n;
  const pf = (wins.reduce((a,b)=>a+b.R,0) / Math.max(1e-9, -losses.reduce((a,b)=>a+Math.min(0,b.R),0)));
  let peak=0, dd=0, eq=0; for(const t of trades){ eq+=t.pl; peak=Math.max(peak,eq); dd=Math.max(dd,peak-eq); }
  const pnl = trades.reduce((a,b)=>a+b.pl,0);
  const meanR=avgR, sdR=Math.sqrt((trades.reduce((a,b)=>a+(b.R-meanR)*(b.R-meanR),0)/n)||1e-9), sharpe=(meanR/sdR)*Math.sqrt(252);
  return {n, winRate, avgR, pf, dd, pnl, sharpe};
}
function simulateTrades(series, tf, strict, dailyRiskCapPct){
  // ممنوع استعمال آخر شمعة “قيد التشكل” لاتخاذ القرار (منع look-ahead)
  const rsiArr=rsi(series.map(s=>s.c), parseInt(elRsiPeriod?.value||'14',10));
  const mac=macd(series.map(s=>s.c), parseInt(elEmaFast?.value||'12',10), parseInt(elEmaSlow?.value||'26',10), 9);
  const atrArr=atr(series.map(s=>s.h), series.map(s=>s.l), series.map(s=>s.c), parseInt(elAtrPeriod?.value||'14',10)); // تنسيق مختلف، نستخدم أدناه نسخة closes
  // نعتمد نسخة ATR على OHLC فعلي:
  const atrOHLC = (function(){
    const h=series.map(s=>s.h), l=series.map(s=>s.l), c=series.map(s=>s.c);
    return atr(h,l,c, parseInt(elAtrPeriod?.value||'14',10));
  })();

  const trades=[], equity=[0]; let eqNow=0;
  let usedRiskToday=0, curNYDay=null;

  const ACCT_SIZE = parseFloat(elAcctSize?.value||'10000');
  const RISK_PCT  = parseFloat(elRiskPct?.value||'1.0');
  const SLmult = parseFloat(elSlMult?.value||'1.5');
  const TP1mult= parseFloat(elTp1Mult?.value||'1.0');
  const TP2mult= parseFloat(elTp2Mult?.value||'2.0');
  const ATR_MIN = parseFloat(elAtrMinPct?.value||'0.05')*100;
  const ATR_MAX = parseFloat(elAtrMaxPct?.value||'0.80')*100;

  for(let i=Math.max(30, rsiArr.findIndex(v=>v!=null)+1); i<series.length-1; i++){ // -1: لا ننظر لشمعة المستقبل
    const price=series[i].c, emaFv=mac.emaF[i], emaSv=mac.emaS[i], rsiV=rsiArr[i], macNow=mac.mac[i], macPrev=mac.mac[i-1], macSig=mac.sig[i];
    if([price,emaFv,emaSv,rsiV,macNow].some(v=>!Number.isFinite(v))) { equity.push(eqNow); continue; }

    let side='محايد';
    if(emaFv>emaSv && rsiV>50 && macNow>0) side='شراء';
    if(emaFv<emaSv && rsiV<50 && macNow<0) side='بيع';

    // فلاتر بسيطة (ATR% و Pivot التقريبي منعاً للالتصاق)
    const aNow=atrOHLC[i], atrPct=(aNow/Math.max(price,1e-9))*100;
    if(!Number.isFinite(aNow) || atrPct<ATR_MIN || atrPct>ATR_MAX) side='محايد';

    if(side==='محايد'){ equity.push(eqNow); continue; }

    // حدود المخاطرة اليومية
    const risk = ACCT_SIZE*(RISK_PCT/100);
    const dayKey = fmtTimeNY(series[i].t);
    if(curNYDay!==dayKey){ curNYDay=dayKey; usedRiskToday=0; }
    if( (usedRiskToday + (risk/ACCT_SIZE*100)) > (parseFloat(elBtDailyRiskCap?.value||'3')) ){ equity.push(eqNow); continue; }
    usedRiskToday += (risk/ACCT_SIZE*100);

    // خطوط (مع تكاليف دخول)
    const entryRaw = (side==='شراء')? Math.max(price,emaSv) : Math.min(price,emaSv);
    const entry = entryRaw + (side==='شراء' ? +COSTS.SPREAD/2 + COSTS.SLIPPAGE : -COSTS.SPREAD/2 - COSTS.SLIPPAGE);
    const SL  = (side==='شراء')? entry - SLmult*aNow : entry + SLmult*aNow;
    const TP1 = (side==='شراء')? entry + TP1mult*aNow : entry - TP1mult*aNow;
    const TP2 = (side==='شراء')? entry + TP2mult*aNow : entry - TP2mult*aNow;

    let exit=entry, R=0, pl=0, hit1=false;
    const maxBars=(tf===1440)?20:60;

    for(let j=i+1;j<Math.min(series.length,i+1+maxBars);j++){
      const h=series[j].h, l=series[j].l;
      if(side==='شراء'){
        if(!hit1 && h>=TP1){ hit1=true; R += (TP1mult/SLmult)/2; }
        if(h>=TP2){ R += (TP2mult/SLmult)/2; exit=TP2; break; }
        if(l<=SL){ R -= 1; exit=SL; break; }
      }else{
        if(!hit1 && l<=TP1){ hit1=true; R += (TP1mult/SLmult)/2; }
        if(l<=TP2){ R += (TP2mult/SLmult)/2; exit=TP2; break; }
        if(h>=SL){ R -= 1; exit=SL; break; }
      }
      exit=series[j].c;
    }

    // عمولة عند الخروج
    pl = R*risk - COSTS.COMMISSION;
    eqNow += pl; equity.push(eqNow);
    trades.push({ts:series[i].t, side, entry, exit, R, pl});
  }

  return {trades, equity};
}
async function runBacktest(){
  try{
    const tf = parseInt(elBtTf?.value||'5',10);
    let text;
    if (elBtCsv?.files?.length) {
      text = await elBtCsv.files[0].text();
    } else {
      const top = elCsvInput?.value?.trim();
      const r = await fetch((top||DEFAULT_5M_CSV)+'?t='+Date.now(), {cache:'no-store'});
      if(!r.ok) throw new Error('تعذّر تحميل CSV');
      text = await r.text();
    }
    const rows5 = parseCSV(text);
    if(!rows5.length) throw new Error('CSV فارغ');
    const series = (tf===30)?aggregateOHLC(rows5,30):(tf===60)?aggregateOHLC(rows5,60):(tf===1440)?dailyNYFrom5m(rows5).map(d=>({t:nyStartOfDayMs(d.t),o:d.o,h:d.h,l:d.l,c:d.c})):rows5;
    const sim = simulateTrades(series, tf, !!elBtStrict?.checked, parseFloat(elBtDailyRiskCap?.value||'3'));
    const stats = summarizeTrades(sim.trades);

    if(elBtStats){
      elBtStats.innerHTML = `الصفقات: <b>${stats.n}</b> • Win%: <b>${nf2.format(stats.winRate)}</b> • PF: <b>${nf2.format(stats.pf)}</b> • `
        + `Expectancy(R): <b>${nf2.format(stats.avgR)}</b> • MaxDD$: <b>${nf2.format(stats.dd)}</b> • PnL$: <b>${nf2.format(stats.pnl)}</b> • `
        + `Sharpe≈ <b>${nf2.format(stats.sharpe)}</b>`;
    }
    if(elBtRows){
      elBtRows.innerHTML='';
      sim.trades.slice(-20).reverse().forEach((t,idx)=>{
        const tr=document.createElement('tr');
        tr.innerHTML = `<td>${idx+1}</td><td>${tfLocal.format(t.ts)}</td><td>${t.side}</td><td>${nf2.format(t.entry)}</td><td>${nf2.format(t.exit)}</td><td>${nf2.format(t.R)}</td><td>${nf2.format(t.pl)}</td>`;
        elBtRows.appendChild(tr);
      });
    }
    drawEquity(elBtEquity, sim.equity);
  }catch(e){ alert(`Backtest فشل: ${e.message||e}`); console.error(e); }
}

/* ---------------- أحداث UI (بدون أي تغيير بصري) ---------------- */
function setActiveTF(min){ ACTIVE_TF_MIN=min; [elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));
  if(min===5) elTf5?.classList?.add('active'); if(min===30) elTf30?.classList?.add('active'); if(min===60) elTf60?.classList?.add('active'); if(min===1440) elTfD?.classList?.add('active'); }

elBtnRun?.addEventListener('click', runAnalysis);
elTf5?.addEventListener('click', ()=>{setActiveTF(5);runAnalysis();});
elTf30?.addEventListener('click',()=>{setActiveTF(30);runAnalysis();});
elTf60?.addEventListener('click',()=>{setActiveTF(60);runAnalysis();});
elTfD?.addEventListener('click', ()=>{setActiveTF(1440);runAnalysis();});

// تخزين رابط CSV محلياً
const LS_KEY='gs_csv_url';
if(elCsvInput){
  const saved=localStorage.getItem(LS_KEY)||'';
  if(!elCsvInput.value && saved) elCsvInput.value=saved;
  elCsvInput.addEventListener('input',()=>{ const v=elCsvInput.value.trim(); if(v) localStorage.setItem(LS_KEY,v); else localStorage.removeItem(LS_KEY); });
}

/* ---------------- تشغيل أولي ---------------- */
setActiveTF(5);
runAnalysis();
refreshLive();
setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
