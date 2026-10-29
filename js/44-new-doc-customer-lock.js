
/* =====================================================================
   V1.1.19 — New Document combined customer search
   SoftCreation System Customer Master + Brylix ERP customers
   ===================================================================== */
(function(){
  'use strict';

  const ERP_CUSTOMER_FUNCTION_V1119 =
    'https://qyxgamverzdmhtvezbft.supabase.co/functions/v1/erp-customer-search';

  let timerV1119=null;
  let seqV1119=0;
  let resultsV1119=[];
  let activeV1119=-1;
  let selectedCustomerV1119=false;
  let selectingV1119=false;

  function el(id){return document.getElementById(id)}
  function e(v){return typeof esc==='function'?esc(String(v??'')):String(v??'')}

  function browserKeyV1119(){
    const key=String(
      localStorage.getItem('spgs_supabase_browser_key_v1')||''
    ).trim();
    if(!key)throw new Error('Supabase browser key is not configured on this device.');
    return key;
  }

  async function erpCallV1119(payload){
    const key=browserKeyV1119();
    const res=await fetch(ERP_CUSTOMER_FUNCTION_V1119,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        apikey:key,
        Authorization:'Bearer '+key
      },
      body:JSON.stringify(payload)
    });
    const raw=await res.text();
    let data=null;
    try{data=raw?JSON.parse(raw):null}catch(_){data=raw}
    if(!res.ok||data?.ok===false){
      throw new Error(data?.error||data?.message||raw||`ERP customer lookup HTTP ${res.status}`);
    }
    return data;
  }

  function localMatchesV1119(q){
    const s=String(q||'').trim().toLowerCase();
    const rows=(state.customers||[]).filter(c=>{
      if(c.erpSource==='brylix')return false; /* ERP copies appear in ERP section */
      if(!s)return true;
      return [
        c.name,c.phone,c.email,c.contactPerson,c.vat
      ].join(' ').toLowerCase().includes(s);
    });
    return rows.slice(0,10).map(c=>({
      source:'system',
      id:c.id,
      name:c.name||'',
      phone:c.phone||'',
      email:c.email||'',
      code:'',
      raw:c
    }));
  }

  function renderSuggestionsV1119(localRows,erpRows,message=''){
    const box=el('customerSuggestionsV1119');
    if(!box)return;

    const combined=[
      ...localRows,
      ...erpRows.map(c=>({
        source:'erp',
        id:String(c.id||''),
        name:c.name||'',
        phone:c.phone||'',
        email:c.email||'',
        code:c.code||c.customer_id||'',
        raw:c
      }))
    ];

    resultsV1119=combined;
    activeV1119=-1;

    let html='';

    if(localRows.length){
      html+=`<div class="sc-customer-group-v1119">SOFTCREATION SYSTEM</div>`;
      html+=localRows.map((c,i)=>`
        <button type="button" class="sc-customer-option-v1119" data-i="${i}" onclick="scSelectCustomerV1119(${i})">
          <span class="sc-customer-badge-v1119 system">SYSTEM</span>
          <b>${e(c.name||'-')}</b>
          <small>${e(c.phone||'No phone')}${c.email?' • '+e(c.email):''}</small>
        </button>`).join('');
    }

    if(erpRows.length){
      const offset=localRows.length;
      html+=`<div class="sc-customer-group-v1119">BRYLIX ERP — LIVE</div>`;
      html+=erpRows.map((c,j)=>`
        <button type="button" class="sc-customer-option-v1119" data-i="${offset+j}" onclick="scSelectCustomerV1119(${offset+j})">
          <span class="sc-customer-badge-v1119 erp">ERP</span>
          <b>${e(c.name||'-')}</b>
          <small>${e(c.phone||'No phone')}${c.email?' • '+e(c.email):''}${c.code?' • '+e(c.code):''}</small>
        </button>`).join('');
    }

    if(!html){
      html=`<div class="sc-customer-message-v1119">${e(message||'No matching customer found.')}</div>`;
    }

    box.innerHTML=html;
    box.classList.add('show');
  }

  async function searchV1119(q){
    const thisSeq=++seqV1119;
    const localRows=localMatchesV1119(q);

    if(String(q||'').trim().length<2){
      renderSuggestionsV1119(localRows,[]);
      return;
    }

    renderSuggestionsV1119(
      localRows,
      [],
      'Searching Brylix ERP...'
    );

    try{
      const r=await erpCallV1119({
        action:'search',
        q:String(q||'').trim(),
        limit:12
      });

      if(thisSeq!==seqV1119)return;

      const erpRows=Array.isArray(r?.customers)?r.customers:[];
      renderSuggestionsV1119(localRows,erpRows);
    }catch(err){
      console.error('Brylix ERP customer search failed',err);
      if(thisSeq!==seqV1119)return;
      renderSuggestionsV1119(
        localRows,
        [],
        localRows.length
          ? ''
          : `ERP lookup unavailable: ${err.message||err}`
      );
    }
  }

  window.scCustomerSearchTypeV1119=function(value){
    selectedCustomerV1119=false;
    clearTimeout(timerV1119);
    ++seqV1119; // invalidate earlier ERP responses immediately
    timerV1119=setTimeout(()=>searchV1119(value),320);
  };

  window.scCustomerSearchFocusV1119=function(){
    // Do not run a network search merely by focusing an already selected name.
    if(selectedCustomerV1119)return;
    const value=el('customerSearchV1119')?.value||'';
    renderSuggestionsV1119(localMatchesV1119(value),[]);
  };

  function highlightV1119(){
    document.querySelectorAll('#customerSuggestionsV1119 .sc-customer-option-v1119')
      .forEach((b,i)=>b.classList.toggle('active',i===activeV1119));
  }

  window.scCustomerSearchKeyV1119=function(ev){
    if(!resultsV1119.length)return;
    if(ev.key==='ArrowDown'){
      ev.preventDefault();
      activeV1119=Math.min(resultsV1119.length-1,activeV1119+1);
      highlightV1119();
    }else if(ev.key==='ArrowUp'){
      ev.preventDefault();
      activeV1119=Math.max(0,activeV1119-1);
      highlightV1119();
    }else if(ev.key==='Enter'&&activeV1119>=0){
      ev.preventDefault();
      window.scSelectCustomerV1119(activeV1119);
    }else if(ev.key==='Escape'){
      el('customerSuggestionsV1119')?.classList.remove('show');
    }
  };

  async function firstErpAddressV1119(customerId){
    try{
      const r=await erpCallV1119({
        action:'addresses',
        customer_id:customerId
      });
      const rows=Array.isArray(r?.addresses)?r.addresses:[];
      const a=rows[0];
      if(!a)return '';
      return [
        a.address,
        a.address_line_1,
        a.address_line_2,
        a.city,
        a.province,
        a.country,
        a.postal_code
      ].filter(Boolean).join(', ');
    }catch(err){
      console.warn('ERP customer address lookup failed',err);
      return '';
    }
  }

  function findExistingErpCustomerV1119(c){
    return (state.customers||[]).find(x=>
      String(x.erpCustomerId||'')===String(c.id||'') ||
      (
        c.code &&
        String(x.erpCustomerCode||'')===String(c.code)
      )
    );
  }

  window.scSelectCustomerV1119=async function(index){
    const row=resultsV1119[index];
    if(!row)return;
    clearTimeout(timerV1119);
    ++seqV1119; // stop stale searches from rewriting the suggestions
    selectingV1119=true;
    selectedCustomerV1119=true;

    const input=el('customerSearchV1119');
    const select=el('customerSelect');
    const source=el('customerSourceV1119');

    if(row.source==='system'){
      if(input)input.value=row.name||'';

if(select){
  refreshCustomerPick();
  select.value=String(row.id);
  select.dispatchEvent(new Event('change',{bubbles:true}));
  fillCustomer(String(row.id));
}

      if(source){
        source.innerHTML=`<span class="system">SYSTEM CUSTOMER</span>${e(row.phone||'')}`;
      }
      el('customerSuggestionsV1119')?.classList.remove('show');
      selectingV1119=false;
      return;
    }

    const c=row.raw||{};
    if(input)input.value=row.name||''; // selection is immediate; address loads separately
    const address=await firstErpAddressV1119(c.id);

    let local=findExistingErpCustomerV1119(c);

    if(!local){
      local={
        id:`erp_customer_${String(c.id||Date.now()).replace(/[^a-zA-Z0-9_-]/g,'_')}`,
        name:c.name||'ERP Customer',
        contactPerson:'',
        phone:c.phone||'',
        email:c.email||'',
        address:address||'',
        delivery:address||'',
        map:'',
        vat:c.tin||'',
        vatEnabled:false,
        paymentMode:'credit',
        creditDays:0,
        creditLimit:0,
        erpSource:'brylix',
        erpCustomerId:String(c.id||''),
        erpCustomerCode:String(c.code||c.customer_id||''),
        erpLinkedAt:new Date().toISOString(),
        ownerUser:currentUser?.username||'',
        active:true
      };
      state.customers=state.customers||[];
      state.customers.push(local);
    }else{
      local.name=c.name||local.name;
      local.phone=c.phone||local.phone||'';
      local.email=c.email||local.email||'';
      local.address=address||local.address||'';
      local.delivery=address||local.delivery||local.address||'';
      local.erpSource='brylix';
      local.erpCustomerId=String(c.id||local.erpCustomerId||'');
      local.erpCustomerCode=String(c.code||c.customer_id||local.erpCustomerCode||'');
      local.erpLinkedAt=new Date().toISOString();
      // Claim only unowned records when explicitly selected by this user.
      // Never take ownership away from another user.
      if(!local.ownerUser)local.ownerUser=currentUser?.username||'';
      if(currentUser?.username && local.ownerUser!==currentUser.username){
        local.sharedWith=[...new Set([...(local.sharedWith||[]),currentUser.username])];
      }
    }

    /*
      Refresh the hidden native customer selector so every existing
      quotation/PI/customer-price function continues to use the same
      customerSelect ID and state.customers contract.
    */
    try{refreshCustomerPick(true)}catch(_){
      if(select){
        select.innerHTML='<option value="">-- Select customer --</option>'+
          (state.customers||[]).map(x=>`<option value="${e(x.id)}">${e(x.name)}</option>`).join('');
      }
    }
if(select){
  select.value=String(local.id);
  select.dispatchEvent(new Event('change',{bubbles:true}));
  fillCustomer(String(local.id));
}
    if(input)input.value=local.name||'';

    if(source){
      source.innerHTML=
        `<span class="erp">BRYLIX ERP CUSTOMER</span>`+
        `ID ${e(c.id||'-')}${local.erpCustomerCode?' • '+e(local.erpCustomerCode):''}`;
    }

    try{saveState()}catch(_){}

    el('customerSuggestionsV1119')?.classList.remove('show');
    selectingV1119=false;
    try{renderCurrent()}catch(_){}
  };

  function syncSearchFromNativeV1119(){
    const select=el('customerSelect');
    const input=el('customerSearchV1119');
    const source=el('customerSourceV1119');
    if(!select||!input||selectingV1119)return;

    const c=(state.customers||[]).find(x=>x.id===select.value);

    if(!c){
      // A refresh may temporarily rebuild the hidden selector. Do not erase
      // the visible selected name during this transitional state.
      if(!selectedCustomerV1119 && !input.matches(':focus')){
        if(!state.current?.customerId)input.value='';
        if(source)source.innerHTML='';
      }
      return;
    }

    input.value=c.name||'';

    if(source){
      source.innerHTML=c.erpSource==='brylix'
        ? `<span class="erp">BRYLIX ERP CUSTOMER</span>ID ${e(c.erpCustomerId||'-')}${c.erpCustomerCode?' • '+e(c.erpCustomerCode):''}`
        : `<span class="system">SYSTEM CUSTOMER</span>${e(c.phone||'')}`;
    }
  }

  /* Keep the visible search field synchronized with old lifecycle code. */
  if(typeof window.refreshCustomerPick==='function'){
    const base=window.refreshCustomerPick;
    window.refreshCustomerPick=function(){
      const r=base.apply(this,arguments);
      if(!selectedCustomerV1119)syncSearchFromNativeV1119();
      return r;
    };
    try{refreshCustomerPick=window.refreshCustomerPick}catch(_){}
  }

  if(typeof window.fillCustomer==='function'){
    const base=window.fillCustomer;
    window.fillCustomer=function(){
      const r=base.apply(this,arguments);
      syncSearchFromNativeV1119();
      return r;
    };
    try{fillCustomer=window.fillCustomer}catch(_){}
  }

  if(typeof window.newDocument==='function'){
    const base=window.newDocument;
    window.newDocument=function(){
      selectedCustomerV1119=false;
      const r=base.apply(this,arguments);
      setTimeout(syncSearchFromNativeV1119,0);
      return r;
    };
    try{newDocument=window.newDocument}catch(_){}
  }

  if(typeof window.openDocument==='function'){
    const base=window.openDocument;
    window.openDocument=function(){
      const r=base.apply(this,arguments);
      setTimeout(syncSearchFromNativeV1119,0);
      return r;
    };
    try{openDocument=window.openDocument}catch(_){}
  }

  document.addEventListener('click',ev=>{
    const wrap=ev.target.closest?.('.sc-customer-search-wrap-v1119');
    if(!wrap)el('customerSuggestionsV1119')?.classList.remove('show');
  });

  setTimeout(syncSearchFromNativeV1119,0);
})();
