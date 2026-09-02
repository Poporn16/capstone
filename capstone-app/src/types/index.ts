export interface InventoryBatch {
  id: string
  batchLabel: string
  stock: number
  expiryDate: string
  cost: number
  price: number
  manufacturer?: string
}

export interface InventoryItem {
  id: string
  name: string
  category: string
  price: number
  cost: number
  stock: number
  minStock: number
  barcode: string
  manufacturer: string
  batches: InventoryBatch[]
}

export interface SaleItem {
  item: InventoryItem
  quantity: number
}

export interface Sale {
  id: string
  dbId?: string
  date: Date
  items: SaleItem[]
  grossTotal: number
  subtotal: number
  discount: number
  taxableBase: number
  vat: number
  total: number
  cashReceived: number
  change: number
  paymentMethod: "cash" | "other"
  onlineChannel?: string
  discountLabel: string
  customerName?: string
  processedBy: string
  isRefunded?: boolean
}

export interface NamedPerson {
  id: string
  idNumber: string
  name: string
  discountType?: string
}

export interface AuditLog {
  id: number
  created_at: string
  operator_username: string
  action_type: string
  module_target: string
  details_summary: string
}

export interface BatchSaleRecord {
  id: number
  sale_id: number
  item_name: string
  batch_label: string
  quantity_deducted: number
  unit_price: number
  created_at: string
}

export interface AccountProfile {
  id: number
  username: string
  password_hash: string
  display_name: string
  system_role: string
}

export interface SalesExportData {
  id: string
  date: Date | string
  customerName?: string
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
