import { useState, useEffect, useMemo } from "react"
import { Clock, Search, Download, Calendar, UserCheck, RefreshCw, Trash2, AlertTriangle, CheckCircle2, XCircle, ShieldAlert } from "lucide-react"
import { downloadExcelWithAutoFit } from "../utils/excelUtils"
import { supabase } from "../utils/apiClient"
import type { AttendanceRecord, Operator } from "../types"

export type { AttendanceRecord }

interface StaffAttendancePageProps {
  currentOperator: Operator
  onLogAction?: (actionType: string, moduleName: string, details: string) => Promise<void>
}

const MAX_SHIFT_MINUTES = 12 * 60 // 12 hours maximum shift limit
const MAX_SHIFT_MS = MAX_SHIFT_MINUTES * 60 * 1000

export function StaffAttendancePage({ currentOperator, onLogAction }: StaffAttendancePageProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [dateFrame, setDateFrame] = useState<"all" | "today" | "week" | "month" | "custom">("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  // Validation / Fake Shift States
  const [validFilter, setValidFilter] = useState<"all" | "approved" | "suspicious" | "invalid">("all")
  const [recordToDelete, setRecordToDelete] = useState<AttendanceRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)

  const [invalidatedIds, setInvalidatedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("pinv_invalidated_attendance_ids")
      if (stored) return new Set(JSON.parse(stored))
    } catch (e) {}
    return new Set()
  })

  const saveInvalidatedIds = (newSet: Set<string>) => {
    setInvalidatedIds(newSet)
    try {
      localStorage.setItem("pinv_invalidated_attendance_ids", JSON.stringify(Array.from(newSet)))
      window.dispatchEvent(new Event("pinv_attendance_invalidated"))
    } catch (e) {}
  }

  useEffect(() => {
    const handleInvalidatedSync = () => {
      try {
        const stored = localStorage.getItem("pinv_invalidated_attendance_ids")
        if (stored) setInvalidatedIds(new Set(JSON.parse(stored)))
      } catch (e) {}
    }
    window.addEventListener("pinv_attendance_invalidated", handleInvalidatedSync)
    return () => window.removeEventListener("pinv_attendance_invalidated", handleInvalidatedSync)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  const loadAttendance = async () => {
    try {
      const [attRes, profRes] = await Promise.all([
        supabase.from("staff_attendance").select("*").order("id", { ascending: false }),
        supabase.from("operator_profiles").select("username, system_role, display_name")
      ])

      const profMap = new Map<string, { role: string; name: string }>()
      if (profRes.data) {
        profRes.data.forEach((p: any) => {
          if (p.username) {
            profMap.set(p.username.toLowerCase().trim(), {
              role: p.system_role || "staff",
              name: p.display_name || p.username
            })
          }
        })
      }

      if (attRes.data) {
        const nowMs = Date.now()

        // 1. Auto-close stale active shifts older than 12 hours in database
        const staleRecords = attRes.data.filter((d: any) => {
          if (d.time_out) return false
          const inT = new Date(d.time_in).getTime()
          return !isNaN(inT) && (nowMs - inT > MAX_SHIFT_MS)
        })

        if (staleRecords.length > 0) {
          for (const s of staleRecords) {
            const inT = new Date(s.time_in).getTime()
            const cappedOut = new Date(inT + MAX_SHIFT_MS).toISOString()
            s.time_out = cappedOut
            s.duration_minutes = MAX_SHIFT_MINUTES
            await supabase.from("staff_attendance").update({
              time_out: cappedOut,
              duration_minutes: MAX_SHIFT_MINUTES
            }).eq("id", s.id)
          }
        }

        // 2. Auto-repair legacy bloated records in database (> 12 hours duration)
        const bloatedRecords = attRes.data.filter((d: any) => d.duration_minutes && d.duration_minutes > MAX_SHIFT_MINUTES)
        if (bloatedRecords.length > 0) {
          for (const b of bloatedRecords) {
            const inT = new Date(b.time_in).getTime()
            if (!isNaN(inT)) {
              const cappedOut = new Date(inT + MAX_SHIFT_MS).toISOString()
              b.time_out = cappedOut
              b.duration_minutes = MAX_SHIFT_MINUTES
              await supabase.from("staff_attendance").update({
                time_out: cappedOut,
                duration_minutes: MAX_SHIFT_MINUTES
              }).eq("id", b.id)
            }
          }
        }

        const formatted: AttendanceRecord[] = attRes.data.map((d: any) => {
          const userKey = (d.username || "").toLowerCase().trim()
          const matched = profMap.get(userKey)
          const actualRole = matched?.role || d.system_role || (userKey.includes("superadmin") ? "superadmin" : "staff")
          const actualDisplayName = d.display_name || matched?.name || d.username || "Operator"
          const safeDuration = d.duration_minutes ? Math.min(d.duration_minutes, MAX_SHIFT_MINUTES) : undefined
          return {
            id: String(d.id),
            username: d.username || "",
            displayName: actualDisplayName,
            systemRole: actualRole,
            timeIn: d.time_in,
            timeOut: d.time_out || undefined,
            durationMinutes: safeDuration
          }
        })
        const sortedFormatted = formatted.sort((a, b) => {
          const aActive = !a.timeOut ? 1 : 0
          const bActive = !b.timeOut ? 1 : 0
          if (aActive !== bActive) return bActive - aActive
          const aTime = a.timeIn ? new Date(a.timeIn).getTime() : 0
          const bTime = b.timeIn ? new Date(b.timeIn).getTime() : 0
          return bTime - aTime
        })
        setRecords(sortedFormatted)
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

  const handleToggleValidation = async (record: AttendanceRecord) => {
    const isCurrentlyInvalid = invalidatedIds.has(record.id)
    const nextSet = new Set(invalidatedIds)
    if (isCurrentlyInvalid) {
      nextSet.delete(record.id)
      saveInvalidatedIds(nextSet)
      setNotification(`Restored shift #${record.id} for @${record.username} as Approved/Valid.`)
      if (onLogAction) {
        await onLogAction("VALIDATE_ATTENDANCE", "ATTENDANCE_PORTAL", `Admin marked attendance #${record.id} (@${record.username}) as Valid/Approved`)
      }
    } else {
      nextSet.add(record.id)
      saveInvalidatedIds(nextSet)
      setNotification(`Flagged shift #${record.id} for @${record.username} as Invalid/Fake.`)
      if (onLogAction) {
        await onLogAction("INVALIDATE_ATTENDANCE", "ATTENDANCE_PORTAL", `Admin flagged attendance #${record.id} (@${record.username}) as Fake/Invalid`)
      }
    }
    setTimeout(() => setNotification(null), 3500)
  }

  const handleConfirmDelete = async () => {
    if (!recordToDelete) return
    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from("staff_attendance")
        .delete()
        .eq("id", Number(recordToDelete.id))

      if (error) {
        alert(`Failed to delete record: ${error.message}`)
        return
      }

      if (invalidatedIds.has(recordToDelete.id)) {
        const nextSet = new Set(invalidatedIds)
        nextSet.delete(recordToDelete.id)
        saveInvalidatedIds(nextSet)
      }

      if (onLogAction) {
        await onLogAction(
          "DELETE_ATTENDANCE_RECORD",
          "ATTENDANCE_PORTAL",
          `Admin deleted attendance record #${recordToDelete.id} for @${recordToDelete.username} (${recordToDelete.displayName})`
        )
      }

      setNotification(`Successfully deleted attendance record #${recordToDelete.id} for @${recordToDelete.username}!`)
      setRecordToDelete(null)
      window.dispatchEvent(new Event("pinv_attendance_updated"))
      await loadAttendance()
    } catch (e) {
      console.error("Delete error:", e)
      alert("An unexpected error occurred while deleting the record.")
    } finally {
      setIsDeleting(false)
      setTimeout(() => setNotification(null), 3500)
    }
  }

  const countInvalid = records.filter(r => invalidatedIds.has(r.id)).length
  const countSuspicious = records.filter(r => !invalidatedIds.has(r.id) && r.durationMinutes !== undefined && r.durationMinutes < 5).length
  const countApproved = records.filter(r => !invalidatedIds.has(r.id) && (r.durationMinutes === undefined || r.durationMinutes >= 5)).length

  const filteredRecords = useMemo(() => {
    return records
      .filter(r => {
        // ALWAYS keep active working shifts visible regardless of date filter so they never get hidden
        const isActiveShift = !r.timeOut
        if (!isActiveShift && !checkDateFrame(r.timeIn)) return false

        const q = searchQuery.toLowerCase().trim()
        const matchSearch = !q ||
          r.username.toLowerCase().includes(q) ||
          r.displayName.toLowerCase().includes(q)

        const matchRole = roleFilter === "all" || (r.systemRole || "staff").toLowerCase() === roleFilter.toLowerCase()

        const isInv = invalidatedIds.has(r.id)
        const isSusp = !isInv && r.durationMinutes !== undefined && r.durationMinutes < 5

        let matchValid = true
        if (validFilter === "approved") matchValid = !isInv && !isSusp
        else if (validFilter === "suspicious") matchValid = isSusp
        else if (validFilter === "invalid") matchValid = isInv

        return matchSearch && matchRole && matchValid
      })
      .sort((a, b) => {
        // 1. Active Working Shift (Clocked In) ALWAYS strictly on top
        const aActive = !a.timeOut ? 1 : 0
        const bActive = !b.timeOut ? 1 : 0
        if (aActive !== bActive) return bActive - aActive

        // 2. Secondary sort: newest timeIn first
        const aTime = a.timeIn ? new Date(a.timeIn).getTime() : 0
        const bTime = b.timeIn ? new Date(b.timeIn).getTime() : 0
        return bTime - aTime
      })
  }, [records, dateFrame, startDate, endDate, searchQuery, roleFilter, validFilter, invalidatedIds])

  // Total shift duration calculation for searched staff/filter (excludes invalidated/fake records!)
  const totalShiftSummary = useMemo(() => {
    let totalMins = 0

    filteredRecords.forEach(r => {
      // Exclude voided / fake records from payroll / total hours!
      if (invalidatedIds.has(r.id)) return

      if (r.durationMinutes && r.durationMinutes > 0) {
        totalMins += Math.min(r.durationMinutes, MAX_SHIFT_MINUTES)
      } else if (!r.timeOut && r.timeIn) {
        const start = new Date(r.timeIn).getTime()
        const liveMins = Math.min(MAX_SHIFT_MINUTES, Math.max(1, Math.floor((currentTime - start) / (1000 * 60))))
        totalMins += liveMins
      }
    })

    const hours = Math.floor(totalMins / 60)
    const remMins = totalMins % 60
    const formattedStr = hours > 0 ? `${totalMins}m (${hours}h ${remMins}m)` : `${totalMins}m`

    return { totalMins, formattedStr, count: filteredRecords.length }
  }, [filteredRecords, currentTime, invalidatedIds])

  const handleExportExcel = () => {
    if (filteredRecords.length === 0) return
    const headers = [
      "Entry ID",
      "Operator Username",
      "Display Name",
      "System Role",
      "Time In",
      "Time Out",
      "Shift Duration (Minutes)",
      "Status",
      "Validation Status"
    ]
    const rows = filteredRecords.map(r => {
      const isInv = invalidatedIds.has(r.id)
      const isSusp = !isInv && r.durationMinutes !== undefined && r.durationMinutes < 5
      const valStatus = isInv ? "Voided / Fake" : (isSusp ? "Suspicious (<5m)" : "Approved / Valid")
      return [
        `#${r.id}`,
        r.username,
        r.displayName,
        r.systemRole || "staff",
        new Date(r.timeIn).toLocaleString(),
        r.timeOut ? new Date(r.timeOut).toLocaleString() : "Active Shift",
        isInv ? 0 : (r.durationMinutes || 0),
        r.timeOut ? "Completed" : "Active",
        valStatus
      ]
    })

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

      {/* Notification Banner */}
      {notification && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl font-bold flex items-center justify-between shadow-2xs animate-in fade-in duration-150">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            {notification}
          </span>
          <button 
            type="button"
            onClick={() => setNotification(null)} 
            className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200 font-bold px-2 py-0.5 rounded-lg"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs card-hover">
          <span className="text-gray-400 dark:text-slate-400 font-bold text-[10px] uppercase tracking-wider block">Total Recorded Shifts</span>
          <h3 className="text-gray-900 dark:text-white font-bold text-xl mt-1 font-mono">{records.length}</h3>
        </div>
        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs card-hover">
          <span className="text-gray-400 dark:text-slate-400 font-bold text-[10px] uppercase tracking-wider block">Currently Active Shifts</span>
          <h3 className="text-emerald-600 dark:text-emerald-400 font-bold text-xl mt-1 font-mono flex items-center gap-2">
            <span>{activeSessionsCount}</span>
            {activeSessionsCount > 0 && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>}
          </h3>
        </div>
        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs card-hover">
          <span className="text-gray-400 dark:text-slate-400 font-bold text-[10px] uppercase tracking-wider block">Suspicious Shifts (&lt;5m)</span>
          <h3 className="text-amber-600 dark:text-amber-400 font-bold text-xl mt-1 font-mono flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>{countSuspicious}</span>
          </h3>
        </div>
        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs card-hover">
          <span className="text-gray-400 dark:text-slate-400 font-bold text-[10px] uppercase tracking-wider block">Flagged Fake / Invalid</span>
          <h3 className="text-rose-600 dark:text-rose-400 font-bold text-xl mt-1 font-mono flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-rose-500" />
            <span>{countInvalid}</span>
          </h3>
        </div>
      </div>

      {/* Filter Header with Date Frame & Validation Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-4 space-y-3 shadow-xs">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 text-gray-400 dark:text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by staff username or display name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50/50 dark:bg-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
            />
            {searchQuery && (
              <button 
                type="button" 
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                title="Clear search"
              >
                <span className="text-xs font-bold">×</span>
              </button>
            )}
          </div>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl uppercase tracking-wider bg-white dark:bg-slate-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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

        {/* Verification Status Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t dark:border-slate-700">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
              <ShieldAlert className="w-3.5 h-3.5 text-indigo-500" />
              Verification:
            </span>
            <button
              type="button"
              onClick={() => setValidFilter("all")}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                validFilter === "all"
                  ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-2xs"
                  : "bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600"
              }`}
            >
              All Records ({records.length})
            </button>
            <button
              type="button"
              onClick={() => setValidFilter("approved")}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                validFilter === "approved"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
              }`}
            >
              ✅ Validated ({countApproved})
            </button>
            <button
              type="button"
              onClick={() => setValidFilter("suspicious")}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                validFilter === "suspicious"
                  ? "bg-amber-500 text-white shadow-2xs"
                  : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100"
              }`}
            >
              ⚠️ Suspicious &lt;5m ({countSuspicious})
            </button>
            <button
              type="button"
              onClick={() => setValidFilter("invalid")}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                validFilter === "invalid"
                  ? "bg-rose-600 text-white shadow-2xs"
                  : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
              }`}
            >
              🚫 Flagged Fake ({countInvalid})
            </button>
          </div>
        </div>
      </div>

      {/* Total Accumulated Time Summary Badge */}
      {filteredRecords.length > 0 && (
        <div className="p-3.5 bg-blue-50/80 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 font-mono text-xs text-blue-900 dark:text-blue-200 shadow-2xs">
          <span className="flex items-center gap-2 font-bold">
            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              {searchQuery.trim()
                ? `Approved Working Shift Time for "${searchQuery.trim()}":`
                : "Total Approved Shift Duration (Filtered Records):"}
            </span>
            {countInvalid > 0 && (
              <span className="text-[10px] font-sans text-gray-500 dark:text-slate-400 font-normal">
                (Excludes {countInvalid} voided/fake records)
              </span>
            )}
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
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 dark:text-slate-500 font-medium">
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

                  const isInv = invalidatedIds.has(r.id)
                  const isSusp = !isInv && r.durationMinutes !== undefined && r.durationMinutes < 5
                  const isActive = !r.timeOut

                  const liveMins = isActive && r.timeIn
                    ? Math.max(1, Math.floor((currentTime - new Date(r.timeIn).getTime()) / (1000 * 60)))
                    : null
                  const liveDurationStr = liveMins !== null
                    ? `${Math.floor(liveMins / 60)}h ${liveMins % 60}m (Live)`
                    : durationStr

                  return (
                    <tr 
                      key={r.id} 
                      className={`transition-colors ${
                        isInv
                          ? "bg-rose-50/30 dark:bg-rose-950/20 hover:bg-rose-50/50 dark:hover:bg-rose-950/30 opacity-75"
                          : isActive 
                            ? "bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-50/90 dark:hover:bg-emerald-950/50 border-l-4 border-l-emerald-500 font-medium" 
                            : isSusp
                              ? "bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50/60 dark:hover:bg-amber-950/30 border-l-4 border-l-amber-500"
                              : "hover:bg-gray-50/60 dark:hover:bg-slate-700/60"
                      }`}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold ${isInv ? "line-through text-gray-400 dark:text-slate-500" : "text-gray-900 dark:text-white"}`}>
                            {r.displayName}
                          </span>
                          {isActive && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-slate-400">@{r.username}</span>
                      </td>
                      <td className="p-4">
                        {String(r.systemRole || "").toLowerCase() === "superadmin" ? (
                          <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-mono text-[10px] font-extrabold uppercase tracking-wide border border-purple-200 dark:border-purple-800 shadow-2xs">
                            SUPERADMIN
                          </span>
                        ) : String(r.systemRole || "").toLowerCase() === "admin" ? (
                          <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-mono text-[10px] font-extrabold uppercase tracking-wide border border-blue-200 dark:border-blue-800 shadow-2xs">
                            ADMIN
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200 font-mono text-[10px] font-bold uppercase tracking-wide border border-slate-200 dark:border-slate-600">
                            STAFF
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-gray-700 dark:text-slate-200 font-medium whitespace-nowrap">{inStr}</td>
                      <td className="p-4 text-gray-700 dark:text-slate-200 font-medium whitespace-nowrap">
                        {outStr ? (
                          <span>{outStr}</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Active Working Shift
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-mono font-bold">
                        {isInv ? (
                          <span className="text-rose-500 line-through text-[11px] font-normal">
                            {durationStr} (Voided)
                          </span>
                        ) : isActive ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                            {liveDurationStr}
                          </span>
                        ) : (
                          <span className={isSusp ? "text-amber-600 dark:text-amber-400" : "text-blue-700 dark:text-blue-400"}>
                            {durationStr}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        {isInv ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 inline-flex items-center gap-1 border border-rose-300 dark:border-rose-800">
                            <XCircle className="w-3 h-3" />
                            Invalid / Fake
                          </span>
                        ) : isActive ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 inline-flex items-center gap-1 border border-amber-300/80 dark:border-amber-700 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            Clocked In
                          </span>
                        ) : isSusp ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 inline-flex items-center gap-1 border border-amber-300 dark:border-amber-700">
                            <AlertTriangle className="w-3 h-3" />
                            Suspicious (&lt;5m)
                          </span>
                        ) : r.durationMinutes !== undefined && r.durationMinutes >= 720 ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 inline-flex items-center gap-1">
                            ⏱️ 12h Capped
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1 border border-emerald-300/80 dark:border-emerald-700">
                            <CheckCircle2 className="w-3 h-3" />
                            Completed
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Toggle Validation Button */}
                          <button
                            type="button"
                            onClick={() => handleToggleValidation(r)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${
                              isInv
                                ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                                : "bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
                            }`}
                            title={isInv ? "Restore shift as Valid/Approved" : "Mark shift as Fake / Invalid (Exclude from payroll)"}
                          >
                            {isInv ? <CheckCircle2 className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                            {isInv ? "Re-Approve" : "Flag Fake"}
                          </button>

                          {/* Delete Attendance Record Button */}
                          <button
                            type="button"
                            onClick={() => setRecordToDelete(r)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                            title="Permanently delete this fake or erroneous record from database"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {recordToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/80 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Delete Attendance Record</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">Permanent Database Deletion</p>
              </div>
            </div>

            <div className="p-3.5 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Staff Member:</span>
                <span className="font-bold text-gray-800 dark:text-white">{recordToDelete.displayName} (@{recordToDelete.username})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Role:</span>
                <span className="font-mono font-bold uppercase text-purple-600">{recordToDelete.systemRole}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Time In:</span>
                <span className="font-mono text-gray-700 dark:text-slate-300">{new Date(recordToDelete.timeIn).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Time Out:</span>
                <span className="font-mono text-gray-700 dark:text-slate-300">
                  {recordToDelete.timeOut ? new Date(recordToDelete.timeOut).toLocaleString() : "Active Shift"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Duration:</span>
                <span className="font-mono font-bold text-blue-600">
                  {recordToDelete.durationMinutes !== undefined ? `${Math.floor(recordToDelete.durationMinutes / 60)}h ${recordToDelete.durationMinutes % 60}m` : "-"}
                </span>
              </div>
            </div>

            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
              ⚠️ Are you sure you want to delete this fake or erroneous record? This action will permanently remove it from the Supabase database.
            </p>

            <div className="flex justify-end items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
