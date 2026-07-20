import { useState, useEffect } from "react"
import type { InventoryItem } from "../App"
import { supabase } from "./apiClient"
import { Plus, Minus, Layers, AlertCircle, Trash2, Calendar } from "lucide-react"

interface StockAdjustmentProps {
  inventory: InventoryItem[]
  categoriesList: string[]
  fetchInventory: () => Promise<void>
  onLogAction?: (actionType: string, moduleTarget: string, details: string) => Promise<void>
}

export function StockAdjustment({ inventory, categoriesList, fetchInventory, onLogAction }: StockAdjustmentProps) {
  const [query, setQuery] = useState("")
  const [catFilter, setCatFilter] = useState("all")
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  
  const [batchLabel, setBatchLabel] = useState("")
  const [batchQty, setBatchQty] = useState<string>("")
  const [expiryDate, setExpiryDate] = useState("")
  
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [localQuantities, setLocalQuantities] = useState<Record<string, string>>({})

  const dynamicCategories = categoriesList.filter(c => c !== "unmarked category")

  useEffect(() => {
    if (inventory && selectedItem) {
      const freshItem = inventory.find(i => i.id === selectedItem.id)
      if (freshItem) {
        setSelectedItem(freshItem)
      }
    }
  }, [inventory])

  useEffect(() => {
    if (selectedItem) {
      const cleanedName = selectedItem.name.replace(/\s+/g, "").substring(0, 5).toUpperCase()
      const timestampString = Date.now().toString().slice(-4)
      setBatchLabel(`LOT-${cleanedName}-${timestampString}`)
    } else {
      setBatchLabel("")
    }
    setBatchQty("")
    setExpiryDate("")
    setLocalQuantities({})
    setErrorMessage(null)
  }, [selectedItem])

  const filtered = inventory.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(query.toLowerCase()) || String(item.barcode).includes(query)
    const matchCat = catFilter === "all" || item.category === catFilter
    return matchSearch && matchCat
  })

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsedQty = Math.floor(parseFloat(batchQty) || 0)
    
    if (!selectedItem || !batchLabel.trim() || parsedQty <= 0) {
      setErrorMessage("Please enter a valid batch name and quantity greater than zero.")
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)

    const { error } = await supabase
      .from("inventory_batches")
      .insert({
        item_id: Number(selectedItem.id),
        batch_label: batchLabel.trim().toUpperCase(),
        stock: parsedQty,
        expiry_date: expiryDate || null
      })

    if (error) {
      setErrorMessage("Database anomaly encountered while creating new product batch.")
      setIsProcessing(false)
      return
    }

    if (onLogAction) {
      const logDetails = `Added new batch "${batchLabel.toUpperCase()}" with ${parsedQty} units for item "${selectedItem.name}" (Expiry: ${expiryDate || "None"})`
      await onLogAction("ADD_BATCH", "INVENTORY_MANAGEMENT", logDetails)
    }

    setBatchQty("")
    setExpiryDate("")
    await fetchInventory()
    setIsProcessing(false)
  }

  const handleModifyBatchStock = async (batchId: string, currentStock: number, delta: number, batchName: string) => {
    const nextStock = currentStock + delta
    if (nextStock < 0 || !selectedItem) return

    if (nextStock === 0) {
      await handleDeleteBatch(batchId, batchName)
    } else {
      await supabase.from("inventory_batches").update({ stock: nextStock }).eq("id", Number(batchId))
      
      if (onLogAction) {
        const actionTag = delta > 0 ? "INCREMENT_STOCK" : "DECREMENT_STOCK"
        const direction = delta > 0 ? "Increased" : "Decreased"
        await onLogAction(actionTag, "INVENTORY_MANAGEMENT", `${direction} batch "${batchName}" stock by ${Math.abs(delta)} unit(s) for item "${selectedItem.name}". New batch stock: ${nextStock}`)
      }
      await fetchInventory()
    }
  }

  const handleDirectInputChange = async (batchId: string, currentStock: number, typedValue: string, batchName: string) => {
    if (!selectedItem) return
    
    if (typedValue === "") {
      await supabase.from("inventory_batches").update({ stock: 0 }).eq("id", Number(batchId))
      await fetchInventory()
      return
    }

    let nextStock = Math.floor(parseInt(typedValue) || 0)
    if (nextStock < 0) nextStock = 0

    if (nextStock === 0) {
      await handleDeleteBatch(batchId, batchName)
    } else {
      await supabase.from("inventory_batches").update({ stock: nextStock }).eq("id", Number(batchId))
      if (onLogAction) {
        await onLogAction("DIRECT_STOCK_EDIT", "INVENTORY_MANAGEMENT", `Overwrote batch "${batchName}" stock level from ${currentStock} to ${nextStock} for item "${selectedItem.name}"`)
      }
      await fetchInventory()
    }
  }

  const handleUpdateBatchExpiry = async (batchId: string, oldExpiry: string, newExpiry: string, batchName: string) => {
    if (!selectedItem) return
    const sanitizedExpiry = newExpiry || null

    await supabase
      .from("inventory_batches")
      .update({ expiry_date: sanitizedExpiry })
      .eq("id", Number(batchId))

    if (onLogAction) {
      await onLogAction("EDIT_BATCH_EXPIRY", "INVENTORY_MANAGEMENT", `Updated batch "${batchName}" expiration date threshold from "${oldExpiry || 'None'}" to "${newExpiry || 'None'}" for item "${selectedItem.name}"`)
    }
    await fetchInventory()
  }

  const handleDeleteBatch = async (batchId: string, batchName: string) => {
    if (!selectedItem) return
    if (!window.confirm(`Are you sure you want to remove batch record "${batchName}" from the tracking system parameters completely?`)) {
      await fetchInventory()
      return
    }

    await supabase.from("inventory_batches").delete().eq("id", Number(batchId))
    
    if (onLogAction) {
      await onLogAction("DELETE_BATCH", "INVENTORY_MANAGEMENT", `Removed batch "${batchName}" for item "${selectedItem.name}"`)
    }
    await fetchInventory()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs font-medium">
      
      <div className="lg:col-span-1 bg-white p-4 rounded-xl border shadow-sm space-y-4 flex flex-col h-[520px]">
        <h3 className="font-bold text-gray-800 text-sm tracking-wide">Stock Registry Directory</h3>
        
        <div className="space-y-2">
          <input 
            type="text" 
            placeholder="Search matching barcode or name..." 
            value={query} 
            onChange={e => setQuery(e.target.value)} 
            className="w-full p-2 border rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" 
          />
          <select 
            value={catFilter} 
            onChange={e => setCatFilter(e.target.value)} 
            className="w-full p-2 border rounded-lg uppercase bg-white text-xs font-bold"
          >
            <option value="all">All Categories</option>
            <option value="unmarked category">UNMARKED CATEGORY</option>
            {dynamicCategories.map(cat => (<option key={cat} value={cat}>{cat.toUpperCase()}</option>))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filtered.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No system products match current filters.</p>
          ) : (
            filtered.map(item => {
              const isLow = item.stock <= item.minStock
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className={`w-full text-left p-3 border rounded-xl transition-all flex justify-between items-center bg-white ${selectedItem?.id === item.id ? 'border-blue-500 bg-blue-50/10 shadow-xs' : 'border-gray-100 hover:bg-gray-50/80'}`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-gray-900 truncate">{item.name}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{item.barcode} • {item.category.toUpperCase()}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${isLow ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                      {item.stock} units
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4 flex flex-col">
        {!selectedItem ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400 flex flex-col items-center justify-center flex-1 min-h-[400px]">
            <Layers className="w-8 h-8 text-gray-300 mb-2" />
            <p className="font-semibold text-sm">No Active Selection Made</p>
            <p className="text-[11px] mt-0.5">Please click on any product profile row template from the side panel to adjust batch counts.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 items-start">
            
            <div className="md:col-span-2 bg-white rounded-xl border shadow-sm p-4 space-y-4 min-h-[520px] flex flex-col">
              <div className="border-b pb-3 flex justify-between items-start">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 leading-tight">{selectedItem.name}</h2>
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">Barcode reference token: #{selectedItem.barcode}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 bg-gray-100 rounded-md text-gray-600">
                    Min Safe Level: {selectedItem.minStock}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                <h4 className="font-bold text-gray-700 text-xs tracking-wide">Active Batch Assignments</h4>
                
                {selectedItem.batches.length === 0 ? (
                  <p className="text-gray-400 text-center py-12 bg-gray-50/50 border border-dashed rounded-xl">No active batches assigned. Create a batch on the right to add stock quantities.</p>
                ) : (
                  selectedItem.batches.map(batch => {
                    const isExpired = batch.expiryDate && new Date(batch.expiryDate).getTime() < new Date().getTime()
                    const displayValue = localQuantities[batch.id] !== undefined ? localQuantities[batch.id] : batch.stock

                    return (
                      <div key={batch.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-between transition-colors hover:bg-gray-50/80 gap-4">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="font-bold text-gray-900 font-mono text-xs truncate">{batch.batchLabel}</p>
                          
                          {/* Inline Dynamic Expiry Date Modification Field */}
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <Calendar className="w-3 h-3 flex-shrink-0 text-gray-400" />
                            <input 
                              type="date"
                              value={batch.expiryDate || ""}
                              onChange={e => handleUpdateBatchExpiry(batch.id, batch.expiryDate, e.target.value, batch.batchLabel)}
                              className={`p-0.5 border rounded font-mono text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${isExpired ? 'text-red-600 border-red-200 font-bold bg-red-50/30' : ''}`}
                            />
                            {!batch.expiryDate && <span className="text-[9px] text-gray-400 italic">No Expiry Track Date</span>}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button 
                            type="button" 
                            onClick={() => handleModifyBatchStock(batch.id, batch.stock, -1, batch.batchLabel)}
                            className="w-6 h-6 border bg-white text-gray-600 font-bold rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors shadow-xs"
                            title="Minus 1 Unit"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          
                          <input
                            type="text"
                            value={displayValue}
                            onChange={e => {
                              const inputVal = e.target.value
                              const cleanVal = inputVal.replace(/[^0-9]/g, "")
                              setLocalQuantities(prev => ({ ...prev, [batch.id]: cleanVal }))
                            }}
                            onBlur={() => {
                              const finalVal = localQuantities[batch.id]
                              if (finalVal !== undefined) {
                                handleDirectInputChange(batch.id, batch.stock, finalVal, batch.batchLabel)
                                setLocalQuantities(prev => {
                                  const next = { ...prev }
                                  delete next[batch.id]
                                  return next
                                })
                              }
                            }}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                const finalVal = localQuantities[batch.id]
                                if (finalVal !== undefined) {
                                  handleDirectInputChange(batch.id, batch.stock, finalVal, batch.batchLabel)
                                  setLocalQuantities(prev => {
                                    const next = { ...prev }
                                    delete next[batch.id]
                                    return next
                                  })
                                }
                                ;(e.target as HTMLInputElement).blur()
                              }
                            }}
                            className="w-12 text-center font-mono font-bold text-xs text-gray-900 bg-white border h-6 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          
                          <button 
                            type="button" 
                            onClick={() => handleModifyBatchStock(batch.id, batch.stock, 1, batch.batchLabel)}
                            className="w-6 h-6 border bg-white text-gray-600 font-bold rounded-lg flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-colors shadow-xs"
                            title="Add 1 Unit"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>

                          {/* Dedicated Explicit Remove Batch Option row control button */}
                          <button 
                            type="button" 
                            onClick={() => handleDeleteBatch(batch.id, batch.batchLabel)}
                            className="w-6 h-6 border border-red-100 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-100 hover:text-red-700 transition-colors shadow-xs ml-1"
                            title="Remove Batch completely"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4 h-fit">
              <h4 className="font-bold text-gray-800 text-xs tracking-wide flex items-center gap-1.5 border-b pb-2">
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                Provision New Batch
              </h4>

              {errorMessage && (
                <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-600 flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleCreateBatch} className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-gray-500 font-bold uppercase text-[9px] tracking-wider">Batch Lot Code Label *</label>
                  <input 
                    type="text" 
                    required 
                    disabled={isProcessing}
                    placeholder="Auto generated lot name..." 
                    value={batchLabel}
                    onChange={e => setBatchLabel(e.target.value)}
                    className="w-full p-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-gray-500 font-bold uppercase text-[9px] tracking-wider">Initial Stock Units Quantity *</label>
                  <input 
                    type="text" 
                    required 
                    disabled={isProcessing}
                    placeholder="Type initial quantity..." 
                    value={batchQty}
                    onChange={e => {
                      const inputVal = e.target.value
                      const cleanVal = inputVal.replace(/[^0-9]/g, "")
                      setBatchQty(cleanVal)
                    }}
                    className="w-full p-2 border border-gray-200 rounded-lg text-xs bg-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-gray-500 font-bold uppercase text-[9px] tracking-wider">Product Expiration Date</label>
                  <input 
                    type="date" 
                    disabled={isProcessing}
                    value={expiryDate}
                    onChange={e => setExpiryDate(e.target.value)}
                    className="w-full p-2 border border-gray-200 rounded-lg text-xs bg-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" 
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={isProcessing || !batchLabel.trim() || !batchQty || parseInt(batchQty) <= 0}
                  className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-lg shadow-sm text-xs tracking-wide transition-opacity disabled:opacity-50"
                >
                  {isProcessing ? "Adding Lot Record..." : "Register Batch Inventory"}
                </button>
              </form>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}