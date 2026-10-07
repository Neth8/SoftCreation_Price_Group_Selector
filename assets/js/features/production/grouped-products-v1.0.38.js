
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
    const filtered=groups.filter(g=>(!material||g.material===material)&&(!q||[g.size,g.material,g.layout,g.pcs,g.unit,g.desc,...g.jobs.map(r=>r.customerName||''),...g.jobs.map(r=>r.piSerial||'')].join(' ').toLowerCase().includes(q)));
    const totals=groups.reduce((a,g)=>({requested:a.requested+g.requested,ongoing:a.ongoing+g.ongoing,finished:a.finished+g.finished}),{requested:0,ongoing:0,finished:0});
    if($('productionProductsKpis'))$('productionProductsKpis').innerHTML=[
      ['Unique Products',groups.length,'factory batches'],
      ['Requested',totals.requested,'not started'],
      ['Ongoing',totals.ongoing,'active production'],
      ['Finished',totals.finished,'incl. logistics']
    ].map(([k,v,n])=>`<div class="pp-kpi"><span>${k}</span><b>${money(v)}</b><div class="small">${n}</div></div>`).join('');

    const canManage=currentUser?.role==='admin'||hasPerm('production_manage');
    grid.innerHTML=filtered.length?filtered.map(g=>{
      const active=activeJobsForGroupV1038(g);
      const pending=Math.max(0,Number(g.requested||0)+Number(g.ongoing||0));
      const activeQty=active.reduce((n,r)=>n+Number(r.requestQty||0),0);
      const latest=g.latestUpdatedAt?new Date(g.latestUpdatedAt).toLocaleString():'-';
      return `<div class="pp-card"><div class="pp-card-head"><div><div class="pp-card-title">${esc(g.size)}</div><div class="pp-spec">${esc(g.material)} • ${esc(g.layout)} • ${money(g.pcs)} pcs / ${esc(g.unit==='Rolls'?'roll':g.unit)}</div></div><span class="tag">${active.length} active job${active.length===1?'':'s'}</span></div><div class="pp-stats"><div class="pp-stat total"><span>Requested</span><b>${money(g.requested)}</b><small>${g.requestedJobs} job${g.requestedJobs===1?'':'s'}</small></div><div class="pp-stat ongoing"><span>Ongoing</span><b>${money(g.ongoing)}</b><small>${g.ongoingJobs} job${g.ongoingJobs===1?'':'s'}</small></div><div class="pp-stat finished"><span>Finished</span><b>${money(g.finished)}</b><small>${g.finishedJobs} job${g.finishedJobs===1?'':'s'}</small></div><div class="pp-stat difference"><span>Pending</span><b>${money(pending)}</b><small>${esc(g.unit)}</small></div></div><div class="pp-card-foot"><div class="pp-mini">Factory batch: <b>${money(activeQty)} ${esc(g.unit)}</b> • Latest: ${esc(latest)}</div>${canManage&&active.length?`<button class="btn primary sm" onclick="openProductionProductDetailsV103('${encodeURIComponent(g.key)}')">Open Product</button>`:active.length?'<span class="small">Production manage permission required</span>':'<span class="tag">No active work</span>'}</div></div>`;
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

  try{applyUserAccess()}catch(_){}
  try{renderGroupedFactoryProductsV1038()}catch(_){}
})();
