/* =======================
   GoldSignals — app.js
   ======================= */

// عناصر الواجهة
const els = {
  csv:        document.getElementById('csvUrl')        || document.getElementById('csvInput'),
  tf5:        document.getElementById('tf-5')          || document.getElementById('tf5'),
  tf60:       document.getElementById('tf-60')         || document.getElementById('tf60'),
  tf1d:       document.getElementById('tf-1d')         || document.getElementById('tf1d'),
  emaF:       document.getElementById('emaFast')       || document.getElementById('ema_f'),
  emaS:       document.getElementById('emaSlow')       || document.getElementById('ema_s'),
  rsiP:       document.getElementById('rsiPeriod')     || document.getElementById('rsi_p'),
  runBtn:     document.getElementById('runBtn')        || document.getElementById('run'),
  // السعر الحي
  livePrice:  document.getElementById('livePrice'),
  liveTime:   document.getElementById('liveTime'),
  liveSummary:document.getElementById('liveSummary'),
  // Pivot
  r1:         document.getElementById('r1'),
  r2:         document.getElementById('r2'),
  r3:         document.getElementById('r3'),
  s1:         document.getElementById('s1'),
  s2:         document.getElementById('s2'),
  s3:         document.getElementById('s3'),
  pivot:      document.getElementById('pivot'),
  // الجدول
  table:      (function(){
                const t = document.getElementById('dataTable') || document.getElementById('table');
                if (!t) return null;
                // ضمنيًا: أنشئ thead/tbody إذا غير موجودين
                if (!t.querySelector('thead')) t.insertAdjacentHTML('afterbegin','<thead></thead>');
                if (!t.querySelector('tbody')) t.insertAdjacentHTML('beforeend','<tbody></tbody>');
                return t;
              })(),
};

// إعدادات افتراضية
const DEFAULT_CSV = (function () {
  // يعمل على GitHub Pages لنفس المستودع
  // مثال: https://username.github.io/RepoName/XAUUSD_5min.csv
  const base = location.origin;
  // لو مستضيف داخل مجلد فرعي (مثلاً /GoldSignalPWA/):
  const path = location.pathname.replace(/\/index\.html?$/,'').replace(/\/$/,'');
  return `${base}${path}/XAUUSD_5min.csv`;
})();

let STATE = {
  timeframe: '5m', // '5m' | '1h' | '1d'
  rows5m:    [],   // بيانات 5 دقائق خام
  viewRows:  [],   // بيانات بعد إعادة التشكيل حسب الإطار
};

// أدوات مساعدة
const fmt2 = n => (Number.isFinite(n) ? Number(n).toFixed(2) : '—');
const fmt4 = n => (Number.isFinite(n) ? Number(n).toFixed(4) : '—');
function fmtIso(d){
  try{
    const z = new Date(d);
    const y = z.getFullYear(), m = String(z.getMonth()+1).padStart(2,'0'), da=String(z.getDate()).padStart(2,'0');
    const hh = String(z.getHours()).padStart(2,'0'), mi=String(z.getMinutes()).padStart(2,'0'), ss=String(z.getSeconds()).padStart(2,'0');
    return `${y}-${m}-${da} ${hh}:${mi}:${ss}`;
  }catch(_){ return String(d);}
}
function getCsvUrl(){
  const v = (els.csv && els.csv.value || '').trim();
  return v ? v : DEFAULT_CSV;
}

// قراءة CSV (مرن بالأسماء)
function parseCSV(text){
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map(h=>h.trim().toLowerCase());
  // حاول إيجاد الأعمدة
  const idxDate = head.findIndex(h => /date|time/.test(h));
  const idxClose= head.findIndex(h => /close|price|last|value/.test(h));
  if (idxDate < 0 || idxClose < 0) return [];

  const out = [];
  for (let i=1;i<lines.length;i++){
    const cols = lines[i].split(',');
    if (cols.length < Math.max(idxDate,idxClose)+1) continue;
    const t = new Date(cols[idxDate]);
    const close = parseFloat(cols[idxClose]);
    if (!Number.isFinite(close) || isNaN(t.getTime())) continue;
    out.push({ t, close });
  }
  // صعودًا حسب الزمن
  out.sort((a,b)=>a.t-b.t);
  return out;
}

// إعادة تشكيل: 5m -> 1h / 1d (نأخذ آخر كل فترة)
function resample(rows, kind){
  if (kind === '5m') return rows.slice();
  const map = new Map();
  for (const r of rows){
    let key;
    if (kind === '1h'){
      key = `${r.t.getUTCFullYear()}-${r.t.getUTCMonth()}-${r.t.getUTCDate()}-${r.t.getUTCHours()}`;
    }else{ // '1d'
      key = `${r.t.getUTCFullYear()}-${r.t.getUTCMonth()}-${r.t.getUTCDate()}`;
    }
    const cur = map.get(key) || [];
    cur.push(r);
    map.set(key, cur);
  }
  const out = [];
  for (const [_k, arr] of map){
    // آخر شمعة في الفترة
    const last = arr[arr.length-1];
    out.push({ t:last.t, close:last.close });
  }
  out.sort((a,b)=>a.t-b.t);
  return out;
}

// المؤشرات
function ema(series, period){
  const out = new Array(series.length).fill(null);
  if (series.length === 0) return out;
  const k = 2/(period+1);
  let prev = series[0];
  out[0] = prev;
  for (let i=1;i<series.length;i++){
    const val = series[i]*k + prev*(1-k);
    out[i] = val;
    prev = val;
  }
  return out;
}
function rsi14(series, period=14){
  const out = new Array(series.length).fill(null);
  if (series.length <= period) return out;
  // حساب أولي
  let gains=0, losses=0;
  for (let i=1;i<=period;i++){
    const diff = series[i]-series[i-1];
    if (diff>=0) gains += diff; else losses -= diff;
  }
  let avgGain = gains/period;
  let avgLoss = losses/period;
  out[period] = avgLoss === 0 ? 100 : 100 - (100/(1 + avgGain/avgLoss));
  for (let i=period+1;i<series.length;i++){
    const diff = series[i]-series[i-1];
    const gain = Math.max(0,diff);
    const loss = Math.max(0,-diff);
    avgGain = (avgGain*(period-1)+gain)/period;
    avgLoss = (avgLoss*(period-1)+loss)/period;
    out[i] = avgLoss === 0 ? 100 : 100 - (100/(1 + avgGain/avgLoss));
  }
  return out;
}
function computeIndicators(rows, emaFast=12, emaSlow=26, rsiP=14){
  const close = rows.map(r=>r.close);
  const emaF = ema(close, emaFast);
  const emaS = ema(close, emaSlow);
  const macd = close.map((_,i)=>{
    const f = emaF[i], s = emaS[i];
    return (f!=null && s!=null) ? (f - s) : null;
  });
  const rsi = rsi14(close, rsiP);
  // ألصق مع الصفوف
  return rows.map((r,i)=>({
    ...r,
    emaF: emaF[i],
    emaS: emaS[i],
    macd: macd[i],
    rsi:  rsi[i],
  }));
}

// قرار الإشارة
function decideSignal(r){
  if (r == null) return 'حيادي';
  const macd = r.macd, rsi = r.rsi;
  if (!Number.isFinite(macd) || !Number.isFinite(rsi)) return 'حيادي';
  if (macd > 0 && rsi >= 45 && rsi <= 70) return 'شراء';
  if (macd < 0 || rsi <= 40)             return 'بيع';
  return 'حيادي';
}

// Pivot S/R من آخر يوم كامل
function computePivots(rows5m){
  if (!rows5m.length) return null;
  // اجمع على أساس اليوم (UTC)
  const byDay = new Map();
  for (const r of rows5m){
    const key = `${r.t.getUTCFullYear()}-${r.t.getUTCMonth()}-${r.t.getUTCDate()}`;
    const arr = byDay.get(key) || [];
    arr.push(r);
    byDay.set(key, arr);
  }
  const keys = Array.from(byDay.keys()).sort(); // تصاعدي
  if (keys.length < 2) return null; // بدنا آخر يوم كامل (يوم سابق)
  const lastFullKey = keys[keys.length-2];
  const arr = byDay.get(lastFullKey);
  if (!arr || !arr.length) return null;
  const high = Math.max(...arr.map(x=>x.close));
  const low  = Math.min(...arr.map(x=>x.close));
  const close= arr[arr.length-1].close;
  const P = (high+low+close)/3;
  const R1 = 2*P - low;
  const S1 = 2*P - high;
  const R2 = P + (high - low);
  const S2 = P - (high - low);
  const R3 = high + 2*(P - low);
  const S3 = low  - 2*(high - P);
  return { P, R1, R2, R3, S1, S2, S3 };
}

// رسم الجدول (يمين→يسار)
function renderTable(rows){
  if (!els.table) return;
  const thead = els.table.querySelector('thead');
  const tbody = els.table.querySelector('tbody');
  thead.innerHTML = `
    <tr>
      <th>التاريخ</th>
      <th>السعر</th>
      <th>الإشارة</th>
      <th>RSI</th>
      <th>MACD</th>
      <th>EMA F</th>
    </tr>
  `;
  tbody.innerHTML = '';

  const lastN = rows.slice(-60).reverse(); // الأحدث أولًا
  for (const r of lastN){
    const sig = decideSignal(r);
    const cls = sig === 'شراء' ? 'good' : (sig === 'بيع' ? 'bad' : 'warn');

    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${fmtIso(r.t)}</td>` +
      `<td>${fmt2(r.close)}</td>` +
      `<td class="${cls}">${sig}</td>` +
      `<td>${fmt2(r.rsi)}</td>` +
      `<td>${fmt4(r.macd)}</td>` +
      `<td>${fmt2(r.emaF)}</td>`;
    tbody.appendChild(tr);
  }
}

// ملخّص أعلى (السعر الحي + إشارة آخر صف)
function renderLiveSummary(latestRow){
  if (!latestRow) return;
  if (els.livePrice) els.livePrice.textContent = fmt2(latestRow.close);
  if (els.liveTime)  els.liveTime.textContent  = fmtIso(latestRow.t);
  if (els.liveSummary){
    const sig = decideSignal(latestRow);
    els.liveSummary.textContent = sig;
    els.liveSummary.classList.remove('good','bad','warn');
    els.liveSummary.classList.add(sig==='شراء'?'good':(sig==='بيع'?'bad':'warn'));
  }
}

// رسم Pivot
function renderPivots(piv){
  if (!piv) return;
  if (els.pivot) els.pivot.textContent = fmt2(piv.P);
  if (els.r1) els.r1.textContent = fmt2(piv.R1);
  if (els.r2) els.r2.textContent = fmt2(piv.R2);
  if (els.r3) els.r3.textContent = fmt2(piv.R3);
  if (els.s1) els.s1.textContent = fmt2(piv.S1);
  if (els.s2) els.s2.textContent = fmt2(piv.S2);
  if (els.s3) els.s3.textContent = fmt2(piv.S3);
}

// تحميل CSV
async function loadCsv5m(){
  const url = getCsvUrl();
  // كسر الكاش كل مرة
  const src = url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();
  const res = await fetch(src, { cache:'no-store' });
  if (!res.ok) throw new Error('CSV fetch failed: '+res.status);
  const txt = await res.text();
  const rows = parseCSV(txt);
  if (!rows.length) throw new Error('CSV parse error / empty');
  return rows;
}

// إعادة حساب وعرض حسب الإطار الزمني الحالي
function recomputeAndRender(){
  const emaFast = Number(els.emaF?.value || 12);
  const emaSlow = Number(els.emaS?.value || 26);
  const rsiP    = Number(els.rsiP?.value || 14);

  // اختر مصدر العرض حسب الإطار
  const base = STATE.rows5m;
  let view = [];
  if (STATE.timeframe === '5m')      view = base;
  else if (STATE.timeframe === '1h') view = resample(base, '1h');
  else                               view = resample(base, '1d');

  // مؤشرات
  const withInd = computeIndicators(view, emaFast, emaSlow, rsiP);
  STATE.viewRows = withInd;

  // السعر الحي من 5 دقائق (آخر صف خام)
  const latestLive = STATE.rows5m[STATE.rows5m.length-1];
  renderLiveSummary(computeIndicators([latestLive], emaFast, emaSlow, rsiP)[0]);

  // Pivot من آخر يوم كامل
  const piv = computePivots(STATE.rows5m);
  renderPivots(piv);

  // جدول
  renderTable(withInd);
}

// زر "حساب الإشارات الآن"
if (els.runBtn){
  els.runBtn.addEventListener('click', async ()=>{
    try{
      const rows = await loadCsv5m();
      STATE.rows5m = rows;
      recomputeAndRender();
    }catch(e){
      alert('تعذّر تحميل/تحليل البيانات:\n' + e.message);
      console.error(e);
    }
  });
}

// أزرار الإطار الزمني (إن وُجدت)
function bindTimeframeBtn(btn, tf){
  if (!btn) return;
  btn.addEventListener('click', ()=>{
    STATE.timeframe = tf;
    recomputeAndRender();
    // تفعيل بصري (اختياري لو عندك CSS للحالة النشطة)
    [els.tf5, els.tf60, els.tf1d].forEach(b=>b&&b.classList.remove('active'));
    btn.classList.add('active');
  });
}
bindTimeframeBtn(els.tf5,  '5m');
bindTimeframeBtn(els.tf60, '1h');
bindTimeframeBtn(els.tf1d, '1d');

// تحديث السعر الحي كل 30 ثانية (من ملف 5 دقائق)
let liveTimer = null;
function startLiveLoop(){
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = setInterval(async ()=>{
    try{
      const rows = await loadCsv5m();
      // إذا تغيّر آخر ختم زمني، حدّث الحالة كلها وإلا حدّث السريع فقط
      const lastOld = STATE.rows5m.length ? STATE.rows5m[STATE.rows5m.length-1].t.getTime() : 0;
      const lastNew = rows[rows.length-1].t.getTime();
      STATE.rows5m = rows;

      // حدّث السعر الحي فورًا
      const emaFast = Number(els.emaF?.value || 12);
      const emaSlow = Number(els.emaS?.value || 26);
      const rsiP    = Number(els.rsiP?.value || 14);
      const latestLive = rows[rows.length-1];
      renderLiveSummary(computeIndicators([latestLive], emaFast, emaSlow, rsiP)[0]);

      // لو جاء صف جديد، أعد عرض الجدول والمحاور
      if (lastNew !== lastOld) {
        recomputeAndRender();
      }
    }catch(e){
      // لا تنبّه كل 30 ثانية — فقط اطبع بالكونسول
      console.warn('Live refresh failed:', e.message);
    }
  }, 30000);
}

// تحميل أولي وتشغيل
(async function init(){
  try{
    // قيَم افتراضية للمدخلات إن كانت فارغة
    if (els.emaF && !els.emaF.value) els.emaF.value = 12;
    if (els.emaS && !els.emaS.value) els.emaS.value = 26;
    if (els.rsiP && !els.rsiP.value) els.rsiP.value = 14;

    // حمّل الملف الافتراضي مباشرة لعرض أولي
    STATE.rows5m = await loadCsv5m();
    recomputeAndRender();
    startLiveLoop();
  }catch(e){
    console.error(e);
    alert('تعذّر التحميل الأولي للبيانات:\n' + e.message);
  }
})();
