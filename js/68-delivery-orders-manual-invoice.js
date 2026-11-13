/* SoftCreation SPGS — Delivery Orders & Manual Invoice Conversion Module
 * V1.0.0 (2026-11-13)
 * Full Delivery Order management with Admin permission toggle and Manual Invoice conversion.
 */
(function(){
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = () => new Date().toISOString().slice(0, 10);
  const byId = id => document.getElementById(id);

  // 1. Register permission in USER_FEATURES and VIEW_PERMS
  if (typeof USER_FEATURES !== 'undefined' && Array.isArray(USER_FEATURES)) {
    if (!USER_FEATURES.some(x => x[0] === 'delivery_orders_view')) {
      USER_FEATURES.push(['delivery_orders_view', 'Delivery Orders View & Convert', 'Sales']);
    }
  }
  if (typeof VIEW_PERMS !== 'undefined') {
    VIEW_PERMS.deliveryorders = 'delivery_orders_view';
  }

  function doCanView(){
    if (!window.currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (typeof hasPerm === 'function') return hasPerm('delivery_orders_view');
    return true;
  }

  function nextDoNumber(){
    const datePrefix = 'SC/DO/' + today().replace(/-/g, '');
    const existing = (state.deliveryOrders || []).filter(d => String(d.doNo || '').startsWith(datePrefix));
    const nextSeq = existing.length + 1;
    return `${datePrefix}/${String(nextSeq).padStart(3, '0')}`;
  }

  // 2. Navigation & View Injection
  function ensureDoUI(){
    if (byId('deliveryorders')) return;

    const nav = document.querySelector('.nav');
    const settingsBtn = nav?.querySelector('[data-view="settings"]');
    if (nav && !nav.querySelector('[data-view="deliveryorders"]')) {
      const btn = document.createElement('button');
      btn.className = 'navbtn';
      btn.dataset.view = 'deliveryorders';
      btn.textContent = 'Delivery Orders';
      btn.onclick = () => window.showView('deliveryorders');
      nav.insertBefore(btn, settingsBtn || null);
    }

    const section = document.createElement('section');
    section.id = 'deliveryorders';
    section.className = 'view';
    section.innerHTML = `
      <div class="panel">
        <div class="panel-title">
          <div style="display:flex;align-items:center;gap:12px">
            <span>Delivery Orders (DO)</span>
            <small style="color:#64748b;font-weight:normal;font-size:12px">Goods Dispatch & Manual Invoice Workflow</small>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn sm" type="button" style="background:#fff;color:#087f83" onclick="openDoCreateModal()">+ Create Delivery Order</button>
            <button class="btn sm ghost" type="button" onclick="renderDeliveryOrders()">Refresh</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="notice">
            <b>Delivery Order Workflow:</b> Record outbound goods dispatches, confirm customer receipt, and seamlessly convert Delivery Orders into <b>Manual Invoices</b>. Access to this tab is controlled in Admin User Permissions.
          </div>
          
          <div id="doKpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:14px 0"></div>
          
          <div class="listbar" style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
            <input class="search" id="doSearch" placeholder="Search DO No, customer, carrier, reference..." style="flex:1;min-width:240px" oninput="renderDeliveryOrders()"/>
            <select id="doFilterStatus" onchange="renderDeliveryOrders()" style="width:180px">
              <option value="">All Statuses</option>
              <option value="pending">Pending Invoice</option>
              <option value="invoiced">Converted to Invoice</option>
            </select>
          </div>
          
          <div id="doList"></div>
        </div>
      </div>
    `;

    const firstModal = document.querySelector('.modal');
    if (firstModal) firstModal.insertAdjacentElement('beforebegin', section);
    else document.querySelector('.app')?.appendChild(section);

    // Create Modal
    document.body.insertAdjacentHTML('beforeend', `
      <div id="doCreateModal" class="modal">
        <div class="modal-card" style="max-width:900px;width:95vw">
          <div class="modal-head">
            <div>
              <b id="doModalTitle">Create Delivery Order</b>
              <div class="small" style="color:#64748b">Outbound Goods Dispatch Note</div>
            </div>
            <button class="closex" type="button" onclick="closeModal('doCreateModal')">×</button>
          </div>
          <div class="modal-body">
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px;margin-bottom:14px;font-size:12px">
              <b>Fast Populate:</b> Import items and customer details directly from an existing Sales Order or Pro Forma:
              <div style="display:flex;gap:10px;margin-top:6px;align-items:center">
                <select id="doSourceDocSelect" style="flex:1" onchange="doSelectSourceDoc(this.value)">
                  <option value="">-- Or select an approved SO / PI to auto-fill --</option>
                </select>
              </div>
            </div>

            <div class="grid">
              <div class="field">
                <label>Customer *</label>
                <select id="doCustomerId" onchange="doCustomerSelected(this.value)"></select>
              </div>
              <div class="field">
                <label>DO Date *</label>
                <input id="doDate" type="date" value="${today()}">
              </div>
              <div class="field">
                <label>Carrier / Driver / Vehicle</label>
                <input id="doCarrier" placeholder="e.g. Courier / WP CAB-1234">
              </div>
              <div class="field">
                <label>Customer PO / Reference</label>
                <input id="doRef" placeholder="Customer reference / Order reference">
              </div>
              <div class="field full">
                <label>Delivery Address</label>
                <textarea id="doAddress" placeholder="Delivery destination address" style="min-height:48px"></textarea>
              </div>
            </div>

            <div class="section" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center">
              <span>Dispatched Items</span>
              <button class="btn sm ghost" type="button" onclick="doAddLineItem()">+ Add Item Row</button>
            </div>
            
            <table class="table" id="doItemsTable" style="margin-top:8px">
              <thead>
                <tr>
                  <th style="width:38%">Item Description</th>
                  <th style="width:18%">Size / Spec</th>
                  <th style="width:14%">Material</th>
                  <th style="width:12%">Quantity</th>
                  <th style="width:12%">Unit Price</th>
                  <th style="width:6%"></th>
                </tr>
              </thead>
              <tbody id="doItemsBody"></tbody>
            </table>

            <div class="field full" style="margin-top:12px">
              <label>Special Instructions / Delivery Notes</label>
              <textarea id="doNotes" placeholder="Delivery instructions, package count, condition, etc."></textarea>
            </div>

            <div class="actions" style="margin-top:16px">
              <button class="btn ghost" type="button" onclick="closeModal('doCreateModal')">Cancel</button>
              <button class="btn green" type="button" onclick="saveDeliveryOrder()">Save Delivery Order</button>
            </div>
          </div>
        </div>
      </div>

      <!-- View DO Note Modal -->
      <div id="doViewModal" class="modal">
        <div class="modal-card" style="max-width:850px;width:95vw;padding:0;overflow:hidden">
          <div class="modal-head" style="padding:14px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
            <div>
              <b id="doViewTitle">Delivery Order Note</b>
              <div id="doViewMeta" class="small" style="color:#64748b"></div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn green sm" type="button" onclick="window.print()">Print Note</button>
              <button class="closex" type="button" onclick="closeModal('doViewModal')">×</button>
            </div>
          </div>
          <div id="doViewContent" class="modal-body" style="padding:28px;background:#fff;max-height:80vh;overflow-y:auto"></div>
        </div>
      </div>
    `);
  }

  // 3. Render Delivery Orders List
  window.renderDeliveryOrders = function(){
    ensureDoUI();
    const host = byId('doList');
    if (!host) return;

    state.deliveryOrders = state.deliveryOrders || [];
    const orders = state.deliveryOrders;

    const q = (byId('doSearch')?.value || '').toLowerCase().trim();
    const fStatus = byId('doFilterStatus')?.value || '';

    const filtered = orders.filter(d => {
      const matchQ = !q || [d.doNo, d.customerName, d.carrier, d.sourceRef, ...(d.lines||[]).map(l=>l.desc)].join(' ').toLowerCase().includes(q);
      const matchS = !fStatus || (fStatus === 'pending' ? d.status === 'Pending Invoice' : d.status === 'Converted to Invoice');
      return matchQ && matchS;
    });

    // Render KPIs
    const pendingCount = orders.filter(d => d.status === 'Pending Invoice').length;
    const invoicedCount = orders.filter(d => d.status === 'Converted to Invoice').length;
    const totalVal = orders.reduce((s, d) => s + Number(d.total || 0), 0);

    const kpiHost = byId('doKpis');
    if (kpiHost) {
      kpiHost.innerHTML = `
        <div class="card" style="padding:12px;border:1px solid #cbd5e1"><div class="k">Total Delivery Orders</div><div class="v">${orders.length}</div><div class="sub">Total dispatches recorded</div></div>
        <div class="card" style="padding:12px;border:1px solid #fde68a;background:#fffbeb"><div class="k" style="color:#b45309">Pending Invoice</div><div class="v" style="color:#b45309">${pendingCount}</div><div class="sub">Awaiting manual invoice</div></div>
        <div class="card" style="padding:12px;border:1px solid #bbf7d0;background:#f0fdf4"><div class="k" style="color:#15803d">Invoiced</div><div class="v" style="color:#15803d">${invoicedCount}</div><div class="sub">Converted to Manual Invoice</div></div>
        <div class="card" style="padding:12px;border:1px solid #bfdbfe"><div class="k">Delivered Value</div><div class="v" style="font-size:19px">LKR ${money(totalVal)}</div><div class="sub">Total dispatch valuation</div></div>
      `;
    }

    if (!filtered.length) {
      host.innerHTML = '<div class="empty">No delivery orders found. Click "+ Create Delivery Order" to create a new delivery note.</div>';
      return;
    }

    host.innerHTML = `
      <div class="tablewrap"><table class="table">
        <thead>
          <tr>
            <th>DO Number / Date</th>
            <th>Customer / Contact</th>
            <th>Carrier / Reference</th>
            <th>Dispatched Items</th>
            <th>Value (LKR)</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(d => {
            const isPending = d.status === 'Pending Invoice';
            const linesSummary = (d.lines || []).map(l => `<div><b>${money(l.qty)} ${esc(l.unit||'Rolls')}</b> · ${esc(l.desc)} <small style="color:#64748b">${esc([l.size, l.material].filter(Boolean).join(' '))}</small></div>`).join('');
            return `
              <tr>
                <td>
                  <b>${esc(d.doNo)}</b>
                  <div class="small">${esc(d.date)}</div>
                </td>
                <td>
                  <b>${esc(d.customerName)}</b>
                  <div class="small">${esc(d.customerPhone || 'No phone')}</div>
                  <div class="small" style="color:#64748b;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.deliveryAddress || '')}</div>
                </td>
                <td>
                  <div>${esc(d.carrier || 'Direct delivery')}</div>
                  <div class="small" style="color:#087f83">${esc(d.sourceRef || '-')}</div>
                </td>
                <td style="font-size:12px;line-height:1.4">${linesSummary || '<span class="small">—</span>'}</td>
                <td><b>LKR ${money(d.total)}</b></td>
                <td>
                  <span class="tag ${isPending ? 'amber' : 'green'} sm">
                    ${isPending ? 'Pending Invoice' : '✓ Invoiced'}
                  </span>
                  ${d.invoicedAt ? `<div class="small" style="color:#64748b;font-size:10px">${new Date(d.invoicedAt).toLocaleDateString()}</div>` : ''}
                </td>
                <td>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${isPending ? `
                      <button type="button" class="btn green sm" style="font-weight:700" onclick="convertDoToManualInvoice('${d.id}')" title="Convert this DO to a Manual Invoice draft">
                        Convert to Invoice →
                      </button>
                    ` : `
                      <span class="small" style="color:#16a34a;font-weight:600;padding:4px 0">Converted</span>
                    `}
                    <button type="button" class="btn ghost sm" onclick="viewDeliveryOrder('${d.id}')">View Note</button>
                    ${isPending ? `<button type="button" class="btn red sm" onclick="deleteDeliveryOrder('${d.id}')" title="Delete un-invoiced DO">×</button>` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table></div>
    `;
  };

  // 4. Create Modal Helpers
  window.openDoCreateModal = function(){
    ensureDoUI();
    const custSel = byId('doCustomerId');
    if (custSel) {
      custSel.innerHTML = (state.customers || []).map(c => `<option value="${c.id}">${esc(c.name)} • ${esc(c.phone||'')}</option>`).join('');
    }

    // Populate source documents (active Sales Orders and PIs)
    const docSel = byId('doSourceDocSelect');
    if (docSel) {
      const soList = (state.salesOrders || []).filter(s => !window.scSOIsCancelledV57?.(s)).slice(0, 30);
      const piList = (state.docs || []).filter(d => d.type === 'PI').slice(0, 30);
      docSel.innerHTML = `
        <option value="">-- Or select an approved SO / PI to auto-fill items & customer --</option>
        <optgroup label="Recent Sales Orders">
          ${soList.map(s => `<option value="SO:${s.id}">${esc(s.soNo)} • ${esc(s.customerName)} (${(s.lines||[]).length} lines)</option>`).join('')}
        </optgroup>
        <optgroup label="Recent Pro Forma Invoices">
          ${piList.map(d => `<option value="PI:${d.id}">${esc(d.serial)} • ${esc(d.customer?.name||'')} (${(d.lines||[]).length} lines)</option>`).join('')}
        </optgroup>
      `;
    }

    byId('doDate').value = today();
    byId('doCarrier').value = '';
    byId('doRef').value = '';
    byId('doAddress').value = '';
    byId('doNotes').value = '';
    byId('doItemsBody').innerHTML = '';
    
    // Add default row
    doAddLineItem();

    if (custSel?.value) doCustomerSelected(custSel.value);
    byId('doCreateModal').classList.add('show');
  };

  window.doCustomerSelected = function(custId){
    const c = (state.customers || []).find(x => x.id === custId);
    if (!c) return;
    const addr = byId('doAddress');
    if (addr && !addr.value) addr.value = c.delivery || c.address || '';
  };

  window.doSelectSourceDoc = function(val){
    if (!val) return;
    const [type, id] = val.split(':');
    if (type === 'SO') {
      const so = (state.salesOrders || []).find(x => x.id === id);
      if (!so) return;
      byId('doCustomerId').value = so.customerId;
      byId('doRef').value = so.soNo;
      byId('doAddress').value = so.shipTo?.address || so.customerAddress || '';
      byId('doCarrier').value = so.method === 'courier' ? 'Courier' : so.method === 'own' ? 'SoftCreation Delivery' : '';
      
      const tbody = byId('doItemsBody');
      tbody.innerHTML = '';
      (so.lines || []).forEach(l => {
        doAddLineItem({
          desc: l.desc,
          size: l.size,
          material: l.material,
          qty: l.qty,
          unit: l.unit || 'Rolls',
          price: l.price
        });
      });
      toast(`Items imported from ${so.soNo}`);
    } else if (type === 'PI') {
      const pi = (state.docs || []).find(x => x.id === id);
      if (!pi) return;
      byId('doCustomerId').value = pi.customerId;
      byId('doRef').value = pi.serial;
      byId('doAddress').value = pi.customer?.delivery || pi.customer?.address || '';
      
      const tbody = byId('doItemsBody');
      tbody.innerHTML = '';
      (pi.lines || []).forEach(l => {
        doAddLineItem({
          desc: l.desc,
          size: l.size,
          material: l.material,
          qty: l.qty,
          unit: l.unit || 'Rolls',
          price: l.price
        });
      });
      toast(`Items imported from ${pi.serial}`);
    }
  };

  window.doAddLineItem = function(item = {}){
    const tbody = byId('doItemsBody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="do-line-desc" value="${esc(item.desc || '')}" placeholder="Item description" style="width:100%" required></td>
      <td><input class="do-line-size" value="${esc(item.size || '')}" placeholder="e.g. 50mm x 25mm" style="width:100%"></td>
      <td><input class="do-line-material" value="${esc(item.material || '')}" placeholder="e.g. TT / ELP" style="width:100%"></td>
      <td><input class="do-line-qty" type="number" step="1" min="1" value="${item.qty || 100}" style="width:100%" required></td>
      <td><input class="do-line-price" type="number" step="0.01" min="0" value="${item.price || 0}" style="width:100%"></td>
      <td style="text-align:center"><button type="button" class="btn red sm" onclick="this.closest('tr').remove()" style="padding:2px 6px">×</button></td>
    `;
    tbody.appendChild(tr);
  };

  window.saveDeliveryOrder = function(){
    const custId = byId('doCustomerId')?.value;
    const c = (state.customers || []).find(x => x.id === custId);
    if (!c) return toast('Select a customer');

    const lines = [];
    document.querySelectorAll('#doItemsBody tr').forEach(tr => {
      const desc = tr.querySelector('.do-line-desc')?.value.trim();
      const size = tr.querySelector('.do-line-size')?.value.trim();
      const material = tr.querySelector('.do-line-material')?.value.trim();
      const qty = Number(tr.querySelector('.do-line-qty')?.value || 0);
      const price = Number(tr.querySelector('.do-line-price')?.value || 0);
      if (desc && qty > 0) {
        lines.push({ desc, size, material, qty, unit: 'Rolls', price, amount: qty * price });
      }
    });

    if (!lines.length) return toast('Add at least one item with a valid quantity');

    const total = lines.reduce((s, l) => s + l.amount, 0);
    const doNo = nextDoNumber();

    const doRecord = {
      id: 'do_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      doNo,
      date: byId('doDate')?.value || today(),
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone || '',
      deliveryAddress: byId('doAddress')?.value.trim() || c.delivery || c.address || '',
      carrier: byId('doCarrier')?.value.trim() || '',
      sourceRef: byId('doRef')?.value.trim() || '',
      lines,
      total,
      notes: byId('doNotes')?.value.trim() || '',
      status: 'Pending Invoice',
      createdBy: currentUser?.display || currentUser?.username || 'Staff',
      createdAt: new Date().toISOString()
    };

    state.deliveryOrders = state.deliveryOrders || [];
    state.deliveryOrders.unshift(doRecord);

    if (typeof saveState === 'function') saveState();
    closeModal('doCreateModal');
    renderDeliveryOrders();
    toast(`Delivery Order ${doNo} saved!`);
  };

  // 5. Convert DO to Manual Invoice
  window.convertDoToManualInvoice = function(doId){
    const doItem = (state.deliveryOrders || []).find(x => x.id === doId);
    if (!doItem) return toast('Delivery order not found');

    if (typeof showView === 'function') {
      showView('manualinvoices');
    }

    if (typeof miNewInvoice === 'function') {
      miNewInvoice();
      setTimeout(() => {
        // Search & select matching customer
        const searchInput = byId('miCustomerSearch');
        if (searchInput) {
          searchInput.value = doItem.customerName;
          if (typeof miSearchCustomer === 'function') miSearchCustomer(doItem.customerName);
        }

        // Prepopulate customer reference and notes
        const poInput = byId('miCustomerPo');
        if (poInput) poInput.value = doItem.doNo + (doItem.sourceRef ? ` · ${doItem.sourceRef}` : '');

        const infoInput = byId('miAdditionalInfo');
        if (infoInput) {
          infoInput.value = `Converted from Delivery Order ${doItem.doNo}${doItem.carrier ? ' via ' + doItem.carrier : ''}. Destination: ${doItem.deliveryAddress || '-'}`;
        }

        // Prepopulate items into window.miActiveInvoice
        if (window.miActiveInvoice) {
          window.miActiveInvoice.customerName = doItem.customerName;
          window.miActiveInvoice.deliveryAddress = doItem.deliveryAddress;
          window.miActiveInvoice.customerPo = doItem.doNo;
          window.miActiveInvoice.additionalInfo = `Converted from Delivery Order: ${doItem.doNo}`;
          window.miActiveInvoice.items = (doItem.lines || []).map((l, idx) => ({
            line_no: idx + 1,
            item_code: l.code || '',
            description: [l.desc, l.size, l.material].filter(Boolean).join(' '),
            qty: Number(l.qty || 1),
            unit_price: Number(l.price || 0)
          }));
          if (typeof miRenderItems === 'function') miRenderItems();
          if (typeof miCalcTotals === 'function') miCalcTotals();
        }

        // Update DO status
        doItem.status = 'Converted to Invoice';
        doItem.invoicedAt = new Date().toISOString();
        if (typeof saveState === 'function') saveState();
        renderDeliveryOrders();

        toast(`Delivery Order ${doItem.doNo} converted to Manual Invoice draft!`);
      }, 200);
    } else {
      toast('Manual Invoices module is loading. Please select Manual Invoices tab.');
    }
  };

  // 6. View / Print Delivery Order Note
  window.viewDeliveryOrder = function(doId){
    const d = (state.deliveryOrders || []).find(x => x.id === doId);
    if (!d) return;

    byId('doViewTitle').textContent = `Delivery Order Note · ${d.doNo}`;
    byId('doViewMeta').textContent = `${d.customerName} · ${d.date} · Status: ${d.status}`;

    const content = byId('doViewContent');
    if (!content) return;

    content.innerHTML = `
      <div style="border-bottom:3px solid #087f83;padding-bottom:12px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <h2 style="margin:0;color:#087f83;font-size:24px;letter-spacing:1px">SoftCreation (Pvt) Ltd</h2>
          <div style="font-size:12px;color:#64748b;margin-top:4px">No. 25, Industrial Zone, Kurunegala, Sri Lanka · Tel: +94 37 222 4567</div>
          <h3 style="margin:12px 0 0;font-size:16px;color:#1e293b">DELIVERY ORDER / GOODS DISPATCH NOTE</h3>
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:900;color:#087f83">${esc(d.doNo)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px">Date: <b>${esc(d.date)}</b></div>
          <div style="font-size:12px;color:#64748b">Ref: <b>${esc(d.sourceRef || '-')}</b></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;font-size:13px">
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <b style="color:#0f172a;display:block;margin-bottom:6px">DELIVER TO:</b>
          <div style="font-size:15px;font-weight:700;color:#087f83">${esc(d.customerName)}</div>
          <div>Tel: ${esc(d.customerPhone || 'N/A')}</div>
          <div style="margin-top:4px;color:#475569">${esc(d.deliveryAddress || 'Standard delivery address')}</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <b style="color:#0f172a;display:block;margin-bottom:6px">DISPATCH & CARRIER DETAILS:</b>
          <div>Carrier / Driver: <b>${esc(d.carrier || 'Direct Customer Delivery')}</b></div>
          <div>Reference: <b>${esc(d.sourceRef || 'N/A')}</b></div>
          <div>Created By: <b>${esc(d.createdBy || 'Staff')}</b></div>
          <div>Status: <span class="tag ${d.status === 'Pending Invoice' ? 'amber' : 'green'} sm">${esc(d.status)}</span></div>
        </div>
      </div>

      <table class="table" style="width:100%;margin-bottom:20px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="width:8%">#</th>
            <th style="width:42%">Item Description</th>
            <th style="width:20%">Size / Specification</th>
            <th style="width:15%">Material</th>
            <th style="width:15%;text-align:right">Quantity</th>
          </tr>
        </thead>
        <tbody>
          ${(d.lines || []).map((l, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><b>${esc(l.desc)}</b></td>
              <td>${esc(l.size || '-')}</td>
              <td>${esc(l.material || '-')}</td>
              <td style="text-align:right;font-weight:700;font-size:14px">${money(l.qty)} ${esc(l.unit || 'Rolls')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${d.notes ? `<div style="background:#fffbeb;border:1px solid #fef3c7;padding:10px 14px;border-radius:6px;font-size:12px;margin-bottom:24px"><b>Notes / Instructions:</b> ${esc(d.notes)}</div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:48px;padding-top:20px;border-top:1px dashed #cbd5e1;font-size:12px;text-align:center">
        <div>
          <div style="height:35px"></div>
          <div style="border-top:1px solid #94a3b8;padding-top:6px"><b>Dispatched By (Factory)</b></div>
        </div>
        <div>
          <div style="height:35px"></div>
          <div style="border-top:1px solid #94a3b8;padding-top:6px"><b>Carrier / Driver Signature</b></div>
        </div>
        <div>
          <div style="height:35px"></div>
          <div style="border-top:1px solid #94a3b8;padding-top:6px"><b>Customer Received Signature & Stamp</b></div>
        </div>
      </div>
    `;

    byId('doViewModal').classList.add('show');
  };

  window.deleteDeliveryOrder = function(doId){
    const d = (state.deliveryOrders || []).find(x => x.id === doId);
    if (!d) return;
    if (d.status !== 'Pending Invoice') return toast('Cannot delete an invoiced delivery order');
    if (!confirm(`Delete Delivery Order ${d.doNo}?`)) return;
    state.deliveryOrders = state.deliveryOrders.filter(x => x.id !== doId);
    if (typeof saveState === 'function') saveState();
    renderDeliveryOrders();
    toast(`Delivery Order ${d.doNo} deleted`);
  };

  // 7. Hook into applyUserAccess
  const origAccess = window.applyUserAccess;
  window.applyUserAccess = function(){
    if (typeof origAccess === 'function') origAccess.apply(this, arguments);
    ensureDoUI();
    const btn = document.querySelector('.navbtn[data-view="deliveryorders"]');
    const allowed = doCanView();
    if (btn) btn.style.display = allowed ? 'inline-block' : 'none';
    if (byId('deliveryorders')?.classList.contains('active') && !allowed) {
      if (typeof showView === 'function') showView('dashboard');
    }
  };

  // Hook into showView
  const origShow = window.showView;
  window.showView = function(viewId){
    const r = typeof origShow === 'function' ? origShow.apply(this, arguments) : undefined;
    if (viewId === 'deliveryorders') {
      ensureDoUI();
      renderDeliveryOrders();
    }
    return r;
  };

  // Setup on startup
  function init(){
    ensureDoUI();
    if (typeof applyUserAccess === 'function') applyUserAccess();
    if (byId('deliveryorders')?.classList.contains('active')) renderDeliveryOrders();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

})();

