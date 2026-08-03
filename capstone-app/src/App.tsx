import { useState, useEffect } from "react"
import { Home, ShoppingCart, Package, Clock, ShieldAlert, LogOut, ClipboardList, Menu, X, Bell, AlertTriangle, Sun, Moon, ChevronLeft, ChevronRight, Flame, UserCheck, TrendingUp } from "lucide-react"
import { Dashboard } from "./components/Dashboard"
import { POSCheckout } from "./components/POSCheckout"
import { InventoryManager } from "./components/InventoryManager"
import { StockAdjustment } from "./components/StockAdjustment"
import { SalesHistory } from "./components/SalesHistory"
import { SalesReport } from "./components/SalesReport"
import { AdminPanel } from "./components/AdminPanel"
import { SuperAdminPanel } from "./components/SuperAdminPanel"
import { LoginScreen } from "./components/LoginScreen"
import { StaffAttendanceModal } from "./components/StaffAttendanceModal"
import { StaffAttendancePage } from "./components/StaffAttendancePage"
import { supabase, broadcastChannel, triggerGlobalSync, fetchAllSupabaseRows } from "./utils/apiClient"

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
  dbId?: string
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
  onlineChannel?: string
  discountLabel: string
  customerName?: string
  processedBy: string
  isRefunded?: boolean
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const savedTab = sessionStorage.getItem("pinv_active_tab")
      if (savedTab) return savedTab
    } catch (e) {}
    return "dashboard"
  })

  useEffect(() => {
    try {
      if (activeTab) {
        sessionStorage.setItem("pinv_active_tab", activeTab)
      }
    } catch (e) {}
  }, [activeTab])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [categoriesList, setCategoriesList] = useState<string[]>([])

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("pinv_theme") as "light" | "dark") || "light"
  })

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showAttendanceModal, setShowAttendanceModal] = useState(false)

  const [currentOperator, setCurrentOperator] = useState<{ username: string; displayName: string; systemRole: string } | null>(() => {
    try {
      const stored = sessionStorage.getItem("pinv_session") || sessionStorage.getItem("current_terminal_operator")
      if (stored) {
        const parsed = JSON.parse(stored)
        const targetObj = parsed.operator || parsed
        if (targetObj && (targetObj.username || targetObj.displayName)) {
          return {
            username: String(targetObj.username || targetObj.displayName || "user").toLowerCase().trim(),
            displayName: targetObj.displayName || targetObj.display_name || targetObj.username || "User",
            systemRole: targetObj.systemRole || targetObj.system_role || "staff"
          }
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
      sessionStorage.setItem("pinv_session", JSON.stringify({
        operator,
        timestamp: Date.now()
      }))
      sessionStorage.setItem("current_terminal_operator", JSON.stringify(operator))
    } catch (e) {}
  }

  useEffect(() => {
    if (!currentOperator?.username) return
    const uName = String(currentOperator.username).trim().toLowerCase()

    let tabId = sessionStorage.getItem("pinv_tab_session_id")
    if (!tabId) {
      tabId = Math.random().toString(36).substring(2, 7)
      sessionStorage.setItem("pinv_tab_session_id", tabId)
    }

    const updateHeartbeat = () => {
      try {
        localStorage.setItem(`pinv_active_heartbeat_${uName}_tab_${tabId}`, Date.now().toString())
      } catch (e) {}
    }

    updateHeartbeat()
    const timer = setInterval(updateHeartbeat, 5000)

    const handleUnload = () => {
      try {
        localStorage.removeItem(`pinv_active_heartbeat_${uName}_tab_${tabId}`)
        clockOutUser(uName)
      } catch (e) {}
    }
    window.addEventListener("beforeunload", handleUnload)

    return () => {
      clearInterval(timer)
      window.removeEventListener("beforeunload", handleUnload)
    }
  }, [currentOperator])

  // Global Mouse Wheel Horizontal Scroll Listener for all overflow-x-auto containers
  useEffect(() => {
    const handleWheelHorizontalScroll = (e: WheelEvent) => {
      const target = (e.target as HTMLElement)?.closest(".overflow-x-auto") as HTMLElement
      if (target && e.deltaY && !e.shiftKey) {
        if (target.scrollWidth > target.clientWidth) {
          target.scrollLeft += e.deltaY * 0.8
        }
      }
    }
    window.addEventListener("wheel", handleWheelHorizontalScroll, { passive: true })
    return () => window.removeEventListener("wheel", handleWheelHorizontalScroll)
  }, [])

  const clockOutUser = async (uName: string) => {
    if (!uName) return
    const target = uName.trim().toLowerCase()
    try {
      const { data } = await supabase
        .from("staff_attendance")
        .select("*")
        .ilike("username", target)
        .is("time_out", null)

      if (data && data.length > 0) {
        const nowIso = new Date().toISOString()
        for (const record of data) {
          const inTime = new Date(record.time_in).getTime()
          const outTime = new Date(nowIso).getTime()
          const durationMinutes = Math.max(1, Math.round((outTime - inTime) / (1000 * 60)))

          await supabase
            .from("staff_attendance")
            .update({
              time_out: nowIso,
              duration_minutes: durationMinutes
            })
            .eq("id", record.id)
        }
        window.dispatchEvent(new Event("pinv_attendance_updated"))
      }
    } catch (e) {
      console.error("Error clocking out user from Supabase", e)
    }
  }

  const clearAllUserHeartbeats = (uName: string) => {
    if (!uName) return
    const target = uName.trim().toLowerCase()
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith("pinv_active_heartbeat_")) {
          const keyUser = key.replace("pinv_active_heartbeat_", "").split("_tab_")[0].trim().toLowerCase()
          if (keyUser === target) {
            keysToRemove.push(key)
          }
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    } catch (e) {}
  }

  const clearSessionData = () => {
    try {
      sessionStorage.removeItem("pinv_session")
      sessionStorage.removeItem("current_terminal_operator")
      sessionStorage.removeItem("pinv_active_tab")
      localStorage.removeItem("pinv_session")
      localStorage.removeItem("current_terminal_operator")
    } catch (e) {}
  }

  const handleLogout = () => {
    const op = currentOperator
    if (op?.username) {
      const uName = String(op.username).trim().toLowerCase()
      clearAllUserHeartbeats(uName)
      clockOutUser(uName)
      try {
        logSystemAction("SESSION_LOGOUT", "AUTHENTICATION Portal", `Terminated station session for @${op.username}`)
      } catch (e) {}
    }
    clearSessionData()
    setCurrentOperator(null)
    setActiveTab("dashboard")
  }

  const deleteInventoryItem = async (idOrName: string) => {
    if (!idOrName) return
    const item = inventory.find(i => String(i.id) === String(idOrName) || i.name === idOrName)
    const targetId = item ? item.id : idOrName
    const targetName = item ? item.name : idOrName

    // Optimistically update React state immediately so UI updates instantly
    setInventory(prev => prev.filter(i => String(i.id) !== String(targetId) && i.name !== targetName))

    try {
      const numId = Number(targetId)
      const validNum = !isNaN(numId) ? numId : null

      // Clean up foreign keys in sale_item_batches, sale_items, and inventory_batches
      if (targetName) {
        await supabase.from('sale_item_batches').delete().eq('item_name', targetName)
        await supabase.from('inventory').delete().eq('name', targetName)
      }

      if (validNum !== null) {
        await supabase.from('sale_items').delete().eq('item_id', validNum)
        await supabase.from('inventory_batches').delete().eq('item_id', validNum)
        await supabase.from('inventory').delete().eq('id', validNum)
      }

      await supabase.from('sale_items').delete().eq('item_id', String(targetId))
      await supabase.from('inventory_batches').delete().eq('item_id', String(targetId))
      await supabase.from('inventory').delete().eq('id', String(targetId))

      await logSystemAction("DELETE_PRODUCT", "ITEM_SPECIFICATIONS", `Deleted product profile template for "${targetName}"`)
      triggerGlobalSync()
    } catch (err: any) {
      console.error("Error deleting product item:", err)
    }

    await fetchInventory()
  }

  useEffect(() => {
    if (currentOperator) {
      fetchCategories()
      fetchInventory()
      fetchSales()
    }

    // Realtime postgres subscriptions for instant multi-client syncing (debounced to avoid rate limit spam during bulk imports)
    let invTimer: any = null
    let salesTimer: any = null
    let catTimer: any = null

    const debouncedFetchInventory = () => {
      if (invTimer) clearTimeout(invTimer)
      invTimer = setTimeout(() => fetchInventory(), 800)
    }

    const debouncedFetchSales = () => {
      if (salesTimer) clearTimeout(salesTimer)
      salesTimer = setTimeout(() => fetchSales(), 800)
    }

    const debouncedFetchCategories = () => {
      if (catTimer) clearTimeout(catTimer)
      catTimer = setTimeout(() => fetchCategories(), 800)
    }

    const channel = supabase
      .channel("global-app-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, debouncedFetchInventory)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_batches" }, debouncedFetchInventory)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, debouncedFetchSales)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_categories" }, debouncedFetchCategories)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_audit_logs" }, (payload) => {
        const logData = payload.new as any
        if (logData && currentOperator) {
          const act = String(logData.action_type || "")
          const currentUser = String(currentOperator.username || "").trim().toLowerCase()
          // Only process target session termination events where operator_username is explicitly targeted
          if (act === "TARGET_SESSION_TERMINATED") {
            const targetUser = String(logData.details_summary || "").trim().toLowerCase()
            if (targetUser === currentUser) {
              clockOutUser(currentUser)
              clearAllUserHeartbeats(currentUser)
              clearSessionData()
              setCurrentOperator(null)
              setActiveTab("dashboard")
              alert("Your session has been terminated by an administrator.")
            }
          }
        }
      })
      .subscribe()

    const handleRealtimeRefresh = () => {
      fetchCategories()
      fetchInventory()
      fetchSales()
    }

    const checkForceLogoutPayload = (rawPayload: any) => {
      if (!currentOperator || !rawPayload) return
      try {
        const data = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload
        if (data.type === 'FORCE_LOGOUT' && data.username) {
          const target = String(data.username).trim().toLowerCase()
          const curr = String(currentOperator.username).trim().toLowerCase()
          const initiator = String(data.initiatedBy || "").trim().toLowerCase()
          if (target === curr && (initiator === "" || initiator !== curr)) {
            clockOutUser(curr)
            clearAllUserHeartbeats(curr)
            clearSessionData()
            setCurrentOperator(null)
            setActiveTab("dashboard")
            alert("Your session has been terminated by an administrator.")
          }
        } else if (data.type === 'FORCE_LOGOUT_BELOW_SUPER_ADMIN') {
          if (String(currentOperator.systemRole).toLowerCase() !== 'superadmin') {
            const curr = String(currentOperator.username).trim().toLowerCase()
            clockOutUser(curr)
            clearAllUserHeartbeats(curr)
            clearSessionData()
            setCurrentOperator(null)
            setActiveTab("dashboard")
            alert("System master data was reset by Super Admin. Your session has been terminated.")
          }
        }
      } catch (e) {}
    }

    window.addEventListener("refresh_sales_data", handleRealtimeRefresh)

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "pinv_last_sync_signal") {
        handleRealtimeRefresh()
      } else if (e.key === "pinv_logout_signal" && e.newValue) {
        checkForceLogoutPayload(e.newValue)
      } else if (e.key === "pinv_logout_below_superadmin_signal" && e.newValue) {
        checkForceLogoutPayload(e.newValue)
      }
    }
    window.addEventListener("storage", handleStorageChange)

    const handleForceLogoutBelowSAEvent = () => {
      if (currentOperator && String(currentOperator.systemRole).toLowerCase() !== 'superadmin') {
        const curr = String(currentOperator.username || "").trim().toLowerCase()
        if (curr) {
          clockOutUser(curr)
          clearAllUserHeartbeats(curr)
        }
        clearSessionData()
        setCurrentOperator(null)
        setActiveTab("dashboard")
        alert("System master data was reset by Super Admin. Your session has been terminated.")
      }
    }
    window.addEventListener("force_logout_below_superadmin", handleForceLogoutBelowSAEvent)

    if (broadcastChannel) {
      broadcastChannel.onmessage = (msgEvent) => {
        handleRealtimeRefresh()
        checkForceLogoutPayload(msgEvent.data)
      }
    }

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener("refresh_sales_data", handleRealtimeRefresh)
      window.removeEventListener("storage", handleStorageChange)
      window.removeEventListener("force_logout_below_superadmin", handleForceLogoutBelowSAEvent)
      if (broadcastChannel) {
        broadcastChannel.onmessage = null
      }
    }
  }, [currentOperator, activeTab])

  const logSystemAction = async (actionType: string, moduleTarget: string, details: string, overrideOperator?: string) => {
    const operatorName = overrideOperator || (currentOperator ? currentOperator.username : "system")
    const { error } = await supabase.from("system_audit_logs").insert({
      operator_username: operatorName,
      action_type: actionType,
      module_target: moduleTarget,
      details_summary: details
    })
    if (error) console.error("Audit log insert failed:", error.message)
  }

  const fetchCategories = async () => {
    const data = await fetchAllSupabaseRows("product_categories", "name")
    if (data) {
      const rawNames = data.map((c: any) => c.name)
      const remainingCategories = rawNames.filter(c => c !== "unmarked category").sort()
      setCategoriesList(["unmarked category", ...remainingCategories])
    }
  }

  const fetchInventory = async () => {
    const items = await fetchAllSupabaseRows('inventory', '*')
    const batches = await fetchAllSupabaseRows('inventory_batches', '*', { column: 'id', ascending: true })
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
    // 1. Try querying view_sales_history if available
    const { data: viewData, error: viewErr } = await supabase.from('view_sales_history').select('*').range(0, 99999)
    
    if (viewData && !viewErr && viewData.length > 0) {
      const sortedView = [...viewData].sort((a: any, b: any) => {
        const timeA = new Date(a.date || a.created_at || 0).getTime()
        const timeB = new Date(b.date || b.created_at || 0).getTime()
        if (timeA !== timeB) return timeA - timeB
        return Number(a.id) - Number(b.id)
      })

      const formattedFromView: Sale[] = sortedView.map((s: any, idx: number) => {
        const rawItems = Array.isArray(s.sale_items) ? s.sale_items : []
        const mappedItems = rawItems.map((si: any) => ({
          quantity: Math.floor(Number(si.quantity)) || 1,
          item: {
            id: String(si.inventory?.id || 0),
            name: si.inventory?.name || "Product Item",
            category: si.inventory?.category || "Uncategorized",
            price: Number(si.unit_price) || Number(si.inventory?.price) || 0,
            cost: 0,
            stock: 0,
            minStock: Number(si.inventory?.min_stock) || 0,
            barcode: si.inventory?.barcode || "",
            manufacturer: "",
            batches: []
          }
        }))

        const rawPay = String(s.payment_method || "").trim()
        const isCash = !rawPay || rawPay.toLowerCase() === "cash"
        const onlineChan = !isCash ? (rawPay.includes(":") ? rawPay.split(":")[1] : (rawPay.toLowerCase() === "other" ? "" : rawPay)) : ""

        return {
          id: String(idx + 1),
          dbId: String(s.id),
          date: new Date(s.date || Date.now()),
          items: mappedItems,
          grossTotal: Number(s.gross_total) || Number(s.total) || 0,
          subtotal: Number(s.subtotal) || Number(s.total) || 0,
          discount: Number(s.discount) || 0,
          taxableBase: Number(s.taxable_base) || Number(s.total) || 0,
          vat: Number(s.vat) || 0,
          total: Number(s.total) || 0,
          cashReceived: Number(s.cash_received) || Number(s.total) || 0,
          change: Number(s.change) || 0,
          paymentMethod: isCash ? "cash" : "other",
          onlineChannel: onlineChan || s.online_channel || "",
          discountLabel: s.discount_label || "NONE",
          processedBy: s.processed_by || "admin",
          isRefunded: Boolean(s.is_refunded)
        }
      })
      setSales(formattedFromView)
      return
    }

    // 2. Standard multi-table query fallback
    const { data: salesData } = await supabase.from('sales').select('*').range(0, 99999)
    const { data: saleItemsData } = await supabase.from('sale_items').select('*').range(0, 99999)
    const { data: inventoryData } = await supabase.from('inventory').select('*').range(0, 99999)
    const { data: batchesData } = await supabase.from('inventory_batches').select('*').range(0, 99999)
    const { data: saleBatchesData } = await supabase.from('sale_item_batches').select('*').range(0, 99999)

    const sortedSalesData = [...(salesData || [])].sort((a: any, b: any) => {
      const timeA = new Date(a.date || a.created_at || 0).getTime()
      const timeB = new Date(b.date || b.created_at || 0).getTime()
      if (timeA !== timeB) return timeA - timeB
      return Number(a.id) - Number(b.id)
    })

    const formattedSales: Sale[] = sortedSalesData.map((sale: any, idx: number) => {
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
      const rawPay = String(sale.payment_method || "").trim()
      const isCash = !rawPay || rawPay.toLowerCase() === "cash"
      const onlineChan = !isCash ? (rawPay.includes(":") ? rawPay.split(":")[1] : (rawPay.toLowerCase() === "other" ? "" : rawPay)) : ""

      const discLabel = sale.discount_label || "NONE"
      let localCustomerMap: Record<string, string> = {}
      try {
        localCustomerMap = JSON.parse(localStorage.getItem("pinv_customer_sales_map") || "{}")
      } catch (e) {}

      let extractedCustomerName = sale.customer_name || sale.customerName || localCustomerMap[String(sale.id)] || localCustomerMap[String(idx + 1)] || undefined

      // Extract embedded customer name from legacy discount_label e.g. "SENIOR CITIZEN (kervin)"
      if (!extractedCustomerName && discLabel.includes("(") && discLabel.includes(")")) {
        const match = discLabel.match(/\(([^)]+)\)/)
        if (match && match[1] && !["20%", "10%", "5%", "100%"].includes(match[1].trim())) {
          extractedCustomerName = match[1].trim()
        }
      }

      return {
        id: String(idx + 1),
        dbId: String(sale.id),
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
        paymentMethod: isCash ? "cash" : "other",
        onlineChannel: onlineChan || sale.online_channel || "",
        discountLabel: discLabel,
        customerName: extractedCustomerName,
        processedBy: sale.processed_by || "admin",
        isRefunded: Boolean(sale.is_refunded)
      }
    }) || []
    setSales(formattedSales)
  }

  const addSale = async (sale: Sale) => {
    if (!currentOperator) return

    const trimmedCustomer = (sale.customerName || "").trim()
    const baseDiscountLabel = sale.discountLabel || "NONE"
    const dbDiscountLabel = (trimmedCustomer && !baseDiscountLabel.includes("("))
      ? `${baseDiscountLabel} (${trimmedCustomer})`
      : baseDiscountLabel

    let saleId: any = null
    // payment_method MUST be strictly 'cash' or 'other' (database check constraint)
    const payMethodValue = sale.paymentMethod === "other" ? "other" : "cash"
    const onlineChanValue = sale.paymentMethod === "other" ? (sale.onlineChannel || "GCash") : null

    const payload: any = {
      date: sale.date.toISOString(),
      total: sale.total,
      payment_method: payMethodValue,
      is_refunded: false,
      gross_total: sale.grossTotal,
      subtotal: sale.subtotal,
      discount: sale.discount,
      taxable_base: sale.taxableBase,
      vat: sale.vat,
      cash_received: sale.cashReceived,
      change: sale.change,
      discount_label: dbDiscountLabel,
      customer_name: trimmedCustomer || null,
      processed_by: currentOperator.username
    }

    const isResetState = sales.length === 0
    if (isResetState) {
      try {
        await supabase.rpc("reset_sales_sequence")
      } catch (e) {}
      payload.id = 1
    }

    let { data: newSale, error: saleError } = await supabase.from('sales').insert(payload).select('id').single()

    if (saleError && isResetState) {
      // If explicit ID 1 failed (e.g. strict identity generated always), retry without explicit ID
      delete payload.id
      const retryResult = await supabase.from('sales').insert(payload).select('id').single()
      newSale = retryResult.data
      saleError = retryResult.error
    }

    if (newSale && !saleError) {
      saleId = newSale.id
    } else {
      console.error("Full payload failed:", saleError?.message)
      // Minimal fallback - only required fields
      const { data: fallbackSale, error: fbErr } = await supabase.from('sales').insert({
        date: sale.date.toISOString(),
        total: sale.total,
        gross_total: sale.grossTotal,
        subtotal: sale.subtotal,
        discount: sale.discount,
        taxable_base: sale.taxableBase,
        vat: sale.vat,
        cash_received: sale.cashReceived,
        change: sale.change,
        discount_label: dbDiscountLabel,
        payment_method: payMethodValue,
        processed_by: currentOperator.username,
        is_refunded: false
      }).select('id').single()

      if (fallbackSale && !fbErr) {
        saleId = fallbackSale.id
        // Try to update online_channel separately
        if (onlineChanValue && saleId) {
          await supabase.from('sales').update({ online_channel: onlineChanValue }).eq('id', saleId)
        }
      } else {
        console.error("All inserts failed:", fbErr?.message)
      }
    }

    if (trimmedCustomer && saleId) {
      try {
        const map = JSON.parse(localStorage.getItem("pinv_customer_sales_map") || "{}")
        map[String(saleId)] = trimmedCustomer
        map[String(sales.length + 1)] = trimmedCustomer
        localStorage.setItem("pinv_customer_sales_map", JSON.stringify(map))
      } catch (e) {}
    }

    try {
      if (saleId) {
        const saleItems = sale.items.map(si => ({ 
          sale_id: saleId, 
          item_id: si.item.id, 
          quantity: si.quantity, 
          unit_price: si.item.price 
        }))
        const { error: itemsErr } = await supabase.from('sale_items').insert(saleItems)
        if (itemsErr) {
          const basicItems = sale.items.map(si => ({ sale_id: saleId, item_id: si.item.id, quantity: si.quantity }))
          await supabase.from('sale_items').insert(basicItems)
        }

        // Write to sale_item_batches for Batch History log
        const batchRows = sale.items.map(si => ({
          sale_id: saleId,
          item_name: si.item.name,
          batch_label: si.item.batches && si.item.batches.length > 0
            ? (si.item.batches.find(b => b.stock > 0)?.batchLabel || "DEFAULT")
            : "DEFAULT",
          quantity_deducted: si.quantity,
          unit_price: si.item.price
        }))
        await supabase.from('sale_item_batches').insert(batchRows)
      }

      // Deduct stock from inventory_batches and inventory in Supabase
      for (const si of sale.items) {
        const qtyToDeduct = Math.floor(Number(si.quantity)) || 1
        const targetItemId = si.item.id

        // 1. Fetch active batches for target item
        const { data: itemBatches } = await supabase
          .from('inventory_batches')
          .select('*')
          .eq('item_id', Number(targetItemId) || targetItemId)

        if (itemBatches && itemBatches.length > 0) {
          const sortedBatches = [...itemBatches]
            .filter((b: any) => Number(b.stock) > 0)
            .sort((a: any, b: any) => {
              if (!a.expiry_date) return 1
              if (!b.expiry_date) return -1
              return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
            })

          let remainingDeduct = qtyToDeduct
          for (const batch of sortedBatches) {
            if (remainingDeduct <= 0) break
            const currentBatchStock = Number(batch.stock) || 0
            const deductFromThis = Math.min(remainingDeduct, currentBatchStock)
            const newStock = currentBatchStock - deductFromThis
            remainingDeduct -= deductFromThis

            await supabase
              .from('inventory_batches')
              .update({ stock: newStock })
              .eq('id', batch.id)
          }
        } else {
          // Fallback: If item has no batch rows, attempt updating inventory table directly
          const { data: invItem } = await supabase.from('inventory').select('stock').eq('id', targetItemId).single()
          if (invItem && invItem.stock != null) {
            const newInvStock = Math.max(0, Number(invItem.stock) - qtyToDeduct)
            await supabase.from('inventory').update({ stock: newInvStock }).eq('id', targetItemId)
          }
        }
      }
    } catch (e) {
      console.warn("Sale items insert/stock deduction exception:", e)
    }

    const payLabel = sale.paymentMethod === "other" ? (sale.onlineChannel ? `ONLINE (${sale.onlineChannel})` : "ONLINE PAYMENT") : "CASH"
    await logSystemAction("CREATE_SALE", "POS_CHECKOUT", `Processed sale #${saleId || Date.now()} via ${payLabel} (Total: ₱${sale.total.toFixed(2)})`)

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
    const targetSale = sales.find(s => String(s.id) === String(id) || String(s.dbId) === String(id))

    // Optimistically update UI state immediately
    setSales(prev => prev.map(s => (String(s.id) === String(id) || String(s.dbId) === String(id)) ? { ...s, isRefunded: newStatus } : s))

    try {
      const realDbId = targetSale?.dbId || id
      const numId = Number(realDbId)

      if (!isNaN(numId)) {
        await supabase.from('sales').update({ is_refunded: newStatus }).eq('id', numId)
      }
      await supabase.from('sales').update({ is_refunded: newStatus }).eq('id', String(realDbId))

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
        theme={theme}
        onAuthSuccess={async (operator: any) => {
          saveSession(operator)
          try {
            await logSystemAction("SESSION_LOGIN", "AUTHENTICATION Portal", `Authorized station session for @${operator.username}`, operator.username)
          } catch (e) {}
          if (operator.systemRole === "superadmin") {
            setActiveTab("super_admin")
          } else if (operator.systemRole === "admin") {
            setActiveTab("admin_control")
          } else {
            setActiveTab("dashboard")
          }
        }}
      />
    )
  }

  const isAdminUser = currentOperator?.systemRole === "admin" || currentOperator?.systemRole === "superadmin"

  const navigationTabs = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "pos", label: "Pos–Checkout", icon: ShoppingCart },
  ]
  if (isAdminUser) {
    navigationTabs.push({ id: "inventory", label: "Item specs", icon: ClipboardList })
    navigationTabs.push({ id: "stock_adjust", label: "Inventory", icon: Package })
  }
  navigationTabs.push({ id: "history", label: "Sales History", icon: Clock })

  if (isAdminUser) {
    navigationTabs.push({ id: "reports", label: "Sales Report", icon: TrendingUp })
    navigationTabs.push({ id: "attendance", label: "Staff Attendance", icon: UserCheck })
    navigationTabs.push({ id: "admin_control", label: "Admin Panel", icon: ShieldAlert })
  }
  if (currentOperator?.systemRole === "superadmin") {
    navigationTabs.push({ id: "super_admin", label: "Super Admin", icon: Flame })
  }

  const lowStockItems = inventory
    .filter(i => (i.stock || 0) <= (i.minStock || 10))
    .sort((a, b) => (a.stock || 0) - (b.stock || 0))
  const expiringItems = inventory
    .flatMap(item => (item.batches || []).map(b => ({ name: item.name, expiryDate: b.expiryDate, stock: b.stock })))
    .filter(b => {
      if (!b.expiryDate || b.stock <= 0) return false
      const diffDays = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return diffDays <= 180
    })
    .map(b => {
      const diffDays = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return { ...b, daysLeft: diffDays }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const handleSelectStockProduct = (productName: string, productId?: string) => {
    if (isAdminUser) {
      setActiveTab("stock_adjust")
      setShowNotifications(false)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("pinv_select_product", {
          detail: { name: productName, id: productId }
        }))
      }, 100)
    } else {
      setActiveTab("dashboard")
      setShowNotifications(false)
    }
  }

  const totalNotificationCount = lowStockItems.length + expiringItems.length

  return (
    <div className={`h-screen max-h-screen overflow-hidden flex flex-col md:flex-row font-sans antialiased transition-colors duration-200 ${
      theme === "dark" ? "bg-slate-900 text-slate-100" : "bg-[#ECE6DD] text-[#1f2937]"
    }`}>
      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/40 z-40 md:hidden" />}
      <aside className={`fixed md:sticky md:top-0 inset-y-0 left-0 z-50 ${isSidebarCollapsed ? "w-20 px-3 py-4" : "w-64 p-6"} bg-[#89A1A0] dark:bg-slate-800 h-screen max-h-screen flex flex-col justify-between shrink-0 border-r border-[#799190] dark:border-slate-700 transition-all duration-200 ease-in-out overflow-y-auto ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}>
        <div className="space-y-6 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white dark:bg-slate-700 rounded-xl shadow-xs border border-white/40 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                <img 
                  src="https://scontent.fmnl33-4.fna.fbcdn.net/v/t39.30808-6/401504104_122095038878121591_4438502913040853748_n.jpg?stp=dst-jpg_tt6&cstp=mx411x390&ctp=s411x390&_nc_cat=106&ccb=1-7&_nc_sid=6ee11a&_nc_ohc=Ft95k5nEUhgQ7kNvwEdA8VD&_nc_oc=AdqjX8JO54H9u5fUgSwQABVjJrejNbGOQXYz6IeG81-a88_I02lrMRRwNEFxJTxpHQG4mOYKT7nZvrBkQ8vzMfdQ&_nc_zt=23&_nc_ht=scontent.fmnl33-4.fna&_nc_gid=upjDGk5QBMqMv2fhQRvKFA&_nc_ss=7b289&oh=00_AQCfN0WpxXHhMh2frLHZKz7eRSuVSEaGu9-fKhjBG1tzkw&oe=6A6B53F5" 
                  alt="Malabon Pharmacy Logo" 
                  className="w-full h-full rounded-lg object-cover"
                />
              </div>
              {!isSidebarCollapsed && <span className="text-[#1c2d2c] dark:text-white font-semibold text-xl tracking-tight leading-tight">Pharmacy Inventory</span>}
            </div>
            <div className="flex items-center">
              <button type="button" onClick={() => setIsSidebarCollapsed(c => !c)} className="hidden md:flex p-1.5 text-[#1c2d2c] dark:text-gray-300 rounded-lg hover:bg-white/20 dark:hover:bg-slate-700 transition-colors">
                {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
              </button>
              <button type="button" onClick={() => setIsSidebarOpen(false)} className="md:hidden text-[#1c2d2c] dark:text-white p-1.5 rounded-lg hover:bg-white/20"><X className="w-6 h-6" /></button>
            </div>
          </div>
          <nav className="space-y-1.5 flex-1 overflow-y-auto pr-1">
            {navigationTabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button key={tab.id} onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false) }} title={isSidebarCollapsed ? tab.label : undefined} className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"} py-2.5 rounded-full text-xs font-semibold tracking-wide antialiased transition-all duration-150 ${
                    isActive ? "bg-white text-gray-900 dark:bg-blue-600 dark:text-white shadow-md font-bold" : "text-[#1c2d2c] dark:text-slate-200 hover:bg-white/20 dark:hover:bg-slate-700/80 hover:text-black dark:hover:text-white"
                  }`}>
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-gray-900 dark:text-white" : "text-[#1c2d2c] dark:text-slate-300"}`} />
                  {!isSidebarCollapsed && <span>{tab.label}</span>}
                </button>
              )
            })}
          </nav>
        </div>
        <div className="pt-3 border-t border-black/10 dark:border-slate-700 flex flex-col gap-2 shrink-0">
          {!isSidebarCollapsed && (
            <div className="text-xs text-[#1c2d2c] dark:text-slate-200">
              <p className="font-bold truncate max-w-[180px]">{currentOperator?.displayName}</p>
              <p className="text-[10px] opacity-75 font-mono uppercase">{currentOperator?.systemRole}</p>
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
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="px-4 sm:px-8 pt-6 sm:pt-8 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-[#1c2d2c] dark:text-white bg-white dark:bg-slate-800 rounded-xl border border-gray-300 dark:border-slate-700 shadow-2xs"><Menu className="w-6 h-6" /></button>
            <h1 className="text-xl sm:text-2xl font-normal text-[#1c2d2c] dark:text-white tracking-tight">
              {activeTab === "dashboard" && "Dashboard"}
              {activeTab === "pos" && "Pos–Checkout"}
              {activeTab === "inventory" && "Item specs"}
              {activeTab === "stock_adjust" && "Inventory"}
              {activeTab === "history" && "Sales History"}
              {activeTab === "reports" && "Sales Report"}
              {activeTab === "attendance" && "Staff Attendance"}
              {activeTab === "admin_control" && "Admin Panel"}
              {activeTab === "super_admin" && "Super Admin"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAttendanceModal(true)}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 active:scale-95"
              title="Time In / Time Out Attendance"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Time In / Out</span>
            </button>
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
                      {lowStockItems.length === 0 ? <p className="text-gray-400 py-1">No low stock alerts.</p> : lowStockItems.map(item => <div key={item.id} onClick={() => handleSelectStockProduct(item.name, item.id)} className="p-2 bg-orange-50/60 dark:bg-orange-950/40 rounded-lg border border-orange-100 dark:border-orange-900/50 mb-1 flex justify-between cursor-pointer hover:bg-orange-100/60 dark:hover:bg-orange-900/60 transition-colors"><span className="font-medium text-gray-900 dark:text-gray-100">{item.name}</span><span className="font-bold text-orange-700 dark:text-orange-300">{item.stock} left</span></div>)}
                    </div>
                    <div>
                      <p className="font-bold text-red-600 dark:text-red-400 uppercase text-[10px] tracking-wider mb-1">Expiring Batch Alerts ({expiringItems.length})</p>
                      {expiringItems.length === 0 ? (
                        <p className="text-gray-400 py-1">No expiring batches.</p>
                      ) : (
                        expiringItems.map((item, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => handleSelectStockProduct(item.name)} 
                            className="p-2 bg-red-50/60 dark:bg-red-950/40 rounded-lg border border-red-100 dark:border-red-900/50 mb-1 flex justify-between items-center cursor-pointer hover:bg-red-100/60 dark:hover:bg-red-900/60 transition-colors"
                          >
                            <span className="font-medium text-gray-900 dark:text-gray-100">{item.name}</span>
                            <span className="font-bold text-red-700 dark:text-red-300">{item.daysLeft <= 0 ? "EXPIRED" : `${item.daysLeft}d left`}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-8 pb-8 overflow-y-auto">
          {activeTab === "dashboard" && <Dashboard inventory={inventory} sales={sales} categoriesList={categoriesList} isAdminUser={isAdminUser} onSelectProduct={handleSelectStockProduct} />}
          {activeTab === "pos" && <POSCheckout inventory={inventory} sales={sales} categoriesList={categoriesList} onCompleteSale={addSale} />}
          {activeTab === "inventory" && currentOperator && <InventoryManager currentOperator={currentOperator} inventory={inventory} categoriesList={categoriesList} refreshCategories={fetchCategories} refreshInventory={fetchInventory} onUpdateInventory={updateInventoryItem} onDeleteProduct={deleteInventoryItem} onLogAction={logSystemAction} />}
          {activeTab === "stock_adjust" && currentOperator && <StockAdjustment currentOperator={currentOperator} inventory={inventory} categoriesList={categoriesList} fetchInventory={fetchInventory} onLogAction={logSystemAction} />}
          {activeTab === "history" && currentOperator && <SalesHistory currentOperator={currentOperator} sales={sales} onToggleRefund={handleToggleRefund} />}
          {activeTab === "reports" && isAdminUser && <SalesReport sales={sales} inventory={inventory} categoriesList={categoriesList} />}
          {activeTab === "attendance" && isAdminUser && currentOperator && <StaffAttendancePage currentOperator={currentOperator} />}
          {activeTab === "admin_control" && (currentOperator?.systemRole === "admin" || currentOperator?.systemRole === "superadmin") && currentOperator && (
            <AdminPanel
              currentOperator={currentOperator}
              onLogAction={logSystemAction}
              refreshAllData={async () => {
                await fetchInventory()
                await fetchSales()
              }}
            />
          )}
          {activeTab === "super_admin" && currentOperator?.systemRole === "superadmin" && currentOperator && (
            <SuperAdminPanel
              currentOperator={currentOperator}
              onLogAction={logSystemAction}
              refreshAllData={async () => {
                await fetchInventory()
                await fetchSales()
              }}
            />
          )}
        </main>

        {showAttendanceModal && (
          <StaffAttendanceModal
            currentOperator={currentOperator}
            onClose={() => setShowAttendanceModal(false)}
            onLogAction={logSystemAction}
          />
        )}
      </div>
    </div>
  )
}