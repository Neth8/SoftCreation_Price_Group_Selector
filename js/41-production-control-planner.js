
/* V1.1.00 — Production Control. Existing Factory tab is intentionally untouched. */
(function(){
'use strict';
const PC_REST='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1',PC_WORKSPACE='softcreation_main',PC_KEY_STORE='spgs_supabase_browser_key_v1';
let pcSearchTermNov3='';
let pcSelectedScOrderKey='';
let pcScInnerSelections=new Map();
let pcModalScOrder=null;
let pcModalCandidateOrders=[];
let pcModalTempCheckedKeys=new Set();
let pcView='planner',pcCloud={requests:[],lines:[],allocations:[],messages:[],audit:[],policies:[],releases:[]},pcBasket=[],pcSelectedRequest='',pcReturnTarget='',pcPlannerItemKey='';
function pcKey(){const k=(localStorage.getItem(PC_KEY_STORE)||'').trim();if(!k)throw new Error('SoftCreation cloud key is not configured on this device.');return k}
function pcHeaders(extra={}){const k=pcKey(),h={apikey:k,...extra};if(k.startsWith('eyJ'))h.Authorization='Bearer '+k;return h}
async function pcFetch(path,options={}){const r=await fetch(PC_REST+path,{...options,headers:pcHeaders(options.headers||{})});if(!r.ok){const b=await r.text().catch(()=>r.statusText);throw new Error(`Production Control DB ${r.status}: ${b.slice(0,500)}`)}if(r.status===204)return null;const t=await r.text();return t?JSON.parse(t):null}
async function pcRpc(name,args){return await pcFetch('/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args||{})})}
function pcHas(p){
  const role=String(currentUser?.role||'').toLowerCase();
  if(role==='admin')return true;
  // Permissions must be granted by Admin; a role alone grants nothing.
  if(typeof hasPerm!=='function'||!hasPerm(p))return false;
  // Keep role separation even if a legacy account has an old approval flag.
  if(role==='sales' && ['production_control_approve','production_control_policy'].includes(p))return false;
  if(role==='manager' && p==='production_control_create')return false;
  return true;
}
function pcEsc(v){return typeof esc==='function'?esc(v):String(v??'')}
function pcNum(v){return Number(v||0)}
function pcMoney(v){return pcNum(v).toLocaleString(undefined,{maximumFractionDigits:2})}
function pcNorm(v){return String(v??'').trim().toUpperCase().replace(/\s+/g,' ')}
// A factory product is identified by its manufacturing specification, not by
// which Sales Order / manually created Item Master ID introduced the demand.
// Keep a stable existing Item Master ID where available: legacy policies,
// downstream source_item_id and historical IDs must not be rewritten.
function pcSpecKey(l){
 const size=String(l?.size||l?.size_label||'').toUpperCase().replace(/\s*MM\s*/g,'').replace(/[×✕]/g,'X').replace(/\s*X\s*/g,'X').replace(/\s+/g,'');
 const material=pcNorm(l?.material).replace(/^DT TOP$/,'ELP HYBRID');
 const layout=pcNorm(l?.layout).replace(/\s+/g,'');
 const pcs=pcNum(l?.pcs??l?.pcs_per_roll);
 const unit=pcNorm(l?.unit||'Rolls');
 const desc=pcNorm(l?.desc||l?.description||'ELP');
 return ['SPEC',desc,size,material,layout,pcs,unit].join('|');
}
function pcCanonicalMaster(l){
 const key=pcSpecKey(l);
 const matches=(state.items||[]).filter(i=>pcSpecKey(i)===key);
 if(!matches.length)return null;
 // Stable primary identity for identical physical specifications.
 return matches.sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')))[0];
}
function pcLineKey(l){
 const primary=pcCanonicalMaster(l);
 if(primary?.id)return 'ID:'+String(primary.id);
 return pcSpecKey(l);
}
function pcPolicy(k){
 const direct=pcCloud.policies.find(x=>x.item_key===k);
 if(direct)return direct;
 // Preserve policies saved under another legacy Item Master ID.
 const matching=(state.items||[]).find(i=>pcLineKey(i)===k);
 if(matching){
   const aliases=(state.items||[]).filter(i=>pcSpecKey(i)===pcSpecKey(matching)).map(i=>'ID:'+i.id);
   const legacy=pcCloud.policies.find(x=>aliases.includes(x.item_key)||x.item_key===pcSpecKey(matching));
   if(legacy)return legacy;
 }
 return {safety_stock_qty:0,available_stock_qty:0,cover_weeks:2};
}
function pcLineLabel(l){return [l?.desc,l?.size,l?.material,l?.layout,l?.pcs?`${l.pcs} pcs/roll`:null].filter(Boolean).join(' • ')}

const pcOpenReqStatuses=()=>new Set(['Pending Approval','Approved']),pcOpenProdStatuses=()=>new Set(['Requested','Approved','Planned','In Production','QC Check']);
function pcFulfilmentForSO(so){return (state.dealerFulfilments||[]).find(p=>p.sourceSOId===so.id||p.id===so.fulfilmentPlanId)||null}
let pcOrdexaSent=new Map(),pcOrdexaReady=false,pcOrdexaConflicts=[];
async function pcLoadOrdexaSent(){
 pcOrdexaReady=false;
 const rows=await pcRpc('spgs_pc_ordexa_dispatch_totals',{});
 if(!Array.isArray(rows))throw new Error('Unexpected Ordexa dispatch totals response');
 const next=new Map();
 for(const r of rows){next.set(String(r.source_so_id)+'|'+String(r.source_line_index),pcNum(r.sent_qty));}
 pcOrdexaSent=next;pcOrdexaReady=true;pcOrdexaConflicts=[];
 for(const so of (state.salesOrders||[]))for(let i=0;i<(so.lines||[]).length;i++){
   const existing=pcLegacyDispatchedForSOLine(so,i),cloud=pcOrdexaSent.get(String(so.id)+'|'+i)||0;
   if(existing>0&&cloud>0)pcOrdexaConflicts.push((so.soNo||so.id)+' line '+i);
 }
 if(pcOrdexaConflicts.length)console.error('SPGS duplicate dispatch source requires reconciliation',pcOrdexaConflicts);
}
function pcLegacyDispatchedForSOLine(so,i){const p=pcFulfilmentForSO(so);if(!p)return 0;const statuses=new Set(['Handed to Courier','In Transit','Delivered']);return (p.consignments||[]).filter(c=>statuses.has(String(c.status||''))).reduce((n,c)=>n+pcNum((c.allocations||[]).find(a=>Number(a.lineIndex)===Number(i))?.qty),0)}
function pcDispatchedForSOLine(so,i){
 const old=pcLegacyDispatchedForSOLine(so,i),now=pcOrdexaSent.get(String(so.id)+'|'+i)||0;
 // Overlapping sources are an unresolved reconciliation conflict; do not sum.
 return Math.max(old,now);
}

// Read-only per-line dispatch snapshot for the existing Open Plan modal.
// Uses the same freshly verified quantities as Production Control.
window.spgsGetSalesOrderPlanProgressV4=async function(sourceSoId){
 await pcLoadOrdexaSent();
 const so=(state.salesOrders||[]).find(x=>String(x.id)===String(sourceSoId));
 if(!so)throw new Error('Linked Sales Order not found in current workspace');
 return {sourceSoId:String(so.id),salesOrderNo:String(so.soNo||''),lines:(so.lines||[]).map((l,i)=>{
   const ordered=Math.max(0,Number(l.qty||0));
   const sent=Math.max(0,Math.min(ordered,Number(pcDispatchedForSOLine(so,i))||0));
   return {index:i,ordered,sent,remaining:Math.max(0,ordered-sent)};
 })};
};

// Read-only status bridge for Sales Orders list; inside Production Control closure.
window.spgsGetSalesOrderStatusesV2=async function(){
 await pcLoadOrdexaSent();
 const statuses={};
 for(const so of (state.salesOrders||[])){
   let ordered=0,sent=0,invalid=false;
   for(let i=0;i<(so.lines||[]).length;i++){
     const l=so.lines[i];if(l.use===false)continue;
     const qty=Number(l.qty||0), shipped=Number(pcDispatchedForSOLine(so,i));
     if(!Number.isFinite(qty)||qty<0||!Number.isFinite(shipped)){invalid=true;break;}
     ordered+=qty;sent+=Math.min(qty,Math.max(0,shipped));
   }
   statuses[String(so.id)]=invalid||ordered<=0?'Unknown':sent>=ordered-0.00001?'Fully Sent':sent>0?'Partially Sent':'New';
 }
 return statuses;
};
// Extended read-only order progress: quantities come from exactly the same source
// as Production Control. This endpoint does NOT provide a dispatch event timestamp.
window.spgsGetSalesOrderProgressV3=async function(){
 await pcLoadOrdexaSent();
 const statuses={};
 for(const so of (state.salesOrders||[])){
   let ordered=0,sent=0,invalid=false;
   for(let i=0;i<(so.lines||[]).length;i++){
     const l=so.lines[i];if(l.use===false)continue;
     const qty=Number(l.qty||0), shipped=Number(pcDispatchedForSOLine(so,i));
     if(!Number.isFinite(qty)||qty<0||!Number.isFinite(shipped)){invalid=true;break;}
     ordered+=qty;sent+=Math.min(qty,Math.max(0,shipped));
   }
   const status=invalid||ordered<=0?'Unknown':sent>=ordered-0.00001?'Fully Sent':sent>0?'Partially Sent':'New';
   statuses[String(so.id)]={status,ordered,sent,remaining:Math.max(0,ordered-sent),lastDispatchAt:null};
 }
 return statuses;
};

async function pcCheckDispatchSafe(){
 await pcLoadOrdexaSent();
 if(pcOrdexaConflicts.length)throw new Error('Dispatch records overlap in old fulfilments and Ordexa: '+pcOrdexaConflicts.slice(0,4).join(', ')+'. Reconcile before releasing production.');
}

function pcDeliveredMovementWeeks(k){const now=Date.now(),w=7*86400000,b=[0,0,0,0];(state.dealerFulfilments||[]).forEach(p=>(p.consignments||[]).forEach(c=>{if(c.status!=='Delivered')return;const t=Date.parse(c.deliveredDate||c.updatedAt||0);if(!t)return;const bi=Math.floor((now-t)/w);if(bi<0||bi>3)return;(c.allocations||[]).forEach(a=>{const l=p.lines?.[Number(a.lineIndex)];if(l&&pcLineKey(l)===k)b[3-bi]+=pcNum(a.qty)})}));return b}
function pcAllocatedToOpenRequests(soid,i){const ids=new Set(pcCloud.lines.filter(l=>{const r=pcCloud.requests.find(x=>x.id===l.request_id);return r&&pcOpenReqStatuses().has(r.status)}).map(l=>l.id));return pcCloud.allocations.filter(a=>ids.has(a.request_line_id)&&a.source_so_id===soid&&Number(a.source_so_line_index)===Number(i)).reduce((n,a)=>n+pcNum(a.allocated_qty),0)}
function pcPipelineForItem(k){return (state.productionRequests||[]).filter(r=>pcOpenProdStatuses().has(String(r.status||''))&&pcLineKey(r)===k).reduce((n,r)=>n+pcNum(r.requestQty),0)}
function pcDemandGroups(){
  const m=new Map();
  (state.salesOrders||[]).forEach(so=>(so.lines||[]).forEach((l,i)=>{if(l.use===false)return;const k=pcLineKey(l);let g=m.get(k);if(!g){g={key:k,sourceItemId:pcCanonicalMaster(l)?.id||l.itemId||'',desc:l.desc||'Item',size:l.size||'',material:l.material||'',layout:l.layout||'',pcs:pcNum(l.pcs),unit:l.unit||'Rolls',orders:[]};m.set(k,g)}
    const ordered=pcNum(l.qty),dispatched=Math.min(ordered,pcDispatchedForSOLine(so,i)),cancelled=pcNum(l.cancelledQty),grossOpen=Math.max(0,ordered-dispatched-cancelled),allocated=Math.min(grossOpen,pcAllocatedToOpenRequests(so.id,i)),available=Math.max(0,grossOpen-allocated);
    if(grossOpen>0)g.orders.push({sourceSoId:so.id,sourceSoNo:so.soNo||so.id,lineIndex:i,customer:so.customerName||'',requiredDate:so.needDate||'',ordered,dispatched,cancelled,grossOpen,allocated,available});
  }));
  return [...m.values()].map(g=>{const p=pcPolicy(g.key),movement=pcDeliveredMovementWeeks(g.key),avg=movement.reduce((a,b)=>a+b,0)/4,coverWeeks=Math.max(.25,pcNum(p.cover_weeks)||2),demand=g.orders.reduce((n,o)=>n+o.available,0),cover=Math.ceil(avg*coverWeeks),safety=Math.max(0,pcNum(p.safety_stock_qty)),stock=Math.max(0,pcNum(p.available_stock_qty)),pipeline=Math.max(0,pcPipelineForItem(g.key)),recommended=Math.max(0,Math.ceil(demand+cover+safety-stock-pipeline));return {...g,movement,avg,coverWeeks,demand,cover,safety,stock,pipeline,recommended}}).filter(g=>g.orders.length>0).sort((a,b)=>b.recommended-a.recommended||a.size.localeCompare(b.size,undefined,{numeric:true}))
}
// Customer matching is exact after case and whitespace normalization; never use a substring.
function pcIsSoftcreationOrder(o){return pcNorm(o?.customer).replace(/\s*\(\s*/g,' (').replace(/\s*\)\s*/g,')').replace(/\s+/g,' ').trim()==='SOFTCREATION (PVT) LTD'}
function pcOrderSelectionKey(o){return String(o.sourceSoId)+'|'+Number(o.lineIndex)}

function pcSelectedOrders(g){
  if(!g)return [];
  const scOrders=(g.orders||[]).filter(pcIsSoftcreationOrder);
  const activeSc=scOrders.find(o=>pcOrderSelectionKey(o)===pcSelectedScOrderKey);
  if(!activeSc)return [];
  const innerKeys=pcScInnerSelections.get(pcOrderSelectionKey(activeSc))||new Set();
  const innerOrders=(g.orders||[]).filter(o=>!pcIsSoftcreationOrder(o)&&innerKeys.has(pcOrderSelectionKey(o))&&o.available>0);
  return [activeSc,...innerOrders];
}

function pcSelectedDemand(g){
  const orders=pcSelectedOrders(g);
  if(!orders.length)return 0;
  const scOrder=orders[0];
  const innerOrders=orders.slice(1);
  const scQty=pcNum(scOrder?.available);
  const innerQty=innerOrders.reduce((n,o)=>n+pcNum(o.available),0);
  return Math.max(scQty,innerQty);
}

function pcSelectedRecommended(g){
  return Math.max(0,Math.ceil(pcSelectedDemand(g)+g.cover+g.safety-g.stock-g.pipeline));
}

function pcSelectionSummary(g){
  const orders=pcSelectedOrders(g);
  if(!orders.length)return 'No SoftCreation order selected · 0 rolls';
  const scOrder=orders[0];
  const innerOrders=orders.slice(1);
  return `${scOrder.sourceSoNo} (SoftCreation) · ${innerOrders.length} customer order(s) inside · ${pcMoney(pcSelectedDemand(g))} rolls`;
}

window.pcToggleScOrder=function(soId,lineIndex,checked){
  const g=pcGroup(pcPlannerItemKey);
  if(!g)return;
  const key=String(soId)+'|'+Number(lineIndex);
  if(checked){
    pcSelectedScOrderKey=key;
    pcOpenScOrdersModal(soId,lineIndex);
  }else{
    if(pcSelectedScOrderKey===key){
      pcSelectedScOrderKey='';
      pcScInnerSelections.delete(key);
    }
    pcRender();
  }
};

window.pcOpenScOrdersModal=function(soId,lineIndex){
  const g=pcGroup(pcPlannerItemKey);
  if(!g)return;
  const key=String(soId)+'|'+Number(lineIndex);
  const scOrder=(g.orders||[]).find(o=>pcOrderSelectionKey(o)===key);
  if(!scOrder)return;
  pcModalScOrder=scOrder;
  pcSelectedScOrderKey=key;
  pcEnsureScOrdersModal();

  pcModalCandidateOrders=(g.orders||[]).filter(o=>!pcIsSoftcreationOrder(o)&&o.available>0);
  const existing=pcScInnerSelections.get(key);
  if(existing){
    pcModalTempCheckedKeys=new Set(existing);
  }else{
    pcModalTempCheckedKeys=new Set(pcModalCandidateOrders.map(pcOrderSelectionKey));
  }

  const titleEl=document.getElementById('pcScModalTitle');
  if(titleEl)titleEl.textContent=`Select Orders Inside SoftCreation SO (${scOrder.sourceSoNo})`;
  const subEl=document.getElementById('pcScModalSubtitle');
  if(subEl)subEl.textContent=`${pcLineLabel(g)} · SoftCreation Order Qty: ${pcMoney(scOrder.available)} rolls`;

  pcRenderModalOrdersList();
  const modal=document.getElementById('pcScOrdersModal');
  if(modal)modal.classList.add('show');
};

function pcEnsureScOrdersModal(){
  if(document.getElementById('pcScOrdersModal'))return;
  document.body.insertAdjacentHTML('beforeend',`
    <div id="pcScOrdersModal" class="modal" role="dialog" aria-modal="true">
      <div class="modal-card" style="max-width:760px;width:95vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">
        <div class="modal-head" style="padding:14px 20px;border-bottom:1px solid #e2e8f0;background:#f8fafc;display:flex;justify-content:space-between;align-items:center">
          <div>
            <b id="pcScModalTitle" style="font-size:16px;color:#0f172a">Orders Inside SoftCreation Order</b>
            <div id="pcScModalSubtitle" class="small" style="color:#64748b"></div>
          </div>
          <button class="closex" type="button" onclick="pcCloseScOrdersModal()">×</button>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:16px 20px">
          <div class="notice" style="margin-bottom:14px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534">
            <b>SoftCreation Order Packaging:</b> Select the customer Sales Orders in this size that are being produced / fulfilled inside this SoftCreation production order.
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
            <span id="pcScModalSelectionCount" style="font-weight:700;font-size:13px;color:#334155"></span>
            <div style="display:flex;gap:6px">
              <button type="button" class="btn ghost sm" onclick="pcModalSelectAll(true)">Select all</button>
              <button type="button" class="btn ghost sm" onclick="pcModalSelectAll(false)">Clear selection</button>
            </div>
          </div>
          <div id="pcScModalOrdersList" class="pc-scroll" style="max-height:300px;border:1px solid #e2e8f0;border-radius:8px"></div>
          <div id="pcScModalFooterInfo" style="margin-top:14px;padding:12px 16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:13px"></div>
          <div class="actions" style="margin-top:16px;display:flex;justify-content:flex-end;gap:10px">
            <button type="button" class="btn ghost" onclick="pcCloseScOrdersModal()">Cancel</button>
            <button type="button" class="btn primary" onclick="pcConfirmScOrdersModal()">OK / Confirm Selection</button>
          </div>
        </div>
      </div>
    </div>
  `);
}

function pcRenderModalOrdersList(){
  const host=document.getElementById('pcScModalOrdersList');
  if(!host)return;
  if(!pcModalCandidateOrders.length){
    host.innerHTML='<div class="empty" style="padding:24px">No other open customer Sales Orders found for this size. SoftCreation order will be requested directly.</div>';
    const countEl=document.getElementById('pcScModalSelectionCount');
    if(countEl)countEl.textContent='0 customer orders';
    const footEl=document.getElementById('pcScModalFooterInfo');
    if(footEl)footEl.innerHTML=`SoftCreation planned target: <b>${pcMoney(pcModalScOrder?.available)} rolls</b>`;
    return;
  }

  const selected=pcModalCandidateOrders.filter(o=>pcModalTempCheckedKeys.has(pcOrderSelectionKey(o)));
  const sum=selected.reduce((s,o)=>s+pcNum(o.available),0);
  const scTarget=pcNum(pcModalScOrder?.available);

  const countEl=document.getElementById('pcScModalSelectionCount');
  if(countEl)countEl.textContent=`${selected.length} of ${pcModalCandidateOrders.length} customer order(s) selected`;

  const footEl=document.getElementById('pcScModalFooterInfo');
  if(footEl)footEl.innerHTML=`
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <span>Customer Orders Demand: <b style="color:#0369a1">${pcMoney(sum)} rolls</b></span>
      <span>SoftCreation Order Qty: <b style="color:#c2410c">${pcMoney(scTarget)} rolls</b></span>
      <span>${scTarget>=sum?`Surplus / Extra: <b style="color:#15803d">+${pcMoney(scTarget-sum)} rolls</b>`:`Shortfall: <b style="color:#b91c1c">${pcMoney(sum-scTarget)} rolls more needed</b>`}</span>
    </div>
  `;

  host.innerHTML=`<table class="pc-table">
    <thead>
      <tr>
        <th style="width:44px;text-align:center">Select</th>
        <th>SO / Customer</th>
        <th>Need Date</th>
        <th class="num">Ordered</th>
        <th class="num">Open</th>
        <th class="num">To Plan</th>
      </tr>
    </thead>
    <tbody>
      ${pcModalCandidateOrders.map(o=>{
        const k=pcOrderSelectionKey(o);
        const checked=pcModalTempCheckedKeys.has(k);
        return `<tr style="${checked?'background:#f0f9ff;':''}">
          <td style="text-align:center">
            <input type="checkbox" ${checked?'checked':''} onchange="pcModalItemToggle('${k}',this.checked)">
          </td>
          <td><b>${pcEsc(o.sourceSoNo)}</b><small>${pcEsc(o.customer)}</small></td>
          <td>${pcEsc(o.requiredDate||'-')}</td>
          <td class="num">${pcMoney(o.ordered)}</td>
          <td class="num">${pcMoney(o.grossOpen)}</td>
          <td class="num"><b>${pcMoney(o.available)}</b></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

window.pcModalItemToggle=function(key,checked){
  if(checked)pcModalTempCheckedKeys.add(key);else pcModalTempCheckedKeys.delete(key);
  pcRenderModalOrdersList();
};

window.pcModalSelectAll=function(checked){
  if(checked){
    pcModalCandidateOrders.forEach(o=>pcModalTempCheckedKeys.add(pcOrderSelectionKey(o)));
  }else{
    pcModalTempCheckedKeys.clear();
  }
  pcRenderModalOrdersList();
};

window.pcConfirmScOrdersModal=function(){
  if(!pcModalScOrder)return;
  const scKey=pcOrderSelectionKey(pcModalScOrder);
  pcSelectedScOrderKey=scKey;
  pcScInnerSelections.set(scKey,new Set(pcModalTempCheckedKeys));
  pcCloseScOrdersModal();
  pcRender();
  toast(`Linked ${pcModalTempCheckedKeys.size} customer order(s) inside SoftCreation order`);
};

window.pcCloseScOrdersModal=function(){
  const modal=document.getElementById('pcScOrdersModal');
  if(modal)modal.classList.remove('show');
};

function pcEnsureCancelDemandModal(){
  if(document.getElementById('pcCancelDemandModal'))return;
  document.body.insertAdjacentHTML('beforeend',`
    <div id="pcCancelDemandModal" class="modal">
      <div class="modal-card" style="max-width:560px">
        <div class="modal-head">
          <b>Cancel Production Demand Line</b>
          <button class="closex" type="button" onclick="pcCloseCancelDemandModal()">×</button>
        </div>
        <div class="modal-body" style="padding:16px 20px">
          <input type="hidden" id="pcCancelSoId">
          <input type="hidden" id="pcCancelLineIndex">
          <div id="pcCancelDemandMeta" class="notice" style="background:#fff1f2;border:1px solid #fecdd3;color:#9f1239"></div>
          <div class="field" style="margin-top:12px">
            <label><b>Reason for Cancellation * (Mandatory)</b></label>
            <textarea id="pcCancelDemandReason" placeholder="Enter non-empty reason why this demand line is cancelled..." style="width:100%;height:80px;box-sizing:border-box" required></textarea>
            <div class="hint" style="color:#64748b;font-size:11px;margin-top:4px">Empty or whitespace-only cancellation reasons are strictly prohibited.</div>
          </div>
          <div class="actions" style="margin-top:16px;display:flex;justify-content:flex-end;gap:10px">
            <button type="button" class="btn ghost" onclick="pcCloseCancelDemandModal()">Keep Demand</button>
            <button type="button" class="btn red" onclick="pcConfirmCancelDemand()">Confirm Cancellation</button>
          </div>
        </div>
      </div>
    </div>
  `);
}

window.pcOpenCancelDemandModal=function(soId,lineIndex){
  pcEnsureCancelDemandModal();
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

  if(available<=0)return toast('No open demand remains to cancel on this line.');

  document.getElementById('pcCancelSoId').value=soId;
  document.getElementById('pcCancelLineIndex').value=lineIndex;
  document.getElementById('pcCancelDemandReason').value='';
  document.getElementById('pcCancelDemandMeta').innerHTML=`
    <b>Sales Order: ${pcEsc(so.soNo||so.id)}</b> • Customer: <b>${pcEsc(so.customerName||'')}</b><br>
    Item: <b>${pcEsc(l.desc||'Item')} ${pcEsc(l.size||'')} ${pcEsc(l.material||'')}</b><br>
    Ordered: <b>${pcMoney(ordered)}</b> • Open Demand to Cancel: <b>${pcMoney(available)} ${pcEsc(l.unit||'Rolls')}</b>
  `;
  document.getElementById('pcCancelDemandModal')?.classList.add('show');
};

window.pcCloseCancelDemandModal=function(){
  document.getElementById('pcCancelDemandModal')?.classList.remove('show');
};

window.pcConfirmCancelDemand=function(){
  const soId=document.getElementById('pcCancelSoId')?.value;
  const lineIndex=Number(document.getElementById('pcCancelLineIndex')?.value);
  const reason=String(document.getElementById('pcCancelDemandReason')?.value||'').trim();

  if(!reason){
    return toast('Cancellation reason is mandatory. Cannot cancel demand without a valid explanation.');
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
    pcCloseCancelDemandModal();
    return toast('No open demand available to cancel on this line.');
  }

  const now=new Date().toISOString();
  const userName=currentUser?.display||currentUser?.username||'User';
  l.cancelledQty=cancelled+available;
  l.cancellationHistory=l.cancellationHistory||[];
  l.cancellationHistory.push({
    reason,
    cancelledQty:available,
    user:userName,
    username:currentUser?.username||'user',
    at:now
  });
  so.history=so.history||[];
  so.history.push({
    action:'Demand Cancelled',
    by:userName,
    at:now,
    note:`Line ${lineIndex+1} (${l.desc} ${l.size}): cancelled ${available} rolls demand. Reason: ${reason}`
  });

  saveState();
  pcCloseCancelDemandModal();
  pcRender();
  toast(`Cancelled demand for ${so.soNo}: ${available} rolls removed from planning.`);
};
function pcGroup(k){return pcDemandGroups().find(x=>x.key===k)||null}
async function pcLoadCloud(){const q='?select=*&order=created_at.desc';const [requests,lines,allocations,messages,audit,policies,releases]=await Promise.all([
pcFetch('/spgs_prod_control_requests?workspace=eq.'+encodeURIComponent(PC_WORKSPACE)+'&select=*&order=created_at.desc'),pcFetch('/spgs_prod_control_request_lines'+q),pcFetch('/spgs_prod_control_so_allocations'+q),pcFetch('/spgs_prod_control_messages'+q),pcFetch('/spgs_prod_control_audit'+q),pcFetch('/spgs_prod_control_item_policy?workspace=eq.'+encodeURIComponent(PC_WORKSPACE)+'&select=*'),pcFetch('/spgs_prod_control_releases?workspace=eq.'+encodeURIComponent(PC_WORKSPACE)+'&select=*&order=created_at.asc')]);pcCloud={requests:requests||[],lines:lines||[],allocations:allocations||[],messages:messages||[],audit:audit||[],policies:policies||[],releases:releases||[]}}
/* A production-control order cycle is historical only when ALL its allocated
   sales-order lines are fully dispatched.  Archive is derived from dispatched
   quantities, not the product specification, so a fresh SO starts a new cycle. */
function pcRequestFullyDispatchedV1130(request){
  if(!request || ['Pending Approval','Returned'].includes(String(request.status)))return false;
  const lines=(pcCloud.lines||[]).filter(l=>String(l.request_id)===String(request.id));
  if(!lines.length)return false;
  const allocations=(pcCloud.allocations||[]).filter(a=>lines.some(l=>String(l.id)===String(a.request_line_id)));
  if(!allocations.length || !pcOrdexaReady)return false;
  // Compare with the verified dispatch snapshot even when the sales order
  // has not yet been hydrated into this browser's local state.
  return allocations.every(a=>{
    const index=Number(a.source_so_line_index);
    const so=(state.salesOrders||[]).find(x=>String(x.id)===String(a.source_so_id));
    const key=String(a.source_so_id)+'|'+index;
    // Archiving a Production Control request is based on the quantity actually
    // allocated to that request, NOT the full Sales Order line quantity. A
    // single Sales Order line may be covered by several production requests.
    const required=pcNum(a.allocated_qty);
    const cloudSent=pcOrdexaSent.has(key)?pcNum(pcOrdexaSent.get(key)):0;
    const legacySent=so?pcLegacyDispatchedForSOLine(so,index):0;
    const dispatched=Math.max(cloudSent,legacySent);
    if(required<=0 || (!pcOrdexaSent.has(key) && legacySent<=0))return false;
    return dispatched+0.00001>=required;
  });
}
function pcHistoryRequestIdsV1130(){
  return new Set((pcCloud.requests||[]).filter(pcRequestFullyDispatchedV1130).map(r=>String(r.id)));
}
function pcIsArchivedProductionJobV1130(job){
  if(!job)return false;
  if(['Dispatched','Received','GRN Closed'].includes(String(job.status||'')))return true;
  const id=job.productionControlRequestId;
  return !!id && pcHistoryRequestIdsV1130().has(String(id));
}
window.pcIsArchivedProductionJobV1130=pcIsArchivedProductionJobV1130;
function pcRequestLines(id){return pcCloud.lines.filter(x=>x.request_id===id).sort((a,b)=>a.line_no-b.line_no)}
function pcRequestAlloc(id){return pcCloud.allocations.filter(x=>x.request_line_id===id)}
function pcRequestMsgs(id){return pcCloud.messages.filter(x=>x.request_id===id).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))}
function pcRequestAudit(id){return pcCloud.audit.filter(x=>x.request_id===id).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))}
async function pcConsumeReleases(){for(const rel of (pcCloud.releases||[]).filter(x=>!x.consumed_at)){const p=rel.payload||{},exists=(state.productionRequests||[]).some(r=>r.productionControlReleaseId===rel.id||r.productionControlLineId===p.request_line_id);if(!exists){const now=new Date().toISOString(),prod={id:uid('prod'),orderNo:typeof prodNoV8==='function'?prodNoV8():('PC-'+String(p.request_no||'').replace(/\W+/g,'-')),piId:'',piSerial:'',quoteId:'',poRef:'',customerId:'',customerName:'Stock / Sales Order Demand',customerPhone:'',ownerUser:currentUser?.username||'',ownerDisplay:currentUser?.display||currentUser?.username||'',lineIndex:0,itemId:p.source_item_id||'',desc:p.description||'ELP',size:p.size_label||'',material:p.material||'',layout:p.layout||'',pcs:pcNum(p.pcs_per_roll),piQty:0,requestQty:pcNum(p.requested_qty),unit:p.unit||'Rolls',needDate:p.required_date||'',priority:'normal',shift:'day',instructions:`Production Control ${p.request_no||''} • ${p.material_mode||''}`,status:'Requested',createdBy:currentUser?.display||currentUser?.username||'System',createdByUser:currentUser?.username||'system',createdAt:now,productionControlRequestId:p.request_id||rel.request_id,productionControlRequestNo:p.request_no||'',productionControlLineId:p.request_line_id||rel.request_line_id,productionControlReleaseId:rel.id,history:[{status:'Requested',note:`Released from Production Control ${p.request_no||''}`,by:currentUser?.display||currentUser?.username||'System',username:currentUser?.username||'system',at:now}]};state.productionRequests=state.productionRequests||[];state.productionRequests.unshift(prod);saveState()}await pcRpc('spgs_pc_mark_release_consumed',{p_release_id:rel.id,p_username:currentUser?.username||''})}}
function pcEnsurePermissions(){if(typeof USER_FEATURES==='undefined')return;[['production_control_view','Production Control — View'],['production_control_create','Production Control — Create / Submit'],['production_control_approve','Production Control — Approve / Return'],['production_control_chat','Production Control — Communication'],['production_control_policy','Production Control — Stock / Safety Settings']].forEach(x=>{if(!USER_FEATURES.some(y=>y[0]===x[0]))USER_FEATURES.push(x)})}

function pcInstallUI(){
  if(document.getElementById('productioncontrol'))return;
  pcEnsurePermissions();
  if(typeof VIEW_PERMS!=='undefined')VIEW_PERMS.productioncontrol='production_control_view';
  const nav=document.querySelector('.nav'),before=nav?.querySelector('[data-view="production"]')||nav?.querySelector('[data-view="settings"]');
  if(nav){const b=document.createElement('button');b.className='navbtn';b.dataset.view='productioncontrol';b.textContent='Production Control';b.onclick=()=>showView('productioncontrol');b.style.display=pcHas('production_control_view')?'inline-block':'none';nav.insertBefore(b,before||null)}
  const section=document.createElement('section');section.id='productioncontrol';section.className='view';section.innerHTML=`
    <div class="panel pc-shell"><div class="panel-title pc-title"><div><span>Production Control</span><small>SC HO planning → Manager approval → existing Products execution</small></div><button class="btn sm pc-refresh" onclick="pcRefresh(true)">Refresh Live Data</button></div>
    <div class="panel-body"><div class="pc-tabs"><button data-pc-view="planner" onclick="pcGo('planner')">Production Request</button><button data-pc-view="approvals" onclick="pcGo('approvals')">Manager Approvals <span id="pcPendingCount"></span></button><button data-pc-view="register" onclick="pcGo('register')">Request Register</button><button data-pc-view="history" onclick="pcGo('history')">History <span id="pcHistoryCount"></span></button><button data-pc-view="demand" onclick="pcGo('demand')">Demand / Sales Orders</button></div><div id="pcKpis" class="pc-kpis"></div><div class="pc-search-nov3"><input type="search" id="pcSearchNov3" placeholder="Search current view: order, request, customer, material, item..." oninput="pcSearchChangedNov3(this.value)" aria-label="Search Production Control"></div><div id="pcBody"></div></div></div>`;
  const firstModal=document.querySelector('.modal');if(firstModal)firstModal.insertAdjacentElement('beforebegin',section);else document.querySelector('.app')?.appendChild(section);
  document.body.insertAdjacentHTML('beforeend',`<div id="pcReturnModal" class="modal"><div class="modal-card" style="max-width:520px"><div class="modal-head"><b>Return Production Request</b><button class="closex" onclick="closeModal('pcReturnModal')">×</button></div><div class="modal-body"><div class="field"><label>Return Reason</label><textarea id="pcReturnReason" placeholder="Explain what HO Stores must correct"></textarea></div><div class="actions"><button class="btn amber" onclick="pcConfirmReturn()">Return to HO Stores</button></div></div></div></div>`);
  try{pcEnsureScOrdersModal()}catch(_){}
}
window.pcSearchChangedNov3=function(value){
 pcSearchTermNov3=String(value||'').trim().toLowerCase();
 const body=document.getElementById('pcBody');if(!body)return;
 // Filter visible rows/cards without changing any underlying production quantities.
 const groups=body.querySelectorAll('tbody tr,.pc-approval-entry,.pc-demand-title,.pc-history-entry');
 groups.forEach(row=>{
   row.style.display=(!pcSearchTermNov3||row.textContent.toLowerCase().includes(pcSearchTermNov3))?'':'none';
 });
};
window.pcGo=function(v){pcView=v;pcRender()}
window.pcRefresh=async function(showToast=false){try{await pcLoadOrdexaSent();await pcLoadCloud();await pcConsumeReleases();await pcLoadCloud();pcRender();if(showToast)toast('Production Control live data refreshed')}catch(e){console.error(e);const b=document.getElementById('pcBody');if(b)b.innerHTML=`<div class="notice"><b>Production Control database is not ready.</b><br>${pcEsc(e.message)}<br><br>Run <b>01_PRODUCTION_CONTROL_DATABASE.sql</b> in Supabase, then refresh.</div>`;if(showToast)toast('Production Control refresh failed')}}

// Refresh Production Control every 12s while visible; read-only, no release consumption.
// Never overlap requests, interrupt editing, or replace the existing manual Refresh.
let pcAutoRefreshBusyV20261024=false;
async function pcAutoRefreshV20261024(){
 if(pcAutoRefreshBusyV20261024||document.hidden||!document.querySelector('#productioncontrol.active'))return;
 const active=document.activeElement;
 if(active&&document.querySelector('#productioncontrol')?.contains(active)&&/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))return;
 pcAutoRefreshBusyV20261024=true;
 try{
   await pcLoadOrdexaSent();
   await pcLoadCloud();
   if(!document.hidden&&document.querySelector('#productioncontrol.active'))pcRender();
 }catch(err){console.warn('Production Control automatic refresh failed',err);}
 finally{pcAutoRefreshBusyV20261024=false;}
}
setInterval(()=>{void pcAutoRefreshV20261024();},12000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void pcAutoRefreshV20261024();});
function pcRenderKpis(){
 const groups=pcDemandGroups(),open=groups.reduce((n,x)=>n+x.demand,0),scOpen=groups.reduce((n,g)=>n+g.orders.filter(pcIsSoftcreationOrder).reduce((x,o)=>x+pcNum(o.available),0),0),awaiting=pcCloud.requests.filter(r=>r.status==='Pending Approval').length,pipeline=(state.productionRequests||[]).filter(r=>pcOpenProdStatuses().has(String(r.status||''))).reduce((n,r)=>n+pcNum(r.requestQty),0),stock=pcCloud.policies.reduce((n,p)=>n+pcNum(p.available_stock_qty),0),el=document.getElementById('pcKpis');
 if(el)el.innerHTML=[['OPEN SALES DEMAND',open,'Rolls not allocated to an open PR',''],['SOFTCREATION (PVT) LTD',scOpen,'Outstanding rolls · included in open demand','pc-kpi-softcreation'],['AWAITING APPROVAL',awaiting,'Manager decisions required',''],['PRODUCTION PIPELINE',pipeline,'Current productionRequests',''],['HO AVAILABLE STOCK',stock,'Production Control stock','']].map(x=>`<div class="pc-kpi ${x[3]}"><small>${x[0]}</small><strong>${pcMoney(x[1])}</strong><span>${x[2]}</span></div>`).join('')
}
function pcRender(){
  const role=String(currentUser?.role||'').toLowerCase();
  const isManager=role==='manager';

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
    ? `<div class="pc-role-banner-v1119 manager"><b>Manager Approval Workspace</b><span>You can review, approve or return Sales production requests. Managers cannot create production requests.</span></div>`
    : role==='sales'
      ? `<div class="pc-role-banner-v1119 sales"><b>Sales Production Request Workspace</b><span>Create and submit requests. Approval is controlled by Manager.</span></div>`
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
function pcPlannerHTML(){
  const groups=pcDemandGroups();if(!pcPlannerItemKey&&groups.length)pcPlannerItemKey=groups[0].key;const g=pcGroup(pcPlannerItemKey)||groups[0];
  return `<div class="pc-grid"><div><div class="pc-card"><div class="pc-card-head"><div><h3>Build a production request</h3><p>Real Sales Orders are linked automatically by item.</p></div><span class="pc-pill">SC HO Stores</span></div><div class="field"><label>Item / SKU</label><select onchange="pcSelectItem(this.value)">${[...groups].sort((a,b)=>pcLineLabel(a).localeCompare(pcLineLabel(b),undefined,{numeric:true,sensitivity:'base'})).map((x,i)=>`<option value="${encodeURIComponent(x.key)}" ${g&&x.key===g.key?'selected':''}>${i+1}. ${pcEsc(pcLineLabel(x))}</option>`).join('')}</select></div>${g?pcPlannerGroupHTML(g):'<div class="empty">No outstanding Sales Order demand found.</div>'}</div>${g?`<div class="pc-card"><div class="pc-card-head"><h3>4-week fulfilled movement</h3><span class="pc-pill blue">${pcMoney(g.avg)} avg / week</span></div><div class="pc-bars">${g.movement.map(n=>`<div class="pc-bar" style="height:${Math.max(4,(n/Math.max(1,...g.movement))*90)}%"><span>${pcMoney(n)}</span></div>`).join('')}</div><div class="pc-week-labels"><span>W-4</span><span>W-3</span><span>W-2</span><span>Last week</span></div></div>`:''}</div>
  <div>${g?pcIntelligenceHTML(g):''}<div class="pc-card pc-request-submission-v1143"><div class="pc-card-head"><h3>Submit production request</h3></div><p class="pc-muted">Requests with additional production go to Manager Approval. Sales Order-only requests are eligible for automatic approval by the server.</p><div class="pc-submission-counter-v1143">Prepared items: <b>${pcBasket.length}</b> · Route: <b>${pcBasket.some(x=>pcNum(x.additionalQty)>0)?'Manager approval required':'Automatic approval eligible (server controlled)'}</b></div><div class="field"><label>Required at HO</label><input id="pcDue" type="date" value="${today()}"></div><div class="field"><label>Material arrangement</label><select id="pcMaterial"><option>Factory to arrange material</option><option>HO material issued</option><option>HO material pending issue</option></select></div><div class="field"><label>Request note</label><textarea id="pcRequestReason"></textarea></div><div class="actions"><button class="btn primary" onclick="pcSubmitRequest()" ${!pcHas('production_control_create')||!pcBasket.length?'disabled':''}>Submit Production Request →</button><button class="btn ghost sm" type="button" onclick="pcBasket=[];pcRender()" ${!pcBasket.length?'disabled':''}>Clear prepared items</button></div></div></div></div>`;
}
function pcPlannerGroupHTML(g){
  const scOrders=g.orders.filter(pcIsSoftcreationOrder);
  const hasScOrder=scOrders.length>0;
  const selectedSc=scOrders.find(o=>pcOrderSelectionKey(o)===pcSelectedScOrderKey);
  const innerKeys=selectedSc?(pcScInnerSelections.get(pcOrderSelectionKey(selectedSc))||new Set()):new Set();
  const innerOrders=g.orders.filter(o=>innerKeys.has(pcOrderSelectionKey(o)));

  return `<div class="pc-demand-title"><div><b>${pcEsc(pcLineLabel(g))}</b><small>${pcEsc(g.key)}</small></div><span class="pc-pill blue">${pcMoney(g.demand)} rolls open demand</span></div>
  ${!hasScOrder?`<div class="notice" style="margin:10px 0;background:#fff8ee;border:1px solid #f6cf9c;color:#87470d;"><b>Note:</b> Only SoftCreation orders can be sent from Production Control. No open Sales Order for <b>SoftCreation (Pvt) Ltd</b> was found for this item. Please have Sales create a SoftCreation SO first.</div>`:''}
  <div class="pc-scroll"><table class="pc-table"><thead><tr><th style="width:70px;text-align:center">Select</th><th>SO / Customer</th><th>Required</th><th class="num">Ordered</th><th class="num">Dispatched</th><th class="num">Open</th><th class="num">Already PR</th><th class="num">To Plan</th><th style="text-align:center">Action</th></tr></thead><tbody>${g.orders.map(o=>{
    const open=pcNum(o.grossOpen),assigned=pcNum(o.allocated),toPlan=pcNum(o.available);
    const isSC=pcIsSoftcreationOrder(o);
    const scKey=pcOrderSelectionKey(o);
    const isScChecked=isSC&&pcSelectedScOrderKey===scKey;
    const isInnerSelected=!isSC&&innerKeys.has(scKey);
    const rowState=assigned>0&&toPlan>0?'mixed':assigned>0?'assigned':toPlan>0?'toplan':'open';

    let checkCell='';
    if(isSC){
      checkCell=`<input type="checkbox" class="pc-sc-tick" aria-label="Select SoftCreation order ${pcEsc(o.sourceSoNo)}" ${isScChecked?'checked':''} ${toPlan<=0?'disabled':''} onchange="pcToggleScOrder(decodeURIComponent('${encodeURIComponent(String(o.sourceSoId))}'),${Number(o.lineIndex)},this.checked)">`;
    }else{
      checkCell=isInnerSelected?`<span class="tag green sm" style="font-size:10px;padding:2px 5px">Inside SC</span>`:`<span style="color:#94a3b8;font-size:12px">—</span>`;
    }

    return `<tr class="pc-so-row-nov11 pc-so-row-${rowState} ${isSC?'pc-so-softcreation':''} ${isScChecked||isInnerSelected?'pc-so-selected':''}">
      <td style="text-align:center">${checkCell}</td>
      <td>
        <b>${pcEsc(o.sourceSoNo)}</b>
        <small>${pcEsc(o.customer)} ${isSC?'<span class="pc-softcreation-label">Softcreation order</span>':''}</small>
        ${isSC&&isScChecked?`<div class="small" style="color:#a44913;font-weight:700;margin-top:3px">✓ ${innerOrders.length} customer order(s) selected inside (${pcMoney(innerOrders.reduce((s,x)=>s+x.available,0))} rolls) <button type="button" class="btn ghost sm" style="padding:1px 6px;font-size:11px;margin-left:6px" onclick="pcOpenScOrdersModal(decodeURIComponent('${encodeURIComponent(String(o.sourceSoId))}'),${Number(o.lineIndex)})">Edit inside orders</button></div>`:''}
      </td>
      <td>${pcEsc(o.requiredDate||'-')}</td>
      <td class="num">${pcMoney(o.ordered)}</td>
      <td class="num">${pcMoney(o.dispatched)}</td>
      <td class="num">${pcMoney(o.grossOpen)}</td>
      <td class="num">${pcMoney(o.allocated)}</td>
      <td class="num"><b>${pcMoney(o.available)}</b></td>
      <td style="text-align:center">
        ${toPlan>0?`<button type="button" class="btn red sm" style="font-size:11px;padding:2px 8px;white-space:nowrap" onclick="pcOpenCancelDemandModal(decodeURIComponent('${encodeURIComponent(String(o.sourceSoId))}'),${Number(o.lineIndex)})">Cancel Demand</button>`:`<span style="color:#94a3b8;font-size:11px">—</span>`}
      </td>
    </tr>`;
  }).join('')||'<tr><td colspan="9">No outstanding SO demand. Stock replenishment can still be planned.</td></tr>'}</tbody></table></div>`;
}
function pcIntelligenceHTML(g){
 const soOpen=g.orders.reduce((n,o)=>n+o.grossOpen,0);
 const allocated=g.orders.reduce((n,o)=>n+o.allocated,0);
 const selectedDemand=pcSelectedDemand(g),selectedRecommended=pcSelectedRecommended(g),scAvailable=g.orders.filter(pcIsSoftcreationOrder).reduce((n,o)=>n+pcNum(o.available),0);
 return `<div class="pc-card pc-simple-v1142"><h3>Production quantity planner</h3>
 <p class="pc-muted">See the current Sales Order requirement, then add extra production only if needed.</p>
 ${g.pipeline>0||allocated>0?`<div class="pc-live-production-alert-v20261030" role="alert"><strong>⚠ PRODUCTION ALREADY ASSIGNED / IN PROGRESS</strong><span>${pcMoney(g.pipeline)} rolls in existing production pipeline · ${pcMoney(allocated)} rolls assigned to Sales Orders. Check outstanding demand before requesting more.</span></div>`:''}
 <div class="pc-simple-stats-v1142">
 <div class="pc-kpi-softcreation pc-sc-item-card"><small>SoftCreation (Pvt) Ltd · Outstanding</small><strong>${pcMoney(scAvailable)} rolls</strong><span>Included in the overall demand (not additional demand)</span></div>
 <div class="pc-kpi-open-nov11"><small>Current open Sales Orders</small><strong>${pcMoney(soOpen)} rolls</strong><span>Matches the Open column in Build a production request</span></div>
 <div class="pc-kpi-assigned-nov11"><small>Already assigned to production</small><strong>${pcMoney(allocated)} rolls</strong><span>Matches the Already PR column</span></div>
 <div class="pc-kpi-to-plan-nov11"><small>Sales Orders still to produce</small><strong>${pcMoney(g.demand)} rolls</strong><span>Matches the To Plan column</span></div>
 <div class="pc-kpi-pipeline-nov11"><small>Existing production pipeline</small><strong>${pcMoney(g.pipeline)} rolls</strong><span>Includes production outside these SO allocations</span></div>
 </div>
 <div class="pc-simple-note-v1142"><b>Selected order lines:</b> ${pcEsc(pcSelectionSummary(g))}<br>Suggested production for this selection: <b>${pcMoney(selectedRecommended)} rolls</b> (includes stock cover / safety stock / HO stock settings).</div>
 ${g.orders.length?`<details class="pc-order-details-v1142"><summary>View ${g.orders.length} current Sales Order line(s)</summary><div>${g.orders.map(o=>`<div><b>${pcEsc(o.sourceSoNo)}</b> • ${pcEsc(o.customer)} <span>Open ${pcMoney(o.grossOpen)} • Already assigned ${pcMoney(o.allocated)} • To plan ${pcMoney(o.available)}</span></div>`).join('')}</div></details>`:''}
 <div class="pc-simple-entry-v1142">
 <div class="field"><label>Sales Order quantity to include (rolls)</label><input id="pcSalesQty" type="number" readonly value="${selectedDemand}"></div>
 <div class="field"><label>Additional production required (rolls)</label><input id="pcExtraQty" type="number" min="0" step="1" value="${Math.max(0,selectedRecommended-selectedDemand)}" oninput="pcUpdateSimpleQtyV1142()"></div>
 </div>
 <div class="field"><label>Total requested production (rolls)</label><input id="pcQty" type="number" readonly value="${Math.max(selectedDemand,selectedRecommended)}"></div>
 <div class="field" id="pcOverrideWrapV20261109" style="${Math.max(0,selectedRecommended-selectedDemand)>0?'':'display:none'}"><label>Reason for additional production *</label><textarea id="pcOverride" placeholder="Required only when additional production quantity is greater than zero"></textarea></div>
 
 <div class="actions"><button class="btn primary" onclick="pcAddToBasket()" ${!pcHas('production_control_create')?'disabled':''}>Add item to request</button></div></div>`
}
window.pcUpdateSimpleQtyV1142=function(){
 const sales=Number(document.getElementById('pcSalesQty')?.value||0),extra=Number(document.getElementById('pcExtraQty')?.value||0);
 const el=document.getElementById('pcQty');if(el)el.value=sales+Math.max(0,extra);
 const reasonWrap=document.getElementById('pcOverrideWrapV20261109');if(reasonWrap)reasonWrap.style.display=extra>0?'':'none';
 const reason=document.getElementById('pcOverride');if(reason)reason.required=extra>0;
}
window.pcSelectItem=function(v){pcPlannerItemKey=decodeURIComponent(v);pcRender()}
window.pcRemoveBasket=function(i){pcBasket.splice(i,1);pcRender()}
window.pcAddToBasket=function(){
  const g=pcGroup(pcPlannerItemKey);if(!g)return;
  const qty=pcNum(document.getElementById('pcQty')?.value),reason=String(document.getElementById('pcOverride')?.value||'').trim();
  const extra=pcNum(document.getElementById('pcExtraQty')?.value);
  if(!Number.isInteger(extra)||extra<0)return toast('Additional production must be zero or a positive whole number.');
  if(!Number.isInteger(qty)||qty<=0)return toast('Enter a positive whole quantity.');

  const scOrders=(g.orders||[]).filter(pcIsSoftcreationOrder);
  if(!scOrders.length)return toast('Only SoftCreation orders can be sent from Production Control.');
  if(!pcSelectedScOrderKey)return toast('Please tick the SoftCreation order in the table to select it.');

  const sc=scOrders.find(o=>pcOrderSelectionKey(o)===pcSelectedScOrderKey);
  if(!sc)return toast('Selected SoftCreation order not found.');

  const chosen=pcSelectedOrders(g),chosenDemand=pcSelectedDemand(g);
  if(!chosen.length)return toast('Select at least one Sales Order line in the table.');
  if(qty<chosenDemand)return toast('Quantity must cover selected SO demand ('+money(chosenDemand)+' rolls).');
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
window.pcSavePolicy=async function(){const g=pcGroup(pcPlannerItemKey);if(!g)return;try{await pcRpc('spgs_pc_upsert_item_policy',{p_item_key:g.key,p_source_item_id:g.sourceItemId||'',p_safety_stock_qty:pcNum(document.getElementById('pcSafety')?.value),p_available_stock_qty:pcNum(document.getElementById('pcStock')?.value),p_cover_weeks:pcNum(document.getElementById('pcCoverWeeks')?.value)||2,p_username:currentUser?.username||''});await pcRefresh(false);toast('Stock policy saved')}catch(e){console.error(e);toast(e.message)}}
window.pcSubmitRequest=async function(){
  const oldDispatchSnapshot=JSON.stringify([...pcOrdexaSent.entries()].sort());
  try{await pcCheckDispatchSafe()}catch(e){pcOrdexaReady=false;toast('Production blocked: '+e.message);return}
  if(pcBasket.length&&oldDispatchSnapshot!==JSON.stringify([...pcOrdexaSent.entries()].sort())){toast('Dispatch balances changed: rebuild production request basket before submitting.');pcBasket=[];pcRender();return}

  const role=String(currentUser?.role||'').toLowerCase();
  if(role==='manager')return toast('Managers cannot create Production Control requests.');
  if(!pcHas('production_control_create'))return requirePerm('production_control_create','submit Production Control requests');if(!pcBasket.length)return toast('Add at least one item.');const due=document.getElementById('pcDue')?.value;if(!due)return toast('Choose Required at HO date.');const needsManagerApproval=pcBasket.some(x=>pcNum(x.additionalQty)>0);
  const payload={approval_route:needsManagerApproval?'manager':'automatic',auto_approve_eligible:!needsManagerApproval,workspace:PC_WORKSPACE,required_date:due,material_mode:document.getElementById('pcMaterial')?.value||'Factory to arrange material',reason:String(document.getElementById('pcRequestReason')?.value||'').trim(),user:{username:currentUser?.username||'',display_name:currentUser?.display||currentUser?.username||''},lines:pcBasket.map(x=>({item_key:x.itemKey,source_item_id:x.sourceItemId,description:x.desc,size_label:x.size,material:x.material,layout:x.layout,pcs_per_roll:x.pcs,unit:x.unit,requested_qty:x.requestedQty,additional_production_qty:pcNum(x.additionalQty),so_demand_qty:x.soDemand,stock_cover_qty:x.cover,safety_stock_qty:x.safety,available_stock_qty:x.stock,pipeline_qty:x.pipeline,recommended_qty:x.recommended,override_reason:x.overrideReason,cover_weeks:x.coverWeeks,allocations:x.allocations}))};
  try{
    const r=await pcRpc('spgs_pc_create_request',{p_payload:payload});

    // Update all sent orders to "In Production"
    const allAllocations=pcBasket.flatMap(x=>x.allocations||[]);
    let soUpdatedCount=0;
    allAllocations.forEach(alloc=>{
      const so=(state.salesOrders||[]).find(s=>String(s.id)===String(alloc.source_so_id));
      if(so){
        so.productionStatus='In Production';
        so.productionRequestId=r?.id||'';
        so.productionRequestNo=r?.request_no||'';
        so.inProduction=true;
        so.history=so.history||[];
        so.history.push({
          action:'In Production',
          by:currentUser?.display||currentUser?.username||'User',
          at:new Date().toISOString(),
          note:`Allocated to Production Request ${r?.request_no||''}`
        });
        soUpdatedCount++;
      }
    });
    if(soUpdatedCount>0){
      saveState();
      try{if(typeof window.renderSalesOrders91==='function')window.renderSalesOrders91()}catch(_){}
    }

    pcBasket=[];
    pcSelectedScOrderKey='';
    pcScInnerSelections.clear();
    pcView='register';
    pcSelectedRequest=r?.id||'';
    await pcRefresh(false);
    const saved=pcCloud.requests.find(x=>x.id===(r?.id||''));
    const actual=saved?.status||r?.status||'Unknown';
    if(needsManagerApproval){
      toast(`${r?.request_no||'Production request'} submitted — ${actual}. Manager approval required.`);
    }else if(actual==='Approved'){
      toast(`${r?.request_no||'Production request'} automatically approved and released to production.`);
    }else{
      toast(`${r?.request_no||'Production request'} saved as ${actual}.`);
    }
  }catch(e){console.error(e);toast(e.message)}
};

function pcApprovalsHTML(){
  if(!pcHas('production_control_approve'))return '<div class="pc-card">You do not have approval permission.</div>';
  const rows=[...(pcCloud.requests||[])].filter(r=>r.status==='Pending Approval').sort((a,b)=>Date.parse(a.created_at||0)-Date.parse(b.created_at||0));
  const approved=(pcCloud.requests||[]).filter(r=>r.status==='Approved').length;
  const selected=rows.find(r=>r.id===pcSelectedRequest)||rows[0]||null;
  if(selected)pcSelectedRequest=selected.id;
  return `<div class="pc-card pc-approval-dashboard"><div class="pc-card-head"><div><h3>Manager approval queue</h3><p class="pc-muted">${rows.length} waiting for decision · ${approved} approved requests</p></div><button class="btn ghost sm" onclick="pcRefresh(true)">Refresh approvals</button></div>
   <div class="pc-approval-list">${rows.map(r=>{const lines=pcRequestLines(r.id);const qty=lines.reduce((n,l)=>n+pcNum(l.requested_qty),0);return `<div class="pc-approval-entry ${r.id===selected?.id?'selected':''}"><div><b>${pcEsc(r.request_no||r.id)}</b><small>${pcEsc(r.created_by_display||r.created_by||'Sales')} · Required ${pcEsc(r.required_date||'-')}</small><span>${lines.length} item(s) · ${pcMoney(qty)} rolls</span></div><button class="btn primary sm" onclick="pcOpenApproval('${r.id}')">Review request</button></div>`}).join('')||'<div class="pc-approval-empty">No requests waiting for manager approval.</div>'}</div></div>`;
}
window.pcOpenApproval=function(id){pcSelectedRequest=id;pcView='approvals';pcRender();pcOpenDetailModalV20261030(id);};
function pcRegisterHTML(){
  const role=String(currentUser?.role||'').toLowerCase();
  const archived=pcHistoryRequestIdsV1130();
  const rows=[...(pcCloud.requests||[])].filter(r=>!archived.has(String(r.id))).sort((a,b)=>{
    if(role==='manager'){
      const ap=a.status==='Pending Approval'?0:1;
      const bp=b.status==='Pending Approval'?0:1;
      if(ap!==bp)return ap-bp;
    }
    return Date.parse(b.created_at||0)-Date.parse(a.created_at||0);
  });
  const selected=rows.find(x=>x.id===pcSelectedRequest)||rows[0];if(selected&&!pcSelectedRequest)pcSelectedRequest=selected.id;
  return `<div class="pc-card"><div class="pc-card-head"><h3>Production request register</h3><span class="pc-pill">${rows.length} request(s)</span></div><div class="pc-scroll"><table class="pc-table"><thead><tr><th>Request</th><th>Required</th><th>Items / Rolls</th><th>Status</th><th>Created By</th><th></th></tr></thead><tbody>${rows.map(r=>{const ls=pcRequestLines(r.id);return `<tr><td><b>${pcEsc(r.request_no)}</b><small>${new Date(r.created_at).toLocaleString()}</small></td><td>${pcEsc(r.required_date||'-')}</td><td>${ls.length} item(s) • ${pcMoney(ls.reduce((n,l)=>n+pcNum(l.requested_qty),0))}</td><td><span class="pc-status ${String(r.status).toLowerCase().replace(/\s+/g,'-')}">${pcEsc(r.status)}</span></td><td>${pcEsc(r.created_by_display||r.created_by)}</td><td><button class="btn ghost sm" onclick="pcOpenRequest('${r.id}')">Review →</button></td></tr>`}).join('')||'<tr><td colspan="6">No Production Control requests yet.</td></tr>'}</tbody></table></div></div>`;
}
let pcHistoryPageV20261030=1,pcHistorySizeV20261030=10,pcHistorySearchV20261030='';
window.pcHistoryFilterV20261030=function(value){pcHistorySearchV20261030=String(value||'');pcHistoryPageV20261030=1;pcRender();const el=document.getElementById('pcHistorySearchV20261030');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}};
window.pcHistorySizeChangedV20261030=function(value){pcHistorySizeV20261030=Number(value)||10;pcHistoryPageV20261030=1;pcRender();};
window.pcHistoryMoveV20261030=function(page){pcHistoryPageV20261030=Math.max(1,Number(page)||1);pcRender();};
function pcHistoryHTMLV1130(){
  const archived=pcHistoryRequestIdsV1130();
  const all=(pcCloud.requests||[]).filter(r=>archived.has(String(r.id)))
    .sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
  const term=pcHistorySearchV20261030.toLowerCase().trim();
  const rows=term?all.filter(r=>[r.request_no,r.required_date,r.created_by_display,r.created_by,
    ...pcRequestLines(r.id).flatMap(l=>[l.description,l.size_label,l.item_key,...(pcCloud.allocations||[]).filter(a=>a.request_line_id===l.id).map(a=>a.source_so_no)])]
    .some(v=>String(v||'').toLowerCase().includes(term))):all;
  const pages=Math.max(1,Math.ceil(rows.length/pcHistorySizeV20261030));
  pcHistoryPageV20261030=Math.min(pcHistoryPageV20261030,pages);
  const subset=rows.slice((pcHistoryPageV20261030-1)*pcHistorySizeV20261030,pcHistoryPageV20261030*pcHistorySizeV20261030);
  return `<div class="pc-card"><div class="pc-card-head"><div><h3>History — All Sales Orders Dispatched</h3><p>Completed order cycles remain searchable. A new sales order creates a separate active cycle.</p></div><span class="pc-pill">${all.length} archived request(s)</span></div>
  <div class="pc-history-tools-v20261030"><input id="pcHistorySearchV20261030" type="search" value="${pcEsc(pcHistorySearchV20261030)}" placeholder="Search request, Sales Order, item..." oninput="pcHistoryFilterV20261030(this.value)"><label>Rows <select onchange="pcHistorySizeChangedV20261030(this.value)">${[10,25,50].map(n=>`<option value="${n}" ${pcHistorySizeV20261030===n?'selected':''}>${n}</option>`).join('')}</select></label></div>
  <div class="pc-scroll"><table class="pc-table"><thead><tr><th>Request</th><th>Required</th><th>Items / Rolls</th><th>Dispatch</th><th>Created By</th><th></th></tr></thead><tbody>
  ${subset.map(r=>{const ls=pcRequestLines(r.id);return `<tr><td><b>${pcEsc(r.request_no)}</b><small>${new Date(r.created_at).toLocaleString()}</small></td><td>${pcEsc(r.required_date||'-')}</td><td>${ls.length} item(s) • ${pcMoney(ls.reduce((n,l)=>n+pcNum(l.requested_qty),0))}</td><td><span class="pc-status approved">ALL DISPATCHED</span></td><td>${pcEsc(r.created_by_display||r.created_by||'-')}</td><td><button class="btn ghost sm" onclick="pcOpenHistoryV1130('${r.id}')">View →</button></td></tr>`}).join('')||'<tr><td colspan="6">No matching fully dispatched production requests.</td></tr>'}
  </tbody></table></div><div class="pc-history-pages-v20261030"><span>${rows.length?((pcHistoryPageV20261030-1)*pcHistorySizeV20261030+1):0}–${Math.min(pcHistoryPageV20261030*pcHistorySizeV20261030,rows.length)} of ${rows.length}</span><button type="button" class="btn ghost sm" ${pcHistoryPageV20261030<=1?'disabled':''} onclick="pcHistoryMoveV20261030(${pcHistoryPageV20261030-1})">Previous</button><span>Page ${pcHistoryPageV20261030} / ${pages}</span><button type="button" class="btn ghost sm" ${pcHistoryPageV20261030>=pages?'disabled':''} onclick="pcHistoryMoveV20261030(${pcHistoryPageV20261030+1})">Next</button></div></div>`;
}
window.pcOpenHistoryV1130=function(id){pcSelectedRequest=id;pcOpenDetailModalV20261030(id);};
window.pcOpenRequest=function(id){pcSelectedRequest=id;pcOpenDetailModalV20261030(id);};
function pcOpenDetailModalV20261030(id){
  const request=(pcCloud.requests||[]).find(r=>String(r.id)===String(id));if(!request)return;
  pcCloseDetailModalV20261030();
  const host=document.createElement('div');host.id='pcDetailModalV20261030';
  host.className='modal show pc-detail-overlay-v20261030';host.setAttribute('role','dialog');
  host.setAttribute('aria-modal','true');host.setAttribute('aria-label','Production request details');
  host.innerHTML=`<div class="modal-card pc-detail-window-v20261030"><div class="pc-detail-toolbar-v20261030"><strong>Production Request Details</strong><button type="button" class="btn ghost sm" onclick="pcCloseDetailModalV20261030()">Close ✕</button></div><div class="pc-detail-content-v20261030">${pcRequestDetailHTML(request)}</div></div>`;
  host.addEventListener('click',event=>{if(event.target===host)pcCloseDetailModalV20261030();});
  document.body.appendChild(host);
}
function pcCloseDetailModalV20261030(){document.getElementById('pcDetailModalV20261030')?.remove();}
window.pcCloseDetailModalV20261030=pcCloseDetailModalV20261030;

function pcRequestDetailHTML(r){
  const lines=pcRequestLines(r.id),msgs=pcRequestMsgs(r.id),audit=pcRequestAudit(r.id),canApprove=pcHas('production_control_approve')&&r.status==='Pending Approval';
  return `<div class="pc-card pc-detail"><div class="pc-card-head"><div><h3>${pcEsc(r.request_no)} · Evidence & Approval</h3><p>Required ${pcEsc(r.required_date||'-')} • ${pcEsc(r.material_mode||'')}</p></div><span class="pc-status ${String(r.status).toLowerCase().replace(/\s+/g,'-')}">${pcEsc(r.status)}</span></div>${canApprove?`<div class="pc-approval-actions"><strong>Manager decision required</strong><div><button class="btn green" onclick="pcApproveRequest('${r.id}')">Approve & Release to Production</button><button class="btn amber" onclick="pcOpenReturn('${r.id}')">Return with Reason</button></div></div>`:''}${r.return_reason?`<div class="notice"><b>Returned:</b> ${pcEsc(r.return_reason)}</div>`:''}
  ${lines.map(l=>`<div class="pc-line-detail"><div class="pc-card-head"><div><b>${pcEsc(pcLineLabel({desc:l.description,size:l.size_label,material:l.material,layout:l.layout,pcs:l.pcs_per_roll}))}</b><small>${pcEsc(l.item_key)}</small></div><strong>${pcMoney(l.requested_qty)} ${pcEsc(l.unit)}</strong></div><div class="pc-split"><div><h4>Linked Sales Orders · ${pcMoney(l.so_demand_qty)}</h4>${pcRequestAlloc(l.id).map(a=>`<div class="pc-message"><b>${pcEsc(a.source_so_no)}</b><span>${pcEsc(a.customer_name)} • ${pcEsc(a.required_date||'-')}</span><strong>${pcMoney(a.allocated_qty)}</strong></div>`).join('')||'<p class="pc-muted">Stock-only replenishment.</p>'}</div><div><h4>Why this quantity?</h4><p>${pcMoney(l.so_demand_qty)} SO + ${pcMoney(l.stock_cover_qty)} cover + ${pcMoney(l.safety_stock_qty)} safety − ${pcMoney(l.available_stock_qty)} stock − ${pcMoney(l.pipeline_qty)} pipeline = <b>${pcMoney(l.recommended_qty)} recommended</b></p><p>Override: ${pcEsc(l.override_reason||'None')}</p></div></div></div>`).join('')}
  </div>
  <div class="pc-split"><div class="pc-card"><h3>Stores ↔ Production Communication</h3>${msgs.map(m=>`<div class="pc-chat"><b>${pcEsc(m.created_by_display||m.created_by)}</b><small>${new Date(m.created_at).toLocaleString()}</small><p>${pcEsc(m.message)}</p></div>`).join('')||'<p class="pc-muted">No messages yet.</p>'}${pcHas('production_control_chat')?`<div class="field"><label>Message</label><textarea id="pcMessageText" placeholder="Material, priority, progress or clarification"></textarea></div><button class="btn primary sm" onclick="pcSendMessage('${r.id}')">Send Update</button>`:''}</div>
  <div class="pc-card"><h3>Audit Trail</h3>${audit.map(a=>`<div class="pc-audit"><b>${pcEsc(a.action)}</b><span>${pcEsc(a.detail||'')}</span><small>${pcEsc(a.display_name||a.username)} • ${new Date(a.created_at).toLocaleString()}</small></div>`).join('')||'<p class="pc-muted">No audit entries.</p>'}</div></div>`;
}
window.pcApproveRequest=async function(id){
  try{await pcCheckDispatchSafe()}catch(e){pcOrdexaReady=false;toast('Approval blocked: '+e.message);return}
  const disputed=pcCloud.allocations.filter(a=>pcRequestLines(id).some(l=>l.id===a.request_line_id)).filter(a=>{const so=(state.salesOrders||[]).find(s=>s.id===a.source_so_id);return so&&pcDispatchedForSOLine(so,a.source_so_line_index)>0});
  if(disputed.length){toast('Approval blocked: '+disputed.length+' allocated SO lines already have dispatches. Reconcile/revise request first.');return}

  const role=String(currentUser?.role||'').toLowerCase();
  if(role==='sales')return toast('Sales users cannot approve Production Control requests.');
  if(!pcHas('production_control_approve'))return requirePerm('production_control_approve','approve Production Control requests');
  try{
    await pcRpc('spgs_pc_transition',{
      p_request_id:id,
      p_action:'approve',
      p_reason:'',
      p_username:currentUser?.username||'',
      p_display_name:currentUser?.display||currentUser?.username||''
    });
    await pcRefresh(false);
    const requestAfter=pcCloud.requests.find(r=>r.id===id);
    const releases=(pcCloud.releases||[]).filter(r=>r.request_id===id);
    if(requestAfter?.status!=='Approved')throw new Error('Approval was submitted but the approved status could not be verified. Refresh and check request register before retrying.');
    if(!releases.length){toast('Approved in database, but no production release was found. Check spgs_pc_transition / release processing.');return;}
    const unprocessed=releases.filter(r=>!r.consumed_at);
    if(unprocessed.length){toast('Approved; '+unprocessed.length+' production release(s) still pending sync. Use Refresh Live Data.');return;}
    try{renderProductionBoard?.()}catch(_){}
    try{renderProductionProducts?.()}catch(_){}
    toast('Approved and production release(s) processed. Check Production / Products.');
  }catch(e){
    console.error(e);
    toast(e.message);
  }
}
window.pcOpenReturn=function(id){pcReturnTarget=id;document.getElementById('pcReturnReason').value='';document.getElementById('pcReturnModal').classList.add('show')}
window.pcConfirmReturn=async function(){
  const role=String(currentUser?.role||'').toLowerCase();
  if(role==='sales')return toast('Sales users cannot return approval requests.');
  if(!pcHas('production_control_approve'))return requirePerm('production_control_approve','return Production Control requests');
  const reason=String(document.getElementById('pcReturnReason')?.value||'').trim();
  if(!reason)return toast('Return reason is required');
  try{
    await pcRpc('spgs_pc_transition',{
      p_request_id:pcReturnTarget,
      p_action:'return',
      p_reason:reason,
      p_username:currentUser?.username||'',
      p_display_name:currentUser?.display||currentUser?.username||''
    });
    closeModal('pcReturnModal');
    await pcRefresh(false);
    toast('Request returned to Sales with reason');
  }catch(e){
    console.error(e);
    toast(e.message);
  }
}
window.pcSendMessage=async function(id){const text=String(document.getElementById('pcMessageText')?.value||'').trim();if(!text)return toast('Enter a message');try{await pcRpc('spgs_pc_add_message',{p_request_id:id,p_message:text,p_username:currentUser?.username||'',p_display_name:currentUser?.display||currentUser?.username||''});await pcRefresh(false);toast('Message sent')}catch(e){console.error(e);toast(e.message)}}
window.pcDemandProductionPDFV1128=async function(){
  const groups=pcDemandGroups();
  if(!groups.length)return toast('No current Sales Order demand to export.');
  try{
    if(typeof window.jbrRefreshProductBalanceV1121==='function'){
      for(const g of groups){
        try{await window.jbrRefreshProductBalanceV1121(g.key,true)}catch(_){}
      }
    }
    const ok=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',()=>window.jspdf);
    if(!ok||!window.jspdf)return toast('PDF library unavailable');
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
    const W=210,H=297,M=14,contentW=W-M*2;
    let y=16,page=1;
    const num=v=>Number(v||0);
    const money=v=>num(v).toLocaleString(undefined,{maximumFractionDigits:2});
    const safe=v=>String(v??'').replace(/[^\x20-\x7E]/g,' ').replace(/\s+/g,' ').trim();
    const newPage=()=>{pdf.addPage();page++;y=16;header(false)};
    const ensure=h=>{if(y+h>H-16)newPage()};
    const text=(t,x=M,size=9,style='normal',max=contentW)=>{pdf.setFont('helvetica',style);pdf.setFontSize(size);const lines=pdf.splitTextToSize(safe(t),max);ensure(lines.length*(size*.36)+2);pdf.text(lines,x,y);y+=lines.length*(size*.36)+2;return lines};
    const rule=()=>{ensure(4);pdf.setDrawColor(185);pdf.line(M,y,W-M,y);y+=4};
    const header=first=>{
      pdf.setTextColor(8,127,131);pdf.setFont('helvetica','bold');pdf.setFontSize(first?18:13);pdf.text('SOFTCREATION',M,y);y+=first?8:6;
      pdf.setTextColor(25);pdf.setFontSize(first?14:11);pdf.text('Production Demand & Cut Report',M,y);y+=6;
      pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.setTextColor(90);pdf.text(`Generated ${new Date().toLocaleString()}  |  Page ${page}`,M,y);y+=5;
      rule();pdf.setTextColor(25);
    };
    header(true);

    const totalDemand=groups.reduce((n,g)=>n+num(g.demand),0);
    const totalRecommended=groups.reduce((n,g)=>n+num(g.recommended),0);
    const totalCut=groups.reduce((n,g)=>n+num(window.jbrCutForProductV1121?.(g.key)||0),0);
    text(`SUMMARY  |  Open SO Demand ${money(totalDemand)} rolls  |  Recommended ${money(totalRecommended)} rolls  |  JBR Cut ${money(totalCut)} rolls`,M,9,'bold');
    text('JBR Cut may exceed requested production quantity. Positive variances are shown as + Extra Output / Stock.',M,8,'normal');
    rule();

    groups.forEach((g,idx)=>{
      const jobs=(state.productionRequests||[]).filter(r=>pcLineKey(r)===g.key);
      const requested=jobs.reduce((n,r)=>n+num(r.requestQty),0);
      const jbrCut=num(window.jbrCutForProductV1121?.(g.key)||0);
      const finished=jobs.reduce((n,r)=>['Finished','Dispatched','Received','GRN Closed'].includes(String(r.status||''))?n+num(r.finishedQty||r.packing?.total||r.requestQty):n,0);
      const cutVar=jbrCut-requested;
      ensure(36);
      pdf.setFillColor(239,250,250);pdf.roundedRect(M,y,contentW,9,2,2,'F');
      pdf.setTextColor(8,127,131);pdf.setFont('helvetica','bold');pdf.setFontSize(10);pdf.text(`${idx+1}. ${safe(pcLineLabel(g))}`,M+3,y+6);y+=13;pdf.setTextColor(25);
      text(`SO Demand: ${money(g.demand)}   Cover: ${money(g.cover)}   Safety: ${money(g.safety)}   HO Stock: ${money(g.stock)}   Pipeline: ${money(g.pipeline)}   Recommended: ${money(g.recommended)}`,M,8,'normal');
      text(`Production Jobs Requested: ${money(requested)}   JBR Cut: ${money(jbrCut)}   ${cutVar>0?`+ Extra Output / Stock: ${money(cutVar)}`:cutVar<0?`Still To Cut: ${money(Math.abs(cutVar))}`:'Cut matches requested'}   Finished: ${money(finished)}`,M,8,'bold');

      if(g.orders.length){
        text('SALES ORDER LINES',M,8,'bold');
        g.orders.forEach(o=>text(`${o.sourceSoNo} | ${o.customer||'-'} | Ordered ${money(o.ordered)} | Dispatched ${money(o.dispatched)} | Allocated ${money(o.allocated)} | Open ${money(o.available)} | Need ${o.requiredDate||'-'}`,M+2,7.5,'normal',contentW-2));
      }
      if(jobs.length){
        text('PRODUCTION JOBS',M,8,'bold');
        jobs.forEach(r=>{
          const fq=['Finished','Dispatched','Received','GRN Closed'].includes(String(r.status||''))?num(r.finishedQty||r.packing?.total||r.requestQty):0;
          text(`${r.orderNo||'-'} | ${r.status||'-'} | Requested ${money(r.requestQty)} | Finished ${money(fq)} | Need ${r.needDate||'-'}${r.productionControlRequestNo?` | PC ${r.productionControlRequestNo}`:''}`,M+2,7.5,'normal',contentW-2);
        });
      }else{
        text('PRODUCTION JOBS: No released production job for this item yet.',M,7.5,'normal');
      }
      rule();
    });

    const stamp=today().replaceAll('-','');
    pdf.save(`SoftCreation_Production_Demand_Cut_Report_${stamp}.pdf`);
    toast('Production Demand & Cut PDF generated.');
  }catch(e){
    console.error('Production demand PDF',e);
    toast('Could not generate Production Demand PDF: '+(e?.message||e));
  }
};
let pcDemandPageV2026=1;
let pcDemandPageSizeV2026=10;
let pcDemandSearchV2026='';
window.pcSetDemandPageV2026=function(n){pcDemandPageV2026=Math.max(1,Number(n)||1);pcRender()};
window.pcSetDemandSizeV2026=function(n){pcDemandPageSizeV2026=[10,25,50].includes(Number(n))?Number(n):10;pcDemandPageV2026=1;pcRender()};
window.pcSetDemandSearchV2026=function(v){pcDemandSearchV2026=String(v||'');pcDemandPageV2026=1;pcRender();const e=document.getElementById('pcDemandSearchV2026');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length)}};
function pcDemandHTML(){
  const all=pcDemandGroups();
  const q=pcDemandSearchV2026.trim().toLowerCase();
  const groups=q?all.filter(g=>[pcLineLabel(g),g.key,...g.orders.map(o=>o.sourceSoNo),...g.orders.map(o=>o.customer)].join(' ').toLowerCase().includes(q)):all;
  const pages=Math.max(1,Math.ceil(groups.length/pcDemandPageSizeV2026));
  pcDemandPageV2026=Math.min(pcDemandPageV2026,pages);
  const start=(pcDemandPageV2026-1)*pcDemandPageSizeV2026;
  const rows=groups.slice(start,start+pcDemandPageSizeV2026);
  return `<div class="pc-card"><div class="pc-card-head"><div><h3>Live Sales Order production demand</h3><p>Outstanding order demand and production planning.</p></div><button class="btn navy sm" type="button" onclick="pcDemandProductionPDFV1128()">Download Demand / Cut PDF</button></div>
  <div class="pc-demand-controls-v2026"><input id="pcDemandSearchV2026" type="search" placeholder="Search item, customer or Sales Order" value="${pcEsc(pcDemandSearchV2026)}" oninput="pcSetDemandSearchV2026(this.value)"><label>Rows <select onchange="pcSetDemandSizeV2026(this.value)">${[10,25,50].map(n=>`<option value="${n}" ${pcDemandPageSizeV2026===n?'selected':''}>${n}</option>`).join('')}</select></label></div>
  <div class="pc-scroll"><table class="pc-table"><thead><tr><th>Item</th><th class="num">SO Demand</th><th class="num">JBR Cut</th><th class="num">+ Extra / Balance</th><th class="num">Cover</th><th class="num">Safety</th><th class="num">HO Stock</th><th class="num">Pipeline</th><th class="num">Recommended</th></tr></thead><tbody>${rows.map(g=>{const requested=(state.productionRequests||[]).filter(r=>pcLineKey(r)===g.key&&!pcIsArchivedProductionJobV1130(r)).reduce((n,r)=>n+pcNum(r.requestQty),0);const cut=pcNum(window.jbrCutForProductV1121?.(g.key)||0);const diff=cut-requested;return `<tr><td><b>${pcEsc(pcLineLabel(g))}</b><small>${g.orders.length} open SO line(s)</small></td><td class="num">${pcMoney(g.demand)}</td><td class="num"><b>${pcMoney(cut)}</b></td><td class="num ${diff>0?'pc-plus-v1128':''}">${diff>0?`+${pcMoney(diff)} extra`:diff<0?`${pcMoney(Math.abs(diff))} to cut`:'0'}</td><td class="num">${pcMoney(g.cover)}</td><td class="num">${pcMoney(g.safety)}</td><td class="num">${pcMoney(g.stock)}</td><td class="num">${pcMoney(g.pipeline)}</td><td class="num"><b>${pcMoney(g.recommended)}</b></td></tr>`}).join('')||'<tr><td colspan="9">No matching open Sales Order demand.</td></tr>'}</tbody></table></div>
  <div class="pc-demand-pagination-v2026"><span>${groups.length?`${start+1}–${Math.min(start+rows.length,groups.length)} of ${groups.length}`:'0 results'}</span><div><button class="btn ghost sm" ${pcDemandPageV2026===1?'disabled':''} onclick="pcSetDemandPageV2026(${pcDemandPageV2026-1})">Previous</button><span>Page ${pcDemandPageV2026} / ${pages}</span><button class="btn ghost sm" ${pcDemandPageV2026>=pages?'disabled':''} onclick="pcSetDemandPageV2026(${pcDemandPageV2026+1})">Next</button></div></div></div>`;
}
const baseAccessApplyPC=window.applyUserAccess;
window.applyUserAccess=function(){const result=baseAccessApplyPC?.apply(this,arguments);const nav=document.querySelector('.navbtn[data-view="productioncontrol"]');if(nav)nav.style.display=pcHas('production_control_view')?'inline-block':'none';if(document.getElementById('productioncontrol')?.classList.contains('active')&&!pcHas('production_control_view'))window.showView('dashboard');return result};
try{applyUserAccess=window.applyUserAccess}catch(_){}
const showBase=window.showView;
window.showView=function(id){if(id==='productioncontrol'&&!pcHas('production_control_view'))return requirePerm('production_control_view','open Production Control');const r=showBase.apply(this,arguments);if(id==='productioncontrol')pcRefresh(false);return r};
try{showView=window.showView}catch(_){}
pcInstallUI();
try{renderUserPrivilegeEditor(null)}catch(_){}
})();
