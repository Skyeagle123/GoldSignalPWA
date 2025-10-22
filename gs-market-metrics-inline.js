<!-- gs-market-metrics-inline.js -->
<script>
(()=>{

  // ====== أدوات صغيرة ======
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const num = s => {
    if (s==null) return NaN;
    const n = String(s).replace(/[^\d\.\-]+/g,'');
    return n? Number(n) : NaN;
  };

  // ====== صنع/تثبيت حاوية العرض ======
  function ensureHost(){
    let el = document.getElementById('mktStatsInline');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'mktStatsInline';
    el.dir = 'auto';
    el.style.cssText = `
      margin-top:8px;
      font-size:.92rem;
      opacity:.95;
      color:var(--muted-fore,#bbb);
    `;

    // جرّب نحطّه مباشرة بعد العنصر الذي يحتوي نص "حالة السوق"
    const marks = Array.from(document.querySelectorAll('*'))
      .filter(n => n.childNodes && Array.from(n.childNodes).some(c => c.nodeType===3 && /حالة السوق/.test(c.textContent||'')));
    if (marks[0]?.parentElement){
      marks[0].parentElement.insertAdjacentElement('afterend', el);
      return el;
    }

    // فallback: ضيفه تحت أول panel/section
    const firstPanel = document.querySelector('main .card, main section, main .panel, main');
    (firstPanel || document.body).appendChild(el);
    return el;
  }

  const host = ensureHost();

  // ====== تحديث النص على الشاشة ======
  function render({bbp, atrp, source}) {
    const fmt = v => (isFinite(v) ? (v>0?'+':'') + v.toFixed(2) : '—');
    host.textContent = `BB%: ${fmt(bbp)} • ATR%: ${fmt(atrp)}  ${source?`(${source})`:''}`;
  }

  // ====== محاولة قراءة القيم مباشرة من الواجهة ======
  function readFromUI(){
    let price;
    // جرّب عنصر السعر الحي
    const live = document.getElementById('livePrice') || Array.from(document.querySelectorAll('*')).find(n=>/السعر الحي/.test(n.textContent||''));
    if (live){
      // حاول التقط أول رقم ظاهر بعد/داخل عنصر السعر
      const m = (live.textContent||'').match(/[-+]?\d[\d,\.]*/);
      if (m) price = num(m[0]);
      // أحيانًا الرقم موجود بسبان/عنصر ابن
      if (!price){
        const n = Array.from(live.querySelectorAll('*')).map(x=>x.textContent).join(' ');
        const mm = n.match(/[-+]?\d[\d,\.]*/);
        if (mm) price = num(mm[0]);
      }
    }

    // سطر BB: "BB: U / M / L"
    let upper, mid, lower;
    const bbNode = Array.from(document.querySelectorAll('*')).find(n=>/BB:/.test(n.textContent||''));
    if (bbNode){
      const txt = bbNode.textContent.replace(/\s+/g,' ');
      // التقط الأرقام الثلاثة بعد "BB:"
      const nums = txt.split('BB:').pop().match(/[-+]?\d[\d,\.]*/g) || [];
      if (nums.length>=3){
        upper = num(nums[0]); mid = num(nums[1]); lower = num(nums[2]);
      }
    }

    // ATR% إن كان مكتوبًا في النص
    let atrp;
    const atrNode = Array.from(document.querySelectorAll('*')).find(n=>/ATR%/.test(n.textContent||'') || /\bATR\b/.test(n.textContent||''));
    if (atrNode){
      const mm = (atrNode.textContent||'').match(/ATR%[:\s]*([-+]?\d[\d,\.]*)/i);
      if (mm) atrp = num(mm[1]);
    }

    // حساب BB%
    let bbp;
    if (isFinite(upper) && isFinite(mid) && isFinite(lower) && isFinite(price)) {
      const halfSpan = (upper - lower) / 2;
      if (halfSpan>0){
        bbp = clamp(((price - mid) / halfSpan) * 100, -100, 100);
      }
    }

    // ما قدرنا نطلّع شي؟ رجّع undefineds
    return { price, upper, mid, lower, bbp, atrp };
  }

  // ====== مستمع لحدث مخصّص من جسورك (إن وُجد) ======
  function onCustomMetrics(e){
    if (!e?.detail) return;
    const d = e.detail || {};
    const bbp = isFinite(d.bbp)? d.bbp : undefined;
    const atrp = isFinite(d.atrp)? d.atrp : undefined;
    if (bbp==null && atrp==null) return;
    render({bbp, atrp, source:'bridge'});
  }
  window.addEventListener('gs:state-metrics', onCustomMetrics);

  // ====== Polling خفيف كـ fallback ======
  let last = {bbp:undefined, atrp:undefined};
  async function tick(){
    try{
      const u = readFromUI();
      const bbp = isFinite(u.bbp)? u.bbp : last.bbp;
      const atrp = isFinite(u.atrp)? u.atrp : last.atrp;
      if (bbp!==last.bbp || atrp!==last.atrp){
        last = {bbp, atrp};
        render({bbp, atrp, source:'ui'});
      }
    }catch(_){}
  }
  tick();
  const iv = setInterval(tick, 1500);

  // تنظيف عند إلغاء تحميل الصفحة
  window.addEventListener('beforeunload', ()=> clearInterval(iv));

})();
</script>
