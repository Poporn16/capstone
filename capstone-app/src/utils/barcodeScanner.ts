import { useEffect, useRef } from "react"
import type { InventoryItem, InventoryBatch, ScanOption } from "../types"

export type { ScanOption }

/**
 * Matches a scanned code strictly against inventory items by exact barcode number.
 * Does NOT match by item ID, product name, or partial/similar digits.
 */
export function matchBarcodeToItem(inventory: InventoryItem[], rawCode: string): InventoryItem | null {
  const cleanCode = (rawCode || "").trim().toLowerCase()
  if (!cleanCode || !inventory || inventory.length === 0) return null

  return (
    inventory.find(item => {
      if (!item) return false
      const b = String(item.barcode || "").trim().toLowerCase()
      // STRICT EXACT MATCH: Must match product barcode exactly
      return b.length > 0 && b === cleanCode
    }) || null
  )
}

/**
/**
 * Extracts options for an item or group of items, detecting if multiple distinct manufacturers exist.
 */
export function getItemManufacturerOptions(
  itemsInput: InventoryItem | InventoryItem[]
): { options: ScanOption[]; hasDifferentManufacturers: boolean } {
  const items = Array.isArray(itemsInput) ? itemsInput : [itemsInput]
  const rawOptions: ScanOption[] = []

  items.forEach(item => {
    if (!item) return
    const activeBatches = (item.batches || []).filter(b => (Number(b.stock) || 0) > 0)

    if (activeBatches.length > 0) {
      activeBatches.forEach(b => {
        rawOptions.push({
          item,
          batch: b,
          label: "",
          productName: item.name,
          manufacturer: b.manufacturer || item.manufacturer || "Generic / Phyto",
          category: item.category,
          stock: b.stock,
          price: b.price > 0 ? b.price : (item.price > 0 ? item.price : 0),
          expiryDate: b.expiryDate,
          batchLabel: b.batchLabel
        })
      })
    } else if ((item.stock || 0) > 0) {
      rawOptions.push({
        item,
        label: "",
        productName: item.name,
        manufacturer: item.manufacturer || "Generic / Phyto",
        category: item.category,
        stock: item.stock,
        price: item.price || 0
      })
    }
  })

  // Check unique normalized manufacturer names
  const distinctManufacturers = new Set(
    rawOptions.map(opt => (opt.manufacturer || "Generic / Phyto").trim().toLowerCase())
  )

  const hasDifferentManufacturers = distinctManufacturers.size > 1

  const finalOptions = rawOptions.map((opt, idx) => ({
    ...opt,
    label: idx === 0 ? "Option A" : idx === 1 ? "Option B" : idx === 2 ? "Option C" : `Option ${idx + 1}`
  }))

  return { options: finalOptions, hasDifferentManufacturers }
}

/**
 * Finds matching inventory items for a scanned code strictly by exact barcode number.
 * Detects whether multiple distinct manufacturers exist for disambiguation modals.
 * Does NOT match by item ID, product name, or partial/similar digits.
 */
export function findMatchingInventoryOptions(
  inventory: InventoryItem[],
  rawCode: string
): { options: ScanOption[]; hasDifferentManufacturers: boolean } {
  const cleanCode = (rawCode || "").trim().toLowerCase()
  if (!cleanCode || !inventory || inventory.length === 0) {
    return { options: [], hasDifferentManufacturers: false }
  }

  // STRICT EXACT MATCH: Only match items whose barcode is an exact match
  const matchedItems = inventory.filter(item => {
    if (!item) return false
    const b = String(item.barcode || "").trim().toLowerCase()
    return b.length > 0 && b === cleanCode
  })

  return getItemManufacturerOptions(matchedItems)
}

export interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => boolean | void
  enabled?: boolean
  minLength?: number
  maxKeystrokeIntervalMs?: number
  debounceFlushMs?: number
  isSearchOrScanInput?: (target: HTMLElement | null) => boolean
}

/**
 * Reusable React Hook for automatic background hardware barcode scanner detection (Keyboard Wedge mode).
 * Works with fast typing scanners (Clabel, Honeywell, Zebra, 2D QR/bar readers) with or without Enter/Tab suffixes.
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  minLength = 3,
  maxKeystrokeIntervalMs = 75,
  debounceFlushMs = 80,
  isSearchOrScanInput
}: UseBarcodeScannerOptions) {
  const barcodeBufferRef = useRef<string>("")
  const lastKeyTimeRef = useRef<number>(0)
  const flushTimerRef = useRef<any>(null)
  const onScanRef = useRef(onScan)

  // Keep latest onScan callback without re-binding listener unnecessarily
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) return

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const now = Date.now()
      const elapsed = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now

      // Hardware scanners might end with Enter, Tab, or Nothing (suffix-less)
      if (e.key === "Enter" || e.key === "Tab") {
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
        const buffered = barcodeBufferRef.current.trim()
        barcodeBufferRef.current = ""

        if (buffered.length >= minLength) {
          const result = onScanRef.current(buffered)
          if (result !== false) {
            e.preventDefault()
            e.stopPropagation()
          }
        }
        return
      }

      // Ignore modifier keys (Shift, Alt, Control, Meta, CapsLock)
      if (e.key.length > 1) {
        return
      }

      // Scanner hardware sends characters in rapid succession (< 60ms)
      // If elapsed > maxKeystrokeIntervalMs, it's human typing — reset buffer with the new key
      if (elapsed > maxKeystrokeIntervalMs) {
        barcodeBufferRef.current = e.key
      } else {
        barcodeBufferRef.current += e.key
      }

      // Auto-flush debounce timer for suffix-less scanners
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
      }

      flushTimerRef.current = setTimeout(() => {
        const buffered = barcodeBufferRef.current.trim()
        if (buffered.length >= Math.max(minLength, 3)) {
          const result = onScanRef.current(buffered)
          if (result !== false) {
            barcodeBufferRef.current = ""
          }
        }
      }, debounceFlushMs)
    }

    window.addEventListener("keydown", handleGlobalKeyDown, true)
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true)
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }, [enabled, minLength, maxKeystrokeIntervalMs, debounceFlushMs, isSearchOrScanInput])

  return {
    clearBuffer: () => {
      barcodeBufferRef.current = ""
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }
}
