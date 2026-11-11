/* SoftCreation 2026-11-11: saved quotation PDF freeze containment.
 * Quotations are printed by the browser's native PDF engine, instead of
 * the synchronous custom pagination + html2canvas raster pipeline.
 * No stored document, quotation calculation or printing job is mutated.
 */
(function(){
  'use strict';
  const priorDownload = window.downloadDocPDF;
  let opening = false;
  const escapeHtml = v => String(v == null ? '' : v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function openNativeQuotePdf(doc){
    if(opening){if(typeof toast==='function') toast('A quotation print window is already opening.');return;}
    opening=true;
    // IMPORTANT: Open synchronously within the user's click so Brave popup
    // protection does not block the new window.
    const win=window.open('', '_blank');
    if(!win){
      opening=false;
      if(typeof toast==='function')toast('Please allow popups for this SPGS site to save the quotation PDF.');
      return;
    }
    try{
      win.document.open();
      win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Preparing quotation…</title></head><body><p style="font:16px system-ui;padding:20px">Preparing printable quotation…</p></body></html>');
      win.document.close();
    }catch(_){/* If the popup is closed, subsequent write will report the problem. */}

    // Defer DOM building so the calling SPGS tab can repaint and users can
    // close the popup if an unusual document is still expensive to format.
    setTimeout(()=>{
      try{
        if(win.closed)throw new Error('Print window was closed');
        const content=typeof buildDocHTML==='function'?buildDocHTML(doc,true):'';
        if(!content)throw new Error('Unable to render saved quotation');
        const title=escapeHtml(doc.serial||'Quotation');
        const stylesheet=new URL('css/index.css', document.baseURI).href;
        const extraSheet=new URL('css/modern-glass.css', document.baseURI).href;
        const html=`<!doctype html><html><head><meta charset="utf-8"><title>${title} — Save as PDF</title>
<link rel="stylesheet" href="${stylesheet}"><link rel="stylesheet" href="${extraSheet}">
<style>
  @page{size:A4;margin:16mm 14mm 16mm}
  html,body{background:white!important;color:#19252d!important;margin:0!important;padding:0!important;font-family:Arial,sans-serif}
  .safe-quote-toolbar{position:sticky;top:0;background:#e9f6f6;padding:12px 16px;z-index:20;font:14px system-ui;border-bottom:1px solid #b0d6d6}
  .safe-quote-toolbar button{margin:0 10px;padding:8px 15px;border:0;border-radius:7px;background:#078f92;color:#fff;cursor:pointer;font-weight:700}
  .safe-quote-body{width:100%;max-width:182mm;margin:15px auto;background:#fff}
  .safe-quote-body .docbody{position:static!important;inset:auto!important;overflow:visible!important;max-height:none!important;height:auto!important}
  .safe-quote-body .docfoot{position:static!important;inset:auto!important;overflow:visible!important;margin-top:16px!important;display:flex}
  .safe-quote-body .dochead,.safe-quote-body .customerbox,.safe-quote-body .commercial-summary,.safe-quote-body .device-quote-card,.safe-quote-body .device-card-body,.safe-quote-body .termrow{break-inside:avoid;page-break-inside:avoid}
  .safe-quote-body table{width:100%;border-collapse:collapse}
  .safe-quote-body tr{break-inside:avoid;page-break-inside:avoid}
  .safe-quote-body thead{display:table-header-group}
  .safe-quote-body img{max-width:100%;height:auto;object-fit:contain}
  @media print{
   html,body{width:auto!important;overflow:visible!important}
   .safe-quote-toolbar{display:none!important}
   .safe-quote-body{margin:0!important;max-width:none!important;width:100%!important}
   .safe-quote-body *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
   .safe-quote-body .docbody{position:static!important;top:auto!important;bottom:auto!important;left:auto!important;right:auto!important}
   .safe-quote-body .docfoot{position:static!important;top:auto!important;bottom:auto!important;left:auto!important;right:auto!important}
   @page{size:A4;margin:16mm 14mm 16mm}
  }
</style></head><body>
<div class="safe-quote-toolbar"><b>${title}</b><button type="button" onclick="window.print()">Print / Save as PDF</button><span>In Destination, select <b>Save as PDF</b>. Pages are laid out by your browser.</span></div>
<main class="safe-quote-body">${content}</main></body></html>`;
        win.document.open();
        win.document.write(html);
        win.document.close();
        if(typeof toast==='function')toast('Quotation opened. In the print window, choose Save as PDF.');
        // Wait for print styles and images, but never block indefinitely.
        const startPrint=()=>{
          if(win.closed)return;
          const images=Array.from(win.document.images);
          const done=()=>new Promise(resolve=>{
            const outstanding=images.filter(img=>!img.complete);
            if(!outstanding.length){resolve();return;}
            let pending=outstanding.length;
            const settle=()=>{if(!--pending)resolve();};
            outstanding.forEach(img=>{img.addEventListener('load',settle,{once:true});img.addEventListener('error',settle,{once:true});});
            setTimeout(resolve,2200);
          });
          Promise.resolve().then(done).then(()=>setTimeout(()=>{
            try{if(!win.closed){win.focus();win.print();}}catch(err){console.warn('Automatic print dialog unavailable; use Print / Save as PDF button',err);}
          },180));
        };
        if(win.document.readyState==='complete')startPrint();
        else win.addEventListener('load',startPrint,{once:true});
      }catch(err){
        console.error('Safe quotation print failed',err);
        if(typeof toast==='function')toast('Could not open quotation for printing.');
        try{if(!win.closed)win.document.body.textContent='Quotation print failed. Please return to SPGS and retry.';}catch(_){ }
      }finally{opening=false;}
    },30);
  }

  // Keep the legacy generator unchanged for pro forma invoices and other
  // document types. All quotations bypass heavy page measurement/canvas paths.
  const safeDownload=function(doc){
    if(doc && doc.type==='Q')return openNativeQuotePdf(doc);
    return priorDownload.apply(this,arguments);
  };
  window.downloadDocPDF=safeDownload;
  try{downloadDocPDF=safeDownload;}catch(_){ }
})();
