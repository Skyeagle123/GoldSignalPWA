/******************************
 * GoldSignals - app.js (جاهز)
 * يعمل بدون خادم ويقرأ CSV (Date,Close)
 * إذا تركت رابط CSV فاضي، يستخدم ملف 5 دقائق الافتراضي.
 ******************************/

// روابط CSV الافتراضية (من GitHub Pages)
const DEFAULT_MINUTE_CSV = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_5min.csv';
// ممكن لاحقاً تضيف:
const DEFAULT_HOURLY_CSV = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_hourly.csv';
const DEFAULT_DAILY_CSV  = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_live.csv';

// عناصر الواجهة
const els = {
  csv: document.getElementById('csvUrl'),
  run: document.getElementById('runBtn'),
  emaFast: document.getElementById('emaFast'),
  emaSlow: document.getElementById('emaSlow'),
  rsiPeriod: document.getElementById('rsiPeriod'),
  // جدول “البيانات الأخيرة”
  tableHead: document.querySelector('#table thead'),
  tableBody: document.querySelector('#table tbody'),
  summary: document.getElementById('summary')
};

// أدوات تنسيق
function fmtNum(v, d=2){
  if (v == null || isNaN(v)) return '-';
  return Number(v).toFixed(d);
}
function colorClass(sig){
  if (sig === 'شراء') return 'good';
  if (sig === 'بيع')   return 'bad';
  return 'warn';
}
function fmtDateCell(iso){
  const d = new Date(iso);
  if (isNaN(d)) return iso || '-';
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth()+1).padStart(2,'0');
  const dd   = String(d.getDate()).padStart(2,'0');
  const hh   = String(d.getHours()).padStart(2,'0');
  const mi   = String(d.getMinutes()).padStart(2,'0');
  const ss   = String(d.getSeconds()).padStart(2,'0');
  // سطرين مثل الصورة
  return `${yyyy}-${mm}-${dd}<br>${hh}:${mi}:${ss}`;
}

// قراءة CSV (Date,Close) مع دعم أسماء أعمدة مختلفة بالحروف
async function loadCSV(url){
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), {cache:'no-store'});
  if (!res.ok) throw new Error('فشل تحميل CSV: ' + res.status);
  const text = await res.text();

  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const iDate = headers.findIndex(h => h === 'date' || h === 'time' || h === 'datetime');
  const iClose = headers.findIndex(h => h === 'close' || h === 'price' || h === 'last');

  if (iDate === -1 || iClose === -1) {
    // جرّب بدون هيدر
    // شكل بسيط: Date,Close
    return lines.slice(0,200).slice(1).map(r=>{
      const c = r.split(',');
      return {date:c[0], price: Number(c[1])};
    }).filter(r=>!isNaN(r.price));
  }

  const out = [];
  for (let i=1;i<lines.length;i++){
    const c = lines[i].split(',');
    if (c.length <= Math.max(iDate,iClose)) continue;
    const price = Number(c[iClose]);
    if (isNaN(price)) continue;
    out.push({ date: c[iDate], price });
  }
  return out;
}

/*********** المؤشرات الفنية ***********/
function SMA(arr, period){
  const out = Array(arr.length).fill(null);
  let sum = 0;
  for (let i=0;i<arr.length;i++){
    sum += arr[i];
    if (i >= period) sum -= arr[i-period];
    if (i >= period-1) out[i] = sum / period;
  }
  return out;
}
function EMA(arr, period){
  const out = Array(arr.length).fill(null);
  const k = 2/(period+1);
  let emaPrev = null;
  for (let i=0;i<arr.length;i++){
    const v = arr[i];
    if (v == null || isNaN(v)) { out[i] = null; continue; }
    if (i === 0) {
      emaPrev = v;
    } else if (emaPrev == null) {
      // استخدم SMA كبداية عند توفرها
      const idxStart = i - (period-1);
      if (idxStart >= 0){
        const seed = arr.slice(idxStart, i+1).reduce((a,b)=>a+b,0)/period;
        emaPrev = seed;
      } else {
        emaPrev = v;
      }
    } else {
      emaPrev = (v - emaPrev) * k + emaPrev;
    }
    out[i] = emaPrev;
  }
  return out;
}
function RSI(closes, period=14){
  const out = Array(closes.length).fill(null);
  if (closes.length < period+1) return out;

  let gain=0, loss=0;
  for (let i=1;i<=period;i++){
    const ch = closes[i]-closes[i-1];
    if (ch>=0) gain += ch; else loss -= ch;
  }
  let avgGain = gain/period, avgLoss = loss/period;
  out[period] = avgLoss === 0 ? 100 : 100 - (100/(1 + (avgGain/avgLoss)));

  for (let i=period+1;i<closes.length;i++){
    const ch = closes[i]-closes[i-1];
    const g = ch>0 ? ch : 0;
    const l = ch<0 ? -ch : 0;
    avgGain = (avgGain*(period-1) + g)/period;
    avgLoss = (avgLoss*(period-1) + l)/period;
    out[i] = avgLoss === 0 ? 100 : 100 - (100/(1 + (avgGain/avgLoss)));
  }
  return out;
}
function MACD(closes, fast=12, slow=26, signal=9){
  const emaF = EMA(closes, fast);
  const emaS = EMA(closes, slow);
  const macd = closes.map((_,i)=>{
    if (emaF[i]==null || emaS[i]==null) return null;
    return emaF[i]-emaS[i];
  });
  const signalLine = EMA(macd.map(v=>v==null?0:v), signal).map((v,i)=> macd[i]==null?null:v);
  const hist = macd.map((v,i)=>{
    if (v==null || signalLine[i]==null) return null;
    return v - signalLine[i];
  });
  return {macd, signal: signalLine, hist};
}

/*********** رسم الملخّص ***********/
function renderSummary(series, opts, emaFarr, emaSarr, rsiArr, macdObj){
  if (!els.summary) return;
  const n = series.length - 1;
  if (n < 0) return;

  const lastPrice = series[n].price;
  const lastDate = series[n].date;
  const emaF = emaFarr[n], emaS = emaSarr[n];
  const rsi = rsiArr[n];
  const macd = macdObj.macd[n];

  let sig='حيادي';
  if (Number(emaF) > Number(emaS) && Number(rsi) < 70) sig='شراء';
  else if (Number(emaF) < Number(emaS) && Number(rsi) > 30) sig='بيع';

  els.summary.innerHTML = `
    <div class="grid">
      <div class="pill">آخر تحديث: ${fmtDateCell(lastDate)}</div>
      <div class="pill ${colorClass(sig)}" style="font-weight:700">${sig}</div>
      <div class="pill">السعر: ${fmtNum(lastPrice,2)}</div>
      <div class="pill">RSI: ${fmtNum(rsi,1)}</div>
      <div class="pill">MACD: ${fmtNum(macd,4)}</div>
    </div>
    <p class="signal warn" style="margin-top:8px">* ليست توصية استثمارية.</p>
  `;
}

/*********** “البيانات الأخيرة” مثل الصورة ***********/
function renderRecent(series, opts){
  if (!els.tableHead || !els.tableBody) return;

  const closes = series.map(s=>s.price);
  const emaFarr = EMA(closes, opts.emaFast);
  const emaSarr = EMA(closes, opts.emaSlow);
  const rsiArr  = RSI(closes,  opts.rsiPeriod);
  const macdObj = MACD(closes);

  // عنوان الأعمدة حسب الصورة
  els.tableHead.innerHTML =
    '<tr><th>EMA F</th><th>MACD</th><th>RSI</th><th>الإشارة</th><th>السعر</th><th>التاريخ</th></tr>';

  const last = series.slice(-10); // آخر 10 صفوف
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

  // ملخص أعلى الصفحة
  renderSummary(series, opts, emaFarr, emaSarr, rsiArr, macdObj);
}

/*********** اختيار المصدر ***********/
function resolveCsvUrl(){
  // إذا المستخدم كتب رابط، استخدمه
  const v = (els.csv && els.csv.value || '').trim();
  if (v) return v;

  // افتراضيًا: ملف 5 دقائق
  return DEFAULT_MINUTE_CSV;
}

/*********** التشغيل ***********/
async function runOnce(){
  try{
    const url = resolveCsvUrl();
    const series = await loadCSV(url);
    if (!series.length) throw new Error('لا توجد بيانات');

    // إعدادات المؤشرات من الحقول
    const opts = {
      emaFast: Number(els.emaFast?.value) || 12,
      emaSlow: Number(els.emaSlow?.value) || 26,
      rsiPeriod: Number(els.rsiPeriod?.value) || 14
    };

    renderRecent(series, opts);
  }catch(e){
    console.error(e);
    if (els.summary){
      els.summary.innerHTML = `<div class="bad">خطأ: ${e.message || e}</div>`;
    }
  }
}

// زر “حساب الإشارات الآن”
els.run?.addEventListener('click', runOnce);

// شغل تلقائي عند الفتح + كل 60 ثانية
runOnce();
setInterval(runOnce, 60*1000);
