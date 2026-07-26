// ============================================================================
// MASTER EXCEL STYLING SWITCH
// ============================================================================
// Set ENABLE_EXCEL_STYLING to:
//   true  => Enables rich custom pharmacy Excel styling (colors, fonts, borders, formulas)
//   false => Disables design styling, exporting plain standard Excel (.xlsx) files
// ============================================================================
export const ENABLE_EXCEL_STYLING = true

import * as XLSX from "xlsx"

export function downloadExcelWithAutoFit(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
  includeTotalRow = true
) {
  // Plain Excel export fallback when custom styling is disabled
  if (!ENABLE_EXCEL_STYLING) {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    const cleanSheetName = (sheetName || "Sheet1").replace(/[/\\?*:[\]]/g, "").slice(0, 30)
    XLSX.utils.book_append_sheet(wb, ws, cleanSheetName)
    const exportName = filename.endsWith(".xlsx") || filename.endsWith(".xls") ? filename : `${filename}.xlsx`
    XLSX.writeFile(wb, exportName)
    return
  }

  const escapeXml = (unsafe: string): string => {
    return String(unsafe ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  }

  // Calculate maximum character length for each column to auto-fit widths
  const colWidths = headers.map((header, colIndex) => {
    let maxLen = String(header || "").length
    rows.forEach(row => {
      const cellVal = String(row[colIndex] ?? "")
      if (cellVal.length > maxLen) {
        maxLen = cellVal.length
      }
    })
    return Math.min(Math.max(maxLen + 4, 14), 70)
  })

  // Detect numeric columns for TOTALS row formula
  const numericCols = headers.map((_, colIndex) => {
    if (rows.length === 0) return false
    return rows.every(row => {
      const val = row[colIndex]
      return val === "" || val === null || val === undefined || typeof val === "number" || (!isNaN(Number(val)) && typeof val !== "boolean")
    })
  })

  const startRow = 2
  const endRow = rows.length + 1

  let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>Malabon Pharmacy &amp; Clinic POS</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#799190"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#799190"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#799190"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#799190"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#1C2D2C"/>
   <Interior ss:Color="#89A1A0" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="TotalStyle">
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="CurrencyStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="&#34;&#8369;&#34;#,##0.00"/>
  </Style>
  <Style ss:ID="CurrencyTotalStyle">
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="&#34;&#8369;&#34;#,##0.00"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="NumberStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="NumberTotalStyle">
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(sheetName.replace(/[/\\?*:[\]]/g, ''))}">
  <Table>
   ${colWidths.map(w => `<Column ss:Width="${w * 8.5}"/>`).join("\n   ")}
   <Row ss:Height="22">
    ${headers.map(h => `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("\n    ")}
   </Row>`

  rows.forEach(row => {
    xml += `
   <Row ss:Height="18">
    ${row.map(val => {
      if (val === null || val === undefined || val === "") {
        return `<Cell/>`
      }
      const isNum = typeof val === "number"
      const typeStr = isNum ? "Number" : "String"
      const styleAttr = isNum ? 'ss:StyleID="CurrencyStyle"' : ''
      return `<Cell ${styleAttr}><Data ss:Type="${typeStr}">${escapeXml(String(val))}</Data></Cell>`
    }).join("\n    ")}
   </Row>`
  })

  if (includeTotalRow && rows.length > 0) {
    const hasAnyNumeric = numericCols.some(Boolean)
    if (hasAnyNumeric) {
      xml += `
   <Row ss:Height="22">
    <Cell ss:StyleID="TotalStyle"><Data ss:Type="String">TOTALS</Data></Cell>`
      for (let c = 1; c < headers.length; c++) {
        if (numericCols[c]) {
          xml += `\n    <Cell ss:StyleID="CurrencyTotalStyle" ss:Formula="=SUM(R${startRow}C${c + 1}:R${endRow}C${c + 1})"><Data ss:Type="Number">0</Data></Cell>`
        } else {
          xml += `\n    <Cell ss:StyleID="TotalStyle"/>`
        }
      }
      xml += `\n   </Row>`
    }
  }

  xml += `
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <DisplayGridlines/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>1</SplitHorizontal>
   <TopRowBottomPane>1</TopRowBottomPane>
   <ActivePane>2</ActivePane>
  </WorksheetOptions>
  <AutoFilter x:Range="R1C1:R${endRow}C${headers.length}" xmlns="urn:schemas-microsoft-com:office:excel"/>
 </Worksheet>
</Workbook>`

  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url

  const cleanFilename = filename.endsWith(".xls") || filename.endsWith(".xlsx") || filename.endsWith(".csv")
    ? filename.replace(/\.(csv|xls|xlsx)$/i, ".xls")
    : `${filename}.xls`

  link.setAttribute("download", cleanFilename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export interface SalesExportData {
  id: string
  date: Date | string
  processedBy: string
  paymentOption: string
  status: string
  itemsCount: number
  itemsSummaryTruncated: string
  subtotal: number
  discount: number
  vat: number
  grandTotal: number
  isRefunded: boolean
  lineItems: Array<{
    itemDescription: string
    category: string
    quantity: number
    unitPrice: number
    totalLinePrice: number
  }>
}

export function downloadMultiSheetSalesWorkbook(
  filename: string,
  sales: SalesExportData[]
) {
  const paymentMap = new Map<string, { count: number; total: number }>()
  const dailyMap = new Map<string, { count: number; total: number }>()
  const operatorMap = new Map<string, { completed: number; voided: number; total: number }>()

  let grandTotalSum = 0
  let totalTxCount = 0

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
    const isVoid = s.isRefunded || s.status === "Voided"
    const dateStr = typeof s.date === "string" 
      ? s.date 
      : new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) + ", " + new Date(s.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    
    const dayKey = typeof s.date === "string" 
      ? s.date.split(",")[0] 
      : new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })

    const amount = isVoid ? 0 : Number(s.grandTotal || 0)

    if (!isVoid) {
      grandTotalSum += amount
      totalTxCount += 1

      const pKey = s.paymentOption || "Cash"
      const pCurr = paymentMap.get(pKey) || { count: 0, total: 0 }
      paymentMap.set(pKey, { count: pCurr.count + 1, total: pCurr.total + amount })

      const dCurr = dailyMap.get(dayKey) || { count: 0, total: 0 }
      dailyMap.set(dayKey, { count: dCurr.count + 1, total: dCurr.total + amount })
    }

    const opKey = s.processedBy || "Unassigned"
    const opCurr = operatorMap.get(opKey) || { completed: 0, voided: 0, total: 0 }
    operatorMap.set(opKey, {
      completed: opCurr.completed + (isVoid ? 0 : 1),
      voided: opCurr.voided + (isVoid ? 1 : 0),
      total: opCurr.total + amount
    })

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

  const invoiceHeaders = ["Transaction ID", "Date & Time", "Operator", "Payment Option", "Status", "Total Items Count", "Items Summary", "Subtotal (PHP)", "Discount (PHP)", "VAT (PHP)", "Grand Total (PHP)"]
  const detailHeaders = ["Transaction ID", "Date & Time", "Item Description", "Category", "Quantity (pcs)", "Unit Price (PHP)", "Total Line Price (PHP)"]

  // Plain Excel export fallback when custom styling is disabled
  if (!ENABLE_EXCEL_STYLING) {
    const wb = XLSX.utils.book_new()

    // Sheet 1: Executive Dashboard Summary
    const summaryRows: any[][] = [
      ["Malabon Pharmacy & Clinic - Sales Executive Dashboard"],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ["1. Sales Volume by Payment Method"],
      ["Payment Option", "Completed Transactions", "Total Sales (PHP)", "% Revenue Share"]
    ]
    paymentMap.forEach((val, key) => {
      const share = grandTotalSum > 0 ? (val.total / grandTotalSum) * 100 : 0
      summaryRows.push([key, val.count, val.total, `${share.toFixed(1)}%`])
    })
    summaryRows.push(["TOTAL", totalTxCount, grandTotalSum, "100.0%"])
    summaryRows.push([])
    summaryRows.push(["2. Daily Sales Summary"])
    summaryRows.push(["Date", "Transaction Count", "Total Revenue (PHP)"])
    dailyMap.forEach((val, key) => {
      summaryRows.push([key, val.count, val.total])
    })
    summaryRows.push([])
    summaryRows.push(["3. Operator / Cashier Performance"])
    summaryRows.push(["Operator Username", "Completed Sales", "Voided Sales", "Generated Revenue (PHP)"])
    operatorMap.forEach((val, key) => {
      summaryRows.push([key, val.completed, val.voided, val.total])
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Executive Dashboard")

    // Sheet 2: Invoices Summary
    const invoiceRows: any[][] = [invoiceHeaders]
    sales.forEach(s => {
      const dateStr = typeof s.date === "string" ? s.date : new Date(s.date).toLocaleString()
      invoiceRows.push([
        `#${s.id}`,
        dateStr,
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invoiceRows), "Invoices Summary")

    // Sheet 3: Transaction Details
    const detailRows: any[][] = [detailHeaders]
    allLineItems.forEach(item => {
      detailRows.push([
        item.txId,
        item.dateTime,
        item.description,
        item.category,
        item.qty,
        item.unitPrice,
        item.totalPrice
      ])
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailRows), "Transaction Details")

    const exportName = filename.endsWith(".xlsx") || filename.endsWith(".xls") ? filename : `${filename}.xlsx`
    XLSX.writeFile(wb, exportName)
    return
  }

  const escapeXml = (unsafe: string): string => {
    return String(unsafe ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  }

  const invoiceWidths = [16, 22, 18, 16, 12, 16, 45, 16, 16, 16, 18]
  const detailWidths = [16, 22, 35, 18, 14, 16, 18]

  let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>Malabon Pharmacy &amp; Clinic POS</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Font ss:FontName="Segoe UI" ss:Size="14" ss:Bold="1" ss:Color="#1C2D2C"/>
  </Style>
  <Style ss:ID="SubTitleStyle">
   <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#586B6A"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#799190"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#799190"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#799190"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#799190"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#1C2D2C"/>
   <Interior ss:Color="#89A1A0" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="TotalStyle">
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="CurrencyStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="&#34;&#8369;&#34;#,##0.00"/>
  </Style>
  <Style ss:ID="CurrencyTotalStyle">
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="&#34;&#8369;&#34;#,##0.00"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="NumberStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="NumberTotalStyle">
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="VoidStyle">
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#9CA3AF" ss:Italic="1"/>
  </Style>
 </Styles>

 <!-- SHEET 1: Executive Dashboard -->
 <Worksheet ss:Name="Executive Dashboard">
  <Table>
   <Column ss:Width="180"/>
   <Column ss:Width="140"/>
   <Column ss:Width="160"/>
   <Column ss:Width="120"/>
   <Row ss:Height="24">
    <Cell ss:StyleID="TitleStyle"><Data ss:Type="String">Malabon Pharmacy &amp; Clinic - Sales Executive Dashboard</Data></Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:StyleID="SubTitleStyle"><Data ss:Type="String">Generated: ${new Date().toLocaleString()}</Data></Cell>
   </Row>
   <Row/>

   <!-- Sales by Payment Option -->
   <Row ss:Height="20">
    <Cell ss:StyleID="SubTitleStyle"><Data ss:Type="String">1. Sales Volume by Payment Method</Data></Cell>
   </Row>
   <Row ss:Height="20">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Payment Option</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Completed Transactions</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Total Sales (PHP)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">% Revenue Share</Data></Cell>
   </Row>`

  paymentMap.forEach((val, key) => {
    const share = grandTotalSum > 0 ? (val.total / grandTotalSum) * 100 : 0
    xml += `
   <Row>
    <Cell><Data ss:Type="String">${escapeXml(key)}</Data></Cell>
    <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${val.count}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${val.total.toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="NumberStyle"><Data ss:Type="String">${share.toFixed(1)}%</Data></Cell>
   </Row>`
  })

  xml += `
   <Row ss:Height="20">
    <Cell ss:StyleID="TotalStyle"><Data ss:Type="String">TOTAL</Data></Cell>
    <Cell ss:StyleID="NumberTotalStyle"><Data ss:Type="Number">${totalTxCount}</Data></Cell>
    <Cell ss:StyleID="CurrencyTotalStyle"><Data ss:Type="Number">${grandTotalSum.toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="NumberTotalStyle"><Data ss:Type="String">100.0%</Data></Cell>
   </Row>
   <Row/>

   <!-- Daily Sales Summary -->
   <Row ss:Height="20">
    <Cell ss:StyleID="SubTitleStyle"><Data ss:Type="String">2. Daily Sales Summary</Data></Cell>
   </Row>
   <Row ss:Height="20">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Date</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Transaction Count</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Total Revenue (PHP)</Data></Cell>
   </Row>`

  dailyMap.forEach((val, key) => {
    xml += `
   <Row>
    <Cell><Data ss:Type="String">${escapeXml(key)}</Data></Cell>
    <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${val.count}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${val.total.toFixed(2)}</Data></Cell>
   </Row>`
  })

  xml += `
   <Row/>

   <!-- Operator Breakdown -->
   <Row ss:Height="20">
    <Cell ss:StyleID="SubTitleStyle"><Data ss:Type="String">3. Operator / Cashier Performance</Data></Cell>
   </Row>
   <Row ss:Height="20">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Operator Username</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Completed Sales</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Voided Sales</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Generated Revenue (PHP)</Data></Cell>
   </Row>`

  operatorMap.forEach((val, key) => {
    xml += `
   <Row>
    <Cell><Data ss:Type="String">${escapeXml(key)}</Data></Cell>
    <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${val.completed}</Data></Cell>
    <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${val.voided}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${val.total.toFixed(2)}</Data></Cell>
   </Row>`
  })

  xml += `
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <DisplayGridlines/>
  </WorksheetOptions>
 </Worksheet>

 <!-- SHEET 2: Invoices Summary -->
 <Worksheet ss:Name="Invoices Summary">
  <Table>
   ${invoiceWidths.map(w => `<Column ss:Width="${w * 8.5}"/>`).join("\n   ")}
   <Row ss:Height="22">
    ${invoiceHeaders.map(h => `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("\n    ")}
   </Row>`

  const invStartRow = 2
  const invEndRow = sales.length + 1

  sales.forEach(s => {
    const isVoid = s.isRefunded || s.status === "Voided"
    const dateStr = typeof s.date === "string" 
      ? s.date 
      : new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) + ", " + new Date(s.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })

    xml += `
   <Row ss:Height="18">
    <Cell ${isVoid ? 'ss:StyleID="VoidStyle"' : ''}><Data ss:Type="String">#${escapeXml(s.id)}</Data></Cell>
    <Cell ${isVoid ? 'ss:StyleID="VoidStyle"' : ''}><Data ss:Type="String">${escapeXml(dateStr)}</Data></Cell>
    <Cell ${isVoid ? 'ss:StyleID="VoidStyle"' : ''}><Data ss:Type="String">${escapeXml(s.processedBy || "")}</Data></Cell>
    <Cell ${isVoid ? 'ss:StyleID="VoidStyle"' : ''}><Data ss:Type="String">${escapeXml(s.paymentOption || "Cash")}</Data></Cell>
    <Cell ${isVoid ? 'ss:StyleID="VoidStyle"' : ''}><Data ss:Type="String">${escapeXml(s.status || "Completed")}</Data></Cell>
    <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${s.itemsCount || 0}</Data></Cell>
    <Cell ${isVoid ? 'ss:StyleID="VoidStyle"' : ''}><Data ss:Type="String">${escapeXml(s.itemsSummaryTruncated || "")}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${Number(s.subtotal || 0).toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${Number(s.discount || 0).toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${Number(s.vat || 0).toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${Number(s.grandTotal || 0).toFixed(2)}</Data></Cell>
   </Row>`
  })

  xml += `
   <Row ss:Height="22">
    <Cell ss:StyleID="TotalStyle"><Data ss:Type="String">TOTALS</Data></Cell>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="NumberTotalStyle" ss:Formula="=SUM(R${invStartRow}C6:R${invEndRow}C6)"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="CurrencyTotalStyle" ss:Formula="=SUM(R${invStartRow}C8:R${invEndRow}C8)"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="CurrencyTotalStyle" ss:Formula="=SUM(R${invStartRow}C9:R${invEndRow}C9)"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="CurrencyTotalStyle" ss:Formula="=SUM(R${invStartRow}C10:R${invEndRow}C10)"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="CurrencyTotalStyle" ss:Formula="=SUM(R${invStartRow}C11:R${invEndRow}C11)"><Data ss:Type="Number">0</Data></Cell>
   </Row>
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <DisplayGridlines/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>1</SplitHorizontal>
   <TopRowBottomPane>1</TopRowBottomPane>
   <ActivePane>2</ActivePane>
  </WorksheetOptions>
  <AutoFilter x:Range="R1C1:R${invEndRow}C11" xmlns="urn:schemas-microsoft-com:office:excel"/>
 </Worksheet>

 <!-- SHEET 3: Transaction Details (Line Items) -->
 <Worksheet ss:Name="Transaction Details">
  <Table>
   ${detailWidths.map(w => `<Column ss:Width="${w * 8.5}"/>`).join("\n   ")}
   <Row ss:Height="22">
    ${detailHeaders.map(h => `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("\n    ")}
   </Row>`

  const detStartRow = 2
  const detEndRow = allLineItems.length + 1

  allLineItems.forEach(item => {
    xml += `
   <Row ss:Height="18">
    <Cell><Data ss:Type="String">${escapeXml(item.txId)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(item.dateTime)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(item.description)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(item.category)}</Data></Cell>
    <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${item.qty}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${item.unitPrice.toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${item.totalPrice.toFixed(2)}</Data></Cell>
   </Row>`
  })

  xml += `
   <Row ss:Height="22">
    <Cell ss:StyleID="TotalStyle"><Data ss:Type="String">TOTALS</Data></Cell>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="NumberTotalStyle" ss:Formula="=SUM(R${detStartRow}C5:R${detEndRow}C5)"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="CurrencyTotalStyle" ss:Formula="=SUM(R${detStartRow}C7:R${detEndRow}C7)"><Data ss:Type="Number">0</Data></Cell>
   </Row>
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <DisplayGridlines/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>1</SplitHorizontal>
   <TopRowBottomPane>1</TopRowBottomPane>
   <ActivePane>2</ActivePane>
  </WorksheetOptions>
  <AutoFilter x:Range="R1C1:R${detEndRow}C7" xmlns="urn:schemas-microsoft-com:office:excel"/>
 </Worksheet>
</Workbook>`

  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url

  const cleanFilename = filename.endsWith(".xls") || filename.endsWith(".xlsx") || filename.endsWith(".csv")
    ? filename.replace(/\.(csv|xls|xlsx)$/i, ".xls")
    : `${filename}.xls`

  link.setAttribute("download", cleanFilename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export interface StockAdditionExportGroup {
  id: string
  batch_tag: string
  summary_name: string
  total_items: number
  total_stock: number
  total_val: number
  created_at: string
  items: Array<{
    name: string
    label: string
    stock: number
    cost?: number
    price: number
  }>
}

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

  // Plain Excel export fallback when custom styling is disabled
  if (!ENABLE_EXCEL_STYLING) {
    const wb = XLSX.utils.book_new()

    // Sheet 1: Stock Additions Summary
    const summaryRows: any[][] = [
      ["Stock Additions & Import Summary Logs"],
      [`Exported: ${new Date().toLocaleString()}`],
      [],
      ["Batch Event Tag", "Addition Type", "Products Count", "Total Stock Units", "Total Valuation (PHP)", "Date & Time"]
    ]
    stockGroups.forEach(g => {
      const isBulk = g.batch_tag.toUpperCase().includes("BULK")
      summaryRows.push([
        g.batch_tag,
        isBulk ? "Bulk Spreadsheet Import" : "Single Manual Creation",
        g.total_items,
        g.total_stock,
        Number(g.total_val || 0),
        formatDateString(g.created_at)
      ])
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Stock Additions Summary")

    // Dedicated Sheet for Single Stock Creations
    const usedSheetNames = new Set<string>(["Stock Additions Summary"])
    let singleSheetName = "Single Stock Creations"
    usedSheetNames.add(singleSheetName)

    const singleRows: any[][] = [
      ["Batch Event Tag", "Product Name", "Batch Lot Label", "Stock Added (pcs)", "Retail Price (PHP)", "Total Value (PHP)", "Time & Date"]
    ]
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(singleRows), singleSheetName)

    // Dedicated Sheets for Each Bulk Import
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

      const bulkRows: any[][] = [
        ["Product Name", "Batch Lot Label", "Stock Added (pcs)", "Retail Price (PHP)", "Total Item Value (PHP)", "Time & Date"]
      ]
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
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bulkRows), cleanSheetName)
    })

    const exportName = filename.endsWith(".xlsx") || filename.endsWith(".xls") ? filename : `${filename}.xlsx`
    XLSX.writeFile(wb, exportName)
    return
  }

  const escapeXml = (unsafe: string): string => {
    return String(unsafe ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  }

  let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>Malabon Pharmacy &amp; Clinic POS</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Font ss:FontName="Segoe UI" ss:Size="13" ss:Bold="1" ss:Color="#1C2D2C"/>
  </Style>
  <Style ss:ID="SubTitleStyle">
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#586B6A"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#799190"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#799190"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#799190"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#799190"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#1C2D2C"/>
   <Interior ss:Color="#89A1A0" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="TotalStyle">
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="CurrencyStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="&#34;&#8369;&#34;#,##0.00"/>
  </Style>
  <Style ss:ID="CurrencyTotalStyle">
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="&#34;&#8369;&#34;#,##0.00"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="NumberStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="NumberTotalStyle">
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
 </Styles>

 <!-- SHEET 1: OVERVIEW SUMMARY SHEET -->
 <Worksheet ss:Name="Stock Additions Summary">
  <Table>
   <Column ss:Width="200"/>
   <Column ss:Width="160"/>
   <Column ss:Width="140"/>
   <Column ss:Width="140"/>
   <Column ss:Width="160"/>
   <Column ss:Width="180"/>
   <Row ss:Height="24">
    <Cell ss:StyleID="TitleStyle"><Data ss:Type="String">Stock Additions &amp; Import Summary Logs</Data></Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:StyleID="SubTitleStyle"><Data ss:Type="String">Exported: ${new Date().toLocaleString()}</Data></Cell>
   </Row>
   <Row/>
   <Row ss:Height="22">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Batch Event Tag</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Addition Type</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Products Count</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Total Stock Units</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Total Valuation (PHP)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Date &amp; Time</Data></Cell>
   </Row>`

  const startSumRow = 5
  let sumRowCount = 0

  stockGroups.forEach(g => {
    const isBulk = g.batch_tag.toUpperCase().includes("BULK")
    sumRowCount++
    xml += `
   <Row ss:Height="18">
    <Cell><Data ss:Type="String">${escapeXml(g.batch_tag)}</Data></Cell>
    <Cell><Data ss:Type="String">${isBulk ? "Bulk Spreadsheet Import" : "Single Manual Creation"}</Data></Cell>
    <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${g.total_items}</Data></Cell>
    <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${g.total_stock}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${Number(g.total_val || 0).toFixed(2)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(formatDateString(g.created_at))}</Data></Cell>
   </Row>`
  })

  const endSumRow = startSumRow + sumRowCount - 1
  if (sumRowCount > 0) {
    xml += `
   <Row ss:Height="22">
    <Cell ss:StyleID="TotalStyle"><Data ss:Type="String">TOTALS</Data></Cell>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="NumberTotalStyle" ss:Formula="=SUM(R${startSumRow}C3:R${endSumRow}C3)"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="NumberTotalStyle" ss:Formula="=SUM(R${startSumRow}C4:R${endSumRow}C4)"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="CurrencyTotalStyle" ss:Formula="=SUM(R${startSumRow}C5:R${endSumRow}C5)"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="TotalStyle"/>
   </Row>`
  }

  xml += `
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <DisplayGridlines/>
  </WorksheetOptions>
 </Worksheet>`

  // 2. DEDICATED SHEET FOR SINGLE STOCK CREATIONS
  const usedSheetNames = new Set<string>(["Stock Additions Summary"])
  let singleSheetName = "Single Stock Creations"
  usedSheetNames.add(singleSheetName)

  const singleStartRow = 2
  const singleEndRow = singleCreations.length + 1

  xml += `
 <Worksheet ss:Name="${escapeXml(singleSheetName)}">
  <Table>
   <Column ss:Width="160"/>
   <Column ss:Width="220"/>
   <Column ss:Width="160"/>
   <Column ss:Width="120"/>
   <Column ss:Width="140"/>
   <Column ss:Width="160"/>
   <Column ss:Width="180"/>
   <Row ss:Height="22">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Batch Event Tag</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Product Name</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Batch Lot Label</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Stock Added (pcs)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Retail Price (PHP)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Total Value (PHP)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Time &amp; Date</Data></Cell>
   </Row>`

  singleCreations.forEach(item => {
    xml += `
   <Row ss:Height="18">
    <Cell><Data ss:Type="String">${escapeXml(item.batchTag)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(item.name)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(item.label)}</Data></Cell>
    <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${item.stock}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${item.price.toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${item.totalVal.toFixed(2)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(formatDateString(item.createdAt))}</Data></Cell>
   </Row>`
  })

  if (singleCreations.length > 0) {
    xml += `
   <Row ss:Height="22">
    <Cell ss:StyleID="TotalStyle"><Data ss:Type="String">TOTALS</Data></Cell>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="NumberTotalStyle" ss:Formula="=SUM(R${singleStartRow}C4:R${singleEndRow}C4)"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="CurrencyTotalStyle" ss:Formula="=SUM(R${singleStartRow}C6:R${singleEndRow}C6)"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="TotalStyle"/>
   </Row>`
  }

  xml += `
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <DisplayGridlines/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>1</SplitHorizontal>
   <TopRowBottomPane>1</TopRowBottomPane>
   <ActivePane>2</ActivePane>
  </WorksheetOptions>
  <AutoFilter x:Range="R1C1:R${singleEndRow}C7" xmlns="urn:schemas-microsoft-com:office:excel"/>
 </Worksheet>`

  // 3. DEDICATED SHEETS FOR EACH BULK IMPORT
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

    const bulkStartRow = 2
    const bulkEndRow = bulk.items.length + 1

    xml += `
 <Worksheet ss:Name="${escapeXml(cleanSheetName)}">
  <Table>
   <Column ss:Width="220"/>
   <Column ss:Width="160"/>
   <Column ss:Width="120"/>
   <Column ss:Width="140"/>
   <Column ss:Width="160"/>
   <Column ss:Width="180"/>
   <Row ss:Height="22">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Product Name</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Batch Lot Label</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Stock Added (pcs)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Retail Price (PHP)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Total Item Value (PHP)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Time &amp; Date</Data></Cell>
   </Row>`

    bulk.items.forEach(item => {
      const lineVal = (Number(item.stock) || 0) * (Number(item.price) || 0)
      xml += `
   <Row ss:Height="18">
    <Cell><Data ss:Type="String">${escapeXml(item.name)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(item.label || "")}</Data></Cell>
    <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${Number(item.stock) || 0}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${Number(item.price || 0).toFixed(2)}</Data></Cell>
    <Cell ss:StyleID="CurrencyStyle"><Data ss:Type="Number">${lineVal.toFixed(2)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(formatDateString(bulk.created_at))}</Data></Cell>
   </Row>`
    })

    if (bulk.items.length > 0) {
      xml += `
   <Row ss:Height="22">
    <Cell ss:StyleID="TotalStyle"><Data ss:Type="String">TOTALS</Data></Cell>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="NumberTotalStyle" ss:Formula="=SUM(R${bulkStartRow}C3:R${bulkEndRow}C3)"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="TotalStyle"/>
    <Cell ss:StyleID="CurrencyTotalStyle" ss:Formula="=SUM(R${bulkStartRow}C5:R${bulkEndRow}C5)"><Data ss:Type="Number">0</Data></Cell>
    <Cell ss:StyleID="TotalStyle"/>
   </Row>`
    }

    xml += `
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <DisplayGridlines/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>1</SplitHorizontal>
   <TopRowBottomPane>1</TopRowBottomPane>
   <ActivePane>2</ActivePane>
  </WorksheetOptions>
  <AutoFilter x:Range="R1C1:R${bulkEndRow}C6" xmlns="urn:schemas-microsoft-com:office:excel"/>
 </Worksheet>`
  })

  xml += `\n</Workbook>`

  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url

  const cleanFilename = filename.endsWith(".xls") || filename.endsWith(".xlsx") || filename.endsWith(".csv")
    ? filename.replace(/\.(csv|xls|xlsx)$/i, ".xls")
    : `${filename}.xls`

  link.setAttribute("download", cleanFilename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
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
