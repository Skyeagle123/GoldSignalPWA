/* app_fixed.js — CSV import/merged export + beep/toast + series hooking */
window.__LATEST_SERIES__ = window.__LATEST_SERIES__ || [];
window.currentTF = window.currentTF || 5;

(function(){
  const _build = window.buildAndRender;
  if(typeof _build === 'function'){
    window.buildAndRender = function(series){
      try{ if(Array.isArray(series)) window.__LATEST_SERIES__ = series; }catch(_){}
      return _build.apply(this, arguments);
    };
  }
  const _render = window.renderTradeChart;
  if(typeof _render === 'function'){
    window.renderTradeChart = function(series){
      try{ if(Array.isArray(series)) window.__LATEST_SERIES__ = series; }catch(_){}
      return _render.apply(this, arguments);
    };
  }
})();

function arraysToCsv(rows){
  return rows.map(r => r.map(v => (v==null?'':String(v))).join(',')).join('\n');
}
function generateMergedCsv(){
  const src = Array.isArray(window.__LATEST_SERIES__) && window.__LATEST_SERIES__.length
    ? window.__LATEST_SERIES__
    : (Array.isArray(window.LAST_SERIES) && window.LAST_SERIES.length ? window.LAST_SERIES : []);
  if(!src.length) throw new Error('لا يوجد بيانات في الذاكرة.');
  const header = ['Time','Open','High','Low','Close'];
  const rows = [header, ...src.map(c => [c.time, c.open, c.high, c.low, c.close])];
  return arraysToCsv(rows);
}
function downloadMergedCsv(){
  try{
    const csv = generateMergedCsv();
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    a.href = url; a.download = `XAUUSD_5min_merged-${ts}.csv`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
  }catch(err){ alert('تعذر إنشاء الملف: '+err.message); console.error(err); }
}

let __beepReady = null;
function ensureBeep(){
  if(__beepReady) return __beepReady;
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    __beepReady = (freq=880, ms=180)=>{
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type='sine'; o.frequency.value=freq;
      o.connect(g); g.connect(ctx.destination);
      o.start(); g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms/1000);
      o.stop(ctx.currentTime + ms/1000);
    };
  }catch(e){ __beepReady = ()=>{}; }
  return __beepReady;
}
function showToast(msg){
  const el = document.getElementById('signalToast');
  if(!el) return;
  el.textContent = msg; el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), 2500);
}
window.fireSignalNotify = function({side, tf}){
  const useBeep  = document.getElementById('sigBeep')?.checked ?? true;
  const useToast = document.getElementById('sigToast')?.checked ?? true;
  const tfLabel = (tf===5?'5 دقائق':tf===30?'30 دقيقة':tf===60?'ساعة':tf===1440?'يوم':'—');
  if(useBeep)  ensureBeep()(side==='buy'?1000:600, 200);
  if(useToast) showToast(`${side==='buy'?'شراء':'بيع'} • الإطار: ${tfLabel}`);
};

(function wireCsvButtons(){
  function $(id){ return document.getElementById(id); }
  const importBtn = $('importCsvBtn');
  const exportBtn = $('exportCsvBtn');
  const fileInput = $('csvInput');
  const testBeep  = $('testBeepBtn');

  if(importBtn && fileInput && !importBtn.__wired){
    importBtn.addEventListener('click', ()=> fileInput.click());
    importBtn.__wired = true;
  }
  if(fileInput && !fileInput.__wired){
    fileInput.addEventListener('change', async (e)=>{
      try{
        const f = e.target.files && e.target.files[0]; if(!f) return;
        const text = await f.text(); window.__importedCsvText = text;
        if(typeof window.runAnalysis === 'function'){ await window.runAnalysis(); }
        else{ showToast('تم استيراد CSV'); }
      }catch(err){ console.error('CSV import error', err); }
      finally{ try{ e.target.value=''; }catch(_){ } }
    });
    fileInput.__wired = true;
  }
  if(exportBtn && !exportBtn.__wired){
    exportBtn.addEventListener('click', (e)=>{ e.preventDefault(); downloadMergedCsv(); });
    exportBtn.__wired = true;
  }
  if(testBeep && !testBeep.__wired){
    testBeep.addEventListener('click', ()=> window.fireSignalNotify({side:'buy', tf: window.currentTF||5}));
    testBeep.__wired = true;
  }
})();

// Demo stub
(async function demoLive(){
  const liveEl = document.getElementById('livePrice'); if(!liveEl) return;
  function set(v){ liveEl.textContent = v; }
  try{ set('—'); }catch{ set('—'); }
})();
