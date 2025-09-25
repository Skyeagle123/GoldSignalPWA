<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0b1220" />
  <title>إشارات الذهب - GoldSignals</title>

  <link rel="manifest" href="manifest.json" />
  <link rel="icon" href="icons/icon-192.png" />

  <style>
    body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,Cantarell,"Noto Sans",sans-serif;background:#0b1220;color:#e5e7eb}
    header{position:sticky;top:0;background:#0b1220cc;backdrop-filter:blur(6px);border-bottom:1px solid #1f2937;padding:12px 16px}
    h1{margin:0;font-size:20px}
    .container{max-width:980px;margin:0 auto;padding:16px}
    .card{background:#111827;border:1px solid #1f2937;border-radius:16px;padding:16px;margin:12px 0;box-shadow:0 6px 18px rgba(0,0,0,.25)}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
    .row{display:flex;gap:12px;flex-wrap:wrap}
    .col{flex:1 1 240px}
    label{display:block;margin:6px 2px;color:#9ca3af;font-size:13px}
    input,button,select{width:100%;padding:10px;border-radius:12px;border:1px solid #334155;background:#0b1220;color:#e5e7eb}
    button{cursor:pointer;font-weight:700}
    table{width:100%;border-collapse:collapse}
    th,td{border-bottom:1px solid #273449;padding:8px;text-align:center;font-size:14px;vertical-align:middle}
    .pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid #334155;background:#0b1220;font-size:12px;margin:4px 6px 0 0}
    .good{color:#10b981} .bad{color:#f87171} .warn{color:#f59e0b}
    .hint{opacity:.7;font-size:12px;margin-top:8px}
    .live{font-size:28px;font-weight:800;letter-spacing:.5px}
    .muted{opacity:.75}
  </style>
</head>
<body>
  <header>
    <h1>GoldSignals • إشارات الذهب</h1>
  </header>

  <div class="container">

    <!-- مصدر البيانات -->
    <div class="card">
      <div class="grid">
        <div class="col">
          <label for="csvUrl">رابط CSV للأسعار (اختياري)</label>
          <input id="csvUrl" placeholder="اتركه فاضي ليستخدم ملف 5 دقائق الافتراضي">
          <div class="hint">إذا تركته فاضي سيقرأ من <code>XAUUSD_5min.csv</code> من الريبو تلقائياً.</div>
        </div>
      </div>

      <!-- إعدادات المؤشرات -->
      <div class="grid" style="margin-top:12px">
        <div class="col">
          <label for="emaFast">EMA سريع</label>
          <input id="emaFast" type="number" value="12" />
        </div>
        <div class="col">
          <label for="emaSlow">EMA بطيء</label>
          <input id="emaSlow" type="number" value="26" />
        </div>
        <div class="col">
          <label for="rsiPeriod">فترة RSI</label>
          <input id="rsiPeriod" type="number" value="14" />
        </div>
      </div>

      <div class="row" style="margin-top:12px">
        <div class="col"><button id="runBtn">حساب الإشارات الآن</button></div>
      </div>

      <p class="hint">يحدّث نفسه كل 60 ثانية ويلتقط آخر صف من ملف الـCSV.</p>
    </div>

    <!-- السعر الحي -->
    <div class="card">
      <h3 style="margin-top:0">السعر الحي</h3>
      <div id="liveBox">
        <div class="muted">جاهز…</div>
      </div>
    </div>

    <!-- ملخص الإشارة -->
    <div class="card">
      <h3 style="margin-top:0">ملخّص الإشارة الآن</h3>
      <div id="summary" class="grid">
        <span class="pill">جاهز للحساب…</span>
      </div>
    </div>

    <!-- الدعم والمقاومة -->
    <div class="card">
      <h3 style="margin-top:0">جدول الدعم والمقاومة</h3>
      <div class="hint">محسوبة من آخر 24 ساعة تقريباً (اعتماداً على ملف 5 دقائق).</div>
      <div style="overflow:auto">
        <table id="srTable">
          <thead>
            <tr><th>المستوى</th><th>القيمة</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- جدول البيانات الأخيرة -->
    <div class="card">
      <h3 style="margin-top:0">البيانات الأخيرة</h3>
      <div style="overflow:auto">
        <table id="table">
          <thead></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

  </div>

  <script src="app.js"></script>
</body>
</html>
