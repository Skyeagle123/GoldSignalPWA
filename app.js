/* ======================= GoldSignals app.js ======================= */
/* دمج السعر الحي في الواجهة فقط (لا يغيّر CSV) + شمعات + BB + Stoch + Pivot + تنبيه */

const LIVE_JSON_URL   = 'https://goldprice-proxy.samer-mourtada.workers.dev/price';
const DEFAULT_5M_CSV  = 'XAUUSD_5min.csv';
const LIVE_REFRESH_SEC= 1;
const TABLE_ROWS      = 80;

const $ = (id)=>document.getElementById(id);

/* DOM */
const elCsvInput=$('csvInput'), elBtnRun=$('runBtn');
const elTf5=$('tf5'), elTf30=$('tf30'), elTf60=$('tf60'), elTfD=$('tfD');
const elLivePrice=$('livePrice'), elLiveTime=$('liveTime');
const elSummaryText=$('summaryText'), elAdviceText=$('adviceText');
const elPivotP=$('pivotP'), elR1=$('r1'), elR2=$('r2'), elR3=$('r3'), elS1=$('s1'), elS2=$('s2'), elS3=$('s3');
const elRowsBody=$('rowsBody');
const elEmaFast=$('emaFast'), elEmaSlow=$('emaSlow'), elRsiPeriod=$('rsiPeriod');
const elAtrPeriod=$('atrPeriod'), elSlMult=$('slMult'), elTp1Mult=$('tp1Mult'), elTp2Mult=$('tp2Mult');
const elAtrMinPct=$('atrMinPct'), elAtrMaxPct=$('atrMaxPct');
const elUseStoch=$('useStoch'), elStochK=$('stochK'), elStochD=$('stochD');
const elUseBB=$('useBB'), elBBPeriod=$('bbPeriod'), elBBStd=$('bbStd');
const elAlertEnable=$('alertEnable'), elAlertDist=$('alertDistance');
const elTogglePivotFilter=$('togglePivotFilter');

const nf2 = new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const nf4 = new Intl.NumberFormat('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
const tfLocal = new Intl.DateTimeFormat(undefined,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});

let ACTIVE_TF_MIN=5;
let SERIES=[];
let LAST_LIVE=null;
let PIVOT=null;

/* ===== مؤشرات ===== */
const ema=(arr,p)=>{const k=2/(p+1);let out=[],e=arr[0];for(let i=0;i<arr.length;i++){e=i?(arr[i]*k+e*(1-k)):arr[i];out.push(e);}return out;};
const rsi=(c,p=14)=>{let g=0,l=0,out=[];for(let i=1;i<c.length;i++){const ch=c[i]-c[i-1];g+=Math.max(ch,0);l+=Math.max(-ch,0);
  if(i===p){const rs=g/Math.max(l,1e-9);out.push(100-100/(1+rs));}
  else if(i>p){const ch2=c[i]-c[i-1];g=(g*(p-1)+Math.max(ch2,0))/p;l=(l*(p-1)+Math.max(-ch2,0))/p;const rs=g/Math.max(l,1e-9);out.push(100-100/(1+rs));}}
  while(out.length<c.length) out.unshift(50); return out;};
const macd=(c,fa=12,sl=26,sg=9)=>{const ef=ema(c,fa),es=ema(c,sl);const mac=ef.map((v,i)=>v-(es[i]??v));const sig=ema(mac,sg);const hist=mac.map((v,i)=>v-(sig[i]??0));return {mac,sig,hist};};
const stoch=(h,l,c,k=14,d=3)=>{let kk=[];for(let i=0;i<c.length;i++){const from=Math.max(0,i-k+1);const hh=Math.max(...h.slice(from,i+1));const ll=Math.min(...l.slice(from,i+1));const v=(hh===ll)?50:((c[i]-ll)/(hh-ll))*100;kk.push(v);}const dd=ema(kk,d);return {k:kk,d:dd};};
const boll=(c,p=20,s=2)=>{let ma=ema(c,p),up=[],dn=[];for(let i=0;i<c.length;i++){const from=Math.max(0,i-p+1);const seg=c.slice(from,i+1);const m=seg.reduce((a,b)=>a+b,0)/seg.length;const st=Math.sqrt(seg.reduce((a,b)=>a+(b-m)*(b-m),0)/seg.length);up.push(m+s*st);dn.push(m-s*st);}return {mid:ma,up,dn};};
const atr=(h,l,c,p=14)=>{let tr=[h[0]-l[0]];for(let i=1;i<c.length;i++){tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])));}return ema(tr,p);};

/* ===== CSV ===== */
async function loadCsvText(url){
  const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error('CSV HTTP '+r.status); return await r.text();
}
function parseCSV(txt){
  const rows=txt.trim().split(/\r?\n/).map(r=>r.split(',').map(x=>x.trim()));
  if(!rows.length) return [];
  const headIsTitle = /date/i.test(rows[0][1]||'') || /time/i.test(rows[0][2]||'');
  if(headIsTitle) rows.shift();
  const out=[];
  for(const r of rows){
    if(r.length>=7){ // Symbol,Date,Time,Open,High,Low,Close
      const ts=new Date(`${r[1]}T${r[2]}:00Z`).getTime(); out.push({t:ts,o:+r[3],h:+r[4],l:+r[5],c:+r[6]});
    }else if(r.length>=2){ // تاريخ,سعر
      const ts=new Date(r[0]).getTime(); const p=+r[1]; out.push({t:ts,o:p,h:p,l:p,c:p});
    }
  }
  out.sort((a,b)=>a.t-b.t);
  return out;
}

/* ===== Pivot نيويورك ===== */
function calcPivotNY(series){
  if(series.length<10) return null;
  const tz='America/New_York';
  const dayFmt=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});
  const prevDay = dayFmt.format(series.at(-2).t);
  const start = new Date(prevDay+'T00:00:00-05:00').getTime();
  const end   = start + 86400000;
  const seg = series.filter(b=>b.t>=start && b.t<end);
  if(!seg.length) return null;
  const H=Math.max(...seg.map(b=>b.h)), L=Math.min(...seg.map(b=>b.l)), C=seg.at(-1).c;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {p:P,r1:R1,r2:R2,r3:R3,s1:S1,s2:S2,s3:S3};
}

/* ===== دمج السعر الحي ===== */
function mergeLiveIntoSeries(series){
  if(!LAST_LIVE || !series.length) return series;
  const out=series.slice();
  const last=out.at(-1);
  const tfMs=ACTIVE_TF_MIN*60*1000, now=Date.now();
  const bucket=Math.floor(now/tfMs)*tfMs, lastBucket=Math.floor(last.t/tfMs)*tfMs;
  if(bucket===lastBucket){
    last.c=LAST_LIVE.price; last.h=Math.max(last.h,last.c); last.l=Math.min(last.l,last.c);
  }else{
    out.push({t:bucket,o:last.c,h:LAST_LIVE.price,l:LAST_LIVE.price,c:LAST_LIVE.price,live:true});
  }
  return out;
}

/* ===== الرسم ===== */
const ctx=$('chart').getContext('2d');
function clearChart(){ const c=$('chart'); ctx.clearRect(0,0,c.width,c.height); }
function drawCandles(data,{livePrice,bb,emaF,emaS}={}){
  const c=$('chart'), W=c.width, H=c.height; clearChart();
  if(!data.length) return;
  const pad=36, view=data.slice(-150);
  const xs=i=>pad+i*((W-2*pad)/Math.max(view.length-1,1));
  const hi=Math.max(...view.map(b=>b.h)), lo=Math.min(...view.map(b=>b.l));
  const ys=v=>pad+(H-2*pad)*(1-(v-lo)/Math.max(hi-lo,1e-9));

  // grid
  ctx.strokeStyle='#22314a'; ctx.lineWidth=1;
  for(let i=0;i<6;i++){const y=pad+i*((H-2*pad)/5);ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(W-pad,y);ctx.stroke();}

  // line (close)
  ctx.strokeStyle='#34d399'; ctx.lineWidth=2; ctx.beginPath();
  view.forEach((b,i)=>{const x=xs(i), y=ys(b.c); i?ctx.lineTo(x,y):ctx.moveTo(x,y)}); ctx.stroke();

  // EMA
  if(emaF){ ctx.strokeStyle='#4fc3f7'; ctx.beginPath(); emaF.slice(-view.length).forEach((v,i)=>{const x=xs(i),y=ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y)}); ctx.stroke(); }
  if(emaS){ ctx.strokeStyle='#a78bfa'; ctx.beginPath(); emaS.slice(-view.length).forEach((v,i)=>{const x=xs(i),y=ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y)}); ctx.stroke(); }

  // Bollinger
  if(bb){ ctx.setLineDash([4,4]); ctx.strokeStyle='#94a3b8';
    ctx.beginPath(); bb.up.slice(-view.length).forEach((v,i)=>{const x=xs(i),y=ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y)}); ctx.stroke();
    ctx.beginPath(); bb.dn.slice(-view.length).forEach((v,i)=>{const x=xs(i),y=ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y)}); ctx.stroke();
    ctx.setLineDash([]);
  }

  // live price dashed white
  if(Number.isFinite(livePrice)){
    ctx.setLineDash([8,6]); ctx.strokeStyle='#ffffff'; ctx.lineWidth=2;
    const y=ys(livePrice); ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-pad,y); ctx.stroke(); ctx.setLineDash([]);
    // label
    ctx.fillStyle='#0b1220'; ctx.strokeStyle='#67e8f9'; ctx.lineWidth=1.5;
    const txt='Live: '+nf2.format(livePrice); ctx.font='13px system-ui';
    const w=ctx.measureText(txt).width+16; const h=20;
    ctx.fillRect(pad+8,y-14,w,h); ctx.strokeRect(pad+8,y-14,w,h);
    ctx.fillStyle='#cfe8ff'; ctx.fillText(txt,pad+16,y+2);
  }
}

/* ===== عرض القيم ===== */
function paintIndicators(vals){
  $('indRSI').textContent   = nf2.format(vals.rsi.at(-1));
  $('indMACD').textContent  = nf4.format(vals.macd.mac.at(-1));
  $('indEMAF').textContent  = nf2.format(vals.emaF.at(-1));
  $('indEMAS').textContent  = nf2.format(vals.emaS.at(-1));
  $('indStoch').textContent = nf2.format(vals.stoch.k.at(-1));
  $('indBB').textContent    = nf2.format(vals.bb.up.at(-1))+' / '+nf2.format(vals.bb.dn.at(-1));
}
function paintSummary(s){
  elSummaryText.innerHTML = s.html;
  elAdviceText.innerHTML  = s.advice;
}
function paintTable(rows){
  elRowsBody.innerHTML='';
  rows.slice(-TABLE_ROWS).forEach((r,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${i+1}</td><td>${tfLocal.format(r.t)}</td><td>${r.side||'-'}</td>
      <td>${r.entry?nf2.format(r.entry):'-'}</td><td>${r.exit?nf2.format(r.exit):'-'}</td>
      <td class="r">${r.R??'-'}</td><td class="${(r.pnl||0)>=0?'good':'bad'}">${r.pnl?nf2.format(r.pnl):'-'}</td>`;
    elRowsBody.appendChild(tr);
  });
}

/* ===== توصية مختصرة ===== */
function buildAdvice({emaF,emaS,rsiV,macV,atrV,lastC,atrMin,atrMax}){
  let side='محايد', reason=[];
  if(emaF>emaS && rsiV>50 && macV>0) side='شراء';
  if(emaF<emaS && rsiV<50 && macV<0) side='بيع';
  if(elTogglePivotFilter.checked && PIVOT){
    if(side==='شراء' && lastC<=PIVOT.p) reason.push('تحت Pivot');
    if(side==='بيع'   && lastC>=PIVOT.p) reason.push('فوق Pivot');
  }
  const atrPct=(atrV/Math.max(lastC,1e-9))*100;
  if(atrPct<atrMin || atrPct>atrMax){ side='(مرفوض بالفلاتر)'; reason.push(`ATR% ${nf2.format(atrPct)} خارج النطاق`); }
  const text = side==='(مرفوض بالفلاتر)'? 'لا توجد إشارة (مرفوض بالفلاتر).' : `الملخص: <b>${side}</b>`;
  return {html: text+(reason.length?` • <span class="mini">${reason.join(' • ')}</span>`:''), advice:text, side};
}

/* ===== تشغيل التحليل ===== */
async function runAnalysis(){
  try{
    const csvURL=(elCsvInput.value.trim())||DEFAULT_5M_CSV;
    const txt=await loadCsvText(csvURL);
    SERIES=parseCSV(txt);

    PIVOT=calcPivotNY(SERIES)||null;
    if(PIVOT){
      elPivotP.textContent=nf2.format(PIVOT.p);
      elR1.textContent=nf2.format(PIVOT.r1); elR2.textContent=nf2.format(PIVOT.r2); elR3.textContent=nf2.format(PIVOT.r3);
      elS1.textContent=nf2.format(PIVOT.s1); elS2.textContent=nf2.format(PIVOT.s2); elS3.textContent=nf2.format(PIVOT.s3);
    }

    reprojectWithLive();
  }catch(e){
    alert('تعذّر تحميل/تحليل البيانات: '+e.message);
    console.error(e);
  }
}

/* ===== إعادة إسقاط بعد البث الحي ===== */
function reprojectWithLive(){
  if(!SERIES.length) return;

  const EMA_FAST=parseInt(elEmaFast.value||'12',10);
  const EMA_SLOW=parseInt(elEmaSlow.value||'26',10);
  const RSI_PER =parseInt(elRsiPeriod.value||'14',10);
  const ATR_P   =parseInt(elAtrPeriod.value||'14',10);
  const SLm =parseFloat(elSlMult.value||'1.5'), TP1m=parseFloat(elTp1Mult.value||'1.0'), TP2m=parseFloat(elTp2Mult.value||'2.0');
  const atrMin=parseFloat(elAtrMinPct.value||'0.05')*100, atrMax=parseFloat(elAtrMaxPct.value||'0.80')*100;
  const useSt = elUseStoch.checked, kPer=parseInt(elStochK.value||'14',10), dPer=parseInt(elStochD.value||'3',10);
  const useBB = elUseBB.checked, bbPer=parseInt(elBBPeriod.value||'20',10), bbStd=parseFloat(elBBStd.value||'2',10);

  const merged=mergeLiveIntoSeries(SERIES);
  const c=merged.map(b=>b.c), h=merged.map(b=>b.h), l=merged.map(b=>b.l);

  const emaF=ema(c,EMA_FAST), emaS=ema(c,EMA_SLOW);
  const rsiArr=rsi(c,RSI_PER);
  const mac =macd(c,EMA_FAST,EMA_SLOW,9);
  const st  =useSt?stoch(h,l,c,kPer,dPer):{k:c.map(()=>50),d:c.map(()=>50)};
  const bb  =useBB?boll(c,bbPer,bbStd):null;
  const atrArr=atr(h,l,c,ATR_P);
  const last=merged.at(-1), lastATR=atrArr.at(-1);

  const summ=buildAdvice({emaF:emaF.at(-1),emaS:emaS.at(-1),rsiV:rsiArr.at(-1),macV:mac.mac.at(-1),atrV:lastATR,lastC:last.c,atrMin,atrMax});
  paintSummary(summ);
  paintIndicators({emaF,emaS,macd:mac,stoch:st,bb:bb||{up:[],dn:[]},rsi:rsiArr});

  const SL = last.c - SLm*lastATR;
  const TP1= last.c + (summ.side==='شراء'?+TP1m:-TP1m)*lastATR;
  // رسم
  drawCandles(merged,{livePrice:LAST_LIVE?.price,bb,emaF,emaS});
  // جدول
  paintTable([{t:last.t,side:summ.side,entry:last.c,exit:TP1,R:((TP1-last.c)/Math.max(last.c-lastATR,1e-9)).toFixed(2),pnl:(TP1-last.c)}]);
}

/* ===== بث السعر الحي ===== */
async function refreshLive(){
  try{
    const r=await fetch(LIVE_JSON_URL,{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json();
    if(Number.isFinite(+j.price)){
      LAST_LIVE={price:+j.price,timeMs:Date.now()};
      elLivePrice.textContent=nf2.format(LAST_LIVE.price);
      elLiveTime.textContent=new Date(LAST_LIVE.timeMs).toLocaleTimeString();
      reprojectWithLive();
      // تنبيه قرب الدخول (اختياري): إذا قريب من آخر Entry
      const th = Math.max(0, parseFloat(elAlertDist.value||'0.5'));
      if(elAlertEnable.checked && SERIES.length){
        const last=SERIES.at(-1)?.c||LAST_LIVE.price;
        if(Math.abs(LAST_LIVE.price-last)<=th){
          try{ new Notification('تنبيه الدخول',{body:`Live ${nf2.format(LAST_LIVE.price)} قريب من نقطة الدخول`}); }catch(_){}
        }
      }
    }
  }catch(e){ console.warn('Live error:',e); }
}

/* ===== أحداث ===== */
function setActiveTF(min){ ACTIVE_TF_MIN=min; }
elBtnRun.addEventListener('click',runAnalysis);
elTf5.addEventListener('click', ()=>{setActiveTF(5);runAnalysis();});
elTf30.addEventListener('click',()=>{setActiveTF(30);runAnalysis();});
elTf60.addEventListener('click',()=>{setActiveTF(60);runAnalysis();});
elTfD.addEventListener('click', ()=>{setActiveTF(1440);runAnalysis();});

/* تخزين رابط CSV محلياً */
const LS_KEY='gs_csv_url';
if(elCsvInput){
  const saved=localStorage.getItem(LS_KEY)||'';
  if(!elCsvInput.value && saved) elCsvInput.value=saved;
  elCsvInput.addEventListener('input',()=>{const v=elCsvInput.value.trim(); if(v) localStorage.setItem(LS_KEY,v); else localStorage.removeItem(LS_KEY);});
}

/* ===== تشغيل أولي ===== */
setActiveTF(5);
runAnalysis();
refreshLive();
setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
