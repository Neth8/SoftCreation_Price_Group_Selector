
/* SoftCreation V1.1.26 — auto USB dispatch receipt for 3-inch ESC/POS printer. */
(function(){
  function asciiV1126(v){return String(v??'').replace(/[^\x20-\x7E\n]/g,' ').replace(/[ \t]+/g,' ').trim()}
  function bytesV1126(parts){const enc=new TextEncoder();const arrays=parts.map(p=>p instanceof Uint8Array?p:Array.isArray(p)?new Uint8Array(p):enc.encode(String(p??'')));const total=arrays.reduce((n,a)=>n+a.length,0);const out=new Uint8Array(total);let pos=0;arrays.forEach(a=>{out.set(a,pos);pos+=a.length});return out}
  function lineV1126(){return '------------------------------------------------\n'}
  function centerV1126(text,width=48){const s=asciiV1126(text).slice(0,width);return ' '.repeat(Math.max(0,Math.floor((width-s.length)/2)))+s+'\n'}
  function wrapV1126(text,width=48,prefix=''){const clean=asciiV1126(text);if(!clean)return '';const max=Math.max(8,width-prefix.length);const words=clean.split(/\s+/);const lines=[];let cur='';for(const word of words){if(!cur)cur=word;else if((cur+' '+word).length<=max)cur+=' '+word;else{lines.push(prefix+cur);cur=word}}if(cur)lines.push(prefix+cur);return lines.join('\n')+'\n'}
  function kvV1126(label,value){const left=asciiV1126(label),right=asciiV1126(value),room=48-left.length-2;if(room>=right.length)return left+': '+right.padStart(room,' ')+'\n';return left+':\n'+wrapV1126(right,48,'  ')}
  function dispatchReceiptCopyPartsV1127(r,d,copyLabel){
    const parts=[
      [0x1B,0x40],             // initialize
      [0x1B,0x4D,0x00],       // Font A — 48 columns on common 80mm/78mm printers
      [0x1B,0x61,0x01],       // center
      [0x1B,0x45,0x01],       // bold
      centerV1126('SOFTCREATION'),
      centerV1126('DISPATCH RECEIPT'),
      [0x1B,0x45,0x00],
      centerV1126(copyLabel),
      [0x1B,0x61,0x00],
      lineV1126(),
      kvV1126('Dispatch',d?.dispatchNo||'-'),
      kvV1126('Production',r?.orderNo||d?.orderNo||'-'),
      kvV1126('PI',r?.piSerial||d?.piSerial||'-'),
      kvV1126('Date',d?.date||'-'),
      lineV1126(),
      'CUSTOMER\n',
      wrapV1126(r?.customerName||d?.customerName||'-'),
      'ITEM\n',
      wrapV1126([r?.size,r?.material,r?.layout,Number(r?.pcs||0)>0?`${r.pcs} pcs/roll`:'' ].filter(Boolean).join(' / ')),
      lineV1126()
    ];

    if(d?.directToCustomer){
      const x=d?.directDelivery||{};
      parts.push(
        'DESTINATION - CUSTOMER\n',
        wrapV1126(x.customerName||d?.customerName||'-'),
        x.customerPhone?kvV1126('Phone',x.customerPhone):'',
        x.address?('Address:\n'+wrapV1126(x.address,48,'  ')):'',
        x.vehicleNo?kvV1126('Vehicle',x.vehicleNo):'',
        x.driverName?kvV1126('Driver',x.driverName):'',
        x.driverPhone?kvV1126('Driver Tel',x.driverPhone):''
      );
    }else{
      parts.push('DESTINATION - STORES\n',kvV1126('Carrier',d?.carrier||'-'));
    }

    parts.push(lineV1126(),[0x1B,0x45,0x01],'PACKING / LOADING\n',[0x1B,0x45,0x00]);
    const boxes=Array.isArray(d?.boxes)?d.boxes:[];
    boxes.forEach((b,i)=>{
      parts.push(kvV1126(`Box ${asciiV1126(b?.boxNo||String(i+1).padStart(2,'0'))}`,`${Number(b?.qty||0)} rolls`));
    });
    const loose=Math.max(0,Number(d?.loose||0));
    if(loose>0)parts.push(kvV1126('Loose',`${loose} rolls`));

    parts.push(
      lineV1126(),
      [0x1B,0x45,0x01],kvV1126('TOTAL',`${Number(d?.qty||0)} rolls`),[0x1B,0x45,0x00]
    );
    if(d?.note)parts.push(lineV1126(),'NOTE\n',wrapV1126(d.note));

    parts.push(
      lineV1126(),
      kvV1126('Created By',d?.by||d?.byUser||'-'),
      '\n',
      'Factory Person Signature\n',
      '________________________________________\n',
      '\n',
      'Delivery Person Signature\n',
      '________________________________________\n',
      '\n',
      [0x1B,0x61,0x01],centerV1126('DISPATCH LOCKED'),[0x1B,0x61,0x00],
      '\n\n'
    );
    return parts;
  }

  function dispatchReceiptBytesV1126(r,d){
    /* Two physical copies: Factory Copy + Delivery Copy. Each copy is cut separately. */
    const parts=[];
    parts.push(...dispatchReceiptCopyPartsV1127(r,d,'FACTORY COPY'));
    parts.push([0x1D,0x56,0x42,0x00]);
    parts.push('\n');
    parts.push(...dispatchReceiptCopyPartsV1127(r,d,'DELIVERY COPY'));
    parts.push([0x1D,0x56,0x42,0x00]);
    return bytesV1126(parts);
  }
  window.dispatchReceiptBytesV1127=dispatchReceiptBytesV1126;
  window.printDispatchReceiptUsbV1126=async function(r,d){if(typeof window.getConnectedUsbPrinterV1126!=='function'||typeof window.printUsbBytesV1126!=='function')throw new Error('USB printer service is not available.');if(!window.getConnectedUsbPrinterV1126())throw new Error('No USB receipt printer is connected.');return window.printUsbBytesV1126(dispatchReceiptBytesV1126(r,d))};
  function installV1126(){
    if(window.__dispatchUsbReceiptV1126Installed)return;window.__dispatchUsbReceiptV1126Installed=true;
    const baseConfirm=window.confirmDispatchLoadingV81;if(typeof baseConfirm!=='function')return;
    window.confirmDispatchLoadingV81=function(){
      const requestId=$('dispatchLoadReqId')?.value||'';
      const before=(state.productionRequests||[]).find(x=>x.id===requestId);
      const previousIds=new Set((before?.dispatches||[]).map(x=>String(x?.id||'')));
      const result=baseConfirm.apply(this,arguments);
      const r=(state.productionRequests||[]).find(x=>x.id===requestId);
      const d=(r?.dispatches||[]).find(x=>!previousIds.has(String(x?.id||'')));
      if(!r||!d)return result;
      if(typeof window.printDispatchReceiptV1127==='function'){
        window.printDispatchReceiptV1127(r,d)
          .then(info=>toast(`Dispatch ${d.dispatchNo} locked and ${info?.label||'receipt'} printed — 2 copies.`))
          .catch(e=>{console.error('Dispatch receipt print',e);toast(`Dispatch locked, but receipt print failed: ${e?.message||e}`)});
        return result;
      }
      if(typeof window.getConnectedUsbPrinterV1126!=='function'||!window.getConnectedUsbPrinterV1126()){toast('Dispatch locked. No receipt printer connected, so receipt was not printed.');return result;}
      window.printDispatchReceiptUsbV1126(r,d).then(()=>toast(`Dispatch ${d.dispatchNo} locked and USB receipt printed — 2 copies.`)).catch(e=>{console.error('Dispatch USB receipt print',e);toast(`Dispatch locked, but USB receipt print failed: ${e?.message||e}`)});
      return result;
    };
    try{confirmDispatchLoadingV81=window.confirmDispatchLoadingV81}catch(_){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installV1126,{once:true});else installV1126();
})();
