const fs = require('fs');

let code = fs.readFileSync('js/41-production-control-planner.js', 'utf8');
const isCRLF = code.includes('\r\n');
const eol = isCRLF ? '\r\n' : '\n';

// 1. Top state declarations
const topRegex = /let pcSearchTermNov3='';[\r\n]+let pcSelectedScOrderKey='';[\r\n]+let pcScInnerSelections=new Map\(\);[\r\n]+let pcModalScOrder=null;[\r\n]+let pcModalCandidateOrders=\[\];[\r\n]+let pcModalTempCheckedKeys=new Set\(\);/;

const topReplacement = [
  "let pcSearchTermNov3='';",
  "let pcSelectedOrderKeys=new Set();",
  "let pcCurrentGroupKey='';",
  "let pcSavedExtraQty=null;",
  "let pcSavedOverrideReason=null;"
].join(eol);

if (!topRegex.test(code)) {
  console.error('topRegex did not match!');
  process.exit(1);
}
code = code.replace(topRegex, topReplacement);
console.log('1. Top declarations replaced successfully.');

// 2. pcDemandGroups replacement
const demandGroupsRegex = /function pcDemandGroups\(\)\{[\s\S]*?return \[\.\.\.m\.values\(\)\][\s\S]*?\.filter\(g=>g\.orders\.length>0\)[\s\S]*?\.sort\(\(a,b\)=>b\.recommended-a\.recommended\|\|a\.size\.localeCompare\(b\.size,undefined,\{numeric:true\}\)\)\s*\}/;

const demandGroupsReplacement = `function pcDemandGroups(){
  const m=new Map();
  (state.salesOrders||[]).forEach(so=>{
    if(String(so.status).toLowerCase()==='cancelled')return;
    (so.lines||[]).forEach((l,i)=>{
      if(l.use===false)return;
      const k=pcLineKey(l);
      let g=m.get(k);
      if(!g){
        g={key:k,sourceItemId:pcCanonicalMaster(l)?.id||l.itemId||'',desc:l.desc||'Item',size:l.size||'',material:l.material||'',layout:l.layout||'',pcs:pcNum(l.pcs),unit:l.unit||'Rolls',orders:[]};
        m.set(k,g);
      }
      const ordered=pcNum(l.qty),
            dispatched=Math.min(ordered,pcDispatchedForSOLine(so,i)),
            cancelled=pcNum(l.cancelledQty),
            grossOpen=Math.max(0,ordered-dispatched-cancelled),
            allocated=Math.min(grossOpen,pcAllocatedToOpenRequests(so.id,i)),
            available=Math.max(0,grossOpen-allocated);
      const coveredBySoftCreationSoNo=l.coveredBySoftCreationSoNo||'';
      const coveredBySoftCreationSoId=l.coveredBySoftCreationSoId||'';
      const alreadyAddedQty=pcNum(l.alreadyAddedQty);

      if(grossOpen>0 || coveredBySoftCreationSoNo){
        g.orders.push({
          sourceSoId:so.id,
          sourceSoNo:so.soNo||so.id,
          lineIndex:i,
          customer:so.customerName||'',
          requiredDate:so.needDate||'',
          ordered,
          dispatched,
          cancelled,
          grossOpen,
          allocated,
          available,
          coveredBySoftCreationSoNo,
          coveredBySoftCreationSoId,
          alreadyAddedQty
        });
      }
    });
  });
  return [...m.values()].map(g=>{
    const p=pcPolicy(g.key),movement=pcDeliveredMovementWeeks(g.key),avg=movement.reduce((a,b)=>a+b,0)/4,coverWeeks=Math.max(.25,pcNum(p.cover_weeks)||2),demand=g.orders.reduce((n,o)=>n+o.available,0),cover=Math.ceil(avg*coverWeeks),safety=Math.max(0,pcNum(p.safety_stock_qty)),stock=Math.max(0,pcNum(p.available_stock_qty)),pipeline=Math.max(0,pcPipelineForItem(g.key)),recommended=Math.max(0,Math.ceil(demand+cover+safety-stock-pipeline));
    return {...g,movement,avg,coverWeeks,demand,cover,safety,stock,pipeline,recommended};
  }).filter(g=>g.orders.length>0).sort((a,b)=>b.recommended-a.recommended||a.size.localeCompare(b.size,undefined,{numeric:true}));
}`.replace(/\n/g, eol);

if (!demandGroupsRegex.test(code)) {
  console.error('demandGroupsRegex did not match!');
  process.exit(1);
}
code = code.replace(demandGroupsRegex, demandGroupsReplacement);
console.log('2. pcDemandGroups replaced successfully.');

// 3. Selection & Modal logic from pcIsSoftcreationOrder to function pcGroup(k)
const middleRegex = /\/\/ Customer matching is exact after case and whitespace normalization[\s\S]*?(?=function pcGroup\(k\)\{)/;

const middleReplacement = `// Customer matching is exact after case and whitespace normalization; never use a substring.
function pcIsSoftcreationOrder(o){
  const c=pcNorm(o?.customer).replace(/[.,]/g,'').replace(/\\s*\\(\\s*/g,' (').replace(/\\s*\\)\\s*/g,')').replace(/\\s+/g,' ').trim();
  return c==='SOFTCREATION (PVT) LTD'||c==='SOFTCREATION'||c.startsWith('SOFTCREATION');
}
function pcOrderSelectionKey(o){return String(o.sourceSoId)+'|'+Number(o.lineIndex)}

function pcSyncSelectedOrderKeys(g){
  if(!g){
    pcSelectedOrderKeys.clear();
    pcCurrentGroupKey='';
    return;
  }
  if(pcCurrentGroupKey!==g.key){
    pcCurrentGroupKey=g.key;
    pcSelectedOrderKeys.clear();
    (g.orders||[]).forEach(o=>{
      if(o.available>0)pcSelectedOrderKeys.add(pcOrderSelectionKey(o));
    });
  }else{
    const valid=new Set((g.orders||[]).filter(o=>o.available>0).map(pcOrderSelectionKey));
    for(const k of pcSelectedOrderKeys){
      if(!valid.has(k))pcSelectedOrderKeys.delete(k);
    }
  }
}

function pcSelectedOrders(g){
  if(!g)return [];
  return (g.orders||[]).filter(o=>o.available>0&&pcSelectedOrderKeys.has(pcOrderSelectionKey(o)));
}

function pcSelectedDemand(g){
  return pcSelectedOrders(g).reduce((sum,o)=>sum+pcNum(o.available),0);
}

function pcSelectedRecommended(g){
  return Math.max(0,Math.ceil(pcSelectedDemand(g)+g.cover+g.safety-g.stock-g.pipeline));
}

function pcSelectionSummary(g){
  const chosen=pcSelectedOrders(g);
  if(!chosen.length)return 'No Sales Orders selected · 0 rolls';
  const names=chosen.map(o=>o.sourceSoNo).slice(0,3).join(', ');
  const more=chosen.length>3?\` +\${chosen.length-3} more\`:'';
  return \`\${chosen.length} Sales Order line(s) selected · \${pcMoney(pcSelectedDemand(g))} rolls (\${names}\${more})\`;
}

window.pcToggleOrderSelection=function(soId,lineIndex,checked){
  const g=pcGroup(pcPlannerItemKey);
  if(!g)return;
  const key=String(soId)+'|'+Number(lineIndex);
  if(checked){
    pcSelectedOrderKeys.add(key);
  }else{
    pcSelectedOrderKeys.delete(key);
  }
  pcRender();
};

window.pcToggleSelectAllOrders=function(checked){
  const g=pcGroup(pcPlannerItemKey);
  if(!g)return;
  if(checked){
    (g.orders||[]).forEach(o=>{
      if(o.available>0)pcSelectedOrderKeys.add(pcOrderSelectionKey(o));
    });
  }else{
    pcSelectedOrderKeys.clear();
  }
  pcRender();
};

function pcEnsureAlreadyAddedModal(){
  if(document.getElementById('pcAlreadyAddedModal'))return;
  document.body.insertAdjacentHTML('beforeend',\`
    <div id="pcAlreadyAddedModal" class="modal" role="dialog" aria-modal="true">
      <div class="modal-card" style="max-width:560px">
        <div class="modal-head" style="display:flex;justify-content:space-between;align-items:center">
          <b>Mark Demand as Already Added</b>
          <button class="closex" type="button" onclick="pcCloseAlreadyAddedModal()">×</button>
        </div>
        <div class="modal-body" style="padding:16px 20px">
          <input type="hidden" id="pcAlreadyAddedSoId">
          <input type="hidden" id="pcAlreadyAddedLineIndex">
          <div id="pcAlreadyAddedMeta" class="notice" style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;line-height:1.6"></div>
          <div class="field" style="margin-top:14px">
            <label><b>Covering SoftCreation Order *</b></label>
            <select id="pcAlreadyAddedScOrder" style="width:100%"></select>
            <div class="hint" style="color:#64748b;font-size:11px;margin-top:4px">Select the SoftCreation order that includes this customer requirement to prevent duplicate production.</div>
          </div>
          <div class="field" style="margin-top:12px">
            <label><b>Remarks / Note</b></label>
            <textarea id="pcAlreadyAddedReason" placeholder="Optional explanation (e.g. Qty included in SoftCreation batch)..." style="width:100%;height:70px;box-sizing:border-box"></textarea>
          </div>
          <div class="actions" style="margin-top:16px;display:flex;justify-content:flex-end;gap:10px">
            <button type="button" class="btn ghost" onclick="pcCloseAlreadyAddedModal()">Keep Open Demand</button>
            <button type="button" class="btn amber" style="background:#d97706;border-color:#b45309;color:#fff" onclick="pcConfirmAlreadyAdded()">Confirm Already Added</button>
          </div>
        </div>
      </div>
    </div>
  \`);
}

window.pcOpenAlreadyAddedModal=function(soId,lineIndex){
  pcEnsureAlreadyAddedModal();
  const so=(state.salesOrders||[]).find(s=>String(s.id)===String(soId));
  if(!so)return toast('Sales order not found');
  const l=so.lines?.[lineIndex];
  if(!l)return toast('Order line not found');

  const ordered=pcNum(l.qty);
  const dispatched=Math.min(ordered,pcDispatchedForSOLine(so,lineIndex));
  const cancelled=pcNum(l.cancelledQty);
  const grossOpen=Math.max(0,ordered-dispatched-cancelled);
  const allocated=Math.min(grossOpen,pcAllocatedToOpenRequests(so.id,lineIndex));
  const available=Math.max(0,grossOpen-allocated);

  if(available<=0)return toast('No open demand remains to mark on this line.');

  const g=pcGroup(pcPlannerItemKey);
  const scSelect=document.getElementById('pcAlreadyAddedScOrder');
  if(scSelect && g){
    const scOrders=(g.orders||[]).filter(o=>pcIsSoftcreationOrder(o) && String(o.sourceSoId)!==String(soId));
    let options='';
    if(scOrders.length>0){
      options=scOrders.map(o=>\`<option value="\${pcEsc(o.sourceSoId)}|\${pcEsc(o.sourceSoNo)}">\${pcEsc(o.sourceSoNo)} — SoftCreation (Pvt) Ltd (\${pcMoney(o.available)} rolls open / \${pcMoney(o.ordered)} ordered)</option>\`).join('');
      options+=\`<option value="NONE">-- Direct Cancellation (Not inside SoftCreation) --</option>\`;
    }else{
      options=\`<option value="NONE">-- Direct Cancellation (No open SoftCreation order found for this item) --</option>\`;
    }
    scSelect.innerHTML=options;
  }

  document.getElementById('pcAlreadyAddedSoId').value=soId;
  document.getElementById('pcAlreadyAddedLineIndex').value=lineIndex;
  document.getElementById('pcAlreadyAddedReason').value='';
  document.getElementById('pcAlreadyAddedMeta').innerHTML=\`
    <b>Sales Order: \${pcEsc(so.soNo||so.id)}</b> • Customer: <b>\${pcEsc(so.customerName||'')}</b><br>
    Item: <b>\${pcEsc(l.desc||'Item')} \${pcEsc(l.size||'')} \${pcEsc(l.material||'')}</b><br>
    Ordered: <b>\${pcMoney(ordered)}</b> • Open Demand: <b>\${pcMoney(available)} \${pcEsc(l.unit||'Rolls')}</b>
  \`;
  document.getElementById('pcAlreadyAddedModal')?.classList.add('show');
};

window.pcCloseAlreadyAddedModal=function(){
  document.getElementById('pcAlreadyAddedModal')?.classList.remove('show');
};

window.pcConfirmAlreadyAdded=function(){
  const soId=document.getElementById('pcAlreadyAddedSoId')?.value;
  const lineIndex=Number(document.getElementById('pcAlreadyAddedLineIndex')?.value);
  const scVal=String(document.getElementById('pcAlreadyAddedScOrder')?.value||'');
  let note=String(document.getElementById('pcAlreadyAddedReason')?.value||'').trim();

  const isNone=scVal==='NONE'||!scVal;
  let scSoId='',scSoNo='';
  if(!isNone){
    const parts=scVal.split('|');
    scSoId=parts[0];
    scSoNo=parts[1]||parts[0];
  }else{
    if(!note){
      return toast('Please enter a reason for cancellation when not linked to a SoftCreation order.');
    }
  }

  const so=(state.salesOrders||[]).find(s=>String(s.id)===String(soId));
  if(!so)return toast('Sales order not found');
  const l=so.lines?.[lineIndex];
  if(!l)return toast('Order line not found');

  const ordered=pcNum(l.qty);
  const dispatched=Math.min(ordered,pcDispatchedForSOLine(so,lineIndex));
  const cancelled=pcNum(l.cancelledQty);
  const grossOpen=Math.max(0,ordered-dispatched-cancelled);
  const allocated=Math.min(grossOpen,pcAllocatedToOpenRequests(so.id,lineIndex));
  const available=Math.max(0,grossOpen-allocated);

  if(available<=0){
    pcCloseAlreadyAddedModal();
    return toast('No open demand available to mark on this line.');
  }

  const now=new Date().toISOString();
  const userName=currentUser?.display||currentUser?.username||'User';

  if(!note && scSoNo){
    note=\`Demand covered under SoftCreation order \${scSoNo} (Already Added)\`;
  }

  l.cancelledQty=cancelled+available;
  if(scSoNo){
    l.coveredBySoftCreationSoId=scSoId;
    l.coveredBySoftCreationSoNo=scSoNo;
    l.alreadyAddedQty=available;
  }
  l.cancellationHistory=l.cancellationHistory||[];
  l.cancellationHistory.push({
    reason:note,
    coveredBySoftCreationSoNo:scSoNo||'',
    cancelledQty:available,
    user:userName,
    username:currentUser?.username||'user',
    at:now
  });

  so.history=so.history||[];
  so.history.push({
    action:scSoNo?'Demand Already Added':'Demand Cancelled',
    by:userName,
    at:now,
    note:\`Line \${lineIndex+1} (\${l.desc} \${l.size}): \${available} rolls demand \${scSoNo?'covered in '+scSoNo:'cancelled'}. Note: \${note}\`
  });

  pcSelectedOrderKeys.delete(String(soId)+'|'+lineIndex);

  saveState();
  pcCloseAlreadyAddedModal();
  pcRender();
  toast(scSoNo
    ? \`Marked \${so.soNo}: \${available} rolls covered under SoftCreation \${scSoNo}\`
    : \`Cancelled demand for \${so.soNo}: \${available} rolls removed from planning.\`
  );
};

window.pcRevertAlreadyAdded=function(soId,lineIndex){
  const so=(state.salesOrders||[]).find(s=>String(s.id)===String(soId));
  if(!so)return toast('Sales order not found');
  const l=so.lines?.[lineIndex];
  if(!l)return toast('Order line not found');

  const coveredQty=pcNum(l.alreadyAddedQty||l.cancelledQty);
  if(coveredQty<=0)return toast('No already added demand to revert.');

  const scSoNo=l.coveredBySoftCreationSoNo||'';
  l.cancelledQty=Math.max(0,pcNum(l.cancelledQty)-coveredQty);
  l.alreadyAddedQty=0;
  l.coveredBySoftCreationSoId='';
  l.coveredBySoftCreationSoNo='';

  const now=new Date().toISOString();
  const userName=currentUser?.display||currentUser?.username||'User';
  l.cancellationHistory=l.cancellationHistory||[];
  l.cancellationHistory.push({
    action:'Already Added Reverted',
    revertedQty:coveredQty,
    user:userName,
    username:currentUser?.username||'user',
    at:now
  });
  so.history=so.history||[];
  so.history.push({
    action:'Demand Restored',
    by:userName,
    at:now,
    note:\`Line \${lineIndex+1}: Reverted Already Added status (restored \${coveredQty} rolls to Production Control)\`
  });

  pcSelectedOrderKeys.add(String(soId)+'|'+lineIndex);

  saveState();
  pcRender();
  toast(\`Restored \${coveredQty} rolls demand for \${so.soNo}\`);
};

// Backwards compatibility aliases
window.pcOpenCancelDemandModal=window.pcOpenAlreadyAddedModal;
window.pcCloseCancelDemandModal=window.pcCloseAlreadyAddedModal;
window.pcConfirmCancelDemand=window.pcConfirmAlreadyAdded;
window.pcCloseScOrdersModal=function(){};

`.replace(/\n/g, eol);

if (!middleRegex.test(code)) {
  console.error('middleRegex did not match!');
  process.exit(1);
}
code = code.replace(middleRegex, middleReplacement);
console.log('3. Selection & Modal logic replaced successfully.');

// 4. pcRender replacement
const renderRegex = /function pcRender\(\)\{[\s\S]*?(?=function pcPlannerHTML\(\)\{)/;

const renderReplacement = `function pcRender(){
  const role=String(currentUser?.role||'').toLowerCase();
  const isManager=role==='manager';

  const extraInput=document.getElementById('pcExtraQty');
  const overrideInput=document.getElementById('pcOverride');
  if(extraInput){
    pcSavedExtraQty=extraInput.value;
  }
  if(overrideInput){
    pcSavedOverrideReason=overrideInput.value;
  }

  const plannerBtn=document.querySelector('[data-pc-view="planner"]');
  if(plannerBtn)plannerBtn.style.display=isManager?'none':'';

  if(isManager&&pcView==='planner')pcView='approvals';
  const approveTab=document.querySelector('[data-pc-view="approvals"]');
  if(approveTab)approveTab.style.display=pcHas('production_control_approve')?'':'none';
  const pendingCount=document.getElementById('pcPendingCount');
  if(pendingCount)pendingCount.textContent='('+pcCloud.requests.filter(r=>r.status==='Pending Approval').length+')';
  const historyCount=document.getElementById('pcHistoryCount');
  if(historyCount)historyCount.textContent='('+pcHistoryRequestIdsV1130().size+')';

  document.querySelectorAll('[data-pc-view]').forEach(
    b=>b.classList.toggle('active',b.dataset.pcView===pcView)
  );

  pcRenderKpis();

  const b=document.getElementById('pcBody');
  if(!b)return;

  const roleBanner=isManager
    ? \`<div class="pc-role-banner-v1119 manager"><b>Manager Approval Workspace</b><span>You can review, approve or return Sales production requests. Managers cannot create production requests.</span></div>\`
    : role==='sales'
      ? \`<div class="pc-role-banner-v1119 sales"><b>Sales Production Request Workspace</b><span>Create and submit requests. Approval is controlled by Manager.</span></div>\`
      : '';

  const body=pcView==='planner'
    ? pcPlannerHTML()
    : pcView==='approvals'
      ? pcApprovalsHTML()
    : pcView==='register'
      ? pcRegisterHTML()
      : pcView==='history'
        ? pcHistoryHTMLV1130()
        : pcDemandHTML();

  b.innerHTML=roleBanner+body;
  const search=document.getElementById('pcSearchNov3');if(search&&search.value!==pcSearchTermNov3)search.value=pcSearchTermNov3;
  if(pcSearchTermNov3)window.pcSearchChangedNov3(pcSearchTermNov3);
}
`.replace(/\n/g, eol);

if (!renderRegex.test(code)) {
  console.error('renderRegex did not match!');
  process.exit(1);
}
code = code.replace(renderRegex, renderReplacement);
console.log('4. pcRender replaced successfully.');

// 5. pcPlannerGroupHTML & pcIntelligenceHTML replacement
const plannerGroupsRegex = /function pcPlannerGroupHTML\(g\)\{[\s\S]*?(?=window\.pcUpdateSimpleQtyV1142=)/;

const plannerGroupsReplacement = `function pcPlannerGroupHTML(g){
  pcSyncSelectedOrderKeys(g);
  const availOrders=(g.orders||[]).filter(o=>o.available>0);
  const allChecked=availOrders.length>0&&availOrders.every(o=>pcSelectedOrderKeys.has(pcOrderSelectionKey(o)));

  return \`<div class="pc-demand-title"><div><b>\${pcEsc(pcLineLabel(g))}</b><small>\${pcEsc(g.key)}</small></div><span class="pc-pill blue">\${pcMoney(g.demand)} rolls open demand</span></div>
  <div class="pc-scroll"><table class="pc-table"><thead><tr>
    <th style="width:70px;text-align:center">
      <label style="cursor:pointer;display:inline-flex;align-items:center;gap:3px;font-size:12px;margin:0" title="Toggle Select All">
        <input type="checkbox" id="pcSelectAllTick" \${allChecked?'checked':''} \${availOrders.length===0?'disabled':''} onchange="pcToggleSelectAllOrders(this.checked)"> Select
      </label>
    </th>
    <th>SO / Customer</th>
    <th>Required</th>
    <th class="num">Ordered</th>
    <th class="num">Dispatched</th>
    <th class="num">Open</th>
    <th class="num">Already PR</th>
    <th class="num">To Plan</th>
    <th style="text-align:center">Action</th>
  </tr></thead><tbody>\${g.orders.map(o=>{
    const open=pcNum(o.grossOpen),assigned=pcNum(o.allocated),toPlan=pcNum(o.available);
    const isSC=pcIsSoftcreationOrder(o);
    const rowKey=pcOrderSelectionKey(o);
    const isChecked=toPlan>0&&pcSelectedOrderKeys.has(rowKey);
    const rowState=assigned>0&&toPlan>0?'mixed':assigned>0?'assigned':toPlan>0?'toplan':'open';

    let checkCell='';
    if(toPlan>0){
      checkCell=\`<input type="checkbox" class="pc-order-tick pc-sc-tick" aria-label="Select order \${pcEsc(o.sourceSoNo)}" \${isChecked?'checked':''} onchange="pcToggleOrderSelection(decodeURIComponent('\${encodeURIComponent(String(o.sourceSoId))}'),\${Number(o.lineIndex)},this.checked)">\`;
    }else if(o.coveredBySoftCreationSoNo){
      checkCell=\`<span class="tag amber sm" style="font-size:10px;padding:2px 5px">Covered</span>\`;
    }else{
      checkCell=\`<span style="color:#94a3b8;font-size:12px">—</span>\`;
    }

    let actionCell='';
    if(toPlan>0){
      actionCell=\`<button type="button" class="btn amber sm" style="font-size:11px;padding:2px 8px;white-space:nowrap;background:#d97706;border-color:#b45309;color:#fff" onclick="pcOpenAlreadyAddedModal(decodeURIComponent('\${encodeURIComponent(String(o.sourceSoId))}'),\${Number(o.lineIndex)})">Already Added</button>\`;
    }else if(o.coveredBySoftCreationSoNo){
      actionCell=\`<div style="display:flex;align-items:center;gap:4px;justify-content:center"><span class="tag amber sm" style="font-size:10px;padding:2px 6px">Already Added in \${pcEsc(o.coveredBySoftCreationSoNo)}</span><button type="button" class="btn ghost sm" style="padding:1px 5px;font-size:10px" onclick="pcRevertAlreadyAdded(decodeURIComponent('\${encodeURIComponent(String(o.sourceSoId))}'),\${Number(o.lineIndex)})" title="Restore demand to planner">Undo</button></div>\`;
    }else{
      actionCell=\`<span style="color:#94a3b8;font-size:11px">—</span>\`;
    }

    return \`<tr class="pc-so-row-nov11 pc-so-row-\${rowState} \${isSC?'pc-so-softcreation':''} \${isChecked?'pc-so-selected':''}">
      <td style="text-align:center">\${checkCell}</td>
      <td>
        <b>\${pcEsc(o.sourceSoNo)}</b>
        <small>\${pcEsc(o.customer)} \${isSC?'<span class="pc-softcreation-label">Softcreation order</span>':''}</small>
        \${o.coveredBySoftCreationSoNo?\`<div class="small" style="color:#b45309;font-weight:600;margin-top:2px">Covered in SoftCreation order: <b>\${pcEsc(o.coveredBySoftCreationSoNo)}</b></div>\`:''}
      </td>
      <td>\${pcEsc(o.requiredDate||'-')}</td>
      <td class="num">\${pcMoney(o.ordered)}</td>
      <td class="num">\${pcMoney(o.dispatched)}</td>
      <td class="num">\${pcMoney(o.grossOpen)}</td>
      <td class="num">\${pcMoney(o.allocated)}</td>
      <td class="num"><b>\${pcMoney(o.available)}</b></td>
      <td style="text-align:center">\${actionCell}</td>
    </tr>\`;
  }).join('')||'<tr><td colspan="9">No outstanding SO demand. Stock replenishment can still be planned.</td></tr>'}</tbody></table></div>\`;
}
function pcIntelligenceHTML(g){
 const soOpen=g.orders.reduce((n,o)=>n+o.grossOpen,0);
 const allocated=g.orders.reduce((n,o)=>n+o.allocated,0);
 const selectedDemand=pcSelectedDemand(g),selectedRecommended=pcSelectedRecommended(g),scAvailable=g.orders.filter(pcIsSoftcreationOrder).reduce((n,o)=>n+pcNum(o.available),0);
 const defaultExtra=Math.max(0,selectedRecommended-selectedDemand);
 const extraVal=pcSavedExtraQty!==null?pcSavedExtraQty:defaultExtra;
 const reasonVal=pcSavedOverrideReason!==null?pcSavedOverrideReason:'';
 pcSavedExtraQty=null;
 pcSavedOverrideReason=null;
 const numExtra=Math.max(0,Number(extraVal)||0);
 const totalQty=selectedDemand+numExtra;

 return \`<div class="pc-card pc-simple-v1142"><h3>Production quantity planner</h3>
 <p class="pc-muted">See the current Sales Order requirement, then add extra production only if needed.</p>
 \${g.pipeline>0||allocated>0?\`<div class="pc-live-production-alert-v20261030" role="alert"><strong>⚠ PRODUCTION ALREADY ASSIGNED / IN PROGRESS</strong><span>\${pcMoney(g.pipeline)} rolls in existing production pipeline · \${pcMoney(allocated)} rolls assigned to Sales Orders. Check outstanding demand before requesting more.</span></div>\`:''}
 <div class="pc-simple-stats-v1142">
 <div class="pc-kpi-softcreation pc-sc-item-card"><small>SoftCreation (Pvt) Ltd · Outstanding</small><strong>\${pcMoney(scAvailable)} rolls</strong><span>Included in the overall demand (not additional demand)</span></div>
 <div class="pc-kpi-open-nov11"><small>Current open Sales Orders</small><strong>\${pcMoney(soOpen)} rolls</strong><span>Matches the Open column in Build a production request</span></div>
 <div class="pc-kpi-assigned-nov11"><small>Already assigned to production</small><strong>\${pcMoney(allocated)} rolls</strong><span>Matches the Already PR column</span></div>
 <div class="pc-kpi-to-plan-nov11"><small>Sales Orders still to produce</small><strong>\${pcMoney(g.demand)} rolls</strong><span>Matches the To Plan column</span></div>
 <div class="pc-kpi-pipeline-nov11"><small>Existing production pipeline</small><strong>\${pcMoney(g.pipeline)} rolls</strong><span>Includes production outside these SO allocations</span></div>
 </div>
 <div class="pc-simple-note-v1142"><b>Selected order lines:</b> \${pcEsc(pcSelectionSummary(g))}<br>Suggested production for this selection: <b>\${pcMoney(selectedRecommended)} rolls</b> (includes stock cover / safety stock / HO stock settings).</div>
 \${g.orders.length?\`<details class="pc-order-details-v1142"><summary>View \${g.orders.length} current Sales Order line(s)</summary><div>\${g.orders.map(o=>\`<div><b>\${pcEsc(o.sourceSoNo)}</b> • \${pcEsc(o.customer)} <span>Open \${pcMoney(o.grossOpen)} • Already assigned \${pcMoney(o.allocated)} • To plan \${pcMoney(o.available)}</span></div>\`).join('')}</div></details>\`:''}
 <div class="pc-simple-entry-v1142">
 <div class="field"><label>Sales Order quantity to include (rolls)</label><input id="pcSalesQty" type="number" readonly value="\${selectedDemand}"></div>
 <div class="field"><label>Additional production required (rolls)</label><input id="pcExtraQty" type="number" min="0" step="1" value="\${extraVal}" oninput="pcUpdateSimpleQtyV1142()"></div>
 </div>
 <div class="field"><label>Total requested production (rolls)</label><input id="pcQty" type="number" readonly value="\${totalQty}"></div>
 <div class="field" id="pcOverrideWrapV20261109" style="\${numExtra>0?'':'display:none'}"><label>Reason for additional production *</label><textarea id="pcOverride" placeholder="Required only when additional production quantity is greater than zero">\${pcEsc(reasonVal)}</textarea></div>
 
 <div class="actions"><button class="btn primary" onclick="pcAddToBasket()" \${!pcHas('production_control_create')?'disabled':''}>Add item to request</button></div></div>\`
}
`.replace(/\n/g, eol);

if (!plannerGroupsRegex.test(code)) {
  console.error('plannerGroupsRegex did not match!');
  process.exit(1);
}
code = code.replace(plannerGroupsRegex, plannerGroupsReplacement);
console.log('5. pcPlannerGroupHTML & pcIntelligenceHTML replaced successfully.');

// 6. pcAddToBasket replacement
const addToBasketRegex = /window\.pcAddToBasket=function\(\)\{[\s\S]*?(?=window\.pcSavePolicy=)/;

const addToBasketReplacement = `window.pcAddToBasket=function(){
  const g=pcGroup(pcPlannerItemKey);if(!g)return;
  const qty=pcNum(document.getElementById('pcQty')?.value),reason=String(document.getElementById('pcOverride')?.value||'').trim();
  const extra=pcNum(document.getElementById('pcExtraQty')?.value);
  if(!Number.isInteger(extra)||extra<0)return toast('Additional production must be zero or a positive whole number.');
  if(!Number.isInteger(qty)||qty<=0)return toast('Enter a positive whole quantity.');

  const chosen=pcSelectedOrders(g),chosenDemand=pcSelectedDemand(g);
  if(!chosen.length&&extra<=0)return toast('Select at least one Sales Order with the tick box, or enter additional production quantity.');
  if(qty<chosenDemand)return toast('Quantity must cover selected SO demand ('+pcMoney(chosenDemand)+' rolls).');
  if(qty!==chosenDemand+extra)return toast('Requested quantity must equal selected SO demand plus additional production.');
  if(extra>0&&!reason)return toast('Enter a reason for additional production quantity.');
  if(pcBasket.some(x=>x.itemKey===g.key))return toast('This item is already in the basket.');

  pcBasket.push({
    additionalQty:extra,
    itemKey:g.key,
    sourceItemId:g.sourceItemId,
    label:pcLineLabel(g),
    desc:g.desc,
    size:g.size,
    material:g.material,
    layout:g.layout,
    pcs:g.pcs,
    unit:g.unit,
    requestedQty:qty,
    soDemand:chosenDemand,
    cover:g.cover,
    safety:g.safety,
    stock:g.stock,
    pipeline:g.pipeline,
    recommended:pcSelectedRecommended(g),
    overrideReason:reason,
    coverWeeks:g.coverWeeks,
    allocations:chosen.map(o=>({
      source_so_id:o.sourceSoId,
      source_so_no:o.sourceSoNo,
      source_so_line_index:o.lineIndex,
      customer_name:o.customer,
      required_date:o.requiredDate,
      qty:o.available
    }))
  });
  pcRender();
  toast('Item added to request');
};
`.replace(/\n/g, eol);

if (!addToBasketRegex.test(code)) {
  console.error('addToBasketRegex did not match!');
  process.exit(1);
}
code = code.replace(addToBasketRegex, addToBasketReplacement);
console.log('6. pcAddToBasket replaced successfully.');

// 7. pcSubmitRequest cleanups (clear pcSelectedOrderKeys)
const submitRegex = /pcBasket=\[\];pcSelectedScOrderKey='';pcScInnerSelections\.clear\(\);pcView='register';/;
const submitRegex2 = /pcBasket=\[\];pcView='register';/;

const submitReplacement = `pcBasket=[];pcSelectedOrderKeys.clear();pcCurrentGroupKey='';pcView='register';`;

if (submitRegex.test(code)) {
  code = code.replace(submitRegex, submitReplacement);
  console.log('7. pcSubmitRequest cleaned up successfully (from sc clear).');
} else if (submitRegex2.test(code)) {
  code = code.replace(submitRegex2, submitReplacement);
  console.log('7. pcSubmitRequest cleaned up successfully (from normal).');
}

const outPath = 'C:/Users/Administrator/.gemini/antigravity/brain/1f27eaed-6d8c-4704-b5e3-c7f3e0d6da53/scratch/new_planner.js';
fs.writeFileSync(outPath, code, 'utf8');
console.log('ALL UPDATES WRITTEN TO ' + outPath);
