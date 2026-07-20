import { useState } from "react"
import type { InventoryItem } from "../App"
import { supabase } from "./apiClient"
import { FolderPlus } from "lucide-react"

interface InventoryManagerProps {
  inventory: InventoryItem[]
  categoriesList: string[]
  refreshCategories: () => Promise<void>
  refreshInventory: () => Promise<void>
  onUpdateInventory: (item: InventoryItem) => void
  onDeleteProduct: (id: string) => void
}

export function InventoryManager({ inventory, categoriesList, refreshCategories, refreshInventory, onUpdateInventory, onDeleteProduct }: InventoryManagerProps) {
  const [query, setQuery] = useState("")
  const [catFilter, setCatFilter] = useState("all")
  const [showAdd, setShowAdd] = useState(false)
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newCatInput, setNewCatInput] = useState("")

  const [editForm, setEditForm] = useState<Partial<InventoryItem>>({})
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: "",
    category: "unmarked category",
    price: 0,
    cost: 0,
    barcode: "",
    manufacturer: ""
  })

  // Filter out unmarked category from the loop to position it manually first
  const dynamicCategories = categoriesList.filter(c => c !== "unmarked category")

  const filtered = inventory.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(query.toLowerCase()) || String(item.barcode).includes(query)
    const matchCat = catFilter === "all" || item.category === catFilter
    return matchSearch && matchCat
  })

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

  const startEdit = (item: InventoryItem) => {
    setShowAdd(false)
    setEditingId(String(item.id))
    setEditForm({ ...item })
    setShowEditPanel(true)
  }

    const saveEdit = () => {
        if (!editingId) return
        const targetItem = inventory.find(i => String(i.id) === editingId)
        const sanitizedItem: InventoryItem = {
        id: editingId,
        name: editForm.name || "",
        category: editForm.category || "unmarked category",
        price: Number(editForm.price) || 0,
        cost: Number(editForm.cost) || 0,
        manufacturer: editForm.manufacturer || "",
        barcode: editForm.barcode || "",
        stock: targetItem ? targetItem.stock : 0,
        minStock: Math.floor(Number(editForm.minStock)) || 10, // Changed line here
        batches: targetItem ? targetItem.batches : []
    }

    onUpdateInventory(sanitizedItem)
    setEditingId(null)
    setShowEditPanel(false)
  }

  const addNewItem = () => {
    if (!newItem.name || !newItem.barcode) return
    const item: any = {
      id: "",
      name: newItem.name!,
      category: newItem.category || "unmarked category",
      price: Number(newItem.price) || 0,
      cost: Number(newItem.cost) || 0,
      barcode: newItem.barcode!,
      manufacturer: newItem.manufacturer || "",
      stock: 0,
      minStock: 10,
      batches: []
    }
    
    onUpdateInventory(item)
    setNewItem({ name: "", category: "unmarked category", price: 0, cost: 0, barcode: "", manufacturer: "" })
    setShowAdd(false)
  }

  return (
    <div className="space-y-4 text-xs font-medium">
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1"><FolderPlus className="w-4 h-4 text-blue-600"/>Manage Categories</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            <input type="text" placeholder="Category name..." value={newCatInput} onChange={e=>setNewCatInput(e.target.value)} className="px-2 py-1.5 border rounded-lg bg-white" />
            <button type="button" onClick={handleAddCategory} className="px-3 py-1.5 bg-blue-600 text-white font-bold rounded-lg">Add</button>
          </div>
          
          <div className="flex flex-wrap gap-1.5 ml-2 border-l pl-3">
            {/* Manually render Unmarked Category right after the divider line */}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 border font-bold uppercase text-[10px]">
              unmarked category
            </span>

            {/* Render the remaining custom system categories fields */}
            {dynamicCategories.map(cat => (
              <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 border font-bold uppercase text-[10px]">
                {cat}
                <button type="button" onClick={() => handleRemoveCategory(cat)} className="text-red-500 font-black ml-1 text-xs">×</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <input type="text" placeholder="Search product profile templates..." value={query} onChange={e=>setQuery(e.target.value)} className="flex-1 p-2 border rounded-lg" />
          <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} className="px-4 py-2 border rounded-lg uppercase tracking-wider bg-white">
            <option value="all">All Categories</option>
            <option value="unmarked category">UNMARKED CATEGORY</option>
            {dynamicCategories.map(cat => (<option key={cat} value={cat}>{cat.toUpperCase()}</option>))}
          </select>
          <button onClick={() => { setShowEditPanel(false); setShowAdd(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold">Add Item Profile</button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-bold text-sm text-gray-900">Add New Product Specification</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: "Product Name *", key: "name", type: "text" },
              { label: "Barcode Identity Check *", key: "barcode", type: "text" },
              { label: "Procurement Supply Cost (₱)", key: "cost", type: "number" },
              { label: "Retail Market Price (₱)", key: "price", type: "number" },
              { label: "Manufacturer Brand Name", key: "manufacturer", type: "text" },
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
          <div className="flex gap-2 pt-2"><button onClick={addNewItem} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-sm">Save Profile</button><button onClick={()=>setShowAdd(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg">Cancel</button></div>
        </div>
      )}

        {showEditPanel && editingId && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
            <h2 className="font-bold text-sm text-gray-900">Modify Specifications Template</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
                { label: "Product Name *", key: "name", type: "text" },
                { label: "Barcode Identity *", key: "barcode", type: "text" },
                { label: "Procurement Supply Cost (₱)", key: "cost", type: "number" },
                { label: "Retail Market Price (₱)", key: "price", type: "number" },
                { label: "Manufacturer Brand Name", key: "manufacturer", type: "text" },
                { label: "Minimum Safety Stock Threshold", key: "minStock", type: "number" }, // Added line here
            ].map(({ label, key, type }) => (
                <div key={key}>
                <label className="block text-gray-600 mb-1">{label}</label>
                <input 
                    type={type} 
                    value={(editForm as any)[key] || ""} 
                    onChange={e => setEditForm({
                    ...editForm, 
                    [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                    })} 
                    className="w-full border p-2 rounded-lg" 
                />
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
            <button onClick={()=>{onDeleteProduct(editingId); setEditingId(null); setShowEditPanel(false);}} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-bold">Delete Item</button>
            <div className="flex gap-2">
                <button onClick={saveEdit} className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg shadow-sm">Save Changes</button>
                <button onClick={()=>setShowEditPanel(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Cancel</button>
            </div>
            </div>
        </div>
        )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>{["Product Profile Name", "Category", "Manufacturer Vendor", "Procurement Cost", "Retail Sale Price", "Actions"].map(h => (<th key={h} className="py-3 px-4 text-xs text-gray-600 font-bold">{h}</th>))}</tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4"><p className="text-sm font-medium text-gray-900">{item.name}</p><p className="text-[10px] text-gray-500 font-mono mt-0.5">{item.barcode}</p></td>
                <td className="py-3 px-4"><span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-gray-100 text-gray-700">{item.category}</span></td>
                <td className="py-3 px-4 text-gray-700">{item.manufacturer || "Unspecified"}</td>
                <td className="py-3 px-4 text-gray-600 font-mono">₱{(item.cost || 0).toFixed(2)}</td>
                <td className="py-3 px-4 text-gray-900 font-bold font-mono">₱{item.price.toFixed(2)}</td>
                <td className="py-3 px-4 text-right"><button onClick={() => startEdit(item)} className="px-3 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded font-bold">Edit Specs</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}