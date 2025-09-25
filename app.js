/***************** إعداد الروابط *****************/

// (اختياري) لو عندك Cloudflare Worker يرجّع {price}
const LIVE_JSON_URL = ''; // مثال: 'https://goldprice-proxy.yourname.workers.dev?s=GC=F'

// روابط CSV بrepo (تأكد من المسارات بأسماء ملفاتك)
const DAILY_CSV_URL  = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_live.csv';
const HOURLY_CSV_URL = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_hourly.csv';
const FIVE_CSV_URL   = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_5min.csv';

// مصادر Stooq عبر بروكسيات (للسعر الحي)
const STOOQ_URLS = [
  'https://r.jina.ai/http://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv',
  'https://r.jina.ai/http://stooq.pl/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv',
  'https://r.jina.ai/http://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&e=csv'
];

// OHLC يومي من Stooq لحساب Pivot
const STOOQ_DAILY_OHLC = 'https://r.jina.ai/http://stooq.com/q/d/l/?s=xauusd&i=d';


/***************** عناصر DOM *****************/
const els = {
  csvUrl: document.getElementById('csvUrl'),
  sourceSel: document.getElementById('sourceSel'),
  runBtn: document.getElementById('runBtn'),
  tableHead: document.getElementById('tableHead'),
  tableBody: document.getElementById('tableBody'),
  signalBadge: document.getElementById('signalBadge'),
  signalNote: document.getElementById('signalNote'),
  livePriceLine: document.getElementById('livePriceLine'),
  tabMin: document.getElementById('tabMin'),
  tabHour: document.getElementById('tabHour'),
  tabDay: document.getElementById('tabDay'),
  emaFast: document.getElementById('emaFast'),
  emaSlow: document.getElementById('emaSlow'),
  rsiPeriod: document.getElementById('rsiPeriod'),
  pivotBox: document.getElementById('pivotBox'),
};

let currentFrame = 'min';   // min | hour | day
let minuteSeries = [];      // سلسلة السعر الحي (دقيقة-بدقيقة)
let lastLiveTs = 0;
let liveTimer = null;


/***************** أدوات عامة *****************/
const fmtNum = (n) => (Number.isFinite(n) ? Number(n).toFixed(2) : '—');
function setBadge(text, cls='warn'){ if(!els.signalBadge) return; els.signalBadge.textContent=text; els.signalBadge.className='pill '+cls; }
function setNote(text){ if(els.signalNote) els.signalNote.textContent=text; }
function setLiveLine(price, ts){
  if(!els.livePriceLine) return;
  const t = ts ? ts.toISOString().replace('T',' ').replace('Z','') : '';
  els.livePriceLine.textContent = `السعر الحي: ${Number.isFinite(price)?fmtNum(price):'—'} ${t?'• '+t:''}`;
}

function toDateSafe(s){
  if (s instanceof Date) return s;
  if (typeof s === 'number') return new Date(s);
  if (/^\d{10}$/.test(s)) return new Date(Number(s)*1000);
  if (/^\d{13}$/.test(s)) return new Date(Number(s));
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return new Date(s.endsWith('Z')?s:(s+'Z'));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s+'T00:00:00Z');
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)){ const [d,m,y]=s.split('/').map(Number); return new Date(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T00:00:00Z`); }
  const d = new Date(s); return isNaN(d)?null:d;
}


/***************** جلب سعر حي (مع احتياطات) *****************/
async function fetchLivePrice(){
  // 1) Worker (إن وُجد)
  if (LIVE_JSON_URL){
    try{
      const r = await fetch(LIVE_JSON_URL, {cache:'no-store'});
      const j = await r.json();
      if (j && Number(j.price)) return {price:Number(j.price), ts:new Date()};
    }catch(e){ console.warn('worker live fail', e); }
  }
  // 2) Stooq عبر عدة روابط
  for (const url of STOOQ_URLS){
    try{
      const txt = await (await fetch(url, {cache:'no-store'})).text();
      const lines = txt.split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !/^Symbol/i.test(s));
      if (!lines.length) continue;
      const cols   = lines[lines.length-1].split(',');
      const close  = parseFloat(cols[6]);
      const date   = cols[1] || '';
      const time   = cols[2] || '00:00:00';
      const ts     = toDateSafe(`${date}T${time}Z`) || new Date();
      if (isFinite(close)) return {price:close, ts};
    }catch(e){ console.warn('stooq live fail', url, e); }
  }
  // 3) Fallback: آخر قيمة من CSV 5 دقائق
  try{
    const series = await fetchCSVtoSeries(FIVE_CSV_URL);
    const last = series.at(-1);
    if (last) return {price:last.price, ts:last.time};
  }catch(e){ console.warn('fallback 5min csv fail', e); }

  return {price:null, ts:new Date()};
}


/***************** قراءة CSV مرنة *****************/
async function fetchCSVtoSeries(url){
  const txt = await (await fetch(url, {cache:'no-store'})).text();
  const lines = txt.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const head = lines[0].split(',').map(h=>h.trim());
  let hasHeader=false, start=0;
  const known = head.map(h=>h.toLowerCase());
  if (known.includes('date') || known.includes('time') || known.includes('timestamp') || known.includes('close') || known.includes('adj close')){
    hasHeader=true; start=1;
  }
  const findIdx=(arr)=>arr.map(n=>known.indexOf(n)).find(i=>i>=0);
  const iDate = hasHeader ? findIdx(['date']) : -1;
  const iTime = hasHeader ? findIdx(['time']) : -1;
  const iTs   = hasHeader ? findIdx(['timestamp']) : -1;
  const iClose= hasHeader ? (findIdx(['close']) ?? findIdx(['adj close'])) : -1;

  const series=[];
  for (let i=start;i<lines.length;i++){
    const cols = lines[i].split(',').map(s=>s.trim());
    let close = null, ts = null;

    if (iClose>=0) close = parseFloat(cols[iClose]);
    if (!isFinite(close)){ // جرّب آخر عمود رقم
      for (let k=cols.length-1;k>=0;k--){ const v=parseFloat(cols[k]); if (isFinite(v)){ close=v; break; } }
    }

    if (iTs>=0) ts = toDateSafe(cols[iTs]);
    else if (iDate>=0 && iTime>=0) ts = toDateSafe(`${cols[iDate]}T${cols[iTime]}Z`);
    else if (iDate>=0) ts = toDateSafe(cols[iDate]);
    else ts = toDateSafe(cols[0]);

    if (isFinite(close) && ts) series.push({time:ts, price:close});
  }
  series.sort((a,b)=>a.time-b.time);
  return series;
}


/***************** تجميع 5 دق إلى ساعة/يوم + Pivot *****************/
function aggregateFrom5min(rows){
  const hour=[], day=[];
  let hb=null, db=null, lastH=null, lastD=null;
  for (const r of rows){
    const t = new Date(r.time);
    const hKey = t.toISOString().slice(0,13);
    const dKey = t.toISOString().slice(0,10);

    if (hKey!==lastH){
      if (hb) hour.push({...hb});
      hb={ts:new Date(hKey+':00:00Z'), open:r.price, high:r.price, low:r.price, close:r.price};
      lastH=hKey;
    } else {
      hb.high=Math.max(hb.high,r.price); hb.low=Math.min(hb.low,r.price); hb.close=r.price;
    }

    if (dKey!==lastD){
      if (db) day.push({...db});
      db={ts:new Date(dKey+'T00:00:00Z'), open:r.price, high:r.price, low:r.price, close:r.price};
      lastD=dKey;
    } else {
      db.high=Math.max(db.high,r.price); db.low=Math.min(db.low,r.price); db.close=r.price;
    }
  }
  if (hb) hour.push(hb);
  if (db) day.push(db);
  return {hour, day};
}

function calcPivots(o,h,l,c){
  const P=(h+l+c)/3;
  return { P,
    R1:2*P-l, S1:2*P-h,
    R2:P+(h-l), S2:P-(h-l),
    R3:h+2*(P-l), S3:l-2*(h-P)
  };
}

async function fetchDailyPivot(){
  try{
    const t = await (await fetch(STOOQ_DAILY_OHLC, {cache:'no-store'})).text();
    const rows = t.split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !/^Date/i.test(s));
    if (!rows.length) return null;
    const last = rows.at(-1).split(',');
    const o=parseFloat(last[1]), h=parseFloat(last[2]), l=parseFloat(last[3]), c=parseFloat(last[4]);
    if ([o,h,l,c].every(Number.isFinite)) return calcPivots(o,h,l,c);
  }catch{}
  return null;
}


/***************** مؤشرات فنية *****************/
function EMA(arr, period){
  const k=2/(period+1); const out=[]; let prev;
  for (let i=0;i<arr.length;i++){ const v=arr[i]; prev = i? v*k + prev*(1-k) : v; out.push(prev); }
  return out;
}
function RSI(arr, period){
  if (arr.length<=period) return Array(arr.length).fill(50);
  let g=0,l=0;
  for (let i=1;i<=period;i++){ const ch=arr[i]-arr[i-1]; if (ch>=0) g+=ch; else l-=ch; }
  let avgG=g/period, avgL=l/period;
  const out=Array(period).fill(50);
  out.push(100-100/(1+(avgL?(avgG/avgL):100)));
  for (let i=period+1;i<arr.length;i++){
    const ch=arr[i]-arr[i-1], gg=Math.max(ch,0), ll=Math.max(-ch,0);
    avgG=(avgG*(period-1)+gg)/period; avgL=(avgL*(period-1)+ll)/period;
    const rs=avgL?(avgG/avgL):100; out.push(100-100/(1+rs));
  }
  return out;
}
function MACD(arr, fast=12, slow=26, signal=9){
  const ef=EMA(arr,fast), es=EMA(arr,slow);
  const macd=ef.map((v,i)=>v-(es[i]??v));
  const k=2/(signal+1), sig=[]; let p;
  for (let i=0;i<macd.length;i++){ p=i? macd[i]*k + p*(1-k) : macd[i]; sig.push(p); }
  const hist=macd.map((v,i)=>v-sig[i]); return {macd,sig,hist};
}

// قرار الإشارة لصف واحد
function decideSignal(emaF, emaS, rsi, macdHist){
  if (![emaF,emaS,rsi,macdHist].every(Number.isFinite)) return 'حيادي';
  if (emaF > emaS && macdHist > 0 && rsi < 70) return 'شراء';
  if (emaF < emaS && macdHist < 0 && rsi > 30) return 'بيع';
  return 'حيادي';
}


/***************** ملخص الإشارة + الجدول *****************/
function updateSignalsFromSeries(series, opts){
  const closes = series.map(s=>s.price).filter(Number.isFinite);
  if (closes.length < Math.max(opts.emaSlow+5, opts.rsiPeriod+5)){
    setBadge('بيانات غير كافية','warn');
    setNote('أضِف/حمّل مزيد من النقاط');
    return;
  }
  const emaF = EMA(closes, opts.emaFast).at(-1);
  const emaS = EMA(closes, opts.emaSlow).at(-1);
  const rsi  = RSI(closes, opts.rsiPeriod).at(-1);
  const macdHist = MACD(closes).hist.at(-1);

  let decision='حيادي', cls='warn';
  if (emaF>emaS && macdHist>0 && rsi<70){ decision='شراء'; cls='good'; }
  else if (emaF<emaS && macdHist<0 && rsi>30){ decision='بيع'; cls='bad'; }

  setBadge(decision, cls);
  setNote(`RSI: ${fmtNum(rsi)} • MACD: ${fmtNum(macdHist)} • ${fmtNum(series.at(-1)?.price ?? NaN)}`);
}

// جدول تفصيلي: EMA F / MACD Hist / RSI / الإشارة / السعر / التاريخ
function renderDetailedTable(series, opts){
  if (!series?.length){ els.tableHead.innerHTML=''; els.tableBody.innerHTML=''; return; }

  const closes = series.map(s=>s.price);
  const emaFarr = EMA(closes, opts.emaFast);
  const emaSarr = EMA(closes, opts.emaSlow);
  const rsiArr  = RSI(closes,  opts.rsiPeriod);
  const histArr = MACD(closes).hist;

  els.tableHead.innerHTML = '<tr><th>EMA F</th><th>MACD</th><th>RSI</th><th>الإشارة</th><th>السعر</th><th>التاريخ</th></tr>';

  const N = Math.min(series.length, 30);
  let html='';
  for (let k=series.length-1; k>=series.length-N; k--){
    const emaF = emaFarr[k], emaS = emaSarr[k], rsi = rsiArr[k], hist = histArr[k];
    const sig  = decideSignal(emaF, emaS, rsi, hist);
    const cls  = sig==='شراء'?'good':(sig==='بيع'?'bad':'warn');
    const dt   = new Date(series[k].time).toISOString().replace('T',' ').replace('Z','');
    html += `<tr>
      <td>${fmtNum(emaF)}</td>
      <td>${fmtNum(hist)}</td>
      <td>${fmtNum(rsi)}</td>
      <td class="${cls}">${sig}</td>
      <td>${fmtNum(series[k].price)}</td>
      <td>${dt}</td>
    </tr>`;
  }
  els.tableBody.innerHTML = html;
}


/***************** Pivot UI *****************/
function renderPivots(p){
  if (!p){ els.pivotBox.innerHTML = '<div class="muted">— لا تتوفر بيانات Pivot حالياً</div>'; return; }
  const cells = [
    ['R3',p.R3],['R2',p.R2],['R1',p.R1],['P',p.P],['S1',p.S1],['S2',p.S2],['S3',p.S3]
  ].map(([k,v])=>`<div class="card" style="padding:10px"><div class="muted">${k}</div><div style="font-weight:700">${fmtNum(v)}</div></div>`).join('');
  els.pivotBox.innerHTML = cells;
}


/***************** منطق الإطارات *****************/
function setActiveTab(frame){
  currentFrame=frame;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.frame===frame));
}


/***************** تشغيل رئيسي *****************/
async function runNow(){
  const emaFast = Number(els.emaFast.value)||12;
  const emaSlow = Number(els.emaSlow.value)||26;
  const rsiPer  = Number(els.rsiPeriod.value)||14;

  // حمّل السلسلة بحسب الإطار
  let series=[];
  const customUrl = (els.csvUrl.value||'').trim();

  try{
    if (currentFrame==='day'){
      const url = customUrl || DAILY_CSV_URL;
      series = await fetchCSVtoSeries(url);
    } else if (currentFrame==='hour'){
      const url = customUrl || HOURLY_CSV_URL;
      series = await fetchCSVtoSeries(url);
    } else { // دقيقة
      series = [...minuteSeries];
      // لو السلسلة فاضية، جرّب CSV 5min كبديل مبدئي
      if (!series.length){
        const s5 = await fetchCSVtoSeries(customUrl || FIVE_CSV_URL);
        series = s5;
      }
    }
  }catch(e){
    console.error('CSV load error', e);
  }

  renderDetailedTable(series, {emaFast, emaSlow, rsiPeriod:rsiPer});
  updateSignalsFromSeries(series, {emaFast, emaSlow, rsiPeriod:rsiPer});

  // Pivot من Stooq (يومي)
  try{ renderPivots(await fetchDailyPivot()); }
  catch{ renderPivots(null); }
}


/***************** حلقة السعر الحي (كل 60 ثانية) *****************/
async function tickLive(){
  try{
    const {price, ts} = await fetchLivePrice();
    if (Number.isFinite(price)){
      setLiveLine(price, ts);
      const t = ts || new Date();
      if (+t !== lastLiveTs){
        minuteSeries.push({time:t, price});
        if (minuteSeries.length>720) minuteSeries = minuteSeries.slice(-720);
        lastLiveTs = +t;
      }
      if (currentFrame==='min'){
        renderDetailedTable(minuteSeries, {
          emaFast: Number(els.emaFast.value)||12,
          emaSlow: Number(els.emaSlow.value)||26,
          rsiPeriod: Number(els.rsiPeriod.value)||14
        });
      }
      // حدّث الملخص
      runNow();
    } else {
      setLiveLine(null, new Date());
    }
  }catch(e){
    console.error('live error', e);
  }finally{
    liveTimer = setTimeout(tickLive, 60*1000); // غيّر 60*1000 إذا بدك فترة مختلفة
  }
}


/***************** تهيئة *****************/
(function init(){
  // استرجاع رابط CSV
  const saved = localStorage.getItem('csv_url'); if (saved) { els.csvUrl.value = saved; els.sourceSel.value='csv'; }
  els.csvUrl.addEventListener('change', ()=> localStorage.setItem('csv_url', els.csvUrl.value.trim()));

  // تبويبات الإطار
  [els.tabMin, els.tabHour, els.tabDay].forEach(btn=>{
    btn.addEventListener('click', ()=>{ setActiveTab(btn.dataset.frame); runNow(); });
  });

  // زر التشغيل اليدوي
  els.runBtn.addEventListener('click', runNow);

  // ابدأ بالسعر الحي
  tickLive();

  // أول تشغيل
  runNow();
})();
