
/* =========================================================
   v1.0.28 — APPROVED PRICES DELIVERY TOGGLE FINAL FIX
   ---------------------------------------------------------
   The base .field rule uses display:flex, therefore relying on
   the hidden attribute alone can leave separate-delivery fields
   visible. This final override controls both hidden and display.
   ========================================================= */
(function(){
  'use strict';

  function applyBpSeparateDeliveryStateV1028(){
    const checkbox=document.getElementById('bpSeparateDelivery');
    const button=document.getElementById('bpSeparateDeliveryToggle');
    const fields=document.getElementById('bpSeparateDeliveryFields');

    const enabled=!!checkbox?.checked;

    if(fields){
      fields.hidden=!enabled;
      fields.style.display=enabled?'':'none';
    }

    if(button){
      button.setAttribute('aria-pressed',enabled?'true':'false');
    }

    [
      'bpDeliveryCustomerName',
      'bpDeliveryLine1',
      'bpDeliveryLine2',
      'bpDeliveryContact1'
    ].forEach(id=>{
      const el=document.getElementById(id);
      if(el)el.required=enabled;
    });

    return enabled;
  }

  window.toggleBpSeparateDelivery=applyBpSeparateDeliveryStateV1028;

  window.toggleBpSeparateDeliveryButton=function(){
    const checkbox=document.getElementById('bpSeparateDelivery');
    if(!checkbox)return;

    checkbox.checked=!checkbox.checked;
    applyBpSeparateDeliveryStateV1028();
  };

  /*
    Guarantee OFF state is visually hidden on first render and
    after older request/customer setup code has run.
  */
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      setTimeout(applyBpSeparateDeliveryStateV1028,0);
    },{once:true});
  }else{
    setTimeout(applyBpSeparateDeliveryStateV1028,0);
  }
})();
