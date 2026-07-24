import { useState, useEffect } from "react"
import { supabase } from "./apiClient"
import { ShieldAlert, UserPlus, Trash2, History, RefreshCw, ShoppingBag, Eye, X } from "lucide-react"

interface AdminPanelProps {
  currentOperator: { username: string; displayName: string; systemRole: string }
  onLogAction: (actionType: string, moduleTarget: string, details: string) => Promise<void>
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

export function AdminPanel({ currentOperator, onLogAction }: AdminPanelProps) {
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

  const fetchAllAdminData = async () => {
    setIsLoading(true)
    await Promise.all([
      fetchAdminLogs(),
      fetchBatchSalesHistory(),
      fetchProfiles()
    ])
    setIsLoading(false)
  }

  const fetchAdminLogs = async () => {
    const { data, error } = await supabase
      .from("system_audit_logs")
      .select("*")
      .order("id", { ascending: false })
      .limit(100)

    if (error) {
      console.error("Error fetching audit logs:", error.message)
      return
    }

    if (data) {
      setLogs(data)

      const activeSet = new Set<string>()
      const sortedLogs = [...data].reverse()

      sortedLogs.forEach((log) => {
        const u = String(log.operator_username || "").trim().toLowerCase()
        if (log.action_type === "SESSION_LOGIN") activeSet.add(u)
        if (log.action_type === "SESSION_LOGOUT") activeSet.delete(u)
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

      </div>

      {/* Right Column Tables */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Realtime System Audit Trail Logs Table */}
        <div className="bg-white rounded-xl border shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" />
              System Audit Trail Logs
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" title="Realtime Active" />
            </h3>
            <button
              type="button"
              onClick={fetchAllAdminData}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
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
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-400">No system audit logs found.</td>
                  </tr>
                ) : (
                  logs.map(log => (
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

        {/* Realtime Batch Sales History Logs Table */}
        <div className="bg-white rounded-xl border shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-green-600" />
              Batch Sales History Logs
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" title="Realtime Active" />
            </h3>
            <span className="text-[10px] text-gray-400 font-mono">Real-time Batch Tracking</span>
          </div>

          <div className="max-h-80 overflow-y-auto pr-1 rounded-lg border border-gray-100">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/90 text-[10px] text-gray-500 font-bold uppercase sticky top-0 backdrop-blur-xs z-10 border-b">
                <tr>
                  <th className="py-2.5 px-3">Tx ID</th>
                  <th className="py-2.5 px-3">Item & Batches Used</th>
                  <th className="py-2.5 px-3 text-center">Qty Sold</th>
                  <th className="py-2.5 px-3 text-right">Unit Price</th>
                  <th className="py-2.5 px-3 text-right">Time & Date</th>
                  <th className="py-2.5 px-3 text-center">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y font-mono text-[11px] bg-white">
                {groupedBatchSales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-400 font-sans">
                      No batch sales logged yet.
                    </td>
                  </tr>
                ) : (
                  groupedBatchSales.map(sale => (
                    <tr key={sale.sale_id} className="hover:bg-gray-50/50">
                      <td className="py-2.5 px-3 font-bold text-blue-600">#{sale.sale_id}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <p className="font-bold text-gray-900 leading-tight">{sale.item_name}</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {sale.batches.map((b, i) => (
                            <span key={i} className="text-[9px] text-gray-500 font-mono bg-gray-100 px-1 py-0.2 rounded">
                              {b.label} ({b.qty}x)
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-gray-800">{sale.total_qty}</td>
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
                <span className="font-bold text-gray-900">@{selectedLogSummary.operator_username || "admin"}</span>
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

    </div>
  )
}