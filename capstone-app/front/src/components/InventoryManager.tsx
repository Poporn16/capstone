import { useState, useRef } from "react"
import type { InventoryItem } from "../App"
import { supabase } from "./apiClient"
import { Search, FolderPlus, Download, Upload, FileSpreadsheet, X, Trash2, Edit2 } from "lucide-react"

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
  const [newCatInput, setNewCatInput] = useState("")
  const [isBulkUploading, setIsBulkUploading] = useState(false)

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
    const csvHeader = "Barcode,Product Name,Category,Manufacturer,Procurement Cost,Retail Price,Min Safety Stock,Initial Stock Quantity,Batch Expiry Date (MM/DD/YYYY or YYYY-MM-DD)\n"
    const blob = new Blob([csvHeader], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", "pharmacy_inventory_import_template.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const parseDateToISO = (rawDate: string | null): string | null => {
    if (!rawDate) return null
    const cleaned = rawDate.trim()
    if (!cleaned) return null

    if (cleaned.includes("/")) {
      const parts = cleaned.split("/")
      if (parts.length === 3) {
        const month = parts[0].padStart(2, "0")
        const day = parts[1].padStart(2, "0")
        const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2]
        return `${year}-${month}-${day}`
      }
    }

    if (cleaned.includes("-")) {
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsBulkUploading(true)
    const reader = new FileReader()

    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string
        const lines = text.split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0)
        
        if (lines.length <= 1) {
          alert("The file contains no data rows to import.")
          setIsBulkUploading(false)
          return
        }

        let successCount = 0

        for (let i = 1; i < lines.length; i++) {
          const columns = parseCSVLine(lines[i])
          if (columns.length < 2) continue

          let barcode = columns[0]?.trim()
          const name = columns[1]?.trim()
          const categoryInput = columns[2]?.trim().toLowerCase()
          const manufacturer = columns[3]?.trim() || null
          const minStock = Math.floor(parseFloat(columns[4]) || 10)
          const batchLabelInput = columns[5]?.trim()
          const initialStock = Math.floor(parseFloat(columns[6]) || 0)
          const cost = parseFloat(columns[7]) || 0
          const price = parseFloat(columns[8]) || 0
          
          const rawExpiry = columns[9]?.trim() || null
          const expiryDate = parseDateToISO(rawExpiry)

          if (!name) continue

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
                barcode: columns[0]?.trim() || existingItem?.barcode || barcode,
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
            const batchLabel = batchLabelInput && batchLabelInput !== "NO-BATCH" 
              ? batchLabelInput 
              : `BULK-${cleanedName}-${Date.now().toString().slice(-4)}`

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
        }

        await refreshCategories()
        await refreshInventory()

        if (onLogAction) {
          await onLogAction("BULK_CSV_IMPORT", "ITEM_SPECIFICATIONS", `Bulk imported/exported stock items from CSV file.`)
        }

        alert(`Successfully synchronized ${successCount} item records with stock batches.`)
      } catch (err) {
        alert("Error reading file. Please save file as CSV (Comma delimited) inside Excel.")
      } finally {
        setIsBulkUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    }

    reader.readAsText(file)
  }

  const handleAddCategory = async () => {
    const cleaned = newCatInput.trim().toLowerCase()
    if (!cleaned || cleaned === "unmarked category") return
    
    await supabase.from("product_categories").insert({ name: cleaned })
    setNewCatInput("")
    await refreshCategories()
  }

  const handleRemoveCategory = async (catToRemove: string) => {
    if (catToRemove === "unmarked category") return
    if (!window.confirm(`Delete "${catToRemove.toUpperCase()}"? Linked items will move to "unmarked category".`)) return

    await supabase.from("inventory").update({ category: "unmarked category" }).eq("category", catToRemove)
    await supabase.from("product_categories").delete().eq("name", catToRemove)
    
    await refreshCategories()
    await refreshInventory()
    if (catFilter === catToRemove) setCatFilter("all")
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
    if (!newItem.name || !newItem.barcode) return
    const item: any = {
      id: "",
      name: newItem.name!,
      category: newItem.category || "unmarked category",
      price: 0,
      cost: 0,
      barcode: newItem.barcode!,
      manufacturer: newItem.manufacturer || "",
      stock: 0,
      minStock: Math.floor(Number(newItem.minStock)) || 10,
      batches: []
    }
    
    onUpdateInventory(item)
    setNewItem({ name: "", category: "unmarked category", barcode: "", manufacturer: "", minStock: 10 })
    setShowAdd(false)
  }

  return (
    <div className="space-y-4 text-xs font-medium">
      
      {/* Excel Data Imports Header */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Bulk Data Management</h3>
            <p className="text-[10px] text-gray-500">Download blank template or upload CSV files.</p>
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
            accept=".csv" 
            className="hidden" 
          />

          <button
            type="button"
            disabled={isBulkUploading}
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {isBulkUploading ? "Processing..." : "Upload CSV"}
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
          <button onClick={() => { setEditingItem(null); setShowAdd(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold">Add Item Profile</button>
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
                { label: "Barcode Identity Check *", key: "barcode", type: "text" },
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
                { label: "Barcode Identity *", key: "barcode", type: "text" },
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
              <button onClick={()=>{onDeleteProduct(String(editingItem.id)); setEditingItem(null);}} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-bold flex items-center gap-1">
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

      {/* Directory Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="py-3 px-4 text-xs text-gray-600 font-bold">Product Profile Name</th>
              <th className="py-3 px-4 text-xs text-gray-600 font-bold">Category</th>
              <th className="py-3 px-4 text-xs text-gray-600 font-bold">Manufacturer Vendor</th>
              <th className="py-3 px-4 text-xs text-gray-600 font-bold text-center">Min Stock</th>
              <th className="py-3 px-4 text-xs text-gray-600 font-bold text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(item => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="py-3 px-4">
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">{item.barcode}</p>
                </td>
                <td className="py-3 px-4">
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-gray-100 text-gray-700 border">
                    {item.category}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-700">{item.manufacturer || "Unspecified"}</td>
                <td className="py-3 px-4 text-gray-700 font-mono font-bold text-center">{item.minStock}</td>
                <td className="py-3 px-4 text-center">
                  <button 
                    onClick={() => openEditModal(item)} 
                    className="px-3 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded font-bold hover:bg-blue-100 transition-colors"
                  >
                    Edit Specs
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}