
/* V1.0.65 - Single Standalone Fast Product Dispatch
   Independent from Finance/JBR modules. */
(function(){
  const dispatchRegistryV1064=new Map();

  function flowIndexV1064(status){
    const flow=['Requested','Approved','Planned','In Production','QC Check','Finished','Dispatched','Received','GRN Closed'];
    const i=flow.indexOf(String(status||'Requested'));
    return i<0?0:i;
  }

  function producedQtyV1064(r){
    const finished=Number(r?.finishedQty||0);
    if(finished>0)return finished;

    const packed=Number(r?.packing?.total||0);
    if(packed>0)return packed;

    const batchPacked=Number(r?.batchPackingV1040?.total||0);
    if(batchPacked>0)return batchPacked;

    /* Legacy Finished jobs may not have finishedQty stored. */
    if(flowIndexV1064(r?.status)>=flowIndexV1064('Finished')){
      return Math.max(0,Number(r?.requestQty||0));
    }
    return 0;
  }

  function dispatchedQtyV1064(r){
    return (r?.dispatches||[]).reduce((n,d)=>n+Math.max(0,Number(d?.qty||0)),0);
  }

  function availableQtyV1064(r){
    if(flowIndexV1064(r?.status)<flowIndexV1064('Finished'))return 0;
    return Math.max(0,producedQtyV1064(r)-dispatchedQtyV1064(r));
  }

  function ensureDispatchModalV1064(){
    let modal=document.getElementById('productDispatchModalV1064');
    if(modal)return modal;

    document.body.insertAdjacentHTML('beforeend',`
      <div id="productDispatchModalV1064" class="modal">
        <div class="modal-card product-dispatch-modal-v1064">
          <div class="modal-head">
            <div>
              <b>Product Dispatch</b>
              <div id="productDispatchMetaV1064" class="small"></div>
            </div>
            <button class="closex" type="button" onclick="closeModal('productDispatchModalV1064')">×</button>
          </div>
          <div id="productDispatchBodyV1064" class="modal-body"></div>
        </div>
      </div>`);
    return document.getElementById('productDispatchModalV1064');
  }

  window.openFastProductDispatchV1064=function(token){
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage')){
      return requirePerm('production_manage','dispatch finished production');
    }

    const g=dispatchRegistryV1064.get(String(token||''));
    if(!g){
      toast('Dispatch data expired. Refresh Products and try again.');
      return;
    }

    const modal=ensureDispatchModalV1064();
    const meta=document.getElementById('productDispatchMetaV1064');
    const body=document.getElementById('productDispatchBodyV1064');

    /* Open first — no DB calls and no product regrouping on click. */
    modal.classList.add('show');

    const jobs=(g.jobs||[])
      .filter(r=>availableQtyV1064(r)>0)
      .sort((a,b)=>{
        const ta=Date.parse(a?.finishedAt||a?._spgsUpdatedAt||a?.updatedAt||0)||0;
        const tb=Date.parse(b?.finishedAt||b?._spgsUpdatedAt||b?.updatedAt||0)||0;
        return tb-ta;
      });

    const totalAvailable=jobs.reduce((n,r)=>n+availableQtyV1064(r),0);

    meta.textContent=
      `${g.size} • ${g.material} • ${g.layout} • ${money(g.pcs)} pcs/roll • Available ${money(totalAvailable)} ${g.unit||'Rolls'}`;

    if(!jobs.length){
      body.innerHTML='<div class="empty">No Finished production balance is available to dispatch for this product.</div>';
      return;
    }

    body.innerHTML=`
      <div class="notice">
        <b>Select the Finished production job to dispatch.</b>
        QC Check jobs remain locked until QC approval.
      </div>
      <div class="product-dispatch-list-v1064">
        ${jobs.map(r=>{
          const produced=producedQtyV1064(r);
          const dispatched=dispatchedQtyV1064(r);
          const available=availableQtyV1064(r);
          const physical=(r?.packing?.sharedBatchPacking||r?.batchPackingV1040||r?.packing||{});
          const pboxes=Array.isArray(physical?.boxes)?physical.boxes:[];
          const pboxRolls=pboxes.reduce((n,b)=>n+Math.max(0,Number(b?.rolls||0)),0);
          const ploose=Math.max(0,Number(physical?.loose||0));
          const packText=pboxes.length||ploose>0
            ? `${pboxes.length} box${pboxes.length===1?'':'es'} • ${money(pboxRolls)} boxed${ploose>0?` • ${money(ploose)} loose`:''}`
            : 'No packing breakdown';
          return `<div class="product-dispatch-row-v1064">
            <div class="product-dispatch-job-v1064">
              <b>${esc(r.orderNo||'-')}</b>
              <span>${esc(r.customerName||'-')} • PI ${esc(r.piSerial||'-')} • ${esc(r.status||'-')}</span>
              <span class="product-pack-summary-v1122"><b>Packing:</b> ${esc(packText)}</span>
            </div>
            <div><span>Finished</span><b>${money(produced)}</b></div>
            <div><span>Dispatched</span><b>${money(dispatched)}</b></div>
            <div><span>Available</span><b>${money(available)}</b></div>
            <button
              class="btn navy sm"
              type="button"
              onclick="event.stopPropagation();closeModal('productDispatchModalV1064');openDispatchLoadingV81('${r.id}')"
            >Dispatch</button>
          </div>`;
        }).join('')}
      </div>`;
  };

  function bindFastDispatchButtonsV1064(){
    /* V1.1.24: Products-card Dispatch state is now owned directly by
       renderGroupedFactoryProductsV1038 + openProductDispatchV1124.
       Keep this legacy hook as a no-op to avoid duplicate Dispatch buttons. */
    return;
  }

  function installDispatchV1064(){
    if(window.__dispatchV1064Installed)return;
    window.__dispatchV1064Installed=true;

    const baseRender=window.renderProductionProducts;
    if(typeof baseRender==='function'){
      window.renderProductionProducts=function(){
        const result=baseRender.apply(this,arguments);
        try{bindFastDispatchButtonsV1064()}catch(e){console.error('Fast dispatch buttons',e)}
        return result;
      };
      try{renderProductionProducts=window.renderProductionProducts}catch(_){}
    }

    const baseShow=window.showView;
    if(typeof baseShow==='function'){
      window.showView=function(id){
        const result=baseShow.apply(this,arguments);
        if(id==='productionproducts'){
          setTimeout(()=>{
            try{bindFastDispatchButtonsV1064()}catch(e){console.error('Fast dispatch view bind',e)}
          },0);
        }
        return result;
      };
      try{showView=window.showView}catch(_){}
    }

    /* If Products is already visible, replace the older button immediately. */
    try{bindFastDispatchButtonsV1064()}catch(_){}
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',installDispatchV1064,{once:true});
  }else{
    installDispatchV1064();
  }
})();
