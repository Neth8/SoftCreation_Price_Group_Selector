/* Live-safe presentation guards. No login, DB, production, pricing or print implementations changed. */
(function(){'use strict';
const get=id=>document.getElementById(id);
window.scSOIsCancelledV57=function(so){return !!(so&&(so.cancelledAt||so.cancelled_at||String(so.status||so.order_status||'').toLowerCase().match(/^cancelled$|^canceled$/)))};
window.scSOViewOnlyV57=function(soId){
 const so=((typeof state!=='undefined'?state.salesOrders:[])||[]).find(x=>String(x.id)===String(soId));
 if(!so)return;
 if(typeof window.bpSoViewOrderV1030==='function')return window.bpSoViewOrderV1030(soId);
 if(typeof window.toast==='function')window.toast('Cancelled Sales Order — view only.');
};
function enforceList(){
 const host=get('soList91');if(!host)return;
 const byNo=new Map(((typeof state!=='undefined'?state.salesOrders:[])||[]).map(x=>[String(x.soNo||''),x]));
 host.querySelectorAll('tbody tr').forEach(tr=>{
  const so=byNo.get(tr.querySelector('td:first-child b')?.textContent?.trim());if(!window.scSOIsCancelledV57(so))return;
  const cells=tr.querySelectorAll('td');
  if(cells[5])cells[5].innerHTML='<span class="sc-recovered-lock">Cancelled · No fulfilment</span>';
  if(cells[6]){
   const id=String(so.id||'').replace(/[^a-zA-Z0-9_-]/g,'');
   cells[6].innerHTML='<button type="button" class="btn ghost sm" data-sc-view-cancel="'+id+'">View</button>';
   cells[6].querySelector('button')?.addEventListener('click',()=>window.scSOViewOnlyV57(so.id));
  }
 });
}
function positionDashboard(){
 const dash=get('dashboard'),cards=dash?.querySelector(':scope > .cards');if(!cards)return;
 const process=get('scDashboardProcessCharts'),bi=get('scBIPanel');
 // Both BI groups stay immediately after summary cards, before report and quick start.
 let anchor=cards;
 for(const node of [process,bi]){if(node&&node.parentElement===dash){anchor.insertAdjacentElement('afterend',node);anchor=node;}}
}
function init(){
 positionDashboard();enforceList();
 // Existing modules render these blocks later; watch the dashboard only for layout placement.
 const dash=get('dashboard');if(dash&&typeof MutationObserver!=='undefined'){
  let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;positionDashboard()})});
  observer.observe(dash,{childList:true});
 }
 const list=get('soList91');if(list&&typeof MutationObserver!=='undefined'){
  let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;enforceList()})});
  observer.observe(list,{childList:true,subtree:false});
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
