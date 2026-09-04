import { useState, useEffect } from "react"
import type { InventoryItem, InventoryBatch, Sale, NamedPerson } from "../types"
import { supabase } from "../utils/apiClient"
import { getCategoryStyles } from "../utils/categoryColors"
import { findMatchingInventoryOptions, getItemManufacturerOptions, useBarcodeScanner, type ScanOption } from "../utils/barcodeScanner"
import { ArrowLeft, Printer, CreditCard, X, Users, Search, Check, Sparkles, Scan, Barcode, CheckCircle2, AlertCircle, AlertTriangle, Building2 } from "lucide-react"

export type { NamedPerson, ScanOption }

interface POSCheckoutProps {
  inventory: InventoryItem[]
  sales?: Sale[]
  categoriesList: string[]
  onCompleteSale: (sale: Sale) => void
}

interface CartItem {
  item: InventoryItem
  quantity: number
  batch?: InventoryBatch
}

type DiscountType = "none" | "senior" | "pwd" | "naac" | "soloparent" | "custom"
type OnlineChannel = "GCash" | "PayMaya" | "BDO" | "BPI" | "Bank Transfer" | "Card" | "Other"

export function POSCheckout({ inventory, sales, categoriesList, onCompleteSale }: POSCheckoutProps) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [query, setQuery] = useState("")
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>("all")
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "other">("cash")
  const [onlineChannel, setOnlineChannel] = useState<OnlineChannel>("GCash")
  const [referenceNumber, setReferenceNumber] = useState<string>("")
  const [showReceipt, setShowReceipt] = useState(false)
  const [showOthersModal, setShowOthersModal] = useState(false)
  const [lastSale, setLastSale] = useState<any>(null)
  
  const [discountType, setDiscountType] = useState<DiscountType>("none")
  const [customDiscountPercent, setCustomDiscountPercent] = useState<number>(0)
  
  // Named Person & ID Number state
  const [customerIdNumber, setCustomerIdNumber] = useState<string>("")
  const [customerName, setCustomerName] = useState<string>("")
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)

  // Registry of known named persons with ID numbers
  const [namedPersonsRegistry, setNamedPersonsRegistry] = useState<NamedPerson[]>([])

  // Barcode scanner state
  const [quickScanInput, setQuickScanInput] = useState<string>("")
  const [scanToast, setScanToast] = useState<{ message: string; type: "success" | "warning" | "error"; id: number } | null>(null)
  const [scanMatchOptions, setScanMatchOptions] = useState<{ code: string; options: ScanOption[] } | null>(null)

  const triggerScanToast = (message: string, type: "success" | "warning" | "error") => {
    setScanToast({ message, type, id: Date.now() })
  }

  useEffect(() => {
    if (!scanToast) return
    const timer = setTimeout(() => setScanToast(null), 3000)
    return () => clearTimeout(timer)
  }, [scanToast])

  useEffect(() => {
    const fetchNamedPersonsFromDb = async () => {
      const { data } = await supabase.from("named_persons").select("*").order("id", { ascending: false })
      if (data) {
        const formatted = data.map((d: any) => ({
          id: String(d.id),
          idNumber: d.id_number || "",
          name: d.name || "",
          discountType: d.id_type || d.discount_type || undefined
        }))
        setNamedPersonsRegistry(formatted)
      }
    }

    fetchNamedPersonsFromDb()
    window.addEventListener("pinv_registry_updated", fetchNamedPersonsFromDb)

    const channel = supabase
      .channel("named-persons-pos-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "named_persons" }, fetchNamedPersonsFromDb)
      .subscribe()

    return () => {
      window.removeEventListener("pinv_registry_updated", fetchNamedPersonsFromDb)
      supabase.removeChannel(channel)
    }
  }, [])

  const [cashReceived, setCashReceived] = useState<string>("")
  const [selectedGenericGroup, setSelectedGenericGroup] = useState<string | null>(null)
  const [displayLimit, setDisplayLimit] = useState<number>(20)

  const dynamicCategories = categoriesList.filter(c => c !== "unmarked category")

  const handleCategoryTabChange = (cat: string) => {
    setActiveCategoryTab(cat)
    setSelectedGenericGroup(null)
    setDisplayLimit(20)
  }

  const getGenericGroupName = (name: string) => {
    const uppercaseName = (name || "").toUpperCase().trim()
    if (uppercaseName.includes("AMLODIPINE") || uppercaseName.includes("AMLO")) return "AMLODIPINE"
    if (uppercaseName.includes("PARACETAMOL") || uppercaseName.includes("BIOGESIC") || uppercaseName.includes("CALPOL")) return "PARACETAMOL"
    if (uppercaseName.includes("MEFENAMIC") || uppercaseName.includes("DOLFENAL")) return "MEFENAMIC ACID"
    const rootName = uppercaseName.split(/[\s\(\[-]/)[0]
    return rootName || uppercaseName
  }

  const filteredItems = inventory.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(query.toLowerCase()) || String(i.barcode).includes(query)
    const matchTab = activeCategoryTab === "all" || i.category === activeCategoryTab
    return matchSearch && matchTab
  })

  const uniqueGroups = Array.from(new Set(filteredItems.map(i => getGenericGroupName(i.name))))
  const visibleGroups = uniqueGroups

  const getItemsInGroup = (groupName: string) => {
    return filteredItems.filter(i => getGenericGroupName(i.name) === groupName)
  }

  const getGroupTotalStock = (groupName: string) => {
    return getItemsInGroup(groupName).reduce((sum, item) => sum + item.stock, 0)
  }

  const handleCatalogueScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop <= clientHeight + 60) {
      if (displayLimit < uniqueGroups.length) {
        setDisplayLimit(prev => prev + 20)
      }
    }
  }

  const getItemBatchAwarePrice = (item: InventoryItem, quantity: number): number => {
    if (!item.batches || item.batches.length === 0) return (item.price || 0) * quantity

    let remainingQty = quantity
    let totalBatchPrice = 0

    const sortedBatches = [...item.batches]
      .filter(b => b.stock > 0)
      .sort((a, b) => {
        if (!a.expiryDate) return 1
        if (!b.expiryDate) return -1
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
      })

    for (const batch of sortedBatches) {
      if (remainingQty <= 0) break
      const qtyFromBatch = Math.min(remainingQty, batch.stock)
      totalBatchPrice += qtyFromBatch * (batch.price || item.price || 0)
      remainingQty -= qtyFromBatch
    }

    if (remainingQty > 0) {
      totalBatchPrice += remainingQty * (item.price || 0)
    }

    return totalBatchPrice
  }

  const getCartItemKey = (ci: CartItem) => {
    if (ci.batch) {
      return `${ci.item.id}_${ci.batch.id || ci.batch.batchLabel}`
    }
    return String(ci.item.id)
  }

  const addToCart = (item: InventoryItem, selectedBatch?: InventoryBatch) => {
    setCart(prev => {
      const matchFn = (ci: CartItem) => {
        if (selectedBatch) {
          return ci.item.id === item.id && (
            (selectedBatch.id && ci.batch?.id === selectedBatch.id) ||
            (selectedBatch.batchLabel && ci.batch?.batchLabel === selectedBatch.batchLabel)
          )
        }
        return ci.item.id === item.id && !ci.batch
      }

      const existing = prev.find(matchFn)
      const maxStock = selectedBatch ? selectedBatch.stock : item.stock

      if (existing) {
        return existing.quantity < maxStock
          ? prev.map(ci => matchFn(ci) ? { ...ci, quantity: ci.quantity + 1 } : ci)
          : prev
      }
      return maxStock > 0 ? [...prev, { item, quantity: 1, batch: selectedBatch }] : prev
    })
  }

  // Barcode Scanner Core Processor (only prompts if there are 2+ different manufacturers)
  const processScannedBarcode = (rawCode: string): boolean => {
    const cleanCode = (rawCode || "").trim()
    if (!cleanCode) return false

    const { options, hasDifferentManufacturers } = findMatchingInventoryOptions(inventory, cleanCode)

    if (options.length === 0) {
      triggerScanToast(`Unrecognized Barcode "${rawCode.trim()}"`, "warning")
      return false
    }

    // ONLY show options modal when there are 2 or more DIFFERENT manufacturers!
    if (hasDifferentManufacturers && options.length > 1) {
      setScanMatchOptions({ code: rawCode.trim(), options })
      return true
    }

    // Same manufacturer: directly add to cart
    const singleOpt = options[0]
    if (singleOpt.stock <= 0) {
      triggerScanToast(`⚠️ "${singleOpt.productName}" is OUT OF STOCK!`, "error")
      return false
    }

    addToCart(singleOpt.item, singleOpt.batch)
    triggerScanToast(`✓ Scanned: ${singleOpt.productName} (${singleOpt.manufacturer}) • ₱${singleOpt.price.toFixed(2)} added`, "success")
    return true
  }

  const handleQueryChange = (val: string) => {
    const trimmed = val.trim()
    // Auto-detect if scanned barcode was typed into the search bar
    if (trimmed.length >= 4) {
      const { options, hasDifferentManufacturers } = findMatchingInventoryOptions(inventory, trimmed)

      if (hasDifferentManufacturers && options.length > 1) {
        setScanMatchOptions({ code: trimmed, options })
        setQuery("")
        return
      } else if (options.length > 0) {
        const singleOpt = options[0]
        if (singleOpt.stock > 0) {
          addToCart(singleOpt.item, singleOpt.batch)
          triggerScanToast(`✓ Scanned: ${singleOpt.productName} • ₱${singleOpt.price.toFixed(2)} added to cart`, "success")
          setQuery("")
          setDisplayLimit(20)
          return
        }
      }
    }

    setQuery(val)
    setDisplayLimit(20)
  }

  const handleQuickScanChange = (val: string) => {
    setQuickScanInput(val)
    const trimmed = val.trim()
    if (trimmed.length >= 4) {
      const { options, hasDifferentManufacturers } = findMatchingInventoryOptions(inventory, trimmed)

      if (hasDifferentManufacturers && options.length > 1) {
        setScanMatchOptions({ code: trimmed, options })
        setQuickScanInput("")
        return
      } else if (options.length > 0) {
        const singleOpt = options[0]
        if (singleOpt.stock > 0) {
          addToCart(singleOpt.item, singleOpt.batch)
          triggerScanToast(`✓ Scanned: ${singleOpt.productName} • ₱${singleOpt.price.toFixed(2)} added to cart`, "success")
          setQuickScanInput("")
        }
      }
    }
  }

  // Automatic Background Hardware Barcode Scanner Listener (Wedge Mode for Clabel & All Scanners)
  useBarcodeScanner({
    onScan: (buffered) => {
      const success = processScannedBarcode(buffered)
      if (success) {
        setQuery(prev => (prev.trim() === buffered ? "" : prev))
        setQuickScanInput("")
      }
      return success
    },
    isSearchOrScanInput: (target) => {
      if (!target) return false
      return (
        target.getAttribute("data-barcode-scanner") === "true" ||
        Boolean(target.getAttribute("placeholder")?.includes("Search product"))
      )
    }
  })


  const handleManualQtyChange = (cartKey: string, value: string, maxStock: number) => {
    if (value === "" || value === "0") {
      setCart(prev => prev.map(ci => getCartItemKey(ci) === cartKey ? { ...ci, quantity: 0 } : ci))
      return
    }
    let parsed = parseInt(value, 10)
    if (Number.isNaN(parsed)) return
    if (parsed < 0) parsed = 0
    if (parsed > maxStock) parsed = maxStock
    setCart(prev => prev.map(ci => getCartItemKey(ci) === cartKey ? { ...ci, quantity: parsed } : ci))
  }

  const handleQtyBlur = (cartKey: string) => {
    setCart(prev => prev.map(ci => getCartItemKey(ci) === cartKey && ci.quantity <= 0 ? { ...ci, quantity: 1 } : ci))
  }

  const updateQtyDelta = (cartKey: string, delta: number, maxStock: number) => {
    setCart(prev => {
      return prev.map(ci => {
        if (getCartItemKey(ci) !== cartKey) return ci
        const next = ci.quantity + delta
        if (next < 1) return null
        if (next > maxStock) return ci
        return { ...ci, quantity: next }
      }).filter(Boolean) as CartItem[]
    })
  }

  const getCartItemUnitPrice = (ci: CartItem): number => {
    if (ci.batch && ci.batch.price > 0) return ci.batch.price
    return getItemBatchAwarePrice(ci.item, 1)
  }

  const getCartItemLineTotal = (ci: CartItem): number => {
    if (ci.batch && ci.batch.price > 0) return ci.batch.price * ci.quantity
    return getItemBatchAwarePrice(ci.item, ci.quantity)
  }

  const handleItemCardClick = (item: InventoryItem) => {
    // Check batches of THIS specific product only
    const { options, hasDifferentManufacturers } = getItemManufacturerOptions(item)

    // If this product has multiple batches with different manufacturers, open the Options modal!
    if (hasDifferentManufacturers && options.length > 1) {
      const codeOrName = (item.barcode || item.name || "").trim()
      setScanMatchOptions({ code: codeOrName, options })
      return
    }

    // Single manufacturer: directly add to cart
    const singleOpt = options[0]
    if (singleOpt && singleOpt.stock > 0) {
      addToCart(item, singleOpt.batch)
      triggerScanToast(`✓ Added: ${singleOpt.productName} (${singleOpt.manufacturer}) • ₱${singleOpt.price.toFixed(2)} to cart`, "success")
    } else if (item.stock > 0) {
      addToCart(item)
      triggerScanToast(`✓ Added: ${item.name} • ₱${(item.price || 0).toFixed(2)} to cart`, "success")
    } else {
      triggerScanToast(`⚠️ "${item.name}" is OUT OF STOCK!`, "error")
    }
  }

  const subtotal = cart.reduce((s, ci) => s + getCartItemLineTotal(ci), 0)
  const isStatutoryDiscount = ["senior", "pwd", "soloparent", "naac"].includes(discountType)
  let computedDiscount = 0, vat = 0, total = subtotal

  if (isStatutoryDiscount) {
    const base = subtotal / 1.12
    computedDiscount = base * (discountType === "soloparent" ? 0.10 : 0.20)
    total = base - computedDiscount
  } else {
    let rate = 0
    if (discountType === "custom") rate = (Number(customDiscountPercent) || 0) / 100

    computedDiscount = subtotal * rate
    const net = subtotal - computedDiscount
    vat = (net / 1.12) * 0.12
    total = net
  }

  const getDiscountLabel = () => {
    if (discountType === "custom") return `CUSTOM (${customDiscountPercent || 0}%)`
    if (discountType === "soloparent") return "SOLO PARENT"
    if (discountType === "senior") return "SENIOR CITIZEN"
    if (discountType === "pwd") return "PWD"
    if (discountType === "naac") return "NAAC"
    return "NONE"
  }

  const isOthersActive = ["naac", "soloparent", "custom"].includes(discountType)

  // Bi-directional Auto-Fill Handlers
  const handleIdNumberChange = (inputVal: string) => {
    // Strictly accept digits 0-9 only
    const sanitizedVal = inputVal.replace(/[^0-9]/g, "")
    setCustomerIdNumber(sanitizedVal)
    setShowCustomerSuggestions(true)

    const trimmedVal = sanitizedVal.trim()
    if (!trimmedVal) return

    // Search exact match by ID Number in registry
    const match = namedPersonsRegistry.find(p => p.idNumber.trim() === trimmedVal)
    if (match) {
      setCustomerName(match.name)
      if (match.discountType && match.discountType !== "none") {
        setDiscountType(match.discountType as DiscountType)
      }
    }
  }

  const handleCustomerNameChange = (inputVal: string) => {
    setCustomerName(inputVal)
    setShowCustomerSuggestions(true)

    const trimmedVal = inputVal.trim().toLowerCase()
    if (!trimmedVal) return

    // Search exact match by Name in registry
    const match = namedPersonsRegistry.find(p => p.name.trim().toLowerCase() === trimmedVal)
    if (match) {
      setCustomerIdNumber(match.idNumber)
      if (match.discountType && match.discountType !== "none") {
        setDiscountType(match.discountType as DiscountType)
      }
    }
  }

  const selectNamedPerson = (person: NamedPerson) => {
    setCustomerIdNumber(person.idNumber)
    setCustomerName(person.name)
    if (person.discountType && person.discountType !== "none") {
      setDiscountType(person.discountType as DiscountType)
    }
    setShowCustomerSuggestions(false)
  }

  const matchingNamedPersons = namedPersonsRegistry.filter(person => {
    const queryName = customerName.trim().toLowerCase()
    const queryId = customerIdNumber.trim().toLowerCase()
    if (!queryName && !queryId) return true
    const matchId = queryId && person.idNumber.toLowerCase().includes(queryId)
    const matchName = queryName && person.name.toLowerCase().includes(queryName)
    return Boolean(matchId || matchName)
  })

  const customerPreviousSales = (sales || [])
    .filter(s => {
      const qName = customerName.trim().toLowerCase()
      const qId = customerIdNumber.trim().toLowerCase()
      if (!qName && !qId) return false
      const cName = (s.customerName || "").toLowerCase()
      return (qName && cName.includes(qName)) || (qId && cName.includes(qId))
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Auto-detect & auto-select customer's discount preference from history
  useEffect(() => {
    const trimmed = customerName.trim().toLowerCase()
    if (!trimmed) return

    const matchedPerson = namedPersonsRegistry.find(p => p.name.trim().toLowerCase() === trimmed)
    if (matchedPerson && matchedPerson.discountType && matchedPerson.discountType !== "none") {
      setDiscountType(matchedPerson.discountType as DiscountType)
      return
    }

    if (customerPreviousSales.length > 0) {
      const lastDisc = customerPreviousSales[0].discountLabel || ""
      const lbl = lastDisc.toLowerCase()
      if (lbl.includes("senior")) setDiscountType("senior")
      else if (lbl.includes("pwd")) setDiscountType("pwd")
      else if (lbl.includes("solo")) setDiscountType("soloparent")
      else if (lbl.includes("naac")) setDiscountType("naac")
      else if (lbl.includes("custom")) setDiscountType("custom")
    }
  }, [customerName, customerIdNumber])

  const readdPreviousItems = (saleItems: any[]) => {
    saleItems.forEach(si => {
      const invItem = inventory.find(i => String(i.id) === String(si.item.id) || i.name.toLowerCase() === (si.item?.name || "").toLowerCase())
      if (invItem && invItem.stock > 0) {
        const qtyToAdd = Math.min(si.quantity || 1, invItem.stock)
        for (let k = 0; k < qtyToAdd; k++) {
          addToCart(invItem, si.batch)
        }
      }
    })
  }

  const completeSale = async () => {
    const numericCash = parseFloat(cashReceived) || 0
    const trimmedCustomer = customerName.trim()
    const trimmedIdNumber = customerIdNumber.trim()

    // Validation Error: Required ONLY on discounted checkouts (Regular sale is optional)
    if (discountType !== "none" && (!trimmedCustomer || !trimmedIdNumber)) {
      alert("Validation Error: Customer Name and ID Number are required before completing a discounted checkout.")
      return
    }

    // Strict Duplicate ID & Name Conflict Validation
    if (trimmedIdNumber) {
      const conflictById = namedPersonsRegistry.find(p => 
        p.idNumber.toLowerCase() === trimmedIdNumber.toLowerCase() && 
        p.name.toLowerCase() !== trimmedCustomer.toLowerCase()
      )
      if (conflictById) {
        alert(`⚠️ ID Conflict Error: ID Number "${trimmedIdNumber}" is already registered to "${conflictById.name}" in the system. You cannot reuse this ID number for a different customer ("${trimmedCustomer}"). Please correct the ID Number or select "${conflictById.name}".`)
        return
      }
    }

    if (trimmedCustomer && trimmedIdNumber) {
      const conflictByName = namedPersonsRegistry.find(p => 
        p.name.toLowerCase() === trimmedCustomer.toLowerCase() && 
        p.idNumber.toLowerCase() !== trimmedIdNumber.toLowerCase()
      )
      if (conflictByName) {
        alert(`⚠️ ID Conflict Error: Customer "${conflictByName.name}" is already registered under ID Number "${conflictByName.idNumber}". You entered a conflicting ID Number ("${trimmedIdNumber}"). Please use ID Number "${conflictByName.idNumber}".`)
        return
      }
    }

    // Validation Error: Online Payment Reference Number is strictly required before checkout
    if (paymentMethod === "other" && !referenceNumber.trim()) {
      alert("Validation Error: Please enter the Reference Number for the online payment before proceeding to checkout.")
      return
    }

    if (!cart.length || (paymentMethod === "cash" && numericCash < total)) return

    const fullCustomerName = trimmedCustomer
      ? (trimmedIdNumber ? `${trimmedCustomer} (ID: ${trimmedIdNumber})` : trimmedCustomer)
      : "Walk-In Customer"

    if (trimmedCustomer) {
      const activeIdNumber = trimmedIdNumber || `REG-${Date.now().toString().slice(-6)}`
      const existing = namedPersonsRegistry.find(p => 
        (trimmedIdNumber && p.idNumber.toLowerCase() === trimmedIdNumber.toLowerCase()) || 
        p.name.toLowerCase() === trimmedCustomer.toLowerCase()
      )
      if (!existing) {
        try {
          const { error } = await supabase.from("named_persons").insert([{
            id_number: activeIdNumber,
            name: trimmedCustomer,
            discount_type: discountType !== "none" ? discountType : "none"
          }])
          if (error) {
            console.error("Supabase insert error into named_persons:", error)
          } else {
            window.dispatchEvent(new Event("pinv_registry_updated"))
          }
        } catch (e) {
          console.error("Supabase insert error into named_persons:", e)
        }
      }
    }

    const saleRecord = {
      id: Date.now().toString(),
      date: new Date(),
      items: [...cart],
      grossTotal: subtotal,
      subtotal: subtotal,
      discount: computedDiscount,
      taxableBase: total / 1.12,
      vat,
      total,
      cashReceived: paymentMethod === "cash" ? numericCash : total,
      change: paymentMethod === "cash" ? Math.max(0, numericCash - total) : 0,
      paymentMethod,
      onlineChannel: paymentMethod === "other" ? onlineChannel : null,
      referenceNumber: paymentMethod === "other" ? referenceNumber.trim() : undefined,
      discountLabel: getDiscountLabel(),
      customerName: fullCustomerName || undefined
    }

    onCompleteSale(saleRecord as any)
    setLastSale(saleRecord)
    setCart([])
    setCashReceived("")
    setReferenceNumber("")
    setDiscountType("none")
    setCustomDiscountPercent(0)
    setCustomerName("")
    setCustomerIdNumber("")
    setShowCustomerSuggestions(false)
    setSelectedGenericGroup(null)
    setShowReceipt(true)
  }

  return (
    <>
      {/* Floating Scan Feedback Banner */}
      {scanToast && (
        <div className="fixed top-16 right-6 z-50 animate-in fade-in slide-in-from-top-3 duration-200 pointer-events-none">
          <div className={`px-4 py-2.5 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-bold backdrop-blur-md ${
            scanToast.type === "success"
              ? "bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/20"
              : scanToast.type === "warning"
                ? "bg-amber-500 text-white border-amber-400 shadow-amber-500/20"
                : "bg-rose-600 text-white border-rose-500 shadow-rose-500/20"
          }`}>
            {scanToast.type === "success" && <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />}
            {scanToast.type === "warning" && <AlertTriangle className="w-4 h-4 shrink-0 text-white" />}
            {scanToast.type === "error" && <AlertCircle className="w-4 h-4 shrink-0 text-white" />}
            <span>{scanToast.message}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 text-xs font-medium">
        <div className="lg:col-span-2 space-y-3 flex flex-col">
          {/* Top Search Bar & Category Pills */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-700 p-4 space-y-3 shrink-0 transition-colors">
            
            {/* Search Input */}
            <div className="relative flex items-center">
              <input 
                type="text" 
                data-barcode-scanner="true"
                placeholder="Search product name or code.." 
                value={query} 
                onChange={e => handleQueryChange(e.target.value)} 
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const trimmed = query.trim()
                    if (trimmed) {
                      const { options, hasDifferentManufacturers } = findMatchingInventoryOptions(inventory, trimmed)
                      if (hasDifferentManufacturers && options.length > 1) {
                        setScanMatchOptions({ code: trimmed, options })
                        setQuery("")
                        e.preventDefault()
                      } else if (options.length > 0) {
                        const singleOpt = options[0]
                        if (singleOpt.stock > 0) {
                          addToCart(singleOpt.item, singleOpt.batch)
                          triggerScanToast(`✓ Scanned: ${singleOpt.productName} • ₱${singleOpt.price.toFixed(2)} added to cart`, "success")
                          setQuery("")
                          setDisplayLimit(20)
                          e.preventDefault()
                        }
                      }
                    }
                  }
                }}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-800 dark:text-white rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400 font-medium" 
              />
              {query && (
                <button 
                  type="button" 
                  onClick={() => handleQueryChange("")}
                  className="absolute right-3 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 bg-slate-100/60 dark:bg-slate-900/60 p-2 rounded-2xl overflow-x-auto border border-slate-200/50 dark:border-slate-700/80 scrollbar-none">
              <button 
                type="button" 
                onClick={() => handleCategoryTabChange("all")} 
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all border whitespace-nowrap cursor-pointer ${
                  activeCategoryTab === "all"
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/70 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                ALL
              </button>
              
              <button 
                type="button" 
                onClick={() => handleCategoryTabChange("unmarked category")} 
                className={`px-4 py-2 rounded-xl font-bold text-xs uppercase transition-all border whitespace-nowrap cursor-pointer ${
                  activeCategoryTab === "unmarked category"
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/70 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                UNMARKED CATEGORY
              </button>

              {dynamicCategories.map((cat) => {
                const isActive = activeCategoryTab === cat
                return (
                  <button 
                    key={cat} 
                    type="button" 
                    onClick={() => handleCategoryTabChange(cat)} 
                    className={`px-4 py-2 rounded-xl font-bold text-xs uppercase transition-all border whitespace-nowrap cursor-pointer ${
                      isActive 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                        : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/70 hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>
          </div>

        <div 
          onScroll={handleCatalogueScroll}
          className="bg-white dark:bg-slate-800 rounded-xl shadow-xs border dark:border-slate-700 p-4 max-h-[calc(100vh-230px)] overflow-y-auto relative"
        >
          {selectedGenericGroup ? (
            <div className="space-y-4">
              <div className="sticky -top-4 z-20 -mx-4 -mt-4 px-4 py-3 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xs border-b border-gray-200 dark:border-slate-700 shadow-xs rounded-t-xl flex items-center justify-between">
                <button 
                  type="button" 
                  onClick={() => setSelectedGenericGroup(null)} 
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/80 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg font-bold text-xs shadow-2xs transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Grid
                </button>
                <span className="font-extrabold text-xs text-blue-600 dark:text-blue-400 tracking-wider uppercase">{selectedGenericGroup} OPTIONS</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {getItemsInGroup(selectedGenericGroup).map(item => {
                  const displayUnitPrice = getItemBatchAwarePrice(item, 1)
                  const catStyle = getCategoryStyles(item.category)
                  const { hasDifferentManufacturers: itemHasDiff } = getItemManufacturerOptions(item)

                  return (
                    <button 
                      key={item.id} 
                      type="button" 
                      onClick={() => handleItemCardClick(item)}
                      disabled={item.stock === 0}
                      className={`relative text-left p-3 rounded-2xl ${catStyle.border} ${catStyle.bg} transition-all flex flex-col justify-between min-h-[110px] cursor-pointer ${
                        item.stock === 0 
                          ? 'opacity-40 cursor-not-allowed'
                          : 'card-hover hover:shadow-md'
                      }`}
                    >
                      <div className="flex justify-between items-center gap-1.5">
                        <div className="flex items-center gap-1">
                          {itemHasDiff && (
                            <span className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[8px] font-black uppercase tracking-wider">Options</span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${catStyle.badge}`}>
                            {item.category || "Unmarked"}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold ${
                          item.stock === 0 
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' 
                            : item.stock <= (item.minStock || 10)
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {item.stock === 0 ? "Out of Stock" : `${item.stock} left`}
                        </span>
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-xs leading-snug mt-1.5">{item.name}</div>
                      <div className="flex justify-between items-center pt-2 mt-1.5 font-mono border-t border-gray-200/60 dark:border-slate-700/60">
                        <span className="text-gray-400 dark:text-slate-400 text-[9px] font-normal">{item.barcode || "No Barcode"}</span>
                        <span className="text-blue-600 dark:text-blue-400 font-bold text-xs">₱{displayUnitPrice.toFixed(2)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-xs text-gray-800 dark:text-slate-200 tracking-wide flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  Available Products Catalogue
                </h2>
                <span className="text-[10px] text-gray-500 dark:text-slate-400 font-mono font-bold">
                  Showing {visibleGroups.length} of {uniqueGroups.length} items
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {visibleGroups.map(groupName => {
                  const itemsInGroup = getItemsInGroup(groupName)
                  const totalStock = getGroupTotalStock(groupName)
                  const hasVariants = itemsInGroup.length > 1
                  const primaryItem = itemsInGroup[0]
                  const hasManufacturerOptions = !hasVariants && primaryItem && getItemManufacturerOptions(primaryItem).hasDifferentManufacturers
                  const displayUnitPrice = primaryItem ? getItemBatchAwarePrice(primaryItem, 1) : 0
                  const catStyle = getCategoryStyles(primaryItem?.category || "")

                  return (
                    <button 
                      key={groupName} 
                      type="button" 
                      onClick={() => {
                        if (hasVariants) {
                          setSelectedGenericGroup(groupName)
                        } else if (primaryItem) {
                          handleItemCardClick(primaryItem)
                        }
                      }}
                      disabled={totalStock === 0}
                      className={`text-left p-3 rounded-2xl ${catStyle.border} ${catStyle.bg} transition-all flex flex-col justify-between min-h-[110px] relative cursor-pointer ${
                        totalStock === 0 
                          ? 'opacity-40 cursor-not-allowed' 
                          : 'card-hover hover:shadow-md'
                      }`}
                    >
                      <div className="flex justify-between items-center gap-1">
                        <div className="flex items-center gap-1 truncate">
                          {hasVariants ? (
                            <span className="px-1.5 py-0.5 rounded-md bg-blue-600 text-white text-[8px] font-black uppercase tracking-wider">Group</span>
                          ) : hasManufacturerOptions ? (
                            <span className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[8px] font-black uppercase tracking-wider">Options</span>
                          ) : null}
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider truncate ${catStyle.badge}`}>
                            {primaryItem?.category || "Unmarked"}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold shrink-0 ${
                          totalStock === 0 
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' 
                            : totalStock <= 10 
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' 
                              : 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {totalStock === 0 ? "Out of Stock" : `${totalStock} left`}
                        </span>
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-xs leading-snug mt-1.5 truncate-2-lines">{groupName}</div>
                      <div className="mt-2 flex items-center justify-between text-[10px] pt-1.5 border-t border-gray-200/60 dark:border-slate-700/60">
                        {hasVariants ? (
                          <span className="text-[9px] text-blue-600 dark:text-blue-400 font-bold">{itemsInGroup.length} variants</span>
                        ) : (
                          <span className="text-[9px] text-gray-400 dark:text-slate-400 font-mono">{primaryItem?.barcode || "No Barcode"}</span>
                        )}
                        <span className="text-blue-600 dark:text-blue-400 font-bold text-xs font-mono ml-auto">
                          ₱{displayUnitPrice.toFixed(2)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        </div>

      {/* Right Column: Current Sale Cart */}
      <div className="lg:col-span-1 space-y-3 flex flex-col min-w-0">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border dark:border-slate-700 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b dark:border-slate-700 shrink-0">
            <h2 className="font-semibold text-xs text-gray-900 dark:text-white uppercase tracking-wider">Current Sale Cart</h2>
            {cart.length > 0 && (
              <span className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full text-[10px]">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} items
              </span>
            )}
          </div>

          {/* Cart items list - constrained height to show 3 full items */}
          <div className="space-y-1.5 my-2 max-h-[210px] overflow-y-auto pr-1 flex-1 min-h-[60px]">
            {cart.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Cart is empty</p>
            ) : (() => {
                const genericGroups: Record<string, CartItem[]> = {}
                cart.forEach(ci => {
                  const g = getGenericGroupName(ci.item.name)
                  if (!genericGroups[g]) genericGroups[g] = []
                  genericGroups[g].push(ci)
                })

                return Object.entries(genericGroups).map(([groupName, groupItems]) => {
                  const catStyle = getCategoryStyles(groupItems[0]?.item.category)
                  return (
                    <div key={groupName} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-xs">
                      <div
                        className="flex items-center gap-2 px-2.5 py-1 bg-slate-100/90 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700/60"
                      >
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${catStyle.dotColor}`} />
                        <span className="font-black text-[9px] uppercase tracking-widest text-slate-700 dark:text-slate-200">
                          {groupName}
                        </span>
                        {groupItems.length > 1 && (
                          <span className="ml-auto bg-white dark:bg-slate-800 rounded-full px-1.5 py-0.5 text-[8px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {groupItems.length} variants
                          </span>
                        )}
                      </div>

                    {groupItems.map((ci, itemIdx) => {
                      const cartKey = getCartItemKey(ci)
                      const maxStock = ci.batch ? ci.batch.stock : ci.item.stock
                      const itemTotal = getCartItemLineTotal(ci)
                      const avgUnitPrice = itemTotal / (ci.quantity || 1)
                      return (
                        <div key={cartKey} className={`flex justify-between items-center px-2.5 py-1.5 bg-white dark:bg-slate-800 ${itemIdx < groupItems.length - 1 ? 'border-b border-dashed border-gray-100 dark:border-slate-700' : ''}`}>
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="font-bold text-gray-900 dark:text-white truncate text-[10px]">{ci.item.name}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-gray-400 font-mono text-[9px]">₱{avgUnitPrice.toFixed(2)} / pc</span>
                              {ci.batch && (
                                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200/60 dark:border-blue-800/60">
                                  {ci.batch.manufacturer || ci.batch.batchLabel || "Batch"}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => updateQtyDelta(cartKey, -1, maxStock)} className="w-5 h-5 border bg-gray-50 dark:bg-slate-700 rounded font-bold hover:bg-gray-100 flex items-center justify-center text-gray-700 dark:text-gray-200 text-xs">-</button>
                            <input
                              type="text"
                              value={ci.quantity === 0 ? "" : ci.quantity}
                              onFocus={e => e.target.select()}
                              onChange={e => handleManualQtyChange(cartKey, e.target.value, maxStock)}
                              onBlur={() => handleQtyBlur(cartKey)}
                              className="w-10 text-center border rounded font-mono font-bold text-gray-900 dark:text-white bg-white dark:bg-slate-900 text-xs py-0.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            <button type="button" onClick={() => updateQtyDelta(cartKey, 1, maxStock)} className="w-5 h-5 border bg-gray-50 dark:bg-slate-700 rounded font-bold hover:bg-gray-100 flex items-center justify-center text-gray-700 dark:text-gray-200 text-xs">+</button>
                            <button type="button" onClick={() => setCart(prev => prev.filter(i => getCartItemKey(i) !== cartKey))} className="text-red-400 ml-0.5 font-bold text-xs hover:text-red-600">×</button>
                          </div>
                        </div>
                      )
                    })}
                    </div>
                  )
                })
              })()
            }
          </div>

          {/* Fixed Bottom Section: Totals, Discounts, Payment, Complete Button */}
          <div className="shrink-0 pt-2 border-t dark:border-slate-700 space-y-2">
            <div className="space-y-1 text-gray-600 dark:text-slate-300 text-[11px]">
              <div className="flex justify-between">
                <span>Gross Total Price:</span>
                <span>₱{subtotal.toFixed(2)}</span>
              </div>
              {computedDiscount > 0 && (
                <div className="flex justify-between text-green-700 dark:text-green-400 font-bold">
                  <span>Applied Markdown ({getDiscountLabel()}):</span>
                  <span>-₱{computedDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Net Taxable Base (VAT Ex):</span>
                <span>₱{(total / (isStatutoryDiscount ? 1 : 1.12)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Value Added Tax (12%):</span>
                <span>{isStatutoryDiscount ? "₱0.00 (Exempt)" : `₱${vat.toFixed(2)}`}</span>
              </div>
              <div className="flex justify-between border-t border-dashed dark:border-slate-700 pt-1.5 font-bold text-gray-900 dark:text-white text-xs">
                <span>Total Bill Due:</span>
                <span className="text-sm text-blue-600 dark:text-blue-400 font-bold font-mono">₱{total.toFixed(2)}</span>
              </div>
            </div>

            {paymentMethod === "cash" && cart.length > 0 && (
              <div className="space-y-2 p-2.5 bg-blue-50/50 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-900/50 text-[11px]">
                <div className="flex justify-between items-center gap-2">
                  <label className="font-bold whitespace-nowrap text-gray-700 dark:text-slate-200">Cash Rendered:</label>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    pattern="[0-9]*\.?[0-9]*"
                    value={cashReceived} 
                    onKeyDown={(e) => {
                      if (e.key === "-" || e.key === "+" || e.key.toLowerCase() === "e") {
                        e.preventDefault()
                      }
                    }}
                    onChange={e => {
                      const rawVal = e.target.value
                      const sanitized = rawVal.replace(/[^0-9.]/g, "")
                      setCashReceived(sanitized)
                    }} 
                    placeholder="0.00" 
                    className="w-28 text-right p-1.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg font-mono font-bold text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                  />
                </div>
                
                {/* Fast Cash Quick Presets */}
                <div className="flex flex-wrap gap-1 items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setCashReceived(total.toFixed(2))}
                    className="px-2 py-0.5 rounded-md bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/60 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 font-bold text-[10px] transition-colors cursor-pointer"
                  >
                    Exact (₱{total.toFixed(2)})
                  </button>
                  {[100, 200, 500, 1000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCashReceived(amt.toString())}
                      className="px-2 py-0.5 rounded-md bg-white hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 font-mono font-bold text-[10px] transition-colors cursor-pointer"
                    >
                      ₱{amt}
                    </button>
                  ))}
                </div>

                {parseFloat(cashReceived) > 0 && (
                  <div className="flex justify-between items-center text-[10px] pt-1.5 border-t border-blue-100 dark:border-blue-900">
                    <span className="text-gray-600 dark:text-slate-300">Change Return:</span>
                    <span className={`font-bold font-mono text-xs ${parseFloat(cashReceived) - total < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {parseFloat(cashReceived) - total < 0 ? `Short: ₱${Math.abs(parseFloat(cashReceived) - total).toFixed(2)}` : `₱${(parseFloat(cashReceived) - total).toFixed(2)}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="bg-gray-50 dark:bg-slate-900 p-2.5 rounded-lg space-y-2 border dark:border-slate-700">
              <div className="flex justify-between items-center">
                <label className="block text-[9px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                  Discount Matrix
                </label>
                {discountType !== "none" && (
                  <button 
                    type="button" 
                    onClick={() => { setDiscountType("none"); setCustomerName(""); }} 
                    className="text-[9px] text-red-600 dark:text-red-400 hover:underline font-bold"
                  >
                    Clear Discount (×)
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button 
                  type="button" 
                  onClick={() => setDiscountType(prev => prev === "senior" ? "none" : "senior")} 
                  className={`p-1.5 border rounded-lg text-[9px] font-bold uppercase transition-all ${discountType==='senior'?'bg-blue-600 text-white border-blue-600 shadow-2xs':'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-300 dark:border-slate-700 hover:bg-gray-50'}`}
                >
                  SENIOR (20%)
                </button>
                <button 
                  type="button" 
                  onClick={() => setDiscountType(prev => prev === "pwd" ? "none" : "pwd")} 
                  className={`p-1.5 border rounded-lg text-[9px] font-bold uppercase transition-all ${discountType==='pwd'?'bg-blue-600 text-white border-blue-600 shadow-2xs':'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-300 dark:border-slate-700 hover:bg-gray-50'}`}
                >
                  PWD (20%)
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    if (["soloparent", "naac", "custom"].includes(discountType)) {
                      setDiscountType("none")
                      setCustomDiscountPercent(0)
                    } else {
                      setShowOthersModal(true)
                    }
                  }} 
                  className={`p-1.5 border rounded-lg text-[9px] font-bold uppercase tracking-wide truncate transition-all ${isOthersActive?'bg-blue-600 text-white border-blue-600 shadow-2xs':'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-300 dark:border-slate-700 hover:bg-gray-50'}`}
                >
                  {discountType === "soloparent" ? "SOLO (10%)" : discountType === "naac" ? "NAAC (20%)" : discountType === "custom" ? `CUSTOM (${customDiscountPercent}%)` : "OTHERS..."}
                </button>
              </div>

              {/* Customer / Named Person ID & Name Entry Card - Shown only when a discount is selected */}
              {discountType !== "none" && (
                <div className="p-2.5 bg-blue-50/40 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 rounded-xl space-y-2 animate-in fade-in duration-150">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-extrabold text-blue-900 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Named Person & ID Auto-Fill
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block text-[9px] font-bold text-gray-600 dark:text-slate-300 uppercase">
                        ID Number:
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="e.g. 10101"
                        value={customerIdNumber}
                        onKeyDown={(e) => {
                          if (e.key === "-" || e.key === "+" || e.key.toLowerCase() === "e" || e.key === ".") {
                            e.preventDefault()
                          }
                        }}
                        onFocus={() => setShowCustomerSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 200)}
                        onChange={e => handleIdNumberChange(e.target.value)}
                        className="w-full p-1.5 border bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-700 rounded-lg text-xs text-gray-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[9px] font-bold text-gray-600 dark:text-slate-300 uppercase">
                        Customer Name:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Kervin"
                        value={customerName}
                        onFocus={() => setShowCustomerSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 200)}
                        onChange={e => handleCustomerNameChange(e.target.value)}
                        className="w-full p-1.5 border bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-700 rounded-lg text-xs text-gray-900 dark:text-white font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <p className="text-[9px] text-blue-700 dark:text-blue-300 font-medium italic">
                    💡 Type ID <span className="font-mono font-bold">10101</span> to auto-fill <span className="font-bold">Kervin</span>, or type name to auto-fill ID.
                  </p>

                  {/* Suggestions dropdown matching both ID & Name */}
                  {showCustomerSuggestions && (customerName.trim().length > 0 || customerIdNumber.trim().length > 0) && (
                    <div className="relative z-40">
                      <div className="absolute left-0 right-0 top-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto font-sans">
                        <div className="flex items-center justify-between p-1.5 px-2.5 border-b dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-[9px] text-gray-500 dark:text-slate-400 font-bold uppercase">
                          <span>Matching ID & Person Registry</span>
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); setShowCustomerSuggestions(false); }}
                            className="text-red-500 hover:text-red-700 font-bold text-xs"
                          >
                            ✕
                          </button>
                        </div>
                        {matchingNamedPersons.length === 0 ? (
                          <div className="p-2.5 text-[10px] text-gray-400 italic">
                            No exact match. New person record will be saved automatically upon sale completion.
                          </div>
                        ) : (
                          matchingNamedPersons.map((person) => (
                            <button
                              key={person.id}
                              type="button"
                              onMouseDown={e => {
                                e.preventDefault()
                                selectNamedPerson(person)
                              }}
                              className="w-full text-left px-3 py-2 text-xs text-gray-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/40 font-medium flex items-center justify-between border-b border-gray-100 dark:border-slate-700/50 last:border-0"
                            >
                              <div>
                                <span className="font-bold text-blue-600 dark:text-blue-400 font-mono mr-1">#{person.idNumber}</span>
                                <span className="font-bold text-gray-900 dark:text-white">{person.name}</span>
                                {person.discountType && person.discountType !== "none" && (
                                  <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 uppercase font-bold">
                                    {person.discountType}
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold uppercase">
                                Auto-Fill
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Customer Previous Purchases Card */}
                  {customerName.trim() && customerPreviousSales.length > 0 && (
                    <div className="mt-2 p-2 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-lg space-y-1 text-xs animate-in fade-in duration-150">
                      <div className="flex justify-between items-center text-[9px] font-bold text-blue-800 dark:text-blue-300 uppercase">
                        <span>Previous History for "{customerName.trim()}"</span>
                        <span className="bg-blue-200 dark:bg-blue-900 px-1.5 py-0.5 rounded">{customerPreviousSales.length} Total Orders</span>
                      </div>
                      <div className="text-[10px] text-gray-700 dark:text-slate-300">
                        <span className="font-semibold text-gray-500">Last Order: </span>
                        <span className="font-mono text-gray-800 dark:text-slate-200">
                          {customerPreviousSales[0].items.map((i: any) => `${i.quantity}x ${i.item?.name || i.name}`).join(", ")}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => readdPreviousItems(customerPreviousSales[0].items)}
                        className="w-full mt-1 py-1 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-[10px] uppercase tracking-wide transition-colors flex items-center justify-center gap-1 shadow-2xs"
                      >
                        🛒 Re-add Previous Items to Cart
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <button 
                  type="button" 
                  onClick={()=>setPaymentMethod("cash")} 
                  className={`p-1.5 border rounded text-center uppercase font-bold tracking-wider text-[10px] transition-all ${paymentMethod==='cash'?'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 shadow-2xs':'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-50'}`}
                >
                  Cash
                </button>
                <button 
                  type="button" 
                  onClick={()=>setPaymentMethod("other")} 
                  className={`p-1.5 border rounded text-center font-bold tracking-tight text-[10px] uppercase transition-all flex items-center justify-center gap-1 ${paymentMethod==='other'?'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 shadow-2xs':'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-50'}`}
                >
                  <CreditCard className="w-3 h-3" />
                  Other (Online)
                </button>
              </div>

              {paymentMethod === "other" && (
                <div className="p-2.5 bg-blue-50/70 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900/50 space-y-2">
                  <span className="block text-[9px] font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider">Select Online Payment Provider:</span>
                  <div className="grid grid-cols-3 gap-1">
                    {(["GCash", "PayMaya", "BDO", "BPI", "Bank Transfer", "Card"] as const).map(ch => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setOnlineChannel(ch)}
                        className={`p-1 rounded text-[9px] font-bold uppercase border transition-all ${onlineChannel === ch ? 'bg-blue-600 text-white border-blue-600 shadow-2xs' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-blue-50'}`}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>

                  {/* Reference Number Entry */}
                  <div className="pt-2 border-t border-blue-200/60 dark:border-blue-900/40 space-y-1">
                    <label className="flex items-center justify-between text-[9px] font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider">
                      <span>Reference Number <span className="text-red-500">*</span>:</span>
                      <span className="text-[8px] text-gray-500 font-normal">Required before checkout</span>
                    </label>
                    <input
                      type="text"
                      placeholder={`Enter ${onlineChannel} reference / ref no...`}
                      value={referenceNumber}
                      onChange={e => setReferenceNumber(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 shadow-2xs"
                    />
                  </div>
                </div>
              )}
            <button 
              type="button" 
              onClick={completeSale} 
              disabled={
                cart.length === 0 || 
                (paymentMethod === "cash" && (parseFloat(cashReceived) || 0) < total) ||
                (paymentMethod === "other" && !referenceNumber.trim())
              } 
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs tracking-wide uppercase shrink-0"
            >
              Complete Sale Transaction
            </button>
          </div>
        </div>
      </div>
    </div>

      {showOthersModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full border space-y-4">
            <h3 className="text-blue-600 font-bold text-sm mb-1 border-b pb-1">Other Privileges</h3>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={()=>{setDiscountType(prev => prev === "soloparent" ? "none" : "soloparent"); setCustomDiscountPercent(0); setShowOthersModal(false);}} className={`p-2 border rounded-xl font-bold text-center text-xs transition-all ${discountType === 'soloparent' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300':'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-100'}`}>SOLO PARENT</button>
              <button type="button" onClick={()=>{setDiscountType(prev => prev === "naac" ? "none" : "naac"); setCustomDiscountPercent(0); setShowOthersModal(false);}} className={`p-2 border rounded-xl font-bold text-center text-xs transition-all ${discountType === 'naac' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300':'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-100'}`}>NAAC</button>
              <button type="button" onClick={()=>{setDiscountType("custom");}} className={`p-2 border rounded-xl font-bold text-center text-xs transition-all ${discountType === 'custom' ? 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-amber-950 dark:text-amber-300':'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-100'}`}>CUSTOM</button>
            </div>

            {discountType === "custom" && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="Percent..."
                  value={customDiscountPercent || ""}
                  onChange={e => setCustomDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                  className="w-full p-2 border bg-white rounded text-xs font-bold"
                />
                <button
                  type="button"
                  onClick={() => setShowOthersModal(false)}
                  className="px-3 py-2 bg-blue-600 text-white rounded font-bold"
                >
                  Apply
                </button>
              </div>
            )}
            <div className="flex justify-end pt-2 border-t">
              <button type="button" onClick={() => setShowOthersModal(false)} className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded font-bold">Close</button>
            </div>
          </div>
        </div>
      )}

      {showReceipt && lastSale && (
        <div 
          onClick={() => setShowReceipt(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-5 font-mono text-[11px] text-gray-800 dark:text-slate-100 space-y-3 shadow-2xl border dark:border-slate-700 printable-receipt max-h-[88vh] flex flex-col justify-between my-auto relative"
          >
            {/* Top Right Close Button */}
            <button
              type="button"
              onClick={() => setShowReceipt(false)}
              className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-full transition-colors z-10"
              title="Close Receipt"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center pr-6">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">Malabon Pharmacy and Clinic</h3>
              <p className="text-gray-500 dark:text-gray-400 text-[10px]">Invoice Record Voucher #{lastSale.id}</p>
              <p className="text-gray-400 dark:text-gray-400 text-[9px] mt-0.5">{formatReceiptDate(lastSale.date)}</p>
            </div>
            
            {/* Scrollable Receipt Items List */}
            <div className="border-t border-b border-dashed border-gray-200 dark:border-slate-700 py-2.5 space-y-1.5 max-h-[32vh] overflow-y-auto pr-1">
              {lastSale.items.map((ci: any, idx: number) => {
                const itemLineTotal = ci.batch && ci.batch.price > 0 ? ci.batch.price * ci.quantity : getItemBatchAwarePrice(ci.item, ci.quantity)
                return (
                  <div key={idx} className="flex justify-between items-start text-xs border-b border-gray-100 dark:border-slate-800 pb-1 last:border-0">
                    <span className="pr-4 leading-tight">
                      {ci.quantity}x {ci.item.name}
                    </span>
                    <span className="font-bold whitespace-nowrap">₱{itemLineTotal.toFixed(2)}</span>
                  </div>
                )
              })}
            </div>

            <div className="space-y-1 text-gray-600 dark:text-slate-300">
              {(() => {
                const cleanCustomerName = (lastSale.customerName || "")
                  .replace(/\s*\(ID:.*?\)/gi, "")
                  .replace(/\s*ID:.*$/gi, "")
                  .trim()
                if (!cleanCustomerName) return null
                return (
                  <div className="flex justify-between text-blue-800 dark:text-blue-300 font-bold border-b border-gray-100 dark:border-slate-800 pb-1">
                    <span>Customer:</span>
                    <span>{cleanCustomerName}</span>
                  </div>
                )
              })()}
              <div className="flex justify-between"><span>Gross Total Base:</span><span>₱{lastSale.grossTotal?.toFixed(2) || lastSale.total.toFixed(2)}</span></div>
              {lastSale.discount > 0 && (
                <div className="flex justify-between text-green-700 dark:text-green-400 font-bold">
                  <span>Applied Markdown ({lastSale.discountLabel}):</span>
                  <span>-₱{lastSale.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between"><span>Net Taxable Base (VAT Ex):</span><span>₱{lastSale.taxableBase?.toFixed(2) || lastSale.total.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Value Added Tax (12%):</span><span>₱{lastSale.vat?.toFixed(2) || "0.00"}</span></div>
              <div className="flex justify-between border-t border-dashed border-gray-200 dark:border-slate-700 pt-1 font-bold text-sm text-gray-900 dark:text-white">
                <span>Grand Total Cost</span>
                <span>₱{lastSale.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-slate-700 text-[10px]">
                <span>Payment Method:</span>
                <span className="font-bold uppercase text-blue-700 dark:text-blue-400">
                  {lastSale.paymentMethod === "other"
                    ? lastSale.onlineChannel
                      ? `ONLINE / ${lastSale.onlineChannel.toUpperCase()}`
                      : "ONLINE PAYMENT"
                    : "CASH"}
                </span>
              </div>
              {lastSale.paymentMethod === "other" && lastSale.referenceNumber && (
                <div className="flex justify-between text-[10px] text-gray-600 dark:text-slate-300">
                  <span>Reference No:</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-white">{lastSale.referenceNumber}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-slate-700">
              <button 
                type="button" 
                onClick={() => window.print()}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg tracking-wide shadow-xs flex items-center justify-center gap-1.5 text-xs transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print Receipt
              </button>
              <button 
                type="button" 
                onClick={() => setShowReceipt(false)} 
                className="flex-1 py-2 bg-gray-900 dark:bg-slate-700 text-white hover:bg-gray-800 dark:hover:bg-slate-600 font-bold rounded-lg tracking-wide shadow-xs text-xs transition-colors"
              >
                Done / Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multiple Manufacturer / Batch Option Selection Modal */}
      {scanMatchOptions && (
        <div 
          onClick={() => setScanMatchOptions(null)}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 relative"
          >
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 rounded-2xl shrink-0">
                  <Scan className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Choose Manufacturer Option</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {scanMatchOptions.code ? (
                      <>Product <span className="font-mono font-bold text-blue-600 dark:text-blue-400">"{scanMatchOptions.code}"</span> has {scanMatchOptions.options.length} manufacturer options available.</>
                    ) : (
                      <>This product has {scanMatchOptions.options.length} manufacturer options available.</>
                    )}
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setScanMatchOptions(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {scanMatchOptions.options.map((opt) => {
                const isOutOfStock = opt.stock <= 0

                return (
                  <button
                    key={`${opt.item.id}-${opt.batchLabel || opt.label}`}
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => {
                      addToCart(opt.item, opt.batch)
                      triggerScanToast(`✓ Added ${opt.label}: ${opt.productName} (${opt.manufacturer}) • ₱${opt.price.toFixed(2)} to cart`, "success")
                      setScanMatchOptions(null)
                    }}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 cursor-pointer ${
                      isOutOfStock
                        ? "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed"
                        : "bg-white dark:bg-slate-900/70 border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 shadow-xs hover:shadow-md active:scale-98"
                    }`}
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono font-bold text-[10px] uppercase shadow-xs">
                          {opt.label}
                        </span>
                        <p className="font-bold text-slate-900 dark:text-white text-xs truncate">{opt.productName}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                          <Building2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          {opt.manufacturer}
                        </span>
                        {opt.batchLabel && (
                          <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 font-bold">
                            Lot: {opt.batchLabel}
                          </span>
                        )}
                        {opt.expiryDate && (
                          <span className="font-mono text-[10px] text-gray-500 dark:text-slate-400">
                            Exp: {opt.expiryDate}
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2 font-mono">
                        <span className="uppercase font-semibold text-blue-600 dark:text-blue-400">{opt.category}</span>
                        <span>•</span>
                        <span className={opt.stock <= (opt.item.minStock || 5) ? "text-red-500 font-bold" : "text-slate-400"}>
                          {opt.stock} in stock
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-bold text-slate-900 dark:text-white text-sm font-mono">₱{opt.price.toFixed(2)}</p>
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase bg-blue-50 dark:bg-blue-950/80 px-2 py-0.5 rounded-md mt-1 inline-block border border-blue-200 dark:border-blue-800">
                        Select & Add
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                type="button"
                onClick={() => setScanMatchOptions(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl font-bold transition-colors text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function formatReceiptDate(d: Date) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  }) + ", " + new Date(d).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  })
}
