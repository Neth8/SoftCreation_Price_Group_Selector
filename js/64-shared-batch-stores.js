/* Shared physical dispatch reconciliation, without merging production histories.
   Every physical batch dispatch is one Stores GRN, even when it consumes
   several individual production-job balances. */
(function(){
  const eps=0.000001;
  function jobs(){return Array.isArray(state?.productionRequests)?state.productionRequests:[]}
  function sharedEntries(){
    const groups=new Map();
    for(const r of jobs())for(const d of (r.dispatches||[])){
      if(!d?.sharedBatchDispatchId||d.directToCustomer)continue;
      const key=String(d.sharedBatchDispatchId);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({r,d});
    }
    return groups;
  }
  function primary(group){
    if(!group?.length)return null;
    const id=String(group[0].d.sharedBatchPrimaryId||'');
    return group.find(e=>String(e.d.id)===id)||group[0];
  }
  function lookupByDispatchId(id){
    for(const [key,group] of sharedEntries()){
      if(group.some(e=>String(e.d.id)===String(id)))return {key,group,entry:primary(group)};
    }
    return null;
  }
  function recordedGRN(key){return (state.grns||[]).find(g=>String(g.sharedBatchDispatchId||'')===String(key))}
  function sharedTotal(group){
    const declared=Number(primary(group)?.d?.sharedBatchTotal);
    return Number.isFinite(declared)&&declared>0?declared:group.reduce((n,e)=>n+Number(e.d.qty||0),0);
  }
  function install(){
    if(window.__sharedStoresV64Installed)return;
    window.__sharedStoresV64Installed=true;
    const baseRender=window.renderStoresQueueV8;
    if(typeof baseRender==='function'){
      window.renderStoresQueueV8=function(){
        const result=baseRender.apply(this,arguments);
        const host=$('storesQueue'),table=host?.querySelector('table'),body=table?.querySelector('tbody');
        if(!body)return result;
        const groups=sharedEntries();
        for(const [key,group] of groups){
          const lead=primary(group),p=lead?.d;
          if(!p)continue;
          const matches=[...body.querySelectorAll('tr')].filter(row=>{
            const first=row.querySelector('td');
            return first?.querySelector('b')?.textContent?.trim()===String(p.dispatchNo||'');
          });
          if(!matches.length)continue;
          const first=matches[0];
          matches.slice(1).forEach(row=>row.remove());
          const allQty=group.reduce((n,x)=>n+Number(x.d.qty||0),0);
          const total=sharedTotal(group);
          const consistent=Math.abs(total-allQty)<eps;
          const g=recordedGRN(key);
          const cols=first.querySelectorAll('td');
          if(cols.length<5)continue;
          cols[0].innerHTML=`<b>${esc(p.dispatchNo||'')}</b><div class="small">Shared batch · ${group.length} production orders</div><div class="small">${esc(group.map(x=>x.r.orderNo||'').join(', '))}</div>`;
          cols[1].innerHTML=`<b>${esc(lead.r.size||'')} · ${esc(lead.r.material||'')}</b><div class="small">One physical dispatch across source jobs</div>`;
          cols[2].innerHTML=`<b>${money(total)} Rolls</b><div class="small">${(p.sharedBatchBoxes||p.boxes||[]).length} physical cartons • ${money(p.sharedBatchLoose??0)} loose<br>${esc(p.date||'')} • ${esc(p.carrier||'')}</div>`;
          cols[3].innerHTML=g?`<b>${esc(g.grnNo)}</b><div class="${Math.abs(Number(g.variance||0))<eps?'grn-ok':'grn-bad'}">Received ${money(g.receivedQty)} • Variance ${money(g.variance)}</div><div class="small">${esc(g.varianceStatus||'')}</div>`:'<span class="tag amber">Awaiting Stores Count</span>';
          cols[4].innerHTML=`<button class="btn ghost sm" onclick="downloadDispatchPDFV81('${esc(p.id)}')">Dispatch PDF</button> `+
            (!consistent?'<span class="tag amber">Source allocations mismatch — review before receiving</span>':
            !g?`<button class="btn primary sm" onclick="openReceiveDispatchV81('${esc(p.id)}')">Receive / Count</button>`:
            g.variance&&!g.factoryReason&&(currentUser?.role==='admin'||hasPerm('production_manage'))?`<button class="btn red sm" onclick="saveFactoryVarianceV81('${esc(g.id)}')">Factory Reason</button>`:
            g.variance&&!g.factoryReason?'<span class="tag amber">Reason pending</span>':'<span class="tag" style="background:#dcf8ec;color:#08734c;font-weight:800">Transferred to Finance</span>');
        }
        return result;
      };
      try{renderStoresQueueV8=window.renderStoresQueueV8}catch(_){}
    }
    const baseOpen=window.openReceiveDispatchV81;
    if(typeof baseOpen==='function'){
      window.openReceiveDispatchV81=function(id){
        const found=lookupByDispatchId(id);
        if(!found)return baseOpen.apply(this,arguments);
        if(recordedGRN(found.key))return toast('This physical dispatch has already been received by Stores.');
        const qty=sharedTotal(found.group);
        const allocated=found.group.reduce((n,x)=>n+Number(x.d.qty||0),0);
        if(Math.abs(qty-allocated)>eps)return toast('Source allocations do not reconcile with the shared dispatch total.');
        const result=baseOpen.call(this,found.entry.d.id);
        $('receivedQty').value=String(qty);
        $('receiveMeta').innerHTML=`<b>${esc(found.entry.d.dispatchNo)}</b> • Shared physical packing dispatch<br>${found.group.length} source jobs • Factory loaded ${money(qty)} rolls`;
        $('receiveModal').dataset.sharedDispatchGroup=found.key;
        const v=Number($('receivedQty').value||0)-qty;
        $('varianceResult').innerHTML=`<span class="${Math.abs(v)<eps?'grn-ok':'grn-bad'}">${Math.abs(v)<eps?'COUNT MATCHED':'VARIANCE'} — ${money(v)} ROLLS</span>`;
        return result;
      };
      try{openReceiveDispatchV81=window.openReceiveDispatchV81}catch(_){}
    }
    const baseVariance=window.updateVarianceV81;
    if(typeof baseVariance==='function'){
      window.updateVarianceV81=function(){
        const key=$('receiveModal')?.dataset.sharedDispatchGroup;
        if(!key)return baseVariance.apply(this,arguments);
        const group=sharedEntries().get(key);
        if(!group)return baseVariance.apply(this,arguments);
        const qty=sharedTotal(group),received=Number($('receivedQty')?.value||0),diff=received-qty;
        $('varianceResult').innerHTML=Math.abs(diff)<eps?`<span class="grn-ok">COUNT MATCHED — ${money(received)} ROLLS</span>`:`<span class="grn-bad">${diff<0?'SHORTAGE':'EXCESS'}: ${money(Math.abs(diff))} ROLLS</span>`;
      };
      try{updateVarianceV81=window.updateVarianceV81}catch(_){}
    }
    const baseSave=window.saveGRNV8;
    if(typeof baseSave==='function'){
      window.saveGRNV8=function(){
        const modal=$('receiveModal'),key=modal?.dataset.sharedDispatchGroup;
        if(!key)return baseSave.apply(this,arguments);
        const group=sharedEntries().get(key);if(!group)return toast('Shared dispatch group no longer exists.');
        if(recordedGRN(key))return toast('This dispatch has already been received. Duplicate GRN blocked.');
        if(typeof currentUserPasswordOKV82==='function'&&!currentUserPasswordOKV82('save the stores receiving count / GRN'))return;
        const lead=primary(group),d=lead.d,r=lead.r;
        const loaded=sharedTotal(group),sum=group.reduce((n,e)=>n+Number(e.d.qty||0),0);
        const received=Number($('receivedQty').value),variance=received-loaded,reason=$('varianceReason').value.trim();
        if(!Number.isFinite(received)||received<0)return toast('Enter a valid physical Stores count.');
        if(Math.abs(loaded-sum)>eps)return toast('Shared source-job allocation mismatch. GRN not created.');
        if(Math.abs(variance)>eps&&!reason)return toast('Variance reason is required for a differing Stores count.');
        const g={id:uid('grn'),grnNo:nextGRNV8(),dispatchId:d.id,dispatchNo:d.dispatchNo,requestId:r.id,orderNo:r.orderNo,piId:r.piId,piSerial:r.piSerial,customerName:r.customerName,item:`${r.size} / ${r.material} / ${r.layout} / ${r.pcs} pcs`,unit:'Rolls',boxes:d.sharedBatchBoxes||d.boxes,dispatchedQty:loaded,receivedQty:received,variance,storesReason:reason,factoryReason:'',varianceStatus:Math.abs(variance)<eps?'Matched':'Factory Explanation Pending',date:$('receivedDate').value||today(),countedBy:$('countedBy').value.trim(),receivedFrom:$('receivedFrom').value.trim(),createdBy:currentUser.display,createdByUser:currentUser.username,createdAt:new Date().toISOString(),sharedBatchDispatchId:key,sharedBatchJobs:group.map(x=>({requestId:x.r.id,orderNo:x.r.orderNo,dispatchedQty:x.d.qty,dispatchId:x.d.id}))};
        state.grns.unshift(g);
        for(const e of group){
          const j=e.r;
          // Preserve finished balance when a job has other, undispatched rolls.
          if(productionAvailableV81(j)<eps)j.status='Received';
          j.grnId=g.id;
          j.history=j.history||[];
          j.history.push({status:'Received',note:`Shared GRN ${g.grnNo}; ${d.dispatchNo}; allocated ${e.d.qty} rolls`,by:currentUser.display,at:g.createdAt});
          notifyV8(j.ownerUser,'Stores Count Completed',`${g.grnNo} shared batch: ${money(received)} physically received across ${group.length} jobs.`,j.id);
        }
        if(Math.abs(variance)>eps)notifyV8(d.byUser,'Factory Variance Explanation Required',`${g.grnNo}: ${money(variance)} rolls variance`,r.id);
        audit('CREATE_SHARED_DISPATCH_GRN',`${g.grnNo} ${d.dispatchNo} loaded ${loaded} received ${received}`);
        saveState();closeModal('receiveModal');delete modal.dataset.sharedDispatchGroup;delete modal.dataset.dispatchId;
        renderStoresQueueV8();renderProductionBoard();
        toast('One Stores GRN saved for the shared physical dispatch.');
      };
      try{saveGRNV8=window.saveGRNV8}catch(_){}
    }
    try{renderStoresQueueV8()}catch(e){console.warn('Shared Stores initial render',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
