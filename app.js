/*************** إعداد عام ***************/
const LS_KEY = 'gold_csv_url';
const TF = { '5m':'5m', '1h':'1h', '1d':'1d' };
let currentTf = TF['5m'];

// مصادر السعر الحي (مع بروكسي CORS + كسر كاش)
const LIVE_SOURCES = {
  metals: () => `https://r.jina.ai/https://api.metals.live/v1/spot/gold?_=${Date.now()}`,
  stooq : () => `https://r.jina.ai/http://stooq.com/q/l/?s=xauusd&f=sd2t2ohlc&e=csv&_=${Date.now()}`
};
const LIVE_POLL_MS = 1000; // كل ثانية

const els = {
  csv: document.getElementById('csvUrl'),
  clearCsv: document.getElementById('clearCsvBtn'),
  tf5: document.getElementById('tf5'),
  tf60: document.getElementById('tf60'),
  tfD: document.getElementById('tfD'),
  emaF: document.getElementById('emaFast'),
  emaS: document.getElementById('emaSlow'),
  rsiP: document.getElementById('rsiPeriod'),
  run: document.getElementById('runBtn'),
  // الحي + الملخص
  livePrice: document.getElementById('livePrice'),
  liveTime: document.getElementById('liveTime'),
  liveSummary: document.getElementById('liveSummary'),
  // Pivot
  r1: document.getElementById('r1'),
  r2: document.getElementById('r2'),
  r3: document.getElementById('r3'),
  s1: document.getElementById('s1'),
  s2: document.getElementById('s2'),
  s3: document.getElementById('s3'),
  pp: document.getElementById('pp'),
  // جدول البيانات
  table: document.getElementById('dataTable').querySelector('tbody'),
};

let lastSignal = '—';      // آخر إشارة من CSV
let lastCsvPoint = null;   // آخر نقطة محسوبة من الـCSV (للفallback)

/*************** أدوات ***************/
function repoBase() {
  const path = location.pathname;
  const basePath = path.endsWith('/') ? path : path.replace(/[^/]*$/, '');
  return location.origin + basePath;
}
function defaultCsvUrl() { return new URL('XAUUSD_5min.csv', repoBase()).href; }
function saveCsv(v){ try{ localStorage.setItem(LS_KEY, v||''); }catch{} }
function loadCsv(){ try{ return localStorage.getItem(LS_KEY) || ''; }catch{ return ''; } }
function pad2(n){ return n<10?'0'+n:''+n; }
function fmtIso(d){
  return d.getUTCFullYear()+'-'+pad2(d.getUTCMonth()+1)+'-'+pad2(d.getUTCDate())+
         ' '+pad2(d.getUTCHours())+':'+pad2(d.getUTCMinutes())+':'+pad2(d.getUTCSeconds())+'.000';
}
function dayKeyUTC(d){ return d.getUTCFullYear()+'-'+pad2(d.getUTCMonth()+1)+'-'+pad2(d.getUTCDate()); }

/*************** تحميل CSV ***************/
async function fetch5mCsvText() {
  const custom = (els.csv?.value || '').trim();
  const url = custom || defaultCsvUrl();
  const bust = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
  const r = await fetch(bust, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP '+r.status);
  return await r.text();
}
function parseCsv(text){
  const lines = text.trim().split(/\r?\n/);
  if (lines.length<2) throw new Error('ملف CSV فارغ');
  const headers = lines[0].split(',').map(s=>s.trim().toLowerCase());
  const cDate = headers.indexOf('date');
  const cClose = headers.indexOf('close');
  if (cDate===-1 || cClose===-1) throw new Error('لا يوجد Date/Close بالملف');
  const rows = [];
  for (let i=1;i<lines.length;i++){
    const parts = lines[i].split(',');
    const t = new Date(parts[cDate]);
    const close = Number(parts[cClose]);
    if (isFinite(t.getTime()) && isFinite(close)) rows.push({t, close});
  }
  rows.sort((a,b)=>a.t-b.t);
  return rows;
}

/*************** تحويل إطار زمني ***************/
function resample(rows, tf) {
  if (tf===TF['5m']) return rows;
  const map = new Map();
  for (const r of rows){
    let key;
    if (tf===TF['1h']){
      key = r.t.getUTCFullYear()+'-'+pad2(r.t.getUTCMonth()+1)+'-'+pad2(r.t.getUTCDate())+' '+pad2(r.t.getUTCHours());
    } else { // يومي
      key = dayKeyUTC(r.t);
    }
    map.set(key, r); // آخر قيمة ضمن السلة
  }
  return Array.from(map.entries()).sort((a,b)=>a[0]>b[0]?1:-1).map(x=>x[1]);
}

/*************** مؤشرات ***************/
function ema(values, period){
  const k = 2/(period+1);
  let prev;
  return values.map((v,i)=>{
    if (i===0) return (prev=v);
    prev = v*k + prev*(1-k);
    return prev;
  });
}
function rsi(values, period){
  if (values.length <= period) return new Array(values.length).fill(null);
  let gains=0, losses=0;
  for (let i=1;i<=period;i++){
    const ch = values[i]-values[i-1];
    if (ch>=0) gains += ch; else losses += -ch;
  }
  gains/=period; losses/=period;
  const out = new Array(values.length).fill(null);
  out[period] = losses===0?100:100 - 100/(1+gains/losses);
  for (let i=period+1;i<values.length;i++){
    const ch = values[i]-values[i-1];
    const g = ch>0?ch:0, l = ch<0?-ch:0;
    gains = (gains*(period-1)+g)/period;
    losses = (losses*(period-1)+l)/period;
    out[i] = losses===0?100:100 - 100/(1+gains/losses);
  }
  return out.map(v=> v==null?null:+v.toFixed(2));
}
function computeIndicators(rows, pFast, pSlow, pRsi){
  const closes = rows.map(r=>r.close);
  const emaF = ema(closes, pFast);
  const emaS = ema(closes, pSlow);
  const macd = emaF.map((v,i)=> (v!=null && emaS[i]!=null) ? +(v-emaS[i]).toFixed(4) : null);
  const rsiArr = rsi(closes, pRsi);
  return rows.map((r,i)=>({
    ...r,
    emaF: +emaF[i].toFixed(2),
    macd: macd[i],
    rsi: rsiArr[i],
  }));
}
function decideSignal(row){
  if (row.rsi==null || row.macd==null) return 'حيادي';
  if (row.rsi<35 || row.macd>0) return 'شراء';
  if (row.rsi>65 || row.macd<0) return 'بيع';
  return 'حيادي';
}

/*************** Pivot (دعم/مقاومة) ***************/
function computeDailyPivotFrom5m(raw5m){
  if (!raw5m?.length) return null;
  const last = raw5m[raw5m.length-1];
  const k = dayKeyUTC(last.t);
  let dayRows = raw5m.filter(r=> dayKeyUTC(r.t)===k);
  if (dayRows.length < 10) dayRows = raw5m.slice(-288); // حوالي يوم 5 دقائق
  const highs = dayRows.map(r=>r.close);
  const H = Math.max(...highs);
  const L = Math.min(...highs);
  const C = dayRows[dayRows.length-1].close;
  const P = (H+L+C)/3;
  const R1 = 2*P - L, S1 = 2*P - H;
  const R2 = P + (H - L), S2 = P - (H - L);
  const R3 = H + 2*(P - L), S3 = L - 2*(H - P);
  const fx = v => +v.toFixed(2);
  return { P:fx(P), R1:fx(R1), R2:fx(R2), R3:fx(R3), S1:fx(S1), S2:fx(S2), S3:fx(S3) };
}

/*************** السعر الحي: مصادر متعددة ***************/
let liveInFlight = false;

async function fetchLiveFromMetals(){
  const r = await fetch(LIVE_SOURCES.metals(), { cache:'no-store' });
  if (!r.ok) throw new Error('metals.live HTTP '+r.status);
  const data = await r.json(); // [[ts,price],...]
  if (!Array.isArray(data) || data.length===0 || !Array.isArray(data[data.length-1])) {
    throw new Error('metals.live unexpected');
  }
  const [ts, price] = data[data.length-1];
  if (!isFinite(price)) throw new Error('metals.live price N/A');
  const t = isFinite(+ts) ? new Date(+ts*1000) : new Date();
  return { price: +(+price).toFixed(2), iso: fmtIso(t), source:'Metals.live' };
}
async function fetchLiveFromStooq(){
  const r = await fetch(LIVE_SOURCES.stooq(), { cache:'no-store' });
  if (!r.ok) throw new Error('stooq HTTP '+r.status);
  const txt = await r.text();
  const lines = txt.trim().split(/\r?\n/);
  if (lines.length<2) throw new Error('stooq no data');
  const parts = lines[1].split(',');
  const close = Number(parts[6]);
  const date = parts[1] || '';
  const time = parts[2] || '';
  if (!isFinite(close)) throw new Error('stooq price N/A');
  const iso = (date && time) ? (date+' '+time) : new Date().toISOString().replace('T',' ').slice(0,19);
  return { price:+close.toFixed(2), iso, source:'Stooq' };
}
async function updateLive(){
  if (liveInFlight) return;
  liveInFlight = true;
  try{
    let live = null;
    try { live = await fetchLiveFromMetals(); }
    catch { live = await fetchLiveFromStooq(); }
    if (live){
      els.livePrice.textContent = live.price.toFixed(2);
      els.liveTime.textContent  = live.iso;
      if (!els.liveSummary.textContent || els.liveSummary.textContent==='—') {
        els.liveSummary.textContent = lastSignal || '—';
      }
    }
  }catch(e){
    // Fallback: آخر CSV
    if (lastCsvPoint){
      els.livePrice.textContent = lastCsvPoint.close.toFixed(2);
      els.liveTime.textContent  = fmtIso(lastCsvPoint.t);
    }
    console.warn('Live failed:', e.message);
  }finally{
    liveInFlight = false;
  }
}

/*************** واجهة ***************/
function markTf(){
  [els.tf5,els.tf60,els.tfD].forEach(b=>b?.classList.remove('active'));
  if (currentTf===TF['5m']) els.tf5?.classList.add('active');
  else if (currentTf===TF['1h']) els.tf60?.classList.add('active');
  else els.tfD?.classList.add('active');
}

async function run(){
  try{
    const txt = await fetch5mCsvText();
    const raw5m = parseCsv(txt);
    lastCsvPoint = raw5m[raw5m.length-1] || null;

    // Pivot من 5 دقائق
    const piv = computeDailyPivotFrom5m(raw5m);
    if (piv){
      els.r1.textContent = piv.R1; els.r2.textContent = piv.R2; els.r3.textContent = piv.R3;
      els.s1.textContent = piv.S1; els.s2.textContent = piv.S2; els.s3.textContent = piv.S3;
      els.pp.textContent = piv.P;
    } else {
      ['r1','r2','r3','s1','s2','s3','pp'].forEach(k=> els[k].textContent='—');
    }

    // تحويل للإطار الزمني المطلوب
    const used = resample(raw5m, currentTf);
    const pF = Math.max(2, parseInt(els.emaF?.value||'12',10));
    const pS = Math.max(pF+1, parseInt(els.emaS?.value||'26',10));
    const pR = Math.max(2, parseInt(els.rsiP?.value||'14',10));
    const rows = computeIndicators(used, pF, pS, pR);

    // إشارة الملخص من CSV
    const last = rows[rows.length-1];
    const sig = last ? decideSignal(last) : '—';
    lastSignal = sig;
    els.liveSummary.textContent = sig;
    els.liveSummary.className = '';
    if (sig==='شراء') els.liveSummary.classList.add('good');
    else if (sig==='بيع') els.liveSummary.classList.add('bad');
    else els.liveSummary.classList.add('warn');

    // إذا السعر الحي فاضي، عبّيه مؤقتاً من CSV
    if (!els.livePrice.textContent || els.livePrice.textContent==='—') {
      if (last){ els.livePrice.textContent = last.close.toFixed(2); els.liveTime.textContent = fmtIso(last.t); }
    }

    // ******** ترتيب الأعمدة لضبط “الإشارة” ********
    // هيك الترتيب النهائي: السعر | MACD | RSI | الإشارة | EMA F | التاريخ
    const body = els.table; body.innerHTML = '';
    const take = rows.slice(-50).reverse();
    for (const r of take){
      const sigR = decideSignal(r);
      const cls = sigR==='شراء'?'good':(sigR==='بيع'?'bad':'warn');
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${r.close.toFixed(2)}</td>`+                     // السعر
        `<td>${r.macd ?? '—'}</td>`+                          // MACD
        `<td>${r.rsi ?? '—'}</td>`+                           // RSI
        `<td class="${cls}">${sigR}</td>`+                    // الإشارة
        `<td>${r.emaF?.toFixed(2) ?? '—'}</td>`+              // EMA F
        `<td>${fmtIso(r.t)}</td>`;                            // التاريخ
      body.appendChild(tr);
    }
  }catch(e){
    alert('تعذّر تحميل/تحليل البيانات: '+e.message);
    console.error(e);
  }
}

/*************** أحداث ***************/
(function init(){
  // CSV remembered
  const saved = loadCsv();
  if (els.csv && saved) els.csv.value = saved;
  els.csv?.addEventListener('change', ()=> saveCsv(els.csv.value.trim()));
  els.clearCsv?.addEventListener('click', ()=>{
    els.csv.value = '';
    saveCsv('');
    els.csv.focus();
  });

  // TF
  els.tf5 && (els.tf5.onclick = ()=>{ currentTf=TF['5m']; markTf(); run(); });
  els.tf60 && (els.tf60.onclick = ()=>{ currentTf=TF['1h']; markTf(); run(); });
  els.tfD && (els.tfD.onclick = ()=>{ currentTf=TF['1d']; markTf(); run(); });

  // Run
  els.run && (els.run.onclick = ()=> run());

  markTf();
  run();                         // تحليل CSV (مؤشرات + جدول + Pivot)
  updateLive();                  // السعر الحي فوراً
  setInterval(updateLive, LIVE_POLL_MS); // كل ثانية
  setInterval(run, 60_000);      // تحديث التحليلات من CSV كل دقيقة
})();
