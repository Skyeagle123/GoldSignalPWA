(function(){
  // يشتغل بعد ما الصفحة تجهز
  const ready = fn => (document.readyState!=='loading') ? fn() : document.addEventListener('DOMContentLoaded', fn);
  ready(()=> {
    const auto = document.getElementById('autoInd');
    const pro  = document.getElementById('proMode');
    const useRSI   = document.getElementById('useRSI');
    const useMACD  = document.getElementById('useMACD');
    const useEMA   = document.getElementById('useEMA');
    const useStoch = document.getElementById('useStoch');
    const useBB    = document.getElementById('useBB');
    const runBtn   = document.getElementById('runBtn');

    if(!auto || !useRSI || !useMACD || !useEMA) return; // IDs من ملفاتك الأصلية

    // إدراج الأزرار فوق Auto indicators
    const autoLabel = auto.closest('label');
    const box = document.createElement('div');
    box.className = 'row-wrap';
    box.style.margin = '8px 0 4px 0';
    box.innerHTML = `
      <button type="button" class="pill" data-mode="fast">سريع</button>
      <button type="button" class="pill" data-mode="safe">حذر</button>
      <button type="button" class="pill" data-mode="auto">ذكي (تلقائي)</button>
      <div class="hint" style="flex-basis:100%;margin-top:2px">
        <b>سريع:</b> RSI + MACD + EMA (تعديل مسموح) •
        <b>حذر:</b> يختار حسب السوق ويقفل التعديل •
        <b>ذكي:</b> يقترح مرة حسب السوق ثم يترك التعديل حرّ
      </div>
    `;
    autoLabel.parentElement.insertBefore(box, autoLabel);

    function setLocked(disabled){
      [useRSI,useMACD,useEMA,useStoch,useBB].forEach(el => { if(el){ el.disabled = !!disabled; }});
    }
    function chooseByMarket(){
      // يعتمد على فكرة Auto indicators تبعك: إذا ترند ⇒ EMA+MACD+RSI(+BB)، وإذا رينج ⇒ BB+Stoch+RSI
      // هنا اختيار مبسّط يعتمد على تشغيل Auto فقط؛ التحليل الفعلي يحدده كودك في app.js
      if(!auto.checked){ auto.checked = true; }
      // تفعيل المبدئي (التحليل سيضبط المنطق التفصيلي)
      if(useRSI)  useRSI.checked  = true;
      if(useMACD) useMACD.checked = true;
      if(useEMA)  useEMA.checked  = true;
      if(useBB)   useBB.checked   = true;
      if(useStoch)useStoch.checked= true;
    }

    function onMode(mode){
      if(mode==='fast'){
        if(auto.checked) auto.checked = false;          // يدوي
        if(pro) pro.checked = false;                    // ملخّص بسيط
        if(useRSI)  useRSI.checked  = true;
        if(useMACD) useMACD.checked = true;
        if(useEMA)  useEMA.checked  = true;
        if(useStoch)useStoch.checked= false;
        if(useBB)   useBB.checked   = false;
        setLocked(false);                                // تعديلات مفتوحة
      } else if(mode==='safe'){
        chooseByMarket();
        if(pro) pro.checked = true;                     // أدقّ مع فلاتر
        setLocked(true);                                // نقفّل التعديل
      } else { // auto
        chooseByMarket();
        if(pro) pro.checked = true;
        setLocked(false);                               // نقترح مرة ونتركك تغيّر
      }
      // شغّل التحليل مباشرة إذا الزر موجود
      if(runBtn){ runBtn.click(); }
    }

    box.addEventListener('click', (e)=>{
      const b = e.target.closest('button[data-mode]');
      if(!b) return;
      onMode(b.getAttribute('data-mode'));
    });
  });
})();
