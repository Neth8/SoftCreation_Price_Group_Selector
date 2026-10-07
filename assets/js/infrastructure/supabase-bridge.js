
/* SPGS Supabase bridge - cloud persistence + application-user table.
   Business/pricing/document logic above is intentionally left unchanged. */
(function(){
  const SPGS_REST='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1';
  const SPGS_WORKSPACE='softcreation_main';
  const SPGS_KEY_STORE='spgs_supabase_browser_key_v1';
  const SPGS_LOCAL_KEYS=['sc_qpi_v85_branch_portal_clean','sc_qpi_v84_clean_release_20260917'];
let spgsReady=false,
    spgsBootError=null,
    spgsSaveTimer=null,
    spgsSaving=false,
    spgsSaveAgain=false,
    spgsLastUsersJson='',
    spgsProductionJson='',
    spgsProductionClient=null,
    spgsProductionChannel=null,
    spgsPurchaseChannel=null,
    spgsPurchaseCloudReady=false,
    spgsQuoteRequestChannel=null,
    spgsQuoteRequestCloudReady=false,
    spgsSalesOrderChannel=null,
    spgsSalesOrderCloudReady=false,
    spgsFulfilmentChannel=null,
    spgsFulfilmentCloudReady=false,
    spgsEntityChannel=null,
    spgsEntityStoreReady=false,
    spgsEntityHashes={},
    spgsEntityUiTimer=null;

  function spgsApiKey(){
    let key=localStorage.getItem(SPGS_KEY_STORE)||'';
    if(!key){
      key=prompt('SoftCreation cloud setup\n\nPaste the FULL Supabase anon / publishable key for qyxgamverzdmhtvezbft:')||'';
      key=key.trim();
      if(key)localStorage.setItem(SPGS_KEY_STORE,key);
    }
    return key;
  }
  function spgsHeaders(extra={}){
    const key=spgsApiKey();
    if(!key)throw new Error('Supabase key is not configured.');
    const h={apikey:key,...extra};
    if(key.startsWith('eyJ'))h.Authorization='Bearer '+key;
    return h;
  }
  let spgsProductionSeen={};
  let spgsProductionSeenReady=false;


async function spgsLoadProductionSeen(){
    spgsProductionSeen={};
    spgsProductionSeenReady=false;
    const username=currentUser?.username;
    if(!username)return;
    try{
        const rows=await spgsFetch(
            `/spgs_production_seen?workspace=eq.${encodeURIComponent(SPGS_WORKSPACE)}&username=eq.${encodeURIComponent(username)}&select=production_id,seen_at`
        );
        (rows||[]).forEach(row=>{spgsProductionSeen[row.production_id]=row.seen_at});
        spgsProductionSeenReady=true;
    }catch(e){
        console.error('Production seen status load failed',e);
    }
}


function spgsProductionIsUnread(r){

    if(
        !spgsProductionSeenReady ||
        !currentUser?.username ||
        !r?.id ||
        !r?._spgsUpdatedAt
    ){
        return false;
    }

    const updated=
        Date.parse(r._spgsUpdatedAt)||0;

    const seen=
        Date.parse(
            spgsProductionSeen[r.id]||''
        )||0;

    return updated>seen;
}


async function spgsMarkProductionSeen(id){

    const username=
        currentUser?.username;

    if(!username || !id)return;

    const job=(state.productionRequests||[]).find(x=>x.id===id);
    const seenAt=job?._spgsUpdatedAt || new Date().toISOString();


    // Immediately remove GIF from screen.
    spgsProductionSeen[id]=seenAt;

    try{
        renderProductionBoard();
    }catch(e){}


    try{

        await spgsFetch(
            '/spgs_production_seen' +
            '?on_conflict=workspace,production_id,username',
            {
                method:'POST',

                headers:{
                    'Content-Type':'application/json',
                    'Prefer':
                      'resolution=merge-duplicates,return=minimal'
                },

                body:JSON.stringify({
                    workspace:SPGS_WORKSPACE,
                    production_id:id,
                    username:username,
                    seen_at:seenAt
                })
            }
        );

    }catch(e){

        console.error(
            'Production seen save failed',
            e
        );
    }
}


window.spgsProductionIsUnread=
    spgsProductionIsUnread;

window.spgsMarkProductionSeen=
    spgsMarkProductionSeen;

window.spgsLoadProductionSeen=
    spgsLoadProductionSeen;
  async function spgsFetch(path,options={}){
    const res=await fetch(SPGS_REST+path,{...options,headers:spgsHeaders(options.headers||{})});
    if(!res.ok){const body=await res.text().catch(()=>res.statusText);throw new Error(`Supabase ${res.status}: ${body.slice(0,500)}`)}
    if(res.status===204)return null;
    const text=await res.text();return text?JSON.parse(text):null;
  }
  function spgsUserFromRow(r){
    const base={id:r.id,username:r.username,password:r.password,display:r.display,role:r.role,active:r.active!==false,permissions:Array.isArray(r.permissions)?r.permissions:[],priceCategoryIds:Array.isArray(r.price_category_ids)?r.price_category_ids:[],quoteHandler:r.quote_handler||'',companyLinkType:r.company_link_type||'',companyLinkId:r.company_link_id||'',lastPortalCustomerKey:r.last_portal_customer_key||''};
    return {...(r.extra&&typeof r.extra==='object'?r.extra:{}),...base};
  }
  function spgsUserToRow(u){
    const known=new Set(['id','username','password','display','role','active','permissions','priceCategoryIds','quoteHandler','companyLinkType','companyLinkId','lastPortalCustomerKey']);
    const extra={};Object.keys(u||{}).forEach(k=>{if(!known.has(k))extra[k]=u[k]});
    return {id:u.id,username:u.username,password:String(u.password??''),display:u.display||u.username||'',role:u.role||'user',active:u.active!==false,permissions:Array.isArray(u.permissions)?u.permissions:[],price_category_ids:Array.isArray(u.priceCategoryIds)?u.priceCategoryIds:[],quote_handler:u.quoteHandler||null,company_link_type:u.companyLinkType||null,company_link_id:u.companyLinkId||null,last_portal_customer_key:u.lastPortalCustomerKey||null,extra,updated_at:new Date().toISOString()};
  }
  // ------------------------------------------------------------------
  // v1.0.10 Per-record realtime entity store
  // Prevents a stale browser from replacing the entire shared application
  // payload. Each mutable business record is stored independently.
  // ------------------------------------------------------------------
  const SPGS_ENTITY_ARRAYS=[
    'customers','items','devices','productItems','priceCategories','docs',
    'approvals','audit','introducers','commissionPayments','notifications','grns'
  ];
  const SPGS_ENTITY_SINGLETONS=['settings','counters'];

  function spgsEntityKey(type,id){return `${type}::${id}`}
  function spgsEntityCleanPayload(value){
    const x=JSON.parse(JSON.stringify(value??{}));
    if(x&&typeof x==='object')delete x._spgsUpdatedAt;
    return x;
  }
  function spgsEntitySignature(value,sortOrder=0){return JSON.stringify({payload:spgsEntityCleanPayload(value),sort_order:Number(sortOrder)||0})}
  function spgsEnsureEntityIds(){
    SPGS_ENTITY_ARRAYS.forEach(type=>{
      const arr=Array.isArray(state[type])?state[type]:(state[type]=[]);
      arr.forEach((row,i)=>{
        if(row&&typeof row==='object'&&!row.id){
          row.id=uid(`ent_${type.slice(0,4)}`);
        }
      });
    });
    state.settings=state.settings||{};
    state.counters=state.counters||{};
  }
  function spgsEntityRowsFromState(){
    spgsEnsureEntityIds();
    const rows=[];
    SPGS_ENTITY_ARRAYS.forEach(type=>{
      (state[type]||[]).forEach((row,index)=>{
        if(!row?.id)return;
        rows.push({entity_type:type,id:String(row.id),payload:spgsEntityCleanPayload(row),sort_order:index});
      });
    });
    SPGS_ENTITY_SINGLETONS.forEach(type=>{
      rows.push({entity_type:type,id:'singleton',payload:spgsEntityCleanPayload(state[type]||{}),sort_order:0});
    });
    return rows;
  }
  async function spgsLoadEntityMeta(){
    const rows=await spgsFetch(`/spgs_entity_store_meta?workspace=eq.${encodeURIComponent(SPGS_WORKSPACE)}&select=workspace,initialized_at&limit=1`);
    return rows?.[0]||null;
  }
  async function spgsSetEntityMeta(){
    await spgsFetch('/spgs_entity_store_meta?on_conflict=workspace',{
      method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify([{workspace:SPGS_WORKSPACE,initialized_at:new Date().toISOString()}])
    });
  }
  async function spgsLoadEntities(){
    const rows=await spgsFetch(`/spgs_entities?workspace=eq.${encodeURIComponent(SPGS_WORKSPACE)}&select=entity_type,id,payload,sort_order,updated_at&order=entity_type.asc,sort_order.asc,updated_at.asc`);
    return rows||[];
  }
  function spgsApplyEntityRows(rows,{replace=true}={}){
    if(replace){
      spgsEntityHashes={};
      SPGS_ENTITY_ARRAYS.forEach(type=>{state[type]=[]});
    }
    const grouped={};
    (rows||[]).forEach(row=>{
      const type=row.entity_type,id=String(row.id||'');
      if(!type||!id)return;
      const payload=spgsEntityCleanPayload(row.payload||{});
      if(type==='settings'){
        state.settings=(typeof DEFAULT_SETTINGS==='object')?{...DEFAULT_SETTINGS,...payload}:payload;
      }else if(type==='counters'){
        state.counters=payload||{};
      }else if(SPGS_ENTITY_ARRAYS.includes(type)){
        if(payload&&typeof payload==='object'&&!payload.id)payload.id=id;
        grouped[type]=grouped[type]||[];
        grouped[type].push({payload,sort_order:Number(row.sort_order)||0});
      }
      spgsEntityHashes[spgsEntityKey(type,id)]=spgsEntitySignature(payload,row.sort_order);
    });
    Object.keys(grouped).forEach(type=>{state[type]=grouped[type].sort((a,b)=>a.sort_order-b.sort_order).map(x=>x.payload)});
    SPGS_ENTITY_ARRAYS.forEach(type=>{state[type]=state[type]||[]});
    state.settings=state.settings||{};
    state.counters=state.counters||{};
  }
  async function spgsSeedEntityStoreFromState(){
    const rows=spgsEntityRowsFromState();
    if(rows.length){
      const now=new Date().toISOString(),by=currentUser?.username||'migration';
      const dbRows=rows.map(r=>({workspace:SPGS_WORKSPACE,entity_type:r.entity_type,id:r.id,payload:r.payload,sort_order:r.sort_order||0,updated_at:now,updated_by:by}));
      await spgsFetch('/spgs_entities?on_conflict=workspace,entity_type,id',{
        method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(dbRows)
      });
    }
    await spgsSetEntityMeta();
  }
  async function spgsBootstrapEntityStore(){
    try{
      let meta=await spgsLoadEntityMeta();
      let rows=await spgsLoadEntities();
      if(!meta){
        // Deployment-order fallback. The supplied SQL normally performs this
        // migration before the HTML is deployed. If it did not, seed once from
        // the currently loaded legacy state instead of dropping any records.
        if(!rows.length){
          await spgsSeedEntityStoreFromState();
          rows=await spgsLoadEntities();
        }else{
          await spgsSetEntityMeta();
        }
      }
      if(rows.length)spgsApplyEntityRows(rows,{replace:true});
      else{
        // Empty is valid for array collections; keep settings/counters and
        // initialise hashes from the current state.
        spgsEntityHashes={};
        spgsEntityRowsFromState().forEach(r=>{spgsEntityHashes[spgsEntityKey(r.entity_type,r.id)]=spgsEntitySignature(r.payload,r.sort_order)});
      }
      spgsEntityStoreReady=true;
      return true;
    }catch(e){
      spgsEntityStoreReady=false;
      console.warn('Per-record entity store is not ready. Run spgs_data_integrity_v110.sql.',e);
      return false;
    }
  }
  async function spgsSyncEntities(force=false){
    if(!spgsEntityStoreReady)return;
    const rows=spgsEntityRowsFromState();
    const currentKeys=new Set(rows.map(r=>spgsEntityKey(r.entity_type,r.id)));
    const changed=[];
    const now=new Date().toISOString(),by=currentUser?.username||'system';
    for(const r of rows){
      const key=spgsEntityKey(r.entity_type,r.id),sig=spgsEntitySignature(r.payload,r.sort_order);
      if(!force&&spgsEntityHashes[key]===sig)continue;
      changed.push({workspace:SPGS_WORKSPACE,entity_type:r.entity_type,id:r.id,payload:r.payload,sort_order:r.sort_order||0,updated_at:now,updated_by:by});
    }
    if(changed.length){
      await spgsFetch('/spgs_entities?on_conflict=workspace,entity_type,id',{
        method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(changed)
      });
      changed.forEach(r=>{spgsEntityHashes[spgsEntityKey(r.entity_type,r.id)]=spgsEntitySignature(r.payload,r.sort_order)});
    }
    // Delete only records that THIS browser previously knew about and has now
    // intentionally removed. A stale browser cannot delete rows it never saw.
    const deleted=Object.keys(spgsEntityHashes).filter(key=>{
      const type=key.split('::')[0];
      return (SPGS_ENTITY_ARRAYS.includes(type)||SPGS_ENTITY_SINGLETONS.includes(type))&&!currentKeys.has(key);
    });
    for(const key of deleted){
      const cut=key.indexOf('::'),type=key.slice(0,cut),id=key.slice(cut+2);
      await spgsFetch(`/spgs_entities?workspace=eq.${encodeURIComponent(SPGS_WORKSPACE)}&entity_type=eq.${encodeURIComponent(type)}&id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
      delete spgsEntityHashes[key];
    }
  }
  function spgsApplyEntityRealtime(change){
    const oldRow=change.old||{},newRow=change.new||{};
    const row=change.eventType==='DELETE'?oldRow:newRow;
    const type=row.entity_type,id=String(row.id||'');
    if(!type||!id)return;
    const key=spgsEntityKey(type,id);
    if(change.eventType==='DELETE'){
      if(SPGS_ENTITY_ARRAYS.includes(type))state[type]=(state[type]||[]).filter(x=>String(x?.id)!==id);
      delete spgsEntityHashes[key];
    }else{
      const payload=spgsEntityCleanPayload(newRow.payload||{});
      if(type==='settings')state.settings=(typeof DEFAULT_SETTINGS==='object')?{...DEFAULT_SETTINGS,...payload}:payload;
      else if(type==='counters')state.counters=payload||{};
      else if(SPGS_ENTITY_ARRAYS.includes(type)){
        if(payload&&typeof payload==='object'&&!payload.id)payload.id=id;
        const arr=state[type]=state[type]||[],i=arr.findIndex(x=>String(x?.id)===id);
        if(i>=0)arr.splice(i,1);
        const at=Math.max(0,Math.min(Number(newRow.sort_order)||0,arr.length));
        arr.splice(at,0,payload);
      }
      spgsEntityHashes[key]=spgsEntitySignature(payload,newRow.sort_order);
    }
    spgsWriteLocal();
    clearTimeout(spgsEntityUiTimer);
    spgsEntityUiTimer=setTimeout(()=>{
      try{refreshAll()}catch(e){}
    },120);
  }
  async function spgsStartEntityRealtime(){
    if(!spgsEntityStoreReady||!spgsProductionClient)return;
    if(spgsEntityChannel){try{await spgsProductionClient.removeChannel(spgsEntityChannel)}catch(e){}}
    spgsEntityChannel=spgsProductionClient.channel('spgs-entities-'+SPGS_WORKSPACE)
      .on('postgres_changes',{event:'*',schema:'public',table:'spgs_entities',filter:`workspace=eq.${SPGS_WORKSPACE}`},spgsApplyEntityRealtime)
      .subscribe(status=>console.log('Entity realtime status:',status));
  }

  function spgsCloudPayload(){
    const copy=JSON.parse(JSON.stringify(state));
    delete copy.productionRequests;
    delete copy.purchaseOrders;
    // Live-safe migration: only remove quoteRequests from the legacy shared
    // payload after the dedicated realtime table has been confirmed available.
    if(spgsQuoteRequestCloudReady)delete copy.quoteRequests;
    // v1.0.9 live-safe isolation: keep these in legacy shared state until
    // their dedicated tables have been confirmed available.
    if(spgsSalesOrderCloudReady)delete copy.salesOrders;
    if(spgsFulfilmentCloudReady)delete copy.dealerFulfilments;
    // v1.0.10: once the per-record store is available, never place mutable
    // masters/documents back into the giant shared JSON row.
    if(spgsEntityStoreReady){
      SPGS_ENTITY_ARRAYS.forEach(k=>delete copy[k]);
      SPGS_ENTITY_SINGLETONS.forEach(k=>delete copy[k]);
    }
    delete copy.users;
    copy.current=null;
    return copy;
  }
let spgsProductionHashes={};

function spgsCleanProductionPayload(r){
    const x={...r};
    delete x._spgsUpdatedAt;
    return x;
}

function spgsProductionSignature(r){
    return JSON.stringify(spgsCleanProductionPayload(r));
}

async function spgsLoadProduction(){

    const rows=await spgsFetch(
        `/spgs_production_requests` +
        `?workspace=eq.${encodeURIComponent(SPGS_WORKSPACE)}` +
        `&select=id,payload,updated_at` +
        `&order=updated_at.desc`
    );

    const jobs=(rows||[])
        .map(row=>({
            ...(row.payload||{}),
            _spgsUpdatedAt:row.updated_at
        }))
        .filter(x=>x.id);

    spgsProductionHashes={};

    jobs.forEach(r=>{
        spgsProductionHashes[r.id]=
            spgsProductionSignature(r);
    });

    return jobs;
}
async function spgsSyncProduction(force=false){

    state.productionRequests=
        state.productionRequests||[];

    const changed=[];

    for(const r of state.productionRequests){

        if(!r?.id)continue;

        const payload=
            spgsCleanProductionPayload(r);

        const sig=
            JSON.stringify(payload);

        if(
            !force &&
            spgsProductionHashes[r.id]===sig
        ){
            continue;
        }

        changed.push({
            workspace:SPGS_WORKSPACE,
            id:r.id,
            order_no:r.orderNo||'',
            status:r.status||'Requested',
            owner_user:r.ownerUser||'',
            payload:payload,
            updated_at:new Date().toISOString()
        });
    }

    if(!changed.length)return;

    await spgsFetch(
        '/spgs_production_requests' +
        '?on_conflict=workspace,id',
        {
            method:'POST',
            headers:{
                'Content-Type':'application/json',
                'Prefer':
                  'resolution=merge-duplicates,return=minimal'
            },
            body:JSON.stringify(changed)
        }
    );

    changed.forEach(row=>{
        spgsProductionHashes[row.id]=
            JSON.stringify(row.payload);
    });
}

let spgsQuoteRequestHashes={};

function spgsCleanQuoteRequestPayload(r){
    const x={...r};
    delete x._spgsUpdatedAt;
    return x;
}

function spgsQuoteRequestSignature(r){
    return JSON.stringify(spgsCleanQuoteRequestPayload(r));
}

async function spgsLoadQuoteRequests(){
    const rows=await spgsFetch(
        `/spgs_quote_requests`+
        `?workspace=eq.${encodeURIComponent(SPGS_WORKSPACE)}`+
        `&select=id,payload,updated_at`+
        `&order=updated_at.desc`
    );

    const list=(rows||[])
        .map(row=>({
            ...(row.payload||{}),
            _spgsUpdatedAt:row.updated_at
        }))
        .filter(x=>x.id);

    spgsQuoteRequestHashes={};
    list.forEach(r=>{
        spgsQuoteRequestHashes[r.id]=spgsQuoteRequestSignature(r);
    });

    spgsQuoteRequestCloudReady=true;
    return list;
}

async function spgsSyncQuoteRequests(force=false){
    if(!spgsQuoteRequestCloudReady)return;

    state.quoteRequests=state.quoteRequests||[];
    const changed=[];

    for(const r of state.quoteRequests){
        if(!r?.id)continue;

        const payload=spgsCleanQuoteRequestPayload(r);
        const sig=JSON.stringify(payload);

        if(!force && spgsQuoteRequestHashes[r.id]===sig)continue;

        const updated_at=new Date().toISOString();

        changed.push({
            workspace:SPGS_WORKSPACE,
            id:r.id,
            request_no:r.requestNo||'',
            status:r.status||'Pending',
            requester:r.requester||'',
            handler:r.handler||'',
            payload,
            updated_at
        });
    }

    if(!changed.length)return;

    await spgsFetch(
        '/spgs_quote_requests?on_conflict=workspace,id',
        {
            method:'POST',
            headers:{
                'Content-Type':'application/json',
                'Prefer':'resolution=merge-duplicates,return=minimal'
            },
            body:JSON.stringify(changed)
        }
    );

    changed.forEach(row=>{
        spgsQuoteRequestHashes[row.id]=JSON.stringify(row.payload);
        const r=state.quoteRequests.find(x=>x.id===row.id);
        if(r)r._spgsUpdatedAt=row.updated_at;
    });
}

async function spgsStartQuoteRequestsRealtime(){
    if(!spgsQuoteRequestCloudReady||!spgsProductionClient)return;

    spgsQuoteRequestChannel=spgsProductionClient
        .channel('spgs-quote-requests-'+SPGS_WORKSPACE)
        .on(
            'postgres_changes',
            {
                event:'*',
                schema:'public',
                table:'spgs_quote_requests',
                filter:`workspace=eq.${SPGS_WORKSPACE}`
            },
            change=>{
                state.quoteRequests=state.quoteRequests||[];

                if(change.eventType==='DELETE'){
                    const id=change.old?.id;
                    if(id){
                        state.quoteRequests=state.quoteRequests.filter(x=>x.id!==id);
                        delete spgsQuoteRequestHashes[id];
                    }
                }else{
                    const incoming={
                        ...(change.new?.payload||{}),
                        _spgsUpdatedAt:change.new?.updated_at||new Date().toISOString()
                    };

                    if(!incoming.id)return;

                    const i=state.quoteRequests.findIndex(x=>x.id===incoming.id);
                    if(i>=0)state.quoteRequests[i]=incoming;
                    else state.quoteRequests.unshift(incoming);

                    spgsQuoteRequestHashes[incoming.id]=spgsQuoteRequestSignature(incoming);
                }

                spgsWriteLocal();

                try{
                    if($('quoterequests')?.classList.contains('active'))renderBranchRequests();
                    if($('branchportal')?.classList.contains('active'))renderMyBranchRequests();
                }catch(e){
                    console.warn('Quote Requests realtime render failed',e);
                }

                console.log(
                    'Quote Requests realtime:',
                    change.eventType,
                    change.new?.request_no||change.old?.request_no||''
                );
            }
        )
        .subscribe(status=>console.log('Quote Requests realtime status:',status));
}


// -----------------------------------------------------------------------------
// v1.0.9 - Repeat Sales Orders + Order Fulfilment dedicated realtime persistence
// -----------------------------------------------------------------------------
let spgsSalesOrderHashes={};
let spgsFulfilmentHashes={};

function spgsCleanV109Payload(r){
  const x={...r};
  delete x._spgsUpdatedAt;
  return x;
}
function spgsV109Signature(r){return JSON.stringify(spgsCleanV109Payload(r))}

async function spgsLoadSalesOrders(){
  const rows=await spgsFetch(`/spgs_sales_orders?workspace=eq.${encodeURIComponent(SPGS_WORKSPACE)}&select=id,payload,updated_at&order=updated_at.desc`);
  const list=(rows||[]).map(row=>({...(row.payload||{}),_spgsUpdatedAt:row.updated_at})).filter(x=>x.id);
  spgsSalesOrderHashes={};
  list.forEach(r=>spgsSalesOrderHashes[r.id]=spgsV109Signature(r));
  spgsSalesOrderCloudReady=true;
  return list;
}

async function spgsSyncSalesOrders(force=false){
  if(!spgsSalesOrderCloudReady)return;
  state.salesOrders=state.salesOrders||[];
  const changed=[];
  for(const r of state.salesOrders){
    if(!r?.id)continue;
    const payload=spgsCleanV109Payload(r),sig=JSON.stringify(payload);
    if(!force&&spgsSalesOrderHashes[r.id]===sig)continue;
    const updated_at=new Date().toISOString();
    changed.push({
      workspace:SPGS_WORKSPACE,
      id:r.id,
      so_no:r.soNo||'',
      customer_name:r.customerName||'',
      erp_status:r.erpStatus||'Pending ERP Sync',
      owner_user:r.ownerUser||'',
      payload,
      updated_at
    });
  }
  if(!changed.length)return;
  await spgsFetch('/spgs_sales_orders?on_conflict=workspace,id',{
    method:'POST',
    headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(changed)
  });
  changed.forEach(row=>{
    spgsSalesOrderHashes[row.id]=JSON.stringify(row.payload);
    const x=state.salesOrders.find(y=>y.id===row.id);if(x)x._spgsUpdatedAt=row.updated_at;
  });
}

async function spgsLoadOrderFulfilments(){
  const rows=await spgsFetch(`/spgs_order_fulfilments?workspace=eq.${encodeURIComponent(SPGS_WORKSPACE)}&select=id,payload,updated_at&order=updated_at.desc`);
  const list=(rows||[]).map(row=>({...(row.payload||{}),_spgsUpdatedAt:row.updated_at})).filter(x=>x.id);
  spgsFulfilmentHashes={};
  list.forEach(r=>spgsFulfilmentHashes[r.id]=spgsV109Signature(r));
  spgsFulfilmentCloudReady=true;
  return list;
}

async function spgsSyncOrderFulfilments(force=false){
  if(!spgsFulfilmentCloudReady)return;
  state.dealerFulfilments=state.dealerFulfilments||[];
  const changed=[];
  for(const r of state.dealerFulfilments){
    if(!r?.id)continue;
    const payload=spgsCleanV109Payload(r),sig=JSON.stringify(payload);
    if(!force&&spgsFulfilmentHashes[r.id]===sig)continue;
    const updated_at=new Date().toISOString();
    const statuses=(r.consignments||[]).map(c=>c.status||'').filter(Boolean);
    const status=statuses.length&&statuses.every(x=>x==='Delivered')?'Delivered':
      statuses.some(x=>['Handed to Courier','In Transit'].includes(x))?'In Transit':
      statuses.some(x=>x==='Ready for Dispatch')?'Ready for Dispatch':'Active';
    changed.push({
      workspace:SPGS_WORKSPACE,
      id:r.id,
      plan_no:r.planNo||'',
      source_type:r.sourceType||'PI',
      source_serial:r.sourceSerial||r.piSerial||'',
      status,
      owner_user:r.ownerUser||'',
      payload,
      updated_at
    });
  }
  if(!changed.length)return;
  await spgsFetch('/spgs_order_fulfilments?on_conflict=workspace,id',{
    method:'POST',
    headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(changed)
  });
  changed.forEach(row=>{
    spgsFulfilmentHashes[row.id]=JSON.stringify(row.payload);
    const x=state.dealerFulfilments.find(y=>y.id===row.id);if(x)x._spgsUpdatedAt=row.updated_at;
  });
}

async function spgsStartSalesOrdersRealtime(){
  if(!spgsSalesOrderCloudReady||!spgsProductionClient)return;
  spgsSalesOrderChannel=spgsProductionClient.channel('spgs-sales-orders-'+SPGS_WORKSPACE)
    .on('postgres_changes',{event:'*',schema:'public',table:'spgs_sales_orders',filter:`workspace=eq.${SPGS_WORKSPACE}`},change=>{
      state.salesOrders=state.salesOrders||[];
      if(change.eventType==='DELETE'){
        const id=change.old?.id;if(id){state.salesOrders=state.salesOrders.filter(x=>x.id!==id);delete spgsSalesOrderHashes[id]}
      }else{
        const incoming={...(change.new?.payload||{}),_spgsUpdatedAt:change.new?.updated_at||new Date().toISOString()};
        if(!incoming.id)return;
        const i=state.salesOrders.findIndex(x=>x.id===incoming.id);
        if(i>=0)state.salesOrders[i]=incoming;else state.salesOrders.unshift(incoming);
        spgsSalesOrderHashes[incoming.id]=spgsV109Signature(incoming);
      }
      spgsWriteLocal();
      try{if($('salesorders')?.classList.contains('active')&&window.renderSalesOrders91)window.renderSalesOrders91()}catch(e){console.warn('Sales Orders realtime render failed',e)}
      try{window.bpSoRealtimeRefreshV1032?.('sales-order')}catch(e){console.warn('Portal Sales Order realtime render failed',e)}
    }).subscribe(status=>console.log('Sales Orders realtime status:',status));
}

async function spgsStartFulfilmentRealtime(){
  if(!spgsFulfilmentCloudReady||!spgsProductionClient)return;
  spgsFulfilmentChannel=spgsProductionClient.channel('spgs-order-fulfilments-'+SPGS_WORKSPACE)
    .on('postgres_changes',{event:'*',schema:'public',table:'spgs_order_fulfilments',filter:`workspace=eq.${SPGS_WORKSPACE}`},change=>{
      state.dealerFulfilments=state.dealerFulfilments||[];
      if(change.eventType==='DELETE'){
        const id=change.old?.id;if(id){state.dealerFulfilments=state.dealerFulfilments.filter(x=>x.id!==id);delete spgsFulfilmentHashes[id]}
      }else{
        const incoming={...(change.new?.payload||{}),_spgsUpdatedAt:change.new?.updated_at||new Date().toISOString()};
        if(!incoming.id)return;
        const i=state.dealerFulfilments.findIndex(x=>x.id===incoming.id);
        if(i>=0)state.dealerFulfilments[i]=incoming;else state.dealerFulfilments.unshift(incoming);
        spgsFulfilmentHashes[incoming.id]=spgsV109Signature(incoming);
      }
      spgsWriteLocal();
      try{if($('dealerfulfilment')?.classList.contains('active')&&window.renderDealerFulfilment)window.renderDealerFulfilment()}catch(e){console.warn('Order Fulfilment realtime render failed',e)}
      try{window.bpSoRealtimeRefreshV1032?.('fulfilment')}catch(e){console.warn('Portal fulfilment realtime render failed',e)}
    }).subscribe(status=>console.log('Order Fulfilment realtime status:',status));
}

let spgsPurchaseHashes={};
function spgsCleanPurchasePayload(r){const x={...r};delete x._spgsUpdatedAt;return x}
function spgsPurchaseSignature(r){return JSON.stringify(spgsCleanPurchasePayload(r))}
async function spgsLoadPurchaseOrders(){
  const rows=await spgsFetch(`/spgs_purchase_orders?workspace=eq.${encodeURIComponent(SPGS_WORKSPACE)}&select=id,payload,updated_at&order=updated_at.desc`);
  const list=(rows||[]).map(row=>({...(row.payload||{}),_spgsUpdatedAt:row.updated_at})).filter(x=>x.id);spgsPurchaseHashes={};list.forEach(r=>spgsPurchaseHashes[r.id]=spgsPurchaseSignature(r));spgsPurchaseCloudReady=true;return list
}
async function spgsSyncPurchaseOrders(force=false){
  if(!spgsPurchaseCloudReady)return;state.purchaseOrders=state.purchaseOrders||[];const changed=[];for(const r of state.purchaseOrders){if(!r?.id)continue;const payload=spgsCleanPurchasePayload(r),sig=JSON.stringify(payload);if(!force&&spgsPurchaseHashes[r.id]===sig)continue;const updated_at=new Date().toISOString();changed.push({workspace:SPGS_WORKSPACE,id:r.id,po_no:r.poNo||'',supplier:r.supplier?.name||'',status:r.status||'Draft',created_by:r.createdBy||'',payload,updated_at})}if(!changed.length)return;await spgsFetch('/spgs_purchase_orders?on_conflict=workspace,id',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(changed)});changed.forEach(row=>{spgsPurchaseHashes[row.id]=JSON.stringify(row.payload);const p=state.purchaseOrders.find(x=>x.id===row.id);if(p)p._spgsUpdatedAt=row.updated_at})
}
async function spgsStartPurchaseOrdersRealtime(){
  if(!spgsPurchaseCloudReady||!spgsProductionClient)return;spgsPurchaseChannel=spgsProductionClient.channel('spgs-purchase-orders-'+SPGS_WORKSPACE).on('postgres_changes',{event:'*',schema:'public',table:'spgs_purchase_orders',filter:`workspace=eq.${SPGS_WORKSPACE}`},change=>{state.purchaseOrders=state.purchaseOrders||[];if(change.eventType==='DELETE'){const id=change.old?.id;if(id){state.purchaseOrders=state.purchaseOrders.filter(x=>x.id!==id);delete spgsPurchaseHashes[id]}}else{const incoming={...(change.new?.payload||{}),_spgsUpdatedAt:change.new?.updated_at||new Date().toISOString()};if(!incoming.id)return;const i=state.purchaseOrders.findIndex(x=>x.id===incoming.id);if(i>=0)state.purchaseOrders[i]=incoming;else state.purchaseOrders.unshift(incoming);spgsPurchaseHashes[incoming.id]=spgsPurchaseSignature(incoming)}spgsWriteLocal();try{if(window.refreshPOAutoCompleteLists)window.refreshPOAutoCompleteLists();if($('purchaseorders')?.classList.contains('active'))renderPurchaseOrders()}catch(e){console.warn('Purchase Orders realtime render failed',e)}}).subscribe(status=>console.log('Purchase Orders realtime status:',status))
}

async function spgsStartProductionRealtime(){

    const ok=await loadScript(
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
        ()=>window.supabase && window.supabase.createClient
    );

    if(!ok){
        throw new Error('Supabase Realtime library could not be loaded');
    }

    const key=spgsApiKey();

    spgsProductionClient=window.supabase.createClient(
        'https://qyxgamverzdmhtvezbft.supabase.co',
        key,
        {
            auth:{
                persistSession:false,
                autoRefreshToken:false,
                detectSessionInUrl:false
            }
        }
    );

    spgsProductionChannel=spgsProductionClient
        .channel('spgs-production-'+SPGS_WORKSPACE)

        .on(
            'postgres_changes',
            {
                event:'*',
                schema:'public',
                table:'spgs_production_requests',
                filter:`workspace=eq.${SPGS_WORKSPACE}`
            },

            change=>{

                state.productionRequests=state.productionRequests||[];

                // DELETE
                if(change.eventType==='DELETE'){

                    const id=change.old?.id;

                    if(id){
                        state.productionRequests=
                            state.productionRequests.filter(x=>x.id!==id);
                        delete spgsProductionHashes[id];
                        delete spgsProductionSeen[id];
                    }

                }

                // INSERT / UPDATE
                else{

                  const incoming={
    ...(change.new?.payload||{}),

    _spgsUpdatedAt:
        change.new?.updated_at ||
        new Date().toISOString()
};

                    if(!incoming || !incoming.id)return;

                    const index=
                        state.productionRequests.findIndex(
                            x=>x.id===incoming.id
                        );

                    if(index>=0){
                        state.productionRequests[index]=incoming;
                    }else{
                        state.productionRequests.unshift(incoming);
                    }
                    spgsProductionHashes[incoming.id]=spgsProductionSignature(incoming);
                }

                // Prevent the realtime event being written back again.
                spgsProductionJson=
                    JSON.stringify(state.productionRequests);

                // Keep local backup current.
                spgsWriteLocal();


                // Update Production screen immediately.
                try{
                    if(
                        $('production') &&
                        $('production').classList.contains('active')
                    ){
                        renderProductionBoard();
                    }
                }catch(e){
                    console.warn(
                        'Production board realtime render failed',
                        e
                    );
                }


                // Products summary uses the same realtime Production source.
                try{
                    if(
                        $('productionproducts') &&
                        $('productionproducts').classList.contains('active')
                    ){
                        renderProductionProducts();
                    }
                }catch(e){
                    console.warn(
                        'Products realtime render failed',
                        e
                    );
                }


                // Production dispatch information is also used here.
                try{
                    if(
                        $('stores') &&
                        $('stores').classList.contains('active')
                    ){
                        renderStoresQueueV8();
                    }
                }catch(e){}

                console.log(
                    'Production realtime:',
                    change.eventType,
                    change.new?.order_no ||
                    change.old?.order_no ||
                    ''
                );
            }
        )

        .subscribe(status=>{
            console.log(
                'Production realtime status:',
                status
            );

            if(status==='SUBSCRIBED'){
                console.log(
                    'SoftCreation Production realtime connected'
                );
            }
        });
}
  /* v1.0.41 performance-safe local backup writer.
     Business state is unchanged. Only redundant synchronous serialization /
     localStorage writes are coalesced. */
  function spgsLocalPayload(){
    return {
      ...state,
      users:(state.users||[]).map(u=>{const x={...u};delete x.password;return x})
    };
  }
  let spgsLocalWriteTimer=0;
  let spgsLocalLastRaw='';
  let spgsLocalWritePending=false;
  function spgsWriteLocalNow(){
    if(!spgsLocalWritePending && spgsLocalLastRaw)return;
    spgsLocalWritePending=false;
    clearTimeout(spgsLocalWriteTimer);spgsLocalWriteTimer=0;
    try{
      const raw=JSON.stringify(spgsLocalPayload());
      if(raw===spgsLocalLastRaw)return;
      SPGS_LOCAL_KEYS.forEach(k=>{
        try{if(localStorage.getItem(k)!==raw)localStorage.setItem(k,raw)}catch(_){}
      });
      spgsLocalLastRaw=raw;
    }catch(e){console.warn('SPGS local save failed',e)}
  }
  function spgsWriteLocal(){
    spgsLocalWritePending=true;
    if(spgsLocalWriteTimer)return;
    spgsLocalWriteTimer=setTimeout(spgsWriteLocalNow,60);
  }
  window.addEventListener('pagehide',spgsWriteLocalNow);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')spgsWriteLocalNow()});
  function spgsFreshness(x){
    if(!x||typeof x!=='object')return 0;
    let best=0;
    const auditAt=x.audit?.[0]?.at;if(auditAt)best=Math.max(best,Date.parse(auditAt)||0);
    (x.docs||[]).slice(0,25).forEach(d=>{best=Math.max(best,Date.parse(d.updatedAt||d.revisedAt||d.createdAt||d.created||0)||Number(d.created)||0)});
    (x.quoteRequests||[]).slice(0,25).forEach(r=>best=Math.max(best,Date.parse(r.createdAt||0)||0));
    return best;
  }
  function spgsBestLocal(){
    let best=null,bestScore=-1;
    for(const k of SPGS_LOCAL_KEYS){
      try{const raw=localStorage.getItem(k);if(!raw)continue;const x=JSON.parse(raw),score=spgsFreshness(x)+(k.includes('v85')?1:0);if(score>bestScore){best=x;bestScore=score}}catch(e){}
    }
    return best||JSON.parse(JSON.stringify(state));
  }
  async function spgsLoadUsers(){
    const rows=await spgsFetch('/spgs_users?select=*&order=created_at.asc');
    return (rows||[]).map(spgsUserFromRow);
  }
  async function spgsSyncUsers(force=false){
    const users=(state.users||[]).filter(u=>u?.id&&u?.username&&u?.password!==undefined);
    const sig=JSON.stringify(users);if(!force&&sig===spgsLastUsersJson)return;
    if(!users.length)return;
    await spgsFetch('/spgs_users?on_conflict=id',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(users.map(spgsUserToRow))});
    spgsLastUsersJson=sig;
  }
  async function spgsLoadCloudState(){
    const rows=await spgsFetch(`/spgs_app_state?workspace=eq.${encodeURIComponent(SPGS_WORKSPACE)}&select=payload,revision,updated_at&limit=1`);
    return rows?.[0]||null;
  }
  async function spgsWriteCloudState(){
    const row={workspace:SPGS_WORKSPACE,payload:spgsCloudPayload(),revision:Date.now(),updated_at:new Date().toISOString()};
    await spgsFetch('/spgs_app_state?on_conflict=workspace',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
  }
  async function spgsFlush(){
    if(!spgsReady)return;
    if(spgsSaving){spgsSaveAgain=true;return}
    spgsSaving=true;
    try{
    // Quote Requests are synced first. During the live migration this guarantees
    // the dedicated record is safely stored before the legacy shared payload is
    // written without quoteRequests. If the new table is unavailable, this is a
    // no-op and spgsCloudPayload() continues preserving the legacy field.
    await spgsSyncQuoteRequests();
    await spgsSyncSalesOrders();
    await spgsSyncOrderFulfilments();
    // Save per-record entities first. Only after this succeeds is the compact
    // legacy app_state row written without those mutable collections.
    await spgsSyncEntities();
    await spgsWriteCloudState();
    await spgsSyncUsers();
    await spgsSyncProduction();
    await spgsSyncPurchaseOrders();
}
    catch(e){console.error('SPGS cloud save failed',e);toast('Cloud save failed - local copy kept')}
    finally{spgsSaving=false;if(spgsSaveAgain){spgsSaveAgain=false;spgsSchedule(80)}}
  }
  function spgsSchedule(ms=300){clearTimeout(spgsSaveTimer);spgsSaveTimer=setTimeout(spgsFlush,ms)}

  saveState=function(){
    state.productionRequests=state.productionRequests||[];
    state.purchaseOrders=state.purchaseOrders||[];
    state.notifications=state.notifications||[];
    state.grns=state.grns||[];
    state.quoteRequests=state.quoteRequests||[];
    state.salesOrders=state.salesOrders||[];
    state.dealerFulfilments=state.dealerFulfilments||[];
    spgsWriteLocal();
    try{updateStats()}catch(e){}
    try{if($('productionproducts')?.classList.contains('active'))renderProductionProducts()}catch(e){}
    try{if($('purchaseorders')?.classList.contains('active'))renderPurchaseOrders()}catch(e){}
    try{if($('salesorders')?.classList.contains('active')&&window.renderSalesOrders91)window.renderSalesOrders91()}catch(e){}
    try{if($('dealerfulfilment')?.classList.contains('active')&&window.renderDealerFulfilment)window.renderDealerFulfilment()}catch(e){}
    if(spgsReady)spgsSchedule();
  };

  async function spgsBootstrap(){
    const err=$('loginError');
    try{
      if(err){err.style.display='block';err.textContent='Connecting to SoftCreation cloud database...'}
      const local=spgsBestLocal(),localUsers=Array.isArray(local.users)?local.users.filter(u=>u?.username&&u?.password):[];
      const [cloud,cloudUsers0]=await Promise.all([spgsLoadCloudState(),spgsLoadUsers()]);
      let cloudUsers=cloudUsers0;

      if(!cloud){
        state={...state,...local,current:local.current||state.current};
        if(localUsers.length){state.users=localUsers;await spgsSyncUsers(true);cloudUsers=await spgsLoadUsers()}
        else state.users=cloudUsers;
        migrateV7();migrateUserPrivileges();
        await spgsWriteCloudState();
      }else{
        const localCurrent=state.current;
        const payload=(cloud.payload&&typeof cloud.payload==='object')?cloud.payload:{};
        state={...state,...payload,current:localCurrent||null,users:cloudUsers};
        migrateV7();migrateUserPrivileges();
      }

// ------------------------------------
// v1.0.10 per-record business data bootstrap
// ------------------------------------
await spgsBootstrapEntityStore();
// Re-run non-destructive migrations against the authoritative entity rows and
// persist any schema-normalisation changes per record.
migrateV7();migrateUserPrivileges();
if(spgsEntityStoreReady)await spgsSyncEntities(false);

// ------------------------------------
// Production dedicated cloud bootstrap
// ------------------------------------

const cloudProduction=await spgsLoadProduction();

if(cloudProduction.length){

    // Existing production table wins.
    state.productionRequests=cloudProduction;

}else{

    // First upgrade from old v8.7:
    // productionRequests already in state are copied to
    // the new realtime table.
    state.productionRequests=
        state.productionRequests||[];

    if(state.productionRequests.length){
        await spgsSyncProduction(true);
    }
}

// ------------------------------------
// Supplier Purchase Orders dedicated cloud bootstrap
// ------------------------------------
try{
  const cloudPurchaseOrders=await spgsLoadPurchaseOrders();
  state.purchaseOrders=cloudPurchaseOrders;
}catch(e){
  // Live-system safety: if the new SQL has not been run yet, the rest of the
  // application continues normally and no existing data is modified.
  spgsPurchaseCloudReady=false;
  state.purchaseOrders=state.purchaseOrders||[];
  console.warn('Purchase Orders cloud table is not ready yet. Run spgs_purchase_orders.sql.',e);
}

// ------------------------------------
// Quote Requests dedicated realtime cloud bootstrap
// ------------------------------------
try{
  // Keep any legacy requests already loaded from spgs_app_state/local backup.
  const legacyQuoteRequests=Array.isArray(state.quoteRequests)
      ? state.quoteRequests.filter(x=>x?.id)
      : [];

  const cloudQuoteRequests=await spgsLoadQuoteRequests();

  // Merge by id. Dedicated-table rows win when both copies exist, while any
  // legacy-only request is retained and then migrated into the new table.
  const merged=new Map();
  legacyQuoteRequests.forEach(r=>merged.set(r.id,r));
  cloudQuoteRequests.forEach(r=>merged.set(r.id,r));
  state.quoteRequests=[...merged.values()].sort((a,b)=>
      (Date.parse(b.createdAt||b._spgsUpdatedAt||0)||0)-
      (Date.parse(a.createdAt||a._spgsUpdatedAt||0)||0)
  );

  // Inserts only legacy/missing or changed rows. Existing dedicated rows are
  // protected by signatures and are not blindly overwritten.
  await spgsSyncQuoteRequests(false);
}catch(e){
  // Deployment-order safety: if SQL is not installed yet, keep quoteRequests
  // in the legacy shared state so existing requests cannot disappear.
  spgsQuoteRequestCloudReady=false;
  state.quoteRequests=state.quoteRequests||[];
  console.warn('Quote Requests cloud table is not ready yet. Run spgs_quote_requests.sql.',e);
}


// ------------------------------------
// v1.0.9 Repeat Sales Orders dedicated realtime bootstrap
// ------------------------------------
try{
  const legacySales=[
    ...(Array.isArray(local?.salesOrders)?local.salesOrders:[]),
    ...(Array.isArray(state.salesOrders)?state.salesOrders:[])
  ].filter(x=>x?.id);
  const cloudSales=await spgsLoadSalesOrders();
  const mergedSales=new Map();
  legacySales.forEach(x=>mergedSales.set(x.id,x));
  cloudSales.forEach(x=>mergedSales.set(x.id,x));
  state.salesOrders=[...mergedSales.values()].sort((a,b)=>(Date.parse(b.updatedAt||b.createdAt||b._spgsUpdatedAt||0)||0)-(Date.parse(a.updatedAt||a.createdAt||a._spgsUpdatedAt||0)||0));
  await spgsSyncSalesOrders(false);
}catch(e){
  spgsSalesOrderCloudReady=false;
  state.salesOrders=state.salesOrders||[];
  console.warn('Sales Orders cloud table is not ready yet. Run spgs_sales_orders_fulfilments.sql.',e);
}

// ------------------------------------
// v1.0.9 Order Fulfilment dedicated realtime bootstrap
// ------------------------------------
try{
  const legacyFulfilments=[
    ...(Array.isArray(local?.dealerFulfilments)?local.dealerFulfilments:[]),
    ...(Array.isArray(state.dealerFulfilments)?state.dealerFulfilments:[])
  ].filter(x=>x?.id);
  const cloudFulfilments=await spgsLoadOrderFulfilments();
  const mergedFulfilments=new Map();
  legacyFulfilments.forEach(x=>mergedFulfilments.set(x.id,x));
  cloudFulfilments.forEach(x=>mergedFulfilments.set(x.id,x));
  state.dealerFulfilments=[...mergedFulfilments.values()].sort((a,b)=>(Date.parse(b.updatedAt||b.createdAt||b._spgsUpdatedAt||0)||0)-(Date.parse(a.updatedAt||a.createdAt||a._spgsUpdatedAt||0)||0));
  await spgsSyncOrderFulfilments(false);
}catch(e){
  spgsFulfilmentCloudReady=false;
  state.dealerFulfilments=state.dealerFulfilments||[];
  console.warn('Order Fulfilment cloud table is not ready yet. Run spgs_sales_orders_fulfilments.sql.',e);
}

spgsProductionJson=
    JSON.stringify(state.productionRequests||[]);
      if(!state.users.length)throw new Error('spgs_users is empty. Run the supplied SQL and refresh.');
      state.users.forEach(u=>{u.companyLinkType=u.companyLinkType||'';u.companyLinkId=u.companyLinkId||''});
      await spgsSyncUsers(true);
      spgsLastUsersJson=JSON.stringify(state.users);
      spgsReady=true;
      try{
    await spgsStartProductionRealtime();
}catch(e){
    console.error(
        'Production realtime could not start',
        e
    );

    toast(
        'Production realtime offline - normal cloud save still works'
    );
}
      if(spgsEntityStoreReady){
        try{await spgsStartEntityRealtime()}catch(e){console.error('Per-record entity realtime could not start',e)}
      }
      if(spgsPurchaseCloudReady){
        try{await spgsStartPurchaseOrdersRealtime()}catch(e){console.error('Purchase Orders realtime could not start',e)}
      }
      if(spgsQuoteRequestCloudReady){
        try{await spgsStartQuoteRequestsRealtime()}catch(e){console.error('Quote Requests realtime could not start',e)}
      }
      if(spgsSalesOrderCloudReady){
        try{await spgsStartSalesOrdersRealtime()}catch(e){console.error('Sales Orders realtime could not start',e)}
      }
      if(spgsFulfilmentCloudReady){
        try{await spgsStartFulfilmentRealtime()}catch(e){console.error('Order Fulfilment realtime could not start',e)}
      }
      spgsWriteLocal();

      const session=(()=>{try{return JSON.parse(sessionStorage.getItem('sc_active_user_v75_clean')||'null')}catch(e){return null}})();
      if(session){
        const u=state.users.find(x=>x.id===session.id&&x.active!==false);
        if(u){currentUser={id:u.id,username:u.username,display:u.display,role:u.role};$('loginScreen').style.display='none';$('currentUserChip').textContent=`${u.display} • ${u.role}`}
        else{sessionStorage.removeItem('sc_active_user_v75_clean');currentUser=null;$('loginScreen').style.display='flex'}
      }
      if(currentUser?.username)await spgsLoadProductionSeen();
      refreshAll();
      try{applyUserAccess()}catch(e){}
      try{refreshBranchCustomerProfiles()}catch(e){}
      if(err){err.style.display='none';err.textContent=''}
      console.info('SPGS Supabase connected');
    }catch(e){
      spgsBootError=e;console.error('SPGS bootstrap failed',e);
      if(err){err.style.display='block';err.textContent='Cloud connection failed: '+e.message}
    }
  }

  const spgsExistingLogin=loginUser;
  loginUser=async function(){
    if(!spgsReady&&!spgsBootError)await spgsReadyPromise;
    if(!spgsReady){toast('Cloud database is not connected');return}
    const result=spgsExistingLogin();
    if(currentUser?.username){
      await spgsLoadProductionSeen();
      try{renderProductionBoard()}catch(e){}
    }
    return result;
  };

  const spgsExistingLogout=logoutUser;
  logoutUser=function(){
    spgsProductionSeen={};
    spgsProductionSeenReady=false;
    return spgsExistingLogout.apply(this,arguments);
  };

  window.spgsResetSupabaseKey=function(){localStorage.removeItem(SPGS_KEY_STORE);location.reload()};
  window.spgsCloudSaveNow=async function(){if(!spgsReady)return false;await spgsFlush();toast('Cloud save completed');return true};
  window.spgsPurchaseOrdersCloudReady=()=>spgsPurchaseCloudReady;
  window.spgsQuoteRequestsCloudReady=()=>spgsQuoteRequestCloudReady;
  window.spgsSalesOrdersCloudReady=()=>spgsSalesOrderCloudReady;
  window.spgsOrderFulfilmentCloudReady=()=>spgsFulfilmentCloudReady;
  window.spgsEntityStoreCloudReady=()=>spgsEntityStoreReady;

  const spgsReadyPromise=spgsBootstrap();
})();
