/* SoftCreation Professional Dashboard BI Suite
 * Modern SVG Donut Circles, Radial Progress Gauges, Trend Analytics & Team Velocity.
 * Read-only; uses state cache without DB writes.
 */
(function(){
  'use strict';

  const byId = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = v => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const money = v => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let page = 1, perPage = 10, lastSignature = '';

  // Pagination for the date filter report table
  function paginate(reset){
    const box = byId('dashResults');
    if (!box) return;
    const table = box.querySelector('table');
    const old = byId('scDashPager');
    if (old) old.remove();
    if (!table) return;

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const signature = rows.length + '|' + (byId('dashFrom')?.value || '') + '|' + (byId('dashTo')?.value || '') + '|' + (rows[0]?.textContent || '').slice(0, 70);
    if (reset || signature !== lastSignature) page = 1;
    lastSignature = signature;

    const pages = Math.max(1, Math.ceil(rows.length / perPage));
    page = Math.max(1, Math.min(page, pages));

    rows.forEach((row, i) => {
      row.style.display = (i >= (page - 1) * perPage && i < page * perPage) ? '' : 'none';
    });

    const nav = document.createElement('div');
    nav.id = 'scDashPager';
    nav.className = 'sc-dash-pager';
    nav.innerHTML = `
      <span>Showing ${(rows.length ? ((page - 1) * perPage + 1) : 0)}–${Math.min(page * perPage, rows.length)} of ${rows.length}</span>
      <div class="sc-dash-pager-actions">
        <label>Rows <select id="scDashPageSize" aria-label="Dashboard report rows per page">
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
        </select></label>
        <button class="btn ghost sm" id="scDashPrev" ${page === 1 ? 'disabled' : ''}>Previous</button>
        <strong>Page ${page} / ${pages}</strong>
        <button class="btn ghost sm" id="scDashNext" ${page === pages ? 'disabled' : ''}>Next</button>
      </div>
    `;
    box.appendChild(nav);
    byId('scDashPageSize').value = String(perPage);
    byId('scDashPageSize').onchange = e => { perPage = Number(e.target.value) || 10; page = 1; paginate(false); };
    byId('scDashPrev').onclick = () => { page--; paginate(false); };
    byId('scDashNext').onclick = () => { page++; paginate(false); };
  }

  function visibleDocs(){
    const docs = window.state?.docs || [];
    const from = byId('dashFrom')?.value || '';
    const to = byId('dashTo')?.value || '';
    return docs.filter(d => {
      try {
        return (typeof visibleToCurrent !== 'function' || visibleToCurrent(d)) &&
          (!from || String(d.date || '') >= from) &&
          (!to || String(d.date || '') <= to) &&
          !d.replacedBy;
      } catch (_) { return false; }
    });
  }

  // Modern SVG Donut Chart with center metric
  function renderSvgDonut(segments, centerNumber, centerLabel, size = 150){
    const radius = 38;
    const circ = 2 * Math.PI * radius; // 238.76
    const total = segments.reduce((s, x) => s + (x.value || 0), 0);
    let offset = 0;

    const circles = total > 0 ? segments.map(seg => {
      const val = seg.value || 0;
      const dash = (val / total) * circ;
      const currentOffset = offset;
      offset += dash;
      return `<circle cx="50" cy="50" r="${radius}" fill="none" stroke="${seg.color}" stroke-width="12" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="-${currentOffset}" style="transition:stroke-dasharray 0.4s ease;cursor:pointer"><title>${esc(seg.label)}: ${fmt(val)} (${total ? (val / total * 100).toFixed(1) : 0}%)</title></circle>`;
    }).join('') : `<circle cx="50" cy="50" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="12"></circle>`;

    return `
      <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg viewBox="0 0 100 100" style="width:100%;height:100%;transform:rotate(-90deg)">
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="12"></circle>
          ${circles}
        </svg>
        <div style="position:absolute;text-align:center;pointer-events:none">
          <div style="font-size:18px;font-weight:900;color:#0f172a;line-height:1.1">${centerNumber}</div>
          <div style="font-size:10px;color:#64748b;font-weight:600;margin-top:2px">${centerLabel}</div>
        </div>
      </div>
    `;
  }

  // Modern SVG Circular Radial Progress Gauge
  function renderRadialGauge(percentage, label, subtext, color = '#078f92', size = 130){
    const radius = 38;
    const circ = 2 * Math.PI * radius;
    const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
    const dash = (pct / 100) * circ;

    return `
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center">
        <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">
          <svg viewBox="0 0 100 100" style="width:100%;height:100%;transform:rotate(-90deg)">
            <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="10"></circle>
            <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="0" style="transition:stroke-dasharray 0.5s ease-in-out"></circle>
          </svg>
          <div style="position:absolute;text-align:center">
            <div style="font-size:20px;font-weight:900;color:#0f172a">${pct.toFixed(1)}%</div>
            <div style="font-size:9px;font-weight:800;color:${color};letter-spacing:0.4px;text-transform:uppercase">${label}</div>
          </div>
        </div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;font-weight:600">${subtext}</div>
      </div>
    `;
  }

  // Modern Professional Bar Chart
  function modernBarChart(data, maxBars = 10){
    const values = data.slice(-maxBars);
    const peak = Math.max(1, ...values.map(x => x.value));

    return `
      <div style="display:flex;align-items:flex-end;gap:12px;height:160px;padding:12px 6px 0;box-sizing:border-box;border-bottom:2px solid #e2e8f0;margin-bottom:8px">
        ${values.map(x => {
          const heightPct = Math.max(4, Math.round((x.value / peak) * 100));
          return `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;gap:4px" title="${esc(x.label)}: ${fmt(x.value)} docs">
              <span style="font-size:10px;font-weight:700;color:#087f83">${fmt(x.value)}</span>
              <div style="width:100%;max-width:28px;height:${heightPct}%;background:linear-gradient(180deg,#078f92 0%,#0e7490 100%);border-radius:6px 6px 0 0;box-shadow:0 2px 6px rgba(7,143,146,0.25);transition:height 0.4s ease"></div>
              <span style="font-size:10px;color:#64748b;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:44px;margin-top:2px">${esc(x.label)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function drawCharts(){
    const dash = byId('dashboard');
    if (!dash) return;

    let host = byId('scDashboardProcessCharts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'scDashboardProcessCharts';
      host.className = 'sc-dashboard-process-grid';
      host.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin:18px 0;';
      const resultsPanel = byId('dashResults')?.closest('.panel') || dash.querySelector('.panel');
      if (resultsPanel) resultsPanel.parentNode.insertBefore(host, resultsPanel.nextSibling);
      else dash.appendChild(host);
    }

    const docs = visibleDocs();
    const qs = docs.filter(d => d.type === 'Q');
    const pis = docs.filter(d => d.type === 'PI');
    const sos = (window.state?.salesOrders || []).filter(s => !window.scSOIsCancelledV57?.(s));
    const dos = window.state?.deliveryOrders || [];

    // Monthly Trend
    const monthly = new Map();
    const actors = new Map();
    const paymentModes = { cash: 0, credit: 0, vat18: 0 };

    for (const d of docs) {
      const month = String(d.date || '').slice(0, 7) || 'Unknown';
      monthly.set(month, (monthly.get(month) || 0) + 1);

      const actor = String(d.createdBy || d.createdByUser || 'Staff');
      actors.set(actor, (actors.get(actor) || 0) + 1);

      if (d.payMode === 'cash') paymentModes.cash++;
      else paymentModes.credit++;
      if (d.vatMode === 'vat18') paymentModes.vat18++;
    }

    const trend = Array.from(monthly, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
    const leaders = Array.from(actors, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5);
    const maxLeader = Math.max(1, ...leaders.map(x => x.value));

    // Conversion rate
    const quoteIds = new Set(qs.map(q => String(q.id)));
    const convertedPis = pis.filter(p => quoteIds.has(String(p.sourceQuoteId || p.source_quote_id || ''))).length;
    const conversionPct = qs.length ? Math.min(100, (convertedPis / qs.length) * 100) : 0;

    // Delivery Invoicing Rate
    const invoicedDos = dos.filter(d => d.status === 'Converted to Invoice').length;
    const doInvoicedPct = dos.length ? Math.min(100, (invoicedDos / dos.length) * 100) : 0;

    // Document mix segments
    const docMixSegments = [
      { label: 'Quotations', value: qs.length, color: '#078f92' },
      { label: 'Pro Forma', value: pis.length, color: '#3b82f6' },
      { label: 'Sales Orders', value: sos.length, color: '#f59e0b' },
      { label: 'Delivery Orders', value: dos.length, color: '#10b981' }
    ];
    const totalRecords = docMixSegments.reduce((s, x) => s + x.value, 0);

    // Payment mix segments
    const payMixSegments = [
      { label: 'Credit', value: paymentModes.credit, color: '#6366f1' },
      { label: 'Cash', value: paymentModes.cash, color: '#10b981' },
      { label: 'VAT 18%', value: paymentModes.vat18, color: '#f97316' }
    ];

    host.innerHTML = `
      <!-- CARD 1: Document Mix Circular Donut -->
      <section class="card" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;box-shadow:0 4px 16px rgba(15,23,42,0.04)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div>
            <h3 style="margin:0;font-size:15px;font-weight:800;color:#0f172a">Document Distribution</h3>
            <span style="font-size:11px;color:#64748b">Active Documents by Type</span>
          </div>
          <span class="tag sm blue">${fmt(totalRecords)} Total</span>
        </div>
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
          ${renderSvgDonut(docMixSegments, fmt(totalRecords), 'Documents', 145)}
          <div style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:8px">
            ${docMixSegments.map(s => {
              const p = totalRecords ? ((s.value / totalRecords) * 100).toFixed(1) : 0;
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">
                  <span style="display:flex;align-items:center;gap:6px">
                    <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block"></span>
                    ${esc(s.label)}
                  </span>
                  <b>${fmt(s.value)} <small style="color:#64748b;font-weight:normal">(${p}%)</small></b>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </section>

      <!-- CARD 2: Dual Performance Radial Gauges -->
      <section class="card" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;box-shadow:0 4px 16px rgba(15,23,42,0.04)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div>
            <h3 style="margin:0;font-size:15px;font-weight:800;color:#0f172a">Conversion & Velocity</h3>
            <span style="font-size:11px;color:#64748b">Workflow Conversion Gauges</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:center">
          ${renderRadialGauge(conversionPct, 'Conversion', 'Quotation → PI', '#078f92', 125)}
          ${renderRadialGauge(doInvoicedPct, 'Invoiced', 'Delivery → Invoice', '#10b981', 125)}
        </div>
        <div style="margin-top:14px;padding-top:10px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-around;font-size:11px;color:#64748b">
          <span><b>${convertedPis}</b> of <b>${qs.length}</b> PIs converted</span>
          <span><b>${invoicedDos}</b> of <b>${dos.length}</b> DOs invoiced</span>
        </div>
      </section>

      <!-- CARD 3: Monthly Activity Trend Bars -->
      <section class="card" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;box-shadow:0 4px 16px rgba(15,23,42,0.04)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div>
            <h3 style="margin:0;font-size:15px;font-weight:800;color:#0f172a">Monthly Activity Trend</h3>
            <span style="font-size:11px;color:#64748b">Volume of documents created per month</span>
          </div>
        </div>
        ${trend.length ? modernBarChart(trend) : '<p style="color:#64748b;font-size:12px;padding:40px 0;text-align:center">No document records found in this range.</p>'}
      </section>

      <!-- CARD 4: Team Activity Breakdown -->
      <section class="card" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;box-shadow:0 4px 16px rgba(15,23,42,0.04)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div>
            <h3 style="margin:0;font-size:15px;font-weight:800;color:#0f172a">Top Document Creators</h3>
            <span style="font-size:11px;color:#64748b">Operational activity distribution</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          ${leaders.length ? leaders.map(l => {
            const widthPct = Math.round((l.value / maxLeader) * 100);
            return `
              <div>
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                  <span style="font-weight:700;color:#1e293b">${esc(l.label)}</span>
                  <b>${fmt(l.value)} <span style="font-weight:normal;color:#64748b">docs</span></b>
                </div>
                <div style="height:8px;background:#f1f5f9;border-radius:999px;overflow:hidden">
                  <div style="width:${widthPct}%;height:100%;background:linear-gradient(90deg,#078f92,#38bdf8);border-radius:999px;transition:width 0.4s ease"></div>
                </div>
              </div>
            `;
          }).join('') : '<p style="color:#64748b;font-size:12px">No document creators recorded.</p>'}
        </div>
      </section>
    `;
  }

  // Hook into dashboard refresh and view changes
  const original = window.renderDashboardReport;
  if (typeof original === 'function') {
    window.renderDashboardReport = function(){
      const r = original.apply(this, arguments);
      paginate(true);
      drawCharts();
      return r;
    };
  }

  const show = window.showView;
  if (typeof show === 'function') {
    window.showView = function(id){
      const r = show.apply(this, arguments);
      if (id === 'dashboard' && byId('dashboard')?.classList.contains('active')) {
        paginate(false);
        drawCharts();
      }
      return r;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { paginate(true); drawCharts(); });
  } else {
    paginate(true);
    drawCharts();
  }

})();
