/* SoftCreation — saved quotation PDF native-print repair (2026-11-12).
 * Keep the existing .paper letterhead / absolute body/footer layout intact.
 * Avoid the html2canvas loop and the costly DOM-measurement paginator.
 * Only quotation PDF actions use this handler; PI and other PDFs untouched.
 */
(function () {
  'use strict';
  const previousDownload = window.downloadDocPDF;
  let printing = false;
  let cleanupTimer = null;

  function clone(el) { return el.cloneNode(true); }
  function makePage(source, first, pageNo) {
    const paper = document.createElement('div');
    paper.className = 'paper sc-native-quote-page';
    const body = document.createElement('div');
    body.className = 'docbody';
    if (first) {
      const head = source.querySelector('.docbody > .dochead');
      const customer = source.querySelector('.docbody > .customerbox');
      if (head) body.appendChild(clone(head));
      if (customer) body.appendChild(clone(customer));
    } else {
      const heading = document.createElement('div');
      heading.className = 'docsection';
      heading.textContent = 'QUOTATION — CONTINUED';
      body.appendChild(heading);
    }
    paper.appendChild(body);
    const footer = source.querySelector('.docfoot');
    if (footer) {
      const copy = clone(footer);
      copy.dataset.scPageNo = String(pageNo);
      paper.appendChild(copy);
    }
    return {paper, body};
  }
  function appendChunkedTable(ctx, sourceTable, rows, chunkSize, label) {
    const title = document.createElement('div');
    title.className = 'docsection';
    title.textContent = label;
    ctx.body.appendChild(title);
    const table = clone(sourceTable);
    let tbody = table.querySelector('tbody');
    if (!tbody) { tbody = document.createElement('tbody'); table.appendChild(tbody); }
    tbody.replaceChildren();
    for (const row of rows.slice(0, chunkSize)) tbody.appendChild(clone(row));
    ctx.body.appendChild(table);
  }
  function makePages(doc) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(buildDocHTML(doc, true) || '');
    const bodySource = tpl.content.querySelector('.docbody');
    if (!bodySource) throw new Error('Quotation body could not be rendered');
    const source = tpl.content;
    const children = [...bodySource.children].filter(el =>
      !el.classList.contains('dochead') && !el.classList.contains('customerbox'));
    const pages = [];
    const newPage = () => {
      const ctx = makePage(source, pages.length === 0, pages.length + 1);
      pages.push(ctx);
      return ctx;
    };
    let ctx = newPage();

    if (doc.category === 'device') {
      const cards = children.filter(el => el.classList.contains('device-quote-card'));
      const pre = children.filter(el => !el.classList.contains('device-quote-card') &&
        !el.classList.contains('commercial-summary') && !el.classList.contains('terms') &&
        !el.classList.contains('benefit'));
      for (const el of pre) ctx.body.appendChild(clone(el));
      cards.forEach((card, i) => {
        if (i > 0) ctx = newPage();
        ctx.body.appendChild(clone(card));
      });
      const tail = children.filter(el => el.classList.contains('commercial-summary') ||
        el.classList.contains('terms') || el.classList.contains('benefit'));
      if (tail.length) {
        // Place terms and commercial summary on their own A4 letterhead page.
        ctx = newPage();
        tail.forEach(el => ctx.body.appendChild(clone(el)));
      }
    } else {
      const table = children.find(el => el.classList.contains('doctable'));
      const rows = table ? [...table.querySelectorAll('tbody > tr')] : [];
      const banner = children.filter(el => el.classList.contains('pricing-banner'));
      banner.forEach(el => ctx.body.appendChild(clone(el)));
      if (table) {
        let offset = 0;
        while (offset < rows.length || offset === 0) {
          if (offset > 0) ctx = newPage();
          const capacity = offset === 0 ? 5 : 10;
          const section = children.find(el => el.classList.contains('docsection'));
          appendChunkedTable(ctx, table, rows.slice(offset), capacity,
            section?.textContent || 'PRODUCTS & COMMERCIAL SUMMARY');
          offset += capacity;
          if (rows.length === 0) break;
        }
      }
      const tail = children.filter(el => !el.classList.contains('doctable') &&
        !el.classList.contains('docsection') && !el.classList.contains('pricing-banner'));
      if (tail.length) {
        ctx = newPage();
        tail.forEach(el => ctx.body.appendChild(clone(el)));
      }
    }
    const count = pages.length;
    pages.forEach((page, i) => {
      const footer = page.paper.querySelector('.docfoot');
      if (footer) {
        const stamp = document.createElement('span');
        stamp.className = 'sc-native-page-count';
        stamp.textContent = 'Page ' + (i + 1) + ' / ' + count;
        footer.appendChild(stamp);
      }
    });
    return pages.map(p => p.paper);
  }

  function openSavedQuotePrint(doc) {
    if (printing) { if (typeof toast === 'function') toast('Quotation print is already open.'); return; }
    const host = document.getElementById('printHost');
    if (!host) { if (typeof toast === 'function') toast('Print host not found.'); return; }
    printing = true;
    try {
      const pages = makePages(doc);
      const stack = document.createElement('div');
      stack.className = 'sc-native-quotation-print-stack';
      pages.forEach(page => stack.appendChild(page));
      host.replaceChildren(stack);
      host.style.display = 'block';
      const remove = () => {
        if (cleanupTimer) clearTimeout(cleanupTimer);
        cleanupTimer = null;
        host.style.display = 'none';
        host.replaceChildren();
        printing = false;
        window.removeEventListener('afterprint', remove);
      };
      window.addEventListener('afterprint', remove, {once:true});
      // Let the browser paint the original document structure before printing.
      setTimeout(() => {
        try { window.print(); }
        catch (e) { console.error('Native quotation print failed', e); remove(); }
      }, 150);
      // Conservative fallback in case the browser never emits afterprint.
      cleanupTimer = setTimeout(remove, 120000);
      if (typeof toast === 'function') toast('Choose Save as PDF in the print dialog.');
    } catch (e) {
      console.error('Could not prepare quotation PDF', e);
      host.style.display = 'none';
      host.replaceChildren();
      printing = false;
      if (typeof toast === 'function') toast('Unable to prepare quotation PDF: ' + e.message);
    }
  }

  const replacement = function (doc) {
    if (doc && doc.type === 'Q') return openSavedQuotePrint(doc);
    return previousDownload.apply(this, arguments);
  };
  window.downloadDocPDF = replacement;
  try { downloadDocPDF = replacement; } catch (_) { }
})();
