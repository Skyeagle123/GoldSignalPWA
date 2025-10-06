/* ======================= GoldSignals • app.js (PRO+) ======================= */
/* --------- إعداد عام --------- */
const LIVE_SOURCES = [
  'https://gold-ticks.samer-mourtada.workers.dev/price',
  'https://api.metals.live/v1/spot/gold',
];
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const LIVE_REFRESH_SEC = 1;
const TABLE_ROWS       = 80;

const $=(id)=>document.getElementById(id);

/* عناصر DOM */
const elCsvInput=$('csvInput'), elBtnRun=$('runBtn');
const elTf5=$('tf5'), elTf30=$('tf30'), elTf60=$('tf60'), elTfD=$('tfD');
const elProMode=$('proMode'), elMtfConfirm=$('mtfConfirm');
const elLivePrice=$('livePrice'), elLiveTime=$('liveTime');
const elSummaryText=$('summaryText'), elAdviceText=$('adviceText');
const elIndRSI=$('indRSI'), elIndMACD=$('indMACD'), elIndEMAF=$('indEMAF'), elIndEMAS=$('indEMAS');
const elIndStoch=$('indStoch'), elIndBB=$('indBB');
const elPivotP=$('pivotP'), elR1=$('r1'), elR2=$('r2'), elR3=$('r3'), elS1=$('s1'), elS2=$('s2'), elS3=$('s3');
const elRowsBody=$('rowsBody');
const elEmaFast=$('emaFast'), elEmaSlow=$('emaSlow'), elRsiPeriod=$('rsiPeriod');
const elAtrPeriod=$('atrPeriod'), elSlMult=$('slMult'), elTp1Mult=$('tp1Mult'), elTp2Mult=$('tp2Mult');
const elAtrMinPct=$('atrMinPct'), elAtrMaxPct=$('atrMaxPct');
const elAcctSize=$('acctSize'), elRiskPct=$('riskPct');
const elUseStoch=$('useStoch'), elStochK=$('stochK'), elStochD=$('stochD');
const elUseBB=$('useBB'), elBBPeriod=$('bbPeriod'), elBBStd=$('bbStd');
const elAlertEnable=$('alertEnable'), elAlertDist=$('alertDistance');
const elToggleNyHours=$('toggleNyHours'), elTogglePivotFilter=$('togglePivotFilter');

/* عناصر Backtest */
const elBtCsv=$('btCsv'), elBtTf=$('btTf'), elBtStrict=$('btStrict'), elBtWalk=$('btWalk');
const elBtRun=$('btRun'), elBtStats=$('btStats'), elBtRows=$('btRows'), elBtEquity=$('btEquity');
const elBtDailyRiskCap=$('btDailyRiskCap');

/* تنسيقات */
const nf2=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const nf4=new Intl.NumberFormat('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
const dtfNY=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
function fmtLocalDateTime(ts){const d=new Date(ts);return `${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} ${d.toLocaleDateString('en-CA')}`;}
function toLocalDate(ts){return new Date(ts).toLocaleDateString('en-CA');}
function toLocalTime(ts){return new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}

/* إعدادات */
let EMA_FAST=12, EMA_SLOW=26, RSI_PER=14;
let ATR_PERIOD=14, SL_ATR_MULT=1.5, TP1_ATR_MULT=1.0, TP2_ATR_MULT=2.0, ATR_MIN_PCT=0.05, ATR_MAX_PCT=0.80;
let ACCT_SIZE=10000, RISK_PCT=1.0;
let PRO_MODE=false, MTF_CONFIRM=true, USE_STOCH=false, STOCH_K=14, STOCH_D=3, USE_BB=false, BB_PERIOD=20, BB_STD=2;
const NY_TRADE_START={hour:8, minute:0}, NY_TRADE_END={hour:17, minute:0};
let PIVOT_MIN_DISTANCE=0.7;
let currentTF=5, LAST_LIVE=null, __cache=null, __alertLockUntil=0;

function tfLabel(tf){return tf===5?'5 دقائق':tf===30?'30 دقيقة':tf===60?'ساعة':tf===1440?'يوم (NY)':tf+'m';}
function setActiveTF(tf){currentTF=tf;[elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));
  if(tf===5)elTf5?.classList?.add('active'); if(tf===30)elTf30?.classList?.add('active');
  if(tf===60)elTf60?.classList?.add('active'); if(tf===1440)elTfD?.classList?.add('active');}
function loadSettings(){
  const gi=(el,d)=>parseInt(el?.value??d,10), gf=(el,d)=>parseFloat(el?.value??d);
  EMA_FAST=gi(elEmaFast,12); EMA_SLOW=gi(elEmaSlow,26); RSI_PER=gi(elRsiPeriod,14);
  ATR_PERIOD=Math.max(2,gi(elAtrPeriod,14)); SL_ATR_MULT=gf(elSlMult,1.5);
  TP1_ATR_MULT=gf(elTp1Mult,1.0); TP2_ATR_MULT=gf(elTp2Mult,2.0);
  ATR_MIN_PCT=gf(elAtrMinPct,0.05); ATR_MAX_PCT=gf(elAtrMaxPct,0.80);
  ACCT_SIZE=gf(elAcctSize,10000); RISK_PCT=gf(elRiskPct,1.0);
  PRO_MODE=!!elProMode?.checked; MTF_CONFIRM=!!elMtfConfirm?.checked;
  USE_STOCH=!!elUseStoch?.checked; STOCH_K=gi(elStochK,14); STOCH_D=gi(elStochD,3);
  USE_BB=!!elUseBB?.checked; BB_PERIOD=gi(elBBPeriod,20); BB_STD=gf(elBBStd,2);
}

/* ---------------- CSV & تحضير البيانات ---------------- */
function parseCsv(text){
  const lines=text.trim().split(/\r?\n/); if(!lines.length) return [];
  const header=lines[0].toLowerCase(); const out=[];
  if(header.includes('symbol')&&header.includes('date')&&header.includes('time')){
    for(let i=1;i<lines.length;i++){const [sym,d,t,o,h,l,c]=lines[i].split(',');
      if(!d||!t)continue; const ts=Date.parse(`${d}T${t}Z`);
      const open=+o,high=+h,low=+l,close=+c;
      if(Number.isFinite(ts)&&Number.isFinite(close)) out.push({ts,open:Number.isFinite(open)?open:close,high:Number.isFinite(high)?high:close,low:Number.isFinite(low)?low:close,close});
    }
  }else{
    for(let i=1;i<lines.length;i++){const [d,c]=lines[i].split(','); const ts=Date.parse(d), close=+c;
      if(Number.isFinite(ts)&&Number.isFinite(close)) out.push({ts,open:close,high:close,low:close,close});}
  }
  out.sort((a,b)=>a.ts-b.ts); return out;
}
async function fetchCsv(url){
  const u=(url&&url.trim())?url.trim():DEFAULT_5M_CSV; const full=u.startsWith('http')?u:`${u}?t=${Date.now()}`;
  const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(),4000);
  try{
    const r=await fetch(full,{cache:'no-store',signal:ctl.signal}); if(!r.ok) throw new Error(`CSV HTTP ${r.status}`);
    const rows=parseCsv(await r.text()); if(!rows.length) throw new Error('CSV فارغ'); return rows;
  }finally{clearTimeout(to);}
}
function aggregateOHLC(rows, minutes){
  const ms=minutes*60*1000, map=new Map();
  for(const r of rows){const b=Math.floor(r.ts/ms)*ms; let rec=map.get(b);
    if(!rec){rec={ts:b,open:r.open,high:r.high,low:r.low,close:r.close};map.set(b,rec);}
    else{rec.high=Math.max(rec.high,r.high);rec.low=Math.min(rec.low,r.low);rec.close=r.close;}}
  return [...map.values()].sort((a,b)=>a.ts-b.ts);
}
function nyDateKey(ts){const p=dtfNY.formatToParts(new Date(ts));
  return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`;}
function aggregateDailyNY(rows5){
  const map=new Map();
  for(const r of rows5){const key=nyDateKey(r.ts); let rec=map.get(key);
    if(!rec){rec={key,ts:r.ts,open:r.open,high:r.high,low:r.low,close:r.close};map.set(key,rec);}
    else{rec.high=Math.max(rec.high,r.high);rec.low=Math.min(rec.low,r.low);rec.close=r.close;}}
  return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
}

/* ---------------- مؤشرات ---------------- */
function ema(series,p){const out=new Array(series.length).fill(null), k=2/(p+1); let e=null,sum=0;
  for(let i=0;i<series.length;i++){const v=series[i].close; if(i<p){sum+=v;if(i===p-1){e=sum/p;out[i]=e;}}
    else{e=v*k+e*(1-k);out[i]=e;}} return out;}
function sma(series,p){const out=new Array(series.length).fill(null); if(series.length<p) return out;
  let sum=0; for(let i=0;i<series.length;i++){sum+=series[i].close; if(i>=p) sum-=series[i-p].close; if(i>=p-1) out[i]=sum/p;} return out;}
function rsi(series,period=14){const out=new Array(series.length).fill(null); if(series.length<=period) return out;
  let g=0,l=0; for(let i=1;i<=period;i++){const d=series[i].close-series[i-1].close; if(d>=0)g+=d; else l-=d;}
  let ag=g/period, al=l/period; out[period]=al===0?100:100-(100/(1+(ag/al)));
  for(let i=period+1;i<series.length;i++){const d=series[i].close-series[i-1].close, G=d>0?d:0, L=d<0?-d:0;
    ag=(ag*(period-1)+G)/period; al=(al*(period-1)+L)/period; out[i]=al===0?100:100-(100/(1+(ag/al)));} return out;}
function macd(series,fast=12,slow=26,signal=9){
  const emaF=ema(series,fast), emaS=ema(series,slow);
  const m=series.map((_,i)=> (emaF[i]==null||emaS[i]==null)?null:emaF[i]-emaS[i]);
  const pts=m.map((v,i)=>({ts:series[i].ts,close:(v==null)?NaN:v})), clean=pts.filter(p=>Number.isFinite(p.close));
  const sigClean=ema(clean,signal), sigFull=new Array(series.length).fill(null);
  for(let i=0,j=0;i<series.length;i++){ if(Number.isFinite(pts[i]?.close)) sigFull[i]=sigClean[j++]; }
  return {emaF,emaS,macd:m,signal:sigFull};
}
function atr(series,period=14){
  if(!series?.length) return []; const tr=new Array(series.length).fill(null);
  for(let i=0;i<series.length;i++){const h=series[i].high,l=series[i].low;
    if(i===0){tr[i]=h-l;continue;} const pc=series[i-1].close; tr[i]=Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc));}
  const out=new Array(series.length).fill(null); let sum=0;
  for(let i=0;i<series.length;i++){const v=tr[i]; if(i<period){sum+=v;if(i===period-1) out[i]=sum/period;}
    else out[i]=(out[i-1]*(period-1)+v)/period;} return out;}
function stochastic(series,kP=14,dP=3){
  const k=new Array(series.length).fill(null), d=new Array(series.length).fill(null);
  for(let i=0;i<series.length;i++){ if(i<kP-1) continue; let hh=-Infinity,ll=Infinity;
    for(let j=i-kP+1;j<=i;j++){hh=Math.max(hh,series[j].high); ll=Math.min(ll,series[j].low);}
    const c=series[i].close, denom=hh-ll; k[i]=(denom===0)?50:((c-ll)/(hh-ll))*100;
    let s=0,cnt=0; for(let j=i-dP+1;j<=i;j++){ if(j>=0 && Number.isFinite(k[j])){s+=k[j];cnt++;} } d[i]=(cnt>0)?s/cnt:null; }
  return {k,d};}
function bollinger(series,p=20,std=2){
  const mid=sma(series,p), up=new Array(series.length).fill(null), dn=new Array(series.length).fill(null);
  for(let i=0;i<series.length;i++){ if(i<p-1||!Number.isFinite(mid[i])) continue; let s2=0;
    for(let j=i-p+1;j<=i;j++){const diff=series[j].close-mid[i]; s2+=diff*diff;} const sd=Math.sqrt(s2/p);
    up[i]=mid[i]+std*sd; dn[i]=mid[i]-std*sd; } return {mid,up,dn};}

/* ---------------- تصنيف الإشارة ---------------- */
function classifyBase(rsiVal,macdVal){ if(macdVal==null||rsiVal==null) return 'حيادي';
  if(macdVal>0&&rsiVal>=50&&rsiVal<=70) return 'شراء'; if(macdVal<0&&rsiVal<=50) return 'بيع'; return 'حيادي';}
function classifyPrecise({rsiVal,macdNow,macdPrev,macdSig,price,emaF,emaS}){
  if([rsiVal,macdNow,emaF,emaS].some(v=>!Number.isFinite(v))) return 'حيادي';
  const up=Number.isFinite(macdPrev)&&macdPrev<=macdSig&&macdNow>macdSig;
  const dn=Number.isFinite(macdPrev)&&macdPrev>=macdSig&&macdNow<macdSig;
  if((up||macdNow>macdSig)&&price>emaF&&emaF>emaS&&rsiVal>50&&rsiVal<68) return 'شراء';
  if((dn||macdNow<macdSig)&&price<emaF&&emaF<emaS&&rsiVal<50) return 'بيع';
  return 'حيادي';
}
function classifyFinal(ctx){return PRO_MODE?classifyPrecise(ctx):classifyBase(ctx.rsiVal,ctx.macdNow);}

/* ---------------- Pivot (NY) ---------------- */
function calcPivotsFromDailyNY(dailyNY){
  if(!dailyNY||dailyNY.length<2) return null; const y=dailyNY[dailyNY.length-2];
  const H=y.high,L=y.low,C=y.close; if(![H,L,C].every(Number.isFinite)) return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

/* ---------------- فلاتر ---------------- */
function atrPct(atrV,price){return (Number.isFinite(atrV)&&Number.isFinite(price)&&price>0)?(100*atrV/price):NaN;}
function inNyTradingHours(ts){
  if (elToggleNyHours?.checked) return true;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(ts));
  const h=parseInt(parts.find(p=>p.type==='hour').value,10), m=parseInt(parts.find(p=>p.type==='minute').value,10);
  const t=h*60+m, s=NY_TRADE_START.hour*60+NY_TRADE_START.minute, e=NY_TRADE_END.hour*60+NY_TRADE_END.minute;
  return t>=s && t<=e;
}
function priceNearAnyPivot(entry,piv,minDist){
  if(elTogglePivotFilter?.checked) return false;
  if(!piv||!Number.isFinite(entry)) return false;
  const lv=[piv.P,piv.R1,piv.R2,piv.R3,piv.S1,piv.S2,piv.S3].filter(Number.isFinite);
  return lv.some(v=>Math.abs(entry-v)<(minDist??PIVOT_MIN_DISTANCE));
}
function applyExtraFilters(sig,series,i,stoch,bb){
  if(sig==='حيادي') return 'حيادي'; const price=series[i].close;
  if(USE_STOCH&&stoch){const k=stoch.k[i],d=stoch.d[i];
    if(sig==='شراء'){ if(!(Number.isFinite(k)&&Number.isFinite(d)&&k>d&&k<80)) return 'حيادي'; }
    else if(sig==='بيع'){ if(!(Number.isFinite(k)&&Number.isFinite(d)&&k<d&&k>20)) return 'حيادي'; }}
  if(USE_BB&&bb){const mid=bb.mid[i],up=bb.up[i],dn=bb.dn[i];
    if(sig==='شراء'){ if(!(Number.isFinite(mid)&&Number.isFinite(up)&&price>mid&&price<up)) return 'حيادي'; }
    else if(sig==='بيع'){ if(!(Number.isFinite(mid)&&Number.isFinite(dn)&&price<mid&&price>dn)) return 'حيادي'; }}
  return sig;
}
function strongMTFConfirm(rows30,rows60){
  if(!MTF_CONFIRM) return true; if(!rows30?.length) return true;
  const emaF30=ema(rows30,EMA_FAST), emaS30=ema(rows30,EMA_SLOW), mac30=macd(rows30,EMA_FAST,EMA_SLOW,9);
  const i30=rows30.length-1, up30=Number.isFinite(emaF30[i30])&&Number.isFinite(emaS30[i30])&&emaF30[i30]>emaS30[i30]&&mac30.macd[i30]>0;
  const dn30=Number.isFinite(emaF30[i30])&&Number.isFinite(emaS30[i30])&&emaF30[i30]<emaS30[i30]&&mac30.macd[i30]<0;
  if(!rows60?.length) return (up30||dn30);
  const emaF60=ema(rows60,EMA_FAST), emaS60=ema(rows60,EMA_SLOW), i60=rows60.length-1;
  const up60=Number.isFinite(emaF60[i60])&&Number.isFinite(emaS60[i60])&&emaF60[i60]>emaS60[i60];
  const dn60=Number.isFinite(emaF60[i60])&&Number.isFinite(emaS60[i60])&&emaF60[i60]<emaS60[i60];
  return (up30&&up60)||(dn30&&dn60);
}

/* ---------------- إشارة + نصيحة ---------------- */
function rsiMacdContext(series,rsiArr,macdObj,i){return {rsiVal:rsiArr[i],macdNow:macdObj.macd[i],macdPrev:macdObj.macd[i-1],macdSig:macdObj.signal[i],price:series[i].close,emaF:macdObj.emaF[i],emaS:macdObj.emaS[i]};}

/* تعديل صغير لضمان إنّ سعر الدخول ما يساوي السعر الحي تمامًا */
function adjustEntry(entry,priceNow,atrV,side){
  if(!Number.isFinite(entry)||!Number.isFinite(priceNow)||!Number.isFinite(atrV)) return entry;
  const EPS=0.01;
  if(Math.abs(entry-priceNow)<EPS){
    const bump=Math.max(0.2*atrV, EPS*2);
    return side==='شراء'?priceNow+bump:priceNow-bump;
  }
  return entry;
}

function calcPositionSize(entry,sl){const risk=ACCT_SIZE*(RISK_PCT/100), dist=Math.abs(entry-sl); if(!Number.isFinite(risk)||!Number.isFinite(dist)||dist<=0) return null; return {riskAmt:risk,units:risk/dist};}

function filteredSignal(tf,series,rsiArr,macdObj,atrArr,rows5Ref,rows30Ref,rows60Ref,piv,stochObj,bbObj){
  const i=series.length-1; const ctx=rsiMacdContext(series,rsiArr,macdObj,i); let sig=classifyFinal(ctx);
  if(!inNyTradingHours(series[i].ts)) sig='حيادي';
  const ap=atrPct(atrArr?.[i],series[i].close); if(Number.isFinite(ap)&&(ap<ATR_MIN_PCT||ap>ATR_MAX_PCT)) sig='حيادي';
  if(tf===5&&sig!=='حيادي'&&rows30Ref){ if(!strongMTFConfirm(rows30Ref,rows60Ref)) sig='حيادي'; }
  sig=applyExtraFilters(sig,series,i,stochObj,bbObj);
  if(sig!=='حيادي'&&piv){ const emaS=macdObj.emaS[i]; let e=(sig==='شراء')?Math.max(series[i].close,Number.isFinite(emaS)?emaS:series[i].close):Math.min(series[i].close,Number.isFinite(emaS)?emaS:series[i].close); e=adjustEntry(e,series[i].close,atrArr?.[i]??0.5,sig); if(priceNearAnyPivot(e,piv,PIVOT_MIN_DISTANCE)) sig='حيادي'; }
  return sig;
}

/* ——— نصيحة مكتوبة دائمًا مع أرقام الدخول/الوقف/الأهداف ——— */
function buildAdvice(tf,series,rsiArr,macdObj,piv,live,atrArr,rows5,rows30,rows60,stoch,bb){
  if(!series?.length) return '—';
  const i=series.length-1, emaS=macdObj.emaS[i], last=series[i].close;
  const nowPx=(live&&(Date.now()-live.timeMs)<20000&&Number.isFinite(live.price))?live.price:last;

  const sigFiltered=filteredSignal(tf,series,rsiArr,macdObj,atrArr,rows5,rows30,rows60,piv,stoch,bb);
  const ctx=rsiMacdContext(series,rsiArr,macdObj,i);
  const sigSummary=classifyFinal(ctx);

  const atrV=atrArr?.[i] ?? Math.max(0.3, Math.abs(series[i].high-series[i].low));
  const atrp=atrPct(atrV,nowPx);

  const mkLines=(side)=>{ let entry=(side==='شراء')?Math.max(nowPx,Number.isFinite(emaS)?emaS:nowPx):Math.min(nowPx,Number.isFinite(emaS)?emaS:nowPx);
    entry=adjustEntry(entry,nowPx,atrV,side); const sl=(side==='شراء')?entry-SL_ATR_MULT*atrV:entry+SL_ATR_MULT*atrV;
    const tp1=(side==='شراء')?entry+TP1_ATR_MULT*atrV:entry-TP1_ATR_MULT*atrV;
    const tp2=(side==='شراء')?entry+TP2_ATR_MULT*atrV:entry-TP2_ATR_MULT*atrV; return {entry,sl,tp1,tp2}; };

  if(sigFiltered!=='حيادي'){
    const L=mkLines(sigFiltered);
    const ps=calcPositionSize(L.entry,L.sl);
    const sizeTxt=ps?` • حجم تقريبي: ${nf2.format(ps.units)} وحدة (مخاطرة ≈ ${nf2.format(ps.riskAmt)}$)`:''; 
    const extra=`ATR%: ${Number.isFinite(atrp)?nf2.format(atrp):'—'} • آخر سعر (حي): ${nf2.format(nowPx)}`;
    return `الإطار: ${tfLabel(tf)} • الإشارة: ${sigFiltered}.
سعر الدخول: ${nf2.format(L.entry)} • وقف الخسارة: ${nf2.format(L.sl)}
الأهداف: ${nf2.format(L.tp1)} (جزئي/نقل إلى BE) ثم ${nf2.format(L.tp2)}.
${extra}${sizeTxt}`;
  }

  if(sigSummary==='شراء'||sigSummary==='بيع'){
    const reasons=[];
    if(!inNyTradingHours(series[i].ts)) reasons.push('خارج ساعات نيويورك');
    const ap=atrPct(atrV,nowPx); if(Number.isFinite(ap)&&(ap<ATR_MIN_PCT||ap>ATR_MAX_PCT)) reasons.push('ATR% خارج النطاق');
    if(tf===5 && MTF_CONFIRM && !(strongMTFConfirm(rows30,rows60))) reasons.push('فشل تأكيد MTF');
    if(piv){ let tmp=mkLines(sigSummary).entry; if(priceNearAnyPivot(tmp,piv,PIVOT_MIN_DISTANCE)) reasons.push('قريب جدًا من Pivot'); }
    const L=mkLines(sigSummary);
    return `الإطار: ${tfLabel(tf)} • الملخص: ${sigSummary} (مرفوض بالفلاتر: ${reasons.join(' • ')||'—'}).
(إطلاع فقط) دخول افتراضي: ${nf2.format(L.entry)} • SL: ${nf2.format(L.sl)} • TP1/TP2: ${nf2.format(L.tp1)} / ${nf2.format(L.tp2)}.
ATR%: ${Number.isFinite(atrp)?nf2.format(atrp):'—'} • آخر سعر: ${nf2.format(nowPx)}.`;
  }

  let base=`الإطار: ${tfLabel(tf)} • الإشارة: حيادي. `;
  if(Number.isFinite(atrp)) base+=`ATR%: ${nf2.format(atrp)}. `;
  return base+`آخر سعر: ${nf2.format(nowPx)}.`;
}

/* ---------------- رسم/واجهة ---------------- */
function paintLive(price,ts){ if(elLivePrice&&Number.isFinite(price)) elLivePrice.textContent=nf2.format(price); if(elLiveTime&&ts) elLiveTime.textContent=fmtLocalDateTime(ts);}
function paintIndicators(rsiVal,macdVal,emaFv,emaSv,stK,stD,bbMid,bbUp,bbDn){
  if(elIndRSI)  elIndRSI.textContent  = Number.isFinite(rsiVal)?nf2.format(rsiVal):'—';
  if(elIndMACD) elIndMACD.textContent = Number.isFinite(macdVal)?nf4.format(macdVal):'—';
  if(elIndEMAF) elIndEMAF.textContent = Number.isFinite(emaFv)?nf2.format(emaFv):'—';
  if(elIndEMAS) elIndEMAS.textContent = Number.isFinite(emaSv)?nf2.format(emaSv):'—';
  if(elIndStoch) elIndStoch.textContent=(Number.isFinite(stK)||Number.isFinite(stD))?`${Number.isFinite(stK)?nf2.format(stK):'—'} / ${Number.isFinite(stD)?nf2.format(stD):'—'}`:'—';
  if(elIndBB) elIndBB.textContent=(Number.isFinite(bbMid)||Number.isFinite(bbUp)||Number.isFinite(bbDn))?`${Number.isFinite(bbMid)?nf2.format(bbMid):'—'} / ${Number.isFinite(bbUp)?nf2.format(bbUp):'—'} / ${Number.isFinite(bbDn)?nf2.format(bbDn):'—'}`:'—';
}
function paintPivots(p){ if(!p) return;
  elPivotP&&(elPivotP.textContent=nf2.format(p.P));
  elR1&&(elR1.textContent=nf2.format(p.R1));
  elR2&&(elR2.textContent=nf2.format(p.R2));
  elR3&&(elR3.textContent=nf2.format(p.R3));
  elS1&&(elS1.textContent=nf2.format(p.S1));
  elS2&&(elS2.textContent=nf2.format(p.S2));
  elS3&&(elS3.textContent=nf2.format(p.S3));
}
function paintTable(rows){
  if (!elRowsBody || !Array.isArray(rows)) return;
  elRowsBody.innerHTML='';
  const last=rows.slice(-TABLE_ROWS).reverse();
  for(const r of last){
    const s=classifyBase(r.rsi, r.macd);
    const color=(s==='شراء')?'#10b981':(s==='بيع')?'#ef4444':'#f59e0b';
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${r.date}</td>
      <td>${r.time}</td>
      <td>${Number.isFinite(r.price)?nf2.format(r.price):'—'}</td>
      <td style="color:${color};font-weight:600">${s}</td>
      <td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td>
      <td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td>
      <td>${Number.isFinite(r.emaF)?nf2.format(r.emaF):'—'}</td>`;
    elRowsBody.appendChild(tr);
  }
}

/* ======= شارت ======= */
function makeHiDPICanvas(c){const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,3)), r=c.getBoundingClientRect(); c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr); const ctx=c.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return ctx;}
let __raf=0;
function renderTradeChart(series,lines){
  const canvas=document.getElementById('tradeChart'); if(!canvas||!series?.length) return;
  cancelAnimationFrame(__raf); __raf=requestAnimationFrame(()=>{
    const ctx=makeHiDPICanvas(canvas), W=canvas.clientWidth, H=canvas.clientHeight;
    ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,W,H);
    const data=series.slice(-120);
    let minY=Math.min(...data.map(d=>d.low)), maxY=Math.max(...data.map(d=>d.high));
    const add=v=>{if(Number.isFinite(v)){minY=Math.min(minY,v);maxY=Math.max(maxY,v);}};
    add(lines?.entry);add(lines?.sl);add(lines?.tp1);add(lines?.tp2);add(window.__livePrice);
    if(minY===maxY){minY-=1;maxY+=1;} const pad=(maxY-minY)*0.08; minY-=pad; maxY+=pad;
    const x0=46,x1=W-12,y0=16,y1=H-24, plotW=x1-x0, plotH=y1-y0;
    const xAt=i=>x0+(i/(data.length-1))*plotW, yAt=v=>y1-((v-minY)/(maxY-minY))*plotH;

    ctx.strokeStyle='#223047'; ctx.lineWidth=1; ctx.font='12px system-ui'; ctx.fillStyle='#9ca3af'; ctx.textAlign='right'; ctx.textBaseline='middle';
    for(let g=0;g<=4;g++){const yVal=minY+(g/4)*(maxY-minY), y=Math.round(yAt(yVal))+0.5; ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); ctx.fillText(nf2.format(yVal),x0-6,y);}

    const cw=Math.max(2, (x1-x0)/Math.max(30,data.length)*0.7);
    for(let i=0;i<data.length;i++){
      const d=data[i], x=xAt(i), yH=yAt(d.high), yL=yAt(d.low), yO=yAt(d.open), yC=yAt(d.close), bull=d.close>=d.open;
      ctx.strokeStyle=bull?'#16a34a':'#ef4444'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL); ctx.stroke();
      const xL=x-cw/2,xR=x+cw/2;
      ctx.beginPath(); ctx.moveTo(xL,yO); ctx.lineTo(xR,yO); ctx.lineTo(xR,yC); ctx.lineTo(xL,yC); ctx.closePath();
      ctx.fillStyle=bull?'#16a34a':'#ef4444'; ctx.globalAlpha=0.85; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    }
    function drawH(val,color,label){
      if(!Number.isFinite(val)) return; const y=Math.round(yAt(val))+0.5;
      ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=2; ctx.setLineDash([6,5]);
      ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); ctx.setLineDash([]);
      const tag=`${label}: ${nf2.format(val)}`, tw=ctx.measureText(tag).width+10, th=18, bx=x0+8, by=y-th-6;
      ctx.fillStyle='#0b1220'; ctx.strokeStyle=color; ctx.lineWidth=1;
      ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(bx,by,tw,th,6); else ctx.rect(bx,by,tw,th); ctx.fill(); ctx.stroke();
      ctx.fillStyle=color; ctx.font='12px system-ui'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(tag,bx+6,by+th/2);
      ctx.restore();
    }
    drawH(lines?.entry,'#60a5fa','Entry');
    drawH(lines?.tp1,'#22c55e','TP1'); drawH(lines?.tp2,'#22c55e','TP2');
    drawH(lines?.sl,'#f87171','SL');
    if(Number.isFinite(window.__livePrice)) drawH(window.__livePrice,'#ffffff','Live');
  });
}
function paintSummary(rsiVal,macdVal,extras){
  if(!elSummaryText) return;
  const s=classifyFinal({rsiVal,macdNow:macdVal,macdPrev:extras?.macdPrev,macdSig:extras?.macdSig,price:extras?.price,emaF:extras?.emaF,emaS:extras?.emaS});
  elSummaryText.textContent=s+(PRO_MODE?' (دقيق)':'');
  elSummaryText.style.color=(s==='شراء')?'#10b981':(s==='بيع')?'#ef4444':'#f59e0b';
}

/* ---------------- السعر الحي (median + timeouts) ---------------- */
async function fetchLivePrice(){
  const TIMEOUT_MS = 2500;
  const sources = [...LIVE_SOURCES];
  async function get(url){
    const ctl = new AbortController();
    const t = setTimeout(()=>ctl.abort(), TIMEOUT_MS);
    try{
      const r = await fetch(url,{cache:'no-store',mode:'cors', signal: ctl.signal});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const ct=(r.headers.get('content-type')||'').toLowerCase();
      if(ct.includes('json')){
        const j=await r.json();
        if(Array.isArray(j)&&Number.isFinite(j[0])) return +j[0];
        if(j && Number.isFinite(j.price)) return +j.price;
      }
      throw new Error('bad json');
    } finally { clearTimeout(t); }
  }
  const vals = (await Promise.allSettled(sources.map(get)))
                .filter(x=>x.status==='fulfilled')
                .map(x=>x.value)
                .filter(Number.isFinite);
  if (vals.length===0) throw new Error('تعذّر جلب السعر الحي');
  const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
  const clean = vals.filter(v=>Math.abs(v-avg)/avg < 0.01);
  const arr = clean.length? clean: vals;
  arr.sort((a,b)=>a-b);
  const median = arr[Math.floor(arr.length/2)];
  return median;
}

/* ---------------- تنبيهات ---------------- */
function beep(){ try{const ac=new (window.AudioContext||window.webkitAudioContext)(), o=ac.createOscillator(), g=ac.createGain();
  o.connect(g); g.connect(ac.destination); o.type='sine'; o.frequency.value=880; g.gain.value=0.05; o.start(); setTimeout(()=>{o.stop();ac.close();},200);}catch{} }
async function webNotify(t,b){ try{ if(!('Notification'in window)) return;
  if(Notification.permission==='granted') new Notification(t,{body:b});
  else if(Notification.permission!=='denied'){const p=await Notification.requestPermission(); if(p==='granted') new Notification(t,{body:b});} }catch{} }
function checkProximityAlert(entry){
  if(!elAlertEnable?.checked || !Number.isFinite(entry) || !Number.isFinite(window.__livePrice)) return;
  const userThr = Math.max(0, parseFloat(elAlertDist?.value || '0.5'));
  const s = window.__lastSeriesForChart, atrNow = (s && atr(s, ATR_PERIOD).slice(-1)[0]) || NaN;
  const dynThr = Number.isFinite(atrNow) ? Math.max(userThr, 0.25 * atrNow) : userThr;
  const dist=Math.abs(window.__livePrice-entry), now=Date.now();
  if(dist<=dynThr && now>__alertLockUntil){
    __alertLockUntil=now+15000;
    const msg=`${tfLabel(currentTF)} • Live ${nf2.format(window.__livePrice)} vs Entry ${nf2.format(entry)}`;
    beep(); webNotify('تنبيه اقتراب',msg);
    if(elLivePrice){elLivePrice.style.transition='color .15s'; elLivePrice.style.color='#67e8f9'; setTimeout(()=>{elLivePrice.style.color='#ffffff';},400);}
  }
}

/* ---------------- Merge live ---------------- */
function mergeLiveIntoSeries(series,tfMin,live){
  if(!series?.length||!live) return series; const ms=tfMin*60*1000, b=Math.floor(live.timeMs/ms)*ms;
  const out=series.slice(), last={...out[out.length-1]};
  if(b===last.ts){last.close=live.price; last.high=Math.max(last.high,live.price); last.low=Math.min(last.low,live.price); out[out.length-1]=last;}
  else if(b>last.ts){out.push({ts:b,open:last.close,high:live.price,low:live.price,close:live.price});}
  return out;
}

/* ---------------- التحليل الرئيسي ---------------- */
function tableFrom(series,rsiArr,mac){ return series.map((p,idx)=>({ts:p.ts,date:toLocalDate(p.ts),time:toLocalTime(p.ts),price:p.close,rsi:rsiArr[idx],macd:mac.macd[idx],emaF:mac.emaF[idx]})); }

async function runAnalysis(){
  try{
    loadSettings();
    const csvUrl=elCsvInput?.value?.trim()||''; const rows5=await fetchCsv(csvUrl);
    const rows30=aggregateOHLC(rows5,30), rows60=aggregateOHLC(rows5,60), rowsDayNY=aggregateDailyNY(rows5);
    const base=(currentTF===30)?rows30:(currentTF===60)?rows60:(currentTF===1440)?rowsDayNY:rows5;
    const series=(LAST_LIVE)?mergeLiveIntoSeries(base,currentTF,LAST_LIVE):base;

    const rsiArr=rsi(series,RSI_PER), mac=macd(series,EMA_FAST,EMA_SLOW,9), atrArr=atr(series,ATR_PERIOD);
    const stoch=(elUseStoch?.checked)?stochastic(series,STOCH_K,STOCH_D):null, bb=(elUseBB?.checked)?bollinger(series,BB_PERIOD,BB_STD):null;

    const i=series.length-1, px=series[i].close;
    paintSummary(rsiArr[i],mac.macd[i],{macdPrev:mac.macd[i-1],macdSig:mac.signal[i],price:px,emaF:mac.emaF[i],emaS:mac.emaS[i]});
    paintIndicators(rsiArr[i],mac.macd[i],mac.emaF[i],mac.emaS[i],stoch?.k[i],stoch?.d[i],bb?.mid[i],bb?.up[i],bb?.dn[i]);

    const piv=calcPivotsFromDailyNY(rowsDayNY); paintPivots(piv);
    paintTable(tableFrom(series,rsiArr,mac));

    const sig=filteredSignal(currentTF,series,rsiArr,mac,atrArr,rows5,rows30,rows60,piv,stoch,bb);
    const aNow=atrArr?.[i]??0.5, emaS=mac.emaS[i]; let entry=null;
    if(sig==='شراء') entry=Math.max(px,Number.isFinite(emaS)?emaS:px);
    else if(sig==='بيع') entry=Math.min(px,Number.isFinite(emaS)?emaS:px);
    entry=adjustEntry(entry,px,aNow,sig);
    const lines=(sig==='حيادي')?undefined:{ entry,
      sl: sig==='شراء'? entry-SL_ATR_MULT*aNow : entry+SL_ATR_MULT*aNow,
      tp1: sig==='شراء'? entry+TP1_ATR_MULT*aNow: entry-TP1_ATR_MULT*aNow,
      tp2: sig==='شراء'? entry+TP2_ATR_MULT*aNow: entry-TP2_ATR_MULT*aNow,
    };
    window.__lastBaseSeries=base; window.__lastSeriesForChart=series; window.__lastLinesForChart=lines;
    renderTradeChart(series,lines);

    if(elAdviceText) elAdviceText.textContent=buildAdvice(currentTF,series,rsiArr,mac,piv,LAST_LIVE,atrArr,rows5,rows30,rows60,stoch,bb);
    __cache={tf:currentTF,series,rsiArr,mac,piv,atrArr,rows5,rows30,rows60,stoch,bb,rowsDayNY};

    if(sig!=='حيادي') checkProximityAlert(lines?.entry);
  }catch(err){ alert(`تعذّر تحميل/تحليل البيانات: ${err.message||err}`); console.error(err); }
}
function reprojectWithLive(){
  if(!__cache||!LAST_LIVE) return;
  const {tf,rows5,rows30,rows60,piv}=__cache, base=window.__lastBaseSeries||__cache.series;
  const series=mergeLiveIntoSeries(base,tf,LAST_LIVE);
  const rsiArr=rsi(series,RSI_PER), mac=macd(series,EMA_FAST,EMA_SLOW,9), atrArr=atr(series,ATR_PERIOD);
  const stoch=(elUseStoch?.checked)?stochastic(series,STOCH_K,STOCH_D):null, bb=(elUseBB?.checked)?bollinger(series,BB_PERIOD,BB_STD):null;
  const i=series.length-1, px=series[i].close, sig=filteredSignal(tf,series,rsiArr,mac,atrArr,rows5,rows30,rows60,piv,stoch,bb), aNow=atrArr?.[i]??0.5, emaS=mac.emaS[i];
  let entry=null; if(sig==='شراء') entry=Math.max(px,Number.isFinite(emaS)?emaS:px); else if(sig==='بيع') entry=Math.min(px,Number.isFinite(emaS)?emaS:px);
  entry=adjustEntry(entry,px,aNow,sig);
  const lines=(sig==='حيادي')?undefined:{entry,
    sl: sig==='شراء'? entry-SL_ATR_MULT*aNow : entry+SL_ATR_MULT*aNow,
    tp1: sig==='شراء'? entry+TP1_ATR_MULT*aNow: entry-TP1_ATR_MULT*aNow,
    tp2: sig==='شراء'? entry+TP2_ATR_MULT*aNow: entry-TP2_ATR_MULT*aNow};
  window.__lastSeriesForChart=series; window.__lastLinesForChart=lines; renderTradeChart(series,lines);
  if(elAdviceText) elAdviceText.textContent=buildAdvice(tf,series,rsiArr,mac,piv,LAST_LIVE,atrArr,rows5,rows30,rows60,stoch,bb);
  if(sig!=='حيادي') checkProximityAlert(lines?.entry);
}

/* ---------------- تحديث حي ---------------- */
async function refreshLive(){ try{
  const price=await fetchLivePrice(); const t=Date.now();
  if(Number.isFinite(window.__livePrice)){ const pct=Math.abs(price-window.__livePrice)/window.__livePrice;
    if(pct>0.007) { console.warn('Spike filtered',pct); return; } }
  paintLive(price,t); window.__livePrice=price; window.__liveTimeMs=t; LAST_LIVE={price,timeMs:t}; reprojectWithLive();
}catch(e){ console.warn('Live error:',e); } }

/* ---------------- Backtest Pro (مع Fallback للريبو/الرابط) ---------------- */
function makeHiDPICanvas(c){const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,3)), r=c.getBoundingClientRect(); c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr); const ctx=c.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return ctx;}
function drawEquity(canvas, eq){
  if(!canvas||!eq?.length) return; const ctx=makeHiDPICanvas(canvas), W=canvas.clientWidth, H=canvas.clientHeight;
  ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,W,H);
  const min=Math.min(...eq), max=Math.max(...eq), x0=32,x1=W-8,y0=10,y1=H-18, w=x1-x0,h=y1-y0;
  const xAt=i=>x0+(i/(eq.length-1))*w, yAt=v=>y1-((v-min)/(max-min||1))*h;
  ctx.strokeStyle='#334155'; ctx.lineWidth=1; for(let g=0;g<=4;g++){const y=yAt(min+(g/4)*(max-min||1));
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); }
  ctx.strokeStyle='#10b981'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(xAt(0),yAt(eq[0]));
  for(let i=1;i<eq.length;i++) ctx.lineTo(xAt(i),yAt(eq[i])); ctx.stroke();
}
function simulateTrades(series, tf, strictFilters, dailyRiskCapPct, pivotsNY){
  const rsiArr=rsi(series,RSI_PER), mac=macd(series,EMA_FAST,EMA_SLOW,9), atrArr=atr(series,ATR_PERIOD);
  const rows5=series, rows30=null, rows60=null;
  const trades=[], equity=[0]; let curEq=0;
  let usedRiskToday=0, curNYDay=null;

  for(let i=Math.max(EMA_SLOW,RSI_PER,ATR_PERIOD)+1;i<series.length;i++){
    const ctx=rsiMacdContext(series,rsiArr,mac,i);
    let side=classifyFinal(ctx);
    if(strictFilters){
      const piv=pivotsNY;
      side=filteredSignal(tf,series.slice(0,i+1),rsiArr.slice(0,i+1),{...mac,emaF:mac.emaF.slice(0,i+1),emaS:mac.emaS.slice(0,i+1),macd:mac.macd.slice(0,i+1),signal:mac.signal.slice(0,i+1)},atrArr.slice(0,i+1),rows5.slice(0,i+1),rows30,rows60,piv,null,null);
    }
    if(side==='حيادي') {equity.push(curEq); continue;}

    const dayKey=nyDateKey(series[i].ts);
    if(curNYDay!==dayKey){curNYDay=dayKey; usedRiskToday=0;}
    const price=series[i].close, aNow=atrArr[i]??0.5;
    const entry=(side==='شراء')?Math.max(price,mac.emaS[i]??price):Math.min(price,mac.emaS[i]??price);
    const sl=(side==='شراء')?entry-SL_ATR_MULT*aNow:entry+SL_ATR_MULT*aNow;
    const tp1=(side==='شراء')?entry+TP1_ATR_MULT*aNow:entry-TP1_ATR_MULT*aNow;
    const tp2=(side==='شراء')?entry+TP2_ATR_MULT*aNow:entry-TP2_ATR_MULT*aNow;
    const risk=ACCT_SIZE*(RISK_PCT/100); if(usedRiskToday + (risk/ACCT_SIZE*100) > (dailyRiskCapPct||999)) {equity.push(curEq); continue;}
    usedRiskToday += (risk/ACCT_SIZE*100);

    let exit=entry, R=0, pl=0; let hit1=false;
    const maxBars=(tf===1440)?20:60;
    for(let j=i+1;j<Math.min(series.length,i+1+maxBars);j++){
      const h=series[j].high,l=series[j].low;
      if(side==='شراء'){
        if(!hit1 && h>=tp1){hit1=true; R+=TP1_ATR_MULT/SL_ATR_MULT/2; }
        if(h>=tp2){ R+=TP2_ATR_MULT/SL_ATR_MULT/2; exit=tp2; break; }
        if(l<=sl){ R-=1; exit=sl; break; }
      }else{
        if(!hit1 && l<=tp1){hit1=true; R+=TP1_ATR_MULT/SL_ATR_MULT/2; }
        if(l<=tp2){ R+=TP2_ATR_MULT/SL_ATR_MULT/2; exit=tp2; break; }
        if(h>=sl){ R-=1; exit=sl; break; }
      }
      exit=series[j].close;
    }
    pl = R * (risk);
    curEq += pl;
    equity.push(curEq);
    trades.push({ts:series[i].ts, side, entry, exit, R, pl});
  }
  return {trades, equity};
}
function summarizeTrades(trades){
  const n=trades.length||1;
  const wins=trades.filter(t=>t.R>0), losses=trades.filter(t=>t.R<=0);
  const winRate = wins.length/n*100;
  const avgR = trades.reduce((a,b)=>a+b.R,0)/n;
  const pf = (wins.reduce((a,b)=>a+b.R,0) / Math.max(1e-6, -losses.reduce((a,b)=>a+Math.min(0,b.R),0)));
  let peak=0, dd=0, run=0; for(const t of trades){ run += t.pl; peak=Math.max(peak,run); dd=Math.max(dd, peak-run); }
  const meanR=avgR, sdR=Math.sqrt((trades.reduce((a,b)=>a+(b.R-meanR)*(b.R-meanR),0)/n)||1e-6), sharpe=(meanR/sdR)*Math.sqrt(252);
  const pnl = trades.reduce((a,b)=>a+b.pl,0);
  return {n, winRate, avgR, pf, dd, pnl, sharpe};
}

/* === Backtest مع Fallback على ملف الريبو أو رابط الحقل العلوي === */
async function runBacktest(){
  try{
    loadSettings();
    const strict=!!elBtStrict?.checked, walk=!!elBtWalk?.checked, tf=parseInt(elBtTf?.value||'5',10);
    const dailyRiskCap = parseFloat(elBtDailyRiskCap?.value||'3');

    let text;
    if (elBtCsv?.files?.length) {
      text = await elBtCsv.files[0].text();
    } else {
      const urlFromTop = elCsvInput?.value?.trim();
      if (urlFromTop) {
        const r = await fetch(urlFromTop, {cache:'no-store'});
        if (!r.ok) throw new Error('تعذّر تحميل CSV من الرابط');
        text = await r.text();
      } else {
        const r = await fetch(DEFAULT_5M_CSV + '?t=' + Date.now(), {cache:'no-store'});
        if (!r.ok) throw new Error('تعذّر تحميل CSV الافتراضي من الريبو');
        text = await r.text();
      }
    }
    const rows5 = parseCsv(text);
    if(!rows5.length) throw new Error('CSV فارغ');

    const rows30=aggregateOHLC(rows5,30), rows60=aggregateOHLC(rows5,60), rowsDayNY=aggregateDailyNY(rows5);
    const piv=calcPivotsFromDailyNY(rowsDayNY);
    const base=(tf===30)?rows30:(tf===60)?rows60:(tf===1440)?rowsDayNY:rows5;

    let trades=[], equity=[], stats=null;
    if(!walk){
      const sim=simulateTrades(base, tf, strict, dailyRiskCap, piv);
      trades=sim.trades; equity=sim.equity; stats=summarizeTrades(trades);
    }else{
      const K=3, foldSize=Math.floor(base.length/K);
      let allTrades=[], eq=[0];
      for(let k=0;k<K;k++){
        const train=base.slice(Math.max(0,k*foldSize-200), (k+1)*foldSize);
        const test =base.slice((k+1)*foldSize, Math.min(base.length,(k+2)*foldSize));
        if(train.length<200||test.length<200) continue;

        const keepMin=ATR_MIN_PCT, keepMax=ATR_MAX_PCT;
        let best={score:-Infinity, mn:keepMin, mx:keepMax};
        const grid=[-0.02,0,0.02].flatMap(d1=>[-0.1,0,0.1].map(d2=>({mn:Math.max(0.01,keepMin+d1), mx:Math.min(1.2,keepMax+d2)})));
        for(const g of grid){
          ATR_MIN_PCT=g.mn; ATR_MAX_PCT=g.mx;
          const tr=summarizeTrades(simulateTrades(train, tf, strict, dailyRiskCap, piv).trades);
          const score = tr.winRate*0.6 + tr.pf*30 + tr.avgR*20;
          if(score>best.score) best={score, mn:g.mn, mx:g.mx};
        }
        ATR_MIN_PCT=best.mn; ATR_MAX_PCT=best.mx;
        const sim=simulateTrades(test, tf, strict, dailyRiskCap, piv);
        allTrades=allTrades.concat(sim.trades);
        eq=eq.concat(sim.equity.map(v=>v+eq[eq.length-1]).slice(1));
        ATR_MIN_PCT=keepMin; ATR_MAX_PCT=keepMax;
      }
      trades=allTrades; equity=eq; stats=summarizeTrades(trades);
      loadSettings();
    }

    if(elBtStats){
      elBtStats.innerHTML =
        `الصفقات: <b>${stats.n}</b> • Win%: <b>${nf2.format(stats.winRate)}</b> • PF: <b>${nf2.format(stats.pf)}</b> • `+
        `Expectancy (R): <b>${nf2.format(stats.avgR)}</b> • MaxDD$: <b>${nf2.format(stats.dd)}</b> • PnL$: <b>${nf2.format(stats.pnl)}</b> • `+
        `Sharpe≈ <b>${nf2.format(stats.sharpe)}</b>`;
    }
    if(elBtRows){
      elBtRows.innerHTML='';
      trades.slice(-20).reverse().forEach((t,idx)=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${idx+1}</td><td>${toLocalDate(t.ts)} ${toLocalTime(t.ts)}</td><td>${t.side}</td>
          <td>${nf2.format(t.entry)}</td><td>${nf2.format(t.exit)}</td><td>${nf2.format(t.R)}</td><td>${nf2.format(t.pl)}</td>`;
        elBtRows.appendChild(tr);
      });
    }
    drawEquity(elBtEquity, equity);
  }catch(e){ alert(`Backtest فشل: ${e.message||e}`); console.error(e); }
}

/* ---------------- أحداث ---------------- */
elBtnRun?.addEventListener('click',runAnalysis);
elTf5?.addEventListener('click',()=>{setActiveTF(5);runAnalysis();});
elTf30?.addEventListener('click',()=>{setActiveTF(30);runAnalysis();});
elTf60?.addEventListener('click',()=>{setActiveTF(60);runAnalysis();});
elTfD?.addEventListener('click',()=>{setActiveTF(1440);runAnalysis();});
[elProMode,elMtfConfirm,elUseStoch,elUseBB,elToggleNyHours,elTogglePivotFilter].forEach(el=>el?.addEventListener('change',runAnalysis));
[elEmaFast,elEmaSlow,elRsiPeriod,elAtrPeriod,elAtrMinPct,elAtrMaxPct,elStochK,elStochD,elBBPeriod,elBBStd,elSlMult,elTp1Mult,elTp2Mult,elAcctSize,elRiskPct]
  .forEach(el=>el?.addEventListener('input',()=>{ if(el===elSlMult||el===elTp1Mult||el===elTp2Mult||el===elAcctSize||el===elRiskPct) reprojectWithLive(); else runAnalysis(); }));

const LS_CSV='gs_csv_url';
if(elCsvInput){
  const saved=localStorage.getItem(LS_CSV)||''; if(!elCsvInput.value&&saved) elCsvInput.value=saved;
  elCsvInput.addEventListener('input',()=>{const v=elCsvInput.value.trim(); if(v) localStorage.setItem(LS_CSV,v); else localStorage.removeItem(LS_CSV);});
}

/* Backtest events */
elBtRun?.addEventListener('click', runBacktest);

/* تشغيل أولي */
setActiveTF(5);
runAnalysis();
refreshLive();
setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
