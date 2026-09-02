import { useState, useRef, useEffect } from "react"
import type { InventoryItem } from "../App"
import { supabase, triggerGlobalSync, fetchAllSupabaseRows } from "../utils/apiClient"
import { downloadExcelWithAutoFit, parseSpreadsheetFile } from "../utils/excelUtils"
import { getCategoryStyles } from "../utils/categoryColors"
import { Search, FolderPlus, Download, Upload, FileSpreadsheet, X, Trash2, Edit2, Clock, CheckCircle2, Scan, Barcode } from "lucide-react"
import { BarcodePrintModal } from "./BarcodePrintModal"

interface InventoryManagerProps {
  currentOperator?: { username: string; displayName: string; systemRole: string } | null
  inventory: InventoryItem[]
  categoriesList: string[]
  refreshCategories: () => Promise<void>
  refreshInventory: () => Promise<void>
  onUpdateInventory: (item: InventoryItem) => void
  onDeleteProduct: (id: string) => void
  onLogAction?: (actionType: string, moduleTarget: string, details: string) => Promise<void>
}

export function InventoryManager({ 
  currentOperator,
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
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [showBarcodeModal, setShowBarcodeModal] = useState(false)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<InventoryItem | null>(null)
  const [newCatInput, setNewCatInput] = useState("")
  const [isBulkUploading, setIsBulkUploading] = useState(false)
  const [scanToast, setScanToast] = useState<{ message: string; type: "success" | "warning"; id: number } | null>(null)
  const barcodeBufferRef = useRef<string>("")
  const lastKeyTimeRef = useRef<number>(0)
  const flushTimerRef = useRef<any>(null)
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
  const isAdmin = !currentOperator || currentOperator.systemRole === "admin" || currentOperator.systemRole === "superadmin"

  // Auto-dismiss scan toast
  useEffect(() => {
    if (!scanToast) return
    const timer = setTimeout(() => setScanToast(null), 3000)
    return () => clearTimeout(timer)
  }, [scanToast])

  const safeInventory = Array.isArray(inventory) ? inventory : []

  const filtered = safeInventory.filter(item => {
    if (!item) return false
    const name = String(item.name || "").toLowerCase()
    const barcode = String(item.barcode || "").toLowerCase()
    const q = (query || "").toLowerCase()
    const matchSearch = name.includes(q) || barcode.includes(q)
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

  const isCancelledRef = useRef(false)

  const handleCancelImport = () => {
    isCancelledRef.current = true
    setImportProgress(prev => ({
      ...prev,
      currentItemName: "Cancelling import..."
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
      currentItemName: "Reading spreadsheet rows...",
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
        currentItemName: "Pre-fetching database indexes..."
      }))

      // Step 1: Pre-fetch existing inventory & categories in single queries
      const existingDbItems = await fetchAllSupabaseRows("inventory", "id, name, barcode")
      const existingDbCategories = await fetchAllSupabaseRows("product_categories", "name")

      const itemLookup = new Map<string, { id: number; barcode: string }>()
      if (existingDbItems) {
        existingDbItems.forEach(item => {
          const normName = String(item.name || "").trim().toLowerCase()
          if (normName) {
            itemLookup.set(normName, { id: Number(item.id), barcode: item.barcode })
          }
        })
      }

      const categorySet = new Set<string>()
      if (existingDbCategories) {
        existingDbCategories.forEach(c => {
          if (c.name) categorySet.add(c.name.trim().toLowerCase())
        })
      }

      // Step 2: Parse and validate all rows in memory
      const parsedRows: Array<{
        rowIndex: number
        barcode: string
        name: string
        categoryInput: string
        manufacturer: string | null
        cost: number
        price: number
        minStock: number
        initialStock: number
        expiryDate: string | null
      }> = []

      const newCategoriesToInsertSet = new Set<string>()

      for (let i = 1; i < rows.length; i++) {
        const columns = rows[i]
        if (!columns || columns.length < 2) continue

        let barcode = columns[0]?.trim()
        const name = columns[1]?.trim()
        const categoryInput = columns[2]?.trim().toLowerCase() || ""
        const manufacturer = columns[3]?.trim() || null
        const cost = parseFloat(columns[4]) || 0
        const price = parseFloat(columns[5]) || 0
        const minStock = Math.floor(parseFloat(columns[6]) || 10)
        const initialStock = Math.floor(parseFloat(columns[7]) || 0)
        const rawExpiry = columns[8]?.trim() || null
        const expiryDate = parseDateToISO(rawExpiry)

        if (!name) continue

        if (!barcode) {
          barcode = `AUTO-${Math.floor(100000 + Math.random() * 900000)}`
        }

        if (categoryInput && categoryInput !== "unmarked category" && !categorySet.has(categoryInput)) {
          newCategoriesToInsertSet.add(categoryInput)
        }

        parsedRows.push({
          rowIndex: i,
          barcode,
          name,
          categoryInput,
          manufacturer,
          cost,
          price,
          minStock,
          initialStock,
          expiryDate
        })
      }

      // Step 3: Insert new categories in 1 bulk query if needed
      if (newCategoriesToInsertSet.size > 0 && !isCancelledRef.current) {
        const newCatsArr = Array.from(newCategoriesToInsertSet).map(c => ({ name: c }))
        await supabase.from("product_categories").insert(newCatsArr)
        newCategoriesToInsertSet.forEach(c => categorySet.add(c))
        await refreshCategories()
      }

      // Step 4: Batch process inventory items
      const CHUNK_SIZE = 100
      let successCount = 0
      const batchesToInsert: any[] = []

      // Separate into items that already exist vs new items to insert
      const itemsToUpdatePayload: any[] = []
      const itemsToInsertRows: typeof parsedRows = []

      for (const r of parsedRows) {
        const normName = r.name.trim().toLowerCase()
        const existing = itemLookup.get(normName)
        let targetCategory = "unmarked category"
        if (r.categoryInput && categorySet.has(r.categoryInput)) {
          targetCategory = r.categoryInput
        }

        if (existing) {
          itemsToUpdatePayload.push({
            id: existing.id,
            barcode: r.barcode || existing.barcode,
            name: r.name,
            category: targetCategory,
            manufacturer: r.manufacturer,
            min_stock: r.minStock,
            _rowData: r
          })
        } else {
          itemsToInsertRows.push(r)
        }
      }

      // 4a. Update existing items in bulk chunks using primary key id
      for (let i = 0; i < itemsToUpdatePayload.length; i += CHUNK_SIZE) {
        if (isCancelledRef.current) break
        await new Promise(r => setTimeout(r, 50))
        if (isCancelledRef.current) break

        const chunk = itemsToUpdatePayload.slice(i, i + CHUNK_SIZE)
        const cleanPayload = chunk.map(({ _rowData, ...item }) => item)

        let upErr: any = null
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await supabase.from("inventory").upsert(cleanPayload)
          upErr = res.error
          if (!upErr) break
          await new Promise(r => setTimeout(r, 200 * (attempt + 1)))
        }

        if (upErr) {
          console.error("Bulk inventory update error after retries:", upErr)
        } else {
          chunk.forEach(itemData => {
            const r = itemData._rowData
            if (r.initialStock > 0) {
              const cleanedName = r.name.replace(/\s+/g, "").substring(0, 5).toUpperCase()
              const rawLabel = `BULK-${cleanedName}-${Date.now().toString().slice(-4)}`
              const batchLabel = r.manufacturer && r.manufacturer.trim()
                ? `${rawLabel} [${r.manufacturer.trim()}]`
                : rawLabel
              batchesToInsert.push({
                item_id: itemData.id,
                batch_label: batchLabel,
                stock: r.initialStock,
                cost: r.cost,
                price: r.price,
                expiry_date: r.expiryDate
              })
            }
            successCount++
          })
        }

        const processedSoFar = Math.min(totalDataRows, i + chunk.length)
        setImportProgress(prev => ({
          ...prev,
          processedRows: processedSoFar,
          successCount,
          currentItemName: `Updating records ${processedSoFar} of ${totalDataRows}...`
        }))
      }

      // Deduplicate new items to insert by product name to avoid database conflict errors
      const uniqueNewItemsMap = new Map<string, typeof parsedRows[0]>()
      const duplicateNewRows: typeof parsedRows = []

      for (const r of itemsToInsertRows) {
        const norm = r.name.trim().toLowerCase()
        if (!uniqueNewItemsMap.has(norm)) {
          uniqueNewItemsMap.set(norm, r)
        } else {
          duplicateNewRows.push(r)
        }
      }

      const uniqueNewRows = Array.from(uniqueNewItemsMap.values())

      // 4b. Insert distinct new items in bulk chunks
      for (let i = 0; i < uniqueNewRows.length; i += CHUNK_SIZE) {
        if (isCancelledRef.current) break
        await new Promise(r => setTimeout(r, 50))
        if (isCancelledRef.current) break

        const chunk = uniqueNewRows.slice(i, i + CHUNK_SIZE)
        const insertPayload = chunk.map(r => {
          let targetCategory = "unmarked category"
          if (r.categoryInput && categorySet.has(r.categoryInput)) {
            targetCategory = r.categoryInput
          }
          return {
            barcode: r.barcode,
            name: r.name,
            category: targetCategory,
            manufacturer: r.manufacturer,
            min_stock: r.minStock
          }
        })

        let insErr: any = null
        let insertedItems: any = null

        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await supabase.from("inventory").insert(insertPayload).select("id, name")
          insErr = res.error
          insertedItems = res.data
          if (!insErr && insertedItems) break
          await new Promise(r => setTimeout(r, 200 * (attempt + 1)))
        }

        if (insErr) {
          console.error("Bulk inventory insert error after retries:", insErr)
        } else if (insertedItems) {
          insertedItems.forEach((insItem: any, idx: number) => {
            const r = chunk[idx]
            const targetItemId = Number(insItem.id)
            const normName = String(insItem.name || r?.name || "").trim().toLowerCase()
            itemLookup.set(normName, { id: targetItemId, barcode: r?.barcode || "" })

            if (r && r.initialStock > 0) {
              const cleanedName = r.name.replace(/\s+/g, "").substring(0, 5).toUpperCase()
              const batchLabel = `BULK-${cleanedName}-${Date.now().toString().slice(-4)}`
              batchesToInsert.push({
                item_id: targetItemId,
                batch_label: batchLabel,
                stock: r.initialStock,
                cost: r.cost,
                price: r.price,
                expiry_date: r.expiryDate
              })
            }
            successCount++
          })
        }

        const processedSoFar = Math.min(totalDataRows, itemsToUpdatePayload.length + i + chunk.length)
        setImportProgress(prev => ({
          ...prev,
          processedRows: processedSoFar,
          successCount,
          currentItemName: `Inserting records ${processedSoFar} of ${totalDataRows}...`
        }))
      }

      // 4c. Process duplicate row entries (linking stock batches to parent product)
      for (const r of duplicateNewRows) {
        const normName = r.name.trim().toLowerCase()
        const targetItem = itemLookup.get(normName)
        if (targetItem) {
          if (r.initialStock > 0) {
            const cleanedName = r.name.replace(/\s+/g, "").substring(0, 5).toUpperCase()
            const batchLabel = `BULK-${cleanedName}-${Date.now().toString().slice(-4)}`
            batchesToInsert.push({
              item_id: targetItem.id,
              batch_label: batchLabel,
              stock: r.initialStock,
              cost: r.cost,
              price: r.price,
              expiry_date: r.expiryDate
            })
          }
          successCount++
        }
      }

      // Step 5: Bulk insert initial stock batches
      if (batchesToInsert.length > 0 && !isCancelledRef.current) {
        setImportProgress(prev => ({
          ...prev,
          currentItemName: "Synchronizing initial stock batches..."
        }))
        for (let i = 0; i < batchesToInsert.length; i += 100) {
          if (isCancelledRef.current) break
          await new Promise(r => setTimeout(r, 50))
          const batchChunk = batchesToInsert.slice(i, i + 100)
          for (let attempt = 0; attempt < 3; attempt++) {
            const res = await supabase.from("inventory_batches").insert(batchChunk)
            if (!res.error) break
            await new Promise(r => setTimeout(r, 200 * (attempt + 1)))
          }
        }
      }

      const wasCancelled = isCancelledRef.current

      setImportProgress(prev => ({
        ...prev,
        processedRows: totalDataRows,
        successCount,
        currentItemName: wasCancelled ? "Import cancelled by user." : "Import Completed! Synchronized items."
      }))

      // Non-blocking background synchronization
      Promise.all([
        refreshCategories(),
        refreshInventory(),
        onLogAction ? onLogAction("BULK_CSV_IMPORT", "ITEM_SPECIFICATIONS", wasCancelled ? `Partial import cancelled by user (${successCount} items created).` : `Bulk imported ${successCount} stock items from Excel file.`) : Promise.resolve()
      ]).catch(() => {})
      triggerGlobalSync()

      // Quick 300ms feedback before modal auto-dismiss
      setTimeout(() => {
        setImportProgress(prev => ({ ...prev, active: false }))
        setIsBulkUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }, 300)

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

  // Automatic Background Barcode Scanner for Item Specs (Wedge Mode / Clabel C986)
  const handleSpecsBarcodeScan = (scannedCode: string) => {
    const clean = scannedCode.trim()
    if (!clean) return

    // Search if this barcode already exists in inventory
    const matched = safeInventory.find(i => {
      if (!i) return false
      const b = String(i.barcode || "").trim().toLowerCase()
      const bd = b.replace(/\D/g, "")
      const cd = clean.replace(/\D/g, "")
      return (b && b === clean.toLowerCase()) || (cd.length >= 4 && bd === cd)
    })

    if (editingItem) {
      // User is in "Modify Specifications Template" modal
      setEditForm(prev => ({ ...prev, barcode: clean }))
      setScanToast({ message: `✓ Barcode assigned to specs: "${clean}"`, type: "success", id: Date.now() })
    } else if (showAdd) {
      // User is in "Add New Product Specification" modal
      setNewItem(prev => ({ ...prev, barcode: clean }))
      setScanToast({ message: `✓ Barcode assigned: "${clean}"`, type: "success", id: Date.now() })
    } else {
      // When on main Item Specs table:
      if (matched) {
        openEditModal(matched)
        setScanToast({ message: `✓ Found "${matched.name}" • Specs opened`, type: "success", id: Date.now() })
      } else {
        if (isAdmin) {
          setShowAdd(true)
          setNewItem(prev => ({ ...prev, barcode: clean }))
          setScanToast({ message: `✓ Barcode "${clean}" • Ready to Add Profile`, type: "success", id: Date.now() })
        } else {
          setScanToast({ message: `Scanned Barcode: ${clean}`, type: "warning", id: Date.now() })
        }
      }
    }
  }

  // Global KeyDown listener for Hardware Scanner in Item Specs
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isSearchInput = target && target.getAttribute("placeholder")?.includes("Search product")

      const now = Date.now()
      const elapsed = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now

      // Hardware scanners terminate with Enter, Tab, or Nothing
      if (e.key === "Enter" || e.key === "Tab") {
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
        const buffered = barcodeBufferRef.current.trim()
        barcodeBufferRef.current = ""

        if (buffered.length >= 2) {
          handleSpecsBarcodeScan(buffered)
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }

      // Ignore modifier keys
      if (e.key.length > 1) {
        return
      }

      // Fast keystrokes indicate scanner hardware (< 80ms)
      if (elapsed > 110 && !isSearchInput) {
        barcodeBufferRef.current = e.key
      } else {
        barcodeBufferRef.current += e.key
      }

      // Auto-flush debounce timer for suffix-less scanners (Clabel C986)
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
      }

      flushTimerRef.current = setTimeout(() => {
        const buffered = barcodeBufferRef.current.trim()
        if (buffered.length >= 3) {
          handleSpecsBarcodeScan(buffered)
          barcodeBufferRef.current = ""
        }
      }, 95)
    }

    window.addEventListener("keydown", handleGlobalKeyDown, true)
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true)
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }, [editingItem, showAdd, inventory, isAdmin])

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
    <div className="space-y-6 text-xs font-medium relative">
      {/* Floating Scanner Toast Notification */}
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
          <span>🔒 <strong>Staff Read-Only View:</strong> Only Administrators can add product profiles, edit item specifications, or bulk import files.</span>
        </div>
      )}

      {/* Excel Data Imports Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          <div>
            <h3 className="font-bold text-gray-800 dark:text-white text-sm">Bulk Data Management</h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Download blank template or upload Excel (.xlsx, .xls, .csv) files.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowBarcodeModal(true)}
            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold rounded-lg flex items-center gap-1.5 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
            title="Generate & Print Scannable Barcode Labels or Export to Excel"
          >
            <Barcode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Print / Export Barcodes
          </button>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 font-bold rounded-lg flex items-center gap-1.5 border dark:border-slate-600 transition-colors"
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
            disabled={!isAdmin || isBulkUploading || importProgress.active}
            onClick={() => {
              if (!isAdmin) {
                alert("Admin Access Required: Only Administrators can upload files.")
                return
              }
              fileInputRef.current?.click()
            }}
            className={`px-3 py-2 font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors ${
              isAdmin 
                ? "bg-green-600 hover:bg-green-700 text-white" 
                : "bg-gray-300 dark:bg-slate-700 text-gray-500 cursor-not-allowed"
            }`}
            title={!isAdmin ? "Only Admin can upload files" : undefined}
          >
            <Upload className="w-4 h-4" />
            {isBulkUploading || importProgress.active ? "Processing..." : "Upload Excel / CSV"}
          </button>
        </div>
      </div>

      {/* Categories Controls */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-4 space-y-3">
        <h3 className="font-bold text-gray-800 dark:text-slate-200 text-sm flex items-center gap-1"><FolderPlus className="w-4 h-4 text-blue-600"/>Manage Categories</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            <input 
              type="text" 
              disabled={!isAdmin}
              placeholder={isAdmin ? "Category name..." : "Admin access required"} 
              value={newCatInput} 
              onChange={e=>setNewCatInput(e.target.value)} 
              className="px-2 py-1.5 border rounded-lg bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white text-xs disabled:bg-gray-100 dark:disabled:bg-slate-800" 
            />
            <button 
              type="button" 
              disabled={!isAdmin}
              onClick={handleAddCategory} 
              className={`px-3 py-1.5 font-bold rounded-lg text-white ${isAdmin ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400 cursor-not-allowed"}`}
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 ml-2 border-l border-gray-200 dark:border-slate-700 pl-3">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-slate-700 border dark:border-slate-600 font-bold uppercase text-[10px]">
              unmarked category
            </span>
            {dynamicCategories.map(cat => (
              <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-slate-700 border dark:border-slate-600 font-bold uppercase text-[10px]">
                {cat}
                {isAdmin && (
                  <button type="button" onClick={() => handleRemoveCategory(cat)} className="text-red-500 font-black ml-1 text-xs">×</button>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Search Header Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-4 shadow-xs">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 text-gray-400 dark:text-slate-400 absolute left-3 pointer-events-none" />
            <input 
              type="text" 
              placeholder="Search product profile templates by name, barcode, or brand..." 
              value={query} 
              onChange={e=>setQuery(e.target.value)} 
              className="w-full pl-9 pr-8 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50/50 dark:bg-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400" 
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
            onChange={e=>setCatFilter(e.target.value)} 
            className="px-4 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl uppercase tracking-wider bg-white dark:bg-slate-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="all">All Categories</option>
            <option value="unmarked category">UNMARKED CATEGORY</option>
            {dynamicCategories.map(cat => (<option key={cat} value={cat}>{cat.toUpperCase()}</option>))}
          </select>
          <button 
            type="button"
            disabled={!isAdmin}
            onClick={() => {
              if (!isAdmin) {
                alert("Admin Access Required: Only Administrators can add new product items.")
                return
              }
              setEditingItem(null)
              setShowAdd(true)
            }} 
            className={`px-4 py-2.5 rounded-xl font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 whitespace-nowrap text-white cursor-pointer ${
              isAdmin ? "bg-blue-600 hover:bg-blue-700 active:scale-98" : "bg-gray-400 dark:bg-slate-700 cursor-not-allowed"
            }`}
            title={!isAdmin ? "Only Admin can add items" : undefined}
          >
            <FolderPlus className="w-4 h-4" />
            Add Item Profile
          </button>
        </div>
      </div>

      {/* New Form Overlay Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100 dark:border-slate-700 text-xs">
            <div className="flex justify-between items-center border-b dark:border-slate-700 pb-3">
              <div>
                <h2 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  <FolderPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Add New Product Specification
                </h2>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Scan barcode anytime to auto-fill identity directly</p>
              </div>
              <button type="button" onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Product Name */}
              <div className="space-y-1">
                <label className="block text-gray-700 dark:text-slate-300 font-bold text-[11px]">Product Name *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Paracetamol 500mg"
                  value={newItem.name || ""} 
                  onChange={e=>setNewItem({...newItem, name: e.target.value})} 
                  className="w-full border border-gray-200 dark:border-slate-700 p-2 rounded-lg bg-gray-50/50 dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                />
              </div>

              {/* Barcode Identity with Auto-Scanner Active Badge */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-gray-700 dark:text-slate-300 font-bold text-[11px]">Barcode Identity</label>
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 animate-pulse">
                    <Scan className="w-3 h-3" /> Scanner Ready
                  </span>
                </div>
                <input 
                  type="text" 
                  placeholder="Scan barcode or enter manually..."
                  value={newItem.barcode || ""} 
                  onChange={e=>setNewItem({...newItem, barcode: e.target.value})} 
                  className="w-full border border-gray-200 dark:border-slate-700 p-2 rounded-lg font-mono text-[11px] bg-gray-50/50 dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                />
              </div>

              {/* Safety Stock */}
              <div className="space-y-1">
                <label className="block text-gray-700 dark:text-slate-300 font-bold text-[11px]">Minimum Safety Stock Level</label>
                <input 
                  type="number" 
                  placeholder="10"
                  value={newItem.minStock ?? 10} 
                  onChange={e=>setNewItem({...newItem, minStock: parseFloat(e.target.value) || 0})} 
                  className="w-full border border-gray-200 dark:border-slate-700 p-2 rounded-lg bg-gray-50/50 dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                />
              </div>

              {/* Category Group */}
              <div className="space-y-1">
                <label className="block text-gray-700 dark:text-slate-300 font-bold text-[11px]">Category Group</label>
                <select 
                  value={newItem.category || "unmarked category"} 
                  onChange={e=>setNewItem({...newItem, category: e.target.value})} 
                  className="w-full border border-gray-200 dark:border-slate-700 p-2 rounded-lg uppercase font-semibold bg-gray-50/50 dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="unmarked category">UNMARKED CATEGORY</option>
                  {dynamicCategories.map(cat => (<option key={cat} value={cat}>{cat.toUpperCase()}</option>))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t dark:border-slate-700">
              <button type="button" onClick={()=>setShowAdd(false)} className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl font-bold transition-colors">Cancel</button>
              <button type="button" onClick={addNewItem} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors">Save Profile</button>
            </div>
          </div>
        </div>
      )}

      {/* Centered Modal Edit Dialog */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100 dark:border-slate-700 text-xs">
            <div className="flex justify-between items-center border-b dark:border-slate-700 pb-3">
              <div>
                <h2 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Modify Specifications Template
                </h2>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Scan barcode anytime to auto-assign identity directly</p>
              </div>
              <button type="button" onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Product Name */}
              <div className="space-y-1">
                <label className="block text-gray-700 dark:text-slate-300 font-bold text-[11px]">Product Name *</label>
                <input 
                  type="text" 
                  value={editForm.name || ""} 
                  onChange={e=>setEditForm({...editForm, name: e.target.value})} 
                  className="w-full border border-gray-200 dark:border-slate-700 p-2 rounded-lg bg-gray-50/50 dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                />
              </div>

              {/* Barcode Identity with Auto-Scanner Indicator */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-gray-700 dark:text-slate-300 font-bold text-[11px]">Barcode Identity</label>
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 animate-pulse">
                    <Scan className="w-3 h-3" /> Scanner Ready
                  </span>
                </div>
                <input 
                  type="text" 
                  placeholder="Scan barcode directly..."
                  value={editForm.barcode || ""} 
                  onChange={e=>setEditForm({...editForm, barcode: e.target.value})} 
                  className="w-full border border-gray-200 dark:border-slate-700 p-2 rounded-lg font-mono text-[11px] bg-gray-50/50 dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                />
              </div>

              {/* Safety Stock */}
              <div className="space-y-1">
                <label className="block text-gray-700 dark:text-slate-300 font-bold text-[11px]">Minimum Safety Stock Threshold</label>
                <input 
                  type="number" 
                  value={editForm.minStock ?? 10} 
                  onChange={e=>setEditForm({...editForm, minStock: parseFloat(e.target.value) || 0})} 
                  className="w-full border border-gray-200 dark:border-slate-700 p-2 rounded-lg bg-gray-50/50 dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                />
              </div>

              {/* Category Group */}
              <div className="space-y-1">
                <label className="block text-gray-700 dark:text-slate-300 font-bold text-[11px]">Category Group</label>
                <select 
                  value={editForm.category || "unmarked category"} 
                  onChange={e=>setEditForm({...editForm, category: e.target.value})} 
                  className="w-full border border-gray-200 dark:border-slate-700 p-2 rounded-lg uppercase font-semibold bg-gray-50/50 dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="unmarked category">UNMARKED CATEGORY</option>
                  {dynamicCategories.map(cat => (<option key={cat} value={cat}>{cat.toUpperCase()}</option>))}
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t dark:border-slate-700">
              <button 
                type="button"
                onClick={() => setDeleteConfirmItem(editingItem)} 
                className="px-3.5 py-2 bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-xl font-bold flex items-center gap-1.5 hover:bg-red-100 dark:hover:bg-red-900 transition-colors text-xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Profile
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={()=>setEditingItem(null)} className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl font-bold transition-colors">Cancel</button>
                <button type="button" onClick={saveEdit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors">Save Changes</button>
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
              <th className="py-3 px-4 text-xs text-gray-600 dark:text-gray-300 font-bold text-center">Min Stock</th>
              <th className="py-3 px-4 text-xs text-gray-600 dark:text-gray-300 font-bold text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {filtered.map(item => {
              const catStyle = getCategoryStyles(item.category)
              return (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="py-3 px-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono mt-0.5">{item.barcode}</p>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${catStyle.badge}`}>
                      {item.category}
                    </span>
                  </td>
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
            )})}
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