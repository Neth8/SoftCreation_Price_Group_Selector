
/* V1.0.46 - Grouped Packing + Core Usage + Supabase Packing Snapshot
   Separate from Factory inventory. */
(function(){
  const PACK_REST_V1057='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1';
  const PACK_WORKSPACE_V1057='softcreation_main';
  const PACK_KEY_STORE_V1057='spgs_supabase_browser_key_v1';
  const PACK_TABLE_V1057='spgs_product_packing_batches';

  function packApiKeyV1057(){
    let key=localStorage.getItem(PACK_KEY_STORE_V1057)||'';
    if(!key){
      key=prompt('SoftCreation cloud setup\n\nPaste the FULL Supabase anon / publishable key for qyxgamverzdmhtvezbft:')||'';
      key=key.trim();
      if(key)localStorage.setItem(PACK_KEY_STORE_V1057,key);
    }
    return key;
  }

  function packHeadersV1057(extra={}){
    const key=packApiKeyV1057();
    if(!key)throw new Error('Supabase key is not configured.');
    const h={apikey:key,...extra};
    if(key.startsWith('eyJ'))h.Authorization='Bearer '+key;
    return h;
  }

  async function packFetchV1057(path,options={}){
    const res=await fetch(PACK_REST_V1057+path,{
      ...options,
      headers:packHeadersV1057(options.headers||{})
    });
    if(!res.ok){
      const body=await res.text().catch(()=>res.statusText);
      throw new Error(`Supabase ${res.status}: ${body.slice(0,500)}`);
    }
    if(res.status===204)return null;
    const text=await res.text();
    return text?JSON.parse(text):null;
  }

  function packGroupV1057(encodedKey){
    const key=decodeURIComponent(encodedKey||'');
    try{
      if(typeof groupByKeyV1040==='function'){
        const g=groupByKeyV1040(encodedKey);
        if(g)return g;
      }
    }catch(_){}
    try{
      return (productionProductGroupsV103()||[]).find(x=>x.key===key)||null;
    }catch(_){return null}
  }

  function packProductWidthV1057(g){
    const nums=String(g?.size||'').match(/\d+(?:\.\d+)?/g)||[];
    return Number(nums[0]||0);
  }

  window.packingCoreCalcV1057=function(total,g){
    const fallbackWidth=packProductWidthV1057(g);
    const rollWidthMm=Math.max(0,Number($('packRollWidthV1057')?.value||fallbackWidth||0));
    const coreStickLengthMm=Math.max(1,Number($('packCoreStickLengthV1057')?.value||1000));
    const rolls=Math.max(0,Number(total||0));
    const coreMmUsed=rolls*rollWidthMm;
    const coreEquivalent=coreStickLengthMm>0?coreMmUsed/coreStickLengthMm:0;
    const coreSticksRequired=coreMmUsed>0?Math.ceil(coreMmUsed/coreStickLengthMm):0;
    const coreBalanceMm=coreSticksRequired>0?Math.max(0,(coreSticksRequired*coreStickLengthMm)-coreMmUsed):0;
    const piecesPerStick=rollWidthMm>0?Math.floor(coreStickLengthMm/rollWidthMm):0;
    return {rollWidthMm,coreStickLengthMm,coreMmUsed,coreEquivalent,coreSticksRequired,coreBalanceMm,piecesPerStick};
  };

  function packCurrentGroupV1057(){
    const marker=$('packingReqId')?.value||'';
    if(!marker.startsWith('BATCHV1040::'))return null;
    return packGroupV1057(marker.slice('BATCHV1040::'.length));
  }

  function updatePackingLiveV1057(){
    const modal=$('packingModal');
    if(!modal?.classList.contains('show'))return;
    const marker=$('packingReqId')?.value||'';
    if(!marker.startsWith('BATCHV1040::'))return;

    const boxes=readBoxesV81('pack');
    const boxRolls=boxesTotalV81(boxes);
    const loose=Math.max(0,Number($('packLoose')?.value||0));
    const total=boxRolls+loose;
    const planned=Math.max(0,Number(modal.dataset.jbrPlannedRolls||0));
    const max=Math.max(0,Number(modal.dataset.jbrMaxRolls||planned||0));
    const actualReceived=Math.max(0,Number($('packActualReceivedV1120')?.value||0));
    const unpacked=Math.max(0,actualReceived-total);
    const overPacked=Math.max(0,total-actualReceived);
    const overPhysical=Math.max(0,actualReceived-max);
    const variance=actualReceived-planned;
    const shortage=Math.max(0,-variance);
    const overProduction=Math.max(0,variance);
    const g=packCurrentGroupV1057();
    const core=window.packingCoreCalcV1057(total,g);
    const pitchMm=Number(modal.dataset.packingWastePitchMmV2026||0);
    const pcsPerRoll=Number(modal.dataset.packingWastePcsV2026||g?.pcs||0);
    // Calculate from JBR material input, NOT the finished label-roll width.
    // This measures unused / lost *material equivalent* against physical capacity.
    const jbrInputSqm=Number(modal.dataset.jbrWasteInputSqmV2026||0);
    const jbrPhysicalMax=Number(modal.dataset.jbrWasteMaxRollsV2026||0);
    const sqMPerRoll=jbrInputSqm>0&&jbrPhysicalMax>0?jbrInputSqm/jbrPhysicalMax:null;
    const remainingRollEquivalent=Math.max(0,jbrPhysicalMax-total);
    const wasteSqm=sqMPerRoll!==null?remainingRollEquivalent*sqMPerRoll:null;
    const wasteSqmText=wasteSqm===null?'Not available':wasteSqm.toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3})+' m²';

    const grand=$('packGrand');
    if(grand){
      grand.classList.toggle('pack-over-v1057',overPacked>0||overPhysical>0);
      grand.innerHTML=`
        <div class="pack-live-grid-v1057">
          <div><span>Boxes</span><b>${boxes.length}</b><small>${money(boxRolls)} rolls</small></div>
          <div><span>Loose</span><b>${money(loose)}</b><small>rolls</small></div>
          <div><span>Packed Total</span><b>${money(total)}</b><small>${unpacked>0?`${money(unpacked)} roll(s) not packed — count variance / potential waste`:overPacked>0?`OVER RECEIVED BY ${money(overPacked)}`:'matches received'}</small></div>
          <div><span>Actual Received</span><b>${money(actualReceived)}</b><small>physically counted at Packing</small></div>
        </div>`;
    }

    const jumboLength=Number(modal.dataset.jbrTotalLengthV1140||0);
    const jumboMax=Number(modal.dataset.jbrMaxRolls||0);
    // Metre equivalent is a planning metric: not physical waste until classified.
    const theoreticalRollDifference=Math.max(0,jumboMax-actualReceived);
    const meterEquivalent=jumboMax>0?theoreticalRollDifference*(jumboLength/jumboMax):0;
    const receiptSummary=$('packReceiptSummaryV1120');
    if(receiptSummary){
      const varianceText=variance===0?'Matches JBR target':variance<0?`${money(shortage)} roll shortage / process loss`:`${money(overProduction)} roll over target`;
      receiptSummary.innerHTML=`
        <div><span>JBR Planned Target</span><b>${money(planned)}</b><small>auto allocation from Requested</small></div>
        <div><span>JBR Physical Maximum</span><b>${money(max)}</b><small>combined Max Full Rolls</small></div>
        <div><span>Unproduced Roll Equivalent</span><b>${money(theoreticalRollDifference)} rolls</b><small>max rolls − physically received</small></div>
        <div><span>Unproduced Length Equivalent</span><b>${jumboLength>0?meterEquivalent.toFixed(2)+' m':'—'}</b><small>estimate only; confirm scrap vs reusable material</small></div>
        <div class="${variance<0?'shortage':variance>0?'over':''}"><span>Production Variance</span><b>${variance>0?'+':''}${money(variance)}</b><small>${varianceText}</small></div>
        <div><span>Count Reconciliation</span><b>${money(total)} / ${money(actualReceived)}</b><small>${total===actualReceived?'fully reconciled':`${money(Math.abs(actualReceived-total))} roll difference`}</small></div>
        <div class="packing-waste-indicator-v2026 pack-waste-sqm-live-v2026"><span>Potential Material Wastage — JBR Based</span><b>${wasteSqmText}</b><small>${money(remainingRollEquivalent)} roll equivalent · JBR maximum ${money(jbrPhysicalMax)} − packed ${money(total)}</small><small>${sqMPerRoll===null?'Needs valid JBR width, length, and maximum rolls':`${sqMPerRoll.toFixed(4)} m² per roll · JBR input ${jbrInputSqm.toFixed(3)} m²`} · Includes unproduced or reusable material; verify before classifying as scrap</small></div>`;
    }

    if($('packCoreSummaryV1057')){
      $('packCoreSummaryV1057').innerHTML=`
        <div><span>Roll Core Width</span><b>${money(core.rollWidthMm)} mm</b></div>
        <div><span>Total Core Used</span><b>${money(core.coreMmUsed)} mm</b><small>${core.coreEquivalent.toFixed(3)} × ${money(core.coreStickLengthMm)}mm core</small></div>
        <div><span>Core Sticks Required</span><b>${money(core.coreSticksRequired)}</b><small>${money(core.piecesPerStick)} roll cores / full stick</small></div>
        <div><span>Reusable Core Balance</span><b>${money(core.coreBalanceMm)} mm</b><small>remaining from issued sticks</small></div>`;
    }

    if($('packLimitNoteV1057')){
      let msg='';
      let danger=false;
      if(overPhysical>0){danger=true;msg=`<b>Invalid received quantity:</b> Actual Received is ${money(overPhysical)} rolls above the combined JBR physical maximum.`;}
      else if(overPacked>0){danger=true;msg=`<b>Packing mismatch:</b> boxes + loose are ${money(overPacked)} rolls above Actual Received.`;}
      else if(unpacked>0){msg=`<b>Packing waste / shortfall:</b> ${money(unpacked)} received roll(s) are not in Packed Total. This difference will be recorded for Finance as packing count variance (confirm physical scrap).`;}
      else if(variance<0){msg=`<b>Production shortage / waste:</b> received ${money(shortage)} rolls below the JBR planned target. This variance will be recorded when packing is saved.`;}
      else if(variance>0){msg=`<b>Production over target:</b> received ${money(overProduction)} rolls above the JBR planned target. This variance will be recorded when packing is saved.`;}
      else{msg='<b>Production count matched:</b> Actual Received matches the JBR planned target and the packing count is reconciled.';}
      $('packLimitNoteV1057').innerHTML=msg;
      $('packLimitNoteV1057').classList.toggle('danger',danger);
    }

    try{
      const el=$('packBoxTotal');
      if(el)el.textContent=`${boxes.length} box(es) • ${money(boxRolls)} rolls`;
    }catch(_){}
  }
  window.updatePackingLiveV1057=updatePackingLiveV1057;

  window.moveLooseToNewBoxV1057=function(){
    const loose=Math.max(0,Math.floor(Number($('packLoose')?.value||0)));
    if(!(loose>0))return toast('There are no loose rolls to move');
    addBoxRowV81('pack',{rolls:loose,note:'Moved from loose rolls'});
    $('packLoose').value='0';
    updatePackingLiveV1057();
  };

  function ensurePackingCoreUiV1057(g){
    const modal=$('packingModal');
    if(!modal)return;
    const body=modal.querySelector('.modal-body');
    if(!body)return;

    if(!$('packLimitNoteV1057')){
      const grand=$('packGrand');
      const wrap=document.createElement('div');
      wrap.id='packV1057Controls';
      const savedReceivedV1120=Number(modal.dataset.savedActualReceivedV1120||0);
      const plannedReceivedV1120=Number(modal.dataset.jbrPlannedRolls||0);
      wrap.innerHTML=`
        <div class="section">PRODUCTION RECEIPT / ACTUAL COUNT</div>
        <div class="pack-receipt-input-v1120">
          <div class="field">
            <label>Actual Rolls Received *</label>
            <input id="packActualReceivedV1120" type="number" min="0" step="1" value="${savedReceivedV1120>0?savedReceivedV1120:plannedReceivedV1120}" oninput="updatePackingLiveV1057()">
            <div class="hint">Packing user physically counts the rolls received from production. This final actual quantity records shortage, waste or over-production.</div>
          </div>
        </div>
        <div id="packReceiptSummaryV1120" class="pack-receipt-summary-v1120"></div>
        <div id="packLimitNoteV1057" class="pack-limit-note-v1057"></div>

        <div class="pack-loose-action-v1057">
          <button class="btn ghost sm" type="button" onclick="moveLooseToNewBoxV1057()">Move Loose Rolls to New Box</button>
          <span>Optional: loose rolls can remain loose, or move them into another carton before saving.</span>
        </div>

        <div class="section">CORE USAGE</div>
        <div class="grid pack-core-inputs-v1057">
          <div class="field">
            <label>Finished Roll Core Width (mm)</label>
            <input id="packRollWidthV1057" type="number" min="0.01" step="0.01" value="${packProductWidthV1057(g)||''}" oninput="updatePackingLiveV1057()">
            <div class="hint">Auto-filled from the first product size dimension. Example: 58mm × 60mm → 58mm core width.</div>
          </div>
          <div class="field">
            <label>Full Core Stick Length (mm)</label>
            <input id="packCoreStickLengthV1057" type="number" min="1" step="1" value="1000" oninput="updatePackingLiveV1057()">
            <div class="hint">Editable. Default = 1000mm.</div>
          </div>
        </div>
        <div id="packCoreSummaryV1057" class="pack-core-summary-v1057"></div>`;

      if(grand)grand.insertAdjacentElement('afterend',wrap);
      else body.appendChild(wrap);
    }else{
      const w=$('packRollWidthV1057');
      if(w && !(Number(w.value)>0))w.value=packProductWidthV1057(g)||'';
      const actualInput=$('packActualReceivedV1120');
      const savedActual=Number(modal.dataset.savedActualReceivedV1120||0);
      const plannedActual=Number(modal.dataset.jbrPlannedRolls||0);
      if(actualInput && !(Number(actualInput.value)>0))actualInput.value=String(savedActual>0?savedActual:plannedActual);
    }

    // Existing box row input handler only updated the old box total.
    // Attach event capture so every box edit also refreshes JBR/core totals.
    if(!modal.dataset.packV1057Events){
      modal.dataset.packV1057Events='1';
      modal.addEventListener('input',e=>{
        if(e.target?.classList?.contains('pack-box-rolls') ||
           e.target?.id==='packLoose' ||
           e.target?.id==='packActualReceivedV1120' ||
           e.target?.id==='packRollWidthV1057' ||
           e.target?.id==='packCoreStickLengthV1057'){
          updatePackingLiveV1057();
        }
      });
      modal.addEventListener('click',e=>{
        if(e.target?.closest?.('#packBoxRows .btn.red'))setTimeout(updatePackingLiveV1057,0);
      });
    }
    updatePackingLiveV1057();
  }

  window.savePackingCloudSnapshotV1057=async function(ctx){
    const {g,jobs,boxes,loose,total,qc,note,allQC,core}=ctx||{};
    if(!g)return false;

    let jbrActual=0;
    let jbrTheoretical=0;
    try{
      if(typeof window.jbrCloudStatsV1055==='function'){
        const stats=await window.jbrCloudStatsV1055(g.key,true);
        jbrActual=Number(stats?.actualCut||0);
        jbrTheoretical=Number(stats?.theoretical||0);
      }
    }catch(e){
      toast(`Packing database save blocked: JBR data unavailable. ${e.message}`);
      return false;
    }

    const actualReceived=Math.max(0,Math.floor(Number($('packActualReceivedV1120')?.value||0)));
    if(!(actualReceived>0)){toast('Enter the Actual Rolls Received from production.');return false;}
    if(actualReceived>jbrTheoretical){toast(`Actual Rolls Received cannot exceed combined JBR Max Full Rolls. Maximum ${money(jbrTheoretical)}, entered ${money(actualReceived)}.`);return false;}
    if(Number(total)>actualReceived){toast(`Packed total cannot exceed Actual Rolls Received. Received ${money(actualReceived)}, packed ${money(total)}.`);return false;}
    const productionVariance=actualReceived-jbrActual;

    const payload={
      workspace:PACK_WORKSPACE_V1057,
      product_key:g.key,
      product_size:String(g.size||''),
      material:String(g.material||''),
      layout:String(g.layout||''),
      pcs_per_roll:Number(g.pcs||0),
      unit:String(g.unit||'Rolls'),
      source_job_ids:(jobs||[]).map(r=>String(r.id)),
      stage:allQC?'QC Approval':'QC Check Submission',
      boxes:(boxes||[]).map((b,i)=>({
        box_no:String(b.boxNo||String(i+1).padStart(2,'0')),
        roll_count:Number(b.rolls||0),
        note:String(b.note||'')
      })),
      box_count:(boxes||[]).length,
      box_rolls:(boxes||[]).reduce((n,b)=>n+Number(b.rolls||0),0),
      loose_rolls:Number(loose||0),
      packed_total:Number(total||0),
      jbr_actual_cut_rolls:jbrActual,
      jbr_planned_rolls:jbrActual,
      jbr_theoretical_max_rolls:jbrTheoretical,
      actual_received_rolls:actualReceived,
      production_variance_rolls:productionVariance,
      production_shortage_rolls:Math.max(0,-productionVariance),
      production_over_rolls:Math.max(0,productionVariance),
      roll_width_mm:Number(core?.rollWidthMm||0),
      core_stick_length_mm:Number(core?.coreStickLengthMm||1000),
      core_mm_used:Number(core?.coreMmUsed||0),
      core_equivalent:Number(core?.coreEquivalent||0),
      core_sticks_required:Number(core?.coreSticksRequired||0),
      core_balance_mm:Number(core?.coreBalanceMm||0),
      qc_result:String(qc||'Passed'),
      note:String(note||'') + '\n[PACK_WASTE_V1 actual=' + actualReceived + ';packed=' + Number(total||0) + ';waste=' + Math.max(0,actualReceived-Number(total||0)) + ']',
      packed_by_username:String(currentUser?.username||''),
      packed_by_display:String(currentUser?.display||currentUser?.username||'User')
    };

    try{
      await packFetchV1057(`/${PACK_TABLE_V1057}`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Prefer':'return=minimal'},
        body:JSON.stringify(payload)
      });
      return true;
    }catch(e){
      console.error(e);
      toast(`Packing was NOT saved to database: ${e.message}`);
      return false;
    }
  };

  function installPackingV1057(){
    if(window.__packingV1057Installed)return;
    window.__packingV1057Installed=true;

    const baseOpen=window.openGroupedPackingV1040;
    if(typeof baseOpen==='function'){
      window.openGroupedPackingV1040=async function(encodedKey){
        const g=packGroupV1057(encodedKey);
        const result=await baseOpen.apply(this,arguments);
        setTimeout(()=>{
          const modal=$('packingModal');
          if(!modal?.classList.contains('show')||!g)return;
          ensurePackingCoreUiV1057(g);
        },20);
        return result;
      };
      try{openGroupedPackingV1040=window.openGroupedPackingV1040}catch(_){}
    }

    // Make old global helper show the richer live calculation.
    window.updatePackGrandV81=updatePackingLiveV1057;
    try{updatePackGrandV81=window.updatePackGrandV81}catch(_){}

    const baseAdd=window.addBoxRowV81||addBoxRowV81;
    window.addBoxRowV81=function(){
      const r=baseAdd.apply(this,arguments);
      setTimeout(updatePackingLiveV1057,0);
      return r;
    };
    try{addBoxRowV81=window.addBoxRowV81}catch(_){}

    const baseRemove=window.removeBoxRowV81||removeBoxRowV81;
    window.removeBoxRowV81=function(){
      const r=baseRemove.apply(this,arguments);
      setTimeout(updatePackingLiveV1057,0);
      return r;
    };
    try{removeBoxRowV81=window.removeBoxRowV81}catch(_){}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installPackingV1057,{once:true});
  else installPackingV1057();
})();
