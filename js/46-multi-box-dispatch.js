
/* V1.1.23 - Same-job multi-box dispatch hardening */
(function(){
  function arr(v){if(Array.isArray(v))return v;if(typeof v==='string'){try{const x=JSON.parse(v);return Array.isArray(x)?x:[]}catch(_){return []}}return []}
  function cloneBoxes(boxes){return (Array.isArray(boxes)?boxes:[]).map((b,i)=>({boxNo:String(b?.boxNo||String(i+1).padStart(2,'0')),rolls:Math.max(0,Number(b?.rolls||0)),note:String(b?.note||'')})).filter(b=>b.rolls>0)}
  function exactPacking(r){
    const s=r?.batchPackingV1040;if(!s||typeof s!=='object')return null;
    const ids=arr(s.sourceJobIds);if(ids.length!==1||String(ids[0])!==String(r?.id||''))return null;
    const boxes=cloneBoxes(s.boxes),loose=Math.max(0,Number(s.loose||0));
    const total=boxes.reduce((n,b)=>n+b.rolls,0)+loose;if(!(total>0))return null;
    return {boxes,loose,total,qc:s.qc||r?.packing?.qc||'Passed',note:s.note||r?.packing?.note||'',packedBy:s.packedBy||r?.packing?.packedBy||'',packedAt:s.packedAt||r?.packing?.packedAt||'',lastCheckedBy:s.lastCheckedBy||r?.packing?.lastCheckedBy||'',lastCheckedAt:s.lastCheckedAt||r?.packing?.lastCheckedAt||'',batchProductKey:s.productKey||r?.packing?.batchProductKey||'',batchTotal:total,physicalPackagesV1123:true};
  }
  function flattened(r){const b=Array.isArray(r?.packing?.boxes)?r.packing.boxes:[];return b.length===1&&String(b[0]?.boxNo||'').trim().toUpperCase()==='BATCH'}
  window.ensureSameJobPhysicalPackingV1123=function(r,persist=true){
    if(!r)return false;const ex=exactPacking(r);if(!ex)return false;
    const cb=Array.isArray(r?.packing?.boxes)?r.packing.boxes:[],cl=Math.max(0,Number(r?.packing?.loose||0));
    const same=cb.length===ex.boxes.length&&cl===ex.loose&&cb.every((b,i)=>String(b?.boxNo||'')===String(ex.boxes[i]?.boxNo||'')&&Number(b?.rolls||0)===Number(ex.boxes[i]?.rolls||0));
    if(same)return false;
    if(cb.length>1&&!flattened(r))return false;
    r.packing=ex;r.finishedQty=ex.total;try{if(persist)saveState()}catch(_){}return true;
  };
  function install(){
    if(window.__sameJobPhysicalDispatchV1123Installed)return;window.__sameJobPhysicalDispatchV1123Installed=true;
    let repaired=false;try{(state?.productionRequests||[]).forEach(r=>{if(window.ensureSameJobPhysicalPackingV1123(r,false))repaired=true});if(repaired)saveState()}catch(e){console.error('V1123 repair',e)}
    const base=window.openDispatchLoadingV81;
    if(typeof base==='function'){
      window.openDispatchLoadingV81=function(id){try{const r=(state?.productionRequests||[]).find(x=>x.id===id);if(r)window.ensureSameJobPhysicalPackingV1123(r,true)}catch(e){console.error('V1123 dispatch normalize',e)}return base.apply(this,arguments)};
      try{openDispatchLoadingV81=window.openDispatchLoadingV81}catch(_){}
    }
  }

  // The original Open Plan UI used only locally recorded consignments.
  // Add a verified dispatch view from the same Supabase totals used by Production Control.
  function installPlanDispatchSyncV4(){
    if(window.__spgsPlanDispatchV4||typeof window.openDfPlan!=='function')return;
    window.__spgsPlanDispatchV4=true;
    const original=window.openDfPlan;
    let generation=0;
    window.openDfPlan=function(planId){
      const out=original.apply(this,arguments);
      const id=String(planId),token=++generation;
      const plan=(state.dealerFulfilments||[]).find(p=>String(p.id)===id);
      if(!plan||String(plan.sourceType||'').toUpperCase()!=='SO'||!plan.sourceSOId)return out;
      const body=document.getElementById('dfPlanBody');
      if(!body)return out;
      const notice=document.createElement('div');notice.className='spgs-plan-live-note';
      notice.textContent='Checking confirmed Ordexa physical dispatches...';
      body.prepend(notice);
      (async()=>{
        try{
          if(typeof window.spgsGetSalesOrderPlanProgressV4!=='function')throw new Error('Production Control dispatch service unavailable');
          const result=await window.spgsGetSalesOrderPlanProgressV4(plan.sourceSOId);
          if(token!==generation||!document.getElementById('dfPlanModal')?.classList.contains('show'))return;
          if((state.dealerFulfilments||[]).find(p=>String(p.id)===id)!==plan)return;
          const source=(state.salesOrders||[]).find(x=>String(x.id)===String(plan.sourceSOId));
          if(!source||result.lines.length!==plan.lines.length)throw new Error('Sales Order line mapping changed. Verify before dispatching.');
          const ordered=result.lines.reduce((n,l)=>n+l.ordered,0);
          const sent=result.lines.reduce((n,l)=>n+l.sent,0);
          const remaining=result.lines.reduce((n,l)=>n+l.remaining,0);
          const label=remaining<0.00001?'Fully Sent':sent>0?'Partially Sent':'New Order';
          const ui=document.getElementById('dfPlanBody');
          if(!ui)return;
          const qty=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
          const stats=ui.querySelectorAll(':scope > .df-grid .df-stat');
          if(stats.length>=4){
            stats[0].querySelector('b').textContent=qty(ordered);
            stats[2].querySelector('small').textContent='Physically Sent (Verified)';
            stats[2].querySelector('b').textContent=qty(sent);
            stats[3].querySelector('small').textContent='Not Yet Sent';
            stats[3].querySelector('b').textContent=qty(remaining);
          }
          const headings=Array.from(ui.querySelectorAll('h4'));
          const orderItems=headings.find(h=>h.textContent.trim()==='Order Items');
          const table=orderItems?.nextElementSibling;
          if(table?.tagName==='TABLE'){
            const ths=table.querySelectorAll('thead th');
            if(ths.length>=4)ths[3].textContent='Not Yet Sent';
            const trs=table.querySelectorAll('tbody tr');
            result.lines.forEach((line,i)=>{const tds=trs[i]?.querySelectorAll('td');if(tds?.length>=4)tds[3].innerHTML='<b>'+qty(line.remaining)+'</b>';});
          }
          const active=notice.isConnected?notice:ui.querySelector('.spgs-plan-live-note');
          if(active){active.className='spgs-plan-live-note is-ready';active.replaceChildren();
            const status=document.createElement('strong');status.textContent=label;
            status.className='spgs-plan-state '+(remaining<0.00001?'is-full':sent>0?'is-partial':'is-new');
            active.append(status,document.createTextNode('  ·  '+qty(sent)+' of '+qty(ordered)+' physically sent through verified records. Existing consignments shown below are historical and are not edited.'));
          }
        }catch(e){
          if(token!==generation)return;
          const active=notice.isConnected?notice:document.getElementById('dfPlanBody')?.querySelector('.spgs-plan-live-note');
          if(active){active.className='spgs-plan-live-note is-error';active.textContent='Live dispatch totals unavailable: '+String(e?.message||e)+'. Do not rely on the older consignment totals for dispatch decisions.';}
        }
      })();
      return out;
    };
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installPlanDispatchSyncV4,{once:true});else installPlanDispatchSyncV4();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
