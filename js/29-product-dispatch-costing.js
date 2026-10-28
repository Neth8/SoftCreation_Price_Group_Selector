
/* V1.0.59 - Product Dispatch + Finance Job Costing
   Moves dispatch actions to Products cards and adds permission-controlled live Finance costing. */
(function(){
  const FIN_REST_V1059='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1';
  const FIN_WORKSPACE_V1059='softcreation_main';
  const FIN_KEY_STORE_V1059='spgs_supabase_browser_key_v1';
  const FIN_ADJ_TABLE_V1059='spgs_finance_job_cost_adjustments';
  let financeTimerV1059=null;
  let financeCloudCacheV1059={jbr:new Map(),packing:new Map(),adjustments:new Map(),loadedAt:0};

  function finApiKeyV1059(){
    let key=localStorage.getItem(FIN_KEY_STORE_V1059)||'';
    if(!key){
      key=prompt('SoftCreation cloud setup\n\nPaste the FULL Supabase anon / publishable key for qyxgamverzdmhtvezbft:')||'';
      key=key.trim();
      if(key)localStorage.setItem(FIN_KEY_STORE_V1059,key);
    }
    return key;
  }
  function finHeadersV1059(extra={}){
    const key=finApiKeyV1059();
    if(!key)throw new Error('Supabase key is not configured.');
    const h={apikey:key,...extra};
    if(key.startsWith('eyJ'))h.Authorization='Bearer '+key;
    return h;
  }
  async function finFetchV1059(path,options={}){
    const res=await fetch(FIN_REST_V1059+path,{...options,headers:finHeadersV1059(options.headers||{})});
    if(!res.ok){
      const body=await res.text().catch(()=>res.statusText);
      throw new Error(`Supabase ${res.status}: ${body.slice(0,500)}`);
    }
    if(res.status===204)return null;
    const text=await res.text();
    return text?JSON.parse(text):null;
  }

  /* ---------------------------- Permissions ---------------------------- */
  function installFinancePermissionsV1059(){
    if(Array.isArray(window.USER_FEATURES||null)){
      if(!USER_FEATURES.some(x=>x[0]==='finance_view'))USER_FEATURES.push(['finance_view','Finance — View Job Costing']);
      if(!USER_FEATURES.some(x=>x[0]==='finance_cost_edit'))USER_FEATURES.push(['finance_cost_edit','Finance — Edit Cost Adjustments']);
    }else{
      try{
        if(typeof USER_FEATURES!=='undefined'){
          if(!USER_FEATURES.some(x=>x[0]==='finance_view'))USER_FEATURES.push(['finance_view','Finance — View Job Costing']);
          if(!USER_FEATURES.some(x=>x[0]==='finance_cost_edit'))USER_FEATURES.push(['finance_cost_edit','Finance — Edit Cost Adjustments']);
        }
      }catch(_){ }
    }
    try{VIEW_PERMS.finance='finance_view'}catch(_){ }
    try{renderUserPrivilegeEditor(null)}catch(_){ }
  }

  /* ---------------------------- Finance UI ---------------------------- */
  function ensureFinanceUiV1059(){
    if($('finance'))return;
    const nav=document.querySelector('.nav');
    const settings=document.querySelector('.navbtn[data-view="settings"]');
    if(nav){
      const b=document.createElement('button');
      b.className='navbtn';b.dataset.view='finance';b.textContent='Finance';b.onclick=()=>showView('finance');
      nav.insertBefore(b,settings||null);
    }
    const host=document.querySelector('main')||document.querySelector('.container')||document.querySelector('.app');
    const firstModal=document.querySelector('.modal');
    const section=`<section id="finance" class="view">
      <div class="panel">
        <div class="panel-title">
          <span>Finance — Live Job Costing</span>
          <button class="btn sm" style="background:#fff;color:#087f83" type="button" onclick="renderFinanceV1059(true)">Refresh</button>
        </div>
        <div class="panel-body">
          <div class="notice" style="margin-bottom:12px"><b>Realtime costing:</b> combines quotation/PI cost snapshots, actual production, JBR yield/waste, packing/core usage, dispatch movement and finance cost adjustments. Values refresh automatically while this tab is open.</div>
          <div id="financeKpisV1059" class="finance-kpis-v1059"></div>
          <div class="finance-filter-v1059">
            <input id="financeSearchV1059" class="search" placeholder="Search production / PI / customer / size / material" oninput="renderFinanceV1059(false)">
            <select id="financeStatusV1059" onchange="renderFinanceV1059(false)"><option value="">All statuses</option><option>Requested</option><option>Approved</option><option>Planned</option><option>In Production</option><option>QC Check</option><option>Finished</option><option>Dispatched</option><option>Received</option><option>GRN Closed</option></select>
            <select id="financeMarginV1059" onchange="renderFinanceV1059(false)"><option value="">All margins</option><option value="profit">Profit</option><option value="loss">Loss</option><option value="unknown">Cost unavailable</option></select>
          </div>
          <div id="financeStatusNoteV1059" class="small" style="margin:8px 0"></div>
          <div id="financeJobsV1059"></div>
        </div>
      </div>
    </section>`;
    if(firstModal)firstModal.insertAdjacentHTML('beforebegin',section); else host?.insertAdjacentHTML('beforeend',section);

    document.body.insertAdjacentHTML('beforeend',`
      <div id="financeJobModalV1059" class="modal"><div class="modal-card finance-job-modal-v1059">
        <div class="modal-head"><div><b>Finance Job Costing</b><div id="financeJobMetaV1059" class="small"></div></div><button class="closex" onclick="closeModal('financeJobModalV1059')">×</button></div>
        <div id="financeJobBodyV1059" class="modal-body"></div>
      </div>
      <div id="productDispatchModalV1059" class="modal"><div class="modal-card" style="max-width:980px">
        <div class="modal-head"><div><b>Product Dispatch</b><div id="productDispatchMetaV1059" class="small"></div></div><button class="closex" onclick="closeModal('productDispatchModalV1059')">×</button></div>
        <div id="productDispatchBodyV1059" class="modal-body"></div>
      </div>`);
  }

  /* ------------------------- Dispatch relocation ------------------------ */
  function availableForDispatchV1059(r){
    try{return typeof productionAvailableV81==='function'?Math.max(0,Number(productionAvailableV81(r)||0)):Math.max(0,Number(r.finishedQty||0)-(r.dispatches||[]).reduce((n,d)=>n+Number(d.qty||0),0))}catch(_){return 0}
  }
  function groupDispatchBalanceV1059(g){return (g?.jobs||[]).reduce((n,r)=>n+availableForDispatchV1059(r),0)}

  window.openProductDispatchV1059=function(encodedKey){
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage'))return requirePerm('production_manage','dispatch finished production');
    const key=decodeURIComponent(encodedKey||'');
    const g=(productionProductGroupsV103()||[]).find(x=>x.key===key);
    if(!g)return toast('Product not found');
    const jobs=(g.jobs||[]).filter(r=>availableForDispatchV1059(r)>0).sort((a,b)=>Date.parse(b.finishedAt||b._spgsUpdatedAt||0)-Date.parse(a.finishedAt||a._spgsUpdatedAt||0));
    if(!jobs.length)return toast('No finished balance is available to dispatch for this product.');
    $('productDispatchMetaV1059').textContent=`${g.size} • ${g.material} • ${g.layout} • ${money(g.pcs)} pcs/roll • Available ${money(groupDispatchBalanceV1059(g))} ${g.unit}`;
    $('productDispatchBodyV1059').innerHTML=`<div class="notice"><b>Select the production job to dispatch.</b> Dispatch remains job/carton specific even though this product card is consolidated.</div><div class="product-dispatch-list-v1059">${jobs.map(r=>{
      const avail=availableForDispatchV1059(r);
      const dispatched=(r.dispatches||[]).reduce((n,d)=>n+Number(d.qty||0),0);
      return `<div class="product-dispatch-row-v1059"><div><b>${esc(r.orderNo)}</b><span>${esc(r.customerName||'-')} • PI ${esc(r.piSerial||'-')}</span></div><div><span>Finished</span><b>${money(r.finishedQty||r.packing?.total||0)}</b></div><div><span>Dispatched</span><b>${money(dispatched)}</b></div><div><span>Available</span><b>${money(avail)}</b></div><button class="btn navy sm" type="button" onclick="closeModal('productDispatchModalV1059');openDispatchLoadingV81('${r.id}')">Dispatch</button></div>`;
    }).join('')}</div>`;
    $('productDispatchModalV1059').classList.add('show');
  };

  function stripDispatchFromProductionCardV1059(html){
    if(!html)return html;
    html=html.replace(/<button[^>]*onclick="openDispatchLoadingV81\('[^']+'\)"[^>]*>.*?<\/button>/g,'');
    html=html.replace(/<button[^>]*onclick="openDispatchV8\('[^']+'\)"[^>]*>.*?<\/button>/g,'');
    return html;
  }

  /* -------------------------- Finance costing -------------------------- */
  function finLineForJobV1059(r){
    const doc=(state.docs||[]).find(d=>d.id===r.piId)||null;
    let line=null;
    if(doc){
      if(Number.isInteger(Number(r.lineIndex)))line=(doc.lines||[])[Number(r.lineIndex)]||null;
      if(!line&&r.itemId)line=(doc.lines||[]).find(l=>l.itemId===r.itemId)||null;
      if(!line)line=(doc.lines||[]).find(l=>String(l.size||'')===String(r.size||'')&&String(l.material||'')===String(r.material||'')&&Number(l.pcs||0)===Number(r.pcs||0))||null;
    }
    return {doc,line};
  }
  function finUnitCostV1059(r,line){
    const snap=line?.costSnapshot || (state.items||[]).find(i=>i.id===r.itemId)?.costSnapshot || null;
    return {snap,costPerRoll:Number(snap?.costPerRoll||0),materialCost:Number(snap?.materialCost||0),coreCost:Number(snap?.coreCost||0),packingCost:Number(snap?.packingCost||0),serviceCost:Number(snap?.serviceCost||0)};
  }
  function finRevenueV1059(r,line){
    const price=Number(line?.price||0);
    const ordered=Number(r.requestQty||line?.qty||0);
    return {unitPrice:price,orderedQty:ordered,orderedRevenue:price*ordered,actualRevenue:price*Math.max(0,Number(r.finishedQty||0))};
  }

  async function finLoadCloudForProductV1059(productKey,force=false){
    const now=Date.now();
    if(!force && financeCloudCacheV1059.jbr.has(productKey) && now-financeCloudCacheV1059.loadedAt<15000)return;
    try{
      const [jbr,packing]=await Promise.all([
        finFetchV1059(`/spgs_product_jbrs?workspace=eq.${encodeURIComponent(FIN_WORKSPACE_V1059)}&product_key=eq.${encodeURIComponent(productKey)}&select=*`),
        finFetchV1059(`/spgs_product_packing_batches?workspace=eq.${encodeURIComponent(FIN_WORKSPACE_V1059)}&product_key=eq.${encodeURIComponent(productKey)}&order=created_at.desc&select=*`)
      ]);
      financeCloudCacheV1059.jbr.set(productKey,Array.isArray(jbr)?jbr:[]);
      financeCloudCacheV1059.packing.set(productKey,Array.isArray(packing)?packing:[]);
      financeCloudCacheV1059.loadedAt=now;
    }catch(e){console.warn('Finance cloud product load',e)}
  }
  async function finLoadAdjustmentsV1059(force=false){
    const now=Date.now();
    if(!force && financeCloudCacheV1059.adjustments.size && now-financeCloudCacheV1059.loadedAt<15000)return;
    try{
      const rows=await finFetchV1059(`/spgs_finance_job_cost_adjustments?workspace=eq.${encodeURIComponent(FIN_WORKSPACE_V1059)}&select=*`);
      const m=new Map();
      (Array.isArray(rows)?rows:[]).forEach(x=>{if(!m.has(x.production_job_id))m.set(x.production_job_id,[]);m.get(x.production_job_id).push(x)});
      financeCloudCacheV1059.adjustments=m;
      financeCloudCacheV1059.loadedAt=now;
    }catch(e){console.warn('Finance adjustments load',e)}
  }
  function finProductKeyV1059(r){try{return productionProductKeyV103(r)}catch(_){return [r.size,r.material,r.layout,r.pcs,r.unit].join('|').toUpperCase()}}
  function finJbrStatsV1059(r){
    const rows=financeCloudCacheV1059.jbr.get(finProductKeyV1059(r))||[];
    let actual=0,theoretical=0,waste=0,reusable=0;
    rows.forEach(x=>{
      const a=Number(x.actual_cut_rolls||0),t=Number(x.theoretical_rolls||0),st=String(x.process_status||'');
      actual+=a;theoretical+=t;
      if(st==='Fully Die Cut')waste+=Math.max(0,t-a);else reusable++;
    });
    return {count:rows.length,actual,theoretical,waste,reusable};
  }
  function finPackStatsV1059(r){
    const rows=financeCloudCacheV1059.packing.get(finProductKeyV1059(r))||[];
    const p=rows[0]||null;
    return {records:rows.length,latest:p,packed:Number(p?.packed_total||r.finishedQty||0),boxes:Number(p?.box_count||0),loose:Number(p?.loose_rolls||0),coreMm:Number(p?.core_mm_used||0),coreSticks:Number(p?.core_sticks_required||0),coreBalance:Number(p?.core_balance_mm||0)};
  }
  function finAdjustmentStatsV1059(r){
    const rows=financeCloudCacheV1059.adjustments.get(String(r.id))||[];
    const total=rows.reduce((n,x)=>n+Number(x.amount||0),0);
    return {rows,total};
  }
  function finJobV1059(r){
    const {doc,line}=finLineForJobV1059(r);
    const cost=finUnitCostV1059(r,line),rev=finRevenueV1059(r,line),jbr=finJbrStatsV1059(r),pack=finPackStatsV1059(r),adj=finAdjustmentStatsV1059(r);
    const actualQty=Math.max(0,Number(r.finishedQty||pack.packed||0));
    const productionCost=cost.costPerRoll>0?cost.costPerRoll*actualQty:0;
    const totalCost=productionCost+adj.total;
    const revenue=rev.unitPrice*actualQty;
    const gp=revenue-totalCost;
    const gpPct=revenue>0?gp/revenue*100:null;
    const dispatched=(r.dispatches||[]).reduce((n,d)=>n+Number(d.qty||0),0);
    return {r,doc,line,cost,rev,jbr,pack,adj,actualQty,productionCost,totalCost,revenue,gp,gpPct,dispatched,dispatchBalance:Math.max(0,actualQty-dispatched)};
  }

  window.financeCostDatasetV2026 = async function(force=false){return financeDatasetV1059(force)};
  async function financeDatasetV1059(force=false){
    const jobs=(state.productionRequests||[]).slice();
    const keys=[...new Set(jobs.map(finProductKeyV1059))];
    await Promise.all(keys.map(k=>finLoadCloudForProductV1059(k,force)));
    await finLoadAdjustmentsV1059(force);
    return jobs.map(finJobV1059);
  }

  window.renderFinanceV1059=async function(force=false){
    if(!$('financeJobsV1059'))return;
    if(currentUser?.role!=='admin'&&!hasPerm('finance_view')){
      $('financeJobsV1059').innerHTML='<div class="empty">Finance access is not enabled for this user.</div>';return;
    }
    $('financeStatusNoteV1059').textContent='Updating live costing…';
    let rows;
    try{rows=await financeDatasetV1059(force)}catch(e){$('financeJobsV1059').innerHTML=`<div class="notice"><b>Finance data error:</b> ${esc(e.message)}</div>`;return}
    const q=String($('financeSearchV1059')?.value||'').trim().toLowerCase();
    const sf=$('financeStatusV1059')?.value||'',mf=$('financeMarginV1059')?.value||'';
    rows=rows.filter(x=>(!sf||x.r.status===sf)&&(!q||[x.r.orderNo,x.r.piSerial,x.r.customerName,x.r.size,x.r.material,x.r.layout].join(' ').toLowerCase().includes(q))).filter(x=>{
      if(!mf)return true;if(mf==='unknown')return !(x.cost.costPerRoll>0);if(!(x.cost.costPerRoll>0))return false;return mf==='profit'?x.gp>=0:x.gp<0;
    });
    const totals=rows.reduce((a,x)=>{a.jobs++;a.revenue+=x.revenue;a.cost+=x.totalCost;a.gp+=x.gp;a.finished+=x.actualQty;a.waste+=x.jbr.waste;return a},{jobs:0,revenue:0,cost:0,gp:0,finished:0,waste:0});
    $('financeKpisV1059').innerHTML=`
      <div><span>Jobs</span><b>${money(totals.jobs)}</b><small>filtered production jobs</small></div>
      <div><span>Actual Revenue</span><b>LKR ${money(totals.revenue)}</b><small>finished qty × selling price</small></div>
      <div><span>Estimated Cost</span><b>LKR ${money(totals.cost)}</b><small>cost snapshot + adjustments</small></div>
      <div class="${totals.gp<0?'loss':''}"><span>Gross Profit</span><b>LKR ${money(totals.gp)}</b><small>${totals.revenue>0?(totals.gp/totals.revenue*100).toFixed(1):'0.0'}% GP</small></div>
      <div><span>JBR Waste</span><b>${money(totals.waste)}</b><small>confirmed full-die-cut roll equivalent</small></div>`;
    $('financeJobsV1059').innerHTML=rows.length?`<div class="tablewrap"><table class="table finance-table-v1059"><thead><tr><th>Job / Customer</th><th>Product</th><th>Status</th><th>Requested</th><th>Finished</th><th>Sell / Roll</th><th>Cost / Roll</th><th>Adjust.</th><th>Total Cost</th><th>Revenue</th><th>GP</th><th>Ops</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr>
      <td><b>${esc(x.r.orderNo)}</b><div class="small">${esc(x.r.customerName||'-')} • PI ${esc(x.r.piSerial||'-')}</div></td>
      <td>${esc(x.r.size)}<div class="small">${esc(x.r.material)} • ${esc(x.r.layout)} • ${money(x.r.pcs)} pcs</div></td>
      <td><span class="tag">${esc(x.r.status||'-')}</span></td>
      <td>${money(x.r.requestQty)} ${esc(x.r.unit||'')}</td><td>${money(x.actualQty)}</td>
      <td>LKR ${x.rev.unitPrice>0?money(x.rev.unitPrice):'-'}</td><td>LKR ${x.cost.costPerRoll>0?money(x.cost.costPerRoll):'-'}</td>
      <td>LKR ${money(x.adj.total)}</td><td><b>LKR ${money(x.totalCost)}</b></td><td><b>LKR ${money(x.revenue)}</b></td>
      <td class="${x.gp<0?'finance-loss-v1059':'finance-profit-v1059'}"><b>LKR ${money(x.gp)}</b><div class="small">${x.gpPct==null?'-':x.gpPct.toFixed(1)+'%'}</div></td>
      <td><div class="small">JBR ${money(x.jbr.actual)} cut / ${money(x.jbr.waste)} waste<br>${money(x.pack.boxes)} boxes • Core ${money(x.pack.coreSticks)} sticks<br>Dispatch ${money(x.dispatched)} / Bal ${money(x.dispatchBalance)}</div></td>
      <td><button class="btn ghost sm" onclick="openFinanceJobV1059('${x.r.id}')">View</button></td>
    </tr>`).join('')}</tbody></table></div>`:'<div class="empty">No matching finance jobs.</div>';
    $('financeStatusNoteV1059').textContent=`Last updated ${new Date().toLocaleTimeString()} • auto refresh every 20 seconds while Finance is open`;
  };

  window.openFinanceJobV1059=async function(id){
    if(currentUser?.role!=='admin'&&!hasPerm('finance_view'))return requirePerm('finance_view','view finance costing');
    await financeDatasetV1059(true);
    const r=(state.productionRequests||[]).find(x=>x.id===id);if(!r)return toast('Production job not found');
    const x=finJobV1059(r),snap=x.cost.snap||{};
    $('financeJobMetaV1059').textContent=`${r.orderNo} • ${r.customerName||'-'} • ${r.size} • ${r.material}`;
    $('financeJobBodyV1059').innerHTML=`
      <div class="finance-detail-grid-v1059">
        <div><span>Requested</span><b>${money(r.requestQty)} ${esc(r.unit||'')}</b></div><div><span>Finished</span><b>${money(x.actualQty)}</b></div><div><span>Selling Price / Roll</span><b>LKR ${money(x.rev.unitPrice)}</b></div><div><span>Cost / Roll</span><b>LKR ${x.cost.costPerRoll>0?money(x.cost.costPerRoll):'Unavailable'}</b></div>
        <div><span>Production Cost</span><b>LKR ${money(x.productionCost)}</b></div><div><span>Extra Costs</span><b>LKR ${money(x.adj.total)}</b></div><div><span>Total Cost</span><b>LKR ${money(x.totalCost)}</b></div><div><span>Actual Revenue</span><b>LKR ${money(x.revenue)}</b></div>
        <div class="${x.gp<0?'loss':''}"><span>Gross Profit</span><b>LKR ${money(x.gp)}</b></div><div><span>GP %</span><b>${x.gpPct==null?'-':x.gpPct.toFixed(2)+'%'}</b></div><div><span>Dispatch Balance</span><b>${money(x.dispatchBalance)}</b></div><div><span>Status</span><b>${esc(r.status||'-')}</b></div>
      </div>
      <div class="section">COST SNAPSHOT / ROLL</div>
      <div class="finance-detail-grid-v1059 compact"><div><span>Material</span><b>LKR ${money(x.cost.materialCost)}</b></div><div><span>Core</span><b>LKR ${money(x.cost.coreCost)}</b></div><div><span>Packing</span><b>LKR ${money(x.cost.packingCost)}</b></div><div><span>Service</span><b>LKR ${money(x.cost.serviceCost)}</b></div></div>
      <div class="section">PRODUCTION REALITY</div>
      <div class="finance-detail-grid-v1059 compact"><div><span>JBRs</span><b>${money(x.jbr.count)}</b></div><div><span>JBR Actual Cut</span><b>${money(x.jbr.actual)}</b></div><div><span>Confirmed Waste</span><b>${money(x.jbr.waste)}</b></div><div><span>Reusable Incomplete JBRs</span><b>${money(x.jbr.reusable)}</b></div><div><span>Packed</span><b>${money(x.pack.packed)}</b></div><div><span>Boxes</span><b>${money(x.pack.boxes)}</b></div><div><span>Loose</span><b>${money(x.pack.loose)}</b></div><div><span>Core Used</span><b>${money(x.pack.coreMm)} mm / ${money(x.pack.coreSticks)} sticks</b></div></div>
      <div class="section">FINANCE COST ADJUSTMENTS</div>
      <div id="financeAdjustmentsV1059">${x.adj.rows.length?`<table class="table"><thead><tr><th>Type</th><th>Description</th><th>Amount</th><th>By / Date</th></tr></thead><tbody>${x.adj.rows.map(a=>`<tr><td>${esc(a.cost_type||'Other')}</td><td>${esc(a.description||'')}</td><td>LKR ${money(a.amount)}</td><td>${esc(a.created_by_display||a.created_by_username||'-')}<div class="small">${a.created_at?new Date(a.created_at).toLocaleString():'-'}</div></td></tr>`).join('')}</tbody></table>`:'<div class="empty">No extra finance costs.</div>'}</div>
      ${(currentUser?.role==='admin'||hasPerm('finance_cost_edit'))?`<div class="finance-adjust-form-v1059"><div class="field"><label>Cost Type</label><select id="finAdjTypeV1059"><option>Labour</option><option>Electricity</option><option>Transport</option><option>Rework</option><option>Machine / Service</option><option>Other</option></select></div><div class="field"><label>Amount (LKR)</label><input id="finAdjAmountV1059" type="number" min="0" step="0.01"></div><div class="field full"><label>Description</label><input id="finAdjDescV1059" placeholder="Reason / reference"></div><button class="btn primary" type="button" onclick="saveFinanceAdjustmentV1059('${r.id}')">Add Cost Adjustment</button></div>`:''}`;
    $('financeJobModalV1059').classList.add('show');
  };

  window.saveFinanceAdjustmentV1059=async function(jobId){
    if(currentUser?.role!=='admin'&&!hasPerm('finance_cost_edit'))return requirePerm('finance_cost_edit','edit finance job costs');
    const r=(state.productionRequests||[]).find(x=>x.id===jobId);if(!r)return toast('Production job not found');
    const amount=Number($('finAdjAmountV1059')?.value||0),costType=$('finAdjTypeV1059')?.value||'Other',description=String($('finAdjDescV1059')?.value||'').trim();
    if(!(amount>0))return toast('Enter a cost amount greater than zero');
    const payload={workspace:FIN_WORKSPACE_V1059,production_job_id:String(r.id),production_no:String(r.orderNo||''),pi_id:String(r.piId||''),pi_serial:String(r.piSerial||''),product_key:finProductKeyV1059(r),cost_type:costType,description,amount,created_by_username:String(currentUser?.username||''),created_by_display:String(currentUser?.display||currentUser?.username||'User')};
    try{
      await finFetchV1059(`/${FIN_ADJ_TABLE_V1059}`,{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(payload)});
      financeCloudCacheV1059.adjustments.clear();
      await openFinanceJobV1059(jobId);await renderFinanceV1059(true);toast('Finance cost adjustment saved');
    }catch(e){toast(`Cost adjustment was NOT saved: ${e.message}`)}
  };

  function startFinanceRealtimeV1059(){
    if(financeTimerV1059)clearInterval(financeTimerV1059);
    financeTimerV1059=setInterval(()=>{if($('finance')?.classList.contains('active'))renderFinanceV1059(true)},20000);
  }

  function installV1059(){
    if(window.__v1059Installed)return;window.__v1059Installed=true;
    ensureFinanceUiV1059();installFinancePermissionsV1059();

    /* Hide Finance nav immediately when permission is absent. */
    const baseAccess=window.applyUserAccess;
    if(typeof baseAccess==='function'){
      window.applyUserAccess=function(){const r=baseAccess.apply(this,arguments);const b=document.querySelector('.navbtn[data-view="finance"]');if(b)b.style.display=(currentUser?.role==='admin'||hasPerm('finance_view'))?'inline-block':'none';return r};
      try{applyUserAccess=window.applyUserAccess}catch(_){ }
    }

    /* Finance activation + realtime refresh. */
    const baseShow=window.showView;
    if(typeof baseShow==='function'){
      window.showView=function(id){if(id==='finance'&&currentUser?.role!=='admin'&&!hasPerm('finance_view'))return requirePerm('finance_view','open Finance');const r=baseShow.apply(this,arguments);if(id==='finance')renderFinanceV1059(true);return r};
      try{showView=window.showView}catch(_){ }
    }

    /* Remove Dispatch from Production summary/job cards. */
    const baseProdCard=window.productionCardV8||((typeof productionCardV8==='function')?productionCardV8:null);
    if(typeof baseProdCard==='function'){
      window.productionCardV8=function(r){return stripDispatchFromProductionCardV1059(baseProdCard(r))};
      try{productionCardV8=window.productionCardV8}catch(_){ }
    }

    /* Products-card Dispatch creation moved to standalone V1.0.64. */

    const baseRefresh=window.refreshAll;
    if(typeof baseRefresh==='function'){
      window.refreshAll=function(){const r=baseRefresh.apply(this,arguments);if($('finance')?.classList.contains('active'))renderFinanceV1059(true);return r};
      try{refreshAll=window.refreshAll}catch(_){ }
    }
    try{applyUserAccess()}catch(_){ }
    startFinanceRealtimeV1059();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installV1059,{once:true});else installV1059();
})();
