/******************************
 * GoldSignals - app.js (جاهز)
 * إذا تركت رابط CSV فاضي: يستخدم ملف 5 دقائق الافتراضي.
 ******************************/

const DEFAULT_MINUTE_CSV = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_5min.csv';

// عناصر الواجهة
const els = {
  csv: document.getElementById('csvUrl'),
  run: document.getElementById('runBtn'),
  emaFast: document.getElementById('emaFast'),
  emaSlow: document.getElementById('emaSlow'),
  rsiPeriod: document.getElementById('rsiPeriod'),
  // Live + Summary + Tables
  live: document.getElementById('liveBox'),
  summary: document.getElementById('summary'),
  tableHead: document.querySelector('#table thead'),
  tableBody: document.querySelector('#table tbody'),
  srBody: document.querySelector('#srTable tbody')
};

// تنسيق
function fmtNum(v, d=2){ if (v==null || isNaN(v)) return '-'; return Number(v).toFixed(d); }
function colorClass(sig){ if (sig==='شراء') return 'good'; if (sig==='بيع') return 'bad'; return 'warn'; }
function fmtDateCell(iso){
  const d = new Date(iso); if (isNaN(d)) return iso||'-';
  const yyyy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  const hh=String(d.getHours()).padStart(2,'0'), mi=String(d.getMinutes()).padStart(2,'0'), ss=String(d.getSeconds()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}<br>${hh}:${mi}:${ss}`;
}

// تحميل CSV (Date,Close)
async function loadCSV(url){
  const res = await fetch(url + (url.includes('?')?'&':'?') + 't=' + Date.now(), {cache:'no-store'});
  if(!res.ok) throw new Error('فشل تحميل CSV: '+res.status);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  if(lines.length<2) return [];
  const headers = lines[0].split(',').map(h=>h.trim().toLowerCase());
  const iDate = headers.findIndex(h=>h==='date'||h==='time'||h==='datetime');
  const iClose = headers.findIndex(h=>h==='close'||h==='price'||h==='last');

  let out=[];
  if(iDate>-1 && iClose>-1){
    for(let i=1;i<lines.length;i++){
      const c=lines[i].split(',');
      if(c.length<=Math.max(iDate,iClose)) continue;
      const price=Number(c[iClose]); if(isNaN(price)) continue;
      out.push({date:c[iDate], price});
    }
  }else{
    for(let i=1;i<lines.length;i++){
      const c=lines[i].split(',');
      const price=Number(c[1]); if(isNaN(price)) continue;
      out.push({date:c[0], price});
    }
  }
  return out;
}

/*********** مؤشرات ***********/
function EMA(arr, period){
  const out=Array(arr.length).fill(null), k=2/(period+1);
  let ema=null;
  for(let i=0;i<arr.length;i++){
    const v=arr[i]; if(v==null||isNaN(v)){out[i]=null;continue;}
    if(ema==null) ema=v; else ema=(v-ema)*k+ema;
    out[i]=ema;
  }
  return out;
}
function RSI(closes, p=14){
  const out=Array(closes.length).fill(null);
  if(closes.length<p+1) return out;
  let g=0,l=0;
  for(let i=1;i<=p;i++){const ch=closes[i]-closes[i-1]; if(ch>=0) g+=ch; else l-=ch;}
  let ag=g/p, al=l/p; out[p]=al===0?100:100-(100/(1+(ag/al)));
  for(let i=p+1;i<closes.length;i++){
    const ch=closes[i]-closes[i-1]; const G=ch>0?ch:0, L=ch<0?-ch:0;
    ag=(ag*(p-1)+G)/p; al=(al*(p-1)+L)/p; out[i]=al===0?100:100-(100/(1+(ag/al)));
  }
  return out;
}
function MACD(closes, f=12, s=26, sig=9){
  const ef=EMA(closes,f), es=EMA(closes,s);
  const macd=closes.map((_,i)=> (ef[i]==null||es[i]==null)?null:(ef[i]-es[i]));
  const sigL=EMA(macd.map(v=>v??0), sig).map((v,i)=> macd[i]==null?null:v);
  const hist=macd.map((v,i)=> (v==null||sigL[i]==null)?null:(v-sigL[i]));
  return {macd, signal:sigL, hist};
}

/*********** السعر الحي ***********/
function renderLive(series){
  if(!els.live||!series.length) return;
  const n=series.length-1, last=series[n].price, prev=series[n-1]?.price ?? last;
  const ch=last-prev, chp=prev? (ch/prev*100):0;
  els.live.innerHTML = `
    <div class="live">${fmtNum(last,2)}</div>
    <div class="muted">آخر تحديث: ${fmtDateCell(series[n].date)}</div>
    <div class="${ch>=0?'good':'bad'}" style="margin-top:6px">
      ${ch>=0?'+':''}${fmtNum(ch,2)} (${ch>=0?'+':''}${fmtNum(chp,2)}%)
    </div>
  `;
}

/*********** ملخص ***********/
function renderSummary(series, opts, emaFarr, emaSarr, rsiArr, macdObj){
  if(!els.summary||!series.length) return;
  const n=series.length-1;
  const last=series[n].price, emaF=emaFarr[n], emaS=emaSarr[n], rsi=rsiArr[n], macd=macdObj.macd[n];
  let sig='حيادي';
  if(Number(emaF)>Number(emaS) && Number(rsi)<70) sig='شراء';
  else if(Number(emaF)<Number(emaS) && Number(rsi)>30) sig='بيع';
  els.summary.innerHTML = `
    <div class="grid">
      <div class="pill">آخر تحديث: ${fmtDateCell(series[n].date)}</div>
      <div class="pill ${colorClass(sig)}" style="font-weight:700">${sig}</div>
      <div class="pill">السعر: ${fmtNum(last,2)}</div>
      <div class="pill">RSI: ${fmtNum(rsi,1)}</div>
      <div class="pill">MACD: ${fmtNum(macd,4)}</div>
    </div>
    <p class="warn" style="margin-top:8px;font-size:12px">* ليست توصية استثمارية.</p>
  `;
}

/*********** الدعم والمقاومة (Pivot) ***********
 * نستخدم High/Low تقريبيين من أسعار الإغلاق لآخر ~24 ساعة (288 شمعة 5 دقائق).
 */
function renderSR(series){
  if(!els.srBody||!series.length) return;
  const lookback = 288; // ~ يوم
  const slice = series.slice(-lookback);
  if(slice.length<10){ els.srBody.innerHTML='<tr><td colspan="2">بيانات غير كافية</td></tr>'; return; }
  const highs = slice.map(s=>s.price);
  const lows  = slice.map(s=>s.price);
  const H = Math.max(...highs), L = Math.min(...lows);
  const C = series[series.length-1].price;

  const PP = (H + L + C) / 3;
  const R1 = 2*PP - L;
  const S1 = 2*PP - H;
  const R2 = PP + (H - L);
  const S2 = PP - (H - L);
  const R3 = H + 2*(PP - L);
  const S3 = L - 2*(H - PP);

  const rows = [
    ['R3', R3], ['R2', R2], ['R1', R1],
    ['S1', S1], ['S2', S2], ['S3', S3],
  ];
  els.srBody.innerHTML = rows.map(([k,v])=>`<tr><td>${k}</td><td>${fmtNum(v,2)}</td></tr>`).join('');
}

/*********** “البيانات الأخيرة” ***********/
function renderRecent(series, opts){
  if(!els.tableHead||!els.tableBody) return;

  const closes = series.map(s=>s.price);
  const emaFarr = EMA(closes, opts.emaFast);
  const emaSarr = EMA(closes, opts.emaSlow);
  const rsiArr  = RSI(closes,  opts.rsiPeriod);
  const macdObj = MACD(closes);

  // رأس الجدول (حسب الصورة)
  els.tableHead.innerHTML =
    '<tr><th>EMA F</th><th>MACD</th><th>RSI</th><th>الإشارة</th><th>السعر</th><th>التاريخ</th></tr>';

  const last = series.slice(-10);
  els.tableBody.innerHTML = last.map((row,i)=>{
    const idx   = series.length - last.length + i;
    const rsi   = rsiArr[idx];
    const emaF  = emaFarr[idx];
    const emaS  = emaSarr[idx];
    const macdV = macdObj.macd[idx];

    let sig='حيادي';
    if (Number(emaF) > Number(emaS) && Number(rsi) < 70) sig='شراء';
    else if (Number(emaF) < Number(emaS) && Number(rsi) > 30) sig='بيع';

    return `<tr>
      <td>${fmtNum(emaF)}</td>
      <td>${fmtNum(macdV,4)}</td>
      <td>${fmtNum(rsi,1)}</td>
      <td class="${colorClass(sig)}">${sig}</td>
      <td>${fmtNum(row.price,2)}</td>
      <td>${fmtDateCell(row.date)}</td>
    </tr>`;
  }).join('');

  // الملخص + دعم/مقاومة + السعر الحي
  renderSummary(series, opts, emaFarr, emaSarr, rsiArr, macdObj);
  renderSR(series);
  renderLive(series);
}

/*********** مصدر CSV ***********/
function resolveCsvUrl(){
  const v = (els.csv?.value || '').trim();
  return v || DEFAULT_MINUTE_CSV;
}

/*********** التشغيل ***********/
async function runOnce(){
  try{
    const url = resolveCsvUrl();
    const series = await loadCSV(url);
    if(!series.length) throw new Error('لا توجد بيانات');

    const opts = {
      emaFast: Number(els.emaFast?.value) || 12,
      emaSlow: Number(els.emaSlow?.value) || 26,
      rsiPeriod: Number(els.rsiPeriod?.value) || 14
    };
    renderRecent(series, opts);
  }catch(e){
    console.error(e);
    els.summary && (els.summary.innerHTML = `<div class="bad">خطأ: ${e.message||e}</div>`);
  }
}

els.run?.addEventListener('click', runOnce);
runOnce();
setInterval(runOnce, 60*1000);
