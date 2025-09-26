/******************************
 * GoldSignals - app.js (Arabic)
 * - Live price via Cloudflare Worker
 * - CSV (5min) + تجميع ساعة/يوم محلياً
 * - EMA/RSI/MACD + Pivot (من OHLC اليومي السابق)
 * - جدول “البيانات الأخيرة”
 ******************************/

/*============================
= الإعدادات الأساسية
=============================*/

// رابط الـ Worker للسعر الحي (بدّله إذا لزم)
const LIVE_JSON_URL = 'https://goldprice-proxy.samer-mourtada.workers.dev/price';

// ملف CSV الافتراضي (5 دقائق) من نفس الريبو
const DEFAULT_5M_CSV = 'XAUUSD_5min.csv';

// عدد الصفوف المعروضة في جدول “البيانات الأخيرة”
const TABLE_ROWS = 60;

// تحديث السعر الحي كل كم ثانية
const LIVE_REFRESH_SEC = 30;

/*============================
= تحديد عناصر الواجهة (IDs)
=============================*/

// حقول/أزرار الإدخال
const elCsvInput     = document.getElementById('csvInput')      || document.getElementById('csvUrl');
const elBtnRun       = document.getElementById('runBtn')         || document.querySelector('[data-run]');
const elTf5          = document.getElementById('tf5')            || document.querySelector('[data-tf="5"]');
const elTf60         = document.getElementById('tf60')           || document.querySelector('[data-tf="60"]');
const elTfD          = document.getElementById('tfD')            || document.querySelector('[data-tf="1440"]');
const elSourceHint   = document.getElementById('sourceHint')     || document.getElementById('sourceNow');

// إعدادات المؤشرات
const elEmaFast      = document.getElementById('emaFast')        || document.querySelector('[data-ema-fast]');
const elEmaSlow      = document.getElementById('emaSlow')        || document.querySelector('[data-ema-slow]');
const elRsiPeriod    = document.getElementById('rsiPeriod')      || document.querySelector('[data-rsi]');

// السعر الحي + ملخص
const elLivePrice    = document.getElementById('livePrice')      || document.querySelector('[data-live-price]');
const elLiveTime     = document.getElementById('liveTime')       || document.querySelector('[data-live-time]');
const elSummaryText  = document.getElementById('summaryText')    || document.querySelector('[data-summary]');

// Pivot boxes
const elPivotP   = document.getElementById('pivotP') || document.querySelector('[data-pivot]');
const elR1       = document.getElementById('r1')     || document.querySelector('[data-r1]');
const elR2       = document.getElementById('r2')     || document.querySelector('[data-r2]');
const elR3       = document.getElementById('r3')     || document.querySelector('[data-r3]');
const elS1       = document.getElementById('s1')     || document.querySelector('[data-s1]');
const elS2       = document.getElementById('s2')     || document.querySelector('[data-s2]');
const elS3       = document.getElementById('s3')     || document.querySelector('[data-s3]');

// جدول البيانات الأخيرة
const elTableBody = document.getElementById('rowsBody') || document.querySelector('#rowsBody tbody') || document.querySelector('#rowsBody');

// بعض عناصر مساعدة (اختياري)
const elLivePanel = document.getElementById('livePanel') || document.querySelector('[data-live-panel]');

// حالة زمنية: 5=5 دقائق، 60=ساعة، 1440=يوم
let currentTF = 5;

/*============================
= أدوات مساعدة
=============================*/

const fmt = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmt4 = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4, minimumFractionDigits: 4 });
const fmtTime = (iso) => {
  try {
    const d = new Date(iso);
    return d.toISOString().replace('T', ' ').replace('Z', '');
  } catch { return String(iso); }
};

function setActiveTF(tf) {
  currentTF = tf;
  [elTf5, elTf60, elTfD].forEach(b => b && b.classList && b.classList.remove('active'));
  if (tf === 5 && elTf5)  elTf5.classList.add('active');
  if (tf === 60 && elTf60) elTf60.classList.add('active');
  if (tf === 1440 && elTfD) elTfD.classList.add('active');
}

function parseCsv(text) {
  // يدعم شكلين:
  // 1) Date,Close
  // 2) stooq: symbol,date,time,open,high,low,close,volume
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase();

  const out = [];
  if (header.includes('date') && header.includes('close') && !header.includes('symbol')) {
    // Date,Close
    for (let i = 1; i < lines.length; i++) {
      const [d, c] = lines[i].split(',');
      const ts = Date.parse(d);
      const close = Number(c);
      if (Number.isFinite(ts) && Number.isFinite(close)) out.push({ ts, close });
    }
  } else if (header.includes('symbol') && header.includes('date') && header.includes('time')) {
    // stooq CSV
    for (let i = 1; i < lines.length; i++) {
      const [sym, d, t, o, h, l, c/*, v*/] = lines[i].split(',');
      const ts = Date.parse(`${d}T${t}Z`);
      const close = Number(c);
      const high  = Number(h);
      const low   = Number(l);
      const open  = Number(o);
      if (Number.isFinite(ts) && Number.isFinite(close)) out.push({ ts, open, high, low, close });
    }
  }
  // ترتيب تصاعدي زمني
  out.sort((a,b)=>a.ts-b.ts);
  return out;
}

async function fetchCsv(url) {
  const u = (url && url.trim()) ? url.trim() : DEFAULT_5M_CSV;
  if (elSourceHint) elSourceHint.textContent = `المصدر الحالي: ${u}`;
  const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error(`CSV HTTP ${r.status}`);
  const text = await r.text();
  return parseCsv(text);
}

// تجميع إلى ساعة/يوم (OHLC + close)
function aggregateOHLC(rows, unitMinutes) {
  const ms = unitMinutes * 60 * 1000;
  const map = new Map();
  for (const row of rows) {
    const bucket = Math.floor(row.ts / ms) * ms;
    const rec = map.get(bucket);
    if (!rec) {
      map.set(bucket, { ts: bucket, open: row.open ?? row.close, high: row.high ?? row.close, low: row.low ?? row.close, close: row.close });
    } else {
      rec.high = Math.max(rec.high, row.high ?? row.close);
      rec.low  = Math.min(rec.low,  row.low  ?? row.close);
      rec.close = row.close;
    }
  }
  return Array.from(map.values()).sort((a,b)=>a.ts-b.ts);
}

function toCloseArray(rows) {
  return rows.map(r => ({ ts: r.ts, close: r.close }));
}

/*============================
= مؤشرات فنية
=============================*/

function calcEMA(prices, period) {
  const out = new Array(prices.length).fill(null);
  const k = 2 / (period + 1);
  let ema = null, sum = 0;
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i].close;
    if (i < period) {
      sum += p;
      if (i === period - 1) {
        ema = sum / period;
        out[i] = ema;
      }
    } else {
      ema = p * k + ema * (1 - k);
      out[i] = ema;
    }
  }
  return out;
}

function calcRSI(prices, period=14) {
  const out = new Array(prices.length).fill(null);
  let gain = 0, loss = 0;

  // seed
  for (let i = 1; i <= period; i++) {
    const diff = prices[i].close - prices[i-1].close;
    if (diff >= 0) gain += diff; else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain/avgLoss)));

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i].close - prices[i-1].close;
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain*(period-1) + g) / period;
    avgLoss = (avgLoss*(period-1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain/avgLoss)));
  }
  return out;
}

function calcMACD(prices, fast=12, slow=26, signal=9) {
  const emaF = calcEMA(prices, fast);
  const emaS = calcEMA(prices, slow);
  const macd = prices.map((_, i) => {
    const f = emaF[i], s = emaS[i];
    return (f != null && s != null) ? (f - s) : null;
  });
  // signal line (EMA على macd)
  const macdPts = macd.map((v,i)=>({ts: prices[i].ts, close: v==null?NaN:v}));
  const macdClean = macdPts.filter(p=>Number.isFinite(p.close));
  const sigArr = calcEMA(macdClean, signal);
  // أعد الإشارة بطول المصفوفة
  const signalFull = new Array(prices.length).fill(null);
  let j = 0;
  for (let i = 0; i < prices.length; i++) {
    if (Number.isFinite(macdPts[i]?.close)) {
      signalFull[i] = sigArr[j++];
    }
  }
  return { emaF, emaS, macd, signal: signalFull };
}

function classifySignal(rsi, macdVal) {
  if (macdVal == null || rsi == null) return 'حيادي';
  if (macdVal > 0 && rsi >= 50 && rsi <= 70) return 'شراء';
  if (macdVal < 0 && rsi <= 50)            return 'بيع';
  return 'حيادي';
}

/*============================
= Pivot من اليومي السابق
=============================*/
function calcPivotsFromDaily(dailyOHLC) {
  if (!dailyOHLC || dailyOHLC.length < 2) return null;
  const y = dailyOHLC[dailyOHLC.length - 2]; // اليوم السابق
  const H = y.high, L = y.low, C = y.close;
  if (![H,L,C].every(Number.isFinite)) return null;

  const P  = (H + L + C) / 3;
  const R1 = 2*P - L;
  const S1 = 2*P - H;
  const R2 = P + (H - L);
  const S2 = P - (H - L);
  const R3 = H + 2*(P - L);
  const S3 = L - 2*(H - P);
  return { P,R1,R2,R3,S1,S2,S3 };
}

/*============================
= تحديث الواجهة
=============================*/
function paintPivots(p) {
  if (!p) return;
  if (elPivotP) elPivotP.textContent = fmt.format(p.P);
  if (elR1) elR1.textContent = fmt.format(p.R1);
  if (elR2) elR2.textContent = fmt.format(p.R2);
  if (elR3) elR3.textContent = fmt.format(p.R3);
  if (elS1) elS1.textContent = fmt.format(p.S1);
  if (elS2) elS2.textContent = fmt.format(p.S2);
  if (elS3) elS3.textContent = fmt.format(p.S3);
}

function paintSummary(price, rsi, macdVal) {
  if (!elSummaryText) return;
  const sig = classifySignal(rsi, macdVal);
  elSummaryText.textContent = sig;
  elSummaryText.style.color = sig === 'شراء' ? '#10b981' : sig === 'بيع' ? '#ef4444' : '#f59e0b';
}

function paintLive(price, isoTime) {
  if (elLivePrice && Number.isFinite(price)) elLivePrice.textContent = fmt.format(price);
  if (elLiveTime && isoTime) elLiveTime.textContent = fmtTime(isoTime);
}

function tr(html){ const tr=document.createElement('tr'); tr.innerHTML=html; return tr; }

function paintTable(rows) {
  if (!elTableBody) return;
  elTableBody.innerHTML = '';
  const last = rows.slice(-TABLE_ROWS).reverse(); // الأحدث أولاً

  for (const r of last) {
    const sig = classifySignal(r.rsi, r.macd);
    const sigColor = sig === 'شراء' ? 'style="color:#10b981;font-weight:600"' :
                     sig === 'بيع'   ? 'style="color:#ef4444;font-weight:600"' :
                                       'style="color:#f59e0b;font-weight:600"';
    // ترتيب الأعمدة: السعر | الإشارة | RSI | MACD | EMA F
    elTableBody.appendChild(tr(`
      <td>${fmt.format(r.price)}</td>
      <td ${sigColor}>${sig}</td>
      <td>${Number.isFinite(r.rsi)? fmt.format(r.rsi): '—'}</td>
      <td>${Number.isFinite(r.macd)? fmt4.format(r.macd): '—'}</td>
      <td>${Number.isFinite(r.emaF)? fmt.format(r.emaF): '—'}</td>
    `));
  }
}

/*============================
= تحميل ومعالجة البيانات
=============================*/
async function runAnalysis() {
  try {
    const csvUrl = elCsvInput ? elCsvInput.value.trim() : '';
    const emaF = parseInt(elEmaFast?.value || '12', 10);
    const emaS = parseInt(elEmaSlow?.value || '26', 10);
    const rsiP = parseInt(elRsiPeriod?.value || '14', 10);

    // 1) حمل 5 دقائق دائماً (من الرابط أو الافتراضي)
    const raw5 = await fetchCsv(csvUrl);

    // 2) حدّد السلسلة المطلوبة حسب TF
    let seriesClose = raw5;
    let dailyOHLC = aggregateOHLC(raw5, 1440);
    if (currentTF === 60) {
      seriesClose = toCloseArray(aggregateOHLC(raw5, 60));
    } else if (currentTF === 1440) {
      seriesClose = toCloseArray(dailyOHLC);
    }

    if (!seriesClose || seriesClose.length < Math.max(emaS, rsiP) + 5) {
      throw new Error('بيانات غير كافية للحساب.');
    }

    // 3) مؤشرات
    const emaFastArr = calcEMA(seriesClose, emaF);
    const emaSlowArr = calcEMA(seriesClose, emaS);
    const rsiArr     = calcRSI(seriesClose, rsiP);
    const macdObj    = calcMACD(seriesClose, emaF, emaS, 9);

    // 4) ملخص آخر نقطة
    const lastIdx = seriesClose.length - 1;
    const lastPrice = seriesClose[lastIdx].close;
    const lastRSI   = rsiArr[lastIdx];
    const lastMACD  = macdObj.macd[lastIdx];
    paintSummary(lastPrice, lastRSI, lastMACD);

    // 5) pivots من اليوم السابق اليومي
    const piv = calcPivotsFromDaily(dailyOHLC);
    if (piv) paintPivots(piv);

    // 6) جدول البيانات الأخيرة
    const rows = [];
    for (let i = 0; i < seriesClose.length; i++) {
      rows.push({
        ts: seriesClose[i].ts,
        price: seriesClose[i].close,
        rsi: rsiArr[i],
        macd: macdObj.macd[i],
        emaF: emaFastArr[i]
      });
    }
    paintTable(rows);

  } catch (e) {
    alert(`تعذّر تحميل/تحليل البيانات: ${e.message || e}`);
    console.error(e);
  }
}

/*============================
= السعر الحي (كل 30 ثانية)
=============================*/
async function refreshLivePrice() {
  try {
    const r = await fetch(LIVE_JSON_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j && j.ok && Number.isFinite(j.price)) {
      paintLive(j.price, j.isoTime || (j.date && j.time ? `${j.date}T${j.time}Z` : null));
    }
  } catch (e) {
    console.warn('Live price error:', e);
    // ما منعمل alert حتى ما نزعج المستخدم كل 30 ثانية
  }
}

/*============================
= ربط الأحداث وبدء التشغيل
=============================*/

// تفعيل الأزرار الزمنية
if (elTf5)  elTf5.addEventListener('click',  ()=>{ setActiveTF(5);    runAnalysis(); });
if (elTf60) elTf60.addEventListener('click', ()=>{ setActiveTF(60);   runAnalysis(); });
if (elTfD)  elTfD.addEventListener('click',  ()=>{ setActiveTF(1440); runAnalysis(); });

// زر “حساب الإشارات الآن”
if (elBtnRun) elBtnRun.addEventListener('click', runAnalysis);

// حفظ/مسح رابط CSV من الـ localStorage (اختياري)
const LS_KEY = 'gs_csv_url';
if (elCsvInput) {
  // لو خانة الرابط فاضية ما منخزّن شي
  const saved = localStorage.getItem(LS_KEY) || '';
  if (!elCsvInput.value && saved) elCsvInput.value = saved;
  elCsvInput.addEventListener('input', () => {
    const v = elCsvInput.value.trim();
    if (v) localStorage.setItem(LS_KEY, v);
    else   localStorage.removeItem(LS_KEY);
  });
}

// البداية: TF = 5 دقائق
setActiveTF(5);
runAnalysis();

// تحديث السعر الحي فوراً ثم كل 30 ثانية
refreshLivePrice();
setInterval(refreshLivePrice, LIVE_REFRESH_SEC * 1000);
