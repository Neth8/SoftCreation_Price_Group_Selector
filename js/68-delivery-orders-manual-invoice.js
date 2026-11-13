/* SoftCreation SPGS — Delivery Orders & Manual Invoice Conversion Module
 * V1.1.0 (2026-11-13)
 * Full Delivery Order goods dispatch management with:
 * 1. Dedicated Supabase table `spgs_delivery_orders` synchronization
 * 2. Type-to-suggest Customer selection
 * 3. Pure goods dispatch without unit prices
 * 4. Paginated Delivery Orders table
 * 5. One-click conversion to Manual Invoice
 */
(function(){
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numFmt = n => Number(n || 0).toLocaleString('en-US');
  const today = () => new Date().toISOString().slice(0, 10);
  const byId = id => document.getElementById(id);

  const SPGS_WORKSPACE = 'softcreation_main';
  let doCurrentPage = 1;
  const doPageSize = 10;
  let doCloudReady = false;

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
    const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : (window.currentUser || null);
    if (!u) return false;
    if (u.role === 'admin') return true;
    if (typeof hasPerm === 'function') return hasPerm('delivery_orders_view');
    return false;
  }

  function nextDoNumber(){
    const datePrefix = 'SC/DO/' + today().replace(/-/g, '');
    const existing = (state.deliveryOrders || []).filter(d => String(d.doNo || '').startsWith(datePrefix));
    const nextSeq = existing.length + 1;
    return `${datePrefix}/${String(nextSeq).padStart(3, '0')}`;
  }

  // 2. Cloud Synchronization with dedicated `spgs_delivery_orders` table
  async function spgsLoadDeliveryOrdersCloud(){
    if (typeof window.spgsFetch !== 'function') return;
    try {
      const rows = await window.spgsFetch(`/spgs_delivery_orders?workspace=eq.${encodeURIComponent(SPGS_WORKSPACE)}&select=id,payload,updated_at&order=updated_at.desc`);
      if (Array.isArray(rows) && rows.length > 0) {
        doCloudReady = true;
        const cloudList = rows.map(r => ({ ...(r.payload || {}), _spgsUpdatedAt: r.updated_at })).filter(x => x && x.id);
        const map = new Map();
        (state.deliveryOrders || []).forEach(d => { if (d?.id) map.set(d.id, d); });
        cloudList.forEach(d => map.set(d.id, d));
        state.deliveryOrders = [...map.values()].sort((a, b) => (Date.parse(b.date || b.createdAt || 0) || 0) - (Date.parse(a.date || a.createdAt || 0) || 0));
        renderDeliveryOrders();
      }
    } catch (e) {
      // Table may not yet be created in Supabase SQL editor; fallback to spgs_app_state
      console.warn('Dedicated spgs_delivery_orders table not available yet, using shared app_state.', e);
    }
  }

  async function spgsSyncDeliveryOrderCloud(doRecord){
    if (typeof window.spgsFetch !== 'function' || !doRecord?.id) return;
    try {
      const payload = { ...doRecord };
      delete payload._spgsUpdatedAt;
      const row = {
        workspace: SPGS_WORKSPACE,
        id: doRecord.id,
        do_no: doRecord.doNo || '',
        customer_name: doRecord.customerName || '',
        customer_id: doRecord.customerId || '',
        carrier: doRecord.carrier || '',
        source_ref: doRecord.sourceRef || '',
        status: doRecord.status || 'Pending Invoice',
        total_qty: Number(doRecord.totalQty || 0),
        created_by: doRecord.createdBy || '',
        payload,
        updated_at: new Date().toISOString()
      };
      await window.spgsFetch('/spgs_delivery_orders?on_conflict=workspace,id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([row])
      });
      doCloudReady = true;
    } catch (e) {
      console.warn('Cloud sync to spgs_delivery_orders failed, saved locally and via state.', e);
    }
  }

  async function spgsDeleteDeliveryOrderCloud(doId){
    if (typeof window.spgsFetch !== 'function' || !doId) return;
    try {
      await window.spgsFetch(`/spgs_delivery_orders?workspace=eq.${encodeURIComponent(SPGS_WORKSPACE)}&id=eq.${encodeURIComponent(doId)}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn('Cloud delete on spgs_delivery_orders failed.', e);
    }
  }

  // 3. Navigation & View Injection
  function ensureDoUI(){
    const nav = document.querySelector('.nav');
    let btn = nav?.querySelector('[data-view="deliveryorders"]');
    if (nav && !btn) {
      btn = document.createElement('button');
      btn.className = 'navbtn';
      btn.dataset.view = 'deliveryorders';
      btn.textContent = 'Delivery Orders';
      const customersBtn = nav.querySelector('[data-view="customers"]');
      const settingsBtn = nav.querySelector('[data-view="settings"]');
      nav.insertBefore(btn, customersBtn || settingsBtn || null);
    }
    if (btn) {
      btn.onclick = () => window.showView('deliveryorders');
    }

    if (byId('deliveryorders')) return;

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
            <b>Goods Dispatch Workflow:</b> Record customer dispatches, verify physical roll counts, and seamlessly convert Delivery Orders into <b>Manual Invoices</b>. Access is controlled in Admin User Permissions.
          </div>
          
          <div id="doKpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:14px 0"></div>
          
          <div class="listbar" style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
            <input class="search" id="doSearch" placeholder="Search DO No, customer, carrier, reference..." style="flex:1;min-width:240px" oninput="doSearchChanged()"/>
            <select id="doFilterStatus" onchange="doSearchChanged()" style="width:180px">
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

    // Create Modal (With Customer Typeahead and without Unit Price)
    document.body.insertAdjacentHTML('beforeend', `
      <div id="doCreateModal" class="modal">
        <div class="modal-card" style="max-width:900px;width:95vw">
          <div class="modal-head">
            <div>
              <b id="doModalTitle">Create Delivery Order</b>
              <div class="small" style="color:#64748b">Outbound Goods Dispatch Note (Pure Quantities)</div>
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
              <div class="field" style="position:relative">
                <label>Customer * <span class="small" style="color:#64748b;font-weight:normal">(Type to search)</span></label>
                <input id="doCustomerSearch" type="text" autocomplete="off" placeholder="Start typing customer name or phone..." oninput="doSuggestCustomer(this.value)" onfocus="doSuggestCustomer(this.value)">
                <input type="hidden" id="doCustomerId">
                <div id="doCustomerSuggestBox" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:1000;background:#fff;border:1px solid #cbd5e1;border-radius:8px;max-height:220px;overflow-y:auto;box-shadow:0 12px 28px rgba(0,0,0,0.18)"></div>
              </div>
              <div class="field">
                <label>DO Date *</label>
                <input id="doDate" type="date" value="${today()}">
              </div>
              <div class="field">
                <label>Carrier / Driver / Vehicle</label>
                <input id="doCarrier" placeholder="e.g. Courier / WP CAB-1234 / Driver Name">
              </div>
              <div class="field">
                <label>Customer PO / Reference</label>
                <input id="doRef" placeholder="Customer PO number or reference">
              </div>
              <div class="field full">
                <label>Delivery Address</label>
                <textarea id="doAddress" placeholder="Delivery destination address" style="min-height:48px"></textarea>
              </div>
            </div>

            <div class="section" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center">
              <span>Dispatched Goods / Quantities</span>
              <button class="btn sm ghost" type="button" onclick="doAddLineItem()">+ Add Item Row</button>
            </div>
            
            <table class="table" id="doItemsTable" style="margin-top:8px">
              <thead>
                <tr>
                  <th style="width:42%">Item Description</th>
                  <th style="width:24%">Size / Specification</th>
                  <th style="width:18%">Material</th>
                  <th style="width:12%">Quantity</th>
                  <th style="width:4%"></th>
                </tr>
              </thead>
              <tbody id="doItemsBody"></tbody>
            </table>

            <div class="field full" style="margin-top:12px">
              <label>Special Instructions / Delivery Notes</label>
              <textarea id="doNotes" placeholder="Delivery notes, package count, condition, handling instructions, etc."></textarea>
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

    // Click outside to dismiss customer search box
    document.addEventListener('click', function(e){
      const box = byId('doCustomerSuggestBox');
      const input = byId('doCustomerSearch');
      if (box && e.target !== box && e.target !== input && !box.contains(e.target)) {
        box.style.display = 'none';
      }
    });
  }

  // 4. Render Delivery Orders List with Pagination & pure quantities
  window.doSearchChanged = function(){
    doCurrentPage = 1;
    renderDeliveryOrders();
  };

  window.doSetPage = function(p){
    doCurrentPage = p;
    renderDeliveryOrders();
  };

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

    // Render KPIs (Quantity based, without price)
    const pendingCount = orders.filter(d => d.status === 'Pending Invoice').length;
    const invoicedCount = orders.filter(d => d.status === 'Converted to Invoice').length;
    const totalRolls = orders.reduce((s, d) => s + (d.lines || []).reduce((ls, l) => ls + Number(l.qty || 0), 0), 0);

    const kpiHost = byId('doKpis');
    if (kpiHost) {
      kpiHost.innerHTML = `
        <div class="card" style="padding:12px;border:1px solid #cbd5e1"><div class="k">Total Delivery Orders</div><div class="v">${orders.length}</div><div class="sub">Total dispatches recorded</div></div>
        <div class="card" style="padding:12px;border:1px solid #fde68a;background:#fffbeb"><div class="k" style="color:#b45309">Pending Invoice</div><div class="v" style="color:#b45309">${pendingCount}</div><div class="sub">Awaiting manual invoice</div></div>
        <div class="card" style="padding:12px;border:1px solid #bbf7d0;background:#f0fdf4"><div class="k" style="color:#15803d">Invoiced</div><div class="v" style="color:#15803d">${invoicedCount}</div><div class="sub">Converted to Manual Invoice</div></div>
        <div class="card" style="padding:12px;border:1px solid #bfdbfe"><div class="k">Total Dispatched Items</div><div class="v" style="font-size:19px">${numFmt(totalRolls)} <small style="font-size:12px;font-weight:normal">Rolls</small></div><div class="sub">Physical goods dispatched</div></div>
      `;
    }

    if (!filtered.length) {
      host.innerHTML = '<div class="empty">No delivery orders found. Click "+ Create Delivery Order" to create a new delivery note.</div>';
      return;
    }

    // Pagination calculations
    const totalPages = Math.ceil(filtered.length / doPageSize) || 1;
    if (doCurrentPage > totalPages) doCurrentPage = totalPages;
    if (doCurrentPage < 1) doCurrentPage = 1;

    const startIndex = (doCurrentPage - 1) * doPageSize;
    const pageItems = filtered.slice(startIndex, startIndex + doPageSize);

    host.innerHTML = `
      <div class="tablewrap"><table class="table">
        <thead>
          <tr>
            <th>DO Number / Date</th>
            <th>Customer / Contact</th>
            <th>Carrier / Reference</th>
            <th>Dispatched Goods</th>
            <th>Total Qty</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${pageItems.map(d => {
            const isPending = d.status === 'Pending Invoice';
            const linesSummary = (d.lines || []).map(l => `<div><b>${numFmt(l.qty)} ${esc(l.unit||'Rolls')}</b> · ${esc(l.desc)} <small style="color:#64748b">${esc([l.size, l.material].filter(Boolean).join(' '))}</small></div>`).join('');
            const doTotalQty = (d.lines || []).reduce((s, l) => s + Number(l.qty || 0), 0);
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
                <td><b>${numFmt(doTotalQty)}</b> <span class="small">Rolls</span></td>
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

      <!-- Pagination Toolbar -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 6px;margin-top:10px;border-top:1px solid #e2e8f0;flex-wrap:wrap;gap:10px">
        <div class="small" style="color:#64748b">
          Showing <b>${startIndex + 1}</b> to <b>${Math.min(startIndex + doPageSize, filtered.length)}</b> of <b>${filtered.length}</b> delivery orders
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn sm ghost" ${doCurrentPage <= 1 ? 'disabled style="opacity:0.5"' : ''} onclick="doSetPage(${doCurrentPage - 1})">◀ Prev</button>
          <span style="font-size:12px;font-weight:700;padding:0 8px">Page ${doCurrentPage} of ${totalPages}</span>
          <button class="btn sm ghost" ${doCurrentPage >= totalPages ? 'disabled style="opacity:0.5"' : ''} onclick="doSetPage(${doCurrentPage + 1})">Next ▶</button>
        </div>
      </div>
    `;
  };

  // 5. Customer Type-To-Suggest Autocomplete Helpers
  window.doSuggestCustomer = function(query = ''){
    const box = byId('doCustomerSuggestBox');
    if (!box) return;

    const q = String(query || '').toLowerCase().trim();
    const list = (state.customers || []).filter(c => {
      if (!q) return true;
      return [c.name, c.phone, c.contactPerson, c.email].join(' ').toLowerCase().includes(q);
    }).slice(0, 15);

    if (!list.length) {
      box.innerHTML = '<div style="padding:10px;color:#64748b;font-size:12px">No matching customers found.</div>';
      box.style.display = 'block';
      return;
    }

    box.innerHTML = list.map(c => `
      <div style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center"
           onmouseover="this.style.background='#f0fdfa'" onmouseout="this.style.background=''"
           onclick="doPickCustomer('${c.id}')">
        <div>
          <b style="color:#087f83;font-size:13px">${esc(c.name)}</b>
          <div class="small" style="color:#64748b">${esc(c.phone || 'No phone')} ${c.contactPerson ? '· ' + esc(c.contactPerson) : ''}</div>
        </div>
        <span class="small" style="color:#94a3b8;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.delivery || c.address || '')}</span>
      </div>
    `).join('');
    box.style.display = 'block';
  };

  window.doPickCustomer = function(custId){
    const c = (state.customers || []).find(x => x.id === custId);
    if (!c) return;

    const idInput = byId('doCustomerId');
    const searchInput = byId('doCustomerSearch');
    const addrInput = byId('doAddress');
    const box = byId('doCustomerSuggestBox');

    if (idInput) idInput.value = c.id;
    if (searchInput) searchInput.value = c.name;
    if (addrInput && !addrInput.value) addrInput.value = c.delivery || c.address || '';
    if (box) box.style.display = 'none';
  };

  // 6. Create Modal Helpers
  window.openDoCreateModal = function(){
    ensureDoUI();

    const searchInput = byId('doCustomerSearch');
    const idInput = byId('doCustomerId');
    if (searchInput) searchInput.value = '';
    if (idInput) idInput.value = '';

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

    byId('doCreateModal').classList.add('show');
  };

  window.doSelectSourceDoc = function(val){
    if (!val) return;
    const [type, id] = val.split(':');
    if (type === 'SO') {
      const so = (state.salesOrders || []).find(x => x.id === id);
      if (!so) return;
      byId('doCustomerId').value = so.customerId || '';
      byId('doCustomerSearch').value = so.customerName || '';
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
          price: l.price || 0
        });
      });
      toast(`Items imported from ${so.soNo}`);
    } else if (type === 'PI') {
      const pi = (state.docs || []).find(x => x.id === id);
      if (!pi) return;
      byId('doCustomerId').value = pi.customerId || '';
      byId('doCustomerSearch').value = pi.customer?.name || '';
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
          price: l.price || 0
        });
      });
      toast(`Items imported from ${pi.serial}`);
    }
  };

  window.doAddLineItem = function(item = {}){
    const tbody = byId('doItemsBody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.dataset.cachedPrice = String(item.price || 0);
    tr.innerHTML = `
      <td><input class="do-line-desc" value="${esc(item.desc || '')}" placeholder="Item description" style="width:100%" required></td>
      <td><input class="do-line-size" value="${esc(item.size || '')}" placeholder="e.g. 50mm x 25mm" style="width:100%"></td>
      <td><input class="do-line-material" value="${esc(item.material || '')}" placeholder="e.g. TT / ELP" style="width:100%"></td>
      <td><input class="do-line-qty" type="number" step="1" min="1" value="${item.qty || 100}" style="width:100%" required></td>
      <td style="text-align:center"><button type="button" class="btn red sm" onclick="this.closest('tr').remove()" style="padding:2px 6px">×</button></td>
    `;
    tbody.appendChild(tr);
  };

  window.saveDeliveryOrder = function(){
    const custId = byId('doCustomerId')?.value;
    const custName = byId('doCustomerSearch')?.value.trim();
    let c = (state.customers || []).find(x => x.id === custId);
    if (!c && custName) {
      c = (state.customers || []).find(x => x.name.toLowerCase() === custName.toLowerCase());
    }
    if (!c && !custName) return toast('Please type and select a customer');

    const resolvedCustId = c ? c.id : ('cust_' + Date.now().toString(36));
    const resolvedCustName = c ? c.name : custName;
    const resolvedPhone = c ? (c.phone || '') : '';

    const lines = [];
    document.querySelectorAll('#doItemsBody tr').forEach(tr => {
      const desc = tr.querySelector('.do-line-desc')?.value.trim();
      const size = tr.querySelector('.do-line-size')?.value.trim();
      const material = tr.querySelector('.do-line-material')?.value.trim();
      const qty = Number(tr.querySelector('.do-line-qty')?.value || 0);
      const price = Number(tr.dataset.cachedPrice || 0);
      if (desc && qty > 0) {
        lines.push({ desc, size, material, qty, unit: 'Rolls', price });
      }
    });

    if (!lines.length) return toast('Add at least one item with a valid quantity');

    const totalQty = lines.reduce((s, l) => s + l.qty, 0);
    const doNo = nextDoNumber();

    const doRecord = {
      id: 'do_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      doNo,
      date: byId('doDate')?.value || today(),
      customerId: resolvedCustId,
      customerName: resolvedCustName,
      customerPhone: resolvedPhone,
      deliveryAddress: byId('doAddress')?.value.trim() || (c ? (c.delivery || c.address || '') : ''),
      carrier: byId('doCarrier')?.value.trim() || '',
      sourceRef: byId('doRef')?.value.trim() || '',
      lines,
      totalQty,
      notes: byId('doNotes')?.value.trim() || '',
      status: 'Pending Invoice',
      createdBy: currentUser?.display || currentUser?.username || 'Staff',
      createdAt: new Date().toISOString()
    };

    state.deliveryOrders = state.deliveryOrders || [];
    state.deliveryOrders.unshift(doRecord);

    if (typeof saveState === 'function') saveState();
    spgsSyncDeliveryOrderCloud(doRecord);

    closeModal('doCreateModal');
    doCurrentPage = 1;
    renderDeliveryOrders();
    toast(`Delivery Order ${doNo} saved!`);
  };

  // 7. Convert DO to Manual Invoice
  window.convertDoToManualInvoice = function(doId){
    const doItem = (state.deliveryOrders || []).find(x => x.id === doId);
    if (!doItem) return toast('Delivery order not found');

    if (typeof showView === 'function') {
      showView('manualinvoices');
    }

    if (typeof miNewInvoice === 'function') {
      miNewInvoice();
      setTimeout(() => {
        const searchInput = byId('miCustomerSearch');
        if (searchInput) {
          searchInput.value = doItem.customerName;
          if (typeof miSearchCustomer === 'function') miSearchCustomer(doItem.customerName);
        }

        const poInput = byId('miCustomerPo');
        if (poInput) poInput.value = doItem.doNo + (doItem.sourceRef ? ` · ${doItem.sourceRef}` : '');

        const infoInput = byId('miAdditionalInfo');
        if (infoInput) {
          infoInput.value = `Converted from Delivery Order ${doItem.doNo}${doItem.carrier ? ' via ' + doItem.carrier : ''}. Destination: ${doItem.deliveryAddress || '-'}`;
        }

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
        spgsSyncDeliveryOrderCloud(doItem);
        renderDeliveryOrders();

        toast(`Delivery Order ${doItem.doNo} converted to Manual Invoice draft!`);
      }, 200);
    } else {
      toast('Manual Invoice module is loading, please try again in a moment');
    }
  };

  // 8. View / Print Delivery Order Note (No Unit Prices, pure Goods Dispatch Note)
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
            <th style="width:46%">Item Description</th>
            <th style="width:24%">Size / Specification</th>
            <th style="width:12%">Material</th>
            <th style="width:10%;text-align:right">Quantity</th>
          </tr>
        </thead>
        <tbody>
          ${(d.lines || []).map((l, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><b>${esc(l.desc)}</b></td>
              <td>${esc(l.size || '-')}</td>
              <td>${esc(l.material || '-')}</td>
              <td style="text-align:right;font-weight:700;font-size:14px">${numFmt(l.qty)} ${esc(l.unit || 'Rolls')}</td>
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
    spgsDeleteDeliveryOrderCloud(doId);
    renderDeliveryOrders();
    toast(`Delivery Order ${d.doNo} deleted`);
  };

  // 9. Hook into applyUserAccess & showView
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
    spgsLoadDeliveryOrdersCloud();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

})();
