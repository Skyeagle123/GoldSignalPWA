/* ======================= GoldSignals • app.js (PRO+ Live Merge) ======================= */
/* خيار 1: دمج السعر الحي داخل الشمعة الجارية + الإشارة الرسمية على إغلاق الشمعة فقط  */

/* --------- إعداد عام --------- */
const LIVE_SOURCES = [
  'https://goldprice-proxy.samer-mourtada.workers.dev/price',
  'https://api.metals.live/v1/spot/gold',
];

const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const LIVE_REFRESH_SEC = 2;   // كل كم ثانية نجيب السعر الحي
const TABLE_ROWS       = 80;

const $=(id)=>document.getElementById(id);

/* عناصر DOM (نفس الأسماء الموجودة بملفك) */
const elCsvInput=$('csvInput'), elBtnRun=$('runBtn');

const elTf5=$('tf5'), elTf30=$('tf30'), elTf60=$('tf60'), elTfD=$('tfD');
const elProMode=$('proMode'), elMtfConfirm=$('mtfConfirm');

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
const elToggleNyHours=$('toggleNyHours'), elTogglePivotFilter=$('togglePivotFilter');

/* Backtest */
const elBtCsv=$('btCsv'), elBtTf=$('btTf'), elBtStrict=$('btStrict'), elBtWalk=$('btWalk');
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

let currentTF=5, LAST_LIVE=null, __cache=null, __alertLockUntil=0, __liveTimer=null;

/* أدوات عامة */
function tfLabel(tf){return tf===5?'5 دقائق':tf===30?'30 دقيقة':tf===60?'ساعة':tf===1440?'يوم (NY)':tf+'m';}
function setActiveTF(tf){
  currentTF=tf;
  [elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));
  if(tf===5) elTf5?.classList?.add('active');
  else if(tf===30) elTf30?.classList?.add('active');
  else if(tf===60) elTf60?.classList?.add('active');
  else if(tf===1440) elTfD?.classList?.add('active');
}

/* ===================== CSV Parser (مرن) ===================== */
function parseCsv(text){
  const raw=text.replace(/\r/g,'').trim();
  if(!raw) return [];
  const headerLine=raw.split('\n')[0];
  const delim = headerLine.includes(';') ? ';' : ',';
  const lines=raw.split('\n').filter(Boolean);
  const heads=lines[0].split(delim).map(h=>h.trim());
  const idx={}; const norm=s=>s.toLowerCase().replace(/\s+/g,'').replace('datetime','date');
  heads.forEach((h,i)=>idx[norm(h)]=i);

  const hasOHLC = idx.open!=null && idx.high!=null && idx.low!=null && idx.close!=null;
  const hasDate = idx.date!=null;
  const hasTime = idx.time!=null || heads.some(h=>/time/i.test(h));
  const hasCloseOnly = hasDate && idx.close!=null && !hasOHLC;

  const out=[];
  for(let i=1;i<lines.length;i++){
    const cols=lines[i].split(delim);
    if(cols.length<2) continue;
    let dstr="";
    if(hasTime && idx.time!=null) dstr=`${cols[idx.date]}T${cols[idx.time]}`;
    else dstr=cols[idx.date];
    dstr=dstr.replace(' ','T');
    const t=new Date(dstr);
    if(isNaN(t)) continue;

    if(hasOHLC){
      out.push({t, open:+cols[idx.open], high:+cols[idx.high], low:+cols[idx.low], close:+cols[idx.close]});
    }else if(hasCloseOnly){
      const c=+cols[idx.close];
      out.push({t, open:c, high:c, low:c, close:c});
    }
  }
  out.sort((a,b)=>a.t-b.t);
  return out;
}

/* ===================== تجميع أطر زمنية ===================== */
function aggregateOHLC(rows, tfMin){
  const step=tfMin*60*1000, out=[]; let bkt=null;
  for(const b of rows){
    const t=Math.floor(b.t.getTime()/step)*step;
    if(!bkt || bkt.t!==t){
      bkt={t, open:b.open, high:b.high, low:b.low, close:b.close};
      out.push(bkt);
    }else{
      bkt.high=Math.max(bkt.high,b.high);
      bkt.low =Math.min(bkt.low ,b.low);
      bkt.close=b.close;
    }
  }
  return out;
}

function nyKey(date){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

function aggregateDailyNY(rows){
  const map=new Map();
  for(const b of rows){
    const k=nyKey(b.t);
    const cur=map.get(k);
    if(!cur) map.set(k, {t:k, open:b.open, high:b.high, low:b.low, close:b.close});
    else{
      cur.high=Math.max(cur.high,b.high);
      cur.low=Math.min(cur.low,b.low);
      cur.close=b.close;
    }
  }
  // رجّعها كصفوف يومية بترتيب التاريخ
  const arr=[...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>v);
  // حط t كـ Date لأغراض الرسم إن لزم
  arr.forEach(d=>d.t=new Date(d.t+'T00:00:00'));
  return arr;
}

/* ===================== Pivots (يوم نيويورك – اليوم السابق) ===================== */
function calcPivotsFromDailyNY(days){
  if(!days || days.length<2) return null;
  const prev=days[days.length-2]; // اليوم السابق
  if(!prev) return null;
  const H=prev.high, L=prev.low, C=prev.close;
  const P=(H+L+C)/3;
  return {
    day: nyKey(prev.t),
    P, R1: 2*P - L, S1: 2*P - H,
    R2: P + (H-L), S2: P - (H-L),
    R3: H + 2*(P-L), S3: L - 2*(H-P),
  };
}

/* ===================== مؤشرات ===================== */
function ema(arr, p, src=(b)=>b.close){
  const k=2/(p+1), out=[]; let e;
  for(let i=0;i<arr.length;i++){const v=src(arr[i]); e=(e==null)?v:(v*k + e*(1-k)); out.push(e);}
  return out;
}
function rsi(arr, p=14){
  const out=[]; let avgU=0, avgD=0;
  for(let i=0;i<arr.length;i++){
    if(i===0){ out.push(50); continue; }
    const ch=arr[i].close - arr[i-1].close;
    const u=Math.max(ch,0), d=Math.max(-ch,0);
    if(i<=p){ avgU=(avgU*(i-1)+u)/i; avgD=(avgD*(i-1)+d)/i; }
    else    { avgU=(avgU*(p-1)+u)/p; avgD=(avgD*(p-1)+d)/p; }
    const rs = avgD===0? 100 : (avgU/avgD);
    out.push(100 - (100/(1+rs)));
  }
  return out;
}
function atr(arr, p=14){
  const out=[]; let prevClose=arr[0]?.close??0, e, k=2/(p+1);
  for(let i=0;i<arr.length;i++){
    const hi=arr[i].high??arr[i].close, lo=arr[i].low??arr[i].close;
    const tr=Math.max(hi-lo, Math.abs(hi-prevClose), Math.abs(lo-prevClose));
    prevClose=arr[i].close;
    e=(e==null)?tr:(tr*k + e*(1-k)); out.push(e);
  }
  return out;
}
function macd(arr, f=12, s=26, sig=9){
  const F=ema(arr,f), S=ema(arr,s);
  const M = F.map((x,i)=>x - S[i]);
  const Sig = ema(M.map(v=>({close:v})), sig, x=>x.close);
  const Hist = M.map((v,i)=>v - Sig[i]);
  return {macdLine:M, signal:Sig, hist:Hist};
}

/* ===================== تحميل CSV ===================== */
async function loadCsvText(){
  // أولوية: رابط من الحقل، وإلا الملف الافتراضي من نفس المجلد
  const url = elCsvInput?.value?.trim();
  if(url){
    const r=await fetch(url, {cache:'no-store'});
    if(!r.ok) throw new Error('تعذّر تحميل CSV من الرابط');
    return await r.text();
  }else{
    const r=await fetch(DEFAULT_5M_CSV + '?t=' + Date.now(), {cache:'no-store'});
    if(!r.ok) throw new Error('تعذّر تحميل CSV الافتراضي من الريبو');
    return await r.text();
  }
}

/* ===================== Live Price ===================== */
async function fetchLivePrice(){
  for(const url of LIVE_SOURCES){
    try{
      const r=await fetch(url,{cache:'no-store',mode:'cors'});
      if(!r.ok) continue;
      const ct=(r.headers.get('content-type')||'').toLowerCase();
      let price=null;
      if(ct.includes('json')){
        const j=await r.json();
        if(Array.isArray(j) && Number.isFinite(j[0])) price=+j[0];
        else if(j && Number.isFinite(j.price)) price=+j.price;
      }else{
        const t=await r.text();
        const m=t.match(/-?\d+(\.\d+)?/);
        if(m) price=+m[0];
      }
      if(Number.isFinite(price)) return price;
    }catch(_){}
  }
  throw new Error('تعذّر جلب السعر الحي');
}

/* دمج السعر الحي داخل الشمعة الجارية للـTF المطلوب */
function mergeLiveIntoSeries(series, tfMin, live){
  if(!series?.length || !Number.isFinite(live)) return series;
  const step=tfMin*60*1000;
  const now=Date.now();
  const bucketStart = Math.floor(now/step)*step;

  const last=series[series.length-1];
  const lastBucketStart = Math.floor(last.t.getTime()/step)*step;

  if(bucketStart===lastBucketStart){
    // عدّل الشمعة الحالية
    last.high=Math.max(last.high, live);
    last.low =Math.min(last.low , live);
    last.close=live; // تحديث الإغلاق اللحظي (لا يعتبر إغلاق رسمي)
  }else if(bucketStart>lastBucketStart){
    // فتح شمعة جديدة (في حالة مرور الوقت)
    series.push({t:new Date(bucketStart), open:live, high:live, low:live, close:live});
  }
  return series;
}

/* ===================== منطق الإشارة ===================== */
/* الإشارة الرسمية = على إغلاق شمعة مكتملة. الـpreSignal للعرض فقط. */
function buildDecision(base){
  if(base.length<60) return {side:null, reason:'بيانات قليلة'};
  const E12=ema(base, EMA_FAST), E26=ema(base, EMA_SLOW), A14=atr(base, ATR_PERIOD);
  const RSI14=rsi(base, RSI_PER), MAC=macd(base, EMA_FAST, EMA_SLOW, 9);

  const n=base.length-1;
  // آخر شمعة مكتملة (السابقة) لتثبيت الإشارة
  const iSig = Math.max(1, n-1);

  let side=null, entry=null;
  if (E12[iSig] > E26[iSig] && E12[iSig-1] <= E26[iSig-1]) { side="شراء"; entry=base[iSig].close; }
  if (E12[iSig] < E26[iSig] && E12[iSig-1] >= E26[iSig-1]) { side="بيع";   entry=base[iSig].close; }

  let reason=[];
  if(side){
    const okTrend = side==="شراء" ? (E12[n]>E26[n]) : (E12[n]<E26[n]);
    const okRsi   = side==="شراء" ? (RSI14[n]>50)    : (RSI14[n]<50);
    const okMacd  = side==="شراء" ? (MAC.macdLine[n] > MAC.signal[n]) : (MAC.macdLine[n] < MAC.signal[n]);
    if(okTrend) reason.push("ترند موافق");
    if(okRsi)   reason.push("RSI موافق");
    if(okMacd)  reason.push("MACD موافق");
  }

  const a=A14[iSig];
  const sl = side==="شراء" ? entry - SL_ATR_MULT*a : entry + SL_ATR_MULT*a;
  const tp1= side==="شراء" ? entry + TP1_ATR_MULT*a : entry - TP1_ATR_MULT*a;
  const tp2= side==="شراء" ? entry + TP2_ATR_MULT*a : entry - TP2_ATR_MULT*a;

  return {
    side, entry, sl, tp1, tp2,
    emaF:E12[n], emaS:E26[n], rsi:RSI14[n], macd:MAC.macdLine[n], macdSig:MAC.signal[n],
    atr:A14[n], reason:reason.join(' • ')
  };
}

/* pre-signal (اختياري للعرض المبكر قبل الإغلاق) */
function preSignal(base){
  if(base.length<3) return null;
  const E12=ema(base, EMA_FAST), E26=ema(base, EMA_SLOW);
  const n=base.length-1;
  if (E12[n] > E26[n] && E12[n-1] <= E26[n-1]) return "احتمال شراء (قيد التكوّن)";
  if (E12[n] < E26[n] && E12[n-1] >= E26[n-1]) return "احتمال بيع (قيد التكوّن)";
  return null;
}

/* ===================== رسم بسيط (اختياري إن عندك canvas id="chart") ===================== */
function drawChart(bars, lines){
  const cv=$('chart'); if(!cv || !bars?.length) return;
  const dpr=window.devicePixelRatio||1;
  const cssW=cv.clientWidth||700, cssH=cv.clientHeight||280;
  if(cv.width!==Math.floor(cssW*dpr) || cv.height!==Math.floor(cssH*dpr)){ cv.width=Math.floor(cssW*dpr); cv.height=Math.floor(cssH*dpr); }
  const ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,cssW,cssH);

  const pad=20, W=cssW-pad*2, H=cssH-pad*2;
  const prices=bars.map(b=>b.close), min=Math.min(...prices), max=Math.max(...prices);
  const x=i=>pad + (i/Math.max(1,bars.length-1))*W;
  const y=p=>pad + (1-(p-min)/Math.max(1e-9,(max-min)))*H;

  ctx.setLineDash([]); ctx.lineWidth=1.5; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.strokeStyle='#10b981';
  const guessDt = bars.length>1 ? (bars[1].t - bars[0].t) : 0;
  ctx.beginPath();
  bars.forEach((b,i)=>{
    const xx=x(i), yy=y(b.close);
    if(i===0) ctx.moveTo(xx,yy);
    else{
      const gap=bars[i].t - bars[i-1].t;
      if(guessDt && gap>2*guessDt) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
    }
  });
  ctx.stroke();

  if(Number.isFinite(window.__livePrice)){
    ctx.setLineDash([6,6]); ctx.strokeStyle='#ffffff';
    ctx.beginPath(); ctx.moveTo(pad, y(window.__livePrice)); ctx.lineTo(pad+W, y(window.__livePrice)); ctx.stroke();
    ctx.setLineDash([]);
  }
  function drawH(val,color,label){
    if(!Number.isFinite(val)) return;
    ctx.strokeStyle=color; ctx.beginPath(); ctx.moveTo(pad, y(val)); ctx.lineTo(pad+W, y(val)); ctx.stroke();
  }
  drawH(lines?.entry,'#60a5fa','Entry'); // الأزرق
  drawH(lines?.tp1,'#22c55e','TP1'); drawH(lines?.tp2,'#22c55e','TP2');
  drawH(lines?.sl,'#ef4444','SL');
}

/* ========= عرض الملخص ========= */
function paintSummary(decision, piv, pre){
  if(!elSummaryText) return;
  if(decision?.side){
    const s = decision.side;
    const txt = `${s} • Entry: ${nf2.format(decision.entry)} • SL: ${nf2.format(decision.sl)} • TP1: ${nf2.format(decision.tp1)} • TP2: ${nf2.format(decision.tp2)}${decision.reason? ' • '+decision.reason:''}`;
    elSummaryText.textContent = txt + (PRO_MODE?' (دقيق)':'');
    elSummaryText.style.color=(s==='شراء')?'#10b981':'#ef4444';
  }else{
    elSummaryText.textContent = pre ? pre : 'لا توجد إشارة حالياً';
    elSummaryText.style.color = pre ? '#eab308' : '#94a3b8';
  }
  if(piv){
    elPivotP && (elPivotP.textContent = nf2.format(piv.P));
    elR1 && (elR1.textContent = nf2.format(piv.R1));
    elR2 && (elR2.textContent = nf2.format(piv.R2));
    elR3 && (elR3.textContent = nf2.format(piv.R3));
    elS1 && (elS1.textContent = nf2.format(piv.S1));
    elS2 && (elS2.textContent = nf2.format(piv.S2));
    elS3 && (elS3.textContent = nf2.format(piv.S3));
  }
}

function paintIndicators(dec){
  if(!dec) return;
  elIndRSI  && (elIndRSI.textContent  = nf2.format(dec.rsi??0));
  elIndMACD && (elIndMACD.textContent = nf4.format(dec.macd??0));
  elIndEMAF && (elIndEMAF.textContent = nf2.format(dec.emaF??0));
  elIndEMAS && (elIndEMAS.textContent = nf2.format(dec.emaS??0));
}

function paintTable(rows){
  if(!elRowsBody || !rows?.length) return;
  const body=[];
  const take = Math.min(TABLE_ROWS, rows.length);
  for(let i=rows.length-take;i<rows.length;i++){
    const b=rows[i];
    body.push(
      `<tr><td>${toLocalDate(b.t)}</td><td>${toLocalTime(b.t)}</td><td>${nf2.format(b.close)}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`
    );
  }
  elRowsBody.innerHTML = body.join('');
}

/* ========= تنبيهات قرب الدخول ========= */
function beep(){ try{const ac=new (window.AudioContext||window.webkitAudioContext)(), o=ac.createOscillator(), g=ac.createGain();
  o.connect(g); g.connect(ac.destination); o.type='sine'; o.frequency.value=880; g.gain.value=0.05; o.start(); setTimeout(()=>{o.stop();ac.close();},200);}catch{} }
async function webNotify(t,b){ try{ if(!('Notification'in window)) return;
  if(Notification.permission==='granted') new Notification(t,{body:b});
  else if(Notification.permission!=='denied'){const p=await Notification.requestPermission(); if(p==='granted') new Notification(t,{body:b});} }catch{} }
function checkProximityAlert(entry){
  if(!elAlertEnable?.checked || !Number.isFinite(entry) || !Number.isFinite(window.__livePrice)) return;
  const dist=Math.abs(window.__livePrice-entry);
  const thr=Math.max( parseFloat(elAlertDist?.value||'0.5') || 0.5, 0 ); // بإمكانك توسيعها ل 0.25×ATR إذا حابب
  const now=Date.now();
  if(dist<=thr && now>__alertLockUntil){
    __alertLockUntil=now+15000;
    const msg=`اقترب السعر من الدخول: ${nf2.format(window.__livePrice)} (Entry ${nf2.format(entry)})`;
    beep(); webNotify('تنبيه دخول',msg);
    if(elLivePrice){elLivePrice.style.transition='color .15s'; elLivePrice.style.color='#67e8f9'; setTimeout(()=>{elLivePrice.style.color='#ffffff';},400);}
  }
}

/* ===================== التحليل الأساسي + الدمج الحي ===================== */
async function runOnceAndStartLive(){
  // حمّل CSV
  const text = await loadCsvText();
  const rows5 = parseCsv(text);
  if(!rows5.length) throw new Error('CSV فارغ');

  // حضّر الأطر
  let rows30=aggregateOHLC(rows5,30), rows60=aggregateOHLC(rows5,60), rowsDayNY=aggregateDailyNY(rows5);
  const piv=calcPivotsFromDailyNY(rowsDayNY);

  __cache = { rows5, rows30, rows60, rowsDayNY, piv };

  // تحليل أولي على الإطار الحالي
  paintPivots(piv);
  await analyzeAndRender(); // يرسم ويكتب الملخص والجدول

  // إبدأ حلقة السعر الحي
  startLiveLoop();
}

function paintPivots(piv){
  if(!piv) return;
  elPivotP && (elPivotP.textContent = nf2.format(piv.P));
  elR1 && (elR1.textContent = nf2.format(piv.R1));
  elR2 && (elR2.textContent = nf2.format(piv.R2));
  elR3 && (elR3.textContent = nf2.format(piv.R3));
  elS1 && (elS1.textContent = nf2.format(piv.S1));
  elS2 && (elS2.textContent = nf2.format(piv.S2));
  elS3 && (elS3.textContent = nf2.format(piv.S3));
}

function pickBaseByTF(cache, tf){
  if(tf===30) return cache.rows30;
  if(tf===60) return cache.rows60;
  if(tf===1440) return cache.rowsDayNY;
  return cache.rows5;
}

async function analyzeAndRender(livePriceOptional){
  if(!__cache) return;

  // اختر السلسلة حسب TF
  let base = pickBaseByTF(__cache, currentTF).slice(); // نسخة
  // دمج السعر الحي ضمن الشمعة الجارية (فقط إن توفر سعر)
  if(Number.isFinite(livePriceOptional)) base = mergeLiveIntoSeries(base, currentTF, livePriceOptional);

  // حساب قرار رسمي + pre-signal
  const decision = buildDecision(base);
  const pre = preSignal(base);

  // تحديث واجهة
  paintSummary(decision, __cache.piv, pre);
  paintIndicators(decision);
  paintTable(base);
  drawChart(base.slice(-200), {entry:decision.entry, sl:decision.sl, tp1:decision.tp1, tp2:decision.tp2});

  // تنبيه قرب الدخول (اختياري)
  checkProximityAlert(decision.entry);
}

function startLiveLoop(){
  stopLiveLoop();
  __liveTimer = setInterval(async ()=>{
    try{
      const p = await fetchLivePrice();
      window.__livePrice = p;
      if(elLivePrice) elLivePrice.textContent = nf2.format(p);
      if(elLiveTime)  elLiveTime.textContent = new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      await analyzeAndRender(p);
    }catch(_){}
  }, LIVE_REFRESH_SEC*1000);
}
function stopLiveLoop(){
  if(__liveTimer){ clearInterval(__liveTimer); __liveTimer=null; }
}

/* ===================== Backtest (نفس CSV، مع خياراتك) ===================== */
function summarizeTrades(trades){
  const win = trades.filter(t=>t.R>0), lose = trades.filter(t=>t.R<=0);
  const pf = (win.reduce((s,x)=>s+x.pnl,0)) / Math.max(1e-9, Math.abs(lose.reduce((s,x)=>s+x.pnl,0)));
  const ex = trades.length ? trades.reduce((s,x)=>s+x.R,0)/trades.length : 0;
  // Sharpe و MaxDD تقريبيين على متسلسلة PnL تراكمية
  const pnlSeries = trades.map(t=>t.pnl);
  let eq=0, peak=0, maxDD=0;
  const eqCurve=[0];
  for(const r of pnlSeries){ eq+=r; peak=Math.max(peak,eq); maxDD=Math.min(maxDD, eq-peak); eqCurve.push(eq); }
  const mean = pnlSeries.length? pnlSeries.reduce((s,x)=>s+x,0)/pnlSeries.length:0;
  const st = Math.sqrt( pnlSeries.length? pnlSeries.reduce((s,x)=>s+(x-mean)**2,0)/pnlSeries.length : 0 );
  const sharpe = st? (mean/st) : 0;
  return {count:trades.length, winRate:win.length/Math.max(1,trades.length), pf, avgR:ex, pnl:eq, maxDD:Math.abs(maxDD), sharpe, equity:eqCurve};
}

function simulateTrades(bars, tf, strict, dailyRiskCapPct, piv){
  if(bars.length<120) return {trades:[], equity:[0]};
  const E12=ema(bars, EMA_FAST), E26=ema(bars, EMA_SLOW), E50=ema(bars,50);
  const A14=atr(bars, ATR_PERIOD), RSI14=rsi(bars, RSI_PER), MAC=macd(bars, EMA_FAST, EMA_SLOW, 9);

  const trades=[]; let cur=null; let eq=[0]; let dailyLoss=0, curDay=null;
  for(let i=60;i<bars.length;i++){
    const d=bars[i], c=d.close, a=A14[i];
    // reset daily risk
    const dayKey = toLocalDate(d.t);
    if(curDay!==dayKey){ curDay=dayKey; dailyLoss=0; }

    const long = E12[i-1]>E26[i-1] && E12[i-2]<=E26[i-2];
    const shrt = E12[i-1]<E26[i-1] && E12[i-2]>=E26[i-2];

    if(!cur && (long || shrt)){
      if(strict){
        const okTrend = long ? (E12[i]>E26[i] && E26[i]>E50[i]) : (E12[i]<E26[i] && E26[i]<E50[i]);
        const okRsi   = long ? RSI14[i]>50 : RSI14[i]<50;
        const okMacd  = long ? (MAC.macdLine[i]>MAC.signal[i]) : (MAC.macdLine[i]<MAC.signal[i]);
        if(!(okTrend && okRsi && okMacd)) continue;
        if(elTogglePivotFilter?.checked && piv){
          // إبعاد الدخول إذا قريب جدًا من Pivot (اختياري)
          const near = Math.min(...[piv.P,piv.R1,piv.R2,piv.R3,piv.S1,piv.S2,piv.S3].map(v=>Math.abs(v-c)));
          if(near < PIVOT_MIN_DISTANCE) continue;
        }
      }
      if(dailyLoss <= -Math.abs((elBtDailyRiskCap?.value || 3)/100) * ACCT_SIZE){
        continue; // تخطّينا حد الخسارة اليومي
      }
      const entry = bars[i-1].close;
      const sl = long ? entry - SL_ATR_MULT*a : entry + SL_ATR_MULT*a;
      const tp = long ? entry + TP2_ATR_MULT*a : entry - TP2_ATR_MULT*a;
      cur = {side: long?'long':'short', entry, sl, tp, openT:new Date(bars[i].t)};
      continue;
    }

    if(cur){
      const hi=bars[i].high??bars[i].close, lo=bars[i].low??bars[i].close;
      let exit=null;
      if(cur.side==='long'){ if(lo<=cur.sl) exit=cur.sl; else if(hi>=cur.tp) exit=cur.tp; }
      else{ if(hi>=cur.sl) exit=cur.sl; else if(lo<=cur.tp) exit=cur.tp; }
      const revLong = E12[i-1]>E26[i-1] && E12[i-2]<=E26[i-2];
      const revShort= E12[i-1]<E26[i-1] && E12[i-2]>=E26[i-2];
      if(!exit && ((cur.side==='long'&&revShort)||(cur.side==='short'&&revLong))) exit=c;
      if(exit!=null){
        const risk = (cur.side==='long') ? (cur.entry-cur.sl) : (cur.sl-cur.entry);
        const R = (exit-cur.entry)/(cur.side==='long'? risk : -risk);
        const pnl = (exit-cur.entry)*(cur.side==='long'?1:-1);
        dailyLoss += Math.min(0,pnl);
        trades.push({open:cur.openT, side:cur.side==='long'?'شراء':'بيع', entry:cur.entry, exit, R, pnl});
        eq.push(eq[eq.length-1]+pnl);
        cur=null;
      }
    }
  }
  if(eq.length===0) eq=[0];
  return {trades, equity:eq};
}

function drawEquity(canvas, eq){
  if(!canvas || !eq?.length) return;
  const ctx=canvas.getContext('2d');
  const dpr=window.devicePixelRatio||1;
  const cssW=canvas.clientWidth||600, cssH=canvas.clientHeight||200;
  if(canvas.width!==Math.floor(cssW*dpr) || canvas.height!==Math.floor(cssH*dpr)){
    canvas.width=Math.floor(cssW*dpr); canvas.height=Math.floor(cssH*dpr);
  }
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,cssW,cssH);
  const pad=16, W=cssW-pad*2, H=cssH-pad*2;
  const min=Math.min(...eq), max=Math.max(...eq);
  const x=i=>pad + (i/Math.max(1,eq.length-1))*W;
  const y=v=>pad + (1-(v-min)/Math.max(1e-9,(max-min)))*H;
  ctx.strokeStyle='#60a5fa'; ctx.lineWidth=1.5; ctx.beginPath();
  eq.forEach((v,i)=>{const xx=x(i), yy=y(v); i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);});
  ctx.stroke();
}

/* ===================== Backtest زر التشغيل ===================== */
async function runBacktest(){
  try{
    // حمّل CSV من الملف (إن اختير) وإلا من نفس المصدر الأساسي
    let text=null;
    const file=elBtCsv?.files?.[0];
    if(file) text=await file.text();
    else     text=await loadCsvText();

    const rows5=parseCsv(text);
    if(!rows5.length) throw new Error('CSV فارغ');

    const tf = parseInt(elBtTf?.value || '5',10);
    const strict = !!elBtStrict?.checked;
    const walk = !!elBtWalk?.checked;
    const dailyRiskCap = parseFloat(elBtDailyRiskCap?.value||'3.0');

    const rows30=aggregateOHLC(rows5,30), rows60=aggregateOHLC(rows5,60), rowsDayNY=aggregateDailyNY(rows5);
    const piv=calcPivotsFromDailyNY(rowsDayNY);
    const base=(tf===30)?rows30:(tf===60)?rows60:(tf===1440)?rowsDayNY:rows5;

    let trades=[], equity=[], stats=null;
    if(!walk){
      const sim=simulateTrades(base, tf, strict, dailyRiskCap, piv);
      trades=sim.trades; equity=sim.equity; stats=summarizeTrades(trades);
    }else{
      const K=3, foldSize=Math.floor(base.length/K);
      let allTrades=[], eq=[0];
      const keepMin=ATR_MIN_PCT, keepMax=ATR_MAX_PCT;
      for(let k=0;k<K;k++){
        const train=base.slice(Math.max(0,k*foldSize-200), (k+1)*foldSize);
        const test =base.slice((k+1)*foldSize, Math.min(base.length,(k+2)*foldSize));
        if(train.length<200||test.length<200) continue;

        // شبكة بسيطة لتحسين %ATR bounds
        let best={score:-Infinity, mn:keepMin, mx:keepMax};
        const grid=[-0.02,0,0.02].flatMap(d1=>[-0.1,0,0.1].map(d2=>({mn:Math.max(0.01,keepMin+d1), mx:Math.min(1.2,keepMax+d2)})));
        for(const g of grid){
          ATR_MIN_PCT=g.mn; ATR_MAX_PCT=g.mx;
          const tr=summarizeTrades(simulateTrades(train, tf, strict, dailyRiskCap, piv).trades);
          const score = (tr.winRate||0)*0.6 + (tr.pf||0)*30 + (tr.avgR||0)*20;
          if(score>best.score) best={score, mn:g.mn, mx:g.mx};
        }
        ATR_MIN_PCT=best.mn; ATR_MAX_PCT=best.mx;

        const sim=simulateTrades(test, tf, strict, dailyRiskCap, piv);
        allTrades=allTrades.concat(sim.trades);
        // اربط منحنى الإكويتي
        const baseEq=eq[eq.length-1]; eq=eq.concat(sim.equity.map(v=>v+baseEq).slice(1));

        ATR_MIN_PCT=keepMin; ATR_MAX_PCT=keepMax;
      }
      trades=allTrades; equity=eq; stats=summarizeTrades(trades);
    }

    if(elBtStats){
      elBtStats.innerHTML =
        `Trades: ${stats.count} • Win%: ${nf2.format((stats.winRate||0)*100)}% • `+
        `PF: ${nf2.format(stats.pf||0)} • Exp: ${nf2.format(stats.avgR||0)}R • `+
        `PnL: ${nf2.format(stats.pnl||0)} • MaxDD: ${nf2.format(stats.maxDD||0)} • Sharpe≈ ${nf2.format(stats.sharpe||0)}`;
    }

    if(elBtRows){
      const rows = trades.slice(-300).map((t,i)=>
        `<tr><td>${i+1}</td><td>${toLocalDate(t.open)}</td><td>${t.side}</td><td>${nf2.format(t.entry)}</td><td>${nf2.format(t.exit)}</td><td>${nf2.format(t.R)}</td><td>${nf2.format(t.pnl)}</td></tr>`
      ).join('');
      elBtRows.innerHTML = rows || '<tr><td colspan="7" class="muted">لا نتائج</td></tr>';
    }

    drawEquity(elBtEquity, stats.equity||[0]);

  }catch(e){
    elBtStats && (elBtStats.textContent = 'خطأ: ' + e.message);
  }
}

/* ===================== تهيئة ===================== */
function loadSettings(){
  EMA_FAST = parseInt(elEmaFast?.value || '12',10);
  EMA_SLOW = parseInt(elEmaSlow?.value || '26',10);
  RSI_PER  = parseInt(elRsiPeriod?.value || '14',10);

  ATR_PERIOD   = parseInt(elAtrPeriod?.value || '14',10);
  SL_ATR_MULT  = parseFloat(elSlMult?.value  || '1.5');
  TP1_ATR_MULT = parseFloat(elTp1Mult?.value || '1.0');
  TP2_ATR_MULT = parseFloat(elTp2Mult?.value || '2.0');
  ATR_MIN_PCT  = parseFloat(elAtrMinPct?.value || '0.05');
  ATR_MAX_PCT  = parseFloat(elAtrMaxPct?.value || '0.80');

  ACCT_SIZE = parseFloat(elAcctSize?.value || '10000');
  RISK_PCT  = parseFloat(elRiskPct?.value  || '1.0');

  PRO_MODE    = !!elProMode?.checked;
  MTF_CONFIRM = !!elMtfConfirm?.checked;

  USE_STOCH = !!elUseStoch?.checked; STOCH_K = parseInt(elStochK?.value||'14',10); STOCH_D = parseInt(elStochD?.value||'3',10);
  USE_BB    = !!elUseBB?.checked; BB_PERIOD = parseInt(elBBPeriod?.value||'20',10); BB_STD = parseFloat(elBBStd?.value||'2',10);
}

function bindEvents(){
  elTf5 && elTf5.addEventListener('click',()=>{setActiveTF(5); analyzeAndRender(window.__livePrice);});
  elTf30&& elTf30.addEventListener('click',()=>{setActiveTF(30); analyzeAndRender(window.__livePrice);});
  elTf60&& elTf60.addEventListener('click',()=>{setActiveTF(60); analyzeAndRender(window.__livePrice);});
  elTfD && elTfD.addEventListener('click',()=>{setActiveTF(1440); analyzeAndRender(window.__livePrice);});

  elBtnRun && elBtnRun.addEventListener('click', async ()=>{
    stopLiveLoop();
    try{ await runOnceAndStartLive(); }catch(e){ alert(e.message); }
  });

  elBtRun && elBtRun.addEventListener('click', runBacktest);
}

window.addEventListener('DOMContentLoaded', async ()=>{
  setActiveTF(5);
  loadSettings();
  bindEvents();
  try{ await runOnceAndStartLive(); }catch(e){ console.warn(e.message); }
});
