
/* V1.0.63 - Fast Product Dispatch + Finance Job Usage Reports
   Finance reports operational usage only. No profit / GP calculation. */
(function(){
  const USAGE_REST_V1060='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1';
  const USAGE_WORKSPACE_V1060='softcreation_main';
  const USAGE_KEY_STORE_V1060='spgs_supabase_browser_key_v1';
  const usageCacheV1060={jbr:new Map(),packing:new Map(),loaded:new Map()};
  const dispatchGroupCacheV1063=new Map();

  function usageApiKeyV1060(){
    let key=localStorage.getItem(USAGE_KEY_STORE_V1060)||'';
    if(!key){
      key=prompt('SoftCreation cloud setup\n\nPaste the FULL Supabase anon / publishable key for qyxgamverzdmhtvezbft:')||'';
      key=key.trim();
      if(key)localStorage.setItem(USAGE_KEY_STORE_V1060,key);
    }
    return key;
  }

  function usageHeadersV1060(extra={}){
    const key=usageApiKeyV1060();
    if(!key)throw new Error('Supabase key is not configured.');
    const h={apikey:key,...extra};
    if(key.startsWith('eyJ'))h.Authorization='Bearer '+key;
    return h;
  }

  async function usageFetchV1060(path,options={}){
    const res=await fetch(USAGE_REST_V1060+path,{...options,headers:usageHeadersV1060(options.headers||{})});
    if(!res.ok){
      const body=await res.text().catch(()=>res.statusText);
      throw new Error(`Supabase ${res.status}: ${body.slice(0,500)}`);
    }
    if(res.status===204)return null;
    const text=await res.text();
    return text?JSON.parse(text):null;
  }

  function productKeyV1060(r){
    try{return productionProductKeyV103(r)}
    catch(_){return [r.size,r.material,r.layout,r.pcs,r.unit].join('|').toUpperCase()}
  }

  function productGroupV1060(encodedKey){
    const key=decodeURIComponent(encodedKey||'');
    if(dispatchGroupCacheV1063.has(key))return dispatchGroupCacheV1063.get(key);
    try{return (productionProductGroupsV103()||[]).find(x=>x.key===key)||null}catch(_){return null}
  }

  function fastProductGroupV1063(key){
    if(dispatchGroupCacheV1063.has(key))return dispatchGroupCacheV1063.get(key);

    const jobs=(state.productionRequests||[]).filter(r=>{
      try{return productionProductKeyV103(r)===key}catch(_){return false}
    });
    if(!jobs.length)return null;

    const first=jobs[0];
    const g={
      key,
      size:first.size||'-',
      material:first.material||'-',
      layout:first.layout||'-',
      pcs:Number(first.pcs||0),
      unit:first.unit||'Rolls',
      jobs
    };
    dispatchGroupCacheV1063.set(key,g);
    return g;
  }

  function flowV1060(status){
    const flow=['Requested','Approved','Planned','In Production','QC Check','Finished','Dispatched','Received','GRN Closed'];
    const i=flow.indexOf(String(status||'Requested'));
    return i<0?0:i;
  }

  function dispatchProducedQtyV1060(r){
    const explicit=Number(r?.finishedQty||0);
    if(explicit>0)return explicit;
    const packing=Number(r?.packing?.total||0);
    if(packing>0)return packing;
    const batch=Number(r?.batchPackingV1040?.total||0);
    if(batch>0 && Array.isArray(r?.packing?.boxes)){
      const alloc=(r.packing.boxes||[]).reduce((n,b)=>n+Number(b.rolls||0),0)+Number(r.packing.loose||0);
      if(alloc>0)return alloc;
    }
    /* Legacy Finished records may not have finishedQty saved. */
    if(flowV1060(r?.status)>=flowV1060('Finished'))return Math.max(0,Number(r?.requestQty||0));
    return 0;
  }

  function dispatchedQtyV1060(r){
    return (r?.dispatches||[]).reduce((n,d)=>n+Number(d.qty||0),0);
  }

  function dispatchAvailableV1060(r){
    /* Do not dispatch while still in QC Check. */
    if(flowV1060(r?.status)<flowV1060('Finished'))return 0;
    return Math.max(0,dispatchProducedQtyV1060(r)-dispatchedQtyV1060(r));
  }

  function groupDispatchAvailableV1060(g){
    return (g?.jobs||[]).reduce((n,r)=>n+dispatchAvailableV1060(r),0);
  }

  window.openProductDispatchV1059=function(encodedKey){
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage')){
      return requirePerm('production_manage','dispatch finished production');
    }

    const key=decodeURIComponent(encodedKey||'');
    const modal=$('productDispatchModalV1059');
    const meta=$('productDispatchMetaV1059');
    const body=$('productDispatchBodyV1059');

    /* Show the modal first. The user gets immediate feedback even on a large production dataset. */
    if(modal)modal.classList.add('show');
    if(meta)meta.textContent='Opening dispatch…';
    if(body)body.innerHTML='<div class="product-dispatch-opening-v1063"><b>Loading finished production balance…</b><span>This should take only a moment.</span></div>';

    /* Use the product object already cached when the Products cards were rendered.
       Fallback scans only this product's production requests; it does NOT rebuild/sort all groups. */
    const g=dispatchGroupCacheV1063.get(key)||fastProductGroupV1063(key);
    if(!g){
      if(meta)meta.textContent='Product not found';
      if(body)body.innerHTML='<div class="empty">Product production data is no longer available. Refresh Products and try again.</div>';
      return;
    }

    /* Let the modal paint before building the job rows. */
    requestAnimationFrame(()=>{
      const jobs=(g.jobs||[])
        .filter(r=>dispatchAvailableV1060(r)>0)
        .sort((a,b)=>Date.parse(b.finishedAt||b._spgsUpdatedAt||0)-Date.parse(a.finishedAt||a._spgsUpdatedAt||0));

      const balance=jobs.reduce((n,r)=>n+dispatchAvailableV1060(r),0);

      if(meta){
        meta.textContent=
          `${g.size} • ${g.material} • ${g.layout} • ${money(g.pcs)} pcs/roll • Available ${money(balance)} ${g.unit}`;
      }

      if(!jobs.length){
        if(body)body.innerHTML='<div class="empty">No Finished production balance is available to dispatch for this product.</div>';
        return;
      }

      if(body)body.innerHTML=`
        <div class="notice"><b>Select the Finished production job to dispatch.</b> QC Check jobs remain locked until QC approval. Legacy Finished jobs without an explicit finished count use their requested quantity as the dispatchable finished quantity.</div>
        <div class="product-dispatch-list-v1059">
          ${jobs.map(r=>{
            const produced=dispatchProducedQtyV1060(r);
            const dispatched=dispatchedQtyV1060(r);
            const avail=dispatchAvailableV1060(r);
            return `<div class="product-dispatch-row-v1059">
              <div><b>${esc(r.orderNo)}</b><span>${esc(r.customerName||'-')} • PI ${esc(r.piSerial||'-')} • ${esc(r.status||'-')}</span></div>
              <div><span>Finished</span><b>${money(produced)}</b></div>
              <div><span>Dispatched</span><b>${money(dispatched)}</b></div>
              <div><span>Available</span><b>${money(avail)}</b></div>
              <button class="btn navy sm" type="button" onclick="closeModal('productDispatchModalV1059');openDispatchLoadingV81('${r.id}')">Dispatch</button>
            </div>`;
          }).join('')}
        </div>`;
    });
  };

  function enhanceProductDispatchCardsV1060(){
    /* Disabled in V1.0.65: standalone V1.0.64 owns Products-card Dispatch buttons. */
    return;
  }

  async function usageLoadProductV1060(productKey,force=false){
    const now=Date.now(),last=usageCacheV1060.loaded.get(productKey)||0;
    if(!force && usageCacheV1060.jbr.has(productKey) && now-last<15000)return;
    const [jbr,packing]=await Promise.all([
      usageFetchV1060(`/spgs_product_jbrs?workspace=eq.${encodeURIComponent(USAGE_WORKSPACE_V1060)}&product_key=eq.${encodeURIComponent(productKey)}&order=created_at.asc&select=*`),
      usageFetchV1060(`/spgs_product_packing_batches?workspace=eq.${encodeURIComponent(USAGE_WORKSPACE_V1060)}&product_key=eq.${encodeURIComponent(productKey)}&order=created_at.desc&select=*`)
    ]);
    usageCacheV1060.jbr.set(productKey,Array.isArray(jbr)?jbr:[]);
    usageCacheV1060.packing.set(productKey,Array.isArray(packing)?packing:[]);
    usageCacheV1060.loaded.set(productKey,now);
  }

  function jsonArrayV1060(v){
    if(Array.isArray(v))return v.map(String);
    if(typeof v==='string'){
      try{const x=JSON.parse(v);return Array.isArray(x)?x.map(String):[]}catch(_){return []}
    }
    return [];
  }

  function usageJbrRowsV1060(r){
    const all=usageCacheV1060.jbr.get(productKeyV1060(r))||[];
    const exact=all.filter(x=>jsonArrayV1060(x.source_job_ids).includes(String(r.id)));
    if(exact.length)return {rows:exact,scope:'Exact job-linked JBR records'};
    /* Older JBRs were saved before source_job_ids existed. */
    const legacy=all.filter(x=>jsonArrayV1060(x.source_job_ids).length===0);
    return {rows:legacy.length?legacy:all,scope:'Shared product-batch JBR records (legacy / not individually allocated)'};
  }

  function usagePackingRowsV1060(r){
    const all=usageCacheV1060.packing.get(productKeyV1060(r))||[];
    const exact=all.filter(x=>jsonArrayV1060(x.source_job_ids).includes(String(r.id)));
    return exact.length?exact:all;
  }

  function parseBoxesV1060(v){
    if(Array.isArray(v))return v;
    if(typeof v==='string'){
      try{const x=JSON.parse(v);return Array.isArray(x)?x:[]}catch(_){return []}
    }
    return [];
  }

  function rollWidthV1060(r){
    const nums=String(r?.size||'').match(/\d+(?:\.\d+)?/g)||[];
    return Number(nums[0]||0);
  }

  /* The packing batch note stores the variance without changing the existing Supabase table schema. */
  function packingWasteV2026(p,r,jbrRows){
    if(!p)return {rolls:0,sqm:null,sqmPerRoll:null,source:'No packing batch'};
    const packed=Number(p.packed_total);
    const rows=Array.isArray(jbrRows)?jbrRows:[];
    const valid=rows.length>0&&rows.every(j=>Number(j.jbr_width_mm)>0&&Number(j.jbr_length_m)>0&&Number(j.theoretical_rolls)>0);
    const maxRolls=valid?rows.reduce((sum,j)=>sum+Number(j.theoretical_rolls),0):0;
    const inputSqm=valid?rows.reduce((sum,j)=>sum+Number(j.jbr_width_mm)*Number(j.jbr_length_m)/1000,0):0;
    const sqmPerRoll=maxRolls>0?inputSqm/maxRolls:null;
    const rolls=Number.isFinite(packed)&&packed>=0?Math.max(0,maxRolls-packed):0;
    return {rolls,maxRolls,inputSqm,sqmPerRoll,sqm:sqmPerRoll!==null&&Number.isFinite(packed)&&packed>=0?rolls*sqmPerRoll:null,
      source:!valid?'JBR width / calculated length / max-roll record incomplete':'JBR input m² ÷ maximum rolls; potential variance, not confirmed scrap'};
  }

  function usageForJobV1060(r){
    const jbrSet=usageJbrRowsV1060(r);
    const packRows=usagePackingRowsV1060(r);
    const latestPack=packRows[0]||null;
    const packingWaste=packingWasteV2026(latestPack,r,jbrSet.rows);
    const produced=Math.max(0,Number(r.finishedQty||r.packing?.total||0));
    const packedAllocated=Math.max(0,Number(r.packing?.total||produced||0));
    const width=rollWidthV1060(r);
    const coreMm=packedAllocated*width;
    const coreStickLength=Number(latestPack?.core_stick_length_mm||1000);
    const coreEquivalent=coreStickLength>0?coreMm/coreStickLength:0;
    const coreSticks=coreMm>0?Math.ceil(coreMm/coreStickLength):0;
    const coreBalance=coreSticks>0?Math.max(0,coreSticks*coreStickLength-coreMm):0;
    const dispatched=dispatchedQtyV1060(r);

    let jbrActual=0,jbrTheoretical=0,jbrWaste=0,reusable=0;
    jbrSet.rows.forEach(x=>{
      const actual=Number(x.actual_cut_rolls||0),max=Number(x.theoretical_rolls||0),status=String(x.process_status||'');
      jbrActual+=actual;jbrTheoretical+=max;
      if(status==='Fully Die Cut')jbrWaste+=Math.max(0,max-actual);else reusable++;
    });

    const jbrLengths=jbrSet.rows.reduce((a,j)=>{
      const m=(typeof jbrMeasuredV1061==='function')
        ? jbrMeasuredV1061(j,r)
        : {productiveLengthM:0,consumedLengthM:0,wasteLengthM:0,reusableLengthM:0};
      a.productive+=Number(m.productiveLengthM||0);
      a.consumed+=Number(m.consumedLengthM||0);
      a.waste+=Number(m.wasteLengthM||0);
      a.reusable+=Number(m.reusableLengthM||0);
      return a;
    },{productive:0,consumed:0,waste:0,reusable:0});

    return {
      r,jbrSet,packRows,latestPack,produced,packedAllocated,width,coreMm,coreStickLength,
      coreEquivalent,coreSticks,coreBalance,dispatched,
      dispatchBalance:Math.max(0,dispatchProducedQtyV1060(r)-dispatched),
      jbrActual,jbrTheoretical,jbrWaste,reusable,jbrLengths,packingWaste
    };
  }

  async function usageDatasetV1060(force=false){
    const jobs=(state.productionRequests||[]).slice();
    const keys=[...new Set(jobs.map(productKeyV1060))];
    await Promise.all(keys.map(k=>usageLoadProductV1060(k,force)));
    return jobs.map(usageForJobV1060);
  }

  function tuneFinanceUiV1060(){
    const title=document.querySelector('#finance .panel-title span');
    if(title)title.textContent='Finance — Live Job Usage & Costing Support';

    const notice=document.querySelector('#finance .panel-body > .notice');
    if(notice)notice.innerHTML='<b>Operational usage report:</b> Finance shows what each production job actually used and produced. Profit / GP is intentionally not calculated here. Use the PDF report as the production-usage basis for your own costing.';

    const margin=$('financeMarginV1059');
    if(margin)margin.remove();

    const modalTitle=$('financeJobModalV1059')?.querySelector('.modal-head b');
    if(modalTitle)modalTitle.textContent='Production Job Usage';
  }

  window.renderFinanceV1059=async function(force=false){
    tuneFinanceUiV1060();
    if(!$('financeJobsV1059'))return;
    if(currentUser?.role!=='admin'&&!hasPerm('finance_view')){
      $('financeJobsV1059').innerHTML='<div class="empty">Finance access is not enabled for this user.</div>';
      return;
    }

    $('financeStatusNoteV1059').textContent='Updating live job usage…';
    let rows;
    try{rows=await usageDatasetV1060(force)}
    catch(e){
      $('financeJobsV1059').innerHTML=`<div class="notice"><b>Usage data error:</b> ${esc(e.message)}</div>`;
      return;
    }

    const q=String($('financeSearchV1059')?.value||'').trim().toLowerCase();
    const sf=$('financeStatusV1059')?.value||'';
    rows=rows.filter(x=>
      (!sf||x.r.status===sf) &&
      (!q||[x.r.orderNo,x.r.piSerial,x.r.customerName,x.r.size,x.r.material,x.r.layout].join(' ').toLowerCase().includes(q))
    );

    const totals=rows.reduce((a,x)=>{
      a.jobs++;
      a.requested+=Number(x.r.requestQty||0);
      a.finished+=Number(x.produced||0);
      a.coreMm+=Number(x.coreMm||0);
      a.jbrWaste+=Number(x.jbrWaste||0);
      a.dispatched+=Number(x.dispatched||0);
      return a;
    },{jobs:0,requested:0,finished:0,coreMm:0,jbrWaste:0,dispatched:0});

    $('financeKpisV1059').innerHTML=`
      <div><span>Jobs</span><b>${money(totals.jobs)}</b><small>filtered production jobs</small></div>
      <div><span>Requested Rolls</span><b>${money(totals.requested)}</b><small>job demand</small></div>
      <div><span>Finished Rolls</span><b>${money(totals.finished)}</b><small>recorded job output</small></div>
      <div><span>Core Usage</span><b>${money(totals.coreMm)} mm</b><small>job-equivalent core usage</small></div>
      <div><span>Confirmed JBR Waste</span><b>${money(totals.jbrWaste)}</b><small>fully die-cut JBR roll equivalent</small></div>`;

    $('financeJobsV1059').innerHTML=rows.length
      ? `<div class="finance-usage-cards-v1060">${rows.map(x=>{
          const r=x.r;
          return `<div class="finance-usage-card-v1060">
            <div class="finance-usage-card-head-v1060">
              <div>
                <b>${esc(r.orderNo||'-')}</b>
                <span>${esc(r.customerName||'-')} • PI ${esc(r.piSerial||'-')}</span>
              </div>
              <span class="tag">${esc(r.status||'-')}</span>
            </div>
            <div class="finance-usage-product-v1060">${esc(r.size||'-')} • ${esc(r.material||'-')} • ${esc(r.layout||'-')} • ${money(r.pcs)} pcs / ${esc(r.unit||'Rolls')}</div>
            <div class="finance-usage-stats-v1060">
              <div><span>Requested</span><b>${money(r.requestQty||0)}</b></div>
              <div><span>Finished</span><b>${money(x.produced)}</b></div>
              <div><span>JBR Actual Cut</span><b>${money(x.jbrActual)}</b></div>
              <div><span>JBR Productive Length</span><b>${money((x.jbrSet.rows||[]).reduce((n,j)=>n+jbrMeasuredV1061(j,r).productiveLengthM,0))} m</b></div>
              <div class="packing-waste-finance-v2026"><span>Potential JBR Material Variance</span><b>${money(x.packingWaste.rolls)} rolls</b><small>${x.packingWaste.sqm==null?"m² unavailable":money(x.packingWaste.sqm)+" m² (JBR-based potential)"}</small></div>
              <div><span>Core Used</span><b>${money(x.coreMm)} mm</b></div>
              <div><span>Dispatched</span><b>${money(x.dispatched)}</b></div>
            </div>
            <div class="finance-usage-scope-v1060">${esc(x.jbrSet.scope)}</div>
            <div class="actions">
              <button class="btn ghost sm" type="button" onclick="openFinanceJobV1059('${r.id}')">View Usage</button>
              <button class="btn navy sm" type="button" onclick="generateJobUsagePdfV1060('${r.id}')">Generate PDF</button>
            </div>
          </div>`;
        }).join('')}</div>`
      : '<div class="empty">No matching production jobs.</div>';

    $('financeStatusNoteV1059').textContent=
      `Last updated ${new Date().toLocaleTimeString()} • operational usage only • auto refresh every 20 seconds while Finance is open`;
  };

  function jbrWasteTextV1060(x){
    const max=Number(x.theoretical_rolls||0),actual=Number(x.actual_cut_rolls||0),status=String(x.process_status||'');
    if(status!=='Fully Die Cut')return 'Reusable balance — not waste';
    const w=Math.max(0,max-actual);
    return `${money(w)} roll equivalent`;
  }

  function jbrNumV1061(v,fallback=0){
    const n=Number(v);
    return Number.isFinite(n)?n:Number(fallback||0);
  }

  function jbrProductDimsV1061(j,r){
    const nums=String(j?.product_size||r?.size||'').match(/\d+(?:\.\d+)?/g)||[];
    return {
      width:jbrNumV1061(j?.label_width_mm,nums[0]||0),
      height:jbrNumV1061(j?.label_height_mm,nums[1]||0)
    };
  }

  function jbrMeasuredV1061(j,r){
    const dims=jbrProductDimsV1061(j,r);
    const jbrWidth=jbrNumV1061(j?.jbr_width_mm,0);
    const jbrLengthM=jbrNumV1061(j?.jbr_length_m,0);
    const gap=Math.max(0,jbrNumV1061(j?.gap_mm,0));
    const pitchSaved=jbrNumV1061(j?.pitch_mm,0);
    const pitch=pitchSaved>0?pitchSaved:(dims.height>0?dims.height+gap:0);
    const lanesSaved=Math.floor(jbrNumV1061(j?.lanes,0));
    const lanes=lanesSaved>0?lanesSaved:(jbrWidth>0&&dims.width>0?Math.floor(jbrWidth/dims.width):0);
    const labelsPerLaneSaved=Math.floor(jbrNumV1061(j?.labels_per_lane,0));
    const labelsPerLane=labelsPerLaneSaved>0?labelsPerLaneSaved:(jbrLengthM>0&&pitch>0?Math.floor((jbrLengthM*1000)/pitch):0);
    const totalLabelsSaved=Math.floor(jbrNumV1061(j?.theoretical_labels,0));
    const theoreticalLabels=totalLabelsSaved>0?totalLabelsSaved:lanes*labelsPerLane;
    const pcsPerRoll=Math.max(0,jbrNumV1061(j?.pcs_per_roll,r?.pcs||0));
    const theoreticalRollsSaved=Math.floor(jbrNumV1061(j?.theoretical_rolls,0));
    const theoreticalRolls=theoreticalRollsSaved>0
      ? theoreticalRollsSaved
      : (pcsPerRoll>0?Math.floor(theoreticalLabels/pcsPerRoll):0);

    const actualCutRolls=Math.max(0,jbrNumV1061(j?.actual_cut_rolls,0));

    /* Productive parent-web length represented by the actual finished rolls:
       actual rolls × pcs/roll × pitch ÷ lanes.
       Example: 154 × 500 × 77mm ÷ 4 = 1,482.25m of parent JBR length. */
    const productiveLengthM=(lanes>0 && pcsPerRoll>0 && pitch>0)
      ? (actualCutRolls*pcsPerRoll*pitch)/(lanes*1000)
      : 0;

    const status=String(j?.process_status||'Not Die Cut');
    /* Fully die-cut means the whole JBR was processed/consumed.
       Partial/uncut JBR balance is reusable and must not be called waste. */
    const consumedLengthM=status==='Fully Die Cut'
      ? Math.max(0,jbrLengthM)
      : Math.min(Math.max(0,jbrLengthM),Math.max(0,productiveLengthM));

    const wasteLengthM=status==='Fully Die Cut'
      ? Math.max(0,jbrLengthM-productiveLengthM)
      : 0;

    const reusableLengthM=status==='Fully Die Cut'
      ? 0
      : Math.max(0,jbrLengthM-consumedLengthM);

    return {
      labelWidth:dims.width,
      labelHeight:dims.height,
      gap,
      pitch,
      jbrWidth,
      jbrLengthM,
      lanes,
      labelsPerLane,
      theoreticalLabels,
      pcsPerRoll,
      theoreticalRolls,
      actualCutRolls,
      productiveLengthM,
      consumedLengthM,
      wasteLengthM,
      reusableLengthM,
      processStatus:status
    };
  }

  function jbrMeasurementTextV1061(j,r){
    const m=jbrMeasuredV1061(j,r);
    return `${money(m.labelWidth)}mm × ${money(m.labelHeight)}mm`;
  }

  function usageDetailHtmlV1060(x,forPdf=false){
    const r=x.r;
    const jbrRows=x.jbrSet.rows||[];
    const latestPack=x.latestPack;
    const batchBoxes=parseBoxesV1060(latestPack?.boxes);
    const history=[...(r.history||[])].slice(-12);

    return `
      <div class="${forPdf?'usage-pdf-body-v1060':''}">
        <div class="finance-detail-grid-v1059">
          <div><span>Production No.</span><b>${esc(r.orderNo||'-')}</b></div>
          <div><span>Status</span><b>${esc(r.status||'-')}</b></div>
          <div><span>Requested</span><b>${money(r.requestQty||0)} ${esc(r.unit||'')}</b></div>
          <div><span>Finished / Recorded</span><b>${money(x.produced)}</b></div>
          <div><span>Job Packed Allocation</span><b>${money(x.packedAllocated)}</b></div>
          <div class="packing-waste-finance-v2026"><span>Potential JBR Material Variance</span><b>${money(x.packingWaste.rolls)} rolls</b><small>${x.packingWaste.sqm==null?"Area estimate unavailable — verify JBR pitch":money(x.packingWaste.sqm)+" m² JBR-based potential"}</small></div>
          <div><span>Dispatched</span><b>${money(x.dispatched)}</b></div>
          <div><span>Dispatch Balance</span><b>${money(x.dispatchBalance)}</b></div>
          <div><span>Priority / Shift</span><b>${esc(r.priority||'-')} / ${esc(r.shift||'-')}</b></div>
        </div>

        <div class="notice">JBR-based potential material variance = (JBR maximum full rolls − packed rolls) × (combined JBR input m² ÷ combined maximum rolls). This includes unproduced/reusable material and is not confirmed scrap. Do not double-count JBR cutting waste.</div>
        <div class="section">JBR USAGE</div>
        <div class="usage-scope-note-v1060">${esc(x.jbrSet.scope)}. New JBR records are linked to the source production jobs; older JBR records may only be identifiable at consolidated product-batch level.</div>
        ${jbrRows.length?`
          <div class="jbr-usage-grid-v1061">
            ${jbrRows.map(j=>{
              const m=jbrMeasuredV1061(j,r);
              return `<div class="jbr-usage-card-v1061">
                <div class="jbr-usage-card-head-v1061">
                  <div>
                    <b>${esc(j.jbr_code||('JBR-'+String(j.jbr_seq||'').padStart(5,'0')))}</b>
                    <span>${esc(j.process_status||'-')}</span>
                  </div>
                  <span class="tag">${esc(j.material||r.material||'-')}</span>
                </div>

                <div class="jbr-measure-strip-v1061">
                  <div><span>Label Size</span><b>${money(m.labelWidth)} × ${money(m.labelHeight)} mm</b></div>
                  <div><span>Gap</span><b>${money(m.gap)} mm</b></div>
                  <div><span>Pitch</span><b>${money(m.pitch)} mm</b></div>
                  <div><span>Across / Lanes</span><b>${money(m.lanes)}</b></div>
                </div>

                <div class="jbr-measure-strip-v1061 secondary">
                  <div><span>JBR Width</span><b>${money(m.jbrWidth)} mm</b></div>
                  <div><span>JBR Length</span><b>${money(m.jbrLengthM)} m</b></div>
                  <div><span>Labels / Lane</span><b>${money(m.labelsPerLane)}</b></div>
                  <div><span>Theoretical Labels</span><b>${money(m.theoreticalLabels)}</b></div>
                </div>

                <div class="jbr-measure-strip-v1061 output">
                  <div><span>Pieces / Finished Roll</span><b>${money(m.pcsPerRoll)}</b></div>
                  <div><span>Max Full Rolls</span><b>${money(m.theoreticalRolls)}</b></div>
                  <div><span>Actual Cut Rolls</span><b>${money(m.actualCutRolls)}</b></div>
                  <div><span>Roll Waste / Balance</span><b>${esc(jbrWasteTextV1060({...j,theoretical_rolls:m.theoreticalRolls,actual_cut_rolls:m.actualCutRolls}))}</b></div>
                </div>

                <div class="jbr-length-usage-v1062">
                  <div class="productive"><span>Productive Length for Actual Rolls</span><b>${money(m.productiveLengthM)} m</b><small>Actual rolls × pcs/roll × pitch ÷ lanes</small></div>
                  <div><span>Material Length Consumed</span><b>${money(m.consumedLengthM)} m</b><small>${m.processStatus==='Fully Die Cut'?'Full JBR processed':'Calculated from actual cut output'}</small></div>
                  <div class="${m.processStatus==='Fully Die Cut'?'waste':'reusable'}"><span>${m.processStatus==='Fully Die Cut'?'Waste Length':'Reusable JBR Balance'}</span><b>${money(m.processStatus==='Fully Die Cut'?m.wasteLengthM:m.reusableLengthM)} m</b><small>${m.processStatus==='Fully Die Cut'?'Consumed but not converted to finished-roll output':'Can be labelled and used later'}</small></div>
                </div>

                ${j.note?`<div class="jbr-usage-note-v1061"><b>JBR Note:</b> ${esc(j.note)}</div>`:''}
              </div>`;
            }).join('')}
          </div>
          <div class="tablewrap jbr-usage-detail-table-wrap-v1061">
            <table class="table usage-table-v1060 jbr-usage-detail-table-v1061">
              <thead>
                <tr>
                  <th>JBR</th>
                  <th>Label Size</th>
                  <th>Gap</th>
                  <th>Pitch</th>
                  <th>JBR Size</th>
                  <th>Across</th>
                  <th>Labels / Lane</th>
                  <th>Theoretical Labels</th>
                  <th>Pcs / Roll</th>
                  <th>Max Rolls</th>
                  <th>Actual Cut</th>
                  <th>Productive Length</th>
                  <th>Consumed Length</th>
                  <th>Waste / Reusable Length</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${jbrRows.map(j=>{
                const m=jbrMeasuredV1061(j,r);
                return `<tr>
                  <td><b>${esc(j.jbr_code||('JBR-'+String(j.jbr_seq||'').padStart(5,'0')))}</b></td>
                  <td>${money(m.labelWidth)} × ${money(m.labelHeight)} mm</td>
                  <td>${money(m.gap)} mm</td>
                  <td>${money(m.pitch)} mm</td>
                  <td>${money(m.jbrWidth)}mm × ${money(m.jbrLengthM)}m</td>
                  <td>${money(m.lanes)}</td>
                  <td>${money(m.labelsPerLane)}</td>
                  <td>${money(m.theoreticalLabels)}</td>
                  <td>${money(m.pcsPerRoll)}</td>
                  <td>${money(m.theoreticalRolls)}</td>
                  <td>${money(m.actualCutRolls)}</td>
                  <td>${money(m.productiveLengthM)} m</td>
                  <td>${money(m.consumedLengthM)} m</td>
                  <td>${money(m.processStatus==='Fully Die Cut'?m.wasteLengthM:m.reusableLengthM)} m ${m.processStatus==='Fully Die Cut'?'waste':'reusable'}</td>
                  <td>${esc(j.process_status||'-')}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        `:'<div class="empty">No JBR records available for this job/product.</div>'}

        <div class="section">CORE USAGE</div>
        <div class="finance-detail-grid-v1059 compact">
          <div><span>Finished Roll Width</span><b>${money(x.width)} mm</b></div>
          <div><span>Job Core Used</span><b>${money(x.coreMm)} mm</b></div>
          <div><span>Core Stick Length</span><b>${money(x.coreStickLength)} mm</b></div>
          <div><span>Equivalent Core</span><b>${x.coreEquivalent.toFixed(3)}</b></div>
          <div><span>Core Sticks Required</span><b>${money(x.coreSticks)}</b></div>
          <div><span>Reusable Core Balance</span><b>${money(x.coreBalance)} mm</b></div>
        </div>

        <div class="section">PACKING</div>
        <div class="finance-detail-grid-v1059 compact">
          <div><span>Job Packed Allocation</span><b>${money(x.packedAllocated)}</b></div>
          <div><span>Batch Packing Records</span><b>${money(x.packRows.length)}</b></div>
          <div><span>Latest Batch Boxes</span><b>${money(latestPack?.box_count||0)}</b></div>
          <div><span>Latest Batch Loose</span><b>${money(latestPack?.loose_rolls||0)}</b></div>
          <div><span>Latest Batch Packed Total</span><b>${money(latestPack?.packed_total||0)}</b></div>
          <div><span>Actual Received</span><b>${money(latestPack?.actual_received_rolls||0)}</b></div>
          <div class="packing-waste-finance-v2026"><span>Potential JBR Material Variance</span><b>${money(x.packingWaste.rolls)} rolls</b><small>${x.packingWaste.sqm==null?"Area not available":money(x.packingWaste.sqm)+" m² JBR-based potential"}</small></div>
          <div><span>QC Result</span><b>${esc(latestPack?.qc_result||'-')}</b></div>
        </div>
        ${batchBoxes.length?`<div class="tablewrap"><table class="table usage-table-v1060"><thead><tr><th>Batch Box</th><th>Rolls</th><th>Note</th></tr></thead><tbody>${batchBoxes.map((b,i)=>`<tr><td>${esc(String(b.box_no??b.boxNo??i+1))}</td><td>${money(Number(b.roll_count??b.rolls??0))}</td><td>${esc(String(b.note||''))}</td></tr>`).join('')}</tbody></table></div>`:''}

        <div class="section">DISPATCH MOVEMENT</div>
        ${(r.dispatches||[]).length?`<div class="tablewrap"><table class="table usage-table-v1060"><thead><tr><th>Dispatch</th><th>Qty</th><th>Date</th><th>Carrier / Note</th></tr></thead><tbody>${(r.dispatches||[]).map(d=>`<tr><td>${esc(d.dispatchNo||d.id||'-')}</td><td>${money(d.qty||0)}</td><td>${esc(d.date||d.dispatchDate||'-')}</td><td>${esc(d.carrier||d.note||'-')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No dispatch movement recorded.</div>'}

        <div class="section">JOB HISTORY</div>
        ${history.length?`<div class="tablewrap"><table class="table usage-table-v1060"><thead><tr><th>Status</th><th>By</th><th>Date / Time</th><th>Note</th></tr></thead><tbody>${history.map(h=>`<tr><td>${esc(h.status||'-')}</td><td>${esc(h.by||h.username||'-')}</td><td>${h.at?esc(new Date(h.at).toLocaleString()):'-'}</td><td>${esc(h.note||'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No job history available.</div>'}
      </div>`;
  }

  window.openFinanceJobV1059=async function(id){
    if(currentUser?.role!=='admin'&&!hasPerm('finance_view'))return requirePerm('finance_view','view job usage');
    const r=(state.productionRequests||[]).find(x=>x.id===id);
    if(!r)return toast('Production job not found');
    try{await usageLoadProductV1060(productKeyV1060(r),true)}
    catch(e){return toast(`Usage data unavailable: ${e.message}`)}
    const x=usageForJobV1060(r);

    $('financeJobMetaV1059').textContent=`${r.orderNo} • ${r.customerName||'-'} • ${r.size} • ${r.material}`;
    $('financeJobBodyV1059').innerHTML=
      usageDetailHtmlV1060(x,false)+
      `<div class="actions"><button class="btn navy" type="button" onclick="generateJobUsagePdfV1060('${r.id}')">Generate Job Usage PDF</button></div>`;
    $('financeJobModalV1059').classList.add('show');
  };

  function usagePdfPaperV1060(x){
    const r=x.r;
    return `<div class="usage-pdf-paper-v1060">
      <div class="usage-pdf-head-v1060">
        <div><div class="usage-pdf-brand-v1060">Soft<span>Creation</span></div><div>Production Job Usage Report</div></div>
        <div class="usage-pdf-ref-v1060"><small>PRODUCTION NO.</small><b>${esc(r.orderNo||'-')}</b><small>Generated ${esc(new Date().toLocaleString())}</small></div>
      </div>
      <div class="usage-pdf-meta-v1060">
        <div><span>Customer</span><b>${esc(r.customerName||'-')}</b></div>
        <div><span>PI</span><b>${esc(r.piSerial||'-')}</b></div>
        <div><span>Product</span><b>${esc(r.size||'-')} • ${esc(r.material||'-')}</b></div>
        <div><span>Specification</span><b>${esc(r.layout||'-')} • ${money(r.pcs)} pcs / ${esc(r.unit||'Rolls')}</b></div>
      </div>
      ${usageDetailHtmlV1060(x,true)}
      <div class="usage-pdf-foot-v1060">Computer-generated operational usage report • No profit or GP calculation is included.</div>
    </div>`;
  }

  window.generateJobUsagePdfV1060=async function(id){
    if(currentUser?.role!=='admin'&&!hasPerm('finance_view'))return requirePerm('finance_view','generate job usage PDF');
    const r=(state.productionRequests||[]).find(x=>x.id===id);
    if(!r)return toast('Production job not found');

    try{await usageLoadProductV1060(productKeyV1060(r),true)}
    catch(e){return toast(`Usage data unavailable: ${e.message}`)}
    const x=usageForJobV1060(r);

    const okC=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',()=>window.html2canvas);
    const okP=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',()=>window.jspdf);
    if(!okC||!okP)return toast('PDF libraries unavailable');

    const host=document.createElement('div');
    host.className='usage-pdf-capture-v1060';
    host.innerHTML=usagePdfPaperV1060(x);
    document.body.appendChild(host);

    try{
      const paper=host.querySelector('.usage-pdf-paper-v1060');
      const canvas=await html2canvas(paper,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false});
      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
      const pageW=210,pageH=297,margin=8,usableW=pageW-margin*2,usableH=pageH-margin*2;
      const imgW=usableW;
      const imgH=canvas.height*imgW/canvas.width;
      const pageCanvasHeight=Math.floor(canvas.width*(usableH/imgW));

      let sourceY=0,page=0;
      while(sourceY<canvas.height){
        const sliceH=Math.min(pageCanvasHeight,canvas.height-sourceY);
        const slice=document.createElement('canvas');
        slice.width=canvas.width;slice.height=sliceH;
        const ctx=slice.getContext('2d');
        ctx.drawImage(canvas,0,sourceY,canvas.width,sliceH,0,0,canvas.width,sliceH);
        const sliceMmH=sliceH*imgW/canvas.width;
        if(page>0)pdf.addPage();
        pdf.addImage(slice.toDataURL('image/png'),'PNG',margin,margin,imgW,sliceMmH);
        sourceY+=sliceH;page++;
      }
      pdf.save(`${String(r.orderNo||'Production').replace(/[\/\\]/g,'-')}-Usage-Report.pdf`);
      toast('Job usage PDF generated');
    }catch(e){
      console.error(e);
      toast(`PDF generation failed: ${e.message}`);
    }finally{host.remove()}
  };

  function installV1060(){
    if(window.__v1060Installed)return;
    window.__v1060Installed=true;
    tuneFinanceUiV1060();

    /* Re-wrap the final Products renderer so Finished legacy jobs always get Dispatch. */
    const baseProducts=window.renderProductionProducts;
    if(typeof baseProducts==='function'){
      window.renderProductionProducts=function(){
        const r=baseProducts.apply(this,arguments);
        setTimeout(enhanceProductDispatchCardsV1060,0);
        return r;
      };
      try{renderProductionProducts=window.renderProductionProducts}catch(_){}
    }

    const baseShow=window.showView;
    if(typeof baseShow==='function'){
      window.showView=function(id){
        const r=baseShow.apply(this,arguments);
        if(id==='productionproducts')setTimeout(enhanceProductDispatchCardsV1060,20);
        if(id==='finance')setTimeout(()=>renderFinanceV1059(true),20);
        return r;
      };
      try{showView=window.showView}catch(_){}
    }

    try{enhanceProductDispatchCardsV1060()}catch(_){}
    if($('finance')?.classList.contains('active'))renderFinanceV1059(true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installV1060,{once:true});
  else installV1060();
})();
