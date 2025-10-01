/* GoldSignals — نسخة Real-Time + Backtest منفصل */
const $ = s => document.querySelector(s);
const fmt = n => n==null?'—':Number(n).toLocaleString('en-US',{maximumFractionDigits:2});

// ====== وقت نيويورك (Pivot) ======
function toNY(d=new Date()){
  const fmtTZ = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const parts = fmtTZ.formatToParts(d).reduce((a,p)=>(a[p.type]=p.value,a),{});
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
}
function nyDayKey(d){ return toNY(d).toISOString().slice(0,10); }

// ====== CSV ======
async function fetchCsv(url){
  const res = await fetch(url,{cache:'no-store'});
  if(!res.ok) throw new Error('CSV fetch failed');
  const txt = await res.text();
  return parseCsv(txt);
}
function parseCsv(txt){
  const lines = txt.trim().split(/\r?\n/).filter(x=>x.trim());
  const head = lines[0].toLowerCase();
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const c = lines[i].split(',');
    if(head.includes('open') && c.length>=7){
      const date = c[1]?.trim(); const time = c[2]?.trim();
      const ts = new Date(`${date}T${(time||'00:00:00')}`).getTime();
      rows.push({t:ts,o:+c[3],h:+c[4],l:+c[5],c:+c[6]});
    }else if(c.length>=2){
      const ts = new Date(c[0].trim()).getTime();
      const price = +c[1];
      rows.push({t:ts,o:price,h:price,l:price,c:price});
    }
  }
  rows.sort((a,b)=>a.t-b.t);
  return rows;
}

// ====== مؤشرات ======
function ema(arr, len, src=k=>k.c){
  const out=[], k = 2/(len+1); let prev=null;
  for(let i=0;i<arr.length;i++){
    const v = src(arr[i]); prev = prev==null? v : v*k + prev*(1-k); out.push(prev);
  } return out;
}
function rsi(arr, len){
  let g=0,l=0,out=[];
  for(let i=1;i<arr.length;i++){
    const ch = arr[i].c-arr[i-1].c;
    g=(g*(len-1)+(ch>0?ch:0))/len; l=(l*(len-1)+(ch<0?-ch:0))/len;
    const rs = l===0?100:g/l; out.push(100 - (100/(1+rs)));
  } out.unshift(50); return out;
}
function macd(arr, fast=12, slow=26, signal=9){
  const emF = ema(arr,fast), emS = ema(arr,slow);
  const m = emF.map((v,i)=>v-emS[i]);
  const sig = ema(m.map(v=>({c:v})), signal, x=>x.c);
  const hist = m.map((v,i)=>v-(sig[i]||0));
  return {macd:m, signal:sig, hist};
}
function bb(arr, len=20, k=2){
  const mid=[],up=[],dn=[];
  for(let i=0;i<arr.length;i++){
    const from=Math.max(0,i-len+1), seg=arr.slice(from,i+1).map(x=>x.c);
    const mean=seg.reduce((a,b)=>a+b,0)/seg.length;
    const sd=Math.sqrt(seg.reduce((a,b)=>a+Math.pow(b-mean,2),0)/seg.length);
    mid.push(mean); up.push(mean+k*sd); dn.push(mean-k*sd);
  } return {mid,up,dn};
}
function stoch(arr, kLen=14, dLen=3){
  const kArr=[];
  for(let i=0;i<arr.length;i++){
    const from=Math.max(0,i-kLen+1), seg=arr.slice(from,i+1);
    const hh=Math.max(...seg.map(x=>x.h)), ll=Math.min(...seg.map(x=>x.l));
    kArr.push(hh===ll?50:((arr[i].c-ll)/(hh-ll))*100);
  }
  const dArr=ema(kArr.map(v=>({c:v})), dLen, x=>x.c);
  return {k:kArr,d:dArr};
}

// ====== Pivot نيويورك ======
function calcPivotNY(bars){
  const byDay = new Map();
  for(const b of bars){
    const key = nyDayKey(new Date(b.t));
    let d = byDay.get(key); if(!d) d={h:-1e9,l:1e9,o:null,c:null};
    d.h=Math.max(d.h,b.h); d.l=Math.min(d.l,b.l); d.c=b.c; if(d.o==null) d.o=b.o;
    byDay.set(key,d);
  }
  const keys=[...byDay.keys()].sort(); if(!keys.length) return null;
  const todayKey=nyDayKey(new Date());
  const lastKey=keys.filter(k=>k<todayKey).pop() || keys.pop();
  const d=byDay.get(lastKey);
  const P=(d.h+d.l+d.c)/3, R1=2*P-d.l, S1=2*P-d.h, R2=P+(d.h-d.l), S2=P-(d.h-d.l), R3=d.h+2*(P-d.l), S3=d.l-2*(d.h-P);
  return {P,R1,R2,R3,S1,S2,S3,day:lastKey};
}

// ====== الرسم ======
function drawCandles(ctx, bars, live=null){
  ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
  const W=ctx.canvas.width,H=ctx.canvas.height;
  if(!bars.length) return;
  const n=bars.length,pad=8,top=10,bot=10;
  const min=Math.min(...bars.map(x=>x.l)), max=Math.max(...bars.map(x=>x.h));
  const scale=v=>H-bot-(v-min)/(max-min)*(H-top-bot);
  const xAt=i=>pad+i*(W-2*pad)/Math.max(1,n-1);
  ctx.strokeStyle='#1f2937'; ctx.lineWidth=1;
  for(let g=0;g<4;g++){ const y=top+g*(H-top-bot)/3; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  const w=Math.max(2,(W-2*pad)/n*0.6);
  for(let i=0;i<n;i++){
    const b=bars[i], x=xAt(i);
    ctx.strokeStyle=(b.c>=b.o)?'#22c55e':'#ef4444';
    ctx.beginPath(); ctx.moveTo(x,scale(b.h)); ctx.lineTo(x,scale(b.l)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-w/2,scale(b.o)); ctx.lineTo(x-w/2,scale(b.c)); ctx.lineTo(x+w/2,scale(b.c)); ctx.lineTo(x+w/2,scale(b.o)); ctx.closePath(); ctx.stroke();
  }
  if(live!=null){
    ctx.setLineDash([6,6]); ctx.strokeStyle='#ffffff'; ctx.lineWidth=2;
    const y=scale(live); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#0b1220'; ctx.strokeStyle='#ffffff'; ctx.font='12px system-ui';
    const txt=`Live: ${fmt(live)}`, tw=ctx.measureText(txt).width+10;
    ctx.beginPath(); ctx.roundRect(8,y-16,tw,20,6); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#ffffff'; ctx.fillText(txt,13,y-2);
  }
}

// ====== السعر الحي (مكان لتوصيل مزوّدك) ======
async function fetchLivePrice(){
  try{
    // بدّل هذا لاحقًا بمصدر WebSocket/HTTP موثوق عندك
    return null; // إذا null منرسم آخر إغلاق
  }catch(e){ return null; }
}

// ====== نصيحة ======
function makeAdvice(bars, st){
  if(bars.length<3) return {text:'لا توجد بيانات كافية', side:null};
  const fast=ema(bars,st.emaFast), slow=ema(bars,st.emaSlow), myRsi=rsi(bars,st.rsiLen);
  const i=bars.length-1;
  const up = fast[i]>slow[i] && myRsi[i]>=50;
  const dn = fast[i]<slow[i] && myRsi[i]<=50;

  let pvOk=true;
  if(st.pivot){
    const pv=calcPivotNY(bars);
    if(pv){
      if(up && bars[i].c<pv.P) pvOk=false;
      if(dn && bars[i].c>pv.P) pvOk=false;
    }
  }
  if(!pvOk) return {text:'لا توجد إشارة (فلتر Pivot)', side:null};
  if(up) return {text:'شراء (مبدئي)', side:'buy'};
  if(dn) return {text:'بيع (مبدئي)', side:'sell'};
  return {text:'لا توجد إشارة حالياً', side:null};
}

// ====== تشغيل التحليل الحي ======
async function runAnalysis(){
  try{
    $('#runBtn').disabled=true;
    const url=($('#csvUrl').value||'').trim() || 'XAUUSD_5min.csv';
    const tf=+$('#tf').value;
    const st={
      emaFast:+$('#emaFast').value, emaSlow:+$('#emaSlow').value,
      rsiLen:+$('#rsiLen').value, macdSig:+$('#macdSig').value,
      bbLen:+$('#bbLen').value, bbK:+$('#bbK').value,
      stochK:+$('#stochK').value, stochD:+$('#stochD').value,
      pivot:true
    };

    let bars=await fetchCsv(url);
    if(tf!==5) bars=compressTF(bars,tf);

    const EMF=ema(bars,st.emaFast), EMS=ema(bars,st.emaSlow);
    const RSI=rsi(bars,st.rsiLen);
    const MAC=macd(bars,st.emaFast,st.emaSlow,st.macdSig);
    const BB =bb(bars,st.bbLen,st.bbK);

    const pv=calcPivotNY(bars);
    if(pv){
      $('#pivotBox').textContent=fmt(pv.P);
      $('#levels').innerHTML=
        `<span class="pill">R1: ${fmt(pv.R1)}</span>
         <span class="pill">R2: ${fmt(pv.R2)}</span>
         <span class="pill">R3: ${fmt(pv.R3)}</span>
         <span class="pill">S1: ${fmt(pv.S1)}</span>
         <span class="pill">S2: ${fmt(pv.S2)}</span>
         <span class="pill">S3: ${fmt(pv.S3)}</span>`;
    }else{$('#pivotBox').textContent='—'; $('#levels').textContent='';}

    const live=await fetchLivePrice();
    $('#livePrice').textContent=fmt(live ?? bars.at(-1).c);

    const ctx=$('#chart').getContext('2d');
    drawCandles(ctx,bars,(live??null));

    const adv=makeAdvice(bars,st);
    $('#summary').textContent=adv.text;

    $('#indTable').innerHTML =
      `<div class="pill">RSI: ${fmt(RSI.at(-1))}</div>
       <div class="pill">MACD: ${fmt(MAC.macd.at(-1))}</div>
       <div class="pill">إشارة MACD: ${fmt(MAC.signal.at(-1))}</div>
       <div class="pill">EMA سريع: ${fmt(EMF.at(-1))}</div>
       <div class="pill">EMA بطيء: ${fmt(EMS.at(-1))}</div>
       <div class="pill">BB mid: ${fmt(BB.mid.at(-1))}</div>`;

    setupProximityAlert(live ?? bars.at(-1).c, adv.side);

  }catch(e){
    alert('تعذّر تحميل/تحليل البيانات:\n'+e.message);
    console.error(e);
  }finally{
    $('#runBtn').disabled=false;
  }
}

// ضغط الإطار
function compressTF(bars, tfMin){
  const out=[], step=tfMin/5;
  for(let i=0;i<bars.length;i+=step){
    const seg=bars.slice(i,i+step); if(!seg.length) continue;
    out.push({t:seg[0].t,o:seg[0].o,h:Math.max(...seg.map(x=>x.h)),l:Math.min(...seg.map(x=>x.l)),c:seg.at(-1).c});
  } return out;
}

// تنبيه قرب الدخول (تبسيط)
let lastNotifyTs=0;
function setupProximityAlert(price, side){
  const dist=Math.max(0,+$('#nearDist').value||0);
  if(!side||!price||dist===0) return;
  const now=Date.now(); if(now-lastNotifyTs<60_000) return;
  lastNotifyTs=now;
}

// ====== Backtest منفصل ======
$('#btRun').addEventListener('click', async ()=>{
  try{
    const f=$('#btFile').files[0]; if(!f){ alert('حمّل ملف CSV أولاً'); return; }
    const tf=+$('#btTf').value;
    let bars=parseCsv(await f.text()); if(tf!==5) bars=compressTF(bars,tf);

    const st={ emaFast:+$('#emaFast').value, emaSlow:+$('#emaSlow').value, rsiLen:+$('#rsiLen').value };

    const deals=[]; let eq=0;
    for(let i=50;i<bars.length-1;i++){
      const adv=makeAdvice(bars.slice(0,i+1),{...st,pivot:false});
      if(!adv.side) continue;
      const entry=bars[i].c, exit=bars[i+1].c, side=adv.side;
      const R=side==='buy'?(exit-entry):(entry-exit); const pnl=R; eq+=pnl;
      deals.push({i,ts:bars[i].t,side,entry,exit,R,pnl,eq});
    }
    const wins=deals.filter(d=>d.R>0).length, losses=deals.length-wins, winp=deals.length?(wins*100/deals.length):0;
    const pos=deals.filter(d=>d.R>0).reduce((a,b)=>a+b.R,0), neg=Math.abs(deals.filter(d=>d.R<=0).reduce((a,b)=>a+b.R,0));
    const pf=neg?pos/neg:pos?9999:0, maxDD=maxDrawdown(deals.map(d=>d.eq));

    $('#btStats').textContent=`الصفقات: ${deals.length} • Win%: ${winp.toFixed(2)} • PF: ${pf.toFixed(2)} • MaxDD$: ${maxDD.toFixed(2)} • PnL$: ${eq.toFixed(2)}`;

    const tb=$('#btTable tbody'); tb.innerHTML='';
    deals.forEach((d,ix)=>{
      const tr=document.createElement('tr'); const dt=new Date(d.ts).toLocaleString();
      tr.innerHTML=`<td>${ix+1}</td><td>${dt}</td><td>${d.side.toUpperCase()}</td><td>${fmt(d.entry)}</td><td>${fmt(d.exit)}</td><td>${d.R.toFixed(2)}</td><td>${d.pnl.toFixed(2)}</td>`;
      tb.appendChild(tr);
    });

    const ctx=$('#btEq').getContext('2d'); ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
    const W=ctx.canvas.width,H=ctx.canvas.height,pad=10, ys=deals.map(d=>d.eq);
    if(ys.length){
      const mn=Math.min(...ys), mx=Math.max(...ys), y=v=>H-pad-(v-mn)/(mx-mn||1)*(H-2*pad);
      ctx.strokeStyle='#22d3ee'; ctx.lineWidth=2; ctx.beginPath();
      ys.forEach((v,i)=>{ const xx=pad+i*(W-2*pad)/Math.max(1,ys.length-1), yy=y(v); if(i===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy); });
      ctx.stroke();
    }
  }catch(e){ alert('فشل الاختبار: '+e.message); console.error(e); }
});
function maxDrawdown(arr){ let peak=-1e9,mdd=0; for(const v of arr){ peak=Math.max(peak,v); mdd=Math.max(mdd,peak-v);} return mdd; }

// ====== واجهة ======
$('#runBtn').addEventListener('click', runAnalysis);
setInterval(()=>{ $('#clock').textContent=new Date().toLocaleTimeString('ar-EG',{hour12:false}); },1000);
runAnalysis();
