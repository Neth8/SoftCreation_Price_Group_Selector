/* Isolated device picker safety: preserve existing pricing and add logic. */
(function(){
  'use strict';
  if(typeof addDeviceToQuote!=='function')return;
  const original=addDeviceToQuote;
  let busy=false;
  addDeviceToQuote=async function(id){
    if(busy)return;
    busy=true;
    const btn=[...document.querySelectorAll('#devicePickerModal button')].find(b=>String(b.getAttribute('onclick')||'').includes(String(id)))||null;
    if(btn)btn.disabled=true;
    try{
      // Delay the expensive printable preview until explicitly requested.
      window.spgsDevicePreviewPausedV20261109=true;
      await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
      return await original.call(this,id);
    }catch(error){console.error('Device add failed',error);if(typeof toast==='function')toast('Could not add device: '+(error?.message||error));}
    finally{busy=false;if(btn?.isConnected)btn.disabled=false;}
  };
})();
