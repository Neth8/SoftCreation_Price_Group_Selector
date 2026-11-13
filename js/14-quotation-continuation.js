
/* =========================================================
   v1.0.20 — CLEAN CONTINUATION PAGE QUOTATION RENDERING
   ---------------------------------------------------------
   Purpose:
   - Preserve the original quotation font sizes and spacing.
   - When content exceeds one A4 page, create real additional
     A4 pages instead of shrinking the first page.
   - Keep the quotation title/customer block on page 1 only.
   - Continuation pages keep the same letterhead/footer but do
     not repeat quotation/customer header details.
   - Repeat table headings when item rows continue.
   - Keep Preview and generated PDF page breaks identical.
   - Existing PI rendering/business logic remains unchanged.
   ========================================================= */
(function(){
  const SC_QUOTE_PAGE_WIDTH=794;
  const SC_QUOTE_PAGE_HEIGHT=1123;

  function scQuoteIsPagedDocument(doc){
    return !!doc && doc.type==='Q';
  }

  function scResetPaperTargetV1019(target){
    if(!target)return;
    target.className='paper';
    target.removeAttribute('style');
  }

  function scQuotationSourceV1019(doc){
    const tpl=document.createElement('template');
    tpl.innerHTML=String(buildDocHTML(doc,true)||'').trim();
    const body=tpl.content.querySelector('.docbody');
    const footer=tpl.content.querySelector('.docfoot');
    if(!body)throw new Error('Quotation document body was not generated.');
    return {body,footer};
  }

  function scDirectChildByClassV1019(parent,className){
    return [...(parent?.children||[])].find(el=>el.classList?.contains(className))||null;
  }

  function scQuoteMeasureHostV1019(){
    const host=document.createElement('div');
    host.className='sc-quote-measure-host';
    document.body.appendChild(host);
    return host;
  }

  function scQuoteOverflowV1019(body){
    return body.scrollHeight>body.clientHeight+1;
  }

  function scQuoteHasPayloadV1019(body){
    return body.children.length>Number(body.dataset.scBaseChildren||0);
  }

  function scQuotePageV1019(host,sourceBody,footerTemplate,pageIndex){
    const paper=document.createElement('div');
    paper.className='paper sc-quote-page';
    paper.dataset.scQuotePage=String(pageIndex+1);

    const body=document.createElement('div');
    body.className='docbody sc-quote-page-body';

    const sourceHead=scDirectChildByClassV1019(sourceBody,'dochead');
    const sourceCustomer=scDirectChildByClassV1019(sourceBody,'customerbox');

    /*
      Page 1 keeps the normal quotation header/customer details.
      Page 2+ intentionally omit this whole block so continuation
      pages begin directly with the remaining quotation content.
      The A4 letterhead background and document footer still repeat.
    */
    if(pageIndex===0){
      if(sourceHead)body.appendChild(sourceHead.cloneNode(true));
      if(sourceCustomer)body.appendChild(sourceCustomer.cloneNode(true));
    }

    body.dataset.scBaseChildren=String(body.children.length);
    paper.appendChild(body);

    if(footerTemplate){
      const footer=footerTemplate.cloneNode(true);
      const spans=[...footer.querySelectorAll('span')];
      const right=spans[spans.length-1];
      if(right)right.dataset.scFooterBase=right.textContent||'';
      paper.appendChild(footer);
    }

    host.appendChild(paper);
    return {paper,body};
  }

  function scQuoteTableSkeletonV1019(sourceTable){
    const table=sourceTable.cloneNode(true);
    let tbody=table.querySelector('tbody');
    if(!tbody){
      tbody=document.createElement('tbody');
      table.appendChild(tbody);
    }
    tbody.innerHTML='';
    return {table,tbody};
  }

  function scQuoteTermsShellV1019(sourceTerms){
    const shell=sourceTerms.cloneNode(true);
    shell.querySelectorAll('.termrow').forEach(row=>row.remove());
    return shell;
  }

  function scBuildQuotationPagesV1019(doc){
    const source=scQuotationSourceV1019(doc);
    const host=scQuoteMeasureHostV1019();
    const pages=[];
    let ctx=null;

    const newPage=()=>{
      ctx=scQuotePageV1019(host,source.body,source.footer,pages.length);
      pages.push(ctx);
      return ctx;
    };

    const appendAtomic=(node)=>{
      const hadPayload=scQuoteHasPayloadV1019(ctx.body);
      let clone=node.cloneNode(true);
      ctx.body.appendChild(clone);
      if(scQuoteOverflowV1019(ctx.body) && hadPayload){
        clone.remove();
        newPage();
        clone=node.cloneNode(true);
        ctx.body.appendChild(clone);
      }
    };

    const appendTable=(sectionSource,tableSource)=>{
      const sourceRows=[...tableSource.querySelectorAll('tbody > tr')];

      const startTable=(moveIfNeeded=true)=>{
        const hadPayload=scQuoteHasPayloadV1019(ctx.body);
        const section=sectionSource.cloneNode(true);
        const parts=scQuoteTableSkeletonV1019(tableSource);
        ctx.body.appendChild(section);
        ctx.body.appendChild(parts.table);

        if(moveIfNeeded && scQuoteOverflowV1019(ctx.body) && hadPayload){
          section.remove();
          parts.table.remove();
          newPage();
          return startTable(false);
        }
        return parts;
      };

      let parts=startTable(true);

      sourceRows.forEach(rowSource=>{
        let row=rowSource.cloneNode(true);
        parts.tbody.appendChild(row);

        if(scQuoteOverflowV1019(ctx.body)){
          row.remove();

          if(parts.tbody.children.length===0){
            // A single unusually tall row must remain intact; never scale text.
            parts.tbody.appendChild(row);
            return;
          }

          newPage();
          parts=startTable(false);
          row=rowSource.cloneNode(true);
          parts.tbody.appendChild(row);
        }
      });
    };

    const appendDeviceSection=(sectionSource,cardSources)=>{
      let section=null;
      let cardsOnCurrentPage=0;

      const startSection=(cardSource,allowMove)=>{
        const hadPayload=scQuoteHasPayloadV1019(ctx.body);
        section=sectionSource.cloneNode(true);
        const card=cardSource.cloneNode(true);
        ctx.body.appendChild(section);
        ctx.body.appendChild(card);

        if(allowMove && scQuoteOverflowV1019(ctx.body) && hadPayload){
          section.remove();
          card.remove();
          newPage();
          return startSection(cardSource,false);
        }
        cardsOnCurrentPage=1;
      };

      if(!cardSources.length){
        appendAtomic(sectionSource);
        return;
      }

      startSection(cardSources[0],true);

      cardSources.slice(1).forEach(cardSource=>{
        let card=cardSource.cloneNode(true);
        ctx.body.appendChild(card);
        if(scQuoteOverflowV1019(ctx.body)){
          card.remove();
          newPage();
          section=sectionSource.cloneNode(true);
          ctx.body.appendChild(section);
          card=cardSource.cloneNode(true);
          ctx.body.appendChild(card);
          cardsOnCurrentPage=1;
        }else{
          cardsOnCurrentPage++;
        }
      });
    };

    const appendTerms=(termsSource,prefaceSource=null)=>{
      const rows=[...termsSource.querySelectorAll('.termrow')];

      const startTerms=(includePreface,moveIfNeeded=true)=>{
        const hadPayload=scQuoteHasPayloadV1019(ctx.body);
        const added=[];

        if(includePreface && prefaceSource){
          const preface=prefaceSource.cloneNode(true);
          ctx.body.appendChild(preface);
          added.push(preface);
        }

        const shell=scQuoteTermsShellV1019(termsSource);
        ctx.body.appendChild(shell);
        added.push(shell);

        if(moveIfNeeded && scQuoteOverflowV1019(ctx.body) && hadPayload){
          added.forEach(el=>el.remove());
          newPage();
          return startTerms(includePreface,false);
        }
        return shell;
      };

      let shell=startTerms(!!prefaceSource,true);

      rows.forEach(rowSource=>{
        let row=rowSource.cloneNode(true);
        shell.appendChild(row);

        if(scQuoteOverflowV1019(ctx.body)){
          row.remove();

          if(shell.querySelectorAll('.termrow').length===0){
            shell.appendChild(row);
            return;
          }

          newPage();
          shell=startTerms(false,false);
          row=rowSource.cloneNode(true);
          shell.appendChild(row);
        }
      });
    };

    newPage();

    const headerNodes=new Set([
      scDirectChildByClassV1019(source.body,'dochead'),
      scDirectChildByClassV1019(source.body,'customerbox')
    ].filter(Boolean));

    const content=[...source.body.children].filter(node=>!headerNodes.has(node));

    for(let i=0;i<content.length;i++){
      const node=content[i];
      const next=content[i+1]||null;

      if(node.classList?.contains('docsection') && next?.tagName==='TABLE'){
        appendTable(node,next);
        i++;
        continue;
      }

      if(node.classList?.contains('docsection') && next?.classList?.contains('device-quote-card')){
        const cards=[];
        let j=i+1;
        while(j<content.length && content[j].classList?.contains('device-quote-card')){
          cards.push(content[j]);
          j++;
        }
        appendDeviceSection(node,cards);
        i=j-1;
        continue;
      }

      if(node.classList?.contains('delivery-doc-note') && next?.classList?.contains('terms')){
        appendTerms(next,node);
        i++;
        continue;
      }

      if(node.classList?.contains('terms')){
        appendTerms(node,null);
        continue;
      }

      appendAtomic(node);
    }

    const total=pages.length;
    pages.forEach((pageCtx,index)=>{
      const footer=pageCtx.paper.querySelector('.docfoot');
      if(!footer)return;
      const spans=[...footer.querySelectorAll('span')];
      const right=spans[spans.length-1];
      if(right){
        const base=right.dataset.scFooterBase||right.textContent||'';
        right.textContent=`${base} • Page ${index+1} of ${total}`;
      }
    });

    const detached=pages.map(x=>x.paper);
    detached.forEach(page=>page.remove());
    host.remove();
    return detached;
  }

  // Reuse exactly the same A4 pages for the lightweight PDF exporter.
  window.scBuildQuotationPagesV1019 = scBuildQuotationPagesV1019;

  function scRenderQuotationV1019(target,doc){
    if(!target)return;
    const pages=scBuildQuotationPagesV1019(doc);
    target.innerHTML='';
    target.className='paper-stack sc-quotation-stack';
    const fragment=document.createDocumentFragment();
    pages.forEach(page=>fragment.appendChild(page));
    target.appendChild(fragment);
  }

  async function scWaitForQuoteImagesV1019(root){
    const images=[...root.querySelectorAll('img')];
    await Promise.all(images.map(img=>{
      if(img.complete)return Promise.resolve();
      return new Promise(resolve=>{
        const done=()=>resolve();
        img.addEventListener('load',done,{once:true});
        img.addEventListener('error',done,{once:true});
        setTimeout(done,4000);
      });
    }));
  }

  /* Preview: preserve original font sizes and create true continuation pages. */
  const scBaseRenderCurrentV1019=renderCurrent;
  renderCurrent=function(){
    const target=$('paper');
    if(state.current?.category==='device' && window.spgsDevicePreviewPausedV20261109){
      if(target && !target.querySelector('#spgsDevicePreviewRefreshV20261109')){
        target.className='paper sc-device-preview-paused-nov11';
        target.innerHTML='<section class="sc-device-preview-notice-nov11" role="status"><b>Device items updated.</b><p>The quotation preview is paused while adding devices to keep the editor responsive.</p><button id="spgsDevicePreviewRefreshV20261109" class="btn primary" type="button" onclick="window.spgsDevicePreviewPausedV20261109=false;renderCurrent()">Refresh Quotation Preview</button></section>';
      }
      return;
    }
    scResetPaperTargetV1019(target);
    const result=scBaseRenderCurrentV1019.apply(this,arguments);
    try{
      const doc=state.current;
      // Device quotations already render an interactive full preview above.
      // Measuring and rebuilding pagination on every added device blocks the UI.
      // The PDF export still builds the correctly paginated pages on demand.
      if(scQuoteIsPagedDocument(doc) && doc.category!=='device')scRenderQuotationV1019(target,doc);
    }catch(err){
      console.error('Multi-page quotation preview failed',err);
      scResetPaperTargetV1019(target);
      try{target.innerHTML=buildDocHTML(state.current||{},false)}catch(_){ }
    }
    return result;
  };
  window.renderCurrent=renderCurrent;

  /* Saved-document viewer: use the same pages as the PDF. */
  const scBaseViewDocumentV1019=viewDocument;
  viewDocument=function(id){
    const target=$('viewerPaper');
    scResetPaperTargetV1019(target);
    const result=scBaseViewDocumentV1019.apply(this,arguments);
    try{
      const doc=state.docs.find(x=>x.id===id);
      if(scQuoteIsPagedDocument(doc))scRenderQuotationV1019(target,doc);
    }catch(err){
      console.error('Multi-page quotation viewer failed',err);
    }
    return result;
  };
  window.viewDocument=viewDocument;

  /* Saved quotation PDF: memory-bounded A4 capture.
     Capture one page at a time at an adaptive resolution.  Avoid keeping
     all the A4 canvases or their encoded copies in browser memory. */
  const scBaseDownloadDocPDFV1019=downloadDocPDF;
  let scQuoteDownloadBusyNov11=false;
  const scQuoteYieldNov11=()=>new Promise(resolve=>setTimeout(resolve,0));
  downloadDocPDF=async function(doc){
    if(!scQuoteIsPagedDocument(doc))return scBaseDownloadDocPDFV1019.apply(this,arguments);
    if(scQuoteDownloadBusyNov11){toast('Quotation PDF is already generating.');return;}
    scQuoteDownloadBusyNov11=true;
    let capture=null;
    let pages=[];
    try{
      // Yield BEFORE expensive pagination so the clicked button can repaint.
      toast('Preparing saved quotation PDF...');
      await scQuoteYieldNov11();
      const okCanvas=await loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        ()=>window.html2canvas
      );
      const okPdf=await loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        ()=>window.jspdf
      );
      if(!okCanvas||!okPdf)throw new Error('PDF libraries unavailable');

      pages=scBuildQuotationPagesV1019(doc);
      if(!pages.length)throw new Error('No quotation pages were created');
      // A very long, image-heavy document can overwhelm browser raster memory.
      // Prefer the browser's PDF engine in that situation.
      if(pages.length>18)throw new Error('Quotation has too many pages for safe image capture');

      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation:'p',unit:'mm',format:'a4',compress:true});
      try{pdf.setDisplayMode(1.0,'continuous','UseNone')}catch(_){ }
      capture=document.createElement('div');
      capture.className='sc-quote-capture-host';
      document.body.appendChild(capture);
      // Lower peak canvas memory for device quotations and mobile/Ubuntu browsers.
      // Pages retain the exact original A4 proportions and text layout.
      const lowerMemory=doc.category==='device' || (typeof navigator.deviceMemory==='number' && navigator.deviceMemory<=4);
      const resolution=lowerMemory?1:1.25;

      for(let i=0;i<pages.length;i++){
        capture.appendChild(pages[i]);
        await scWaitForQuoteImagesV1019(pages[i]);
        await scQuoteYieldNov11();
        toast(`Preparing quotation PDF: page ${i+1} of ${pages.length}`);
        let canvas=null;
        try{
          canvas=await html2canvas(pages[i],{
            scale:resolution,
            backgroundColor:'#ffffff',
            useCORS:true,
            allowTaint:false,
            logging:false,
            width:SC_QUOTE_PAGE_WIDTH,
            height:SC_QUOTE_PAGE_HEIGHT,
            windowWidth:SC_QUOTE_PAGE_WIDTH,
            windowHeight:SC_QUOTE_PAGE_HEIGHT,
            imageTimeout:2500,
            removeContainer:true
          });
          // JPEG needs much less memory than lossless full-page canvases.
          const img=canvas.toDataURL('image/jpeg',0.74);
          if(i>0)pdf.addPage('a4','p');
          pdf.addImage(img,'JPEG',0,0,210,297,`quoteSafePage${i+1}`,'FAST');
        }finally{
          if(canvas){canvas.width=0;canvas.height=0;canvas=null;}
          pages[i].remove();
        }
        await scQuoteYieldNov11();
      }
      await scQuoteYieldNov11();
      const custName = String(doc.customer?.name || doc.customer_name || doc.customerName || (typeof doc.customer==='string'?doc.customer:'') || '').trim();
      const docName = custName ? `${doc.serial||'quotation'} - ${custName}` : (doc.serial||'quotation');
      pdf.save(docName.replace(/[\\/:*?"<>|]/g,'-')+'.pdf');
      toast(`Quotation PDF generated • ${pages.length} page${pages.length===1?'':'s'}`);
    }catch(err){
      console.error('Saved quotation PDF capture failed',err);
      toast('PDF capture was interrupted. Opening browser Print / Save as PDF instead.');
      // Call the same built-in print view, preserving the saved document.
      try{await scQuoteYieldNov11();printSavedDocument(doc);}catch(printErr){
        console.error('Quotation print fallback failed',printErr);
        toast('PDF export failed. Please retry using View → Print.');
      }
    }finally{
      if(capture)capture.remove();
      pages.forEach(page=>{if(page.parentNode)page.remove();});
      scQuoteDownloadBusyNov11=false;
    }
  };
  window.downloadDocPDF=downloadDocPDF;

  /* Browser-print fallback with explicit A4 page breaks. */
  const scBasePrintSavedDocumentV1019=printSavedDocument;
  printSavedDocument=function(doc){
    if(!scQuoteIsPagedDocument(doc))return scBasePrintSavedDocumentV1019.apply(this,arguments);

    const printHost=$('printHost');
    if(!printHost)return;
    printHost.innerHTML='';

    const stack=document.createElement('div');
    stack.className='sc-print-stack';
    const pages=scBuildQuotationPagesV1019(doc);
    pages.forEach(page=>stack.appendChild(page));
    printHost.appendChild(stack);
    printHost.style.display='block';

    scWaitForQuoteImagesV1019(stack).finally(()=>{
      setTimeout(()=>{
        window.print();
        printHost.style.display='none';
        printHost.innerHTML='';
      },250);
    });
  };
  window.printSavedDocument=printSavedDocument;

})();
