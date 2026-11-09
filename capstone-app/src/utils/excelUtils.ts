import * as XLSX from "xlsx"
import type { SalesExportData, StockAdditionExportGroup } from "../types"

export { type SalesExportData, type StockAdditionExportGroup }

function autoFitColumns(headers: string[], rows: (string | number)[][]): XLSX.ColInfo[] {
  return headers.map((header, colIndex) => {
    let maxLen = String(header || "").length
    rows.forEach(row => {
      const cellVal = String(row[colIndex] ?? "")
      if (cellVal.length > maxLen) {
        maxLen = cellVal.length
      }
    })
    return { wch: Math.min(Math.max(maxLen + 4, 14), 70) }
  })
}

/**
 * Downloads a regular, standard Excel (.xlsx) file without custom design or XML styling.
 */
export function downloadExcelWithAutoFit(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
  includeTotalRow = true
) {
  const exportRows: (string | number)[][] = [headers, ...rows]

  if (includeTotalRow && rows.length > 0) {
    const numericCols = headers.map((_, colIndex) => {
      return rows.every(row => {
        const val = row[colIndex]
        return val === "" || val === null || val === undefined || typeof val === "number" || (!isNaN(Number(val)) && typeof val !== "boolean")
      })
    })

    if (numericCols.some(Boolean)) {
      const totalRow: (string | number)[] = headers.map((_, colIndex) => {
        if (colIndex === 0) return "TOTALS"
        if (numericCols[colIndex]) {
          const sum = rows.reduce((acc, row) => {
            const num = Number(row[colIndex])
            return acc + (isNaN(num) ? 0 : num)
          }, 0)
          return Math.round(sum * 100) / 100
        }
        return ""
      })
      exportRows.push(totalRow)
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(exportRows)
  ws["!cols"] = autoFitColumns(headers, rows)
  if (rows.length > 0) {
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) }
  }

  const wb = XLSX.utils.book_new()
  const cleanName = (sheetName || "Sheet1").replace(/[/\\?*:[\]]/g, "").slice(0, 30)
  XLSX.utils.book_append_sheet(wb, ws, cleanName)
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}

/**
 * Downloads a regular multi-sheet Sales workbook without custom design or XML styling.
 */
export function downloadMultiSheetSalesWorkbook(
  filename: string,
  sales: SalesExportData[]
) {
  const allLineItems: Array<{
    txId: string
    dateTime: string
    description: string
    category: string
    qty: number
    unitPrice: number
    totalPrice: number
  }> = []

  sales.forEach(s => {
    const dateStr = typeof s.date === "string"
      ? s.date
      : new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) + ", " + new Date(s.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })

    s.lineItems.forEach(item => {
      allLineItems.push({
        txId: `#${s.id}`,
        dateTime: dateStr,
        description: item.itemDescription,
        category: item.category || "General",
        qty: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalLinePrice
      })
    })
  })

  const wb = XLSX.utils.book_new()

  // Sheet 1: Invoices Summary
  const invoiceHeaders = ["Transaction ID", "Date & Time", "Customer / Walk-In", "Operator", "Payment Option", "Status", "Total Items Count", "Items Summary", "Subtotal (PHP)", "Discount (PHP)", "VAT (PHP)", "Grand Total (PHP)"]
  const invoiceRows: any[][] = [invoiceHeaders]
  sales.forEach(s => {
    const dateStr = typeof s.date === "string" ? s.date : new Date(s.date).toLocaleString()
    invoiceRows.push([
      `#${s.id}`,
      dateStr,
      s.customerName || "Walk-in Customer",
      s.processedBy || "",
      s.paymentOption || "Cash",
      s.status || "Completed",
      s.itemsCount || 0,
      s.itemsSummaryTruncated || "",
      Number(s.subtotal || 0),
      Number(s.discount || 0),
      Number(s.vat || 0),
      Number(s.grandTotal || 0)
    ])
  })
  const wsInvoices = XLSX.utils.aoa_to_sheet(invoiceRows)
  wsInvoices["!cols"] = autoFitColumns(invoiceHeaders, invoiceRows.slice(1))
  if (sales.length > 0) {
    wsInvoices["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sales.length, c: invoiceHeaders.length - 1 } }) }
  }
  XLSX.utils.book_append_sheet(wb, wsInvoices, "Invoices Summary")

  // Sheet 2: Transaction Details
  const detailHeaders = ["Transaction ID", "Date & Time", "Item Description", "Category", "Quantity (pcs)", "Unit Price (PHP)", "Total Line Price (PHP)"]
  const detailRows: any[][] = [detailHeaders]
  allLineItems.forEach(item => {
    detailRows.push([item.txId, item.dateTime, item.description, item.category, item.qty, item.unitPrice, item.totalPrice])
  })
  const wsDetails = XLSX.utils.aoa_to_sheet(detailRows)
  wsDetails["!cols"] = autoFitColumns(detailHeaders, detailRows.slice(1))
  if (allLineItems.length > 0) {
    wsDetails["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: allLineItems.length, c: detailHeaders.length - 1 } }) }
  }
  XLSX.utils.book_append_sheet(wb, wsDetails, "Transaction Details")

  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}

/**
 * Downloads a regular multi-sheet Stock Additions workbook without custom design or XML styling.
 */
export function downloadMultiSheetStockAdditionsWorkbook(
  filename: string,
  stockGroups: StockAdditionExportGroup[]
) {
  const formatDateString = (dateStr: string) => {
    if (!dateStr) return "N/A"
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) + ", " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    } catch {
      return dateStr
    }
  }

  const bulkImports: StockAdditionExportGroup[] = []
  const singleCreations: Array<{
    batchTag: string
    name: string
    label: string
    stock: number
    price: number
    totalVal: number
    createdAt: string
  }> = []

  stockGroups.forEach(group => {
    const isBulk = group.batch_tag.toUpperCase().includes("BULK")
    if (isBulk) {
      bulkImports.push(group)
    } else {
      group.items.forEach(item => {
        singleCreations.push({
          batchTag: group.batch_tag,
          name: item.name,
          label: item.label || "",
          stock: Number(item.stock) || 0,
          price: Number(item.price) || 0,
          totalVal: (Number(item.stock) || 0) * (Number(item.price) || 0),
          createdAt: group.created_at
        })
      })
    }
  })

  const wb = XLSX.utils.book_new()

  // Sheet 1: Stock Additions Summary
  const sumHeaders = ["Batch Event Tag", "Addition Type", "Products Count", "Total Stock Units", "Total Valuation (PHP)", "Date & Time"]
  const sumRows: any[][] = [sumHeaders]
  stockGroups.forEach(g => {
    const isBulk = g.batch_tag.toUpperCase().includes("BULK")
    sumRows.push([
      g.batch_tag,
      isBulk ? "Bulk Spreadsheet Import" : "Single Manual Creation",
      g.total_items,
      g.total_stock,
      Number(g.total_val || 0),
      formatDateString(g.created_at)
    ])
  })
  const wsSum = XLSX.utils.aoa_to_sheet(sumRows)
  wsSum["!cols"] = autoFitColumns(sumHeaders, sumRows.slice(1))
  if (stockGroups.length > 0) {
    wsSum["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: stockGroups.length, c: sumHeaders.length - 1 } }) }
  }
  XLSX.utils.book_append_sheet(wb, wsSum, "Stock Additions Summary")

  // Sheet 2: Single Stock Creations
  const singleHeaders = ["Batch Event Tag", "Product Name", "Batch Lot Label", "Stock Added (pcs)", "Retail Price (PHP)", "Total Value (PHP)", "Time & Date"]
  const singleRows: any[][] = [singleHeaders]
  singleCreations.forEach(item => {
    singleRows.push([
      item.batchTag,
      item.name,
      item.label,
      item.stock,
      item.price,
      item.totalVal,
      formatDateString(item.createdAt)
    ])
  })
  const wsSingle = XLSX.utils.aoa_to_sheet(singleRows)
  wsSingle["!cols"] = autoFitColumns(singleHeaders, singleRows.slice(1))
  if (singleCreations.length > 0) {
    wsSingle["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: singleCreations.length, c: singleHeaders.length - 1 } }) }
  }
  XLSX.utils.book_append_sheet(wb, wsSingle, "Single Stock Creations")

  // Bulk Import Sheets
  const usedSheetNames = new Set<string>(["Stock Additions Summary", "Single Stock Creations"])
  bulkImports.forEach((bulk, index) => {
    let rawSheetName = `Bulk Import ${index + 1}`
    const matchTime = bulk.batch_tag.match(/\((.*?)\)/)
    if (matchTime && matchTime[1]) {
      const shortTime = matchTime[1].split(" ")[1] || matchTime[1]
      rawSheetName = `Bulk Import ${index + 1} (${shortTime})`
    }
    let cleanSheetName = rawSheetName.replace(/[/\\?*:[\]]/g, "").slice(0, 30)
    let suffix = 1
    while (usedSheetNames.has(cleanSheetName)) {
      cleanSheetName = `${rawSheetName.slice(0, 26)}_${suffix}`
      suffix++
    }
    usedSheetNames.add(cleanSheetName)

    const bulkHeaders = ["Product Name", "Batch Lot Label", "Stock Added (pcs)", "Retail Price (PHP)", "Total Item Value (PHP)", "Time & Date"]
    const bulkRows: any[][] = [bulkHeaders]
    bulk.items.forEach(item => {
      const lineVal = (Number(item.stock) || 0) * (Number(item.price) || 0)
      bulkRows.push([
        item.name,
        item.label || "",
        Number(item.stock) || 0,
        Number(item.price || 0),
        lineVal,
        formatDateString(bulk.created_at)
      ])
    })
    const wsBulk = XLSX.utils.aoa_to_sheet(bulkRows)
    wsBulk["!cols"] = autoFitColumns(bulkHeaders, bulkRows.slice(1))
    if (bulk.items.length > 0) {
      wsBulk["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: bulk.items.length, c: bulkHeaders.length - 1 } }) }
    }
    XLSX.utils.book_append_sheet(wb, wsBulk, cleanSheetName)
  })

  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}

/**
 * Universal Excel & CSV file parser.
 * Supports: .xlsx, .xls, .csv, .tsv, .ods, .xml, .xlsm, .xlsb, .txt
 * Returns 2D array of trimmed string values: string[][]
 */
export async function parseSpreadsheetFile(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true })
        const firstSheetName = workbook.SheetNames[0]
        if (!firstSheetName) {
          resolve([])
          return
        }
        const sheet = workbook.Sheets[firstSheetName]
        const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          blankrows: false,
          raw: false
        })
        const stringRows: string[][] = rawRows.map(row =>
          (Array.isArray(row) ? row : []).map(cell => String(cell ?? "").trim())
        )
        resolve(stringRows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = (err) => reject(err)
    reader.readAsArrayBuffer(file)
  })
}
