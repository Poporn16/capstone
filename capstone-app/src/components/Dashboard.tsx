import type { InventoryItem, Sale } from "../App";

interface DashboardProps {
  inventory: InventoryItem[];
  sales: Sale[];
  categoriesList?: string[];
  onSelectProduct?: (productName: string, productId?: string) => void
  isAdminUser?: boolean
}

export function Dashboard({ inventory = [], sales = [], categoriesList = [], onSelectProduct, isAdminUser = false }: DashboardProps) {
  const safeInventory = Array.isArray(inventory) ? inventory : []
  const safeSales = Array.isArray(sales) ? sales : []

  const activeSales = safeSales.filter(s => s && !s.isRefunded);

  const todayRevenue = activeSales
    .filter(s => s.date && new Date(s.date).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

  const totalRevenue = activeSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
  const totalTransactions = activeSales.length;
  const totalUniqueItems = safeInventory.length;

  const totalInventoryValue = safeInventory.reduce((sum, item) => {
    const itemStock = Number(item.stock) || 0;
    const itemPrice = Number(item.price) || 0;
    return sum + (itemPrice * itemStock);
  }, 0);

  const costOfGoods = activeSales.reduce((totalCogs, sale) => {
    const saleItems = Array.isArray(sale.items) ? sale.items : []
    const saleCogs = saleItems.reduce((sum, si) => {
      if (!si || !si.item) return sum;
      const matchedInv = safeInventory.find(inv => String(inv.id) === String(si.item.id));
      const costPerUnit = Number(si.item.cost) || Number(matchedInv?.cost) || 0;
      return sum + (costPerUnit * (Number(si.quantity) || 0));
    }, 0);
    return totalCogs + saleCogs;
  }, 0);

  const profit = totalRevenue - costOfGoods;
  const totalUnitsInStock = safeInventory.reduce((sum, i) => sum + (Number(i.stock) || 0), 0);

  const lowStockAlerts = safeInventory
    .filter(item => item && (Number(item.stock) || 0) <= (Number(item.minStock) || 10))
    .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0));

  // Merge categoriesList prop and existing inventory categories to show all categories
  const safeCategoriesList = Array.isArray(categoriesList) ? categoriesList : []
  const allCategoryNames = Array.from(
    new Set([
      ...safeCategoriesList.map(c => String(c || "").trim()),
      ...safeInventory.map(item => (item.category || "unmarked category").trim())
    ])
  );

  const categoryData = allCategoryNames
    .map(catName => {
      const matchingItems = safeInventory.filter(
        item => (item.category || "unmarked category").trim().toLowerCase() === catName.toLowerCase()
      );
      return {
        name: catName,
        units: matchingItems.reduce((sum, item) => sum + (Number(item.stock) || 0), 0),
        value: matchingItems.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.stock) || 0)), 0)
      };
    })
    .filter(c => c.units > 0 && c.name.toLowerCase() !== "unmarked category")
    .sort((a, b) => b.value - a.value);

  // All nearly expired and expired products display
  const nearlyExpiredProducts = safeInventory
    .flatMap(item => 
      (Array.isArray(item.batches) ? item.batches : []).map(batch => ({
        name: item.name,
        category: item.category,
        expiryDate: batch.expiryDate,
        stock: batch.stock
      }))
    )
    .filter(b => b.expiryDate && b.stock > 0)
    .map(b => {
      const diffTime = new Date(b.expiryDate).getTime() - new Date().getTime();
      return { ...b, daysLeft: Math.ceil(diffTime / (1000 * 60 * 60 * 24)) };
    })
    .filter(b => b.daysLeft <= 180)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const productSalesMap: Record<string, { name: string, quantity: number, revenue: number }> = {};
  
  activeSales.forEach(sale => {
    const saleItems = Array.isArray(sale?.items) ? sale.items : [];
    saleItems.forEach(si => {
      if (!si || !si.item) return;
      const itemId = si.item.id || si.item.name || Math.random().toString();
      const qty = Number(si.quantity) || 0;

      const matchedInventory = safeInventory.find(inv => String(inv.id) === String(itemId));
      const activePrice = Number(si.item.price) || Number(matchedInventory?.price) || 0;
      const lineRevenue = qty * activePrice;

      if (!productSalesMap[itemId]) {
        productSalesMap[itemId] = {
          name: si.item.name || matchedInventory?.name || "Unknown Product",
          quantity: 0,
          revenue: 0
        };
      }

      productSalesMap[itemId].quantity += qty;
      productSalesMap[itemId].revenue += lineRevenue;
    });
  });

  const mostSoldItems = Object.values(productSalesMap).sort((a, b) => b.quantity - a.quantity);

  const getCategoryStyle = (cat: string) => {
    const normalized = (cat || "").toLowerCase();
    if (normalized.includes("prescription")) return "bg-red-50 text-red-700 border-red-200";
    if (normalized.includes("otc") || normalized.includes("counter")) return "bg-blue-50 text-blue-700 border-blue-200";
    if (normalized.includes("supply") || normalized.includes("supplies")) return "bg-green-50 text-green-700 border-green-200";
    if (normalized.includes("wellness") || normalized.includes("vitamin")) return "bg-purple-50 text-purple-700 border-purple-200";
    return "bg-gray-50 text-gray-700 border-gray-200";
  };

  return (
    <div className="space-y-6 text-sm font-sans">
      {/* Top 6 Summary Pill Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {/* Today's Revenue */}
        <div className="bg-white dark:bg-slate-800 rounded-full px-6 py-3.5 border border-gray-200/80 dark:border-slate-700 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-gray-900 dark:text-slate-200 font-bold text-xs tracking-tight">Today's Revenue</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-black text-black dark:text-white">₱ {todayRevenue.toFixed(2)}</span>
              <span className="text-gray-400 dark:text-gray-400 text-[10px] font-medium">
                {activeSales.filter(s => s?.date && !isNaN(new Date(s.date).getTime()) && new Date(s.date).toDateString() === new Date().toDateString()).length} sales
              </span>
            </div>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="bg-white dark:bg-slate-800 rounded-full px-6 py-3.5 border border-gray-200/80 dark:border-slate-700 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-gray-900 dark:text-slate-200 font-bold text-xs tracking-tight">Total Revenue</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-black text-black dark:text-white">₱ {totalRevenue.toFixed(2)}</span>
              <span className="text-gray-400 dark:text-gray-400 text-[10px] font-medium">{totalTransactions} total sales</span>
            </div>
          </div>
        </div>

        {/* Inventory Value */}
        <div className="bg-white dark:bg-slate-800 rounded-full px-6 py-3.5 border border-gray-200/80 dark:border-slate-700 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-gray-900 dark:text-slate-200 font-bold text-xs tracking-tight">Inventory Value</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-black text-black dark:text-white">₱ {totalInventoryValue.toFixed(2)}</span>
              <span className="text-gray-400 dark:text-gray-400 text-[10px] font-medium">{totalUnitsInStock} units</span>
            </div>
          </div>
        </div>

        {/* Cost of Goods */}
        <div className="bg-white dark:bg-slate-800 rounded-full px-6 py-3.5 border border-gray-200/80 dark:border-slate-700 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-gray-900 dark:text-slate-200 font-bold text-xs tracking-tight">Cost of Goods</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-black text-slate-800 dark:text-slate-200">₱ {costOfGoods.toFixed(2)}</span>
              <span className="text-gray-400 dark:text-gray-400 text-[10px] font-medium">COGS Sold</span>
            </div>
          </div>
        </div>

        {/* Profit */}
        <div className="bg-white dark:bg-slate-800 rounded-full px-6 py-3.5 border border-gray-200/80 dark:border-slate-700 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-gray-900 dark:text-slate-200 font-bold text-xs tracking-tight">Profit</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">₱ {profit.toFixed(2)}</span>
              <span className="text-gray-400 dark:text-gray-400 text-[10px] font-medium">Net Profit</span>
            </div>
          </div>
        </div>

        {/* No. of Items */}
        <div className="bg-white dark:bg-slate-800 rounded-full px-6 py-3.5 border border-gray-200/80 dark:border-slate-700 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-gray-900 dark:text-slate-200 font-bold text-xs tracking-tight">No. of Items</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-black text-blue-600 dark:text-blue-400">{totalUniqueItems}</span>
              <span className="text-gray-400 dark:text-gray-400 text-[10px] font-medium">unique products</span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row: Low Stock Alerts & Nearly Expired Medicines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-white dark:bg-slate-800 rounded-[28px] p-6 shadow-2xs border border-gray-100/60 dark:border-slate-700 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center">
              <svg className="w-7 h-7 text-black dark:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h2 className="text-lg font-bold text-black dark:text-white tracking-tight">Low Stock Alerts</h2>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {lowStockAlerts.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-400 text-center py-6">All active stock listings restocked safely.</p>
            ) : (
              lowStockAlerts.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => isAdminUser && onSelectProduct?.(item.name, item.id)}
                  className={`bg-white dark:bg-slate-900 rounded-full border-2 border-[#f97316]/70 px-6 py-2.5 flex items-center justify-between shadow-2xs transition-all ${
                    isAdminUser ? 'cursor-pointer hover:border-orange-500 hover:scale-[1.01] active:scale-98' : ''
                  }`}
                  title={isAdminUser ? "Click to view & adjust stock for this product" : undefined}
                >
                  <span className="font-bold text-gray-900 dark:text-white text-sm">{item.name}</span>
                  <div className="flex items-center gap-6 text-xs">
                    <span className="text-[#ea580c] dark:text-orange-400 font-bold text-sm">{item.stock} left</span>
                    <span className="text-gray-400 dark:text-gray-400 font-medium">Min: {item.minStock}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Nearly Expired Medicines */}
        <div className="bg-white dark:bg-slate-800 rounded-[28px] p-6 shadow-2xs border border-gray-100/60 dark:border-slate-700 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center">
              <svg className="w-7 h-7 text-black dark:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-black dark:text-white tracking-tight">Nearly Expired Medicines</h2>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {nearlyExpiredProducts.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-400 text-center py-6">No incoming batches expiring within 6 months.</p>
            ) : (
              nearlyExpiredProducts.map((b, index) => {
                const isRed = b.daysLeft <= 0
                const isOrange = b.daysLeft > 0 && b.daysLeft <= 90

                const borderClass = isRed
                  ? 'border-red-500 bg-red-50/40 dark:bg-red-950/20'
                  : isOrange
                  ? 'border-orange-500 bg-orange-50/40 dark:bg-orange-950/20'
                  : 'border-yellow-400 bg-yellow-50/40 dark:bg-yellow-950/20'

                const textClass = isRed
                  ? 'text-red-600 dark:text-red-400'
                  : isOrange
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-yellow-700 dark:text-yellow-400'

                return (
                  <div 
                    key={index} 
                    onClick={() => isAdminUser && onSelectProduct?.(b.name)}
                    className={`bg-white dark:bg-slate-900 rounded-full border-2 px-6 py-2.5 flex items-center justify-between shadow-2xs transition-all ${borderClass} ${
                      isAdminUser ? 'cursor-pointer hover:scale-[1.01] active:scale-98' : ''
                    }`}
                    title={isAdminUser ? "Click to view & adjust stock for this product" : undefined}
                  >
                    <span className="font-bold text-gray-900 dark:text-white text-sm">{b.name}</span>
                    <div className="flex items-center gap-6 text-xs">
                      <span className={`font-bold text-sm ${textClass}`}>
                        {isRed ? "EXPIRED" : `${b.daysLeft} days left`}
                      </span>
                      <span className="text-gray-400 dark:text-gray-400 font-mono font-medium">{b.expiryDate}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Inventory by Category & Most Sold Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory by Category */}
        <div className="bg-white dark:bg-slate-800 rounded-[28px] p-6 shadow-2xs border border-gray-100/60 dark:border-slate-700 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center">
              <svg className="w-7 h-7 text-black dark:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M3 15h18" />
                <path d="M9 9v6" />
                <path d="M15 9v6" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-black dark:text-white tracking-tight">Inventory by Category</h2>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {categoryData.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-400 text-center py-6">No product categories detected in database.</p>
            ) : (
              categoryData.map(cat => (
                <div key={cat.name} className="bg-white dark:bg-slate-900 rounded-full border border-gray-300/80 dark:border-slate-700 px-6 py-2.5 flex items-center justify-between shadow-2xs">
                  <span className={`px-3 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-wider ${getCategoryStyle(cat.name)}`}>
                    {cat.name}
                  </span>
                  <div className="flex items-center gap-8 font-mono text-xs text-right">
                    <span className="text-gray-800 dark:text-slate-200 font-bold">{cat.units} units</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">₱{cat.value.toFixed(2)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Most Sold Items */}
        <div className="bg-white dark:bg-slate-800 rounded-[28px] p-6 shadow-2xs border border-gray-100/60 dark:border-slate-700 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center">
              <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none">
                <path d="M16 2L19.5 6.5L25 5L24.5 10.5L29.5 13L27 18.5L30.5 22.5L25.5 24.5L25 30.5L19.5 28.5L16 32L12.5 28.5L7 30.5L6.5 24.5L1.5 22.5L5 18.5L2.5 13L7.5 10.5L7 5L12.5 6.5L16 2Z" fill="#f97316"/>
                <text x="16" y="21" textAnchor="middle" fill="white" fontSize="16" fontWeight="900" fontFamily="sans-serif">!</text>
              </svg>
            </div>
            <h2 className="text-lg font-bold text-black dark:text-white tracking-tight">Most Sold Items</h2>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {mostSoldItems.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-400 text-center py-6">No product transactions processed yet.</p>
            ) : (
              mostSoldItems.map((item, idx) => (
                <div key={idx} className="bg-white dark:bg-slate-900 rounded-full border border-gray-300/80 dark:border-slate-700 px-6 py-2.5 flex items-center justify-between shadow-2xs">
                  <span className="font-bold text-gray-900 dark:text-white text-sm truncate max-w-[220px]">{item.name}</span>
                  <div className="flex items-center gap-8 text-xs">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">{item.quantity} Sold</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold font-mono text-sm">₱ {item.revenue.toFixed(2)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}