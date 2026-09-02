import { useState, useMemo } from "react"
import { Printer, Download, X, Search, CheckSquare, Square, Barcode as BarcodeIcon, Tag, Info } from "lucide-react"
import { generateBarcodeDataUrl, formatExcelBarcodeFontCode } from "../utils/barcodeGenerator"
import { downloadExcelWithAutoFit } from "../utils/excelUtils"
import type { InventoryItem } from "../types"

interface BarcodePrintModalProps {
  isOpen: boolean
  onClose: () => void
  inventory: InventoryItem[]
}

interface PrintableLabelItem {
  id: string
  itemId: number
  name: string
  barcode: string
  category: string
  manufacturer: string
  price: number
  batchLabel?: string
  stock: number
  expiryDate?: string
}

export function BarcodePrintModal({ isOpen, onClose, inventory }: BarcodePrintModalProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [copiesPerItem, setCopiesPerItem] = useState<number>(1)
  const [labelSize, setLabelSize] = useState<"standard" | "compact" | "large">("standard")

  // Flatten items and active batches into printable label units
  const allPrintableItems: PrintableLabelItem[] = useMemo(() => {
    const list: PrintableLabelItem[] = []
    inventory.forEach(item => {
      const barcodeStr = String(item.barcode || "").trim()
      if (!barcodeStr) return

      if (item.batches && item.batches.length > 0) {
        item.batches.forEach(b => {
          list.push({
            id: `${item.id}_${b.id || b.batchLabel}`,
            itemId: item.id,
            name: item.name,
            barcode: barcodeStr,
            category: item.category || "General",
            manufacturer: b.manufacturer || item.manufacturer || "",
            price: b.price || item.price || 0,
            batchLabel: b.batchLabel,
            stock: b.stock || 0,
            expiryDate: b.expiryDate
          })
        })
      } else {
        list.push({
          id: `${item.id}_single`,
          itemId: item.id,
          name: item.name,
          barcode: barcodeStr,
          category: item.category || "General",
          manufacturer: item.manufacturer || "",
          price: item.price || 0,
          stock: item.stock || 0
        })
      }
    })
    return list
  }, [inventory])

  // Filtered by user search
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return allPrintableItems
    return allPrintableItems.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.barcode.toLowerCase().includes(q) ||
      item.manufacturer.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    )
  }, [allPrintableItems, searchQuery])

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(filteredItems.map(i => i.id)))
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
  }

  // Items chosen for printing / export
  const activeItemsToPrint = useMemo(() => {
    if (selectedIds.size === 0) return filteredItems
    return allPrintableItems.filter(i => selectedIds.has(i.id))
  }, [selectedIds, filteredItems, allPrintableItems])

  // Handle native browser print
  const handlePrint = () => {
    window.print()
  }

  // Handle Excel Barcode export
  const handleDownloadExcelBarcodes = () => {
    const headers = [
      "Barcode Number",
      "Barcode Lines (Font: Libre Barcode 39/128)",
      "Product Name",
      "Manufacturer Brand",
      "Retail Price (PHP)",
      "Category",
      "Batch Label",
      "Stock Quantity",
      "Expiry Date"
    ]

    const rows: (string | number)[][] = activeItemsToPrint.map(item => [
      item.barcode,
      formatExcelBarcodeFontCode(item.barcode),
      item.name,
      item.manufacturer || "",
      `₱${item.price.toFixed(2)}`,
      item.category || "",
      item.batchLabel || "",
      item.stock || "",
      item.expiryDate || ""
    ])

    downloadExcelWithAutoFit(
      "inventory_scannable_barcodes",
      "Barcode Labels",
      headers,
      rows,
      false
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        
        {/* Header (Hidden when printing) */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/90 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <BarcodeIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Print & Export Barcode Labels</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Generate scannable Code-128 barcode stickers or export Excel sheet with barcode lines</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Controls & Filters (Hidden when printing) */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search products or barcodes to print..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={selectedIds.size === filteredItems.length && filteredItems.length > 0 ? deselectAll : selectAll}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
              <span>{selectedIds.size === 0 ? "Select All" : `Selected (${selectedIds.size})`}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Size:</span>
              <select
                value={labelSize}
                onChange={e => setLabelSize(e.target.value as any)}
                className="bg-transparent text-slate-900 dark:text-white font-bold focus:outline-none cursor-pointer"
              >
                <option value="compact">Compact (Roll)</option>
                <option value="standard">Standard (A4 / 3-Col)</option>
                <option value="large">Large (Display)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleDownloadExcelBarcodes}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              title="Download Excel Sheet with Barcode Font Codes"
            >
              <Download className="w-4 h-4" />
              <span>Download Excel</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              title="Print Barcode Labels"
            >
              <Printer className="w-4 h-4" />
              <span>Print Labels</span>
            </button>
          </div>
        </div>

        {/* Excel Font Tip Banner (Hidden when printing) */}
        <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200 print:hidden">
          <Info className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Excel Tip:</strong> In Excel, highlight the <em>"Barcode Lines"</em> column and change its font to <strong>Libre Barcode 39</strong> or <strong>Code 39</strong> to display full scannable barcode lines directly in Excel!
          </span>
        </div>

        {/* Printable Barcode Sheet Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-950 print:bg-white print:p-0">
          <div className="max-w-4xl mx-auto">
            <div className={`grid gap-3 ${
              labelSize === "compact"
                ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-4"
                : labelSize === "large"
                  ? "grid-cols-1 sm:grid-cols-2 print:grid-cols-2"
                  : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 print:grid-cols-3"
            }`}>
              {activeItemsToPrint.map(item => {
                const isSelected = selectedIds.has(item.id)
                const barcodeDataUrl = generateBarcodeDataUrl(item.barcode, {
                  height: labelSize === "compact" ? 40 : 52,
                  moduleWidth: labelSize === "compact" ? 1.6 : 2,
                  includeText: true,
                  label: item.name,
                  price: item.price,
                  manufacturer: item.manufacturer
                })

                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    className={`bg-white text-slate-900 p-3.5 rounded-xl border-2 transition-all flex flex-col items-center justify-between text-center relative cursor-pointer shadow-xs print:shadow-none print:border-slate-300 print:rounded-none print:m-0 print:p-2 ${
                      isSelected
                        ? "border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/10"
                        : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {/* Header info */}
                    <div className="w-full flex items-center justify-between gap-1 text-[10px] font-bold text-slate-600 mb-1">
                      <span className="truncate max-w-[120px] uppercase text-blue-600">{item.category}</span>
                      {item.manufacturer && (
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono text-[9px] truncate max-w-[90px]">
                          {item.manufacturer}
                        </span>
                      )}
                    </div>

                    {/* Product Name */}
                    <div className="font-extrabold text-xs text-slate-900 leading-tight my-1 line-clamp-2 w-full text-center">
                      {item.name}
                    </div>

                    {/* Scannable Barcode SVG */}
                    <div className="my-1.5 flex items-center justify-center w-full bg-white p-1">
                      {barcodeDataUrl ? (
                        <img
                          src={barcodeDataUrl}
                          alt={`Barcode ${item.barcode}`}
                          className="max-h-20 w-auto object-contain mx-auto"
                        />
                      ) : (
                        <div className="font-mono text-xs font-bold text-slate-400">Invalid Barcode</div>
                      )}
                    </div>

                    {/* Footer / Price & Batch */}
                    <div className="w-full flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-100 font-mono">
                      <span className="text-slate-400">{item.batchLabel || "STD"}</span>
                      <span className="font-extrabold text-blue-600 text-xs">₱{item.price.toFixed(2)}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {activeItemsToPrint.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Tag className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="font-bold text-sm">No items found to print</p>
                <p className="text-xs">Ensure products have valid barcodes entered in the inventory.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer (Hidden when printing) */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 print:hidden">
          <span>Ready to print <strong>{activeItemsToPrint.length}</strong> scannable barcode labels</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Barcode Sheet</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
