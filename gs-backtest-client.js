(function attachOfficialBacktestClient(root) {
  'use strict';

  const WORKER_BASE = 'https://goldsignalsx-worker.samer-mourtada.workers.dev';
  const OFFICIAL_TIMEFRAMES = Object.freeze(['1m','5m','15m','30m','60m','240m','1d']);
  const HIGHER_TIMEFRAMES = Object.freeze({
    '1m':['5m','15m'],'5m':['15m','60m'],'15m':['60m','240m'],
    '30m':['60m','240m'],'60m':['240m'],'240m':[],'1d':[]
  });
  const TF_MS = Object.freeze({
    '1m':60_000,'5m':300_000,'15m':900_000,'30m':1_800_000,
    '60m':3_600_000,'240m':14_400_000,'1d':86_400_000
  });
  const FRAME_LIMIT = 2500;

  function normalizeTimeframe(value) {
    const aliases={1:'1m',5:'5m',15:'15m',30:'30m',60:'60m',240:'240m',1440:'1d'};
    const text=String(value||'');
    const tf=OFFICIAL_TIMEFRAMES.includes(text)?text:aliases[Number(text)];
    if (!tf) throw new Error('الإطار الزمني غير مدعوم');
    return tf;
  }

  function normalizeBars(payload) {
    const source=Array.isArray(payload)?payload:(Array.isArray(payload?.bars)?payload.bars:[]);
    return source.map(row=>{
      let t=typeof row?.t==='string'?Date.parse(row.t):Number(row?.t??row?.ts??row?.time);
      if (Number.isFinite(t)&&t<1e12) t*=1000;
      const o=Number(row?.o??row?.open),h=Number(row?.h??row?.high);
      const l=Number(row?.l??row?.low),c=Number(row?.c??row?.close),v=Number(row?.v??row?.volume??0);
      return {t,o,h,l,c,v:Number.isFinite(v)?v:0};
    }).filter(row=>[row.t,row.o,row.h,row.l,row.c].every(Number.isFinite)&&row.h>=row.l)
      .sort((left,right)=>left.t-right.t);
  }

  function aggregateBars(rows,timeframe) {
    const tf=normalizeTimeframe(timeframe),duration=TF_MS[tf],buckets=new Map();
    for (const row of normalizeBars(rows)) {
      const t=Math.floor(row.t/duration)*duration;
      const current=buckets.get(t);
      if (!current) buckets.set(t,{t,o:row.o,h:row.h,l:row.l,c:row.c,v:row.v});
      else {
        current.h=Math.max(current.h,row.h);
        current.l=Math.min(current.l,row.l);
        current.c=row.c;
        current.v+=row.v;
      }
    }
    return [...buckets.values()].sort((left,right)=>left.t-right.t);
  }

  function framesFromFiveMinuteRows(rows,timeframe) {
    const tf=normalizeTimeframe(timeframe);
    if (tf==='1m') throw new Error('ملف 5 دقائق لا يمكنه إنشاء شموع 1m؛ استخدم بيانات السيرفر لهذا الإطار');
    const base=normalizeBars(rows);
    if (base.length<40) throw new Error('بيانات CSV غير كافية');
    const required=[tf,...HIGHER_TIMEFRAMES[tf]];
    return Object.fromEntries(required.map(frame=>[
      frame,(frame==='5m'?base:aggregateBars(base,frame)).slice(-FRAME_LIMIT)
    ]));
  }

  async function fetchOfficialFrames(fetchImpl,timeframe) {
    const tf=normalizeTimeframe(timeframe),frames={};
    const required=[tf,...HIGHER_TIMEFRAMES[tf]];
    for (const frame of required) {
      const url=`${WORKER_BASE}/bars?tf=${encodeURIComponent(frame)}&limit=1200&t=${Date.now()}`;
      const response=await fetchImpl(url,{cache:'no-store',mode:'cors'});
      if (!response.ok) throw new Error(`تعذّر تحميل شموع ${frame} من السيرفر (${response.status})`);
      const bars=normalizeBars(await response.json());
      if (bars.length<40) throw new Error(`شموع ${frame} غير كافية`);
      frames[frame]=bars;
    }
    return frames;
  }

  async function runOfficialBacktest({fetchImpl,timeframe,frames,endAt=Date.now(),maxEvaluations=2000}) {
    const tf=normalizeTimeframe(timeframe);
    const response=await fetchImpl(`${WORKER_BASE}/backtest`,{
      method:'POST',mode:'cors',cache:'no-store',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({tf,frames,endAt,maxEvaluations})
    });
    const payload=await response.json().catch(()=>null);
    if (!response.ok||!payload?.ok) throw new Error(payload?.error||`Backtest HTTP ${response.status}`);
    if (payload.engine!=='computeServerSignal'||payload.settingsSource!=='official-server') {
      throw new Error('استجابة Backtest ليست من محرك السيرفر الرسمي');
    }
    return payload;
  }

  function presentationTrades(payload,accountSize=10_000,riskPercent=1) {
    const risk=Math.max(0,Number(accountSize)||0)*Math.max(0,Number(riskPercent)||0)/100;
    const labels={buy:'شراء',sell:'بيع',active:'فعّالة',tp1:'TP1',tp2:'TP2',stopped:'SL',expired:'Expired'};
    return (Array.isArray(payload?.trades)?payload.trades:[]).map(record=>{
      const signal=record.signal||{},status=String(record.outcome?.status||signal.status||'active');
      const terminalEvent=(record.events||[]).slice().reverse().find(item=>item.event===status);
      const ratio=status==='tp2'?2.1:status==='stopped'?-1:0;
      const exit=Number(terminalEvent?.price);
      return {
        ts:Number(signal.createdAt),side:`${labels[signal.side]||signal.side} · ${labels[status]||status}`,
        entry:Number(signal.entry),exit:Number.isFinite(exit)?exit:Number(signal.entry),
        R:ratio,pl:ratio*risk,status,score:Number(signal.score),signal
      };
    });
  }

  function summarizePresentation(trades) {
    const rows=Array.isArray(trades)?trades:[],n=rows.length;
    const wins=rows.filter(row=>row.R>0),losses=rows.filter(row=>row.R<0);
    const totalR=rows.reduce((sum,row)=>sum+row.R,0);
    const grossWin=wins.reduce((sum,row)=>sum+row.R,0);
    const grossLoss=-losses.reduce((sum,row)=>sum+row.R,0);
    let peak=0,run=0,dd=0;
    for (const row of rows) { run+=row.pl;peak=Math.max(peak,run);dd=Math.max(dd,peak-run); }
    return {
      n,winRate:n?wins.length/n*100:0,avgR:n?totalR/n:0,
      pf:grossLoss?grossWin/grossLoss:(grossWin?Infinity:0),dd,
      pnl:rows.reduce((sum,row)=>sum+row.pl,0)
    };
  }

  root.GSXBacktestClient=Object.freeze({
    WORKER_BASE,OFFICIAL_TIMEFRAMES,HIGHER_TIMEFRAMES,TF_MS,
    normalizeTimeframe,normalizeBars,aggregateBars,framesFromFiveMinuteRows,
    fetchOfficialFrames,runOfficialBacktest,presentationTrades,summarizePresentation
  });
})(typeof window!=='undefined'?window:globalThis);
