/* ======================= GoldSignals • app.js (PRO+ patched) =======================
   - يبقي ترتيب المصادر: workerjs أولاً ثم gold-ticks
   - يتحقق من صحة JSON والسعر (sanity 800..10000 لـ XAUUSD)
   - fallback تلقائي إلى المصدر التالي إذا الأول غير صحي
   - لا يستخدم أي كاش للحي
*/

/* --------- إعداد عام --------- */
const LIVE_SOURCES = [
  'https://workerjs.samer-mourtada.workers.dev/price',   // bridge أولاً
  'https://gold-ticks.samer-mourtada.workers.dev/price'  // fallback
];
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const LIVE_REFRESH_SEC = 1;
const TABLE_ROWS       = 80;

const $ = (id)=>document.getElementById(id);

/* عناصر DOM */
const elCsvInput=$('csvInput'), elBtnRun=$('runBtn');
const elTf5=$('tf5'), elTf30=$('tf30'), elTf60=$('tf60'), elTfD=$('tfD');
const elProMode=$('proMode'), elMtfConfirm=$('mtfConfirm');
const elLivePrice=$('livePrice'), elLiveTime=$('liveTime');
const elSummaryText=$('summaryText'), elAdviceText=$('adviceText');

/* تنسيقات */
const nf2=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const dtfNY=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
function fmtLocalDateTime(ts){const d=new Date(ts);return `${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} ${d.toLocaleDateString('en-CA')}`;}

/* إعدادات */
let PRO_MODE=false, MTF_CONFIRM=true;
let currentTF=5, LAST_LIVE=null;

/* ===== أدوات مساعدة ===== */
function tfLabel(tf){return tf===5?'5 دقائق':tf===30?'30 دقيقة':tf===60?'ساعة':tf===1440?'يوم (NY)':tf+'m';}

/* ---------------- CSV (مكانه محفوظ لوظيفتك الحالية) ---------------- */
async function fetchCsv(url){ /* placeholder compatible with مشروعك */ return []; }

/* ---------------- السعر الحي: فحص صحة + fallback ---------------- */
function healthyJson(j){
  if(!j || (j.ok===false)) return false;
  const p = Number(j.price);
  if(!Number.isFinite(p)) return false;
  if(j.symbol && j.symbol!=="XAUUSD") return false;
  // نطاق منطقي للذهب بالأونصة
  if(p<800 || p>10000) return false;
  // زمن حديث إن وُجد
  const ts = Number(j.ts||0);
  if(ts && Math.abs(Date.now()-ts) > 60_000) return false;
  return true;
}

async function getOne(url, timeoutMs=2500){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), timeoutMs);
  try{
    const r = await fetch(url + (url.includes('?')?'&':'?') + 't=' + Date.now(), { cache:'no-store', mode:'cors', signal: ctl.signal });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const ct=(r.headers.get('content-type')||'').toLowerCase();
    const raw = await r.text();
    const j = (ct.includes('json') || raw.trim().startsWith('{')) ? JSON.parse(raw) : null;
    if(healthyJson(j)) return j;
    throw new Error('unhealthy_json');
  } finally{ clearTimeout(t); }
}

async function fetchLivePrice(){
  // جرّب المصادر بالترتيب: workerjs ثم gold-ticks
  for(const src of LIVE_SOURCES){
    try{
      const j = await getOne(src, 2500);
      return { price: +j.price, ts: +j.ts || Date.now(), raw: j, used: src };
    }catch(e){ /* جرّب اللي بعده */ }
  }
  throw new Error('تعذّر جلب السعر الحي من جميع المصادر');
}

/* ---------------- واجهة مبسطة للرسم/النص ---------------- */
function paintLive(price,ts){
  if(Number.isFinite(price) && elLivePrice) elLivePrice.textContent = nf2.format(price);
  if(ts && elLiveTime) elLiveTime.textContent = fmtLocalDateTime(ts);
}
function paintSummary(text){ if(elSummaryText){ elSummaryText.textContent=text; elSummaryText.style.color='#f59e0b'; }}

/* ---------------- تشغيل حي ---------------- */
async function refreshLive(){
  try{
    const res = await fetchLivePrice();
    const price = res.price, t = res.ts;
    // فلتر spike أساسي (0.7%) إذا كان لدينا قيمة سابقة
    if(Number.isFinite(window.__livePrice)){
      const pct = Math.abs(price-window.__livePrice)/window.__livePrice;
      if(pct>0.007){ console.warn('Spike filtered',pct, res.used); return; }
    }
    window.__livePrice = price; window.__liveTimeMs = t; LAST_LIVE={price,timeMs:t};
    paintLive(price,t);
  }catch(e){
    console.warn('Live error:', e);
  }
}

/* ---------------- أحداث ---------------- */
function setActiveTF(tf){ currentTF=tf; [elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));
  if(tf===5)elTf5?.classList?.add('active'); if(tf===30)elTf30?.classList?.add('active');
  if(tf===60)elTf60?.classList?.add('active'); if(tf===1440)elTfD?.classList?.add('active'); }

elTf5?.addEventListener('click',()=>{setActiveTF(5);});
elTf30?.addEventListener('click',()=>{setActiveTF(30);});
elTf60?.addEventListener('click',()=>{setActiveTF(60);});
elTfD?.addEventListener('click',()=>{setActiveTF(1440);});

/* تشغيل أولي */
setActiveTF(5);
refreshLive();
setInterval(refreshLive, LIVE_REFRESH_SEC*1000);

/* نهاية app.js (patched) */
