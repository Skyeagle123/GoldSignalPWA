/* ======================= GoldSignals • app.js (PRO+) ======================= */
/* دمج السعر الحي في الواجهة فقط (لا يغيّر CSV) + رسم شموع + Bollinger + Stochastic + تنبيهات + Pivot (NY) */

/* --------- إعداد عام --------- */
const LIVE_JSON_URL = 'https://goldprice-proxy.samer-mourtada.workers.dev/price'; // مصدر السعر الحي
const DEFAULT_5M_CSV = 'XAUUSD_5min.csv';
const LIVE_REFRESH_SEC = 1;
const TABLE_ROWS = 80;

const $ = (id)=>document.getElementById(id);

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

/* Backtest (واجهة فقط – يقرأ ملف مستخدم محلي عند الحاجة) */
const elBtCsv=$('btCsv'), elBtTf=$('btTf'), elBtStrict=$('btStrict'), elBtWalk=$('btWalk');
const elBtRun=$('btRun'), elBtStats=$('btStats'), elBtRows=$('btRows'), elBtEquity=$('btEquity');
const elBtDailyRiskCap=$('btDailyRiskCap');

/* تنسيقات */
const nf2=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const nf4=new Intl.NumberFormat('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
const dtfNY=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const tfLocal=new Intl.DateTimeFormat(undefined,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});

/* حالة عامة */
let ACTIVE_TF_MIN=5; // 5/30/60/1440
let SERIES=[];       // بيانات الشموع [{t, o,h,l,c, v?}]
let LAST_LIVE=null;  // {price, timeMs}
let PIVOT=null;      // {p,r1,r2,r3,s1,s2,s3}

/* أدوات رياضية */
const ema=(arr,period)=>{ const k=2/(period+1); let out=[], emaPrev=arr[0]; for(let i=0;i<arr.length;i++){ emaPrev = i? (arr[i]*k + emaPrev*(1-k)) : arr[i]; out.push(emaPrev);} return out; };
const rsi=(closes,period=14)=>{ let gains=0,losses=0,out=[]; for(let i=1;i<closes.length;i++){ const ch=closes[i]-closes[i-1]; gains+=Math.max(ch,0); losses+=Math.max(-ch,0); if(i===period){ let rs=gains/Math.max(losses,1e-9); out.push(100-100/(1+rs)); } else if(i>period){ const ch2=closes[i]-closes[i-1]; gains=(gains*(period-1)+Math.max(ch2,0))/period; losses=(losses*(period-1)+Math.max(-ch2,0))/period; let rs=gains/Math.max(losses,1e-9); out.push(100-100/(1+rs)); } }
  while(out.length<closes.length) out.unshift(50); return out; };
const macd=(closes,fast=12,slow=26,signal=9)=>{ const efast=ema(closes,fast), eslow=ema(closes,slow); const mac=efast.map((v,i)=>v-(eslow[i]||v)); const sig=ema(mac,signal); const hist=mac.map((v,i)=>v-(sig[i]||0)); return {mac,sig,hist}; };
const stoch=(h,l,c,k=14,d=3)=>{ let kArr=[]; for(let i=0;i<c.length;i++){ const from=Math.max(0,i-k+1); const hh=Math.max(...h.slice(from,i+1)); const ll=Math.min(...l.slice(from,i+1)); const val = (hh===ll)?50: ((c[i]-ll)/(hh-ll))*100; kArr.push(val); } const dArr=ema(kArr,d); return {k:kArr,d:dArr}; };
const boll=(closes,period=20,std=2)=>{ let ma=ema(closes,period), up=[], dn=[]; for(let i=0;i<closes.length;i++){ const from=Math.max(0,i-period+1); const slice=closes.slice(from,i+1); const m = slice.reduce((a,b)=>a+b,0)/slice.length; const s = Math.sqrt(slice.reduce((a,b)=>a+(b-m)*(b-m),0)/slice.length); up.push(m+std*s); dn.push(m-std*s); } return {mid:ma,up,dn}; };
const atr=(h,l,c,period=14)=>{ let tr=[h[0]-l[0]]; for(let i=1;i<c.length;i++){ tr.push(Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1]))); } return ema(tr,period); };

/* قراءة CSV (من الريبو أو من الرابط في الحقل) */
async function loadCsvText(url){
  const res = await fetch(url,{cache:'no-store'});
  if(!res.ok) throw new Error('CSV HTTP '+res.status);
  return await res.text();
}
function parseCSV(txt){
  // يدعم: Symbol,Date,Time,Open,High,Low,Close  أو  تاريخ/سعر
  const rows = txt.trim().split(/\r?\n/).map(r=>r.split(',').map(x=>x.trim()));
  let out=[];
  if(rows[0].length>=7 && /date/i.test(rows[0][1])){ // مع عناوين
    const head=rows.shift();
  }
  for(const r of rows){
    if(r.length>=7){
      const [sym, d, t, o,h,l,c] = r;
      const ts = new Date(`${d}T${t}:00Z`).getTime();
      out.push({t:ts, o:+o, h:+h, l:+l, c:+c});
    }else if(r.length>=2){
      const [d,price]=r;
      const ts = new Date(d).getTime();
      const p=+price;
      out.push({t:ts, o:p,h:p,l:p,c:p});
    }
  }
  out.sort((a,b)=>a.t-b.t);
  return out;
}

/* حساب Pivot نيويورك من آخر يوم مكتمل */
function calcPivotNY(series){
  if(!series.length) return null;
  // قصّ آخر يوم نيويورك مكتمل
  const tz='America/New_York';
  const fmtDay=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});
  const day=fmtDay.format(series.at(-2)?.t || series.at(-1).t); // اليوم السابق (مكتمل)
  const dayStart = new Date(day+'T00:00:00-05:00').getTime(); // يكفي للتجميع
  const dayEnd   = dayStart + 86400000;
  const seg = series.filter(b=>b.t>=dayStart && b.t<dayEnd);
  if(!seg.length) return null;
  const H=Math.max(...seg.map(b=>b.h)), L=Math.min(...seg.map(b=>b.l)), C=seg.at(-1).c;
  const P=(H+L+C)/3, R1=2*P-L, S1=2*P-H, R2=P+(H-L), S2=P-(H-L), R3=H+2*(P-L), S3=L-2*(H-P);
  return {p:P,r1:R1,r2:R2,r3:R3,s1:S1,s2:S2,s3:S3};
}

/* دمج السعر الحي مع آخر شمعة (بدون تعديل CSV) */
function mergeLiveIntoSeries(series){
  if(!LAST_LIVE) return series;
  if(!series.length) return series;
  const out=series.slice();
  const last=out.at(-1);
  const now=Date.now();
  const tfMs = ACTIVE_TF_MIN*60*1000;
  const bucket = Math.floor(now/tfMs)*tfMs;
  if(bucket===Math.floor(last.t/tfMs)*tfMs){
    // نفس الشمعة الحالية: عدّل Close/High/Low فقط افتراضياً
    last.c=LAST_LIVE.price;
    last.h=Math.max(last.h,last.c);
    last.l=Math.min(last.l,last.c);
  }else{
    // شمعة جديدة وقتياً للعرض
    out.push({t:bucket,o:last.c,h:LAST_LIVE.price,l:LAST_LIVE.price,c:LAST_LIVE.price, live:true});
  }
  return out;
}

/* رسم الشموع والمؤشرات */
const ctx = $('chart').getContext('2d');
function clearChart(){ const c=$('chart'); ctx.clearRect(0,0,c.width,c.height); }
function drawCandles(data,{livePrice,bb,emaF,emaS}={}){
  const c=$('chart'); const W=c.width, H=c.height; clearChart();
  if(!data.length) return;

  const pad=36, n=data.length, view=data.slice(-150);
  const xs=(i)=> pad + i*( (W-2*pad)/(view.length-1) );
  const hi=Math.max(...view.map(b=>b.h)), lo=Math.min(...view.map(b=>b.l));
  const ys=(v)=> pad + (H-2*pad)*(1 - (v-lo)/(hi-lo));

  // grid
  ctx.strokeStyle='#22314a'; ctx.lineWidth=1;
  for(let i=0;i<6;i++){ const y=pad+i*( (H-2*pad)/5 ); ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-pad,y); ctx.stroke(); }

  // candles (line-style مبسّط، سريع على الموبايل)
  ctx.strokeStyle='#34d399'; ctx.lineWidth=2; ctx.beginPath();
  view.forEach((b,i)=>{ const x=xs(i), y=ys(b.c); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.stroke();

  // EMA fast/slow
  if(emaF){ ctx.strokeStyle='#4fc3f7'; ctx.beginPath(); emaF.slice(-view.length).forEach((v,i)=>{ const x=xs(i), y=ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.stroke(); }
  if(emaS){ ctx.strokeStyle='#a78bfa'; ctx.beginPath(); emaS.slice(-view.length).forEach((v,i)=>{ const x=xs(i), y=ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.stroke(); }

  // Bollinger
  if(bb){ ctx.strokeStyle='#94a3b8'; ctx.setLineDash([4,4]);
    ctx.beginPath(); bb.up.slice(-view.length).forEach((v,i)=>{ const x=xs(i), y=ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.stroke();
    ctx.beginPath(); bb.dn.slice(-view.length).forEach((v,i)=>{ const x=xs(i), y=ys(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.stroke();
    ctx.setLineDash([]);
  }

  // live dashed white
  if(Number.isFinite(livePrice)){
    ctx.setLineDash([8,6]); ctx.strokeStyle='#ffffff'; ctx.lineWidth=2;
    const y=ys(livePrice); ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-pad,y); ctx.stroke(); ctx.setLineDash([]);
    // label
    ctx.fillStyle='#0b1220'; ctx.strokeStyle='#67e8f9'; ctx.lineWidth=1.5;
    const txt='Live: '+nf2.format(livePrice); const w=ctx.measureText(txt).width+16; const h=20;
    ctx.fillRect(pad+8,y-14,w,h); ctx.strokeRect(pad+8,y-14,w,h);
    ctx.fillStyle='#cfe8ff'; ctx.font='13px system-ui'; ctx.fillText(txt,pad+16,y+2);
  }
}

/* رسم المؤشرات/الملخص/الجدول */
function paintIndicators(vals){
  if(elIndRSI)   elIndRSI.textContent = nf2.format(vals.rsi.at(-1));
  if(elIndMACD)  elIndMACD.textContent= nf4.format(vals.macd.mac.at(-1));
  if(elIndEMAF)  elIndEMAF.textContent= nf2.format(vals.emaF.at(-1));
  if(elIndEMAS)  elIndEMAS.textContent= nf2.format(vals.emaS.at(-1));
  if(elIndStoch) elIndStoch.textContent= nf2.format(vals.stoch.k.at(-1));
  if(elIndBB)    elIndBB.textContent   = nf2.format(vals.bb.up.at(-1))+' / '+nf2.format(vals.bb.dn.at(-1));
}
function paintSummary(s){
  if(!elSummaryText) return;
  elSummaryText.innerHTML = s.html;
  if(elAdviceText) elAdviceText.innerHTML = s.advice;
}
function paintTable(rows){
  if(!elRowsBody) return;
  elRowsBody.innerHTML='';
  rows.slice(-TABLE_ROWS).forEach((r,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${i+1}</td><td>${tfLocal.format(r.t)}</td><td>${r.side||'-'}</td>
      <td>${r.entry?nf2.format(r.entry):'-'}</td><td>${r.exit?nf2.format(r.exit):'-'}</td>
      <td class="r">${r.R??'-'}</td><td class="${(r.pnl||0)>=0?'good':'bad'}">${r.pnl?nf2.format(r.pnl):'-'}</td>`;
    elRowsBody.appendChild(tr);
  });
}

/* توصية بسيطة (نفس المنطق المستعمل سابقاً) */
function buildAdvice({emaF,emaS,rsiV,macV,stochK,atrV,lastC,atrMin,atrMax}){
  let side='محايد', reason=[];
  if(emaF>emaS && rsiV>50 && macV>0) { side='شراء'; }
  if(emaF<emaS && rsiV<50 && macV<0) { side='بيع'; }
  if(elTogglePivotFilter?.checked && PIVOT){
    if(side==='شراء' && lastC>PIVOT.p) reason.push('فوق Pivot');
    if(side==='بيع'   && lastC<PIVOT.p) reason.push('تحت Pivot');
  }
  const atrPct = (atrV/Math.max(lastC,1e-9))*100;
  if(atrPct<atrMin || atrPct>atrMax){ side='(مرفوض بالفلاتر)'; reason.push(`ATR% ${nf2.format(atrPct)} خارج النطاق`); }
  const text = side==='(مرفوض بالفلاتر)'? 'لا توجد إشارة (مرفوض بالفلاتر).' : `الملخص: <b>${side}</b>`;
  const html = text+ (reason.length? ` • <span class="muted">${reason.join(' • ')}</span>`:'');
  const advice = `الإطار: ${ACTIVE_TF_MIN===1440?'يوم':ACTIVE_TF_MIN+' دقائق'} • ${text}`;
  return {html, advice, side};
}

/* تشغيل التحليل */
async function runAnalysis(){
  try{
    const csvURL = (elCsvInput?.value?.trim()) || DEFAULT_5M_CSV;
    const txt = await loadCsvText(csvURL);
    SERIES = parseCSV(txt);

    // Pivot نيويورك
    PIVOT = calcPivotNY(SERIES)||null;
    if(PIVOT){
      elPivotP.textContent = nf2.format(PIVOT.p);
      elR1.textContent=nf2.format(PIVOT.r1); elR2.textContent=nf2.format(PIVOT.r2); elR3.textContent=nf2.format(PIVOT.r3);
      elS1.textContent=nf2.format(PIVOT.s1); elS2.textContent=nf2.format(PIVOT.s2); elS3.textContent=nf2.format(PIVOT.s3);
    }

    reprojectWithLive();
  }catch(e){
    alert('تعذّر تحميل/تحليل البيانات: '+e.message);
    console.error(e);
  }
}

/* إعادة الإسقاط والرسم بعد دمج السعر الحي */
function reprojectWithLive(){
  if(!SERIES.length) return;

  // إعدادات المستخدم
  const EMA_FAST = parseInt(elEmaFast?.value||'12',10);
  const EMA_SLOW = parseInt(elEmaSlow?.value||'26',10);
  const RSI_PER  = parseInt(elRsiPeriod?.value||'14',10);
  const ATR_P    = parseInt(elAtrPeriod?.value||'14',10);
  const SLm = parseFloat(elSlMult?.value||'1.5'), TP1m=parseFloat(elTp1Mult?.value||'1.0'), TP2m=parseFloat(elTp2Mult?.value||'2.0');
  const atrMin=parseFloat(elAtrMinPct?.value||'0.05')*100, atrMax=parseFloat(elAtrMaxPct?.value||'0.80')*100;
  const useSt=!!elUseStoch?.checked, kPer=parseInt(elStochK?.value||'14',10), dPer=parseInt(elStochD?.value||'3',10);
  const useBB=!!elUseBB?.checked, bbPer=parseInt(elBBPeriod?.value||'20',10), bbStd=parseFloat(elBBStd?.value||'2',10);

  // دمج السعر الحي
  const merged = mergeLiveIntoSeries(SERIES);

  // مؤشرات
  const closes=merged.map(b=>b.c), highs=merged.map(b=>b.h), lows=merged.map(b=>b.l);
  const emaF = ema(closes,EMA_FAST), emaS = ema(closes,EMA_SLOW);
  const rsiArr=rsi(closes,RSI_PER);
  const mac = macd(closes,EMA_FAST,EMA_SLOW,9);
  const st  = useSt? stoch(highs,lows,closes,kPer,dPer) : {k:closes.map(()=>50), d:closes.map(()=>50)};
  const bb  = useBB? boll(closes,bbPer,bbStd) : null;
  const atrArr = atr(highs,lows,closes,ATR_P);
  const last = merged.at(-1), lastATR = atrArr.at(-1);

  // توصية وملخص
  const summ = buildAdvice({
    emaF:emaF.at(-1), emaS:emaS.at(-1),
    rsiV:rsiArr.at(-1), macV:mac.mac.at(-1),
    stochK:st.k.at(-1), atrV:lastATR, lastC:last.c,
    atrMin, atrMax
  });
  paintSummary(summ);
  paintIndicators({emaF,emaS,macd:mac,stoch:st,bb:bb||{up:[],dn:[]},rsi:rsiArr});

  // SL/TP افتراضية (عرض فقط)
  const SL = last.c - SLm*lastATR;
  const TP1 = last.c + (summ.side==='شراء'? +TP1m : -TP1m)*lastATR;
  const TP2 = last.c + (summ.side==='شراء'? +TP2m : -TP2m)*lastATR;

  // رسم
  drawCandles(merged,{livePrice:LAST_LIVE?.price,bb,emaF,emaS});

  // تنبيه اقتراب الدخول
  checkAlertProximity(summ, last.c);

  // جدول مبسّط (آخر صفّ واحد للعرض)
  paintTable([{t:last.t, side:summ.side, entry:last.c, exit:TP1, R:((TP1-last.c)/Math.max(last.c-lastATR,1e-9)).toFixed(2), pnl: (TP1-last.c)}]);
}

/* تفعيل/تغيير الإطار */
function setActiveTF(min){ ACTIVE_TF_MIN=min; }

/* السعر الحي */
async function refreshLive(){
  try{
    const r = await fetch(LIVE_JSON_URL,{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    if(j && (j.ok===undefined || j.ok===true) && Number.isFinite(j.price)){
      const t=Date.now();
      LAST_LIVE={price:+j.price, timeMs:t};
      // واجهة
      if(elLivePrice){
        elLivePrice.textContent = nf2.format(LAST_LIVE.price);
        elLivePrice.style.transition='color .15s';
        elLivePrice.style.color='#67e8f9';
        setTimeout(()=>{ elLivePrice.style.color='#ffffff'; }, 400);
      }
      if(elLiveTime) elLiveTime.textContent = new Date(t).toLocaleTimeString();
      // إعادة الإسقاط
      reprojectWithLive();
    }
  }catch(e){ console.warn('Live error:',e); }
}

/* تنبيه اقتراب الدخول */
function checkAlertProximity(summary, entry){
  if(!elAlertEnable?.checked || !Number.isFinite(entry) || !LAST_LIVE) return;
  const dist = Math.abs(LAST_LIVE.price - entry);
  const th = Math.max(0, parseFloat(elAlertDist.value||'0.5'));
  if(dist<=th){
    try{
      new Notification('تنبيه الدخول',{body:`Live ${nf2.format(LAST_LIVE.price)} قريب من Entry (${nf2.format(entry)})`});
    }catch(_){ /* تجاهل على الموبايل */ }
    // رنّ صوت خفيف
    const a=new AudioContext(); const o=a.createOscillator(); const g=a.createGain();
    o.connect(g).connect(a.destination); o.frequency.value=880; o.start(); g.gain.setValueAtTime(.15,a.currentTime); o.stop(a.currentTime+.1);
  }
}

/* أحداث */
elBtnRun?.addEventListener('click', runAnalysis);
elTf5?.addEventListener('click',  ()=>{ setActiveTF(5);    runAnalysis(); });
elTf30?.addEventListener('click', ()=>{ setActiveTF(30);   runAnalysis(); });
elTf60?.addEventListener('click', ()=>{ setActiveTF(60);   runAnalysis(); });
elTfD?.addEventListener('click',  ()=>{ setActiveTF(1440); runAnalysis(); });

/* حفظ رابط CSV محلياً */
const LS_KEY='gs_csv_url';
if(elCsvInput){
  const saved=localStorage.getItem(LS_KEY)||'';
  if(!elCsvInput.value && saved) elCsvInput.value=saved;
  elCsvInput.addEventListener('input',()=>{
    const v=elCsvInput.value.trim();
    if(v) localStorage.setItem(LS_KEY,v); else localStorage.removeItem(LS_KEY);
  });
}

/* تشغيل أولي */
setActiveTF(5);
runAnalysis();
refreshLive();
setInterval(refreshLive, LIVE_REFRESH_SEC*1000);
