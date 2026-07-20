import { useState, useEffect } from "react"
import { supabase } from "./apiClient"
import { UserPlus, Shield, Trash2, RefreshCw, AlertCircle, ScrollText, Eye } from "lucide-react"

interface OperatorAccount {
  id: string
  username: string
  display_name: string
  system_role: string
}

interface AuditLog {
  id: string
  timestamp: string
  operator_username: string
  action_type: string
  module_target: string
  details_summary: string
}

interface AdminPanelProps {
  onLogAction: (actionType: string, moduleTarget: string, details: string) => Promise<void>
}

export function AdminPanel({ onLogAction }: AdminPanelProps) {
  const [accounts, setAccounts] = useState<OperatorAccount[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [systemRole, setSystemRole] = useState("staff")
  
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  useEffect(() => {
    fetchAccountsList()
    fetchAuditTrailLogs()
  }, [])

  const fetchAccountsList = async () => {
    const { data } = await supabase
      .from("operator_profiles")
      .select("id, username, display_name, system_role")
      .order("username", { ascending: true })
    if (data) {
      setAccounts(data.map(acc => ({
        id: String(acc.id),
        username: acc.username,
        display_name: acc.display_name,
        system_role: acc.system_role
      })))
    }
  }

  const fetchAuditTrailLogs = async () => {
    const { data } = await supabase
      .from("system_audit_logs")
      .select("*")
      .order("timestamp", { ascending: false })
    if (data) {
      setAuditLogs(data.map(l => ({
        id: String(l.id),
        timestamp: l.timestamp,
        operator_username: l.operator_username,
        action_type: l.action_type,
        module_target: l.module_target,
        details_summary: l.details_summary
      })))
    }
  }

  const handleRegisterAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim() || !displayName.trim()) return

    setIsProcessing(true)
    setStatusMessage(null)

    const { data: existing } = await supabase
      .from("operator_profiles")
      .select("id")
      .eq("username", username.trim().toLowerCase())
      .maybeSingle()

    if (existing) {
      setStatusMessage({ type: "error", text: "Username profile registry conflict token detected." })
      setIsProcessing(false)
      return
    }

    const { error } = await supabase
      .from("operator_profiles")
      .insert({
        username: username.trim().toLowerCase(),
        password_text: password,
        display_name: displayName.trim(),
        system_role: systemRole
      })

    if (error) {
      setStatusMessage({ type: "error", text: "Database connection parameter insertion anomaly." })
    } else {
      setStatusMessage({ type: "success", text: "New staff profile structural record registered." })
      await onLogAction("ACCOUNT_CREATION", "ADMIN_PANEL", `Registered new operator credentials for profile entry: "${username.trim()}"`)
      setUsername("")
      setPassword("")
      setDisplayName("")
      setSystemRole("staff")
      fetchAccountsList()
      fetchAuditTrailLogs()
    }
    setIsProcessing(false)
  }

  const handleDeleteAccount = async (id: string, targetUser: string) => {
    if (targetUser.toLowerCase() === "admin") {
      alert("Baseline primary root administrator registration layer cannot be voided.")
      return
    }
    if (!window.confirm(`Delete operator access logs for profile entry account #${targetUser}?`)) return

    await supabase.from("operator_profiles").delete().eq("id", Number(id))
    await onLogAction("ACCOUNT_DELETION", "ADMIN_PANEL", `Revoked account and deleted operator profile: "${targetUser}"`)
    fetchAccountsList()
    fetchAuditTrailLogs()
  }

  const formatLogTime = (tStr: string) => {
    return new Date(tStr).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric"
    }) + " " + new Date(tStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-6 text-xs font-medium">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column Form Block */}
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
            <h4 className="font-bold text-gray-800 text-sm tracking-wide flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-blue-600" />
              Register New Account Profile
            </h4>

            {statusMessage && (
              <div className={`p-3 border rounded-xl flex items-center gap-2 font-bold ${statusMessage.type === "success" ? "bg-green-50 border-green-100 text-green-700" : "bg-red-50 border-red-100 text-red-600"}`}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{statusMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleRegisterAccount} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-gray-500 font-bold uppercase text-[9px] tracking-wider">Operator Username ID</label>
                <input type="text" required disabled={isProcessing} value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. staff_member" className="w-full p-2 border border-gray-200 rounded-lg text-xs bg-white" />
              </div>
              <div className="space-y-1">
                <label className="block text-gray-500 font-bold uppercase text-[9px] tracking-wider">Account Password Pin</label>
                <input type="text" required disabled={isProcessing} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter access code..." className="w-full p-2 border border-gray-200 rounded-lg text-xs bg-white" />
              </div>
              <div className="space-y-1">
                <label className="block text-gray-500 font-bold uppercase text-[9px] tracking-wider">Full Display Employee Name</label>
                <input type="text" required disabled={isProcessing} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Jane Doe" className="w-full p-2 border border-gray-200 rounded-lg text-xs bg-white" />
              </div>
              <div className="space-y-1">
                <label className="block text-gray-500 font-bold uppercase text-[9px] tracking-wider">Authorization Role</label>
                <select value={systemRole} onChange={e => setSystemRole(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg uppercase bg-white text-xs font-bold">
                  <option value="staff">Staff Operator</option>
                  <option value="admin">System Administrator</option>
                </select>
              </div>
              <button type="submit" disabled={isProcessing} className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-lg shadow text-xs tracking-wide">
                Create Credentials Profile
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden p-4 space-y-3">
            <h4 className="font-bold text-gray-800 text-xs tracking-wide flex items-center gap-1.5 border-b pb-2">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              Active Profiles Directory
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {accounts.map(acc => (
                <div key={acc.id} className="flex justify-between items-center p-2.5 border rounded-lg bg-gray-50/50">
                  <div>
                    <p className="font-bold text-gray-900">{acc.display_name}</p>
                    <p className="text-[10px] text-gray-400 font-mono">@{acc.username} • {acc.system_role.toUpperCase()}</p>
                  </div>
                  <button type="button" disabled={acc.username === "admin"} onClick={() => handleDeleteAccount(acc.id, acc.username)} className="text-gray-400 hover:text-red-500 disabled:opacity-20">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Complete System Audit Trail Logs list View */}
        <div className="lg:col-span-2 bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col h-[520px]">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white">
            <h3 className="font-bold text-gray-800 text-sm tracking-wide flex items-center gap-1.5">
              <ScrollText className="w-4 h-4 text-orange-500" />
              System Audit Trail Logs
            </h3>
            <button type="button" onClick={fetchAuditTrailLogs} className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                <tr className="text-gray-500 font-bold">
                  <th className="p-3">Timestamp Date</th>
                  <th className="p-3">Operator</th>
                  <th className="p-3">Action Tag</th>
                  <th className="p-3">Target Module</th>
                  <th className="p-3 text-center">Summary</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400 font-medium">No recorded actions logged.</td>
                  </tr>
                ) : (
                  auditLogs.map(log => (
                    <tr key={log.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40 text-[11px]">
                      <td className="p-3 font-mono text-gray-500 whitespace-nowrap">{formatLogTime(log.timestamp)}</td>
                      <td className="p-3 font-bold text-gray-900">@{log.operator_username}</td>
                      <td className="p-3">
                        <span className="px-1.5 py-0.5 rounded font-mono text-[9px] bg-amber-50 text-amber-700 border border-amber-100 font-bold">
                          {log.action_type}
                        </span>
                      </td>
                      <td className="p-3 text-gray-600 font-medium whitespace-nowrap">{log.module_target}</td>
                      <td className="p-3 text-center">
                        <button type="button" onClick={() => setSelectedLog(log)} className="p-1 text-blue-600 hover:text-blue-800" title="Review Complete Statement Log">
                          <Eye className="w-3.5 h-3.5" />
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

      {/* Audit Log Overlay Modal details panel */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-5 font-sans space-y-4 shadow-xl border">
            <div className="border-b pb-2 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                <ScrollText className="w-4 h-4 text-orange-500" />
                Audit Trail Entry Details
              </h3>
              <span className="font-mono text-[10px] text-gray-400">ID: #{selectedLog.id}</span>
            </div>
            
            <div className="space-y-2 bg-gray-50 p-3 rounded-lg border text-gray-700">
              <div className="flex justify-between"><span className="text-gray-400 uppercase tracking-wide text-[9px] font-bold">Timestamp:</span><span className="font-mono">{formatLogTime(selectedLog.timestamp)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400 uppercase tracking-wide text-[9px] font-bold">User Identity:</span><span className="font-bold text-gray-900">@{selectedLog.operator_username}</span></div>
              <div className="flex justify-between"><span className="text-gray-400 uppercase tracking-wide text-[9px] font-bold">Action Type:</span><span className="font-mono text-amber-700 font-bold">{selectedLog.action_type}</span></div>
              <div className="flex justify-between"><span className="text-gray-400 uppercase tracking-wide text-[9px] font-bold">Module Target:</span><span className="font-semibold">{selectedLog.module_target}</span></div>
              <div className="pt-2 border-t mt-2">
                <span className="block text-gray-400 uppercase tracking-wide text-[9px] font-bold mb-1">Details Summary Statement:</span>
                <p className="text-xs font-semibold text-gray-900 bg-white p-2.5 border rounded-md leading-relaxed">{selectedLog.details_summary}</p>
              </div>
            </div>

            <button type="button" onClick={() => setSelectedLog(null)} className="w-full py-1.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-lg tracking-wide shadow-xs transition-colors">
              Close Details View
            </button>
          </div>
        </div>
      )}
    </div>
  )
}