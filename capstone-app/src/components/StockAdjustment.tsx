import { useState, useEffect, useRef } from "react"
import type { InventoryItem } from "../App"
import { supabase } from "../utils/apiClient"
import { downloadExcelWithAutoFit, parseSpreadsheetFile } from "../utils/excelUtils"
import { Plus, Minus, Layers, AlertCircle, Trash2, Calendar, Download, Upload, FileSpreadsheet, Clock, CheckCircle2, X, Edit2, Search, Building2, Sparkles, Scan, Check, Barcode } from "lucide-react"
import { BarcodePrintModal } from "./BarcodePrintModal"

interface StockAdjustmentProps {
  currentOperator?: { username: string; displayName: string; systemRole: string } | null
  inventory: InventoryItem[]
  categoriesList: string[]
  fetchInventory: () => Promise<void>
  onLogAction?: (actionType: string, moduleTarget: string, details: string) => Promise<void>
}

export function StockAdjustment({ currentOperator, inventory, categoriesList, fetchInventory, onLogAction }: StockAdjustmentProps) {
  const [query, setQuery] = useState("")
  const [catFilter, setCatFilter] = useState("all")
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [showBarcodeModal, setShowBarcodeModal] = useState(false)
  
  const [batchLabel, setBatchLabel] = useState("")
  const [batchQty, setBatchQty] = useState<string>("")
  const [batchCost, setBatchCost] = useState<string>("")
  const [batchPrice, setBatchPrice] = useState<string>("")
  const [expiryDate, setExpiryDate] = useState("")
  const [itemManufacturer, setItemManufacturer] = useState<string>("")
  const [showManufacturerSuggestions, setShowManufacturerSuggestions] = useState(false)
  const manufacturerDropdownRef = useRef<HTMLDivElement>(null)
  const [isUpdatingManufacturer, setIsUpdatingManufacturer] = useState(false)
  const [scanToast, setScanToast] = useState<{ message: string; type: "success" | "warning"; id: number } | null>(null)
  
  const barcodeBufferRef = useRef<string>("")
  const lastKeyTimeRef = useRef<number>(0)
  const flushTimerRef = useRef<any>(null)
  
  const [isProcessing, setIsProcessing] = useState(false)
  const [isBulkUploading, setIsBulkUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deleteConfirmBatch, setDeleteConfirmBatch] = useState<{ id: string; label: string } | null>(null)
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

  const [localQuantities, setLocalQuantities] = useState<Record<string, string>>({})
  const [localCosts, setLocalCosts] = useState<Record<string, string>>({})
  const [localPrices, setLocalPrices] = useState<Record<string, string>>({})

  const fileInputRef = useRef<HTMLInputElement>(null)

  const dynamicCategories = categoriesList.filter(c => c !== "unmarked category")
  const isAdmin = !currentOperator || currentOperator.systemRole === "admin" || currentOperator.systemRole === "superadmin"
  const safeInventory = Array.isArray(inventory) ? inventory : []

  // Collect all distinct known manufacturer brands across database + standard suppliers
  const allKnownManufacturers = Array.from(
    new Set([
      "Unilab", "Pascual", "RiteMed", "Sanofi", "GlaxoSmithKline", "Pfizer", "Generic / Phyto", "local",
      ...safeInventory.flatMap(i => [
        i.manufacturer,
        ...(i.batches || []).map(b => b.manufacturer)
      ]).filter((m): m is string => Boolean(m && typeof m === "string" && m.trim().length > 0))
    ])
  ).sort((a, b) => a.localeCompare(b))

  const matchingManufacturers = itemManufacturer.trim()
    ? allKnownManufacturers.filter(m => 
        m.toLowerCase().includes(itemManufacturer.toLowerCase().trim()) &&
        m.toLowerCase() !== itemManufacturer.toLowerCase().trim()
      )
    : allKnownManufacturers

  // Close manufacturer auto-suggestion dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (manufacturerDropdownRef.current && !manufacturerDropdownRef.current.contains(e.target as Node)) {
        setShowManufacturerSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Auto-dismiss scan toast
  useEffect(() => {
    if (!scanToast) return
    const timer = setTimeout(() => setScanToast(null), 3000)
    return () => clearTimeout(timer)
  }, [scanToast])

  // Update product manufacturer brand directly from Inventory tab
  const handleUpdateItemManufacturer = async (newBrand: string) => {
    if (!selectedItem) return
    setIsUpdatingManufacturer(true)
    try {
      setItemManufacturer(newBrand)
      const numId = Number(selectedItem.id)
      const targetId = !isNaN(numId) ? numId : selectedItem.id
      
      await supabase.from("inventory").update({ manufacturer: newBrand }).eq("id", targetId as any)
      setSelectedItem(prev => prev ? { ...prev, manufacturer: newBrand } : null)
      if (onLogAction) {
        await onLogAction("UPDATE_MANUFACTURER", "INVENTORY", `Updated manufacturer of "${selectedItem.name}" to "${newBrand}"`)
      }
      await fetchInventory()
      setScanToast({ message: `✓ Manufacturer set to "${newBrand}"`, type: "success", id: Date.now() })
    } catch (e) {
      console.error("Failed to update manufacturer:", e)
    } finally {
      setIsUpdatingManufacturer(false)
    }
  }

  // Background Barcode Scanner in Inventory Tab
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isSearchOrFormInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")

      const now = Date.now()
      const elapsed = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now

      if (e.key === "Enter" || e.key === "Tab") {
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
        const buffered = barcodeBufferRef.current.trim()
        barcodeBufferRef.current = ""

        if (buffered.length >= 2) {
          const matched = safeInventory.find(i => {
            if (!i) return false
            const b = String(i.barcode || "").trim().toLowerCase()
            const bd = b.replace(/\D/g, "")
            const cd = buffered.replace(/\D/g, "")
            return (b && b === buffered.toLowerCase()) || (cd.length >= 4 && bd === cd)
          })
          if (matched) {
            setSelectedItem(matched)
            setScanToast({ message: `✓ Found "${matched.name}" • Selected in Inventory`, type: "success", id: Date.now() })
            e.preventDefault()
            e.stopPropagation()
          }
        }
        return
      }

      if (e.key.length > 1) return

      if (elapsed > 110 && !isSearchOrFormInput) {
        barcodeBufferRef.current = e.key
      } else {
        barcodeBufferRef.current += e.key
      }

      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
      flushTimerRef.current = setTimeout(() => {
        const buffered = barcodeBufferRef.current.trim()
        if (buffered.length >= 3) {
          const matched = safeInventory.find(i => {
            if (!i) return false
            const b = String(i.barcode || "").trim().toLowerCase()
            const bd = b.replace(/\D/g, "")
            const cd = buffered.replace(/\D/g, "")
            return (b && b === buffered.toLowerCase()) || (cd.length >= 4 && bd === cd)
          })
          if (matched) {
            setSelectedItem(matched)
            setItemManufacturer("")
            setScanToast({ message: `✓ Found "${matched.name}" • Selected in Inventory`, type: "success", id: Date.now() })
            barcodeBufferRef.current = ""
          }
        }
      }, 95)
    }

    window.addEventListener("keydown", handleGlobalKeyDown, true)
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true)
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }, [safeInventory])

  useEffect(() => {
    if (inventory && selectedItem) {
      const freshItem = inventory.find(i => i.id === selectedItem.id)
      if (freshItem) {
        setSelectedItem(freshItem)
      }
    }
  }, [inventory])

  useEffect(() => {
    const handleSelectProduct = (e: any) => {
      const pName = e.detail?.name || e.detail
      const pId = e.detail?.id
      if (!safeInventory.length) return
      const matched = safeInventory.find(i => (pId && String(i.id) === String(pId)) || (pName && String(i.name || "").toLowerCase().trim() === String(pName).toLowerCase().trim()))
      if (matched) {
        setSelectedItem(matched)
        setItemManufacturer("")
      }
    }

    window.addEventListener("pinv_select_product", handleSelectProduct)
    return () => window.removeEventListener("pinv_select_product", handleSelectProduct)
  }, [safeInventory])

  useEffect(() => {
    if (selectedItem) {
      const cleanedName = selectedItem.name.replace(/\s+/g, "").substring(0, 5).toUpperCase()
      const timestampString = Date.now().toString().slice(-4)
      setBatchLabel(`LOT-${cleanedName}-${timestampString}`)
      setItemManufacturer("")
      setBatchCost("")
      setBatchPrice("")
    } else {
      setBatchLabel("")
      setItemManufacturer("")
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

  const filtered = safeInventory.filter(item => {
    if (!item) return false
    const name = String(item.name || "").toLowerCase()
    const barcode = String(item.barcode || "").toLowerCase()
    const manufacturer = String(item.manufacturer || "").toLowerCase()
    const q = (query || "").toLowerCase()
    const matchSearch = name.includes(q) || barcode.includes(q) || manufacturer.includes(q)
    const matchCat = catFilter === "all" || item.category === catFilter
    return matchSearch && matchCat
  })

  const handleDownloadStockTemplate = () => {
    const headers = [
      "Product Name",
      "Manufacturer Brand",
      "Cost",
      "Price",
      "Minimum Stock",
      "Stock Quantity",
      "Expiration Date (MM/DD/YYYY or YYYY/DD/MM)"
    ];
    const rows: (string | number)[][] = [];

    inventory.forEach(item => {
      const minStockVal = item.minStock && item.minStock > 0 ? item.minStock : "";
      if (item.batches && item.batches.length > 0) {
        item.batches.forEach(batch => {
          const batchManufacturer = batch.manufacturer || item.manufacturer || "";
          const costVal = batch.cost !== undefined && batch.cost > 0 ? batch.cost : (item.cost || "");
          const priceVal = batch.price !== undefined && batch.price > 0 ? batch.price : (item.price || "");

          rows.push([
            item.name,
            batchManufacturer,
            costVal,
            priceVal,
            minStockVal,
            batch.stock !== undefined ? batch.stock : "",
            batch.expiryDate || ""
          ]);
        });
      } else {
        rows.push([
          item.name,
          item.manufacturer || "",
          item.cost || "",
          item.price || "",
          minStockVal,
          item.stock !== undefined && item.stock > 0 ? item.stock : "",
          ""
        ]);
      }
    });

    downloadExcelWithAutoFit("stock_entry_template", "Stock Entry Template", headers, rows);
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

  const isCancelledRef = useRef(false)

  const handleCancelImport = () => {
    isCancelledRef.current = true
    setImportProgress(prev => ({
      ...prev,
      currentItemName: "Cancelling stock import..."
    }))
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (isBulkUploading || importProgress.active) return

    isCancelledRef.current = false
    setIsBulkUploading(true)
    const startTime = Date.now()

    setImportProgress({
      active: true,
      totalRows: 0,
      processedRows: 0,
      successCount: 0,
      currentItemName: "Reading stock spreadsheet...",
      startTime
    })

    try {
      const rows = await parseSpreadsheetFile(file)
      if (rows.length <= 1) {
        alert("The file contains no data rows to import.")
        setIsBulkUploading(false)
        setImportProgress(prev => ({ ...prev, active: false }))
        if (fileInputRef.current) fileInputRef.current.value = ""
        return
      }

      const totalDataRows = rows.length - 1
      setImportProgress(prev => ({
        ...prev,
        totalRows: totalDataRows,
        currentItemName: "Indexing inventory items..."
      }))

      // Step 1: Build in-memory lookup map from inventory prop
      const itemLookup = new Map<string, { id: number; price: number; cost: number }>()
      inventory.forEach(inv => {
        const norm = inv.name.trim().toLowerCase()
        if (norm) {
          itemLookup.set(norm, { id: Number(inv.id), price: inv.price, cost: inv.cost })
        }
      })

      // Query DB for any items missing from prop
      const missingNamesSet = new Set<string>()
      for (let i = 1; i < rows.length; i++) {
        const pName = rows[i]?.[0]?.trim()
        if (pName && !itemLookup.has(pName.toLowerCase())) {
          missingNamesSet.add(pName)
        }
      }

      if (missingNamesSet.size > 0) {
        const missingArr = Array.from(missingNamesSet)
        const { data: dbItems } = await supabase
          .from("inventory")
          .select("id, name, price, cost")
          .in("name", missingArr)

        if (dbItems) {
          dbItems.forEach(item => {
            const norm = String(item.name || "").trim().toLowerCase()
            if (norm) {
              itemLookup.set(norm, { id: Number(item.id), price: Number(item.price) || 0, cost: Number(item.cost) || 0 })
            }
          })
        }
      }

      // Step 2: Process stock rows in memory
      let successCount = 0
      const batchesToInsert: any[] = []
      const minStockUpdates: Array<{ id: number; minStock: number }> = []

      for (let i = 1; i < rows.length; i++) {
        if (isCancelledRef.current) break
        if (i % 10 === 0) {
          await new Promise(r => setTimeout(r, 10))
        }
        if (isCancelledRef.current) break

        const columns = rows[i]
        if (!columns || columns.length < 1) continue

        const productName = columns[0]?.trim()
        let manufacturerInput = ""
        let costInput = 0
        let priceInput = 0
        let minStockInput = 0
        let stockQtyInput = 0
        let rawExpiry: string | null = null

        if (columns.length >= 7) {
          // 7-column format: [Product Name, Manufacturer, Cost, Price, Min Stock, Stock Qty, Expiry Date]
          manufacturerInput = columns[1]?.trim() || ""
          costInput = parseFloat(columns[2]) || 0
          priceInput = parseFloat(columns[3]) || 0
          minStockInput = parseFloat(columns[4])
          stockQtyInput = Math.floor(parseFloat(columns[5]) || 0)
          rawExpiry = columns[6]?.trim() || null
        } else if (columns.length >= 5) {
          // 5-column format: [Product Name, Manufacturer, Min Stock, Stock Qty, Expiry Date]
          manufacturerInput = columns[1]?.trim() || ""
          minStockInput = parseFloat(columns[2])
          stockQtyInput = Math.floor(parseFloat(columns[3]) || 0)
          rawExpiry = columns[4]?.trim() || null
        } else {
          // 4-column legacy format: [Product Name, Min Stock, Stock Qty, Expiry Date]
          minStockInput = parseFloat(columns[1])
          stockQtyInput = Math.floor(parseFloat(columns[2]) || 0)
          rawExpiry = columns[3]?.trim() || null
        }
        const expiryDate = parseDateToISO(rawExpiry)

        if (!productName) continue

        const matchedItem = itemLookup.get(productName.toLowerCase())
        if (!matchedItem) continue

        if (!isNaN(minStockInput) && minStockInput >= 0) {
          minStockUpdates.push({ id: matchedItem.id, minStock: Math.floor(minStockInput) })
        }

        if (stockQtyInput > 0) {
          const cleanedName = productName.replace(/\s+/g, "").substring(0, 5).toUpperCase()
          const rawBatchLabel = `BATCH-${cleanedName}-${Date.now().toString().slice(-4)}`
          const storedBatchLabel = manufacturerInput 
            ? `${rawBatchLabel} [${manufacturerInput}]`
            : rawBatchLabel

          batchesToInsert.push({
            item_id: matchedItem.id,
            batch_label: storedBatchLabel,
            stock: stockQtyInput,
            cost: costInput > 0 ? costInput : matchedItem.cost,
            price: priceInput > 0 ? priceInput : matchedItem.price,
            expiry_date: expiryDate
          })
        }

        successCount++

        if (i % 25 === 0 || i === rows.length - 1) {
          setImportProgress(prev => ({
            ...prev,
            processedRows: i,
            successCount,
            currentItemName: `Processed ${i} of ${totalDataRows} stock records...`
          }))
        }
      }

      const wasCancelled = isCancelledRef.current

      // Step 3: Execute bulk updates and inserts
      if (!wasCancelled) {
        if (minStockUpdates.length > 0) {
          for (let i = 0; i < minStockUpdates.length; i += 10) {
            if (isCancelledRef.current) break
            const chunk = minStockUpdates.slice(i, i + 10)
            await Promise.all(
              chunk.map(up => supabase.from("inventory").update({ min_stock: up.minStock }).eq("id", up.id))
            )
          }
        }

        if (batchesToInsert.length > 0 && !isCancelledRef.current) {
          setImportProgress(prev => ({
            ...prev,
            currentItemName: "Synchronizing stock batch records..."
          }))
          for (let i = 0; i < batchesToInsert.length; i += 100) {
            if (isCancelledRef.current) break
            await supabase.from("inventory_batches").insert(batchesToInsert.slice(i, i + 100))
          }
        }
      }

      setImportProgress(prev => ({
        ...prev,
        processedRows: totalDataRows,
        successCount,
        currentItemName: wasCancelled ? "Stock import cancelled by user." : "Import Completed! Updated stock items."
      }))

      Promise.all([
        fetchInventory(),
        onLogAction ? onLogAction("BULK_STOCK_IMPORT", "INVENTORY_MANAGEMENT", wasCancelled ? `Stock import cancelled by user (${successCount} records processed).` : `Imported stock adjustments for ${successCount} items from Excel file.`) : Promise.resolve()
      ]).catch(() => {})

      setTimeout(() => {
        setImportProgress(prev => ({ ...prev, active: false }))
        setIsBulkUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }, 300)

    } catch (err: any) {
      console.error("Stock Excel import error:", err)
      alert(`Error reading file: ${err?.message || "Invalid Excel / CSV file format."}`)
      setImportProgress(prev => ({ ...prev, active: false }))
      setIsBulkUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
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
    const rawBatchName = batchLabel.trim().toUpperCase()
    const batchManufacturer = itemManufacturer.trim()

    // Store per-batch manufacturer so each batch retains its own distinct brand
    const storedBatchLabel = batchManufacturer 
      ? `${rawBatchName} [${batchManufacturer}]`
      : rawBatchName

    const batchInsertPayload: any = {
      item_id: Number(selectedItem.id),
      batch_label: storedBatchLabel,
      stock: parsedQty,
      cost: parsedCost,
      price: parsedPrice,
      expiry_date: expiryDate || null
    }

    const { error } = await supabase.from("inventory_batches").insert(batchInsertPayload)

    if (error) {
      setErrorMessage("Database anomaly encountered while creating new product batch.")
      setIsProcessing(false)
      return
    }

    if (onLogAction) {
      const logDetails = `Added new batch "${rawBatchName}" with ${parsedQty} units at Cost: ₱${parsedCost.toFixed(2)}, Price: ₱${parsedPrice.toFixed(2)} for item "${selectedItem.name}" (Manufacturer: ${batchManufacturer || "Unspecified"}, Expiry: ${expiryDate || "None"})`
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

    try {
      // 1. Optimistically update selectedItem batches in UI immediately
      const remainingBatches = (selectedItem.batches || []).filter(b => String(b.id) !== String(batchId))
      const newTotalStock = remainingBatches.reduce((sum, b) => sum + (Number(b.stock) || 0), 0)
      
      setSelectedItem(prev => prev ? { ...prev, stock: newTotalStock, batches: remainingBatches } : null)

      // 2. Clear linked sale_item_batches records if any
      await supabase.from("sale_item_batches").delete().eq("batch_label", batchName)

      const numId = Number(batchId)
      const targetId = !isNaN(numId) ? numId : batchId
      const { error: delErr } = await supabase.from("inventory_batches").delete().eq("id", targetId as any)
      
      if (delErr) {
        console.warn("Delete by targetId failed, trying string format:", delErr)
        await supabase.from("inventory_batches").delete().eq("id", String(batchId))
      }
      await supabase.from("inventory_batches").delete().eq("batch_label", batchName)

      // 3. Sync remaining total stock on parent inventory table
      const numItemId = Number(selectedItem.id)
      const targetItemId = !isNaN(numItemId) ? numItemId : selectedItem.id
      await supabase.from("inventory").update({ stock: newTotalStock }).eq("id", targetItemId as any)

      if (onLogAction) {
        await onLogAction("DELETE_BATCH", "INVENTORY_MANAGEMENT", `Removed batch "${batchName}" for item "${selectedItem.name}"`)
      }
      await fetchInventory()
    } catch (err) {
      console.error("Error deleting batch:", err)
      await fetchInventory()
    }
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
    <div className="space-y-4 text-xs font-medium font-sans relative">
      {/* Floating Scanner / Action Toast Notification */}
      {scanToast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-3 fade-in duration-200 pointer-events-none">
          <div className={`px-4 py-2.5 rounded-xl shadow-2xl border backdrop-blur-md flex items-center gap-2.5 text-xs font-bold ${
            scanToast.type === "success"
              ? "bg-slate-900/95 text-emerald-300 border-emerald-500/40 shadow-emerald-950/40"
              : "bg-slate-900/95 text-amber-300 border-amber-500/40 shadow-amber-950/40"
          }`}>
            <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-400">
              <Scan className="w-3.5 h-3.5" />
            </div>
            <span>{scanToast.message}</span>
          </div>
        </div>
      )}

      {!isAdmin && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl text-amber-800 dark:text-amber-300 text-xs font-medium flex items-center justify-between">
          <span>🔒 <strong>Staff Read-Only View:</strong> Only Administrators can add batches, adjust stock levels, or bulk import inventory.</span>
        </div>
      )}

      {/* Bulk CSV Stock Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          <div>
            <h3 className="font-bold text-gray-800 dark:text-white text-sm">Bulk Stock Management</h3>
            <p className="text-[10px] text-gray-500 dark:text-slate-400">Download Excel template pre-filled with product names, or upload Excel (.xlsx, .xls, .csv) files to update stock quantities.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowBarcodeModal(true)}
            className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold rounded-lg flex items-center gap-1.5 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
            title="Generate & Print Scannable Barcode Labels or Export to Excel"
          >
            <Barcode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Print / Export Barcodes
          </button>

          <button
            type="button"
            onClick={handleDownloadStockTemplate}
            className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 font-bold rounded-lg flex items-center gap-1.5 border dark:border-slate-600 transition-colors"
          >
            <Download className="w-4 h-4 text-gray-500" />
            Download Stock Template
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
            disabled={!isAdmin || isBulkUploading || importProgress.active}
            onClick={() => {
              if (!isAdmin) {
                alert("Admin Access Required: Only Administrators can bulk import stock.")
                return
              }
              fileInputRef.current?.click()
            }}
            className={`px-3.5 py-2 font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors ${
              isAdmin 
                ? "bg-green-600 hover:bg-green-700 text-white" 
                : "bg-gray-300 dark:bg-slate-700 text-gray-500 cursor-not-allowed"
            }`}
            title={!isAdmin ? "Only Admin can upload stock files" : undefined}
          >
            <Upload className="w-4 h-4" />
            {isBulkUploading || importProgress.active ? "Processing Import..." : "Upload Stock Excel / CSV"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs font-medium">
        
        {/* Stock Registry Directory */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-800 p-4 rounded-xl border dark:border-slate-700 shadow-xs space-y-4 flex flex-col h-[580px]">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800 dark:text-white text-sm tracking-wide">Stock Registry Directory</h3>
            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
              <Scan className="w-3 h-3" /> Scanner Ready
            </span>
          </div>
          
          <div className="space-y-2">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-gray-400 dark:text-slate-400 absolute left-3 pointer-events-none" />
              <input 
                type="text" 
                placeholder="Search matching barcode, name, brand..." 
                value={query} 
                onChange={e => setQuery(e.target.value)} 
                className="w-full pl-9 pr-8 p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-xs bg-gray-50/50 dark:bg-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400" 
              />
              {query && (
                <button 
                  type="button" 
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select 
              value={catFilter} 
              onChange={e => setCatFilter(e.target.value)} 
              className="w-full p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl uppercase bg-white dark:bg-slate-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="all">All Categories</option>
              <option value="unmarked category">UNMARKED CATEGORY</option>
              {dynamicCategories.map(cat => (<option key={cat} value={cat}>{cat.toUpperCase()}</option>))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filtered.length === 0 ? (
              <p className="text-gray-400 dark:text-slate-500 text-center py-8">No system products match current filters.</p>
            ) : (
              filtered.map(item => {
                const isLow = item.stock <= item.minStock
                const isSelected = selectedItem?.id === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedItem(item)
                      setItemManufacturer("")
                    }}
                    className={`w-full text-left p-3 border rounded-xl transition-all flex justify-between items-start gap-2 cursor-pointer ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 dark:border-blue-500 shadow-xs' 
                        : 'border-gray-100 dark:border-slate-700/80 bg-white dark:bg-slate-900/50 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900 dark:text-white leading-snug break-words">{item.name}</p>
                      
                      {/* Barcode & Category */}
                      <p className="text-[10px] text-gray-400 dark:text-slate-400 font-mono mt-1 flex items-center gap-1.5 flex-wrap">
                        <span>#{item.barcode || "No Barcode"}</span>
                        <span>•</span>
                        <span className="uppercase font-semibold text-blue-600 dark:text-blue-400">{item.category}</span>
                      </p>

                      {/* Manufacturer Brand Name on Item Card if active batches exist */}
                      {item.batches && item.batches.length > 0 && item.manufacturer && (
                        <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="truncate">{item.manufacturer}</span>
                        </p>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className={`font-mono font-bold text-xs px-2.5 py-1 rounded-lg inline-block ${
                        isLow 
                          ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800' 
                          : 'bg-green-100 dark:bg-green-950/80 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                      }`}>
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
            <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 border-dashed p-8 text-center text-gray-400 dark:text-slate-400 flex flex-col items-center justify-center flex-1 min-h-[400px]">
              <Layers className="w-8 h-8 text-gray-300 dark:text-slate-600 mb-2" />
              <p className="font-semibold text-sm text-gray-700 dark:text-slate-300">No Active Selection Made</p>
              <p className="text-[11px] mt-0.5">Please click on any product profile row template from the side panel to adjust batch counts or scan a barcode.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 items-start">
              
              <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-xs p-4 space-y-4 min-h-[520px] flex flex-col">
                <div className="border-b dark:border-slate-700 pb-3 flex flex-wrap justify-between items-start gap-2">
                  <div className="space-y-1.5 max-w-full">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">{selectedItem.name}</h2>
                    </div>
                    
                    {/* Barcode & Manufacturer Brand Badge in Header */}
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                      <span className="text-slate-500 dark:text-slate-400">Barcode: #{selectedItem.barcode || "N/A"}</span>
                      {selectedItem.batches && selectedItem.batches.length > 0 && selectedItem.manufacturer && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold">
                            <Building2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            Manufacturer: {selectedItem.manufacturer}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold tracking-wide px-2.5 py-1 bg-gray-100 dark:bg-slate-700 rounded-md text-gray-700 dark:text-slate-200 border dark:border-slate-600">
                      Min Safe Level: {selectedItem.minStock}
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  <h4 className="font-bold text-gray-700 dark:text-slate-200 text-xs tracking-wide">Active Batch Assignments</h4>
                  
                  {(() => {
                    const activeBatches = (selectedItem.batches || []).filter(b => (Number(b.stock) || 0) > 0)
                    if (activeBatches.length === 0) {
                      return (
                        <p className="text-gray-400 dark:text-slate-500 text-center py-12 bg-gray-50/50 dark:bg-slate-900/40 border border-dashed dark:border-slate-700 rounded-xl">
                          No active batches assigned. Create a batch on the right to add stock quantities.
                        </p>
                      )
                    }

                    return activeBatches.map(batch => {
                      const diffDays = batch.expiryDate ? Math.ceil((new Date(batch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 999
                      const isRed = diffDays <= 0
                      const isOrange = diffDays > 0 && diffDays <= 90
                      const isYellow = diffDays > 90 && diffDays <= 180
                      const expiryClass = isRed
                        ? 'text-red-600 dark:text-red-400 border-red-400 font-bold bg-red-50 dark:bg-red-950/40'
                        : isOrange
                        ? 'text-orange-600 dark:text-orange-400 border-orange-400 font-bold bg-orange-50 dark:bg-orange-950/40'
                        : isYellow
                        ? 'text-yellow-700 dark:text-yellow-400 border-yellow-400 font-bold bg-yellow-50 dark:bg-yellow-950/40'
                        : ''
                      const displayQty = localQuantities[batch.id] !== undefined ? localQuantities[batch.id] : batch.stock
                      const displayCost = localCosts[batch.id] !== undefined ? localCosts[batch.id] : String(batch.cost || 0)
                      const displayPrice = localPrices[batch.id] !== undefined ? localPrices[batch.id] : String(batch.price || 0)

                      return (
                        <div key={batch.id} className="p-3.5 bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-slate-700 rounded-xl space-y-2.5 transition-colors hover:bg-gray-100/60 dark:hover:bg-slate-900">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-gray-900 dark:text-white font-mono text-xs">{batch.batchLabel}</p>
                              {(batch.manufacturer || selectedItem.manufacturer) && (
                                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                                  <Building2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  {batch.manufacturer || selectedItem.manufacturer}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 text-gray-500 dark:text-slate-400 text-[10px]">
                                <Calendar className="w-3 h-3 text-gray-400" />
                                <input 
                                  type="date"
                                  value={batch.expiryDate || ""}
                                  onChange={e => handleUpdateBatchExpiry(batch.id, batch.expiryDate, e.target.value, batch.batchLabel)}
                                  className={`p-1 border rounded-lg font-mono text-[10px] bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${expiryClass}`}
                                />
                              </div>
                              <button 
                                type="button" 
                                onClick={() => setDeleteConfirmBatch({ id: batch.id, label: batch.batchLabel })}
                                className="p-1.5 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900 active:scale-95 transition-all cursor-pointer"
                                title="Delete Batch record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-gray-200/60 dark:border-slate-800">
                            <div className="flex items-center gap-3 font-mono text-[11px] text-gray-600 dark:text-slate-300">
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400 dark:text-slate-400 text-[10px]">Cost: ₱</span>
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
                                  className="w-16 px-1.5 py-0.5 border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white font-mono text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>

                              <div className="flex items-center gap-1">
                                <span className="text-gray-400 dark:text-slate-400 text-[10px]">Price: ₱</span>
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
                                  className="w-16 px-1.5 py-0.5 border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-700 font-bold text-gray-900 dark:text-white text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button 
                                type="button" 
                                onClick={() => handleModifyBatchStock(batch.id, batch.stock, -1, batch.batchLabel)}
                                className="w-7 h-7 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 font-bold rounded-lg flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 transition-colors shadow-2xs cursor-pointer"
                                title="Minus 1 Unit"
                              >
                                <Minus className="w-3 h-3" />
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
                                className="w-14 text-center font-mono font-bold text-xs text-gray-900 dark:text-white bg-white dark:bg-slate-800 border dark:border-slate-700 h-7 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              
                              <button 
                                type="button" 
                                onClick={() => handleModifyBatchStock(batch.id, batch.stock, 1, batch.batchLabel)}
                                className="w-7 h-7 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 font-bold rounded-lg flex items-center justify-center hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 transition-colors shadow-2xs cursor-pointer"
                                title="Add 1 Unit"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>

              {/* Custom Batch Delete Confirmation Modal */}
              {deleteConfirmBatch && selectedItem && (
                <div 
                  onClick={() => setDeleteConfirmBatch(null)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans"
                >
                  <div 
                    onClick={e => e.stopPropagation()}
                    className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border dark:border-slate-700 font-sans"
                  >
                    <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
                      <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 flex items-center justify-center flex-shrink-0">
                        <Trash2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-gray-900 dark:text-white">Delete Batch Record</h3>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">This action cannot be undone.</p>
                      </div>
                    </div>

                    <p className="text-xs text-gray-700 dark:text-slate-300 leading-relaxed bg-gray-50 dark:bg-slate-900 p-3 rounded-lg border dark:border-slate-700">
                      Are you sure you want to remove batch <strong>"{deleteConfirmBatch.label}"</strong> for item <strong>"{selectedItem.name}"</strong>?
                    </p>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmBatch(null)}
                        className="flex-1 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl text-xs hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const b = deleteConfirmBatch
                          setDeleteConfirmBatch(null)
                          handleDeleteBatch(b.id, b.label)
                        }}
                        className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs"
                      >
                        Delete Batch
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Provision New Batch and Manufacturer Selector */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border dark:border-slate-700 shadow-xs space-y-4 h-fit">
                <h4 className="font-bold text-gray-800 dark:text-white text-xs tracking-wide flex items-center gap-1.5 border-b dark:border-slate-700 pb-2">
                  <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  Provision New Batch
                </h4>

                {errorMessage && (
                  <div className="p-2.5 bg-red-50 dark:bg-red-950/60 border border-red-100 dark:border-red-900 rounded-lg text-red-600 dark:text-red-300 flex items-center gap-1.5 font-bold">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleCreateBatch} className="space-y-3">
                  <div className="space-y-1 relative" ref={manufacturerDropdownRef}>
                    <div className="flex items-center justify-between">
                      <label className="block text-gray-500 dark:text-slate-400 font-bold uppercase text-[9px] tracking-wider">Manufacturer Brand Name</label>
                      {itemManufacturer && (
                        <button
                          type="button"
                          onClick={() => {
                            setItemManufacturer("")
                            setShowManufacturerSuggestions(false)
                          }}
                          className="text-[9px] text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 font-bold cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    
                    <div className="relative">
                      <input 
                        type="text" 
                        disabled={isProcessing}
                        placeholder="e.g. Unilab, Pascual, Sanofi, local..."
                        value={itemManufacturer} 
                        onFocus={() => setShowManufacturerSuggestions(true)}
                        onChange={e => {
                          setItemManufacturer(e.target.value)
                          setShowManufacturerSuggestions(true)
                        }} 
                        className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 dark:text-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans" 
                      />
                    </div>

                    {/* Auto-suggest dropdown when typing or focused */}
                    {showManufacturerSuggestions && matchingManufacturers.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto animate-in fade-in duration-100 font-sans">
                        <div className="p-1.5 space-y-0.5">
                          <p className="px-2 py-1 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            Suggested Brands ({matchingManufacturers.length})
                          </p>
                          {matchingManufacturers.map(brand => (
                            <button
                              key={brand}
                              type="button"
                              onMouseDown={e => {
                                e.preventDefault()
                                setItemManufacturer(brand)
                                setShowManufacturerSuggestions(false)
                              }}
                              className="w-full text-left px-2.5 py-1.5 text-xs font-semibold rounded-lg text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-between transition-colors cursor-pointer"
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                <Building2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span className="truncate">{brand}</span>
                              </span>
                              <span className="text-[9px] text-blue-600 dark:text-blue-400 uppercase font-bold shrink-0">Use</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-gray-500 dark:text-slate-400 font-bold uppercase text-[9px] tracking-wider">Batch Lot Code Label *</label>
                    <input 
                      type="text" 
                      required 
                      disabled={isProcessing}
                      placeholder="Auto generated lot name..." 
                      value={batchLabel}
                      onChange={e => setBatchLabel(e.target.value)}
                      className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold" 
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-gray-500 dark:text-slate-400 font-bold uppercase text-[9px] tracking-wider">Initial Stock Units Quantity *</label>
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
                      className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" 
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block text-gray-500 dark:text-slate-400 font-bold uppercase text-[9px] tracking-wider">Supply Cost (₱)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="0.00" 
                        value={batchCost}
                        onChange={e => setBatchCost(e.target.value)}
                        className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" 
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-gray-500 dark:text-slate-400 font-bold uppercase text-[9px] tracking-wider">Selling Price (₱)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="0.00" 
                        value={batchPrice}
                        onChange={e => setBatchPrice(e.target.value)}
                        className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" 
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-gray-500 dark:text-slate-400 font-bold uppercase text-[9px] tracking-wider">Product Expiration Date</label>
                    <input 
                      type="date" 
                      disabled={isProcessing}
                      value={expiryDate}
                      onChange={e => setExpiryDate(e.target.value)}
                      className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" 
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={isProcessing || !batchLabel.trim() || !batchQty || parseInt(batchQty) <= 0}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs text-xs tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95"
                  >
                    {isProcessing ? "Adding Lot Record..." : "Register Batch Inventory"}
                  </button>
                </form>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Stock CSV Import Progress Modal with Time Left */}
      {importProgress.active && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400">
                <Upload className="w-5 h-5 animate-bounce" />
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">Importing Stock Adjustments CSV</h3>
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
                <span>{importProgress.processedRows} of {importProgress.totalRows} stock records</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                  {calculateImportEta(importProgress.processedRows, importProgress.totalRows, importProgress.startTime)}
                </span>
              </div>
            </div>

            {/* Current Item status banner */}
            <div className="p-3 bg-gray-50 dark:bg-slate-900 rounded-xl border dark:border-slate-700 text-xs space-y-1">
              <div className="text-gray-400 dark:text-gray-400 text-[10px] uppercase tracking-wider font-bold">Current Product Updating</div>
              <div className="font-semibold text-gray-800 dark:text-gray-200 truncate flex items-center gap-2">
                {importProgress.processedRows >= importProgress.totalRows ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span className="text-green-600 dark:text-green-400 font-bold">Import Completed! Updated {importProgress.successCount} stock items.</span>
                  </>
                ) : (
                  <span>{importProgress.currentItemName || "Processing CSV rows..."}</span>
                )}
              </div>
            </div>

            {/* Cancel Button */}
            {importProgress.processedRows < importProgress.totalRows && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleCancelImport}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-xs cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  Cancel Import
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scannable Barcode Labels Print & Export Modal */}
      <BarcodePrintModal
        isOpen={showBarcodeModal}
        onClose={() => setShowBarcodeModal(false)}
        inventory={inventory}
      />

    </div>
  )
}