
/* V1.0.67 - Dispatch follows saved Packing Batch boxes
   Select one or more packed cartons; roll counts come from Packing and are locked. */
(function(){
  function dispatchUsedBoxesV1067(r){
    const shared=spgsPhysicalPackingV1141(r);
    if(shared)return shared.used;
    const used={};
    (r?.dispatches||[]).forEach(d=>{
      (d?.boxes||[]).forEach(b=>{
        const key=String(b?.boxNo||'');
        used[key]=(used[key]||0)+Number(b?.qty||0);
      });
    });
    return used;
  }

  function dispatchLooseUsedV1067(r){
    const shared=spgsPhysicalPackingV1141(r);
    if(shared)return shared.looseUsed;
    return (r?.dispatches||[]).reduce((n,d)=>n+Number(d?.loose||0),0);
  }

  function dispatchBatchSummaryV1067(r){
    const shared=spgsPhysicalPackingV1141(r);
    const physical=shared?.snap||r?.packing;
    const boxes=Array.isArray(physical?.boxes)?physical.boxes:[];
    const boxRolls=boxes.reduce((n,b)=>n+Number(b?.rolls||0),0);
    const loose=Number(physical?.loose||0);
    return {
      boxes,
      boxRolls,
      loose,
      total:boxRolls+loose
    };
  }

  window.dispatchToggleAllBoxesV1067=function(checked){
    document.querySelectorAll('#dispatchBoxPick .dispatch-box-check:not(:disabled)').forEach(c=>{
      c.checked=!!checked;
      const card=c.closest('.dispatch-pack-box-v1067');
      if(card)card.classList.toggle('selected',!!checked);
    });
    updateDispatchTotalV81();
  };

  window.dispatchBoxChangedV1067=function(el){
    const card=el?.closest?.('.dispatch-pack-box-v1067');
    if(card)card.classList.toggle('selected',!!el.checked);

    const available=[...document.querySelectorAll('#dispatchBoxPick .dispatch-box-check:not(:disabled)')];
    const all=available.length>0&&available.every(c=>c.checked);
    const master=$('dispatchSelectAllV1067');
    if(master)master.checked=all;

    updateDispatchTotalV81();
  };

  window.dispatchLooseToggleV1067=function(el){
    const r=(state.productionRequests||[]).find(x=>x.id===$('dispatchLoadReqId')?.value);
    if(!r)return;
    const remaining=Math.max(
      0,
      Number(r?.packing?.loose||0)-dispatchLooseUsedV1067(r)
    );
    $('dispatchLoose').value=el.checked?String(remaining):'0';
    $('dispatchLoosePackCardV1067')?.classList.toggle('selected',!!el.checked);
    updateDispatchTotalV81();
  };

  window.openDispatchLoadingV81=function(id){
    const r=(state.productionRequests||[]).find(x=>x.id===id);
    if(!r||flowIndexV81(r.status)<flowIndexV81('Finished')){
      return toast('Only a Finished production job can be dispatched');
    }

    const available=productionAvailableV81(r);
    if(!(available>0))return toast('No finished balance remains');

    const batch=dispatchBatchSummaryV1067(r);
    if(!batch.boxes.length && !(batch.loose>0)){
      return toast('No Packing Batch is recorded for this production job');
    }

    const used=dispatchUsedBoxesV1067(r);
    const looseUsed=dispatchLooseUsedV1067(r);
    const looseRemaining=Math.max(0,batch.loose-looseUsed);

    $('dispatchLoadReqId').value=id;
    $('dispatchLoadingMeta').innerHTML=
      `<b>${esc(r.orderNo)}</b> • ${esc(r.customerName||'-')} • ${esc(r.size||'-')} • ${esc(r.material||'-')}<br>`+
      `Packing Batch: ${batch.boxes.length} boxes • ${money(batch.boxRolls)} boxed rolls${batch.loose?` • ${money(batch.loose)} loose`:''} • Available to dispatch ${money(available)} rolls`;

    $('dispatchLoadDate').value=today();
    $('dispatchLoadCarrier').value='';
    $('dispatchLoadNote').value='';
    $('dispatchLoose').value='0';
    $('dispatchLoose').readOnly=true;

    const modal=$('dispatchNoteModal');
    const title=modal?.querySelector('.modal-head b');
    if(title)title.textContent='Dispatch Packing Batch';

    const notice=modal?.querySelector('.modal-body > .notice');
    if(notice){
      notice.innerHTML=
        '<b>Select the packed boxes that are physically leaving now.</b> '+
        'Box quantities come directly from the Packing Count and cannot be edited. '+
        'You can dispatch one box, several boxes, or all available boxes in the same Dispatch Note.';
    }

    const boxRows=batch.boxes.map((b,i)=>{
      const boxNo=String(b?.boxNo||String(i+1).padStart(2,'0'));
      const packed=Math.max(0,Number(b?.rolls||0));
      const already=Math.max(0,Number(used[boxNo]||0));
      const remaining=Math.max(0,packed-already);
      const disabled=remaining<=0||remaining>available+.001;
      const shared=spgsPhysicalPackingV1141(r);
      const allocationWarning=shared&&remaining>available+.001?'Whole box exceeds this source job allocation; reconcile batch allocation before dispatch.':'';

      return `
        <label class="dispatch-pack-box-v1067 ${disabled?'done':''}">
          <div class="dispatch-pack-check-v1067">
            <input
              class="dispatch-box-check"
              type="checkbox"
              data-i="${i}"
              onchange="dispatchBoxChangedV1067(this)"
              ${disabled?'disabled':''}
            >
          </div>
          <div class="dispatch-pack-box-main-v1067">
            <b>Box ${esc(boxNo)}</b>
            <span>${esc(b?.note||'Packed carton')}</span>
            ${allocationWarning?`<span class="spgs-allocation-warning-v1141">${esc(allocationWarning)}</span>`:''}
          </div>
          <div class="dispatch-pack-kpi-v1067">
            <span>Packed</span>
            <b>${money(packed)}</b>
          </div>
          <div class="dispatch-pack-kpi-v1067">
            <span>Already Dispatched</span>
            <b>${money(already)}</b>
          </div>
          <div class="dispatch-pack-kpi-v1067 available">
            <span>${disabled?'Status':'Dispatch Qty'}</span>
            <b>${disabled?'Dispatched':money(remaining)}</b>
          </div>
          <input
            class="dispatch-box-qty"
            data-i="${i}"
            type="number"
            min="${remaining}"
            max="${remaining}"
            value="${remaining}"
            readonly
            hidden
          >
        </label>`;
    }).join('');

    const selectableCount=batch.boxes.filter((b,i)=>{
      const boxNo=String(b?.boxNo||String(i+1).padStart(2,'0'));
      const left=Math.max(0,Number(b?.rolls||0)-Number(used[boxNo]||0));
      return left>0&&left<=available+.001;
    }).length;

    const looseCard=batch.loose>0?`
      <label id="dispatchLoosePackCardV1067" class="dispatch-pack-box-v1067 loose ${looseRemaining<=0?'done':''}">
        <div class="dispatch-pack-check-v1067">
          <input
            id="dispatchLooseToggleV1067"
            type="checkbox"
            onchange="dispatchLooseToggleV1067(this)"
            ${looseRemaining<=0?'disabled':''}
          >
        </div>
        <div class="dispatch-pack-box-main-v1067">
          <b>Loose Rolls</b>
          <span>Not packed inside a carton</span>
        </div>
        <div class="dispatch-pack-kpi-v1067"><span>Packed</span><b>${money(batch.loose)}</b></div>
        <div class="dispatch-pack-kpi-v1067"><span>Already Dispatched</span><b>${money(looseUsed)}</b></div>
        <div class="dispatch-pack-kpi-v1067 available">
          <span>${looseRemaining<=0?'Status':'Dispatch Qty'}</span>
          <b>${looseRemaining<=0?'Dispatched':money(looseRemaining)}</b>
        </div>
      </label>`:'';

    $('dispatchBoxPick').innerHTML=`
      <div class="dispatch-pack-batch-head-v1067">
        <div>
          <b>Packing Batch ${spgsPhysicalPackingV1141(r)?'• Shared physical cartons':''}</b>
          <span>${money(batch.total)} total packed rolls • ${batch.boxes.length} cartons</span>
        </div>
        ${selectableCount>0?`
          <label class="dispatch-select-all-v1067">
            <input id="dispatchSelectAllV1067" type="checkbox" onchange="dispatchToggleAllBoxesV1067(this.checked)">
            Select all available boxes
          </label>`:''}
      </div>
      <div class="dispatch-pack-list-v1067">${boxRows}${looseCard}</div>`;

    /* Existing field is kept for compatibility with the existing save function,
       but its value is controlled only by the Loose Rolls packing card above. */
    const looseField=$('dispatchLoose')?.closest('.field');
    if(looseField)looseField.style.display='none';

    updateDispatchTotalV81();
    $('dispatchNoteModal').classList.add('show');
  };

  /* After save/close, restore compatibility field visibility for any older path. */
  const baseConfirm=window.confirmDispatchLoadingV81;
  if(typeof baseConfirm==='function'){
    window.confirmDispatchLoadingV81=function(){
      const result=baseConfirm.apply(this,arguments);
      const looseField=$('dispatchLoose')?.closest('.field');
      if(looseField)looseField.style.display='';
      return result;
    };
    try{confirmDispatchLoadingV81=window.confirmDispatchLoadingV81}catch(_){}
  }

  /* V1066 intermediate picker is no longer part of the active flow. */
  try{closeModal('boxDispatchPickerV1066')}catch(_){}
})();
