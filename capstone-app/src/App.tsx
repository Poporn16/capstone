import { useState, useEffect } from "react"
import { Home, ShoppingCart, Package, Clock, ShieldAlert, LogOut, ClipboardList, Menu, X, Bell, AlertTriangle, Sun, Moon, ChevronLeft, ChevronRight } from "lucide-react"
import { Dashboard } from "./components/Dashboard"
import { POSCheckout } from "./components/POSCheckout"
import { InventoryManager } from "./components/InventoryManager"
import { StockAdjustment } from "./components/StockAdjustment"
import { SalesHistory } from "./components/SalesHistory"
import { AdminPanel } from "./components/AdminPanel"
import { LoginScreen } from "./components/LoginScreen"
import { supabase, broadcastChannel, triggerGlobalSync } from "./components/apiClient"

export interface InventoryItem {
  id: string
  name: string
  category: string
  price: number
  cost: number
  stock: number
  minStock: number
  barcode: string
  manufacturer: string
  batches: { id: string; batchLabel: string; stock: number; expiryDate: string; cost: number; price: number }[]
}

export interface SaleItem {
  item: InventoryItem
  quantity: number
}

export interface Sale {
  id: string
  date: Date
  items: SaleItem[]
  grossTotal: number
  subtotal: number
  discount: number
  taxableBase: number
  vat: number
  total: number
  cashReceived: number
  change: number
  paymentMethod: "cash" | "other"
  discountLabel: string
  processedBy: string
  isRefunded?: boolean
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard")
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [categoriesList, setCategoriesList] = useState<string[]>([])

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("pinv_theme") as "light" | "dark") || "light"
  })

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const [currentOperator, setCurrentOperator] = useState<{ username: string; displayName: string; systemRole: string } | null>(() => {
    try {
      const stored = localStorage.getItem("pinv_session")
      if (stored) {
        const parsed = JSON.parse(stored)
        const twelveHours = 12 * 60 * 60 * 1000
        if (parsed.timestamp && (Date.now() - parsed.timestamp < twelveHours)) {
          return parsed.operator
        }
      }
    } catch (e) {
      console.error("Failed to restore session", e)
    }
    return null
  })

  useEffect(() => {
    localStorage.setItem("pinv_theme", theme)
    if (theme === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [theme])

  const saveSession = (operator: any) => {
    setCurrentOperator(operator)
    try {
      localStorage.setItem("pinv_session", JSON.stringify({
        operator,
        timestamp: Date.now()
      }))
    } catch (e) {}
  }

  const handleLogout = () => {
    localStorage.removeItem("pinv_session")
    const op = currentOperator
    setCurrentOperator(null)
    setActiveTab("dashboard")
    if (op) {
      logSystemAction("SESSION_LOGOUT", "AUTHENTICATION Portal", `Terminated station session for @${op.username}`).catch(() => {})
    }
  }

  const deleteInventoryItem = async (idOrName: string) => {
    const item = inventory.find(i => String(i.id) === String(idOrName) || i.name === idOrName)
    if (!item) return

    // Instantly filter out from UI state
    setInventory(prev => prev.filter(i => String(i.id) !== String(item.id) && i.name !== item.name))

    try {
      const numId = Number(item.id)

      if (!isNaN(numId)) {
        await supabase.from('inventory_batches').delete().eq('item_id', numId)
        await supabase.from('sale_items').delete().eq('item_id', numId)
      }
      await supabase.from('inventory_batches').delete().eq('item_id', String(item.id))
      await supabase.from('sale_item_batches').delete().eq('item_name', item.name)

      if (!isNaN(numId)) {
        await supabase.from('inventory').delete().eq('id', numId)
      }
      await supabase.from('inventory').delete().eq('id', String(item.id))
      await supabase.from('inventory').delete().eq('name', item.name)

      await logSystemAction("DELETE_PRODUCT", "ITEM_SPECIFICATIONS", `Deleted product profile template for "${item.name}"`)
      triggerGlobalSync()
    } catch (err: any) {
      console.error("Error deleting item:", err)
    }
  }

  useEffect(() => {
    if (currentOperator) {
      logSystemAction("SESSION_LOGIN", "AUTHENTICATION Portal", `Session active for @${currentOperator.username}`).catch(() => {})
      fetchCategories()
      fetchInventory()
      fetchSales()
    }

    // Realtime postgres subscriptions for instant multi-client syncing
    const channel = supabase
      .channel("global-app-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => {
        fetchInventory()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_batches" }, () => {
        fetchInventory()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => {
        fetchSales()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "product_categories" }, () => {
        fetchCategories()
      })
      .subscribe()

    const handleRealtimeRefresh = () => {
      fetchCategories()
      fetchInventory()
      fetchSales()
    }

    window.addEventListener("refresh_sales_data", handleRealtimeRefresh)

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "pinv_last_sync_signal") {
        handleRealtimeRefresh()
      }
    }
    window.addEventListener("storage", handleStorageChange)

    if (broadcastChannel) {
      broadcastChannel.onmessage = () => {
        handleRealtimeRefresh()
      }
    }

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener("refresh_sales_data", handleRealtimeRefresh)
      window.removeEventListener("storage", handleStorageChange)
      if (broadcastChannel) {
        broadcastChannel.onmessage = null
      }
    }
  }, [currentOperator, activeTab])

  const logSystemAction = async (actionType: string, moduleTarget: string, details: string) => {
    const operatorName = currentOperator ? currentOperator.username : "admin"
    const { error } = await supabase.from("system_audit_logs").insert({
      operator_username: operatorName,
      action_type: actionType,
      module_target: moduleTarget,
      details_summary: details
    })
    if (error) console.error("Audit log insert failed:", error.message)
  }

  const fetchCategories = async () => {
    const { data } = await supabase.from("product_categories").select("name")
    if (data) {
      const rawNames = data.map(c => c.name)
      const remainingCategories = rawNames.filter(c => c !== "unmarked category").sort()
      setCategoriesList(["unmarked category", ...remainingCategories])
    }
  }

  const fetchInventory = async () => {
    const { data: items } = await supabase.from('inventory').select()
    const { data: batches } = await supabase.from('inventory_batches').select().order('expiry_date', { ascending: true })
    const formattedData = items?.map(item => {
      const itemBatches = batches?.filter(b => String(b.item_id) === String(item.id)).map(b => ({
        id: String(b.id),
        batchLabel: b.batch_label,
        stock: Math.floor(Number(b.stock)) || 0,
        expiryDate: b.expiry_date || "",
        cost: Number(b.cost) || 0,
        price: Number(b.price) || 0
      })) || []
      const totalStock = itemBatches.reduce((sum, b) => sum + b.stock, 0)
      const activeBatchWithPrice = itemBatches.find(b => b.stock > 0 && b.price > 0) || itemBatches[0]
      return {
        id: String(item.id),
        name: item.name,
        category: item.category || "unmarked category",
        price: activeBatchWithPrice ? activeBatchWithPrice.price : (Number(item.price) || 0),
        cost: activeBatchWithPrice ? activeBatchWithPrice.cost : (Number(item.cost) || 0),
        stock: totalStock,
        minStock: Math.floor(Number(item.min_stock)) || 0,
        barcode: item.barcode || "",
        manufacturer: item.manufacturer || "",
        batches: itemBatches
      }
    }) || []
    setInventory(formattedData)
  }

  const fetchSales = async () => {
    const { data: salesData } = await supabase.from('sales').select('*').order('id', { ascending: false })
    const { data: saleItemsData } = await supabase.from('sale_items').select('*')
    const { data: inventoryData } = await supabase.from('inventory').select('*')
    const { data: batchesData } = await supabase.from('inventory_batches').select('*')
    const { data: saleBatchesData } = await supabase.from('sale_item_batches').select('*')

    const formattedSales: Sale[] = salesData?.map((sale: any) => {
      const items = saleItemsData?.filter(si => String(si.sale_id) === String(sale.id)).map(si => {
        const inv = inventoryData?.find(inv => String(inv.id) === String(si.item_id))
        const batch = batchesData?.find(b => String(b.item_id) === String(si.item_id) && Number(b.price) > 0)
        const saleBatch = saleBatchesData?.find(sb => String(sb.sale_id) === String(sale.id) && String(sb.item_name).toLowerCase() === (inv?.name || "").toLowerCase())

        const resolvedPrice = Number(si.unit_price) || Number(si.price) || Number(saleBatch?.unit_price) || Number(batch?.price) || Number(inv?.price) || 0

        return {
          quantity: Math.floor(Number(si.quantity)) || 1,
          item: {
            id: String(si.item_id || 0),
            name: inv?.name || saleBatch?.item_name || "Product Item",
            category: inv?.category || "Uncategorized",
            price: resolvedPrice,
            cost: Number(batch?.cost) || Number(inv?.cost) || 0,
            stock: 0,
            minStock: Number(inv?.min_stock) || 0,
            barcode: inv?.barcode || "",
            manufacturer: inv?.manufacturer || "",
            batches: []
          }
        }
      }) || []
      return {
        id: String(sale.id),
        date: new Date(sale.date || sale.created_at || Date.now()),
        items,
        grossTotal: Number(sale.gross_total) || 0,
        subtotal: Number(sale.subtotal) || 0,
        discount: Number(sale.discount) || 0,
        taxableBase: Number(sale.taxable_base) || 0,
        vat: Number(sale.vat) || 0,
        total: Number(sale.total) || 0,
        cashReceived: Number(sale.cash_received) || 0,
        change: Number(sale.change) || 0,
        paymentMethod: (sale.payment_method || "cash") === "cash" ? "cash" : "other",
        discountLabel: sale.discount_label || "NONE",
        processedBy: sale.processed_by || "admin",
        isRefunded: Boolean(sale.is_refunded)
      }
    }) || []
    setSales(formattedSales)
  }

  const addSale = async (sale: Sale) => {
    if (!currentOperator) return
    
    let saleId: any = null
    const payload = {
      date: sale.date.toISOString(),
      total: sale.total,
      payment_method: sale.paymentMethod,
      is_refunded: false,
      gross_total: sale.grossTotal,
      subtotal: sale.subtotal,
      discount: sale.discount,
      taxable_base: sale.taxableBase,
      vat: sale.vat,
      cash_received: sale.cashReceived,
      change: sale.change,
      discount_label: sale.discountLabel,
      processed_by: currentOperator.username
    }

    const { data: newSale, error: saleError } = await supabase.from('sales').insert(payload).select('id').single()

    if (newSale && !saleError) {
      saleId = newSale.id
    } else {
      console.warn("Full sale payload insert failed, falling back to basic fields:", saleError?.message)
      const { data: fallbackSale, error: fbErr } = await supabase.from('sales').insert({
        date: sale.date.toISOString(),
        total: sale.total,
        payment_method: sale.paymentMethod,
        is_refunded: false
      }).select('id').single()

      if (fallbackSale && !fbErr) {
        saleId = fallbackSale.id
      }
    }

    if (saleId) {
      const saleItems = sale.items.map(si => ({ 
        sale_id: saleId, 
        item_id: si.item.id, 
        quantity: si.quantity, 
        unit_price: si.item.price 
      }))
      await supabase.from('sale_items').insert(saleItems)
      await logSystemAction("CREATE_SALE", "POS_CHECKOUT", `Processed invoice #${saleId} (₱${sale.total.toFixed(2)})`)
    } else {
      await logSystemAction("CREATE_SALE", "POS_CHECKOUT", `Completed checkout sale for ₱${sale.total.toFixed(2)}`)
    }

    await fetchInventory()
    await fetchSales()
    triggerGlobalSync()
  }

  const updateInventoryItem = async (item: InventoryItem) => {
    const payload = { name: item.name, category: item.category, min_stock: item.minStock, barcode: item.barcode, manufacturer: item.manufacturer }
    if (item.id && item.id.trim() !== "") {
      await supabase.from('inventory').update(payload).eq('id', Number(item.id))
      await logSystemAction("UPDATE_PRODUCT", "ITEM_SPECIFICATIONS", `Modified "${item.name}"`)
    } else {
      await supabase.from('inventory').insert(payload)
      await logSystemAction("CREATE_PRODUCT", "ITEM_SPECIFICATIONS", `Registered "${item.name}"`)
    }
    fetchInventory()
    triggerGlobalSync()
  }

  const handleToggleRefund = async (id: string, status: boolean) => {
    const newStatus = !status
    const numId = Number(id)

    // Optimistically update UI state immediately
    setSales(prev => prev.map(s => String(s.id) === String(id) ? { ...s, isRefunded: newStatus } : s))

    try {
      if (!isNaN(numId)) {
        await supabase.from('sales').update({ is_refunded: newStatus }).eq('id', numId)
      }
      await supabase.from('sales').update({ is_refunded: newStatus }).eq('id', String(id))

      await logSystemAction("VOID_TRANSACTION", "SALES_HISTORY", `Changed status for invoice #${id} to ${newStatus ? 'VOIDED' : 'COMPLETED'}`)
    } catch (err: any) {
      console.error("Error toggling void status:", err)
    }

    await fetchInventory()
    await fetchSales()
    triggerGlobalSync()
  }

  if (!currentOperator) {
    return (
      <LoginScreen
        onAuthSuccess={async (operator: any) => {
          saveSession(operator)
          if (operator.systemRole === "admin") {
            setActiveTab("admin_control")
          } else {
            setActiveTab("dashboard")
          }
        }}
      />
    )
  }

  const navigationTabs = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "pos", label: "Pos–Checkout", icon: ShoppingCart },
    { id: "inventory", label: "Item specs", icon: Package },
    { id: "stock_adjust", label: "Inventory", icon: ClipboardList }, 
    { id: "history", label: "Sales History", icon: Clock },
  ]
  if (currentOperator.systemRole === "admin") {
    navigationTabs.push({ id: "admin_control", label: "Admin Panel", icon: ShieldAlert })
  }

  const lowStockItems = inventory.filter(i => (i.stock || 0) <= (i.minStock || 10))
  const expiringItems = inventory.flatMap(item => (item.batches || []).map(b => ({ name: item.name, expiryDate: b.expiryDate, stock: b.stock }))).filter(b => {
    if (!b.expiryDate || b.stock <= 0) return false
    const diffDays = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return diffDays > 0 && diffDays <= 90
  })
  const totalNotificationCount = lowStockItems.length + expiringItems.length

  return (
    <div className={`min-h-screen flex flex-col md:flex-row font-sans antialiased transition-colors duration-200 ${
      theme === "dark" ? "bg-slate-900 text-slate-100" : "bg-[#ECE6DD] text-[#1f2937]"
    }`}>
      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/40 z-40 md:hidden" />}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 ${isSidebarCollapsed ? "w-20 px-3" : "w-64 p-6"} bg-[#89A1A0] dark:bg-slate-800 min-h-screen flex flex-col justify-between shrink-0 border-r border-[#799190] dark:border-slate-700 transition-all duration-200 ease-in-out ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}>
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white dark:bg-slate-700 rounded-xl shadow-xs border border-white/40 flex items-center justify-center p-2 shrink-0">
                <svg className="w-full h-full text-[#89A1A0] dark:text-teal-400" viewBox="0 0 40 40" fill="none">
                  <rect width="40" height="40" rx="8" fill="none" />
                  <path d="M20 6V34M6 20H34" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
                  <path d="M12 12L28 28" stroke="#374151" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </div>
              {!isSidebarCollapsed && <span className="text-[#1c2d2c] dark:text-white font-semibold text-2xl tracking-tight">Pharmacy Inventory</span>}
            </div>
            <div className="flex items-center">
              <button type="button" onClick={() => setIsSidebarCollapsed(c => !c)} className="hidden md:flex p-1.5 text-[#1c2d2c] dark:text-gray-300 rounded-lg hover:bg-white/20 dark:hover:bg-slate-700 transition-colors">
                {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
              </button>
              <button type="button" onClick={() => setIsSidebarOpen(false)} className="md:hidden text-[#1c2d2c] dark:text-white p-1.5 rounded-lg hover:bg-white/20"><X className="w-6 h-6" /></button>
            </div>
          </div>
          <nav className="space-y-2.5">
            {navigationTabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button key={tab.id} onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false) }} title={isSidebarCollapsed ? tab.label : undefined} className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center px-0" : "gap-3.5 px-5"} py-3 rounded-full text-sm font-semibold transition-all duration-150 ${
                    isActive ? "bg-white dark:bg-slate-100 text-[#111827] shadow-sm" : "text-[#1c2d2c] dark:text-slate-200 hover:bg-white/20 dark:hover:bg-slate-700 hover:text-black dark:hover:text-white"
                  }`}>
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-[#111827]" : "text-[#1c2d2c] dark:text-slate-200"}`} />
                  {!isSidebarCollapsed && <span>{tab.label}</span>}
                </button>
              )
            })}
          </nav>
        </div>
        <div className="pt-4 border-t border-black/10 dark:border-slate-700 flex flex-col gap-3">
          {!isSidebarCollapsed && (
            <div className="text-xs text-[#1c2d2c] dark:text-slate-200">
              <p className="font-bold truncate max-w-[180px]">{currentOperator.displayName}</p>
              <p className="text-[10px] opacity-75 font-mono uppercase">{currentOperator.systemRole}</p>
            </div>
          )}
          <button 
            type="button" 
            onClick={handleLogout} 
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-red-500/20 hover:bg-red-600 text-red-900 hover:text-white dark:text-red-300 dark:hover:text-white font-bold rounded-xl transition-all shadow-2xs text-xs"
            title="Log Out Session"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span>Log Out Session</span>}
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="px-4 sm:px-8 pt-6 sm:pt-8 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-[#1c2d2c] dark:text-white bg-white dark:bg-slate-800 rounded-xl border border-gray-300 dark:border-slate-700 shadow-2xs"><Menu className="w-6 h-6" /></button>
            <h1 className="text-xl sm:text-2xl font-normal text-[#1c2d2c] dark:text-white tracking-tight">
              {activeTab === "dashboard" && "Dashboard"}
              {activeTab === "pos" && "Pos–Checkout"}
              {activeTab === "inventory" && "Item specs"}
              {activeTab === "stock_adjust" && "Inventory"}
              {activeTab === "history" && "Sales History"}
              {activeTab === "admin_control" && "Admin Panel"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setTheme(t => t === "light" ? "dark" : "light")} className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-800 dark:text-gray-200 flex items-center justify-center shadow-2xs hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
              {theme === "light" ? <Moon className="w-5 h-5 text-gray-700" /> : <Sun className="w-5 h-5 text-amber-400" />}
            </button>
            <div className="relative">
              <button type="button" onClick={() => setShowNotifications(prev => !prev)} className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-red-300 dark:border-red-900 text-red-500 flex items-center justify-center shadow-2xs hover:bg-red-50 dark:hover:bg-slate-700 transition-colors">
                <Bell className="w-5 h-5 text-red-500" />
                {totalNotificationCount > 0 && <span className="absolute top-0 right-0 transform translate-x-1/3 -translate-y-1/3 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white dark:ring-slate-800">{totalNotificationCount}</span>}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-4 z-50 space-y-3 font-sans">
                  <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2">
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-orange-500" /> Active Notifications</h4>
                    <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs p-1"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-3 text-xs">
                    <div>
                      <p className="font-bold text-orange-600 dark:text-orange-400 uppercase text-[10px] tracking-wider mb-1">Low Stock Alerts ({lowStockItems.length})</p>
                      {lowStockItems.length === 0 ? <p className="text-gray-400 py-1">No low stock alerts.</p> : lowStockItems.map(item => <div key={item.id} onClick={() => { setActiveTab("dashboard"); setShowNotifications(false); }} className="p-2 bg-orange-50/60 dark:bg-orange-950/40 rounded-lg border border-orange-100 dark:border-orange-900/50 mb-1 flex justify-between cursor-pointer hover:bg-orange-100/60 dark:hover:bg-orange-900/60 transition-colors"><span className="font-medium text-gray-900 dark:text-gray-100">{item.name}</span><span className="font-bold text-orange-700 dark:text-orange-300">{item.stock} left</span></div>)}
                    </div>
                    <div>
                      <p className="font-bold text-red-600 dark:text-red-400 uppercase text-[10px] tracking-wider mb-1">Expiring Batch Alerts ({expiringItems.length})</p>
                      {expiringItems.length === 0 ? <p className="text-gray-400 py-1">No expiring batches.</p> : expiringItems.map((item, idx) => <div key={idx} onClick={() => { setActiveTab("dashboard"); setShowNotifications(false); }} className="p-2 bg-red-50/60 dark:bg-red-950/40 rounded-lg border border-red-100 dark:border-red-900/50 mb-1 flex justify-between cursor-pointer hover:bg-red-100/60 dark:hover:bg-red-900/60 transition-colors"><span className="font-medium text-gray-900 dark:text-gray-100">{item.name}</span><span className="font-bold text-red-600 dark:text-red-300 font-mono">{item.expiryDate}</span></div>)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-8 pb-8 overflow-y-auto">
          {activeTab === "dashboard" && <Dashboard inventory={inventory} sales={sales} categoriesList={categoriesList} />}
          {activeTab === "pos" && <POSCheckout inventory={inventory} categoriesList={categoriesList} onCompleteSale={addSale} />}
          {activeTab === "inventory" && <InventoryManager inventory={inventory} categoriesList={categoriesList} refreshCategories={fetchCategories} refreshInventory={fetchInventory} onUpdateInventory={updateInventoryItem} onDeleteProduct={deleteInventoryItem} onLogAction={logSystemAction} />}
          {activeTab === "stock_adjust" && <StockAdjustment inventory={inventory} categoriesList={categoriesList} fetchInventory={fetchInventory} onLogAction={logSystemAction} />}
          {activeTab === "history" && <SalesHistory sales={sales} onToggleRefund={handleToggleRefund} />}
          {activeTab === "admin_control" && currentOperator.systemRole === "admin" && (
            <AdminPanel
              currentOperator={currentOperator}
              onLogAction={logSystemAction}
              refreshAllData={async () => {
                await fetchInventory()
                await fetchSales()
              }}
            />
          )}
        </main>
      </div>
    </div>
  )
}