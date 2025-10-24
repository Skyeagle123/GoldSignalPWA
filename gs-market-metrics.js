/* gs-market-metrics MIN — top line only, no removals, no interference */
(function(){
  const W = window;
  const fmt = v => (v==null || Number.isNaN(v)) ? "—" : Number(v).toFixed(2);
  const clamp = (x,a,b)=>Math.min(b,Math.max(a,x));
  function sma(a,p){ if(!a || a.length<p) return null; let s=0; for(let i=a.length-p;i<a.length;i++) s+=a[i]; return s/p; }
  function stdev(a,p){ if(!a || a.length<p) return null; const m=sma(a,p); let s=0; for(let i=a.length-p;i<a.length;i++){const d=a[i]-m; s+=d*d;} return Math.sqrt(s/p); }
  function calcBBPct(candles, period=20, std=2){
    if(!candles || candles.length<period+1) return { bbPct:null };
    const closes = candles.map(c=>c.c ?? c.close ?? c[4]);
    const mean=sma(closes,period), sd=stdev(closes,period);
    if(mean==null || sd==null) return { bbPct:null };
    const upper=mean+std*sd, lower=mean-std*sd, last=closes[closes.length-1], width=upper-lower;
    if(!(width>0)) return { bbPct:null };
    return { bbPct: clamp(((last-lower)/width)*100,0,100) };
  }
  function calcATRpct(candles, period=14){
    if(!candles || candles.length<3) return null;
    const H=c=>c.h ?? c.high ?? c[2], L=c=>c.l ?? c.low ?? c[3], C=c=>c.c ?? c.close ?? c[4];
    const trs=[]; for(let i=1;i<candles.length;i++){ const cur=candles[i], prev=candles[i-1];
      trs.push(Math.max(H(cur)-L(cur), Math.abs(H(cur)-C(prev)), Math.abs(L(cur)-C(prev)))); }
    const p=Math.min(period, trs.length); if(!p) return null;
    let s=0; for(let i=trs.length-p;i<trs.length;i++) s+=trs[i];
    const atr=s/p, lastClose=C(candles[candles.length-1]); if(!(lastClose>0)) return null;
    return (atr/lastClose)*100;
  }
  function getCandles(){
    const g = W.gs || W.GS || {};
    return g.candles || g.data || g.series || W.__lastSeriesForChart || W.__gsCandles || null;
  }
  function ensureTop(){
    let bar = document.getElementById("gsToplineBar");
    if(!bar){
      bar = document.createElement("div");
      bar.id = "gsToplineBar";
      bar.style.cssText = "position:sticky;top:0;z-index:12;background:#0b1220;border-bottom:1px solid #223048";
      const inner = document.createElement("div");
      inner.id = "gsToplineText";
      inner.style.cssText = "max-width:1100px;margin:0 auto;padding:8px 16px;color:#cbd5e1;font-weight:600";
      bar.appendChild(inner);
      const header = document.querySelector("header") || document.body;
      header.parentNode.insertBefore(bar, header.nextSibling);
    }
    return bar;
  }
  function render(){
    ensureTop();
    const txt = document.getElementById("gsToplineText");
    const candles = getCandles();
    const { bbPct } = calcBBPct(candles);
    const atrPct = calcATRpct(candles);
    const mode = (atrPct!=null && bbPct!=null && atrPct<0.25 && bbPct>35 && bbPct<65) ? "range" : "trend";
    txt.textContent = "حالة السوق: " + mode + " • BB%: " + fmt(bbPct) + " • ATR%: " + fmt(atrPct);
  }
  W.addEventListener("gs:candles:updated", ()=>setTimeout(render, 50));
  W.addEventListener("gs:state:changed", ()=>setTimeout(render, 50));
  setTimeout(render, 400); setTimeout(render, 1200);
})();