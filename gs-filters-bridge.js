/* gs-filters-bridge.js */
(function () {
  const byId = (id) => document.getElementById(id);
  const getNyToggle = () =>
    byId('disableNyFilter') || byId('toggleNyHours') || byId('nyFilterToggle');
  const getPivotToggle = () =>
    byId('disablePivotFilter') || byId('togglePivotFilter') || byId('pivotFilterToggle');

  function filtersDisabledNow() {
    const ny = getNyToggle(), pv = getPivotToggle();
    return !!((ny && ny.checked) || (pv && pv.checked));
  }

  function rewriteAdviceIfNeeded(root) {
    if (!root) root = document.body;
    const disabled = filtersDisabledNow();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n.nodeValue && n.nodeValue.includes('مرفوض بالفلاتر')) targets.push(n);
    }
    targets.forEach(n => {
      if (disabled) {
        n.nodeValue = n.nodeValue.replace('مرفوض بالفلاتر', 'تنبيه: كانت ستُرفض بالفلاتر');
      }
    });
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) rewriteAdviceIfNeeded(m.target || document.body);
    }
  });

  function start() {
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    rewriteAdviceIfNeeded(document.body);
    [getNyToggle(), getPivotToggle()].forEach(ctrl => {
      if (ctrl) ctrl.addEventListener('change', () => rewriteAdviceIfNeeded(document.body));
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();