// Simple POS logic using localStorage
const PRODUCTS_KEY = 'pos_products_v1'
const TRANSACTIONS_KEY = 'pos_transactions_v1'
let products = []
let cart = []
const THEME_KEY = 'pos_theme_v1'

/* Theme handling */
function applyTheme(theme){
  const body = document.body
  if(theme === 'dark') body.classList.add('dark')
  else body.classList.remove('dark')
  try{ localStorage.setItem(THEME_KEY, theme) }catch(e){}
  updateThemeButton()
}

function updateThemeButton(){
  const btn = document.getElementById('theme-toggle')
  if(!btn) return
  const isDark = document.body.classList.contains('dark')
  btn.textContent = isDark ? '☀️' : '🌙'
  btn.title = isDark ? 'Switch to light' : 'Switch to dark'
}

function initTheme(){
  try{
    const saved = localStorage.getItem(THEME_KEY)
    if(saved){ applyTheme(saved); return }
  }catch(e){}
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(prefersDark ? 'dark' : 'light')
}

/* Utilities */
function fmt(n){return Number(n).toLocaleString('id-ID')}
function saveProducts(){localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products))}
function loadProducts(){const s = localStorage.getItem(PRODUCTS_KEY); products = s?JSON.parse(s):[]}
function saveTransactions(arr){localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(arr))}
function loadTransactions(){const s = localStorage.getItem(TRANSACTIONS_KEY); return s?JSON.parse(s):[]}
function seedIfEmpty(){
  loadProducts()
  if(products.length === 0){
    products = [
      {id:1,name:'Pulsa 10.000',price:12000},
      {id:2,name:'Pulsa 20.000',price:21000},
      {id:3,name:'Paket Data 5GB',price:60000},
      {id:4,name:'Paket Data 10GB',price:110000}
    ]
    saveProducts()
  }
}
/* Rendering */
function renderProducts(){const tbody = document.querySelector('#products-table tbody'); tbody.innerHTML=''
  products.forEach(p=>{
    const tr=document.createElement('tr')
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>Rp ${fmt(p.price)}</td>
      <td>
        <div style="display:flex;gap:.4rem;justify-content:flex-end;">
          <button data-id="${p.id}" class="add-to-cart">Tambah</button>
          <button data-id="${p.id}" class="delete-product">Hapus</button>
        </div>
      </td>
    `
    tbody.appendChild(tr)
  })
}

function deleteProduct(id){
  const idx = products.findIndex(p=>p.id==id)
  if(idx === -1) return
  // confirm handled by caller, but double-check
  // remove from products
  products.splice(idx,1)
  // remove any same product from cart
  cart = cart.filter(c=>c.id!=id)
  saveProducts(); renderProducts(); renderCart();
}

function renderCart(){const tbody = document.querySelector('#cart-table tbody'); tbody.innerHTML=''
  cart.forEach((c,i)=>{
    const tr=document.createElement('tr')
    tr.innerHTML = `<td>${c.name}</td><td>${c.qty}</td><td>Rp ${fmt(c.price)}</td><td>Rp ${fmt(c.qty*c.price)}</td><td><button data-index="${i}" class="remove-cart">Hapus</button></td>`
    tbody.appendChild(tr)
  })
  document.getElementById('total').textContent = fmt(cart.reduce((s,it)=>s+it.price*it.qty,0))
}

function renderTransactions(){const tbody = document.querySelector('#transactions-table tbody'); tbody.innerHTML=''
  const tx = loadTransactions()
  // show newest first but keep original array indices for deletion
  tx.slice().reverse().forEach((t, revIndex)=>{
    const originalIndex = tx.length - 1 - revIndex
    const tr=document.createElement('tr')
    tr.innerHTML = `
      <td>${new Date(t.ts).toLocaleString()}</td>
      <td>${t.items.map(i=>i.name+' x'+i.qty).join(', ')}</td>
      <td>Rp ${fmt(t.total)}</td>
      <td><button class="delete-tx" data-index="${originalIndex}">Hapus</button></td>
    `
    tbody.appendChild(tr)
  })
}

function deleteTransaction(index){
  const tx = loadTransactions()
  if(index < 0 || index >= tx.length) return
  tx.splice(index,1)
  saveTransactions(tx)
  renderTransactions()
}

/* Actions */
function addProduct(name,price){const id = products.length?Math.max(...products.map(p=>p.id))+1:1; products.push({id,name,price:Number(price)}); saveProducts(); renderProducts();}

/* Import from spreadsheet (xlsx/csv) using SheetJS (xlsx) */
function importProductsFromRows(rows, hasSubtotal=false){
  if(!Array.isArray(rows) || rows.length===0) return 0
  // Normalize keys for detection (map original key -> lowerKey)
  const first = rows[0]
  const keyMap = {}
  Object.keys(first).forEach(k=> keyMap[k] = k.toLowerCase())
  const findKey = (regex)=> Object.keys(keyMap).find(k=> regex.test(keyMap[k]))
  const nameKey = findKey(/name|nama|product|produk/)
  const priceKey = findKey(/price|harga|rp|amount|price_id/)
  const qtyKey = hasSubtotal ? findKey(/qty|kuantitas|quantity|jumlah|jml/) : null
  const subtotalKey = hasSubtotal ? findKey(/subtotal|sub_total|total/) : null
  let added = 0
  rows.forEach(r=>{
    // get raw values using detected keys or try fallback to first two columns
    let name = nameKey ? r[nameKey] : undefined
    let priceRaw = priceKey ? r[priceKey] : undefined
    if(!name){
      const firstKey = Object.keys(r)[0]
      name = r[firstKey]
    }
    if(priceRaw === undefined){
      const keys = Object.keys(r)
      priceRaw = r[keys[1]]
    }
    if(!name) return
    // sanitize price (remove common separators and non-numeric chars)
    const priceStr = String(priceRaw || '').replace(/[,\s]/g,'').replace(/\.(?=.*\.)/g,'')
    const price = Number(String(priceStr).replace(/[^0-9\.-]/g,'')) || 0
    
    // For Excel files with subtotal, calculate price from subtotal/qty if available
    let finalPrice = price
    if(hasSubtotal && subtotalKey && qtyKey){
      const subtotalRaw = r[subtotalKey]
      const qtyRaw = r[qtyKey]
      if(subtotalRaw && qtyRaw){
        const subtotal = Number(String(subtotalRaw).replace(/[^0-9\.-]/g,'')) || 0
        const qty = Number(String(qtyRaw).replace(/[^0-9\.-]/g,'')) || 1
        if(subtotal > 0 && qty > 0){
          finalPrice = Math.round(subtotal / qty)
        }
      }
    }
    
    addProduct(String(name).trim(), finalPrice)
    added++
  })
  return added
}

function parseCSVText(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length>0)
  if(lines.length===0) return []
  // try comma, semicolon or tab separators
  const sep = lines[0].includes(';') ? ';' : (lines[0].includes('\t') ? '\t' : ',')
  const headers = lines[0].split(sep).map(h=>h.trim())
  const rows = lines.slice(1).map(line=>{
    const cols = line.split(sep)
    const obj = {}
    headers.forEach((h,i)=> obj[h] = (cols[i]||'').trim())
    return obj
  })
  return rows
}

function parseAndImportFile(file){
  if(!file) return
  const name = file.name || ''
  const ext = name.split('.').pop().toLowerCase()
  const reader = new FileReader()
  const statusEl = document.getElementById('import-status')
  const setStatus = (msg, cls)=>{ if(statusEl){ statusEl.textContent = msg; statusEl.className = 'import-status ' + (cls||'') } }
  setStatus('Memproses file...')

  if(ext === 'csv'){
    reader.onload = e=>{
      try{
        const text = e.target.result
        const rows = parseCSVText(text)
        const added = importProductsFromRows(rows)
        if(added) alert(`${added} produk berhasil diimpor.`)
        else alert('Tidak ada produk yang dikenali dalam CSV. Periksa header (nama,harga).')
        setStatus(added? `${added} produk diimpor.` : 'Tidak ada produk diimpor.')
      }catch(err){ console.error(err); alert('Gagal memproses CSV: '+err.message); setStatus('Gagal memproses CSV', 'error') }
    }
    reader.onerror = ()=>{ alert('Gagal membaca file CSV'); setStatus('Gagal membaca file CSV', 'error') }
    reader.readAsText(file,'UTF-8')
    return
  }

  // Excel path (xlsx/xls). Use SheetJS if available; otherwise try to dynamically load it from CDN and parse
  reader.onload = (e)=>{
    const processBinary = ()=>{
      try{
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, {type:'array'})
        const firstSheet = workbook.SheetNames[0]
        const sheet = workbook.Sheets[firstSheet]
        const rows = XLSX.utils.sheet_to_json(sheet, {defval: ''})
        const added = importProductsFromRows(rows, true)
        if(added) alert(`${added} produk berhasil diimpor.`)
        else alert('Tidak ada produk yang dikenali dalam file. Pastikan file memiliki kolom nama dan harga.')
        setStatus(added? `${added} produk diimpor.` : 'Tidak ada produk diimpor.')
      }catch(err){ console.error(err); alert('Gagal membaca file Excel: '+ (err && err.message ? err.message : err)); setStatus('Gagal membaca file Excel', 'error') }
    }

    if(typeof XLSX === 'undefined'){
      setStatus('Memuat library XLSX...')
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js'
      script.onload = ()=>{ setStatus('Library dimuat, memproses file...'); try{ processBinary() }catch(err){ console.error(err); setStatus('Gagal memproses setelah load', 'error') } }
      script.onerror = ()=>{ alert('Gagal memuat library XLSX dari CDN. Coba gunakan file CSV atau periksa koneksi.'); setStatus('Library XLSX gagal dimuat', 'error') }
      document.head.appendChild(script)
    } else {
      processBinary()
    }
  }
  reader.onerror = ()=>{ alert('Gagal membaca file'); setStatus('Gagal membaca file', 'error') }
  reader.readAsArrayBuffer(file)
}

function addToCart(productId){const p = products.find(x=>x.id==productId); if(!p) return alert('Produk tidak ditemukan');
  const inCart = cart.find(c=>c.id==p.id)
  if(inCart){
    inCart.qty++
  } else {
    cart.push({id:p.id,name:p.name,price:p.price,qty:1})
  }
  renderCart()
}

function removeCart(index){cart.splice(index,1); renderCart()}

function clearCart(){cart = []; renderCart()}

function checkout(){if(cart.length===0) return alert('Keranjang kosong');
  const total = cart.reduce((s,it)=>s+it.price*it.qty,0)
  const tx = loadTransactions()
  tx.push({ts:Date.now(),items:cart.map(i=>({id:i.id,name:i.name,qty:i.qty,price:i.price})),total})
  saveTransactions(tx)
  saveProducts();
  clearCart();
  renderProducts();
  renderTransactions();
  alert('Transaksi tercatat. Total: Rp ' + fmt(total))
}

function exportTransactionsCSV(){const tx = loadTransactions(); if(tx.length===0) return alert('Tidak ada transaksi')
  const rows = [['waktu','items','total']]
  tx.forEach(t=>rows.push([new Date(t.ts).toISOString(), t.items.map(i=>i.name+' x'+i.qty).join('; '), t.total]))
  const csv = rows.map(r=>r.map(c=>`"${(''+c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csv],{type:'text/csv'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href=url; a.download = 'transactions.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

function exportTransactionsXLSX(){const tx = loadTransactions(); if(tx.length===0) return alert('Tidak ada transaksi')
  if(typeof XLSX === 'undefined') return alert('Library XLSX tidak tersedia. Muat halaman ulang.')
  const data = [['No.','Waktu','Item','Qty','Harga Satuan','Subtotal']]
  let rowNum = 1
  tx.forEach((t, txIdx)=>{
    t.items.forEach((item, itemIdx)=>{
      const subtotal = item.qty * item.price
      data.push([
        txIdx + 1,
        itemIdx === 0 ? new Date(t.ts).toLocaleString('id-ID') : '',
        item.name,
        item.qty,
        item.price,
        subtotal
      ])
    })
    if(t.items.length > 0){
      data.push(['','','TOTAL TRANSAKSI','','',t.total])
      data.push(['','','','','',''])
    }
  })
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{wch:5},{wch:20},{wch:35},{wch:8},{wch:15},{wch:15}]
  
  // Style header
  const headerStyle = {fill:{fgColor:{rgb:'217B79'}},font:{bold:true,color:{rgb:'FFFFFF'}},alignment:{horizontal:'center',vertical:'center'}}
  for(let col = 0; col < 6; col++){
    const cellRef = XLSX.utils.encode_col(col) + '1'
    if(!ws[cellRef]) ws[cellRef] = {}
    ws[cellRef].s = headerStyle
  }
  
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Transaksi')
  XLSX.writeFile(wb, `transactions_${new Date().toISOString().split('T')[0]}.xlsx`)
}

/* Wiring */
window.addEventListener('DOMContentLoaded', ()=>{
  initTheme();
  seedIfEmpty(); renderProducts(); renderCart(); renderTransactions();

  document.getElementById('add-product-form').addEventListener('submit', e=>{
    e.preventDefault();
    const name = document.getElementById('p-name').value.trim();
    const price = document.getElementById('p-price').value;
    if(!name||!price) return alert('Nama dan harga diperlukan')
    addProduct(name,price)
    e.target.reset()
  })

  // import file handler
  const importInput = document.getElementById('import-file')
  if(importInput){
    importInput.addEventListener('change', e=>{
      const f = e.target.files && e.target.files[0]
      if(f){
        if(!confirm('Impor produk dari file ini? Pastikan kolom berisi nama & harga.')) return
        parseAndImportFile(f)
        importInput.value = ''
      }
    })
  }

  document.querySelector('#products-table tbody').addEventListener('click', e=>{
    if(e.target.classList.contains('add-to-cart')){
      const id = Number(e.target.dataset.id); addToCart(id)
    }
    if(e.target.classList.contains('delete-product')){
      const id = Number(e.target.dataset.id)
      if(Number.isFinite(id) && confirm('Hapus produk ini?')){
        deleteProduct(id)
      }
    }
  })

  document.querySelector('#cart-table tbody').addEventListener('click', e=>{
    if(e.target.classList.contains('remove-cart')){
      removeCart(Number(e.target.dataset.index))
    }
  })

  document.getElementById('checkout').addEventListener('click', ()=>{if(confirm('Lanjutkan pembayaran?')) checkout()})
  document.getElementById('clear-cart').addEventListener('click', ()=>{if(confirm('Kosongkan keranjang?')) clearCart()})
  document.getElementById('export-transactions').addEventListener('click', exportTransactionsCSV)
  document.getElementById('export-transactions-xlsx').addEventListener('click', exportTransactionsXLSX)

  const themeBtn = document.getElementById('theme-toggle')
  if(themeBtn){
    themeBtn.addEventListener('click', ()=>{
      const isDark = document.body.classList.contains('dark')
      applyTheme(isDark? 'light' : 'dark')
    })
    updateThemeButton()
  }

  // transaction delete handler
  const txBody = document.querySelector('#transactions-table tbody')
  if(txBody){
    txBody.addEventListener('click', e=>{
      if(e.target.classList.contains('delete-tx')){
        const idx = Number(e.target.dataset.index)
        if(Number.isFinite(idx) && confirm('Hapus transaksi ini?')){
          deleteTransaction(idx)
        }
      }
    })
  }
})
