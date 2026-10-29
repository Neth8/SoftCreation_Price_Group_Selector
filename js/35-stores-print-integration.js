
/* V1.0.71 - Separate SoftCreation PI Order -> Stores Print Integration (current base)
   Normal Ordexa order tables remain untouched. */
(function(){
  const SC_ORDER_REST_V1070 =
    'https://qyxgamverzdmhtvezbft.supabase.co/rest/v1';

  const SC_ORDER_KEY_STORE_V1070 =
    'spgs_supabase_browser_key_v1';

  function scOrderKeyV1070(){
    return String(
      localStorage.getItem(SC_ORDER_KEY_STORE_V1070) || ''
    ).trim();
  }

  function scOrderHeadersV1070(extra={}){
    const key=scOrderKeyV1070();

    if(!key){
      throw new Error(
        'Supabase browser key is not configured in this browser.'
      );
    }

    const headers={
      apikey:key,
      'Content-Type':'application/json',
      ...extra
    };

    if(key.startsWith('eyJ')){
      headers.Authorization='Bearer '+key;
    }

    return headers;
  }

  async function scOrderRpcV1070(name,args){
    const res=await fetch(
      `${SC_ORDER_REST_V1070}/rpc/${name}`,
      {
        method:'POST',
        headers:scOrderHeadersV1070(),
        body:JSON.stringify(args||{})
      }
    );

    const raw=await res.text();

    let data=null;

    try{
      data=raw?JSON.parse(raw):null;
    }catch(_){
      data=raw;
    }

    if(!res.ok){
      const message=
        data?.message ||
        data?.hint ||
        data?.details ||
        raw ||
        `HTTP ${res.status}`;

      throw new Error(message);
    }

    return data;
  }

  function activePiLinesV1070(doc){
    return (doc?.lines||[]).filter(
      l=>
        l?.use!==false &&
        Number(l?.qty||0)>0 &&
        (
          String(l?.desc||'').trim() ||
          String(l?.size||'').trim() ||
          String(l?.material||'').trim()
        )
    );
  }

  function lineFinancialsV1070(doc,line){
    const gross=
      Number(line?.qty||0) *
      Number(line?.price||0);

    const rate=
      doc?.vatMode==='vat18'
        ? Number(state?.settings?.vat||18)/100
        : 0;

    const net=
      rate>0
        ? gross/(1+rate)
        : gross;

    const vat=gross-net;

    return {gross,net,vat};
  }

  function buildPiOrderPayloadV1070(doc){
    const totals=
      typeof docTotals==='function'
        ? docTotals(doc)
        : {net:0,vat:0,gross:0};

    const lines=activePiLinesV1070(doc).map(line=>{
      const f=lineFinancialsV1070(doc,line);

      return {
        source_item_id:String(line?.itemId||''),
        description:String(line?.desc||'Item'),
        size_label:String(line?.size||''),
        material:String(line?.material||''),
        layout:String(line?.layout||''),
        pcs_per_roll:
          line?.pcs==='' || line?.pcs==null
            ? null
            : Number(line.pcs),

        qty:Number(line?.qty||0),
        unit:String(line?.unit||''),

        unit_price:Number(line?.price||0),
        net_amount:Number(f.net||0),
        vat_amount:Number(f.vat||0),
        gross_amount:Number(f.gross||0),

        packing:String(line?.packing||''),
        remarks:String(line?.remarks||''),

        cost_snapshot:line?.costSnapshot||null,

        extra:{
          softcreation_category:doc?.category||'',
          source_quote_id:doc?.sourceQuoteId||null
        }
      };
    });

    return {
      pi_id:String(doc?.id||''),
      pi_no:String(doc?.serial||''),
      source_quote_id:String(doc?.sourceQuoteId||''),
      po_ref:String(doc?.poRef||''),
      category:String(doc?.category||''),

      customer:{
        id:String(doc?.customerId||''),
        name:String(doc?.customer?.name||''),
        phone:String(doc?.customer?.phone||''),
        email:String(doc?.customer?.email||''),
        billing_address:String(doc?.customer?.address||''),
        delivery_address:String(
          doc?.customer?.delivery ||
          doc?.customer?.address ||
          ''
        ),
        google_location:String(doc?.customer?.map||''),
        vat_no:String(doc?.customer?.vat||'')
      },

      payment_mode:String(doc?.payMode||''),
      vat_mode:String(doc?.vatMode||''),
      vat_rate:
        doc?.vatMode==='vat18'
          ? Number(state?.settings?.vat||18)
          : 0,

      totals:{
        net:Number(totals?.net||0),
        vat:Number(totals?.vat||0),
        gross:Number(totals?.gross||0)
      },

      delivery_within_3_days:!!doc?.delivery3,
      whatsapp_tracking:!!doc?.whatsappTracking,

      notes:String(doc?.extraNote||''),

      user:{
        display_name:String(
          currentUser?.display ||
          doc?.updatedBy ||
          doc?.createdBy ||
          ''
        ),
        username:String(
          currentUser?.username ||
          doc?.createdByUser ||
          ''
        )
      },

      lines
    };
  }

  function updateLocalPiSyncV1070(doc,result,error=null){
    if(!doc)return;

    if(error){
      doc.softcreationOrderSync={
        ...(doc.softcreationOrderSync||{}),
        status:'failed',
        lastAttemptAt:new Date().toISOString(),
        error:String(error?.message||error)
      };
    }else{
      doc.softcreationOrderSync={
        status:'synced',
        orderId:result?.softcreation_order_id||'',
        orderNo:result?.softcreation_order_no||'',
        printJobId:result?.print_job_id||'',
        printStatus:result?.print_status||'pending',
        printEnqueued:!!result?.print_enqueued,
        created:!!result?.created,
        changed:!!result?.changed,
        lastSyncAt:new Date().toISOString(),
        error:''
      };
    }

    if(typeof saveState==='function')saveState();
  }

  window.syncPIToStoresV1070=async function(docId,manual=false){
    const doc=(state.docs||[]).find(
      d=>d.id===docId && d.type==='PI'
    );

    if(!doc){
      if(manual)toast('PI not found');
      return null;
    }

    if(!String(doc.poRef||'').trim()){
      if(manual)toast(
        'Enter the customer PO / Reference before sending this PI.'
      );
      return null;
    }

    const payload=buildPiOrderPayloadV1070(doc);

    if(!payload.lines.length){
      if(manual)toast('PI has no active quantity lines');
      return null;
    }

    try{
      if(manual){
        toast('Sending PI order to Stores...');
      }

      const result=await scOrderRpcV1070(
        'softcreation_upsert_order_from_pi',
        {p_payload:payload}
      );

      updateLocalPiSyncV1070(doc,result,null);

      if(typeof renderDocLists==='function'){
        renderDocLists();
      }

      if(manual){
        if(result?.print_enqueued){
          toast(
            `${result.softcreation_order_no} sent to Stores printer queue`
          );
        }else{
          toast(
            `${result.softcreation_order_no} already synced - no duplicate print created`
          );
        }
      }

      return result;

    }catch(err){
      console.error(
        'SoftCreation PI -> Stores sync failed',
        err
      );

      updateLocalPiSyncV1070(doc,null,err);

      if(typeof renderDocLists==='function'){
        renderDocLists();
      }

      toast(
        `PI saved, but Stores sync failed: ${err.message||err}`
      );

      return null;
    }
  };

  window.refreshPIPrintStatusV1070=async function(docId){
    const doc=(state.docs||[]).find(
      d=>d.id===docId && d.type==='PI'
    );

    if(!doc)return;

    try{
      const result=await scOrderRpcV1070(
        'softcreation_get_order_sync_status',
        {p_pi_id:String(doc.id)}
      );

      if(!result?.found){
        doc.softcreationOrderSync={
          ...(doc.softcreationOrderSync||{}),
          status:'not_synced',
          printStatus:'not_queued'
        };
      }else{
        doc.softcreationOrderSync={
          ...(doc.softcreationOrderSync||{}),
          status:'synced',
          orderId:result.softcreation_order_id||'',
          orderNo:result.softcreation_order_no||'',
          printJobId:result.print_job_id||'',
          printStatus:result.print_status||'not_queued',
          claimedBy:result.claimed_by||'',
          printedAt:result.printed_at||'',
          failedAt:result.failed_at||'',
          error:result.error_message||'',
          lastStatusCheckAt:new Date().toISOString()
        };
      }

      saveState();
      renderDocLists();

      const ps=doc.softcreationOrderSync?.printStatus||'not_queued';

      if(ps==='printed'){
        toast(
          `${doc.softcreationOrderSync.orderNo} Stores receipt printed`
        );
      }else if(ps==='failed'){
        toast(
          `Stores print failed: ${doc.softcreationOrderSync.error||'Unknown printer error'}`
        );
      }else{
        toast(`Stores print status: ${ps}`);
      }

    }catch(err){
      toast(
        `Could not check Stores print status: ${err.message||err}`
      );
    }
  };

  function syncBadgeHtmlV1070(doc){
    if(doc?.linkedSalesOrderId){
      return `
        <div class="sc-order-sync-v1070 synced">
          <b>LINKED SALES ORDER</b>
          <span>${esc(doc.linkedSalesOrderNo||'-')} • Receipt handled from Sales Orders</span>
        </div>`;
    }

    const s=doc?.softcreationOrderSync||{};

    if(s.status==='failed'){
      return `
        <div class="sc-order-sync-v1070 failed">
          <b>STORES SYNC FAILED</b>
          <span>${esc(s.error||'Retry required')}</span>
          <button
            class="btn red sm"
            type="button"
            onclick="syncPIToStoresV1070('${doc.id}',true)"
          >Retry</button>
        </div>`;
    }

    if(s.status==='synced'){
      const printStatus=String(
        s.printStatus||'pending'
      ).toLowerCase();

      return `
        <div class="sc-order-sync-v1070 ${esc(printStatus)}">
          <b>${esc(s.orderNo||'SOFTCREATION ORDER')}</b>
          <span>
            Stores Print:
            ${esc(printStatus.toUpperCase())}
          </span>
          <div class="sc-order-sync-actions-v1070">
            <button
              class="btn ghost sm"
              type="button"
              onclick="refreshPIPrintStatusV1070('${doc.id}')"
            >Check Print</button>
            <button
              class="btn ghost sm"
              type="button"
              onclick="syncPIToStoresV1070('${doc.id}',true)"
            >Resync</button>
          </div>
        </div>`;
    }

    return `
      <div class="sc-order-sync-v1070 waiting">
        <b>NOT SENT TO STORES</b>
        <span>Save this PI to create the Stores order.</span>
        <button
          class="btn navy sm"
          type="button"
          onclick="syncPIToStoresV1070('${doc.id}',true)"
        >Send Now</button>
      </div>`;
  }

  function decoratePiListV1070(){
    const list=$('piList');
    if(!list)return;

    list.querySelectorAll('tbody tr').forEach(tr=>{
      const serial=String(
        tr.querySelector('td:first-child b')?.textContent||''
      ).trim();

      const doc=(state.docs||[]).find(
        d=>d.type==='PI' && d.serial===serial
      );

      if(!doc)return;

      const cells=tr.querySelectorAll('td');
      const statusCell=cells[5];

      if(!statusCell)return;

      let host=statusCell.querySelector(
        '.sc-order-sync-host-v1070'
      );

      if(!host){
        host=document.createElement('div');
        host.className='sc-order-sync-host-v1070';
        statusCell.appendChild(host);
      }

      host.innerHTML=syncBadgeHtmlV1070(doc);
    });
  }

  const renderDocListsBaseV1070=window.renderDocLists;

  if(typeof renderDocListsBaseV1070==='function'){
    window.renderDocLists=function(){
      const result=
        renderDocListsBaseV1070.apply(this,arguments);

      decoratePiListV1070();

      return result;
    };

    try{
      renderDocLists=window.renderDocLists;
    }catch(_){}
  }

  /*
    PI is the confirmed-order event:
    the PI is saved locally/cloud first, then the separate
    SoftCreation Stores order is synced.
    A sync failure does NOT destroy the saved PI.
  */
  const persistBaseV1070=window.persistCurrentDocument;

  if(typeof persistBaseV1070==='function'){
    window.persistCurrentDocument=async function(){
      const doc=
        await persistBaseV1070.apply(this,arguments);

      if(doc?.type==='PI' && String(doc?.poRef||'').trim()){
        await syncPIToStoresV1070(doc.id,false);
      }

      return doc;
    };

    try{
      persistCurrentDocument=
        window.persistCurrentDocument;
    }catch(_){}
  }

  window.buildPiOrderPayloadV1070=
    buildPiOrderPayloadV1070;

  setTimeout(()=>{
    try{
      renderDocLists();
    }catch(_){}
  },0);
})();
