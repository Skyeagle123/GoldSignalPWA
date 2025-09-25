/************ إعداد الروابط (عدّلها إذا لزم) ************/
// لو عامل Cloudflare Worker لسعر GC=F حطّه هون (JSON: {price})
const LIVE_JSON_URL = ''; // مثال: 'https://goldprice-proxy.yourname.workers.dev?s=GC=F'

// CSV اليومي بصيغة Date,Close (الأرشيف اليومي)
const DAILY_CSV_URL  = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_live.csv';
// CSV الساعي بصيغة Date,Close (إذا ما عندك، رح نولّد من الدقيقة تلقائيًا)
const HOURLY_CSV_URL = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_hourly.csv';

// احتياطي سعر حي من Stooq (صف واحد: Symbol,Date,Time,Open,High,Low,Close,Volume)
const STOOQ_LIVE_CSV = 'https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv';
// OHLC يومي لحساب Pivot
const STOOQ_DAILY_OHLC = 'https://stooq.com/q/d/l/?s=xauusd&i=d';

/************ DOM ************/
const els = {
  csvUrl: document.getElementById('csvUrl'),
  sourceSel: document.getElementById('sourceSel'),
  runBtn: document.getElementById('runBtn'),
  table: document.getElementById('table'),
  summary: document.getElementById('summary'),
  livePrice: document.getElementById('livePrice'),
  liveTs: document.getElementById('liveTs'),
  srBox: document.getElementById('srBox'),
  tfMin: document.getElementById('tfMin'),
  tfHour: document.getElementById('tfHour'),
  tfDay: document.getElementById('tfDay'),
  chart: document.getElementById('chart'),
  emaFast: document.getElementById('emaFast'),
  emaSlow: document.getElementById('emaSlow'),
  rsiPeriod: document.getElementById('rsiPeriod'),
};

let curTF = 'm'; // m/h/d

/************ أدوات ************/
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const fmt = (n)=> (n==null || !isFinite(n)) ? '—' : Number(n).toFixed(2);
const toISO = (d)=> new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().replace('.000','');

function parseCSV(txt){
  const rows = txt.trim().split(/\r?\n/).map(r=>r.split(','));
  return rows;
}

function rowsToSeries_DateClose(rows){
  const out=[];
  for (let i=1;i<rows.length;i++){
    const d = rows[i][0];
    const c = parseFloat(rows[i][1]);
    if (!isFinite(c)) continue;
    const t = new Date(d.endsWith('Z') ? d : d+'Z');
    out.push({t, c});
  }
  out.sort((a,b)=>a.t-b.t);
  return out;
}

/************ مؤشرات ************/
function sma(arr, p){ const out=[]; let sum=0, q=[]; for(let i=0;i<arr.length;i++){ const v=arr[i]; q.push(v); sum+=v; if(q.length>p){sum-=q.shift()} out.push(q.length===p? sum/p : null) } return out }
function ema(arr, p){
  const k=2/(p+1), out=[]; let emaPrev;
  for(let i=0;i<arr.length;i++){
    const v = arr[i];
    if (v==null||!isFinite(v)){ out.push(null); continue }
    if (emaPrev==null){
      const w = arr.slice(Math.max(0,i-p+1), i+1).filter(x=>isFinite(x));
      if (w.length<p){ out.push(null); continue }
      emaPrev = w.reduce((a,b)=>a+b,0)/w.length;
    }
    emaPrev = v*k + emaPrev*(1-k);
    out.push(emaPrev);
  }
  return out;
}
function stdev(arr,p){
  const out=[], q=[];
  for(let i=0;i<arr.length;i++){
    const v=arr[i]; q.push(v); if(q.length>p) q.shift();
    if(q.length<p){ out.push(null); continue }
    const m = q.reduce((a,b)=>a+b,0)/p;
    const sd=Math.sqrt(q.reduce((a,b)=>a+(b-m)**2,0)/p);
    out.push(sd);
  }
  return out;
}
function rsi(cl,p=14){
  if (cl.length<=p) return new Array(cl.length).fill(null);
  const out = new Array(cl.length).fill(null);
  let gains=0, losses=0;
  for(let i=1;i<=p;i++){ const ch=cl[i]-cl[i-1]; if(ch>0) gains+=ch; else losses-=ch; }
  let avgG=gains/p, avgL=losses/p;
  out[p] = avgL===0? 100 : 100 - 100/(1+avgG/avgL);
  for(let i=p+1;i<cl.length;i++){
    const ch=cl[i]-cl[i-1];
    const g=Math.max(ch,0), l=Math.max(-ch,0);
    avgG=(avgG*(p-1)+g)/p; avgL=(avgL*(p-1)+l)/p;
    out[i] = avgL===0? 100 : 100 - 100/(1+avgG/avgL);
  }
  return out;
}
function macd(cl, fast=12, slow=26, signalP=9){
  const eF=ema(cl,fast), eS=ema(cl,slow);
  const line = cl.map((_,i)=> (eF[i]!=null&&eS[i]!=null)? eF[i]-eS[i] : null);
  const signal = ema(line.map(x=>x??NaN), signalP);
  const hist = line.map((x,i)=> (x!=null&&signal[i]!=null)? x-signal[i] : null);
  return {line, signal, hist};
}
function bollinger(cl, p=20, mult=2){
  const mid=sma(cl,p), sd=stdev(cl,p);
  const up=cl.map((_,i)=> (mid[i]!=null&&sd[i]!=null)? mid[i]+mult*sd[i] : null);
  const lo=cl.map((_,i)=> (mid[i]!=null&&sd[i]!=null)? mid[i]-mult*sd[i] : null);
  return {mid, up, lo};
}
function pivotsClassic({high,low,close}){
  const P=(high+low+close)/3;
  return { P, R1:2*P-low, S1:2*P-high, R2:P+(high-low), S2:P-(high-low), R3:high+2*(P-low), S3:low-2*(high-P) };
}

/************ جلب السعر ************/
async function fetchLivePrice(){
  // 1) Worker JSON
  if (LIVE_JSON_URL) {
    try{
      const r = await fetch(LIVE_JSON_URL, {cache:'no-store'});
      const j = await r.json();
      if (j && Number(j.price)) return {price:Number(j.price), ts:new Date()};
    }catch{}
  }
  // 2) Stooq CSV
  try{
    const t = await (await fetch(STOOQ_LIVE_CSV, {cache:'no-store'})).text();
    const line = (t.split('\n')[1]||'').trim();
    const cols = line.split(',');
    const p = parseFloat(cols[6]);
    if (isFinite(p)) return {price:p, ts:new Date()};
  }catch{}
  return {price:null, ts:new Date()};
}

async function fetchDailyOHLC(){
  const txt = await (await fetch(STOOQ_DAILY_OHLC, {cache:'no-store'})).text();
  const rows = parseCSV(txt); // Date,Open,High,Low,Close
  if (rows.length<3) return null;
  const prev = rows[rows.length-2], last = rows[rows.length-1];
  return {
    prev: { date:prev[0], open:+prev[1], high:+prev[2], low:+prev[3], close:+prev[4] },
    last: { date:last[0], open:+last[1], high:+last[2], low:+last[3], close:+last[4] },
  };
}

/************ بيانات الشارت ************/
let dataM=[], dataH=[], dataD=[];
let liveTimer=null, chart=null;

function ensureChart(){
  if (chart) return;
  chart = new Chart(els.chart, {
    type:'line',
    data:{ datasets:[
      {label:'السعر',   data:[], borderColor:'#4cc9f0', pointRadius:0, tension:.2},
      {label:'EMA سريع',data:[], borderColor:'#22c55e', pointRadius:0, tension:.2, borderDash:[4,4]},
      {label:'EMA بطيء',data:[], borderColor:'#f59e0b', pointRadius:0, tension:.2, borderDash:[6,6]},
      {label:'BB أعلى', data:[], borderColor:'#6ee7b7', pointRadius:0, tension:.2, borderDash:[2,6]},
      {label:'BB وسط',  data:[], borderColor:'#94a3b8', pointRadius:0, tension:.2, borderDash:[2,6]},
      {label:'BB أسفل', data:[], borderColor:'#fca5a5', pointRadius:0, tension:.2, borderDash:[2,6]},
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      parsing:false,
      scales:{
        x:{type:'time', time:{unit:'minute'}, grid:{color:'#273449'}, ticks:{color:'#93a3b8'}},
        y:{grid:{color:'#273449'}, ticks:{color:'#93a3b8'}}
      },
      plugins:{ legend:{labels:{color:'#cbd5e1'}}, tooltip:{mode:'index', intersect:false} }
    }
  });
}
function setTimeUnit(){
  const unit = (curTF==='m')?'minute': (curTF==='h')?'hour':'day';
  chart.options.scales.x.time.unit = unit;
}

function updateChart(rows){
  const closes = rows.map(r=>r.c);
  const fast = Number(els.emaFast.value)||12;
  const slow = Number(els.emaSlow.value)||26;
  const rsiP = Number(els.rsiPeriod.value)||14;

  const eF = ema(closes, fast);
  const eS = ema(closes, slow);
  const bb = bollinger(closes, 20, 2);
  const points = rows.map(r=>({x:r.t, y:r.c}));

  chart.data.datasets[0].data = points;
  chart.data.datasets[1].data = rows.map((r,i)=> eF[i]!=null? {x:r.t,y:eF[i]} : null).filter(Boolean);
  chart.data.datasets[2].data = rows.map((r,i)=> eS[i]!=null? {x:r.t,y:eS[i]} : null).filter(Boolean);
  chart.data.datasets[3].data = rows.map((r,i)=> bb.up[i]!=null? {x:r.t,y:bb.up[i]} : null).filter(Boolean);
  chart.data.datasets[4].data = rows.map((r,i)=> bb.mid[i]!=null? {x:r.t,y:bb.mid[i]} : null).filter(Boolean);
  chart.data.datasets[5].data = rows.map((r,i)=> bb.lo[i]!=null? {x:r.t,y:bb.lo[i]} : null).filter(Boolean);
  chart.update('none');

  // صناديق الملخص + الجدول
  updateSummary(rows, {rsiP, fast, slow});
  renderTable(rows);
}

function computeSignals(rows, {rsiP, fast, slow}){
  const closes = rows.map(r=>r.c);
  const _rsi = rsi(closes, rsiP);
  const _macd = macd(closes, fast, slow, 9);
  const last = rows[rows.length-1];

  const ef = ema(closes, fast)[closes.length-1];
  const es = ema(closes, slow)[closes.length-1];

  let bias='حيادي', notes=[];
  if (last && ef!=null && es!=null){
    if (last.c>ef && ef>es) { bias='شراء'; notes.push('ترند صاعد (سعر>EMA سريع>EMA بطيء)'); }
    if (last.c<ef && ef<es) { bias='بيع';  notes.push('ترند هابط (سعر<EMA سريع<EMA بطيء)'); }
  }
  const i=closes.length-1;
  if (_rsi[i]!=null){
    if (_rsi[i]>70) notes.push('تشبّع شرائي RSI>70');
    if (_rsi[i]<30) notes.push('تشبّع بيعي RSI<30');
  }
  if (_macd.signal[i]!=null && _macd.signal[i-1]!=null && _macd.line[i]!=null && _macd.line[i-1]!=null){
    const prev = _macd.line[i-1]-_macd.signal[i-1];
    const now  = _macd.line[i]-_macd.signal[i];
    if (prev<=0 && now>0) notes.push('تقاطع MACD صعودي');
    if (prev>=0 && now<0) notes.push('تقاطع MACD هبوطي');
  }
  return {bias, notes, rsi: _rsi[i], macdLine:_macd.line[i], macdSignal:_macd.signal[i], emaFast:ef, emaSlow:es};
}

function updateSummary(rows, opts){
  const s = computeSignals(rows, opts);
  els.summary.innerHTML = `
    <div class="card">
      <div class="signal">الإطار: <span class="pill">${curTF==='m'?'دقيقة':curTF==='h'?'ساعة':'يوم'}</span></div>
      <div class="signal">الإشارة: <strong class="${s.bias==='شراء'?'good':s.bias==='بيع'?'bad':'warn'}">${s.bias}</strong></div>
      <div class="signal">RSI: ${fmt(s.rsi)} | MACD: ${fmt(s.macdLine)} / ${fmt(s.macdSignal)}</div>
      <div class="signal">EMA سريع/بطيء: ${fmt(s.emaFast)} / ${fmt(s.emaSlow)}</div>
      <ul class="signal" style="margin:6px 18px">${s.notes.map(n=>`<li>${n}</li>`).join('')}</ul>
    </div>
  `;
}

function renderTable(rows){
  const head = ['Date','Close'];
  els.table.querySelector('thead').innerHTML = `<tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const last50 = rows.slice(-50);
  els.table.querySelector('tbody').innerHTML = last50.map(r=>(
    `<tr><td>${toISO(r.t)}</td><td>${fmt(r.c)}</td></tr>`
  )).join('');
}

/************ Pivot S/R ************/
async function updateSR(){
  try{
    const d = await fetchDailyOHLC();
    if (!d?.prev){ els.srBox.textContent='—'; return; }
    const p = pivotsClassic(d.prev);
    els.srBox.innerHTML = `
      <span class="pill">Pivot S/R (يومي)</span>
      <div style="margin-top:8px">
        S3: <strong>${fmt(p.S3)}</strong> · S2: <strong>${fmt(p.S2)}</strong> · S1: <strong>${fmt(p.S1)}</strong> ·
        P: <strong>${fmt(p.P)}</strong> ·
        R1: <strong>${fmt(p.R1)}</strong> · R2: <strong>${fmt(p.R2)}</strong> · R3: <strong>${fmt(p.R3)}</strong>
      </div>`;
  }catch{ els.srBox.textContent='—'; }
}

/************ Minute stream ************/
async function tickLive(){
  const {price, ts} = await fetchLivePrice();
  if (price!=null){
    const tKey = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate(), ts.getUTCHours(), ts.getUTCMinutes(), 0));
    if (dataM.length && Math.abs(dataM[dataM.length-1].t - tKey) < 60*1000){
      dataM[dataM.length-1] = {t:tKey, c:price};
    } else {
      dataM.push({t:tKey, c:price});
      if (dataM.length>720) dataM = dataM.slice(-720); // آخر 12 ساعة
    }
    els.livePrice.textContent = fmt(price);
    els.liveTs.textContent = toISO(ts);
    if (curTF==='m' && chart) updateChart(dataM);
  }
}

/************ تحميل CSVات الإطار الأعلى ************/
async function loadHourlyDaily(){
  // حاول تحميل الساعي/اليومي من الروابط، لو فشل نولّدهم من الدقيقة لاحقًا
  try{
    const txtH = await (await fetch(HOURLY_CSV_URL, {cache:'no-store'})).text();
    dataH = rowsToSeries_DateClose(parseCSV(txtH));
  }catch{ dataH=[] }
  try{
    const txtD = await (await fetch(DAILY_CSV_URL, {cache:'no-store'})).text();
    dataD = rowsToSeries_DateClose(parseCSV(txtD));
  }catch{ dataD=[] }
}

/************ تبديل الإطار ************/
function setTF(tf){
  curTF = tf;
  setTimeUnit();
  if (tf==='m')       updateChart(dataM);
  else if (tf==='h')  updateChart(dataH.length? dataH : aggregateToHour(dataM));
  else                updateChart(dataD.length? dataD : aggregateToDay(dataM));
}
function aggregateToHour(rows){
  // نأخذ آخر قيمة بكل ساعة
  const map = new Map();
  rows.forEach(r=>{
    const k = new Date(Date.UTC(r.t.getUTCFullYear(), r.t.getUTCMonth(), r.t.getUTCDate(), r.t.getUTCHours(), 0, 0)).toISOString();
    map.set(k, r.c);
  });
  return Array.from(map.entries()).map(([k,c])=>({t:new Date(k), c}));
}
function aggregateToDay(rows){
  const map = new Map();
  rows.forEach(r=>{
    const k = new Date(Date.UTC(r.t.getUTCFullYear(), r.t.getUTCMonth(), r.t.getUTCDate(), 0,0,0)).toISOString();
    map.set(k, r.c);
  });
  return Array.from(map.entries()).map(([k,c])=>({t:new Date(k), c}));
}

/************ تشغيل عام ************/
async function boot(){
  ensureChart();
  await loadHourlyDaily();
  await updateSR();

  // أول جلب حي + مؤقّت كل 60 ثانية
  await tickLive();
  liveTimer && clearInterval(liveTimer);
  liveTimer = setInterval(tickLive, 60_000);

  // افتراضي على “دقيقة”
  setTF('m');
}
boot();

/************ زر “حساب الإشارات الآن” للـCSV اليدوي ************/
els.runBtn.addEventListener('click', async ()=>{
  const src = els.sourceSel.value;
  if (src!=='csv'){
    // إعادة رسم بالإعدادات الحالية فقط
    setTF(curTF); 
    return;
  }
  const url = (els.csvUrl.value||'').trim();
  if (!url){ alert('إلصق رابط CSV بصيغة Date,Close'); return; }
  try{
    const txt = await (await fetch(url, {cache:'no-store'})).text();
    const rows = rowsToSeries_DateClose(parseCSV(txt));
    // اعرض الملف في الجدول والشارت (نفس الإطار الحالي)
    if (!rows.length){ alert('CSV فارغ أو غير مدعوم. لازم رأس الأعمدة: Date,Close'); return; }
    if (curTF==='m') dataM = rows; else if (curTF==='h') dataH = rows; else dataD = rows;
    updateChart(rows);
  }catch(e){
    alert('تعذّر تحميل CSV'); 
  }
});

/************ أزرار الإطارات ************/
if (els.tfMin && els.tfHour && els.tfDay){
  const act = (b)=>{ [els.tfMin,els.tfHour,els.tfDay].forEach(x=>x.classList.remove('good')); b.classList.add('good'); };
  els.tfMin.onclick  = ()=>{ act(els.tfMin);  setTF('m'); };
  els.tfHour.onclick = ()=>{ act(els.tfHour); setTF('h'); };
  els.tfDay.onclick  = ()=>{ act(els.tfDay);  setTF('d'); };
  // فعّل “دقيقة” افتراضي
  act(els.tfMin);
}
