/* Admin ERP lookup for the Approved Prices Sales Order customer selector.
   Uses the same ERP search endpoint as Manual Invoice, but does not
   silently create a customer with no approved PI / change locked prices. */
(function(){
  'use strict';
  let running=false;
  let searchToken=0;
  function node(id){return document.getElementById(id)}
  function safe(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function admin(){return typeof currentUser!=='undefined' && currentUser?.role==='admin'}
  function show(){const x=node('bpSoErpLinkV20261109');if(x)x.style.display=admin()?'':'none'}
  document.addEventListener('click',()=>setTimeout(show,0),true);
  document.addEventListener('focusin',show,true);
  show();
  window.bpSoSearchERPCustomersV20261109=async function(){
    if(!admin())return toast('ERP customer search is available to admins only');
    const q=(node('bpSoErpSearchV20261109')?.value||'').trim();
    const box=node('bpSoErpMatchesV20261109');if(!box)return;
    if(q.length<2){box.textContent='Enter at least two characters.';return}
    if(running)return;
    const seq=++searchToken;running=true;box.textContent='Searching ERP customers…';
    try{
      const key=String(localStorage.getItem('spgs_supabase_browser_key_v1')||'').trim();
      if(!key)throw Error('Supabase browser key not configured');
      const res=await fetch('https://qyxgamverzdmhtvezbft.supabase.co/functions/v1/erp-customer-search',{
        method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+key},
        body:JSON.stringify({action:'search',q,limit:25})
      });
      const result=await res.json();
      if(!res.ok || result?.ok===false)throw Error(result?.error||result?.message||'ERP service unavailable');
      if(seq!==searchToken)return;
      const rows=Array.isArray(result?.customers)?result.customers:[];
      const selector=node('bpSoCustomerV1030');
      const eligible=[...selector?.options||[]].map(o=>({id:o.value,label:o.textContent||''}));
      const customers=typeof state!=='undefined'?state.customers||[]:[];
      const normalized=x=>String(x||'').trim().toLocaleLowerCase();
      box.innerHTML=rows.length?rows.map((c,i)=>{
        const local=customers.find(x=>normalized(x.name)===normalized(c.name) || (c.phone&&String(x.phone||'').replace(/\D/g,'')===String(c.phone).replace(/\D/g,'')));
        const allowed=local && eligible.some(x=>x.id===local.id);
        return `<div style="padding:7px;border-bottom:1px solid #dde5e8"><b>${safe(c.name)}</b> <small>${safe(c.phone||'')} · ${safe(c.code||'')}</small> ${allowed?`<button type="button" class="btn primary sm" onclick="bpSoChooseERPCustomerV20261109('${safe(local.id)}')">Select linked customer</button>`:'<small style="color:#a36518">Not linked to an approved PI in SPGS</small>'}</div>`;
      }).join(''):'No matching ERP customers found.';
    }catch(e){box.textContent='ERP lookup failed: '+(e?.message||e)}finally{running=false}
  };
  window.bpSoChooseERPCustomerV20261109=function(id){
    if(!admin())return;
    const select=node('bpSoCustomerV1030');if(!select||!Array.from(select.options).some(o=>o.value===id))return;
    if(select.disabled)return toast('Clear Sales Order items before changing its customer');
    select.value=id;window.bpSoCustomerChangedV1030?.();
    const box=node('bpSoErpMatchesV20261109');if(box)box.textContent='ERP-matched approved-PI customer selected.';
  };
})();
