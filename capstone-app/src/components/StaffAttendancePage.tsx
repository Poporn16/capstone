import { useState, useEffect, useMemo } from "react"
import { Clock, Search, Download, Calendar, UserCheck, RefreshCw } from "lucide-react"
import { downloadExcelWithAutoFit } from "../utils/excelUtils"
import { supabase } from "../utils/apiClient"

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
  const [dateFrame, setDateFrame] = useState<"all" | "today" | "week" | "month" | "custom">("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const loadAttendance = async () => {
    try {
      const { data } = await supabase.from("staff_attendance").select("*").order("id", { ascending: false })
      if (data) {
        const formatted: AttendanceRecord[] = data.map((d: any) => ({
          id: String(d.id),
          username: d.username || "",
          displayName: d.display_name || d.username || "",
          systemRole: d.system_role || "staff",
          timeIn: d.time_in,
          timeOut: d.time_out || undefined,
          durationMinutes: d.duration_minutes || undefined
        }))
        setRecords(formatted)
      }
    } catch (e) {
      console.error("Failed to load attendance", e)
    }
  }

  useEffect(() => {
    loadAttendance()

    const handleSync = () => loadAttendance()
    window.addEventListener("pinv_attendance_updated", handleSync)

    const channel = supabase
      .channel("staff-attendance-page-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_attendance" }, loadAttendance)
      .subscribe()

    return () => {
      window.removeEventListener("pinv_attendance_updated", handleSync)
      supabase.removeChannel(channel)
    }
  }, [])

  const checkDateFrame = (isoString: string) => {
    if (dateFrame === "all") return true
    if (!isoString) return false
    const d = new Date(isoString)
    const now = new Date()
    if (dateFrame === "today") {
      return d.toDateString() === now.toDateString()
    }
    if (dateFrame === "week") {
      const day = now.getDay()
      const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1)
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMon, 0, 0, 0, 0)
      const endOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMon + 6, 23, 59, 59, 999)
      return d >= startOfWeek && d <= endOfWeek
    }
    if (dateFrame === "month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return d >= startOfMonth && d <= endOfMonth
    }
    if (dateFrame === "custom") {
      if (startDate && d < new Date(startDate + "T00:00:00")) return false
      if (endDate && d > new Date(endDate + "T23:59:59")) return false
      return true
    }
    return true
  }

  const filteredRecords = records.filter(r => {
    if (!checkDateFrame(r.timeIn)) return false
    const q = searchQuery.toLowerCase().trim()
    const matchSearch = !q ||
      r.username.toLowerCase().includes(q) ||
      r.displayName.toLowerCase().includes(q)

    const matchRole = roleFilter === "all" || (r.systemRole || "staff").toLowerCase() === roleFilter.toLowerCase()

    return matchSearch && matchRole
  })

  // Total shift duration calculation for searched staff/filter
  const totalShiftSummary = useMemo(() => {
    let totalMins = 0

    filteredRecords.forEach(r => {
      if (r.durationMinutes && r.durationMinutes > 0) {
        totalMins += r.durationMinutes
      } else if (!r.timeOut && r.timeIn) {
        const start = new Date(r.timeIn).getTime()
        const now = Date.now()
        const liveMins = Math.max(1, Math.floor((now - start) / (1000 * 60)))
        totalMins += liveMins
      }
    })

    const hours = Math.floor(totalMins / 60)
    const remMins = totalMins % 60
    const formattedStr = hours > 0 ? `${totalMins}m (${hours}h ${remMins}m)` : `${totalMins}m`

    return { totalMins, formattedStr, count: filteredRecords.length }
  }, [filteredRecords])

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

      {/* Filter Header with Date Frame */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by staff username or display name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700 dark:text-white text-xs font-medium focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg uppercase tracking-wider bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white text-xs font-bold"
          >
            <option value="all">All Roles</option>
            <option value="staff">STAFF</option>
            <option value="admin">ADMIN</option>
            <option value="superadmin">SUPERADMIN</option>
          </select>
        </div>

        {/* Date Frame Filter Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t dark:border-slate-700">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Date Frame:
            </span>
            {(["all", "today", "week", "month", "custom"] as const).map(frame => (
              <button
                key={frame}
                type="button"
                onClick={() => setDateFrame(frame)}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${dateFrame === frame ? 'bg-blue-600 text-white shadow-2xs' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
              >
                {frame === "all" ? "All Time" : frame === "today" ? "Today" : frame === "week" ? "This Week" : frame === "month" ? "This Month" : "Custom Range"}
              </button>
            ))}
          </div>

          {dateFrame === "custom" && (
            <div className="flex items-center gap-2 animate-in fade-in duration-150">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="p-1.5 border dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-gray-800 dark:text-white font-mono"
              />
              <span className="text-gray-400 text-xs font-bold">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="p-1.5 border dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-gray-800 dark:text-white font-mono"
              />
            </div>
          )}
        </div>
      </div>

      {/* Total Accumulated Time Summary Badge */}
      {filteredRecords.length > 0 && (
        <div className="p-3.5 bg-blue-50/80 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-xl flex items-center justify-between font-mono text-xs text-blue-900 dark:text-blue-200 shadow-2xs">
          <span className="flex items-center gap-2 font-bold">
            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            {searchQuery.trim()
              ? `Total Accumulated Working Shift Time for "${searchQuery.trim()}":`
              : "Total Combined Shift Duration (Filtered Records):"}
          </span>
          <span className="text-xs font-extrabold text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900 px-3 py-1 rounded-lg border border-blue-300 dark:border-blue-700">
            ⏱️ {totalShiftSummary.formattedStr}
          </span>
        </div>
      )}

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
