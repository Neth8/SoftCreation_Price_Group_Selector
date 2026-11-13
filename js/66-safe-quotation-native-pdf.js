/* SoftCreation quotation PDF correction — 2026-11-12.
 * PDF button returns a REAL multi-page PDF, not an unstyled HTML print tab.
 * Uses the same A4 pages as the saved quotation viewer. Captures one page at
 * a time at controlled resolution and releases image data immediately.
 * On failures the user gets a properly paginated A4 print fallback.
 */
(function(){
  'use strict';
  const priorDownload = window.downloadDocPDF;
  let busy = false;
  const pause = () => new Promise(resolve => setTimeout(resolve, 20));
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const docCustName = doc => String(doc?.customer?.name || doc?.customer_name || doc?.customerName || (typeof doc?.customer==='string'?doc.customer:'') || '').trim();
  const fileName = doc => {
    const c = docCustName(doc);
    const base = c ? `${doc.serial||'quotation'} - ${c}` : (doc.serial||'quotation');
    return base.replace(/[\\/:*?"<>|]/g,'-')+'.pdf';
  };
  const notify = message => {if(typeof toast==='function')toast(message);};

  function loadScriptSafe(url,ready,timeoutMs=8000){
    if(ready())return Promise.resolve(true);
    return Promise.race([
      Promise.resolve(loadScript(url,ready)),
      new Promise(resolve=>setTimeout(()=>resolve(!!ready()),timeoutMs))
    ]);
  }
  async function dependencies(){
    const [canvasOK,pdfOK]=await Promise.all([
      loadScriptSafe('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',()=>window.html2canvas),
      loadScriptSafe('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',()=>window.jspdf?.jsPDF)
    ]);
    if(!canvasOK||!pdfOK)throw new Error('PDF library could not be loaded');
  }

  // Never print the app's own CSS directly inside a new window: its body and
  // absolute-position page rules conflict with a variable-length HTML page.
  // Instead print the ALREADY PAGINATED .paper pages with A4/zero margins.
  async function printFallback(doc,popup,pages){
    if(!popup||popup.closed){notify('Allow popups for SPGS, then retry the PDF button.');return;}
    pages=(Array.isArray(pages)&&pages.length)?pages:(typeof window.scBuildQuotationPagesV1019==='function'?window.scBuildQuotationPagesV1019(doc):[]);
    if(!pages.length){notify('Quotation layout could not be prepared.');return;}
    const base=new URL('./',document.baseURI).href;
    const css=new URL('css/index.css',document.baseURI).href;
    const logo=new URL('assets/images/paper-bg.png',document.baseURI).href;
    const cName = docCustName(doc);
    const title=escapeHtml(cName ? `${doc.serial||'Quotation'} - ${cName}` : (doc.serial||'Quotation'));
    const html=`<!doctype html><html><head><meta charset="utf-8"><base href="${escapeHtml(base)}"><title>${title}</title>
<link rel="stylesheet" href="${css}"><style>
  html,body{margin:0!important;padding:0!important;background:#e8eff1!important;overflow:auto!important}
  .sc-pdf-tools{position:sticky;top:0;z-index:50;padding:12px;background:#dff3f3;font:14px Arial,sans-serif;text-align:center}
  .sc-pdf-tools button{padding:9px 15px;background:#078f92;color:white;border:0;border-radius:5px;cursor:pointer}
  .sc-print-stack{display:block;width:794px;margin:16px auto}
  .sc-print-stack>.paper{box-sizing:border-box;width:794px!important;height:1123px!important;min-height:1123px!important;max-height:1123px!important;position:relative!important;display:block!important;margin:0 auto 15px!important;overflow:hidden!important;transform:none!important;background:#fff url('${logo}') center/100% 100% no-repeat!important}
  .sc-print-stack>.paper .docbody{position:absolute!important;left:58px!important;right:58px!important;top:238px!important;bottom:122px!important;overflow:hidden!important}
  .sc-print-stack>.paper .docfoot{position:absolute!important;left:58px!important;right:58px!important;bottom:101px!important}
  @page{size:A4;margin:0}
  @media print{
    html,body{width:210mm!important;margin:0!important;padding:0!important;background:white!important}
    .sc-pdf-tools{display:none!important}
    .sc-print-stack{display:block!important;margin:0!important;padding:0!important;width:210mm!important}
    .sc-print-stack>.paper{box-sizing:border-box!important;display:block!important;width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;margin:0!important;box-shadow:none!important;break-after:page!important;page-break-after:always!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    .sc-print-stack>.paper:last-child{break-after:auto!important;page-break-after:auto!important}
    .sc-print-stack>.paper .docbody{left:15.4mm!important;right:15.4mm!important;top:63mm!important;bottom:32mm!important}
    .sc-print-stack>.paper .docfoot{left:15.4mm!important;right:15.4mm!important;bottom:26mm!important}
  }
</style></head><body><div class="sc-pdf-tools">${title} &nbsp;<button onclick="window.print()">Save as PDF / Print</button> &nbsp; Choose “Save as PDF” in print destination and enable background graphics.</div><main class="sc-print-stack">${pages.map(p=>p.outerHTML).join('')}</main></body></html>`;
    popup.document.open();popup.document.write(html);popup.document.close();
    notify('Quotation opened in its original A4 layout. Use Save as PDF.');
  }

  async function makeQuotationPdf(doc){
    if(busy){notify('A quotation PDF is already generating.');return;}
    if(typeof requirePerm==='function'&&!requirePerm('quote_pdf','download document PDFs'))return;
    busy=true;
    // Open at click time, before any await, to avoid browser popup blocking.
    const popup=window.open('','_blank');
    if(popup){
      popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Quotation PDF</title></head><body style="font:16px system-ui;padding:28px">Preparing quotation PDF…</body></html>');
      popup.document.close();
    }
    let host=null,pages=[],pdfURL=null;
    try{
      if(typeof window.scBuildQuotationPagesV1019!=='function')throw new Error('Quotation A4 paginator unavailable');
      notify('Generating original-layout A4 quotation PDF…');
      await pause();
      await dependencies();
      await pause();
      pages=window.scBuildQuotationPagesV1019(doc);
      if(!pages.length)throw new Error('No printable quotation pages');
      if(pages.length>60)throw new Error('Quotation exceeds safe PDF export page limit');
      host=document.createElement('div');
      host.className='sc-quote-capture-host';
      host.style.cssText='position:fixed!important;left:-11000px!important;top:0!important;width:794px!important;pointer-events:none!important;z-index:-1!important;';
      document.body.appendChild(host);
      const pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
      let count=0;
      for(let i=0;i<pages.length;i++){
        if(i)await pause();
        const page=pages[i];
        host.appendChild(page);
        const imgs=Array.from(page.querySelectorAll('img'));
        await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{
          const done=()=>resolve();img.addEventListener('load',done,{once:true});img.addEventListener('error',done,{once:true});setTimeout(done,3500);
        })));
        if(document.fonts?.ready)await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1500))]);
        let canvas=null;
        try{
          canvas=await window.html2canvas(page,{
            scale:1.2,backgroundColor:'#ffffff',useCORS:true,allowTaint:false,
            logging:false,width:794,height:1123,windowWidth:794,windowHeight:1123,
            imageTimeout:3500,removeContainer:true,scrollX:0,scrollY:0
          });
          const jpg=canvas.toDataURL('image/jpeg',0.86);
          if(i)pdf.addPage('a4','portrait');
          pdf.addImage(jpg,'JPEG',0,0,210,297,undefined,'FAST');
          count++;
        }finally{
          if(canvas){canvas.width=0;canvas.height=0;canvas=null;}
          page.remove();
        }
      }
      if(count!==pages.length)throw new Error('PDF export page count mismatch');
      // Make the actual PDF available in the browser's built-in PDF preview.
      const blob=pdf.output('blob');
      if(!blob||blob.size<1000)throw new Error('PDF export was empty');
      pdfURL=URL.createObjectURL(blob);
      if(popup&&!popup.closed){
        const title=escapeHtml(doc.serial||'Quotation');
        // Embedded browser PDF viewer with a separate unambiguous download link.
        popup.document.open();
        popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title} - PDF</title><style>html,body{margin:0;height:100%;font:14px Arial,sans-serif;background:#273238;color:#fff}header{height:48px;display:flex;align-items:center;gap:18px;padding:0 17px;box-sizing:border-box}a{color:#fff;background:#078f92;border-radius:6px;padding:8px 12px;text-decoration:none;font-weight:bold}iframe{display:block;width:100%;height:calc(100% - 48px);border:0}</style></head><body><header><b>${title} · ${count} page${count===1?'':'s'}</b><a id="dl" href="${pdfURL}" download="${escapeHtml(fileName(doc))}">Download PDF</a><span>Actual A4 PDF preview</span></header><iframe title="Quotation PDF" src="${pdfURL}#toolbar=1"></iframe></body></html>`);
        popup.document.close();
        // Keep blob alive while the viewer is open; clean up when it closes.
        popup.addEventListener('pagehide',()=>URL.revokeObjectURL(pdfURL),{once:true});
        popup.focus();
      }else{
        const a=document.createElement('a');a.href=pdfURL;a.download=fileName(doc);document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(pdfURL),60000);
      }
      notify(`Quotation PDF ready • ${count} A4 pages`);
    }catch(err){
      console.error('Quotation PDF generation failed',err);
      notify('Direct PDF failed; opening original A4 print layout instead.');
      try{await printFallback(doc,popup,pages);}catch(fallbackError){
        console.error('A4 fallback failed',fallbackError);
        if(popup&&!popup.closed)popup.document.body.textContent='PDF could not be generated. Check browser console and retry.';
        notify('Quotation PDF generation failed.');
      }
    }finally{
      if(host)host.remove();
      pages.forEach(page=>{if(page.parentNode)page.remove();});
      busy=false;
    }
  }
  const download=function(doc){
    if(doc&&doc.id&&typeof state!=='undefined'&&Array.isArray(state?.docs)&&state.docs.some(x=>x.id===doc.id)&&typeof visibleToCurrent==='function'&&!visibleToCurrent(doc)){
      notify('This document belongs to another user.');
      return;
    }
    if(doc&&doc.type==='Q')return makeQuotationPdf(doc);
    return priorDownload.apply(this,arguments);
  };
  window.downloadDocPDF=download;
  try{downloadDocPDF=download;}catch(_){ }
})();
