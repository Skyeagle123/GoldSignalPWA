/******** الإعدادات ********/
const DEFAULT_5MIN_CSV_URL =
  'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_5min.csv';

const LIVE_JSON_URL =
  'https://goldprice-proxy.samer-mourtada.workers.dev/price?s=xauusd';

/******** أدوات رقم/وقت ********/
const nf2 = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 2});
const nf4 = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 4});
const en2 = (n)=> nf2.format(n);
const en4 = (n)=> nf4.format(n);

function toNum(x){ const n = Number(String(x).replace(/[^\d.+-]/g,'')); return Number.isFinite(n)?n:null; }

function fmtLocal(ts){
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const ss = String(d.getSeconds()).padStart(2,'0');
  return {date:`${y}-${m}-${day}`, time:`${hh}:${mm}:${ss}`};
}

/******** قراءة CSV ********/
function parseCsvFlexible(csvText){
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines.shift().split(',').map(h => h.trim().toLowerCase());
  const idx = (n)=> headers.indexOf(n);
  const has = (...ns)=> ns.every(n => idx(n) !== -1);

  const out = [];
  for (const line of lines){
    if (!line.trim()) continue;
    const cols = line.split(',').map(c=>c.trim());

    if (has('date','time','close')){
      const d = cols[idx('date')];
      let t = cols[idx('time')] || '00:00:00';
      if (/^\d{2}:\d{2}$/.test(t)) t += ':00';
      const ts = Date.parse(`${d}T${t}Z`);
      const close = toNum(cols[idx('close')]);
      const open  = has('open')  ? toNum(cols[idx('open')])  : null;
      const high  = has('high')  ? toNum(cols[idx('high')])  : null;
      const low   = has('low')   ? toNum(cols[idx('low')])   : null;
      const vol   = has('volume')? toNum(cols[idx('volume')]): null;
      if (Number.isFinite(ts) && Number.isFinite(close)){
        const {date,time} = fmtLocal(ts);
        out.push({ts, close, open, high, low, vol, _date:date, _time:time.slice(0,5)});
      }
    } else if (has('date','close')){
      const d = cols[idx('date')];
      const ts = Date.parse(`${d}T00:00:00Z`);
      const close = toNum(cols[idx('close')]);
      if (Number.isFinite(ts) && Number.isFinite(close)){
        const {date,time} = fmtLocal(ts);
        out.push({ts, close, _date:date, _time:time.slice(0,5)});
      }
    } else {
      const d = cols[0];
      const close = toNum(cols[1]);
      const ts = Date.parse(`${d}T00:00:00Z`);
      if (Number.isFinite(ts) && Number.isFinite(close)){
        const {date,time} = fmtLocal(ts);
        out.push({ts, close, _date:date, _time:time.slice(0,5)});
      }
    }
  }
  return out.sort((a,b)=> a.ts - b.ts);
}

async function loadCsvBars(url){
  const final = (url && url.trim()) || DEFAULT_5MIN_CSV_URL;
  // اكسر كاش GitHub Pages
  const withBust = final + (final.includes('?') ? '&' : '?') + 't=' + Date.now();
  const res = await fetch(withBust, {cache:'no-store'});
  if (!res.ok) throw new Error(`CSV HTTP ${res.status}`);
  const text = await res.text();
  const rows = parseCsvFlexible(text);
  if (!rows.length) throw new Error('CSV فارغ أو غير معروف');
  return rows;
}

/******** تجميع إطار زمني ********/
function startOfHour(ts){ const d=new Date(ts); d.setMinutes(0,0,0); return d.getTime(); }
function startOfLocalDay(ts){ const d=new Date(ts); d.setHours(0,0,0,0); return d.getTime(); }

function resample(bars, kind){
  if (kind==='m5') return bars;
  const m = new Map();
  const by = (kind==='h1') ? startOfHour : startOfLocalDay;
  for (const b of bars){
    const k = by(b.ts);
    const g = m.get(k) || {ts:k, open:null, high:-Infinity, low:Infinity, close:null, _date:null, _time:null};
    g.close = b.close;
    if (g.open==null) g.open=b.close;
    g.high = Math.max(g.high, b.high ?? b.close, b.close);
    g.low  = Math.min(g.low,  b.low  ?? b.close, b.close);
    const {date,time}=fmtLocal(k); g._date=date; g._time=time.slice(0,5);
    m.set(k,g);
  }
  return Array.from(m.values()).sort((a,b)=>a.ts-b.ts);
}

/******** مؤشرات ********/
function ema(values, p){
  const out = Array(values.length).fill(null);
  if (p<=1 || values.length===0) return out;
  const k = 2/(p+1);
  let first = values.find(v=>Number.isFinite(v)); if(first==null) return out;
  let i = values.indexOf(first);
  out[i]=first;
  for(i=i+1;i<values.length;i++){
    const v = values[i];
    out[i] = Number.isFinite(v)? (v*k + out[i-1]*(1-k)) : out[i-1];
  }
  return out;
}
function rsi(values, period=14){
  const out=Array(values.length).fill(null);
  if(values.length<period+1) return out;
  let gains=0,losses=0;
  for(let i=1;i<=period;i++){ const ch=values[i]-values[i-1]; gains+=Math.max(ch,0); losses+=Math.max(-ch,0); }
  let avgG=gains/period, avgL=losses/period;
  out[period] = 100 - (100/(1+(avgG/(avgL||1e-9))));
  for(let i=period+1;i<values.length;i++){
    const ch=values[i]-values[i-1];
    avgG=(avgG*(period-1)+Math.max(ch,0))/period;
    avgL=(avgL*(period-1)+Math.max(-ch,0))/period;
    out[i]=100 - (100/(1+(avgG/(avgL||1e-9))));
  }
  return out;
}
function decideSignal(macdArr, rsiArr, i){
  const m=macdArr[i], r=rsiArr[i];
  if(!Number.isFinite(m)||!Number.isFinite(r)) return 'حيادي';
  if(m>0 && r>=50) return 'شراء';
  if(m<0 && r<50)  return 'بيع';
  return 'حيادي';
}

/******** Pivot ********/
function computePivotFrom5min(bars5){
  if(!bars5.length) return null;
  const lastDay = startOfLocalDay(bars5[bars5.length-1].ts);
  const prevDay = lastDay - 86400000;
  const dayRows = bars5.filter(b=> startOfLocalDay(b.ts)===prevDay);
  if(!dayRows.length) return null;
  const highs=dayRows.map(b=>b.high??b.close), lows=dayRows.map(b=>b.low??b.close);
  const H=Math.max(...highs), L=Math.min(...lows), C=dayRows[dayRows.length-1].close;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

/******** عرض ********/
function setErr(msg){ const el=document.getElementById('err'); el.style.display=msg?'block':'none'; el.textContent=msg||''; }
function clearErr(){ setErr(''); }

function renderRecentTable(rows){
  const tbody=document.querySelector('#recentTable tbody');
  const lastN=rows.slice(-60).reverse();
  tbody.innerHTML=lastN.map(r=>`
    <tr>
      <td>${r._date}</td>
      <td>${(r._time||'').slice(0,5)}</td>
      <td>${en2(r.close)}</td>
      <td class="${r.signal==='شراء'?'good':r.signal==='بيع'?'bad':'warn'}">${r.signal}</td>
      <td>${r.rsi!=null?en2(r.rsi):''}</td>
      <td>${r.macd!=null?en4(r.macd):''}</td>
      <td>${r.emaF!=null?en2(r.emaF):''}</td>
    </tr>
  `).join('');
}
function setPivot(pv){
  const set=(id,v)=>document.getElementById(id).textContent=Number.isFinite(v)?en2(v):'—';
  set('pp',pv?.P); set('r1',pv?.R1); set('r2',pv?.R2); set('r3',pv?.R3); set('s1',pv?.S1); set('s2',pv?.S2); set('s3',pv?.S3);
}
function setLive(price, ts){
  document.getElementById('livePrice').textContent=Number.isFinite(price)?en2(price):'—';
  const {date,time}=fmtLocal(ts||Date.now());
  document.getElementById('liveTs').textContent=`${date} ${time}`;
}
function setSignalNow(text){
  const el=document.getElementById('signalNow');
  el.textContent=text||'—';
  el.className=(text==='شراء'?'good':text==='بيع'?'bad':'warn');
}

/******** عناصر DOM ********/
const inputUrl=document.getElementById('csvUrl');
const runBtn=document.getElementById('runBtn');
const tabs=document.getElementById('tfTabs');
let timeframe='m5';

tabs.addEventListener('click',(e)=>{
  const t=e.target.closest('.btn-tab'); if(!t) return;
  [...tabs.children].forEach(c=>c.classList.remove('active'));
  t.classList.add('active'); timeframe=t.dataset.tf;
  runAnalysis().catch(()=>{});
});

/******** سعر حي ********/
async function fetchLive(){
  try{
    if(!LIVE_JSON_URL) return;
    const res=await fetch(LIVE_JSON_URL, {cache:'no-store'});
    if(!res.ok) throw 0;
    const j=await res.json();
    const ts=j.ts?Number(j.ts):Date.parse(`${j.date||''}T${(j.time||'00:00:00')}Z`);
    setLive(j.price ?? j.close, Number.isFinite(ts)?ts:Date.now());
  }catch{}
}
setInterval(fetchLive, 30000);
fetchLive();

/******** التحليل ********/
async function runAnalysis(){
  runBtn.disabled=true; clearErr();
  try{
    const url=(inputUrl.value||'').trim() || DEFAULT_5MIN_CSV_URL;
    const baseBars=await loadCsvBars(url);      // 5m (أو ما يشبهه)
    const bars5=resample(baseBars,'m5');        // لاحتساب Pivot
    setPivot(computePivotFrom5min(bars5));

    const bars=resample(baseBars,timeframe);
    const closes=bars.map(b=>b.close);

    const emaF=ema(closes, +document.getElementById('emaFast').value||12);
    const emaS=ema(closes, +document.getElementById('emaSlow').value||26);
    const macd=closes.map((_,i)=> (emaF[i]!=null && emaS[i]!=null)?(emaF[i]-emaS[i]):null);
    const rsiA=rsi(closes, +document.getElementById('rsiPeriod').value||14);

    const view=bars.map((b,i)=>({
      _date:b._date,_time:b._time,ts:b.ts,close:b.close,
      emaF:emaF[i],macd:macd[i],rsi:rsiA[i],signal:decideSignal(macd,rsiA,i)
    }));

    renderRecentTable(view);

    const last=view[view.length-1];
    if(last){ setSignalNow(last.signal); if(document.getElementById('livePrice').textContent==='—'){ setLive(last.close,last.ts); } }
  }catch(err){
    console.error(err);
    setErr('تعذّر تحميل/تحليل البيانات. تأكّد من رابط CSV والأحرف الكبيرة/الصغيرة واسم الملف.');
    alert('تعذّر تحميل/تحليل البيانات.');
  }finally{ runBtn.disabled=false; }
}

runBtn.addEventListener('click', ()=>runAnalysis());
runAnalysis();
