/* GoldSignals → Worker bridge (صغير وآمن) */
(function () {
  // ⚠️ ضع رابط الوركر الخاص فيك:
  const WORKER_URL = "https://workerjs.samer-mourtada.workers.dev/alert";

  function notifyFromAdviceText(text) {
    try {
      if (!text) return;

      // تجاهل الحالات غير الحقيقية
      if (text.includes("لا توجد نصيحة") || text.includes("الملخص") || text.includes("مرفوض")) return;

      // اكتشاف الإشارة الفعلية (شراء/بيع)
      const m = text.match(/الإشارة:\s*(شراء|بيع)/);
      if (!m) return;

      const sideMap = { "شراء": "BUY", "بيع": "SELL" };
      const payload = {
        side: sideMap[m[1]],
        tf: (window.currentTF || window.TF || null),
        price: (document.getElementById("livePrice")?.textContent || "").replace(/[^\d.]/g, "") || null,
        ts: Date.now()
      };

      fetch(WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (err) {
      console.error("notifyFromAdviceText error:", err);
    }
  }

  // راقب نصّ النصيحة لالتقاط أي تغيير
  const target = document.getElementById("adviceText");
  if (target && !target.__gsNotifyWired) {
    const mo = new MutationObserver(() => notifyFromAdviceText(target.textContent || ""));
    mo.observe(target, { childList: true, subtree: true, characterData: true });
    target.__gsNotifyWired = true;
    // فحص أوّل مرة
    notifyFromAdviceText(target.textContent || "");
  }
})();
