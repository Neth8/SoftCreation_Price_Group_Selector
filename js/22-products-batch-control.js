
/* =========================================================
   V1.0.38 - Products = grouped factory batch control
             Productions Summary = individual source jobs
   ========================================================= */
(function(){
  'use strict';

  const ACTIVE_FACTORY_STATUSES_V1038=new Set(['Requested','Approved','Planned','In Production','QC Check']);
  const FACTORY_FLOW_V1038=['Requested','Approved','Planned','In Production','QC Check','Finished'];

  function factoryFlowIndexV1038(s){
    const i=FACTORY_FLOW_V1038.indexOf(String(s||''));
    return i<0?999:i;
  }

  function batchActivityV1038(r){
    if(typeof productionProductUpdatedAtV103==='function')return productionProductUpdatedAtV103(r);
    const hist=Array.isArray(r?.history)?r.history:[];
    const h=hist.reduce((m,x)=>Math.max(m,Date.parse(x?.at||0)||0),0);
    return Math.max(Date.parse(r?._spgsUpdatedAt||0)||0,Date.parse(r?.updatedAt||0)||0,h,Date.parse(r?.createdAt||0)||0);
  }

  /* Remove the extra Production workspace introduced by v1.0.36.
     Products is now the only factory grouped workspace. */
  document.querySelector('.navbtn[data-view="productionwork"]')?.remove();
  $('productionwork')?.remove();
  $('productionWorkModal')?.remove();

  const productsNav=document.querySelector('.navbtn[data-view="productionproducts"]');
  if(productsNav)productsNav.textContent='Products';

  /* Keep Productions Summary as the individual-job screen and restore View. */
  let summaryPageV1038=1;
  let summarySigV1038='';
  const SUMMARY_PAGE_SIZE_V1038=12;

  window.productionSummaryPageV1038=function(page){
    summaryPageV1038=Math.max(1,Number(page)||1);
    renderProductionBoard();
  };

  window.renderProductionBoard=function(){
    if(!$('prodBoard'))return;
    if(typeof renderProductionNotificationsV8==='function')renderProductionNotificationsV8();
    const q=String($('prodSearch')?.value||'').trim().toLowerCase();
    const f=$('prodStatusFilter')?.value||'';
    const sig=q+'|'+f;
    if(sig!==summarySigV1038){summarySigV1038=sig;summaryPageV1038=1}

    let all=(state.productionRequests||[])
      .filter(productionVisibleV8)
      .filter(r=>(!f||r.status===f)&&[r.orderNo,r.piSerial,r.customerName,r.size,r.material,r.layout,r.pcs].join(' ').toLowerCase().includes(q))
      .sort((a,b)=>batchActivityV1038(b)-batchActivityV1038(a));

    const count=s=>all.filter(x=>x.status===s).length;
    if($('prodKpis'))$('prodKpis').innerHTML=[
      ['Total',all.length],['Requested',count('Requested')],['In Production',count('In Production')],['Finished',count('Finished')],['Dispatched',count('Dispatched')]
    ].map(x=>`<div class="prod-kpi"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');

    const pages=Math.max(1,Math.ceil(all.length/SUMMARY_PAGE_SIZE_V1038));
    if(summaryPageV1038>pages)summaryPageV1038=pages;
    const start=(summaryPageV1038-1)*SUMMARY_PAGE_SIZE_V1038;
    const pageRows=all.slice(start,start+SUMMARY_PAGE_SIZE_V1038);
    const groups=[
      ['New / Planned',['Requested','Approved','Planned']],
      ['Production',['In Production']],
      ['QC / Finished',['QC Check','Finished']],
      ['Logistics',['Dispatched','Received','GRN Closed']]
    ];

    $('prodBoard').innerHTML=groups.map(([title,statuses])=>`<div class="prod-col"><h4>${title}</h4>${pageRows.filter(r=>statuses.includes(r.status)).map(r=>productionCardV8(r)).join('')||'<div class="empty">No jobs on this page</div>'}</div>`).join('');

    const pager=$('prodPagination');
    if(pager) pager.innerHTML=all.length?`<div class="sc-page-info">Jobs ${start+1}-${Math.min(start+pageRows.length,all.length)} of ${all.length}</div><div class="sc-page-actions"><button class="btn ghost sm" ${summaryPageV1038<=1?'disabled':''} onclick="productionSummaryPageV1038(${summaryPageV1038-1})">← Previous</button><span>Page <b>${summaryPageV1038}</b> / ${pages}</span><button class="btn ghost sm" ${summaryPageV1038>=pages?'disabled':''} onclick="productionSummaryPageV1038(${summaryPageV1038+1})">Next →</button></div>`:'';
  };

  function activeJobsForGroupV1038(g){
    return (g?.jobs||[])
      .filter(r=>ACTIVE_FACTORY_STATUSES_V1038.has(String(r.status||'Requested')))
      .sort((a,b)=>{
        const pa=a.priority==='urgent'?0:1,pb=b.priority==='urgent'?0:1;
        if(pa!==pb)return pa-pb;
        const da=Date.parse(a.needDate||'')||Infinity,db=Date.parse(b.needDate||'')||Infinity;
        if(da!==db)return da-db;
        return (Date.parse(a.createdAt||0)||0)-(Date.parse(b.createdAt||0)||0);
      });
  }

  function commonValueV1038(jobs,key,fallback=''){
    if(!jobs.length)return fallback;
    const vals=[...new Set(jobs.map(r=>String(r?.[key]??fallback)))];
    return vals.length===1?vals[0]:'';
  }

  function batchStatusV1038(jobs){
    if(!jobs.length)return '';
    const vals=[...new Set(jobs.map(r=>String(r.status||'Requested')))];
    return vals.length===1?vals[0]:'';
  }

  function renderGroupedFactoryProductsV1038(){
    const grid=$('productionProductsGrid');if(!grid)return;
    if(currentUser?.role!=='admin'&&!hasPerm('products_view')){grid.innerHTML='<div class="empty">Products access is not enabled for this user.</div>';return}
    const groups=productionProductGroupsV103();
    const materialSelect=$('productionProductsMaterial'),selected=materialSelect?.value||'';
    if(materialSelect){
      const materials=[...new Set(groups.map(g=>g.material).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
      const sig=materials.join('|');
      if(materialSelect.dataset.sig!==sig){materialSelect.innerHTML='<option value="">All materials</option>'+materials.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');materialSelect.dataset.sig=sig;if(materials.includes(selected))materialSelect.value=selected}
    }
    const q=String($('productionProductsSearch')?.value||'').trim().toLowerCase(),material=$('productionProductsMaterial')?.value||'';
    const filtered=groups.filter(g=>(!material||g.material===material)&&(!q||[g.size,g.material,g.layout,g.pcs,g.unit,g.desc,...g.jobs.map(r=>r.customerName||''),...g.jobs.map(r=>r.piSerial||'')].join(' ').toLowerCase().includes(q))).filter(g=>(g.jobs||[]).some(r=>!window.pcIsArchivedProductionJobV1130?.(r)&&!['Dispatched','Received','GRN Closed'].includes(String(r.status||''))));

    const stageQty=(g,statuses,finished=false)=>(g.jobs||[]).filter(r=>statuses.includes(String(r.status||'Requested'))).reduce((n,r)=>n+(finished?productionProductQtyV103(r,true):Math.max(0,Number(r.requestQty||0))),0);
    const totals=groups.reduce((a,g)=>{
      a.requested+=stageQty(g,['Requested']);
      a.planned+=stageQty(g,['Approved','Planned']);
      a.production+=stageQty(g,['In Production','QC Check']);
      a.finished+=stageQty(g,['Finished'],true);
      a.logistics+=stageQty(g,['Dispatched','Received','GRN Closed'],true);
      return a;
    },{requested:0,planned:0,production:0,finished:0,logistics:0});

    if($('productionProductsKpis'))$('productionProductsKpis').innerHTML=[
      ['Requested',totals.requested,'waiting to start'],
      ['Planned',totals.planned,'approved / planned'],
      ['In Production',totals.production,'production / QC'],
      ['Finished',totals.finished,'dispatch ready'],
      ['Logistics',totals.logistics,'dispatched / received']
    ].map(([k,v,n])=>`<div class="pp-kpi"><span>${k}</span><b>${money(v)}</b><div class="small">${n}</div></div>`).join('');

    const canManage=currentUser?.role==='admin'||hasPerm('production_manage');
    grid.innerHTML=filtered.length?filtered.map(g=>{
      const active=activeJobsForGroupV1038(g);
      const requestedQty=stageQty(g,['Requested']);
      const plannedQty=stageQty(g,['Approved','Planned']);
      const productionQty=stageQty(g,['In Production','QC Check']);
      const finishedQty=stageQty(g,['Finished'],true);
      const logisticsQty=stageQty(g,['Dispatched','Received','GRN Closed'],true);
      const totalRequested=(g.jobs||[]).reduce((n,r)=>n+Math.max(0,Number(r.requestQty||0)),0);
      const jbrCut=Math.max(0,Number(window.jbrCutForProductV1121?.(g.key)||0));
      const excessCut=Math.max(0,jbrCut-totalRequested);
      const remainingAgainstRequest=Math.max(0,totalRequested-jbrCut);
      const dispatchBalance=(g.jobs||[]).reduce((n,r)=>{
        if(String(r?.status||'')!=='Finished')return n;
        const produced=Math.max(0,Number(r?.finishedQty||r?.packing?.total||r?.batchPackingV1040?.total||r?.requestQty||0));
        const dispatched=(r?.dispatches||[]).reduce((s,d)=>s+Math.max(0,Number(d?.qty||0)),0);
        return n+Math.max(0,produced-dispatched);
      },0);
      const latest=g.latestUpdatedAt?new Date(g.latestUpdatedAt).toLocaleString():'-';
      const stageLabel=dispatchBalance>0 && productionQty>0
        ? 'Production active • Partial dispatch ready'
        : finishedQty>0||dispatchBalance>0
        ? 'Finished — Dispatch Ready'
        : productionQty>0
          ? 'In Production'
          : plannedQty>0
            ? 'Planned'
            : requestedQty>0
              ? 'Requested'
              : logisticsQty>0
                ? 'Logistics'
                : 'No active work';

      const actions=[];
      if(canManage&&active.length){
        actions.push(`<button class="btn primary sm" onclick="openProductionProductDetailsV103('${encodeURIComponent(g.key)}')">Open Product</button>`);
      }else if(active.length){
        actions.push('<span class="small">Production manage permission required</span>');
      }
      if(canManage&&dispatchBalance>0){
        actions.push(`<button class="btn navy sm product-dispatch-btn-v1124" onclick="openProductDispatchV1124('${encodeURIComponent(g.key)}')">Dispatch ${money(dispatchBalance)}</button>`);
      }
      if(!actions.length)actions.push(`<span class="tag">${esc(stageLabel)}</span>`);

      const cutNote=excessCut>0
        ? `<b class="pp-overcut-v1128">JBR Cut ${money(jbrCut)} • +${money(excessCut)} extra output / stock</b>`
        : `JBR Cut <b>${money(jbrCut)}</b> • Still to cut against requests <b>${money(remainingAgainstRequest)}</b>`;

      return `<div class="pp-card ${dispatchBalance>0?'dispatch-ready-v1124':''}" data-product-key="${esc(g.key)}">
        <div class="pp-card-head">
          <div><div class="pp-card-title">${esc(g.size)}</div><div class="pp-spec">${esc(g.material)} • ${esc(g.layout)} • ${money(g.pcs)} pcs / ${esc(g.unit==='Rolls'?'roll':g.unit)}</div></div>
          <span class="tag ${dispatchBalance>0?'dispatch-ready-tag-v1124':''}">${esc(stageLabel)}</span>
        </div>
        <div class="pp-flow-v1128">
          <div class="pp-flow-stage requested ${requestedQty>0?'active':''}"><span>1. Requested</span><b>${money(requestedQty)}</b><small>current jobs only</small></div>
          <div class="pp-flow-arrow-v1128">→</div>
          <div class="pp-flow-stage planned ${plannedQty>0?'active':''}"><span>2. Planned</span><b>${money(plannedQty)}</b><small>approved / planned</small></div>
          <div class="pp-flow-arrow-v1128">→</div>
          <div class="pp-flow-stage production ${productionQty>0?'active':''}"><span>3. Production</span><b>${money(productionQty)}</b><small>in production / QC</small></div>
          <div class="pp-flow-arrow-v1128">→</div>
          <div class="pp-flow-stage finished ${finishedQty>0?'active':''}"><span>4. Finished</span><b>${money(finishedQty)}</b><small>dispatch ready</small></div>
          <div class="pp-flow-arrow-v1128">→</div>
          <div class="pp-flow-stage logistics ${logisticsQty>0?'active':''}"><span>5. Logistics</span><b>${money(logisticsQty)}</b><small>dispatched / received</small></div>
        </div>
        <div class="pp-cut-strip-v1128"><span>Total requested across jobs <b>${money(totalRequested)}</b></span><span>${cutNote}</span>${dispatchBalance>0?`<span>Dispatch balance <b>${money(dispatchBalance)}</b></span>`:''}</div>
        <div class="pp-source-jobs-v20261109" style="margin:9px 0;padding:10px;border-radius:9px;background:rgba(10,100,120,.06)"><b style="font-size:12px">Production Orders (${g.jobs.length})</b><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:7px">${g.jobs.map(r=>`<span class="tag" style="font-size:11px;display:inline-flex;align-items:center;gap:6px"><b>${esc(r.orderNo||'Unnumbered')}</b> · ${esc(r.status||'Unknown')} · ${money(r.requestQty||0)} ${esc(r.unit||g.unit||'rolls')} <button type="button" class="btn sm" style="padding:1px 6px;font-size:10px;background:#087f83;color:#fff;border:none;cursor:pointer" onclick="event.stopPropagation();window.openProdOrderPrintModal('${esc(r.id)}')">Print Label</button></span>`).join('')}</div>${productionQty>0&&dispatchBalance>0?'<div class="small" style="margin-top:6px">Other jobs remain in production; dispatch is available only for completed, QC-approved packed stock.</div>':''}</div>
        <div class="pp-card-foot"><div class="pp-mini">Each job is counted in one current stage only • ${g.totalJobs} total job${g.totalJobs===1?'':'s'} • Latest: ${esc(latest)}</div>${actions.join('')}</div>
      </div>`;
    }).join(''):'<div class="empty" style="grid-column:1/-1">No matching production products.</div>';
  }

  window.renderProductionProducts=renderGroupedFactoryProductsV1038;
  try{renderProductionProducts=window.renderProductionProducts}catch(_){}

  window.openProductionProductDetailsV103=function(encodedKey){
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage'))return requirePerm('production_manage','manage factory production');
    const key=decodeURIComponent(encodedKey);
    const g=productionProductGroupsV103().find(x=>x.key===key);if(!g)return;
    const jobs=activeJobsForGroupV1038(g);
    if(!jobs.length)return toast('No active production jobs for this product');
    const totalQty=jobs.reduce((n,r)=>n+Number(r.requestQty||0),0);
    const status=batchStatusV1038(jobs);
    const date=commonValueV1038(jobs,'needDate','');
    const shift=commonValueV1038(jobs,'shift','day');
    const priority=commonValueV1038(jobs,'priority','normal');
    const note=commonValueV1038(jobs,'lastNote','');
    const maxFlow=Math.max(...jobs.map(r=>factoryFlowIndexV1038(r.status)));
    const allowed=FACTORY_FLOW_V1038.filter(s=>factoryFlowIndexV1038(s)>=Math.min(maxFlow,4));

    $('productionProductDetailMeta').textContent=`${g.size} • ${g.material} • ${g.layout} • ${money(g.pcs)} pcs / ${g.unit}`;
    $('productionProductDetailBody').innerHTML=`
      <div class="pp-detail-spec"><b>Factory Batch — ${esc(g.size)} / ${esc(g.material)}</b><div class="small">${esc(g.layout)} • ${money(g.pcs)} pcs / ${esc(g.unit==='Rolls'?'roll':g.unit)} • ${jobs.length} source job${jobs.length===1?'':'s'} combined • ${money(totalQty)} ${esc(g.unit)}</div></div>
      <div class="notice" style="margin:10px 0"><b>Combined factory control:</b> Saving here updates all ${jobs.length} underlying production jobs together. Productions Summary will still show those jobs separately.</div>
      <div class="grid">
        <div class="field"><label>Status</label><select id="batchProdStatusV1038">${status?'':`<option value="" selected>Mixed statuses — choose next status</option>`}${allowed.map(s=>`<option value="${esc(s)}" ${status===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="field"><label>Planned / Need Date</label><input id="batchProdDateV1038" type="date" value="${esc(date)}"><div class="hint">Blank means keep each job's existing date.</div></div>
        <div class="field"><label>Shift</label><select id="batchProdShiftV1038"><option value="" ${!shift?'selected':''}>Keep / Mixed</option><option value="day" ${shift==='day'?'selected':''}>Day Shift</option><option value="night" ${shift==='night'?'selected':''}>Night Shift</option></select></div>
        <div class="field"><label>Priority</label><select id="batchProdPriorityV1038"><option value="" ${!priority?'selected':''}>Keep / Mixed</option><option value="normal" ${priority==='normal'?'selected':''}>Normal</option><option value="urgent" ${priority==='urgent'?'selected':''}>Urgent</option></select></div>
        <div class="field full"><label>Production / QC Note</label><textarea id="batchProdNoteV1038" placeholder="This note will be added to every source job">${esc(note)}</textarea></div>
      </div>
      <div class="prod-summary-note"><b>${jobs.length} source jobs remain separate:</b> ${jobs.map(r=>`${esc(r.orderNo)} (${money(r.requestQty)} ${esc(r.unit||g.unit)})`).join(' • ')}</div>
      <div class="actions"><button class="btn primary" onclick="saveGroupedFactoryBatchV1038('${encodeURIComponent(g.key)}')">Save Batch Update</button><button class="btn ghost" onclick="closeModal('productionProductDetailModal')">Cancel</button></div>`;
    $('productionProductDetailModal').classList.add('show');
  };
  try{openProductionProductDetailsV103=window.openProductionProductDetailsV103}catch(_){}

  window.saveGroupedFactoryBatchV1038=function(encodedKey){
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage'))return requirePerm('production_manage','manage factory production');
    const key=decodeURIComponent(encodedKey);
    const g=productionProductGroupsV103().find(x=>x.key===key);if(!g)return;
    const jobs=activeJobsForGroupV1038(g);
    if(!jobs.length)return toast('No active production jobs to update');
    const next=$('batchProdStatusV1038')?.value||'';
    const date=$('batchProdDateV1038')?.value||'';
    const shift=$('batchProdShiftV1038')?.value||'';
    const priority=$('batchProdPriorityV1038')?.value||'';
    const note=String($('batchProdNoteV1038')?.value||'').trim();
    if(!next && !date && !shift && !priority && !note)return toast('Choose a batch update first');

    if(next){
      for(const r of jobs){
        if(factoryFlowIndexV1038(next)<factoryFlowIndexV1038(r.status))return toast(`Cannot move ${r.orderNo} backward from ${r.status}`);
      }
    }
    const now=new Date().toISOString();
    let finishedCount=0;
    for(const r of jobs){
      const old=r.status;
      if(next)r.status=next;
      if(date)r.needDate=date;
      if(shift)r.shift=shift;
      if(priority)r.priority=priority;
      if(note)r.lastNote=note;
      r._spgsUpdatedAt=now;
      r.history=r.history||[];
      r.history.push({status:r.status,note:note||`Grouped factory batch update (${jobs.length} source jobs)`,by:currentUser.display,username:currentUser.username,at:now,batchProductKey:key,batchJobCount:jobs.length});
      if(old!=='Finished'&&r.status==='Finished'){
        r.finishedQty=Number(r.requestQty||0);
        r.finishedAt=now;
        finishedCount++;
        if(typeof notifyV8==='function')notifyV8(r.ownerUser,'Production Finished',`${r.orderNo} for ${r.customerName} is finished (${money(r.requestQty)} ${r.unit}).`,r.id);
        const pi=state.docs.find(d=>d.id===r.piId);if(pi)pi.productionStatus='Part / all production finished';
      }
      if(typeof audit==='function')audit('PRODUCTION_BATCH_UPDATE',`${r.orderNo}: ${old} → ${r.status} | batch ${g.size}/${g.material}/${g.layout}/${g.pcs}`);
    }
    saveState();
    try{renderProductionProducts()}catch(_){}
    try{renderProductionBoard()}catch(_){}
    try{renderStoresQueueV8()}catch(_){}
    closeModal('productionProductDetailModal');
    toast(`Batch update applied to ${jobs.length} production job${jobs.length===1?'':'s'}`);
  };

  /* Re-title existing Products notice for factory use. */
  const productsSection=$('productionproducts');
  if(productsSection){
    const title=productsSection.querySelector('.panel-title span');if(title)title.textContent='Products — Factory Production';
    const note=productsSection.querySelector('.notice');
    if(note)note.innerHTML='Same production specifications are consolidated into one <b>factory batch</b>. Open a product once and update all active source jobs together. Individual jobs remain separate in <b>Productions Summary</b>.';
  }

  /* Existing wrappers may still try to refresh the deleted productionwork view; harmless,
     but make direct navigation fall back to Products. */
  const showViewBaseV1038=window.showView;
  if(typeof showViewBaseV1038==='function'){
    window.showView=function(id){
      if(id==='productionwork')id='productionproducts';
      const r=showViewBaseV1038.call(this,id);
      if(id==='productionproducts')renderGroupedFactoryProductsV1038();
      if(id==='production')renderProductionBoard();
      return r;
    };
    try{showView=window.showView}catch(_){}
  }

  let activeLabelJob=null;

  function ensureProdOrderLabelModal(){
    if(document.getElementById('prodOrderLabelModal'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <div id="prodOrderLabelModal" class="modal">
        <div class="modal-card" style="max-width:680px">
          <div class="modal-head">
            <div>
              <b id="prodOrderLabelTitle">Print Factory Production Label</b>
              <div id="prodOrderLabelMeta" class="small" style="color:#64748b"></div>
            </div>
            <button class="closex" type="button" onclick="closeModal('prodOrderLabelModal')">×</button>
          </div>
          <div class="modal-body" style="padding:16px 20px">
            <div style="display:flex;gap:18px;margin-bottom:14px;padding:10px 14px;background:#f1f5f9;border-radius:8px">
              <label style="display:flex;align-items:center;gap:6px;font-weight:700;cursor:pointer">
                <input type="radio" name="prodLabelTypeChoice" value="box" checked onchange="window.updateProdOrderLabelPreview()">
                Box Label (පෙට්ටියේ ලේබලය)
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-weight:700;cursor:pointer">
                <input type="radio" name="prodLabelTypeChoice" value="roll" onchange="window.updateProdOrderLabelPreview()">
                Roll Label (රෝලයේ ලේබලය)
              </label>
            </div>

            <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px">
              <div class="field">
                <label>Number of Copies</label>
                <input id="prodLabelCopies" type="number" min="1" max="500" value="1" oninput="window.updateProdOrderLabelPreview()">
              </div>
              <div class="field" id="prodLabelBoxRollsField">
                <label>Rolls per Box</label>
                <input id="prodLabelBoxRolls" type="number" min="1" max="1000" value="50" oninput="window.updateProdOrderLabelPreview()">
              </div>
              <div class="field" id="prodLabelRollPcsField" style="display:none">
                <label>Labels per Roll (pcs)</label>
                <input id="prodLabelRollPcs" type="number" min="1" max="100000" value="1000" oninput="window.updateProdOrderLabelPreview()">
              </div>
            </div>

            <div style="font-weight:700;font-size:12px;color:#475569;margin-bottom:6px">Live Label Preview:</div>
            <div id="prodOrderLabelPreviewHost" style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:16px;display:flex;justify-content:center">
              <div id="prodOrderLabelPreview"></div>
            </div>

            <div class="actions" style="margin-top:16px;display:flex;justify-content:flex-end;gap:10px">
              <button type="button" class="btn ghost" onclick="closeModal('prodOrderLabelModal')">Close</button>
              <button type="button" class="btn primary" onclick="window.printProdOrderLabels()">Print Labels</button>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  window.openProdOrderPrintModal=function(prodId){
    ensureProdOrderLabelModal();
    const r=(state.productionRequests||[]).find(x=>x.id===prodId);
    if(!r)return toast('Production order not found');
    activeLabelJob=r;

    document.getElementById('prodOrderLabelTitle').textContent=`Print Production Label — ${r.orderNo||'Unnumbered'}`;
    document.getElementById('prodOrderLabelMeta').textContent=`${r.customerName||'Demand'} • ${r.size||''} • ${r.material||''} • Request: ${money(r.requestQty||0)} ${r.unit||'Rolls'}`;

    const defaultBoxRolls=r.packing?.boxes?.[0]?.rolls||state.settings?.packingQty||50;
    const boxRollsInput=document.getElementById('prodLabelBoxRolls');
    if(boxRollsInput)boxRollsInput.value=defaultBoxRolls;

    const rollPcsInput=document.getElementById('prodLabelRollPcs');
    if(rollPcsInput)rollPcsInput.value=Number(r.pcs||1000);

    const copiesInput=document.getElementById('prodLabelCopies');
    if(copiesInput)copiesInput.value=1;

    const boxChoice=document.querySelector('input[name="prodLabelTypeChoice"][value="box"]');
    if(boxChoice)boxChoice.checked=true;

    window.updateProdOrderLabelPreview();
    document.getElementById('prodOrderLabelModal')?.classList.add('show');
  };

  window.updateProdOrderLabelPreview=function(){
    if(!activeLabelJob)return;
    const r=activeLabelJob;
    const type=document.querySelector('input[name="prodLabelTypeChoice"]:checked')?.value||'box';
    const boxRollsField=document.getElementById('prodLabelBoxRollsField');
    const rollPcsField=document.getElementById('prodLabelRollPcsField');

    if(type==='box'){
      if(boxRollsField)boxRollsField.style.display='';
      if(rollPcsField)rollPcsField.style.display='none';
    }else{
      if(boxRollsField)boxRollsField.style.display='none';
      if(rollPcsField)rollPcsField.style.display='';
    }

    const host=document.getElementById('prodOrderLabelPreview');
    if(!host)return;

    const boxRolls=Number(document.getElementById('prodLabelBoxRolls')?.value||50);
    const rollPcs=Number(document.getElementById('prodLabelRollPcs')?.value||r.pcs||1000);

    if(type==='box'){
      host.innerHTML=`
        <div style="width:360px;min-height:220px;background:#ffffff;border:3px solid #0f172a;border-radius:6px;padding:12px;font-family:Arial,sans-serif;color:#0f172a;box-sizing:border-box">
          <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:4px;margin-bottom:8px">
            <b style="font-size:16px;letter-spacing:0.5px">SOFTCREATION</b>
            <span style="font-size:11px;font-weight:800;background:#0f172a;color:#fff;padding:2px 6px;border-radius:3px">BOX LABEL</span>
          </div>
          <div style="font-size:11px;color:#475569">PRODUCTION ORDER</div>
          <div style="font-size:20px;font-weight:900;letter-spacing:0.5px;color:#0f172a">${esc(r.orderNo||'Unnumbered')}</div>
          <div style="margin-top:6px;font-size:12px"><b>Item:</b> ${esc(r.desc||'ELP')} · ${esc(r.size||'')}</div>
          <div style="font-size:11px;color:#334155"><b>Specification:</b> ${esc(r.material||'')} · ${esc(r.layout||'')}</div>
          <div style="margin-top:8px;padding:8px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div>
              <div style="font-size:9px;color:#64748b;font-weight:700">ROLLS IN BOX</div>
              <div style="font-size:18px;font-weight:900;color:#087e82">${money(boxRolls)} Rolls</div>
            </div>
            <div>
              <div style="font-size:9px;color:#64748b;font-weight:700">TOTAL LABELS</div>
              <div style="font-size:18px;font-weight:900">${money(boxRolls * rollPcs)} pcs</div>
            </div>
          </div>
          <div style="margin-top:8px;display:flex;justify-content:space-between;font-size:10px;color:#64748b">
            <span>Customer: <b>${esc(r.customerName||'Stock')}</b></span>
            <span>Date: ${esc(today())}</span>
          </div>
        </div>
      `;
    }else{
      host.innerHTML=`
        <div style="width:340px;min-height:200px;background:#ffffff;border:3px solid #0f172a;border-radius:6px;padding:12px;font-family:Arial,sans-serif;color:#0f172a;box-sizing:border-box">
          <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:4px;margin-bottom:8px">
            <b style="font-size:16px;letter-spacing:0.5px">SOFTCREATION</b>
            <span style="font-size:11px;font-weight:800;background:#087e82;color:#fff;padding:2px 6px;border-radius:3px">ROLL LABEL</span>
          </div>
          <div style="font-size:10px;color:#475569">PROD ORDER NO</div>
          <div style="font-size:18px;font-weight:900;letter-spacing:0.5px">${esc(r.orderNo||'Unnumbered')}</div>
          <div style="margin-top:6px;font-size:14px;font-weight:800"><b>Item:</b> ${esc(r.desc||'ELP')}</div>
          <div style="margin-top:4px;padding:6px 8px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:4px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div>
              <div style="font-size:9px;color:#0f766e;font-weight:700">LABEL SIZE</div>
              <div style="font-size:16px;font-weight:900;color:#0f766e">${esc(r.size||'')}</div>
            </div>
            <div>
              <div style="font-size:9px;color:#0f766e;font-weight:700">LABELS / ROLL</div>
              <div style="font-size:16px;font-weight:900;color:#0f766e">${money(rollPcs)} pcs</div>
            </div>
          </div>
          <div style="margin-top:6px;font-size:11px;color:#334155">${esc(r.material||'')} · ${esc(r.layout||'')}</div>
          <div style="margin-top:6px;display:flex;justify-content:space-between;font-size:10px;color:#64748b">
            <span>Customer: ${esc(r.customerName||'Stock')}</span>
            <span>Date: ${esc(today())}</span>
          </div>
        </div>
      `;
    }
  };

  window.printProdOrderLabels=function(){
    if(!activeLabelJob)return;
    const copies=Math.max(1,Number(document.getElementById('prodLabelCopies')?.value||1));
    const previewHtml=document.getElementById('prodOrderLabelPreview')?.innerHTML;
    if(!previewHtml)return;

    const w=window.open('','_blank','width=700,height=600');
    if(!w)return toast('Print popup blocked. Please allow popups.');

    const labelsHtml=Array.from({length:copies},()=>`<div class="label-page">${previewHtml}</div>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Production Labels</title>
      <style>
        @page { size: auto; margin: 4mm; }
        body { margin: 0; padding: 10px; font-family: Arial, sans-serif; display: flex; flex-direction: column; gap: 12px; align-items: center; }
        .label-page { page-break-after: always; display: flex; justify-content: center; }
        @media print { body { padding: 0; } .label-page { page-break-after: always; } }
      </style>
    </head><body>${labelsHtml}<script>window.onload=function(){window.print();window.close();}<\\/script></body></html>`);
    w.document.close();
  };

  try{applyUserAccess()}catch(_){}
  try{renderGroupedFactoryProductsV1038()}catch(_){}
})();
