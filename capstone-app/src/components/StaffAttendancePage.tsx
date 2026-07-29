import { useState, useEffect } from "react"
import { Clock, Search, Download, Calendar, UserCheck, RefreshCw } from "lucide-react"
import { downloadExcelWithAutoFit } from "../utils/excelUtils"

export interface AttendanceRecord {
  id: string
  username: string
  displayName: string
  systemRole: string
  timeIn: string
  timeOut?: string
  durationMinutes?: number
}

interface StaffAttendancePageProps {
  currentOperator: { username: string; displayName: string; systemRole: string }
}

export function StaffAttendancePage({ currentOperator }: StaffAttendancePageProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")

  const loadAttendance = () => {
    try {
      const stored = localStorage.getItem("pinv_staff_attendance")
      if (stored) {
        setRecords(JSON.parse(stored))
      }
    } catch (e) {
      console.error("Failed to load attendance", e)
    }
  }

  useEffect(() => {
    loadAttendance()
  }, [])

  const filteredRecords = records.filter(r => {
    const q = searchQuery.toLowerCase().trim()
    const matchSearch = !q ||
      r.username.toLowerCase().includes(q) ||
      r.displayName.toLowerCase().includes(q)

    const matchRole = roleFilter === "all" || (r.systemRole || "staff").toLowerCase() === roleFilter.toLowerCase()

    return matchSearch && matchRole
  })

  const handleExportExcel = () => {
    if (filteredRecords.length === 0) return
    const headers = ["Entry ID", "Operator Username", "Display Name", "System Role", "Time In", "Time Out", "Shift Duration (Minutes)", "Status"]
    const rows = filteredRecords.map(r => [
      `#${r.id}`,
      r.username,
      r.displayName,
      r.systemRole || "staff",
      new Date(r.timeIn).toLocaleString(),
      r.timeOut ? new Date(r.timeOut).toLocaleString() : "Active Shift",
      r.durationMinutes || 0,
      r.timeOut ? "Completed" : "Active"
    ])

    downloadExcelWithAutoFit("staff_attendance_logs", "Staff Attendance Records", headers, rows, false)
  }

  const activeSessionsCount = records.filter(r => !r.timeOut).length

  return (
    <div className="space-y-6 text-xs font-medium font-sans">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-5 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Staff Attendance Records (Admin Portal)</h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Monitor staff clock-in / clock-out timestamps, shift durations, and active working sessions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAttendance}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 font-bold rounded-lg flex items-center gap-1.5 border dark:border-slate-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Records
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filteredRecords.length === 0}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export Attendance Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs">
          <span className="text-gray-400 dark:text-slate-400 font-bold text-[10px] uppercase tracking-wider block">Total Recorded Shifts</span>
          <h3 className="text-gray-900 dark:text-white font-bold text-xl mt-1 font-mono">{records.length}</h3>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs">
          <span className="text-gray-400 dark:text-slate-400 font-bold text-[10px] uppercase tracking-wider block">Currently Active Shifts</span>
          <h3 className="text-emerald-600 dark:text-emerald-400 font-bold text-xl mt-1 font-mono flex items-center gap-2">
            <span>{activeSessionsCount}</span>
            {activeSessionsCount > 0 && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>}
          </h3>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs">
          <span className="text-gray-400 dark:text-slate-400 font-bold text-[10px] uppercase tracking-wider block">Unique Staff Members</span>
          <h3 className="text-blue-600 dark:text-blue-400 font-bold text-xl mt-1 font-mono">
            {new Set(records.map(r => r.username)).size}
          </h3>
        </div>
      </div>

      {/* Filter Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by staff username or display name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700 dark:text-white text-xs"
            />
          </div>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg uppercase tracking-wider bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white text-xs"
          >
            <option value="all">All Roles</option>
            <option value="staff">STAFF</option>
            <option value="admin">ADMIN</option>
            <option value="superadmin">SUPERADMIN</option>
          </select>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 sticky top-0 z-10">
              <tr className="text-gray-500 dark:text-slate-400 font-bold">
                <th className="p-4">Staff Member</th>
                <th className="p-4">Role</th>
                <th className="p-4">Time In</th>
                <th className="p-4">Time Out</th>
                <th className="p-4">Shift Duration</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400 dark:text-slate-500 font-medium">
                    No staff attendance records match your filter query.
                  </td>
                </tr>
              ) : (
                filteredRecords.map(r => {
                  const inDate = new Date(r.timeIn)
                  const inStr = inDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " at " + inDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  const outStr = r.timeOut
                    ? new Date(r.timeOut).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " at " + new Date(r.timeOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : null

                  const hours = r.durationMinutes ? Math.floor(r.durationMinutes / 60) : 0
                  const mins = r.durationMinutes ? r.durationMinutes % 60 : 0
                  const durationStr = r.durationMinutes ? `${hours}h ${mins}m` : "-"

                  return (
                    <tr key={r.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/60 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-gray-900 dark:text-white">
                          {r.displayName}
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-slate-400">@{r.username}</span>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 font-mono text-[10px] font-bold uppercase text-gray-700 dark:text-slate-300">
                          {r.systemRole || "staff"}
                        </span>
                      </td>
                      <td className="p-4 text-gray-700 dark:text-slate-200 font-medium whitespace-nowrap">{inStr}</td>
                      <td className="p-4 text-gray-700 dark:text-slate-200 font-medium whitespace-nowrap">
                        {outStr ? (
                          <span>{outStr}</span>
                        ) : (
                          <span className="text-emerald-600 font-bold flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Active Working Shift
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-mono font-bold text-blue-700 dark:text-blue-400">{durationStr}</td>
                      <td className="p-4">
                        {r.timeOut ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300">
                            Completed
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                            Clocked In
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
