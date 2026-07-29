(function() {
    const SUPABASE_URL = 'https://palrtkdvdtkqmvkjfuud.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhbHJ0a2R2ZHRrcW12a2pmdXVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwOTEyMjQsImV4cCI6MjEwMDY2NzIyNH0.5gYn9PvkMZFk922qULn4GmCQvgUnHeiES4mSEVe5q0w';
    const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
    const $ = id => document.getElementById(id);
    let inventory = [],
        categories = [],
        distributors = [],
        categoryRecords = [],
        distributorRecords = [],
        manageState = null,
        currentUser = null,
        userRole = 'staff',
        channel = null,
        currentEditId = null,
        pendingBarcode = null,
        scanMode = 'edit',
        quickProduct = null,
        authMode = 'signin',
        html5QrCode = null,
        camRunning = false;
    const money = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    });
    const views = {
        scan: $('view-scan'),
        inventory: $('view-inventory'),
        export: $('view-export'),
        admin: $('view-admin')
    };
    const navBtns = [...document.querySelectorAll('.navbtn')];
    const isAdmin = () => userRole === 'admin';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    } [c]));

    function toast(msg) {
        const t = $('toast');
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 1800)
    }

    function sync(text, error = false) {
        $('syncState').textContent = text;
        $('syncState').style.color = error ? 'var(--rust)' : 'var(--green)'
    }

    function normalizeBarcode(v) {
        return String(v ?? '').trim().replace(/\.0$/, '')
    }

    function sameBarcode(a, b) {
        const x = normalizeBarcode(a),
            y = normalizeBarcode(b);
        return x === y || x.replace(/^0+/, '') === y.replace(/^0+/, '')
    }

    function fromDb(r) {
        return {
            id: r.id,
            barcode: r.barcode,
            name: r.name,
            price: r.price == null ? null : Number(r.price),
            cost: r.cost == null ? null : Number(r.cost),
            category: r.category || '',
            distributor: r.distributor || '',
            floorQty: r.floor_qty || 0,
            backroomQty: r.backroom_qty || 0,
            backroomCases: r.backroom_cases || 0,
            unitsPerCase: r.units_per_case || 0,
            lowStockThreshold: r.low_stock_threshold || 0,
            lowStockAlertEnabled: r.low_stock_alert_enabled !== false,
            status: r.status || 'in_stock',
            updatedAt: new Date(r.updated_at).getTime(),
            updatedBy: r.updated_by
        }
    }
    const caseUnits = p => (p.backroomCases || 0) * (p.unitsPerCase || 0);
    const totalUnits = p => (p.floorQty || 0) + (p.backroomQty || 0) + caseUnits(p);

    function switchView(name) {
        if (name === 'admin' && !isAdmin()) name = 'scan';
        Object.entries(views).forEach(([k, v]) => v && v.classList.toggle('active', k === name));
        navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === name));
        if (name === 'inventory') renderList();
        if (name === 'export') renderStats();
        if (name === 'admin') renderAdmin();
        if (name === 'scan') setTimeout(() => $('gunInput').focus(), 100)
    }
    navBtns.forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

    function applyRoleUI() {
        document.body.classList.toggle('is-admin', isAdmin());
        $('roleChip').style.display = 'inline-block';
        $('roleChip').textContent = isAdmin() ? 'ADMIN' : 'STAFF';
        $('addCategoryBtn').style.display = isAdmin() ? 'block' : 'none';
        $('addDistributorBtn').style.display = isAdmin() ? 'block' : 'none'
    }
    async function loadRole() {
        userRole = 'staff';
        if (!currentUser) return;
        const {
            data,
            error
        } = await db.from('profiles').select('role').eq('id', currentUser.id).maybeSingle();
        if (!error && data?.role) userRole = data.role;
        applyRoleUI()
    }

    function fillSelect(id, vals, selected, label) {
        const el = $(id);
        if (!el) return;
        const clean = [...new Set((vals || []).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        el.innerHTML = `<option value="">${esc(label)}</option>` + clean.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
        if (selected && !clean.includes(selected)) el.insertAdjacentHTML('beforeend', `<option value="${esc(selected)}">${esc(selected)}</option>`);
        el.value = selected || ''
    }
    async function loadLists() {
        const [a, b, c, d] = await Promise.all([
            db.from('categories').select('id,name,active,created_at').order('name'),
            db.from('distributors').select('id,name,active,created_at').order('name'),
            db.from('inventory').select('category,distributor'),
            db.from('product_catalog').select('category,distributor')
        ]);
        categoryRecords = (a.data || []).map(x => ({
            ...x,
            active: x.active !== false
        }));
        distributorRecords = (b.data || []).map(x => ({
            ...x,
            active: x.active !== false
        }));
        const activeCats = categoryRecords.filter(x => x.active).map(x => x.name),
            activeDists = distributorRecords.filter(x => x.active).map(x => x.name);
        categories = [...new Set(activeCats.filter(Boolean))];
        distributors = [...new Set(activeDists.filter(Boolean))];
        fillSelect('fieldCategory', categories, $('fieldCategory').value, 'Uncategorized');
        fillSelect('fieldDistributor', distributors, $('fieldDistributor').value, 'Not assigned');
        fillSelect('reportCategory', categories, $('reportCategory')?.value, 'All categories');
        fillSelect('reportDistributor', distributors, $('reportDistributor')?.value, 'All distributors');
    }
    async function loadInventory() {
        if (!currentUser) return;
        sync('Syncing…');
        const {
            data,
            error
        } = await db.from('inventory').select('*').order('updated_at', {
            ascending: false
        });
        if (error) {
            sync('Sync failed', true);
            toast(error.message);
            return
        }
        inventory = (data || []).map(fromDb);
        await loadLists();
        $('headerCount').textContent = `${inventory.length} item${inventory.length===1?'':'s'}`;
        renderList();
        renderStats();
        if (isAdmin()) await renderAdmin();
        sync('Live')
    }

    function subscribe() {
        if (channel) db.removeChannel(channel);
        channel = db.channel('inventory-live').on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'inventory'
        }, () => loadInventory()).subscribe()
    }

    function findProduct(code) {
        return inventory.find(p => sameBarcode(p.barcode, code))
    }
    async function lookupCatalog(code) {
        const exact = normalizeBarcode(code);
        let {
            data,
            error
        } = await db.from('product_catalog').select('barcode,product_name,price,cost,category,distributor').eq('barcode', exact).maybeSingle();
        if (error) throw error;
        if (!data) {
            const stripped = exact.replace(/^0+/, '');
            if (stripped !== exact) {
                ({
                    data,
                    error
                } = await db.from('product_catalog').select('barcode,product_name,price,cost,category,distributor').eq('barcode', stripped).maybeSingle());
                if (error) throw error
            }
        }
        return data
    }

    function setMode(mode) {
        scanMode = mode;
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
        $('modeHelp').textContent = mode === 'edit' ? 'Scan to open and edit a product.' : mode === 'receive' ? 'Scan an existing product and add received units.' : 'Scan an existing product and remove sold, damaged, or transferred units.';
        $('quickAdjust').classList.remove('active');
        quickProduct = null
    }
    document.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    async function handleScan(raw) {
        const code = normalizeBarcode(raw);
        if (!code) return;
        let p = findProduct(code);
        if (!p) {
            const {
                data,
                error
            } = await db.from('inventory').select('*').eq('barcode', code).maybeSingle();
            if (!error && data) p = fromDb(data)
        }
        if (scanMode !== 'edit') {
            if (!p) {
                toast('Product must be added before quantity adjustment');
                pendingBarcode = code;
                openPanel(null, true);
                return
            }
            quickProduct = p;
            $('quickProductName').textContent = p.name;
            $('quickProductMeta').textContent = `${p.barcode} · ${totalUnits(p)} units on hand`;
            $('quickQty').value = 1;
            $('quickAdjust').classList.add('active');
            return
        }
        if (p) {
            openPanel(p);
            return
        }
        pendingBarcode = code;
        openPanel(null, true)
    }
    $('gunInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const c = e.target.value;
            e.target.value = '';
            handleScan(c)
        }
    });
    $('quickCancel').addEventListener('click', () => {
        $('quickAdjust').classList.remove('active');
        quickProduct = null
    });
    $('quickApply').addEventListener('click', async () => {
        if (!quickProduct) return;
        const qty = Math.max(1, parseInt($('quickQty').value || 1)),
            loc = $('quickLocation').value,
            sign = scanMode === 'receive' ? 1 : -1;
        let updates = {};
        if (loc === 'floor') updates.floor_qty = Math.max(0, quickProduct.floorQty + sign * qty);
        if (loc === 'backroom') updates.backroom_qty = Math.max(0, quickProduct.backroomQty + sign * qty);
        if (loc === 'cases') updates.backroom_cases = Math.max(0, quickProduct.backroomCases + sign * qty);
        updates.status = ((updates.floor_qty ?? quickProduct.floorQty) + (updates.backroom_qty ?? quickProduct.backroomQty) + ((updates.backroom_cases ?? quickProduct.backroomCases) * quickProduct.unitsPerCase) > 0) ? 'in_stock' : 'out_of_stock';
        updates.updated_by = currentUser.id;
        updates.updated_at = new Date().toISOString();
        const {
            error
        } = await db.from('inventory').update(updates).eq('id', quickProduct.id);
        if (error) {
            toast(error.message);
            return
        }
        await db.from('inventory_history').insert({
            inventory_id: quickProduct.id,
            barcode: quickProduct.barcode,
            product_name: quickProduct.name,
            action: scanMode,
            location: loc,
            quantity_change: sign * qty,
            changed_by: currentUser.id
        });
        toast(`${scanMode==='receive'?'Added':'Removed'} ${qty}`);
        $('quickAdjust').classList.remove('active');
        quickProduct = null;
        await loadInventory()
    });
    let lookupSeq = 0;

    function openPanel(p, auto = false) {
        currentEditId = p?.id || null;
        $('panelTitle').textContent = p ? 'Edit product' : 'Add product';
        $('panelBarcode').textContent = p?.barcode || 'New item';
        $('fieldBarcode').value = p?.barcode || pendingBarcode || '';
        $('fieldName').value = p?.name || '';
        $('fieldPrice').value = p?.price ?? '';
        $('fieldCost').value = p?.cost ?? '';
        fillSelect('fieldCategory', categories, p?.category || '', 'Uncategorized');
        fillSelect('fieldDistributor', distributors, p?.distributor || '', 'Not assigned');
        $('fieldFloorQty').value = p?.floorQty || 0;
        $('fieldBackQty').value = p?.backroomQty || 0;
        $('fieldCases').value = p?.backroomCases || 0;
        $('fieldUnitsPerCase').value = p?.unitsPerCase || '';
        $('fieldLowStockEnabled').checked = p?.lowStockAlertEnabled ?? true;
        $('fieldLowStock').value = p?.lowStockThreshold || 0;
        syncLowStockFields();
        setStatus(p?.status || 'in_stock');
        $('panelDelete').style.display = p && isAdmin() ? 'block' : 'none';
        $('panelOverlay').classList.add('active');
        $('lookupStatus').textContent = '';
        updateTotal();
        if (auto) runLookup($('fieldBarcode').value)
    }
    async function runLookup(code) {
        const seq = ++lookupSeq;
        $('lookupStatus').textContent = 'Looking up imported catalog…';
        try {
            const d = await lookupCatalog(code);
            if (seq !== lookupSeq || currentEditId) return;
            if (d) {
                $('fieldName').value = d.product_name || '';
                $('fieldPrice').value = d.price ?? '';
                $('fieldCost').value = d.cost ?? '';
                fillSelect('fieldCategory', categories, d.category || '', 'Uncategorized');
                fillSelect('fieldDistributor', distributors, d.distributor || '', 'Not assigned');
                $('lookupStatus').textContent = 'Found in imported catalog';
                $('lookupStatus').classList.add('found')
            } else $('lookupStatus').textContent = 'No catalog match — enter details manually'
        } catch (e) {
            $('lookupStatus').textContent = `Catalog error: ${e.message}`
        }
    }

    function setStatus(s) {
        $('statusInBtn').classList.toggle('on', s === 'in_stock');
        $('statusOutBtn').classList.toggle('on', s === 'out_of_stock')
    }
    $('statusInBtn').onclick = () => setStatus('in_stock');
    $('statusOutBtn').onclick = () => setStatus('out_of_stock');

    function updateTotal() {
        const f = +$('fieldFloorQty').value || 0,
            b = +$('fieldBackQty').value || 0,
            c = +$('fieldCases').value || 0,
            u = +$('fieldUnitsPerCase').value || 0;
        $('totalLine').textContent = `Total on hand: ${f+b+c*u} units · ${c} unopened case${c===1?'':'s'}`
    }

    function syncLowStockFields() {
        $('lowStockThresholdWrap').classList.toggle('disabled', !$('fieldLowStockEnabled').checked)
    }
    $('fieldLowStockEnabled').onchange = syncLowStockFields;
    [
        ['floorMinus', 'floorPlus', 'fieldFloorQty'],
        ['backMinus', 'backPlus', 'fieldBackQty'],
        ['casesMinus', 'casesPlus', 'fieldCases']
    ].forEach(([m, p, f]) => {
        $(m).onclick = () => {
            $(f).value = Math.max(0, (+$(f).value || 0) - 1);
            updateTotal()
        };
        $(p).onclick = () => {
            $(f).value = (+$(f).value || 0) + 1;
            updateTotal()
        };
        $(f).oninput = updateTotal
    });
    $('fieldUnitsPerCase').oninput = updateTotal;

    function closePanel() {
        $('panelOverlay').classList.remove('active');
        currentEditId = null;
        pendingBarcode = null
    }
    $('panelCancel').onclick = closePanel;
    $('panelOverlay').onclick = e => {
        if (e.target.id === 'panelOverlay') closePanel()
    };
    $('manualAddBtn').onclick = () => openPanel(null);
    async function addList(kind, nameOverride) {
        if (!isAdmin()) {
            toast('Admin access required');
            return
        }
        const label = kind === 'category' ? 'category' : 'distributor',
            name = (nameOverride ?? prompt(`Enter new ${label}:`) ?? '').trim();
        if (!name) return;
        const table = kind === 'category' ? 'categories' : 'distributors';
        const {
            error
        } = await db.from(table).upsert({
            name,
            active: true,
            created_by: currentUser.id
        }, {
            onConflict: 'name'
        });
        if (error) {
            toast(error.message);
            return
        }
        await loadLists();
        toast(`${label} added`)
    }
    $('addCategoryBtn').onclick = () => addList('category');
    $('addDistributorBtn').onclick = () => addList('distributor');
    $('panelSave').onclick = async () => {
        const product = {
            barcode: normalizeBarcode($('fieldBarcode').value),
            name: $('fieldName').value.trim(),
            price: $('fieldPrice').value === '' ? null : Math.max(0, +$('fieldPrice').value),
            cost: $('fieldCost').value === '' ? null : Math.max(0, +$('fieldCost').value),
            category: $('fieldCategory').value || null,
            distributor: $('fieldDistributor').value || null,
            floor_qty: Math.max(0, +$('fieldFloorQty').value || 0),
            backroom_qty: Math.max(0, +$('fieldBackQty').value || 0),
            backroom_cases: Math.max(0, +$('fieldCases').value || 0),
            units_per_case: Math.max(0, +$('fieldUnitsPerCase').value || 0),
            low_stock_threshold: Math.max(0, +$('fieldLowStock').value || 0),
            low_stock_alert_enabled: $('fieldLowStockEnabled').checked,
            status: $('statusOutBtn').classList.contains('on') ? 'out_of_stock' : 'in_stock',
            updated_by: currentUser.id,
            updated_at: new Date().toISOString()
        };
        if (!product.barcode || !product.name) {
            toast('Barcode and product name are required');
            return
        }
        let error;
        if (currentEditId) {
            ({
                error
            } = await db.from('inventory').update(product).eq('id', currentEditId));
            if (!error) await db.from('inventory_history').insert({
                inventory_id: currentEditId,
                barcode: product.barcode,
                product_name: product.name,
                action: 'edit',
                location: 'all',
                quantity_change: 0,
                changed_by: currentUser.id
            })
        } else {
            const r = await db.from('inventory').insert(product).select('id').single();
            error = r.error;
            if (!error) await db.from('inventory_history').insert({
                inventory_id: r.data.id,
                barcode: product.barcode,
                product_name: product.name,
                action: 'create',
                location: 'all',
                quantity_change: product.floor_qty + product.backroom_qty + product.backroom_cases * product.units_per_case,
                changed_by: currentUser.id
            })
        }
        if (error) {
            toast(error.message);
            return
        }
        closePanel();
        toast('Saved');
        await loadInventory()
    };
    $('panelDelete').onclick = async () => {
        if (!isAdmin() || !currentEditId) return;
        const p = inventory.find(x => x.id === currentEditId);
        const {
            error
        } = await db.from('inventory').delete().eq('id', currentEditId);
        if (error) {
            toast(error.message);
            return
        }
        await db.from('inventory_history').insert({
            inventory_id: null,
            barcode: p.barcode,
            product_name: p.name,
            action: 'delete',
            location: 'all',
            quantity_change: -totalUnits(p),
            changed_by: currentUser.id
        });
        closePanel();
        await loadInventory()
    };
    $('searchInput').oninput = renderList;

    function renderList() {
        const q = $('searchInput').value.trim().toLowerCase();
        let rows = inventory.filter(p => !q || [p.name, p.barcode, p.category, p.distributor].some(v => String(v || '').toLowerCase().includes(q)));
        $('listWrap').innerHTML = rows.length ? rows.map(p => `<div class="row" data-id="${p.id}"><div class="info"><div class="name">${esc(p.name)}</div><div class="meta">${esc(p.barcode)}${p.category?' · '+esc(p.category):''}${p.distributor?' · '+esc(p.distributor):''}</div></div><div class="right"><div><div class="qty">${totalUnits(p)}</div><div class="loc">F ${p.floorQty} · B ${p.backroomQty}</div></div><span class="badge ${p.status==='out_of_stock'?'out':'in'}">${p.status==='out_of_stock'?'Out':'In stock'}</span></div></div>`).join('') : `<div class="empty"><div class="icon">📦</div><p>No matching products.</p></div>`;
        document.querySelectorAll('#listWrap .row').forEach(r => r.onclick = () => openPanel(inventory.find(p => p.id === r.dataset.id)))
    }

    function stats(filtered = inventory) {
        return {
            products: filtered.length,
            units: filtered.reduce((s, p) => s + totalUnits(p), 0),
            cases: filtered.reduce((s, p) => s + p.backroomCases, 0),
            out: filtered.filter(p => totalUnits(p) <= 0).length,
            retail: filtered.reduce((s, p) => s + totalUnits(p) * (p.price || 0), 0),
            cost: filtered.reduce((s, p) => s + totalUnits(p) * (p.cost || 0), 0)
        }
    }

    function renderStats() {
        const s = stats();
        $('statTotal').textContent = s.products;
        $('statUnits').textContent = s.units;
        $('statCases').textContent = s.cases;
        $('statOut').textContent = s.out
    }
    $('exportBtn').onclick = () => {
        if (!inventory.length) return toast('Nothing to export');
        const rows = inventory.map(p => ({
            'Barcode': p.barcode,
            'Product Name': p.name,
            'Price': p.price ?? '',
            'Cost': p.cost ?? '',
            'Category': p.category,
            'Distributor': p.distributor,
            'On Floor': p.floorQty,
            'Back Room': p.backroomQty,
            'Cases': p.backroomCases,
            'Units per Case': p.unitsPerCase,
            'Total Units': totalUnits(p),
            'Retail Value': totalUnits(p) * (p.price || 0),
            'Cost Value': totalUnits(p) * (p.cost || 0),
            'Low Stock Alert': p.lowStockAlertEnabled ? 'On' : 'Off',
            'Low Stock Threshold': p.lowStockThreshold,
            'Status': p.status
        }));
        const ws = XLSX.utils.json_to_sheet(rows),
            wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
        XLSX.writeFile(wb, `shelf-inventory-${new Date().toISOString().slice(0,10)}.xlsx`)
    };

    function usageCount(kind, name) {
        const inv = inventory.filter(p => (kind === 'category' ? p.category : p.distributor) === name).length;
        return {
            inventory: inv
        };
    }

    function renderManager(kind) {
        const records = kind === 'category' ? categoryRecords : distributorRecords;
        const el = $(kind === 'category' ? 'adminCategoryList' : 'adminDistributorList');
        if (!records.length) {
            el.innerHTML = '<div class="small-note">No entries yet.</div>';
            return;
        }
        el.innerHTML = records.map(r => {
            const u = usageCount(kind, r.name);
            return `<div class="manager-item ${r.active?'':'inactive-row'}"><div class="manager-main"><div><div class="manager-name">${esc(r.name)}</div><div class="manager-meta">${u.inventory} live inventory product${u.inventory===1?'':'s'} · ${r.active?'Active':'Inactive'}</div></div><div class="manager-actions"><button class="mini-btn" data-manage="rename" data-kind="${kind}" data-name="${esc(r.name)}">Rename</button><button class="mini-btn" data-manage="merge" data-kind="${kind}" data-name="${esc(r.name)}">Merge</button><button class="mini-btn warn" data-manage="toggle" data-kind="${kind}" data-name="${esc(r.name)}">${r.active?'Deactivate':'Activate'}</button><button class="mini-btn danger" data-manage="remove" data-kind="${kind}" data-name="${esc(r.name)}">Remove</button></div></div></div>`
        }).join('');
        el.querySelectorAll('[data-manage]').forEach(b => b.onclick = () => openManage(b.dataset.kind, b.dataset.manage, b.dataset.name));
    }

    function openManage(kind, action, source) {
        const records = kind === 'category' ? categoryRecords : distributorRecords,
            label = kind === 'category' ? 'category' : 'distributor';
        manageState = {
            kind,
            action,
            source
        };
        $('manageModal').classList.add('active');
        $('manageNameWrap').style.display = action === 'rename' ? 'block' : 'none';
        $('manageTargetWrap').style.display = ['merge', 'remove'].includes(action) ? 'block' : 'none';
        $('manageNameInput').value = action === 'rename' ? source : '';
        const alternatives = records.filter(r => r.name !== source && r.active).map(r => r.name);
        $('manageTargetSelect').innerHTML = (action === 'remove' ? `<option value="">${kind==='category'?'Set as Uncategorized':'Set as None'}</option>` : '') + alternatives.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
        const count = usageCount(kind, source).inventory;
        if (action === 'rename') {
            $('manageModalTitle').textContent = `Rename ${label}`;
            $('manageModalText').textContent = `Rename “${source}” everywhere it is used.`;
            $('manageConfirm').textContent = 'Rename'
        }
        if (action === 'merge') {
            $('manageModalTitle').textContent = `Merge ${label}`;
            $('manageModalText').textContent = `Move all products from “${source}” into another ${label}, then remove “${source}”.`;
            $('manageConfirm').textContent = 'Merge'
        }
        if (action === 'toggle') {
            $('manageModalTitle').textContent = `${records.find(r=>r.name===source)?.active?'Deactivate':'Activate'} ${label}`;
            $('manageModalText').textContent = `Inactive entries stay on existing products but no longer appear as choices for new assignments.`;
            $('manageConfirm').textContent = records.find(r => r.name === source)?.active ? 'Deactivate' : 'Activate'
        }
        if (action === 'remove') {
            $('manageModalTitle').textContent = `Remove ${label}`;
            $('manageModalText').textContent = `“${source}” is used by ${count} live inventory product${count===1?'':'s'}. Choose where those products should go before removal.`;
            $('manageConfirm').textContent = 'Remove'
        }
        $('manageModalNote').textContent = action === 'merge' && !alternatives.length ? `Create another active ${label} before merging.` : '';
        $('manageConfirm').disabled = action === 'merge' && !alternatives.length;
    }

    function closeManage() {
        $('manageModal').classList.remove('active');
        manageState = null;
        $('manageConfirm').disabled = false
    }
    $('manageCancel').onclick = closeManage;
    $('manageModal').onclick = e => {
        if (e.target === $('manageModal')) closeManage()
    };
    $('manageConfirm').onclick = async () => {
        if (!manageState) return;
        const {
            kind,
            action,
            source
        } = manageState;
        let target = null;
        if (action === 'rename') {
            target = $('manageNameInput').value.trim();
            if (!target) return toast('Enter a new name');
            if (target.toLowerCase() === source.toLowerCase()) return closeManage()
        }
        if (['merge', 'remove'].includes(action)) target = $('manageTargetSelect').value || null;
        const records = kind === 'category' ? categoryRecords : distributorRecords,
            active = records.find(r => r.name === source)?.active !== false;
        const params = {
            p_kind: kind,
            p_action: action,
            p_source: source,
            p_target: target,
            p_active: action === 'toggle' ? !active : null
        };
        $('manageConfirm').disabled = true;
        const {
            error
        } = await db.rpc('manage_reference_value', params);
        $('manageConfirm').disabled = false;
        if (error) {
            toast(error.message);
            return
        }
        closeManage();
        await loadInventory();
        toast(`${kind==='category'?'Category':'Distributor'} updated`);
    };
    async function renderAdmin() {
        if (!isAdmin()) return;
        const s = stats();
        $('dashProducts').textContent = s.products;
        $('dashUnits').textContent = s.units;
        $('dashRetail').textContent = money.format(s.retail);
        $('dashCost').textContent = money.format(s.cost);
        $('dashProfit').textContent = money.format(s.retail - s.cost);
        renderManager('category');
        renderManager('distributor');
        const low = inventory.filter(p => p.lowStockAlertEnabled && p.lowStockThreshold > 0 && totalUnits(p) <= p.lowStockThreshold).sort((a, b) => (b.lowStockThreshold - totalUnits(b)) - (a.lowStockThreshold - totalUnits(a)));
        $('lowStockList').innerHTML = low.length ? low.map(p => {
            const current = totalUnits(p),
                needed = Math.max(0, p.lowStockThreshold - current);
            return `<div class="alert-item"><div class="alert-name">${esc(p.name)}<small>${esc(p.barcode)}${p.category?' · '+esc(p.category):''}</small></div><div class="alert-stock"><strong>${current} / ${p.lowStockThreshold}</strong><small>Current / threshold</small></div><div class="alert-short">Need ${needed} more</div><div class="alert-extra">${esc(p.distributor||'No distributor')}</div><button class="mini-btn alert-open" data-low-id="${p.id}">Open</button></div>`
        }).join('') : '<div class="small-note">No low-stock products.</div>';
        document.querySelectorAll('[data-low-id]').forEach(b => b.onclick = () => openPanel(inventory.find(p => p.id === b.dataset.lowId)));
        renderReports();
        const {
            data
        } = await db.from('inventory_history').select('*').order('changed_at', {
            ascending: false
        }).limit(5);
        $('historyRows').innerHTML = (data || []).map(h => `<tr><td>${new Date(h.changed_at).toLocaleString()}</td><td>${esc(h.product_name||h.barcode)}</td><td>${esc(h.action)}</td><td>${h.quantity_change>0?'+':''}${h.quantity_change} ${esc(h.location||'')}</td><td>${esc(h.changed_by_email||'User')}</td></tr>`).join('') || '<tr><td colspan="5">No history yet.</td></tr>'
    }

    function renderReports() {
        const cat = $('reportCategory').value,
            dist = $('reportDistributor').value,
            filtered = inventory.filter(p => (!cat || p.category === cat) && (!dist || p.distributor === dist)),
            groups = {};
        filtered.forEach(p => {
            const k = p.category || 'Uncategorized';
            (groups[k] ??= []).push(p)
        });
        $('reportRows').innerHTML = Object.entries(groups).sort().map(([k, v]) => {
            const s = stats(v);
            return `<tr><td>${esc(k)}</td><td>${s.products}</td><td>${s.units}</td><td>${money.format(s.retail)}</td><td>${money.format(s.cost)}</td></tr>`
        }).join('') || '<tr><td colspan="5">No report data.</td></tr>'
    }
    $('reportCategory').onchange = renderReports;
    $('reportDistributor').onchange = renderReports;
    $('adminAddCategory').onclick = async () => {
        await addList('category', $('adminCategoryName').value);
        $('adminCategoryName').value = '';
        if (isAdmin()) renderAdmin()
    };
    $('adminAddDistributor').onclick = async () => {
        await addList('distributor', $('adminDistributorName').value);
        $('adminDistributorName').value = '';
        if (isAdmin()) renderAdmin()
    };
    $('catalogImportBtn').onclick = async () => {
        if (!isAdmin()) return;
        const file = $('catalogFile').files[0];
        if (!file) {
            toast('Choose a Clover Excel file');
            return
        }
        $('catalogImportStatus').textContent = 'Reading workbook…';
        try {
            const buf = await file.arrayBuffer(),
                book = XLSX.read(buf),
                sheet = book.Sheets['Items'] || book.Sheets[book.SheetNames[0]],
                rows = XLSX.utils.sheet_to_json(sheet, {
                    defval: ''
                }),
                valid = new Map();
            for (const r of rows) {
                const barcode = normalizeBarcode(r['Product Code']),
                    price = Number(r['Price']);
                if (!barcode || !Number.isFinite(price) || price < 0.99 || String(r['Hidden']).toLowerCase() === 'yes') continue;
                valid.set(barcode, {
                    barcode,
                    product_name: String(r['Name'] || '').trim(),
                    price,
                    cost: Number(r['Cost']) || 0,
                    category: String(r['Modifier Groups'] || '').trim() || null,
                    distributor: null,
                    updated_at: new Date().toISOString()
                })
            }
            const all = [...valid.values()],
                chunk = 400;
            for (let i = 0; i < all.length; i += chunk) {
                $('catalogImportStatus').textContent = `Importing ${Math.min(i+chunk,all.length)} of ${all.length}…`;
                const {
                    error
                } = await db.from('product_catalog').upsert(all.slice(i, i + chunk), {
                    onConflict: 'barcode'
                });
                if (error) throw error
            }
            const cats = [...new Set(all.map(x => x.category).filter(Boolean))].map(name => ({
                name,
                created_by: currentUser.id
            }));
            if (cats.length) await db.from('categories').upsert(cats, {
                onConflict: 'name'
            });
            $('catalogImportStatus').textContent = `Imported or updated ${all.length} catalog products. Live inventory was not overwritten.`;
            await loadLists()
        } catch (e) {
            $('catalogImportStatus').textContent = `Import failed: ${e.message}`
        }
    };
    $('camBtn').onclick = () => camRunning ? stopCamera() : startCamera();

    function startCamera() {
        $('reader').style.display = 'block';
        html5QrCode = new Html5Qrcode('reader');
        html5QrCode.start({
            facingMode: 'environment'
        }, {
            fps: 10,
            qrbox: {
                width: 240,
                height: 140
            }
        }, t => {
            stopCamera();
            handleScan(t)
        }, () => {}).then(() => {
            camRunning = true;
            $('camBtn').textContent = 'Turn off'
        }).catch(e => {
            $('camMsg').style.display = 'block';
            $('camMsg').textContent = 'Camera unavailable. Use the scanner input instead.'
        })
    }

    function stopCamera() {
        if (html5QrCode && camRunning) html5QrCode.stop().then(() => {
            html5QrCode.clear();
            $('reader').style.display = 'none';
            $('camBtn').textContent = 'Turn on';
            camRunning = false
        })
    }

    function showAuthMessage(message, type = 'error') {
        $('authError').textContent = message;
        $('authError').className = 'auth-error' + (type === 'success' ? ' success' : type === 'info' ? ' info' : '')
    }

    function setAuthMode(m) {
        authMode = m;
        const s = m === 'signin';
        $('authSignInTab').className = 'btn ' + (s ? 'btn-ink' : 'btn-line');
        $('authSignUpTab').className = 'btn ' + (!s ? 'btn-ink' : 'btn-line');
        $('authSubmit').textContent = s ? 'Sign in' : 'Create account';
        $('authConfirmWrap').classList.toggle('visible', !s);
        $('authPassword').autocomplete = s ? 'current-password' : 'new-password';
        $('authConfirmPassword').value = '';
        showAuthMessage('', 'info')
    }
    $('authSignInTab').onclick = () => setAuthMode('signin');
    $('authSignUpTab').onclick = () => setAuthMode('signup');
    $('authSubmit').onclick = async () => {
        const email = $('authEmail').value.trim(),
            password = $('authPassword').value,
            confirmPassword = $('authConfirmPassword').value,
            button = $('authSubmit');
        showAuthMessage('', 'info');
        if (!email || password.length < 6) return showAuthMessage('Enter a valid email and a password with at least 6 characters.');
        if (authMode === 'signup' && password !== confirmPassword) return showAuthMessage('Passwords do not match. Please enter the same password twice.');
        button.disabled = true;
        button.textContent = authMode === 'signin' ? 'Signing in…' : 'Creating account…';
        try {
            if (authMode === 'signin') {
                const {
                    error
                } = await db.auth.signInWithPassword({
                    email,
                    password
                });
                if (error) showAuthMessage(error.message)
            } else {
                const redirectTo = window.location.origin + window.location.pathname;
                const {
                    data,
                    error
                } = await db.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: redirectTo
                    }
                });
                if (error) return showAuthMessage(error.message);
                $('authPassword').value = '';
                $('authConfirmPassword').value = '';
                if (data.session) {
                    showAuthMessage('Account created successfully. Email verification is currently not required, so you have been signed in.', 'success')
                } else {
                    showAuthMessage(`Verification email sent to ${email}. Open the email and click the confirmation link before signing in.`, 'success')
                }
            }
        } finally {
            button.disabled = false;
            button.textContent = authMode === 'signin' ? 'Sign in' : 'Create account'
        }
    };
    $('authPassword').addEventListener('keydown', e => {
        if (e.key === 'Enter') $('authSubmit').click()
    });
    $('authConfirmPassword').addEventListener('keydown', e => {
        if (e.key === 'Enter') $('authSubmit').click()
    });
    $('signOutBtn').onclick = () => db.auth.signOut();
    async function applySession(session) {
        currentUser = session?.user || null;
        $('authOverlay').classList.toggle('hidden', !!currentUser);
        $('signOutBtn').style.display = currentUser ? 'block' : 'none';
        $('userEmail').textContent = currentUser?.email || '';
        if (currentUser) {
            await loadRole();
            subscribe();
            await loadInventory()
        } else {
            inventory = [];
            userRole = 'staff';
            document.body.classList.remove('is-admin');
            sync('Offline')
        }
    }
    db.auth.onAuthStateChange((e, s) => applySession(s));
    db.auth.getSession().then(({
        data
    }) => applySession(data.session));
})();