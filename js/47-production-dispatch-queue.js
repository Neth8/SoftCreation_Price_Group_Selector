
/* =========================================================
   SoftCreation V1.1.24
   A) Products -> Packed -> Dispatch Ready state fix
   B) Printer Connection Hub (USB active; BT/Network placeholders)
   ========================================================= */
(function(){
  const FLOW_V1124=['Requested','Approved','Planned','In Production','QC Check','Finished','Dispatched','Received','GRN Closed'];
  const usbSessionsV1124=new Map();

  function flowIndexV1124(status){
    const i=FLOW_V1124.indexOf(String(status||'Requested'));
    return i<0?0:i;
  }

  function producedV1124(r){
    const vals=[r?.finishedQty,r?.packing?.total,r?.batchPackingV1040?.total];
    for(const v of vals){const n=Number(v||0);if(n>0)return n}
    return flowIndexV1124(r?.status)>=flowIndexV1124('Finished')?Math.max(0,Number(r?.requestQty||0)):0;
  }

  function dispatchedV1124(r){
    return (r?.dispatches||[]).reduce((n,d)=>n+Math.max(0,Number(d?.qty||0)),0);
  }

  function availableV1124(r){
    if(flowIndexV1124(r?.status)<flowIndexV1124('Finished'))return 0;
    return Math.max(0,producedV1124(r)-dispatchedV1124(r));
  }

  function physicalPackingV1124(r){
    /* V1.1.23 normalizes same-job physical packing before the final dispatch modal.
       For this selector, prefer exact r.packing first so boxes remain separate. */
    const p=r?.packing||r?.batchPackingV1040||{};
    const boxes=Array.isArray(p?.boxes)?p.boxes:[];
    const loose=Math.max(0,Number(p?.loose||0));
    return {boxes,loose,total:boxes.reduce((n,b)=>n+Math.max(0,Number(b?.rolls||0)),0)+loose};
  }

  function ensureProductDispatchModalV1124(){
    let modal=$('productDispatchModalV1124');
    if(modal)return modal;
    document.body.insertAdjacentHTML('beforeend',`
      <div id="productDispatchModalV1124" class="modal">
        <div class="modal-card product-dispatch-modal-v1124">
          <div class="modal-head">
            <div><b>Dispatch Ready</b><div id="productDispatchMetaV1124" class="small"></div></div>
            <button class="closex" type="button" onclick="closeModal('productDispatchModalV1124')">×</button>
          </div>
          <div id="productDispatchBodyV1124" class="modal-body"></div>
        </div>
      </div>`);
    return $('productDispatchModalV1124');
  }

  window.openProductDispatchV1124=function(encodedKey){
    if(currentUser?.role!=='admin'&&!hasPerm('production_manage')){
      return requirePerm('production_manage','dispatch finished production');
    }
    const key=decodeURIComponent(encodedKey||'');
    const g=(productionProductGroupsV103()||[]).find(x=>x.key===key);
    if(!g)return toast('Product not found');

    const jobs=(g.jobs||[])
      .filter(r=>availableV1124(r)>0)
      .sort((a,b)=>(Date.parse(b?.finishedAt||b?._spgsUpdatedAt||0)||0)-(Date.parse(a?.finishedAt||a?._spgsUpdatedAt||0)||0));

    const total=jobs.reduce((n,r)=>n+availableV1124(r),0);
    const modal=ensureProductDispatchModalV1124();
    $('productDispatchMetaV1124').textContent=`${g.size} • ${g.material} • ${g.layout} • ${money(g.pcs)} pcs/roll • ${money(total)} ${g.unit||'Rolls'} available`;

    if(!jobs.length){
      $('productDispatchBodyV1124').innerHTML='<div class="empty">No packed / Finished balance is available to dispatch.</div>';
      modal.classList.add('show');
      return;
    }

    // One visible dispatch action, existing per-job ledger remains untouched.
    // Routing uses the first eligible finished job; other jobs remain visible for traceability.
    const dispatchTarget = jobs[0];
    $('productDispatchBodyV1124').innerHTML=`
      <div class="notice"><b>Dispatch ready packing batch.</b> Contributing production jobs are listed below for reference. Physical cartons are selected in the existing Dispatch Packing Batch screen. Dispatch accounting is still tied to a production job.</div>
      <div class="dispatch-ready-list-v1124">
        ${jobs.map(r=>`
          <div class="dispatch-ready-job-v1124">
            <div class="dispatch-ready-job-head-v1124">
              <div><b>${esc(r.orderNo||'-')}</b><span>${esc(r.customerName||'-')} • PI ${esc(r.piSerial||'-')} • ${esc(r.status||'-')}</span></div>
              <div class="dispatch-ready-balance-v1124"><span>Available</span><b>${money(availableV1124(r))}</b></div>
            </div>
          </div>`).join('')}
      </div>
      <div class="actions" style="margin-top:16px">
        <button class="btn navy" type="button" id="dispatchSingleActionV1131">Open Dispatch Packing Batch</button>
      </div>
      ${jobs.length>1?'<div class="small" style="margin-top:8px">Current dispatch records are allocated by production job. This action opens the first eligible job; it does not combine multiple job balances into one dispatch note.</div>':''}`;
    const dispatchButton=$('dispatchSingleActionV1131');
    if(dispatchButton){
      dispatchButton.addEventListener('click',()=>{
        const id=dispatchTarget?.id;
        if(!id)return toast('No finished production job is available');
        closeModal('productDispatchModalV1124');
        if(typeof window.openDispatchLoadingV81==='function'){
          window.openDispatchLoadingV81(id);
        }else{
          toast('Dispatch Packing Batch handler is unavailable');
        }
      });
    }
    modal.classList.add('show');
  };

  /* Force a final Products refresh after packing save so the same card immediately
     changes from active production to Finished — Dispatch Ready. */
  const baseSavePackingV1124=window.savePackingV81;
  if(typeof baseSavePackingV1124==='function'){
    window.savePackingV81=async function(){
      const result=await baseSavePackingV1124.apply(this,arguments);
      setTimeout(()=>{
        try{renderProductionProducts()}catch(e){console.error('V1.1.24 Products refresh',e)}
      },0);
      return result;
    };
    try{savePackingV81=window.savePackingV81}catch(_){}
  }

  /* ------------------------- Printer Hub ------------------------- */
  function usbKeyV1124(device){
    return [device.vendorId,device.productId,device.serialNumber||'',device.productName||''].join(':');
  }

  function hexV1124(n){
    return '0x'+Number(n||0).toString(16).padStart(4,'0').toUpperCase();
  }

  function printerHubMessageV1124(msg,type=''){
    const el=$('printerUsbMessageV1124');
    if(!el)return;
    el.className='printer-usb-message-v1124 '+type;
    el.textContent=msg;
  }

  /* V1.1.25 — USB ESC/POS test printing */
  function concatBytesV1125(parts){
    const arrays=parts.map(p=>{
      if(p instanceof Uint8Array)return p;
      if(Array.isArray(p))return new Uint8Array(p);
      return new TextEncoder().encode(String(p??''));
    });
    const total=arrays.reduce((n,a)=>n+a.length,0);
    const out=new Uint8Array(total);
    let offset=0;
    arrays.forEach(a=>{out.set(a,offset);offset+=a.length});
    return out;
  }

  function testReceiptBytesV1125(device){
    const when=new Date().toLocaleString();
    const line='--------------------------------\n';
    return concatBytesV1125([
      [0x1B,0x40],
      [0x1B,0x61,0x01],
      [0x1B,0x45,0x01],
      'SOFTCREATION\n',
      'USB PRINTER TEST\n',
      [0x1B,0x45,0x00],
      '\n',
      [0x1B,0x61,0x00],
      line,
      'Connection: OK\n',
      `Printer: ${device?.productName||'USB Receipt Printer'}\n`,
      `VID: ${hexV1124(device?.vendorId)}\n`,
      `PID: ${hexV1124(device?.productId)}\n`,
      `Time: ${when}\n`,
      line,
      'If you can read this receipt,\n',
      'WebUSB printing is working.\n',
      '\n\n\n',
      [0x1D,0x56,0x42,0x00]
    ]);
  }

  async function sendUsbTestV1125(session){
    if(!session?.device)throw new Error('USB printer session not found.');
    if(!session.connected)throw new Error('Printer is not connected.');
    if(session.endpointNumber==null)throw new Error('No writable USB OUT endpoint is available.');
    const device=session.device;
    if(!device.opened)await device.open();
    if(!device.configuration){
      const configValue=device.configurations?.[0]?.configurationValue||1;
      await device.selectConfiguration(configValue);
    }
    if(session.interfaceNumber!=null){
      try{await device.claimInterface(session.interfaceNumber)}catch(_){}
    }
    const data=testReceiptBytesV1125(device);
    try{
      const result=await device.transferOut(session.endpointNumber,data);
      if(result?.status && result.status!=='ok')throw new Error(`USB transfer status: ${result.status}`);
      return result;
    }catch(firstError){
      try{
        await device.clearHalt('out',session.endpointNumber);
        const result=await device.transferOut(session.endpointNumber,data);
        if(result?.status && result.status!=='ok')throw new Error(`USB transfer status: ${result.status}`);
        return result;
      }catch(_){
        throw firstError;
      }
    }
  }

  /* V1.1.26 — expose active WebUSB receipt printer to app modules. */
  function connectedUsbSessionV1126(){
    return [...usbSessionsV1124.values()].find(
      s=>s?.connected && s?.device && s?.endpointNumber!=null
    )||null;
  }

  window.getConnectedUsbPrinterV1126=function(){
    return connectedUsbSessionV1126();
  };

  window.printUsbBytesV1126=async function(bytes){
    const session=connectedUsbSessionV1126();
    if(!session)throw new Error('No connected USB receipt printer.');
    const device=session.device;
    if(!device.opened)await device.open();
    if(!device.configuration){
      const configValue=device.configurations?.[0]?.configurationValue||1;
      await device.selectConfiguration(configValue);
    }
    if(session.interfaceNumber!=null){
      try{await device.claimInterface(session.interfaceNumber)}catch(_){}
    }
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
    try{
      const result=await device.transferOut(session.endpointNumber,data);
      if(result?.status&&result.status!=='ok')throw new Error(`USB transfer status: ${result.status}`);
      return result;
    }catch(firstError){
      try{
        await device.clearHalt('out',session.endpointNumber);
        const result=await device.transferOut(session.endpointNumber,data);
        if(result?.status&&result.status!=='ok')throw new Error(`USB transfer status: ${result.status}`);
        return result;
      }catch(_){throw firstError}
    }
  };

  window.disconnectUsbPrinterV1126=async function(encodedKey){
    const key=decodeURIComponent(encodedKey||'');
    const session=usbSessionsV1124.get(key);
    if(!session?.device)return printerHubMessageV1124('USB printer session was not found.','bad');
    const device=session.device;
    try{
      if(device.opened){
        if(session.interfaceNumber!=null){
          try{await device.releaseInterface(session.interfaceNumber)}catch(_){}
        }
        try{await device.close()}catch(_){}
      }
      session.connected=false;
      session.status='Authorized — disconnected';
      session.interfaceNumber=null;
      session.alternateSetting=null;
      session.endpointNumber=null;
      session.error='';
      try{
        const preferred=JSON.parse(localStorage.getItem('softcreation_usb_printer_v1124')||'null');
        if(preferred&&preferred.vendorId===device.vendorId&&preferred.productId===device.productId&&(!preferred.serialNumber||preferred.serialNumber===(device.serialNumber||''))){
          localStorage.removeItem('softcreation_usb_printer_v1124');
        }
      }catch(_){}
      const devices=await navigator.usb.getDevices();
      renderUsbDevicesV1124(devices);
      printerHubMessageV1124(`${device.productName||'USB printer'} disconnected. You can reconnect it any time.`,'ok');
    }catch(e){
      console.error('USB disconnect',e);
      printerHubMessageV1124('Disconnect failed: '+(e?.message||e),'bad');
    }
  };

  window.testUsbPrinterV1125=async function(encodedKey){
    const key=decodeURIComponent(encodedKey||'');
    const session=usbSessionsV1124.get(key);
    if(!session)return printerHubMessageV1124('Printer session was not found. Refresh the USB list and reconnect.','bad');
    const btn=[...document.querySelectorAll('[data-usb-test-key]')].find(x=>x.dataset.usbTestKey===key);
    if(btn){btn.disabled=true;btn.textContent='Printing…'}
    try{
      printerHubMessageV1124('Sending ESC/POS test receipt to the USB printer…','working');
      await sendUsbTestV1125(session);
      printerHubMessageV1124('Test receipt sent successfully. Check the printer.','ok');
    }catch(e){
      console.error('USB test print',e);
      printerHubMessageV1124('Test print failed: '+(e?.message||e),'bad');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='Test Print'}
    }
  };

  function supportStateV1124(){
    const hasUsb=!!navigator.usb;
    const secure=!!window.isSecureContext;
    const status=$('printerUsbSupportV1124');
    if(status){
      status.innerHTML=`
        <div><span>WebUSB</span><b class="${hasUsb?'ok':'bad'}">${hasUsb?'Supported':'Not supported'}</b></div>
        <div><span>Secure Context</span><b class="${secure?'ok':'bad'}">${secure?'HTTPS / secure':'HTTPS required'}</b></div>
        <div><span>Current Browser</span><b>${esc(navigator.userAgent.includes('Android')?'Android browser':'Desktop browser')}</b></div>`;
    }
    const connect=$('printerUsbConnectV1124');
    if(connect)connect.disabled=!(hasUsb&&secure);
  }

  function interfaceCandidatesV1124(device){
    const out=[];
    const cfg=device.configuration;
    if(!cfg)return out;
    (cfg.interfaces||[]).forEach(intf=>{
      (intf.alternates||[]).forEach(alt=>{
        const endpoints=(alt.endpoints||[]);
        const bulkOut=endpoints.find(e=>e.direction==='out'&&e.type==='bulk');
        const anyOut=endpoints.find(e=>e.direction==='out');
        if(alt.interfaceClass===7 || bulkOut || anyOut){
          out.push({
            interfaceNumber:intf.interfaceNumber,
            alternateSetting:alt.alternateSetting,
            interfaceClass:alt.interfaceClass,
            endpoint:bulkOut||anyOut||null,
            printerClass:alt.interfaceClass===7
          });
        }
      });
    });
    return out.sort((a,b)=>Number(b.printerClass)-Number(a.printerClass));
  }

  async function connectDeviceV1124(device){
    const key=usbKeyV1124(device);
    const session=usbSessionsV1124.get(key)||{device,status:'Authorized'};
    session.device=device;
    usbSessionsV1124.set(key,session);

    try{
      if(!device.opened)await device.open();
      if(!device.configuration){
        const configValue=device.configurations?.[0]?.configurationValue||1;
        await device.selectConfiguration(configValue);
      }
      const candidates=interfaceCandidatesV1124(device);
      if(!candidates.length){
        session.status='Authorized — no writable printer endpoint found';
        session.connected=false;
        session.interfaceNumber=null;
        session.endpointNumber=null;
        session.error='No writable USB OUT endpoint found';
        return session;
      }
      const c=candidates[0];
      await device.claimInterface(c.interfaceNumber);
      if(Number.isInteger(c.alternateSetting) && c.alternateSetting!==0){
        try{await device.selectAlternateInterface(c.interfaceNumber,c.alternateSetting)}catch(_){}
      }
      session.status=c.printerClass?'Connected — USB Printer interface':'Connected — writable USB interface';
      session.connected=true;
      session.interfaceNumber=c.interfaceNumber;
      session.endpointNumber=c.endpoint?.endpointNumber??null;
      session.interfaceClass=c.interfaceClass;
      localStorage.setItem('softcreation_usb_printer_v1124',JSON.stringify({vendorId:device.vendorId,productId:device.productId,serialNumber:device.serialNumber||'',productName:device.productName||''}));
      return session;
    }catch(e){
      session.status='Authorized — connection failed: '+(e?.message||e);
      session.connected=false;
      session.error=String(e?.message||e);
      return session;
    }
  }

  function renderUsbDevicesV1124(devices=[]){
    const host=$('printerUsbListV1124');
    if(!host)return;
    const rows=devices.map(device=>{
      const key=usbKeyV1124(device);
      const session=usbSessionsV1124.get(key);
      const connected=!!session?.connected;
      const status=session?.status||'Authorized — click Connect';
      return `<div class="printer-device-card-v1124 ${connected?'connected':''}">
        <div class="printer-device-icon-v1124">USB</div>
        <div class="printer-device-main-v1124">
          <b>${esc(device.productName||'USB Device')}</b>
          <span>${esc(device.manufacturerName||'Unknown manufacturer')}</span>
          <small>VID ${hexV1124(device.vendorId)} • PID ${hexV1124(device.productId)}${device.serialNumber?` • S/N ${esc(device.serialNumber)}`:''}</small>
          <small class="printer-device-status-v1124">${esc(status)}</small>
        </div>
        <div class="printer-device-actions-v1125">
          ${connected
            ? `<button class="btn green sm" type="button" disabled>Connected</button>
               ${session?.endpointNumber!=null?`<button class="btn navy sm" type="button" data-usb-test-key="${esc(key)}" onclick="testUsbPrinterV1125('${encodeURIComponent(key)}')">Test Print</button>`:''}
               <button class="btn red sm" type="button" onclick="disconnectUsbPrinterV1126('${encodeURIComponent(key)}')">Disconnect</button>`
            : `<button class="btn primary sm" type="button" onclick="connectAuthorizedUsbV1124('${encodeURIComponent(key)}')">Connect</button>`}
        </div>
      </div>`;
    }).join('');
    host.innerHTML=rows||'<div class="empty">No authorized USB printers yet. Connect the printer to the Android device with USB OTG, then press <b>Find USB Printer</b>.</div>';
    const dot=$('printerHubDotV1124');
    if(dot)dot.classList.toggle('connected',[...usbSessionsV1124.values()].some(x=>x.connected));
  }

  async function refreshAuthorizedUsbV1124(autoConnect=false){
    if(!navigator.usb){renderUsbDevicesV1124([]);return []}
    try{
      const devices=await navigator.usb.getDevices();
      devices.forEach(d=>{
        const key=usbKeyV1124(d);
        if(!usbSessionsV1124.has(key))usbSessionsV1124.set(key,{device:d,status:'Authorized',connected:false});
      });
      if(autoConnect){
        const preferred=JSON.parse(localStorage.getItem('softcreation_usb_printer_v1124')||'null');
        if(preferred){
          const match=devices.find(d=>d.vendorId===preferred.vendorId&&d.productId===preferred.productId&&(!preferred.serialNumber||d.serialNumber===preferred.serialNumber));
          if(match)await connectDeviceV1124(match);
        }
      }
      renderUsbDevicesV1124(devices);
      return devices;
    }catch(e){
      printerHubMessageV1124('USB refresh failed: '+(e?.message||e),'bad');
      return [];
    }
  }

  window.connectAuthorizedUsbV1124=async function(encodedKey){
    const key=decodeURIComponent(encodedKey||'');
    const devices=await navigator.usb.getDevices();
    const device=devices.find(d=>usbKeyV1124(d)===key);
    if(!device)return printerHubMessageV1124('USB device is no longer attached.','bad');
    printerHubMessageV1124('Connecting to USB printer…','working');
    const s=await connectDeviceV1124(device);
    await refreshAuthorizedUsbV1124(false);
    printerHubMessageV1124(s.connected?'USB printer connected.':'Permission granted, but the printer interface could not be opened. '+(s.error||''),s.connected?'ok':'bad');
  };

  window.findUsbPrinterV1124=async function(){
    if(!navigator.usb)return printerHubMessageV1124('WebUSB is not supported by this browser. Use Chrome/Chromium on Android or desktop.','bad');
    if(!window.isSecureContext)return printerHubMessageV1124('WebUSB requires HTTPS (or localhost during development).','bad');
    try{
      printerHubMessageV1124('Choose the connected USB receipt printer from the browser device picker…','working');
      /* Empty filters intentionally allow the browser to show all WebUSB-accessible
         USB devices. The user explicitly chooses the receipt printer. */
      const device=await navigator.usb.requestDevice({filters:[]});
      const session=await connectDeviceV1124(device);
      await refreshAuthorizedUsbV1124(false);
      printerHubMessageV1124(session.connected?'USB printer connected and ready. Use Test Print on the printer card.':'Printer permission was granted, but the writable interface could not be claimed. '+(session.error||''),session.connected?'ok':'bad');
    }catch(e){
      if(e?.name==='NotFoundError')return printerHubMessageV1124('No USB printer selected.','');
      printerHubMessageV1124('USB connection failed: '+(e?.message||e),'bad');
    }
  };

  window.refreshUsbPrintersV1124=async function(){
    printerHubMessageV1124('Refreshing authorized USB devices…','working');
    const devices=await refreshAuthorizedUsbV1124(false);
    printerHubMessageV1124(`${devices.length} authorized USB device${devices.length===1?'':'s'} found.`,'ok');
  };

  window.printerHubTabV1124=function(tab){
    ['usb','bluetooth','network'].forEach(x=>{
      $('printerTabBtn'+x[0].toUpperCase()+x.slice(1)+'V1124')?.classList.toggle('active',x===tab);
      const pane=$('printerTab'+x[0].toUpperCase()+x.slice(1)+'V1124');
      if(pane)pane.hidden=x!==tab;
    });
  };

  window.openPrinterHubV1124=function(){
    const modal=$('printerHubModalV1124');
    if(!modal)return;
    modal.classList.add('show');
    printerHubTabV1124('usb');
    supportStateV1124();
    refreshAuthorizedUsbV1124(true);
  };

  function ensurePrinterHubUiV1124(){
    if($('printerHubModalV1124'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <div id="printerHubModalV1124" class="modal printer-hub-modal-v1124">
        <div class="modal-card printer-hub-card-v1124">
          <div class="modal-head">
            <div><b>Printer Connections</b><div class="small">Connect receipt / label printers to this device</div></div>
            <button class="closex" type="button" onclick="closeModal('printerHubModalV1124')">×</button>
          </div>
          <div class="modal-body">
            <div class="printer-tabs-v1124">
              <button id="printerTabBtnUsbV1124" class="printer-tab-btn-v1124 active" type="button" onclick="printerHubTabV1124('usb')">USB</button>
              <button id="printerTabBtnBluetoothV1124" class="printer-tab-btn-v1124" type="button" onclick="printerHubTabV1124('bluetooth')">Bluetooth <small>Next</small></button>
              <button id="printerTabBtnNetworkV1124" class="printer-tab-btn-v1124" type="button" onclick="printerHubTabV1124('network')">Network <small>Next</small></button>
            </div>

            <div id="printerTabUsbV1124" class="printer-tab-pane-v1124">
              <div class="printer-usb-hero-v1124">
                <div><b>USB Receipt Printer</b><span>Android Chrome / Chromium + USB OTG • WebUSB</span></div>
                <button id="printerUsbConnectV1124" class="btn primary" type="button" onclick="findUsbPrinterV1124()">Find USB Printer</button>
              </div>
              <div id="printerUsbSupportV1124" class="printer-support-grid-v1124"></div>
              <div class="printer-usb-note-v1124"><b>How it works:</b> connect the receipt printer to the Android phone/tablet using USB OTG, tap <b>Find USB Printer</b>, then choose the printer in Chrome's USB permission dialog. After it shows Connected, press <b>Test Print</b> on that printer card to send a real ESC/POS receipt directly from this screen.</div>
              <div class="actions"><button class="btn ghost sm" type="button" onclick="refreshUsbPrintersV1124()">Refresh Authorized Devices</button></div>
              <div id="printerUsbMessageV1124" class="printer-usb-message-v1124"></div>
              <div id="printerUsbListV1124" class="printer-device-list-v1124"></div>
            </div>

            <div id="printerTabBluetoothV1124" class="printer-tab-pane-v1124" hidden>
              <div class="printer-placeholder-v1124"><b>Bluetooth Printers</b><span>Placeholder only in v1.1.25. Bluetooth discovery / connection will be implemented next.</span></div>
            </div>

            <div id="printerTabNetworkV1124" class="printer-tab-pane-v1124" hidden>
              <div class="printer-placeholder-v1124"><b>Network Printers</b><span>Placeholder only in v1.1.25. LAN / Wi-Fi printer connection will be implemented next.</span></div>
            </div>
          </div>
        </div>
      </div>`);
  }

  function installV1124(){
    ensurePrinterHubUiV1124();
    supportStateV1124();
    if(navigator.usb){
      navigator.usb.addEventListener('connect',()=>refreshAuthorizedUsbV1124(false));
      navigator.usb.addEventListener('disconnect',e=>{
        const key=usbKeyV1124(e.device);
        usbSessionsV1124.delete(key);
        refreshAuthorizedUsbV1124(false);
      });
      refreshAuthorizedUsbV1124(true);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installV1124,{once:true});
  else installV1124();
})();
