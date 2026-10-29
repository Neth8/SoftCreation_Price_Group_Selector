
/* =========================================================
   V1.0.40 - Approved Price add-to-quotation actions
             + grouped Products factory count / QC workflow
   ========================================================= */
(function(){
  'use strict';

  /* -------------------------------------------------------
     Approved Prices: make device / ribbon / paper actions
     explicit. Existing bpAddMaster() remains the data path.
     ------------------------------------------------------- */
  function relabelApprovedMasterButtonsV1040(){
    const portal=$('branchportal');
    if(!portal)return;
    portal.querySelectorAll('#bpDevices button[onclick*="bpAddMaster"], #bpProducts button[onclick*="bpAddMaster"]').forEach(btn=>{
      const raw=String(btn.textContent||'').trim();
      if(!/^\+\s*Add to Quotation/i.test(raw)){
        btn.textContent='+ Add to Quotation — '+raw;
        btn.classList.remove('ghost');
        btn.classList.add('primary');
      }
      btn.title='Add this approved item to the quotation request';
    });
  }
  window.relabelApprovedMasterButtonsV1040=relabelApprovedMasterButtonsV1040;

  const bpDevicesV1040=$('bpDevices'),bpProductsV1040=$('bpProducts');
  const masterObserverV1040=new MutationObserver(()=>relabelApprovedMasterButtonsV1040());
  if(bpDevicesV1040)masterObserverV1040.observe(bpDevicesV1040,{childList:true,subtree:true});
  if(bpProductsV1040)masterObserverV1040.observe(bpProductsV1040,{childList:true,subtree:true});
  relabelApprovedMasterButtonsV1040();

  /* -------------------------------------------------------
     Products: grouped factory batch follows the same guarded
     production flow as an individual production job:
       Requested/Approved/Planned -> In Production
       -> mandatory batch packing/count -> QC Check
       -> QC approval -> Finished
     ------------------------------------------------------- */
  const ACTIVE_V1040=new Set(['Requested','Approved','Planned','In Production','QC Check']);
  const FLOW_V1040=['Requested','Approved','Planned','In Production','QC Check','Finished'];

  function idxV1040(s){
    const i=FLOW_V1040.indexOf(String(s||''));
    return i<0?999:i;
  }
  function activeBatchJobsV1040(g){
    return (g?.jobs||[]).filter(r=>ACTIVE_V1040.has(String(r.status||'Requested')));
  }
  function groupByKeyV1040(encodedKey){
    const key=decodeURIComponent(encodedKey);
    return productionProductGroupsV103().find(x=>x.key===key)||null;
  }
  function commonV1040(jobs,key,fallback=''){
    const vals=[...new Set(jobs.map(r=>String(r?.[key]??fallback)))];
    return vals.length===1?vals[0]:'';
  }
  function batchStatusV1040(jobs){
    const vals=[...new Set(jobs.map(r=>String(r.status||'Requested')))];
    return vals.length===1?vals[0]:'';
  }
  function passwordOKV1040(action){
    if(typeof currentUserPasswordOKV82==='function')return currentUserPasswordOKV82(action);
    return true;
  }
  function batchPackingSnapshotV1040(jobs){
    for(const r of jobs){
      if(r?.batchPackingV1040 && Number(r.batchPackingV1040.total)>0)return r.batchPackingV1040;
    }
    return null;
  }

  if(!document.getElementById('v1040ScopedStyles')){
    const st=document.createElement('style');
    st.id='v1040ScopedStyles';
    st.textContent=`
      #productionProductDetailModal .factory-flow-v1040{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}
      #productionProductDetailModal .factory-step-v1040{padding:6px 9px;border-radius:999px;background:#edf3f5;color:#5e6e76;font-size:9px;font-weight:900}
      #productionProductDetailModal .factory-step-v1040.active{background:#dff5f2;color:#087f83;border:1px solid #a8deda}
      #productionProductDetailModal .factory-step-v1040.done{background:#e5f6ea;color:#147244}
      #productionProductDetailModal .factory-qc-note-v1040{margin:10px 0;padding:9px 11px;border-radius:10px;background:#fff7dd;color:#78580b;border:1px solid #eed795;font-size:10px;line-height:1.45}
      #branchportal #bpDevices .actions,#branchportal #bpProducts .actions{align-items:center}
    `;
    document.head.appendChild(st);
  }

  function flowPillsV1040(status){
    const cur=idxV1040(status);
    return `<div class="factory-flow-v1040">${['Requested','In Production','QC Check','Finished'].map(s=>{
      const si=idxV1040(s);
      return `<span class="factory-step-v1040 ${si<cur?'done':si===cur?'active':''}">${esc(s)}</span>`;
    }).join('')}</div>`;
  }

  window.openProductionProductDetailsV103=function(encodedKey){
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage'))return requirePerm('production_manage','manage factory production');
    const g=groupByKeyV1040(encodedKey);if(!g)return;
    const jobs=activeBatchJobsV1040(g);
    if(!jobs.length)return toast('No active production jobs for this product');

    const totalQty=jobs.reduce((n,r)=>n+Number(r.requestQty||0),0);
    const jbrAllocated=Math.min(totalQty,Math.max(0,Number(window.jbrCutForProductV1121?.(g.key)||0)));
    const remainingQty=Math.max(0,totalQty-jbrAllocated);
    const jobBalances=typeof window.jbrJobBalancesV1121==='function'
      ? window.jbrJobBalancesV1121(g.key,jobs)
      : jobs.map(r=>({job:r,original:Number(r.requestQty||0),allocated:0,remaining:Number(r.requestQty||0)}));
    const status=batchStatusV1040(jobs);
    const maxFlow=Math.max(...jobs.map(r=>idxV1040(r.status)));
    const minFlow=Math.min(...jobs.map(r=>idxV1040(r.status)));
    const date=commonV1040(jobs,'needDate','');
    const shift=commonV1040(jobs,'shift','');
    const priority=commonV1040(jobs,'priority','');
    const note=commonV1040(jobs,'lastNote','');
    const allQC=jobs.every(r=>r.status==='QC Check');
    const anyQC=jobs.some(r=>r.status==='QC Check');
    const allAtLeastInProduction=jobs.every(r=>idxV1040(r.status)>=idxV1040('In Production'));
    const savedPacking=batchPackingSnapshotV1040(jobs);

    /* QC Check and Finished are never chosen directly here. */
    const statusOptions=['Requested','Approved','Planned','In Production']
      .filter(s=>idxV1040(s)>=Math.min(maxFlow,idxV1040('In Production')));

    $('productionProductDetailMeta').textContent=`${g.size} • ${g.material} • ${g.layout} • ${money(g.pcs)} pcs / ${g.unit}`;
    $('productionProductDetailBody').innerHTML=`
      <div class="pp-detail-spec">
        <b>Factory Batch — ${esc(g.size)} / ${esc(g.material)}</b>
        <div class="small">${esc(g.layout)} • ${money(g.pcs)} pcs / ${esc(g.unit==='Rolls'?'roll':g.unit)} • ${jobs.length} source job${jobs.length===1?'':'s'} combined • Original ${money(totalQty)} ${esc(g.unit)} • JBR Cut ${money(jbrAllocated)} • Still To Cut ${money(remainingQty)}</div>
      </div>
      ${flowPillsV1040(status||jobs.reduce((a,r)=>idxV1040(r.status)>idxV1040(a)?r.status:a,'Requested'))}
      <div class="notice" style="margin:10px 0"><b>Combined factory control:</b> one update is written to all ${jobs.length} source production jobs. Productions Summary continues to show them separately.</div>
      ${anyQC?`<div class="factory-qc-note-v1040"><b>QC stage:</b> QC Check / Finished cannot be selected manually. Use the packing/QC action below so count and QC approval are recorded correctly.${savedPacking?` Saved batch count: <b>${money(savedPacking.total)} ${esc(g.unit)}</b>.`:''}</div>`:''}
      <div class="grid">
        <div class="field"><label>Status</label>
          ${allQC
            ? `<input value="QC Check" disabled><div class="hint">Use Approve QC & Finish below.</div>`
            : `<select id="batchProdStatusV1038">${status&&statusOptions.includes(status)?'':`<option value="" selected>${minFlow!==maxFlow?'Mixed statuses — choose next status':'Keep current status'}</option>`}${statusOptions.map(s=>`<option value="${esc(s)}" ${status===s?'selected':''}>${esc(s)}</option>`).join('')}</select><div class="hint">QC Check requires a saved production count. Finished requires QC approval.</div>`}
        </div>
        <div class="field"><label>Planned / Need Date</label><input id="batchProdDateV1038" type="date" value="${esc(date)}"><div class="hint">Blank means keep each job's existing date.</div></div>
        <div class="field"><label>Shift</label><select id="batchProdShiftV1038"><option value="" ${!shift?'selected':''}>Keep / Mixed</option><option value="day" ${shift==='day'?'selected':''}>Day Shift</option><option value="night" ${shift==='night'?'selected':''}>Night Shift</option></select></div>
        <div class="field"><label>Priority</label><select id="batchProdPriorityV1038"><option value="" ${!priority?'selected':''}>Keep / Mixed</option><option value="normal" ${priority==='normal'?'selected':''}>Normal</option><option value="urgent" ${priority==='urgent'?'selected':''}>Urgent</option></select></div>
        <div class="field full"><label>Production / QC Note</label><textarea id="batchProdNoteV1038" placeholder="This note will be added to every source job">${esc(note)}</textarea></div>
      </div>
      <div class="prod-summary-note"><b>${jobs.length} source jobs remain separate:</b> ${jobBalances.map(x=>`${esc(x.job.orderNo)} (Original ${money(x.original)} → JBR Cut ${money(x.allocated)} → Remaining ${money(x.remaining)} ${esc(x.job.unit||g.unit)})`).join(' • ')}</div>
      <div class="actions">
        ${!allQC?`<button class="btn primary" onclick="saveGroupedFactoryBatchV1038('${encodeURIComponent(g.key)}')">Save Batch Update</button>`:''}
        ${allAtLeastInProduction
          ? `<button class="btn amber" onclick="openGroupedPackingV1040('${encodeURIComponent(g.key)}')">${allQC?'Review Count & Approve QC':'Packing Count & Send to QC Check'}</button>`
          : ''}
        <button class="btn ghost" onclick="closeModal('productionProductDetailModal')">Cancel</button>
      </div>`;
    $('productionProductDetailModal').classList.add('show');
  };
  try{openProductionProductDetailsV103=window.openProductionProductDetailsV103}catch(_){}

  window.saveGroupedFactoryBatchV1038=function(encodedKey){
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage'))return requirePerm('production_manage','manage factory production');
    const g=groupByKeyV1040(encodedKey);if(!g)return;
    const jobs=activeBatchJobsV1040(g);
    if(!jobs.length)return toast('No active production jobs to update');

    const next=$('batchProdStatusV1038')?.value||'';
    const date=$('batchProdDateV1038')?.value||'';
    const shift=$('batchProdShiftV1038')?.value||'';
    const priority=$('batchProdPriorityV1038')?.value||'';
    const note=String($('batchProdNoteV1038')?.value||'').trim();

    if(next==='QC Check')return toast('Use Packing Count & Send to QC Check');
    if(next==='Finished')return toast('Finished requires QC approval');
    if(jobs.some(r=>r.status==='QC Check')&&next)return toast('Batch is already in QC Check. Use Review Count & Approve QC');
    if(!next&&!date&&!shift&&!priority&&!note)return toast('Choose a batch update first');

    if(next){
      for(const r of jobs){
        if(idxV1040(next)<idxV1040(r.status))return toast(`Cannot move ${r.orderNo} backward from ${r.status}`);
      }
    }
    if(!passwordOKV1040('save the grouped production status update'))return;

    const now=new Date().toISOString();
    for(const r of jobs){
      const old=r.status;
      if(next)r.status=next;
      if(date)r.needDate=date;
      if(shift)r.shift=shift;
      if(priority)r.priority=priority;
      if(note)r.lastNote=note;
      r._spgsUpdatedAt=now;
      r.history=r.history||[];
      r.history.push({
        status:r.status,
        note:note||`Grouped factory batch update (${jobs.length} source jobs)`,
        by:currentUser.display,username:currentUser.username,at:now,
        batchProductKey:g.key,batchJobCount:jobs.length
      });
      if(typeof audit==='function')audit('PRODUCTION_BATCH_UPDATE',`${r.orderNo}: ${old} → ${r.status} | batch ${g.size}/${g.material}/${g.layout}/${g.pcs}`);
    }
    saveState();
    try{renderProductionProducts()}catch(_){}
    try{renderProductionBoard()}catch(_){}
    closeModal('productionProductDetailModal');
    toast(`Batch update applied to ${jobs.length} production job${jobs.length===1?'':'s'}`);
  };

  window.openGroupedPackingV1040=function(encodedKey){
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage'))return requirePerm('production_manage','manage factory production');
    const g=groupByKeyV1040(encodedKey);if(!g)return;
    const jobs=activeBatchJobsV1040(g);
    if(!jobs.length)return toast('No active production jobs');
    if(jobs.some(r=>idxV1040(r.status)<idxV1040('In Production')))return toast('Move the full batch to In Production before entering the production count');

    const allQC=jobs.every(r=>r.status==='QC Check');
    const saved=batchPackingSnapshotV1040(jobs);

    /* Reuse the established packing UI, but save as one grouped batch. */
    try{openPackingV81(jobs[0].id)}catch(_){}
    if(!$('packingModal')?.classList.contains('show'))return;
    $('packingReqId').value='BATCHV1040::'+encodeURIComponent(g.key);
    $('packingMeta').textContent=`Factory Batch • ${g.size} • ${g.material} • ${g.layout} • ${money(g.pcs)} pcs/roll • ${jobs.length} source jobs • Requested ${money(jobs.reduce((n,r)=>n+Number(r.requestQty||0),0))} ${g.unit}`;

    if(saved){
      try{$('packBoxRows').innerHTML=boxRowsV81(saved.boxes||[],'pack')}catch(_){}
      if($('packLoose'))$('packLoose').value=Number(saved.loose||0);
      if($('packQC'))$('packQC').value=saved.qc||'Passed';
      if($('packNote'))$('packNote').value=saved.note||'';
      try{updatePackGrandV81()}catch(_){}
    }else{
      if($('packBoxRows'))$('packBoxRows').innerHTML='';
      try{addBoxRowV81('pack')}catch(_){}
      if($('packLoose'))$('packLoose').value=0;
      if($('packQC'))$('packQC').value='Passed';
      if($('packNote'))$('packNote').value='';
      try{updatePackGrandV81()}catch(_){}
    }

    const packingModalV1120=$('packingModal');
    if(packingModalV1120){
      packingModalV1120.dataset.savedActualReceivedV1120=saved
        ? String(Number(saved.actualReceivedRolls??saved.actualReceived??saved.total??0))
        : '';
    }

    const notice=$('packingModal').querySelector('.notice');
    if(notice)notice.innerHTML='<b>Final Packing Count:</b> enter the physical cartons and loose rolls received from production. If QC is Passed, one save finishes the batch and makes it Dispatch Ready. Use Hold / Recheck only when the batch must remain in QC.';
    const btn=$('packingModal').querySelector('button[onclick="savePackingV81()"]');
    if(btn)btn.textContent='Save Packing & Make Dispatch Ready';
    closeModal('productionProductDetailModal');
  };

  /* Allocate one combined actual count back to the separate source jobs
     proportionally to each requested quantity. The allocations sum exactly
     to the entered batch total. */
  function allocationsV1040(jobs,total){
    const reqTotal=jobs.reduce((n,r)=>n+Math.max(0,Number(r.requestQty||0)),0);
    let used=0;
    return jobs.map((r,i)=>{
      let qty;
      if(i===jobs.length-1)qty=Math.max(0,total-used);
      else{
        qty=reqTotal>0?Math.round((total*(Number(r.requestQty||0)/reqTotal))*100)/100:Math.round((total/jobs.length)*100)/100;
        used+=qty;
      }
      return {r,qty};
    });
  }

  const baseSavePackingV1040=window.savePackingV81||savePackingV81;
  window.savePackingV81=async function(){
    const marker=$('packingReqId')?.value||'';
    if(!marker.startsWith('BATCHV1040::'))return baseSavePackingV1040.apply(this,arguments);

    const encodedKey=marker.slice('BATCHV1040::'.length);
    const g=groupByKeyV1040(encodedKey);if(!g)return toast('Factory batch was not found');
    const jobs=activeBatchJobsV1040(g);
    if(!jobs.length)return toast('No active production jobs');
    if(jobs.some(r=>idxV1040(r.status)<idxV1040('In Production')))return toast('All source jobs must be In Production before packing');

    const boxes=readBoxesV81('pack');
    const loose=Number($('packLoose')?.value||0);
    const total=boxesTotalV81(boxes)+loose;
    const qc=$('packQC')?.value||'Passed';
    const note=String($('packNote')?.value||'').trim();
    if(!(total>0))return toast('Box / roll count is mandatory before finishing packing');
    if(!boxes.length&&!(loose>0))return toast('Enter at least one box count or loose-roll count');

    const finishing=qc!=='Hold / Recheck';
    if(!passwordOKV1040(finishing?'save packing and finish the batch':'save packing as Hold / Recheck'))return;

    const core=(typeof window.packingCoreCalcV1057==='function')
      ? window.packingCoreCalcV1057(total,g)
      : {rollWidthMm:0,coreStickLengthMm:1000,coreMmUsed:0,coreEquivalent:0,coreSticksRequired:0,coreBalanceMm:0};

    /* V1.1.22: a successful packing save is the final production/QC count.
       Cloud snapshot is therefore saved as the approval/final stage in one pass. */
    if(typeof window.savePackingCloudSnapshotV1057==='function'){
      const dbSaved=await window.savePackingCloudSnapshotV1057({
        g,jobs,boxes,loose,total,qc,note,allQC:finishing,core
      });
      if(!dbSaved)return;
    }

    const now=new Date().toISOString();
    const packModalV1120=$('packingModal');
    const plannedJbrRollsV1120=Math.max(0,Number(packModalV1120?.dataset.jbrPlannedRolls||0));
    const theoreticalMaxRollsV1120=Math.max(0,Number(packModalV1120?.dataset.jbrMaxRolls||plannedJbrRollsV1120));
    const actualReceivedRollsV1120=Math.max(0,Number($('packActualReceivedV1120')?.value||total));
    const productionVarianceRollsV1120=actualReceivedRollsV1120-plannedJbrRollsV1120;
    const alloc=allocationsV1040(jobs,total);
    const snapshot={
      boxes:boxes.map(b=>({...b})),loose,total,qc,note,
      actualReceivedRolls:actualReceivedRollsV1120,
      plannedJbrRolls:plannedJbrRollsV1120,
      theoreticalMaxRolls:theoreticalMaxRollsV1120,
      productionVarianceRolls:productionVarianceRollsV1120,
      productionShortageRolls:Math.max(0,-productionVarianceRollsV1120),
      productionOverRolls:Math.max(0,productionVarianceRollsV1120),
      packingWasteRolls:Math.max(0,actualReceivedRollsV1120-total),
      productKey:g.key,
      sourceJobIds:jobs.map(r=>r.id),
      packedBy:currentUser.display,
      packedAt:now,
      lastCheckedBy:currentUser.display,
      lastCheckedAt:now,
      rollWidthMm:core.rollWidthMm,
      coreStickLengthMm:core.coreStickLengthMm,
      coreMmUsed:core.coreMmUsed,
      coreEquivalent:core.coreEquivalent,
      coreSticksRequired:core.coreSticksRequired,
      coreBalanceMm:core.coreBalanceMm
    };

    if(!finishing){
      for(const {r,qty} of alloc){
        r.batchPackingV1040=snapshot;
        r.packing=jobs.length===1
          ? {boxes:boxes.map(b=>({...b})),loose,total,qc,note,packedBy:currentUser.display,packedAt:now,batchProductKey:g.key,batchTotal:total}
          : {boxes:[{boxNo:'BATCH',rolls:qty,note:'Allocated from grouped factory batch'}],loose:0,total:qty,qc,note,packedBy:currentUser.display,packedAt:now,batchProductKey:g.key,batchTotal:total,sharedBatchPacking:snapshot};
        r.finishedQty=qty;
        r.status='QC Check';
        r.lastNote=note||'QC Hold / Recheck';
        r._spgsUpdatedAt=now;
        r.history=r.history||[];
        r.history.push({status:'QC Check',note:`PACKING HOLD / RECHECK: ${note||'Quality recheck required'} • ${boxes.length} boxes + ${loose} loose • total ${total} ${g.unit}`,by:currentUser.display,username:currentUser.username,at:now,batchProductKey:g.key});
        if(typeof audit==='function')audit('PACKING_BATCH_HOLD',`${r.orderNo} | batch ${g.size}/${g.material} | allocated ${qty}`);
      }
      saveState();closeModal('packingModal');renderProductionProducts();renderProductionBoard();
      toast('Packing hold saved. Batch remains in QC Check');return;
    }

    /* One-pass packing -> Finished / Dispatch Ready. */
    for(const {r,qty} of alloc){
      r.batchPackingV1040=snapshot;
      /* When one source job owns the product batch, preserve the exact physical
         cartons + loose rolls so Dispatch can present them separately. */
      r.packing=jobs.length===1
        ? {boxes:boxes.map(b=>({...b})),loose,total,qc,note,packedBy:currentUser.display,packedAt:now,lastCheckedBy:currentUser.display,lastCheckedAt:now,batchProductKey:g.key,batchTotal:total}
        : {boxes:[{boxNo:'BATCH',rolls:qty,note:'Allocated from grouped factory batch'}],loose:0,total:qty,qc,note,packedBy:currentUser.display,packedAt:now,lastCheckedBy:currentUser.display,lastCheckedAt:now,batchProductKey:g.key,batchTotal:total,sharedBatchPacking:snapshot};
      r.finishedQty=qty;
      r.status='Finished';
      r.finishedAt=now;
      r.lastNote=note;
      r._spgsUpdatedAt=now;
      r.history=r.history||[];
      r.history.push({status:'Finished',note:`PACKED & FINISHED: ${boxes.length} boxes + ${loose} loose; batch total ${total} ${g.unit}; allocated ${qty} to this job; QC ${qc}`,by:currentUser.display,username:currentUser.username,at:now,batchProductKey:g.key});
      if(typeof notifyV8==='function')notifyV8(r.ownerUser,'Production Packed / Dispatch Ready',`${r.orderNo}: ${money(qty)} ${r.unit} packed and ready for dispatch.`,r.id);
      const pi=state.docs.find(d=>d.id===r.piId);if(pi)pi.productionStatus='Part / all production finished';
      if(typeof audit==='function')audit('PACK_FINISH_BATCH_ONE_PASS',`${r.orderNo} | allocated ${qty} | batch total ${total} | ${boxes.length} boxes + ${loose} loose`);
    }

    saveState();
    closeModal('packingModal');
    try{renderProductionProducts()}catch(_){}
    try{renderProductionBoard()}catch(_){}
    try{renderStoresQueueV8()}catch(_){}
    toast(`Packing saved. ${jobs.length} source job${jobs.length===1?' is':'s are'} Finished and Dispatch Ready`);
  };
  try{savePackingV81=window.savePackingV81}catch(_){}

  /* refresh explicit Approved Price button labels whenever portal opens */
  const showViewBaseV1040=window.showView;
  if(typeof showViewBaseV1040==='function'){
    window.showView=function(id){
      const r=showViewBaseV1040.apply(this,arguments);
      if(id==='branchportal')setTimeout(relabelApprovedMasterButtonsV1040,0);
      return r;
    };
    try{showView=window.showView}catch(_){}
  }

  /* Product modal calls above replace only the grouped factory controls.
     Productions Summary stays job-wise and unchanged. */
  try{renderProductionProducts()}catch(_){}
})();
