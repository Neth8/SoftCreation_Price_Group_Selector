
/* =========================================================
   V1.0.36 - Scoped Production Summary / Production Workspace
             + Quote Request document-linked status
   ========================================================= */
(function(){
  'use strict';

  /* V1.0.36: styles are deliberately scoped to the three new/changed
     production surfaces. No global selectors are used here. */
  if(!document.getElementById('v1035ProductionScopedStyles')){
    const scopedStyle=document.createElement('style');
    scopedStyle.id='v1035ProductionScopedStyles';
    scopedStyle.textContent=`
      #production .sc-pagebar,
      #productionwork .sc-pagebar{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
        margin-top:14px;
        padding:10px 12px;
        border:1px solid #d7e6e8;
        border-radius:12px;
        background:#f8fbfc;
      }
      #production .sc-page-info,
      #productionwork .sc-page-info{font-size:11px;color:#5f717a}
      #production .sc-page-actions,
      #productionwork .sc-page-actions{display:flex;align-items:center;gap:9px;font-size:11px;color:#566b75}
      #productionwork .production-work-note{margin-bottom:12px}
      #productionwork .production-work-grid .production-work-card{
        width:100%;
        text-align:left;
        font:inherit;
        color:inherit;
        cursor:pointer;
        transition:.16s ease;
      }
      #productionwork .production-work-grid .production-work-card:hover{
        transform:translateY(-2px);
        border-color:#8bcfd0;
        box-shadow:0 14px 34px rgba(21,54,66,.13);
      }
      #productionwork .production-work-card-foot{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-top:10px;
        padding-top:9px;
        border-top:1px dashed #d5e4e6;
        font-size:9.5px;
        color:#62747d;
      }
      #productionwork .production-open-hint{color:#087f83;font-weight:900;white-space:nowrap}
      #productionWorkModal .production-work-modal-card{max-width:1180px}
      #productionWorkModal .production-work-job-list{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:12px;
      }
      #productionWorkModal .production-work-job{
        border:1px solid #d8e5e7;
        border-radius:14px;
        background:#fff;
        padding:13px;
      }
      #productionWorkModal .production-work-job.urgent{border-color:#efc96b;background:#fffdf6}
      #productionWorkModal .production-work-job.finished{border-color:#b9dfca;background:#f8fdfa}
      #productionWorkModal .production-work-job-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:10px;
      }
      #productionWorkModal .production-work-job-head>div{display:flex;flex-direction:column;gap:2px}
      #productionWorkModal .production-work-job-head b{font-size:13px}
      #productionWorkModal .production-work-job-head span{font-size:9.5px;color:#6c7d85}
      #productionWorkModal .production-work-job-customer{
        margin-top:8px;
        font-size:13px;
        font-weight:900;
        color:#203354;
      }
      #productionWorkModal .production-work-job-meta{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:5px 12px;
        margin-top:8px;
        font-size:10px;
        color:#526872;
      }
      #productionWorkModal .production-work-last-update{
        margin-top:9px;
        padding:8px 9px;
        border-radius:9px;
        background:#f2f7f8;
        font-size:9.5px;
        line-height:1.45;
        color:#596d76;
      }
      @media(max-width:780px){
        #productionWorkModal .production-work-job-list{grid-template-columns:1fr}
        #productionWorkModal .production-work-job-meta{grid-template-columns:1fr}
        #productionwork .production-work-card-foot{align-items:flex-start;flex-direction:column}
      }
    `;
    document.head.appendChild(scopedStyle);
  }

  /* ------------------------------
     Access + navigation
     ------------------------------ */
  try{
    VIEW_PERMS.productionwork='production_manage';
  }catch(_){}

  const prodSummaryNav=document.querySelector('.navbtn[data-view="production"]');
  if(prodSummaryNav)prodSummaryNav.textContent='Productions Summary';

  const productsNav=document.querySelector('.navbtn[data-view="productionproducts"]');
  if(productsNav && !document.querySelector('.navbtn[data-view="productionwork"]')){
    const b=document.createElement('button');
    b.className='navbtn';
    b.dataset.view='productionwork';
    b.textContent='Production';
    b.onclick=()=>showView('productionwork');
    productsNav.parentNode.insertBefore(b,productsNav);
  }

  const productionSection=$('production');
  if(productionSection){
    const title=productionSection.querySelector('.panel-title');
    if(title){
      const refresh=title.querySelector('button');
      title.innerHTML='<span>Productions Summary</span>';
      if(refresh)title.appendChild(refresh);
    }
    if(!$('prodPagination')){
      const pager=document.createElement('div');
      pager.id='prodPagination';
      pager.className='sc-pagebar';
      productionSection.querySelector('.panel-body')?.appendChild(pager);
    }
  }

  if(!$('productionwork')){
    const section=document.createElement('section');
    section.id='productionwork';
    section.className='view';
    section.innerHTML=`
      <div class="panel">
        <div class="panel-title">
          <span>Production</span>
          <button class="btn sm" style="background:#fff;color:#087f83" onclick="renderProductionWorkspaceV1034()">Refresh</button>
        </div>
        <div class="panel-body">
          <div class="notice production-work-note">
            Production is grouped by the same label specification. Open a product card to see all jobs for that item and manage each job using the existing production workflow.
          </div>
          <div id="productionWorkKpis" class="pp-kpis"></div>
          <div class="listbar">
            <input id="productionWorkSearch" class="search" placeholder="Search size / material / layout / pcs / customer / PI" oninput="renderProductionWorkspaceV1034()">
            <select id="productionWorkMaterial" onchange="renderProductionWorkspaceV1034()"><option value="">All materials</option></select>
          </div>
          <div id="productionWorkGrid" class="pp-grid production-work-grid"></div>
          <div id="productionWorkPagination" class="sc-pagebar"></div>
        </div>
      </div>`;
    (productionSection||document.querySelector('.view'))?.insertAdjacentElement('afterend',section);
  }

  if(!$('productionWorkModal')){
    document.body.insertAdjacentHTML('beforeend',`
      <div id="productionWorkModal" class="modal">
        <div class="modal-card production-work-modal-card">
          <div class="modal-head">
            <div>
              <b id="productionWorkModalTitle">Production Jobs</b>
              <div id="productionWorkModalMeta" class="small"></div>
            </div>
            <button class="closex" onclick="closeModal('productionWorkModal')">×</button>
          </div>
          <div id="productionWorkModalBody" class="modal-body"></div>
        </div>
      </div>`);
  }

  /* ------------------------------
     Latest activity helper
     ------------------------------ */
  function productionActivityV1034(r){
    if(typeof productionProductUpdatedAtV103==='function')return productionProductUpdatedAtV103(r);
    const hist=Array.isArray(r?.history)?r.history:[];
    const h=hist.reduce((m,x)=>Math.max(m,Date.parse(x?.at||0)||0),0);
    return Math.max(Date.parse(r?._spgsUpdatedAt||0)||0,Date.parse(r?.updatedAt||0)||0,h,Date.parse(r?.createdAt||0)||0);
  }

  /* ------------------------------
     Productions Summary pagination
     ------------------------------ */
  let prodSummaryPageV1034=1;
  let prodSummarySigV1034='';
  const PROD_SUMMARY_PAGE_SIZE_V1034=12;

  function summaryCardV1034(r){
    let h=typeof productionCardV8==='function'?productionCardV8(r):'';
    // Summary cards must not open the production detail editor.
    h=h.replace(/<button[^>]*onclick="openProductionV8\('[^']+'\)"[^>]*>Open<\/button>/g,'');
    h=h.replace(/<button[^>]*onclick="openProductionV8\(&quot;[^&]+&quot;\)"[^>]*>Open<\/button>/g,'');
    return h;
  }

  window.productionSummaryPageV1034=function(page){
    prodSummaryPageV1034=Math.max(1,Number(page)||1);
    renderProductionBoard();
  };

  window.renderProductionBoard=function(){
    if(!$('prodBoard'))return;
    if(typeof renderProductionNotificationsV8==='function')renderProductionNotificationsV8();

    const q=String($('prodSearch')?.value||'').trim().toLowerCase();
    const f=$('prodStatusFilter')?.value||'';
    const sig=q+'|'+f;
    if(sig!==prodSummarySigV1034){
      prodSummarySigV1034=sig;
      prodSummaryPageV1034=1;
    }

    let all=(state.productionRequests||[])
      .filter(productionVisibleV8)
      .filter(r=>(!f||r.status===f)&&[r.orderNo,r.piSerial,r.customerName,r.size,r.material,r.layout,r.pcs].join(' ').toLowerCase().includes(q))
      .sort((a,b)=>productionActivityV1034(b)-productionActivityV1034(a));

    const count=s=>all.filter(x=>x.status===s).length;
    if($('prodKpis')){
      $('prodKpis').innerHTML=[
        ['Total',all.length],
        ['Requested',count('Requested')],
        ['In Production',count('In Production')],
        ['Finished',count('Finished')],
        ['Dispatched',count('Dispatched')]
      ].map(x=>`<div class="prod-kpi"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
    }

    const pages=Math.max(1,Math.ceil(all.length/PROD_SUMMARY_PAGE_SIZE_V1034));
    if(prodSummaryPageV1034>pages)prodSummaryPageV1034=pages;
    const start=(prodSummaryPageV1034-1)*PROD_SUMMARY_PAGE_SIZE_V1034;
    const pageRows=all.slice(start,start+PROD_SUMMARY_PAGE_SIZE_V1034);

    const groups=[
      ['New / Planned',['Requested','Approved','Planned']],
      ['Production',['In Production']],
      ['QC / Finished',['QC Check','Finished']],
      ['Logistics',['Dispatched','Received','GRN Closed']]
    ];

    $('prodBoard').innerHTML=groups.map(([title,statuses])=>`
      <div class="prod-col">
        <h4>${title}</h4>
        ${pageRows.filter(r=>statuses.includes(r.status)).map(summaryCardV1034).join('')||'<div class="empty">No jobs on this page</div>'}
      </div>`).join('');

    const pager=$('prodPagination');
    if(pager){
      pager.innerHTML=all.length?`
        <div class="sc-page-info">Showing <b>${start+1}-${Math.min(start+pageRows.length,all.length)}</b> of <b>${all.length}</b> production jobs</div>
        <div class="sc-page-actions">
          <button class="btn ghost sm" ${prodSummaryPageV1034<=1?'disabled':''} onclick="productionSummaryPageV1034(${prodSummaryPageV1034-1})">Previous</button>
          <span>Page <b>${prodSummaryPageV1034}</b> / ${pages}</span>
          <button class="btn ghost sm" ${prodSummaryPageV1034>=pages?'disabled':''} onclick="productionSummaryPageV1034(${prodSummaryPageV1034+1})">Next</button>
        </div>`:'';
    }
  };
  try{renderProductionBoard=window.renderProductionBoard}catch(_){}

  /* ------------------------------
     New grouped Production workspace
     ------------------------------ */
  let productionWorkPageV1034=1;
  let productionWorkSigV1034='';
  const PRODUCTION_WORK_PAGE_SIZE_V1034=12;

  window.productionWorkPageV1034=function(page){
    productionWorkPageV1034=Math.max(1,Number(page)||1);
    renderProductionWorkspaceV1034();
  };

  function workGroupsV1034(){
    if(typeof productionProductGroupsV103!=='function')return [];
    return productionProductGroupsV103().map(g=>{
      const visibleJobs=(g.jobs||[]).filter(productionVisibleV8);
      if(!visibleJobs.length)return null;
      const requestedJobs=visibleJobs.filter(r=>r.status==='Requested');
      const ongoingJobs=visibleJobs.filter(r=>['Approved','Planned','In Production','QC Check'].includes(r.status));
      const finishedJobs=visibleJobs.filter(r=>['Finished','Dispatched','Received','GRN Closed'].includes(r.status));
      const requested=requestedJobs.reduce((s,r)=>s+Number(r.requestQty||0),0);
      const ongoing=ongoingJobs.reduce((s,r)=>s+Number(r.requestQty||0),0);
      const finished=finishedJobs.reduce((s,r)=>{
        const fq=Number(r.finishedQty||0);
        return s+(fq>0?fq:Number(r.requestQty||0));
      },0);
      return {
        ...g,
        jobs:visibleJobs,
        requested,
        ongoing,
        finished,
        pending:requested+ongoing,
        requestedJobs:requestedJobs.length,
        ongoingJobs:ongoingJobs.length,
        finishedJobs:finishedJobs.length,
        totalJobs:visibleJobs.length,
        latestUpdatedAt:visibleJobs.reduce((m,r)=>Math.max(m,productionActivityV1034(r)),0)
      };
    }).filter(Boolean).sort((a,b)=>b.latestUpdatedAt-a.latestUpdatedAt);
  }

  window.renderProductionWorkspaceV1034=function(){
    const grid=$('productionWorkGrid');
    if(!grid)return;
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage')){
      grid.innerHTML='<div class="empty" style="grid-column:1/-1">Production access is not enabled for this user.</div>';
      return;
    }

    const groups=workGroupsV1034();
    const ms=$('productionWorkMaterial');
    const selected=ms?.value||'';
    if(ms){
      const materials=[...new Set(groups.map(g=>g.material).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
      const signature=materials.join('|');
      if(ms.dataset.sig!==signature){
        ms.innerHTML='<option value="">All materials</option>'+materials.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
        ms.dataset.sig=signature;
        if(materials.includes(selected))ms.value=selected;
      }
    }

    const q=String($('productionWorkSearch')?.value||'').trim().toLowerCase();
    const material=$('productionWorkMaterial')?.value||'';
    const sig=q+'|'+material;
    if(sig!==productionWorkSigV1034){
      productionWorkSigV1034=sig;
      productionWorkPageV1034=1;
    }

    const filtered=groups.filter(g=>
      (!material||g.material===material) &&
      (!q||[
        g.size,g.material,g.layout,g.pcs,g.desc,
        ...(g.jobs||[]).flatMap(r=>[r.orderNo,r.piSerial,r.customerName,r.ownerDisplay,r.ownerUser])
      ].join(' ').toLowerCase().includes(q))
    );

    const totalJobs=groups.reduce((s,g)=>s+g.totalJobs,0);
    const requestedJobs=groups.reduce((s,g)=>s+g.requestedJobs,0);
    const ongoingJobs=groups.reduce((s,g)=>s+g.ongoingJobs,0);
    const finishedJobs=groups.reduce((s,g)=>s+g.finishedJobs,0);
    if($('productionWorkKpis')){
      $('productionWorkKpis').innerHTML=[
        ['Products',groups.length,'grouped specifications'],
        ['Requested',requestedJobs,'new jobs'],
        ['Ongoing',ongoingJobs,'active jobs'],
        ['Finished',finishedJobs,'completed / logistics']
      ].map(([k,v,n])=>`<div class="pp-kpi"><span>${k}</span><b>${money(v)}</b><div class="small">${n}</div></div>`).join('');
    }

    const pages=Math.max(1,Math.ceil(filtered.length/PRODUCTION_WORK_PAGE_SIZE_V1034));
    if(productionWorkPageV1034>pages)productionWorkPageV1034=pages;
    const start=(productionWorkPageV1034-1)*PRODUCTION_WORK_PAGE_SIZE_V1034;
    const pageGroups=filtered.slice(start,start+PRODUCTION_WORK_PAGE_SIZE_V1034);

    grid.innerHTML=pageGroups.length?pageGroups.map(g=>{
      const latest=g.latestUpdatedAt?new Date(g.latestUpdatedAt).toLocaleString():'-';
      return `<button type="button" class="pp-card production-work-card" onclick="openProductionWorkGroupV1034('${encodeURIComponent(g.key)}')">
        <div class="pp-card-head">
          <div>
            <div class="pp-card-title">${esc(g.size)}</div>
            <div class="pp-spec">${esc(g.material)} • ${esc(g.layout)} • ${money(g.pcs)} pcs / ${esc(g.unit==='Rolls'?'roll':g.unit)}</div>
          </div>
          <span class="tag">${g.totalJobs} job${g.totalJobs===1?'':'s'}</span>
        </div>
        <div class="pp-stats">
          <div class="pp-stat total"><span>Requested</span><b>${money(g.requested)}</b><small>${g.requestedJobs} job${g.requestedJobs===1?'':'s'}</small></div>
          <div class="pp-stat ongoing"><span>Ongoing</span><b>${money(g.ongoing)}</b><small>${g.ongoingJobs} job${g.ongoingJobs===1?'':'s'}</small></div>
          <div class="pp-stat finished"><span>Finished</span><b>${money(g.finished)}</b><small>${g.finishedJobs} job${g.finishedJobs===1?'':'s'}</small></div>
          <div class="pp-stat difference"><span>Pending</span><b>${money(g.pending)}</b><small>${esc(g.unit)}</small></div>
        </div>
        <div class="production-work-card-foot">
          <span>Latest activity: <b>${esc(latest)}</b></span>
          <span class="production-open-hint">Open product →</span>
        </div>
      </button>`;
    }).join(''):'<div class="empty" style="grid-column:1/-1">No matching production products.</div>';

    const pager=$('productionWorkPagination');
    if(pager){
      pager.innerHTML=filtered.length?`
        <div class="sc-page-info">Showing <b>${start+1}-${Math.min(start+pageGroups.length,filtered.length)}</b> of <b>${filtered.length}</b> products</div>
        <div class="sc-page-actions">
          <button class="btn ghost sm" ${productionWorkPageV1034<=1?'disabled':''} onclick="productionWorkPageV1034(${productionWorkPageV1034-1})">Previous</button>
          <span>Page <b>${productionWorkPageV1034}</b> / ${pages}</span>
          <button class="btn ghost sm" ${productionWorkPageV1034>=pages?'disabled':''} onclick="productionWorkPageV1034(${productionWorkPageV1034+1})">Next</button>
        </div>`:'';
    }
  };

  window.openProductionWorkGroupV1034=function(encodedKey){
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage'))return requirePerm('production_manage','manage production');
    const key=decodeURIComponent(encodedKey);
    const g=workGroupsV1034().find(x=>x.key===key);
    if(!g)return;

    $('productionWorkModalTitle').textContent=`${g.size} — ${g.material}`;
    $('productionWorkModalMeta').textContent=`${g.layout} • ${money(g.pcs)} pcs / ${g.unit==='Rolls'?'roll':g.unit} • ${g.totalJobs} job${g.totalJobs===1?'':'s'}`;

    const jobs=[...g.jobs].sort((a,b)=>productionActivityV1034(b)-productionActivityV1034(a));
    $('productionWorkModalBody').innerHTML=`
      <div class="production-work-job-list">
        ${jobs.map(r=>{
          const finished=Number(r.finishedQty||0);
          const history=(r.history||[]);
          const last=history.length?history[history.length-1]:null;
          return `<div class="production-work-job ${prodStatusClassV8(r.status)}">
            <div class="production-work-job-head">
              <div>
                <b>${esc(r.orderNo)}</b>
                <span>${esc(r.piSerial||'-')}</span>
              </div>
              <span class="prod-status">${esc(r.status||'Requested')}</span>
            </div>
            <div class="production-work-job-customer">${esc(r.customerName||'-')}</div>
            <div class="production-work-job-meta">
              <span><b>Requested:</b> ${money(r.requestQty)} ${esc(r.unit||'')}</span>
              <span><b>Finished:</b> ${money(finished)} ${esc(r.unit||'')}</span>
              <span><b>Need:</b> ${esc(r.needDate||'-')}</span>
              <span><b>Sales:</b> ${esc(r.ownerDisplay||r.ownerUser||'-')}</span>
            </div>
            ${last?`<div class="production-work-last-update"><b>Last update:</b> ${esc(last.status||'')} • ${esc(last.by||'')} • ${esc(new Date(last.at).toLocaleString())}${last.note?`<br>${esc(last.note)}`:''}</div>`:''}
            <div class="actions">
              <button class="btn primary sm" onclick="closeModal('productionWorkModal');openProductionV8('${r.id}')">Manage Job</button>
              <button class="btn green sm" onclick="downloadProductionImageV8('${r.id}')">Image</button>
              ${r.status==='Finished'?`<button class="btn navy sm" onclick="productionWorkDispatchV1034('${r.id}')">Dispatch</button>`:''}
            </div>
          </div>`;
        }).join('')}
      </div>`;
    $('productionWorkModal').classList.add('show');
  };

  window.productionWorkDispatchV1034=function(id){
    closeModal('productionWorkModal');
    if(typeof openDispatchLoadingV81==='function')return openDispatchLoadingV81(id);
    if(typeof openDispatchV8==='function')return openDispatchV8(id);
  };

  /* ------------------------------
     Quote Request status reconciliation
     ------------------------------ */
  function syncQuoteRequestDocumentStatusesV1034(){
    let changed=false;
    const docs=state.docs||[];

    (state.quoteRequests||[]).forEach(r=>{
      const quote=docs
        .filter(d=>d.type==='Q'&&(d.sourceBranchRequestId===r.id||d.id===r.quoteId))
        .sort((a,b)=>Number(b.updated||b.created||0)-Number(a.updated||a.created||0))[0];

      const pi=docs
        .filter(d=>d.type==='PI'&&(
          d.sourceBranchRequestId===r.id ||
          d.id===r.piId ||
          (quote&&d.sourceQuoteId===quote.id) ||
          (r.quoteId&&d.sourceQuoteId===r.quoteId)
        ))
        .sort((a,b)=>Number(b.updated||b.created||0)-Number(a.updated||a.created||0))[0];

      let nextStatus=r.status;
      if(pi)nextStatus='PI Created';
      else if(quote)nextStatus='Quotation Created';

      if(quote){
        if(r.quoteId!==quote.id){r.quoteId=quote.id;changed=true}
        if(r.quoteSerial!==quote.serial){r.quoteSerial=quote.serial;changed=true}
      }
      if(pi){
        if(r.piId!==pi.id){r.piId=pi.id;changed=true}
        if(r.piSerial!==pi.serial){r.piSerial=pi.serial;changed=true}
      }
      if(nextStatus!==r.status){
        r.status=nextStatus;
        r.history=r.history||[];
        const last=r.history[r.history.length-1];
        if(last?.status!==nextStatus){
          r.history.push({status:nextStatus,by:currentUser?.display||'System',username:currentUser?.username||'',at:new Date().toISOString()});
        }
        changed=true;
      }
    });

    return changed;
  }
  window.syncQuoteRequestDocumentStatusesV1034=syncQuoteRequestDocumentStatusesV1034;

  const renderBranchRequestsV1034=window.renderBranchRequests;
  if(typeof renderBranchRequestsV1034==='function'){
    window.renderBranchRequests=function(){
      const changed=syncQuoteRequestDocumentStatusesV1034();
      if(changed && typeof saveState==='function')saveState();
      return renderBranchRequestsV1034.apply(this,arguments);
    };
    try{renderBranchRequests=window.renderBranchRequests}catch(_){}
  }

  /* Branch user's own request list should receive the same resolved status. */
  const renderMyBranchRequestsV1034=window.renderMyBranchRequests;
  if(typeof renderMyBranchRequestsV1034==='function'){
    window.renderMyBranchRequests=function(){
      const changed=syncQuoteRequestDocumentStatusesV1034();
      if(changed && typeof saveState==='function')saveState();
      return renderMyBranchRequestsV1034.apply(this,arguments);
    };
    try{renderMyBranchRequests=window.renderMyBranchRequests}catch(_){}
  }

  /* ------------------------------
     View/refresh integration
     ------------------------------ */
  const showViewV1034=window.showView;
  if(typeof showViewV1034==='function'){
    window.showView=function(id){
      const r=showViewV1034.apply(this,arguments);
      if(id==='production')renderProductionBoard();
      if(id==='productionwork')renderProductionWorkspaceV1034();
      if(id==='quoterequests')window.renderBranchRequests?.();
      return r;
    };
    try{showView=window.showView}catch(_){}
  }

  const refreshAllV1034=window.refreshAll;
  if(typeof refreshAllV1034==='function'){
    window.refreshAll=function(){
      const r=refreshAllV1034.apply(this,arguments);
      if($('production')?.classList.contains('active'))renderProductionBoard();
      if($('productionwork')?.classList.contains('active'))renderProductionWorkspaceV1034();
      if($('quoterequests')?.classList.contains('active'))window.renderBranchRequests?.();
      return r;
    };
    try{refreshAll=window.refreshAll}catch(_){}
  }

  /* Production realtime already updates Summary/Products.
     Also refresh the new grouped Production workspace when active. */
  const saveProductionUpdateV1034=window.saveProductionUpdateV8;
  if(typeof saveProductionUpdateV1034==='function'){
    window.saveProductionUpdateV8=function(){
      const r=saveProductionUpdateV1034.apply(this,arguments);
      if($('productionwork')?.classList.contains('active'))renderProductionWorkspaceV1034();
      return r;
    };
    try{saveProductionUpdateV8=window.saveProductionUpdateV8}catch(_){}
  }

  try{applyUserAccess()}catch(_){}
  try{syncQuoteRequestDocumentStatusesV1034()}catch(_){}
})();
