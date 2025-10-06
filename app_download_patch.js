
/* === PATCH: Enable 'Download merged CSV' button and ensure data is available === */
(function(){
  // 1) keep latest series available for export
  function setSeriesForExport(series){ try{ window.__seriesForExport = Array.isArray(series)? series.slice() : null; }catch{} }
  // Hook into global functions if present
  const _build = window.buildAndRender;
  if (typeof _build === 'function'){
    window.buildAndRender = function(series){
      try{ setSeriesForExport(series); }catch(e){}
      return _build.apply(this, arguments);
    };
  } else {
    // As a fallback, try to watch charting function
    const _render = window.renderTradeChart;
    if (typeof _render === 'function'){
      window.renderTradeChart = function(series){
        try{ setSeriesForExport(series); }catch(e){}
        return _render.apply(this, arguments);
      };
    }
  }

  // 2) merge helper (current TF if available, default 5)
  function mergeWithLive(series){
    const tf = (window.currentTF || 5);
    const live = window.LAST_LIVE;
    if(!Array.isArray(series) || !series.length || !live) return series;
    const ms = tf*60*1000;
    const b = Math.floor((live.timeMs||Date.now())/ms)*ms;
    const out = series.slice();
    const last = Object.assign({}, out[out.length-1]);
    if (b === last.ts){
      last.close = live.price;
      last.high = Math.max(last.high, live.price);
      last.low  = Math.min(last.low,  live.price);
      out[out.length-1] = last;
    } else if (b > last.ts){
      out.push({ts:b, open:last.close, high:live.price, low:live.price, close:live.price});
    }
    return out;
  }

  // 3) exporter
  function downloadMergedCsv(){
    let s = window.__seriesForExport;
    if(!s || !s.length){ alert('ما في بيانات للتصدير. شغّل التحليل أولاً أو استورد CSV.'); return; }
    s = mergeWithLive(s);
    const DELIM = ';', CRLF = '\r\n', BOM = '\ufeff';
    const q = (v)=>`"${String(v).replace(/"/g,'""')}"`;
    const header = ['Date','Open','High','Low','Close'];
    const rows = s.map(r=>[new Date(r.ts).toISOString().replace('T',' ').slice(0,19), r.open, r.high, r.low, r.close]);
    const csv = [header.map(q).join(DELIM)].concat(rows.map(row=>row.map(q).join(DELIM))).join(CRLF) + CRLF;
    const blob = new Blob([BOM + csv], {type:'application/vnd.ms-excel;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `XAUUSD_${window.currentTF||5}min_merged.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // 4) wire button
  function wireBtn(){
    const btn = document.getElementById('btnExportCsv');
    if(btn && !btn.__wired){
      btn.addEventListener('click', downloadMergedCsv);
      btn.__wired = true;
    }
  }
  document.addEventListener('DOMContentLoaded', wireBtn);
  wireBtn();
})();
