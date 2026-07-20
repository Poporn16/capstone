import { useState } from "react"
import type { InventoryItem, Sale } from "../App"
import { Search, Plus, Minus, Trash2, ArrowLeft } from "lucide-react"

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

export function POSCheckout({ inventory, categoriesList, onCompleteSale }: POSCheckoutProps) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [query, setQuery] = useState("")
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>("all")
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash">("cash")
  const [showReceipt, setShowReceipt] = useState(false)
  const [showOthersModal, setShowOthersModal] = useState(false)
  const [lastSale, setLastSale] = useState<any>(null)
  
  const [discountType, setDiscountType] = useState<DiscountType>("none")
  const [customDiscountPercent, setCustomDiscountPercent] = useState<number>(0)
  const [cashReceived, setCashReceived] = useState<string>("")
  const [selectedGenericGroup, setSelectedGenericGroup] = useState<string | null>(null)

  // Isolate the remaining custom layout options
  const dynamicCategories = categoriesList.filter(c => c !== "unmarked category")

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

  const getItemsInGroup = (groupName: string) => {
    return filteredItems.filter(i => getGenericGroupName(i.name) === groupName)
  }

  const getGroupTotalStock = (groupName: string) => {
    return getItemsInGroup(groupName).reduce((sum, item) => sum + item.stock, 0)
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
    if (value === "") {
      setCart(prev => prev.map(ci => ci.item.id === id ? { ...ci, quantity: 0 } : ci))
      return
    }
    if (Number.isNaN(parsed) || parsed < 1) parsed = 1
    if (parsed > maxStock) parsed = maxStock
    setCart(prev => prev.map(ci => ci.item.id === id ? { ...ci, quantity: parsed } : ci))
  }

  const updateQtyDelta = (id: string, delta: number, maxStock: number) => {
    setCart(prev => prev.map(ci => {
      if (ci.item.id !== id) return ci
      const next = ci.quantity + delta
      if (next < 1 || next > maxStock) return ci
      return { ...ci, quantity: next }
    }))
  }

  const subtotal = cart.reduce((s, ci) => s + ci.item.price * ci.quantity, 0)
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs font-medium">
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
          <input type="text" placeholder="Search product..." value={query} onChange={e=>setQuery(e.target.value)} className="w-full border p-2 rounded-lg text-xs" />
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto">
            <button 
              type="button" 
              onClick={()=>{setActiveCategoryTab("all"); setSelectedGenericGroup(null);}} 
              className={`px-4 py-1.5 rounded-md font-bold transition-all ${activeCategoryTab==="all"?'bg-white text-blue-600 shadow-sm':''}`}
            >
              ALL
            </button>
            
            {/* Manually assign Unmarked Category next to the ALL button */}
            <button 
              type="button" 
              onClick={()=>{setActiveCategoryTab("unmarked category"); setSelectedGenericGroup(null);}} 
              className={`px-4 py-1.5 rounded-md font-bold uppercase transition-all ${activeCategoryTab==="unmarked category"?'bg-white text-blue-600 shadow-sm':''}`}
            >
              UNMARKED CATEGORY
            </button>

            {/* Print the remainder custom configuration array list keys */}
            {dynamicCategories.map((t) => (
              <button 
                key={t} 
                type="button" 
                onClick={() => { setActiveCategoryTab(t); setSelectedGenericGroup(null); }} 
                className={`px-4 py-1.5 rounded-md font-bold uppercase transition-all ${activeCategoryTab === t ? 'bg-white text-blue-600 shadow-sm' : ''}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4 min-h-[450px]">
          {selectedGenericGroup ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <button 
                  type="button" 
                  onClick={() => setSelectedGenericGroup(null)} 
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Grid
                </button>
                <span className="font-bold text-sm text-blue-600 tracking-wide">{selectedGenericGroup} OPTIONS</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {getItemsInGroup(selectedGenericGroup).map(item => (
                  <button 
                    key={item.id} 
                    type="button" 
                    onClick={() => addToCart(item)}
                    disabled={item.stock === 0}
                    className={`relative text-left p-4 rounded-xl border-2 bg-white transition-all flex flex-col justify-between min-h-[110px] ${item.stock === 0 ? 'opacity-40 border-gray-200 bg-gray-50 cursor-not-allowed':'border-blue-500 hover:shadow-md hover:scale-[1.01]'}`}
                  >
                    <span className="absolute top-2 right-3 font-mono text-gray-500 font-bold text-[10px]">{item.stock}</span>
                    <div className="pr-6 font-bold text-gray-900 text-[11px] leading-tight mt-1">{item.name}</div>
                    <div className="flex justify-between items-center border-t border-gray-100 pt-2 mt-2 font-mono">
                      <span className="text-gray-400 text-[9px] font-normal">{item.barcode}</span>
                      <span className="text-blue-600 font-bold text-xs">₱{item.price.toFixed(2)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="font-semibold text-sm text-gray-800 tracking-wide">Available Products Catalogue</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {uniqueGroups.map(groupName => {
                  const itemsInGroup = getItemsInGroup(groupName)
                  const totalStock = getGroupTotalStock(groupName)
                  const hasVariants = itemsInGroup.length > 1

                  return (
                    <button 
                      key={groupName} 
                      type="button" 
                      onClick={() => {
                        if (hasVariants) {
                          setSelectedGenericGroup(groupName)
                        } else if (itemsInGroup[0]) {
                          addToCart(itemsInGroup[0])
                        }
                      }}
                      disabled={totalStock === 0}
                      className={`text-left p-4 rounded-xl border-2 transition-all flex flex-col justify-between min-h-[110px] relative ${totalStock === 0 ? 'bg-gray-50 border-gray-200 opacity-40 cursor-not-allowed' : hasVariants ? 'border-purple-400 bg-purple-50/10 hover:border-purple-600 hover:shadow-md' : 'border-gray-200 bg-white hover:border-blue-400 hover:shadow-md'}`}
                    >
                      <span className="absolute top-2 right-3 font-mono text-gray-500 font-bold text-[10px]">{totalStock}</span>
                      <div className="pr-6 font-bold text-gray-900 text-[11px] leading-tight mt-1 truncate-2-lines">{groupName}</div>
                      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-[10px]">
                        {hasVariants ? (
                          <span className="text-purple-600 font-bold bg-purple-100 px-1.5 py-0.5 rounded-[4px] text-[9px]">
                            {itemsInGroup.length} VARIANTS
                          </span>
                        ) : (
                          <span className="text-blue-600 font-bold text-xs font-mono">
                            ₱{itemsInGroup[0]?.price.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h2 className="font-semibold mb-4 text-sm">Current Sale Cart</h2>
          <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {cart.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-8">Cart is empty</p>
            ) : (
              cart.map(ci => (
                <div key={ci.item.id} className="p-3 bg-gray-50 rounded-lg border flex justify-between items-center">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-bold text-gray-900 truncate">{ci.item.name}</p>
                    <p className="text-gray-500 font-mono text-[10px]">₱{ci.item.price.toFixed(2)} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={()=>updateQtyDelta(ci.item.id, -1, ci.item.stock)} className="px-2 py-0.5 border bg-white rounded font-bold hover:bg-gray-50">-</button>
                    <input type="text" value={ci.quantity} onChange={e=>handleManualQtyChange(ci.item.id, e.target.value, ci.item.stock)} className="w-10 text-center border rounded font-bold text-gray-900 bg-white" />
                    <button type="button" onClick={()=>updateQtyDelta(ci.item.id, 1, ci.item.stock)} className="px-2 py-0.5 border bg-white rounded font-bold hover:bg-gray-50">+</button>
                    <button type="button" onClick={()=>setCart(prev => prev.filter(i => i.item.id !== ci.item.id))} className="text-red-500 ml-1 font-bold text-base hover:text-red-700">×</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t pt-3 space-y-1.5 mb-4 text-gray-600">
            <div className="flex justify-between">
              <span>Gross Total Price:</span>
              <span>₱{subtotal.toFixed(2)}</span>
            </div>
            {computedDiscount > 0 && (
              <div className="flex justify-between text-green-700 font-bold">
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
            <div className="flex justify-between border-t border-dashed pt-2 font-bold text-gray-900 text-sm">
              <span>Total Bill Due:</span>
              <span className="text-base text-blue-600 font-bold font-mono">₱{total.toFixed(2)}</span>
            </div>
          </div>

          {paymentMethod === "cash" && cart.length > 0 && (
            <div className="mb-4 space-y-2 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
              <div className="flex justify-between items-center gap-2">
                <label className="font-bold whitespace-nowrap text-gray-700">Cash Rendered:</label>
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
                  className="w-full text-right p-1.5 border bg-white rounded-lg font-bold text-gray-900 text-sm focus:ring-1 focus:ring-blue-500" 
                />
              </div>
              {parseFloat(cashReceived) > 0 && (
                <div className="flex justify-between items-center text-[11px] pt-1 border-t border-blue-100">
                  <span className="text-gray-600">Change Return Cash:</span>
                  <span className={`font-bold font-mono text-sm ${parseFloat(cashReceived) - total < 0 ? "text-red-600" : "text-blue-700"}`}>
                    {parseFloat(cashReceived) - total < 0 ? `Short: ₱${Math.abs(parseFloat(cashReceived) - total).toFixed(2)}` : `₱${(parseFloat(cashReceived) - total).toFixed(2)}`}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="mb-4 bg-gray-50 p-2 rounded-lg space-y-2 border">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide">Discount Matrix</label>
            <div className="grid grid-cols-5 gap-1">
              {["5","10","20","100"].map(p=>(
                <button 
                  key={p} 
                  type="button" 
                  onClick={()=>setDiscountType(p as any)} 
                  className={`p-1.5 border rounded text-xs font-bold transition-all ${discountType===p?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >
                  {p}%
                </button>
              ))}
              <button type="button" onClick={()=>setDiscountType("none")} className="p-1.5 border rounded bg-red-50 text-red-600 font-bold hover:bg-red-100">×</button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button 
                type="button" 
                onClick={()=>setDiscountType("senior")} 
                className={`p-1.5 border rounded text-[10px] font-bold uppercase transition-all ${discountType==='senior'?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                SNR
              </button>
              <button 
                type="button" 
                onClick={()=>setDiscountType("pwd")} 
                className={`p-1.5 border rounded text-[10px] font-bold uppercase transition-all ${discountType==='pwd'?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                PWD
              </button>
              <button 
                type="button" 
                onClick={()=>setShowOthersModal(true)} 
                className={`p-1.5 border rounded text-[10px] font-bold uppercase tracking-wide truncate transition-all ${isOthersActive?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                {discountType === "naac" ? "NAAC" : discountType === "soloparent" ? "SOLO PARENT" : discountType === "custom" ? `CUSTOM (${customDiscountPercent}%)` : "OTHERS"}
              </button>
            </div>
          </div>

          <div className="mb-4 space-y-1">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide">Payment Method</label>
            <div className="grid grid-cols-2 gap-2">
              {["cash", "gcash"].map((m:any)=>(
                <button 
                  key={m} 
                  type="button" 
                  onClick={()=>setPaymentMethod(m)} 
                  className={`p-2 border rounded text-center uppercase font-bold tracking-wider transition-all ${paymentMethod===m?'border-blue-600 bg-blue-50 text-blue-700':'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <button type="button" onClick={completeSale} disabled={cart.length === 0 || (paymentMethod === "cash" && (parseFloat(cashReceived) || 0) < total)} className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-bold shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm tracking-wide">Complete Sale Transaction</button>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 font-mono text-[11px] text-gray-800 space-y-4 shadow-xl border">
            <div className="text-center">
              <h3 className="font-bold text-sm text-gray-900">Malabon Pharmacy and Clinic</h3>
              <p className="text-gray-500 text-[10px]">Invoice Record Voucher #{lastSale.id}</p>
              <p className="text-gray-400 text-[9px] mt-0.5">{formatReceiptDate(lastSale.date)}</p>
            </div>
            
            <div className="border-t border-b border-dashed py-2.5 space-y-1">
              {lastSale.items.map((ci: any, idx: number) => (
                <div key={idx} className="flex justify-between items-start">
                  <span className="pr-4">{ci.quantity}x {ci.item.name}</span>
                  <span className="font-bold whitespace-nowrap">₱{(ci.item.price * ci.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-gray-600">
              <div className="flex justify-between"><span>Gross Total Base:</span><span>₱{lastSale.grossTotal?.toFixed(2) || lastSale.total.toFixed(2)}</span></div>
              {lastSale.discount > 0 && (
                <div className="flex justify-between text-green-700 font-bold">
                  <span>Applied Markdown ({lastSale.discountLabel}):</span>
                  <span>-₱{lastSale.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between"><span>Net Taxable Base (VAT Ex):</span><span>₱{lastSale.taxableBase?.toFixed(2) || lastSale.total.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Value Added Tax (12%):</span><span>₱{lastSale.vat?.toFixed(2) || "0.00"}</span></div>
              <div className="flex justify-between border-t border-dashed pt-1 font-bold text-sm">
                <span>Grand Total Cost</span>
                <span>₱{lastSale.total.toFixed(2)}</span>
              </div>
            </div>

            <button 
              type="button" 
              onClick={() => setShowReceipt(false)} 
              className="w-full py-2 bg-gray-900 text-white hover:bg-gray-800 font-bold rounded-lg tracking-wide shadow-xs"
            >
              Close Invoice Sheet
            </button>
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