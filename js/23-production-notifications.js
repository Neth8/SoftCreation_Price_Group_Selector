
/* =========================================================
   V1.0.39 - Production Summary notification bell
             + Approved Prices previously quoted items
   ========================================================= */
(function(){
  'use strict';

  /* ---------- narrowly scoped UI styles ---------- */
  if(!document.getElementById('v1039ScopedStyles')){
    const st=document.createElement('style');
    st.id='v1039ScopedStyles';
    st.textContent=`
      #production .prod-summary-title-actions{display:flex;align-items:center;gap:8px}
      #production .prod-notification-bell{position:relative;width:36px;height:34px;border:1px solid rgba(255,255,255,.55);border-radius:10px;background:rgba(255,255,255,.16);color:#fff;cursor:pointer;font-size:17px;display:inline-flex;align-items:center;justify-content:center}
      #production .prod-notification-bell:hover{background:rgba(255,255,255,.25)}
      #production .prod-notification-count{position:absolute;right:-5px;top:-7px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#d74a4a;color:#fff;border:2px solid #087f83;font-size:9px;font-weight:1000;display:none;align-items:center;justify-content:center}
      #production #prodNotifications{display:none!important}
      #productionNotificationsModalV1039 .modal-card{max-width:760px}
      #productionNotificationsModalV1039 .prod-note-summary{padding:10px 12px;border-radius:11px;background:#eef8f8;color:#087f83;font-weight:900;margin-bottom:10px}
      #productionNotificationsModalV1039 .prod-note-row{border:1px solid #d9e7e9;border-radius:12px;padding:11px 12px;background:#fff;margin-top:8px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      #productionNotificationsModalV1039 .prod-note-copy{min-width:0;line-height:1.45}
      #productionNotificationsModalV1039 .prod-note-copy .small{margin-top:4px;color:#6c7d86}
      #productionNotificationsModalV1039 .prod-note-mark{display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;border-radius:999px;background:#fff1cc;color:#8b5700;font-weight:1000;margin-right:5px}
      #branchportal #bpPreviousQuotedCardV1039{margin-bottom:12px}
      #branchportal #bpPreviousQuotedCardV1039 .bp-prev-head-v1039{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:9px}
      #branchportal #bpPreviousQuotedCardV1039 .bp-prev-head-v1039 h3{margin:0}
      #branchportal #bpPreviousQuotedCardV1039 .bp-prev-lock-v1039{padding:4px 8px;border-radius:999px;background:#e7f7ef;color:#0a7443;border:1px solid #bee7d1;font-size:9px;font-weight:1000;white-space:nowrap}
      #branchportal #bpPreviousQuotedCardV1039 .bp-prev-item-v1039{border:1px solid #d9e7e9;border-radius:11px;padding:10px;margin-top:8px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}
      #branchportal #bpPreviousQuotedCardV1039 .bp-prev-price-v1039{font-size:14px;font-weight:1000;color:#087f83;margin-top:4px}
      #branchportal #bpPreviousQuotedCardV1039 .bp-prev-controls-v1039{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
      #branchportal #bpPreviousQuotedCardV1039 .bp-prev-controls-v1039 input{width:78px;border:1px solid #cfdde2;border-radius:9px;padding:7px 8px}
      #branchportal #bpPreviousQuotedCardV1039 .bp-prev-pager-v1039{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;font-size:10px;color:#647680;flex-wrap:wrap}
      @media(max-width:700px){#branchportal #bpPreviousQuotedCardV1039 .bp-prev-item-v1039{grid-template-columns:1fr}#branchportal #bpPreviousQuotedCardV1039 .bp-prev-controls-v1039{justify-content:flex-start}}
    `;
    document.head.appendChild(st);
  }

  /* ---------- Production Summary notification bell ---------- */
  function summaryUnreadNotificationsV1039(){
    return (state.notifications||[]).filter(x=>!x.read&&(currentUser?.role==='admin'||x.user===currentUser?.username));
  }

  function ensureProductionNotificationUIV1039(){
    const section=$('production');
    if(!section)return;
    const title=section.querySelector('.panel-title');
    if(title && !$('prodNotificationBellV1039')){
      let span=title.querySelector('span');
      if(!span){
        const label=[...title.childNodes].find(n=>n.nodeType===3&&String(n.textContent||'').trim());
        span=document.createElement('span');
        span.textContent=label?String(label.textContent).trim():'Productions Summary';
        if(label)label.remove();
        title.insertBefore(span,title.firstChild);
      }
      const actions=document.createElement('div');
      actions.className='prod-summary-title-actions';
      actions.innerHTML=`<button id="prodNotificationBellV1039" class="prod-notification-bell" type="button" onclick="openProductionNotificationsV1039()" title="Notifications" aria-label="Production notifications">🔔<span id="prodNotificationCountV1039" class="prod-notification-count">0</span></button>`;
      const refresh=title.querySelector('button:not(#prodNotificationBellV1039)');
      if(refresh){actions.appendChild(refresh)}
      title.appendChild(actions);
    }
    if(!$('productionNotificationsModalV1039')){
      document.body.insertAdjacentHTML('beforeend',`<div id="productionNotificationsModalV1039" class="modal"><div class="modal-card"><div class="modal-head"><div><b>Notifications</b><div class="small">Productions Summary updates</div></div><button class="closex" onclick="closeModal('productionNotificationsModalV1039')">×</button></div><div id="productionNotificationsBodyV1039" class="modal-body"></div></div></div>`);
    }
  }

  function updateProductionNotificationBellV1039(){
    ensureProductionNotificationUIV1039();
    const n=summaryUnreadNotificationsV1039();
    const badge=$('prodNotificationCountV1039');
    if(badge){badge.textContent=n.length>99?'99+':String(n.length);badge.style.display=n.length?'inline-flex':'none'}
    const legacy=$('prodNotifications');if(legacy)legacy.innerHTML='';
  }

  window.openProductionNotificationsV1039=function(){
    ensureProductionNotificationUIV1039();
    const n=summaryUnreadNotificationsV1039();
    const body=$('productionNotificationsBodyV1039');
    if(body){
      body.innerHTML=`<div class="prod-note-summary">${n.length} update(s)</div>${n.length?n.map(x=>`<div class="prod-note-row"><div class="prod-note-copy"><div><span class="prod-note-mark">!</span><b>${esc(x.title||'Update')}</b> — ${esc(x.message||'')}</div><div class="small">${x.at?esc(new Date(x.at).toLocaleString()):''}</div></div><button class="btn ghost sm" type="button" onclick="readProductionNotificationV1039('${x.id}')">Read</button></div>`).join(''):'<div class="empty">No unread notifications.</div>'}`;
    }
    $('productionNotificationsModalV1039')?.classList.add('show');
  };

  window.readProductionNotificationV1039=function(id){
    const n=(state.notifications||[]).find(x=>x.id===id);if(n)n.read=true;
    saveState();
    updateProductionNotificationBellV1039();
    openProductionNotificationsV1039();
  };

  window.renderProductionNotificationsV8=updateProductionNotificationBellV1039;
  try{renderProductionNotificationsV8=window.renderProductionNotificationsV8}catch(_){}

  const summaryRenderBaseV1039=window.renderProductionBoard;
  if(typeof summaryRenderBaseV1039==='function'){
    window.renderProductionBoard=function(){
      const r=summaryRenderBaseV1039.apply(this,arguments);
      document.querySelectorAll('#prodBoard button').forEach(btn=>{
        const oc=btn.getAttribute('onclick')||'';
        if(/openProductionV8\s*\(/.test(oc))btn.remove();
      });
      updateProductionNotificationBellV1039();
      return r;
    };
    try{renderProductionBoard=window.renderProductionBoard}catch(_){}
  }

  /* ---------- Approved Prices: Previously Quoted Items ---------- */
  let prevQuotedCacheV1039=[];
  let prevQuotedPageV1039=1;
  const PREV_QUOTED_PAGE_SIZE_V1039=5;

  function normV1039(v=''){return String(v??'').trim().toLowerCase().replace(/\s+/g,' ')}
  function fingerprintV1039(l={}){
    if(l.itemId)return `${l.kind||'item'}::${l.itemId}`;
    return [l.kind||'label',l.desc||'',l.size||'',l.material||'',l.layout||'',l.pcs||'',l.unit||''].map(normV1039).join('::');
  }
  function currentUserRecordV1039(){return (state.users||[]).find(u=>u.id===currentUser?.id||u.username===currentUser?.username)||null}
  function convertedPISourcesV1039(){
    const docs=state.docs||[],byId=new Map(docs.map(d=>[d.id,d])),requests=new Map((state.quoteRequests||[]).map(r=>[r.id,r]));
    const u=currentUserRecordV1039(),username=currentUser?.username||'',allowedCustomerIds=new Set();
    if(u?.companyLinkType==='customer'&&u.companyLinkId)allowedCustomerIds.add(u.companyLinkId);
    (state.customers||[]).filter(c=>c.ownerUser===username).forEach(c=>allowedCustomerIds.add(c.id));
    if(u?.companyLinkType==='introducer'&&u.companyLinkId)(state.customers||[]).filter(c=>c.introducerId===u.companyLinkId).forEach(c=>allowedCustomerIds.add(c.id));
    return docs.filter(d=>{
      if(d.type!=='PI'||!d.sourceQuoteId)return false;
      const q=byId.get(d.sourceQuoteId);if(!q||q.type!=='Q')return false;
      if(currentUser?.role==='admin')return true;
      const req=q.sourceBranchRequestId?requests.get(q.sourceBranchRequestId):null;
      if(req?.requester===username)return true;
      if(allowedCustomerIds.has(d.customerId))return true;
      return d.ownerUser===username||q.ownerUser===username||d.createdByUser===username||q.createdByUser===username;
    }).sort((a,b)=>Number(b.created||Date.parse(b.createdAt||b.date||0)||0)-Number(a.created||Date.parse(a.createdAt||a.date||0)||0));
  }
  function selectedQuoteCustomerIdV1039(){
    const key=String($('bpCustomerProfile')?.value||'');
    if(key.startsWith('customer:'))return key.slice('customer:'.length);
    const name=normV1039($('bpCustomer')?.value||'');
    if(!name)return '';
    const matches=(state.customers||[]).filter(c=>normV1039(c.name)===name);
    return matches.length===1?matches[0].id:'';
  }
  function previousQuotedItemsV1039(customerId){
    const map=new Map();
    convertedPISourcesV1039().filter(pi=>pi.customerId===customerId).forEach(pi=>{
      const lines=typeof activeDocLines==='function'?activeDocLines(pi):(pi.lines||[]).filter(l=>l.use!==false);
      lines.forEach(line=>{
        const price=Number(line.price||0);if(!(price>0))return;
        const key=fingerprintV1039(line);if(map.has(key))return;
        const q=(state.docs||[]).find(x=>x.id===pi.sourceQuoteId);
        map.set(key,{kind:line.kind||'label',itemId:line.itemId||'',desc:line.desc||'ELP',size:line.size||'',material:line.material||'',layout:line.layout||'',pcs:line.pcs||'',unit:line.unit||'Rolls',price,priceTier:line.priceTier||'Previous Approved Price',sourcePISerial:pi.serial||'',sourcePIDate:pi.date||'',sourceQuoteSerial:q?.serial||''});
      });
    });
    return [...map.values()];
  }

  function ensurePreviousQuotedCardV1039(){
    const portal=$('branchportal');if(!portal||$('bpPreviousQuotedCardV1039'))return;
    const left=portal.querySelector('.portal-grid')?.children?.[0];if(!left)return;
    const firstCard=left.querySelector('.portal-card');if(!firstCard)return;
    firstCard.insertAdjacentHTML('beforebegin',`<div id="bpPreviousQuotedCardV1039" class="portal-card bp-v1030-quote-only"><div class="bp-prev-head-v1039"><div><h3>Previously Quoted Items</h3><div class="hint">Repeat items from this customer's quotation → PI history. The newest approved PI price is used.</div></div><span class="bp-prev-lock-v1039">LATEST APPROVED PRICE</span></div><div class="field"><label>Search Previous Items</label><input id="bpPrevQuotedSearchV1039" type="search" placeholder="Search size, material, item, quote or PI..." oninput="bpPrevQuotedSearchChangedV1039()"></div><div id="bpPrevQuotedSummaryV1039" class="small" style="margin-top:8px"></div><div id="bpPrevQuotedListV1039"></div><div id="bpPrevQuotedPagerV1039" class="bp-prev-pager-v1039"></div></div>`);
  }

  window.bpPrevQuotedSearchChangedV1039=function(){prevQuotedPageV1039=1;renderPreviousQuotedItemsV1039()};
  window.bpPrevQuotedPageV1039=function(p){prevQuotedPageV1039=Math.max(1,Number(p)||1);renderPreviousQuotedItemsV1039()};
  window.bpPrevQuotedAddV1039=function(i){
    const x=prevQuotedCacheV1039[Number(i)];if(!x)return;
    const qty=Math.max(1,Number($(`bpPrevQuotedQtyV1039_${i}`)?.value||1));
    if(typeof window.bpAddQuotedHistoryLineV1039!=='function')return toast('Unable to add previous item');
    window.bpAddQuotedHistoryLineV1039(x,qty);
  };

  window.renderPreviousQuotedItemsV1039=function(){
    ensurePreviousQuotedCardV1039();
    const box=$('bpPrevQuotedListV1039'),summary=$('bpPrevQuotedSummaryV1039'),pager=$('bpPrevQuotedPagerV1039');if(!box)return;
    const customerId=selectedQuoteCustomerIdV1039();
    let items=customerId?previousQuotedItemsV1039(customerId):[];
    const search=normV1039($('bpPrevQuotedSearchV1039')?.value||'');
    if(search)items=items.filter(x=>[x.desc,x.size,x.material,x.layout,x.pcs,x.sourcePISerial,x.sourceQuoteSerial,x.priceTier].join(' ').toLowerCase().includes(search));
    const total=items.length,pages=Math.max(1,Math.ceil(total/PREV_QUOTED_PAGE_SIZE_V1039));if(prevQuotedPageV1039>pages)prevQuotedPageV1039=pages;
    const start=(prevQuotedPageV1039-1)*PREV_QUOTED_PAGE_SIZE_V1039,page=items.slice(start,start+PREV_QUOTED_PAGE_SIZE_V1039);prevQuotedCacheV1039=page;
    if(summary)summary.innerHTML=customerId?(total?`<b>${total}</b> previously quoted item${total===1?'':'s'} • showing ${start+1}-${Math.min(start+page.length,total)}`:'No previously quoted items found for this customer.'):'Select a customer/company profile to view previous items.';
    box.innerHTML=page.length?page.map((x,i)=>`<div class="bp-prev-item-v1039"><div><b>${esc([x.desc,x.size,x.material,x.layout,x.pcs?x.pcs+' pcs':''].filter(Boolean).join(' • '))}</b><div class="small">${x.sourceQuoteSerial?`Quote ${esc(x.sourceQuoteSerial)} • `:''}${x.sourcePISerial?`Approved via ${esc(x.sourcePISerial)}`:''}${x.sourcePIDate?` • ${esc(x.sourcePIDate)}`:''}</div><div class="bp-prev-price-v1039">LKR ${money(x.price)} / ${esc(x.unit||'Unit')} <span class="small">• ${esc(x.priceTier||'Previous Approved Price')}</span></div></div><div class="bp-prev-controls-v1039"><label class="small">Qty</label><input id="bpPrevQuotedQtyV1039_${i}" type="number" min="1" step="1" value="1"><button class="btn primary sm" type="button" onclick="bpPrevQuotedAddV1039(${i})">+ Add Item</button></div></div>`).join(''):'<div class="empty" style="margin-top:8px">No previous items to show.</div>';
    if(pager)pager.innerHTML=total>PREV_QUOTED_PAGE_SIZE_V1039?`<span>Items ${start+1}-${Math.min(start+page.length,total)} of ${total}</span><div><button class="btn ghost sm" ${prevQuotedPageV1039<=1?'disabled':''} onclick="bpPrevQuotedPageV1039(${prevQuotedPageV1039-1})">← Previous</button> <span>Page <b>${prevQuotedPageV1039}</b> / ${pages}</span> <button class="btn ghost sm" ${prevQuotedPageV1039>=pages?'disabled':''} onclick="bpPrevQuotedPageV1039(${prevQuotedPageV1039+1})">Next →</button></div>`:'';
  };

  const loadProfileBaseV1039=window.loadBranchCustomerProfile;
  if(typeof loadProfileBaseV1039==='function'){
    window.loadBranchCustomerProfile=function(){const r=loadProfileBaseV1039.apply(this,arguments);prevQuotedPageV1039=1;renderPreviousQuotedItemsV1039();return r};
    try{loadBranchCustomerProfile=window.loadBranchCustomerProfile}catch(_){}
  }

  const showViewBaseV1039=window.showView;
  if(typeof showViewBaseV1039==='function'){
    window.showView=function(id){const r=showViewBaseV1039.apply(this,arguments);if(id==='production'){ensureProductionNotificationUIV1039();updateProductionNotificationBellV1039()}if(id==='branchportal'){ensurePreviousQuotedCardV1039();renderPreviousQuotedItemsV1039()}return r};
    try{showView=window.showView}catch(_){}
  }

  ensureProductionNotificationUIV1039();
  updateProductionNotificationBellV1039();
  ensurePreviousQuotedCardV1039();
  try{renderPreviousQuotedItemsV1039()}catch(_){}
})();
