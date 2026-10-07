
/* =========================================================
   v1.0.23 — CUSTOMER ITEM MASTER DROPDOWN
   ---------------------------------------------------------
   - Customer items are selected from one compact dropdown.
   - The page no longer grows when a customer has many items.
   - The selected item keeps the existing New Document card.
   - Arrow expands only that item's full price-change history.
   - Current or historical price can still be used.
   - Label Price Calculator remains below the items table.
   ========================================================= */
(function(){
  'use strict';

  let scExpandedCustomerItemV1023='';

  function scCustomerV1023(id=''){
    return state.customers.find(c=>c.id===(id||$('customerSelect')?.value));
  }

  function scItemKeyV1023(item){
    if(!item)return '';
    try{return item.labelKey||labelKey(item)}catch(_){return item.labelKey||item.id||''}
  }

  function scHistoryForItemV1023(customer,item){
    if(!customer||!item)return [];
    const key=scItemKeyV1023(item);
    return (customer.priceHistory||[]).filter(h=>
      (h.itemId&&h.itemId===item.id) ||
      (h.key&&h.key===key)
    );
  }

  function scHistoryDateV1023(h){
    const raw=h?.changedAt||h?.date||'';
    if(!raw)return '-';
    try{
      if(String(raw).length<=10)return fmtDate(String(raw).slice(0,10));
      return new Date(raw).toLocaleString('en-GB',{
        day:'2-digit',
        month:'short',
        year:'numeric',
        hour:'2-digit',
        minute:'2-digit'
      });
    }catch(_){
      return String(raw);
    }
  }

  function scSourceLabelV1023(source){
    const map={
      'calculator':'Calculator',
      'calculator-add':'Calculator → Quotation',
      'calculator-customer':'Calculator → Customer Price',
      'calculator-master':'Calculator → Label Master',
      'manual-quick-price':'Manual Price',
      'manual-quotation-line':'Quotation Price Edit',
      'history-reuse':'Previous Price Reused',
      'legacy':'Saved Price'
    };
    return map[source]||source||'Saved Price';
  }

  function scItemLabelV1023(item){
    return [
      item?.size,
      item?.material,
      item?.layout,
      item?.pcs?item.pcs+' pcs':''
    ].filter(Boolean).join(' / ');
  }

  function scHistoryChangeV1023(list,index){
    const h=list[index];
    const older=list[index+1];
    if(!h)return '';

    const explicit=
      h.oldPrice!==null &&
      h.oldPrice!==undefined &&
      Number.isFinite(Number(h.oldPrice))
        ? Number(h.oldPrice)
        : null;

    const fallback=
      older && Number.isFinite(Number(older.price))
        ? Number(older.price)
        : null;

    const old=explicit!==null?explicit:fallback;

    return old===null
      ? `Saved at LKR ${money(h.price)}`
      : `LKR ${money(old)} → LKR ${money(h.price)}`;
  }

  function scSetPickerVisibilityV1023(){
    const wrap=$('customerItemPickerWrap');
    const host=$('customerItemMasterList');
    const actions=document.querySelector('.customer-item-action-row');
    const device=$('quoteCategory')?.value==='device';
    const pi=$('docType')?.value==='PI';
    const hidePicker=device||pi;

    if(wrap)wrap.style.display=hidePicker?'none':'';
    if(host)host.style.display=hidePicker?'none':'';

    if(actions){
      /* PI: no item additions. Device quotation: keep only Add Device. */
      actions.style.display=pi?'none':'grid';

      actions.querySelectorAll('.field').forEach(field=>{
        field.style.display=device?'none':'';
      });

      actions.querySelectorAll('button').forEach(btn=>{
        const text=String(btn.textContent||'');
        const isDeviceButton=/Add Device/i.test(text);
        btn.style.display=device?(isDeviceButton?'':'none'):'';
      });
    }

    return hidePicker;
  }

  function scRenderCustomerItemSelectedV1023(){
    const host=$('customerItemMasterList');
    if(!host)return;

    if(scSetPickerVisibilityV1023())return;

    const customer=scCustomerV1023();

    if(!customer){
      host.innerHTML=
        '<div class="customer-item-master-empty">Select a customer to load previous items and prices.</div>';
      return;
    }

    const pick=$('masterItemPick');
    const item=state.items.find(i=>i.id===pick?.value);

    if(!item){
      const hasOptions=(pick?.options?.length||0)>1 && !pick?.disabled;

      host.innerHTML=hasOptions
        ? '<div class="customer-item-master-empty"><b>Select an item from the Customer Item Master dropdown.</b><span>The selected item will appear here with its current price and expandable price history.</span></div>'
        : '<div class="customer-item-master-empty"><b>No previous label items for this customer.</b><span>Use the Label Price Calculator below the items table to create the first item.</span></div>';

      return;
    }

    const mode=$('payMode')?.value||customer.paymentMode||'credit';
    const list=scHistoryForItemV1023(customer,item);
    const current=currentPricingForItem(item,customer.id,mode);
    const latest=list[0];
    const expanded=scExpandedCustomerItemV1023===item.id;

    host.innerHTML=`<div class="customer-item-master-card selected" data-item-id="${esc(item.id)}">
      <div class="customer-item-master-row customer-item-master-row-selected">
        <button
          class="customer-item-expand ${expanded?'open':''}"
          type="button"
          onclick="toggleCustomerItemHistoryV1023('${item.id}')"
          aria-label="${expanded?'Collapse':'Expand'} price history"
          title="${expanded?'Hide':'Show'} price history"
        >›</button>

        <div class="customer-item-main customer-item-main-static">
          <span class="customer-item-name">${esc(scItemLabelV1023(item))}</span>
          <span class="customer-item-sub">${esc(item.desc||'ELP')}${latest?.tier?` • ${esc(latest.tier)}`:''}</span>
        </div>

        <div class="customer-item-current">
          <span>Current ${esc(String(mode).toUpperCase())}</span>
          <b>LKR ${money(current)}</b>
          <small>${list.length} change${list.length===1?'':'s'}</small>
        </div>

        <span class="tag customer-item-selected-tag">SELECTED</span>
      </div>

      <div class="customer-item-inline-history ${expanded?'show':''}">
        ${list.length
          ? list.map((h,index)=>`<div class="customer-item-history-entry">
              <div class="customer-item-history-copy">
                <b>${esc(scHistoryChangeV1023(list,index))}</b>
                <span>${esc((h.mode||'').toUpperCase())}${h.tier?` • ${esc(h.tier)}`:''} • ${esc(scSourceLabelV1023(h.source||'legacy'))}</span>
                <small>${esc(scHistoryDateV1023(h))} • ${esc(h.user||h.username||'Legacy')}${h.documentSerial?` • ${esc(h.documentSerial)}`:''}</small>
              </div>
              <div class="customer-item-history-use">
                <b>LKR ${money(h.price)}</b>
                <button
                  class="btn ghost sm"
                  type="button"
                  onclick="useCustomerItemHistoryV1023('${item.id}','${h.id}')"
                >Use</button>
              </div>
            </div>`).join('')
          : '<div class="customer-item-history-empty">No price changes recorded for this item.</div>'
        }
      </div>
    </div>`;
  }

  window.toggleCustomerItemHistoryV1023=function(itemId){
    scExpandedCustomerItemV1023=
      scExpandedCustomerItemV1023===itemId
        ? ''
        : itemId;

    scRenderCustomerItemSelectedV1023();
  };

  window.useCustomerItemHistoryV1023=function(itemId,historyId){
    const customer=scCustomerV1023();
    const item=state.items.find(i=>i.id===itemId);
    const h=(customer?.priceHistory||[]).find(x=>x.id===historyId);

    if(!customer||!item||!h)return;

    const pick=$('masterItemPick');
    const quick=$('quickPrice');

    if(pick)pick.value=item.id;

    if(quick){
      quick.value=Number(h.price||0).toFixed(2);
      quick.dataset.autoPrice='0';
      quick.dataset.historyId=h.id;
      quick.dataset.historyItemId=item.id;
    }

    const text=$('customerItemProfileText');
    if(text){
      text.textContent=
        `Previous price selected • ${scItemLabelV1023(item)} • `+
        `LKR ${money(h.price)} • ${scHistoryDateV1023(h)}`;
    }

    scRenderCustomerItemSelectedV1023();
  };

  /*
    Preserve history-reuse audit behaviour when adding a historical
    customer price into the quotation.
  */
  const scBaseAddMasterLineV1023=addMasterLine;

  addMasterLine=function(){
    const quick=$('quickPrice');
    const historyId=quick?.dataset.historyId||'';
    const historyItemId=quick?.dataset.historyItemId||'';

    if(!historyId){
      const result=scBaseAddMasterLineV1023.apply(this,arguments);
      scRenderCustomerItemSelectedV1023();
      return result;
    }

    const customer=scCustomerV1023();
    const item=
      state.items.find(i=>i.id===historyItemId) ||
      state.items.find(i=>i.id===$('masterItemPick')?.value);

    const h=(customer?.priceHistory||[]).find(x=>x.id===historyId);

    if(!customer||!item||!h){
      return scBaseAddMasterLineV1023.apply(this,arguments);
    }

    const previousAuto=quick.dataset.autoPrice;
    quick.dataset.autoPrice='1';

    try{
      const result=scBaseAddMasterLineV1023.apply(this,arguments);

      updateCustomerPriceHistory(
        item,
        Number(h.price),
        $('payMode')?.value||customer.paymentMode||'credit',
        h.tier||item.lastTier||'',
        {
          source:'history-reuse',
          note:`Previous customer price reused from ${scHistoryDateV1023(h)}`,
          documentId:state.current?.id||'',
          documentSerial:state.current?.serial||''
        }
      );

      saveState();
      return result;

    }finally{
      quick.dataset.autoPrice=previousAuto||'0';
      delete quick.dataset.historyId;
      delete quick.dataset.historyItemId;
      scRenderCustomerItemSelectedV1023();
    }
  };

  window.addMasterLine=addMasterLine;

  /*
    Existing v1.0.21 picker still owns customer-specific dropdown
    population and current-price loading. This wrapper only refreshes
    the compact selected-item card.
  */
  const scBaseCustomerPickChangedV1023=window.customerItemPickChangedV1021;

  window.customerItemPickChangedV1021=function(){
    const previous=$('masterItemPick')?.value||'';

    const result=
      scBaseCustomerPickChangedV1023
        ?.apply(this,arguments);

    const now=$('masterItemPick')?.value||'';

    if(now!==previous){
      scExpandedCustomerItemV1023='';
    }

    const quick=$('quickPrice');
    if(quick){
      delete quick.dataset.historyId;
      delete quick.dataset.historyItemId;
    }

    scRenderCustomerItemSelectedV1023();
    return result;
  };

  /*
    Re-render after customer/document/calculator actions while keeping
    the customer picker populated by the existing core functions.
  */
  [
    'refreshCustomerPick',
    'fillCustomer',
    'syncPricesToCustomer',
    'newDocument',
    'openDocument',
    'resetEditor',
    'updateEditorVisibility',
    'addCalculatedLabel'
  ].forEach(name=>{
    const base=window[name];
    if(typeof base!=='function')return;

    window[name]=function(){
      const result=base.apply(this,arguments);

      Promise
        .resolve(result)
        .finally(()=>scRenderCustomerItemSelectedV1023());

      return result;
    };

    try{
      eval(`${name}=window[name]`);
    }catch(_){}
  });

  if($('quickPrice')){
    $('quickPrice').addEventListener('input',()=>{
      delete $('quickPrice').dataset.historyId;
      delete $('quickPrice').dataset.historyItemId;
    });
  }

  scRenderCustomerItemSelectedV1023();
})();
