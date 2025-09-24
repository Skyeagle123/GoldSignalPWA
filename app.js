
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.style.display = 'block';
});
document.getElementById('installBtn')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installBtn').style.display = 'none';
});

async function fetchCSVFromUrl(url){
  const res = await fetch(url, {cache:'no-store'});
  if(!res.ok) throw new Error('تعذّر تحميل CSV');
  const text = await res.text();
  return parseCSV(text);
}

function parseCSV(text){
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',').map(s=>s.trim());
  const dateIdx = header.findIndex(h=>/date/i.test(h));
  const closeIdx = header.findIndex(h=>/(close|price|adj close)/i.test(h));
  const rows = [];
  for (let i=1;i<lines.length;i++){
    const cols = lines[i].split(',').map(s=>s.trim());
    const d = new Date(cols[dateIdx]);
    const c = parseFloat(cols[closeIdx]);
    if(!isNaN(d) && !isNaN(c)) rows.push({date:d, close:c});
  }
  rows.sort((a,b)=>a.date - b.date);
  return rows;
}

function ema(values, period){
  const k = 2/(period+1);
  let emaArr = [];
  let prev;
  for (let i=0;i<values.length;i++){
    const v = values[i];
    if(i===0){ prev = v; emaArr.push(v); }
    else { prev = v * k + prev * (1-k); emaArr.push(prev); }
  }
  return emaArr;
}

function rsi(closes, period=14){
  let gains = [], losses = [];
  for(let i=1;i<closes.length;i++){
    const diff = closes[i] - closes[i-1];
    gains.push(Math.max(0,diff));
    losses.push(Math.max(0,-diff));
  }
  function sma(arr,p){
    let out=[], sum=0;
    for(let i=0;i<arr.length;i++){
      sum += arr[i];
      if(i>=p) sum -= arr[i-p];
      if(i>=p-1) out.push(sum/p);
    }
    return out;
  }
  const avgG = sma(gains, period);
  const avgL = sma(losses, period);
  let rsiArr=[];
  for(let i=0;i<avgG.length;i++){
    const rs = avgL[i]===0 ? 100 : avgG[i]/avgL[i];
    const val = 100 - (100/(1+rs));
    rsiArr.push(val);
  }
  // pad to match length
  return Array(closes.length - rsiArr.length).fill(null).concat(rsiArr);
}

function macd(closes, fast=12, slow=26, signal=9){
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((v,i)=> v - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const hist = macdLine.map((v,i)=> v - signalLine[i]);
  return {macdLine, signalLine, hist};
}

function bollinger(closes, period=20, mult=2){
  let out=[];
  let sum=0, sumSq=0;
  for(let i=0;i<closes.length;i++){
    sum += closes[i];
    sumSq += closes[i]*closes[i];
    if(i>=period){
      sum -= closes[i-period];
      sumSq -= closes[i-period]*closes[i-period];
    }
    if(i>=period-1){
      const mean = sum/period;
      const variance = (sumSq/period) - mean*mean;
      const sd = Math.sqrt(Math.max(variance,0));
      out.push({mid:mean, upper:mean+mult*sd, lower:mean-mult*sd});
    }else{
      out.push({mid:null, upper:null, lower:null});
    }
  }
  return out;
}

function makeSignals(dates, closes, cfg){
  const emaFastArr = ema(closes, cfg.emaFast);
  const emaSlowArr = ema(closes, cfg.emaSlow);
  const rsiArr    = rsi(closes, cfg.rsiPeriod);
  const {macdLine, signalLine, hist} = macd(closes, cfg.emaFast, cfg.emaSlow, 9);
  const bb = bollinger(closes, 20, 2);

  const out = [];
  for(let i=1;i<closes.length;i++){
    const price = closes[i];
    const trendUp = emaFastArr[i] > emaSlowArr[i];
    const macdUp  = macdLine[i] > signalLine[i];
    const rsiVal  = rsiArr[i];
    const nearLower = bb[i].lower && price < bb[i].lower;
    const nearUpper = bb[i].upper && price > bb[i].upper;

    let signal = "حياد", score = 0, color="warn";
    if(trendUp && macdUp && rsiVal!==null && rsiVal<70){ signal="شراء", score=+2, color="good"; }
    if(!trendUp && !macdUp && rsiVal!==null && rsiVal>30){ signal="بيع", score=-2, color="bad"; }
    if(nearLower) { signal="شراء (بولنجر)", score+=1; color="good"; }
    if(nearUpper) { signal="بيع (بولنجر)", score-=1; color="bad"; }

    out.push({date:dates[i], price, signal, score, rsi:rsiVal, macd:macdLine[i], macdSig:signalLine[i], emaF:emaFastArr[i], emaS:emaSlowArr[i]});
  }
  return out;
}

function renderTable(signals){
  const thead = document.querySelector('#table thead');
  const tbody = document.querySelector('#table tbody');
  thead.innerHTML = `<tr>
    <th>التاريخ</th><th>السعر</th><th>الإشارة</th><th>RSI</th><th>MACD</th><th>EMA F</th><th>EMA S</th>
  </tr>`;
  tbody.innerHTML = signals.slice(-120).reverse().map(r=>`
    <tr>
      <td>${r.date.toISOString().slice(0,10)}</td>
      <td>${r.price.toFixed(2)}</td>
      <td class="signal">${r.signal}</td>
      <td>${r.rsi ? r.rsi.toFixed(1) : '-'}</td>
      <td>${r.macd.toFixed(4)}</td>
      <td>${r.emaF.toFixed(2)}</td>
      <td>${r.emaS.toFixed(2)}</td>
    </tr>
  `).join('');
}

function renderSummary(latest){
  const sum = document.getElementById('summary');
  sum.innerHTML = `
    <div class="card">
      <div class="pill">آخر تحديث: ${latest.date.toISOString().slice(0,10)}</div>
      <h2 style="margin:8px 0 4px">${latest.signal}</h2>
      <div>السعر: <b>${latest.price.toFixed(2)}</b> • RSI: <b>${latest.rsi ? latest.rsi.toFixed(1) : '-'}</b> • MACD: <b>${latest.macd.toFixed(4)}</b></div>
      <div style="opacity:.7;margin-top:6px">* ليست توصية استثمارية</div>
    </div>
  `;
}

async function loadDemo(){
  const res = await fetch('XAUUSD_demo.csv', {cache:'no-store'});
  const text = await res.text();
  return parseCSV(text);
}

async function run(){
  const source = document.getElementById('sourceSel').value;
  const emaFast = parseInt(document.getElementById('emaFast').value||'12',10);
  const emaSlow = parseInt(document.getElementById('emaSlow').value||'26',10);
  const rsiPeriod = parseInt(document.getElementById('rsiPeriod').value||'14',10);
  let series;
  if(source==='csv'){
    const url = document.getElementById('csvUrl').value.trim();
    if(!url){ alert('يرجى إدخال رابط CSV'); return; }
    series = await fetchCSVFromUrl(url);
  }else{
    series = await loadDemo();
  }
  const dates = series.map(r=>r.date);
  const closes = series.map(r=>r.close);
  const sigs = makeSignals(dates, closes, {emaFast, emaSlow, rsiPeriod});
  if(!sigs.length){ alert('لا توجد بيانات كافية'); return; }
  renderTable(sigs);
  renderSummary(sigs[sigs.length-1]);
}

document.getElementById('runBtn').addEventListener('click', ()=>{
  run().catch(err=> alert('خطأ: '+err.message));
});

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
