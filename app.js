/***************** روابط CSV الافتراضية (داخل نفس الريبو) *****************/
const CSV_MINUTE = 'XAUUSD_5min.csv';
const CSV_HOURLY = 'XAUUSD_hourly.csv';
const CSV_DAILY  = 'XAUUSD_live.csv';

/***************** عناصر DOM (كلها اختياريّة) *****************/
const $ = (id) => document.getElementById(id);
function pick(...sels){ for (const s of sels){ const el = document.querySelector(s); if (el) return el; } return null; }

const els = {
  // زر التشغيل
  runBtn: $('runBtn'),

  // جداول “البيانات الأخيرة”
  tableHead: $('tableHead') || pick('#table thead', '#dataHead'),
  tableBody: $('tableBody') || pick('#table tbody', '#dataBody'),

  // ملخص
  signalBadge: $('signalBadge') || pick('#summary .pill','#summaryBadge'),
  signalNote:  $('signalNote')  || pick('#summaryNote'),
  livePrice:   $('livePrice')   || pick('#livePriceLine'),

  // إعدادات المؤشرات (إن وُجدت في الصفحة)
  emaFast:   $('emaFast'),
  emaSlow:   $('emaSlow'),
  rsiPeriod: $('rsiPeriod'),

  // جدول المؤشرات
  indHead: $('indHead') || pick('#indicators thead','#indicatorsHead'),
  indBody: $('indBody') || pick('#indicators tbody','#indicatorsBody'),
};

/***************** أدوات ************************/
const fmtNum = (v, d=2) => (v==null || isNaN(v)) ? '-' : Number(v).toFixed(d);
const colorClass = (sig) => sig==='شراء'?'good':sig==='بيع'?'bad':'warn';

/***************** مؤشرات فنية ************************/
function EMA(arr, period){
  if (!Array.isArray(arr) || !arr.length) return [];
  const k = 2/(period+1);
  let out=[], prev=arr[0];
  out.push(prev);
  for (let i=1;i<arr.length;i++){
    prev = arr[i]*k + prev*(1-k);
    out.push(prev);
  }
  return out;
}
function RSI(values, period=14){
  if (!Array.isArray(values) || values.length<period+1) return Array(values.length).fill(null);
  const rsi = Array(values.length).fill(null);
  let gains=0, losses=0;
  for (let i=1;i<=period;i++){
    const ch = values[i]-values[i-1];
    if (ch>0) gains+=ch; else losses-=ch;
  }
  let avgG = gains/period, avgL = losses/period;
  rsi[period]=100-100/(1+(avgG/(avgL||1e-6)));
  for (let i=period+1;i<values.length;i++){
    const ch = values[i]-values[i-1];
    avgG = (avgG*(period-1) + (ch>0?ch:0))/period;
    avgL = (avgL*(period-1) + (ch<0?-ch:0))/period;
    rsi[i]=100-100/(1+(avgG/(avgL||1e-6)));
  }
  return rsi;
}
function MACD(values, fast=12, slow=26, signal=9){
  const f = EMA(values,fast), s = EMA(values,slow);
  const macd = values.map((_,i)=> (f[i]!=null && s[i]!=null) ? f[i]-s[i] : null);
  const sig  = EMA(macd.filter(x=>x!=null), signal);
  const pad  = Array(macd.length - sig.length).fill(null).concat(sig);
  const hist = macd.map((v,i)=> (v!=null && pad[i]!=null) ? v-pad[i] : null);
  return { macd, signal: pad, hist };
}

/***************** إشارات المؤشرات ************************/
const sigRSI  = (v)=> !Number.isFinite(v)?'حيادي': (v>70?'بيع': v<30?'شراء':'حيادي');
const sigHIST = (v)=> !Number.isFinite(v)?'حيادي': (v>0?'شراء': v<0?'بيع':'حيادي');
const sigEMA  = (f,s)=> (!Number.isFinite(f)||!Number.isFinite(s))?'حيادي': (f>s?'شراء': f<s?'بيع':'حيادي');

/***************** قراءة CSV ************************/
async function fetchCSV(url){
  // اكسر الكاش بإضافة بارامتر
  const u = url + (url.includes('?')?'&':'?') + 't=' + Date.now();
  const res = await fetch(u);
  if (!res.ok) throw new Error('تعذّر تحميل CSV: ' + res.status);
  const txt = await res.text();
  // توقع Header: Date,Close
  const lines = txt.trim().split(/\r?\n/);
  // احذف الرأٍس إذا فيه نصوص
  const startIdx = (lines[0] && /date/i.test(lines[0])) ? 1 : 0;
  return lines.slice(startIdx).map(line=>{
    const [date,close] = line.split(',');
    return { date, price: parseFloat(close) };
  }).filter(r=>Number.isFinite(r.price));
}

/***************** عرض جدول المؤشرات ************************/
function renderIndicators(series, opts){
  if (!els.indHead || !els.indBody) return;
  const closes = series.map(s=>s.price);
  if (closes.length < 5){ els.indHead.innerHTML=''; els.indBody.innerHTML=''; return; }

  const emaFarr = EMA(closes, opts.emaFast);
  const emaSarr = EMA(closes, opts.emaSlow);
  const rsiArr  = RSI(closes,  opts.rsiPeriod);
  const macdH   = MACD(closes).hist;

  const emaF = emaFarr.at(-1);
  const emaS = emaSarr.at(-1);
  const rsi  = rsiArr.at(-1);
  const hist = macdH.at(-1);

  const rows = [
    {name:'RSI', value:rsi, sig:sigRSI(rsi)},
    {name:'MACD (هيستوجرام)', value:hist, sig:sigHIST(hist)},
    {name:`EMA (سريع ${opts.emaFast} / بطيء ${opts.emaSlow})`, value: (Number(emaF)-Number(emaS)), sig:sigEMA(emaF,emaS)},
  ];

  els.indHead.innerHTML = '<tr><th>المؤشر</th><th>القيمة</th><th>الإشارة</th></tr>';
  els.indBody.innerHTML = rows.map(r=>`
    <tr>
      <td>${r.name}</td>
      <td>${fmtNum(r.value)}</td>
      <td class="${colorClass(r.sig)}">${r.sig}</td>
    </tr>
  `).join('');
}

/***************** عرض جدول البيانات الأخيرة ************************/
function renderRecentTable(series, opts){
  if (!els.tableHead || !els.tableBody) return;
  const closes = series.map(s=>s.price);
  const emaFarr = EMA(closes, opts.emaFast);
  const emaSarr = EMA(closes, opts.emaSlow);
  const rsiArr  = RSI(closes,  opts.rsiPeriod);
  const macd    = MACD(closes);

  els.tableHead.innerHTML = '<tr><th>التاريخ</th><th>السعر</th><th>الإشارة</th><th>RSI</th><th>MACD</th><th>EMA F</th></tr>';

  const last = series.slice(-10); // آخر 10
  els.tableBody.innerHTML = last.map((row, i)=>{
    const idx = series.length - last.length + i;
    const rsi  = rsiArr[idx];
    const emaF = emaFarr[idx];
    const emaS = emaSarr[idx];
    const macdV= macd.macd[idx];
    // إشارة بسيطة: تقاطع EMA مع فلتر RSI
    let sig = 'حيادي';
    if (Number(emaF) > Number(emaS) && Number(rsi) < 70) sig = 'شراء';
    else if (Number(emaF) < Number(emaS) && Number(rsi) > 30) sig = 'بيع';

    return `
      <tr>
        <td>${row.date}</td>
        <td>${fmtNum(row.price)}</td>
        <td class="${colorClass(sig)}">${sig}</td>
        <td>${fmtNum(rsi)}</td>
        <td>${fmtNum(macdV)}</td>
        <td>${fmtNum(emaF)}</td>
      </tr>
    `;
  }).join('');
}

/***************** ملخص الإشارة ************************/
function renderSummary(series, opts){
  if (!series.length) return;
  const price = series.at(-1)?.price;

  const closes = series.map(s=>s.price);
  const emaFarr= EMA(closes, opts.emaFast);
  const emaSarr= EMA(closes, opts.emaSlow);
  const rsiArr = RSI(closes,  opts.rsiPeriod);
  const hist   = MACD(closes).hist;

  const emaF = emaFarr.at(-1);
  const emaS = emaSarr.at(-1);
  const rsi  = rsiArr.at(-1);
  const h    = hist.at(-1);

  // قرار بسيط: اجماع 2 من 3
  const votes = [sigEMA(emaF,emaS), sigRSI(rsi), sigHIST(h)];
  const buyVotes  = votes.filter(v=>v==='شراء').length;
  const sellVotes = votes.filter(v=>v==='بيع').length;
  let final = 'حيادي';
  if (buyVotes >= 2) final = 'شراء';
  else if (sellVotes >= 2) final = 'بيع';

  if (els.signalBadge){
    els.signalBadge.textContent = final;
    els.signalBadge.className = 'pill ' + colorClass(final);
  }
  if (els.signalNote){
    els.signalNote.textContent = `جاهز للحساب…`;
  }
  if (els.livePrice){
    els.livePrice.textContent = fmtNum(price);
  }
}

/***************** تشغيل وتحميل ************************/
function getOpts(){
  const emaFast = Number(els.emaFast?.value)   || 12;
  const emaSlow = Number(els.emaSlow?.value)   || 26;
  const rsiPer  = Number(els.rsiPeriod?.value) || 14;
  return { emaFast, emaSlow, rsiPeriod: rsiPer };
}
async function runNow(){
  try{
    // الأفضل: 5 دقائق (من GitHub Action)
    const url = CSV_MINUTE; // بدّل لـ CSV_HOURLY أو CSV_DAILY إذا بدك إطار مختلف
    const series = await fetchCSV(url);
    const opts = getOpts();

    renderSummary(series, opts);
    renderIndicators(series, opts);
    renderRecentTable(series, opts);
  }catch(e){
    console.error(e);
    if (els.signalNote) els.signalNote.textContent = 'حصل خطأ بالتحميل.';
  }
}

if (els.runBtn) els.runBtn.addEventListener('click', runNow);

// شغّل تلقائياً عند الفتح، وحدّث كل 60 ثانية
document.addEventListener('DOMContentLoaded', runNow);
setInterval(runNow, 60*1000);
