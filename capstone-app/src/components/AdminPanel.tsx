import { useState, useEffect, useRef } from "react"
import { supabase, triggerForceLogout } from "../utils/apiClient"
import { downloadExcelWithAutoFit } from "../utils/excelUtils"
import { ShieldAlert, UserPlus, Trash2, History, RefreshCw, ShoppingBag, Eye, X, Flame, Database, AlertOctagon, RotateCcw, LogOut, Download, Edit } from "lucide-react"

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
  const [openActionProfileId, setOpenActionProfileId] = useState<number | null>(null)

  const [selectedBatchReceiptSaleId, setSelectedBatchReceiptSaleId] = useState<number | null>(null)
  const [selectedLogSummary, setSelectedLogSummary] = useState<AuditLog | null>(null)

  const [regUsername, setRegUsername] = useState("")
  const [regPin, setRegPin] = useState("")
  const [regDisplayName, setRegDisplayName] = useState("")
  const [regRole, setRegRole] = useState("staff")

  const [editingProfile, setEditingProfile] = useState<AccountProfile | null>(null)
  const [editDisplayName, setEditDisplayName] = useState("")
  const [editPin, setEditPin] = useState("")
  const [editRole, setEditRole] = useState("staff")

  const [auditModuleFilter, setAuditModuleFilter] = useState("ALL")
  const [auditSearchQuery, setAuditSearchQuery] = useState("")
  const [batchSearchQuery, setBatchSearchQuery] = useState("")

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
        { data: profiles },
        { data: categories },
        { data: inventory },
        { data: batches },
        { data: sales },
        { data: saleItems },
        { data: saleItemBatches },
        { data: auditLogs }
      ] = await Promise.all([
        supabase.from("operator_profiles").select("*"),
        supabase.from("product_categories").select("*"),
        supabase.from("inventory").select("*"),
        supabase.from("inventory_batches").select("*"),
        supabase.from("sales").select("*"),
        supabase.from("sale_items").select("*"),
        supabase.from("sale_item_batches").select("*"),
        supabase.from("system_audit_logs").select("*")
      ])

      const backupData = {
        metadata: {
          system: "Malabon Pharmacy & Clinic POS & Inventory System",
          backupType: tag,
          exportedAt: new Date().toISOString(),
          operator: currentOperator.username,
          version: "1.0.0"
        },
        operator_profiles: profiles || [],
        product_categories: categories || [],
        inventory: inventory || [],
        inventory_batches: batches || [],
        sales: sales || [],
        sale_items: saleItems || [],
        sale_item_batches: saleItemBatches || [],
        system_audit_logs: auditLogs || []
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

      if (tag.includes("monthly")) {
        const curMonth = new Date().toISOString().slice(0, 7)
        localStorage.setItem("last_monthly_backup_month", curMonth)
      }

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

      await onLogAction(
        "RESTORE_DATABASE",
        "SUPER_ADMIN",
        `Successfully decrypted and restored database backup file: ${file.name}`
      )

      alert(`✅ Database successfully restored from encrypted backup "${file.name}"!`)

      window.dispatchEvent(new Event("refresh_sales_data"))
      if (refreshAllData) await refreshAllData()
      await fetchAllAdminData()
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
    if (resetConfirmInput.trim() !== "RESET DATA") {
      alert('Confirmation string does not match. Please type "RESET DATA" to execute reset.')
      return
    }

    setIsLoading(true)
    try {
      // 0. Automatic Pre-Reset Safety Backup
      await handleDownloadDatabaseBackup(`pre_reset_${type}`)

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

        // Attempt sequence reset in Postgres
        try {
          await supabase.rpc("reset_sales_sequence")
          await supabase.rpc("reset_all_database_sequences")
        } catch (e) {
          // ignore if RPC function is not defined in DB
        }
      }

      if (type === "inventory" || type === "all") {
        try {
          await supabase.rpc("reset_inventory_sequence")
          await supabase.rpc("reset_all_database_sequences")
        } catch (e) {}
      }

      if (type === "audit" || type === "all") {
        const { data: logList } = await supabase.from("system_audit_logs").select("id")
        if (logList && logList.length > 0) {
          for (const l of logList) {
            await supabase.from("system_audit_logs").delete().eq("id", l.id)
          }
        }
        try {
          await supabase.rpc("reset_all_database_sequences")
        } catch (e) {}
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

      // Track active status: any activity in last 12h = active, unless last action was SESSION_LOGOUT
      const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000
      const userLastAction = new Map<string, { time: number; isLogout: boolean }>()

      data.forEach((log) => {
        const u = String(log.operator_username || "").trim().toLowerCase()
        if (!u) return
        const logTime = new Date(log.created_at).getTime()
        const prev = userLastAction.get(u)
        if (!prev || logTime > prev.time) {
          userLastAction.set(u, { time: logTime, isLogout: log.action_type === "SESSION_LOGOUT" })
        }
      })

      const activeSet = new Set<string>()
      userLastAction.forEach(({ time, isLogout }, username) => {
        if (!isLogout && time >= twelveHoursAgo) {
          activeSet.add(username)
        }
      })

      // Always mark current operator as active
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

  const handleForceLogoutProfile = async (username: string) => {
    const normUser = String(username || "").trim().toLowerCase()
    await supabase.from("system_audit_logs").insert({
      operator_username: "admin",
      action_type: "TARGET_SESSION_TERMINATED",
      module_target: "SUPER_ADMIN",
      details_summary: normUser
    })

    setActiveUsernames(prev => prev.filter(u => u !== normUser))
    await onLogAction("FORCE_LOGOUT", "SUPER_ADMIN", `Forcibly terminated session for operator @${username}`)
    triggerForceLogout(username, "admin")
    setOpenActionProfileId(null)
    alert(`Active session for @${username} has been logged out!`)
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
        password_text: pin,
        system_role: role
      })
      .eq("id", editingProfile.id)

    if (error) {
      alert(`Failed to update account profile: ${error.message}`)
      return
    }

    await onLogAction(
      "UPDATE_ACCOUNT_PROFILE",
      "ADMIN_PANEL",
      `Updated profile @${editingProfile.username} (Display Name: ${dName}, Role: ${role.toUpperCase()})`
    )

    alert(`Account profile "@${editingProfile.username}" updated successfully!`)
    setEditingProfile(null)
    setOpenActionProfileId(null)
    await fetchProfiles()
  }

  const handleDeleteProfile = async (profileId: number, username: string) => {
    if (!window.confirm(`Delete operator profile @${username}?`)) return

    await supabase.from("operator_profiles").delete().eq("id", profileId)
    await onLogAction("DELETE_OPERATOR", "ADMIN_PANEL", `Removed profile @${username}`)
    triggerForceLogout(username, "admin")
    setOpenActionProfileId(null)
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
    // Group ALL items per sale_id (not just first item)
    const map = new Map<number, {
      sale_id: number
      item_name: string
      total_qty: number
      total_price: number
      batches: { label: string; qty: number; price: number; item: string }[]
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
          price: Number(row.unit_price),
          item: row.item_name
        })
        // Build combined item name
        if (!existing.item_name.includes(row.item_name)) {
          existing.item_name = `${existing.item_name} + ${row.item_name}`
        }
      } else {
        map.set(row.sale_id, {
          sale_id: row.sale_id,
          item_name: row.item_name,
          total_qty: row.quantity_deducted,
          total_price: lineCost,
          batches: [{
            label: row.batch_label,
            qty: row.quantity_deducted,
            price: Number(row.unit_price),
            item: row.item_name
          }],
          created_at: row.created_at
        })
      }
    })

    return Array.from(map.values()).sort((a, b) => b.sale_id - a.sale_id)
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

  const [batchDateFrame, setBatchDateFrame] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [batchStartDate, setBatchStartDate] = useState<string>("");
  const [batchEndDate, setBatchEndDate] = useState<string>("");

  const checkBatchDateFrame = (createdAt: string) => {
    if (batchDateFrame === "all") return true;
    const d = new Date(createdAt);
    const now = new Date();
    if (batchDateFrame === "today") {
      return d.toDateString() === now.toDateString();
    }
    if (batchDateFrame === "week") {
      const day = now.getDay();
      const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMon, 0, 0, 0, 0);
      const endOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMon + 6, 23, 59, 59, 999);
      return d >= startOfWeek && d <= endOfWeek;
    }
    if (batchDateFrame === "month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return d >= startOfMonth && d <= endOfMonth;
    }
    if (batchDateFrame === "custom") {
      if (batchStartDate && d < new Date(batchStartDate + "T00:00:00")) return false;
      if (batchEndDate && d > new Date(batchEndDate + "T23:59:59")) return false;
      return true;
    }
    return true;
  };

  const filteredStockAdditions = groupedStockAdditions.filter(group => {
    if (!checkBatchDateFrame(group.created_at)) return false;
    if (!batchSearchQuery.trim()) return true;
    const q = batchSearchQuery.toLowerCase().trim();
    return (
      group.batch_tag.toLowerCase().includes(q) ||
      group.summary_name.toLowerCase().includes(q) ||
      group.items.some(i => i.name.toLowerCase().includes(q) || i.label.toLowerCase().includes(q))
    );
  });

  const filteredAuditLogs = logs.filter(log => {
    // Audit Confidentiality Rule: Hide superadmin logs from standard admin page
    if (currentOperator.systemRole !== "superadmin") {
      const opUser = (log.operator_username || "").toLowerCase().trim()
      const isSuperAdminUser = opUser === "superadmin" || opUser.includes("superadmin") || opUser === "super admin" || opUser.includes("super admin")
      const isSuperAdminModule = log.module_target?.toUpperCase() === "SUPER_ADMIN"
      if (isSuperAdminUser || isSuperAdminModule) return false
    }

    const matchModule = auditModuleFilter === "ALL" || (log.module_target || "").toUpperCase().includes(auditModuleFilter.toUpperCase());
    const q = auditSearchQuery.toLowerCase().trim();
    const matchQuery = !q || 
      (log.operator_username || "").toLowerCase().includes(q) ||
      (log.action_type || "").toLowerCase().includes(q) ||
      (log.details_summary || "").toLowerCase().includes(q) ||
      (log.module_target || "").toLowerCase().includes(q);
    return matchModule && matchQuery;
  });

  const filteredGroupedBatchSales = groupedBatchSales.filter(sale => {
    if (!checkBatchDateFrame(sale.created_at)) return false;
    if (!batchSearchQuery.trim()) return true;
    const q = batchSearchQuery.toLowerCase().trim();
    const matchId = String(sale.sale_id).toLowerCase().includes(q) || `#${sale.sale_id}`.toLowerCase().includes(q);
    const matchItem = sale.item_name.toLowerCase().includes(q);
    const matchBatches = sale.batches.some(b => b.label.toLowerCase().includes(q) || b.item.toLowerCase().includes(q));
    return matchId || matchItem || matchBatches;
  });

  const handleExportAuditLogsCSV = () => {
    if (filteredAuditLogs.length === 0) return;
    const headers = ["Log ID", "Time & Date", "Operator Username", "Module Target", "Action Type", "Details Summary"];
    const rows: (string | number)[][] = [];

    filteredAuditLogs.forEach(log => {
      rows.push([
        `#${log.id}`,
        formatDateString(log.created_at),
        log.operator_username || "",
        log.module_target || "",
        log.action_type || "",
        log.details_summary || ""
      ]);
    });

    downloadExcelWithAutoFit("system_audit_logs", "System Audit Logs", headers, rows, false);
  };

  const handleExportBatchLogsCSV = () => {
    if (batchTabMode === "sales") {
      if (filteredGroupedBatchSales.length === 0) return;
      const headers = ["Transaction ID", "Product Name", "Batch Label", "Quantity Sold (pcs)", "Unit Price (PHP)", "Total Line Price (PHP)", "Time & Date"];
      const rows: (string | number)[][] = [];

      filteredGroupedBatchSales.forEach(sale => {
        sale.batches.forEach(batch => {
          const lineTotal = (batch.qty || 0) * (batch.price || 0);
          rows.push([
            `#${sale.sale_id}`,
            batch.item || sale.item_name,
            batch.label || "",
            batch.qty,
            batch.price,
            lineTotal,
            formatDateString(sale.created_at)
          ]);
        });
      });

      downloadExcelWithAutoFit("batch_sales_logs", "Batch Sales Logs", headers, rows);
    } else {
      if (filteredStockAdditions.length === 0) return;
      const headers = ["Batch Event Tag", "Product Name", "Batch Label", "Stock Added (pcs)", "Unit Price (PHP)", "Total Item Value (PHP)", "Time & Date"];
      const rows: (string | number)[][] = [];

      filteredStockAdditions.forEach(group => {
        group.items.forEach(item => {
          const itemTotalVal = (item.stock || 0) * (item.price || 0);
          rows.push([
            group.batch_tag,
            item.name,
            item.label || "",
            item.stock,
            item.price,
            itemTotalVal,
            formatDateString(group.created_at)
          ]);
        });
      });

      downloadExcelWithAutoFit("stock_additions_logs", "Stock Additions Logs", headers, rows);
    }
  };

  const displayProfiles = profiles.filter(p => {
    const r = String(p.system_role || "").toLowerCase().trim()
    const u = String(p.username || "").toLowerCase().trim()
    return r !== "superadmin" && !u.includes("superadmin") && !u.includes("super_admin") && !u.includes("super admin")
  })

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs font-medium font-sans">
        
        {/* Left Column: Register Account & Directory (Col-span 4) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Register New Account Profile */}
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

          {/* Directory Listing (Hides Super Admin Account) */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-5 shadow-xs space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Account Profiles Directory
              </h3>
              <span className="text-[10px] text-gray-400 font-mono">{displayProfiles.length} Accounts</span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {displayProfiles.length === 0 ? (
                <p className="text-gray-400 text-center py-4 text-[11px]">No operator accounts created.</p>
              ) : (
                displayProfiles.map(p => {
                  const profileUsername = String(p.username || "").trim().toLowerCase()
                  const isActiveUser = activeUsernames.includes(profileUsername)

                  return (
                    <div key={p.id} className="p-3 bg-gray-50/80 dark:bg-slate-900/80 border border-gray-100 dark:border-slate-700 rounded-xl flex justify-between items-center">
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
                          <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-1.5 z-50 space-y-1 text-xs font-sans">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProfile(p)
                                setEditDisplayName(p.display_name)
                                setEditPin(p.password_text)
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

        </div>

        {/* Right Column: Audit Logs & Batch Logs (Col-span 8) */}
        <div className="lg:col-span-8 space-y-6">

          {/* Realtime System Audit Trail Logs Table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b dark:border-slate-700 pb-3">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                System Audit Trail Logs
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" title="Realtime Active" />
              </h3>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportAuditLogsCSV}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={fetchAllAdminData}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Audit Logs Controls */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="w-full sm:w-1/3">
                <label className="block text-[9px] font-bold text-gray-400 dark:text-gray-400 uppercase mb-1">Target Module Category</label>
                <select
                  value={auditModuleFilter}
                  onChange={e => setAuditModuleFilter(e.target.value)}
                  className="w-full p-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-white rounded-lg text-xs font-bold uppercase"
                >
                  <option value="ALL">All Modules</option>
                  <option value="INVENTORY">INVENTORY & PRODUCTS</option>
                  <option value="SALES">SALES & POS CHECKOUT</option>
                  <option value="AUTHENTICATION">AUTHENTICATION</option>
                  <option value="SYSTEM">SYSTEM AUDIT</option>
                </select>
              </div>

              <div className="w-full sm:w-2/3">
                <label className="block text-[9px] font-bold text-gray-400 dark:text-gray-400 uppercase mb-1">Search Logs</label>
                <input
                  type="text"
                  placeholder="Search operator, action, details..."
                  value={auditSearchQuery}
                  onChange={e => setAuditSearchQuery(e.target.value)}
                  className="w-full p-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-white rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto pr-1 rounded-lg border border-gray-100 dark:border-slate-700">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/90 dark:bg-slate-900 text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase sticky top-0 backdrop-blur-xs z-10 border-b dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Timestamp Date</th>
                    <th className="py-2 px-3">Operator</th>
                    <th className="py-2 px-3">Action Tag</th>
                    <th className="py-2 px-3">Target Module</th>
                    <th className="py-2 px-3 text-center">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-700 font-mono text-[11px] bg-white dark:bg-slate-800">
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-400 dark:text-gray-500 font-sans">
                        No system audit log entries match current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50">
                        <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-[10px] whitespace-nowrap">
                          {formatDateString(log.created_at)}
                        </td>
                        <td className="py-2 px-3 font-bold text-gray-900 dark:text-slate-200">
                          @{log.operator_username || "system"}
                        </td>
                        <td className="py-2 px-3">
                          <span className="bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded font-bold text-[9px]">
                            {log.action_type}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-600 dark:text-gray-300 font-sans text-[10px]">
                          {log.module_target}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedLogSummary(log)}
                            className="text-blue-500 hover:text-blue-700 p-1"
                            title="View Log Entry Details"
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
          <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b dark:border-slate-700 pb-3">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-green-600 dark:text-green-400" />
                Batch History & Stock Additions Logs
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" title="Realtime Active" />
              </h3>
              
              <div className="flex items-center gap-2">
                <div className="flex bg-gray-100 dark:bg-slate-900 p-0.5 rounded-lg border dark:border-slate-700 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setBatchTabMode("sales")}
                    className={`px-3 py-1 rounded-md font-bold transition-all ${batchTabMode === "sales" ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-2xs' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
                  >
                    Batch Sales
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchTabMode("creation")}
                    className={`px-3 py-1 rounded-md font-bold transition-all ${batchTabMode === "creation" ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-2xs' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
                  >
                    Stock Additions
                  </button>
                </div>

                <button
                  type="button"
                  onClick={fetchAllAdminData}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Controls: Date Frame & Export CSV/Excel */}
            <div className="bg-gray-50/70 dark:bg-slate-900/70 p-3 rounded-xl border dark:border-slate-700 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                  <span className="font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider">Date Frame:</span>
                  <div className="flex bg-gray-100 dark:bg-slate-800 p-0.5 rounded-lg border dark:border-slate-700">
                    {(["all", "today", "week", "month", "custom"] as const).map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setBatchDateFrame(f)}
                        className={`px-2.5 py-1 rounded-md font-bold uppercase transition-all ${batchDateFrame === f ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportBatchLogsCSV}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export {batchTabMode === "sales" ? "Batch Sales" : "Stock Additions"} Excel/CSV
                </button>
              </div>

              {batchDateFrame === "custom" && (
                <div className="flex items-center gap-2 pt-1 text-[10px] font-sans">
                  <label className="text-gray-500 dark:text-gray-400 font-bold">From:</label>
                  <input type="date" value={batchStartDate} onChange={e => setBatchStartDate(e.target.value)} className="p-1 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-white rounded text-xs" />
                  <label className="text-gray-500 dark:text-gray-400 font-bold">To:</label>
                  <input type="date" value={batchEndDate} onChange={e => setBatchEndDate(e.target.value)} className="p-1 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-white rounded text-xs" />
                </div>
              )}

              <input
                type="text"
                placeholder={batchTabMode === "sales" ? "Search batch sales by Sale ID, Item Name, Batch Label..." : "Search stock creation batches by Item Name, Batch Label, Expiry..."}
                value={batchSearchQuery}
                onChange={e => setBatchSearchQuery(e.target.value)}
                className="w-full p-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-white rounded-lg text-xs"
              />
            </div>

            <div className="max-h-80 overflow-y-auto pr-1 rounded-lg border border-gray-100 dark:border-slate-700">
              {batchTabMode === "sales" ? (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50/90 dark:bg-slate-900 text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase sticky top-0 backdrop-blur-xs z-10 border-b dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Tx ID</th>
                      <th className="py-2.5 px-3 text-center">Total Qty</th>
                      <th className="py-2.5 px-3 text-right">Total Price</th>
                      <th className="py-2.5 px-3 text-right">Time & Date</th>
                      <th className="py-2.5 px-3 text-center">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-slate-700 font-mono text-[11px] bg-white dark:bg-slate-800">
                    {filteredGroupedBatchSales.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-400 dark:text-gray-500 font-sans">
                          No batch sales logged matching search query.
                        </td>
                      </tr>
                    ) : (
                      filteredGroupedBatchSales.map(sale => (
                        <tr key={sale.sale_id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50">
                          <td className="py-2.5 px-3 font-bold text-blue-600 dark:text-blue-400">#{sale.sale_id}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-gray-800 dark:text-slate-200">{sale.total_qty} pc</td>
                          <td className="py-2.5 px-3 text-right font-bold text-green-700 dark:text-green-400">₱{sale.total_price.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right text-gray-400 dark:text-gray-400 text-[10px] font-sans whitespace-nowrap">
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

    </>
  )
}