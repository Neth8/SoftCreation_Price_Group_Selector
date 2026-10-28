
/* V1.0.68 - Direct Customer Delivery from Packing Batch Dispatch */
(function(){
  function ensureDirectDeliveryUiV1068(){
    if($('dispatchDirectWrapV1068'))return;

    const total=$('dispatchLoadTotal');
    if(!total)return;

    total.insertAdjacentHTML('beforebegin',`
      <div id="dispatchDirectWrapV1068" class="dispatch-direct-wrap-v1068">
        <label class="dispatch-direct-toggle-v1068">
          <input id="dispatchDirectCustomerV1068" type="checkbox" onchange="toggleDirectDeliveryV1068(this.checked)">
          <span>
            <b>Direct Delivery to Customer from Factory</b>
            <small>Tick this when the selected packed boxes will bypass Stores and go directly to the customer.</small>
          </span>
        </label>

        <div id="dispatchDirectFieldsV1068" class="dispatch-direct-fields-v1068" hidden>
          <div class="dispatch-direct-title-v1068">
            <b>Direct Customer Delivery Details</b>
            <span>Customer details are suggested from Customer Master.</span>
          </div>

          <div class="grid">
            <div class="field full dispatch-customer-suggest-wrap-v1068">
              <label>Customer</label>
              <input
                id="dispatchDirectCustomerNameV1068"
                type="text"
                list="dispatchCustomerMasterListV1068"
                autocomplete="off"
                placeholder="Start typing customer name..."
                oninput="directCustomerTypeV1068(this.value)"
                onchange="directCustomerTypeV1068(this.value,true)"
              >
              <datalist id="dispatchCustomerMasterListV1068"></datalist>
              <input id="dispatchDirectCustomerIdV1068" type="hidden">
              <div class="hint">Select an existing customer from Customer Master. Exact customer selection auto-fills contact and delivery address.</div>
            </div>

            <div class="field">
              <label>Customer Contact Number</label>
              <input id="dispatchDirectCustomerPhoneV1068" type="text" placeholder="Customer phone">
            </div>

            <div class="field">
              <label>Vehicle Number</label>
              <input id="dispatchDirectVehicleV1068" type="text" placeholder="e.g. WP CAB-1234">
            </div>

            <div class="field">
              <label>Driver Name</label>
              <input id="dispatchDirectDriverV1068" type="text" placeholder="Driver full name">
            </div>

            <div class="field">
              <label>Driver Contact Number</label>
              <input id="dispatchDirectDriverPhoneV1068" type="text" placeholder="Driver phone">
            </div>

            <div class="field full">
              <label>Customer Delivery Address</label>
              <textarea id="dispatchDirectAddressV1068" placeholder="Delivery address"></textarea>
            </div>
          </div>
        </div>
      </div>`);
  }

  function refreshCustomerSuggestionsV1068(){
    const list=$('dispatchCustomerMasterListV1068');
    if(!list)return;
    list.innerHTML=(state.customers||[])
      .slice()
      .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')))
      .map(c=>`<option value="${esc(c.name||'')}">${esc(c.phone||'')} ${esc(c.delivery||c.address||'')}</option>`)
      .join('');
  }

  function findCustomerByNameV1068(name){
    const q=String(name||'').trim().toLowerCase();
    if(!q)return null;
    return (state.customers||[]).find(c=>String(c.name||'').trim().toLowerCase()===q)||null;
  }

  function fillDirectCustomerV1068(c){
    if(!c)return;
    $('dispatchDirectCustomerIdV1068').value=c.id||'';
    $('dispatchDirectCustomerNameV1068').value=c.name||'';
    $('dispatchDirectCustomerPhoneV1068').value=c.phone||'';
    $('dispatchDirectAddressV1068').value=c.delivery||c.address||'';
  }

  window.directCustomerTypeV1068=function(value,commit=false){
    refreshCustomerSuggestionsV1068();
    const c=findCustomerByNameV1068(value);
    if(c){
      fillDirectCustomerV1068(c);
    }else if(commit){
      $('dispatchDirectCustomerIdV1068').value='';
    }
  };

  function currentDispatchJobV1068(){
    return (state.productionRequests||[]).find(x=>x.id===$('dispatchLoadReqId')?.value)||null;
  }

  window.toggleDirectDeliveryV1068=function(checked){
    const fields=$('dispatchDirectFieldsV1068');
    if(fields)fields.hidden=!checked;

    if(!checked)return;

    refreshCustomerSuggestionsV1068();

    const r=currentDispatchJobV1068();
    const exact=(state.customers||[]).find(
      c=>String(c.name||'').trim().toLowerCase()===String(r?.customerName||'').trim().toLowerCase()
    );
    if(exact && !$('dispatchDirectCustomerNameV1068').value.trim()){
      fillDirectCustomerV1068(exact);
    }else if(r && !$('dispatchDirectCustomerNameV1068').value.trim()){
      $('dispatchDirectCustomerNameV1068').value=r.customerName||'';
    }
  };

  function resetDirectDeliveryV1068(){
    ensureDirectDeliveryUiV1068();
    $('dispatchDirectCustomerV1068').checked=false;
    $('dispatchDirectFieldsV1068').hidden=true;
    $('dispatchDirectCustomerIdV1068').value='';
    $('dispatchDirectCustomerNameV1068').value='';
    $('dispatchDirectCustomerPhoneV1068').value='';
    $('dispatchDirectVehicleV1068').value='';
    $('dispatchDirectDriverV1068').value='';
    $('dispatchDirectDriverPhoneV1068').value='';
    $('dispatchDirectAddressV1068').value='';
    refreshCustomerSuggestionsV1068();
  }

  const baseOpen=window.openDispatchLoadingV81;
  if(typeof baseOpen==='function'){
    window.openDispatchLoadingV81=function(id){
      const result=baseOpen.apply(this,arguments);
      /* The V1067 flow opens the Packing Batch modal synchronously. */
      setTimeout(()=>resetDirectDeliveryV1068(),0);
      return result;
    };
    try{openDispatchLoadingV81=window.openDispatchLoadingV81}catch(_){}
  }

  function directPayloadV1068(){
    const direct=!!$('dispatchDirectCustomerV1068')?.checked;
    if(!direct)return {directToCustomer:false};

    const customerName=String($('dispatchDirectCustomerNameV1068')?.value||'').trim();
    const customerId=String($('dispatchDirectCustomerIdV1068')?.value||'').trim();
    const customerPhone=String($('dispatchDirectCustomerPhoneV1068')?.value||'').trim();
    const address=String($('dispatchDirectAddressV1068')?.value||'').trim();
    const vehicleNo=String($('dispatchDirectVehicleV1068')?.value||'').trim();
    const driverName=String($('dispatchDirectDriverV1068')?.value||'').trim();
    const driverPhone=String($('dispatchDirectDriverPhoneV1068')?.value||'').trim();

    return {
      directToCustomer:true,
      directDelivery:{
        customerId,
        customerName,
        customerPhone,
        address,
        vehicleNo,
        driverName,
        driverPhone
      }
    };
  }

  /* Final override: same protected dispatch save, with direct-delivery metadata
     written BEFORE PDF generation / queue rendering. */
  window.confirmDispatchLoadingV81=function(){
    if(typeof currentUserPasswordOKV82==='function' &&
       !currentUserPasswordOKV82('lock and create the dispatch note')){
      return;
    }

    const r=state.productionRequests.find(x=>x.id===$('dispatchLoadReqId').value);
    if(!r||flowIndexV81(r.status)<flowIndexV81('Finished')){
      return toast('This production job is locked or no longer available');
    }

    const boxes=selectedDispatchBoxesV81();
    const loose=Number($('dispatchLoose').value||0);
    const qty=boxes.reduce((n,b)=>n+b.qty,0)+loose;
    const avail=productionAvailableV81(r);

    if(boxes.some(b=>b.qty>Number(
      document.querySelector(
        `.dispatch-box-qty[data-i="${(r.packing.boxes||[]).findIndex(x=>x.boxNo===b.boxNo)}"]`
      )?.max||0
    ))){
      return toast('A carton load quantity exceeds its remaining packed count');
    }

    if(!(qty>0))return toast('Select at least one packed box or loose-roll load');
    if(qty>avail+.001)return toast(`Dispatch cannot exceed available ${money(avail)} rolls`);

    const directInfo=directPayloadV1068();

    if(directInfo.directToCustomer){
      const x=directInfo.directDelivery;
      if(!x.customerName)return toast('Select / enter the direct delivery customer');
      if(!x.customerPhone)return toast('Enter the customer contact number');
      if(!x.address)return toast('Enter the customer delivery address');
      if(!x.vehicleNo)return toast('Enter the vehicle number');
      if(!x.driverName)return toast('Enter the driver name');
      if(!x.driverPhone)return toast('Enter the driver contact number');
    }else{
      if(!String($('dispatchLoadCarrier').value||'').trim()){
        return toast('Enter driver / vehicle / courier');
      }
    }

    const directCarrier=directInfo.directToCustomer
      ? `${directInfo.directDelivery.vehicleNo} • ${directInfo.directDelivery.driverName}`
      : String($('dispatchLoadCarrier').value||'').trim();

    const d={
      id:uid('dispatch'),
      dispatchNo:nextDispatchNoV81(),
      requestId:r.id,
      orderNo:r.orderNo,
      piId:r.piId,
      piSerial:r.piSerial,
      customerName:r.customerName,
      boxes,
      loose,
      qty,
      date:$('dispatchLoadDate').value||today(),
      carrier:directCarrier,
      note:$('dispatchLoadNote').value.trim(),
      by:currentUser.display,
      byUser:currentUser.username,
      at:new Date().toISOString(),
      locked:true,
      directToCustomer:directInfo.directToCustomer,
      directDelivery:directInfo.directToCustomer?directInfo.directDelivery:null,
      destinationType:directInfo.directToCustomer?'Customer':'Stores'
    };

    r.dispatches=r.dispatches||[];
    r.dispatches.push(d);
    r.dispatch=d;
    r.status=qty<avail?'Finished':'Dispatched';

    const historyDestination=d.directToCustomer
      ? `Direct customer: ${d.directDelivery.customerName}`
      : 'Stores';

    r.history.push({
      status:'Dispatched',
      note:`${d.dispatchNo}; ${boxes.length} boxes + ${loose} loose; ${qty} rolls; ${historyDestination}`,
      by:currentUser.display,
      at:d.at
    });

    notifyV8(
      r.ownerUser,
      d.directToCustomer?'Direct Customer Dispatch':'Factory Dispatched',
      `${d.dispatchNo}: ${money(qty)} rolls / ${boxes.length} boxes dispatched to ${d.directToCustomer?d.directDelivery.customerName:'Stores'}.`,
      r.id
    );

    audit(
      d.directToCustomer?'LOCK_DIRECT_CUSTOMER_DISPATCH':'LOCK_FACTORY_DISPATCH',
      `${d.dispatchNo} ${r.orderNo} ${qty} rolls ${historyDestination}`
    );

    saveState();
    closeModal('dispatchNoteModal');
    renderProductionBoard();
    renderStoresQueueV8();
    downloadDispatchPDFV81(d.id);

    toast(
      d.directToCustomer
        ? 'Direct customer dispatch locked. Dispatch Note PDF generated.'
        : 'Dispatch locked. Dispatch Note PDF generated.'
    );
  };
  try{confirmDispatchLoadingV81=window.confirmDispatchLoadingV81}catch(_){}

  /* Direct deliveries bypass Stores receiving. */
  const baseStores=window.renderStoresQueueV8;
  window.renderStoresQueueV8=function(){
    if(!$('storesQueue'))return;

    const rows=[];
    (state.productionRequests||[])
      .filter(productionVisibleV8)
      .forEach(r=>(r.dispatches||[])
        .filter(d=>!d.directToCustomer)
        .forEach(d=>rows.push({
          r,
          d,
          g:state.grns.find(x=>x.dispatchId===d.id)
        }))
      );

    $('storesQueue').innerHTML=rows.length
      ? `<table class="table">
          <thead><tr><th>Dispatch / Production</th><th>Customer / Item</th><th>Factory Loading</th><th>Stores / Variance</th><th>Actions</th></tr></thead>
          <tbody>${rows.map(({r,d,g})=>`<tr>
            <td><b>${esc(d.dispatchNo)}</b><div class="small">${esc(r.orderNo)} • PI ${esc(r.piSerial)}</div></td>
            <td><b>${esc(r.customerName)}</b><div class="small">${esc(r.size)} • ${esc(r.material)} • ${esc(r.layout)}</div></td>
            <td><b>${money(d.qty)} Rolls</b><div class="small">${d.boxes.length} boxes + ${money(d.loose)} loose<br>${esc(d.date)} • ${esc(d.carrier)}</div></td>
            <td>${g
              ? `<b>${esc(g.grnNo)}</b><div class="${g.variance===0?'grn-ok':'grn-bad'}">Received ${money(g.receivedQty)} • Variance ${money(g.variance)}</div><div class="small">${esc(g.varianceStatus||'')}</div>${g.factoryReason?`<div class="small"><b>Factory:</b> ${esc(g.factoryReason)}</div>`:''}`
              : '<span class="tag amber">Awaiting Stores Count</span>'}</td>
            <td>
              <button class="btn ghost sm" onclick="downloadDispatchPDFV81('${d.id}')">Dispatch PDF</button>
              ${!g
                ? `<button class="btn primary sm" onclick="openReceiveDispatchV81('${d.id}')">Receive / Count</button>`
                : g.variance&&!g.factoryReason&&(currentUser?.role==='admin'||hasPerm('production_manage'))
                  ? `<button class="btn red sm" onclick="saveFactoryVarianceV81('${g.id}')">Factory Reason</button>`
                  : g.variance&&!g.factoryReason
                    ? '<span class="tag amber">Reason pending</span>'
                    : `<button class="btn green sm" onclick="downloadGRNV8('${g.id}')">Finance PDF</button>`}
            </td>
          </tr>`).join('')}</tbody>
        </table>`
      : '<div class="empty">No factory dispatches waiting for Stores.</div>';
  };
  try{renderStoresQueueV8=window.renderStoresQueueV8}catch(_){}

  /* Dispatch PDF now identifies Stores vs direct customer delivery. */
  window.downloadDispatchPDFV81=async function(id){
    const x=findDispatchV81(id);
    if(!x)return;

    const {r,d}=x;
    const rows=d.boxes.map(b=>`
      <tr>
        <td>Box ${esc(b.boxNo)}</td>
        <td>${money(b.packedRolls)}</td>
        <td><b>${money(b.qty)}</b></td>
        <td>${esc(b.note||'')}</td>
      </tr>`).join('');

    const direct=!!d.directToCustomer;
    const dd=d.directDelivery||{};

    const destinationBlock=direct
      ? `<tr><th>Dispatch Type</th><td colspan="3"><b style="color:#087f83">DIRECT TO CUSTOMER FROM FACTORY</b></td></tr>
         <tr><th>Delivery Customer</th><td>${esc(dd.customerName||'-')}</td><th>Contact</th><td>${esc(dd.customerPhone||'-')}</td></tr>
         <tr><th>Delivery Address</th><td colspan="3">${esc(dd.address||'-')}</td></tr>
         <tr><th>Vehicle Number</th><td>${esc(dd.vehicleNo||'-')}</td><th>Driver</th><td>${esc(dd.driverName||'-')} • ${esc(dd.driverPhone||'-')}</td></tr>`
      : `<tr><th>Dispatch Type</th><td colspan="3">Factory → Stores</td></tr>
         <tr><th>Driver / Vehicle / Courier</th><td colspan="3">${esc(d.carrier||'-')}</td></tr>`;

    const footer=direct
      ? `<span>Factory Released By: ${esc(d.by)}</span><span>Driver Signature: __________________</span><span>Customer Received: __________________</span>`
      : `<span>Factory Released By: ${esc(d.by)}</span><span>Driver Signature: __________________</span><span>Stores Received: __________________</span>`;

    await pdfFromLetterheadV81(
      `<div style="border-left:7px solid #078f92;padding-left:14px">
        <h1 style="margin:0;color:#078f92">${direct?'DIRECT CUSTOMER DISPATCH NOTE':'FACTORY DISPATCH NOTE'}</h1>
        <b>${esc(d.dispatchNo)}</b>
      </div>

      <table class="table" style="margin-top:20px">
        <tr><th>Production Request</th><td>${esc(r.orderNo)}</td><th>PI</th><td>${esc(r.piSerial)}</td></tr>
        <tr><th>Order Customer</th><td colspan="3">${esc(r.customerName)}</td></tr>
        <tr><th>Item</th><td colspan="3">${esc(r.size)} / ${esc(r.material)} / ${esc(r.layout)} / ${money(r.pcs)} pcs per roll</td></tr>
        <tr><th>Dispatch Date</th><td colspan="3">${esc(d.date)}</td></tr>
        ${destinationBlock}
      </table>

      <h3 style="color:#078f92">PACKING BATCH DISPATCH</h3>
      <table class="table">
        <thead><tr><th>Carton</th><th>Packed Rolls</th><th>Dispatched Rolls</th><th>Note</th></tr></thead>
        <tbody>
          ${rows}
          ${d.loose?`<tr><td>Loose</td><td>-</td><td><b>${money(d.loose)}</b></td><td></td></tr>`:''}
        </tbody>
      </table>

      <div class="dn-status">
        <b>Total Dispatched: ${money(d.qty)} Rolls • ${d.boxes.length} Cartons</b><br>
        ${esc(d.note||'')}
      </div>

      <div style="margin-top:45px;display:flex;justify-content:space-between">
        ${footer}
      </div>`,
      `Dispatch_${d.dispatchNo.replaceAll('/','-')}_${direct?(dd.customerName||r.customerName):r.customerName}.pdf`
    );

    audit('DOWNLOAD_DISPATCH_NOTE',d.dispatchNo);
    saveState();
  };
  try{downloadDispatchPDFV81=window.downloadDispatchPDFV81}catch(_){}

  ensureDirectDeliveryUiV1068();
  refreshCustomerSuggestionsV1068();
})();
