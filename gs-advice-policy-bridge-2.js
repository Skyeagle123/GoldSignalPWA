
/*! gs-advice-policy-bridge.js v3
 *  - يعالج نص "نصيحة الدخول/الخروج" بناءً على حالة الفلاتر
 *  - يذكر أسباب الرفض إن وُجدت، أو يستنتجها من حالة الفلاتر
 *  - لا يغيّر أي منطق حسابي؛ عرض فقط
 */
(function () {
  "use strict";

  // ====== أدوات مساعدة ======
  function norm(s) {
    return (s || "").toString().replace(/\s+/g, " ").trim();
  }

  function mapReason(raw) {
    const s = norm(raw);
    if (!s) return null;
    // خرائط الكلمات المفتاحية -> سبب موحّد
    const L = s.toLowerCase();
    if (/(نيويورك|ny)/i.test(s)) return "ساعات نيويورك";
    if (/pivot|الاقتراب|قريب/i.test(s)) return "قرب Pivot";
    if (/atr/i.test(s)) return "ATR% خارج النطاق";
    if (/mtf|تأكيد/i.test(s)) return "فشل تأكيد MTF";
    return s; // احتفظ بالنص إن ما قدرنا نطبّعه
  }

  function uniq(arr) {
    return [...new Set(arr.filter(Boolean))];
  }

  // ابحث عن عنصر عنوان "نصيحة الدخول/الخروج"
  function findAdviceContainer() {
    const all = Array.from(document.querySelectorAll("section,div"));
    // دور على عنصر يحتوي العنوان
    const header = all.find(el => /نصيحة\s*الدخول\/الخروج/i.test(el.textContent || ""));
    if (!header) return null;

    // نص النصيحة غالباً داخل نفس الصندوق بعد العنوان
    // نحاول العثور على فقرة/ديف فيها حقول SL/TP/ATR
    const candidates = Array.from(header.querySelectorAll("p,div,span"))
      .filter(el => /(SL|TP1|TP2|ATR|الملخص|إطار|آخر\s*سعر)/i.test(el.textContent || ""));

    // أول مرشح معقول
    return candidates[0] || header;
  }

  function getFiltersState() {
    // نقرأ حالة شيكبكسات "تعطيل فلتر ..." (إذا Checked => الفلتر مُعطّل)
    let nyDisabled = null;
    let pivotDisabled = null;

    const labels = Array.from(document.querySelectorAll("label,div,span,p"));
    labels.forEach(lbl => {
      const txt = norm(lbl.textContent || "");
      // ابحث في أسرة العنصر عن input[type=checkbox]
      const input = lbl.querySelector("input[type=checkbox]") ||
                    lbl.parentElement?.querySelector("input[type=checkbox]");

      if (!input) return;

      if (/تعطيل\s*فلتر\s*ساعات\s*نيويورك/i.test(txt)) {
        nyDisabled = !!input.checked;
      }
      if (/تعطيل\s*فلتر\s*الاقتراب\s*من\s*Pivot/i.test(txt)) {
        pivotDisabled = !!input.checked;
      }
    });

    // إن لم نجد شيئاً نعتبرها غير معروفة
    return {
      nyDisabled,       // true => فلتر NY مُعطّل
      pivotDisabled,    // true => فلتر Pivot مُعطّل
      filtersEnabled: (nyDisabled === false) || (pivotDisabled === false) // أي فلتر فعّال
    };
  }

  function extractReasonsFromText(txt) {
    if (!txt) return [];
    // نمط "مرفوض بالفلاتر: أسباب ..." أو "ستُرفض بالفلاتر: أسباب ..."
    const m = txt.match(/(?:مرفوض|ستُرفض)[^:]*:\s*([^.،\)]+(?:[^.)])?)/i);
    if (!m) return [];
    let list = m[1];

    // قسم بالواو أو الفواصل
    let parts = list.split(/[،,]|و\s+/g).map(x => mapReason(x));
    return uniq(parts);
  }

  function reasonsFallbackGuess(adviceTxt, filtersState) {
    const guess = [];
    const hasNY = /(نيويورك|NY)/i.test(adviceTxt || "") || (filtersState.filtersEnabled && filtersState.nyDisabled === false);
    const hasPivot = /(Pivot|الاقتراب)/i.test(adviceTxt || "") || (filtersState.filtersEnabled && filtersState.pivotDisabled === false);
    if (hasNY) guess.push("ساعات نيويورك");
    if (hasPivot) guess.push("قرب Pivot");
    return uniq(guess);
  }

  function buildAdviceText(base, mode, reasonsArr) {
    const reasons = reasonsArr && reasonsArr.length ? reasonsArr.join(" + ") : "أسباب غير متاحة";
    if (mode === "virtual") {
      // الفلاتر مُعطّلة لكن يوجد أسباب رفض => دخول افتراضي
      return `${base} (إطلاع فقط) دخول افتراضي — أسباب: ${reasons}`;
    }
    if (mode === "none") {
      // الفلاتر مُفعّلة والرفض قائم => لا توجد نصيحة
      return `لا توجد نصيحة. أسباب: ${reasons}`;
    }
    // confirmed
    return `${base} (دخول)`;
  }

  function rewriteAdvice() {
    const box = findAdviceContainer();
    if (!box) return;

    let txt = norm(box.textContent || "");
    if (!txt) return;
    // امنع التكرار
    if (box.dataset.gsAdviceApplied === "1") return;

    // هل يوجد رفض؟
    const isRejected = /(مرفوض|ستُرفض)\s*بالفلاتر/i.test(txt);

    // حالة الفلاتر
    const filtersState = getFiltersState();

    // استخرج الأسباب
    let reasons = extractReasonsFromText(txt);
    if (!reasons.length && isRejected) {
      reasons = reasonsFallbackGuess(txt, filtersState);
    }

    // حدد الوضع
    let mode = null;
    if (isRejected) {
      if (filtersState.filtersEnabled) {
        mode = "none"; // فلاتر مفعلة
      } else {
        mode = "virtual"; // فلاتر مُعطّلة
      }
    } else {
      // لا رفض ظاهر: إذا لم نجد "بيع/شراء" أو SL/TP قد تكون لا توجد نصيحة
      const hasSignalKeywords = /(بيع|شراء)/.test(txt);
      const hasLevels = /(SL|TP1|TP2)/i.test(txt);
      if (!hasSignalKeywords && !hasLevels) {
        box.textContent = "لا توجد نصيحة.";
        box.dataset.gsAdviceApplied = "1";
        return;
      }
      mode = "confirmed";
    }

    // ابن النص الجديد
    const base = txt.replace(/\s*\(.*?\)\s*$/, ""); // نزّل أي تعليقات سابقة بين قوسين
    const finalTxt = buildAdviceText(base, mode, reasons);

    box.textContent = finalTxt;
    box.dataset.gsAdviceApplied = "1";
  }

  // شغّل على التحميل
  document.addEventListener("DOMContentLoaded", function () {
    try { rewriteAdvice(); } catch (e) { console.warn("gs-bridge rewriteAdvice error:", e); }
  });

  // راقب التغييرات (يُحدث النص بعد كل تحديث)
  const mo = new MutationObserver(() => {
    try { rewriteAdvice(); } catch (e) {}
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

})();
