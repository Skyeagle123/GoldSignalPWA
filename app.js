// ✅ app.js patched version (Precise + anti-freeze + instant recalc)
(function(){
  console.log('[GoldSignals] Precise patch loaded');
  const state={livePrice:null,lastPrice:null,preciseMode:false};

  async function fetchPrice({force=false}={}){
    try{
      const url=LIVE_SOURCES?.[0]||'https://gold-ticks.samer-mourtada.workers.dev/price';
      const fullUrl=url+(force?`?t=${Date.now()}`:'');
      const res=await fetch(fullUrl,{cache:'no-store',mode:'cors'});
      const json=await res.json();
      const p=Number(json.price);
      if(!Number.isFinite(p))return;
      state.lastPrice=state.livePrice??p; state.livePrice=p; window.__livePrice=p;
      if(typeof paintLive==='function') paintLive(p,Date.now());
      console.debug('fetchPrice(force=%s)=>', force, p);
    }catch(e){console.warn('fetchPrice error',e);}
  }

  function recalcSignals(opts={}){
    try{
      state.preciseMode=(opts.precise??state.preciseMode)===true;
      const ctx={price:state.livePrice??state.lastPrice,ignoreFilters:state.preciseMode||opts.force===true,now:new Date()};
      console.debug('[recalcSignals]',ctx);
      if(typeof runAnalysis==='function') runAnalysis();
    }catch(e){console.warn('recalcSignals error',e);}
  }

  const toggle=document.getElementById('proMode');
  if(toggle){
    const saved=localStorage.getItem('preciseMode');
    if(saved==='1'){ state.preciseMode=true; toggle.checked=true; }
    toggle.addEventListener('change',e=>{
      state.preciseMode=!!e.target.checked;
      localStorage.setItem('preciseMode', state.preciseMode?'1':'0');
      recalcSignals({precise:state.preciseMode, force:true});
    });
  }

  const btn=document.getElementById('runBtn');
  if(btn){
    btn.addEventListener('click', async ()=>{
      await fetchPrice({force:true});
      recalcSignals({force:true});
    });
  }

  console.log('[GoldSignals] Precise patch active');
})();
