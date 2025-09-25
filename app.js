/***** إعدادات افتراضيّة *****/
const TF_MAP = {
  '5m': { label: '5 دقايق', file: 'XAUUSD_5min.csv' },
  '1h': { label: 'ساعة',    file: 'XAUUSD_5min.csv' }, // سنقرأ 5m أيضًا ونعيد تجميعه
  '1d': { label: 'يوم',      file: 'XAUUSD_5min.csv' }  // نفس الشيء
};
let currentTF = '5m';

/***** DOM *****/
const csvInput   = document.getElementById('csvUrl');
const tfHint     = document.getElementById('tfHint');
const runBtn     = document.getElementById('runBtn');

const emaFastInp = document.getElementById('emaFast');
const emaSlowInp = document.getElementById('emaSlow');
const rsiInp     = document.getElementById('rsiPeriod');

const livePrice  = document.getElementById('livePrice');
const lastTsEl   = document.getElementById('lastTs');
const signalNow  = document.getElementById('signalNow');
const signalSub  = document.getElementById('signalSub');

const indTbody   = document.getElementById('indTbody');
const recentTbd  = document.getElementById('recentTbody');

['R1','R2','R3','S1','S2','S3'].forEach(id=>{ if(!document.getElementById(id)) { const s=document.createElement('span'); s.id=id; }});

/***** أدوات صغيرة *****/
const fmt = n => (n==null || isNaN(n)) ? '—' : Number(n).toFixed(2);
function parseCSV(text){
  // يتوقع رأس: Date,Close  (أو date,close)
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map(s=>s.trim().toLowerCase());
  const iDate = head.indexOf('date');
  const iClose = head.indexOf('close');
  if (iDate<0 || iClose<0) return [];
  const rows = [];
  for (let i=1;i<lines.length;i++){
    const parts = lines[i].split(',');
    const d = new Date(parts[iDate]);
    const c = Number(parts[iClose]);
    if (!isNaN(d.getTime()) && !isNaN(c)){
      rows.push({ t: d, close: c });
    }
  }
  // ترتيب تصاعدي بالزمن
  rows.sort((a,b)=>a.t - b.t);
  return rows;
}

// تجميع 5 دقائق إلى ساعة: آخر إغلاق ضمن كل ساعة
function resampleHourly(rows5){
  const map = new Map(); // key: YYYY-MM-DD HH
  rows5.forEach(r=>{
    const k = r.t.getUTCFullYear()+'-'+String(r.t.getUTCMonth()+1).padStart(2,'0')+'-'+String(r.t.getUTCDate()).padStart(2,'0')+' '+String(r.t.getUTCHours()).padStart(2,'0');
    const prev = map.get(k);
    if (!prev || r.t > prev.t) map.set(k, r);
  });
  return Array.from(map.values()).sort((a,b)=>a.t-b.t);
}

// تجميع 5 دقائق إلى يوم: آخر إغلاق ضمن كل يوم (UTC)
function resampleDaily(rows5){
  const map = new Map(); // key: YYYY-MM-DD
  rows5.forEach(r=>{
    const k = r.t.getUTCFullYear()+'-'+String(r.t.getUTCMonth()+1).padStart(2,'0')+'-'+String(r.t.getUTCDate()).padStart(2,'0');
    const prev = map.get(k);
    if (!prev || r.t > prev.t) map.set(k, r);
  });
  return Array.from(map.values()).sort((a,b)=>a.t-b.t);
}

// EMA
function ema(values, period){
  const out = [];
  if (values.length === 0) return out;
  const k = 2/(period+1);
  let emaPrev = values[0];
  out.push(emaPrev);
  for (let i=1;i<values.length;i++){
    emaPrev = values[i]*k + emaPrev*(1-k);
    out.push(emaPrev);
  }
  return out;
}

// RSI (Wilder)
function rsi(values, period=14){
  const out = Array(values.length).fill(null);
  if (values.length <= period) return out;
  const changes = [];
  for (let i=1;i<values.length;i++){
    changes.push(values[i]-values[i-1]);
  }
  let gains=0, losses=0;
  for (let i=0;i<period;i++){
    const c = changes[i];
    if (c>=0) gains+=c; else losses-=c;
  }
  gains/=period; losses/=period;
  let rs = losses===0 ? 100 : gains/losses;
  out[period] = 100 - 100/(1+rs);

  for (let i=period+1;i<values.length;i++){
    const c = changes[i-1];
    const gain = c>0?c:0, loss = c<0? -c:0;
    gains = (gains*(period-1)+gain)/period;
    losses= (losses*(period-1)+loss)/period;
    rs = losses===0 ? 100 : gains/losses;
    out[i] = 100 - 100/(1+rs);
  }
  return out;
}

// دعم/مقاومة (Pivot Classic) باستخدام آخر 20 شمعة تقريبًا
function pivotsFromSeries(series){
  if (series.length < 2) return null;
  const last20 = series.slice(-20).map(r=>r.close);
  const H = Math.max(...last20);
  const L = Math.min(...last20);
  const C = series[series.length-1].close;
  const P = (H+L+C)/3;
  const R1 = 2*P - L;
  const S1 = 2*P - H;
  const R2 = P + (H-L);
  const S2 = P - (H-L);
  const R3 = H + 2*(P-L);
  const S3 = L - 2*(H-P);
  return {R1,R2,R3,S1,S2,S3};
}

// تحديد إشارة (بسيطة): MACD و RSI
function signalOf(rsiVal, macdVal){
  if (rsiVal==null || macdVal==null) return 'حيادي';
  if (macdVal>0 && rsiVal>=45 && rsiVal<=70) return 'شراء';
  if (macdVal<0 && (rsiVal>=30 && rsiVal<=55 ? false : true)) return 'بيع';
  return 'حيادي';
}

/***** اختيار الإطار الزمني *****/
function activateTfButton(tf){
  currentTF = tf;
  document.querySelectorAll('#tfGroup .pill-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.tf===tf);
  });
  if (tfHint) tfHint.textContent = `المصدر الحالي: ${TF_MAP[tf].label} (${TF_MAP[tf].file})`;
  if (csvInput && !csvInput.value.trim()){
    csvInput.placeholder = location.origin + '/' + TF_MAP['5m'].file + ' (يُستخدم دائمًا ويُعاد تجميعه محليًا)';
  }
}

/***** جلب CSV (5m دائمًا) مع رابط مخصص اختياري *****/
async function fetch5mCsvText(){
  const custom = csvInput ? csvInput.value.trim() : '';
  const url = custom || (location.origin + '/' + TF_MAP['5m'].file);
  const r = await fetch(url, { cache:'no-store' });
  if (!r.ok) throw new Error('HTTP '+r.status);
  return await r.text();
}

/***** الدورة الرئيسية *****/
async function runSignals(){
  try{
    runBtn.disabled = true;

    // 1) اقرأ 5m
    const csvText = await fetch5mCsvText();
    const rows5 = parseCSV(csvText);
    if (rows5.length === 0) throw new Error('CSV فارغ أو رأس غير صحيح (ينبغي Date,Close)');

    // 2) اختَر السلسلة بحسب الإطار (تجميع محلي)
    let series = rows5;
    if (currentTF === '1h') series = resampleHourly(rows5);
    if (currentTF === '1d') series = resampleDaily(rows5);

    // 3) احسب المؤشرات
    const closes = series.map(r=>r.close);
    const emaF = ema(closes, Number(emaFastInp.value||12));
    const emaS = ema(closes, Number(emaSlowInp.value||26));
    const macd = closes.map((_,i)=> (emaF[i]!=null && emaS[i]!=null) ? (emaF[i]-emaS[i]) : null);
    const rsiArr = rsi(closes, Number(rsiInp.value||14));

    // 4) ملخص سريع
    const last = series[series.length-1];
    livePrice.textContent = fmt(last.close);
    lastTsEl.textContent = 'آخر تحديث: ' + last.t.toISOString().replace('T',' ').slice(0,19);

    const lastRSI = rsiArr[rsiArr.length-1];
    const lastMACD= macd[macd.length-1];
    const sig = signalOf(lastRSI, lastMACD);
    signalNow.textContent = sig;
    signalNow.classList.remove('good','bad','warn');
    if (sig==='شراء') signalNow.classList.add('good');
    else if (sig==='بيع') signalNow.classList.add('bad');
    else signalNow.classList.add('warn');
    signalSub.textContent = `RSI: ${fmt(lastRSI)} • MACD: ${fmt(lastMACD)}`;

    // 5) جدول المؤشرات الحالية
    indTbody.innerHTML = '';
    const addRow = (name,val,sugg) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${name}</td><td>${fmt(val)}</td><td>${sugg||'—'}</td>`;
      indTbody.appendChild(tr);
    };
    addRow('EMA سريع', emaF[emaF.length-1], last.close>emaF[emaF.length-1] ? 'شراء' : 'بيع');
    addRow('EMA بطيء', emaS[emaS.length-1], last.close>emaS[emaS.length-1] ? 'شراء' : 'بيع');
    addRow('MACD', lastMACD, lastMACD>0 ? 'شراء' : 'بيع');
    addRow('RSI', lastRSI, lastRSI>70 ? 'بيع' : lastRSI<30 ? 'شراء' : 'حيادي');

    // 6) دعم/مقاومة
    const pv = pivotsFromSeries(series);
    if (pv){
      ['R3','R2','R1','S1','S2','S3'].forEach(k=>{
        const el = document.getElementById(k);
        if (el) el.textContent = fmt(pv[k]);
      });
    }

    // 7) جدول «البيانات الأخيرة» (آخر 6 صفوف)
    recentTbd.innerHTML = '';
    const N = 6;
    const start = Math.max(0, series.length - N);
    for (let i=series.length-1;i>=start;i--){
      const r = series[i];
      const rsiV = rsiArr[i], macdV = macd[i];
      const s = signalOf(rsiV, macdV);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.t.toISOString().replace('T',' ').slice(0,19)}</td>
        <td>${fmt(r.close)}</td>
        <td class="${s==='شراء'?'good':s==='بيع'?'bad':'warn'}">${s}</td>
        <td>${fmt(rsiV)}</td>
        <td>${fmt(macdV)}</td>
      `;
      recentTbd.appendChild(tr);
    }

  }catch(err){
    alert('تعذّر تحميل/تحليل البيانات: ' + err.message);
    console.error(err);
  }finally{
    runBtn.disabled = false;
  }
}

/***** ربط الأحداث *****/
document.querySelectorAll('#tfGroup .pill-btn').forEach(b=>{
  b.addEventListener('click', ()=>{
    activateTfButton(b.dataset.tf);
    runSignals(); // احسب مباشرة عند تغيير الإطار
  });
});
activateTfButton('5m');

runBtn.addEventListener('click', runSignals);

// تشغيل أولي
runSignals();
