
/* V1.1.00 — Production Control. Existing Factory tab is intentionally untouched. */
(function(){
'use strict';
const PC_REST='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1',PC_WORKSPACE='softcreation_main',PC_KEY_STORE='spgs_supabase_browser_key_v1';
let pcView='planner',pcCloud={requests:[],lines:[],allocations:[],messages:[],audit:[],policies:[],releases:[]},pcBasket=[],pcSelectedRequest='',pcReturnTarget='',pcPlannerItemKey='';
function pcKey(){const k=(localStorage.getItem(PC_KEY_STORE)||'').trim();if(!k)throw new Error('SoftCreation cloud key is not configured on this device.');return k}
function pcHeaders(extra={}){const k=pcKey(),h={apikey:k,...extra};if(k.startsWith('eyJ'))h.Authorization='Bearer '+k;return h}
async function pcFetch(path,options={}){const r=await fetch(PC_REST+path,{...options,headers:pcHeaders(options.headers||{})});if(!r.ok){const b=await r.text().catch(()=>r.statusText);throw new Error(`Production Control DB ${r.status}: ${b.slice(0,500)}`)}if(r.status===204)return null;const t=await r.text();return t?JSON.parse(t):null}
async function pcRpc(name,args){return await pcFetch('/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args||{})})}
function pcHas(p){
  const role=String(currentUser?.role||'').toLowerCase();

  if(role==='admin')return true;

  /* V1.1.19 hard role separation */
  if(role==='manager'){
    if(p==='production_control_create')return false;
    if([
      'production_control_view',
      'production_control_approve',
      'production_control_chat',
      'production_control_policy'
    ].includes(p))return true;
  }

  if(role==='sales'){
    if(p==='production_control_approve')return false;
    if([
      'production_control_view',
      'production_control_create',
      'production_control_chat'
    ].includes(p))return true;
  }

  return typeof hasPerm==='function'&&hasPerm(p);
}
function pcEsc(v){return typeof esc==='function'?esc(v):String(v??'')}
function pcNum(v){return Number(v||0)}
function pcMoney(v){return pcNum(v).toLocaleString(undefined,{maximumFractionDigits:2})}
function pcNorm(v){return String(v??'').trim().toUpperCase().replace(/\s+/g,' ')}
function pcLineKey(l){if(l?.itemId)return 'ID:'+String(l.itemId);return ['SPEC',pcNorm(l?.desc),pcNorm(l?.size),pcNorm(l?.material),pcNorm(l?.layout),pcNum(l?.pcs),pcNorm(l?.unit||'Rolls')].join('|')}
function pcLineLabel(l){return [l?.desc,l?.size,l?.material,l?.layout,l?.pcs?`${l.pcs} pcs/roll`:null].filter(Boolean).join(' • ')}
function pcPolicy(k){return pcCloud.policies.find(x=>x.item_key===k)||{safety_stock_qty:0,available_stock_qty:0,cover_weeks:2}}
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
  (state.salesOrders||[]).forEach(so=>(so.lines||[]).forEach((l,i)=>{if(l.use===false)return;const k=pcLineKey(l);let g=m.get(k);if(!g){g={key:k,sourceItemId:l.itemId||'',desc:l.desc||'Item',size:l.size||'',material:l.material||'',layout:l.layout||'',pcs:pcNum(l.pcs),unit:l.unit||'Rolls',orders:[]};m.set(k,g)}
    const ordered=pcNum(l.qty),dispatched=Math.min(ordered,pcDispatchedForSOLine(so,i)),cancelled=pcNum(l.cancelledQty),grossOpen=Math.max(0,ordered-dispatched-cancelled),allocated=Math.min(grossOpen,pcAllocatedToOpenRequests(so.id,i)),available=Math.max(0,grossOpen-allocated);
    if(grossOpen>0)g.orders.push({sourceSoId:so.id,sourceSoNo:so.soNo||so.id,lineIndex:i,customer:so.customerName||'',requiredDate:so.needDate||'',ordered,dispatched,cancelled,grossOpen,allocated,available});
  }));
  return [...m.values()].map(g=>{const p=pcPolicy(g.key),movement=pcDeliveredMovementWeeks(g.key),avg=movement.reduce((a,b)=>a+b,0)/4,coverWeeks=Math.max(.25,pcNum(p.cover_weeks)||2),demand=g.orders.reduce((n,o)=>n+o.available,0),cover=Math.ceil(avg*coverWeeks),safety=Math.max(0,pcNum(p.safety_stock_qty)),stock=Math.max(0,pcNum(p.available_stock_qty)),pipeline=Math.max(0,pcPipelineForItem(g.key)),recommended=Math.max(0,Math.ceil(demand+cover+safety-stock-pipeline));return {...g,movement,avg,coverWeeks,demand,cover,safety,stock,pipeline,recommended}}).sort((a,b)=>b.recommended-a.recommended||a.size.localeCompare(b.size,undefined,{numeric:true}))
}
function pcGroup(k){return pcDemandGroups().find(x=>x.key===k)||null}
async function pcLoadCloud(){const q='?select=*&order=created_at.desc';const [requests,lines,allocations,messages,audit,policies,releases]=await Promise.all([
pcFetch('/spgs_prod_control_requests?workspace=eq.'+encodeURIComponent(PC_WORKSPACE)+'&select=*&order=created_at.desc'),pcFetch('/spgs_prod_control_request_lines'+q),pcFetch('/spgs_prod_control_so_allocations'+q),pcFetch('/spgs_prod_control_messages'+q),pcFetch('/spgs_prod_control_audit'+q),pcFetch('/spgs_prod_control_item_policy?workspace=eq.'+encodeURIComponent(PC_WORKSPACE)+'&select=*'),pcFetch('/spgs_prod_control_releases?workspace=eq.'+encodeURIComponent(PC_WORKSPACE)+'&select=*&order=created_at.asc')]);pcCloud={requests:requests||[],lines:lines||[],allocations:allocations||[],messages:messages||[],audit:audit||[],policies:policies||[],releases:releases||[]}}
function pcRequestLines(id){return pcCloud.lines.filter(x=>x.request_id===id).sort((a,b)=>a.line_no-b.line_no)}
function pcRequestAlloc(id){return pcCloud.allocations.filter(x=>x.request_line_id===id)}
function pcRequestMsgs(id){return pcCloud.messages.filter(x=>x.request_id===id).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))}
function pcRequestAudit(id){return pcCloud.audit.filter(x=>x.request_id===id).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))}
async function pcConsumeReleases(){for(const rel of (pcCloud.releases||[]).filter(x=>!x.consumed_at)){const p=rel.payload||{},exists=(state.productionRequests||[]).some(r=>r.productionControlReleaseId===rel.id||r.productionControlLineId===p.request_line_id);if(!exists){const now=new Date().toISOString(),prod={id:uid('prod'),orderNo:typeof prodNoV8==='function'?prodNoV8():('PC-'+String(p.request_no||'').replace(/\W+/g,'-')),piId:'',piSerial:'',quoteId:'',poRef:'',customerId:'',customerName:'Stock / Sales Order Demand',customerPhone:'',ownerUser:currentUser?.username||'',ownerDisplay:currentUser?.display||currentUser?.username||'',lineIndex:0,itemId:p.source_item_id||'',desc:p.description||'ELP',size:p.size_label||'',material:p.material||'',layout:p.layout||'',pcs:pcNum(p.pcs_per_roll),piQty:0,requestQty:pcNum(p.requested_qty),unit:p.unit||'Rolls',needDate:p.required_date||'',priority:'normal',shift:'day',instructions:`Production Control ${p.request_no||''} • ${p.material_mode||''}`,status:'Requested',createdBy:currentUser?.display||currentUser?.username||'System',createdByUser:currentUser?.username||'system',createdAt:now,productionControlRequestId:p.request_id||rel.request_id,productionControlRequestNo:p.request_no||'',productionControlLineId:p.request_line_id||rel.request_line_id,productionControlReleaseId:rel.id,history:[{status:'Requested',note:`Released from Production Control ${p.request_no||''}`,by:currentUser?.display||currentUser?.username||'System',username:currentUser?.username||'system',at:now}]};state.productionRequests=state.productionRequests||[];state.productionRequests.unshift(prod);saveState()}await pcRpc('spgs_pc_mark_release_consumed',{p_release_id:rel.id,p_username:currentUser?.username||''})}}
function pcEnsurePermissions(){if(typeof USER_FEATURES==='undefined')return;[['production_control_view','Production Control — View'],['production_control_create','Production Control — Create / Submit'],['production_control_approve','Production Control — Approve / Return'],['production_control_chat','Production Control — Communication'],['production_control_policy','Production Control — Stock / Safety Settings']].forEach(x=>{if(!USER_FEATURES.some(y=>y[0]===x[0]))USER_FEATURES.push(x)})}

function pcInstallUI(){
  if(document.getElementById('productioncontrol'))return;
  pcEnsurePermissions();
  const nav=document.querySelector('.nav'),before=nav?.querySelector('[data-view="production"]')||nav?.querySelector('[data-view="settings"]');
  if(nav){const b=document.createElement('button');b.className='navbtn';b.dataset.view='productioncontrol';b.textContent='Production Control';b.onclick=()=>showView('productioncontrol');nav.insertBefore(b,before||null)}
  const section=document.createElement('section');section.id='productioncontrol';section.className='view';section.innerHTML=`
    <div class="panel pc-shell"><div class="panel-title pc-title"><div><span>Production Control</span><small>SC HO planning → Manager approval → existing Products execution</small></div><button class="btn sm pc-refresh" onclick="pcRefresh(true)">Refresh Live Data</button></div>
    <div class="panel-body"><div class="pc-tabs"><button data-pc-view="planner" onclick="pcGo('planner')">Production Request</button><button data-pc-view="approvals" onclick="pcGo('approvals')">Manager Approvals <span id="pcPendingCount"></span></button><button data-pc-view="register" onclick="pcGo('register')">Request Register</button><button data-pc-view="demand" onclick="pcGo('demand')">Demand / Sales Orders</button></div><div id="pcKpis" class="pc-kpis"></div><div id="pcBody"></div></div></div>`;
  const firstModal=document.querySelector('.modal');if(firstModal)firstModal.insertAdjacentElement('beforebegin',section);else document.querySelector('.app')?.appendChild(section);
  document.body.insertAdjacentHTML('beforeend',`<div id="pcReturnModal" class="modal"><div class="modal-card" style="max-width:520px"><div class="modal-head"><b>Return Production Request</b><button class="closex" onclick="closeModal('pcReturnModal')">×</button></div><div class="modal-body"><div class="field"><label>Return Reason</label><textarea id="pcReturnReason" placeholder="Explain what HO Stores must correct"></textarea></div><div class="actions"><button class="btn amber" onclick="pcConfirmReturn()">Return to HO Stores</button></div></div></div></div>`);
}
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
function pcRenderKpis(){const g=pcDemandGroups(),open=g.reduce((n,x)=>n+x.demand,0),awaiting=pcCloud.requests.filter(r=>r.status==='Pending Approval').length,pipeline=(state.productionRequests||[]).filter(r=>pcOpenProdStatuses().has(String(r.status||''))).reduce((n,r)=>n+pcNum(r.requestQty),0),stock=pcCloud.policies.reduce((n,p)=>n+pcNum(p.available_stock_qty),0),el=document.getElementById('pcKpis');if(el)el.innerHTML=[['OPEN SALES DEMAND',open,'Rolls not allocated to an open PR'],['AWAITING APPROVAL',awaiting,'Manager decisions required'],['PRODUCTION PIPELINE',pipeline,'Current productionRequests'],['HO AVAILABLE STOCK',stock,'Production Control stock']].map(x=>`<div class="pc-kpi"><small>${x[0]}</small><strong>${pcMoney(x[1])}</strong><span>${x[2]}</span></div>`).join('')}
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
      : pcDemandHTML();

  b.innerHTML=roleBanner+body;
}
function pcPlannerHTML(){
  const groups=pcDemandGroups();if(!pcPlannerItemKey&&groups.length)pcPlannerItemKey=groups[0].key;const g=pcGroup(pcPlannerItemKey)||groups[0];
  return `<div class="pc-grid"><div><div class="pc-card"><div class="pc-card-head"><div><h3>Build a production request</h3><p>Real Sales Orders are linked automatically by item.</p></div><span class="pc-pill">SC HO Stores</span></div><div class="field"><label>Item / SKU</label><select onchange="pcSelectItem(this.value)">${groups.map(x=>`<option value="${encodeURIComponent(x.key)}" ${g&&x.key===g.key?'selected':''}>${pcEsc(pcLineLabel(x))}</option>`).join('')}</select></div>${g?pcPlannerGroupHTML(g):'<div class="empty">No outstanding Sales Order demand found.</div>'}</div>${g?`<div class="pc-card"><div class="pc-card-head"><h3>4-week fulfilled movement</h3><span class="pc-pill blue">${pcMoney(g.avg)} avg / week</span></div><div class="pc-bars">${g.movement.map(n=>`<div class="pc-bar" style="height:${Math.max(4,(n/Math.max(1,...g.movement))*90)}%"><span>${pcMoney(n)}</span></div>`).join('')}</div><div class="pc-week-labels"><span>W-4</span><span>W-3</span><span>W-2</span><span>Last week</span></div></div>`:''}</div>
  <div>${g?pcIntelligenceHTML(g):''}<div class="pc-card pc-request-submission-v1143"><div class="pc-card-head"><h3>Submit production request</h3></div><p class="pc-muted">Requests with additional production go to Manager Approval. Sales Order-only requests are eligible for automatic approval by the server.</p><div class="pc-submission-counter-v1143">Prepared items: <b>${pcBasket.length}</b> · Route: <b>${pcBasket.some(x=>pcNum(x.additionalQty)>0)?'Manager approval required':'Automatic approval eligible (server controlled)'}</b></div><div class="field"><label>Required at HO</label><input id="pcDue" type="date" value="${today()}"></div><div class="field"><label>Material arrangement</label><select id="pcMaterial"><option>Factory to arrange material</option><option>HO material issued</option><option>HO material pending issue</option></select></div><div class="field"><label>Request note</label><textarea id="pcRequestReason"></textarea></div><div class="actions"><button class="btn primary" onclick="pcSubmitRequest()" ${!pcHas('production_control_create')||!pcBasket.length?'disabled':''}>Submit Production Request →</button><button class="btn ghost sm" type="button" onclick="pcBasket=[];pcRender()" ${!pcBasket.length?'disabled':''}>Clear prepared items</button></div></div></div></div>`;
}
function pcPlannerGroupHTML(g){return `<div class="pc-demand-title"><div><b>${pcEsc(pcLineLabel(g))}</b><small>${pcEsc(g.key)}</small></div><span class="pc-pill blue">${pcMoney(g.demand)} rolls to plan</span></div><div class="pc-scroll"><table class="pc-table"><thead><tr><th>SO / Customer</th><th>Required</th><th class="num">Ordered</th><th class="num">Dispatched</th><th class="num">Open</th><th class="num">Already PR</th><th class="num">To Plan</th></tr></thead><tbody>${g.orders.map(o=>`<tr><td><b>${pcEsc(o.sourceSoNo)}</b><small>${pcEsc(o.customer)}</small></td><td>${pcEsc(o.requiredDate||'-')}</td><td class="num">${pcMoney(o.ordered)}</td><td class="num">${pcMoney(o.dispatched)}</td><td class="num">${pcMoney(o.grossOpen)}</td><td class="num">${pcMoney(o.allocated)}</td><td class="num"><b>${pcMoney(o.available)}</b></td></tr>`).join('')||'<tr><td colspan="7">No outstanding SO demand. Stock replenishment can still be planned.</td></tr>'}</tbody></table></div>`}
function pcIntelligenceHTML(g){
 const soOpen=g.orders.reduce((n,o)=>n+o.grossOpen,0);
 const allocated=g.orders.reduce((n,o)=>n+o.allocated,0);
 return `<div class="pc-card pc-simple-v1142"><h3>Production quantity planner</h3>
 <p class="pc-muted">See the current Sales Order requirement, then add extra production only if needed.</p>
 <div class="pc-simple-stats-v1142">
 <div><small>Current open Sales Orders</small><strong>${pcMoney(soOpen)} rolls</strong></div>
 <div><small>Already assigned to production</small><strong>${pcMoney(allocated)} rolls</strong></div>
 <div><small>Sales Orders still to produce</small><strong>${pcMoney(g.demand)} rolls</strong></div>
 <div><small>Existing production pipeline</small><strong>${pcMoney(g.pipeline)} rolls</strong></div>
 </div>
 <div class="pc-simple-note-v1142">Suggested new production: <b>${pcMoney(g.recommended)} rolls</b> (includes stock cover / safety stock / HO stock settings).</div>
 ${g.orders.length?`<details class="pc-order-details-v1142"><summary>View ${g.orders.length} current Sales Order line(s)</summary><div>${g.orders.map(o=>`<div><b>${pcEsc(o.sourceSoNo)}</b> • ${pcEsc(o.customer)} <span>Open ${pcMoney(o.grossOpen)} • Already assigned ${pcMoney(o.allocated)} • To plan ${pcMoney(o.available)}</span></div>`).join('')}</div></details>`:''}
 <div class="pc-simple-entry-v1142">
 <div class="field"><label>Sales Order quantity to include (rolls)</label><input id="pcSalesQty" type="number" readonly value="${g.demand}"></div>
 <div class="field"><label>Additional production required (rolls)</label><input id="pcExtraQty" type="number" min="0" step="1" value="${Math.max(0,g.recommended-g.demand)}" oninput="pcUpdateSimpleQtyV1142()"></div>
 </div>
 <div class="field"><label>Total requested production (rolls)</label><input id="pcQty" type="number" readonly value="${Math.max(g.demand,g.recommended)}"></div>
 <div class="field"><label>Reason for additional production / override</label><textarea id="pcOverride" placeholder="Explain why extra stock is required when it differs from the recommendation"></textarea></div>
 
 <div class="actions"><button class="btn primary" onclick="pcAddToBasket()" ${!pcHas('production_control_create')?'disabled':''}>Add item to request</button></div></div>`
}
window.pcUpdateSimpleQtyV1142=function(){
 const sales=Number(document.getElementById('pcSalesQty')?.value||0),extra=Number(document.getElementById('pcExtraQty')?.value||0);
 const el=document.getElementById('pcQty');if(el)el.value=sales+Math.max(0,extra);
}
window.pcSelectItem=function(v){pcPlannerItemKey=decodeURIComponent(v);pcRender()}
window.pcRemoveBasket=function(i){pcBasket.splice(i,1);pcRender()}
window.pcAddToBasket=function(){const g=pcGroup(pcPlannerItemKey);if(!g)return;const qty=pcNum(document.getElementById('pcQty')?.value),reason=String(document.getElementById('pcOverride')?.value||'').trim();const extra=pcNum(document.getElementById('pcExtraQty')?.value);if(!Number.isInteger(extra)||extra<0)return toast('Additional production must be zero or a positive whole number.');if(!Number.isInteger(qty)||qty<=0)return toast('Enter a positive whole quantity.');if(qty<g.demand)return toast('Quantity must cover linked SO demand.');if(Math.abs(qty-g.recommended)>.001&&!reason)return toast('Enter an override reason.');if(pcBasket.some(x=>x.itemKey===g.key))return toast('This item is already in the basket.');pcBasket.push({additionalQty:extra,itemKey:g.key,sourceItemId:g.sourceItemId,label:pcLineLabel(g),desc:g.desc,size:g.size,material:g.material,layout:g.layout,pcs:g.pcs,unit:g.unit,requestedQty:qty,soDemand:g.demand,cover:g.cover,safety:g.safety,stock:g.stock,pipeline:g.pipeline,recommended:g.recommended,overrideReason:reason,coverWeeks:g.coverWeeks,allocations:g.orders.filter(o=>o.available>0).map(o=>({source_so_id:o.sourceSoId,source_so_no:o.sourceSoNo,source_so_line_index:o.lineIndex,customer_name:o.customer,required_date:o.requiredDate,qty:o.available}))});pcRender();toast('Item added to request')}
window.pcSavePolicy=async function(){const g=pcGroup(pcPlannerItemKey);if(!g)return;try{await pcRpc('spgs_pc_upsert_item_policy',{p_item_key:g.key,p_source_item_id:g.sourceItemId||'',p_safety_stock_qty:pcNum(document.getElementById('pcSafety')?.value),p_available_stock_qty:pcNum(document.getElementById('pcStock')?.value),p_cover_weeks:pcNum(document.getElementById('pcCoverWeeks')?.value)||2,p_username:currentUser?.username||''});await pcRefresh(false);toast('Stock policy saved')}catch(e){console.error(e);toast(e.message)}}
window.pcSubmitRequest=async function(){
  const oldDispatchSnapshot=JSON.stringify([...pcOrdexaSent.entries()].sort());
  try{await pcCheckDispatchSafe()}catch(e){pcOrdexaReady=false;toast('Production blocked: '+e.message);return}
  if(pcBasket.length&&oldDispatchSnapshot!==JSON.stringify([...pcOrdexaSent.entries()].sort())){toast('Dispatch balances changed: rebuild production request basket before submitting.');pcBasket=[];pcRender();return}

  const role=String(currentUser?.role||'').toLowerCase();
  if(role==='manager')return toast('Managers cannot create Production Control requests.');
  if(!pcHas('production_control_create'))return requirePerm('production_control_create','submit Production Control requests');if(!pcBasket.length)return toast('Add at least one item.');const due=document.getElementById('pcDue')?.value;if(!due)return toast('Choose Required at HO date.');const needsManagerApproval=pcBasket.some(x=>pcNum(x.additionalQty)>0);const payload={approval_route:needsManagerApproval?'manager':'automatic',auto_approve_eligible:!needsManagerApproval,workspace:PC_WORKSPACE,required_date:due,material_mode:document.getElementById('pcMaterial')?.value||'Factory to arrange material',reason:String(document.getElementById('pcRequestReason')?.value||'').trim(),user:{username:currentUser?.username||'',display_name:currentUser?.display||currentUser?.username||''},lines:pcBasket.map(x=>({item_key:x.itemKey,source_item_id:x.sourceItemId,description:x.desc,size_label:x.size,material:x.material,layout:x.layout,pcs_per_roll:x.pcs,unit:x.unit,requested_qty:x.requestedQty,additional_production_qty:pcNum(x.additionalQty),so_demand_qty:x.soDemand,stock_cover_qty:x.cover,safety_stock_qty:x.safety,available_stock_qty:x.stock,pipeline_qty:x.pipeline,recommended_qty:x.recommended,override_reason:x.overrideReason,cover_weeks:x.coverWeeks,allocations:x.allocations}))};try{const r=await pcRpc('spgs_pc_create_request',{p_payload:payload});pcBasket=[];pcView='register';pcSelectedRequest=r?.id||'';await pcRefresh(false);const saved=pcCloud.requests.find(x=>x.id===(r?.id||''));const actual=saved?.status||r?.status||'Unknown';if(needsManagerApproval){toast(`${r?.request_no||'Production request'} submitted — ${actual}. Manager approval required.`)}else if(actual==='Approved'){toast(`${r?.request_no||'Production request'} automatically approved and released.`)}else{toast(`${r?.request_no||'Production request'} saved as ${actual}. Automatic approval requires Supabase spgs_pc_create_request support; no approval has been assumed.`)}}catch(e){console.error(e);toast(e.message)}}

function pcApprovalsHTML(){
  if(!pcHas('production_control_approve'))return '<div class="pc-card">You do not have approval permission.</div>';
  const rows=[...(pcCloud.requests||[])].filter(r=>r.status==='Pending Approval').sort((a,b)=>Date.parse(a.created_at||0)-Date.parse(b.created_at||0));
  const approved=(pcCloud.requests||[]).filter(r=>r.status==='Approved').length;
  const selected=rows.find(r=>r.id===pcSelectedRequest)||rows[0]||null;
  if(selected)pcSelectedRequest=selected.id;
  return `<div class="pc-card pc-approval-dashboard"><div class="pc-card-head"><div><h3>Manager approval queue</h3><p class="pc-muted">${rows.length} waiting for decision · ${approved} approved requests</p></div><button class="btn ghost sm" onclick="pcRefresh(true)">Refresh approvals</button></div>
   <div class="pc-approval-list">${rows.map(r=>{const lines=pcRequestLines(r.id);const qty=lines.reduce((n,l)=>n+pcNum(l.requested_qty),0);return `<div class="pc-approval-entry ${r.id===selected?.id?'selected':''}"><div><b>${pcEsc(r.request_no||r.id)}</b><small>${pcEsc(r.created_by_display||r.created_by||'Sales')} · Required ${pcEsc(r.required_date||'-')}</small><span>${lines.length} item(s) · ${pcMoney(qty)} rolls</span></div><button class="btn primary sm" onclick="pcOpenApproval('${r.id}')">Review request</button></div>`}).join('')||'<div class="pc-approval-empty">No requests waiting for manager approval.</div>'}</div></div>${selected?pcRequestDetailHTML(selected):''}`;
}
window.pcOpenApproval=function(id){pcSelectedRequest=id;pcView='approvals';pcRender();document.querySelector('#pcBody .pc-detail')?.scrollIntoView({behavior:'smooth',block:'start'});};
function pcRegisterHTML(){
  const role=String(currentUser?.role||'').toLowerCase();
  const rows=[...(pcCloud.requests||[])].sort((a,b)=>{
    if(role==='manager'){
      const ap=a.status==='Pending Approval'?0:1;
      const bp=b.status==='Pending Approval'?0:1;
      if(ap!==bp)return ap-bp;
    }
    return Date.parse(b.created_at||0)-Date.parse(a.created_at||0);
  });
  const selected=rows.find(x=>x.id===pcSelectedRequest)||rows[0];if(selected&&!pcSelectedRequest)pcSelectedRequest=selected.id;
  return `<div class="pc-card"><div class="pc-card-head"><h3>Production request register</h3><span class="pc-pill">${rows.length} request(s)</span></div><div class="pc-scroll"><table class="pc-table"><thead><tr><th>Request</th><th>Required</th><th>Items / Rolls</th><th>Status</th><th>Created By</th><th></th></tr></thead><tbody>${rows.map(r=>{const ls=pcRequestLines(r.id);return `<tr><td><b>${pcEsc(r.request_no)}</b><small>${new Date(r.created_at).toLocaleString()}</small></td><td>${pcEsc(r.required_date||'-')}</td><td>${ls.length} item(s) • ${pcMoney(ls.reduce((n,l)=>n+pcNum(l.requested_qty),0))}</td><td><span class="pc-status ${String(r.status).toLowerCase().replace(/\s+/g,'-')}">${pcEsc(r.status)}</span></td><td>${pcEsc(r.created_by_display||r.created_by)}</td><td><button class="btn ghost sm" onclick="pcOpenRequest('${r.id}')">Review →</button></td></tr>`}).join('')||'<tr><td colspan="6">No Production Control requests yet.</td></tr>'}</tbody></table></div></div>${selected?pcRequestDetailHTML(selected):''}`;
}
window.pcOpenRequest=function(id){pcSelectedRequest=id;pcRender()}
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
function pcDemandHTML(){const groups=pcDemandGroups();return `<div class="pc-card"><div class="pc-card-head"><div><h3>Live Sales Order production demand</h3><p>Ordered − dispatched − cancelled − quantities reserved by open Production Control requests.</p></div><button class="btn navy sm" type="button" onclick="pcDemandProductionPDFV1128()">Download Demand / Cut PDF</button></div><div class="pc-scroll"><table class="pc-table"><thead><tr><th>Item</th><th class="num">SO Demand</th><th class="num">JBR Cut</th><th class="num">+ Extra / Balance</th><th class="num">Cover</th><th class="num">Safety</th><th class="num">HO Stock</th><th class="num">Pipeline</th><th class="num">Recommended</th></tr></thead><tbody>${groups.map(g=>{const requested=(state.productionRequests||[]).filter(r=>pcLineKey(r)===g.key).reduce((n,r)=>n+pcNum(r.requestQty),0);const cut=pcNum(window.jbrCutForProductV1121?.(g.key)||0);const diff=cut-requested;return `<tr><td><b>${pcEsc(pcLineLabel(g))}</b><small>${g.orders.length} open SO line(s) • ${((state.productionRequests||[]).filter(r=>pcLineKey(r)===g.key)).length} production job(s)</small></td><td class="num">${pcMoney(g.demand)}</td><td class="num"><b>${pcMoney(cut)}</b></td><td class="num ${diff>0?'pc-plus-v1128':''}">${diff>0?`+${pcMoney(diff)} extra`:diff<0?`${pcMoney(Math.abs(diff))} to cut`:'0'}</td><td class="num">${pcMoney(g.cover)}</td><td class="num">${pcMoney(g.safety)}</td><td class="num">${pcMoney(g.stock)}</td><td class="num">${pcMoney(g.pipeline)}</td><td class="num"><b>${pcMoney(g.recommended)}</b></td></tr>`}).join('')||'<tr><td colspan="9">No current Sales Order demand.</td></tr>'}</tbody></table></div></div>`}
const showBase=window.showView;
window.showView=function(id){if(id==='productioncontrol'&&!pcHas('production_control_view'))return requirePerm('production_control_view','open Production Control');const r=showBase.apply(this,arguments);if(id==='productioncontrol')pcRefresh(false);return r};
try{showView=window.showView}catch(_){}
pcInstallUI();
try{renderUserPrivilegeEditor(null)}catch(_){}
})();
