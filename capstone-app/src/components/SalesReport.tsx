import { useState, useMemo, useEffect } from "react"
import type { Sale, InventoryItem } from "../App"
import { downloadExcelWithAutoFit } from "../utils/excelUtils"
import { supabase } from "../utils/apiClient"
import { TrendingUp, BarChart3, DollarSign, ShoppingBag, Download, Filter, Users, CreditCard, Layers, UserCheck, PackageCheck, Search } from "lucide-react"

interface SalesReportProps {
  sales: Sale[]
  inventory: InventoryItem[]
  categoriesList?: string[]
}

export function SalesReport({ sales, inventory }: SalesReportProps) {
  const [dateFrame, setDateFrame] = useState<"today" | "yesterday" | "week" | "month" | "custom">("month")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [activeReportTab, setActiveReportTab] = useState<"all" | "payment" | "cogs" | "category" | "cashier">("all")
  const [report1SearchQuery, setReport1SearchQuery] = useState("")
  const [report1CategoryFilter, setReport1CategoryFilter] = useState("all")
  const [, setForceTick] = useState(0)

  useEffect(() => {
    const triggerRefresh = () => setForceTick(t => t + 1)

    window.addEventListener("storage", triggerRefresh)
    window.addEventListener("refresh_sales_data", triggerRefresh)
    window.addEventListener("pinv_sale_completed", triggerRefresh)
    window.addEventListener("pinv_registry_updated", triggerRefresh)

    const channel = supabase
      .channel("realtime-sales-report-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => {
        triggerRefresh()
      })
      .subscribe()

    return () => {
      window.removeEventListener("storage", triggerRefresh)
      window.removeEventListener("refresh_sales_data", triggerRefresh)
      window.removeEventListener("pinv_sale_completed", triggerRefresh)
      window.removeEventListener("pinv_registry_updated", triggerRefresh)
      supabase.removeChannel(channel)
    }
  }, [])

  // Filter sales based on selected date frame
  const filteredSales = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    const safeSales = Array.isArray(sales) ? sales : []

    return safeSales.filter(s => {
      if (!s || s.isRefunded) return false
      const sDate = s.date ? new Date(s.date) : new Date()

      if (dateFrame === "today") {
        if (sDate < todayStart || sDate > todayEnd) return false
      } else if (dateFrame === "yesterday") {
        const yStart = new Date(todayStart)
        yStart.setDate(yStart.getDate() - 1)
        const yEnd = new Date(todayEnd)
        yEnd.setDate(yEnd.getDate() - 1)
        if (sDate < yStart || sDate > yEnd) return false
      } else if (dateFrame === "week") {
        // Exact Current Calendar Week (Monday 00:00:00 to Sunday 23:59:59)
        const day = now.getDay()
        const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1)
        const weekStart = new Date(now.getFullYear(), now.getMonth(), diffToMon, 0, 0, 0, 0)
        const weekEnd = new Date(now.getFullYear(), now.getMonth(), diffToMon + 6, 23, 59, 59, 999)
        if (sDate < weekStart || sDate > weekEnd) return false
      } else if (dateFrame === "month") {
        // Exact Current Calendar Month (1st 00:00:00 to Last Day of Month 23:59:59)
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        if (sDate < monthStart || sDate > monthEnd) return false
      } else if (dateFrame === "custom") {
        if (startDate && sDate < new Date(startDate + "T00:00:00")) return false
        if (endDate && sDate > new Date(endDate + "T23:59:59")) return false
      }

      return true
    })
  }, [sales, dateFrame, startDate, endDate])

  // Date range label
  const dateRangeLabel = useMemo(() => {
    if (dateFrame === "today") return "Today"
    if (dateFrame === "yesterday") return "Yesterday"
    if (dateFrame === "week") return "Last 7 Days"
    if (dateFrame === "month") return "Jan to Dec"
    if (dateFrame === "custom" && startDate && endDate) return `${startDate} to ${endDate}`
    return "Jan 10 to Dec 10"
  }, [dateFrame, startDate, endDate])

  // Map for fast inventory price and cost lookup
  const invLookupMap = useMemo(() => {
    const map = new Map<string, { price: number; cost: number; category: string }>()
    if (Array.isArray(inventory)) {
      inventory.forEach(item => {
        const idKey = String(item.id).toLowerCase()
        const nameKey = (item.name || "").toLowerCase().trim()
        const info = {
          price: Number(item.price) || 0,
          cost: Number(item.cost) || 0,
          category: item.category || "Uncategorized"
        }
        map.set(idKey, info)
        map.set(nameKey, info)
      })
    }
    return map
  }, [inventory])

  // Summary Overview Totals
  const overallMetrics = useMemo(() => {
    let totalRevenue = 0
    let totalCogs = 0
    let totalUnitsSold = 0
    let totalDiscounts = 0

    filteredSales.forEach(s => {
      totalRevenue += Number(s.total) || 0
      totalDiscounts += Number(s.discount) || 0
      const itemsList = Array.isArray(s.items) ? s.items : []
      itemsList.forEach(si => {
        const name = si.item?.name || (si as any).name || (si as any).item_name || ""
        const invMatch = invLookupMap.get(String(si.item?.id || (si as any).item_id).toLowerCase()) || invLookupMap.get(name.toLowerCase().trim())
        const qty = Number(si.quantity) || 1
        const unitCost = invMatch?.cost || Number(si.item?.cost) || Number((si as any).cost) || 0
        
        totalUnitsSold += qty
        totalCogs += unitCost * qty
      })
    })

    const grossProfit = totalRevenue - totalCogs
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
    const avgBasketSize = filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0

    return {
      totalTransactions: filteredSales.length,
      totalRevenue,
      totalCogs,
      grossProfit,
      profitMargin,
      totalUnitsSold,
      totalDiscounts,
      avgBasketSize
    }
  }, [filteredSales, invLookupMap])

  // REPORT 1: Profit & COGS by Item
  const profitAndCogsByItem = useMemo(() => {
    const itemMap = new Map<string, {
      name: string
      category: string
      unitsSold: number
      revenue: number
      cogs: number
      profit: number
      margin: number
    }>()

    filteredSales.forEach(s => {
      const itemsList = Array.isArray(s.items) ? s.items : []
      itemsList.forEach(si => {
        const name = si.item?.name || (si as any).name || (si as any).item_name || "Unlisted Item"
        const invMatch = invLookupMap.get(String(si.item?.id || (si as any).item_id).toLowerCase()) || invLookupMap.get(name.toLowerCase().trim())
        
        const category = si.item?.category || invMatch?.category || "Uncategorized"
        const qty = Number(si.quantity) || 1
        
        // Multi-level price fallback to prevent ₱0.00 revenue
        const price = Number((si as any).unitPrice) || Number((si as any).unit_price) || Number((si as any).price) || Number(si.item?.price) || invMatch?.price || 0
        const unitCost = invMatch?.cost || Number(si.item?.cost) || Number((si as any).cost) || 0
        
        const lineRev = price * qty
        const lineCogs = unitCost * qty

        const existing = itemMap.get(name)
        if (existing) {
          existing.unitsSold += qty
          existing.revenue += lineRev
          existing.cogs += lineCogs
          existing.profit = existing.revenue - existing.cogs
          existing.margin = existing.revenue > 0 ? (existing.profit / existing.revenue) * 100 : 0
        } else {
          const profit = lineRev - lineCogs
          const margin = lineRev > 0 ? (profit / lineRev) * 100 : 0
          itemMap.set(name, {
            name,
            category,
            unitsSold: qty,
            revenue: lineRev,
            cogs: lineCogs,
            profit,
            margin
          })
        }
      })
    })

    const list = Array.from(itemMap.values()).sort((a, b) => b.unitsSold - a.unitsSold || b.profit - a.profit)
    const maxProfit = Math.max(...list.map(i => i.profit), 100)
    return { list, maxProfit }
  }, [filteredSales, invLookupMap])

  const report1Categories = useMemo(() => {
    const set = new Set<string>()
    profitAndCogsByItem.list.forEach(i => {
      if (i.category) set.add(i.category)
    })
    return Array.from(set).sort()
  }, [profitAndCogsByItem.list])

  const filteredReport1List = useMemo(() => {
    return profitAndCogsByItem.list.filter(item => {
      const q = report1SearchQuery.toLowerCase().trim()
      const matchName = !q || item.name.toLowerCase().includes(q)
      const matchCat = report1CategoryFilter === "all" || item.category.toLowerCase().trim() === report1CategoryFilter.toLowerCase().trim()
      return matchName && matchCat
    })
  }, [profitAndCogsByItem.list, report1SearchQuery, report1CategoryFilter])

  // REPORT 2: No. of Items Sold by Category
  const itemsSoldByCategory = useMemo(() => {
    const catMap = new Map<string, {
      category: string
      unitsSold: number
      revenue: number
      cogs: number
      profit: number
    }>()

    filteredSales.forEach(s => {
      const itemsList = Array.isArray(s.items) ? s.items : []
      itemsList.forEach(si => {
        const name = si.item?.name || (si as any).name || (si as any).item_name || ""
        const invMatch = invLookupMap.get(String(si.item?.id || (si as any).item_id).toLowerCase()) || invLookupMap.get(name.toLowerCase().trim())
        
        const category = si.item?.category || invMatch?.category || "Uncategorized"
        const qty = Number(si.quantity) || 1
        
        const price = Number((si as any).unitPrice) || Number((si as any).unit_price) || Number((si as any).price) || Number(si.item?.price) || invMatch?.price || 0
        const unitCost = invMatch?.cost || Number(si.item?.cost) || Number((si as any).cost) || 0

        const lineRev = price * qty
        const lineCogs = unitCost * qty

        const existing = catMap.get(category)
        if (existing) {
          existing.unitsSold += qty
          existing.revenue += lineRev
          existing.cogs += lineCogs
          existing.profit += (lineRev - lineCogs)
        } else {
          catMap.set(category, {
            category,
            unitsSold: qty,
            revenue: lineRev,
            cogs: lineCogs,
            profit: lineRev - lineCogs
          })
        }
      })
    })

    const list = Array.from(catMap.values()).sort((a, b) => b.unitsSold - a.unitsSold)
    const maxUnits = Math.max(...list.map(c => c.unitsSold), 10)
    return { list, maxUnits }
  }, [filteredSales, invLookupMap])

  // REPORT 3: Sales by Cashier (Processed By)
  const salesByCashier = useMemo(() => {
    const cashierMap = new Map<string, {
      cashier: string
      transactions: number
      unitsSold: number
      grossSales: number
      discounts: number
      netRevenue: number
    }>()

    filteredSales.forEach(s => {
      const cashier = s.processedBy || "admin"
      const gross = Number(s.subtotal || s.grossTotal || s.total) || 0
      const discount = Number(s.discount) || 0
      const net = Number(s.total) || 0

      let itemsInSale = 0
      const itemsList = Array.isArray(s.items) ? s.items : []
      itemsList.forEach(si => {
        itemsInSale += Number(si.quantity) || 1
      })

      const existing = cashierMap.get(cashier)
      if (existing) {
        existing.transactions += 1
        existing.unitsSold += itemsInSale
        existing.grossSales += gross
        existing.discounts += discount
        existing.netRevenue += net
      } else {
        cashierMap.set(cashier, {
          cashier,
          transactions: 1,
          unitsSold: itemsInSale,
          grossSales: gross,
          discounts: discount,
          netRevenue: net
        })
      }
    })

    const list = Array.from(cashierMap.values()).sort((a, b) => b.netRevenue - a.netRevenue)
    const maxCashierRev = Math.max(...list.map(c => c.netRevenue), 100)
    return { list, maxCashierRev }
  }, [filteredSales])

  // REPORT 4: Sales by Payment Method & Explicit Online Channel
  const salesByPayment = useMemo(() => {
    const payMap = new Map<string, {
      methodName: string
      channelType: string
      onlineType: string
      transactions: number
      netRevenue: number
      sharePercent: number
      badgeColor: string
    }>()

    let grandTotalNet = 0

    filteredSales.forEach(s => {
      const net = Number(s.total) || 0
      grandTotalNet += net

      const method = String(s.paymentMethod || "cash").toLowerCase()
      
      let key = "Cash"
      let channelType = "Cash Desk"
      let onlineType = "Physical Cash"
      let badgeColor = "bg-emerald-600"

      if (method === "cash") {
        key = "Cash"
        channelType = "Physical Cash Desk"
        onlineType = "Cash"
        badgeColor = "bg-emerald-600"
      } else {
        const chan = (s.onlineChannel || "GCash").trim()
        key = chan
        channelType = "Online Channel"
        onlineType = chan

        if (chan.toLowerCase().includes("gcash")) badgeColor = "bg-blue-600"
        else if (chan.toLowerCase().includes("paymaya") || chan.toLowerCase().includes("maya")) badgeColor = "bg-emerald-700"
        else if (chan.toLowerCase().includes("bdo")) badgeColor = "bg-amber-600"
        else if (chan.toLowerCase().includes("bpi")) badgeColor = "bg-red-600"
        else if (chan.toLowerCase().includes("card")) badgeColor = "bg-indigo-600"
        else badgeColor = "bg-purple-600"
      }

      const existing = payMap.get(key)
      if (existing) {
        existing.transactions += 1
        existing.netRevenue += net
      } else {
        payMap.set(key, {
          methodName: key,
          channelType,
          onlineType,
          transactions: 1,
          netRevenue: net,
          sharePercent: 0,
          badgeColor
        })
      }
    })

    const maxRev = Math.max(...Array.from(payMap.values()).map(p => p.netRevenue), 100)

    const list = Array.from(payMap.values()).map(p => ({
      ...p,
      sharePercent: grandTotalNet > 0 ? (p.netRevenue / grandTotalNet) * 100 : 0
    }))

    return { list: list.sort((a, b) => b.netRevenue - a.netRevenue), grandTotalNet, maxRev }
  }, [filteredSales])

  // Export Combined Excel Report
  const handleExportExcel = () => {
    if (filteredSales.length === 0) {
      alert("No sales data available for the selected date frame.")
      return
    }

    const headers = ["Sale ID", "Date & Time", "Cashier", "Customer", "Payment Method", "Online Channel Type", "Subtotal (₱)", "Discount (₱)", "Net Total (₱)"]
    const rows = filteredSales.map(s => [
      `#${s.id}`,
      s.date ? new Date(s.date).toLocaleString() : "N/A",
      s.processedBy || "admin",
      s.customerName || "Walk-In Customer",
      String(s.paymentMethod || "CASH").toUpperCase(),
      s.paymentMethod === "cash" ? "Cash" : (s.onlineChannel || "GCash"),
      (Number(s.subtotal || s.total) || 0).toFixed(2),
      (Number(s.discount) || 0).toFixed(2),
      (Number(s.total) || 0).toFixed(2)
    ])

    downloadExcelWithAutoFit("pos_sales_analytics_all_reports", "POS 4 Core Sales Reports", headers, rows, false)
  }

  return (
    <div className="space-y-6 font-sans pb-12 text-gray-800 dark:text-slate-100">
      {/* Header Bar with Date Frame Controls */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            POS Sales & Profitability Reports
          </h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            4 Core Reports ({dateRangeLabel}): Profit & COGS by Item, Items Sold by Category, Sales by Cashier, and Sales by Payment Method.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Date Frame Selector */}
          <div className="flex bg-gray-100 dark:bg-slate-900 p-1 rounded-xl border dark:border-slate-700 text-xs font-bold">
            {(["today", "yesterday", "week", "month", "custom"] as const).map(df => (
              <button
                key={df}
                type="button"
                onClick={() => setDateFrame(df)}
                className={`px-3 py-1.5 rounded-lg uppercase transition-all ${dateFrame === df ? 'bg-blue-600 text-white shadow-2xs' : 'text-gray-600 dark:text-slate-300 hover:text-blue-600'}`}
              >
                {df === "week" ? "This Week" : df}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {dateFrame === "custom" && (
        <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl flex flex-wrap items-center gap-4 text-xs animate-in fade-in">
          <span className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1">
            <Filter className="w-4 h-4" /> Custom Date Frame Range:
          </span>
          <div className="flex items-center gap-2">
            <label className="font-semibold text-gray-600 dark:text-slate-300">From:</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-1.5 border bg-white dark:bg-slate-900 rounded-lg dark:border-slate-700 font-mono text-xs text-gray-900 dark:text-white" />
          </div>
          <div className="flex items-center gap-2">
            <label className="font-semibold text-gray-600 dark:text-slate-300">To:</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-1.5 border bg-white dark:bg-slate-900 rounded-lg dark:border-slate-700 font-mono text-xs text-gray-900 dark:text-white" />
          </div>
        </div>
      )}



      {/* Metric Highlights Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4.5 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Net Sales Revenue</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-extrabold text-gray-900 dark:text-white font-mono">
            ₱{overallMetrics.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-gray-500 font-medium">
            {overallMetrics.totalTransactions} total checkouts
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4.5 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Cost of Goods Sold (COGS)</span>
            <PackageCheck className="w-4 h-4 text-orange-600" />
          </div>
          <p className="text-xl font-extrabold text-orange-600 dark:text-orange-400 font-mono">
            ₱{overallMetrics.totalCogs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-gray-500 font-medium">
            Cost value of {overallMetrics.totalUnitsSold} items sold
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4.5 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Gross Profit</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
            ₱{overallMetrics.grossProfit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
            Profit Margin: {overallMetrics.profitMargin.toFixed(1)}%
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4.5 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Total Items Fulfillments</span>
            <ShoppingBag className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-xl font-extrabold text-gray-900 dark:text-white font-mono">
            {overallMetrics.totalUnitsSold.toLocaleString()} <span className="text-xs font-normal text-gray-400">pcs</span>
          </p>
          <p className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
            Discounts Given: ₱{overallMetrics.totalDiscounts.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Report Section Filter Buttons */}
      <div className="flex bg-gray-100 dark:bg-slate-900 p-1.5 rounded-2xl border dark:border-slate-700 text-xs font-bold overflow-x-auto gap-1">
        <button
          type="button"
          onClick={() => setActiveReportTab("all")}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap ${activeReportTab === "all" ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm border border-gray-200 dark:border-slate-700' : 'text-gray-600 dark:text-slate-300 hover:bg-white/50'}`}
        >
          All 4 Core Reports
        </button>
        <button
          type="button"
          onClick={() => setActiveReportTab("cogs")}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap ${activeReportTab === "cogs" ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm border border-gray-200 dark:border-slate-700' : 'text-gray-600 dark:text-slate-300 hover:bg-white/50'}`}
        >
          1. Profit & COGS by Item
        </button>
        <button
          type="button"
          onClick={() => setActiveReportTab("category")}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap ${activeReportTab === "category" ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm border border-gray-200 dark:border-slate-700' : 'text-gray-600 dark:text-slate-300 hover:bg-white/50'}`}
        >
          2. Items Sold by Category
        </button>
        <button
          type="button"
          onClick={() => setActiveReportTab("cashier")}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap ${activeReportTab === "cashier" ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm border border-gray-200 dark:border-slate-700' : 'text-gray-600 dark:text-slate-300 hover:bg-white/50'}`}
        >
          3. Sales by Cashier
        </button>
        <button
          type="button"
          onClick={() => setActiveReportTab("payment")}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap ${activeReportTab === "payment" ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm border border-gray-200 dark:border-slate-700' : 'text-gray-600 dark:text-slate-300 hover:bg-white/50'}`}
        >
          4. Sales by Payment Method
        </button>
      </div>

      {/* REPORT 1: Profit and COGS by Item */}
      {(activeReportTab === "all" || activeReportTab === "cogs") && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4 shadow-sm">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 border-b dark:border-slate-700 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                Report 1: Profit & Cost of Goods Sold (COGS) by Item
              </h3>
              <p className="text-[10px] text-gray-500 dark:text-slate-400">
                Detailed breakdown of product revenue, item cost basis, net profit, and profit margin percentage
              </p>
            </div>

            {/* Filter controls: Search by Product Name & Category */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-1 min-w-[160px] sm:w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search item name..."
                  value={report1SearchQuery}
                  onChange={e => setReport1SearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <select
                value={report1CategoryFilter}
                onChange={e => setReport1CategoryFilter(e.target.value)}
                className="px-3 py-1.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
              >
                <option value="all">All Categories</option>
                {report1Categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              {(report1SearchQuery || report1CategoryFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => { setReport1SearchQuery(""); setReport1CategoryFilter("all"); }}
                  className="px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:underline font-bold"
                >
                  Clear
                </button>
              )}

              <span className="text-[10px] font-bold px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-xl border border-blue-200 dark:border-blue-800 font-mono whitespace-nowrap">
                {filteredReport1List.length} / {profitAndCogsByItem.list.length} Items
              </span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[580px] overflow-y-auto rounded-xl border border-gray-100 dark:border-slate-700">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-slate-400 font-bold border-b dark:border-slate-700 sticky top-0 z-10 backdrop-blur-xs">
                <tr>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-right">Units Sold</th>
                  <th className="p-3 text-right">Revenue (₱)</th>
                  <th className="p-3 text-right text-orange-600 dark:text-orange-400">COGS (₱)</th>
                  <th className="p-3 text-right text-emerald-600 dark:text-emerald-400">Gross Profit (₱)</th>
                  <th className="p-3 text-right">Profit Margin (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {filteredReport1List.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-gray-400 italic">
                      No item sales recorded matching search query or category filter.
                    </td>
                  </tr>
                ) : (
                  filteredReport1List.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/80 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="p-3 font-bold text-gray-900 dark:text-white">{item.name}</td>
                      <td className="p-3">
                        <span className="uppercase text-[9px] font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-900 text-gray-700 dark:text-slate-300 border dark:border-slate-700">
                          {item.category}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-gray-800 dark:text-slate-200">{item.unitsSold} pcs</td>
                      <td className="p-3 text-right font-mono font-bold text-gray-900 dark:text-white">₱{item.revenue.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-bold text-orange-600 dark:text-orange-400">₱{item.cogs.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-extrabold text-emerald-600 dark:text-emerald-400">₱{item.profit.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-extrabold">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${item.margin >= 30 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'}`}>
                          {item.margin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT 2: No. of Items Sold by Category */}
      {(activeReportTab === "all" || activeReportTab === "category") && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4 shadow-sm">
          <div className="flex justify-between items-center border-b dark:border-slate-700 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4.5 h-4.5 text-purple-600 dark:text-purple-400" />
                Report 2: No. of Items Sold by Category
              </h3>
              <p className="text-[10px] text-gray-500 dark:text-slate-400">
                Quantity distribution and profit contribution grouped by product category
              </p>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded-full border border-purple-200 dark:border-purple-800">
              {itemsSoldByCategory.list.length} Categories
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {itemsSoldByCategory.list.map((cat, idx) => {
              const pctOfUnits = overallMetrics.totalUnitsSold > 0 ? (cat.unitsSold / overallMetrics.totalUnitsSold) * 100 : 0
              return (
                <div key={idx} className="p-4 bg-gray-50/60 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-700/80 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-xs text-gray-900 dark:text-white uppercase tracking-wide">
                      🏷️ {cat.category}
                    </span>
                    <span className="font-mono font-bold text-xs bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 px-2 py-0.5 rounded">
                      {cat.unitsSold} Items Sold
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      style={{ width: `${pctOfUnits}%` }}
                      className="bg-purple-600 h-full rounded-full transition-all duration-300"
                    />
                  </div>

                  <div className="flex justify-between items-center text-[10px] font-mono text-gray-600 dark:text-slate-400 pt-1">
                    <span>Revenue: <strong className="text-gray-900 dark:text-white">₱{cat.revenue.toFixed(2)}</strong></span>
                    <span>COGS: <strong className="text-orange-600">₱{cat.cogs.toFixed(2)}</strong></span>
                    <span>Profit: <strong className="text-emerald-600">₱{cat.profit.toFixed(2)}</strong></span>
                    <span>Share: <strong className="text-purple-600">{pctOfUnits.toFixed(1)}%</strong></span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* REPORT 3 & 4 SIDE BY SIDE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* REPORT 3: Sales by Cashier */}
        {(activeReportTab === "all" || activeReportTab === "cashier") && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4 shadow-sm">
            <div className="flex justify-between items-center border-b dark:border-slate-700 pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  <UserCheck className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                  Report 3: Sales by Cashier / Operator
                </h3>
                <p className="text-[10px] text-gray-500 dark:text-slate-400">
                  Checkout volume and revenue collected per station operator
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {salesByCashier.list.map((c, idx) => (
                <div key={idx} className="p-3.5 bg-gray-50/70 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-extrabold text-xs text-gray-900 dark:text-white flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-500" />
                      @{c.cashier}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-slate-400">
                      {c.transactions} transactions • {c.unitsSold} units fulfilled
                    </p>
                  </div>

                  <div className="text-right font-mono">
                    <p className="font-extrabold text-xs text-emerald-600 dark:text-emerald-400">
                      ₱{c.netRevenue.toFixed(2)}
                    </p>
                    <p className="text-[9px] text-amber-600">
                      Discounts: ₱{c.discounts.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REPORT 4: Sales by Payment Method */}
        {(activeReportTab === "all" || activeReportTab === "payment") && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4 shadow-sm">
            <div className="flex justify-between items-center border-b dark:border-slate-700 pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  <CreditCard className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
                  Report 4: Sales by Payment Method & Provider Types
                </h3>
                <p className="text-[10px] text-gray-500 dark:text-slate-400">
                  Distribution of Cash vs E-Wallets / Online Channels (GCash, PayMaya, BDO, BPI, Cards)
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {salesByPayment.list.map((p, idx) => (
                <div key={idx} className="p-3.5 bg-gray-50/70 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-700 space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-extrabold text-xs text-gray-900 dark:text-white uppercase tracking-wide">
                        {p.methodName === "Cash" ? "💵 Cash Payment" : `🌐 ${p.onlineType}`}
                      </span>
                      <p className="text-[10px] text-gray-500 dark:text-slate-400">
                        {p.transactions} completed checkouts
                      </p>
                    </div>

                    <div className="text-right font-mono">
                      <span className="font-extrabold text-xs text-emerald-600 dark:text-emerald-400">
                        ₱{p.netRevenue.toFixed(2)}
                      </span>
                      <span className="block text-[10px] font-bold text-blue-600 dark:text-blue-400">
                        {p.sharePercent.toFixed(1)}% Share
                      </span>
                    </div>
                  </div>

                  {/* Share Progress Bar */}
                  <div className="w-full bg-gray-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      style={{ width: `${p.sharePercent}%` }}
                      className={`${p.badgeColor} h-full rounded-full transition-all duration-300`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
