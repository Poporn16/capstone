import type { InventoryItem, Sale } from "../App";
import { Package, AlertTriangle, TrendingUp, Award } from "lucide-react";

interface DashboardProps {
  inventory: InventoryItem[];
  sales: Sale[];
}

export function Dashboard({ inventory, sales }: DashboardProps) {
  const activeSales = sales.filter(s => !s.isRefunded);

  const todayRevenue = activeSales
    .filter(s => new Date(s.date).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + s.total, 0);

  const totalRevenue = activeSales.reduce((sum, s) => sum + s.total, 0);
  const totalTransactions = activeSales.length;
  const totalUniqueItems = inventory.length;

  const totalInventoryValue = inventory.reduce((sum, item) => {
    const itemStock = item.stock || 0;
    const itemPrice = item.price || 0;
    return sum + (itemPrice * itemStock);
  }, 0);

  const lowStockAlerts = inventory.filter(item => (item.stock || 0) <= (item.minStock || 10));

  // Gather all unique categories dynamically from inventory items
  const uniqueCategories = Array.from(new Set(inventory.map(item => (item.category || "unmarked category").toLowerCase())));
  
  const categoryData = uniqueCategories.map(catName => {
    const matchingItems = inventory.filter(item => (item.category || "unmarked category").toLowerCase() === catName);
    return {
      name: catName,
      units: matchingItems.reduce((sum, item) => sum + (item.stock || 0), 0),
      value: matchingItems.reduce((sum, item) => sum + ((item.price || 0) * (item.stock || 0)), 0)
    };
  }).sort((a, b) => b.value - a.value);

  const nearlyExpiredProducts = inventory
    .flatMap(item => 
      (item.batches || []).map(batch => ({
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
    .filter(b => b.daysLeft > 0 && b.daysLeft <= 90)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);

  const productSalesMap: Record<string, { name: string, quantity: number, revenue: number }> = {};
  
  activeSales.forEach(sale => {
    sale.items.forEach(si => {
      const itemId = si.item.id;
      const qty = Number(si.quantity) || 0;

      const matchedInventory = inventory.find(inv => String(inv.id) === String(itemId));
      const activePrice = Number(si.item.price) || Number(matchedInventory?.price) || 0;
      const lineRevenue = qty * activePrice;

      if (!productSalesMap[itemId]) {
        productSalesMap[itemId] = { name: si.item.name, quantity: 0, revenue: 0 };
      }
      productSalesMap[itemId].quantity += qty;
      productSalesMap[itemId].revenue += lineRevenue;
    });
  });

  const mostSoldItems = Object.values(productSalesMap).sort((a, b) => b.quantity - a.quantity);

  const getCategoryStyle = (cat: string) => {
    const normalized = cat.toLowerCase();
    if (normalized.includes("prescription")) return "bg-red-50 text-red-700 border-red-200";
    if (normalized.includes("otc") || normalized.includes("counter")) return "bg-blue-50 text-blue-700 border-blue-200";
    if (normalized.includes("supply") || normalized.includes("supplies")) return "bg-green-50 text-green-700 border-green-200";
    if (normalized.includes("wellness") || normalized.includes("vitamin")) return "bg-purple-50 text-purple-700 border-purple-200";
    return "bg-gray-50 text-gray-700 border-gray-200";
  };

  return (
    <div className="space-y-6 text-xs font-medium">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-xs">
          <div>
            <p className="text-gray-500 font-bold tracking-wide uppercase text-[10px]">Today's Revenue</p>
            <h3 className="text-gray-900 font-bold text-lg mt-1">₱{todayRevenue.toFixed(2)}</h3>
            <p className="text-gray-400 text-[10px] mt-0.5">
              {activeSales.filter(s => new Date(s.date).toDateString() === new Date().toDateString()).length} transactions
            </p>
          </div>
          <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center font-bold text-green-600 text-lg">
            ₱
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-xs">
          <div>
            <p className="text-gray-500 font-bold tracking-wide uppercase text-[10px]">Total Revenue</p>
            <h3 className="text-gray-900 font-bold text-lg mt-1">₱{totalRevenue.toFixed(2)}</h3>
            <p className="text-gray-400 text-[10px] mt-0.5">{totalTransactions} total sales</p>
          </div>
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600"><TrendingUp className="w-5 h-5"/></div>
        </div>

        <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-xs">
          <div>
            <p className="text-gray-500 font-bold tracking-wide uppercase text-[10px]">Inventory Value</p>
            <h3 className="text-gray-900 font-bold text-lg mt-1">₱{totalInventoryValue.toFixed(2)}</h3>
            <p className="text-gray-400 text-[10px] mt-0.5">{totalUniqueItems} unique items</p>
          </div>
          <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600"><Package className="w-5 h-5"/></div>
        </div>

        <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-xs">
          <div>
            <p className="text-gray-500 font-bold tracking-wide uppercase text-[10px]">Low Stock Alerts</p>
            <h3 className="text-gray-900 font-bold text-lg mt-1">{lowStockAlerts.length}</h3>
            <p className="text-gray-400 text-[10px] mt-0.5">Items need restock</p>
          </div>
          <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600"><AlertTriangle className="w-5 h-5"/></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-xl border space-y-3 shadow-xs">
          <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-orange-500"/> Low Stock Alerts</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {lowStockAlerts.length === 0 ? (
              <p className="text-gray-400 text-center py-8">All active stock listings restocked safely.</p>
            ) : (
              lowStockAlerts.map(item => (
                <div key={item.id} className="p-3 bg-orange-50/40 rounded-lg border border-orange-100 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-900">{item.name}</p>
                    <p className="text-gray-500 uppercase tracking-wider text-[9px] mt-0.5">{item.category}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-orange-700 font-bold font-mono">{item.stock} left</span>
                    <p className="text-gray-400 text-[9px] mt-0.5">Min: {item.minStock}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border space-y-3 shadow-xs">
          <h4 className="font-bold text-gray-800 text-sm">Nearly Expired Products</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {nearlyExpiredProducts.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No incoming batches expiring within 90 days.</p>
            ) : (
              nearlyExpiredProducts.map((b, index) => (
                <div key={index} className="p-3 bg-red-50/30 rounded-lg border border-red-100 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-900">{b.name}</p>
                    <p className="text-gray-500 uppercase tracking-wider text-[9px] mt-0.5">{b.category}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-red-600 font-bold">{b.daysLeft} days</span>
                    <p className="text-gray-400 font-mono text-[9px] mt-0.5">{b.expiryDate}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-xl border shadow-xs space-y-4">
          <h4 className="font-bold text-gray-800 text-sm tracking-wide flex items-center gap-1.5">
            <Package className="w-4 h-4 text-blue-600" />
            Inventory by Category
          </h4>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {categoryData.length === 0 ? (
              <p className="text-gray-400 text-center py-6">No product categories detected in database.</p>
            ) : (
              categoryData.map(cat => (
                <div key={cat.name} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/30">
                  <span className={`px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getCategoryStyle(cat.name)}`}>
                    {cat.name}
                  </span>
                  <div className="flex items-center gap-6 font-mono text-right">
                    <span className="text-gray-900 font-bold text-xs">{cat.units} units</span>
                    <span className="text-blue-600 font-bold text-xs w-20">₱{cat.value.toFixed(2)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border shadow-xs space-y-4">
          <h4 className="font-bold text-gray-800 text-sm tracking-wide flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-500" />
            Most Sold Items
          </h4>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {mostSoldItems.length === 0 ? (
              <p className="text-gray-400 text-center py-6">No product transactions processed yet.</p>
            ) : (
              mostSoldItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/30">
                  <span className="text-gray-900 font-bold text-xs truncate pr-4 max-w-[200px]">{item.name}</span>
                  <div className="flex items-center gap-6 font-mono text-right">
                    <span className="text-gray-600 font-medium">{item.quantity} sold</span>
                    <span className="text-green-600 font-bold text-xs w-20">₱{item.revenue.toFixed(2)}</span>
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