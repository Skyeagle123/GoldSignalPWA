
/*! GoldSignals bridge v5
 * - يمنع ظهور نصيحة افتراضية بلا داعٍ
 * - يذكر أسباب الرفض عند تفعيل الفلاتر
 * - يُظهر/يُخفي الشارت بحسب وجود نصيحة (كما كان سابقًا)
 * ملاحظة: السكربت لا يغيّر HTML، كلّه يعمل عبر مراقبة الـDOM.
 */

(function () {
  const T = {
    ADVICE_TITLE: "نصيحة الدخول/الخروج",
    CHART_TITLE: "(SL/TP/دخول/خروج)",
    AUTO_INDICATORS: "Auto indicators",
    NY_FILTER: "تعطيل فلتر ساعات نيويورك",
    PIVOT_FILTER: "تعطيل فلتر الاقتراب من Pivot",
    SUMMARY: "الملخ",
    BUY: "شراء",
    SELL: "بيع",
    NEUTRAL: "حيادي",
    NO_ADVICE: "لا توجد نصيحة.",
    INFO_ONLY: "إطلاع فقط",
    VIRTUAL_ENTRY: "دخول افتراضي",
    REASONS_PREFIX: "أسباب الرفض: "
  };

  // === أدوات DOM مساعدة ===
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
  function findByText(root, txt){
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    let n;
    while((n = walker.nextNode())){
      if((n.textContent||"").trim().includes(txt)) return n;
    }
    return null;
  }
  function closestCard(el){
    while (el && el!==document.body){
      const cs = getComputedStyle(el);
      if (cs.borderRadius && parseFloat(cs.borderRadius) > 0) return el;
      el = el.parentElement;
    }
    return null;
  }

  // اعثر على صندوق النصيحة وعنصر الكتابة فيه
  function getAdviceNodes(){
    const titleEl = findByText(document.body, T.ADVICE_TITLE);
    if(!titleEl) return {};
    const card = closestCard(titleEl) || titleEl.parentElement;
    // أول عنصر نصي يصلح لعرض النصيحة داخل البطاقة
    let textEl = qsa("p, div, span", card).find(e=>/SL|TP|ATR|آخر سعر|لا توجد نصيحة|إطلاع فقط|افتراضي/.test((e.textContent||"")));
    if(!textEl){
      textEl = document.createElement("p");
      card.appendChild(textEl);
    }
    return {card, textEl};
  }

  // اعثر على حاوية الشارت
  function getChartCard(){
    const titleEl = findByText(document.body, T.CHART_TITLE);
    if(!titleEl) return null;
    return closestCard(titleEl) || titleEl.parentElement;
  }

  // قراءة حالات الفلاتر من الشيكبوكسات
  function readFilters(){
    const nyBox = findByText(document.body, T.NY_FILTER);
    const pvBox = findByText(document.body, T.PIVOT_FILTER);
    const nyEnabled = nyBox ? !!qsa('input[type="checkbox"]', nyBox.parentElement).find(i=>i.checked) : false;
    const pvEnabled = pvBox ? !!qsa('input[type="checkbox"]', pvBox.parentElement).find(i=>i.checked) : false;
    return { nyEnabled, pvEnabled };
  }

  // ساعات نيويورك (08:00–17:00) بتوقيت نيويورك:
  function inNYHours(nowLocal=new Date()){
    try{
      const fmt = new Intl.DateTimeFormat('en-US',{ timeZone:'America/New_York', hour12:false, hour:'2-digit' });
      const hourNY = parseInt(fmt.format(nowLocal),10);
      return hourNY>=8 && hourNY<17;
    }catch(_){ return true; }
  }

  // آخر سعر من النصيحة أو من عناصر "Live"
  function getLastPrice(){
    // من النص الحالي
    const {textEl} = getAdviceNodes();
    if (textEl){
      const m = (textEl.textContent||"").match(/آخر سعر[:：]?\s*([0-9.,]+)/);
      if(m){ return parseFloat(m[1].replace(/,/g,'')); }
    }
    // من التسميات قرب الشارت
    const liveEl = findByText(document.body, "Live");
    if(liveEl){
      const m = (liveEl.parentElement.textContent||"").match(/Live[:：]?\s*([0-9.,]+)/);
      if(m){ return parseFloat(m[1].replace(/,/g,'')); }
    }
    // من حبوب المؤشرات (EMA السريع/البطيء)
    const chip = qsa("div,span").find(e=>/\bEMA\b/.test((e.textContent||"")));
    if(chip){
      const n = (chip.textContent||"").match(/([0-9.,]+)/);
      if(n){ return parseFloat(n[1].replace(/,/g,'')); }
    }
    return NaN;
  }

  // مسافة الاقتراب بالدولار
  function getPivotDistance(){
    const lbl = findByText(document.body, "مسافة الاقتراب");
    if(!lbl) return 0.5;
    const inp = qsa('input, .input, .form-control', lbl.parentElement).find(i=>/input|textarea/i.test(i.tagName)||i.getAttribute('contenteditable')==='true');
    if(inp){
      const v = (inp.value||inp.textContent||"").trim();
      const x = parseFloat(v.replace(/,/g,''));
      return isFinite(x)?x:0.5;
    }
    return 0.5;
  }

  // تحقق إن كان هناك إشارة (شراء/بيع)
  function hasSignal(){
    // من "الملخّص"
    const sumEl = findByText(document.body, "الملخص");
    if (sumEl){
      const s = (closestCard(sumEl)||sumEl.parentElement).textContent||"";
      if (s.includes(T.BUY) || s.includes(T.SELL)) return true;
    }
    // من آخر جدول
    const row = qsa("table tr").slice(1,3).find(tr=>/شراء|بيع/.test(tr.textContent||""));
    if(row) return true;
    return false;
  }

  // أسباب الرفض
  function computeReasons(){
    const {nyEnabled, pvEnabled} = readFilters();
    const reasons = [];
    if(!nyEnabled && !pvEnabled){
      return {nyEnabled, pvEnabled, reasons};
    }
    if(nyEnabled && !inNYHours()){
      reasons.push("خارج ساعات نيويورك");
    }
    if(pvEnabled){
      const last = getLastPrice();
      if(isFinite(last)){
        // نقول رفض إن كان السعر ضمن المسافة
        const dist = getPivotDistance();
        // نقرأ Pivot من جدول pivot إن وُجد:
        const pivotEl = findByText(document.body, "Pivot");
        if(pivotEl){
          const wrapper = closestCard(pivotEl) || pivotEl.parentElement;
          const t = (wrapper.textContent||"");
          const m = t.match(/Pivot\s*([0-9.,]+)/);
          if(m){
            const pv = parseFloat(m[1].replace(/,/g,''));
            if(isFinite(pv) && Math.abs(last-pv) <= dist){
              reasons.push("قرب مستوى Pivot");
            }
          }
        }
      }
    }
    return {nyEnabled, pvEnabled, reasons};
  }

  // تحديث النصيحة وإظهار/إخفاء الشارت
  function updateAdvice(){
    const A = getAdviceNodes();
    if(!A.textEl) return;
    const chartCard = getChartCard();
    const {reasons} = computeReasons();
    const signal = hasSignal();

    // لا توجد إشارة ولا أسباب -> لا نصيحة + إخفاء الشارت
    if(!signal && reasons.length===0){
      A.textEl.textContent = T.NO_ADVICE;
      if(chartCard) chartCard.style.display = "none";
      return;
    }

    // يوجد أسباب فلتر تمنع التفعيل
    if(reasons.length>0){
      // اعرض "لا توجد نصيحة. أسباب الرفض: ..."
      A.textEl.textContent = `${T.NO_ADVICE} ${T.REASONS_PREFIX}${reasons.join(" + ")}`;
      // الشارت يُعرض لأن الحسابات موجودة لكن التنفيذ مرفوض
      if(chartCard) chartCard.style.display = "";
      return;
    }

    // يوجد إشارة ولا موانع -> اسمح بالنصيحة وأظهر الشارت
    // إن كان النص الحالي "إطلاع فقط..." اتركه، وإلا لا تغيّر صياغة التطبيق الأصلي
    if((A.textEl.textContent||"").trim() === "" || (A.textEl.textContent||"").includes(T.NO_ADVICE)){
      // لا نملك صياغة SL/TP هنا، نترك النص كما يضعه التطبيق الرئيسي.
      A.textEl.textContent = ""; // يسمح للتطبيق أن يكتب نصه
    }
    if(chartCard) chartCard.style.display = "";
  }

  // راقب الصفحة وحدث
  const obs = new MutationObserver(()=>{
    try{ updateAdvice(); }catch(e){ /*noop*/ }
  });
  obs.observe(document.documentElement, {subtree:true, childList:true, characterData:true});

  // تهيئة أولية متأخرة قليلاً
  setTimeout(updateAdvice, 400);
})();
