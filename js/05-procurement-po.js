
/* V1.0.5 - Supplier Purchase Orders / Procurement + saved supplier/item suggestions */
(function(){
  if(!USER_FEATURES.some(x=>x[0]==='purchase_orders_view'))USER_FEATURES.push(['purchase_orders_view','Purchase Orders — Supplier Procurement']);
  VIEW_PERMS.purchaseorders='purchase_orders_view';
  state.purchaseOrders=state.purchaseOrders||[];

  const nav=document.querySelector('.nav'),settingsBtn=document.querySelector('[data-view="settings"]');
  if(nav&&!document.querySelector('[data-view="purchaseorders"]')){
    const b=document.createElement('button');b.className='navbtn';b.dataset.view='purchaseorders';b.textContent='Purchase Orders';b.onclick=()=>showView('purchaseorders');nav.insertBefore(b,settingsBtn);
  }

  if(!$('purchaseorders')){
    document.querySelector('#settings').insertAdjacentHTML('beforebegin',`
    <section id="purchaseorders" class="view">
      <div class="panel">
        <div class="panel-title"><span>Purchase Orders — Supplier Procurement</span><div class="actions" style="margin:0"><button class="btn sm" style="background:#fff;color:#087f83" onclick="renderPurchaseOrders()">Refresh</button><button class="btn sm" style="background:#fff;color:#087f83" onclick="openPurchaseOrder()">+ New PO</button></div></div>
        <div class="panel-body">
          <div class="notice" style="margin-bottom:12px">Create supplier purchase orders, issue them to suppliers, and track ordered, received and outstanding quantities. Purchase Order data is stored separately from quotations and production.</div>
          <div id="poKpis" class="po-kpis"></div>
          <div class="listbar"><input id="poSearch" class="search" placeholder="Search PO no / supplier / item" oninput="renderPurchaseOrders()"><select id="poStatusFilter" onchange="renderPurchaseOrders()"><option value="">All statuses</option><option>Draft</option><option>Approved</option><option>Sent</option><option>Supplier Confirmed</option><option>Partially Received</option><option>Received</option><option>Cancelled</option></select></div>
          <div id="poList"></div>
        </div>
      </div>
    </section>`);
  }

  if(!$('purchaseOrderModal')){
    document.body.insertAdjacentHTML('beforeend',`
    <div id="purchaseOrderModal" class="modal"><div class="modal-card" style="width:min(1180px,96vw)"><div class="modal-head"><b id="poModalTitle">Purchase Order</b><button class="closex" onclick="closeModal('purchaseOrderModal')">×</button></div><div class="modal-body">
      <input id="poId" type="hidden">
      <div class="grid">
        <div class="field"><label>PO Number</label><input id="poNumber" readonly></div>
        <div class="field"><label>Status</label><select id="poStatus"><option>Draft</option><option>Approved</option><option>Sent</option><option>Supplier Confirmed</option><option>Partially Received</option><option>Received</option><option>Cancelled</option></select></div>
        <div class="field"><label>PO Date</label><input id="poDate" type="date"></div>
        <div class="field"><label>Expected Delivery Date</label><input id="poExpectedDate" type="date"></div>
        <div class="section">Supplier</div>
        <div class="field"><label>Supplier Name *</label><input id="poSupplier" list="poSupplierOptions" autocomplete="off" placeholder="Type supplier / company name" oninput="poSupplierInputChanged()" onchange="poSupplierInputChanged(true)"><datalist id="poSupplierOptions"></datalist><div class="hint">Saved suppliers are suggested automatically. Select one to fill contact details.</div></div>
        <div class="field"><label>Contact Person</label><input id="poSupplierContact"></div>
        <div class="field"><label>Phone / WhatsApp</label><input id="poSupplierPhone"></div>
        <div class="field"><label>Email</label><input id="poSupplierEmail" type="email"></div>
        <div class="field"><label>Country</label><input id="poSupplierCountry"></div>
        <div class="field full"><label>Supplier Address</label><textarea id="poSupplierAddress"></textarea></div>
        <div class="section">Commercial</div>
        <div class="field"><label>Currency</label><select id="poCurrency" onchange="renderPOEditorTotals()"><option>LKR</option><option>USD</option><option>CNY</option><option>EUR</option></select></div>
        <div class="field"><label>VAT Mode</label><select id="poVatMode" onchange="renderPOEditorTotals()"><option value="none">No VAT Breakdown</option><option value="vat18">VAT Inclusive - Show 18% Breakdown</option></select><div class="hint">Same logic as New Document: entered prices remain VAT inclusive; VAT is backed out only for the breakdown.</div></div>
        <div class="field"><label>Payment Terms</label><input id="poPaymentTerms" placeholder="e.g. 30% advance / balance before shipment"></div>
        <div class="field"><label>Shipping Method</label><input id="poShippingMethod" placeholder="Courier / Sea / Air / Local Delivery"></div>
        <div class="field"><label>Supplier Quotation / Reference</label><input id="poSupplierRef"></div>
      </div>
      <div class="section" style="margin-top:14px">Items</div>
      <datalist id="poItemOptions"></datalist>
      <div class="hint" style="margin-bottom:6px">Type an item description and choose a saved suggestion to auto-fill specification, unit and the last compatible unit price.</div>
      <div class="po-line-scroll"><table class="po-editor-lines"><thead><tr><th style="width:25%">Description *</th><th style="width:21%">Specification</th><th style="width:10%">Unit</th><th style="width:10%">Ordered Qty</th><th style="width:12%">Unit Price</th><th style="width:10%">Received</th><th style="width:9%">Balance</th><th style="width:3%"></th></tr></thead><tbody id="poLineRows"></tbody></table></div>
      <div class="actions"><button class="btn ghost sm" onclick="addPurchaseOrderLine()">+ Add Item</button></div>
      <div class="grid" style="margin-top:12px"><div class="field"><label>Shipping / Freight</label><input id="poShippingCharge" type="number" step="0.01" min="0" oninput="renderPOEditorTotals()"></div><div class="field"><label>Other Charges</label><input id="poOtherCharge" type="number" step="0.01" min="0" oninput="renderPOEditorTotals()"></div><div class="field"><label>Discount</label><input id="poDiscount" type="number" step="0.01" min="0" oninput="renderPOEditorTotals()"></div><div class="field full"><label>PO Notes / Delivery Instructions</label><textarea id="poNotes"></textarea></div></div>
      <div id="poEditorTotals" class="po-totalbox"></div>
      <div class="section" style="margin-top:14px">Activity</div><div id="poHistory" class="po-history"></div>
      <div class="actions"><button class="btn primary" onclick="savePurchaseOrder()">Save PO</button><button class="btn navy" onclick="saveAndDownloadPurchaseOrder()">Save & PDF</button><button id="poMarkSentBtn" class="btn amber" onclick="markCurrentPurchaseOrderSent()">Mark Sent</button><button id="poReceiveBtn" class="btn green" onclick="openCurrentPOReceipt()">Receive Goods</button></div>
    </div></div></div>
    <div id="poReceiptModal" class="modal"><div class="modal-card" style="width:min(900px,95vw)"><div class="modal-head"><b>Receive Goods Against Purchase Order</b><button class="closex" onclick="closeModal('poReceiptModal')">×</button></div><div class="modal-body"><input id="poReceiptId" type="hidden"><div id="poReceiptInfo" class="notice"></div><div id="poReceiptRows" style="margin-top:10px"></div><div class="field" style="margin-top:10px"><label>Receipt / Shipment Note</label><input id="poReceiptNote" placeholder="GRN, shipment, courier or receiving note"></div><div class="actions"><button class="btn green" onclick="savePurchaseOrderReceipt()">Post Receipt</button></div></div></div></div>`);
  }

  function poStatusClass(s=''){return String(s).toLowerCase().replace(/\s+/g,'-')}
  function poNumberNext(){
    const year=new Date().getFullYear(),prefix=`SC/PO/${year}/`,nums=(state.purchaseOrders||[]).map(p=>String(p.poNo||'')).filter(x=>x.startsWith(prefix)).map(x=>Number(x.split('/').pop())||0),n=(nums.length?Math.max(...nums):0)+1;return prefix+String(n).padStart(4,'0')
  }
  function poTotals(po){
    const lines=po?.lines||[],subtotal=lines.reduce((n,l)=>n+Number(l.qty||0)*Number(l.unitPrice||0),0),shipping=Number(po?.shippingCharge||0),other=Number(po?.otherCharge||0),discount=Number(po?.discount||0),total=subtotal+shipping+other-discount;
    let net=total,vat=0;
    if(po?.vatMode==='vat18'){
      const r=Number(state.settings.vat||18)/100;
      net=total/(1+r);
      vat=total-net
    }
    return{subtotal,shipping,other,discount,total,gross:total,net,vat}
  }
  function poCurrency(v='LKR'){return String(v||'LKR').toUpperCase()}
  function poMoney(v,c='LKR'){return `${poCurrency(c)} ${money(Number(v||0))}`}
  function poProgress(po){const lines=po?.lines||[],ordered=lines.reduce((n,l)=>n+Number(l.qty||0),0),received=lines.reduce((n,l)=>n+Math.min(Number(l.qty||0),Number(l.receivedQty||0)),0);return{ordered,received,balance:Math.max(0,ordered-received),pct:ordered?Math.min(100,received/ordered*100):0}}
  function poDerivedStatus(po,selected){
    if(selected==='Cancelled')return 'Cancelled';const lines=po.lines||[],ordered=lines.reduce((n,l)=>n+Number(l.qty||0),0),received=lines.reduce((n,l)=>n+Math.min(Number(l.qty||0),Number(l.receivedQty||0)),0);if(ordered>0&&received>=ordered)return 'Received';if(received>0)return 'Partially Received';return selected||po.status||'Draft'
  }
  function poHistoryHtml(po){return (po?.history||[]).slice().reverse().map(h=>`<div class="po-history-item"><b>${esc(h.status||h.action||'Update')}</b> — ${esc(h.note||'')}<div class="small">${esc(h.by||'')} • ${esc(h.at?new Date(h.at).toLocaleString():'')}</div></div>`).join('')||'<div class="small">No activity yet.</div>'}
  function poAdminPasswordOK(action='save changes to this Purchase Order'){
    const admins=(state.users||[]).filter(u=>u&&u.role==='admin'&&u.active!==false&&u.password);
    if(!admins.length){toast('No active administrator account is available');return false}
    if(window.__scPasswordBypassV1024?.admin>0){
      window.__scPasswordBypassV1024.admin--;
      return true
    }
    if(typeof window.securePasswordGateV1024==='function'){
      window.securePasswordGateV1024({
        kind:'admin',
        action,
        retryTarget:window.event?.currentTarget||document.activeElement
      });
      return false
    }
    return false
  }
  window.poAdminPasswordOK=poAdminPasswordOK;

  window.renderPurchaseOrders=function(){
    if(!$('poList'))return;state.purchaseOrders=state.purchaseOrders||[];if(currentUser?.role!=='admin'&&!hasPerm('purchase_orders_view')){$('poList').innerHTML='<div class="empty">Purchase Orders access is not enabled for this user.</div>';return}
    const a=state.purchaseOrders||[],q=($('poSearch')?.value||'').trim().toLowerCase(),sf=$('poStatusFilter')?.value||'',filtered=a.filter(po=>(!sf||po.status===sf)&&(!q||[po.poNo,po.supplier?.name,po.supplierRef,...(po.lines||[]).map(l=>l.description+' '+l.spec)].join(' ').toLowerCase().includes(q))).sort((x,y)=>String(y.updatedAt||y.createdAt||'').localeCompare(String(x.updatedAt||x.createdAt||'')));
    const counts={draft:0,sent:0,partial:0,received:0,cancelled:0};a.forEach(p=>{if(p.status==='Draft'||p.status==='Approved')counts.draft++;if(p.status==='Sent'||p.status==='Supplier Confirmed')counts.sent++;if(p.status==='Partially Received')counts.partial++;if(p.status==='Received')counts.received++;if(p.status==='Cancelled')counts.cancelled++});
    $('poKpis').innerHTML=`<div class="po-kpi"><span>Total POs</span><b>${a.length}</b></div><div class="po-kpi"><span>Draft / Approved</span><b>${counts.draft}</b></div><div class="po-kpi sent"><span>Sent / Confirmed</span><b>${counts.sent}</b></div><div class="po-kpi partial"><span>Partial</span><b>${counts.partial}</b></div><div class="po-kpi received"><span>Received</span><b>${counts.received}</b></div>`;
    $('poList').innerHTML=filtered.length?`<div style="overflow:auto"><table class="table"><thead><tr><th>PO / Date</th><th>Supplier</th><th>Value</th><th>Receiving</th><th>Status</th><th>Owner</th><th></th></tr></thead><tbody>${filtered.map(po=>{const t=poTotals(po),p=poProgress(po);return `<tr><td><b>${esc(po.poNo||'')}</b><div class="small">${esc(po.date||'')} ${po.expectedDate?'• Expected '+esc(po.expectedDate):''}</div></td><td><b>${esc(po.supplier?.name||'-')}</b><div class="small">${esc(po.supplierRef||po.supplier?.country||'')}</div></td><td><b>${esc(poMoney(t.total,po.currency))}</b><div class="small">${(po.lines||[]).length} item(s)${po.vatMode==='vat18'?` • VAT ${money(Number(state.settings.vat||18))}% incl.`:''}</div></td><td><div class="po-receiving-list">${(po.lines||[]).map(l=>{const ordered=Number(l.qty||0),received=Math.min(ordered,Number(l.receivedQty||0)),balance=Math.max(0,ordered-received),pct=ordered?Math.min(100,received/ordered*100):0;return `<div class="po-receive-mini"><div class="po-receive-mini-head"><b>${esc(l.description||'Item')}</b><span>${money(received)} / ${money(ordered)} ${esc(l.unit||'')}</span></div>${l.spec?`<div class="po-receive-mini-spec">${esc(l.spec)}</div>`:''}<div class="po-progress mini"><span style="width:${pct}%"></span></div><div class="po-receive-mini-balance ${balance>0?'po-balance-bad':'po-balance-ok'}">Balance ${money(balance)} ${esc(l.unit||'')}</div></div>`}).join('')||'<div class="small">No items</div>'}</div><div class="po-receive-total"><b>Total:</b> ${money(p.received)} / ${money(p.ordered)} <span class="${p.balance>0?'po-balance-bad':'po-balance-ok'}">• Balance ${money(p.balance)}</span></div></td><td><span class="po-status ${poStatusClass(po.status)}">${esc(po.status||'Draft')}</span></td><td>${esc(po.createdByDisplay||po.createdBy||'-')}</td><td><div class="actions" style="margin:0"><button class="btn ghost sm" onclick="openPurchaseOrder('${po.id}')">Open</button><button class="btn navy sm" onclick="downloadPurchaseOrderPDF('${po.id}')">PDF</button>${!['Draft','Cancelled','Received'].includes(po.status)?`<button class="btn green sm" onclick="openPurchaseOrderReceipt('${po.id}')">Receive</button>`:''}</div></td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">No purchase orders found.</div>'
  };

  function poNorm(v=''){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
  function poRecordTime(po){return Date.parse(po?._spgsUpdatedAt||po?.updatedAt||po?.createdAt||0)||0}
  function poSupplierLibrary(){
    const map=new Map(),orders=[...(state.purchaseOrders||[])].sort((a,b)=>poRecordTime(b)-poRecordTime(a));
    orders.forEach(po=>{const x=po?.supplier||{},key=poNorm(x.name);if(key&&!map.has(key))map.set(key,{name:x.name||'',contact:x.contact||'',phone:x.phone||'',email:x.email||'',country:x.country||'',address:x.address||'',lastPo:po.poNo||'',updatedAt:po._spgsUpdatedAt||po.updatedAt||po.createdAt||''})});
    return [...map.values()]
  }
  function poItemLibrary(){
    const map=new Map(),orders=[...(state.purchaseOrders||[])].sort((a,b)=>poRecordTime(b)-poRecordTime(a));
    orders.forEach(po=>(po.lines||[]).forEach(l=>{const key=[poNorm(l.description),poNorm(l.spec),poNorm(l.unit),poNorm(po.supplier?.name),poCurrency(po.currency)].join('|');if(!poNorm(l.description))return;if(!map.has(key))map.set(key,{description:l.description||'',spec:l.spec||'',unit:l.unit||'Units',unitPrice:Number(l.unitPrice||0),currency:po.currency||'',supplierName:po.supplier?.name||'',lastPo:po.poNo||'',updatedAt:po._spgsUpdatedAt||po.updatedAt||po.createdAt||''})}));
    return [...map.values()]
  }
  function poItemOptionValue(x){return x?.spec?`${x.description} — ${x.spec}`:(x?.description||'')}
  window.refreshPOAutoCompleteLists=function(){
    const suppliers=$('poSupplierOptions'),items=$('poItemOptions');
    if(suppliers)suppliers.innerHTML=poSupplierLibrary().map(x=>`<option value="${esc(x.name)}">${esc([x.phone,x.country,x.address].filter(Boolean).join(' • ').slice(0,180))}</option>`).join('');
    if(items)items.innerHTML=poItemLibrary().map(x=>`<option value="${esc(poItemOptionValue(x))}">${esc([x.unit,x.currency&&x.unitPrice?`${x.currency} ${money(x.unitPrice)}`:'',x.supplierName].filter(Boolean).join(' • ').slice(0,180))}</option>`).join('')
  };
  window.poSupplierInputChanged=function(force=false){
    refreshPOAutoCompleteLists();
    const name=$('poSupplier')?.value||'',x=poSupplierLibrary().find(s=>poNorm(s.name)===poNorm(name));
    if(!x)return;
    $('poSupplierContact').value=x.contact||'';$('poSupplierPhone').value=x.phone||'';$('poSupplierEmail').value=x.email||'';$('poSupplierCountry').value=x.country||'';$('poSupplierAddress').value=x.address||'';
    if(force)toast(`Supplier details loaded${x.lastPo?' from '+x.lastPo:''}`)
  };
  window.poItemInputChanged=function(input,force=false){
    refreshPOAutoCompleteLists();
    const tr=input?.closest('.po-edit-line');if(!tr)return;
    const raw=input.value||'',currentSupplier=poNorm($('poSupplier')?.value||''),currentCurrency=poCurrency($('poCurrency')?.value||'LKR'),lib=poItemLibrary();
    let x=lib.find(v=>poNorm(poItemOptionValue(v))===poNorm(raw));
    if(!x&&tr._poChosenItem&&poNorm(tr._poChosenItem.description)===poNorm(raw))x=tr._poChosenItem;
    if(!x){let choices=lib.filter(v=>poNorm(v.description)===poNorm(raw));if(!choices.length)return;choices.sort((a,b)=>{const as=poNorm(a.supplierName)===currentSupplier?1:0,bs=poNorm(b.supplierName)===currentSupplier?1:0,ac=poCurrency(a.currency)===currentCurrency?1:0,bc=poCurrency(b.currency)===currentCurrency?1:0;return (bs-as)||(bc-ac)||(Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0))});x=choices[0]}
    tr._poChosenItem=x;input.value=x.description||raw;
    const spec=tr.querySelector('.pol-spec'),unit=tr.querySelector('.pol-unit'),price=tr.querySelector('.pol-price');
    if(spec)spec.value=x.spec||'';if(unit&&[...unit.options].some(o=>o.value===x.unit))unit.value=x.unit;
    if(price){if(!x.currency||poCurrency(x.currency)===currentCurrency)price.value=Number(x.unitPrice||0)||'';else if(!price.value)price.value=''}
    renderPOEditorTotals();
    if(force){const sameCurrency=!x.currency||poCurrency(x.currency)===currentCurrency;toast(sameCurrency?`Saved item loaded${x.lastPo?' from '+x.lastPo:''}`:`Item details loaded. Saved price is ${poCurrency(x.currency)}; current PO is ${currentCurrency}, so price was not copied.`)}
  };

  window.addPurchaseOrderLine=function(line={}){const body=$('poLineRows');if(!body)return;const tr=document.createElement('tr');tr.className='po-edit-line';tr.innerHTML=`<td><input class="pol-desc" list="poItemOptions" autocomplete="off" value="${esc(line.description||'')}" placeholder="Type item / material" oninput="poItemInputChanged(this)" onchange="poItemInputChanged(this,true)"></td><td><input class="pol-spec" value="${esc(line.spec||'')}" placeholder="Size / model / specification"></td><td><select class="pol-unit"><option ${line.unit==='Rolls'?'selected':''}>Rolls</option><option ${line.unit==='Pcs'?'selected':''}>Pcs</option><option ${line.unit==='Units'?'selected':''}>Units</option><option ${line.unit==='Kg'?'selected':''}>Kg</option><option ${line.unit==='Meters'?'selected':''}>Meters</option><option ${line.unit==='Cartons'?'selected':''}>Cartons</option><option ${line.unit==='Sets'?'selected':''}>Sets</option></select></td><td><input class="pol-qty" type="number" min="0" step="0.01" value="${Number(line.qty||0)||''}" oninput="renderPOEditorTotals()"></td><td><input class="pol-price" type="number" min="0" step="0.0001" value="${Number(line.unitPrice||0)||''}" oninput="renderPOEditorTotals()"></td><td><input class="pol-received" type="number" value="${Number(line.receivedQty||0)}" readonly></td><td class="pol-balance">${money(Math.max(0,Number(line.qty||0)-Number(line.receivedQty||0)))}</td><td><button class="btn red sm" type="button" onclick="this.closest('tr').remove();renderPOEditorTotals()">×</button></td>`;body.appendChild(tr);tr.querySelector('.pol-qty').addEventListener('input',()=>{tr.querySelector('.pol-balance').textContent=money(Math.max(0,Number(tr.querySelector('.pol-qty').value||0)-Number(tr.querySelector('.pol-received').value||0)))})};
  function collectPOLines(){return [...document.querySelectorAll('#poLineRows .po-edit-line')].map((tr,i)=>({id:tr.dataset.lineId||`line_${i+1}`,description:tr.querySelector('.pol-desc').value.trim(),spec:tr.querySelector('.pol-spec').value.trim(),unit:tr.querySelector('.pol-unit').value,qty:Number(tr.querySelector('.pol-qty').value||0),unitPrice:Number(tr.querySelector('.pol-price').value||0),receivedQty:Number(tr.querySelector('.pol-received').value||0)})).filter(l=>l.description||l.qty||l.unitPrice)}
  window.renderPOEditorTotals=function(){
    if(!$('poEditorTotals'))return;
    const vatMode=$('poVatMode')?.value||'none',temp={lines:collectPOLines(),shippingCharge:Number($('poShippingCharge')?.value||0),otherCharge:Number($('poOtherCharge')?.value||0),discount:Number($('poDiscount')?.value||0),vatMode},t=poTotals(temp),c=$('poCurrency')?.value||'LKR',rate=Number(state.settings.vat||18);
    const components=`<div class="po-totalrow"><span>Items Subtotal (VAT Incl.)</span><b>${esc(poMoney(t.subtotal,c))}</b></div><div class="po-totalrow"><span>Shipping / Freight</span><b>${esc(poMoney(t.shipping,c))}</b></div><div class="po-totalrow"><span>Other Charges</span><b>${esc(poMoney(t.other,c))}</b></div><div class="po-totalrow"><span>Discount</span><b>- ${esc(poMoney(t.discount,c))}</b></div>`;
    $('poEditorTotals').innerHTML=vatMode==='vat18'?`${components}<div class="po-totalrow"><span>Subtotal / Net (Excl. VAT)</span><b>${esc(poMoney(t.net,c))}</b></div><div class="po-totalrow"><span>VAT ${money(rate)}%</span><b>${esc(poMoney(t.vat,c))}</b></div><div class="po-totalrow grand"><span>TOTAL (Incl. VAT)</span><b>${esc(poMoney(t.total,c))}</b></div>`:`${components}<div class="po-totalrow grand"><span>Grand Total</span><b>${esc(poMoney(t.total,c))}</b></div>`
  };

  window.openPurchaseOrder=function(id=''){
    if(!requirePerm('purchase_orders_view','use purchase orders'))return;const po=state.purchaseOrders.find(x=>x.id===id)||{id:'',poNo:poNumberNext(),date:today(),expectedDate:'',status:'Draft',currency:'USD',vatMode:'none',supplier:{},lines:[],shippingCharge:0,otherCharge:0,discount:0,history:[]};
    $('poId').value=po.id||'';$('poNumber').value=po.poNo||poNumberNext();$('poStatus').value=po.status||'Draft';$('poDate').value=po.date||today();$('poExpectedDate').value=po.expectedDate||'';$('poSupplier').value=po.supplier?.name||'';$('poSupplierContact').value=po.supplier?.contact||'';$('poSupplierPhone').value=po.supplier?.phone||'';$('poSupplierEmail').value=po.supplier?.email||'';$('poSupplierCountry').value=po.supplier?.country||'';$('poSupplierAddress').value=po.supplier?.address||'';$('poCurrency').value=po.currency||'USD';$('poVatMode').value=po.vatMode||'none';$('poPaymentTerms').value=po.paymentTerms||'';$('poShippingMethod').value=po.shippingMethod||'';$('poSupplierRef').value=po.supplierRef||'';$('poShippingCharge').value=po.shippingCharge||'';$('poOtherCharge').value=po.otherCharge||'';$('poDiscount').value=po.discount||'';$('poNotes').value=po.notes||'';$('poLineRows').innerHTML='';(po.lines?.length?po.lines:[{}]).forEach(l=>{addPurchaseOrderLine(l);const tr=$('poLineRows').lastElementChild;if(tr)tr.dataset.lineId=l.id||uid('pol')});$('poHistory').innerHTML=poHistoryHtml(po);$('poModalTitle').textContent=po.id?`Purchase Order — ${po.poNo}`:'New Supplier Purchase Order';$('poMarkSentBtn').style.display=po.id&&!['Sent','Supplier Confirmed','Partially Received','Received','Cancelled'].includes(po.status)?'inline-block':'none';$('poReceiveBtn').style.display=po.id&&!['Draft','Cancelled','Received'].includes(po.status)?'inline-block':'none';refreshPOAutoCompleteLists();renderPOEditorTotals();$('purchaseOrderModal').classList.add('show')
  };

  window.savePurchaseOrder=function(keepOpen=false){
    if(!requirePerm('purchase_orders_view','save purchase orders'))return null;
    const existingId=$('poId').value,id=existingId||uid('po'),old=state.purchaseOrders.find(x=>x.id===id)||{},lines=collectPOLines();
    if(!$('poSupplier').value.trim())return toast('Supplier name is required');
    if(!lines.length||lines.some(l=>!l.description||!(l.qty>0)))return toast('Add at least one item with description and ordered quantity');
    if(!poAdminPasswordOK(`save ${old.poNo||$('poNumber').value||'this Purchase Order'}`))return null;
    const now=new Date().toISOString(),selected=$('poStatus').value,po={...old,id,poNo:$('poNumber').value||poNumberNext(),date:$('poDate').value||today(),expectedDate:$('poExpectedDate').value||'',supplier:{name:$('poSupplier').value.trim(),contact:$('poSupplierContact').value.trim(),phone:$('poSupplierPhone').value.trim(),email:$('poSupplierEmail').value.trim(),country:$('poSupplierCountry').value.trim(),address:$('poSupplierAddress').value.trim()},currency:$('poCurrency').value,vatMode:$('poVatMode').value||'none',paymentTerms:$('poPaymentTerms').value.trim(),shippingMethod:$('poShippingMethod').value.trim(),supplierRef:$('poSupplierRef').value.trim(),lines,shippingCharge:Number($('poShippingCharge').value||0),otherCharge:Number($('poOtherCharge').value||0),discount:Number($('poDiscount').value||0),notes:$('poNotes').value.trim(),createdAt:old.createdAt||now,createdBy:old.createdBy||currentUser?.username||'',createdByDisplay:old.createdByDisplay||currentUser?.display||currentUser?.username||'',updatedAt:now,updatedBy:currentUser?.username||'',history:Array.isArray(old.history)?[...old.history]:[]};po.status=poDerivedStatus(po,selected);if(!old.id)po.history.push({status:'Draft',note:'Purchase order created',by:currentUser?.display||currentUser?.username||'',at:now});else if(old.status!==po.status)po.history.push({status:po.status,note:`Status changed from ${old.status||'Draft'} to ${po.status}`,by:currentUser?.display||currentUser?.username||'',at:now});const i=state.purchaseOrders.findIndex(x=>x.id===id);if(i>=0)state.purchaseOrders[i]=po;else state.purchaseOrders.unshift(po);audit('SAVE_PURCHASE_ORDER',`${po.poNo} ${po.supplier.name} ${po.status}`);saveState();refreshPOAutoCompleteLists();renderPurchaseOrders();if(keepOpen){$('poId').value=id;$('poHistory').innerHTML=poHistoryHtml(po)}else closeModal('purchaseOrderModal');toast(`Purchase Order ${po.poNo} saved`);return po
  };
  window.markCurrentPurchaseOrderSent=function(){const po=savePurchaseOrder(true);if(po)markPurchaseOrderSent(po.id)};
  window.markPurchaseOrderSent=function(id){const po=state.purchaseOrders.find(x=>x.id===id);if(!po)return;po.status='Sent';po.updatedAt=new Date().toISOString();po.updatedBy=currentUser?.username||'';po.history=po.history||[];po.history.push({status:'Sent',note:'Purchase order marked as sent to supplier',by:currentUser?.display||currentUser?.username||'',at:po.updatedAt});saveState();renderPurchaseOrders();openPurchaseOrder(id);toast('PO marked as Sent')};
  window.openCurrentPOReceipt=function(){const id=$('poId').value;if(id)openPurchaseOrderReceipt(id)};
  window.openPurchaseOrderReceipt=function(id){const po=state.purchaseOrders.find(x=>x.id===id);if(!po)return;$('poReceiptId').value=id;$('poReceiptInfo').innerHTML=`<b>${esc(po.poNo)}</b> • ${esc(po.supplier?.name||'')} • ${esc(po.status||'')}`;$('poReceiptRows').innerHTML=(po.lines||[]).map((l,i)=>{const bal=Math.max(0,Number(l.qty||0)-Number(l.receivedQty||0));return `<div class="po-receive-row" data-index="${i}"><div><b>${esc(l.description)}</b><div class="small">${esc(l.spec||'')} • ${esc(l.unit||'')}</div></div><div><span class="small">Ordered</span><br><b>${money(l.qty)}</b></div><div><span class="small">Received</span><br><b>${money(l.receivedQty||0)}</b></div><div><span class="small">Balance</span><br><b>${money(bal)}</b></div><div><label class="small">Receive now</label><input class="po-receive-now" type="number" min="0" max="${bal}" step="0.01" value="0" ${bal<=0?'disabled':''}></div></div>`}).join('');$('poReceiptNote').value='';$('poReceiptModal').classList.add('show')};
  window.savePurchaseOrderReceipt=function(){
    const id=$('poReceiptId').value,po=state.purchaseOrders.find(x=>x.id===id);if(!po)return;
    let total=0;const receivedParts=[];
    document.querySelectorAll('#poReceiptRows .po-receive-row').forEach(row=>{
      const i=Number(row.dataset.index),l=po.lines[i],bal=Math.max(0,Number(l.qty||0)-Number(l.receivedQty||0)),n=Math.max(0,Math.min(bal,Number(row.querySelector('.po-receive-now').value||0)));
      if(n>0){
        l.receivedQty=Number(l.receivedQty||0)+n;
        total+=n;
        receivedParts.push(`${l.description||'Item'}: ${money(n)} ${l.unit||'Units'}`)
      }
    });
    if(!(total>0))return toast('Enter a received quantity');
    po.status=poDerivedStatus(po,po.status);po.updatedAt=new Date().toISOString();po.updatedBy=currentUser?.username||'';po.history=po.history||[];
    const receiptNote=$('poReceiptNote').value.trim();
    po.history.push({status:po.status,note:`Received ${receivedParts.join(' • ')}${receiptNote?' • '+receiptNote:''}`,by:currentUser?.display||currentUser?.username||'',at:po.updatedAt});
    audit('RECEIVE_PURCHASE_ORDER',`${po.poNo} ${receivedParts.join(' | ')}`);saveState();closeModal('poReceiptModal');renderPurchaseOrders();if($('purchaseOrderModal').classList.contains('show'))openPurchaseOrder(id);toast(`Receipt posted — ${po.status}`)
  };

  function buildPurchaseOrderPDFHTML(po){
    const t=poTotals(po),currency=po.currency||'LKR',supplier=po.supplier||{},prepared=po.createdByDisplay||po.createdBy||currentUser?.display||currentUser?.username||'',notes=String(po.notes||'').trim(),vatMode=po.vatMode==='vat18',vatRate=Number(state.settings.vat||18),vatFactor=1+vatRate/100;
    const lineRows=(po.lines||[]).map((l,i)=>{
      const entered=Number(l.unitPrice||0),unitPrice=vatMode?entered/vatFactor:entered,amount=Number(l.qty||0)*unitPrice;
      return `<tr><td><b>${esc(l.description||'')}</b></td><td>${esc(l.spec||'-')}</td><td class="r">${money(l.qty)} ${esc(l.unit||'')}</td><td class="r">${esc(poCurrency(currency))} ${money(unitPrice)}</td><td class="r"><b>${esc(poCurrency(currency))} ${money(amount)}</b></td></tr>`
    }).join('');
    const commercial=vatMode
      ?`<div class="commercial-summary po-commercial-summary"><div class="sumtitle">Commercial Summary</div><div class="sumrow"><span>Items Subtotal (VAT Incl.)</span><b>${esc(poMoney(t.subtotal,currency))}</b></div>${t.shipping?`<div class="sumrow"><span>Shipping / Freight</span><b>${esc(poMoney(t.shipping,currency))}</b></div>`:''}${t.other?`<div class="sumrow"><span>Other Charges</span><b>${esc(poMoney(t.other,currency))}</b></div>`:''}${t.discount?`<div class="sumrow"><span>Discount</span><b>- ${esc(poMoney(t.discount,currency))}</b></div>`:''}<div class="sumrow"><span>Subtotal / Net (Excl. VAT)</span><b>${esc(poMoney(t.net,currency))}</b></div><div class="sumrow"><span>VAT ${money(vatRate)}%</span><b>${esc(poMoney(t.vat,currency))}</b></div><div class="sumrow grand"><span>TOTAL (Incl. VAT)</span><b>${esc(poMoney(t.total,currency))}</b></div></div>`
      :`<div class="commercial-summary po-commercial-summary"><div class="sumtitle">Commercial Summary</div><div class="sumrow"><span>Subtotal</span><b>${esc(poMoney(t.subtotal,currency))}</b></div>${t.shipping?`<div class="sumrow"><span>Shipping / Freight</span><b>${esc(poMoney(t.shipping,currency))}</b></div>`:''}${t.other?`<div class="sumrow"><span>Other Charges</span><b>${esc(poMoney(t.other,currency))}</b></div>`:''}${t.discount?`<div class="sumrow"><span>Discount</span><b>- ${esc(poMoney(t.discount,currency))}</b></div>`:''}<div class="sumrow grand"><span>TOTAL PURCHASE ORDER VALUE</span><b>${esc(poMoney(t.total,currency))}</b></div></div>`;
    const terms=[
      ['Payment Terms',po.paymentTerms||'As mutually agreed with the supplier.'],
      ['Shipping Method',po.shippingMethod||'As mutually agreed with the supplier.'],
      ['Expected Delivery',po.expectedDate||'As agreed with the supplier.'],
      ['Supplier Reference',po.supplierRef||'-'],
      ['Confirmation','Please confirm acceptance of this purchase order and advise any quantity, pricing or delivery variation before dispatch.']
    ];
    const priceHead=vatMode?'Unit Price (Excl. VAT)':'Unit Price',amountHead=vatMode?'Amount (Excl. VAT)':'Amount';
    return `<div class="docbody po-docbody"><div class="dochead"><div class="doctype teal">PURCHASE ORDER</div><div class="docmeta"><b>PO NO.</b> &nbsp; ${esc(po.poNo||'')}<br><b>DATE</b> &nbsp; ${esc(po.date||'')}<br><b>EXPECTED</b> &nbsp; ${esc(po.expectedDate||'-')}</div></div><div class="customerbox po-supplier-box"><div class="left"><div class="label">Supplier</div><div class="custname">${esc(supplier.name||'')}</div><div class="custaddr">${esc(supplier.address||'').replace(/\n/g,'<br>')}${supplier.contact?`<br>${esc(supplier.contact)}`:''}${supplier.phone?`<br>${esc(supplier.phone)}`:''}${supplier.email?`<br>${esc(supplier.email)}`:''}${supplier.country?`<br>${esc(supplier.country)}`:''}</div></div><div class="docmeta"><b>CURRENCY</b> &nbsp; ${esc(poCurrency(currency))}<br><b>VAT MODE</b> &nbsp; ${vatMode?`VAT INCLUSIVE / ${money(vatRate)}% BREAKDOWN`:'NO VAT BREAKDOWN'}<br><b>STATUS</b> &nbsp; ${esc(String(po.status||'Draft').toUpperCase())}<br><b>PREPARED BY</b> &nbsp; ${esc(prepared)}</div></div><div class="pricing-banner po-order-banner"><span>SUPPLIER PURCHASE ORDER</span><span>${vatMode?'VAT INCLUSIVE':esc(poCurrency(currency))}</span></div><div class="docsection">${vatMode?'ITEMS & VAT BREAKDOWN':'ITEMS & ORDER DETAILS'}</div><table class="doctable po-pdf-table"><thead><tr><th style="width:23%">Description</th><th style="width:34%">Specification</th><th class="r" style="width:13%">Qty</th><th class="r" style="width:14%">${priceHead}</th><th class="r" style="width:16%">${amountHead}</th></tr></thead><tbody>${lineRows}</tbody></table>${commercial}${notes?`<div class="benefit po-note-box"><b>PO NOTES / DELIVERY INSTRUCTIONS</b>${esc(notes).replace(/\n/g,'<br>')}</div>`:''}<div class="terms po-terms"><h4>TERMS & CONDITIONS</h4>${terms.map(x=>`<div class="termrow"><b>${esc(x[0])}:</b> ${esc(x[1])}</div>`).join('')}</div></div><div class="docfoot"><b>Please confirm receipt and acceptance of this Purchase Order.</b><span>Computer Generated Purchase Order - Signature Not Required</span></div>`
  }

  window.downloadPurchaseOrderPDF=async function(id){
    const po=state.purchaseOrders.find(x=>x.id===id);if(!po)return;
    const okC=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',()=>window.html2canvas),okP=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',()=>window.jspdf);
    if(!okC||!okP)return toast('PDF libraries unavailable');
    const host=document.createElement('div');host.className='pdf-capture-host po-pdf-capture';host.innerHTML=`<div class="paper po-pdf-paper">${buildPurchaseOrderPDFHTML(po)}</div>`;document.body.appendChild(host);
    try{
      const paper=host.querySelector('.paper'),canvas=await html2canvas(paper,{scale:2,backgroundColor:'#fff',useCORS:true,logging:false}),{jsPDF}=window.jspdf,pdf=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
      pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,210,297,undefined,'FAST');
      pdf.save(`${String(po.poNo).replace(/[\/:*?"<>|]/g,'-')}.pdf`);audit('DOWNLOAD_PURCHASE_ORDER',po.poNo)
    }finally{host.remove()}
  };
  window.saveAndDownloadPurchaseOrder=async function(){const po=savePurchaseOrder(true);if(po)await downloadPurchaseOrderPDF(po.id)};

  const showPOBase=showView;showView=function(id){const r=showPOBase(id);if(id==='purchaseorders')renderPurchaseOrders();return r};
  const refreshPOBase=refreshAll;refreshAll=function(){refreshPOBase();if($('purchaseorders'))renderPurchaseOrders()};
  applyUserAccess();renderPurchaseOrders();refreshPOAutoCompleteLists();
})();
