
/* =========================================================
   v1.0.30
   APPROVED PRICES: QUOTATION REQUEST / SALES ORDER PORTAL
   + HIGH-FREQUENCY DROPDOWN PERFORMANCE
   ---------------------------------------------------------
   Sales Order sources:
   - Only saved PIs that were converted from quotations.
   - For portal users, the PI must belong to the signed-in user
     through a Branch Quotation Request, linked customer/company,
     owned customer, or introducer-linked customer.
   - Approved unit price is taken from the saved PI snapshot.
   - The newest converted-PI snapshot is shown per repeated item.
   - Sales Orders reuse state.salesOrders and Order Fulfilment.
   ========================================================= */
(function(){
  'use strict';

  const MODE_KEY_PREFIX='sc_branchportal_mode_v1030_';
  const SO_PAGE_SIZE=5;
  const SO_ITEM_PAGE_SIZE_V1032=5;
  const SO_PO_BUCKET_V1032='sales-order-po-files';
  const SO_PO_PROJECT_URL_V1032='https://qyxgamverzdmhtvezbft.supabase.co';
  const SO_PO_MAX_BYTES_V1032=10*1024*1024;
  const DIRECT='Direct delivery to dealer customers';
  const MIXED='Mixed delivery';

  let portalMode='quote';
  let soCart=[];
  let soDeliveries=[];
  let soItemCache=[];
  let soPage=1;
  let soItemPageV1032=1;
  let soPOFilePendingV1032=null;
  let soRealtimeTimerV1032=0;
  let lastSOEligibleCustomerId='';

  /* -------------------------------------------------------
     Shared helpers
     ------------------------------------------------------- */
  function userRecordV1030(){
    return (state.users||[]).find(
      u=>u.id===currentUser?.id || u.username===currentUser?.username
    )||null;
  }

  function normalizeV1030(v=''){
    return String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
  }

  function itemFingerprintV1030(l={}){
    if(l.itemId)return `${l.kind||'item'}::${l.itemId}`;
    return [
      l.kind||'label',
      l.desc||'',
      l.size||'',
      l.material||'',
      l.layout||'',
      l.pcs||'',
      l.unit||''
    ].map(normalizeV1030).join('::');
  }

  function customerAddressPartsV1030(c={}){
    const raw=String(c.delivery||c.address||'').trim();
    if(!raw)return {line1:'',line2:''};

    let parts=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(parts.length<2){
      const comma=raw.split(',').map(x=>x.trim()).filter(Boolean);
      if(comma.length>1)parts=comma;
    }

    return {
      line1:parts[0]||raw,
      line2:parts.slice(1).join(', ')
    };
  }

  function selectSetFastV1030(select,html,preferred='',signature=''){
    if(!select)return;
    const sig=signature||html;

    if(select.dataset.scOptionsV1030!==sig){
      select.innerHTML=html;
      select.dataset.scOptionsV1030=sig;
    }

    if(preferred!==undefined && preferred!==null){
      const value=String(preferred);
      if([...select.options].some(o=>o.value===value)){
        select.value=value;
      }
    }
  }

  window.scSelectSetFastV1030=selectSetFastV1030;

  function convertedPISourcesV1030(){
    const docs=state.docs||[];
    const byId=new Map(docs.map(d=>[d.id,d]));
    const requests=new Map((state.quoteRequests||[]).map(r=>[r.id,r]));
    const u=userRecordV1030();
    const username=currentUser?.username||'';

    const allowedCustomerIds=new Set();

    if(u?.companyLinkType==='customer' && u.companyLinkId){
      allowedCustomerIds.add(u.companyLinkId);
    }

    (state.customers||[])
      .filter(c=>c.ownerUser===username)
      .forEach(c=>allowedCustomerIds.add(c.id));

    if(u?.companyLinkType==='introducer' && u.companyLinkId){
      (state.customers||[])
        .filter(c=>c.introducerId===u.companyLinkId)
        .forEach(c=>allowedCustomerIds.add(c.id));
    }

    return docs
      .filter(d=>{
        if(d.type!=='PI' || !d.sourceQuoteId)return false;

        const q=byId.get(d.sourceQuoteId);
        if(!q || q.type!=='Q')return false;

        if(currentUser?.role==='admin')return true;

        const req=q.sourceBranchRequestId
          ? requests.get(q.sourceBranchRequestId)
          : null;

        if(req?.requester===username)return true;

        if(allowedCustomerIds.has(d.customerId))return true;

        if(
          d.ownerUser===username ||
          q.ownerUser===username ||
          d.createdByUser===username ||
          q.createdByUser===username
        ){
          return true;
        }

        return false;
      })
      .sort((a,b)=>
        Number(b.created||Date.parse(b.createdAt||b.date||0)||0) -
        Number(a.created||Date.parse(a.createdAt||a.date||0)||0)
      );
  }

  function eligibleCustomersV1030(){
    const source=convertedPISourcesV1030();
    const ids=new Set(source.map(d=>d.customerId).filter(Boolean));
    return (state.customers||[])
      .filter(c=>ids.has(c.id))
      .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  }

  function eligibleItemsV1030(customerId){
    const map=new Map();

    convertedPISourcesV1030()
      .filter(pi=>pi.customerId===customerId)
      .forEach(pi=>{
        const lines=
          typeof activeDocLines==='function'
            ? activeDocLines(pi)
            : (pi.lines||[]).filter(l=>l.use!==false);

        lines.forEach(line=>{
          const price=Number(line.price||0);
          if(!(price>0))return;

          const key=itemFingerprintV1030(line);
          if(map.has(key))return; // newest PI wins because source is newest first

          const q=(state.docs||[]).find(x=>x.id===pi.sourceQuoteId);

          map.set(key,{
            cartKey:`${key}::${pi.id}`,
            fingerprint:key,
            kind:line.kind||'label',
            itemId:line.itemId||'',
            desc:line.desc||'ELP',
            size:line.size||'',
            material:line.material||'',
            layout:line.layout||'',
            pcs:line.pcs||'',
            unit:line.unit||'Rolls',
            price,
            priceTier:line.priceTier||'Approved PI Price',
            sourcePIId:pi.id,
            sourcePISerial:pi.serial||'',
            sourcePIDate:pi.date||'',
            sourceQuoteId:pi.sourceQuoteId||'',
            sourceQuoteSerial:q?.serial||'',
            customerId:pi.customerId,
            customerName:pi.customer?.name||''
          });
        });
      });

    return [...map.values()];
  }

  function selectedSOCustomerV1030(){
    const id=$('bpSoCustomerV1030')?.value||'';
    return (state.customers||[]).find(c=>c.id===id)||null;
  }

  function newDeliveryV1030(customer=null,primary=false){
    const p=customerAddressPartsV1030(customer||{});

    return {
      id:uid('sodel'),
      primary:!!primary,
      name:customer?.name||'',
      line1:p.line1,
      line2:p.line2,
      contact1:customer?.phone||'',
      contact2:'',
      allocations:{}
    };
  }

  function ensureDeliveryBaseV1030(){
    const c=selectedSOCustomerV1030();
    if(!c)return;

    if(!soDeliveries.length){
      soDeliveries=[newDeliveryV1030(c,true)];
    }
  }

  function lineByKeyV1030(key){
    return soCart.find(l=>l.cartKey===key)||null;
  }

  function rebalanceAllocationsV1030(){
    ensureDeliveryBaseV1030();
    if(!soDeliveries.length)return;

    for(const line of soCart){
      let remaining=Math.max(0,Number(line.qty||0));

      for(let i=1;i<soDeliveries.length;i++){
        const d=soDeliveries[i];
        let q=Math.max(0,Number(d.allocations?.[line.cartKey]||0));
        q=Math.min(q,remaining);
        d.allocations[line.cartKey]=q;
        remaining-=q;
      }

      soDeliveries[0].allocations[line.cartKey]=remaining;
    }

    /* Remove allocations for cart lines that were deleted. */
    const keys=new Set(soCart.map(l=>l.cartKey));
    soDeliveries.forEach(d=>{
      Object.keys(d.allocations||{}).forEach(k=>{
        if(!keys.has(k))delete d.allocations[k];
      });
    });
  }

  function deliveryAllocatedV1030(d){
    return Object.values(d?.allocations||{})
      .reduce((s,q)=>s+Number(q||0),0);
  }

  function orderTotalV1030(){
    return soCart.reduce(
      (s,l)=>s+Number(l.qty||0)*Number(l.price||0),
      0
    );
  }

  /* -------------------------------------------------------
     Build portal UI without disturbing Quotation Request mode.
     ------------------------------------------------------- */
  function ensurePortalSOUIV1030(){
    const portal=$('branchportal');
    if(!portal || $('bpModeSwitchV1030'))return;

    const hero=portal.querySelector('.branch-hero');
    const grid=portal.querySelector('.portal-grid');
    if(!grid || grid.children.length<2)return;

    const left=grid.children[0];
    const right=grid.children[1];

    [...left.children].forEach(el=>{
      if(el.classList.contains('portal-card')){
        el.classList.add('bp-v1030-quote-only');
      }
    });

    [...right.children].forEach(el=>{
      if(el.classList.contains('portal-card')){
        el.classList.add('bp-v1030-quote-only');
      }
    });

    const modeHtml=`
      <div id="bpModeSwitchV1030" class="bp-mode-switch-v1030">
        <div>
          <b>Approved Prices Workflow</b>
          <span>Switch between a new quotation request and a repeat sales order.</span>
        </div>
        <div class="bp-mode-buttons-v1030">
          <button id="bpModeQuoteV1030" class="btn primary" type="button" onclick="bpSetPortalModeV1030('quote')">Quotation Request</button>
          <button id="bpModeSalesV1030" class="btn ghost" type="button" onclick="bpSetPortalModeV1030('sales')">Sales Order</button>
        </div>
      </div>
    `;

    if(hero)hero.insertAdjacentHTML('afterend',modeHtml);
    else grid.insertAdjacentHTML('beforebegin',modeHtml);

    left.insertAdjacentHTML('afterbegin',`
      <div id="bpSoItemCardV1030" class="portal-card bp-v1030-sales-only">
        <div class="bp-so-card-head-v1030">
          <div>
            <h3>Previously Approved Items</h3>
            <div class="hint">Only items from your quotations that were converted to Pro Forma Invoices are available. The newest approved PI price is locked.</div>
          </div>
          <span class="bp-so-lock-badge-v1030">PI PRICE LOCKED</span>
        </div>

        <div class="grid bp-so-filter-grid-v1030">
          <div class="field full">
            <label>Customer / Company</label>
            <select id="bpSoCustomerV1030" onchange="bpSoCustomerChangedV1030()"></select>
          </div>
          <div class="field full">
            <label>Search Previous Items</label>
            <input id="bpSoItemSearchV1030" type="search" placeholder="Search size, material, item, PI number..." oninput="bpSoItemSearchChangedV1032()">
          </div>
        </div>

        <div id="bpSoEligibleSummaryV1030" class="bp-so-source-summary-v1030"></div>
        <div id="bpSoEligibleItemsV1030" class="bp-so-eligible-items-v1030"></div>
        <div id="bpSoEligiblePagerV1032" class="bp-so-item-pager-v1032"></div>
      </div>
    `);

    right.insertAdjacentHTML('afterbegin',`
      <div id="bpSoOrderCardV1030" class="portal-card bp-v1030-sales-only">
        <div class="bp-so-card-head-v1030">
          <div>
            <h3>Sales Order</h3>
            <div class="hint">Select repeat-order items, set quantities, then split the order between one or more delivery addresses.</div>
          </div>
          <span id="bpSoOrderCustomerBadgeV1030" class="bp-so-lock-badge-v1030"></span>
        </div>

        <div class="section">Selected Items</div>
        <div id="bpSoSelectedItemsV1030"></div>

        <div class="grid bp-so-meta-v1030">
          <div class="field">
            <label>Sales Order Date</label>
            <input id="bpSoDateV1030" type="date">
          </div>
          <div class="field">
            <label>Required Date</label>
            <input id="bpSoNeedDateV1030" type="date">
          </div>
          <div class="field full">
            <label>Customer PO / Reference</label>
            <input id="bpSoRefV1030" placeholder="Optional customer PO / reference">

            <div class="bp-so-po-attach-v1032">
              <input
                id="bpSoPOFileV1032"
                type="file"
                hidden
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onchange="bpSoPOFileChangedV1032(this)"
              >

              <button
                class="btn ghost sm"
                type="button"
                onclick="$('bpSoPOFileV1032').click()"
              >
                + Attach PO / Order File
              </button>

              <div id="bpSoPOFileStatusV1032" class="bp-so-po-file-status-v1032">
                No file attached.
              </div>

              <div id="bpSoPOFileActionsV1032" class="bp-so-po-file-actions-v1032" style="display:none">
                <button class="btn ghost sm" type="button" onclick="bpSoViewPendingPOV1032()">View Selected</button>
                <button class="btn red sm" type="button" onclick="bpSoRemovePendingPOV1032()">Remove</button>
              </div>
            </div>
          </div>
          <div class="field full">
            <label>Stores / Production Note</label>
            <textarea id="bpSoNoteV1030" placeholder="Optional instructions"></textarea>
          </div>
        </div>

        <div class="section">Delivery Customers & Item Allocation</div>
        <div class="bp-so-delivery-hint-v1030">
          Each delivery block represents a <b>separate customer</b>. Delivery Customer 1 is the ordering customer and automatically receives the remaining quantity. Use <b>+ Add Separate Customer</b> to divide the selected items between other customers.
        </div>
        <div id="bpSoDeliveriesV1030"></div>

        <div class="actions bp-so-bottom-actions-v1030">
          <button class="btn ghost" type="button" onclick="bpSoAddDeliveryV1030()">+ Add Separate Customer</button>
        </div>

        <div id="bpSoValidationV1030"></div>

        <div class="bp-so-grand-total-v1030">
          <span>Sales Order Total</span>
          <strong id="bpSoTotalV1030">LKR 0.00</strong>
        </div>

        <div class="actions">
          <button id="bpSoSubmitBtnV1032" class="btn green" type="button" onclick="bpSoSubmitV1030()">Submit Sales Order</button>
          <button class="btn ghost" type="button" onclick="bpSoClearV1030()">Clear</button>
        </div>
      </div>
    `);

    right.insertAdjacentHTML('beforeend',`
      <div id="bpSoHistoryCardV1030" class="portal-card bp-v1030-sales-only" style="margin-top:12px">
        <div class="bp-so-card-head-v1030">
          <div>
            <h3>My Sales Orders</h3>
            <div class="hint">Your repeat Sales Orders are listed here with pagination.</div>
          </div>
        </div>
        <div id="bpSoMyOrdersV1030"></div>
      </div>
    `);

    document.body.insertAdjacentHTML('beforeend',`
      <div id="bpSoViewModalV1030" class="modal">
        <div class="modal-card" style="max-width:1000px">
          <div class="modal-head">
            <div>
              <b id="bpSoViewTitleV1030">Sales Order</b>
              <div id="bpSoViewMetaV1030" class="small"></div>
            </div>
            <button class="closex" type="button" onclick="closeModal('bpSoViewModalV1030')">×</button>
          </div>
          <div id="bpSoViewBodyV1030" class="modal-body"></div>
        </div>
      </div>
    `);

    $('bpSoDateV1030').value=today();
  }

  /* -------------------------------------------------------
     Mode switch
     ------------------------------------------------------- */
  window.bpSetPortalModeV1030=function(mode){
    ensurePortalSOUIV1030();

    portalMode=mode==='sales'?'sales':'quote';

    const portal=$('branchportal');
    portal?.classList.toggle('bp-portal-sales-mode-v1030',portalMode==='sales');

    const q=$('bpModeQuoteV1030');
    const s=$('bpModeSalesV1030');

    if(q){
      q.className=portalMode==='quote'?'btn primary':'btn ghost';
      q.setAttribute('aria-pressed',portalMode==='quote'?'true':'false');
    }

    if(s){
      s.className=portalMode==='sales'?'btn primary':'btn ghost';
      s.setAttribute('aria-pressed',portalMode==='sales'?'true':'false');
    }

    try{
      localStorage.setItem(
        MODE_KEY_PREFIX+(currentUser?.username||'guest'),
        portalMode
      );
    }catch(_){}

    if(portalMode==='sales'){
      bpSoRefreshV1030();
    }else{
      try{window.bpCalculate?.()}catch(_){}
      try{window.renderBpCart?.()}catch(_){}
      try{window.refreshBranchCustomerProfiles?.()}catch(_){}
    }
  };

  function restorePortalModeV1030(){
    let mode='quote';
    try{
      mode=localStorage.getItem(
        MODE_KEY_PREFIX+(currentUser?.username||'guest')
      )||'quote';
    }catch(_){}
    bpSetPortalModeV1030(mode);
  }

  /* -------------------------------------------------------
     Sales Order customer + item source
     ------------------------------------------------------- */
  window.bpSoCustomerChangedV1030=function(){
    if(soCart.length){
      /* The customer selector is disabled once items are added, so this
         path is mainly a safety backstop. */
      return;
    }

    lastSOEligibleCustomerId=$('bpSoCustomerV1030')?.value||'';
    soItemPageV1032=1;
    soDeliveries=[];
    ensureDeliveryBaseV1030();
    bpSoRenderEligibleItemsV1030();
    renderSOCartV1030();
    renderSODeliveriesV1030();
  };

  function renderSOCustomerOptionsV1030(){
    const select=$('bpSoCustomerV1030');
    if(!select)return;

    const customers=eligibleCustomersV1030();
    const current=select.value||lastSOEligibleCustomerId||'';
    const u=userRecordV1030();

    const preferred=
      customers.some(c=>c.id===current)
        ? current
        : (
            u?.companyLinkType==='customer' &&
            customers.some(c=>c.id===u.companyLinkId)
              ? u.companyLinkId
              : customers[0]?.id||''
          );

    const html=customers.length
      ? customers.map(c=>
          `<option value="${esc(c.id)}">${esc(c.name)}${c.phone?` • ${esc(c.phone)}`:''}</option>`
        ).join('')
      : '<option value="">No converted-PI customer available</option>';

    const sig=customers.map(c=>`${c.id}|${c.name}|${c.phone||''}`).join('~');

    selectSetFastV1030(select,html,preferred,sig);
    select.disabled=soCart.length>0 || !customers.length;

    lastSOEligibleCustomerId=select.value||'';

    if(!soDeliveries.length && select.value){
      ensureDeliveryBaseV1030();
    }

    const badge=$('bpSoOrderCustomerBadgeV1030');
    if(badge){
      const c=selectedSOCustomerV1030();
      badge.textContent=c?c.name:'NO ELIGIBLE CUSTOMER';
    }
  }

  window.bpSoItemSearchChangedV1032=function(){
    soItemPageV1032=1;
    bpSoRenderEligibleItemsV1030();
  };

  window.bpSoSetItemPageV1032=function(page){
    soItemPageV1032=Math.max(1,Number(page)||1);
    bpSoRenderEligibleItemsV1030();
  };

  window.bpSoRenderEligibleItemsV1030=function(){
    renderSOCustomerOptionsV1030();

    const customerId=$('bpSoCustomerV1030')?.value||'';
    const search=normalizeV1030($('bpSoItemSearchV1030')?.value||'');

    let items=customerId?eligibleItemsV1030(customerId):[];

    if(search){
      items=items.filter(x=>
        [
          x.desc,x.size,x.material,x.layout,x.pcs,
          x.sourcePISerial,x.sourceQuoteSerial,x.priceTier
        ].join(' ').toLowerCase().includes(search)
      );
    }

    const totalItems=items.length;
    const pages=Math.max(1,Math.ceil(totalItems/SO_ITEM_PAGE_SIZE_V1032));

    if(soItemPageV1032>pages)soItemPageV1032=pages;
    if(soItemPageV1032<1)soItemPageV1032=1;

    const start=(soItemPageV1032-1)*SO_ITEM_PAGE_SIZE_V1032;
    const pageItems=items.slice(start,start+SO_ITEM_PAGE_SIZE_V1032);

    /*
      Add-button indexes intentionally point only to the current page.
      This keeps the DOM small and makes Qty / Add controls immediately
      reachable without an inner scrolling panel.
    */
    soItemCache=pageItems;

    const sourceCount=new Set(items.map(x=>x.sourcePIId)).size;
    const summary=$('bpSoEligibleSummaryV1030');

    if(summary){
      summary.innerHTML=customerId
        ? (
            totalItems
              ? `<b>${totalItems}</b> repeat item${totalItems===1?'':'s'} from <b>${sourceCount}</b> converted PI${sourceCount===1?'':'s'} • Showing <b>${start+1}-${Math.min(start+pageItems.length,totalItems)}</b>.`
              : 'No matching previously approved items.'
          )
        : 'No eligible customer selected.';
    }

    const box=$('bpSoEligibleItemsV1030');
    const pager=$('bpSoEligiblePagerV1032');

    if(!box)return;

    box.innerHTML=pageItems.length
      ? pageItems.map((x,i)=>`
          <div class="bp-so-eligible-item-v1030">
            <div class="bp-so-item-main-v1030">
              <b>${esc([x.desc,x.size,x.material,x.layout,x.pcs?x.pcs+' pcs':''].filter(Boolean).join(' • '))}</b>

              <div class="small">
                Approved from ${esc(x.sourcePISerial)}
                ${x.sourcePIDate?` • ${esc(x.sourcePIDate)}`:''}
                ${x.sourceQuoteSerial?` • Quote ${esc(x.sourceQuoteSerial)}`:''}
              </div>

              <div class="bp-so-approved-price-v1030">
                LKR ${money(x.price)} / ${esc(x.unit||'Unit')}
                <span>${esc(x.priceTier||'Approved PI Price')}</span>
              </div>
            </div>

            <div class="bp-so-add-controls-v1030">
              <label>Qty</label>

              <div class="bp-so-qty-stepper-v1031">
                <button
                  type="button"
                  class="bp-so-qty-step-v1031"
                  onclick="bpSoAdjustAddQtyV1031(${i},-1)"
                  aria-label="Decrease quantity"
                >−</button>

                <input
                  id="bpSoAddQtyV1030_${i}"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  value="1"
                  onfocus="this.select()"
                  oninput="bpSoCleanAddQtyV1031(this)"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();bpSoAddItemV1030(${i})}"
                >

                <button
                  type="button"
                  class="bp-so-qty-step-v1031"
                  onclick="bpSoAdjustAddQtyV1031(${i},1)"
                  aria-label="Increase quantity"
                >+</button>
              </div>

              <button
                class="btn primary sm bp-so-add-visible-v1032"
                type="button"
                onclick="bpSoAddItemV1030(${i})"
              >
                + Add Item
              </button>
            </div>
          </div>
        `).join('')
      : '<div class="empty">No previously approved items found for this customer. Only quotation → PI history belonging to this portal user is shown.</div>';

    if(pager){
      pager.innerHTML=totalItems>SO_ITEM_PAGE_SIZE_V1032
        ? `
          <span>Items ${start+1}-${Math.min(start+pageItems.length,totalItems)} of ${totalItems}</span>

          <div>
            <button
              class="btn ghost sm"
              type="button"
              onclick="bpSoSetItemPageV1032(${soItemPageV1032-1})"
              ${soItemPageV1032<=1?'disabled':''}
            >
              ← Previous
            </button>

            <span>Page <b>${soItemPageV1032}</b> / ${pages}</span>

            <button
              class="btn ghost sm"
              type="button"
              onclick="bpSoSetItemPageV1032(${soItemPageV1032+1})"
              ${soItemPageV1032>=pages?'disabled':''}
            >
              Next →
            </button>
          </div>
        `
        : '';
    }
  };

  window.bpSoCleanAddQtyV1031=function(input){
    if(!input)return;

    let value=String(input.value||'')
      .replace(/[^\d.]/g,'');

    const dot=value.indexOf('.');

    if(dot!==-1){
      value=
        value.slice(0,dot+1)+
        value.slice(dot+1).replace(/\./g,'');
    }

    if(
      value.length>1 &&
      value.startsWith('0') &&
      value[1]!=='.'
    ){
      value=value.replace(/^0+/,'')||'0';
    }

    input.value=value;
  };

  window.bpSoAdjustAddQtyV1031=function(index,change){
    const input=$(`bpSoAddQtyV1030_${index}`);
    if(!input)return;

    let qty=Number(input.value||0);

    if(!Number.isFinite(qty)||qty<=0){
      qty=1;
    }

    qty=Math.max(
      1,
      qty+Number(change||0)
    );

    input.value=
      String(
        Math.round(qty*100)/100
      );

    input.focus();
    input.select();
  };

  window.bpSoAddItemV1030=function(index){
    const src=soItemCache[Number(index)];
    if(!src)return;

    const input=$(`bpSoAddQtyV1030_${index}`);

    const qty=
      Number(
        String(input?.value||'')
          .replace(',','.')
      );

    if(!(qty>0)){
      input?.focus();
      return toast('Enter a valid quantity');
    }

    const existing=soCart.find(x=>x.cartKey===src.cartKey);

    if(existing){
      existing.qty=Number(existing.qty||0)+qty;
    }else{
      soCart.push({...src,qty});
    }

    if(input){
      input.value='1';
    }

    ensureDeliveryBaseV1030();
    rebalanceAllocationsV1030();
    renderSOCartV1030();
    renderSODeliveriesV1030();
    renderSOCustomerOptionsV1030();

    toast('Item added to Sales Order');
  };

  window.bpSoSetQtyV1030=function(index,value){
    const line=soCart[Number(index)];
    if(!line)return;

    const qty=Math.max(0,Number(value||0));
    if(!(qty>0))return;

    line.qty=qty;
    rebalanceAllocationsV1030();
    renderSOCartV1030();
    renderSODeliveriesV1030();
  };

  window.bpSoRemoveItemV1030=function(index){
    index=Number(index);
    if(!Number.isInteger(index) || index<0 || index>=soCart.length)return;

    soCart.splice(index,1);
    rebalanceAllocationsV1030();
    renderSOCartV1030();
    renderSODeliveriesV1030();
    renderSOCustomerOptionsV1030();
    toast('Item removed from Sales Order');
  };

  function renderSOCartV1030(){
    const box=$('bpSoSelectedItemsV1030');
    if(!box)return;

    box.innerHTML=soCart.length
      ? `
        <div class="bp-so-selected-list-v1030">
          ${soCart.map((l,i)=>`
            <div class="bp-so-selected-line-v1030">
              <div>
                <b>${esc([l.desc,l.size,l.material,l.layout,l.pcs?l.pcs+' pcs':''].filter(Boolean).join(' • '))}</b>
                <div class="small">Locked: ${esc(l.sourcePISerial)} • LKR ${money(l.price)} / ${esc(l.unit)}</div>
              </div>
              <div class="field">
                <label>Qty</label>
                <input type="number" min="0.01" step="0.01" value="${Number(l.qty||1)}" onchange="bpSoSetQtyV1030(${i},this.value)">
              </div>
              <div class="bp-so-line-amount-v1030">
                <span>Amount</span>
                <b>LKR ${money(Number(l.qty||0)*Number(l.price||0))}</b>
              </div>
              <button class="btn red sm" type="button" onclick="bpSoRemoveItemV1030(${i})">×</button>
            </div>
          `).join('')}
        </div>
      `
      : '<div class="empty">Use the + Add buttons on the left to select repeat-order items.</div>';

    if($('bpSoTotalV1030')){
      $('bpSoTotalV1030').textContent=`LKR ${money(orderTotalV1030())}`;
    }
  }

  /* -------------------------------------------------------
     v1.0.32 — Sales Order PO / order-file attachment
     Private Supabase Storage bucket: sales-order-po-files
     ------------------------------------------------------- */
  function soPOBrowserKeyV1032(){
    const key=(localStorage.getItem('spgs_supabase_browser_key_v1')||'').trim();
    if(!key){
      throw new Error('Supabase browser key is not configured on this device.');
    }
    return key;
  }

  function soPOHeadersV1032(extra={}){
    const key=soPOBrowserKeyV1032();
    const headers={apikey:key,...extra};

    if(key.startsWith('eyJ')){
      headers.Authorization=`Bearer ${key}`;
    }

    return headers;
  }

  function soPOSafePartV1032(value='file'){
    return String(value||'file')
      .replace(/[^\w.-]+/g,'_')
      .replace(/^_+|_+$/g,'')
      ||'file';
  }

  function soPOExtV1032(file){
    return String(file?.name||'')
      .split('.')
      .pop()
      .toLowerCase();
  }

  function validateSOPOFileV1032(file){
    if(!file)return;

    if(file.size>SO_PO_MAX_BYTES_V1032){
      throw new Error('PO / order file must be 10 MB or smaller.');
    }

    const allowed=[
      'pdf','jpg','jpeg','png','webp',
      'doc','docx','xls','xlsx'
    ];

    const ext=soPOExtV1032(file);

    if(!allowed.includes(ext)){
      throw new Error('PO / order file must be PDF, JPG, PNG, WEBP, DOC, DOCX, XLS or XLSX.');
    }
  }

  function soPOEncodedPathV1032(path=''){
    return String(path)
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
  }

  function soPOStoragePathV1032(soId,file){
    const ext=soPOExtV1032(file)||'bin';
    const name=soPOSafePartV1032(
      String(file?.name||`customer_po.${ext}`)
        .replace(/\.[^.]+$/,'')
    );

    const nonce=(crypto?.randomUUID?.()||uid('pofile'))
      .replace(/[^a-zA-Z0-9_-]/g,'');

    return `sales-orders/${soPOSafePartV1032(soId)}/${Date.now()}_${nonce}_${name}.${ext}`;
  }

  async function uploadSOPOFileV1032(soId,file){
    validateSOPOFileV1032(file);

    const path=soPOStoragePathV1032(soId,file);
    const url=
      `${SO_PO_PROJECT_URL_V1032}/storage/v1/object/`+
      `${SO_PO_BUCKET_V1032}/`+
      `${soPOEncodedPathV1032(path)}`;

    const response=await fetch(url,{
      method:'POST',
      headers:soPOHeadersV1032({
        'Content-Type':file.type||'application/octet-stream',
        'cache-control':'max-age=3600',
        'x-upsert':'false'
      }),
      body:file
    });

    if(!response.ok){
      let detail='';
      try{detail=await response.text()}catch(_){}

      throw new Error(
        `PO file upload failed (${response.status})`+
        `${detail?`: ${detail}`:''}. `+
        `Run sales_order_po_files_policy.sql once in Supabase if this bucket has not been created.`
      );
    }

    return {
      storage:'supabase',
      bucket:SO_PO_BUCKET_V1032,
      path,
      fileName:file.name||'Customer PO',
      mime:file.type||'',
      bytes:Number(file.size||0),
      uploadedAt:new Date().toISOString(),
      uploadedBy:currentUser?.display||currentUser?.username||''
    };
  }

  async function fetchSOPOBlobV1032(asset){
    if(!asset?.path){
      throw new Error('PO attachment path is missing.');
    }

    const url=
      `${SO_PO_PROJECT_URL_V1032}/storage/v1/object/`+
      `${asset.bucket||SO_PO_BUCKET_V1032}/`+
      `${soPOEncodedPathV1032(asset.path)}`;

    const response=await fetch(url,{
      headers:soPOHeadersV1032()
    });

    if(!response.ok){
      let detail='';
      try{detail=await response.text()}catch(_){}

      throw new Error(
        `Could not open PO attachment (${response.status})`+
        `${detail?`: ${detail}`:''}`
      );
    }

    return response.blob();
  }

  function renderPendingSOPOV1032(){
    const status=$('bpSoPOFileStatusV1032');
    const actions=$('bpSoPOFileActionsV1032');

    if(!status||!actions)return;

    if(!soPOFilePendingV1032){
      status.textContent='No file attached.';
      status.className='bp-so-po-file-status-v1032';
      actions.style.display='none';
      return;
    }

    status.textContent=
      `${soPOFilePendingV1032.name} • `+
      `${Math.max(1,Math.round(soPOFilePendingV1032.size/1024))} KB • Ready to upload with Sales Order`;

    status.className='bp-so-po-file-status-v1032 ready';
    actions.style.display='flex';
  }

  window.bpSoPOFileChangedV1032=function(input){
    const file=input?.files?.[0]||null;

    if(!file){
      soPOFilePendingV1032=null;
      renderPendingSOPOV1032();
      return;
    }

    try{
      validateSOPOFileV1032(file);
      soPOFilePendingV1032=file;
      renderPendingSOPOV1032();
    }catch(err){
      input.value='';
      soPOFilePendingV1032=null;
      renderPendingSOPOV1032();
      toast(err?.message||'Invalid PO file');
    }
  };

  window.bpSoViewPendingPOV1032=function(){
    const file=soPOFilePendingV1032;
    if(!file)return toast('No PO file selected');

    const url=URL.createObjectURL(file);
    const ext=soPOExtV1032(file);

    if(['pdf','jpg','jpeg','png','webp'].includes(ext)){
      window.open(url,'_blank','noopener');
      setTimeout(()=>URL.revokeObjectURL(url),10*60*1000);
    }else{
      const a=document.createElement('a');
      a.href=url;
      a.download=file.name||'customer_po_file';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
    }
  };

  window.bpSoRemovePendingPOV1032=function(){
    soPOFilePendingV1032=null;

    if($('bpSoPOFileV1032')){
      $('bpSoPOFileV1032').value='';
    }

    renderPendingSOPOV1032();
  };

  window.bpSoViewPOAttachmentV1032=async function(soId){
    const so=(state.salesOrders||[]).find(x=>x.id===soId);
    if(!so)return;

    if(currentUser?.role!=='admin' && so.ownerUser!==currentUser?.username){
      return toast('This PO attachment is not available to this user');
    }

    const asset=so.poAttachment;
    if(!asset)return toast('No PO attachment saved for this Sales Order');

    const popup=window.open('about:blank','_blank');

    try{
      const blob=await fetchSOPOBlobV1032(asset);
      const url=URL.createObjectURL(blob);
      const ext=String(asset.fileName||'').split('.').pop().toLowerCase();

      if(['pdf','jpg','jpeg','png','webp'].includes(ext)){
        if(popup){
          popup.location=url;
        }else{
          window.open(url,'_blank','noopener');
        }

        setTimeout(()=>URL.revokeObjectURL(url),10*60*1000);
      }else{
        if(popup)popup.close();

        const a=document.createElement('a');
        a.href=url;
        a.download=asset.fileName||'customer_po_file';
        a.click();

        setTimeout(()=>URL.revokeObjectURL(url),5000);
      }
    }catch(err){
      if(popup)popup.close();
      console.error(err);
      toast(err?.message||'Could not open PO attachment');
    }
  };

  /* -------------------------------------------------------
     Multiple delivery customers + item allocation
     ------------------------------------------------------- */
  window.bpSoAddDeliveryV1030=function(){
    const c=selectedSOCustomerV1030();
    if(!c)return toast('Select an eligible customer first');

    ensureDeliveryBaseV1030();
    soDeliveries.push(newDeliveryV1030(null,false));
    rebalanceAllocationsV1030();
    renderSODeliveriesV1030();

    setTimeout(()=>{
      const list=$('bpSoDeliveriesV1030');
      list?.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
    },20);
  };

  window.bpSoRemoveDeliveryV1030=function(index){
    index=Number(index);
    if(index<=0 || index>=soDeliveries.length)return;

    soDeliveries.splice(index,1);
    rebalanceAllocationsV1030();
    renderSODeliveriesV1030();
  };

  window.bpSoUpdateDeliveryV1030=function(index,field,value){
    const d=soDeliveries[Number(index)];
    if(!d)return;
    if(!['name','line1','line2','contact1','contact2'].includes(field))return;
    d[field]=String(value??'');
  };

  window.bpSoSetAllocationV1030=function(index,encodedKey,value){
    index=Number(index);
    if(index<=0 || index>=soDeliveries.length)return;

    const key=decodeURIComponent(encodedKey);
    const line=lineByKeyV1030(key);
    if(!line)return;

    let desired=Math.max(0,Number(value||0));

    const usedByOtherExtras=soDeliveries
      .slice(1)
      .filter((_,i)=>i+1!==index)
      .reduce((s,d)=>s+Number(d.allocations?.[key]||0),0);

    const max=Math.max(0,Number(line.qty||0)-usedByOtherExtras);
    desired=Math.min(desired,max);

    soDeliveries[index].allocations[key]=desired;

    rebalanceAllocationsV1030();
    renderSODeliveriesV1030();
  };

  function renderSODeliveriesV1030(){
    const box=$('bpSoDeliveriesV1030');
    if(!box)return;

    const c=selectedSOCustomerV1030();

    if(!c){
      box.innerHTML='<div class="empty">Select an eligible ordering customer.</div>';
      return;
    }

    ensureDeliveryBaseV1030();
    rebalanceAllocationsV1030();

    box.innerHTML=
      soDeliveries.map((d,di)=>{
        const total=
          deliveryAllocatedV1030(d);

        const isPrimary=
          di===0;

        return `
          <div class="bp-so-delivery-card-v1030">

            <div class="bp-so-delivery-title-v1030">
              <div>
                <b>
                  Delivery Customer ${di+1}
                  ${isPrimary?' • Ordering Customer / Balance':''}
                </b>

                <span>
                  ${
                    isPrimary
                      ? 'Prefilled from Customer Master. Any selected-item quantity not allocated to another delivery customer remains with this customer automatically.'
                      : 'This is a separate customer. Enter that customer’s company / receiver details and allocate selected-item quantities below.'
                  }
                </span>
              </div>

              ${
                di>0
                  ? `
                    <button
                      class="btn red sm"
                      type="button"
                      onclick="bpSoRemoveDeliveryV1030(${di})"
                    >
                      Remove Customer
                    </button>
                  `
                  : ''
              }
            </div>

            <div class="bp-delivery-grid">
              <div class="field full">
                <label>
                  Delivery Customer / Company Name
                  <span class="required-dot">*</span>
                </label>

                <input
                  value="${esc(d.name||'')}"
                  oninput="bpSoUpdateDeliveryV1030(${di},'name',this.value)"
                >
              </div>

              <div class="field">
                <label>
                  Address Line 1
                  <span class="required-dot">*</span>
                </label>

                <input
                  value="${esc(d.line1||'')}"
                  oninput="bpSoUpdateDeliveryV1030(${di},'line1',this.value)"
                >
              </div>

              <div class="field">
                <label>
                  Address Line 2
                  <span class="required-dot">*</span>
                </label>

                <input
                  value="${esc(d.line2||'')}"
                  oninput="bpSoUpdateDeliveryV1030(${di},'line2',this.value)"
                >
              </div>

              <div class="field">
                <label>
                  Customer Contact Number
                  <span class="required-dot">*</span>
                </label>

                <input
                  type="tel"
                  value="${esc(d.contact1||'')}"
                  oninput="bpSoUpdateDeliveryV1030(${di},'contact1',this.value)"
                >
              </div>

              <div class="field">
                <label>
                  Second Contact Number
                  <span class="hint">(Optional)</span>
                </label>

                <input
                  type="tel"
                  value="${esc(d.contact2||'')}"
                  oninput="bpSoUpdateDeliveryV1030(${di},'contact2',this.value)"
                >
              </div>
            </div>

            <div class="bp-so-allocation-head-v1030">
              <b>
                Items for Delivery Customer ${di+1}
              </b>

              <span>
                Total allocated quantity: ${money(total)}
              </span>
            </div>

            <div class="bp-so-allocation-list-v1030">
              ${
                soCart.length
                  ? soCart.map(line=>{
                      const qty=
                        Number(
                          d.allocations?.[
                            line.cartKey
                          ]||0
                        );

                      const encoded=
                        encodeURIComponent(
                          line.cartKey
                        );

                      const otherExtra=
                        soDeliveries
                          .slice(1)
                          .filter(
                            (_,i)=>i+1!==di
                          )
                          .reduce(
                            (s,x)=>
                              s+
                              Number(
                                x.allocations?.[
                                  line.cartKey
                                ]||0
                              ),
                            0
                          );

                      const max=
                        Math.max(
                          0,
                          Number(line.qty||0)-
                          otherExtra
                        );

                      return `
                        <div class="bp-so-allocation-row-v1030">
                          <div>
                            <b>
                              ${
                                esc(
                                  [
                                    line.desc,
                                    line.size,
                                    line.material
                                  ]
                                  .filter(Boolean)
                                  .join(' • ')
                                )
                              }
                            </b>

                            <span>
                              Ordered
                              ${money(line.qty)}
                              ${esc(line.unit)}
                              ${
                                isPrimary
                                  ? ' • receives remaining balance automatically'
                                  : ''
                              }
                            </span>
                          </div>

                          <div class="field">
                            <label>
                              Qty for Customer ${di+1}
                            </label>

                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              ${isPrimary?'readonly':''}
                              ${!isPrimary?`max="${max}"`:''}
                              value="${qty}"
                              ${
                                !isPrimary
                                  ? `onchange="bpSoSetAllocationV1030(${di},'${encoded}',this.value)"`
                                  : ''
                              }
                            >
                          </div>
                        </div>
                      `;
                    }).join('')
                  : `
                      <div class="empty">
                        Add Sales Order items first.
                      </div>
                    `
              }
            </div>
          </div>
        `;
      }).join('');
  }

  /* -------------------------------------------------------
     Sales Order submit → existing state.salesOrders +
     existing Order Fulfilment architecture.
     ------------------------------------------------------- */
  function nextSONoV1030(){
    const prefix=`SC/SO/${today().replaceAll('-','')}/`;
    const used=new Set((state.salesOrders||[]).map(x=>x.soNo));
    let n=Math.max(1,(state.salesOrders||[]).length+1);

    while(used.has(prefix+String(n).padStart(3,'0')))n++;

    return prefix+String(n).padStart(3,'0');
  }

  function nextOFNoV1030(){
    const prefix=`SC/OF/${today().slice(0,4)}/`;
    const used=new Set((state.dealerFulfilments||[]).map(x=>x.planNo));
    let n=Math.max(1,(state.dealerFulfilments||[]).length+1);

    while(used.has(prefix+String(n).padStart(4,'0')))n++;

    return prefix+String(n).padStart(4,'0');
  }

  function validateSOAllocationsV1030(){
    if(!soCart.length)return 'Add at least one repeat-order item.';

    for(const line of soCart){
      const allocated=soDeliveries.reduce(
        (s,d)=>s+Number(d.allocations?.[line.cartKey]||0),
        0
      );

      if(Math.abs(allocated-Number(line.qty||0))>0.001){
        return `${[line.desc,line.size].filter(Boolean).join(' ')} is not fully allocated. Ordered ${money(line.qty)}, allocated ${money(allocated)}.`;
      }
    }

    for(let i=0;i<soDeliveries.length;i++){
      const d=soDeliveries[i];
      const total=deliveryAllocatedV1030(d);
      if(!(total>0))continue;

      if(!String(d.name||'').trim())return `Delivery Customer ${i+1}: Customer / Company Name is required.`;
      if(!String(d.line1||'').trim())return `Delivery Customer ${i+1}: Address Line 1 is required.`;
      if(!String(d.line2||'').trim())return `Delivery Customer ${i+1}: Address Line 2 is required.`;
      if(!String(d.contact1||'').trim())return `Delivery Customer ${i+1}: Contact Number is required.`;
    }

    return '';
  }

  function createPortalFulfilmentV1030(so){
    const plan={
      id:uid('df'),
      planNo:nextOFNoV1030(),
      piId:'',
      piSerial:so.soNo,
      sourceType:'SO',
      sourceSOId:so.id,
      sourceSerial:so.soNo,
      dealerId:so.customerId,
      dealerName:so.customerName,
      dealerPhone:so.customerPhone,
      poRef:so.customerRef||'',
      poAttachment:so.poAttachment||null,
      method:so.method,
      instructions:so.note||'',
      ownerUser:so.ownerUser,
      ownerDisplay:so.ownerDisplay,
      lines:so.lines.map(l=>({
        desc:l.desc,
        size:l.size,
        material:l.material,
        layout:l.layout,
        pcs:l.pcs,
        qty:l.qty,
        unit:l.unit
      })),
      consignments:[],
      createdAt:new Date().toISOString(),
      createdBy:currentUser?.display||currentUser?.username||'',
      erpSONo:so.erpSONo||''
    };

    so.deliveries.forEach((d,di)=>{
      const allocations=(d.allocations||[])
        .map(a=>({
          lineIndex:Number(a.lineIndex),
          qty:Number(a.qty||0)
        }))
        .filter(a=>a.qty>0);

      if(!allocations.length)return;

      plan.consignments.push({
        id:uid('con'),
        consignmentNo:`${plan.planNo}/S${String(plan.consignments.length+1).padStart(2,'0')}`,
        recipient:d.name,
        phone:d.contact1,
        phone2:d.contact2||'',
        address:[d.line1,d.line2].filter(Boolean).join(', '),
        map:'',
        payer:'Customer',
        charge:0,
        blind:false,
        allocations,
        status:'Awaiting Instructions',
        courier:'',
        tracking:'',
        dispatchDate:'',
        expectedDate:'',
        deliveredDate:'',
        receiver:'',
        deliveredQty:0,
        note:so.note||'',
        proof:null,
        packageImages:[],
        history:[],
        updatedAt:new Date().toISOString(),
        updatedBy:currentUser?.display||currentUser?.username||''
      });
    });

    state.dealerFulfilments=state.dealerFulfilments||[];
    state.dealerFulfilments.unshift(plan);

    return plan;
  }

  window.bpSoSubmitV1030=async function(){
    const customer=selectedSOCustomerV1030();
    if(!customer)return toast('Select an eligible customer');

    rebalanceAllocationsV1030();

    const error=validateSOAllocationsV1030();
    const warn=$('bpSoValidationV1030');

    if(error){
      if(warn){
        warn.innerHTML=`<div class="bp-so-validation-error-v1030">${esc(error)}</div>`;
      }
      return toast(error);
    }

    if(warn)warn.innerHTML='';

    const validPIIds=new Set(
      convertedPISourcesV1030()
        .filter(pi=>pi.customerId===customer.id)
        .map(pi=>pi.id)
    );

    if(soCart.some(l=>!validPIIds.has(l.sourcePIId))){
      return toast('An approved PI source is no longer available. Refresh the Sales Order and try again.');
    }

    const submitBtn=$('bpSoSubmitBtnV1032');
    const submitText=submitBtn?.textContent||'Submit Sales Order';

    if(submitBtn){
      submitBtn.disabled=true;
      submitBtn.textContent=soPOFilePendingV1032
        ? 'Uploading PO & Saving...'
        : 'Saving Sales Order...';
    }

    try{
      const sourcePIIds=[
        ...new Set(
          soCart.map(l=>l.sourcePIId)
        )
      ];

      const sourcePISerials=[
        ...new Set(
          soCart
            .map(l=>l.sourcePISerial)
            .filter(Boolean)
        )
      ];

      const activeDeliveries=
        soDeliveries
          .map((d,di)=>{
            const allocations=
              soCart
                .map((line,lineIndex)=>({
                  lineKey:line.cartKey,
                  lineIndex,
                  qty:Number(
                    d.allocations?.[
                      line.cartKey
                    ]||0
                  )
                }))
                .filter(a=>a.qty>0);

            return {
              id:d.id,
              sequence:di+1,
              primary:di===0,
              name:String(d.name||'').trim(),
              line1:String(d.line1||'').trim(),
              line2:String(d.line2||'').trim(),
              contact1:String(d.contact1||'').trim(),
              contact2:String(d.contact2||'').trim(),
              allocations
            };
          })
          .filter(d=>d.allocations.length);

      const first=activeDeliveries[0];
      const now=new Date().toISOString();
      const soId=uid('so');

      let poAttachment=null;

      if(soPOFilePendingV1032){
        if($('bpSoPOFileStatusV1032')){
          $('bpSoPOFileStatusV1032').textContent=
            'Uploading PO / order file to Supabase...';
          $('bpSoPOFileStatusV1032').className=
            'bp-so-po-file-status-v1032 uploading';
        }

        poAttachment=
          await uploadSOPOFileV1032(
            soId,
            soPOFilePendingV1032
          );
      }

      const so={
        id:soId,
        soNo:nextSONoV1030(),
        date:$('bpSoDateV1030')?.value||today(),
        needDate:$('bpSoNeedDateV1030')?.value||'',
        customerRef:$('bpSoRefV1030')?.value.trim()||'',
        poAttachment,

        customerId:customer.id,
        customerName:customer.name,
        customerPhone:customer.phone||'',

        sourcePIId:sourcePIIds[0]||'',
        sourcePISerial:
          sourcePISerials.length===1
            ? sourcePISerials[0]
            : `${sourcePISerials.length} Approved PIs`,
        sourcePIIds,
        sourcePISerials,

        method:
          activeDeliveries.length>1
            ? MIXED
            : DIRECT,

        shipTo:{
          name:first?.name||customer.name,
          phone:first?.contact1||customer.phone||'',
          phone2:first?.contact2||'',
          address:
            [first?.line1,first?.line2]
              .filter(Boolean)
              .join(', '),
          map:''
        },

        deliveries:activeDeliveries,

        note:
          $('bpSoNoteV1030')
            ?.value
            .trim()
          ||'',

        lines:
          soCart.map(l=>({
            kind:l.kind||'label',
            itemId:l.itemId||'',
            desc:l.desc||'ELP',
            size:l.size||'',
            material:l.material||'',
            layout:l.layout||'',
            pcs:l.pcs||'',
            unit:l.unit||'Rolls',
            qty:Number(l.qty||0),
            price:Number(l.price||0),
            priceTier:l.priceTier||'Approved PI Price',
            use:true,
            sourcePIId:l.sourcePIId,
            sourcePISerial:l.sourcePISerial,
            sourceQuoteId:l.sourceQuoteId||'',
            sourceQuoteSerial:l.sourceQuoteSerial||''
          })),

        total:orderTotalV1030(),

        ownerUser:
          currentUser?.username||'',

        ownerDisplay:
          currentUser?.display||
          currentUser?.username||
          '',

        portalSource:'Approved Prices',
        portalSalesOrder:true,

        erpStatus:'Pending ERP Sync',
        erpSONo:'',
        erpMessage:'',

        createdAt:now,
        updatedAt:now,

        history:[
          {
            action:'Created from Approved Prices Portal',
            by:
              currentUser?.display||
              currentUser?.username||
              '',
            username:
              currentUser?.username||
              '',
            at:now
          }
        ]
      };

      state.salesOrders=
        state.salesOrders||[];

      state.salesOrders.unshift(so);

      const plan=
        createPortalFulfilmentV1030(so);

      so.fulfilmentPlanId=plan.id;

      audit(
        'CREATE_PORTAL_SALES_ORDER',
        `${so.soNo} • ${so.customerName} • ${so.lines.length} item(s) • ${activeDeliveries.length} delivery customer(s)`
      );

      if(poAttachment){
        audit(
          'SALES_ORDER_PO_ATTACHMENT',
          `${so.soNo} • ${poAttachment.fileName}`
        );
      }

      saveState();

      soCart=[];
      soDeliveries=[];
      soPage=1;
      soItemPageV1032=1;
      soPOFilePendingV1032=null;

      [
        'bpSoNeedDateV1030',
        'bpSoRefV1030',
        'bpSoNoteV1030'
      ].forEach(id=>{
        if($(id))$(id).value='';
      });

      if($('bpSoPOFileV1032')){
        $('bpSoPOFileV1032').value='';
      }

      renderPendingSOPOV1032();

      if($('bpSoDateV1030')){
        $('bpSoDateV1030').value=today();
      }

      ensureDeliveryBaseV1030();
      bpSoRefreshV1030();

      try{
        renderSalesOrders91?.();
      }catch(_){}

      try{
        renderDealerFulfilment?.();
      }catch(_){}

      toast(
        `${so.soNo} submitted and linked to Order Fulfilment`
      );

    }catch(err){
      console.error(
        'Portal Sales Order submit failed',
        err
      );

      if($('bpSoPOFileStatusV1032')&&soPOFilePendingV1032){
        $('bpSoPOFileStatusV1032').textContent=
          `Upload failed: ${err?.message||'Unknown error'}`;
        $('bpSoPOFileStatusV1032').className=
          'bp-so-po-file-status-v1032 error';
      }

      toast(
        err?.message||
        'Sales Order could not be submitted'
      );

    }finally{
      if(submitBtn){
        submitBtn.disabled=false;
        submitBtn.textContent=submitText;
      }
    }
  };

  window.bpSoClearV1030=function(){
    if((soCart.length||soPOFilePendingV1032) && !confirm('Clear the current Sales Order items, PO attachment and delivery allocations?'))return;

    soCart=[];
    soDeliveries=[];
    soItemPageV1032=1;
    soPOFilePendingV1032=null;

    ['bpSoNeedDateV1030','bpSoRefV1030','bpSoNoteV1030'].forEach(id=>{
      if($(id))$(id).value='';
    });

    if($('bpSoPOFileV1032')){
      $('bpSoPOFileV1032').value='';
    }

    renderPendingSOPOV1032();
    ensureDeliveryBaseV1030();
    bpSoRefreshV1030();
  };

  /* -------------------------------------------------------
     My Sales Orders pagination + view
     ------------------------------------------------------- */
  function mySalesOrdersV1030(){
    const username=currentUser?.username||'';

    return (state.salesOrders||[])
      .filter(x=>
        currentUser?.role==='admin'
          ? true
          : x.ownerUser===username
      )
      .sort((a,b)=>
        Date.parse(b.updatedAt||b.createdAt||b.date||0) -
        Date.parse(a.updatedAt||a.createdAt||a.date||0)
      );
  }

  function portalSOStatusInfoV1032(so){
    const p=
      (state.dealerFulfilments||[])
        .find(x=>
          x.id===so.fulfilmentPlanId ||
          x.sourceSOId===so.id
        );

    const consignments=p?.consignments||[];
    const statuses=
      consignments
        .map(c=>String(c.status||''))
        .filter(Boolean);

    let label='Order Received';
    let cls='received';

    if(statuses.length && statuses.every(x=>x==='Delivered')){
      label='Delivered';
      cls='delivered';

    }else if(statuses.some(x=>['Delivery Failed','Returned','Cancelled'].includes(x))){
      label='Delivery Issue';
      cls='issue';

    }else if(statuses.some(x=>x==='In Transit')){
      label='In Transit';
      cls='transit';

    }else if(statuses.some(x=>x==='Handed to Courier')){
      label='Handed to Courier';
      cls='transit';

    }else if(statuses.some(x=>x==='Ready for Dispatch')){
      label='Ready for Dispatch';
      cls='ready';

    }else if(statuses.some(x=>x==='Awaiting Instructions')){
      label='Awaiting Instructions';
      cls='awaiting';

    }else if(p && !statuses.length){
      label='Awaiting Fulfilment';
      cls='awaiting';

    }else if(so.erpStatus==='Sync Error'){
      label='ERP Sync Issue';
      cls='issue';
    }

    const updateCandidates=[
      so._spgsUpdatedAt,
      so.updatedAt,
      p?._spgsUpdatedAt,
      p?.updatedAt,
      ...consignments.map(c=>c.updatedAt)
    ]
      .filter(Boolean)
      .map(x=>Date.parse(x)||0);

    const lastUpdated=
      updateCandidates.length
        ? Math.max(...updateCandidates)
        : 0;

    return {
      label,
      cls,
      plan:p||null,
      consignments,
      lastUpdated
    };
  }

  function portalSOStatusV1030(so){
    return portalSOStatusInfoV1032(so).label;
  }

  function portalSOTrackingSummaryV1032(so){
    const info=portalSOStatusInfoV1032(so);

    return info.consignments
      .filter(c=>c.courier||c.tracking)
      .slice(0,2)
      .map(c=>
        `${c.courier||'Courier'}${c.tracking?` • ${c.tracking}`:''}`
      );
  }

  window.bpSoSetPageV1030=function(page){
    const all=mySalesOrdersV1030();
    const pages=Math.max(1,Math.ceil(all.length/SO_PAGE_SIZE));
    soPage=Math.max(1,Math.min(pages,Number(page)||1));
    renderMySalesOrdersV1030();
  };

  function renderMySalesOrdersV1030(){
    const box=$('bpSoMyOrdersV1030');
    if(!box)return;

    const all=mySalesOrdersV1030();
    const pages=Math.max(
      1,
      Math.ceil(all.length/SO_PAGE_SIZE)
    );

    if(soPage>pages)soPage=pages;
    if(soPage<1)soPage=1;

    const start=
      (soPage-1)*SO_PAGE_SIZE;

    const rows=
      all.slice(
        start,
        start+SO_PAGE_SIZE
      );

    box.innerHTML=rows.length
      ? `
        <div class="bp-so-history-list-v1030">
          ${rows.map(so=>{
            const status=
              portalSOStatusInfoV1032(so);

            const tracking=
              portalSOTrackingSummaryV1032(so);

            const updated=
              status.lastUpdated
                ? new Date(status.lastUpdated).toLocaleString('en-GB')
                : '';

            return `
              <div class="bp-so-history-card-v1032">

                <div class="bp-so-status-banner-v1032 ${status.cls}">
                  <div>
                    <span>ORDER STATUS</span>
                    <b>${esc(status.label)}</b>
                  </div>

                  <small>
                    ${updated?`Updated ${esc(updated)}`:'Live fulfilment status'}
                  </small>
                </div>

                <div class="portal-item bp-so-history-row-v1030">
                  <div>
                    <b>${esc(so.soNo||'Sales Order')}</b>

                    <div class="small">
                      ${esc(so.date||'')}
                      • ${esc(so.customerName||'')}
                      • ${Number(so.lines?.length||0)} item${Number(so.lines?.length||0)===1?'':'s'}
                    </div>

                    <div class="small">
                      <b>LKR ${money(so.total||0)}</b>
                      ${so.erpSONo?` • ERP ${esc(so.erpSONo)}`:''}
                      ${so.customerRef?` • PO/Ref ${esc(so.customerRef)}`:''}
                    </div>

                    ${
                      tracking.length
                        ? `
                          <div class="bp-so-live-tracking-v1032">
                            ${tracking.map(x=>`<span>${esc(x)}</span>`).join('')}
                          </div>
                        `
                        : ''
                    }

                    ${
                      so.poAttachment
                        ? `
                          <div class="bp-so-po-saved-v1032">
                            📎 ${esc(so.poAttachment.fileName||'PO attachment')}
                          </div>
                        `
                        : ''
                    }
                  </div>

                  <div class="bp-so-history-actions-v1032">
                    ${
                      so.poAttachment
                        ? `<button class="btn ghost sm" type="button" onclick="bpSoViewPOAttachmentV1032('${so.id}')">PO File</button>`
                        : ''
                    }

                    <button class="btn ghost sm" type="button" onclick="bpSoViewOrderV1030('${so.id}')">View</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="bp-so-pager-v1030">
          <span>
            Showing
            ${start+1}-${Math.min(start+rows.length,all.length)}
            of ${all.length}
          </span>

          <div>
            <button
              class="btn ghost sm"
              type="button"
              onclick="bpSoSetPageV1030(${soPage-1})"
              ${soPage<=1?'disabled':''}
            >
              ← Previous
            </button>

            <span>
              Page <b>${soPage}</b> / ${pages}
            </span>

            <button
              class="btn ghost sm"
              type="button"
              onclick="bpSoSetPageV1030(${soPage+1})"
              ${soPage>=pages?'disabled':''}
            >
              Next →
            </button>
          </div>
        </div>
      `
      : '<div class="empty">No Sales Orders submitted yet.</div>';
  }

  window.bpSoViewOrderV1030=function(id){
    const so=
      (state.salesOrders||[])
        .find(x=>x.id===id);

    if(!so)return;

    if(
      currentUser?.role!=='admin' &&
      so.ownerUser!==currentUser?.username
    ){
      return toast(
        'This Sales Order is not available to this user'
      );
    }

    const status=
      portalSOStatusInfoV1032(so);

    const p=status.plan;
    const consignments=
      p?.consignments||[];

    const deliveries=
      so.deliveries||[];

    $('bpSoViewTitleV1030').textContent=
      so.soNo||'Sales Order';

    $('bpSoViewMetaV1030').textContent=
      `${so.date||''} • ${so.customerName||''} • ${status.label}`;

    const modal=$('bpSoViewModalV1030');
    if(modal){
      modal.dataset.soIdV1032=so.id;
    }

    const deliveryRows=
      Math.max(
        deliveries.length,
        consignments.length
      );

    const liveDeliveries=
      Array.from(
        {length:deliveryRows},
        (_,i)=>{
          const d=deliveries[i]||{};
          const c=consignments[i]||null;

          return {
            sequence:
              d.sequence||
              i+1,

            name:
              c?.recipient||
              d.name||
              '',

            address:
              c?.address||
              [d.line1,d.line2]
                .filter(Boolean)
                .join(', '),

            contact1:
              c?.phone||
              d.contact1||
              '',

            contact2:
              c?.phone2||
              d.contact2||
              '',

            allocations:
              (c?.allocations?.length
                ? c.allocations
                : d.allocations
              )||[],

            consignment:c
          };
        }
      );

    $('bpSoViewBodyV1030').innerHTML=`

      <div class="bp-so-status-banner-v1032 ${status.cls} bp-so-status-large-v1032">
        <div>
          <span>LIVE ORDER STATUS</span>
          <b>${esc(status.label)}</b>
        </div>

        <small>
          ${
            status.lastUpdated
              ? `Updated ${esc(new Date(status.lastUpdated).toLocaleString('en-GB'))}`
              : 'Waiting for fulfilment update'
          }
        </small>
      </div>

      <div class="bp-so-view-summary-v1032">

        <div>
          <span>Customer PO / Reference</span>
          <b>${esc(so.customerRef||'-')}</b>
        </div>

        <div>
          <span>ERP Status</span>
          <b>${esc(so.erpStatus||'-')}</b>
          ${so.erpSONo?`<small>ERP SO: ${esc(so.erpSONo)}</small>`:''}
        </div>

        <div>
          <span>PO / Order File</span>
          ${
            so.poAttachment
              ? `
                <b>${esc(so.poAttachment.fileName||'Attached file')}</b>
                <button class="btn ghost sm" type="button" onclick="bpSoViewPOAttachmentV1032('${so.id}')">
                  Open / Download
                </button>
              `
              : '<b>Not attached</b>'
          }
        </div>

      </div>

      <div class="section">Items</div>

      <div style="overflow:auto">
        <table class="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Source PI</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Amount</th>
            </tr>
          </thead>

          <tbody>
            ${(so.lines||[]).map(l=>`
              <tr>
                <td>
                  <b>
                    ${esc(
                      [
                        l.desc,
                        l.size,
                        l.material,
                        l.layout,
                        l.pcs?l.pcs+' pcs':''
                      ]
                      .filter(Boolean)
                      .join(' • ')
                    )}
                  </b>
                </td>

                <td>
                  ${esc(l.sourcePISerial||so.sourcePISerial||'-')}
                </td>

                <td>
                  ${money(l.qty)}
                  ${esc(l.unit||'')}
                </td>

                <td>
                  LKR ${money(l.price)}
                </td>

                <td>
                  <b>
                    LKR
                    ${money(
                      Number(l.qty||0)*
                      Number(l.price||0)
                    )}
                  </b>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="sumline">
        <span>Sales Order Total</span>
        <strong>LKR ${money(so.total||0)}</strong>
      </div>

      <div class="section">
        Delivery Customers — Live Courier / Tracking
      </div>

      <div class="bp-so-view-deliveries-v1030">

        ${
          liveDeliveries.map((d,i)=>{
            const c=d.consignment;

            const allocationHtml=
              (d.allocations||[])
                .map(a=>{
                  const l=
                    (so.lines||[])[
                      Number(a.lineIndex)
                    ];

                  return l
                    ? `
                      ${esc(
                        [l.desc,l.size]
                          .filter(Boolean)
                          .join(' ')
                      )}:
                      <b>
                        ${money(a.qty)}
                        ${esc(l.unit||'')}
                      </b>
                    `
                    : '';
                })
                .filter(Boolean)
                .join('<br>');

            const consignmentClass=
              !c
                ? 'awaiting'
                : c.status==='Delivered'
                  ? 'delivered'
                  : ['Delivery Failed','Returned','Cancelled'].includes(c.status)
                    ? 'issue'
                    : ['Handed to Courier','In Transit'].includes(c.status)
                      ? 'transit'
                      : c.status==='Ready for Dispatch'
                        ? 'ready'
                        : 'awaiting';

            return `
              <div class="bp-so-view-delivery-v1030 bp-so-live-delivery-v1032">

                <div class="bp-so-delivery-live-head-v1032">
                  <div>
                    <b>
                      Delivery Customer
                      ${d.sequence||i+1}
                      • ${esc(d.name||'')}
                    </b>

                    ${
                      c?.consignmentNo
                        ? `<span>${esc(c.consignmentNo)}</span>`
                        : ''
                    }
                  </div>

                  <span class="bp-so-mini-status-v1032 ${consignmentClass}">
                    ${esc(c?.status||'Awaiting Instructions')}
                  </span>
                </div>

                <div>
                  ${esc(d.address||'')}
                </div>

                <div class="small">
                  ${esc(d.contact1||'')}
                  ${
                    d.contact2
                      ? ` • ${esc(d.contact2)}`
                      : ''
                  }
                </div>

                <div class="bp-so-live-courier-grid-v1032">

                  <div>
                    <span>Courier / Driver</span>
                    <b>${esc(c?.courier||'-')}</b>
                  </div>

                  <div>
                    <span>Tracking / Reference</span>
                    <b>${esc(c?.tracking||'-')}</b>
                  </div>

                  <div>
                    <span>Dispatch Date</span>
                    <b>${esc(c?.dispatchDate||'-')}</b>
                  </div>

                  <div>
                    <span>Expected Delivery</span>
                    <b>${esc(c?.expectedDate||'-')}</b>
                  </div>

                  <div>
                    <span>Delivered Date</span>
                    <b>${esc(c?.deliveredDate||'-')}</b>
                  </div>

                  <div>
                    <span>Received By</span>
                    <b>${esc(c?.receiver||'-')}</b>
                  </div>

                </div>

                ${
                  c?.note
                    ? `
                      <div class="bp-so-live-note-v1032">
                        <b>Courier / Delivery Note:</b>
                        ${esc(c.note)}
                      </div>
                    `
                    : ''
                }

                <div class="small bp-so-live-allocation-v1032">
                  ${allocationHtml||'No item allocation saved.'}
                </div>

              </div>
            `;
          }).join('')
          ||
          '<div class="empty">No delivery allocation saved.</div>'
        }

      </div>
    `;

    modal?.classList.add('show');
  };

  function bpSoRefreshV1030(){
    ensurePortalSOUIV1030();
    renderSOCustomerOptionsV1030();
    bpSoRenderEligibleItemsV1030();
    renderSOCartV1030();
    renderSODeliveriesV1030();
    renderMySalesOrdersV1030();

    if($('bpSoDateV1030') && !$('bpSoDateV1030').value){
      $('bpSoDateV1030').value=today();
    }
  }

  window.bpSoRefreshV1030=bpSoRefreshV1030;

  window.bpSoRealtimeRefreshV1032=function(source=''){
    if(soRealtimeTimerV1032){
      clearTimeout(soRealtimeTimerV1032);
    }

    soRealtimeTimerV1032=setTimeout(()=>{
      soRealtimeTimerV1032=0;

      if(
        !$('branchportal')?.classList.contains('active') ||
        portalMode!=='sales'
      ){
        return;
      }

      renderMySalesOrdersV1030();

      const modal=$('bpSoViewModalV1030');
      const openId=modal?.dataset?.soIdV1032||'';

      if(
        openId &&
        modal?.classList.contains('show')
      ){
        const stillExists=
          (state.salesOrders||[])
            .some(x=>x.id===openId);

        if(stillExists){
          bpSoViewOrderV1030(openId);
        }else{
          closeModal('bpSoViewModalV1030');
        }
      }
    },60);
  };

  renderPendingSOPOV1032();

  /* -------------------------------------------------------
     Dropdown performance
     -------------------------------------------------------
     The application has many nested refresh wrappers. Large selects were
     repeatedly being rebuilt even when their option set had not changed.
     These wrappers cache the expensive high-frequency dropdowns while
     preserving synchronous behaviour required by the existing system.
     ------------------------------------------------------- */

  /* Customer + customer item dropdowns */
  if(typeof window.refreshCustomerPick==='function'){
    const baseRefreshCustomerPickV1030=window.refreshCustomerPick;
    let lastCustomerPickSigV1030='';

    window.refreshCustomerPick=function(force=false){
      const selected=$('customerSelect')?.value||'';
      const cSig=(state.customers||[])
        .map(c=>`${c.id}|${c.name||''}`)
        .join('~');
      const iSig=(state.items||[])
        .map(i=>`${i.id}|${i.size||''}|${i.material||''}|${i.layout||''}|${i.pcs||''}`)
        .join('~');
      const c=(state.customers||[]).find(x=>x.id===selected);
      const h=c?.priceHistory||[];
      const hLast=h[h.length-1];
      const sig=[
        state.current?.id||'',
        $('docType')?.value||'',
        $('quoteCategory')?.value||'',
        $('payMode')?.value||'',
        selected,
        cSig,
        iSig,
        h.length,
        hLast?.changedAt||hLast?.date||''
      ].join('¦');

      if(!force && sig===lastCustomerPickSigV1030)return;

      const r=baseRefreshCustomerPickV1030.apply(this,arguments);
      lastCustomerPickSigV1030=sig;
      return r;
    };

    try{refreshCustomerPick=window.refreshCustomerPick}catch(_){}
  }

  /* User → linked company/customer dropdown */
  if(typeof window.refreshUserCompanyLinkOptions==='function'){
    const baseCompanyOptionsV1030=window.refreshUserCompanyLinkOptions;
    let lastCompanySigV1030='';

    window.refreshUserCompanyLinkOptions=function(selected=''){
      const type=$('userCompanyLinkType')?.value||'customer';
      const records=type==='introducer'
        ? (state.introducers||[])
        : (state.customers||[]);

      const sig=type+'¦'+records
        .map(x=>`${x.id}|${x.name||''}|${x.phone||''}|${x.active!==false}`)
        .join('~');

      const select=$('userCompanyLinkId');

      if(sig===lastCompanySigV1030 && select){
        if(selected && [...select.options].some(o=>o.value===selected)){
          select.value=selected;
        }
        return;
      }

      lastCompanySigV1030=sig;
      return baseCompanyOptionsV1030.apply(this,arguments);
    };

    try{refreshUserCompanyLinkOptions=window.refreshUserCompanyLinkOptions}catch(_){}
  }

  /* Approved Prices customer-profile dropdown */
  if(typeof window.refreshBranchCustomerProfiles==='function'){
    const baseBranchProfilesV1030=window.refreshBranchCustomerProfiles;
    let lastBranchProfileSigV1030='';

    window.refreshBranchCustomerProfiles=function(force=false){
      const u=userRecordV1030();
      const sig=[
        currentUser?.username||'',
        u?.companyLinkType||'',
        u?.companyLinkId||'',
        u?.lastPortalCustomerKey||'',
        (state.customers||[])
          .map(c=>`${c.id}|${c.name||''}|${c.phone||''}|${c.ownerUser||''}|${c.introducerId||''}`)
          .join('~'),
        (state.introducers||[])
          .map(i=>`${i.id}|${i.name||''}|${i.active!==false}`)
          .join('~')
      ].join('¦');

      if(!force && sig===lastBranchProfileSigV1030)return;

      const r=baseBranchProfilesV1030.apply(this,arguments);
      lastBranchProfileSigV1030=sig;
      return r;
    };

    try{refreshBranchCustomerProfiles=window.refreshBranchCustomerProfiles}catch(_){}
  }

  /* Admin profit-document dropdown */
  if(typeof window.loadAdminPanel==='function'){
    window.loadAdminPanel=function(){
      const p=state.settings.pricing||DEFAULT_PRICING;
      const m=p.materialRates;

      $('admTT').value=m.TT;
      $('admDTTop').value=m['DT TOP'];
      $('admPVC').value=m.PVC;
      $('admDTEco').value=m['DT ECO'];
      $('admHighstick').value=m.HIGHSTICK;
      $('admCore').value=p.core;
      $('admStrap').value=p.strappingRoll;
      $('admStretch').value=p.stretchFilm;
      $('admService').value=p.service;
      $('admScaleService').value=p.scaleService;
      $('admVat').value=p.vat;
      $('admSsclShare').value=p.ssclShare;
      $('admSsclRate').value=p.ssclRate;
      $('admCommission').value=p.commission;

      const sel=$('profitDoc');
      const current=sel?.value||'';
      const docs=state.docs||[];
      const html=
        '<option value="">-- Select document --</option>'+
        docs.map(d=>
          `<option value="${d.id}">${esc(d.serial)} • ${esc(d.customer?.name||'')} • ${esc(d.date)}</option>`
        ).join('');
      const sig=docs.map(d=>`${d.id}|${d.serial}|${d.customer?.name||''}|${d.date||''}`).join('~');

      selectSetFastV1030(sel,html,current,sig);

      try{lastProfitDocId=''}catch(_){}
      if(typeof renderProfitReport==='function')renderProfitReport();
    };

    try{loadAdminPanel=window.loadAdminPanel}catch(_){}
  }

  /* Approved Prices calculator keeps its original closure-owned
     price-tier state. It is intentionally not replaced here. The main
     dropdown performance gains come from preventing repeated customer,
     company-link and Admin document option rebuilds. */

  /* -------------------------------------------------------
     Integrate with existing view/refresh chain.
     ------------------------------------------------------- */
  const showViewV1030=window.showView;
  if(typeof showViewV1030==='function'){
    window.showView=function(id){
      const r=showViewV1030.apply(this,arguments);

      if(id==='branchportal'){
        ensurePortalSOUIV1030();
        restorePortalModeV1030();
      }

      return r;
    };

    try{showView=window.showView}catch(_){}
  }

  const refreshAllV1030=window.refreshAll;
  if(typeof refreshAllV1030==='function'){
    window.refreshAll=function(){
      const r=refreshAllV1030.apply(this,arguments);

      if($('branchportal')?.classList.contains('active') && portalMode==='sales'){
        bpSoRefreshV1030();
      }

      return r;
    };

    try{refreshAll=window.refreshAll}catch(_){}
  }

  /* Dedicated cloud realtime updates may arrive while the portal is open. */
  const renderSOInternalV1030=window.renderSalesOrders91;
  if(typeof renderSOInternalV1030==='function'){
    window.renderSalesOrders91=function(){
      const r=renderSOInternalV1030.apply(this,arguments);

      if($('branchportal')?.classList.contains('active') && portalMode==='sales'){
        renderMySalesOrdersV1030();
      }

      return r;
    };

    try{renderSalesOrders91=window.renderSalesOrders91}catch(_){}
  }

  ensurePortalSOUIV1030();

  if($('branchportal')?.classList.contains('active')){
    restorePortalModeV1030();
  }

})();
