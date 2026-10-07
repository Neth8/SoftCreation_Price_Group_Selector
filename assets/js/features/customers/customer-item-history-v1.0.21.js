
/* =========================================================
   SoftCreation v1.0.21
   CUSTOMER-SPECIFIC ITEM MASTER + PRICE CHANGE HISTORY
   ---------------------------------------------------------
   - New Document Item Master shows only items saved for the
     selected customer.
   - Latest customer-specific price is reused automatically.
   - Calculator saves, manual overrides and table price edits
     are written to Customer priceHistory.
   - Old price entries remain available from View Prices and
     can be reused in a quotation.
   - Existing global Label Master remains unchanged.
   ========================================================= */
(function(){
  'use strict';

  const SC_PRICE_HISTORY_LIMIT_V1021=1000;
  let scPriceContextV1021='';

  function scCustomerV1021(id){
    return state.customers.find(c=>c.id===(id||$('customerSelect')?.value));
  }

  function scItemKeyV1021(item){
    if(!item)return '';
    try{return item.labelKey||labelKey(item)}catch(_){return item.labelKey||item.id||''}
  }

  function scResolveHistoryItemV1021(h){
    if(!h)return null;
    let item=h.itemId?state.items.find(i=>i.id===h.itemId):null;
    if(item)return item;
    if(h.key){
      item=state.items.find(i=>scItemKeyV1021(i)===h.key);
      if(item)return item;
    }
    return null;
  }

  function scHistoryForItemV1021(customer,item,mode=''){
    if(!customer||!item)return [];
    const key=scItemKeyV1021(item);
    return (customer.priceHistory||[]).filter(h=>{
      const same=(h.itemId&&h.itemId===item.id)||(h.key&&h.key===key);
      return same&&(!mode||!h.mode||h.mode===mode);
    });
  }

  function scLatestHistoryV1021(customer,item,mode=''){
    const exact=scHistoryForItemV1021(customer,item,mode);
    if(exact.length)return exact[0];
    const all=scHistoryForItemV1021(customer,item,'');
    return all[0]||null;
  }

  function scSpecialPriceV1021(customer,item,mode){
    const sp=customer?.specialPrices?.[item?.id];
    if(!sp)return null;
    const v=mode==='cash'?sp.cash:sp.credit;
    if(v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v)))return Number(v);
    return null;
  }

  function scCustomerItemsV1021(customer){
    if(!customer)return [];
    const out=[];
    const seen=new Set();
    const add=item=>{
      if(!item||seen.has(item.id))return;
      seen.add(item.id);
      out.push(item);
    };
    (customer.priceHistory||[]).forEach(h=>add(scResolveHistoryItemV1021(h)));
    Object.keys(customer.specialPrices||{}).forEach(id=>add(state.items.find(i=>i.id===id)));
    return out;
  }

  function scHistoryDateV1021(h){
    const raw=h?.changedAt||h?.date||'';
    if(!raw)return '-';
    try{
      if(String(raw).length<=10)return fmtDate(String(raw).slice(0,10));
      return new Date(raw).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    }catch(_){return String(raw)}
  }

  function scSourceLabelV1021(source){
    const m={
      'calculator':'Calculator',
      'calculator-add':'Calculator → Quotation',
      'calculator-customer':'Calculator → Customer Price',
      'calculator-master':'Calculator → Label Master',
      'manual-quick-price':'Manual Customer Price',
      'manual-quotation-line':'Manual Quotation Edit',
      'history-reuse':'Previous Price Reused',
      'legacy':'Legacy Saved Price'
    };
    return m[source]||source||'Saved Price';
  }

  function scRecordCustomerPriceV1021(item,price,mode,tier,meta={}){
    const customer=scCustomerV1021(meta.customerId);
    const value=Number(price);
    if(!customer||!item||!Number.isFinite(value))return null;

    customer.priceHistory=Array.isArray(customer.priceHistory)?customer.priceHistory:[];
    const key=scItemKeyV1021(item);
    const priceMode=mode||customer.paymentMode||$('payMode')?.value||'credit';
    const latest=scHistoryForItemV1021(customer,item,priceMode)[0]||null;
    const oldPrice=meta.oldPrice!==undefined&&meta.oldPrice!==null&&Number.isFinite(Number(meta.oldPrice))
      ? Number(meta.oldPrice)
      : (latest&&Number.isFinite(Number(latest.price))?Number(latest.price):null);

    /* Price history is a CHANGE log, not a duplicate usage log. */
    if(!meta.force&&latest&&Math.abs(Number(latest.price)-value)<0.005){
      return latest;
    }

    const now=new Date();
    const entry={
      id:uid('price'),
      key,
      itemId:item.id,
      size:item.size,
      material:item.material,
      layout:item.layout,
      pcs:item.pcs,
      price:value,
      oldPrice,
      mode:priceMode,
      tier:tier||item.lastTier||'',
      source:meta.source||scPriceContextV1021||'calculator',
      note:meta.note||'',
      date:today(),
      changedAt:now.toISOString(),
      user:currentUser?.display||currentUser?.username||'',
      username:currentUser?.username||'',
      documentId:meta.documentId||state.current?.id||'',
      documentSerial:meta.documentSerial||state.current?.serial||''
    };
    customer.priceHistory.unshift(entry);
    customer.priceHistory=customer.priceHistory.slice(0,SC_PRICE_HISTORY_LIMIT_V1021);
    return entry;
  }

  /* Existing calculator calls now create richer, de-duplicated history records. */
  updateCustomerPriceHistory=function(item,price,mode,tier,meta={}){
    return scRecordCustomerPriceV1021(item,price,mode,tier,meta);
  };
  window.updateCustomerPriceHistory=updateCustomerPriceHistory;

  /* Explicit Customer Master special price stays a fallback. A later saved
     customer price/history entry becomes the customer's current working price. */
  const scBaseCurrentPricingV1021=currentPricingForItem;
  currentPricingForItem=function(item,customerId,payMode){
    const customer=scCustomerV1021(customerId);
    if(customer&&item){
      const latest=scHistoryForItemV1021(customer,item,payMode)[0];
      if(latest&&Number.isFinite(Number(latest.price)))return Number(latest.price);
      const special=scSpecialPriceV1021(customer,item,payMode);
      if(special!==null)return special;
    }
    return scBaseCurrentPricingV1021(item,customerId,payMode);
  };
  window.currentPricingForItem=currentPricingForItem;

  function scUpdateCustomerItemProfileV1021(){
    const customer=scCustomerV1021();
    const profile=$('customerItemProfile');
    const text=$('customerItemProfileText');
    const allBtn=$('customerAllPriceHistoryBtn');
    const historyBtn=$('customerItemHistoryBtn');
    const device=$('quoteCategory')?.value==='device';
    const pi=$('docType')?.value==='PI';

    if(profile)profile.style.display=(device||pi)?'none':'flex';
    if(historyBtn)historyBtn.style.display=(device||pi)?'none':'';
    if(!text||!allBtn)return;

    if(!customer){
      text.textContent='Select a customer to load only that customer\'s saved label items.';
      allBtn.disabled=true;
      if(historyBtn)historyBtn.disabled=true;
      return;
    }

    const items=scCustomerItemsV1021(customer);
    const changes=(customer.priceHistory||[]).length;
    text.textContent=`${items.length} saved item${items.length===1?'':'s'} • ${changes} price histor${changes===1?'y':'ies'} • ${(customer.paymentMode||$('payMode')?.value||'credit').toUpperCase()} mode`;
    allBtn.disabled=changes===0&&items.length===0;
    if(historyBtn)historyBtn.disabled=!$('masterItemPick')?.value;
  }

  function scRefreshCustomerItemPickerV1021(preferredId=''){
    const mp=$('masterItemPick');
    if(!mp)return;
    const customer=scCustomerV1021();
    const previous=preferredId||mp.value||'';
    const quick=$('quickPrice');

    if(!customer){
      mp.innerHTML='<option value="">-- Select customer first --</option>';
      mp.disabled=true;
      if(quick){quick.value='';quick.dataset.autoPrice='0'}
      scUpdateCustomerItemProfileV1021();
      return;
    }

    const items=scCustomerItemsV1021(customer);
    mp.disabled=false;
    if(!items.length){
      mp.innerHTML='<option value="">-- No saved items — use Label Price Calculator --</option>';
      mp.disabled=true;
      if(quick){quick.value='';quick.dataset.autoPrice='0'}
      scUpdateCustomerItemProfileV1021();
      return;
    }

    const mode=$('payMode')?.value||customer.paymentMode||'credit';
    mp.innerHTML='<option value="">-- Customer Item Master --</option>'+items.map(item=>{
      const price=currentPricingForItem(item,customer.id,mode);
      const count=scHistoryForItemV1021(customer,item,'').length;
      const label=[item.size,item.material,item.layout,item.pcs?item.pcs+'pcs':''].filter(Boolean).join(' / ');
      return `<option value="${item.id}">${esc(label)} — LKR ${money(price)}${count?` • ${count} change${count===1?'':'s'}`:''}</option>`;
    }).join('');

    if(items.some(i=>i.id===previous))mp.value=previous;
    else mp.value='';
    window.customerItemPickChangedV1021(false);
    scUpdateCustomerItemProfileV1021();
  }

  window.customerItemPickChangedV1021=function(markAuto=true){
    const mp=$('masterItemPick'),quick=$('quickPrice');
    const customer=scCustomerV1021();
    const item=state.items.find(i=>i.id===mp?.value);
    const historyBtn=$('customerItemHistoryBtn');
    if(historyBtn)historyBtn.disabled=!item;
    if(!quick)return;
    if(!customer||!item){quick.value='';quick.dataset.autoPrice='0';scUpdateCustomerItemProfileV1021();return}
    const price=currentPricingForItem(item,customer.id,$('payMode')?.value||customer.paymentMode||'credit');
    quick.value=Number(price||0).toFixed(2);
    quick.dataset.autoPrice=markAuto===false?'1':'1';
    const latest=scLatestHistoryV1021(customer,item,$('payMode')?.value||'');
    const text=$('customerItemProfileText');
    if(text){
      const count=scHistoryForItemV1021(customer,item,'').length;
      text.textContent=`${[item.size,item.material,item.layout,item.pcs?item.pcs+' pcs':''].filter(Boolean).join(' / ')} • Current LKR ${money(price)} • ${count} recorded change${count===1?'':'s'}${latest?.user?` • Last by ${latest.user}`:''}`;
    }
  };

  /* Replace refreshCustomerPick only for the Item Master portion. Customer
     selector behaviour stays exactly as before. */
  const scBaseRefreshCustomerPickV1021=refreshCustomerPick;
  refreshCustomerPick=function(){
    const customerValue=$('customerSelect')?.value||'';
    const itemValue=$('masterItemPick')?.value||'';
    scBaseRefreshCustomerPickV1021();
    if($('customerSelect')&&state.customers.some(c=>c.id===customerValue))$('customerSelect').value=customerValue;
    scRefreshCustomerItemPickerV1021(itemValue);
  };
  window.refreshCustomerPick=refreshCustomerPick;

  const scBaseFillCustomerV1021=fillCustomer;
  fillCustomer=function(id){
    const result=scBaseFillCustomerV1021.apply(this,arguments);
    scRefreshCustomerItemPickerV1021();
    return result;
  };
  window.fillCustomer=fillCustomer;

  const scBaseSyncPricesV1021=syncPricesToCustomer;
  syncPricesToCustomer=function(){
    const result=scBaseSyncPricesV1021.apply(this,arguments);
    scRefreshCustomerItemPickerV1021($('masterItemPick')?.value||'');
    return result;
  };
  window.syncPricesToCustomer=syncPricesToCustomer;

  /* Calculator → quotation already saved history before. Add source context. */
  const scBaseAddCalculatedLabelV1021=addCalculatedLabel;
  addCalculatedLabel=function(mode){
    scPriceContextV1021='calculator-add';
    try{return scBaseAddCalculatedLabelV1021.apply(this,arguments)}
    finally{scPriceContextV1021='';scRefreshCustomerItemPickerV1021()}
  };
  window.addCalculatedLabel=addCalculatedLabel;

  /* Standalone calculator Save-to-Master / Save-to-Customer controls were removed in v1.0.22.
     Adding a calculated label to the quotation remains the single save path for Item Master + customer price history. */

  /* Manual price in the quick Customer Item Master row. */
  const scBaseAddMasterLineV1021=addMasterLine;
  addMasterLine=function(){
    const item=state.items.find(i=>i.id===$('masterItemPick')?.value);
    const quick=$('quickPrice');
    const customer=scCustomerV1021();
    const raw=quick?.value??'';
    const manual=raw!==''&&quick?.dataset.autoPrice!=='1';
    if(manual&&item&&customer){
      scRecordCustomerPriceV1021(item,Number(raw),$('payMode')?.value||customer.paymentMode||'credit',item.lastTier||'',{
        source:'manual-quick-price',
        note:'Manual price entered before Add Label'
      });
      saveState();
    }
    const result=scBaseAddMasterLineV1021.apply(this,arguments);
    scRefreshCustomerItemPickerV1021(item?.id||'');
    return result;
  };
  window.addMasterLine=addMasterLine;

  /* Manual edits directly inside the quotation table are saved when the price
     input CHANGE event commits, rather than on every keystroke. */
  const scBaseRenderLineRowsV1021=renderLineRows;
  renderLineRows=function(lines){
    const result=scBaseRenderLineRowsV1021.apply(this,arguments);
    document.querySelectorAll('#lineBody tr').forEach(tr=>{
      const p=tr.querySelector('.lprice');
      if(!p||p.dataset.customerHistoryBound==='1')return;
      p.dataset.customerHistoryBound='1';
      p.dataset.customerHistoryBefore=p.value;
      p.addEventListener('focus',()=>{p.dataset.customerHistoryBefore=p.value});
      p.addEventListener('change',()=>{
        const item=state.items.find(i=>i.id===tr.dataset.itemId);
        const customer=scCustomerV1021();
        const before=Number(p.dataset.customerHistoryBefore);
        const after=Number(p.value);
        if(item&&customer&&Number.isFinite(after)&&(!Number.isFinite(before)||Math.abs(after-before)>=0.005)){
          scRecordCustomerPriceV1021(item,after,$('payMode')?.value||customer.paymentMode||'credit',item.lastTier||'',{
            source:'manual-quotation-line',
            oldPrice:Number.isFinite(before)?before:null,
            note:'Price edited manually in quotation item table'
          });
          saveState();
          scRefreshCustomerItemPickerV1021(item.id);
          toast('Customer item price history updated');
        }
        p.dataset.customerHistoryBefore=p.value;
      });
    });
    return result;
  };
  window.renderLineRows=renderLineRows;

  function scCanUseHistoryV1021(customer,item){
    return !!(customer&&item&&state.current&&$('customerSelect')?.value===customer.id&&$('docType')?.value==='Q'&&($('quoteCategory')?.value||'label')==='label');
  }

  function scHistoryChangeTextV1021(h,older=null){
    const explicit=Number(h.oldPrice);
    const fallback=Number(older?.price);
    const hasExplicit=h.oldPrice!==null&&h.oldPrice!==undefined&&Number.isFinite(explicit);
    const hasFallback=older&&Number.isFinite(fallback);
    const old=hasExplicit?explicit:(hasFallback?fallback:null);
    if(old===null)return `Initial / saved price → LKR ${money(h.price)}`;
    return `LKR ${money(old)} → LKR ${money(h.price)}`;
  }

  function scRenderHistoryDetailV1021(customer,item){
    const list=scHistoryForItemV1021(customer,item,'');
    const canUse=scCanUseHistoryV1021(customer,item);
    const body=$('savedPricesBody');
    if(!body)return;
    const itemLabel=[item.size,item.material,item.layout,item.pcs?item.pcs+' pcs':''].filter(Boolean).join(' / ');
    body.innerHTML=`
      <div class="customer-price-modal-head">
        <div><b>${esc(customer.name)}</b><span>${esc(itemLabel)}</span></div>
        <button class="btn ghost sm" type="button" onclick="renderCustomerPriceSummaryV1021('${customer.id}')">← All Customer Items</button>
      </div>
      <div class="customer-price-current">
        <span>Current ${esc(($('payMode')?.value||customer.paymentMode||'credit').toUpperCase())} Price</span>
        <b>LKR ${money(currentPricingForItem(item,customer.id,$('payMode')?.value||customer.paymentMode||'credit'))}</b>
        <small>${list.length} recorded price change${list.length===1?'':'s'}</small>
      </div>
      <div class="customer-price-history-list">
        ${list.length?list.map((h,index)=>`<div class="customer-price-history-row">
          <div class="customer-price-history-index">${String(index+1).padStart(2,'0')}</div>
          <div class="customer-price-history-main">
            <b>${esc(scHistoryChangeTextV1021(h,list[index+1]))}</b>
            <span>${esc((h.mode||'').toUpperCase())} • ${esc(h.tier||'No category')} • ${esc(scSourceLabelV1021(h.source||'legacy'))}</span>
            <small>${esc(scHistoryDateV1021(h))} • ${esc(h.user||h.username||'Legacy')}${h.documentSerial?` • ${esc(h.documentSerial)}`:''}${h.note?`<br>${esc(h.note)}`:''}</small>
          </div>
          <div class="customer-price-history-actions">
            <b>LKR ${money(h.price)}</b>
            ${canUse?`<button class="btn ghost sm" type="button" onclick="useCustomerHistoryPriceV1021('${customer.id}','${item.id}','${h.id}',false)">Use Price</button><button class="btn primary sm" type="button" onclick="useCustomerHistoryPriceV1021('${customer.id}','${item.id}','${h.id}',true)">Use & Add</button>`:''}
          </div>
        </div>`).join(''):'<div class="empty">No recorded price changes for this item.</div>'}
      </div>`;
    $('savedPricesModal').classList.add('show');
  }

  window.renderCustomerPriceSummaryV1021=function(customerId){
    const customer=scCustomerV1021(customerId);
    const body=$('savedPricesBody');
    if(!customer||!body)return;
    const items=scCustomerItemsV1021(customer);
    const mode=$('payMode')?.value||customer.paymentMode||'credit';
    body.innerHTML=`
      <div class="customer-price-modal-head">
        <div><b>${esc(customer.name)}</b><span>Customer-specific Label Item Master & Price History</span></div>
        <div class="customer-price-count">${items.length} items • ${(customer.priceHistory||[]).length} changes</div>
      </div>
      ${items.length?`<div class="customer-price-summary-grid">${items.map(item=>{
        const list=scHistoryForItemV1021(customer,item,'');
        const latest=list[0];
        const label=[item.size,item.material,item.layout,item.pcs?item.pcs+' pcs':''].filter(Boolean).join(' / ');
        const price=currentPricingForItem(item,customer.id,mode);
        return `<div class="customer-price-item-card">
          <div class="customer-price-item-title"><b>${esc(label)}</b><span>${esc(item.desc||'ELP')}</span></div>
          <div class="customer-price-item-value"><span>Current ${esc(mode.toUpperCase())}</span><b>LKR ${money(price)}</b></div>
          <div class="customer-price-item-meta">${list.length} price change${list.length===1?'':'s'}${latest?` • ${esc(scHistoryDateV1021(latest))}`:''}</div>
          <div class="actions"><button class="btn ghost sm" type="button" onclick="showCustomerItemHistoryV1021('${customer.id}','${item.id}')">View Changes</button>${scCanUseHistoryV1021(customer,item)?`<button class="btn primary sm" type="button" onclick="selectCustomerItemForQuoteV1021('${item.id}')">Use Current</button>`:''}</div>
        </div>`;
      }).join('')}</div>`:'<div class="empty">No saved label items for this customer yet. Use the Label Price Calculator to create the first item.</div>'}`;
    $('savedPricesModal').classList.add('show');
  };

  window.showCustomerItemHistoryV1021=function(customerId,itemId){
    const customer=scCustomerV1021(customerId),item=state.items.find(i=>i.id===itemId);
    if(!customer||!item)return;
    scRenderHistoryDetailV1021(customer,item);
  };

  window.openCustomerAllPriceHistoryV1021=function(){
    const customer=scCustomerV1021();
    if(!customer)return toast('Select a customer first');
    window.renderCustomerPriceSummaryV1021(customer.id);
  };

  window.openSelectedCustomerItemHistoryV1021=function(){
    const customer=scCustomerV1021(),item=state.items.find(i=>i.id===$('masterItemPick')?.value);
    if(!customer)return toast('Select a customer first');
    if(!item)return toast('Select a customer item first');
    scRenderHistoryDetailV1021(customer,item);
  };

  window.selectCustomerItemForQuoteV1021=function(itemId){
    const item=state.items.find(i=>i.id===itemId),customer=scCustomerV1021();
    if(!item||!customer)return;
    $('masterItemPick').value=item.id;
    window.customerItemPickChangedV1021();
    closeModal('savedPricesModal');
  };

  window.useCustomerHistoryPriceV1021=function(customerId,itemId,historyId,addNow=false){
    const customer=scCustomerV1021(customerId),item=state.items.find(i=>i.id===itemId);
    const h=(customer?.priceHistory||[]).find(x=>x.id===historyId);
    if(!customer||!item||!h)return;
    if($('customerSelect')?.value!==customer.id)return toast('Select this customer in New Document first');
    $('masterItemPick').value=item.id;
    const quick=$('quickPrice');
    quick.value=Number(h.price||0).toFixed(2);
    quick.dataset.autoPrice='0';
    const text=$('customerItemProfileText');
    if(text)text.textContent=`Previous price selected: LKR ${money(h.price)} • ${scHistoryDateV1021(h)} • ${scSourceLabelV1021(h.source||'legacy')}`;
    closeModal('savedPricesModal');
    if(addNow)addMasterLine();
  };

  /* Upgrade the existing Customer Master View Prices modal. */
  viewCustomerSavedPrices=function(){
    const id=$('custId')?.value||$('customerSelect')?.value;
    const customer=scCustomerV1021(id);
    if(!customer)return toast('Save/select a customer first');
    window.renderCustomerPriceSummaryV1021(customer.id);
  };
  window.viewCustomerSavedPrices=viewCustomerSavedPrices;

  /* Keep the customer-specific picker correct after document lifecycle events. */
  const scBaseNewDocumentV1021=newDocument;
  newDocument=function(){
    const result=scBaseNewDocumentV1021.apply(this,arguments);
    scRefreshCustomerItemPickerV1021();
    return result;
  };
  window.newDocument=newDocument;

  const scBaseOpenDocumentV1021=openDocument;
  openDocument=function(){
    const result=scBaseOpenDocumentV1021.apply(this,arguments);
    scRefreshCustomerItemPickerV1021();
    return result;
  };
  window.openDocument=openDocument;

  const scBaseResetEditorV1021=resetEditor;
  resetEditor=function(){
    const result=scBaseResetEditorV1021.apply(this,arguments);
    scRefreshCustomerItemPickerV1021();
    return result;
  };
  window.resetEditor=resetEditor;

  const scBaseUpdateEditorVisibilityV1021=updateEditorVisibility;
  updateEditorVisibility=function(){
    const result=scBaseUpdateEditorVisibilityV1021.apply(this,arguments);
    scUpdateCustomerItemProfileV1021();
    return result;
  };
  window.updateEditorVisibility=updateEditorVisibility;

  /* Manual typing in the quick price field is distinguishable from automatic
     customer-price population. */
  if($('quickPrice')){
    $('quickPrice').addEventListener('input',()=>{$('quickPrice').dataset.autoPrice='0'});
  }

  /* Existing records are already compatible; add missing metadata lazily. */
  (state.customers||[]).forEach(customer=>{
    customer.priceHistory=Array.isArray(customer.priceHistory)?customer.priceHistory:[];
    customer.priceHistory.forEach(h=>{
      if(!h.source)h.source='legacy';
      if(!h.changedAt&&h.date)h.changedAt=`${String(h.date).slice(0,10)}T00:00:00.000Z`;
    });
  });

  scRefreshCustomerItemPickerV1021();

})();
