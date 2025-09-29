/************ GoldSignals - app.js (MTF + Live-candle Option A + Alerts + Written Advice) ************/
const LIVE_JSON_URL    = 'https://goldprice-proxy.samer-mourtada.workers.dev/price';
const DEFAULT_5M_CSV   = 'XAUUSD_5min.csv';
const TABLE_ROWS       = 80;
const LIVE_REFRESH_SEC = 1;

/*---------- UI ----------*/
const $ = (id)=>document.getElementById(id);
const elCsvInput=$('csvInput'), elTf5=$('tf5'), elTf30=$('tf30'), elTf60=$('tf60'), elTfD=$('tfD'), elBtnRun=$('runBtn');
const elProMode=$('proMode'), elMtfConfirm=$('mtfConfirm');
const elLivePrice=$('livePrice'), elLiveTime=$('liveTime'), elSummaryText=$('summaryText'), elAdviceText=$('adviceText');
const elIndRSI=$('indRSI'), elIndMACD=$('indMACD'), elIndEMAF=$('indEMAF'), elIndEMAS=$('indEMAS');
const elPivotP=$('pivotP'), elR1=$('r1'), elR2=$('r2'), elR3=$('r3'), elS1=$('s1'), elS2=$('s2'), elS3=$('s3');
const elRowsBody=$('rowsBody');

/* settings */
const elEmaFast=$('emaFast'), elEmaSlow=$('emaSlow'), elRsiPeriod=$('rsiPeriod');
const elAtrPeriod=$('atrPeriod'), elSlMult=$('slMult'), elTp1Mult=$('tp1Mult'), elTp2Mult=$('tp2Mult'), elAtrMinPct=$('atrMinPct'), elAtrMaxPct=$('atrMaxPct');
const elAcctSize=$('acctSize'), elRiskPct=$('riskPct');
const elAlertEnable=$('alertEnable'), elAlertDist=$('alertDistance');

/* defaults */
let EMA_FAST=+elEmaFast.value||12, EMA_SLOW=+elEmaSlow.value||26, RSI_PER=+elRsiPeriod.value||14;
let ATR_PERIOD=+elAtrPeriod.value||14, SL_ATR_MULT=+elSlMult.value||1.5, TP1_ATR_MULT=+elTp1Mult.value||1.0, TP2_ATR_MULT=+elTp2Mult.value||2.0;
let ATR_MIN_PCT=+elAtrMinPct.value||0.05, ATR_MAX_PCT=+elAtrMaxPct.value||0.8;
let ACCT_SIZE=+elAcctSize.value||10000, RISK_PCT=+elRiskPct.value||1.0;
let PRO_MODE=!!elProMode.checked, MTF_CONFIRM=!!elMtfConfirm.checked;

[elProMode,elMtfConfirm].forEach(x=>x?.addEventListener('change',()=>{PRO_MODE=elProMode.checked;MTF_CONFIRM=elMtfConfirm.checked;runAnalysis();}));
[elEmaFast,elEmaSlow,elRsiPeriod].forEach(x=>x?.addEventListener('input',runAnalysis));
[elAtrPeriod].forEach(x=>x?.addEventListener('input',()=>{ATR_PERIOD=Math.max(2,+elAtrPeriod.value||14);runAnalysis();}));
[elSlMult,elTp1Mult,elTp2Mult,elAcctSize,elRiskPct,elAtrMinPct,elAtrMaxPct].forEach(x=>x?.addEventListener('input',()=>{SL_ATR_MULT=+elSlMult.value||1.5;TP1_ATR_MULT=+elTp1Mult.value||1.0;TP2_ATR_MULT=+elTp2Mult.value||2.0;ACCT_SIZE=+elAcctSize.value||10000;RISK_PCT=+elRiskPct.value||1.0;ATR_MIN_PCT=+elAtrMinPct.value||0.05;ATR_MAX_PCT=+elAtrMaxPct.value||0.8;updateAdviceOnly();}));

/* format */
const nf2=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const nf4=new Intl.NumberFormat('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
const fmtLocal=(t)=>`${new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} ${new Date(t).toLocaleDateString('en-CA')}`;
const toLocalDate=(t)=>new Date(t).toLocaleDateString('en-CA');
const toLocalTime=(t)=>new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});

/* TF state */
let currentTF=5;
function setActiveTF(tf){currentTF=tf;[elTf5,elTf30,elTf60,elTfD].forEach(b=>b?.classList?.remove('active'));({5:elTf5,30:elTf30,60:elTf60,1440:elTfD}[tf])?.classList?.add('active');}
const tfLabel=(tf)=>tf===5?'5 دقائق':tf===30?'30 دقيقة':tf===60?'ساعة':tf===1440?'يوم':`${tf}m`;

/* CSV */
function parseCsv(text){
  const lines=text.trim().split(/\r?\n/); if(!lines.length) return [];
  const header=lines[0].toLowerCase(); const out=[];
  if(header.includes('symbol')&&header.includes('date')&&header.includes('time')){
    for(let i=1;i<lines.length;i++){const [sym,d,t,o,h,l,c]=lines[i].split(','); if(!d||!t)continue; const ts=Date.parse(`${d}T${t}Z`); const open=+o,high=+h,low=+l,close=+c;
      if(Number.isFinite(ts)&&Number.isFinite(close)) out.push({ts,open:Number.isFinite(open)?open:close,high:Number.isFinite(high)?high:close,low:Number.isFinite(low)?low:close,close});
    }
  }else{
    for(let i=1;i<lines.length;i++){const [d,c]=lines[i].split(','); const ts=Date.parse(d), close=+c;
      if(Number.isFinite(ts)&&Number.isFinite(close)) out.push({ts,open:close,high:close,low:close,close});
    }
  }
  out.sort((a,b)=>a.ts-b.ts); return out;
}
async function fetchCsv(url){const u=(url&&url.trim())?url.trim():DEFAULT_5M_CSV; const full=u.startsWith('http')?u:`${u}?t=${Date.now()}`; const r=await fetch(full,{cache:'no-store'}); if(!r.ok) throw new Error(`CSV HTTP ${r.status}`); return parseCsv(await r.text());}
function aggregateOHLC(rows, m){const ms=m*60*1000; const map=new Map(); for(const r of rows){const b=Math.floor(r.ts/ms)*ms; let k=map.get(b);
  if(!k){k={ts:b,open:r.open,high:r.high,low:r.low,close:r.close}; map.set(b,k);}else{k.high=Math.max(k.high,r.high);k.low=Math.min(k.low,r.low);k.close=r.close;}
} return [...map.values()].sort((a,b)=>a.ts-b.ts);}

/* indicators */
function ema(series,p){const out=new Array(series.length).fill(null),k=2/(p+1);let e=null,sum=0;for(let i=0;i<series.length;i++){const v=series[i].close;
  if(i<p){sum+=v; if(i===p-1){e=sum/p; out[i]=e;}} else {e=v*k+e*(1-k); out[i]=e;}} return out;}
function rsi(series,p=14){const out=new Array(series.length).fill(null); if(series.length<=p)return out; let g=0,l=0; for(let i=1;i<=p;i++){const d=series[i].close-series[i-1].close; if(d>=0)g+=d; else l-=d;}
  let ag=g/p, al=l/p; out[p]=al===0?100:100-(100/(1+(ag/al))); for(let i=p+1;i<series.length;i++){const d=series[i].close-series[i-1].close, G=d>0?d:0, L=d<0?-d:0; ag=(ag*(p-1)+G)/p; al=(al*(p-1)+L)/p; out[i]=al===0?100:100-(100/(1+(ag/al)));} return out;}
function macd(series,fast=12,slow=26,signal=9){const ef=ema(series,fast), es=ema(series,slow), m=series.map((_,i)=>ef[i]==null||es[i]==null?null:ef[i]-es[i]);
  const pts=m.map((v,i)=>({ts:series[i].ts, close:(v==null)?NaN:v})), clean=pts.filter(p=>Number.isFinite(p.close)); const sigClean=ema(clean,signal), sigFull=new Array(series.length).fill(null);
  for(let i=0,j=0;i<series.length;i++){if(Number.isFinite(pts[i]?.close)) sigFull[i]=sigClean[j++];} return {emaF:ef, emaS:es, macd:m, signal:sigFull};}
function atr(series,p=14){if(!series?.length)return[]; const tr=new Array(series.length).fill(null);
  for(let i=0;i<series.length;i++){const h=series[i].high,l=series[i].low; if(i===0){tr[i]=h-l;continue;} const pc=series[i-1].close; tr[i]=Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc));}
  const out=new Array(series.length).fill(null); let sum=0; for(let i=0;i<series.length;i++){const v=tr[i]; if(i<p){sum+=v; if(i===p-1) out[i]=sum/p;} else out[i]=(out[i-1]*(p-1)+v)/p;} return out;}

/* classify */
const classifyBase=(rsiV,macdV)=> (macdV==null||rsiV==null)?'حيادي' : (macdV>0&&rsiV>=50&&rsiV<=70)?'شراء' : (macdV<0&&rsiV<=50)?'بيع':'حيادي';
function classifyPrecise({rsiVal,macdNow,macdPrev,macdSig,price,emaF,emaS}){
  if([rsiVal,macdNow,emaF,emaS].some(v=>!Number.isFinite(v))) return 'حيادي';
  const crossUp=Number.isFinite(macdPrev)&&macdPrev<=macdSig&&macdNow>macdSig, crossDn=Number.isFinite(macdPrev)&&macdPrev>=macdSig&&macdNow<macdSig;
  if((crossUp||macdNow>macdSig)&&price>emaF&&emaF>emaS&&rsiVal>50&&rsiVal<68) return 'شراء';
  if((crossDn||macdNow<macdSig)&&price<emaF&&emaF<emaS&&rsiVal<50) return 'بيع';
  return 'حيادي';
}
const classifyFinal=(ctx)=> PRO_MODE?classifyPrecise(ctx):classifyBase(ctx.rsiVal,ctx.macdNow);

/* pivots */
function calcPivots(daily){if(!daily||daily.length<2)return null;const y=daily[daily.length-2];const H=y.high,L=y.low,C=y.close; if(![H,L,C].every(Number.isFinite))return null;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P); return {P,R1,R2,R3,S1,S2,S3};}

/* paint */
function paintLive(px,t){ if(elLivePrice&&Number.isFinite(px)) elLivePrice.textContent=nf2.format(px); if(elLiveTime&&t) elLiveTime.textContent=fmtLocal(t);}
function paintIndicators(rsiV,macdV,emaFv,emaSv){ if(elIndRSI) elIndRSI.textContent=Number.isFinite(rsiV)?nf2.format(rsiV):'—';
  if(elIndMACD) elIndMACD.textContent=Number.isFinite(macdV)?nf4.format(macdV):'—'; if(elIndEMAF) elIndEMAF.textContent=Number.isFinite(emaFv)?nf2.format(emaFv):'—'; if(elIndEMAS) elIndEMAS.textContent=Number.isFinite(emaSv)?nf2.format(emaSv):'—';}
function paintSummary(rsiV,macdV,ex){if(!elSummaryText)return; const s=classifyFinal({rsiVal:rsiV,macdNow:ex?.macdNow,macdPrev:ex?.macdPrev,macdSig:ex?.macdSig,price:ex?.price,emaF:ex?.emaF,emaS:ex?.emaS});
  elSummaryText.textContent=s+(PRO_MODE?' (دقيق)':''); elSummaryText.style.color=s==='شراء'?'#10b981':s==='بيع'?'#ef4444':'#f59e0b';}
function paintPivots(p){if(!p)return; elPivotP.textContent=nf2.format(p.P); elR1.textContent=nf2.format(p.R1); elR2.textContent=nf2.format(p.R2); elR3.textContent=nf2.format(p.R3);
  elS1.textContent=nf2.format(p.S1); elS2.textContent=nf2.format(p.S2); elS3.textContent=nf2.format(p.S3);}
function paintTable(rows){ if(!elRowsBody)return; elRowsBody.innerHTML=''; for(const r of rows.slice(-TABLE_ROWS).reverse()){const s=classifyBase(r.rsi,r.macd); const color=s==='شراء'?'#10b981':s==='بيع'?'#ef4444':'#f59e0b';
  const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.date}</td><td>${r.time}</td><td>${nf2.format(r.price)}</td><td style="color:${color};font-weight:600">${s}</td><td>${Number.isFinite(r.rsi)?nf2.format(r.rsi):'—'}</td><td>${Number.isFinite(r.macd)?nf4.format(r.macd):'—'}</td><td>${nf2.format(r.emaF)}</td>`; elRowsBody.appendChild(tr);}}

/* HiDPI canvas + chart */
function makeHiDPICanvas(cv){const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,3));const r=cv.getBoundingClientRect();cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr);
  const ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return ctx;}
function renderTradeChart(series,lines){
  const cv=document.getElementById('tradeChart'); if(!cv||!series?.length) return; const ctx=makeHiDPICanvas(cv); const W=cv.clientWidth,H=cv.clientHeight;
  ctx.fillStyle='#0b1220';ctx.fillRect(0,0,W,H);
  const data=series.slice(-120);
  let minY=Math.min(...data.map(d=>d.low)), maxY=Math.max(...data.map(d=>d.high));
  const add=(v)=>{if(Number.isFinite(v)){minY=Math.min(minY,v);maxY=Math.max(maxY,v);}}; add(lines?.entry);add(lines?.sl);add(lines?.tp1);add(lines?.tp2);add(window.__livePrice);
  if(minY===maxY){minY-=1;maxY+=1;} const pad=(maxY-minY)*.08;minY-=pad;maxY+=pad;
  const x0=46,x1=W-12,y0=16,y1=H-24, plotW=x1-x0, plotH=y1-y0, xAt=i=>x0+(i/(data.length-1))*plotW, yAt=v=>y1-((v-minY)/(maxY-minY))*plotH;
  ctx.strokeStyle='#223047';ctx.lineWidth=1;ctx.font='12px system-ui';ctx.fillStyle='#9ca3af';ctx.textAlign='right';ctx.textBaseline='middle';
  for(let g=0;g<=4;g++){const yVal=minY+(g/4)*(maxY-minY), y=Math.round(yAt(yVal))+0.5; ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();ctx.fillText(nf2.format(yVal),x0-6,y);}
  const cw=Math.max(2,plotW/Math.max(30,data.length)*.7);
  for(let i=0;i<data.length;i++){const d=data[i], x=xAt(i), yH=yAt(d.high), yL=yAt(d.low), yO=yAt(d.open), yC=yAt(d.close), bull=d.close>=d.open;
    ctx.strokeStyle=bull?'#16a34a':'#ef4444';ctx.lineWidth=1.2; ctx.beginPath();ctx.moveTo(x,yH);ctx.lineTo(x,yL);ctx.stroke();
    const xL=x-cw/2, xR=x+cw/2; ctx.beginPath();ctx.moveTo(xL,yO);ctx.lineTo(xR,yO);ctx.lineTo(xR,yC);ctx.lineTo(xL,yC);ctx.closePath(); ctx.fillStyle=bull?'#16a34a':'#ef4444';ctx.globalAlpha=.85;ctx.fill();ctx.globalAlpha=1;ctx.stroke();}
  function hline(val,color,label){if(!Number.isFinite(val))return; const y=Math.round(yAt(val))+0.5; ctx.save();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([6,5]);
    ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();ctx.setLineDash([]); const tag=`${label}: ${nf2.format(val)}`;
    const tw=ctx.measureText(tag).width+10, th=18, bx=x0+8, by=y-th-6; ctx.fillStyle='#0b1220';ctx.strokeStyle=color;ctx.lineWidth=1; ctx.beginPath();ctx.roundRect?.(bx,by,tw,th,6); if(!ctx.roundRect){ctx.rect(bx,by,tw,th);} ctx.fill();ctx.stroke();
    ctx.fillStyle=color;ctx.font='12px system-ui';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(tag,bx+6,by+th/2); ctx.restore();}
  hline(lines?.entry,'#60a5fa','Entry'); hline(lines?.tp1,'#22c55e','TP1'); hline(lines?.tp2,'#22c55e','TP2'); hline(lines?.sl,'#f87171','SL'); if(Number.isFinite(window.__livePrice)) hline(window.__livePrice,'#67e8f9','Live');
}

/* helpers */
const rsiMacdContext=(series,rsiArr,macdObj,i)=>({rsiVal:rsiArr[i],macdNow:macdObj.macd[i],macdPrev:macdObj.macd[i-1],macdSig:macdObj.signal[i],price:series[i].close,emaF:macdObj.emaF[i],emaS:macdObj.emaS[i]});
const atrPct=(a,p)=>Number.isFinite(a)&&Number.isFinite(p)&&p>0?(100*a/p):NaN;
function mtfOkIfEnabled(rows5,rows30){ if(!MTF_CONFIRM||!rows30?.length) return true; const ef=ema(rows30,EMA_FAST), es=ema(rows30,EMA_SLOW);
  const j=rows30.length-1, f=ef[j], s=es[j]; if(!Number.isFinite(f)||!Number.isFinite(s)) return true; return f>s; } // شراء فقط؛ سنعالج في filteredSignal

function calcPositionSize(entry,sl){const risk=ACCT_SIZE*(RISK_PCT/100), dist=Math.abs(entry-sl); if(!Number.isFinite(risk)||!Number.isFinite(dist)||dist<=0)return null; return {riskAmt:risk,units:risk/dist};}

/* same signal for chart & advice */
function filteredSignal(tf,series,rsiArr,macdObj,atrArr,rows5Ref,rows30Ref){
  const i=series.length-1, ctx=rsiMacdContext(series,rsiArr,macdObj,i); let sig=classifyFinal(ctx);
  const nowPx=series[i].close, av=atrArr?.[i], ap=atrPct(av,nowPx); if(Number.isFinite(ap)&&(ap<ATR_MIN_PCT||ap>ATR_MAX_PCT)) sig='حيادي';
  if(tf===5 && sig!=='حيادي' && rows5Ref && rows30Ref){const ef=ema(rows30Ref,EMA_FAST), es=ema(rows30Ref,EMA_SLOW); const okBuy=ef.at(-1)>es.at(-1), okSell=ef.at(-1)<es.at(-1); if(sig==='شراء'&&!okBuy) sig='حيادي'; if(sig==='بيع'&&!okSell) sig='حيادي';}
  return sig;
}

/* written advice */
function buildAdvice(tf,series,rsiArr,macdObj,piv,live,atrArr,rows5Ref,rows30Ref){
  if(!series?.length) return '—';
  const i=series.length-1, emaS=macdObj.emaS[i], last=series[i].close;
  const nowPx=(live && (Date.now()-live.timeMs)<20000 && Number.isFinite(live.price))?live.price:last;
  const sig=filteredSignal(tf,series,rsiArr,macdObj,atrArr,rows5Ref,rows30Ref);
  const atrV=atrArr?.[i] ?? Math.max(0.3, Math.abs(series[i].high-series[i].low));
  const atrp=atrPct(atrV, nowPx);

  if(sig==='حيادي'){
    let t=`الإطار: ${tfLabel(tf)} • الإشارة: حيادي.`; if(Number.isFinite(atrp)) t+=` ATR%: ${nf2.format(atrp)} ضمن [${ATR_MIN_PCT}–${ATR_MAX_PCT}].`; t+=` آخر سعر: ${nf2.format(nowPx)}.`; return t;
  }

  let entry=nowPx, sl, tp1, tp2;
  if(sig==='شراء'){ entry=Math.max(nowPx, Number.isFinite(emaS)?emaS:nowPx); sl=entry-SL_ATR_MULT*atrV; tp1=entry+TP1_ATR_MULT*atrV; tp2=entry+TP2_ATR_MULT*atrV; if(piv){tp1=Math.max(tp1, piv.R1??tp1); tp2=Math.max(tp2, piv.R2??tp2);} }
  else { entry=Math.min(nowPx, Number.isFinite(emaS)?emaS:nowPx); sl=entry+SL_ATR_MULT*atrV; tp1=entry-TP1_ATR_MULT*atrV; tp2=entry-TP2_ATR_MULT*atrV; if(piv){tp1=Math.min(tp1, piv.S1??tp1); tp2=Math.min(tp2, piv.S2??tp2);} }

  const ps=calcPositionSize(entry,sl); const sizeTxt=ps?` • حجم تقريبي: ${nf2.format(ps.units)} وحدة (مخاطرة ≈ ${nf2.format(ps.riskAmt)}$)`:''; 
  return `الإطار: ${tfLabel(tf)} • الإشارة: ${sig}.
سعر الدخول: ${nf2.format(entry)} • وقف الخسارة (ATR×${SL_ATR_MULT}): ${nf2.format(sl)} • الأهداف: ${nf2.format(tp1)} ثم ${nf2.format(tp2)}.${sizeTxt}`;
}

/* live merge (Option A) */
let LAST_LIVE=null, __cache=null, __alertLockUntil=0;
function mergeLiveIntoSeries(series,tfMin,live){
  if(!series?.length||!live) return series; const ms=tfMin*60*1000, bucket=Math.floor(live.timeMs/ms)*ms;
  const out=series.slice(), last={...out.at(-1)}; if(bucket===last.ts){ last.close=live.price; last.high=Math.max(last.high,live.price); last.low=Math.min(last.low,live.price); out[out.length-1]=last; }
  else if(bucket>last.ts){ out.push({ts:bucket,open:last.close,high:live.price,low:live.price,close:live.price}); }
  return out;
}

/* core analysis */
async function runAnalysis(){
  try{
    const csvUrl=elCsvInput?.value?.trim()||'', rows5=await fetchCsv(csvUrl); if(!rows5.length) throw new Error('ملف CSV فارغ');
    const rows30=aggregateOHLC(rows5,30), rows60=aggregateOHLC(rows5,60), rowsD=aggregateOHLC(rows5,1440);
    let base=({5:rows5,30:rows30,60:rows60,1440:rowsD}[currentTF]); const merged=LAST_LIVE?mergeLiveIntoSeries(base,currentTF,LAST_LIVE):base;

    const rsiArr=rsi(merged,RSI_PER), macdObj=macd(merged,EMA_FAST,EMA_SLOW,9), atrArr=atr(merged,ATR_PERIOD);
    const i=merged.length-1, price=merged[i].close, rsiNow=rsiArr[i], macdNow=macdObj.macd[i], macdPrev=macdObj.macd[i-1], macdSig=macdObj.signal[i], emaF=macdObj.emaF[i], emaS=macdObj.emaS[i];

    paintSummary(rsiNow,macdNow,{macdPrev,macdSig,price,emaF,emaS}); paintIndicators(rsiNow,macdNow,emaF,emaS);
    const piv=calcPivots(rowsD); paintPivots(piv);

    const tableRows=merged.map((p,idx)=>({ts:p.ts,date:toLocalDate(p.ts),time:toLocalTime(p.ts),price:p.close,rsi:rsiArr[idx],macd:macdObj.macd[idx],emaF:macdObj.emaF[idx]})); paintTable(tableRows);

    const sigNow=filteredSignal(currentTF,merged,rsiArr,macdObj,atrArr,rows5,rows30); const aNow=atrArr?.[i]??0;
    const entry=(sigNow==='شراء')?Math.max(price,Number.isFinite(emaS)?emaS:price):(sigNow==='بيع')?Math.min(price,Number.isFinite(emaS)?emaS:price):null;
    const lines={ entry,
      sl:(sigNow==='شراء')?entry-SL_ATR_MULT*aNow:(sigNow==='بيع')?entry+SL_ATR_MULT*aNow:undefined,
      tp1:(sigNow==='شراء')?entry+TP1_ATR_MULT*aNow:(sigNow==='بيع')?entry-TP1_ATR_MULT*aNow:undefined,
      tp2:(sigNow==='شراء')?entry+TP2_ATR_MULT*aNow:(sigNow==='بيع')?entry-TP2_ATR_MULT*aNow:undefined
    };

    window.__lastBaseSeries=base; window.__lastSeriesForChart=merged; window.__lastLinesForChart=lines; renderTradeChart(merged,lines);
    if(elAdviceText) elAdviceText.textContent=buildAdvice(currentTF,merged,rsiArr,macdObj,piv,LAST_LIVE,atrArr,rows5,rows30);
    __cache={tf:currentTF,series:merged,rsiArr,macdObj,piv,atrArr,rows5,rows30};

    checkProximityAlert(lines?.entry);
  }catch(e){ alert(`تعذّر تحميل/تحليل البيانات: ${e.message||e}`); console.error(e); }
}

/* quick reproject with live */
function reprojectWithLive(){
  if(!__cache||!LAST_LIVE) return;
  const {tf}=__cache; const base=window.__lastBaseSeries||__cache.series; const merged=mergeLiveIntoSeries(base,tf,LAST_LIVE);
  const rsiArr=rsi(merged,RSI_PER), macdObj=macd(merged,EMA_FAST,EMA_SLOW,9), atrArr=atr(merged,ATR_PERIOD);
  const i=merged.length-1, price=merged[i].close, emaS=macdObj.emaS[i];
  const sigNow=filteredSignal(tf,merged,rsiArr,macdObj,atrArr,__cache.rows5,__cache.rows30), aNow=atrArr?.[i]??0;
  const entry=(sigNow==='شراء')?Math.max(price,Number.isFinite(emaS)?emaS:price):(sigNow==='بيع')?Math.min(price,Number.isFinite(emaS)?emaS:price):null;
  const lines={entry,
    sl:(sigNow==='شراء')?entry-SL_ATR_MULT*aNow:(sigNow==='بيع')?entry+SL_ATR_MULT*aNow:undefined,
    tp1:(sigNow==='شراء')?entry+TP1_ATR_MULT*aNow:(sigNow==='بيع')?entry-TP1_ATR_MULT*aNow:undefined,
    tp2:(sigNow==='شراء')?entry+TP2_ATR_MULT*aNow:(sigNow==='بيع')?entry-TP2_ATR_MULT*aNow:undefined,
  };
  window.__lastSeriesForChart=merged; window.__lastLinesForChart=lines; renderTradeChart(merged,lines);
  if(elAdviceText) elAdviceText.textContent=buildAdvice(tf,merged,rsiArr,macdObj,__cache.piv,LAST_LIVE,atrArr,__cache.rows5,__cache.rows30);
  checkProximityAlert(lines?.entry);
}

/* only update advice when ATR/SL/TP inputs change */
function updateAdviceOnly(){ if(!__cache) return; reprojectWithLive(); }

/* alert */
function beep(){try{const ac=new (window.AudioContext||window.webkitAudioContext)(); const o=ac.createOscillator(), g=ac.createGain(); o.connect(g); g.connect(ac.destination); o.type='sine'; o.frequency.value=880; g.gain.value=0.05; o.start(); setTimeout(()=>{o.stop();ac.close();},200);}catch{}}
function checkProximityAlert(entry){
  if(!elAlertEnable?.checked || !Number.isFinite(entry) || !Number.isFinite(window.__livePrice)) return;
  const dist=Math.abs(window.__livePrice-entry), thr=Math.max(0, +elAlertDist.value||0.5), now=Date.now();
  if(dist<=thr && now>__alertLockUntil){ __alertLockUntil=now+15000; beep(); if(elLivePrice){elLivePrice.style.transition='color .15s'; elLivePrice.style.color='#67e8f9'; setTimeout(()=>elLivePrice.style.color='#ffffff',400);} }
}

/* live price */
async function refreshLive(){
  try{
    const r=await fetch(LIVE_JSON_URL,{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json(); if(j&&j.ok&&Number.isFinite(j.price)){const t=Date.now(); paintLive(j.price,t); window.__livePrice=j.price; window.__liveTimeMs=t; LAST_LIVE={price:j.price,timeMs:t}; reprojectWithLive();}
  }catch(e){ console.warn('Live error:',e); }
}

/* events */
elBtnRun?.addEventListener('click',runAnalysis);
elTf5?.addEventListener('click',()=>{setActiveTF(5);runAnalysis();});
elTf30?.addEventListener('click',()=>{setActiveTF(30);runAnalysis();});
elTf60?.addEventListener('click',()=>{setActiveTF(60);runAnalysis();});
elTfD?.addEventListener('click',()=>{setActiveTF(1440);runAnalysis();});
const LS_KEY='gs_csv_url';
if(elCsvInput){ const saved=localStorage.getItem(LS_KEY)||''; if(!elCsvInput.value&&saved) elCsvInput.value=saved; elCsvInput.addEventListener('input',()=>{const v=elCsvInput.value.trim(); if(v) localStorage.setItem(LS_KEY,v); else localStorage.removeItem(LS_KEY);});}

/* boot */
setActiveTF(5);
runAnalysis();
refreshLive();
setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
