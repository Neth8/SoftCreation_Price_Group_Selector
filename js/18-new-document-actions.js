
/* =========================================================
   v1.0.26 — NEW DOCUMENT ACTIONS + BR GATE FOR PRO FORMA
   ---------------------------------------------------------
   - Restores Add Ribbon / Paper in New Document.
   - Keeps Add Device usable in Device Quotations.
   - Customer Master can be saved without BR.
   - A PI is allowed when the customer either has a saved BR
     in Supabase OR is explicitly marked as currently having no BR.
   ========================================================= */
(function(){
  'use strict';

  function customerHasSavedBRV1026(customer){
    const d=customer?.brDocument;
    return !!(
      d &&
      typeof d==='object' &&
      d.storage==='supabase' &&
      d.path
    );
  }

  function customerHasTemporaryNoBRV1029(customer){
    return customer?.brNoCertificate===true;
  }

  function customerCanProceedToPIV1029(customer){
    return !!(
      customerHasSavedBRV1026(customer) ||
      customerHasTemporaryNoBRV1029(customer)
    );
  }

  function selectedCustomerV1026(id=''){
    const customerId=id||$('customerSelect')?.value||state.current?.customerId||'';
    return (state.customers||[]).find(c=>c.id===customerId)||null;
  }

  function brRequiredMessageV1026(customer,action='create this Pro Forma Invoice'){
    return `BR STATUS REQUIRED\n\nCustomer:\n${customer?.name||'Selected Customer'}\n\nBefore you can ${action}, either:\n\n1. Upload and save the Business Registration (BR) certificate, OR\n2. Open Customer Master and turn on "Customer does not currently have a BR certificate", then save the customer.\n\nCustomers explicitly marked as currently having no BR are allowed to proceed to Pro Forma Invoice until the BR becomes available.`;
  }

  window.requireCustomerBRForPIV1026=function(customer,action='create this Pro Forma Invoice'){
    if(!customer)return true; /* Existing customer-selection validation handles this. */

    if(customerCanProceedToPIV1029(customer)){
      return true;
    }

    const short=`PI blocked — add BR or mark ${customer.name||'this customer'} as currently having no BR`;
    if(typeof toast==='function')toast(short);
    alert(brRequiredMessageV1026(customer,action));
    return false;
  };

  window.updatePIBRRequirementNoticeV1026=function(){
    const box=$('piBrRequirementNotice');
    if(!box)return;

    const isPI=$('docType')?.value==='PI';
    if(!isPI){
      box.style.display='none';
      box.className='pi-br-requirement-notice';
      box.textContent='';
      return;
    }

    const customer=selectedCustomerV1026();
    box.style.display='block';

    if(!customer){
      box.className='pi-br-requirement-notice neutral';
      box.innerHTML='<b>BR status:</b> Select a customer. The customer must either have a saved BR certificate or be explicitly marked as currently having no BR.';
      return;
    }

    if(customerHasSavedBRV1026(customer)){
      box.className='pi-br-requirement-notice ok';
      box.innerHTML=`<b>BR verified:</b> ${esc(customer.name)} has a saved BR certificate. Pro Forma Invoice can proceed.`;
    }else if(customerHasTemporaryNoBRV1029(customer)){
      box.className='pi-br-requirement-notice neutral';
      box.innerHTML=`<b>Temporary No-BR status:</b> ${esc(customer.name)} is marked as currently having no BR certificate. Pro Forma Invoice is allowed. Upload and save the BR when it becomes available.`;
    }else{
      box.className='pi-br-requirement-notice blocked';
      box.innerHTML=`<b>BR status required before Pro Forma:</b> ${esc(customer.name)} has no saved BR and is not marked as currently having no BR. Upload the BR or update the customer No-BR status before creating/saving this PI.`;
    }
  };

  /* Customer selection / document mode feedback. */
  const fillCustomerV1026=window.fillCustomer;
  if(typeof fillCustomerV1026==='function'){
    window.fillCustomer=function(){
      const r=fillCustomerV1026.apply(this,arguments);
      updatePIBRRequirementNoticeV1026();
      return r;
    };
    try{fillCustomer=window.fillCustomer}catch(_){}
  }

  const updateEditorVisibilityV1026=window.updateEditorVisibility;
  if(typeof updateEditorVisibilityV1026==='function'){
    window.updateEditorVisibility=function(){
      const r=updateEditorVisibilityV1026.apply(this,arguments);
      updatePIBRRequirementNoticeV1026();
      return r;
    };
    try{updateEditorVisibility=window.updateEditorVisibility}catch(_){}
  }

  const newDocumentV1026=window.newDocument;
  if(typeof newDocumentV1026==='function'){
    window.newDocument=function(){
      const r=newDocumentV1026.apply(this,arguments);
      updatePIBRRequirementNoticeV1026();
      return r;
    };
    try{newDocument=window.newDocument}catch(_){}
  }

  const openDocumentV1026=window.openDocument;
  if(typeof openDocumentV1026==='function'){
    window.openDocument=function(){
      const r=openDocumentV1026.apply(this,arguments);
      updatePIBRRequirementNoticeV1026();
      return r;
    };
    try{openDocument=window.openDocument}catch(_){}
  }

  /* PI button from Quotation List: stop before opening conversion. */
  const convertQuoteV1026=window.convertQuote;
  if(typeof convertQuoteV1026==='function'){
    window.convertQuote=function(id){
      const q=(state.docs||[]).find(d=>d.id===id&&d.type==='Q');
      const c=q?(state.customers||[]).find(x=>x.id===q.customerId):null;
      if(c&&!requireCustomerBRForPIV1026(c,'create a Pro Forma Invoice from this quotation'))return false;
      return convertQuoteV1026.apply(this,arguments);
    };
    try{convertQuote=window.convertQuote}catch(_){}
  }

  /* Convert button inside an open Quotation. */
  const convertCurrentToPIV1026=window.convertCurrentToPI;
  if(typeof convertCurrentToPIV1026==='function'){
    window.convertCurrentToPI=function(){
      const q=typeof collectCurrent==='function'?collectCurrent():null;
      const c=q?(state.customers||[]).find(x=>x.id===q.customerId):null;
      if(c&&!requireCustomerBRForPIV1026(c,'convert this quotation to a Pro Forma Invoice'))return false;
      return convertCurrentToPIV1026.apply(this,arguments);
    };
    try{convertCurrentToPI=window.convertCurrentToPI}catch(_){}
  }

  /* Backstop immediately before the PI record is actually created. */
  const createPIFromSelectionV1026=window.createPIFromSelection;
  if(typeof createPIFromSelectionV1026==='function'){
    window.createPIFromSelection=function(){
      const q=typeof collectCurrent==='function'?collectCurrent():null;
      const c=q?(state.customers||[]).find(x=>x.id===q.customerId):null;
      if(c&&!requireCustomerBRForPIV1026(c,'create this Pro Forma Invoice'))return false;
      return createPIFromSelectionV1026.apply(this,arguments);
    };
    try{createPIFromSelection=window.createPIFromSelection}catch(_){}
  }

  /* Standalone PI / edited PI: saving and Save & Generate PDF both use this. */
  const persistCurrentDocumentV1026=window.persistCurrentDocument;
  if(typeof persistCurrentDocumentV1026==='function'){
    window.persistCurrentDocument=async function(){
      const d=typeof collectCurrent==='function'?collectCurrent():null;
      if(d?.type==='PI'&&d.customerId){
        const c=(state.customers||[]).find(x=>x.id===d.customerId);
        if(c&&!requireCustomerBRForPIV1026(c,'save this Pro Forma Invoice'))return null;
      }
      return persistCurrentDocumentV1026.apply(this,arguments);
    };
    try{persistCurrentDocument=window.persistCurrentDocument}catch(_){}
  }

  /* Final device/ribbon visibility repair for the current New Document layout. */
  window.refreshNewDocumentItemActionsV1026=function(){
    const row=document.querySelector('.customer-item-action-row');
    if(!row)return;
    const pi=$('docType')?.value==='PI';
    const device=$('quoteCategory')?.value==='device';

    if(pi){
      row.style.display='none';
      return;
    }

    row.style.display='grid';
    row.querySelectorAll('.field').forEach(f=>f.style.display=device?'none':'');
    row.querySelectorAll('button').forEach(btn=>{
      const text=String(btn.textContent||'');
      btn.style.display=device?(/Add Device/i.test(text)?'':'none'):'';
    });
  };

  const updateEditorVisibilityActionsV1026=window.updateEditorVisibility;
  window.updateEditorVisibility=function(){
    const r=updateEditorVisibilityActionsV1026.apply(this,arguments);
    refreshNewDocumentItemActionsV1026();
    updatePIBRRequirementNoticeV1026();
    return r;
  };
  try{updateEditorVisibility=window.updateEditorVisibility}catch(_){}

  refreshNewDocumentItemActionsV1026();
  updatePIBRRequirementNoticeV1026();
})();
