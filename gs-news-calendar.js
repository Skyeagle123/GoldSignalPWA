(function attachNewsCalendar(root) {
  'use strict';

  const WORKER_BASE='https://goldsignalsx-worker.samer-mourtada.workers.dev';

  function escapeHtml(value) {
    return String(value??'').replace(/[&<>"']/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[char]);
  }

  function countdown(eventAt,now=Date.now()) {
    const delta=Number(eventAt)-now,absolute=Math.abs(delta);
    const minutes=Math.floor(absolute/60_000),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
    const text=days?`${days}ي ${hours%24}س`:hours?`${hours}س ${minutes%60}د`:`${minutes}د`;
    return delta>=0?`بعد ${text}`:`منذ ${text}`;
  }

  async function getJson(path,fetchImpl=root.fetch.bind(root)) {
    const response=await fetchImpl(`${WORKER_BASE}${path}`,{method:'GET',mode:'cors',cache:'no-store'});
    const payload=await response.json().catch(()=>null);
    if (!response.ok||!payload?.ok) throw new Error(payload?.error||`HTTP ${response.status}`);
    return payload;
  }

  function renderCalendar(payload,now=Date.now()) {
    const risk=document.getElementById('newsRiskBanner'),rows=document.getElementById('calendarRows');
    if (!risk||!rows) return;
    risk.textContent=payload.risk?.active
      ? `⚠️ نافذة مخاطر عالية فعّالة: ${payload.risk.reason}`
      : '✅ لا توجد نافذة High-impact فعّالة حاليًا';
    risk.style.color=payload.risk?.active?'var(--warn)':'var(--good)';
    const events=(payload.events||[]).filter(event=>event.eventAt>=now-24*60*60_000).slice(0,12);
    rows.innerHTML=events.length?events.map(event=>`<tr>
      <td>${escapeHtml(event.name)}</td><td>${escapeHtml(event.eventAtLocal||event.eventAtUtc)}</td>
      <td>${escapeHtml(countdown(event.eventAt,now))}</td><td>${escapeHtml(event.impact)}</td>
      <td>${escapeHtml(event.actual??'—')}</td><td>${escapeHtml(event.forecast??'—')}</td><td>${escapeHtml(event.previous??'—')}</td>
    </tr>`).join(''):'<tr><td colspan="7" class="muted">لا توجد أحداث متاحة حاليًا</td></tr>';
  }

  function renderNews(payload) {
    const target=document.getElementById('newsContextList');
    if (!target) return;
    const label={bullish:'Bullish for Gold',bearish:'Bearish for Gold',mixed:'Mixed/Conflicting',informational:'Informational',neutral:'Informational'};
    target.innerHTML=(payload.items||[]).slice(0,6).map(item=>`<div style="padding:8px 0;border-bottom:1px solid #1f2937">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">${escapeHtml(item.titleAr||item.title)}</a>
      <div class="hint">${escapeHtml(label[item.direction]||'Informational')} • confidence ${Number(item.confidence||0).toFixed(0)}% • ${escapeHtml(item.source)} • ${escapeHtml(new Date(item.publishedAt).toLocaleString('ar-LB'))}</div>
    </div>`).join('')||'<div class="muted">لا توجد أخبار مهمة حاليًا</div>';
  }

  async function refreshNewsCalendar(fetchImpl=root.fetch.bind(root)) {
    const status=document.getElementById('newsCalendarStatus');
    try {
      const [calendar,news]=await Promise.all([getJson('/calendar?limit=100',fetchImpl),getJson('/news',fetchImpl)]);
      renderCalendar(calendar);renderNews(news);
      if (status) status.textContent=`آخر تحديث: ${new Date(Math.max(Number(calendar.updatedAt||0),Number(news.updatedAt||0))).toLocaleString('ar-LB')}`;
      return {calendar,news};
    } catch (error) {
      if (status) status.textContent=`تعذّر تحديث الأخبار/الرزنامة: ${error.message}`;
      throw error;
    }
  }

  root.GoldSignalsNewsCalendar=Object.freeze({WORKER_BASE,getJson,countdown,refreshNewsCalendar});
  if (root.document) {
    root.addEventListener('DOMContentLoaded',()=>{
      refreshNewsCalendar().catch(()=>{});
      root.setInterval(()=>refreshNewsCalendar().catch(()=>{}),5*60_000);
    });
  }
})(typeof window!=='undefined'?window:globalThis);
