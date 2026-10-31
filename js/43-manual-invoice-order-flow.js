
/* =====================================================================
   SoftCreation Manual Invoice Manager v1.1.10
   Native BOS tab + Supabase DB + secure ERP customer Edge Function.
   Existing Quotation / PI / Sales Order / Production / Factory logic is
   intentionally left unchanged.
   ===================================================================== */
(function(){
'use strict';

const MI_REST='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1';
const MI_FUNCTION='https://qyxgamverzdmhtvezbft.supabase.co/functions/v1/erp-customer-search';
const MI_WORKSPACE='softcreation_main';
const MI_KEY_STORE='spgs_supabase_browser_key_v1';
const MI_TEMPLATE='assets/images/manual-invoice-template.png';

const MI_FEATURES=[
  ['manual_invoice_view','Manual Invoices — Access'],
  ['manual_invoice_create','Manual Invoices — Create / Edit'],
  ['manual_invoice_payment','Manual Invoices — Record / Edit Payments'],
  ['manual_invoice_finalize','Manual Invoices — Mark ERP Updated / Lock']
];

let miDb={invoices:[],lines:[],payments:[],audit:[]};
let miPage='dashboard';
let miEditingId='';
let miDraftPayments=[];
let miSelectedErpCustomer=null;
let miCustomerRows=[];
let miCustomerTimer=null;
let miCustomerSeq=0;
let miLocked=false;
let miViewingId='';

const mi$=id=>document.getElementById(id);
const miNum=v=>Number(v||0);
const miToday=()=>new Date().toISOString().slice(0,10);
const miEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const miMoney=v=>miNum(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

function miKey(){
  const key=String(localStorage.getItem(MI_KEY_STORE)||'').trim();
  if(!key)throw new Error('Supabase browser key is not configured on this device.');
  return key;
}
function miHeaders(extra={}){
  const key=miKey();
  const h={apikey:key,...extra};
  if(key.startsWith('eyJ'))h.Authorization='Bearer '+key;
  return h;
}
async function miFetch(path,options={}){
  const res=await fetch(MI_REST+path,{...options,headers:miHeaders(options.headers||{})});
  const raw=await res.text();
  let data=null;
  try{data=raw?JSON.parse(raw):null}catch(_){data=raw}
  if(!res.ok){
    const details=[data?.code,data?.message,data?.details,data?.hint].filter(x=>typeof x==='string'&&x.trim()&&x.trim()!=='.').join(' — ');
    const rawText=typeof data==='string'?data.trim():'';
    const body=details || (rawText && rawText!=='.'?rawText:'');
    throw new Error(body?`HTTP ${res.status}: ${body.slice(0,700)}`:`Supabase request failed (HTTP ${res.status}). Check permissions, database function and Network response.`);
  }
  return data;
}
async function miRpc(name,args={}){
  return await miFetch('/rpc/'+name,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(args)
  });
}
async function miEdge(payload){
  const key=miKey();
  const res=await fetch(MI_FUNCTION,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      apikey:key,
      Authorization:'Bearer '+key
    },
    body:JSON.stringify(payload)
  });
  const raw=await res.text();
  let data=null;
  try{data=raw?JSON.parse(raw):null}catch(_){data=raw}
  if(!res.ok || data?.ok===false){
    throw new Error(data?.error||data?.message||raw||`ERP customer lookup HTTP ${res.status}`);
  }
  return data;
}
function miCan(p){return currentUser?.role==='admin'||hasPerm(p)}

function miInstallPermissions(){
  try{
    MI_FEATURES.forEach(x=>{
      if(!USER_FEATURES.some(y=>y[0]===x[0]))USER_FEATURES.push(x);
    });
    VIEW_PERMS.manualinvoices='manual_invoice_view';
  }catch(_){}
  try{renderUserPrivilegeEditor(null)}catch(_){}
}

function miInstallUI(){
  if(mi$('manualinvoices'))return;

  const nav=document.querySelector('.nav');
  const settings=nav?.querySelector('[data-view="settings"]');
  if(nav){
    const b=document.createElement('button');
    b.className='navbtn';
    b.dataset.view='manualinvoices';
    b.textContent='Manual Invoices';
    b.onclick=()=>showView('manualinvoices');
    nav.insertBefore(b,settings||null);
  }

  const section=document.createElement('section');
  section.id='manualinvoices';
  section.className='view';
  section.innerHTML=`
    <div class="panel mi-shell">
      <div class="panel-title">
        <div class="mi-title-wrap">
          <span>Manual Invoice Manager</span>
          <small>Direct Supplier / ERP Pending Invoice Control</small>
        </div>
        <button class="btn sm mi-head-btn" type="button" onclick="miRefresh(true)">Refresh Live Data</button>
      </div>
      <div class="panel-body">
        <div class="mi-subnav">
          <button data-mi-page="dashboard" onclick="miGo('dashboard')">Dashboard</button>
          <button data-mi-page="editor" onclick="miNewInvoice()">New / Edit Invoice</button>
          <button data-mi-page="pending" onclick="miGo('pending')">ERP Pending <span id="miPendingBadge" class="mi-badge">0</span></button>
          <button data-mi-page="updated" onclick="miGo('updated')">ERP Updated <span id="miUpdatedBadge" class="mi-badge">0</span></button>
          <button data-mi-page="history" onclick="miGo('history')">Invoice History</button>
        </div>
        <div id="miBody"></div>
        <div id="miPrintHost" class="mi-print-host"></div>
      </div>
    </div>`;

  const firstModal=document.querySelector('.modal');
  if(firstModal)firstModal.insertAdjacentElement('beforebegin',section);
  else document.querySelector('.app')?.appendChild(section);

  document.body.insertAdjacentHTML('beforeend',`
    <div id="miPaymentModal" class="mi-modal-backdrop">
      <div class="mi-modal">
        <div class="mi-modal-head"><b>Record Payment</b><button type="button" onclick="miClosePayment()">×</button></div>
        <div class="mi-grid2">
          <div class="field"><label>Date</label><input id="miPayDate" type="date"></div>
          <div class="field"><label>Amount *</label><input id="miPayAmount" type="number" step="0.01" min="0.01"></div>
          <div class="field"><label>Method</label><select id="miPayMethod"><option>Cash</option><option>Bank Transfer</option><option>Card</option><option>Cheque</option><option>Other</option></select></div>
          <div class="field"><label>Reference / Note</label><input id="miPayNote"></div>
        </div>
        <div id="miPayInfo" class="mi-pay-info"></div>
        <div class="actions"><button class="btn ghost" type="button" onclick="miClosePayment()">Cancel</button><button class="btn green" type="button" onclick="miConfirmPayment()">Add Payment</button></div>
      </div>
    </div>`);
}

async function miLoad(){
  const w=encodeURIComponent(MI_WORKSPACE);
  const [invoices,lines,payments,audit]=await Promise.all([
    miFetch(`/spgs_manual_invoices?workspace=eq.${w}&select=*&order=created_at.desc`),
    miFetch('/spgs_manual_invoice_lines?select=*&order=line_no.asc'),
    miFetch('/spgs_manual_invoice_payments?select=*&order=payment_date.asc,created_at.asc'),
    miFetch('/spgs_manual_invoice_audit?select=*&order=created_at.desc')
  ]);
  miDb={invoices:invoices||[],lines:lines||[],payments:payments||[],audit:audit||[]};
}
function miInvoiceObject(row){
  return {
    ...row,
    id:row.id,
    invoiceNo:row.invoice_no,
    invoiceDate:row.invoice_date,
    supplyDate:row.supply_date,
    additionalInfo:row.additional_info||'',
    paymentMode:row.payment_mode||'Cash / Card / Bank Transfer',
    erpCustomerId:row.erp_customer_id||'',
    erpCustomerCode:row.erp_customer_code||'',
    customerName:row.customer_name||'',
    customerTIN:row.customer_tin||'',
    customerEmail:row.customer_email||'',
    customerPhone:row.customer_phone||'',
    customerAddress:row.customer_address||'',
    fulfilmentType:row.fulfilment_type||'Direct Supplier → Customer',
    supplierSource:row.supplier_source||'',
    supplierBill:row.supplier_bill_ref||'',
    courierRef:row.courier_ref||'',
    erpRef:row.erp_ref||'',
    internalNote:row.internal_note||'',
    erpStatus:row.erp_status||'pending',
    createdAt:row.created_at,
    updatedAt:row.updated_at,
    vatEnabled:miDb.lines.some(x=>x.invoice_id===row.id&&x.item_code===MI_VAT_CODE),
    deliveryCharge:miDb.lines.filter(x=>x.invoice_id===row.id&&x.item_code===MI_DELIVERY_CODE).reduce((sum,x)=>sum+miNum(x.qty)*miNum(x.unit_price),0),
    items:miDb.lines.filter(x=>x.invoice_id===row.id&&x.item_code!==MI_VAT_CODE&&x.item_code!==MI_DELIVERY_CODE).map(x=>({
      id:x.id,code:x.item_code||'',desc:x.description||'',qty:miNum(x.qty),unitPrice:miNum(x.unit_price)
    })),
    payments:miDb.payments.filter(x=>x.invoice_id===row.id).map(x=>({
      id:x.id,date:x.payment_date,amount:miNum(x.amount),method:x.method||'',note:x.reference_note||'',createdAt:x.created_at
    }))
  };
}
const MI_VAT_CODE='__SC_MANUAL_VAT_18__';
const MI_DELIVERY_CODE='__SC_MANUAL_DELIVERY_CHARGE__';
function miDeliveryCharge(inv){return Math.max(0,miNum(inv?.deliveryCharge));}
function miSubtotal(inv){return (inv.items||[]).reduce((sum,i)=>sum+miNum(i.qty)*miNum(i.unitPrice),0)}
function miVatAmount(inv){return inv.vatEnabled?Math.round((miSubtotal(inv)*18/118+Number.EPSILON)*100)/100:0}
function miNetAmount(inv){return Math.round((miSubtotal(inv)-miVatAmount(inv)+Number.EPSILON)*100)/100}
function miInvoices(){return miDb.invoices.map(miInvoiceObject)}
function miInvoice(id){const r=miDb.invoices.find(x=>x.id===id);return r?miInvoiceObject(r):null}
function miTotal(inv){return Math.round((miSubtotal(inv)+miDeliveryCharge(inv)+Number.EPSILON)*100)/100}
function miPaid(inv){return (inv.payments||[]).reduce((s,p)=>s+miNum(p.amount),0)}
function miBalance(inv){return Math.max(0,miTotal(inv)-miPaid(inv))}
function miPayStatus(inv){const t=miTotal(inv),p=miPaid(inv);return p<=0?'Unpaid':p+0.005>=t?'Paid':'Partially Paid'}
function miStatusClass(s){return s==='Paid'?'paid':s==='Partially Paid'?'partial':'unpaid'}

window.miRefresh=async function(showToast=false){
  try{
    await miLoad();
    miRender();
    if(showToast)toast('Manual Invoice data refreshed');
  }catch(e){
    console.error('Manual Invoice load failed',e);
    const b=mi$('miBody');
    if(b)b.innerHTML=`<div class="notice"><b>Manual Invoice database is not ready.</b><br>${miEsc(e.message)}<br><br>Run <b>01_MANUAL_INVOICE_DATABASE.sql</b> and deploy the ERP customer Edge Function.</div>`;
    if(showToast)toast('Manual Invoice refresh failed');
  }
};

window.miGo=function(page){
  miPage=page;
  miRender();
};

function miRender(){
  document.querySelectorAll('[data-mi-page]').forEach(b=>b.classList.toggle('active',b.dataset.miPage===miPage));
  const invoices=miInvoices();
  const pending=invoices.filter(x=>x.erpStatus!=='updated');
  const updated=invoices.filter(x=>x.erpStatus==='updated');
  if(mi$('miPendingBadge'))mi$('miPendingBadge').textContent=pending.length;
  if(mi$('miUpdatedBadge'))mi$('miUpdatedBadge').textContent=updated.length;
  const body=mi$('miBody');
  if(!body)return;
  if(miPage==='dashboard')body.innerHTML=miDashboardHTML(invoices,pending,updated);
  else if(miPage==='editor')body.innerHTML=miEditorHTML();
  else if(miPage==='viewer')body.innerHTML=miViewerHTML();
  else if(miPage==='pending')body.innerHTML=miListPageHTML('ERP Pending','Manual invoices awaiting GRN / ERP update.',pending,'miPendingSearch');
  else if(miPage==='updated')body.innerHTML=miListPageHTML('ERP Updated — Locked','Final records. View and download only.',updated,'miUpdatedSearch');
  else body.innerHTML=miListPageHTML('Invoice History','Complete searchable manual invoice register.',invoices,'miHistorySearch');
  if(miPage==='editor')setTimeout(miAfterEditorRender,0);
  if(miPage==='viewer')setTimeout(miAfterViewerRender,0);
}
function miDashboardHTML(all,pending,updated){
  const outstanding=all.reduce((s,x)=>s+miBalance(x),0);
  const paid=all.reduce((s,x)=>s+miPaid(x),0);
  return `
    <div class="mi-kpis">
      <div class="mi-stat"><span>ERP Pending</span><b>${pending.length}</b><small>Editable until ERP update</small></div>
      <div class="mi-stat"><span>ERP Updated</span><b>${updated.length}</b><small>Locked final records</small></div>
      <div class="mi-stat"><span>Outstanding</span><b>Rs. ${miMoney(outstanding)}</b><small>Across manual invoices</small></div>
      <div class="mi-stat"><span>Payments Received</span><b>Rs. ${miMoney(paid)}</b><small>Recorded collections</small></div>
    </div>
    <div class="mi-card">
      <div class="mi-card-head"><div><h3>Manual Invoice Workflow</h3><p>For direct-supplier / non-stock sales that are later reconciled to GRN and ERP.</p></div><button class="btn primary" onclick="miNewInvoice()">+ New Manual Invoice</button></div>
      <div class="mi-flow"><span>ERP Customer</span><i>→</i><span>Manual Invoice</span><i>→</i><span>Payments</span><i>→</i><span>GRN / ERP</span><i>→</i><span>ERP Updated & Locked</span></div>
    </div>
    <div class="mi-card"><h3>Recent Invoices</h3>${miTableHTML(all.slice(0,6),'')}</div>`;
}
function miListPageHTML(title,sub,list,searchId){
  return `<div class="mi-card">
    <div class="mi-card-head"><div><h3>${miEsc(title)}</h3><p>${miEsc(sub)}</p></div>${title.startsWith('ERP Pending')&&miCan('manual_invoice_create')?'<button class="btn primary" onclick="miNewInvoice()">+ New Invoice</button>':''}</div>
    <div class="mi-toolbar"><input id="${searchId}" class="search" placeholder="Search invoice, ERP customer, phone, item or ERP reference..." oninput="miRenderFiltered('${searchId}')"></div>
    <div id="${searchId}List">${miTableHTML(list,'')}</div>
  </div>`;
}
window.miRenderFiltered=function(searchId){
  const q=String(mi$(searchId)?.value||'').trim().toLowerCase();
  let list=miInvoices();
  if(searchId==='miPendingSearch')list=list.filter(x=>x.erpStatus!=='updated');
  if(searchId==='miUpdatedSearch')list=list.filter(x=>x.erpStatus==='updated');
  if(q)list=list.filter(inv=>[
    inv.invoiceNo,inv.customerName,inv.customerPhone,inv.customerEmail,inv.erpCustomerId,
    inv.erpCustomerCode,inv.erpRef,inv.supplierBill,...(inv.items||[]).flatMap(i=>[i.code,i.desc])
  ].join(' ').toLowerCase().includes(q));
  const host=mi$(searchId+'List');
  if(host)host.innerHTML=miTableHTML(list,q);
}
function miTableHTML(list){
  if(!list.length)return '<div class="mi-empty">No invoices found.</div>';
  return `<div class="mi-table-wrap"><table class="mi-table"><thead><tr><th>Invoice No.</th><th>Date</th><th>ERP Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Payment</th><th>ERP</th><th>Action</th></tr></thead><tbody>${list.map(inv=>{
    const ps=miPayStatus(inv);
    const updated=inv.erpStatus==='updated';
    const actions=updated
      ? `<button class="btn ghost sm" onclick="miViewInvoice('${inv.id}')">View</button><button class="btn ghost sm" onclick="miPrintInvoice('${inv.id}')">Download / PDF</button>`
      : `<button class="btn ghost sm" onclick="miViewInvoice('${inv.id}')">View</button>${miCan('manual_invoice_create')?`<button class="btn amber sm" onclick="miRequestEdit('${inv.id}')">Edit</button>`:''}${miCan('manual_invoice_finalize')?`<button class="btn green sm" onclick="miMarkERPUpdatedById('${inv.id}')">ERP Updated</button>`:''}`;
    return `<tr>
      <td><b>${miEsc(inv.invoiceNo)}</b>${inv.erpRef?`<small>ERP: ${miEsc(inv.erpRef)}</small>`:''}</td>
      <td>${miEsc(inv.invoiceDate||'')}</td>
      <td><b>${miEsc(inv.customerName)}</b><small>${miEsc(inv.erpCustomerCode||inv.erpCustomerId||'ERP')}</small><small>${miEsc(inv.customerPhone||'')}</small></td>
      <td class="num">${miMoney(miTotal(inv))}</td>
      <td class="num">${miMoney(miPaid(inv))}</td>
      <td class="num strong">${miMoney(miBalance(inv))}</td>
      <td><span class="mi-status ${miStatusClass(ps)}">${ps}</span></td>
      <td><span class="mi-status ${updated?'updated':'pending'}">${updated?'ERP Updated':'ERP Pending'}</span></td>
      <td><div class="mi-actions">${actions}</div></td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

window.miNewInvoice=function(){
  if(!miCan('manual_invoice_create'))return requirePerm('manual_invoice_create','create manual invoices');
  miEditingId='';
  miViewingId='';
  miDraftPayments=[];
  miSelectedErpCustomer=null;
  miLocked=false;
  miPage='editor';
  miRender();
};

window.miViewInvoice=function(id){
  const inv=miInvoice(id);
  if(!inv)return;
  miViewingId=id;
  miPage='viewer';
  miRender();
};

window.miRequestEdit=function(id){return miOpenInvoice(id)};
window.miOpenInvoice=function(id){
  const inv=miInvoice(id);
  if(!inv)return;
  if(inv.erpStatus==='updated'){
    return miViewInvoice(id);
  }
  if(!miCan('manual_invoice_create'))return requirePerm('manual_invoice_create','edit manual invoices');
  const admins=(state.users||[]).filter(u=>u&&u.role==='admin'&&u.active!==false&&typeof u.password==='string'&&u.password.length);
  if(!admins.length)return toast('No active admin account configured for edit authorization');
  const pwd=prompt('Administrator password required to EDIT manual invoice '+(inv.invoiceNo||'')+':');
  if(pwd===null)return;
  if(!admins.some(u=>u.password===pwd))return toast('Incorrect administrator password');
  miEditingId=id;
  miViewingId='';
  miDraftPayments=(inv.payments||[]).map(x=>({...x}));
  miSelectedErpCustomer={
    id:inv.erpCustomerId,
    code:inv.erpCustomerCode,
    name:inv.customerName,
    email:inv.customerEmail,
    phone:inv.customerPhone,
    tin:inv.customerTIN
  };
  miLocked=false;
  miPage='editor';
  miRender();
};

function miViewerHTML(){
  const inv=miInvoice(miViewingId);
  if(!inv)return `<div class="mi-card"><div class="mi-empty">Invoice not found.</div></div>`;
  const updated=inv.erpStatus==='updated';
  const ps=miPayStatus(inv);
  return `<div class="mi-viewer-shell">
    <div class="mi-card">
      <div class="mi-card-head">
        <div>
          <h3>${miEsc(inv.invoiceNo)}</h3>
          <p>${miEsc(inv.customerName)} • ${miEsc(inv.invoiceDate||'')}</p>
        </div>
        <div class="mi-actions">
          ${!updated&&miCan('manual_invoice_create')?`<button class="btn amber" onclick="miRequestEdit('${inv.id}')">Edit Invoice</button>`:''}
          <button class="btn ghost" onclick="miPrintInvoice('${inv.id}')">Download / PDF</button>
          ${!updated&&miCan('manual_invoice_finalize')?`<button class="btn green" onclick="miMarkERPUpdatedById('${inv.id}')">ERP Updated</button>`:''}
          <button class="btn ghost" onclick="miGo('${updated?'updated':'history'}')">Back</button>
        </div>
      </div>
      <div class="mi-viewer-statusbar">
        <span class="mi-status ${updated?'updated':'pending'}">${updated?'ERP Updated — Locked':'ERP Pending'}</span>
        <span class="mi-status ${miStatusClass(ps)}">${ps}</span>
        <span>Total: <b>Rs. ${miMoney(miTotal(inv))}</b></span>
        <span>Paid: <b>Rs. ${miMoney(miPaid(inv))}</b></span>
        <span>Balance: <b>Rs. ${miMoney(miBalance(inv))}</b></span>
      </div>
      ${updated?'<div class="mi-locked-view-note"><b>Final ERP Updated record.</b> Editing and payment changes are disabled. This invoice is view/download only.</div>':''}
    </div>
    <div class="mi-card">
      <div class="mi-viewer-paper"><div id="miViewerInvoiceHost"></div></div>
    </div>
  </div>`;
}

function miAfterViewerRender(){
  const inv=miInvoice(miViewingId);
  if(inv)miRenderInvoice(inv,'miViewerInvoiceHost');
}
function miEditorHTML(){
  const inv=miEditingId?miInvoice(miEditingId):null;
  const locked=!!inv&&inv.erpStatus==='updated';
  const canEdit=miCan('manual_invoice_create')&&!locked;
  const canPay=miCan('manual_invoice_payment')&&!locked;
  const canFinal=miCan('manual_invoice_finalize')&&!locked;
  return `<div class="mi-editor-grid">
    <div>
      <div class="mi-card">
        <div class="mi-card-head"><div><h3>${locked?'View Locked Invoice':inv?'Edit Manual Invoice':'New Manual Invoice'}</h3><p>Invoice format is fixed to the approved SoftCreation tax-invoice layout.</p></div>${locked?'<span class="mi-lock-chip">ERP UPDATED — LOCKED</span>':''}</div>
        <div class="mi-grid3">
          <div class="field"><label>Invoice Number *</label><input id="miInvoiceNo" ${locked?'disabled':''}></div>
          <div class="field"><label>Invoice Date *</label><input id="miInvoiceDate" type="date" ${locked?'disabled':''}></div>
          <div class="field"><label>Date of Supply *</label><input id="miSupplyDate" type="date" ${locked?'disabled':''}></div>
        </div>
        <div class="mi-grid2 mi-gap-top">
          <div class="field"><label>Additional Information (printed)</label><input id="miAdditional" ${locked?'disabled':''}></div>
          <div class="field"><label>Mode of Payment (printed)</label><input id="miPaymentMode" ${locked?'disabled':''}></div>
        </div>
      </div>

      <div class="mi-card">
        <h3>Customer — ERP + System</h3>
        <div class="mi-erp-customer-wrap">
          <div class="field">
            <label>Search ERP / System Customer *</label>
            <input id="miCustomerSearch" autocomplete="off" placeholder="Type customer name, email or phone..." oninput="miCustomerType(this.value)" onfocus="miCustomerFocus()" ${locked?'disabled':''}>
            <div id="miCustomerSuggestions" class="mi-customer-suggestions"></div>
          </div>
          <div id="miCustomerSelected" class="mi-selected-customer"></div>
        </div>
        <div id="miCustomerDocuments" class="mi-customer-documents"><div class="mi-muted">Select a customer to view related quotations, pro formas and sales orders.</div></div>
        <input id="miErpCustomerId" type="hidden"><input id="miErpCustomerCode" type="hidden">
        <div class="mi-grid2 mi-gap-top">
          <div class="field"><label>Customer Name *</label><input id="miCustomerName" readonly></div>
          <div class="field"><label>Purchaser's TIN</label><input id="miCustomerTIN" ${locked?'disabled':''}></div>
          <div class="field"><label>Email</label><input id="miCustomerEmail" readonly></div>
          <div class="field"><label>Telephone No</label><input id="miCustomerPhone" readonly></div>
          <div class="field full"><label>ERP Address</label><select id="miCustomerAddressPick" onchange="miAddressChanged(this.value)" ${locked?'disabled':''}><option value="">Select ERP customer first</option></select></div>
          <div class="field full"><label>Invoice Address *</label><textarea id="miCustomerAddress" ${locked?'disabled':''}></textarea></div>
        </div>
      </div>

      <div class="mi-card">
        <div class="mi-card-head"><h3>Items</h3>${canEdit?'<button class="btn primary sm" onclick="miAddItem()">+ Add Item</button>':''}</div>
        <div class="mi-item-head"><span>Item Code</span><span>Description</span><span>Qty</span><span>Unit Price</span><span>Amount</span><span></span></div>
        <div id="miItems"></div>
        <label class="mi-vat-check"><input type="checkbox" id="miVatEnabled" onchange="miRefreshEditor()" ${locked?'disabled':''}> Show included VAT (18/118 of VAT-inclusive item prices)</label>
        <div class="mi-delivery-input"><label for="miDeliveryCharge">Delivery Charge (Rs.)</label><input id="miDeliveryCharge" type="number" min="0" step="0.01" value="0" oninput="miRefreshEditor()" ${locked?'disabled':''}><small>Added separately after item VAT; zero means no delivery fee.</small></div>
        <div class="mi-total-row">Value excluding VAT: <b id="miEditorSubtotal">Rs. 0.00</b></div>
        <div class="mi-total-row">VAT (18%): <b id="miEditorVat">Rs. 0.00</b></div>
        <div class="mi-total-row">Delivery Charge: <b id="miEditorDelivery">Rs. 0.00</b></div>
        <div class="mi-total-row">Invoice Total: <b id="miEditorTotal">Rs. 0.00</b></div>
      </div>

      <div class="mi-card">
        <h3>Payment / Collection</h3>
        <div class="mi-grid3">
          <div class="field"><label>Payments Received</label><input id="miPaidDisplay" readonly></div>
          <div class="field"><label>Balance Payment</label><input id="miBalanceDisplay" readonly></div>
          <div class="field"><label>Payment Status</label><input id="miPayStatusDisplay" readonly></div>
        </div>
        <div id="miPaymentHistory" class="mi-payment-history"></div>
        ${canPay?'<div class="actions"><button class="btn green" onclick="miOpenPayment()">+ Record Payment</button></div>':''}
      </div>

      <div class="mi-card">
        <h3>Internal ERP / Supplier Details <small>(not printed)</small></h3>
        <div class="mi-grid2">
          <div class="field"><label>Fulfilment Type</label><select id="miFulfilmentType" ${locked?'disabled':''}><option>Direct Supplier → Customer</option><option>Supplier → SoftCreation Stores</option><option>Other / Manual</option></select></div>
          <div class="field"><label>Supplier / Source</label><input id="miSupplierSource" ${locked?'disabled':''}></div>
          <div class="field"><label>Supplier Bill / Invoice Ref.</label><input id="miSupplierBill" ${locked?'disabled':''}></div>
          <div class="field"><label>Courier / Waybill</label><input id="miCourierRef" ${locked?'disabled':''}></div>
          <div class="field full"><label>GRN / ERP Reference</label><input id="miErpRef" ${locked?'disabled':''}></div>
          <div class="field full"><label>Internal Note</label><textarea id="miInternalNote" ${locked?'disabled':''}></textarea></div>
        </div>
      </div>

      <div class="actions mi-bottom-actions">
        ${canEdit?'<button class="btn primary" onclick="miSaveInvoice()">Save Invoice</button>':''}
        <button class="btn ghost" onclick="miPrintDraft()">Print / PDF</button>
        ${canFinal&&miEditingId?'<button class="btn green" onclick="miMarkERPUpdated()">Mark ERP Updated & Lock</button>':''}
        ${canEdit&&miEditingId?'<button class="btn red" onclick="miDeleteInvoice()">Delete Pending Invoice</button>':''}
      </div>
    </div>
    <div class="mi-preview-card">
      <div class="mi-card"><div class="mi-card-head"><h3>Invoice Preview</h3><span class="mi-preview-note">Approved template</span></div><div class="mi-preview-wrap"><div id="miPreviewHost"></div></div></div>
    </div>
  </div>`;
}

function miAfterEditorRender(){
  const inv=miEditingId?miInvoice(miEditingId):null;
  mi$('miInvoiceNo').value=inv?.invoiceNo||'';
  mi$('miInvoiceDate').value=inv?.invoiceDate||miToday();
  mi$('miSupplyDate').value=inv?.supplyDate||miToday();
  mi$('miAdditional').value=inv?.additionalInfo||'';
  mi$('miVatEnabled').checked=!!inv?.vatEnabled;
  mi$('miDeliveryCharge').value=miDeliveryCharge(inv).toFixed(2);
  mi$('miPaymentMode').value=inv?.paymentMode||'Cash / Card / Bank Transfer';
  mi$('miErpCustomerId').value=inv?.erpCustomerId||miSelectedErpCustomer?.id||'';
  mi$('miErpCustomerCode').value=inv?.erpCustomerCode||miSelectedErpCustomer?.code||'';
  mi$('miCustomerName').value=inv?.customerName||miSelectedErpCustomer?.name||'';
  mi$('miCustomerTIN').value=inv?.customerTIN||miSelectedErpCustomer?.tin||'';
  mi$('miCustomerEmail').value=inv?.customerEmail||miSelectedErpCustomer?.email||'';
  mi$('miCustomerPhone').value=inv?.customerPhone||miSelectedErpCustomer?.phone||'';
  mi$('miCustomerAddress').value=inv?.customerAddress||'';
  mi$('miCustomerSearch').value=inv?.customerName||'';
  mi$('miFulfilmentType').value=inv?.fulfilmentType||'Direct Supplier → Customer';
  mi$('miSupplierSource').value=inv?.supplierSource||'';
  mi$('miSupplierBill').value=inv?.supplierBill||'';
  mi$('miCourierRef').value=inv?.courierRef||'';
  mi$('miErpRef').value=inv?.erpRef||'';
  mi$('miInternalNote').value=inv?.internalNote||'';

  const items=inv?.items?.length?inv.items:[{code:'',desc:'',qty:1,unitPrice:0}];
  mi$('miItems').innerHTML='';
  items.forEach(x=>miAddItem(x,false));
  miDraftPayments=inv?(inv.payments||[]).map(x=>({...x})):miDraftPayments;
  miRenderPayments();
  miRenderSelectedCustomer();
  miRenderCustomerDocs();
  if(inv?.erpCustomerId){const local=(state.customers||[]).find(c=>String(c.id)===String(inv.erpCustomerId));if(local){const pick=mi$('miCustomerAddressPick');if(pick)pick.innerHTML='<option value="0">System customer billing address</option>';}else miLoadAddresses(inv.erpCustomerId,inv.customerAddress);}
  miRefreshEditor();
}
window.miAddItem=function(item={code:'',desc:'',qty:1,unitPrice:0},refresh=true){
  if(miLocked)return;
  const d=document.createElement('div');
  d.className='mi-item-row';
  d.innerHTML=`<input class="mi-it-code" placeholder="Code" value="${miEsc(item.code||'')}" oninput="miRefreshEditor()"><input class="mi-it-desc" placeholder="Item description" value="${miEsc(item.desc||'')}" oninput="miRefreshEditor()"><input class="mi-it-qty" type="number" step="0.001" min="0" value="${miNum(item.qty||1)}" oninput="miRefreshEditor()"><input class="mi-it-price" type="number" step="0.01" min="0" value="${miNum(item.unitPrice).toFixed(2)}" oninput="miRefreshEditor()"><input class="mi-it-amount" readonly><button class="mi-remove-item" title="Remove" onclick="this.parentElement.remove();miRefreshEditor()">×</button>`;
  mi$('miItems')?.appendChild(d);
  if(refresh)miRefreshEditor();
};
function miDraft(){
  return {
    id:miEditingId||'',
    invoiceNo:String(mi$('miInvoiceNo')?.value||'').trim(),
    invoiceDate:mi$('miInvoiceDate')?.value||'',
    supplyDate:mi$('miSupplyDate')?.value||'',
    additionalInfo:String(mi$('miAdditional')?.value||'').trim(),
    vatEnabled:!!mi$('miVatEnabled')?.checked,
    deliveryCharge:miDeliveryCharge({deliveryCharge:mi$('miDeliveryCharge')?.value}),
    paymentMode:String(mi$('miPaymentMode')?.value||'').trim(),
    erpCustomerId:String(mi$('miErpCustomerId')?.value||'').trim(),
    erpCustomerCode:String(mi$('miErpCustomerCode')?.value||'').trim(),
    customerName:String(mi$('miCustomerName')?.value||'').trim(),
    customerTIN:String(mi$('miCustomerTIN')?.value||'').trim(),
    customerEmail:String(mi$('miCustomerEmail')?.value||'').trim(),
    customerPhone:String(mi$('miCustomerPhone')?.value||'').trim(),
    customerAddress:String(mi$('miCustomerAddress')?.value||'').trim(),
    items:[...document.querySelectorAll('#miItems .mi-item-row')].map(r=>({
      code:String(r.querySelector('.mi-it-code')?.value||'').trim(),
      desc:String(r.querySelector('.mi-it-desc')?.value||'').trim(),
      qty:miNum(r.querySelector('.mi-it-qty')?.value),
      unitPrice:miNum(r.querySelector('.mi-it-price')?.value)
    })).filter(i=>i.code||i.desc||i.qty||i.unitPrice),
    payments:miDraftPayments.map(x=>({...x})),
    fulfilmentType:mi$('miFulfilmentType')?.value||'Direct Supplier → Customer',
    supplierSource:String(mi$('miSupplierSource')?.value||'').trim(),
    supplierBill:String(mi$('miSupplierBill')?.value||'').trim(),
    courierRef:String(mi$('miCourierRef')?.value||'').trim(),
    erpRef:String(mi$('miErpRef')?.value||'').trim(),
    internalNote:String(mi$('miInternalNote')?.value||'').trim(),
    erpStatus:miLocked?'updated':'pending'
  };
}
function miValidate(inv){
  if(!inv.invoiceNo)return 'Invoice number is required.';
  if(!inv.invoiceDate||!inv.supplyDate)return 'Invoice date and supply date are required.';
  if(!inv.erpCustomerId)return 'Select a customer from ERP or System search.';
  if(!inv.customerName||!inv.customerAddress)return 'Customer name and invoice address are required.';
  if(!inv.items.length)return 'Add at least one item.';
  for(const i of inv.items)if(!i.desc||i.qty<=0||i.unitPrice<0)return 'Each item needs description, quantity and a valid unit price.';
  const duplicate=miInvoices().find(x=>x.invoiceNo.toLowerCase()===inv.invoiceNo.toLowerCase()&&x.id!==miEditingId);
  if(duplicate)return 'Invoice number already exists.';
  if(miPaid(inv)-miTotal(inv)>0.005)return 'Payments received cannot exceed invoice total.';
  return '';
}
window.miRefreshEditor=function(){
  if(!mi$('miItems'))return;
  document.querySelectorAll('#miItems .mi-item-row').forEach(r=>{
    const amount=miNum(r.querySelector('.mi-it-qty')?.value)*miNum(r.querySelector('.mi-it-price')?.value);
    const a=r.querySelector('.mi-it-amount');if(a)a.value=miMoney(amount);
  });
  const inv=miDraft();
  if(mi$('miEditorSubtotal'))mi$('miEditorSubtotal').textContent='Rs. '+miMoney(miNetAmount(inv));
  if(mi$('miEditorVat'))mi$('miEditorVat').textContent='Rs. '+miMoney(miVatAmount(inv));
  if(mi$('miEditorDelivery'))mi$('miEditorDelivery').textContent='Rs. '+miMoney(miDeliveryCharge(inv));
  if(mi$('miEditorTotal'))mi$('miEditorTotal').textContent='Rs. '+miMoney(miTotal(inv));
  if(mi$('miPaidDisplay'))mi$('miPaidDisplay').value='Rs. '+miMoney(miPaid(inv));
  if(mi$('miBalanceDisplay'))mi$('miBalanceDisplay').value='Rs. '+miMoney(miBalance(inv));
  if(mi$('miPayStatusDisplay'))mi$('miPayStatusDisplay').value=miPayStatus(inv);
  miRenderInvoice(inv,'miPreviewHost');
};
function miRenderPayments(){
  const host=mi$('miPaymentHistory');if(!host)return;
  host.innerHTML=miDraftPayments.length?`<div class="mi-table-wrap"><table class="mi-table compact"><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th class="num">Amount</th><th></th></tr></thead><tbody>${miDraftPayments.map((p,i)=>`<tr><td>${miEsc(p.date)}</td><td>${miEsc(p.method)}</td><td>${miEsc(p.note||'')}</td><td class="num">${miMoney(p.amount)}</td><td>${!miLocked&&miCan('manual_invoice_payment')?`<button class="btn red sm" onclick="miRemovePayment(${i})">Remove</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="mi-muted">No payments recorded.</div>';
}
window.miOpenPayment=function(){
  if(!miCan('manual_invoice_payment'))return requirePerm('manual_invoice_payment','record manual invoice payments');
  const inv=miDraft(),bal=miBalance(inv);
  if(bal<=0)return toast('Invoice is already fully paid');
  mi$('miPayDate').value=miToday();
  mi$('miPayAmount').value=bal.toFixed(2);
  mi$('miPayAmount').max=bal.toFixed(2);
  mi$('miPayMethod').value='Bank Transfer';
  mi$('miPayNote').value='';
  mi$('miPayInfo').innerHTML=`Invoice Total: <b>Rs. ${miMoney(miTotal(inv))}</b> &nbsp; Balance: <b>Rs. ${miMoney(bal)}</b>`;
  mi$('miPaymentModal').classList.add('show');
};
window.miClosePayment=function(){mi$('miPaymentModal')?.classList.remove('show')};
window.miConfirmPayment=async function(){
  const inv=miDraft(),bal=miBalance(inv),amount=miNum(mi$('miPayAmount')?.value);
  if(amount<=0||amount>bal+0.005)return toast('Enter a valid payment amount within the current balance');
  miDraftPayments.push({
    date:mi$('miPayDate').value||miToday(),
    amount,
    method:mi$('miPayMethod').value||'Other',
    note:String(mi$('miPayNote').value||'').trim()
  });
  miClosePayment();miRenderPayments();miRefreshEditor();
  if(miEditingId)await miSaveInvoice(true);
};
window.miRemovePayment=async function(i){
  if(miLocked||!miCan('manual_invoice_payment'))return;
  miDraftPayments.splice(i,1);miRenderPayments();miRefreshEditor();
  if(miEditingId)await miSaveInvoice(true);
};

window.miSaveInvoice=async function(silent=false){
  if(miLocked)return toast('ERP Updated invoices are locked');
  if(!miCan('manual_invoice_create'))return requirePerm('manual_invoice_create','save manual invoices');
  const inv=miDraft(),err=miValidate(inv);
  if(err)return toast(err);
  const payload={
    workspace:MI_WORKSPACE,
    id:miEditingId||null,
    invoice_no:inv.invoiceNo,invoice_date:inv.invoiceDate,supply_date:inv.supplyDate,
    additional_info:inv.additionalInfo,payment_mode:inv.paymentMode,
    erp_customer_id:inv.erpCustomerId,erp_customer_code:inv.erpCustomerCode,
    customer_name:inv.customerName,customer_tin:inv.customerTIN,customer_email:inv.customerEmail,
    customer_phone:inv.customerPhone,customer_address:inv.customerAddress,
    fulfilment_type:inv.fulfilmentType,supplier_source:inv.supplierSource,
    supplier_bill_ref:inv.supplierBill,courier_ref:inv.courierRef,erp_ref:inv.erpRef,
    internal_note:inv.internalNote,
    user:{username:currentUser?.username||'',display_name:currentUser?.display||currentUser?.username||''},
    lines:[...inv.items.map((x,i)=>({line_no:i+1,item_code:x.code,description:x.desc,qty:x.qty,unit_price:x.unitPrice})),
      ...(inv.vatEnabled?[{line_no:inv.items.length+1,item_code:MI_VAT_CODE,description:'VAT 18% included (breakdown only)',qty:1,unit_price:0}]:[]),
      ...(miDeliveryCharge(inv)>0?[{line_no:inv.items.length+(inv.vatEnabled?2:1),item_code:MI_DELIVERY_CODE,description:'Delivery Charge (excluded from item VAT)',qty:1,unit_price:miDeliveryCharge(inv)}]:[])],
    payments:inv.payments.map(x=>({payment_date:x.date,amount:x.amount,method:x.method,reference_note:x.note||''}))
  };
  try{
    const r=await miRpc('spgs_manual_invoice_save',{p_payload:payload});
    const result=Array.isArray(r)?r[0]:r;
    if(result?.error || result?.ok===false || result?.success===false)throw new Error(String(result?.message||result?.error||'Database rejected the invoice.'));
    const confirmedId=(typeof result==='string' && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(result.trim())?result.trim():'') || result?.id || result?.invoice_id || result?.saved_id || miEditingId;
    if(!confirmedId)throw new Error('Database did not return an invoice ID. Verify the spgs_manual_invoice_save function.');
    try{await miLoad()}catch(loadError){throw new Error('Save RPC returned an invoice ID ('+confirmedId+'), but reloading failed: '+String(loadError?.message||loadError)+'. Check database before saving again to avoid duplicates.')}
    const saved=miInvoice(confirmedId);
    if(!saved)throw new Error('Save RPC returned invoice ID '+confirmedId+', but it is not visible after reload. Check permissions before trying again.');
    miEditingId=confirmedId;
    miDraftPayments=(saved?.payments||[]).map(x=>({...x}));
    if(!silent)toast(`${result?.invoice_no||inv.invoiceNo} saved`);
    miRender();
  }catch(e){console.error('Manual invoice save failed:',e);const message=String(e?.message||'').trim();toast(message&&message!=='.'?`Invoice NOT saved: ${message}`:'Invoice NOT saved. Supabase returned an unidentified error; check browser Console and Network response.')}
};
window.miMarkERPUpdatedById=async function(id){
  const inv=miInvoice(id);
  if(!inv)return toast('Manual invoice not found');
  if(inv.erpStatus==='updated'){
    miViewingId=id;
    miPage='updated';
    miRender();
    return;
  }
  if(!miCan('manual_invoice_finalize'))return requirePerm('manual_invoice_finalize','mark manual invoices ERP Updated');
  if(!confirm(`Mark ${inv.invoiceNo} as ERP Updated?\n\nThis permanently locks the invoice. After this, it can only be viewed or downloaded.`))return;
  try{
    await miRpc('spgs_manual_invoice_mark_erp_updated',{
      p_invoice_id:id,
      p_username:currentUser?.username||'',
      p_display_name:currentUser?.display||currentUser?.username||''
    });
    await miLoad();
    miEditingId='';
    miViewingId='';
    miLocked=false;
    miPage='updated';
    miRender();
    toast('ERP Updated — invoice moved to ERP Updated and locked');
  }catch(e){
    console.error(e);
    toast(e.message);
  }
};

window.miMarkERPUpdated=async function(){
  if(!miEditingId)return toast('Save the invoice first');
  if(!miCan('manual_invoice_finalize'))return requirePerm('manual_invoice_finalize','mark manual invoices ERP Updated');
  const inv=miDraft(),err=miValidate(inv);if(err)return toast(err);
  if(!confirm(`Mark ${inv.invoiceNo} as ERP Updated?\n\nThis permanently locks customer, item and payment details in the Manual Invoice module.`))return;
  try{
    await miSaveInvoice(true);
    await miRpc('spgs_manual_invoice_mark_erp_updated',{
      p_invoice_id:miEditingId,
      p_username:currentUser?.username||'',
      p_display_name:currentUser?.display||currentUser?.username||''
    });
    await miLoad();
    miEditingId='';
    miViewingId='';
    miLocked=false;
    miPage='updated';
    miRender();
    toast('ERP Updated — invoice moved to ERP Updated and locked');
  }catch(e){console.error(e);toast(e.message)}
};
window.miDeleteInvoice=async function(){
  if(!miEditingId||miLocked)return;
  if(!confirm('Delete this pending manual invoice?'))return;
  try{
    await miRpc('spgs_manual_invoice_delete',{
      p_invoice_id:miEditingId,
      p_username:currentUser?.username||'',
      p_display_name:currentUser?.display||currentUser?.username||''
    });
    miEditingId='';miDraftPayments=[];miSelectedErpCustomer=null;miPage='pending';
    await miRefresh(false);toast('Pending manual invoice deleted');
  }catch(e){console.error(e);toast(e.message)}
};

/* Customer-linked source documents. Keep the underlying record untouched. */
function miCustomerDocMatches(doc,id,name){
  const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
  const docId=String(doc.customerId||doc.erpCustomerId||doc.customer?.id||doc.customer?.erpId||'');
  const docName=norm(doc.customer?.name||doc.customerName||doc.customer_name||'');
  return !!((id&&docId&&(docId===id||docId==='erp_customer_'+id||'erp_customer_'+docId===id))||(name&&docName&&docName===norm(name)));
}
function miSourceLines(doc){
  const source=Array.isArray(doc.lines)?doc.lines:[];
  return source.filter(l=>l&&typeof l==='object'&&l.use!==false&&l.selected!==false);
}
function miGetCustomerDocs(){
  const id=String(mi$('miErpCustomerId')?.value||'').trim(),name=String(mi$('miCustomerName')?.value||'').trim();
  if(!id&&!name)return [];
  const quotes=(state.docs||[]).filter(d=>['Q','PI'].includes(d.type)&&(typeof visibleToCurrent!=='function'||visibleToCurrent(d))&&miCustomerDocMatches(d,id,name)).map(d=>({kind:d.type==='PI'?'Pro Forma Invoice':'Quotation',group:d.type==='PI'?'pi':'quote',no:d.serial||'',date:d.date||'',lines:miSourceLines(d),id:d.id,doc:d}));
  const orders=(state.salesOrders||[]).filter(d=>(typeof soVisible91!=='function'||soVisible91(d))&&miCustomerDocMatches(d,id,name)).map(d=>({kind:'Sales Order',group:'so',no:d.soNo||d.serial||'',date:d.date||d.createdAt||'',lines:miSourceLines(d),id:d.id,doc:d}));
  return [...quotes,...orders].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,150);
}
function miSourceItem(line){
  // Quotation/PI and SO entries save the item description in `desc` and the
  // identifying size/material/pack attributes in separate fields.
  const first=(...vals)=>vals.find(v=>typeof v==='string'&&v.trim())?.trim()||'';
  const base=first(line.desc,line.description,line.itemName,line.productName,line.product_name,line.item_description,line.item?.description,line.item?.name,line.name,line.title,line.product,line.label);
  const size=first(line.size,line.sizeLabel,line.size_label);
  const material=first(line.material,line.materialName);
  const layout=first(line.layout);
  const pcs=line.pcs||line.pcsPerRoll||line.pcs_per_roll||'';
  const pack=first(line.unit,line.packName,line.packing);
  const details=[size,material,layout,pcs?String(pcs)+' pcs':''].filter(Boolean);
  // Avoid losing distinguishing attributes when the base is a generic label.
  const name=base?[base,...details.filter(v=>!base.toLowerCase().includes(v.toLowerCase()))].join(' • '):details.join(' • ');
  const num=(...values)=>{for(const x of values){if(x!==undefined&&x!==null&&x!==''){const n=Number(x);if(Number.isFinite(n))return n;}}return 0;};
  return {code:first(line.code,line.sku,line.itemCode,line.item_code,line.productCode,line.product_code,line.item?.code),desc:name||'Unnamed source item',qty:Math.max(0,num(line.qty,line.quantity,line.requestedQty,1))||1,unitPrice:Math.max(0,num(line.price,line.unitPrice,line.unit_price,line.sellingPrice,line.rate)),unit:pack};
}
window.miRenderCustomerDocs=function(){
  const host=mi$('miCustomerDocuments');if(!host)return;
  const docs=miGetCustomerDocs();
  if(!mi$('miErpCustomerId')?.value&&!mi$('miCustomerName')?.value){host.innerHTML='<div class="mi-muted">Select a customer to view related documents.</div>';return;}
  const categories=[{key:'quote',title:'Quotations'},{key:'pi',title:'Pro Forma Invoices'},{key:'so',title:'Sales Orders'}];
  const sections=categories.map(cat=>{
    const subset=docs.map((d,index)=>({d,index})).filter(x=>x.d.group===cat.key);
    return `<section class="mi-source-group"><h4>${cat.title} <small>(${subset.length})</small></h4>${subset.length?subset.map(({d,index})=>`<details class="mi-source-document"><summary><b>${miEsc(d.no||'-')}</b> <small>${miEsc(String(d.date).slice(0,10))} · ${d.lines.length} line(s)</small></summary><div class="mi-source-lines">${d.lines.map((l,j)=>{const item=miSourceItem(l);return `<div class="mi-source-line"><span><b>${miEsc(item.desc)}</b>${item.code?' <small>('+miEsc(item.code)+')</small>':''}<br>Qty ${miEsc(item.qty)} · Rs. ${miMoney(item.unitPrice)}</span><button type="button" class="btn ghost sm" onclick="miCopySourceLine(${index},${j})">Add to invoice</button></div>`;}).join('')||'<span class="mi-muted">No saved lines.</span>'}</div></details>`).join(''):'<div class="mi-muted">No matching documents in this category.</div>'}</section>`;
  });
  host.innerHTML='<h4>Customer Documents <small>('+docs.length+' available) — expand a document to copy items</small></h4><div class="mi-source-columns">'+sections.join('')+'</div>';
};
window.miCopySourceLine=function(docIndex,lineIndex){
  if(miLocked)return toast('ERP Updated invoices are locked');
  const entry=miGetCustomerDocs()[docIndex],line=entry?.lines?.[lineIndex];
  if(!line)return toast('Source line unavailable. Refresh customer documents.');
  const item=miSourceItem(line);
  if(item.desc==='Unnamed source item')return toast('Source item has no identifiable name.');
  const rows=[...document.querySelectorAll('#miItems .mi-item-row')];
  if(rows.length===1&&!rows[0].querySelector('.mi-it-desc')?.value.trim()&&!rows[0].querySelector('.mi-it-code')?.value.trim())rows[0].remove();
  miAddItem(item,true);
  toast('Item copied. Verify description, quantity and price before saving.');
};

/* ---------------- ERP customer autocomplete ---------------- */
window.miCustomerType=function(value){
  const q=String(value||'').trim();
  clearTimeout(miCustomerTimer);
  miSelectedErpCustomer=null;
  mi$('miErpCustomerId').value='';
  mi$('miErpCustomerCode').value='';
  mi$('miCustomerName').value='';
  mi$('miCustomerEmail').value='';
  mi$('miCustomerPhone').value='';
  mi$('miCustomerAddress').value='';
  miRenderSelectedCustomer();
  miRenderCustomerDocs();
  if(q.length<2){
    miCustomerRows=[];
    miHideCustomerSuggestions();
    return;
  }
  miCustomerSeq++;
  miShowCustomerResults(miSystemCustomerRows(q));
  miCustomerTimer=setTimeout(()=>miLoadCustomers(q),300);
};
function miSystemCustomerRows(q){
  const term=String(q||'').trim().toLowerCase();
  return (state.customers||[]).filter(c=>{
    const fields=[c.name,c.phone,c.email,c.id,c.code].map(v=>String(v||'').toLowerCase());
    return fields.some(v=>v.includes(term));
  }).slice(0,20).map(c=>({
    id:String(c.id||''),code:String(c.code||''),name:String(c.name||''),
    phone:String(c.phone||''),email:String(c.email||''),
    tin:String(c.tin||c.vat||''),address:String(c.address||''),
    delivery:String(c.delivery||''),source:'system'
  }));
}
function miShowCustomerResults(rows,error=''){
  const box=mi$('miCustomerSuggestions');if(!box)return;
  miCustomerRows=rows;
  box.innerHTML=rows.length?rows.map((c,i)=>`<button type="button" class="mi-customer-option" onclick="miSelectCustomer(${i})"><b>${miEsc(c.name||'-')}</b><span>${miEsc(c.phone||'No phone')} ${c.email?'• '+miEsc(c.email):''}</span><small>${c.source==='system'?'SYSTEM':'ERP'} • ID: ${miEsc(c.id||'-')}</small></button>`).join(''):(error?`<div class="mi-customer-message error">${miEsc(error)}</div>`:'<div class="mi-customer-message">No matching customer found.</div>');
  box.classList.add('show');
}
async function miLoadCustomers(q){
  const seq=++miCustomerSeq;
  const local=miSystemCustomerRows(q);
  miShowCustomerResults(local);
  try{
    const r=await miEdge({action:'search',q,limit:12});
    if(seq!==miCustomerSeq)return;
    const remote=(Array.isArray(r?.customers)?r.customers:[]).map(c=>({...c,source:'erp'}));
    const ids=new Set(local.map(c=>String(c.id)));
    miShowCustomerResults([...local,...remote.filter(c=>!ids.has(String(c.id)))]);
  }catch(e){
    if(seq!==miCustomerSeq)return;
    console.error('ERP customer lookup:',e);
    miShowCustomerResults(local,local.length?'':('ERP search unavailable: '+(e.message||'unknown error')));
  }
}
window.miCustomerFocus=function(){
  if(miCustomerRows.length)mi$('miCustomerSuggestions')?.classList.add('show');
};
function miHideCustomerSuggestions(){mi$('miCustomerSuggestions')?.classList.remove('show')}
window.miSelectCustomer=async function(i){
  const c=miCustomerRows[i];if(!c)return;
  miCustomerSeq++;clearTimeout(miCustomerTimer);
  miSelectedErpCustomer=c;
  mi$('miErpCustomerId').value=String(c.id||'');
  mi$('miErpCustomerCode').value=String(c.code||c.customer_id||'');
  mi$('miCustomerName').value=c.name||'';
  mi$('miCustomerTIN').value=c.tin||'';
  mi$('miCustomerEmail').value=c.email||'';
  mi$('miCustomerPhone').value=c.phone||'';
  mi$('miCustomerSearch').value=c.name||'';
  miHideCustomerSuggestions();
  miRenderSelectedCustomer();
  miRenderCustomerDocs();
  if(c.source==='system'){
    const address=String(c.address||c.delivery||'').trim();
    const pick=mi$('miCustomerAddressPick');
    if(pick){pick.innerHTML='<option value="0">System customer billing address</option>';pick.dataset.rows='';}
    mi$('miCustomerAddress').value=address;
  }else{await miLoadAddresses(c.id,'');}
  miRefreshEditor();
};
function miRenderSelectedCustomer(){
  const box=mi$('miCustomerSelected');if(!box)return;
  const c=miSelectedErpCustomer;
  box.innerHTML=c?.id?`<div><span>${c.source==='system'?'SYSTEM CUSTOMER SELECTED':'ERP CUSTOMER SELECTED'}</span><b>${miEsc(c.name||'')}</b><small>ID ${miEsc(c.id)}${c.code?' • '+miEsc(c.code):''}</small></div><strong>${c.source==='system'?'SYSTEM':'LIVE ERP'}</strong>`:'<div class="mi-muted">Select the customer from ERP suggestions.</div>';
}
async function miLoadAddresses(customerId,preferred){
  const select=mi$('miCustomerAddressPick');if(!select)return;
  select.innerHTML='<option value="">Loading ERP addresses...</option>';
  try{
    const r=await miEdge({action:'addresses',customer_id:customerId});
    const rows=Array.isArray(r?.addresses)?r.addresses:[];
    if(!rows.length){
      select.innerHTML='<option value="">No ERP address found — enter invoice address manually</option>';
      return;
    }
    select.innerHTML=rows.map((a,i)=>{
      const text=[a.address,a.address_line_1,a.address_line_2,a.city,a.province,a.country,a.postal_code].filter(Boolean).join(', ');
      return `<option value="${i}">${miEsc(text||`Address ${i+1}`)}</option>`;
    }).join('');
    let idx=0;
    if(preferred){
      const p=preferred.trim().toLowerCase();
      const found=rows.findIndex(a=>[a.address,a.address_line_1,a.address_line_2,a.city,a.province,a.country,a.postal_code].filter(Boolean).join(', ').trim().toLowerCase()===p);
      if(found>=0)idx=found;
    }
    select.value=String(idx);
    select.dataset.rows=encodeURIComponent(JSON.stringify(rows));
    miApplyAddress(rows[idx],preferred);
  }catch(e){
    console.error(e);
    select.innerHTML='<option value="">ERP address lookup failed — enter invoice address manually</option>';
  }
}
window.miAddressChanged=function(v){
  const select=mi$('miCustomerAddressPick');if(!select?.dataset.rows)return;
  try{
    const rows=JSON.parse(decodeURIComponent(select.dataset.rows));
    miApplyAddress(rows[Number(v)]||null,'');
  }catch(_){}
};
function miApplyAddress(a,preferred){
  if(!a)return;
  const text=[a.address,a.address_line_1,a.address_line_2,a.city,a.province,a.country,a.postal_code].filter(Boolean).join(', ');
  if(mi$('miCustomerAddress')&&!preferred)mi$('miCustomerAddress').value=text;
  if(a.contact&&!mi$('miCustomerPhone').value)mi$('miCustomerPhone').value=a.contact;
  miRefreshEditor();
}
document.addEventListener('click',e=>{
  const wrap=document.querySelector('.mi-erp-customer-wrap');
  if(wrap&&!wrap.contains(e.target))miHideCustomerSuggestions();
});

/* ---------------- Exact approved print template ---------------- */
function miFmtDate(s){if(!s)return '';const [y,m,d]=String(s).split('-');return `${m}/${d}/${y}`}
function miNumberToWords(num){
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function under1000(n){let s='';if(n>=100){s+=a[Math.floor(n/100)]+' Hundred';n%=100;if(n)s+=' ';}if(n>=20){s+=b[Math.floor(n/10)];if(n%10)s+=' '+a[n%10];}else if(n>0)s+=a[n];return s}
  let n=Math.floor(Number(num)||0);if(n===0)return 'Zero';const parts=[],units=[[1000000000,'Billion'],[1000000,'Million'],[1000,'Thousand']];
  for(const [v,name] of units){if(n>=v){parts.push(under1000(Math.floor(n/v))+' '+name);n%=v}}
  if(n)parts.push(under1000(n));return parts.join(' ');
}
function miAmountWords(n){n=miNum(n);let ru=Math.floor(n+1e-9),cents=Math.round((n-ru)*100);if(cents===100){ru++;cents=0}return miNumberToWords(ru)+' Rupees'+(cents?' and '+miNumberToWords(cents)+' Cents':'')+' Only.'}
function miRenderInvoice(inv,hostId){
  const host=mi$(hostId);if(!host)return;

  const total=miTotal(inv),subtotal=miNetAmount(inv),vat=miVatAmount(inv),delivery=miDeliveryCharge(inv),paid=miPaid(inv),bal=miBalance(inv);
  const rawAddress=String(inv.customerAddress||'').trim();
  const addressLines=rawAddress
    ? rawAddress.split(/\n/).reduce((n,line)=>n+Math.max(1,Math.ceil(String(line||'').length/34)),0)
    : 1;

  /*
    Rebuild the variable invoice header over the approved artwork.
    This fixes the old absolute-text alignment problem and allows the
    buyer card to grow when the address becomes longer.
  */
  const buyerExtra=Math.max(0,addressLines-2)*10;
  const headerTop=106;
  const docRowH=25;
  const partyH=88+buyerExtra;
  const supplyH=25;
  const additionalH=34;
  const headerHeight=docRowH+partyH+supplyH+additionalH;
  const tableTop=headerTop+headerHeight+16;

  const rowH=23;
  const tableHeadH=25;

  /* Keep the final summary safely above the fixed signature/footer art. */
  const summaryTopBase=(inv.vatEnabled||paid>0)?505:525;
  const footerLimit=705;
  const finalRows=Math.max(1,Math.floor((summaryTopBase-tableTop-tableHeadH-18)/rowH));
  const continuationRows=Math.max(1,Math.floor((footerLimit-tableTop-tableHeadH-14)/rowH));

  const items=(inv.items||[]).slice();
  const pages=[];

  if(items.length<=finalRows){
    pages.push(items);
  }else{
    let remaining=items.slice();
    while(remaining.length>finalRows){
      const mustLeave=finalRows;
      const take=Math.min(continuationRows,remaining.length-mustLeave);
      pages.push(remaining.splice(0,Math.max(1,take)));
    }
    pages.push(remaining);
  }

  const pageCount=Math.max(1,pages.length);
  const addText=inv.additionalInfo
    ? `Additional Information if Any : ${miEsc(inv.additionalInfo)}`
    : 'Additional Information if Any :';

  const supplierBlock=`
    <div class="mi-dyn-party-cell mi-dyn-supplier">
      <div class="mi-dyn-kv"><span>Supplier's TIN</span><i>:</i><b>103723353</b></div>
      <div class="mi-dyn-kv"><span>Supplier's Name</span><i>:</i><b>SoftCreation (Pvt) Ltd.</b></div>
      <div class="mi-dyn-kv mi-dyn-address-row"><span>Address</span><i>:</i><b>No.29, South Circular Road,<br>Kurunegala.</b></div>
      <div class="mi-dyn-kv"><span>Telephone No</span><i>:</i><b>071 77 44 555</b></div>
    </div>`;

  const buyerBlock=`
    <div class="mi-dyn-party-cell mi-dyn-buyer">
      <div class="mi-dyn-kv"><span>Purchaser's TIN</span><i>:</i><b>${miEsc(inv.customerTIN||'')}</b></div>
      <div class="mi-dyn-kv"><span>Purchaser's Name</span><i>:</i><b class="strong">${miEsc(inv.customerName||'')}</b></div>
      <div class="mi-dyn-kv mi-dyn-address-row"><span>Address</span><i>:</i><b>${miEsc(rawAddress).replace(/\n/g,'<br>')}</b></div>
      <div class="mi-dyn-kv"><span>Telephone No</span><i>:</i><b>${miEsc(inv.customerPhone||'')}</b></div>
    </div>`;

  function pageHTML(pageItems,pageIndex){
    const isLast=pageIndex===pageCount-1;
    const rows=pageItems.map((it,localIndex)=>{
      const globalIndex=pages.slice(0,pageIndex).reduce((s,p)=>s+p.length,0)+localIndex;
      return `<tr style="height:${rowH}pt">
        <td class="c">${String(globalIndex+1).padStart(2,'0')}</td>
        <td>${miEsc(it.code||'')}</td>
        <td class="desc">${miEsc(it.desc||'')}</td>
        <td class="c">${miNum(it.qty).toLocaleString('en-US',{maximumFractionDigits:3})}</td>
        <td class="r">${miMoney(inv.vatEnabled?miNum(it.unitPrice)/1.18:it.unitPrice)}</td>
        <td class="r">${miMoney(miNum(it.qty)*(inv.vatEnabled?miNum(it.unitPrice)/1.18:miNum(it.unitPrice)))}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="mi-empty-line">No invoice items added</td></tr>';

    const currentTableBottom=tableTop+tableHeadH+(pageItems.length*rowH);
    const summaryTop=Math.max(summaryTopBase,currentTableBottom+18);

    return `<div class="mi-invoice-page mi-invoice-print-page" data-page="${pageIndex+1}">
<img class="mi-exact-bg" src="${MI_TEMPLATE}" alt="">

<div class="mi-old-contact-mask" aria-hidden="true"></div>
<div class="mi-company-header-clean-mask" aria-hidden="true"></div>
      <div class="mi-company-header-mask">
        <div class="mi-company-title">SoftCreation (Pvt) Ltd.</div>
        <div class="mi-company-line">Address : No.29, South Circular Road, Kurunegala.</div>
        <div class="mi-company-line">Tel : 071 77 44 555</div>
        <div class="mi-company-line mi-company-contact">
          <span>Email : info@softcreation.lk</span>
          <span>Web : www.softcreation.lk</span>
        </div>
      </div>

      <div class="mi-page-number-mask">
        <b>Page ${pageIndex+1} of ${pageCount}</b>
        <span>Original</span>
      </div>

      <div class="mi-dyn-header" style="top:${headerTop}pt">
        <div class="mi-dyn-doc-row">
          <div><b>Date of Invoice</b><i>:</i><span>${miFmtDate(inv.invoiceDate)}</span></div>
          <div><b>Invoice No</b><i>:</i><span>${miEsc(inv.invoiceNo||'')}</span></div>
        </div>

        <div class="mi-dyn-party-row" style="min-height:${partyH}pt">
          ${supplierBlock}
          ${buyerBlock}
        </div>

        <div class="mi-dyn-supply-row">
          <div><b>Date of Supply</b><i>:</i><span>${miFmtDate(inv.supplyDate)}</span></div>
          <div><b>Place of Supply</b><i>:</i><span>No. 29, South Circular Road, Kurunegala.</span></div>
        </div>

        <div class="mi-dyn-additional">${addText}</div>
      </div>

      <table class="mi-ex-table mi-ex-table-paged" style="top:${tableTop}pt">
        <colgroup>
          <col style="width:26pt"><col style="width:82pt"><col style="width:245pt">
          <col style="width:48pt"><col style="width:65pt"><col style="width:73pt">
        </colgroup>
        <thead><tr>
          <th>Ref</th><th>Item Code</th><th>Description of Good or Services</th>
          <th>Quantity</th><th>Unit Price</th><th>Amount (Rs.)</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      ${!isLast?`
        <div class="mi-continuation-note">Continued on page ${pageIndex+2} of ${pageCount}</div>
      `:''}

      ${isLast?`
        <div class="mi-ex-summary mi-ex-summary-paged ${(inv.vatEnabled||delivery>0)?'mi-summary-vat-on':''}" style="top:${summaryTop}pt">
          <div class="mi-ex-sumrow"><div>Total Value of Supply</div><div class="v">${miMoney(subtotal)}</div></div>
           ${inv.vatEnabled?`<div class="mi-ex-sumrow"><div>VAT 18%</div><div class="v">${miMoney(vat)}</div></div>`:''}
           <div class="mi-ex-sumrow"><div>Delivery Charges</div><div class="v">${miMoney(delivery)}</div></div>
           <div class="mi-ex-sumrow"><div>Total Amount</div><div class="v">${miMoney(total)}</div></div>
          ${paid>0?`<div class="mi-ex-sumrow"><div>Advance Paid</div><div class="v">${miMoney(paid)}</div></div><div class="mi-ex-sumrow"><div>Balance Payment</div><div class="v">${miMoney(bal)}</div></div>`:''}
          <div class="mi-ex-words">Total Amount In Words : ${miAmountWords(total)}</div>
          <div class="mi-ex-mode">Mode of Payment : ${miEsc(inv.paymentMode||'Cash / Card / Bank Transfer')}</div>
        </div>
      `:''}
    </div>`;
  }

  host.innerHTML=pages.map((p,i)=>pageHTML(p,i)).join('');
}
window.miPrintDraft=function(){
  const inv=miDraft(),err=miValidate(inv);if(err)return toast(err);
  miDoPrint(inv);
};
window.miPrintInvoice=function(id){const inv=miInvoice(id);if(inv)miDoPrint(inv)};
function miDoPrint(inv){
  miRenderInvoice(inv,'miPrintHost');
  document.body.classList.add('mi-printing');
  const cleanup=()=>{document.body.classList.remove('mi-printing');window.removeEventListener('afterprint',cleanup)};
  window.addEventListener('afterprint',cleanup);
  setTimeout(()=>{window.print();setTimeout(cleanup,800)},80);
}

/* ---------------- integration ---------------- */
const miShowBase=window.showView;
window.showView=function(id){
  if(id==='manualinvoices'&&!miCan('manual_invoice_view'))return requirePerm('manual_invoice_view','open Manual Invoices');
  const r=miShowBase.apply(this,arguments);
  if(id==='manualinvoices')miRefresh(false);
  return r;
};
try{showView=window.showView}catch(_){}

miInstallPermissions();
miInstallUI();
try{applyUserAccess()}catch(_){}
if(currentUser&&miCan('manual_invoice_view'))miRefresh(false);
})();
