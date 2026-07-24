import { useState, useEffect } from "react"
import { supabase } from "./apiClient"
import { ShieldAlert, UserPlus, Trash2, History, RefreshCw, ShoppingBag, Eye, X, Flame, Database, AlertOctagon, RotateCcw } from "lucide-react"

interface AdminPanelProps {
  currentOperator: { username: string; displayName: string; systemRole: string }
  onLogAction: (actionType: string, moduleTarget: string, details: string) => Promise<void>
  refreshAllData?: () => Promise<void>
}

interface AuditLog {
  id: number
  created_at: string
  operator_username: string
  action_type: string
  module_target: string
  details_summary: string
}

interface BatchSaleRecord {
  id: number
  sale_id: number
  item_name: string
  batch_label: string
  quantity_deducted: number
  unit_price: number
  created_at: string
}

interface AccountProfile {
  id: number
  username: string
  password_text: string
  display_name: string
  system_role: string
}

export function AdminPanel({ currentOperator, onLogAction, refreshAllData }: AdminPanelProps) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [batchSales, setBatchSales] = useState<BatchSaleRecord[]>([])
  const [profiles, setProfiles] = useState<AccountProfile[]>([])
  const [activeUsernames, setActiveUsernames] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const [selectedBatchReceiptSaleId, setSelectedBatchReceiptSaleId] = useState<number | null>(null)
  const [selectedLogSummary, setSelectedLogSummary] = useState<AuditLog | null>(null)

  const [regUsername, setRegUsername] = useState("")
  const [regPin, setRegPin] = useState("")
  const [regDisplayName, setRegDisplayName] = useState("")
  const [regRole, setRegRole] = useState("staff")

  const [auditModuleFilter, setAuditModuleFilter] = useState("ALL")
  const [auditSearchQuery, setAuditSearchQuery] = useState("")
  const [batchSearchQuery, setBatchSearchQuery] = useState("")

  const [resetConfirmInput, setResetConfirmInput] = useState("")
  const [showResetModal, setShowResetModal] = useState<"inventory" | "sales" | "audit" | "all" | null>(null)

  const executeDataReset = async (type: "inventory" | "sales" | "audit" | "all") => {
    if (resetConfirmInput.trim() !== "RESET DATA") {
      alert('Confirmation string does not match. Please type "RESET DATA" to execute reset.')
      return
    }

    setIsLoading(true)
    try {
      if (type === "inventory" || type === "all") {
        // 1. Delete all inventory batches
        const { data: batches } = await supabase.from("inventory_batches").select("id, item_id")
        if (batches && batches.length > 0) {
          for (const b of batches) {
            await supabase.from("inventory_batches").delete().eq("id", b.id)
          }
        }

        // 2. Delete all items from inventory & related records
        const { data: invItems } = await supabase.from("inventory").select("id, name")
        if (invItems && invItems.length > 0) {
          for (const item of invItems) {
            await supabase.from("inventory_batches").delete().eq("item_id", item.id)
            await supabase.from("sale_item_batches").delete().eq("item_name", item.name)
            await supabase.from("sale_items").delete().eq("item_id", item.id)
            await supabase.from("inventory").delete().eq("id", item.id)
            await supabase.from("inventory").delete().eq("name", item.name)
          }
        }

        // 3. Delete custom categories
        const { data: catList } = await supabase.from("product_categories").select("id, name")
        if (catList && catList.length > 0) {
          for (const c of catList) {
            if (String(c.name).toLowerCase() !== "unmarked category") {
              await supabase.from("product_categories").delete().eq("id", c.id)
              await supabase.from("product_categories").delete().eq("name", c.name)
            }
          }
        }
      }

      if (type === "sales" || type === "all") {
        const { data: saleBatches } = await supabase.from("sale_item_batches").select("id")
        if (saleBatches && saleBatches.length > 0) {
          for (const sb of saleBatches) {
            await supabase.from("sale_item_batches").delete().eq("id", sb.id)
          }
        }

        const { data: saleItems } = await supabase.from("sale_items").select("id")
        if (saleItems && saleItems.length > 0) {
          for (const si of saleItems) {
            await supabase.from("sale_items").delete().eq("id", si.id)
          }
        }

        const { data: salesList } = await supabase.from("sales").select("id")
        if (salesList && salesList.length > 0) {
          for (const s of salesList) {
            await supabase.from("sales").delete().eq("id", s.id)
          }
        }
      }

      if (type === "audit" || type === "all") {
        const { data: logList } = await supabase.from("system_audit_logs").select("id")
        if (logList && logList.length > 0) {
          for (const l of logList) {
            await supabase.from("system_audit_logs").delete().eq("id", l.id)
          }
        }
      }

      await onLogAction(
        type === "all" ? "FACTORY_RESET" : "DATA_RESET",
        "SUPER_ADMIN",
        `Executed master data reset for: ${type.toUpperCase()}. Tables preserved.`
      )

      setShowResetModal(null)
      setResetConfirmInput("")
      alert(`Master Data Reset Completed for [${type.toUpperCase()}]. All database tables remain intact and ready for new data!`)

      window.dispatchEvent(new Event("refresh_sales_data"))
      if (refreshAllData) await refreshAllData()
      await fetchAllAdminData()
    } catch (err: any) {
      alert(`Data reset error: ${err.message}`)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchAllAdminData()

    // 1. Realtime Listener for System Audit Logs
    const auditChannel = supabase
      .channel("realtime-audit-logs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "system_audit_logs" },
        (payload) => {
          const newLog = payload.new as AuditLog
          setLogs((prev) => [newLog, ...prev])
          
          const opUser = String(newLog.operator_username || "").trim().toLowerCase()
          if (newLog.action_type === "SESSION_LOGIN") {
            setActiveUsernames((prev) => Array.from(new Set([...prev, opUser])))
          } else if (newLog.action_type === "SESSION_LOGOUT") {
            setActiveUsernames((prev) => prev.filter((u) => u !== opUser))
          }
        }
      )
      .subscribe()

    // 2. Realtime Listener for Batch Sales History Logs
    const batchSalesChannel = supabase
      .channel("realtime-batch-sales")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sale_item_batches" },
        (payload) => {
          const newBatchRow = payload.new as BatchSaleRecord
          setBatchSales((prev) => [newBatchRow, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(auditChannel)
      supabase.removeChannel(batchSalesChannel)
    }
  }, [currentOperator])


  const fetchAdminLogs = async () => {
    const { data, error } = await supabase
      .from("system_audit_logs")
      .select("*")
      .order("id", { ascending: false })
      .limit(150)

    if (error) {
      console.error("Error fetching audit logs:", error.message)
      return
    }

    if (data) {
      setLogs(data)

      const activeSet = new Set<string>()
      const sortedLogs = [...data].reverse()

      // Track active accounts based on recent system activity
      sortedLogs.forEach((log) => {
        const u = String(log.operator_username || "").trim().toLowerCase()
        if (!u) return
        if (log.action_type === "SESSION_LOGOUT") {
          activeSet.delete(u)
        } else {
          // Any activity (LOGIN, CHECKOUT, INVENTORY, ADMIN) indicates active operator
          activeSet.add(u)
        }
      })

      if (currentOperator?.username) {
        activeSet.add(String(currentOperator.username).trim().toLowerCase())
      }

      setActiveUsernames(Array.from(activeSet))
    }
  }

  const fetchBatchSalesHistory = async () => {
    const { data, error } = await supabase
      .from("sale_item_batches")
      .select("*")
      .order("id", { ascending: false })
      .limit(200)

    if (error) {
      console.error("Error fetching batch sales history:", error.message)
      return
    }
    if (data) setBatchSales(data)
  }

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from("operator_profiles")
      .select("*")
      .order("id", { ascending: true })

    if (error) {
      console.error("Error fetching operator profiles:", error.message)
      return
    }

    if (data) {
      const formattedProfiles: AccountProfile[] = data.map((item: any) => ({
        id: item.id,
        username: String(item.username || "").trim().toLowerCase(),
        password_text: String(item.password_text || "").trim(),
        display_name: item.display_name || item.username || "Staff Member",
        system_role: item.system_role || "staff"
      }))
      setProfiles(formattedProfiles)
    }
  }

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regUsername.trim() || !regPin.trim() || !regDisplayName.trim()) return

    const { error } = await supabase.from("operator_profiles").insert({
      username: regUsername.trim().toLowerCase(),
      password_text: regPin.trim(),
      display_name: regDisplayName.trim(),
      system_role: regRole
    })

    if (error) {
      alert(`Error creating profile: ${error.message}`)
      return
    }

    await onLogAction("CREATE_OPERATOR", "ADMIN_PANEL", `Created profile @${regUsername.toLowerCase()} (${regDisplayName})`)
    setRegUsername("")
    setRegPin("")
    setRegDisplayName("")
    setRegRole("staff")
    await fetchProfiles()
  }

  const handleDeleteProfile = async (profileId: number, username: string) => {
    if (!window.confirm(`Delete operator profile @${username}?`)) return

    await supabase.from("operator_profiles").delete().eq("id", profileId)
    await onLogAction("DELETE_OPERATOR", "ADMIN_PANEL", `Removed profile @${username}`)
    await fetchProfiles()
  }

  const formatDateString = (rawDate: any) => {
    if (!rawDate) return "Jul 21, 2026 02:45 PM"
    const parsedDate = new Date(rawDate)
    if (isNaN(parsedDate.getTime())) return "Jul 21, 2026 02:45 PM"

    return parsedDate.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) + " " +
           parsedDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  }

  const groupSalesByTransaction = () => {
    const map = new Map<number, {
      sale_id: number
      item_name: string
      total_qty: number
      total_price: number
      batches: { label: string; qty: number; price: number }[]
      created_at: string
    }>()

    batchSales.forEach(row => {
      const existing = map.get(row.sale_id)
      const lineCost = row.quantity_deducted * Number(row.unit_price)

      if (existing) {
        existing.total_qty += row.quantity_deducted
        existing.total_price += lineCost
        existing.batches.push({
          label: row.batch_label,
          qty: row.quantity_deducted,
          price: Number(row.unit_price)
        })
      } else {
        map.set(row.sale_id, {
          sale_id: row.sale_id,
          item_name: row.item_name,
          total_qty: row.quantity_deducted,
          total_price: lineCost,
          batches: [{
            label: row.batch_label,
            qty: row.quantity_deducted,
            price: Number(row.unit_price)
          }],
          created_at: row.created_at
        })
      }
    })

    return Array.from(map.values())
  }

  const groupedBatchSales = groupSalesByTransaction()

  const selectedReceiptBatches = selectedBatchReceiptSaleId
    ? batchSales.filter(b => Number(b.sale_id) === Number(selectedBatchReceiptSaleId))
    : []

  const receiptTotal = selectedReceiptBatches.reduce(
    (sum, b) => sum + (b.quantity_deducted * Number(b.unit_price)),
    0
  )

  const [batchTabMode, setBatchTabMode] = useState<"sales" | "creation">("sales")
  const [stockBatches, setStockBatches] = useState<any[]>([])

  const fetchInventoryBatches = async () => {
    const { data: invData } = await supabase.from("inventory").select("id, name")
    const { data: batchData } = await supabase.from("inventory_batches").select("*").order("id", { ascending: false }).limit(200)
    
    if (batchData) {
      const formatted = batchData.map((b: any) => {
        const inv = invData?.find(i => String(i.id) === String(b.item_id))
        return {
          id: b.id,
          item_id: b.item_id,
          item_name: inv?.name || "Stock Product Item",
          batch_label: b.batch_label,
          stock: b.stock,
          cost: Number(b.cost) || 0,
          price: Number(b.price) || 0,
          expiry_date: b.expiry_date || "",
          created_at: b.created_at || new Date().toISOString()
        }
      })
      setStockBatches(formatted)
    }
  }

  const fetchAllAdminData = async () => {
    setIsLoading(true)
    await Promise.all([
      fetchAdminLogs(),
      fetchBatchSalesHistory(),
      fetchInventoryBatches(),
      fetchProfiles()
    ])
    setIsLoading(false)
  }

  const [selectedStockVoucher, setSelectedStockVoucher] = useState<any | null>(null)

  const groupStockAdditions = () => {
    const map = new Map<string, {
      id: string
      batch_tag: string
      summary_name: string
      total_items: number
      total_stock: number
      total_val: number
      created_at: string
      items: { name: string; label: string; stock: number; price: number }[]
    }>()

    stockBatches.forEach(b => {
      const isBulk = String(b.batch_label).toUpperCase().includes("BULK")
      const timeKey = (b.created_at || "").slice(0, 16)
      const groupKey = isBulk ? `BULK_${timeKey}` : `SINGLE_${b.id}`

      const existing = map.get(groupKey)
      const itemVal = (Number(b.stock) || 0) * (Number(b.price) || 0)

      if (existing) {
        existing.total_items += 1
        existing.total_stock += Number(b.stock) || 0
        existing.total_val += itemVal
        existing.items.push({
          name: b.item_name,
          label: b.batch_label,
          stock: Number(b.stock) || 0,
          price: Number(b.price) || 0
        })
      } else {
        map.set(groupKey, {
          id: String(b.id),
          batch_tag: isBulk ? `BULK-IMPORT (${timeKey.replace('T', ' ')})` : b.batch_label,
          summary_name: isBulk ? `${b.item_name} & other bulk stock` : b.item_name,
          total_items: 1,
          total_stock: Number(b.stock) || 0,
          total_val: itemVal,
          created_at: b.created_at,
          items: [{
            name: b.item_name,
            label: b.batch_label,
            stock: Number(b.stock) || 0,
            price: Number(b.price) || 0
          }]
        })
      }
    })

    return Array.from(map.values())
  }

  const groupedStockAdditions = groupStockAdditions()

  const filteredStockAdditions = groupedStockAdditions.filter(group => {
    if (!batchSearchQuery.trim()) return true
    const q = batchSearchQuery.toLowerCase().trim()
    return (
      group.batch_tag.toLowerCase().includes(q) ||
      group.summary_name.toLowerCase().includes(q) ||
      group.items.some(i => i.name.toLowerCase().includes(q) || i.label.toLowerCase().includes(q))
    )
  })

  const filteredAuditLogs = logs.filter(log => {
    const matchModule = auditModuleFilter === "ALL" || (log.module_target || "").toUpperCase().includes(auditModuleFilter.toUpperCase())
    const q = auditSearchQuery.toLowerCase().trim()
    const matchQuery = !q || 
      (log.operator_username || "").toLowerCase().includes(q) ||
      (log.action_type || "").toLowerCase().includes(q) ||
      (log.details_summary || "").toLowerCase().includes(q) ||
      (log.module_target || "").toLowerCase().includes(q)
    return matchModule && matchQuery
  })

  const filteredGroupedBatchSales = groupedBatchSales.filter(sale => {
    if (!batchSearchQuery.trim()) return true
    const q = batchSearchQuery.toLowerCase().trim()
    const matchId = String(sale.sale_id).toLowerCase().includes(q) || `#${sale.sale_id}`.toLowerCase().includes(q)
    const matchItem = sale.item_name.toLowerCase().includes(q)
    const matchBatches = sale.batches.some(b => b.label.toLowerCase().includes(q))
    const matchDate = formatDateString(sale.created_at).toLowerCase().includes(q)
    return matchId || matchItem || matchBatches || matchDate
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs font-medium">
      
      {/* Left Column Controls */}
      <div className="space-y-6">
        
        {/* Profile Registration Form */}
        <div className="bg-white rounded-xl border p-5 shadow-xs space-y-4">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600" />
            Register New Account Profile
          </h3>

          <form onSubmit={handleCreateProfile} className="space-y-3">
            <div>
              <label className="block text-gray-500 font-bold uppercase text-[9px] mb-1">Operator Username ID</label>
              <input
                type="text"
                required
                placeholder="e.g. staff_member"
                value={regUsername}
                onChange={e => setRegUsername(e.target.value)}
                className="w-full p-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-bold uppercase text-[9px] mb-1">Account Password PIN</label>
              <input
                type="password"
                required
                placeholder="Enter access code..."
                value={regPin}
                onChange={e => setRegPin(e.target.value)}
                className="w-full p-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-bold uppercase text-[9px] mb-1">Full Display Employee Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Jane Doe"
                value={regDisplayName}
                onChange={e => setRegDisplayName(e.target.value)}
                className="w-full p-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-bold uppercase text-[9px] mb-1">Authorization Role</label>
              <select
                value={regRole}
                onChange={e => setRegRole(e.target.value)}
                className="w-full p-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold uppercase"
              >
                <option value="staff">STAFF OPERATOR</option>
                <option value="admin">SYSTEM ADMIN</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs text-xs tracking-wide transition-colors"
            >
              Create Credentials Profile
            </button>
          </form>
        </div>

        {/* Directory Listing */}
        <div className="bg-white rounded-xl border p-5 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-indigo-600" />
              Account Profiles Directory
            </h3>
            <span className="text-[10px] text-gray-400 font-mono">{profiles.length} Accounts</span>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {profiles.length === 0 ? (
              <p className="text-gray-400 text-center py-4 text-[11px]">No operator accounts created.</p>
            ) : (
              profiles.map(p => {
                const profileUsername = String(p.username || "").trim().toLowerCase()
                const isActiveUser = activeUsernames.includes(profileUsername)

                return (
                  <div key={p.id} className="p-3 bg-gray-50/80 border border-gray-100 rounded-xl flex justify-between items-center">
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex items-center justify-center">
                        <span className={`w-2.5 h-2.5 rounded-full ${isActiveUser ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {isActiveUser && (
                          <span className="absolute w-3.5 h-3.5 rounded-full bg-green-400 animate-ping opacity-75" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-gray-900 text-xs">{p.display_name}</p>
                          {isActiveUser && (
                            <span className="bg-green-100 text-green-700 font-bold text-[8px] px-1.5 py-0.2 rounded uppercase">
                              Active Now
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">@{p.username} • {p.system_role.toUpperCase()}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteProfile(p.id, p.username)}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Super Admin Data Reset Control Panel */}
        <div className="bg-red-50/70 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b border-red-200/60 pb-3">
            <h3 className="font-bold text-red-900 dark:text-red-300 text-sm flex items-center gap-2">
              <Flame className="w-4 h-4 text-red-600" />
              Super Admin Reset Zone
            </h3>
            <span className="bg-red-100 text-red-700 font-mono font-bold text-[9px] px-2 py-0.5 rounded border border-red-200">
              DANGER ZONE
            </span>
          </div>

          <p className="text-gray-600 dark:text-gray-400 text-[11px] leading-relaxed">
            Perform master data wipes for items, sales history, or logs. Database tables and schemas remain intact for new entries.
          </p>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => { setResetConfirmInput(""); setShowResetModal("inventory"); }}
              className="w-full py-2 px-3 bg-white dark:bg-slate-800 hover:bg-red-50 text-red-700 dark:text-red-400 font-bold rounded-lg border border-red-200 dark:border-red-900/40 text-left flex items-center justify-between shadow-2xs transition-colors"
            >
              <span className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-red-500" />
                Reset Item Specs & Stock Batches
              </span>
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>

            <button
              type="button"
              onClick={() => { setResetConfirmInput(""); setShowResetModal("sales"); }}
              className="w-full py-2 px-3 bg-white dark:bg-slate-800 hover:bg-red-50 text-red-700 dark:text-red-400 font-bold rounded-lg border border-red-200 dark:border-red-900/40 text-left flex items-center justify-between shadow-2xs transition-colors"
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="w-3.5 h-3.5 text-red-500" />
                Reset Sales History & Ledger
              </span>
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>

            <button
              type="button"
              onClick={() => { setResetConfirmInput(""); setShowResetModal("audit"); }}
              className="w-full py-2 px-3 bg-white dark:bg-slate-800 hover:bg-red-50 text-red-700 dark:text-red-400 font-bold rounded-lg border border-red-200 dark:border-red-900/40 text-left flex items-center justify-between shadow-2xs transition-colors"
            >
              <span className="flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-red-500" />
                Reset System Audit Trail Logs
              </span>
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>

            <button
              type="button"
              onClick={() => { setResetConfirmInput(""); setShowResetModal("all"); }}
              className="w-full py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-center flex items-center justify-center gap-2 shadow-md transition-all mt-3"
            >
              <AlertOctagon className="w-4 h-4" />
              ⚡ RESET ALL SYSTEM DATA (FACTORY RESET)
            </button>
          </div>
        </div>

      </div>

      {/* Right Column Tables */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Realtime System Audit Trail Logs Table */}
        <div className="bg-white rounded-xl border shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" />
              System Audit Trail Logs
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" title="Realtime Active" />
            </h3>
            <button
              type="button"
              onClick={fetchAllAdminData}
              className="text-gray-400 hover:text-gray-600 p-1 self-end sm:self-auto"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Module Filter & Search Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50/70 p-2.5 rounded-xl border">
            <div>
              <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Target Module Category</label>
              <select
                value={auditModuleFilter}
                onChange={e => setAuditModuleFilter(e.target.value)}
                className="w-full p-2 border border-gray-200 bg-white rounded-lg text-xs font-bold uppercase"
              >
                <option value="ALL">ALL MODULES</option>
                <option value="AUTHENTICATION">AUTHENTICATION Portal</option>
                <option value="POS_CHECKOUT">POS Checkout</option>
                <option value="ITEM_SPECIFICATIONS">Item Specifications</option>
                <option value="SALES_HISTORY">Sales History</option>
                <option value="ADMIN_PANEL">Admin Panel</option>
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Search Logs</label>
              <input
                type="text"
                placeholder="Search operator, action, details..."
                value={auditSearchQuery}
                onChange={e => setAuditSearchQuery(e.target.value)}
                className="w-full p-2 border border-gray-200 bg-white rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto pr-1 rounded-lg border border-gray-100">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/90 text-[10px] text-gray-500 font-bold uppercase sticky top-0 backdrop-blur-xs z-10 border-b">
                <tr>
                  <th className="py-2.5 px-3">Timestamp Date</th>
                  <th className="py-2.5 px-3">Operator</th>
                  <th className="py-2.5 px-3">Action Tag</th>
                  <th className="py-2.5 px-3">Target Module</th>
                  <th className="py-2.5 px-3 text-center">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y text-[11px] bg-white">
                {filteredAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-400">No system audit logs found matching filters.</td>
                  </tr>
                ) : (
                  filteredAuditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50/50">
                      <td className="py-2.5 px-3 text-gray-500 font-mono text-[10px] whitespace-nowrap">
                        {formatDateString(log.created_at)}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-gray-900 whitespace-nowrap">@{log.operator_username || "admin"}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-mono font-bold text-[9px] border border-amber-100">
                          {log.action_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 font-mono text-[10px] whitespace-nowrap">{log.module_target}</td>
                      <td className="py-2.5 px-3 text-center">
                        <button 
                          type="button" 
                          onClick={() => setSelectedLogSummary(log)} 
                          className="text-blue-500 hover:text-blue-700 p-1"
                          title="View Audit Trail Entry Details"
                        >
                          <Eye className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Realtime Batch Sales & Stock Additions Logs Table */}
        <div className="bg-white rounded-xl border shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-green-600" />
              Batch History & Stock Additions Logs
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" title="Realtime Active" />
            </h3>
            
            {/* Mode Tab Switch */}
            <div className="flex bg-gray-100 p-0.5 rounded-lg border text-[10px]">
              <button
                type="button"
                onClick={() => setBatchTabMode("sales")}
                className={`px-3 py-1 rounded-md font-bold transition-all ${batchTabMode === "sales" ? 'bg-white text-blue-700 shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Batch Sales
              </button>
              <button
                type="button"
                onClick={() => setBatchTabMode("creation")}
                className={`px-3 py-1 rounded-md font-bold transition-all ${batchTabMode === "creation" ? 'bg-white text-blue-700 shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Stock Additions (Single/Bulk)
              </button>
            </div>
          </div>

          {/* Batch Sales Search Bar */}
          <div className="bg-gray-50/70 p-2.5 rounded-xl border">
            <input
              type="text"
              placeholder={batchTabMode === "sales" ? "Search batch sales by Sale ID, Item Name, Batch Label..." : "Search stock creation batches by Item Name, Batch Label, Expiry..."}
              value={batchSearchQuery}
              onChange={e => setBatchSearchQuery(e.target.value)}
              className="w-full p-2 border border-gray-200 bg-white rounded-lg text-xs"
            />
          </div>

          <div className="max-h-80 overflow-y-auto pr-1 rounded-lg border border-gray-100">
            {batchTabMode === "sales" ? (
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/90 text-[10px] text-gray-500 font-bold uppercase sticky top-0 backdrop-blur-xs z-10 border-b">
                  <tr>
                    <th className="py-2.5 px-3">Tx ID</th>
                    <th className="py-2.5 px-3">Item & Batches Used</th>
                    <th className="py-2.5 px-3 text-center">Total Qty</th>
                    <th className="py-2.5 px-3 text-right">Total Price</th>
                    <th className="py-2.5 px-3 text-right">Time & Date</th>
                    <th className="py-2.5 px-3 text-center">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono text-[11px] bg-white">
                  {filteredGroupedBatchSales.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-400 font-sans">
                        No batch sales logged matching search query.
                      </td>
                    </tr>
                  ) : (
                    filteredGroupedBatchSales.map(sale => (
                      <tr key={sale.sale_id} className="hover:bg-gray-50/50">
                        <td className="py-2.5 px-3 font-bold text-blue-600">#{sale.sale_id}</td>
                        <td className="py-2.5 px-3 font-sans">
                          <p className="font-bold text-gray-900 leading-tight">{sale.item_name}</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {sale.batches.map((b, i) => (
                              <span key={i} className="text-[9px] text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                Batch: {b.label} ({b.qty} pc @ ₱{b.price.toFixed(2)})
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-gray-800">{sale.total_qty} pc</td>
                        <td className="py-2.5 px-3 text-right font-bold text-green-700">₱{sale.total_price.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-400 text-[10px] font-sans whitespace-nowrap">
                          {formatDateString(sale.created_at)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedBatchReceiptSaleId(sale.sale_id)}
                            className="text-blue-500 hover:text-blue-700 p-1"
                            title="View Batch Receipt"
                          >
                            <Eye className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/90 text-[10px] text-gray-500 font-bold uppercase sticky top-0 backdrop-blur-xs z-10 border-b">
                  <tr>
                    <th className="py-2.5 px-3">Batch Event Tag</th>
                    <th className="py-2.5 px-3">Products Included</th>
                    <th className="py-2.5 px-3 text-center">Total Stock</th>
                    <th className="py-2.5 px-3 text-right">Total Value</th>
                    <th className="py-2.5 px-3 text-right">Time & Date</th>
                    <th className="py-2.5 px-3 text-center">Voucher</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono text-[11px] bg-white">
                  {filteredStockAdditions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-400 font-sans">
                        No stock creation batches logged.
                      </td>
                    </tr>
                  ) : (
                    filteredStockAdditions.map(group => (
                      <tr key={group.id} className="hover:bg-gray-50/50">
                        <td className="py-2.5 px-3 font-bold text-indigo-600">{group.batch_tag}</td>
                        <td className="py-2.5 px-3 font-sans">
                          <p className="font-bold text-gray-900 leading-tight">{group.summary_name}</p>
                          {group.total_items > 1 && (
                            <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-mono border border-indigo-100 mt-0.5 inline-block font-bold">
                              {group.total_items} items in bulk batch
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-gray-800">{group.total_stock} pc</td>
                        <td className="py-2.5 px-3 text-right font-bold text-green-700">₱{group.total_val.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-400 text-[10px] font-sans whitespace-nowrap">
                          {formatDateString(group.created_at)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedStockVoucher(group)}
                            className="text-blue-500 hover:text-blue-700 p-1"
                            title="View Stock Addition Breakdown Voucher"
                          >
                            <Eye className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      {/* Styled Audit Trail Entry Details Modal */}
      {selectedLogSummary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-gray-100">
            
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="text-amber-500 text-lg">📝</span>
                <h3 className="font-bold text-base text-gray-900">Audit Trail Entry Details</h3>
              </div>
              <span className="text-xs text-gray-400 font-mono">ID: #{selectedLogSummary.id}</span>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3 font-mono text-[11px]">
              
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans">TIMESTAMP:</span>
                <span className="font-bold text-gray-800">{formatDateString(selectedLogSummary.created_at)}</span>
              </div>

              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans">USER IDENTITY:</span>
                <span className="font-bold text-[#1c2d2c]">@{selectedLogSummary.operator_username || "admin"}</span>
              </div>

              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans">ACTION TYPE:</span>
                <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                  {selectedLogSummary.action_type}
                </span>
              </div>

              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans">MODULE TARGET:</span>
                <span className="font-bold text-gray-800">{selectedLogSummary.module_target}</span>
              </div>

              <div className="space-y-1 pt-1">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans">
                  DETAILS SUMMARY STATEMENT:
                </span>
                <div className="p-3 bg-white rounded-lg border border-gray-200 text-xs font-sans font-medium text-gray-800 leading-relaxed shadow-xs">
                  {selectedLogSummary.details_summary || "User terminal log-in verification session authorized successfully."}
                </div>
              </div>

            </div>

            <button
              type="button"
              onClick={() => setSelectedLogSummary(null)}
              className="w-full py-3 bg-[#0F172A] hover:bg-slate-800 text-white font-bold rounded-xl tracking-wide shadow-md text-xs transition-colors"
            >
              Close Details View
            </button>

          </div>
        </div>
      )}

      {/* Batch Breakdown Receipt Modal */}
      {selectedBatchReceiptSaleId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 font-mono text-[11px] text-gray-800 space-y-4 shadow-xl border">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <h3 className="font-bold text-sm text-gray-900">Malabon Pharmacy and Clinic</h3>
                <p className="text-gray-500 text-[10px]">Batch Breakdown Receipt #{selectedBatchReceiptSaleId}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBatchReceiptSaleId(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border-b border-dashed pb-3 space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans">Batch Deductions Itemized:</p>
              {selectedReceiptBatches.map(b => (
                <div key={b.id} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 flex justify-between items-center font-mono">
                  <div>
                    <p className="font-bold text-gray-900">{b.batch_label}</p>
                    <p className="text-[10px] text-gray-500 font-sans mt-0.5">{b.item_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{b.quantity_deducted} pc</p>
                    <p className="text-green-700 font-bold text-[10px]">₱{Number(b.unit_price).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between border-t pt-2 font-bold text-sm text-gray-900">
              <span>Batch Total Value:</span>
              <span className="text-blue-600 font-mono">₱{receiptTotal.toFixed(2)}</span>
            </div>

            <button
              type="button"
              onClick={() => setSelectedBatchReceiptSaleId(null)}
              className="w-full py-2 bg-gray-900 text-white hover:bg-gray-800 font-bold rounded-lg tracking-wide shadow-xs"
            >
              Close Receipt Voucher
            </button>
          </div>
        </div>
      )}

      {/* Stock Addition Breakdown Voucher Modal */}
      {selectedStockVoucher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 font-mono text-[11px] text-gray-800 space-y-4 shadow-xl border">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <h3 className="font-bold text-sm text-gray-900">Malabon Pharmacy and Clinic</h3>
                <p className="text-gray-500 text-[10px]">Stock Addition Voucher ({selectedStockVoucher.batch_tag})</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStockVoucher(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2 max-h-72 overflow-y-auto">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans border-b pb-1">
                BATCH CREATION ITEMIZATIONS ({selectedStockVoucher.items.length}):
              </p>
              <div className="divide-y divide-gray-200/60">
                {selectedStockVoucher.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center py-2 font-mono">
                    <div>
                      <span className="font-bold text-indigo-600 text-[10px] block">{item.label}</span>
                      <span className="text-[11px] text-gray-900 font-bold font-sans">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-gray-900 block">{item.stock} pc</span>
                      <span className="text-green-700 font-bold text-[10px]">₱{Number(item.price).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between border-t pt-2 font-bold text-sm text-gray-900">
              <span>Total Stock Added Value:</span>
              <span className="text-blue-600 font-mono">₱{selectedStockVoucher.total_val.toFixed(2)}</span>
            </div>

            <button
              type="button"
              onClick={() => setSelectedStockVoucher(null)}
              className="w-full py-3 bg-[#0F172A] hover:bg-slate-800 text-white font-bold rounded-xl tracking-wide shadow-md text-xs transition-colors"
            >
              Close Receipt Voucher
            </button>
          </div>
        </div>
      )}

      {/* Super Admin Data Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-red-100">
            <div className="flex justify-between items-start border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-gray-900">Confirm Master Data Reset</h3>
                  <p className="text-[10px] text-red-600 font-mono font-bold uppercase">
                    Target: {showResetModal.toUpperCase()} WIPE
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setShowResetModal(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-800 space-y-2">
              <p className="font-bold">⚠️ Warning: Data purge is permanent.</p>
              <p className="text-[11px] leading-relaxed">
                All saved data rows in <strong>{showResetModal.toUpperCase()}</strong> will be removed. All database tables and columns will remain completely intact and ready for fresh entries.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Type <span className="text-red-600 font-mono font-bold">"RESET DATA"</span> to authorize:
              </label>
              <input
                type="text"
                value={resetConfirmInput}
                onChange={e => setResetConfirmInput(e.target.value)}
                placeholder="Type RESET DATA..."
                className="w-full p-2.5 border border-red-300 rounded-xl text-xs font-mono font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => executeDataReset(showResetModal)}
                disabled={resetConfirmInput.trim() !== "RESET DATA" || isLoading}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-md text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                Execute Data Reset
              </button>
              <button
                type="button"
                onClick={() => setShowResetModal(null)}
                className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}