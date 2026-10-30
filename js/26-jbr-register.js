
/* V1.0.45 - Products > Open Product > JBR In
   Supabase-backed JBR production register.
   Separate from Factory inventory. */
(function(){
  const JBR_TABLE_V1055='spgs_product_jbrs';
  const JBR_REST_V1056='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1';
  const JBR_WORKSPACE_V1056='softcreation_main';
  const JBR_KEY_STORE_V1056='spgs_supabase_browser_key_v1';
  const JBR_LOCAL_MIGRATION_KEY_V1055='softcreation_product_jbr_batches_v1054';
  const jbrCloudCacheV1055=new Map();

  function jbrApiKeyV1056(){
    let key=localStorage.getItem(JBR_KEY_STORE_V1056)||'';
    if(!key){
      key=prompt('SoftCreation cloud setup\n\nPaste the FULL Supabase anon / publishable key for qyxgamverzdmhtvezbft:')||'';
      key=key.trim();
      if(key)localStorage.setItem(JBR_KEY_STORE_V1056,key);
    }
    return key;
  }

  function jbrHeadersV1056(extra={}){
    const key=jbrApiKeyV1056();
    if(!key)throw new Error('Supabase key is not configured.');
    const h={apikey:key,...extra};
    if(key.startsWith('eyJ'))h.Authorization='Bearer '+key;
    return h;
  }

  function jbrGroupV1055(encodedKey){
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

  function jbrJobsV1055(g){
    if(!g)return [];
    try{
      if(typeof activeBatchJobsV1040==='function')return activeBatchJobsV1040(g)||[];
    }catch(_){}
    try{
      if(typeof activeJobsForGroupV1038==='function')return activeJobsForGroupV1038(g)||[];
    }catch(_){}
    return Array.isArray(g.jobs)
      ? g.jobs.filter(r=>!['Finished','Dispatched','Received','GRN Closed'].includes(String(r.status||'')))
      : [];
  }

  function jbrFlowIndexV1055(status){
    try{
      if(typeof idxV1040==='function')return idxV1040(status);
      if(typeof factoryFlowIndexV1038==='function')return factoryFlowIndexV1038(status);
    }catch(_){}
    const flow=['Requested','Approved','Planned','In Production','QC Check','Finished','Dispatched','Received','GRN Closed'];
    const i=flow.indexOf(String(status||'Requested'));
    return i<0?0:i;
  }

  function jbrCanOpenV1055(g){
    const jobs=jbrJobsV1055(g);
    return jobs.length && jobs.every(r=>jbrFlowIndexV1055(r.status)>=jbrFlowIndexV1055('In Production'));
  }

  function jbrParseSizeV1055(size){
    const nums=String(size||'').match(/\d+(?:\.\d+)?/g)||[];
    return {width:Number(nums[0]||0),height:Number(nums[1]||0)};
  }

  function jbrCodeV1055(row){
    if(row?.jbr_code)return String(row.jbr_code);
    if(row?.jbr_seq)return 'JBR-'+String(row.jbr_seq).padStart(5,'0');
    return 'JBR';
  }

  function jbrRowToUiV1055(r){
    return {
      id:r.id,
      code:jbrCodeV1055(r),
      productKey:r.product_key,
      productSize:r.product_size,
      material:r.material,
      layout:r.layout,
      requestedPcsPerRoll:Number(r.pcs_per_roll||0),
      unit:r.unit||'Rolls',
      jbrWidth:Number(r.jbr_width_mm||0),
      jbrLengthM:Number(r.jbr_length_m||0),
      labelWidth:Number(r.label_width_mm||0),
      labelHeight:Number(r.label_height_mm||0),
      gap:Number(r.gap_mm||0),
      pitch:Number(r.pitch_mm||0),
      lanes:Number(r.lanes||0),
      labelsPerLane:Number(r.labels_per_lane||0),
      theoreticalLabels:Number(r.theoretical_labels||0),
      theoreticalRolls:Number(r.theoretical_rolls||0),
      actualCutRolls:Number(r.actual_cut_rolls||0),
      status:r.process_status||'Not Die Cut',
      note:r.note||'',
      createdBy:r.created_by_display||r.created_by_username||'User',
      createdByUser:r.created_by_username||'',
      createdAt:r.created_at||'',
      updatedAt:r.updated_at||''
    };
  }

  function jbrWasteV1055(x){
    if(String(x?.status||'')!=='Fully Die Cut'){
      return {isWaste:false,wasteRolls:0,wastePct:null,label:'Reusable balance — not waste'};
    }
    const max=Math.max(0,Number(x.theoreticalRolls||0));
    const actual=Math.max(0,Number(x.actualCutRolls||0));
    const waste=Math.max(0,max-actual);
    return {
      isWaste:true,
      wasteRolls:waste,
      wastePct:max>0?(waste/max)*100:0,
      label:`${money(waste)} rolls (${max>0?((waste/max)*100).toFixed(1):'0.0'}%)`
    };
  }

  /* V1.1.28 JBR cut planning.
     Requested quantity is a suggested target only. Factory may deliberately
     cut more rolls for stock, up to the physical Max Full Rolls of the JBR. */
  let jbrRequestedTotalV1120=0;
  let jbrExistingAllocatedV1120=0;
  let jbrActualManualV1128=false;

  window.jbrMarkActualManualV1128=function(){
    jbrActualManualV1128=true;
    try{jbrActualLengthPreviewV1066()}catch(_){}
    const input=$('jbrActualRollsV1055');
    const hint=$('jbrActualAutoHintV1120');
    if(input&&hint){
      const entered=Math.max(0,Math.floor(Number(input.value||0)));
      const requested=Math.max(0,Number(jbrRequestedTotalV1120||0));
      const existing=Math.max(0,Number(jbrExistingAllocatedV1120||0));
      const remaining=Math.max(0,requested-existing);
      const extra=Math.max(0,entered-remaining);
      hint.innerHTML=extra>0
        ? `Manual cut plan <b>${money(entered)}</b>. This is <b>+${money(extra)}</b> above the remaining requested ${money(remaining)} and will be treated as extra factory output / stock.`
        : `Manual cut plan <b>${money(entered)}</b>. Remaining requested target is ${money(remaining)}.`;
    }
  };

  // Production run plan is derived only from the flatbed meter reading plus
  // confirmed JBR widths/lengths and label geometry. It is NOT actual stock.
  function jbrAutoActualV1120(theoreticalRolls){
    const input=$('jbrActualRollsV1055');
    const hint=$('jbrActualAutoHintV1120');
    const labelWidth=Number($('jbrLabelWidthV1055')?.value||0);
    const labelHeight=Number($('jbrLabelHeightV1055')?.value||0);
    const gap=Number($('jbrGapV1055')?.value||0);
    const pitch=labelHeight+Math.max(0,gap);
    const pcs=Number($('jbrPcsV1055')?.value||0);
    const entries=typeof jbrRunEntriesV1140!=='undefined'?jbrRunEntriesV1140:[];
    const validReading=entries.length>0&&entries.every(r=>Number(r.feed)>0&&r.count!==''&&Number.isSafeInteger(Number(r.count))&&Number(r.count)>=0);
    const meters=validReading?jbrRunMetersV1140():0;
    const validSetup=labelWidth>0&&pitch>0&&pcs>0&&entries.length>0&&entries.every(r=>Number(r.width)>0&&Number(r.length)>0);
    let remainingFeed=0,calculatedRolls=0,maxFull=0;
    if(validSetup){
      entries.forEach(r=>{
        const length=Number(r.length),lanes=Math.floor(Number(r.width)/labelWidth);
        const availableLabels=lanes*Math.floor(length*1000/pitch);
        maxFull+=Math.floor(availableLabels/pcs);
        const measured=jbrRunMeterSingleV1140(r);
        if(measured>length+0.0001)remainingFeed+=measured-length;
        const consumed=Math.max(0,Math.min(measured,length));
        calculatedRolls+=Math.floor(lanes*Math.floor(consumed*1000/pitch)/pcs);
      });
    }
    // Round full rolls down; never invent stock from the meter estimate.
    const maxFullRolls=Math.floor(maxFull+1e-9);
    const auto=validReading&&validSetup&&remainingFeed<0.0001
      ?Math.min(maxFullRolls,calculatedRolls) : 0;
    if(input){
      input.value=String(auto);
      input.readOnly=true;
      input.setAttribute('readonly','');
      input.setAttribute('aria-readonly','true');
      input.max=String(maxFullRolls);
      input.title='Calculated planning quantity from machine feed and confirmed JBR details. Packing verifies actual rolls.';
    }
    jbrActualManualV1128=false;
    if(hint){
      if(!validReading)hint.textContent='Enter feed/punch length and machine punch count above to calculate the cut-roll plan.';
      else if(!validSetup)hint.textContent='Confirm each JBR width and the label setup; length is calculated from machine readings.';
      else if(remainingFeed>0.0001)hint.textContent='Machine reading exceeds the total recorded JBR supply. Correct inputs before saving.';
      else hint.innerHTML=`Calculated <b>${money(auto)} planning rolls</b> from <b>${jbrRunFmtV1140(meters)} m</b> of measured feed, ${entries.length} JBR(s), and the confirmed label setup. Supply maximum: <b>${money(maxFullRolls)}</b> rolls. Packing confirms actual production; this is not stock.`;
    }
    return {maxFull:maxFullRolls,auto,valid:validReading&&validSetup&&remainingFeed<0.0001};
  }

  function jbrCalcV1055(){
    if(typeof jbrRunEntriesV1140!=='undefined'&&jbrRunEntriesV1140.length)jbrRefreshCalculatedLengthsV2026();
    const jbrWidth=Number($('jbrWidthV1055')?.value||0);
    const jbrLengthM=Number($('jbrLengthV1055')?.value||0);
    const labelWidth=Number($('jbrLabelWidthV1055')?.value||0);
    const labelHeight=Number($('jbrLabelHeightV1055')?.value||0);
    const gap=Number($('jbrGapV1055')?.value||0);
    const pcsPerRoll=Number($('jbrPcsV1055')?.value||0);

    const lanes=(jbrWidth>0&&labelWidth>0)?Math.floor(jbrWidth/labelWidth):0;
    const pitch=labelHeight>0?labelHeight+Math.max(0,gap):0;
    const labelsPerLane=(jbrLengthM>0&&pitch>0)?Math.floor((jbrLengthM*1000)/pitch):0;
    const theoreticalLabels=lanes*labelsPerLane;
    const theoreticalRolls=pcsPerRoll>0?Math.floor(theoreticalLabels/pcsPerRoll):0;

    if($('jbrLanesV1055'))$('jbrLanesV1055').textContent=money(lanes);
    if($('jbrPitchV1055'))$('jbrPitchV1055').textContent=pitch?`${money(pitch)} mm`:'0';
    if($('jbrLabelsLaneV1055'))$('jbrLabelsLaneV1055').textContent=money(labelsPerLane);
    if($('jbrTheoreticalLabelsV1055'))$('jbrTheoreticalLabelsV1055').textContent=money(theoreticalLabels);
    if($('jbrTheoreticalRollsV1055'))$('jbrTheoreticalRollsV1055').textContent=money(theoreticalRolls);

    jbrAutoActualV1120(theoreticalRolls);
    try{window.jbrFlatUpdateV2?.()}catch(_){}
    try{jbrActualLengthPreviewV1066()}catch(_){}

    return {jbrWidth,jbrLengthM,labelWidth,labelHeight,gap,pcsPerRoll,lanes,pitch,labelsPerLane,theoreticalLabels,theoreticalRolls};
  }
  window.jbrCalcV1055=jbrCalcV1055;
  // V1.1.40: production-run reading may span several JBRs. No database schema change.
  let jbrRunEntriesV1140=[];
  let jbrRunManualV1140=false;
  const jbrRunFmtV1140=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:3});
  function jbrJobFeedV2026(){return Number($('jbrJobFeedV2026')?.value||0);}
  function jbrRefreshCalculatedLengthsV2026(){
    const feed=jbrJobFeedV2026();
    jbrRunEntriesV1140.forEach(r=>{
      r.feed=feed>0?feed:'';
      r.length=jbrRunMeterSingleV1140(r);
    });
    const first=jbrRunEntriesV1140[0];
    if(first){if($('jbrWidthV1055'))$('jbrWidthV1055').value=Number(first.width)||0;
      if($('jbrLengthV1055'))$('jbrLengthV1055').value=Number(first.length)||0;}
  }
  window.jbrJobFeedChangedV2026=function(){
    jbrRefreshCalculatedLengthsV2026();jbrRunManualV1140=true;jbrRunSummaryV1140();
    try{jbrCalcV1055()}catch(e){console.error(e)}
  };
  function jbrRunMetersV1140(){
    return jbrRunEntriesV1140.reduce((total,r)=>total+jbrRunMeterSingleV1140(r),0);
  }
  function jbrRunMeterSingleV1140(r){
    const feed=Number(r.feed), count=Number(r.count);
    return feed>0&&Number.isSafeInteger(count)&&count>=0?feed*count/1000:0;
  }
  function jbrRunRenderV1140(){
    const target=$('jbrRunInputsV1140');if(!target)return;
    target.innerHTML=jbrRunEntriesV1140.map((r,i)=>`<div class="jbr-run-line-v1140 sc-jbr-entry-v2026">
      <div class="sc-jbr-entry-head-v2026"><b>JBR ${i+1}</b><button type="button" class="btn ghost sm" onclick="jbrRunRemoveV1140(${i})" ${jbrRunEntriesV1140.length===1?'disabled':''}>Remove</button></div>
      <div class="sc-jbr-entry-fields-v2026">
        <label>Width (mm)<input type="number" min="0.01" step="any" value="${Number(r.width)||206}" oninput="jbrRunEditV1140(${i},'width',this.value)"></label>
        <div class="sc-jbr-readonly-v2026"><span>Calculated Length (m)</span><b id="jbrRunLength${i}V2026">${jbrRunFmtV1140(jbrRunMeterSingleV1140(r))} m</b></div>
        <label>Machine Punch Count<input type="number" min="0" step="1" value="${r.count??''}" placeholder="Enter counter" oninput="jbrRunEditV1140(${i},'count',this.value)"></label>
      </div>
      <div class="sc-jbr-entry-results-v2026"><div><span>Measured Machine Feed</span><b id="jbrRunMeter${i}V2026">${jbrRunFmtV1140(jbrRunMeterSingleV1140(r))} m</b></div><div><span>Processed Area</span><b id="jbrRunBalance${i}V2026">${jbrRunFmtV1140((Number(r.width)||0)*jbrRunMeterSingleV1140(r)/1000)} m²</b></div></div>
    </div>`).join('');
    jbrRunSummaryV1140();
  }
  function jbrRunSummaryV1140(){
    jbrRefreshCalculatedLengthsV2026();
    const total=jbrRunEntriesV1140.reduce((n,r)=>n+(Number(r.length)||0),0),measured=jbrRunMetersV1140();
    const valid=jbrJobFeedV2026()>0&&jbrRunEntriesV1140.every(r=>Number(r.width)>0&&r.count!==''&&Number.isSafeInteger(Number(r.count))&&Number(r.count)>0);
    const el=$('jbrRunSummaryV1140');
    if(el)el.innerHTML=`<b>${jbrRunEntriesV1140.length} JBR(s)</b> · calculated processed length ${jbrRunFmtV1140(measured)} m · processed area ${jbrRunFmtV1140(jbrRunEntriesV1140.reduce((n,r)=>n+(Number(r.width)||0)*jbrRunMeterSingleV1140(r)/1000,0))} m²${!valid?' · Enter job feed, JBR widths and punch counts':''}`;
    jbrRunEntriesV1140.forEach((r,i)=>{
      const m=jbrRunMeterSingleV1140(r);
      if($('jbrRunMeter'+i+'V2026'))$('jbrRunMeter'+i+'V2026').textContent=jbrRunFmtV1140(m)+' m';
      if($('jbrRunLength'+i+'V2026'))$('jbrRunLength'+i+'V2026').textContent=jbrRunFmtV1140(m)+' m';
      if($('jbrRunBalance'+i+'V2026'))$('jbrRunBalance'+i+'V2026').textContent=jbrRunFmtV1140((Number(r.width)||0)*m/1000)+' m²';
    });
    try{jbrAutoActualV1120(0)}catch(_){}
    if($('jbrFlatMetersV2'))$('jbrFlatMetersV2').textContent=jbrRunFmtV1140(measured)+' m';
    if($('jbrFlatRemainV2'))$('jbrFlatRemainV2').textContent='Packing classification pending';
    if($('jbrFlatWarnV2'))$('jbrFlatWarnV2').textContent=!valid?'Complete the shared feed and each JBR punch count/width before saving.':'';
  }
  // UI-only coalescing: input state updates immediately; unchanged calculations run
  // once after typing settles, instead of repeatedly within every keypress.
  let jbrTypingTimerV20261030=null;
  function jbrFlushTypingV20261030(){
    if(jbrTypingTimerV20261030!==null){clearTimeout(jbrTypingTimerV20261030);jbrTypingTimerV20261030=null;}
    try{jbrCalcV1055()}catch(e){console.error(e)}
  }
  window.jbrRunEditV1140=function(i,key,v){
    const r=jbrRunEntriesV1140[i];if(!r)return;
    r[key]=v===''?'':Number(v);jbrRunManualV1140=true;
    if(jbrTypingTimerV20261030!==null)clearTimeout(jbrTypingTimerV20261030);
    jbrTypingTimerV20261030=setTimeout(jbrFlushTypingV20261030,160);
  };
  window.jbrRunAddV1140=function(){
    if(jbrRunEntriesV1140.length>=30)return toast('Maximum 30 JBRs per entry');
    const prior=jbrRunEntriesV1140.at(-1)||{};
    jbrRunEntriesV1140.push({width:Number(prior.width)||206,length:0,feed:jbrJobFeedV2026()||'',count:''});
    jbrRunManualV1140=true;jbrRunRenderV1140();
  };
  window.jbrRunRemoveV1140=function(i){if(jbrRunEntriesV1140.length<=1)return;jbrRunEntriesV1140.splice(i,1);jbrRunManualV1140=true;jbrRunRenderV1140()};
  window.jbrRunSuggestV1140=function(){jbrRunSummaryV1140()};
  window.jbrRunRefreshV1140=function(){jbrRunSummaryV1140()};
  window.jbrFlatUpdateV2=function(){
    if(jbrTypingTimerV20261030!==null){clearTimeout(jbrTypingTimerV20261030);jbrTypingTimerV20261030=null;}
    jbrRunSummaryV1140();
    const entries=jbrRunEntriesV1140;
    const valid=jbrJobFeedV2026()>0&&entries.length>0&&entries.every(r=>Number(r.width)>0&&r.count!==''&&Number.isSafeInteger(Number(r.count))&&Number(r.count)>0);
    return {valid,feed:null,count:null,meters:jbrRunMetersV1140(),length:entries.reduce((t,r)=>t+Number(r.length||0),0)};
  };

  async function jbrFetchV1055(path,options={}){
    const res=await fetch(JBR_REST_V1056+path,{
      ...options,
      headers:jbrHeadersV1056(options.headers||{})
    });
    if(!res.ok){
      const body=await res.text().catch(()=>res.statusText);
      throw new Error(`Supabase ${res.status}: ${body.slice(0,500)}`);
    }
    if(res.status===204)return null;
    const text=await res.text();
    return text?JSON.parse(text):null;
  }

  async function jbrLoadV1055(productKey,force=false){
    if(!force && jbrCloudCacheV1055.has(productKey))return jbrCloudCacheV1055.get(productKey);
    const rows=await jbrFetchV1055(
      `/${JBR_TABLE_V1055}?workspace=eq.${encodeURIComponent(JBR_WORKSPACE_V1056)}&product_key=eq.${encodeURIComponent(productKey)}&order=created_at.desc&select=*`
    );
    const data=(rows||[]).map(jbrRowToUiV1055);
    jbrCloudCacheV1055.set(productKey,data);
    return data;
  }

  async function jbrStatsV1055(productKey,force=true){
    const rows=await jbrLoadV1055(productKey,force);
    const actualCut=rows.reduce((n,x)=>n+Math.max(0,Number(x.actualCutRolls||0)),0);
    const theoretical=rows.reduce((n,x)=>n+Math.max(0,Number(x.theoreticalRolls||0)),0);
    const full=rows.filter(x=>x.status==='Fully Die Cut');
    const wasteRolls=full.reduce((n,x)=>n+jbrWasteV1055(x).wasteRolls,0);
    const reusable=rows.filter(x=>x.status!=='Fully Die Cut').length;
    return {rows,actualCut,theoretical,wasteRolls,reusable,count:rows.length};
  }
  window.jbrCloudStatsV1055=jbrStatsV1055;

  async function jbrMigrateLocalOnceV1055(g){
    const key='jbr_db_migrated_v1055_'+btoa(unescape(encodeURIComponent(g.key))).replace(/=+$/,'');
    if(localStorage.getItem(key)==='1')return;
    let local={};
    try{local=JSON.parse(localStorage.getItem(JBR_LOCAL_MIGRATION_KEY_V1055)||'{}')||{}}catch(_){}
    const rows=Array.isArray(local[g.key])?local[g.key]:[];
    if(!rows.length){localStorage.setItem(key,'1');return}

    const existing=await jbrLoadV1055(g.key,true);
    const existingIds=new Set(existing.map(x=>x.id));
    for(const x of rows){
      if(!x?.id||existingIds.has(x.id))continue;
      const payload={
        id:String(x.id),
        workspace:JBR_WORKSPACE_V1056,
        product_key:g.key,
        product_size:String(x.productSize||g.size||''),
        material:String(x.material||g.material||''),
        layout:String(x.layout||g.layout||''),
        pcs_per_roll:Number(x.requestedPcsPerRoll||g.pcs||0),
        unit:String(x.unit||g.unit||'Rolls'),
        jbr_width_mm:Number(x.jbrWidth||0),
        jbr_length_m:Number(x.jbrLengthM||0),
        label_width_mm:Number(x.labelWidth||0),
        label_height_mm:Number(x.labelHeight||0),
        gap_mm:Number(x.gap||0),
        pitch_mm:Number(x.pitch||0),
        lanes:Number(x.lanes||0),
        labels_per_lane:Number(x.labelsPerLane||0),
        theoretical_labels:Number(x.theoreticalLabels||0),
        theoretical_rolls:Number(x.theoreticalRolls||0),
        actual_cut_rolls:Number(x.actualCutRolls||0),
        process_status:String(x.status||'Not Die Cut'),
        note:String(x.note||''),
        created_by_username:String(x.createdByUser||''),
        created_by_display:String(x.createdBy||''),
        created_at:x.createdAt||new Date().toISOString()
      };
      await jbrFetchV1055(`/${JBR_TABLE_V1055}`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Prefer':'return=minimal'},
        body:JSON.stringify(payload)
      });
    }
    jbrCloudCacheV1055.delete(g.key);
    localStorage.setItem(key,'1');
  }

  function ensureJbrModalV1055(){
    if($('jbrInModalV1055'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <div id="jbrInModalV1055" class="modal">
        <div class="modal-card jbr-modal-card-v1055">
          <div class="modal-head">
            <div>
              <b id="jbrModalTitleV1055">JBR In</b>
              <div id="jbrModalMetaV1055" class="small"></div>
            </div>
            <div class="jbr-modal-head-actions-v1055">
              <button id="jbrViewToggleV1055" class="btn jbr-view-btn-v1055 sm" type="button" onclick="toggleJbrViewV1055()">View JBRs</button>
              <button class="closex" type="button" onclick="closeJbrAndroidV1131()">×</button>
            </div>
          </div>
          <div class="modal-body">
            <input id="jbrProductKeyV1055" type="hidden">

            <div id="jbrBatchSummaryV1055" class="jbr-summary-v1055"></div>

            <div id="jbrAddPaneV1055">
              <div class="jbr-entry-card-v1055">
                <div class="jbr-entry-title-v1055">
                  <div>
                    <b>Add Jumbo Roll (JBR)</b>
                    <span>Actual Cut Rolls records what was really produced from this jumbo. Theoretical output is only the planning maximum.</span>
                  </div>
                </div>

                <div class="sc-flat-jbr-machine-v2">
                  <div class="sc-flat-jbr-heading-v2"><b>Flatbed Machine Readings</b><span>Enter the counter and actual feed length. Calculation is local and instant on Android.</span></div>
                  <div class="jbr-run-v1140 sc-jbr-run-v2026">
                    <div class="jbr-run-head-v1140"><b>JBR entries</b><span>Feed / Punch Length is shared across this job. Each JBR has its own width and machine punch count.</span></div>
                    <div class="sc-jbr-jobfeed-v2026"><label>Feed / Punch Length (mm) — Job Level *<input id="jbrJobFeedV2026" type="number" min="0.001" step="any" placeholder="e.g. 42" oninput="jbrJobFeedChangedV2026()"></label><span>Applied automatically to JBR 1, JBR 2 and all other rolls in this job.</span></div>
                    <div id="jbrRunInputsV1140"></div>
                    <div class="jbr-run-row-v1140"><button type="button" class="btn ghost sm" onclick="jbrRunAddV1140()">+ Add Another JBR</button></div>
                    <div id="jbrRunSummaryV1140" class="hint"></div>
                    <div hidden><b id="jbrFlatMetersV2"></b><b id="jbrFlatRemainV2"></b></div>
                  </div>
                  <div id="jbrFlatWarnV2" class="sc-flat-jbr-warn-v2" aria-live="polite"></div>
                  <small>JBR length is calculated from shared feed × individual machine punch count ÷ 1000. This is processed length, not proof of original stock length. Packing verifies finished output and actual waste.</small>
                </div>
                <details class="sc-flat-jbr-advanced-v2"><summary>JBR size and label setup · tap to edit</summary>
                <div class="grid">
                  <input id="jbrWidthV1055" type="hidden" value="301">
                  <input id="jbrLengthV1055" type="hidden" value="1500">
                  <div class="field">
                    <label>Label Width (mm) *</label>
                    <input id="jbrLabelWidthV1055" type="number" min="0.01" step="0.01" oninput="jbrCalcV1055()">
                  </div>
                  <div class="field">
                    <label>Label Height (mm) *</label>
                    <input id="jbrLabelHeightV1055" type="number" min="0.01" step="0.01" oninput="jbrCalcV1055()">
                  </div>

                  <div class="field">
                    <label>Gap Between Labels (mm) *</label>
                    <input id="jbrGapV1055" type="number" min="0" step="0.01" value="2" oninput="jbrCalcV1055()">
                  </div>
                  <div class="field">
                    <label>Pieces / Finished Roll *</label>
                    <input id="jbrPcsV1055" type="number" min="1" step="1" oninput="jbrCalcV1055()">
                  </div>

                </div></details>
                <div class="grid sc-flat-jbr-core-v2">
                  <div class="field">
                    <label>Calculated Cut Rolls / Run (planning only) <span class="jbr-auto-badge-v1120">AUTO</span></label>
                    <input id="jbrActualRollsV1055" class="jbr-auto-rolls-v1120" type="number" min="0" step="1" value="0" readonly aria-readonly="true">
                    <div id="jbrActualAutoHintV1120" class="hint">Enter the flatbed readings above. This calculated estimate does not create stock; Packing confirms physical rolls.</div>
                  </div>
                  <div class="field">
                    <label>JBR Process Status</label>
                    <select id="jbrStatusV1055">
                      <option value="Not Die Cut">Not Die Cut</option>
                      <option value="Partially Die Cut">Partially Die Cut</option>
                      <option value="Fully Die Cut">Fully Die Cut</option>
                    </select>
                    <div class="hint">Choose Full only when all of the corresponding jumbo material has truly been processed. Packing calculates the final variance.</div>
                  </div>

                  <div class="field full">
                    <label>JBR Note</label>
                    <textarea id="jbrNoteV1055" placeholder="Optional note, balance, condition, operator note..."></textarea>
                  </div>
                </div>

                <details class="sc-flat-jbr-advanced-v2"><summary>Planning calculations · theoretical capacity</summary>
                <div class="jbr-calc-grid-v1055">
                  <div><span>Across JBR</span><b id="jbrLanesV1055">0</b><small>lanes</small></div>
                  <div><span>Pitch</span><b id="jbrPitchV1055">0</b><small>height + gap</small></div>
                  <div><span>Labels / Lane</span><b id="jbrLabelsLaneV1055">0</b><small>theoretical</small></div>
                  <div><span>Total Labels</span><b id="jbrTheoreticalLabelsV1055">0</b><small>theoretical</small></div>
                  <div class="strong"><span>Max Full Rolls</span><b id="jbrTheoreticalRollsV1055">0</b><small>planning maximum</small></div>
                </div>

                <div id="jbrActualLengthCardV1066" class="jbr-actual-length-card-v1066">
                  <div><span>Actual Cut Rolls</span><b id="jbrPreviewActualRollsV1066">0</b><small>entered output</small></div>
                  <div class="used"><span>Productive JBR Length Used</span><b id="jbrPreviewUsedLengthV1066">0 m</b><small>actual rolls × pcs × pitch ÷ lanes</small></div>
                  <div><span>Original JBR Length</span><b id="jbrPreviewOriginalLengthV1066">0 m</b><small>entered jumbo length</small></div>
                  <div class="balance"><span>Theoretical Remaining Length</span><b id="jbrPreviewBalanceLengthV1066">0 m</b><small>original length − productive length</small></div>
                </div>

                </details>
                <div class="actions">
                  <button class="btn primary" type="button" onclick="saveJbrInV1055()">Add JBR</button>
                </div>
              </div>
            </div>

            <div id="jbrViewPaneV1055" hidden>
              <div class="jbr-list-head-v1055">
                <div>
                  <b>Added JBRs for This Production</b>
                  <span id="jbrViewProductIdentityV1055"></span>
                </div>
              </div>
              <div id="jbrListV1055"></div>
            </div>
          </div>
        </div>
      </div>`);
  }

  async function jbrRenderSummaryV1055(g){
    const jobs=jbrJobsV1055(g);
    const requested=jobs.reduce((n,r)=>n+Number(r.requestQty||0),0);
    const stats=await jbrStatsV1055(g.key,false);
    const diff=stats.actualCut-requested;

    $('jbrBatchSummaryV1055').innerHTML=`
      <div class="jbr-summary-stat-v1055"><span>Requested</span><b>${money(requested)}</b><small>${esc(g.unit||'Rolls')}</small></div>
      <div class="jbr-summary-stat-v1055"><span>JBRs Added</span><b>${stats.count}</b><small>database records</small></div>
      <div class="jbr-summary-stat-v1055 ${diff>0?'jbr-overcut-v1128':''}"><span>Actual Cut</span><b>${money(stats.actualCut)}</b><small>${diff===0?'matches requested target':diff>0?`+${money(diff)} extra output / stock`:`${money(Math.abs(diff))} still to cut`}</small></div>
      <div class="jbr-summary-stat-v1055 waste"><span>Confirmed Waste</span><b>${money(stats.wasteRolls)}</b><small>${stats.reusable} JBR${stats.reusable===1?'':'s'} still reusable / incomplete</small></div>`;
  }

  async function jbrRenderListV1055(g){
    const entries=await jbrLoadV1055(g.key,true);
    if(!entries.length){
      $('jbrListV1055').innerHTML=`<div class="empty">No JBRs added yet for ${esc(g.size)} • ${esc(g.material)}.</div>`;
      await jbrRenderSummaryV1055(g);
      return;
    }

    $('jbrListV1055').innerHTML=`
      <div class="tablewrap">
        <table class="table jbr-table-v1055">
          <thead>
            <tr>
              <th>JBR</th><th>Jumbo Size</th><th>Label / Gap</th><th>Across</th>
              <th>Max Rolls</th><th>Actual Cut</th><th>Waste / Balance</th><th>Status</th><th>Added</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(x=>{
              const w=jbrWasteV1055(x);
              return `<tr>
                <td><b>${esc(x.code)}</b></td>
                <td>${money(x.jbrWidth)}mm × ${money(x.jbrLengthM)}m</td>
                <td>${money(x.labelWidth)} × ${money(x.labelHeight)}mm<br><span class="small">Gap ${money(x.gap)}mm</span></td>
                <td>${money(x.lanes)}</td>
                <td>${money(x.theoreticalRolls)}</td>
                <td><b>${money(x.actualCutRolls)}</b></td>
                <td>${w.isWaste
                  ? `<span class="jbr-waste-v1055">${esc(w.label)}</span>`
                  : `<span class="jbr-reusable-v1055">${esc(w.label)}</span>`}</td>
                <td><span class="tag">${esc(x.status)}</span></td>
                <td><span class="small">${esc(x.createdBy||'-')}<br>${x.createdAt?new Date(x.createdAt).toLocaleString():'-'}</span></td>
                <td>
                  <div class="actions jbr-row-actions-v1055">
                    <button class="btn ghost sm" type="button" onclick="printJbrLabelV1055('${encodeURIComponent(g.key)}','${x.id}')">Print Label</button>
                    <button class="btn red sm" type="button" onclick="deleteJbrInV1055('${encodeURIComponent(g.key)}','${x.id}')">Delete</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    await jbrRenderSummaryV1055(g);
  }

  window.toggleJbrViewV1055=async function(forceMode){
    const addPane=$('jbrAddPaneV1055');
    const viewPane=$('jbrViewPaneV1055');
    const btn=$('jbrViewToggleV1055');
    const title=$('jbrModalTitleV1055');
    const encodedKey=$('jbrProductKeyV1055')?.value||'';
    const g=jbrGroupV1055(encodedKey);
    if(!addPane||!viewPane||!btn)return;

    const currentlyViewing=!viewPane.hidden;
    const showView=forceMode==='view'?true:forceMode==='add'?false:!currentlyViewing;
    addPane.hidden=showView;
    viewPane.hidden=!showView;
    btn.textContent=showView?'Add JBR':'View JBRs';
    if(title)title.textContent=showView?'JBRs — Production View':'JBR In';

    if(showView&&g){
      $('jbrListV1055').innerHTML='<div class="empty">Loading JBRs from database...</div>';
      try{await jbrRenderListV1055(g)}
      catch(e){
        console.error(e);
        $('jbrListV1055').innerHTML=`<div class="notice"><b>JBR database unavailable:</b> ${esc(e.message)}<br>Run the supplied Supabase migration SQL first.</div>`;
      }
    }
  };

  // Android POS/WebView: never stack the Product Details and JBR dialogs.
  // Keep the parent DOM intact so navigating Back preserves product state.
  let jbrParentWasOpenV1131=false;
  window.closeJbrAndroidV1131=function(restoreParent=true){
    const modal=$('jbrInModalV1055');
    if(modal){modal.classList.remove('show');modal.style.display='';}
    const parent=$('productionProductDetailModal');
    if(parent && restoreParent && jbrParentWasOpenV1131){
      parent.classList.add('show');
      parent.style.display='';
    }
    jbrParentWasOpenV1131=false;
  };

  window.openJbrInV1055=async function(encodedKey){
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage'))return requirePerm('production_manage','manage production JBRs');
    const g=jbrGroupV1055(encodedKey);
    if(!g)return toast('Product batch not found');
    if(!jbrCanOpenV1055(g))return toast('Move the full product batch to In Production before adding JBRs');

    ensureJbrModalV1055();
    const size=jbrParseSizeV1055(g.size);
    $('jbrProductKeyV1055').value=encodeURIComponent(g.key);
    $('jbrModalMetaV1055').textContent=`${g.size} • ${g.material} • ${g.layout} • ${money(g.pcs)} pcs / ${g.unit}`;
    $('jbrViewProductIdentityV1055').textContent=`${g.size} • ${g.material} • ${g.layout} • ${money(g.pcs)} pcs / ${g.unit}`;

    $('jbrWidthV1055').value='206';
    $('jbrLengthV1055').value='0';
    $('jbrLabelWidthV1055').value=size.width||'';
    $('jbrLabelHeightV1055').value=size.height||'';
    $('jbrGapV1055').value='2';
    $('jbrPcsV1055').value=Number(g.pcs||0)||'';
    jbrRequestedTotalV1120=jbrJobsV1055(g).reduce((n,r)=>n+Math.max(0,Number(r.requestQty||0)),0);
    jbrExistingAllocatedV1120=0;
    jbrActualManualV1128=false;
    $('jbrActualRollsV1055').value='0';
    $('jbrStatusV1055').value='Not Die Cut';
    $('jbrNoteV1055').value='';
    jbrRunManualV1140=false;
    $('jbrJobFeedV2026').value=String((size.height||0)+2||'');
    jbrRunEntriesV1140=[{width:Number($('jbrWidthV1055')?.value)||206,length:0,feed:jbrJobFeedV2026(),count:''}];
    jbrRunRenderV1140();
    jbrFlatUpdateV2();

    // Mobile: one visible dialog at a time; competing scrolling layers can
    // swallow taps and create the appearance of a frozen screen.
    const parentModalV1131=$('productionProductDetailModal');
    jbrParentWasOpenV1131=!!parentModalV1131?.classList.contains('show');
    if(jbrParentWasOpenV1131)parentModalV1131.classList.remove('show');
    $('jbrInModalV1055').classList.add('show');
    const jbrBodyV1131=$('jbrInModalV1055')?.querySelector('.modal-body');
    if(jbrBodyV1131)jbrBodyV1131.scrollTop=0;
    jbrCalcV1055();
    // Switch panes synchronously: no remote work on open.
    $('jbrAddPaneV1055').hidden=false;
    $('jbrViewPaneV1055').hidden=true;
    $('jbrViewToggleV1055').textContent='View JBRs';
    $('jbrModalTitleV1055').textContent='JBR In';

    // Cloud reconciliation runs separately; the operator can use the form immediately.
    Promise.resolve().then(async()=>{try{
      await jbrMigrateLocalOnceV1055(g);
      if(!$('jbrInModalV1055')?.classList.contains('show')||$('jbrProductKeyV1055')?.value!==encodeURIComponent(g.key))return;
      const statsV1120=await jbrStatsV1055(g.key,true);
      if(!$('jbrInModalV1055')?.classList.contains('show')||$('jbrProductKeyV1055')?.value!==encodeURIComponent(g.key))return;
      jbrExistingAllocatedV1120=Math.max(0,Number(statsV1120?.actualCut||0));
      jbrCalcV1055();
      await jbrRenderSummaryV1055(g);
    }catch(e){
      console.error(e);
      if($('jbrInModalV1055')?.classList.contains('show'))$('jbrBatchSummaryV1055').innerHTML=`<div class="notice" style="grid-column:1/-1"><b>JBR loading unavailable:</b> ${esc(e.message)}</div>`;
    }});
  };

  let jbrSaveBusyOct24=false;
  window.saveJbrInV1055=async function(){
    if(jbrSaveBusyOct24)return toast('JBR save is already running');
    const encodedKey=$('jbrProductKeyV1055')?.value||'';
    const g=jbrGroupV1055(encodedKey);
    if(!g)return toast('Product batch not found');

    const calc=jbrCalcV1055();
    const actual=Math.max(0,Math.floor(Number($('jbrActualRollsV1055')?.value||0)));
    const status=$('jbrStatusV1055')?.value||'Not Die Cut';
    const userNote=String($('jbrNoteV1055')?.value||'').trim();
    const machine=jbrFlatUpdateV2();
    if(!jbrRunEntriesV1140.length||jbrRunEntriesV1140.some(r=>!(Number(r.width)>0)))return toast('Enter width for every JBR');
    if(!machine?.valid||!machine.meters)return toast('Enter shared Feed / Punch Length and positive whole-number punch counts for every JBR');
    jbrRefreshCalculatedLengthsV2026();
    const planned=jbrAutoActualV1120(0);
    if(!planned.valid)return toast('Cannot calculate planned rolls. Check every JBR machine reading and the label setup');
    const runLength=jbrRunEntriesV1140.reduce((n,r)=>n+Number(r.length||0),0);
    const machineNote=`[JBR machine readings: shared feed ${jbrJobFeedV2026()} mm, ${jbrRunEntriesV1140.length} JBR(s), total processed ${machine.meters.toFixed(4)} m; original supply length not measured; Packing waste pending]`;
    const note=[userNote,machineNote].filter(Boolean).join('\n');

    if(!(calc.jbrWidth>0))return toast('Enter JBR width');
    if(!(calc.jbrLengthM>0))return toast('Enter JBR length');
    if(!(calc.labelWidth>0)||!(calc.labelHeight>0))return toast('Enter label width and height');
    if(!(calc.pcsPerRoll>0))return toast('Enter pieces per finished roll');
    if(!(calc.lanes>0))return toast('JBR width cannot produce even one lane for this label width');
    if(!(calc.labelsPerLane>0))return toast('JBR length / pitch calculation is zero');
    // Run-level quantity validated against combined jumbo capacity below.

    const runId='run_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
    const perJbr=jbrRunEntriesV1140.map(r=>{
      const lanes=Math.floor(Number(r.width)/calc.labelWidth);
      const labelsPerLane=Math.floor(Number(r.length)*1000/calc.pitch);
      const theoreticalLabels=lanes*labelsPerLane;
      const theoreticalRolls=Math.floor(theoreticalLabels/calc.pcsPerRoll);
      return {...r,lanes,labelsPerLane,theoreticalLabels,theoreticalRolls};
    });
    if(perJbr.some(x=>x.lanes<1||x.theoreticalRolls<1))return toast('One or more jumbo rolls cannot produce a finished roll');
    const runMax=perJbr.reduce((n,x)=>n+x.theoreticalRolls,0);
    if(actual>runMax)return toast(`Actual Cut Rolls cannot exceed combined max ${runMax}`);
    const allocations=perJbr.map((x,i)=>{
      const used=Math.min(Number(x.length),jbrRunMeterSingleV1140(jbrRunEntriesV1140[i]));
      return Math.min(x.theoreticalRolls,Math.floor(x.lanes*Math.floor(used*1000/calc.pitch)/calc.pcsPerRoll));
    });
    if(allocations.reduce((n,x)=>n+x,0)!==actual)return toast('Calculated JBR roll allocation mismatch. Recalculate and retry.');
    jbrSaveBusyOct24=true;
    let savedRows=[];
    try{
      for(let i=0;i<perJbr.length;i++){
        const x=perJbr[i];
        const payload={
          workspace:JBR_WORKSPACE_V1056,
          product_key:g.key,product_size:String(g.size||''),material:String(g.material||''),
          layout:String(g.layout||''),pcs_per_roll:Number(g.pcs||0),unit:String(g.unit||'Rolls'),
          source_job_ids:jbrJobsV1055(g).map(r=>String(r.id)),
          jbr_width_mm:x.width,jbr_length_m:x.length,
          label_width_mm:calc.labelWidth,label_height_mm:calc.labelHeight,
          gap_mm:calc.gap,pitch_mm:calc.pitch,lanes:x.lanes,
          labels_per_lane:x.labelsPerLane,theoretical_labels:x.theoreticalLabels,
          theoretical_rolls:x.theoreticalRolls,actual_cut_rolls:allocations[i],
          process_status:status,
          note:[userNote,`[Run ${runId} JBR ${i+1}/${perJbr.length}; shared feed ${jbrJobFeedV2026()} mm x ${jbrRunEntriesV1140[i].count} punches = ${jbrRunMeterSingleV1140(jbrRunEntriesV1140[i]).toFixed(4)} m processed; supply length unknown; Packing waste pending]`,i===0?machineNote:''].filter(Boolean).join('\n'),
          created_by_username:String(currentUser?.username||''),
          created_by_display:String(currentUser?.display||currentUser?.username||'User')
        };
        const rows=await jbrFetchV1055(`/${JBR_TABLE_V1055}`,{
          method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(payload)
        });
        const saved=Array.isArray(rows)?rows[0]:rows;
        if(!saved)throw new Error('Database returned no saved JBR');
        savedRows.push(saved);
      }
    }catch(e){
      console.error(e);
      jbrCloudCacheV1055.delete(g.key);
      return toast(`JBR run partially/fully failed: ${savedRows.length}/${perJbr.length} saved. Review View JBRs before retrying. ${e.message}`);
    }finally{jbrSaveBusyOct24=false;}
    const saved=savedRows[0];
    jbrCloudCacheV1055.delete(g.key);
    const ui=jbrRowToUiV1055(saved);
    try{
      if(typeof audit==='function')audit('PRODUCT_JBR_IN',`${ui.code} | ${g.size}/${g.material} | ${ui.jbrWidth}mm x ${ui.jbrLengthM}m | cut ${actual} rolls`);
    }catch(_){}

    closeJbrAndroidV1131(false);
    try{
      if(typeof window.jbrRefreshProductBalanceV1121==='function'){
        await window.jbrRefreshProductBalanceV1121(g.key,true);
      }
    }catch(e){console.error('JBR production balance refresh',e)}
    try{renderProductionProducts()}catch(_){}
    try{openProductionProductDetailsV103(encodeURIComponent(g.key))}catch(_){}
    toast(`${savedRows.length} JBRs saved for run. Planned cut: ${money(actual)} rolls. Packing must verify physical output.`);
  };

  window.deleteJbrInV1055=async function(encodedKey,id){
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage'))return requirePerm('production_manage','delete production JBR');
    const g=jbrGroupV1055(encodedKey);if(!g)return;
    const rows=await jbrLoadV1055(g.key,true);
    const row=rows.find(x=>String(x.id)===String(id));
    if(!row)return toast('JBR record not found');
    if(!confirm(`Delete ${row.code}?`))return;
    try{
      await jbrFetchV1055(
        `/${JBR_TABLE_V1055}?workspace=eq.${encodeURIComponent(JBR_WORKSPACE_V1056)}&id=eq.${encodeURIComponent(id)}`,
        {method:'DELETE',headers:{'Prefer':'return=minimal'}}
      );
      jbrCloudCacheV1055.delete(g.key);
      await jbrRenderListV1055(g);
      try{
        if(typeof window.jbrRefreshProductBalanceV1121==='function'){
          await window.jbrRefreshProductBalanceV1121(g.key,true);
        }
      }catch(e){console.error('JBR production balance refresh',e)}
      try{renderProductionProducts()}catch(_){}
      toast(`${row.code} deleted. Production remaining updated.`);
    }catch(e){toast(`Delete failed: ${e.message}`)}
  };

  window.printJbrLabelV1055=async function(encodedKey,id){
    const g=jbrGroupV1055(encodedKey);if(!g)return toast('Product batch not found');
    let rows;
    try{rows=await jbrLoadV1055(g.key,true)}catch(e){return toast(`JBR database unavailable: ${e.message}`)}
    const row=rows.find(x=>String(x.id)===String(id));
    if(!row)return toast('JBR record not found');

    const okQ=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',()=>window.QRCode);
    const okC=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',()=>window.html2canvas);
    const okP=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',()=>window.jspdf);
    if(!okQ||!okC||!okP)return toast('PDF / QR libraries unavailable');

    const w=jbrWasteV1055(row);
    const qrData=JSON.stringify({
      type:'PRODUCT_JBR',
      dbId:row.id,
      code:row.code,
      workspace:JBR_WORKSPACE_V1056,
      productKey:g.key,
      product:`${g.size} | ${g.material} | ${g.layout} | ${g.pcs} pcs`,
      jbrWidthMm:row.jbrWidth,
      jbrLengthM:row.jbrLengthM,
      gapMm:row.gap,
      lanes:row.lanes,
      theoreticalRolls:row.theoreticalRolls,
      actualCutRolls:row.actualCutRolls,
      status:row.status,
      wasteRolls:w.isWaste?w.wasteRolls:null,
      reusableBalance:!w.isWaste,
      createdAt:row.createdAt
    });

    const host=document.createElement('div');
    host.style='position:fixed;left:-10000px;top:0;width:900px;height:600px;background:#fff;color:#000;box-sizing:border-box;padding:14px;font-family:Arial,Helvetica,sans-serif;';
    host.innerHTML=`
      <div style="height:100%;border:4px solid #000;border-radius:10px;padding:18px;display:grid;grid-template-columns:1fr 190px;gap:15px;background:#fff">
        <div style="display:flex;flex-direction:column;min-width:0">
          <div style="display:flex;justify-content:space-between;gap:12px;border-bottom:3px solid #000;padding-bottom:8px">
            <div><div style="font-size:28px;font-weight:900">SOFTCREATION</div><div style="font-size:11px;font-weight:900">JUMBO ROLL IDENTIFICATION</div></div>
            <div style="text-align:right"><div style="font-size:10px;font-weight:900">JBR ID</div><div style="font-size:22px;font-weight:900">${esc(row.code)}</div></div>
          </div>
          <div style="font-size:26px;font-weight:900;margin-top:12px">${esc(g.size)} • ${esc(g.material)}</div>
          <div style="font-size:13px;font-weight:800;margin-top:4px">${esc(g.layout)} • ${money(g.pcs)} pcs / roll</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
            <div style="border:2px solid #000;border-radius:7px;padding:8px"><div style="font-size:9px;font-weight:900">JBR SIZE</div><div style="font-size:19px;font-weight:900">${money(row.jbrWidth)}mm × ${money(row.jbrLengthM)}m</div></div>
            <div style="border:2px solid #000;border-radius:7px;padding:8px"><div style="font-size:9px;font-weight:900">STATUS</div><div style="font-size:17px;font-weight:900">${esc(row.status)}</div></div>
            <div style="border:1px solid #777;border-radius:7px;padding:8px"><div style="font-size:9px;font-weight:900">GAP / ACROSS</div><div style="font-size:15px;font-weight:900">${money(row.gap)}mm / ${money(row.lanes)} lanes</div></div>
            <div style="border:1px solid #777;border-radius:7px;padding:8px"><div style="font-size:9px;font-weight:900">OUTPUT / BALANCE</div><div style="font-size:13px;font-weight:900">Max ${money(row.theoreticalRolls)} • Cut ${money(row.actualCutRolls)}<br>${esc(w.label)}</div></div>
          </div>
          <div style="margin-top:auto;font-size:10px;border-top:2px solid #000;padding-top:6px">Added by ${esc(row.createdBy||'-')} • ${row.createdAt?esc(new Date(row.createdAt).toLocaleString()):'-'}</div>
        </div>
        <div style="border-left:3px solid #000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-left:12px">
          <div id="jbrQrV1055" style="width:170px;height:170px"></div>
          <div style="font-size:10px;font-weight:900;margin-top:7px;text-align:center">SCAN JBR QR</div>
        </div>
      </div>`;
    document.body.appendChild(host);

    try{
      new QRCode(host.querySelector('#jbrQrV1055'),{text:qrData,width:170,height:170,correctLevel:QRCode.CorrectLevel.M});
      await new Promise(r=>setTimeout(r,150));
      const canvas=await html2canvas(host,{scale:2.5,backgroundColor:'#fff',useCORS:true,logging:false});
      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:[75,50]});
      pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,75,50);
      pdf.save(`${row.code}.pdf`);
      toast(`${row.code} QR label generated`);
    }catch(err){
      console.error(err);
      toast('JBR label PDF failed');
    }finally{host.remove()}
  };

  function addJbrButtonV1055(encodedKey){
    const g=jbrGroupV1055(encodedKey);
    if(!g||!jbrCanOpenV1055(g))return;
    const body=$('productionProductDetailBody');
    const actions=body?.querySelector('.actions');
    if(!actions||actions.querySelector('.jbr-in-btn-v1055'))return;

    const packingBtn=[...actions.querySelectorAll('button')].find(b=>
      String(b.getAttribute('onclick')||'').includes('openGroupedPackingV1040')
    );
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='btn jbr-in-btn-v1055';
    btn.textContent='JBR In';
    btn.setAttribute('onclick',`openJbrInV1055('${encodedKey}')`);
    if(packingBtn)actions.insertBefore(btn,packingBtn);
    else actions.insertBefore(btn,actions.querySelector('.btn.ghost')||null);
  }

  function installJbrInV1055(){
    if(window.__jbrInInstalledV1055)return;
    window.__jbrInInstalledV1055=true;

    const baseOpen=window.openProductionProductDetailsV103;
    if(typeof baseOpen==='function'){
      window.openProductionProductDetailsV103=function(encodedKey){
        const result=baseOpen.apply(this,arguments);
        try{addJbrButtonV1055(encodedKey)}catch(err){console.error('JBR In button',err)}
        return result;
      };
      try{openProductionProductDetailsV103=window.openProductionProductDetailsV103}catch(_){}
    }

    /* Packing count is limited by the actual JBR cut quantity. */
    const baseOpenPacking=window.openGroupedPackingV1040;
    if(typeof baseOpenPacking==='function'){
      window.openGroupedPackingV1040=async function(encodedKey){
        const g=jbrGroupV1055(encodedKey);
        if(!g)return toast('Product batch not found');
        let stats;
        try{stats=await jbrStatsV1055(g.key,true)}
        catch(e){return toast(`Cannot open packing: JBR database unavailable. ${e.message}`)}
        if(!(stats.actualCut>0))return toast('Cannot open packing: no Actual Cut Rolls have been recorded in JBR In.');
        const totalJbrLengthV1140=stats.rows.reduce((n,x)=>n+Math.max(0,Number(x.jbrLengthM||0)),0);
        const r=baseOpenPacking.apply(this,arguments);
        setTimeout(()=>{
          const modal=$('packingModal');
          if(modal)modal.dataset.jbrTotalLengthV1140=String(totalJbrLengthV1140);
          if(!modal?.classList.contains('show'))return;
          modal.dataset.jbrPlannedRolls=String(stats.actualCut);
          modal.dataset.jbrMaxRolls=String(stats.theoretical);
          modal.dataset.jbrProductKey=g.key;
          // Use the same JBR pitch basis as Finance; never silently assume a pitch.
          const validPitches=(stats.rows||[]).map(x=>Number(x.pitch||0)).filter(v=>v>0);
          const commonPitch=validPitches.length===(stats.rows||[]).length && validPitches.length &&
            Math.max(...validPitches)-Math.min(...validPitches)<0.00001 ? validPitches[0] : 0;
          modal.dataset.packingWastePitchMmV2026=String(commonPitch||0);
          modal.dataset.packingWastePcsV2026=String(Number(g.pcs||0));
          // Physical source: total JBR input area / maximum whole finished rolls.
          // Different JBR widths are supported. Do not use finished roll width here.
          const validAreaRows=(stats.rows||[]).filter(x=>Number(x.jbrWidth)>0&&Number(x.jbrLengthM)>0&&Number(x.theoreticalRolls)>0);
          const allAreaValid=validAreaRows.length===(stats.rows||[]).length && validAreaRows.length>0;
          const jbrAreaSqm=allAreaValid?validAreaRows.reduce((sum,x)=>sum+Number(x.jbrWidth)*Number(x.jbrLengthM)/1000,0):0;
          modal.dataset.jbrWasteInputSqmV2026=String(jbrAreaSqm);
          modal.dataset.jbrWasteMaxRollsV2026=String(allAreaValid?stats.theoretical:0);
          if(typeof window.updatePackingLiveV1057==='function')window.updatePackingLiveV1057();
          const notice=modal.querySelector('.notice');
          if(notice){
            notice.insertAdjacentHTML('beforeend',`<br><b>JBR planned target:</b> ${money(stats.actualCut)} ${esc(g.unit||'Rolls')} • <b>physical maximum:</b> ${money(stats.theoretical)}. Enter the rolls actually received below; carton + loose count must match that received quantity.`);
          }
        },0);
        return r;
      };
      try{openGroupedPackingV1040=window.openGroupedPackingV1040}catch(_){}
    }

    const baseSavePacking=window.savePackingV81;
    if(typeof baseSavePacking==='function'){
      window.savePackingV81=async function(){
        const marker=$('packingReqId')?.value||'';
        if(marker.startsWith('BATCHV1040::')){
          const encodedKey=marker.slice('BATCHV1040::'.length);
          const g=jbrGroupV1055(encodedKey);
          if(!g)return toast('Product batch not found');
          let stats;
          try{stats=await jbrStatsV1055(g.key,true)}
          catch(e){return toast(`Packing blocked: JBR database unavailable. ${e.message}`)}

          const boxes=readBoxesV81('pack');
          const loose=Number($('packLoose')?.value||0);
          const total=boxesTotalV81(boxes)+loose;
          const actualReceived=Math.max(0,Math.floor(Number($('packActualReceivedV1120')?.value||0)));
          const physicalMax=Math.max(0,Math.floor(Number(stats.theoretical||0)));
          if(!(actualReceived>0))return toast('Enter the Actual Rolls Received from production before saving packing.');
          if(actualReceived>physicalMax)return toast(`Actual Rolls Received cannot exceed the combined JBR Max Full Rolls. Maximum ${money(physicalMax)}, entered ${money(actualReceived)}.`);
          if(total>actualReceived)return toast(`Packed count cannot exceed Actual Rolls Received. Received ${money(actualReceived)}, boxes + loose ${money(total)}.`);
        }
        return baseSavePacking.apply(this,arguments);
      };
      try{savePackingV81=window.savePackingV81}catch(_){}
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installJbrInV1055,{once:true});
  else installJbrInV1055();
})();
