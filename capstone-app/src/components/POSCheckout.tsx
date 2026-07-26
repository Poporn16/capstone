import { useState } from "react"
import type { InventoryItem, Sale } from "../App"
import { ArrowLeft, Printer, CreditCard, X } from "lucide-react"

interface POSCheckoutProps {
  inventory: InventoryItem[]
  categoriesList: string[]
  onCompleteSale: (sale: Sale) => void
}

interface CartItem {
  item: InventoryItem
  quantity: number
}

type DiscountType = "none" | "5" | "10" | "20" | "100" | "senior" | "pwd" | "naac" | "soloparent" | "custom"
type OnlineChannel = "GCash" | "PayMaya" | "BDO" | "BPI" | "Bank Transfer" | "Card" | "Other"

export function POSCheckout({ inventory, categoriesList, onCompleteSale }: POSCheckoutProps) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [query, setQuery] = useState("")
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>("all")
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "other">("cash")
  const [onlineChannel, setOnlineChannel] = useState<OnlineChannel>("GCash")
  const [showReceipt, setShowReceipt] = useState(false)
  const [showOthersModal, setShowOthersModal] = useState(false)
  const [lastSale, setLastSale] = useState<any>(null)
  
  const [discountType, setDiscountType] = useState<DiscountType>("none")
  const [customDiscountPercent, setCustomDiscountPercent] = useState<number>(0)
  const [cashReceived, setCashReceived] = useState<string>("")
  const [selectedGenericGroup, setSelectedGenericGroup] = useState<string | null>(null)
  const [displayLimit, setDisplayLimit] = useState<number>(20)

  const dynamicCategories = categoriesList.filter(c => c !== "unmarked category")

  const handleCategoryTabChange = (cat: string) => {
    setActiveCategoryTab(cat)
    setSelectedGenericGroup(null)
    setDisplayLimit(20)
  }

  const handleQueryChange = (val: string) => {
    setQuery(val)
    setDisplayLimit(20)
  }

  const handleCatalogueScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop <= clientHeight + 60) {
      if (displayLimit < uniqueGroups.length) {
        setDisplayLimit(prev => prev + 20)
      }
    }
  }

  const getCategoryBadgeStyle = (catName: string) => {
    const normalized = (catName || "").toLowerCase().trim()
    if (normalized.includes("prescription") || normalized.includes("rx")) return "bg-pink-100 text-pink-800 border-pink-300"
    if (normalized.includes("otc") || normalized.includes("counter")) return "bg-blue-100 text-blue-800 border-blue-300"
    if (normalized.includes("supply") || normalized.includes("supplies")) return "bg-emerald-100 text-emerald-800 border-emerald-300"
    if (normalized.includes("wellness") || normalized.includes("vitamin")) return "bg-purple-100 text-purple-800 border-purple-300"
    if (normalized.includes("first aid")) return "bg-amber-100 text-amber-800 border-amber-300"
    if (normalized.includes("cardiovascular")) return "bg-[#e0f2fe] text-[#0369a1] border-[#7dd3fc]"
    if (normalized.includes("respiratory")) return "bg-[#e0e7ff] text-[#3730a3] border-[#a5b4fc]"
    if (normalized.includes("gastrointestinal")) return "bg-[#ccfbf1] text-[#0f766e] border-[#5eead4]"
    return "bg-slate-100 text-slate-800 border-slate-300"
  }

  const getCategoryCardBorder = (catName: string) => {
    const normalized = (catName || "").toLowerCase().trim()
    if (normalized.includes("prescription") || normalized.includes("rx") || normalized.includes("pain")) return "border-2 border-blue-500 bg-blue-50/20"
    if (normalized.includes("antibiotic")) return "border-2 border-cyan-400 bg-cyan-50/20"
    if (normalized.includes("supply") || normalized.includes("supplies")) return "border-2 border-emerald-400 bg-emerald-50/20"
    if (normalized.includes("wellness") || normalized.includes("vitamin")) return "border-2 border-purple-400 bg-purple-50/20"
    if (normalized.includes("first aid")) return "border-2 border-amber-400 bg-amber-50/20"
    if (normalized.includes("cardiovascular") || normalized.includes("cardio")) return "border-2 border-sky-400 bg-sky-50/20"
    if (normalized.includes("respiratory") || normalized.includes("lung")) return "border-2 border-teal-500 bg-teal-50/20"
    if (normalized.includes("gastrointestinal") || normalized.includes("gastro")) return "border-2 border-indigo-400 bg-indigo-50/20"
    return "border-2 border-slate-300 bg-white"
  }

  const getCategoryBorderHex = (catName: string): string => {
    const n = (catName || "").toLowerCase().trim()
    if (n.includes("prescription") || n.includes("rx") || n.includes("pain")) return "#3b82f6"
    if (n.includes("antibiotic")) return "#22d3ee"
    if (n.includes("supply") || n.includes("supplies")) return "#34d399"
    if (n.includes("wellness") || n.includes("vitamin")) return "#c084fc"
    if (n.includes("first aid")) return "#fbbf24"
    if (n.includes("cardiovascular") || n.includes("cardio")) return "#38bdf8"
    if (n.includes("respiratory") || n.includes("lung")) return "#14b8a6"
    if (n.includes("gastrointestinal") || n.includes("gastro")) return "#818cf8"
    return "#94a3b8"
  }

  const getGenericGroupName = (name: string) => {
    const uppercaseName = name.toUpperCase().trim()
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
  const visibleGroups = uniqueGroups.slice(0, displayLimit)

  const getItemsInGroup = (groupName: string) => {
    return filteredItems.filter(i => getGenericGroupName(i.name) === groupName)
  }

  const getGroupTotalStock = (groupName: string) => {
    return getItemsInGroup(groupName).reduce((sum, item) => sum + item.stock, 0)
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

  const addToCart = (item: InventoryItem) => {
    setCart(prev => {
      const existing = prev.find(ci => ci.item.id === item.id)
      if (existing) {
        return existing.quantity < item.stock
          ? prev.map(ci => ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci)
          : prev
      }
      return item.stock > 0 ? [...prev, { item, quantity: 1 }] : prev
    })
  }

  const handleManualQtyChange = (id: string, value: string, maxStock: number) => {
    let parsed = parseInt(value)
    if (value === "" || Number.isNaN(parsed) || parsed < 1) {
      setCart(prev => prev.filter(ci => ci.item.id !== id))
      return
    }
    if (parsed > maxStock) parsed = maxStock
    setCart(prev => prev.map(ci => ci.item.id === id ? { ...ci, quantity: parsed } : ci))
  }

  const updateQtyDelta = (id: string, delta: number, maxStock: number) => {
    setCart(prev => {
      return prev.map(ci => {
        if (ci.item.id !== id) return ci
        const next = ci.quantity + delta
        if (next < 1) return null
        if (next > maxStock) return ci
        return { ...ci, quantity: next }
      }).filter(Boolean) as CartItem[]
    })
  }

  const subtotal = cart.reduce((s, ci) => s + getItemBatchAwarePrice(ci.item, ci.quantity), 0)
  const isStatutoryDiscount = ["senior", "pwd", "soloparent", "naac"].includes(discountType)
  let computedDiscount = 0, vat = 0, total = subtotal

  if (isStatutoryDiscount) {
    const base = subtotal / 1.12
    computedDiscount = base * (discountType === "soloparent" ? 0.10 : 0.20)
    total = base - computedDiscount
  } else {
    let rate = 0
    if (discountType === "5") rate = 0.05
    else if (discountType === "10") rate = 0.10
    else if (discountType === "20") rate = 0.20
    else if (discountType === "100") rate = 1.00
    else if (discountType === "custom") rate = (Number(customDiscountPercent) || 0) / 100

    computedDiscount = subtotal * rate
    const net = subtotal - computedDiscount
    vat = (net / 1.12) * 0.12
    total = net
  }

  const getDiscountLabel = () => {
    if (discountType === "none") return "NONE"
    if (discountType === "custom") return `CUSTOM (${customDiscountPercent || 0}%)`
    if (discountType === "soloparent") return "SOLO PARENT"
    if (discountType === "senior") return "SENIOR CITIZEN"
    if (discountType === "pwd") return "PWD"
    if (discountType === "naac") return "NAAC"
    return `${discountType}% DISCOUNT`
  }

  const isOthersActive = ["naac", "soloparent", "custom"].includes(discountType)

  const completeSale = () => {
    if (!cart.length || (paymentMethod === "cash" && parseFloat(cashReceived) < total)) return

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
      cashReceived: paymentMethod === "cash" ? parseFloat(cashReceived) : total,
      change: paymentMethod === "cash" ? parseFloat(cashReceived) - total : 0,
      paymentMethod,
      onlineChannel: paymentMethod === "other" ? onlineChannel : null,
      discountLabel: getDiscountLabel()
    }

    onCompleteSale(saleRecord as any)
    setLastSale(saleRecord)
    setCart([])
    setDiscountType("none")
    setCashReceived("")
    setShowReceipt(true)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 text-xs font-medium">
      <div className="lg:col-span-2 space-y-3 flex flex-col">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border dark:border-slate-700 p-3.5 space-y-2.5 shrink-0">
          <input 
            type="text" 
            placeholder="Search product name or code..." 
            value={query} 
            onChange={e => handleQueryChange(e.target.value)} 
            className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-800 dark:text-white p-2.5 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" 
          />
          <div className="flex gap-1.5 bg-gray-100 dark:bg-slate-900 p-1.5 rounded-xl overflow-x-auto border dark:border-slate-700">
            <button 
              type="button" 
              onClick={() => handleCategoryTabChange("all")} 
              className={`px-3.5 py-1.5 rounded-lg font-extrabold text-xs transition-all border whitespace-nowrap ${
                activeCategoryTab === "all"
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700 dark:hover:text-white font-bold'
              }`}
            >
              ALL
            </button>
            
            <button 
              type="button" 
              onClick={() => handleCategoryTabChange("unmarked category")} 
              className={`px-3.5 py-1.5 rounded-lg font-extrabold text-xs uppercase transition-all border whitespace-nowrap ${
                activeCategoryTab === "unmarked category"
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700 dark:hover:text-white font-bold'
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
                  className={`px-3.5 py-1.5 rounded-lg font-extrabold text-xs uppercase transition-all border whitespace-nowrap ${
                    isActive 
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                      : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700 dark:hover:text-white font-bold'
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
          className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border dark:border-slate-700 p-4 max-h-[calc(100vh-230px)] overflow-y-auto"
        >
          {selectedGenericGroup ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2 dark:border-slate-700">
                <button 
                  type="button" 
                  onClick={() => setSelectedGenericGroup(null)} 
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Grid
                </button>
                <span className="font-bold text-xs text-blue-600 tracking-wide">{selectedGenericGroup} OPTIONS</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {getItemsInGroup(selectedGenericGroup).map(item => {
                  const displayUnitPrice = getItemBatchAwarePrice(item, 1)
                  const cardBorder = getCategoryCardBorder(item.category)

                  return (
                    <button 
                      key={item.id} 
                      type="button" 
                      onClick={() => addToCart(item)}
                      disabled={item.stock === 0}
                      className={`relative text-left p-3.5 rounded-2xl ${cardBorder} transition-all flex flex-col justify-between min-h-[110px] ${item.stock === 0 ? 'opacity-40 border-gray-200 bg-gray-50 cursor-not-allowed':'hover:shadow-lg hover:scale-[1.01]'}`}
                    >
                      <div className="flex justify-end items-start">
                        <span className="font-mono text-gray-500 font-bold text-[10px]">{item.stock} left</span>
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-xs leading-tight mt-1">{item.name}</div>
                      <div className="flex justify-between items-center pt-2 mt-2 font-mono border-t border-gray-100">
                        <span className="text-gray-400 text-[9px] font-normal">{item.barcode || "No Barcode"}</span>
                        <span className="text-blue-600 font-bold text-xs">₱{displayUnitPrice.toFixed(2)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-xs text-gray-800 dark:text-slate-200 tracking-wide">Available Products Catalogue</h2>
                <span className="text-[10px] text-gray-500 font-mono font-bold">
                  Showing {visibleGroups.length} of {uniqueGroups.length} items
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {visibleGroups.map(groupName => {
                  const itemsInGroup = getItemsInGroup(groupName)
                  const totalStock = getGroupTotalStock(groupName)
                  const hasVariants = itemsInGroup.length > 1
                  const primaryItem = itemsInGroup[0]
                  const displayUnitPrice = primaryItem ? getItemBatchAwarePrice(primaryItem, 1) : 0
                  const cardBorder = primaryItem ? getCategoryCardBorder(primaryItem.category) : "border-2 border-gray-200"

                  return (
                    <button 
                      key={groupName} 
                      type="button" 
                      onClick={() => {
                        if (hasVariants) {
                          setSelectedGenericGroup(groupName)
                        } else if (primaryItem) {
                          addToCart(primaryItem)
                        }
                      }}
                      disabled={totalStock === 0}
                      className={`text-left p-3.5 rounded-2xl ${cardBorder} transition-all flex flex-col justify-between min-h-[110px] relative ${totalStock === 0 ? 'bg-gray-50 border-gray-200 opacity-40 cursor-not-allowed' : 'hover:shadow-lg hover:scale-[1.01]'}`}
                    >
                      <div className="flex justify-between items-center">
                        {hasVariants ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-bold uppercase tracking-wider">Group</span>
                        ) : (
                          <span />
                        )}
                        <span className="font-mono text-gray-500 font-bold text-[10px]">{totalStock} left</span>
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-xs leading-tight mt-1 truncate-2-lines">{groupName}</div>
                      <div className="mt-2 flex items-center justify-between text-[10px]">
                        {hasVariants && (
                          <span className="text-[9px] text-gray-500 font-medium">({itemsInGroup.length} items)</span>
                        )}
                        <span className="text-blue-600 font-bold text-xs font-mono ml-auto">
                          ₱{displayUnitPrice.toFixed(2)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {uniqueGroups.length > displayLimit && (
                <div className="pt-3 text-center">
                  <button
                    type="button"
                    onClick={() => setDisplayLimit(prev => prev + 20)}
                    className="px-4 py-2 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold transition-all border border-blue-200 dark:border-blue-900"
                  >
                    Load More Items ({uniqueGroups.length - displayLimit} remaining) ↓
                  </button>
                </div>
              )}
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

                return Object.entries(genericGroups).map(([groupName, groupItems]) => (
                  <div key={groupName} className="rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 shadow-xs">
                    <div
                      className="flex items-center gap-2 px-2.5 py-1"
                      style={{ backgroundColor: getCategoryBorderHex(groupItems[0]?.item.category) + '22' }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: getCategoryBorderHex(groupItems[0]?.item.category) }} />
                      <span className="font-black text-[9px] uppercase tracking-widest" style={{ color: getCategoryBorderHex(groupItems[0]?.item.category) }}>
                        {groupName}
                      </span>
                      {groupItems.length > 1 && (
                        <span className="ml-auto bg-white rounded-full px-1.5 py-0.5 text-[8px] font-bold text-gray-500 border">
                          {groupItems.length} variants
                        </span>
                      )}
                    </div>

                    {groupItems.map((ci, itemIdx) => {
                      const itemTotal = getItemBatchAwarePrice(ci.item, ci.quantity)
                      const avgUnitPrice = itemTotal / ci.quantity
                      return (
                        <div key={ci.item.id} className={`flex justify-between items-center px-2.5 py-1.5 bg-white dark:bg-slate-800 ${itemIdx < groupItems.length - 1 ? 'border-b border-dashed border-gray-100 dark:border-slate-700' : ''}`}>
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="font-bold text-gray-900 dark:text-white truncate text-[10px]">{ci.item.name}</p>
                            <p className="text-gray-400 font-mono text-[9px]">₱{avgUnitPrice.toFixed(2)} / pc</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => updateQtyDelta(ci.item.id, -1, ci.item.stock)} className="w-5 h-5 border bg-gray-50 dark:bg-slate-700 rounded font-bold hover:bg-gray-100 flex items-center justify-center text-gray-700 dark:text-gray-200 text-xs">-</button>
                            <input type="text" value={ci.quantity} onChange={e => handleManualQtyChange(ci.item.id, e.target.value, ci.item.stock)} className="w-8 text-center border rounded font-bold text-gray-900 dark:text-white bg-white dark:bg-slate-900 text-[10px] py-0.5" />
                            <button type="button" onClick={() => updateQtyDelta(ci.item.id, 1, ci.item.stock)} className="w-5 h-5 border bg-gray-50 dark:bg-slate-700 rounded font-bold hover:bg-gray-100 flex items-center justify-center text-gray-700 dark:text-gray-200 text-xs">+</button>
                            <button type="button" onClick={() => setCart(prev => prev.filter(i => i.item.id !== ci.item.id))} className="text-red-400 ml-0.5 font-bold text-xs hover:text-red-600">×</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))
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
              <div className="space-y-1.5 p-2 bg-blue-50/50 dark:bg-blue-950/40 rounded-lg border border-blue-100 dark:border-blue-900/50 text-[11px]">
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
                    className="w-28 text-right p-1 border bg-white dark:bg-slate-900 rounded font-bold text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-blue-500" 
                  />
                </div>
                {parseFloat(cashReceived) > 0 && (
                  <div className="flex justify-between items-center text-[10px] pt-1 border-t border-blue-100 dark:border-blue-900">
                    <span className="text-gray-600 dark:text-slate-300">Change Return Cash:</span>
                    <span className={`font-bold font-mono text-xs ${parseFloat(cashReceived) - total < 0 ? "text-red-600 dark:text-red-400" : "text-blue-700 dark:text-blue-300"}`}>
                      {parseFloat(cashReceived) - total < 0 ? `Short: ₱${Math.abs(parseFloat(cashReceived) - total).toFixed(2)}` : `₱${(parseFloat(cashReceived) - total).toFixed(2)}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="bg-gray-50 dark:bg-slate-900 p-2 rounded-lg space-y-1.5 border dark:border-slate-700">
              <label className="block text-[9px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Discount Matrix</label>
              <div className="grid grid-cols-5 gap-1">
                {["5","10","20","100"].map(p=>(
                  <button 
                    key={p} 
                    type="button" 
                    onClick={()=>setDiscountType(p as any)} 
                    className={`p-1 border rounded text-[10px] font-bold transition-all ${discountType===p?'bg-blue-600 text-white border-blue-600':'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-300 dark:border-slate-700 hover:bg-gray-50'}`}
                  >
                    {p}%
                  </button>
                ))}
                <button type="button" onClick={()=>setDiscountType("none")} className="p-1 border rounded bg-red-50 text-red-600 font-bold hover:bg-red-100">×</button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button 
                  type="button" 
                  onClick={()=>setDiscountType("senior")} 
                  className={`p-1 border rounded text-[9px] font-bold uppercase transition-all ${discountType==='senior'?'bg-blue-600 text-white border-blue-600':'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-300 dark:border-slate-700 hover:bg-gray-50'}`}
                >
                  SENIOR
                </button>
                <button 
                  type="button" 
                  onClick={()=>setDiscountType("pwd")} 
                  className={`p-1 border rounded text-[9px] font-bold uppercase transition-all ${discountType==='pwd'?'bg-blue-600 text-white border-blue-600':'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-300 dark:border-slate-700 hover:bg-gray-50'}`}
                >
                  PWD
                </button>
                <button 
                  type="button" 
                  onClick={()=>setShowOthersModal(true)} 
                  className={`p-1 border rounded text-[9px] font-bold uppercase tracking-wide truncate transition-all ${isOthersActive?'bg-blue-600 text-white border-blue-600':'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-300 dark:border-slate-700 hover:bg-gray-50'}`}
                >
                  {discountType === "naac" ? "NAAC" : discountType === "soloparent" ? "SOLO" : discountType === "custom" ? `CUSTOM` : "OTHERS"}
                </button>
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
                <div className="p-2 bg-blue-50/70 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900/50 space-y-1">
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
                </div>
              )}
            </div>

            <button 
              type="button" 
              onClick={completeSale} 
              disabled={cart.length === 0 || (paymentMethod === "cash" && (parseFloat(cashReceived) || 0) < total)} 
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs tracking-wide uppercase shrink-0"
            >
              Complete Sale Transaction
            </button>
          </div>
        </div>
      </div>

      {showOthersModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full border space-y-4">
            <h3 className="text-blue-600 font-bold text-sm mb-1 border-b pb-1">Other Privileges</h3>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={()=>{setDiscountType("naac"); setCustomDiscountPercent(0); setShowOthersModal(false);}} className={`p-2 border rounded font-bold text-center transition-all ${discountType === 'naac' ? 'border-blue-500 bg-blue-50 text-blue-700':'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}>NAAC</button>
              <button type="button" onClick={()=>{setDiscountType("soloparent"); setCustomDiscountPercent(0); setShowOthersModal(false);}} className={`p-2 border rounded font-bold text-center transition-all ${discountType === 'soloparent' ? 'border-blue-500 bg-blue-50 text-blue-700':'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}>SOLO PARENT</button>
              <button type="button" onClick={()=>{setDiscountType("custom");}} className={`p-2 border rounded font-bold text-center transition-all ${discountType === 'custom' ? 'border-yellow-500 bg-yellow-50 text-yellow-700':'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}>CUSTOM</button>
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
                const itemLineTotal = getItemBatchAwarePrice(ci.item, ci.quantity)
                return (
                  <div key={idx} className="flex justify-between items-start text-xs border-b border-gray-100 dark:border-slate-800 pb-1 last:border-0">
                    <span className="pr-4 leading-tight">{ci.quantity}x {ci.item.name}</span>
                    <span className="font-bold whitespace-nowrap">₱{itemLineTotal.toFixed(2)}</span>
                  </div>
                )
              })}
            </div>

            <div className="space-y-1 text-gray-600 dark:text-slate-300">
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
    </div>
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
