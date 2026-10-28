
/* V8.5 - Branch Network Approved Price Portal & Quotation Request Desk */
(function(){
 const KEY85='sc_qpi_v85_branch_portal_clean';
 if(typeof KEY!=='undefined'&&KEY!==KEY85){try{const old=localStorage.getItem(KEY);if(old&&!localStorage.getItem(KEY85))localStorage.setItem(KEY85,old)}catch(e){}}
 const originalSaveState=saveState,originalLoadState=loadState;
 saveState=function(){state.quoteRequests=state.quoteRequests||[];localStorage.setItem(KEY85,JSON.stringify(state))};
 loadState=function(){try{const raw=localStorage.getItem(KEY85);if(raw){state={...state,...JSON.parse(raw)};return}}catch(e){}originalLoadState();state.quoteRequests=state.quoteRequests||[];saveState()};
 // Move the already-loaded clean state to the v8.5 key without altering records.
 state.quoteRequests=state.quoteRequests||[];saveState();
 if(!USER_FEATURES.some(x=>x[0]==='branch_portal'))USER_FEATURES.push(['branch_portal','Branch Approved Price Portal']);
 if(!USER_FEATURES.some(x=>x[0]==='manage_quote_requests'))USER_FEATURES.push(['manage_quote_requests','Manage Branch Quotation Requests']);
 VIEW_PERMS.branchportal='branch_portal';VIEW_PERMS.quoterequests='manage_quote_requests';
 const css=document.createElement('style');css.textContent=`
 .branch-hero{background:linear-gradient(135deg,#073b4c,#079c9f);color:#fff;border-radius:16px;padding:18px;margin-bottom:14px}.branch-hero h2{margin:0 0 5px}.branch-hero p{margin:0;opacity:.86}
 .portal-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}.portal-card{border:1px solid #cfe2e4;border-radius:14px;padding:13px;background:#fff}.portal-card h3{margin:0 0 10px;color:#087f83}.portal-prices{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.portal-price{border:2px solid var(--pc,#079c9f);border-radius:11px;padding:9px;background:#fff;text-align:left}.portal-price.selected{box-shadow:0 0 0 3px #b7eeee}.portal-price b{font-size:15px;display:block}.portal-item{border-bottom:1px solid #dce8ea;padding:9px 0}.portal-cart{max-height:330px;overflow:auto}.request-status{display:inline-block;padding:4px 8px;border-radius:999px;background:#eaf5f5;color:#087f83;font-weight:900;font-size:9px}.request-status.completed{background:#e1f5e9;color:#08713e}.request-status.rejected{background:#ffe5e5;color:#a91d1d}@media(max-width:850px){.portal-grid{grid-template-columns:1fr}.portal-prices{grid-template-columns:1fr 1fr}}
 /* Approved Prices - My Requests compact status */

.my-request-main{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}

.my-request-info{
  min-width:0;
  flex:1;
}

.my-request-heading{
  display:flex;
  align-items:center;
  gap:7px;
  flex-wrap:wrap;
}

.request-status-detail{
  display:inline-block;
  padding:5px 9px;
  border-radius:999px;
  font-size:9px;
  line-height:1.2;
  font-weight:900;
  white-space:nowrap;
}


/* Pending */

.request-status-detail.pending{
  background:#fff1cc;
  color:#8b5700;
  border:1px solid #f1d58c;
}


/* In Review */

.request-status-detail.review{
  background:#e4f2ff;
  color:#155ca5;
  border:1px solid #bcdcff;
}


/* Completed */

.request-status-detail.completed{
  background:#def6e7;
  color:#08733d;
  border:1px solid #b9e5c8;
}


/* Rejected */

.request-status-detail.rejected{
  background:#ffe1e1;
  color:#ad2525;
  border:1px solid #f2b9b9;
}


.my-request-view{
  flex:0 0 auto;
}


@media(max-width:700px){

  .my-request-main{
    align-items:flex-start;
  }

  .request-status-detail{
    white-space:normal;
  }

}
 `;document.head.appendChild(css);
 const nav=document.querySelector('.nav'),settingsBtn=document.querySelector('[data-view="settings"]');
 function navBtn(id,label){if(document.querySelector(`[data-view="${id}"]`))return;const b=document.createElement('button');b.className='navbtn';b.dataset.view=id;b.textContent=label;b.onclick=()=>showView(id);nav.insertBefore(b,settingsBtn)}
 navBtn('branchportal','Approved Prices');navBtn('quoterequests','Quote Requests');
 document.querySelector('#settings').insertAdjacentHTML('beforebegin',`
 <section id="branchportal" class="view"><div class="panel"><div class="panel-title">Branch Network — Approved Price Portal</div><div class="panel-body"><div class="branch-hero"><h2>Approved Selling Prices</h2><p>Calculate labels and view approved device, ribbon and paper prices without accessing cost or master data.</p></div><div class="portal-grid"><div><div class="portal-card"><h3>Label Price Calculator</h3><div class="price-inputs"><div class="field"><label>Material</label><select id="bpMaterial"><option>TT</option><option>DT TOP</option><option>PVC</option><option selected>DT ECO</option><option>HIGHSTICK</option></select></div><div class="field"><label>Width (mm)</label><input id="bpWidth" type="number" value="38" min="0.01"></div><div class="field"><label>Height (mm)</label><input id="bpHeight" type="number" value="25" min="0.01"></div><div class="field"><label>Ups</label><input id="bpUps" type="number" value="1" min="1"></div><div class="field"><label>Pieces / Roll</label><input id="bpPcs" type="number" value="1000" min="1"></div></div><div class="field" style="margin-top:10px;max-width:420px"><label>Select Price Group</label><select id="bpPriceGroup" onchange="bpSelectTier(this.value)"></select><div id="bpSelectedGroupHint" class="hint"></div></div><div id="bpLabelPrices" class="portal-prices" style="margin-top:10px"></div><div class="actions"><input id="bpLabelQty" type="number" value="1" min="1" style="width:110px"><button class="btn primary" onclick="bpAddLabel()">Add Selected Label</button></div></div><div class="portal-card" style="margin-top:12px"><h3>Approved Devices</h3><div id="bpDevices"></div></div><div class="portal-card" style="margin-top:12px"><h3>Approved Ribbon & Paper</h3><div id="bpProducts"></div></div></div><div><div class="portal-card"><h3>Quotation Request</h3><div class="grid">

<div class="field full" id="bpCustomerField">
  <label>Customer / Company</label>
  <input id="bpCustomer">
</div>

<div class="field" id="bpPhoneField">
  <label>Contact Number</label>
  <input id="bpPhone">
</div>

<div class="field" id="bpEmailField">
  <label>Email</label>
  <input id="bpEmail">
</div>

<div class="field full" id="bpAddressField">
  <label>Address / Delivery Location</label>
  <textarea id="bpAddress"></textarea>
</div>

<div class="field" id="bpPayModeField">
  <label>Payment Mode</label>
  <select id="bpPayMode">
    <option value="cash">Cash</option>
    <option value="credit">Credit</option>
  </select>
</div>

<div class="field" id="bpVatField">
  <label>VAT Requirement</label>
  <select id="bpVat">
    <option value="none">No VAT Breakdown</option>
    <option value="vat18">VAT Breakdown</option>
  </select>
</div>

<div class="field full" id="bpRequestNoteField">
  <label>Request Note</label>
  <textarea
    id="bpNote"
    placeholder="Validity, special instructions or other notes"
  ></textarea>
</div>

<div class="field full" id="bpDeliveryAddressField">
  <label>Delivery Address</label>
  <textarea
    id="bpDeliveryAddress"
    placeholder="Enter the delivery address for this quotation request"
  ></textarea>
</div>

<!-- CUSTOMER LOGIN ONLY: separate delivery override. Hidden for admin/internal users. -->
<div class="field full" id="bpCustomerSeparateDeliveryBlock" style="display:none">

  <div class="bp-delivery-toggle">

    <input
      id="bpSeparateDelivery"
      type="checkbox"
      hidden
    >

    <button
      id="bpSeparateDeliveryToggle"
      class="bp-toggle-btn"
      type="button"
      aria-pressed="false"
      onclick="window.toggleBpSeparateDeliveryButton()"
    >
      <span class="bp-toggle-off">OFF</span>
      <span class="bp-toggle-on">ON</span>
      <span class="bp-toggle-knob"></span>
    </button>

    <span class="bp-delivery-toggle-copy">
      <b>Deliver to a separate location</b>
      <small>
        Turn this on only when delivery is different from the registered customer address.
      </small>
    </span>

  </div>

  <div
    id="bpSeparateDeliveryFields"
    class="field full bp-separate-delivery"
    hidden
    style="display:none;margin-top:10px"
  >
    <div class="bp-delivery-grid">

      <div class="field full">
        <label>
          Customer Name
          <span class="required-dot">*</span>
        </label>
        <input
          id="bpDeliveryCustomerName"
          type="text"
          placeholder="Customer / Receiver name"
        >
      </div>

      <div class="field">
        <label>
          Address Line 1
          <span class="required-dot">*</span>
        </label>
        <input
          id="bpDeliveryLine1"
          type="text"
          placeholder="Building / No. / Street"
        >
      </div>

      <div class="field">
        <label>
          Address Line 2
          <span class="required-dot">*</span>
        </label>
        <input
          id="bpDeliveryLine2"
          type="text"
          placeholder="Area / City / Town"
        >
      </div>

      <div class="field">
        <label>
          Contact Number
          <span class="required-dot">*</span>
        </label>
        <input
          id="bpDeliveryContact1"
          type="tel"
          placeholder="07XXXXXXXX"
        >
      </div>

      <div class="field">
        <label>
          Second Contact Number
          <span class="hint">(Optional)</span>
        </label>
        <input
          id="bpDeliveryContact2"
          type="tel"
          placeholder="Optional second number"
        >
      </div>

    </div>
  </div>

</div>

</div>

<div id="bpCart" class="portal-cart"></div>

<div class="actions">
  <button class="btn green" onclick="submitBranchQuoteRequest()">Send Quotation Request</button>
  <button class="btn ghost" onclick="bpClearCart()">Clear</button>
</div>

</div><div class="portal-card" style="margin-top:12px"><h3>My Requests</h3><div id="bpMyRequests"></div></div></div></div></div></div></section>
 <section id="quoterequests" class="view"><div class="panel"><div class="panel-title">Branch Quotation Request Desk</div><div class="panel-body"><div class="notice">Open a request and convert it directly into a quotation draft. Requested item prices remain frozen.</div><div class="listbar"><select id="brStatusFilter" onchange="renderBranchRequests()"><option value="">All statuses</option><option>Pending</option><option>In Review</option><option>Completed</option><option>Rejected</option></select></div><div id="branchRequestList"></div></div></div></section>`);
 let bpCart=[],bpSelectedTier='';window.bpSelectTier=function(id){bpSelectedTier=id;bpCalculate()};
 function allowedCats(type){const u=userRecord()||currentUser;return (state.priceCategories||[]).filter(c=>c.active!==false&&(c.appliesTo||[]).includes(type)&&(currentUser?.role==='admin'||(u?.priceCategoryIds||[]).includes(c.id)))}
 window.bpCalculate=function(){const m=$('bpMaterial').value,w=Number($('bpWidth').value),h=Number($('bpHeight').value),ups=Number($('bpUps').value),pcs=Number($('bpPcs').value),p=state.settings.pricing||DEFAULT_PRICING;if(!(w>0&&h>0&&ups>0&&pcs>0))return $('bpLabelPrices').innerHTML='<div class="notice">Enter valid label details.</div>';const pw=w*ups+3+(ups-1),area=(pcs/ups)*(h+2.75)*pw/1000000,mat=Number(p.materialRates[m]||0)*area,pack=(p.strappingRoll/150*35/100)+(p.stretchFilm/30000*35),full=mat+p.core+pack+p.service*area,scale=mat+p.core+pack+p.scaleService*area,cats=allowedCats('label');if(!cats.some(c=>c.id===bpSelectedTier))bpSelectedTier=cats[0]?.id||'';const group=$('bpPriceGroup');if(group){const old=group.value;group.innerHTML=cats.length?cats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join(''):'<option value="">No approved group</option>';group.value=cats.some(c=>c.id===bpSelectedTier)?bpSelectedTier:(cats.some(c=>c.id===old)?old:'')}const chosen=cats.find(c=>c.id===bpSelectedTier);if($('bpSelectedGroupHint'))$('bpSelectedGroupHint').innerHTML=chosen?`Selected group: <b>${esc(chosen.name)}</b> — this price will be added to the request.`:'No approved price group is available.';$('bpLabelPrices').innerHTML=cats.length?cats.map(c=>{const price=(c.base==='scale'?scale:full)*categoryFactor(c);return `<button data-tier="${c.id}" class="portal-price ${c.id===bpSelectedTier?'selected':''}" style="--pc:${esc(c.color||'#079c9f')}" onclick="bpSelectTier('${c.id}')"><span class="small">${esc(c.name)}${c.id===bpSelectedTier?' • SELECTED':''}</span><b>LKR ${money(price)}</b><span class="small">Per roll • VAT inclusive</span></button>`}).join(''):'<div class="notice">No approved label price category is assigned to this user.</div>'};
 window.bpAddLabel=function(){bpCalculate();const c=allowedCats('label').find(x=>x.id===bpSelectedTier);if(!c)return toast('Select an approved price');const p=state.settings.pricing||DEFAULT_PRICING,m=$('bpMaterial').value,w=Number($('bpWidth').value),h=Number($('bpHeight').value),ups=Number($('bpUps').value),pcs=Number($('bpPcs').value),area=(pcs/ups)*(h+2.75)*(w*ups+3+(ups-1))/1000000,pack=(p.strappingRoll/150*35/100)+(p.stretchFilm/30000*35),full=p.materialRates[m]*area+p.core+pack+p.service*area,scale=p.materialRates[m]*area+p.core+pack+p.scaleService*area,price=(c.base==='scale'?scale:full)*categoryFactor(c);bpCart.push({kind:'label',itemId:'',desc:'ELP',size:`${w}mm x ${h}mm`,material:m,layout:`${ups}UP`,pcs,qty:Number($('bpLabelQty').value||1),unit:'Rolls',price,priceTier:c.name});renderBpCart();toast('Label added to request')};
 window.bpAddMaster=function(kind,id,catId){const c=allowedCats(kind==='device'?'device':'product').find(x=>x.id===catId);if(!c)return toast('Approved category unavailable');const qty=Math.max(1,Number(prompt('Quantity:',1)||0));if(!qty)return;let line;if(kind==='device'){const d=state.devices.find(x=>x.id===id);if(!d)return;line={kind,itemId:d.id,desc:d.name,size:d.model,material:d.brand,layout:d.warranty||'',pcs:'',qty,unit:'Units',price:Number(d.cost)>0?Number(d.cost)*categoryFactor(c):Number(d.price),priceTier:c.name}}else{const p=state.productItems.find(x=>x.id===id);if(!p)return;line={kind:'product',itemId:p.id,desc:p.type==='ribbon'?'RIBBON':'PAPER ROLL',size:p.type==='ribbon'?`${p.width}mm x ${p.length}m`:`${p.width}mm x ${p.diameter}mm`,material:p.type==='ribbon'?`${p.material} / ${p.color}`:`${p.paperType} / ${p.coating}`,layout:'',pcs:'',qty,unit:'Rolls',price:productPrice(p,c),priceTier:c.name}}bpCart.push(line);renderBpCart();toast('Item added to request')};
 function renderPortalMasters(){const dc=allowedCats('device'),pc=allowedCats('product');$('bpDevices').innerHTML=(state.devices||[]).map(d=>{const cats=dc.filter(c=>!(d.categoryIds||[]).length||d.categoryIds.includes(c.id));return `<div class="portal-item"><b>${esc(d.name)} — ${esc(d.model)}</b><div class="small">${esc(d.brand||'')} • ${esc(d.warranty||'')}</div><div class="actions">${cats.map(c=>`<button class="btn ghost sm" onclick="bpAddMaster('device','${d.id}','${c.id}')">${esc(c.name)} • LKR ${money(Number(d.cost)>0?Number(d.cost)*categoryFactor(c):d.price)}</button>`).join('')||'<span class="small">No approved category</span>'}</div></div>`}).join('')||'<div class="empty">No device items available.</div>';$('bpProducts').innerHTML=(state.productItems||[]).map(p=>{const cats=pc.filter(c=>!(p.categoryIds||[]).length||p.categoryIds.includes(c.id));return `<div class="portal-item"><b>${esc(productLabel(p))}</b><div class="actions">${cats.map(c=>`<button class="btn ghost sm" onclick="bpAddMaster('product','${p.id}','${c.id}')">${esc(c.name)} • LKR ${money(productPrice(p,c))}</button>`).join('')||'<span class="small">No approved category</span>'}</div></div>`}).join('')||'<div class="empty">No ribbon or paper items available.</div>'}
 function renderBpCart(){const total=bpCart.reduce((s,l)=>s+l.qty*l.price,0);$('bpCart').innerHTML=bpCart.length?`<table class="table"><thead><tr><th>Item</th><th>Tier</th><th>Qty</th><th>Price</th><th>Amount</th><th></th></tr></thead><tbody>${bpCart.map((l,i)=>`<tr><td><b>${esc(l.desc)}</b><div class="small">${esc([l.size,l.material,l.layout,l.pcs?l.pcs+' pcs':''].filter(Boolean).join(' / '))}</div></td><td>${esc(l.priceTier)}</td><td>${money(l.qty)} ${esc(l.unit)}</td><td>LKR ${money(l.price)}</td><td><b>LKR ${money(l.qty*l.price)}</b></td><td><button class="btn red sm" onclick="bpRemoveCartItem(${i})">×</button></td></tr>`).join('')}</tbody></table><div class="sumline"><span>Requested Item Total</span><strong>LKR ${money(total)}</strong></div>`:'<div class="empty">Add approved items to prepare a request.</div>'}
 window.renderBpCart=renderBpCart;
 window.bpAddQuotedHistoryLineV1039=function(line,qty){
   if(!line||typeof line!=='object')return;
   qty=Math.max(1,Number(qty||1));
   bpCart.push({
     kind:line.kind||'label',
     itemId:line.itemId||'',
     desc:line.desc||'ELP',
     size:line.size||'',
     material:line.material||'',
     layout:line.layout||'',
     pcs:line.pcs||'',
     qty,
     unit:line.unit||'Rolls',
     price:Number(line.price||0),
     priceTier:line.priceTier||'Previous Approved Price'
   });
   renderBpCart();
   toast('Previously quoted item added to request');
 };
 window.bpClearCart=function(){bpCart=[];renderBpCart()};
 window.bpRemoveCartItem=function(index){
   index=Number(index);
   if(!Number.isInteger(index)||index<0||index>=bpCart.length)return;
   bpCart.splice(index,1);
   renderBpCart();
   toast('Item removed from request');
 };
 function assignedHandler(){const u=userRecord();return u?.quoteHandler||state.users.find(x=>x.role==='manager'&&x.active!==false)?.username||'admin'}
window.toggleBpSeparateDelivery=function(){

  const enabled =
    !!$('bpSeparateDelivery')?.checked;

  const fields =
    $('bpSeparateDeliveryFields');

  if(fields){
    fields.hidden = !enabled;
  }

  [
    'bpDeliveryLine1',
    'bpDeliveryLine2',
    'bpDeliveryContact1'
  ].forEach(id=>{

    const el = $(id);

    if(el){
      el.required = enabled;
    }

  });

};


window.submitBranchQuoteRequest=function(){

  if(!bpCart.length){
    return toast('Add at least one item');
  }

  const customer =
    $('bpCustomer').value.trim();

  const phone =
    $('bpPhone').value.trim();

  const email =
    $('bpEmail').value.trim();

  if(
    !customer ||
    (!phone && !email)
  ){
    return toast(
      'Customer name and phone or email are required'
    );
  }


  const separateDelivery =
    !!$('bpSeparateDelivery')?.checked;

  const deliveryLine1 =
    $('bpDeliveryLine1')?.value.trim() || '';

  const deliveryLine2 =
    $('bpDeliveryLine2')?.value.trim() || '';

  const deliveryContact =
    $('bpDeliveryContact1')?.value.trim() || '';

  const deliveryContact2 =
    $('bpDeliveryContact2')?.value.trim() || '';


  const r = {

    id:uid('qreq'),

    requestNo:
      `BR/QR/${today().replaceAll('-','')}/${String(
        (state.quoteRequests.length || 0) + 1
      ).padStart(3,'0')}`,

    date:today(),

    status:'Pending',

    requester:currentUser.username,

    requesterName:currentUser.display,

    handler:assignedHandler(),


    customer:{
      name:customer,
      phone:phone,
      email:email,

      address:
        $('bpAddress').value.trim(),

      delivery:
        $('bpDeliveryAddress').value.trim(),

      separateDelivery:
        separateDelivery,

      deliveryLine1:
        separateDelivery
          ? deliveryLine1
          : '',

      deliveryLine2:
        separateDelivery
          ? deliveryLine2
          : '',

      deliveryContact:
        separateDelivery
          ? deliveryContact
          : '',

      deliveryContact2:
        separateDelivery
          ? deliveryContact2
          : ''
    },


    payMode:
      $('bpPayMode').value,

    vatMode:
      $('bpVat').value,

    note:
      $('bpNote').value.trim(),

    lines:
      JSON.parse(
        JSON.stringify(bpCart)
      ),

    createdAt:
      new Date().toISOString(),

    history:[
      {
        status:'Pending',
        by:currentUser.display,
        at:new Date().toISOString()
      }
    ]

  };


  state.quoteRequests.unshift(r);


  notifyV8(
    r.handler,
    'Branch Quotation Request',
    `${r.requestNo} • ${customer} • ${r.lines.length} item(s)`,
    r.id
  );


  audit(
    'BRANCH_QUOTE_REQUEST',
    `${r.requestNo} ${customer}`
  );


  saveState();

  bpClearCart();


  [
    'bpCustomer',
    'bpPhone',
    'bpEmail',
    'bpAddress',
    'bpNote',
    'bpDeliveryAddress',
    'bpDeliveryLine1',
    'bpDeliveryLine2',
    'bpDeliveryContact1',
    'bpDeliveryContact2'
  ].forEach(id=>{

    if($(id)){
      $(id).value='';
    }

  });


  if($('bpSeparateDelivery')){
    $('bpSeparateDelivery').checked=false;
  }
window.toggleBpSeparateDeliveryButton =
function(){

  const checkbox =
    $('bpSeparateDelivery');

  if(!checkbox){
    return;
  }


  checkbox.checked =
    !checkbox.checked;


  toggleBpSeparateDelivery();

};
window.toggleBpSeparateDelivery =
function(){

  const enabled =
    !!$('bpSeparateDelivery')?.checked;


  const fields =
    $('bpSeparateDeliveryFields');


  const toggle =
    $('bpSeparateDeliveryToggle');


  if(fields){

    fields.hidden =
      !enabled;

  }


  if(toggle){

    toggle.setAttribute(
      'aria-pressed',
      enabled
        ? 'true'
        : 'false'
    );

  }


  [
    'bpDeliveryLine1',
    'bpDeliveryLine2',
    'bpDeliveryContact1'
  ].forEach(id=>{

    const el =
      $(id);

    if(el){

      el.required =
        enabled;

    }

  });

};


  renderMyBranchRequests();

  toast(
    `Request ${r.requestNo} sent`
  );

};
 function requestVisible(r){return currentUser?.role==='admin'||r.requester===currentUser?.username||r.handler===currentUser?.username||hasPerm('manage_quote_requests')}
function renderMyBranchRequests(){

  const requests =
    (state.quoteRequests || [])
      .filter(
        r => r.requester === currentUser?.username
      )
      .slice(0,12);


  $('bpMyRequests').innerHTML =
    requests.length

    ? requests.map(r=>{

        const status =
          String(r.status || 'Pending')
            .trim()
            .toLowerCase();


        let statusKey = 'pending';
        let statusText = 'Waiting for quotation review';


        if(status === 'in review'){

          statusKey = 'review';

          statusText =
            `Quotation is being reviewed by ${ownerDisplay(r.handler)}`;

        }

        else if(status === 'completed'){

          statusKey = 'completed';

          statusText =
            r.quoteSerial
              ? `Quotation ready • ${r.quoteSerial}`
              : 'Quotation completed';

        }

        else if(status === 'rejected'){

          statusKey = 'rejected';

          statusText =
            'Request rejected • Contact handler';

        }


        return `

          <div class="portal-item my-request-line">

            <div class="my-request-main">

              <div class="my-request-info">

                <div class="my-request-heading">

                  <b>
                    ${esc(r.requestNo)}
                    •
                    ${esc(r.customer?.name || '-')}
                  </b>

                  <span class="request-status-detail ${statusKey}">
                    ${esc(statusText)}
                  </span>

                </div>


                <div class="small">

                  ${esc(r.date || '')}

                  • ${Number(r.lines?.length || 0)} item${Number(r.lines?.length || 0) === 1 ? '' : 's'}

                  • Handler:
                  ${esc(ownerDisplay(r.handler))}

                  ${
                    r.quoteSerial
                      ? ` • Quotation ${esc(r.quoteSerial)}`
                      : ''
                  }

                </div>

              </div>


              <button
                class="btn ghost sm my-request-view"
                type="button"
                onclick="openBranchRequest('${r.id}')"
              >
                View
              </button>

            </div>

          </div>

        `;

      }).join('')

    : '<div class="empty">No requests submitted.</div>';

}
window.renderBranchRequests=function(){

  const f =
    $('brStatusFilter')?.value || '';

  const a =
    (state.quoteRequests || [])
    .filter(
      r=>
        requestVisible(r) &&
        (!f || r.status === f)
    );


  $('branchRequestList').innerHTML =
    a.length

    ? `
      <table class="table">

        <thead>
          <tr>
            <th>Request</th>
            <th>Branch User</th>
            <th>Customer</th>
            <th>Items / Value</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>

        <tbody>

          ${a.map(r=>`

            <tr>

              <td>

                <b>
                  ${esc(r.requestNo)}
                </b>

                <div class="small">
                  ${esc(r.date)}
                  • Assigned
                  ${esc(ownerDisplay(r.handler))}
                </div>

              </td>


              <td>

                ${esc(r.requesterName)}

                <div class="small">
                  ${esc(r.requester)}
                </div>

              </td>


              <td>

                <b>
                  ${esc(r.customer.name)}
                </b>

                <div class="small">
                  ${esc(
                    r.customer.phone ||
                    r.customer.email ||
                    ''
                  )}
                </div>


                ${
                  r.customer.address
                    ? `
                      <div class="small">
                        <b>Address:</b>
                        ${esc(r.customer.address)}
                      </div>
                    `
                    : ''
                }


                ${
                  r.customer.delivery
                    ? `
                      <div
                        class="small"
                        style="
                          margin-top:4px;
                          color:#087f83;
                          font-weight:700
                        "
                      >
                        <b>${r.customer.separateDelivery?'Separate Delivery':'Delivery'}:</b>
                        ${esc(r.customer.delivery)}
                      </div>
                    `
                    : ''
                }

                ${
                  r.customer.separateDelivery && r.customer.deliveryContact
                    ? `
                      <div class="small" style="margin-top:3px">
                        <b>Delivery Contact:</b>
                        ${esc(r.customer.deliveryContact)}
                        ${
                          r.customer.deliveryContact2
                            ? ` • ${esc(r.customer.deliveryContact2)}`
                            : ''
                        }
                      </div>
                    `
                    : ''
                }

              </td>


              <td>

                ${r.lines.length} item(s)

                <div class="small">
                  LKR
                  ${money(
                    r.lines.reduce(
                      (s,l)=>s+l.qty*l.price,
                      0
                    )
                  )}
                </div>

              </td>


              <td>

                <span
                  class="request-status ${r.status.toLowerCase()}"
                >
                  ${esc(r.status)}
                </span>

                ${
                  r.quoteSerial
                    ? `
                      <div class="small">
                        Quotation: ${esc(r.quoteSerial)}
                      </div>
                    `
                    : ''
                }
                ${
                  r.piSerial
                    ? `
                      <div class="small">
                        PI: ${esc(r.piSerial)}
                      </div>
                    `
                    : ''
                }

              </td>


              <td>

                <button
                  class="btn ghost sm"
                  onclick="openBranchRequest('${r.id}')"
                >
                  Open
                </button>

                ${
                  !r.quoteId && !r.quoteSerial && !r.piId && !r.piSerial
                    ? `
                      <button
                        class="btn primary sm"
                        onclick="convertBranchRequest('${r.id}')"
                      >
                        Make Quotation
                      </button>
                    `
                    : ''
                }

              </td>

            </tr>

          `).join('')}

        </tbody>

      </table>
    `

    : `
      <div class="empty">
        No quotation requests.
      </div>
    `;

};
 window.openBranchRequest=function(id){const r=state.quoteRequests.find(x=>x.id===id);if(!r||!requestVisible(r))return;alert(`${r.requestNo}\nCustomer: ${r.customer.name}\n\n${r.lines.map(l=>`${l.desc} | ${l.size} | ${l.qty} ${l.unit} x LKR ${money(l.price)}`).join('\n')}\n\nNote: ${r.note||'-'}`)};
window.convertBranchRequest=function(id){

  const r =
    state.quoteRequests.find(
      x=>x.id===id
    );


  if(
    !r ||
    !requestVisible(r) ||
    !hasPerm('manage_quote_requests')
  ){

    return toast(
      'Request manager privilege required'
    );

  }


  let c =
    state.customers.find(
      x=>
        x.ownerUser === currentUser.username &&
        (
          (
            x.phone &&
            x.phone === r.customer.phone
          )
          ||
          (
            x.name &&
            r.customer.name &&
            x.name.toLowerCase() ===
            r.customer.name.toLowerCase()
          )
        )
    );


  /* -----------------------------------------
     Create customer if it does not exist
     ----------------------------------------- */

  if(!c){

    c = {

      id:uid('cust'),

      name:
        r.customer.name,

      phone:
        r.customer.phone,

      email:
        r.customer.email,

      address:
        r.customer.address,

      // NEW
      delivery:
        r.customer.delivery || '',

      map:'',

      vat:'',

      specialPrices:{},

      priceHistory:[],

      ownerUser:
        currentUser.username,

      sourceRequestId:
        r.id

    };


    state.customers.push(c);

  }


  const hasDevice =
    r.lines.some(
      x=>x.kind==='device'
    );

  const hasOther =
    r.lines.some(
      x=>x.kind!=='device'
    );


  if(
    hasDevice &&
    hasOther
  ){

    return toast(
      'Device and label/product items require separate quotation requests'
    );

  }


  /* -----------------------------------------
     Create quotation
     ----------------------------------------- */

  newDocument(
    'Q',
    hasDevice
      ? 'device'
      : 'label'
  );


  refreshCustomerPick();


  $('customerSelect').value =
    c.id;


  fillCustomer(c.id);


  /* -----------------------------------------
     REQUEST-SPECIFIC DELIVERY ADDRESS
     Always wins over saved customer delivery.
     ----------------------------------------- */

  if($('deliveryAddress')){

    $('deliveryAddress').value =
      r.customer.delivery ||
      c.delivery ||
      '';

  }


  $('payMode').value =
    r.payMode;


  $('vatMode').value =
    r.vatMode;


  state.current.sourceBranchRequestId =
    r.id;


  renderLineRows(

    r.lines.map(
      l=>({
        ...l,
        use:true,
        costSnapshot:null
      })
    )

  );


  r.status =
    'In Review';


  r.history.push({

    status:'In Review',

    by:currentUser.display,

    at:new Date().toISOString()

  });


  saveState();

  renderCurrent();


  toast(
    'Quotation draft created from branch request'
  );

};
 const persist85=persistCurrentDocument;persistCurrentDocument=async function(){const reqId=state.current?.sourceBranchRequestId,res=await persist85();if(res&&reqId){const r=state.quoteRequests.find(x=>x.id===reqId);if(r){r.status='Quotation Created';r.quoteId=res.id;r.quoteSerial=res.serial;r.completedBy=currentUser.display;r.completedAt=new Date().toISOString();r.history.push({status:'Quotation Created',by:currentUser.display,at:r.completedAt});notifyV8(r.requester,'Quotation Ready',`${r.requestNo} created as ${res.serial}`,r.id);saveState();renderBranchRequests()}}return res};
 // Add an explicit handler to User Management and preserve it on save.
 const priceBox=$('userPriceCategoryChoices')?.closest('.field');if(priceBox)priceBox.insertAdjacentHTML('afterend','<div class="field full"><label>Quotation Request Handler</label><select id="userQuoteHandler"><option value="admin">Administrator</option></select><div class="hint">Requests from this branch user are routed to the selected internal user.</div></div>');
 function handlerOptions(selected){const a=state.users.filter(u=>u.active!==false&&(u.role==='admin'||u.role==='manager'||(u.permissions||[]).includes('manage_quote_requests')));$('userQuoteHandler').innerHTML=a.map(u=>`<option value="${esc(u.username)}" ${u.username===selected?'selected':''}>${esc(u.display)} (${esc(u.username)})</option>`).join('')}
 const renderUser85=renderUserPrivilegeEditor;renderUserPrivilegeEditor=function(u=null){renderUser85(u);handlerOptions(u?.quoteHandler||'admin')};
 const saveUser85=saveSystemUserV6;saveSystemUserV6=function(){const id=$('editUserId').value,handler=$('userQuoteHandler')?.value||'admin',username=$('newUsername').value.trim();saveUser85();const u=state.users.find(x=>id?x.id===id:x.username===username);if(u){u.quoteHandler=handler;saveState();renderUsers()}};
 const renderUsers85=renderUsers;renderUsers=function(){renderUsers85();document.querySelectorAll('#userList tbody tr').forEach(tr=>{const username=tr.querySelector('.small')?.textContent,u=state.users.find(x=>x.username===username);if(u&&u.quoteHandler)tr.children[0].insertAdjacentHTML('beforeend',`<div class="small">Quote handler: ${esc(ownerDisplay(u.quoteHandler))}</div>`)})};
 const show85=showView;showView=function(id){const r=show85(id);if(id==='branchportal'){bpCalculate();renderPortalMasters();renderBpCart();renderMyBranchRequests()}if(id==='quoterequests')renderBranchRequests();return r};
 const login85=loginUser;loginUser=function(){login85();if(currentUser){applyUserAccess();if(hasPerm('branch_portal')&&!hasPerm('dashboard'))showView('branchportal')}};
 const restore85=restoreSession;restoreSession=function(){restore85();if(currentUser)applyUserAccess()};
 const refresh85=refreshAll;refreshAll=function(){refresh85();if($('branchportal')){renderPortalMasters();renderMyBranchRequests()}if($('quoterequests'))renderBranchRequests()};
 ['bpMaterial','bpWidth','bpHeight','bpUps','bpPcs'].forEach(id=>$(id).addEventListener('input',bpCalculate));$('bpMaterial').addEventListener('change',bpCalculate);
 renderUserPrivilegeEditor(null);applyUserAccess();bpCalculate();renderPortalMasters();renderBpCart();renderMyBranchRequests();renderBranchRequests();
})();
