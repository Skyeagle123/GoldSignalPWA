// GoldSignals Worker Bridge (manual.auto.v2)
// يرسل تنبيه تلغرام يدوي حتى لو الحالة "إطلاع فقط"

async function sendManualTelegramAlert() {
  try {
    const adviceBox = document.querySelector(".advice-box, .signal-box");
    let entry, tp1, tp2, sl;

    if (window.__lastLinesForChart) {
      entry = __lastLinesForChart.entry;
      tp1 = __lastLinesForChart.tp1;
      tp2 = __lastLinesForChart.tp2;
      sl = __lastLinesForChart.sl;
    } else if (adviceBox) {
      const text = adviceBox.textContent;
      entry = parseFloat(text.match(/دخول[:：]\s*([\d\.]+)/)?.[1]);
      tp1 = parseFloat(text.match(/TP1[\/TP2]*[:：]\s*([\d\.]+)/)?.[1]);
      tp2 = parseFloat(text.match(/TP2[:：]\s*([\d\.]+)/)?.[1]);
      sl = parseFloat(text.match(/SL[:：]\s*([\d\.]+)/)?.[1]);
    }

    if (!entry || !tp1 || !tp2 || !sl) {
      alert("⚠️ لم أستطع قراءة الأهداف/الوقف بدقة، تأكد أن النص موجود.");
      return;
    }

    const payload = {
      side: "BUY",
      tf: window.__activeTF || "30m",
      entry, tp1, tp2, sl
    };

    const resp = await fetch("https://workerjs.samer-mourtada.workers.dev/alert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    console.log("[GS][MANUAL]", payload, data);
    alert("✅ تم إرسال تنبيه التلغرام بنجاح.");
  } catch (err) {
    console.error("[GS][MANUAL ERROR]", err);
    alert("❌ حصل خطأ أثناء الإرسال.");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("sendAlertBtn");
  if (btn) btn.onclick = sendManualTelegramAlert;
});