import { useState, useEffect, useRef } from "react"
import type { InventoryItem } from "../App"
import { supabase } from "./apiClient"
import { Plus, Minus, Layers, AlertCircle, Trash2, Calendar, Download, Upload, FileSpreadsheet } from "lucide-react"

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
  const [batchCost, setBatchCost] = useState<string>("")
  const [batchPrice, setBatchPrice] = useState<string>("")
  const [expiryDate, setExpiryDate] = useState("")
  
  const [isProcessing, setIsProcessing] = useState(false)
  const [isBulkUploading, setIsBulkUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [localQuantities, setLocalQuantities] = useState<Record<string, string>>({})
  const [localCosts, setLocalCosts] = useState<Record<string, string>>({})
  const [localPrices, setLocalPrices] = useState<Record<string, string>>({})

  const fileInputRef = useRef<HTMLInputElement>(null)

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
      setBatchCost("")
      setBatchPrice("")
    } else {
      setBatchLabel("")
      setBatchCost("")
      setBatchPrice("")
    }
    setBatchQty("")
    setExpiryDate("")
    setLocalQuantities({})
    setLocalCosts({})
    setLocalPrices({})
    setErrorMessage(null)
  }, [selectedItem])

  const filtered = inventory.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(query.toLowerCase()) || String(item.barcode).includes(query)
    const matchCat = catFilter === "all" || item.category === catFilter
    return matchSearch && matchCat
  })

  const handleDownloadStockTemplate = () => {
    let csvContent = "Product Name,Minimum Stock,Stock Quantity,Expiration Date (YYYY-MM-DD)\n"

    inventory.forEach(item => {
      const minStockVal = item.minStock && item.minStock > 0 ? item.minStock : ""
      csvContent += `"${item.name.replace(/"/g, '""')}",${minStockVal},,\n`
    })

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `stock_entry_template_${Date.now()}.csv`)
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
          if (columns.length < 1) continue

          const productName = columns[0]?.trim()
          const minStockInput = parseFloat(columns[1])
          const stockQtyInput = Math.floor(parseFloat(columns[2]) || 0)
          const rawExpiry = columns[3]?.trim() || null
          const expiryDate = parseDateToISO(rawExpiry)

          if (!productName) continue

          // Find matching item in local inventory array first for exact string lookup
          const localMatch = inventory.find(inv => inv.name.trim().toLowerCase() === productName.toLowerCase())
          
          let matchedItem = null

          if (localMatch) {
            matchedItem = { id: localMatch.id, price: localMatch.price, cost: localMatch.cost }
          } else {
            // Fallback DB search query
            const { data: dbItem } = await supabase
              .from("inventory")
              .select("id, price, cost")
              .eq("name", productName)
              .maybeSingle()
            matchedItem = dbItem
          }

          if (!matchedItem) continue

          if (!isNaN(minStockInput) && minStockInput >= 0) {
            await supabase
              .from("inventory")
              .update({ min_stock: Math.floor(minStockInput) })
              .eq("id", Number(matchedItem.id))
          }

          if (stockQtyInput > 0) {
            const cleanedName = productName.replace(/\s+/g, "").substring(0, 5).toUpperCase()
            const generatedBatchLabel = `BATCH-${cleanedName}-${Date.now().toString().slice(-4)}`

            await supabase.from("inventory_batches").insert({
              item_id: Number(matchedItem.id),
              batch_label: generatedBatchLabel,
              stock: stockQtyInput,
              cost: Number(matchedItem.cost) || 0,
              price: Number(matchedItem.price) || 0,
              expiry_date: expiryDate
            })
          }

          successCount++
        }

        await fetchInventory()

        if (onLogAction) {
          await onLogAction("BULK_STOCK_IMPORT", "INVENTORY_MANAGEMENT", `Imported stock adjustments for ${successCount} items from CSV.`)
        }

        alert(`Successfully applied stock adjustments to ${successCount} products.`)
      } catch (err) {
        alert("Error reading file. Please save file as CSV (Comma delimited) inside Excel.")
      } finally {
        setIsBulkUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    }

    reader.readAsText(file)
  }

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsedQty = Math.floor(parseFloat(batchQty) || 0)
    
    if (!selectedItem || !batchLabel.trim() || parsedQty <= 0) {
      setErrorMessage("Please enter a valid batch name and quantity greater than zero.")
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)

    const parsedCost = parseFloat(batchCost) || 0
    const parsedPrice = parseFloat(batchPrice) || 0

    const { error } = await supabase
      .from("inventory_batches")
      .insert({
        item_id: Number(selectedItem.id),
        batch_label: batchLabel.trim().toUpperCase(),
        stock: parsedQty,
        cost: parsedCost,
        price: parsedPrice,
        expiry_date: expiryDate || null
      })

    if (error) {
      setErrorMessage("Database anomaly encountered while creating new product batch.")
      setIsProcessing(false)
      return
    }

    if (onLogAction) {
      const logDetails = `Added new batch "${batchLabel.toUpperCase()}" with ${parsedQty} units at Cost: ₱${parsedCost.toFixed(2)}, Price: ₱${parsedPrice.toFixed(2)} for item "${selectedItem.name}" (Expiry: ${expiryDate || "None"})`
      await onLogAction("ADD_BATCH", "INVENTORY_MANAGEMENT", logDetails)
    }

    setBatchQty("")
    setBatchCost("")
    setBatchPrice("")
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

  const handleUpdateBatchCost = async (batchId: string, typedCost: string, batchName: string) => {
    if (!selectedItem) return
    const parsed = parseFloat(typedCost) || 0

    await supabase.from("inventory_batches").update({ cost: parsed }).eq("id", Number(batchId))
    if (onLogAction) {
      await onLogAction("EDIT_BATCH_COST", "INVENTORY_MANAGEMENT", `Updated batch "${batchName}" cost to ₱${parsed.toFixed(2)} for item "${selectedItem.name}"`)
    }
    await fetchInventory()
  }

  const handleUpdateBatchPrice = async (batchId: string, typedPrice: string, batchName: string) => {
    if (!selectedItem) return
    const parsed = parseFloat(typedPrice) || 0

    await supabase.from("inventory_batches").update({ price: parsed }).eq("id", Number(batchId))
    if (onLogAction) {
      await onLogAction("EDIT_BATCH_PRICE", "INVENTORY_MANAGEMENT", `Updated batch "${batchName}" selling price to ₱${parsed.toFixed(2)} for item "${selectedItem.name}"`)
    }
    await fetchInventory()
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
    <div className="space-y-4 text-xs font-medium">

      {/* Bulk CSV Stock Bar */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Bulk Stock Management</h3>
            <p className="text-[10px] text-gray-500">Download Excel template pre-filled with product names, or upload CSV to update stock quantities.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadStockTemplate}
            className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg flex items-center gap-1.5 border transition-colors"
          >
            <Download className="w-4 h-4 text-gray-500" />
            Download Stock Template
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
            className="px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {isBulkUploading ? "Processing Import..." : "Upload Stock CSV"}
          </button>
        </div>
      </div>

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
                      const displayQty = localQuantities[batch.id] !== undefined ? localQuantities[batch.id] : batch.stock
                      const displayCost = localCosts[batch.id] !== undefined ? localCosts[batch.id] : String(batch.cost || 0)
                      const displayPrice = localPrices[batch.id] !== undefined ? localPrices[batch.id] : String(batch.price || 0)

                      return (
                        <div key={batch.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-between transition-colors hover:bg-gray-50/80 gap-3">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <p className="font-bold text-gray-900 font-mono text-xs truncate">{batch.batchLabel}</p>
                            
                            <div className="flex items-center gap-2 font-mono text-[10px] text-gray-600">
                              <div className="flex items-center gap-1">
                                <span>Cost: ₱</span>
                                <input 
                                  type="text"
                                  value={displayCost}
                                  onChange={e => {
                                    const val = e.target.value.replace(/[^0-9.]/g, "")
                                    setLocalCosts(prev => ({ ...prev, [batch.id]: val }))
                                  }}
                                  onBlur={() => {
                                    if (localCosts[batch.id] !== undefined) {
                                      handleUpdateBatchCost(batch.id, localCosts[batch.id], batch.batchLabel)
                                      setLocalCosts(prev => { const n = { ...prev }; delete n[batch.id]; return n })
                                    }
                                  }}
                                  className="w-14 px-1 border rounded bg-white font-mono text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>

                              <span>•</span>

                              <div className="flex items-center gap-1">
                                <span>Price: ₱</span>
                                <input 
                                  type="text"
                                  value={displayPrice}
                                  onChange={e => {
                                    const val = e.target.value.replace(/[^0-9.]/g, "")
                                    setLocalPrices(prev => ({ ...prev, [batch.id]: val }))
                                  }}
                                  onBlur={() => {
                                    if (localPrices[batch.id] !== undefined) {
                                      handleUpdateBatchPrice(batch.id, localPrices[batch.id], batch.batchLabel)
                                      setLocalPrices(prev => { const n = { ...prev }; delete n[batch.id]; return n })
                                    }
                                  }}
                                  className="w-14 px-1 border rounded bg-white font-mono font-bold text-gray-900 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                            </div>

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
                              value={displayQty}
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

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block text-gray-500 font-bold uppercase text-[9px] tracking-wider">Supply Cost (₱)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="0.00" 
                        value={batchCost}
                        onChange={e => setBatchCost(e.target.value)}
                        className="w-full p-2 border border-gray-200 rounded-lg text-xs bg-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" 
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-gray-500 font-bold uppercase text-[9px] tracking-wider">Selling Price (₱)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="0.00" 
                        value={batchPrice}
                        onChange={e => setBatchPrice(e.target.value)}
                        className="w-full p-2 border border-gray-200 rounded-lg text-xs bg-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" 
                      />
                    </div>
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
    </div>
  )
}