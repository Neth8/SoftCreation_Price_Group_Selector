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
          cols[3].innerHTML=g?`<b>${esc(g.grnNo)}</b><div class="${Math.abs(Number(g.variance||0))<eps?'grn-ok':'grn-bad'}">Received ${money(g.receivedQty)} • Variance ${money(g.variance)}</div><div class="small">${esc(g.varianceStatus||'')}</div>${g.approvalStatus==='Rejected'?`<div class="small" style="color:#dc2626;font-weight:700">Reason: ${esc(g.rejectedReason||'')}</div>`:''}`:'<span class="tag amber">Awaiting Stores Count</span>';
          cols[4].innerHTML=`<button class="btn ghost sm" onclick="downloadDispatchPDFV81('${esc(p.id)}')">Dispatch PDF</button> `+
            (!consistent?'<span class="tag amber">Source allocations mismatch — review before receiving</span>':
            !g?`<button class="btn primary sm" onclick="openReceiveDispatchV81('${esc(p.id)}')">Receive / Count</button>`:
            g.approvalStatus==='Pending Manager Approval'?(
              (currentUser?.role==='admin'||currentUser?.role==='manager')?
                `<button class="btn green sm" onclick="window.managerApproveGRNV64('${esc(g.id)}')">Approve Variance</button> <button class="btn red sm" onclick="window.managerRejectGRNV64('${esc(g.id)}')">Reject Count</button>`:
                `<span class="tag amber">Pending Manager Approval</span>`
            ):
            g.approvalStatus==='Rejected'?(
              `<button class="btn primary sm" onclick="window.reopenReceiveDispatchV64('${esc(g.id)}')">Correct Count</button>`
            ):
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
        const existingGRN=recordedGRN(key);
        if(existingGRN&&existingGRN.approvalStatus!=='Rejected')return toast('This dispatch has already been received. Duplicate GRN blocked.');
        if(typeof currentUserPasswordOKV82==='function'&&!currentUserPasswordOKV82('save the stores receiving count / GRN'))return;
        const lead=primary(group),d=lead.d,r=lead.r;
        const loaded=sharedTotal(group),sum=group.reduce((n,e)=>n+Number(e.d.qty||0),0);
        const received=Number($('receivedQty').value),variance=received-loaded,reason=$('varianceReason').value.trim();
        if(!Number.isFinite(received)||received<0)return toast('Enter a valid physical Stores count.');
        if(Math.abs(loaded-sum)>eps)return toast('Shared source-job allocation mismatch. GRN not created.');
        if(Math.abs(variance)>eps&&!reason)return toast('Variance reason is required for a differing Stores count.');
        const isMatch=Math.abs(variance)<eps;
        const approvalStatus=isMatch?'Approved':'Pending Manager Approval';
        const varianceStatus=isMatch?'Matched':'Pending Manager Approval';

        let g=existingGRN;
        if(g&&g.approvalStatus==='Rejected'){
          g.receivedQty=received;
          g.variance=variance;
          g.storesReason=reason;
          g.varianceStatus=varianceStatus;
          g.approvalStatus=approvalStatus;
          delete g.rejectedReason;
          delete g.rejectedBy;
          delete g.rejectedAt;
          g.recountedBy=currentUser.display;
          g.recountedAt=new Date().toISOString();
        }else{
          g={id:uid('grn'),grnNo:nextGRNV8(),dispatchId:d.id,dispatchNo:d.dispatchNo,requestId:r.id,orderNo:r.orderNo,piId:r.piId,piSerial:r.piSerial,customerName:r.customerName,item:`${r.size} / ${r.material} / ${r.layout} / ${r.pcs} pcs`,unit:'Rolls',boxes:d.sharedBatchBoxes||d.boxes,dispatchedQty:loaded,receivedQty:received,variance,storesReason:reason,factoryReason:'',varianceStatus,approvalStatus,date:$('receivedDate').value||today(),countedBy:$('countedBy').value.trim(),receivedFrom:$('receivedFrom').value.trim(),createdBy:currentUser.display,createdByUser:currentUser.username,createdAt:new Date().toISOString(),sharedBatchDispatchId:key,sharedBatchJobs:group.map(x=>({requestId:x.r.id,orderNo:x.r.orderNo,dispatchedQty:x.d.qty,dispatchId:x.d.id}))};
          state.grns.unshift(g);
        }

        for(const e of group){
          const j=e.r;
          if(isMatch&&productionAvailableV81(j)<eps)j.status='Received';
          j.grnId=g.id;
          j.history=j.history||[];
          j.history.push({status:isMatch?'Received':'Stores Count Submitted',note:`Shared GRN ${g.grnNo}; ${d.dispatchNo}; allocated ${e.d.qty} rolls; status: ${approvalStatus}`,by:currentUser.display,at:g.createdAt});
          notifyV8(j.ownerUser,isMatch?'Stores Count Completed':'GRN Variance Pending Manager Approval',`${g.grnNo} shared batch: ${money(received)} physically received across ${group.length} jobs.${isMatch?'':' Pending manager approval.'}`,j.id);
        }
        if(!isMatch)notifyV8('admin','GRN Variance Pending Manager Approval',`${g.grnNo}: ${money(variance)} rolls variance requires manager approval.`,r.id);
        audit('CREATE_SHARED_DISPATCH_GRN',`${g.grnNo} ${d.dispatchNo} loaded ${loaded} received ${received} status ${approvalStatus}`);
        saveState();closeModal('receiveModal');delete modal.dataset.sharedDispatchGroup;delete modal.dataset.dispatchId;
        renderStoresQueueV8();renderProductionBoard();
        toast(isMatch?'One Stores GRN saved for the shared physical dispatch.':'Stores GRN saved. Flagged as Pending Manager Approval.');
      };
      try{saveGRNV8=window.saveGRNV8}catch(_){}
    }

    window.managerApproveGRNV64=function(grnId){
      const g=(state.grns||[]).find(x=>x.id===grnId);
      if(!g)return;
      if(!(currentUser?.role==='admin'||currentUser?.role==='manager'||hasPerm('production_manage'))){
        return toast('Only managers or admins can approve GRN variance.');
      }
      if(!confirm(`Approve count variance of ${money(g.variance)} rolls for ${g.grnNo}? This will finalize and transfer the GRN to Finance.`))return;
      g.approvalStatus='Approved';
      g.approvedBy=currentUser.display||currentUser.username;
      g.approvedAt=new Date().toISOString();
      g.varianceStatus='Manager Approved';

      if(g.sharedBatchJobs&&Array.isArray(g.sharedBatchJobs)){
        g.sharedBatchJobs.forEach(sj=>{
          const j=(state.productionRequests||[]).find(r=>r.id===sj.requestId);
          if(j){
            if(typeof productionAvailableV81!=='function'||productionAvailableV81(j)<eps)j.status='Received';
            j.history=j.history||[];
            j.history.push({status:'Received',note:`GRN ${g.grnNo} variance approved by ${currentUser.display}`,by:currentUser.display,at:g.approvedAt});
          }
        });
      }else if(g.requestId){
        const r=(state.productionRequests||[]).find(x=>x.id===g.requestId);
        if(r){
          if(typeof productionAvailableV81!=='function'||productionAvailableV81(r)<eps)r.status='Received';
          r.history=r.history||[];
          r.history.push({status:'Received',note:`GRN ${g.grnNo} variance approved by ${currentUser.display}`,by:currentUser.display,at:g.approvedAt});
        }
      }

      notifyV8(g.createdByUser,'GRN Variance Approved',`GRN ${g.grnNo} variance was approved by ${currentUser.display}. Transferred to Finance.`,g.requestId);
      audit('APPROVE_GRN_VARIANCE',`${g.grnNo} by ${currentUser.display}`);
      saveState();
      renderStoresQueueV8();
      renderProductionBoard();
      if(typeof renderFinanceGRNRegister==='function')renderFinanceGRNRegister();
      toast('GRN variance approved and transferred to Finance.');
    };

    window.managerRejectGRNV64=function(grnId){
      const g=(state.grns||[]).find(x=>x.id===grnId);
      if(!g)return;
      if(!(currentUser?.role==='admin'||currentUser?.role==='manager'||hasPerm('production_manage'))){
        return toast('Only managers or admins can reject GRN count.');
      }
      const reason=prompt(`Enter rejection reason for ${g.grnNo} count (mandatory):`);
      if(reason===null)return;
      if(!reason.trim())return toast('Rejection reason is mandatory.');

      g.approvalStatus='Rejected';
      g.rejectedReason=reason.trim();
      g.rejectedBy=currentUser.display||currentUser.username;
      g.rejectedAt=new Date().toISOString();
      g.varianceStatus='Rejected by Manager';

      if(g.sharedBatchJobs&&Array.isArray(g.sharedBatchJobs)){
        g.sharedBatchJobs.forEach(sj=>{
          const j=(state.productionRequests||[]).find(r=>r.id===sj.requestId);
          if(j){
            j.history=j.history||[];
            j.history.push({status:'Count Rejected',note:`GRN ${g.grnNo} count rejected by manager: ${reason.trim()}`,by:currentUser.display,at:g.rejectedAt});
          }
        });
      }else if(g.requestId){
        const r=(state.productionRequests||[]).find(x=>x.id===g.requestId);
        if(r){
          r.history=r.history||[];
          r.history.push({status:'Count Rejected',note:`GRN ${g.grnNo} count rejected by manager: ${reason.trim()}`,by:currentUser.display,at:g.rejectedAt});
        }
      }

      notifyV8(g.createdByUser,'GRN Count Rejected',`GRN ${g.grnNo} count rejected: ${reason.trim()}. Recount and correction required.`,g.requestId);
      audit('REJECT_GRN_COUNT',`${g.grnNo} by ${currentUser.display} reason: ${reason.trim()}`);
      saveState();
      renderStoresQueueV8();
      renderProductionBoard();
      toast('GRN count rejected. Stores user can now recount and correct.');
    };

    window.reopenReceiveDispatchV64=function(grnId){
      const g=(state.grns||[]).find(x=>x.id===grnId);
      if(!g)return;
      if(g.sharedBatchDispatchId){
        const targetId=g.dispatchId||(g.sharedBatchJobs?.[0]?.dispatchId);
        if(typeof openReceiveDispatchV81==='function')openReceiveDispatchV81(targetId);
      }else if(g.dispatchId){
        if(typeof openReceiveDispatchV81==='function')openReceiveDispatchV81(g.dispatchId);
      }else if(g.requestId){
        if(typeof openReceiveV8==='function')openReceiveV8(g.requestId);
      }
      if($('receivedQty'))$('receivedQty').value=g.receivedQty||0;
      if($('varianceReason'))$('varianceReason').value=g.storesReason||g.reason||'';
      if(typeof updateVarianceV81==='function')updateVarianceV81();
      toast('Recount and correct your figures, then save to resubmit.');
    };
    window.reopenReceiveV8=window.reopenReceiveDispatchV64;

    try{renderStoresQueueV8()}catch(e){console.warn('Shared Stores initial render',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
