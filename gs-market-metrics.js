// GoldSignals - Market Metrics row (drop-in, read-only)
// Shows BB %B and ATR% under the market-state chips without touching core logic.
(function(){
  try {
    function $(sel){ return document.querySelector(sel); }
    function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

    function ensureRow(){
      let host = $('#marketStateChips') || $('.market-state-chips');
      if (!host){
        host = $all('div,section').find(el => /حالة\s*السوق|market\s*state/i.test(el.textContent||'')) || null;
      }
      if (!host) return null;

      let row = $('#gs-metrics-row');
      if (!row){
        row = document.createElement('div');
        row.id = 'gs-metrics-row';
        row.style.cssText = 'margin-top:6px;font-size:13px;opacity:.85;';
        host.after(row);
      }
      return row;
    }

    function parseNums(text){
      return (text.match(/-?\d+(?:[\.,]\d+)?/g)||[]).map(s=>+s.replace(',',''));
    }

    function readLivePrice(){
      const p = $('#livePrice') || $('.live-price');
      if (p){
        const n = parseNums(p.textContent||'')[0];
        if (isFinite(n)) return n;
      }
      return null;
    }

    function readBB(){
      const el = $all('span,div').find(x => /(^|\s)BB\s*:/.test(x.textContent||''));
      if (!el) return null;
      const nums = parseNums(el.textContent||'');
      if (nums.length < 3) return null;
      return { upper: nums[0], mid: nums[1], lower: nums[2] };
    }

    function readATR(){
      const w = window;
      if (w.__cache && isFinite(+w.__cache.lastATR)) return +w.__cache.lastATR;
      if (w.__cache && isFinite(+w.__cache.atr))     return +w.__cache.atr;

      const el = $('[data-atr]');
      if (el){
        const v = +el.getAttribute('data-atr');
        if (isFinite(v)) return v;
      }
      return null;
    }

    function tick(){
      const row = ensureRow();
      if (!row) return;

      let bbTxt = 'BB: —';
      let atrTxt = 'ATR%: —';

      const price = readLivePrice();
      const bb = readBB();
      if (bb && price && isFinite(bb.upper) && isFinite(bb.lower) && bb.upper !== bb.lower){
        const percentB = ((price - bb.lower) / (bb.upper - bb.lower)) * 100;
        bbTxt = 'BB: ' + percentB.toFixed(2) + '%';
        const atr = readATR();
        if (atr && isFinite(atr) && price){
          const atrPct = (atr / price) * 100;
          atrTxt = 'ATR%: ' + atrPct.toFixed(2) + '%';
        }
      }
      row.textContent = bbTxt + ' • ' + atrTxt;
    }

    function start(){
      tick();
      setInterval(tick, 2000);
    }

    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', start, { once:true });
    } else {
      start();
    }
  } catch(e){
    console.warn('[gs-market-metrics] non-fatal:', e);
  }
})(); 
