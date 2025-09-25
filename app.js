/**************** إعداد المصادر (عدّلي إذا لزم) ****************/
// خيار Worker (اختياري) لو عندك Cloudflare يُرجع JSON: {price}
const LIVE_JSON_URL = ''; // مثال: 'https://goldprice-proxy.yourname.workers.dev?s=GC=F'

// CSV الجاهزة من المستودع (صدقَي حالة الأحرف)
const DEFAULT_5MIN   = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_5min.csv';
const DEFAULT_HOURLY = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_hourly.csv';
const DEFAULT_DAILY  = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_live.csv';

// Stooq عبر بروكسي يفتح CORS
const PROXY = 'https://r.jina.ai/http://';
const STOOQ_LIVE_CSV   = PROXY + 'stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv'; // صف حي
const STOOQ_DAILY_OHLC = PROXY + 'stooq.com/q/d/l/?s=xauusd&i=d';                 // OHLC يومي

/**************** DOM ****************/
const els = {
  sourceSel:  document.getElementById('sourceSel'),
  csvUrl:     document.getElementById('csvUrl'),
  emaFast:    document.getElementById('emaFast'),
  emaSlow:    document.getElementById('emaSlow'),
  rsiPeriod:  document.getElementById('rsiPeriod'),
  runBtn:     document.getElementById('runBtn'),
  minuteBtn:  document.getElementById('minuteBtn'),
  hourBtn:    document.getElementById('hourBtn'),
  dayBtn:     document.getElementById('dayBtn'),
  livePrice:  document.getElementById('livePrice'),
  liveTs:     document.getElementById('liveTs'),
  summary:    document.getElementById('summary'),
  pivots:     document.getElementById('pivots'),
  tbody:      document.getElementById('tbody'),
};

/**************** أدوات مساعدة ****************/
const fmt = (n, d=2) => (n==null||!isFinite(n)) ? '—' : Number(n).toFixed(d);
const fmtTs = d => d instanceof Date && !isNaN(d) ? d.toISOString().replace('T',' ').slice(0,19).replace(' ','  ') : '—';
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

/** Parse CSV مرن: يدعم Date,Close أو Date,Time,Open,High,Low,Close */
function parseCSV(text){
  const out = [];
  const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if (!lines.length) return out;
  const hdr = lines[0].split(',').map(h=>h.trim().toLowerCase());
  const idx = (nameArr)=> nameArr.map(n=>hdr.indexOf(n)).find(i=>i>=0);

  const iDate = idx(['date']);
  const iTime = idx(['time']);
  const iDT   = idx(['datetime','timestamp','ts']);
  const iOpen = idx(['open','o']);
  const iHigh = idx(['high','h']);
  const iLow  = idx(['low','l']);
  const iClose= idx(['close','c','price']);

  for (let i=1;i<lines.length;i++){
    const cols = lines[i].split(',');
    let ts;
    if (iDT>=0) ts = new Date(cols[iDT]);
    else if (iDate>=0 && iTime>=0) ts = new Date(`${cols[iDate]}T${(cols[iTime]||'00:00:00')}Z`);
    else if (iDate>=0) ts = new Date(`${cols[iDate]}T00:00:00Z`);
    else continue;

    const row = {
      ts,
      open : iOpen>=0  ? parseFloat(cols[iOpen])  : null,
      high : iHigh>=0  ? parseFloat(cols[iHigh])  : null,
      low  : iLow>=0   ? parseFloat(cols[iLow])   : null,
      close: iClose>=0 ? parseFloat(cols[iClose]) : null,
    };
    if (row.close && isFinite(row.close)) out.push(row);
  }
  out.sort((a,b)=>a.ts-b.ts);
  return out;
}

/** مؤشرات: EMA / RSI / MACD */
function ema(values, period){
  const k = 2/(period+1), out = [];
  let prev = null;
  values.forEach((v,i)=>{
    if (v==null || !isFinite(v)) { out.push(null); return; }
    if (prev==null){
      const slice = values.slice(0,i+1).filter(x=>x!=null);
      if (slice.length<period){ out.push(null); return; }
      prev = slice.slice(-period).reduce((a,b)=>a+b,0)/period;
    }
    prev = v*k + prev*(1-k);
    out.push(prev);
  });
  return out;
}
function rsi(values, period=14){
  const out = Array(values.length).fill(null);
  let gains=0, losses=0;
  for (let i=1;i<values.length;i++){
    const ch = values[i]-values[i-1];
    if (i<=period){ if (ch>0) gains+=ch; else losses-=ch; if (i===period){ const rs=gains/Math.max(1e-9,losses); out[i]=100-100/(1+rs);} continue; }
    const g = ch>0?ch:0, l = ch<0?-ch:0;
    gains = (gains*(period-1)+g)/period;
    losses= (losses*(period-1)+l)/period;
    const rs=gains/Math.max(1e-9,losses);
    out[i]=100-100/(1+rs);
  }
  return out;
}
function macd(values, fast=12, slow=26, signalP=9){
  const emaF = ema(values, fast), emaS = ema(values, slow);
  const macdLine = values.map((_,i)=>(emaF[i]!=null&&emaS[i]!=null)? emaF[i]-emaS[i]: null);
  const signal = ema(macdLine, signalP);
  const hist = macdLine.map((v,i)=> (v!=null&&signal[i]!=null)? v-signal[i] : null);
  return {macdLine, signal, hist};
}

/** تجميع 5 دقائق → ساعة/يوم (OHLC) */
function aggregateFrom5min(rows){
  const hour=[], day=[]; let hb=null, db=null, lastH=null, lastD=null;
  for (const r of rows){
    const t = new Date(r.ts);
    const dKey=t.toISOString().slice(0,10), hKey=t.toISOString().slice(0,13);
    if (hKey!==lastH){ if(hb) hour.push({...hb}); hb={ts:new Date(hKey+':00:00Z'),open:r.close,high:r.close,low:r.close,close:r.close}; lastH=hKey;}
    else { hb.high=Math.max(hb.high,r.close); hb.low=Math.min(hb.low,r.close); hb.close=r.close; }
    if (dKey!==lastD){ if(db) day.push({...db}); db={ts:new Date(dKey+'T00:00:00Z'),open:r.close,high:r.close,low:r.close,close:r.close}; lastD=dKey;}
    else { db.high=Math.max(db.high,r.close); db.low=Math.min(db.low,r.close); db.close=r.close; }
  }
  if (hb) hour.push(hb); if (db) day.push(db);
  return {hour, day};
}

/** Pivot كلاسيكي من OHLC */
function calcPivots(o,h,l,c){
  const P=(h+l+c)/3;
  return {P,R1:2*P-l,S1:2*P-h,R2:P+(h-l),S2:P-(h-l),R3:h+2*(P-l),S3:l-2*(h-P)};
}

/**************** جلب السعر الحي ****************/
async function fetchLivePrice(){
  // Worker (اختياري):
  if (LIVE_JSON_URL){
    try{
      const r = await fetch(LIVE_JSON_URL, {cache:'no-store'});
      const j = await r.json();
      if (j && Number(j.price)) return {price:Number(j.price), ts:new Date()};
    }catch{}
  }
  // Stooq CSV (نأخذ آخر سطر صالح)
  try{
    const t = await (await fetch(STOOQ_LIVE_CSV, {cache:'no-store'})).text();
    const lines = t.split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !/^symbol/i.test(s));
    if (!lines.length) return {price:null, ts:new Date()};
    const last = lines[lines.length-1].split(',');
    const price = parseFloat(last[6]);
    const ts = new Date(`${last[1]}T${(last[2]||'00:00:00')}Z`);
    if (isFinite(price)) return {price, ts: isNaN(ts)? new Date(): ts};
  }catch{}
  return {price:null, ts:new Date()};
}

/**************** عرض الملخص/الدعم/الجدول ****************/
function renderSummary(title, series){
  const prices = series.map(r=>r.price);
  const ef = Number(els.emaFast.value)||12, es = Number(els.emaSlow.value)||26, rp = Number(els.rsiPeriod.value)||14;
  const emaF = ema(prices, ef), emaS = ema(prices, es), last = prices.at(-1);
  const rsiArr = rsi(prices, rp), rsiLast = rsiArr.at(-1);
  const {macdLine,signal,hist} = macd(prices, ef, es, 9);
  const macdLast = macdLine.at(-1), sigLast = signal.at(-1), histLast = hist.at(-1);

  // إشارة بسيطة:
  let signalTxt='حيادي', cls='warn';
  if (emaF.at(-1)!=null && emaS.at(-1)!=null){
    if (emaF.at(-1)>emaS.at(-1) && histLast>0 && rsiLast>50) { signalTxt='شراء'; cls='good'; }
    if (emaF.at(-1)<emaS.at(-1) && histLast<0 && rsiLast<50) { signalTxt='بيع';   cls='bad';  }
  }

  els.summary.innerHTML = `
    <div class="card" style="background:#0b1220;border:1px solid #253041">
      <div><span class="pill">${title}</span></div>
      <div class="${cls}" style="font-size:22px;margin-top:6px"><b>${signalTxt}</b></div>
      <div class="grid" style="margin-top:8px">
        <div><b>السعر</b><br>${fmt(last)}</div>
        <div><b>EMA(${ef})</b><br>${fmt(emaF.at(-1))}</div>
        <div><b>EMA(${es})</b><br>${fmt(emaS.at(-1))}</div>
        <div><b>RSI(${rp})</b><br>${fmt(rsiLast,1)}</div>
        <div><b>MACD</b><br>${fmt(macdLast,3)}</div>
        <div><b>Signal</b><br>${fmt(sigLast,3)}</div>
        <div><b>Hist</b><br>${fmt(histLast,3)}</div>
      </div>
    </div>
  `;
}
function renderPivots(p){
  if (!p){ els.pivots.innerHTML='—'; return; }
  els.pivots.innerHTML = `
    <div><b>P</b><br>${fmt(p.P)}</div>
    <div><b>R1</b><br>${fmt(p.R1)}</div>
    <div><b>R2</b><br>${fmt(p.R2)}</div>
    <div><b>R3</b><br>${fmt(p.R3)}</div>
    <div><b>S1</b><br>${fmt(p.S1)}</div>
    <div><b>S2</b><br>${fmt(p.S2)}</div>
    <div><b>S3</b><br>${fmt(p.S3)}</div>
  `;
}
function renderTable(series){
  const rows = series.slice(-50).reverse().map(r=>`<tr><td>${fmtTs(r.time)}</td><td>${fmt(r.price)}</td></tr>`).join('');
  els.tbody.innerHTML = rows || '<tr><td colspan="2">لا يوجد بيانات</td></tr>';
}

/**************** منطق الإطارات ****************/
let minuteSeries = []; // لآخر قراءات السعر الحي
async function tickLive(){
  const {price, ts} = await fetchLivePrice();
  if (price){
    els.livePrice.textContent = fmt(price);
    els.liveTs.textContent = fmtTs(ts);
    // دُخلي على السلسلة (max 300 نقطة تقريبًا)
    const last = minuteSeries.at(-1);
    if (!last || Math.abs((ts - last.time)/1000) >= 55) {
      minuteSeries.push({time:ts, price});
      if (minuteSeries.length>300) minuteSeries.shift();
      renderSummary('دقيقة (حي)', minuteSeries);
      renderTable(minuteSeries);
    } else {
      // نفس الدقائق: حدّث آخر نقطة
      minuteSeries[minuteSeries.length-1].price = price;
      renderSummary('دقيقة (حي)', minuteSeries);
      renderTable(minuteSeries);
    }
  }
}

async function loadCSV(url){
  const t = await (await fetch(url,{cache:'no-store'})).text();
  const rows = parseCSV(t);
  return rows.map(r=>({time:r.ts, price:r.close, open:r.open, high:r.high, low:r.low, close:r.close}));
}

async function runMinute(){
  //立即 تحديث ومن ثم كل 60 ثانية
  await tickLive();
}
async function runHour(url){
  // إذا أُعطي URL: استعمله، وإلا جرّبي افتراضي
  const u = url || DEFAULT_HOURLY;
  const rows = await loadCSV(u);
  renderSummary('ساعة', rows);
  renderTable(rows);
  // Pivot نحاول من يومي جاهز، أو من تجميع 5 دقايق إذا متوفر
  try{
    const t = await (await fetch(DEFAULT_DAILY,{cache:'no-store'})).text();
    const daily = parseCSV(t);
    const d = daily.at(-1);
    if (d && d.open!=null && d.high!=null) renderPivots(calcPivots(d.open,d.high,d.low,d.close));
    else renderPivots(null);
  }catch{ renderPivots(null); }
}
async function runDay(url){
  const u = url || DEFAULT_DAILY;
  const rows = await loadCSV(u);
  renderSummary('يوم', rows);
  renderTable(rows);

  // إذا كان الCSV اليومي Close فقط: جربّي Pivot من 5 دقائق بالتجميع
  let piv = null;
  const last = rows.at(-1);
  if (!last || last.open==null){
    try{
      const five = await loadCSV(DEFAULT_5MIN);
      const agg = aggregateFrom5min(five);
      const ld = agg.day.at(-1);
      if (ld) piv = calcPivots(ld.open, ld.high, ld.low, ld.close);
    }catch{}
  }
  renderPivots(piv);
}

/**************** حفظ رابط CSV وتشغيل الأزرار ****************/
els.csvUrl.value = localStorage.getItem('csv_url') || '';
els.csvUrl.addEventListener('change', ()=> localStorage.setItem('csv_url', els.csvUrl.value.trim()));

els.runBtn.addEventListener('click', async ()=>{
  const src = els.sourceSel.value;
  const url = (els.csvUrl.value||'').trim();
  if (src==='csv' && !url){ alert('من فضلك ألصق رابط CSV'); return; }

  if (src==='live'){ await runMinute(); }
  else { // csv
    if (/5min\.csv$/i.test(url)) {
      const five = await loadCSV(url);
      const agg = aggregateFrom5min(five);
      renderSummary('مُشتق من 5 دقائق (ساعة)', agg.hour.map(r=>({time:r.ts, price:r.close})));
      renderTable(agg.hour.map(r=>({time:r.ts, price:r.close})));
      const ld = agg.day.at(-1); renderPivots(ld? calcPivots(ld.open,ld.high,ld.low,ld.close): null);
    } else if (/hour/i.test(url)) {
      await runHour(url);
    } else { // اعتبره يومي
      await runDay(url);
    }
  }
});
els.minuteBtn.addEventListener('click', runMinute);
els.hourBtn.addEventListener('click', ()=> runHour( (els.csvUrl.value||'').trim() || DEFAULT_HOURLY ));
els.dayBtn.addEventListener('click',  ()=> runDay ( (els.csvUrl.value||'').trim() || DEFAULT_DAILY  ));

// تفعيل تحديث السعر الحي كل 60 ثانية تلقائيًا
tickLive();
setInterval(tickLive, 60_000);
