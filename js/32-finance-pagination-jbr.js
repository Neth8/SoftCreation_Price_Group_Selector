
/* V1.0.66 - Finance Pagination + Live JBR Length + Box-by-Box Dispatch */
(function(){
  let financePageV1066=1;
  const FIN_PAGE_SIZE_V1066=5;

  /* ---------------------- Finance pagination ---------------------- */
  function ensureFinancePagerV1066(){
    const host=$('financeJobsV1059');
    if(!host)return null;
    let pager=$('financePagerV1066');
    if(!pager){
      pager=document.createElement('div');
      pager.id='financePagerV1066';
      pager.className='finance-pager-v1066';
      host.insertAdjacentElement('afterend',pager);
    }
    return pager;
  }

  function applyFinancePaginationV1066(reset=false){
    const host=$('financeJobsV1059');
    if(!host)return;
    if(reset)financePageV1066=1;

    const cards=[...host.querySelectorAll('.finance-usage-card-v1060')];
    const pager=ensureFinancePagerV1066();

    if(!cards.length){
      if(pager)pager.innerHTML='';
      return;
    }

    const pages=Math.max(1,Math.ceil(cards.length/FIN_PAGE_SIZE_V1066));
    financePageV1066=Math.min(Math.max(1,financePageV1066),pages);

    const from=(financePageV1066-1)*FIN_PAGE_SIZE_V1066;
    const to=from+FIN_PAGE_SIZE_V1066;

    cards.forEach((card,i)=>{
      card.style.display=(i>=from&&i<to)?'':'none';
    });

    const pageButtons=Array.from({length:pages},(_,i)=>i+1)
      .map(p=>`<button type="button" class="finance-page-btn-v1066 ${p===financePageV1066?'active':''}" onclick="financeGoPageV1066(${p})">${p}</button>`)
      .join('');

    pager.innerHTML=`
      <div class="finance-pager-info-v1066">
        Showing <b>${from+1}-${Math.min(to,cards.length)}</b> of <b>${cards.length}</b> jobs
      </div>
      <div class="finance-pager-actions-v1066">
        <button type="button" class="btn ghost sm" ${financePageV1066<=1?'disabled':''} onclick="financeGoPageV1066(${financePageV1066-1})">Previous</button>
        ${pageButtons}
        <button type="button" class="btn ghost sm" ${financePageV1066>=pages?'disabled':''} onclick="financeGoPageV1066(${financePageV1066+1})">Next</button>
      </div>`;
  }

  window.financeGoPageV1066=function(page){
    financePageV1066=Math.max(1,Number(page||1));
    applyFinancePaginationV1066(false);
    try{$('financeJobsV1059')?.scrollIntoView({behavior:'smooth',block:'start'})}catch(_){}
  };

  function installFinancePaginationV1066(){
    if(window.__financePaginationV1066Installed)return;
    window.__financePaginationV1066Installed=true;

    const base=window.renderFinanceV1059;
    if(typeof base==='function'){
      window.renderFinanceV1059=async function(force=false){
        const searchNow=String($('financeSearchV1059')?.value||'');
        const statusNow=String($('financeStatusV1059')?.value||'');
        const previousKey=window.__financeFilterKeyV1066||'';
        const currentKey=searchNow+'|'+statusNow;
        const shouldReset=currentKey!==previousKey;
        window.__financeFilterKeyV1066=currentKey;

        const result=await base.apply(this,arguments);
        applyFinancePaginationV1066(shouldReset);
        return result;
      };
      try{renderFinanceV1059=window.renderFinanceV1059}catch(_){}
    }
  }

  /* ---------------------- JBR length preview ---------------------- */
  window.jbrActualLengthPreviewV1066=function(){
    const calc=(typeof jbrCalcV1055==='function')
      ? jbrCalcV1055()
      : {
          jbrLengthM:Number($('jbrLengthV1055')?.value||0),
          pcsPerRoll:Number($('jbrPcsV1055')?.value||0),
          pitch:Number($('jbrLabelHeightV1055')?.value||0)+Number($('jbrGapV1055')?.value||0),
          lanes:0,
          theoreticalRolls:0
        };

    const actual=Math.max(0,Number($('jbrActualRollsV1055')?.value||0));
    const lanes=Math.max(0,Number(calc.lanes||0));
    const pcs=Math.max(0,Number(calc.pcsPerRoll||0));
    const pitch=Math.max(0,Number(calc.pitch||0));
    const original=Math.max(0,Number(calc.jbrLengthM||0));

    const used=(lanes>0&&pcs>0&&pitch>0)
      ? (actual*pcs*pitch)/(lanes*1000)
      : 0;
    const balance=Math.max(0,original-used);

    if($('jbrPreviewActualRollsV1066'))$('jbrPreviewActualRollsV1066').textContent=money(actual);
    if($('jbrPreviewUsedLengthV1066'))$('jbrPreviewUsedLengthV1066').textContent=`${money(used)} m`;
    if($('jbrPreviewOriginalLengthV1066'))$('jbrPreviewOriginalLengthV1066').textContent=`${money(original)} m`;
    if($('jbrPreviewBalanceLengthV1066'))$('jbrPreviewBalanceLengthV1066').textContent=`${money(balance)} m`;

    const card=$('jbrActualLengthCardV1066');
    if(card){
      card.classList.toggle('over',used>original+.0001);
      if(used>original+.0001){
        $('jbrPreviewBalanceLengthV1066').textContent=`OVER BY ${money(used-original)} m`;
      }
    }

    return {actual,usedLengthM:used,originalLengthM:original,balanceLengthM:balance};
  };

  function installJbrPreviewV1066(){
    if(window.__jbrPreviewV1066Installed)return;
    window.__jbrPreviewV1066Installed=true;

    const base=window.jbrCalcV1055;
    if(typeof base==='function'){
      window.jbrCalcV1055=function(){
        const result=base.apply(this,arguments);
        /* Avoid recursion by updating preview directly from returned calc. */
        const actual=Math.max(0,Number($('jbrActualRollsV1055')?.value||0));
        const lanes=Math.max(0,Number(result?.lanes||0));
        const pcs=Math.max(0,Number(result?.pcsPerRoll||0));
        const pitch=Math.max(0,Number(result?.pitch||0));
        const original=Math.max(0,Number(result?.jbrLengthM||0));
        const used=(lanes>0&&pcs>0&&pitch>0)?(actual*pcs*pitch)/(lanes*1000):0;
        const balance=Math.max(0,original-used);

        if($('jbrPreviewActualRollsV1066'))$('jbrPreviewActualRollsV1066').textContent=money(actual);
        if($('jbrPreviewUsedLengthV1066'))$('jbrPreviewUsedLengthV1066').textContent=`${money(used)} m`;
        if($('jbrPreviewOriginalLengthV1066'))$('jbrPreviewOriginalLengthV1066').textContent=`${money(original)} m`;
        if($('jbrPreviewBalanceLengthV1066'))$('jbrPreviewBalanceLengthV1066').textContent=used>original+.0001?`OVER BY ${money(used-original)} m`:`${money(balance)} m`;
        $('jbrActualLengthCardV1066')?.classList.toggle('over',used>original+.0001);
        return result;
      };
      try{jbrCalcV1055=window.jbrCalcV1055}catch(_){}
    }
  }

  /* ---------------------- Box-by-box dispatch ---------------------- */
  function boxUsedV1066(r){
    const used={};
    (r?.dispatches||[]).forEach(d=>{
      (d?.boxes||[]).forEach(b=>{
        used[String(b.boxNo)]=(used[String(b.boxNo)]||0)+Number(b.qty||0);
      });
    });
    return used;
  }

  function looseUsedV1066(r){
    return (r?.dispatches||[]).reduce((n,d)=>n+Number(d?.loose||0),0);
  }

  function ensureBoxPickerV1066(){
    if($('boxDispatchPickerV1066'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <div id="boxDispatchPickerV1066" class="modal">
        <div class="modal-card box-dispatch-picker-card-v1066">
          <div class="modal-head">
            <div>
              <b>Dispatch — Box by Box</b>
              <div id="boxDispatchPickerMetaV1066" class="small"></div>
            </div>
            <button class="closex" type="button" onclick="closeModal('boxDispatchPickerV1066')">×</button>
          </div>
          <div class="modal-body">
            <div class="notice"><b>One dispatch = one carton.</b> Select an individual packed box below. Each box creates its own Dispatch Note and can be received separately by Stores.</div>
            <input id="boxDispatchReqIdV1066" type="hidden">
            <div id="boxDispatchPickerListV1066"></div>
          </div>
        </div>
      </div>`);
  }

  function renderBoxPickerV1066(r){
    ensureBoxPickerV1066();
    const used=boxUsedV1066(r);
    const boxes=Array.isArray(r?.packing?.boxes)?r.packing.boxes:[];
    const loosePacked=Math.max(0,Number(r?.packing?.loose||0));
    const looseUsed=looseUsedV1066(r);
    const looseRemaining=Math.max(0,loosePacked-looseUsed);

    $('boxDispatchReqIdV1066').value=r.id;
    $('boxDispatchPickerMetaV1066').textContent=
      `${r.orderNo} • ${r.customerName||'-'} • ${r.size} • ${r.material}`;

    const rows=boxes.map((b,i)=>{
      const packed=Math.max(0,Number(b.rolls||0));
      const already=Math.max(0,Number(used[String(b.boxNo)]||0));
      const remaining=Math.max(0,packed-already);
      return `<div class="box-dispatch-item-v1066 ${remaining<=0?'done':''}">
        <div class="box-dispatch-name-v1066">
          <b>Box ${esc(b.boxNo||String(i+1).padStart(2,'0'))}</b>
          <span>${esc(b.note||'')}</span>
        </div>
        <div><span>Packed</span><b>${money(packed)}</b></div>
        <div><span>Already Dispatched</span><b>${money(already)}</b></div>
        <div><span>Available</span><b>${money(remaining)}</b></div>
        ${remaining>0
          ? `<button class="btn navy sm" type="button" onclick="startSingleBoxDispatchV1066('${r.id}',${i})">Dispatch This Box</button>`
          : `<span class="tag">Dispatched</span>`}
      </div>`;
    }).join('');

    const looseRow=loosePacked>0?`
      <div class="box-dispatch-item-v1066 ${looseRemaining<=0?'done':''}">
        <div class="box-dispatch-name-v1066"><b>Loose Rolls</b><span>Not packed in a carton</span></div>
        <div><span>Packed Loose</span><b>${money(loosePacked)}</b></div>
        <div><span>Already Dispatched</span><b>${money(looseUsed)}</b></div>
        <div><span>Available</span><b>${money(looseRemaining)}</b></div>
        ${looseRemaining>0
          ? `<button class="btn ghost sm" type="button" onclick="startLooseDispatchV1066('${r.id}')">Dispatch Loose Rolls</button>`
          : `<span class="tag">Dispatched</span>`}
      </div>`:'';

    $('boxDispatchPickerListV1066').innerHTML=
      rows||looseRow
        ? `<div class="box-dispatch-list-v1066">${rows}${looseRow}</div>`
        : `<div class="empty">No packed cartons are recorded for this production job.</div>`;

    $('boxDispatchPickerV1066').classList.add('show');
  }

  window.openDispatchLoadingV81=function(id){
    const r=(state.productionRequests||[]).find(x=>x.id===id);
    if(!r||flowIndexV81(r.status)<flowIndexV81('Finished')){
      return toast('Only a Finished production job can be dispatched');
    }
    if(!(productionAvailableV81(r)>0))return toast('No finished balance remains');
    renderBoxPickerV1066(r);
  };

  function prepareSingleDispatchV1066(r,boxIndex=null,looseOnly=false){
    const used=boxUsedV1066(r);
    $('dispatchLoadReqId').value=r.id;
    $('dispatchLoadingMeta').textContent=
      `${r.orderNo} • One dispatch note per ${looseOnly?'loose-roll load':'box'}`;
    $('dispatchLoadDate').value=today();
    $('dispatchLoadCarrier').value='';
    $('dispatchLoadNote').value='';

    if(looseOnly){
      const looseRemaining=Math.max(0,Number(r?.packing?.loose||0)-looseUsedV1066(r));
      $('dispatchBoxPick').innerHTML='<div class="empty">Loose-roll dispatch — no carton selected.</div>';
      $('dispatchLoose').value=String(looseRemaining);
      $('dispatchLoose').readOnly=true;
    }else{
      const b=r?.packing?.boxes?.[boxIndex];
      if(!b)return toast('Packed box not found');
      const remaining=Math.max(0,Number(b.rolls||0)-Number(used[String(b.boxNo)]||0));
      if(!(remaining>0))return toast('This box has already been fully dispatched');

      $('dispatchLoose').value='0';
      $('dispatchLoose').readOnly=true;
      $('dispatchBoxPick').innerHTML=`
        <label class="dispatch-box-pick single-v1066">
          <input class="dispatch-box-check" type="checkbox" data-i="${boxIndex}" checked hidden>
          <span>
            <b>Box ${esc(b.boxNo)}</b><br>
            <span class="small">Packed ${money(b.rolls)} • Dispatching full remaining box: ${money(remaining)} rolls</span>
          </span>
          <input class="dispatch-box-qty" data-i="${boxIndex}" type="number" min="${remaining}" max="${remaining}" value="${remaining}" readonly>
        </label>`;
    }

    updateDispatchTotalV81();
    closeModal('boxDispatchPickerV1066');
    $('dispatchNoteModal').classList.add('show');
  }

  window.startSingleBoxDispatchV1066=function(jobId,boxIndex){
    const r=(state.productionRequests||[]).find(x=>x.id===jobId);
    if(!r)return toast('Production job not found');
    prepareSingleDispatchV1066(r,Number(boxIndex),false);
  };

  window.startLooseDispatchV1066=function(jobId){
    const r=(state.productionRequests||[]).find(x=>x.id===jobId);
    if(!r)return toast('Production job not found');
    prepareSingleDispatchV1066(r,null,true);
  };

  /* Refresh the box picker after a dispatch is saved if the user opens Dispatch again. */
  const baseConfirm=window.confirmDispatchLoadingV81;
  if(typeof baseConfirm==='function'){
    window.confirmDispatchLoadingV81=function(){
      const result=baseConfirm.apply(this,arguments);
      /* Existing function saves one selected box because V1066 only renders one checkbox. */
      return result;
    };
    try{confirmDispatchLoadingV81=window.confirmDispatchLoadingV81}catch(_){}
  }

  function installV1066(){
    installFinancePaginationV1066();
    installJbrPreviewV1066();
    try{jbrActualLengthPreviewV1066()}catch(_){}
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',installV1066,{once:true});
  }else{
    installV1066();
  }
})();
