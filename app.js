/* ========================= GoldSignals • app.js (NY Pivot + Pro) =========================
   - Live price with multi-source fallback
   - Trading hours filter (America/New_York)
   - Strong MTF confirm (30m/60m)
   - Pivot distance filter
   - Risk mgmt: Partial TP, BE move, ATR trailing
   - Backtest with spread/slippage/commission
   - Alerts: sound + Web Notifications + optional Telegram
   - Settings persisted in localStorage
========================================================================================== */

/*==================== إعدادات عامة قابلة للتعديل ====================*/
const LIVE_SOURCES = [
  'https://goldprice-proxy.samer-mourtada.workers.dev/price',       // المصدر 1
  'https://api.metals.live/v1/spot/gold',                            // المصدر 2 (fallback: يرجع مصفوفة [price])
  'https://open.er-api.com/v6/latest/USD'                            // dummy (لن يُستعمل إلا للطوارئ)
];
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const TABLE_ROWS       = 80;
const LIVE_REFRESH_SEC = 1;     // تحديث السعر الحي كل ثانية
const MAX_LOOKBACK_BARS= 1500;  // للاختبار

/* ساعات العمل (نيويورك) */
const ENABLE_MARKET_HOURS = true;
const NY_TRADE_START = {hour: 8, minute: 0};   // 08:00 NY
const NY_TRADE_END   = {hour:17, minute: 0};   // 17:00 NY

/* Pivot distance filter (بالدولار) – لا ندخل إذا الدخول قريب من Pivot/R/S أقل من هذا */
let PIVOT_MIN_DISTANCE = 0.7;

/* Backtest تكاليف واقعية بسيطة */
const BT_SPREAD    = 0.05;   // فرق السعر
const BT_SLIPPAGE  = 0.03;   // انزلاق
const BT_COMMISSION= 0.0;    // عمولة ثابتة لكل صفقة (بالدولار)

/* Telegram (اختياري). إذا تركتهم فاضيين لن يُرسل شيء */
const TELEGRAM_BOT_TOKEN = '';     // وضع التوكن إن توفر
const TELEGRAM_CHAT_ID   = '';     // وضع chat_id إن توفر

/*==================== عناصر الواجهة ====================*/
const $ = (id) => document.getElementById(id);
const elCsvInput   = $('csvInput');
const elTf5        = $('tf5');
const elTf30       = $('tf30');
const elTf60       = $('tf60');
const elTfD        = $('tfD');
const elBtnRun     = $('runBtn');

const elProMode    = $('proMode');
const elMtfConfirm = $('mtfConfirm');

const elLivePrice  = $('livePrice');
const elLiveTime   = $('liveTime');
const elSummaryText= $('summaryText');
const elAdviceText = $('adviceText');

const elIndRSI  = $('indRSI');
const elIndMACD = $('indMACD');
const elIndEMAF = $('indEMAF');
const elIndEMAS = $('indEMAS');
const elIndStoch= $('indStoch');
const elIndBB   = $('indBB');

const elPivotP = $('pivotP');
const elR1 = $('r1'), elR2 = $('r2'), elR3 = $('r3');
const elS1 = $('s1'), elS2 = $('s2'), elS3 = $('s3');

const elRowsBody = $('rowsBody');

/* إعدادات المؤشرات */
const elEmaFast   = $('emaFast');
const elEmaSlow   = $('emaSlow');
const elRsiPeriod = $('rsiPeriod');

/* إعدادات ATR/SL/TP */
const elAtrPeriod = $('atrPeriod');
const elSlMult    = $('slMult');
const elTp1Mult   = $('tp1Mult');
const elTp2Mult   = $('tp2Mult');
const elAtrMinPct = $('atrMinPct');
const elAtrMaxPct = $('atrMaxPct');

/* Position sizing */
const elAcctSize  = $('acctSize');
const elRiskPct   = $('riskPct');

/* مؤشرات إضافية */
const elUseStoch  = $('useStoch');
const elStochK    = $('stochK');
const elStochD    = $('stochD');
const elUseBB     = $('useBB');
const elBBPeriod  = $('bbPeriod');
const elBBStd     = $('bbStd');

/* تنبيه الاقتراب */
const elAlertEnable  = $('alertEnable');
const elAlertDist    = $('alertDistance');

/* Backtest */
const elBtTf      = $('btTf');
const elBtBars    = $('btBars');
const elBtRun     = $('btRun');
const elBtResult  = $('btResult');

/*==================== أرقام وتواريخ ====================*/
const nf2 = new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat('en-US', {minimumFractionDigits:4, maximumFractionDigits:4});
function fmtLocalDateTime(ts){
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-CA');
  const time = d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  return `${time} ${date}`;
}
function toLocalDate(ts){ return new Date(ts).toLocaleDateString('en-CA'); }
function toLocalTime(ts){ return new Date(ts).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}); }

/*==================== حالة وإعدادات ====================*/
let EMA_FAST, EMA_SLOW, RSI_PER;
let ATR_PERIOD, SL_ATR_MULT, TP1_ATR_MULT, TP2_ATR_MULT, ATR_MIN_PCT, ATR_MAX_PCT;
let ACCT_SIZE, RISK_PCT;
let PRO_MODE, MTF_CONFIRM, USE_STOCH, STOCH_K, STOCH_D, USE_BB, BB_PERIOD, BB_STD;

function loadSettings(){
  const getNum = (el,def)=> parseFloat(el?.value ?? def);
  const getInt = (el,def)=> parseInt(el?.value ?? def,10);

  EMA_FAST = getInt(elEmaFast,12);
  EMA_SLOW = getInt(elEmaSlow,26);
  RSI_PER  = getInt(elRsiPeriod,14);

  ATR_PERIOD   = Math.max(2, getInt(elAtrPeriod,14));
  SL_ATR_MULT  = getNum(elSlMult,1.5);
  TP1_ATR_MULT = getNum(elTp1Mult,1.0);
  TP2_ATR_MULT = getNum(elTp2Mult,2.0);
  ATR_MIN_PCT  = getNum(elAtrMinPct,0.05);
  ATR_MAX_PCT  = getNum(elAtrMaxPct,0.80);

  ACCT_SIZE = getNum(elAcctSize,10000);
  RISK_PCT  = getNum(elRiskPct,1.0);

  PRO_MODE    = !!elProMode?.checked;
  MTF_CONFIRM = !!elMtfConfirm?.checked;

  USE_STOCH = !!elUseStoch?.checked;
  STOCH_K   = getInt(elStochK,14);
  STOCH_D   = getInt(elStochD,3);
  USE_BB    = !!elUseBB?.checked;
  BB_PERIOD = getInt(elBBPeriod,20);
  BB_STD    = getNum(elBBStd,2);
}

/* حفظ الإعدادات */
function persistSettings(){
  const S = {
    csv: elCsvInput?.value||'',
    PIVOT_MIN_DISTANCE,
    EMA_FAST, EMA_SLOW, RSI_PER,
    ATR_PERIOD, SL_ATR_MULT, TP1_ATR_MULT, TP2_ATR_MULT, ATR_MIN_PCT, ATR_MAX_PCT,
    ACCT_SIZE, RISK_PCT,
    PRO_MODE, MTF_CONFIRM, USE_STOCH, STOCH_K, STOCH_D, USE_BB, BB_PERIOD, BB_STD
  };
  localStorage.setItem('gs_settings', JSON.stringify(S));
}
function restoreSettings(){
  try{
    const raw = localStorage.getItem('gs_settings'); if(!raw) return;
    const S = JSON.parse(raw);
    if (S.csv && elCsvInput) elCsvInput.value = S.csv;
    PIVOT_MIN_DISTANCE = S.PIVOT_MIN_DISTANCE ?? PIVOT_MIN_DISTANCE;

    // ضع القيم في الحقول إذا موجودة
    const set = (el,v)=>{ if(el && v!=null) el.value = v; };
    set(elEmaFast,S.EMA_FAST); set(elEmaSlow,S.EMA_SLOW); set(elRsiPeriod,S.RSI_PER);
    set(elAtrPeriod,S.ATR_PERIOD); set(elSlMult,S.SL_ATR_MULT); set(elTp1Mult,S.TP1_ATR_MULT);
    set(elTp2Mult,S.TP2_ATR_MULT); set(elAtrMinPct,S.ATR_MIN_PCT); set(elAtrMaxPct,S.ATR_MAX_PCT);
    set(elAcctSize,S.ACCT_SIZE); set(elRiskPct,S.RISK_PCT);
    if (elProMode) elProMode.checked = !!S.PRO_MODE;
    if (elMtfConfirm) elMtfConfirm.checked = !!S.MTF_CONFIRM;
    if (elUseStoch) elUseStoch.checked = !!S.USE_STOCH;
    set(elStochK,S.STOCH_K); set(elStochD,S.STOCH_D);
    if (elUseBB) elUseBB.checked = !!S.USE_BB;
    set(elBBPeriod,S.BB_PERIOD); set(elBBStd,S.BB_STD);
  }catch{}
}

/*==================== إدارة الإطار الزمني ====================*/
let currentTF = 5;
function setActiveTF(tf){
  currentTF = tf;
  [elTf5, elTf30, elTf60, elTfD].forEach(b => b?.classList?.remove('active'));
  if (tf===5)    elTf5?.classList?.add('active');
  if (tf===30)   elTf30?.classList?.add('active');
  if (tf===60)   elTf60?.classList?.add('active');
  if (tf===1440) elTfD?.classList?.add('active');
}
function tfLabel(tf){
  if (tf===5) return '5 دقائق';
  if (tf===30) return '30 دقيقة';
  if (tf===60) return 'ساعة';
  if (tf===1440) return 'يوم (NY)';
  return tf+'m';
}

/*==================== CSV وتجميع OHLC ====================*/
function parseCsv(text){
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase();
  const out = [];
  if (header.includes('symbol') && header.includes('date') && header.includes('time')) {
    for (let i=1;i<lines.length;i++){
      const [sym,d,t,o,h,l,c] = lines[i].split(',');
      if (!d || !t) continue;
      const ts = Date.parse(`${d}T${t}Z`);
      const open=+o, high=+h, low=+l, close=+c;
      if (Number.isFinite(ts) && Number.isFinite(close)){
        out.push({ ts, open:Number.isFinite(open)?open:close, high:Number.isFinite(high)?high:close, low:Number.isFinite(low)?low:close, close });
      }
    }
  } else {
    for (let i=1;i<lines.length;i++){
      const [d,c] = lines[i].split(',');
      const ts = Date.parse(d);
      const close = +c;
      if (Number.isFinite(ts) && Number.isFinite(close)){
        out.push({ ts, open: close, high: close, low: close, close });
      }
    }
  }
  out.sort((a,b)=>a.ts-b.ts);
  return out;
}
async function fetchCsv(url){
  const u = (url && url.trim()) ? url.trim() : DEFAULT_5M_CSV;
  const full = u.startsWith('http') ? u : `${u}?t=${Date.now()}`;
  const r = await fetch(full, {cache:'no-store'});
  if (!r.ok) throw new Error(`CSV HTTP ${r.status}`);
  const rows = parseCsv(await r.text());
  if (!rows.length) throw new Error('CSV فارغ');
  return rows;
}
function aggregateOHLC(rows, minutes){
  const bucketMs = minutes*60*1000;
  const map = new Map();
  for (const r of rows){
    const b = Math.floor(r.ts/bucketMs)*bucketMs;
    let rec = map.get(b);
    if (!rec){
      rec = { ts:b, open:r.open, high:r.high, low:r.low, close:r.close };
      map.set(b, rec);
    }else{
      rec.high = Math.max(rec.high, r.high);
      rec.low  = Math.min(rec.low,  r.low);
      rec.close= r.close;
    }
  }
  return [...map.values()].sort((a,b)=>a.ts-b.ts);
}

/* --- تجميع يوم نيويورك --- */
const dtfNY = new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' });
function nyDateKey(ts){
  const parts = dtfNY.formatToParts(new Date(ts));
  const y = parts.find(p=>p.type==='year').value;
  const m = parts.find(p=>p.type==='month').value;
  const d = parts.find(p=>p.type==='day').value;
  return `${y}-${m}-${d}`;
}
function aggregateDailyNY(rows5){
  const map = new Map();
  for (const r of rows5){
    const key = nyDateKey(r.ts);
    let rec = map.get(key);
    if (!rec){
      rec = { key, ts:r.ts, open:r.open, high:r.high, low:r.low, close:r.close };
      map.set(key, rec);
    }else{
      rec.high = Math.max(rec.high, r.high);
      rec.low  = Math.min(rec.low,  r.low);
      rec.close= r.close;
    }
  }
  return [...map.values()].sort((a,b)=> a.key.localeCompare(b.key) );
}

/*==================== مؤشرات فنية ====================*/
function ema(series, period){
  const out = new Array(series.length).fill(null);
  const k = 2/(period+1);
  let e=null,sum=0;
  for (let i=0;i<series.length;i++){
    const p = series[i].close;
    if (i<period){ sum+=p; if(i===period-1){ e=sum/period; out[i]=e; } }
    else { e = p*k + e*(1-k); out[i]=e; }
  }
  return out;
}
function sma(series, period){
  const out = new Array(series.length).fill(null);
  if (series.length < period) return out;
  let sum = 0;
  for (let i=0;i<series.length;i++){
    sum += series[i].close;
    if (i>=period) sum -= series[i-period].close;
    if (i>=period-1) out[i] = sum/period;
  }
  return out;
}
function rsi(series, period=14){
  const out = new Array(series.length).fill(null);
  if (series.length <= period) return out;
  let gain=0, loss=0;
  for(let i=1;i<=period;i++){
    const d = series[i].close - series[i-1].close;
    if (d>=0) gain+=d; else loss-=d;
  }
  let avgG=gain/period, avgL=loss/period;
  out[period] = avgL===0?100:100-(100/(1+(avgG/avgL)));
  for(let i=period+1;i<series.length;i++){
    const d = series[i].close - series[i-1].close;
    const g = d>0?d:0, l = d<0?-d:0;
    avgG = (avgG*(period-1)+g)/period;
    avgL = (avgL*(period-1)+l)/period;
    out[i] = avgL===0?100:100-(100/(1+(avgG/avgL)));
  }
  return out;
}
function macd(series, fast=12, slow=26, signal=9){
  const emaF = ema(series, fast);
  const emaS = ema(series, slow);
  const m = series.map((_,i)=>{
    if (emaF[i]==null || emaS[i]==null) return null;
    return emaF[i]-emaS[i];
  });
  const pts = m.map((v,i)=>({ts:series[i].ts, close:(v==null)?NaN:v}));
  const clean = pts.filter(p=>Number.isFinite(p.close));
  const sigClean = ema(clean, signal);
  const sigFull = new Array(series.length).fill(null);
  for(let i=0,j=0;i<series.length;i++){
    if (Number.isFinite(pts[i]?.close)) sigFull[i]=sigClean[j++];
  }
  return { emaF, emaS, macd:m, signal:sigFull };
}
function atr(series, period=14){
  if (!series?.length) return [];
  const tr = new Array(series.length).fill(null);
  for(let i=0;i<series.length;i++){
    const h = series[i].high, l = series[i].low;
    if (i===0){ tr[i] = h-l; continue; }
    const pc = series[i-1].close;
    tr[i] = Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
  }
  const out = new Array(series.length).fill(null);
  let sum=0;
  for(let i=0;i<series.length;i++){
    const v = tr[i];
    if (i<period){ sum+=v; if(i===period-1){ out[i]=sum/period; } }
    else { out[i] = (out[i-1]*(period-1) + v)/period; }
  }
  return out;
}
function stochastic(series, kPeriod=14, dPeriod=3){
  const k = new Array(series.length).fill(null);
  const d = new Array(series.length).fill(null);
  for (let i=0;i<series.length;i++){
    if (i < kPeriod-1) continue;
    let hh=-Infinity, ll=Infinity;
    for (let j=i-kPeriod+1;j<=i;j++){
      hh = Math.max(hh, series[j].high);
      ll = Math.min(ll, series[j].low);
    }
    const c = series[i].close;
    const denom = (hh-ll);
    k[i] = (denom===0) ? 50 : ((c-ll)/(hh-ll))*100;
    let sum=0, cnt=0;
    for (let j=i-dPeriod+1;j<=i;j++){
      if (j>=0 && Number.isFinite(k[j])){ sum+=k[j]; cnt++; }
    }
    d[i] = (cnt>0) ? sum/cnt : null;
  }
  return {k,d};
}
function bollinger(series, period=20, stdMult=2){
  const mid = sma(series, period);
  const up = new Array(series.length).fill(null);
  const dn = new Array(series.length).fill(null);
  for (let i=0;i<series.length;i++){
    if (i<period-1 || !Number.isFinite(mid[i])) continue;
    let s2=0;
    for (let j=i-period+1;j<=i;j++){
      const diff = series[j].close - mid[i];
      s2 += diff*diff;
    }
    const sd = Math.sqrt(s2/period);
    up[i] = mid[i] + stdMult*sd;
    dn[i] = mid[i] - stdMult*sd;
  }
  return {mid, up, dn};
}

/*==================== تصنيف الإشارة ====================*/
function classifyBase(rsiVal, macdVal){
  if (macdVal==null || rsiVal==null) return 'حيادي';
  if (macdVal>0 && rsiVal>=50 && rsiVal<=70) return 'شراء';
  if (macdVal<0 && rsiVal<=50) return 'بيع';
  return 'حيادي';
}
function classifyPrecise({rsiVal, macdNow, macdPrev, macdSig, price, emaF, emaS}){
  if ([rsiVal, macdNow, emaF, emaS].some(v=>!Number.isFinite(v))) return 'حيادي';
  const crossUp   = Number.isFinite(macdPrev) && macdPrev<=macdSig && macdNow>macdSig;
  const crossDown = Number.isFinite(macdPrev) && macdPrev>=macdSig && macdNow<macdSig;
  if ((crossUp || macdNow>macdSig) && price>emaF && emaF>emaS && rsiVal>50 && rsiVal<68) return 'شراء';
  if ((crossDown || macdNow<macdSig) && price<emaF && emaF<emaS && rsiVal<50)          return 'بيع';
  return 'حيادي';
}
function classifyFinal(ctx){ return PRO_MODE ? classifyPrecise(ctx) : classifyBase(ctx.rsiVal, ctx.macdNow); }

/*==================== Pivot (NY) ====================*/
function calcPivotsFromDailyNY(dailyNY){
  if (!dailyNY || dailyNY.length<2) return null;
  const y = dailyNY[dailyNY.length-2];
  const H=y.high, L=y.low, C=y.close;
  if (![H,L,C].every(Number.isFinite)) return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

/*==================== فلاتر إضافية ====================*/
function priceNearAnyPivot(entry, piv, minDist){
  if (!piv || !Number.isFinite(entry)) return false;
  const lvls = [piv.P, piv.R1, piv.R2, piv.R3, piv.S1, piv.S2, piv.S3].filter(Number.isFinite);
  return lvls.some(v => Math.abs(entry - v) < minDist);
}
function applyExtraFilters(signal, series, i, stoch, bb){
  if (signal==='حيادي') return 'حيادي';
  const price = series[i].close;

  if (USE_STOCH && stoch){
    const k = stoch.k[i], d = stoch.d[i];
    if (signal==='شراء'){
      if (!(Number.isFinite(k)&&Number.isFinite(d) && k>d && k<80)) return 'حيادي';
    }else if (signal==='بيع'){
      if (!(Number.isFinite(k)&&Number.isFinite(d) && k<d && k>20)) return 'حيادي';
    }
  }

  if (USE_BB && bb){
    const mid=bb.mid[i], up=bb.up[i], dn=bb.dn[i];
    if (signal==='شراء'){
      if (!(Number.isFinite(mid)&&Number.isFinite(up) && price>mid && price<up)) return 'حيادي';
    }else if (signal==='بيع'){
      if (!(Number.isFinite(mid)&&Number.isFinite(dn) && price<mid && price>dn)) return 'حيادي';
    }
  }
  return signal;
}

/*==================== MTF قوي ====================*/
function strongMTFConfirm(rows30, rows60){
  if (!MTF_CONFIRM) return true;
  if (!rows30?.length) return true;
  const emaF30 = ema(rows30, EMA_FAST);
  const emaS30 = ema(rows30, EMA_SLOW);
  const mac30  = macd(rows30, EMA_FAST, EMA_SLOW, 9);
  const i30 = rows30.length-1;
  const trendUp30 = Number.isFinite(emaF30[i30]) && Number.isFinite(emaS30[i30]) && emaF30[i30] > emaS30[i30] && mac30.macd[i30] > 0;
  const trendDn30 = Number.isFinite(emaF30[i30]) && Number.isFinite(emaS30[i30]) && emaF30[i30] < emaS30[i30] && mac30.macd[i30] < 0;

  if (!rows60?.length) return (trendUp30 || trendDn30);
  const emaF60 = ema(rows60, EMA_FAST);
  const emaS60 = ema(rows60, EMA_SLOW);
  const i60 = rows60.length-1;
  const trendUp60 = Number.isFinite(emaF60[i60]) && Number.isFinite(emaS60[i60]) && emaF60[i60] > emaS60[i60];
  const trendDn60 = Number.isFinite(emaF60[i60]) && Number.isFinite(emaS60[i60]) && emaF60[i60] < emaS60[i60];

  return (trendUp30 && trendUp60) || (trendDn30 && trendDn60);
}

/*==================== أدوات مساعدة ====================*/
function rsiMacdContext(series, rsiArr, macdObj, i){
  return {
    rsiVal: rsiArr[i],
    macdNow: macdObj.macd[i],
    macdPrev: macdObj.macd[i-1],
    macdSig: macdObj.signal[i],
    price: series[i].close,
    emaF: macdObj.emaF[i],
    emaS: macdObj.emaS[i],
  };
}
function atrPct(atrVal, price){ return (Number.isFinite(atrVal) && Number.isFinite(price) && price>0) ? (100*atrVal/price) : NaN; }
function inNyTradingHours(ts){
  if (!ENABLE_MARKET_HOURS) return true;
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York', hour:'2-digit', minute:'2-digit', hour12:false}).formatToParts(new Date(ts));
  const h = parseInt(parts.find(p=>p.type==='hour').value,10);
  const m = parseInt(parts.find(p=>p.type==='minute').value,10);
  const tMin = h*60+m;
  const start = NY_TRADE_START.hour*60 + NY_TRADE_START.minute;
  const end   = NY_TRADE_END.hour*60   + NY_TRADE_END.minute;
  return tMin >= start && tMin <= end;
}

/* ——— دالة لضمان أن entry لا يساوي السعر الحي ——— */
function adjustEntry(entry, priceNow, atrV, side){
  if (!Number.isFinite(entry) || !Number.isFinite(priceNow) || !Number.isFinite(atrV)) return entry;
  const EPS = 0.01;
  if (Math.abs(entry - priceNow) < EPS){
    const bump = 0.2 * atrV;
    return (side === 'شراء') ? priceNow + bump : priceNow - bump;
  }
  return entry;
}

/* Position Size */
function calcPositionSize(entry, sl){
  const riskAmt = ACCT_SIZE * (RISK_PCT/100);
  const dist    = Math.abs(entry - sl);
  if (!Number.isFinite(riskAmt) || !Number.isFinite(dist) || dist<=0) return null;
  return { riskAmt, units: riskAmt / dist };
}

/*==================== مُجمّع الإشارة ====================*/
function filteredSignal(tf, series, rsiArr, macdObj, atrArr, rows5Ref, rows30Ref, rows60Ref, piv, stochObj, bbObj){
  const i = series.length-1;
  const ctx = rsiMacdContext(series, rsiArr, macdObj, i);
  let sig = classifyFinal(ctx);

  // ساعات عمل السوق
  if (!inNyTradingHours(series[i].ts)) sig = 'حيادي';

  // ATR Regime
  const nowPx = series[i].close;
  const atrv  = atrArr?.[i];
  const apct  = atrPct(atrv, nowPx);
  if (Number.isFinite(apct) && (apct < ATR_MIN_PCT || apct > ATR_MAX_PCT)) sig = 'حيادي';

  // MTF قوي
  if (tf===5 && sig!=='حيادي' && rows30Ref){
    if (!strongMTFConfirm(rows30Ref, rows60Ref)) sig = 'حيادي';
  }

  // مُرشّحات إضافية
  sig = applyExtraFilters(sig, series, i, stochObj, bbObj);

  // فلتر مسافة Pivot
  if (sig!=='حيادي' && piv){
    const emaS = macdObj.emaS[i];
    let entry = (sig==='شراء') ? Math.max(nowPx, Number.isFinite(emaS)?emaS:nowPx)
                               : Math.min(nowPx, Number.isFinite(emaS)?emaS:nowPx);
    entry = adjustEntry(entry, nowPx, atrv ?? 0.5, sig);
    if (priceNearAnyPivot(entry, piv, PIVOT_MIN_DISTANCE)) sig = 'حيادي';
  }

  return sig;
}

/*==================== إدارة الصفقة (Partial/BE/Trailing) ====================*/
function manageTrade(side, entry, atrV){
  // حساب SL/TP أولي
  let sl  = (side==='شراء') ? entry - SL_ATR_MULT*atrV : entry + SL_ATR_MULT*atrV;
  let tp1 = (side==='شراء') ? entry + TP1_ATR_MULT*atrV : entry - TP1_ATR_MULT*atrV;
  let tp2 = (side==='شراء') ? entry + TP2_ATR_MULT*atrV : entry - TP2_ATR_MULT*atrV;
  return {sl,tp1,tp2};
}

/*==================== نصيحة مكتوبة ====================*/
function buildAdvice(tf, series, rsiArr, macdObj, pivots, liveInfo, atrArr, rows5Ref, rows30Ref, rows60Ref, stochObj, bbObj){
  if (!series?.length) return '—';
  const i = series.length-1;
  const emaS   = macdObj.emaS[i];
  const lastClose = series[i].close;

  const nowPx = (liveInfo && (Date.now()-liveInfo.timeMs) < 20000 && Number.isFinite(liveInfo.price))
    ? liveInfo.price : lastClose;

  const sig = filteredSignal(tf, series, rsiArr, macdObj, atrArr, rows5Ref, rows30Ref, rows60Ref, pivots, stochObj, bbObj);
  const atrV = atrArr?.[i] ?? Math.max(0.3, Math.abs(series[i].high - series[i].low));
  const atrp = atrPct(atrV, nowPx);

  if (sig==='حيادي'){
    let base = `الإطار: ${tfLabel(tf)} • الإشارة: حيادي. `;
    if (Number.isFinite(atrp)) base += `ATR%: ${nf2.format(atrp)} ضمن [${ATR_MIN_PCT}–${ATR_MAX_PCT}]؟ `;
    base += `آخر سعر: ${nf2.format(nowPx)}.`;
    return base;
  }

  let entry = (sig === 'شراء')
    ? Math.max(nowPx, Number.isFinite(emaS)?emaS:nowPx)
    : Math.min(nowPx, Number.isFinite(emaS)?emaS:nowPx);
  entry = adjustEntry(entry, nowPx, atrV, sig);

  // إدارة الصفقة
  const {sl,tp1,tp2} = manageTrade(sig, entry, atrV);

  // حجم الصفقة
  const ps = calcPositionSize(entry, sl);
  const sizeTxt = ps ? ` • حجم تقريبي: ${nf2.format(ps.units)} وحدة (مخاطرة ≈ ${nf2.format(ps.riskAmt)}$)` : '';

  return `الإطار: ${tfLabel(tf)} • الإشارة: ${sig}.
سعر الدخول: ${nf2.format(entry)} • وقف الخسارة (ATR×${SL_ATR_MULT}): ${nf2.format(sl)}
الأهداف: ${nf2.format(tp1)} (جزئي ثم نقل SL إلى BE) ثم ${nf2.format(tp2)} مع Trailing ATR.${sizeTxt}`;
}

/*==================== عرض الواجهة ====================*/
function paintLive(price, ts){
  if (elLivePrice && Number.isFinite(price)) elLivePrice.textContent = nf2.format(price);
  if (elLiveTime  && ts)                    elLiveTime.textContent  = fmtLocalDateTime(ts);
}
function paintIndicators(rsiVal, macdVal, emaFv, emaSv, stK, stD, bbMid, bbUp, bbDn){
  if (elIndRSI)  elIndRSI.textContent  = Number.isFinite(rsiVal)  ? nf2.format(rsiVal)  : '—';
  if (elIndMACD) elIndMACD.textContent = Number.isFinite(macdVal) ? nf4.format(macdVal) : '—';
  if (elIndEMAF) elIndEMAF.textContent = Number.isFinite(emaFv)   ? nf2.format(emaFv)   : '—';
  if (elIndEMAS) elIndEMAS.textContent = Number.isFinite(emaSv)   ? nf2.format(emaSv)   : '—';
  if (elIndStoch) elIndStoch.textContent = (Number.isFinite(stK)||Number.isFinite(stD)) ? `${Number.isFinite(stK)?nf2.format(stK):'—'} / ${Number.isFinite(stD)?nf2.format(stD):'—'}` : '—';
  if (elIndBB) elIndBB.textContent = (Number.isFinite(bbMid)||Number.isFinite(bbUp)||Number.isFinite(bbDn))
    ? `${Number.isFinite(bbMid)?nf2.format(bbMid):'—'} / ${Number.isFinite(bbUp)?nf2.format(bbUp):'—'} / ${Number.isFinite(bbDn)?nf2.format(bbDn):'—'}`
    : '—';
}
function paintPivots(p){
  if (!p) return;
  elPivotP&&(elPivotP.textContent=nf2.format(p.P));
  elR1&&(elR1.textContent=nf2.format(p.R1));
  elR2&&(elR2.textContent=nf2.format(p.R2));
  elR3&&(elR3.textContent=nf2.format(p.R3));
  elS1&&(elS1.textContent=nf2.format(p.S1));
  elS2&&(elS2.textContent=nf2.format(p.S2));
  elS3&&(elS3.textContent=nf2.format(p.S3));
}
function paintTable(rows){
  if (!elRowsBody) return;
  elRowsBody.innerHTML='';
  const last = rows.slice(-TABLE_ROWS).reverse();
  for (const r of last){
    const s = classifyBase(r.rsi, r.macd);
    const color = s==='شراء'?'#10b981':s==='بيع'?'#ef4444':'#f59e0b';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.date}</td>
      <td>${r.time}</td>
      <td>${nf2.format(r.price)}</td>
      <td style="color:${color};font-weight:600">${s}</td>
      <td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td>
      <td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td>
      <td>${nf2.format(r.emaF)}</td>
    `;
    elRowsBody.appendChild(tr);
  }
}

/* رسم بياني مع خطوط Entry/TP/SL + Live */
function makeHiDPICanvas(canvas){
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
function renderTradeChart(series, lines){
  const canvas = document.getElementById('tradeChart');
  if (!canvas || !series || !series.length) return;

  const ctx = makeHiDPICanvas(canvas);
  const W = canvas.clientWidth, H = canvas.clientHeight;

  ctx.fillStyle = '#0b1220'; ctx.fillRect(0,0,W,H);

  const MAX_CANDLES = 120;
  const data = series.slice(-MAX_CANDLES);

  let minY = Math.min(...data.map(d=>d.low));
  let maxY = Math.max(...data.map(d=>d.high));
  const add = v => { if (Number.isFinite(v)){ minY = Math.min(minY, v); maxY = Math.max(maxY, v); } };
  add(lines?.entry); add(lines?.sl); add(lines?.tp1); add(lines?.tp2); add(window.__livePrice);

  if (minY === maxY){ minY-=1; maxY+=1; }
  const pad = (maxY-minY)*0.08; minY-=pad; maxY+=pad;

  const x0=46, x1=W-12, y0=16, y1=H-24;
  const plotW=x1-x0, plotH=y1-y0;

  const xAt = i => x0 + (i/(data.length-1))*plotW;
  const yAt = v => y1 - ((v-minY)/(maxY-minY))*plotH;

  ctx.strokeStyle='#223047'; ctx.lineWidth=1;
  ctx.font='12px system-ui'; ctx.fillStyle='#9ca3af'; ctx.textAlign='right'; ctx.textBaseline='middle';
  const gridN=4;
  for(let g=0; g<=gridN; g++){
    const yVal=minY+(g/gridN)*(maxY-minY);
    const y=Math.round(yAt(yVal))+0.5;
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
    ctx.fillText(nf2.format(yVal),x0-6,y);
  }

  const cw=Math.max(2, plotW/Math.max(30,data.length)*0.7);
  for(let i=0;i<data.length;i++){
    const d=data[i];
    const x=xAt(i);
    const yH=yAt(d.high), yL=yAt(d.low), yO=yAt(d.open), yC=yAt(d.close);
    const bull=d.close>=d.open;
    ctx.strokeStyle=bull?'#16a34a':'#ef4444';
    ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL); ctx.stroke();
    const xL=x-cw/2, xR=x+cw/2;
    ctx.beginPath(); ctx.moveTo(xL,yO); ctx.lineTo(xR,yO); ctx.lineTo(xR,yC); ctx.lineTo(xL,yC); ctx.closePath();
    ctx.fillStyle=bull?'#16a34a':'#ef4444'; ctx.globalAlpha=0.85; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
  }

  function drawHLine(val,color,label){
    if(!Number.isFinite(val)) return;
    const y=Math.round(yAt(val))+0.5;
    ctx.save();
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.setLineDash([6,5]);
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke();
    ctx.setLineDash([]);
    const tag=`${label}: ${nf2.format(val)}`;
    const tw=ctx.measureText(tag).width+10, th=18, bx=x0+8, by=y-th-6;
    ctx.fillStyle='#0b1220'; ctx.strokeStyle=color; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect?.(bx,by,tw,th,6); if(!ctx.roundRect){ ctx.rect(bx,by,tw,th); }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle=color; ctx.font='12px system-ui'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(tag,bx+6,by+th/2);
    ctx.restore();
  }

  drawHLine(lines?.entry,'#60a5fa','Entry');   // الأزرق
  drawHLine(lines?.tp1,'#22c55e','TP1');       // الأخضر
  drawHLine(lines?.tp2,'#22c55e','TP2');       // الأخضر
  drawHLine(lines?.sl ,'#f87171','SL');        // الأحمر
  if (Number.isFinite(window.__livePrice)) drawHLine(window.__livePrice,'#ffffff','Live'); // الأبيض
}

/*==================== ملخص الإشارة ====================*/
function paintSummary(rsiVal, macdVal, extras){
  if (!elSummaryText) return;
  const s = classifyFinal({
    rsiVal,
    macdNow: macdVal,
    macdPrev: extras?.macdPrev,
    macdSig:  extras?.macdSig,
    price:    extras?.price,
    emaF:     extras?.emaF,
    emaS:     extras?.emaS,
  });
  elSummaryText.textContent = s + (PRO_MODE ? ' (دقيق)' : '');
  elSummaryText.style.color = (s==='شراء') ? '#10b981' : (s==='بيع') ? '#ef4444' : '#f59e0b';
}

/*==================== Live: مصادر متعددة ====================*/
async function fetchLivePrice(){
  for (const url of LIVE_SOURCES){
    try{
      const r = await fetch(url, {cache:'no-store', mode:'cors'});
      if (!r.ok) continue;
      const ct = (r.headers.get('content-type')||'').toLowerCase();
      let price = null;
      if (ct.includes('application/json')){
        const j = await r.json();
        if (Array.isArray(j) && Number.isFinite(j[0])) price = +j[0];     // metals.live شكل بدائي
        else if (j && Number.isFinite(j.price)) price = +j.price;
      }
      if (Number.isFinite(price)) return price;
    }catch{}
  }
  throw new Error('تعذّر جلب السعر الحي من كل المصادر');
}

/*==================== تنبيهات ====================*/
function beep(){
  try{
    const ac = new (window.AudioContext||window.webkitAudioContext)();
    const o = ac.createOscillator(); const g = ac.createGain();
    o.connect(g); g.connect(ac.destination); o.type='sine'; o.frequency.value=880; g.gain.value=0.05;
    o.start(); setTimeout(()=>{ o.stop(); ac.close(); }, 200);
  }catch{}
}
async function webNotify(title, body){
  try{
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted'){
      new Notification(title, {body});
    } else if (Notification.permission !== 'denied'){
      const p = await Notification.requestPermission();
      if (p==='granted') new Notification(title, {body});
    }
  }catch{}
}
async function sendTelegram(text){
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try{
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({chat_id: TELEGRAM_CHAT_ID, text})});
  }catch{}
}

/* تنبيه اقتراب السعر */
let __alertLockUntil = 0;
function checkProximityAlert(entry){
  if (!elAlertEnable?.checked || !Number.isFinite(entry) || !Number.isFinite(window.__livePrice)) return;
  const dist = Math.abs(window.__livePrice - entry);
  const thr  = Math.max(0, parseFloat(elAlertDist?.value||'0.5'));
  const now  = Date.now();
  if (dist <= thr && now > __alertLockUntil){
    __alertLockUntil = now + 15000;
    const msg = `اقترب السعر من الدخول: ${nf2.format(window.__livePrice)} (Entry ${nf2.format(entry)})`;
    beep(); webNotify('تنبيه دخول', msg); sendTelegram(msg);
    if (elLivePrice){ elLivePrice.style.transition='color .15s'; elLivePrice.style.color='#67e8f9'; setTimeout(()=>{ elLivePrice.style.color='#ffffff'; }, 400); }
  }
}

/*==================== تحليل وتشغيل ====================*/
let LAST_LIVE = null;
let __cache   = null;

function mergeLiveIntoSeries(series, tfMinutes, live){
  if (!series?.length || !live) return series;
  const ms = tfMinutes*60*1000;
  const bucketStart = Math.floor(live.timeMs / ms) * ms;
  const out = series.slice();
  const last = {...out[out.length-1]};
  if (bucketStart === last.ts){
    last.close = live.price;
    last.high  = Math.max(last.high, live.price);
    last.low   = Math.min(last.low,  live.price);
    out[out.length-1] = last;
  } else if (bucketStart > last.ts){
    out.push({ ts: bucketStart, open:last.close, high:live.price, low:live.price, close:live.price });
  }
  return out;
}

async function runAnalysis(){
  try{
    loadSettings(); persistSettings();

    const csvUrl = elCsvInput?.value?.trim() || '';
    let rows5 = await fetchCsv(csvUrl);
    if (!rows5.length) throw new Error('ملف CSV فارغ');

    const rows30   = aggregateOHLC(rows5, 30);
    const rows60   = aggregateOHLC(rows5, 60);
    const rowsDayNY= aggregateDailyNY(rows5);

    let baseSeries = (currentTF===30)?rows30 : (currentTF===60)?rows60 : (currentTF===1440)?rowsDayNY : rows5;

    const merged = (LAST_LIVE) ? mergeLiveIntoSeries(baseSeries, currentTF, LAST_LIVE) : baseSeries;

    const rsiArr  = rsi(merged, RSI_PER);
    const macdObj = macd(merged, EMA_FAST, EMA_SLOW, 9);
    const atrArr  = atr(merged, ATR_PERIOD);

    const stochObj = (USE_STOCH) ? stochastic(merged, STOCH_K, STOCH_D) : null;
    const bbObj    = (USE_BB)    ? bollinger(merged, BB_PERIOD, BB_STD) : null;

    const i = merged.length-1;
    const priceNow = merged[i].close;

    paintSummary(rsiArr[i], macdObj.macd[i], {
      macdPrev: macdObj.macd[i-1], macdSig: macdObj.signal[i], price:priceNow, emaF:macdObj.emaF[i], emaS:macdObj.emaS[i]
    });
    paintIndicators(
      rsiArr[i], macdObj.macd[i], macdObj.emaF[i], macdObj.emaS[i],
      stochObj?.k[i], stochObj?.d[i],
      bbObj?.mid[i], bbObj?.up[i], bbObj?.dn[i]
    );

    const piv = calcPivotsFromDailyNY(rowsDayNY);
    paintPivots(piv);

    const tableRows = merged.map((p,idx)=>({
      ts:p.ts, date: toLocalDate(p.ts), time: toLocalTime(p.ts),
      price:p.close, rsi:rsiArr[idx], macd:macdObj.macd[idx], emaF:macdObj.emaF[idx]
    }));
    paintTable(tableRows);

    // حساب خطوط دخول/خروج للعرض
    const sigNow = filteredSignal(currentTF, merged, rsiArr, macdObj, atrArr, rows5, rows30, rows60, piv, stochObj, bbObj);
    const aNow   = atrArr?.[i] ?? 0.5;
    const emaS   = macdObj.emaS[i];
    let entryLine = (sigNow==='شراء')
      ? Math.max(priceNow, Number.isFinite(emaS)?emaS:priceNow)
      : (sigNow==='بيع')
        ? Math.min(priceNow, Number.isFinite(emaS)?emaS:priceNow)
        : null;
    entryLine = adjustEntry(entryLine, priceNow, aNow, (sigNow==='شراء'?'شراء':(sigNow==='بيع'?'بيع':null)));
    const lines = {
      entry: entryLine,
      sl : (sigNow==='شراء') ? entryLine - SL_ATR_MULT*aNow
          : (sigNow==='بيع') ? entryLine + SL_ATR_MULT*aNow : undefined,
      tp1: (sigNow==='شراء') ? entryLine + TP1_ATR_MULT*aNow
          : (sigNow==='بيع') ? entryLine - TP1_ATR_MULT*aNow : undefined,
      tp2: (sigNow==='شراء') ? entryLine + TP2_ATR_MULT*aNow
          : (sigNow==='بيع') ? entryLine - TP2_ATR_MULT*aNow : undefined,
    };

    window.__lastBaseSeries     = baseSeries;
    window.__lastSeriesForChart = merged;
    window.__lastLinesForChart  = lines;
    renderTradeChart(merged, lines);

    if (elAdviceText){
      elAdviceText.textContent = buildAdvice(currentTF, merged, rsiArr, macdObj, piv, LAST_LIVE, atrArr, rows5, rows30, rows60, stochObj, bbObj);
    }
    __cache = {tf: currentTF, series: merged, rsiArr, macdObj, piv, atrArr, rows5, rows30, rows60, stochObj, bbObj, rowsDayNY};

    checkProximityAlert(lines?.entry);
  }catch(err){
    alert(`تعذّر تحميل/تحليل البيانات: ${err.message||err}`);
    console.error(err);
  }
}

/* إعادة إسقاط سريع مع التكت الحي */
function reprojectWithLive(){
  if (!__cache || !LAST_LIVE) return;
  const {tf, rows5, rows30, rows60, piv} = __cache;

  const base = window.__lastBaseSeries || __cache.series;
  const merged = mergeLiveIntoSeries(base, tf, LAST_LIVE);

  const rsiArr  = rsi(merged, RSI_PER);
  const macdObj = macd(merged, EMA_FAST, EMA_SLOW, 9);
  const atrArr  = atr(merged, ATR_PERIOD);
  const stoch2  = USE_STOCH ? stochastic(merged, STOCH_K, STOCH_D) : null;
  const bb2     = USE_BB ? bollinger(merged, BB_PERIOD, BB_STD) : null;

  const i = merged.length-1;
  const priceNow = merged[i].close;
  const emaS = macdObj.emaS[i];

  const sigNow = filteredSignal(tf, merged, rsiArr, macdObj, atrArr, rows5, rows30, rows60, piv, stoch2, bb2);
  const aNow   = atrArr?.[i] ?? 0.5;
  let entryLine = (sigNow==='شراء')
      ? Math.max(priceNow, Number.isFinite(emaS)?emaS:priceNow)
      : (sigNow==='بيع') ? Math.min(priceNow, Number.isFinite(emaS)?emaS:priceNow) : null;
  entryLine = adjustEntry(entryLine, priceNow, aNow, (sigNow==='شراء'?'شراء':(sigNow==='بيع'?'بيع':null)));
  const lines = {
    entry: entryLine,
    sl : (sigNow==='شراء') ? entryLine - SL_ATR_MULT*aNow
        : (sigNow==='بيع') ? entryLine + SL_ATR_MULT*aNow : undefined,
    tp1: (sigNow==='شراء') ? entryLine + TP1_ATR_MULT*aNow
        : (sigNow==='بيع') ? entryLine - TP1_ATR_MULT*aNow : undefined,
    tp2: (sigNow==='شراء') ? entryLine + TP2_ATR_MULT*aNow
        : (sigNow==='بيع') ? entryLine - TP2_ATR_MULT*aNow : undefined,
  };

  window.__lastSeriesForChart = merged;
  window.__lastLinesForChart  = lines;
  renderTradeChart(merged, lines);

  if (elAdviceText){
    elAdviceText.textContent = buildAdvice(tf, merged, rsiArr, macdObj, piv, LAST_LIVE, atrArr, rows5, rows30, rows60, stoch2, bb2);
  }

  checkProximityAlert(lines?.entry);
}

/* تحديث النصيحة فقط */
function updateAdviceOnly(){ if (!__cache) return; reprojectWithLive(); }

/*==================== Backtest (بسيط واقعي) ====================*/
function backtest(series, tf){
  const emaF = ema(series, EMA_FAST);
  const emaS = ema(series, EMA_SLOW);
  const rsiA = rsi(series, RSI_PER);
  const mac  = macd(series, EMA_FAST, EMA_SLOW, 9);
  const atrA = atr(series, ATR_PERIOD);

  let equity=0, wins=0, losses=0, trades=0, maxDD=0, peak=0;

  for (let i=50;i<series.length;i++){ // تخطي داتا أولية للمؤشرات
    const piv = null; // للاختصار بالاختبار
    const sig = filteredSignal(tf, series.slice(0,i+1), rsiA.slice(0,i+1), mac, atrA, null,null,null, piv, null, null);
    if (sig==='حيادي') continue;

    const price = series[i].close;
    const atrV  = atrA[i] ?? 0.5;
    let entry   = (sig==='شراء') ? Math.max(price, emaS[i]??price) : Math.min(price, emaS[i]??price);

    // تكاليف دخول
    entry += (sig==='شراء') ? (BT_SPREAD+BT_SLIPPAGE) : -(BT_SPREAD+BT_SLIPPAGE);

    const {sl,tp1,tp2} = manageTrade(sig, entry, atrV);

    // محاكاة شموع لاحقة حتى يتحقق أحد الشروط
    let resultR = 0;
    for (let j=i+1;j<series.length;j++){
      const h=series[j].high, l=series[j].low, c=series[j].close;

      // تحقق TP1/SL أولاً
      let hit=null;
      if (sig==='شراء'){
        if (l <= sl) hit='SL';
        if (h >= tp1) hit=hit||'TP1';
      }else{
        if (h >= sl) hit='SL';
        if (l <= tp1) hit=hit||'TP1';
      }

      if (hit==='SL'){ resultR = -SL_ATR_MULT; i=j; break; }
      if (hit==='TP1'){
        // نصف العقد يُغلق عند TP1، وننقل SL إلى BE، ونفعّل trailing حتى TP2 أو خروج زمني
        let be = entry;
        let trail = (sig==='شراء') ? c - ATR_PERIOD*(atrV/ATR_PERIOD) : c + ATR_PERIOD*(atrV/ATR_PERIOD);
        let exitPx = tp1; // نصفها تحقق
        for (let k=j+1;k<series.length;k++){
          const hk=series[k].high, lk=series[k].low, ck=series[k].close;
          // trailing بسيط: SL يتبع ATR (تقريبي)
          if (sig==='شراء'){
            be = Math.max(be, entry);
            trail = Math.max(trail, ck - 1.5*(atrA[k]??atrV));
            if (lk<=be || lk<=trail){ exitPx = be; i=k; break; }
            if (hk>=tp2){ exitPx = tp2; i=k; break; }
          }else{
            be = Math.min(be, entry);
            trail = Math.min(trail, ck + 1.5*(atrA[k]??atrV));
            if (hk>=be || hk>=trail){ exitPx = be; i=k; break; }
            if (lk<=tp2){ exitPx = tp2; i=k; break; }
          }
        }
        // R التقريبية: ربح نصف + ربح/خسارة الباقي حتى الخروج
        const rHalf1 = (TP1_ATR_MULT)/(SL_ATR_MULT);
        const rHalf2 = ( (Math.abs(exitPx-entry)) / (SL_ATR_MULT*atrV) );
        resultR = 0.5*rHalf1 + 0.5*rHalf2 * ( (sig==='شراء') ? ((exitPx>=entry)?+1:-1) : ((exitPx<=entry)?+1:-1) );
        break;
      }
    }

    equity += resultR;
    trades++;
    if (resultR>=0) wins++; else losses++;
    peak = Math.max(peak, equity);
    maxDD = Math.min(maxDD, equity-peak);
  }

  const winRate = trades ? (wins*100/trades) : 0;
  const pf = (wins>0 && losses>0) ? (wins/losses) : (wins>0?Infinity:0);
  return {trades, winRate, equity, maxDD, pf};
}

/*==================== Live refresh ====================*/
async function refreshLive(){
  try{
    const price = await fetchLivePrice();
    const t = Date.now();
    paintLive(price, t);
    window.__livePrice   = price;
    window.__liveTimeMs  = t;
    LAST_LIVE            = {price, timeMs:t};
    reprojectWithLive();
  }catch(e){ console.warn('Live error:', e); }
}

/*==================== أحداث UI ====================*/
function hookInputs(){
  const re = ()=>{ loadSettings(); persistSettings(); runAnalysis(); };
  const reAdvice = ()=>{ loadSettings(); persistSettings(); updateAdviceOnly(); };

  [elProMode, elMtfConfirm, elUseStoch, elUseBB].forEach(el => el?.addEventListener('change', re));
  [elEmaFast, elEmaSlow, elRsiPeriod, elAtrPeriod, elAtrMinPct, elAtrMaxPct, elStochK, elStochD, elBBPeriod, elBBStd]
    .forEach(el => el?.addEventListener('input', re));
  [elSlMult, elTp1Mult, elTp2Mult, elAcctSize, elRiskPct].forEach(el => el?.addEventListener('input', reAdvice));
}

elBtnRun?.addEventListener('click', runAnalysis);
elTf5 ?.addEventListener('click', ()=>{ setActiveTF(5);    runAnalysis(); });
elTf30?.addEventListener('click', ()=>{ setActiveTF(30);   runAnalysis(); });
elTf60?.addEventListener('click', ()=>{ setActiveTF(60);   runAnalysis(); });
elTfD ?.addEventListener('click', ()=>{ setActiveTF(1440); runAnalysis(); });

/* Backtest زر */
elBtRun?.addEventListener('click', ()=>{
  if (!__cache) return;
  const tf = parseInt(elBtTf?.value||'5',10);
  const bars = Math.min(parseInt(elBtBars?.value||MAX_LOOKBACK_BARS,10), MAX_LOOKBACK_BARS);
  // جهّز بيانات tf المطلوبة
  let base5 = __cache.rows5;
  let series = (tf===5) ? base5
              : (tf===30) ? aggregateOHLC(base5,30)
              : (tf===60) ? aggregateOHLC(base5,60)
              : aggregateDailyNY(base5);
  if (bars && series.length>bars) series = series.slice(-bars);
  const res = backtest(series, tf);
  elBtResult.textContent = `تجارب: ${res.trades} • Win%: ${nf2.format(res.winRate)} • Equity (R): ${nf2.format(res.equity)} • MaxDD (R): ${nf2.format(res.maxDD)} • PF: ${Number.isFinite(res.pf)?nf2.format(res.pf):'∞'}`;
});

/* حفظ/استعادة CSV URL منفصل */
const LS_CSV='gs_csv_url';
if (elCsvInput){
  const saved = localStorage.getItem(LS_CSV)||'';
  if (!elCsvInput.value && saved) elCsvInput.value = saved;
  elCsvInput.addEventListener('input', ()=>{
    const v = elCsvInput.value.trim();
    if (v) localStorage.setItem(LS_CSV, v); else localStorage.removeItem(LS_CSV);
  });
}

/*==================== تشغيل أولي ====================*/
restoreSettings();
loadSettings();
hookInputs();
setActiveTF(5);
runAnalysis();
refreshLive();
setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
