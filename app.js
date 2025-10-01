/* =========================
   GoldSignals – app.js (v20)
   ========================= */

const $ = (id)=>document.getElementById(id);
const nf2 = new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2,minimumFractionDigits:2});
const nf4 = new Intl.NumberFormat('ar-EG',{maximumFractionDigits:4,minimumFractionDigits:2});

const DEFAULT_CSV = 'XAUUSD_5min.csv';        // ملف الـCSV المحلي للجذر
const LIVE_REFRESH_SEC = 30;                   // تحديث السعر الحي (ثواني)

// تخزين رابط CSV محلياً
const LS_KEY = 'gs_csv_url';
const csvInput = $('csvInput');
if (csvInput){
  const saved = localStorage.getItem(LS_KEY)||'';
  if (!csvInput.value && saved) csvInput.value = saved;
  csvInput.addEventListener('input', ()=> {
    const v = (csvInput.value||'').trim();
    if (v) localStorage.setItem(LS_KEY, v);
    else localStorage.removeItem(LS_KEY);
  });
}

// أدوات وقت
const tzFmt = new Intl.DateTimeFormat('ar-EG',{hour12:false, timeStyle:'medium', dateStyle:undefined});
function fmtDate(t){ const d=new Date(t); return d.toLocaleDateString('ar-EG'); }
function fmtTime(t){ const d=new Date(t); return tzFmt.format(d); }

// قراءة CSV (رابط خارجي أو من نفس الجذر)
function repoCsvURL(name = DEFAULT_CSV){
  const u = new URL(name, location.href).toString();
  return u + (u.includes('?')?'&':'?') + 'v=' + Date.now(); // اكسر الكاش
}

async function fetchCSVText(){
  const urlField = (csvInput?.value||'').trim();
  let url;
  if (urlField) url = urlField;
  else url = repoCsvURL(DEFAULT_CSV);
  const res = await fetch(url, {cache:'no-store'});
  if (!res.ok) throw new Error('تعذّر تحميل CSV: '+res.status);
  return await res.text();
}

function parseCsvToBars(text){
  // يدعم: Date,Time,Open,High,Low,Close  أو  timestamp,open,high,low,close
  const lines = text.trim().split(/\r?\n/);
  if (lines.length<2) return [];
  const header = lines[0].toLowerCase();
  const out = [];
  for(let i=1;i<lines.length;i++){
    const c = lines[i].split(',');
    if (c.length<5) continue;
    if (header.includes('date') && header.includes('time')){
      const [date,time,open,high,low,close] = c;
      // إذا التاريخ بصيغة US استخدمه كما هو، وإلا أضف UTC
      const t = Date.parse(`${date} ${time} UTC`);
      out.push({t, open:+open, high:+high, low:+low, close:+close});
    }else if(header.includes('timestamp')){
      const [ts,open,high,low,close]=c;
      out.push({t:+ts, open:+open, high:+high, low:+low, close:+close});
    }else{
      // fallback
      const t = Date.parse(c[0]) || Date.now();
      const open=+c[1], high=+c[2], low=+c[3], close=+c[4];
      out.push({t, open, high, low, close});
    }
  }
  out.sort((a,b)=>a.t-b.t);
  return out;
}

// مؤشرات
function ema(bars, p, sel=(b)=>b.close){
  let k=2/(p+1); let emaVal; const res=[];
  for (let i=0;i<bars.length;i++){
    const v = sel(bars[i]);
    if (i===0) emaVal=v;
    else emaVal = v*k + emaVal*(1-k);
    res.push(emaVal);
  }
  return res.at(-1);
}
function calcRSI(bars, p=14){
  const closes = bars.map(b=>b.close);
  let gains=0, losses=0;
  for(let i=1;i<=p;i++){
    const ch = closes[i]-closes[i-1];
    if (ch>0) gains+=ch; else losses-=ch;
  }
  gains/=p; losses/=p;
  let rs = losses===0? 100 : gains/losses;
  let rsi = 100 - (100/(1+rs));
  for(let i=p+1;i<closes.length;i++){
    const ch = closes[i]-closes[i-1];
    const g = ch>0?ch:0, l = ch<0?-ch:0;
    gains = (gains*(p-1)+g)/p;
    losses= (losses*(p-1)+l)/p;
    rs = losses===0? 100 : gains/losses;
    rsi = 100 - (100/(1+rs));
  }
  return rsi;
}
function ATR(bars, p=14){
  if (bars.length<2) return NaN;
  const tr = [];
  for(let i=1;i<bars.length;i++){
    const b=bars[i], prev=bars[i-1];
    const a=b.high-b.low;
    const b1=Math.abs(b.high-prev.close);
    const c=Math.abs(b.low-prev.close);
    tr.push(Math.max(a,b1,c));
  }
  // SMA
  let sum=0; for(let i=0;i<tr.length;i++){ sum+=tr[i]; if(i===p-1) break; }
  if (tr.length<p) return sum/Math.max(1,tr.length);
  let atr=sum/p;
  for(let i=p;i<tr.length;i++) atr = (atr*(p-1)+tr[i])/p;
  return atr;
}
function sma(arr, p, sel=(b)=>b.close){
  const out=[]; let sum=0;
  for(let i=0;i<arr.length;i++){
    sum+=sel(arr[i]);
    if(i>=p) sum-=sel(arr[i-p]);
    out.push(i>=p-1? sum/p : NaN);
  }
  return out;
}
function bollinger(arr, period=20, stdMul=2, sel=(b)=>b.close){
  const mid = sma(arr, period, sel);
  const upper=[], lower=[];
  for(let i=0;i<arr.length;i++){
    if(i<period-1){ upper.push(NaN); lower.push(NaN); continue; }
    const w = arr.slice(i-period+1,i+1).map(sel);
    const m = mid[i];
    const variance = w.reduce((s,v)=>s+(v-m)*(v-m),0)/w.length;
    const stdev = Math.sqrt(variance);
    upper.push(m+stdMul*stdev);
    lower.push(m-stdMul*stdev);
  }
  return {mid,upper,lower};
}
function stochastic(arr, kPeriod=14, dPeriod=3){
  const close=arr.map(b=>b.close);
  const high=arr.map(b=>b.high);
  const low =arr.map(b=>b.low);
  const K=[], D=[];
  for(let i=0;i<arr.length;i++){
    if(i<kPeriod-1){ K.push(NaN); D.push(NaN); continue; }
    const lo = Math.min(...low.slice(i-kPeriod+1,i+1));
    const hi = Math.max(...high.slice(i-kPeriod+1,i+1));
    const k = hi===lo? 50 : ((close[i]-lo)/(hi-lo))*100;
    K.push(k);
    if(i<kPeriod-1+dPeriod-1) { D.push(NaN); continue; }
    const d = K.slice(i-dPeriod+1,i+1).reduce((s,v)=>s+v,0)/dPeriod;
    D.push(d);
  }
  return {K,D};
}

// Pivot (NY) من آخر يوم مكتمل (استخراج H/L/C لذلك اليوم)
function nyPivotLevels(bars){
  if (!bars.length) return {};
  // افترض أن bar.t بتوقيت UTC؛ نحسب يوم نيويورك (UTC-4/-5) تقريبيًا: نزيح 4 ساعات
  const shiftMs = 4*60*60*1000; // تبسيط
  const byDay = new Map();
  for(const b of bars){
    const d = new Date(b.t - shiftMs);
    d.setHours(0,0,0,0);
    const key = d.getTime();
    const arr = byDay.get(key)||[];
    arr.push(b); byDay.set(key,arr);
  }
  const days = Array.from(byDay.keys()).sort((a,b)=>a-b);
  if (days.length<2) return {};
  const prev = byDay.get(days.at(-2)); // اليوم المكتمل السابق
  const high = Math.max(...prev.map(b=>b.high));
  const low  = Math.min(...prev.map(b=>b.low));
  const close= prev.at(-1).close;
  const P = (high+low+close)/3;
  const R1 = 2*P - low;
  const S1 = 2*P - high;
  const R2 = P + (high-low);
  const S2 = P - (high-low);
  const R3 = high + 2*(P-low);
  const S3 = low  - 2*(high-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

// رسم الشموع + بولنغر + خط السعر الحي
function drawChart(bars, lines){
  const cv = $('chart');
  if(!cv || !bars?.length) return;

  const dpr = window.devicePixelRatio || 1;
  const cssW = cv.clientWidth || 700, cssH = cv.clientHeight || 360;
  if (cv.width !== Math.floor(cssW*dpr) || cv.height !== Math.floor(cssH*dpr)){
    cv.width = Math.floor(cssW*dpr); cv.height = Math.floor(cssH*dpr);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);

  const pad=28, W=cssW-pad*2, H=cssH-pad*2;
  const n = bars.length;
  const min = Math.min(...bars.map(b=>b.low));
  const max = Math.max(...bars.map(b=>b.high));
  const x = i => pad + (i/(n-1))*W;
  const y = p => pad + (1-(p-min)/Math.max(1e-9,(max-min)))*H;

  // الشموع
  const bodyW = Math.max(1, W/n * 0.6);
  for (let i=0;i<n;i++){
    const b = bars[i];
    const xx = x(i);
    // wick
    ctx.strokeStyle = (b.close>=b.open) ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xx, y(b.high));
    ctx.lineTo(xx, y(b.low));
    ctx.stroke();
    // body
    const top = y(Math.max(b.open,b.close));
    const bot = y(Math.min(b.open,b.close));
    const h = Math.max(1, bot-top);
    ctx.fillStyle = (b.close>=b.open) ? '#22c55e' : '#ef4444';
    ctx.fillRect(xx - bodyW/2, top, bodyW, h);
  }

  // بولنغر
  if (lines?.bb){
    const {upper,mid,lower} = lines.bb;
    const drawLine = (arr, stroke) =>{
      ctx.strokeStyle = stroke; ctx.lineWidth=1.2; ctx.beginPath();
      let first=true;
      for (let i=0;i<n;i++){
        const v = arr[i]; if(!isFinite(v)) continue;
        const xx=x(i), yy=y(v);
        if(first){ ctx.moveTo(xx,yy); first=false; } else ctx.lineTo(xx,yy);
      }
      ctx.stroke();
    };
    // ظل بين upper/lower
    ctx.beginPath(); let started=false;
    for(let i=0;i<n;i++){ const v=upper[i]; if(!isFinite(v)) continue;
      const xx=x(i), yy=y(v); if(!started){ctx.moveTo(xx,yy); started=true;} else ctx.lineTo(xx,yy);
    }
    for(let i=n-1;i>=0;i--){ const v=lower[i]; if(!isFinite(v)) continue;
      const xx=x(i), yy=y(v); ctx.lineTo(xx,yy);
    }
    ctx.closePath(); ctx.globalAlpha=0.08; ctx.fillStyle='#60a5fa'; ctx.fill(); ctx.globalAlpha=1;

    drawLine(upper,'#3b82f6');
    drawLine(mid  ,'#93c5fd');
    drawLine(lower,'#3b82f6');
  }

  // خط السعر الحي (أبيض متقطّع)
  if (Number.isFinite(window.__livePrice)){
    ctx.setLineDash([6,6]); ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.5;
    const yy = y(window.__livePrice);
    ctx.beginPath(); ctx.moveTo(pad,yy); ctx.lineTo(pad+W,yy); ctx.stroke();
    ctx.setLineDash([]);
  }

  // خطوط Entry/TP/SL
  const hLine=(val,color)=>{ if(!isFinite(val)) return;
    ctx.strokeStyle=color; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(pad, y(val)); ctx.lineTo(pad+W, y(val)); ctx.stroke();
  };
  hLine(lines?.entry,'#60a5fa'); // أزرق
  hLine(lines?.tp1,'#22c55e');  // أخضر
  hLine(lines?.tp2,'#22c55e');
  hLine(lines?.sl ,'#f43f5e');  // أحمر
}

// تحليل أساسي + نصيحة
function makeDecision(base){
  // مثال بسيط: تقاطع EMA + نطاق ATR + RSI
  const rsiP = +$('rsiPeriod').value || 14;
  const eF = +$('emaFast').value || 12;
  const eS = +$('emaSlow').value || 26;
  const atrP= +$('atrPeriod').value || 14;
  const slM = +$('slMult').value || 1.5;
  const t1M = +$('tp1Mult').value || 1.0;
  const t2M = +$('tp2Mult').value || 2.0;
  const atrMin= +$('atrMinPct').value || 0.05;
  const atrMax= +$('atrMaxPct').value || 0.8;

  const last = base.at(-1);
  if (!last) return { text:'—' };

  const rsiVal = calcRSI(base, rsiP);
  const emaF = ema(base, eF);
  const emaS = ema(base, eS);
  const atr  = ATR(base, atrP);
  const atrPct = atr/last.close;

  let side = 'لا توجد إشارة حالياً';
  let entry, sl, tp1, tp2;

  if (emaF>emaS && rsiVal>50 && atrPct>=atrMin && atrPct<=atrMax){
    side = 'شراء (افتراضي)';
    entry = last.close;
    sl = entry - slM*atr;
    tp1= entry + t1M*atr;
    tp2= entry + t2M*atr;
  }else if (emaF<emaS && rsiVal<50 && atrPct>=atrMin && atrPct<=atrMax){
    side = 'بيع (افتراضي)';
    entry = last.close;
    sl = entry + slM*atr;
    tp1= entry - t1M*atr;
    tp2= entry - t2M*atr;
  }

  const text = `الإطار: ${activeTfLabel()} • الملخص: ${side} • SL: ${sl?nf2.format(sl):'—'} • TP1/TP2: ${tp1?nf2.format(tp1):'—'} / ${tp2?nf2.format(tp2):'—'} • ATR%: ${ (atrPct*100).toFixed(2) }`;
  return {text, entry, sl, tp1, tp2, rsiVal, emaF, emaS};
}

function activeTfLabel(){
  if (activeTF===5) return '5 دقائق';
  if (activeTF===30) return '30 دقيقة';
  if (activeTF===60) return 'ساعة';
  if (activeTF===1440) return 'يوم (NY)';
  return activeTF+'m';
}

let allBars = [];      // 5m أساسًا
let activeTF = 5;

function resample(bars, tfMin){
  if (tfMin===5) return bars;
  const out=[]; let cur=null, curBucket=null;
  const bucketMs = tfMin*60*1000;
  for(const b of bars){
    const bucket = Math.floor(b.t / bucketMs) * bucketMs;
    if (curBucket===null || bucket!==curBucket){
      if (cur) out.push(cur);
      curBucket=bucket;
      cur={t:bucket, open:b.open, high:b.high, low:b.low, close:b.close};
    }else{
      cur.high=Math.max(cur.high,b.high);
      cur.low =Math.min(cur.low ,b.low);
      cur.close=b.close;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function setActiveTF(tf){
  activeTF = tf;
  ['tf5','tf30','tf60','tfD'].forEach(id=>$(id).classList.remove('active'));
  if (tf===5) $('tf5').classList.add('active');
  if (tf===30) $('tf30').classList.add('active');
  if (tf===60) $('tf60').classList.add('active');
  if (tf===1440) $('tfD').classList.add('active');
}

// التحليل والرسم
async function analyzeAndRender(livePriceOptional){
  if (!allBars.length) return;

  const base = resample(allBars, activeTF).slice(-400); // خذ جزء للتسريع
  const last = base.at(-1);

  // Pivot (NY)
  const piv = nyPivotLevels(allBars);
  if (piv.P) {
    $('pivotP').textContent = nf2.format(piv.P);
    $('r1').textContent = nf2.format(piv.R1);
    $('r2').textContent = nf2.format(piv.R2);
    $('r3').textContent = nf2.format(piv.R3);
    $('s1').textContent = nf2.format(piv.S1);
    $('s2').textContent = nf2.format(piv.S2);
    $('s3').textContent = nf2.format(piv.S3);
  }

  // Bollinger + Stochastic
  const bb = bollinger(base, 20, 2);
  const st = stochastic(base, 14, 3);
  $('indK').textContent = isFinite(st.K.at(-1))? st.K.at(-1).toFixed(2) : '—';
  $('indD').textContent = isFinite(st.D.at(-1))? st.D.at(-1).toFixed(2) : '—';

  // قرار
  const decision = makeDecision(base);
  $('indRSI').textContent  = isFinite(decision.rsiVal)? decision.rsiVal.toFixed(2) : '—';
  $('indEMAF').textContent = isFinite(decision.emaF)  ? nf2.format(decision.emaF) : '—';
  $('indEMAS').textContent = isFinite(decision.emaS)  ? nf2.format(decision.emaS) : '—';
  $('indMACD').textContent = (isFinite(decision.emaF)&&isFinite(decision.emaS))? (decision.emaF-decision.emaS).toFixed(4) : '—';

  // نصيحة
  $('adviceBox').textContent = decision.text;
  $('adviceBox2').textContent = decision.text;

  // جدول آخر الشموع (5 صفوف)
  const body = $('rowsBody'); body.innerHTML='';
  base.slice(-5).forEach(b=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${fmtDate(b.t)}</td><td>${fmtTime(b.t)}</td><td class="mono">${nf2.format(b.close)}</td>
      <td class="mono">${decision.entry?nf2.format(decision.entry):'—'}</td>
      <td class="mono">${decision.sl?nf2.format(decision.sl):'—'}</td>
      <td class="mono">${decision.tp1?nf2.format(decision.tp1):'—'}</td>
      <td class="mono">${decision.tp2?nf2.format(decision.tp2):'—'}</td>`;
    body.appendChild(tr);
  });

  // ارسم
  drawChart(base.slice(-200), { entry:decision.entry, sl:decision.sl, tp1:decision.tp1, tp2:decision.tp2, bb });
}

// جلب السعر الحي (محددات بسيطة؛ بدّل المصادر لو احتجت)
const LIVE_SOURCES = [
  // ملاحظة: مصادر للأمثلة—لو احتاجت مفتاح API غيّره
  'https://api.metals.live/v1/spot/gold', // يرجع مصفوفة؛ نأخذ آخر قيمة
];
async function fetchLivePrice(){
  try{
    const u = LIVE_SOURCES[0];
    const r = await fetch(u, {cache:'no-store'});
    if (!r.ok) throw new Error('live fail '+r.status);
    const j = await r.json();
    // metals.live يرجع [[timestamp,price],...]
    const last = Array.isArray(j) ? j.at(-1)?.[1] : undefined;
    if (typeof last==='number') return last;
  }catch(e){ /* ignore */ }
  return NaN;
}

function startLiveLoop(){
  async function tick(){
    try{
      const live = await fetchLivePrice();
      if (Number.isFinite(live)){
        window.__livePrice = live;
        $('livePrice').textContent = nf2.format(live);
      }
      $('liveTime').textContent = fmtTime(Date.now());
      analyzeAndRender(live);
    }catch(e){ /* ignore */ }
  }
  tick();
  setInterval(tick, LIVE_REFRESH_SEC*1000);
}

// Backtest: تحميل CSV تلقائي إذا لم يُحدَّد ملف
async function loadBacktestCSVText(){
  const f = $('btCsv')?.files?.[0];
  if (f) return await f.text();
  const userUrl = (csvInput?.value||'').trim();
  const url = userUrl || repoCsvURL(DEFAULT_CSV);
  const res = await fetch(url, {cache:'no-store'});
  if (!res.ok) throw new Error('تعذّر تحميل CSV للاختبار: '+res.status);
  return await res.text();
}

// Backtest بسيط (مكانك تطوّره لاحقاً)
async function runBacktest(bars, opts){
  const { tfMin=5, useStrict=true, useWalk=true, dailyCap=3 } = opts||{};
  const base = resample(bars, tfMin);
  const trades=[]; let equity=0, maxDD=0, peak=0;

  const riskPct = (+$('riskPct').value||1.0)/100;
  const acct = +$('acctSize').value||10000;

  for(let i=30;i<base.length-1;i++){
    const slice = base.slice(0,i+1);
    const d = makeDecision(slice);
    if (!d.entry) continue;

    // دخول على الشمعة التالية بسعر close الحالي تقريباً
    const next = base[i+1];
    const side = d.sl < d.entry ? 'LONG' : 'SHORT'; // تقريب
    let pnl=0, R=0, exit=d.tp1||next.close;

    if (side==='LONG'){
      // تحقق SL/TP بشكل مبسّط (افتراضي)
      if (next.low<=d.sl) { exit=d.sl; pnl = exit - d.entry; }
      else if (next.high>=d.tp1){ exit = d.tp1; pnl = exit - d.entry; }
      else { exit = next.close; pnl = exit - d.entry; }
    }else{
      if (next.high>=d.sl) { exit=d.sl; pnl = d.entry - exit; }
      else if (next.low<=d.tp1){ exit=d.tp1; pnl = d.entry - exit; }
      else { exit=next.close; pnl = d.entry - exit; }
    }

    const atr = ATR(slice, +$('atrPeriod').value || 14);
    const riskPerUnit = Math.abs(d.entry - d.sl) || (atr||1);
    const dollarsRisk = acct * riskPct;
    const qty = Math.max(1, Math.floor(dollarsRisk / riskPerUnit));
    const pnl$ = qty * pnl;
    equity += pnl$;
    peak = Math.max(peak, equity);
    maxDD = Math.min(maxDD, equity - peak);

    trades.push({i, t:next.t, side, entry:d.entry, exit, R:(pnl/riskPerUnit), pnl:pnl$});
  }

  const win = trades.filter(t=>t.pnl>0).length;
  const pf  = (trades.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0)+1e-9) /
              Math.abs(trades.filter(t=>t.pnl<0).reduce((s,t)=>s+t.pnl,0)-1e-9);
  const expectancy = trades.length? (trades.reduce((s,t)=>s+t.pnl,0)/trades.length) : 0;
  const sharpe = 0; // للتبسيط الآن
  return { trades, equity: trades.map((t,idx)=>({idx,eq: trades.slice(0,idx+1).reduce((s,u)=>s+u.pnl,0)})),
           winPct: trades.length? (win/trades.length*100):0, pf, expectancy, maxDD:Math.abs(maxDD), pnl: equity, sharpe };
}

function paintBacktestTable(trades){
  const tb = $('btRows'); tb.innerHTML='';
  trades.forEach((t,idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${idx+1}</td><td>${fmtDate(t.t)} ${fmtTime(t.t)}</td><td>${t.side}</td>
      <td class="mono">${nf2.format(t.entry)}</td><td class="mono">${nf2.format(t.exit)}</td>
      <td class="mono">${t.R.toFixed(2)}</td><td class="mono">${nf2.format(t.pnl)}</td>`;
    tb.appendChild(tr);
  });
}

function paintBacktestEquity(points){
  const cv = $('btEquity'); if (!cv) return;
  const dpr = window.devicePixelRatio||1;
  const cssW=cv.clientWidth||400, cssH=cv.clientHeight||220;
  if (cv.width!==Math.floor(cssW*dpr) || cv.height!==Math.floor(cssH*dpr)){
    cv.width=Math.floor(cssW*dpr); cv.height=Math.floor(cssH*dpr);
  }
  const ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);
  if (!points.length) return;
  const pad=20, W=cssW-pad*2, H=cssH-pad*2;
  const ys = points.map(p=>p.eq);
  const min=Math.min(...ys), max=Math.max(...ys);
  const x=i=>pad+(i/(points.length-1))*W;
  const y=v=>pad+(1-(v-min)/Math.max(1e-9,(max-min)))*H;
  ctx.strokeStyle='#22c55e'; ctx.lineWidth=1.6; ctx.beginPath();
  points.forEach((p,i)=>{ const xx=x(i), yy=y(p.eq); if(i===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy); });
  ctx.stroke();
}

// زر تشغيل التحليل
$('runBtn')?.addEventListener('click', async ()=>{
  try{
    $('status').textContent='... تحميل CSV';
    const text = await fetchCSVText();
    allBars = parseCsvToBars(text);
    $('status').textContent=`تم التحميل: ${allBars.length} شمعة`;
    analyzeAndRender();
  }catch(e){
    alert(e.message||e);
    $('status').textContent='فشل التحميل';
  }
});

// أزرار الإطار
$('tf5')?.addEventListener('click', ()=>{ setActiveTF(5); analyzeAndRender(); });
$('tf30')?.addEventListener('click', ()=>{ setActiveTF(30); analyzeAndRender(); });
$('tf60')?.addEventListener('click', ()=>{ setActiveTF(60); analyzeAndRender(); });
$('tfD')?.addEventListener('click', ()=>{ setActiveTF(1440); analyzeAndRender(); });

// Backtest
$('btRun')?.addEventListener('click', async ()=>{
  try{
    $('btStats').textContent='... جاري التحميل';
    const text = await loadBacktestCSVText();
    const bars = parseCsvToBars(text);
    const tfMin = +$('btTf').value || 5;
    const useStrict = $('btStrict').checked;
    const useWalk   = $('btWalk').checked;
    const dailyCap  = +$('btDailyRiskCap').value || 3;

    const result = await runBacktest(bars, {tfMin,useStrict,useWalk,dailyCap});
    paintBacktestTable(result.trades);
    paintBacktestEquity(result.equity);
    $('btStats').textContent =
      `الصفقات: ${result.trades.length} • Win%: ${result.winPct.toFixed(2)} • PF: ${result.pf.toFixed(2)} • Expectancy: ${result.expectancy.toFixed(2)} • MaxDD$: ${nf2.format(result.maxDD)} • PnL$: ${nf2.format(result.pnl)} • Sharpe≈ ${result.sharpe?.toFixed?.(2) ?? '—'}`;
  }catch(e){
    alert(e.message||e);
    $('btStats').textContent='—';
  }
});

// تشغيل أولي
(async function init(){
  setActiveTF(5);
  try{
    const text = await fetchCSVText();
    allBars = parseCsvToBars(text);
    $('status').textContent=`تم التحميل: ${allBars.length} شمعة`;
  }catch(e){
    $('status').textContent='لم يُحمّل CSV (يمكنك إدخال رابط أعلاه ثم الضغط تشغيل).';
  }
  analyzeAndRender();
  startLiveLoop();
})();
