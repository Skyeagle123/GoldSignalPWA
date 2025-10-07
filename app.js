/* app_final.js — GoldSignals runtime (Arabic)
 * - Live price via Cloudflare Worker (provided by user)
 * - CSV import + merged CSV download (with BOM + CRLF for Excel mobile)
 * - Loud beep on new Buy/Sell signal (observes summary text)
 * - Buttons placed under 'إعدادات البيانات'
 * NOTE: We kept your logic pluggable. Replace hooks with your existing functions if needed.
*/

(function(){
  'use strict';

  // ====== Config ======
  const WORKER = 'https://gold-ticks.samer-mourtada.workers.dev';
  const LIVE_REFRESH_SEC = 5;        // polling
  const EXPORT_PREFIX = 'XAUUSD';    // file prefix
  const LOCALE = 'ar-SY';            // for date/time formatting

  // ====== DOM ======
  const $ = sel => document.querySelector(sel);
  const livePriceEl = $('#livePrice');
  const liveStampEl = $('#liveStamp');
  const summaryEl   = $('#summaryText');
  const importBtn   = $('#importCsvBtn');
  const exportBtn   = $('#exportCsvBtn');
  const fileInput   = $('#fileCsvInput');
  const testBeepBtn = $('#testBeepBtn');
  const toastEl     = $('#toast');

  // ====== State ======
  let LAST_LIVE = null;          // {price:number, ts:number}
  let IMPORTED_CSV_TEXT = null;  // original imported text

  // ====== Utils ======
  function showToast(msg, ms=2200){
    if(!toastEl) return;
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    setTimeout(()=> toastEl.style.display='none', ms);
  }

  // Loud beep (WebAudio)
  function loudBeep(duration=280, freq=980, volume=0.6){
    try{
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(()=>{osc.stop(); ctx.close();}, duration);
    }catch(e){ /* ignore */ }
  }

  // Observe summary text for Buy/Sell Arabic words and beep
  function setupSignalObserver(){
    if(!summaryEl) return;
    const obs = new MutationObserver(()=>{
      const txt = (summaryEl.textContent||'').trim();
      if(!txt || txt==='—') return;
      const hasSignal = /شراء|بيع/.test(txt);
      if(hasSignal && $('#alertSound')?.checked){
        loudBeep(); // loud & clear
      }
      if(hasSignal && $('#alertToast')?.checked){
        showToast(`إشارة: ${txt}`);
      }
    });
    obs.observe(summaryEl, {childList:true, characterData:true, subtree:true});
  }

  // Format number & time
  const fmtNum = n => new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}).format(n);
  const fmtTime = ms => new Date(ms).toLocaleString('en-CA', {hour12:false});

  // ====== Live Price ======
  async function fetchLivePrice(){
    try{
      const res = await fetch(`${WORKER}/price`, {cache:'no-store'});
      const j = await res.json();
      const price = Number(j.price ?? j.close ?? j?.data?.price);
      const ts = Number(j.ts ?? j.timeMs ?? Date.now());
      if(Number.isFinite(price)){
        LAST_LIVE = {price, ts};
        if(livePriceEl) livePriceEl.textContent = fmtNum(price);
        if(liveStampEl) liveStampEl.textContent = fmtTime(ts);
      }
    }catch(err){
      // keep UI silent, just console
      console.debug('Live error:', err?.message || err);
    }
  }

  function startLive(){
    fetchLivePrice();
    setInterval(fetchLivePrice, LIVE_REFRESH_SEC*1000);
  }

  // ====== CSV Import / Export ======
  importBtn?.addEventListener('click', ()=> fileInput?.click());

  fileInput?.addEventListener('change', async (e)=>{
    try{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      const text = await f.text();
      IMPORTED_CSV_TEXT = text;
      showToast('تم استيراد CSV');
    }catch(err){
      console.error('CSV import error', err);
      showToast('فشل استيراد CSV');
    }finally{
      try{ e.target.value = ''; }catch{}
    }
  });

  exportBtn?.addEventListener('click', ()=>{
    try{
      const tf = Number(document.querySelector('input[name="tf"]:checked')?.value || 5);
      const blobText = generateMergedCsv(tf, IMPORTED_CSV_TEXT, LAST_LIVE);
      const counter = (Number(localStorage.getItem('csv_counter')||'0') + 1);
      localStorage.setItem('csv_counter', String(counter));
      const fname = `${EXPORT_PREFIX}_${tf===1440?'1day':tf+'min'}_merged-${counter}.csv`;
      triggerDownload(blobText, fname);
    }catch(err){
      console.error('Export error', err);
      showToast('تعذّر إنشاء الملف');
    }
  });

  function generateMergedCsv(tf, importedText, live){
    // Ensure Excel-friendly CSV: add BOM + CRLF
    const BOM = '\ufeff';
    // If user provided a CSV, we keep it as-is and optionally append a live row at the end.
    if(importedText && typeof importedText === 'string'){
      const safe = importedText.replace(/\r?\n/g, '\r\n');
      const extra = makeLiveRow(tf, live);
      return BOM + safe + (extra ? (safe.endsWith('\r\n')?'':'\r\n') + extra : '');
    }
    // Minimal CSV when no input file provided
    const header = 'Time,Open,High,Low,Close';
    const liveRow = makeLiveRow(tf, live) || '';
    return BOM + header + '\r\n' + liveRow;
  }

  function makeLiveRow(tf, live){
    if(!live || !Number.isFinite(live.price)) return '';
    // Place the same price as O/H/L/C (we don't infer candle here)
    const t = new Date(live.ts || Date.now()).toISOString();
    const p = Number(live.price).toFixed(2);
    return `${t},${p},${p},${p},${p}`;
  }

  function triggerDownload(text, filename){
    const blob = new Blob([text], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  // Test beep
  testBeepBtn?.addEventListener('click', ()=> loudBeep());

  // ====== Boot ======
  setupSignalObserver();
  startLive();

  // Expose small hooks if your original app needs them
  window.GS = Object.assign(window.GS||{}, {
    getLive: ()=> LAST_LIVE,
    setSummary: (txt)=>{ if(summaryEl) summaryEl.textContent = String(txt); },
    setLive: (price, ts=Date.now())=>{
      LAST_LIVE = {price:Number(price), ts:Number(ts)};
      livePriceEl.textContent = fmtNum(LAST_LIVE.price);
      liveStampEl.textContent = fmtTime(LAST_LIVE.ts);
    }
  });

})();
