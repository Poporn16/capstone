import { useState, useEffect, useRef } from "react"
import { Clock, LogIn, LogOut, X, CheckCircle2, Calendar, Camera, Upload, Eye, Image as ImageIcon, AlertCircle } from "lucide-react"
import { supabase } from "../utils/apiClient"
import type { AttendanceRecord, Operator } from "../types"

export type { AttendanceRecord }

interface StaffAttendanceModalProps {
  currentOperator: Operator
  onClose: () => void
  onLogAction?: (actionType: string, moduleTarget: string, details: string) => Promise<void>
}

export function StaffAttendanceModal({ currentOperator, onClose, onLogAction }: StaffAttendanceModalProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [activeSession, setActiveSession] = useState<AttendanceRecord | null>(null)
  const [notification, setNotification] = useState<string | null>(null)

  // Photo verification states for Time In
  const [timeInPhoto, setTimeInPhoto] = useState<string | null>(null)
  const [viewPhotoModal, setViewPhotoModal] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Ensure it is strictly a picture, NOT a video
    if (!file.type.startsWith("image/") || file.type.startsWith("video/")) {
      alert("Only picture files are allowed (not videos). Please select a valid photo.")
      if (e.target) e.target.value = ""
      return
    }

    // Limit to 5MB
    const MAX_SIZE = 5 * 1024 * 1024 // 5MB
    if (file.size > MAX_SIZE) {
      alert(`The selected picture exceeds the 5MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB). Please choose a photo under 5MB.`)
      if (e.target) e.target.value = ""
      return
    }

    // Read raw picture directly as base64 Data URL (no imageUtil, no canvas downsampling)
    const reader = new FileReader()
    reader.onerror = () => {
      alert("Failed to read image file.")
    }
    reader.onload = () => {
      const rawDataUrl = reader.result as string
      setTimeInPhoto(rawDataUrl)
    }
    reader.readAsDataURL(file)

    if (e.target) e.target.value = ""
  }

  const fetchAttendanceFromDb = async () => {
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

      let localPhotoMap: Record<string, string> = {}
      try {
        localPhotoMap = JSON.parse(localStorage.getItem("pinv_attendance_photo_map") || "{}")
      } catch (e) {}

      if (attRes.data) {
        const MAX_SHIFT_MINUTES = 12 * 60
        const MAX_SHIFT_MS = MAX_SHIFT_MINUTES * 60 * 1000
        const nowMs = Date.now()

        // Auto-close stale active shifts older than 12 hours in database and invalidate them
        const staleRecords = attRes.data.filter((d: any) => {
          if (d.time_out) return false
          const inT = new Date(d.time_in).getTime()
          return !isNaN(inT) && (nowMs - inT > MAX_SHIFT_MS)
        })

        if (staleRecords.length > 0) {
          const storedInv = localStorage.getItem("pinv_invalidated_attendance_ids")
          const nextInv = new Set<string>(storedInv ? JSON.parse(storedInv) : [])
          for (const s of staleRecords) {
            const inT = new Date(s.time_in).getTime()
            const cappedOut = new Date(inT + MAX_SHIFT_MS).toISOString()
            s.time_out = cappedOut
            s.duration_minutes = MAX_SHIFT_MINUTES
            await supabase.from("staff_attendance").update({
              time_out: cappedOut,
              duration_minutes: MAX_SHIFT_MINUTES
            }).eq("id", s.id)
            nextInv.add(String(s.id))
          }
          localStorage.setItem("pinv_invalidated_attendance_ids", JSON.stringify(Array.from(nextInv)))
          window.dispatchEvent(new Event("pinv_attendance_invalidated"))
        }

        // Auto-cleanup any duplicate active shifts in database if they exist
        const activeByUsers = new Map<string, any[]>()
        attRes.data.forEach((d: any) => {
          if (!d.time_out && d.username) {
            const key = d.username.toLowerCase().trim()
            if (!activeByUsers.has(key)) activeByUsers.set(key, [])
            activeByUsers.get(key)!.push(d)
          }
        })

        const duplicateIdsToDelete: number[] = []
        activeByUsers.forEach(list => {
          if (list.length > 1) {
            // Keep the latest one (highest ID), mark the rest for deletion
            list.sort((a, b) => Number(b.id) - Number(a.id))
            list.slice(1).forEach(item => duplicateIdsToDelete.push(Number(item.id)))
          }
        })

        if (duplicateIdsToDelete.length > 0) {
          await supabase.from("staff_attendance").delete().in("id", duplicateIdsToDelete)
        }

        const validData = attRes.data.filter((d: any) => !duplicateIdsToDelete.includes(Number(d.id)))

        const formatted: AttendanceRecord[] = validData.map((d: any) => {
          const userKey = (d.username || "").toLowerCase().trim()
          const matched = profMap.get(userKey)
          const actualRole = matched?.role || d.system_role || (userKey.includes("superadmin") ? "superadmin" : "staff")
          const actualDisplayName = d.display_name || matched?.name || d.username || "Operator"
          const safeDuration = d.duration_minutes ? Math.min(d.duration_minutes, MAX_SHIFT_MINUTES) : undefined
          const resolvedPhoto = d.time_in_photo || d.timeInPhoto || localPhotoMap[String(d.id)] || localPhotoMap[`${userKey}_${d.time_in}`] || undefined

          return {
            id: String(d.id),
            username: d.username || "",
            displayName: actualDisplayName,
            systemRole: actualRole,
            timeIn: d.time_in,
            timeOut: d.time_out || undefined,
            durationMinutes: safeDuration,
            timeInPhoto: resolvedPhoto
          }
        })
        const sorted = formatted.sort((a, b) => {
          const aActive = !a.timeOut ? 1 : 0
          const bActive = !b.timeOut ? 1 : 0
          if (aActive !== bActive) return bActive - aActive
          const aTime = a.timeIn ? new Date(a.timeIn).getTime() : 0
          const bTime = b.timeIn ? new Date(b.timeIn).getTime() : 0
          return bTime - aTime
        })
        setRecords(sorted)
        const currentActive = sorted.find(
          r => r.username.toLowerCase() === currentOperator.username.toLowerCase() && !r.timeOut
        )
        setActiveSession(currentActive || null)
      }
    } catch (e) {
      console.error("Failed to load attendance records", e)
    }
  }

  useEffect(() => {
    fetchAttendanceFromDb()
    window.addEventListener("pinv_attendance_updated", fetchAttendanceFromDb)
    const channel = supabase
      .channel("attendance-modal-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_attendance" }, fetchAttendanceFromDb)
      .subscribe()

    return () => {
      window.removeEventListener("pinv_attendance_updated", fetchAttendanceFromDb)
      supabase.removeChannel(channel)
    }
  }, [currentOperator.username])

  const handleTimeIn = async () => {
    if (activeSession) return
    if (!timeInPhoto) {
      alert("Verification photo is strictly required to Time In. Please take a selfie or upload a photo.")
      return
    }

    const nowIso = new Date().toISOString()
    const payload: any = {
      username: currentOperator.username,
      display_name: currentOperator.displayName,
      system_role: currentOperator.systemRole,
      time_in: nowIso,
      time_in_photo: timeInPhoto
    }

    let { data: inserted, error } = await supabase
      .from("staff_attendance")
      .insert([payload])
      .select("id")
      .single()

    if (error) {
      console.warn("Time in DB error (fallback without column):", error.message)
      delete payload.time_in_photo
      const retryResult = await supabase
        .from("staff_attendance")
        .insert([payload])
        .select("id")
        .single()
      inserted = retryResult.data
    }

    try {
      const photoMap = JSON.parse(localStorage.getItem("pinv_attendance_photo_map") || "{}")
      if (inserted?.id) {
        photoMap[String(inserted.id)] = timeInPhoto
      }
      const userKey = currentOperator.username.toLowerCase().trim()
      photoMap[`${userKey}_${nowIso}`] = timeInPhoto
      localStorage.setItem("pinv_attendance_photo_map", JSON.stringify(photoMap))
    } catch (e) {}

    setTimeInPhoto(null)
    stopCamera()
    await fetchAttendanceFromDb()
    window.dispatchEvent(new Event("pinv_attendance_updated"))

    const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setNotification(`Successfully Timed In with Photo Verification at ${formattedTime}!`)

    if (onLogAction) {
      try {
        await onLogAction(
          "STAFF_TIME_IN",
          "ATTENDANCE_STATION",
          `Staff @${currentOperator.username} (${currentOperator.displayName}) recorded TIME IN with photo verification at ${formattedTime}`
        )
      } catch (e) {}
    }

    setTimeout(() => setNotification(null), 3500)
  }

  const handleTimeOut = async () => {
    if (!activeSession) return

    const MAX_SHIFT_MINUTES = 12 * 60
    const MAX_SHIFT_MS = MAX_SHIFT_MINUTES * 60 * 1000

    const nowMs = Date.now()
    const inTime = new Date(activeSession.timeIn).getTime()
    const isStale = !isNaN(inTime) && (nowMs - inTime > MAX_SHIFT_MS)
    const outTimeMs = isStale ? inTime + MAX_SHIFT_MS : nowMs
    const timeOutIso = new Date(outTimeMs).toISOString()
    const durationMinutes = isStale
      ? MAX_SHIFT_MINUTES
      : Math.max(1, Math.round((nowMs - inTime) / (1000 * 60)))

    const numId = Number(activeSession.id)
    if (!isNaN(numId)) {
      await supabase.from("staff_attendance").update({
        time_out: timeOutIso,
        duration_minutes: durationMinutes
      }).eq("id", numId)
    }

    await fetchAttendanceFromDb()
    window.dispatchEvent(new Event("pinv_attendance_updated"))

    const formattedTime = new Date(outTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const hours = Math.floor(durationMinutes / 60)
    const mins = durationMinutes % 60
    const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`

    setNotification(`Successfully Timed Out at ${formattedTime}! Shift duration: ${durationStr}`)

    if (onLogAction) {
      try {
        await onLogAction(
          "STAFF_TIME_OUT",
          "ATTENDANCE_STATION",
          `Staff @${currentOperator.username} (${currentOperator.displayName}) recorded TIME OUT at ${formattedTime} (Shift: ${durationStr})`
        )
      } catch (e) {}
    }

    setTimeout(() => setNotification(null), 3000)
  }

  const userRecords = records
    .filter(r => r.username.toLowerCase() === currentOperator.username.toLowerCase())
    .sort((a, b) => {
      const aActive = !a.timeOut ? 1 : 0
      const bActive = !b.timeOut ? 1 : 0
      if (aActive !== bActive) return bActive - aActive
      const aTime = a.timeIn ? new Date(a.timeIn).getTime() : 0
      const bTime = b.timeIn ? new Date(b.timeIn).getTime() : 0
      return bTime - aTime
    })

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
            {activeSession?.timeInPhoto ? (
              <img
                src={activeSession.timeInPhoto}
                alt="Active Shift Photo"
                onClick={() => setViewPhotoModal(activeSession.timeInPhoto || null)}
                className="w-10 h-10 rounded-full object-cover border-2 border-emerald-500 shadow-xs cursor-pointer hover:opacity-90"
                title="Click to view full time-in verification photo"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-xs uppercase">
                {currentOperator.displayName.substring(0, 2)}
              </div>
            )}
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

        {/* Photo Verification Required Card */}
        {!activeSession && (
          <div className="p-3 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Required: Capture Selfie Photo <span className="text-red-500">*</span>
              </span>
              <span className="text-[9px] text-amber-700 dark:text-amber-400 font-bold">Required to Time In</span>
            </div>

            <input
              type="file"
              ref={cameraInputRef}
              onChange={handlePhotoSelect}
              accept="image/*"
              capture="user"
              className="hidden"
            />
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoSelect}
              accept="image/*"
              className="hidden"
            />

            {timeInPhoto ? (
              <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-emerald-300 dark:border-emerald-700 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={timeInPhoto}
                    alt="Selfie"
                    onClick={() => setViewPhotoModal(timeInPhoto)}
                    className="w-12 h-12 rounded-xl object-cover border-2 border-emerald-500 shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                    title="Click to view full photo"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-200 block truncate flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline" />
                      Selfie Photo Verified
                    </span>
                    <button
                      type="button"
                      onClick={() => setViewPhotoModal(timeInPhoto)}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                    >
                      Click to preview photo
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-bold cursor-pointer"
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeInPhoto(null)}
                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 cursor-pointer"
                    title="Remove"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="py-2.5 px-3 bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <Camera className="w-4 h-4 text-amber-600" />
                  Take Selfie Photo
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2.5 px-3 bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <Upload className="w-4 h-4 text-amber-600" />
                  Upload Photo
                </button>
              </div>
            )}
          </div>
        )}

        {/* Time In / Time Out Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            disabled={!!activeSession || !timeInPhoto}
            onClick={handleTimeIn}
            className={`py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 shadow-xs transition-all ${
              activeSession || !timeInPhoto
                ? "bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed border border-gray-200 dark:border-slate-600"
                : "bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98] shadow-emerald-600/20 cursor-pointer"
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
                : "bg-rose-600 hover:bg-rose-700 text-white active:scale-[0.98] shadow-rose-600/20 cursor-pointer"
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
                    <div className="flex items-center gap-2.5">
                      {r.timeInPhoto ? (
                        <img
                          src={r.timeInPhoto}
                          alt="Photo"
                          onClick={() => setViewPhotoModal(r.timeInPhoto || null)}
                          className="w-8 h-8 rounded-lg object-cover border border-slate-300 dark:border-slate-600 shrink-0 cursor-pointer hover:opacity-90"
                          title="Click to view time-in photo"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-slate-700 text-gray-400 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                      )}
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
            className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Close Window
          </button>
        </div>
      </div>

      {/* Time In Photo Lightbox Modal */}
      {viewPhotoModal && (
        <div 
          onClick={() => setViewPhotoModal(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 font-sans"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-4 space-y-3 border border-slate-200 dark:border-slate-700 shadow-2xl"
          >
            <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 uppercase tracking-wide">
                <Camera className="w-4 h-4 text-emerald-500" />
                Staff Time-In Verification Photo
              </h4>
              <button
                type="button"
                onClick={() => setViewPhotoModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto flex items-center justify-center bg-slate-950/20 rounded-xl p-1">
              <img src={viewPhotoModal} alt="Time In Full" className="max-h-[55vh] object-contain rounded-lg shadow-md" />
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setViewPhotoModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
