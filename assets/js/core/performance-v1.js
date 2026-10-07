
/* =====================================================================
   SOFTCREATION PERFORMANCE PATCH V1
   - Client-side pagination for large operational lists
   - Debounced list search
   - Active-view-only refresh after realtime/cloud changes
   - Fast document relationship lookups while rendering list pages
   - Lazy decoding/loading of Device Master images
   Business rules, Supabase tables, document calculations and PDFs stay intact.
   ===================================================================== */
(function(){
  'use strict';

  const P=window.SC_PERF=window.SC_PERF||{
    pages:{},
    sizes:{quote:25,pi:25,customer:25,item:25,device:24,quoteRequest:25,purchaseOrder:20,salesOrder:25},
    lastQuery:{},
    timers:{},
    docContext:null,
    docById:null,
    piBySource:null
  };

  function el(id){return document.getElementById(id)}
  function activeView(){return document.querySelector('.view.active')?.id||'dashboard'}

  function debounce(key,fn,ms=220){
    clearTimeout(P.timers[key]);
    P.timers[key]=setTimeout(fn,ms);
  }

  function resetOnQuery(kind,value){
    const v=String(value??'');
    if(P.lastQuery[kind]!==v){
      P.lastQuery[kind]=v;
      P.pages[kind]=1;
    }
  }

  function pageSlice(kind,arr,defaultSize){
    const size=Math.max(1,Number(P.sizes[kind]||defaultSize||25));
    const pages=Math.max(1,Math.ceil(arr.length/size));
    let page=Math.max(1,Number(P.pages[kind]||1));
    if(page>pages)page=pages;
    P.pages[kind]=page;
    const from=(page-1)*size;
    return {slice:arr.slice(from,from+size),page,pages,size,total:arr.length,from};
  }

  function pagerHtml(kind,info,sizes){
    const start=info.total?info.from+1:0;
    const end=Math.min(info.total,info.from+info.size);
    const options=(sizes||[25,50,100]).map(n=>`<option value="${n}" ${Number(n)===Number(info.size)?'selected':''}>${n}</option>`).join('');
    return `<div class="sc-pagination" data-sc-page="${kind}">
      <div class="sc-pagination-summary">Showing <b>${start}-${end}</b> of <b>${info.total}</b></div>
      <div class="sc-pagination-actions">
        <label>Show <select onchange="scPerfPageSize('${kind}',this.value)">${options}</select></label>
        <button class="btn ghost sm" type="button" onclick="scPerfSetPage('${kind}',${info.page-1})" ${info.page<=1?'disabled':''}>← Previous</button>
        <span class="sc-page-number">Page <b>${info.page}</b> / ${info.pages}</span>
        <button class="btn ghost sm" type="button" onclick="scPerfSetPage('${kind}',${info.page+1})" ${info.page>=info.pages?'disabled':''}>Next →</button>
      </div>
    </div>`;
  }

  function appendPager(containerId,kind,info,sizes){
    const box=el(containerId);
    if(!box)return;
    box.insertAdjacentHTML('beforeend',pagerHtml(kind,info,sizes));
  }

  function renderKind(kind){
    if(kind==='quote'||kind==='pi')return window.renderDocLists?.();
    if(kind==='customer')return window.renderCustomers?.();
    if(kind==='item')return window.renderItems?.();
    if(kind==='device')return window.renderDevices?.();
    if(kind==='quoteRequest')return window.renderBranchRequests?.();
    if(kind==='purchaseOrder')return window.renderPurchaseOrders?.();
    if(kind==='salesOrder')return window.renderSalesOrders91?.();
  }

  window.scPerfSetPage=function(kind,page){
    P.pages[kind]=Math.max(1,Number(page)||1);
    renderKind(kind);
  };

  window.scPerfPageSize=function(kind,size){
    P.sizes[kind]=Math.max(1,Number(size)||25);
    P.pages[kind]=1;
    renderKind(kind);
  };

  /* ---------------------------------------------------------------
     Fast document list table: same UI/actions, O(1) relationship lookup.
     --------------------------------------------------------------- */
  const fastDocTable=function(arr,isQ){
    if(!arr.length)return `<div class="empty">${isQ?'No quotations found.':'No documents found.'}</div>`;

    /*
      IMPORTANT:
      Pagination renders only the visible page slice, but quotation revision
      relationships must be calculated from the COMPLETE visible document set.
      This preserves the V7.9 revision/history behaviour while keeping the
      performance pagination.
    */
    const full=P.docContext||state.docs||[];
    const byId=P.docById||new Map(full.map(d=>[d.id,d]));

    const piBySource=P.piBySource||(()=>{
      const m=new Map();
      full.forEach(d=>{
        if(d.type==='PI'&&d.sourceQuoteId&&!m.has(d.sourceQuoteId)){
          m.set(d.sourceQuoteId,d);
        }
      });
      return m;
    })();

    const quoteChains=new Map();
    full.forEach(d=>{
      if(d.type!=='Q')return;
      const key=d.core||d.id;
      if(!quoteChains.has(key))quoteChains.set(key,[]);
      quoteChains.get(key).push(d);
    });
    quoteChains.forEach(chain=>{
      chain.sort((a,b)=>(Number(a.rev||0)-Number(b.rev||0)) || (Number(a.created||0)-Number(b.created||0)));
    });

    return `<table class="table"><thead><tr><th>Document</th><th>Customer</th><th>PO / Ref</th><th>Mode</th><th>Total</th><th>Status / Link</th><th>Actions</th></tr></thead><tbody>${arr.map(d=>{
      const t=docTotals(d);
      const replacement=d.replacedBy?byId.get(d.replacedBy):null;
      const source=d.sourceQuoteId?byId.get(d.sourceQuoteId):null;
      const generatedPI=isQ?piBySource.get(d.id):null;

      let status='';
      let actions='';

      if(isQ){
        const chain=quoteChains.get(d.core||d.id)||[d];
        const locked=!!d.replacedBy;

        if(locked){
          status=`<span class="tag replaced">REPLACED / LOCKED</span>
            <div class="small">Current: ${esc(replacement?.serial||chain[chain.length-1]?.serial||'new revision')}</div>`;
        }else if(generatedPI){
          status=`<span class="tag pi-generated">PI GENERATED</span>
            <div class="small">${esc(generatedPI.serial)}</div>`;
        }else{
          status=`<span class="tag">ACTIVE${d.rev?` • R${Number(d.rev)}`:''}</span>`;
        }

        if(chain.length>1){
          status+=`<div style="margin-top:5px">
            <button class="btn ghost sm" onclick="openRevisionHistory('${d.id}')">History (${chain.length})</button>
          </div>`;
        }

        actions=locked
          ? `<button class="btn ghost sm" onclick="viewDocument('${d.id}')">View</button>`
          : `<button class="btn ghost sm" onclick="viewDocument('${d.id}')">Open</button>
             <button class="btn green sm" onclick="downloadSavedPDF('${d.id}')">PDF</button>
             <button class="btn amber sm" onclick="reviseQuote('${d.id}')">Revise</button>
             <button class="btn navy sm" onclick="convertQuote('${d.id}')">PI</button>
             <button class="btn red sm" onclick="requestDeleteDoc('${d.id}')">×</button>`;

        return `<tr class="${locked?'locked-row':''}">
          <td>
            <b>${esc(d.serial)}</b>
            <div class="small">${fmtDate(d.date)} • ${esc(d.category||'label')}</div>
            <div class="audit-badge">By: ${esc(d.createdBy||d.createdByUser||'Legacy')}</div>
            ${d.revisionNote?`<div class="small">Revision: ${esc(d.revisionNote)}</div>`:''}
          </td>
          <td><b>${esc(d.customer?.name||'')}</b><div class="small">${esc(d.customer?.phone||'')}</div></td>
          <td>${esc(d.poRef||'-')}</td>
          <td><span class="tag ${d.payMode==='cash'?'cash':'credit'}">${esc((d.payMode||'credit').toUpperCase())}</span>${d.vatMode==='vat18'?'<div class="small">VAT Breakdown</div>':''}</td>
          <td><b>LKR ${money(t.gross)}</b></td>
          <td>${status}</td>
          <td>${actions}</td>
        </tr>`;
      }

      if(source){
        status=`<span class="tag">FROM QUOTE</span><div class="small">${esc(source.serial)}</div>`;
      }else{
        status='<span class="tag">ACTIVE</span>';
      }

      actions=`<button class="btn ghost sm" onclick="viewDocument('${d.id}')">Open</button>
        <button class="btn green sm" onclick="downloadSavedPDF('${d.id}')">PDF</button>
        <button class="btn red sm" onclick="requestDeleteDoc('${d.id}')">×</button>`;

      return `<tr>
        <td><b>${esc(d.serial)}</b><div class="small">${fmtDate(d.date)} • ${esc(d.category||'label')}</div><div class="audit-badge">By: ${esc(d.createdBy||d.createdByUser||'Legacy')}</div></td>
        <td><b>${esc(d.customer?.name||'')}</b><div class="small">${esc(d.customer?.phone||'')}</div></td>
        <td>${esc(d.poRef||'-')}</td>
        <td><span class="tag ${d.payMode==='cash'?'cash':'credit'}">${esc((d.payMode||'credit').toUpperCase())}</span>${d.vatMode==='vat18'?'<div class="small">VAT Breakdown</div>':''}</td>
        <td><b>LKR ${money(t.gross)}</b></td>
        <td>${status}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
  };

  try{docTable=fastDocTable}catch(e){}
  window.docTable=fastDocTable;

  /* ---------------------------------------------------------------
     Quotations + PI pagination. Existing payment buttons, owner column,
     visibility permissions and actions remain provided by the old wrappers.
     --------------------------------------------------------------- */
  const baseRenderDocLists=window.renderDocLists;
  if(typeof baseRenderDocLists==='function'){
    const optimizedRenderDocLists=function(){
      if(!el('quoteList')||!el('piList'))return baseRenderDocLists();

      const all=state.docs||[];
      const visible=typeof visibleToCurrent==='function'?all.filter(visibleToCurrent):all;
      const qs=(el('quoteSearch')?.value||'').toLowerCase();
      const ps=(el('piSearch')?.value||'').toLowerCase();
      const show=!!el('showReplaced')?.checked;

      resetOnQuery('quote',`${qs}|${show}`);
      resetOnQuery('pi',ps);

      const quotes=visible.filter(d=>d.type==='Q'&&(show||!d.replacedBy)&&[d.serial,d.customer?.name,d.poRef].join(' ').toLowerCase().includes(qs));
      const pis=visible.filter(d=>d.type==='PI'&&[d.serial,d.customer?.name,d.poRef].join(' ').toLowerCase().includes(ps));
      const qi=pageSlice('quote',quotes,25);
      const pii=pageSlice('pi',pis,25);
      const subset=[...qi.slice,...pii.slice];

      P.docContext=visible;
      P.docById=new Map(visible.map(d=>[d.id,d]));
      P.piBySource=new Map();
      visible.forEach(d=>{if(d.type==='PI'&&d.sourceQuoteId&&!P.piBySource.has(d.sourceQuoteId))P.piBySource.set(d.sourceQuoteId,d)});

      state.docs=subset;
      try{baseRenderDocLists()}finally{
        state.docs=all;
        P.docContext=null;P.docById=null;P.piBySource=null;
      }

      appendPager('quoteList','quote',qi,[25,50,100]);
      appendPager('piList','pi',pii,[25,50,100]);
    };
    window.renderDocLists=optimizedRenderDocLists;
    try{renderDocLists=optimizedRenderDocLists}catch(e){}
  }

  /* ---------------------------------------------------------------
     Customer Master pagination while preserving all existing wrappers.
     --------------------------------------------------------------- */
  const baseRenderCustomers=window.renderCustomers;
  if(typeof baseRenderCustomers==='function'){
    const optimizedRenderCustomers=function(){
      const box=el('customerList');
      if(!box)return baseRenderCustomers();
      const all=state.customers||[];
      const visible=typeof visibleToCurrent==='function'?all.filter(visibleToCurrent):all;
      const q=(el('customerSearch')?.value||'').toLowerCase();
      resetOnQuery('customer',q);
      const matching=visible.filter(c=>[c.name,c.address,c.phone,c.email].join(' ').toLowerCase().includes(q));
      const info=pageSlice('customer',matching,25);
      state.customers=info.slice;
      try{baseRenderCustomers()}finally{state.customers=all}
      appendPager('customerList','customer',info,[25,50,100]);
    };
    window.renderCustomers=optimizedRenderCustomers;
    try{renderCustomers=optimizedRenderCustomers}catch(e){}
  }

  /* ---------------------------------------------------------------
     Label Master pagination.
     --------------------------------------------------------------- */
  const baseRenderItems=window.renderItems;
  if(typeof baseRenderItems==='function'){
    const optimizedRenderItems=function(){
      const box=el('itemList');
      if(!box)return baseRenderItems();
      const all=state.items||[];
      /* Preserve the existing V7 cleanup side effect for the whole master. */
      all.forEach(i=>{if(i.costSnapshot?.kind==='label'||/label roll/i.test(i.desc||''))i.desc='ELP';i.packing=''});
      const q=(el('itemSearch')?.value||'').toLowerCase();
      resetOnQuery('item',q);
      const matching=all.filter(i=>[i.desc,i.size,i.material,i.layout,i.pcs].join(' ').toLowerCase().includes(q));
      const info=pageSlice('item',matching,25);
      state.items=info.slice;
      try{baseRenderItems()}finally{state.items=all}
      appendPager('itemList','item',info,[25,50,100]);
    };
    window.renderItems=optimizedRenderItems;
    try{renderItems=optimizedRenderItems}catch(e){}
  }

  /* ---------------------------------------------------------------
     Device Master pagination + lazy image loading/decoding.
     --------------------------------------------------------------- */
  const baseRenderDevices=window.renderDevices;
  if(typeof baseRenderDevices==='function'){
    const optimizedRenderDevices=function(){
      const box=el('deviceList');
      if(!box)return baseRenderDevices();
      const all=state.devices||[];
      const q=(el('deviceSearch')?.value||'').toLowerCase();
      resetOnQuery('device',q);
      const matching=all.filter(d=>[d.name,d.model,d.brand,d.features].join(' ').toLowerCase().includes(q));
      const info=pageSlice('device',matching,24);
      state.devices=info.slice;
      try{baseRenderDevices()}finally{state.devices=all}
      box.querySelectorAll('img').forEach(img=>{img.loading='lazy';img.decoding='async'});
      appendPager('deviceList','device',info,[24,48,96]);
    };
    window.renderDevices=optimizedRenderDevices;
    try{renderDevices=optimizedRenderDevices}catch(e){}
  }

  /* ---------------------------------------------------------------
     Quote Request Desk pagination.
     --------------------------------------------------------------- */
  const baseRenderBranchRequests=window.renderBranchRequests;
  if(typeof baseRenderBranchRequests==='function'){
    window.renderBranchRequests=function(){
      const box=el('branchRequestList');
      if(!box)return baseRenderBranchRequests();
      const all=state.quoteRequests||[];
      const f=el('brStatusFilter')?.value||'';
      resetOnQuery('quoteRequest',f);
      const visible=all.filter(r=>currentUser?.role==='admin'||r.requester===currentUser?.username||r.handler===currentUser?.username||(typeof hasPerm==='function'&&hasPerm('manage_quote_requests')));
      const matching=visible.filter(r=>!f||r.status===f);
      const info=pageSlice('quoteRequest',matching,25);
      state.quoteRequests=info.slice;
      try{baseRenderBranchRequests()}finally{state.quoteRequests=all}
      appendPager('branchRequestList','quoteRequest',info,[25,50,100]);
    };
    try{renderBranchRequests=window.renderBranchRequests}catch(e){}
  }

  /* ---------------------------------------------------------------
     Purchase Order pagination. KPI totals still use the full PO set.
     --------------------------------------------------------------- */
  const baseRenderPurchaseOrders=window.renderPurchaseOrders;
  if(typeof baseRenderPurchaseOrders==='function'){
    window.renderPurchaseOrders=function(){
      if(!el('poList'))return baseRenderPurchaseOrders();
      const allowed=currentUser?.role==='admin'||(typeof hasPerm==='function'&&hasPerm('purchase_orders_view'));
      if(!allowed)return baseRenderPurchaseOrders();
      const all=state.purchaseOrders||[];
      const q=(el('poSearch')?.value||'').trim().toLowerCase();
      const sf=el('poStatusFilter')?.value||'';
      resetOnQuery('purchaseOrder',`${q}|${sf}`);
      const matching=all.filter(po=>(!sf||po.status===sf)&&(!q||[po.poNo,po.supplier?.name,po.supplierRef,...(po.lines||[]).map(l=>l.description+' '+l.spec)].join(' ').toLowerCase().includes(q))).sort((x,y)=>String(y.updatedAt||y.createdAt||'').localeCompare(String(x.updatedAt||x.createdAt||'')));
      const info=pageSlice('purchaseOrder',matching,20);
      state.purchaseOrders=info.slice;
      try{baseRenderPurchaseOrders()}finally{state.purchaseOrders=all}

      const k=el('poKpis');
      if(k){
        const counts={draft:0,sent:0,partial:0,received:0,cancelled:0};
        all.forEach(p=>{if(p.status==='Draft'||p.status==='Approved')counts.draft++;if(p.status==='Sent'||p.status==='Supplier Confirmed')counts.sent++;if(p.status==='Partially Received')counts.partial++;if(p.status==='Received')counts.received++;if(p.status==='Cancelled')counts.cancelled++});
        k.innerHTML=`<div class="po-kpi"><span>Total POs</span><b>${all.length}</b></div><div class="po-kpi"><span>Draft / Approved</span><b>${counts.draft}</b></div><div class="po-kpi sent"><span>Sent / Confirmed</span><b>${counts.sent}</b></div><div class="po-kpi partial"><span>Partial</span><b>${counts.partial}</b></div><div class="po-kpi received"><span>Received</span><b>${counts.received}</b></div>`;
      }
      appendPager('poList','purchaseOrder',info,[20,50,100]);
    };
    try{renderPurchaseOrders=window.renderPurchaseOrders}catch(e){}
  }

  /* ---------------------------------------------------------------
     Sales Order pagination.
     --------------------------------------------------------------- */
  const baseRenderSalesOrders=window.renderSalesOrders91;
  if(typeof baseRenderSalesOrders==='function'){
    window.renderSalesOrders91=function(){
      if(!el('soList91'))return baseRenderSalesOrders();
      const all=state.salesOrders||[];
      const q=(el('soSearch91')?.value||'').toLowerCase();
      const f=el('soStatus91')?.value||'';
      resetOnQuery('salesOrder',`${q}|${f}`);
      const matching=all.filter(x=>currentUser?.role==='admin'||x.ownerUser===currentUser?.username).filter(x=>(!f||x.erpStatus===f)&&[x.soNo,x.customerName,x.sourcePISerial,x.erpSONo,x.customerRef].join(' ').toLowerCase().includes(q));
      const info=pageSlice('salesOrder',matching,25);
      state.salesOrders=info.slice;
      try{baseRenderSalesOrders()}finally{state.salesOrders=all}
      appendPager('soList91','salesOrder',info,[25,50,100]);
    };
    try{renderSalesOrders91=window.renderSalesOrders91}catch(e){}
  }

  /* ---------------------------------------------------------------
     Debounced searches. Replacing DOM0 handlers here supersedes the inline
     immediate-render handlers without changing the markup or business logic.
     --------------------------------------------------------------- */
  function installSearch(id,kind,renderer){
    const input=el(id);if(!input)return;
    input.oninput=function(){P.pages[kind]=1;debounce('search:'+kind,renderer,220)};
  }
  installSearch('quoteSearch','quote',()=>window.renderDocLists?.());
  installSearch('piSearch','pi',()=>window.renderDocLists?.());
  installSearch('customerSearch','customer',()=>window.renderCustomers?.());
  installSearch('itemSearch','item',()=>window.renderItems?.());
  installSearch('deviceSearch','device',()=>window.renderDevices?.());
  installSearch('poSearch','purchaseOrder',()=>window.renderPurchaseOrders?.());
  installSearch('soSearch91','salesOrder',()=>window.renderSalesOrders91?.());

  const showReplaced=el('showReplaced');
  if(showReplaced)showReplaced.onchange=function(){P.pages.quote=1;window.renderDocLists?.()};
  const brStatus=el('brStatusFilter');
  if(brStatus)brStatus.onchange=function(){P.pages.quoteRequest=1;window.renderBranchRequests?.()};
  const poStatus=el('poStatusFilter');
  if(poStatus)poStatus.onchange=function(){P.pages.purchaseOrder=1;window.renderPurchaseOrders?.()};
  const soStatus=el('soStatus91');
  if(soStatus)soStatus.onchange=function(){P.pages.salesOrder=1;window.renderSalesOrders91?.()};

  /* ---------------------------------------------------------------
     Active-view-only refresh. This is the largest realtime performance win:
     one changed entity no longer rebuilds every hidden table/module.
     --------------------------------------------------------------- */
  const optimizedRefreshAll=function(){
    try{updateStats()}catch(e){}
    const id=activeView();

    try{
      switch(id){
        case 'dashboard':
          if(typeof renderDashboardReport==='function')renderDashboardReport();
          if(typeof renderApprovalInbox==='function')renderApprovalInbox();
          break;
        case 'editor':
          if(typeof refreshCustomerPick==='function')refreshCustomerPick();
          break;
        case 'quotations':
        case 'pis':
          window.renderDocLists?.();
          break;
        case 'customers':
          window.renderCustomers?.();
          break;
        case 'items':
          window.renderItems?.();
          break;
        case 'devices':
          window.renderDevices?.();
          break;
        case 'admin':
          if(typeof loadAdminPanel==='function')loadAdminPanel();
          break;
        case 'settings':
          if(typeof renderUsers==='function')renderUsers();
          if(typeof loadSettingsUI==='function')loadSettingsUI();
          if(typeof refreshUserCompanyLinkOptions==='function')refreshUserCompanyLinkOptions();
          break;
        case 'categories':
          if(typeof renderCategories==='function')renderCategories();
          break;
        case 'products':
          if(typeof renderProducts==='function')renderProducts();
          break;
        case 'production':
          if(typeof renderProductionBoard==='function')renderProductionBoard();
          break;
        case 'productionproducts':
          if(typeof renderProductionProducts==='function')renderProductionProducts();
          break;
        case 'stores':
          if(typeof renderStoresQueueV8==='function')renderStoresQueueV8();
          break;
        case 'introducers':
          if(typeof renderIntroducersV84==='function')renderIntroducersV84();
          break;
        case 'branchportal':
          if(typeof renderPortalMasters==='function')renderPortalMasters();
          if(typeof renderBpCart==='function')renderBpCart();
          if(typeof renderMyBranchRequests==='function')renderMyBranchRequests();
          if(typeof refreshBranchCustomerProfiles==='function')refreshBranchCustomerProfiles();
          break;
        case 'quoterequests':
          window.renderBranchRequests?.();
          break;
        case 'purchaseorders':
          window.renderPurchaseOrders?.();
          break;
        case 'dealerfulfilment':
          if(typeof renderDealerFulfilment==='function')renderDealerFulfilment();
          break;
        case 'salesorders':
          window.renderSalesOrders91?.();
          break;
      }
    }catch(e){console.warn('SoftCreation active-view refresh failed',e)}
  };

  window.refreshAll=optimizedRefreshAll;
  try{refreshAll=optimizedRefreshAll}catch(e){}

  /* Ensure expensive select lists/settings are refreshed when those views are
     actually opened, rather than continuously while hidden. */
  const baseShowView=window.showView;
  if(typeof baseShowView==='function'){
    window.showView=function(id){
      const result=baseShowView.apply(this,arguments);
      try{
        if(id==='editor'&&typeof refreshCustomerPick==='function')refreshCustomerPick();
        if(id==='settings'){
          if(typeof renderUsers==='function')renderUsers();
          if(typeof loadSettingsUI==='function')loadSettingsUI();
          if(typeof refreshUserCompanyLinkOptions==='function')refreshUserCompanyLinkOptions();
        }
      }catch(e){}
      return result;
    };
    try{showView=window.showView}catch(e){}
  }

  /* Render the currently visible list once through the optimized renderer. */
  setTimeout(()=>{
    try{optimizedRefreshAll()}catch(e){}
  },0);

})();
