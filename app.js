/*************** إعداد عام ***************/
const LS_KEY = 'gold_csv_url';
const TF = { '5m':'5m', '1h':'1h', '1d':'1d' };
let currentTf = TF['5m'];

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
  livePrice: document.getElementById('livePrice'),
  liveTime: document.getElementById('liveTime'),
  liveSummary: document.getElementById('liveSummary'),
  table: document.getElementById('dataTable').querySelector('tbody'),
};

/*************** أدوات ***************/
function repoBase() {
  // https://skyeagle123.github.io/GoldSignalPWA/
  const path = location.pathname;
  const basePath = path.endsWith('/') ? path : path.replace(/[^/]*$/, '');
  return location.origin + basePath;
}
function defaultCsvUrl() {
  // XAUUSD_5min.csv بجانب index.html
  return new URL('XAUUSD_5min.csv', repoBase()).href;
}
function saveCsv(v){ localStorage.setItem(LS_KEY, v||''); }
function loadCsv(){ return localStorage.getItem(LS_KEY) || ''; }
function pad2(n){ return n<10?'0'+n:''+n; }
function fmtIso(d){
  return d.getUTCFullYear()+'-'+pad2(d.getUTCMonth()+1)+'-'+pad2(d.getUTCDate())+
         ' '+pad2(d.getUTCHours())+':'+pad2(d.getUTCMinutes())+':'+pad2(d.getUTCSeconds())+'.000';
}

/*************** تحميل CSV ***************/
async function fetch5mCsvText() {
  const custom = (els.csv.value || '').trim();
  const url = custom || defaultCsvUrl();
  // no-store + cache-bust
  const bust = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
  const r = await fetch(bust, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP '+r.status);
  return await r.text();
}
function parseCsv(text){
  // يتوقع وجود أعمدة Date و Close
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
      key = r.t.getUTCFullYear()+'-'+pad2(r.t.getUTCMonth()+1)+'-'+pad2(r.t.getUTCDate());
    }
    // نأخذ آخر الأسعار ضمن نفس السلة
    map.set(key, r);
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
  return out;
}
function computeIndicators(rows, pFast, pSlow, pRsi){
  const closes = rows.map(r=>r.close);
  const emaF = ema(closes, pFast);
  const emaS = ema(closes, pSlow);
  const macd = emaF.map((v,i)=> (v!=null && emaS[i]!=null) ? +(v-emaS[i]).toFixed(4) : null);
  const rsiArr = rsi(closes, pRsi).map(v=> v==null?null:+v.toFixed(2));
  return rows.map((r,i)=>({
    ...r,
    emaF: +emaF[i].toFixed(2),
    macd: macd[i],
    rsi: rsiArr[i],
  }));
}
function decideSignal(row){
  if (row.rsi==null || row.macd==null) return 'حيادي';
  // قواعد بسيطة
  if (row.rsi<35 || row.macd>0) return 'شراء';
  if (row.rsi>65 || row.macd<0) return 'بيع';
  return 'حيادي';
}

/*************** واجهة ***************/
function markTf(){
  [els.tf5,els.tf60,els.tfD].forEach(b=>b.classList.remove('active'));
  if (currentTf===TF['5m']) els.tf5.classList.add('active');
  else if (currentTf===TF['1h']) els.tf60.classList.add('active');
  else els.tfD.classList.add('active');
}
async function run(){
  try{
    const txt = await fetch5mCsvText();
    const raw5m = parseCsv(txt);
    const used = resample(raw5m, currentTf);

    const pF = Math.max(2, parseInt(els.emaF.value||'12',10));
    const pS = Math.max(pF+1, parseInt(els.emaS.value||'26',10));
    const pR = Math.max(2, parseInt(els.rsiP.value||'14',10));
    const rows = computeIndicators(used, pF, pS, pR);

    // آخر صف = السعر الحي
    const last = rows[rows.length-1];
    els.livePrice.textContent = last ? last.close.toFixed(2) : '—';
    els.liveTime.textContent = last ? fmtIso(last.t) : '—';
    const sig = last ? decideSignal(last) : '—';
    els.liveSummary.textContent = sig;
    els.liveSummary.className = '';
    if (sig==='شراء') els.liveSummary.classList.add('good');
    else if (sig==='بيع') els.liveSummary.classList.add('bad');
    else els.liveSummary.classList.add('warn');

    // جدول آخر 50 صف (من الأحدث)
    const body = els.table;
    body.innerHTML = '';
    const take = rows.slice(-50).reverse();
    for (const r of take){
      const tr = document.createElement('tr');
      const sigR = decideSignal(r);
      tr.innerHTML =
        `<td>${r.emaF?.toFixed(2) ?? '—'}</td>`+
        `<td>${r.macd ?? '—'}</td>`+
        `<td>${r.rsi ?? '—'}</td>`+
        `<td class="${sigR==='شراء'?'good':sigR==='بيع'?'bad':'warn'}">${sigR}</td>`+
        `<td>${r.close.toFixed(2)}</td>`+
        `<td>${fmtIso(r.t)}</td>`;
      body.appendChild(tr);
    }
  }catch(e){
    alert('تعذّر تحميل/تحليل البيانات: '+e.message);
    console.error(e);
  }
}

/*************** أحداث ***************/
(function init(){
  // حمّل الرابط المحفوظ (إن وجد) بدون فرض قيمة
  const saved = loadCsv();
  if (saved) els.csv.value = saved;

  els.csv.addEventListener('change', ()=> saveCsv(els.csv.value.trim()));
  els.clearCsv.addEventListener('click', ()=>{
    els.csv.value = '';
    saveCsv('');
    els.csv.focus();
  });

  els.tf5.onclick = ()=>{ currentTf=TF['5m']; markTf(); run(); };
  els.tf60.onclick = ()=>{ currentTf=TF['1h']; markTf(); run(); };
  els.tfD.onclick = ()=>{ currentTf=TF['1d']; markTf(); run(); };

  els.run.onclick = ()=> run();

  markTf();
  run();
  setInterval(run, 60_000); // حدّث كل 60 ثانية
})();
