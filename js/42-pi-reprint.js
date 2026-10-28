
/* =========================================================
   V1.1.01
   1) Visible PI Reprint button in Pro Forma rows.
   2) Assigned-customer visibility refresh helpers.
   ========================================================= */
(function(){
  'use strict';

  function decoratePIReprintRowV1101(){
    const list=document.getElementById('piList');
    if(!list)return;

    list.querySelectorAll('tbody tr').forEach(tr=>{
      const serial=String(
        tr.querySelector('td:first-child b')?.textContent||''
      ).trim();

      const doc=(state.docs||[]).find(
        d=>d.type==='PI' && String(d.serial||'').trim()===serial
      );

      if(!doc)return;

      const actionCell=tr.lastElementChild;
      if(!actionCell)return;

      let b=actionCell.querySelector('.sc-pi-row-reprint-v1101');

      const synced=
        doc.softcreationOrderSync?.status==='synced' &&
        !!doc.softcreationOrderSync?.orderNo;

      if(!synced){
        if(b)b.remove();
        return;
      }

      if(!b){
        b=document.createElement('button');
        b.className='btn amber sm sc-pi-row-reprint-v1101';
        b.type='button';
        b.textContent='Reprint Receipt';
        b.onclick=()=>window.reprintPIStoresV1072?.(doc.id);

        const first=actionCell.firstElementChild;
        if(first)actionCell.insertBefore(b,first);
        else actionCell.appendChild(b);
      }
    });
  }

  const baseRenderDocsV1101=window.renderDocLists;
  if(typeof baseRenderDocsV1101==='function'){
    window.renderDocLists=function(){
      const r=baseRenderDocsV1101.apply(this,arguments);
      decoratePIReprintRowV1101();
      return r;
    };
    try{renderDocLists=window.renderDocLists}catch(_){}
  }

  window.refreshAssignedCustomerViewsV1101=function(){
    try{renderDocLists()}catch(_){}
    try{renderSalesOrders91?.()}catch(_){}
    try{renderDealerFulfilment?.()}catch(_){}
    try{renderCustomers()}catch(_){}
    try{updateStats()}catch(_){}
  };

  setTimeout(()=>{
    decoratePIReprintRowV1101();
  },0);
})();
