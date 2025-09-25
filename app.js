/***************** إعداد الروابط (يمكنك تعديلها لاحقاً) *****************/
// رابط مباشر لـ CSV
const DAILY_CSV_URL  = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_live.csv';
const HOURLY_CSV_URL = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_hourly.csv';
const MINUTE_CSV_URL = 'https://skyeagle123.github.io/GoldSignalPWA/XAUUSD_5min.csv';

/***************** عناصر DOM *****************/
function pick(...sels){ for (const s of sels){ const el = document.querySelector(s); if (el) return el; } return null; }

const els = {
  csvUrl: document.getElementById('csvUrl'),
  sourceSel: document.getElementById('sourceSel'),
  runBtn: document.getElementById('runBtn'),

  // جدول البيانات الأخيرة
  tableHead: document.getElementById('tableHead'),
  tableBody: document.getElementById('tableBody'),

  // إشارات الملخص
  signalBadge: document.getElementById('signalBadge'),
  signalNote: document.getElementById('signalNote'),
  livePriceLine: document.getElementById('livePriceLine'),

  // التبويبات
  tabMin: document.getElementById('tabMin'),
  tabHour: document.getElementById('tabHour'),
  tabDay: document.getElementById('tabDay'),

  // إعدادات المؤشرات
  emaFast: document.getElementById('emaFast'),
  emaSlow: document.getElementById('emaSlow'),
  rsiPeriod: document.getElementById('rsiPeriod'),

  // Pivot
  pivotBox: document.getElementById('pivotBox'),

  // جدول المؤشرات
  indHead: document.getElementById('indHead')  || pick('#indicators thead','#indicatorsHead'),
  indBody: document.getElementById('indBody')  || pick('#indicators tbody','#indicatorsBody'),
};

/***************** دوال مساعدة *****************/
function fmtNum(v){ return (v==null || isNaN(v)) ? '-' : Number(v).toFixed(2); }
function sigColor(sig){ return sig==='شراء'?'good':sig==='بيع'?'bad':'warn'; }

/***************** حساب المؤشرات *****************/
function EMA(arr, period){
  let k = 2/(period+1), emaArr=[], prev;
  for (let i=0;i<arr.length;i++){
    const v = arr[i];
    if (i===0){ prev=v; emaArr.push(v); }
    else { prev = v*k + prev*(1-k); emaArr.push(prev); }
  }
  return emaArr;
}

function RSI(values, period=14){
  let rsi=[], gains=0, losses=0;
  for (let i=1;i<values.length;i++){
    const diff = values[i]-values[i-1];
    if (i<=period){ if (diff>0) gains+=diff; else losses-=diff; }
    if (i===period){
      let rs=gains/Math.max(1,losses);
      rsi.push(100-100/(1+rs));
    } else if (i>period){
      let avgGain=(gains+(diff>0?diff:0))/period;
      let avgLoss=(losses+(diff<0?-diff:0))/period;
      let rs=avgGain/Math.max(1e-6,avgLoss);
      rsi.push(100-100/(1+rs));
      gains=avgGain*period; losses=avgLoss*period;
    }
  }
  return Array(values.length-rsi.length).fill(null).concat(rsi);
}

function MACD(values, fast=12, slow=26, signal=9){
  const emaF=EMA(values,fast);
  const emaS=EMA(values,slow);
  const macd=emaF.map((v,i)=>v-emaS[i]);
  const signalLine=EMA(macd.slice(slow),signal);
  const paddedSig=Array(slow).fill(null).concat(signalLine);
  const hist=macd.map((v,i)=> (paddedSig[i]!=null ? v-paddedSig[i]:null));
  return {macd, signal:paddedSig, hist};
}

/***************** إشارات المؤشرات *****************/
function signalRSI(v){ if (!Number.isFinite(v)) return 'حيادي'; if (v>70) return 'بيع'; if (v<30) return 'شراء'; return 'حيادي'; }
function signalMACDHist(h){ if (!Number.isFinite(h)) return 'حيادي'; if (h>0) return 'شراء'; if (h<0) return 'بيع'; return 'حيادي'; }
function signalEMA(emaF,emaS){ if (![emaF,emaS].every(Number.isFinite)) return 'حيادي'; if (emaF>emaS) return 'شراء'; if (emaF<emaS) return 'بيع'; return 'حيادي'; }

/***************** تعبئة جدول المؤشرات *****************/
function renderIndicatorsTable(series, opts){
  if (!els.indHead || !els.indBody) return;
  const closes=series?.map(s=>s.price)||[];
  if (closes.length<3){ els.indHead.innerHTML=''; els.indBody.innerHTML=''; return; }

  const emaFarr=EMA(closes,opts.emaFast);
  const emaSarr=EMA(closes,opts.emaSlow);
  const rsiArr=RSI(closes,opts.rsiPeriod);
  const macdH=MACD(closes).hist;

  const emaF=emaFarr.at(-1);
  const emaS=emaSarr.at(-1);
  const rsi=rsiArr.at(-1);
  const hist=macdH.at(-1);

  els.indHead.innerHTML='<tr><th>المؤشر</th><th>القيمة</th><th>الإشارة</th></tr>';

  const rows=[
    {name:'RSI',value:rsi,sig:signalRSI(rsi)},
    {name:'MACD (هيستوجرام)',value:hist,sig:signalMACDHist(hist)},
    {name:`EMA (${opts.emaFast}/${opts.emaSlow})`,value:emaF-emaS,sig:signalEMA(emaF,emaS)},
  ];

  els.indBody.innerHTML=rows.map(r=>`
    <tr>
      <td>${r.name}</td>
      <td>${fmtNum(r.value)}</td>
      <td class="${sigColor(r.sig)}">${r.sig}</td>
    </tr>`).join('');
}

/***************** جدول البيانات الأخيرة *****************/
function renderDetailedTable(series, opts){
  if (!els.tableHead || !els.tableBody) return;
  const closes=series.map(s=>s.price);
  const emaFarr=EMA(closes,opts.emaFast);
  const emaSarr=EMA(closes,opts.emaSlow);
  const rsiArr=RSI(closes,opts.rsiPeriod);
  const macd=MACD(closes);

  els.tableHead.innerHTML='<tr><th>التاريخ</th><th>السعر</th><th>الإشارة</th><th>RSI</th><th>MACD</th><th>EMA F</th></tr>';

  const rows=series.slice(-10).map((s,i,arr)=>{
    const idx=closes.length-(arr.length-i);
    const rsi=rsiArr[idx], macdV=macd.macd[idx], emaF=emaFarr[idx], emaS=emaSarr[idx];
    let sig='حيادي';
    if (emaF>emaS && rsi<70) sig='شراء';
    else if (emaF<emaS && rsi>30) sig='بيع';

    return `<tr>
      <td>${s.date}</td>
      <td>${fmtNum(s.price)}</td>
      <td class="${sigColor(sig)}">${sig}</td>
      <td>${fmtNum(rsi)}</td>
      <td>${fmtNum(macdV)}</td>
      <td>${fmtNum(emaF)}</td>
    </tr>`;
  });

  els.tableBody.innerHTML=rows.join('');
}

/***************** تشغيل *****************/
async function fetchCSV(url){
  const res=await fetch(url);
  const txt=await res.text();
  return txt.trim().split(/\r?\n/).slice(1).map(line=>{
    const [date,price]=line.split(',');
    return {date,price:parseFloat(price)};
  });
}

async function runNow(){
  const src=els.sourceSel.value;
  let url=els.csvUrl.value.trim();
  if (!url){
    if (src==='csv') url=MINUTE_CSV_URL;
    else url=DAILY_CSV_URL;
  }
  const series=await fetchCSV(url);

  const emaFast=Number(els.emaFast.value)||12;
  const emaSlow=Number(els.emaSlow.value)||26;
  const rsiPer=Number(els.rsiPeriod.value)||14;

  renderDetailedTable(series,{emaFast,emaSlow,rsiPeriod:rsiPer});
  renderIndicatorsTable(series,{emaFast,emaSlow,rsiPeriod:rsiPer});
}

if (els.runBtn) els.runBtn.onclick=runNow;
