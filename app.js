/* ======================= GoldSignals • app.js (PRO) ======================= */
/* مصادر حيّة متعددة + Pivot NY + فلاتر قوية + نصيحة دائمة مع سبب الرفض ====== */

const LIVE_SOURCES = [
  'https://goldprice-proxy.samer-mourtada.workers.dev/price',
  'https://api.metals.live/v1/spot/gold', // يرجّع [price]
];
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const LIVE_REFRESH_SEC = 1;
const TABLE_ROWS       = 80;

/* عناصر UI (وجودها اختياري حسب HTML) */
const $ = (id)=>document.getElementById(id);
const elCsvInput=$('csvInput'), elBtnRun=$('runBtn');
const elTf5=$('tf5'), elTf30=$('tf30'), elTf60=$('tf60'), elTfD=$('tfD');
const elProMode=$('proMode'), elMtfConfirm=$('mtfConfirm');
const elLivePrice=$('livePrice'), elLiveTime=$('liveTime');
const elSummaryText=$('summaryText'), elAdviceText=$('adviceText');
const elIndRSI=$('indRSI'), elIndMACD=$('indMACD'), elIndEMAF=$('indEMAF'), elIndEMAS=$('indEMAS');
const elIndStoch=$('indStoch'), elIndBB=$('indBB');
const elPivotP=$('pivotP'), elR1=$('r1'), elR2=$('r2'), elR3=$('r3'), elS1=$('s1'), elS2=$('s2'), elS3=$('s3');
const elRowsBody=$('rowsBody');

/* إعدادات المؤشرات/المخاطر (قراءة من الحقول إن وُجدت) */
const elEmaFast=$('emaFast'), elEmaSlow=$('emaSlow'), elRsiPeriod=$('rsiPeriod');
const elAtrPeriod=$('atrPeriod'), elSlMult=$('slMult'), elTp1Mult=$('tp1Mult'), elTp2Mult=$('tp2Mult');
const elAtrMinPct=$('atrMinPct'), elAtrMaxPct=$('atrMaxPct');
const elAcctSize=$('acctSize'), elRiskPct=$('riskPct');
const elUseStoch=$('useStoch'), elStochK=$('stochK'), elStochD=$('stochD');
const elUseBB=$('useBB'), elBBPeriod=$('bbPeriod'), elBBStd=$('bbStd');
/* تنبيه اقتراب */
const elAlertEnable=$('alertEnable'), elAlertDist=$('alertDistance');
/* سويتشات اختيارية لتعطيل فلاتر */
const elToggleNyHours=$('toggleNyHours');        // checkbox: تعطيل ساعات نيويورك
const elTogglePivotFilter=$('togglePivotFilter'); // checkbox: تعطيل فلتر مسافة Pivot

/* أرقام/تواريخ */
const nf2=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const nf4=new Intl.NumberFormat('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
const dtfNY=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
function fmtLocalDateTime(ts){const d=new Date(ts);return `${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} ${d.toLocaleDateString('en-CA')}`;}
function toLocalDate(ts){return new Date(ts).toLocaleDateString('en-CA');}
function toLocalTime(ts){return new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}

/* إعدادات افتراضية + تحميل من الحقول */
let EMA_FAST=12, EMA_SLOW=26, RSI_PER=14;
let ATR_PERIOD=14, SL_ATR_MULT=1.5, TP1_ATR_MULT=1.0, TP2_ATR_MULT=2.0, ATR_MIN_PCT=0.05, ATR_MAX_PCT=0.80;
let ACCT_SIZE=10000, RISK_PCT=1.0;
let PRO_MODE=false, MTF_CONFIRM=true, USE_STOCH=false, STOCH_K=14, STOCH_D=3, USE_BB=false, BB_PERIOD=20, BB_STD=2;

/* ساعات نيويورك (تُعطَّل إذا elToggleNyHours.checked) */
const NY_TRADE_START={hour:8, minute:0}, NY_TRADE_END={hour:17, minute:0};

/* فلتر مسافة الـ Pivot (بالدولار) – يُعطَّل إذا elTogglePivotFilter.checked */
let PIVOT_MIN_DISTANCE=0.7;

/* حالة */
let currentTF=5, LAST_LIVE=null, __cache=null, __alertLockUntil=0;
function tfLabel(tf){return tf===5?'5 دقائق':tf===30?'30 دقيقة':tf===60?'ساعة':tf===1440?'يوم (NY)':tf+'m';}
function setActiveTF(tf){currentTF=tf;[elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));
  if(tf===5)elTf5?.classList?.add('active'); if(tf===30)elTf30?.classList?.add('active');
  if(tf===60)elTf60?.classList?.add('active'); if(tf===1440)elTfD?.classList?.add('active');}

/* تحميل الإعدادات من الحقول */
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

/* CSV */
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
  const r=await fetch(full,{cache:'no-store'}); if(!r.ok) throw new Error(`CSV HTTP ${r.status}`);
  const rows=parseCsv(await r.text()); if(!rows.length) throw new Error('CSV فارغ'); return rows;
}
function aggregateOHLC(rows, minutes){
  const ms=minutes*60*1000, map=new Map();
  for(const r of rows){const b=Math.floor(r.ts/ms)*ms; let rec=map.get(b);
    if(!rec){rec={ts:b,open:r.open,high:r.high,low:r.low,close:r.close};map.set(b,rec);}
    else{rec.high=Math.max(rec.high,r.high);rec.low=Math.min(rec.low,r.low);rec.close=r.close;}}
  return [...map.values()].sort((a,b)=>a.ts-b.ts);
}
/* يوم نيويورك */
function nyDateKey(ts){const p=dtfNY.formatToParts(new Date(ts));
  return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`;}
function aggregateDailyNY(rows5){
  const map=new Map();
  for(const r of rows5){const key=nyDateKey(r.ts); let rec=map.get(key);
    if(!rec){rec={key,ts:r.ts,open:r.open,high:r.high,low:r.low,close:r.close};map.set(key,rec);}
    else{rec.high=Math.max(rec.high,r.high);rec.low=Math.min(rec.low,r.low);rec.close=r.close;}}
  return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
}

/* مؤشرات */
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

/* تصنيف */
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

/* Pivot NY */
function calcPivotsFromDailyNY(dailyNY){
  if(!dailyNY||dailyNY.length<2) return null; const y=dailyNY[dailyNY.length-2];
  const H=y.high,L=y.low,C=y.close; if(![H,L,C].every(Number.isFinite)) return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {P,R1,R2,R3,S1,S2,S3};
}

/* فلاتر */
function atrPct(atrV,price){return (Number.isFinite(atrV)&&Number.isFinite(price)&&price>0)?(100*atrV/price):NaN;}
function inNyTradingHours(ts){
  if (elToggleNyHours?.checked) return true; // تعطيل الفلتر
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(ts));
  const h=parseInt(parts.find(p=>p.type==='hour').value,10), m=parseInt(parts.find(p=>p.type==='minute').value,10);
  const t=h*60+m, s=NY_TRADE_START.hour*60+NY_TRADE_START.minute, e=NY_TRADE_END.hour*60+NY_TRADE_END.minute;
  return t>=s && t<=e;
}
function priceNearAnyPivot(entry,piv,minDist){
  if(elTogglePivotFilter?.checked) return false; // تعطيل الفلتر
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

/* Helpers */
function rsiMacdContext(series,rsiArr,macdObj,i){return {rsiVal:rsiArr[i],macdNow:macdObj.macd[i],macdPrev:macdObj.macd[i-1],macdSig:macdObj.signal[i],price:series[i].close,emaF:macdObj.emaF[i],emaS:macdObj.emaS[i]};}
function adjustEntry(entry,priceNow,atrV,side){ if(!Number.isFinite(entry)||!Number.isFinite(priceNow)||!Number.isFinite(atrV)) return entry;
  const EPS=0.01; if(Math.abs(entry-priceNow)<EPS){const bump=0.2*atrV; return side==='شراء'?priceNow+bump:priceNow-bump;} return entry;}
function calcPositionSize(entry,sl){const risk=ACCT_SIZE*(RISK_PCT/100), dist=Math.abs(entry-sl); if(!Number.isFinite(risk)||!Number.isFinite(dist)||dist<=0) return null; return {riskAmt:risk,units:risk/dist};}

/* مجمِّع الإشارة النهائي */
function filteredSignal(tf,series,rsiArr,macdObj,atrArr,rows5Ref,rows30Ref,rows60Ref,piv,stochObj,bbObj){
  const i=series.length-1; const ctx=rsiMacdContext(series,rsiArr,macdObj,i); let sig=classifyFinal(ctx);
  if(!inNyTradingHours(series[i].ts)) sig='حيادي';
  const ap=atrPct(atrArr?.[i],series[i].close); if(Number.isFinite(ap)&&(ap<ATR_MIN_PCT||ap>ATR_MAX_PCT)) sig='حيادي';
  if(tf===5&&sig!=='حيادي'&&rows30Ref){ if(!strongMTFConfirm(rows30Ref,rows60Ref)) sig='حيادي'; }
  sig=applyExtraFilters(sig,series,i,stochObj,bbObj);
  if(sig!=='حيادي'&&piv){ const emaS=macdObj.emaS[i]; let e=(sig==='شراء')?Math.max(series[i].close,Number.isFinite(emaS)?emaS:series[i].close):Math.min(series[i].close,Number.isFinite(emaS)?emaS:series[i].close); e=adjustEntry(e,series[i].close,atrArr?.[i]??0.5,sig); if(priceNearAnyPivot(e,piv,PIVOT_MIN_DISTANCE)) sig='حيادي'; }
  return sig;
}

/* نصيحة: تُظهر دائمًا، مع سبب الرفض إن حصل */
function buildAdvice(tf,series,rsiArr,macdObj,piv,live,atrArr,rows5,rows30,rows60,stoch,bb){
  if(!series?.length) return '—'; const i=series.length-1, emaS=macdObj.emaS[i], last=series[i].close;
  const nowPx=(live&&(Date.now()-live.timeMs)<20000&&Number.isFinite(live.price))?live.price:last;
  const sigFiltered=filteredSignal(tf,series,rsiArr,macdObj,atrArr,rows5,rows30,rows60,piv,stoch,bb);
  const ctx=rsiMacdContext(series,rsiArr,macdObj,i); const sigSummary=classifyFinal(ctx);
  const atrV=atrArr?.[i] ?? Math.max(0.3, Math.abs(series[i].high-series[i].low)); const atrp=atrPct(atrV,nowPx);

  const mkLines=(side)=>{ let entry=(side==='شراء')?Math.max(nowPx,Number.isFinite(emaS)?emaS:nowPx):Math.min(nowPx,Number.isFinite(emaS)?emaS:nowPx);
    entry=adjustEntry(entry,nowPx,atrV,side); const sl=(side==='شراء')?entry-SL_ATR_MULT*atrV:entry+SL_ATR_MULT*atrV;
    const tp1=(side==='شراء')?entry+TP1_ATR_MULT*atrV:entry-TP1_ATR_MULT*atrV;
    const tp2=(side==='شراء')?entry+TP2_ATR_MULT*atrV:entry-TP2_ATR_MULT*atrV; return {entry,sl,tp1,tp2}; };

  if(sigFiltered!=='حيادي'){ const L=mkLines(sigFiltered); const ps=calcPositionSize(L.entry,L.sl);
    const sizeTxt=ps?` • حجم تقريبي: ${nf2.format(ps.units)} وحدة (مخاطرة ≈ ${nf2.format(ps.riskAmt)}$)`:''; 
    return `الإطار: ${tfLabel(tf)} • الإشارة: ${sigFiltered}.
سعر الدخول: ${nf2.format(L.entry)} • وقف الخسارة: ${nf2.format(L.sl)}
الأهداف: ${nf2.format(L.tp1)} (جزئي/نقل إلى BE) ثم ${nf2.format(L.tp2)} مع Trailing ATR.${sizeTxt}`; }

  if(sigSummary==='شراء'||sigSummary==='بيع'){ const reasons=[];
    if(!inNyTradingHours(series[i].ts)) reasons.push('خارج ساعات نيويورك');
    const ap=atrPct(atrV,nowPx); if(Number.isFinite(ap)&&(ap<ATR_MIN_PCT||ap>ATR_MAX_PCT)) reasons.push('ATR% خارج النطاق');
    if(tf===5 && MTF_CONFIRM && !(strongMTFConfirm(rows30,rows60))) reasons.push('فشل تأكيد MTF');
    if(piv){ let tmp=mkLines(sigSummary).entry; if(priceNearAnyPivot(tmp,piv,PIVOT_MIN_DISTANCE)) reasons.push('قريب جدًا من Pivot'); }
    const L=mkLines(sigSummary); return `الإطار: ${tfLabel(tf)} • الملخص: ${sigSummary} (مرفوض بالفلاتر: ${reasons.join(' • ')||'—'}).
(إطلاع فقط) دخول افتراضي: ${nf2.format(L.entry)} • SL: ${nf2.format(L.sl)} • TP1/TP2: ${nf2.format(L.tp1)} / ${nf2.format(L.tp2)}.
ATR%: ${Number.isFinite(atrp)?nf2.format(atrp):'—'} ضمن [${ATR_MIN_PCT}–${ATR_MAX_PCT}] • آخر سعر: ${nf2.format(nowPx)}.`; }

  let base=`الإطار: ${tfLabel(tf)} • الإشارة: حيادي. `; if(Number.isFinite(atrp)) base+=`ATR%: ${nf2.format(atrp)} ضمن [${ATR_MIN_PCT}–${ATR_MAX_PCT}]؟ `;
  return base+`آخر سعر: ${nf2.format(nowPx)}.`;
}

/* رسم */
function paintLive(price,ts){ if(elLivePrice&&Number.isFinite(price)) elLivePrice.textContent=nf2.format(price);
  if(elLiveTime&&ts) elLiveTime.textContent=fmtLocalDateTime(ts); }
function paintIndicators(rsiVal,macdVal,emaFv,emaSv,stK,stD,bbMid,bbUp,bbDn){
  if(elIndRSI)  elIndRSI.textContent  = Number.isFinite(rsiVal)?nf2.format(rsiVal):'—';
  if(elIndMACD) elIndMACD.textContent = Number.isFinite(macdVal)?nf4.format(macdVal):'—';
  if(elIndEMAF) elIndEMAF.textContent = Number.isFinite(emaFv)?nf2.format(emaFv):'—';
  if(elIndEMAS) elIndEMAS.textContent = Number.isFinite(emaSv)?nf2.format(emaSv):'—';
  if(elIndStoch) elIndStoch.textContent=(Number.isFinite(stK)||Number.isFinite(stD))?`${Number.isFinite(stK)?nf2.format(stK):'—'} / ${Number.isFinite(stD)?nf2.format(stD):'—'}`:'—';
  if(elIndBB) elIndBB.textContent=(Number.isFinite(bbMid)||Number.isFinite(bbUp)||Number.isFinite(bbDn))?`${Number.isFinite(bbMid)?nf2.format(bbMid):'—'} / ${Number.isFinite(bbUp)?nf2.format(bbUp):'—'} / ${Number.isFinite(bbDn)?nf2.format(bbDn):'—'}`:'—';
}
function paintPivots(p){ if(!p) return; elPivotP&&(elPivotP.textContent=nf2.format(p.P));
  elR1&&(elR1.textContent=nf2.format(p.R1)); elR2&&(elR2.textContent=nf2.format(p.R2)); elR3&&(elR3.textContent=nf2.format(p.R3));
  elS1&&(elS1.textContent=nf2.format(p.S1)); elS2&&(elS2.textContent=nf2.format(p.S2)); elS3&&(elS3.textContent=nf2.format(p.S3)); }
function makeHiDPICanvas(c){const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,3)), r=c.getBoundingClientRect(); c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr); const ctx=c.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return ctx;}
function renderTradeChart(series,lines){
  const canvas=document.getElementById('tradeChart'); if(!canvas||!series?.length) return;
  const ctx=makeHiDPICanvas(canvas), W=canvas.clientWidth, H=canvas.clientHeight;
  ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,W,H);
  const data=series.slice(-120); let minY=Math.min(...data.map(d=>d.low)), maxY=Math.max(...data.map(d=>d.high));
  const add=v=>{if(Number.isFinite(v)){minY=Math.min(minY,v);maxY=Math.max(maxY,v);}}; add(lines?.entry);add(lines?.sl);add(lines?.tp1);add(lines?.tp2);add(window.__livePrice);
  if(minY===maxY){minY-=1;maxY+=1;} const pad=(maxY-minY)*0.08; minY-=pad; maxY+=pad;
  const x0=46,x1=W-12,y0=16,y1=H-24, plotW=x1-x0, plotH=y1-y0, xAt=i=>x0+(i/(data.length-1))*plotW, yAt=v=>y1-((v-minY)/(maxY-minY))*plotH;
  ctx.strokeStyle='#223047'; ctx.lineWidth=1; ctx.font='12px system-ui'; ctx.fillStyle='#9ca3af'; ctx.textAlign='right'; ctx.textBaseline='middle';
  for(let g=0;g<=4;g++){const yVal=minY+(g/4)*(maxY-minY), y=Math.round(yAt(yVal))+0.5; ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); ctx.fillText(nf2.format(yVal),x0-6,y);}
  const cw=Math.max(2, plotW/Math.max(30,data.length)*0.7);
  for(let i=0;i<data.length;i++){const d=data[i], x=xAt(i), yH=yAt(d.high), yL=yAt(d.low), yO=yAt(d.open), yC=yAt(d.close), bull=d.close>=d.open;
    ctx.strokeStyle=bull?'#16a34a':'#ef4444'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(x,yH); ctx.lineTo(x,yL); ctx.stroke();
    const xL=x-cw/2,xR=x+cw/2; ctx.beginPath(); ctx.moveTo(xL,yO); ctx.lineTo(xR,yO); ctx.lineTo(xR,yC); ctx.lineTo(xL,yC); ctx.closePath(); ctx.fillStyle=bull?'#16a34a':'#ef4444'; ctx.globalAlpha=0.85; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();}
  function drawH(val,color,label){ if(!Number.isFinite(val)) return; const y=Math.round(yAt(val))+0.5;
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=2; ctx.setLineDash([6,5]); ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); ctx.setLineDash([]);
    const tag=`${label}: ${nf2.format(val)}`, tw=ctx.measureText(tag).width+10, th=18, bx=x0+8, by=y-th-6;
    ctx.fillStyle='#0b1220'; ctx.strokeStyle=color; ctx.lineWidth=1; ctx.beginPath(); ctx.roundRect?.(bx,by,tw,th,6); if(!ctx.roundRect){ctx.rect(bx,by,tw,th);} ctx.fill(); ctx.stroke();
    ctx.fillStyle=color; ctx.font='12px system-ui'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(tag,bx+6,by+th/2); ctx.restore();}
  drawH(lines?.entry,'#60a5fa','Entry'); drawH(lines?.tp1,'#22c55e','TP1'); drawH(lines?.tp2,'#22c55e','TP2'); drawH(lines?.sl,'#f87171','SL');
  if(Number.isFinite(window.__livePrice)) drawH(window.__livePrice,'#ffffff','Live');
}

/* ملخّص */
function paintSummary(rsiVal,macdVal,extras){
  if(!elSummaryText) return;
  const s=classifyFinal({rsiVal,macdNow:macdVal,macdPrev:extras?.macdPrev,macdSig:extras?.macdSig,price:extras?.price,emaF:extras?.emaF,emaS:extras?.emaS});
  elSummaryText.textContent=s+(PRO_MODE?' (دقيق)':''); elSummaryText.style.color=(s==='شراء')?'#10b981':(s==='بيع')?'#ef4444':'#f59e0b';
}

/* Live (multi-source) */
async function fetchLivePrice(){
  for(const url of LIVE_SOURCES){ try{
    const r=await fetch(url,{cache:'no-store',mode:'cors'}); if(!r.ok) continue;
    const ct=(r.headers.get('content-type')||'').toLowerCase(); let price=null;
    if(ct.includes('json')){const j=await r.json(); if(Array.isArray(j)&&Number.isFinite(j[0])) price=+j[0]; else if(j&&Number.isFinite(j.price)) price=+j.price;}
    if(Number.isFinite(price)) return price;
  }catch{} }
  throw new Error('تعذّر جلب السعر الحي');
}

/* تنبيه اقتراب */
function beep(){ try{const ac=new (window.AudioContext||window.webkitAudioContext)(), o=ac.createOscillator(), g=ac.createGain();
  o.connect(g); g.connect(ac.destination); o.type='sine'; o.frequency.value=880; g.gain.value=0.05; o.start(); setTimeout(()=>{o.stop();ac.close();},200);}catch{} }
async function webNotify(t,b){ try{ if(!('Notification'in window)) return;
  if(Notification.permission==='granted') new Notification(t,{body:b});
  else if(Notification.permission!=='denied'){const p=await Notification.requestPermission(); if(p==='granted') new Notification(t,{body:b});} }catch{} }
function checkProximityAlert(entry){
  if(!elAlertEnable?.checked || !Number.isFinite(entry) || !Number.isFinite(window.__livePrice)) return;
  const dist=Math.abs(window.__livePrice-entry), thr=Math.max(0,parseFloat(elAlertDist?.value||'0.5')), now=Date.now();
  if(dist<=thr && now>__alertLockUntil){ __alertLockUntil=now+15000; const msg=`اقترب السعر من الدخول: ${nf2.format(window.__livePrice)} (Entry ${nf2.format(entry)})`;
    beep(); webNotify('تنبيه دخول',msg); if(elLivePrice){elLivePrice.style.transition='color .15s'; elLivePrice.style.color='#67e8f9'; setTimeout(()=>{elLivePrice.style.color='#ffffff';},400);} }
}

/* دمج التكت الحي ضمن الشمعة */
function mergeLiveIntoSeries(series,tfMin,live){
  if(!series?.length||!live) return series; const ms=tfMin*60*1000, b=Math.floor(live.timeMs/ms)*ms;
  const out=series.slice(), last={...out[out.length-1]};
  if(b===last.ts){last.close=live.price; last.high=Math.max(last.high,live.price); last.low=Math.min(last.low,live.price); out[out.length-1]=last;}
  else if(b>last.ts){out.push({ts:b,open:last.close,high:live.price,low:live.price,close:live.price});}
  return out;
}

/* تحليل */
async function runAnalysis(){
  try{
    loadSettings();
    const csvUrl=elCsvInput?.value?.trim()||''; const rows5=await fetchCsv(csvUrl);
    const rows30=aggregateOHLC(rows5,30), rows60=aggregateOHLC(rows5,60), rowsDayNY=aggregateDailyNY(rows5);
    const base=(currentTF===30)?rows30:(currentTF===60)?rows60:(currentTF===1440)?rowsDayNY:rows5;
    const series=(LAST_LIVE)?mergeLiveIntoSeries(base,currentTF,LAST_LIVE):base;

    const rsiArr=rsi(series,RSI_PER), mac=macd(series,EMA_FAST,EMA_SLOW,9), atrArr=atr(series,ATR_PERIOD);
    const stoch= (elUseStoch?.checked)?stochastic(series,STOCH_K,STOCH_D):null;
    const bb    = (elUseBB?.checked)   ?bollinger(series,BB_PERIOD,BB_STD):null;

    const i=series.length-1, px=series[i].close;
    paintSummary(rsiArr[i],mac.macd[i],{macdPrev:mac.macd[i-1],macdSig:mac.signal[i],price:px,emaF:mac.emaF[i],emaS:mac.emaS[i]});
    paintIndicators(rsiArr[i],mac.macd[i],mac.emaF[i],mac.emaS[i],stoch?.k[i],stoch?.d[i],bb?.mid[i],bb?.up[i],bb?.dn[i]);

    const piv=calcPivotsFromDailyNY(rowsDayNY); paintPivots(piv);

    const table=series.map((p,idx)=>({ts:p.ts,date:toLocalDate(p.ts),time:toLocalTime(p.ts),price:p.close,rsi:rsiArr[idx],macd:mac.macd[idx],emaF:mac.emaF[idx]}));
    paintTable(table);

    // خطوط الرسم (قد تكون undefined إذا حيادي فعلاً)
    const sig=filteredSignal(currentTF,series,rsiArr,mac,atrArr,rows5,rows30,rows60,piv,stoch,bb);
    const aNow=atrArr?.[i]??0.5, emaS=mac.emaS[i]; let entry=null;
    if(sig==='شراء') entry=Math.max(px,Number.isFinite(emaS)?emaS:px);
    else if(sig==='بيع') entry=Math.min(px,Number.isFinite(emaS)?emaS:px);
    entry=adjustEntry(entry,px,aNow,sig);
    const lines={ entry,
      sl: sig==='شراء'? entry-SL_ATR_MULT*aNow : sig==='بيع'? entry+SL_ATR_MULT*aNow : undefined,
      tp1: sig==='شراء'? entry+TP1_ATR_MULT*aNow: sig==='بيع'? entry-TP1_ATR_MULT*aNow: undefined,
      tp2: sig==='شراء'? entry+TP2_ATR_MULT*aNow: sig==='بيع'? entry-TP2_ATR_MULT*aNow: undefined,
    };
    window.__lastBaseSeries=base; window.__lastSeriesForChart=series; window.__lastLinesForChart=lines;
    renderTradeChart(series,lines);

    if(elAdviceText) elAdviceText.textContent=buildAdvice(currentTF,series,rsiArr,mac,piv,LAST_LIVE,atrArr,rows5,rows30,rows60,stoch,bb);
    __cache={tf:currentTF,series,rsiArr,mac,piv,atrArr,rows5,rows30,rows60,stoch,bb,rowsDayNY};
    checkProximityAlert(lines?.entry);
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
  const lines={entry,
    sl: sig==='شراء'? entry-SL_ATR_MULT*aNow : sig==='بيع'? entry+SL_ATR_MULT*aNow : undefined,
    tp1: sig==='شراء'? entry+TP1_ATR_MULT*aNow: sig==='بيع'? entry-TP1_ATR_MULT*aNow: undefined,
    tp2: sig==='شراء'? entry+TP2_ATR_MULT*aNow: sig==='بيع'? entry-TP2_ATR_MULT*aNow: undefined};
  window.__lastSeriesForChart=series; window.__lastLinesForChart=lines; renderTradeChart(series,lines);
  if(elAdviceText) elAdviceText.textContent=buildAdvice(tf,series,rsiArr,mac,piv,LAST_LIVE,atrArr,rows5,rows30,rows60,stoch,bb);
  checkProximityAlert(lines?.entry);
}

/* Live refresh */
async function refreshLive(){ try{
  const price=await fetchLivePrice(); const t=Date.now(); paintLive(price,t);
  window.__livePrice=price; window.__liveTimeMs=t; LAST_LIVE={price,timeMs:t}; reprojectWithLive();
}catch(e){ console.warn('Live error:',e); } }

/* أحداث */
elBtnRun?.addEventListener('click',runAnalysis);
elTf5?.addEventListener('click',()=>{setActiveTF(5);runAnalysis();});
elTf30?.addEventListener('click',()=>{setActiveTF(30);runAnalysis();});
elTf60?.addEventListener('click',()=>{setActiveTF(60);runAnalysis();});
elTfD?.addEventListener('click',()=>{setActiveTF(1440);runAnalysis();});
[elProMode,elMtfConfirm,elUseStoch,elUseBB,elToggleNyHours,elTogglePivotFilter].forEach(el=>el?.addEventListener('change',runAnalysis));
[elEmaFast,elEmaSlow,elRsiPeriod,elAtrPeriod,elAtrMinPct,elAtrMaxPct,elStochK,elStochD,elBBPeriod,elBBStd,elSlMult,elTp1Mult,elTp2Mult,elAcctSize,elRiskPct]
  .forEach(el=>el?.addEventListener('input',()=>{ if(el===elSlMult||el===elTp1Mult||el===elTp2Mult||el===elAcctSize||el===elRiskPct) reprojectWithLive(); else runAnalysis(); }));

/* تذكّر رابط CSV */
const LS_CSV='gs_csv_url'; if(elCsvInput){ const saved=localStorage.getItem(LS_CSV)||''; if(!elCsvInput.value&&saved) elCsvInput.value=saved;
  elCsvInput.addEventListener('input',()=>{const v=elCsvInput.value.trim(); if(v) localStorage.setItem(LS_CSV,v); else localStorage.removeItem(LS_CSV);}); }

/* تشغيل أولي */
setActiveTF(5); runAnalysis(); refreshLive(); setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
