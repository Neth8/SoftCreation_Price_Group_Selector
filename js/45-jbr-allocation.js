
/* SoftCreation V1.1.21 — JBR allocation to Production Remaining. */
(function(){
  const cutCache=new Map();
  const loading=new Map();
  let hydrateTimer=null;

  function cutFor(key){
    return Math.max(0,Number(cutCache.get(String(key||''))||0));
  }
  window.jbrCutForProductV1121=cutFor;

  window.jbrJobBalancesV1121=function(productKey,jobs){
    let remainingCut=cutFor(productKey);
    return (jobs||[]).map(job=>{
      const original=Math.max(0,Number(job?.requestQty||0));
      const allocated=Math.min(original,remainingCut);
      const remaining=Math.max(0,original-allocated);
      remainingCut=Math.max(0,remainingCut-allocated);
      return {job,original,allocated,remaining};
    });
  };

  window.jbrRefreshProductBalanceV1121=async function(productKey,force=false){
    const key=String(productKey||'');
    if(!key)return 0;
    if(!force && cutCache.has(key))return cutFor(key);
    if(loading.has(key))return loading.get(key);
    const task=(async()=>{
      try{
        if(typeof window.jbrCloudStatsV1055!=='function')return cutFor(key);
        const stats=await window.jbrCloudStatsV1055(key,true);
        const cut=Math.max(0,Number(stats?.actualCut||0));
        cutCache.set(key,cut);
        return cut;
      }finally{loading.delete(key)}
    })();
    loading.set(key,task);
    return task;
  };

  async function hydrateAll(force=false){
    if(typeof productionProductGroupsV103!=='function')return;
    const groups=productionProductGroupsV103();
    let changed=false;
    for(const g of groups){
      if(!g?.key)continue;
      const before=cutFor(g.key);
      try{
        const after=await window.jbrRefreshProductBalanceV1121(g.key,force);
        if(after!==before)changed=true;
      }catch(e){console.error('JBR balance hydrate',g.key,e)}
    }
    if(changed){
      try{window.__jbrBalanceInternalRenderV1121=true;renderProductionProducts()}catch(_){}
      finally{window.__jbrBalanceInternalRenderV1121=false}
    }
  }
  window.jbrHydrateProductionBalancesV1121=hydrateAll;

  function install(){
    if(window.__jbrBalanceV1121Installed)return;
    window.__jbrBalanceV1121Installed=true;
    const baseRender=window.renderProductionProducts;
    if(typeof baseRender==='function'){
      window.renderProductionProducts=function(){
        const result=baseRender.apply(this,arguments);
        if(!window.__jbrBalanceInternalRenderV1121){
          clearTimeout(hydrateTimer);
          hydrateTimer=setTimeout(()=>hydrateAll(false),30);
        }
        return result;
      };
      try{renderProductionProducts=window.renderProductionProducts}catch(_){}
    }
    setTimeout(()=>hydrateAll(true),350);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
