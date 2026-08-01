(function(){
  const SUPABASE_URL = 'https://palrtkdvdtkqmvkjfuud.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhbHJ0a2R2ZHRrcW12a2pmdXVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwOTEyMjQsImV4cCI6MjEwMDY2NzIyNH0.5gYn9PvkMZFk922qULn4GmCQvgUnHeiES4mSEVe5q0w';
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const CLOVER_CONNECT_URL=`${SUPABASE_URL}/functions/v1/clover-connect`;
  let cloverConnection=null;

  const $=id=>document.getElementById(id);
  let inventory=[],categories=[],distributors=[],categoryRecords=[],distributorRecords=[],adminUsers=[],manageState=null,currentUser=null,userRole='staff',channel=null,currentEditId=null,pendingBarcode=null,scanMode='edit',quickProduct=null,authMode='signin',html5QrCode=null,camRunning=false,panelQrCode=null,panelCameraRunning=false,historyPage=1,historyTotal=0;
  const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
  function showAuthMessage(message,type='error'){$('authError').textContent=message;$('authError').className='auth-error'+(type==='success'?' success':type==='info'?' info':'')}
  function setAuthMode(m){authMode=m;const s=m==='signin';$('authSignInTab').className='btn '+(s?'btn-ink':'btn-line');$('authSignUpTab').className='btn '+(!s?'btn-ink':'btn-line');$('authSubmit').textContent=s?'Sign in':'Create account';$('authNameWrap').classList.toggle('visible',!s);$('authConfirmWrap').classList.toggle('visible',!s);$('authPassword').autocomplete=s?'current-password':'new-password';$('authConfirmPassword').value='';showAuthMessage('','info')}
  $('authSignInTab').onclick=()=>setAuthMode('signin');
  $('authSignUpTab').onclick=()=>setAuthMode('signup');
  $('authSubmit').onclick=async()=>{const name=$('authName').value.trim(),email=$('authEmail').value.trim(),password=$('authPassword').value,confirmPassword=$('authConfirmPassword').value,button=$('authSubmit');showAuthMessage('','info');if(authMode==='signup'&&!name)return showAuthMessage('Enter your full name.');if(!email||password.length<6)return showAuthMessage('Enter a valid email and a password with at least 6 characters.');if(authMode==='signup'&&password!==confirmPassword)return showAuthMessage('Passwords do not match. Please enter the same password twice.');button.disabled=true;button.textContent=authMode==='signin'?'Signing in…':'Creating account…';try{if(authMode==='signin'){const {error}=await db.auth.signInWithPassword({email,password});if(error)showAuthMessage(error.message)}else{const redirectTo=window.location.origin+window.location.pathname;const {data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:redirectTo,data:{full_name:name,name:name}}});if(error)return showAuthMessage(error.message);$('authName').value='';$('authPassword').value='';$('authConfirmPassword').value='';if(data.session){showAuthMessage('Account created successfully. You have been signed in.','success')}else{showAuthMessage(`Verification email sent to ${email}. Open the email and click the confirmation link before signing in.`,'success')}}}catch(error){showAuthMessage(error?.message||'Authentication failed. Please try again.')}finally{button.disabled=false;button.textContent=authMode==='signin'?'Sign in':'Create account'}};
  $('authPassword').addEventListener('keydown',e=>{if(e.key==='Enter')$('authSubmit').click()});
  $('authConfirmPassword').addEventListener('keydown',e=>{if(e.key==='Enter')$('authSubmit').click()});
  $('signOutBtn').onclick=async()=>{const {error}=await db.auth.signOut();if(error){console.error('Sign-out failed:',error);toast(error.message)}};
  let authInitialized=false;
  async function applySession(session){currentUser=session?.user||null;document.body.classList.toggle('authenticated',!!currentUser);$('signOutBtn').style.display=currentUser?'block':'none';$('userEmail').textContent=currentUser?.email||'';if(currentUser){try{await loadRole();subscribe();await loadInventory()}catch(error){console.error('Session initialization failed:',error)}}else{inventory=[];userRole='staff';document.body.classList.remove('is-admin');sync('Offline')}document.body.classList.remove('auth-loading');authInitialized=true}
  db.auth.onAuthStateChange((event,session)=>{if(!authInitialized||event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='USER_UPDATED')applySession(session)});
  async function initializeAuth(){try{const {data:{session},error}=await db.auth.getSession();if(error)throw error;await applySession(session)}catch(error){console.error('Unable to restore session:',error);showAuthMessage(error?.message||'Unable to restore session. Please sign in again.');await applySession(null)}}
  initializeAuth();
  const views={scan:$('view-scan'),inventory:$('view-inventory'),export:$('view-export'),profile:$('view-profile'),admin:$('view-admin')};
  const navBtns=[...document.querySelectorAll('.navbtn')];
  const isAdmin=()=>userRole==='admin';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800)}
  function sync(text,error=false){$('syncState').textContent=text;$('syncState').style.color=error?'var(--rust)':'var(--green)'}
  function normalizeBarcode(v){return String(v??'').trim().replace(/\.0$/,'')}
  function sameBarcode(a,b){const x=normalizeBarcode(a),y=normalizeBarcode(b);return x===y||x.replace(/^0+/,'')===y.replace(/^0+/,'')}
  function fromDb(r){return{id:r.id,barcode:r.barcode,name:r.name,price:r.price==null?null:Number(r.price),cost:r.cost==null?null:Number(r.cost),category:r.category||'',distributor:r.distributor||'',floorQty:r.floor_qty||0,backroomQty:r.backroom_qty||0,backroomCases:r.backroom_cases||0,unitsPerCase:r.units_per_case||0,lowStockThreshold:r.low_stock_threshold||0,lowStockAlertEnabled:r.low_stock_alert_enabled!==false,status:r.status||'in_stock',updatedAt:new Date(r.updated_at).getTime(),updatedBy:r.updated_by}}
  const caseUnits=p=>(p.backroomCases||0)*(p.unitsPerCase||0);
  const totalUnits=p=>(p.floorQty||0)+(p.backroomQty||0)+caseUnits(p);
  function switchView(name){if(name==='admin'&&!isAdmin())name='scan';Object.entries(views).forEach(([k,v])=>v&&v.classList.toggle('active',k===name));navBtns.forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(name==='inventory')renderList();if(name==='export')renderStats();if(name==='admin')renderAdmin();if(name==='profile')loadMyProfile();if(name==='scan')clearScanSearch()}
  navBtns.forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  function applyRoleUI(){document.body.classList.toggle('is-admin',isAdmin());$('roleChip').style.display='inline-block';$('roleChip').textContent=isAdmin()?'ADMIN':'STAFF';$('addCategoryBtn').style.display=isAdmin()?'block':'none';$('addDistributorBtn').style.display=isAdmin()?'block':'none'}
  async function loadRole(){userRole='staff';if(!currentUser)return;const {data,error}=await db.from('profiles').select('role').eq('id',currentUser.id).maybeSingle();if(!error&&data?.role)userRole=data.role;applyRoleUI()}
  function setProfileMessage(id,message,type=''){const el=$(id);if(!el)return;el.textContent=message;el.className='profile-message'+(type?' '+type:'')}
  function loadMyProfile(){if(!currentUser)return;$('profileName').value=currentUser.user_metadata?.full_name||currentUser.user_metadata?.name||'';$('profileEmail').value=currentUser.email||'';setProfileMessage('profileMessage','');setProfileMessage('passwordMessage','')}
  $('profileSaveName').onclick=async()=>{const name=$('profileName').value.trim(),btn=$('profileSaveName');if(!name)return setProfileMessage('profileMessage','Enter your full name.','error');btn.disabled=true;btn.textContent='Saving…';setProfileMessage('profileMessage','');const {data,error}=await db.auth.updateUser({data:{...currentUser.user_metadata,full_name:name,name:name}});btn.disabled=false;btn.textContent='Save name';if(error)return setProfileMessage('profileMessage',error.message,'error');currentUser=data.user;setProfileMessage('profileMessage','Name updated successfully.','success');if(isAdmin())await loadAdminUsers()};
  $('profileChangePassword').onclick=async()=>{const password=$('profileNewPassword').value,confirmPassword=$('profileConfirmPassword').value,btn=$('profileChangePassword');if(password.length<6)return setProfileMessage('passwordMessage','Password must contain at least 6 characters.','error');if(password!==confirmPassword)return setProfileMessage('passwordMessage','Passwords do not match.','error');btn.disabled=true;btn.textContent='Changing…';setProfileMessage('passwordMessage','');const {error}=await db.auth.updateUser({password});btn.disabled=false;btn.textContent='Change password';if(error)return setProfileMessage('passwordMessage',error.message,'error');$('profileNewPassword').value='';$('profileConfirmPassword').value='';setProfileMessage('passwordMessage','Password changed successfully.','success')};
  function fillSelect(id,vals,selected,label){const el=$(id);if(!el)return;const clean=[...new Set((vals||[]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));el.innerHTML=`<option value="">${esc(label)}</option>`+clean.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(selected&&!clean.includes(selected))el.insertAdjacentHTML('beforeend',`<option value="${esc(selected)}">${esc(selected)}</option>`);el.value=selected||''}
  async function loadLists(){
    const [a,b,c,d]=await Promise.all([
      db.from('categories').select('id,name,active,created_at').order('name'),
      db.from('distributors').select('id,name,active,created_at').order('name'),
      db.from('inventory').select('category,distributor'),
      db.from('product_catalog').select('category,distributor')
    ]);
    categoryRecords=(a.data||[]).map(x=>({...x,active:x.active!==false}));
    distributorRecords=(b.data||[]).map(x=>({...x,active:x.active!==false}));
    const activeCats=categoryRecords.filter(x=>x.active).map(x=>x.name), activeDists=distributorRecords.filter(x=>x.active).map(x=>x.name);
    categories=[...new Set(activeCats.filter(Boolean))];
    distributors=[...new Set(activeDists.filter(Boolean))];
    fillSelect('fieldCategory',categories,$('fieldCategory').value,'Uncategorized');
    fillSelect('fieldDistributor',distributors,$('fieldDistributor').value,'Not assigned');
    fillSelect('reportCategory',categories,$('reportCategory')?.value,'All categories');
    fillSelect('reportDistributor',distributors,$('reportDistributor')?.value,'All distributors');
    fillSelect('inventoryCategoryFilter',categories,$('inventoryCategoryFilter')?.value,'All categories');
  }
  async function loadInventory(){if(!currentUser)return;sync('Syncing…');const {data,error}=await db.from('inventory').select('*').order('updated_at',{ascending:false});if(error){sync('Sync failed',true);toast(error.message);return}inventory=(data||[]).map(fromDb);await loadLists();$('headerCount').textContent=`${inventory.length} item${inventory.length===1?'':'s'}`;renderList();renderStats();if(isAdmin())await renderAdmin();sync('Live')}
  function subscribe(){if(channel)db.removeChannel(channel);channel=db.channel('inventory-live').on('postgres_changes',{event:'*',schema:'public',table:'inventory'},()=>loadInventory()).subscribe()}
  function findProduct(code){return inventory.find(p=>sameBarcode(p.barcode,code))}
  async function lookupCatalog(code){const exact=normalizeBarcode(code);let {data,error}=await db.from('product_catalog').select('barcode,product_name,price,cost,category,distributor').eq('barcode',exact).maybeSingle();if(error)throw error;if(!data){const stripped=exact.replace(/^0+/,'');if(stripped!==exact){({data,error}=await db.from('product_catalog').select('barcode,product_name,price,cost,category,distributor').eq('barcode',stripped).maybeSingle());if(error)throw error}}return data}
  function setMode(mode){scanMode=mode;document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('modeHelp').textContent=mode==='edit'?'Scan to open and edit a product.':mode==='receive'?'Scan an existing product and add received units.':'Scan an existing product and remove sold, damaged, or transferred units.';$('quickAdjust').classList.remove('active');quickProduct=null;if($('quickReasonWrap'))$('quickReasonWrap').style.display=mode==='remove'?'block':'none'}
  document.querySelectorAll('.mode-btn').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  function clearScanSearch(){
    const input=$('scanProductSearch'),results=$('scanSearchResults');
    if(input)input.value='';
    if(results)results.innerHTML='';
  }
  function openQuickAdjust(p){
    quickProduct=p;
    $('quickProductName').textContent=p.name;
    $('quickProductMeta').textContent=`${p.barcode} · ${totalUnits(p)} units on hand · ${p.backroomCases} unopened case${p.backroomCases===1?'':'s'}`;
    $('quickQty').value=1;
    $('quickLocation').value='floor';
    $('quickAdjustError').textContent='';
    updateQuickAdjustSummary();
    $('quickAdjust').classList.add('active');
    $('quickAdjust').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function handleScan(raw){
    const code=normalizeBarcode(raw);
    if(!code)return;
    clearScanSearch();
    let p=findProduct(code);
    if(!p){
      const {data,error}=await db.from('inventory').select('*').eq('barcode',code).maybeSingle();
      if(!error&&data)p=fromDb(data);
    }
    if(scanMode!=='edit'){
      if(!p){toast('Add this product to inventory before receiving or removing stock');pendingBarcode=code;openPanel(null,true);return;}
      openQuickAdjust(p);return;
    }
    if(p){openPanel(p);return;}
    pendingBarcode=code;openPanel(null,true);
  }
  function updateQuickAdjustSummary(){
    if(!quickProduct)return;
    const qty=Math.max(1,parseInt($('quickQty').value||1,10));
    const loc=$('quickLocation').value;
    const isCases=loc==='cases';
    const unitsPerCase=quickProduct.unitsPerCase||0;
    const available=loc==='floor'?quickProduct.floorQty:loc==='backroom'?quickProduct.backroomQty:quickProduct.backroomCases;
    $('quickQtyLabel').textContent=isCases?(scanMode==='receive'?'Cases to receive':'Cases to remove'):(scanMode==='receive'?'Units to receive':'Units to remove');
    $('quickApply').textContent=scanMode==='receive'?'Receive':'Remove';
    $('quickAdjustError').textContent='';
    if(isCases){
      $('quickAdjustSummary').textContent=unitsPerCase>0?`${qty} case${qty===1?'':'s'} × ${unitsPerCase} bottles = ${qty*unitsPerCase} bottles. Available: ${available} case${available===1?'':'s'}.`:'Bottles per case is missing. Edit the product before adjusting unopened cases.';
    }else{
      const label=loc==='floor'?'on floor':'open back room';
      $('quickAdjustSummary').textContent=`${scanMode==='receive'?'+':'−'}${qty} bottle${qty===1?'':'s'} ${label}. Available: ${available}.`;
    }
  }
  $('quickLocation').addEventListener('change',updateQuickAdjustSummary);
  $('quickQty').addEventListener('input',updateQuickAdjustSummary);
  $('quickQtyMinus').addEventListener('click',()=>{$('quickQty').value=Math.max(1,(parseInt($('quickQty').value||1,10)-1));updateQuickAdjustSummary()});
  $('quickQtyPlus').addEventListener('click',()=>{$('quickQty').value=Math.max(1,(parseInt($('quickQty').value||1,10)+1));updateQuickAdjustSummary()});
  $('quickCancel').addEventListener('click',()=>{$('quickAdjust').classList.remove('active');quickProduct=null;clearScanSearch()});
  $('quickApply').addEventListener('click',async()=>{
    if(!quickProduct)return;
    const qty=Math.max(1,parseInt($('quickQty').value||1,10)),loc=$('quickLocation').value,sign=scanMode==='receive'?1:-1;
    const available=loc==='floor'?quickProduct.floorQty:loc==='backroom'?quickProduct.backroomQty:quickProduct.backroomCases;
    if(loc==='cases'&&!(quickProduct.unitsPerCase>0)){$('quickAdjustError').textContent='Bottles per case is required before unopened cases can be adjusted.';return;}
    if(sign<0&&qty>available){$('quickAdjustError').textContent=`Cannot remove ${qty}. Only ${available} ${loc==='cases'?'case(s)':'unit(s)'} are available at this location.`;return;}
    const updates={};
    if(loc==='floor')updates.floor_qty=quickProduct.floorQty+sign*qty;
    if(loc==='backroom')updates.backroom_qty=quickProduct.backroomQty+sign*qty;
    if(loc==='cases')updates.backroom_cases=quickProduct.backroomCases+sign*qty;
    updates.status=((updates.floor_qty??quickProduct.floorQty)+(updates.backroom_qty??quickProduct.backroomQty)+((updates.backroom_cases??quickProduct.backroomCases)*quickProduct.unitsPerCase)>0)?'in_stock':'out_of_stock';
    updates.updated_by=currentUser.id;updates.updated_at=new Date().toISOString();
    const {error}=await db.from('inventory').update(updates).eq('id',quickProduct.id);
    if(error){$('quickAdjustError').textContent=error.message;return;}
    const bottleChange=loc==='cases'?sign*qty*quickProduct.unitsPerCase:sign*qty;
    const totalBefore=totalUnits(quickProduct);
    const totalAfter=totalBefore+bottleChange;
    const locationAfter=available+sign*qty;
    const reason=scanMode==='remove'?($('quickReason')?.value||'other'):'received';
    const movementType=scanMode==='receive'?'receive':(reason==='sale'?'sale':'remove');
    const soldBottles=movementType==='sale'?Math.abs(bottleChange):0;
    const unitPrice=Number(quickProduct.price||0),unitCost=Number(quickProduct.cost||0);
    const revenue=soldBottles*unitPrice,costTotal=soldBottles*unitCost;
    await writeMovement({inventory_id:quickProduct.id,barcode:quickProduct.barcode,product_name:quickProduct.name,movement_type:movementType,reason,location:loc,quantity_change:sign*qty,bottle_equivalent:bottleChange,location_quantity_before:available,location_quantity_after:locationAfter,total_stock_before:totalBefore,total_stock_after:totalAfter,unit_price:unitPrice,unit_cost:unitCost,revenue,cost_total:costTotal,gross_profit:revenue-costTotal});
    await writeHistory({inventory_id:quickProduct.id,barcode:quickProduct.barcode,product_name:quickProduct.name,action:scanMode,location:loc,quantity_change:bottleChange,changed_by:currentUser.id,details:loc==='cases'?`${scanMode==='receive'?'Received':'Removed'} ${qty} case${qty===1?'':'s'} (${Math.abs(bottleChange)} bottles)${scanMode==='remove'?` • ${reason.replaceAll('_',' ')}`:''}`: `${historyLocationLabel(loc)} ${signed(sign*qty)}${scanMode==='remove'?` • ${reason.replaceAll('_',' ')}`:''}`});
    toast(`${scanMode==='receive'?'Received':'Removed'} ${qty} ${loc==='cases'?'case(s)':'unit(s)'}`);
    $('quickAdjust').classList.remove('active');quickProduct=null;clearScanSearch();await loadInventory();
  });

  let searchTimer=null,searchSequence=0;
  async function searchCatalogAndInventory(term){
    const q=term.trim();
    const results=$('scanSearchResults');
    if(q.length<2){results.innerHTML='';return;}
    const sequence=++searchSequence;
    const lower=q.toLowerCase();
    const live=inventory.filter(p=>[p.name,p.barcode,p.category,p.distributor].some(v=>String(v||'').toLowerCase().includes(lower))).slice(0,8);
    let catalog=[];
    try{
      const safe=q.replace(/[%_,()]/g,' ');
      const {data,error}=await db.from('product_catalog').select('barcode,product_name,price,cost,category,distributor').or(`product_name.ilike.%${safe}%,barcode.ilike.%${safe}%`).limit(12);
      if(!error)catalog=data||[];
    }catch(_error){}
    if(sequence!==searchSequence)return;
    const liveCodes=new Set(live.map(p=>normalizeBarcode(p.barcode)));
    const catalogOnly=catalog.filter(c=>!liveCodes.has(normalizeBarcode(c.barcode))).slice(0,8);
    const items=[...live.map(p=>({type:'inventory',barcode:p.barcode,name:p.name,category:p.category,product:p})),...catalogOnly.map(c=>({type:'catalog',barcode:c.barcode,name:c.product_name,category:c.category,catalog:c}))].slice(0,12);
    results.innerHTML=items.length?items.map((item,index)=>`<button type="button" class="scan-search-result" data-search-index="${index}"><span><strong>${esc(item.name||'Unnamed product')}</strong><small>${esc(item.barcode)}${item.category?' · '+esc(item.category):''}</small></span><em>${item.type==='inventory'?'In inventory':'Catalog'}</em></button>`).join(''):`<div class="scan-search-empty">No matching product. Press Enter to add “${esc(q)}” manually.</div>`;
    results.querySelectorAll('[data-search-index]').forEach(button=>button.onclick=()=>selectSearchResult(items[Number(button.dataset.searchIndex)]));
  }
  function selectSearchResult(item){
    clearScanSearch();
    if(item.type==='inventory'){
      if(scanMode==='edit')openPanel(item.product);else openQuickAdjust(item.product);
      return;
    }
    if(scanMode!=='edit'){toast('This catalog product must be added to inventory first');}
    const c=item.catalog;
    pendingBarcode=normalizeBarcode(c.barcode);
    openPanel(null,false);
    $('fieldName').value=c.product_name||'';$('fieldPrice').value=c.price??'';$('fieldCost').value=c.cost??'';
    fillSelect('fieldCategory',categories,c.category||'','Uncategorized');fillSelect('fieldDistributor',distributors,c.distributor||'','Not assigned');
    $('lookupStatus').textContent='Loaded from imported catalog';$('lookupStatus').classList.add('found');
  }
  $('scanProductSearch').addEventListener('input',e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>searchCatalogAndInventory(e.target.value),180)});
  $('scanProductSearch').addEventListener('keydown',e=>{
    if(e.key!=='Enter')return;e.preventDefault();
    const first=$('scanSearchResults').querySelector('[data-search-index]');
    if(first){first.click();return;}
    const value=e.currentTarget.value.trim();if(!value)return;
    if(/^\d{6,}$/.test(value))handleScan(value);else{pendingBarcode='';openPanel(null,false);$('fieldName').value=value;clearScanSearch();}
  });

  let scannerBuffer='',scannerLastKey=0,scannerResetTimer=null;
  document.addEventListener('keydown',event=>{
    if(!currentUser||!views.scan.classList.contains('active'))return;
    if($('panelOverlay').classList.contains('active')||$('quickAdjust').classList.contains('active'))return;
    const target=event.target;
    if(target&&(['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable))return;
    const now=Date.now();
    if(now-scannerLastKey>120)scannerBuffer='';
    scannerLastKey=now;
    if(event.key==='Enter'){
      const code=scannerBuffer;scannerBuffer='';clearTimeout(scannerResetTimer);
      if(code.length>=6){event.preventDefault();handleScan(code)}
      return;
    }
    if(event.key.length===1){scannerBuffer+=event.key;clearTimeout(scannerResetTimer);scannerResetTimer=setTimeout(()=>scannerBuffer='',180)}
  });
  let lookupSeq=0;
  function openPanel(p,auto=false){currentEditId=p?.id||null;$('panelTitle').textContent=p?'Edit product':'Add product';$('panelBarcode').textContent=p?.barcode||'New item';$('fieldBarcode').value=p?.barcode||pendingBarcode||'';$('fieldName').value=p?.name||'';$('fieldPrice').value=p?.price??'';$('fieldCost').value=p?.cost??'';fillSelect('fieldCategory',categories,p?.category||'','Uncategorized');fillSelect('fieldDistributor',distributors,p?.distributor||'','Not assigned');$('fieldFloorQty').value=p?.floorQty??0;$('fieldBackQty').value=p?.backroomQty??0;$('fieldCases').value=p?.backroomCases??0;$('fieldUnitsPerCase').value=p?.unitsPerCase??0;$('fieldLowStockEnabled').checked=p?p.lowStockAlertEnabled:true;$('fieldLowStock').value=p?p.lowStockThreshold:1;syncLowStockFields();$('panelDelete').style.display=p&&isAdmin()?'block':'none';$('panelOverlay').classList.add('active');$('lookupStatus').textContent='';updateTotal();if(auto)runLookup($('fieldBarcode').value)}
  async function runLookup(code){const seq=++lookupSeq;$('lookupStatus').textContent='Looking up imported catalog…';try{const d=await lookupCatalog(code);if(seq!==lookupSeq||currentEditId)return;if(d){$('fieldName').value=d.product_name||'';$('fieldPrice').value=d.price??'';$('fieldCost').value=d.cost??'';fillSelect('fieldCategory',categories,d.category||'','Uncategorized');fillSelect('fieldDistributor',distributors,d.distributor||'','Not assigned');$('lookupStatus').textContent='Found in imported catalog';$('lookupStatus').classList.add('found')}else $('lookupStatus').textContent='No catalog match — enter details manually'}catch(e){$('lookupStatus').textContent=`Catalog error: ${e.message}`}}
  function updateTotal(){const f=+$('fieldFloorQty').value||0,b=+$('fieldBackQty').value||0,c=+$('fieldCases').value||0,u=+$('fieldUnitsPerCase').value||0;$('totalLine').textContent=`Total on hand: ${f+b+c*u} units · ${c} unopened case${c===1?'':'s'}`}
  function syncLowStockFields(){$('lowStockThresholdWrap').classList.toggle('disabled',!$('fieldLowStockEnabled').checked)}
  $('fieldLowStockEnabled').onchange=syncLowStockFields;
  function initializeQuantityButtons(){
    document.querySelectorAll('[data-quantity-target]').forEach(button=>{
      button.addEventListener('click',()=>{
        const input=$(button.dataset.quantityTarget);
        if(!input)return;
        const change=Number(button.dataset.quantityChange);
        const currentValue=Number(input.value)||0;
        input.value=Math.max(0,currentValue+change);
        input.dispatchEvent(new Event('input',{bubbles:true}));
      });
    });
    ['fieldFloorQty','fieldBackQty','fieldCases','fieldUnitsPerCase'].forEach(id=>{
      $(id).addEventListener('input',updateTotal);
    });
  }
  initializeQuantityButtons();
  async function closePanel(){await stopPanelBarcodeScanner();$('panelOverlay').classList.remove('active');currentEditId=null;pendingBarcode=null}
  async function startPanelBarcodeScanner(){
    const reader=$('panelBarcodeReader'),message=$('panelBarcodeMessage'),button=$('panelScanBarcodeBtn');
    message.style.display='none';message.textContent='';
    if(panelCameraRunning){await stopPanelBarcodeScanner();return;}
    if(typeof Html5Qrcode==='undefined'){message.style.display='block';message.textContent='Barcode camera library did not load.';return;}
    reader.classList.add('active');
    panelQrCode=new Html5Qrcode('panelBarcodeReader');
    try{
      await panelQrCode.start({facingMode:'environment'},{fps:10,qrbox:{width:240,height:140}},async decoded=>{
        $('fieldBarcode').value=normalizeBarcode(decoded);
        $('panelBarcode').textContent=$('fieldBarcode').value||'New item';
        await stopPanelBarcodeScanner();
        runLookup($('fieldBarcode').value);
      },()=>{});
      panelCameraRunning=true;button.textContent='Stop scanner';
    }catch(error){
      reader.classList.remove('active');panelQrCode=null;panelCameraRunning=false;button.textContent='Scan barcode';
      message.style.display='block';message.textContent='Camera unavailable. Type or scan the barcode using the main scanner.';
    }
  }
  async function stopPanelBarcodeScanner(){
    const reader=$('panelBarcodeReader'),button=$('panelScanBarcodeBtn');
    try{if(panelQrCode&&panelCameraRunning)await panelQrCode.stop();}catch(_error){}
    try{if(panelQrCode)panelQrCode.clear();}catch(_error){}
    panelQrCode=null;panelCameraRunning=false;reader.classList.remove('active');reader.innerHTML='';button.textContent='Scan barcode';
  }
  $('panelScanBarcodeBtn').onclick=startPanelBarcodeScanner;
  $('panelCancel').onclick=closePanel;$('panelOverlay').onclick=e=>{if(e.target.id==='panelOverlay')closePanel()};$('manualAddBtn').onclick=()=>openPanel(null);
  async function addList(kind,nameOverride){if(!isAdmin()){toast('Admin access required');return}const label=kind==='category'?'category':'distributor',name=(nameOverride??prompt(`Enter new ${label}:`)??'').trim();if(!name)return;const table=kind==='category'?'categories':'distributors';const {error}=await db.from(table).upsert({name,active:true,created_by:currentUser.id},{onConflict:'name'});if(error){toast(error.message);return}await loadLists();toast(`${label} added`)}
  $('addCategoryBtn').onclick=()=>addList('category');$('addDistributorBtn').onclick=()=>addList('distributor');
  function signed(value){return `${value>0?'+':''}${value}`}
  function historyLocationLabel(location){return location==='floor'?'Floor':location==='backroom'?'Back room (open)':location==='cases'?'Unopened cases':location||'Inventory'}
  function buildEditDetails(oldProduct,newProduct){
    if(!oldProduct)return 'Product updated';
    const parts=[];
    const changes=[
      ['Floor',oldProduct.floorQty,newProduct.floor_qty],
      ['Back room',oldProduct.backroomQty,newProduct.backroom_qty],
      ['Cases',oldProduct.backroomCases,newProduct.backroom_cases],
      ['Bottles/case',oldProduct.unitsPerCase,newProduct.units_per_case]
    ];
    changes.forEach(([label,before,after])=>{if(Number(before)!==Number(after))parts.push(`${label} ${before}→${after}`)});
    const textChanges=[
      ['Name',oldProduct.name,newProduct.name],
      ['Barcode',oldProduct.barcode,newProduct.barcode],
      ['Category',oldProduct.category||'Uncategorized',newProduct.category||'Uncategorized'],
      ['Distributor',oldProduct.distributor||'None',newProduct.distributor||'None']
    ];
    textChanges.forEach(([label,before,after])=>{if(String(before)!==String(after))parts.push(`${label}: ${before} → ${after}`)});
    if(Number(oldProduct.price??0)!==Number(newProduct.price??0))parts.push(`Price ${money.format(oldProduct.price||0)}→${money.format(newProduct.price||0)}`);
    if(Number(oldProduct.cost??0)!==Number(newProduct.cost??0))parts.push(`Cost ${money.format(oldProduct.cost||0)}→${money.format(newProduct.cost||0)}`);
    if(Boolean(oldProduct.lowStockAlertEnabled)!==Boolean(newProduct.low_stock_alert_enabled))parts.push(`Low-stock alert ${newProduct.low_stock_alert_enabled?'enabled':'disabled'}`);
    if(Number(oldProduct.lowStockThreshold)!==Number(newProduct.low_stock_threshold))parts.push(`Threshold ${oldProduct.lowStockThreshold}→${newProduct.low_stock_threshold}`);
    return parts.join(' • ')||'Product saved with no field changes';
  }
  async function writeMovement(entry){
    const user=currentHistoryUser();
    const payload={
      inventory_id:entry.inventory_id||null,product_name:entry.product_name||'Unknown product',barcode:entry.barcode||null,
      movement_type:entry.movement_type,reason:entry.reason||null,location:entry.location||'all',
      quantity_change:Number(entry.quantity_change||0),bottle_equivalent:Number(entry.bottle_equivalent||0),
      location_quantity_before:entry.location_quantity_before??null,location_quantity_after:entry.location_quantity_after??null,
      total_stock_before:entry.total_stock_before??null,total_stock_after:entry.total_stock_after??null,
      unit_price:entry.unit_price??null,unit_cost:entry.unit_cost??null,revenue:Number(entry.revenue||0),
      cost_total:Number(entry.cost_total||0),gross_profit:Number(entry.gross_profit||0),
      user_id:currentUser?.id||null,user_name:user.name||'Name not provided',user_email:user.email||null
    };
    const {error}=await db.from('inventory_movements').insert(payload);
    if(error)console.error('Unable to write inventory movement:',error);
    return error;
  }

  async function writeHistory(entry){
    const payload={...entry,details:entry.details||null};
    let {error}=await db.from('inventory_history').insert(payload);
    if(error&&/details.*does not exist|column .*details/i.test(error.message||'')){
      const {details,...legacy}=payload;
      ({error}=await db.from('inventory_history').insert(legacy));
    }
    if(error)console.error('Unable to write inventory history:',error);
  }
  function currentHistoryUser(){
    const meta=currentUser?.user_metadata||{};
    return {name:meta.full_name||meta.name||'',email:currentUser?.email||''};
  }
  $('panelSave').onclick=async()=>{
    const product={barcode:normalizeBarcode($('fieldBarcode').value),name:$('fieldName').value.trim(),price:$('fieldPrice').value===''?null:Math.max(0,+$('fieldPrice').value),cost:$('fieldCost').value===''?null:Math.max(0,+$('fieldCost').value),category:$('fieldCategory').value||null,distributor:$('fieldDistributor').value||null,floor_qty:Math.max(0,+$('fieldFloorQty').value||0),backroom_qty:Math.max(0,+$('fieldBackQty').value||0),backroom_cases:Math.max(0,+$('fieldCases').value||0),units_per_case:Math.max(0,+$('fieldUnitsPerCase').value||0),low_stock_threshold:Math.max(0,+$('fieldLowStock').value||0),low_stock_alert_enabled:$('fieldLowStockEnabled').checked,status:((Math.max(0,+$('fieldFloorQty').value||0)+Math.max(0,+$('fieldBackQty').value||0)+(Math.max(0,+$('fieldCases').value||0)*Math.max(0,+$('fieldUnitsPerCase').value||0)))>0?'in_stock':'out_of_stock'),updated_by:currentUser.id,updated_at:new Date().toISOString()};
    if(!product.barcode||!product.name){toast('Barcode and product name are required');return}
    if(product.backroom_cases>0&&product.units_per_case<=0){toast('Bottles per case is required when unopened cases are entered');$('fieldUnitsPerCase').focus();return}
    let error;
    if(currentEditId){
      const oldProduct=inventory.find(x=>x.id===currentEditId);
      ({error}=await db.from('inventory').update(product).eq('id',currentEditId));
      if(!error){
        const beforeTotal=oldProduct?totalUnits(oldProduct):0,afterTotal=product.floor_qty+product.backroom_qty+product.backroom_cases*product.units_per_case;
        await writeHistory({inventory_id:currentEditId,barcode:product.barcode,product_name:product.name,action:'edit',location:'all',quantity_change:afterTotal-beforeTotal,changed_by:currentUser.id,details:buildEditDetails(oldProduct,product)});
        if(afterTotal!==beforeTotal)await writeMovement({inventory_id:currentEditId,barcode:product.barcode,product_name:product.name,movement_type:'adjustment',reason:'manual_edit',location:'all',quantity_change:afterTotal-beforeTotal,bottle_equivalent:afterTotal-beforeTotal,total_stock_before:beforeTotal,total_stock_after:afterTotal,unit_price:product.price,unit_cost:product.cost});
      }
    }else{
      const r=await db.from('inventory').insert(product).select('id').single();error=r.error;
      if(!error){
        const createdParts=['Product created'];
        if(product.floor_qty)createdParts.push(`Floor ${product.floor_qty}`);
        if(product.backroom_qty)createdParts.push(`Back room ${product.backroom_qty}`);
        if(product.backroom_cases)createdParts.push(`Cases ${product.backroom_cases} × ${product.units_per_case}`);
        const createdTotal=product.floor_qty+product.backroom_qty+product.backroom_cases*product.units_per_case;
        await writeHistory({inventory_id:r.data.id,barcode:product.barcode,product_name:product.name,action:'create',location:'all',quantity_change:createdTotal,changed_by:currentUser.id,details:createdParts.join(' • ')});
        if(createdTotal>0)await writeMovement({inventory_id:r.data.id,barcode:product.barcode,product_name:product.name,movement_type:'create',reason:'opening_stock',location:'all',quantity_change:createdTotal,bottle_equivalent:createdTotal,total_stock_before:0,total_stock_after:createdTotal,unit_price:product.price,unit_cost:product.cost});
      }
    }
    if(error){toast(error.message);return}
    closePanel();toast('Saved');await loadInventory();
  };
  $('panelDelete').onclick=async()=>{if(!isAdmin()||!currentEditId)return;const p=inventory.find(x=>x.id===currentEditId);const {error}=await db.from('inventory').delete().eq('id',currentEditId);if(error){toast(error.message);return}await writeHistory({inventory_id:null,barcode:p.barcode,product_name:p.name,action:'delete',location:'all',quantity_change:-totalUnits(p),changed_by:currentUser.id,details:`Product deleted • ${totalUnits(p)} bottle${totalUnits(p)===1?'':'s'} removed`});closePanel();await loadInventory()};
  let inventorySortKey='name';
  let inventorySortDirection='asc';

  function inventorySortValue(product,key){
    if(key==='total')return totalUnits(product);
    if(key==='status')return totalUnits(product)<=0?'out_of_stock':'in_stock';
    return product[key]??'';
  }

  function compareInventoryProducts(a,b){
    const aValue=inventorySortValue(a,inventorySortKey);
    const bValue=inventorySortValue(b,inventorySortKey);
    let result;
    if(typeof aValue==='number'&&typeof bValue==='number')result=aValue-bValue;
    else result=String(aValue).localeCompare(String(bValue),undefined,{numeric:true,sensitivity:'base'});
    if(result===0)result=String(a.name||'').localeCompare(String(b.name||''),undefined,{numeric:true,sensitivity:'base'});
    return inventorySortDirection==='asc'?result:-result;
  }

  function updateInventorySortHeaders(){
    document.querySelectorAll('[data-inventory-sort]').forEach(button=>{
      const active=button.dataset.inventorySort===inventorySortKey;
      button.classList.toggle('active',active);
      const th=button.closest('th');
      if(th)th.setAttribute('aria-sort',active?(inventorySortDirection==='asc'?'ascending':'descending'):'none');
    });
  }

  document.querySelectorAll('[data-inventory-sort]').forEach(button=>{
    button.addEventListener('click',()=>{
      const key=button.dataset.inventorySort;
      if(inventorySortKey===key)inventorySortDirection=inventorySortDirection==='asc'?'desc':'asc';
      else{inventorySortKey=key;inventorySortDirection='asc';}
      renderList();
    });
  });

  $('searchInput').oninput=renderList;
  $('inventoryCategoryFilter').onchange=renderList;
  $('inventoryStatusFilter').onchange=renderList;
  $('inventoryClearFilters').onclick=()=>{
    $('searchInput').value='';
    $('inventoryCategoryFilter').value='';
    $('inventoryStatusFilter').value='';
    renderList();
  };

  function renderList(){
    const q=$('searchInput').value.trim().toLowerCase();
    const category=$('inventoryCategoryFilter').value;
    const status=$('inventoryStatusFilter').value;
    const rows=inventory.filter(p=>{
      const matchesSearch=!q||[p.name,p.barcode,p.category,p.distributor].some(v=>String(v||'').toLowerCase().includes(q));
      const matchesCategory=!category||p.category===category;
      const actualStatus=totalUnits(p)<=0?'out_of_stock':'in_stock';
      const matchesStatus=!status||actualStatus===status;
      return matchesSearch&&matchesCategory&&matchesStatus;
    }).sort(compareInventoryProducts);

    updateInventorySortHeaders();
    $('inventoryResultCount').textContent=`${rows.length} of ${inventory.length} product${inventory.length===1?'':'s'}`;
    $('inventoryRows').innerHTML=rows.length?rows.map(p=>{
      const total=totalUnits(p);
      const actualStatus=total<=0?'out_of_stock':'in_stock';
      return `<tr class="inventory-row" data-id="${p.id}">
        <td class="product-cell" data-label="Product"><span class="product-name">${esc(p.name)}</span><span class="mobile-product-meta">${esc(p.barcode)}${p.category?' · '+esc(p.category):''}</span></td>
        <td class="barcode-cell" data-label="Barcode">${esc(p.barcode)}</td>
        <td class="category-cell" data-label="Category">${esc(p.category||'Uncategorized')}</td>
        <td class="distributor-cell" data-label="Distributor">${esc(p.distributor||'—')}</td>
        <td class="number-column floor-cell" data-label="Floor">${p.floorQty}</td>
        <td class="number-column backroom-cell" data-label="Backroom">${p.backroomQty}</td>
        <td class="number-column cases-cell" data-label="Cases">${p.backroomCases}</td>
        <td class="number-column total-cell" data-label="Total">${total}<span class="mobile-location">F ${p.floorQty} · B ${p.backroomQty}</span></td>
        <td class="status-cell" data-label="Status"><span class="badge ${actualStatus==='out_of_stock'?'out':'in'}">${actualStatus==='out_of_stock'?'Out':'In stock'}</span></td>
      </tr>`;
    }).join(''):'<tr><td colspan="9" class="inventory-empty">No matching products.</td></tr>';

    document.querySelectorAll('#inventoryRows .inventory-row').forEach(row=>{
      row.onclick=()=>openPanel(inventory.find(p=>p.id===row.dataset.id));
    });
  }
  function stats(filtered=inventory){return{products:filtered.length,units:filtered.reduce((s,p)=>s+totalUnits(p),0),cases:filtered.reduce((s,p)=>s+p.backroomCases,0),out:filtered.filter(p=>totalUnits(p)<=0).length,retail:filtered.reduce((s,p)=>s+totalUnits(p)*(p.price||0),0),cost:filtered.reduce((s,p)=>s+totalUnits(p)*(p.cost||0),0)}}
  function renderStats(){const s=stats();$('statTotal').textContent=s.products;$('statUnits').textContent=s.units;$('statCases').textContent=s.cases;$('statOut').textContent=s.out}
  $('exportBtn').onclick=()=>{if(!inventory.length)return toast('Nothing to export');const rows=inventory.map(p=>({'Barcode':p.barcode,'Product Name':p.name,'Price':p.price??'','Cost':p.cost??'','Category':p.category,'Distributor':p.distributor,'On Floor':p.floorQty,'Back Room':p.backroomQty,'Cases':p.backroomCases,'Units per Case':p.unitsPerCase,'Total Units':totalUnits(p),'Retail Value':totalUnits(p)*(p.price||0),'Cost Value':totalUnits(p)*(p.cost||0),'Low Stock Alert':p.lowStockAlertEnabled?'On':'Off','Low Stock Threshold':p.lowStockThreshold,'Status':p.status}));const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Inventory');XLSX.writeFile(wb,`shelf-inventory-${new Date().toISOString().slice(0,10)}.xlsx`)};
  function usageCount(kind,name){
    const inv=inventory.filter(p=>(kind==='category'?p.category:p.distributor)===name).length;
    return {inventory:inv};
  }
  function renderManager(kind){
    const records=kind==='category'?categoryRecords:distributorRecords;
    const el=$(kind==='category'?'adminCategoryList':'adminDistributorList');
    if(!records.length){el.innerHTML='<div class="small-note">No entries yet.</div>';return;}
    el.innerHTML=records.map(r=>{const u=usageCount(kind,r.name);return `<div class="manager-item ${r.active?'':'inactive-row'}"><div class="manager-main"><div><div class="manager-name">${esc(r.name)}</div><div class="manager-meta">${u.inventory} live inventory product${u.inventory===1?'':'s'} · ${r.active?'Active':'Inactive'}</div></div><div class="manager-actions"><button class="mini-btn" data-manage="rename" data-kind="${kind}" data-name="${esc(r.name)}">Rename</button><button class="mini-btn" data-manage="merge" data-kind="${kind}" data-name="${esc(r.name)}">Merge</button><button class="mini-btn warn" data-manage="toggle" data-kind="${kind}" data-name="${esc(r.name)}">${r.active?'Deactivate':'Activate'}</button><button class="mini-btn danger" data-manage="remove" data-kind="${kind}" data-name="${esc(r.name)}">Remove</button></div></div></div>`}).join('');
    el.querySelectorAll('[data-manage]').forEach(b=>b.onclick=()=>openManage(b.dataset.kind,b.dataset.manage,b.dataset.name));
  }
  function openManage(kind,action,source){
    const records=kind==='category'?categoryRecords:distributorRecords, label=kind==='category'?'category':'distributor';
    manageState={kind,action,source};$('manageModal').classList.add('active');$('manageNameWrap').style.display=action==='rename'?'block':'none';$('manageTargetWrap').style.display=['merge','remove'].includes(action)?'block':'none';
    $('manageNameInput').value=action==='rename'?source:'';
    const alternatives=records.filter(r=>r.name!==source&&r.active).map(r=>r.name);
    $('manageTargetSelect').innerHTML=(action==='remove'?`<option value="">${kind==='category'?'Set as Uncategorized':'Set as None'}</option>`:'')+alternatives.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    const count=usageCount(kind,source).inventory;
    if(action==='rename'){$('manageModalTitle').textContent=`Rename ${label}`;$('manageModalText').textContent=`Rename “${source}” everywhere it is used.`;$('manageConfirm').textContent='Rename'}
    if(action==='merge'){$('manageModalTitle').textContent=`Merge ${label}`;$('manageModalText').textContent=`Move all products from “${source}” into another ${label}, then remove “${source}”.`;$('manageConfirm').textContent='Merge'}
    if(action==='toggle'){$('manageModalTitle').textContent=`${records.find(r=>r.name===source)?.active?'Deactivate':'Activate'} ${label}`;$('manageModalText').textContent=`Inactive entries stay on existing products but no longer appear as choices for new assignments.`;$('manageConfirm').textContent=records.find(r=>r.name===source)?.active?'Deactivate':'Activate'}
    if(action==='remove'){$('manageModalTitle').textContent=`Remove ${label}`;$('manageModalText').textContent=`“${source}” is used by ${count} live inventory product${count===1?'':'s'}. Choose where those products should go before removal.`;$('manageConfirm').textContent='Remove'}
    $('manageModalNote').textContent=action==='merge'&&!alternatives.length?`Create another active ${label} before merging.`:'';
    $('manageConfirm').disabled=action==='merge'&&!alternatives.length;
  }
  function closeManage(){$('manageModal').classList.remove('active');manageState=null;$('manageConfirm').disabled=false}
  $('manageCancel').onclick=closeManage;$('manageModal').onclick=e=>{if(e.target===$('manageModal'))closeManage()};
  $('manageConfirm').onclick=async()=>{
    if(!manageState)return;const {kind,action,source}=manageState;let target=null;
    if(action==='rename'){target=$('manageNameInput').value.trim();if(!target)return toast('Enter a new name');if(target.toLowerCase()===source.toLowerCase())return closeManage()}
    if(['merge','remove'].includes(action))target=$('manageTargetSelect').value||null;
    const records=kind==='category'?categoryRecords:distributorRecords, active=records.find(r=>r.name===source)?.active!==false;
    const params={p_kind:kind,p_action:action,p_source:source,p_target:target,p_active:action==='toggle'?!active:null};
    $('manageConfirm').disabled=true;const {error}=await db.rpc('manage_reference_value',params);$('manageConfirm').disabled=false;
    if(error){toast(error.message);return}closeManage();await loadInventory();toast(`${kind==='category'?'Category':'Distributor'} updated`);
  };
  function renderAdminUsers(){
    const el=$('adminUserList');
    const query=($('adminUserSearch')?.value||'').trim().toLowerCase();
    const shown=adminUsers.filter(u=>`${u.full_name||u.name||''} ${u.email||''}`.toLowerCase().includes(query));
    const activeAdmins=adminUsers.filter(u=>u.role==='admin'&&u.is_active).length;
    el.innerHTML=shown.length?shown.map(u=>{
      const self=u.id===currentUser.id,lastAdmin=u.role==='admin'&&u.is_active&&activeAdmins<=1,protectedUser=self||lastAdmin;
      const displayName=u.full_name||u.name||u.user_metadata?.full_name||'Name not provided';
      return `<div class="user-row" data-user-id="${u.id}">
        <div class="user-identity"><div class="user-name">${esc(displayName)}</div><div class="user-email-line">${esc(u.email||'Unknown email')}</div><div class="user-meta">Joined ${u.created_at?new Date(u.created_at).toLocaleDateString():'—'}${self?' · You':''}</div></div>
        <select class="user-role-select" data-original-role="${esc(u.role||'staff')}" ${protectedUser?'disabled':''}><option value="staff" ${u.role==='staff'?'selected':''}>Staff</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select>
        <div class="user-status ${u.is_active?'active':'disabled'}">${u.is_active?'Active':'Disabled'}</div>
        <div class="user-actions"><button class="mini-btn user-edit-name">Edit name</button><button class="mini-btn user-toggle" ${protectedUser?'disabled':''}>${u.is_active?'Disable':'Enable'}</button><button class="mini-btn user-remove" ${protectedUser?'disabled':''}>Remove</button></div>
      </div>`}).join(''):'<div class="small-note">No matching users found.</div>';
    el.querySelectorAll('.user-edit-name').forEach(btn=>btn.onclick=async()=>{
      const id=btn.closest('.user-row').dataset.userId,u=adminUsers.find(x=>x.id===id);if(!u)return;
      const existing=u.full_name||u.name||'';const name=prompt(`Enter the full name for ${u.email||'this user'}:`,existing==='Name not provided'?'':existing);
      if(name===null)return;const clean=name.trim();if(!clean)return toast('Name cannot be empty');
      btn.disabled=true;const {error}=await db.rpc('admin_set_user_name',{p_user_id:id,p_full_name:clean});btn.disabled=false;
      if(error){toast(error.message);return}toast('Name updated');await loadAdminUsers();
    });
    el.querySelectorAll('.user-role-select').forEach(sel=>sel.onchange=async()=>{
      const row=sel.closest('.user-row'),id=row.dataset.userId,u=adminUsers.find(x=>x.id===id),oldRole=sel.dataset.originalRole,newRole=sel.value;
      if(!u||oldRole===newRole)return;
      const label=u.full_name||u.name||u.email||'this user';
      if(!confirm(`Change ${label}'s role from ${oldRole} to ${newRole}?`)){sel.value=oldRole;return}
      sel.disabled=true;
      const {error}=await db.rpc('admin_set_user_role',{p_user_id:id,p_role:newRole});
      if(error){toast(error.message);sel.value=oldRole;sel.disabled=false;return}
      toast('Role updated');await loadAdminUsers();
    });
    el.querySelectorAll('.user-toggle').forEach(btn=>btn.onclick=async()=>{
      const row=btn.closest('.user-row'),id=row.dataset.userId,u=adminUsers.find(x=>x.id===id);if(!u)return;
      const label=u.full_name||u.name||u.email||'this user';
      if(!confirm(`${u.is_active?'Disable':'Enable'} ${label}?`))return;
      const {error}=await db.rpc('admin_set_user_active',{p_user_id:id,p_active:!u.is_active});
      if(error){toast(error.message);return}toast(u.is_active?'User disabled':'User enabled');await loadAdminUsers();
    });
    el.querySelectorAll('.user-remove').forEach(btn=>btn.onclick=async()=>{
      const id=btn.closest('.user-row').dataset.userId,u=adminUsers.find(x=>x.id===id);if(!u)return;
      const label=u.full_name||u.name||u.email||'this user';
      if(!confirm(`Permanently remove ${label}? This cannot be undone.`))return;
      const {error}=await db.rpc('admin_delete_user',{p_user_id:id});
      if(error){toast(error.message);return}toast('User removed');await loadAdminUsers();
    });
  }
  function syncHistoryUserFilter(){
    const select=$('historyUserFilter');
    if(!select)return;
    const selected=select.value;
    select.innerHTML='<option value="">All users</option>'+adminUsers.map(u=>`<option value="${esc(u.id)}">${esc((u.full_name||u.name||'Name not provided')+' — '+(u.email||''))}</option>`).join('');
    if([...select.options].some(option=>option.value===selected))select.value=selected;
  }
  function historyUserDisplay(row){
    const match=adminUsers.find(u=>u.id===row.changed_by)||adminUsers.find(u=>(u.email||'').toLowerCase()===(row.changed_by_email||'').toLowerCase());
    const self=row.changed_by===currentUser?.id;
    const meta=currentUser?.user_metadata||{};
    const name=match?.full_name||match?.name||(self?(meta.full_name||meta.name):'')||'Name not provided';
    const email=match?.email||row.changed_by_email||(self?currentUser?.email:'')||'Unknown email';
    return `<div class="history-user"><strong>${esc(name)}</strong><small>${esc(email)}</small></div>`;
  }
  function fallbackHistoryDetails(row){
    if(row.details)return row.details;
    const change=Number(row.quantity_change)||0;
    if(row.action==='create')return `Product created${change?` • ${Math.abs(change)} bottle${Math.abs(change)===1?'':'s'} on hand`:''}`;
    if(row.action==='delete')return `Product deleted${change?` • ${Math.abs(change)} bottle${Math.abs(change)===1?'':'s'} removed`:''}`;
    if(row.action==='receive'||row.action==='remove')return `${historyLocationLabel(row.location)} ${signed(change)}`;
    if(change)return `Total inventory ${signed(change)}`;
    return 'Legacy entry — detailed field changes were not recorded';
  }
  async function loadAdminUsers(){
    const {data,error}=await db.rpc('admin_list_users');
    const el=$('adminUserList');
    if(error){el.innerHTML=`<div class="small-note">User management needs the included Supabase SQL update.<br>${esc(error.message)}</div>`;return}
    adminUsers=data||[];renderAdminUsers();syncHistoryUserFilter();
  }
  if($('adminUserSearch'))$('adminUserSearch').addEventListener('input',renderAdminUsers);

  function localDateValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function historyInclusiveDays(startValue, endValue) {
    const start = parseLocalDate(startValue);
    const end = parseLocalDate(endValue);
    if (!start || !end) return 0;
    const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.floor((endUtc - startUtc) / 86400000) + 1;
  }

  function updateHistoryAllOption() {
    const startValue = $('historyStartDate')?.value;
    const endValue = $('historyEndDate')?.value;
    const pageSize = $('historyPageSize');
    const allOption = $('historyPageSizeAll');
    if (!pageSize || !allOption) return;
    const days = historyInclusiveDays(startValue, endValue);
    const allowed = days > 0 && days <= 5;
    allOption.disabled = !allowed;
    allOption.textContent = allowed ? 'All' : 'All (up to 5 days)';
    if (!allowed && pageSize.value === 'all') pageSize.value = '50';
  }

  function initializeHistoryDates(forceToday = false) {
    const startInput = $('historyStartDate');
    const endInput = $('historyEndDate');
    if (!startInput || !endInput) return;
    const today = localDateValue();
    const earliest = new Date();
    earliest.setMonth(earliest.getMonth() - 3);
    const earliestValue = localDateValue(earliest);
    startInput.min = earliestValue;
    startInput.max = today;
    endInput.min = earliestValue;
    endInput.max = today;
    if (forceToday || !startInput.value || !endInput.value) {
      startInput.value = today;
      endInput.value = today;
    }
    updateHistoryAllOption();
  }

  function validateHistoryRange() {
    const start = $('historyStartDate')?.value || '';
    const end = $('historyEndDate')?.value || '';
    if (!start || !end) return {valid:false,message:'Select both a start date and an end date.'};
    const startDate = parseLocalDate(start);
    const endDate = parseLocalDate(end);
    if (!startDate || !endDate) return {valid:false,message:'Select valid dates.'};
    if (startDate > endDate) return {valid:false,message:'The start date cannot be after the end date.'};
    const today = parseLocalDate(localDateValue());
    if (endDate > today) return {valid:false,message:'The end date cannot be in the future.'};
    const earliest = new Date(today);
    earliest.setMonth(earliest.getMonth() - 3);
    if (startDate < earliest) return {valid:false,message:'The selected date range cannot exceed the last 3 months.'};
    const days = historyInclusiveDays(start, end);
    updateHistoryAllOption();
    return {valid:true,start,end,days};
  }

  async function loadHistory(){
    if(!isAdmin())return;
    const range=validateHistoryRange();
    if(!range.valid){$('historyFilterMessage').textContent=range.message;return;}
    const pageValue=$('historyPageSize').value;
    const pageSize=pageValue==='all'?null:Number(pageValue);
    const startIso=new Date(`${range.start}T00:00:00`).toISOString();
    const endDate=new Date(`${range.end}T00:00:00`);endDate.setDate(endDate.getDate()+1);
    const endIso=endDate.toISOString();
    const userId=$('historyUserFilter')?.value||'';
    const action=$('historyActionFilter')?.value||'';
    const productQuery=($('historyProductFilter')?.value||'').trim().replace(/[%_,()]/g,' ');
    function applyHistoryFilters(query){
      query=query.gte('changed_at',startIso).lt('changed_at',endIso);
      if(userId)query=query.eq('changed_by',userId);
      if(action)query=query.eq('action',action);
      if(productQuery)query=query.or(`product_name.ilike.%${productQuery}%,barcode.ilike.%${productQuery}%`);
      return query;
    }
    let countQuery=applyHistoryFilters(db.from('inventory_history').select('id',{count:'exact',head:true}));
    const {count,error:countError}=await countQuery;
    if(countError){$('historyFilterMessage').textContent=countError.message;return;}
    historyTotal=count||0;
    const totalPages=pageSize?Math.max(1,Math.ceil(historyTotal/pageSize)):1;
    historyPage=Math.min(Math.max(1,historyPage),totalPages);
    let query=applyHistoryFilters(db.from('inventory_history').select('*')).order('changed_at',{ascending:false});
    if(pageSize){const from=(historyPage-1)*pageSize;query=query.range(from,from+pageSize-1);}
    const {data,error}=await query;
    if(error){$('historyFilterMessage').textContent=error.message;return;}
    $('historyRows').innerHTML=(data||[]).map(h=>`<tr><td>${new Date(h.changed_at).toLocaleString()}</td><td><strong>${esc(h.product_name||h.barcode||'Unknown product')}</strong>${h.barcode?`<small class="history-product-barcode">${esc(h.barcode)}</small>`:''}</td><td><span class="history-action history-action-${esc(String(h.action||'edit').toLowerCase())}">${esc(String(h.action||'edit').toUpperCase())}</span></td><td class="history-details">${esc(fallbackHistoryDetails(h))}</td><td>${historyUserDisplay(h)}</td></tr>`).join('')||'<tr><td colspan="5">No history found for the selected filters.</td></tr>';
    $('historyPageInfo').textContent=pageSize?`Page ${historyPage} of ${totalPages}`:`${historyTotal} rows`;
    $('historyPreviousButton').disabled=!pageSize||historyPage<=1;
    $('historyNextButton').disabled=!pageSize||historyPage>=totalPages;
    $('historyFilterMessage').textContent=`${historyTotal} record${historyTotal===1?'':'s'} · ${range.days} day${range.days===1?'':'s'}`+(range.days>5?' · “All” is available for ranges up to 5 days.':'');
  }
  $('historyApplyDateButton').onclick=()=>{historyPage=1;loadHistory()};
  $('historyTodayButton').onclick=()=>{const today=localDateValue(new Date());$('historyStartDate').value=today;$('historyEndDate').value=today;historyPage=1;loadHistory()};
  $('historyPageSize').onchange=()=>{historyPage=1;loadHistory()};
  if($('historyUserFilter'))$('historyUserFilter').onchange=()=>{historyPage=1;loadHistory()};
  if($('historyActionFilter'))$('historyActionFilter').onchange=()=>{historyPage=1;loadHistory()};
  if($('historyProductFilter'))$('historyProductFilter').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();historyPage=1;loadHistory()}});
  $('historyPreviousButton').onclick=()=>{if(historyPage>1){historyPage--;loadHistory()}};
  $('historyNextButton').onclick=()=>{historyPage++;loadHistory()};

  // Reports & analytics
  let analyticsPeriod = 'today';
  let analyticsReport = null;

  function analyticsDateValue(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function analyticsParseDate(value) {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function analyticsRangeFor(period) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let start = new Date(today);
    let end = new Date(today);
    if (period === 'week') {
      const day = start.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + mondayOffset);
    } else if (period === 'month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (period === 'custom') {
      start = analyticsParseDate($('analyticsStartDate')?.value);
      end = analyticsParseDate($('analyticsEndDate')?.value);
    }
    return { start, end };
  }

  function analyticsSetCustomDates(start, end) {
    if ($('analyticsStartDate')) $('analyticsStartDate').value = analyticsDateValue(start);
    if ($('analyticsEndDate')) $('analyticsEndDate').value = analyticsDateValue(end);
  }

  function analyticsDateBounds(start, end) {
    const from = new Date(start);
    from.setHours(0, 0, 0, 0);
    const until = new Date(end);
    until.setDate(until.getDate() + 1);
    until.setHours(0, 0, 0, 0);
    return { fromIso: from.toISOString(), untilIso: until.toISOString() };
  }

  function analyticsPeriodDays(start, end) {
    const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.max(1, Math.floor((b - a) / 86400000) + 1);
  }

  function analyticsProductKey(row) {
    return row.inventory_id || row.barcode || row.product_name || row.id;
  }

  function analyticsNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function analyticsBuildReport(movements, start, end) {
    const groups = new Map();
    const ordered = [...movements].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    for (const movement of ordered) {
      const key = analyticsProductKey(movement);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          inventoryId: movement.inventory_id || null,
          productName: movement.product_name || 'Unknown product',
          barcode: movement.barcode || '',
          starting: movement.total_stock_before == null ? 0 : analyticsNumber(movement.total_stock_before),
          ending: movement.total_stock_after == null ? 0 : analyticsNumber(movement.total_stock_after),
          received: 0,
          sold: 0,
          other: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          movements: 0
        });
      }
      const product = groups.get(key);
      product.productName = movement.product_name || product.productName;
      product.barcode = movement.barcode || product.barcode;
      product.ending = movement.total_stock_after == null ? product.ending : analyticsNumber(movement.total_stock_after);
      const bottles = analyticsNumber(movement.bottle_equivalent);
      if (movement.movement_type === 'receive') product.received += Math.abs(bottles);
      else if (movement.movement_type === 'sale') product.sold += Math.abs(bottles);
      else product.other += bottles;
      product.revenue += analyticsNumber(movement.revenue);
      product.cost += analyticsNumber(movement.cost_total);
      product.profit += analyticsNumber(movement.gross_profit);
      product.movements += 1;
    }

    const products = [...groups.values()].sort((a, b) => a.productName.localeCompare(b.productName));
    const revenue = products.reduce((sum, item) => sum + item.revenue, 0);
    const cost = products.reduce((sum, item) => sum + item.cost, 0);
    const profit = products.reduce((sum, item) => sum + item.profit, 0);
    const sold = products.reduce((sum, item) => sum + item.sold, 0);
    const received = products.reduce((sum, item) => sum + item.received, 0);
    const lowStock = inventory.filter(p => p.lowStockAlertEnabled && p.lowStockThreshold > 0 && totalUnits(p) > 0 && totalUnits(p) <= p.lowStockThreshold);
    const outOfStock = inventory.filter(p => totalUnits(p) <= 0);
    const periodDays = analyticsPeriodDays(start, end);

    const sales = products.filter(item => item.sold > 0).sort((a, b) => b.sold - a.sold || b.revenue - a.revenue);
    const fastMovers = sales.slice(0, 10);
    const salesByInventory = new Map(products.map(item => [item.inventoryId, item.sold]));
    const slowRunners = inventory
      .filter(product => totalUnits(product) > 0)
      .map(product => {
        const unitsSold = analyticsNumber(salesByInventory.get(product.id));
        const currentStock = totalUnits(product);
        const averageDailySales = unitsSold / periodDays;
        const daysOfInventory = averageDailySales > 0 ? currentStock / averageDailySales : null;
        const stockCost = currentStock * analyticsNumber(product.cost);
        let recommendation;
        if (unitsSold === 0) recommendation = `No sales in this period. Review shelf placement or pricing and pause reordering until stock decreases.`;
        else if (daysOfInventory != null && daysOfInventory > 90) recommendation = `About ${Math.round(daysOfInventory)} days of inventory remain. Reduce future orders and consider a promotion.`;
        else recommendation = `Movement is below the fastest sellers. Monitor another period before increasing orders.`;
        return { product, unitsSold, currentStock, averageDailySales, daysOfInventory, stockCost, recommendation };
      })
      .filter(item => item.unitsSold === 0 || (item.daysOfInventory != null && item.daysOfInventory >= 45))
      .sort((a, b) => (b.daysOfInventory || 999999) - (a.daysOfInventory || 999999))
      .slice(0, 10);

    return {
      start,
      end,
      days: periodDays,
      products,
      sales,
      fastMovers,
      slowRunners,
      lowStock,
      outOfStock,
      revenue,
      cost,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      sold,
      received,
      movementCount: movements.length
    };
  }

  function analyticsEmptyRow(columns, message) {
    return `<tr><td colspan="${columns}">${esc(message)}</td></tr>`;
  }

  function renderAnalytics(report) {
    analyticsReport = report;
    $('analyticsRevenue').textContent = money.format(report.revenue);
    $('analyticsCost').textContent = money.format(report.cost);
    $('analyticsProfit').textContent = money.format(report.profit);
    $('analyticsMargin').textContent = `${report.margin.toFixed(1)}%`;
    $('analyticsSold').textContent = report.sold;
    $('analyticsReceived').textContent = report.received;
    $('analyticsLow').textContent = report.lowStock.length;
    $('analyticsOut').textContent = report.outOfStock.length;

    $('analyticsInventoryRows').innerHTML = report.products.length
      ? report.products.map(item => `<tr><td><strong>${esc(item.productName)}</strong>${item.barcode ? `<small class="history-product-barcode">${esc(item.barcode)}</small>` : ''}</td><td>${item.starting}</td><td>+${item.received}</td><td>-${item.sold}</td><td>${signed(item.other)}</td><td>${item.ending}</td></tr>`).join('')
      : analyticsEmptyRow(6, 'No inventory movements were recorded for this period.');

    $('analyticsSalesRows').innerHTML = report.sales.length
      ? report.sales.map(item => `<tr><td><strong>${esc(item.productName)}</strong></td><td>${item.sold}</td><td>${money.format(item.revenue)}</td><td>${money.format(item.cost)}</td><td>${money.format(item.profit)}</td></tr>`).join('')
      : analyticsEmptyRow(5, 'No sales were recorded for this period. Use Remove with reason Sale.');

    $('analyticsFastMovers').innerHTML = report.fastMovers.length
      ? report.fastMovers.map((item, index) => `<div class="analytics-list-item"><strong>${index + 1}. ${esc(item.productName)}</strong><small>${item.sold} sold · ${(item.sold / report.days).toFixed(2)}/day · ${money.format(item.revenue)} revenue · ${money.format(item.profit)} profit</small></div>`).join('')
      : '<div class="analytics-list-item"><small>No sales were recorded for this period.</small></div>';

    $('analyticsSlowRunners').innerHTML = report.slowRunners.length
      ? report.slowRunners.map(item => `<div class="analytics-list-item"><strong>${esc(item.product.name)}</strong><small>${item.currentStock} in stock · ${item.unitsSold} sold · ${item.daysOfInventory == null ? 'No movement' : `${Math.round(item.daysOfInventory)} days of inventory`} · ${money.format(item.stockCost)} cost value</small><div class="analytics-recommendation">${esc(item.recommendation)}</div></div>`).join('')
      : '<div class="analytics-list-item"><small>No slow runners matched the current period.</small></div>';

    $('analyticsStatus').textContent = `${report.movementCount} movement${report.movementCount === 1 ? '' : 's'} · ${report.products.length} changed product${report.products.length === 1 ? '' : 's'} · ${report.days} day${report.days === 1 ? '' : 's'}`;
  }

  async function loadAnalytics() {
    if (!isAdmin()) return;
    const status = $('analyticsStatus');
    if (!status) return;
    const { start, end } = analyticsRangeFor(analyticsPeriod);
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      status.textContent = 'Select a valid start and end date.';
      return;
    }
    if (start > end) {
      status.textContent = 'The report start date cannot be after the end date.';
      return;
    }
    const days = analyticsPeriodDays(start, end);
    if (days > 366) {
      status.textContent = 'Select a report range of one year or less.';
      return;
    }
    status.textContent = 'Loading report…';
    const { fromIso, untilIso } = analyticsDateBounds(start, end);
    const { data, error } = await db
      .from('inventory_movements')
      .select('*')
      .gte('created_at', fromIso)
      .lt('created_at', untilIso)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Unable to load analytics:', error);
      status.textContent = /inventory_movements/i.test(error.message || '')
        ? 'Analytics table is unavailable. Run supabase-analytics-v10.1.sql, then refresh.'
        : `Unable to load report: ${error.message}`;
      return;
    }
    renderAnalytics(analyticsBuildReport(data || [], start, end));
  }

  function analyticsSetPeriod(period) {
    analyticsPeriod = period;
    document.querySelectorAll('[data-report-period]').forEach(button => {
      button.classList.toggle('active', button.dataset.reportPeriod === period);
    });
    const custom = $('analyticsCustomDates');
    if (custom) custom.hidden = period !== 'custom';
    const range = analyticsRangeFor(period === 'custom' ? 'today' : period);
    if (period !== 'custom') analyticsSetCustomDates(range.start, range.end);
    if (period !== 'custom') loadAnalytics();
  }

  function analyticsEmailHtml(report) {
    const period = `${report.start.toLocaleDateString()} – ${report.end.toLocaleDateString()}`;
    const salesRows = report.sales.slice(0, 12).map(item => `<tr><td>${esc(item.productName)}</td><td>${item.sold}</td><td>${money.format(item.revenue)}</td><td>${money.format(item.cost)}</td><td>${money.format(item.profit)}</td></tr>`).join('');
    const alerts = report.lowStock.concat(report.outOfStock.filter(item => !report.lowStock.some(low => low.id === item.id))).slice(0, 12);
    const alertRows = alerts.map(item => `<tr><td>${esc(item.name)}</td><td>${totalUnits(item)}</td><td>${item.lowStockThreshold || 0}</td><td>${esc(item.distributor || '—')}</td></tr>`).join('');
    return `<div class="email-report"><h2>Shelf2 Inventory Report</h2><p>${esc(period)}</p><div class="email-report-grid"><div><strong>${money.format(report.revenue)}</strong><span>Revenue</span></div><div><strong>${money.format(report.cost)}</strong><span>Cost</span></div><div><strong>${money.format(report.profit)}</strong><span>Gross profit</span></div><div><strong>${report.margin.toFixed(1)}%</strong><span>Gross margin</span></div><div><strong>${report.sold}</strong><span>Units sold</span></div><div><strong>${report.received}</strong><span>Units received</span></div></div><h3>Sales performance</h3><table><thead><tr><th>Product</th><th>Units</th><th>Revenue</th><th>Cost</th><th>Profit</th></tr></thead><tbody>${salesRows || '<tr><td colspan="5">No sales recorded.</td></tr>'}</tbody></table><h3>Low/out-of-stock alerts</h3><table><thead><tr><th>Product</th><th>Current</th><th>Alert at</th><th>Distributor</th></tr></thead><tbody>${alertRows || '<tr><td colspan="4">No alerts.</td></tr>'}</tbody></table><p><small>Generated by Shelf2. Financial totals include only removals marked Sale.</small></p></div>`;
  }

  function previewAnalyticsEmail() {
    if (!analyticsReport) {
      toast('Load a report first');
      return;
    }
    $('reportEmailPreview').innerHTML = analyticsEmailHtml(analyticsReport);
    $('reportPreviewModal').classList.add('active');
  }

  function analyticsCsvCell(value) {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportAnalyticsCsv() {
    if (!analyticsReport) {
      toast('Load a report first');
      return;
    }
    const rows = [
      ['Product', 'Barcode', 'Starting', 'Received', 'Sold', 'Other', 'Ending', 'Revenue', 'Cost', 'Gross Profit'],
      ...analyticsReport.products.map(item => [item.productName, item.barcode, item.starting, item.received, item.sold, item.other, item.ending, item.revenue.toFixed(2), item.cost.toFixed(2), item.profit.toFixed(2)])
    ];
    const csv = rows.map(row => row.map(analyticsCsvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shelf2-report-${analyticsDateValue(analyticsReport.start)}-to-${analyticsDateValue(analyticsReport.end)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  document.querySelectorAll('[data-report-period]').forEach(button => {
    button.addEventListener('click', () => analyticsSetPeriod(button.dataset.reportPeriod));
  });
  if ($('analyticsApply')) $('analyticsApply').addEventListener('click', loadAnalytics);
  if ($('previewReportEmail')) $('previewReportEmail').addEventListener('click', previewAnalyticsEmail);
  if ($('exportAnalyticsCsv')) $('exportAnalyticsCsv').addEventListener('click', exportAnalyticsCsv);
  if ($('closeReportPreview')) $('closeReportPreview').addEventListener('click', () => $('reportPreviewModal').classList.remove('active'));
  if ($('reportPreviewModal')) $('reportPreviewModal').addEventListener('click', event => {
    if (event.target.id === 'reportPreviewModal') $('reportPreviewModal').classList.remove('active');
  });
  analyticsSetCustomDates(new Date(), new Date());


  function setCloverMessage(message,type=''){
    const el=$('cloverMessage');
    if(!el)return;
    el.textContent=message||'';
    el.className='profile-message'+(type?' '+type:'');
  }
  function formatCloverDate(value){
    if(!value)return'Never';
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'Never':date.toLocaleString();
  }
  function renderCloverStatus(connection){
    cloverConnection=connection||null;
    const connected=Boolean(connection?.connected);
    const badge=$('cloverStatusBadge');
    if(!badge)return;
    badge.textContent=connected?'Connected':'Not connected';
    badge.className=`clover-status-badge ${connected?'connected':'disconnected'}`;
    $('cloverMerchantName').textContent=connection?.merchant_name||'—';
    $('cloverMerchantId').textContent=connection?.merchant_id||'—';
    $('cloverEnvironment').textContent=(connection?.environment||'sandbox').replace(/^./,c=>c.toUpperCase());
    $('cloverLastVerified').textContent=formatCloverDate(connection?.last_verified_at||connection?.updated_at);
    $('cloverTestBtn').disabled=!connected;
    $('cloverConnectBtn').textContent=connected?'Reconnect Clover sandbox':'Connect Clover sandbox';
  }
  async function loadCloverStatus(showMessage=false){
    if(!isAdmin())return;
    const badge=$('cloverStatusBadge');
    if(badge){badge.textContent='Checking';badge.className='clover-status-badge checking'}
    if(showMessage)setCloverMessage('Checking Clover connection…');
    const {data,error}=await db.rpc('admin_clover_connection_status');
    if(error){
      renderCloverStatus(null);
      setCloverMessage(error.message,'error');
      return;
    }
    const connection=Array.isArray(data)?data[0]:data;
    renderCloverStatus(connection||null);
    if(showMessage)setCloverMessage(connection?.connected?'Connection status refreshed.':'Clover is not connected yet.',connection?.connected?'success':'');
  }
  async function testCloverConnection(){
    if(!isAdmin())return;
    const btn=$('cloverTestBtn');
    btn.disabled=true;
    btn.textContent='Testing…';
    setCloverMessage('Contacting Clover securely through Supabase…');
    const {data,error}=await db.functions.invoke('clover-test',{body:{action:'merchant'}});
    btn.disabled=false;
    btn.textContent='Test connection';
    if(error){
      setCloverMessage(error.message||'Unable to test Clover connection.','error');
      return;
    }
    if(!data?.ok){
      setCloverMessage(data?.error||'Clover connection test failed.','error');
      return;
    }
    setCloverMessage(`Connected to ${data.merchant?.name||'Clover merchant'}. Clover API authentication is working.`,'success');
    await loadCloverStatus(false);
  }
  function startCloverConnect(){
    const returnUrl=new URL(window.location.href);
    returnUrl.search='';
    returnUrl.hash='';
    const url=new URL(CLOVER_CONNECT_URL);
    url.searchParams.set('return_url',returnUrl.toString());
    window.location.assign(url.toString());
  }

  async function renderAdmin(){if(!isAdmin())return;const s=stats();$('dashProducts').textContent=s.products;$('dashUnits').textContent=s.units;$('dashRetail').textContent=money.format(s.retail);$('dashCost').textContent=money.format(s.cost);$('dashProfit').textContent=money.format(s.retail-s.cost);renderManager('category');renderManager('distributor');await loadAdminUsers();const low=inventory.filter(p=>p.lowStockAlertEnabled&&p.lowStockThreshold>0&&totalUnits(p)<=p.lowStockThreshold).sort((a,b)=>(b.lowStockThreshold-totalUnits(b))-(a.lowStockThreshold-totalUnits(a)));$('lowStockList').innerHTML=low.length?low.map(p=>{const current=totalUnits(p),needed=Math.max(0,p.lowStockThreshold-current);return`<div class="alert-item"><div class="alert-name">${esc(p.name)}<small>${esc(p.barcode)}${p.category?' · '+esc(p.category):''}</small></div><div class="alert-stock"><strong>${current} / ${p.lowStockThreshold}</strong><small>Current / threshold</small></div><div class="alert-short">Need ${needed} more</div><div class="alert-extra">${esc(p.distributor||'No distributor')}</div><button class="mini-btn alert-open" data-low-id="${p.id}">Open</button></div>`}).join(''):'<div class="small-note">No low-stock products.</div>';document.querySelectorAll('[data-low-id]').forEach(b=>b.onclick=()=>openPanel(inventory.find(p=>p.id===b.dataset.lowId)));await loadCloverStatus(false);await loadAnalytics();initializeHistoryDates();await loadHistory()}
  $('adminAddCategory').onclick=async()=>{await addList('category',$('adminCategoryName').value);$('adminCategoryName').value='';if(isAdmin())renderAdmin()};$('adminAddDistributor').onclick=async()=>{await addList('distributor',$('adminDistributorName').value);$('adminDistributorName').value='';if(isAdmin())renderAdmin()};
  $('catalogImportBtn').onclick=async()=>{if(!isAdmin())return;const file=$('catalogFile').files[0];if(!file){toast('Choose a Clover Excel file');return}$('catalogImportStatus').textContent='Reading workbook…';try{const buf=await file.arrayBuffer(),book=XLSX.read(buf),sheet=book.Sheets['Items']||book.Sheets[book.SheetNames[0]],rows=XLSX.utils.sheet_to_json(sheet,{defval:''}),valid=new Map();for(const r of rows){const barcode=normalizeBarcode(r['Product Code']),price=Number(r['Price']);if(!barcode||!Number.isFinite(price)||price<0.99||String(r['Hidden']).toLowerCase()==='yes')continue;valid.set(barcode,{barcode,product_name:String(r['Name']||'').trim(),price,cost:Number(r['Cost'])||0,category:String(r['Modifier Groups']||'').trim()||null,distributor:null,updated_at:new Date().toISOString()})}const all=[...valid.values()],chunk=400;for(let i=0;i<all.length;i+=chunk){$('catalogImportStatus').textContent=`Importing ${Math.min(i+chunk,all.length)} of ${all.length}…`;const {error}=await db.from('product_catalog').upsert(all.slice(i,i+chunk),{onConflict:'barcode'});if(error)throw error}const cats=[...new Set(all.map(x=>x.category).filter(Boolean))].map(name=>({name,created_by:currentUser.id}));if(cats.length)await db.from('categories').upsert(cats,{onConflict:'name'});$('catalogImportStatus').textContent=`Imported or updated ${all.length} catalog products. Live inventory was not overwritten.`;await loadLists()}catch(e){$('catalogImportStatus').textContent=`Import failed: ${e.message}`}};
  $('camBtn').onclick=()=>camRunning?stopCamera():startCamera();function startCamera(){$('reader').style.display='block';html5QrCode=new Html5Qrcode('reader');html5QrCode.start({facingMode:'environment'},{fps:10,qrbox:{width:240,height:140}},t=>{stopCamera();handleScan(t)},()=>{}).then(()=>{camRunning=true;$('camBtn').textContent='Turn off'}).catch(e=>{$('camMsg').style.display='block';$('camMsg').textContent='Camera unavailable. Use the scanner input instead.'})}function stopCamera(){if(html5QrCode&&camRunning)html5QrCode.stop().then(()=>{html5QrCode.clear();$('reader').style.display='none';$('camBtn').textContent='Turn on';camRunning=false})}


  if($('cloverConnectBtn'))$('cloverConnectBtn').addEventListener('click',startCloverConnect);
  if($('cloverTestBtn'))$('cloverTestBtn').addEventListener('click',testCloverConnection);
  if($('cloverRefreshBtn'))$('cloverRefreshBtn').addEventListener('click',()=>loadCloverStatus(true));
  const cloverResult=new URLSearchParams(window.location.search).get('clover');
  if(cloverResult){
    window.history.replaceState({},document.title,window.location.pathname+window.location.hash);
    setTimeout(()=>{
      if(currentUser&&isAdmin()){
        switchView('admin');
        setCloverMessage(cloverResult==='connected'?'Clover sandbox connected successfully.':'Clover connection was not completed.',cloverResult==='connected'?'success':'error');
      }
    },700);
  }

})();
