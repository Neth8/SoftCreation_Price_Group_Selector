
/* Stores-origin Sales Orders: independent read-only listing; NO state mutation or production handoff. */
(function(){
 'use strict';
 /* Original Stores REST reader disabled: this view uses RLS-protected tables and returns HTTP 403. */
 return;
 if(window.__scStoresReadOnlyV4)return;window.__scStoresReadOnlyV4=true;
 const el=id=>document.getElementById(id);
 const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let rows=[],loaded=false,busy=false,readError='',lastRead=0,selectedId='';
 function authorized(row){
   if(typeof currentUser==='undefined'||!currentUser)return false;
   if(currentUser.role==='admin')return true;
   const user=String(currentUser.username||'');
   if(user&&row.created_by_username===user)return true;
   return false; // Non-admin query is also server-filtered by created_by_username.
 }
 function visible(){return el('salesorders')?.classList.contains('active')&&!el('loginScreen')?.offsetParent;}
 function ensure(){
   const list=el('soList91');if(!list||el('scStoresPanelV4'))return;
   const section=document.createElement('section');section.id='scStoresPanelV4';section.className='sc-stores-ro';
   section.innerHTML='<div class="sc-stores-head"><div><strong>Original / Stores Sales Orders</strong><span>Existing PI-generated orders · view only · no production handoff</span></div><button class="btn ghost sm" type="button" id="scStoresRefreshV4">Refresh Stores Orders</button></div><div id="scStoresStatusV4" class="small"></div><div id="scStoresListV4"></div><div id="scStoresDetailsV4" hidden></div>';
   list.insertAdjacentElement('afterend',section);
   el('scStoresRefreshV4').addEventListener('click',()=>refresh(true));
 }
 function render(){
   ensure();const host=el('scStoresListV4'),status=el('scStoresStatusV4');if(!host||!status)return;
   const search=(el('soSearch91')?.value||'').trim().toLowerCase();
   const filtered=rows.filter(authorized).filter(r=>[r.order_no,r.pi_no,r.customer_name,r.po_ref].join(' ').toLowerCase().includes(search));
   status.textContent=busy?'Loading Stores orders…':readError?'Stores orders unavailable: '+readError:loaded?filtered.length+' Stores order(s) shown · read only':'Stores orders not loaded yet';
   host.innerHTML=filtered.length?'<div class="sc-stores-scroll"><table class="table"><thead><tr><th>Stores Order</th><th>Customer / PI</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>'+filtered.map(r=>'<tr><td><b>'+safe(r.order_no)+'</b><div class="small">'+safe((r.created_at||'').slice(0,10))+'</div></td><td><b>'+safe(r.customer_name)+'</b><div class="small">PI: '+safe(r.pi_no)+'</div></td><td>LKR '+(Number(r.grand_total)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'</td><td><span class="sc-stores-tag">'+safe(r.order_status||'unknown')+'</span></td><td><button type="button" class="btn ghost sm scStoresOpenV4" data-id="'+safe(r.id)+'">View Details</button></td></tr>').join('')+'</tbody></table></div>':(!busy&&!readError?'<div class="empty">No matching original / Stores Sales Orders.</div>':'');
   host.querySelectorAll('.scStoresOpenV4').forEach(btn=>btn.addEventListener('click',()=>details(btn.dataset.id)));
 }
 async function details(id){
   const r=rows.find(x=>x.id===id&&authorized(x)),host=el('scStoresDetailsV4');if(!r||!host)return;
   selectedId=id;host.hidden=false;host.textContent='Loading order lines…';
   try{
     const lines=await window.spgsReadStoresOrderLinesV4(id);if(selectedId!==id)return;
     host.innerHTML='<div class="sc-stores-details-head"><strong>'+safe(r.order_no)+' — '+safe(r.customer_name)+'</strong><button class="btn ghost sm" id="scStoresCloseV4" type="button">Close</button></div><div class="small">Source PI: '+safe(r.pi_no||'-')+' · Original order status: '+safe(r.order_status||'-')+' · Read-only (not a factory fulfilment plan)</div><div class="sc-stores-scroll"><table class="table"><thead><tr><th>Item</th><th>Size / Material</th><th>Qty</th><th>Unit price</th></tr></thead><tbody>'+lines.map(l=>'<tr><td>'+safe(l.description)+'</td><td>'+safe([l.size_label,l.material,l.layout,l.pcs_per_roll?l.pcs_per_roll+' pcs/roll':''].filter(Boolean).join(' · '))+'</td><td>'+safe(l.qty)+' '+safe(l.unit)+'</td><td>'+safe(l.unit_price)+'</td></tr>').join('')+'</tbody></table></div>';
     el('scStoresCloseV4')?.addEventListener('click',()=>{selectedId='';host.hidden=true});
   }catch(e){host.textContent='Unable to load item details: '+String(e?.message||e)}
 }
 async function refresh(force){
   if(busy||!visible())return;if(!force&&Date.now()-lastRead<12000){render();return;}
   if(typeof window.spgsReadStoresOrdersV4!=='function'){readError='Supabase client not ready';render();return;}
   busy=true;readError='';render();
   try{const user=typeof currentUser==='undefined'?null:currentUser;
     if(!user)throw new Error('Please sign in');
     const fresh=await window.spgsReadStoresOrdersV4(user.role==='admin'?'':String(user.username||'__no_user__'));rows=fresh;loaded=true;lastRead=Date.now();}
   catch(e){readError=String(e?.message||e);rows=[];loaded=false;console.warn('Stores Orders read-only load failed',e)}
   finally{busy=false;render()}
 }
 function boot(){ensure();
   el('soSearch91')?.addEventListener('input',render);
   document.querySelector('[data-view="salesorders"]')?.addEventListener('click',()=>setTimeout(()=>refresh(true),150));
   el('appRefreshBtnV1079')?.addEventListener('click',()=>setTimeout(()=>refresh(true),400));
   document.addEventListener('visibilitychange',()=>{if(!document.hidden&&visible())void refresh(true)});
   setInterval(()=>{if(!document.hidden&&visible())void refresh(false)},12000);
   if(visible())void refresh(true);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
