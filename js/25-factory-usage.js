
/* =====================================================================
   SOFTCREATION NATIVE FACTORY USAGE MODULE v1.1
   Uses the existing BOS shell, currentUser/permissions, productionRequests,
   Supabase browser key and the already-created factory inventory RPC/tables.
   No iframe. No second login. No separate app.
   ===================================================================== */
(function(){
  'use strict';

  const FACTORY_WORKSPACE='softcreation_main';
  const FACTORY_REST='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1';
  const FACTORY_CACHE_KEY='softcreation_factory_inventory_cloud_cache_v1';
  const FACTORY_FEATURES=[
    ['factory_view','Factory — Raw Material Usage'],
    ['factory_stock_in','Factory — Stock In'],
    ['factory_issue','Factory — Record Raw Materials Used'],
    ['factory_reports','Factory — Job & Usage Reports'],
    ['factory_manage','Factory — Masters / Admin'],
    ['factory_cost_view','Factory — Material Cost View']
  ];

  let factoryDb={
    version:2,revision:0,items:[],suppliers:[],owners:[],
    lots:[],issues:[],returns:[],audit:[]
  };
  let factoryLoaded=false;
  let factoryLoading=false;
  let factoryPage='Dashboard';
  let factoryStockPage=1;
  let factoryStockSuggestTimer=null;

  const f$=id=>document.getElementById(id);
  const fEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fNum=v=>Number(v);
  const fQty=v=>Math.round(Number(v||0)*1e6)/1e6;
  const fFmt=v=>Number(v||0).toLocaleString('en-LK',{maximumFractionDigits:4});
  const fMoney=v=>'LKR '+Number(v||0).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fToday=()=>new Date().toISOString().slice(0,10);
  const fUid=()=>typeof uid==='function'?uid('factory'):((crypto.randomUUID&&crypto.randomUUID())||Date.now().toString(36)+Math.random().toString(36).slice(2));
  const fName=(list,id)=>list.find(x=>x.id===id)?.name||'Unknown';
  const fCan=p=>currentUser?.role==='admin'||hasPerm(p);

  function factoryBlank(){
    return {version:2,revision:0,items:[],suppliers:[],owners:[],lots:[],issues:[],returns:[],audit:[]};
  }
  function factoryNormalize(raw){
    const d={...factoryBlank(),...(raw&&typeof raw==='object'?raw:{})};
    ['items','suppliers','owners','lots','issues','returns','audit'].forEach(k=>{
      if(!Array.isArray(d[k]))d[k]=[];
    });
    d.version=2;
    d.revision=Number(d.revision||0);
    delete d.auth;
    return d;
  }
  function factoryKey(){
    const key=(localStorage.getItem('spgs_supabase_browser_key_v1')||'').trim();
    if(!key)throw new Error('Supabase browser key is not configured on this device.');
    return key;
  }
  async function factoryFetch(path,options={}){
    const key=factoryKey();
    const headers={apikey:key,...(options.headers||{})};
    if(key.startsWith('eyJ'))headers.Authorization='Bearer '+key;
    const res=await fetch(FACTORY_REST+path,{...options,headers});
    const txt=await res.text();
    if(!res.ok)throw new Error(txt||`Factory cloud request failed (${res.status})`);
    if(!txt)return null;
    try{return JSON.parse(txt)}catch(_){return txt}
  }
  function factoryCache(){
    try{localStorage.setItem(FACTORY_CACHE_KEY,JSON.stringify(factoryDb))}catch(_){}
  }
  async function loadFactoryCloud(force=false){
    if(factoryLoading)return;
    if(factoryLoaded&&!force)return;
    factoryLoading=true;
    factorySetStatus('Connecting to Factory cloud…','loading');
    try{
      const rows=await factoryFetch(`/spgs_factory_inventory_state?workspace=eq.${encodeURIComponent(FACTORY_WORKSPACE)}&select=revision,payload,updated_at,updated_by&limit=1`);
      if(rows?.length){
        factoryDb=factoryNormalize(rows[0].payload);
        factoryDb.revision=Number(rows[0].revision||factoryDb.revision||0);
      }else{
        factoryDb=factoryBlank();
      }
      factoryLoaded=true;
      factoryCache();
      factorySetStatus('Factory usage is live','ok');
      renderFactory();
    }catch(e){
      console.error('Factory load failed',e);
      try{
        const cached=JSON.parse(localStorage.getItem(FACTORY_CACHE_KEY)||'null');
        if(cached){
          factoryDb=factoryNormalize(cached);
          factoryLoaded=true;
          factorySetStatus('Cloud unavailable — showing last cached data (read only)','warn');
          renderFactory();
        }else throw e;
      }catch(_){
        factorySetStatus('Factory cloud connection failed','bad');
        if(f$('factoryBody'))f$('factoryBody').innerHTML=`<div class="notice"><b>Factory cloud unavailable.</b><br>${fEsc(e.message)}</div>`;
      }
    }finally{factoryLoading=false}
  }
  function factorySetStatus(text,kind=''){
    const el=f$('factoryCloudStatus');
    if(!el)return;
    el.textContent=text;
    el.className='factory-cloud-status '+kind;
  }
  async function factoryCommit(action,mutator){
    if(!factoryLoaded)return toast('Factory data is not loaded yet');
    const next=JSON.parse(JSON.stringify(factoryDb));
    mutator(next);
    next.version=2;
    next.audit=next.audit||[];
    next.audit.push({
      id:fUid(),
      at:new Date().toISOString(),
      user:currentUser?.username||'unknown',
      display:currentUser?.display||'',
      action
    });
    const expected=Number(factoryDb.revision||0);
    try{
      const rows=await factoryFetch('/rpc/spgs_factory_inventory_commit',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          p_workspace:FACTORY_WORKSPACE,
          p_expected_revision:expected,
          p_payload:next,
          p_updated_by:currentUser?.username||'unknown',
          p_action:action
        })
      });
      const row=Array.isArray(rows)?rows[0]:rows;
      if(!row)throw new Error('Factory cloud did not return the saved revision');
      factoryDb=factoryNormalize(row.payload||next);
      factoryDb.revision=Number(row.revision||factoryDb.revision||expected+1);
      factoryCache();
      renderFactory();
      toast('Factory saved successfully');
    }catch(e){
      console.error('Factory save failed',e);
      if(String(e.message).includes('FACTORY_REVISION_CONFLICT')||String(e.message).includes('40001')){
        toast('Factory data changed on another device. Latest data has been reloaded.');
        await loadFactoryCloud(true);
      }else{
        toast('Factory save failed — '+e.message);
      }
    }
  }

  function factoryProductionJobs(){
    const allowed=new Set(['Finished','Dispatched','Received','GRN Closed']);
    return (state.productionRequests||[])
      .filter(r=>r?.id&&allowed.has(String(r.status||'')))
      .sort((a,b)=>{
        const ad=Date.parse(a.finishedAt||a._spgsUpdatedAt||a.createdAt||0)||0;
        const bd=Date.parse(b.finishedAt||b._spgsUpdatedAt||b.createdAt||0)||0;
        return bd-ad;
      });
  }
  function factoryProductionById(id){
    return (state.productionRequests||[]).find(r=>r.id===id)||null;
  }
  function factoryReturned(issueId){
    return (factoryDb.returns||[]).filter(x=>x.issue===issueId).reduce((s,x)=>s+Number(x.qty||0),0);
  }
  function factoryOptions(list,placeholder='Select…'){
    return `<option value="">${fEsc(placeholder)}</option>`+list.map(x=>`<option value="${fEsc(x.id)}">${fEsc(x.name)}</option>`).join('');
  }
  function factoryField(label,input){
    return `<div class="factory-field"><label>${label}</label>${input}</div>`;
  }
  function factoryTable(headers,rows){
    return `<div class="factory-scroll"><table class="factory-table"><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>'<tr>'+r.map(x=>`<td>${x}</td>`).join('')+'</tr>').join(''):`<tr><td colspan="${headers.length}" class="small">No records yet</td></tr>`}</tbody></table></div>`;
  }

  function factoryTabs(){
    const all=[
      ['Dashboard','factory_view'],
      ['Stock in','factory_stock_in'],
      ['Issue to job','factory_issue'],
      ['Job reports','factory_reports'],
      ['Masters','factory_manage'],
      ['History','factory_view']
    ];
    return all.filter(([,p])=>fCan(p));
  }
  function factorySetPage(page){
    if(!factoryTabs().some(x=>x[0]===page))return;
    factoryPage=page;
    renderFactory();
  }
  window.factorySetPage=factorySetPage;

  function renderFactory(){
    const body=f$('factoryBody');
    if(!body)return;
    if(!fCan('factory_view')){
      body.innerHTML='<div class="empty">Factory access is not enabled for this user.</div>';
      return;
    }
    const tabs=factoryTabs();
    if(!tabs.some(x=>x[0]===factoryPage))factoryPage=tabs[0]?.[0]||'Dashboard';
    const nav=f$('factorySubnav');
    if(nav)nav.innerHTML=tabs.map(([t])=>`<button type="button" class="factory-subnav-btn ${factoryPage===t?'active':''}" onclick="factorySetPage('${t}')">${t}</button>`).join('');

    if(!factoryLoaded){
      body.innerHTML='<div class="factory-loading">Loading Factory usage…</div>';
      return;
    }

    let out='';
    if(factoryPage==='Dashboard')out=factoryDashboardHtml();
    else if(factoryPage==='Stock in')out=factoryStockInHtml();
    else if(factoryPage==='Issue to job')out=factoryIssueHtml();
    else if(factoryPage==='Job reports')out=factoryReportsHtml();
    else if(factoryPage==='Masters')out=factoryMastersHtml();
    else if(factoryPage==='History')out=factoryHistoryHtml();
    body.innerHTML=out;
    bindFactoryForms();
  }
  window.renderFactory=renderFactory;

  function factoryDashboardHtml(){
    const finished=factoryProductionJobs();
    const linked=new Set((factoryDb.issues||[]).map(x=>x.productionRequestId).filter(Boolean));
    const awaiting=finished.filter(r=>!linked.has(r.id));
    const today=fToday();
    const todayLines=(factoryDb.issues||[]).filter(x=>x.date===today);
    return `
      <div class="factory-kpis">
        <div class="factory-kpi"><span>Raw Materials</span><b>${factoryDb.items.length}</b><small>material masters</small></div>
        <div class="factory-kpi"><span>Finished Jobs</span><b>${finished.length}</b><small>available for usage entry</small></div>
        <div class="factory-kpi"><span>Jobs With Usage</span><b>${linked.size}</b><small>linked production jobs</small></div>
        <div class="factory-kpi"><span>Usage Lines Today</span><b>${todayLines.length}</b><small>actual raw-material entries</small></div>
      </div>
      <div class="panel factory-inner-panel">
        <div class="panel-title"><span>Finished Jobs Awaiting Raw Material Entry</span><button class="btn ghost sm" type="button" onclick="loadFactoryCloud(true)">Refresh Cloud</button></div>
        <div class="panel-body">
          ${factoryTable(
            ['Production','Customer','Product','Finished Qty','Status','Action'],
            awaiting.slice(0,50).map(r=>[
              `<b>${fEsc(r.orderNo||r.prodNo||r.id)}</b>`,
              fEsc(r.customerName||'-'),
              `${fEsc(r.size||'')} ${fEsc(r.material||'')} ${fEsc(r.layout||'')}`,
              `${fFmt(r.finishedQty||r.packing?.total||r.requestQty||0)} ${fEsc(r.unit||'Rolls')}`,
              `<span class="tag">${fEsc(r.status||'')}</span>`,
              fCan('factory_issue')?`<button class="btn primary sm" type="button" onclick="factoryOpenUsageForJob('${r.id}')">Add Raw Materials</button>`:'-'
            ])
          )}
        </div>
      </div>`;
  }


  function factoryStockInHtml(){
    if(!fCan('factory_stock_in'))return '<div class="empty">Factory Stock In permission is not enabled.</div>';
    return `
      <div class="panel factory-inner-panel">
        <div class="panel-title">Receive Raw Materials</div>
        <div class="panel-body">
          <div class="notice"><b>Stock In:</b> Quantity = number of physical stock units. Tick <b>This item needs Measurement / Each</b> only when every unit needs its own length/measurement. The system will then create one measurement field per quantity.</div>
          <form id="factoryReceiveForm">
            <div class="factory-form-grid factory-stockin-grid">
              <div class="factory-field factory-material-autocomplete">
                <label>Item / Raw Material *</label>
                <input id="factoryStockItemName" name="itemName" type="text" required maxlength="160" placeholder="Type at least 2 characters..." autocomplete="off" oninput="factoryStockItemType(this.value)" onfocus="factoryStockItemType(this.value)">
                <input id="factoryStockItemId" name="itemId" type="hidden">
                <div id="factoryStockItemSuggestions" class="factory-autocomplete-list"></div>
                <div class="hint">New item names are saved automatically with the Stock In record.</div>
              </div>
              ${factoryField('Supplier *',`<select name="supplier" required>${factoryOptions(factoryDb.suppliers)}</select>`)}
              ${factoryField('Raw Material Ownership *',`<select name="owner" required>${factoryOptions(factoryDb.owners)}</select>`)}
              ${factoryField('Quantity *','<input id="factoryStockQuantity" name="quantity" type="number" step="1" min="1" inputmode="numeric" placeholder="e.g. 4" required oninput="factoryRefreshMeasurements()">')}
              <div class="factory-field full factory-measurement-toggle">
                <label class="factory-checkline">
                  <input id="factoryNeedsMeasurement" name="needsMeasurement" type="checkbox" onchange="factoryRefreshMeasurements()">
                  <span>This item needs Measurement / Each</span>
                </label>
                <div class="hint">Tick this only when each physical unit needs its own measurement/length.</div>
              </div>
              <div id="factoryMeasurementWrap" class="factory-measurement-wrap" hidden></div>
              ${factoryField('Receipt Date *',`<input name="date" type="date" value="${fToday()}" required>`)}
              ${factoryField('Supplier Invoice / Reference','<input name="reference" maxlength="120">')}
            </div>
            <div id="factoryJbrUnitWrap" class="factory-jbr-unit-wrap" hidden>
              <div class="factory-field">
                <label>Stock Unit *</label>
                <input id="factoryStockUnit" name="stockUnit" type="text" maxlength="40"
                  placeholder="Type unit: m², metre, roll, pcs...">
                <div class="hint">Type the stock unit exactly as you use it, e.g. metre, m², roll, pcs.</div>
              </div>
            </div>
            <div class="factory-field"><label>Description / Batch Details</label><textarea name="description" maxlength="500" placeholder="Optional batch, material or receiving details"></textarea></div>
            <div class="actions factory-touch-actions"><button class="btn primary factory-big-btn" type="submit">Save Stock In</button></div>
          </form>
        </div>
      </div>
      <div class="panel factory-inner-panel">
        <div class="panel-title">Current Stock In Batches</div>
        <div class="panel-body">
          <div class="hint factory-bartender-hint">Each physical stock unit is stored as a separate batch. Generate Label creates a 75mm × 50mm PDF label with QR code for that individual batch.</div>
          ${factoryStockBatchListHtml()}
        </div>
      </div>`;
  }


  function factoryStockBatchListHtml(){
    const all=(factoryDb.lots||[]).slice().sort((a,b)=>{
      const d=String(b.date||'').localeCompare(String(a.date||''));
      if(d!==0)return d;
      return String(b.createdAt||'').localeCompare(String(a.createdAt||''));
    });

    const pageSize=10;
    const pages=Math.max(1,Math.ceil(all.length/pageSize));
    factoryStockPage=Math.min(Math.max(1,Number(factoryStockPage)||1),pages);
    const start=(factoryStockPage-1)*pageSize;
    const rows=all.slice(start,start+pageSize).map(l=>{
      const item=factoryDb.items.find(i=>i.id===l.item);
      return [
        `<b>${fEsc(l.code||'')}</b>`,
        fEsc(l.date||''),
        fEsc(item?.name||l.itemName||'Unknown'),
        fEsc(fName(factoryDb.suppliers,l.supplier)),
        fEsc(fName(factoryDb.owners,l.owner)),
        fFmt(l.quantity),
        fFmt(l.remaining),
        fEsc(item?.unit||l.unit||''),
        fEsc(l.reference||''),
        `<button class="btn navy sm factory-label-btn" type="button" onclick="generateFactoryStockLabel('${l.id}')">Generate Label</button>`
      ];
    });

    const table=factoryTable(
      ['Batch','Date','Raw Material','Supplier','Ownership','Received','Remaining','Unit','Reference','Label'],
      rows
    );

    if(all.length<=pageSize)return table;

    const from=all.length?start+1:0;
    const to=Math.min(start+pageSize,all.length);
    return `${table}
      <div class="factory-stock-pagination">
        <div class="factory-stock-page-info">Showing ${from}-${to} of ${all.length} batches</div>
        <div class="factory-stock-page-actions">
          <button class="btn ghost sm" type="button" ${factoryStockPage<=1?'disabled':''} onclick="factoryStockPageGo(${factoryStockPage-1})">Previous</button>
          <span class="factory-stock-page-chip">Page ${factoryStockPage} / ${pages}</span>
          <button class="btn ghost sm" type="button" ${factoryStockPage>=pages?'disabled':''} onclick="factoryStockPageGo(${factoryStockPage+1})">Next</button>
        </div>
      </div>`;
  }

  window.factoryStockPageGo=function(page){
    factoryStockPage=Math.max(1,Number(page)||1);
    renderFactory();
  };

  window.generateFactoryStockLabel=async function(lotId){
    const lot=(factoryDb.lots||[]).find(x=>x.id===lotId);
    if(!lot)return toast('Stock batch not found');

    const item=(factoryDb.items||[]).find(x=>x.id===lot.item);
    const material=item?.name||lot.itemName||'Raw Material';
    const unit=item?.unit||lot.unit||'';
    const supplier=fName(factoryDb.suppliers,lot.supplier);
    const owner=fName(factoryDb.owners,lot.owner);
    const batch=lot.code||'';
    const receivedQty=fFmt(lot.quantity);
    const remainingQty=fFmt(lot.remaining);
    const receiptDate=lot.date||'';
    const reference=lot.reference||'';

    const okQ=await loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
      ()=>window.QRCode
    );
    const okC=await loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      ()=>window.html2canvas
    );
    const okP=await loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      ()=>window.jspdf
    );
    if(!okQ||!okC||!okP)return toast('PDF / QR libraries unavailable');

    const qrData=JSON.stringify({
      batch,
      material,
      quantity:Number(lot.quantity||0),
      remaining:Number(lot.remaining||0),
      unit,
      supplier,
      ownership:owner,
      receiptDate,
      reference
    });

    const host=document.createElement('div');
    host.style='position:fixed;left:-10000px;top:0;width:900px;height:600px;background:#fff;color:#000;box-sizing:border-box;padding:14px;font-family:Arial,Helvetica,sans-serif;';
    host.innerHTML=`
      <div style="height:100%;border:4px solid #000;border-radius:8px;padding:15px;background:#fff;display:grid;grid-template-columns:1fr 190px;gap:15px">
        <div style="min-width:0;display:flex;flex-direction:column">
          <div style="display:flex;justify-content:space-between;gap:15px;border-bottom:3px solid #000;padding-bottom:7px;margin-bottom:9px">
            <div>
              <div style="font-size:25px;font-weight:900;letter-spacing:-1px">SOFTCREATION</div>
              <div style="font-size:10px;font-weight:800">RAW MATERIAL STOCK LABEL</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:9px;font-weight:900">BATCH / GRN</div>
              <div style="font-size:18px;font-weight:900">${fEsc(batch||'-')}</div>
            </div>
          </div>

          <div style="font-size:28px;font-weight:900;line-height:1.05;word-break:break-word;margin-bottom:9px">${fEsc(material)}</div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
            <div style="border:2px solid #000;border-radius:6px;padding:7px">
              <div style="font-size:8px;font-weight:900">RECEIVED QTY</div>
              <div style="font-size:18px;font-weight:900">${fEsc(receivedQty)} ${fEsc(unit)}</div>
            </div>
            <div style="border:2px solid #000;border-radius:6px;padding:7px">
              <div style="font-size:8px;font-weight:900">REMAINING</div>
              <div style="font-size:18px;font-weight:900">${fEsc(remainingQty)} ${fEsc(unit)}</div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;margin-top:7px;font-size:10px;line-height:1.2">
            <div><b>Supplier:</b> ${fEsc(supplier||'-')}</div>
            <div><b>Owner:</b> ${fEsc(owner||'-')}</div>
            <div><b>Date:</b> ${fEsc(receiptDate||'-')}</div>
            <div><b>Ref:</b> ${fEsc(reference||'-')}</div>
          </div>

          <div style="margin-top:auto;border-top:2px solid #000;padding-top:5px;font-size:8px;font-weight:700">
            SoftCreation Business Operations System
          </div>
        </div>

        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;border-left:3px solid #000;padding-left:12px">
          <div id="factoryPdfQr" style="width:170px;height:170px;display:flex;align-items:center;justify-content:center"></div>
          <div style="font-size:9px;font-weight:900;margin-top:6px;text-align:center">SCAN MATERIAL QR</div>
          <div style="font-size:8px;font-weight:800;margin-top:4px;text-align:center">${fEsc(batch||'')}</div>
        </div>
      </div>
    `;
    document.body.appendChild(host);

    try{
      const qrHost=host.querySelector('#factoryPdfQr');
      new QRCode(qrHost,{
        text:qrData,
        width:170,
        height:170,
        correctLevel:QRCode.CorrectLevel.M
      });

      await new Promise(resolve=>setTimeout(resolve,150));

      const canvas=await html2canvas(host,{
        scale:2.5,
        backgroundColor:'#fff',
        useCORS:true,
        logging:false
      });

      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({
        orientation:'landscape',
        unit:'mm',
        format:[75,50]
      });

      pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,75,50);

      const safe=String(batch||material||'Factory-Label')
        .replace(/[\\/:*?"<>|]+/g,'-')
        .replace(/\s+/g,' ')
        .trim();

      pdf.save(`${safe}.pdf`);
      toast('75mm × 50mm stock label PDF generated');
    }catch(err){
      console.error('Factory label PDF failed',err);
      toast('Label PDF failed — '+(err?.message||err));
    }finally{
      host.remove();
    }
  };

  function factoryIsJbrName(name){ return /\\bjbr\\b/i.test(String(name||'').trim()); }
  function factoryFindItemByName(name){
    const q=String(name||'').trim().toLowerCase();
    return (factoryDb.items||[]).find(x=>String(x.name||'').trim().toLowerCase()===q)||null;
  }
  window.factoryRefreshMeasurements=function(){
    const qty=Math.max(0,Math.floor(Number(f$('factoryStockQuantity')?.value)||0));
    const wrap=f$('factoryMeasurementWrap');
    const needs=!!f$('factoryNeedsMeasurement')?.checked;
    if(!wrap)return;

    if(!needs || qty<=0){
      wrap.hidden=true;
      wrap.innerHTML='';
      return;
    }

    const existingValues={};
    wrap.querySelectorAll('input[data-measurement-index]').forEach(inp=>{
      existingValues[inp.dataset.measurementIndex]=inp.value;
    });

    wrap.hidden=false;
    wrap.innerHTML=`
      <div class="factory-measurement-card">
        <div class="factory-measurement-head">
          <div>
            <b>Measurement / Each *</b>
            <span>Enter a separate measurement for each physical stock unit.</span>
          </div>
          <span class="factory-measurement-count">${qty} unit${qty===1?'':'s'}</span>
        </div>
        <div class="factory-measurement-grid">
          ${Array.from({length:qty},(_,i)=>{
            const n=i+1;
            const val=existingValues[String(n)]||'';
            return `
              <div class="factory-field">
                <label>Unit ${n} Measurement *</label>
                <input
                  name="measurement_${n}"
                  data-measurement-index="${n}"
                  type="number"
                  step="any"
                  min="0.000001"
                  inputmode="decimal"
                  placeholder="e.g. 1500"
                  value="${fEsc(val)}"
                  required>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  };

  window.factoryStockItemType=function(value){
    const hidden=f$('factoryStockItemId'), list=f$('factoryStockItemSuggestions'), unitWrap=f$('factoryJbrUnitWrap'), unitSel=f$('factoryStockUnit');
    if(!hidden||!list)return;
    const text=String(value||'').trim();
    const exact=factoryFindItemByName(text);
    hidden.value=exact?.id||'';
    if(exact&&unitSel&&exact.unit)unitSel.value=exact.unit;
    const jbr=factoryIsJbrName(text);
    if(unitWrap)unitWrap.hidden=!jbr;
    if(unitSel)unitSel.required=jbr;
    if(text.length<2){
      if(factoryStockSuggestTimer){clearTimeout(factoryStockSuggestTimer);factoryStockSuggestTimer=null;}
      list.innerHTML='';list.classList.remove('show');return;
    }
    const q=text.toLowerCase();
    const matches=(factoryDb.items||[]).filter(x=>String(x.name||'').toLowerCase().includes(q)).slice(0,12);
    if(!matches.length){
      if(factoryStockSuggestTimer){clearTimeout(factoryStockSuggestTimer);factoryStockSuggestTimer=null;}
      list.innerHTML=`<div class="factory-autocomplete-empty">New item — "${fEsc(text)}" will be saved automatically.</div>`;
      list.classList.add('show');
      factoryStockSuggestTimer=setTimeout(()=>{
        list.classList.remove('show');
        list.innerHTML='';
        factoryStockSuggestTimer=null;
      },2000);
      return;
    }
    if(factoryStockSuggestTimer){clearTimeout(factoryStockSuggestTimer);factoryStockSuggestTimer=null;}
    list.innerHTML=matches.map(x=>`<button type="button" class="factory-autocomplete-option" onclick="factorySelectStockItem('${x.id}')"><span>${fEsc(x.name)}</span><small>${fEsc(x.unit||'Unit not set')}</small></button>`).join('');
    list.classList.add('show');
  };
  window.factorySelectStockItem=function(id){
    const item=(factoryDb.items||[]).find(x=>x.id===id); if(!item)return;
    const input=f$('factoryStockItemName'), hidden=f$('factoryStockItemId'), list=f$('factoryStockItemSuggestions'), unitWrap=f$('factoryJbrUnitWrap'), unitSel=f$('factoryStockUnit');
    if(input)input.value=item.name||''; if(hidden)hidden.value=item.id||''; if(list){list.innerHTML='';list.classList.remove('show');}
    const jbr=factoryIsJbrName(item.name); if(unitWrap)unitWrap.hidden=!jbr;
    if(unitSel){unitSel.required=jbr;if(item.unit)unitSel.value=item.unit;}
  };

  let factoryUsageRows=[];

  function factoryUsageOptions(list,selected='',placeholder='Select…'){
    return `<option value="">${fEsc(placeholder)}</option>`+list.map(x=>`<option value="${fEsc(x.id)}" ${x.id===selected?'selected':''}>${fEsc(x.name)}</option>`).join('');
  }

  function factoryRenderUsageRows(){
    const host=f$('factoryUsageRows');if(!host)return;
    host.innerHTML=factoryUsageRows.map((row,i)=>{
      const item=factoryDb.items.find(x=>x.id===row.itemId);
      return `
        <div class="factory-usage-row">
          <div class="factory-field"><label>Raw Material *</label><select onchange="factoryUsageRowChange(${i},'itemId',this.value)">${factoryUsageOptions(factoryDb.items,row.itemId,'Select raw material')}</select></div>
          <div class="factory-field"><label>Supplier</label><select onchange="factoryUsageRowChange(${i},'supplierId',this.value)">${factoryUsageOptions(factoryDb.suppliers,row.supplierId,'Optional supplier')}</select></div>
          <div class="factory-field"><label>Ownership</label><select onchange="factoryUsageRowChange(${i},'ownerId',this.value)">${factoryUsageOptions(factoryDb.owners,row.ownerId,'Optional ownership')}</select></div>
          <div class="factory-field"><label>Actual Qty Used *</label><input type="number" min="0.000001" step="any" value="${fEsc(row.qty||'')}" oninput="factoryUsageRowChange(${i},'qty',this.value)"></div>
          <div class="factory-usage-unit">${item?fEsc(item.unit||''):''}</div>
          <button class="btn red sm" type="button" onclick="factoryRemoveUsageRow(${i})">Remove</button>
        </div>`;
    }).join('');
  }
  window.factoryUsageRowChange=function(i,key,value){
    if(!factoryUsageRows[i])return;
    factoryUsageRows[i][key]=value;
    if(key==='itemId')factoryRenderUsageRows();
  };
  window.factoryAddUsageRow=function(){
    factoryUsageRows.push({itemId:'',supplierId:'',ownerId:'',qty:''});
    factoryRenderUsageRows();
  };
  window.factoryRemoveUsageRow=function(i){
    if(factoryUsageRows.length<=1)return toast('At least one raw material line is required');
    factoryUsageRows.splice(i,1);factoryRenderUsageRows();
  };
  window.factoryOpenUsageForJob=function(id){
    factoryPage='Issue to job';renderFactory();
    setTimeout(()=>{
      const s=f$('factoryProductionJob');
      if(s){s.value=id;factoryJobChanged()}
    },0);
  };
  window.factoryJobChanged=function(){
    const id=f$('factoryProductionJob')?.value||'';
    const host=f$('factorySelectedJob');
    const r=factoryProductionById(id);
    if(!host)return;
    if(!r){host.innerHTML='';return}
    const existing=(factoryDb.issues||[]).filter(x=>x.productionRequestId===id);
    host.innerHTML=`
      <div class="factory-job-selected">
        <div><span>Production</span><b>${fEsc(r.orderNo||r.prodNo||r.id)}</b></div>
        <div><span>Customer</span><b>${fEsc(r.customerName||'-')}</b></div>
        <div><span>Product</span><b>${fEsc(r.size||'')} ${fEsc(r.material||'')} ${fEsc(r.layout||'')}</b></div>
        <div><span>Finished Qty</span><b>${fFmt(r.finishedQty||r.packing?.total||r.requestQty||0)} ${fEsc(r.unit||'Rolls')}</b></div>
        <div><span>Status</span><b>${fEsc(r.status||'-')}</b></div>
      </div>
      ${existing.length?`<div class="notice"><b>${existing.length} raw material line${existing.length===1?'':'s'} already recorded.</b> New lines will be added to this job.</div>`:''}`;
  };

  function factoryIssueHtml(){
    if(!fCan('factory_issue'))return '<div class="empty">Material Issue permission is not enabled.</div>';
    const jobs=factoryProductionJobs().map(r=>({
      id:r.id,
      name:`${r.orderNo||r.prodNo||r.id} | ${r.customerName||'-'} | ${r.size||''} ${r.material||''} ${r.layout||''} | Finished ${fFmt(r.finishedQty||r.packing?.total||r.requestQty||0)} ${r.unit||'Rolls'} | ${r.status}`
    }));
    factoryUsageRows=[{itemId:'',supplierId:'',ownerId:'',qty:''}];
    return `
      <div class="panel factory-inner-panel">
        <div class="panel-title">Issue / Record Raw Materials Used</div>
        <div class="panel-body">
          <div class="notice"><b>After production is finished:</b> select the completed job and add every raw material / consumable actually used. Raw Materials, Suppliers and Ownership come from the existing Factory Masters.</div>
          <form id="factoryIssueForm">
            <div class="factory-form-grid factory-finished-job-grid">
              ${factoryField('Finished Production Job *',`<select name="productionRequestId" id="factoryProductionJob" required onchange="factoryJobChanged()">${factoryOptions(jobs,'Select finished production job')}</select>`)}
              ${factoryField('Usage Date *',`<input name="date" type="date" value="${fToday()}" required>`)}
            </div>
            <div id="factorySelectedJob"></div>
            <div class="factory-usage-head">
              <div><b>Raw Materials Used</b><div class="hint">Add all materials used after completing this production job.</div></div>
              <button class="btn ghost sm" type="button" onclick="factoryAddUsageRow()">+ Add Raw Material</button>
            </div>
            <div id="factoryUsageRows"></div>
            <div class="factory-field"><label>Production / Usage Notes</label><textarea name="notes" maxlength="500"></textarea></div>
            <div class="actions"><button class="btn primary" type="submit">Save Raw Material Usage</button></div>
          </form>
        </div>
      </div>`;
  }
  function factoryReportsHtml(){
    if(!fCan('factory_reports'))return '<div class="empty">Factory report permission is not enabled.</div>';
    const jobs=[...new Map((factoryDb.issues||[]).map(i=>[i.productionRequestId||i.job,{
      id:i.productionRequestId||i.job,
      name:i.productionRequestId?(factoryProductionById(i.productionRequestId)?.orderNo||i.job):i.job
    }])).values()];
    return `
      <div class="panel factory-inner-panel">
        <div class="panel-title">Production Job Material Usage</div>
        <div class="panel-body">
          <div class="factory-report-toolbar">
            <select id="factoryReportJob" onchange="showFactoryJob()">${factoryOptions(jobs,'Select production job')}</select>
            <button class="btn ghost sm" type="button" onclick="printFactoryJob(false)">Usage PDF</button>
            ${fCan('factory_cost_view')?'<button class="btn navy sm" type="button" onclick="printFactoryJob(true)">Material Cost PDF</button>':''}
          </div>
          <div id="factoryJobDetail"></div>
        </div>
      </div>`;
  }
  function factoryMastersHtml(){
    if(!fCan('factory_manage'))return '<div class="empty">Factory master-management permission is not enabled.</div>';
    return `
      <div class="factory-master-grid">
        <div class="panel factory-inner-panel">
          <div class="panel-title">Suppliers</div>
          <div class="panel-body">
            <form id="factorySupplierForm">
              ${factoryField('Supplier Name *','<input name="name" required maxlength="120">')}
              ${factoryField('Contact / Description','<input name="description" maxlength="250">')}
              <div class="actions"><button class="btn primary" type="submit">Create Supplier</button></div>
            </form>
            <div class="factory-master-tags">${factoryDb.suppliers.map(x=>`<span class="tag">${fEsc(x.name)}</span>`).join('')||'<span class="small">No suppliers</span>'}</div>
          </div>
        </div>
        <div class="panel factory-inner-panel">
          <div class="panel-title">Raw Material Ownership</div>
          <div class="panel-body">
            <form id="factoryOwnerForm">
              ${factoryField('Owner Name *','<input name="name" placeholder="SoftCreation / customer name" required maxlength="120">')}
              ${factoryField('Description','<input name="description" maxlength="250">')}
              <div class="actions"><button class="btn primary" type="submit">Create Owner</button></div>
            </form>
            <div class="factory-master-tags">${factoryDb.owners.map(x=>`<span class="tag">${fEsc(x.name)}</span>`).join('')||'<span class="small">No owners</span>'}</div>
          </div>
        </div>
      </div>`;
  }

  function factoryHistoryHtml(){
    const rows=[
      ...(factoryDb.lots||[]).map(l=>{
        const item=factoryDb.items.find(i=>i.id===l.item);
        return {
          date:l.date||'',
          at:l.createdAt||l.date||'',
          cells:[
            fEsc(l.date||''),
            'STOCK IN',
            `<b>${fEsc(l.code||'')}</b>`,
            fEsc(item?.name||'Unknown'),
            fEsc(fName(factoryDb.suppliers,l.supplier)),
            fEsc(fName(factoryDb.owners,l.owner)),
            `${fFmt(l.quantity)} ${fEsc(item?.unit||'')}`,
            fEsc(l.reference||l.description||'')
          ]
        };
      }),
      ...(factoryDb.issues||[]).map(i=>({
        date:i.date||'',
        at:i.issuedAt||i.date||'',
        cells:[
          fEsc(i.date||''),
          'USAGE',
          `<b>${fEsc(i.job||'')}</b>`,
          fEsc(i.itemName||''),
          fEsc(i.supplierName||fName(factoryDb.suppliers,i.supplierId)),
          fEsc(i.ownerName||fName(factoryDb.owners,i.ownerId)),
          `${fFmt(i.qty)} ${fEsc(i.unit||'')}`,
          fEsc(i.notes||'')
        ]
      }))
    ].sort((a,b)=>String(b.at||b.date).localeCompare(String(a.at||a.date))).map(x=>x.cells);

    return `
      <div class="panel factory-inner-panel">
        <div class="panel-title">Factory Stock & Raw Material Usage History</div>
        <div class="panel-body">
          ${factoryTable(['Date','Type','Reference / Production','Raw Material','Supplier','Ownership','Quantity','Notes'],rows)}
        </div>
      </div>
      ${fCan('factory_manage')?`<div class="panel factory-inner-panel"><div class="panel-title">Factory Audit</div><div class="panel-body">${factoryTable(['Time','User','Action'],factoryDb.audit.slice().reverse().map(a=>[
        fEsc(new Date(a.at).toLocaleString()),fEsc(a.display||a.user||''),fEsc(a.action)
      ]))}</div></div>`:''}`;
  }

  function bindFactoryForms(){
    const supplier=f$('factorySupplierForm');
    if(supplier)supplier.onsubmit=e=>{e.preventDefault();createFactoryMaster('supplier',e.target)};
    const owner=f$('factoryOwnerForm');
    if(owner)owner.onsubmit=e=>{e.preventDefault();createFactoryMaster('owner',e.target)};

    const receive=f$('factoryReceiveForm');
    if(receive)receive.onsubmit=async e=>{
      e.preventDefault();
      if(!requirePerm('factory_stock_in','receive Factory raw material stock'))return;

      const f=new FormData(e.target);
      const itemName=String(f.get('itemName')||'').trim();
      const itemId=String(f.get('itemId')||'').trim();
      const supplierId=String(f.get('supplier')||'');
      const ownerId=String(f.get('owner')||'');
      const unitCount=Number(f.get('quantity'));
      const stockUnit=String(f.get('stockUnit')||'').trim();
      const needsMeasurement=f.get('needsMeasurement')==='on';

      if(!itemName)return toast('Enter raw material name');
      if(!Number.isInteger(unitCount)||unitCount<=0)return toast('Quantity must be a whole number greater than 0');
      if(!factoryDb.suppliers.some(x=>x.id===supplierId))return toast('Select a supplier');
      if(!factoryDb.owners.some(x=>x.id===ownerId))return toast('Select raw material ownership');

      const existing=factoryDb.items.find(x=>x.id===itemId)||factoryFindItemByName(itemName);
      const finalUnit=(existing?.unit||stockUnit||'').trim();

      let measurements=[];
      if(needsMeasurement){
        if(!finalUnit)return toast('Stock Unit is required when Measurement / Each is enabled');
        for(let i=1;i<=unitCount;i++){
          const v=Number(f.get(`measurement_${i}`));
          if(!Number.isFinite(v)||v<=0)return toast(`Enter a valid measurement for Unit ${i}`);
          measurements.push(v);
        }
      }

      await factoryCommit(`Factory stock received: ${itemName} × ${unitCount}`,d=>{
        let item=d.items.find(x=>x.id===existing?.id) ||
                 d.items.find(x=>String(x.name||'').trim().toLowerCase()===itemName.toLowerCase());

        if(!item){
          item={
            id:fUid(),
            name:itemName,
            description:'',
            unit:finalUnit||'pcs',
            price:null,
            autoCreated:true,
            createdFrom:'Stock In',
            createdBy:currentUser?.username||'',
            createdAt:new Date().toISOString()
          };
          d.items.push(item);
        }else if(finalUnit && !item.unit){
          item.unit=finalUnit;
        }

        let seq=(d.lots||[]).reduce((m,l)=>{
          const n=Number(String(l.code||'').replace(/\D/g,''));
          return Number.isFinite(n)?Math.max(m,n):m;
        },0);

        const receiptGroupId=fUid();

        for(let i=1;i<=unitCount;i++){
          seq++;
          const measuredQty=needsMeasurement?measurements[i-1]:1;

          d.lots.push({
            id:fUid(),
            code:'FGRN-'+String(seq).padStart(5,'0'),
            receiptGroupId,
            receiptUnitNo:i,
            receiptUnitCount:unitCount,
            item:item.id,
            itemName:item.name,
            unit:item.unit||finalUnit||(needsMeasurement?'':'pcs'),
            quantity:measuredQty,
            remaining:measuredQty,
            measurementEach:needsMeasurement?measuredQty:null,
            needsMeasurement,
            supplier:supplierId,
            owner:ownerId,
            date:String(f.get('date')||fToday()),
            reference:String(f.get('reference')||'').trim(),
            description:String(f.get('description')||'').trim(),
            createdBy:currentUser?.username||'',
            createdByDisplay:currentUser?.display||'',
            createdAt:new Date().toISOString()
          });
        }
      });

      factoryStockPage=1;
    };

    const issue=f$('factoryIssueForm');
    if(issue){
      factoryRenderUsageRows();
      issue.onsubmit=async e=>{
        e.preventDefault();
        if(!requirePerm('factory_issue','record factory raw material usage'))return;
        const f=new FormData(e.target);
        const productionRequestId=String(f.get('productionRequestId')||'');
        const prod=factoryProductionById(productionRequestId);
        if(!prod)return toast('Select a finished production job');
        if(!factoryProductionJobs().some(x=>x.id===productionRequestId))return toast('Only finished production jobs can receive raw material usage');

        const rows=[];
        for(const row of factoryUsageRows){
          const item=factoryDb.items.find(x=>x.id===row.itemId);
          const q=Number(row.qty);
          if(!item)return toast('Select a raw material on every line');
          if(!Number.isFinite(q)||q<=0)return toast('Enter a valid used quantity on every line');
          rows.push({
            item,q,
            supplier:factoryDb.suppliers.find(x=>x.id===row.supplierId)||null,
            owner:factoryDb.owners.find(x=>x.id===row.ownerId)||null
          });
        }
        if(!rows.length)return toast('Add at least one raw material');

        const job=prod.orderNo||prod.prodNo||prod.id;
        const notes=String(f.get('notes')||'').trim();
        const usageBatchId=fUid();
        await factoryCommit(`Recorded raw material usage for ${job}`,d=>{
          rows.forEach(({item,q,supplier,owner})=>d.issues.push({
            id:fUid(),usageBatchId,
            job,productionRequestId,exception:false,
            qty:q,date:String(f.get('date')||fToday()),notes,
            itemId:item.id,itemName:item.name,unit:item.unit,
            supplierId:supplier?.id||'',supplierName:supplier?.name||'',
            ownerId:owner?.id||'',ownerName:owner?.name||'',
            price:item.price??null,
            productionSnapshot:{
              orderNo:prod.orderNo||'',piSerial:prod.piSerial||'',
              customerName:prod.customerName||'',size:prod.size||'',
              material:prod.material||'',layout:prod.layout||'',
              pcs:prod.pcs||0,requestQty:prod.requestQty||0,
              finishedQty:prod.finishedQty||prod.packing?.total||prod.requestQty||0,
              unit:prod.unit||'Rolls',status:prod.status||''
            },
            issuedBy:currentUser?.username||'',
            issuedByDisplay:currentUser?.display||'',
            issuedAt:new Date().toISOString()
          }));
        });
        factoryUsageRows=[{itemId:'',supplierId:'',ownerId:'',qty:''}];
      };
    }
  }

  async function createFactoryMaster(kind,form){
    if(!requirePerm('factory_manage','manage Factory masters'))return;
    const f=new FormData(form);
    const name=String(f.get('name')||'').trim();
    if(!name)return toast('Name is required');
    const list=kind==='item'?'items':kind==='owner'?'owners':'suppliers';
    if(factoryDb[list].some(x=>String(x.name).toLowerCase()===name.toLowerCase()))return toast('Name already exists');
    const entry={id:fUid(),name,description:String(f.get('description')||'').trim()};
    if(kind==='item'){
      entry.unit=String(f.get('unit')||'').trim();
      if(!entry.unit)return toast('Unit is required');
      const raw=f.get('price');
      entry.price=raw===''?null:Number(raw);
      if(entry.price!==null&&(!Number.isFinite(entry.price)||entry.price<0))return toast('Invalid price');
    }
    await factoryCommit(`Created Factory ${kind}: ${name}`,d=>d[list].push(entry));
  }

  window.editFactoryPrice=async function(id){
    if(!requirePerm('factory_manage','edit Factory material prices'))return;
    const item=factoryDb.items.find(x=>x.id===id);if(!item)return;
    if(!protectedEdit('change Factory material price'))return;
    const v=prompt('Unit price in LKR. Blank = unknown. Applies only to future issues.',item.price??'');
    if(v===null)return;
    const p=v.trim()===''?null:Number(v);
    if(p!==null&&(!Number.isFinite(p)||p<0))return toast('Invalid price');
    await factoryCommit(`Updated Factory price: ${item.name}`,d=>{d.items.find(x=>x.id===id).price=p});
  };

  function factoryJobKey(i){return i.productionRequestId||i.job}
  function factoryJobMarkup(key,showCost=false,interactive=false){
    const lines=(factoryDb.issues||[]).filter(i=>(i.productionRequestId||i.job)===key);
    if(!lines.length)return '<div class="empty">No raw material usage for this job.</div>';
    const prodId=lines.find(i=>i.productionRequestId)?.productionRequestId||'';
    const prod=prodId?factoryProductionById(prodId):null;
    const snap=lines[0].productionSnapshot||{};
    const p=prod||snap;
    let unknown=0,total=0;
    const rows=lines.map(i=>{
      const cost=i.price===null||i.price===undefined?null:Number(i.qty||0)*Number(i.price||0);
      if(cost===null)unknown++;else total+=cost;
      return [
        fEsc(i.itemName),fEsc(i.supplierName||fName(factoryDb.suppliers,i.supplierId)),
        fEsc(i.ownerName||fName(factoryDb.owners,i.ownerId)),
        fFmt(i.qty),fEsc(i.unit),
        ...(showCost?[i.price===null||i.price===undefined?'PRICE MISSING':fMoney(i.price),cost===null?'UNPRICED':fMoney(cost)]:[])
      ];
    });
    const heading=`<div class="factory-job-head"><b>${fEsc(prod?.orderNo||prod?.prodNo||snap.orderNo||lines[0].job)}</b><span>${fEsc(p.customerName||'')} • ${fEsc(p.size||'')} ${fEsc(p.material||'')} ${fEsc(p.layout||'')} • Finished ${fFmt(p.finishedQty||p.packing?.total||p.requestQty||0)} ${fEsc(p.unit||'Rolls')} • ${fEsc(p.status||'')}</span></div>`;
    return `${heading}${factoryTable(
      ['Raw Material','Supplier','Ownership','Actual Used','Unit',...(showCost?['Unit Price','Material Cost']:[])],
      rows
    )}${showCost?`<div class="factory-cost-total"><span>${unknown?'Known material subtotal':'Total material cost'}</span><b>${fMoney(total)}</b></div>${unknown?`<div class="notice">${unknown} unpriced line(s). Full job material cost is incomplete.</div>`:''}`:''}`;
  }
  window.showFactoryJob=function(){
    const key=f$('factoryReportJob')?.value||'';
    if(f$('factoryJobDetail'))f$('factoryJobDetail').innerHTML=key?factoryJobMarkup(key,fCan('factory_cost_view'),true):'';
  };
  window.printFactoryJob=function(cost){
    if(!requirePerm('factory_reports','print Factory job reports'))return;
    if(cost&&!requirePerm('factory_cost_view','view Factory material cost'))return;
    const key=f$('factoryReportJob')?.value||'';
    if(!key)return toast('Select a production job');
    const w=window.open('','_blank','width=1100,height=800');
    if(!w)return toast('Allow pop-ups to print the Factory report');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Factory Job Report</title><style>
      body{font:12px Arial;color:#173439;padding:20px}h1{color:#098f91}.factory-table{width:100%;border-collapse:collapse}.factory-table th,.factory-table td{border:1px solid #dbe6e7;padding:7px;text-align:left}.factory-job-head{margin:12px 0}.factory-job-head b{font-size:18px;display:block}.factory-job-head span{color:#60767b}.factory-cost-total{display:flex;justify-content:flex-end;gap:20px;margin-top:12px;font-size:16px}.btn,.notice{display:none}@page{size:A4 landscape;margin:12mm}
    </style></head><body><h1>SOFTCREATION · Factory Inventory</h1><p>${cost?'MATERIAL COST REPORT':'RAW MATERIAL USAGE REPORT'} · Generated ${fEsc(new Date().toLocaleString())}</p>${factoryJobMarkup(key,cost,false)}



</body></html>`);
    w.document.close();w.focus();setTimeout(()=>w.print(),250);
  };
  window.exportFactoryBackup=function(){
    if(!requirePerm('factory_manage','export Factory backup'))return;
    const blob=new Blob([JSON.stringify(factoryDb,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='softcreation-factory-backup-'+fToday()+'.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  async function restoreFactoryBackup(e){
    if(!requirePerm('factory_manage','restore Factory backup'))return;
    if(!protectedEdit('restore Factory inventory backup')){e.target.value='';return}
    const file=e.target.files?.[0];if(!file)return;
    try{
      const raw=JSON.parse(await file.text());
      const n=factoryNormalize(raw);
      for(const k of ['items','suppliers','owners','lots','issues','returns','audit'])if(!Array.isArray(n[k]))throw new Error('Invalid backup');
      if(!confirm('Replace the current Factory cloud state with this backup?'))return;
      await factoryCommit('Factory backup restored',d=>{
        for(const k of ['items','suppliers','owners','lots','issues','returns','audit'])d[k]=JSON.parse(JSON.stringify(n[k]));
      });
    }catch(err){toast('Factory restore failed — '+err.message)}
    finally{e.target.value=''}
  }

  function installFactoryUI(){
    FACTORY_FEATURES.forEach(f=>{if(!USER_FEATURES.some(x=>x[0]===f[0]))USER_FEATURES.push(f)});
    VIEW_PERMS.factory='factory_view';

    const nav=document.querySelector('.nav');
    if(nav&&!nav.querySelector('.navbtn[data-view="factory"]')){
      const btn=document.createElement('button');
      btn.className='navbtn';
      btn.dataset.view='factory';
      btn.textContent='Factory';
      btn.onclick=()=>showView('factory');
      const stores=nav.querySelector('.navbtn[data-view="stores"]');
      const settings=nav.querySelector('.navbtn[data-view="settings"]');
      if(stores)stores.insertAdjacentElement('afterend',btn);
      else if(settings)nav.insertBefore(btn,settings);
      else nav.appendChild(btn);
    }

    if(!f$('factory')){
      const app=document.querySelector('.app');
      const section=document.createElement('section');
      section.id='factory';
      section.className='view';
      section.innerHTML=`
        <div class="panel">
          <div class="panel-title factory-title-row">
            <div><span>Factory</span><small>Raw Material Stock • Production Usage • Job Cost</small></div>
            <div class="factory-title-actions">
              <span id="factoryCloudStatus" class="factory-cloud-status">Not loaded</span>
              <button class="btn sm" style="background:#fff;color:#087f83" type="button" onclick="loadFactoryCloud(true)">Refresh</button>
            </div>
          </div>
          <div class="panel-body">
            <div id="factorySubnav" class="factory-subnav"></div>
            <div id="factoryBody"><div class="factory-loading">Open Factory to load inventory.</div></div>
          </div>
        </div>`;
      app.appendChild(section);
    }

    const baseShow=window.showView;
    window.showView=function(id){
      const r=baseShow.apply(this,arguments);
      if(id==='factory'){
        if(!fCan('factory_view'))return r;
        loadFactoryCloud(false);
        renderFactory();
      }
      return r;
    };
    try{showView=window.showView}catch(_){}

    const baseAccess=window.applyUserAccess;
    window.applyUserAccess=function(){
      const r=baseAccess.apply(this,arguments);
      const b=document.querySelector('.navbtn[data-view="factory"]');
      if(b)b.style.display=fCan('factory_view')?'inline-block':'none';
      return r;
    };
    try{applyUserAccess=window.applyUserAccess}catch(_){}

    const baseRefresh=window.refreshAll;
    if(typeof baseRefresh==='function'){
      window.refreshAll=function(){
        const r=baseRefresh.apply(this,arguments);
        if(f$('factory')?.classList.contains('active')&&factoryLoaded)renderFactory();
        return r;
      };
      try{refreshAll=window.refreshAll}catch(_){}
    }

    window.loadFactoryCloud=loadFactoryCloud;

    try{renderUserPrivilegeEditor(null)}catch(_){}
    try{applyUserAccess()}catch(_){}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installFactoryUI,{once:true});
  else installFactoryUI();
})();
