import { useState, useRef } from "react"
import type { InventoryItem } from "../App"
import { supabase, triggerGlobalSync } from "../utils/apiClient"
import { downloadExcelWithAutoFit, parseSpreadsheetFile } from "../utils/excelUtils"
import { Search, FolderPlus, Download, Upload, FileSpreadsheet, X, Trash2, Edit2, Clock, CheckCircle2 } from "lucide-react"

interface InventoryManagerProps {
  inventory: InventoryItem[]
  categoriesList: string[]
  refreshCategories: () => Promise<void>
  refreshInventory: () => Promise<void>
  onUpdateInventory: (item: InventoryItem) => void
  onDeleteProduct: (id: string) => void
  onLogAction?: (actionType: string, moduleTarget: string, details: string) => Promise<void>
}

export function InventoryManager({ 
  inventory, 
  categoriesList, 
  refreshCategories, 
  refreshInventory, 
  onUpdateInventory, 
  onDeleteProduct,
  onLogAction 
}: InventoryManagerProps) {
  const [query, setQuery] = useState("")
  const [catFilter, setCatFilter] = useState("all")
  const [showAdd, setShowAdd] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<InventoryItem | null>(null)
  const [newCatInput, setNewCatInput] = useState("")
  const [isBulkUploading, setIsBulkUploading] = useState(false)
  const [importProgress, setImportProgress] = useState<{
    active: boolean
    totalRows: number
    processedRows: number
    successCount: number
    currentItemName: string
    startTime: number
  }>({
    active: false,
    totalRows: 0,
    processedRows: 0,
    successCount: 0,
    currentItemName: "",
    startTime: 0
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editForm, setEditForm] = useState<Partial<InventoryItem>>({})
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: "",
    category: "unmarked category",
    barcode: "",
    manufacturer: "",
    minStock: 10
  })

  const dynamicCategories = categoriesList.filter(c => c !== "unmarked category")

  const filtered = inventory.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(query.toLowerCase()) || String(item.barcode).includes(query)
    const matchCat = catFilter === "all" || item.category === catFilter
    return matchSearch && matchCat
  })

  const handleDownloadTemplate = () => {
    const headers = ["Barcode", "Product Name", "Category", "Manufacturer", "Procurement Cost", "Retail Price", "Min Safety Stock", "Initial Stock Quantity", "Batch Expiry Date (MM/DD/YYYY or YYYY/DD/MM)"];
    downloadExcelWithAutoFit("pharmacy_inventory_import_template", "Inventory Import Template", headers, [], false);
  };

  const parseDateToISO = (rawDate: string | null): string | null => {
    if (!rawDate) return null
    const cleaned = rawDate.trim()
    if (!cleaned) return null

    const parts = cleaned.split(/[/.-]/)
    if (parts.length === 3) {
      let year = ""
      let month = ""
      let day = ""

      if (parts[0].length === 4) {
        // Year first: YYYY/DD/MM or YYYY/MM/DD
        year = parts[0]
        const p1 = parseInt(parts[1], 10) || 1
        const p2 = parseInt(parts[2], 10) || 1

        if (p1 > 12 && p2 <= 12) {
          day = parts[1].padStart(2, "0")
          month = parts[2].padStart(2, "0")
        } else {
          month = parts[1].padStart(2, "0")
          day = parts[2].padStart(2, "0")
        }
      } else if (parts[2].length === 4 || parts[2].length === 2) {
        // Year last: MM/DD/YYYY or DD/MM/YYYY
        year = parts[2].length === 2 ? `20${parts[2]}` : parts[2]
        const p0 = parseInt(parts[0], 10) || 1
        const p1 = parseInt(parts[1], 10) || 1

        if (p0 > 12 && p1 <= 12) {
          day = parts[0].padStart(2, "0")
          month = parts[1].padStart(2, "0")
        } else {
          month = parts[0].padStart(2, "0")
          day = parts[1].padStart(2, "0")
        }
      }

      if (year && month && day) {
        return `${year}-${month}-${day}`
      }
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return cleaned
    }

    return null
  }

  const parseCSVLine = (text: string): string[] => {
    const delimiter = text.includes(";") && !text.includes(",") ? ";" : ","
    const result: string[] = []
    let cur = ""
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (c === '"') {
        inQuotes = !inQuotes
      } else if (c === delimiter && !inQuotes) {
        result.push(cur.trim().replace(/^"|"$/g, ''))
        cur = ""
      } else {
        cur += c
      }
    }
    result.push(cur.trim().replace(/^"|"$/g, ''))
    return result
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (isBulkUploading || importProgress.active) return

    setIsBulkUploading(true)
    setImportProgress({
      active: false,
      totalRows: 0,
      processedRows: 0,
      successCount: 0,
      currentItemName: "",
      startTime: 0
    })

    try {
      const rows = await parseSpreadsheetFile(file)
      
      if (rows.length <= 1) {
        alert("The file contains no data rows to import.")
        setIsBulkUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
        return
      }

      const totalDataRows = rows.length - 1
      const startTime = Date.now()

      setImportProgress({
        active: true,
        totalRows: totalDataRows,
        processedRows: 0,
        successCount: 0,
        currentItemName: "Initializing spreadsheet parser...",
        startTime
      })

      let successCount = 0

      for (let i = 1; i < rows.length; i++) {
        const columns = rows[i]
        if (!columns || columns.length < 2) {
          setImportProgress(prev => ({ ...prev, processedRows: i }))
          continue
        }

        let barcode = columns[0]?.trim()
        const name = columns[1]?.trim()
        const categoryInput = columns[2]?.trim().toLowerCase()
        const manufacturer = columns[3]?.trim() || null
        const cost = parseFloat(columns[4]) || 0
        const price = parseFloat(columns[5]) || 0
        const minStock = Math.floor(parseFloat(columns[6]) || 10)
        const initialStock = Math.floor(parseFloat(columns[7]) || 0)
        const rawExpiry = columns[8]?.trim() || null
        const expiryDate = parseDateToISO(rawExpiry)

        if (!name) {
          setImportProgress(prev => ({ ...prev, processedRows: i }))
          continue
        }

        setImportProgress(prev => ({
          ...prev,
          processedRows: i,
          currentItemName: name
        }))

        if (!barcode) {
          barcode = `AUTO-${Math.floor(100000 + Math.random() * 900000)}`
        }

        let targetCategory = "unmarked category"
        if (categoryInput && categoryInput !== "unmarked category") {
          const isCategoryExisting = categoriesList.some(c => c.toLowerCase() === categoryInput)
          if (isCategoryExisting) {
            targetCategory = categoryInput
          } else {
            await supabase.from("product_categories").insert({ name: categoryInput })
            targetCategory = categoryInput
          }
        }

        const { data: existingItem } = await supabase
          .from("inventory")
          .select("id, barcode")
          .ilike("name", name)
          .maybeSingle()

        let targetItemId: number | null = existingItem ? Number(existingItem.id) : null

        if (targetItemId) {
          await supabase
            .from("inventory")
            .update({
              barcode: barcode || existingItem?.barcode,
              category: targetCategory,
              manufacturer,
              min_stock: minStock
            })
            .eq("id", targetItemId)
        } else {
          const { data: insertedItem } = await supabase
            .from("inventory")
            .insert({
              barcode,
              name,
              category: targetCategory,
              manufacturer,
              min_stock: minStock
            })
            .select("id")
            .single()

          if (insertedItem) {
            targetItemId = Number(insertedItem.id)
          }
        }

        if (!targetItemId) continue

        if (initialStock > 0) {
          const cleanedName = name.replace(/\s+/g, "").substring(0, 5).toUpperCase()
          const batchLabel = `BULK-${cleanedName}-${Date.now().toString().slice(-4)}`

          await supabase.from("inventory_batches").insert({
            item_id: targetItemId,
            batch_label: batchLabel,
            stock: initialStock,
            cost,
            price,
            expiry_date: expiryDate
          })
        }

        successCount++
        setImportProgress(prev => ({ ...prev, successCount }))
      }

      setImportProgress(prev => ({
        ...prev,
        processedRows: totalDataRows,
        currentItemName: "Finalizing inventory sync..."
      }))

      await refreshCategories()
      await refreshInventory()
      triggerGlobalSync()

      if (onLogAction) {
        await onLogAction("BULK_CSV_IMPORT", "ITEM_SPECIFICATIONS", `Bulk imported ${successCount} stock items from Excel file.`)
      }

      setTimeout(() => {
        setImportProgress(prev => ({ ...prev, active: false }))
        setIsBulkUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }, 1200)

    } catch (err: any) {
      console.error("Excel import error:", err)
      alert(`Error reading file: ${err?.message || "Invalid Excel / CSV file format."}`)
      setImportProgress(prev => ({ ...prev, active: false }))
      setIsBulkUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleAddCategory = async () => {
    const cleaned = newCatInput.trim().toLowerCase()
    if (!cleaned || cleaned === "unmarked category") return
    
    await supabase.from("product_categories").insert({ name: cleaned })
    setNewCatInput("")
    await refreshCategories()
    triggerGlobalSync()
  }

  const handleRemoveCategory = async (catToRemove: string) => {
    if (catToRemove === "unmarked category") return
    if (!window.confirm(`Delete "${catToRemove.toUpperCase()}"? Linked items will move to "unmarked category".`)) return

    await supabase.from("inventory").update({ category: "unmarked category" }).eq("category", catToRemove)
    await supabase.from("product_categories").delete().eq("name", catToRemove)
    
    await refreshCategories()
    await refreshInventory()
    if (catFilter === catToRemove) setCatFilter("all")
    triggerGlobalSync()
  }

  const openEditModal = (item: InventoryItem) => {
    setShowAdd(false)
    setEditingItem(item)
    setEditForm({ ...item })
  }

  const saveEdit = () => {
    if (!editingItem) return
    const targetItem = inventory.find(i => String(i.id) === String(editingItem.id))
    const sanitizedItem: InventoryItem = {
      id: String(editingItem.id),
      name: editForm.name || "",
      category: editForm.category || "unmarked category",
      price: targetItem ? targetItem.price : 0,
      cost: targetItem ? targetItem.cost : 0,
      manufacturer: editForm.manufacturer || "",
      barcode: editForm.barcode || "",
      stock: targetItem ? targetItem.stock : 0,
      minStock: Math.floor(Number(editForm.minStock)) || 10,
      batches: targetItem ? targetItem.batches : []
    }

    onUpdateInventory(sanitizedItem)
    setEditingItem(null)
  }

  const addNewItem = () => {
    if (!newItem.name || !newItem.name.trim()) return
    const item: any = {
      id: "",
      name: newItem.name.trim(),
      category: newItem.category || "unmarked category",
      price: 0,
      cost: 0,
      barcode: newItem.barcode ? newItem.barcode.trim() : "",
      manufacturer: newItem.manufacturer || "",
      stock: 0,
      minStock: Math.floor(Number(newItem.minStock)) || 10,
      batches: []
    }
    
    onUpdateInventory(item)
    setNewItem({ name: "", category: "unmarked category", barcode: "", manufacturer: "", minStock: 10 })
    setShowAdd(false)
  }

  const calculateImportEta = (processed: number, total: number, startTime: number) => {
    if (processed <= 0 || !startTime) return "Calculating..."
    const elapsedSec = (Date.now() - startTime) / 1000
    const rate = processed / elapsedSec
    const remaining = total - processed
    const secLeft = rate > 0 ? Math.ceil(remaining / rate) : 0
    if (secLeft <= 0) return "Finishing up..."
    if (secLeft < 60) return `${secLeft}s remaining`
    const m = Math.floor(secLeft / 60)
    const s = secLeft % 60
    return `${m}m ${s}s remaining`
  }

  return (
    <div className="space-y-4 text-xs font-medium">
      
      {/* Excel Data Imports Header */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Bulk Data Management</h3>
            <p className="text-[10px] text-gray-500">Download blank template or upload Excel (.xlsx, .xls, .csv) files.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg flex items-center gap-1.5 border transition-colors"
          >
            <Download className="w-4 h-4 text-gray-500" />
            Download Blank Template
          </button>

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".csv, .xlsx, .xls, .xlsm, .xlsb, .tsv, .ods, .xml" 
            className="hidden" 
          />

          <button
            type="button"
            disabled={isBulkUploading || importProgress.active}
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4" />
            {isBulkUploading || importProgress.active ? "Processing..." : "Upload Excel / CSV"}
          </button>
        </div>
      </div>

      {/* Categories Controls */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1"><FolderPlus className="w-4 h-4 text-blue-600"/>Manage Categories</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            <input type="text" placeholder="Category name..." value={newCatInput} onChange={e=>setNewCatInput(e.target.value)} className="px-2 py-1.5 border rounded-lg bg-white" />
            <button type="button" onClick={handleAddCategory} className="px-3 py-1.5 bg-blue-600 text-white font-bold rounded-lg">Add</button>
          </div>
          <div className="flex flex-wrap gap-1.5 ml-2 border-l pl-3">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 border font-bold uppercase text-[10px]">
              unmarked category
            </span>
            {dynamicCategories.map(cat => (
              <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 border font-bold uppercase text-[10px]">
                {cat}
                <button type="button" onClick={() => handleRemoveCategory(cat)} className="text-red-500 font-black ml-1 text-xs">×</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Search Header Bar */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input type="text" placeholder="Search product profile templates..." value={query} onChange={e=>setQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 border rounded-lg" />
          </div>
          <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} className="px-4 py-2 border rounded-lg uppercase tracking-wider bg-white">
            <option value="all">All Categories</option>
            <option value="unmarked category">UNMARKED CATEGORY</option>
            {dynamicCategories.map(cat => (<option key={cat} value={cat}>{cat.toUpperCase()}</option>))}
          </select>
          <button onClick={() => { setEditingItem(null); setShowAdd(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-xs transition-colors flex items-center gap-1.5 whitespace-nowrap">
            Add Item Profile
          </button>
        </div>
      </div>

      {/* New Form Overlay Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center border-b pb-2">
              <h2 className="font-bold text-sm text-gray-900">Add New Product Specification</h2>
              <button type="button" onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: "Product Name *", key: "name", type: "text" },
                { label: "Barcode Identity (Optional)", key: "barcode", type: "text" },
                { label: "Manufacturer Brand Name", key: "manufacturer", type: "text" },
                { label: "Minimum Safety Stock Level", key: "minStock", type: "number" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-gray-600 mb-1">{label}</label>
                  <input type={type} value={(newItem as any)[key] || ""} onChange={e=>setNewItem({...newItem, [key]: type==='number'? parseFloat(e.target.value) || 0 : e.target.value})} className="w-full border p-2 rounded-lg" />
                </div>
              ))}
              <div>
                <label className="block text-gray-600 mb-1">Category Group</label>
                <select value={newItem.category || "unmarked category"} onChange={e=>setNewItem({...newItem, category: e.target.value})} className="w-full border p-2 rounded-lg uppercase font-semibold bg-white">
                  <option value="unmarked category">UNMARKED CATEGORY</option>
                  {dynamicCategories.map(cat => (<option key={cat} value={cat}>{cat.toUpperCase()}</option>))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={addNewItem} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-xs">Save Profile</button>
              <button onClick={()=>setShowAdd(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Centered Modal Edit Dialog */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="font-bold text-base text-gray-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" />
                Modify Specifications Template
              </h2>
              <button type="button" onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: "Product Name *", key: "name", type: "text" },
                { label: "Barcode Identity (Optional)", key: "barcode", type: "text" },
                { label: "Manufacturer Brand Name", key: "manufacturer", type: "text" },
                { label: "Minimum Safety Stock Threshold", key: "minStock", type: "number" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-gray-600 mb-1">{label}</label>
                  <input type={type} value={(editForm as any)[key] || ""} onChange={e=>setEditForm({...editForm, [key]: type==='number'? parseFloat(e.target.value) || 0 : e.target.value})} className="w-full border p-2 rounded-lg" />
                </div>
              ))}
              <div>
                <label className="block text-gray-600 mb-1">Category Group</label>
                <select value={editForm.category || "unmarked category"} onChange={e=>setEditForm({...editForm, category: e.target.value})} className="w-full border p-2 rounded-lg uppercase font-semibold bg-white">
                  <option value="unmarked category">UNMARKED CATEGORY</option>
                  {dynamicCategories.map(cat => (<option key={cat} value={cat}>{cat.toUpperCase()}</option>))}
                </select>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button 
                type="button"
                onClick={() => setDeleteConfirmItem(editingItem)} 
                className="px-4 py-2 bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg font-bold flex items-center gap-1.5 hover:bg-red-100 dark:hover:bg-red-900 transition-colors text-xs cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Delete Item
              </button>
              <div className="flex gap-2">
                <button onClick={saveEdit} className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg shadow-xs">Save Changes</button>
                <button onClick={()=>setEditingItem(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmItem && (
        <div 
          onClick={() => setDeleteConfirmItem(null)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border dark:border-slate-700"
          >
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">Delete Product Profile</h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-gray-700 dark:text-slate-300 leading-relaxed bg-gray-50 dark:bg-slate-900 p-3 rounded-lg border dark:border-slate-700">
              Are you sure you want to permanently delete <strong>"{deleteConfirmItem.name}"</strong> from inventory specification templates?
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="flex-1 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl text-xs hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const idToDelete = String(deleteConfirmItem.id)
                  setDeleteConfirmItem(null)
                  if (editingItem && String(editingItem.id) === idToDelete) {
                    setEditingItem(null)
                  }
                  onDeleteProduct(idToDelete)
                }}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs"
              >
                Delete Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Directory Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 overflow-hidden max-h-[580px] overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 dark:bg-slate-900 border-b dark:border-slate-700 sticky top-0 z-10 backdrop-blur-xs">
            <tr>
              <th className="py-3 px-4 text-xs text-gray-600 dark:text-gray-300 font-bold">Product Profile Name</th>
              <th className="py-3 px-4 text-xs text-gray-600 dark:text-gray-300 font-bold">Category</th>
              <th className="py-3 px-4 text-xs text-gray-600 dark:text-gray-300 font-bold">Manufacturer Vendor</th>
              <th className="py-3 px-4 text-xs text-gray-600 dark:text-gray-300 font-bold text-center">Min Stock</th>
              <th className="py-3 px-4 text-xs text-gray-600 dark:text-gray-300 font-bold text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {filtered.map(item => (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                <td className="py-3 px-4">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono mt-0.5">{item.barcode}</p>
                </td>
                <td className="py-3 px-4">
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-gray-100 dark:bg-slate-900 text-gray-700 dark:text-slate-300 border dark:border-slate-700">
                    {item.category}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-700 dark:text-slate-300">{item.manufacturer || "Unspecified"}</td>
                <td className="py-3 px-4 text-gray-700 dark:text-slate-300 font-mono font-bold text-center">{item.minStock}</td>
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <button 
                      type="button"
                      onClick={() => openEditModal(item)} 
                      className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg font-bold hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors inline-flex items-center gap-1 text-xs"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit Specs
                    </button>
                    <button 
                      type="button"
                      onClick={() => setDeleteConfirmItem(item)} 
                      className="p-1.5 bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg font-bold hover:bg-red-100 dark:hover:bg-red-900 transition-colors inline-flex items-center justify-center min-w-[34px] min-h-[34px] cursor-pointer"
                      title="Delete Product Profile"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CSV Import Progress Modal with Time Left */}
      {importProgress.active && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400">
                <Upload className="w-5 h-5 animate-bounce" />
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">Importing Inventory CSV</h3>
              </div>
              <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-800">
                {Math.round((importProgress.processedRows / (importProgress.totalRows || 1)) * 100)}%
              </span>
            </div>

            {/* Progress Bar Container */}
            <div className="space-y-2">
              <div className="w-full h-3 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden p-0.5 border dark:border-slate-600">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-green-500 rounded-full transition-all duration-300 shadow-xs"
                  style={{ width: `${Math.max(4, Math.round((importProgress.processedRows / (importProgress.totalRows || 1)) * 100))}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                <span>{importProgress.processedRows} of {importProgress.totalRows} records</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                  {calculateImportEta(importProgress.processedRows, importProgress.totalRows, importProgress.startTime)}
                </span>
              </div>
            </div>

            {/* Current Item status banner */}
            <div className="p-3 bg-gray-50 dark:bg-slate-900 rounded-xl border dark:border-slate-700 text-xs space-y-1">
              <div className="text-gray-400 dark:text-gray-400 text-[10px] uppercase tracking-wider font-bold">Current Record Processing</div>
              <div className="font-semibold text-gray-800 dark:text-gray-200 truncate flex items-center gap-2">
                {importProgress.processedRows >= importProgress.totalRows ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span className="text-green-600 dark:text-green-400 font-bold">Import Completed! Synchronized {importProgress.successCount} items.</span>
                  </>
                ) : (
                  <span>{importProgress.currentItemName || "Processing CSV rows..."}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}