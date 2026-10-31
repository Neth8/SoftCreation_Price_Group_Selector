/* Sales Orders list: read-only cancelled status presentation, no workflow changes. */
(function(){
'use strict';
let lastSync=0,working=false;
const cancelled=so=>!!(so?.cancelledAt||so?.cancelled_at||['cancelled','canceled'].includes(String(so?.status||so?.order_status||'').toLowerCase()));
function decorate(){
 const host=document.getElementById('soList91');if(!host)return;
 const orders=new Map((state.salesOrders||[]).map(o=>[String(o.soNo||''),o]));
 host.querySelectorAll('table tbody tr').forEach(tr=>{
   const first=tr.querySelector('td:first-child'),number=first?.querySelector('b')?.textContent?.trim();
   const so=orders.get(number);if(!first||!so)return;
   let badge=first.querySelector('.sc-so-cancel-badge-v54');
   if(!cancelled(so)){badge?.remove();tr.classList.remove('sc-so-cancelled-row-v54');return;}
   if(!badge){badge=document.createElement('span');badge.className='sc-so-cancel-badge-v54';badge.textContent='CANCELLED';first.appendChild(badge);}
   tr.classList.add('sc-so-cancelled-row-v54');
   badge.title=[so.cancellationReason?'Reason: '+so.cancellationReason:'',so.cancelledBy?'Cancelled by: '+so.cancelledBy:''].filter(Boolean).join('\n');
   const cells=tr.querySelectorAll('td');
   const statusCell=cells[4];
   if(statusCell&&!statusCell.querySelector('.sc-so-cancelled-status-v54')){
     const label=document.createElement('div');label.className='sc-so-cancelled-status-v54';label.textContent='Order cancelled';statusCell.prepend(label);
   }
   tr.querySelector('.spgs-live-chip-slot')?.remove();
 });
}
async function sync(){
 if(working||document.hidden||!document.querySelector('#salesorders.active')||typeof window.spgsReadCancelledSOStatusesV54!=='function')return;
 if(Date.now()-lastSync<15000)return;
 working=true;lastSync=Date.now();
 try{
   const rows=await window.spgsReadCancelledSOStatusesV54();
   const byId=new Map(rows.map(r=>[String(r.source_so_id),r]));let changed=false;
   for(const so of state.salesOrders||[]){const row=byId.get(String(so.id));if(!row||cancelled(so))continue;so.cancelledAt=row.cancelled_at;so.status='Cancelled';changed=true;}
   if(changed){if(typeof window.saveState==='function')window.saveState();if(typeof window.renderSalesOrders91==='function')window.renderSalesOrders91();}
 }catch(e){console.warn('Sales Orders cancellation status refresh unavailable',e?.message||e)}
 finally{working=false;decorate();}
}
function init(){
 if(window.__scCancelledListV54)return;window.__scCancelledListV54=true;
 const orig=window.renderSalesOrders91;if(typeof orig==='function'){
   window.renderSalesOrders91=function(){const result=orig.apply(this,arguments);decorate();void sync();return result;};
   try{renderSalesOrders91=window.renderSalesOrders91}catch(_){}
 }
 document.querySelector('[data-view="salesorders"]')?.addEventListener('click',()=>setTimeout(()=>{decorate();void sync()},150));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync()});
 setInterval(()=>void sync(),15000);
 decorate();void sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
