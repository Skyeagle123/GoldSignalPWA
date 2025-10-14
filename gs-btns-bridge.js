/* gs-btns-bridge.js
   جسر خارجي لتحريك زري استيراد/تنزيل CSV أسفل اسم المشروع
   بدون تعديل ملفاتك الأصلية. حمّله بعد سكربت التطبيق في index.html.
*/
(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function getTitleEl() {
    return byId('appTitle')
        || $('[data-app-title]')
        || $('.app-title')
        || $('header h1')
        || $('h1');
  }

  function getImportBtn() {
    const direct = $('[data-action="import-csv"]') 
                || byId('importCsvBtn')
                || $('.btn-import-csv');
    if (direct) return direct;
    const candidates = $$('a,button');
    const rx = /(استيراد\s*CSV|CSV\s*استيراد|Import\s*CSV)/i;
    return candidates.find(b => (b.textContent||'').trim().match(rx)) || null;
  }

  function getDownloadBtn() {
    const direct = $('[data-action="download-merged"]')
                || byId('downloadMergedCsv')
                || $('.btn-download-merged');
    if (direct) return direct;
    const candidates = $$('a,button');
    const rx = /(تنزيل\s*CSV\s*المدموج|CSV\s*المدموج|Download\s*Merged\s*CSV)/i;
    return candidates.find(b => (b.textContent||'').trim().match(rx)) || null;
  }

  function injectCssOnce() {
    if (byId('gsBtnsBridgeStyle')) return;
    const css = `
      #csvBtnsBar{
        display:flex;gap:.5rem;flex-wrap:wrap;
        justify-content:center;align-items:center;
        margin-top:.5rem;margin-bottom:.75rem;
      }
      #csvBtnsBar .btn, #csvBtnsBar button, #csvBtnsBar a{
        position: static !important; inset: auto !important;
      }
    `;
    const st = document.createElement('style');
    st.id = 'gsBtnsBridgeStyle';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function moveButtons() {
    const title = getTitleEl();
    if (!title) return;

    let bar = byId('csvBtnsBar');
    if (!bar){
      bar = document.createElement('div');
      bar.id = 'csvBtnsBar';
      title.insertAdjacentElement('afterend', bar);
    }

    const importBtn = getImportBtn();
    const downloadBtn = getDownloadBtn();

    [importBtn, downloadBtn].forEach(btn => {
      if (!btn) return;
      btn.style.position = 'static';
      btn.style.top = btn.style.right = btn.style.left = btn.style.bottom = '';
      const toMove = btn.closest('a,button') || btn;
      if (toMove.parentElement !== bar) bar.appendChild(toMove);
    });
  }

  function start() {
    injectCssOnce();
    moveButtons();
    const mo = new MutationObserver(() => moveButtons());
    mo.observe(document.body, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once:true });
  } else {
    start();
  }
})();
