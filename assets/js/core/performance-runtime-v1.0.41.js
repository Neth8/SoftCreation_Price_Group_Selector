/* =========================================================
   SoftCreation v1.0.41 PERFORMANCE RUNTIME
   ---------------------------------------------------------
   Goal: reduce duplicate rendering caused by historical wrapper layers
   without changing business rules, data mutations, permissions, or DB logic.
   ========================================================= */
(function(){
  'use strict';

  const SC_PERF=window.__SC_PERF_V1041__={
    frames:Object.create(null),
    calls:Object.create(null),
    installedAt:new Date().toISOString()
  };

  function activeView(){
    return document.querySelector('.view.active')?.id||'dashboard';
  }

  /* Coalesce repeated calls to heavy LIST renderers into one call per frame.
     These functions render state; they do not perform the underlying business
     mutation. Arguments from the latest request in the frame are used. */
  function coalesceGlobal(name){
    const original=window[name];
    if(typeof original!=='function'||original.__scCoalescedV1041)return;
    let pending=false,lastThis=null,lastArgs=null;
    function wrapped(){
      lastThis=this;lastArgs=arguments;
      SC_PERF.calls[name]=(SC_PERF.calls[name]||0)+1;
      if(pending)return;
      pending=true;
      requestAnimationFrame(()=>{
        pending=false;
        try{original.apply(lastThis,lastArgs||[])}
        catch(e){console.warn('SoftCreation render failed:',name,e)}
      });
    }
    wrapped.__scCoalescedV1041=true;
    wrapped.__scOriginalV1041=original;
    window[name]=wrapped;
    try{eval(name+'=window[name]')}catch(_){}
  }

  [
    'renderProductionBoard',
    'renderProductionProducts',
    'renderStoresQueueV8',
    'renderPurchaseOrders',
    'renderSalesOrders91',
    'renderDealerFulfilment',
    'renderBranchRequests',
    'renderMyBranchRequests'
  ].forEach(coalesceGlobal);

  /* Final active-view-only refresh.
     Historical scripts wrapped refreshAll many times; this final definition
     intentionally prevents hidden workspaces from being rebuilt. */
  function refreshVisibleWorkspace(){
    try{if(typeof updateStats==='function')updateStats()}catch(_){}
    const id=activeView();
    try{
      switch(id){
        case 'dashboard':
          window.renderDashboardReport?.();
          window.renderApprovalInbox?.();
          break;
        case 'editor':
          window.refreshCustomerPick?.();
          break;
        case 'quotations':
        case 'pis':
          window.renderDocLists?.();
          break;
        case 'customers':
          window.renderCustomers?.();
          break;
        case 'items':
          window.renderItems?.();
          break;
        case 'devices':
          window.renderDevices?.();
          break;
        case 'admin':
          window.loadAdminPanel?.();
          break;
        case 'settings':
          window.renderUsers?.();
          window.loadSettingsUI?.();
          window.refreshUserCompanyLinkOptions?.();
          break;
        case 'categories':
          window.renderCategories?.();
          break;
        case 'products':
          window.renderProducts?.();
          break;
        case 'production':
          window.renderProductionBoard?.();
          break;
        case 'productionproducts':
          window.renderProductionProducts?.();
          break;
        case 'stores':
          window.renderStoresQueueV8?.();
          break;
        case 'introducers':
          window.renderIntroducersV84?.();
          break;
        case 'branchportal':
          window.renderPortalMasters?.();
          window.renderBpCart?.();
          window.renderMyBranchRequests?.();
          window.refreshBranchCustomerProfiles?.();
          break;
        case 'quoterequests':
          window.renderBranchRequests?.();
          break;
        case 'purchaseorders':
          window.renderPurchaseOrders?.();
          break;
        case 'dealerfulfilment':
          window.renderDealerFulfilment?.();
          break;
        case 'salesorders':
          window.renderSalesOrders91?.();
          break;
      }
    }catch(e){console.warn('SoftCreation visible-workspace refresh failed',e)}
  }
  window.refreshAll=refreshVisibleWorkspace;
  try{refreshAll=refreshVisibleWorkspace}catch(_){}

  /* Debounce high-frequency filter/search DOM0 handlers that may be restored
     by late legacy scripts. This does not change their renderer/business rules. */
  function debounceInput(id,fn,delay=180){
    const el=document.getElementById(id);if(!el||typeof fn!=='function')return;
    let t=0;
    el.oninput=function(){
      clearTimeout(t);
      const self=this,args=arguments;
      t=setTimeout(()=>fn.apply(self,args),delay);
    };
  }
  debounceInput('quoteSearch',()=>window.renderDocLists?.());
  debounceInput('piSearch',()=>window.renderDocLists?.());
  debounceInput('customerSearch',()=>window.renderCustomers?.());
  debounceInput('itemSearch',()=>window.renderItems?.());
  debounceInput('deviceSearch',()=>window.renderDevices?.());
  debounceInput('poSearch',()=>window.renderPurchaseOrders?.());
  debounceInput('soSearch91',()=>window.renderSalesOrders91?.());

  /* Make performance counters available for troubleshooting without affecting UI. */
  window.scPerformanceInfoV1041=function(){
    return {
      activeView:activeView(),
      coalescedCallRequests:{...SC_PERF.calls},
      installedAt:SC_PERF.installedAt
    };
  };
})();