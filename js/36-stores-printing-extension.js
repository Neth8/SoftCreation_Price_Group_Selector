
/* =========================================================
   V1.0.72
   STORES PRINTING EXTENSION
   ---------------------------------------------------------
   1) PI receipt reprint
   2) Approved Prices Sales Order -> Stores receipts
   3) One separate receipt for every delivery customer
   4) Same Approved Prices Customer / Company retained as parent
   ========================================================= */
(function(){
  'use strict';

  const REST_V1072='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1';
  const KEY_STORE_V1072='spgs_supabase_browser_key_v1';

  function keyV1072(){
    return String(
      localStorage.getItem(KEY_STORE_V1072)||''
    ).trim();
  }

  function headersV1072(){
    const key=keyV1072();

    if(!key){
      throw new Error(
        'Supabase browser key is not configured in this browser.'
      );
    }

    const h={
      apikey:key,
      'Content-Type':'application/json'
    };

    if(key.startsWith('eyJ')){
      h.Authorization='Bearer '+key;
    }

    return h;
  }

  async function rpcV1072(name,args={}){
    const res=await fetch(
      `${REST_V1072}/rpc/${name}`,
      {
        method:'POST',
        headers:headersV1072(),
        body:JSON.stringify(args)
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
      throw new Error(
        data?.message||
        data?.details||
        data?.hint||
        raw||
        `HTTP ${res.status}`
      );
    }

    return data;
  }

  function currentDisplayV1072(){
    return String(
      currentUser?.display||
      currentUser?.username||
      'SoftCreation'
    );
  }

  /* -------------------------------------------------------
     PI REPRINT
     ------------------------------------------------------- */
  window.reprintPIStoresV1072=async function(docId){
    const doc=(state.docs||[]).find(
      d=>d.id===docId && d.type==='PI'
    );

    if(!doc)return toast('PI not found');

    try{
      toast('Queuing PI receipt reprint...');

      const result=await rpcV1072(
        'softcreation_reprint_pi_order',
        {
          p_pi_id:String(doc.id),
          p_requested_by_name:currentDisplayV1072()
        }
      );

      doc.softcreationOrderSync={
        ...(doc.softcreationOrderSync||{}),
        status:'synced',
        orderId:
          result?.softcreation_order_id||
          doc.softcreationOrderSync?.orderId||
          '',
        orderNo:
          result?.softcreation_order_no||
          doc.softcreationOrderSync?.orderNo||
          '',
        printJobId:result?.print_job_id||'',
        printStatus:result?.print_status||'pending',
        isReprint:true,
        error:'',
        lastReprintAt:new Date().toISOString()
      };

      saveState();
      renderDocLists();

      toast(
        `${doc.softcreationOrderSync.orderNo||'PI'} reprint queued`
      );

    }catch(err){
      console.error('PI Stores reprint failed',err);
      toast(`Reprint failed: ${err.message||err}`);
    }
  };

  function decoratePIReprintV1072(){
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

      const host=tr.querySelector(
        '.sc-order-sync-actions-v1070'
      );

      if(!host)return;

      if(
        !host.querySelector('.sc-pi-reprint-v1072') &&
        doc.softcreationOrderSync?.status==='synced'
      ){
        const b=document.createElement('button');
        b.className='btn amber sm sc-pi-reprint-v1072';
        b.type='button';
        b.textContent='Reprint';
        b.onclick=()=>reprintPIStoresV1072(doc.id);
        host.insertBefore(
          b,
          host.querySelector('button:last-child')
        );
      }
    });
  }

  if(typeof window.renderDocLists==='function'){
    const baseRenderDocsV1072=window.renderDocLists;

    window.renderDocLists=function(){
      const r=baseRenderDocsV1072.apply(this,arguments);
      decoratePIReprintV1072();
      return r;
    };

    try{renderDocLists=window.renderDocLists}catch(_){}
  }

  /* -------------------------------------------------------
     APPROVED PRICES SALES ORDER PAYLOAD
     ------------------------------------------------------- */
  function buildSalesOrderPayloadV1072(so){
    const lines=(so?.lines||[]).map((l,i)=>({
      line_index:i,
      source_item_id:String(l?.itemId||''),

      description:String(l?.desc||'Item'),
      size_label:String(l?.size||''),
      material:String(l?.material||''),
      layout:String(l?.layout||''),
      pcs_per_roll:
        l?.pcs==='' || l?.pcs==null
          ? null
          : Number(l.pcs),

      qty:Number(l?.qty||0),
      unit:String(l?.unit||'Rolls'),

      unit_price:Number(l?.price||0),

      source_pi_id:String(l?.sourcePIId||''),
      source_pi_serial:String(l?.sourcePISerial||''),
      source_quote_id:String(l?.sourceQuoteId||''),
      source_quote_serial:String(l?.sourceQuoteSerial||'')
    }));

    const deliveries=(so?.deliveries||[])
      .map((d,di)=>({
        sequence:Number(d?.sequence||di+1),
        primary:
          typeof d?.primary==='boolean'
            ? d.primary
            : di===0,

        name:String(d?.name||so?.customerName||''),
        line1:String(d?.line1||''),
        line2:String(d?.line2||''),
        contact1:String(d?.contact1||''),
        contact2:String(d?.contact2||''),

        allocations:(d?.allocations||[])
          .map(a=>({
            line_index:Number(a?.lineIndex),
            qty:Number(a?.qty||0)
          }))
          .filter(a=>
            Number.isInteger(a.line_index) &&
            a.line_index>=0 &&
            a.qty>0
          )
      }))
      .filter(d=>d.allocations.length);

    return {
      source_so_id:String(so?.id||''),
      sales_order_no:String(so?.soNo||''),

      order_date:String(so?.date||''),
      required_date:String(so?.needDate||''),
      customer_ref:String(so?.customerRef||''),
      delivery_method:String(so?.deliveryMethod||so?.method||''),

      parent_customer:{
        id:String(so?.customerId||''),
        name:String(so?.customerName||''),
        phone:String(so?.customerPhone||'')
      },

      source_pi_ids:Array.isArray(so?.sourcePIIds)
        ? so.sourcePIIds
        : (so?.sourcePIId?[so.sourcePIId]:[]),

      source_pi_serials:Array.isArray(so?.sourcePISerials)
        ? so.sourcePISerials
        : (so?.sourcePISerial?[so.sourcePISerial]:[]),

      notes:String(so?.note||''),
      order_total:Number(so?.total||0),

      user:{
        display_name:currentDisplayV1072(),
        username:String(currentUser?.username||'')
      },

      lines,
      deliveries
    };
  }

  function saveSOPrintStateV1072(
    so,
    result,
    error=null
  ){
    if(!so)return;

    if(error){
      so.storesPrintV1072={
        ...(so.storesPrintV1072||{}),
        status:'failed',
        error:String(error?.message||error),
        lastAttemptAt:new Date().toISOString()
      };
    }else{
      so.storesPrintV1072={
        status:'synced',
        salesOrderDbId:result?.sales_order_id||'',
        salesOrderNo:result?.sales_order_no||so.soNo||'',
        parentCustomerName:
          result?.parent_customer_name||
          so.customerName||
          '',
        deliveries:Array.isArray(result?.deliveries)
          ? result.deliveries
          : [],
        printEnqueued:!!result?.print_enqueued,
        created:!!result?.created,
        changed:!!result?.changed,
        error:'',
        lastSyncAt:new Date().toISOString()
      };
    }

    saveState();
  }

  window.syncApprovedSalesOrderToStoresV1072=
  async function(soId,manual=false){
    const so=(state.salesOrders||[]).find(
      x=>x.id===soId && x.portalSalesOrder
    );

    if(!so){
      if(manual)toast('Approved Prices Sales Order not found');
      return null;
    }

    const payload=buildSalesOrderPayloadV1072(so);

    if(!payload.parent_customer.name){
      if(manual)toast('Customer / Company is missing');
      return null;
    }

    if(!payload.lines.length){
      if(manual)toast('Sales Order has no lines');
      return null;
    }

    if(!payload.deliveries.length){
      if(manual)toast('Sales Order has no allocated delivery customer');
      return null;
    }

    try{
      if(manual){
        toast('Sending Sales Order receipts to Stores...');
      }

      const result=await rpcV1072(
        'softcreation_upsert_sales_order',
        {p_payload:payload}
      );

      saveSOPrintStateV1072(so,result,null);
      decorateApprovedSOPrintV1072();

      if(manual){
        if(result?.print_enqueued){
          toast(
            `${so.soNo}: ${result.deliveries?.length||0} Stores receipt(s) queued`
          );
        }else{
          toast(
            `${so.soNo} already synced - no duplicate receipt created`
          );
        }
      }

      return result;

    }catch(err){
      console.error(
        'Approved Prices Sales Order -> Stores sync failed',
        err
      );

      saveSOPrintStateV1072(so,null,err);
      decorateApprovedSOPrintV1072();

      toast(
        `${so.soNo} saved, but Stores printing sync failed: ${err.message||err}`
      );

      return null;
    }
  };

  window.refreshApprovedSOPrintV1072=
  async function(soId){
    const so=(state.salesOrders||[]).find(
      x=>x.id===soId
    );

    if(!so)return;

    try{
      const result=await rpcV1072(
        'softcreation_get_sales_order_print_status',
        {p_source_so_id:String(so.id)}
      );

      if(!result?.found){
        so.storesPrintV1072={
          ...(so.storesPrintV1072||{}),
          status:'not_synced',
          deliveries:[]
        };
      }else{
        so.storesPrintV1072={
          ...(so.storesPrintV1072||{}),
          status:'synced',
          salesOrderDbId:result.sales_order_id||'',
          salesOrderNo:result.sales_order_no||so.soNo||'',
          parentCustomerName:
            result.parent_customer_name||
            so.customerName||
            '',
          deliveries:Array.isArray(result.deliveries)
            ? result.deliveries
            : [],
          error:'',
          lastStatusCheckAt:new Date().toISOString()
        };
      }

      saveState();
      decorateApprovedSOPrintV1072();

      const deliveries=
        so.storesPrintV1072?.deliveries||[];

      const printed=
        deliveries.filter(
          d=>String(d.print_status||'').toLowerCase()==='printed'
        ).length;

      toast(
        `${so.soNo}: ${printed}/${deliveries.length} Stores receipt(s) printed`
      );

    }catch(err){
      toast(
        `Could not check Sales Order print status: ${err.message||err}`
      );
    }
  };

  window.reprintApprovedSODeliveryV1072=
  async function(soId,sequence){
    const so=(state.salesOrders||[]).find(
      x=>x.id===soId
    );

    if(!so)return;

    try{
      toast(
        `${so.soNo}/S${String(sequence).padStart(2,'0')} reprint queued...`
      );

      const result=await rpcV1072(
        'softcreation_reprint_sales_order',
        {
          p_source_so_id:String(so.id),
          p_sequence:Number(sequence),
          p_requested_by_name:currentDisplayV1072()
        }
      );

      const existing=
        Array.isArray(so.storesPrintV1072?.deliveries)
          ? so.storesPrintV1072.deliveries
          : [];

      const next=existing.map(d=>
        Number(d.sequence)===Number(sequence)
          ? {
              ...d,
              print_job_id:result.print_job_id||'',
              print_status:'pending',
              is_reprint:true,
              error_message:''
            }
          : d
      );

      so.storesPrintV1072={
        ...(so.storesPrintV1072||{}),
        status:'synced',
        deliveries:next,
        lastReprintAt:new Date().toISOString()
      };

      saveState();
      decorateApprovedSOPrintV1072();

      toast(
        `${result.delivery_order_no||so.soNo} reprint queued`
      );

    }catch(err){
      console.error('Sales Order reprint failed',err);
      toast(`Reprint failed: ${err.message||err}`);
    }
  };



  /* -------------------------------------------------------
     V1.0.76 - SEPARATE SALES ORDERS TAB -> STORES PRINT
     -------------------------------------------------------
     The Sales Orders navigation tab contains older / generic
     Repeat Sales Orders too. Those orders may never have been
     written to softcreation_sales_orders, so "Reprint" cannot
     reprint something that does not exist there.

     Behaviour:
     - If Stores record exists -> reprint it.
     - If Stores record does not exist -> create/sync it first
       and queue the FIRST Stores receipt automatically.
     - A normal single-destination Sales Order is converted to
       one delivery receipt (S01) using shipTo/customer details.
     ------------------------------------------------------- */

  function buildSalesOrderTabPayloadV1076(so){
    const lines=(so?.lines||[]).map((l,i)=>({
      line_index:i,
      source_item_id:String(l?.itemId||''),

      description:String(l?.desc||'Item'),
      size_label:String(l?.size||''),
      material:String(l?.material||''),
      layout:String(l?.layout||''),
      pcs_per_roll:
        l?.pcs==='' || l?.pcs==null
          ? null
          : Number(l.pcs),

      qty:Number(l?.qty||0),
      unit:String(l?.unit||'Rolls'),
      unit_price:Number(l?.price||0),

      source_pi_id:String(
        l?.sourcePIId ||
        so?.sourcePIId ||
        ''
      ),
      source_pi_serial:String(
        l?.sourcePISerial ||
        so?.sourcePISerial ||
        ''
      ),
      source_quote_id:String(l?.sourceQuoteId||''),
      source_quote_serial:String(l?.sourceQuoteSerial||'')
    }))
    .filter(l=>l.qty>0);

    let deliveries=[];

    if(Array.isArray(so?.deliveries) && so.deliveries.length){
      deliveries=so.deliveries
        .map((d,di)=>({
          sequence:Number(d?.sequence||di+1),
          primary:
            typeof d?.primary==='boolean'
              ? d.primary
              : di===0,

          name:String(d?.name||so?.customerName||''),
          line1:String(d?.line1||''),
          line2:String(d?.line2||''),
          contact1:String(d?.contact1||''),
          contact2:String(d?.contact2||''),

          allocations:(d?.allocations||[])
            .map(a=>({
              line_index:Number(a?.lineIndex),
              qty:Number(a?.qty||0)
            }))
            .filter(a=>
              Number.isInteger(a.line_index) &&
              a.line_index>=0 &&
              a.qty>0
            )
        }))
        .filter(d=>d.allocations.length);
    }

    if(!deliveries.length && lines.length){
      const ship=so?.shipTo||{};
      const address=String(
        ship?.address ||
        so?.deliveryAddress ||
        ''
      ).trim();

      deliveries=[{
        sequence:1,
        primary:true,
        name:String(
          ship?.name ||
          so?.customerName ||
          ''
        ),
        line1:address,
        line2:'',
        contact1:String(
          ship?.phone ||
          so?.customerPhone ||
          ''
        ),
        contact2:'',
        allocations:lines.map((l,i)=>({
          line_index:i,
          qty:Number(l.qty||0)
        }))
      }];
    }

    return {
      source_so_id:String(so?.id||''),
      sales_order_no:String(so?.soNo||''),

      order_date:String(so?.date||''),
      required_date:String(so?.needDate||''),
      customer_ref:String(so?.customerRef||''),
      delivery_method:String(so?.deliveryMethod||so?.method||''),

      parent_customer:{
        id:String(so?.customerId||''),
        name:String(so?.customerName||''),
        phone:String(so?.customerPhone||'')
      },

      source_pi_ids:Array.isArray(so?.sourcePIIds)
        ? so.sourcePIIds
        : (so?.sourcePIId?[so.sourcePIId]:[]),

      source_pi_serials:Array.isArray(so?.sourcePISerials)
        ? so.sourcePISerials
        : (so?.sourcePISerial?[so.sourcePISerial]:[]),

      notes:String(so?.note||''),
      order_total:Number(
        so?.total ||
        lines.reduce(
          (s,l)=>s+Number(l.qty||0)*Number(l.unit_price||0),
          0
        ) ||
        0
      ),

      user:{
        display_name:currentDisplayV1072(),
        username:String(currentUser?.username||'')
      },

      lines,
      deliveries
    };
  }

  async function syncSalesOrderTabToStoresV1076(so){
    const payload=buildSalesOrderTabPayloadV1076(so);

    if(!payload.parent_customer.name){
      throw new Error('Customer / Company is missing');
    }

    if(!payload.lines.length){
      throw new Error('Sales Order has no quantity lines');
    }

    if(!payload.deliveries.length){
      throw new Error('Sales Order has no delivery customer');
    }

    const result=await rpcV1072(
      'softcreation_upsert_sales_order',
      {p_payload:payload}
    );

    saveSOPrintStateV1072(
      so,
      result,
      null
    );

    return result;
  }

  window.syncSalesOrderTabToStoresV1076=
    syncSalesOrderTabToStoresV1076;

  window.reprintSalesOrderTabV1076=
  async function(soId){
    const so=(state.salesOrders||[]).find(
      x=>x.id===soId
    );

    if(!so){
      toast('Sales Order not found');
      return;
    }
    if(so.recoveredStoresOrder===true||so.readOnly===true){toast('Recovered Stores order: reprint disabled.');return;}

    try{
      let status=await rpcV1072(
        'softcreation_get_sales_order_print_status',
        {p_source_so_id:String(so.id)}
      );

      /*
        First-time case:
        This Sales Order tab order existed only in local/cloud app
        state and had never been copied to the separate Stores
        printing tables. Create it now. The upsert RPC itself
        queues the FIRST print, therefore do not immediately queue
        a second reprint.
      */
      if(!status?.found){
        toast(
          `${so.soNo}: first Stores print is being created...`
        );

        const firstSync=
          await syncSalesOrderTabToStoresV1076(so);

        if(firstSync?.print_enqueued){
          toast(
            `${so.soNo}: Stores receipt queued`
          );
        }else{
          toast(
            `${so.soNo}: synced to Stores`
          );
        }

        return;
      }

      const deliveries=Array.isArray(status.deliveries)
        ? status.deliveries
        : [];

      if(!deliveries.length){
        throw new Error(
          'Stores order exists but has no delivery receipt'
        );
      }

      let sequence=Number(
        deliveries[0]?.sequence||1
      );

      if(deliveries.length>1){
        const choices=deliveries
          .map(d=>
            `${Number(d.sequence||1)} = ${d.delivery_order_no||''} - ${d.customer_name||''}`
          )
          .join('\n');

        const answer=window.prompt(
          `Select delivery receipt to reprint:\n${choices}`,
          String(sequence)
        );

        if(answer===null)return;

        sequence=Number(answer);

        if(
          !Number.isInteger(sequence) ||
          !deliveries.some(
            d=>Number(d.sequence)===sequence
          )
        ){
          toast('Invalid delivery selection');
          return;
        }
      }

      await reprintApprovedSODeliveryV1072(
        so.id,
        sequence
      );

    }catch(err){
      console.error(
        'Sales Orders tab Stores reprint failed',
        err
      );

      toast(
        `Reprint failed: ${err.message||err}`
      );
    }
  };


  /* -------------------------------------------------------
     V1.0.73 - RELIABLE SALES ORDER REPRINT FROM ORDER CARD
     Works even when the detailed Stores print panel has not
     yet loaded its delivery rows in the browser.
     ------------------------------------------------------- */
  window.reprintApprovedSOFromCardV1073=
  async function(soId){
    const so=(state.salesOrders||[]).find(
      x=>x.id===soId && x.portalSalesOrder
    );

    if(!so){
      toast('Sales Order not found');
      return;
    }
    if(so.recoveredStoresOrder===true||so.readOnly===true){toast('Recovered Stores order: reprint disabled.');return;}

    try{
      const status=await rpcV1072(
        'softcreation_get_sales_order_print_status',
        {p_source_so_id:String(so.id)}
      );

      if(!status?.found){
        toast('This Sales Order has not been synced to Stores yet');
        return;
      }

      const deliveries=Array.isArray(status.deliveries)
        ? status.deliveries
        : [];

      if(!deliveries.length){
        toast('No delivery receipt found for this Sales Order');
        return;
      }

      let sequence=Number(deliveries[0]?.sequence||1);

      if(deliveries.length>1){
        const choices=deliveries
          .map(d=>
            `${Number(d.sequence||1)} = ${d.delivery_order_no||''} - ${d.customer_name||''}`
          )
          .join('\n');

        const answer=window.prompt(
          `Select delivery receipt to reprint:\n${choices}`,
          String(sequence)
        );

        if(answer===null)return;

        sequence=Number(answer);

        if(
          !Number.isInteger(sequence) ||
          !deliveries.some(d=>Number(d.sequence)===sequence)
        ){
          toast('Invalid delivery selection');
          return;
        }
      }

      await reprintApprovedSODeliveryV1072(
        so.id,
        sequence
      );

    }catch(err){
      console.error('Sales Order card reprint failed',err);
      toast(`Reprint failed: ${err.message||err}`);
    }
  };

  function statusClassV1072(status){
    const s=String(status||'not_queued').toLowerCase();

    if(s==='printed')return 'printed';
    if(s==='failed')return 'failed';
    if(s==='pending'||s==='processing')return 'pending';

    return 'waiting';
  }

  function salesPrintHtmlV1072(so){
    const ps=so?.storesPrintV1072||{};

    if(ps.status==='failed'){
      return `
        <div class="sc-so-print-panel-v1072 failed">
          <div class="sc-so-print-head-v1072">
            <b>STORES PRINT SYNC FAILED</b>
            <span>${esc(ps.error||'Retry required')}</span>
          </div>
          <div class="sc-so-print-actions-v1072">
            <button
              class="btn red sm"
              type="button"
              onclick="syncApprovedSalesOrderToStoresV1072('${so.id}',true)"
            >Retry</button>
          </div>
        </div>
      `;
    }

    if(ps.status!=='synced'){
      return `
        <div class="sc-so-print-panel-v1072 waiting">
          <div class="sc-so-print-head-v1072">
            <b>STORES RECEIPTS NOT SYNCED</b>
            <span>
              Parent Company: ${esc(so.customerName||'-')}
            </span>
          </div>
          <div class="sc-so-print-actions-v1072">
            <button
              class="btn navy sm"
              type="button"
              onclick="syncApprovedSalesOrderToStoresV1072('${so.id}',true)"
            >Send to Stores</button>
          </div>
        </div>
      `;
    }

    const ds=Array.isArray(ps.deliveries)
      ? ps.deliveries
      : [];

    return `
      <div class="sc-so-print-panel-v1072">
        <div class="sc-so-print-head-v1072">
          <b>STORES RECEIPTS</b>
          <span>
            Confirmed order from
            <strong>${esc(ps.parentCustomerName||so.customerName||'-')}</strong>
          </span>
        </div>

        <div class="sc-so-print-deliveries-v1072">
          ${
            ds.length
              ? ds.map(d=>{
                  const st=String(
                    d.print_status||'not_queued'
                  ).toUpperCase();

                  return `
                    <div class="sc-so-print-delivery-v1072 ${statusClassV1072(d.print_status)}">
                      <div>
                        <b>${esc(d.delivery_order_no||`${so.soNo}/S${String(d.sequence||1).padStart(2,'0')}`)}</b>
                        <span>${esc(d.customer_name||'-')}</span>
                      </div>

                      <span class="sc-so-print-status-v1072">
                        ${esc(st)}
                      </span>

                      <button
                        class="btn amber sm"
                        type="button"
                        onclick="reprintApprovedSODeliveryV1072('${so.id}',${Number(d.sequence||1)})"
                      >Reprint</button>
                    </div>
                  `;
                }).join('')
              : '<div class="small">No delivery print status returned.</div>'
          }
        </div>

        <div class="sc-so-print-actions-v1072">
          <button
            class="btn ghost sm"
            type="button"
            onclick="refreshApprovedSOPrintV1072('${so.id}')"
          >Check Prints</button>

          <button
            class="btn ghost sm"
            type="button"
            onclick="syncApprovedSalesOrderToStoresV1072('${so.id}',true)"
          >Resync</button>
        </div>
      </div>
    `;
  }

  function decorateApprovedSOPrintV1072(){
    const box=$('bpSoMyOrdersV1030');
    if(!box)return;

    const cards=[
      ...box.querySelectorAll(
        '.bp-so-history-card-v1032'
      )
    ];

    cards.forEach(card=>{
      const so=(state.salesOrders||[]).find(x=>
        x?.portalSalesOrder &&
        [...card.querySelectorAll('b')]
          .some(b=>
            String(b.textContent||'').trim()===
            String(x.soNo||'').trim()
          )
      );

      if(!so)return;

      let cardReprint=card.querySelector(
        '.sc-so-card-reprint-v1073'
      );

      if(!cardReprint){
        const row=card.querySelector(
          '.bp-so-history-row-v1030'
        );

        if(row){
          cardReprint=document.createElement('button');
          cardReprint.className=
            'btn amber sm sc-so-card-reprint-v1073';
          cardReprint.type='button';
          cardReprint.textContent='Reprint Stores Receipt';
          cardReprint.onclick=()=>{
            reprintApprovedSOFromCardV1073(so.id);
          };

          row.appendChild(cardReprint);
        }
      }

      let host=card.querySelector(
        '.sc-so-print-host-v1072'
      );

      if(!host){
        host=document.createElement('div');
        host.className='sc-so-print-host-v1072';
        card.appendChild(host);
      }

      host.innerHTML=salesPrintHtmlV1072(so);
    });
  }

  window.decorateApprovedSOPrintV1072=
    decorateApprovedSOPrintV1072;

  /* -------------------------------------------------------
     Wrap Approved Prices Submit.
     Existing local SO + fulfilment are saved first.
     Stores DB/printing runs afterwards.
     A print-sync failure never destroys the Sales Order.
     ------------------------------------------------------- */
  if(typeof window.bpSoSubmitV1030==='function'){
    const baseSubmitSOV1072=window.bpSoSubmitV1030;

    window.bpSoSubmitV1030=async function(){
      const before=new Set(
        (state.salesOrders||[]).map(x=>x.id)
      );

      const r=
        await baseSubmitSOV1072.apply(this,arguments);

      const created=(state.salesOrders||[]).find(
        x=>
          x?.portalSalesOrder &&
          !before.has(x.id)
      );

      if(created){
        await syncApprovedSalesOrderToStoresV1072(
          created.id,
          false
        );
      }

      decorateApprovedSOPrintV1072();

      return r;
    };

    try{bpSoSubmitV1030=window.bpSoSubmitV1030}catch(_){}
  }

  /* -------------------------------------------------------
     Approved Prices list rerenders internally.
     Observe it and reapply Stores print controls.
     ------------------------------------------------------- */
  function attachSOObserverV1072(){
    const box=$('bpSoMyOrdersV1030');
    if(!box || box.dataset.scPrintObserverV1072==='1'){
      decorateApprovedSOPrintV1072();
      return;
    }

    box.dataset.scPrintObserverV1072='1';

    let queued=false;

    const observer=new MutationObserver(()=>{
      if(queued)return;
      queued=true;

      requestAnimationFrame(()=>{
        queued=false;
        decorateApprovedSOPrintV1072();
      });
    });

    observer.observe(
      box,
      {
        childList:true,
        subtree:true
      }
    );

    decorateApprovedSOPrintV1072();
  }

  const intervalV1072=setInterval(()=>{
    if($('bpSoMyOrdersV1030')){
      attachSOObserverV1072();
      clearInterval(intervalV1072);
    }
  },300);

  setTimeout(()=>{
    decoratePIReprintV1072();
    attachSOObserverV1072();
  },0);

})();
