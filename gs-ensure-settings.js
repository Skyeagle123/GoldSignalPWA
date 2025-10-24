/* gs-ensure-settings.js — guarantee Data Settings card presence & visibility */
(function(){
  function buildCard(){
    var html = ''
      + '<div class="tight card" data-gs="market-state-row">'
      + '  <h3>إعدادات البيانات</h3>'
      + '  <div class="row-wrap" id="csvControls" style="margin:12px 0;"></div>'
      + '  <div class="grid-compact">'
      + '    <div>'
      + '      <label>رابط CSV للأسعار (اختياري):</label>'
      + '      <input id="csvInput" placeholder="اتركه فاضي لاستخدام XAUUSD_5min.csv من نفس المجلد"/>'
      + '      <div class="hint">إذا تُرك فاضي سيتم تلقائيًا استعمال <code>XAUUSD_5min.csv</code>.</div>'
      + '    </div>'
      + '    <div>'
      + '      <label>الإطار الزمني:</label>'
      + '      <div class="tabs">'
      + '        <button class="t" id="tf5">5 دقائق</button>'
      + '        <button class="t" id="tf30">30 دقيقة</button>'
      + '        <button class="t" id="tf60">ساعة</button>'
      + '        <button class="t" id="tfD">(NY) يوم</button>'
      + '      </div>'
      + '    </div>'
      + '    <div>'
      + '      <label class="muted"><input id="autoInd" type="checkbox"> Auto indicators (context-aware)</label>'
      + '      <div class="hint">إذا مُفعّل: يختار المؤشرات تلقائيًا بحسب الترند/التذبذب ويعلّم عليها.</div>'
      + '    </div>'
      + '    <div>'
      + '      <label class="muted"><input id="proMode" type="checkbox"> وضع دقيق (Precise)</label>'
      + '      <label class="muted"><input id="mtfConfirm" type="checkbox" checked> تأكيد متعدد الأطر (MTF)</label>'
      + '      <div class="row-wrap" style="margin-top:8px">'
      + '        <label class="muted"><input id="toggleNyHours" type="checkbox"> تعطيل فلتر ساعات نيويورك</label>'
      + '        <label class="muted"><input id="togglePivotFilter" type="checkbox"> تعطيل فلتر الاقتراب من Pivot</label>'
      + '      </div>'
      + '      <small class="muted" id="nyFilterNote" style="display:block;opacity:.85;margin-top:4px">عند التفعيل: سيتم <b>تعطيل</b> فلتر ساعات نيويورك</small>'
      + '      <small class="muted" id="pivotFilterNote" style="display:block;opacity:.85">عند التفعيل: سيتم <b>تعطيل</b> فلتر القرب من محاور Pivot</small>'
      + '    </div>'
      + '    <div style="display:flex;align-items:flex-end">'
      + '      <button class="pill" id="runBtn">حساب الإشارات الآن</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';
    var wrap = document.querySelector('main.wrap') || document.querySelector('main') || document.body;
    var tmp = document.createElement('div'); tmp.innerHTML = html;
    var card = tmp.firstChild;
    wrap.insertBefore(card, wrap.firstChild);
    return card;
  }

  function reveal(){
    var card = document.querySelector('[data-gs="market-state-row"]') || buildCard();
    if (!card) return;
    card.style.display = 'block';
    card.hidden = false;
    card.style.visibility = 'visible';
  }

  // First reveal
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reveal, {once:true});
  } else {
    reveal();
  }
  // Re-reveal on changes
  try{
    var mo = new MutationObserver(reveal);
    mo.observe(document.body || document.documentElement, {childList:true, subtree:true});
  }catch(e){}
  setTimeout(reveal, 400);
  setTimeout(reveal, 1500);
})();