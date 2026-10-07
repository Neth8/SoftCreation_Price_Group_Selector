
/* V9.2 - Lock SO item quantities for Deliver All to Customer */
(function(){
 const ALL='Deliver all to dealer';
 const note=document.querySelector('#soModal91 .so-price-lock');if(note)note.id='soQtyLock91';
 function applySoQtyLock92(){const locked=$('soMethod91')?.value===ALL;document.querySelectorAll('#soLines91 .so-line').forEach(r=>{const q=r.querySelector('.soQty91');if(!q)return;q.readOnly=locked;q.classList.toggle('readonly',locked);q.style.background=locked?'#eef3f4':'#fff';q.style.cursor=locked?'not-allowed':''});if($('soQtyLock91'))$('soQtyLock91').innerHTML=locked?'<b>Full delivery quantity locked:</b> Quantities are taken from the selected approved PI/SO snapshot and cannot be changed for “Deliver all to customer”.':'Select the required repeat-order items and change quantity only. Description and approved unit price remain locked.'}
 const toggle92=window.toggleSoDestination91;window.toggleSoDestination91=function(){toggle92();applySoQtyLock92()};
 const loadSource92=window.loadSoSource91;window.loadSoSource91=function(lines=null){loadSource92(lines);applySoQtyLock92()};
 const saveSO92=window.saveSalesOrder91;window.saveSalesOrder91=function(sync=false){if($('soMethod91')?.value===ALL){document.querySelectorAll('#soLines91 .so-line').forEach(r=>{const q=r.querySelector('.soQty91'),raw=r.querySelector('.soData91')?.value;if(!q||!raw)return;try{q.value=Number(JSON.parse(decodeURIComponent(raw)).qty||0)}catch(e){}});calcSo91()}return saveSO92(sync)};
 applySoQtyLock92();
})();
