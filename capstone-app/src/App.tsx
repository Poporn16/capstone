import { useState, useEffect } from "react"
import { LayoutDashboard, ShoppingCart, Package, Sliders, History, LogOut, ShieldAlert } from "lucide-react"
import { Dashboard } from "./components/Dashboard"
import { POSCheckout } from "./components/POSCheckout"
import { InventoryManager } from "./components/InventoryManager"
import { StockAdjustment } from "./components/StockAdjustment"
import { SalesHistory } from "./components/SalesHistory"
import { AdminPanel } from "./components/AdminPanel"
import { LoginScreen } from "./components/LoginScreen"
import { supabase } from "./components/apiClient"

export interface InventoryBatch {
  id: string
  batchLabel: string
  stock: number
  expiryDate: string
  cost: number
  price: number
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
  manufacturer?: string
  batches: InventoryBatch[]
}

export interface Sale {
  id: string
  date: Date
  items: { item: InventoryItem, quantity: number }[]
  grossTotal: number
  subtotal: number
  discount: number
  taxableBase: number
  vat: number
  total: number
  cashReceived: number
  change: number
  paymentMethod: "cash" | "gcash"
  discountLabel: string
  processedBy: string
  isRefunded?: boolean
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard")
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [categoriesList, setCategoriesList] = useState<string[]>([])
  const [currentOperator, setCurrentOperator] = useState<{ username: string; displayName: string; systemRole: string } | null>(null)

  useEffect(() => {
    if (currentOperator) {
      fetchCategories()
      fetchInventory()
      fetchSales()
    }

    const handleRealtimeRefresh = () => {
      fetchInventory()
      fetchSales()
    }

    window.addEventListener("refresh_sales_data", handleRealtimeRefresh)
    return () => {
      window.removeEventListener("refresh_sales_data", handleRealtimeRefresh)
    }
  }, [currentOperator])

  const logSystemAction = async (actionType: string, moduleTarget: string, details: string) => {
    const operatorName = currentOperator ? currentOperator.username : "admin"
    
    const { error } = await supabase.from("system_audit_logs").insert({
      operator_username: operatorName,
      action_type: actionType,
      module_target: moduleTarget,
      details_summary: details
    })

    if (error) {
      console.error("Audit log insert failed:", error.message)
    }
  }

  const fetchCategories = async () => {
    const { data } = await supabase.from("product_categories").select("name")
    if (data) {
      const rawNames = data.map(c => c.name)
      const remainingCategories = rawNames.filter(c => c !== "unmarked category").sort()
      setCategoriesList(["unmarked category", ...remainingCategories])
    }
  }

  const fetchInventory = async () => {
    const { data: items } = await supabase.from('inventory').select()
    const { data: batches } = await supabase.from('inventory_batches').select().order('expiry_date', { ascending: true })
    
    const formattedData = items?.map(item => {
      const itemBatches = batches?.filter(b => String(b.item_id) === String(item.id)).map(b => ({
        id: String(b.id),
        batchLabel: b.batch_label,
        stock: Math.floor(Number(b.stock)) || 0,
        expiryDate: b.expiry_date || "",
        cost: Number(b.cost) || 0,
        price: Number(b.price) || 0
      })) || []
      
      const totalStock = itemBatches.reduce((sum, b) => sum + b.stock, 0)

      const activeBatchWithPrice = itemBatches.find(b => b.stock > 0 && b.price > 0) || itemBatches[0]
      const effectivePrice = activeBatchWithPrice ? activeBatchWithPrice.price : (Number(item.price) || 0)
      const effectiveCost = activeBatchWithPrice ? activeBatchWithPrice.cost : (Number(item.cost) || 0)

      return {
        id: String(item.id),
        name: item.name,
        category: item.category || "unmarked category",
        price: effectivePrice,
        cost: effectiveCost,
        stock: totalStock, 
        minStock: Math.floor(Number(item.min_stock)) || 0,
        barcode: item.barcode,
        manufacturer: item.manufacturer || "",
        batches: itemBatches
      }
    }) || []
    
    setInventory(formattedData)
  }

  const fetchSales = async () => {
    // 1. Fetch sales master records directly
    const { data: salesData, error: salesErr } = await supabase
      .from('sales')
      .select('*')
      .order('id', { ascending: false })

    if (salesErr) {
      console.error("Error fetching sales:", salesErr.message)
      return
    }

    // 2. Fetch sale items and inventory separately
    const { data: saleItemsData } = await supabase.from('sale_items').select('*')
    const { data: inventoryData } = await supabase.from('inventory').select('*')

    const formattedSales: Sale[] = salesData?.map((sale: any) => {
      // Find items belonging to this sale
      const matchingSaleItems = saleItemsData?.filter(si => String(si.sale_id) === String(sale.id)) || []

      const items = matchingSaleItems.map(si => {
        const inv = inventoryData?.find(inv => String(inv.id) === String(si.item_id))
        return {
          quantity: Math.floor(Number(si.quantity)) || 1,
          item: {
            id: String(si.item_id || 0),
            name: inv?.name || "Product Item",
            category: inv?.category || "Uncategorized",
            price: Number(inv?.price) || 0,
            cost: Number(inv?.cost) || 0,
            stock: 0,
            minStock: Number(inv?.min_stock) || 0,
            barcode: inv?.barcode || "",
            batches: []
          }
        }
      })

      return {
        id: String(sale.id),
        date: new Date(sale.date || sale.created_at || Date.now()),
        items: items, // Added missing required property
        grossTotal: Number(sale.gross_total) || Number(sale.total) || 0,
        subtotal: Number(sale.subtotal) || Number(sale.total) || 0,
        discount: Number(sale.discount) || 0,
        taxableBase: Number(sale.taxable_base) || Number(sale.total) || 0,
        vat: Number(sale.vat) || 0,
        total: Number(sale.total) || 0,
        cashReceived: Number(sale.cash_received) || 0,
        change: Number(sale.change) || 0,
        paymentMethod: (sale.payment_method || "cash").toLowerCase() as "cash" | "gcash",
        discountLabel: sale.discount_label || "NONE",
        processedBy: sale.processed_by || "admin",
        isRefunded: Boolean(sale.is_refunded)
      }
    }) || []

    setSales(formattedSales)
  }

  const addSale = async (sale: Sale) => {
    if (!currentOperator) return

    const { data: newSale, error: saleError } = await supabase
      .from('sales')
      .insert({
        date: sale.date.toISOString(),
        total: sale.total,
        payment_method: sale.paymentMethod,
        senior_discount: sale.discountLabel.includes("SENIOR"),
        is_refunded: false,
        gross_total: sale.grossTotal,
        subtotal: sale.subtotal,
        discount: sale.discount,
        taxable_base: sale.taxableBase,
        vat: sale.vat,
        cash_received: sale.cashReceived,
        change: sale.change,
        discount_label: sale.discountLabel,
        processed_by: currentOperator.username
      })
      .select('id')
      .single()

    if (saleError || !newSale) return

    const saleItems = sale.items.map(si => ({
      sale_id: Number(newSale.id),
      item_id: Number(si.item.id),
      quantity: Math.floor(si.quantity)
    }))
    await supabase.from('sale_items').insert(saleItems)

    for (const si of sale.items) {
      let neededQty = Math.floor(si.quantity)
      const { data: targetBatches } = await supabase
        .from('inventory_batches')
        .select()
        .eq('item_id', Number(si.item.id))
        .order('expiry_date', { ascending: true })

      if (targetBatches) {
        for (const batch of targetBatches) {
          if (neededQty <= 0) break
          const currentBatchStock = Math.floor(batch.stock)
          if (currentBatchStock > 0) {
            const qtyDeducted = Math.min(neededQty, currentBatchStock)
            
            await supabase.from('sale_item_batches').insert({
              sale_id: Number(newSale.id),
              item_name: si.item.name,
              batch_label: batch.batch_label,
              quantity_deducted: qtyDeducted,
              unit_price: Number(batch.price) || Number(si.item.price) || 0
            })

            if (currentBatchStock > neededQty) {
              await supabase.from('inventory_batches').update({ stock: currentBatchStock - neededQty }).eq('id', batch.id)
              neededQty = 0
            } else {
              neededQty -= currentBatchStock
              await supabase.from('inventory_batches').delete().eq('id', batch.id)
            }
          }
        }
      }
    }

    await logSystemAction("CREATE_SALE", "POS_CHECKOUT", `Processed transaction #${newSale.id} totaling ₱${sale.total.toFixed(2)} using ${sale.paymentMethod.toUpperCase()}`)
    fetchInventory()
    fetchSales()
  }

  const updateInventoryItem = async (item: InventoryItem) => {
    const payload: any = {
      name: item.name,
      category: item.category,
      min_stock: Math.floor(Number(item.minStock)) || 10,
      barcode: item.barcode,
      manufacturer: item.manufacturer || null
    }

    if (item.id && item.id.trim() !== "") {
      await supabase.from('inventory').update(payload).eq('id', Number(item.id))
      await logSystemAction("UPDATE_PRODUCT", "ITEM_SPECIFICATIONS", `Modified product specifications for "${item.name}" (Barcode: ${item.barcode})`)
    } else {
      await supabase.from('inventory').insert(payload)
      await logSystemAction("CREATE_PRODUCT", "ITEM_SPECIFICATIONS", `Registered new product definition for "${item.name}" (Barcode: ${item.barcode})`)
    }
    fetchInventory()
  }

  const deleteInventoryItem = async (id: string) => {
    const item = inventory.find(i => i.id === id)
    if (!item || !window.confirm("Delete this product template completely?")) return
    await supabase.from('inventory').delete().eq('id', Number(id))
    await logSystemAction("DELETE_PRODUCT", "ITEM_SPECIFICATIONS", `Deleted product profile template for "${item.name}"`)
    fetchInventory()
  }

  const handleToggleRefund = async (id: string, status: boolean) => {
    await supabase.from('sales').update({ is_refunded: !status }).eq('id', Number(id))
    const actionLabel = status ? "REVERT_VOID" : "VOID_TRANSACTION"
    await logSystemAction(actionLabel, "SALES_HISTORY", `Changed invoice status row #${id} to ${!status ? 'VOIDED' : 'COMPLETED'}`)
    fetchInventory()
    fetchSales()
  }

  if (!currentOperator) {
    return (
      <LoginScreen
        onAuthSuccess={async (operator: any) => {
          setCurrentOperator(operator)

          if (operator.systemRole === "admin") {
            setActiveTab("admin_control")
          } else {
            setActiveTab("dashboard")
          }

          await supabase.from("system_audit_logs").insert({
            operator_username: operator.username,
            action_type: "SESSION_LOGIN",
            module_target: "AUTHENTICATION Portal",
            details_summary: `User terminal log-in verification session authorized successfully.`
          })
        }}
      />
    )
  }

  const navigationTabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "pos", label: "POS Checkout", icon: ShoppingCart },
    { id: "inventory", label: "Item Specifications", icon: Package },
    { id: "stock_adjust", label: "Inventory", icon: Sliders }, 
    { id: "history", label: "Sales History", icon: History },
  ]

  if (currentOperator.systemRole === "admin") {
    navigationTabs.push({ id: "admin_control", label: "Admin Panel", icon: ShieldAlert })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img 
                src="https://scontent.fmnl33-4.fna.fbcdn.net/v/t39.30808-6/401504104_122095038878121591_4438502913040853748_n.jpg?stp=dst-jpg_tt6&cstp=mx411x390&ctp=s411x390&_nc_cat=106&ccb=1-7&_nc_sid=6ee11a&_nc_ohc=OAvw0FXl_VoQ7kNvwHstYTv&_nc_oc=Adqj1kOXBM2s7duawflc5sv4jZBMQ9sRcfFj48udvMHTKk442l_Jef-L4C0e0TsKRbsOTRWx3X0nP8jYscL_RV0t&_nc_zt=23&_nc_ht=scontent.fmnl33-4.fna&_nc_gid=FUUM0mCkdj0gg6kxt7ZDsw&_nc_ss=7b289&oh=00_AQDViRkSBwjzENhANdCtluESuiSTujHdKczu-fqk41CJHA&oe=6A64F4B5" 
                alt="Malabon Pharmacy Logo" 
                className="w-10 h-10 rounded-lg object-cover shadow-sm border border-gray-100"
              />
              <div>
                <h1 className="text-gray-900 font-bold">Malabon Pharmacy and Clinic</h1>
                <p className="text-xs text-gray-500">Pharmacy Management System</p>
              </div>
            </div>

            <div className="flex items-center gap-4 border-l pl-4 border-gray-200 text-xs">
              <div className="text-right">
                <p className="font-bold text-gray-900">{currentOperator.displayName}</p>
                <p className="text-[10px] text-gray-400 font-mono">role: {currentOperator.systemRole.toUpperCase()}</p>
              </div>
              <button 
                type="button"
                onClick={async () => {
                  if (window.confirm("Terminate open authenticated terminal session?")) {
                    await logSystemAction("SESSION_LOGOUT", "AUTHENTICATION Portal", `Terminated open station session.`)
                    setCurrentOperator(null)
                    setActiveTab("dashboard")
                  }
                }}
                className="p-2 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {navigationTabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-3 transition-all ${activeTab === tab.id ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50 font-bold" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "dashboard"     && <Dashboard inventory={inventory} sales={sales} />}
        {activeTab === "pos"           && <POSCheckout inventory={inventory} categoriesList={categoriesList} onCompleteSale={addSale} />}
        {activeTab === "inventory"     && <InventoryManager inventory={inventory} categoriesList={categoriesList} refreshCategories={fetchCategories} refreshInventory={fetchInventory} onUpdateInventory={updateInventoryItem} onDeleteProduct={deleteInventoryItem} onLogAction={logSystemAction} />}
        {activeTab === "stock_adjust"  && <StockAdjustment inventory={inventory} categoriesList={categoriesList} fetchInventory={fetchInventory} onLogAction={logSystemAction} />}
        {activeTab === "history"       && <SalesHistory sales={sales} onToggleRefund={handleToggleRefund} />}
        {activeTab === "admin_control" && currentOperator.systemRole === "admin" && (
          <AdminPanel currentOperator={currentOperator} onLogAction={logSystemAction} />
        )}
      </main>
    </div>
  )
}