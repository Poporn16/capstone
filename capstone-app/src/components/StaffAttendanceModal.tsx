import { useState, useEffect } from "react"
import { Clock, LogIn, LogOut, X, CheckCircle2, UserCheck, Calendar } from "lucide-react"

export interface AttendanceRecord {
  id: string
  username: string
  displayName: string
  systemRole: string
  timeIn: string
  timeOut?: string
  durationMinutes?: number
}

interface StaffAttendanceModalProps {
  currentOperator: { username: string; displayName: string; systemRole: string }
  onClose: () => void
  onLogAction?: (actionType: string, moduleTarget: string, details: string) => Promise<void>
}

export function StaffAttendanceModal({ currentOperator, onClose, onLogAction }: StaffAttendanceModalProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [activeSession, setActiveSession] = useState<AttendanceRecord | null>(null)
  const [notification, setNotification] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem("pinv_staff_attendance")
      if (stored) {
        const parsed: AttendanceRecord[] = JSON.parse(stored)
        setRecords(parsed)
        // Find current user's active session without timeOut
        const currentActive = parsed.find(
          r => r.username.toLowerCase() === currentOperator.username.toLowerCase() && !r.timeOut
        )
        setActiveSession(currentActive || null)
      }
    } catch (e) {
      console.error("Failed to load attendance records", e)
    }
  }, [currentOperator.username])

  const saveRecords = (newRecords: AttendanceRecord[]) => {
    setRecords(newRecords)
    try {
      localStorage.setItem("pinv_staff_attendance", JSON.stringify(newRecords))
    } catch (e) {}
  }

  const handleTimeIn = async () => {
    const nowIso = new Date().toISOString()
    const newRecord: AttendanceRecord = {
      id: Date.now().toString(),
      username: currentOperator.username,
      displayName: currentOperator.displayName,
      systemRole: currentOperator.systemRole,
      timeIn: nowIso
    }

    const updated = [newRecord, ...records]
    saveRecords(updated)
    setActiveSession(newRecord)

    const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setNotification(`Successfully Timed In at ${formattedTime}!`)

    if (onLogAction) {
      await onLogAction(
        "STAFF_TIME_IN",
        "ATTENDANCE_STATION",
        `Staff @${currentOperator.username} (${currentOperator.displayName}) recorded TIME IN at ${formattedTime}`
      ).catch(() => {})
    }

    setTimeout(() => setNotification(null), 3000)
  }

  const handleTimeOut = async () => {
    if (!activeSession) return

    const timeOutIso = new Date().toISOString()
    const inTime = new Date(activeSession.timeIn).getTime()
    const outTime = new Date(timeOutIso).getTime()
    const durationMinutes = Math.max(1, Math.round((outTime - inTime) / (1000 * 60)))

    const updated = records.map(r => {
      if (r.id === activeSession.id) {
        return {
          ...r,
          timeOut: timeOutIso,
          durationMinutes
        }
      }
      return r
    })

    saveRecords(updated)
    setActiveSession(null)

    const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const hours = Math.floor(durationMinutes / 60)
    const mins = durationMinutes % 60
    const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`

    setNotification(`Successfully Timed Out at ${formattedTime}! Shift duration: ${durationStr}`)

    if (onLogAction) {
      await onLogAction(
        "STAFF_TIME_OUT",
        "ATTENDANCE_STATION",
        `Staff @${currentOperator.username} (${currentOperator.displayName}) recorded TIME OUT at ${formattedTime} (Shift: ${durationStr})`
      ).catch(() => {})
    }

    setTimeout(() => setNotification(null), 3000)
  }

  const userRecords = records.filter(
    r => r.username.toLowerCase() === currentOperator.username.toLowerCase()
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-700 space-y-5 relative animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Staff Attendance Terminal</h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">Time In & Time Out shift recorder</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Operator Card */}
        <div className="bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-xs uppercase">
              {currentOperator.displayName.substring(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-gray-900 dark:text-white">{currentOperator.displayName}</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-bold">
                  {currentOperator.systemRole}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">@{currentOperator.username}</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold uppercase text-gray-400 block">Current Status</span>
            {activeSession ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                TIMED IN
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                TIMED OUT
              </span>
            )}
          </div>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{notification}</span>
          </div>
        )}

        {/* Time In / Time Out Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            disabled={!!activeSession}
            onClick={handleTimeIn}
            className={`py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 shadow-xs transition-all ${
              activeSession
                ? "bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed border border-gray-200 dark:border-slate-600"
                : "bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98] shadow-emerald-600/20"
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Time In</span>
          </button>

          <button
            type="button"
            disabled={!activeSession}
            onClick={handleTimeOut}
            className={`py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 shadow-xs transition-all ${
              !activeSession
                ? "bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed border border-gray-200 dark:border-slate-600"
                : "bg-rose-600 hover:bg-rose-700 text-white active:scale-[0.98] shadow-rose-600/20"
            }`}
          >
            <LogOut className="w-4 h-4" />
            <span>Time Out</span>
          </button>
        </div>

        {/* User's Recent Attendance Records */}
        <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-700">
          <h3 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            Recent Attendance History
          </h3>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {userRecords.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-slate-500 italic text-center py-4">No attendance records found yet.</p>
            ) : (
              userRecords.slice(0, 10).map((r) => {
                const inDate = new Date(r.timeIn)
                const inStr = inDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + inDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                const outStr = r.timeOut 
                  ? new Date(r.timeOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "Active Shift"

                const durationDisplay = r.durationMinutes
                  ? `${Math.floor(r.durationMinutes / 60)}h ${r.durationMinutes % 60}m`
                  : null

                return (
                  <div key={r.id} className="p-2.5 bg-gray-50 dark:bg-slate-900 border dark:border-slate-700/80 rounded-xl flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 dark:text-white">{inStr}</span>
                        <span className="text-gray-400">→</span>
                        <span className={`font-semibold ${r.timeOut ? "text-gray-700 dark:text-slate-300" : "text-emerald-600 font-bold animate-pulse"}`}>
                          {outStr}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-slate-500">
                        Recorded for @{r.username}
                      </p>
                    </div>
                    {durationDisplay && (
                      <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-mono text-[10px] font-bold">
                        {durationDisplay}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-gray-100 dark:border-slate-700 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-xl text-xs font-bold transition-colors"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  )
}
