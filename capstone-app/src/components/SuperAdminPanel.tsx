import { useState, useEffect, useRef } from "react"
import { supabase, triggerForceLogout, triggerForceLogoutBelowSuperAdmin } from "../utils/apiClient"
import { hashPassword } from "../utils/passwordUtils"
import { ShieldAlert, UserPlus, Trash2, History, RefreshCw, Eye, X, Flame, Database, AlertOctagon, RotateCcw, LogOut, Download, Edit, Plus, Calendar, HardDrive } from "lucide-react"

interface SuperAdminPanelProps {
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

interface AccountProfile {
  id: number
  username: string
  password_hash: string
  display_name: string
  system_role: string
}

interface MonthlyBackupRecord {
  id?: number
  monthTag: string
  dateLabel: string
  exportedAt: string
}

export function SuperAdminPanel({ currentOperator, onLogAction, refreshAllData }: SuperAdminPanelProps) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [profiles, setProfiles] = useState<AccountProfile[]>([])
  const [activeUsernames, setActiveUsernames] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const isOperationRunning = useRef(false)
  const [resetProgress, setResetProgress] = useState<{
    active: boolean
    step: string
    stepIndex: number
    totalSteps: number
  }>({ active: false, step: "", stepIndex: 0, totalSteps: 0 })
  const [openActionProfileId, setOpenActionProfileId] = useState<number | null>(null)
  const [selectedLogSummary, setSelectedLogSummary] = useState<AuditLog | null>(null)

  const [regUsername, setRegUsername] = useState("")
  const [regPin, setRegPin] = useState("")
  const [regDisplayName, setRegDisplayName] = useState("")
  const [regRole, setRegRole] = useState("staff")

  const [editingProfile, setEditingProfile] = useState<AccountProfile | null>(null)
  const [editDisplayName, setEditDisplayName] = useState("")
  const [editPin, setEditPin] = useState("")
  const [editRole, setEditRole] = useState("staff")

  const [monthlyBackups, setMonthlyBackups] = useState<MonthlyBackupRecord[]>([])
  const [manualBackups, setManualBackups] = useState<MonthlyBackupRecord[]>([])

  const [auditModuleFilter, setAuditModuleFilter] = useState("ALL")
  const [auditSearchQuery, setAuditSearchQuery] = useState("")

  const [resetConfirmInput, setResetConfirmInput] = useState("")
  const [showResetModal, setShowResetModal] = useState<"inventory" | "sales" | "audit" | "all" | null>(null)
  
  const restoreFileInputRef = useRef<HTMLInputElement>(null)
  const [isRestoring, setIsRestoring] = useState(false)

  // AES-GCM 256-bit Encryption Helpers
  const SYSTEM_BACKUP_SECRET = import.meta.env.VITE_SYSTEM_BACKUP_SECRET || "MALABON_PHARMACY_CLINIC_SECURE_BACKUP_KEY_2026_V1"

  const getBackupCryptoKey = async (): Promise<CryptoKey> => {
    const enc = new TextEncoder()
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(SYSTEM_BACKUP_SECRET),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    )
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode("MALABON_PHARMACY_SALT_2026"),
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    )
  }

  const encryptBackupPayload = async (dataObj: any): Promise<string> => {
    const key = await getBackupCryptoKey()
    const iv = window.crypto.getRandomValues(new Uint8Array(12))
    const enc = new TextEncoder()
    const encodedData = enc.encode(JSON.stringify(dataObj))

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encodedData
    )

    const container = {
      signature: "MALABON_PHARMACY_ENCRYPTED_BACKUP_V1",
      timestamp: new Date().toISOString(),
      iv: btoa(String.fromCharCode(...iv)),
      data: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
    }

    return JSON.stringify(container, null, 2)
  }

  const decryptBackupPayload = async (encryptedJsonStr: string): Promise<any> => {
    let container: any
    try {
      container = JSON.parse(encryptedJsonStr)
    } catch (e) {
      throw new Error("Invalid file format: File is not valid JSON ciphertext.")
    }

    if (container.signature !== "MALABON_PHARMACY_ENCRYPTED_BACKUP_V1" || !container.iv || !container.data) {
      if (container.metadata && container.inventory) {
        return container
      }
      throw new Error("Invalid or corrupted encrypted backup file structure.")
    }

    const key = await getBackupCryptoKey()
    const iv = Uint8Array.from(atob(container.iv), c => c.charCodeAt(0))
    const ciphertext = Uint8Array.from(atob(container.data), c => c.charCodeAt(0))

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    )

    const dec = new TextDecoder()
    return JSON.parse(dec.decode(decrypted))
  }

  const handleDownloadDatabaseBackup = async (tag: string = "manual") => {
    try {
      const [
        { data: profilesData },
        { data: categoriesData },
        { data: inventoryData },
        { data: batchesData },
        { data: salesData },
        { data: saleItemsData },
        { data: saleItemBatchesData },
        { data: auditLogsData }
      ] = await Promise.all([
        supabase.from("operator_profiles").select("*").range(0, 99999),
        supabase.from("product_categories").select("*").range(0, 99999),
        supabase.from("inventory").select("*").range(0, 99999),
        supabase.from("inventory_batches").select("*").range(0, 99999),
        supabase.from("sales").select("*").range(0, 99999),
        supabase.from("sale_items").select("*").range(0, 99999),
        supabase.from("sale_item_batches").select("*").range(0, 99999),
        supabase.from("system_audit_logs").select("*").range(0, 99999)
      ])

      const backupData = {
        metadata: {
          system: "Malabon Pharmacy & Clinic POS & Inventory System",
          backupType: tag,
          exportedAt: new Date().toISOString(),
          operator: currentOperator.username,
          version: "1.0.0"
        },
        operator_profiles: profilesData || [],
        product_categories: categoriesData || [],
        inventory: inventoryData || [],
        inventory_batches: batchesData || [],
        sales: salesData || [],
        sale_items: saleItemsData || [],
        sale_item_batches: saleItemBatchesData || [],
        system_audit_logs: auditLogsData || []
      }

      const encryptedContent = await encryptBackupPayload(backupData)
      const blob = new Blob([encryptedContent], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      const dateTag = new Date().toISOString().split("T")[0]
      link.download = `pharmacy_backup_${tag}_${dateTag}_${Date.now()}.bak`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      await onLogAction(
        "DATABASE_BACKUP",
        "SUPER_ADMIN",
        `Downloaded AES-256 encrypted database backup archive [Tag: ${tag.toUpperCase()}]`
      )
    } catch (err: any) {
      console.error("Backup generation error:", err)
      alert(`Error generating backup file: ${err.message}`)
    }
  }

  const handleCreateMonthlySnapshot = async () => {
    try {
      const d = new Date()
      const monthTag = d.toISOString().slice(0, 7)
      const dateLabel = d.toLocaleString("en-US", { month: "long", year: "numeric" })
      removeBackupTombstone([monthTag, dateLabel])

      // 1. Insert/upsert into dedicated monthly_backup_archives table (rolling monthly archives: July, August, September...)
      try {
        await supabase.from("monthly_backup_archives").upsert({
          month_tag: monthTag,
          date_label: dateLabel,
          created_by: currentOperator.username || "super admin"
        }, { onConflict: "month_tag" })

        const { data: archives } = await supabase
          .from("monthly_backup_archives")
          .select("*")
          .order("id", { ascending: false })

        if (archives) {
          // Keep up to 3 monthly archives (delete older ones beyond index 3)
          const monthlyArchives = archives.filter(a => 
            !String(a.month_tag || "").toUpperCase().startsWith("MANUAL") && 
            !String(a.date_label || "").toLowerCase().includes("manual")
          )
          if (monthlyArchives.length > 3) {
            const overflow = monthlyArchives.slice(3)
            for (const item of overflow) {
              await supabase.from("monthly_backup_archives").delete().eq("id", item.id)
            }
          }
        }
      } catch (e) {}

      // 2. Query and remove any existing MONTHLY_SNAPSHOT audit logs for this month directly from Supabase DB
      const { data: dbLogs } = await supabase
        .from("system_audit_logs")
        .select("id, details_summary")
        .eq("action_type", "MONTHLY_SNAPSHOT")

      if (dbLogs && dbLogs.length > 0) {
        const matchingMonthLogs = dbLogs.filter(l => {
          const summary = String(l.details_summary || "")
          return summary.includes(monthTag) || summary.includes(dateLabel)
        })
        for (const oldLog of matchingMonthLogs) {
          await supabase.from("system_audit_logs").delete().eq("id", oldLog.id)
        }
      }

      // Record clean updated monthly snapshot in database audit logs
      await onLogAction(
        "MONTHLY_SNAPSHOT",
        "SUPER_ADMIN",
        `Created monthly snapshot archive for ${dateLabel} (${monthTag}).`
      )

      alert(`✅ Monthly snapshot archive for "${dateLabel}" created/updated in database!`)
      await fetchAllSuperAdminData()
    } catch (err: any) {
      console.error("Monthly snapshot error:", err)
      alert(`Error creating monthly snapshot: ${err.message}`)
    }
  }

  const handleCreateManualSnapshot = async () => {
    try {
      const d = new Date()
      const timeTag = d.toISOString().replace(/[:.]/g, "-").slice(0, 19)
      const monthTag = `MANUAL_${timeTag}_${Date.now()}`
      const dateLabel = `Manual Backup - ${d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
      removeBackupTombstone([monthTag])

      // 1. Insert into dedicated monthly_backup_archives table (max 2 manual archives)
      try {
        await supabase.from("monthly_backup_archives").insert({
          month_tag: monthTag,
          date_label: dateLabel,
          created_by: currentOperator.username || "super admin"
        })

        const { data: archives } = await supabase
          .from("monthly_backup_archives")
          .select("*")
          .order("id", { ascending: false })

        if (archives) {
          const manualArchives = archives.filter(a => String(a.month_tag || "").startsWith("MANUAL_"))
          if (manualArchives.length > 2) {
            const overflow = manualArchives.slice(2)
            for (const item of overflow) {
              await supabase.from("monthly_backup_archives").delete().eq("id", item.id)
            }
          }
        }
      } catch (e) {}

      // 2. Manage audit logs for manual snapshot (keep max 2)
      const existingManualLogs = logs.filter(l => l.action_type === "MANUAL_SNAPSHOT")
      if (existingManualLogs.length >= 2) {
        const overflowLogs = existingManualLogs.slice(1)
        for (const oldLog of overflowLogs) {
          await supabase.from("system_audit_logs").delete().eq("id", oldLog.id)
        }
      }

      await onLogAction(
        "MANUAL_SNAPSHOT",
        "SUPER_ADMIN",
        `Created manual backup snapshot archive: ${dateLabel} (${monthTag}).`
      )

      alert(`✅ Manual backup snapshot created and saved to database! (Max 2 slots active)`)
      await fetchAllSuperAdminData()
    } catch (err: any) {
      console.error("Manual snapshot error:", err)
      alert(`Error creating manual snapshot: ${err.message}`)
    }
  }

  const handleRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const confirmRestore = window.confirm(`Are you sure you want to restore database from backup file "${file.name}"? Existing records will be restored into the database.`)
    if (!confirmRestore) {
      if (restoreFileInputRef.current) restoreFileInputRef.current.value = ""
      return
    }

    setIsLoading(true)
    setIsRestoring(true)
    try {
      const text = await file.text()
      const payload = await decryptBackupPayload(text)

      if (!payload || typeof payload !== "object") {
        throw new Error("Failed to parse decrypted backup contents.")
      }

      if (Array.isArray(payload.product_categories) && payload.product_categories.length > 0) {
        for (const cat of payload.product_categories) {
          await supabase.from("product_categories").upsert(cat)
        }
      }

      if (Array.isArray(payload.inventory) && payload.inventory.length > 0) {
        for (const item of payload.inventory) {
          await supabase.from("inventory").upsert(item)
        }
      }

      if (Array.isArray(payload.inventory_batches) && payload.inventory_batches.length > 0) {
        for (const batch of payload.inventory_batches) {
          await supabase.from("inventory_batches").upsert(batch)
        }
      }

      if (Array.isArray(payload.sales) && payload.sales.length > 0) {
        for (const sale of payload.sales) {
          await supabase.from("sales").upsert(sale)
        }
      }

      if (Array.isArray(payload.sale_items) && payload.sale_items.length > 0) {
        for (const si of payload.sale_items) {
          await supabase.from("sale_items").upsert(si)
        }
      }

      if (Array.isArray(payload.sale_item_batches) && payload.sale_item_batches.length > 0) {
        for (const sib of payload.sale_item_batches) {
          await supabase.from("sale_item_batches").upsert(sib)
        }
      }

      if (Array.isArray(payload.operator_profiles) && payload.operator_profiles.length > 0) {
        for (const p of payload.operator_profiles) {
          await supabase.from("operator_profiles").upsert(p)
        }
      }

      if (Array.isArray(payload.system_audit_logs) && payload.system_audit_logs.length > 0) {
        for (const log of payload.system_audit_logs) {
          await supabase.from("system_audit_logs").upsert(log)
        }
      }

      if (Array.isArray(payload.named_persons) && payload.named_persons.length > 0) {
        for (const np of payload.named_persons) {
          await supabase.from("named_persons").upsert(np)
        }
        localStorage.setItem("pinv_named_persons_registry", JSON.stringify(payload.named_persons))
        window.dispatchEvent(new Event("pinv_registry_updated"))
      }

      if (Array.isArray(payload.staff_attendance) && payload.staff_attendance.length > 0) {
        localStorage.setItem("pinv_staff_attendance", JSON.stringify(payload.staff_attendance))
        window.dispatchEvent(new Event("pinv_attendance_updated"))
      }

      await onLogAction(
        "RESTORE_DATABASE",
        "SUPER_ADMIN",
        `Successfully decrypted and restored database backup file: ${file.name}`
      )

      alert(`✅ Database successfully restored from encrypted backup "${file.name}"!`)

      window.dispatchEvent(new Event("refresh_sales_data"))
      if (refreshAllData) await refreshAllData()
      await fetchAllSuperAdminData()
    } catch (err: any) {
      console.error("Backup restoration error:", err)
      alert(`⚠️ Restoration Failed: ${err.message}`)
    } finally {
      setIsLoading(false)
      setIsRestoring(false)
      if (restoreFileInputRef.current) restoreFileInputRef.current.value = ""
    }
  }

  const executeDataReset = async (type: "inventory" | "sales" | "audit" | "all") => {
    if (isLoading || isOperationRunning.current) return
    if (resetConfirmInput.trim() !== "RESET DATA") {
      alert('Confirmation string does not match. Please type "RESET DATA" to execute reset.')
      return
    }

    // Build step list based on type
    const steps: string[] = ["Creating pre-reset safety backup..."]
    if (type === "inventory" || type === "all") {
      steps.push("Clearing inventory batch records...")
      steps.push("Removing inventory item profiles...")
      steps.push("Purging product categories...")
    }
    if (type === "sales" || type === "all") {
      steps.push("Clearing sale batch link records...")
      steps.push("Removing sale line items...")
      steps.push("Purging sales transaction records...")
    }
    if (type === "inventory" || type === "sales" || type === "all") {
      steps.push("Resetting database ID sequences...")
    }
    if (type === "audit" || type === "all") {
      steps.push("Clearing system audit log entries...")
    }
    steps.push("Logging reset action & syncing data...")

    const totalSteps = steps.length
    let stepIndex = 0

    const advance = (label?: string) => {
      stepIndex++
      setResetProgress({
        active: true,
        step: label ?? steps[stepIndex] ?? "Finalizing...",
        stepIndex,
        totalSteps
      })
    }

    setIsLoading(true)
    isOperationRunning.current = true
    setResetProgress({ active: true, step: steps[0], stepIndex: 0, totalSteps })

    try {
      // Step 0: Pre-Reset Safety Backup
      await handleDownloadDatabaseBackup(`pre_reset_${type}`)
      advance()

      if (type === "inventory" || type === "all") {
        setResetProgress(prev => ({ ...prev, step: "Clearing inventory batch records..." }))
        await supabase.from("inventory_batches").delete().neq("id", 0)
        advance()

        setResetProgress(prev => ({ ...prev, step: "Removing inventory item profiles..." }))
        await supabase.from("sale_item_batches").delete().neq("id", 0)
        await supabase.from("sale_items").delete().neq("id", 0)
        await supabase.from("inventory").delete().neq("id", 0)
        advance()

        setResetProgress(prev => ({ ...prev, step: "Purging product categories..." }))
        await supabase.from("product_categories").delete().neq("name", "unmarked category")
        advance()
      }

      if (type === "sales" || type === "all") {
        setResetProgress(prev => ({ ...prev, step: "Clearing sale batch link records..." }))
        await supabase.from("sale_item_batches").delete().neq("id", 0)
        advance()

        setResetProgress(prev => ({ ...prev, step: "Removing sale line items..." }))
        await supabase.from("sale_items").delete().neq("id", 0)
        advance()

        setResetProgress(prev => ({ ...prev, step: "Purging sales transaction records..." }))
        await supabase.from("sales").delete().neq("id", 0)
        advance()

        setResetProgress(prev => ({ ...prev, step: "Resetting database ID sequences..." }))
        try {
          await supabase.rpc("reset_sales_sequence")
          await supabase.rpc("reset_all_database_sequences")
        } catch (e) {}
        advance()
      }

      if (type === "inventory" || type === "all") {
        setResetProgress(prev => ({ ...prev, step: "Resetting inventory ID sequences..." }))
        try {
          await supabase.rpc("reset_inventory_sequence")
          await supabase.rpc("reset_all_database_sequences")
        } catch (e) {}
        advance()
      }

      if (type === "audit" || type === "all") {
        setResetProgress(prev => ({ ...prev, step: "Clearing system audit log entries..." }))
        await supabase.from("system_audit_logs").delete().neq("id", 0)
        try {
          await supabase.rpc("reset_all_database_sequences")
        } catch (e) {}
        advance()
      }

      if (type === "all") {
        setResetProgress(prev => ({ ...prev, step: "Purging named person registry & staff attendance..." }))
        try {
          await supabase.from("named_persons").delete().neq("id", 0)
          await supabase.from("named_persons").delete().neq("name", "")
          await supabase.rpc("reset_named_persons_sequence").catch(() => {})
          await supabase.rpc("reset_all_database_sequences").catch(() => {})
        } catch (e) {}

        try {
          await supabase.from("staff_attendance").delete().neq("id", 0).catch(() => {})
        } catch (e) {}

        try {
          localStorage.removeItem("pinv_named_persons_registry")
          localStorage.setItem("pinv_named_persons_registry", JSON.stringify([]))
          localStorage.setItem("pinv_customer_sales_map", JSON.stringify({}))
          localStorage.removeItem("pinv_staff_attendance")
          localStorage.setItem("pinv_staff_attendance", JSON.stringify([]))
          window.dispatchEvent(new Event("pinv_registry_updated"))
          window.dispatchEvent(new Event("pinv_attendance_updated"))
        } catch (e) {}
      }

      // Final step: log & sync
      setResetProgress(prev => ({ ...prev, step: "Logging reset action & syncing data...", stepIndex: totalSteps, totalSteps }))
      await onLogAction(
        type === "all" ? "FACTORY_RESET" : "SUPER_ADMIN",
        "SUPER_ADMIN",
        `Executed master data reset for: ${type.toUpperCase()}. All tables and registries cleared and ready for new data.`
      )

      setResetProgress(prev => ({ ...prev, step: "✓ Reset complete!", stepIndex: totalSteps, totalSteps }))
      await new Promise(r => setTimeout(r, 900))

      setShowResetModal(null)
      setResetConfirmInput("")

      // Force logout all accounts below super admin (staff, admin)
      triggerForceLogoutBelowSuperAdmin(currentOperator.username)

      window.dispatchEvent(new Event("refresh_sales_data"))
      if (refreshAllData) await refreshAllData()
      await fetchAllSuperAdminData()

      alert(`Master Data Reset Completed for [${type.toUpperCase()}]. All database tables remain intact and ready for new data!`)
    } catch (err: any) {
      alert(`Data reset error: ${err.message}`)
    } finally {
      setIsLoading(false)
      isOperationRunning.current = false
      setResetProgress({ active: false, step: "", stepIndex: 0, totalSteps: 0 })
    }
  }

  // LocalStorage tombstone persistence for deleted backups
  const getBackupTombstones = (): string[] => {
    try {
      return JSON.parse(localStorage.getItem("deleted_backup_tombstones") || "[]")
    } catch (e) {
      return []
    }
  }

  const addBackupTombstone = (keys: (string | number | undefined)[]) => {
    try {
      const list = getBackupTombstones()
      keys.forEach(k => {
        if (k !== undefined && k !== null && k !== "") {
          const strKey = String(k)
          if (!list.includes(strKey)) list.push(strKey)
        }
      })
      localStorage.setItem("deleted_backup_tombstones", JSON.stringify(list))
    } catch (e) {}
  }

  const removeBackupTombstone = (keys: (string | number | undefined)[]) => {
    try {
      let list = getBackupTombstones()
      const strKeys = keys.filter(k => k !== undefined && k !== null).map(String)
      list = list.filter(k => !strKeys.includes(k))
      localStorage.setItem("deleted_backup_tombstones", JSON.stringify(list))
    } catch (e) {}
  }

  const fetchAllSuperAdminData = async () => {
    if (isOperationRunning.current) return
    try {
      const { data: logsData } = await supabase
        .from("system_audit_logs")
        .select("*")
        .order("id", { ascending: false })
      setLogs(logsData || [])

      const { data: profData } = await supabase
        .from("operator_profiles")
        .select("*")
        .order("id", { ascending: true })
      setProfiles(profData || [])

      const tombstones = getBackupTombstones()

      // Dedicated monthly_backup_archives table query
      const { data: dedicatedArchives, error: archiveErr } = await supabase
        .from("monthly_backup_archives")
        .select("*")
        .order("id", { ascending: false })

      if (!archiveErr && dedicatedArchives) {
        const monthlyList: MonthlyBackupRecord[] = []
        const manualList: MonthlyBackupRecord[] = []

        dedicatedArchives.forEach(a => {
          if (
            tombstones.includes(a.month_tag) ||
            (a.id !== undefined && tombstones.includes(String(a.id)))
          ) {
            return
          }

          const isManual =
            String(a.month_tag || "").toUpperCase().startsWith("MANUAL") ||
            String(a.date_label || "").toLowerCase().includes("manual")

          const rec: MonthlyBackupRecord = {
            id: a.id,
            monthTag: a.month_tag,
            dateLabel: a.date_label,
            exportedAt: a.created_at
          }
          if (isManual) {
            if (manualList.length < 2) manualList.push(rec)
          } else {
            if (monthlyList.length < 3) monthlyList.push(rec)
          }
        })

        setMonthlyBackups(monthlyList)
        setManualBackups(manualList)
      } else if (archiveErr && logsData) {
        // Fallback to MONTHLY_SNAPSHOT audit logs only if monthly_backup_archives table error occurs
        const snapshotLogs = logsData.filter(l => 
          l.action_type === "MONTHLY_SNAPSHOT" &&
          !tombstones.includes(String(l.id))
        )
        const derivedMonthly: MonthlyBackupRecord[] = snapshotLogs.map(l => {
          const dateLabel = l.details_summary.match(/for ([A-Za-z]+ \d{4})/)?.[1] || formatDateString(l.created_at)
          const monthTag = l.details_summary.match(/\((\d{4}-\d{2})\)/)?.[1] || (l.created_at || "").slice(0, 7)
          return {
            id: l.id,
            monthTag,
            dateLabel,
            exportedAt: l.created_at
          }
        }).filter(b => !tombstones.includes(b.monthTag) && !tombstones.includes(b.dateLabel)).slice(0, 3)
        setMonthlyBackups(derivedMonthly)

        const manualLogs = logsData.filter(l => 
          l.action_type === "MANUAL_SNAPSHOT" &&
          !tombstones.includes(String(l.id))
        )
        const derivedManual: MonthlyBackupRecord[] = manualLogs.map(l => {
          return {
            id: l.id,
            monthTag: (l.details_summary.match(/\((MANUAL_[^)]+)\)/)?.[1]) || `MANUAL_${l.id}`,
            dateLabel: l.details_summary.match(/archive: (Manual Backup - [^(]+)/)?.[1] || `Manual Backup (${formatDateString(l.created_at)})`,
            exportedAt: l.created_at
          }
        }).filter(b => !tombstones.includes(b.monthTag) && !tombstones.includes(b.dateLabel)).slice(0, 2)
        setManualBackups(derivedManual)
      }

      // Active user detection: heartbeat-validated
      const HEARTBEAT_TIMEOUT = 30 * 1000 // 30s
      const activeSet = new Set<string>()

      // 1. Current logged-in operator is always active
      if (currentOperator?.username) {
        activeSet.add(String(currentOperator.username).trim().toLowerCase())
      }

      // 2. Check localStorage active heartbeats
      try {
        const now = Date.now()
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith("pinv_active_heartbeat_")) {
            const u = key.replace("pinv_active_heartbeat_", "").trim().toLowerCase()
            const val = Number(localStorage.getItem(key))
            if (val && (now - val < HEARTBEAT_TIMEOUT)) {
              activeSet.add(u)
            } else {
              localStorage.removeItem(key)
            }
          }
        }
      } catch (e) {}

      // 3. Process system_audit_logs to exclude any user whose latest action was logout/termination
      if (logsData && logsData.length > 0) {
        const logoutTypes = ["SESSION_LOGOUT", "FORCE_LOGOUT", "TARGET_SESSION_TERMINATED"]
        const userLastAction = new Map<string, { time: number; actionType: string }>()

        logsData.forEach((log) => {
          const u = String(log.operator_username || "").trim().toLowerCase()
          if (!u) return
          const logTime = new Date(log.created_at).getTime()
          const prev = userLastAction.get(u)
          if (!prev || logTime > prev.time) {
            userLastAction.set(u, { time: logTime, actionType: String(log.action_type || "") })
          }
        })

        userLastAction.forEach(({ actionType }, username) => {
          if (logoutTypes.includes(actionType)) {
            if (username !== currentOperator?.username?.toLowerCase()) {
              activeSet.delete(username)
            }
          }
        })
      }

      if (currentOperator?.username) {
        activeSet.add(String(currentOperator.username).trim().toLowerCase())
      }

      setActiveUsernames(Array.from(activeSet))
    } catch (err) {
      console.error("Super Admin data fetch error:", err)
    }
  }

  const handleDeleteMonthlyBackupItem = async (monthTag: string, dateLabel?: string, recordId?: number) => {
    const isManual = 
      monthTag.toUpperCase().startsWith("MANUAL") || 
      (dateLabel || "").toLowerCase().includes("manual")
    const typeLabel = isManual ? "manual backup snapshot" : "monthly backup archive"

    // 1. Immediately persist tombstone using UNIQUE ID and monthTag ONLY (never dateLabel!)
    addBackupTombstone([recordId, monthTag])

    // 2. Immediately update local React state targeting specific record ID or unique monthTag
    setMonthlyBackups(prev => prev.filter(b => (recordId !== undefined && b.id !== undefined) ? b.id !== recordId : b.monthTag !== monthTag))
    setManualBackups(prev => prev.filter(b => (recordId !== undefined && b.id !== undefined) ? b.id !== recordId : b.monthTag !== monthTag))

    setIsLoading(true)
    try {
      // 3. Delete from dedicated monthly_backup_archives table by exact ID or unique month_tag
      if (recordId) {
        await supabase.from("monthly_backup_archives").delete().eq("id", recordId)
      } else if (monthTag) {
        await supabase.from("monthly_backup_archives").delete().eq("month_tag", monthTag)
      }

      // 4. Log DELETE_BACKUP action into System Audit Trail Logs
      await onLogAction(
        "DELETE_BACKUP",
        "SUPER_ADMIN",
        `Deleted ${typeLabel}: "${dateLabel || monthTag}" [Tag: ${monthTag}]`
      )

      alert(`✅ Backup record for "${dateLabel || monthTag}" deleted and logged in Audit Trail!`)
    } catch (err: any) {
      console.error("Delete backup error:", err)
      alert(`Error deleting backup: ${err.message}`)
    } finally {
      setIsLoading(false)
      await fetchAllSuperAdminData()
    }
  }

  useEffect(() => {
    fetchAllSuperAdminData()
    const channel = supabase
      .channel("super_admin_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "system_audit_logs" }, () => {
        fetchAllSuperAdminData()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "operator_profiles" }, () => {
        fetchAllSuperAdminData()
      })
      .subscribe()

    const heartbeatInterval = setInterval(() => {
      if (currentOperator?.username) {
        localStorage.setItem(`pinv_active_heartbeat_${currentOperator.username.toLowerCase()}`, Date.now().toString())
      }
      // Skip background refresh if a destructive operation is currently running
      if (!isOperationRunning.current) {
        fetchAllSuperAdminData()
      }
    }, 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(heartbeatInterval)
    }
  }, [])

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    const uName = regUsername.trim().toLowerCase()
    const pin = regPin.trim()
    const dName = regDisplayName.trim()

    if (!uName || !pin || !dName) {
      alert("Please fill in all profile registration fields.")
      return
    }

    const { data: existing } = await supabase.from("operator_profiles").select("id").eq("username", uName)
    if (existing && existing.length > 0) {
      alert(`Profile username "@${uName}" already exists in the system.`)
      return
    }

    const { error } = await supabase.from("operator_profiles").insert({
      username: uName,
      password_hash: hashPassword(pin),
      display_name: dName,
      system_role: regRole
    })

    if (error) {
      alert(`Failed to create account profile: ${error.message}`)
      return
    }

    await onLogAction(
      "CREATE_ACCOUNT",
      "SUPER_ADMIN",
      `Registered profile "@${uName}" (${dName}) as ${regRole.toUpperCase()}`
    )

    setRegUsername("")
    setRegPin("")
    setRegDisplayName("")
    setRegRole("staff")

    alert(`Account profile "@${uName}" successfully registered!`)
    fetchAllSuperAdminData()
  }

  const handleSaveEditProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProfile) return

    const dName = editDisplayName.trim()
    const pin = editPin.trim()
    const role = editRole.trim()

    if (!dName || !pin || !role) {
      alert("Please fill in all account profile fields.")
      return
    }

    const { error } = await supabase
      .from("operator_profiles")
      .update({
        display_name: dName,
        password_hash: hashPassword(pin),
        system_role: role
      })
      .eq("id", editingProfile.id)

    if (error) {
      alert(`Failed to update account profile: ${error.message}`)
      return
    }

    await onLogAction(
      "UPDATE_ACCOUNT_PROFILE",
      "SUPER_ADMIN",
      `Updated profile @${editingProfile.username} (Display Name: ${dName}, Role: ${role.toUpperCase()})`
    )

    alert(`Account profile "@${editingProfile.username}" updated successfully!`)
    setEditingProfile(null)
    setOpenActionProfileId(null)
    fetchAllSuperAdminData()
  }

  const handleClearBackupHistory = async () => {
    if (!window.confirm("Are you sure you want to clear the local monthly backup snapshot log tracker?")) {
      return
    }
    localStorage.removeItem("monthly_backup_queue_v1")
    setMonthlyBackups([])
    await onLogAction("CLEAR_BACKUP_LOG", "SUPER_ADMIN", "Cleared local monthly backup snapshot tracking log")
    alert("Monthly backup tracking log reset.")
  }

  const handleDeleteProfile = async (id: number, username: string) => {
    if (username.toLowerCase() === currentOperator.username.toLowerCase()) {
      alert("Security Constraint: You cannot delete your currently active session account.")
      return
    }

    if (!window.confirm(`Are you sure you want to permanently delete account "@${username}"?`)) {
      return
    }

    const { error } = await supabase.from("operator_profiles").delete().eq("id", id)

    if (error) {
      alert(`Failed to delete account: ${error.message}`)
      return
    }

    await triggerForceLogout(username, currentOperator.username)
    await onLogAction("DELETE_ACCOUNT", "SUPER_ADMIN", `Deleted account profile "@${username}"`)
    setOpenActionProfileId(null)
    fetchAllSuperAdminData()
  }

  const handleForceLogoutProfile = async (username: string) => {
    const targetUser = username.trim().toLowerCase()
    if (targetUser === currentOperator.username.toLowerCase()) {
      alert("Notice: To logout your current session, use the 'Log Out Session' button on the sidebar.")
      return
    }

    if (!window.confirm(`Force disconnect active station session for @${username}?`)) {
      return
    }

    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith("pinv_active_heartbeat_")) {
          const u = key.replace("pinv_active_heartbeat_", "").split("_tab_")[0].trim().toLowerCase()
          if (u === targetUser) {
            keysToRemove.push(key)
          }
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    } catch (e) {}

    await supabase.from("system_audit_logs").insert({
      operator_username: targetUser,
      action_type: "SESSION_LOGOUT",
      module_target: "SUPER_ADMIN",
      details_summary: `Session forcibly terminated by @${currentOperator.username}`
    })

    await triggerForceLogout(username, currentOperator.username)
    await onLogAction("FORCE_LOGOUT", "SUPER_ADMIN", `Terminated session for operator @${username}`)

    setActiveUsernames(prev => prev.filter(u => u.toLowerCase() !== targetUser))
    setOpenActionProfileId(null)
    alert(`Disconnect signal sent for user @${username}. Session terminated.`)
    await fetchAllSuperAdminData()
  }

  const formatDateString = (rawDate: string) => {
    try {
      const d = new Date(rawDate)
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      })
    } catch (e) {
      return rawDate
    }
  }

  const filteredLogs = logs.filter(log => {
    const q = auditSearchQuery.toLowerCase().trim()
    const matchSearch =
      !q ||
      log.action_type.toLowerCase().includes(q) ||
      log.operator_username.toLowerCase().includes(q) ||
      log.module_target.toLowerCase().includes(q) ||
      log.details_summary.toLowerCase().includes(q)

    const matchModule = auditModuleFilter === "ALL" || log.module_target.toUpperCase() === auditModuleFilter.toUpperCase()
    return matchSearch && matchModule
  })

  return (
    <div className="space-y-6 text-xs font-medium font-sans">
      
      {/* Super Admin Top Header Banner */}
      <div className="bg-gradient-to-r from-red-900 via-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 border border-red-800/40">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-red-600/30 border border-red-500/50 flex items-center justify-center text-red-400">
            <Flame className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              Super Admin Control Portal
              <span className="text-[10px] bg-red-600 text-white font-mono px-2 py-0.5 rounded-md font-bold uppercase">
                MASTER ACCESS
              </span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Full database backup, master sequence reset, account management, and confidential audit trail logs.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchAllSuperAdminData}
          disabled={isLoading}
          className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl font-bold border border-slate-700 flex items-center gap-2 transition-all shadow-xs"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-red-400" : ""}`} />
          Refresh Master Engine
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Account Profiles Registration & Directories */}
        <div className="space-y-6">
          
          {/* Profile Registration Form */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Register New Account Profile
            </h3>

            <form onSubmit={handleCreateProfile} className="space-y-3">
              <div>
                <label className="block text-gray-500 dark:text-gray-400 font-bold uppercase text-[9px] mb-1">Operator Username ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. staff_member"
                  value={regUsername}
                  onChange={e => setRegUsername(e.target.value)}
                  className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-500 dark:text-gray-400 font-bold uppercase text-[9px] mb-1">Account Password PIN</label>
                <input
                  type="password"
                  required
                  placeholder="Enter access code..."
                  value={regPin}
                  onChange={e => setRegPin(e.target.value)}
                  className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-500 dark:text-gray-400 font-bold uppercase text-[9px] mb-1">Full Display Employee Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jane Doe"
                  value={regDisplayName}
                  onChange={e => setRegDisplayName(e.target.value)}
                  className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-500 dark:text-gray-400 font-bold uppercase text-[9px] mb-1">Authorization Role</label>
                <select
                  value={regRole}
                  onChange={e => setRegRole(e.target.value)}
                  className="w-full p-2 border border-gray-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold uppercase"
                >
                  <option value="staff">STAFF OPERATOR</option>
                  <option value="admin">SYSTEM ADMIN</option>
                  <option value="superadmin">SUPER ADMIN</option>
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
          <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-5 shadow-xs space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Account Profiles Directory
              </h3>
              <span className="text-[10px] text-gray-400 font-mono">{profiles.length} Accounts</span>
            </div>

            <div className={`space-y-2 max-h-72 ${openActionProfileId !== null ? 'overflow-visible' : 'overflow-y-auto'} pr-1 pb-2`}>
              {profiles.length === 0 ? (
                <p className="text-gray-400 text-center py-4 text-[11px]">No operator accounts created.</p>
              ) : (
                profiles.map((p, pIdx) => {
                  const profileUsername = String(p.username || "").trim().toLowerCase()
                  const isActiveUser = activeUsernames.includes(profileUsername)

                  return (
                    <div key={p.id} className="p-3 bg-gray-50/80 dark:bg-slate-900/80 border border-gray-100 dark:border-slate-700 rounded-xl flex justify-between items-center relative">
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex items-center justify-center">
                          <span className={`w-2.5 h-2.5 rounded-full ${isActiveUser ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                          {isActiveUser && (
                            <span className="absolute w-3.5 h-3.5 rounded-full bg-green-400 animate-ping opacity-75" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold text-gray-900 dark:text-white text-xs">{p.display_name}</p>
                            {isActiveUser && (
                              <span className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-bold text-[8px] px-1.5 py-0.2 rounded uppercase">
                                Active Now
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 dark:text-gray-400 font-mono mt-0.5">@{p.username} • {p.system_role.toUpperCase()}</p>
                        </div>
                      </div>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenActionProfileId(prev => prev === p.id ? null : p.id)}
                          className="px-3 py-1 bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-colors"
                        >
                          Action ▾
                        </button>

                        {openActionProfileId === p.id && (
                          <div className={`absolute right-0 ${pIdx === 0 && profiles.length > 1 ? 'top-full mt-1' : 'bottom-full mb-1'} w-48 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 p-1.5 z-50 space-y-1 text-xs font-sans`}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProfile(p)
                                setEditDisplayName(p.display_name)
                                setEditPin(p.password_hash || (p as any).password_text || "")
                                setEditRole(p.system_role)
                                setOpenActionProfileId(null)
                              }}
                              className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium flex items-center gap-2 transition-colors border-t border-gray-100 dark:border-slate-700"
                            >
                              <Edit className="w-3.5 h-3.5 text-blue-500" />
                              Edit Account Profile
                            </button>
                            <button
                              type="button"
                              onClick={() => handleForceLogoutProfile(p.username)}
                              className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium flex items-center gap-2 transition-colors border-t border-gray-100 dark:border-slate-700"
                            >
                              <LogOut className="w-3.5 h-3.5 text-amber-600" />
                              Logout Session
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProfile(p.id, p.username)}
                              className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 font-medium flex items-center gap-2 transition-colors border-t border-gray-100 dark:border-slate-700"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              Delete Account
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* System Database Backup & Archives Control Panel */}
          <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-emerald-200/60 dark:border-emerald-900/50 pb-3">
              <h3 className="font-bold text-emerald-900 dark:text-emerald-300 text-sm flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Database Backup & Archives
              </h3>
              <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 font-mono font-bold text-[9px] px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                SAFEGUARD
              </span>
            </div>

            <p className="text-gray-600 dark:text-gray-400 text-[11px] leading-relaxed">
              Rolling monthly backup archives (up to 3 months: July, Aug, Sept...) and manual backup archives (max 2 slots).
            </p>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleCreateMonthlySnapshot}
                className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-xs transition-all"
              >
                <Plus className="w-4 h-4" />
                Create Monthly Snapshot ({monthlyBackups.length}/3 Active)
              </button>

              <button
                type="button"
                onClick={handleCreateManualSnapshot}
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-xs transition-all"
              >
                <Plus className="w-4 h-4" />
                Create Manual Snapshot ({manualBackups.length}/2 Active)
              </button>
            </div>

            {/* Unified Active Backup Archives List */}
            <div className="space-y-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-900/50">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Active Archives ({monthlyBackups.length}/3 Monthly • {manualBackups.length}/2 Manual)
                </span>
              </div>

              {monthlyBackups.length === 0 && manualBackups.length === 0 ? (
                <p className="text-[10px] text-gray-400 text-center py-3">No backup snapshot archives saved in database.</p>
              ) : (
                <div className="space-y-2">
                  {/* Fixed Monthly Backup Item */}
                  {monthlyBackups.map((mb) => (
                    <div key={mb.monthTag} className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-indigo-900/50 flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
                          <Calendar className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-gray-900 dark:text-white text-xs truncate max-w-[140px] sm:max-w-[220px]">{mb.dateLabel}</p>
                            <span className="bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-[8px] px-1.5 py-0.2 rounded uppercase shrink-0">
                              Monthly
                            </span>
                          </div>
                          <p className="text-[9px] font-mono text-gray-400 truncate">Tag: {mb.monthTag}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDownloadDatabaseBackup(`monthly_${mb.monthTag}`)}
                          className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                          title="Export database backup"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteMonthlyBackupItem(mb.monthTag, mb.dateLabel, mb.id)
                          }}
                          className="p-1.5 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/80 transition-colors cursor-pointer z-10"
                          title="Delete monthly snapshot record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Manual Backup Items */}
                  {manualBackups.map((mb) => (
                    <div key={mb.monthTag} className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                          <HardDrive className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-gray-900 dark:text-white text-xs truncate max-w-[140px] sm:max-w-[220px]">{mb.dateLabel}</p>
                            <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[8px] px-1.5 py-0.2 rounded uppercase shrink-0">
                              Manual
                            </span>
                          </div>
                          <p className="text-[9px] font-mono text-gray-400 truncate">Tag: {mb.monthTag}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDownloadDatabaseBackup(`manual_${mb.monthTag}`)}
                          className="p-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                          title="Export manual database backup"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteMonthlyBackupItem(mb.monthTag, mb.dateLabel, mb.id)
                          }}
                          className="p-1.5 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/80 transition-colors cursor-pointer z-10"
                          title="Delete manual snapshot record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <input 
              type="file" 
              ref={restoreFileInputRef} 
              onChange={handleRestoreFileSelected} 
              accept=".bak,.json" 
              className="hidden" 
            />

            <div className="pt-1">
              <button
                type="button"
                disabled={isRestoring}
                onClick={() => restoreFileInputRef.current?.click()}
                className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                {isRestoring ? "Restoring..." : "Restore Database from File (.bak)"}
              </button>
            </div>
          </div>

          {/* Super Admin Data Reset Control Panel */}
          <div className="bg-red-50/70 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-red-200/60 dark:border-red-900/50 pb-3">
              <h3 className="font-bold text-red-900 dark:text-red-300 text-sm flex items-center gap-2">
                <Flame className="w-4 h-4 text-red-600" />
                Super Admin Reset Zone
              </h3>
              <span className="bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300 font-mono font-bold text-[9px] px-2 py-0.5 rounded border border-red-200 dark:border-red-800">
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
                className="w-full py-2 px-3 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-slate-700 text-red-700 dark:text-red-400 font-bold rounded-lg border border-red-200 dark:border-red-900/40 text-left flex items-center justify-between shadow-2xs transition-colors"
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
                className="w-full py-2 px-3 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-slate-700 text-red-700 dark:text-red-400 font-bold rounded-lg border border-red-200 dark:border-red-900/40 text-left flex items-center justify-between shadow-2xs transition-colors"
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
                className="w-full py-2 px-3 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-slate-700 text-red-700 dark:text-red-400 font-bold rounded-lg border border-red-200 dark:border-red-900/40 text-left flex items-center justify-between shadow-2xs transition-colors"
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

        {/* Right Column: Master System Audit Trail Logs Table */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b dark:border-slate-700 pb-3">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-amber-500" />
                Master System Audit Trail Logs (Super Admin Master View)
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" title="Realtime Active" />
              </h3>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 text-[10px] font-bold uppercase">Filter Module:</span>
                <select
                  value={auditModuleFilter}
                  onChange={e => setAuditModuleFilter(e.target.value)}
                  className="px-2 py-1 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-800 dark:text-white rounded-lg text-[10px] font-bold uppercase"
                >
                  <option value="ALL">ALL MODULES</option>
                  <option value="AUTHENTICATION">AUTH</option>
                  <option value="POS_CHECKOUT">POS CHECKOUT</option>
                  <option value="SALES_HISTORY">SALES HISTORY</option>
                  <option value="ITEM_SPECIFICATIONS">ITEM SPECS</option>
                  <option value="SUPER_ADMIN">SUPER ADMIN</option>
                </select>
              </div>
            </div>

            <div className="bg-gray-50/70 dark:bg-slate-900/70 p-2.5 rounded-xl border dark:border-slate-700">
              <input
                type="text"
                placeholder="Search audit trail by operator username, action type, module target, details..."
                value={auditSearchQuery}
                onChange={e => setAuditSearchQuery(e.target.value)}
                className="w-full p-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-800 dark:text-white rounded-lg text-xs"
              />
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-700 overflow-hidden max-h-[580px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 dark:bg-slate-800 border-b dark:border-slate-700 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3 text-[10px] text-gray-500 dark:text-gray-300 font-bold uppercase">Time & Date</th>
                    <th className="py-2.5 px-3 text-[10px] text-gray-500 dark:text-gray-300 font-bold uppercase">Operator</th>
                    <th className="py-2.5 px-3 text-[10px] text-gray-500 dark:text-gray-300 font-bold uppercase">Action Type</th>
                    <th className="py-2.5 px-3 text-[10px] text-gray-500 dark:text-gray-300 font-bold uppercase">Target Module</th>
                    <th className="py-2.5 px-3 text-[10px] text-gray-500 dark:text-gray-300 font-bold uppercase text-center">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-400 text-xs">
                        No system audit trail logs detected for the current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map(log => (
                      <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-2.5 px-3 text-gray-500 dark:text-gray-400 text-[10px] font-mono whitespace-nowrap">
                          {formatDateString(log.created_at)}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-gray-900 dark:text-white font-mono text-[11px]">
                          @{log.operator_username}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded font-mono font-bold text-[9px] uppercase bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                            {log.action_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[10px] text-gray-600 dark:text-gray-300 font-bold uppercase">
                          {log.module_target}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedLogSummary(log)}
                            className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 p-1"
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
        </div>

      </div>

      {/* Styled Audit Trail Entry Details Modal (Dark Theme Design) */}
      {selectedLogSummary && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-[#182232] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-700/60 text-white">
            
            <div className="flex justify-between items-center border-b border-slate-700/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📝</span>
                <h3 className="font-bold text-base text-white tracking-wide">Audit Trail Entry Details</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono font-bold">ID: #{selectedLogSummary.id}</span>
            </div>

            <div className="bg-[#101826] rounded-xl p-4 border border-slate-800/80 space-y-3.5 font-mono text-[11px]">
              
              <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">TIMESTAMP:</span>
                <span className="font-bold text-slate-200">{formatDateString(selectedLogSummary.created_at)}</span>
              </div>

              <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">USER IDENTITY:</span>
                <span className="font-bold text-emerald-400">@{selectedLogSummary.operator_username || "admin"}</span>
              </div>

              <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">ACTION TYPE:</span>
                <span className="font-bold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded text-[10px] font-mono shadow-2xs">
                  {selectedLogSummary.action_type}
                </span>
              </div>

              <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">MODULE TARGET:</span>
                <span className="font-bold text-slate-200">{selectedLogSummary.module_target}</span>
              </div>

              <div className="space-y-1.5 pt-1">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">
                  DETAILS SUMMARY STATEMENT:
                </span>
                <div className="p-3 bg-[#1e293b] rounded-xl border border-slate-700/60 text-xs font-sans text-slate-200 leading-relaxed">
                  {selectedLogSummary.details_summary || "User terminal log-in verification session authorized successfully."}
                </div>
              </div>

            </div>

            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setSelectedLogSummary(null)}
                className="px-8 py-2.5 bg-[#1e293b] hover:bg-slate-700 text-white font-bold rounded-full tracking-wide shadow-lg text-xs transition-all border border-slate-600/60"
              >
                Close Details View
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Super Admin Data Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-red-100 dark:border-red-900/50">
            <div className="flex justify-between items-start border-b dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-950 flex items-center justify-center text-red-600 dark:text-red-400">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-gray-900 dark:text-white">Confirm Master Data Reset</h3>
                  <p className="text-[10px] text-red-600 dark:text-red-400 font-mono font-bold uppercase">
                    Target: {showResetModal.toUpperCase()} WIPE
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                disabled={isLoading}
                onClick={() => setShowResetModal(null)} 
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-900/50 text-xs text-red-800 dark:text-red-300 space-y-2">
              <p className="font-bold">⚠️ Warning: Data purge is permanent.</p>
              <p className="text-[11px] leading-relaxed">
                All saved data rows in <strong>{showResetModal.toUpperCase()}</strong> will be removed. All database tables and columns will remain completely intact and ready for fresh entries.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Type <span className="text-red-600 dark:text-red-400 font-mono font-bold">"RESET DATA"</span> to authorize:
              </label>
              <input
                type="text"
                disabled={isLoading}
                value={resetConfirmInput}
                onChange={e => setResetConfirmInput(e.target.value)}
                placeholder="Type RESET DATA..."
                className="w-full p-2.5 border border-red-300 dark:border-red-900/50 rounded-xl text-xs font-mono font-bold text-gray-900 dark:text-white bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
              />
            </div>

            {/* Reset Progress Indicator */}
            {resetProgress.active && (
              <div className="space-y-2.5 p-3 bg-slate-950 rounded-xl border border-red-900/40">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-red-400 font-mono font-bold flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
                    {resetProgress.step}
                  </span>
                  <span className="text-red-300 font-mono font-bold text-[10px] bg-red-950/60 px-2 py-0.5 rounded-full border border-red-800/40">
                    {Math.round((resetProgress.stepIndex / (resetProgress.totalSteps || 1)) * 100)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                  <div
                    className="h-full bg-gradient-to-r from-red-700 via-orange-500 to-yellow-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(4, Math.round((resetProgress.stepIndex / (resetProgress.totalSteps || 1)) * 100))}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 font-mono">
                  Step {resetProgress.stepIndex} of {resetProgress.totalSteps} — Do not close this window
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => executeDataReset(showResetModal)}
                disabled={resetConfirmInput.trim() !== "RESET DATA" || isLoading}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                {isLoading ? "Executing Reset..." : "Execute Data Reset"}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setShowResetModal(null)}
                className="py-2.5 px-4 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl text-xs disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Account Profile Modal */}
      {editingProfile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border dark:border-slate-700">
            <div className="flex justify-between items-center border-b dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-gray-900 dark:text-white">Edit Account Credentials Profile</h3>
                  <p className="text-[10px] text-gray-400 font-mono">Editing @{editingProfile.username}</p>
                </div>
              </div>
              <button type="button" onClick={() => setEditingProfile(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditProfile} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Full Display Employee Name
                </label>
                <input
                  type="text"
                  required
                  value={editDisplayName}
                  onChange={e => setEditDisplayName(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-900 text-gray-800 dark:text-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Password PIN Code
                </label>
                <input
                  type="password"
                  required
                  value={editPin}
                  onChange={e => setEditPin(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-mono bg-white dark:bg-slate-900 text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Authorization Role
                </label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold uppercase bg-white dark:bg-slate-900 text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="staff">STAFF OPERATOR</option>
                  <option value="admin">SYSTEM ADMIN</option>
                  <option value="superadmin">SUPER ADMIN</option>
                </select>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Edit className="w-4 h-4" />
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="py-2.5 px-4 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
